import { describe, expect, it } from 'vitest';
import { NetworkSimulator } from '../../src/engine/core/NetworkSimulator';
import { buildRoutingTable } from '../../src/engine/routing/routingTable';
import { buildTopology, makeDevice, makeLink } from '../../src/labs/builders';
import type { Project } from '../../src/types';

function basicLan(): { project: Project; switchDevice: ReturnType<typeof makeDevice>; pcA: ReturnType<typeof makeDevice>; pcB: ReturnType<typeof makeDevice> } {
  const switchDevice = makeDevice('switch', 'SW1', 500, 300);
  const pcA = makeDevice('pc', 'PC-A', 250, 160, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.1.10', mask: '255.255.255.0' }]
  });
  const pcB = makeDevice('pc', 'PC-B', 250, 440, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.1.11', mask: '255.255.255.0' }]
  });
  const project = buildTopology('Basic LAN', [switchDevice, pcA, pcB], [
    makeLink(pcA, 'Ethernet0', switchDevice, 'FastEthernet0/1'),
    makeLink(pcB, 'Ethernet0', switchDevice, 'FastEthernet0/2')
  ]);
  return { project, switchDevice, pcA, pcB };
}

function routedNetworks(): { project: Project; pcA: ReturnType<typeof makeDevice>; pcB: ReturnType<typeof makeDevice>; router: ReturnType<typeof makeDevice> } {
  const router = makeDevice('router', 'R1', 500, 300, {
    interfaces: [
      { name: 'GigabitEthernet0/0', ip: '192.168.1.1', mask: '255.255.255.0' },
      { name: 'GigabitEthernet0/1', ip: '10.0.0.1', mask: '255.255.255.0' }
    ]
  });
  const pcA = makeDevice('pc', 'PC-A', 200, 160, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.1.10', mask: '255.255.255.0' }],
    gateway: '192.168.1.1'
  });
  const pcB = makeDevice('pc', 'PC-B', 800, 440, {
    interfaces: [{ name: 'Ethernet0', ip: '10.0.0.10', mask: '255.255.255.0' }],
    gateway: '10.0.0.1'
  });
  const project = buildTopology('Routed', [router, pcA, pcB], [
    makeLink(pcA, 'Ethernet0', router, 'GigabitEthernet0/0'),
    makeLink(pcB, 'Ethernet0', router, 'GigabitEthernet0/1')
  ]);
  return { project, pcA, pcB, router };
}

function clientServer(): { project: Project; client: ReturnType<typeof makeDevice>; server: ReturnType<typeof makeDevice> } {
  const switchDevice = makeDevice('switch', 'SW1', 500, 300);
  const server = makeDevice('server', 'SRV1', 760, 160, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.60.10', mask: '255.255.255.0' }],
    dnsService: true,
    dnsRecords: [{ name: 'www.lab.test', address: '192.168.60.10' }],
    httpService: true,
    httpContent: '<!doctype html><html><head><title>Lab Page</title></head><body><h1>NetLab Test Page</h1></body></html>'
  });
  const client = makeDevice('pc', 'PC-Client', 240, 300, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.60.20', mask: '255.255.255.0' }],
    dnsServer: '192.168.60.10'
  });
  const project = buildTopology('Client Server', [switchDevice, client, server], [
    makeLink(client, 'Ethernet0', switchDevice, 'FastEthernet0/1'),
    makeLink(server, 'Ethernet0', switchDevice, 'FastEthernet0/2')
  ]);
  return { project, client, server };
}

describe('functional scenario 1: two PCs on one switch', () => {
  it('delivers a ping inside the same subnet', () => {
    const { project, pcA } = basicLan();
    const outcome = new NetworkSimulator(project).run({
      kind: 'ping',
      sourceId: pcA.id,
      destinationIp: '192.168.1.11',
      count: 2
    });
    expect(outcome.success).toBe(true);
    expect(outcome.pingReplies).toBe(2);
    expect(outcome.events.length).toBeGreaterThan(0);
    expect(outcome.events.some((event) => event.type === 'arp-request')).toBe(true);
    expect(outcome.events.some((event) => event.type === 'arp-reply')).toBe(true);
    expect(outcome.events.some((event) => event.type === 'icmp-request')).toBe(true);
    expect(outcome.events.some((event) => event.type === 'icmp-success')).toBe(true);
    expect(outcome.events.every((event) => event.outcome !== 'dropped')).toBe(true);
  });
});

