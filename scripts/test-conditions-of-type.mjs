import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../conditions-of-type.js';

const conditions = globalThis.TypeDeformerConditionsOperators;
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const catalog = fs.readFileSync(new URL('../operator-catalog.js', import.meta.url), 'utf8');

test('the v68 Conditions of Type suite exposes six bounded deterministic operators', () => {
  assert.deepEqual(conditions.ids, [
    'rubyUsurper', 'punctuationLoom', 'counterpage',
    'rendererDebt', 'ligatureContagion', 'strokeCommons'
  ]);
  assert.equal(new Set(conditions.ids).size, 6);
  for (const id of conditions.ids) {
    const schema = conditions.schemas[id];
    assert.ok(schema, id);
    for (const [key, value] of Object.entries(schema.defaults)) {
      if (schema.options[key]) assert.ok(schema.options[key].includes(value), `${id}.${key} option`);
      if (schema.limits[key]) assert.ok(value >= schema.limits[key][0] && value <= schema.limits[key][1], `${id}.${key} limit`);
    }
    assert.ok(conditions.effectPad(id, schema.defaults, 52) >= 0, `${id} pad`);
  }
  assert.equal(conditions.requiresAnimation('rendererDebt'), false);
});

test('Ruby Usurper keeps explicit parent ranges and never fabricates an unmatched reading', () => {
  const glyphs = Array.from('文字が生まれる').map(ch => ({ glyph: { ch, sourceText: ch } }));
  const mapping = conditions.internals.parseRubyMapping(glyphs, '文字=もじ/lettering|生まれる=うまれる');
  assert.deepEqual(mapping.map(({ start, end, parent, readings, matched }) => ({ start, end, parent, readings, matched })), [
    { start: 0, end: 1, parent: '文字', readings: ['もじ', 'lettering'], matched: true },
    { start: 3, end: 6, parent: '生まれる', readings: ['うまれる'], matched: true }
  ]);
  const missing = conditions.internals.parseRubyMapping(glyphs, '存在しない=ねつぞう');
  assert.equal(missing.length, 1);
  assert.equal(missing[0].matched, false);
  assert.equal(missing[0].start, -1);
  assert.deepEqual(conditions.internals.parseRubyMapping(glyphs, ''), []);
});

test('Punctuation Loom resolves nested bracket ownership and exposes unmatched anchors', () => {
  const structure = conditions.internals.pairPunctuation(Array.from('A（B［C］D）E」'));
  assert.deepEqual(structure.pairs.map(({ open, close, depth }) => ({ open, close, depth })), [
    { open: 1, close: 7, depth: 0 },
    { open: 3, close: 5, depth: 1 }
  ]);
  assert.deepEqual(structure.unmatched, [9]);
  const changed = conditions.internals.pairPunctuation(Array.from('A（B）［C D］E'));
  assert.notDeepEqual(changed.pairs, structure.pairs);
  const crossed = conditions.internals.pairPunctuation(Array.from('（［）］'));
  assert.deepEqual(crossed.pairs.map(({ open, close }) => ({ open, close })), [{ open: 1, close: 3 }]);
  assert.deepEqual(crossed.unmatched, [0, 2], 'a mismatched closer cannot cross the live stack');
});

test('independent Counterpage manuscripts retain paragraphs and never tile source content', () => {
  const pages = conditions.internals.composeCounterpages('FIRST PAGE\nwith a second line\n---\nSECOND PAGE\n---\nTHIRD PAGE', 3);
  assert.deepEqual(pages, ['FIRST PAGE\nwith a second line', 'SECOND PAGE', 'THIRD PAGE']);
  const source = 'one two three four five six';
  assert.equal(conditions.internals.composeCounterpages(source, 3).join(''), source);
  assert.deepEqual(conditions.internals.wrapPageText('abcdef\ngh', s=>s.length, 3), ['abc','def','gh']);
});

