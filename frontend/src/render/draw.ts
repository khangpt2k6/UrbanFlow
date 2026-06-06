import type { SignalColor, SignalState, VehicleView } from '../types/snapshot';
import { CROSSWALK_DEPTH, LANE_FIT, LAYOUT, STOP_SETBACK, roadHalfWidthM, worldToScreen, type View } from './layout';
import { typeInfo } from './vehicleTypes';
import { drawVehicleArt } from './vehicleArt';

// Bright, cartoon palette.
const C = {
  bg: '#bfe3b0',
  bg2: '#aed79c',
  road: '#6b7280',
  box: '#787f8c',
  roadEdge: '#565d6b',
  center: '#ffd23f',
  divider: 'rgba(255,255,255,0.75)',
  stopLine: '#ffffff',
  crosswalk: '#ffffff',
  shadow: 'rgba(30,40,30,0.30)',
  stroke: 'rgba(28,32,40,0.6)',
  housing: '#23262e',
  housingEdge: '#0d0f14',
  sidewalk: '#cdd2da',
  sidewalkLine: 'rgba(120,128,140,0.5)',
  curb: '#9aa2af',
  bikeLane: '#2f8f63',
  bikeLaneEdge: 'rgba(255,255,255,0.8)',
  laneArrow: 'rgba(255,255,255,0.92)',
};

const ASPECT: Record<SignalColor, string> = { GREEN: '#28d17c', YELLOW: '#ffcf33', RED: '#ff5a52' };
const ASPECT_DIM: Record<SignalColor, string> = { GREEN: '#1c3a2a', YELLOW: '#3d3520', RED: '#3e2220' };

// Smallest drawn vehicle footprint (meters, scaled by the view). Bicycles/motorcycles are tiny
// in reality, so without a floor they shrink to a few pixels; this keeps every vehicle legible.
// Smallest on-screen footprint, raised so the tiny two-wheelers (bicycle 1.8 m, motorcycle 2.2 m)
// read as chunky little vehicles instead of near-invisible dots. Kept under a car so the order holds.
const MIN_VEHICLE_LEN_M = 4.4;
const MIN_VEHICLE_WID_M = 2.1;

// Render-only size nudges (do NOT touch the backend-synced length, see vehicleTypes R1). Cars read
// as small next to buses and trucks, so we draw them a little longer and chunkier. The width stays
// under the truck's 2.5 m and inside one lane, so size order and lane fit still hold; the length
// grows only a few percent, well inside the following gap, so bodies never overlap. Bicycles and
// motorcycles are not boosted here - the floor above already gives them a clearly visible body.
const DRAW_BOOST: Record<number, { l: number; w: number }> = {
  2: { l: 1.18, w: 1.3 }, // car
  3: { l: 1.12, w: 1.22 }, // SUV
};

export function drawScene(
  ctx: CanvasRenderingContext2D,
  view: View,
  canvasW: number,
  canvasH: number,
  vehicles: VehicleView[],
  signals: SignalState | null,
  nowMs: number,
  simTimeMs: number | null,
) {
  const g = ctx.createLinearGradient(0, 0, 0, canvasH);
  g.addColorStop(0, C.bg);
  g.addColorStop(1, C.bg2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvasW, canvasH);

  drawRoads(ctx, view);
  drawSidewalks(ctx, view);
  drawBuildings(ctx, view);
  drawGreenery(ctx, view);
  drawCrosswalks(ctx, view);
  drawLaneMarkings(ctx, view);
  drawStopLines(ctx, view);
  for (const v of vehicles) drawVehicle(ctx, view, v, nowMs);
  drawPedestrians(ctx, view, signals, vehicles, nowMs, simTimeMs);
  if (signals) drawSignals(ctx, view, signals);
  drawCompass(ctx, canvasW, canvasH);
}

// ----------------------------------------------------------------- compass
// Fixed screen-space compass rose in the bottom-left corner. The top edge holds the
// brand + status pill and the bottom-right holds the alert toasts, so the lower-left
// is the only HUD-free corner. World frame is +x East, +y North with a flipped screen
// y, so North=up, South=down, East=right, West=left.
// Labels use English cardinals: N (up), S (down), E (right), W (left).
function drawCompass(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number) {
  const r = Math.max(30, Math.min(canvasW, canvasH) * 0.055);
  const m = r + Math.max(14, r * 0.5); // keep the dial clear of the corner
  const cx = m;
  const cy = canvasH - m;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // drop shadow + dial face
  ctx.beginPath(); ctx.arc(cx + 2, cy + 4, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(30,40,30,0.22)'; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.06); ctx.strokeStyle = 'rgba(40,46,58,0.55)'; ctx.stroke();

  // tick marks around the ring
  ctx.strokeStyle = 'rgba(40,46,58,0.35)';
  ctx.lineWidth = Math.max(1, r * 0.03);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r0 = i % 2 === 0 ? r * 0.82 : r * 0.9;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * r * 0.97, cy + Math.sin(a) * r * 0.97);
    ctx.stroke();
  }

  // four-point star (North highlighted red), each point drawn pointing "up" then rotated
  const tip = r * 0.6;
  const w = r * 0.18;
  const dirs: [number, string, string][] = [
    [0, '#ff6a62', '#d63b34'],            // North  -> up
    [Math.PI / 2, '#e3e8ef', '#aab3c0'],  // East   -> right
    [Math.PI, '#e3e8ef', '#aab3c0'],      // South  -> down
    [-Math.PI / 2, '#e3e8ef', '#aab3c0'], // West   -> left
  ];
  for (const [rot, light, dark] of dirs) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    const sh = -tip * 0.3; // shoulder y
    // right half (light)
    ctx.beginPath();
    ctx.moveTo(0, -tip); ctx.lineTo(w, sh); ctx.lineTo(0, 0); ctx.closePath();
    ctx.fillStyle = light; ctx.fill();
    // left half (dark) for an engraved look
    ctx.beginPath();
    ctx.moveTo(0, -tip); ctx.lineTo(-w, sh); ctx.lineTo(0, 0); ctx.closePath();
    ctx.fillStyle = dark; ctx.fill();
    ctx.restore();
  }

  // center hub
  ctx.beginPath(); ctx.arc(cx, cy, Math.max(2, r * 0.08), 0, Math.PI * 2);
  ctx.fillStyle = '#3a4150'; ctx.fill();

  // cardinal labels
  const lr = r * 0.82;
  ctx.font = `800 ${Math.round(r * 0.34)}px 'Baloo 2', system-ui, sans-serif`;
  const labels: [string, number, number, string][] = [
    ['N', cx, cy - lr, '#d63b34'],
    ['S', cx, cy + lr, '#3a4150'],
    ['E', cx + lr, cy, '#3a4150'],
    ['W', cx - lr, cy, '#3a4150'],
  ];
  for (const [t, x, y, col] of labels) {
    ctx.fillStyle = col;
    ctx.fillText(t, x, y);
  }
  ctx.restore();
}

