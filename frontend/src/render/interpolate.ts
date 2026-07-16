import type { PedestrianView, VehicleView } from '../types/snapshot';

/** Interpolate along the shortest angular path from a to b. */
export function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

/**
 * Blend the previous and latest snapshots for smooth motion at render frame rate, decoupled
 * from the 30 Hz network feed. Vehicles are matched by id; ones without a previous position
 * (just spawned) are shown at their latest position.
 */
export function interpolateVehicles(
  prev: VehicleView[] | null,
  latest: VehicleView[],
  alpha: number,
): VehicleView[] {
  if (!prev || prev.length === 0) {
    return latest;
  }
  const a = Math.max(0, Math.min(1, alpha));
  const byId = new Map<number, VehicleView>();
  for (const p of prev) byId.set(p.id, p);
  return latest.map((v) => {
    const p = byId.get(v.id);
    if (!p) return v;
    return {
      ...v,
      x: p.x + (v.x - p.x) * a,
      y: p.y + (v.y - p.y) * a,
      rx: p.rx + (v.rx - p.rx) * a,
      ry: p.ry + (v.ry - p.ry) * a,
      h: lerpAngle(p.h, v.h, a),
    };
  });
}

/**
 * Same blend for the walkers, matched by id. Positions lerp; the facing direction snaps to the
 * latest snapshot (a walker's heading only changes at corners, so there is nothing to smooth).
 */
export function interpolatePedestrians(
  prev: PedestrianView[] | null,
  latest: PedestrianView[],
  alpha: number,
): PedestrianView[] {
  if (!prev || prev.length === 0) {
    return latest;
  }
  const a = Math.max(0, Math.min(1, alpha));
  const byId = new Map<number, PedestrianView>();
  for (const p of prev) byId.set(p.id, p);
  return latest.map((w) => {
    const p = byId.get(w.id);
    if (!p) return w;
    return {
      ...w,
      x: p.x + (w.x - p.x) * a,
      y: p.y + (w.y - p.y) * a,
    };
  });
}
