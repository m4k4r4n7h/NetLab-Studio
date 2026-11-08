# Network Engine

`src/engine/core/NetworkSimulator.ts` is a deterministic, event-driven teaching engine. It consumes a plain project object and a simulation request, then returns a complete ordered event list and a protocol-specific outcome. It has no React, DOM, browser, or network dependencies.

The engine is intentionally a teaching model. It reproduces the forwarding decisions that matter in an introductory networking course, not the full behaviour of a production TCP/IP stack.

## Request model

```ts
type SimulationRequest =
  | { kind: 'ping'; sourceId: string; destinationIp: string; count?: number; ttl?: number }
  | { kind: 'dns'; sourceId: string; domain: string; serverIp?: string }
  | { kind: 'http'; sourceId: string; target: string; path?: string }
  | { kind: 'udp'; sourceId: string; destinationIp: string; port: number; payload: string }
  | { kind: 'tcp'; sourceId: string; destinationIp: string; port: number }
  | { kind: 'tracert'; sourceId: string; destinationIp: string };
```

`run()` resets per-run state, executes one or more protocol exchanges, and returns:

- `success`
- ordered `events`
- human-readable `summary`
- protocol fields such as `pingReplies`, `dnsAddress`, `httpStatus`, `httpBody`, and `tcpEstablished`
- traceroute `hops`
- optional `error`

Runtime-only state (MAC tables, ARP caches, queue, pending packets) is held by the simulator instance and is not part of the saved project.

## Deterministic time and event queue

The engine uses simulated time in milliseconds, not wall-clock time.

- Events are scheduled with a monotonically increasing sequence number.
- The queue is ordered by `(time, sequence)`, making equal-time ordering stable and deterministic.
- Copper and fiber links add 1 ms of latency per hop; wireless links add 2 ms.
- An ARP timeout is queued at a fixed timeout interval.
- A completed exchange advances the next exchange's time base so multi-packet operations produce a readable timeline.

Each queue task is either a frame arrival or an ARP timeout. Frame arrivals emit a `frame-received` event before dispatching to the device's role.

## Safeguards

- `MAX_EVENTS = 700`: the drain loop stops if processing exceeds this limit and emits a `safeguard` event with the drop reason. This prevents runaway floods and loops from freezing the tab.
- `MAX_FRAME_HOPS = 32`: frame traversal stops with a Layer 2 drop when the hop count is exhausted.
- Missing devices, missing interfaces, disabled interfaces, unconnected ports, down links, and missing addresses become dropped events with explanations.
- Invalid requests return a failed outcome rather than throwing into the UI.

## Packet model

`src/engine/core/packet.ts` defines a single packet shape with optional layer sections:

```ts
interface Packet {
  id: string;
  protocol: 'ARP' | 'ICMP' | 'TCP' | 'UDP';
  ethernet: { srcMac: string; dstMac: string } | null;
  ip: { src: string; dst: string; ttl: number; protocol: 'ICMP' | 'TCP' | 'UDP' } | null;
  arp: { operation; senderMac; senderIp; targetMac; targetIp } | null;
  tcp: { srcPort; dstPort; flags; seq; ack; state } | null;
  udp: { srcPort; dstPort } | null;
  icmp: { type; identifier; sequence } | null;
  application: ApplicationData | null;
  payload: string;
  summary: string;
  sizeBytes: number;
}
```

Encapsulation is represented by setting the Ethernet header. Routers remove the old Layer 2 header, decrement TTL, choose a new next hop, resolve the next-hop MAC, and create a new Ethernet header for the outgoing link. This is visible in packet inspection because the source and destination MAC addresses change at each routed hop while the IP addresses remain the same.

`packetLayers()` converts the packet into display rows for the Ethernet frame, IPv4 packet, transport header, and application data.

## Layer 1 and Layer 2

### Link status

`src/devices/connectionRules.ts` determines whether a link is up. A link is operational only when both endpoint interfaces exist and are enabled. Cable/media compatibility is validated when the link is created.

### Hubs and patch panels

Hubs and patch panels are repeaters. When a frame arrives, it is repeated to every other enabled, connected port except the ingress port. They do not learn MAC addresses.

### Switches

