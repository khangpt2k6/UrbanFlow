import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { makeView, screenToWorld, type View } from './layout';
import { drawDynamic, drawStatic } from './draw';
import type { Playout } from './playout';
import type { CameraController } from './camera';
import { loadSprites, onSpritesReady } from './sprites';

interface Props {
  playoutRef: MutableRefObject<Playout>;
  camera: CameraController;
  /** Receives the measured render rate about twice a second. */
  onFps?: (fps: number) => void;
}

interface StaticCache {
  canvas: HTMLCanvasElement;
  scale: number;
  cx: number; // view origin the cache was drawn with (in cache pixels, margin included)
  cy: number;
  margin: number;
  drawnAt: number;
}

/**
 * Renders the world at the display's frame rate. Two layers:
 *  - a STATIC layer (roads, city, parked cars) drawn into an oversized offscreen canvas and only
 *    redrawn when the camera zooms or pans past its margin; while a zoom is still easing, the old
 *    cache is scaled instead, and the crisp redraw happens once the camera settles;
 *  - a DYNAMIC layer (vehicles, walkers, signals) drawn every frame from the jitter buffer.
 * Reads only refs and the camera controller, so new snapshots never re-render React.
 */
export default function CanvasView({ playoutRef, camera, onFps }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fpsRef = useRef(onFps);
  useEffect(() => { fpsRef.current = onFps; }, [onFps]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    loadSprites();

    let raf = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let cache: StaticCache | null = null;
    let lastFrame = performance.now();
    let frames = 0, fpsWindow = lastFrame;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = Math.floor(parent.clientWidth * dpr);
      canvas.height = Math.floor(parent.clientHeight * dpr);
      canvas.style.width = `${parent.clientWidth}px`;
      canvas.style.height = `${parent.clientHeight}px`;
      cache = null;
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    const offReady = onSpritesReady(() => { cache = null; });

    const viewNow = (): View => makeView(canvas.width, canvas.height, 12 * dpr, camera.current);

    const renderStatic = (view: View, now: number) => {
      const margin = Math.round(Math.max(canvas.width, canvas.height) * 0.25);
      const c = cache?.canvas.width === canvas.width + 2 * margin ? cache.canvas : document.createElement('canvas');
      c.width = canvas.width + 2 * margin;
      c.height = canvas.height + 2 * margin;
      const g = c.getContext('2d')!;
      const shifted: View = { scale: view.scale, cx: view.cx + margin, cy: view.cy + margin };
      drawStatic(g, shifted, c.width, c.height, dpr);
      cache = { canvas: c, scale: view.scale, cx: shifted.cx, cy: shifted.cy, margin, drawnAt: now };
    };

    const blitStatic = (view: View, now: number, moving: boolean) => {
      const sameScale = cache && Math.abs(cache.scale - view.scale) < 1e-6;
      const inMargin = cache && Math.abs(view.cx + cache.margin - cache.cx) <= cache.margin && Math.abs(view.cy + cache.margin - cache.cy) <= cache.margin;
      if (!cache || (sameScale && !inMargin) || (!sameScale && (!moving || now - cache.drawnAt > 140))) {
        renderStatic(view, now);
      }
      const k = view.scale / cache!.scale;
      ctx.drawImage(cache!.canvas, view.cx - cache!.cx * k, view.cy - cache!.cy * k, cache!.canvas.width * k, cache!.canvas.height * k);
    };

    const frame = () => {
      const now = performance.now();
      const dt = Math.min(100, now - lastFrame);
      lastFrame = now;
      const moving = camera.step(dt);
      const view = viewNow();
      ctx.fillStyle = '#0a1120'; // a zoom-out frame may scale the cache smaller than the screen
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      blitStatic(view, now, moving);
      const f = playoutRef.current.sample(now);
      if (f) drawDynamic(ctx, view, f.vehicles, f.pedestrians, f.signals, now);
      frames++;
      if (now - fpsWindow > 500) {
        fpsRef.current?.((frames * 1000) / (now - fpsWindow));
        frames = 0;
        fpsWindow = now;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // ---- input: wheel zooms around the cursor, drag pans, double-click resets
    const toWorld = (e: { clientX: number; clientY: number }) => {
      const r = canvas.getBoundingClientRect();
      return screenToWorld((e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr, makeView(canvas.width, canvas.height, 12 * dpr, camera.target));
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const [wx, wy] = toWorld(e);
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      camera.zoomAt(Math.exp(-delta * 0.0016), wx, wy);
    };
    let drag: { x: number; y: number; id: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add('grabbing');
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const view = makeView(canvas.width, canvas.height, 12 * dpr, camera.target);
      const dx = ((e.clientX - drag.x) * dpr) / view.scale;
      const dy = ((e.clientY - drag.y) * dpr) / view.scale;
      drag.x = e.clientX;
      drag.y = e.clientY;
      camera.panBy(-dx, dy);
    };
    const onUp = (e: PointerEvent) => {
      if (drag && e.pointerId === drag.id) {
        drag = null;
        canvas.classList.remove('grabbing');
      }
    };
    const onDbl = () => camera.reset();
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('dblclick', onDbl);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      offReady();
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('dblclick', onDbl);
    };
  }, [playoutRef, camera]);

  return <canvas ref={canvasRef} className="traffic-canvas" />;
}
