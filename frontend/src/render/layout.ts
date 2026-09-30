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
 * Focused viewport span in meters. We zoom in tight on the intersection rather than fitting the
 * whole 268 m world: the crossing, its signals, crosswalks and the head of each queue fill the
 * screen, and the city blocks are just a backdrop around the edges. Vehicles outside this window
 * are simply clipped and roll into view as they approach.
 */
export const VIEW_SPAN = 110;

export interface View {
  scale: number; // pixels per meter
  cx: number; // screen x of world origin
  cy: number; // screen y of world origin
}

/**
 * Figma-style camera over the world: `zoom` multiplies the fitted VIEW_SPAN scale (1 = the
 * focused default), `x`/`y` is the world point (meters) shown at the canvas centre.
 */
export interface Camera {
  zoom: number;
  x: number;
  y: number;
}

/** Opening zoom: a touch tighter than the fitted span so vehicles read large. */
export const DEFAULT_ZOOM = 1.15;
export const MIN_ZOOM = 0.3;
/** Zoom that shows the whole artboard with its frame label clear of the top bar. */
export const FIT_ZOOM = 0.35;
export const MAX_ZOOM = 5;

export function makeView(canvasW: number, canvasH: number, marginPx = 0, cam?: Camera): View {
  const usable = Math.min(canvasW, canvasH) - 2 * marginPx;
  const scale = Math.max(0.1, usable / VIEW_SPAN) * (cam?.zoom ?? 1);
  return { scale, cx: canvasW / 2 - (cam?.x ?? 0) * scale, cy: canvasH / 2 + (cam?.y ?? 0) * scale };
}

export function screenToWorld(sx: number, sy: number, view: View): [number, number] {
  return [(sx - view.cx) / view.scale, (view.cy - sy) / view.scale];
}

/** Keep the camera centre on the map so the city can never be dragged fully off screen. */
export function clampCamera(cam: Camera): Camera {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cam.zoom));
  const lim = WORLD_SPAN / 2;
  return { zoom, x: Math.min(lim, Math.max(-lim, cam.x)), y: Math.min(lim, Math.max(-lim, cam.y)) };
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
