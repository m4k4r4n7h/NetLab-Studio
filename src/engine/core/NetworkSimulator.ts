import type { Device, Project } from '../../types';
import { BROADCAST_MAC } from '../../utils/id';
import { isValidIpv4, maskToPrefix, sameSubnet } from '../../utils/ipv4';
import { linksForInterface, linkIsUp, otherEndpoint } from '../../devices/connectionRules';
import { buildRoutingTable, lookupRoute } from '../routing/routingTable';
import {
  newPacketId,
  packetSummary,
  type ApplicationData,
  type Packet,
  type TcpFlag
} from './packet';
import type { EventEdge, EventLayer, EventOutcome, SimulationEvent, SimulationEventType } from './events';

export type SimulationRequest =
  | { kind: 'ping'; sourceId: string; destinationIp: string; count?: number; ttl?: number }
  | { kind: 'dns'; sourceId: string; domain: string; serverIp?: string }
  | { kind: 'http'; sourceId: string; target: string; path?: string }
  | { kind: 'udp'; sourceId: string; destinationIp: string; port: number; payload: string }
  | { kind: 'tcp'; sourceId: string; destinationIp: string; port: number }
  | { kind: 'tracert'; sourceId: string; destinationIp: string };

export interface TracertHop {
  ttl: number;
  address: string | null;
  deviceName: string | null;
  reached: boolean;
}

export interface SimulationOutcome {
  success: boolean;
  events: SimulationEvent[];
  summary: string;
  dnsAddress?: string;
  httpBody?: string;
  httpStatus?: number;
  pingReplies: number;
  hops: TracertHop[];
  error?: string;
}

export interface MacTableRow {
  mac: string;
  interfaceId: string;
  interfaceName: string;
  learnedAt: number;
  type: 'dynamic';
}

export interface ArpCacheRow {
  address: string;
  mac: string;
  interfaceName: string;
}

interface InternalFrameTask {
  kind: 'frame';
  time: number;
  sequence: number;
  deviceId: string;
  packet: Packet;
  ingressInterfaceId?: string;
  edge?: EventEdge;
  hops: number;
}

interface InternalArpTimeoutTask {
  kind: 'arp-timeout';
  time: number;
  sequence: number;
  deviceId: string;
  key: string;
}

type InternalTask = InternalFrameTask | InternalArpTimeoutTask;

interface PendingFrame {
  packet: Packet;
  nextHopIp: string;
  egressInterfaceId: string;
  key: string;
  hops: number;
}

const MAX_EVENTS = 700;
const MAX_FRAME_HOPS = 32;
const ARP_TIMEOUT_MS = 1500;
const CLIENT_PORT_BASE = 49152;

const ROUTER_KINDS: Device['kind'][] = ['router', 'wireless-router'];
const SWITCH_KINDS: Device['kind'][] = ['switch', 'access-point'];

function isRouter(device: Device): boolean {
  return ROUTER_KINDS.includes(device.kind);
}

function isSwitch(device: Device): boolean {
  return SWITCH_KINDS.includes(device.kind);
}

function isRepeater(device: Device): boolean {
  return device.kind === 'hub' || device.kind === 'patch-panel';
}

function isBroadcast(mac: string): boolean {
  return mac.toLowerCase() === BROADCAST_MAC;
}

function explainEvent(type: SimulationEventType, detail: string): string {
  switch (type) {
    case 'frame-received':
      return 'A frame moves one hop at a time. Each device examines the destination MAC address to decide whether the frame is for it, should be forwarded, or should be discarded.';
    case 'frame-forwarded':
      return 'Switches build a table that maps source MAC addresses to the port they arrived on. Known destinations are forwarded only out of the learned port; unknown unicast and broadcast frames are flooded.';
    case 'mac-learned':
      return 'MAC learning is passive: the switch records the source MAC of every frame together with the ingress port. Entries age out in real switches; this teaching model keeps them for the session.';
    case 'arp-request':
      return 'ARP resolves an IPv4 address to a MAC address inside the local broadcast domain. The request is broadcast because the sender does not yet know the destination MAC.';
    case 'arp-reply':
      return 'The owner of the requested IPv4 address answers with its MAC address. The reply is unicast, and both devices cache the mapping.';
    case 'arp-timeout':
      return 'If no device answers the ARP request, the frame cannot be encapsulated and the packet is dropped. A wrong gateway or wrong subnet often fails at exactly this step.';
    case 'route-lookup':
      return 'A router compares the destination IPv4 address with its routing table and chooses the longest matching prefix. Directly connected networks are installed automatically; remote networks need static routes.';
    case 'router-forwarded':
      return 'Routing happens at Layer 3. The router decreases TTL, chooses a new next hop, and rewrites the Ethernet source and destination MAC addresses for the next link.';
    case 'ttl-expired':
      return 'Every router decrements TTL. If it reaches zero the packet is discarded, which prevents packets from circulating forever. Traceroute deliberately uses small TTL values to reveal routers.';
    case 'packet-dropped':
      return `The packet could not reach its destination: ${detail}. This is a real forwarding failure, not a visual effect.`;
    case 'icmp-request':
      return 'An ICMP echo request asks the destination to return an echo reply. It proves end-to-end IPv4 reachability in both directions.';
    case 'icmp-reply':
      return 'The destination builds a new packet with the source and destination reversed and sends it back using normal IPv4 forwarding.';
    case 'icmp-success':
      return 'The original sender received the echo reply. Forwarding, ARP resolution, and the return path all worked.';
    case 'dns-query':
      return 'DNS maps a domain name to an IPv4 address. The client sends a UDP query to the configured DNS server on port 53.';
    case 'dns-response':
      return 'The DNS server answers with an A record. The client caches the address and can now open a connection to that IPv4 address.';
    case 'dns-failure':
      return 'A DNS failure means the name could not be resolved. Common causes are an unreachable DNS server, a missing A record, or an unconfigured client DNS address.';
    case 'tcp-syn':
      return 'TCP starts a connection with a SYN segment that carries the client initial sequence number and destination port.';
    case 'tcp-syn-ack':
      return 'The server acknowledges the client sequence number and supplies its own initial sequence number in a SYN-ACK.';
    case 'tcp-established':
      return 'The third handshake segment completes connection establishment. Both endpoints now track sequence and acknowledgment numbers.';
    case 'tcp-ack':
      return 'TCP acknowledgments confirm received sequence numbers. This simplified model tracks handshake and teardown but does not retransmit lost segments.';
    case 'tcp-fin':
      return 'TCP tears a connection down with FIN segments from each side.';
    case 'tcp-closed':
      return 'Both sides have completed the closing exchange and the connection state returns to CLOSED.';
    case 'tcp-reset':
      return 'A reset segment tells the client that no service is listening on the requested port.';
    case 'http-request':
      return 'HTTP rides on top of TCP. The request line names the method and path, and the Host header identifies the virtual host.';
    case 'http-response':
      return 'The server returns a status line, headers, and a body over the established TCP connection. The client browser renders the body.';
    case 'udp-send':
      return 'UDP sends a datagram without a handshake or delivery guarantee. The application must tolerate loss and reordering.';
    case 'udp-receive':
      return 'The datagram arrived at a listening UDP endpoint. No acknowledgment is sent.';
    case 'service-unavailable':
      return 'The destination address was reachable, but nothing accepted the request on that port. In this model an unreachable service fails explicitly.';
    case 'safeguard':
      return 'The simulator stops runaway event processing so a broken or looping topology cannot freeze the application.';
    default:
      return detail;
  }
}

