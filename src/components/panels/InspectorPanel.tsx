import { useEffect, useState } from 'react';
import { useAppStore } from '../../state/store';
import type { Device, DeviceInterface } from '../../types';
import { DEVICE_DEFINITIONS } from '../../devices/factory';
import { linkForInterface, linkIsUp } from '../../devices/connectionRules';
import { buildRoutingTable } from '../../engine/routing/routingTable';
import { getSimulator } from '../../state/runtime';
import { formatCidr, hostAddressError, isValidIpv4, parseMaskInput } from '../../utils/ipv4';
import { Icon } from '../common/Icon';
import { CommitInput } from '../common/CommitInput';

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="inspector-section">
      <header className="inspector-section-header">
        <h3>{title}</h3>
        {action}
      </header>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function InterfaceAddressEditor({ deviceId, entry }: { deviceId: string; entry: DeviceInterface }) {
  const updateInterface = useAppStore((state) => state.updateInterface);
  const [ip, setIp] = useState(entry.ip);
  const [mask, setMask] = useState(entry.mask);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIp(entry.ip);
    setMask(entry.mask);
    setError(null);
  }, [entry.ip, entry.mask, entry.id]);

  const apply = () => {
    const trimmedIp = ip.trim();
    const trimmedMask = mask.trim();
    if (!trimmedIp && !trimmedMask) {
      updateInterface(deviceId, entry.id, { ip: '', mask: '' });
      setError(null);
      return;
    }
    if (!isValidIpv4(trimmedIp)) {
      setError('Invalid IPv4 address');
      return;
    }
    const parsedMask = parseMaskInput(trimmedMask);
    if (!parsedMask) {
      setError('Invalid subnet mask');
      return;
    }
    const addressIssue = hostAddressError(trimmedIp, parsedMask);
    if (addressIssue) {
      setError(addressIssue);
      return;
    }
    setError(null);
    updateInterface(deviceId, entry.id, { ip: trimmedIp, mask: parsedMask });
  };

  return (
    <div className="address-editor">
      <div className="address-fields">
        <input
          value={ip}
          onChange={(event) => setIp(event.target.value)}
          placeholder="192.168.1.10"
          aria-label={`${entry.name} IPv4 address`}
          spellCheck={false}
        />
        <span className="slash">/</span>
        <input
          value={mask}
          onChange={(event) => setMask(event.target.value)}
          placeholder="255.255.255.0"
          aria-label={`${entry.name} subnet mask`}
          spellCheck={false}
        />
        <button type="button" className="mini-button" onClick={apply}>Apply</button>
      </div>
      {error ? <span className="field-error">{error}</span> : null}
      {entry.ip && entry.mask ? <span className="address-preview">{formatCidr(entry.ip, entry.mask)}</span> : null}
    </div>
  );
}

function StaticRouteForm({ deviceId }: { deviceId: string }) {
  const addStaticRoute = useAppStore((state) => state.addStaticRoute);
  const [network, setNetwork] = useState('');
  const [mask, setMask] = useState('255.255.255.0');
  const [nextHop, setNextHop] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    if (!isValidIpv4(network) || !isValidIpv4(nextHop)) {
      setError('Enter a valid network and next hop');
      return;
    }
    const parsedMask = parseMaskInput(mask);
    if (!parsedMask) {
      setError('Enter a valid mask');
      return;
    }
    addStaticRoute(deviceId, { network: network.trim(), mask: parsedMask, nextHop: nextHop.trim() });
    setNetwork('');
    setNextHop('');
    setError(null);
  };

  return (
    <div className="inline-form">
      <div className="inline-form-row">
        <input value={network} onChange={(event) => setNetwork(event.target.value)} placeholder="Network" aria-label="Route network" />
        <input value={mask} onChange={(event) => setMask(event.target.value)} placeholder="Mask" aria-label="Route mask" />
      </div>
      <div className="inline-form-row">
        <input value={nextHop} onChange={(event) => setNextHop(event.target.value)} placeholder="Next hop" aria-label="Route next hop" />
        <button type="button" className="mini-button" onClick={add}>Add route</button>
      </div>
      {error ? <span className="field-error">{error}</span> : null}
    </div>
  );
}

function DnsRecordForm({ deviceId }: { deviceId: string }) {
  const addDnsRecord = useAppStore((state) => state.addDnsRecord);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    if (!name.trim() || !isValidIpv4(address)) {
      setError('Enter a name and a valid IPv4 address');
      return;
    }
    addDnsRecord(deviceId, { name: name.trim(), address: address.trim() });
    setName('');
    setAddress('');
    setError(null);
  };

  return (
    <div className="inline-form">
      <div className="inline-form-row">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="www.example.test" aria-label="DNS name" />
        <input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="192.168.1.10" aria-label="DNS address" />
      </div>
      <button type="button" className="mini-button" onClick={add}>Add A record</button>
      {error ? <span className="field-error">{error}</span> : null}
    </div>
  );
}

