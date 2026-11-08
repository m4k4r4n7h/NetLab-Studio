import type { TopologyTemplate } from './types';
import { buildTopology, makeDevice, makeLink } from './builders';

const homeNetwork = (): ReturnType<typeof buildTopology> => {
  const router = makeDevice('wireless-router', 'HomeRouter', 420, 180, {
    interfaces: [{ name: 'wlan0', ip: '192.168.1.1', mask: '255.255.255.0' }],
    notes: 'Wireless clients associate to wlan0. The router is the default gateway for the home LAN.'
  });
  const laptop = makeDevice('laptop', 'FamilyLaptop', 220, 360, {
    interfaces: [{ name: 'wlan0', ip: '192.168.1.10', mask: '255.255.255.0' }],
    gateway: '192.168.1.1',
    dnsServer: '192.168.1.1'
  });
  const printer = makeDevice('printer', 'HomePrinter', 620, 360, {
    interfaces: [{ name: 'wlan0', ip: '192.168.1.20', mask: '255.255.255.0' }],
    gateway: '192.168.1.1'
  });
  return buildTopology('Basic Home Network', [router, laptop, printer], [
    makeLink(router, 'wlan0', laptop, 'wlan0', 'wireless'),
    makeLink(router, 'wlan0', printer, 'wlan0', 'wireless')
  ]);
};

const smallOffice = (): ReturnType<typeof buildTopology> => {
  const networkSwitch = makeDevice('switch', 'OfficeSwitch', 520, 280);
  const pcA = makeDevice('pc', 'ReceptionPC', 220, 150, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.10.10', mask: '255.255.255.0' }],
    dnsServer: '192.168.10.100'
  });
  const pcB = makeDevice('pc', 'AccountsPC', 220, 400, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.10.11', mask: '255.255.255.0' }],
    dnsServer: '192.168.10.100'
  });
  const pcC = makeDevice('pc', 'SupportPC', 720, 400, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.10.12', mask: '255.255.255.0' }],
    dnsServer: '192.168.10.100'
  });
  const printer = makeDevice('printer', 'OfficePrinter', 720, 150, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.10.20', mask: '255.255.255.0' }]
  });
  const server = makeDevice('server', 'OfficeServer', 900, 280, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.10.100', mask: '255.255.255.0' }],
    dnsService: true,
    httpService: true,
    dnsRecords: [{ name: 'intranet.office.local', address: '192.168.10.100' }],
    httpContent: '<h1>Office Intranet</h1><p>Welcome to the small office LAN.</p>'
  });
  return buildTopology('Small Office LAN', [networkSwitch, pcA, pcB, pcC, printer, server], [
    makeLink(pcA, 'Ethernet0', networkSwitch, 'FastEthernet0/1'),
    makeLink(pcB, 'Ethernet0', networkSwitch, 'FastEthernet0/2'),
    makeLink(pcC, 'Ethernet0', networkSwitch, 'FastEthernet0/3'),
    makeLink(printer, 'Ethernet0', networkSwitch, 'FastEthernet0/4'),
    makeLink(server, 'Ethernet0', networkSwitch, 'FastEthernet0/5')
  ]);
};

const corporate = (): ReturnType<typeof buildTopology> => {
  const router = makeDevice('router', 'CoreRouter', 560, 260, {
    interfaces: [
      { name: 'GigabitEthernet0/0', ip: '10.0.1.1', mask: '255.255.255.0' },
      { name: 'GigabitEthernet0/1', ip: '10.0.2.1', mask: '255.255.255.0' }
    ],
    notes: 'Both subnets are directly connected, so no static routes are required.'
  });
  const switchA = makeDevice('switch', 'Floor1Switch', 300, 260);
  const switchB = makeDevice('switch', 'Floor2Switch', 820, 260);
  const pcA = makeDevice('pc', 'Floor1PC1', 160, 110, {
    interfaces: [{ name: 'Ethernet0', ip: '10.0.1.10', mask: '255.255.255.0' }],
    gateway: '10.0.1.1'
  });
  const pcB = makeDevice('pc', 'Floor1PC2', 160, 400, {
    interfaces: [{ name: 'Ethernet0', ip: '10.0.1.11', mask: '255.255.255.0' }],
    gateway: '10.0.1.1'
  });
  const pcC = makeDevice('pc', 'Floor2PC1', 960, 110, {
    interfaces: [{ name: 'Ethernet0', ip: '10.0.2.10', mask: '255.255.255.0' }],
    gateway: '10.0.2.1'
  });
  const pcD = makeDevice('pc', 'Floor2PC2', 960, 400, {
    interfaces: [{ name: 'Ethernet0', ip: '10.0.2.11', mask: '255.255.255.0' }],
    gateway: '10.0.2.1'
  });
  return buildTopology('Two-Subnet Corporate Network', [router, switchA, switchB, pcA, pcB, pcC, pcD], [
    makeLink(switchA, 'FastEthernet0/1', router, 'GigabitEthernet0/0'),
    makeLink(switchA, 'FastEthernet0/2', pcA, 'Ethernet0'),
    makeLink(switchA, 'FastEthernet0/3', pcB, 'Ethernet0'),
    makeLink(switchB, 'FastEthernet0/1', router, 'GigabitEthernet0/1'),
    makeLink(switchB, 'FastEthernet0/2', pcC, 'Ethernet0'),
    makeLink(switchB, 'FastEthernet0/3', pcD, 'Ethernet0')
  ]);
};