export class NetworkSimulator {
  private project: Project;
  private events: SimulationEvent[] = [];
  private queue: InternalTask[] = [];
  private now = 0;
  private timeBase = 0;
  private sequence = 0;
  private eventSequence = 0;
  private pendingByDevice = new Map<string, PendingFrame[]>();
  private arpInFlight = new Set<string>();
  private macTables = new Map<string, Map<string, { interfaceId: string; learnedAt: number; linkId?: string }>>();
  private arpCaches = new Map<string, Map<string, string>>();
  private exchangeSuccess = false;
  private lastDropReason: string | null = null;
  private dnsAddress: string | undefined;
  private httpBody: string | undefined;
  private httpStatus: number | undefined;
  private tcpEstablished = false;

  constructor(project: Project) {
    this.project = project;
  }

  sync(project: Project): void {
    this.project = project;
    const liveDeviceIds = new Set(project.devices.map((device) => device.id));
    for (const deviceId of [...this.macTables.keys()]) {
      if (!liveDeviceIds.has(deviceId)) this.macTables.delete(deviceId);
    }
    for (const deviceId of [...this.arpCaches.keys()]) {
      if (!liveDeviceIds.has(deviceId)) this.arpCaches.delete(deviceId);
    }
  }

  clearRuntimeState(): void {
    this.macTables.clear();
    this.arpCaches.clear();
  }

  getMacTable(deviceId: string): MacTableRow[] {
    const table = this.macTables.get(deviceId);
    if (!table) return [];
    const device = this.deviceById(deviceId);
    return [...table.entries()]
      .map(([mac, entry]) => ({
        mac,
        interfaceId: entry.interfaceId,
        interfaceName: device?.interfaces.find((item) => item.id === entry.interfaceId)?.name ?? 'unknown',
        learnedAt: entry.learnedAt,
        type: 'dynamic' as const
      }))
      .sort((left, right) => left.mac.localeCompare(right.mac));
  }

  getArpCache(deviceId: string): ArpCacheRow[] {
    const cache = this.arpCaches.get(deviceId);
    if (!cache) return [];
    const device = this.deviceById(deviceId);
    return [...cache.entries()]
      .map(([address, mac]) => ({
        address,
        mac,
        interfaceName:
          device?.interfaces.find((entry) => sameSubnet(entry.ip, address, entry.mask))?.name ??
          device?.interfaces[0]?.name ??
          'unknown'
      }))
      .sort((left, right) => left.address.localeCompare(right.address));
  }

  run(request: SimulationRequest): SimulationOutcome {
    this.events = [];
    this.timeBase = 0;
    this.eventSequence = 0;
    this.dnsAddress = undefined;
    this.httpBody = undefined;
    this.httpStatus = undefined;
    this.tcpEstablished = false;
    const hops: TracertHop[] = [];
    let pingReplies = 0;
    let error: string | undefined;

    if (request.kind === 'ping') {
      const count = request.count ?? 4;
      const source = this.deviceById(request.sourceId);
      const sourceInterface = source ? this.configuredInterfaces(source)[0] : undefined;
      if (!source || !sourceInterface) {
        return this.failedOutcome('The source device has no IPv4 address configured.');
      }
      for (let attempt = 0; attempt < count; attempt += 1) {
        this.startExchange();
        const packet = this.buildIcmpPacket(
          sourceInterface.ip,
          request.destinationIp,
          'echo-request',
          request.ttl ?? 64,
          1,
          attempt + 1
        );
        this.emit(source, 'packet-originated', 'L3', `Ping ${request.destinationIp} from ${sourceInterface.ip}`, `Source ${source.name} ${sourceInterface.name}`, packet, 'observed');
        this.sendIpPacket(source, packet, 0);
        this.drain();
        if (this.exchangeSuccess) pingReplies += 1;
        this.endExchange();
      }
      const success = pingReplies > 0;
      return {
        success,
        events: this.events,
        summary: success
          ? `Reply received from ${request.destinationIp} (${pingReplies}/${count})`
          : `Ping failed: ${this.lastDropReason ?? 'no echo reply was received'}`,
        pingReplies,
        hops,
        error
      };
    }

    if (request.kind === 'tracert') {
      const source = this.deviceById(request.sourceId);
      const sourceInterface = source ? this.configuredInterfaces(source)[0] : undefined;
      if (!source || !sourceInterface) {
        return this.failedOutcome('The source device has no IPv4 address configured.');
      }
      let reached = false;
      for (let ttl = 1; ttl <= 10; ttl += 1) {
        const eventStart = this.events.length;
        this.startExchange();
        const packet = this.buildIcmpPacket(sourceInterface.ip, request.destinationIp, 'echo-request', ttl, 1, ttl);
        this.emit(source, 'packet-originated', 'L3', `Probe with TTL ${ttl}`, `Traceroute probe ${ttl}`, packet, 'observed');
        this.sendIpPacket(source, packet, 0);
        this.drain();
        const expired = this.events.slice(eventStart).find((event) => event.type === 'ttl-expired');
        if (this.exchangeSuccess) {
          const destinationDevice = this.project.devices.find((device) =>
            this.configuredInterfaces(device).some((entry) => entry.ip === request.destinationIp)
          );
          hops.push({ ttl, address: request.destinationIp, deviceName: destinationDevice?.name ?? null, reached: true });
          reached = true;
          pingReplies += 1;
          this.endExchange();
          break;
        }
        if (expired) {
          const router = this.deviceById(expired.deviceId);
          const facing = router
            ? this.configuredInterfaces(router).find((entry) => sameSubnet(entry.ip, sourceInterface.ip, entry.mask))
            : undefined;
          hops.push({
            ttl,
            address: facing?.ip ?? this.configuredInterfaces(router ?? source)[0]?.ip ?? null,
            deviceName: router?.name ?? null,
            reached: false
          });
        } else {
          hops.push({ ttl, address: null, deviceName: null, reached: false });
        }
        this.endExchange();
      }
      return {
        success: reached,
        events: this.events,
        summary: reached
          ? `Trace complete to ${request.destinationIp}`
          : `Trace failed: ${this.lastDropReason ?? 'destination did not answer'}`,
        pingReplies,
        hops,
        error
      };
    }

    if (request.kind === 'dns') {
      const result = this.runDns(request.sourceId, request.domain, request.serverIp);
      return {
        success: result.success,
        events: this.events,
        summary: result.success
          ? `Resolved ${request.domain} to ${this.dnsAddress}`
          : `DNS lookup failed: ${this.lastDropReason ?? 'name could not be resolved'}`,
        dnsAddress: this.dnsAddress,
        pingReplies: 0,
        hops,
        error
      };
    }

    if (request.kind === 'http') {
      let targetIp = request.target;
      if (!isValidIpv4(targetIp)) {
        const hostname = targetIp;
        const resolved = this.runDns(request.sourceId, hostname);
        if (!resolved.success || !this.dnsAddress) {
          return {
            success: false,
            events: this.events,
            summary: `HTTP failed: ${hostname} could not be resolved`,
            pingReplies: 0,
            hops,
            error: this.lastDropReason ?? 'DNS resolution failed'
          };
        }
        targetIp = this.dnsAddress;
      }
      this.startExchange();
      this.originateTcp(request.sourceId, targetIp, 80, 'http', request.path ?? '/');
      this.drain();
      const success = Boolean(this.httpBody !== undefined && this.httpStatus === 200);
      const bodyLength = String(this.httpBody ?? '').length;
      const statusText = this.httpStatus ?? 0;
      this.endExchange();
      return {
        success,
        events: this.events,
        summary: success
          ? `HTTP ${statusText} OK - ${bodyLength} bytes received`
          : `HTTP request failed: ${this.lastDropReason ?? 'no response from the web server'}`,
        httpBody: this.httpBody,
        httpStatus: this.httpStatus,
        pingReplies: 0,
        hops,
        error
      };
    }

    if (request.kind === 'udp') {
      const source = this.deviceById(request.sourceId);
      const sourceInterface = source ? this.configuredInterfaces(source)[0] : undefined;
      if (!source || !sourceInterface) {
        return this.failedOutcome('The source device has no IPv4 address configured.');
      }
      this.startExchange();
      const packet = this.buildUdpPacket(
        sourceInterface.ip,
        request.destinationIp,
        CLIENT_PORT_BASE + 1,
        request.port,
        request.payload
      );
      this.emit(source, 'packet-originated', 'L4', `UDP datagram to ${request.destinationIp}:${request.port}`, request.payload, packet, 'observed');
      this.emit(source, 'udp-send', 'L4', 'Datagram sent without connection setup', 'UDP provides no delivery guarantee', packet, 'observed');
      this.sendIpPacket(source, packet, 0);
      this.drain();
      const success = this.exchangeSuccess;
      this.endExchange();
      return {
        success,
        events: this.events,
        summary: success
          ? `UDP datagram delivered to ${request.destinationIp}:${request.port}`
          : `UDP datagram not delivered: ${this.lastDropReason ?? 'no listener acknowledged it'}`,
        pingReplies: 0,
        hops,
        error
      };
    }

    const source = this.deviceById(request.sourceId);
    const sourceInterface = source ? this.configuredInterfaces(source)[0] : undefined;
    if (!source || !sourceInterface) {
      return this.failedOutcome('The source device has no IPv4 address configured.');
    }
    this.startExchange();
    this.originateTcp(request.sourceId, request.destinationIp, request.port, 'handshake', '/');
    this.drain();
    const success = this.tcpEstablished;
    this.endExchange();
    return {
      success,
      events: this.events,
      summary: success
        ? `TCP connection to ${request.destinationIp}:${request.port} established`
        : `TCP connection failed: ${this.lastDropReason ?? 'connection was not established'}`,
      pingReplies: 0,
      hops,
      error
    };
  }

