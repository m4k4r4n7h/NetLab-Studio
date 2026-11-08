import type {
  CableType,
  Device,
  DeviceCategory,
  DeviceInterface,
  DeviceKind,
  NetworkLink,
  Project,
  ProjectSettings
} from '../types';
import { createId, generateMac } from '../utils/id';

export interface PortTemplate {
  name: string;
  media: 'ethernet' | 'wireless';
}

export interface DeviceDefinition {
  kind: DeviceKind;
  label: string;
  category: DeviceCategory;
  description: string;
  capabilities: string[];
  ports: PortTemplate[];
}

export const DEVICE_DEFINITIONS: Record<DeviceKind, DeviceDefinition> = {
  router: {
    kind: 'router',
    label: 'Router',
    category: 'network',
    description: 'Layer 3 device that forwards IPv4 packets between networks.',
    capabilities: ['IPv4 forwarding', 'Connected and static routes', 'Routing table', 'Default gateway'],
    ports: [
      { name: 'GigabitEthernet0/0', media: 'ethernet' },
      { name: 'GigabitEthernet0/1', media: 'ethernet' },
      { name: 'GigabitEthernet0/2', media: 'ethernet' }
    ]
  },
  switch: {
    kind: 'switch',
    label: 'Switch',
    category: 'network',
    description: 'Layer 2 device that learns MAC addresses and forwards Ethernet frames.',
    capabilities: ['MAC learning', 'MAC address table', 'Frame forwarding', 'Unknown unicast flooding'],
    ports: Array.from({ length: 8 }, (_, index) => ({
      name: `FastEthernet0/${index + 1}`,
      media: 'ethernet' as const
    }))
  },
  hub: {
    kind: 'hub',
    label: 'Hub',
    category: 'network',
    description: 'Passive repeater that copies every signal to all other ports.',
    capabilities: ['Signal repetition', 'Shared collision domain'],
    ports: Array.from({ length: 4 }, (_, index) => ({
      name: `Port${index + 1}`,
      media: 'ethernet' as const
    }))
  },
  'wireless-router': {
    kind: 'wireless-router',
    label: 'Wireless Router',
    category: 'network',
    description: 'Router with a wireless LAN interface for client associations.',
    capabilities: ['Wireless clients', 'LAN interfaces', 'IPv4 routing'],
    ports: [
      { name: 'Internet0', media: 'ethernet' },
      { name: 'Ethernet1', media: 'ethernet' },
      { name: 'Ethernet2', media: 'ethernet' },
      { name: 'wlan0', media: 'wireless' }
    ]
  },
  'access-point': {
    kind: 'access-point',
    label: 'Access Point',
    category: 'network',
    description: 'Bridges wireless clients onto a wired LAN segment.',
    capabilities: ['Wireless LAN connectivity', 'Layer 2 bridging'],
    ports: [
      { name: 'Ethernet0', media: 'ethernet' },
      { name: 'wlan0', media: 'wireless' }
    ]
  },
  pc: {
    kind: 'pc',
    label: 'PC',
    category: 'end',
    description: 'Desktop computer with IPv4 configuration, terminal, and browser.',
    capabilities: ['IPv4 configuration', 'Ping and tracert', 'DNS lookup', 'Web browser', 'Command terminal'],
    ports: [
      { name: 'Ethernet0', media: 'ethernet' },
      { name: 'wlan0', media: 'wireless' }
    ]
  },
  laptop: {
    kind: 'laptop',
    label: 'Laptop',
    category: 'end',
    description: 'Portable computer with wired and wireless connectivity.',
    capabilities: ['IPv4 configuration', 'Wireless connectivity', 'Command terminal', 'Web browser'],
    ports: [
      { name: 'Ethernet0', media: 'ethernet' },
      { name: 'wlan0', media: 'wireless' }
    ]
  },
  server: {
    kind: 'server',
    label: 'Server',
    category: 'end',
    description: 'Hosts DNS and HTTP services with static IPv4 configuration.',
    capabilities: ['Static IPv4', 'DNS service', 'HTTP service', 'Terminal'],
    ports: [
      { name: 'Ethernet0', media: 'ethernet' },
      { name: 'Ethernet1', media: 'ethernet' }
    ]
  },
  printer: {
    kind: 'printer',
    label: 'Printer',
    category: 'end',
    description: 'Network printer with wired and wireless connectivity.',
    capabilities: ['IPv4 configuration', 'Network connectivity'],
    ports: [
      { name: 'Ethernet0', media: 'ethernet' },
      { name: 'wlan0', media: 'wireless' }
    ]
  },
  'patch-panel': {
    kind: 'patch-panel',
    label: 'Patch Panel',
    category: 'component',
    description: 'Passive cabling component that repeats signals between ports.',
    capabilities: ['Structured cabling', 'Passive connection point'],
    ports: Array.from({ length: 8 }, (_, index) => ({
      name: `Port${index + 1}`,
      media: 'ethernet' as const
    }))
  }
};

