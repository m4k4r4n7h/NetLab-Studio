import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  PointerEvent as ReactPointerEvent,
  MouseEvent as ReactMouseEvent,
  DragEvent as ReactDragEvent,
  WheelEvent as ReactWheelEvent
} from 'react';
import { useAppStore } from '../state/store';
import type { DeviceKind } from '../types';
import { linkIsUp } from '../devices/connectionRules';
import { DEVICE_DEFINITIONS } from '../devices/factory';
import { DeviceSymbol } from './DeviceSymbol';
import {
  DEVICE_FOOTPRINT,
  DEVICE_FRAME_HALF_HEIGHT,
  DEVICE_FRAME_HALF_WIDTH,
  DEVICE_LABEL_BASELINE,
  DEVICE_LABEL_HEIGHT,
  DEVICE_LABEL_TOP,
  DEVICE_LABEL_WIDTH,
  DEVICE_PARALLEL_LINK_SPACING,
  DEVICE_PORT_ANCHOR_OFFSET,
  DEVICE_STATUS_BACKDROP_RADIUS,
  DEVICE_STATUS_RADIUS,
  DEVICE_STATUS_X,
  DEVICE_STATUS_Y,
  DEVICE_SYMBOL_SIZE
} from './deviceGeometry';
import { Icon } from '../components/common/Icon';
import { PacketMarker } from './PacketMarker';
import { findOpenDevicePosition } from '../devices/placement';

interface DragState {
  mode: 'device' | 'marquee' | 'pan';
  startClientX: number;
  startClientY: number;
  lastClientX: number;
  lastClientY: number;
  startWorldX: number;
  startWorldY: number;
  moved: boolean;
  historyStarted: boolean;
  additive: boolean;
}

interface Marquee {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface ContextMenuState {
  x: number;
  y: number;
  deviceId?: string;
  linkId?: string;
}

interface AlignmentGuides {
  x: number | null;
  y: number | null;
}

const ALIGNMENT_THRESHOLD = 6;

export function TopologyCanvas() {
  const project = useAppStore((state) => state.project);
  const selection = useAppStore((state) => state.selection);
  const viewport = useAppStore((state) => state.viewport);
  const tool = useAppStore((state) => state.tool);
  const activeCable = useAppStore((state) => state.activeCable);
  const simulation = useAppStore((state) => state.simulation);
  const settings = useAppStore((state) => state.project.settings);
  const setViewport = useAppStore((state) => state.setViewport);
  const selectDevice = useAppStore((state) => state.selectDevice);
  const selectMany = useAppStore((state) => state.selectMany);
  const clearSelection = useAppStore((state) => state.clearSelection);
  const addDevice = useAppStore((state) => state.addDevice);
  const moveSelectedBy = useAppStore((state) => state.moveSelectedBy);
  const beginDrag = useAppStore((state) => state.beginDrag);
  const endDrag = useAppStore((state) => state.endDrag);
  const deleteSelection = useAppStore((state) => state.deleteSelection);
  const deleteDevice = useAppStore((state) => state.deleteDevice);
  const deleteLink = useAppStore((state) => state.deleteLink);
  const duplicateSelection = useAppStore((state) => state.duplicateSelection);
  const openTerminal = useAppStore((state) => state.openTerminal);
  const openBrowser = useAppStore((state) => state.openBrowser);
  const openConnectDialog = useAppStore((state) => state.openConnectDialog);
  const setCable = useAppStore((state) => state.setCable);
  const undo = useAppStore((state) => state.undo);
  const redo = useAppStore((state) => state.redo);
  const zoomBy = useAppStore((state) => state.zoomBy);
  const fitToContent = useAppStore((state) => state.fitToContent);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const selectEvent = useAppStore((state) => state.selectEvent);
  const setDevicePosition = useAppStore((state) => state.setDevicePosition);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [connectSource, setConnectSource] = useState<string | null>(null);
  const [hoveredDeviceId, setHoveredDeviceId] = useState<string | null>(null);
  const [hoveredLinkId, setHoveredLinkId] = useState<string | null>(null);
  const [cursorWorld, setCursorWorld] = useState<{ x: number; y: number } | null>(null);
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuides>({ x: null, y: null });
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);

