import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../state/store';
import { Dialog } from '../common/Dialog';
import { isValidIpv4 } from '../../utils/ipv4';
import type { Device } from '../../types';
import type { SimulationRequest } from '../../engine/core/NetworkSimulator';

type Protocol = 'ping' | 'tracert' | 'dns' | 'http' | 'tcp' | 'udp';

const PROTOCOLS: Array<{ value: Protocol; label: string; description: string }> = [
  { value: 'ping', label: 'ICMP ping', description: 'Echo request and reply over IPv4.' },
  { value: 'tracert', label: 'Traceroute', description: 'Probe TTL values to reveal the forwarding path.' },
  { value: 'dns', label: 'DNS lookup', description: 'Resolve an A record using UDP port 53.' },
  { value: 'http', label: 'HTTP GET', description: 'TCP handshake followed by an HTTP request and response.' },
  { value: 'tcp', label: 'TCP handshake', description: 'Three-way handshake, then a graceful close.' },
  { value: 'udp', label: 'UDP datagram', description: 'Send a connectionless datagram to a port.' }
];

function firstAddress(device: Device | undefined): string {
  if (!device) return '';
  return device.interfaces.find((entry) => entry.enabled && entry.ip && entry.mask)?.ip ?? '';
}

function isHostDevice(device: Device): boolean {
  return ['pc', 'laptop', 'server', 'printer'].includes(device.kind);
}

