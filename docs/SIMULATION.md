# Simulation and Workflows

This guide explains how to operate NetLab Studio: building topologies, configuring devices, generating traffic, reading the timeline, and using the Learning Center.

## Workspace overview

```text
┌────────────────────────────────────────────────────────────────────┐
│ Menu bar: File Edit Options View Tools Extensions Help             │
├────────────────────────────────────────────────────────────────────┤
│ Toolbar: project, history, tools, zoom, notes, labs, packet        │
├───────────────┬──────────────────────────────────┬─────────────────┤
│ Inspector     │ SVG topology canvas              │ Simulation      │
│               │                                  │ Realtime/Step   │
│               │                                  │ Play / Pause    │
│               │                                  │ Event list      │
│               │                                  │ Packet detail   │
├───────────────┴──────────────────────────────────┤                 │
│ Device palette: Network / End / Components / Connections            │
├────────────────────────────────────────────────────────────────────┤
│ Status bar: message, counts, zoom, save state, offline indicator   │
└────────────────────────────────────────────────────────────────────┘
```

On narrow screens the simulation panel is hidden and the inspector width is reduced, preserving a usable canvas.

## Building a topology

### Place devices

- Open a palette category.
- Click a device card to place it near the workspace center with a small offset.
- Or drag a card onto the canvas to place it at the drop position.

Device types are:

| Category | Devices |
| --- | --- |
| Network Devices | Router, Switch, Hub, Wireless Router, Access Point |
| End Devices | PC, Laptop, Server, Printer |
| Components | Patch Panel |
| Connections | Copper straight-through, copper crossover, fiber, wireless |

### Select and arrange

- Click a device to select it. Shift-click adds or removes it from the selection.
- Drag empty canvas space to marquee-select.
- Drag a selected device to move it; all selected devices move together.
- Use **Ctrl+A** to select all and **Delete** to remove selected devices and their links.
- Use **Ctrl+D** to duplicate the selection with new IDs.
- Enable **Snap to Grid** in Options or Preferences for precise layout.

### Connect devices

Option 1: the palette

1. Choose **Connections**.
2. Select a cable type.
3. Click the first device interface, then the second.
4. If an interface is ambiguous, the connection dialog opens for explicit selection.

Option 2: **Tools → Connect Devices…**

Both paths validate:

- endpoint existence and self-connection;
- cable compatibility with port media;
- interface availability (except a wireless access radio, which accepts multiple associations);
- device class warnings for crossover cables.

Right-click a link to delete it. Disabling either endpoint interface turns the link down visually and in simulation.

## Configuring devices

Select a device to populate the inspector.

### Common fields

- Device name (commit on Enter or blur).
- Notes.
- Interface list with status, media, MAC, address, mask, and enable toggle.
- Address editing with live validation and a network/broadcast preview.
- Default gateway and DNS server fields with validation.
- MAC table and ARP table for supported roles.

### Router fields

- Static routes: network, mask, next hop.
- Routing table with connected, static, and default badges.
- Terminal quick action.

### Server fields

- Enable DNS and add/remove A records.
- Enable HTTP and edit the HTML page body.
- Toggle HTTPS/TLS educational notes. Enabling them does not create a TLS implementation.

### Switch and hub fields

- Port state and learned MAC table.
- Switch terminal.

Changes are recorded in undo history. Autosave writes them to IndexedDB after a short debounce.

## Realtime mode

Realtime mode is the default. When a request runs, the complete event list is immediately revealed and the status becomes `complete`. Use this mode for quick verification or classroom demonstrations.

Realtime mode still records every event. Nothing is discarded; simulation mode can reveal the same list one step at a time later.

## Simulation mode

Switch the segmented control to **Simulation**, or run a request from the Packet Generator with **Open in Simulation mode** checked.

Playback controls:

| Control | Behaviour |
| --- | --- |
| Play | Advances the cursor on an interval derived from the speed setting |
| Pause | Stops automatic advancement |
| Step | Reveals the next event |
| Back | Hides the most recent event |
| Reset | Sets the cursor back to zero |
| Speed | Adjusts the playback interval from 1× to 20× |
| Clear | Removes the entire event list |

The progress bar shows `cursor / total events`.

Only revealed events appear in the list. The selected event is always the explicitly selected event or the last revealed event. Selecting an event also advances the cursor to include it.

## Packet Generator

Open it from **Tools → Packet Generator…**, the simulation panel **Packet** button, or the toolbar play icon.

Fields:

- **Source device** — any device with a configured IPv4 interface.
- **Destination device** — filters to other addressed devices, or use a manual target.
- **Protocol** — ICMP ping, traceroute, DNS, HTTP GET, TCP handshake, UDP datagram.
- The target field adapts by protocol (IPv4 destination, domain name, host, or URL host).
- Count, path, and port fields appear when relevant.
- UDP exposes a payload.
- DNS warns if the source has no DNS server.

The request label is shown in the simulation panel subtitle, for example `PC-A → PING 192.168.1.11`.

## Event list

Each row shows simulated time, layer badge, event title, summary, and device.

Filters:

- All events
- Layer 1
- Layer 2
- Layer 3
- Layer 4
- Layer 7
- Dropped only

Dropped events use a red-tinted row. The Learning Center's Protocol Explainer setting adds a contextual explanation callout under the list.

## Packet inspection

Clicking an event opens packet inspection.

It shows:

- protocol badge and packet summary;
- packet size;
- processing device, simulated time, layer, and outcome;
- event detail and, in learning mode, why the device made that decision;
- Ethernet frame: source and destination MAC;
- IPv4 packet: source, destination, TTL, protocol;
- transport: ICMP type/identifier/sequence, TCP ports/flags/sequence/ack/state, or UDP ports;
- application: DNS domain/answer, HTTP path/status, payload;
- an encapsulation note or a note that the packet is pre-encapsulation/post-decapsulation.

