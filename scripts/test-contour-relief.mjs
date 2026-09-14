import test from 'node:test';
import assert from 'node:assert/strict';
import { canvas, textMask, createContourFixture } from './contour-relief-fixture.mjs';

canvas.GlobalFonts.registerFromPath('C:/Windows/Fonts/yumin.ttf', 'Contour Test Yu Mincho');

function alphaData(surface) {
  return surface.getContext('2d', { willReadFrequently: true })
    .getImageData(0, 0, surface.width, surface.height).data;
}

function countAlpha(surface) {
  const data = alphaData(surface);
  let count = 0;
  for (let index = 3; index < data.length; index += 4) if (data[index]) count++;
  return count;
}

function edgeAlpha(surface) {
  const data = alphaData(surface);
  let total = 0;
  for (let x = 0; x < surface.width; x++) {
    total += data[(x * 4) + 3];
    total += data[(((surface.height - 1) * surface.width + x) * 4) + 3];
  }
  for (let y = 1; y + 1 < surface.height; y++) {
    total += data[(y * surface.width * 4) + 3];
    total += data[((y * surface.width + surface.width - 1) * 4) + 3];
  }
  return total;
}

function fieldFor(mask, fixture) {
  const source = mask.getContext('2d', { willReadFrequently: true })
    .getImageData(0, 0, mask.width, mask.height);
  return { source, field: fixture.surfaceBoundaryDistance(source.data, mask.width, mask.height) };
}

test('smoothed signed relief is deterministic and cannot swap source topology', () => {
  const mask = textMask('B&O', 180, 'Times New Roman', 520, 360);
  const fixture = createContourFixture(mask);
  const { field } = fieldFor(mask, fixture);
  const first = fixture.contourReliefFieldV57(field, mask.width, mask.height);
  const second = fixture.contourReliefFieldV57(field, mask.width, mask.height);
  assert.equal(first.smoothed, true);
  assert.deepEqual(first.values, second.values);
  for (let index = 0; index < field.inside.length; index += 97) {
    assert.equal(first.values[index] > 0, !!field.inside[index]);
  }
});

test('hachures are source-field normal marks with deterministic hard budgets', () => {
  const mask = textMask('B&O', 180, 'Times New Roman', 520, 360);
  const fixture = createContourFixture(mask, { contourRelief: 2.2, contourDrift: 1.1 });
  const { field } = fieldFor(mask, fixture);
  const topology = fixture.surfaceVoidTopology(field, mask.width, mask.height);
  const surface = fixture.contourReliefFieldV57(field, mask.width, mask.height);
  const args = [surface, field, topology, mask.width, mask.height, 84, 7, 1.2, 1.1, 2.2, 0.25, 41, 37];
  const first = fixture.contourReliefHachuresV57(...args);
  const second = fixture.contourReliefHachuresV57(...args);
  assert.deepEqual(first, second);
  assert.ok(first.length > 8 && first.length <= 37);
  for (const mark of first) {
    assert.ok(Number.isFinite(mark.x + mark.y + mark.nx + mark.ny + mark.length + mark.width + mark.alpha));
    assert.ok(Math.abs(Math.hypot(mark.nx, mark.ny) - 1) < 1e-6);
    assert.ok(mark.length >= 3 && mark.length <= 120);
    assert.ok(mark.alpha > 0 && mark.alpha <= 0.96);
  }
});

test('counter ticks originate only in enclosed source voids and point inward', () => {
  const mask = textMask('B&O', 210, 'Times New Roman', 600, 420);
  const fixture = createContourFixture(mask, { contourRelief: 2.4 });
  const { field } = fieldFor(mask, fixture);
  const topology = fixture.surfaceVoidTopology(field, mask.width, mask.height);
  const surface = fixture.contourReliefFieldV57(field, mask.width, mask.height);
  const ticks = fixture.contourReliefCounterTicksV57(surface, field, topology,
    mask.width, mask.height, 7, 1.2, 2.4, 41, 256);
  assert.ok(topology.components.length >= 3);
  assert.ok(ticks.length >= 12 && ticks.length <= 256);
  for (const tick of ticks) {
    const index = Math.round(tick.y) * mask.width + Math.round(tick.x);
    assert.equal(topology.counter[index], 1);
    const component = topology.components.find(item => tick.x >= item.minX && tick.x <= item.maxX
      && tick.y >= item.minY && tick.y <= item.maxY);
    assert.ok(component);
    assert.ok(tick.nx * (component.x - tick.x) + tick.ny * (component.y - tick.y) >= -1e-7);
  }
});

test('relief has an exact closed phase, visible motion, and nonblank small type', () => {
  const largeMask = textMask('RIFT', 180, 'Arial Black', 620, 420);
  const fixture = createContourFixture(largeMask, { contourRelief: 2, contourDrift: 1.2 });
  const zero = fixture.render('relief', 1, 0).toBuffer('image/png');
  const quarter = fixture.render('relief', 1, 0.25).toBuffer('image/png');
  const one = fixture.render('relief', 1, 1).toBuffer('image/png');
  assert.deepEqual(zero, one);
  assert.notDeepEqual(zero, quarter);
  const smallMask = textMask('terrain', 52, 'Georgia', 480, 300);
  const small = createContourFixture(smallMask, { contourSpacing: 4, contourStroke: 0.8 }).render('relief');
  assert.ok(countAlpha(small) > 500);
  assert.equal(edgeAlpha(small), 0);
});

test('declared extremes stay finite, bounded, and do not mutate the source mask', () => {
  const mask = textMask('地形', 190, 'Contour Test Yu Mincho', 720, 520);
  const before = Buffer.from(alphaData(mask));
  const fixture = createContourFixture(mask, {
    contourBands: 64,
    contourSpacing: 40,
    contourStroke: 14,
    contourDrift: 6,
    contourRelief: 4
  });
  const output = fixture.render('relief', 1, 0.73);
  assert.ok(countAlpha(output) > 1000);
  assert.equal(edgeAlpha(output), 0);
  assert.deepEqual(Buffer.from(alphaData(mask)), before);
});

test('legacy and existing modern modes remain routed away from relief', () => {
  const mask = textMask('MAP', 140, 'Arial Black', 520, 360);
  const fixture = createContourFixture(mask);
  assert.ok(fixture.BATCH_PARAM_OPTIONS.contourGrammar.includes('relief'));
  fixture.renderContourReliefV57 = () => { throw new Error('relief should not run'); };
  for (const mode of ['legacy', 'isobars', 'index', 'terraces', 'watershed']) {
    assert.ok(countAlpha(fixture.render(mode)) > 0, mode);
  }
});