export function PacketGeneratorDialog() {
  const project = useAppStore((state) => state.project);
  const setSimulationMode = useAppStore((state) => state.setSimulationMode);
  const [stepMode, setStepMode] = useState(true);
  const runSimulation = useAppStore((state) => state.runSimulation);
  const closeDialog = useAppStore((state) => state.closeDialog);
  const setStatusMessage = useAppStore((state) => state.setStatusMessage);

  const hosts = useMemo(() => project.devices.filter((device) => Boolean(firstAddress(device))), [project.devices]);
  const [sourceId, setSourceId] = useState(hosts[0]?.id ?? '');
  const [destinationId, setDestinationId] = useState('');
  const [protocol, setProtocol] = useState<Protocol>('ping');
  const [target, setTarget] = useState('');
  const [count, setCount] = useState(1);
  const [path, setPath] = useState('/');
  const [port, setPort] = useState(80);
  const [payload, setPayload] = useState('Hello from NetLab Studio');
  const [error, setError] = useState<string | null>(null);

  const source = project.devices.find((device) => device.id === sourceId);
  const destination = project.devices.find((device) => device.id === destinationId);

  const destinationDefaults = useMemo(() => {
    const candidates = project.devices.filter((device) => device.id !== sourceId && firstAddress(device));
    return candidates;
  }, [project.devices, sourceId]);

  useEffect(() => {
    if (!hosts.some((device) => device.id === sourceId)) {
      setSourceId(hosts[0]?.id ?? '');
    }
  }, [hosts, sourceId]);

  useEffect(() => {
    const candidates = project.devices.filter((device) => device.id !== sourceId && firstAddress(device));
    if (!candidates.some((device) => device.id === destinationId)) {
      const preferred = candidates.find((device) => isHostDevice(device)) ?? candidates[0];
      setDestinationId(preferred?.id ?? '');
    }
  }, [project.devices, sourceId, destinationId]);

  useEffect(() => {
    if (!destination) return;
    if (protocol === 'dns') {
      const record = destination.dnsRecords[0];
      setTarget(record?.name ?? '');
      return;
    }
    if (protocol === 'http') {
      const record = destination.dnsEnabled ? destination.dnsRecords[0] : undefined;
      setTarget(record?.name ?? firstAddress(destination));
      return;
    }
    setTarget(firstAddress(destination));
  }, [destination, protocol]);

  const buildRequest = (): SimulationRequest | null => {
    if (!source) return null;
    if (protocol === 'dns') {
      if (!target.trim()) return null;
      return { kind: 'dns', sourceId: source.id, domain: target.trim() };
    }
    const resolvedTarget = target.trim() || firstAddress(destination);
    if (!resolvedTarget) return null;
    if (protocol === 'http') {
      return { kind: 'http', sourceId: source.id, target: resolvedTarget, path: path.trim() || '/' };
    }
    if (!isValidIpv4(resolvedTarget)) return null;
    if (protocol === 'ping') {
      return { kind: 'ping', sourceId: source.id, destinationIp: resolvedTarget, count };
    }
    if (protocol === 'tracert') {
      return { kind: 'tracert', sourceId: source.id, destinationIp: resolvedTarget };
    }
    if (protocol === 'udp') {
      return { kind: 'udp', sourceId: source.id, destinationIp: resolvedTarget, port, payload };
    }
    return { kind: 'tcp', sourceId: source.id, destinationIp: resolvedTarget, port };
  };

  const generate = () => {
    const request = buildRequest();
    if (!source) {
      setError('The source device has no IPv4 address configured.');
      return;
    }
    if (!request) {
      setError(
        protocol === 'dns'
          ? 'Enter a domain name to resolve and make sure the source has a DNS server configured.'
          : 'Choose a destination with a valid IPv4 address.'
      );
      return;
    }
    try {
      setSimulationMode(stepMode ? 'simulation' : 'realtime');
      const label = `${source.name} → ${protocol.toUpperCase()} ${target || firstAddress(destination)}`;
      const outcome = runSimulation(request, { label, revealAll: false });
      if (!outcome.success) setStatusMessage(`${outcome.summary} — step through the events to inspect the failure.`);
      closeDialog();
    } catch {
      setError('The simulation engine could not process this request. Check the topology and try again.');
    }
  };

  return (
    <Dialog
      title="Packet Generator"
      subtitle="Build a protocol exchange and step through every forwarding decision in Simulation mode."
      onClose={closeDialog}
      width={700}
      footer={(
        <>
          <label className="inline-checkbox">
            <input
              type="checkbox"
              checked={stepMode}
              onChange={(event) => setStepMode(event.target.checked)}
            />
            <span>Open in Simulation mode</span>
          </label>
          <span className="footer-spacer" />
          <button type="button" className="secondary-button" onClick={closeDialog}>Cancel</button>
          <button type="button" className="primary-button" onClick={generate}>Generate Packet</button>
        </>
      )}
    >
      <div className="form-grid two-column">
        <label className="field">
          <span>Source device</span>
          <select value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
            {hosts.length === 0 ? <option value="">No addressed device</option> : null}
            {hosts.map((device) => (
              <option key={device.id} value={device.id}>{device.name} · {firstAddress(device)}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Destination device</span>
          <select value={destinationId} onChange={(event) => setDestinationId(event.target.value)}>
            <option value="">Manual target</option>
            {destinationDefaults.map((device) => (
              <option key={device.id} value={device.id}>{device.name} · {firstAddress(device)}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="protocol-grid">
        {PROTOCOLS.map((entry) => (
          <button
            key={entry.value}
            type="button"
            className={`protocol-choice ${protocol === entry.value ? 'is-active' : ''}`}
            onClick={() => {
              setProtocol(entry.value);
              setError(null);
              if (entry.value === 'http' || entry.value === 'tcp') setPort(80);
              if (entry.value === 'udp') setPort(1234);
            }}
          >
            <strong>{entry.label}</strong>
            <span>{entry.description}</span>
          </button>
        ))}
      </div>

      <div className="form-grid two-column">
        <label className="field">
          <span>{protocol === 'dns' ? 'Domain name' : protocol === 'http' ? 'Target host or IPv4 address' : 'Destination IPv4 address'}</span>
          <input
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            placeholder={protocol === 'dns' ? 'www.lab.test' : '192.168.1.10'}
            spellCheck={false}
          />
        </label>
        {protocol === 'ping' ? (
          <label className="field">
            <span>Echo requests</span>
            <input type="number" min={1} max={4} value={count} onChange={(event) => setCount(Math.max(1, Math.min(4, Number(event.target.value))))} />
          </label>
        ) : null}
        {protocol === 'http' ? (
          <label className="field">
            <span>Request path</span>
            <input value={path} onChange={(event) => setPath(event.target.value)} placeholder="/" spellCheck={false} />
          </label>
        ) : null}
        {protocol === 'tcp' || protocol === 'udp' ? (
          <label className="field">
            <span>{protocol === 'tcp' ? 'TCP port' : 'UDP port'}</span>
            <input type="number" min={1} max={65535} value={port} onChange={(event) => setPort(Math.max(1, Math.min(65535, Number(event.target.value))))} />
          </label>
        ) : null}
      </div>

      {protocol === 'udp' ? (
        <label className="field">
          <span>Datagram payload</span>
          <input value={payload} onChange={(event) => setPayload(event.target.value)} maxLength={180} />
        </label>
      ) : null}

      {source?.dnsServer ? (
        <p className="dialog-note">The source DNS server is {source.dnsServer}. DNS lookups use UDP port 53.</p>
      ) : null}
      {protocol === 'dns' && !source?.dnsServer ? (
        <div className="form-error">The selected source has no DNS server configured. Set one in the Inspector first.</div>
      ) : null}
      {error ? <div className="form-error">{error}</div> : null}
      {destination && !firstAddress(destination) ? (
        <div className="form-error">{destination.name} has no IPv4 address configured.</div>
      ) : null}
    </Dialog>
  );
}