  private failedOutcome(message: string): SimulationOutcome {
    return {
      success: false,
      events: this.events,
      summary: message,
      pingReplies: 0,
      hops: [],
      error: message
    };
  }

  private runDns(sourceId: string, domain: string, serverIp?: string): { success: boolean } {
    const source = this.deviceById(sourceId);
    if (!source) {
      this.lastDropReason = 'source device does not exist';
      return { success: false };
    }
    const sourceInterface = this.configuredInterfaces(source)[0];
    if (!sourceInterface) {
      this.lastDropReason = 'source device has no IPv4 address';
      return { success: false };
    }
    const dnsServerIp = serverIp || source.dnsServer;
    if (!dnsServerIp) {
      this.lastDropReason = 'no DNS server is configured on the client';
      this.emit(source, 'dns-failure', 'L7', 'DNS server not configured', 'Set a DNS server address on the client', this.buildUdpPacket(sourceInterface.ip, '0.0.0.0', CLIENT_PORT_BASE + 2, 53, domain), 'dropped');
      return { success: false };
    }
    this.startExchange();
    const packet = this.buildDnsQuery(sourceInterface.ip, dnsServerIp, domain, CLIENT_PORT_BASE + 2);
    this.emit(source, 'packet-originated', 'L7', `Resolve ${domain} using ${dnsServerIp}`, 'DNS A record query', packet, 'observed');
    this.sendIpPacket(source, packet, 0);
    this.drain();
    const success = Boolean(this.dnsAddress);
    this.endExchange();
    return { success };
  }

  private originateTcp(sourceId: string, destinationIp: string, port: number, mode: 'http' | 'handshake', path: string): void {
    const source = this.deviceById(sourceId);
    if (!source) {
      this.lastDropReason = 'source device does not exist';
      return;
    }
    const sourceInterface = this.configuredInterfaces(source)[0];
    if (!sourceInterface) {
      this.lastDropReason = 'source device has no IPv4 address';
      return;
    }
    const packet = this.buildTcpPacket({
      srcIp: sourceInterface.ip,
      dstIp: destinationIp,
      srcPort: CLIENT_PORT_BASE + 3,
      dstPort: port,
      flags: ['SYN'],
      seq: 1000,
      ack: 0,
      state: 'SYN_SENT',
      application: { kind: 'tcp-open', mode, path }
    });
    this.emit(source, 'packet-originated', 'L4', `TCP SYN to ${destinationIp}:${port}`, `Opening ${mode === 'http' ? 'an HTTP' : 'a TCP'} connection`, packet, 'observed');
    this.sendIpPacket(source, packet, 0);
  }

  private startExchange(): void {
    this.queue = [];
    this.now = this.timeBase;
    this.pendingByDevice.clear();
    this.arpInFlight.clear();
    this.exchangeSuccess = false;
    this.lastDropReason = null;
  }

  private endExchange(): void {
    const latest = this.events.length > 0 ? this.events[this.events.length - 1].time : this.now;
    this.timeBase = Math.max(latest, this.now) + 5;
  }

  private drain(): void {
    let processed = 0;
    while (this.queue.length > 0) {
      if (processed >= MAX_EVENTS) {
        const device = this.project.devices[0];
        if (device) {
          const packet = this.buildIcmpPacket('0.0.0.0', '0.0.0.0', 'echo-request', 0, 0, 0);
          this.emit(device, 'safeguard', 'L3', 'Event limit reached', 'Runaway forwarding loop stopped', packet, 'dropped');
        }
        this.lastDropReason = 'simulation event limit reached (possible forwarding loop)';
        this.queue = [];
        break;
      }
      this.queue.sort((left, right) => left.time - right.time || left.sequence - right.sequence);
      const task = this.queue.shift();
      if (!task) break;
      processed += 1;
      this.now = task.time;
      if (task.kind === 'arp-timeout') {
        this.handleArpTimeout(task);
        continue;
      }
      const device = this.deviceById(task.deviceId);
      if (!device) continue;
      this.processArrival(device, task.packet, task.ingressInterfaceId, task.edge, task.hops);
    }
  }

  private pushFrame(deviceId: string, packet: Packet, time: number, hops: number, ingressInterfaceId?: string, edge?: EventEdge): void {
    this.sequence += 1;
    this.queue.push({ kind: 'frame', time, sequence: this.sequence, deviceId, packet, ingressInterfaceId, edge, hops });
  }

  private deviceById(id: string): Device | undefined {
    return this.project.devices.find((device) => device.id === id);
  }

  private interfaceFor(device: Device, interfaceId: string) {
    return device.interfaces.find((entry) => entry.id === interfaceId);
  }

  private configuredInterfaces(device: Device) {
    return device.interfaces.filter(
      (entry) => entry.enabled && entry.ip && entry.mask && isValidIpv4(entry.ip) && maskToPrefix(entry.mask) !== null
    );
  }

