import type { VehicleView } from '../types/snapshot';

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
      h: lerpAngle(p.h, v.h, a),
    };
  });
}
