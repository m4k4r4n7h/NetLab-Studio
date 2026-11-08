import type { Device, Project } from '../types';
import type { ArpCacheRow, MacTableRow, SimulationOutcome, SimulationRequest } from '../engine/core/NetworkSimulator';
import { buildRoutingTable } from '../engine/routing/routingTable';
import { formatCidr, hostAddressError, isValidIpv4, maskToPrefix, parseMaskInput } from '../utils/ipv4';
import { linkIsUp } from '../devices/connectionRules';

export type CliMode = 'exec' | 'privileged' | 'config' | 'interface';

export interface CliSession {
  mode: CliMode;
  interfaceName?: string;
}

export interface CliContext {
  project: Project;
  run: (request: SimulationRequest) => SimulationOutcome;
  updateInterface: (deviceId: string, interfaceId: string, patch: Partial<Device['interfaces'][number]>) => void;
  updateDevice: (deviceId: string, patch: Partial<Device>) => void;
  addStaticRoute: (deviceId: string, route: { network: string; mask: string; nextHop: string }) => void;
  removeStaticRoute: (deviceId: string, routeId: string) => void;
  getMacTable: (deviceId: string) => MacTableRow[];
  getArpCache: (deviceId: string) => ArpCacheRow[];
}

export interface CliResult {
  lines: string[];
  session: CliSession;
}

const ROUTER_KINDS: Device['kind'][] = ['router', 'wireless-router'];
const SWITCH_KINDS: Device['kind'][] = ['switch', 'access-point'];

export function isRouterDevice(device: Device): boolean {
  return ROUTER_KINDS.includes(device.kind);
}

export function isSwitchDevice(device: Device): boolean {
  return SWITCH_KINDS.includes(device.kind);
}

export function isPcDevice(device: Device): boolean {
  return device.kind === 'pc' || device.kind === 'laptop';
}

export function cliPrompt(device: Device, session: CliSession): string {
  if (!isRouterDevice(device) && !isSwitchDevice(device)) return `${device.name}>`;
  switch (session.mode) {
    case 'exec':
      return `${device.name}>`;
    case 'privileged':
      return `${device.name}#`;
    case 'config':
      return `${device.name}(config)#`;
    case 'interface':
      return `${device.name}(config-if)#`;
    default:
      return `${device.name}>`;
  }
}

function normalizeInterfaceName(name: string): string {
  return name.toLowerCase().replace(/[\s-]/g, '');
}

function interfaceLookup(device: Device, name: string) {
  const normalized = normalizeInterfaceName(name);
  const direct = device.interfaces.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
  if (direct) return direct;
  const compact = device.interfaces.find(
    (entry) => normalizeInterfaceName(entry.name) === normalized || normalizeInterfaceName(entry.name).endsWith(normalized)
  );
  if (compact) return compact;
  const shortMap: Record<string, string> = {
    gi: 'gigabitethernet',
    g: 'gigabitethernet',
    fa: 'fastethernet',
    f: 'fastethernet',
    eth: 'ethernet',
    e: 'ethernet',
    wlan: 'wlan'
  };
  const prefix = normalized.match(/^[a-z]+/)?.[0] ?? '';
  const replacement = shortMap[prefix];
  if (replacement) {
    const candidate = normalized.replace(prefix, replacement);
    return device.interfaces.find((entry) => normalizeInterfaceName(entry.name) === candidate);
  }
  return undefined;
}

function interfaceStatus(project: Project, entry: Device['interfaces'][number]): { status: string; protocol: string } {
  const links = project.links.filter((link) => link.a.interfaceId === entry.id || link.b.interfaceId === entry.id);
  if (!entry.enabled) return { status: 'administratively down', protocol: 'down' };
  if (links.length === 0) return { status: 'down', protocol: 'down' };
  const up = links.some((link) => linkIsUp(link, project.devices));
  return up ? { status: 'up', protocol: 'up' } : { status: 'down', protocol: 'down' };
}

function pad(value: string, length: number): string {
  return value.length >= length ? value : value + ' '.repeat(length - value.length);
}

function linkCountFor(project: Project, interfaceId: string): number {
  return project.links.filter((link) => link.a.interfaceId === interfaceId || link.b.interfaceId === interfaceId).length;
}

