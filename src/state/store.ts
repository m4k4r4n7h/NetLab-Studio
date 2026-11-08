import { create } from 'zustand';
import type {
  CableType,
  Device,
  DeviceKind,
  DnsRecord,
  NetworkLink,
  Project,
  ProjectSettings,
  ProjectSummary,
  StaticRoute,
  Tool,
  Viewport
} from '../types';
import {
  createDevice,
  createLink,
  createProject,
  nextDeviceName
} from '../devices/factory';
import { validateConnection } from '../devices/connectionRules';
import { getCanvasMetrics } from '../canvas/canvasMetrics';
import { DEVICE_FOOTPRINT } from '../canvas/deviceGeometry';
import { applyTheme, readStoredTheme, storeTheme } from '../theme/theme';
import type { Theme } from '../theme/theme';
import type { SimulationEvent } from '../engine/core/events';
import type { SimulationOutcome, SimulationRequest } from '../engine/core/NetworkSimulator';
import { syncSimulator, getSimulator } from './runtime';
import { parseProjectJson, cloneProject, serializeProject } from '../storage/projectSerializer';
import {
  deleteProjectRecord,
  getPreference,
  listProjects,
  loadProject,
  requestPersistentStorage,
  saveProject,
  setPreference
} from '../storage/db';

export type DialogKind =
  | 'none'
  | 'new-project'
  | 'open-project'
  | 'save-as'
  | 'rename-project'
  | 'notes'
  | 'connect'
  | 'packet-generator'
  | 'labs'
  | 'about'
  | 'help'
  | 'preferences'
  | 'extensions'
  | 'terminal'
  | 'browser'
  | 'project-settings';

export type SimulationMode = 'realtime' | 'simulation';
export type SimulationStatus = 'idle' | 'ready' | 'playing' | 'paused' | 'complete';
export type StorageStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface ConnectDraft {
  deviceAId: string;
  deviceBId: string;
  cable: CableType;
}

export interface SimulationState {
  mode: SimulationMode;
  status: SimulationStatus;
  events: SimulationEvent[];
  cursor: number;
  speed: number;
  summary: string;
  outcome: SimulationOutcome | null;
  selectedEventId: string | null;
  requestLabel: string;
}

export interface AppState {
  initialized: boolean;
  project: Project;
  projects: ProjectSummary[];
  selection: string[];
  tool: Tool;
  activeCable: CableType | null;
  viewport: Viewport;
  dirty: boolean;
  past: Project[];
  future: Project[];
  dragActive: boolean;
  simulation: SimulationState;
  runtimeVersion: number;
  activeDialog: DialogKind;
  terminalDeviceId: string | null;
  browserDeviceId: string | null;
  connectDraft: ConnectDraft | null;
  statusMessage: string;
  storageStatus: StorageStatus;
  persistentStorage: boolean;
  autosavePaused: boolean;
  activeLabId: string | null;
  simulationDrawerOpen: boolean;
  theme: Theme;

  initializeApp: () => Promise<void>;
  refreshProjects: () => Promise<void>;
  openProjectById: (id: string) => Promise<boolean>;
  saveNow: () => Promise<boolean>;
  saveAs: (name: string) => Promise<boolean>;
  deleteProjectById: (id: string) => Promise<void>;
  duplicateProjectById: (id: string) => Promise<void>;
  importProjectFromText: (text: string) => { ok: boolean; error?: string };
  exportProject: () => void;
  setAutosavePaused: (paused: boolean) => void;
  setPersistentStorage: (granted: boolean) => void;
  setTheme: (theme: Theme) => void;

  setTool: (tool: Tool) => void;
  setCable: (cable: CableType | null) => void;
  setViewport: (viewport: Viewport) => void;
  setStatusMessage: (message: string) => void;
  setSimulationDrawerOpen: (open: boolean) => void;