// ----------------------------------------------------------------- city layout
// Geometry shared by the roads, footpaths and building blocks.
const RH = roadHalfWidthM();                   // road half-width (one carriageway)
const ROAD_EDGE = RH + 0.8;                     // outer kerb of the carriageway
const SIDEWALK_W = 6.2;                          // footpath width along each road
const SIDEWALK_OUT = ROAD_EDGE + SIDEWALK_W;     // outer edge of the footpath
const BIKE_W = 1.9;                              // protected cycle track (road side of the path)
const BLOCK_IN = SIDEWALK_OUT + 2.4;             // where the city blocks begin
const FAR = LAYOUT.approachLength + LAYOUT.half;

// A tiny seeded PRNG so the skyline is generated ONCE and is identical every frame (no flicker).
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Building { x: number; y: number; w: number; h: number; color: string; floors: number; roof: number; }
interface Greens { x: number; y: number; s: number; }

// Pack dense building rows into the four corner blocks and line each footpath with street trees.
// Deterministic (seeded), so the city is stable frame to frame.
function buildCity(): { buildings: Building[]; greens: Greens[] } {
  const rng = makeRng(1337);
  const buildings: Building[] = [];
  const greens: Greens[] = [];
  const palette = ['#7d97c4', '#c98a5a', '#e0a93b', '#8f9db4', '#cf7b63', '#9aa7b8', '#b58a84', '#6f93c9', '#d9a441', '#7fa3a0'];
  const cell = 22;
  const end = 130;
  for (const qx of [1, -1]) {
    for (const qy of [1, -1]) {
      for (let ox = BLOCK_IN; ox < end; ox += cell) {
        for (let oy = BLOCK_IN; oy < end; oy += cell) {
          const gap = 3.4 + rng() * 2.4;
          const w = cell - gap - rng() * 2.5;
          const h = cell - gap - rng() * 2.5;
          const cx = qx * (ox + (cell - gap) / 2);
          const cy = qy * (oy + (cell - gap) / 2);
          if (rng() < 0.1) {                     // occasional green pocket between towers
            greens.push({ x: cx, y: cy, s: 1.0 + rng() * 0.5 });
            continue;
          }
          buildings.push({
            x: cx, y: cy, w, h,
            color: palette[Math.floor(rng() * palette.length)],
            floors: 3 + Math.floor(rng() * 6),
            roof: Math.floor(rng() * 3),
          });
        }
      }
      // street trees just outside the footpath, down each road face of the block
      for (let d = 30; d < 78; d += 11) {
        greens.push({ x: qx * (SIDEWALK_OUT + 1.1), y: qy * d, s: 0.62 + rng() * 0.16 });
        greens.push({ x: qx * d, y: qy * (SIDEWALK_OUT + 1.1), s: 0.62 + rng() * 0.16 });
      }
    }
  }
  return { buildings, greens };
}
const CITY = buildCity();

// ----------------------------------------------------------------- footpaths + cycle tracks
function drawSidewalks(ctx: CanvasRenderingContext2D, view: View) {
  const a = ROAD_EDGE, b = SIDEWALK_OUT;
  // concrete footpath: an L of two strips hugging each corner, which together frame the roads
  ctx.fillStyle = C.sidewalk;
  for (const qx of [1, -1]) {
    for (const qy of [1, -1]) {
      const xIn = qx > 0 ? a : -b, xOut = qx > 0 ? b : -a;
      const yIn = qy > 0 ? a : -b, yOut = qy > 0 ? b : -a;
      fillWorldRect(ctx, view, xIn, qy > 0 ? a : -FAR, xOut, qy > 0 ? FAR : -a);
      fillWorldRect(ctx, view, qx > 0 ? a : -FAR, yIn, qx > 0 ? FAR : -a, yOut);
    }
  }
  // protected green cycle track on the road side of every footpath
  ctx.fillStyle = C.bikeLane;
  for (const s of [1, -1]) {
    fillWorldRect(ctx, view, s > 0 ? a : -a - BIKE_W, a, s > 0 ? a + BIKE_W : -a, FAR);
    fillWorldRect(ctx, view, s > 0 ? a : -a - BIKE_W, -FAR, s > 0 ? a + BIKE_W : -a, -a);
    fillWorldRect(ctx, view, a, s > 0 ? a : -a - BIKE_W, FAR, s > 0 ? a + BIKE_W : -a);
    fillWorldRect(ctx, view, -FAR, s > 0 ? a : -a - BIKE_W, -a, s > 0 ? a + BIKE_W : -a);
  }
  // kerb line at the carriageway, dashed line at the cycle track edge, seam at the footpath edge
  ctx.strokeStyle = C.curb; ctx.lineWidth = Math.max(1.5, 0.22 * view.scale);
  strokeRing(ctx, view, a);
  ctx.strokeStyle = C.bikeLaneEdge; ctx.lineWidth = Math.max(1, 0.12 * view.scale);
  ctx.setLineDash([1.4 * view.scale, 1.2 * view.scale]);
  strokeRing(ctx, view, a + BIKE_W);
  ctx.setLineDash([]);
  drawBikeGlyphs(ctx, view, a + BIKE_W / 2);
  ctx.strokeStyle = C.sidewalkLine; ctx.lineWidth = Math.max(1, 0.1 * view.scale);
  strokeRing(ctx, view, b);
}

