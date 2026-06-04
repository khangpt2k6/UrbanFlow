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
};

const ASPECT: Record<SignalColor, string> = { GREEN: '#28d17c', YELLOW: '#ffcf33', RED: '#ff5a52' };
const ASPECT_DIM: Record<SignalColor, string> = { GREEN: '#1c3a2a', YELLOW: '#3d3520', RED: '#3e2220' };

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

  drawScenery(ctx, view);
  drawRoads(ctx, view);
  drawCrosswalks(ctx, view);
  drawLaneMarkings(ctx, view);
  drawStopLines(ctx, view);
  for (const v of vehicles) drawVehicle(ctx, view, v, nowMs);
  if (signals) drawSignals(ctx, view, signals);
  drawCompass(ctx, canvasW, canvasH);
}

// ----------------------------------------------------------------- compass
// Fixed screen-space compass rose in the top-left corner. World frame is +x East,
// +y North with a flipped screen y, so North=up, South=down, East=right, West=left.
// Labels use Vietnamese cardinals: B (Bac/N), N (Nam/S), Đ (Dong/E), T (Tay/W).
function drawCompass(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number) {
  const r = Math.max(30, Math.min(canvasW, canvasH) * 0.055);
  const m = r + Math.max(14, r * 0.5); // keep the dial clear of the corner
  const cx = m;
  const cy = m;

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
  ctx.font = `bold ${Math.round(r * 0.34)}px system-ui, sans-serif`;
  const labels: [string, number, number, string][] = [
    ['B', cx, cy - lr, '#d63b34'],
    ['N', cx, cy + lr, '#3a4150'],
    ['Đ', cx + lr, cy, '#3a4150'],
    ['T', cx - lr, cy, '#3a4150'],
  ];
  for (const [t, x, y, col] of labels) {
    ctx.fillStyle = col;
    ctx.fillText(t, x, y);
  }
  ctx.restore();
}

// ----------------------------------------------------------------- scenery
function drawScenery(ctx: CanvasRenderingContext2D, view: View) {
  // Houses / buildings (x, y, w, h, color).
  const buildings: [number, number, number, number, string][] = [
    [32, 42, 16, 22, '#6f93c9'], [56, 27, 14, 16, '#e0a93b'],
    [34, -40, 16, 26, '#9aa7b8'], [57, -25, 14, 16, '#d98b6a'],
    [-36, -30, 30, 14, '#c98a5a'], [-25, 24, 12, 12, '#d98b6a'],
  ];
  for (const [x, y, w, h, c] of buildings) drawBuilding(ctx, view, x, y, w, h, c);

  drawPond(ctx, view, -44, 44, 36, 24);

  // Lots of trees of varied sizes for a lush, park-like feel.
  const trees: [number, number, number][] = [
    [22, 62, 1.1], [40, 70, 0.8], [52, 58, 1.2], [64, 46, 0.9], [70, 64, 1.0], [30, 50, 0.7],
    [24, -56, 1.1], [42, -64, 0.85], [54, -50, 1.2], [66, -42, 0.9], [72, -60, 1.0], [38, -48, 0.7],
    [-24, -52, 1.1], [-42, -62, 0.9], [-54, -44, 1.2], [-64, -56, 0.85], [-30, -68, 1.0], [-70, -40, 0.8],
    [-58, 56, 1.1], [-30, 60, 0.9], [-66, 38, 1.0], [-48, 66, 0.85], [-72, 60, 0.8], [-20, 70, 0.7],
  ];
  for (const [x, y, s] of trees) drawTree(ctx, view, x, y, s);

  // Bushes and flower clusters scatter green/colour across the lawns.
  const bushes: [number, number][] = [
    [16, 50], [60, 36], [44, -38], [20, -44], [-18, -40], [-48, -54], [-20, 52], [-60, 48], [70, 30], [-70, 28],
  ];
  for (const [x, y] of bushes) drawBush(ctx, view, x, y);
  const flowers: [number, number][] = [
    [18, 58], [50, 64], [28, -50], [58, -58], [-26, -60], [-52, 60], [-38, 52], [62, 52],
  ];
  for (const [x, y] of flowers) drawFlowers(ctx, view, x, y);
}