function showIpInterfaceBrief(device: Device, project: Project): string[] {
  const lines = [
    'Interface              IP-Address      OK? Method Status                Protocol'
  ];
  for (const entry of device.interfaces) {
    const status = interfaceStatus(project, entry);
    lines.push(
      `${pad(entry.name, 23)}${pad(entry.ip || 'unassigned', 16)}${pad(entry.ip ? 'YES' : 'YES', 4)}${pad(entry.ip ? 'manual' : 'unset', 7)}${pad(status.status, 22)}${status.protocol}`
    );
  }
  return lines;
}

function showInterfaces(device: Device, project: Project): string[] {
  const lines: string[] = [];
  for (const entry of device.interfaces) {
    const status = interfaceStatus(project, entry);
    lines.push(`${entry.name} is ${status.status}, line protocol is ${status.protocol}`);
    lines.push(`  Hardware is ${entry.media === 'wireless' ? 'Wireless' : 'Ethernet'}, address is ${entry.mac}`);
    lines.push(`  MTU 1500 bytes, BW ${entry.media === 'wireless' ? 54000 : 1000000} Kbit/sec`);
    if (entry.ip && entry.mask) {
      lines.push(`  Internet address is ${formatCidr(entry.ip, entry.mask)}`);
    } else {
      lines.push('  Internet address is not set');
    }
    lines.push(`  ${linkCountFor(project, entry.id)} cable(s) connected`);
    lines.push('');
  }
  return lines;
}

function showRunningConfig(device: Device): string[] {
  const lines = ['Building configuration...', '', 'Current configuration :', '!', `hostname ${device.name}`, '!'];
  if (device.kind === 'router' || device.kind === 'wireless-router') {
    for (const entry of device.interfaces) {
      lines.push(`interface ${entry.name}`);
      if (entry.ip && entry.mask) lines.push(` ip address ${entry.ip} ${entry.mask}`);
      lines.push(entry.enabled ? ' no shutdown' : ' shutdown');
      lines.push('!');
    }
    if (device.staticRoutes.length > 0) {
      for (const route of device.staticRoutes) {
        lines.push(`ip route ${route.network} ${route.mask} ${route.nextHop}`);
      }
      lines.push('!');
    }
  } else if (isSwitchDevice(device)) {
    for (const entry of device.interfaces) {
      lines.push(`interface ${entry.name}`);
      lines.push(' switchport mode access');
      lines.push(entry.enabled ? ' no shutdown' : ' shutdown');
      lines.push('!');
    }
  } else {
    for (const entry of device.interfaces) {
      lines.push(`interface ${entry.name}`);
      if (entry.ip && entry.mask) lines.push(` ip address ${entry.ip} ${entry.mask}`);
      lines.push('!');
    }
    if (device.gateway) lines.push(`ip default-gateway ${device.gateway}`);
    if (device.dnsServer) lines.push(`ip name-server ${device.dnsServer}`);
  }
  if (device.dnsEnabled) {
    lines.push('service dns');
    for (const record of device.dnsRecords) lines.push(`dns record ${record.name} A ${record.address}`);
    lines.push('!');
  }
  if (device.httpEnabled) lines.push('service http', '!');
  lines.push('end');
  return lines;
}

function showRoutingTable(device: Device): string[] {
  const rows = buildRoutingTable(device);
  const lines = ['Codes: C - connected, S - static, * - candidate default', ''];
  if (rows.length === 0) {
    lines.push('Gateway of last resort is not set', '');
    lines.push('No routes are installed. Configure an interface address or a static route.');
    return lines;
  }
  const connected = rows.filter((row) => row.type === 'connected');
  const statics = rows.filter((row) => row.type !== 'connected');
  for (const row of connected) {
    lines.push(`C    ${row.network}/${row.prefix} is directly connected, ${row.interfaceName}`);
  }
  for (const row of statics) {
    const marker = row.type === 'default' ? 'S*' : 'S ';
    lines.push(`${marker}   ${row.network}/${row.prefix} [1/0] via ${row.nextHop}${row.interfaceName ? `, ${row.interfaceName}` : ' (unreachable next hop)'}`);
  }
  lines.push('', `Gateway of last resort is ${rows.some((row) => row.type === 'default') ? 'set' : 'not set'}`);
  return lines;
}

function showMacTable(device: Device, ctx: CliContext): string[] {
  const rows = ctx.getMacTable(device.id);
  const lines = [
    '          Mac Address Table',
    '-------------------------------------------',
    'Vlan    Mac Address       Type        Ports',
    '----    -----------       --------    -----'
  ];
  if (rows.length === 0) {
    lines.push('No dynamic entries. Generate traffic to populate the table.');
    return lines;
  }
  for (const row of rows) {
    lines.push(`   1    ${row.mac}    DYNAMIC     ${row.interfaceName}`);
  }
  lines.push('', `Total Mac Addresses for this criterion: ${rows.length}`);
  return lines;
}

