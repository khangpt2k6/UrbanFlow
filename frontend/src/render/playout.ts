import type { PedestrianView, SignalState, VehicleView, WorldSnapshot } from '../types/snapshot';
import { interpolatePedestrians, interpolateVehicles } from './interpolate';

/**
 * Jitter buffer for the 30 Hz world feed (the "entity interpolation" scheme networked games use).
 *
 * Blending just the last two snapshots by arrival time stutters: a frame that lands early makes the
 * blend jump forward, one that lands late freezes motion at alpha = 1. Instead we keep a short
 * buffer keyed by the engine's own sim clock and play it back a fixed delay behind the newest frame,
 * on a local clock that advances smoothly every render frame. Network jitter then only changes how
 * much is buffered, never what is drawn. A small drift correction keeps the playhead near its
 * target, and it snaps if it falls far behind (a tab that was hidden, a reset).
 */

/** How far behind the newest snapshot we render, in wall-clock ms (about three 30 Hz frames). */
const DELAY_MS = 100;
const MAX_BUFFER = 16;
/** Beyond this lag (in wall ms) we stop easing and jump straight to the target. */
const SNAP_MS = 600;

export interface PlayoutFrame {
  vehicles: VehicleView[];
  pedestrians: PedestrianView[];
  signals: SignalState | null;
}

export class Playout {
  private buf: WorldSnapshot[] = [];
  private arrivals: number[] = []; // wall ms each buffered snapshot arrived
  private playhead: number | null = null; // sim ms being drawn
  private rate = 1; // sim ms per wall ms (the speed multiplier, estimated)
  private lastSampleWall = 0;

  push(snap: WorldSnapshot, wallMs: number) {
    const last = this.buf[this.buf.length - 1];
    if (last) {
      if (snap.simTimeMs < last.simTimeMs) {
        this.clear(); // the engine was reset: its clock restarted
      } else if (snap.simTimeMs === last.simTimeMs) {
        this.buf[this.buf.length - 1] = snap; // paused: same instant, take the fresher copy
        return;
      }
    }
    this.buf.push(snap);
    this.arrivals.push(wallMs);
    if (this.buf.length > MAX_BUFFER) {
      this.buf.shift();
      this.arrivals.shift();
    }
    // Estimate the sim-to-wall rate over the whole buffer (~half a second), not frame to frame:
    // per-frame ratios swing wildly under jitter, the windowed one is steady to a few percent.
    const n = this.buf.length;
    const dWall = this.arrivals[n - 1] - this.arrivals[0];
    if (n >= 4 && dWall > 50) {
      const r = (this.buf[n - 1].simTimeMs - this.buf[0].simTimeMs) / dWall;
      this.rate += (Math.min(8, Math.max(0.05, r)) - this.rate) * 0.2;
    }
  }

  clear() {
    this.buf = [];
    this.arrivals = [];
    this.playhead = null;
  }

  latest(): WorldSnapshot | null {
    return this.buf[this.buf.length - 1] ?? null;
  }

  sample(wallMs: number): PlayoutFrame | null {
    const n = this.buf.length;
    if (n === 0) return null;
    const newest = this.buf[n - 1];
    const oldest = this.buf[0];
    const target = newest.simTimeMs - DELAY_MS * this.rate;
    const dt = this.playhead === null ? 0 : Math.min(100, Math.max(0, wallMs - this.lastSampleWall));
    this.lastSampleWall = wallMs;

    if (this.playhead === null || Math.abs(target - this.playhead) > SNAP_MS * this.rate) {
      this.playhead = target;
    } else {
      this.playhead += dt * this.rate;
      // ease toward the target so the buffer depth stays near DELAY_MS without visible speed jumps
      this.playhead += (target - this.playhead) * Math.min(1, dt / 400);
    }
    // never run past the data we have, and never before it
    this.playhead = Math.min(newest.simTimeMs, Math.max(oldest.simTimeMs, this.playhead));

    let i = n - 1;
    while (i > 0 && this.buf[i - 1].simTimeMs > this.playhead) i--;
    const b = this.buf[i];
    const a = i > 0 ? this.buf[i - 1] : b;
    const span = b.simTimeMs - a.simTimeMs;
    const t = span > 0 ? (this.playhead - a.simTimeMs) / span : 1;
    return {
      vehicles: a === b ? b.vehicles : interpolateVehicles(a.vehicles, b.vehicles, t),
      pedestrians: a === b ? (b.pedestrians ?? []) : interpolatePedestrians(a.pedestrians ?? [], b.pedestrians ?? [], t),
      signals: (t < 1 ? a : b).signals ?? null,
    };
  }
}
