// Geometry constants mirroring the backend IntersectionLayout, plus the meter->pixel mapping.
// World frame: meters, origin at the intersection center, +x East, +y North. Canvas y is
// flipped (screen y grows downward).

export const LAYOUT = {
  approachLength: 120,
  laneWidth: 3.5,
  half: 14, // half-width of the intersection box
  lanesPerSide: 3, // inbound (and outbound) lanes per approach
};

/** Extent of the world in meters, from one approach's far edge to the opposite one. */
export const WORLD_SPAN = 2 * (LAYOUT.approachLength + LAYOUT.half);

export interface View {
  scale: number; // pixels per meter
  cx: number; // screen x of world origin
  cy: number; // screen y of world origin
}

export function makeView(canvasW: number, canvasH: number, marginPx = 24): View {
  const usable = Math.min(canvasW, canvasH) - 2 * marginPx;
  const scale = Math.max(0.1, usable / WORLD_SPAN);
  return { scale, cx: canvasW / 2, cy: canvasH / 2 };
}

export function worldToScreen(x: number, y: number, view: View): [number, number] {
  return [view.cx + x * view.scale, view.cy - y * view.scale];
}

/** Total width of one road (both directions): 6 lanes. */
export function roadHalfWidthM(): number {
  return LAYOUT.lanesPerSide * LAYOUT.laneWidth;
}