test('owned raster alpha, including antialiasing, follows allocation within one quantum', () => {
  const w=40,h=40,rgba=new Uint8ClampedArray(w*h*4);
  for(let y=8;y<32;y++)for(let x=14;x<26;x++)rgba[(y*w+x)*4+3]=(x===14||x===25)?128:255;
  let source=0;for(let p=3;p<rgba.length;p+=4)source+=rgba[p]/255;
  for(const ratio of [.18,.4,1,1.8,2.7]) {
    const result=conditions.internals.redistributeAlpha(rgba,w,h,source*ratio,.18);
    const actual=result.alpha.reduce((a,b)=>a+b,0)/255;
    assert.ok(Math.abs(actual-source*ratio)<=1/255,`${ratio}: ${actual}`);
    if(ratio<1)assert.ok(result.alpha[20*w+14]<rgba[(20*w+14)*4+3],'donor edge loses ink');
    if(ratio>1)assert.ok(result.alpha.some((a,p)=>a>0&&rgba[p*4+3]===0),'recipient grows into new area');
  }
});

test('stroke extraction follows real ink and retains disconnected components', () => {
  const w=30,h=30,rgba=new Uint8ClampedArray(w*h*4);
  for(let y=5;y<25;y++)for(let x=5;x<10;x++)rgba[(y*w+x)*4+3]=255;
  for(let y=12;y<17;y++)for(let x=20;x<27;x++)rgba[(y*w+x)*4+3]=255;
  const strokes=conditions.internals.skeletonStrokes(rgba,w,h);
  assert.ok(strokes.length>=2);
  for(const point of strokes.flat())assert.ok(rgba[(point.y*w+point.x)*4+3]>0);
  assert.deepEqual(conditions.internals.skeletonStrokes(rgba,w,h),strokes);
});

test('Counterpage flood fill reveals enclosed transparent pixels and excludes the outside page', () => {
  const width = 20, height = 20, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 3; y <= 16; y++) for (let x = 3; x <= 16; x++) {
    if (x >= 7 && x <= 12 && y >= 7 && y <= 12) continue;
    data[(y * width + x) * 4 + 3] = 255;
  }
  const mask = conditions.internals.enclosedVoidMask(data, width, height, 24);
  let pixels = 0;
  for (let i = 3; i < mask.length; i += 4) if (mask[i]) pixels++;
  assert.equal(pixels, 36);
  assert.equal(mask[(9 * width + 9) * 4 + 3], 255);
  assert.equal(mask[(1 * width + 1) * 4 + 3], 0);
});

test('Ligature Contagion follows contact edges, stops at boundaries and changes origin', () => {
  const items = [
    { x: 0, y: 0, w: 20, h: 30, line: 0, word: 0 },
    { x: 23, y: 0, w: 20, h: 30, line: 0, word: 0 },
    { x: 46, y: 0, w: 20, h: 30, line: 0, word: 0 },
    { x: 0, y: 40, w: 20, h: 30, line: 1, word: 1 }
  ];
  const left = conditions.internals.contagionGraph(items, 0, 8, 0.8, 8, 0.1);
  assert.equal(left.origin, 0);
  assert.equal(left.nodes[2].generation, 2);
  assert.equal(left.nodes[3], undefined, 'line boundary stops contagion');
  const right = conditions.internals.contagionGraph(items, 0.66, 8, 0.8, 8, 0.1);
  assert.equal(right.origin, 2);
  assert.notDeepEqual(right.edges, left.edges);
  const separated = conditions.internals.contagionGraph([
    { x: 0, y: 0, w: 20, h: 30, line: 0, word: 0 },
    { x: 60, y: 0, w: 20, h: 30, line: 0, word: 0 }
  ], 0, 8, 0.8, 8, 0.1);
  assert.equal(separated.nodes[1], undefined, 'contact threshold applies inside a word too');
  const skipped = conditions.internals.contagionGraph([
    { x: 0, y: 0, w: 20, h: 30, sourceIndex: 0 },
    { x: 21, y: 0, w: 20, h: 30, sourceIndex: 2 }
  ], 0, 8, 1, 100, 0);
  assert.equal(skipped.nodes[1], undefined, 'a non-applied character blocks inheritance');
});

