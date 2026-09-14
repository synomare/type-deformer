// Actual Gutter Fugue editor functions with synthetic DOM geometry.
// This verifies state/layout integration, not browser or device rendering.
import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { fixture, metric, html, extract } from './paragraph-current-fixture.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
const styleNumber = (metric, key, fallback = 0) => {
  const value = parseFloat(metric.el.style.getPropertyValue(key));
  return Number.isFinite(value) ? value : fallback;
};

function pagedFugue(vertical = false, rows = 20) {
  const c = fixture();
  Object.assign(c.params, {
    fontSize: 20, pageLayout: 'spreads', pageDepth: 6, pageGutter: 2, pageGap: 3,
    textMeasure: 8, pageKeepLines: 1, vertical, gutterTension: 1.55,
    gutterResponse: 0.72, gutterClearance: 1.4, gutterRhythm: 6,
    gutterOffset: 0, gutterHierarchy: 1.55
  });
  for (let index = 0; index < rows * 8; index++) {
    const row = Math.floor(index / 8), column = index % 8;
    const m = metric(c, vertical ? 1000 - row * 30 : column * 20, vertical ? column * 20 : row * 30, {
      width: vertical ? 30 : 20,
      height: vertical ? 20 : 30,
      paragraph: Math.floor(row / 3),
      text: index % 7 ? '文' : '。'
    });
    Object.assign(m.el.dataset, {
      sourceStart: String(index), sourceEnd: String(index + 1), cp: String(m.el.textContent.codePointAt(0)), j: String(index)
    });
    Object.assign(c.operatorState(m, 'gutterFugue'), { current: 1, toggled: true });
    c.metrics.push(m);
  }
  c.measureLayout();
  return c;
}

function visualCenter(c, metric) {
  const matrix = c.glyphLinearMatrix(metric.el);
  const tx = styleNumber(metric, '--op-fugue-x');
  const ty = styleNumber(metric, '--op-fugue-y');
  const originX = metric.relX, originY = metric.relY + metric.h * 0.25;
  const centerOffsetY = -metric.h * 0.25;
  return {
    x: originX + tx + matrix.c * centerOffsetY,
    y: originY + ty + matrix.d * centerOffsetY,
    halfX: Math.abs(matrix.a) * metric.w * 0.5 + Math.abs(matrix.c) * metric.h * 0.5,
    halfY: Math.abs(matrix.b) * metric.w * 0.5 + Math.abs(matrix.d) * metric.h * 0.5
  };
}

