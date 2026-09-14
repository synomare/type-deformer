import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createLigatureFixture, extract, html, pixels, textMask } from './ligature-counterbody-fixture.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const alphaSum = data => data.reduce((sum, value, index) => sum + (index % 4 === 3 ? value : 0), 0);
function alphaDiff(a, b) {
  let difference = 0, union = 0;
  for (let index = 3; index < a.length; index += 4) {
    difference += Math.abs(a[index] - b[index]);
    union += Math.max(a[index], b[index]);
  }
  return difference / Math.max(1, union);
}
function countComponents(data, width, height) {
  const ink = new Uint8Array(width * height);
  for (let index = 0; index < ink.length; index++) ink[index] = data[index * 4 + 3] > 36 ? 1 : 0;
  const seen = new Uint8Array(ink.length);
  const queue = new Int32Array(ink.length);
  let components = 0;
  for (let start = 0; start < ink.length; start++) {
    if (!ink[start] || seen[start]) continue;
    components++;
    let head = 0, tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    while (head < tail) {
      const cell = queue[head++];
      const x = cell % width;
      const neighbors = [x ? cell - 1 : -1, x + 1 < width ? cell + 1 : -1,
        cell >= width ? cell - width : -1, cell + width < ink.length ? cell + width : -1];
      for (const next of neighbors) if (next >= 0 && ink[next] && !seen[next]) {
        seen[next] = 1;
        queue[tail++] = next;
      }
    }
  }
  return components;
}

test('the four v29 Ligature Body grammars remain pixel-identical through the v62 wrapper', () => {
  const source = textMask('GLYPH', 132, 'Georgia', 720, 340);
  const fixture = createLigatureFixture(source, { ligatureBodyReach: 160 });
  for (const grammar of ['interlock', 'sharedStem', 'counterWeave', 'melt']) {
    assert.deepEqual(pixels(fixture.render(grammar)), pixels(fixture.render(grammar, true)), grammar);
  }
});

test('v62 starts new work in Compound counterbody while partial v29-v61 projects retain Interlock', () => {
  assert.ok(html.includes("ligatureBodyGrammar: 'counterbody'"));
  assert.ok(html.includes('<option value="counterbody" selected>Compound counterbody</option>'));
  assert.ok(html.includes("ligatureBodyGrammar: ['legacy', 'counterbody', 'interlock'"));
  assert.ok(html.includes("Number(data.version || 0) >= 29 && Number(data.version || 0) < 62"));
  assert.ok(html.includes("params.ligatureBodyGrammar = 'interlock'"));
  assert.ok(extract('projectData').includes('version: 92'));
  assert.ok(html.includes("a: 'td', v: 92"));
  assert.ok(html.includes('data.version > 92'));
});

test('Counterbody makes one source-specific word body instead of a renamed single bridge', () => {
  const hashes = new Set();
  for (const spec of [
    ['RITUAL', 128, 'Times New Roman'],
    ['結晶連結', 128, 'Yu Mincho'],
    ['aeon04', 52, 'Arial']
  ]) {
    const source = textMask(spec[0], spec[1], spec[2], 760, 340);
    const before = pixels(source.canvas);
    const fixture = createLigatureFixture(source, { ligatureBodyReach: 180 });
    const current = pixels(fixture.render('interlock'));
    const counterbody = pixels(fixture.render('counterbody'));
    assert.deepEqual(pixels(source.canvas), before, 'source mask remains immutable');
    assert.ok(alphaSum(counterbody) > alphaSum(before), `${spec[0]} grows a relational body`);
    assert.ok(alphaDiff(current, counterbody) > 0.045, `${spec[0]} is materially distinct from Interlock`);
    assert.ok(countComponents(counterbody, source.canvas.width, source.canvas.height)
      < countComponents(before, source.canvas.width, source.canvas.height), `${spec[0]} fuses components`);
    hashes.add(digest(counterbody));
  }
  assert.equal(hashes.size, 3);
});

test('word boundaries remain hard stops and reach zero returns the unchanged source body', () => {
  const source = textMask('RITE     BODY', 104, 'Georgia', 920, 340);
  const fixture = createLigatureFixture(source, { ligatureBodyReach: 180 });
  const result = pixels(fixture.render('counterbody'));
  const middleSpace = source.spaces[Math.floor(source.spaces.length / 2)];
  const startX = Math.round(middleSpace.x);
  const endX = Math.round(middleSpace.x + middleSpace.width);
  let spaceAlpha = 0;
  for (let y = 0; y < source.canvas.height; y++) for (let x = startX; x < endX; x++) {
    spaceAlpha += result[(y * source.canvas.width + x) * 4 + 3];
  }
  assert.equal(spaceAlpha, 0);
  fixture.params.ligatureBodyReach = 0;
  assert.equal(alphaDiff(pixels(fixture.render('counterbody')), pixels(source.canvas)), 0);
});

test('fusion, band, counter and signed tension remain independent structural axes', () => {
  const source = textMask('LIGATURE', 112, 'Times New Roman', 820, 340);
  const fixture = createLigatureFixture(source, { ligatureBodyReach: 180 });
  const baseline = pixels(fixture.render('counterbody'));
  for (const [key, value, threshold] of [
    ['ligatureBodyFusion', 3.4, 0.025],
    ['ligatureBodyBand', 42, 0.04],
    ['ligatureBodyCounter', 1.35, 0.01],
    ['ligatureBodyTension', -3.2, 0.012]
  ]) {
    Object.assign(fixture.params, { ...{ ligatureBodyFusion: 0.7, ligatureBodyBand: 12,
      ligatureBodyCounter: 0.42, ligatureBodyTension: 0.8 }, [key]: value });
    assert.ok(alphaDiff(baseline, pixels(fixture.render('counterbody'))) > threshold, key);
  }
});

test('declared destructive extremes are finite, deterministic and bounded', t => {
  const source = textMask('AMBIVALENT', 92, 'Georgia', 900, 380);
  const fixture = createLigatureFixture(source, {
    ligatureBodyFusion: 4,
    ligatureBodyReach: 1800,
    ligatureBodyBand: 240,
    ligatureBodyCounter: 1.5,
    ligatureBodyTension: -4
  });
  const started = performance.now();
  const first = pixels(fixture.render('counterbody'));
  const elapsedMs = performance.now() - started;
  const second = pixels(fixture.render('counterbody'));
  assert.deepEqual(first, second);
  assert.ok(first.every(Number.isFinite));
  assert.ok(alphaSum(first) > 1000);
  assert.ok(elapsedMs < 1200, `isolated native render exceeded hard guard: ${elapsedMs.toFixed(1)}ms`);
  t.diagnostic(JSON.stringify({ elapsedMs: +elapsedMs.toFixed(1), scope: '900x380 native Canvas, isolated FX; not browser FPS, export or iPhone' }));
});
