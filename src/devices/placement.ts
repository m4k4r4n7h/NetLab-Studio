export interface DevicePosition {
  x: number;
  y: number;
}

const MINIMUM_SPACING = 100;
const SEARCH_RADIUS = 12;

function snap(value: number, gridSize: number): number {
  return gridSize > 0 ? Math.round(value / gridSize) * gridSize : Math.round(value);
}

function ringOffsets(radius: number): DevicePosition[] {
  if (radius === 0) return [{ x: 0, y: 0 }];
  const offsets: DevicePosition[] = [];
  for (let x = -radius; x <= radius; x += 1) offsets.push({ x, y: -radius });
  for (let y = -radius + 1; y < radius; y += 1) {
    offsets.push({ x: -radius, y });
    offsets.push({ x: radius, y });
  }
  for (let x = -radius; x <= radius; x += 1) offsets.push({ x, y: radius });
  return offsets;
}

export function findOpenDevicePosition(
  devices: ReadonlyArray<DevicePosition>,
  anchor: DevicePosition,
  gridSize = 0
): DevicePosition {
  const spacing = gridSize > 0
    ? Math.max(MINIMUM_SPACING, Math.ceil(MINIMUM_SPACING / gridSize) * gridSize)
    : MINIMUM_SPACING;
  const base = { x: snap(anchor.x, gridSize), y: snap(anchor.y, gridSize) };
  const isOccupied = (position: DevicePosition) => devices.some(
    (device) => Math.abs(device.x - position.x) < spacing && Math.abs(device.y - position.y) < spacing
  );

  for (let radius = 0; radius <= SEARCH_RADIUS; radius += 1) {
    for (const offset of ringOffsets(radius)) {
      const candidate = { x: base.x + offset.x * spacing, y: base.y + offset.y * spacing };
      if (!isOccupied(candidate)) return candidate;
    }
  }

  return base;
}
