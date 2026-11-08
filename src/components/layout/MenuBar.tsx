import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../state/store';
import { Icon } from '../common/Icon';

interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  separator?: boolean;
  checked?: boolean;
}

interface MenuDefinition {
  label: string;
  items: MenuItem[];
}

export function MenuBar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const store = useAppStore();

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, []);

  const run = (action: () => void) => {
    setOpenMenu(null);
    action();
  };

  const selectedDeviceId = store.selection.length === 1 ? store.selection[0] : null;

  const menus: MenuDefinition[] = [
    {
      label: 'File',
      items: [
        { label: 'New Project…', shortcut: 'Ctrl+N', action: () => store.openDialog('new-project') },
        { label: 'Open Project…', shortcut: 'Ctrl+O', action: () => store.openDialog('open-project') },
        { label: 'Save Project', shortcut: 'Ctrl+S', action: () => { void store.saveNow(); } },
        { label: 'Save As…', shortcut: 'Ctrl+Shift+S', action: () => store.openDialog('save-as') },
        { label: 'Rename Project…', action: () => store.openDialog('rename-project') },
        { separator: true, label: '' },
        { label: 'Import Project…', action: () => store.openDialog('open-project') },
        { label: 'Export Project', action: () => store.exportProject() },
        { separator: true, label: '' },
        { label: 'Project Settings…', action: () => store.openDialog('project-settings') },
        { label: 'Project Notes…', action: () => store.openDialog('notes') }
      ]
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', shortcut: 'Ctrl+Z', disabled: store.past.length === 0, action: () => store.undo() },
        { label: 'Redo', shortcut: 'Ctrl+Y', disabled: store.future.length === 0, action: () => store.redo() },
        { separator: true, label: '' },
        { label: 'Select All', shortcut: 'Ctrl+A', action: () => store.selectAll() },
        { label: 'Clear Selection', action: () => store.clearSelection(), disabled: store.selection.length === 0 },
        { label: 'Duplicate Selection', shortcut: 'Ctrl+D', disabled: store.selection.length === 0, action: () => store.duplicateSelection() },
        { label: 'Delete Selection', shortcut: 'Del', disabled: store.selection.length === 0, action: () => store.deleteSelection() }
      ]
    },
    {
      label: 'Options',
      items: [
        { label: 'Preferences…', action: () => store.openDialog('preferences') },
        {
          label: 'Learning Mode',
          checked: store.project.settings.learningMode,
          action: () => store.updateSettings({ learningMode: !store.project.settings.learningMode })
        },
        {
          label: 'Grid',
          checked: store.project.settings.showGrid,
          action: () => store.updateSettings({ showGrid: !store.project.settings.showGrid })
        },
        {
          label: 'Snap to Grid',
          checked: store.project.settings.snapToGrid,
          action: () => store.updateSettings({ snapToGrid: !store.project.settings.snapToGrid })
        },
        {
          label: 'Autosave',
          checked: !store.autosavePaused,
          action: () => store.setAutosavePaused(!store.autosavePaused)
        }
      ]
    },
    {
      label: 'View',
      items: [
        { label: 'Zoom In', shortcut: 'Ctrl++', action: () => store.zoomBy(1.2) },
        { label: 'Zoom Out', shortcut: 'Ctrl+-', action: () => store.zoomBy(0.83) },
        { label: 'Fit Workspace', shortcut: 'Ctrl+0', action: () => store.fitToContent() },
        { label: 'Reset View', action: () => store.resetViewport() },
        { separator: true, label: '' },
        {
          label: 'Show Device Labels',
          checked: store.project.settings.showLabels,
          action: () => store.updateSettings({ showLabels: !store.project.settings.showLabels })
        },
        {
          label: 'Packet Animation',
          checked: store.project.settings.showPacketAnimation,
          action: () => store.updateSettings({ showPacketAnimation: !store.project.settings.showPacketAnimation })
        }
      ]
    },
    {
      label: 'Tools',
      items: [
        { label: 'Packet Generator…', action: () => store.openDialog('packet-generator') },
        { label: 'Labs, Templates and Challenges…', action: () => store.openDialog('labs') },
        {
          label: 'Open Terminal',
          disabled: !selectedDeviceId,
          action: () => {
            if (selectedDeviceId) store.openTerminal(selectedDeviceId);
          }
        },
        {
          label: 'Open Web Browser',
          disabled: !selectedDeviceId,
          action: () => {
            if (selectedDeviceId) store.openBrowser(selectedDeviceId);
          }
        },
        { label: 'Connect Devices…', action: () => store.openDialog('connect') },
        { separator: true, label: '' },
        { label: 'Save Configuration', action: () => { void store.saveNow(); } }
      ]
    },
    {
      label: 'Extensions',
      items: [
        { label: 'Extension Manager…', action: () => store.openDialog('extensions') },
        {
          label: 'Protocol Explainer',
          checked: store.project.settings.learningMode,
          action: () => store.updateSettings({ learningMode: !store.project.settings.learningMode })
        },
        {
          label: 'Packet Animator',
          checked: store.project.settings.showPacketAnimation,
          action: () => store.updateSettings({ showPacketAnimation: !store.project.settings.showPacketAnimation })
        }
      ]
    },
    {
      label: 'Help',
      items: [
        { label: 'User Guide', shortcut: 'F1', action: () => store.openDialog('help') },
        { label: 'Keyboard Shortcuts', action: () => store.openDialog('help') },
        { label: 'About NetLab Studio', action: () => store.openDialog('about') }
      ]
    }
  ];

  return (
    <div className="menu-bar" ref={containerRef}>
      <div className="app-brand">
        <span className="brand-mark"><Icon name="network" size={16} /></span>
        <span className="brand-name">NetLab Studio</span>
      </div>
      <nav className="menu-items" aria-label="Main menu">
        {menus.map((menu) => (
          <div key={menu.label} className="menu-root">
            <button
              type="button"
              className={`menu-trigger ${openMenu === menu.label ? 'is-open' : ''}`}
              onClick={() => setOpenMenu(openMenu === menu.label ? null : menu.label)}
              onMouseEnter={() => {
                if (openMenu) setOpenMenu(menu.label);
              }}
            >
              {menu.label}
            </button>
            {openMenu === menu.label ? (
              <div className="menu-dropdown" role="menu">
                {menu.items.map((item, index) => item.separator ? (
                  <div key={`sep-${index}`} className="menu-separator" />
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    className="menu-entry"
                    disabled={item.disabled}
                    onClick={() => item.action && run(item.action)}
                  >
                    <span className="menu-check">{item.checked ? <Icon name="check" size={13} /> : null}</span>
                    <span className="menu-label">{item.label}</span>
                    {item.shortcut ? <span className="menu-shortcut">{item.shortcut}</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </nav>
      <div className="menu-spacer" />
      <div className="menu-status">
        <span className="mono small">{store.project.name}</span>
        <span className={`dirty-pill ${store.dirty ? 'is-dirty' : ''}`}>{store.dirty ? 'Unsaved changes' : 'Saved'}</span>
      </div>
    </div>
  );
}
