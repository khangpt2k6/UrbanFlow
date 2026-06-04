// Geometry constants mirroring the backend IntersectionLayout, plus the meter->pixel mapping.
// World frame: meters, origin at the intersection center, +x East, +y North. Canvas y is
// flipped (screen y grows downward).

export const LAYOUT = {
  approachLength: 120,
  laneWidth: 3.5,
  half: 14, // half-width of the intersection box
  lanesPerSide: 3, // inbound (and outbound) lanes per approach
};

/** Crosswalk band depth just outside the box (meters). Mirrors the backend rendering intent. */
export const CROSSWALK_DEPTH = 4.5;
/** Distance vehicles stop back from the box edge (mirrors backend IntersectionLayout.STOP_SETBACK). */
export const STOP_SETBACK = 6.5;

/** Full world extent in meters (far edge to far edge). */
export const WORLD_SPAN = 2 * (LAYOUT.approachLength + LAYOUT.half);

/**
 * Focused viewport span in meters. We zoom in on the action around the intersection rather
 * than fitting the whole 268 m world, so vehicles are large and legible. Vehicles outside this
 * window are simply clipped.
 */
export const VIEW_SPAN = 150;

export interface View {
  scale: number; // pixels per meter
  cx: number; // screen x of world origin
  cy: number; // screen y of world origin
}

export function makeView(canvasW: number, canvasH: number, marginPx = 0): View {
  const usable = Math.min(canvasW, canvasH) - 2 * marginPx;
  const scale = Math.max(0.1, usable / VIEW_SPAN);
  return { scale, cx: canvasW / 2, cy: canvasH / 2 };
}

export function worldToScreen(x: number, y: number, view: View): [number, number] {
  return [view.cx + x * view.scale, view.cy - y * view.scale];
}

/** Total width of one road (both directions): 6 lanes. */
export function roadHalfWidthM(): number {
  return LAYOUT.lanesPerSide * LAYOUT.laneWidth;
}

/**
 * Max fraction of a lane's width a drawn vehicle body may occupy across (RULE R4: a vehicle must
 * fit within one lane). The renderer clamps every body's cross-axis to LANE_FIT * laneWidth so no
 * vehicle ever spills across the lane lines, regardless of its real-world width.
 */
export const LANE_FIT = 0.92;