function HttpContentEditor({ device }: { device: Device }) {
  const updateDevice = useAppStore((state) => state.updateDevice);
  const [content, setContent] = useState(device.httpContent);
  useEffect(() => setContent(device.httpContent), [device.httpContent]);
  return (
    <div className="field-stack">
      <span>Page content (HTML, sanitized when rendered)</span>
      <textarea
        className="code-textarea"
        rows={6}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        onBlur={() => updateDevice(device.id, { httpContent: content })}
        spellCheck={false}
      />
      <span className="muted small">{content.length} characters</span>
    </div>
  );
}

function InterfaceList({ device }: { device: Device }) {
  const project = useAppStore((state) => state.project);
  const updateInterface = useAppStore((state) => state.updateInterface);
  const addressable = !['switch', 'hub', 'access-point', 'patch-panel'].includes(device.kind);
  return (
    <div className="interface-list">
      {device.interfaces.map((entry) => {
        const link = linkForInterface(project.links, entry.id);
        const up = link ? linkIsUp(link, project.devices) : false;
        const peer = link
          ? project.devices.find((device2) => (
              (link.a.deviceId === device.id && device2.id === link.b.deviceId) ||
              (link.b.deviceId === device.id && device2.id === link.a.deviceId)
            ))
          : null;
        return (
          <div key={entry.id} className="interface-card">
            <div className="interface-card-head">
              <span className={`status-dot ${!entry.enabled ? 'down' : up ? 'up' : 'idle'}`} />
              <span className="interface-name">{entry.name}</span>
              <span className={`media-badge media-${entry.media}`}>{entry.media === 'wireless' ? 'WLAN' : 'ETH'}</span>
              <label className="switch-toggle" title={entry.enabled ? 'Shut down interface' : 'Enable interface'}>
                <input
                  type="checkbox"
                  checked={entry.enabled}
                  onChange={(event) => updateInterface(device.id, entry.id, { enabled: event.target.checked })}
                  aria-label={`${entry.name} enabled`}
                />
                <span />
              </label>
            </div>
            <div className="interface-meta">
              <span>{entry.mac}</span>
              <span className={up ? 'text-up' : 'text-muted'}>
                {!entry.enabled ? 'administratively down' : link ? (up ? `up · ${peer?.name ?? 'peer'}` : 'down') : 'not connected'}
              </span>
            </div>
            {addressable ? <InterfaceAddressEditor deviceId={device.id} entry={entry} /> : null}
          </div>
        );
      })}
    </div>
  );
}