  private emit(
    device: Device,
    type: SimulationEventType,
    layer: EventLayer,
    summary: string,
    detail: string,
    packet: Packet,
    outcome: EventOutcome,
    edge?: EventEdge
  ): void {
    this.eventSequence += 1;
    this.events.push({
      id: `evt-${this.eventSequence}`,
      time: Math.round(this.now * 100) / 100,
      deviceId: device.id,
      deviceName: device.name,
      type,
      layer,
      summary,
      detail,
      explanation: explainEvent(type, detail),
      packet,
      outcome,
      edge
    });
  }

  private drop(device: Device, packet: Packet, summary: string, detail: string, layer: EventLayer = 'L3'): void {
    this.lastDropReason = summary;
    this.emit(device, 'packet-dropped', layer, summary, detail, packet, 'dropped');
  }

  private processArrival(
    device: Device,
    packet: Packet,
    ingressInterfaceId: string | undefined,
    edge: EventEdge | undefined,
    hops: number
  ): void {
    const ingress = ingressInterfaceId ? this.interfaceFor(device, ingressInterfaceId) : undefined;
    this.emit(
      device,
      'frame-received',
      'L2',
      `${packet.summary} at ${device.name}`,
      ingress ? `Ingress interface ${ingress.name}` : 'Originated locally',
      packet,
      'observed',
      edge
    );
    if (isSwitch(device) || isRepeater(device)) {
      this.processLayer2(device, packet, ingressInterfaceId, hops, edge);
      return;
    }
    if (isRouter(device)) {
      this.processRouter(device, packet, ingressInterfaceId, hops, edge);
      return;
    }
    this.processEndpoint(device, packet, ingressInterfaceId, hops, edge);
  }

  private learnMac(device: Device, mac: string, interfaceId: string, packet: Packet, linkId?: string): void {
    if (!isSwitch(device) && device.kind !== 'wireless-router') return;
    if (isBroadcast(mac)) return;
    let table = this.macTables.get(device.id);
    if (!table) {
      table = new Map();
      this.macTables.set(device.id, table);
    }
    const existing = table.get(mac);
    if (existing && existing.interfaceId === interfaceId && existing.linkId === linkId) return;
    table.set(mac, { interfaceId, learnedAt: this.now, linkId });
    const port = this.interfaceFor(device, interfaceId);
    this.emit(
      device,
      'mac-learned',
      'L2',
      `Learned ${mac} on ${port?.name ?? 'port'}`,
      existing ? 'MAC moved to a new port' : 'New dynamic MAC table entry',
      packet,
      'observed'
    );
  }

  private processLayer2(
    device: Device,
    packet: Packet,
    ingressInterfaceId: string | undefined,
    hops: number,
    edge?: EventEdge
  ): void {
    const ethernet = packet.ethernet;
    if (!ethernet || !ingressInterfaceId) return;
    const ingressLinkId = edge?.linkId;
    this.learnMac(device, ethernet.srcMac, ingressInterfaceId, packet, ingressLinkId);
    const destination = ethernet.dstMac;
    if (isBroadcast(destination)) {
      this.flood(device, packet, ingressInterfaceId, ingressLinkId, hops, 'Broadcast frame flooded');
      return;
    }
    if (isRepeater(device)) {
      this.flood(device, packet, ingressInterfaceId, ingressLinkId, hops, 'Hub repeats frame to every other port');
      return;
    }
    const table = this.macTables.get(device.id);
    const learned = table?.get(destination);
    if (learned) {
      if (learned.interfaceId === ingressInterfaceId && (!learned.linkId || learned.linkId === ingressLinkId)) {
        this.emit(device, 'frame-forwarded', 'L2', 'Frame filtered', `Destination ${destination} is on the ingress port`, packet, 'dropped');
        return;
      }
      const egress = this.interfaceFor(device, learned.interfaceId);
      if (!egress) {
        this.drop(device, packet, 'Learned port no longer exists', destination, 'L2');
        return;
      }
      this.emit(device, 'frame-forwarded', 'L2', `Forwarded to ${egress.name}`, `MAC table hit for ${destination}`, packet, 'forwarded');
      this.transmitFrame(device, egress, packet, hops, learned.linkId ? { onlyLinkId: learned.linkId } : undefined);
      return;
    }
    this.flood(device, packet, ingressInterfaceId, ingressLinkId, hops, `Unknown unicast ${destination} flooded`);
  }

  private flood(
    device: Device,
    packet: Packet,
    ingressInterfaceId: string,
    ingressLinkId: string | undefined,
    hops: number,
    summary: string
  ): void {
    let sent = 0;
    for (const entry of device.interfaces) {
      if (!entry.enabled) continue;
      const links = linksForInterface(this.project.links, entry.id);
      if (links.length === 0) continue;
      if (entry.id === ingressInterfaceId) {
        if (!ingressLinkId) continue;
        if (links.every((link) => link.id === ingressLinkId)) continue;
        sent += this.transmitFrame(device, entry, packet, hops, { excludeLinkId: ingressLinkId });
        continue;
      }
      sent += this.transmitFrame(device, entry, packet, hops);
    }
    if (sent === 0) {
      this.drop(device, packet, 'No active ports to forward the frame', `${device.name} has no other connected ports`, 'L2');
      return;
    }
    this.emit(device, 'frame-forwarded', 'L2', summary, `Copies sent out ${sent} port${sent === 1 ? '' : 's'}`, packet, 'forwarded');
  }

  private transmitFrame(
    device: Device,
    egress: Device['interfaces'][number],
    packet: Packet,
    hops: number,
    options?: { onlyLinkId?: string; excludeLinkId?: string }
  ): number {
    if (hops >= MAX_FRAME_HOPS) {
      this.drop(device, packet, 'Frame hop limit exceeded', 'Possible Layer 2 loop detected', 'L2');
      return 0;
    }
    const links = linksForInterface(this.project.links, egress.id);
    if (links.length === 0) {
      this.drop(device, packet, `${egress.name} is not connected`, 'No cable is attached to the egress interface', 'L1');
      return 0;
    }
    let sent = 0;
    let downReason = '';
    for (const link of links) {
      if (options?.onlyLinkId && link.id !== options.onlyLinkId) continue;
      if (options?.excludeLinkId && link.id === options.excludeLinkId) continue;
      if (!linkIsUp(link, this.project.devices)) {
        downReason = `${egress.name} or a remote interface is disabled`;
        continue;
      }
      const peerEndpoint = otherEndpoint(link, device.id);
      const peerDevice = this.deviceById(peerEndpoint.deviceId);
      if (!peerDevice) {
        downReason = 'The cable references a device that no longer exists';
        continue;
      }
      const latency = link.cable === 'wireless' ? 2 : 1;
      this.pushFrame(peerDevice.id, packet, this.now + latency, hops + 1, peerEndpoint.interfaceId, {
        linkId: link.id,
        fromDeviceId: device.id,
        toDeviceId: peerDevice.id
      });
      sent += 1;
    }
    if (sent === 0) {
      this.drop(device, packet, 'Link is down', downReason || 'No operational link is available on the egress interface', 'L1');
    }
    return sent;
  }

  private encapsulate(packet: Packet, srcMac: string, dstMac: string): Packet {
    return {
      ...packet,
      ethernet: { srcMac, dstMac }
    };
  }

