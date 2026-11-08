# Project Format

NetLab Studio stores projects as versioned JSON. The same document is used for IndexedDB records and exported `.json` files.

- Format identifier: `netlab-studio-project`
- Current version: `1`
- Encoding: UTF-8 JSON
- Export indentation: two spaces
- Maximum file size on import: 8,000,000 characters

## Top-level schema

```json
{
  "format": "netlab-studio-project",
  "version": 1,
  "id": "proj-...",
  "name": "Branch Office",
  "createdAt": 1770000000000,
  "updatedAt": 1770000000000,
  "notes": "Optional project notes",
  "devices": [],
  "links": [],
  "settings": {
    "gridSize": 20,
    "showGrid": true,
    "showLabels": true,
    "snapToGrid": false,
    "learningMode": true,
    "autosave": true,
    "showPacketAnimation": true
  }
}
```

| Field | Type | Rules |
| --- | --- | --- |
| `format` | string | Must equal `netlab-studio-project` |
| `version` | integer | `1` or lower; higher versions are rejected |
| `id` | string | Project identifier, max 120 characters |
| `name` | string | Trimmed; max 120 characters; empty imports as `Imported Project` |
| `createdAt` | number | Finite; defaults to import time |
| `updatedAt` | number | Finite; defaults to import time |
| `notes` | string | Max 20,000 characters |
| `devices` | array | Max 400 entries |
| `links` | array | Max 1,200 entries |
| `settings` | object | Missing or invalid values fall back to defaults |

### Settings

| Field | Type | Default | Constraint |
| --- | --- | --- | --- |
| `gridSize` | number | `20` | Clamped to 5–80 |
| `showGrid` | boolean | `true` | Boolean only |
| `showLabels` | boolean | `true` | Boolean only |
| `snapToGrid` | boolean | `false` | Boolean only |
| `learningMode` | boolean | `true` | Boolean only |
| `autosave` | boolean | `true` | Boolean only |
| `showPacketAnimation` | boolean | `true` | Boolean only |

## Device schema

```json
{
  "id": "proj-abc-device-1",
  "name": "PC-A",
  "kind": "pc",
  "x": 240,
  "y": 160,
  "interfaces": [
    {
      "id": "if-device-1-0",
      "name": "Ethernet0",
      "mac": "02:11:22:33:44:55",
      "media": "ethernet",
      "enabled": true,
      "ip": "192.168.1.10",
      "mask": "255.255.255.0"
    }
  ],
  "gateway": "192.168.1.1",
  "dnsServer": "192.168.1.53",
  "staticRoutes": [],
  "dnsEnabled": false,
  "dnsRecords": [],
  "httpEnabled": false,
  "httpContent": "",
  "httpsEnabled": false,
  "notes": ""
}
```

| Field | Type | Rules |
| --- | --- | --- |
| `id` | string | Required, max 120, unique across devices |
| `name` | string | Required, max 80 |
| `kind` | string | One of `router`, `switch`, `hub`, `wireless-router`, `access-point`, `pc`, `laptop`, `server`, `printer`, `patch-panel` |
| `x`, `y` | number | Finite world coordinates; invalid values default to 80 |
| `interfaces` | array | At least 1 and at most 32 |
| `gateway` | string | Empty or a valid IPv4 address |
| `dnsServer` | string | Empty or a valid IPv4 address |
| `staticRoutes` | array | Optional |
| `dnsEnabled` | boolean | Defaults to false |
| `dnsRecords` | array | Optional |
| `httpEnabled` | boolean | Defaults to false |
| `httpContent` | string | Max 200,000 characters |
| `httpsEnabled` | boolean | Defaults to false; educational note only |
| `notes` | string | Max 5,000 characters |

### Interface schema

| Field | Type | Rules |
| --- | --- | --- |
| `id` | string | Required, max 120, unique across all interfaces |
| `name` | string | Required, max 60 |
| `mac` | string | Required, valid MAC, unique across the project |
| `media` | string | `ethernet` or `wireless` |
| `enabled` | boolean | Defaults to true |
| `ip` | string | Empty or a valid IPv4 host address; network, broadcast, and prefixes without usable hosts are rejected; must be paired with `mask` |
| `mask` | string | Empty or contiguous subnet mask; must be paired with `ip` |

### Static route schema

```json
{
  "id": "route-1",
  "network": "10.0.0.0",
  "mask": "255.255.255.0",
  "nextHop": "192.168.1.1"
}
```

All three address fields are required and validated. A `/0` mask creates a default route. Missing or duplicate IDs are regenerated on import.

### DNS record schema

```json
{
  "id": "dns-1",
  "name": "www.lab.test",
  "address": "192.168.1.10"
}
```

The name is required (max 253 characters after trimming) and the address must be valid IPv4. Missing or duplicate IDs are regenerated on import.

## Link schema

```json
{
  "id": "link-1",
  "cable": "copper-straight-through",
  "a": {
    "deviceId": "proj-abc-device-1",
    "interfaceId": "if-device-1-0"
  },
  "b": {
    "deviceId": "proj-abc-switch-1",
    "interfaceId": "if-switch-1-0"
  }
}
```

| Field | Type | Rules |
| --- | --- | --- |
| `id` | string | Max 120; duplicates rejected (missing IDs are generated) |
| `cable` | string | `copper-straight-through`, `copper-crossover`, `fiber`, `wireless` |
| `a`, `b` | object | Both endpoint devices and interfaces must exist |
| `a.deviceId === b.deviceId` | — | Rejected; no self-links |

Interface reuse rules:

