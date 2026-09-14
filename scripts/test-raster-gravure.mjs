import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { canvas, textMask, createRasterFixture } from './raster-gravure-fixture.mjs';

canvas.GlobalFonts.registerFromPath('C:/Windows/Fonts/yumin.ttf', 'Raster Test Yu Mincho');

function pixels(surface) {
  return surface.getContext('2d', { willReadFrequently: true })
    .getImageData(0, 0, surface.width, surface.height).data;
}
function countAlpha(surface) {
  const data = pixels(surface);
  let count = 0;
  for (let index = 3; index < data.length; index += 4) if (data[index]) count++;
  return count;
}
function edgeAlpha(surface) {
  const data = pixels(surface);
  let total = 0;
  for (let x = 0; x < surface.width; x++) {
    total += data[x * 4 + 3];
    total += data[((surface.height - 1) * surface.width + x) * 4 + 3];
  }
  for (let y = 1; y + 1 < surface.height; y++) {
    total += data[y * surface.width * 4 + 3];
    total += data[(y * surface.width + surface.width - 1) * 4 + 3];
  }
  return total;
}
function pngSha(surface) {
  return crypto.createHash('sha256').update(surface.toBuffer('image/png')).digest('hex');
}
function fieldFor(mask, fixture) {
  const source = mask.getContext('2d', { willReadFrequently: true })
    .getImageData(0, 0, mask.width, mask.height);
  return { source, field: fixture.surfaceBoundaryDistance(source.data, mask.width, mask.height) };
}

test('Gravure wells are deterministic, finite and obey their hard cell budget', () => {
  const mask = textMask('B&O', 210, 'Times New Roman', 600, 420);
  const fixture = createRasterFixture(mask, { rasterModulation: 2.4, rasterNoise: 0.7 });
  const { source, field } = fieldFor(mask, fixture);
  const args = [source.data, field, mask.width, mask.height, 6, 1.4, 0.31, 0.7,
    2.4, 1, 0.25, 41, 12, 0.6, 137];
  const first = fixture.rasterGravurePlanV58(...args);
  const second = fixture.rasterGravurePlanV58(...args);
  assert.deepEqual(first, second);
  assert.ok(first.length > 24 && first.length <= 137);
  assert.equal(first.budget, 137);
  assert.ok(first.candidates <= Math.max(2048, 137 * 24));
  for (const cell of first) {
    const values = Object.values(cell).filter(value => typeof value === 'number');
    assert.ok(values.every(Number.isFinite));
    assert.ok(cell.outerX > cell.innerX && cell.outerY > cell.innerY);
    assert.ok(cell.wallAlpha > 0 && cell.wallAlpha <= 1);
    assert.ok(cell.inkAlpha > 0 && cell.inkAlpha <= 1);
  }
});

test('Gravure is a closed loop with visible internal plate motion and legible small type', () => {
  const largeMask = textMask('RIFT', 190, 'Arial Black', 640, 440);
  const fixture = createRasterFixture(largeMask, { rasterModulation: 2.7, rasterNoise: 0.52 });
  const zero = fixture.render('gravure', 1, 0).toBuffer('image/png');
  const quarter = fixture.render('gravure', 1, 0.25).toBuffer('image/png');
  const one = fixture.render('gravure', 1, 1).toBuffer('image/png');
  assert.deepEqual(zero, one);
  assert.notDeepEqual(zero, quarter);
  const smallMask = textMask('press', 52, 'Georgia', 480, 300);
  const small = createRasterFixture(smallMask, { rasterCell: 4, rasterGain: 1.28 }).render('gravure');
  assert.ok(countAlpha(small) > 280);
  assert.equal(edgeAlpha(small), 0);
});

test('declared extremes stay bounded and never mutate the source mask', () => {
  const mask = textMask('印刷', 200, 'Raster Test Yu Mincho', 720, 520);
  const before = Buffer.from(pixels(mask));
  const fixture = createRasterFixture(mask, {
    rasterCell: 2,
    rasterGain: 3,
    rasterAngle: -90,
    rasterNoise: 2,
    rasterModulation: 4
  });
  const output = fixture.render('gravure', 1, 0.73);
  assert.ok(countAlpha(output) > 700);
  assert.equal(edgeAlpha(output), 0);
  assert.deepEqual(Buffer.from(pixels(mask)), before);
});

