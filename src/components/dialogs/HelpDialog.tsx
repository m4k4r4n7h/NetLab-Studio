import { useState } from 'react';
import { useAppStore } from '../../state/store';
import { Dialog } from '../common/Dialog';

type HelpTab = 'basics' | 'devices' | 'simulation' | 'commands' | 'shortcuts' | 'limitations';

const TABS: Array<{ id: HelpTab; label: string }> = [
  { id: 'basics', label: 'Getting started' },
  { id: 'devices', label: 'Devices and cabling' },
  { id: 'simulation', label: 'Simulation' },
  { id: 'commands', label: 'CLI reference' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'limitations', label: 'Scope and limits' }
];

export function HelpDialog() {
  const closeDialog = useAppStore((state) => state.closeDialog);
  const [tab, setTab] = useState<HelpTab>('basics');

  return (
    <Dialog title="User Guide" subtitle="Everything runs locally, including the labs and the network simulator." onClose={closeDialog} width={820}>
      <div className="help-layout">
        <nav className="help-nav">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={tab === entry.id ? 'is-active' : ''}
              onClick={() => setTab(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </nav>
        <div className="help-content">
          {tab === 'basics' ? (
            <>
              <h3>Build your first network</h3>
              <ol>
                <li>Open the <strong>End Devices</strong> palette tab and click PC twice to place two workstations.</li>
                <li>Open the <strong>Components</strong> or <strong>Network Devices</strong> tab and place a switch.</li>
                <li>Open the <strong>Connections</strong> tab, choose Copper Straight-Through, then click a PC and the switch.</li>
                <li>Repeat for the second PC, choosing a free switch interface in the dialog.</li>
                <li>Select each PC, assign <code>192.168.1.10/24</code> and <code>192.168.1.11/24</code> on Ethernet0.</li>
                <li>Open the first PC terminal and run <code>ping 192.168.1.11</code>.</li>
              </ol>
              <p>Switch to Simulation mode in the right panel to step through ARP, MAC learning, and echo replies.</p>
            </>
          ) : null}

          {tab === 'devices' ? (
            <>
              <h3>Device behaviour</h3>
              <ul>
                <li><strong>Router</strong> — forwards IPv4 between connected and static routes, decrements TTL, and rewrites Layer 2 addresses.</li>
                <li><strong>Switch</strong> — learns source MAC addresses, filters known unicast, and floods broadcast or unknown unicast traffic.</li>
                <li><strong>Hub / Patch Panel</strong> — repeats every frame out of every other port, forming a shared collision domain.</li>
                <li><strong>Wireless Router / Access Point</strong> — bridges wireless clients onto the LAN; the radio interface accepts multiple client associations.</li>
                <li><strong>PC / Laptop / Server / Printer</strong> — host IPv4 configuration, ARP cache, terminal, and optional DNS/HTTP services.</li>
              </ul>
              <h3>Cables</h3>
              <p>
                Straight-through and crossover cables carry Ethernet frames. Fiber behaves as an Ethernet uplink with a
                slightly different engineering representation. Wireless links require a wireless access device on one side.
                Modern auto-MDIX means either copper pinout works, but the simulator warns about the traditional pairing.
              </p>
            </>
          ) : null}

          {tab === 'simulation' ? (
            <>
              <h3>Realtime and Simulation modes</h3>
              <p>
                Realtime runs a request immediately and reveals all resulting events. Simulation mode precomputes the same
                deterministic event list but starts with the cursor at zero so you can inspect each hop.
              </p>
              <ul>
                <li>Use <strong>Play</strong> to advance automatically, or <strong>Step</strong> to advance one event.</li>
                <li>The event list shows layer L1–L7, the processing device, and the outcome.</li>
                <li>Click any event to open the packet inspector: Ethernet, IPv4, TCP/UDP/ICMP, and application data.</li>
                <li>Packets animate along links when packet animation is enabled.</li>
                <li>The learning callout explains why the event occurred when learning mode is on.</li>
              </ul>
              <h3>Failure analysis</h3>
              <p>
                A red dropped event is a real forwarding failure. ARP timeout usually means a wrong gateway, wrong subnet,
                or an unplugged path. “No route” means a router lacks a connected or static route. A TCP RST means the
                destination is reachable but no service listens on that port.
              </p>
            </>
          ) : null}

          {tab === 'commands' ? (
            <>
              <h3>PC and server terminal</h3>
              <pre>{`ipconfig
ping <address|name>
tracert <address>
nslookup <name>
arp
http <address|name>
help`}</pre>
              <h3>Router terminal</h3>
              <pre>{`enable
show ip interface brief
show interfaces
show ip route
show running-config
configure terminal
interface <name>
ip address <ip> <mask|prefix>
no shutdown
shutdown
ip route <network> <mask|prefix> <next-hop>
no ip route <network> <mask>
hostname <name>
end`}</pre>
              <h3>Switch terminal</h3>
              <pre>{`enable
show mac address-table
show interfaces
show running-config`}</pre>
              <p>Commands modify the real project state. A successful interface address change immediately affects routing and simulation.</p>
            </>
          ) : null}

          {tab === 'shortcuts' ? (
            <>
              <h3>Keyboard shortcuts</h3>
              <div className="shortcut-grid">
                <span>Ctrl + N</span><strong>New project</strong>
                <span>Ctrl + O</span><strong>Open project</strong>
                <span>Ctrl + S</span><strong>Save project</strong>
                <span>Ctrl + Shift + S</span><strong>Save As</strong>
                <span>Ctrl + Z</span><strong>Undo</strong>
                <span>Ctrl + Y / Ctrl + Shift + Z</span><strong>Redo</strong>
                <span>Ctrl + A</span><strong>Select all devices</strong>
                <span>Delete</span><strong>Delete selection</strong>
                <span>Ctrl + + / Ctrl + −</span><strong>Zoom in / out</strong>
                <span>Ctrl + 0</span><strong>Fit workspace</strong>
                <span>Space + drag</span><strong>Pan the workspace</strong>
                <span>Wheel</span><strong>Zoom at pointer</strong>
                <span>Right click</span><strong>Context menu</strong>
                <span>Esc</span><strong>Cancel cabling or close dialog</strong>
              </div>
            </>
          ) : null}

          {tab === 'limitations' ? (
            <>
              <h3>Educational scope</h3>
              <ul>
                <li>The engine models IPv4, ARP, Ethernet switching, static routing, ICMP, DNS A records, TCP handshake and teardown, UDP, and HTTP.</li>
                <li>TCP does not implement retransmission, congestion control, or window scaling. HTTP is a single request/response over the modelled TCP session.</li>
                <li>HTTPS is an educational comparison only; no TLS cryptography or certificate validation is performed.</li>
                <li>No VLANs, STP, DHCP, NAT, OSPF, BGP, IPv6, or wireless security protocols are simulated.</li>
                <li>Browser storage can be cleared externally. Export important projects to JSON and keep a copy.</li>
                <li>Packet counts, timings, and sequence numbers are deterministic teaching values, not wire-accurate captures.</li>
              </ul>
            </>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
