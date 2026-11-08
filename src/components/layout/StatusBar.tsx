import { useEffect, useState } from 'react';
import { useAppStore } from '../../state/store';
import { Icon } from '../common/Icon';

export function StatusBar() {
  const project = useAppStore((state) => state.project);
  const statusMessage = useAppStore((state) => state.statusMessage);
  const storageStatus = useAppStore((state) => state.storageStatus);
  const persistentStorage = useAppStore((state) => state.persistentStorage);
  const viewport = useAppStore((state) => state.viewport);
  const dirty = useAppStore((state) => state.dirty);
  const simulation = useAppStore((state) => state.simulation);
  const activeLabId = useAppStore((state) => state.activeLabId);
  const simulationDrawerOpen = useAppStore((state) => state.simulationDrawerOpen);
  const setSimulationDrawerOpen = useAppStore((state) => state.setSimulationDrawerOpen);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return (
    <footer className="status-bar">
      <div className="status-section status-message" title={statusMessage}>
        <Icon name={online ? 'online' : 'offline'} size={13} />
        <span>{statusMessage}</span>
      </div>
      <div className="status-section">
        <span className={`offline-badge ${online ? 'is-online' : 'is-offline'}`}>
          <i className={`status-led ${online ? 'led-up' : 'led-down'}`} />
          {online ? 'Online' : 'Offline — local mode'}
        </span>
      </div>
      <div className="status-section">Project: <strong>{project.name}</strong></div>
      {activeLabId ? <div className="status-section">Lab: <strong>{activeLabId}</strong></div> : null}
      <div className="status-section">Zoom: <strong>{Math.round(viewport.zoom * 100)}%</strong></div>
      <div className="status-section">
        Storage:
        <strong className={storageStatus === 'error' ? 'text-danger' : ''}>
          {storageStatus === 'saving' ? 'Saving…' : storageStatus === 'error' ? 'Error' : dirty ? 'Autosave pending' : 'Saved'}
        </strong>
      </div>
      {persistentStorage ? <div className="status-section status-muted">Persistent storage granted</div> : null}
      <div className="status-section status-muted">
        {simulation.events.length > 0 ? `${simulation.cursor}/${simulation.events.length} events` : 'Simulation idle'}
      </div>
      <button
        type="button"
        className="status-drawer-toggle"
        onClick={() => setSimulationDrawerOpen(!simulationDrawerOpen)}
        aria-expanded={simulationDrawerOpen}
        aria-label={simulationDrawerOpen ? 'Hide simulation panel' : 'Show simulation panel'}
      >
        <Icon name="event" size={13} />
        Simulation
      </button>
    </footer>
  );
}