function drawBush(ctx: CanvasRenderingContext2D, view: View, x: number, y: number) {
  const [sx, sy] = worldToScreen(x, y, view);
  const r = Math.max(3, 1.8 * view.scale);
  ctx.fillStyle = 'rgba(30,40,30,0.14)';
  ctx.beginPath(); ctx.ellipse(sx + 2, sy + r * 0.5, r * 1.1, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#56b863';
  ctx.beginPath(); ctx.arc(sx - r * 0.5, sy, r * 0.7, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(sx + r * 0.5, sy, r * 0.7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#67ca72';
  ctx.beginPath(); ctx.arc(sx, sy - r * 0.3, r * 0.75, 0, Math.PI * 2); ctx.fill();
}

function drawFlowers(ctx: CanvasRenderingContext2D, view: View, x: number, y: number) {
  const [sx, sy] = worldToScreen(x, y, view);
  const r = Math.max(1.5, 0.55 * view.scale);
  const cols = ['#ff6b9d', '#ffd23f', '#ff8a5b', '#c77dff'];
  const spots: [number, number][] = [[0, 0], [r * 2.4, r * 0.8], [r * 1.2, -r * 1.8], [-r * 1.8, r * 1.2], [-r * 1.4, -r * 1.4]];
  spots.forEach((p, i) => {
    ctx.fillStyle = cols[i % cols.length];
    ctx.beginPath(); ctx.arc(sx + p[0], sy + p[1], r, 0, Math.PI * 2); ctx.fill();
  });
}

function drawBuilding(ctx: CanvasRenderingContext2D, view: View, x: number, y: number, w: number, h: number, color: string) {
  const [sx, sy] = worldToScreen(x, y, view);
  const wp = w * view.scale;
  const hp = h * view.scale;
  ctx.save();
  ctx.translate(sx - wp / 2, sy - hp / 2);
  // shadow
  ctx.fillStyle = 'rgba(30,40,30,0.18)';
  roundRect(ctx, 4, 6, wp, hp, 3); ctx.fill();
  // body
  ctx.fillStyle = color;
  roundRect(ctx, 0, 0, wp, hp, 3); ctx.fill();
  ctx.strokeStyle = C.stroke; ctx.lineWidth = 1.5; ctx.stroke();
  // roof strip
  ctx.fillStyle = shade(color, -0.22);
  roundRect(ctx, 0, 0, wp, Math.max(4, hp * 0.16), 3); ctx.fill();
  // windows
  ctx.fillStyle = 'rgba(255,247,214,0.92)';
  const m = Math.max(3, wp * 0.12);
  const cols = Math.max(2, Math.floor((wp - m) / (m * 1.6)));
  const rows = Math.max(2, Math.floor((hp - hp * 0.2 - m) / (m * 1.6)));
  const gx = (wp - m) / cols;
  const gy = (hp - hp * 0.2 - m) / rows;
  for (let r = 0; r < rows; r++)
    for (let cc = 0; cc < cols; cc++)
      roundRect(ctx, m / 2 + cc * gx + gx * 0.18, hp * 0.2 + m / 2 + r * gy + gy * 0.18, gx * 0.5, gy * 0.5, 1), ctx.fill();
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

function drawPond(ctx: CanvasRenderingContext2D, view: View, x: number, y: number, w: number, h: number) {
  const [sx, sy] = worldToScreen(x, y, view);
  ctx.fillStyle = '#5aa9e6';
  ctx.beginPath(); ctx.ellipse(sx, sy, w * view.scale / 2, h * view.scale / 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#3d8fce'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.ellipse(sx - w * view.scale * 0.18, sy - h * view.scale * 0.18, w * view.scale * 0.18, h * view.scale * 0.1, 0, 0, Math.PI * 2); ctx.fill();
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
  // Tuck each head into the corner of the intersection: just off the road edge
  // (lat), level with the stop line (along), on the approaching driver's right.
  // Each head runs PARALLEL to its road so it hugs the curb instead of poking
  // across the asphalt -> N/S heads are vertical, E/W heads are horizontal.
  const lat = rh + 3; // a few metres onto the corner sidewalk, clear of the road
  const along = h + STOP_SETBACK; // level with the stop line
  const heads: { ax: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST'; x: number; y: number; horizontal: boolean }[] = [
    { ax: 'NORTH', x: -lat, y: along, horizontal: false },
    { ax: 'SOUTH', x: lat, y: -along, horizontal: false },
    { ax: 'EAST', x: along, y: lat, horizontal: true },
    { ax: 'WEST', x: -along, y: -lat, horizontal: true },
  ];
  const R = Math.max(3.5, 1.0 * view.scale);
  const gap = R * 0.55;
  const pad = R * 0.7;
  for (const head of heads) {
    const [cx, cy] = worldToScreen(head.x, head.y, view);
    const through = signals.through[head.ax];
    const left = signals.left[head.ax];
    const longSide = R * 8 + gap * 3 + pad * 2; // 3 circles + arrow
    const shortSide = R * 2 + pad * 2;
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
  const L = Math.max(chord, info.length * view.scale);
  const W = Math.min(info.width, LANE_FIT * LAYOUT.laneWidth) * view.scale;

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
