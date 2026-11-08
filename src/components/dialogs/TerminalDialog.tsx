import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../../state/store';
import { Dialog } from '../common/Dialog';
import { executeCliCommand, cliPrompt, isRouterDevice, isSwitchDevice } from '../../cli/CommandProcessor';
import type { CliSession } from '../../cli/CommandProcessor';
import { getSimulator } from '../../state/runtime';
import { sameSubnet } from '../../utils/ipv4';

interface OutputLine {
  text: string;
  kind: 'system' | 'command' | 'output' | 'error';
}

const TERMINAL_KINDS = ['router', 'wireless-router', 'switch', 'access-point', 'pc', 'laptop', 'server', 'printer'];

export function TerminalDialog() {
  const project = useAppStore((state) => state.project);
  const terminalDeviceId = useAppStore((state) => state.terminalDeviceId);
  const closeDialog = useAppStore((state) => state.closeDialog);
  const selection = useAppStore((state) => state.selection);
  const devices = useMemo(() => project.devices.filter((device) => TERMINAL_KINDS.includes(device.kind)), [project.devices]);
  const initialId = terminalDeviceId ?? (selection.length === 1 ? selection[0] : devices[0]?.id ?? '');
  const [deviceId, setDeviceId] = useState(initialId);
  const [session, setSession] = useState<CliSession>({ mode: 'exec' });
  const [lines, setLines] = useState<OutputLine[]>([]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const device = project.devices.find((entry) => entry.id === deviceId);

  useEffect(() => {
    if (!device) return;
    setLines([
      { text: `NetLab Studio Terminal — ${device.name}`, kind: 'system' },
      {
        text: isRouterDevice(device) || isSwitchDevice(device)
          ? 'Router/switch CLI ready. Type enable to enter privileged EXEC mode, or ? for help.'
          : 'Host terminal ready. Type ipconfig, ping, tracert, nslookup, arp, or http. Type help for all commands.',
        kind: 'system'
      }
    ]);
    setSession({ mode: 'exec' });
    setInput('');
    setHistory([]);
    setHistoryIndex(-1);
    window.setTimeout(() => inputRef.current?.focus(), 50);
  }, [deviceId]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [lines]);

  const submit = (raw: string) => {
    const command = raw.trim();
    if (!command) return;
    if (!device) return;
    const state = useAppStore.getState();
    const result = executeCliCommand(device, command, session, {
      project: state.project,
      run: (request) => state.runCommandSimulation(request),
      updateInterface: state.updateInterface,
      updateDevice: state.updateDevice,
      addStaticRoute: state.addStaticRoute,
      removeStaticRoute: state.removeStaticRoute,
      getMacTable: (id) => {
        try {
          return getSimulator().getMacTable(id);
        } catch {
          return [];
        }
      },
      getArpCache: (id) => {
        try {
          return getSimulator().getArpCache(id);
        } catch {
          return [];
        }
      }
    });
    const nextLines: OutputLine[] = [{ text: `${cliPrompt(device, session)} ${command}`, kind: 'command' }];
    if (result.lines.includes('__CLEAR__')) {
      setLines([]);
      setSession(result.session);
      setInput('');
      setHistory((current) => [...current, command]);
      setHistoryIndex(-1);
      return;
    }
    for (const line of result.lines) {
      nextLines.push({
        text: line,
        kind: line.startsWith('%') || line.startsWith('***') ? 'error' : 'output'
      });
    }
    setLines((current) => [...current, ...nextLines]);
    setSession(result.session);
    setInput('');
    setHistory((current) => [...current, command]);
    setHistoryIndex(-1);
  };

  const quickCommands = useMemo(() => {
    if (!device) return [];
    if (isRouterDevice(device)) return ['enable', 'show ip interface brief', 'show ip route', 'show running-config'];
    if (isSwitchDevice(device)) return ['enable', 'show mac address-table', 'show interfaces', 'show running-config'];
    const commands = ['ipconfig'];
    const ownAddress = device.interfaces.find((entry) => entry.enabled && entry.ip && entry.mask);
    const remoteAddresses = project.devices
      .filter((entry) => entry.id !== device.id)
      .flatMap((entry) => entry.interfaces)
      .filter((entry) => entry.enabled && entry.ip && entry.mask)
      .map((entry) => entry.ip);
    const localTargets = ownAddress
      ? remoteAddresses.filter((address) => sameSubnet(ownAddress.ip, address, ownAddress.mask))
      : [];
    const pingTarget = localTargets[0] ?? remoteAddresses[0];
    if (pingTarget) commands.push(`ping ${pingTarget}`);
    const dnsRecord = project.devices
      .find((entry) => entry.dnsEnabled && entry.dnsRecords.length > 0)
      ?.dnsRecords[0];
    if (device.dnsServer && dnsRecord) commands.push(`nslookup ${dnsRecord.name}`);
    commands.push('arp');
    return commands;
  }, [device, project.devices]);

  return (
    <Dialog
      title="Device Terminal"
      subtitle="A controlled CLI parser updates the real project state. No shell or external network access is involved."
      onClose={closeDialog}
      width={820}
      className="terminal-dialog"
      footer={(
        <>
          <select
            className="terminal-device-select"
            value={deviceId}
            onChange={(event) => setDeviceId(event.target.value)}
            aria-label="Terminal device"
          >
            {devices.length === 0 ? <option value="">No terminal-capable device</option> : null}
            {devices.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.name} · {entry.kind}</option>
            ))}
          </select>
          <span className="footer-spacer" />
          <button type="button" className="secondary-button" onClick={() => setLines([])}>Clear output</button>
          <button type="button" className="primary-button" onClick={closeDialog}>Close</button>
        </>
      )}
    >
      <div className="terminal-shell">
        <div className="terminal-body" ref={bodyRef}>
          {lines.map((line, index) => (
            <div key={`${index}-${line.text}`} className={`terminal-line line-${line.kind}`}>{line.text || ' '}</div>
          ))}
        </div>
        <div className="terminal-input-row">
          <span className="terminal-prompt">{device ? cliPrompt(device, session) : '>'}</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                submit(input);
                return;
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                if (history.length === 0) return;
                const nextIndex = historyIndex < 0 ? history.length - 1 : Math.max(0, historyIndex - 1);
                setHistoryIndex(nextIndex);
                setInput(history[nextIndex] ?? '');
              }
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                if (historyIndex < 0) return;
                const nextIndex = historyIndex + 1;
                if (nextIndex >= history.length) {
                  setHistoryIndex(-1);
                  setInput('');
                } else {
                  setHistoryIndex(nextIndex);
                  setInput(history[nextIndex] ?? '');
                }
              }
            }}
            placeholder={device ? `Enter a command for ${device.name}` : 'No device selected'}
            disabled={!device}
            spellCheck={false}
            autoComplete="off"
            aria-label="Terminal command input"
          />
        </div>
      </div>
      <div className="terminal-quick">
        {quickCommands.map((command) => (
          <button key={command} type="button" className="mini-button" onClick={() => submit(command)}>
            {command}
          </button>
        ))}
      </div>
      <p className="dialog-note">
        Tip: use ↑ and ↓ for command history. {device ? device.name : 'Devices'} keeps its configuration when the window closes.
      </p>
    </Dialog>
  );
}
