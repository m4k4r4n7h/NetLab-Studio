import { useAppStore } from '../../state/store';
import { Dialog } from '../common/Dialog';
import { Icon } from '../common/Icon';

export function AboutDialog() {
  const closeDialog = useAppStore((state) => state.closeDialog);
  return (
    <Dialog title="About NetLab Studio" onClose={closeDialog} width={520}>
      <div className="about-hero">
        <span className="about-mark"><Icon name="network" size={34} /></span>
        <div>
          <h3>NetLab Studio</h3>
          <p>Version 1.0.0 · Browser-based network topology designer and educational simulator</p>
        </div>
      </div>
      <div className="about-grid">
        <span>Runtime</span><strong>React 19 · TypeScript 7 · Vite 8</strong>
        <span>State</span><strong>Zustand</strong>
        <span>Persistence</span><strong>IndexedDB with JSON export/import</strong>
        <span>Offline</span><strong>Service worker precache · PWA manifest</strong>
        <span>Simulation</span><strong>Deterministic event-driven IPv4 engine</strong>
        <span>License</span><strong>MIT</strong>
      </div>
      <p className="dialog-note">
        All network behaviour is simulated inside this browser tab. NetLab Studio never opens real sockets, never connects
        to external devices, and never executes user-provided JavaScript. HTTPS and high-level application protocols are
        represented at an educational level; see the Help guide and documentation for exact scope.
      </p>
    </Dialog>
  );
}