  private sendIpPacket(device: Device, packet: Packet, hops: number): void {
    if (!packet.ip) return;
    if (packet.ip.ttl <= 0) {
      this.emit(device, 'ttl-expired', 'L3', 'TTL expired', `Packet to ${packet.ip.dst} discarded`, packet, 'dropped');
      this.lastDropReason = 'TTL expired';
      return;
    }
    if (isRouter(device)) {
      this.routePacket(device, packet, hops);
      return;
    }
    const configured = this.configuredInterfaces(device);
    if (configured.length === 0) {
      this.drop(device, packet, 'No IPv4 address configured', `${device.name} cannot send traffic without an address`, 'L3');
      return;
    }
    const destination = packet.ip.dst;
    const ownAddress = configured.find((entry) => entry.ip === destination);
    if (ownAddress) {
      this.handleLocalIp(device, packet, ownAddress);
      return;
    }
    const local = configured.find((entry) => sameSubnet(entry.ip, destination, entry.mask));
    let egress = local;
    let nextHopIp = destination;
    if (!local) {
      if (!device.gateway) {
        this.drop(device, packet, 'No default gateway configured', `${destination} is outside every local subnet`, 'L3');
        return;
      }
      const gatewayInterface = configured.find((entry) => sameSubnet(entry.ip, device.gateway, entry.mask));
      if (!gatewayInterface) {
        this.drop(
          device,
          packet,
          'Default gateway is not reachable',
          `${device.gateway} is not inside a subnet configured on ${device.name}`,
          'L3'
        );
        return;
      }
      if (!isValidIpv4(device.gateway)) {
        this.drop(device, packet, 'Default gateway is invalid', device.gateway, 'L3');
        return;
      }
      egress = gatewayInterface;
      nextHopIp = device.gateway;
    }
    if (!egress || !egress.enabled) {
      this.drop(device, packet, 'Egress interface is down', 'Enable the interface before sending traffic', 'L1');
      return;
    }
    this.forwardToNeighbor(device, egress, packet, nextHopIp, hops);
  }

  private routePacket(device: Device, packet: Packet, hops: number): void {
    if (!packet.ip) return;
    const table = buildRoutingTable(device);
    const route = lookupRoute(table, packet.ip.dst);
    if (!route) {
      this.emit(device, 'route-lookup', 'L3', `No route to ${packet.ip.dst}`, 'Destination does not match a connected or static route', packet, 'dropped');
      this.lastDropReason = `no route to ${packet.ip.dst} on ${device.name}`;
      return;
    }
    const ttl = packet.ip.ttl - 1;
    if (ttl <= 0) {
      this.emit(device, 'ttl-expired', 'L3', `TTL expired at ${device.name}`, `Packet to ${packet.ip.dst} discarded`, packet, 'dropped');
      this.lastDropReason = `TTL expired at ${device.name}`;
      return;
    }
    const egress = route.interfaceId ? this.interfaceFor(device, route.interfaceId) : undefined;
    if (!egress || !egress.enabled) {
      this.drop(device, packet, 'Route egress interface is down', `${route.interfaceName ?? 'unknown'} is disabled`, 'L1');
      return;
    }
    const nextHopIp = route.type === 'connected' ? packet.ip.dst : (route.nextHop ?? packet.ip.dst);
    const forwarded: Packet = {
      ...packet,
      ethernet: null,
      ip: { ...packet.ip, ttl }
    };
    this.emit(
      device,
      'route-lookup',
      'L3',
      `Route to ${packet.ip.dst} via ${nextHopIp}`,
      `${route.display}; TTL ${packet.ip.ttl} -> ${ttl}`,
      forwarded,
      'forwarded'
    );
    this.forwardToNeighbor(device, egress, forwarded, nextHopIp, hops);
  }

  private forwardToNeighbor(device: Device, egress: Device['interfaces'][number], packet: Packet, nextHopIp: string, hops: number): void {
    const key = `${device.id}|${nextHopIp}`;
    let cache = this.arpCaches.get(device.id);
    if (!cache) {
      cache = new Map();
      this.arpCaches.set(device.id, cache);
    }
    const resolved = cache.get(nextHopIp);
    if (resolved) {
      this.transmitFrame(device, egress, this.encapsulate(packet, egress.mac, resolved), hops);
      return;
    }
    let pending = this.pendingByDevice.get(device.id);
    if (!pending) {
      pending = [];
      this.pendingByDevice.set(device.id, pending);
    }
    pending.push({ packet, nextHopIp, egressInterfaceId: egress.id, key, hops });
    if (this.arpInFlight.has(key)) return;
    this.arpInFlight.add(key);
    const request = this.buildArpRequest(egress.mac, egress.ip, nextHopIp);
    this.emit(device, 'arp-request', 'L2', `ARP request for ${nextHopIp}`, `Broadcast from ${egress.name}`, request, 'observed');
    this.transmitFrame(device, egress, request, hops);
    this.sequence += 1;
    this.queue.push({
      kind: 'arp-timeout',
      time: this.now + ARP_TIMEOUT_MS,
      sequence: this.sequence,
      deviceId: device.id,
      key
    });
  }

  private handleArpTimeout(task: InternalArpTimeoutTask): void {
    if (!this.arpInFlight.has(task.key)) return;
    this.arpInFlight.delete(task.key);
    const device = this.deviceById(task.deviceId);
    const pending = this.pendingByDevice.get(task.deviceId) ?? [];
    const unresolved = pending.filter((entry) => entry.key === task.key);
    this.pendingByDevice.set(task.deviceId, pending.filter((entry) => entry.key !== task.key));
    if (!device || unresolved.length === 0) return;
    const targetIp = unresolved[0].nextHopIp;
    const packet = unresolved[0].packet;
    this.emit(device, 'arp-timeout', 'L2', `ARP for ${targetIp} timed out`, `No device answered in the broadcast domain`, packet, 'dropped');
    this.lastDropReason = `ARP resolution for ${targetIp} failed`;
  }

  private processWirelessBridge(
    device: Device,
    packet: Packet,
    ingressInterfaceId: string,
    ingressLinkId: string | undefined,
    hops: number
  ): void {
    const ethernet = packet.ethernet;
    if (!ethernet) return;
    this.learnMac(device, ethernet.srcMac, ingressInterfaceId, packet, ingressLinkId);
    const table = this.macTables.get(device.id);
    const learned = table?.get(ethernet.dstMac);
    if (learned?.linkId && learned.interfaceId === ingressInterfaceId) {
      const egress = this.interfaceFor(device, learned.interfaceId);
      if (!egress) return;
      this.emit(device, 'frame-forwarded', 'L2', `Bridged to ${egress.name}`, `Wireless client ${ethernet.dstMac} is on the learned association`, packet, 'forwarded');
      this.transmitFrame(device, egress, packet, hops, { onlyLinkId: learned.linkId });
      return;
    }
    const ingress = this.interfaceFor(device, ingressInterfaceId);
    if (!ingress) return;
    const copies = this.transmitFrame(device, ingress, packet, hops, { excludeLinkId: ingressLinkId });
    if (copies === 0) return;
    this.emit(
      device,
      'frame-forwarded',
      'L2',
      'Bridged across the wireless LAN',
      `Frame forwarded to ${copies} associated client${copies === 1 ? '' : 's'}`,
      packet,
      'forwarded'
    );
  }

