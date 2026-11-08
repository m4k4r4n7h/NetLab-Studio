import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../state/store';
import { Dialog } from '../common/Dialog';
import { CABLE_DEFINITIONS } from '../../devices/factory';
import {
  cableSupportsMedia,
  DEVICE_CLASS,
  interfaceHasLink,
  isWirelessAccessDevice,
  validateConnection
} from '../../devices/connectionRules';
import type { CableType, Device, DeviceInterface, NetworkLink } from '../../types';

function interfaceOptions(
  device: Device | undefined,
  cable: CableType,
  links: NetworkLink[]
): DeviceInterface[] {
  if (!device) return [];
  const media = cable === 'wireless' ? 'wireless' : 'ethernet';
  const reusable = cable === 'wireless' && isWirelessAccessDevice(device);
  return device.interfaces.filter((entry) => (
    entry.enabled &&
    entry.media === media &&
    cableSupportsMedia(cable, entry.media) &&
    (reusable || !interfaceHasLink(links, entry.id))
  ));
}

export function ConnectDialog() {
  const project = useAppStore((state) => state.project);
  const draft = useAppStore((state) => state.connectDraft);
  const createConnection = useAppStore((state) => state.createConnection);
  const closeDialog = useAppStore((state) => state.closeDialog);
  const devices = project.devices;
  const fallbackA = devices[0]?.id ?? '';
  const fallbackB = devices.find((device) => device.id !== fallbackA)?.id ?? '';

  const [deviceAId, setDeviceAId] = useState(draft?.deviceAId ?? fallbackA);
  const [deviceBId, setDeviceBId] = useState(draft?.deviceBId ?? fallbackB);
  const [cable, setCable] = useState<CableType>(draft?.cable ?? 'copper-straight-through');
  const [interfaceAId, setInterfaceAId] = useState('');
  const [interfaceBId, setInterfaceBId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const deviceA = devices.find((device) => device.id === deviceAId);
  const deviceB = devices.find((device) => device.id === deviceBId);

  const optionsA = useMemo(() => interfaceOptions(deviceA, cable, project.links), [deviceA, cable, project.links]);
  const optionsB = useMemo(() => interfaceOptions(deviceB, cable, project.links), [deviceB, cable, project.links]);

  useEffect(() => {
    setInterfaceAId((current) => (optionsA.some((entry) => entry.id === current) ? current : optionsA[0]?.id ?? ''));
  }, [optionsA]);

  useEffect(() => {
    setInterfaceBId((current) => (optionsB.some((entry) => entry.id === current) ? current : optionsB[0]?.id ?? ''));
  }, [optionsB]);

  const preview = useMemo(() => {
    if (!deviceA || !deviceB || !interfaceAId || !interfaceBId) return null;
    return validateConnection(devices, project.links, deviceAId, interfaceAId, deviceBId, interfaceBId, cable);
  }, [deviceA, deviceB, deviceAId, interfaceAId, deviceBId, interfaceBId, cable, devices, project.links]);

  const submit = () => {
    if (!deviceA || !deviceB) {
      setError('Select two devices.');
      return;
    }
    if (!interfaceAId || !interfaceBId) {
      setError('Each device needs an available interface for this cable type.');
      return;
    }
    const result = createConnection(deviceAId, interfaceAId, deviceBId, interfaceBId, cable);
    if (!result.ok) setError(result.error ?? 'The connection could not be created.');
  };

  const sameClass = deviceA && deviceB && DEVICE_CLASS[deviceA.kind] === DEVICE_CLASS[deviceB.kind];

  return (
    <Dialog
      title="Connect Devices"
      subtitle="Choose the cable and the interfaces on each side. Only free, enabled interfaces of the right media are listed."
      onClose={closeDialog}
      width={720}
      footer={(
        <>
          <span className={`preview-note ${preview && !preview.valid ? 'text-danger' : ''}`}>
            {preview?.error ?? preview?.warning ?? (preview ? 'Connection is valid.' : 'Select interfaces to validate the link.')}
          </span>
          <span className="footer-spacer" />
          <button type="button" className="secondary-button" onClick={closeDialog}>Cancel</button>
          <button type="button" className="primary-button" onClick={submit} disabled={Boolean(preview && !preview.valid)}>
            Create Connection
          </button>
        </>
      )}
    >
      <div className="connect-grid">
        <label className="field">
          <span>Device A</span>
          <select
            value={deviceAId}
            onChange={(event) => {
              setDeviceAId(event.target.value);
              setError(null);
            }}
          >
            {devices.map((device) => (
              <option key={device.id} value={device.id}>{device.name} · {device.kind}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Interface A</span>
          <select value={interfaceAId} onChange={(event) => setInterfaceAId(event.target.value)}>
            {optionsA.length === 0 ? <option value="">No compatible interface</option> : null}
            {optionsA.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.name} · {entry.media}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Device B</span>
          <select
            value={deviceBId}
            onChange={(event) => {
              setDeviceBId(event.target.value);
              setError(null);
            }}
          >
            {devices.map((device) => (
              <option key={device.id} value={device.id}>{device.name} · {device.kind}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Interface B</span>
          <select value={interfaceBId} onChange={(event) => setInterfaceBId(event.target.value)}>
            {optionsB.length === 0 ? <option value="">No compatible interface</option> : null}
            {optionsB.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.name} · {entry.media}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        <span>Cable type</span>
        <div className="cable-choice-grid">
          {(Object.entries(CABLE_DEFINITIONS) as Array<[CableType, (typeof CABLE_DEFINITIONS)[CableType]]>).map(([type, definition]) => (
            <button
              key={type}
              type="button"
              className={`cable-choice ${cable === type ? 'is-active' : ''}`}
              onClick={() => {
                setCable(type);
                setError(null);
              }}
            >
              <strong>{definition.label}</strong>
              <span>{definition.description}</span>
            </button>
          ))}
        </div>
      </label>

      {sameClass && cable === 'copper-straight-through' ? (
        <p className="note-box">
          Both devices are the same class. A straight-through cable is traditionally paired with a crossover cable in this
          situation, but modern auto-MDIX interfaces accept either pinout.
        </p>
      ) : null}
      {cable === 'wireless' ? (
        <p className="note-box">
          Wireless associations require an access point or wireless router on one side. The access-point radio can carry
          multiple client associations; each client radio joins one access point.
        </p>
      ) : null}
      {error ? <div className="form-error">{error}</div> : null}
      {devices.length < 2 ? <div className="form-error">Add at least two devices before creating a connection.</div> : null}
    </Dialog>
  );
}
