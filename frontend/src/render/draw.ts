import type { SignalColor, SignalState, VehicleView } from '../types/snapshot';
import { LAYOUT, roadHalfWidthM, worldToScreen, type View } from './layout';
import { typeInfo } from './vehicleTypes';

// Bright, cartoon palette: grassy ground, gray roads, bold white markings.
const C = {
  bg: '#bfe3b0', // grass
  bg2: '#b2dba2',
  road: '#6b7280', // asphalt
  box: '#787f8c',
  roadEdge: '#565d6b',
  center: '#ffd23f', // bold yellow center line
  divider: 'rgba(255,255,255,0.75)',
  stopLine: '#ffffff',
  crosswalk: '#ffffff',
  shadow: 'rgba(30,40,30,0.28)',
  stroke: 'rgba(28,32,40,0.6)', // cartoon vehicle outline
  housing: '#2b2f38',
  housingEdge: '#11141a',
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
  // soft grass gradient
  const g = ctx.createLinearGradient(0, 0, 0, canvasH);
  g.addColorStop(0, C.bg);
  g.addColorStop(1, C.bg2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvasW, canvasH);

  drawRoads(ctx, view);
  drawCrosswalks(ctx, view);
  drawLaneMarkings(ctx, view);
  drawStopLines(ctx, view);
  for (const v of vehicles) drawVehicle(ctx, view, v, nowMs);
  if (signals) drawSignals(ctx, view, signals);
}

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
  const depth = 4.5;
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
  line(ctx, view, 0, h, 0, far);
  line(ctx, view, 0, -h, 0, -far);
  line(ctx, view, h, 0, far, 0);
  line(ctx, view, -h, 0, -far, 0);

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
  const d = 5;
  ctx.strokeStyle = C.stopLine;
  ctx.lineWidth = Math.max(2, 0.6 * view.scale);
  line(ctx, view, -rh, h + d, 0, h + d);
  line(ctx, view, 0, -h - d, rh, -h - d);
  line(ctx, view, h + d, 0, h + d, rh);
  line(ctx, view, -h - d, -rh, -h - d, 0);
}

/**
 * Classic, unmistakable traffic lights: a 3-aspect head (red / amber / green) governs the
 * through+right movements, and a left-turn arrow governs protected left turns. The active bulb
 * glows; the others are shown dim. Green circle = go straight; green arrow = turn left; red = stop.
 */
