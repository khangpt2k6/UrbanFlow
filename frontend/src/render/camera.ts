import { DEFAULT_ZOOM, FIT_ZOOM, MAX_ZOOM, MIN_ZOOM, clampCamera, type Camera } from './layout';

/**
 * Shared camera state between the canvas (wheel / drag input, per-frame easing) and the React
 * zoom toolbar. `target` is where input wants the camera; `current` eases toward it every frame,
 * so zooming and the toolbar buttons glide instead of jumping.
 */
export class CameraController {
  target: Camera = { zoom: DEFAULT_ZOOM, x: 0, y: 0 };
  current: Camera = { ...this.target };
  private listeners = new Set<(c: Camera) => void>();

  subscribe(fn: (c: Camera) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn(this.target);
  }

  set(c: Camera, immediate = false) {
    this.target = clampCamera(c);
    if (immediate) this.current = { ...this.target };
    this.emit();
  }

  /** Zoom by `factor`, keeping world point (ax, ay) fixed under the cursor. */
  zoomAt(factor: number, ax: number, ay: number) {
    const t = this.target;
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, t.zoom * factor));
    const k = t.zoom / zoom;
    this.set({ zoom, x: ax + (t.x - ax) * k, y: ay + (t.y - ay) * k });
  }

  zoomBy(factor: number) {
    this.zoomAt(factor, this.target.x, this.target.y);
  }

  panBy(dxWorld: number, dyWorld: number) {
    const t = this.target;
    // panning moves both, so a drag tracks the pointer 1:1 with no easing lag
    this.set({ ...t, x: t.x + dxWorld, y: t.y + dyWorld });
    this.current = { ...this.current, x: this.target.x, y: this.target.y };
  }

  reset() {
    this.set({ zoom: DEFAULT_ZOOM, x: 0, y: 0 });
  }

  fitAll() {
    this.set({ zoom: FIT_ZOOM, x: 0, y: 0 });
  }

  /** Advance the easing; returns true while the camera is still moving. */
  step(dtMs: number): boolean {
    const a = 1 - Math.exp(-dtMs / 70);
    const c = this.current, t = this.target;
    const z = c.zoom + (t.zoom - c.zoom) * a;
    const x = c.x + (t.x - c.x) * a;
    const y = c.y + (t.y - c.y) * a;
    const settled = Math.abs(t.zoom - z) < 1e-4 * t.zoom && Math.abs(t.x - x) < 1e-3 && Math.abs(t.y - y) < 1e-3;
    this.current = settled ? { ...t } : { zoom: z, x, y };
    return !settled;
  }
}
