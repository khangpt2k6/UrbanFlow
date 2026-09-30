import { describe, it, expect } from 'vitest';
import { Playout } from '../src/render/playout';
import type { WorldSnapshot } from '../src/types/snapshot';

// One car driving east at 10 m/s: x = sim seconds * 10.
function snap(simMs: number): WorldSnapshot {
  const x = simMs / 100;
  return {
    tickId: simMs,
    simTimeMs: simMs,
    vehicles: [{ id: 1, t: 2, x, y: 0, h: 0, v: 10, emer: false, rx: x - 4.5, ry: 0 }],
    pedestrians: [],
    signals: { phase: 'NS', through: { NORTH: 'GREEN', SOUTH: 'GREEN', EAST: 'RED', WEST: 'RED' }, left: { NORTH: 'RED', SOUTH: 'RED', EAST: 'RED', WEST: 'RED' } },
    stats: {} as WorldSnapshot['stats'],
  };
}

describe('Playout', () => {
  it('renders smooth motion even when frames arrive with heavy jitter', () => {
    const p = new Playout();
    // snapshots every 33 sim ms, but arrival times wobble by up to +/-15 ms
    const jitter = [0, 14, -12, 9, -15, 3, 12, -8, 15, -14, 6, -3];
    let next = 0;
    const xs: number[] = [];
    for (let wall = 0; wall < 2000; wall += 16) {
      while (next * 33 + jitter[next % jitter.length] <= wall) {
        p.push(snap(next * 33), next * 33 + jitter[next % jitter.length]);
        next++;
      }
      const f = p.sample(wall);
      if (f && wall > 400) xs.push(f.vehicles[0].x);
    }
    // per-frame step should stay close to 10 m/s * 16 ms = 0.16 m, with no freezes or leaps
    const steps = xs.slice(1).map((x, i) => x - xs[i]);
    for (const s of steps) {
      expect(s).toBeGreaterThan(0.06);
      expect(s).toBeLessThan(0.3);
    }
  });

  it('holds still while paused and restarts cleanly after a reset', () => {
    const p = new Playout();
    for (let i = 0; i < 10; i++) p.push(snap(i * 33), i * 33);
    for (let w = 330; w < 1000; w += 33) p.push(snap(297), w); // paused: sim clock frozen
    for (let w = 1000; w <= 1300; w += 16) p.sample(w); // playhead drains the buffer, then parks
    const a = p.sample(1316)!;
    const b = p.sample(1500)!;
    expect(a.vehicles[0].x).toBeCloseTo(2.97, 5);
    expect(b.vehicles[0].x).toBeCloseTo(a.vehicles[0].x, 5);

    p.push(snap(0), 1600); // reset: clock went backwards
    expect(p.sample(1616)!.vehicles[0].x).toBeCloseTo(0, 5);
  });
});
