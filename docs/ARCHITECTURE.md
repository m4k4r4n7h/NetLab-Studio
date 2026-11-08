# Architecture

NetLab Studio is a single-page React application with three strict layers:

1. **Domain and simulation engine** — deterministic networking logic with no React dependency.
2. **Application state** — Zustand store that owns projects, selection, dialogs, simulation playback, persistence status, and undo/redo history.
3. **Presentation** — React components for the desktop-style workspace, SVG canvas, panels, dialogs, terminal, and browser.

Storage, education content, and the PWA shell sit alongside these layers and never leak protocol logic into components.

## Module map

```text
src/
  app/
    App.tsx                  application shell, initialization, autosave, shortcuts, title
  canvas/
    TopologyCanvas.tsx       SVG scene, coordinate transforms, pointer interactions, context menus
    DeviceSymbol.tsx         original vector device symbols
    deviceGeometry.ts        centered symbol, label, hit-frame, and status geometry
    canvasMetrics.ts         live canvas measurement for placement, zoom, and fit
    PacketMarker.tsx         animated marker for the current simulation event
  cli/
    CommandProcessor.ts      controlled CLI parser and command implementations
  components/
    layout/                  MenuBar, Toolbar, StatusBar
    panels/                  InspectorPanel, SimulationPanel, DevicePalette
    dialogs/                 DialogHost and feature dialogs
    common/                  Dialog, Icon, CommitInput
  devices/
    factory.ts               device catalog, default ports, project factory, cable catalog
    connectionRules.ts       cable/media compatibility, link status, endpoint lookup
    placement.ts             collision-free grid placement for palette and context-menu adds
  engine/
    core/
      NetworkSimulator.ts    event queue, packet lifecycle, L2/L3/ARP/transport logic
      packet.ts              packet model, summaries, layered inspection data
      events.ts              event types, layers, outcomes, labels
    routing/
      routingTable.ts        connected/static/default routes, longest-prefix lookup
  labs/
    builders.ts              topology builders and real-simulation validation checks
    guidedLabs.ts            10 guided labs
    templates.ts             6 templates
    challenges.ts            6 broken scenarios
    types.ts                 learning-content contracts
  state/
    store.ts                 Zustand application store and all user actions
    runtime.ts               module-level simulator instance and project synchronization
  storage/
    db.ts                    IndexedDB access with in-memory fallback
    projectSerializer.ts     versioned format validation, parsing, serialization, cloning
  styles/                    tokens, global rules, layout, panels, dialogs, classic theme layer
  theme/theme.ts             theme names, persistence, and document-level application
  types/                     shared domain types
  utils/                     IPv4 math, IDs/MAC/grid helpers, HTML sanitisation
tests/
  unit/                      engine, IPv4, project format, content inventory
  integration/               application flows in jsdom
  e2e/                       production-build browser smoke tests
```

## Dependency direction

```text
React components ──► Zustand store ──► engine + domain types
        │                  │
        │                  └────────► storage layer
        └───────────────────────────► shared types and utilities
```

Rules:

- `engine/**` must not import React, Zustand, storage, or components.
- Components read state through selectors and call store actions. They do not mutate project objects directly.
- The store is the only place that replaces the project, records undo history, and synchronizes the simulator.
- Storage functions handle serialization concerns; they do not decide simulation behaviour.
- Learning content may call the engine for validation but must not depend on UI components.

## State model

`src/state/store.ts` exposes one `useAppStore` instance.

Core state:

- `project`: the complete serializable project (devices, links, settings, notes, metadata).
- `projects`: IndexedDB project summaries for the Open dialog.
- `selection`, `tool`, `activeCable`, `viewport`: editing state.
- `dirty`, `past`, `future`, `dragActive`: history and save status.
- `simulation`: mode, status, full event list, cursor, speed, summary, outcome, selected event, request label.
- `activeDialog` plus dialog-specific device IDs and connect draft.
- persistence and lab metadata: `storageStatus`, `persistentStorage`, `autosavePaused`, `activeLabId`.

Actions fall into five groups:

1. Project lifecycle (new, open, save, save as, rename, duplicate, delete, import, export).
2. Topology editing (add, update, move, select, connect, delete, duplicate, routes, DNS records).
3. Settings, notes, undo, and redo.
4. Simulation execution and playback.
5. Dialog and terminal/browser navigation.

Undo history stores complete project snapshots. The history is capped at 60 entries. A drag records one history entry through `beginDrag()` and `endDrag()`, preventing a pointer-move stream from flooding the history.

## Simulator bridge

`src/state/runtime.ts` keeps a module-level `NetworkSimulator` instance and a synchronized project snapshot. `syncSimulator(project)` rebuilds the engine only when the supplied project differs from the previous snapshot. The store calls it before every simulation and whenever a project is adopted.

This separation lets transient runtime state (MAC tables, ARP caches, event queue, current exchange state) live outside the serializable project. Saved project files contain configuration only, not simulation runtime state.

## UI composition

`App.tsx` composes:

```text
MenuBar
Toolbar
workspace
  InspectorPanel
  canvas column
    TopologyCanvas
    DevicePalette
  SimulationPanel
StatusBar
DialogHost
boot overlay while IndexedDB restoration runs
```

