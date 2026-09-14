// Real geometry/renderer in native Canvas; isolated mask, not browser UI/export.
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { canvas, html, extract, createThornFixture, textMask } from './thorn-rooted-fixture.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
const pixels = c => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
const digest = data => createHash('sha256').update(data).digest('hex');
const sumAlpha = data => data.reduce((sum, value, i) => sum + (i % 4 === 3 ? value : 0), 0);
const families = ['hybrid', 'lancet', 'hook', 'vine', 'trident'];
const mask = textMask('B', 192);

test('legacy renderer remains byte-identical after function-name normalization', () => {
  const old = extract('renderThornCrownLegacy').replace('function renderThornCrownLegacy(', 'function renderThornCrown(').replace(/\r\n/g, '\n').trim();
  // Hash captured from the actual pre-upgrade renderer, not current output.
  assert.equal(digest(old), 'f094613a241feef1713e061e0aaacfdaaf736602129d6a434052a0af4913a9f2');
  for (const thornGrammar of families) {
    const settings = { thornGrammar, thornConstruction: 'legacy' };
    const viaWrapper = createThornFixture(mask, settings);
    const directOld = createThornFixture(mask, settings, old);
    assert.deepEqual(pixels(viaWrapper.render()), pixels(directOld.render()));
  }
});

test('taper reaches a zero-width tip and every branch starts on the parent spine', () => {
  const c = createThornFixture(mask), root = { x: 0, y: 0, nx: 1, ny: 0 };
  for (const family of families.slice(1)) for (const curl of [-3, 0, 3]) for (const branches of [0, 4]) {
    const paths = c.thornOrganPaths(root, 360, 20, curl, family, branches, 4, 31);
    assert.ok(paths[0].curve[0].x < 0, 'root embeds inside the glyph');
    for (const path of paths) {
      assert.ok(path.outline.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
      const half = path.outline.length / 2;
      assert.deepEqual(plain(path.outline[half - 1]), plain(path.outline[half]));
      assert.deepEqual(plain(path.outline[half]), plain(path.curve[3]));
    }
    for (let i = 1; i < paths.length; i++) {
      const at = family === 'trident' ? .47 : .28 + (i - 1) / (paths.length - 1) * .48;
      const joint = c.thornSpine(paths[0].curve, at);
      assert.ok(Math.hypot(joint.x - paths[i].curve[0].x, joint.y - paths[i].curve[0].y) < 1e-9);
    }
    assert.equal(paths.length, family === 'lancet' ? 1 : family === 'trident' ? 3 : family === 'vine' ? 1 + Math.min(6, Math.round(branches * 1.5)) : 1 + Math.min(2, branches));
  }
  const hook = c.thornOrganPaths(root, 100, 7, 1, 'hook', 1, 2, 31)[0].curve;
  const end = c.thornSpine(hook, 1), beforeEnd = c.thornSpine(hook, .99);
  assert.ok(end.x < beforeEnd.x, 'hook turns back as a continuous body, not a separate cap');
});

test('contour normals, root spacing and clearance use local ink, not a global text centroid', () => {
  const source = canvas.createCanvas(200, 140), ctx = source.getContext('2d');
  ctx.fillRect(40, 20, 20, 100); ctx.fillRect(90, 20, 20, 100);
  const data = pixels(source), c = createThornFixture(source);
  const roots = clearance => plain(c.thornContourRoots(data, data, 200, 140, 1, 80, 4, 6, clearance, 41));
  const crowded = roots(0), clear = roots(1);
  const inside = root => root.y > 35 && root.y < 105 && root.x > 57 && root.x < 93 && Math.abs(root.nx) > .9;
  assert.ok(crowded.some(inside), 'zero clearance permits facing roots');
  assert.equal(clear.filter(inside).length, 0, 'clearance removes short blocked normal rays');
  assert.ok(clear.length > 0 && clear.length <= 160);
  assert.deepEqual(roots(1), clear);
  const gap = Math.max(6, 4 * 3.4, 80 * .24) / Math.sqrt(6);
  clear.forEach((a, i) => clear.slice(i + 1).forEach(b => assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= gap - 1e-9)));
  assert.ok(clear.every(p => Math.abs(Math.hypot(p.nx, p.ny) - 1) < 1e-9));
});

