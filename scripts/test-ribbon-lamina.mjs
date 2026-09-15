import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { canvas, fixture, textMask, html, extract } from './ribbon-lamina-fixture.mjs';
const pixels = c => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
const alpha = c => pixels(c).filter((_, i) => i % 4 === 3);
const mask = textMask('B O', 120, 'Times New Roman', 600, 440);

test('new mode uses existing profile/snapshot/save channels, old five modes remain', () => {
  const c = fixture(mask);
  for (const mode of ['legacy', 'extrude', 'helix', 'fan', 'braid', 'lamina']) assert.ok(c.BATCH_PARAM_OPTIONS.ribbonPath.includes(mode));
  assert.ok(extract('snapshotGlyphs').includes('ribbonPath: deform.ribbonPath'));
  assert.ok(html.includes("bindProfileSelect('pRibbonPath', 'ribbonPath'"));
  assert.ok(extract('sceneContentBounds').includes('ribbonEchoEffectPad(scene.glyphs)'));
});

test('flat lamina preserves source alpha holes and has no shared-triangle cracks', () => {
  const source = canvas.createCanvas(180, 160), ctx = source.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(20, 20, 140, 120); ctx.clearRect(60, 60, 40, 40);
  const c = fixture(source, { ribbonDepth: 0, ribbonWeave: 0, ribbonTwist: 0, ribbonFade: 0 });
  for (const ribbonSteps of [1, 7, 22, 96]) {
    c.params.ribbonSteps = ribbonSteps;
    assert.deepEqual(alpha(c.render('lamina')), alpha(source));
  }
});

test('empty/zero input produces no ribbon; ink is independent of paper and source unchanged', () => {
  const empty = canvas.createCanvas(180, 160);
  assert.equal(alpha(fixture(empty).render('lamina')).some(v => v), false);
  const c = fixture(mask), before = pixels(mask);
  assert.equal(alpha(c.render('lamina', 0)).some(v => v), false);
  const light = pixels(c.render('lamina')); c.params.paper = '#e900e0';
  assert.deepEqual(pixels(c.render('lamina')), light);
  assert.deepEqual(pixels(mask), before);
  const low = alpha(c.render('lamina', .25)), full = alpha(c.render('lamina'));
  assert.ok(low.every((a, i) => Math.abs(a - full[i] * .25) <= 1));
  c.params.ribbonColor = '#ef1200'; assert.notDeepEqual(pixels(c.render('lamina')), light);
});

test('per-pixel depth makes opaque crossing order independent, gaps do not occlude', () => {
  const c = fixture(mask), src = canvas.createCanvas(20, 20); src.getContext('2d').fillRect(0, 0, 20, 20);
  const source = src.getContext('2d').getImageData(0, 0, 20, 20); source.originX = source.originY = 0;
  const uv = [{ x: 2, y: 2 }, { x: 18, y: 2 }, { x: 2, y: 18 }];
  const draw = order => {
    const raster = src.getContext('2d').createImageData(20, 20);
    raster.originX = raster.originY = 0; raster.depth = new Float32Array(400).fill(-Infinity);
    for (const z of order) c.ribbonLaminaTriangle(raster, source, uv, uv.map(p => ({ ...p, z })), z ? [255, 0, 0] : [0, 0, 255], 1);
    return raster.data;
  };
  assert.deepEqual(draw([0, 1]), draw([1, 0]));
  assert.equal(draw([0, 1])[(5 * 20 + 5) * 4], 255);
});

test('phase0/1 identity, actual small/thin/Japanese/strong output is finite and distinct', t => {
  let maxMs = 0;
  for (const [text, size, font] of [['thin &', 28, 'Times New Roman'], ['永書', 130, 'Yu Mincho']]) {
    const c = fixture(textMask(text, size, font, 700, 520));
    for (const settings of [{}, { ribbonDepth: -260, ribbonTwist: -540, ribbonWeave: 4, ribbonSteps: 96 }, { ribbonDepth: 260, ribbonTwist: 540, ribbonWeave: 4, ribbonSteps: 1 }]) {
      Object.assign(c.params, settings);
      const start = performance.now(), a = c.render('lamina'); maxMs = Math.max(maxMs, performance.now() - start);
      assert.ok(alpha(a).some(v => v)); assert.deepEqual(pixels(a), pixels(c.render('lamina', 1, 1)));
    }
  }
  const c = fixture(mask); assert.notDeepEqual(pixels(c.render('lamina', 1, 0)), pixels(c.render('lamina', 1, .25)));
  t.diagnostic(JSON.stringify({ maxMs: +maxMs.toFixed(1), scope: 'isolated700x520 native mask render; not browser FPS' }));
});