  addDevice: (kind: DeviceKind, x: number, y: number) => Device;
  updateDevice: (deviceId: string, patch: Partial<Device>) => void;
  updateInterface: (deviceId: string, interfaceId: string, patch: Partial<Device['interfaces'][number]>) => void;
  renameDevice: (deviceId: string, name: string) => void;
  setDevicePosition: (deviceId: string, x: number, y: number) => void;
  moveSelectedBy: (dx: number, dy: number, recordHistory?: boolean) => void;
  beginDrag: () => void;
  endDrag: () => void;
  selectDevice: (deviceId: string, additive?: boolean) => void;
  selectMany: (deviceIds: string[]) => void;
  selectAll: () => void;
  clearSelection: () => void;
  deleteSelection: () => void;
  deleteDevice: (deviceId: string) => void;
  duplicateSelection: () => void;

  createConnection: (deviceAId: string, interfaceAId: string, deviceBId: string, interfaceBId: string, cable: CableType) => { ok: boolean; error?: string; warning?: string };
  deleteLink: (linkId: string) => void;

  addStaticRoute: (deviceId: string, route: Omit<StaticRoute, 'id'>) => void;
  removeStaticRoute: (deviceId: string, routeId: string) => void;
  addDnsRecord: (deviceId: string, record: Omit<DnsRecord, 'id'>) => void;
  removeDnsRecord: (deviceId: string, recordId: string) => void;
  setProjectName: (name: string) => void;
  setNotes: (notes: string) => void;
  updateSettings: (patch: Partial<ProjectSettings>) => void;

  undo: () => void;
  redo: () => void;

  runSimulation: (request: SimulationRequest, options?: { revealAll?: boolean; label?: string }) => SimulationOutcome;
  runCommandSimulation: (request: SimulationRequest) => SimulationOutcome;
  setSimulationMode: (mode: SimulationMode) => void;
  setSimulationSpeed: (speed: number) => void;
  stepForward: () => void;
  stepBackward: () => void;
  playSimulation: () => void;
  pauseSimulation: () => void;
  resetSimulation: () => void;
  clearSimulation: () => void;
  selectEvent: (eventId: string) => void;

  openDialog: (kind: DialogKind) => void;
  closeDialog: () => void;
  openTerminal: (deviceId: string) => void;
  openBrowser: (deviceId: string) => void;
  openConnectDialog: (deviceAId: string, deviceBId: string, cable: CableType) => void;

  newProject: (name: string) => void;
  adoptProject: (project: Project, label?: string) => void;
  setActiveLab: (id: string | null) => void;
  zoomBy: (factor: number) => void;
  fitToContent: () => void;
  resetViewport: () => void;
}

const emptySimulation = (): SimulationState => ({
  mode: 'realtime',
  status: 'idle',
  events: [],
  cursor: 0,
  speed: 3,
  summary: '',
  outcome: null,
  selectedEventId: null,
  requestLabel: ''
});

function blankProject(): Project {
  return createProject('Untitled Network');
}

function pushHistory(state: AppState): Pick<AppState, 'past' | 'future'> {
  return {
    past: [...state.past, state.project].slice(-60),
    future: []
  };
}

function withUpdatedAt(project: Project): Project {
  return { ...project, updatedAt: Date.now() };
}

