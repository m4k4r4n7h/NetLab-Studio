import type {
  CableType,
  Device,
  DeviceInterface,
  DnsRecord,
  NetworkLink,
  Project,
  ProjectSettings,
  StaticRoute
} from '../types';
import {
  CABLE_DEFINITIONS,
  DEVICE_DEFINITIONS,
  defaultProjectSettings
} from '../devices/factory';
import { createId, isValidMac } from '../utils/id';
import { hostAddressError, isValidIpv4, maskToPrefix } from '../utils/ipv4';
import { cableSupportsMedia, isWirelessAccessDevice } from '../devices/connectionRules';

export const PROJECT_FORMAT = 'netlab-studio-project';
export const PROJECT_VERSION = 1;
const MAX_DEVICES = 400;
const MAX_LINKS = 1200;
const MAX_TEXT = 200_000;

export interface ParseSuccess {
  ok: true;
  project: Project;
}

export interface ParseFailure {
  ok: false;
  error: string;
}

export type ParseResult = ParseSuccess | ParseFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.slice(0, maxLength);
}

function cleanNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function cleanBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function isDeviceKind(value: unknown): value is Device['kind'] {
  return typeof value === 'string' && value in DEVICE_DEFINITIONS;
}

function isCableType(value: unknown): value is CableType {
  return typeof value === 'string' && value in CABLE_DEFINITIONS;
}

function validateInterface(value: unknown, errors: string[], context: string): DeviceInterface | null {
  if (!isRecord(value)) {
    errors.push(`${context}: interface must be an object`);
    return null;
  }
  const id = cleanText(value.id, 120);
  const name = cleanText(value.name, 60);
  const mac = cleanText(value.mac, 17);
  if (!id) errors.push(`${context}: interface id is missing`);
  if (!name) errors.push(`${context}: interface name is missing`);
  if (!isValidMac(mac)) errors.push(`${context}: invalid MAC address ${mac}`);
  if (value.media !== 'ethernet' && value.media !== 'wireless') errors.push(`${context}: invalid interface media`);
  const ip = cleanText(value.ip, 40);
  const mask = cleanText(value.mask, 40);
  if (ip && !isValidIpv4(ip)) errors.push(`${context}: invalid IPv4 address ${ip}`);
  if (mask && maskToPrefix(mask) === null) errors.push(`${context}: invalid subnet mask ${mask}`);
  if ((ip && !mask) || (!ip && mask)) errors.push(`${context}: address and mask must be configured together`);
  if (ip && mask && isValidIpv4(ip) && maskToPrefix(mask) !== null) {
    const addressIssue = hostAddressError(ip, mask);
    if (addressIssue) errors.push(`${context}: ${addressIssue}`);
  }
  return {
    id,
    name,
    mac,
    media: value.media === 'wireless' ? 'wireless' : 'ethernet',
    enabled: cleanBoolean(value.enabled, true),
    ip,
    mask
  };
}

function validateStaticRoute(value: unknown, errors: string[], context: string): StaticRoute | null {
  if (!isRecord(value)) {
    errors.push(`${context}: static route must be an object`);
    return null;
  }
  const network = cleanText(value.network, 40);
  const mask = cleanText(value.mask, 40);
  const nextHop = cleanText(value.nextHop, 40);
  if (!isValidIpv4(network)) errors.push(`${context}: invalid route network`);
  if (maskToPrefix(mask) === null) errors.push(`${context}: invalid route mask`);
  if (!isValidIpv4(nextHop)) errors.push(`${context}: invalid next hop`);
  return { id: cleanText(value.id, 120) || createId('route'), network, mask, nextHop };
}

function validateDnsRecord(value: unknown, errors: string[], context: string): DnsRecord | null {
  if (!isRecord(value)) {
    errors.push(`${context}: DNS record must be an object`);
    return null;
  }
  const name = cleanText(value.name, 253).trim();
  const address = cleanText(value.address, 40);
  if (!name) errors.push(`${context}: DNS record name is required`);
  if (!isValidIpv4(address)) errors.push(`${context}: DNS record address is invalid`);
  return { id: cleanText(value.id, 120) || createId('dns'), name, address };
}

