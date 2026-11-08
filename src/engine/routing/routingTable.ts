import type { Device, DeviceInterface } from '../../types';
import { isValidIpv4, ipInSubnet, maskToPrefix, networkAddress, sameSubnet } from '../../utils/ipv4';

export interface RoutingTableRow {
  id: string;
  network: string;
  mask: string;
  prefix: number;
  nextHop: string | null;
  interfaceId: string | null;
  interfaceName: string | null;
  type: 'connected' | 'static' | 'default';
  display: string;
}

export function configuredInterfaces(device: Device): DeviceInterface[] {
  return device.interfaces.filter((entry) => entry.ip && entry.mask && isValidIpv4(entry.ip) && isValidIpv4(entry.mask));
}

export function interfaceForAddress(device: Device, address: string): DeviceInterface | undefined {
  return configuredInterfaces(device).find((entry) => entry.ip === address);
}

export function interfaceForNextHop(device: Device, nextHop: string): DeviceInterface | undefined {
  return configuredInterfaces(device).find((entry) => sameSubnet(entry.ip, nextHop, entry.mask));
}

export function buildRoutingTable(device: Device): RoutingTableRow[] {
  if (device.kind !== 'router' && device.kind !== 'wireless-router') return [];
  const rows: RoutingTableRow[] = [];
  for (const entry of device.interfaces) {
    if (!entry.enabled) continue;
    if (!entry.ip || !entry.mask) continue;
    if (!isValidIpv4(entry.ip) || maskToPrefix(entry.mask) === null) continue;
    const network = networkAddress(entry.ip, entry.mask);
    if (!network) continue;
    const prefix = maskToPrefix(entry.mask) as number;
    rows.push({
      id: `connected-${entry.id}`,
      network,
      mask: entry.mask,
      prefix,
      nextHop: null,
      interfaceId: entry.id,
      interfaceName: entry.name,
      type: 'connected',
      display: `${network}/${prefix} is directly connected, ${entry.name}`
    });
  }
  for (const route of device.staticRoutes) {
    if (!isValidIpv4(route.network)) continue;
    const prefix = maskToPrefix(route.mask);
    if (prefix === null) continue;
    const egress = isValidIpv4(route.nextHop) ? interfaceForNextHop(device, route.nextHop) : undefined;
    rows.push({
      id: route.id,
      network: route.network,
      mask: route.mask,
      prefix,
      nextHop: route.nextHop,
      interfaceId: egress?.id ?? null,
      interfaceName: egress?.name ?? null,
      type: prefix === 0 ? 'default' : 'static',
      display:
        prefix === 0
          ? `0.0.0.0/0 via ${route.nextHop || 'unset'}${egress ? `, ${egress.name}` : ''}`
          : `${route.network}/${prefix} via ${route.nextHop || 'unset'}${egress ? `, ${egress.name}` : ''}`
    });
  }
  rows.sort((left, right) => {
    if (right.prefix !== left.prefix) return right.prefix - left.prefix;
    if (left.type === right.type) return left.network.localeCompare(right.network);
    return left.type === 'connected' ? -1 : 1;
  });
  return rows;
}

export function lookupRoute(rows: RoutingTableRow[], destination: string): RoutingTableRow | null {
  for (const row of rows) {
    if (row.prefix === 0 && row.type === 'default') {
      if (row.nextHop && row.interfaceId) return row;
      continue;
    }
    if (ipInSubnet(destination, row.network, row.mask)) {
      if (row.type === 'connected') return row;
      if (row.nextHop && row.interfaceId) return row;
    }
  }
  return null;
}

export function routingNextHop(row: RoutingTableRow, destination: string): string {
  return row.type === 'connected' ? destination : (row.nextHop as string);
}