export const CATEGORY_LABELS: Record<DeviceCategory, string> = {
  network: 'Network Devices',
  end: 'End Devices',
  component: 'Components'
};

export const CABLE_DEFINITIONS: Record<CableType, { label: string; description: string; shortLabel: string }> = {
  'copper-straight-through': {
    label: 'Copper Straight-Through',
    shortLabel: 'Straight',
    description: 'Standard Ethernet patch cable between unlike device classes.'
  },
  'copper-crossover': {
    label: 'Copper Crossover',
    shortLabel: 'Crossover',
    description: 'Ethernet cable historically used between like device classes.'
  },
  fiber: {
    label: 'Fiber',
    shortLabel: 'Fiber',
    description: 'Optical uplink between Ethernet interfaces.'
  },
  wireless: {
    label: 'Wireless',
    shortLabel: 'Wireless',
    description: 'Wireless association between a client and a wireless access interface.'
  }
};

export const DEFAULT_HTTP_CONTENT = `<!doctype html>
<html>
<head><title>NetLab Web Server</title></head>
<body>
<h1>NetLab Web Server</h1>
<p>This page is served by the simulated HTTP service running inside NetLab Studio.</p>
<p>Configure this content in the device inspector.</p>
</body>
</html>`;

export function defaultProjectSettings(): ProjectSettings {
  return {
    gridSize: 20,
    showGrid: true,
    showLabels: true,
    snapToGrid: false,
    learningMode: true,
    autosave: true,
    showPacketAnimation: true
  };
}

function buildInterface(deviceId: string, template: PortTemplate, index: number): DeviceInterface {
  return {
    id: `if-${deviceId}-${index}`,
    name: template.name,
    mac: generateMac(deviceId, index),
    media: template.media,
    enabled: true,
    ip: '',
    mask: ''
  };
}

export function createDevice(
  kind: DeviceKind,
  options: { id?: string; name: string; x: number; y: number }
): Device {
  const id = options.id ?? createId('dev');
  const definition = DEVICE_DEFINITIONS[kind];
  return {
    id,
    name: options.name,
    kind,
    x: options.x,
    y: options.y,
    interfaces: definition.ports.map((port, index) => buildInterface(id, port, index)),
    gateway: '',
    dnsServer: '',
    staticRoutes: [],
    dnsEnabled: false,
    dnsRecords: [],
    httpEnabled: false,
    httpContent: DEFAULT_HTTP_CONTENT,
    httpsEnabled: false,
    notes: ''
  };
}

export function createProject(
  name: string,
  devices: Device[] = [],
  links: NetworkLink[] = [],
  settings: Partial<ProjectSettings> = {}
): Project {
  const now = Date.now();
  return {
    format: 'netlab-studio-project',
    version: 1,
    id: createId('proj'),
    name,
    createdAt: now,
    updatedAt: now,
    notes: '',
    devices,
    links,
    settings: { ...defaultProjectSettings(), ...settings }
  };
}

export function createLink(
  a: { deviceId: string; interfaceId: string },
  b: { deviceId: string; interfaceId: string },
  cable: CableType,
  id?: string
): NetworkLink {
  return { id: id ?? createId('link'), cable, a, b };
}

export function nextDeviceName(kind: DeviceKind, devices: Device[]): string {
  const base = DEVICE_DEFINITIONS[kind].label.replace(/\s+/g, '');
  const used = new Set(devices.map((device) => device.name));
  let counter = 0;
  while (used.has(`${base}${counter}`)) counter += 1;
  return `${base}${counter}`;
}

export function interfaceByDevice(devices: Device[], deviceId: string): Device | undefined {
  return devices.find((device) => device.id === deviceId);
}

export function findEndpointInterface(devices: Device[], deviceId: string, interfaceId: string): DeviceInterface | undefined {
  return interfaceByDevice(devices, deviceId)?.interfaces.find((entry) => entry.id === interfaceId);
}

export function primaryInterface(device: Device): DeviceInterface | undefined {
  return (
    device.interfaces.find((entry) => entry.media === 'ethernet' && entry.ip) ??
    device.interfaces.find((entry) => entry.ip) ??
    device.interfaces.find((entry) => entry.media === 'ethernet') ??
    device.interfaces[0]
  );
}
