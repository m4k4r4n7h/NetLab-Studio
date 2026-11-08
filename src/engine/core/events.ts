import type { Packet } from './packet';

export type SimulationEventType =
  | 'packet-originated'
  | 'frame-received'
  | 'frame-forwarded'
  | 'mac-learned'
  | 'arp-request'
  | 'arp-reply'
  | 'arp-timeout'
  | 'route-lookup'
  | 'router-forwarded'
  | 'ttl-expired'
  | 'packet-dropped'
  | 'icmp-request'
  | 'icmp-reply'
  | 'icmp-success'
  | 'dns-query'
  | 'dns-response'
  | 'dns-failure'
  | 'tcp-syn'
  | 'tcp-syn-ack'
  | 'tcp-established'
  | 'tcp-ack'
  | 'tcp-fin'
  | 'tcp-closed'
  | 'tcp-reset'
  | 'http-request'
  | 'http-response'
  | 'udp-send'
  | 'udp-receive'
  | 'service-unavailable'
  | 'safeguard';

export type EventLayer = 'L1' | 'L2' | 'L3' | 'L4' | 'L7';

export type EventOutcome = 'observed' | 'forwarded' | 'delivered' | 'dropped';

export interface EventEdge {
  linkId: string;
  fromDeviceId: string;
  toDeviceId: string;
}

export interface SimulationEvent {
  id: string;
  time: number;
  deviceId: string;
  deviceName: string;
  type: SimulationEventType;
  layer: EventLayer;
  summary: string;
  detail: string;
  explanation: string;
  packet: Packet;
  outcome: EventOutcome;
  edge?: EventEdge;
}

export const EVENT_LABELS: Record<SimulationEventType, string> = {
  'packet-originated': 'Origin',
  'frame-received': 'Frame received',
  'frame-forwarded': 'Frame forwarded',
  'mac-learned': 'MAC learned',
  'arp-request': 'ARP request',
  'arp-reply': 'ARP reply',
  'arp-timeout': 'ARP timeout',
  'route-lookup': 'Route lookup',
  'router-forwarded': 'Router forwarded',
  'ttl-expired': 'TTL expired',
  'packet-dropped': 'Dropped',
  'icmp-request': 'ICMP echo request',
  'icmp-reply': 'ICMP echo reply',
  'icmp-success': 'Echo reply received',
  'dns-query': 'DNS query',
  'dns-response': 'DNS response',
  'dns-failure': 'DNS failure',
  'tcp-syn': 'TCP SYN',
  'tcp-syn-ack': 'TCP SYN-ACK',
  'tcp-established': 'TCP established',
  'tcp-ack': 'TCP ACK',
  'tcp-fin': 'TCP FIN',
  'tcp-closed': 'TCP closed',
  'tcp-reset': 'TCP reset',
  'http-request': 'HTTP request',
  'http-response': 'HTTP response',
  'udp-send': 'UDP datagram sent',
  'udp-receive': 'UDP datagram received',
  'service-unavailable': 'Service unavailable',
  safeguard: 'Simulation safeguard'
};
