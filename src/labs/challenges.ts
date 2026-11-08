import type { NetworkChallenge } from './types';
import {
  buildTopology,
  check,
  deviceNamed,
  dnsCheck,
  finalizeValidation,
  httpCheck,
  makeDevice,
  makeLink,
  pingCheck
} from './builders';
import { buildRoutingTable } from '../engine/routing/routingTable';
import { maskToPrefix } from '../utils/ipv4';

const wrongGateway = () => {
  const router = makeDevice('router', 'Router1', 560, 260, {
    interfaces: [
      { name: 'GigabitEthernet0/0', ip: '192.168.10.1', mask: '255.255.255.0' },
      { name: 'GigabitEthernet0/1', ip: '192.168.20.1', mask: '255.255.255.0' }
    ]
  });
  const switchA = makeDevice('switch', 'ClientSwitch', 300, 260);
  const switchB = makeDevice('switch', 'ServerSwitch', 830, 260);
  const pc = makeDevice('pc', 'ClientPC', 160, 150, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.10.10', mask: '255.255.255.0' }],
    gateway: '192.168.10.254'
  });
  const server = makeDevice('server', 'WebServer', 980, 150, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.20.50', mask: '255.255.255.0' }],
    gateway: '192.168.20.1',
    httpService: true
  });
  return buildTopology('Challenge - Wrong Default Gateway', [router, switchA, switchB, pc, server], [
    makeLink(switchA, 'FastEthernet0/1', router, 'GigabitEthernet0/0'),
    makeLink(switchA, 'FastEthernet0/2', pc, 'Ethernet0'),
    makeLink(switchB, 'FastEthernet0/1', router, 'GigabitEthernet0/1'),
    makeLink(switchB, 'FastEthernet0/2', server, 'Ethernet0')
  ]);
};

const maskMismatch = () => {
  const networkSwitch = makeDevice('switch', 'SharedSwitch', 520, 300);
  const pcA = makeDevice('pc', 'PC-A', 260, 150, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.1.10', mask: '255.255.255.0' }]
  });
  const pcB = makeDevice('pc', 'PC-B', 260, 450, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.1.130', mask: '255.255.255.128' }]
  });
  return buildTopology('Challenge - Subnet Mask Mismatch', [networkSwitch, pcA, pcB], [
    makeLink(pcA, 'Ethernet0', networkSwitch, 'FastEthernet0/1'),
    makeLink(pcB, 'Ethernet0', networkSwitch, 'FastEthernet0/2')
  ]);
};

const disabledUplink = () => {
  const router = makeDevice('router', 'Router1', 560, 260, {
    interfaces: [
      { name: 'GigabitEthernet0/0', ip: '192.168.30.1', mask: '255.255.255.0' },
      { name: 'GigabitEthernet0/1', ip: '192.168.40.1', mask: '255.255.255.0', enabled: false }
    ]
  });
  const switchA = makeDevice('switch', 'ClientSwitch', 300, 260);
  const switchB = makeDevice('switch', 'ServerSwitch', 830, 260);
  const pc = makeDevice('pc', 'ClientPC', 160, 150, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.30.10', mask: '255.255.255.0' }],
    gateway: '192.168.30.1'
  });
  const server = makeDevice('server', 'FileServer', 980, 150, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.40.50', mask: '255.255.255.0' }],
    gateway: '192.168.40.1',
    httpService: true
  });
  return buildTopology('Challenge - Disabled Uplink', [router, switchA, switchB, pc, server], [
    makeLink(switchA, 'FastEthernet0/1', router, 'GigabitEthernet0/0'),
    makeLink(switchA, 'FastEthernet0/2', pc, 'Ethernet0'),
    makeLink(switchB, 'FastEthernet0/1', router, 'GigabitEthernet0/1'),
    makeLink(switchB, 'FastEthernet0/2', server, 'Ethernet0')
  ]);
};