describe('functional scenario 2: different subnets without a router', () => {
  it('fails because there is no default gateway or routing path', () => {
    const pcA = makeDevice('pc', 'PC-A', 200, 200, {
      interfaces: [{ name: 'Ethernet0', ip: '192.168.1.10', mask: '255.255.255.0' }]
    });
    const pcB = makeDevice('pc', 'PC-B', 600, 200, {
      interfaces: [{ name: 'Ethernet0', ip: '10.0.0.10', mask: '255.255.255.0' }]
    });
    const project = buildTopology('Split Subnets', [pcA, pcB], [
      makeLink(pcA, 'Ethernet0', pcB, 'Ethernet0')
    ]);
    const outcome = new NetworkSimulator(project).run({
      kind: 'ping',
      sourceId: pcA.id,
      destinationIp: '10.0.0.10',
      count: 1
    });
    expect(outcome.success).toBe(false);
    expect(outcome.summary).toContain('No default gateway');
    expect(outcome.events.some((event) => event.outcome === 'dropped')).toBe(true);
  });
});

describe('functional scenario 3: router between two networks', () => {
  it('installs directly connected routes and forwards between subnets', () => {
    const { project, pcA, pcB, router } = routedNetworks();
    const table = buildRoutingTable(router);
    expect(table.some((route) => route.type === 'connected' && route.network === '192.168.1.0' && route.prefix === 24)).toBe(true);
    expect(table.some((route) => route.type === 'connected' && route.network === '10.0.0.0' && route.prefix === 24)).toBe(true);

    const outcome = new NetworkSimulator(project).run({
      kind: 'ping',
      sourceId: pcA.id,
      destinationIp: '10.0.0.10',
      count: 1
    });
    expect(outcome.success).toBe(true);
    expect(outcome.events.some((event) => event.type === 'route-lookup' && event.deviceId === router.id)).toBe(true);
    expect(outcome.events.some((event) => event.type === 'router-forwarded' || event.deviceId === router.id)).toBe(true);
    expect(pcB.gateway).toBe('10.0.0.1');
  });
});

describe('functional scenario 4: incorrect default gateway', () => {
  it('fails with the wrong gateway and recovers after correction', () => {
    const { project, pcA } = routedNetworks();
    pcA.gateway = '192.168.1.254';
    const simulator = new NetworkSimulator(project);
    const failed = simulator.run({
      kind: 'ping',
      sourceId: pcA.id,
      destinationIp: '10.0.0.10',
      count: 1
    });
    expect(failed.success).toBe(false);
    expect(failed.summary).toContain('ARP resolution for 192.168.1.254 failed');
    expect(failed.events.some((event) => event.type === 'arp-timeout')).toBe(true);

    pcA.gateway = '192.168.1.1';
    simulator.sync(project);
    const recovered = simulator.run({
      kind: 'ping',
      sourceId: pcA.id,
      destinationIp: '10.0.0.10',
      count: 1
    });
    expect(recovered.success).toBe(true);
  });
});

describe('functional scenario 5: switch MAC learning', () => {
  it('learns source MAC addresses on the correct ingress ports', () => {
    const { project, switchDevice, pcA, pcB } = basicLan();
    const simulator = new NetworkSimulator(project);
    simulator.run({ kind: 'ping', sourceId: pcA.id, destinationIp: '192.168.1.11', count: 1 });
    const table = simulator.getMacTable(switchDevice.id);
    const entryA = table.find((row) => row.mac === pcA.interfaces[0].mac);
    const entryB = table.find((row) => row.mac === pcB.interfaces[0].mac);
    expect(entryA?.interfaceName).toBe('FastEthernet0/1');
    expect(entryB?.interfaceName).toBe('FastEthernet0/2');
  });
});

