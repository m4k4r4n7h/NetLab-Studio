import { describe, expect, it } from 'vitest';
import {
  cloneProject,
  parseProjectJson,
  PROJECT_FORMAT,
  PROJECT_VERSION,
  serializeProject,
  validateProject
} from '../../src/storage/projectSerializer';
import { buildTopology, makeDevice, makeLink } from '../../src/labs/builders';
import type { Project } from '../../src/types';

function sampleProject(): Project {
  const switchDevice = makeDevice('switch', 'SW1', 500, 300);
  const server = makeDevice('server', 'SRV1', 760, 160, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.10.10', mask: '255.255.255.0' }],
    dnsService: true,
    dnsRecords: [{ name: 'intranet.lab.test', address: '192.168.10.10' }],
    httpService: true,
    httpContent: '<h1>Sample</h1>'
  });
  const client = makeDevice('pc', 'PC1', 240, 300, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.10.20', mask: '255.255.255.0' }],
    gateway: '192.168.10.1',
    dnsServer: '192.168.10.10'
  });
  return buildTopology('Sample Project', [switchDevice, server, client], [
    makeLink(client, 'Ethernet0', switchDevice, 'FastEthernet0/1'),
    makeLink(server, 'Ethernet0', switchDevice, 'FastEthernet0/2')
  ]);
}

function rawProject(project: Project): Record<string, unknown> {
  return JSON.parse(serializeProject(project)) as Record<string, unknown>;
}