function pcIpConfig(device: Device): string[] {
  const lines = ['Windows IP Configuration', ''];
  const configured = device.interfaces.filter((entry) => entry.media === 'ethernet' || entry.ip);
  for (const entry of configured) {
    lines.push(`Ethernet adapter ${entry.name}:`, '');
    lines.push(`   Description . . . . . . . . . . . : NetLab ${entry.media === 'wireless' ? 'Wireless' : 'Ethernet'} Adapter`);
    lines.push(`   Physical Address. . . . . . . . . : ${entry.mac.replace(/:/g, '-').toUpperCase()}`);
    if (entry.ip && entry.mask) {
      lines.push(`   IPv4 Address. . . . . . . . . . . : ${entry.ip}`);
      lines.push(`   Subnet Mask . . . . . . . . . . . : ${entry.mask}`);
    } else {
      lines.push('   Media State . . . . . . . . . . . : Media disconnected');
    }
    if (device.gateway) lines.push(`   Default Gateway . . . . . . . . . : ${device.gateway}`);
    if (device.dnsServer) lines.push(`   DNS Servers . . . . . . . . . . . : ${device.dnsServer}`);
    lines.push('');
  }
  return lines;
}

function showArp(device: Device, ctx: CliContext): string[] {
  const rows = ctx.getArpCache(device.id);
  const lines = ['Interface: ' + (device.interfaces[0]?.ip ?? 'unassigned'), '  Internet Address      Physical Address      Type'];
  if (rows.length === 0) {
    lines.push('  No ARP entries. Send traffic to populate the cache.');
    return lines;
  }
  for (const row of rows) {
    lines.push(`  ${pad(row.address, 22)}${pad(row.mac, 22)}dynamic`);
  }
  return lines;
}

function pingOutput(target: string, outcome: SimulationOutcome): string[] {
  const lines = [`Pinging ${target} with 32 bytes of data:`];
  if (outcome.success) {
    const last = outcome.events[outcome.events.length - 1];
    const rtt = Math.max(1, Math.round(last?.time ?? 1));
    for (let index = 0; index < outcome.pingReplies; index += 1) {
      lines.push(`Reply from ${target}: bytes=32 time=${rtt}ms TTL=64`);
    }
    const lost = 4 - outcome.pingReplies;
    lines.push('', `Ping statistics for ${target}:`);
    lines.push(`    Packets: Sent = 4, Received = ${outcome.pingReplies}, Lost = ${lost} (${Math.round((lost / 4) * 100)}% loss)`);
  } else {
    lines.push('Request timed out.', '', 'Ping statistics for ' + target + ':');
    lines.push('    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss)');
    lines.push('', `Reason: ${outcome.summary}`);
  }
  return lines;
}

function tracerouteOutput(outcome: SimulationOutcome): string[] {
  const lines = ['Tracing route over a maximum of 10 hops:', ''];
  if (outcome.hops.length === 0) {
    lines.push('Unable to determine a path.', outcome.summary);
    return lines;
  }
  for (const hop of outcome.hops) {
    const address = hop.address ?? '*';
    const label = hop.deviceName ? ` [${hop.deviceName}]` : '';
    lines.push(`  ${hop.ttl}    <1 ms    <1 ms    <1 ms  ${address}${label}`);
  }
  lines.push('', outcome.success ? 'Trace complete.' : `Trace incomplete. ${outcome.summary}`);
  return lines;
}

function dnsOutput(domain: string, outcome: SimulationOutcome, device: Device): string[] {
  const server = device.dnsServer || 'unconfigured';
  const lines = [`Server:  ${server}`, `Address: ${server}`, ''];
  if (outcome.success && outcome.dnsAddress) {
    lines.push(`Name:    ${domain}`, `Address: ${outcome.dnsAddress}`);
  } else {
    lines.push(`*** No address (A) records available for ${domain}`);
    lines.push(`*** ${outcome.summary}`);
  }
  return lines;
}

function httpOutput(target: string, outcome: SimulationOutcome): string[] {
  if (!outcome.success) {
    return [`Connecting to ${target}...`, '', `Request failed: ${outcome.summary}`];
  }
  const body = (outcome.httpBody ?? '').replace(/\s+/g, ' ').slice(0, 320);
  return [
    `HTTP/1.1 ${outcome.httpStatus} OK`,
    'Content-Type: text/html',
    `Content-Length: ${outcome.httpBody?.length ?? 0}`,
    '',
    body
  ];
}