For each arriving frame with an Ethernet header and an ingress port:

1. Learn the source MAC on the ingress port and association link, unless it is the broadcast address.
2. If the destination is broadcast (`ff:ff:ff:ff:ff:ff`), flood to all other ports and, on a shared wireless radio, all other association links.
3. If the destination MAC is in the table:
   - if it maps to the ingress port and link, filter the frame and record the event;
   - otherwise forward only to the learned egress link.
4. If the destination is unknown, flood it.
5. If flooding finds no eligible ports, drop the frame with a Layer 2 explanation.

MAC entries are dynamic and scoped to the simulator run. Moving a MAC to a different ingress port or wireless association updates the table and reports the move.

### End hosts

An end host accepts a frame only when the destination MAC is its own or broadcast. Otherwise it emits a Layer 2 drop. If the IPv4 destination is not configured on the host, the packet is dropped because the host is not a router.

### Routers

A router accepts frames addressed to one of its interface MACs or to broadcast. ARP frames are handled locally. IP packets addressed to a router interface are processed locally; all other IP packets enter the routing path. A wireless router also bridges same-LAN frames between associations on its wireless interface when they are not addressed to the router itself, matching the integrated switch inside a home gateway.

## ARP

When a host or router needs to send an IP packet to a next hop:

1. Look up the next-hop IP in the device's ARP cache.
2. On a hit, encapsulate the packet with the cached MAC and transmit.
3. On a miss, queue the pending packet and broadcast an ARP request from the egress interface.
4. Only one request per `(device, next-hop)` pair is in flight at a time.
5. When a reply arrives, cache the sender MAC, emit an `arp-reply`, and flush every pending packet for that next hop.
6. If no reply arrives before the timeout, emit `arp-timeout` and fail the pending exchange.

ARP replies are only generated by an enabled interface that owns the target IP. This is why an incorrect gateway that is not assigned to any device produces a genuine failure.

Broadcast ARP requests carry the broadcast destination MAC and are flooded by switches and repeated by hubs.

## IPv4 host behaviour

`src/utils/ipv4.ts` provides:

- strict dotted-decimal parsing (`0-255`, no leading-zero octets);
- integer conversion;
- contiguous mask validation and prefix conversion;
- CIDR parsing and formatting;
- network, broadcast, first host, last host, and usable-host calculations;
- private-range detection and address class;
- same-subnet and subnet-membership checks;
- network/host portion separation.

Host send logic:

1. Reject a packet with TTL already at zero.
2. If the destination equals a configured local address, process it locally (used for replies and local service access).
3. If the destination is inside any configured interface's subnet, send directly and ARP for the destination.
4. Otherwise require a default gateway:
   - no gateway configured: drop with `No default gateway configured`;
   - gateway not inside any configured subnet: drop with `Default gateway is not reachable`;
   - gateway invalid: drop with `Default gateway is invalid`.
5. Use the interface whose subnet contains the gateway as the egress interface and ARP for the gateway.

An egress interface that is disabled produces a Layer 1 drop.

## Routing

`src/engine/routing/routingTable.ts` builds routes from configuration on each lookup.

- **Connected routes** are installed automatically for every enabled router interface with a valid address and mask.
- **Static routes** come from `device.staticRoutes`.
- **Default routes** are static routes with a `/0` mask and a valid next hop on a directly connected subnet.
- Rows are sorted by descending prefix length, with connected routes preferred when prefixes match.

`lookupRoute()` performs longest-prefix matching. A route with no usable next hop or egress interface is skipped, and the search continues to shorter prefixes.

Router forwarding:

1. Look up the destination.
2. If no route exists, emit `route-lookup` with a drop and fail the exchange.
3. Decrement TTL. If it reaches zero, emit `ttl-expired` and drop.
4. Resolve the next hop: the destination itself for a connected route, or the configured next hop for a static/default route.
5. Strip the old Ethernet header, record the route lookup, then ARP and re-encapsulate on the egress link.

Because every lookup is configuration-driven, routing works for any topology; no lab topology is hardcoded.

## ICMP

The engine models echo request, echo reply, time exceeded, and port unreachable headers.

