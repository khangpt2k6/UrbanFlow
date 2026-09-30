// Cheap light glows. Canvas shadowBlur re-blurs every shape on every frame, which was the main
// source of dropped frames with ~20 lit lamps and a queue of brake lights. Instead each colour gets
// a small pre-rendered radial falloff once, and a glow is just one scaled drawImage.
const cache = new Map<string, HTMLCanvasElement>();

function sprite(color: string): HTMLCanvasElement | null {
  let c = cache.get(color);
  if (c) return c;
  if (typeof document === 'undefined') return null;
  c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, color);
  grad.addColorStop(0.35, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = 1;
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  // fade the flat inner disc into the falloff
  const img = g.getImageData(0, 0, 64, 64);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = Math.round(img.data[i] * 0.55);
  g.putImageData(img, 0, 0);
  cache.set(color, c);
  return c;
}

/** Soft glow of radius r centred on (x, y) in the current transform. */
export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 1) {
  const s = sprite(color);
  if (!s || alpha <= 0) return;
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * alpha;
  ctx.drawImage(s, x - r, y - r, 2 * r, 2 * r);
  ctx.globalAlpha = a;
}
