import type { CableType, Device, DeviceInterface, NetworkLink } from '../types';

export interface ConnectionValidation {
  valid: boolean;
  error?: string;
  warning?: string;
}

export const DEVICE_CLASS: Record<Device['kind'], 'dte' | 'dce'> = {
  router: 'dce',
  switch: 'dce',
  hub: 'dce',
  'wireless-router': 'dce',
  'access-point': 'dce',
  pc: 'dte',
  laptop: 'dte',
  server: 'dte',
  printer: 'dte',
  'patch-panel': 'dce'
};

export function isWirelessAccessDevice(device: Device): boolean {
  return device.kind === 'access-point' || device.kind === 'wireless-router';
}

export function cableSupportsMedia(cable: CableType, media: DeviceInterface['media']): boolean {
  return cable === 'wireless' ? media === 'wireless' : media === 'ethernet';
}

export function interfaceHasLink(links: NetworkLink[], interfaceId: string): boolean {
  return links.some((link) => link.a.interfaceId === interfaceId || link.b.interfaceId === interfaceId);
}

export function validateConnection(
  devices: Device[],
  links: NetworkLink[],
  deviceAId: string,
  interfaceAId: string,
  deviceBId: string,
  interfaceBId: string,
  cable: CableType
): ConnectionValidation {
  if (deviceAId === deviceBId) {
    return { valid: false, error: 'A device cannot be connected to itself.' };
  }
  const deviceA = devices.find((device) => device.id === deviceAId);
  const deviceB = devices.find((device) => device.id === deviceBId);
  if (!deviceA || !deviceB) {
    return { valid: false, error: 'Both devices must exist in the project.' };
  }
  const interfaceA = deviceA.interfaces.find((entry) => entry.id === interfaceAId);
  const interfaceB = deviceB.interfaces.find((entry) => entry.id === interfaceBId);
  if (!interfaceA || !interfaceB) {
    return { valid: false, error: 'Both interfaces must exist on their devices.' };
  }
  if (!interfaceA.enabled || !interfaceB.enabled) {
    return { valid: false, error: 'Both interfaces must be administratively enabled before cabling.' };
  }
  const allowsMultipleA = interfaceA.media === 'wireless' && isWirelessAccessDevice(deviceA);
  const allowsMultipleB = interfaceB.media === 'wireless' && isWirelessAccessDevice(deviceB);
  if (!allowsMultipleA && interfaceHasLink(links, interfaceAId)) {
    return { valid: false, error: `${deviceA.name} ${interfaceA.name} already has a cable.` };
  }
  if (!allowsMultipleB && interfaceHasLink(links, interfaceBId)) {
    return { valid: false, error: `${deviceB.name} ${interfaceB.name} already has a cable.` };
  }
  if (links.some((link) => (
    (link.a.deviceId === deviceAId && link.b.deviceId === deviceBId) ||
    (link.a.deviceId === deviceBId && link.b.deviceId === deviceAId)
  ))) {
    return { valid: false, error: 'These devices are already connected by a cable.' };
  }
  if (!cableSupportsMedia(cable, interfaceA.media)) {
    return { valid: false, error: `${interfaceA.name} does not support ${cable} cabling.` };
  }
  if (!cableSupportsMedia(cable, interfaceB.media)) {
    return { valid: false, error: `${interfaceB.name} does not support ${cable} cabling.` };
  }
  if (cable === 'wireless') {
    if (!isWirelessAccessDevice(deviceA) && !isWirelessAccessDevice(deviceB)) {
      return { valid: false, error: 'Wireless links require an access point or wireless router on one side.' };
    }
    if (isWirelessAccessDevice(deviceA) && isWirelessAccessDevice(deviceB)) {
      return { valid: false, error: 'Two wireless access devices cannot associate with each other.' };
    }
  }
  if (cable === 'copper-straight-through' && DEVICE_CLASS[deviceA.kind] === DEVICE_CLASS[deviceB.kind]) {
    return {
      valid: true,
      warning: 'Both devices are the same class. Modern interfaces auto-detect the pinout; a crossover cable is traditionally used here.'
    };
  }
  if (cable === 'copper-crossover' && DEVICE_CLASS[deviceA.kind] !== DEVICE_CLASS[deviceB.kind]) {
    return {
      valid: true,
      warning: 'A crossover cable is unusual between unlike device classes. The link is operational because both interfaces support auto-MDIX.'
    };
  }
  return { valid: true };
}

export function findAvailableInterface(
  device: Device,
  cable: CableType,
  links: NetworkLink[]
): DeviceInterface | undefined {
  return device.interfaces.find((entry) => {
    if (!entry.enabled) return false;
    if (entry.media !== (cable === 'wireless' ? 'wireless' : 'ethernet')) return false;
    if (interfaceHasLink(links, entry.id)) return false;
    return true;
  });
}

export function linkIsUp(link: NetworkLink, devices: Device[]): boolean {
  const deviceA = devices.find((device) => device.id === link.a.deviceId);
  const deviceB = devices.find((device) => device.id === link.b.deviceId);
  const interfaceA = deviceA?.interfaces.find((entry) => entry.id === link.a.interfaceId);
  const interfaceB = deviceB?.interfaces.find((entry) => entry.id === link.b.interfaceId);
  return Boolean(deviceA && deviceB && interfaceA?.enabled && interfaceB?.enabled);
}

export function linkForInterface(links: NetworkLink[], interfaceId: string): NetworkLink | undefined {
  return links.find((link) => link.a.interfaceId === interfaceId || link.b.interfaceId === interfaceId);
}

export function linksForInterface(links: NetworkLink[], interfaceId: string): NetworkLink[] {
  return links.filter((link) => link.a.interfaceId === interfaceId || link.b.interfaceId === interfaceId);
}

export function otherEndpoint(link: NetworkLink, deviceId: string): { deviceId: string; interfaceId: string } {
  return link.a.deviceId === deviceId ? link.b : link.a;
}
