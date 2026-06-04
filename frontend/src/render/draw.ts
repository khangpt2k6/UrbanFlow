import type { SignalColor, SignalState, VehicleView } from '../types/snapshot';
import { LAYOUT, roadHalfWidthM, worldToScreen, type View } from './layout';
import { typeInfo } from './vehicleTypes';

// Light "Notion" palette: warm paper background, white road surfaces, soft gray markings.
const C = {
  bg: '#eceae4',
  road: '#ffffff',
  box: '#fbfbfa',
  roadEdge: '#e3e0d8',
  center: '#e0a82e', // amber center line
  divider: '#d6d2c8', // dashed lane dividers
  stopLine: '#9a958a',
  crosswalk: '#c8c3b6',
  shadow: 'rgba(40,38,32,0.16)',
};

const SIGNAL_RGB: Record<SignalColor, string> = {
  GREEN: '#3aa667',
  YELLOW: '#e0a82e',
  RED: '#e0584f',
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
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, canvasW, canvasH);

  drawRoads(ctx, view);
  drawCrosswalks(ctx, view);
  drawLaneMarkings(ctx, view);
  drawStopLines(ctx, view);
  if (signals) drawSignals(ctx, view, signals, nowMs);
  for (const v of vehicles) drawVehicle(ctx, view, v, nowMs);
}

function drawRoads(ctx: CanvasRenderingContext2D, view: View) {
  const rh = roadHalfWidthM();
  const far = LAYOUT.approachLength + LAYOUT.half;
  // soft edge
  ctx.fillStyle = C.roadEdge;
  fillWorldRect(ctx, view, -rh - 0.6, -far, rh + 0.6, far);
  fillWorldRect(ctx, view, -far, -rh - 0.6, far, rh + 0.6);
  // road surface
  ctx.fillStyle = C.road;
  fillWorldRect(ctx, view, -rh, -far, rh, far);
  fillWorldRect(ctx, view, -far, -rh, far, rh);
  ctx.fillStyle = C.box;
  fillWorldRect(ctx, view, -rh, -rh, rh, rh);
}

function drawCrosswalks(ctx: CanvasRenderingContext2D, view: View) {
  const rh = roadHalfWidthM();
  const h = LAYOUT.half;
  const depth = 4; // meters
  const stripeW = 0.7;
  const pitch = 1.4;
  ctx.fillStyle = C.crosswalk;

  // North & South edges: vertical stripes (parallel to N-S travel) spanning the road width.
  for (let x = -rh + 0.4; x < rh - 0.4; x += pitch) {
    fillWorldRect(ctx, view, x, h, x + stripeW, h + depth); // north
    fillWorldRect(ctx, view, x, -h - depth, x + stripeW, -h); // south
  }
  // East & West edges: horizontal stripes spanning the road width.
  for (let y = -rh + 0.4; y < rh - 0.4; y += pitch) {
    fillWorldRect(ctx, view, h, y, h + depth, y + stripeW); // east
    fillWorldRect(ctx, view, -h - depth, y, -h, y + stripeW); // west
  }
}

function drawLaneMarkings(ctx: CanvasRenderingContext2D, view: View) {
  const far = LAYOUT.approachLength + LAYOUT.half;
  const h = LAYOUT.half;

  // Amber center line on each leg.
  ctx.strokeStyle = C.center;
  ctx.lineWidth = Math.max(1, 0.28 * view.scale);
  line(ctx, view, 0, h, 0, far);
  line(ctx, view, 0, -h, 0, -far);
  line(ctx, view, h, 0, far, 0);
  line(ctx, view, -h, 0, -far, 0);

  // Dashed lane dividers.
  ctx.strokeStyle = C.divider;
  ctx.lineWidth = Math.max(1, 0.16 * view.scale);
  ctx.setLineDash([1.6 * view.scale, 1.9 * view.scale]);
  for (let i = 1; i < LAYOUT.lanesPerSide; i++) {
    const o = i * LAYOUT.laneWidth;
    line(ctx, view, o, h, o, far);
    line(ctx, view, o, -h, o, -far);
    line(ctx, view, -o, h, -o, far);
    line(ctx, view, -o, -h, -o, -far);
    line(ctx, view, h, o, far, o);
    line(ctx, view, -h, o, -far, o);
    line(ctx, view, h, -o, far, -o);
    line(ctx, view, -h, -o, -far, -o);
  }
  ctx.setLineDash([]);
}