test('Stroke Commons conserves its measured budget exactly and transfers mass to the beneficiary', () => {
  const masses = [120, 80, 60, 140];
  const result = conditions.internals.allocateCommons(masses, 0, 1, 0.18, 7, 'focus', 0.82);
  const sum = result.allocations.reduce((total, value) => total + value, 0);
  assert.ok(Math.abs(sum - masses.reduce((total, value) => total + value, 0)) < 1e-9);
  assert.ok(result.allocations[0] > masses[0]);
  assert.ok(result.allocations[0] > result.allocations[1] * 2, 'focus mode visibly concentrates the pool');
  assert.ok(result.allocations.slice(1).some((value, index) => value < masses[index + 1]));
  assert.ok(result.allocations.every((value, index) => value >= masses[index] * 0.18 - 1e-9));
  const double = conditions.internals.allocateCommons(masses, 0.5, 2, 0.18, 7, 'wave', 1);
  assert.ok(Math.abs(double.allocations.reduce((a, b) => a + b, 0) - 800) < 1e-9);
  const local = conditions.internals.allocateCommons(masses, 0, 1, 0.18, 1, 'focus', 1);
  assert.equal(local.allocations[2], masses[2], 'glyphs beyond transfer reach retain their allocation');
  assert.equal(local.allocations[3], masses[3], 'the reach boundary is deterministic');
});

test('all six operators are wired through UI, Batch, Surface, rendering and v68 persistence', () => {
  const defaults = Object.fromEntries(Object.entries(conditions.schemas).flatMap(([id, schema]) =>
    Object.keys(schema.defaults).map(key => [key, id])));
  for (const id of conditions.ids) {
    assert.ok(html.includes(`<option value="${id}">`), `${id} option`);
    assert.ok(html.includes(`data-operator-panel="${id}"`), `${id} panel`);
    assert.match(html, new RegExp(`${id}: \\{ id: '${id}', short:`), `${id} definition`);
    assert.ok(html.includes(`${id}: surfaceOperatorStrength(m, '${id}')`), `${id} glyph strength`);
    assert.ok(html.includes(`${id}: conditionSurfaceRenderer('${id}')`), `${id} renderer`);
    assert.ok(html.includes(`surfaceOperatorStrength(metrics[i], '${id}') * conditionPad('${id}', profile)`), `${id} bounds`);
    assert.ok(catalog.includes(`'${id}'`), `${id} catalog`);
  }
  for (const [key, id] of Object.entries(defaults)) {
    assert.match(html, new RegExp(`\\b${key}:`), `${id}.${key} default`);
    assert.ok(html.includes(`'${key}'`), `${id}.${key} Batch key`);
    assert.ok(html.includes(`${key}: deform.${key}`), `${id}.${key} glyph payload`);
    const control = 'p' + key[0].toUpperCase() + key.slice(1);
    if (conditions.schemas[id].options[key]) {
      assert.ok(html.includes(`bindProfileSelect('${control}', '${key}'`), `${id}.${key} select binding`);
      assert.ok(html.includes(`chooseParam('${key}', BATCH_PARAM_OPTIONS.${key})`), `${id}.${key} normalization`);
    } else {
      assert.ok(html.includes(`bindRange('${control}'`), `${id}.${key} range binding`);
      assert.ok(html.includes(`clampParam('${key}'`), `${id}.${key} normalization`);
    }
  }
  assert.ok(html.includes("rubyText: ''"));
  assert.ok(html.includes("counterpageText: ''"));
  assert.ok(/version:\s*92/.test(html));
  assert.ok(html.includes("a: 'td', v: 92"));
  assert.ok(html.includes('data.version > 92'));
});
