// Actual editor renderer in native Canvas; this is not browser, UI, export, or iPhone evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { canvas, textMask, texturaFixture } from './textura-matrix-fixture.mjs';

canvas.GlobalFonts.registerFromPath('C:/Windows/Fonts/yumin.ttf', 'Textura Test Yu Mincho');

function pixels(surface) {
  return surface.getContext('2d', { willReadFrequently: true })
    .getImageData(0, 0, surface.width, surface.height).data;
}
function countAlpha(surface) {
  const data = pixels(surface);
  let count = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i]) count++;
  return count;
}
function sumAlpha(surface) {
  const data = pixels(surface);
  let total = 0;
  for (let i = 3; i < data.length; i += 4) total += data[i];
  return total;
}
function pngSha(surface) {
  return crypto.createHash('sha256').update(surface.toBuffer('image/png')).digest('hex');
}
function sourceField(mask, fixture) {
  const source = mask.getContext('2d', { willReadFrequently: true })
    .getImageData(0, 0, mask.width, mask.height);
  return { source, field: fixture.surfaceBoundaryDistance(source.data, mask.width, mask.height) };
}

test('Medial Ductus is wired as a sixth Textura grammar and corner-safe tracing keeps one bent stroke intact', () => {
  const fixture = texturaFixture(textMask('L', 120, 'Arial', 280, 220));
  assert.deepEqual(Array.from(fixture.BATCH_PARAM_OPTIONS.texturaGrammar),
    ['stems', 'textura', 'ductus', 'fraktur', 'bastarda', 'lattice']);
  const skeleton = new Uint8Array(25);
  for (const index of [6, 7, 12]) skeleton[index] = 1;
  const traced = fixture.texturaDuctusTraceV60(skeleton, new Float32Array(25).fill(1), 5, 5);
  assert.equal(traced.paths.length, 1);
  assert.equal(Array.from(traced.degrees).filter(value => value > 2).length, 0);
  assert.deepEqual(Array.from(traced.degrees).filter(Boolean), [1, 2, 1]);
});

test('prepared-cache signature is phase-stable but invalidates for glyph geometry and strength', () => {
  const fixture = texturaFixture(textMask('B', 180, 'Georgia', 420, 300));
  const glyph = {
    ch: 'B', opacity: 1, x: 24, y: 32, w: 170, h: 210,
    ox: 0, oy: 0, tx: 0, ty: 0, rot: 0, skewX: 0, skewY: 0,
    scaleX: 1, scaleY: 1, grid: false, upright: false,
    surface: { texturaMatrix: 1 }
  };
  const signature = value => fixture.texturaDuctusSignatureV60(
    [value], 420, 300, 1, { s: 1, dx: 0, dy: 0 }, { ascent: 168, descent: 42 }
  );
  const first = signature(glyph);
  fixture.compositionState.phase = 0.73;
  assert.equal(signature({ ...glyph, surface: { ...glyph.surface } }), first);
  assert.notEqual(signature({ ...glyph, tx: 2 }), first);
  assert.notEqual(signature({ ...glyph, surface: { texturaMatrix: 0.5 } }), first);
  assert.notEqual(signature({ ...glyph, ch: 'R' }), first);
});

test('prepared medial skeleton is cached, bounded and preserves source-specific branches', t => {
  const mask = textMask('B&O', 220, 'Times New Roman', 680, 440);
  const fixture = texturaFixture(mask);
  const { source, field } = sourceField(mask, fixture);
  const start = performance.now();
  const first = fixture.texturaDuctusPrepareV60(source.data, mask.width, mask.height, field.bounds);
  const elapsed = performance.now() - start;
  const second = fixture.texturaDuctusPrepareV60(source.data, mask.width, mask.height, field.bounds);
  assert.strictEqual(first, second);
  assert.ok(first.paths.length >= 3 && first.junctions.length >= 1);
  assert.ok(first.stats.analysisWidth <= 366 && first.stats.analysisHeight <= 366);
  assert.ok(first.stats.skeletonPixels <= first.stats.analysisWidth * first.stats.analysisHeight);
  assert.ok(first.stats.pathCount <= first.stats.skeletonPixels);
  t.diagnostic(JSON.stringify({ prepareMs: +elapsed.toFixed(1), stats: first.stats,
    scope: '680x440 native Canvas isolated mask; not browser frame rate' }));
});