function drawStopLines(ctx: CanvasRenderingContext2D, view: View) {
  const rh = roadHalfWidthM();
  const h = LAYOUT.half;
  const d = 4; // sit just outside the crosswalk
  ctx.strokeStyle = C.stopLine;
  ctx.lineWidth = Math.max(1.5, 0.5 * view.scale);
  line(ctx, view, -rh, h + d, 0, h + d); // NORTH inbound (west half)
  line(ctx, view, 0, -h - d, rh, -h - d); // SOUTH inbound (east half)
  line(ctx, view, h + d, 0, h + d, rh); // EAST inbound (north half)
  line(ctx, view, -h - d, -rh, -h - d, 0); // WEST inbound (south half)
}

function drawSignals(ctx: CanvasRenderingContext2D, view: View, signals: SignalState, nowMs: number) {
  const h = LAYOUT.half;
  const rh = roadHalfWidthM();
  const heads: { ax: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST'; x: number; y: number }[] = [
    { ax: 'NORTH', x: -rh - 4, y: h + 5 },
    { ax: 'SOUTH', x: rh + 4, y: -h - 5 },
    { ax: 'EAST', x: h + 5, y: rh + 4 },
    { ax: 'WEST', x: -h - 5, y: -rh - 4 },
  ];
  for (const head of heads) {
    const [sx, sy] = worldToScreen(head.x, head.y, view);
    const r = Math.max(3, 1.3 * view.scale);
    // housing (light card with border, Notion-ish)
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#d8d4ca';
    ctx.lineWidth = 1;
    roundRect(ctx, sx - r - 3, sy - 2 * r - 5, 2 * r + 6, 4 * r + 8, 4);
    ctx.fill();
    ctx.stroke();
    drawLight(ctx, sx, sy - r - 1, r, signals.through[head.ax], nowMs);
    drawLight(ctx, sx, sy + r + 1, r * 0.85, signals.left[head.ax], nowMs);
  }
}

function drawLight(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: SignalColor, nowMs: number) {
  const rgb = SIGNAL_RGB[color];
  // dim base ring
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#eceae4';
  ctx.fill();
  // active light with glow
  ctx.beginPath();
  ctx.arc(x, y, r * 0.82, 0, Math.PI * 2);
  ctx.fillStyle = rgb;
  ctx.shadowColor = rgb;
  ctx.shadowBlur = color === 'GREEN' ? 12 : color === 'YELLOW' ? 9 : 5;
  ctx.fill();
  ctx.shadowBlur = 0;
  void nowMs;
}

function drawVehicle(ctx: CanvasRenderingContext2D, view: View, v: VehicleView, nowMs: number) {
  const info = typeInfo(v.t);
  const [sx, sy] = worldToScreen(v.x, v.y, view);
  const L = info.length * view.scale;
  const W = Math.max(3, info.width * view.scale);
  const r = Math.min(3.5, W / 2.4);

  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(-v.h); // world heading -> screen (y flipped); +x local = forward

  // soft drop shadow
  ctx.save();
  ctx.translate(W * 0.12, W * 0.18);
  ctx.fillStyle = C.shadow;
  roundRect(ctx, -L, -W / 2, L, W, r);
  ctx.fill();
  ctx.restore();

  if (info.emergency) {
    drawEmergency(ctx, v.t, L, W, r, nowMs);
  } else if (v.t === 0 || v.t === 1) {
    drawTwoWheeler(ctx, info.color, L, W, r);
  } else {
    drawCar(ctx, info.color, L, W, r);
  }

  ctx.restore();
}

function drawCar(ctx: CanvasRenderingContext2D, color: string, L: number, W: number, r: number) {
  // body
  ctx.fillStyle = color;
  roundRect(ctx, -L, -W / 2, L, W, r);
  ctx.fill();
  // cabin / roof (slightly darker), set back from the nose
  ctx.fillStyle = shade(color, -0.22);
  roundRect(ctx, -L * 0.74, -W * 0.36, L * 0.46, W * 0.72, r * 0.8);
  ctx.fill();
  // windshield (front of cabin)
  ctx.fillStyle = 'rgba(226,232,240,0.85)';
  roundRect(ctx, -L * 0.36, -W * 0.32, L * 0.12, W * 0.64, 1);
  ctx.fill();
  // headlights (front corners)
  ctx.fillStyle = '#fff7da';
  roundRect(ctx, -2, -W / 2 + 1, 2, W * 0.18, 1);
  roundRect(ctx, -2, W / 2 - 1 - W * 0.18, 2, W * 0.18, 1);
  ctx.fill();
}