  private processRouter(
    device: Device,
    packet: Packet,
    ingressInterfaceId: string | undefined,
    hops: number,
    edge?: EventEdge
  ): void {
    const ethernet = packet.ethernet;
    if (!ethernet) return;
    const targetMac = ethernet.dstMac;
    const broadcast = isBroadcast(targetMac);
    const localInterface = device.interfaces.find((entry) => entry.mac === targetMac);
    const ingress = ingressInterfaceId ? this.interfaceFor(device, ingressInterfaceId) : undefined;
    const wirelessBridge = device.kind === 'wireless-router' && ingress?.media === 'wireless' && Boolean(ingressInterfaceId);
    if (!broadcast && !localInterface) {
      if (wirelessBridge && ingressInterfaceId) {
        this.processWirelessBridge(device, packet, ingressInterfaceId, edge?.linkId, hops);
        return;
      }
      this.drop(device, packet, 'Frame not addressed to this router', `Destination MAC ${targetMac} belongs elsewhere`, 'L2');
      return;
    }
    if (packet.arp) {
      const arp = packet.arp;
      if (arp.operation === 'reply') {
        const owns = device.interfaces.some((entry) => entry.enabled && entry.ip === arp.targetIp);
        if (owns) {
          this.cacheArp(device, arp.senderIp, arp.senderMac);
          this.emit(device, 'arp-reply', 'L2', `ARP reply received for ${arp.senderIp}`, `${arp.senderIp} is at ${arp.senderMac}`, packet, 'delivered');
          this.flushPending(device, arp.senderIp, arp.senderMac);
        } else if (wirelessBridge && ingressInterfaceId) {
          this.processWirelessBridge(device, packet, ingressInterfaceId, edge?.linkId, hops);
        }
        return;
      }
      if (ingress && ingress.enabled && ingress.ip === arp.targetIp) {
        this.cacheArp(device, arp.senderIp, arp.senderMac);
        const reply = this.buildArpReply(ingress.mac, ingress.ip, arp.senderMac, arp.senderIp);
        this.emit(device, 'arp-reply', 'L2', `Replying to ARP for ${ingress.ip}`, `${ingress.name} owns this address`, reply, 'observed');
        this.transmitFrame(device, ingress, reply, hops, edge?.linkId ? { onlyLinkId: edge.linkId } : undefined);
      } else if (wirelessBridge && ingressInterfaceId) {
        this.processWirelessBridge(device, packet, ingressInterfaceId, edge?.linkId, hops);
      }
      return;
    }
    if (!packet.ip) return;
    const ownIp = device.interfaces.find((entry) => entry.enabled && entry.ip === packet.ip?.dst);
    if (ownIp) {
      this.handleLocalIp(device, packet, ownIp);
      return;
    }
    this.routePacket(device, packet, hops);
  }

  private processEndpoint(
    device: Device,
    packet: Packet,
    ingressInterfaceId: string | undefined,
    hops: number,
    edge?: EventEdge
  ): void {
    const ethernet = packet.ethernet;
    if (!ethernet) return;
    const destination = ethernet.dstMac;
    const localInterface = device.interfaces.find((entry) => entry.mac === destination);
    if (!isBroadcast(destination) && !localInterface) {
      this.drop(device, packet, 'Frame not addressed to this host', `Destination MAC ${destination} is not ${device.name}`, 'L2');
      return;
    }
    const ingress = ingressInterfaceId ? this.interfaceFor(device, ingressInterfaceId) : undefined;
    if (packet.arp) {
      const arp = packet.arp;
      if (arp.operation === 'reply') {
        const owns = device.interfaces.some((entry) => entry.enabled && entry.ip === arp.targetIp);
        if (owns) {
          this.cacheArp(device, arp.senderIp, arp.senderMac);
          this.emit(device, 'arp-reply', 'L2', `ARP reply received for ${arp.senderIp}`, `${arp.senderIp} is at ${arp.senderMac}`, packet, 'delivered');
          this.flushPending(device, arp.senderIp, arp.senderMac);
        }
        return;
      }
      if (ingress && ingress.enabled && ingress.ip === arp.targetIp) {
        this.cacheArp(device, arp.senderIp, arp.senderMac);
        const reply = this.buildArpReply(ingress.mac, ingress.ip, arp.senderMac, arp.senderIp);
        this.emit(device, 'arp-reply', 'L2', `Replying to ARP for ${ingress.ip}`, `${ingress.name} answers`, reply, 'observed');
        this.transmitFrame(device, ingress, reply, hops, edge?.linkId ? { onlyLinkId: edge.linkId } : undefined);
      }
      return;
    }
    if (!packet.ip) return;
    const own = device.interfaces.find((entry) => entry.enabled && entry.ip === packet.ip?.dst);
    if (!own) {
      this.drop(device, packet, 'IPv4 destination is not local', `${device.name} is not a router`, 'L3');
      return;
    }
    this.handleLocalIp(device, packet, own);
  }

  private cacheArp(device: Device, address: string, mac: string): void {
    let cache = this.arpCaches.get(device.id);
    if (!cache) {
      cache = new Map();
      this.arpCaches.set(device.id, cache);
    }
    cache.set(address, mac);
  }

  private flushPending(device: Device, address: string, mac: string): void {
    const key = `${device.id}|${address}`;
    this.arpInFlight.delete(key);
    const pending = this.pendingByDevice.get(device.id) ?? [];
    const ready = pending.filter((entry) => entry.nextHopIp === address);
    this.pendingByDevice.set(device.id, pending.filter((entry) => entry.nextHopIp !== address));
    if (ready.length === 0) return;
    this.cacheArp(device, address, mac);
    for (const entry of ready) {
      const egress = this.interfaceFor(device, entry.egressInterfaceId);
      if (!egress) continue;
      this.transmitFrame(device, egress, this.encapsulate(entry.packet, egress.mac, mac), entry.hops);
    }
  }

  private handleLocalIp(device: Device, packet: Packet, localInterface: Device['interfaces'][number]): void {
    if (!packet.ip) return;
    if (packet.protocol === 'ICMP' && packet.icmp) {
      if (packet.icmp.type === 'echo-request') {
        this.emit(device, 'icmp-request', 'L3', `Echo request from ${packet.ip.src}`, `Received on ${localInterface.name}`, packet, 'delivered');
        const reply = this.buildIcmpPacket(localInterface.ip, packet.ip.src, 'echo-reply', 64, packet.icmp.identifier, packet.icmp.sequence);
        this.emit(device, 'icmp-reply', 'L3', 'Echo reply created', `Replying to ${packet.ip.src}`, reply, 'forwarded');
        this.sendIpPacket(device, reply, 0);
        return;
      }
      if (packet.icmp.type === 'echo-reply') {
        this.exchangeSuccess = true;
        this.emit(device, 'icmp-success', 'L3', `Echo reply from ${packet.ip.src}`, `Round trip completed in ${this.now} ms`, packet, 'delivered');
        return;
      }
    }
    if (packet.protocol === 'UDP' && packet.udp) {
      if (packet.udp.dstPort === 53 || packet.application?.kind === 'dns-response') {
        this.handleDnsServer(device, packet, localInterface);
        return;
      }
      if (device.kind === 'server' || device.kind === 'pc' || device.kind === 'laptop') {
        this.exchangeSuccess = true;
        this.emit(device, 'udp-receive', 'L4', `UDP datagram received on port ${packet.udp.dstPort}`, packet.payload, packet, 'delivered');
        return;
      }
      this.emit(device, 'service-unavailable', 'L4', `No UDP listener on port ${packet.udp.dstPort}`, 'Datagram discarded', packet, 'dropped');
      return;
    }
    if (packet.protocol === 'TCP' && packet.tcp) {
      this.handleTcp(device, packet, localInterface);
    }
  }

