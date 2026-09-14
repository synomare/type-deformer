import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { fixture, metric, html, extract } from './paragraph-current-fixture.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
const number = (m, key, fallback = 0) => {
  const value = parseFloat(m.el.style.getPropertyValue(key));
  return Number.isFinite(value) ? value : fallback;
};

function measuredSource(c, source, { vertical = false, rowLength = 28, paragraph = 0 } = {}) {
  c.params.vertical = vertical;
  let glyphIndex = 0;
  for (let sourceIndex = 0; sourceIndex < source.length; sourceIndex++) {
    const ch = source[sourceIndex];
    if (/\s/.test(ch)) continue;
    const row = Math.floor(glyphIndex / rowLength), column = glyphIndex % rowLength;
    const m = metric(c, vertical ? 900 - row * 30 : 100 + column * 20,
      vertical ? 100 + column * 20 : 100 + row * 30,
      { width: vertical ? 30 : 20, height: vertical ? 20 : 30, paragraph, text: ch });
    Object.assign(m.el.dataset, {
      sourceStart: String(sourceIndex), sourceEnd: String(sourceIndex + 1),
      cp: String(ch.codePointAt(0)), j: String(glyphIndex)
    });
    c.metrics.push(m); glyphIndex++;
  }
  return c.metrics;
}

function applyCaesura(c, grammar = c.params.caesuraGrammar, strength = 1) {
  c.params.caesuraGrammar = grammar;
  c.buildCaesuraFieldFrames(c.metrics, c.params.vertical);
  for (const m of c.metrics) {
    Object.assign(c.operatorState(m, 'caesuraField'), { current: strength, toggled: strength > 0 });
    c.applyCaesuraFieldVisual(m, c.params);
  }
  c.invalidateCompositionSource();
}

function visualCenter(c, m) {
  const matrix = c.glyphLinearMatrix(m.el), q = m.h * .25;
  const tx = number(m, '--op-caesura-x'), ty = number(m, '--op-caesura-y');
  return { x: m.relX + tx - matrix.c * q, y: m.relY + q + ty - matrix.d * q };
}

function signature(c) {
  return c.metrics.map(m => ['--op-caesura-x', '--op-caesura-y', '--op-caesura-sx', '--op-caesura-sy', '--op-caesura-rotate']
    .map(key => m.el.style.getPropertyValue(key)).join('|')).join('\n');
}