- Ping requests originate at the source host with the requested TTL.
- A destination host replies to an echo request addressed to its own IPv4 address.
- A successful reply increments `pingReplies` and creates an `icmp-success` event.
- A failed exchange records the last drop reason, which surfaces in the outcome summary.

## DNS

DNS is a UDP application on port 53.

- A requesting host needs a configured DNS server. It can also be supplied explicitly in a request.
- The query is sent as a UDP datagram with `application.kind = 'dns-query'`.
- A server with DNS enabled checks its A records.
- A match returns `dns-response` with the IPv4 answer, which the client caches for the request and uses for the next connection.
- An unknown name returns `dns-failure` / NXDOMAIN.
- An unreachable server produces the normal routing or ARP failure path.

The DNS response is delivered back to the client as a UDP packet carrying a DNS application payload. The engine deliberately handles the return direction explicitly so name resolution works through switches and routers.

## TCP

TCP is a simplified educational state machine. It tracks source/destination ports, flags, sequence number, acknowledgment number, and a small set of states.

Connection establishment:

1. Client sends SYN.
2. Server responds with SYN-ACK if the requested service is available.
3. Client sends ACK and records `tcp-established`.

Teardown uses FIN and a closed event. The engine tracks whether the connection is established within the current exchange, but it does not implement retransmission timers, congestion control, window scaling, or a full RFC state machine.

Unavailable services produce `service-unavailable` and a TCP reset.

## UDP

UDP packets carry source and destination ports and an application payload. Delivery is routed and forwarded like any other IP packet, but the engine does not provide reliability, ordering, retransmission, or delivery guarantees. A UDP request that crosses an unreachable path fails on the underlying IP path.

## HTTP

HTTP/1.1 over TCP port 80 is implemented as an application exchange:

1. Resolve a hostname through DNS when the target is a name.
2. Open a TCP connection to port 80.
3. Send `GET <path> HTTP/1.1` with a `Host` header.
4. A server with HTTP enabled returns status 200 and its configured HTML body.
5. A server without HTTP enabled returns service unavailable and resets the connection.
6. Close the connection with FIN and record the closed state.

The page body is a project field and is sanitised before the browser dialog renders it. HTTPS is represented only by an educational note; there is no TLS handshake. HTTP/3 is documented as QUIC over UDP and is not implemented.

## Traceroute

Traceroute sends echo probes with increasing TTL values and inspects the point at which each probe expires.

- A TTL-expired router records a hop with its address and device name.
- The destination records a reached hop.
- The outcome exposes `hops`, including `ttl`, `address`, `deviceName`, and `reached`.

## Wireless

Wireless is modelled as an Ethernet-like shared medium:

- A wireless link requires a wireless interface on both ends.
- Client devices have a single wireless interface.
- Access points and wireless routers expose a radio interface that may accept multiple wireless associations.
- A radio interface can carry several association links. Flooding sends a copy over every association except the ingress link, while a learned unicast is sent only over the matching association link.
- Wireless links add slightly higher per-hop latency than wired links.

The engine does not model radio channels, association handshakes, signal strength, encryption, or 802.11 frame formats.

## Services and device roles

- Routers and wireless routers forward IP traffic and build routing tables.
- Switches learn MAC addresses and forward frames.
- Hubs and patch panels repeat frames.
- PCs, laptops, servers, and printers are endpoints with optional services.
- Servers may enable DNS and HTTP and may store DNS A records and HTML content.

## Outcome semantics

Events have one of four outcomes:

- `observed` — the device processed the packet without forwarding or dropping it.
- `forwarded` — the device forwarded the frame or packet.
- `delivered` — a reply or service response arrived.
- `dropped` — the packet stopped, with a reason in the event detail.

The UI presents these outcomes directly. A failed simulation is not a fake success message; it is the result of an actual engine decision.

## Extending the engine

When adding a protocol or behaviour:

1. Add any new packet/application field to `packet.ts`.
2. Add event types and labels to `events.ts`.
3. Implement the network decision in `NetworkSimulator.ts`.
4. Add a functional test in `tests/unit`.
5. Expose the request in the packet generator and, where useful, the CLI.
6. Document the scope and limitations here and in the README.

Keep new behaviour deterministic: no random loss, no wall-clock timers, and no external I/O.