const clientServer = (): ReturnType<typeof buildTopology> => {
  const networkSwitch = makeDevice('switch', 'LabSwitch', 520, 300);
  const server = makeDevice('server', 'AppServer', 780, 160, {
    interfaces: [{ name: 'Ethernet0', ip: '172.16.0.100', mask: '255.255.255.0' }],
    dnsService: true,
    httpService: true,
    dnsRecords: [{ name: 'app.netlab.test', address: '172.16.0.100' }],
    httpContent: '<h1>Application Server</h1><p>The client-server topology is online.</p>'
  });
  const pcA = makeDevice('pc', 'ClientPC1', 260, 160, {
    interfaces: [{ name: 'Ethernet0', ip: '172.16.0.10', mask: '255.255.255.0' }],
    dnsServer: '172.16.0.100'
  });
  const pcB = makeDevice('pc', 'ClientPC2', 260, 420, {
    interfaces: [{ name: 'Ethernet0', ip: '172.16.0.11', mask: '255.255.255.0' }],
    dnsServer: '172.16.0.100'
  });
  return buildTopology('Client-Server Architecture', [networkSwitch, server, pcA, pcB], [
    makeLink(pcA, 'Ethernet0', networkSwitch, 'FastEthernet0/1'),
    makeLink(pcB, 'Ethernet0', networkSwitch, 'FastEthernet0/2'),
    makeLink(server, 'Ethernet0', networkSwitch, 'FastEthernet0/3')
  ]);
};

const dnsHttpLab = (): ReturnType<typeof buildTopology> => {
  const networkSwitch = makeDevice('switch', 'ServicesSwitch', 520, 300);
  const server = makeDevice('server', 'WebDnsServer', 800, 160, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.50.10', mask: '255.255.255.0' }],
    dnsService: true,
    httpService: true,
    dnsRecords: [{ name: 'www.lab.test', address: '192.168.50.10' }],
    httpContent: '<h1>NetLab DNS and HTTP Lab</h1><p>This page arrived through the simulated TCP stack.</p>'
  });
  const pcA = makeDevice('pc', 'StudentPC1', 260, 160, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.50.20', mask: '255.255.255.0' }],
    dnsServer: '192.168.50.10'
  });
  const pcB = makeDevice('pc', 'StudentPC2', 260, 420, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.50.21', mask: '255.255.255.0' }],
    dnsServer: '192.168.50.10'
  });
  return buildTopology('DNS and HTTP Lab', [networkSwitch, server, pcA, pcB], [
    makeLink(pcA, 'Ethernet0', networkSwitch, 'FastEthernet0/1'),
    makeLink(pcB, 'Ethernet0', networkSwitch, 'FastEthernet0/2'),
    makeLink(server, 'Ethernet0', networkSwitch, 'FastEthernet0/3')
  ]);
};

const troubleshooting = (): ReturnType<typeof buildTopology> => {
  const router = makeDevice('router', 'EdgeRouter', 560, 260, {
    interfaces: [
      { name: 'GigabitEthernet0/0', ip: '192.168.1.1', mask: '255.255.255.0' },
      { name: 'GigabitEthernet0/1', ip: '192.168.2.1', mask: '255.255.255.0' }
    ]
  });
  const switchA = makeDevice('switch', 'ClientSwitch', 300, 260);
  const switchB = makeDevice('switch', 'ServerSwitch', 830, 260);
  const pc = makeDevice('pc', 'ProblemPC', 160, 150, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.1.10', mask: '255.255.255.0' }],
    gateway: '192.168.1.254',
    dnsServer: '192.168.2.100',
    notes: 'The default gateway looks plausible but is not the router address.'
  });
  const server = makeDevice('server', 'FileServer', 980, 150, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.2.100', mask: '255.255.255.0' }],
    gateway: '192.168.2.1',
    dnsService: true,
    httpService: true,
    dnsRecords: [{ name: 'files.lab.test', address: '192.168.2.100' }]
  });
  return buildTopology('Troubleshooting Lab', [router, switchA, switchB, pc, server], [
    makeLink(switchA, 'FastEthernet0/1', router, 'GigabitEthernet0/0'),
    makeLink(switchA, 'FastEthernet0/2', pc, 'Ethernet0'),
    makeLink(switchB, 'FastEthernet0/1', router, 'GigabitEthernet0/1'),
    makeLink(switchB, 'FastEthernet0/2', server, 'Ethernet0')
  ]);
};

export const TOPOLOGY_TEMPLATES: TopologyTemplate[] = [
  {
    id: 'home-network',
    title: 'Basic Home Network',
    description: 'A wireless router serving a laptop and a network printer.',
    build: homeNetwork
  },
  {
    id: 'small-office',
    title: 'Small Office LAN',
    description: 'A switched office LAN with workstations, a printer, and an intranet server.',
    build: smallOffice
  },
  {
    id: 'two-subnet-corporate',
    title: 'Two-Subnet Corporate Network',
    description: 'Two floors separated into subnets and joined by a router with connected routes.',
    build: corporate
  },
  {
    id: 'client-server',
    title: 'Client-Server Architecture',
    description: 'Two clients using DNS and HTTP services provided by a single server.',
    build: clientServer
  },
  {
    id: 'dns-http',
    title: 'DNS and HTTP Lab',
    description: 'A dedicated services lab for practising name resolution and web requests.',
    build: dnsHttpLab
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting Lab',
    description: 'A working network with one incorrect default gateway to diagnose.',
    build: troubleshooting
  }
];