test('registered v59 box operator has a focused panel, six controls and five owned channels', () => {
  const c = fixture();
  assert.equal(c.OPERATOR_IDS.length, 116);
  assert.equal(c.OPERATOR_DEFS.gutterFugue.layer, 'box');
  assert.equal(c.OPERATOR_BY_SHORT.gf, 'gutterFugue');
  assert.match(html, /<option value="gutterFugue">Gutter Fugue · 見開きの対位<\/option>/);
  assert.match(html, /data-operator-panel="gutterFugue"/);
  for (const key of ['Tension', 'Response', 'Clearance', 'Rhythm', 'Offset', 'Hierarchy']) {
    assert.ok(html.includes(`id="pGutter${key}"`), key);
  }
  assert.match(html, /gutterFugue: \['--op-fugue-x', '--op-fugue-y', '--op-fugue-sx', '--op-fugue-sy', '--op-fugue-rotate'\]/);
  assert.match(extract('projectData'), /version: 92/);
  assert.match(extract('normalizeParams'), /clampParam\('gutterTension', 0, 4/);
});

test('status reports the Spreads-only contract without mutating params', () => {
  const c = fixture(), hint = { textContent: '' };
  c.document.getElementById = id => id === 'gutterFugueStatus' ? hint : null;
  for (const [pageLayout, gridEnabled, pattern] of [
    ['continuous', false, /休止中/], ['pages', false, /休止中/], ['spreads', true, /休止中/], ['spreads', false, /作動中/]
  ]) {
    c.params.pageLayout = pageLayout; c.params.gridEnabled = gridEnabled;
    const before = plain(c.params); c.syncGutterFugueUI();
    assert.match(hint.textContent, pattern);
    assert.deepEqual(plain(c.params), before);
  }
});

test('all source rows build one shared score per page and paired lines answer across the spread', () => {
  const c = pagedFugue(false, 18);
  assert.ok(c.pageLayoutState.enabled);
  assert.ok(c.pageLayoutState.pages.length >= 2);
  const firstSpread = c.metrics.filter(m => m.spreadIndex === 0);
  assert.ok(firstSpread.every(m => m.gutterFugueLine));
  const lines = [...new Set(firstSpread.map(m => m.gutterFugueLine))];
  assert.ok(lines.some(line => line.partner));
  for (const line of lines) {
    assert.ok(line.glyphs.every(m => m.gutterFugueLine === line));
    assert.ok(line.occupancy > 0 && Number.isFinite(line.hash));
  }
  const left = lines.find(line => line.page.side === 'left' && line.partner);
  const sample = left.glyphs[0];
  const before = c.gutterFugueValues(sample, c.params, 1);
  left.partner.occupancy = Math.min(1.5, left.partner.occupancy + 0.45);
  const after = c.gutterFugueValues(sample, c.params, 1);
  assert.notDeepEqual([before.x, before.sx, before.rotation], [after.x, after.sx, after.rotation]);
});

test('zero strength and zero tension are exact visual identity', () => {
  const c = pagedFugue(false, 12), sample = c.metrics[4];
  const neutral = { x: 0, y: 0, sx: 1, sy: 1, rotation: 0, role: 0 };
  assert.deepEqual(plain(c.gutterFugueValues(sample, c.params, 0)), neutral);
  c.params.gutterTension = 0;
  const zero = c.gutterFugueValues(sample, c.params, 1);
  assert.equal(zero.x, 0); assert.equal(zero.y, 0);
  assert.equal(zero.sx, 1); assert.equal(zero.sy, 1); assert.equal(zero.rotation, 0);
});

test('horizontal score preserves source order and the declared inner white channel', () => {
  const c = pagedFugue(false, 24), clearance = c.params.gutterClearance * c.params.fontSize;
  const lines = [...new Set(c.metrics.map(m => m.gutterFugueLine).filter(Boolean))];
  for (const line of lines) {
    const ordered = [...line.glyphs].sort((a, b) => Number(a.el.dataset.sourceStart) - Number(b.el.dataset.sourceStart));
    let previous = -Infinity;
    for (const m of ordered) {
      const point = visualCenter(c, m);
      assert.ok(point.x > previous, 'inline source order stays monotonic');
      previous = point.x;
      if (line.page.side === 'left') assert.ok(point.x + point.halfX <= line.page.frame.x + line.page.frame.w - clearance + 1.5);
      else assert.ok(point.x - point.halfX >= line.page.frame.x + clearance - 1.5);
    }
  }
});

test('vertical score keeps the column lattice while varying length and register', () => {
  const c = pagedFugue(true, 18);
  const lines = [...new Set(c.metrics.map(m => m.gutterFugueLine).filter(Boolean))];
  assert.ok(lines.length > 4);
  const scales = new Set();
  for (const line of lines) {
    const centres = line.glyphs.map(m => visualCenter(c, m)).sort((a, b) => a.y - b.y);
    for (let index = 1; index < centres.length; index++) assert.ok(centres[index].y > centres[index - 1].y);
    for (const m of line.glyphs) {
      assert.ok(Math.abs(styleNumber(m, '--op-fugue-x')) < 5, 'vertical columns do not travel across neighbours');
      scales.add(styleNumber(m, '--op-fugue-sy', 1).toFixed(4));
    }
  }
  assert.ok(scales.size >= 3, 'paired columns receive distinct lengths');
});

test('Continuous, Pages and Grid suspend geometry without losing assignments', () => {
  const c = pagedFugue(false, 18), m = c.metrics[5];
  const saved = plain(c.sparseOperatorState(m));
  for (const [pageLayout, gridEnabled] of [['continuous', false], ['pages', false], ['spreads', true]]) {
    c.params.pageLayout = pageLayout; c.params.gridEnabled = gridEnabled; c.measureLayout();
    assert.equal(m.gutterFugueLine, null);
    assert.equal(m.el.style.getPropertyValue('--op-fugue-sx'), '');
    assert.deepEqual(plain(c.sparseOperatorState(m)), saved);
  }
  c.params.pageLayout = 'spreads'; c.params.gridEnabled = false; c.measureLayout();
  assert.ok(m.gutterFugueLine);
  assert.notEqual(m.el.style.getPropertyValue('--op-fugue-sx'), '');
});

test('locked carry, release, snapshot, hit testing and Compose include all Fugue channels', () => {
  const c = pagedFugue(false, 16), m = c.metrics[7];
  const before = ['--op-fugue-x', '--op-fugue-y', '--op-fugue-sx', '--op-fugue-sy', '--op-fugue-rotate']
    .map(key => m.el.style.getPropertyValue(key));
  m.locked = true; c.params.gutterTension = 3.4; c.measureLayout();
  assert.deepEqual(['--op-fugue-x', '--op-fugue-y', '--op-fugue-sx', '--op-fugue-sy', '--op-fugue-rotate']
    .map(key => m.el.style.getPropertyValue(key)), before);
  m.locked = false; c.measureLayout();
  const glyph = c.snapshotGlyphs(true).find(g => g.ch === m.el.textContent && Math.abs(g.x - (m.flowX - m.w * 0.5)) < 0.01);
  assert.ok(glyph && Number.isFinite(glyph.tx + glyph.ty + glyph.rot + glyph.scaleX + glyph.scaleY));
  const point = visualCenter(c, m);
  assert.equal(c.findNearestLetter(point.x, point.y), m);
  const composed = c.compositionGlyph({ glyph, sourceIndex: 0 }, 300, 200, 1, 1, 0, null, 1, 0);
  assert.equal(composed.tx, glyph.tx); assert.equal(composed.ty, glyph.ty);
  assert.equal(composed.scaleX, glyph.scaleX); assert.equal(composed.scaleY, glyph.scaleY);
  c.operatorState(m, 'gutterFugue').current = 0; c.applyGutterFugueVisual(m, c.params);
  assert.equal(m.el.style.getPropertyValue('--op-fugue-sx'), '');
});

test('manual intensity survives sparse Project and Share state without becoming a vector', () => {
  const c = fixture(), source = metric(c, 0, 0), destination = metric(c, 0, 0);
  Object.assign(c.operatorState(source, 'gutterFugue'), { current: 1, toggled: true, manual: 0.375 });
  c.restoreOperatorStates(destination, plain(c.sparseOperatorState(source)));
  assert.equal(c.gutterFugueStrength(destination), 0.375);
  c.restoreOperatorStates(destination, c.decodeOperatorStates(c.encodeOperatorStates(destination)));
  assert.equal(c.manualValueAtDragStart(destination, 'gutterFugue'), 0.375);
  c.restoreOperatorStates(destination, { gutterFugue: { t: 1, i: 10, m: Infinity } });
  assert.equal(c.gutterFugueStrength(destination), 0);
});

test('3k/10k/50k measured glyphs retain sparse state and finite spread geometry', t => {
  for (const count of [3000, 10_000, 50_000]) {
    const started = performance.now(), c = pagedFugue(false, count / 8), elapsed = performance.now() - started;
    assert.equal(c.metrics.length, count);
    assert.ok(c.metrics.every(m => m.gutterFugueLine && Number(styleNumber(m, '--op-fugue-sx', 1)) > 0));
    assert.deepEqual(Object.keys(c.metrics[0].operatorStates), ['stretch', 'gutterFugue']);
    t.diagnostic(`${count} glyphs / ${c.pageLayoutState.pages.length} pages: ${elapsed.toFixed(1)}ms full synthetic measure + 2-state style pass; not browser frame rate or device evidence`);
  }
});
