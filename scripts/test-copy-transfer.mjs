import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { canvas, fixture, textMask, html, extract } from './copy-transfer-fixture.mjs';
const pixels = c => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
const alpha = c => pixels(c).filter((_, i) => i % 4 === 3);
const sum = a => a.reduce((s, v) => s + v, 0);
const mask = textMask('B O', 90, 'Times New Roman', 380, 250);

test('transfer is wired to selector, Batch, snapshot and bounded output; nine older choices remain', () => {
  const c = fixture(mask);
  assert.equal(c.params.copyFailure, 'transfer');
  assert.equal(c.BATCH_PARAM_OPTIONS.copyFailure.length, 10);
  assert.ok(html.includes('<option value="transfer" selected>'));
  assert.ok(extract('snapshotGlyphs').includes('copyFailure: deform.copyFailure'));
  assert.ok(html.includes("bindProfileSelect('pCopyFailure', 'copyFailure'"));
  assert.ok(extract('sceneContentBounds').includes('copyTransferEffectPad(scene.glyphs)'));
  assert.ok(extract('surfaceEffectPad').includes('copyTransferPad(profile)'));
});

test('empty and unassigned source stays empty, source and background are not rewritten', () => {
  assert.equal(sum(alpha(fixture(canvas.createCanvas(120, 100)).render())), 0);
  const c = fixture(mask), original = pixels(mask);
  assert.equal(sum(alpha(c.render('transfer', 0))), 0);
  const a = pixels(c.render()); c.params.paper = '#fa0060';
  assert.deepEqual(pixels(c.render()), a); assert.deepEqual(pixels(mask), original);
  c.params.copyColor = '#e10011'; assert.notDeepEqual(pixels(c.render()), a);
});

test('assignment opacity is transported linearly, independently of developed shape', () => {
  const c = fixture(mask, { copyGenerations: 24, copyDust: 1.2 }), full = alpha(c.render());
  for (const strength of [.1, .25, .5]) {
    const low = alpha(c.render('transfer', strength));
    assert.ok(low.every((a, i) => Math.abs(a - full[i] * strength) <= 2));
  }
});

test('real per-glyph mask retains unequal assignments and excludes unapplied glyphs', () => {
  const c = fixture(canvas.createCanvas(600, 240), { fontFamily: 'Arial', fontSize: 110, fontWeight: 700,
    copyMotion: 0, copyInstability: 0, copyGenerations: 8 });
  vm.runInContext(extract('buildSurfaceMask') + '\n' + extract('drawSurfaceGlyph'), c);
  c.baselineOffset = () => 110;
  const glyph = (x, strength) => ({ ch: 'H', x, y: 50, w: 100, h: 110, ox: x, oy: 50, tx: 0, ty: 0,
    scaleX: 1, scaleY: 1, surface: { copyDecay: strength, ...c.params } });
  const glyphs = [glyph(30, 1), glyph(230, .25), glyph(430, 0)], output = canvas.createCanvas(600, 240);
  c.renderCopyDecay(output.getContext('2d'), glyphs, 600, 240, 1, { s: 1, dx: 0, dy: 0 }, {}, false);
  const a = alpha(output), columns = [0, 0, 0];
  a.forEach((v, i) => columns[Math.floor((i % 600) / 200)] += v);
  assert.ok(columns[0] > 0); assert.ok(columns[1] / columns[0] > .23 && columns[1] / columns[0] < .27);
  assert.equal(columns[2], 0);
});

test('actual transfer step uses previous generation and prefix remains reproducible', () => {
  const c = fixture(mask), w = 48, h = 48, count = w * h, original = new Float32Array(count);
  for (let y = 14; y < 34; y++) for (let x = 14; x < 34; x++) original[y * w + x] = 1;
  const options = { units: 1, x: 0, y: 0, dy: 0, seed: 41, phase: 0, motion: 28, instability: 1.5,
    toner: .4, erosion: 5, exposure: 0, dust: .5 }, fields = new Float32Array(count).fill(.04);
  const run = (initial, first, last) => {
    let ink = initial.slice(), mass = initial.slice();
    for (let n = first; n < last; n++) {
      const next = new Float32Array(count), nextMass = new Float32Array(count);
      c.copyTransferStep(ink, mass, next, nextMass, w, h, fields, options, n); ink = next; mass = nextMass;
    }
    return ink;
  };
  const eight = run(original, 0, 8);
  assert.deepEqual(run(eight, 8, 9), run(original, 0, 9));
  assert.notDeepEqual(run(original, 8, 9), run(original, 0, 9));
  assert.equal(sum(run(new Float32Array(count), 0, 12)), 0);
  assert.ok(sum(eight) < sum(original));
});

