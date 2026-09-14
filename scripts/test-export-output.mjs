import test from 'node:test';
import assert from 'node:assert/strict';
import { exportFixture } from './export-fixture.mjs';

test('all nine anchors honor zero for top/left, with and without fitting', () => {
  const { c } = exportFixture();
  const bounds = { x: -35, y: 28, w: 300, h: 120 };
  for (const fit of [false, true]) for (const [row, ay] of [['t',0],['c',.5],['b',1]]) for (const [col, ax] of [['l',0],['c',.5],['r',1]]) {
    Object.assign(c.params, { fit, anchor: row + col, abW: 900, abH: 700, marginPct: 10 });
    const L = c.exportLayout(bounds), margin = 70, s = fit ? 760 / 300 : 1;
    assert.equal(L.dx + bounds.x * s, margin + (760 - 300 * s) * ax, row + col + ' horizontal');
    assert.equal(L.dy + bounds.y * s, margin + (560 - 120 * s) * ay, row + col + ' vertical');
  }
});

test('long-form preview fits its pixel budget even below five percent; final scale stays explicit', () => {
  const { c } = exportFixture();
  for (const ios of [false, true]) for (const [w,h] of [[500000,300], [900,500000], [100000,100000]]) {
    c.isIOS = ios;
    const s = c.previewScaleForLayout(w, h, 8);
    assert.ok(s > 0 && s < .05);
    assert.ok(Math.round(w * s) <= (ios ? 1600 : 2048));
    assert.ok(Math.round(h * s) <= (ios ? 1600 : 2048));
    assert.ok(Math.round(w * s) * Math.round(h * s) <= (ios ? 2200000 : 4000000));
    assert.equal(c.params.exportScale, 1);
  }
});

test('invalid raster dimensions fail before allocation, not as a blank successful image', () => {
  const { c, allocations } = exportFixture();
  for (const [w,h,s] of [[NaN,10,1],[10,Infinity,1],[-1,10,1],[0,10,1],[10,10,0]]) {
    assert.throws(() => c.createSafeCanvas(w,h,s), /サイズ|寸法/);
  }
  assert.equal(allocations(), 0);
});

test('SVG with raster FX enforces canvas bounds and reports failure without incomplete downloads', () => {
  const { c, downloads, statuses } = exportFixture(); c.setSource('本文');
  const scene = c.snapshotRenderableScene(); c.snapshotRenderableScene = () => scene;
  c.params.abW = 20000; c.surfaceAnyEffectPresent = () => true;
  let allocations = 0;
  c.document.createElement = () => { allocations++; return { getContext: () => null }; };
  c.runSvgExport();
  assert.equal(downloads.length, 0); assert.equal(statuses.at(-1).state, 'error');
  assert.match(statuses.at(-1).message, /SVG.*(上限|サイズ)/);
  assert.equal(allocations, 0, 'must preflight, not attempt a huge Canvas');
});

test('IME-in-progress export is blocked instead of capturing a stale source revision', () => {
  const { c, downloads, statuses } = exportFixture(); c.setSource('本文'); c.textComposing = true;
  c.exportPng(); c.runSvgExport();
  assert.equal(downloads.length, 0); assert.match(statuses.at(-1).message, /確定/);
});

test('pure-vector SVG remains available beyond raster limits, and context failure never omits FX silently', async () => {
  const { c, downloads, statuses } = exportFixture(); c.setSource('A<&本文');
  const scene = c.snapshotRenderableScene(); c.snapshotRenderableScene = () => scene;
  c.params.abW = 20000;
  c.document.createElement = () => { throw Error('Vector SVG must not allocate a Canvas'); };
  c.runSvgExport(); assert.equal(downloads.length, 1);
  const svg = await downloads[0].blob.text();
  assert.match(svg, /width="20000"/); assert.match(svg, /&lt;/); assert.match(svg, /&amp;/);
  c.params.abW = 100; c.params.abH = 100; c.surfaceAnyEffectPresent = () => true;
  c.document.createElement = () => ({ getContext: () => null });
  c.runSvgExport(); assert.equal(downloads.length, 1);
  assert.equal(statuses.at(-1).state, 'error'); assert.match(statuses.at(-1).message, /Canvas/);
});

test('size inspection reports raster SVG limits and clipping without allocating output or changing settings', () => {
  const { c, downloads, statuses, allocations } = exportFixture(); c.setSource('本文');
  const scene = c.snapshotRenderableScene(); c.snapshotRenderableScene = () => scene;
  Object.assign(c.params, { abW: 20000, abH: 100, exportScale: 8, fit: false });
  c.surfaceAnyEffectPresent = () => true;
  const before = JSON.stringify(c.params), count = allocations(); c.inspectExport();
  assert.equal(allocations(), count); assert.equal(downloads.length, 0);
  assert.equal(JSON.stringify(c.params), before); assert.equal(statuses.at(-1).state, 'error');
  assert.match(statuses.at(-1).message, /SVGのFX/);
  Object.assign(c.params, { abW: 16, abH: 16, exportScale: 1 });
  c.inspectExport(); assert.match(statuses.at(-1).message, /切れます/);
});