test('legacy and four existing modern grammars never enter the Gravure renderer', () => {
  const mask = textMask('MAP', 150, 'Arial Black', 520, 360);
  const fixture = createRasterFixture(mask);
  assert.ok(fixture.BATCH_PARAM_OPTIONS.rasterScreen.includes('gravure'));
  fixture.rasterGravurePlanV58 = () => { throw new Error('Gravure should not run'); };
  for (const mode of ['legacy', 'adaptive', 'stochastic', 'line', 'mezzotint']) {
    assert.ok(countAlpha(fixture.render(mode)) > 0, mode);
  }
});

test('existing modern Raster Press pixels retain the frozen v57 baseline', {
  skip: process.platform === 'win32' ? false : 'Frozen baseline uses the shipped Windows test fonts.'
}, () => {
  const cases = [
    ['B&O', 250, 'Times New Roman', 720, 520],
    ['RIFT', 205, 'Arial Black', 720, 520],
    ['印刷', 245, 'Raster Test Yu Mincho', 720, 520],
    ['press', 52, 'Georgia', 720, 520]
  ];
  const expected = {
    'B&O|250|720|520|adaptive': '50beda7fd6de1acacf05035bb4c9e6a95d6917f2b50ae7d2adc5a02143e0d093',
    'B&O|250|720|520|stochastic': 'b9716634047703013e9e1f669eb50ffb8bf3fdc96b53822365d93fa56c7540f8',
    'B&O|250|720|520|line': '588400077cac430b7373d6db822d77b8c7777005ea02abb33bf3de9e4ced9adc',
    'B&O|250|720|520|mezzotint': 'b9479abfc98c2664de306f314e0bec0d8b26bb1e19f31490fd76d71aa5808816',
    'RIFT|205|720|520|adaptive': 'd54c03d0e5809e6aec7a73908dcb9fe79fac9c039fd26f378ff8af68b94fbd52',
    'RIFT|205|720|520|stochastic': '38d95491792b11c7ed52a5ed6ee6cf901fae8e653e17fcead4d7df971612efe1',
    'RIFT|205|720|520|line': '54001a8d584afa598f5447a0cc291494a2e0d0467f3748fcef6935184a0679d4',
    'RIFT|205|720|520|mezzotint': '18b8dd57c025809fa47a13e3170a61c9b3223f44a1680b5adebdcc08e4fad867',
    '印刷|245|720|520|adaptive': '01b51cd57f35bb82930e471d757d98929b47c62bd1097cf4b0d470b38a04a6b7',
    '印刷|245|720|520|stochastic': '7245ad6cf4599098894dde357b0c3f70b330e85e8676e3709f250c9ba126c6f0',
    '印刷|245|720|520|line': '154b54e75dda11fb2d48184859a542e323ab825e235e4523307609de59d2a901',
    '印刷|245|720|520|mezzotint': '01601692de197a948b36381354619024125fa03cca4b3241de6fd80a17a6141d',
    'press|52|720|520|adaptive': '54128471cc6df09690ea3f5c236df983560c0ddc46543ea49120d869c87d9e34',
    'press|52|720|520|stochastic': '36cf3c0b6a64dc97681069b2fdd3b3380a16bff28726adc9cdb9c4c387e693ad',
    'press|52|720|520|line': 'c151537f053aa59e6a079387ffb7ed935fc39313266ec97bb5bb875680c847b8',
    'press|52|720|520|mezzotint': '5d198e716d68c32ec8c5a27838495ac712571119be4fb9fe4bd7cb6a934a7126'
  };
  for (const [text, size, font, width, height] of cases) {
    const mask = textMask(text, size, font, width, height);
    const fixture = createRasterFixture(mask, text === 'press' ? { rasterCell: 4, rasterGain: 1.28 } : {});
    for (const mode of ['adaptive', 'stochastic', 'line', 'mezzotint']) {
      const key = [text, size, width, height, mode].join('|');
      assert.equal(pngSha(fixture.render(mode)), expected[key], key);
    }
  }
});
