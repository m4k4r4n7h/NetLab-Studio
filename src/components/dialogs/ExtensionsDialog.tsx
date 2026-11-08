import { useAppStore } from '../../state/store';
import { Dialog } from '../common/Dialog';
import { Icon } from '../common/Icon';

export function ExtensionsDialog() {
  const closeDialog = useAppStore((state) => state.closeDialog);
  const settings = useAppStore((state) => state.project.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const autosavePaused = useAppStore((state) => state.autosavePaused);
  const setAutosavePaused = useAppStore((state) => state.setAutosavePaused);

  const extensions = [
    {
      name: 'Protocol Explainer',
      version: '1.0.0',
      description: 'Adds an explanation callout for every simulation event, including why packets are dropped.',
      enabled: settings.learningMode,
      toggle: () => updateSettings({ learningMode: !settings.learningMode })
    },
    {
      name: 'Packet Animator',
      version: '1.0.0',
      description: 'Draws an animated protocol marker along the link used by the current simulation event.',
      enabled: settings.showPacketAnimation,
      toggle: () => updateSettings({ showPacketAnimation: !settings.showPacketAnimation })
    },
    {
      name: 'Engineering Grid',
      version: '1.0.0',
      description: 'Renders the background grid and exposes grid snapping for precise topology layout.',
      enabled: settings.showGrid,
      toggle: () => updateSettings({ showGrid: !settings.showGrid })
    },
    {
      name: 'Device Labels',
      version: '1.0.0',
      description: 'Shows the configured device name beneath each symbol on the canvas.',
      enabled: settings.showLabels,
      toggle: () => updateSettings({ showLabels: !settings.showLabels })
    },
    {
      name: 'IndexedDB Autosave',
      version: '1.0.0',
      description: 'Persists every topology change to the local project database after a short debounce.',
      enabled: !autosavePaused,
      toggle: () => setAutosavePaused(!autosavePaused)
    }
  ];

  return (
    <Dialog title="Extension Manager" subtitle="Built-in extensions are local, offline, and safe to toggle at any time." onClose={closeDialog} width={680}>
      <div className="extension-list">
        {extensions.map((extension) => (
          <div key={extension.name} className="extension-card">
            <div className="extension-icon"><Icon name="layers" size={18} /></div>
            <div className="extension-body">
              <div className="extension-head">
                <strong>{extension.name}</strong>
                <span className="badge">v{extension.version}</span>
                <span className="badge">Built-in</span>
              </div>
              <p>{extension.description}</p>
            </div>
            <label className="switch-toggle">
              <input type="checkbox" checked={extension.enabled} onChange={extension.toggle} aria-label={`Toggle ${extension.name}`} />
              <span />
            </label>
          </div>
        ))}
      </div>
      <div className="note-box">
        NetLab Studio does not load third-party extension code. The application never executes user-provided JavaScript and
        keeps all network simulation inside the browser tab.
      </div>
    </Dialog>
  );
}
