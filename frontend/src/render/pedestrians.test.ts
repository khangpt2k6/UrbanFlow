// Crossing-rule invariants for the decorative pedestrians. The one that matters most: a walker
// must NEVER have any part of its body past the kerb (onto the carriageway) unless its WALK
// phase was checked and passed at the moment it stepped off - for ANY frame timing. The original
// bug: the kerb lookahead predicted the next step without CROSS_SPEEDUP, so ~40% of arrivals
// leapt past the kerb un-gated and then crossed against a red, right through moving traffic.
import { describe, expect, it } from 'vitest';
import { __pedTest, type Walker } from './draw';
import type { SignalColor, SignalState, VehicleView } from '../types/snapshot';

const { updateWalker, setWalkLeft, PED_KERB, PED_LAT, CROSS_LAT, CROSS_SPEEDUP } = __pedTest;

function sig(ew: SignalColor, ns: SignalColor): SignalState {
  return {
    phase: 'TEST',
    through: { EAST: ew, WEST: ew, NORTH: ns, SOUTH: ns },
    left: { EAST: 'RED', WEST: 'RED', NORTH: 'RED', SOUTH: 'RED' },
  };
}

// A walker on the NORTH crosswalk (kind 'NS': crossing the N/S street, walking east -> west).
// Its WALK phase is "EAST through green"; NORTH green means the street it crosses is flowing.
function crossingWalker(u: number, speed = 5): Walker {
  return {
    pts: [
      { x: PED_LAT, y: CROSS_LAT, cross: { kind: 'NS', sign: 1 } },
      { x: -PED_LAT, y: CROSS_LAT },
      { x: -PED_LAT - 10, y: CROSS_LAT },
    ],
    i: 0, u,
    speed, color: '#fff', laneOff: 0, bob: 0,
    state: 'WALK', waitMs: 0, ageMs: 0, wx: PED_LAT, wy: CROSS_LAT, fx: -1, fy: 0,
  };
}

// Walker position along the crossing axis while it is on the crossing leg (i === 0).
function tOf(w: Walker): number {
  const u = Math.max(0, Math.min(1, w.u));
  return PED_LAT + (-PED_LAT - PED_LAT) * u;
}

function car(x: number, y: number, v: number): VehicleView {
  return { id: 1, t: 2, x, y, h: 0, v, emer: false, rx: x, ry: y };
}

describe('pedestrian kerb gate', () => {
  it('never lets a walker step off the kerb while the street it crosses has green', () => {
    setWalkLeft(0, 0);
    const dt = 1 / 60;
    const speed = 5;
    // Land the walker in the old trap window: closer to the kerb than one CROSS_SPEEDUP step,
    // but further than one un-multiplied step, so a wrong lookahead walks straight past it.
    const t0 = PED_KERB + 1.3 * speed * dt;
    const w = crossingWalker((PED_LAT - t0) / (2 * PED_LAT), speed);
    const red = sig('RED', 'GREEN'); // the N/S street being crossed is flowing
    for (let f = 0; f < 240 && w.i === 0; f++) {
      updateWalker(w, dt, dt * 1000, red, []);
      expect(tOf(w)).toBeGreaterThanOrEqual(PED_KERB - 1e-9);
    }
    expect(w.i).toBe(0);          // never made it onto the road, let alone across
    expect(w.state).toBe('WAIT'); // settled into waiting at the kerb
  });

  it('never lets leg-end overshoot carry a walker past the kerb un-gated', () => {
    setWalkLeft(0, 0);
    const speed = 5;
    const dt = 0.2; // the sim-hitch cap: the largest single step a walker can take
    const w: Walker = {
      pts: [
        { x: PED_LAT + 4, y: CROSS_LAT }, // short footpath leg ending at the crosswalk foot
        { x: PED_LAT, y: CROSS_LAT, cross: { kind: 'NS', sign: 1 } },
        { x: -PED_LAT, y: CROSS_LAT },
        { x: -PED_LAT - 10, y: CROSS_LAT },
      ],
      i: 0, u: 0.95,
      speed, color: '#fff', laneOff: 0, bob: 0,
      state: 'WALK', waitMs: 0, ageMs: 0, wx: PED_LAT + 4, wy: CROSS_LAT, fx: -1, fy: 0,
    };
    const red = sig('RED', 'GREEN');
    for (let f = 0; f < 60 && w.i <= 1; f++) {
      updateWalker(w, dt, dt * 1000, red, []);
      if (w.i === 1) {
        const u = Math.max(0, Math.min(1, w.u));
        const t = PED_LAT - 2 * PED_LAT * u;
        expect(t).toBeGreaterThanOrEqual(PED_KERB - 1e-9);
      }
    }
    expect(w.i).toBeLessThanOrEqual(1); // still held at the crosswalk, never carried across
  });

  it('still crosses promptly on its WALK phase with a clear gap', () => {
    setWalkLeft(60_000, 60_000);
    const dt = 0.05;
    const w = crossingWalker(0);
    const walkPhase = sig('GREEN', 'RED'); // E/W through green = WALK for the N/S crosswalk
    let crossed = false;
    for (let f = 0; f < 400 && !crossed; f++) {
      updateWalker(w, dt, dt * 1000, walkPhase, []);
      crossed = w.i >= 1;
    }
    expect(crossed).toBe(true);
  });

  it('bursts out of the path of a car sweeping the crosswalk mid-crossing', () => {
    setWalkLeft(60_000, 60_000);
    const dt = 1 / 60;
    const w = crossingWalker(0.5); // committed, mid-carriageway at t = 0
    const walkPhase = sig('GREEN', 'RED');
    // a moving car on the crosswalk band, just ahead of the walker in its walking direction
    const sweeper = car(-2, CROSS_LAT, 6);
    updateWalker(w, dt, dt * 1000, walkPhase, [sweeper]);
    expect(w.state).toBe('CROSS');
    expect(w.u).toBeLessThan(0.5); // stepped back, away from the car - not into it
  });
});