// Stroke a square "ring" at world distance d on all four road faces, running along the approaches
// and skipping across the box, so it traces the kerbs without crossing the intersection.
function strokeRing(ctx: CanvasRenderingContext2D, view: View, d: number) {
  for (const s of [1, -1]) {
    line(ctx, view, s * d, d, s * d, FAR);
    line(ctx, view, s * d, -FAR, s * d, -d);
    line(ctx, view, d, s * d, FAR, s * d);
    line(ctx, view, -FAR, s * d, -d, s * d);
  }
}

function drawBikeGlyphs(ctx: CanvasRenderingContext2D, view: View, lat: number) {
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  for (let d = 26; d < 80; d += 16) {
    bikeGlyph(ctx, view, lat, d, true); bikeGlyph(ctx, view, -lat, d, true);
    bikeGlyph(ctx, view, lat, -d, true); bikeGlyph(ctx, view, -lat, -d, true);
    bikeGlyph(ctx, view, d, lat, false); bikeGlyph(ctx, view, -d, lat, false);
    bikeGlyph(ctx, view, d, -lat, false); bikeGlyph(ctx, view, -d, -lat, false);
  }
}

// A simple two-wheel bicycle pictogram, oriented along the lane.
function bikeGlyph(ctx: CanvasRenderingContext2D, view: View, x: number, y: number, vertical: boolean) {
  const [sx, sy] = worldToScreen(x, y, view);
  const r = Math.max(2, 0.42 * view.scale);
  ctx.lineWidth = Math.max(1, r * 0.34);
  const wheel = (ox: number, oy: number) => { ctx.beginPath(); ctx.arc(sx + ox, sy + oy, r, 0, Math.PI * 2); ctx.stroke(); };
  if (vertical) { wheel(0, -r * 1.7); wheel(0, r * 1.7); } else { wheel(-r * 1.7, 0); wheel(r * 1.7, 0); }
}

// ----------------------------------------------------------------- buildings + greenery
function drawBuildings(ctx: CanvasRenderingContext2D, view: View) {
  for (const b of CITY.buildings) drawBuilding(ctx, view, b);
}

function drawGreenery(ctx: CanvasRenderingContext2D, view: View) {
  for (const g of CITY.greens) drawTree(ctx, view, g.x, g.y, g.s);
}

// ----------------------------------------------------------------- pedestrians
// Real origin->destination walkers. Each one appears at a building door (or strolls in from a map
// edge), follows the footpaths, crosses roads ONLY at crosswalks - and only on the walk phase with
// the crossing clear, yielding to any car - then arrives at a destination building or map edge and
// DESPAWNS. A spawn timer keeps a steady population; nobody loops back and forth forever. The
// simulated cars don't model pedestrians, so the walkers do ALL the yielding and are never run
// over. Frontend-only. The static city never re-randomises: the graph is pure geometry from the
// frozen CITY, and the only PRNG (makeRng(9001)) advances solely at spawn time, never per frame.
const PED_LAT = (ROAD_EDGE + SIDEWALK_OUT) / 2;            // footpath midline
const CROSS_LAT = LAYOUT.half + CROSSWALK_DEPTH / 2;       // centre of a crosswalk band
// Where a pedestrian waiting to cross holds: the road-side edge of the concrete footpath, just past
// the protected cycle track. Gating here (instead of at the carriageway edge RH) keeps the whole
// drawn body off the road - a waiting walker stands ON the kerb, not straddling the asphalt.
const PED_KERB = ROAD_EDGE + BIKE_W + 0.4;
const PED_COLORS = ['#e7563f', '#f0a431', '#3f7fd0', '#7d52c9', '#2f9e6b', '#d94f8e', '#3a414e', '#16a3a3'];

const FAR_WALK = 78;            // strip exits just past the visible window
const TARGET_POP = 22;
const SPAWN_EVERY_MS = 900;
const MAX_AGE_MS = 90_000;      // hard anti-stuck cap
const GIVE_UP_MS = 22_000;      // give up waiting at a kerb -> walk to an edge instead
const PZ_ALONG = 4.0;           // crosswalk danger-band half-depth (stripes + a little overhang)
const PZ_LAT = RH + 1.5;        // crosswalk danger-band half-width
const PIMM = 3.2;               // "a car is right on top of me" distance
// Pedestrians stroll the footpaths but HURRY across the carriageway, so a crossing started on the
// walk phase clears the road well before the light turns green again. Applied only to crossing legs.
const CROSS_SPEEDUP = 1.7;

type CrossMeta = { kind: 'NS' | 'EW'; sign: number };
interface Loc { x: number; y: number; corner: number }
interface RoutePt { x: number; y: number; cross?: CrossMeta }
interface Walker {
  pts: RoutePt[]; i: number; u: number;
  speed: number; color: string; laneOff: number; bob: number;
  state: 'WALK' | 'WAIT' | 'CROSS' | 'DONE'; waitMs: number; ageMs: number;
  wx: number; wy: number; fx: number; fy: number;
}

