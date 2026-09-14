import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createPrismFixture, extract, html, pixels, textMask } from './prism-birefringence-fixture.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const normalized = value => value.replace(/\r\n/g, '\n').trim();
const alphaSum = data => data.reduce((sum, value, index) => sum + (index % 4 === 3 ? value : 0), 0);
function alphaDiff(a, b) {
  let difference = 0, union = 0;
  for (let index = 3; index < a.length; index += 4) {
    difference += Math.abs(a[index] - b[index]);
    union += Math.max(a[index], b[index]);
  }
  return difference / Math.max(1, union);
}
function rgbaDiff(a, b) {
  let difference = 0, scale = 0;
  for (let index = 0; index < a.length; index++) {
    difference += Math.abs(a[index] - b[index]);
    scale += Math.max(a[index], b[index]);
  }
  return difference / Math.max(1, scale);
}
function offMaskAlpha(effect, source) {
  const effectPixels = pixels(effect), sourcePixels = pixels(source);
  let sum = 0;
  for (let index = 3; index < effectPixels.length; index += 4) if (sourcePixels[index] <= 20) sum += effectPixels[index];
  return sum;
}

test('the five pre-v61 optical bodies remain pixel-identical through the dispatch wrapper', () => {
  const baseline = fs.readFileSync(new URL('./fixtures/prism-v23-before-shared-quality.js',import.meta.url),'utf8');
  const oldBody = normalized(baseline
    .replace('function renderPrismSacramentV23(', 'function renderPrismSacrament('));
  assert.equal(digest(oldBody), '54c6ff04e4a1e794346a6376aa0a9df1503543418762448e4d24d074050888a2');
  const fixture = createPrismFixture(textMask('B&8', 132, 'Georgia', 460, 300), { prismBloom: 46, prismDispersion: 22 });
  for (const optics of ['legacy', 'crystal', 'fresnel', 'spectral', 'lenticular']) {
    const actual=pixels(fixture.render(optics));
    const old=createPrismFixture(textMask('B&8',132,'Georgia',460,300),{prismBloom:46,prismDispersion:22});vm.runInContext(baseline,old.context);
    assert.deepEqual(actual,pixels(old.render(optics,0,false,true)),optics);
  }
});

test('v61 starts new work in Birefringent while partial v23-v60 projects retain Cut crystal', () => {
  assert.ok(html.includes("prismOptics: 'birefringent'"));
  assert.ok(html.includes('<option value="birefringent" selected>Birefringent field</option>'));
  assert.ok(html.includes("Number(data.version || 0) >= 23 && Number(data.version || 0) < 61"));
  assert.ok(html.includes("params.prismOptics = 'crystal'"));
  assert.ok(extract('projectData').includes('version: 92'));
  assert.ok(html.includes("a: 'td', v: 92"));
  assert.ok(html.includes('data.version > 92'));
});

test('birefringent body is deterministic, source-specific and not a renamed current crystal', () => {
  const hashes = new Set();
  for (const spec of [
    ['SACRAMENT', 92, 'Times New Roman'],
    ['永晶', 126, 'Yu Mincho'],
    ['aegis 04', 42, 'Arial']
  ]) {
    const source = textMask(spec[0], spec[1], spec[2], 520, 300);
    const before = pixels(source.canvas);
    const fixture = createPrismFixture(source, { prismBloom: 64 });
    const first = pixels(fixture.render('birefringent'));
    const second = pixels(fixture.render('birefringent'));
    assert.deepEqual(first, second);
    assert.deepEqual(pixels(source.canvas), before, 'source mask remains immutable');
    assert.ok(alphaSum(first) > 3000, `${spec[0]} remains visible`);
    assert.ok(rgbaDiff(first, pixels(fixture.render('crystal'))) > 0.12, `${spec[0]} is materially distinct`);
    hashes.add(digest(first));
  }
  assert.equal(hashes.size, 3);
});

