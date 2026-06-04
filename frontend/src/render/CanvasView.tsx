import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { WorldSnapshot } from '../types/snapshot';
import { makeView } from './layout';
import { interpolateVehicles } from './interpolate';
import { drawScene } from './draw';

interface Props {
  latestRef: MutableRefObject<WorldSnapshot | null>;
  prevRef: MutableRefObject<WorldSnapshot | null>;
  lastArrivalRef: MutableRefObject<number>;
  intervalRef: MutableRefObject<number>;
}

/**
 * Renders the world on a canvas at the display's frame rate, interpolating between the two most
 * recent snapshots so motion looks smooth even though the network feed is ~30 Hz. Reads only
 * refs, so new snapshots never re-render React.
 */
export default function CanvasView({ latestRef, prevRef, lastArrivalRef, intervalRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const frame = () => {
      const w = canvas.width;
      const h = canvas.height;
      const view = makeView(w, h, 12 * dpr);
      const latest = latestRef.current;
      const prev = prevRef.current;
      const now = performance.now();
      const alpha = Math.max(0, Math.min(1, (now - lastArrivalRef.current) / intervalRef.current));
      const vehicles = latest
        ? interpolateVehicles(prev?.vehicles ?? null, latest.vehicles, alpha)
        : [];
      drawScene(ctx, view, w, h, vehicles, latest?.signals ?? null, now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [latestRef, prevRef, lastArrivalRef, intervalRef]);

  return <canvas ref={canvasRef} className="traffic-canvas" />;
}