export function validateProject(input: unknown): ParseResult {
  if (!isRecord(input)) return { ok: false, error: 'Project data must be a JSON object.' };
  const errors: string[] = [];
  if (input.format !== PROJECT_FORMAT) errors.push('Unrecognized project format.');
  const version = cleanNumber(input.version, 0);
  if (!Number.isInteger(version) || version < 1) errors.push('Project version is missing or invalid.');
  if (version > PROJECT_VERSION) errors.push(`Project version ${version} is newer than this application supports.`);
  if (!Array.isArray(input.devices)) errors.push('Project devices must be an array.');
  if (!Array.isArray(input.links)) errors.push('Project links must be an array.');
  if (errors.length > 0) return { ok: false, error: errors.join(' ') };

  const rawDevices = input.devices as unknown[];
  const rawLinks = input.links as unknown[];
  if (rawDevices.length > MAX_DEVICES) return { ok: false, error: 'Project contains too many devices.' };
  if (rawLinks.length > MAX_LINKS) return { ok: false, error: 'Project contains too many links.' };

  const devices: Device[] = [];
  const deviceIds = new Set<string>();
  const interfaceIds = new Set<string>();
  const macs = new Set<string>();

  for (const [index, rawDevice] of rawDevices.entries()) {
    const context = `Device ${index + 1}`;
    if (!isRecord(rawDevice)) {
      errors.push(`${context}: must be an object`);
      continue;
    }
    const id = cleanText(rawDevice.id, 120);
    const name = cleanText(rawDevice.name, 80);
    const kind = rawDevice.kind;
    if (!id) errors.push(`${context}: id is missing`);
    else if (deviceIds.has(id)) errors.push(`${context}: duplicate device id`);
    if (!name) errors.push(`${context}: name is missing`);
    if (!isDeviceKind(kind)) {
      errors.push(`${context}: unknown device type`);
      continue;
    }
    if (!Array.isArray(rawDevice.interfaces)) {
      errors.push(`${context}: interfaces must be an array`);
      continue;
    }
    const interfaces: DeviceInterface[] = [];
    for (const [portIndex, rawInterface] of rawDevice.interfaces.entries()) {
      const parsed = validateInterface(rawInterface, errors, `${context} interface ${portIndex + 1}`);
      if (parsed) {
        if (interfaceIds.has(parsed.id)) errors.push(`${context}: duplicate interface id`);
        if (macs.has(parsed.mac)) errors.push(`${context}: duplicate MAC address`);
        interfaceIds.add(parsed.id);
        macs.add(parsed.mac);
        interfaces.push(parsed);
      }
    }
    if (interfaces.length === 0) errors.push(`${context}: at least one interface is required`);
    if (interfaces.length > 32) errors.push(`${context}: too many interfaces`);
    const staticRoutes = Array.isArray(rawDevice.staticRoutes)
      ? rawDevice.staticRoutes
          .map((entry, routeIndex) => validateStaticRoute(entry, errors, `${context} route ${routeIndex + 1}`))
          .filter((entry): entry is StaticRoute => entry !== null)
      : [];
    const dnsRecords = Array.isArray(rawDevice.dnsRecords)
      ? rawDevice.dnsRecords
          .map((entry, recordIndex) => validateDnsRecord(entry, errors, `${context} DNS record ${recordIndex + 1}`))
          .filter((entry): entry is DnsRecord => entry !== null)
      : [];
    const gateway = cleanText(rawDevice.gateway, 40);
    const dnsServer = cleanText(rawDevice.dnsServer, 40);
    if (gateway && !isValidIpv4(gateway)) errors.push(`${context}: invalid default gateway`);
    if (dnsServer && !isValidIpv4(dnsServer)) errors.push(`${context}: invalid DNS server`);
    deviceIds.add(id);
    devices.push({
      id,
      name,
      kind,
      x: cleanNumber(rawDevice.x, 80),
      y: cleanNumber(rawDevice.y, 80),
      interfaces,
      gateway,
      dnsServer,
      staticRoutes,
      dnsEnabled: cleanBoolean(rawDevice.dnsEnabled, false),
      dnsRecords,
      httpEnabled: cleanBoolean(rawDevice.httpEnabled, false),
      httpContent: cleanText(rawDevice.httpContent, MAX_TEXT),
      httpsEnabled: cleanBoolean(rawDevice.httpsEnabled, false),
      notes: cleanText(rawDevice.notes, 5000)
    });
  }

  const links: NetworkLink[] = [];
  const usedInterfaceIds = new Set<string>();
  const linkIds = new Set<string>();
  for (const [index, rawLink] of rawLinks.entries()) {
    const context = `Link ${index + 1}`;
    if (!isRecord(rawLink)) {
      errors.push(`${context}: must be an object`);
      continue;
    }
    const cable = rawLink.cable;
    if (!isCableType(cable)) {
      errors.push(`${context}: unknown cable type`);
      continue;
    }
    const rawA = rawLink.a;
    const rawB = rawLink.b;
    if (!isRecord(rawA) || !isRecord(rawB)) {
      errors.push(`${context}: endpoints are missing`);
      continue;
    }
    const a = { deviceId: cleanText(rawA.deviceId, 120), interfaceId: cleanText(rawA.interfaceId, 120) };
    const b = { deviceId: cleanText(rawB.deviceId, 120), interfaceId: cleanText(rawB.interfaceId, 120) };
    const deviceA = devices.find((entry) => entry.id === a.deviceId);
    const deviceB = devices.find((entry) => entry.id === b.deviceId);
    if (!deviceA || !deviceB) {
      errors.push(`${context}: endpoint device does not exist`);
      continue;
    }
    const interfaceA = deviceA.interfaces.find((entry) => entry.id === a.interfaceId);
    const interfaceB = deviceB.interfaces.find((entry) => entry.id === b.interfaceId);
    if (!interfaceA) {
      errors.push(`${context}: source interface does not exist`);
      continue;
    }
    if (!interfaceB) {
      errors.push(`${context}: destination interface does not exist`);
      continue;
    }
    if (a.deviceId === b.deviceId) {
      errors.push(`${context}: a device cannot connect to itself`);
      continue;
    }
    if (!cableSupportsMedia(cable, interfaceA.media)) {
      errors.push(`${context}: ${interfaceA.name} does not support ${cable} cabling`);
      continue;
    }
    if (!cableSupportsMedia(cable, interfaceB.media)) {
      errors.push(`${context}: ${interfaceB.name} does not support ${cable} cabling`);
      continue;
    }
    if (cable === 'wireless') {
      const accessA = isWirelessAccessDevice(deviceA);
      const accessB = isWirelessAccessDevice(deviceB);
      if (!accessA && !accessB) {
        errors.push(`${context}: wireless links require an access point or wireless router`);
        continue;
      }
      if (accessA && accessB) {
        errors.push(`${context}: two wireless access devices cannot associate with each other`);
        continue;
      }
    }
    const allowsMultiple = (device: Device, entry: DeviceInterface): boolean =>
      cable === 'wireless' && entry.media === 'wireless' && isWirelessAccessDevice(device);
    if ((!allowsMultiple(deviceA, interfaceA) && usedInterfaceIds.has(a.interfaceId)) ||
        (!allowsMultiple(deviceB, interfaceB) && usedInterfaceIds.has(b.interfaceId))) {
      errors.push(`${context}: an interface is used by more than one link`);
      continue;
    }
    const id = cleanText(rawLink.id, 120) || createId('link');
    if (linkIds.has(id)) errors.push(`${context}: duplicate link id`);
    linkIds.add(id);
    usedInterfaceIds.add(a.interfaceId);
    usedInterfaceIds.add(b.interfaceId);
    links.push({ id, cable, a, b });
  }

  if (errors.length > 0) {
    return { ok: false, error: errors.slice(0, 12).join(' ') };
  }

  const settings: ProjectSettings = { ...defaultProjectSettings() };
  if (isRecord(input.settings)) {
    settings.gridSize = Math.min(80, Math.max(5, cleanNumber(input.settings.gridSize, 20)));
    settings.showGrid = cleanBoolean(input.settings.showGrid, true);
    settings.showLabels = cleanBoolean(input.settings.showLabels, true);
    settings.snapToGrid = cleanBoolean(input.settings.snapToGrid, false);
    settings.learningMode = cleanBoolean(input.settings.learningMode, true);
    settings.autosave = cleanBoolean(input.settings.autosave, true);
    settings.showPacketAnimation = cleanBoolean(input.settings.showPacketAnimation, true);
  }

  const project: Project = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    id: cleanText(input.id, 120) || createId('proj'),
    name: cleanText(input.name, 120).trim() || 'Imported Project',
    createdAt: cleanNumber(input.createdAt, Date.now()),
    updatedAt: cleanNumber(input.updatedAt, Date.now()),
    notes: cleanText(input.notes, 20_000),
    devices,
    links,
    settings
  };
  return { ok: true, project };
}

export function parseProjectJson(text: string): ParseResult {
  if (text.length > 8_000_000) return { ok: false, error: 'Project file is too large.' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'The file is not valid JSON.' };
  }
  return validateProject(parsed);
}

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2);
}

export function cloneProject(project: Project, overrides: Partial<Project> = {}): Project {
  const copy = JSON.parse(JSON.stringify(project)) as Project;
  return {
    ...copy,
    ...overrides,
    id: overrides.id ?? createId('proj'),
    updatedAt: Date.now(),
    devices: overrides.devices ?? copy.devices,
    links: overrides.links ?? copy.links
  };
}