  private handleDnsServer(device: Device, packet: Packet, localInterface: Device['interfaces'][number]): void {
    const application = packet.application;
    if (application?.kind === 'dns-response') {
      if (application.status === 0 && application.address) {
        this.dnsAddress = application.address;
        this.exchangeSuccess = true;
        this.emit(device, 'dns-response', 'L7', `${application.domain} resolves to ${application.address}`, 'A record received', packet, 'delivered');
      } else {
        this.emit(device, 'dns-failure', 'L7', `${application.domain} could not be resolved`, 'NXDOMAIN response', packet, 'dropped');
        this.lastDropReason = `no A record for ${application.domain}`;
      }
      return;
    }
    if (!device.dnsEnabled) {
      this.emit(device, 'dns-failure', 'L7', 'DNS service is disabled', `${device.name} is not running DNS`, packet, 'dropped');
      this.lastDropReason = 'DNS service not available';
      return;
    }
    const domain = application?.domain ?? '';
    this.emit(device, 'dns-query', 'L7', `DNS query for ${domain}`, `Received on ${localInterface.name}`, packet, 'delivered');
    const record = device.dnsRecords.find((entry) => entry.name.trim().toLowerCase() === domain.trim().toLowerCase());
    if (!record || !isValidIpv4(record.address)) {
      const response = this.buildDnsResponse(localInterface.ip, packet, undefined, domain, 3);
      this.emit(device, 'dns-failure', 'L7', `No A record for ${domain}`, 'Returning NXDOMAIN', response, 'dropped');
      this.sendIpPacket(device, response, 0);
      return;
    }
    const response = this.buildDnsResponse(localInterface.ip, packet, record.address, domain, 0);
    this.emit(device, 'dns-response', 'L7', `${domain} -> ${record.address}`, 'Sending A record response', response, 'forwarded');
    this.sendIpPacket(device, response, 0);
  }

  private handleTcp(device: Device, packet: Packet, localInterface: Device['interfaces'][number]): void {
    const tcp = packet.tcp;
    if (!tcp || !packet.ip) return;
    const application = packet.application;
    const hasFlag = (flag: TcpFlag) => tcp.flags.includes(flag);

    if (hasFlag('RST')) {
      this.emit(device, 'tcp-reset', 'L4', 'Connection reset', `Service refused the connection to port ${tcp.srcPort}`, packet, 'dropped');
      this.lastDropReason = `connection refused on port ${tcp.srcPort}`;
      return;
    }

    if (hasFlag('SYN') && !hasFlag('ACK')) {
      if (application?.kind === 'dns-response') return;
      this.emit(device, 'tcp-syn', 'L4', `SYN received on port ${tcp.dstPort}`, `From ${packet.ip.src}:${tcp.srcPort}`, packet, 'delivered');
      const httpListening = tcp.dstPort === 80 && device.httpEnabled;
      if (!httpListening) {
        this.emit(device, 'service-unavailable', 'L7', `No TCP service on port ${tcp.dstPort}`, `${device.name} is not listening on TCP port ${tcp.dstPort}`, packet, 'dropped');
        this.lastDropReason = `no service listening on port ${tcp.dstPort}`;
        const reset = this.buildTcpPacket({
          srcIp: localInterface.ip,
          dstIp: packet.ip.src,
          srcPort: tcp.dstPort,
          dstPort: tcp.srcPort,
          flags: ['RST', 'ACK'],
          seq: 0,
          ack: tcp.seq + 1,
          state: 'RESET',
          application: { kind: 'tcp-rst' }
        });
        this.sendIpPacket(device, reset, 0);
        return;
      }
      const synAck = this.buildTcpPacket({
        srcIp: localInterface.ip,
        dstIp: packet.ip.src,
        srcPort: tcp.dstPort,
        dstPort: tcp.srcPort,
        flags: ['SYN', 'ACK'],
        seq: 2000,
        ack: tcp.seq + 1,
        state: 'SYN_RECEIVED',
        application: application ?? { kind: 'tcp-open', mode: 'http', path: '/' }
      });
      this.emit(device, 'tcp-syn-ack', 'L4', 'SYN-ACK sent', `Initial server sequence 2000`, synAck, 'forwarded');
      this.sendIpPacket(device, synAck, 0);
      return;
    }

    if (hasFlag('SYN') && hasFlag('ACK')) {
      this.tcpEstablished = true;
      this.exchangeSuccess = true;
      this.emit(device, 'tcp-syn-ack', 'L4', 'SYN-ACK received', `Server sequence ${tcp.seq}`, packet, 'delivered');
      this.emit(device, 'tcp-established', 'L4', 'Connection ESTABLISHED', 'Three-way handshake complete', packet, 'delivered');
      if (application?.mode === 'http') {
        const request = this.buildTcpPacket({
          srcIp: packet.ip.dst,
          dstIp: packet.ip.src,
          srcPort: tcp.dstPort,
          dstPort: tcp.srcPort,
          flags: ['ACK', 'PSH'],
          seq: tcp.ack,
          ack: tcp.seq + 1,
          state: 'ESTABLISHED',
          application: { kind: 'http-request', path: application.path ?? '/', mode: 'http' }
        });
        this.emit(device, 'http-request', 'L7', `GET ${application.path ?? '/'}`, `Host: ${packet.ip.src}`, request, 'observed');
        this.sendIpPacket(device, request, 0);
      } else {
        const ack = this.buildTcpPacket({
          srcIp: packet.ip.dst,
          dstIp: packet.ip.src,
          srcPort: tcp.dstPort,
          dstPort: tcp.srcPort,
          flags: ['ACK'],
          seq: tcp.ack,
          ack: tcp.seq + 1,
          state: 'ESTABLISHED',
          application: { kind: 'tcp-close' }
        });
        this.emit(device, 'tcp-ack', 'L4', 'Handshake acknowledged', 'TCP demo connection established', ack, 'forwarded');
        this.sendIpPacket(device, ack, 0);
      }
      return;
    }

    if (application?.kind === 'http-request') {
      this.emit(device, 'http-request', 'L7', `GET ${application.path ?? '/'}`, `Request received on port ${tcp.dstPort}`, packet, 'delivered');
      if (!device.httpEnabled) {
        this.emit(device, 'service-unavailable', 'L7', 'HTTP service is disabled', 'No web content available', packet, 'dropped');
        this.lastDropReason = 'HTTP service is disabled';
        return;
      }
      const response = this.buildTcpPacket({
        srcIp: localInterface.ip,
        dstIp: packet.ip.src,
        srcPort: tcp.dstPort,
        dstPort: tcp.srcPort,
        flags: ['ACK', 'PSH'],
        seq: tcp.ack,
        ack: tcp.seq + 1,
        state: 'ESTABLISHED',
        application: { kind: 'http-response', status: 200, body: device.httpContent, path: application.path }
      });
      this.emit(device, 'http-response', 'L7', 'HTTP 200 OK', `Sending ${device.httpContent.length} bytes`, response, 'forwarded');
      this.sendIpPacket(device, response, 0);
      return;
    }

    if (application?.kind === 'http-response') {
      this.httpStatus = application.status;
      this.httpBody = application.body;
      if (application.status === 200) {
        this.exchangeSuccess = true;
        this.emit(device, 'http-response', 'L7', 'HTTP 200 OK received', `${application.body?.length ?? 0} bytes rendered`, packet, 'delivered');
      } else {
        this.emit(device, 'http-response', 'L7', `HTTP ${application.status}`, 'Request failed', packet, 'dropped');
        this.lastDropReason = `HTTP status ${application.status}`;
      }
      const fin = this.buildTcpPacket({
        srcIp: packet.ip.dst,
        dstIp: packet.ip.src,
        srcPort: tcp.dstPort,
        dstPort: tcp.srcPort,
        flags: ['FIN'],
        seq: tcp.ack,
        ack: tcp.seq + 1,
        state: 'FIN_WAIT',
        application: { kind: 'tcp-close' }
      });
      this.emit(device, 'tcp-fin', 'L4', 'Connection teardown started', 'FIN sent', fin, 'forwarded');
      this.sendIpPacket(device, fin, 0);
      return;
    }

    if (hasFlag('FIN') && hasFlag('ACK')) {
      this.emit(device, 'tcp-closed', 'L4', 'Connection CLOSED', 'Final acknowledgment sent', packet, 'delivered');
      const ack = this.buildTcpPacket({
        srcIp: packet.ip.dst,
        dstIp: packet.ip.src,
        srcPort: tcp.dstPort,
        dstPort: tcp.srcPort,
        flags: ['ACK'],
        seq: tcp.ack,
        ack: tcp.seq + 1,
        state: 'CLOSED',
        application: { kind: 'tcp-close' }
      });
      this.sendIpPacket(device, ack, 0);
      return;
    }

    if (hasFlag('FIN')) {
      this.emit(device, 'tcp-fin', 'L4', 'FIN received', 'Remote side is closing the connection', packet, 'delivered');
      const finAck = this.buildTcpPacket({
        srcIp: localInterface.ip,
        dstIp: packet.ip.src,
        srcPort: tcp.dstPort,
        dstPort: tcp.srcPort,
        flags: ['FIN', 'ACK'],
        seq: tcp.ack,
        ack: tcp.seq + 1,
        state: 'CLOSED',
        application: { kind: 'tcp-close' }
      });
      this.emit(device, 'tcp-closed', 'L4', 'Connection closed by server', 'FIN-ACK sent', finAck, 'forwarded');
      this.sendIpPacket(device, finAck, 0);
      return;
    }

    this.emit(device, 'tcp-ack', 'L4', `ACK ${tcp.ack}`, 'Acknowledgment processed', packet, 'delivered');
  }

