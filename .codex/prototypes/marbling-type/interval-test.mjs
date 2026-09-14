import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { prepareMarblingGlyph, createMarblingMap, MARBLING_PRESETS } from './core.mjs';
import { marblingInkSupport } from './ink-support.mjs';

// Differential oracle changes ONLY constant-jet translation back to its old
// algebra. All other operations use current source, so future material design
// changes need not maintain an obsolete whole-operator fixture.
const source = (await fs.readFile(new URL('core.mjs', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?$/gm, '').replace(/^export /gm, '');
const pattern = /const shift = \(a, b\) => \(\{[\s\S]*?\n\}\);/;
assert.equal((source.match(new RegExp(pattern.source, 'g')) || []).length, 1, 'translation optimization oracle anchor');
function api(original) {
  const code = original ? source.replace(pattern, 'const shift = (a, b) => add(a, { v: [b, b], d: [0, 0], dd: [0, 0] });') : source;
  const context = vm.createContext({ marblingInkSupport });
  new vm.Script(code + ';globalThis.api={shift,createMarblingMap};').runInContext(context);
  return context.api;
}
const baseline = api(true), candidate = api(false);
const scalarCases = [0, -0, 1, -1, 1e-300, -1e-300, 1e300, -1e300, Infinity, -Infinity, NaN];
let endpointChecks = 0;
function compareJet(a, b) {
  for (const part of ['v', 'd', 'dd']) for (let i = 0; i < 2; i++) {
    assert.ok(Object.is(a[part][i], b[part][i]), `bit-identical ${part}[${i}], including signed zero/non-finite fallback`);
    endpointChecks++;
  }
}
for (const lo of scalarCases) for (const hi of scalarCases) for (const offset of scalarCases) {
  const jet = { v: [lo, hi], d: [hi, lo], dd: [lo, hi] };
  const before = structuredClone(jet);
  compareJet(candidate.shift(jet, offset), baseline.shift(jet, offset));
  assert.deepEqual(jet, before);
}
for (let i = 0; i < 1000; i++) {
  const size = 10 ** (i % 24 - 12), value = Math.sin(i * 7.13) * size;
  const jet = { v: [value - size, value + size], d: [-size / 3, size / 2], dd: [-size * 3, size * 7] };
  compareJet(candidate.shift(jet, Math.cos(i) * size), baseline.shift(jet, Math.cos(i) * size));
}

const ellipse = (n, r, orientation = 1) => ({ points: Array.from({ length: n }, (_, i) => ({
  x: Math.cos(i * Math.PI * 2 / n * orientation) * r, y: Math.sin(i * Math.PI * 2 / n * orientation) * r * 1.3,
})) });
const glyph = prepareMarblingGlyph([ellipse(96, 90), ellipse(48, 28, -1)]);
let bounds = 0;
for (const preset of Object.values(MARBLING_PRESETS)) for (const override of [ {}, { amount: 0 },
  { amount: 4, pitch: 12, circulation: -4, focus: 1, angle: -180, motion: 1 },
  { amount: 4, pitch: 180, circulation: 4, focus: 0, angle: 180, motion: 1 } ]) {
  for (const phase of [0, .137, .5, .999999]) {
    const settings = { ...preset, ...override }, a = createMarblingMap(glyph, settings, phase), b = baseline.createMarblingMap(glyph, settings, phase);
    for (let i = 0; i < 120; i++) {
      const p = { x: Math.sin(i * 1.7) * 300, y: Math.cos(i * 2.3) * 300 };
      const q = { x: p.x + Math.sin(i * .7) * (i % 20 + .01), y: p.y + Math.cos(i * .3) * (i % 13 + .01) };
      assert.ok(Object.is(a.chordErrorBound(p, q), b.chordErrorBound(p, q)));
      const box = [Math.min(p.x, q.x), Math.min(p.y, q.y), Math.max(p.x, q.x), Math.max(p.y, q.y)];
      assert.ok(Object.is(a.derivativeBoundForBox(box), b.derivativeBoundForBox(box)));
      for (const method of ['map', 'inverse']) {
        const ap = a[method](p), bp = b[method](p); assert.ok(Object.is(ap.x, bp.x) && Object.is(ap.y, bp.y));
      }
      bounds++;
    }
  }
}
console.log(JSON.stringify({ status: 'pass', endpointChecks, mapAndBoundCases: bounds,
  checks: 'bit-identical constant-jet translation, signed zero/non-finite fallback, immutable input, complete map/chord/box/inverse parity at defaults/zero/extreme controls',
  scope: 'numeric optimization regression, not browser performance or all-font topology' }));
