// Rooftop "sign boards" for the city's flagship towers, so the blocks read like a San Francisco
// tech street: Figma, Notion, Rippling and a few neighbours. The three named brands use their real
// logo art from /public; the neighbours are simple, recognisable canvas vector marks. Each sits on
// a rounded tile centred on a roof.

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// Preload a public image once; canvas draws it as soon as it has decoded.
function load(src: string): HTMLImageElement | undefined {
  if (typeof Image === 'undefined') return undefined; // guard non-DOM (tests)
  const img = new Image();
  img.src = src;
  return img;
}

function imgReady(img?: HTMLImageElement): img is HTMLImageElement {
  return !!img && img.complete && img.naturalWidth > 0;
}

// Fit the whole image inside the tile (with padding), preserving aspect ratio - for marks on a
// transparent background (Figma, Notion).
function drawContain(ctx: CanvasRenderingContext2D, img: HTMLImageElement, size: number, pad: number) {
  const box = size - pad * 2;
  const s = Math.min(box / img.naturalWidth, box / img.naturalHeight);
  const w = img.naturalWidth * s, h = img.naturalHeight * s;
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
}

// Fill the (clipped) tile with the image - for art that already carries its own square background
// (Rippling's purple block).
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, size: number) {
  const s = Math.max(size / img.naturalWidth, size / img.naturalHeight);
  const w = img.naturalWidth * s, h = img.naturalHeight * s;
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
}

// ----------------------------------------------------------------- vector marks (the neighbours)
function letter(ctx: CanvasRenderingContext2D, ch: string, m: number, color: string) {
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${m * 1.2}px 'Baloo 2', system-ui, sans-serif`;
  ctx.fillText(ch, 0, m * 0.05);
}

function slack(ctx: CanvasRenderingContext2D, m: number) {
  const colors = ['#36c5f0', '#2eb67d', '#ecb22e', '#e01e5a'];
  const t = m * 0.2, len = m * 0.4, g = m * 0.06;
  for (let k = 0; k < 4; k++) {
    ctx.save();
    ctx.rotate((k * Math.PI) / 2);
    ctx.fillStyle = colors[k];
    roundRectPath(ctx, g, -g - t, len, t, t / 2); ctx.fill();   // outer bar
    roundRectPath(ctx, g, -g, t, len - t, t / 2); ctx.fill();   // inner spoke (the hook)
    ctx.restore();
  }
}

function stripe(ctx: CanvasRenderingContext2D, m: number) {
  letter(ctx, 'S', m, '#ffffff');
}

function airbnb(ctx: CanvasRenderingContext2D, m: number) {
  // the "Belo" loop, approximated as a symmetric looped outline pointing down
  const s = m * 0.42;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = m * 0.16;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, s);
  ctx.bezierCurveTo(-s * 1.5, -s * 0.2, -s * 0.95, -s * 1.25, 0, -s * 0.5);
  ctx.bezierCurveTo(s * 0.95, -s * 1.25, s * 1.5, -s * 0.2, 0, s);
  ctx.stroke();
}

interface Brand {
  bg: string;
  img?: HTMLImageElement;
  fit?: 'contain' | 'cover';
  draw?: (ctx: CanvasRenderingContext2D, m: number) => void;
}

const BRANDS: Record<string, Brand> = {
  figma: { bg: '#ffffff', img: load('/figma.png'), fit: 'contain' },
  notion: { bg: '#ffffff', img: load('/Notion-logo.svg.png'), fit: 'contain' },
  rippling: { bg: '#7a0061', img: load('/rippling.png'), fit: 'cover' },
  slack: { bg: '#ffffff', draw: slack },
  stripe: { bg: '#635bff', draw: stripe },
  airbnb: { bg: '#ff5a5f', draw: airbnb },
};

// Order = priority for the flagship slots nearest the crossing (the three real logos go first).
export const COMPANY_KEYS = ['figma', 'notion', 'rippling', 'slack', 'stripe', 'airbnb'];

/** Draw a company sign board centred at (cx, cy) on the roof, `size` px on a side. */
export function drawCompanyLogo(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, key: string) {
  const b = BRANDS[key];
  if (!b) return;
  ctx.save();
  ctx.translate(cx, cy);
  const half = size / 2;
  const rad = size * 0.24;

  // soft shadow under the sign
  ctx.fillStyle = 'rgba(12,18,28,0.30)';
  roundRectPath(ctx, -half + 1.5, -half + 2.5, size, size, rad); ctx.fill();

  const ready = imgReady(b.img);
  if (ready && b.fit === 'cover') {
    ctx.save();
    roundRectPath(ctx, -half, -half, size, size, rad); ctx.clip();
    drawCover(ctx, b.img!, size);
    ctx.restore();
  } else {
    ctx.fillStyle = b.bg;
    roundRectPath(ctx, -half, -half, size, size, rad); ctx.fill();
    if (ready) drawContain(ctx, b.img!, size, size * 0.16);
    else if (b.draw) b.draw(ctx, size * 0.6);
  }

  // hairline rim on top
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.strokeStyle = b.bg === '#ffffff' ? 'rgba(20,24,32,0.12)' : 'rgba(255,255,255,0.22)';
  roundRectPath(ctx, -half + 1, -half + 1, size - 2, size - 2, rad - 1); ctx.stroke();
  ctx.restore();
}
