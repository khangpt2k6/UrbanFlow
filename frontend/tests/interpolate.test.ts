import { describe, it, expect } from 'vitest';
import { lerpAngle, interpolateVehicles } from '../src/render/interpolate';
import type { VehicleView } from '../src/types/snapshot';

function v(id: number, x: number, y: number, h = 0): VehicleView {
  return { id, t: 2, x, y, h, v: 5, emer: false };
}

describe('lerpAngle', () => {
  it('interpolates linearly within range', () => {
    expect(lerpAngle(0, Math.PI / 2, 0.5)).toBeCloseTo(Math.PI / 4);
  });

  it('takes the shortest path across the +/-PI wrap', () => {
    // from 170deg to -170deg is +20deg (the short way), not -340deg
    const a = (170 * Math.PI) / 180;
    const b = (-170 * Math.PI) / 180;
    const mid = lerpAngle(a, b, 0.5);
    expect(mid).toBeCloseTo(Math.PI, 2); // halfway is 180deg
  });
});

describe('interpolateVehicles', () => {
  it('returns latest when there is no previous frame', () => {
    const latest = [v(1, 10, 0)];
    expect(interpolateVehicles(null, latest, 0.5)).toEqual(latest);
  });

  it('blends matched vehicles by id', () => {
    const prev = [v(1, 0, 0)];
    const latest = [v(1, 10, 20)];
    const out = interpolateVehicles(prev, latest, 0.5);
    expect(out[0].x).toBeCloseTo(5);
    expect(out[0].y).toBeCloseTo(10);
  });

  it('shows newly spawned vehicles at their latest position', () => {
    const prev = [v(1, 0, 0)];
    const latest = [v(1, 10, 0), v(2, 50, 50)];
    const out = interpolateVehicles(prev, latest, 0.5);
    const fresh = out.find((o) => o.id === 2)!;
    expect(fresh.x).toBe(50);
    expect(fresh.y).toBe(50);
  });

  it('clamps alpha to [0,1]', () => {
    const prev = [v(1, 0, 0)];
    const latest = [v(1, 10, 0)];
    expect(interpolateVehicles(prev, latest, 2)[0].x).toBeCloseTo(10);
    expect(interpolateVehicles(prev, latest, -1)[0].x).toBeCloseTo(0);
  });
});
