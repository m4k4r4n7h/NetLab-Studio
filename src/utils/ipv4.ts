export interface SubnetDetails {
  network: string;
  broadcast: string;
  firstHost: string;
  lastHost: string;
  usableHosts: number;
  prefix: number;
  mask: string;
  networkInt: number;
  broadcastInt: number;
}

const OCTET_PATTERN = /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)$/;

export function ipToInt(ip: string): number | null {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!OCTET_PATTERN.test(part)) return null;
    value = (value * 256) + Number(part);
  }
  return value >>> 0;
}

export function intToIp(value: number): string {
  const safe = value >>> 0;
  return [
    (safe >>> 24) & 0xff,
    (safe >>> 16) & 0xff,
    (safe >>> 8) & 0xff,
    safe & 0xff
  ].join('.');
}

export function isValidIpv4(ip: string): boolean {
  return ipToInt(ip) !== null;
}

export function maskToPrefix(mask: string): number | null {
  const value = ipToInt(mask);
  if (value === null) return null;
  if (value === 0) return 0;
  const inverted = (~value) >>> 0;
  if ((inverted & (inverted + 1)) !== 0) return null;
  let prefix = 0;
  let cursor = value;
  while ((cursor & 0x80000000) !== 0) {
    prefix += 1;
    cursor = (cursor << 1) >>> 0;
  }
  return prefix;
}

export function isValidSubnetMask(mask: string): boolean {
  return maskToPrefix(mask) !== null;
}

export function prefixToMask(prefix: number): string {
  const clamped = Math.min(32, Math.max(0, Math.trunc(prefix)));
  if (clamped === 0) return '0.0.0.0';
  return intToIp((0xffffffff << (32 - clamped)) >>> 0);
}

export function parseMaskInput(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const slashMatch = trimmed.match(/^\/(\d{1,2})$/);
  const bareMatch = trimmed.match(/^(\d{1,2})$/);
  if (slashMatch || bareMatch) {
    const prefix = Number((slashMatch ?? bareMatch)?.[1]);
    if (prefix < 0 || prefix > 32) return null;
    return prefixToMask(prefix);
  }
  return isValidSubnetMask(trimmed) ? trimmed : null;
}

export function parseCidr(input: string): { ip: string; mask: string; prefix: number } | null {
  const parts = input.trim().split('/');
  if (parts.length !== 2) return null;
  const ip = parts[0];
  const prefix = Number(parts[1]);
  if (!isValidIpv4(ip) || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  return { ip, mask: prefixToMask(prefix), prefix };
}

export function formatCidr(ip: string, mask: string): string {
  const prefix = maskToPrefix(mask);
  return prefix === null ? `${ip}/${mask}` : `${ip}/${prefix}`;
}

export function networkToInt(ip: string, mask: string): number | null {
  const ipValue = ipToInt(ip);
  const maskValue = ipToInt(mask);
  if (ipValue === null || maskValue === null) return null;
  return (ipValue & maskValue) >>> 0;
}

export function networkAddress(ip: string, mask: string): string | null {
  const value = networkToInt(ip, mask);
  return value === null ? null : intToIp(value);
}

export function broadcastAddress(ip: string, mask: string): string | null {
  const ipValue = ipToInt(ip);
  const maskValue = ipToInt(mask);
  if (ipValue === null || maskValue === null) return null;
  return intToIp((ipValue | (~maskValue >>> 0)) >>> 0);
}

export function sameSubnet(a: string, b: string, mask: string): boolean {
  const aNetwork = networkToInt(a, mask);
  const bNetwork = networkToInt(b, mask);
  return aNetwork !== null && bNetwork !== null && aNetwork === bNetwork;
}

export function ipInSubnet(ip: string, network: string, mask: string): boolean {
  const ipValue = ipToInt(ip);
  const networkValue = networkToInt(network, mask);
  const maskValue = ipToInt(mask);
  if (ipValue === null || networkValue === null || maskValue === null) return false;
  return ((ipValue & maskValue) >>> 0) === networkValue;
}

export function isPrivateIp(ip: string): boolean {
  const value = ipToInt(ip);
  if (value === null) return false;
  const first = (value >>> 24) & 0xff;
  const second = (value >>> 16) & 0xff;
  if (first === 10) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && second === 168) return true;
  if (first === 127) return true;
  if (first === 169 && second === 254) return true;
  return false;
}

export function subnetDetails(ip: string, mask: string): SubnetDetails | null {
  const prefix = maskToPrefix(mask);
  const networkInt = networkToInt(ip, mask);
  const ipValue = ipToInt(ip);
  if (prefix === null || networkInt === null || ipValue === null) return null;
  const maskValue = ipToInt(mask) as number;
  const broadcastInt = (networkInt | (~maskValue >>> 0)) >>> 0;
  const totalAddresses = 2 ** (32 - prefix);
  const usableHosts = totalAddresses > 2 ? totalAddresses - 2 : 0;
  const firstHost = usableHosts > 0 ? networkInt + 1 : networkInt;
  const lastHost = usableHosts > 0 ? broadcastInt - 1 : broadcastInt;
  return {
    network: intToIp(networkInt),
    broadcast: intToIp(broadcastInt),
    firstHost: intToIp(firstHost),
    lastHost: intToIp(lastHost),
    usableHosts,
    prefix,
    mask,
    networkInt,
    broadcastInt
  };
}

export function hostAddressError(ip: string, mask: string): string | null {
  const details = subnetDetails(ip, mask);
  if (!details) return 'Invalid address or mask';
  if (details.usableHosts === 0) return 'This prefix has no usable host addresses';
  if (details.networkInt === ipToInt(ip)) return 'This is the network address';
  if (details.broadcastInt === ipToInt(ip)) return 'This is the broadcast address';
  return null;
}

export function ipv4Class(ip: string): string {
  const value = ipToInt(ip);
  if (value === null) return 'Invalid';
  const first = (value >>> 24) & 0xff;
  if (first < 128) return 'A';
  if (first < 192) return 'B';
  if (first < 224) return 'C';
  if (first < 240) return 'D';
  return 'E';
}

export function networkAndHostPortions(ip: string, mask: string): { network: string; host: string } | null {
  const details = subnetDetails(ip, mask);
  const ipValue = ipToInt(ip);
  const maskValue = ipToInt(mask);
  if (!details || ipValue === null || maskValue === null) return null;
  return {
    network: intToIp((ipValue & maskValue) >>> 0),
    host: intToIp((ipValue & (~maskValue >>> 0)) >>> 0)
  };
}