describe('functional scenario 6: ARP resolution', () => {
  it('broadcasts a request and caches the reply', () => {
    const { project, pcA, pcB } = basicLan();
    const simulator = new NetworkSimulator(project);
    const outcome = simulator.run({
      kind: 'ping',
      sourceId: pcA.id,
      destinationIp: '192.168.1.11',
      count: 1
    });
    expect(outcome.success).toBe(true);
    const requests = outcome.events.filter((event) => event.type === 'arp-request');
    expect(requests.length).toBeGreaterThan(0);
    expect(requests[0].packet.ethernet?.dstMac).toBe('ff:ff:ff:ff:ff:ff');
    const cache = simulator.getArpCache(pcA.id);
    expect(cache).toContainEqual(expect.objectContaining({
      address: '192.168.1.11',
      mac: pcB.interfaces[0].mac
    }));
  });
});

describe('functional scenario 7: DNS', () => {
  it('resolves a configured A record', () => {
    const { project, client } = clientServer();
    const outcome = new NetworkSimulator(project).run({
      kind: 'dns',
      sourceId: client.id,
      domain: 'www.lab.test'
    });
    expect(outcome.success).toBe(true);
    expect(outcome.dnsAddress).toBe('192.168.60.10');
    expect(outcome.events.some((event) => event.type === 'dns-query')).toBe(true);
    expect(outcome.events.some((event) => event.type === 'dns-response')).toBe(true);
  });

  it('reports NXDOMAIN for an unknown name', () => {
    const { project, client } = clientServer();
    const outcome = new NetworkSimulator(project).run({
      kind: 'dns',
      sourceId: client.id,
      domain: 'missing.lab.test'
    });
    expect(outcome.success).toBe(false);
    expect(outcome.events.some((event) => event.type === 'dns-failure')).toBe(true);
  });

  it('fails when the client has no DNS server', () => {
    const { project, client } = clientServer();
    client.dnsServer = '';
    const outcome = new NetworkSimulator(project).run({
      kind: 'dns',
      sourceId: client.id,
      domain: 'www.lab.test'
    });
    expect(outcome.success).toBe(false);
    expect(outcome.summary).toContain('DNS lookup failed');
  });
});

describe('functional scenario 8: HTTP', () => {
  it('opens TCP, requests a page by name, and tears the connection down', () => {
    const { project, client } = clientServer();
    const outcome = new NetworkSimulator(project).run({
      kind: 'http',
      sourceId: client.id,
      target: 'www.lab.test',
      path: '/'
    });
    expect(outcome.success).toBe(true);
    expect(outcome.httpStatus).toBe(200);
    expect(outcome.httpBody).toContain('NetLab Test Page');
    const types = outcome.events.map((event) => event.type);
    expect(types).toContain('dns-query');
    expect(types).toContain('tcp-syn');
    expect(types).toContain('tcp-syn-ack');
    expect(types).toContain('tcp-established');
    expect(types).toContain('http-request');
    expect(types).toContain('http-response');
    expect(types).toContain('tcp-fin');
    expect(types).toContain('tcp-closed');
  });

  it('fails when no HTTP service is enabled', () => {
    const { project, client, server } = clientServer();
    server.httpEnabled = false;
    const outcome = new NetworkSimulator(project).run({
      kind: 'http',
      sourceId: client.id,
      target: '192.168.60.10',
      path: '/'
    });
    expect(outcome.success).toBe(false);
    expect(outcome.events.some((event) => event.type === 'service-unavailable')).toBe(true);
    expect(outcome.events.some((event) => event.type === 'tcp-reset')).toBe(true);
  });
});

