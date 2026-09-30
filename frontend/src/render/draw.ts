import type { PedestrianView, SignalColor, SignalState, VehicleView } from '../types/snapshot';
import { CROSSWALK_DEPTH, LANE_FIT, LAYOUT, STOP_SETBACK, WORLD_SPAN, roadHalfWidthM, worldToScreen, type View } from './layout';
import { typeInfo } from './vehicleTypes';
import { drawVehicleArt, drawVehicleShadow } from './vehicleArt';
import { drawSprite, drawSpriteShadow, getSprite, type Paint, type SpriteName } from './sprites';
import { glow } from './glow';

// Aerial-photo palette: muted asphalt, concrete and lawn, so the vehicles and the signal lamps are
// the only saturated things on the map (the eye goes straight to the traffic).
const C = {
  canvas: '#0a1120',
  canvasDot: 'rgba(148,163,184,0.13)',
  asphalt: '#585b61',
  asphaltBox: '#5e6167',
  wear: 'rgba(20,22,26,0.07)',
  paint: 'rgba(238,238,232,0.9)',
  yellow: '#e2bd48',
  concrete: '#c6c2b8',
  concreteJoint: 'rgba(60,58,52,0.12)',
  curb: '#d6d4cc',
  grass: '#5b8142',
  grassLight: '#679150',
  lot: '#3f4246',
  plaza: '#a9a7a0',
  tactile: '#d4b04a',
};

/** Sun from the north-west: every shadow falls to the south-east (world +x, -y). */
const SUN = { x: 0.62, y: -0.78 };

const ASPECT: Record<SignalColor, string> = { GREEN: '#35e08a', YELLOW: '#ffc93d', RED: '#ff4d45' };
const ASPECT_DIM: Record<SignalColor, string> = { GREEN: '#0f2a1d', YELLOW: '#2e2512', RED: '#2e1211' };

// Smallest drawn footprint for the two-wheelers (meters), so a 1.8 m bicycle is still legible
// from above without growing anywhere near a car's size.
const MIN_TWO_WHEEL = { l: 2.4, w: 0.95 };

// ----------------------------------------------------------------- geometry
const RH = roadHalfWidthM();                   // 10.5 m: three 3.5 m lanes each way
const ROAD_EDGE = RH + 0.8;                     // kerb line (asphalt gutter inside it)
const SIDEWALK_OUT = ROAD_EDGE + 6.2;           // footpath outer edge (walkers stroll at 14.4 m)
const BLOCK_IN = SIDEWALK_OUT + 5;              // lots start past a planted verge
const MAP = WORLD_SPAN / 2;                     // artboard half-size (134 m)
const H = LAYOUT.half;
const STOP = H + STOP_SETBACK;                  // stop line distance from centre
const XWALK_OUT = H + CROSSWALK_DEPTH;
const CORNER_R = 4;                             // kerb radius at the four corners

type Ax = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';
// Unit vector an approach's inbound traffic travels (toward the centre), and its driver's right.
const FWD: Record<Ax, [number, number]> = { NORTH: [0, -1], SOUTH: [0, 1], EAST: [-1, 0], WEST: [1, 0] };
const right = (f: [number, number]): [number, number] => [f[1], -f[0]];
/** World point `along` m out from the centre on approach `ax`, `lat` m to the inbound driver's right. */
function P(ax: Ax, along: number, lat: number): [number, number] {
  const f = FWD[ax], r = right(f);
  return [-f[0] * along + r[0] * lat, -f[1] * along + r[1] * lat];
}
const AXES: Ax[] = ['NORTH', 'SOUTH', 'EAST', 'WEST'];

// ----------------------------------------------------------------- seeded city
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Rect { x0: number; y0: number; x1: number; y1: number }
interface RoofUnit { x: number; y: number; w: number; h: number; kind: 'hvac' | 'vent' | 'solar' | 'sky' | 'garden' }
interface Building extends Rect { color: string; height: number; units: RoofUnit[] }
interface Tree { x: number; y: number; r: number; tone: number }
interface Parked { x: number; y: number; vertical: boolean; flip: boolean; sprite: SpriteName; paint: Paint }
interface ParkingLot extends Rect { stalls: Rect[]; cars: Parked[]; strip?: Rect }
interface Park extends Rect { path: [number, number][] }

const ROOFS = ['#b9b09f', '#8e98a6', '#cfcac0', '#a3705a', '#7f8f88', '#6b7480', '#bca489', '#9aa6b5'];
const PARK_PAINTS: [Paint, number][] = [['white', 0.24], ['black', 0.2], ['silver', 0.16], ['graphite', 0.15], ['blue', 0.1], ['red', 0.08], ['pearl', 0.04], ['navy', 0.03]];

function overlaps(a: Rect, b: Rect, m = 0): boolean {
  return a.x0 - m < b.x1 && b.x0 - m < a.x1 && a.y0 - m < b.y1 && b.y0 - m < a.y1;
}

function buildCity() {
  const rng = makeRng(20260930);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rng() * arr.length)];
  const buildings: Building[] = [];
  const lots: ParkingLot[] = [];
  const parks: Park[] = [];
  const trees: Tree[] = [];
  const LOT = 26, PITCH = 30;
  // the lot nearest each corner is chosen by hand so the view around the junction reads varied
  const cornerKind: Record<string, 'building' | 'parking' | 'park'> = { '1,1': 'parking', '-1,1': 'park', '-1,-1': 'building', '1,-1': 'building' };
  for (const qx of [1, -1]) {
    for (const qy of [1, -1]) {
      for (let iu = 0; iu < 4; iu++) {
        for (let iv = 0; iv < 4; iv++) {
          const u0 = BLOCK_IN + iu * PITCH, v0 = BLOCK_IN + iv * PITCH;
          const xs = [qx * u0, qx * (u0 + LOT)].sort((a, b) => a - b);
          const ys = [qy * v0, qy * (v0 + LOT)].sort((a, b) => a - b);
          const r: Rect = { x0: xs[0], x1: xs[1], y0: ys[0], y1: ys[1] };
          const roll = rng();
          const kind = iu === 0 && iv === 0 ? cornerKind[`${qx},${qy}`] : roll < 0.6 ? 'building' : roll < 0.8 ? 'parking' : 'park';
          if (kind === 'building') buildings.push(makeBuilding(r, rng, pick));
          else if (kind === 'parking') lots.push(makeLot(r, rng, trees));
          else parks.push(makePark(r, rng, trees));
        }
      }
      // street trees down the verge between footpath and lots: canopies fit inside the 5 m strip
      const mid = (SIDEWALK_OUT + BLOCK_IN) / 2;
      for (let d = BLOCK_IN + 4; d < MAP; d += 9 + rng() * 2) {
        trees.push({ x: qx * mid, y: qy * d, r: 1.7 + rng() * 0.5, tone: rng() });
        trees.push({ x: qx * d, y: qy * mid, r: 1.7 + rng() * 0.5, tone: rng() });
      }
    }
  }
  return { buildings, lots, parks, trees };
}

