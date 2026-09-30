// Top-down vehicle artwork. Cars, SUVs, vans, the ambulance and the truck cab are real sprites
// (see sprites.ts); the bus, trailer, fire engine and two-wheelers are drawn in canvas vector in
// the same shaded, aerial-photo style. Everything draws in a LOCAL frame where the vehicle points
// +x (front to the right), centred on the origin, L long (x) and W wide (y). The caller translates
// to the vehicle centre and rotates to its heading.

import { drawSprite, drawSpriteShadow, getSprite, type Paint, type SpriteName } from './sprites';

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

/** Stable pseudo-random number in [0,1) per vehicle id (and salt), so a car keeps its look. */
function hash01(id: number, salt = 0): number {
  let h = (id * 2654435761 + salt * 974634987) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function pick<T>(r: number, table: [T, number][]): T {
  let acc = 0;
  for (const [v, w] of table) { acc += w; if (r < acc) return v; }
  return table[table.length - 1][0];
}

// Real-world paint shares (white, black and greys dominate actual traffic).
const CAR_PAINTS: [Paint, number][] = [
  ['white', 0.25], ['black', 0.13], ['silver', 0.15], ['graphite', 0.08], ['blue', 0.13],
  ['red', 0.12], ['pearl', 0.06], ['navy', 0.03], ['sand', 0.03], ['green', 0.02],
];

interface Look { sprite: SpriteName; paint: Paint }

function carLook(id: number): Look {
  const model = pick<SpriteName>(hash01(id, 1), [['sedan', 0.6], ['coupe', 0.17], ['taxi', 0.1], ['sport', 0.08], ['police', 0.05]]);
  const paint = model === 'sedan' || model === 'coupe' ? pick(hash01(id, 2), CAR_PAINTS) : null;
  return { sprite: model, paint };
}

/** The sprite (if any) a vehicle is drawn with. Used for the body and for its shadow. */
function spriteLook(t: number, id: number): Look | null {
  switch (t) {
    case 2: return carLook(id);
    case 3: return { sprite: 'pickup', paint: pick(hash01(id, 3), [['blue', 0.2], ['white', 0.25], ['black', 0.2], ['silver', 0.15], ['red', 0.1], ['green', 0.1]] as [Paint, number][]) };
    case 4: return { sprite: 'van', paint: null };
    default: return null;
  }
}

function ambulanceFrame(nowMs: number): SpriteName {
  return (['ambulance1', 'ambulance2', 'ambulance3'] as SpriteName[])[Math.floor(nowMs / 140) % 3];
}

// ------------------------------------------------------------------ shadows
let blob: HTMLCanvasElement | null = null;
/** A pre-blurred rounded-rect shadow, stretched under the vector vehicles (cheaper than shadowBlur). */
function blobShadow(): HTMLCanvasElement | null {
  if (blob || typeof document === 'undefined') return blob;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  g.filter = 'blur(6px)';
  g.fillStyle = '#000';
  rr(g, 16, 16, 96, 32, 10);
  g.fill();
  blob = c;
  return c;
}

/** Soft ground shadow, drawn before the body in the same local frame. */
export function drawVehicleShadow(ctx: CanvasRenderingContext2D, t: number, L: number, W: number, id: number, nowMs: number) {
  const look = t === 7 ? { sprite: ambulanceFrame(nowMs), paint: null } : spriteLook(t, id);
  const s = look ? getSprite(look.sprite, look.paint) : null;
  if (s) {
    drawSpriteShadow(ctx, s, L, W, 0.42);
    return;
  }
  const b = blobShadow();
  if (!b) return;
  ctx.save();
  ctx.globalAlpha *= t <= 1 ? 0.28 : 0.4;
  // the blob has 16 px of blur margin around a 96x32 core; stretch the core to L x W
  const kx = L / 96, ky = W / 32;
  ctx.drawImage(b, -L / 2 - 16 * kx, -W / 2 - 16 * ky, 128 * kx, 64 * ky);
  ctx.restore();
}

// ------------------------------------------------------------------ vector vehicles
const GLASS = '#1d2631';
const OUTLINE = 'rgba(10,14,20,0.45)';

function glassSheen(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, 'rgba(255,255,255,0.22)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.02)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  rr(ctx, x, y, w, h, Math.min(w, h) * 0.3);
  ctx.fill();
}

const LIVERIES = ['#1f6fd1', '#d9482b', '#139a72', '#e0a019'];

export function drawBus(ctx: CanvasRenderingContext2D, L: number, W: number, id: number) {
  const hx = L / 2, hy = W / 2;
  const livery = LIVERIES[Math.floor(hash01(id, 5) * LIVERIES.length)];
  // side livery peeking out below the roof edge
  ctx.fillStyle = livery;
  rr(ctx, -hx, -hy, L, W, W * 0.2); ctx.fill();
  // white roof, slightly inset, shaded across its width like a curved panel
  const g = ctx.createLinearGradient(0, -hy, 0, hy);
  g.addColorStop(0, '#fbfbfc'); g.addColorStop(0.5, '#e8eaed'); g.addColorStop(1, '#cdd1d6');
  ctx.fillStyle = g;
  rr(ctx, -hx + L * 0.012, -hy + W * 0.08, L * 0.976, W * 0.84, W * 0.16); ctx.fill();
  ctx.lineWidth = Math.max(0.6, W * 0.03); ctx.strokeStyle = OUTLINE;
  rr(ctx, -hx, -hy, L, W, W * 0.2); ctx.stroke();
  // wrap-around windshield at the front, small rear window
  ctx.fillStyle = GLASS;
  rr(ctx, hx - L * 0.055, -hy + W * 0.1, L * 0.05, W * 0.8, W * 0.12); ctx.fill();
  glassSheen(ctx, hx - L * 0.055, -hy + W * 0.1, L * 0.05, W * 0.8);
  rr(ctx, -hx + L * 0.008, -hy + W * 0.22, L * 0.022, W * 0.56, 2); ctx.fill();
  // roof-top A/C pod with a grille, plus two escape hatches
  ctx.fillStyle = '#b6bcc4';
  rr(ctx, -L * 0.2, -W * 0.3, L * 0.24, W * 0.6, W * 0.1); ctx.fill();
  ctx.strokeStyle = 'rgba(60,68,78,0.45)'; ctx.lineWidth = Math.max(0.5, W * 0.025);
  for (let i = 1; i < 6; i++) {
    const x = -L * 0.2 + (L * 0.24 * i) / 6;
    ctx.beginPath(); ctx.moveTo(x, -W * 0.22); ctx.lineTo(x, W * 0.22); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(40,48,58,0.16)';
  rr(ctx, L * 0.14, -W * 0.16, L * 0.08, W * 0.32, 2); ctx.fill();
  rr(ctx, -L * 0.38, -W * 0.16, L * 0.08, W * 0.32, 2); ctx.fill();
}

const TRAILERS = ['#eef0f3', '#eef0f3', '#e3e6ea', '#dfe3e8', '#2d5aa8', '#b33a2e'];

export function drawTruck(ctx: CanvasRenderingContext2D, L: number, W: number, id: number) {
  const hx = L / 2, hy = W / 2;
  const cab = getSprite('truck_cab', null);
  const cabLen = Math.min(L * 0.34, W * 1.28);
  const tLen = L - cabLen - L * 0.02;
  // trailer: corrugated box with ribs across the roof
  const col = TRAILERS[Math.floor(hash01(id, 6) * TRAILERS.length)];
  const g = ctx.createLinearGradient(0, -hy, 0, hy);
  g.addColorStop(0, shade(col, 0.2)); g.addColorStop(0.5, col); g.addColorStop(1, shade(col, -0.16));
  ctx.fillStyle = g;
  rr(ctx, -hx, -hy, tLen, W, W * 0.06); ctx.fill();
  ctx.lineWidth = Math.max(0.6, W * 0.03); ctx.strokeStyle = OUTLINE; ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.09)'; ctx.lineWidth = Math.max(0.5, W * 0.02);
  const ribs = Math.max(6, Math.round(tLen / (W * 0.24)));
  for (let i = 1; i < ribs; i++) {
    const x = -hx + (tLen * i) / ribs;
    ctx.beginPath(); ctx.moveTo(x, -hy + W * 0.04); ctx.lineTo(x, hy - W * 0.04); ctx.stroke();
  }
  // hitch between trailer and cab
  ctx.fillStyle = '#23272e';
  rr(ctx, -hx + tLen - L * 0.01, -W * 0.18, L * 0.04, W * 0.36, 1); ctx.fill();
  // cab
  const cx = hx - cabLen / 2;
  if (cab) {
    ctx.save(); ctx.translate(cx, 0); drawSprite(ctx, cab, cabLen, W); ctx.restore();
  } else {
    ctx.fillStyle = '#e9e4da'; rr(ctx, cx - cabLen / 2, -hy, cabLen, W, W * 0.2); ctx.fill();
  }
}

export function drawFireTruck(ctx: CanvasRenderingContext2D, L: number, W: number, nowMs: number) {
  const hx = L / 2, hy = W / 2;
  const g = ctx.createLinearGradient(0, -hy, 0, hy);
  g.addColorStop(0, '#ef4a3a'); g.addColorStop(0.5, '#d42a1f'); g.addColorStop(1, '#a8170f');
  ctx.fillStyle = g;
  rr(ctx, -hx, -hy, L, W, W * 0.14); ctx.fill();
  ctx.lineWidth = Math.max(0.6, W * 0.03); ctx.strokeStyle = OUTLINE; ctx.stroke();
  // equipment lockers down both flanks
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  const lockers = 5;
  for (let i = 0; i < lockers; i++) {
    const x = -hx + L * 0.04 + i * (L * 0.62) / lockers;
    rr(ctx, x, -hy + W * 0.05, (L * 0.62) / lockers - L * 0.012, W * 0.14, 1.5); ctx.fill();
    rr(ctx, x, hy - W * 0.19, (L * 0.62) / lockers - L * 0.012, W * 0.14, 1.5); ctx.fill();
  }
  // cab: white roof, dark windshield
  const cabX = hx - L * 0.2;
  ctx.fillStyle = '#f3f4f6';
  rr(ctx, cabX, -hy + W * 0.1, L * 0.14, W * 0.8, W * 0.1); ctx.fill();
  ctx.fillStyle = GLASS;
  rr(ctx, hx - L * 0.055, -hy + W * 0.1, L * 0.045, W * 0.8, W * 0.1); ctx.fill();
  glassSheen(ctx, hx - L * 0.055, -hy + W * 0.1, L * 0.045, W * 0.8);
  // aerial ladder: turntable at the rear, two rails with rungs running forward over the cab
  ctx.fillStyle = '#8b939c';
  ctx.beginPath(); ctx.arc(-L * 0.3, 0, W * 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c3c9d0';
  ctx.beginPath(); ctx.arc(-L * 0.3, 0, W * 0.2, 0, Math.PI * 2); ctx.fill();
  const x0 = -hx + L * 0.03, x1 = hx - L * 0.1;
  ctx.fillStyle = '#e1e5ea';
  rr(ctx, x0, -W * 0.2, x1 - x0, W * 0.07, 1); ctx.fill();
  rr(ctx, x0, W * 0.13, x1 - x0, W * 0.07, 1); ctx.fill();
  ctx.strokeStyle = '#a7aeb6'; ctx.lineWidth = Math.max(0.6, W * 0.035);
  for (let x = x0 + L * 0.03; x < x1; x += L * 0.035) {
    ctx.beginPath(); ctx.moveTo(x, -W * 0.14); ctx.lineTo(x, W * 0.14); ctx.stroke();
  }
  lightBar(ctx, cabX + L * 0.02, W, L * 0.03, nowMs, ['#ff3b30', '#ffffff'], ['#5a1612', '#6b7078']);
  // rear strobes
  const on = Math.floor(nowMs / 120) % 2 === 0;
  ctx.fillStyle = on ? '#ff5146' : '#6e1410';
  rr(ctx, -hx + L * 0.005, -hy + W * 0.06, L * 0.02, W * 0.16, 1); ctx.fill();
  ctx.fillStyle = on ? '#6e1410' : '#ff5146';
  rr(ctx, -hx + L * 0.005, hy - W * 0.22, L * 0.02, W * 0.16, 1); ctx.fill();
}

/** A roof light bar split in two halves that alternate. */
function lightBar(ctx: CanvasRenderingContext2D, x: number, W: number, len: number, nowMs: number,
  lit: [string, string], dim: [string, string]) {
  const on = Math.floor(nowMs / 160) % 2 === 0;
  ctx.fillStyle = '#20252c';
  rr(ctx, x - len * 0.2, -W * 0.4, len * 1.4, W * 0.8, 2); ctx.fill();
  ctx.save();
  ctx.shadowBlur = W * 0.6;
  ctx.fillStyle = ctx.shadowColor = on ? lit[0] : dim[0];
  rr(ctx, x, -W * 0.36, len, W * 0.34, 1.5); ctx.fill();
  ctx.fillStyle = ctx.shadowColor = on ? dim[1] : lit[1];
  rr(ctx, x, W * 0.02, len, W * 0.34, 1.5); ctx.fill();
  ctx.restore();
}

const SHIRTS = ['#e0533d', '#2f6fd6', '#f2b233', '#3a9d6a', '#7a4fc9', '#e36b9e', '#3b4350', '#f5f5f5'];
const HELMETS = ['#f5f5f5', '#1f2328', '#e0533d', '#f2b233', '#2f6fd6', '#16a3a3'];

export function drawBicycle(ctx: CanvasRenderingContext2D, L: number, W: number, id: number) {
  // wheels + frame
  ctx.fillStyle = '#16191e';
  rr(ctx, L * 0.16, -W * 0.07, L * 0.32, W * 0.14, W * 0.07); ctx.fill();
  rr(ctx, -L * 0.48, -W * 0.07, L * 0.32, W * 0.14, W * 0.07); ctx.fill();
  ctx.strokeStyle = '#9aa3ad'; ctx.lineWidth = Math.max(0.8, W * 0.08); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-L * 0.32, 0); ctx.lineTo(L * 0.3, 0); ctx.stroke();
  // handlebar
  ctx.strokeStyle = '#2a2f36'; ctx.lineWidth = Math.max(0.8, W * 0.09);
  ctx.beginPath(); ctx.moveTo(L * 0.2, -W * 0.36); ctx.lineTo(L * 0.2, W * 0.36); ctx.stroke();
  rider(ctx, L, W, SHIRTS[Math.floor(hash01(id, 7) * SHIRTS.length)], HELMETS[Math.floor(hash01(id, 8) * HELMETS.length)], L * 0.2);
}

export function drawMotorcycle(ctx: CanvasRenderingContext2D, L: number, W: number, id: number) {
  ctx.fillStyle = '#121418';
  rr(ctx, L * 0.2, -W * 0.12, L * 0.3, W * 0.24, W * 0.12); ctx.fill();
  rr(ctx, -L * 0.5, -W * 0.14, L * 0.3, W * 0.28, W * 0.14); ctx.fill();
  // body, tank, seat
  ctx.fillStyle = '#2a2f37';
  rr(ctx, -L * 0.34, -W * 0.2, L * 0.64, W * 0.4, W * 0.2); ctx.fill();
  const tank = ['#d4342a', '#1f5fc4', '#f2f2f2', '#1b1e23', '#e8a317'][Math.floor(hash01(id, 9) * 5)];
  const g = ctx.createLinearGradient(0, -W * 0.25, 0, W * 0.25);
  g.addColorStop(0, shade(tank, 0.35)); g.addColorStop(1, shade(tank, -0.25));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(L * 0.12, 0, L * 0.12, W * 0.25, 0, 0, Math.PI * 2); ctx.fill();
  // bars + mirrors
  ctx.strokeStyle = '#1b1e23'; ctx.lineWidth = Math.max(0.8, W * 0.08); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(L * 0.24, -W * 0.44); ctx.lineTo(L * 0.24, W * 0.44); ctx.stroke();
  ctx.fillStyle = '#aeb6bf';
  ctx.beginPath(); ctx.arc(L * 0.27, -W * 0.46, W * 0.07, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(L * 0.27, W * 0.46, W * 0.07, 0, Math.PI * 2); ctx.fill();
  rider(ctx, L, W, '#2b3038', HELMETS[Math.floor(hash01(id, 10) * HELMETS.length)], L * 0.24);
}

/** A rider seen from above: shoulders, arms reaching to the bars, a glossy helmet. */
function rider(ctx: CanvasRenderingContext2D, L: number, W: number, shirt: string, helmet: string, barX: number) {
  const sx = -L * 0.06;
  ctx.strokeStyle = shade(shirt, -0.15); ctx.lineWidth = Math.max(0.8, W * 0.12); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(sx, -W * 0.3); ctx.lineTo(barX, -W * 0.34); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(sx, W * 0.3); ctx.lineTo(barX, W * 0.34); ctx.stroke();
  ctx.fillStyle = shirt;
  ctx.beginPath(); ctx.ellipse(sx, 0, L * 0.11, W * 0.38, 0, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = Math.max(0.5, W * 0.04); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.stroke();
  const hg = ctx.createRadialGradient(sx + L * 0.03, -W * 0.06, 0, sx + L * 0.02, 0, W * 0.24);
  hg.addColorStop(0, shade(helmet, 0.5)); hg.addColorStop(1, shade(helmet, -0.15));
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.arc(sx + L * 0.02, 0, W * 0.22, 0, Math.PI * 2); ctx.fill();
}

// ------------------------------------------------------------------ dispatch
/** Fixed looks for legend icons, so "Car" always shows a plain sedan rather than a random model. */
const ICON_LOOK: Record<number, Look> = { 2: { sprite: 'sedan', paint: 'blue' }, 3: { sprite: 'pickup', paint: 'silver' } };

export function drawVehicleArt(ctx: CanvasRenderingContext2D, type: number, L: number, W: number, nowMs: number, id = 0, icon = false) {
  const look = type === 7 ? { sprite: ambulanceFrame(nowMs), paint: null } : (icon && ICON_LOOK[type]) || spriteLook(type, id);
  if (look) {
    const s = getSprite(look.sprite, look.paint);
    if (s) {
      drawSprite(ctx, s, L, W);
      return;
    }
    fallbackBody(ctx, L, W, type === 7 ? '#f4f6f8' : '#8a93a0'); // sprites still loading
    return;
  }
  switch (type) {
    case 0: drawBicycle(ctx, L, W, id); break;
    case 1: drawMotorcycle(ctx, L, W, id); break;
    case 5: drawBus(ctx, L, W, id); break;
    case 6: drawTruck(ctx, L, W, id); break;
    case 8: drawFireTruck(ctx, L, W, nowMs); break;
    default: fallbackBody(ctx, L, W, '#8a93a0');
  }
}

function fallbackBody(ctx: CanvasRenderingContext2D, L: number, W: number, color: string) {
  ctx.fillStyle = color;
  rr(ctx, -L / 2, -W / 2, L, W, W * 0.3); ctx.fill();
  ctx.fillStyle = GLASS;
  rr(ctx, L * 0.08, -W * 0.36, L * 0.16, W * 0.72, 2); ctx.fill();
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