describe('transport protocols', () => {
  it('completes a TCP handshake to a listening service', () => {
    const { project, client } = clientServer();
    const outcome = new NetworkSimulator(project).run({
      kind: 'tcp',
      sourceId: client.id,
      destinationIp: '192.168.60.10',
      port: 80
    });
    expect(outcome.success).toBe(true);
    expect(outcome.events.some((event) => event.type === 'tcp-established')).toBe(true);
  });

  it('resets a TCP connection to a port with no listener', () => {
    const { project, client } = clientServer();
    const outcome = new NetworkSimulator(project).run({
      kind: 'tcp',
      sourceId: client.id,
      destinationIp: '192.168.60.10',
      port: 22
    });
    expect(outcome.success).toBe(false);
    expect(outcome.summary).toContain('connection refused on port 22');
    expect(outcome.events.some((event) => event.type === 'service-unavailable')).toBe(true);
    expect(outcome.events.some((event) => event.type === 'tcp-reset')).toBe(true);
  });

  it('delivers a UDP datagram to an end host', () => {
    const { project, client } = clientServer();
    const outcome = new NetworkSimulator(project).run({
      kind: 'udp',
      sourceId: client.id,
      destinationIp: '192.168.60.10',
      port: 1234,
      payload: 'hello over udp'
    });
    expect(outcome.success).toBe(true);
    expect(outcome.events.some((event) => event.type === 'udp-send')).toBe(true);
    expect(outcome.events.some((event) => event.type === 'udp-receive')).toBe(true);
  });

  it('fails a UDP datagram when the destination is not reachable', () => {
    const { project, client } = clientServer();
    const outcome = new NetworkSimulator(project).run({
      kind: 'udp',
      sourceId: client.id,
      destinationIp: '192.168.99.99',
      port: 1234,
      payload: 'lost'
    });
    expect(outcome.success).toBe(false);
    expect(outcome.events.some((event) => event.outcome === 'dropped')).toBe(true);
  });
});

describe('traceroute and TTL', () => {
  it('reveals the router hop before reaching the destination', () => {
    const { project, pcA } = routedNetworks();
    const outcome = new NetworkSimulator(project).run({
      kind: 'tracert',
      sourceId: pcA.id,
      destinationIp: '10.0.0.10'
    });
    expect(outcome.success).toBe(true);
    expect(outcome.hops.length).toBeGreaterThanOrEqual(2);
    expect(outcome.hops[0].deviceName).toBe('R1');
    expect(outcome.hops.some((hop) => hop.reached)).toBe(true);
  });

  it('drops the packet when TTL reaches zero at a router', () => {
    const { project, pcA } = routedNetworks();
    const outcome = new NetworkSimulator(project).run({
      kind: 'ping',
      sourceId: pcA.id,
      destinationIp: '10.0.0.10',
      ttl: 1,
      count: 1
    });
    expect(outcome.success).toBe(false);
    expect(outcome.events.some((event) => event.type === 'ttl-expired')).toBe(true);
  });
});

