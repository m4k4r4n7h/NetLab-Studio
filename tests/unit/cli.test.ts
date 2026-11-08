import { describe, expect, it } from 'vitest';
import { executeCliCommand } from '../../src/cli/CommandProcessor';
import type { CliContext, CliResult, CliSession } from '../../src/cli/CommandProcessor';
import { buildTopology, makeDevice } from '../../src/labs/builders';
import { NetworkSimulator } from '../../src/engine/core/NetworkSimulator';
import type { Device, Project } from '../../src/types';

function harness(project: Project) {
  const deviceById = (id: string): Device => {
    const device = project.devices.find((entry) => entry.id === id);
    if (!device) throw new Error(`Missing device ${id}`);
    return device;
  };

  const ctx: CliContext = {
    project,
    run: (request) => new NetworkSimulator(project).run(request),
    updateInterface: (deviceId, interfaceId, patch) => {
      const entry = deviceById(deviceId).interfaces.find((item) => item.id === interfaceId);
      if (entry) Object.assign(entry, patch);
    },
    updateDevice: (deviceId, patch) => {
      Object.assign(deviceById(deviceId), patch);
    },
    addStaticRoute: (deviceId, route) => {
      const device = deviceById(deviceId);
      device.staticRoutes = [...device.staticRoutes, { id: `route-${device.staticRoutes.length}`, ...route }];
    },
    removeStaticRoute: (deviceId, routeId) => {
      const device = deviceById(deviceId);
      device.staticRoutes = device.staticRoutes.filter((route) => route.id !== routeId);
    },
    getMacTable: () => [],
    getArpCache: () => []
  };

  const send = (device: Device, line: string, session: CliSession): CliResult =>
    executeCliCommand(device, line, session, ctx);

  return { send, deviceById };
}

function runCommands(
  send: (device: Device, line: string, session: CliSession) => CliResult,
  device: Device,
  commands: string[]
): CliResult {
  let result: CliResult = { lines: [], session: { mode: 'exec' } };
  for (const command of commands) {
    result = send(device, command, result.session);
  }
  return result;
}