// 4 corner pivots where a block's two footpaths meet (indices 0=NE 1=NW 2=SW 3=SE).
const CORNER = [
  { x: PED_LAT, y: PED_LAT }, { x: -PED_LAT, y: PED_LAT }, { x: -PED_LAT, y: -PED_LAT }, { x: PED_LAT, y: -PED_LAT },
];
// the crosswalk joining each adjacent corner pair: its two kerb "feet" + the carriageway it crosses
const CW: Record<string, { meta: CrossMeta; feet: Record<number, { x: number; y: number }> }> = {
  '0,1': { meta: { kind: 'NS', sign: 1 }, feet: { 0: { x: PED_LAT, y: CROSS_LAT }, 1: { x: -PED_LAT, y: CROSS_LAT } } },
  '1,2': { meta: { kind: 'EW', sign: -1 }, feet: { 1: { x: -CROSS_LAT, y: PED_LAT }, 2: { x: -CROSS_LAT, y: -PED_LAT } } },
  '2,3': { meta: { kind: 'NS', sign: -1 }, feet: { 2: { x: -PED_LAT, y: -CROSS_LAT }, 3: { x: PED_LAT, y: -CROSS_LAT } } },
  '0,3': { meta: { kind: 'EW', sign: 1 }, feet: { 3: { x: CROSS_LAT, y: -PED_LAT }, 0: { x: CROSS_LAT, y: PED_LAT } } },
};

