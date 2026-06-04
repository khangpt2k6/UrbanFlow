import { describe, it, expect } from 'vitest';
import { makeView, worldToScreen, WORLD_SPAN } from '../src/render/layout';

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

  it('fits the full world span within the smaller canvas dimension', () => {
    const view = makeView(600, 600, 24);
    const [right] = worldToScreen(WORLD_SPAN / 2, 0, view);
    expect(right).toBeLessThanOrEqual(600);
    expect(right).toBeGreaterThan(300);
  });
});
