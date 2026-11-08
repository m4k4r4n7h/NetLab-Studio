import type { CableType, Device, DeviceKind, NetworkLink, Project } from '../types';
import { createDevice, createLink, createProject } from '../devices/factory';
import { NetworkSimulator } from '../engine/core/NetworkSimulator';
import { ipToInt, isValidIpv4, maskToPrefix, sameSubnet, subnetDetails } from '../utils/ipv4';

export interface InterfaceConfig {
  name: string;
  ip?: string;
  mask?: string;
  enabled?: boolean;
}

export interface DeviceConfig {
  interfaces?: InterfaceConfig[];
  gateway?: string;
  dnsServer?: string;
  routes?: Array<{ network: string; mask: string; nextHop: string }>;
  dnsRecords?: Array<{ name: string; address: string }>;
  dnsService?: boolean;
  httpService?: boolean;
  httpContent?: string;
  notes?: string;
}

export function makeDevice(
  kind: DeviceKind,
  name: string,
  x: number,
  y: number,
  config: DeviceConfig = {}
): Device {
  const device = createDevice(kind, { name, x, y });
  for (const entry of config.interfaces ?? []) {
    const target = device.interfaces.find((item) => item.name === entry.name);
    if (!target) continue;
    if (entry.ip !== undefined) target.ip = entry.ip;
    if (entry.mask !== undefined) target.mask = entry.mask;
    if (entry.enabled !== undefined) target.enabled = entry.enabled;
  }
  if (config.gateway !== undefined) device.gateway = config.gateway;
  if (config.dnsServer !== undefined) device.dnsServer = config.dnsServer;
  if (config.routes) {
    device.staticRoutes = config.routes.map((route) => ({
      id: `route-${device.id}-${route.network}-${route.mask}`,
      ...route
    }));
  }
  if (config.dnsRecords) {
    device.dnsRecords = config.dnsRecords.map((record) => ({
      id: `dns-${device.id}-${record.name}`,
      ...record
    }));
  }
  if (config.dnsService !== undefined) device.dnsEnabled = config.dnsService;
  if (config.httpService !== undefined) device.httpEnabled = config.httpService;
  if (config.httpContent !== undefined) device.httpContent = config.httpContent;
  if (config.notes !== undefined) device.notes = config.notes;
  return device;
}

export function port(device: Device, name: string): { deviceId: string; interfaceId: string } {
  const entry = device.interfaces.find((item) => item.name === name);
  if (!entry) throw new Error(`Interface ${name} does not exist on ${device.name}`);
  return { deviceId: device.id, interfaceId: entry.id };
}

export function makeLink(
  a: Device,
  aPort: string,
  b: Device,
  bPort: string,
  cable: CableType = 'copper-straight-through'
): NetworkLink {
  return createLink(port(a, aPort), port(b, bPort), cable);
}

export function buildTopology(name: string, devices: Device[], links: NetworkLink[]): Project {
  return createProject(name, devices, links);
}

export interface LabCheck {
  label: string;
  passed: boolean;
}

export function check(label: string, passed: boolean): LabCheck {
  return { label, passed: Boolean(passed) };
}

export interface LabValidation {
  passed: boolean;
  checks: LabCheck[];
}

export function finalizeValidation(checks: LabCheck[]): LabValidation {
  return { passed: checks.every((entry) => entry.passed), checks };
}

export function deviceNamed(project: Project, name: string): Device | undefined {
  return project.devices.find((device) => device.name === name);
}

export function deviceKind(project: Project, kind: DeviceKind): Device[] {
  return project.devices.filter((device) => device.kind === kind);
}

export function interfaceNamed(device: Device, name: string) {
  return device.interfaces.find((entry) => entry.name === name);
}

export function isLinked(project: Project, deviceA: string, deviceB: string): boolean {
  return project.links.some((link) => (
    (link.a.deviceId === deviceA && link.b.deviceId === deviceB) ||
    (link.a.deviceId === deviceB && link.b.deviceId === deviceA)
  ));
}

export function connectedToDevice(project: Project, deviceId: string): boolean {
  return project.links.some((link) => link.a.deviceId === deviceId || link.b.deviceId === deviceId);
}

export function primaryAddress(device: Device | undefined): string {
  return device?.interfaces.find((entry) => entry.ip && entry.mask)?.ip ?? '';
}

export function pingCheck(project: Project, sourceName: string, destinationIp: string, label: string): LabCheck {
  const source = deviceNamed(project, sourceName);
  if (!source) return check(label, false);
  const outcome = new NetworkSimulator(project).run({
    kind: 'ping',
    sourceId: source.id,
    destinationIp,
    count: 1
  });
  return check(label, outcome.success);
}

export function dnsCheck(project: Project, sourceName: string, domain: string, expected: string, label: string): LabCheck {
  const source = deviceNamed(project, sourceName);
  if (!source) return check(label, false);
  const outcome = new NetworkSimulator(project).run({ kind: 'dns', sourceId: source.id, domain });
  return check(label, outcome.success && outcome.dnsAddress === expected);
}

export function httpCheck(project: Project, sourceName: string, target: string, marker: string, label: string): LabCheck {
  const source = deviceNamed(project, sourceName);
  if (!source) return check(label, false);
  const outcome = new NetworkSimulator(project).run({ kind: 'http', sourceId: source.id, target });
  return check(label, outcome.success && Boolean(outcome.httpBody?.includes(marker)));
}

export function configuredOnSubnet(device: Device | undefined, network: string, mask: string): boolean {
  return Boolean(
    device &&
      device.interfaces.some(
        (entry) => entry.enabled && entry.ip && entry.mask && sameSubnet(entry.ip, network, mask) && maskToPrefix(entry.mask) === maskToPrefix(mask)
      )
  );
}

export function validHostInSubnet(device: Device | undefined, network: string, mask: string): boolean {
  if (!device) return false;
  return device.interfaces.some((entry) => {
    if (!entry.enabled || !entry.ip || !entry.mask) return false;
    if (maskToPrefix(entry.mask) !== maskToPrefix(mask)) return false;
    const details = subnetDetails(entry.ip, entry.mask);
    const value = ipToInt(entry.ip);
    return Boolean(details && value !== null && value > details.networkInt && value < details.broadcastInt && details.network === network);
  });
}

export function hostIsUsable(ip: string, mask: string): boolean {
  const details = subnetDetails(ip, mask);
  if (!details) return false;
  const value = ip.split('.').reduce((total, part) => total * 256 + Number(part), 0);
  return value > details.networkInt && value < details.broadcastInt;
}

export function ipUnique(project: Project, address: string): boolean {
  return project.devices.every((device) => device.interfaces.every((entry) => entry.ip !== address));
}

export function validClient(device: Device | undefined): boolean {
  return Boolean(
    device &&
      device.interfaces.some((entry) => entry.enabled && isValidIpv4(entry.ip) && maskToPrefix(entry.mask) !== null)
  );
}
