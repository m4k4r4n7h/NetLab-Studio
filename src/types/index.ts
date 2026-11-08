export type DeviceKind =
  | 'router'
  | 'switch'
  | 'hub'
  | 'wireless-router'
  | 'access-point'
  | 'pc'
  | 'laptop'
  | 'server'
  | 'printer'
  | 'patch-panel';

export type CableType =
  | 'copper-straight-through'
  | 'copper-crossover'
  | 'fiber'
  | 'wireless';

export type PortMedia = 'ethernet' | 'wireless';

export type DeviceCategory = 'network' | 'end' | 'component';

export interface DeviceInterface {
  id: string;
  name: string;
  mac: string;
  media: PortMedia;
  enabled: boolean;
  ip: string;
  mask: string;
}

export interface StaticRoute {
  id: string;
  network: string;
  mask: string;
  nextHop: string;
}

export interface DnsRecord {
  id: string;
  name: string;
  address: string;
}

export interface Device {
  id: string;
  name: string;
  kind: DeviceKind;
  x: number;
  y: number;
  interfaces: DeviceInterface[];
  gateway: string;
  dnsServer: string;
  staticRoutes: StaticRoute[];
  dnsEnabled: boolean;
  dnsRecords: DnsRecord[];
  httpEnabled: boolean;
  httpContent: string;
  httpsEnabled: boolean;
  notes: string;
}

export interface LinkEndpoint {
  deviceId: string;
  interfaceId: string;
}

export interface NetworkLink {
  id: string;
  cable: CableType;
  a: LinkEndpoint;
  b: LinkEndpoint;
}

export interface ProjectSettings {
  gridSize: number;
  showGrid: boolean;
  showLabels: boolean;
  snapToGrid: boolean;
  learningMode: boolean;
  autosave: boolean;
  showPacketAnimation: boolean;
}

export interface Project {
  format: 'netlab-studio-project';
  version: number;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  notes: string;
  devices: Device[];
  links: NetworkLink[];
  settings: ProjectSettings;
}

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  deviceCount: number;
  linkCount: number;
}

export type Tool = 'select' | 'move' | 'connect';

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface Point {
  x: number;
  y: number;
}