function drawTwoWheeler(ctx: CanvasRenderingContext2D, color: string, L: number, W: number, r: number) {
  ctx.fillStyle = color;
  roundRect(ctx, -L, -W / 2, L, W, r);
  ctx.fill();
  // rider / helmet
  ctx.fillStyle = shade(color, -0.35);
  ctx.beginPath();
  ctx.arc(-L * 0.45, 0, Math.max(1.5, W * 0.42), 0, Math.PI * 2);
  ctx.fill();
}

function drawEmergency(ctx: CanvasRenderingContext2D, t: number, L: number, W: number, r: number, nowMs: number) {
  const isAmbulance = t === 7;
  if (isAmbulance) {
    // white body
    ctx.fillStyle = '#fafafa';
    roundRect(ctx, -L, -W / 2, L, W, r);
    ctx.fill();
    // red side stripe
    ctx.fillStyle = '#e0584f';
    roundRect(ctx, -L, -W * 0.12, L, W * 0.24, 0);
    ctx.fill();
    // red cross near the rear
    ctx.fillStyle = '#e0584f';
    const cx = -L * 0.78;
    const a = Math.max(2, W * 0.34);
    roundRect(ctx, cx - a / 6, -a / 2, a / 3, a, 1);
    roundRect(ctx, cx - a / 2, -a / 6, a, a / 3, 1);
    ctx.fill();
    // cabin glass at front
    ctx.fillStyle = 'rgba(120,140,160,0.5)';
    roundRect(ctx, -L * 0.22, -W * 0.34, L * 0.14, W * 0.68, 1);
    ctx.fill();
  } else {
    // fire truck: red body, darker cab, ladder line
    ctx.fillStyle = '#d8453d';
    roundRect(ctx, -L, -W / 2, L, W, r);
    ctx.fill();
    ctx.fillStyle = shade('#d8453d', -0.25);
    roundRect(ctx, -L * 0.28, -W / 2, L * 0.28, W, r * 0.8); // front cab
    ctx.fill();
    ctx.strokeStyle = '#cbd5e1'; // ladder
    ctx.lineWidth = Math.max(1, W * 0.12);
    line2(ctx, -L * 0.85, -W * 0.18, -L * 0.32, -W * 0.18);
    ctx.fillStyle = 'rgba(226,232,240,0.55)';
    roundRect(ctx, -L * 0.2, -W * 0.32, L * 0.1, W * 0.64, 1);
    ctx.fill();
  }
  // flashing light bar at the front roof (alternating red / blue)
  const phase = Math.floor(nowMs / 180) % 2 === 0;
  const barX = -L * 0.16;
  ctx.fillStyle = phase ? '#e0584f' : '#3b82f6';
  ctx.shadowColor = phase ? '#e0584f' : '#3b82f6';
  ctx.shadowBlur = 10;
  roundRect(ctx, barX, -W * 0.3, Math.max(2, L * 0.08), W * 0.26, 1);
  ctx.fill();
  ctx.fillStyle = phase ? '#3b82f6' : '#e0584f';
  ctx.shadowColor = phase ? '#3b82f6' : '#e0584f';
  roundRect(ctx, barX, W * 0.04, Math.max(2, L * 0.08), W * 0.26, 1);
  ctx.fill();
  ctx.shadowBlur = 0;
}

// ---- helpers ----

function shade(hex: string, amt: number): string {
  const m = hex.replace('#', '');
  const n = parseInt(m.length === 3 ? m.replace(/(.)/g, '$1$1') : m, 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const k = amt < 0 ? 0 : 255;
  const f = Math.abs(amt);
  r = Math.round(r + (k - r) * f);
  g = Math.round(g + (k - g) * f);
  b = Math.round(b + (k - b) * f);
  return `rgb(${r},${g},${b})`;
}

function fillWorldRect(
  ctx: CanvasRenderingContext2D,
  view: View,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  const [ax, ay] = worldToScreen(x0, y1, view);
  const [bx, by] = worldToScreen(x1, y0, view);
  ctx.fillRect(ax, ay, bx - ax, by - ay);
}

function line(ctx: CanvasRenderingContext2D, view: View, x0: number, y0: number, x1: number, y1: number) {
  const [ax, ay] = worldToScreen(x0, y0, view);
  const [bx, by] = worldToScreen(x1, y1, view);
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
}

function line2(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
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
