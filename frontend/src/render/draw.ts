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
  drawPedestrians(ctx, view, signals, vehicles, nowMs);
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
// Ambient walkers stroll the footpaths; a few crossers wait at the kerb and only step onto a
// crosswalk while that road's vehicles are stopped (its through signal is red). Frontend-only -
// the backend safety model is untouched; these are decorative city life.
const PED_LAT = (ROAD_EDGE + SIDEWALK_OUT) / 2;            // footpath midline
const PED_NEAR = LAYOUT.half + CROSSWALK_DEPTH + 2.5;      // start of the footpath past the crossing
const PED_FAR = 76;
const CROSS_LAT = LAYOUT.half + CROSSWALK_DEPTH / 2;       // centre of a crosswalk band
const PED_COLORS = ['#e7563f', '#f0a431', '#3f7fd0', '#7d52c9', '#2f9e6b', '#d94f8e', '#3a414e', '#16a3a3'];

interface Stroller { ax: 'v' | 'h'; side: number; half: number; pos: number; dir: number; speed: number; color: string; }
interface Crosser { kind: 'NS' | 'EW'; sign: number; t: number; dir: number; speed: number; color: string; }

function buildPeds(): { strollers: Stroller[]; crossers: Crosser[] } {
  const rng = makeRng(9001);
  const strollers: Stroller[] = [];
  for (const ax of ['v', 'h'] as const)
    for (const side of [1, -1])
      for (const half of [1, -1])
        for (let i = 0; i < 3; i++)
          strollers.push({
            ax, side, half,
            pos: PED_NEAR + rng() * (PED_FAR - PED_NEAR),
            dir: rng() < 0.5 ? 1 : -1,
            speed: 3.5 + rng() * 2.5,
            color: PED_COLORS[Math.floor(rng() * PED_COLORS.length)],
          });
  const crossers: Crosser[] = [];
  for (const kind of ['NS', 'EW'] as const)
    for (const sign of [1, -1])
      for (let i = 0; i < 2; i++)
        crossers.push({
          kind, sign,
          t: -RH + (i + 0.5) * RH,
          dir: rng() < 0.5 ? 1 : -1,
          speed: 4.5 + rng() * 2,
          color: PED_COLORS[Math.floor(rng() * PED_COLORS.length)],
        });
  return { strollers, crossers };
}
const PEDS = buildPeds();
let lastPedMs = 0;

function drawPedestrians(ctx: CanvasRenderingContext2D, view: View, signals: SignalState | null, vehicles: VehicleView[], nowMs: number) {
  let dt = 0;
  if (lastPedMs) dt = Math.min(0.08, Math.max(0, (nowMs - lastPedMs) / 1000));
  lastPedMs = nowMs;

  // Strollers keep to the footpaths, well clear of the carriageway, so they are always safe.
  for (const p of PEDS.strollers) {
    p.pos += p.dir * p.speed * dt;
    if (p.pos > PED_FAR) { p.pos = PED_FAR; p.dir = -1; }
    if (p.pos < PED_NEAR) { p.pos = PED_NEAR; p.dir = 1; }
    const x = p.ax === 'v' ? p.side * PED_LAT : p.half * p.pos;
    const y = p.ax === 'v' ? p.half * p.pos : p.side * PED_LAT;
    drawPed(ctx, view, x, y, p.color, p.dir * (p.ax === 'v' ? 0 : 1), p.dir * (p.ax === 'v' ? 1 : 0));
  }

  // Crossers obey the walk rule AND look before they step. The simulated cars do not model
  // pedestrians, so the pedestrians do all the yielding: leave the kerb only on the walk phase
  // (the road being crossed is red) with the crossing clear, pause for any vehicle in the
  // crosswalk, and step back out of the way if one comes right at them. Nobody gets run over.
  const Z_ALONG = 4.0;       // half-depth of the crosswalk danger band (stripes + a little overhang)
  const Z_LAT = RH + 1.5;
  for (const c of PEDS.crossers) {
    const crossLat = c.sign * CROSS_LAT;
    let blocked = false;
    let imminentFrom = NaN; // crossing-axis position of a vehicle right on top of the pedestrian
    for (const v of vehicles) {
      const inBand = c.kind === 'NS'
        ? Math.abs(v.y - crossLat) < Z_ALONG && Math.abs(v.x) < Z_LAT
        : Math.abs(v.x - crossLat) < Z_ALONG && Math.abs(v.y) < Z_LAT;
      if (!inBand) continue;
      blocked = true;
      const along = c.kind === 'NS' ? v.x : v.y;
      if (Math.abs(along - c.t) < 3.2) { imminentFrom = along; break; }
    }
    const approach = c.kind === 'NS' ? (c.sign > 0 ? 'NORTH' : 'SOUTH') : (c.sign > 0 ? 'EAST' : 'WEST');
    const red = signals ? signals.through[approach] === 'RED' : false;
    const atKerb = c.t >= RH || c.t <= -RH;

    if (!Number.isNaN(imminentFrom)) {
      const away = imminentFrom >= c.t ? -1 : 1;      // step away from the car, toward the nearer kerb
      c.dir = away;
      c.t += away * c.speed * 1.5 * dt;
    } else if (atKerb) {
      if (red && !blocked) { c.dir = c.t > 0 ? -1 : 1; c.t += c.dir * c.speed * dt; } // step off
    } else if (!blocked) {
      c.t += c.dir * c.speed * dt;                                                     // clear: cross
    } // else blocked-but-not-imminent: wait in place for the car to pass

    c.t = Math.max(-RH, Math.min(RH, c.t));
    const x = c.kind === 'NS' ? c.t : crossLat;
    const y = c.kind === 'NS' ? crossLat : c.t;
    const dx = c.kind === 'NS' ? c.dir : 0;
    const dy = c.kind === 'NS' ? 0 : c.dir;
    drawPed(ctx, view, x, y, c.color, dx, dy);
  }
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
  // Sit each head at the corner where the white stop line meets the road's edge: hard against the
  // kerb (lat) and level with the stop line (along), then pushed outward by half its length so the
  // housing sits on the approach side of the line (not straddling the crosswalk), facing the
  // stopped driver. N/S heads run vertical, E/W heads horizontal, parallel to their road.
  const lat = rh + 1.4; // hard against the road edge / kerb
  const along = h + STOP_SETBACK; // the white stop line
  const heads: { ax: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST'; x: number; y: number; horizontal: boolean; ox: number; oy: number }[] = [
    { ax: 'NORTH', x: -lat, y: along, horizontal: false, ox: 0, oy: -1 },
    { ax: 'SOUTH', x: lat, y: -along, horizontal: false, ox: 0, oy: 1 },
    { ax: 'EAST', x: along, y: lat, horizontal: true, ox: 1, oy: 0 },
    { ax: 'WEST', x: -along, y: -lat, horizontal: true, ox: -1, oy: 0 },
  ];
  const R = Math.max(3, 0.64 * view.scale);
  const gap = R * 0.55;
  const pad = R * 0.7;
  const longSide = R * 8 + gap * 3 + pad * 2; // 3 circles + arrow
  const shortSide = R * 2 + pad * 2;
  for (const head of heads) {
    let [cx, cy] = worldToScreen(head.x, head.y, view);
    cx += head.ox * (longSide / 2); // push the housing onto the approach side of the stop line
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
