import { useAppStore } from '../../state/store';
import { Icon } from '../common/Icon';
import type { IconName } from '../common/Icon';

interface ToolbarButtonProps {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  shortcut?: string;
}

function ToolbarButton({ icon, label, onClick, disabled, active, shortcut }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className={`toolbar-button ${active ? 'is-active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}

export function Toolbar() {
  const tool = useAppStore((state) => state.tool);
  const setTool = useAppStore((state) => state.setTool);
  const selection = useAppStore((state) => state.selection);
  const past = useAppStore((state) => state.past);
  const future = useAppStore((state) => state.future);
  const openDialog = useAppStore((state) => state.openDialog);
  const saveNow = useAppStore((state) => state.saveNow);
  const undo = useAppStore((state) => state.undo);
  const redo = useAppStore((state) => state.redo);
  const deleteSelection = useAppStore((state) => state.deleteSelection);
  const zoomBy = useAppStore((state) => state.zoomBy);
  const fitToContent = useAppStore((state) => state.fitToContent);
  const setStatusMessage = useAppStore((state) => state.setStatusMessage);
  const project = useAppStore((state) => state.project);

  const inspect = () => {
    if (selection.length === 0) {
      setStatusMessage('Select a device to inspect its configuration');
      return;
    }
    const name = selection.length === 1
      ? project.devices.find((device) => device.id === selection[0])?.name ?? 'device'
      : `${selection.length} devices`;
    setStatusMessage(`Inspecting ${name}`);
    document.querySelector('.inspector')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="toolbar" role="toolbar" aria-label="Main toolbar">
      <div className="toolbar-group">
        <ToolbarButton icon="new" label="New project" onClick={() => openDialog('new-project')} shortcut="Ctrl+N" />
        <ToolbarButton icon="open" label="Open project" onClick={() => openDialog('open-project')} shortcut="Ctrl+O" />
        <ToolbarButton icon="save" label="Save project" onClick={() => { void saveNow(); }} shortcut="Ctrl+S" />
        <ToolbarButton icon="save-as" label="Save project as" onClick={() => openDialog('save-as')} shortcut="Ctrl+Shift+S" />
      </div>
      <div className="toolbar-separator" />
      <div className="toolbar-group">
        <ToolbarButton icon="undo" label="Undo" onClick={undo} disabled={past.length === 0} shortcut="Ctrl+Z" />
        <ToolbarButton icon="redo" label="Redo" onClick={redo} disabled={future.length === 0} shortcut="Ctrl+Y" />
      </div>
      <div className="toolbar-separator" />
      <div className="toolbar-group">
        <ToolbarButton icon="select" label="Select tool" onClick={() => setTool('select')} active={tool === 'select'} />
        <ToolbarButton icon="move" label="Pan tool" onClick={() => setTool('move')} active={tool === 'move'} />
        <ToolbarButton icon="delete" label="Delete selection" onClick={deleteSelection} disabled={selection.length === 0} shortcut="Del" />
      </div>
      <div className="toolbar-separator" />
      <div className="toolbar-group">
        <ToolbarButton icon="zoom-in" label="Zoom in" onClick={() => zoomBy(1.2)} shortcut="Ctrl++" />
        <ToolbarButton icon="zoom-out" label="Zoom out" onClick={() => zoomBy(0.83)} shortcut="Ctrl+-" />
        <ToolbarButton icon="fit" label="Fit workspace" onClick={fitToContent} shortcut="Ctrl+0" />
      </div>
      <div className="toolbar-separator" />
      <div className="toolbar-group">
        <ToolbarButton icon="notes" label="Project notes" onClick={() => openDialog('notes')} />
        <ToolbarButton icon="inspect" label="Inspect selection" onClick={inspect} />
        <ToolbarButton icon="labs" label="Labs and templates" onClick={() => openDialog('labs')} />
        <ToolbarButton icon="play" label="Packet generator" onClick={() => openDialog('packet-generator')} />
      </div>
      <div className="toolbar-spacer" />
      <div className="toolbar-info">
        <span className="badge">{project.devices.length} devices</span>
        <span className="badge">{project.links.length} links</span>
        <span className="toolbar-tool-name">{tool === 'move' ? 'Pan workspace' : 'Select and move'}</span>
      </div>
    </div>
  );
}
