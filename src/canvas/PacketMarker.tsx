import { useEffect, useRef } from 'react';
import type { Device } from '../types';
import type { PacketProtocol } from '../engine/core/packet';

const PROTOCOL_COLORS: Record<string, string> = {
  ICMP: '#38bdf8',
  TCP: '#60a5fa',
  UDP: '#818cf8',
  ARP: '#94a3b8',
  DNS: '#2dd4bf'
};

interface PacketMarkerProps {
  from?: Device;
  to?: Device;
  protocol: PacketProtocol;
  eventId: string;
  offset?: number;
  onClick: () => void;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function PacketMarker({ from, to, protocol, eventId, offset = 0, onClick }: PacketMarkerProps) {
  const arrowRef = useRef<SVGGElement | null>(null);
  const color = PROTOCOL_COLORS[protocol] ?? '#38bdf8';

  useEffect(() => {
    if (!from || !to) return;

    const canonicalOrder = from.id < to.id ? 1 : -1;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;
    const nx = -uy * canonicalOrder;
    const ny = ux * canonicalOrder;

    const pad = Math.min(28, dist * 0.22);
    const startX = from.x + nx * offset + ux * pad;
    const startY = from.y + ny * offset + uy * pad;
    const endX = to.x + nx * offset - ux * pad;
    const endY = to.y + ny * offset - uy * pad;
    const travelDx = endX - startX;
    const travelDy = endY - startY;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    const duration = 750;
    let frameId = 0;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = (now - startTime) % duration;
      const t = elapsed / duration;
      const progress = easeOutCubic(t);

      const curX = startX + travelDx * progress;
      const curY = startY + travelDy * progress;
      const fade = t < 0.1 ? t / 0.1 : t > 0.88 ? (1 - t) / 0.12 : 1;

      if (arrowRef.current) {
        arrowRef.current.setAttribute('transform', `translate(${curX} ${curY}) rotate(${angle})`);
        arrowRef.current.setAttribute('opacity', String(Math.max(0, Math.min(1, fade))));
      }

      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [from, to, offset, eventId]);

  if (!from || !to) return null;

  const canonicalOrder = from.id < to.id ? 1 : -1;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  const nx = -uy * canonicalOrder;
  const ny = ux * canonicalOrder;

  const x1 = from.x + nx * offset;
  const y1 = from.y + ny * offset;
  const x2 = to.x + nx * offset;
  const y2 = to.y + ny * offset;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  return (
    <g
      className="packet-marker"
      onClick={onClick}
      role="presentation"
      data-event-id={eventId}
      style={{ cursor: 'pointer' }}
    >
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        className="packet-trail"
        stroke={color}
        strokeWidth={1.25}
        strokeOpacity={0.35}
      />
      <g ref={arrowRef} transform={`translate(${midX} ${midY}) rotate(${angle})`}>
        <path
          d="M -4.5 -3.2 L 3.5 0 L -4.5 3.2 L -2.6 0 Z"
          fill={color}
          stroke="#0f172a"
          strokeWidth={0.8}
          strokeLinejoin="round"
        />
        <title>{protocol} packet moving between {from.name} and {to.name}</title>
      </g>
    </g>
  );
}