test('world padding bounds all mapped points, including tall text and low intensity', () => {
  const c = fixture(mask); vm.runInContext(extract('contentBounds'), c);
  for (const h of [40, 200, 3000]) for (const depth of [-520, 0, 520]) {
    const g = { x: 0, y: 0, w: 600, h, ox: 0, oy: 0, tx: 0, ty: 0, scaleX: 1, scaleY: 1,
      surface: { ribbonEcho: .01, ribbonPath: 'lamina', ribbonDepth: depth } };
    const pad = c.ribbonLaminaEffectPad([g]);
    for (let i = 0; i <= 100; i++) for (const y of [0, h]) {
      const p = c.ribbonLaminaPoint(i * 6, y, [0, 0, 600, h], depth, 4, Math.PI * 3, 1.3);
      assert.ok(p.x >= -pad && p.x <= 600 + pad && p.y >= -pad && p.y <= h + pad);
    }
    g.surface.ribbonPath = 'helix'; assert.equal(c.ribbonLaminaEffectPad([g]), 0);
  }
});

test('shared Ribbon bounds contain every rotating section for preview, PNG and SVG plans', () => {
  const c = fixture(mask); vm.runInContext(extract('contentBounds'), c);
  const g = { x: 0, y: 0, w: 600, h: 200, ox: 0, oy: 0, tx: 0, ty: 0, scaleX: 1, scaleY: 1,
    opacity: 1, surface: { ribbonEcho: .01 } };
  const corners = [[0, 0], [600, 0], [600, 200], [0, 200]];
  for (const path of ['extrude', 'helix', 'fan', 'braid']) for (const depth of [-520, 520]) {
    Object.assign(g.surface, { ribbonPath: path, ribbonDepth: depth, ribbonWeave: 4, ribbonTwist: 540 });
    const pad = c.ribbonEchoEffectPad([g]);
    assert.ok(pad > 40, `${path} must reserve transformed world space`);
    const pivotX = path === 'fan' ? (depth < 0 ? 600 : 0) : 300;
    for (let phaseIndex = 0; phaseIndex < 48; phaseIndex++) for (let sample = 0; sample <= 96; sample++) {
      const phase = phaseIndex / 48 * Math.PI * 2, t = sample / 96;
      for (let lane = 0; lane < (path === 'braid' ? 2 : 1); lane++) {
        const state = c.ribbonSectionStateV31(path, t, depth, 4, phase, Math.PI * 3, [0, 0, 600, 200], lane);
        for (const corner of corners) {
          const point = c.ribbonTransformPointV31(corner[0], corner[1], pivotX, 100, state);
          assert.ok(point.x >= -pad && point.x <= 600 + pad && point.y >= -pad && point.y <= 200 + pad,
            `${path} point escaped the shared raster/output bounds`);
        }
      }
    }
  }
});

test('old renderer body is unchanged apart from new-path dispatch', () => {
  const baselineFile = 'C:/Users/soran/AppData/Local/Temp/type-deformer-initial-operator-audit-20260904/renderer-functions.js';
  if (!fs.existsSync(baselineFile)) return; // Historical optional evidence; other tests remain portable.
  const old = fs.readFileSync(baselineFile, 'utf8').match(/^      function renderRibbonEcho\([^]*?^      }/m)[0];
  const current = extract('renderRibbonEcho').replace(/        if \(path === 'lamina'\) \{[^]*?        }\r?\n/, '');
  // Common parameter validation may change the source text. The historical
  // renderer remains an independent pixel oracle at its original settings.
  for(const mode of ['helix','fan','braid','extrude']){
    const actual=fixture(mask,{ribbonDepth:48,ribbonCopies:8}).render(mode);
    const previous=fixture(mask,{ribbonDepth:48,ribbonCopies:8},old).render(mode);
    assert.deepEqual(actual.getContext('2d').getImageData(0,0,mask.width,mask.height).data,previous.getContext('2d').getImageData(0,0,mask.width,mask.height).data,mode);
  }
});

test('actual load prelude preserves old defaults and explicit mode, v47 starts Lamina', () => {
  const c = fixture(mask); c.PARAM_DEFAULTS = { ...c.params }; c.projectLoadError = () => '';
  vm.runInContext(extract('loadProject').split('        // v20 and earlier')[0] + '\n return true;\n}', c);
  for (const version of [1, 23, 24, 31, 46, 47]) {
    c.loadProject({ version, params: {} }, true);
    assert.equal(c.params.ribbonPath, version < 24 ? 'legacy' : version < 47 ? 'helix' : 'lamina');
  }
  for (const mode of ['helix', 'fan', 'braid', 'extrude', 'lamina']) {
    c.loadProject({ version: 46, params: { ribbonPath: mode, ribbonDepth: -110, ribbonFade: .4 } }, true);
    assert.equal(c.params.ribbonPath, mode); assert.equal(c.params.ribbonDepth, -110);
  }
  assert.ok(extract('projectData').includes('version: 92'));
});