test('v63 registers Caesura Field as the 54th operator with one focused five-axis panel', () => {
  const c = fixture();
  assert.equal(c.OPERATOR_IDS.length, 116);
  assert.equal(c.OPERATOR_DEFS.caesuraField.layer, 'box');
  assert.equal(c.OPERATOR_BY_SHORT.ca, 'caesuraField');
  assert.match(html, /<option value="caesuraField">Caesura Field · 句読点の呼吸<\/option>/);
  assert.match(html, /data-operator-panel="caesuraField"/);
  for (const key of ['Grammar', 'Breath', 'Lift', 'Hierarchy', 'Angle', 'Span']) assert.ok(html.includes(`id="pCaesura${key}"`), key);
  assert.match(html, /caesuraField: \['--op-caesura-x', '--op-caesura-y', '--op-caesura-sx', '--op-caesura-sy', '--op-caesura-rotate'\]/);
  assert.match(extract('projectData'), /version: 92/);
  assert.match(extract('normalizeParams'), /clampParam\('caesuraAngle', -120, 120/);
  assert.match(html, /caesuraField: \['caesuraGrammar', 'caesuraBreath', 'caesuraLift', 'caesuraHierarchy', 'caesuraAngle', 'caesuraSpan'\]/);
});

test('explicit Japanese and Latin punctuation form clauses; closing marks remain with their terminal', () => {
  const c = fixture(); measuredSource(c, '甲、乙。「丙…」丁！戊;己?庚');
  const groups = c.buildCaesuraFieldFrames(c.metrics, false);
  const clauses = [...groups.values()][0].clauses;
  assert.deepEqual(plain(clauses.map(clause => clause.glyphs.map(entry => entry.metric.el.textContent).join(''))),
    ['甲、', '乙。', '「丙…」', '丁！', '戊;', '己?', '庚']);
  assert.deepEqual(plain(clauses.map(clause => clause.boundaryStrength)), [.52, 1, .88, 1, .72, 1, .34]);
  assert.equal(clauses[2].pivotMetric.el.textContent, '…');
  assert.equal(c.caesuraPunctuationStrength('abc'), 0);
  assert.equal(c.caesuraPunctuationStrength('？！'), 1);
  assert.equal(c.caesuraClosingMark('」'), true);
});

test('no punctuation stays one clause and zero strength or zero geometry is exact identity', () => {
  for (const grammar of ['aperture', 'terrace', 'hinge']) {
    const c = fixture(); measuredSource(c, 'UNBROKEN SOURCE');
    const groups = c.buildCaesuraFieldFrames(c.metrics, false);
    assert.equal([...groups.values()][0].clauses.length, 1);
    applyCaesura(c, grammar, 0);
    for (const m of c.metrics) assert.equal(m.el.style.getPropertyValue('--op-caesura-x'), '');
    Object.assign(c.params, { caesuraBreath: 0, caesuraLift: 0, caesuraHierarchy: 0, caesuraAngle: 0 });
    applyCaesura(c, grammar, 1);
    for (const m of c.metrics) assert.deepEqual(plain(c.caesuraFieldValues(m, c.params, 1)), { x: 0, y: 0, sx: 1, sy: 1, rotation: 0 });
  }
});

test('sentence periods, grouped terminal runs and nested closing marks yield whole clauses', () => {
  const cases = [
    ['One. Two.', ['One.', 'Two.']],
    ['Wait... Really?! Yes!!', ['Wait...', 'Really?!', 'Yes!!']],
    ['「止まる……!?」次。', ['「止まる……!?」', '次。']],
    ['(Stop!)] Next.', ['(Stop!)]', 'Next.']],
    ['Go! "Next?" End.', ['Go!', '"Next?"', 'End.']]
  ];
  for (const [source, expected] of cases) {
    const c = fixture(); measuredSource(c, source);
    const group = [...c.buildCaesuraFieldFrames(c.metrics, false).values()][0];
    assert.deepEqual(plain(group.clauses.map(clause => clause.glyphs.map(entry => entry.metric.el.textContent).join(''))), expected, source);
    assert.equal(group.clauses.flatMap(clause => clause.glyphs).length, c.metrics.length);
  }
  const c = fixture();
  assert.equal(c.caesuraClosingMark('word"'), false, 'a joining token ending in a quote is not just a closing mark');
});

test('numeric punctuation and contiguous Latin identifiers do not fracture into false clauses', () => {
  const c = fixture();
  const source = 'Value 3.14, time 12:30; host example.org. Total 1,024.50! 全角３．１４。';
  measuredSource(c, source);
  const group = [...c.buildCaesuraFieldFrames(c.metrics, false).values()][0];
  const text = clause => clause.glyphs.map(entry => entry.metric.el.textContent).join('');
  assert.deepEqual(plain(group.clauses.map(text)),
    ['Value3.14,', 'time12:30;', 'hostexample.org.', 'Total1,024.50!', '全角３．１４。']);
  const internalDot = c.metrics.find(m => Number(m.el.dataset.sourceStart) === source.indexOf('3.14') + 1);
  assert.equal(internalDot.caesuraMarkStrength, 0, 'a decimal point is neither boundary nor enlarged ornament');
  const terminalDot = c.metrics.find(m => Number(m.el.dataset.sourceStart) === source.indexOf('org.') + 3);
  assert.equal(terminalDot.caesuraMarkStrength, 1);
});

test('wrapped clauses open in their measured reading direction on both axes', () => {
  for (const vertical of [false, true]) {
    const c = fixture(); measuredSource(c, 'AAAAAA,BBBBBBBBBBBBBBBBBBB.', { vertical, rowLength: 12 });
    Object.assign(c.params, { caesuraLift: 0, caesuraAngle: 0, caesuraHierarchy: 0 });
    applyCaesura(c, 'aperture');
    const start = c.metrics[7], center = visualCenter(c, start);
    assert.ok((vertical ? center.y - start.relY : center.x - start.relX) > 0,
      'the following wrapped clause opens forward even when its last row ends before its first row starts');
    assert.ok(start.caesuraClause.rows.length > 1);
  }
});

test('proportional widths and RTL rows keep ordered centers even at maximum breathing distance', () => {
  for (const vertical of [false, true]) for (const reverse of [false, true]) {
    const c = fixture(); c.params.vertical = vertical;
    const widths = [28, 4, 3, 42, 5, 31, 4, 18, 4, 3, 26, 4];
    let cursor = 0;
    for (let i = 0; i < widths.length; i++) {
      const size = widths[i], center = cursor + size / 2;
      const x = vertical ? 200 : 600 + (reverse ? -center : center);
      const y = vertical ? 600 + (reverse ? -center : center) : 200;
      const m = metric(c, x - (vertical ? 30 : size) / 2, y - (vertical ? size : 30) / 2,
        { width: vertical ? 30 : size, height: vertical ? size : 30, text: i === 0 ? ',' : i === widths.length - 1 ? '.' : 'i' });
      Object.assign(m.el.dataset, { sourceStart: String(i), sourceEnd: String(i + 1) });
      c.metrics.push(m); cursor += size;
    }
    Object.assign(c.params, { caesuraBreath: 12, caesuraSpan: 3 });
    applyCaesura(c, 'aperture');
    let previous = -Infinity;
    for (const m of c.metrics) {
      const center = visualCenter(c, m), inline = (vertical ? center.y : center.x) * (reverse ? -1 : 1);
      assert.ok(inline > previous, `monotonic physical centers / vertical=${vertical}, reverse=${reverse}`);
      previous = inline;
    }
  }
});

test('the three grammars produce structurally different clause geometry from the same source', () => {
  const outputs = [];
  for (const grammar of ['aperture', 'terrace', 'hinge']) {
    const c = fixture(); measuredSource(c, 'A short clause, a longer sentence opens here; then the terminal turns! Another field follows.');
    applyCaesura(c, grammar); outputs.push(signature(c));
    assert.ok(c.metrics.some(m => Math.abs(number(m, '--op-caesura-y')) > .1));
    assert.ok(c.metrics.every(m => ['--op-caesura-x', '--op-caesura-y', '--op-caesura-sx', '--op-caesura-sy', '--op-caesura-rotate']
      .every(key => Number.isFinite(parseFloat(m.el.style.getPropertyValue(key))))));
  }
  assert.equal(new Set(outputs).size, 3);
});

test('ordinary Breath apertures preserve visual inline order in horizontal and vertical writing', () => {
  const source = '短い節、次の節は少し長くなる。さらに余白が開き、最後の声が戻る！';
  for (const vertical of [false, true]) {
    const c = fixture(); measuredSource(c, source, { vertical, rowLength: 120 }); applyCaesura(c, 'aperture');
    let previous = -Infinity;
    for (const m of c.metrics) {
      const center = visualCenter(c, m), inline = vertical ? center.y : center.x;
      assert.ok(inline > previous, `${vertical ? 'vertical' : 'horizontal'} source order`);
      previous = inline;
    }
  }
});

test('locked repaint, snapshot, hit testing, Compose, sparse Project and Share all retain owned channels', () => {
  const c = fixture(); measuredSource(c, 'Pivot, then turn!'); applyCaesura(c, 'hinge');
  const m = c.metrics.find(metric => Math.abs(number(metric, '--op-caesura-rotate')) > .1);
  assert.ok(m);
  const before = ['--op-caesura-x', '--op-caesura-y', '--op-caesura-sx', '--op-caesura-sy', '--op-caesura-rotate']
    .map(key => m.el.style.getPropertyValue(key));
  m.locked = true; c.params.caesuraAngle = -95; c.measureLayout();
  assert.deepEqual(['--op-caesura-x', '--op-caesura-y', '--op-caesura-sx', '--op-caesura-sy', '--op-caesura-rotate']
    .map(key => m.el.style.getPropertyValue(key)), before);
  const glyph = c.snapshotGlyphs(true).find(g => g.sourceText === m.el.dataset.sourceText);
  assert.ok(glyph && Number.isFinite(glyph.tx + glyph.ty + glyph.rot + glyph.scaleX + glyph.scaleY));
  const point = visualCenter(c, m); assert.equal(c.findNearestLetter(point.x, point.y), m);
  const composed = c.compositionGlyph({ glyph, sourceIndex: 0 }, 300, 200, 1, 1, 0, null, 1, 0);
  assert.equal(composed.tx, glyph.tx); assert.equal(composed.scaleX, glyph.scaleX);

  const saved = plain(c.sparseOperatorState(m)), destination = metric(c, 0, 0);
  c.restoreOperatorStates(destination, saved);
  assert.equal(c.caesuraFieldStrength(destination), c.caesuraFieldStrength(m));
  c.restoreOperatorStates(destination, c.decodeOperatorStates(c.encodeOperatorStates(destination)));
  assert.equal(c.manualValueAtDragStart(destination, 'caesuraField'), c.caesuraFieldStrength(m));
  c.restoreOperatorStates(destination, { rotate: { t: 1, i: .5, m: 12 } });
  assert.equal(c.caesuraFieldStrength(destination), 0, 'v62 states cannot enable the additive operator');
});

test('manual intensity is scalar, clamped, and removable without touching other layout channels', () => {
  const c = fixture(); measuredSource(c, 'One, two.'); const m = c.metrics[2];
  const state = c.operatorState(m, 'caesuraField');
  Object.assign(state, { current: 1, toggled: true, manual: .375 });
  c.buildCaesuraFieldFrames(c.metrics, false); c.applyCaesuraFieldVisual(m, c.params);
  assert.equal(c.caesuraFieldStrength(m), .375);
  assert.equal(c.normalizeOperatorManual('caesuraField', Infinity), 0);
  assert.equal(c.normalizeOperatorManual('caesuraField', 3), 1);
  m.el.style.setProperty('--op-current-y', '17px');
  state.current = 0; state.manual = null;
  c.applyCaesuraFieldVisual(m, c.params);
  assert.equal(m.el.style.getPropertyValue('--op-caesura-y'), '');
  assert.equal(m.el.style.getPropertyValue('--op-current-y'), '17px');
});

test('3k/10k/50k clause scores stay finite with sparse per-glyph state', t => {
  for (const count of [3000, 10_000, 50_000]) {
    const c = fixture(); c.params.fontSize = 18;
    for (let i = 0; i < count; i++) {
      const ch = i % 41 === 40 ? (i % 82 ? '、' : '。') : (i % 3 ? '文' : 'A');
      const m = metric(c, (i % 60) * 18, Math.floor(i / 60) * 27, { width: 18, height: 27, paragraph: Math.floor(i / 1200), text: ch });
      Object.assign(m.el.dataset, { sourceStart: String(i), sourceEnd: String(i + 1), cp: String(ch.codePointAt(0)), j: String(i) });
      Object.assign(c.operatorState(m, 'caesuraField'), { current: 1, toggled: true }); c.metrics.push(m);
    }
    const started = performance.now(); c.buildCaesuraFieldFrames(c.metrics, false);
    for (const m of c.metrics) c.applyCaesuraFieldVisual(m, c.params);
    const elapsed = performance.now() - started;
    assert.deepEqual(Object.keys(c.metrics[0].operatorStates), ['stretch', 'caesuraField']);
    assert.ok(c.metrics.every(m => Number.isFinite(number(m, '--op-caesura-x')) && number(m, '--op-caesura-sx', 1) > 0));
    t.diagnostic(`${count} glyphs: ${elapsed.toFixed(1)}ms clause model + five mock style channels / 2 instantiated states; not DOM frame rate or device evidence`);
  }
});
