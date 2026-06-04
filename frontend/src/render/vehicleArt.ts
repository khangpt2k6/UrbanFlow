// Crisp, top-down vehicle artwork drawn entirely in canvas vector (no sprites). Each function
// draws in a LOCAL frame where the vehicle points +x (front to the right), centred on origin,
// L long (x) and W wide (y). The caller translates to the vehicle centre and rotates to heading.

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function shade(hex: string, amt: number): string {
  let m = hex.replace('#', '');
  if (m.length === 3) m = m.replace(/(.)/g, '$1$1');
  const n = parseInt(m, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const k = amt < 0 ? 0 : 255, f = Math.abs(amt);
  r = Math.round(r + (k - r) * f); g = Math.round(g + (k - g) * f); b = Math.round(b + (k - b) * f);
  return `rgb(${r},${g},${b})`;
}

const GLASS = 'rgba(173,206,232,0.95)';
const GLASS_DK = 'rgba(120,150,180,0.9)';
const OUTLINE = 'rgba(20,24,32,0.55)';

function bodyBase(ctx: CanvasRenderingContext2D, L: number, W: number, color: string, round: number) {
  const hx = L / 2, hy = W / 2;
  const grad = ctx.createLinearGradient(0, -hy, 0, hy);
  grad.addColorStop(0, shade(color, 0.26));
  grad.addColorStop(0.5, color);
  grad.addColorStop(1, shade(color, -0.2));
  ctx.fillStyle = grad;
  rr(ctx, -hx, -hy, L, W, round);
  ctx.fill();
  ctx.lineWidth = Math.max(0.7, W * 0.045);
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
}

function gloss(ctx: CanvasRenderingContext2D, L: number, W: number) {
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  rr(ctx, -L * 0.4, -W * 0.38, L * 0.8, W * 0.16, W * 0.08);
  ctx.fill();
}

function lights(ctx: CanvasRenderingContext2D, L: number, W: number) {
  const hx = L / 2, hy = W / 2;
  ctx.fillStyle = '#fff4c6';
  rr(ctx, hx - L * 0.055, -hy + W * 0.1, L * 0.045, W * 0.2, 1.2); ctx.fill();
  rr(ctx, hx - L * 0.055, hy - W * 0.3, L * 0.045, W * 0.2, 1.2); ctx.fill();
  ctx.fillStyle = '#e23b30';
  rr(ctx, -hx + L * 0.012, -hy + W * 0.1, L * 0.035, W * 0.2, 1.2); ctx.fill();
  rr(ctx, -hx + L * 0.012, hy - W * 0.3, L * 0.035, W * 0.2, 1.2); ctx.fill();
}

function mirrors(ctx: CanvasRenderingContext2D, L: number, W: number, color: string) {
  const hy = W / 2;
  ctx.fillStyle = shade(color, -0.28);
  rr(ctx, L * 0.1, -hy - W * 0.08, W * 0.16, W * 0.1, 1); ctx.fill();
  rr(ctx, L * 0.1, hy - W * 0.02, W * 0.16, W * 0.1, 1); ctx.fill();
}

export function drawCar(ctx: CanvasRenderingContext2D, L: number, W: number, color: string, kind: 'car' | 'suv' | 'van') {
  bodyBase(ctx, L, W, color, Math.min(W * 0.46, L * 0.16));
  // cabin / roof
  const cw = kind === 'van' ? L * 0.6 : L * 0.5;
  const cx = kind === 'van' ? -L * 0.02 : -L * 0.04;
  const ch = W * (kind === 'suv' ? 0.82 : 0.76);
  ctx.fillStyle = shade(color, -0.3);
  rr(ctx, cx - cw / 2, -ch / 2, cw, ch, ch * 0.28);
  ctx.fill();
  // windshield (front), rear window, roof bar
  ctx.fillStyle = GLASS;
  rr(ctx, cx + cw * 0.14, -ch * 0.4, cw * 0.3, ch * 0.8, 2); ctx.fill();
  ctx.fillStyle = GLASS_DK;
  rr(ctx, cx - cw * 0.46, -ch * 0.4, cw * 0.26, ch * 0.8, 2); ctx.fill();
  ctx.fillStyle = shade(color, -0.38);
  rr(ctx, cx - cw * 0.12, -ch * 0.44, cw * 0.24, ch * 0.88, 2); ctx.fill();
  // side windows
  ctx.fillStyle = 'rgba(150,180,205,0.6)';
  rr(ctx, cx - cw * 0.42, -ch * 0.5, cw * 0.84, ch * 0.06, 1); ctx.fill();
  rr(ctx, cx - cw * 0.42, ch * 0.44, cw * 0.84, ch * 0.06, 1); ctx.fill();
  mirrors(ctx, L, W, color);
  lights(ctx, L, W);
  gloss(ctx, L, W);
}

export function drawBus(ctx: CanvasRenderingContext2D, L: number, W: number, color: string) {
  bodyBase(ctx, L, W, color, Math.min(W * 0.3, L * 0.08));
  const hx = L / 2, hy = W / 2;
  // front windshield
  ctx.fillStyle = GLASS;
  rr(ctx, hx - L * 0.12, -hy + W * 0.12, L * 0.07, W - W * 0.24, 2); ctx.fill();
  // row of side windows
  ctx.fillStyle = 'rgba(160,190,212,0.85)';
  const n = 5;
  const w = L * 0.1, gap = L * 0.03, start = -L * 0.34;
  for (let i = 0; i < n; i++) {
    const x = start + i * (w + gap);
    rr(ctx, x, -hy + W * 0.1, w, W * 0.16, 1.5); ctx.fill();
    rr(ctx, x, hy - W * 0.26, w, W * 0.16, 1.5); ctx.fill();
  }
  // roof line
  ctx.strokeStyle = shade(color, -0.25); ctx.lineWidth = Math.max(1, W * 0.05);
  ctx.beginPath(); ctx.moveTo(-hx + L * 0.06, 0); ctx.lineTo(hx - L * 0.14, 0); ctx.stroke();
  lights(ctx, L, W);
  gloss(ctx, L, W);
}

export function drawTruck(ctx: CanvasRenderingContext2D, L: number, W: number, cabColor: string) {
  const hx = L / 2, hy = W / 2;
  // trailer / cargo box (rear ~70%)
  const tlen = L * 0.66;
  const tgrad = ctx.createLinearGradient(0, -hy, 0, hy);
  tgrad.addColorStop(0, '#f3f4f6'); tgrad.addColorStop(0.5, '#e2e5ea'); tgrad.addColorStop(1, '#c9ced6');
  ctx.fillStyle = tgrad;
  rr(ctx, -hx, -hy, tlen, W, Math.min(W * 0.18, 3)); ctx.fill();
  ctx.lineWidth = Math.max(0.7, W * 0.045); ctx.strokeStyle = OUTLINE; ctx.stroke();
  // ribs on the trailer
  ctx.strokeStyle = 'rgba(120,128,140,0.5)'; ctx.lineWidth = Math.max(0.6, W * 0.03);
  for (let i = 1; i < 5; i++) {
    const x = -hx + (tlen * i) / 5;
    ctx.beginPath(); ctx.moveTo(x, -hy + W * 0.1); ctx.lineTo(x, hy - W * 0.1); ctx.stroke();
  }
  // gap then cab (front)
  const cabStart = -hx + tlen + L * 0.02;
  const cabLen = hx - cabStart;
  ctx.fillStyle = cabColor;
  const cg = ctx.createLinearGradient(0, -hy, 0, hy);
  cg.addColorStop(0, shade(cabColor, 0.24)); cg.addColorStop(0.5, cabColor); cg.addColorStop(1, shade(cabColor, -0.2));
  ctx.fillStyle = cg;
  rr(ctx, cabStart, -hy, cabLen, W, Math.min(W * 0.28, cabLen * 0.4)); ctx.fill();
  ctx.lineWidth = Math.max(0.7, W * 0.045); ctx.strokeStyle = OUTLINE; ctx.stroke();
  // cab windshield
  ctx.fillStyle = GLASS;
  rr(ctx, cabStart + cabLen * 0.18, -hy + W * 0.16, cabLen * 0.34, W - W * 0.32, 2); ctx.fill();
  // headlights
  ctx.fillStyle = '#fff4c6';
  rr(ctx, hx - L * 0.04, -hy + W * 0.1, L * 0.03, W * 0.18, 1); ctx.fill();
  rr(ctx, hx - L * 0.04, hy - W * 0.28, L * 0.03, W * 0.18, 1); ctx.fill();
  gloss(ctx, L, W);
}

export function drawAmbulance(ctx: CanvasRenderingContext2D, L: number, W: number, nowMs: number) {
  bodyBase(ctx, L, W, '#f7f9fb', Math.min(W * 0.3, L * 0.1));
  const hx = L / 2, hy = W / 2;
  // red side stripe
  ctx.fillStyle = '#e23b30';
  rr(ctx, -hx + L * 0.04, -W * 0.1, L * 0.7, W * 0.2, 1); ctx.fill();
  // red cross (rear)
  ctx.fillStyle = '#e23b30';
  const a = W * 0.34, cx = -L * 0.3;
  rr(ctx, cx - a / 6, -a / 2, a / 3, a, 1); rr(ctx, cx - a / 2, -a / 6, a, a / 3, 1); ctx.fill();
  // cab glass (front)
  ctx.fillStyle = GLASS;
  rr(ctx, hx - L * 0.16, -hy + W * 0.16, L * 0.09, W - W * 0.32, 2); ctx.fill();
  lights(ctx, L, W);
  flashbar(ctx, L, W, nowMs);
}

export function drawFireTruck(ctx: CanvasRenderingContext2D, L: number, W: number, nowMs: number) {
  bodyBase(ctx, L, W, '#e23b30', Math.min(W * 0.26, L * 0.08));
  const hx = L / 2, hy = W / 2;
  // ladder along the top
  ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = Math.max(1, W * 0.1);
  ctx.beginPath(); ctx.moveTo(-hx + L * 0.08, 0); ctx.lineTo(hx - L * 0.28, 0); ctx.stroke();
  ctx.strokeStyle = 'rgba(120,128,140,0.7)'; ctx.lineWidth = Math.max(0.6, W * 0.03);
  for (let i = 1; i < 6; i++) {
    const x = -hx + L * 0.08 + (L * 0.64 * i) / 6;
    ctx.beginPath(); ctx.moveTo(x, -W * 0.08); ctx.lineTo(x, W * 0.08); ctx.stroke();
  }
  // cab glass
  ctx.fillStyle = GLASS;
  rr(ctx, hx - L * 0.18, -hy + W * 0.16, L * 0.09, W - W * 0.32, 2); ctx.fill();
  // white trim
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  rr(ctx, -hx + L * 0.04, hy - W * 0.14, L * 0.7, W * 0.07, 1); ctx.fill();
  lights(ctx, L, W);
  flashbar(ctx, L, W, nowMs);
}

function flashbar(ctx: CanvasRenderingContext2D, L: number, W: number, nowMs: number) {
  const on = Math.floor(nowMs / 180) % 2 === 0;
  const x = L * 0.06;
  ctx.fillStyle = on ? '#e23b30' : '#2f6df6';
  ctx.shadowColor = ctx.fillStyle as string; ctx.shadowBlur = 9;
  rr(ctx, x, -W * 0.3, L * 0.06, W * 0.26, 1); ctx.fill();
  ctx.fillStyle = on ? '#2f6df6' : '#e23b30';
  ctx.shadowColor = ctx.fillStyle as string;
  rr(ctx, x, W * 0.04, L * 0.06, W * 0.26, 1); ctx.fill();
  ctx.shadowBlur = 0;
}

export function drawTwoWheel(ctx: CanvasRenderingContext2D, L: number, W: number, color: string, bike: boolean) {
  // wheels
  ctx.fillStyle = '#23262e';
  rr(ctx, L * 0.2, -W * 0.5, L * 0.22, W, W * 0.3); ctx.fill();
  rr(ctx, -L * 0.42, -W * 0.5, L * 0.22, W, W * 0.3); ctx.fill();
  // frame / body
  ctx.fillStyle = color;
  rr(ctx, -L * 0.34, -W * 0.34, L * 0.62, W * 0.68, W * 0.3); ctx.fill();
  ctx.lineWidth = Math.max(0.6, W * 0.06); ctx.strokeStyle = OUTLINE; ctx.stroke();
  // rider
  ctx.fillStyle = bike ? '#1f6feb' : shade(color, -0.4);
  ctx.beginPath(); ctx.arc(-L * 0.05, 0, W * 0.42, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(-L * 0.05, 0, W * 0.22, 0, Math.PI * 2); ctx.fill();
}

export function drawVehicleArt(ctx: CanvasRenderingContext2D, type: number, L: number, W: number, color: string, nowMs: number) {
  switch (type) {
    case 0: drawTwoWheel(ctx, L, W, color, true); break;       // bicycle
    case 1: drawTwoWheel(ctx, L, W, color, false); break;      // motorcycle
    case 2: drawCar(ctx, L, W, color, 'car'); break;
    case 3: drawCar(ctx, L, W, color, 'suv'); break;
    case 4: drawCar(ctx, L, W, color, 'van'); break;
    case 5: drawBus(ctx, L, W, color); break;
    case 6: drawTruck(ctx, L, W, color); break;
    case 7: drawAmbulance(ctx, L, W, nowMs); break;
    case 8: drawFireTruck(ctx, L, W, nowMs); break;
    default: drawCar(ctx, L, W, color, 'car');
  }
}
