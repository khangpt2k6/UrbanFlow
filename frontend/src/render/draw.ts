import type { SignalColor, SignalState, VehicleView } from '../types/snapshot';
import { LAYOUT, roadHalfWidthM, worldToScreen, type View } from './layout';
import { typeInfo } from './vehicleTypes';

const SIGNAL_RGB: Record<SignalColor, string> = {
  GREEN: '#22c55e',
  YELLOW: '#facc15',
  RED: '#ef4444',
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
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.fillStyle = '#0b1120';
  ctx.fillRect(0, 0, canvasW, canvasH);

  drawRoads(ctx, view);
  drawLaneMarkings(ctx, view);
  drawStopLines(ctx, view);
  if (signals) drawSignals(ctx, view, signals);
  for (const v of vehicles) drawVehicle(ctx, view, v, nowMs);
}

function drawRoads(ctx: CanvasRenderingContext2D, view: View) {
  const rh = roadHalfWidthM();
  const far = LAYOUT.approachLength + LAYOUT.half;
  ctx.fillStyle = '#1e293b';
  // Vertical (N-S) road.
  fillWorldRect(ctx, view, -rh, -far, rh, far);
  // Horizontal (E-W) road.
  fillWorldRect(ctx, view, -far, -rh, far, rh);
  // Intersection box (subtly lighter).
  ctx.fillStyle = '#243047';
  fillWorldRect(ctx, view, -rh, -rh, rh, rh);
}

function drawLaneMarkings(ctx: CanvasRenderingContext2D, view: View) {
  const far = LAYOUT.approachLength + LAYOUT.half;
  const h = LAYOUT.half;

  // Center double-yellow on each leg (separates inbound from outbound).
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = Math.max(1, 0.35 * view.scale);
  line(ctx, view, 0, h, 0, far);
  line(ctx, view, 0, -h, 0, -far);
  line(ctx, view, h, 0, far, 0);
  line(ctx, view, -h, 0, -far, 0);

  // Dashed white lane dividers.
  ctx.strokeStyle = 'rgba(226,232,240,0.5)';
  ctx.lineWidth = Math.max(1, 0.18 * view.scale);
  ctx.setLineDash([1.5 * view.scale, 1.8 * view.scale]);
  for (let i = 1; i < LAYOUT.lanesPerSide; i++) {
    const o = i * LAYOUT.laneWidth;
    // vertical road, both sides of center
    line(ctx, view, o, h, o, far);
    line(ctx, view, o, -h, o, -far);
    line(ctx, view, -o, h, -o, far);
    line(ctx, view, -o, -h, -o, -far);
    // horizontal road
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
  ctx.strokeStyle = 'rgba(248,250,252,0.85)';
  ctx.lineWidth = Math.max(1.5, 0.6 * view.scale);
  // Inbound side of each approach (right-hand traffic): the half of the road carrying traffic
  // toward the box. NORTH inbound is the west half (x in [-rh,0]) at y = +h, etc.
  line(ctx, view, -rh, h, 0, h); // NORTH
  line(ctx, view, 0, -h, rh, -h); // SOUTH
  line(ctx, view, h, 0, h, rh); // EAST (inbound on north half)
  line(ctx, view, -h, -rh, -h, 0); // WEST
}

function drawSignals(ctx: CanvasRenderingContext2D, view: View, signals: SignalState) {
  const h = LAYOUT.half;
  const rh = roadHalfWidthM();
  // [throughColor pos, leftColor] cluster per approach, placed at the inbound corner.
  const heads: { ax: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST'; x: number; y: number }[] = [
    { ax: 'NORTH', x: -rh - 3, y: h + 3 },
    { ax: 'SOUTH', x: rh + 3, y: -h - 3 },
    { ax: 'EAST', x: h + 3, y: rh + 3 },
    { ax: 'WEST', x: -h - 3, y: -rh - 3 },
  ];
  for (const head of heads) {
    const [sx, sy] = worldToScreen(head.x, head.y, view);
    const r = Math.max(3, 1.4 * view.scale);
    // housing
    ctx.fillStyle = '#0f172a';
    roundRect(ctx, sx - r - 2, sy - 2 * r - 4, 2 * r + 4, 4 * r + 6, 3);
    ctx.fill();
    // through light (top)
    drawLight(ctx, sx, sy - r - 1, r, signals.through[head.ax]);
    // left light (bottom, dimmed arrow)
    drawLight(ctx, sx, sy + r + 1, r * 0.85, signals.left[head.ax]);
  }
}

function drawLight(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: SignalColor) {
  const rgb = SIGNAL_RGB[color];
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = rgb;
  ctx.shadowColor = rgb;
  ctx.shadowBlur = color === 'RED' ? 4 : 10;
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawVehicle(ctx: CanvasRenderingContext2D, view: View, v: VehicleView, nowMs: number) {
  const info = typeInfo(v.t);
  const [sx, sy] = worldToScreen(v.x, v.y, view);
  const len = info.length * view.scale;
  const wid = Math.max(2, info.width * view.scale);

  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(-v.h); // world heading -> screen (y flipped)

  if (v.emer) {
    const pulse = 0.5 + 0.5 * Math.sin(nowMs / 120);
    ctx.shadowColor = pulse > 0.5 ? '#ef4444' : '#3b82f6';
    ctx.shadowBlur = 8 + 10 * pulse;
  }

  // Body: front bumper at local origin, extending backward (-x).
  ctx.fillStyle = info.color;
  roundRect(ctx, -len, -wid / 2, len, wid, Math.min(3, wid / 2));
  ctx.fill();
  ctx.shadowBlur = 0;

  // Windshield hint near the front.
  ctx.fillStyle = 'rgba(15,23,42,0.55)';
  roundRect(ctx, -len * 0.35, -wid / 2 + 1, len * 0.28, wid - 2, 1);
  ctx.fill();

  ctx.restore();
}

// ---- low-level helpers (world-space) ----

function fillWorldRect(
  ctx: CanvasRenderingContext2D,
  view: View,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  const [ax, ay] = worldToScreen(x0, y1, view); // top-left in screen
  const [bx, by] = worldToScreen(x1, y0, view); // bottom-right in screen
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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
