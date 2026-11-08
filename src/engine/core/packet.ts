export type PacketProtocol = 'ARP' | 'ICMP' | 'TCP' | 'UDP';

export type IpProtocol = 'ICMP' | 'TCP' | 'UDP';

export type TcpFlag = 'SYN' | 'ACK' | 'PSH' | 'FIN' | 'RST';

export interface EthernetHeader {
  srcMac: string;
  dstMac: string;
}

export interface Ipv4Header {
  src: string;
  dst: string;
  ttl: number;
  protocol: IpProtocol;
}

export interface TcpHeader {
  srcPort: number;
  dstPort: number;
  flags: TcpFlag[];
  seq: number;
  ack: number;
  state: 'SYN_SENT' | 'SYN_RECEIVED' | 'ESTABLISHED' | 'FIN_WAIT' | 'CLOSED' | 'RESET';
}

export interface UdpHeader {
  srcPort: number;
  dstPort: number;
}

export interface IcmpHeader {
  type: 'echo-request' | 'echo-reply' | 'time-exceeded' | 'port-unreachable';
  identifier: number;
  sequence: number;
}

export interface ArpHeader {
  operation: 'request' | 'reply';
  senderMac: string;
  senderIp: string;
  targetMac: string;
  targetIp: string;
}

export type ApplicationKind =
  | 'icmp'
  | 'dns-query'
  | 'dns-response'
  | 'tcp-open'
  | 'http-request'
  | 'http-response'
  | 'tcp-close'
  | 'udp-datagram'
  | 'tcp-rst';

export interface ApplicationData {
  kind: ApplicationKind;
  mode?: 'http' | 'handshake';
  domain?: string;
  path?: string;
  status?: number;
  body?: string;
  address?: string;
  message?: string;
}

export interface Packet {
  id: string;
  protocol: PacketProtocol;
  ethernet: EthernetHeader | null;
  ip: Ipv4Header | null;
  arp: ArpHeader | null;
  tcp: TcpHeader | null;
  udp: UdpHeader | null;
  icmp: IcmpHeader | null;
  application: ApplicationData | null;
  payload: string;
  summary: string;
  sizeBytes: number;
}

let packetCounter = 0;

export function newPacketId(): string {
  packetCounter += 1;
  return `pkt-${Date.now().toString(36)}-${packetCounter}`;
}

export function packetSummary(packet: Packet): string {
  if (packet.protocol === 'ARP' && packet.arp) {
    return `ARP ${packet.arp.operation} ${packet.arp.targetIp}`;
  }
  if (packet.protocol === 'ICMP' && packet.icmp) {
    return `ICMP ${packet.icmp.type === 'echo-request' ? 'echo request' : packet.icmp.type === 'echo-reply' ? 'echo reply' : packet.icmp.type}`;
  }
  if (packet.protocol === 'TCP' && packet.tcp) {
    return `TCP [${packet.tcp.flags.join(', ')}] ${packet.tcp.srcPort} -> ${packet.tcp.dstPort}`;
  }
  if (packet.protocol === 'UDP' && packet.udp) {
    return `UDP ${packet.udp.srcPort} -> ${packet.udp.dstPort}`;
  }
  return packet.protocol;
}

export interface PacketLayers {
  frame: string[];
  network: string[];
  transport: string[];
  application: string[];
}

export function packetLayers(packet: Packet): PacketLayers {
  const frame: string[] = [];
  const network: string[] = [];
  const transport: string[] = [];
  const application: string[] = [];
  if (packet.ethernet) {
    frame.push(`Source MAC: ${packet.ethernet.srcMac}`, `Destination MAC: ${packet.ethernet.dstMac}`);
  }
  if (packet.protocol === 'ARP' && packet.arp) {
    frame.push(`ARP operation: ${packet.arp.operation}`);
    network.push(
      `Sender MAC: ${packet.arp.senderMac}`,
      `Sender IP: ${packet.arp.senderIp}`,
      `Target MAC: ${packet.arp.targetMac}`,
      `Target IP: ${packet.arp.targetIp}`
    );
  }
  if (packet.ip) {
    network.push(
      `Source IP: ${packet.ip.src}`,
      `Destination IP: ${packet.ip.dst}`,
      `TTL: ${packet.ip.ttl}`,
      `Protocol: ${packet.ip.protocol}`
    );
  }
  if (packet.icmp) {
    transport.push(`Type: ${packet.icmp.type}`, `Identifier: ${packet.icmp.identifier}`, `Sequence: ${packet.icmp.sequence}`);
  }
  if (packet.tcp) {
    transport.push(
      `Source port: ${packet.tcp.srcPort}`,
      `Destination port: ${packet.tcp.dstPort}`,
      `Flags: ${packet.tcp.flags.join(', ')}`,
      `Sequence: ${packet.tcp.seq}`,
      `Acknowledgment: ${packet.tcp.ack}`,
      `State: ${packet.tcp.state}`
    );
  }
  if (packet.udp) {
    transport.push(`Source port: ${packet.udp.srcPort}`, `Destination port: ${packet.udp.dstPort}`);
  }
  if (packet.application) {
    application.push(`Application: ${packet.application.kind}`);
    if (packet.application.domain) application.push(`Domain: ${packet.application.domain}`);
    if (packet.application.path) application.push(`Path: ${packet.application.path}`);
    if (packet.application.status !== undefined) application.push(`Status: ${packet.application.status}`);
    if (packet.application.address) application.push(`Answer: ${packet.application.address}`);
  }
  if (packet.payload) application.push(`Payload: ${packet.payload}`);
  return { frame, network, transport, application };
}
