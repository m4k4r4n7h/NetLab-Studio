import { useState } from 'react';
import { useAppStore } from '../../state/store';
import { Dialog } from '../common/Dialog';
import { formatCidr } from '../../utils/ipv4';

export function ProjectSettingsDialog() {
  const project = useAppStore((state) => state.project);
  const setProjectName = useAppStore((state) => state.setProjectName);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const closeDialog = useAppStore((state) => state.closeDialog);
  const [name, setName] = useState(project.name);
  const settings = project.settings;
  const subnets = project.devices.flatMap((device) => device.interfaces.filter((entry) => entry.ip && entry.mask).map((entry) => formatCidr(entry.ip, entry.mask)));

  const save = () => {
    if (name.trim() && name.trim() !== project.name) setProjectName(name.trim());
    closeDialog();
  };

  return (
    <Dialog
      title="Project Settings"
      onClose={closeDialog}
      width={620}
      footer={(
        <>
          <button type="button" className="secondary-button" onClick={closeDialog}>Cancel</button>
          <button type="button" className="primary-button" onClick={save}>Save Settings</button>
        </>
      )}
    >
      <label className="field">
        <span>Project name</span>
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <div className="form-grid two-column">
        <label className="field">
          <span>Grid size (px)</span>
          <input
            type="number"
            min={5}
            max={80}
            value={settings.gridSize}
            onChange={(event) => updateSettings({ gridSize: Math.max(5, Math.min(80, Number(event.target.value) || 20)) })}
          />
        </label>
        <div className="field">
          <span>Topology summary</span>
          <div className="inline-badges">
            <span className="badge">{project.devices.length} devices</span>
            <span className="badge">{project.links.length} links</span>
            <span className="badge">{new Set(subnets).size} configured interfaces</span>
          </div>
        </div>
      </div>
      <div className="pref-section compact">
        <label className="checkbox-row">
          <input type="checkbox" checked={settings.showGrid} onChange={(event) => updateSettings({ showGrid: event.target.checked })} />
          <span>Show grid</span>
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={settings.snapToGrid} onChange={(event) => updateSettings({ snapToGrid: event.target.checked })} />
          <span>Snap to grid</span>
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={settings.showLabels} onChange={(event) => updateSettings({ showLabels: event.target.checked })} />
          <span>Show device labels</span>
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={settings.learningMode} onChange={(event) => updateSettings({ learningMode: event.target.checked })} />
          <span>Learning mode</span>
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={settings.showPacketAnimation} onChange={(event) => updateSettings({ showPacketAnimation: event.target.checked })} />
          <span>Packet animation</span>
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={settings.autosave} onChange={(event) => updateSettings({ autosave: event.target.checked })} />
          <span>Record autosave preference with this project</span>
        </label>
      </div>
      <p className="dialog-note">
        Format: {project.format} · Version {project.version} · Loaded devices keep their MAC addresses across export and import.
      </p>
    </Dialog>
  );
}
