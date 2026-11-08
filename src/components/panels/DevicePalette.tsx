import { useState } from 'react';
import type { DragEvent } from 'react';
import { useAppStore } from '../../state/store';
import {
  CABLE_DEFINITIONS,
  CATEGORY_LABELS,
  DEVICE_DEFINITIONS
} from '../../devices/factory';
import type { CableType, DeviceCategory, DeviceKind } from '../../types';
import { DeviceSymbol } from '../../canvas/DeviceSymbol';
import { getCanvasMetrics } from '../../canvas/canvasMetrics';
import { findOpenDevicePosition } from '../../devices/placement';
import { Icon } from '../common/Icon';

type PaletteTab = DeviceCategory | 'connections';

const TABS: PaletteTab[] = ['network', 'end', 'component', 'connections'];

export function DevicePalette() {
  const [tab, setTab] = useState<PaletteTab>('network');
  const project = useAppStore((state) => state.project);
  const viewport = useAppStore((state) => state.viewport);
  const addDevice = useAppStore((state) => state.addDevice);
  const setCable = useAppStore((state) => state.setCable);
  const activeCable = useAppStore((state) => state.activeCable);
  const setStatusMessage = useAppStore((state) => state.setStatusMessage);

  const place = (kind: DeviceKind) => {
    const metrics = getCanvasMetrics();
    const centerX = (metrics.width / 2 - viewport.x) / viewport.zoom;
    const centerY = (metrics.height / 2 - viewport.y) / viewport.zoom;
    const position = findOpenDevicePosition(project.devices, { x: centerX, y: centerY }, project.settings.gridSize);
    addDevice(kind, position.x, position.y);
  };

  const onDragStart = (event: DragEvent<HTMLButtonElement>, kind: DeviceKind) => {
    event.dataTransfer.setData('application/x-netlab-device', kind);
    event.dataTransfer.effectAllowed = 'copy';
  };

  const deviceItems = tab === 'connections'
    ? []
    : Object.values(DEVICE_DEFINITIONS).filter((definition) => definition.category === tab);

  return (
    <section className="device-palette" aria-label="Device palette">
      <div className="palette-tabs">
        {TABS.map((entry) => (
          <button
            key={entry}
            type="button"
            className={`palette-tab ${tab === entry ? 'is-active' : ''}`}
            onClick={() => setTab(entry)}
          >
            {entry === 'connections' ? 'Connections' : CATEGORY_LABELS[entry]}
          </button>
        ))}
        <span className="palette-hint">
          {tab === 'connections'
            ? 'Choose a cable, then click two devices on the canvas.'
            : 'Drag onto the workspace or click to place.'}
        </span>
      </div>

      <div className="palette-items">
        {tab === 'connections'
          ? (Object.entries(CABLE_DEFINITIONS) as Array<[CableType, (typeof CABLE_DEFINITIONS)[CableType]]>).map(([cable, definition]) => (
              <button
                key={cable}
                type="button"
                className={`palette-item cable-item ${activeCable === cable ? 'is-active' : ''}`}
                onClick={() => {
                  setCable(activeCable === cable ? null : cable);
                  setStatusMessage(activeCable === cable ? 'Connection cancelled' : `${definition.label} selected`);
                }}
                title={definition.description}
              >
                <span className={`cable-swatch cable-${cable}`}>
                  <Icon name={cable === 'wireless' ? 'wifi' : 'cable'} size={22} />
                </span>
                <span className="palette-item-label">{definition.label}</span>
                <span className="palette-item-sub">{definition.shortLabel}</span>
              </button>
            ))
          : deviceItems.map((definition) => (
              <button
                key={definition.kind}
                type="button"
                className="palette-item"
                draggable
                onDragStart={(event) => onDragStart(event, definition.kind)}
                onClick={() => place(definition.kind)}
                title={`${definition.description}\n${definition.capabilities.join(' · ')}`}
                data-testid={`palette-${definition.kind}`}
              >
                <span className="palette-symbol">
                  <DeviceSymbol kind={definition.kind} size={34} />
                </span>
                <span className="palette-item-label">{definition.label}</span>
                <span className="palette-item-sub">{definition.ports.length} ports</span>
              </button>
            ))}
      </div>
    </section>
  );
}
