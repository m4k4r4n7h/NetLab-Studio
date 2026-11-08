import { useEffect } from 'react';
import { useAppStore } from '../state/store';
import { applyTheme } from '../theme/theme';
import { MenuBar } from '../components/layout/MenuBar';
import { Toolbar } from '../components/layout/Toolbar';
import { StatusBar } from '../components/layout/StatusBar';
import { InspectorPanel } from '../components/panels/InspectorPanel';
import { SimulationPanel } from '../components/panels/SimulationPanel';
import { DevicePalette } from '../components/panels/DevicePalette';
import { TopologyCanvas } from '../canvas/TopologyCanvas';
import { DialogHost } from '../components/dialogs/DialogHost';

export default function App() {
  const initializeApp = useAppStore((state) => state.initializeApp);
  const initialized = useAppStore((state) => state.initialized);
  const project = useAppStore((state) => state.project);
  const dirty = useAppStore((state) => state.dirty);
  const autosavePaused = useAppStore((state) => state.autosavePaused);
  const saveNow = useAppStore((state) => state.saveNow);
  const activeDialog = useAppStore((state) => state.activeDialog);
  const simulationDrawerOpen = useAppStore((state) => state.simulationDrawerOpen);
  const theme = useAppStore((state) => state.theme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    void initializeApp();
  }, [initializeApp]);

  useEffect(() => {
    if (!initialized || !dirty || autosavePaused || !project.settings.autosave) return;
    const timer = window.setTimeout(() => {
      const state = useAppStore.getState();
      if (state.dirty && !state.autosavePaused && state.project.settings.autosave) {
        void state.saveNow();
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [project, dirty, autosavePaused, initialized, saveNow]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable));
      const state = useAppStore.getState();
      if (state.activeDialog !== 'none') return;
      const modifier = event.ctrlKey || event.metaKey;
      if (event.key === 'F1') {
        event.preventDefault();
        state.openDialog('help');
        return;
      }
      if (!modifier) return;
      const key = event.key.toLowerCase();
      if (key === 'n') {
        event.preventDefault();
        state.openDialog('new-project');
        return;
      }
      if (key === 'o') {
        event.preventDefault();
        state.openDialog('open-project');
        return;
      }
      if (key === 's') {
        event.preventDefault();
        if (event.shiftKey) state.openDialog('save-as');
        else void state.saveNow();
        return;
      }
      if (key === '0') {
        event.preventDefault();
        state.fitToContent();
        return;
      }
      if (key === '=' || key === '+') {
        event.preventDefault();
        state.zoomBy(1.2);
        return;
      }
      if (key === '-') {
        event.preventDefault();
        state.zoomBy(0.83);
        return;
      }
      if (key === 'd' && !typing) {
        event.preventDefault();
        state.duplicateSelection();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    document.title = `${project.name} — NetLab Studio`;
  }, [project.name]);

  return (
    <div className={`app-shell ${activeDialog !== 'none' ? 'has-dialog' : ''} ${simulationDrawerOpen ? 'simulation-drawer-open' : ''}`}>
      <MenuBar />
      <Toolbar />
      <div className="workspace">
        <aside className="inspector-column" aria-label="Inspector column">
          <InspectorPanel />
        </aside>
        <main className="canvas-column">
          <TopologyCanvas />
          <DevicePalette />
        </main>
        <SimulationPanel />
      </div>
      <StatusBar />
      <DialogHost />
      {!initialized ? <div className="boot-screen"><div className="boot-card">Restoring local workspace…</div></div> : null}
    </div>
  );
}
