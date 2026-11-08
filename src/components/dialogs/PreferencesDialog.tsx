import { useEffect, useState } from 'react';
import { useAppStore } from '../../state/store';
import { Dialog } from '../common/Dialog';
import { estimateStorage, requestPersistentStorage } from '../../storage/db';
import type { Theme } from '../../theme/theme';
import { Icon } from '../common/Icon';

const THEME_OPTIONS: Array<{ value: Theme; label: string; description: string }> = [
  { value: 'light', label: 'Light', description: 'Classic desktop chrome with white panels.' },
  { value: 'dark', label: 'Dark', description: 'Low-light workspace with a dark canvas.' }
];

function formatBytes(value: number): string {
  if (value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function PreferencesDialog() {
  const closeDialog = useAppStore((state) => state.closeDialog);
  const settings = useAppStore((state) => state.project.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const autosavePaused = useAppStore((state) => state.autosavePaused);
  const setAutosavePaused = useAppStore((state) => state.setAutosavePaused);
  const persistentStorage = useAppStore((state) => state.persistentStorage);
  const setPersistentStorage = useAppStore((state) => state.setPersistentStorage);
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const [storageMessage, setStorageMessage] = useState('');

  const refreshEstimate = async () => {
    const result = await estimateStorage();
    setEstimate(result);
  };

  useEffect(() => {
    void refreshEstimate();
  }, []);

  const requestPersistence = async () => {
    const granted = await requestPersistentStorage();
    setPersistentStorage(granted);
    setStorageMessage(
      granted
        ? 'Persistent storage is granted. The browser will avoid clearing this origin under normal pressure.'
        : 'The browser did not grant persistent storage. Export important projects to JSON as a backup.'
    );
    await refreshEstimate();
  };

  return (
    <Dialog title="Preferences" subtitle="Workspace behaviour, learning aids, and local storage." onClose={closeDialog} width={680}>
      <section className="pref-section">
        <h3>Appearance</h3>
        <div className="theme-options" role="radiogroup" aria-label="Theme">
          {THEME_OPTIONS.map((option) => (
            <label key={option.value} className={`theme-option ${theme === option.value ? 'is-active' : ''}`}>
              <input
                type="radio"
                name="theme"
                value={option.value}
                checked={theme === option.value}
                onChange={() => setTheme(option.value)}
                aria-label={`${option.label} theme`}
              />
              <span className={`theme-preview theme-preview-${option.value}`} aria-hidden="true" />
              <span className="theme-option-copy">
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="pref-section">
        <h3>Editing</h3>
        <label className="checkbox-row">
          <input type="checkbox" checked={settings.snapToGrid} onChange={(event) => updateSettings({ snapToGrid: event.target.checked })} />
          <span>Snap devices to the engineering grid after dragging</span>
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={settings.showGrid} onChange={(event) => updateSettings({ showGrid: event.target.checked })} />
          <span>Show the engineering grid</span>
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={settings.showLabels} onChange={(event) => updateSettings({ showLabels: event.target.checked })} />
          <span>Show device labels below symbols</span>
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={!autosavePaused} onChange={(event) => setAutosavePaused(!event.target.checked)} />
          <span>Automatically save topology changes to IndexedDB</span>
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={settings.learningMode} onChange={(event) => updateSettings({ learningMode: event.target.checked })} />
          <span>Learning mode: show explanations and protocol guidance</span>
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={settings.showPacketAnimation} onChange={(event) => updateSettings({ showPacketAnimation: event.target.checked })} />
          <span>Animate packets along network links</span>
        </label>
      </section>

      <section className="pref-section">
        <h3>Local storage</h3>
        <div className="storage-meter">
          <div className="storage-meter-labels">
            <span>{estimate ? `${formatBytes(estimate.usage)} used` : 'Estimating…'}</span>
            <span>{estimate && estimate.quota > 0 ? `Quota ${formatBytes(estimate.quota)}` : 'Quota unavailable'}</span>
          </div>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: estimate && estimate.quota > 0 ? `${Math.min(100, (estimate.usage / estimate.quota) * 100)}%` : '0%' }}
            />
          </div>
        </div>
        <div className="storage-status-row">
          <span className={`badge ${persistentStorage ? 'badge-success' : 'badge-warning'}`}>
            <Icon name={persistentStorage ? 'check' : 'warning'} size={12} />
            {persistentStorage ? 'Persistent storage granted' : 'Best-effort storage'}
          </span>
          <button type="button" className="secondary-button" onClick={() => { void requestPersistence(); }}>
            Request persistent storage
          </button>
          <button type="button" className="secondary-button" onClick={() => { void refreshEstimate(); }}>
            Refresh estimate
          </button>
        </div>
        {storageMessage ? <p className="dialog-note">{storageMessage}</p> : null}
        <p className="dialog-note">
          Browsers may clear site data when disk pressure is high, in private windows, or when the user clears browsing
          data. Projects can always be exported as versioned JSON files.
        </p>
      </section>
    </Dialog>
  );
}