const missingRoute = () => {
  const router1 = makeDevice('router', 'Router1', 420, 260, {
    interfaces: [
      { name: 'GigabitEthernet0/0', ip: '10.0.1.1', mask: '255.255.255.0' },
      { name: 'GigabitEthernet0/1', ip: '10.0.12.1', mask: '255.255.255.0' }
    ],
    notes: 'A route to 10.0.2.0/24 is missing.'
  });
  const router2 = makeDevice('router', 'Router2', 760, 260, {
    interfaces: [
      { name: 'GigabitEthernet0/0', ip: '10.0.12.2', mask: '255.255.255.0' },
      { name: 'GigabitEthernet0/1', ip: '10.0.2.1', mask: '255.255.255.0' }
    ],
    routes: [{ network: '10.0.1.0', mask: '255.255.255.0', nextHop: '10.0.12.1' }]
  });
  const pc = makeDevice('pc', 'ClientPC', 160, 150, {
    interfaces: [{ name: 'Ethernet0', ip: '10.0.1.10', mask: '255.255.255.0' }],
    gateway: '10.0.1.1'
  });
  const server = makeDevice('server', 'RemoteServer', 980, 150, {
    interfaces: [{ name: 'Ethernet0', ip: '10.0.2.100', mask: '255.255.255.0' }],
    gateway: '10.0.2.1'
  });
  const switchA = makeDevice('switch', 'ClientSwitch', 260, 260);
  const switchB = makeDevice('switch', 'ServerSwitch', 890, 260);
  return buildTopology('Challenge - Missing Static Route', [router1, router2, pc, server, switchA, switchB], [
    makeLink(pc, 'Ethernet0', switchA, 'FastEthernet0/1'),
    makeLink(switchA, 'FastEthernet0/2', router1, 'GigabitEthernet0/0'),
    makeLink(router1, 'GigabitEthernet0/1', router2, 'GigabitEthernet0/0', 'copper-crossover'),
    makeLink(router2, 'GigabitEthernet0/1', switchB, 'FastEthernet0/1'),
    makeLink(switchB, 'FastEthernet0/2', server, 'Ethernet0')
  ]);
};

const dnsBroken = () => {
  const networkSwitch = makeDevice('switch', 'DnsSwitch', 520, 300);
  const server = makeDevice('server', 'DnsServer', 800, 160, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.80.10', mask: '255.255.255.0' }],
    dnsService: true,
    dnsRecords: [{ name: 'old.lab.test', address: '192.168.80.99' }]
  });
  const pc = makeDevice('pc', 'ClientPC', 260, 300, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.80.20', mask: '255.255.255.0' }],
    dnsServer: '192.168.80.10'
  });
  return buildTopology('Challenge - Missing DNS Record', [networkSwitch, server, pc], [
    makeLink(server, 'Ethernet0', networkSwitch, 'FastEthernet0/1'),
    makeLink(pc, 'Ethernet0', networkSwitch, 'FastEthernet0/2')
  ]);
};

const httpBroken = () => {
  const networkSwitch = makeDevice('switch', 'WebSwitch', 520, 300);
  const server = makeDevice('server', 'WebServer', 800, 160, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.90.10', mask: '255.255.255.0' }],
    httpService: false,
    httpContent: '<h1>NetLab Lab Server</h1><p>Service is currently disabled.</p>'
  });
  const pc = makeDevice('pc', 'ClientPC', 260, 300, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.90.20', mask: '255.255.255.0' }]
  });
  return buildTopology('Challenge - HTTP Service Down', [networkSwitch, server, pc], [
    makeLink(server, 'Ethernet0', networkSwitch, 'FastEthernet0/1'),
    makeLink(pc, 'Ethernet0', networkSwitch, 'FastEthernet0/2')
  ]);
};