export const useAppStore = create<AppState>()((set, get) => ({
  initialized: false,
  project: blankProject(),
  projects: [],
  selection: [],
  tool: 'select',
  activeCable: null,
  viewport: { x: 0, y: 0, zoom: 1 },
  dirty: false,
  past: [],
  future: [],
  dragActive: false,
  simulation: emptySimulation(),
  runtimeVersion: 0,
  activeDialog: 'none',
  terminalDeviceId: null,
  browserDeviceId: null,
  connectDraft: null,
  statusMessage: 'Ready',
  storageStatus: 'idle',
  persistentStorage: false,
  autosavePaused: false,
  activeLabId: null,
  simulationDrawerOpen: false,
  theme: readStoredTheme(),

  initializeApp: async () => {
    if (get().initialized) return;
    const lastId = await getPreference<string | null>('lastProjectId', null);
    let project: Project | null = null;
    if (lastId) project = await loadProject(lastId);
    const summaries = await listProjects();
    const initial = project ?? blankProject();
    syncSimulator(initial);
    set({
      project: initial,
      projects: summaries,
      initialized: true,
      dirty: false,
      statusMessage: project ? `Opened ${project.name}` : 'New project ready'
    });
    get().fitToContent();
    const persistent = await requestPersistentStorage();
    set({ persistentStorage: persistent });
  },

  refreshProjects: async () => {
    const projects = await listProjects();
    set({ projects });
  },

  openProjectById: async (id: string) => {
    const project = await loadProject(id);
    if (!project) {
      set({ statusMessage: 'Project could not be found' });
      return false;
    }
    syncSimulator(project);
    set((state) => ({
      project,
      selection: [],
      past: [...state.past, state.project].slice(-60),
      future: [],
      dirty: false,
      simulation: emptySimulation(),
      statusMessage: `Opened ${project.name}`,
      activeDialog: 'none'
    }));
    get().fitToContent();
    await setPreference('lastProjectId', project.id);
    return true;
  },

  saveNow: async () => {
    const project = withUpdatedAt(get().project);
    set({ storageStatus: 'saving', project, dirty: false });
    try {
      await saveProject(project);
      await setPreference('lastProjectId', project.id);
      const projects = await listProjects();
      set({ storageStatus: 'saved', projects, statusMessage: `Saved ${project.name}` });
      return true;
    } catch {
      set({ storageStatus: 'error', statusMessage: 'Local save failed' });
      return false;
    }
  },

  saveAs: async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const project = cloneProject(get().project, { name: trimmed });
    project.updatedAt = Date.now();
    try {
      await saveProject(project);
      await setPreference('lastProjectId', project.id);
      const projects = await listProjects();
      syncSimulator(project);
      set({
        project,
        projects,
        dirty: false,
        past: [],
        future: [],
        statusMessage: `Saved as ${trimmed}`,
        activeDialog: 'none',
        storageStatus: 'saved'
      });
      return true;
    } catch {
      set({ storageStatus: 'error', statusMessage: 'Save As failed' });
      return false;
    }
  },

  deleteProjectById: async (id: string) => {
    await deleteProjectRecord(id);
    const projects = await listProjects();
    if (get().project.id === id) {
      const replacement = blankProject();
      syncSimulator(replacement);
      set({
        project: replacement,
        projects,
        selection: [],
        past: [],
        future: [],
        dirty: false,
        simulation: emptySimulation(),
        statusMessage: 'Project deleted; new project created'
      });
    } else {
      set({ projects, statusMessage: 'Project deleted' });
    }
  },

  duplicateProjectById: async (id: string) => {
    const source = await loadProject(id);
    if (!source) return;
    const copy = cloneProject(source, { name: `${source.name} Copy` });
    await saveProject(copy);
    const projects = await listProjects();
    set({ projects, statusMessage: `Duplicated ${source.name}` });
  },

  importProjectFromText: (text: string) => {
    const result = parseProjectJson(text);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    const project = cloneProject(result.project, { name: result.project.name });
    project.updatedAt = Date.now();
    syncSimulator(project);
    set((state) => ({
      project,
      selection: [],
      past: [...state.past, state.project].slice(-60),
      future: [],
      dirty: true,
      simulation: emptySimulation(),
      activeDialog: 'none',
      statusMessage: `Imported ${project.name}`
    }));
    get().fitToContent();
    void saveProject(project);
    void setPreference('lastProjectId', project.id);
    void get().refreshProjects();
    return { ok: true };
  },

  exportProject: () => {
    const project = get().project;
    const serialized = serializeProject(project);
    if (typeof document === 'undefined' || typeof URL === 'undefined') return;
    const blob = new Blob([serialized], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${project.name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'netlab-project'}.netlab.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    set({ statusMessage: `Exported ${project.name}` });
  },

  setAutosavePaused: (paused) => set({ autosavePaused: paused }),
  setPersistentStorage: (granted) => set({ persistentStorage: granted }),
  setTheme: (theme) => {
    applyTheme(theme);
    storeTheme(theme);
    set({ theme, statusMessage: `${theme === 'dark' ? 'Dark' : 'Light'} theme applied` });
  },

  setTool: (tool) => set({ tool, activeCable: tool === 'connect' ? get().activeCable : null }),
  setCable: (cable) => set({ activeCable: cable, tool: cable ? 'connect' : 'select' }),
  setViewport: (viewport) => set({ viewport }),
  setStatusMessage: (message) => set({ statusMessage: message }),
  setSimulationDrawerOpen: (open) => set({ simulationDrawerOpen: open }),

  addDevice: (kind, x, y) => {
    const state = get();
    const device = createDevice(kind, {
      name: nextDeviceName(kind, state.project.devices),
      x: Math.round(x),
      y: Math.round(y)
    });
    set((current) => {
      const history = pushHistory(current);
      return {
        ...history,
        project: withUpdatedAt({
          ...current.project,
          devices: [...current.project.devices, device]
        }),
        selection: [device.id],
        dirty: true,
        statusMessage: `Added ${device.name}`
      };
    });
    return device;
  },

  updateDevice: (deviceId, patch) => {
    set((state) => {
      const history = pushHistory(state);
      return {
        ...history,
        project: withUpdatedAt({
          ...state.project,
          devices: state.project.devices.map((device) =>
            device.id === deviceId ? { ...device, ...patch } : device
          )
        }),
        dirty: true
      };
    });
  },

  updateInterface: (deviceId, interfaceId, patch) => {
    set((state) => {
      const history = pushHistory(state);
      return {
        ...history,
        project: withUpdatedAt({
          ...state.project,
          devices: state.project.devices.map((device) =>
            device.id === deviceId
              ? {
                  ...device,
                  interfaces: device.interfaces.map((entry) =>
                    entry.id === interfaceId ? { ...entry, ...patch } : entry
                  )
                }
              : device
          )
        }),
        dirty: true
      };
    });
  },

  renameDevice: (deviceId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    get().updateDevice(deviceId, { name: trimmed });
  },

  setDevicePosition: (deviceId, x, y) => {
    set((state) => ({
      project: withUpdatedAt({
        ...state.project,
        devices: state.project.devices.map((device) =>
          device.id === deviceId ? { ...device, x, y } : device
        )
      }),
      dirty: true
    }));
  },

  moveSelectedBy: (dx, dy, recordHistory = false) => {
    set((state) => {
      if (state.selection.length === 0) return state;
      const selected = new Set(state.selection);
      const history = recordHistory ? pushHistory(state) : {};
      return {
        ...state,
        ...history,
        project: withUpdatedAt({
          ...state.project,
          devices: state.project.devices.map((device) =>
            selected.has(device.id) ? { ...device, x: device.x + dx, y: device.y + dy } : device
          )
        }),
        dirty: true
      };
    });
  },

  beginDrag: () => {
    set((state) => (state.dragActive ? state : { ...pushHistory(state), dragActive: true }));
  },

  endDrag: () => set({ dragActive: false, dirty: true }),

  selectDevice: (deviceId, additive = false) => {
    set((state) => {
      if (!additive) return { selection: [deviceId] };
      const exists = state.selection.includes(deviceId);
      return {
        selection: exists
          ? state.selection.filter((id) => id !== deviceId)
          : [...state.selection, deviceId]
      };
    });
  },

  selectMany: (deviceIds) => set({ selection: deviceIds }),
  selectAll: () => set((state) => ({ selection: state.project.devices.map((device) => device.id) })),
  clearSelection: () => set({ selection: [] }),

  deleteSelection: () => {
    set((state) => {
      if (state.selection.length === 0) return state;
      const selected = new Set(state.selection);
      const history = pushHistory(state);
      return {
        ...history,
        project: withUpdatedAt({
          ...state.project,
          devices: state.project.devices.filter((device) => !selected.has(device.id)),
          links: state.project.links.filter(
            (link) => !selected.has(link.a.deviceId) && !selected.has(link.b.deviceId)
          )
        }),
        selection: [],
        dirty: true,
        statusMessage: 'Deleted selected devices'
      };
    });
  },

  deleteDevice: (deviceId) => {
    set((state) => {
      const history = pushHistory(state);
      return {
        ...history,
        project: withUpdatedAt({
          ...state.project,
          devices: state.project.devices.filter((device) => device.id !== deviceId),
          links: state.project.links.filter(
            (link) => link.a.deviceId !== deviceId && link.b.deviceId !== deviceId
          )
        }),
        selection: state.selection.filter((id) => id !== deviceId),
        dirty: true
      };
    });
  },

  duplicateSelection: () => {
    set((state) => {
      if (state.selection.length === 0) return state;
      const selected = new Set(state.selection);
      const originals = state.project.devices.filter((device) => selected.has(device.id));
      const created: Device[] = [];
      const idMap = new Map<string, string>();
      const namePool = [...state.project.devices];
      for (const original of originals) {
        const copy = createDevice(original.kind, {
          name: nextDeviceName(original.kind, namePool),
          x: original.x + 30,
          y: original.y + 30
        });
        namePool.push(copy);
        copy.gateway = original.gateway;
        copy.dnsServer = original.dnsServer;
        copy.staticRoutes = original.staticRoutes.map((route) => ({ ...route, id: `${route.id}-copy-${copy.id}` }));
        copy.dnsEnabled = original.dnsEnabled;
        copy.dnsRecords = original.dnsRecords.map((record) => ({ ...record, id: `${record.id}-copy-${copy.id}` }));
        copy.httpEnabled = original.httpEnabled;
        copy.httpContent = original.httpContent;
        copy.httpsEnabled = original.httpsEnabled;
        copy.notes = original.notes;
        for (const [index, entry] of copy.interfaces.entries()) {
          const source = original.interfaces[index];
          if (!source) continue;
          entry.ip = source.ip;
          entry.mask = source.mask;
          entry.enabled = source.enabled;
        }
        idMap.set(original.id, copy.id);
        created.push(copy);
      }
      const copiedLinks: NetworkLink[] = [];
      for (const link of state.project.links) {
        const aNew = idMap.get(link.a.deviceId);
        const bNew = idMap.get(link.b.deviceId);
        if (!aNew || !bNew) continue;
        const sourceA = originals.find((device) => device.id === link.a.deviceId);
        const sourceB = originals.find((device) => device.id === link.b.deviceId);
        const copyA = created.find((device) => device.id === aNew);
        const copyB = created.find((device) => device.id === bNew);
        const indexA = sourceA?.interfaces.findIndex((entry) => entry.id === link.a.interfaceId) ?? -1;
        const indexB = sourceB?.interfaces.findIndex((entry) => entry.id === link.b.interfaceId) ?? -1;
        if (!copyA || !copyB || indexA < 0 || indexB < 0) continue;
        copiedLinks.push(
          createLink(
            { deviceId: copyA.id, interfaceId: copyA.interfaces[indexA].id },
            { deviceId: copyB.id, interfaceId: copyB.interfaces[indexB].id },
            link.cable
          )
        );
      }
      const history = pushHistory(state);
      return {
        ...history,
        project: withUpdatedAt({
          ...state.project,
          devices: [...state.project.devices, ...created],
          links: [...state.project.links, ...copiedLinks]
        }),
        selection: created.map((device) => device.id),
        dirty: true,
        statusMessage: `Duplicated ${created.length} device${created.length === 1 ? '' : 's'}`
      };
    });
  },

  createConnection: (deviceAId, interfaceAId, deviceBId, interfaceBId, cable) => {
    const project = get().project;
    const validation = validateConnection(project.devices, project.links, deviceAId, interfaceAId, deviceBId, interfaceBId, cable);
    if (!validation.valid) {
      set({ statusMessage: validation.error ?? 'Invalid connection' });
      return { ok: false, error: validation.error };
    }
    set((state) => {
      const history = pushHistory(state);
      return {
        ...history,
        project: withUpdatedAt({
          ...state.project,
          links: [...state.project.links, createLink(
            { deviceId: deviceAId, interfaceId: interfaceAId },
            { deviceId: deviceBId, interfaceId: interfaceBId },
            cable
          )]
        }),
        dirty: true,
        activeCable: null,
        tool: 'select',
        activeDialog: 'none',
        connectDraft: null,
        statusMessage: validation.warning ?? 'Connection created'
      };
    });
    return { ok: true, warning: validation.warning };
  },

  deleteLink: (linkId) => {
    set((state) => {
      const history = pushHistory(state);
      return {
        ...history,
        project: withUpdatedAt({
          ...state.project,
          links: state.project.links.filter((link) => link.id !== linkId)
        }),
        dirty: true,
        statusMessage: 'Connection deleted'
      };
    });
  },

  addStaticRoute: (deviceId, route) => {
    set((state) => {
      const history = pushHistory(state);
      return {
        ...history,
        project: withUpdatedAt({
          ...state.project,
          devices: state.project.devices.map((device) =>
            device.id === deviceId
              ? { ...device, staticRoutes: [...device.staticRoutes, { ...route, id: `route-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }] }
              : device
          )
        }),
        dirty: true
      };
    });
  },

  removeStaticRoute: (deviceId, routeId) => {
    set((state) => {
      const history = pushHistory(state);
      return {
        ...history,
        project: withUpdatedAt({
          ...state.project,
          devices: state.project.devices.map((device) =>
            device.id === deviceId
              ? { ...device, staticRoutes: device.staticRoutes.filter((route) => route.id !== routeId) }
              : device
          )
        }),
        dirty: true
      };
    });
  },

  addDnsRecord: (deviceId, record) => {
    set((state) => {
      const history = pushHistory(state);
      return {
        ...history,
        project: withUpdatedAt({
          ...state.project,
          devices: state.project.devices.map((device) =>
            device.id === deviceId
              ? { ...device, dnsRecords: [...device.dnsRecords, { ...record, id: `dns-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }] }
              : device
          )
        }),
        dirty: true
      };
    });
  },

  removeDnsRecord: (deviceId, recordId) => {
    set((state) => {
      const history = pushHistory(state);
      return {
        ...history,
        project: withUpdatedAt({
          ...state.project,
          devices: state.project.devices.map((device) =>
            device.id === deviceId
              ? { ...device, dnsRecords: device.dnsRecords.filter((record) => record.id !== recordId) }
              : device
          )
        }),
        dirty: true
      };
    });
  },

  setProjectName: (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set((state) => {
      const history = pushHistory(state);
      return {
        ...history,
        project: withUpdatedAt({ ...state.project, name: trimmed }),
        dirty: true,
        statusMessage: 'Project renamed'
      };
    });
  },

  setNotes: (notes) => {
    set((state) => ({
      project: withUpdatedAt({ ...state.project, notes }),
      dirty: true
    }));
  },

  updateSettings: (patch) => {
    set((state) => ({
      project: { ...state.project, settings: { ...state.project.settings, ...patch } },
      dirty: true
    }));
  },

  undo: () => {
    set((state) => {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        project: previous,
        past: state.past.slice(0, -1),
        future: [state.project, ...state.future].slice(0, 60),
        dirty: true,
        selection: state.selection.filter((id) => previous.devices.some((device) => device.id === id)),
        statusMessage: 'Undo'
      };
    });
  },

  redo: () => {
    set((state) => {
      const next = state.future[0];
      if (!next) return state;
      return {
        project: next,
        past: [...state.past, state.project].slice(-60),
        future: state.future.slice(1),
        dirty: true,
        statusMessage: 'Redo'
      };
    });
  },

  runSimulation: (request, options) => {
    const state = get();
    syncSimulator(state.project);
    const outcome = getSimulator().run(request);
    const revealAll = options?.revealAll ?? false;
    set((current) => {
      const revealed = revealAll || current.simulation.mode === 'realtime';
      return {
        simulation: {
          ...current.simulation,
          events: outcome.events,
          outcome,
          summary: outcome.summary,
          cursor: revealed ? outcome.events.length : 0,
          status: revealed ? 'complete' : 'ready',
          selectedEventId: null,
          requestLabel: options?.label ?? current.simulation.requestLabel
        },
        runtimeVersion: current.runtimeVersion + 1,
        statusMessage: outcome.summary
      };
    });
    return outcome;
  },

  runCommandSimulation: (request) => get().runSimulation(request, { revealAll: true }),

  setSimulationMode: (mode) => {
    set((state) => ({
      simulation: {
        ...state.simulation,
        mode,
        cursor: mode === 'realtime' ? state.simulation.events.length : 0,
        status: state.simulation.events.length === 0 ? 'idle' : mode === 'realtime' ? 'complete' : 'ready',
        selectedEventId: null
      }
    }));
  },

  setSimulationSpeed: (speed) => {
    set((state) => ({ simulation: { ...state.simulation, speed: Math.min(20, Math.max(1, speed)) } }));
  },

  stepForward: () => {
    set((state) => {
      const total = state.simulation.events.length;
      if (total === 0) return state;
      const cursor = Math.min(total, state.simulation.cursor + 1);
      return {
        simulation: {
          ...state.simulation,
          cursor,
          status: cursor >= total ? 'complete' : 'paused'
        }
      };
    });
  },

  stepBackward: () => {
    set((state) => {
      const cursor = Math.max(0, state.simulation.cursor - 1);
      return {
        simulation: {
          ...state.simulation,
          cursor,
          status: state.simulation.events.length === 0 ? 'idle' : 'paused'
        }
      };
    });
  },

  playSimulation: () => {
    set((state) => {
      if (state.simulation.events.length === 0) return state;
      const atEnd = state.simulation.cursor >= state.simulation.events.length;
      return {
        simulation: {
          ...state.simulation,
          cursor: atEnd ? 0 : state.simulation.cursor,
          status: 'playing'
        }
      };
    });
  },

  pauseSimulation: () => {
    set((state) => ({
      simulation: { ...state.simulation, status: state.simulation.cursor > 0 ? 'paused' : 'ready' }
    }));
  },

  resetSimulation: () => {
    set((state) => ({
      simulation: {
        ...state.simulation,
        cursor: 0,
        status: state.simulation.events.length > 0 ? 'ready' : 'idle',
        selectedEventId: null
      }
    }));
  },

  clearSimulation: () => set({ simulation: emptySimulation(), statusMessage: 'Simulation cleared' }),

  selectEvent: (eventId) => {
    set((state) => {
      const index = state.simulation.events.findIndex((event) => event.id === eventId);
      if (index < 0) return state;
      return {
        simulation: {
          ...state.simulation,
          selectedEventId: eventId,
          cursor: Math.max(state.simulation.cursor, index + 1)
        }
      };
    });
  },

  openDialog: (kind) => set({ activeDialog: kind }),
  closeDialog: () => set({ activeDialog: 'none', connectDraft: null }),
  openTerminal: (deviceId) => set({ activeDialog: 'terminal', terminalDeviceId: deviceId }),
  openBrowser: (deviceId) => set({ activeDialog: 'browser', browserDeviceId: deviceId }),
  openConnectDialog: (deviceAId, deviceBId, cable) =>
    set({ activeDialog: 'connect', connectDraft: { deviceAId, deviceBId, cable } }),

  newProject: (name) => {
    const project = createProject(name.trim() || 'Untitled Network');
    syncSimulator(project);
    set({
      project,
      selection: [],
      past: [],
      future: [],
      dirty: false,
      simulation: emptySimulation(),
      activeDialog: 'none',
      statusMessage: `Created ${project.name}`,
      activeLabId: null
    });
    void saveProject(project);
    void setPreference('lastProjectId', project.id);
    void get().refreshProjects();
  },

  adoptProject: (project, label) => {
    syncSimulator(project);
    set((state) => ({
      project,
      selection: [],
      past: [...state.past, state.project].slice(-60),
      future: [],
      dirty: true,
      simulation: emptySimulation(),
      activeDialog: 'none',
      statusMessage: label ?? `Loaded ${project.name}`
    }));
    get().fitToContent();
  },

  setActiveLab: (id) => set({ activeLabId: id }),

  zoomBy: (factor) => {
    set((state) => {
      const zoom = Math.min(3, Math.max(0.25, state.viewport.zoom * factor));
      const metrics = getCanvasMetrics();
      const centerX = metrics.width / 2;
      const centerY = metrics.height / 2;
      const worldX = (centerX - state.viewport.x) / state.viewport.zoom;
      const worldY = (centerY - state.viewport.y) / state.viewport.zoom;
      return {
        viewport: {
          zoom,
          x: centerX - worldX * zoom,
          y: centerY - worldY * zoom
        }
      };
    });
  },

  fitToContent: () => {
    set((state) => {
      if (state.project.devices.length === 0) {
        return { viewport: { x: 0, y: 0, zoom: 1 } };
      }
      const xs = state.project.devices.map((device) => device.x);
      const ys = state.project.devices.map((device) => device.y);
      const padding = 28;
      const minX = Math.min(...xs) + DEVICE_FOOTPRINT.left - padding;
      const maxX = Math.max(...xs) + DEVICE_FOOTPRINT.right + padding;
      const minY = Math.min(...ys) + DEVICE_FOOTPRINT.top - padding;
      const maxY = Math.max(...ys) + DEVICE_FOOTPRINT.bottom + padding;
      const metrics = getCanvasMetrics();
      const zoom = Math.min(1.5, Math.max(0.3, Math.min(metrics.width / (maxX - minX), metrics.height / (maxY - minY))));
      return {
        viewport: {
          zoom,
          x: metrics.width / 2 - ((minX + maxX) / 2) * zoom,
          y: metrics.height / 2 - ((minY + maxY) / 2) * zoom
        }
      };
    });
  },

  resetViewport: () => set({ viewport: { x: 0, y: 0, zoom: 1 } })
}));

useAppStore.subscribe((state, previous) => {
  if (state.project !== previous.project) {
    syncSimulator(state.project);
  }
});

export function revealedEvents(state: AppState): SimulationEvent[] {
  return state.simulation.events.slice(0, state.simulation.cursor);
}

export function currentEvent(state: AppState): SimulationEvent | null {
  if (state.simulation.cursor === 0) return null;
  return state.simulation.events[state.simulation.cursor - 1] ?? null;
}

export function selectedDevice(state: AppState): Device | null {
  if (state.selection.length !== 1) return null;
  return state.project.devices.find((device) => device.id === state.selection[0]) ?? null;
}

export function linksForDevice(project: Project, deviceId: string): NetworkLink[] {
  return project.links.filter((link) => link.a.deviceId === deviceId || link.b.deviceId === deviceId);
}