test('empty, muted and zero-length inputs produce no FX', () => {
  for (const c of [createThornFixture(canvas.createCanvas(40, 40)), createThornFixture(mask, { thornLength: 0 })]) assert.equal(sumAlpha(pixels(c.render())), 0);
  const c = createThornFixture(mask);
  assert.equal(sumAlpha(pixels(c.render(0))), 0);
  assert.equal(sumAlpha(pixels(c.render(.001))), 0);
});

test('all grammars are distinct, deterministic and independent of paper color', () => {
  const hashes = new Set();
  for (const thornGrammar of families) {
    const c = createThornFixture(mask, { thornGrammar });
    const first = pixels(c.render()); hashes.add(digest(first));
    assert.ok(sumAlpha(first) > 1000);
    c.params.paper = '#00ff00';
    assert.deepEqual(pixels(c.render()), first, 'cuts are true alpha, not painted paper');
    c.params.thornColor = '#00ff00';
    const green = pixels(c.render());
    assert.equal(sumAlpha(green), sumAlpha(first));
    for (let i = 0; i < green.length; i += 4) if (green[i + 3] > 20) {
      assert.equal(green[i], 0); assert.equal(green[i + 1], 255); assert.equal(green[i + 2], 0);
    }
  }
  assert.equal(hashes.size, 5);
});

test('isolated-organ cuts cannot erase an earlier crossing root; intensity only changes ink', () => {
  const c = createThornFixture(mask, { thornGrammar: 'hook' });
  const root = { x: 260, y: 230, nx: 1, ny: 0, width: 12, key: 8, strength: 1 };
  c.thornContourRoots = () => [root];
  const one = pixels(c.render());
  c.thornContourRoots = () => [root, { ...root, ny: 1, nx: 0, key: 9 }];
  const two = pixels(c.render());
  for (let i = 3; i < one.length; i += 4) assert.ok(two[i] >= one[i], 'source-over cannot reduce existing alpha');
  c.thornContourRoots = () => [root];
  root.strength = .5;
  const half = pixels(c.render());
  for (let i = 3; i < one.length; i += 4) assert.ok(Math.abs(half[i] - one[i] * .5) <= 1, 'single-organ alpha scales after carving');
});

test('real strength mask leaves root geometry stable through a uniform intensity ramp', () => {
  const c = createThornFixture(mask);
  const findRoots = c.thornContourRoots, captured = [];
  c.thornContourRoots = (...args) => {
    const roots = findRoots(...args);
    captured.push(plain(roots).map(({ strength, ...root }) => root));
    return roots;
  };
  for (const strength of [1, .1, .5, 1]) c.render(strength);
  captured.slice(1).forEach(roots => assert.deepEqual(roots, captured[0]));
});

test('needle weight responds below the old length-driven plateau', () => {
  const c = createThornFixture(mask), weights = [];
  c.thornContourRoots = (...args) => { weights.push(args[6]); return []; };
  for (const thornStroke of [.2, .8, 1.6, 2.4]) { c.params.thornStroke = thornStroke; c.render(); }
  for (let i = 1; i < weights.length; i++) assert.ok(weights[i] > weights[i - 1]);
});

test('Rooted bounds retain full-length faded tips and cover extreme organ envelopes', () => {
  const c = createThornFixture(mask);
  vm.runInContext(['thornRootedExtent', 'surfaceEffectPad', 'proofOperatorPad'].map(extract).join('\n'), c);
  let strength = 1;
  c.metrics = [{}]; c.batchProfileForKey = () => c.params;
  c.surfaceOperatorStrength = (_m, id) => id === 'thornCrown' ? strength : 0;
  const pad = c.surfaceEffectPad(); strength = .1;
  assert.equal(c.surfaceEffectPad(), pad, 'fade must not reduce geometric bounds');
  strength = 0; assert.equal(c.surfaceEffectPad(), 40, 'only the existing baseline export gutter remains');
  c.params.thornConstruction = 'legacy'; strength = .5;
  assert.equal(c.surfaceEffectPad(), 40 + Math.ceil(.5 * (c.params.thornLength * 1.25 + c.params.thornStroke * 8 + 12)));
  c.params.thornConstruction = 'rooted';
  for (const length of [1, 68, 360]) for (const curl of [-3, 3]) for (const family of families.slice(1)) {
    c.params.thornLength = length; c.params.thornStroke = 16;
    const rootWidth = (length * .05 + 16 * .65) * 1.35;
    const bound = c.thornRootedExtent(c.params);
    for (let seed = 0; seed < 20; seed++) {
      const paths = c.thornOrganPaths({ x: 0, y: 0, nx: 1, ny: 0 }, length * 1.15, rootWidth, curl, family, 4, 4, seed);
      for (const path of paths) assert.ok(path.outline.every(p => Math.hypot(p.x, p.y) <= bound));
    }
    assert.ok(c.proofOperatorPad('thornCrown', c.params) >= bound);
  }
});

