import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../../src/app/App';
import { useAppStore } from '../../src/state/store';
import { createProject } from '../../src/devices/factory';
import { buildTopology, makeDevice, makeLink } from '../../src/labs/builders';
import { DEVICE_LABEL_TOP, DEVICE_SYMBOL_SIZE } from '../../src/canvas/deviceGeometry';
import { THEME_STORAGE_KEY } from '../../src/theme/theme';
import type { Project } from '../../src/types';

const baseState = useAppStore.getState();

function freshProject(): Project {
  const project = createProject('Untitled Network');
  return { ...project, settings: { ...project.settings, autosave: false } };
}

function resetStore(project: Project = freshProject()): void {
  useAppStore.setState({
    ...baseState,
    initialized: true,
    project,
    projects: [],
    selection: [],
    tool: 'select',
    activeCable: null,
    viewport: { x: 0, y: 0, zoom: 1 },
    dirty: false,
    past: [],
    future: [],
    dragActive: false,
    simulation: {
      mode: 'realtime',
      status: 'idle',
      events: [],
      cursor: 0,
      speed: 3,
      summary: '',
      outcome: null,
      selectedEventId: null,
      requestLabel: ''
    },
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
    theme: 'light'
  });
  document.documentElement.dataset.theme = 'light';
}

function basicLan(): { project: Project; pcA: ReturnType<typeof makeDevice>; pcB: ReturnType<typeof makeDevice> } {
  const networkSwitch = makeDevice('switch', 'SW1', 520, 300);
  const pcA = makeDevice('pc', 'PC-A', 240, 160, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.1.10', mask: '255.255.255.0' }]
  });
  const pcB = makeDevice('pc', 'PC-B', 240, 440, {
    interfaces: [{ name: 'Ethernet0', ip: '192.168.1.11', mask: '255.255.255.0' }]
  });
  const project = buildTopology('Basic LAN', [networkSwitch, pcA, pcB], [
    makeLink(pcA, 'Ethernet0', networkSwitch, 'FastEthernet0/1'),
    makeLink(pcB, 'Ethernet0', networkSwitch, 'FastEthernet0/2')
  ]);
  project.settings.autosave = false;
  return { project, pcA, pcB };
}

describe('application shell', () => {
  beforeEach(() => {
    resetStore();
  });

  it('renders the desktop shell with menubar, canvas, and panels', () => {
    render(<App />);

    expect(screen.getByText('NetLab Studio')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main menu' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Device palette' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Inspector column' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Simulation panel' })).toBeInTheDocument();
    expect(screen.queryByText('Restoring local workspace…')).not.toBeInTheDocument();
  });
});

describe('device palette placement', () => {
  beforeEach(() => {
    resetStore();
  });

  it('places a device on the canvas when a palette item is clicked', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'End Devices' }));
    await user.click(screen.getByTestId('palette-pc'));

    const state = useAppStore.getState();
    expect(state.project.devices).toHaveLength(1);
    expect(state.project.devices[0].kind).toBe('pc');
    expect(state.project.devices[0].name).toBe('PC0');
    expect(state.past).toHaveLength(1);
    expect(state.dirty).toBe(true);
    expect(screen.getAllByText('PC0').length).toBeGreaterThan(0);
  });

  it('centers each device symbol on its topology anchor', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'End Devices' }));
    await user.click(screen.getByTestId('palette-pc'));

    const device = useAppStore.getState().project.devices[0];
    const node = screen.getByTestId(`device-${device.id}`);
    const glyph = node.querySelector('.device-glyph');
    const label = node.querySelector('.device-label rect');

    const half = DEVICE_SYMBOL_SIZE / 2;
    expect(glyph).toHaveAttribute('transform', `translate(${-half} ${-half})`);
    expect(label).toHaveAttribute('y', String(DEVICE_LABEL_TOP));
  });

  it('keeps repeated palette placements from stacking on the same anchor', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'End Devices' }));
    for (let index = 0; index < 6; index += 1) {
      await user.click(screen.getByTestId('palette-pc'));
    }

    const devices = useAppStore.getState().project.devices;
    expect(devices).toHaveLength(6);
    for (let first = 0; first < devices.length; first += 1) {
      for (let second = first + 1; second < devices.length; second += 1) {
        const horizontalGap = Math.abs(devices[first].x - devices[second].x);
        const verticalGap = Math.abs(devices[first].y - devices[second].y);
        expect(horizontalGap >= 96 || verticalGap >= 96).toBe(true);
      }
    }
  });

  it('restores the previous project through undo', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Network Devices' }));
    await user.click(screen.getByTestId('palette-router'));
    expect(useAppStore.getState().project.devices).toHaveLength(1);

    useAppStore.getState().undo();
    expect(useAppStore.getState().project.devices).toHaveLength(0);
  });
});

