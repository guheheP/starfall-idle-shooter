import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseRenderViewport, useCompactHull, MAX_RENDER_PIXELS } from '../src/game/render-quality';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../src/game/types';

test('a high-density phone retains CSS size while drawing twice as many pixels per axis', () => {
  const phone = chooseRenderViewport(390, 700, 3);
  assert.equal(phone.backingWidth, 780);
  assert.equal(phone.backingHeight, 1400);
  assert.equal(phone.backingWidth * phone.scaleZoom, 390);
  assert.equal(phone.backingHeight * phone.scaleZoom, 700);
  assert.equal(chooseRenderViewport(390, 700, 1).pixelRatio, 1);
});

test('large desktop displays stay within the rendering pixel budget', () => {
  for (const [width, height, density] of [[1920, 1080, 2], [3840, 2160, 2], [3440, 1440, 1.25]]) {
    const viewport = chooseRenderViewport(width, height, density);
    assert.ok(viewport.backingWidth * viewport.backingHeight <= MAX_RENDER_PIXELS);
    assert.ok(Math.abs(viewport.backingWidth * viewport.scaleZoom - width) < 2);
    assert.ok(Math.abs(viewport.backingHeight * viewport.scaleZoom - height) < 2);
    assert.ok(viewport.pixelRatio > 0 && viewport.pixelRatio <= 2);
  }
});

test('invalid sizes and density never produce an unusable canvas', () => {
  for (const invalid of [0, -2, NaN, Infinity, -Infinity]) {
    const viewport = chooseRenderViewport(invalid, invalid, invalid);
    assert.equal(viewport.backingWidth, 1);
    assert.equal(viewport.backingHeight, 1);
    assert.equal(viewport.scaleZoom, 1);
  }
  assert.equal(chooseRenderViewport(390, 700, .5).pixelRatio, 1);
});

test('display density changes preserve the camera world point for the same touch', () => {
  const width = 390, height = 700;
  const cssWorldZoom = Math.min(width / WORLD_WIDTH, height / WORLD_HEIGHT);
  for (const density of [1, 1.25, 2, 3]) {
    const viewport = chooseRenderViewport(width, height, density);
    const displayedWidth = viewport.backingWidth * viewport.scaleZoom;
    const displayedHeight = viewport.backingHeight * viewport.scaleZoom;
    const backingZoom = Math.min(viewport.backingWidth / WORLD_WIDTH, viewport.backingHeight / WORLD_HEIGHT);
    const expectedX = WORLD_WIDTH / 2 + (width * .73 - width / 2) / cssWorldZoom;
    const expectedY = WORLD_HEIGHT / 2 + (height * .61 - height / 2) / cssWorldZoom;
    const worldX = WORLD_WIDTH / 2 + (displayedWidth * .73 / viewport.scaleZoom - viewport.backingWidth / 2) / backingZoom;
    const worldY = WORLD_HEIGHT / 2 + (displayedHeight * .61 / viewport.scaleZoom - viewport.backingHeight / 2) / backingZoom;
    assert.ok(Math.abs(worldX - expectedX) < 1);
    assert.ok(Math.abs(worldY - expectedY) < 1);
  }
});

test('compact hull details depend on visible scale rather than native pixel density', () => {
  assert.equal(useCompactHull(.54), true);
  assert.equal(useCompactHull(.699), true);
  assert.equal(useCompactHull(.7), false);
  assert.equal(useCompactHull(1), false);
  assert.equal(useCompactHull(NaN), true);
});
