import { useMemo, useState } from 'react';
import { useAppStore } from '../../state/store';
import { Dialog } from '../common/Dialog';
import { sanitizeHtml } from '../../utils/sanitizeHtml';
import { formatBrowserAddress, parseBrowserAddress } from '../../utils/browserAddress';
import { Icon } from '../common/Icon';
import type { SimulationOutcome } from '../../engine/core/NetworkSimulator';

const BROWSER_KINDS = ['pc', 'laptop'];

export function BrowserDialog() {
  const project = useAppStore((state) => state.project);
  const browserDeviceId = useAppStore((state) => state.browserDeviceId);
  const selection = useAppStore((state) => state.selection);
  const closeDialog = useAppStore((state) => state.closeDialog);
  const runCommandSimulation = useAppStore((state) => state.runCommandSimulation);
  const devices = useMemo(() => project.devices.filter((device) => BROWSER_KINDS.includes(device.kind)), [project.devices]);
  const initialId = browserDeviceId ?? (selection.length === 1 ? selection[0] : devices[0]?.id ?? '');
  const [deviceId, setDeviceId] = useState(initialId);
  const [address, setAddress] = useState('');
  const [outcome, setOutcome] = useState<SimulationOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const device = project.devices.find((entry) => entry.id === deviceId);

  const suggestions = useMemo(() => {
    const names = new Set<string>();
    for (const entry of project.devices) {
      if (entry.dnsEnabled) {
        for (const record of entry.dnsRecords) names.add(record.name);
      }
      if (entry.httpEnabled) {
        const addressEntry = entry.interfaces.find((item) => item.ip);
        if (addressEntry) names.add(addressEntry.ip);
      }
    }
    return [...names].slice(0, 8);
  }, [project.devices]);

  const navigate = (raw: string) => {
    const parsed = parseBrowserAddress(raw);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    if (!device) {
      setError('Select a PC or laptop with an IPv4 address.');
      return;
    }
    const configured = device.interfaces.find((entry) => entry.enabled && entry.ip && entry.mask);
    if (!configured) {
      setError(`${device.name} has no IPv4 address configured.`);
      return;
    }
    const result = runCommandSimulation({
      kind: 'http',
      sourceId: device.id,
      target: parsed.target.host,
      path: parsed.target.path
    });
    setOutcome(result);
    setAddress(formatBrowserAddress(parsed.target));
    if (result.success) {
      setError(null);
    } else {
      setError(result.summary);
    }
  };

  const sanitizedBody = outcome?.httpBody ? sanitizeHtml(outcome.httpBody) : '';
  const titleMatch = outcome?.httpBody?.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

  return (
    <Dialog
      title="Web Browser"
      subtitle="Requests run through the simulated TCP/IP stack. Rendered server HTML is sanitized."
      onClose={closeDialog}
      width={860}
      className="browser-dialog"
      footer={(
        <>
          <select
            className="browser-device-select"
            value={deviceId}
            onChange={(event) => {
              setDeviceId(event.target.value);
              setOutcome(null);
              setError(null);
            }}
            aria-label="Browser client device"
          >
            {devices.length === 0 ? <option value="">No PC or laptop available</option> : null}
            {devices.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.name} · {entry.kind}</option>
            ))}
          </select>
          <span className="footer-spacer" />
          <button type="button" className="secondary-button" onClick={closeDialog}>Close</button>
        </>
      )}
    >
      <form
        className="browser-bar"
        onSubmit={(event) => {
          event.preventDefault();
          navigate(address);
        }}
      >
        <span className="browser-lock"><Icon name="network" size={14} /></span>
        <input
          autoFocus
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="www.lab.test/page or 192.168.1.10"
          spellCheck={false}
          aria-label="Browser address"
        />
        <button type="submit" className="primary-button">Go</button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => navigate(address)}
          disabled={!address.trim()}
          title="Reload the current address"
        >
          <Icon name="reset" size={14} />
        </button>
      </form>

      <div className="browser-suggestions">
        <span className="muted small">Local sites:</span>
        {suggestions.length === 0 ? <span className="muted small">Enable HTTP or add DNS records in the Inspector.</span> : null}
        {suggestions.map((entry) => (
          <button key={entry} type="button" className="mini-button" onClick={() => navigate(entry)}>
            {entry}
          </button>
        ))}
      </div>

      {error ? <div className="form-error">{error}</div> : null}

      <div className="browser-frame">
        <div className="browser-page-head">
          <span className="browser-url">{outcome?.success ? address : 'about:blank'}</span>
          {outcome?.success ? (
            <span className="badge badge-success">
              <Icon name="check" size={12} /> HTTP {outcome.httpStatus}
            </span>
          ) : (
            <span className="badge">No page loaded</span>
          )}
        </div>
        {outcome?.success ? (
          <div className="browser-page">
            <div className="browser-page-title">{titleMatch?.[1]?.trim() || 'Simulated page'}</div>
            <div className="browser-rendered" dangerouslySetInnerHTML={{ __html: sanitizedBody }} />
            <div className="browser-page-footer">
              {outcome.httpBody?.length ?? 0} bytes · delivered through {outcome.events.length} simulation events
            </div>
          </div>
        ) : (
          <div className="browser-empty">
            <Icon name="network" size={28} />
            <p>Enter a site address above to make an HTTP request through the simulated network.</p>
            <p className="muted small">
              The client must have an IPv4 address. DNS is used when a name is entered. The server must be reachable and have
              HTTP enabled on TCP port 80.
            </p>
          </div>
        )}
      </div>
      <p className="dialog-note">
        No request leaves the browser. Page content is sanitized to remove scripts, event handlers, forms, embedded frames,
        and unsafe URLs.
      </p>
    </Dialog>
  );
}