test('Ductus remains visible for serif, sans, Japanese, small type and punctuation without mutating masks', () => {
  const cases = [
    ['B&O', 220, 'Times New Roman', 680, 440],
    ['RITUAL', 160, 'Arial Black', 720, 400],
    ['永書', 210, 'Textura Test Yu Mincho', 680, 440],
    ['BOUND', 52, 'Arial', 600, 260],
    ['.?!', 92, 'Georgia', 420, 260]
  ];
  for (const spec of cases) {
    const mask = textMask(...spec), before = Buffer.from(pixels(mask));
    const output = texturaFixture(mask).render('ductus');
    assert.ok(countAlpha(output) > 30, spec[0]);
    assert.deepEqual(Buffer.from(pixels(mask)), before, spec[0]);
  }
});

test('nib angle, local width, split and closed phase are causally independent', () => {
  const mask = textMask('RITUAL', 170, 'Arial Black', 760, 400);
  const fixture = texturaFixture(mask, { texturaRhythm: 3.2 });
  const zero = fixture.render('ductus', 1, 0), one = fixture.render('ductus', 1, 1);
  assert.deepEqual(zero.toBuffer('image/png'), one.toBuffer('image/png'));
  assert.notDeepEqual(zero.toBuffer('image/png'), fixture.render('ductus', 1, 0.25).toBuffer('image/png'));
  fixture.params.texturaAngle = -90;
  const verticalNib = fixture.render('ductus');
  fixture.params.texturaAngle = 0;
  assert.notEqual(pngSha(verticalNib), pngSha(fixture.render('ductus')));
  fixture.params.texturaAngle = 42;
  fixture.params.texturaWeight = 0.1;
  const light = fixture.render('ductus');
  fixture.params.texturaWeight = 4;
  const heavy = fixture.render('ductus');
  assert.ok(sumAlpha(heavy) > sumAlpha(light));
  fixture.params.texturaSplit = 0;
  const whole = fixture.render('ductus');
  fixture.params.texturaSplit = 1;
  assert.notEqual(pngSha(whole), pngSha(fixture.render('ductus')));
});

test('declared extremes stay finite, bounded and preserve isolated marks', () => {
  const mask = textMask('永:i', 210, 'Textura Test Yu Mincho', 720, 460), before = Buffer.from(pixels(mask));
  const fixture = texturaFixture(mask, {
    texturaPitch: 2, texturaAngle: -90, texturaWeight: 4,
    texturaRhythm: 4, texturaSplit: 1, texturaSpur: 96
  });
  const { source, field } = sourceField(mask, fixture);
  const prepared = fixture.texturaDuctusPrepareV60(source.data, mask.width, mask.height, field.bounds);
  const geometry = fixture.texturaDuctusGeometryV60(prepared, {
    pitch: 2, angle: -90, weight: 4, rhythm: 4, split: 1, spur: 96, phase: 0.73
  });
  const numbers = [geometry.maxWidth,
    ...geometry.polygons.flatMap(polygon => polygon.points.flatMap(point => [point.x, point.y])),
    ...geometry.centerlines.flatMap(line => [line.a.x, line.a.y, line.b.x, line.b.y, line.width]),
    ...geometry.junctions.flatMap(node => [node.x, node.y, node.radius]),
    ...geometry.isolates.flatMap(node => [node.x, node.y, node.radius])];
  assert.ok(numbers.every(Number.isFinite));
  assert.ok(geometry.polygons.length <= prepared.stats.skeletonPixels * 2);
  assert.ok(countAlpha(fixture.render('ductus', 1, 0.73)) > 100);
  assert.deepEqual(Buffer.from(pixels(mask)), before);
});

test('effect color changes RGB but never geometry or alpha', () => {
  const mask = textMask('INK', 170, 'Arial Black', 600, 360);
  const fixture = texturaFixture(mask, { texturaColor: '#17140f' });
  const dark = fixture.render('ductus');
  fixture.params.texturaColor = '#00ff00';
  const green = fixture.render('ductus');
  assert.notEqual(pngSha(dark), pngSha(green));
  const a = pixels(dark), b = pixels(green);
  for (let i = 3; i < a.length; i += 4) assert.equal(a[i], b[i]);
});

