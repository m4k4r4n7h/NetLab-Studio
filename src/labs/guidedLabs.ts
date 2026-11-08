import type { GuidedLab } from './types';
import {
  buildTopology,
  check,
  configuredOnSubnet,
  deviceNamed,
  dnsCheck,
  finalizeValidation,
  hostIsUsable,
  httpCheck,
  interfaceNamed,
  isLinked,
  makeDevice,
  makeLink,
  pingCheck,
  primaryAddress,
  validClient
} from './builders';
import { buildRoutingTable } from '../engine/routing/routingTable';
import { maskToPrefix, sameSubnet, subnetDetails } from '../utils/ipv4';

const basicLan = () => {
  const networkSwitch = makeDevice('switch', 'LabSwitch', 520, 300);
  const pcA = makeDevice('pc', 'PC-A', 260, 150, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.1.10', mask: '255.255.255.0' }]
  });
  const pcB = makeDevice('pc', 'PC-B', 260, 450, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.1.11', mask: '255.255.255.0' }]
  });
  return buildTopology('Guided Lab - Basic LAN', [networkSwitch, pcA, pcB], [
    makeLink(pcA, 'Ethernet0', networkSwitch, 'FastEthernet0/1'),
    makeLink(pcB, 'Ethernet0', networkSwitch, 'FastEthernet0/2')
  ]);
};

const starTopology = () => {
  const networkSwitch = makeDevice('switch', 'StarSwitch', 560, 300);
  const pcs = [
    makeDevice('pc', 'PC-A', 220, 100),
    makeDevice('pc', 'PC-B', 220, 300),
    makeDevice('pc', 'PC-C', 220, 500),
    makeDevice('pc', 'PC-D', 900, 300)
  ];
  return buildTopology('Guided Lab - Star Topology', [networkSwitch, ...pcs], []);
};

const ipv4Lab = () => {
  const networkSwitch = makeDevice('switch', 'AddressSwitch', 520, 300);
  const pcA = makeDevice('pc', 'PC-A', 260, 150, { notes: 'Assign 192.168.1.10/24.' });
  const pcB = makeDevice('pc', 'PC-B', 260, 450, { notes: 'Assign 192.168.1.11/24.' });
  return buildTopology('Guided Lab - IPv4 Addresses', [networkSwitch, pcA, pcB], [
    makeLink(pcA, 'Ethernet0', networkSwitch, 'FastEthernet0/1'),
    makeLink(pcB, 'Ethernet0', networkSwitch, 'FastEthernet0/2')
  ]);
};

const slash24Lab = () => {
  const networkSwitch = makeDevice('switch', 'ClassCSwitch', 520, 300);
  const pcs = [
    makeDevice('pc', 'PC-A', 220, 100, { notes: 'Assign 192.168.5.10/24.' }),
    makeDevice('pc', 'PC-B', 220, 300, { notes: 'Assign 192.168.5.11/24.' }),
    makeDevice('pc', 'PC-C', 220, 500, { notes: 'Assign 192.168.5.12/24.' })
  ];
  return buildTopology('Guided Lab - Configure a /24', [networkSwitch, ...pcs], pcs.map((pc, index) => (
    makeLink(pc, 'Ethernet0', networkSwitch, `FastEthernet0/${index + 1}`)
  )));
};

const slash26Lab = () => {
  const networkSwitch = makeDevice('switch', 'SubnetSwitch', 560, 300);
  const pcs = [
    makeDevice('pc', 'PC-A', 200, 90, { notes: 'Use the first /26 of 192.168.1.0/24.' }),
    makeDevice('pc', 'PC-B', 200, 280, { notes: 'Use the second /26 of 192.168.1.0/24.' }),
    makeDevice('pc', 'PC-C', 200, 470, { notes: 'Use the third /26 of 192.168.1.0/24.' }),
    makeDevice('pc', 'PC-D', 920, 280, { notes: 'Use the fourth /26 of 192.168.1.0/24.' })
  ];
  return buildTopology('Guided Lab - Four /26 Subnets', [networkSwitch, ...pcs], pcs.map((pc, index) => (
    makeLink(pc, 'Ethernet0', networkSwitch, `FastEthernet0/${index + 1}`)
  )));
};