function RoutingSection({ device }: { device: Device }) {
  const removeStaticRoute = useAppStore((state) => state.removeStaticRoute);
  const table = buildRoutingTable(device);
  return (
    <Section title="Routing table">
      {table.length === 0 ? (
        <p className="muted small">No routes. Configure an interface address to install a connected route.</p>
      ) : (
        <div className="data-table">
          {table.map((row) => (
            <div key={row.id} className="data-row">
              <span className={`route-badge route-${row.type}`}>{row.type === 'connected' ? 'C' : row.type === 'default' ? 'S*' : 'S'}</span>
              <span className="mono">{row.network}/{row.prefix}</span>
              <span className="data-muted">
                {row.type === 'connected' ? row.interfaceName : `via ${row.nextHop}`}
              </span>
              {row.type !== 'connected' ? (
                <button type="button" className="icon-button tiny" onClick={() => removeStaticRoute(device.id, row.id)} title="Remove route">
                  <Icon name="trash" size={13} />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
      <StaticRouteForm deviceId={device.id} />
    </Section>
  );
}

function SwitchTableSection({ device }: { device: Device }) {
  const runtimeVersion = useAppStore((state) => state.runtimeVersion);
  let rows: ReturnType<ReturnType<typeof getSimulator>['getMacTable']> = [];
  try {
    rows = getSimulator().getMacTable(device.id);
  } catch {
    rows = [];
  }
  return (
    <Section title={`MAC address table${runtimeVersion >= 0 ? '' : ''}`}>
      {rows.length === 0 ? (
        <p className="muted small">No dynamic entries yet. Generate traffic to see MAC learning.</p>
      ) : (
        <div className="data-table">
          {rows.map((row) => (
            <div key={row.mac} className="data-row">
              <span className="mono small">{row.mac}</span>
              <span className="data-muted">{row.interfaceName}</span>
              <span className="badge">dynamic</span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function ArpSection({ device }: { device: Device }) {
  useAppStore((state) => state.runtimeVersion);
  let rows: ReturnType<ReturnType<typeof getSimulator>['getArpCache']> = [];
  try {
    rows = getSimulator().getArpCache(device.id);
  } catch {
    rows = [];
  }
  return (
    <Section title="ARP cache">
      {rows.length === 0 ? (
        <p className="muted small">Empty. ARP entries appear after the device sends traffic.</p>
      ) : (
        <div className="data-table">
          {rows.map((row) => (
            <div key={row.address} className="data-row">
              <span className="mono small">{row.address}</span>
              <span className="mono small data-muted">{row.mac}</span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function ServicesSection({ device }: { device: Device }) {
  const updateDevice = useAppStore((state) => state.updateDevice);
  const removeDnsRecord = useAppStore((state) => state.removeDnsRecord);
  return (
    <>
      <Section title="DNS service">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={device.dnsEnabled}
            onChange={(event) => updateDevice(device.id, { dnsEnabled: event.target.checked })}
          />
          <span>Enable DNS server (A records, UDP port 53)</span>
        </label>
        {device.dnsEnabled ? (
          <>
            {device.dnsRecords.length === 0 ? <p className="muted small">No records. Add one below.</p> : (
              <div className="data-table">
                {device.dnsRecords.map((record) => (
                  <div key={record.id} className="data-row">
                    <span className="truncate">{record.name}</span>
                    <span className="mono small">{record.address}</span>
                    <button type="button" className="icon-button tiny" onClick={() => removeDnsRecord(device.id, record.id)} title="Remove record">
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <DnsRecordForm deviceId={device.id} />
          </>
        ) : null}
      </Section>

      <Section title="HTTP service">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={device.httpEnabled}
            onChange={(event) => updateDevice(device.id, { httpEnabled: event.target.checked })}
          />
          <span>Enable HTTP server (TCP port 80)</span>
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={device.httpsEnabled}
            onChange={(event) => updateDevice(device.id, { httpsEnabled: event.target.checked })}
          />
          <span>Show HTTPS/TLS educational notes</span>
        </label>
        {device.httpsEnabled ? (
          <p className="note-box">
            HTTPS is represented as an educational comparison only. NetLab Studio does not perform real TLS
            cryptography, certificate validation, or key exchange. HTTP/3 is not implemented; it uses QUIC over UDP.
          </p>
        ) : null}
        <HttpContentEditor device={device} />
      </Section>
    </>
  );
}

export function InspectorPanel() {
  const project = useAppStore((state) => state.project);
  const selection = useAppStore((state) => state.selection);
  const updateDevice = useAppStore((state) => state.updateDevice);
  const deleteSelection = useAppStore((state) => state.deleteSelection);
  const duplicateSelection = useAppStore((state) => state.duplicateSelection);
  const openTerminal = useAppStore((state) => state.openTerminal);
  const openBrowser = useAppStore((state) => state.openBrowser);
  const openDialog = useAppStore((state) => state.openDialog);

  if (selection.length === 0) {
    const counts = project.devices.reduce<Record<string, number>>((accumulator, device) => {
      accumulator[device.kind] = (accumulator[device.kind] ?? 0) + 1;
      return accumulator;
    }, {});
    return (
      <div className="inspector">
        <div className="inspector-title">
          <Icon name="inspect" />
          <h2>Inspector</h2>
        </div>
        <Section title="Project overview">
          <div className="overview-name">{project.name}</div>
          <div className="overview-stats">
            <div><strong>{project.devices.length}</strong><span>Devices</span></div>
            <div><strong>{project.links.length}</strong><span>Links</span></div>
            <div><strong>{Object.keys(counts).length}</strong><span>Types</span></div>
          </div>
          {project.devices.length > 0 ? (
            <div className="overview-list">
              {Object.entries(counts).map(([kind, count]) => (
                <span key={kind} className="badge">
                  {DEVICE_DEFINITIONS[kind as Device['kind']]?.label ?? kind} × {count}
                </span>
              ))}
            </div>
          ) : (
            <p className="muted small">Select a device to inspect its interfaces, addressing, services, and runtime state.</p>
          )}
        </Section>
        <Section title="Quick actions">
          <div className="button-grid">
            <button type="button" className="secondary-button" onClick={() => openDialog('packet-generator')}>
              <Icon name="play" size={14} /> Generate packet
            </button>
            <button type="button" className="secondary-button" onClick={() => openDialog('labs')}>
              <Icon name="labs" size={14} /> Labs and templates
            </button>
            <button type="button" className="secondary-button" onClick={() => openDialog('notes')}>
              <Icon name="notes" size={14} /> Project notes
            </button>
            <button type="button" className="secondary-button" onClick={() => openDialog('help')}>
              <Icon name="inspect" size={14} /> User guide
            </button>
          </div>
        </Section>
        <Section title="Tips">
          <ul className="tip-list">
            <li>Drag devices from the palette, then choose a cable and click two devices.</li>
            <li>Right-click the workspace or a device for contextual actions.</li>
            <li>Use the terminal in the inspector to run ping, tracert, and configuration commands.</li>
            <li>Switch to Simulation mode to step through packet forwarding event by event.</li>
          </ul>
        </Section>
      </div>
    );
  }

  if (selection.length > 1) {
    const selectedDevices = project.devices.filter((device) => selection.includes(device.id));
    return (
      <div className="inspector">
        <div className="inspector-title">
          <Icon name="layers" />
          <h2>Multiple selection</h2>
        </div>
        <Section title={`${selection.length} devices selected`}>
          <div className="overview-list">
            {selectedDevices.map((device) => (
              <span key={device.id} className="badge">{device.name}</span>
            ))}
          </div>
        </Section>
        <div className="button-row">
          <button type="button" className="secondary-button" onClick={duplicateSelection}>Duplicate</button>
          <button type="button" className="danger-button" onClick={deleteSelection}>Delete selected</button>
        </div>
      </div>
    );
  }

  const device = project.devices.find((entry) => entry.id === selection[0]);
  if (!device) {
    return (
      <div className="inspector">
        <div className="inspector-title"><Icon name="inspect" /><h2>Inspector</h2></div>
        <p className="muted">The selected device is no longer part of the project.</p>
      </div>
    );
  }

  const definition = DEVICE_DEFINITIONS[device.kind];
  const endDevice = ['pc', 'laptop', 'server', 'printer'].includes(device.kind);
  const router = device.kind === 'router' || device.kind === 'wireless-router';
  const terminalCapable = !['hub', 'patch-panel', 'access-point'].includes(device.kind);
  const browserCapable = ['pc', 'laptop'].includes(device.kind);

  return (
    <div className="inspector">
      <div className="inspector-title">
        <Icon name="inspect" />
        <h2>Inspector</h2>
        <span className="badge">{definition.label}</span>
      </div>

      <Section title="Identity">
        <Field label="Display name">
          <CommitInput
            value={device.name}
            onCommit={(value) => {
              if (!value.trim()) return;
              updateDevice(device.id, { name: value.trim() });
            }}
            validate={(value) => (value.trim() ? null : 'Name is required')}
          />
        </Field>
        <div className="key-value">
          <span>Type</span><strong>{definition.label}</strong>
          <span>Position</span><strong>{Math.round(device.x)}, {Math.round(device.y)}</strong>
          <span>Interfaces</span><strong>{device.interfaces.length}</strong>
        </div>
        <Field label="Device notes">
          <textarea
            rows={2}
            value={device.notes}
            onChange={(event) => updateDevice(device.id, { notes: event.target.value })}
            placeholder="Optional notes for this device"
          />
        </Field>
        <div className="button-row">
          {terminalCapable ? (
            <button type="button" className="secondary-button" onClick={() => openTerminal(device.id)}>
              <Icon name="terminal" size={14} /> Terminal
            </button>
          ) : null}
          {browserCapable ? (
            <button type="button" className="secondary-button" onClick={() => openBrowser(device.id)}>
              <Icon name="network" size={14} /> Browser
            </button>
          ) : null}
        </div>
      </Section>

      <Section title="Interfaces">
        <InterfaceList device={device} />
      </Section>

      {endDevice ? (
        <Section title="Addressing">
          <Field label="Default gateway">
            <CommitInput
              value={device.gateway}
              placeholder="Unset"
              onCommit={(value) => updateDevice(device.id, { gateway: value.trim() })}
              validate={(value) => (value.trim() === '' || isValidIpv4(value.trim()) ? null : 'Invalid IPv4 address')}
            />
          </Field>
          <Field label="DNS server">
            <CommitInput
              value={device.dnsServer}
              placeholder="Unset"
              onCommit={(value) => updateDevice(device.id, { dnsServer: value.trim() })}
              validate={(value) => (value.trim() === '' || isValidIpv4(value.trim()) ? null : 'Invalid IPv4 address')}
            />
          </Field>
        </Section>
      ) : null}

      {device.kind === 'server' ? <ServicesSection device={device} /> : null}

      {router ? <RoutingSection device={device} /> : null}
      {device.kind === 'switch' || device.kind === 'access-point' ? <SwitchTableSection device={device} /> : null}
      {terminalCapable ? <ArpSection device={device} /> : null}

      <Section title="Device actions">
        <div className="button-row">
          <button type="button" className="secondary-button" onClick={duplicateSelection}>Duplicate</button>
          <button type="button" className="danger-button" onClick={deleteSelection}>Delete device</button>
        </div>
      </Section>
    </div>
  );
}