function resolveTarget(device: Device, target: string, ctx: CliContext): { address: string; lines: string[] } {
  if (isValidIpv4(target)) return { address: target, lines: [] };
  const outcome = ctx.run({ kind: 'dns', sourceId: device.id, domain: target });
  if (outcome.success && outcome.dnsAddress) {
    return { address: outcome.dnsAddress, lines: [`Resolved ${target} to ${outcome.dnsAddress}`] };
  }
  return { address: '', lines: [`Unable to resolve ${target}. ${outcome.summary}`] };
}

const HELP_BY_MODE: Record<CliMode, string[]> = {
  exec: [
    'Available commands:',
    '  enable                     Enter privileged EXEC mode',
    '  ping <address>             Test IPv4 reachability',
    '  tracert <address>          Trace the forwarding path',
    '  nslookup <name>            Resolve a DNS name',
    '  show ip interface brief    Interface addressing summary',
    '  show interfaces            Interface details',
    '  show ip route              Routing table',
    '  show running-config        Active configuration',
    '  help or ?                  This help',
    '  exit                       Close the terminal session'
  ],
  privileged: [
    'Available commands:',
    '  configure terminal         Enter global configuration mode',
    '  ping <address>             Test IPv4 reachability',
    '  tracert <address>          Trace the forwarding path',
    '  nslookup <name>            Resolve a DNS name',
    '  show ip interface brief    Interface addressing summary',
    '  show interfaces            Interface details',
    '  show ip route              Routing table',
    '  show running-config        Active configuration',
    '  show mac address-table     Layer 2 forwarding table',
    '  disable                    Return to user EXEC mode',
    '  help or ?                  This help'
  ],
  config: [
    'Available commands:',
    '  interface <name>           Enter interface configuration',
    '  ip route <net> <mask> <nh> Add a static route',
    '  no ip route <net> <mask>   Remove a static route',
    '  hostname <name>            Change the device name',
    '  exit                       Return to privileged EXEC',
    '  end                        Return to privileged EXEC',
    '  do <show command>          Run a show command',
    '  help or ?                  This help'
  ],
  interface: [
    'Available commands:',
    '  ip address <ip> <mask>     Set the interface address',
    '  no ip address              Remove the interface address',
    '  shutdown / no shutdown     Set administrative state',
    '  exit                       Return to global configuration',
    '  end                        Return to privileged EXEC',
    '  help or ?                  This help'
  ]
};

function pcHelp(device: Device): string[] {
  const lines = ['Available commands:'];
  lines.push('  ipconfig                   Show IPv4 configuration');
  lines.push('  ping <address|name>        Test reachability');
  lines.push('  tracert <address>          Trace the forwarding path');
  lines.push('  nslookup <name>            Resolve a DNS name');
  lines.push('  arp                        Show the ARP cache');
  if (device.kind === 'server') {
    lines.push('  http <address|name>        Fetch a web page');
  } else {
    lines.push('  http <address|name>        Fetch a web page');
  }
  lines.push('  help or ?                  This help');
  lines.push('  cls                        Clear the screen');
  return lines;
}

function unknownCommand(): string[] {
  return [
    "% Invalid input detected at '^' marker.",
    'Type ? for a list of available commands in the current mode.'
  ];
}

function pcCommand(device: Device, line: string, session: CliSession, ctx: CliContext): CliResult {
  const parts = line.split(/\s+/).filter(Boolean);
  const command = parts[0].toLowerCase();
  const argument = parts.slice(1).join(' ');
  if (command === '?' || command === 'help') return { lines: pcHelp(device), session };
  if (command === 'ipconfig' || command === 'ipconfig /all') return { lines: pcIpConfig(device), session };
  if (command === 'ping') {
    if (!argument) return { lines: ['Usage: ping <address|name>'], session };
    const resolved = resolveTarget(device, argument, ctx);
    if (!resolved.address) return { lines: resolved.lines, session };
    const outcome = ctx.run({ kind: 'ping', sourceId: device.id, destinationIp: resolved.address, count: 4 });
    return { lines: [...resolved.lines, ...pingOutput(resolved.address, outcome)], session };
  }
  if (command === 'tracert' || command === 'traceroute') {
    if (!argument) return { lines: ['Usage: tracert <address>'], session };
    const resolved = resolveTarget(device, argument, ctx);
    if (!resolved.address) return { lines: resolved.lines, session };
    const outcome = ctx.run({ kind: 'tracert', sourceId: device.id, destinationIp: resolved.address });
    return { lines: [...resolved.lines, ...tracerouteOutput(outcome)], session };
  }
  if (command === 'nslookup') {
    if (!argument) return { lines: ['Usage: nslookup <name>'], session };
    const outcome = ctx.run({ kind: 'dns', sourceId: device.id, domain: argument });
    return { lines: dnsOutput(argument, outcome, device), session };
  }
  if (command === 'arp') return { lines: showArp(device, ctx), session };
  if (command === 'http' || command === 'curl' || command === 'browser') {
    if (!argument) return { lines: ['Usage: http <address|name>'], session };
    const outcome = ctx.run({ kind: 'http', sourceId: device.id, target: argument });
    return { lines: httpOutput(argument, outcome), session };
  }
  if (command === 'cls' || command === 'clear') return { lines: ['__CLEAR__'], session };
  return { lines: unknownCommand(), session };
}