const twoSubnetLab = (configured: boolean) => {
  const router = makeDevice('router', 'Router1', 560, 280, {
    interfaces: [
      { name: 'GigabitEthernet0/0', ip: '10.1.1.1', mask: '255.255.255.0' },
      { name: 'GigabitEthernet0/1', ip: '10.2.2.1', mask: '255.255.255.0' }
    ],
    notes: 'Both interfaces are already addressed. Clients need an address and a gateway.'
  });
  const switchA = makeDevice('switch', 'SwitchA', 300, 280);
  const switchB = makeDevice('switch', 'SwitchB', 830, 280);
  const pcA = makeDevice('pc', 'PC-A', 160, 140, configured
    ? { interfaces: [{ name: 'Ethernet0', ip: '10.1.1.10', mask: '255.255.255.0' }], gateway: '10.1.1.1' }
    : { notes: 'Assign 10.1.1.10/24 with gateway 10.1.1.1.' });
  const pcB = makeDevice('pc', 'PC-B', 980, 140, configured
    ? { interfaces: [{ name: 'Ethernet0', ip: '10.2.2.10', mask: '255.255.255.0' }], gateway: '10.2.2.1' }
    : { notes: 'Assign 10.2.2.10/24 with gateway 10.2.2.1.' });
  return buildTopology(
    configured ? 'Guided Lab - Directly Connected Routes' : 'Guided Lab - Two Subnets with a Router',
    [router, switchA, switchB, pcA, pcB],
    [
      makeLink(switchA, 'FastEthernet0/1', router, 'GigabitEthernet0/0'),
      makeLink(switchA, 'FastEthernet0/2', pcA, 'Ethernet0'),
      makeLink(switchB, 'FastEthernet0/1', router, 'GigabitEthernet0/1'),
      makeLink(switchB, 'FastEthernet0/2', pcB, 'Ethernet0')
    ]
  );
};

const dnsLab = () => {
  const networkSwitch = makeDevice('switch', 'DnsSwitch', 520, 300);
  const server = makeDevice('server', 'DnsServer', 800, 160, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.60.10', mask: '255.255.255.0' }],
    notes: 'Enable DNS and add an A record for www.lab.local pointing to 192.168.60.10.'
  });
  const pc = makeDevice('pc', 'DNS-Client', 260, 300, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.60.20', mask: '255.255.255.0' }],
    dnsServer: '192.168.60.10'
  });
  return buildTopology('Guided Lab - Configure DNS', [networkSwitch, server, pc], [
    makeLink(server, 'Ethernet0', networkSwitch, 'FastEthernet0/1'),
    makeLink(pc, 'Ethernet0', networkSwitch, 'FastEthernet0/2')
  ]);
};

const httpLab = () => {
  const networkSwitch = makeDevice('switch', 'WebSwitch', 520, 300);
  const server = makeDevice('server', 'WebServer', 800, 160, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.70.10', mask: '255.255.255.0' }],
    notes: 'Enable HTTP and include the text NetLab Lab Server in the page content.'
  });
  const pc = makeDevice('pc', 'WebClient', 260, 300, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.70.20', mask: '255.255.255.0' }]
  });
  return buildTopology('Guided Lab - Configure HTTP', [networkSwitch, server, pc], [
    makeLink(server, 'Ethernet0', networkSwitch, 'FastEthernet0/1'),
    makeLink(pc, 'Ethernet0', networkSwitch, 'FastEthernet0/2')
  ]);
};

const gatewayLab = () => {
  const router = makeDevice('router', 'GatewayRouter', 560, 260, {
    interfaces: [
      { name: 'GigabitEthernet0/0', ip: '192.168.1.1', mask: '255.255.255.0' },
      { name: 'GigabitEthernet0/1', ip: '192.168.2.1', mask: '255.255.255.0' }
    ]
  });
  const switchA = makeDevice('switch', 'ClientSwitch', 300, 260);
  const switchB = makeDevice('switch', 'ServerSwitch', 830, 260);
  const pc = makeDevice('pc', 'ClientPC', 160, 150, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.1.10', mask: '255.255.255.0' }],
    gateway: '192.168.1.254',
    notes: 'The remote server is 192.168.2.100. Fix the default gateway.'
  });
  const server = makeDevice('server', 'TargetServer', 980, 150, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.2.100', mask: '255.255.255.0' }],
    gateway: '192.168.2.1',
    httpService: true,
    dnsService: true,
    dnsRecords: [{ name: 'target.lab.test', address: '192.168.2.100' }]
  });
  return buildTopology('Guided Lab - Troubleshoot the Gateway', [router, switchA, switchB, pc, server], [
    makeLink(switchA, 'FastEthernet0/1', router, 'GigabitEthernet0/0'),
    makeLink(switchA, 'FastEthernet0/2', pc, 'Ethernet0'),
    makeLink(switchB, 'FastEthernet0/1', router, 'GigabitEthernet0/1'),
    makeLink(switchB, 'FastEthernet0/2', server, 'Ethernet0')
  ]);
};