describe('hardware and media behaviour', () => {
  it('floods broadcasts through a hub', () => {
    const hub = makeDevice('hub', 'HUB1', 500, 300);
    const pcA = makeDevice('pc', 'PC-A', 200, 200, {
      interfaces: [{ name: 'Ethernet0', ip: '172.16.0.10', mask: '255.255.0.0' }]
    });
    const pcB = makeDevice('pc', 'PC-B', 800, 200, {
      interfaces: [{ name: 'Ethernet0', ip: '172.16.0.11', mask: '255.255.0.0' }]
    });
    const project = buildTopology('Hub LAN', [hub, pcA, pcB], [
      makeLink(pcA, 'Ethernet0', hub, 'Port1'),
      makeLink(pcB, 'Ethernet0', hub, 'Port2')
    ]);
    const outcome = new NetworkSimulator(project).run({
      kind: 'ping',
      sourceId: pcA.id,
      destinationIp: '172.16.0.11',
      count: 1
    });
    expect(outcome.success).toBe(true);
    expect(outcome.events.some((event) => event.summary.includes('Hub repeats frame'))).toBe(true);
  });

  it('switches traffic between two clients on the same access point radio', () => {
    const accessPoint = makeDevice('access-point', 'AP1', 500, 300);
    const first = makeDevice('laptop', 'Laptop1', 220, 200, {
      interfaces: [{ name: 'wlan0', ip: '192.168.50.20', mask: '255.255.255.0' }]
    });
    const second = makeDevice('laptop', 'Laptop2', 780, 400, {
      interfaces: [{ name: 'wlan0', ip: '192.168.50.21', mask: '255.255.255.0' }]
    });
    const project = buildTopology('Shared Radio', [accessPoint, first, second], [
      makeLink(first, 'wlan0', accessPoint, 'wlan0', 'wireless'),
      makeLink(second, 'wlan0', accessPoint, 'wlan0', 'wireless')
    ]);
    const simulator = new NetworkSimulator(project);
    const outcome = simulator.run({
      kind: 'ping',
      sourceId: first.id,
      destinationIp: '192.168.50.21',
      count: 1
    });
    expect(outcome.success).toBe(true);
    const macTable = simulator.getMacTable(accessPoint.id);
    const firstRadio = first.interfaces.find((entry) => entry.name === 'wlan0');
    const secondRadio = second.interfaces.find((entry) => entry.name === 'wlan0');
    expect(macTable.find((row) => row.mac === firstRadio?.mac)?.interfaceName).toBe('wlan0');
    expect(macTable.find((row) => row.mac === secondRadio?.mac)?.interfaceName).toBe('wlan0');
  });

  it('bridges two wireless clients through the LAN side of a wireless router', () => {
    const router = makeDevice('wireless-router', 'HomeRouter', 500, 260, {
      interfaces: [{ name: 'wlan0', ip: '192.168.1.1', mask: '255.255.255.0' }]
    });
    const laptop = makeDevice('laptop', 'Laptop1', 220, 200, {
      interfaces: [{ name: 'wlan0', ip: '192.168.1.10', mask: '255.255.255.0' }],
      gateway: '192.168.1.1'
    });
    const printer = makeDevice('printer', 'Printer1', 780, 420, {
      interfaces: [{ name: 'wlan0', ip: '192.168.1.20', mask: '255.255.255.0' }],
      gateway: '192.168.1.1'
    });
    const project = buildTopology('Home Wireless', [router, laptop, printer], [
      makeLink(router, 'wlan0', laptop, 'wlan0', 'wireless'),
      makeLink(router, 'wlan0', printer, 'wlan0', 'wireless')
    ]);
    const outcome = new NetworkSimulator(project).run({
      kind: 'ping',
      sourceId: laptop.id,
      destinationIp: '192.168.1.20',
      count: 1
    });
    expect(outcome.success).toBe(true);
    expect(outcome.events.some((event) => event.type === 'frame-forwarded' && event.deviceId === router.id)).toBe(true);
  });

  it('carries frames across a wireless client association', () => {
    const accessPoint = makeDevice('access-point', 'AP1', 500, 300);
    const laptop = makeDevice('laptop', 'Laptop1', 220, 220, {
      interfaces: [{ name: 'wlan0', ip: '192.168.50.20', mask: '255.255.255.0' }]
    });
    const server = makeDevice('server', 'SRV1', 780, 220, {
      interfaces: [{ name: 'Ethernet0', ip: '192.168.50.10', mask: '255.255.255.0' }]
    });
    const project = buildTopology('Wireless LAN', [accessPoint, laptop, server], [
      makeLink(laptop, 'wlan0', accessPoint, 'wlan0', 'wireless'),
      makeLink(accessPoint, 'Ethernet0', server, 'Ethernet0', 'fiber')
    ]);
    const outcome = new NetworkSimulator(project).run({
      kind: 'ping',
      sourceId: laptop.id,
      destinationIp: '192.168.50.10',
      count: 1
    });
    expect(outcome.success).toBe(true);
  });
});