export function executeCliCommand(
  device: Device,
  rawLine: string,
  session: CliSession,
  ctx: CliContext
): CliResult {
  const line = rawLine.trim();
  if (!line) return { lines: [], session };

  if (!isRouterDevice(device) && !isSwitchDevice(device)) {
    return pcCommand(device, line, session, ctx);
  }

  const parts = line.split(/\s+/).filter(Boolean);
  const command = parts[0].toLowerCase();
  const rest = parts.slice(1);
  const joined = rest.join(' ');

  if (command === '?' || command === 'help') {
    return { lines: HELP_BY_MODE[session.mode], session };
  }
  if (command === 'exit') {
    if (session.mode === 'interface') return { lines: [], session: { mode: 'config' } };
    if (session.mode === 'config') return { lines: [], session: { mode: 'privileged' } };
    return { lines: ['Use the window close button to end the terminal session.'], session };
  }
  if (command === 'end') {
    if (session.mode === 'interface' || session.mode === 'config') {
      return { lines: [], session: { mode: 'privileged' } };
    }
    return { lines: ['% end is only available in configuration mode.'], session };
  }
  if (command === 'enable') {
    return { lines: [], session: { mode: 'privileged' } };
  }
  if (command === 'disable') {
    if (session.mode !== 'privileged') return { lines: ['% disable is only available in privileged mode.'], session };
    return { lines: [], session: { mode: 'exec' } };
  }

  const inPrivileged = session.mode === 'privileged' || session.mode === 'config' || session.mode === 'interface';
  const showCommand = command === 'show' || (command === 'do' && rest[0]?.toLowerCase() === 'show');
  if (showCommand) {
    const showParts = command === 'do' ? rest.slice(1) : rest;
    const subject = showParts.join(' ').toLowerCase();
    if (subject.startsWith('ip interface brief')) {
      return { lines: showIpInterfaceBrief(device, ctx.project), session };
    }
    if (subject.startsWith('ip route')) {
      return { lines: showRoutingTable(device), session };
    }
    if (subject.startsWith('interfaces') || subject.startsWith('interface')) {
      return { lines: showInterfaces(device, ctx.project), session };
    }
    if (subject.startsWith('running-config') || subject.startsWith('run')) {
      return { lines: showRunningConfig(device), session };
    }
    if (subject.startsWith('mac address-table') || subject.startsWith('mac')) {
      return { lines: showMacTable(device, ctx), session };
    }
    return { lines: ['% Incomplete or unknown show command.'], session };
  }

  if (command === 'ping' || command === 'tracert' || command === 'traceroute') {
    if (!inPrivileged) return { lines: ['% Enter enable before running diagnostics.'], session };
    if (!joined) return { lines: [`Usage: ${command} <address>`], session };
    const resolved = resolveTarget(device, joined, ctx);
    if (!resolved.address) return { lines: resolved.lines, session };
    if (command === 'ping') {
      const outcome = ctx.run({ kind: 'ping', sourceId: device.id, destinationIp: resolved.address, count: 4 });
      return { lines: [...resolved.lines, ...pingOutput(resolved.address, outcome)], session };
    }
    const outcome = ctx.run({ kind: 'tracert', sourceId: device.id, destinationIp: resolved.address });
    return { lines: [...resolved.lines, ...tracerouteOutput(outcome)], session };
  }

  if (command === 'nslookup') {
    if (!joined) return { lines: ['Usage: nslookup <name>'], session };
    const outcome = ctx.run({ kind: 'dns', sourceId: device.id, domain: joined });
    return { lines: dnsOutput(joined, outcome, device), session };
  }

  if (isSwitchDevice(device)) {
    return { lines: unknownCommand(), session };
  }

  if (command === 'configure' && rest[0]?.toLowerCase() === 'terminal') {
    if (session.mode !== 'privileged') return { lines: ['% Enter enable before entering configuration mode.'], session };
    return { lines: ['Enter configuration commands, one per line. End with CNTL/Z.'], session: { mode: 'config' } };
  }

  if (command === 'interface') {
    if (session.mode !== 'config') return { lines: ['% interface requires global configuration mode.'], session };
    const entry = interfaceLookup(device, joined);
    if (!entry) return { lines: [`% Interface ${joined} not found.`], session };
    return { lines: [], session: { mode: 'interface', interfaceName: entry.name } };
  }

  if (session.mode === 'interface') {
    const entry = device.interfaces.find((item) => item.name === session.interfaceName);
    if (!entry) return { lines: ['% Interface context is no longer valid.'], session: { mode: 'config' } };
    if (command === 'ip' && rest[0]?.toLowerCase() === 'address') {
      const address = rest[1];
      const maskInput = rest[2];
      if (!address || !maskInput) return { lines: ['Usage: ip address <address> <mask|prefix>'], session };
      if (!isValidIpv4(address)) return { lines: [`% Invalid IPv4 address: ${address}`], session };
      const mask = parseMaskInput(maskInput);
      if (!mask) return { lines: [`% Invalid subnet mask: ${maskInput}`], session };
      const addressIssue = hostAddressError(address, mask);
      if (addressIssue) return { lines: [`% ${addressIssue}`], session };
      ctx.updateInterface(device.id, entry.id, { ip: address, mask });
      return { lines: [`Interface ${entry.name} configured with ${formatCidr(address, mask)}`], session };
    }
    if (command === 'no' && rest[0]?.toLowerCase() === 'ip' && rest[1]?.toLowerCase() === 'address') {
      ctx.updateInterface(device.id, entry.id, { ip: '', mask: '' });
      return { lines: [`Interface ${entry.name} address removed`], session };
    }
    if (command === 'shutdown') {
      ctx.updateInterface(device.id, entry.id, { enabled: false });
      return { lines: [`Interface ${entry.name} administratively down`], session };
    }
    if (command === 'no' && rest[0]?.toLowerCase() === 'shutdown') {
      ctx.updateInterface(device.id, entry.id, { enabled: true });
      return { lines: [`Interface ${entry.name} enabled`], session };
    }
    return { lines: unknownCommand(), session };
  }

  if (session.mode === 'config') {
    if (command === 'ip' && rest[0]?.toLowerCase() === 'route') {
      const network = rest[1];
      const maskInput = rest[2];
      const nextHop = rest[3];
      if (!network || !maskInput || !nextHop) {
        return { lines: ['Usage: ip route <network> <mask|prefix> <next-hop>'], session };
      }
      if (!isValidIpv4(network)) return { lines: [`% Invalid network address: ${network}`], session };
      const mask = parseMaskInput(maskInput);
      if (!mask) return { lines: [`% Invalid subnet mask: ${maskInput}`], session };
      if (!isValidIpv4(nextHop)) return { lines: [`% Invalid next hop: ${nextHop}`], session };
      const prefix = maskToPrefix(mask);
      ctx.addStaticRoute(device.id, { network, mask, nextHop });
      return { lines: [`Static route ${network}/${prefix} via ${nextHop} installed`], session };
    }
    if (command === 'no' && rest[0]?.toLowerCase() === 'ip' && rest[1]?.toLowerCase() === 'route') {
      const network = rest[2];
      const maskInput = rest[3];
      const mask = maskInput ? parseMaskInput(maskInput) : null;
      const matches = device.staticRoutes.filter((route) =>
        (!network || route.network === network) && (!mask || route.mask === mask)
      );
      if (matches.length === 0) return { lines: ['% No matching static route.'], session };
      for (const route of matches) ctx.removeStaticRoute(device.id, route.id);
      return { lines: [`Removed ${matches.length} static route(s)`], session };
    }
    if (command === 'hostname') {
      if (!joined) return { lines: ['Usage: hostname <name>'], session };
      ctx.updateDevice(device.id, { name: joined });
      return { lines: [], session };
    }
    return { lines: unknownCommand(), session };
  }

  return { lines: unknownCommand(), session };
}