describe('responsive simulation access', () => {
  beforeEach(() => {
    resetStore();
  });

  it('toggles the simulation drawer from the status bar', async () => {
    const user = userEvent.setup();
    render(<App />);

    const toggle = screen.getByRole('button', { name: 'Show simulation panel' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);
    expect(useAppStore.getState().simulationDrawerOpen).toBe(true);
    expect(screen.getByRole('button', { name: 'Hide simulation panel' })).toHaveAttribute('aria-expanded', 'true');
    expect(document.querySelector('.app-shell')).toHaveClass('simulation-drawer-open');

    await user.click(screen.getByRole('button', { name: 'Close simulation panel' }));
    expect(useAppStore.getState().simulationDrawerOpen).toBe(false);
    expect(document.querySelector('.app-shell')).not.toHaveClass('simulation-drawer-open');
  });
});

describe('inspector address validation', () => {
  beforeEach(() => {
    resetStore();
  });

  it('keeps the configured address when a network address is entered', async () => {
    const { project, pcA } = basicLan();
    resetStore(project);
    useAppStore.getState().selectDevice(pcA.id);
    const user = userEvent.setup();
    render(<App />);

    const addressInput = screen.getByLabelText('Ethernet0 IPv4 address');
    const card = addressInput.closest('.interface-card');
    expect(card).not.toBeNull();
    if (!card) return;
    await user.clear(addressInput);
    await user.type(addressInput, '192.168.1.0');
    await user.click(within(card as HTMLElement).getByRole('button', { name: 'Apply' }));

    expect(within(card as HTMLElement).getByText('This is the network address')).toBeInTheDocument();
    const device = useAppStore.getState().project.devices.find((entry) => entry.id === pcA.id);
    expect(device?.interfaces.find((entry) => entry.name === 'Ethernet0')?.ip).toBe('192.168.1.10');
  });
});

describe('dialogs', () => {
  beforeEach(() => {
    resetStore();
  });

  it('does not delete the selection while a dialog is open', async () => {
    const { project } = basicLan();
    resetStore(project);
    useAppStore.getState().selectDevice(project.devices[1].id);
    useAppStore.getState().openDialog('help');
    render(<App />);

    fireEvent.keyDown(window, { key: 'Delete' });

    expect(useAppStore.getState().project.devices).toHaveLength(3);
    expect(useAppStore.getState().selection).toHaveLength(1);
  });

  it('switches between the light and dark themes from preferences', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Options' }));
    await user.click(screen.getByRole('menuitem', { name: /Preferences/ }));

    const dialog = screen.getByRole('dialog', { name: 'Preferences' });
    await user.click(within(dialog).getByRole('radio', { name: 'Dark theme' }));

    expect(useAppStore.getState().theme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(within(dialog).getByRole('radio', { name: 'Dark theme' })).toBeChecked();

    await user.click(within(dialog).getByRole('radio', { name: 'Light theme' }));

    expect(useAppStore.getState().theme).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('opens and closes the about dialog from the help menu', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Help' }));
    await user.click(screen.getByRole('menuitem', { name: /About NetLab Studio/ }));

    const dialog = screen.getByRole('dialog', { name: 'About NetLab Studio' });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/Version 1\.0\.0/)).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'About NetLab Studio' })).not.toBeInTheDocument();
    });
  });

  it('opens the packet generator from the simulation panel', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Packet$/ }));
    expect(screen.getByRole('dialog', { name: /Packet Generator/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: /Packet Generator/i })).not.toBeInTheDocument();
  });
});

describe('simulation event list', () => {
  it('lists the events produced by a ping between two hosts', async () => {
    const { project, pcA } = basicLan();
    resetStore(project);
    const outcome = useAppStore.getState().runSimulation({
      kind: 'ping',
      sourceId: pcA.id,
      destinationIp: '192.168.1.11',
      count: 1
    }, { revealAll: true });

    expect(outcome.success).toBe(true);

    render(<App />);

    const eventList = screen.getByTestId('event-list');
    const rows = within(eventList).getAllByRole('listitem');
    expect(rows.length).toBe(useAppStore.getState().simulation.events.length);
    expect(rows.length).toBeGreaterThan(3);
    expect(within(eventList).getAllByText(/ARP request/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Reply received from 192\.168\.1\.11/).length).toBeGreaterThan(0);
  });

  it('reveals the selected packet layers in the inspector', async () => {
    const { project, pcA } = basicLan();
    resetStore(project);
    useAppStore.getState().runSimulation({
      kind: 'ping',
      sourceId: pcA.id,
      destinationIp: '192.168.1.11',
      count: 1
    }, { revealAll: true });

    const user = userEvent.setup();
    render(<App />);

    const eventList = screen.getByTestId('event-list');
    const arpRow = within(eventList)
      .getAllByRole('listitem')
      .find((row) => row.textContent?.includes('ARP'));
    expect(arpRow).toBeDefined();
    if (!arpRow) return;
    await user.click(arpRow);

    const panel = screen.getByRole('complementary', { name: 'Simulation panel' });
    expect(within(panel).getByText('Ethernet frame (L2)')).toBeInTheDocument();
    expect(within(panel).getByText('Packet inspection')).toHaveClass('is-active');
  });
});