test('caustics originate from actual mask boundaries and bloom can be fully disabled', () => {
  const source = textMask('O8', 148, 'Georgia', 480, 320);
  const fixture = createPrismFixture(source, { prismBloom: 92, prismCaustic: 2.4, prismFacets: 12 });
  const sourcePixels = pixels(source.canvas);
  const field = fixture.context.surfaceBoundaryDistance(sourcePixels, source.canvas.width, source.canvas.height);
  const emitters = fixture.context.prismBoundaryEmittersV61(field, source.canvas.width, source.canvas.height,
    12, 48, 41, 0, -0.68);
  assert.ok(emitters.length >= 4);
  for (const emitter of emitters) {
    const index = emitter.y * source.canvas.width + emitter.x;
    assert.equal(field.inside[index], 1);
    assert.ok(field.distance[index] <= 0.01);
    assert.ok(Math.abs(Math.hypot(emitter.nx, emitter.ny) - 1) < 1e-6);
  }
  const active = fixture.render('birefringent');
  assert.ok(offMaskAlpha(active, source.canvas) > 1000);
  fixture.params.prismCaustic = 0;
  assert.equal(offMaskAlpha(fixture.render('birefringent'), source.canvas), 0);
});

test('ordinary and extraordinary inks, facet count and destructive ranges stay independent', () => {
  const source = textMask('AXIS', 112, 'Times New Roman', 520, 320);
  const fixture = createPrismFixture(source, { prismBloom: 72 });
  const baseline = pixels(fixture.render('birefringent'));
  fixture.params.prismColorA = '#11ff33';
  assert.ok(rgbaDiff(baseline, pixels(fixture.render('birefringent'))) > 0.08);
  fixture.params.prismColorB = '#ffe400';
  const recolored = pixels(fixture.render('birefringent'));
  assert.ok(rgbaDiff(baseline, recolored) > 0.12);
  fixture.params.prismFacets = 32;
  assert.ok(rgbaDiff(recolored, pixels(fixture.render('birefringent'))) > 0.025);
  for (const settings of [
    { prismRefraction: -4, prismDispersion: 320, prismFacets: 1, prismIridescence: 0, prismCaustic: 6, prismBloom: 180 },
    { prismRefraction: 4, prismDispersion: 0, prismFacets: 32, prismIridescence: 4, prismCaustic: 0, prismBloom: 0 }
  ]) {
    Object.assign(fixture.params, settings);
    const result = pixels(fixture.render('birefringent'));
    assert.equal(result.length, source.canvas.width * source.canvas.height * 4);
    assert.ok(result.every(Number.isFinite));
    assert.ok(alphaSum(result) > 1000);
  }
});

test('Compose is a closed optical cycle and disabled motion is static', () => {
  const fixture = createPrismFixture(textMask('PHASE', 104, 'Georgia', 500, 300), { prismBloom: 58 });
  assert.deepEqual(pixels(fixture.render('birefringent', 0, true)), pixels(fixture.render('birefringent', 1, true)));
  assert.deepEqual(pixels(fixture.render('birefringent', 0.17, false)), pixels(fixture.render('birefringent', 0.83, false)));
  assert.ok(rgbaDiff(pixels(fixture.render('birefringent', 0, true)), pixels(fixture.render('birefringent', 0.37, true))) > 0.01);
});

test('native rendering remains bounded at the comparison viewport', t => {
  const fixture = createPrismFixture(textMask('B&永', 150, 'Yu Mincho', 700, 420), {
    prismIridescence: 3.2,
    prismDispersion: 88,
    prismFacets: 18,
    prismCaustic: 3.4,
    prismBloom: 136
  });
  const started = performance.now();
  const result = pixels(fixture.render('birefringent', 0.41, true));
  const elapsedMs = performance.now() - started;
  assert.ok(alphaSum(result) > 1000);
  assert.ok(elapsedMs < 2200, `isolated native render exceeded hard guard: ${elapsedMs.toFixed(1)}ms`);
  t.diagnostic(JSON.stringify({ elapsedMs: +elapsedMs.toFixed(1), scope: '700x420 native Canvas, isolated FX; not browser FPS, Compose scene, export, or iPhone' }));
});