test('erasive and toner-heavy transfer are different material operations; all controls respond', () => {
  const c = fixture(mask, { copyGenerations: 16 }), base = alpha(c.render());
  for (const [key, value] of Object.entries({ copyGenerations: 32, copyMotion: -70, copyInstability: 4,
    copyToner: 2, copyErosion: 10, copyDust: 2, copyExposure: -1.2 })) {
    const old = c.params[key]; c.params[key] = value;
    assert.notDeepEqual(alpha(c.render()), base, key); c.params[key] = old;
  }
  c.params.copyErosion = 12; c.params.copyToner = 0;
  assert.ok(sum(alpha(c.render())) < sum(base) * .6);
  c.params.copyErosion = 0; c.params.copyToner = 3;
  assert.ok(sum(alpha(c.render())) > sum(base) * 1.2);
});

test('loop seam, Japanese/thin text and extreme settings are deterministic, finite and bounded', t => {
  let maxMs = 0;
  for (const [text, size, font] of [['thin &', 28, 'Times New Roman'], ['複写', 100, 'Yu Mincho']]) {
    const c = fixture(textMask(text, size, font, 460, 320));
    const start = performance.now(), a = pixels(c.render()); maxMs = Math.max(maxMs, performance.now() - start);
    assert.ok(a.some((v, i) => i % 4 === 3 && v)); assert.deepEqual(pixels(c.render('transfer', 1, 1)), a);
    const before = alpha(c.render('transfer', 1, .99999)), after = alpha(c.render('transfer', 1, .00001));
    assert.ok(sum(before.map((v, i) => Math.abs(v - after[i]))) / before.length < .02);
    Object.assign(c.params, { copyGenerations: 48, copyMotion: -640, copyInstability: 4, copyToner: 5,
      copyErosion: 24, copyDust: 4, copyExposure: -1.5 });
    assert.ok(alpha(c.render()).every(Number.isFinite)); // Deliberate full loss is valid.
  }
  t.diagnostic(JSON.stringify({ maxMs: +maxMs.toFixed(1), scope: 'native supplied460x320 masks; not browser FPS' }));
});

test('low strengths do not shrink full-width transport padding', () => {
  const c = fixture(mask), g = { surface: { ...c.params, copyDecay: .01, copyGenerations: 48, copyMotion: -640 } };
  const low = c.copyTransferEffectPad([g]); g.surface.copyDecay = 1;
  assert.equal(c.copyTransferEffectPad([g]), low); assert.ok(low > 640);
  g.surface.copyFailure = 'ghosting'; assert.equal(c.copyTransferEffectPad([g]), 0);
});

test('old renderer remains exact; v47 missing mode keeps ghosting and explicit choices survive', () => {
  const baselineFile = 'C:/Users/soran/AppData/Local/Temp/type-deformer-initial-operator-audit-20260904/renderer-functions.js';
  if (fs.existsSync(baselineFile)) {
    const old = fs.readFileSync(baselineFile, 'utf8').match(/^      function renderCopyDecay\([^]*?^      }/m)?.[0];
    if (old) assert.equal(extract('renderCopyDecay').replace(/        if \(failure === 'transfer'\) \{[^]*?        }\r?\n/, '').replace(/\r/g, ''), old.replace(/\r/g, ''));
  }
  const c = fixture(mask); c.PARAM_DEFAULTS = { ...c.params }; c.projectLoadError = () => '';
  vm.runInContext(extract('loadProject').split('        // v20 and earlier')[0] + '\n return true;\n}', c);
  c.loadProject({ version: 47, params: {} }, true); assert.equal(c.params.copyFailure, 'ghosting');
  c.loadProject({ version: 48, params: {} }, true); assert.equal(c.params.copyFailure, 'transfer');
  for (const mode of c.BATCH_PARAM_OPTIONS.copyFailure) {
    c.loadProject({ version: 47, params: { copyFailure: mode, copyGenerations: 31 } }, true);
    assert.equal(c.params.copyFailure, mode); assert.equal(c.params.copyGenerations, 31);
  }
  assert.ok(extract('projectData').includes('version: 92'));
});