test('the five existing Textura grammars retain their frozen v59 pixels', () => {
  const cases = [
    ['B&O', 220, 'Times New Roman', 680, 440],
    ['RITUAL', 160, 'Arial Black', 720, 400],
    ['永書', 210, 'Textura Test Yu Mincho', 680, 440],
    ['BOUND', 52, 'Arial', 600, 260]
  ];
  const expected = {
    'B&O|220|Times New Roman|680|440|stems': 'c31cefaebd161ee86a3ba8ec5fc2a59d7137b8b8dceb26f43a8a9903c6aa8c26',
    'B&O|220|Times New Roman|680|440|textura': 'c31cefaebd161ee86a3ba8ec5fc2a59d7137b8b8dceb26f43a8a9903c6aa8c26',
    'B&O|220|Times New Roman|680|440|fraktur': 'adcf84586c2645b859ff2ad84d4629be367ea01184a96f96c5d11dc4c021863a',
    'B&O|220|Times New Roman|680|440|bastarda': '7de502dde023ac8bb29f492bfce1a3911730a9f98421f870cfd5873beea1ba4e',
    'B&O|220|Times New Roman|680|440|lattice': '6486e2b6428feafa78d8bd82e5d3640f08c672cb8daa73ead16944991f495936',
    'RITUAL|160|Arial Black|720|400|stems': '2635ad98030fdb29f5e9705bb4212e1fc8762afb6f176a56cc68e832a3a2c26d',
    'RITUAL|160|Arial Black|720|400|textura': '2635ad98030fdb29f5e9705bb4212e1fc8762afb6f176a56cc68e832a3a2c26d',
    'RITUAL|160|Arial Black|720|400|fraktur': '627fe97ed02cc17fe30fd352e007f6acbb49329231f7b3b8b696f3d364434f74',
    'RITUAL|160|Arial Black|720|400|bastarda': '5f0ff3e5ec0d86c529bc52319dfc5b8c5450b6de9db2525ae58db834c6a71f99',
    'RITUAL|160|Arial Black|720|400|lattice': '490539a34f774eafa20f3e8e7fcaeaf263d4333ca89e4762433fbe24f6566c60',
    '永書|210|Textura Test Yu Mincho|680|440|stems': '00f92ece3a856390f3781f1757db94f4407e4267a32f4c2638bbf9aa4c2172f7',
    '永書|210|Textura Test Yu Mincho|680|440|textura': '00f92ece3a856390f3781f1757db94f4407e4267a32f4c2638bbf9aa4c2172f7',
    '永書|210|Textura Test Yu Mincho|680|440|fraktur': '727a40d72d0af1370a2564745ad9cf6a21a7d39e8b3c1f9cd883a02fee9f9d0b',
    '永書|210|Textura Test Yu Mincho|680|440|bastarda': 'a00a95c472c5b0bf7dca35e6946381300a1de3316e57f64cdebda5dc7e937955',
    '永書|210|Textura Test Yu Mincho|680|440|lattice': '9f4b507ce592d799ce1ed32be9d964f61e378a352b108c1215584c0539dae68c',
    'BOUND|52|Arial|600|260|stems': '7a762d0338c6832d87b7abfa551ff06f0dc2bfca9ef853c5b2b61a5050cc627c',
    'BOUND|52|Arial|600|260|textura': '7a762d0338c6832d87b7abfa551ff06f0dc2bfca9ef853c5b2b61a5050cc627c',
    'BOUND|52|Arial|600|260|fraktur': 'e0cb5b6cc628e0c4cc74db3109cf72cd94858c1c9dbf585feeda75bc7a809ff7',
    'BOUND|52|Arial|600|260|bastarda': '3e938f51e43f3a56b551e069533c92bc10b55d5b5b53b5e98e1f39b938e00fed',
    'BOUND|52|Arial|600|260|lattice': '7a0399f6a847a5c9c1c113403b274a3492cb8fab21f599038867ec2aac337a2b'
  };
  for (const spec of cases) {
    const mask = textMask(...spec), fixture = texturaFixture(mask);
    for (const mode of ['stems', 'textura', 'fraktur', 'bastarda', 'lattice']) {
      const key = [...spec, mode].join('|');
      assert.equal(pngSha(fixture.render(mode)), expected[key], key);
    }
  }
});

test('muted Ductus is empty and old grammars never enter its renderer', () => {
  const fixture = texturaFixture(textMask('MAP', 150, 'Arial Black', 520, 360));
  assert.equal(countAlpha(fixture.render('ductus', 0)), 0);
  fixture.renderTexturaDuctusV60 = () => { throw new Error('Ductus should not run'); };
  for (const mode of ['stems', 'textura', 'fraktur', 'bastarda', 'lattice']) {
    assert.ok(countAlpha(fixture.render(mode)) > 0, mode);
  }
});