  const revealed = simulation.events.slice(0, simulation.cursor);
  const activeEvent = revealed.length > 0 ? revealed[revealed.length - 1] : null;

  const deviceMap = useMemo(
    () => new Map(project.devices.map((device) => [device.id, device])),
    [project.devices]
  );

  const linkGroupMeta = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const link of project.links) {
      const pairKey = [link.a.deviceId, link.b.deviceId].sort().join('::');
      const list = groups.get(pairKey) ?? [];
      list.push(link.id);
      groups.set(pairKey, list);
    }
    const meta = new Map<string, { index: number; total: number }>();
    for (const list of groups.values()) {
      list.forEach((id, index) => {
        meta.set(id, { index, total: list.length });
      });
    }
    return meta;
  }, [project.links]);

  const activeLinkOffset = useMemo(() => {
    if (!activeEvent?.edge) return 0;
    const { fromDeviceId, toDeviceId } = activeEvent.edge;
    const matchingLink = project.links.find(
      (link) =>
        (link.a.deviceId === fromDeviceId && link.b.deviceId === toDeviceId) ||
        (link.a.deviceId === toDeviceId && link.b.deviceId === fromDeviceId)
    );
    if (!matchingLink) return 0;
    const group = linkGroupMeta.get(matchingLink.id);
    if (!group) return 0;
    return (group.index - (group.total - 1) / 2) * DEVICE_PARALLEL_LINK_SPACING;
  }, [activeEvent, project.links, linkGroupMeta]);

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - viewport.x) / viewport.zoom,
        y: (clientY - rect.top - viewport.y) / viewport.zoom
      };
    },
    [viewport]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (useAppStore.getState().activeDialog !== 'none') return;
      const target = event.target as HTMLElement | null;
      const typing =
        target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
      if (event.code === 'Space' && !typing) {
        setSpaceDown(true);
      }
      if (typing) return;
      if (event.key === 'Escape') {
        setConnectSource(null);
        setContextMenu(null);
        setCable(null);
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteSelection();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        useAppStore.getState().selectAll();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpaceDown(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [deleteSelection, redo, setCable, undo]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  const handleWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const worldX = (px - viewport.x) / viewport.zoom;
    const worldY = (py - viewport.y) / viewport.zoom;
    const zoom = Math.min(3, Math.max(0.25, viewport.zoom * (event.deltaY < 0 ? 1.12 : 0.89)));
    setViewport({ zoom, x: px - worldX * zoom, y: py - worldY * zoom });
  };

  const beginDeviceInteraction = (event: ReactPointerEvent<SVGGElement>, deviceId: string) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (activeCable) {
      if (!connectSource) {
        setConnectSource(deviceId);
        selectDevice(deviceId);
        return;
      }
      if (connectSource === deviceId) {
        setConnectSource(null);
        return;
      }
      openConnectDialog(connectSource, deviceId, activeCable);
      setConnectSource(null);
      return;
    }
    const additive = event.shiftKey;
    const alreadySelected = selection.includes(deviceId);
    if (!alreadySelected || additive) selectDevice(deviceId, additive);
    svgRef.current?.setPointerCapture(event.pointerId);
    const world = toWorld(event.clientX, event.clientY);
    dragRef.current = {
      mode: 'device',
      startClientX: event.clientX,
      startClientY: event.clientY,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      startWorldX: world.x,
      startWorldY: world.y,
      moved: false,
      historyStarted: false,
      additive
    };
  };

  const beginBackgroundInteraction = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button === 2) return;
    setContextMenu(null);
    const world = toWorld(event.clientX, event.clientY);
    const panMode = event.button === 1 || spaceDown || tool === 'move';
    if (panMode) {
      event.preventDefault();
      svgRef.current?.setPointerCapture(event.pointerId);
      dragRef.current = {
        mode: 'pan',
        startClientX: event.clientX,
        startClientY: event.clientY,
        lastClientX: event.clientX,
        lastClientY: event.clientY,
        startWorldX: world.x,
        startWorldY: world.y,
        moved: false,
        historyStarted: false,
        additive: false
      };
      return;
    }
    if (activeCable) {
      setConnectSource(null);
      return;
    }
    if (tool === 'select') {
      if (!event.shiftKey) clearSelection();
      setMarquee({ x1: world.x, y1: world.y, x2: world.x, y2: world.y });
      svgRef.current?.setPointerCapture(event.pointerId);
      dragRef.current = {
        mode: 'marquee',
        startClientX: event.clientX,
        startClientY: event.clientY,
        lastClientX: event.clientX,
        lastClientY: event.clientY,
        startWorldX: world.x,
        startWorldY: world.y,
        moved: false,
        historyStarted: false,
        additive: event.shiftKey
      };
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const world = toWorld(event.clientX, event.clientY);
    setCursorWorld(world);

    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.lastClientX;
    const dy = event.clientY - drag.lastClientY;
    if (Math.abs(event.clientX - drag.startClientX) + Math.abs(event.clientY - drag.startClientY) > 3) {
      drag.moved = true;
    }
    drag.lastClientX = event.clientX;
    drag.lastClientY = event.clientY;
    if (drag.mode === 'pan') {
      setViewport({ ...viewport, x: viewport.x + dx, y: viewport.y + dy });
      return;
    }
    if (drag.mode === 'device') {
      if (!drag.moved) return;
      if (!drag.historyStarted) {
        beginDrag();
        drag.historyStarted = true;
      }
      moveSelectedBy(dx / viewport.zoom, dy / viewport.zoom);

      const state = useAppStore.getState();
      if (state.selection.length === 1) {
        const primary = state.project.devices.find((entry) => entry.id === state.selection[0]);
        if (primary) {
          let snapX: number | null = null;
          let snapY: number | null = null;
          for (const other of state.project.devices) {
            if (other.id === primary.id) continue;
            if (Math.abs(other.x - primary.x) <= ALIGNMENT_THRESHOLD) snapX = other.x;
            if (Math.abs(other.y - primary.y) <= ALIGNMENT_THRESHOLD) snapY = other.y;
          }
          setAlignmentGuides({ x: snapX, y: snapY });
        }
      } else {
        setAlignmentGuides({ x: null, y: null });
      }
      return;
    }
    if (drag.mode === 'marquee') {
      setMarquee({ x1: drag.startWorldX, y1: drag.startWorldY, x2: world.x, y2: world.y });
    }
  };

  const handlePointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    setAlignmentGuides({ x: null, y: null });
    if (!drag) return;
    if (drag.mode === 'device') {
      if (drag.moved) {
        if (settings.snapToGrid) {
          const state = useAppStore.getState();
          for (const id of state.selection) {
            const device = state.project.devices.find((entry) => entry.id === id);
            if (!device) continue;
            setDevicePosition(
              id,
              Math.round(device.x / settings.gridSize) * settings.gridSize,
              Math.round(device.y / settings.gridSize) * settings.gridSize
            );
          }
        }
        endDrag();
      }
      return;
    }
    if (drag.mode === 'marquee' && marquee) {
      const minX = Math.min(marquee.x1, marquee.x2);
      const maxX = Math.max(marquee.x1, marquee.x2);
      const minY = Math.min(marquee.y1, marquee.y2);
      const maxY = Math.max(marquee.y1, marquee.y2);
      const inside = project.devices
        .filter(
          (device) =>
            device.x + DEVICE_FOOTPRINT.right >= minX &&
            device.x + DEVICE_FOOTPRINT.left <= maxX &&
            device.y + DEVICE_FOOTPRINT.bottom >= minY &&
            device.y + DEVICE_FOOTPRINT.top <= maxY
        )
        .map((device) => device.id);
      if (drag.additive) {
        selectMany([...new Set([...selection, ...inside])]);
      } else {
        selectMany(inside);
      }
      setMarquee(null);
    }
  };

  const handleDrop = (event: ReactDragEvent<SVGSVGElement>) => {
    event.preventDefault();
    const kind = event.dataTransfer.getData('application/x-netlab-device') as DeviceKind;
    if (!kind) return;
    const world = toWorld(event.clientX, event.clientY);
    const position = findOpenDevicePosition(project.devices, world, settings.gridSize);
    addDevice(kind, position.x, position.y);
  };

  const addDeviceAtPoint = (kind: DeviceKind, point: { x: number; y: number }) => {
    const position = findOpenDevicePosition(project.devices, point, settings.gridSize);
    addDevice(kind, position.x, position.y);
  };

  const handleContextMenu = (event: ReactMouseEvent<SVGSVGElement>) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY });
  };

  const deviceContextMenu = (event: ReactMouseEvent<SVGGElement>, deviceId: string) => {
    event.preventDefault();
    event.stopPropagation();
    selectDevice(deviceId);
    setContextMenu({ x: event.clientX, y: event.clientY, deviceId });
  };

  const linkContextMenu = (event: ReactMouseEvent<SVGLineElement>, linkId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, linkId });
  };

  const gridSize = Math.max(10, settings.gridSize);
  const contextDevice = contextMenu?.deviceId ? deviceMap.get(contextMenu.deviceId) : null;
  const contextLink = contextMenu?.linkId ? project.links.find((link) => link.id === contextMenu.linkId) : null;
  const contextLinkA = contextLink ? deviceMap.get(contextLink.a.deviceId) : null;
  const contextLinkB = contextLink ? deviceMap.get(contextLink.b.deviceId) : null;
  const worldPoint = contextMenu ? toWorld(contextMenu.x, contextMenu.y) : null;
  const connectSourceDevice = connectSource ? deviceMap.get(connectSource) : null;
  const connectTargetDevice =
    hoveredDeviceId && hoveredDeviceId !== connectSource ? deviceMap.get(hoveredDeviceId) : null;
  const previewEnd = connectTargetDevice
    ? { x: connectTargetDevice.x, y: connectTargetDevice.y }
    : cursorWorld;
  const selectedDevice = selection.length === 1 ? deviceMap.get(selection[0]) ?? null : null;
  const selectedDefinition = selectedDevice ? DEVICE_DEFINITIONS[selectedDevice.kind] : null;
  const selectedAddress = selectedDevice?.interfaces.find((entry) => entry.ip)?.ip ?? '';
  const selectedPopover = selectedDevice
    ? {
        left: viewport.x + selectedDevice.x * viewport.zoom + 34 * viewport.zoom,
        top: viewport.y + selectedDevice.y * viewport.zoom - 8 * viewport.zoom
      }
    : null;

  return (
    <div className="canvas-shell">
      <svg
        ref={svgRef}
        className={`topology-canvas tool-${tool} ${activeCable ? 'is-connecting' : ''} ${spaceDown ? 'is-panning' : ''}`}
        onPointerDown={beginBackgroundInteraction}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => setCursorWorld(null)}
        onWheel={handleWheel}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        onContextMenu={handleContextMenu}
        data-testid="topology-canvas"
      >
        <defs>
          <pattern
            id="engineering-grid"
            width={gridSize}
            height={gridSize}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}
          >
            <path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} fill="none" className="grid-line" />
          </pattern>
          <pattern
            id="engineering-grid-major"
            width={gridSize * 5}
            height={gridSize * 5}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}
          >
            <rect width={gridSize * 5} height={gridSize * 5} fill="url(#engineering-grid)" />
            <path d={`M ${gridSize * 5} 0 L 0 0 0 ${gridSize * 5}`} fill="none" className="grid-line-major" />
          </pattern>
          <filter id="device-elevation" x="-25%" y="-25%" width="150%" height="150%">
            <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#090d16" floodOpacity="0.22" />
          </filter>
        </defs>

        <rect
          width="100%"
          height="100%"
          fill={settings.showGrid ? 'url(#engineering-grid-major)' : 'transparent'}
          className="canvas-background"
        />

        <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}>
          {settings.showGrid && (
            <g className="canvas-origin-crosshair" opacity={0.35} pointerEvents="none">
              <line x1={-12} y1={0} x2={12} y2={0} stroke="currentColor" strokeWidth={1 / viewport.zoom} />
              <line x1={0} y1={-12} x2={0} y2={12} stroke="currentColor" strokeWidth={1 / viewport.zoom} />
            </g>
          )}

          {alignmentGuides.x !== null && (
            <line
              x1={alignmentGuides.x}
              y1={-10000}
              x2={alignmentGuides.x}
              y2={10000}
              stroke="#38bdf8"
              strokeWidth={1 / viewport.zoom}
              strokeDasharray={`${4 / viewport.zoom} ${4 / viewport.zoom}`}
              pointerEvents="none"
            />
          )}
          {alignmentGuides.y !== null && (
            <line
              x1={-10000}
              y1={alignmentGuides.y}
              x2={10000}
              y2={alignmentGuides.y}
              stroke="#38bdf8"
              strokeWidth={1 / viewport.zoom}
              strokeDasharray={`${4 / viewport.zoom} ${4 / viewport.zoom}`}
              pointerEvents="none"
            />
          )}

          {project.links.map((link) => {
            const a = deviceMap.get(link.a.deviceId);
            const b = deviceMap.get(link.b.deviceId);
            if (!a || !b) return null;
            const up = linkIsUp(link, project.devices);
            const aInterface = a.interfaces.find((entry) => entry.id === link.a.interfaceId);
            const bInterface = b.interfaces.find((entry) => entry.id === link.b.interfaceId);

            const group = linkGroupMeta.get(link.id) ?? { index: 0, total: 1 };
            const canonicalOrder = a.id < b.id ? 1 : -1;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.hypot(dx, dy) || 1;
            const ux = dx / dist;
            const uy = dy / dist;
            const nx = -uy * canonicalOrder;
            const ny = ux * canonicalOrder;
            const offset = (group.index - (group.total - 1) / 2) * DEVICE_PARALLEL_LINK_SPACING;

            const x1 = a.x + nx * offset;
            const y1 = a.y + ny * offset;
            const x2 = b.x + nx * offset;
            const y2 = b.y + ny * offset;

            const portOffset = Math.min(DEVICE_PORT_ANCHOR_OFFSET, dist * 0.35);
            const portAX = x1 + ux * portOffset;
            const portAY = y1 + uy * portOffset;
            const portBX = x2 - ux * portOffset;
            const portBY = y2 - uy * portOffset;

            const showPortBadges =
              hoveredLinkId === link.id ||
              selection.includes(a.id) ||
              selection.includes(b.id);

            return (
              <g
                key={link.id}
                className={`link ${up ? 'link-up' : 'link-down'} link-${link.cable}`}
                onMouseEnter={() => setHoveredLinkId(link.id)}
                onMouseLeave={() => setHoveredLinkId((prev) => (prev === link.id ? null : prev))}
              >
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  className="link-hit"
                  onContextMenu={(event) => linkContextMenu(event, link.id)}
                />
                <line x1={x1} y1={y1} x2={x2} y2={y2} className="link-line">
                  <title>{`${a.name} ${aInterface?.name ?? ''} <-> ${b.name} ${bInterface?.name ?? ''} (${link.cable.replace(/-/g, ' ')})`}</title>
                </line>
                <rect x={portAX - 3} y={portAY - 3} width={6} height={6} rx={1.5} className="link-endpoint" />
                <rect x={portBX - 3} y={portBY - 3} width={6} height={6} rx={1.5} className="link-endpoint" />

                {showPortBadges && dist > 110 && (
                  <g pointerEvents="none" opacity={0.9}>
                    {aInterface?.name && (
                      <text
                        x={x1 + ux * (portOffset + 14)}
                        y={y1 + uy * (portOffset + 14) - 4}
                        textAnchor="middle"
                        style={{ fontSize: '9px', fontFamily: 'monospace', fill: 'currentColor' }}
                      >
                        {aInterface.name}
                      </text>
                    )}
                    {bInterface?.name && (
                      <text
                        x={x2 - ux * (portOffset + 14)}
                        y={y2 - uy * (portOffset + 14) - 4}
                        textAnchor="middle"
                        style={{ fontSize: '9px', fontFamily: 'monospace', fill: 'currentColor' }}
                      >
                        {bInterface.name}
                      </text>
                    )}
                  </g>
                )}
              </g>
            );
          })}

          {activeEvent?.edge && settings.showPacketAnimation ? (
            <PacketMarker
              key={activeEvent.id}
              from={deviceMap.get(activeEvent.edge.fromDeviceId)}
              to={deviceMap.get(activeEvent.edge.toDeviceId)}
              protocol={activeEvent.packet.protocol}
              eventId={activeEvent.id}
              offset={activeLinkOffset}
              onClick={() => selectEvent(activeEvent.id)}
            />
          ) : null}

          {activeCable && connectSourceDevice && previewEnd && (
            <g className="cable-preview" pointerEvents="none">
              <line
                x1={connectSourceDevice.x}
                y1={connectSourceDevice.y}
                x2={previewEnd.x}
                y2={previewEnd.y}
                stroke="#38bdf8"
                strokeWidth={2}
                strokeDasharray="5 4"
              />
              <circle cx={previewEnd.x} cy={previewEnd.y} r={4.5} fill="#38bdf8" />
            </g>
          )}

          {project.devices.map((device) => {
            const isSource = connectSource === device.id;
            const down = device.interfaces.every((entry) => !entry.enabled);
            return (
              <g
                key={device.id}
                transform={`translate(${device.x} ${device.y})`}
                className={`canvas-device ${isSource ? 'is-connect-source' : ''} ${down ? 'is-down' : ''}`}
                onPointerDown={(event) => beginDeviceInteraction(event, device.id)}
                onPointerEnter={() => setHoveredDeviceId(device.id)}
                onPointerLeave={() => setHoveredDeviceId((prev) => (prev === device.id ? null : prev))}
                onContextMenu={(event) => deviceContextMenu(event, device.id)}
                data-testid={`device-${device.id}`}
              >
                <rect
                  x={-DEVICE_FRAME_HALF_WIDTH}
                  y={-DEVICE_FRAME_HALF_HEIGHT}
                  width={DEVICE_FRAME_HALF_WIDTH * 2}
                  height={DEVICE_FRAME_HALF_HEIGHT * 2}
                  rx={0}
                  className="device-hit"
                />

                <g
                  className="device-glyph"
                  transform={`translate(${-DEVICE_SYMBOL_SIZE / 2} ${-DEVICE_SYMBOL_SIZE / 2})`}
                >
                  <DeviceSymbol kind={device.kind} size={DEVICE_SYMBOL_SIZE} dimmed={down} />
                </g>

                {settings.showLabels ? (
                  <g className="device-label">
                    <rect
                      x={-DEVICE_LABEL_WIDTH / 2}
                      y={DEVICE_LABEL_TOP}
                      width={DEVICE_LABEL_WIDTH}
                      height={DEVICE_LABEL_HEIGHT}
                      rx={4}
                    />
                    <text x={0} y={DEVICE_LABEL_BASELINE} textAnchor="middle">
                      {device.name}
                    </text>
                  </g>
                ) : null}

                <circle
                  cx={DEVICE_STATUS_X}
                  cy={DEVICE_STATUS_Y}
                  r={DEVICE_STATUS_BACKDROP_RADIUS}
                  className="device-status-backdrop"
                />
                <circle
                  cx={DEVICE_STATUS_X}
                  cy={DEVICE_STATUS_Y}
                  r={DEVICE_STATUS_RADIUS}
                  className={`device-status ${device.interfaces.some((entry) => entry.enabled) ? 'status-up' : 'status-down'}`}
                />
              </g>
            );
          })}

          {marquee ? (
            <rect
              className="marquee"
              x={Math.min(marquee.x1, marquee.x2)}
              y={Math.min(marquee.y1, marquee.y2)}
              width={Math.abs(marquee.x2 - marquee.x1)}
              height={Math.abs(marquee.y2 - marquee.y1)}
            />
          ) : null}
        </g>
      </svg>

      {selectedDevice && selectedPopover && !marquee ? (
        <aside
          className="device-detail-popover"
          style={{ left: `${selectedPopover.left}px`, top: `${selectedPopover.top}px` }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          data-testid="device-detail-popover"
        >
          <div className="device-detail-popover-head">
            <strong>{selectedDevice.name}</strong>
            <span>{selectedDefinition?.label ?? selectedDevice.kind}</span>
          </div>
          <dl className="device-detail-popover-grid">
            <dt>Status</dt>
            <dd>{selectedDevice.interfaces.some((entry) => entry.enabled) ? 'Active' : 'Disabled'}</dd>
            <dt>Address</dt>
            <dd>{selectedAddress || 'Unassigned'}</dd>
            {selectedDevice.gateway ? (
              <>
                <dt>Gateway</dt>
                <dd>{selectedDevice.gateway}</dd>
              </>
            ) : null}
            <dt>Ports</dt>
            <dd>{selectedDevice.interfaces.length}</dd>
          </dl>
          <div className="device-detail-popover-actions">
            {['pc', 'laptop', 'server', 'printer', 'router', 'switch', 'wireless-router'].includes(selectedDevice.kind) ? (
              <button type="button" className="mini-button" onClick={() => openTerminal(selectedDevice.id)}>Terminal</button>
            ) : null}
            {['pc', 'laptop'].includes(selectedDevice.kind) ? (
              <button type="button" className="mini-button" onClick={() => openBrowser(selectedDevice.id)}>Browser</button>
            ) : null}
            <button type="button" className="danger-button" onClick={deleteSelection}>Delete device</button>
          </div>
        </aside>
      ) : null}

      {project.devices.length === 0 ? (
        <div className="canvas-empty">
          <div className="canvas-empty-title">Empty workspace</div>
          <p>Drag a device from the palette below, or click a device to place it.</p>
          <p className="muted">Start with a switch and two PCs to build your first LAN.</p>
        </div>
      ) : null}

      {activeCable ? (
        <div className="canvas-hint">
          <Icon name="cable" size={14} />
          <span>
            {connectSource
              ? 'Now select the second device. The interface dialog will open next.'
              : `Connect with ${activeCable.replace(/-/g, ' ')}: select the first device.`}
          </span>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setCable(null);
              setConnectSource(null);
            }}
          >
            Cancel
          </button>
        </div>
      ) : null}

      <div className="canvas-controls">
        <button type="button" className="canvas-control" onClick={() => zoomBy(1.2)} title="Zoom in">
          <Icon name="zoom-in" />
        </button>
        <span className="zoom-readout">{Math.round(viewport.zoom * 100)}%</span>
        <button type="button" className="canvas-control" onClick={() => zoomBy(0.83)} title="Zoom out">
          <Icon name="zoom-out" />
        </button>
        <button type="button" className="canvas-control" onClick={fitToContent} title="Fit workspace">
          <Icon name="fit" />
        </button>
        <button
          type="button"
          className={`canvas-control ${settings.showGrid ? 'is-active' : ''}`}
          onClick={() => updateSettings({ showGrid: !settings.showGrid })}
          title="Toggle grid"
        >
          <Icon name="template" />
        </button>
      </div>

      <div className="canvas-legend">
        <span className="legend-item">
          <i className="legend-line legend-up" /> Link up
        </span>
        <span className="legend-item">
          <i className="legend-line legend-down" /> Link down
        </span>
        <span className="legend-item">
          <i className="legend-line legend-wireless" /> Wireless
        </span>
        {cursorWorld ? (
          <span className="legend-item legend-muted" style={{ fontFamily: 'monospace' }}>
            X:{Math.round(cursorWorld.x)} Y:{Math.round(cursorWorld.y)}
          </span>
        ) : null}
        <span className="legend-item legend-muted">Wheel = zoom · Space drag = pan · Right click = menu</span>
      </div>

      {contextMenu ? (
        <div
          className="context-menu"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 240),
            top: Math.min(contextMenu.y, window.innerHeight - 280)
          }}
          onClick={(event) => event.stopPropagation()}
        >
          {contextDevice ? (
            <>
              <div className="context-title">{contextDevice.name}</div>
              <button
                type="button"
                onClick={() => {
                  clearSelection();
                  selectDevice(contextDevice.id);
                  setContextMenu(null);
                }}
              >
                Inspect device
              </button>
              <button
                type="button"
                onClick={() => {
                  openTerminal(contextDevice.id);
                  setContextMenu(null);
                }}
              >
                Open terminal
              </button>
              <button
                type="button"
                onClick={() => {
                  selectDevice(contextDevice.id);
                  duplicateSelection();
                  setContextMenu(null);
                }}
              >
                Duplicate
              </button>
              <button
                type="button"
                onClick={() => {
                  for (const link of project.links) {
                    if (link.a.deviceId === contextDevice.id || link.b.deviceId === contextDevice.id) {
                      deleteLink(link.id);
                    }
                  }
                  setContextMenu(null);
                }}
              >
                Disconnect all cables
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteDevice(contextDevice.id);
                  setContextMenu(null);
                }}
              >
                Delete device
              </button>
            </>
          ) : contextLink ? (
            <>
              <div className="context-title">Connection</div>
              <div className="context-detail">
                {contextLinkA?.name} ↔ {contextLinkB?.name}
                <br />
                {contextLink.cable.replace(/-/g, ' ')}
              </div>
              <button
                type="button"
                onClick={() => {
                  deleteLink(contextLink.id);
                  setContextMenu(null);
                }}
              >
                Delete connection
              </button>
            </>
          ) : (
            <>
              <div className="context-title">Workspace</div>
              <button
                type="button"
                onClick={() => {
                  if (worldPoint) addDeviceAtPoint('pc', worldPoint);
                  setContextMenu(null);
                }}
              >
                Add PC here
              </button>
              <button
                type="button"
                onClick={() => {
                  if (worldPoint) addDeviceAtPoint('switch', worldPoint);
                  setContextMenu(null);
                }}
              >
                Add switch here
              </button>
              <button
                type="button"
                onClick={() => {
                  if (worldPoint) addDeviceAtPoint('router', worldPoint);
                  setContextMenu(null);
                }}
              >
                Add router here
              </button>
              <button
                type="button"
                onClick={() => {
                  useAppStore.getState().selectAll();
                  setContextMenu(null);
                }}
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => {
                  fitToContent();
                  setContextMenu(null);
                }}
              >
                Fit workspace
              </button>
              <button
                type="button"
                onClick={() => {
                  useAppStore.getState().resetSimulation();
                  setContextMenu(null);
                }}
              >
                Reset simulation
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