export const CHALLENGES: NetworkChallenge[] = [
  {
    id: 'challenge-gateway',
    title: 'Wrong Default Gateway',
    difficulty: 'Beginner',
    brief: 'ClientPC and WebServer sit on different subnets. Remote access fails.',
    symptoms: ['Ping to 192.168.20.50 fails', 'The client address and mask are correct', 'The router interfaces are correct'],
    hints: ['Compare the client gateway with the router LAN address.', 'The gateway must be inside 192.168.10.0/24.'],
    build: wrongGateway,
    validate: (project) => finalizeValidation([
      check('ClientPC gateway is 192.168.10.1', deviceNamed(project, 'ClientPC')?.gateway === '192.168.10.1'),
      pingCheck(project, 'ClientPC', '192.168.20.50', 'ClientPC can ping the server')
    ])
  },
  {
    id: 'challenge-mask',
    title: 'Subnet Mask Mismatch',
    difficulty: 'Beginner',
    brief: 'Two hosts on the same switch cannot communicate even though their addresses look adjacent.',
    symptoms: ['PC-A sees 192.168.1.130 as local', 'PC-B treats 192.168.1.10 as remote', 'No router is present'],
    hints: ['One host uses /25 instead of /24.', 'Both hosts must agree on the mask.'],
    build: maskMismatch,
    validate: (project) => {
      const pcA = deviceNamed(project, 'PC-A');
      const pcB = deviceNamed(project, 'PC-B');
      const maskA = pcA?.interfaces[0].mask;
      const maskB = pcB?.interfaces[0].mask;
      return finalizeValidation([
        check('PC-A and PC-B both use /24', Boolean(maskA && maskB && maskToPrefix(maskA) === 24 && maskToPrefix(maskB) === 24)),
        pingCheck(project, 'PC-A', '192.168.1.130', 'PC-A can ping PC-B')
      ]);
    }
  },
  {
    id: 'challenge-uplink',
    title: 'Disabled Uplink',
    difficulty: 'Beginner',
    brief: 'A router interface facing the server LAN has been shut down.',
    symptoms: ['Ping to 192.168.40.50 fails', 'Client LAN works locally', 'No route error appears; the link is down'],
    hints: ['Inspect Router1 interface status.', 'Re-enable GigabitEthernet0/1 from the inspector or CLI.'],
    build: disabledUplink,
    validate: (project) => {
      const router = deviceNamed(project, 'Router1');
      const uplink = router?.interfaces.find((entry) => entry.name === 'GigabitEthernet0/1');
      return finalizeValidation([
        check('GigabitEthernet0/1 is enabled', Boolean(uplink?.enabled)),
        pingCheck(project, 'ClientPC', '192.168.40.50', 'ClientPC can ping the server')
      ]);
    }
  },
  {
    id: 'challenge-route',
    title: 'Missing Static Route',
    difficulty: 'Advanced',
    brief: 'Two routers connect two LANs, but the return path is incomplete.',
    symptoms: ['Ping from ClientPC to 10.0.2.100 fails', 'Router2 has a route back to 10.0.1.0/24', 'Router1 knows only its connected networks'],
    hints: ['Add 10.0.2.0/24 via 10.0.12.2 on Router1.', 'Use the inspector or ip route in configuration mode.'],
    build: missingRoute,
    validate: (project) => {
      const router1 = deviceNamed(project, 'Router1');
      const table = router1 ? buildRoutingTable(router1) : [];
      const hasRoute = table.some((row) => row.network === '10.0.2.0' && row.prefix === 24 && row.nextHop === '10.0.12.2');
      return finalizeValidation([
        check('Router1 has a route to 10.0.2.0/24 via 10.0.12.2', hasRoute),
        pingCheck(project, 'ClientPC', '10.0.2.100', 'ClientPC can ping the remote server')
      ]);
    }
  },
  {
    id: 'challenge-dns',
    title: 'Missing DNS Record',
    difficulty: 'Intermediate',
    brief: 'The DNS server is reachable and running, but the requested name does not exist.',
    symptoms: ['ClientPC can ping 192.168.80.10', 'nslookup www.lab.test returns NXDOMAIN', 'The DNS server has an unrelated record'],
    hints: ['Add an A record on DnsServer.', 'Map www.lab.test to 192.168.80.10.'],
    build: dnsBroken,
    validate: (project) => finalizeValidation([
      dnsCheck(project, 'ClientPC', 'www.lab.test', '192.168.80.10', 'ClientPC resolves www.lab.test')
    ])
  },
  {
    id: 'challenge-http',
    title: 'HTTP Service Down',
    difficulty: 'Intermediate',
    brief: 'The web server answers pings but refuses TCP port 80.',
    symptoms: ['Ping to 192.168.90.10 succeeds', 'HTTP GET fails', 'The server page content already exists'],
    hints: ['Enable the HTTP service on WebServer.', 'Watch for a TCP RST event in the simulation log.'],
    build: httpBroken,
    validate: (project) => finalizeValidation([
      check('HTTP is enabled on WebServer', Boolean(deviceNamed(project, 'WebServer')?.httpEnabled)),
      httpCheck(project, 'ClientPC', '192.168.90.10', 'NetLab Lab Server', 'ClientPC retrieves the web page')
    ])
  }
];
