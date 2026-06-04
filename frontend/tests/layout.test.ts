import { describe, it, expect } from 'vitest';
import { makeView, worldToScreen, VIEW_SPAN, WORLD_SPAN } from '../src/render/layout';

describe('layout', () => {
  it('maps the world origin to the canvas center', () => {
    const view = makeView(800, 600);
    const [x, y] = worldToScreen(0, 0, view);
    expect(x).toBeCloseTo(400);
    expect(y).toBeCloseTo(300);
  });

  it('flips the y axis (world +y is up, screen y is down)', () => {
    const view = makeView(800, 800);
    const [, yUp] = worldToScreen(0, 10, view);
    const [, yDown] = worldToScreen(0, -10, view);
    expect(yUp).toBeLessThan(yDown);
  });

  it('fits the focused view span and zooms in past the full world', () => {
    const view = makeView(600, 600, 0);
    // The focused viewport edge lands at the canvas edge (the view fills the canvas).
    const [viewEdge] = worldToScreen(VIEW_SPAN / 2, 0, view);
    expect(viewEdge).toBeCloseTo(600, 0);
    // The far edge of the full world is intentionally off-canvas (we are zoomed in).
    const [worldEdge] = worldToScreen(WORLD_SPAN / 2, 0, view);
    expect(worldEdge).toBeGreaterThan(600);
  });
});
