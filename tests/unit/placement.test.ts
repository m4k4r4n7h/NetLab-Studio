import { describe, expect, it } from 'vitest';
import { findOpenDevicePosition } from '../../src/devices/placement';
import type { DevicePosition } from '../../src/devices/placement';

function overlaps(a: DevicePosition, b: DevicePosition): boolean {
  return Math.abs(a.x - b.x) < 96 && Math.abs(a.y - b.y) < 96;
}

describe('device placement', () => {
  it('returns the snapped anchor when the workspace is empty', () => {
    expect(findOpenDevicePosition([], { x: 402, y: 297 }, 20)).toEqual({ x: 400, y: 300 });
    expect(findOpenDevicePosition([], { x: 402, y: 297 })).toEqual({ x: 402, y: 297 });
  });

  it('finds a nearby free position when the anchor is occupied', () => {
    const position = findOpenDevicePosition([{ x: 400, y: 300 }], { x: 400, y: 300 }, 20);

    expect(position).not.toEqual({ x: 400, y: 300 });
    expect(position.x % 20).toBe(0);
    expect(position.y % 20).toBe(0);
    expect(overlaps(position, { x: 400, y: 300 })).toBe(false);
  });

  it('places a sequence of devices on a non-overlapping grid', () => {
    const devices: DevicePosition[] = [];
    for (let index = 0; index < 16; index += 1) {
      const position = findOpenDevicePosition(devices, { x: 400, y: 300 }, 20);
      expect(position.x % 20).toBe(0);
      expect(position.y % 20).toBe(0);
      expect(devices.some((device) => overlaps(device, position))).toBe(false);
      devices.push(position);
    }

    expect(devices).toHaveLength(16);
    expect(new Set(devices.map((device) => `${device.x}:${device.y}`)).size).toBe(16);
  });
});
