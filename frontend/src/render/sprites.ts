// Top-down vehicle sprites (CC0, Unlucky Studio - see public/vehicles/LICENSE.txt).
//
// Each PNG is loaded once, then baked into ready-to-draw variants:
//  - recoloured copies (the painted body is re-hued pixel by pixel, glass/tyres/chrome untouched),
//    so one sedan gives a realistic mix of white, black, silver, blue and red traffic;
//  - a small mip chain (full, 1/2, 1/4), picked by on-screen size, so a 214 px sprite shrunk to
//    40 px stays crisp instead of shimmering;
//  - a blurred silhouette used as a soft ground shadow.
// Sprites point UP (nose at -y) in the source; drawSprite rotates them into the renderer's local
// frame where the vehicle points +x.

export type SpriteName =
  | 'sedan' | 'coupe' | 'taxi' | 'sport' | 'police' | 'pickup' | 'van' | 'truck_cab'
  | 'ambulance1' | 'ambulance2' | 'ambulance3';

const NAMES: SpriteName[] = [
  'sedan', 'coupe', 'taxi', 'sport', 'police', 'pickup', 'van', 'truck_cab',
  'ambulance1', 'ambulance2', 'ambulance3',
];

/** Paint finishes. `null` keeps the sprite's own colour. */
export type Paint = 'white' | 'pearl' | 'silver' | 'graphite' | 'black' | 'blue' | 'navy' | 'red' | 'green' | 'sand' | null;

interface PaintSpec { h?: number; s: number; l: (l: number) => number }
const PAINTS: Record<Exclude<Paint, null | 'red'>, PaintSpec> = {
  white: { s: 0.02, l: (l) => 0.66 + l * 0.5 },
  pearl: { h: 40, s: 0.12, l: (l) => 0.6 + l * 0.48 },
  silver: { h: 215, s: 0.05, l: (l) => 0.44 + l * 0.55 },
  graphite: { h: 215, s: 0.06, l: (l) => 0.2 + l * 0.42 },
  black: { h: 220, s: 0.08, l: (l) => 0.06 + l * 0.32 },
  blue: { h: 214, s: 0.62, l: (l) => 0.1 + l * 0.85 },
  navy: { h: 224, s: 0.5, l: (l) => 0.06 + l * 0.55 },
  green: { h: 158, s: 0.34, l: (l) => 0.08 + l * 0.6 },
  sand: { h: 36, s: 0.3, l: (l) => 0.3 + l * 0.6 },
};

export interface BakedSprite {
  levels: HTMLCanvasElement[]; // mip chain, largest first
  shadow: HTMLCanvasElement;
  shadowPad: number; // px of padding around the silhouette in `shadow`, at level-0 scale
  w: number; // level-0 size in px
  h: number;
}

const images = new Map<SpriteName, HTMLImageElement>();
const baked = new Map<string, BakedSprite>();
const listeners = new Set<() => void>();
let loadStarted = false;
let ready = false;

export function spritesReady(): boolean {
  return ready;
}

/** Call fn once every sprite has loaded (immediately if they already have). Returns an unsubscribe. */
export function onSpritesReady(fn: () => void): () => void {
  if (ready) {
    fn();
    return () => {};
  }
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function loadSprites() {
  if (loadStarted || typeof Image === 'undefined') return;
  loadStarted = true;
  let pending = NAMES.length;
  for (const n of NAMES) {
    const img = new Image();
    img.decoding = 'async';
    img.onload = img.onerror = () => {
      if (img.naturalWidth > 0) images.set(n, img);
      if (--pending === 0) {
        ready = true;
        for (const fn of listeners) fn();
        listeners.clear();
      }
    };
    img.src = `${import.meta.env.BASE_URL}vehicles/${n}.png`;
  }
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h: number;
  if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [r + m, g + m, b + m];
}

// Re-hue the painted body: only strongly saturated pixels are paint (glass, tyres, chrome and
// lights are grey or tiny), so swapping their hue/saturation while mapping their lightness keeps
// every highlight and panel line of the original artwork.
function recolor(src: HTMLCanvasElement, paint: Paint) {
  if (!paint || paint === 'red') return;
  const spec = PAINTS[paint];
  const ctx = src.getContext('2d')!;
  const img = ctx.getImageData(0, 0, src.width, src.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 10) continue;
    const [h, s, l] = rgbToHsl(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
    if (s < 0.38 || l < 0.08) continue;
    const nl = Math.min(0.97, Math.max(0, spec.l(l)));
    const [r, g, b] = hslToRgb(spec.h ?? h, spec.s, nl);
    d[i] = r * 255; d[i + 1] = g * 255; d[i + 2] = b * 255;
  }
  ctx.putImageData(img, 0, 0);
}

function bake(name: SpriteName, paint: Paint): BakedSprite | null {
  const img = images.get(name);
  if (!img) return null;
  const w = img.naturalWidth, h = img.naturalHeight;
  const base = canvas(w, h);
  base.getContext('2d')!.drawImage(img, 0, 0);
  recolor(base, paint);
  // mip chain by successive halving (each step a clean 2:1 box filter)
  const levels = [base];
  while (levels.length < 3) {
    const prev = levels[levels.length - 1];
    const next = canvas(prev.width / 2, prev.height / 2);
    const c = next.getContext('2d')!;
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(prev, 0, 0, next.width, next.height);
    levels.push(next);
  }
  // soft shadow: a blurred black silhouette at half resolution (it is blurry anyway)
  const pad = 14;
  const sh = canvas(w / 2 + pad, h / 2 + pad);
  const sc = sh.getContext('2d')!;
  sc.filter = 'blur(3px)';
  sc.drawImage(levels[1], pad / 2, pad / 2);
  sc.filter = 'none';
  sc.globalCompositeOperation = 'source-in';
  sc.fillStyle = '#000';
  sc.fillRect(0, 0, sh.width, sh.height);
  return { levels, shadow: sh, shadowPad: pad, w, h };
}

export function getSprite(name: SpriteName, paint: Paint = null): BakedSprite | null {
  if (!ready) return null;
  const key = `${name}:${paint ?? '-'}`;
  let b = baked.get(key);
  if (b === undefined) {
    const made = bake(name, paint);
    if (!made) return null;
    b = made;
    baked.set(key, b);
  }
  return b;
}

/**
 * Draw a sprite in the vehicle's local frame (nose +x, centred on the origin), stretched to L
 * along the travel axis and W across it. The mip level is picked from the on-screen length.
 */
export function drawSprite(ctx: CanvasRenderingContext2D, s: BakedSprite, L: number, W: number) {
  let lvl = s.levels[0];
  for (const c of s.levels) if (c.height >= L * 1.1) lvl = c;
  ctx.save();
  ctx.rotate(Math.PI / 2);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(lvl, -W / 2, -L / 2, W, L);
  ctx.restore();
}

/** Ground shadow for a sprite, same local frame as drawSprite. */
export function drawSpriteShadow(ctx: CanvasRenderingContext2D, s: BakedSprite, L: number, W: number, alpha: number) {
  const kx = W / (s.w / 2), ky = L / (s.h / 2);
  const pw = (s.shadowPad / 2) * kx, ph = (s.shadowPad / 2) * ky;
  ctx.save();
  ctx.rotate(Math.PI / 2);
  ctx.globalAlpha *= alpha;
  ctx.drawImage(s.shadow, -W / 2 - pw, -L / 2 - ph, W + 2 * pw, L + 2 * ph);
  ctx.restore();
}
