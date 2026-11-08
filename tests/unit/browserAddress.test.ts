import { describe, expect, it } from 'vitest';
import { formatBrowserAddress, parseBrowserAddress } from '../../src/utils/browserAddress';

describe('browser address parsing', () => {
  it('separates the host from the requested path', () => {
    expect(parseBrowserAddress('www.lab.test/status')).toEqual({
      ok: true,
      target: { host: 'www.lab.test', path: '/status' }
    });
    expect(parseBrowserAddress('192.168.1.10/docs/index.html')).toEqual({
      ok: true,
      target: { host: '192.168.1.10', path: '/docs/index.html' }
    });
  });

  it('removes an explicit HTTP scheme and fragment', () => {
    expect(parseBrowserAddress('http://www.lab.test/lab#section')).toEqual({
      ok: true,
      target: { host: 'www.lab.test', path: '/lab' }
    });
    expect(parseBrowserAddress('//www.lab.test')).toEqual({
      ok: true,
      target: { host: 'www.lab.test', path: '/' }
    });
  });

  it('accepts an explicit port 80 but rejects other ports', () => {
    expect(parseBrowserAddress('www.lab.test:80/page')).toEqual({
      ok: true,
      target: { host: 'www.lab.test', path: '/page' }
    });
    const result = parseBrowserAddress('www.lab.test:8080/page');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('port 80');
  });

  it('rejects missing hosts, spaces, and IPv6 literals', () => {
    expect(parseBrowserAddress('   ').ok).toBe(false);
    expect(parseBrowserAddress('/only-a-path').ok).toBe(false);
    expect(parseBrowserAddress('www lab test').ok).toBe(false);
    expect(parseBrowserAddress('2001:db8::1/page').ok).toBe(false);
  });

  it('formats a target for the address bar', () => {
    expect(formatBrowserAddress({ host: 'www.lab.test', path: '/' })).toBe('www.lab.test');
    expect(formatBrowserAddress({ host: 'www.lab.test', path: '/lab' })).toBe('www.lab.test/lab');
  });
});
