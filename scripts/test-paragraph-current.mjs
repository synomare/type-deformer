import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { fixture, metric, apply, html, extract } from './paragraph-current-fixture.mjs';

test('registered box operator has its own controls, state codec and no Surface ownership', () => {
  const c = fixture();
  assert.equal(c.OPERATOR_IDS.length, 116);
  assert.equal(c.OPERATOR_DEFS.paragraphCurrent.layer, 'box');
  assert.equal(c.OPERATOR_BY_SHORT.pc, 'paragraphCurrent');
  assert.match(html, /data-operator-panel="paragraphCurrent"/);
  assert.match(html, /paragraphCurrent: \['--op-current-x', '--op-current-y', '--op-current-rotate'\]/);
  assert.match(extract('projectData'), /version: 92/);
  assert.match(extract('normalizeParams'), /clampParam\('currentFollow', 0, 1/);
});

test('measured rows share a source paragraph frame without merging explicit paragraphs', () => {
  const c = fixture();
  c.metrics = [metric(c, 0, 0), metric(c, 90, 0), metric(c, 0, 30), metric(c, 0, 80, { paragraph: 1 })];
  const frames = c.buildParagraphCurrentFrames(c.metrics, false);
  assert.equal(frames.size, 2); assert.equal(c.metrics[0].currentFrame.lineCount, 2);
  assert.equal(c.metrics[0].currentFrame, c.metrics[2].currentFrame);
  assert.notEqual(c.metrics[0].currentFrame, c.metrics[3].currentFrame);
  assert.equal(c.metrics[0].currentFrame.maxU, 110);
  assert.equal(c.metrics[0].currentFrame.centerV, 30);
});

test('compact field is identity beyond support and zero strength is neutral', () => {
  const c = fixture(), frame = { minU: 0, maxU: 800, centerV: 100 };
  for (const [u, strength] of [[-900, 1], [1400, 1], [400, 0]]) {
    const s = c.paragraphCurrentSample(u, 40, frame, c.params, strength, 20);
    assert.equal(s.displacement, 0); assert.equal(s.slope, 0); assert.equal(s.spacing, 1);
  }
  for (const side of [-1, 1]) {
    const edge = 400 + side * 800 * c.params.currentReach;
    const s = c.paragraphCurrentSample(edge - side * 0.001, 40, frame, c.params, 1, 20);
    assert.ok(Math.abs(s.displacement) < 1e-8); assert.ok(Math.abs(s.slope) < 1e-7);
  }
});

test('uniform flow preserves ordered row centrelines at extreme parameters and analytic slope agrees with finite differences', () => {
  const c = fixture(), frame = { minU: 0, maxU: 800, centerV: 150 };
  for (const flow of ['crest', 'inflection']) for (const spread of [-2, 0, 2.5]) for (const bend of [-24, 0, 24]) {
    const p = { ...c.params, currentFlow: flow, currentSpread: spread, currentBend: bend };
    for (let u = 0; u < 800; u += 11) {
      const a = c.paragraphCurrentSample(u, 100, frame, p, 1, 20);
      const b = c.paragraphCurrentSample(u, 130, frame, p, 1, 20);
      assert.ok(130 + b.displacement > 100 + a.displacement);
      const derivative = (c.paragraphCurrentSample(u + .001, 100, frame, p, 1, 20).displacement
        - c.paragraphCurrentSample(u - .001, 100, frame, p, 1, 20).displacement) / .002;
      assert.ok(Math.abs(derivative - a.slope) < 1e-5);
    }
  }
});

test('shared bend differs from opening: zero spread translates rows equally; opening changes spacing', () => {
  const c = fixture(), frame = { minU: 0, maxU: 800, centerV: 150 };
  const s = (v, spread) => c.paragraphCurrentSample(310, v, frame, { ...c.params, currentSpread: spread }, 1, 20);
  assert.equal(s(30, 0).displacement, s(150, 0).displacement);
  assert.notEqual(s(30, .55).displacement, s(150, .55).displacement);
});

test('horizontal and vertical layout use corresponding logical axes', () => {
  const c = fixture(); c.params.fontSize = 20;
  c.metrics = [metric(c, 180, 20), metric(c, 0, 50), metric(c, 380, 50)];
  apply(c); const before = c.metrics.map(m => [parseFloat(m.el.style.getPropertyValue('--op-current-y')), parseFloat(m.el.style.getPropertyValue('--op-current-rotate'))]);
  c.metrics = c.metrics.map(m => metric(c, -m.relY - m.h / 2, m.relX - m.w / 2, { width: m.h, height: m.w }));
  c.params.vertical = true; apply(c);
  c.metrics.forEach((m, i) => {
    assert.equal(parseFloat(m.el.style.getPropertyValue('--op-current-x')) + before[i][0], 0);
    assert.equal(parseFloat(m.el.style.getPropertyValue('--op-current-rotate')), before[i][1]);
  });
});

test('actual measurement preserves existing locked channels, initializes restored locks, and clears released flow', () => {
  const c = fixture(); c.params.fontSize = 20;
  c.metrics = [metric(c, 180, 0), metric(c, 0, 50), metric(c, 400, 50)]; apply(c);
  const m = c.metrics[0]; m.locked = true;
  const old = m.el.style.getPropertyValue('--op-current-y');
  c.params.currentBend = 20; c.measureLayout();
  assert.equal(m.el.style.getPropertyValue('--op-current-y'), old);
  delete m.currentFrame; c.applyParagraphCurrentVisual(m, c.params); c.measureLayout();
  assert.equal(m.el.style.getPropertyValue('--op-current-y'), old, 'source carry retains frozen CSS without a prior measured frame');
  delete m.currentFrame;
  for (const key of ['--op-current-x', '--op-current-y', '--op-current-rotate']) m.el.style.removeProperty(key);
  c.measureLayout();
  assert.notEqual(m.el.style.getPropertyValue('--op-current-y'), old);
  c.operatorState(m, 'paragraphCurrent').current = 0;
  c.applyParagraphCurrentVisual(m, c.params);
  assert.equal(m.el.style.getPropertyValue('--op-current-y'), '');
});

test('snapshot, edit hit testing, linear transform and Compose source carry all new channels', () => {
  const c = fixture(); c.params.fontSize = 20;
  c.metrics = [metric(c, 0, 0)]; const m = c.metrics[0];
  m.el.style.setProperty('--op-current-x', '950px'); m.el.style.setProperty('--op-current-y', '800px'); m.el.style.setProperty('--op-current-rotate', '30deg');
  const g = c.snapshotGlyphs(true)[0];
  assert.equal(g.tx, 950); assert.equal(g.ty, 800); assert.equal(g.rot, 30);
  assert.ok(Math.abs(c.glyphLinearMatrix(m.el).a - Math.cos(Math.PI / 6)) < 1e-12);
  assert.equal(c.findNearestLetter(960, 815), m, 'far-displaced glyph remains editable');
  const composed = c.compositionGlyph({ glyph: g, sourceIndex: 0 }, 300, 200, 1, 1, 15, null, 1, 0);
  assert.equal(composed.tx, g.tx); assert.equal(composed.ty, g.ty); assert.equal(composed.rot, 45);
});

test('manual strength saves/restores through Project sparse state and Share codec without becoming a vector', () => {
  const c = fixture(), m = metric(c, 0, 0);
  Object.assign(c.operatorState(m, 'paragraphCurrent'), { toggled: true, current: 1, manual: .375 });
  const saved = JSON.parse(JSON.stringify(c.sparseOperatorState(m))), dest = metric(c, 0, 0);
  c.restoreOperatorStates(dest, saved);
  assert.equal(c.paragraphCurrentStrength(dest), .375);
  const encoded = c.encodeOperatorStates(dest), shared = c.decodeOperatorStates(encoded);
  c.restoreOperatorStates(dest, shared); assert.equal(c.manualValueAtDragStart(dest, 'paragraphCurrent'), .375);
  c.restoreOperatorStates(dest, { paragraphCurrent: { t: 1, i: 10, m: Infinity } });
  assert.equal(c.paragraphCurrentStrength(dest), 0);
});

test('Wrap changes only text measure, disables under Grid, and does not mutate camera or source', () => {
  const c = fixture(); c.canvasView = { x: 25, y: -300, scale: .7 };
  c.params.textMeasure = 32; c.applyTextMeasure();
  assert.equal(c.stageWorld.style.inlineSize, '32em');
  c.params.gridEnabled = true; c.applyTextMeasure(); assert.equal(c.stageWorld.style.inlineSize, '');
  c.params.gridEnabled = false; c.params.textMeasure = 0; c.applyTextMeasure(); assert.equal(c.stageWorld.style.inlineSize, '');
  assert.deepEqual(c.canvasView, { x: 25, y: -300, scale: .7 });
});

test('3k/10k/50k measured glyphs: linear field evaluation stays finite with sparse state', () => {
  const c = fixture(); c.params.fontSize = 20;
  for (const count of [3000, 10000, 50000]) {
    c.metrics = Array.from({ length: count }, (_, i) => metric(c, (i % 40) * 20, Math.floor(i / 40) * 30, { paragraph: Math.floor(i / 800) }));
    const start = performance.now(); apply(c); const elapsed = performance.now() - start;
    assert.equal(c.metrics.length, count);
    for (const m of c.metrics) assert.ok(Number.isFinite(parseFloat(m.el.style.getPropertyValue('--op-current-y'))));
    console.log(`Paragraph Current ${count} glyphs / ${Object.keys(c.metrics[0].operatorStates).length} instantiated states / ${c.OPERATOR_IDS.length} registered: ${elapsed.toFixed(1)}ms frame+field+mock style (not DOM frame rate)`);
  }
});