describe('project format validation', () => {
  it('accepts and round-trips a valid project', () => {
    const project = sampleProject();
    const parsed = parseProjectJson(serializeProject(project));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.project.format).toBe(PROJECT_FORMAT);
    expect(parsed.project.version).toBe(PROJECT_VERSION);
    expect(parsed.project.name).toBe('Sample Project');
    expect(parsed.project.devices).toHaveLength(3);
    expect(parsed.project.links).toHaveLength(2);
    const server = parsed.project.devices.find((device) => device.name === 'SRV1');
    expect(server?.dnsEnabled).toBe(true);
    expect(server?.dnsRecords[0].name).toBe('intranet.lab.test');
    expect(server?.httpEnabled).toBe(true);
    expect(server?.httpContent).toContain('Sample');
    const client = parsed.project.devices.find((device) => device.name === 'PC1');
    expect(client?.gateway).toBe('192.168.10.1');
  });

  it('rejects malformed JSON', () => {
    const result = parseProjectJson('{ not valid json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not valid JSON');
  });

  it('rejects an unknown project format', () => {
    const raw = rawProject(sampleProject());
    raw.format = 'some-other-tool';
    const result = validateProject(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Unrecognized project format');
  });

  it('rejects a newer format version', () => {
    const raw = rawProject(sampleProject());
    raw.version = 99;
    const result = validateProject(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('newer than this application supports');
  });

  it('rejects an unknown device type', () => {
    const raw = rawProject(sampleProject());
    const devices = raw.devices as Array<Record<string, unknown>>;
    devices[0].kind = 'quantum-switch';
    const result = validateProject(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('unknown device type');
  });

  it('rejects duplicate MAC addresses', () => {
    const raw = rawProject(sampleProject());
    const devices = raw.devices as Array<{ interfaces: Array<{ mac: string }> }>;
    devices[1].interfaces[0].mac = devices[2].interfaces[0].mac;
    const result = validateProject(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('duplicate MAC address');
  });

  it('rejects a cable that reuses an interface', () => {
    const raw = rawProject(sampleProject());
    const links = raw.links as Array<{ b: { interfaceId: string } }>;
    links[1].b.interfaceId = links[0].b.interfaceId;
    const result = validateProject(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('used by more than one link');
  });

  it('rejects invalid interface addresses and mismatched masks', () => {
    const raw = rawProject(sampleProject());
    const devices = raw.devices as Array<{ interfaces: Array<{ ip: string; mask: string }> }>;
    devices[2].interfaces[0].ip = '192.168.10.999';
    const invalidIp = validateProject(raw);
    expect(invalidIp.ok).toBe(false);
    if (!invalidIp.ok) expect(invalidIp.error).toContain('invalid IPv4 address');

    const rawTwo = rawProject(sampleProject());
    const devicesTwo = rawTwo.devices as Array<{ interfaces: Array<{ ip: string; mask: string }> }>;
    devicesTwo[2].interfaces[0].mask = '';
    const missingMask = validateProject(rawTwo);
    expect(missingMask.ok).toBe(false);
    if (!missingMask.ok) expect(missingMask.error).toContain('configured together');
  });

  it('rejects an empty device list entry with no interfaces', () => {
    const raw = rawProject(sampleProject());
    const devices = raw.devices as Array<Record<string, unknown>>;
    devices[0].interfaces = [];
    const result = validateProject(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('at least one interface is required');
  });

  it('normalizes unsafe numbers and long text', () => {
    const raw = rawProject(sampleProject());
    raw.name = '';
    raw.notes = 'x'.repeat(25_000);
    raw.createdAt = Number.POSITIVE_INFINITY;
    const devices = raw.devices as Array<Record<string, unknown>>;
    devices[0].x = Number.NaN;
    const result = validateProject(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.name).toBe('Imported Project');
    expect(result.project.notes).toHaveLength(20_000);
    expect(result.project.devices[0].x).toBe(80);
    expect(Number.isFinite(result.project.createdAt)).toBe(true);
  });

  it('rejects network and broadcast addresses on interfaces', () => {
    const rawNetwork = rawProject(sampleProject());
    const networkDevices = rawNetwork.devices as Array<{ interfaces: Array<{ ip: string; mask: string }> }>;
    networkDevices[2].interfaces[0].ip = '192.168.10.0';
    const networkResult = validateProject(rawNetwork);
    expect(networkResult.ok).toBe(false);
    if (!networkResult.ok) expect(networkResult.error).toContain('network address');

    const rawBroadcast = rawProject(sampleProject());
    const broadcastDevices = rawBroadcast.devices as Array<{ interfaces: Array<{ ip: string; mask: string }> }>;
    broadcastDevices[2].interfaces[0].ip = '192.168.10.255';
    const broadcastResult = validateProject(rawBroadcast);
    expect(broadcastResult.ok).toBe(false);
    if (!broadcastResult.ok) expect(broadcastResult.error).toContain('broadcast address');
  });

  it('rejects a cable whose media does not match the interface', () => {
    const accessPoint = makeDevice('access-point', 'AP1', 400, 200);
    const client = makeDevice('pc', 'PC-W', 200, 400, {
      interfaces: [{ name: 'wlan0', ip: '192.168.10.20', mask: '255.255.255.0' }]
    });
    const project = buildTopology('Wireless Mismatch', [accessPoint, client], [
      makeLink(client, 'wlan0', accessPoint, 'wlan0')
    ]);
    const result = validateProject(JSON.parse(serializeProject(project)) as Record<string, unknown>);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('does not support copper-straight-through cabling');
  });

  it('rejects a wireless association without an access point', () => {
    const first = makeDevice('pc', 'PC-1', 200, 200, {
      interfaces: [{ name: 'wlan0', ip: '192.168.10.10', mask: '255.255.255.0' }]
    });
    const second = makeDevice('pc', 'PC-2', 400, 200, {
      interfaces: [{ name: 'wlan0', ip: '192.168.10.11', mask: '255.255.255.0' }]
    });
    const project = buildTopology('Peer Wireless', [first, second], [
      makeLink(first, 'wlan0', second, 'wlan0', 'wireless')
    ]);
    const result = validateProject(JSON.parse(serializeProject(project)) as Record<string, unknown>);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('require an access point or wireless router');
  });

  it('accepts a valid wireless association through an access point', () => {
    const accessPoint = makeDevice('access-point', 'AP1', 400, 200);
    const client = makeDevice('pc', 'PC-W', 200, 400, {
      interfaces: [{ name: 'wlan0', ip: '192.168.10.20', mask: '255.255.255.0' }]
    });
    const project = buildTopology('Wireless Lab', [accessPoint, client], [
      makeLink(client, 'wlan0', accessPoint, 'wlan0', 'wireless')
    ]);
    const result = validateProject(JSON.parse(serializeProject(project)) as Record<string, unknown>);
    expect(result.ok).toBe(true);
  });

  it('clones a project with new identity but preserved content', () => {
    const project = sampleProject();
    const copy = cloneProject(project, { name: 'Copy' });
    expect(copy.id).not.toBe(project.id);
    expect(copy.name).toBe('Copy');
    expect(copy.devices).toHaveLength(project.devices.length);
    expect(copy.links).toHaveLength(project.links.length);
    expect(copy.devices[0].interfaces[0].mac).toBe(project.devices[0].interfaces[0].mac);
  });
});
