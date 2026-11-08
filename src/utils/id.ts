export function createId(prefix = ''): string {
  const cryptoObject = typeof crypto !== 'undefined' ? crypto : undefined;
  const random =
    cryptoObject && typeof cryptoObject.randomUUID === 'function'
      ? cryptoObject.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}-${random}` : random;
}

export function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function formatMac(parts: number[]): string {
  return parts.map((part) => part.toString(16).padStart(2, '0')).join(':');
}

export function generateMac(seed: string, index: number): string {
  const hash = hashString(`${seed}:${index}:mac`);
  return formatMac([
    0x02,
    (hash >>> 24) & 0xff,
    (hash >>> 16) & 0xff,
    (hash >>> 8) & 0xff,
    hash & 0xff,
    (hashString(`${seed}:${index}:tail`) & 0xff)
  ]);
}

export function isValidMac(mac: string): boolean {
  return /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(mac);
}

export const BROADCAST_MAC = 'ff:ff:ff:ff:ff:ff';