  private buildIcmpPacket(
    sourceIp: string,
    destinationIp: string,
    type: 'echo-request' | 'echo-reply',
    ttl: number,
    identifier: number,
    sequence: number
  ): Packet {
    const packet: Packet = {
      id: newPacketId(),
      protocol: 'ICMP',
      ethernet: null,
      ip: { src: sourceIp, dst: destinationIp, ttl, protocol: 'ICMP' },
      arp: null,
      tcp: null,
      udp: null,
      icmp: { type, identifier, sequence },
      application: { kind: 'icmp' },
      payload: type === 'echo-request' ? 'NetLab echo request payload' : 'NetLab echo reply payload',
      summary: '',
      sizeBytes: 74
    };
    packet.summary = packetSummary(packet);
    return packet;
  }

  private buildArpRequest(sourceMac: string, sourceIp: string, targetIp: string): Packet {
    const packet: Packet = {
      id: newPacketId(),
      protocol: 'ARP',
      ethernet: { srcMac: sourceMac, dstMac: BROADCAST_MAC },
      ip: null,
      arp: { operation: 'request', senderMac: sourceMac, senderIp: sourceIp, targetMac: BROADCAST_MAC, targetIp },
      tcp: null,
      udp: null,
      icmp: null,
      application: null,
      payload: `Who has ${targetIp}? Tell ${sourceIp}`,
      summary: '',
      sizeBytes: 42
    };
    packet.summary = packetSummary(packet);
    return packet;
  }

  private buildArpReply(sourceMac: string, sourceIp: string, targetMac: string, targetIp: string): Packet {
    const packet: Packet = {
      id: newPacketId(),
      protocol: 'ARP',
      ethernet: { srcMac: sourceMac, dstMac: targetMac },
      ip: null,
      arp: { operation: 'reply', senderMac: sourceMac, senderIp: sourceIp, targetMac, targetIp },
      tcp: null,
      udp: null,
      icmp: null,
      application: null,
      payload: `${sourceIp} is at ${sourceMac}`,
      summary: '',
      sizeBytes: 42
    };
    packet.summary = packetSummary(packet);
    return packet;
  }

  private buildUdpPacket(sourceIp: string, destinationIp: string, sourcePort: number, destinationPort: number, payload: string, application?: ApplicationData): Packet {
    const packet: Packet = {
      id: newPacketId(),
      protocol: 'UDP',
      ethernet: null,
      ip: { src: sourceIp, dst: destinationIp, ttl: 64, protocol: 'UDP' },
      arp: null,
      tcp: null,
      udp: { srcPort: sourcePort, dstPort: destinationPort },
      icmp: null,
      application: application ?? { kind: 'udp-datagram' },
      payload,
      summary: '',
      sizeBytes: 42 + payload.length
    };
    packet.summary = packetSummary(packet);
    return packet;
  }

  private buildDnsQuery(sourceIp: string, destinationIp: string, domain: string, sourcePort: number): Packet {
    return this.buildUdpPacket(sourceIp, destinationIp, sourcePort, 53, `A? ${domain}`, {
      kind: 'dns-query',
      domain
    });
  }

  private buildDnsResponse(serverIp: string, query: Packet, address: string | undefined, domain: string, status: number): Packet {
    return this.buildUdpPacket(
      serverIp,
      query.ip?.src ?? '0.0.0.0',
      53,
      query.udp?.srcPort ?? 0,
      status === 0 ? `${domain} A ${address}` : `${domain} NXDOMAIN`,
      {
        kind: 'dns-response',
        domain,
        address,
        status
      }
    );
  }

  private buildTcpPacket(options: {
    srcIp: string;
    dstIp: string;
    srcPort: number;
    dstPort: number;
    flags: TcpFlag[];
    seq: number;
    ack: number;
    state: NonNullable<Packet['tcp']>['state'];
    application: ApplicationData;
  }): Packet {
    const packet: Packet = {
      id: newPacketId(),
      protocol: 'TCP',
      ethernet: null,
      ip: { src: options.srcIp, dst: options.dstIp, ttl: 64, protocol: 'TCP' },
      arp: null,
      tcp: {
        srcPort: options.srcPort,
        dstPort: options.dstPort,
        flags: options.flags,
        seq: options.seq,
        ack: options.ack,
        state: options.state
      },
      udp: null,
      icmp: null,
      application: options.application,
      payload: options.application.kind === 'http-request' ? `GET ${options.application.path ?? '/'} HTTP/1.1` : options.application.kind,
      summary: '',
      sizeBytes: 54
    };
    packet.summary = packetSummary(packet);
    return packet;
  }
}

export { buildRoutingTable };