- Ethernet cables require Ethernet interfaces; wireless links require wireless interfaces on both ends.
- A wireless link must include an access point or wireless router on one side, and two wireless access devices cannot associate with each other.
- A non-wireless interface may appear in at most one link.
- A wireless interface on an access point or wireless router may appear in multiple wireless links.
- Other wireless interfaces follow the single-link rule.

## Complete example

```json
{
  "format": "netlab-studio-project",
  "version": 1,
  "id": "proj-example-0001",
  "name": "Example LAN",
  "createdAt": 1770000000000,
  "updatedAt": 1770000000000,
  "notes": "Two PCs connected to one switch.",
  "devices": [
    {
      "id": "device-switch",
      "name": "SW1",
      "kind": "switch",
      "x": 520,
      "y": 300,
      "interfaces": [
        {
          "id": "if-switch-0",
          "name": "FastEthernet0/1",
          "mac": "02:aa:00:00:00:01",
          "media": "ethernet",
          "enabled": true,
          "ip": "",
          "mask": ""
        },
        {
          "id": "if-switch-1",
          "name": "FastEthernet0/2",
          "mac": "02:aa:00:00:00:02",
          "media": "ethernet",
          "enabled": true,
          "ip": "",
          "mask": ""
        }
      ],
      "gateway": "",
      "dnsServer": "",
      "staticRoutes": [],
      "dnsEnabled": false,
      "dnsRecords": [],
      "httpEnabled": false,
      "httpContent": "",
      "httpsEnabled": false,
      "notes": ""
    },
    {
      "id": "device-pc-a",
      "name": "PC-A",
      "kind": "pc",
      "x": 240,
      "y": 160,
      "interfaces": [
        {
          "id": "if-pc-a-0",
          "name": "Ethernet0",
          "mac": "02:bb:00:00:00:01",
          "media": "ethernet",
          "enabled": true,
          "ip": "192.168.1.10",
          "mask": "255.255.255.0"
        }
      ],
      "gateway": "192.168.1.1",
      "dnsServer": "",
      "staticRoutes": [],
      "dnsEnabled": false,
      "dnsRecords": [],
      "httpEnabled": false,
      "httpContent": "",
      "httpsEnabled": false,
      "notes": ""
    },
    {
      "id": "device-pc-b",
      "name": "PC-B",
      "kind": "pc",
      "x": 240,
      "y": 440,
      "interfaces": [
        {
          "id": "if-pc-b-0",
          "name": "Ethernet0",
          "mac": "02:bb:00:00:00:02",
          "media": "ethernet",
          "enabled": true,
          "ip": "192.168.1.11",
          "mask": "255.255.255.0"
        }
      ],
      "gateway": "192.168.1.1",
      "dnsServer": "",
      "staticRoutes": [],
      "dnsEnabled": false,
      "dnsRecords": [],
      "httpEnabled": false,
      "httpContent": "",
      "httpsEnabled": false,
      "notes": ""
    }
  ],
  "links": [
    {
      "id": "link-1",
      "cable": "copper-straight-through",
      "a": { "deviceId": "device-pc-a", "interfaceId": "if-pc-a-0" },
      "b": { "deviceId": "device-switch", "interfaceId": "if-switch-0" }
    },
    {
      "id": "link-2",
      "cable": "copper-straight-through",
      "a": { "deviceId": "device-pc-b", "interfaceId": "if-pc-b-0" },
      "b": { "deviceId": "device-switch", "interfaceId": "if-switch-1" }
    }
  ],
  "settings": {
    "gridSize": 20,
    "showGrid": true,
    "showLabels": true,
    "snapToGrid": false,
    "learningMode": true,
    "autosave": true,
    "showPacketAnimation": true
  }
}
```

## Validation and import behaviour

Import is strict. A document is rejected when any of the following apply:

- the top level is not a JSON object;
- `format` is not `netlab-studio-project`;
- `version` is missing, not an integer, below 1, or newer than supported;
- `devices` or `links` is not an array;
- the device or link count exceeds its limit;
- a device has no ID, no name, an unknown `kind`, no interfaces array, zero interfaces, or more than 32 interfaces;
- an interface has no ID or name, an invalid MAC, invalid media, a duplicate ID, or a duplicate MAC;
- an address is not valid IPv4, a mask is not contiguous, or only one of address/mask is present;
- a gateway or DNS server is non-empty and invalid;
- a static route has an invalid network, mask, or next hop;
- a DNS record has no name or an invalid address;
- a link has an unknown cable, a missing endpoint, a missing device or interface, a self-link, a duplicate link ID, or an illegal interface reuse.

Errors are collected and the first twelve are joined into a single message for the import dialog.

### Normalisation

Valid documents are rebuilt field by field:

- unknown properties are discarded;
- unsafe or non-finite numbers fall back to defaults;
- booleans use the declared default when not boolean;
- long text is truncated to its field limit;
- missing route, record, project, or link IDs are generated;
- empty project names become `Imported Project`;
- missing settings use defaults and out-of-range grid size is clamped.

### Version compatibility

The current application accepts version 1. A document with a higher version is rejected with an explanation so that an older application never silently corrupts a newer project. Future changes should either:

- add optional fields with defaults and keep version 1, or
- add a migration path and increment the version.

Breaking structural changes require a migration before the project is adopted.

## Storage versus export

IndexedDB records contain the same project under a `project` property plus summary metadata (`id`, `name`, `createdAt`, `updatedAt`, `deviceCount`, `linkCount`) used by the Open dialog. Export writes only the project document shown above.

`updatedAt` changes on save and edit. IDs are generated with `crypto.randomUUID()` when available, with a timestamp/random fallback.

## Security notes

The format contains no executable content. HTML page bodies are data and are sanitised at render time. No import path evaluates JavaScript or resolves external references.