function makeBuilding(r: Rect, rng: () => number, pick: <T>(a: T[]) => T): Building {
  const inset = 1 + rng() * 2.5;
  const b: Building = {
    x0: r.x0 + inset, y0: r.y0 + inset, x1: r.x1 - inset, y1: r.y1 - inset,
    color: pick(ROOFS), height: 7 + Math.floor(rng() * 10) * 3.3, units: [],
  };
  // rooftop plant, placed without overlaps (rejection sampling inside the parapet)
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  const roll = rng();
  if (roll < 0.28) {
    b.units.push({ x: b.x0 + w * 0.12, y: b.y0 + h * 0.12, w: w * 0.5, h: h * 0.36, kind: 'solar' });
  } else if (roll < 0.42) {
    b.units.push({ x: b.x0 + w * 0.15, y: b.y0 + h * 0.55, w: w * 0.7, h: h * 0.3, kind: 'garden' });
  } else if (roll < 0.62) {
    b.units.push({ x: b.x0 + w * 0.2, y: b.y0 + h * 0.2, w: w * 0.12, h: h * 0.6, kind: 'sky' });
    b.units.push({ x: b.x0 + w * 0.42, y: b.y0 + h * 0.2, w: w * 0.12, h: h * 0.6, kind: 'sky' });
  }
  const n = 2 + Math.floor(rng() * 4);
  for (let i = 0, tries = 0; i < n && tries < 40; tries++) {
    const uw = 1.4 + rng() * 2.4, uh = 1.2 + rng() * 2;
    const u: RoofUnit = { x: b.x0 + 1 + rng() * (w - uw - 2), y: b.y0 + 1 + rng() * (h - uh - 2), w: uw, h: uh, kind: rng() < 0.75 ? 'hvac' : 'vent' };
    const box = { x0: u.x, y0: u.y, x1: u.x + u.w, y1: u.y + u.h };
    if (b.units.some((o) => overlaps(box, { x0: o.x, y0: o.y, x1: o.x + o.w, y1: o.y + o.h }, 0.6))) continue;
    b.units.push(u);
    i++;
  }
  return b;
}

// Two rows of 2.6 x 5.2 m stalls facing a shared 6.5 m aisle, a planted strip with a row of small
// trees behind the second row, and a driveway along the far edge.
function makeLot(r: Rect, rng: () => number, trees: Tree[]): ParkingLot {
  const lot: ParkingLot = { ...r, stalls: [], cars: [] };
  const SW = 2.6, SD = 5.2, AISLE = 6.5, STRIP = 2.4;
  const x0 = r.x0 + 1.2, x1 = r.x1 - 1.2;
  const rowA = r.y1 - 0.6 - SD;
  const rowB = rowA - AISLE - SD;
  const n = Math.floor((x1 - x0) / SW);
  const ox = x0 + (x1 - x0 - n * SW) / 2;
  for (const [ri, y] of [rowA, rowB].entries()) {
    for (let i = 0; i < n; i++) {
      const s = { x0: ox + i * SW, x1: ox + (i + 1) * SW, y0: y, y1: y + SD };
      lot.stalls.push(s);
      if (rng() < 0.72) {
        const roll = rng();
        const sprite: SpriteName = roll < 0.12 ? 'pickup' : roll < 0.2 ? 'van' : roll < 0.3 ? 'coupe' : 'sedan';
        let paint: Paint = null, acc = 0;
        const pr = rng();
        for (const [p, w] of PARK_PAINTS) { acc += w; if (pr < acc) { paint = p; break; } }
        // mostly parked nose-in: row A noses toward the lot edge (up), row B toward the strip (down)
        const noseIn = rng() < 0.75;
        const up = ri === 0 ? noseIn : !noseIn;
        lot.cars.push({ x: (s.x0 + s.x1) / 2, y: (s.y0 + s.y1) / 2, vertical: true, flip: !up, sprite, paint: sprite === 'van' ? null : paint });
      }
    }
  }
  const stripMid = rowB - STRIP / 2;
  for (let x = r.x0 + 3; x < r.x1 - 2; x += 6.5) trees.push({ x, y: stripMid, r: 1.05 + rng() * 0.1, tone: rng() });
  lot.strip = { x0: r.x0 + 0.6, x1: r.x1 - 0.6, y0: rowB - STRIP, y1: rowB };
  return lot;
}

function makePark(r: Rect, rng: () => number, trees: Tree[]): Park {
  // a gentle footpath crossing the lawn, trees scattered clear of it and of each other
  const a: [number, number] = [r.x0, r.y0 + (r.y1 - r.y0) * (0.2 + rng() * 0.2)];
  const c: [number, number] = [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2 + (rng() - 0.5) * 10];
  const b: [number, number] = [r.x1, r.y0 + (r.y1 - r.y0) * (0.6 + rng() * 0.2)];
  const path: [number, number][] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16, u = 1 - t;
    path.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  const mine: Tree[] = [];
  for (let tries = 0; tries < 80 && mine.length < 7; tries++) {
    const rad = 1.8 + rng() * 1.6;
    const x = r.x0 + rad + 0.5 + rng() * (r.x1 - r.x0 - 2 * rad - 1);
    const y = r.y0 + rad + 0.5 + rng() * (r.y1 - r.y0 - 2 * rad - 1);
    if (path.some(([px, py]) => Math.hypot(px - x, py - y) < rad + 1.4)) continue;
    if (mine.some((t) => Math.hypot(t.x - x, t.y - y) < t.r + rad + 0.3)) continue;
    mine.push({ x, y, r: rad, tone: rng() });
  }
  trees.push(...mine);
  return { ...r, path };
}

const CITY = buildCity();