test('mixed Legacy/Rooted glyphs dispatch separately without muted glyphs', () => {
  const c = createThornFixture(mask), calls = [];
  c.renderThornCrownLegacy = (_ctx, glyphs) => calls.push(['legacy', glyphs.map(g => g.id)]);
  c.renderThornRooted = (_ctx, glyphs) => calls.push(['rooted', glyphs.map(g => g.id)]);
  c.renderThornCrown({}, [{ id: 1, surface: { thornCrown: 1, thornConstruction: 'legacy' } },
    { id: 2, surface: { thornCrown: .5, thornConstruction: 'rooted' } },
    { id: 3, surface: { thornCrown: 0, thornConstruction: 'legacy' } }], 700, 520, 1, { s: 1 }, {}, false);
  assert.deepEqual(plain(calls), [['legacy', [1]], ['rooted', [2]]]);
});

test('extreme settings, thin small type and Japanese masks render without corrupting source', t => {
  let maxMs = 0;
  for (const [text, size, font] of [['BOUND', 28, 'Times New Roman'], ['永書', 100, 'Yu Mincho'], ['III', 64, 'Arial']]) {
    const source = textMask(text, size, font), before = pixels(source);
    for (const thornGrammar of families) for (const thornCurl of [-3, 3]) {
      const c = createThornFixture(source, { thornGrammar, thornCurl, thornLength: 360, thornDensity: 6, thornArmor: 4, thornBranches: 4, thornStroke: 16 });
      const start = performance.now(), result = c.render(); maxMs = Math.max(maxMs, performance.now() - start);
      assert.ok(sumAlpha(pixels(result)) > 0); assert.deepEqual(pixels(source), before);
    }
  }
  t.diagnostic(JSON.stringify({ maxMs: +maxMs.toFixed(1), scope: '700x520 native Canvas, isolated mask; not browser frame rate or long-document performance' }));
});

test('v45 defaults and actual load prelude preserve old projects as Legacy', () => {
  const c = createThornFixture(mask);
  c.PARAM_DEFAULTS = { ...c.params }; c.projectLoadError = () => '';
  // Execute the actual version/default-loading prelude, not the full UI loader.
  const loadPrelude = extract('loadProject').split('        // v20 and earlier')[0] + '\n return true;\n}';
  vm.runInContext(loadPrelude, c);
  assert.equal(c.params.thornConstruction, 'rooted');
  for (const version of [1, 43, 44]) {
    c.loadProject({ version, params: {} }, true);
    assert.equal(c.params.thornConstruction, 'legacy');
  }
  c.loadProject({ version: 45, params: {} }, true); assert.equal(c.params.thornConstruction, 'rooted');
  c.loadProject({ version: 44, params: { thornConstruction: 'rooted', thornClearance: 0 } }, true);
  assert.equal(c.params.thornConstruction, 'rooted'); assert.equal(c.params.thornClearance, 0);
  c.loadProject({ version: 45, params: JSON.parse(JSON.stringify(c.params)) }, true);
  assert.equal(c.params.thornConstruction, 'rooted'); assert.equal(c.params.thornClearance, 0);
  for (const key of ['thornConstruction', 'thornClearance']) {
    assert.ok(html.match(/var BATCH_PARAM_KEYS = \[[^]*?\n      \];/)[0].includes("'" + key + "'"));
    assert.ok(extract('snapshotGlyphs').includes(key + ': deform.' + key));
  }
  assert.ok(html.includes("bindProfileSelect('pThornConstruction', 'thornConstruction'"));
  assert.ok(html.includes("bindRange('pThornClearance', 'vThornClearance', 'thornClearance'"));
});
