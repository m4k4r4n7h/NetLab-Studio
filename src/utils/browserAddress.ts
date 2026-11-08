export interface BrowserTarget {
  host: string;
  path: string;
}

export type BrowserAddressResult =
  | { ok: true; target: BrowserTarget }
  | { ok: false; error: string };

export function parseBrowserAddress(raw: string): BrowserAddressResult {
  let value = raw.trim();
  if (!value) return { ok: false, error: 'Enter an address or domain name.' };
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  if (value.startsWith('//')) value = value.slice(2);
  const fragmentIndex = value.indexOf('#');
  if (fragmentIndex >= 0) value = value.slice(0, fragmentIndex);
  if (!value) return { ok: false, error: 'Enter an address or domain name.' };
  if (/\s/.test(value)) return { ok: false, error: 'Addresses cannot contain spaces.' };
  const slashIndex = value.indexOf('/');
  let host = slashIndex === -1 ? value : value.slice(0, slashIndex);
  const path = slashIndex === -1 ? '/' : value.slice(slashIndex) || '/';
  const portMatch = host.match(/^(.+):(\d+)$/);
  if (portMatch) {
    if (portMatch[2] !== '80') {
      return { ok: false, error: 'Only TCP port 80 is simulated. Remove the port or use port 80.' };
    }
    host = portMatch[1];
  }
  if (!host) return { ok: false, error: 'Enter a host or IPv4 address before the path.' };
  if (host.includes(':')) return { ok: false, error: 'IPv6 addresses are not supported by this simulator.' };
  return { ok: true, target: { host, path } };
}

export function formatBrowserAddress(target: BrowserTarget): string {
  return target.path === '/' ? target.host : `${target.host}${target.path}`;
}