function clampN(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function quadCorner(sx: number, sy: number) { return sx > 0 ? (sy > 0 ? 0 : 3) : (sy > 0 ? 1 : 2); }

// A door is a point on the nearer footpath strip in front of a (front-row) building.
function buildDoors(): Loc[] {
  const out: Loc[] = [];
  for (const b of CITY.buildings) {
    if (Math.min(b.w, b.h) < 8) continue;
    const sx = b.x >= 0 ? 1 : -1, sy = b.y >= 0 ? 1 : -1;
    const gapV = Math.abs(b.x) - b.w / 2 - PED_LAT;
    const gapH = Math.abs(b.y) - b.h / 2 - PED_LAT;
    const corner = quadCorner(sx, sy);
    if (gapV <= gapH) out.push({ x: sx * PED_LAT, y: sy * clampN(Math.abs(b.y), PED_LAT + 1, FAR_WALK), corner });
    else out.push({ x: sx * clampN(Math.abs(b.x), PED_LAT + 1, FAR_WALK), y: sy * PED_LAT, corner });
  }
  return out;
}
const DOORS = buildDoors();
const EXITS: Loc[] = [
  { x: PED_LAT, y: FAR_WALK, corner: 0 }, { x: FAR_WALK, y: PED_LAT, corner: 0 },
  { x: -PED_LAT, y: FAR_WALK, corner: 1 }, { x: -FAR_WALK, y: PED_LAT, corner: 1 },
  { x: -PED_LAT, y: -FAR_WALK, corner: 2 }, { x: -FAR_WALK, y: -PED_LAT, corner: 2 },
  { x: PED_LAT, y: -FAR_WALK, corner: 3 }, { x: FAR_WALK, y: -PED_LAT, corner: 3 },
];

// Shortest walk around the corner ring 0-1-2-3-0 (adjacent corners are joined by one crosswalk).
function ringPath(ci: number, cd: number): number[] {
  const fwd = (cd - ci + 4) % 4;
  const seq = [ci]; let c = ci;
  if (fwd <= 2) for (let s = 0; s < fwd; s++) { c = (c + 1) % 4; seq.push(c); }
  else for (let s = 0; s < 4 - fwd; s++) { c = (c + 3) % 4; seq.push(c); }
  return seq;
}
function pushPt(pts: RoutePt[], x: number, y: number) {
  const last = pts[pts.length - 1];
  if (last && !last.cross && Math.abs(last.x - x) < 0.02 && Math.abs(last.y - y) < 0.02) return;
  pts.push({ x, y });
}
// Build a finite waypoint route: origin -> its corner -> (cross at sanctioned crosswalks) -> dest.
function buildRoute(o: Loc, d: Loc): RoutePt[] {
  const pts: RoutePt[] = [];
  pushPt(pts, o.x, o.y);
  pushPt(pts, CORNER[o.corner].x, CORNER[o.corner].y);
  if (o.corner !== d.corner) {
    const seq = ringPath(o.corner, d.corner);
    for (let k = 0; k < seq.length - 1; k++) {
      const ci = seq[k], cj = seq[k + 1];
      const cw = CW[[ci, cj].sort((a, b) => a - b).join(',')];
      pushPt(pts, cw.feet[ci].x, cw.feet[ci].y);
      pts[pts.length - 1].cross = cw.meta;            // this segment IS the carriageway crossing
      pushPt(pts, cw.feet[cj].x, cw.feet[cj].y);
      pushPt(pts, CORNER[cj].x, CORNER[cj].y);
    }
  }
  pushPt(pts, d.x, d.y);
  return pts;
}

let walkers: Walker[] = [];
let spawnAccMs = 0;
let lastVehHash = -1;
let lastVehChangeMs = 0;
let lastPedMs = 0;
let lastSnapMs = -1;            // last world sim clock seen; a drop means the world was reset
const pedRng = makeRng(9001);

function pickLoc(doorBias: number): Loc {
  if (DOORS.length && pedRng() < doorBias) return DOORS[Math.floor(pedRng() * DOORS.length)];
  return EXITS[Math.floor(pedRng() * EXITS.length)];
}
function spawnWalker(warm: boolean): Walker {
  const o = pickLoc(0.8);
  let d = pickLoc(0.65);
  for (let t = 0; t < 4 && Math.hypot(d.x - o.x, d.y - o.y) < 22; t++) d = pickLoc(0.65);
  const w: Walker = {
    pts: buildRoute(o, d), i: 0, u: 0,
    speed: 3.7 + pedRng() * 1.7,
    color: PED_COLORS[Math.floor(pedRng() * PED_COLORS.length)],
    laneOff: (pedRng() - 0.5) * 3,
    bob: pedRng() * Math.PI * 2,
    state: 'WALK', waitMs: 0, ageMs: 0, wx: o.x, wy: o.y, fx: 1, fy: 0,
  };
  if (warm) {
    // start on a random footpath leg (never mid-carriageway) so the no-overlap invariant holds at t=0
    const foot: number[] = [];
    for (let k = 0; k < w.pts.length - 1; k++) if (!w.pts[k].cross) foot.push(k);
    if (foot.length) { w.i = foot[Math.floor(pedRng() * foot.length)]; w.u = pedRng() * 0.9; }
  }
  finalizePos(w);
  return w;
}
for (let k = 0; k < TARGET_POP; k++) walkers.push(spawnWalker(true));

function finalizePos(w: Walker) {
  if (w.i >= w.pts.length - 1) { const e = w.pts[w.pts.length - 1]; w.wx = e.x; w.wy = e.y; return; }
  const A = w.pts[w.i], B = w.pts[w.i + 1];
  const u = w.u < 0 ? 0 : w.u > 1 ? 1 : w.u;
  let dx = B.x - A.x, dy = B.y - A.y; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
  // laneOff fans walkers out perpendicular to travel so they don't stack on a strip / crosswalk.
  // It is a draw-only offset: the yield band test below uses the on-axis position, never this.
  w.wx = A.x + (B.x - A.x) * u - dy * w.laneOff;
  w.wy = A.y + (B.y - A.y) * u + dx * w.laneOff;
  w.fx = dx; w.fy = dy;
}

function nearestCorner(x: number, y: number) { return quadCorner(x >= 0 ? 1 : -1, y >= 0 ? 1 : -1); }
function rerouteToEdge(w: Walker) {
  const c = nearestCorner(w.wx, w.wy);
  const exit = EXITS.find((e) => e.corner === c) ?? EXITS[0];
  w.pts = [{ x: w.wx, y: w.wy }, { x: CORNER[c].x, y: CORNER[c].y }, { x: exit.x, y: exit.y }];
  w.i = 0; w.u = 0; w.state = 'WALK'; w.waitMs = 0; finalizePos(w);
}

function updateWalker(w: Walker, dt: number, dtMs: number, signals: SignalState | null, vehicles: VehicleView[]) {
  w.ageMs += dtMs;
  if (w.ageMs > MAX_AGE_MS || w.i >= w.pts.length - 1) { w.state = 'DONE'; return; }
  const A = w.pts[w.i], B = w.pts[w.i + 1];
  const cross = A.cross;
  const legLen = Math.max(0.001, Math.hypot(B.x - A.x, B.y - A.y));
  const step = (w.speed * (cross ? CROSS_SPEEDUP : 1) * dt) / legLen;
  if (!cross) {
    w.state = 'WALK'; w.u += step; w.waitMs = 0;                  // footpath leg: always safe
  } else {
    const cu = w.u < 0 ? 0 : w.u > 1 ? 1 : w.u;
    const t = cross.kind === 'NS' ? A.x + (B.x - A.x) * cu : A.y + (B.y - A.y) * cu;
    const tB = cross.kind === 'NS' ? B.x : B.y;
    const crossLat = cross.sign * CROSS_LAT;
    const dirT = Math.sign(tB - t) || 1;
    const ap = cross.kind === 'NS' ? (cross.sign > 0 ? 'NORTH' : 'SOUTH') : (cross.sign > 0 ? 'EAST' : 'WEST');
    const red = signals ? signals.through[ap] === 'RED' : false;
    let blocked = false, imm = NaN;
    for (const v of vehicles) {
      const inB = cross.kind === 'NS'
        ? Math.abs(v.y - crossLat) < PZ_ALONG && Math.abs(v.x) < PZ_LAT
        : Math.abs(v.x - crossLat) < PZ_ALONG && Math.abs(v.y) < PZ_LAT;
      if (!inB) continue;
      blocked = true;
      const al = cross.kind === 'NS' ? v.x : v.y;
      if (Math.abs(al - t) < PIMM) { imm = al; break; }
    }
    if (Math.abs(t) >= PED_KERB) {
      // still behind the kerb; gate BEFORE the next step would carry the body off the footpath
      if (Math.abs(t + dirT * w.speed * dt) < PED_KERB) {
        if (red && !blocked) { w.u += step; w.state = 'CROSS'; w.waitMs = 0; }
        else { w.state = 'WAIT'; w.waitMs += dtMs; if (w.waitMs > GIVE_UP_MS) { rerouteToEdge(w); return; } }
      } else { w.state = 'WALK'; w.u += step; }
    } else if (!Number.isNaN(imm)) {
      const carTowardB = Math.sign(imm - t) === dirT;
      w.u += (carTowardB ? -1 : 1) * step * 1.6; w.state = 'CROSS';   // step away from the car
    } else if (!blocked) {
      w.u += step; w.state = 'CROSS';                                 // clear: keep crossing
    } // else committed but a car is ahead in the crossing: hold this frame
  }
  if (w.u < 0) w.u = 0;
  if (w.u >= 1) { w.u -= 1; w.i++; if (w.i >= w.pts.length - 1) w.state = 'DONE'; }
  finalizePos(w);
}

function drawPedestrians(ctx: CanvasRenderingContext2D, view: View, signals: SignalState | null, vehicles: VehicleView[], nowMs: number, simTimeMs: number | null) {
  // World reset: the engine zeroes its sim clock, so a backward jump means Reset was pressed.
  // Clear the walkers and respawn a fresh population so the pedestrians reset along with the cars.
  if (simTimeMs != null) {
    if (simTimeMs + 250 < lastSnapMs) {
      walkers = [];
      spawnAccMs = 0;
      for (let k = 0; k < TARGET_POP; k++) walkers.push(spawnWalker(true));
    }
    lastSnapMs = simTimeMs;
  }
  let dt = 0;
  if (lastPedMs) dt = Math.min(0.08, Math.max(0, (nowMs - lastPedMs) / 1000));
  lastPedMs = nowMs;
  let dtMs = dt * 1000;
  // pause detection: if the cars haven't moved for ~250 ms, freeze the walkers too
  let hash = 0;
  for (const v of vehicles) hash += v.x * 0.7 + v.y * 1.3;
  if (vehicles.length === 0 || Math.abs(hash - lastVehHash) > 0.05) { lastVehHash = hash; lastVehChangeMs = nowMs; }
  if (vehicles.length > 0 && nowMs - lastVehChangeMs > 250) { dt = 0; dtMs = 0; }

  if (dt > 0) {
    spawnAccMs += dtMs;
    while (walkers.length < TARGET_POP && spawnAccMs >= SPAWN_EVERY_MS) { spawnAccMs -= SPAWN_EVERY_MS; walkers.push(spawnWalker(false)); }
    for (const w of walkers) updateWalker(w, dt, dtMs, signals, vehicles);
    walkers = walkers.filter((w) => w.state !== 'DONE');
  }
  // Draw each walker at its position, facing its travel direction. Straight legs, no weaving: a
  // footpath leg or a crosswalk is a straight line and turns only ever happen at a corner.
  for (const w of walkers) drawPed(ctx, view, w.wx, w.wy, w.color, w.fx, w.fy);
}

function drawPed(ctx: CanvasRenderingContext2D, view: View, x: number, y: number, color: string, dx = 0, dy = 0) {
  const [sx, sy] = worldToScreen(x, y, view);
  // Bigger than life so walkers read clearly from above, but still well under a car's footprint.
  const r = Math.max(3, 0.82 * view.scale);
  // soft shadow
  ctx.fillStyle = 'rgba(20,28,28,0.22)';
  ctx.beginPath(); ctx.ellipse(sx + 1, sy + r * 0.7, r * 1.0, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  // face the walking direction (world +y is up, screen y is flipped)
  const ang = (dx || dy) ? Math.atan2(-dy, dx) : 0;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(ang);
  // shoulders: a torso wider across the walk direction than along it
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.72, r * 0.95, 0, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = Math.max(0.6, r * 0.12); ctx.strokeStyle = shade(color, -0.3); ctx.stroke();
  // head, nudged toward the front
  ctx.fillStyle = '#eab38a';
  ctx.beginPath(); ctx.arc(r * 0.28, 0, r * 0.55, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// A flat-roofed tower seen from above. A darker copy of the footprint, pushed toward the light,
// fakes the walls so taller buildings (more floors) read as taller; a soft shadow grounds it.
function drawBuilding(ctx: CanvasRenderingContext2D, view: View, b: Building) {
  const [cx, cy] = worldToScreen(b.x, b.y, view);
  const wp = b.w * view.scale, hp = b.h * view.scale;
  const r = Math.min(5, wp * 0.14, hp * 0.14);
  const lift = (1.6 + b.floors * 1.05) * Math.max(0.6, view.scale / 6.3);
  // ground shadow (down-right)
  ctx.fillStyle = 'rgba(16,24,36,0.20)';
  roundRect(ctx, cx - wp / 2 + lift * 0.5 + 2, cy - hp / 2 + lift * 0.72 + 3, wp, hp, r); ctx.fill();
  // extruded walls
  ctx.fillStyle = shade(b.color, -0.36);
  roundRect(ctx, cx - wp / 2 + lift * 0.5, cy - hp / 2 + lift * 0.72, wp, hp, r); ctx.fill();
  // roof
  roundRect(ctx, cx - wp / 2, cy - hp / 2, wp, hp, r);
  ctx.fillStyle = b.color; ctx.fill();
  ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(18,26,38,0.5)'; ctx.stroke();
  // parapet rim
  ctx.lineWidth = 1; ctx.strokeStyle = shade(b.color, 0.2);
  roundRect(ctx, cx - wp / 2 + 2.5, cy - hp / 2 + 2.5, wp - 5, hp - 5, Math.max(1, r - 1)); ctx.stroke();
  drawRoofDetail(ctx, cx, cy, wp, hp, b);
}

function drawRoofDetail(ctx: CanvasRenderingContext2D, cx: number, cy: number, wp: number, hp: number, b: Building) {
  ctx.save();
  ctx.translate(cx, cy);
  const dk = shade(b.color, -0.3), lt = shade(b.color, 0.24);
  if (b.roof === 0) {
    ctx.fillStyle = dk;
    roundRect(ctx, -wp * 0.24, -hp * 0.2, wp * 0.22, hp * 0.2, 1.5); ctx.fill();
    roundRect(ctx, wp * 0.04, hp * 0.02, wp * 0.2, hp * 0.18, 1.5); ctx.fill();
  } else if (b.roof === 1) {
    ctx.fillStyle = dk;
    ctx.beginPath(); ctx.arc(-wp * 0.1, -hp * 0.05, Math.min(wp, hp) * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = lt;
    roundRect(ctx, wp * 0.1, hp * 0.08, wp * 0.18, hp * 0.16, 1.5); ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(196,224,242,0.55)';
    roundRect(ctx, -wp * 0.26, -hp * 0.26, wp * 0.52, hp * 0.52, 2); ctx.fill();
    ctx.strokeStyle = dk; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -hp * 0.26); ctx.lineTo(0, hp * 0.26);
    ctx.moveTo(-wp * 0.26, 0); ctx.lineTo(wp * 0.26, 0); ctx.stroke();
  }
  ctx.restore();
}

function drawTree(ctx: CanvasRenderingContext2D, view: View, x: number, y: number, scale = 1) {
  const [sx, sy] = worldToScreen(x, y, view);
  const r = Math.max(4, 3.2 * view.scale * scale);
  // shadow
  ctx.fillStyle = 'rgba(30,40,30,0.16)';
  ctx.beginPath(); ctx.ellipse(sx + 3, sy + r * 0.7, r * 1.05, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  // trunk
  ctx.fillStyle = '#8d6e63';
  roundRect(ctx, sx - r * 0.16, sy, r * 0.32, r * 0.9, 1); ctx.fill();
  // canopy (two blobs)
  ctx.fillStyle = '#4fb15a';
  ctx.beginPath(); ctx.arc(sx - r * 0.4, sy - r * 0.2, r * 0.8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#62c46c';
  ctx.beginPath(); ctx.arc(sx + r * 0.25, sy - r * 0.4, r * 0.85, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(28,60,30,0.35)'; ctx.lineWidth = 1; ctx.stroke();
}

// ----------------------------------------------------------------- roads
function drawRoads(ctx: CanvasRenderingContext2D, view: View) {
  const rh = roadHalfWidthM();
  const far = LAYOUT.approachLength + LAYOUT.half;
  ctx.fillStyle = C.roadEdge;
  fillWorldRect(ctx, view, -rh - 0.8, -far, rh + 0.8, far);
  fillWorldRect(ctx, view, -far, -rh - 0.8, far, rh + 0.8);
  ctx.fillStyle = C.road;
  fillWorldRect(ctx, view, -rh, -far, rh, far);
  fillWorldRect(ctx, view, -far, -rh, far, rh);
  ctx.fillStyle = C.box;
  fillWorldRect(ctx, view, -rh, -rh, rh, rh);
}

function drawCrosswalks(ctx: CanvasRenderingContext2D, view: View) {
  const rh = roadHalfWidthM();
  const h = LAYOUT.half;
  const depth = CROSSWALK_DEPTH;
  const stripeW = 0.8;
  const pitch = 1.5;
  ctx.fillStyle = C.crosswalk;
  for (let x = -rh + 0.5; x < rh - 0.5; x += pitch) {
    fillWorldRect(ctx, view, x, h, x + stripeW, h + depth);
    fillWorldRect(ctx, view, x, -h - depth, x + stripeW, -h);
  }
  for (let y = -rh + 0.5; y < rh - 0.5; y += pitch) {
    fillWorldRect(ctx, view, h, y, h + depth, y + stripeW);
    fillWorldRect(ctx, view, -h - depth, y, -h, y + stripeW);
  }
}

function drawLaneMarkings(ctx: CanvasRenderingContext2D, view: View) {
  const far = LAYOUT.approachLength + LAYOUT.half;
  const h = LAYOUT.half;
  ctx.strokeStyle = C.center;
  ctx.lineWidth = Math.max(1.5, 0.3 * view.scale);
  line(ctx, view, 0, h, 0, far); line(ctx, view, 0, -h, 0, -far);
  line(ctx, view, h, 0, far, 0); line(ctx, view, -h, 0, -far, 0);
  ctx.strokeStyle = C.divider;
  ctx.lineWidth = Math.max(1, 0.16 * view.scale);
  ctx.setLineDash([1.6 * view.scale, 1.9 * view.scale]);
  for (let i = 1; i < LAYOUT.lanesPerSide; i++) {
    const o = i * LAYOUT.laneWidth;
    line(ctx, view, o, h, o, far); line(ctx, view, o, -h, o, -far);
    line(ctx, view, -o, h, -o, far); line(ctx, view, -o, -h, -o, -far);
    line(ctx, view, h, o, far, o); line(ctx, view, -h, o, -far, o);
    line(ctx, view, h, -o, far, -o); line(ctx, view, -h, -o, -far, -o);
  }
  ctx.setLineDash([]);
}

function drawStopLines(ctx: CanvasRenderingContext2D, view: View) {
  const rh = roadHalfWidthM();
  const h = LAYOUT.half;
  const d = STOP_SETBACK; // behind the crosswalk
  ctx.strokeStyle = C.stopLine;
  ctx.lineWidth = Math.max(2, 0.6 * view.scale);
  line(ctx, view, -rh, h + d, 0, h + d);
  line(ctx, view, 0, -h - d, rh, -h - d);
  line(ctx, view, h + d, 0, h + d, rh);
  line(ctx, view, -h - d, -rh, -h - d, 0);
}

// ----------------------------------------------------------------- signals
function drawSignals(ctx: CanvasRenderingContext2D, view: View, signals: SignalState) {
  const h = LAYOUT.half;
  const rh = roadHalfWidthM();
  // Put each head ON the carriageway, hard against the approaching driver's near-right kerb, a
  // couple of metres in front of the stop line (just past the crosswalk, facing the stopped cars).
  // The light BAR runs PARALLEL to the white stop-line stripe - so N/S heads are horizontal and
  // E/W heads vertical - and its near end hugs the kerb, the bar reaching a little onto the road.
  const edge = rh;                          // carriageway kerb
  const front = h + CROSSWALK_DEPTH + 1.0;  // just in front of the stop line, past the crosswalk
  const heads: { ax: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST'; x: number; y: number; horizontal: boolean; ox: number; oy: number }[] = [
    { ax: 'NORTH', x: -edge, y: front, horizontal: true, ox: 1, oy: 0 },
    { ax: 'SOUTH', x: edge, y: -front, horizontal: true, ox: -1, oy: 0 },
    { ax: 'EAST', x: front, y: edge, horizontal: false, ox: 0, oy: 1 },
    { ax: 'WEST', x: -front, y: -edge, horizontal: false, ox: 0, oy: -1 },
  ];
  const R = Math.max(3.8, 0.72 * view.scale);
  const gap = R * 0.55;
  const pad = R * 0.7;
  const longSide = R * 8 + gap * 3 + pad * 2; // 3 circles + arrow
  const shortSide = R * 2 + pad * 2;
  for (const head of heads) {
    let [cx, cy] = worldToScreen(head.x, head.y, view);
    cx += head.ox * (longSide / 2); // hug the kerb: the bar's near end sits on the road edge
    cy += head.oy * (longSide / 2);
    const through = signals.through[head.ax];
    const left = signals.left[head.ax];
    const w = head.horizontal ? longSide : shortSide;
    const hgt = head.horizontal ? shortSide : longSide;
    ctx.fillStyle = C.housing;
    ctx.strokeStyle = C.housingEdge;
    ctx.lineWidth = 1.5;
    roundRect(ctx, cx - w / 2, cy - hgt / 2, w, hgt, R * 0.7);
    ctx.fill(); ctx.stroke();

    // positions of the 4 bulbs along the long axis
    const start = head.horizontal ? cx - w / 2 + pad + R : cy - hgt / 2 + pad + R;
    const step = 2 * R + gap;
    const pos = [start, start + step, start + 2 * step, start + 3 * step];
    const at = (p: number): [number, number] => head.horizontal ? [p, cy] : [cx, p];
    aspect(ctx, ...at(pos[0]), R, 'RED', through);
    aspect(ctx, ...at(pos[1]), R, 'YELLOW', through);
    aspect(ctx, ...at(pos[2]), R, 'GREEN', through);
    leftArrow(ctx, ...at(pos[3]), R, left, head.ax);
  }
}

function aspect(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, bulb: SignalColor, current: SignalColor) {
  const on = bulb === current;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = on ? ASPECT[bulb] : ASPECT_DIM[bulb];
  if (on) { ctx.shadowColor = ASPECT[bulb]; ctx.shadowBlur = 12; }
  ctx.fill();
  ctx.shadowBlur = 0;
}

function leftArrow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, left: SignalColor, ax: string) {
  const on = left !== 'RED';
  const color = on ? ASPECT[left] : ASPECT_DIM.GREEN;
  ctx.save();
  ctx.translate(x, y);
  // point the arrow toward the approach's left-turn direction (just a visual cue)
  const rot: Record<string, number> = { NORTH: 0, SOUTH: Math.PI, EAST: -Math.PI / 2, WEST: Math.PI / 2 };
  ctx.rotate(rot[ax] ?? 0);
  ctx.fillStyle = color;
  if (on) { ctx.shadowColor = color; ctx.shadowBlur = 12; }
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(r * 0.5, -r);
  ctx.lineTo(r * 0.5, -r * 0.4);
  ctx.lineTo(r, -r * 0.4);
  ctx.lineTo(r, r * 0.4);
  ctx.lineTo(r * 0.5, r * 0.4);
  ctx.lineTo(r * 0.5, r);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.shadowBlur = 0;
}

// ----------------------------------------------------------------- vehicles
function drawVehicle(ctx: CanvasRenderingContext2D, view: View, v: VehicleView, nowMs: number) {
  const info = typeInfo(v.t);
  const [fx, fy] = worldToScreen(v.x, v.y, view);
  const [rxs, rys] = worldToScreen(v.rx, v.ry, view);
  const dx = fx - rxs;
  const dy = fy - rys;
  const chord = Math.hypot(dx, dy);
  const ang = chord > 0.5 ? Math.atan2(dy, dx) : -v.h;
  const cx = (fx + rxs) / 2;
  const cy = (fy + rys) / 2;

  // Footprint in pixels: length fills the real front-to-rear slot (and bends through turns),
  // width is the true vehicle width clamped to one lane. The body is crisp canvas vector art.
  // A minimum on-screen footprint keeps the smallest vehicles (bicycle 1.8 m, motorcycle 2.2 m)
  // readable as little vehicles instead of near-invisible dots at this zoom.
  const boost = DRAW_BOOST[v.t] ?? { l: 1, w: 1 };
  const L = Math.max(chord, info.length * view.scale, MIN_VEHICLE_LEN_M * view.scale) * boost.l;
  const W = Math.max(
    Math.min(info.width * boost.w, LANE_FIT * LAYOUT.laneWidth) * view.scale,
    MIN_VEHICLE_WID_M * view.scale,
  );

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang); // nose follows travel direction
  // soft drop shadow
  ctx.save();
  ctx.translate(W * 0.12, W * 0.18);
  ctx.fillStyle = C.shadow;
  roundRect(ctx, -L / 2, -W / 2, L, W, Math.min(W * 0.4, L * 0.14));
  ctx.fill();
  ctx.restore();
  drawVehicleArt(ctx, v.t, L, W, info.color, nowMs);
  // Brake lights: the rear glows red as the vehicle slows or stops, so a queue reads as
  // deliberately braking rather than frozen. Driven by the real speed the backend sends.
  if (v.v < 2.4) {
    const glow = Math.min(1, (2.4 - v.v) / 2.0);
    const rx = -L / 2 + L * 0.03;
    const ry = W * 0.28;
    const rr = Math.max(0.9, W * 0.13);
    ctx.save();
    ctx.fillStyle = `rgba(255,48,36,${0.55 + 0.4 * glow})`;
    ctx.shadowColor = 'rgba(255,40,28,0.9)';
    ctx.shadowBlur = 7 * glow;
    ctx.beginPath(); ctx.arc(rx, -ry, rr, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

// ----------------------------------------------------------------- helpers
function shade(hex: string, amt: number): string {
  const m = hex.replace('#', '');
  const n = parseInt(m.length === 3 ? m.replace(/(.)/g, '$1$1') : m, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const k = amt < 0 ? 0 : 255; const f = Math.abs(amt);
  r = Math.round(r + (k - r) * f); g = Math.round(g + (k - g) * f); b = Math.round(b + (k - b) * f);
  return `rgb(${r},${g},${b})`;
}

function fillWorldRect(ctx: CanvasRenderingContext2D, view: View, x0: number, y0: number, x1: number, y1: number) {
  const [ax, ay] = worldToScreen(x0, y1, view);
  const [bx, by] = worldToScreen(x1, y0, view);
  ctx.fillRect(ax, ay, bx - ax, by - ay);
}

function line(ctx: CanvasRenderingContext2D, view: View, x0: number, y0: number, x1: number, y1: number) {
  const [ax, ay] = worldToScreen(x0, y0, view);
  const [bx, by] = worldToScreen(x1, y1, view);
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