// ----------------------------------------------------------------- textures
let noise: HTMLCanvasElement | null = null;
function asphaltNoise(): HTMLCanvasElement | null {
  if (noise || typeof document === 'undefined') return noise;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  if (!g) return null;
  const img = g.createImageData(256, 256);
  const rng = makeRng(99);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = rng();
    const k = v < 0.5 ? 0 : 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = k;
    img.data[i + 3] = Math.floor(Math.abs(v - 0.5) * 2 * 26);
  }
  g.putImageData(img, 0, 0);
  noise = c;
  return c;
}

// ================================================================= STATIC LAYER
/**
 * Everything that never moves: the artboard, roads, markings, blocks, trees and parked cars.
 * CanvasView caches this in an offscreen canvas and only redraws it when the camera changes.
 */
export function drawStatic(ctx: CanvasRenderingContext2D, view: View, w: number, h: number, dpr: number) {
  // Figma-style canvas: dark board with a dot grid that pans with the camera
  ctx.fillStyle = C.canvas;
  ctx.fillRect(0, 0, w, h);
  const step = 22 * dpr;
  ctx.fillStyle = C.canvasDot;
  const ox = ((view.cx % step) + step) % step, oy = ((view.cy % step) + step) % step;
  const dot = Math.max(1, dpr);
  for (let x = ox; x < w; x += step) for (let y = oy; y < h; y += step) ctx.fillRect(x, y, dot, dot);

  // the map is an artboard on that canvas: title label + drop shadow, content clipped to it
  const [ax0, ay0] = worldToScreen(-MAP, MAP, view);
  const [ax1, ay1] = worldToScreen(MAP, -MAP, view);
  ctx.save();
  ctx.font = `500 ${12 * dpr}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(203,213,225,0.6)';
  ctx.textBaseline = 'bottom';
  ctx.fillText('Intersection / 4-way, protected lefts', ax0, ay0 - 8 * dpr);
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 40 * dpr;
  ctx.shadowOffsetY = 12 * dpr;
  ctx.fillStyle = C.grass;
  ctx.fillRect(ax0, ay0, ax1 - ax0, ay1 - ay0);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(ax0, ay0, ax1 - ax0, ay1 - ay0);
  ctx.clip();
  drawGround(ctx, view);
  drawRoads(ctx, view);
  drawSidewalks(ctx, view);
  drawLots(ctx, view);
  drawParks(ctx, view);
  drawBuildings(ctx, view);
  drawMarkings(ctx, view);
  drawTrees(ctx, view);
  ctx.restore();
}

function drawGround(ctx: CanvasRenderingContext2D, view: View) {
  // faint mowing bands give the lawns some texture
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (let x = -MAP; x < MAP; x += 8) fillW(ctx, view, x, -MAP, x + 4, MAP);
}

function drawRoads(ctx: CanvasRenderingContext2D, view: View) {
  ctx.fillStyle = C.asphalt;
  fillW(ctx, view, -ROAD_EDGE, -MAP, ROAD_EDGE, MAP);
  fillW(ctx, view, -MAP, -ROAD_EDGE, MAP, ROAD_EDGE);
  // the rounded kerbs cut into each corner square, so pave the whole square under them
  fillW(ctx, view, -ROAD_EDGE - CORNER_R, -ROAD_EDGE - CORNER_R, ROAD_EDGE + CORNER_R, ROAD_EDGE + CORNER_R);
  ctx.fillStyle = C.asphaltBox;
  fillW(ctx, view, -H - 0.2, -H - 0.2, H + 0.2, H + 0.2);
  // grain: a fine noise pattern pinned to world space so it pans with the road
  const n = asphaltNoise();
  if (n) {
    const pat = ctx.createPattern(n, 'repeat');
    if (pat) {
      pat.setTransform(new DOMMatrix().translate(view.cx, view.cy).scale(view.scale / 7));
      ctx.fillStyle = pat;
      fillW(ctx, view, -ROAD_EDGE, -MAP, ROAD_EDGE, MAP);
      fillW(ctx, view, -MAP, -ROAD_EDGE, -ROAD_EDGE, ROAD_EDGE);
      fillW(ctx, view, ROAD_EDGE, -ROAD_EDGE, MAP, ROAD_EDGE);
    }
  }
  // wheel tracks: two darker bands per lane where tyres polish the surface, plus the oil drip
  // stain down the middle of each inbound lane where queues stand at the light
  ctx.fillStyle = C.wear;
  for (const ax of AXES) {
    for (const side of [1, -1]) {
      for (let i = 0; i < 3; i++) {
        const lc = side * (i + 0.5) * LAYOUT.laneWidth;
        for (const t of [-0.85, 0.85]) {
          quadW(ctx, view, ax, XWALK_OUT, MAP, lc + t - 0.3, lc + t + 0.3);
        }
      }
    }
    for (let i = 0; i < 3; i++) {
      const lc = (i + 0.5) * LAYOUT.laneWidth;
      const [sx, sy] = worldToScreen(...P(ax, STOP + 12, lc), view);
      const horiz = ax === 'EAST' || ax === 'WEST';
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 12 * view.scale);
      g.addColorStop(0, 'rgba(18,18,20,0.12)');
      g.addColorStop(1, 'rgba(18,18,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(sx, sy, (horiz ? 12 : 0.7) * view.scale, (horiz ? 0.7 : 12) * view.scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.wear;
    }
  }
}

function drawSidewalks(ctx: CanvasRenderingContext2D, view: View) {
  // each corner is a concrete quadrant with a rounded kerb, lawn inside the footpath
  for (const qx of [1, -1]) {
    for (const qy of [1, -1]) {
      ctx.fillStyle = C.concrete;
      roundedQuadrant(ctx, view, qx, qy, ROAD_EDGE, CORNER_R);
      ctx.fill();
      ctx.lineWidth = Math.max(1.2, 0.28 * view.scale);
      ctx.strokeStyle = C.curb;
      ctx.stroke();
      ctx.fillStyle = C.grass;
      roundedQuadrant(ctx, view, qx, qy, SIDEWALK_OUT, CORNER_R + 1);
      ctx.fill();
      ctx.lineWidth = Math.max(1, 0.12 * view.scale);
      ctx.strokeStyle = 'rgba(70,70,60,0.25)';
      ctx.stroke();
    }
  }
  // expansion joints every 2.5 m along the footpaths
  ctx.strokeStyle = C.concreteJoint;
  ctx.lineWidth = Math.max(0.6, 0.06 * view.scale);
  for (let d = ROAD_EDGE + CORNER_R + 1; d < MAP; d += 2.5) {
    for (const s of [1, -1]) {
      lineW(ctx, view, s * ROAD_EDGE, d, s * SIDEWALK_OUT, d);
      lineW(ctx, view, s * ROAD_EDGE, -d, s * SIDEWALK_OUT, -d);
      lineW(ctx, view, d, s * ROAD_EDGE, d, s * SIDEWALK_OUT);
      lineW(ctx, view, -d, s * ROAD_EDGE, -d, s * SIDEWALK_OUT);
    }
  }
  // yellow tactile pads where each crosswalk meets the kerb
  ctx.fillStyle = C.tactile;
  for (const ax of AXES) {
    for (const lat of [-1, 1]) {
      const a = P(ax, H + 0.5, lat * (ROAD_EDGE + 0.15));
      const b = P(ax, XWALK_OUT - 0.5, lat * (ROAD_EDGE + 1.0));
      fillW(ctx, view, Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]));
    }
  }
}

/** Path of one corner block (quadrant qx,qy) starting `d` m from each road axis, rounded corner `r`. */
function roundedQuadrant(ctx: CanvasRenderingContext2D, view: View, qx: number, qy: number, d: number, r: number) {
  const pt = (x: number, y: number) => worldToScreen(qx * x, qy * y, view);
  ctx.beginPath();
  ctx.moveTo(...pt(d, MAP + 2));
  ctx.lineTo(...pt(d, d + r));
  const [cx, cy] = pt(d, d);
  const [ex, ey] = pt(d + r, d);
  ctx.arcTo(cx, cy, ex, ey, r * view.scale);
  ctx.lineTo(...pt(MAP + 2, d));
  ctx.lineTo(...pt(MAP + 2, MAP + 2));
  ctx.closePath();
}

function drawMarkings(ctx: CanvasRenderingContext2D, view: View) {
  ctx.lineCap = 'butt';
  for (const ax of AXES) {
    // double yellow centre line
    ctx.fillStyle = C.yellow;
    quadW(ctx, view, ax, XWALK_OUT + 0.6, MAP, 0.1, 0.24);
    quadW(ctx, view, ax, XWALK_OUT + 0.6, MAP, -0.24, -0.1);
    ctx.fillStyle = C.paint;
    // edge (fog) lines on both carriageway edges
    quadW(ctx, view, ax, XWALK_OUT + 0.6, MAP, RH - 0.14, RH);
    quadW(ctx, view, ax, XWALK_OUT + 0.6, MAP, -RH, -RH + 0.14);
    // lane lines: solid on the final 28 m before the stop line (no lane changes), dashed beyond,
    // dashed all the way on the outbound side
    for (let i = 1; i < LAYOUT.lanesPerSide; i++) {
      const o = i * LAYOUT.laneWidth;
      quadW(ctx, view, ax, STOP, STOP + 28, o - 0.07, o + 0.07);
      for (let d = STOP + 28; d < MAP; d += 9) quadW(ctx, view, ax, d + 3, d + 6, o - 0.07, o + 0.07);
      for (let d = XWALK_OUT + 1.5; d < MAP; d += 9) quadW(ctx, view, ax, d, d + 3, -o - 0.07, -o + 0.07);
    }
    // stop bar across the inbound lanes
    quadW(ctx, view, ax, STOP - 0.25, STOP + 0.25, 0.35, RH - 0.2);
    // continental crosswalk: bars parallel to traffic
    for (let x = -RH + 0.5; x < RH - 0.4; x += 1.25) quadW(ctx, view, ax, H + 0.3, XWALK_OUT - 0.3, x, x + 0.6);
    // lane arrows (lane 0 left only, 1 straight, 2 right only), twice down each approach
    for (const d of [STOP + 6.5, STOP + 24]) {
      laneArrow(ctx, view, ax, d, 0.5 * LAYOUT.laneWidth, 'left');
      laneArrow(ctx, view, ax, d, 1.5 * LAYOUT.laneWidth, 'straight');
      laneArrow(ctx, view, ax, d, 2.5 * LAYOUT.laneWidth, 'right');
    }
  }
}

// Painted arrow in lane-local coordinates (forward = inbound travel, lateral = driver's right).
function laneArrow(ctx: CanvasRenderingContext2D, view: View, ax: Ax, along: number, lat: number, kind: 'left' | 'straight' | 'right') {
  const at = (fwd: number, side: number) => worldToScreen(...P(ax, along - fwd, lat + side), view);
  ctx.fillStyle = C.paint;
  ctx.strokeStyle = C.paint;
  ctx.lineWidth = 0.32 * view.scale;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(...at(-2.6, 0));
  if (kind === 'straight') {
    ctx.lineTo(...at(0.9, 0));
    ctx.stroke();
    tri(ctx, at(2.6, 0), at(0.8, -0.62), at(0.8, 0.62));
  } else {
    const k = kind === 'left' ? -1 : 1;
    ctx.lineTo(...at(0, 0));
    ctx.quadraticCurveTo(...at(0.9, 0), ...at(0.9, k * 0.55));
    ctx.stroke();
    tri(ctx, at(0.9, k * 1.75), at(0.1, k * 0.5), at(1.7, k * 0.5));
  }
}

function tri(ctx: CanvasRenderingContext2D, a: [number, number], b: [number, number], c: [number, number]) {
  ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...c); ctx.closePath(); ctx.fill();
}

function drawLots(ctx: CanvasRenderingContext2D, view: View) {
  for (const lot of CITY.lots) {
    ctx.fillStyle = C.lot;
    fillW(ctx, view, lot.x0, lot.y0, lot.x1, lot.y1);
    ctx.strokeStyle = C.curb; ctx.lineWidth = Math.max(1, 0.25 * view.scale);
    strokeRectW(ctx, view, lot);
    if (lot.strip) {
      ctx.fillStyle = C.grassLight;
      fillW(ctx, view, lot.strip.x0, lot.strip.y0, lot.strip.x1, lot.strip.y1);
      strokeRectW(ctx, view, lot.strip);
    }
    ctx.strokeStyle = 'rgba(240,240,236,0.75)'; ctx.lineWidth = Math.max(0.6, 0.1 * view.scale);
    for (const s of lot.stalls) {
      lineW(ctx, view, s.x0, s.y0, s.x0, s.y1);
      lineW(ctx, view, s.x1, s.y0, s.x1, s.y1);
    }
    for (const car of lot.cars) {
      const spr = getSprite(car.sprite, car.paint);
      if (!spr) continue;
      const L = 4.5 * view.scale, W = L * (spr.w / spr.h);
      const [sx, sy] = worldToScreen(car.x, car.y, view);
      const ang = car.vertical ? (car.flip ? Math.PI / 2 : -Math.PI / 2) : car.flip ? Math.PI : 0;
      ctx.save();
      ctx.translate(sx + SUN.x * 0.35 * view.scale, sy - SUN.y * 0.35 * view.scale);
      ctx.rotate(ang);
      drawSpriteShadow(ctx, spr, L, W, 0.4);
      ctx.restore();
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(ang);
      drawSprite(ctx, spr, L, W);
      ctx.restore();
    }
  }
}

function drawParks(ctx: CanvasRenderingContext2D, view: View) {
  for (const p of CITY.parks) {
    ctx.fillStyle = C.grassLight;
    fillW(ctx, view, p.x0, p.y0, p.x1, p.y1);
    ctx.strokeStyle = '#c9c2b0';
    ctx.lineWidth = 1.8 * view.scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    p.path.forEach(([x, y], i) => (i ? ctx.lineTo(...worldToScreen(x, y, view)) : ctx.moveTo(...worldToScreen(x, y, view))));
    ctx.save();
    ctx.beginPath();
    ctx.rect(...worldToScreen(p.x0, p.y1, view), (p.x1 - p.x0) * view.scale, (p.y1 - p.y0) * view.scale);
    ctx.clip();
    ctx.beginPath();
    p.path.forEach(([x, y], i) => (i ? ctx.lineTo(...worldToScreen(x, y, view)) : ctx.moveTo(...worldToScreen(x, y, view))));
    ctx.stroke();
    ctx.restore();
  }
}

function drawBuildings(ctx: CanvasRenderingContext2D, view: View) {
  // all shadows first, so a tall tower's shadow never paints over a neighbour's roof
  ctx.fillStyle = 'rgba(12,18,26,0.3)';
  for (const b of CITY.buildings) {
    const k = b.height * 0.32;
    const o: [number, number] = [SUN.x * k, SUN.y * k];
    const pts: [number, number][] = [
      [b.x0, b.y1], [b.x1, b.y1], [b.x1 + o[0], b.y1 + o[1]], [b.x1 + o[0], b.y0 + o[1]], [b.x0 + o[0], b.y0 + o[1]], [b.x0, b.y0],
    ];
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(...worldToScreen(x, y, view)) : ctx.moveTo(...worldToScreen(x, y, view))));
    ctx.closePath();
    ctx.fill();
  }
  for (const b of CITY.buildings) {
    const [x, y] = worldToScreen(b.x0, b.y1, view);
    const w = (b.x1 - b.x0) * view.scale, h = (b.y1 - b.y0) * view.scale;
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, shade(b.color, 0.08));
    g.addColorStop(1, shade(b.color, -0.08));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    // parapet: light outer rim, darker inner line
    ctx.lineWidth = Math.max(1, 0.45 * view.scale);
    ctx.strokeStyle = shade(b.color, 0.22);
    ctx.strokeRect(x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
    ctx.lineWidth = Math.max(0.5, 0.1 * view.scale);
    ctx.strokeStyle = shade(b.color, -0.25);
    const ins = 0.5 * view.scale;
    ctx.strokeRect(x + ins, y + ins, w - 2 * ins, h - 2 * ins);
    for (const u of b.units) drawRoofUnit(ctx, view, u, b.color);
  }
}

function drawRoofUnit(ctx: CanvasRenderingContext2D, view: View, u: RoofUnit, roof: string) {
  const [x, y] = worldToScreen(u.x, u.y + u.h, view);
  const w = u.w * view.scale, h = u.h * view.scale, s = view.scale;
  switch (u.kind) {
    case 'hvac':
      ctx.fillStyle = 'rgba(10,14,20,0.28)';
      ctx.fillRect(x + 0.35 * s, y + 0.45 * s, w, h);
      ctx.fillStyle = '#d3d5d7';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#9ea3a8';
      ctx.beginPath(); ctx.arc(x + w * 0.5, y + h * 0.5, Math.min(w, h) * 0.3, 0, Math.PI * 2); ctx.fill();
      break;
    case 'vent':
      ctx.fillStyle = 'rgba(10,14,20,0.3)';
      ctx.beginPath(); ctx.arc(x + w / 2 + 0.3 * s, y + h / 2 + 0.4 * s, Math.min(w, h) * 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = shade(roof, 0.3);
      ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.4, 0, Math.PI * 2); ctx.fill();
      break;
    case 'solar': {
      ctx.fillStyle = '#1e2d4a';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(150,180,230,0.28)'; ctx.lineWidth = Math.max(0.5, 0.06 * s);
      for (let gx = x; gx <= x + w + 0.1; gx += 1.1 * s) { ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx, y + h); ctx.stroke(); }
      for (let gy = y; gy <= y + h + 0.1; gy += 1.7 * s) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); ctx.stroke(); }
      break;
    }
    case 'sky':
      ctx.fillStyle = '#5d7486';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x, y, w * 0.4, h);
      break;
    case 'garden':
      ctx.fillStyle = '#5a7a3f';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#6f9150';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath(); ctx.arc(x + w * (0.1 + i * 0.2), y + h * (i % 2 ? 0.35 : 0.65), Math.min(w, h) * 0.22, 0, Math.PI * 2); ctx.fill();
      }
      break;
  }
}

function drawTrees(ctx: CanvasRenderingContext2D, view: View) {
  // shadows first, canopies on top, so overlapping crowns never get a shadow painted across them
  for (const t of CITY.trees) {
    const [sx, sy] = worldToScreen(t.x + SUN.x * t.r * 0.9, t.y + SUN.y * t.r * 0.9, view);
    const r = t.r * view.scale;
    const g = ctx.createRadialGradient(sx, sy, r * 0.2, sx, sy, r * 1.1);
    g.addColorStop(0, 'rgba(10,20,10,0.38)');
    g.addColorStop(1, 'rgba(10,20,10,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(sx, sy, r * 1.1, 0, Math.PI * 2); ctx.fill();
  }
  for (const t of CITY.trees) {
    const [sx, sy] = worldToScreen(t.x, t.y, view);
    const r = t.r * view.scale;
    const base = t.tone < 0.33 ? '#3d5c2c' : t.tone < 0.66 ? '#46672f' : '#51703a';
    ctx.fillStyle = shade(base, -0.18);
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
    // clustered leaf lobes, lit from the north-west
    const lobes = 6;
    for (let i = 0; i < lobes; i++) {
      const a = (i / lobes) * Math.PI * 2 + t.tone * 6;
      const lx = sx + Math.cos(a) * r * 0.45, ly = sy + Math.sin(a) * r * 0.45;
      const lr = r * 0.52;
      const g = ctx.createRadialGradient(lx - lr * 0.35, ly - lr * 0.35, lr * 0.1, lx, ly, lr);
      g.addColorStop(0, shade(base, 0.22));
      g.addColorStop(1, base);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(lx, ly, lr, 0, Math.PI * 2); ctx.fill();
    }
    const g = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.3, 0, sx, sy, r * 0.6);
    g.addColorStop(0, 'rgba(255,255,220,0.16)');
    g.addColorStop(1, 'rgba(255,255,220,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(sx, sy, r * 0.6, 0, Math.PI * 2); ctx.fill();
  }
}

// ================================================================= DYNAMIC LAYER
export function drawDynamic(
  ctx: CanvasRenderingContext2D,
  view: View,
  vehicles: VehicleView[],
  pedestrians: PedestrianView[],
  signals: SignalState | null,
  nowMs: number,
) {
  const [ax0, ay0] = worldToScreen(-MAP, MAP, view);
  const [ax1, ay1] = worldToScreen(MAP, -MAP, view);
  ctx.save();
  ctx.beginPath();
  ctx.rect(ax0, ay0, ax1 - ax0, ay1 - ay0);
  ctx.clip();
  if (signals) drawSignalSpill(ctx, view, signals);
  for (const v of vehicles) if (v.emer) emergencyGlow(ctx, view, v, nowMs);
  const shapes = vehicles.map((v) => vehicleShape(v, view));
  for (let i = 0; i < vehicles.length; i++) drawShadow(ctx, view, vehicles[i], shapes[i], nowMs);
  for (let i = 0; i < vehicles.length; i++) drawVehicle(ctx, vehicles[i], shapes[i], nowMs);
  drawPedestrians(ctx, view, pedestrians);
  if (signals) {
    drawSignals(ctx, view, signals);
    drawPedSignals(ctx, view, signals);
  }
  ctx.restore();
}

// ----------------------------------------------------------------- vehicles
interface Shape { cx: number; cy: number; ang: number; L: number; W: number }

function vehicleShape(v: VehicleView, view: View): Shape {
  const info = typeInfo(v.t);
  const [fx, fy] = worldToScreen(v.x, v.y, view);
  const [rxs, rys] = worldToScreen(v.rx, v.ry, view);
  const dx = fx - rxs, dy = fy - rys;
  const chord = Math.hypot(dx, dy);
  const ang = chord > 0.5 ? Math.atan2(dy, dx) : -v.h;
  const twoWheel = v.t <= 1;
  // Length follows the real front-to-rear slot the backend sends (it bends through turns, so
  // bodies never overlap); width keeps the sprite's own proportions, clamped inside one lane.
  const L = Math.max(chord, info.length * view.scale, twoWheel ? MIN_TWO_WHEEL.l * view.scale : 0);
  let wm = info.width;
  const look = SPRITE_ASPECT[v.t];
  if (look) wm = Math.min(info.length * look, info.width * 1.18);
  const W = Math.max(Math.min(wm, LANE_FIT * LAYOUT.laneWidth), twoWheel ? MIN_TWO_WHEEL.w : 0) * view.scale;
  return { cx: (fx + rxs) / 2, cy: (fy + rys) / 2, ang, L, W };
}

// width/length ratio of the sprite-drawn types (car, SUV, van, ambulance), incl. mirrors
const SPRITE_ASPECT: Record<number, number> = { 2: 98 / 214, 3: 111 / 204, 4: 93 / 196, 7: 102 / 207 };

function drawShadow(ctx: CanvasRenderingContext2D, view: View, v: VehicleView, s: Shape, nowMs: number) {
  const k = (v.t >= 5 && v.t !== 7 ? 0.7 : 0.4) * view.scale;
  ctx.save();
  ctx.translate(s.cx + SUN.x * k, s.cy - SUN.y * k);
  ctx.rotate(s.ang);
  drawVehicleShadow(ctx, v.t, s.L, s.W, v.id, nowMs);
  ctx.restore();
}

function drawVehicle(ctx: CanvasRenderingContext2D, v: VehicleView, s: Shape, nowMs: number) {
  ctx.save();
  ctx.translate(s.cx, s.cy);
  ctx.rotate(s.ang);
  drawVehicleArt(ctx, v.t, s.L, s.W, nowMs, v.id);
  // Brake lights glow as the vehicle slows or stops, so a queue reads as braking, not frozen.
  if (v.v < 2.4 && v.t > 0) {
    const k = Math.min(1, (2.4 - v.v) / 2.0);
    const rx = -s.L / 2 + Math.max(0.8, s.L * 0.02);
    const ry = s.W * (v.t === 1 ? 0 : 0.3);
    const rr = Math.max(0.9, s.W * 0.09);
    glow(ctx, rx, -ry, rr * 3.4, '#ff2a1e', 0.8 * k);
    if (ry > 0) glow(ctx, rx, ry, rr * 3.4, '#ff2a1e', 0.8 * k);
    ctx.fillStyle = `rgba(255,40,30,${0.6 + 0.4 * k})`;
    ctx.beginPath(); ctx.arc(rx, -ry, rr, 0, Math.PI * 2); ctx.fill();
    if (ry > 0) { ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}

// Red/blue (ambulance) or red/white (fire engine) light washing over the asphalt around the vehicle.
function emergencyGlow(ctx: CanvasRenderingContext2D, view: View, v: VehicleView, nowMs: number) {
  const [fx, fy] = worldToScreen(v.x, v.y, view);
  const [rx, ry] = worldToScreen(v.rx, v.ry, view);
  const cx = (fx + rx) / 2, cy = (fy + ry) / 2;
  const on = Math.floor(nowMs / 160) % 2 === 0;
  const col = on ? '255,50,40' : v.t === 7 ? '60,120,255' : '255,240,230';
  const r = 9 * view.scale;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, `rgba(${col},0.34)`);
  g.addColorStop(1, `rgba(${col},0)`);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ----------------------------------------------------------------- pedestrians
// Walkers are simulated in the BACKEND (PedestrianSimulator): they stroll the footpaths, wait at
// the kerb for their WALK phase and cross, streamed in every snapshot like the vehicles. Vehicles
// hold at the line while a crosswalk on their route is occupied (proved by the SafetyMonitor).
const PED_LAT = (ROAD_EDGE + SIDEWALK_OUT) / 2;      // footpath midline (crosswalk feet, signals)
const CROSS_LAT = LAYOUT.half + CROSSWALK_DEPTH / 2; // centre of a crosswalk band
const PED_COLORS = ['#c9503e', '#e0a13a', '#3f72c2', '#6d52b8', '#2f8f63', '#c85488', '#39414d', '#e8e6df'];
const HAIR = ['#2a1d15', '#1a1a1a', '#5a3a22', '#c9a26a', '#3d2a1f'];

// A crosswalk's WALK phase: the through movement PARALLEL to the walk is solid green, which is
// exactly when the street being crossed, and its turns, is fully stopped. Same rule the backend
// walkers obey, so the signal heads and the pedestrians can never disagree.
function pedWalkOn(signals: SignalState | null, kind: 'NS' | 'EW'): boolean {
  if (!signals) return false;
  return kind === 'NS' ? signals.through.EAST === 'GREEN' : signals.through.NORTH === 'GREEN';
}

function drawPedestrians(ctx: CanvasRenderingContext2D, view: View, peds: PedestrianView[]) {
  for (const p of peds) {
    const idx = ((p.c % PED_COLORS.length) + PED_COLORS.length) % PED_COLORS.length;
    drawPed(ctx, view, p, PED_COLORS[idx], HAIR[p.id % HAIR.length]);
  }
}

function drawPed(ctx: CanvasRenderingContext2D, view: View, p: PedestrianView, color: string, hair: string) {
  const [sx, sy] = worldToScreen(p.x, p.y, view);
  // a bit larger than life so walkers read from above, still far under a car's footprint
  const r = Math.max(3.2, 0.78 * view.scale);
  ctx.fillStyle = 'rgba(10,16,20,0.28)';
  ctx.beginPath(); ctx.ellipse(sx + r * 0.5, sy + r * 0.6, r * 0.9, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
  const moving = !!(p.fx || p.fy);
  const ang = moving ? Math.atan2(-p.fy, p.fx) : 0;
  // stride: feet swing in and out of the silhouette with distance walked
  const phase = ((p.x * p.fx + p.y * p.fy) / 0.7) * Math.PI;
  const stride = moving ? Math.sin(phase) * r * 0.55 : 0;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(ang);
  ctx.fillStyle = '#23262b';
  ctx.beginPath(); ctx.ellipse(stride, -r * 0.3, r * 0.3, r * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-stride, r * 0.3, r * 0.3, r * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.5, r * 0.9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = Math.max(0.5, r * 0.1); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.stroke();
  ctx.fillStyle = hair;
  ctx.beginPath(); ctx.arc(r * 0.05, 0, r * 0.34, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ----------------------------------------------------------------- signals
interface Head { ax: Ax; x: number; y: number; horizontal: boolean; ox: number; oy: number; pole: [number, number] }
const FRONT = H + CROSSWALK_DEPTH + 1.0; // just in front of the stop line, past the crosswalk
// Each head hangs on a mast arm over the inbound lanes, just in front of the stop line, the bar
// parallel to the stop line; the arm runs back to a pole on the corner footpath.
const HEADS: Head[] = [
  { ax: 'NORTH', x: -RH, y: FRONT, horizontal: true, ox: 1, oy: 0, pole: [-(ROAD_EDGE + 1.2), FRONT] },
  { ax: 'SOUTH', x: RH, y: -FRONT, horizontal: true, ox: -1, oy: 0, pole: [ROAD_EDGE + 1.2, -FRONT] },
  { ax: 'EAST', x: FRONT, y: RH, horizontal: false, ox: 0, oy: 1, pole: [FRONT, ROAD_EDGE + 1.2] },
  { ax: 'WEST', x: -FRONT, y: -RH, horizontal: false, ox: 0, oy: -1, pole: [-FRONT, -(ROAD_EDGE + 1.2)] },
];

function headGeometry(view: View) {
  const R = Math.max(3.4, 0.5 * view.scale);
  const gap = R * 0.5, pad = R * 0.6;
  return { R, gap, pad, longSide: R * 8 + gap * 3 + pad * 2, shortSide: R * 2 + pad * 2 };
}

// A soft pool of the lit colour on the asphalt under each head: the scene reads the phase at a glance.
function drawSignalSpill(ctx: CanvasRenderingContext2D, view: View, signals: SignalState) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const head of HEADS) {
    const col = signals.left[head.ax] !== 'RED' ? signals.left[head.ax] : signals.through[head.ax];
    const [cx, cy] = worldToScreen(...P(head.ax, STOP + 3, RH / 2), view);
    const r = 9 * view.scale;
    const rgb = col === 'GREEN' ? '53,224,138' : col === 'YELLOW' ? '255,201,61' : '255,77,69';
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(${rgb},0.12)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawSignals(ctx: CanvasRenderingContext2D, view: View, signals: SignalState) {
  const { R, gap, pad, longSide, shortSide } = headGeometry(view);
  for (const head of HEADS) {
    let [cx, cy] = worldToScreen(head.x, head.y, view);
    cx += head.ox * (longSide / 2);
    cy += head.oy * (longSide / 2);
    const w = head.horizontal ? longSide : shortSide;
    const hgt = head.horizontal ? shortSide : longSide;
    // mast arm + pole
    const [px, py] = worldToScreen(head.pole[0], head.pole[1], view);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = Math.max(2, 0.28 * view.scale);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(px + 3, py + 4); ctx.lineTo(cx + 3, cy + 4); ctx.stroke();
    ctx.strokeStyle = '#6b7079';
    ctx.lineWidth = Math.max(1.5, 0.22 * view.scale);
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(cx, cy); ctx.stroke();
    ctx.fillStyle = '#3b4048';
    ctx.beginPath(); ctx.arc(px, py, Math.max(2.5, 0.32 * view.scale), 0, Math.PI * 2); ctx.fill();
    // housing
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, cx - w / 2 + 3, cy - hgt / 2 + 4, w, hgt, R * 0.6); ctx.fill();
    ctx.fillStyle = '#121418';
    roundRect(ctx, cx - w / 2, cy - hgt / 2, w, hgt, R * 0.6); ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.stroke();
    const start = head.horizontal ? cx - w / 2 + pad + R : cy - hgt / 2 + pad + R;
    const step = 2 * R + gap;
    const at = (i: number): [number, number] => (head.horizontal ? [start + i * step, cy] : [cx, start + i * step]);
    const through = signals.through[head.ax];
    lamp(ctx, ...at(0), R, 'RED', through === 'RED');
    lamp(ctx, ...at(1), R, 'YELLOW', through === 'YELLOW');
    lamp(ctx, ...at(2), R, 'GREEN', through === 'GREEN');
    leftArrow(ctx, ...at(3), R, signals.left[head.ax], head.ax);
  }
}

function lamp(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: SignalColor, on: boolean) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (on) {
    const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.25, 0, x, y, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, ASPECT[c]);
    g.addColorStop(1, ASPECT[c]);
    glow(ctx, x, y, r * 3.2, ASPECT[c], 0.9);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
  } else {
    ctx.fillStyle = ASPECT_DIM[c];
    ctx.fill();
  }
}

function leftArrow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, left: SignalColor, ax: Ax) {
  // A lit left arrow is the ONLY green during a protected-left phase (all three through bulbs are
  // red), so it glows hard: the phase must never read as a dead all-red.
  const on = left !== 'RED';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#0a0c0f'; ctx.fill();
  const color = on ? ASPECT[left] : ASPECT_DIM.GREEN;
  ctx.save();
  ctx.translate(x, y);
  const rot: Record<Ax, number> = { NORTH: 0, SOUTH: Math.PI, EAST: -Math.PI / 2, WEST: Math.PI / 2 };
  ctx.rotate(rot[ax]);
  if (on) glow(ctx, 0, 0, r * 3.4, color, 1);
  ctx.fillStyle = color;
  const k = r * 0.8;
  ctx.beginPath();
  ctx.moveTo(-k, 0);
  ctx.lineTo(k * 0.1, -k * 0.85);
  ctx.lineTo(k * 0.1, -k * 0.34);
  ctx.lineTo(k, -k * 0.34);
  ctx.lineTo(k, k * 0.34);
  ctx.lineTo(k * 0.1, k * 0.34);
  ctx.lineTo(k * 0.1, k * 0.85);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// WALK / DON'T WALK head at each crosswalk: green walking figure, red standing figure.
function drawPedSignals(ctx: CanvasRenderingContext2D, view: View, signals: SignalState) {
  const nsWalk = pedWalkOn(signals, 'NS');
  const ewWalk = pedWalkOn(signals, 'EW');
  const o = PED_LAT + 1.6;
  drawPedSignal(ctx, view, o, CROSS_LAT, nsWalk);
  drawPedSignal(ctx, view, -o, -CROSS_LAT, nsWalk);
  drawPedSignal(ctx, view, CROSS_LAT, -o, ewWalk);
  drawPedSignal(ctx, view, -CROSS_LAT, o, ewWalk);
}

function drawPedSignal(ctx: CanvasRenderingContext2D, view: View, x: number, y: number, walk: boolean) {
  const [sx, sy] = worldToScreen(x, y, view);
  const s = Math.max(5.5, view.scale);
  const w = 1.5 * s, h = 1.9 * s, rad = 0.3 * s;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  roundRect(ctx, sx - w / 2 + 2, sy - h / 2 + 3, w, h, rad); ctx.fill();
  ctx.fillStyle = '#121418';
  roundRect(ctx, sx - w / 2, sy - h / 2, w, h, rad); ctx.fill();
  const lit = walk ? '#35e08a' : '#ff4d45';
  const lw = w - 0.36 * s, lh = h - 0.36 * s;
  glow(ctx, sx, sy, h * 1.1, lit, 0.55);
  ctx.fillStyle = lit;
  roundRect(ctx, sx - lw / 2, sy - lh / 2, lw, lh, rad * 0.7); ctx.fill();
  const u = h * 0.46;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.fillStyle = ctx.strokeStyle = '#0b0e12';
  ctx.lineWidth = Math.max(1, u * 0.22); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.arc(0, -u * 0.52, u * 0.2, 0, Math.PI * 2); ctx.fill();
  const seg = (a: number, b: number, c: number, d: number) => { ctx.beginPath(); ctx.moveTo(a * u, b * u); ctx.lineTo(c * u, d * u); ctx.stroke(); };
  if (walk) {
    seg(-0.02, -0.3, 0.05, 0.05); seg(0.05, 0.05, -0.22, 0.36); seg(0.05, 0.05, 0.28, 0.32); seg(0, -0.16, 0.26, -0.02);
  } else {
    seg(0, -0.3, 0, 0.08); seg(0, 0.08, -0.14, 0.36); seg(0, 0.08, 0.14, 0.36); seg(0, -0.16, -0.16, 0.04); seg(0, -0.16, 0.16, 0.04);
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

function fillW(ctx: CanvasRenderingContext2D, view: View, x0: number, y0: number, x1: number, y1: number) {
  const [ax, ay] = worldToScreen(Math.min(x0, x1), Math.max(y0, y1), view);
  const [bx, by] = worldToScreen(Math.max(x0, x1), Math.min(y0, y1), view);
  ctx.fillRect(ax, ay, bx - ax, by - ay);
}

function strokeRectW(ctx: CanvasRenderingContext2D, view: View, r: Rect) {
  const [ax, ay] = worldToScreen(r.x0, r.y1, view);
  ctx.strokeRect(ax, ay, (r.x1 - r.x0) * view.scale, (r.y1 - r.y0) * view.scale);
}

/** Fill the band on approach `ax` from `a` to `b` m out, between lateral offsets l0..l1. */
function quadW(ctx: CanvasRenderingContext2D, view: View, ax: Ax, a: number, b: number, l0: number, l1: number) {
  const p = P(ax, a, l0), q = P(ax, b, l1);
  fillW(ctx, view, p[0], p[1], q[0], q[1]);
}

function lineW(ctx: CanvasRenderingContext2D, view: View, x0: number, y0: number, x1: number, y1: number) {
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