describe('CLI router configuration', () => {
  it('applies interface addresses and reports directly connected routes', () => {
    const router = makeDevice('router', 'R1', 400, 300);
    const project = buildTopology('CLI Router', [router], []);
    const { send } = harness(project);

    const result = runCommands(send, router, [
      'enable',
      'configure terminal',
      'interface GigabitEthernet0/0',
      'ip address 192.168.1.1 255.255.255.0',
      'no shutdown',
      'exit',
      'interface GigabitEthernet0/1',
      'ip address 10.0.0.1 255.255.255.0',
      'end'
    ]);

    expect(result.session.mode).toBe('privileged');
    const lan = router.interfaces.find((entry) => entry.name === 'GigabitEthernet0/0');
    const wan = router.interfaces.find((entry) => entry.name === 'GigabitEthernet0/1');
    expect(lan?.ip).toBe('192.168.1.1');
    expect(lan?.mask).toBe('255.255.255.0');
    expect(lan?.enabled).toBe(true);
    expect(wan?.ip).toBe('10.0.0.1');

    const routeLines = send(router, 'show ip route', result.session).lines.join('\n');
    expect(routeLines).toContain('192.168.1.0/24 is directly connected, GigabitEthernet0/0');
    expect(routeLines).toContain('10.0.0.0/24 is directly connected, GigabitEthernet0/1');
  });

  it('installs and removes a static route', () => {
    const router = makeDevice('router', 'R1', 400, 300, {
      interfaces: [{ name: 'GigabitEthernet0/0', ip: '192.168.1.1', mask: '255.255.255.0' }]
    });
    const project = buildTopology('CLI Routes', [router], []);
    const { send } = harness(project);

    const installed = runCommands(send, router, [
      'enable',
      'configure terminal',
      'ip route 172.16.0.0 255.255.0.0 192.168.1.254',
      'hostname EdgeRouter',
      'end'
    ]);

    expect(router.staticRoutes).toHaveLength(1);
    expect(router.staticRoutes[0].network).toBe('172.16.0.0');
    expect(router.name).toBe('EdgeRouter');
    expect(send(router, 'show ip route', installed.session).lines.join('\n')).toContain('172.16.0.0/16');

    const removed = runCommands(send, router, [
      'enable',
      'configure terminal',
      'no ip route 172.16.0.0 255.255.0.0'
    ]);

    expect(removed.lines.join('\n')).toContain('Removed 1 static route');
    expect(router.staticRoutes).toHaveLength(0);
  });

  it('rejects invalid addresses without changing the interface', () => {
    const router = makeDevice('router', 'R1', 400, 300);
    const project = buildTopology('CLI Invalid', [router], []);
    const { send } = harness(project);

    const result = runCommands(send, router, [
      'enable',
      'configure terminal',
      'interface GigabitEthernet0/0',
      'ip address 192.168.1.999 255.255.255.0'
    ]);

    expect(result.lines.join('\n')).toContain('Invalid IPv4 address');
    expect(router.interfaces[0].ip).toBe('');
  });

  it('rejects network and broadcast interface addresses', () => {
    const router = makeDevice('router', 'R1', 400, 300);
    const project = buildTopology('CLI Host Addresses', [router], []);
    const { send } = harness(project);

    const network = runCommands(send, router, [
      'enable',
      'configure terminal',
      'interface GigabitEthernet0/0',
      'ip address 192.168.1.0 255.255.255.0'
    ]);
    expect(network.lines.join('\n')).toContain('network address');
    expect(router.interfaces[0].ip).toBe('');

    const broadcast = runCommands(send, router, [
      'enable',
      'configure terminal',
      'interface GigabitEthernet0/0',
      'ip address 192.168.1.255 255.255.255.0'
    ]);
    expect(broadcast.lines.join('\n')).toContain('broadcast address');
    expect(router.interfaces[0].ip).toBe('');
  });

  it('requires privileged mode before diagnostics', () => {
    const router = makeDevice('router', 'R1', 400, 300);
    const project = buildTopology('CLI Diagnostics', [router], []);
    const { send } = harness(project);

    const result = send(router, 'ping 192.168.1.1', { mode: 'exec' });
    expect(result.lines.join('\n')).toContain('Enter enable');
  });
});

describe('CLI host commands', () => {
  it('shows host configuration and reports the engine outcome for a ping', () => {
    const switchDevice = makeDevice('switch', 'SW1', 520, 300);
    const pcA = makeDevice('pc', 'PC-A', 240, 160, {
      interfaces: [{ name: 'Ethernet0', ip: '192.168.1.10', mask: '255.255.255.0' }]
    });
    const pcB = makeDevice('pc', 'PC-B', 240, 440, {
      interfaces: [{ name: 'Ethernet0', ip: '192.168.1.11', mask: '255.255.255.0' }]
    });
    const project = buildTopology('CLI Hosts', [switchDevice, pcA, pcB], [
      { id: 'link-a', cable: 'copper-straight-through', a: { deviceId: pcA.id, interfaceId: pcA.interfaces[0].id }, b: { deviceId: switchDevice.id, interfaceId: switchDevice.interfaces[0].id } },
      { id: 'link-b', cable: 'copper-straight-through', a: { deviceId: pcB.id, interfaceId: pcB.interfaces[0].id }, b: { deviceId: switchDevice.id, interfaceId: switchDevice.interfaces[1].id } }
    ]);
    const { send } = harness(project);

    const ipconfig = send(pcA, 'ipconfig', { mode: 'exec' }).lines.join('\n');
    expect(ipconfig).toContain('192.168.1.10');
    expect(ipconfig).toContain('255.255.255.0');

    const ping = send(pcA, 'ping 192.168.1.11', { mode: 'exec' }).lines.join('\n');
    expect(ping).toMatch(/Reply from 192\.168\.1\.11|bytes from 192\.168\.1\.11|4 received|4\/4/);

    const cleared = send(pcA, 'clear', { mode: 'exec' });
    expect(cleared.lines).toContain('__CLEAR__');
  });
});