function drawSignals(ctx: CanvasRenderingContext2D, view: View, signals: SignalState) {
  const h = LAYOUT.half;
  const rh = roadHalfWidthM();
  const heads: { ax: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST'; x: number; y: number }[] = [
    { ax: 'NORTH', x: -rh - 7, y: h + 8 },
    { ax: 'SOUTH', x: rh + 7, y: -h - 8 },
    { ax: 'EAST', x: h + 8, y: rh + 7 },
    { ax: 'WEST', x: -h - 8, y: -rh - 7 },
  ];
  const R = Math.max(3.5, 1.0 * view.scale);
  const gap = R * 0.55;
  const pad = R * 0.7;

  for (const head of heads) {
    const [cx, cy] = worldToScreen(head.x, head.y, view);
    const through = signals.through[head.ax];
    const left = signals.left[head.ax];

    const w = R * 2 + pad * 2;
    const hgt = R * 8 + gap * 3 + pad * 2; // 3 circles + 1 arrow
    // housing
    ctx.fillStyle = C.housing;
    ctx.strokeStyle = C.housingEdge;
    ctx.lineWidth = 1.5;
    roundRect(ctx, cx - w / 2, cy - hgt / 2, w, hgt, R * 0.7);
    ctx.fill();
    ctx.stroke();

    let y = cy - hgt / 2 + pad + R;
    aspect(ctx, cx, y, R, 'RED', through);
    y += 2 * R + gap;
    aspect(ctx, cx, y, R, 'YELLOW', through);
    y += 2 * R + gap;
    aspect(ctx, cx, y, R, 'GREEN', through);
    y += 2 * R + gap;
    leftArrow(ctx, cx, y, R, left);
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

function leftArrow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, left: SignalColor) {
  const on = left !== 'RED';
  const color = on ? ASPECT[left] : ASPECT_DIM.GREEN;
  ctx.fillStyle = color;
  if (on) { ctx.shadowColor = color; ctx.shadowBlur = 12; }
  ctx.beginPath();
  ctx.moveTo(x - r, y);            // tip points left
  ctx.lineTo(x + r * 0.5, y - r);
  ctx.lineTo(x + r * 0.5, y - r * 0.4);
  ctx.lineTo(x + r, y - r * 0.4);
  ctx.lineTo(x + r, y + r * 0.4);
  ctx.lineTo(x + r * 0.5, y + r * 0.4);
  ctx.lineTo(x + r * 0.5, y + r);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawVehicle(ctx: CanvasRenderingContext2D, view: View, v: VehicleView, nowMs: number) {
  const info = typeInfo(v.t);
  const [fx, fy] = worldToScreen(v.x, v.y, view);
  const [rxs, rys] = worldToScreen(v.rx, v.ry, view);
  const dx = fx - rxs;
  const dy = fy - rys;
  const chord = Math.hypot(dx, dy);
  const W = Math.max(3.5, info.width * view.scale);
  const L = Math.max(W * 1.1, chord);
  const r = Math.min(4, W / 2.2);
  const ang = chord > 0.5 ? Math.atan2(dy, dx) : -v.h;

  ctx.save();
  ctx.translate(fx, fy);
  ctx.rotate(ang);

  ctx.save();
  ctx.translate(W * 0.14, W * 0.2);
  ctx.fillStyle = C.shadow;
  roundRect(ctx, -L, -W / 2, L, W, r);
  ctx.fill();
  ctx.restore();

  if (info.emergency) drawEmergency(ctx, v.t, L, W, r, nowMs);
  else if (v.t === 0 || v.t === 1) drawTwoWheeler(ctx, info.color, L, W, r);
  else drawCar(ctx, info.color, L, W, r);

  ctx.restore();
}

function bodyStroke(ctx: CanvasRenderingContext2D, L: number, W: number, r: number) {
  ctx.strokeStyle = C.stroke;
  ctx.lineWidth = Math.max(1, W * 0.07);
  roundRect(ctx, -L, -W / 2, L, W, r);
  ctx.stroke();
}

function drawCar(ctx: CanvasRenderingContext2D, color: string, L: number, W: number, r: number) {
  ctx.fillStyle = color;
  roundRect(ctx, -L, -W / 2, L, W, r);
  ctx.fill();
  bodyStroke(ctx, L, W, r);
  ctx.fillStyle = shade(color, -0.24);
  roundRect(ctx, -L * 0.72, -W * 0.36, L * 0.44, W * 0.72, r * 0.7);
  ctx.fill();
  ctx.fillStyle = 'rgba(232,242,255,0.9)';
  roundRect(ctx, -L * 0.34, -W * 0.3, L * 0.12, W * 0.6, 1);
  ctx.fill();
  ctx.fillStyle = '#fff7da';
  roundRect(ctx, -2, -W / 2 + 1.5, 2, W * 0.18, 1);
  roundRect(ctx, -2, W / 2 - 1.5 - W * 0.18, 2, W * 0.18, 1);
  ctx.fill();
}

function drawTwoWheeler(ctx: CanvasRenderingContext2D, color: string, L: number, W: number, r: number) {
  ctx.fillStyle = color;
  roundRect(ctx, -L, -W / 2, L, W, r);
  ctx.fill();
  bodyStroke(ctx, L, W, r);
  ctx.fillStyle = shade(color, -0.4);
  ctx.beginPath();
  ctx.arc(-L * 0.45, 0, Math.max(1.6, W * 0.4), 0, Math.PI * 2);
  ctx.fill();
}

function drawEmergency(ctx: CanvasRenderingContext2D, t: number, L: number, W: number, r: number, nowMs: number) {
  const isAmbulance = t === 7;
  if (isAmbulance) {
    ctx.fillStyle = '#fbfbfb';
    roundRect(ctx, -L, -W / 2, L, W, r); ctx.fill();
    bodyStroke(ctx, L, W, r);
    ctx.fillStyle = '#ff5a52';
    roundRect(ctx, -L, -W * 0.12, L, W * 0.24, 0); ctx.fill();
    ctx.fillStyle = '#ff5a52';
    const cx = -L * 0.78; const a = Math.max(2.2, W * 0.34);
    roundRect(ctx, cx - a / 6, -a / 2, a / 3, a, 1);
    roundRect(ctx, cx - a / 2, -a / 6, a, a / 3, 1);
    ctx.fill();
    ctx.fillStyle = 'rgba(120,140,160,0.5)';
    roundRect(ctx, -L * 0.22, -W * 0.34, L * 0.14, W * 0.68, 1); ctx.fill();
  } else {
    ctx.fillStyle = '#e23b34';
    roundRect(ctx, -L, -W / 2, L, W, r); ctx.fill();
    bodyStroke(ctx, L, W, r);
    ctx.fillStyle = shade('#e23b34', -0.28);
    roundRect(ctx, -L * 0.28, -W / 2, L * 0.28, W, r * 0.7); ctx.fill();
    ctx.strokeStyle = '#dbe3ea'; ctx.lineWidth = Math.max(1, W * 0.12);
    line2(ctx, -L * 0.85, -W * 0.18, -L * 0.32, -W * 0.18);
    ctx.fillStyle = 'rgba(232,242,255,0.6)';
    roundRect(ctx, -L * 0.2, -W * 0.32, L * 0.1, W * 0.64, 1); ctx.fill();
  }
  const phase = Math.floor(nowMs / 180) % 2 === 0;
  const barX = -L * 0.16;
  ctx.fillStyle = phase ? '#ff5a52' : '#3b82f6';
  ctx.shadowColor = phase ? '#ff5a52' : '#3b82f6'; ctx.shadowBlur = 10;
  roundRect(ctx, barX, -W * 0.3, Math.max(2, L * 0.08), W * 0.26, 1); ctx.fill();
  ctx.fillStyle = phase ? '#3b82f6' : '#ff5a52';
  ctx.shadowColor = phase ? '#3b82f6' : '#ff5a52';
  roundRect(ctx, barX, W * 0.04, Math.max(2, L * 0.08), W * 0.26, 1); ctx.fill();
  ctx.shadowBlur = 0;
}

// ---- helpers ----
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

function line2(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
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