`DialogHost` maps the `activeDialog` union to a specific dialog. Closing any dialog resets the connect draft.

### Visual theme

`tokens.css` defines the shared geometry and both color palettes. The light palette lives on `:root`; `:root[data-theme='dark']` replaces the surface, border, text, accent, and status colors. `classic.css` is imported last in `main.tsx` and contains the light desktop-application treatment, scoped through `:where(:root[data-theme='light'])` so it activates only in light mode without changing the specificity of the underlying component rules. In dark mode the structural CSS in `global.css`, `layout.css`, `panels.css`, and `dialogs.css` uses the dark tokens directly.

`src/theme/theme.ts` owns the `light | dark` union, validation, local-storage persistence, document `data-theme` application, and the browser `theme-color` meta value. `main.tsx` applies the stored theme before mounting React to avoid a flash, and the store keeps the selected theme in sync for the Preferences dialog. The terminal keeps a dark console surface in both themes.

### Canvas coordinates

The SVG scene uses a viewport transform `{ x, y, zoom }`. Pointer positions are converted from client space to world space before hit testing, marquee selection, dragging, or device placement. Device coordinates are persisted in world space, so zoom and pan do not alter saved positions.

Device symbols are centered on their stored anchor, and links, labels, hit frames, marquee bounds, and status indicators share the geometry constants in `src/canvas/deviceGeometry.ts`. Palette and context-menu additions use `src/devices/placement.ts` to find the nearest free grid slot instead of stacking devices. Generated labs, templates, challenges, imported projects, and restored projects are fitted to the real canvas bounds by `src/canvas/canvasMetrics.ts`.

Canvas interactions include:

- click placement and drag-and-drop from the palette;
- single and additive selection;
- marquee selection;
- device dragging with grid snapping;
- pan tool, Space-drag, and middle-button pan;
- wheel zoom centered on the pointer;
- right-click context menus for devices and links;
- cable selection followed by endpoint clicks;
- packet markers tied to visible simulation events.

### Panels

- **Inspector** renders type-specific sections from the selected device. Every edit dispatches a store action; address fields commit on Enter or blur and show validation errors inline.
- **Simulation** slices events to the current playback cursor. Only revealed events are rendered. The packet inspector derives its layers from the event packet.
- **Palette** is category-driven and reads its definitions from the device catalog. Cable selection is a store-level mode.

## Persistence

`src/storage/db.ts` opens a `netlab-studio` IndexedDB database with two object stores:

- `projects`: full project records plus summary fields.
- `preferences`: key/value records such as the last opened project.

If IndexedDB is unavailable, every operation falls back to in-memory maps, so the application still runs in restricted or test environments.

`src/storage/projectSerializer.ts` owns the external format. Imported JSON is never trusted:

- object, array, format, and version checks;
- device and link count limits;
- duplicate ID and MAC detection;
- interface existence and reuse checks;
- IPv4, mask, gateway, DNS, route, and record validation;
- text truncation and finite-number normalization;
- strict rejection of unsupported versions.

The project format is documented separately in [PROJECT_FORMAT.md](PROJECT_FORMAT.md).

## Offline shell

`vite.config.ts` configures `vite-plugin-pwa` with generated service-worker mode, automatic updates, Workbox precaching, navigation fallback, cache cleanup, and local manifest assets. The runtime registration is in `src/main.tsx`. See [OFFLINE_SUPPORT.md](OFFLINE_SUPPORT.md).

## Security boundaries

- CLI parsing is a controlled tokenizer; no shell, `eval`, or `Function`.
- Simulated web pages are sanitised through a DOM parser and an allowlist before `dangerouslySetInnerHTML`.
- Project imports are validated before adoption.
- The engine models packets as plain data and never performs real I/O.
- No browser permission beyond optional persistent storage is requested.

## Error containment

- Engine safeguards cap event processing at 700 events and frame traversal at 32 hops.
- Invalid topology state produces dropped events and explanatory summaries rather than thrown crashes.
- The store catches persistence failures and reports save status without interrupting editing.
- Dialog actions guard missing devices and invalid inputs.

## Testing strategy

- **Unit tests** exercise IPv4 math, the engine's required functional scenarios, transport and hardware behaviour, project validation, and learning-content inventory.
- **Integration tests** render the real application with the real store, then verify palette placement, undo, dialogs, simulation event listing, and packet inspection.
- **End-to-end tests** run against the production build and preview server to verify the deployed shell, routing fallback, dialogs, Learning Center, and an offline reload that restores a saved project from IndexedDB.

New engine behaviour should be covered first by an engine unit test. New visible controls should be covered by an integration or end-to-end test where practical.

## Extension points

- Add a device by extending `DeviceKind`, `DEVICE_DEFINITIONS`, and the factory port templates, then add behaviour in the engine.
- Add a cable type by extending `CableType`, `CABLE_DEFINITIONS`, and compatibility rules.
- Add a protocol by extending the packet/application model, the engine request union, the event types, and the packet generator.
- Add a lab, template, or challenge by adding data to the corresponding module and a validation function that uses `labs/builders.ts`.
- Add a project field by updating the TypeScript type, serializer validation with a safe default, and any UI editor. Increment the format version only for breaking changes.