Router hops visibly replace the Ethernet addresses while keeping the IP addresses, demonstrating encapsulation and decapsulation.

## Canvas animation

When **Packet Animation** is enabled, the current revealed event with an `edge` renders an animated marker along the link used by that event. The marker color reflects the packet protocol. Clicking a marker opens the corresponding event.

Disable animation in **Options → Packet Animation** or the Extension Manager for a static diagram.

## Terminal

Open a terminal from the toolbar **Tools** menu, the device context menu, the inspector quick action, or the server/router inspection area.

The terminal supports:

- command history with Up/Down;
- clear output;
- device switching from the footer;
- prompt modes for exec, privileged, configuration, and interface;
- contextual help with `?` or `help`.

Commands call the real simulation engine and modify the real project. For example, `ip address 192.168.1.1 255.255.255.0` changes the selected interface; `show ip route` rebuilds the routing table from the current configuration. Network and broadcast addresses are rejected, and non-listening TCP ports return a reset. The quick-command buttons use the current topology: host terminals offer a reachable ping target and a configured DNS record instead of fixed sample addresses.

See the README for the command list.

## Browser

Open a simulated web browser from the device selection Tools menu or the inspector. Enter a hostname or IPv4 address, optionally followed by a path such as `www.lab.test/status` or `192.168.1.10/docs/index.html`.

- The browser separates the host from the request path and runs the HTTP request through the engine.
- A DNS name is resolved through the configured server.
- A success shows the sanitised server page, status, and URL.
- Failures show the engine's failure reason.
- Port 80 is the only simulated HTTP port; other explicit ports are rejected with an explanation.
- The browser selects a source device when one is not already selected.

Only pages served by an HTTP-enabled server in the project can be loaded. There is no external browsing.

## Learning Center

Open with the toolbar Learning Center button or **Tools → Labs, Templates and Challenges…**.

### Guided labs

Select a lab to read its goals, steps, and hints. **Start Lab** loads the starter project and records the active lab. **Validate current project** runs the lab's validation function against the current project.

Guided labs:

1. Build a Basic LAN
2. Configure a Star Topology
3. Configure IPv4 Addresses
4. Configure a /24 Network
5. Divide a /24 into Four /26 Subnets
6. Connect Two Subnets Using a Router
7. Verify Directly Connected Routes
8. Configure DNS
9. Configure an HTTP Server
10. Troubleshoot an Incorrect Default Gateway

Validation combines configuration checks with real simulation checks. A ping check builds a temporary simulator and verifies replies; DNS and HTTP checks run the actual request path.

### Templates

1. Basic Home Network
2. Small Office LAN
3. Two-Subnet Corporate Network
4. Client-Server Architecture
5. DNS and HTTP Lab
6. Troubleshooting Lab

Templates are complete topologies. They do not define pass/fail checks.

### Challenges

1. Wrong Default Gateway
2. Subnet Mask Mismatch
3. Disabled Uplink
4. Missing Static Route
5. Missing DNS Record
6. HTTP Service Down

Challenges load intentionally broken projects. Read the symptoms, inspect the devices, fix the configuration, then validate.

## Step-by-step examples

### Ping across a switch

1. Place a switch and two PCs.
2. Connect both PCs to switch ports with straight-through cable.
3. Configure PC-A as `192.168.1.10/24` and PC-B as `192.168.1.11/24`.
4. Open the Packet Generator, choose PC-A as source and PC-B as destination, select ICMP ping, enable simulation mode, and generate.
5. Step through ARP request, ARP reply, echo request, and echo reply.
6. Note the switch learning both source MACs and forwarding the known unicast reply.

### Ping across a router

1. Build two subnets connected to two router interfaces.
2. Configure the router interfaces, for example `192.168.1.1/24` and `10.0.0.1/24`.
3. Set each PC's gateway to the router address on its subnet.
4. Generate a ping to the remote PC.
5. Observe the host ARP for its gateway, the router's connected-route lookup, TTL decrement, new ARP resolution, and new Ethernet header.
6. Confirm the router's `show ip route` lists both connected networks.

### Incorrect gateway

1. Change a client gateway to an address that is inside the subnet but not owned by any device.
2. Generate a remote ping.
3. Observe the ARP request for the nonexistent gateway and the ARP timeout drop.
4. Correct the gateway and rerun; the exchange succeeds.

### DNS and HTTP

1. Configure a server with an IPv4 address, DNS enabled, and an A record for `www.lab.test`.
2. Enable HTTP and add recognizable page content.
3. Set the client DNS server to the server address.
4. Generate a DNS lookup and verify the answer.
5. Generate an HTTP GET to `www.lab.test` and step through DNS, TCP handshake, HTTP request, response, and teardown.
6. Open the browser dialog to view the rendered page.

## Reading failures

Failures are first-class engine results. Common messages:

| Message | Meaning |
| --- | --- |
| No default gateway configured | Destination is remote and the host has no gateway |
| Default gateway is not reachable | Gateway is outside every host subnet |
| ARP resolution for x failed | No device answered the ARP request |
| No route to x on R1 | Router has no matching route |
| TTL expired at R1 | TTL reached zero during forwarding |
| Frame not addressed to this host | MAC destination does not belong to the device |
| Link is down | Endpoint interface is disabled or no operational cable exists |
| No active ports to forward the frame | Switch/hub flood had no eligible egress |
| Simulation event limit reached | A forwarding loop or runaway flood exceeded safeguards |

Use the event detail and learning explanation to identify the layer and the configuration change required.