function clientAddress(project: ReturnType<typeof buildTopology>, name: string): string {
  return primaryAddress(deviceNamed(project, name));
}

export const GUIDED_LABS: GuidedLab[] = [
  {
    id: 'basic-lan',
    title: '1. Build a Basic LAN',
    difficulty: 'Beginner',
    summary: 'Verify that two PCs on the same switch and subnet can exchange ICMP echo traffic.',
    steps: [
      'Open PC-A and run ping 192.168.1.11.',
      'Open PC-B and run ping 192.168.1.10.',
      'Inspect the switch MAC address table afterwards.'
    ],
    hints: ['Both hosts are in 192.168.1.0/24, so no router is required.', 'Use the terminal button in the inspector.'],
    build: basicLan,
    validate: (project) => finalizeValidation([
      check('PC-A and PC-B are both connected to the switch', Boolean(
        project.devices.filter((device) => device.kind === 'pc').every((device) => project.links.some((link) => (
          link.a.deviceId === device.id || link.b.deviceId === device.id
        )))
      )),
      pingCheck(project, 'PC-A', '192.168.1.11', 'PC-A can ping PC-B')
    ])
  },
  {
    id: 'star-topology',
    title: '2. Configure a Star Topology',
    difficulty: 'Beginner',
    summary: 'Cable four workstations to a central switch in a star layout.',
    steps: [
      'Select the Copper Straight-Through cable from the Connections category.',
      'Click a PC and the switch, then choose free interfaces in the connection dialog.',
      'Repeat for all four PCs using FastEthernet0/1 through FastEthernet0/4.'
    ],
    hints: ['Each PC has one Ethernet0 interface.', 'Use different switch ports for each PC.'],
    build: starTopology,
    validate: (project) => {
      const pcs = project.devices.filter((device) => device.kind === 'pc');
      const networkSwitch = project.devices.find((device) => device.kind === 'switch');
      const linked = pcs.filter((pc) => networkSwitch && isLinked(project, pc.id, networkSwitch.id));
      return finalizeValidation([
        check('Four PCs are present', pcs.length === 4),
        check('All four PCs connect directly to the switch', linked.length === 4),
        check('No PC connects directly to another PC', !project.links.some((link) => {
          const a = project.devices.find((device) => device.id === link.a.deviceId);
          const b = project.devices.find((device) => device.id === link.b.deviceId);
          return a?.kind === 'pc' && b?.kind === 'pc';
        }))
      ]);
    }
  },
  {
    id: 'ipv4-addresses',
    title: '3. Configure IPv4 Addresses',
    difficulty: 'Beginner',
    summary: 'Assign .10 and .11 inside 192.168.1.0/24 and prove connectivity.',
    steps: [
      'Select PC-A and set Ethernet0 to 192.168.1.10 with mask 255.255.255.0.',
      'Select PC-B and set Ethernet0 to 192.168.1.11 with mask 255.255.255.0.',
      'Ping PC-B from PC-A.'
    ],
    hints: ['Both addresses must use the same mask to belong to the same subnet.', 'Do not use .0 or .255.'],
    build: ipv4Lab,
    validate: (project) => {
      const pcA = deviceNamed(project, 'PC-A');
      const pcB = deviceNamed(project, 'PC-B');
      const addressA = clientAddress(project, 'PC-A');
      const addressB = clientAddress(project, 'PC-B');
      return finalizeValidation([
        check('PC-A has a usable /24 address', validClient(pcA) && Boolean(interfaceNamed(pcA!, 'Ethernet0')?.mask && maskToPrefix(interfaceNamed(pcA!, 'Ethernet0')!.mask) === 24)),
        check('PC-B has a usable /24 address', validClient(pcB) && Boolean(interfaceNamed(pcB!, 'Ethernet0')?.mask && maskToPrefix(interfaceNamed(pcB!, 'Ethernet0')!.mask) === 24)),
        check('Both addresses are in the same subnet', Boolean(addressA && addressB && sameSubnet(addressA, addressB, '255.255.255.0'))),
        pingCheck(project, 'PC-A', addressB || '192.168.1.11', 'Ping succeeds between the hosts')
      ]);
    }
  },
  {
    id: 'slash-24',
    title: '4. Configure a /24 Network',
    difficulty: 'Beginner',
    summary: 'Address three hosts inside 192.168.5.0/24 and verify full reachability.',
    steps: [
      'Assign .10, .11, and .12 to PC-A, PC-B, and PC-C.',
      'Use 255.255.255.0 on every host.',
      'Ping every peer from PC-A.'
    ],
    hints: ['/24 means the first three octets identify the network.', 'Only the last octet changes between hosts.'],
    build: slash24Lab,
    validate: (project) => {
      const pcs = ['PC-A', 'PC-B', 'PC-C'];
      const addresses = pcs.map((name) => clientAddress(project, name));
      return finalizeValidation([
        ...pcs.map((name, index) => check(
          `${name} is a usable host in 192.168.5.0/24`,
          Boolean(addresses[index] && hostIsUsable(addresses[index], '255.255.255.0') && sameSubnet(addresses[index], '192.168.5.1', '255.255.255.0'))
        )),
        check('All three addresses are unique', new Set(addresses.filter(Boolean)).size === 3),
        pingCheck(project, 'PC-A', addresses[1] || '192.168.5.11', 'PC-A can ping PC-B'),
        pingCheck(project, 'PC-A', addresses[2] || '192.168.5.12', 'PC-A can ping PC-C')
      ]);
    }
  },
  {
    id: 'four-slash-26',
    title: '5. Divide a /24 into Four /26 Subnets',
    difficulty: 'Intermediate',
    summary: 'Place one host into each quarter of 192.168.1.0/24 using /26 masks.',
    steps: [
      'Use mask 255.255.255.192 on all four PCs.',
      'Assign one host to each of 192.168.1.0/26, .64/26, .128/26, and .192/26.',
      'Avoid network and broadcast addresses in every block.'
    ],
    hints: [
      '/26 blocks are 64 addresses apart: .0, .64, .128 and .192.',
      'Usable hosts in each block run from network+1 to broadcast-1.'
    ],
    build: slash26Lab,
    validate: (project) => {
      const names = ['PC-A', 'PC-B', 'PC-C', 'PC-D'];
      const mask = '255.255.255.192';
      const subnets = new Set<string>();
          const checks = names.map((name) => {
        const device = deviceNamed(project, name);
        const entry = device ? interfaceNamed(device, 'Ethernet0') : undefined;
        const details = entry?.ip && entry.mask ? subnetDetails(entry.ip, entry.mask) : null;
        if (details) subnets.add(details.network);
        return check(
          `${name} has a usable /26 host address`,
          Boolean(entry && entry.ip && entry.mask && maskToPrefix(entry.mask) === 26 && hostIsUsable(entry.ip, mask))
        );
      });
      return finalizeValidation([
        ...checks,
        check('Each PC is in a different /26 subnet', subnets.size === 4),
        check('All four addresses are unique', new Set(names.map((name) => clientAddress(project, name)).filter(Boolean)).size === 4)
      ]);
    }
  },
  {
    id: 'two-subnets',
    title: '6. Connect Two Subnets Using a Router',
    difficulty: 'Intermediate',
    summary: 'Address both client LANs and route between them through Router1.',
    steps: [
      'Assign 10.1.1.10/24 to PC-A with gateway 10.1.1.1.',
      'Assign 10.2.2.10/24 to PC-B with gateway 10.2.2.1.',
      'Ping PC-B from PC-A and inspect the router events.'
    ],
    hints: ['The gateway must be an address in the client subnet.', 'Router1 already owns 10.1.1.1 and 10.2.2.1.'],
    build: () => twoSubnetLab(false),
    validate: (project) => {
      const router = deviceNamed(project, 'Router1');
      const pcA = deviceNamed(project, 'PC-A');
      const pcB = deviceNamed(project, 'PC-B');
      return finalizeValidation([
        check('PC-A is in 10.1.1.0/24 with gateway 10.1.1.1', configuredOnSubnet(pcA, '10.1.1.0', '255.255.255.0') && pcA?.gateway === '10.1.1.1'),
        check('PC-B is in 10.2.2.0/24 with gateway 10.2.2.1', configuredOnSubnet(pcB, '10.2.2.0', '255.255.255.0') && pcB?.gateway === '10.2.2.1'),
        check('Router interfaces are configured', Boolean(
          router && router.interfaces.some((entry) => entry.ip === '10.1.1.1') && router.interfaces.some((entry) => entry.ip === '10.2.2.1')
        )),
        pingCheck(project, 'PC-A', '10.2.2.10', 'PC-A can reach PC-B across the router')
      ]);
    }
  },
  {
    id: 'connected-routes',
    title: '7. Verify Directly Connected Routes',
    difficulty: 'Intermediate',
    summary: 'Use the routing table and CLI to prove that both subnets are directly connected.',
    steps: [
      'Open Router1 and run show ip route.',
      'Confirm both 10.1.1.0/24 and 10.2.2.0/24 appear as directly connected.',
      'Ping PC-B from PC-A and inspect the router forwarding events.'
    ],
    hints: ['Connected routes are installed automatically from interface addresses.', 'No static route is required for a directly connected subnet.'],
    build: () => twoSubnetLab(true),
    validate: (project) => {
      const router = deviceNamed(project, 'Router1');
      const table = router ? buildRoutingTable(router) : [];
      const hasA = table.some((row) => row.type === 'connected' && row.network === '10.1.1.0' && row.prefix === 24);
      const hasB = table.some((row) => row.type === 'connected' && row.network === '10.2.2.0' && row.prefix === 24);
      return finalizeValidation([
        check('Router1 installs 10.1.1.0/24 as a connected route', hasA),
        check('Router1 installs 10.2.2.0/24 as a connected route', hasB),
        pingCheck(project, 'PC-A', '10.2.2.10', 'End-to-end ping succeeds')
      ]);
    }
  },
  {
    id: 'configure-dns',
    title: '8. Configure DNS',
    difficulty: 'Intermediate',
    summary: 'Turn on the DNS service and publish an A record for www.lab.local.',
    steps: [
      'Select DnsServer and enable the DNS service.',
      'Add an A record: www.lab.local -> 192.168.60.10.',
      'From DNS-Client run nslookup www.lab.local.'
    ],
    hints: ['The client already points at 192.168.60.10 as its DNS server.', 'Names are matched case-insensitively.'],
    build: dnsLab,
    validate: (project) => {
      const server = deviceNamed(project, 'DnsServer');
      return finalizeValidation([
        check('DNS service is enabled on DnsServer', Boolean(server?.dnsEnabled)),
        check('An A record maps www.lab.local to the server', Boolean(server?.dnsRecords.some((record) => record.name.toLowerCase() === 'www.lab.local' && record.address === '192.168.60.10'))),
        dnsCheck(project, 'DNS-Client', 'www.lab.local', '192.168.60.10', 'DNS-Client resolves www.lab.local')
      ]);
    }
  },
  {
    id: 'configure-http',
    title: '9. Configure an HTTP Server',
    difficulty: 'Intermediate',
    summary: 'Enable the HTTP service and serve a page that the client can retrieve.',
    steps: [
      'Select WebServer and enable HTTP.',
      'Include the text NetLab Lab Server in the page content.',
      'From WebClient run http 192.168.70.10 in the terminal.'
    ],
    hints: ['HTTP uses TCP port 80.', 'The client can reach the server by IP without DNS.'],
    build: httpLab,
    validate: (project) => {
      const server = deviceNamed(project, 'WebServer');
      return finalizeValidation([
        check('HTTP service is enabled on WebServer', Boolean(server?.httpEnabled)),
        check('Page content contains the lab marker', Boolean(server?.httpContent.includes('NetLab Lab Server'))),
        httpCheck(project, 'WebClient', '192.168.70.10', 'NetLab Lab Server', 'WebClient retrieves the page')
      ]);
    }
  },
  {
    id: 'fix-gateway',
    title: '10. Troubleshoot an Incorrect Default Gateway',
    difficulty: 'Advanced',
    summary: 'A client cannot reach a remote server. Diagnose the gateway and restore connectivity.',
    steps: [
      'Ping 192.168.2.100 from ClientPC and observe the failure.',
      'Run ipconfig and compare the gateway with the router interface.',
      'Correct the gateway to 192.168.1.1 and ping again.'
    ],
    hints: ['The router owns 192.168.1.1 on the client LAN.', 'A gateway must be in the same subnet as the client interface.'],
    build: gatewayLab,
    validate: (project) => {
      const pc = deviceNamed(project, 'ClientPC');
      return finalizeValidation([
        check('ClientPC gateway is 192.168.1.1', pc?.gateway === '192.168.1.1'),
        pingCheck(project, 'ClientPC', '192.168.2.100', 'ClientPC can ping the remote server'),
        httpCheck(project, 'ClientPC', '192.168.2.100', 'TargetServer', 'ClientPC can load the remote web page')
      ]);
    }
  }
];

