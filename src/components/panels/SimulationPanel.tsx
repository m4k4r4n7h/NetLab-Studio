import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../state/store';
import { EVENT_LABELS } from '../../engine/core/events';
import type { SimulationEvent } from '../../engine/core/events';
import { packetLayers } from '../../engine/core/packet';
import { Icon } from '../common/Icon';

function LayerBlock({ title, lines }: { title: string; lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="packet-layer">
      <h4>{title}</h4>
      <dl>
        {lines.map((line, index) => {
          const [label, ...rest] = line.split(':');
          const value = rest.join(':').trim();
          return (
            <div key={`${title}-${index}`} className="packet-layer-row">
              <dt>{value ? label : 'Value'}</dt>
              <dd>{value || line}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

function PacketInspector({ event }: { event: SimulationEvent }) {
  const learningMode = useAppStore((state) => state.project.settings.learningMode);
  const layers = packetLayers(event.packet);
  const packet = event.packet;
  return (
    <div className="packet-inspector">
      <div className="packet-header">
        <span className={`protocol-badge protocol-${packet.protocol.toLowerCase()}`}>{packet.protocol}</span>
        <span className="mono small">{packet.summary}</span>
        <span className="packet-size">{packet.sizeBytes} B</span>
      </div>
      <div className="packet-meta-grid">
        <span>Device</span><strong>{event.deviceName}</strong>
        <span>Time</span><strong>{event.time.toFixed(2)} ms</strong>
        <span>Layer</span><strong>{event.layer}</strong>
        <span>Outcome</span><strong className={`outcome-${event.outcome}`}>{event.outcome}</strong>
      </div>
      <div className="event-detail">
        <p>{event.detail}</p>
        {learningMode ? <p className="event-explanation">{event.explanation}</p> : null}
      </div>
      <div className="packet-layers">
        <LayerBlock title="Ethernet frame (L2)" lines={layers.frame} />
        <LayerBlock title="IPv4 packet (L3)" lines={layers.network} />
        <LayerBlock title="Transport (L4)" lines={layers.transport} />
        <LayerBlock title="Application data (L7)" lines={layers.application} />
      </div>
      {packet.ethernet ? (
        <div className="encapsulation-note">
          Encapsulation: the IPv4 packet is carried inside an Ethernet frame addressed to {packet.ethernet.dstMac}.
        </div>
      ) : (
        <div className="encapsulation-note">This event shows the packet before Layer 2 encapsulation, or after decapsulation.</div>
      )}
    </div>
  );
}

export function SimulationPanel() {
  const simulation = useAppStore((state) => state.simulation);
  const setSimulationMode = useAppStore((state) => state.setSimulationMode);
  const setSimulationSpeed = useAppStore((state) => state.setSimulationSpeed);
  const playSimulation = useAppStore((state) => state.playSimulation);
  const pauseSimulation = useAppStore((state) => state.pauseSimulation);
  const stepForward = useAppStore((state) => state.stepForward);
  const stepBackward = useAppStore((state) => state.stepBackward);
  const resetSimulation = useAppStore((state) => state.resetSimulation);
  const clearSimulation = useAppStore((state) => state.clearSimulation);
  const selectEvent = useAppStore((state) => state.selectEvent);
  const openDialog = useAppStore((state) => state.openDialog);
  const setSimulationDrawerOpen = useAppStore((state) => state.setSimulationDrawerOpen);
  const learningMode = useAppStore((state) => state.project.settings.learningMode);
  const [filter, setFilter] = useState('all');
  const [packetTab, setPacketTab] = useState<'events' | 'packet'>('events');

  const revealed = simulation.events.slice(0, simulation.cursor);
  const selectedEvent = useMemo(() => {
    if (simulation.selectedEventId) {
      return revealed.find((event) => event.id === simulation.selectedEventId) ?? null;
    }
    return revealed.length > 0 ? revealed[revealed.length - 1] : null;
  }, [revealed, simulation.selectedEventId]);

  useEffect(() => {
    if (simulation.status !== 'playing') return;
    const interval = window.setInterval(() => {
      const state = useAppStore.getState();
      if (state.simulation.cursor >= state.simulation.events.length) {
        state.pauseSimulation();
        return;
      }
      state.stepForward();
    }, Math.max(60, 900 - simulation.speed * 40));
    return () => window.clearInterval(interval);
  }, [simulation.status, simulation.speed]);

  const visibleEvents = revealed.filter((event) => {
    if (filter === 'all') return true;
    if (filter === 'drops') return event.outcome === 'dropped';
    return event.layer === filter;
  });

  return (
    <aside className="simulation-panel" aria-label="Simulation panel">
      <div className="panel-heading">
        <div>
          <h2><Icon name="event" size={15} /> Simulation</h2>
          <p className="panel-subtitle">{simulation.requestLabel || 'Generate traffic from a device terminal or the packet generator.'}</p>
        </div>
        <div className="panel-heading-actions">
          <button
            type="button"
            className="icon-button"
            title="Clear simulation events"
            onClick={clearSimulation}
            disabled={simulation.events.length === 0}
          >
            <Icon name="trash" size={14} />
          </button>
          <button
            type="button"
            className="icon-button simulation-drawer-close"
            title="Close simulation panel"
            onClick={() => setSimulationDrawerOpen(false)}
            aria-label="Close simulation panel"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      </div>

      <div className="segmented simulation-mode-toggle" role="tablist" aria-label="Simulation mode">
        <button
          type="button"
          role="tab"
          aria-selected={simulation.mode === 'realtime'}
          className={simulation.mode === 'realtime' ? 'is-active' : ''}
          onClick={() => setSimulationMode('realtime')}
        >
          REALTIME
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={simulation.mode === 'simulation'}
          className={simulation.mode === 'simulation' ? 'is-active' : ''}
          onClick={() => setSimulationMode('simulation')}
        >
          SIMULATION
        </button>
      </div>

      <div className="simulation-controls">
        <button
          type="button"
          className="control-button"
          onClick={playSimulation}
          disabled={simulation.events.length === 0 || simulation.status === 'playing'}
          title="Play simulation"
        >
          <Icon name="play" size={15} /> Play
        </button>
        <button
          type="button"
          className="control-button"
          onClick={pauseSimulation}
          disabled={simulation.status !== 'playing'}
          title="Pause simulation"
        >
          <Icon name="pause" size={15} /> Pause
        </button>
        <button
          type="button"
          className="control-button"
          onClick={stepForward}
          disabled={simulation.cursor >= simulation.events.length}
          title="Step forward"
        >
          <Icon name="step-forward" size={15} /> Step
        </button>
        <button
          type="button"
          className="control-button"
          onClick={stepBackward}
          disabled={simulation.cursor === 0}
          title="Step backward"
        >
          <Icon name="step-back" size={15} /> Back
        </button>
        <button
          type="button"
          className="control-button"
          onClick={resetSimulation}
          disabled={simulation.events.length === 0}
          title="Reset simulation"
        >
          <Icon name="reset" size={15} /> Reset
        </button>
      </div>

      <label className="speed-control">
        <span>Speed</span>
        <input
          type="range"
          min={1}
          max={20}
          value={simulation.speed}
          onChange={(event) => setSimulationSpeed(Number(event.target.value))}
        />
        <strong>{simulation.speed}×</strong>
      </label>

      <div className="simulation-progress">
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${simulation.events.length === 0 ? 0 : (simulation.cursor / simulation.events.length) * 100}%` }}
          />
        </div>
        <span>{simulation.cursor} / {simulation.events.length} events</span>
      </div>

      <div className="status-line">
        <span className={`status-pill status-${simulation.status}`}>{simulation.status}</span>
        <span className="summary-text" title={simulation.summary}>{simulation.summary || 'No simulation has been run.'}</span>
      </div>

      <div className="panel-tabs">
        <button type="button" className={packetTab === 'events' ? 'is-active' : ''} onClick={() => setPacketTab('events')}>
          Event list
        </button>
        <button type="button" className={packetTab === 'packet' ? 'is-active' : ''} onClick={() => setPacketTab('packet')}>
          Packet inspection
        </button>
        <button type="button" className="panel-tab-action" onClick={() => openDialog('packet-generator')} title="Open packet generator">
          <Icon name="plus" size={13} /> Packet
        </button>
      </div>

      {packetTab === 'events' ? (
        <>
          <div className="event-filters">
            <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter events">
              <option value="all">All events</option>
              <option value="L1">Layer 1</option>
              <option value="L2">Layer 2</option>
              <option value="L3">Layer 3</option>
              <option value="L4">Layer 4</option>
              <option value="L7">Layer 7</option>
              <option value="drops">Dropped only</option>
            </select>
            <span className="muted small">{visibleEvents.length} shown</span>
          </div>
          <div className="event-list" role="list" data-testid="event-list">
            {visibleEvents.length === 0 ? (
              <div className="empty-note">
                {simulation.events.length === 0
                  ? 'Run ping, DNS, or HTTP from a device terminal to populate the event list.'
                  : 'No events match this filter.'}
              </div>
            ) : (
              visibleEvents.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  role="listitem"
                  className={`event-row event-${event.outcome} ${selectedEvent?.id === event.id ? 'is-selected' : ''}`}
                  onClick={() => {
                    selectEvent(event.id);
                    setPacketTab('packet');
                  }}
                >
                  <span className="event-time">{event.time.toFixed(1)}</span>
                  <span className={`event-layer layer-${event.layer}`}>{event.layer}</span>
                  <span className="event-main">
                    <span className="event-title">{EVENT_LABELS[event.type]}</span>
                    <span className="event-summary">{event.summary}</span>
                    <span className="event-device">{event.deviceName}</span>
                  </span>
                </button>
              ))
            )}
          </div>
          {learningMode && selectedEvent ? (
            <div className="learning-callout">
              <Icon name="inspect" size={14} />
              <p>{selectedEvent.explanation}</p>
            </div>
          ) : null}
        </>
      ) : (
        <div className="packet-pane">
          {selectedEvent ? <PacketInspector event={selectedEvent} /> : (
            <div className="empty-note">Select an event from the list to inspect Ethernet, IPv4, transport, and application layers.</div>
          )}
        </div>
      )}
    </aside>
  );
}
