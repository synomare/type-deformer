import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Execute the shipped functions, not a second implementation of the geometry.
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const names = ['spectralTraceContours', 'spectralBasis', 'spectralCompileContour', 'spectralContourContains', 'spectralPrepareGlyphContours', 'spectralSynthesize'];
const extract = name => {
  const match = html.match(new RegExp('^      function ' + name + '\\([\\s\\S]*?^      \\}', 'm'));
  assert.ok(match, 'Missing shipped function: ' + name);
  return match[0];
};
const runtime = vm.createContext({ spectralBasisCache: new Map() });
new vm.Script(names.map(extract).join('\n')).runInContext(runtime);
const rgba = (w, h, fn) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[(y * w + x) * 4 + 3] = fn(x, y) ? 255 : 0;
  return data;
};
const w = 96, h = 112;
const mask = rgba(w, h, (x, y) => {
  const outer = ((x - 47) / 36) ** 2 + ((y - 57) / 48) ** 2 < 1;
  const hole = ((x - 49) / 17) ** 2 + ((y - 55) / 24) ** 2 < 1;
  return (outer && !hole) || (x > 82 && x < 87 && y > 3 && y < 8);
});
const loops = runtime.spectralTraceContours(mask, w, h);
assert.equal(loops.length, 3, 'Outer body, counter and detached dot must all survive');
assert.equal(loops.filter(c => c.area < 0).length, 1, 'Counter winding must be distinct');
// For a binary mask, midpoint interpolation trims convex pixel corners and
// restores concave ones: a half-pixel area correction per Euler component.
const inkPixels = mask.filter((v, i) => i % 4 === 3 && v > 0).length;
assert.equal(loops.reduce((sum, c) => sum + c.area, 0), inkPixels - 0.5, 'Alpha contour follows midpoint geometry, not filled pixel boxes');
assert.equal(runtime.spectralTraceContours(rgba(2, 2, (x, y) => x === y), 2, 2).length, 2, 'Diagonal islands must not be welded');
assert.equal(runtime.spectralTraceContours(rgba(8, 8, () => true), 8, 8)[0].area, 63.5, 'Zero padding closes edge-touching midpoint contours');
assert.equal(runtime.spectralTraceContours(rgba(8, 8, () => false), 8, 8).length, 0, 'Empty mask cannot synthesize a mark');
const nested = runtime.spectralTraceContours(rgba(15, 15, (x, y) =>
  (x >= 1 && x <= 13 && y >= 1 && y <= 13 && !(x >= 3 && x <= 11 && y >= 3 && y <= 11)) ||
  (x >= 6 && x <= 8 && y >= 6 && y <= 8)), 15, 15);
assert.equal(nested.length, 3, 'Nested island-counter-island topology survives');
const contours = runtime.spectralPrepareGlyphContours(loops.map(c => runtime.spectralCompileContour(c, 0, 0)));
const bodyIndex = contours.findIndex(c => c.area > 100);
const holeIndex = contours.findIndex(c => c.area < 0);
const dot = contours.find(c => c.area > 0 && c.area < 100);
assert.equal(contours[holeIndex].parent, bodyIndex, 'Counter belongs to its material region');
assert.equal(contours[bodyIndex].materialArea, contours[bodyIndex].area + contours[holeIndex].area, 'Fold depth uses ink area, not the area of the enclosing bowl');
assert.ok(dot.foldScale < contours[bodyIndex].foldScale, 'Detached dots receive fewer folds than the body');
assert.ok(dot.foldDepth < contours[bodyIndex].foldDepth, 'Tiny components cannot acquire full-body fold depth');
assert.ok(dot.foldDepth < 2, 'No artificial two-pixel depth floor on small marks');
const nestedContours = runtime.spectralPrepareGlyphContours(nested.map(c => runtime.spectralCompileContour(c, 0, 0)));
const island = nestedContours.find(c => c.area === 8.5);
const enclosingHole = nestedContours.findIndex(c => c.area < 0);
assert.equal(island.parent, enclosingHole, 'Positive island remains nested inside the counter');
assert.equal(island.materialArea, 8.5, 'Nested island owns its ink, not its negative parent');
const loneMark = runtime.spectralPrepareGlyphContours(runtime.spectralTraceContours(rgba(8, 8, (x, y) => x > 2 && x < 6 && y > 2 && y < 6), 8, 8)
  .map(c => runtime.spectralCompileContour(c, 0, 0)))[0];
assert.ok(loneMark.foldScale < 0.2, 'Standalone punctuation is scaled against the em, not treated as a full-em body');
const thinRing = runtime.spectralPrepareGlyphContours(runtime.spectralTraceContours(rgba(22, 22, (x, y) =>
  x >= 1 && x <= 20 && y >= 1 && y <= 20 && !(x >= 2 && x <= 19 && y >= 2 && y <= 19)), 22, 22)
  .map(c => runtime.spectralCompileContour(c, 0, 0)));
const thinBody = thinRing.find(c => c.area > 0);
assert.equal(thinBody.materialArea, 76);
assert.ok(thinBody.foldDepth < 1, 'Hairline ring retains a sub-pixel fold budget with interpolated perimeter');
const openBowl = runtime.spectralPrepareGlyphContours(runtime.spectralTraceContours(rgba(32, 32, (x, y) =>
  (x >= 2 && x <= 28 && y >= 2 && y <= 28 && (x <= 6 || x >= 24 || y >= 24)) ||
  (x >= 13 && x <= 15 && y >= 8 && y <= 10)), 32, 32)
  .map(c => runtime.spectralCompileContour(c, 0, 0)));
assert.equal(openBowl.find(c => c.area === 8.5).parent, -1, 'An open counter does not own a detached mark merely inside its bounding box');
const hierarchySignature = list => JSON.stringify(list.map(c => ({ area: c.area, material: c.materialArea,
  perimeter: c.materialPerimeter, scale: c.foldScale, depth: c.foldDepth,
  parentArea: c.parent >= 0 ? list[c.parent].area : null })).sort((a, b) => a.area - b.area));
const hierarchyBefore = hierarchySignature(contours);
runtime.spectralPrepareGlyphContours(contours);
assert.equal(hierarchySignature(contours), hierarchyBefore, 'Reanalysis cannot repeatedly subtract a counter');
const reordered = runtime.spectralPrepareGlyphContours(loops.slice().reverse().map(c => runtime.spectralCompileContour(c, 0, 0)));
assert.equal(hierarchySignature(reordered), hierarchyBefore, 'Material hierarchy cannot depend on contour discovery order');
// Exhaust every 3x3 binary neighbourhood against an independent flood-fill
// oracle. Foreground is 4-connected; padded background is 8-connected.
const components = (values, size, target, diagonal) => {
  const seen = new Set(); let count = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] !== target || seen.has(i)) continue;
    count++; const queue = [i]; seen.add(i);
    for (let head = 0; head < queue.length; head++) {
      const px = queue[head] % size, py = Math.floor(queue[head] / size);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || (!diagonal && dx && dy)) continue;
        const nx = px + dx, ny = py + dy, key = ny * size + nx;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size || values[key] !== target || seen.has(key)) continue;
        seen.add(key); queue.push(key);
      }
    }
  }
  return count;
};
for (let pattern = 0; pattern < 512; pattern++) {
  const binary = Array.from({length: 9}, (_, i) => (pattern >> i) & 1);
  const padded = Array.from({length: 25}, (_, i) => {
    const x = i % 5 - 1, y = Math.floor(i / 5) - 1;
    return x >= 0 && x < 3 && y >= 0 && y < 3 ? binary[y * 3 + x] : 0;
  });
  const traced = runtime.spectralTraceContours(rgba(3, 3, (x, y) => binary[y * 3 + x]), 3, 3);
  assert.equal(traced.filter(c => c.area > 0).length, components(binary, 3, 1, false), 'All ink islands survive pattern ' + pattern);
  assert.equal(traced.filter(c => c.area < 0).length, components(padded, 5, 0, true) - 1, 'All counters survive pattern ' + pattern);
}
// Verify the actual alpha isovalue independently with bilinear evaluation.
// A clipped 1px coverage ramp is only an approximation of an analytic circle;
// a 2px ramp separates that input sampling error from tracing precision.
let maxCircleError = 0, maxSmoothCircleError = 0, maxIsoError = 0;
for (const rampWidth of [1, 2]) for (const shift of [0, 0.125, 0.5]) {
  const cx = 31.2 + shift, cy = 30.7 - shift, radius = 21.3;
  const samples = new Uint8ClampedArray(64 * 64 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    samples[(y * 64 + x) * 4 + 3] = Math.max(0, Math.min(255, 127.5 + (radius - Math.hypot(x + .5 - cx, y + .5 - cy)) * 255 / rampWidth));
  }
  const curve = runtime.spectralTraceContours(samples, 64, 64);
  assert.equal(curve.length, 1);
  const alpha = (x, y) => samples[(y * 64 + x) * 4 + 3];
  for (const p of curve[0].points) {
    const error = Math.abs(Math.hypot(p.x - cx, p.y - cy) - radius);
    if (rampWidth === 1) maxCircleError = Math.max(maxCircleError, error);
    else maxSmoothCircleError = Math.max(maxSmoothCircleError, error);
    const gx = p.x - .5, gy = p.y - .5, x = Math.floor(gx), y = Math.floor(gy), tx = gx - x, ty = gy - y;
    const value = alpha(x,y)*(1-tx)*(1-ty) + alpha(x+1,y)*tx*(1-ty) + alpha(x,y+1)*(1-tx)*ty + alpha(x+1,y+1)*tx*ty;
    maxIsoError = Math.max(maxIsoError, Math.abs(value - 127.5));
  }
  assert.ok(curve[0].points.some(p => Math.abs(p.x % 1) > 0.01 && Math.abs(p.x % 1) < 0.99), 'Alpha produces fractional boundary positions');
}
assert.ok(maxIsoError < 1e-8, 'Every traced point lies on the half-alpha isovalue, including clipped ramps');
assert.ok(maxCircleError < 0.1, '1px quantized coverage remains within 0.1 analysis pixels of the circle');
assert.ok(maxSmoothCircleError < 0.02, '2px ramp isolates contour precision within 0.02 analysis pixels');
const round = points => JSON.stringify(points.map(p => [Number(p.x.toFixed(6)), Number(p.y.toFixed(6))]));
const base = { amount: 1, detail: 18, frequency: 7, phase: 0, counter: 0.9, motion: 0.45 };
for (const mode of ['liquid', 'phase']) {
  const raw = loops.map(c => runtime.spectralCompileContour(c, 0, 0));
  for (let i = 0; i < contours.length; i++) {
    assert.equal(round(runtime.spectralSynthesize(contours[i], { ...base, mode }, 1.2, 821)),
      round(runtime.spectralSynthesize(raw[i], { ...base, mode }, 1.2, 821)), 'Material hierarchy must not alter ' + mode);
  }
}
for (const mode of ['liquid', 'fluted', 'phase']) {
  const rawBody = contours[bodyIndex];
  const settings = { ...base, mode };
  assert.notEqual(round(runtime.spectralSynthesize(rawBody, settings, 0, 821)),
    round(runtime.spectralSynthesize(rawBody, { ...settings, amount: 4 }, 0, 821)), 'Full extreme range retained for ' + mode);
}
const identities = new Set();
for (const mode of ['liquid', 'fluted', 'phase']) {
  const settings = { ...base, mode };
  const body = contours.find(c => c.area > 100);
  const start = runtime.spectralSynthesize(body, settings, 0, 821);
  const end = runtime.spectralSynthesize(body, settings, Math.PI * 2, 821);
  const half = runtime.spectralSynthesize(body, settings, Math.PI, 821);
  assert.equal(round(start), round(end), mode + ': loop seam');
  assert.notEqual(round(start), round(half), mode + ': Compose motion is functional');
  assert.equal(round(start), round(runtime.spectralSynthesize(body, settings, 0, 821)), mode + ': determinism');
  assert.equal(round(runtime.spectralSynthesize(body, { ...settings, amount: 0 }, 1, 821)), round(body.points), mode + ': exact zero');
  const locked = { ...settings, counter: 1 };
  const counter = contours.find(c => c.area < 0);
  assert.equal(round(runtime.spectralSynthesize(counter, locked, 0, 821)), round(counter.points), mode + ': real counter lock');
  assert.equal(round(runtime.spectralSynthesize(body, { ...settings, motion: 0 }, 0, 821)),
    round(runtime.spectralSynthesize(body, { ...settings, motion: 0 }, 2.12, 821)), mode + ': motion off');
  for (const detail of [2, 48]) for (const frequency of [2, 24]) for (const phase of [-180, 180]) {
    const extreme = runtime.spectralSynthesize(body, { ...settings, amount: 4, counter: 0, motion: 2, detail, frequency, phase }, 1.21, 821);
    assert.ok(extreme.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), mode + ': finite extremes');
    assert.equal(extreme.length, body.points.length, 'Point budget stable across extremes');
  }
  identities.add(round(start));
}
assert.equal(identities.size, 3, 'Each grammar must generate a different body');
for (const key of ['Mode', 'Amount', 'Detail', 'Frequency', 'Phase', 'Counter', 'Motion']) {
  assert.ok(html.includes('id="pSpectral' + key + '"'), 'Visible control ' + key);
  assert.ok(html.includes("spectral" + key + ': deform.spectral' + key), 'Per-glyph/Batch snapshot ' + key);
  assert.ok(html.includes("'pSpectral" + key + "',"), 'Bound control ' + key);
}
for (const marker of [
  "spectralType: 'spectralColor'", "spectralType: 'spectralSourceMode'",
  "spectralType: 'spectralSourceOpacity'", "spectralType: 'spectralOpacity'", "spectralType: 'spectralBlend'",
  "spectralType: renderSpectralType", "spectralType: [{ key: 'spectralAmount'",
  "spectralGlyphCache.clear(); spectralCachePoints = 0", "ctx.fill('evenodd')",
  "spectralCachePoints + total > 49152", "spectralSourceMode: 'hide'"
]) assert.ok(html.includes(marker), 'Integration contract: ' + marker);
// Verify actual native and reconstructed glyph frames agree under grid,
// vertical rotation, negative scales, shear, pan and export pixel scaling.
const makeContext = () => ({
  matrix: [1, 0, 0, 1, 0, 0], stack: [], fills: [], clips: 0, native: [],
  setTransform(...m) { assert.ok(m.every(Number.isFinite)); this.matrix = m; },
  transform(a, b, c, d, e, f) {
    assert.ok([a, b, c, d, e, f].every(Number.isFinite), 'No invalid Canvas transform');
    const [aa, bb, cc, dd, ee, ff] = this.matrix;
    this.matrix = [aa*a+cc*b, bb*a+dd*b, aa*c+cc*d, bb*c+dd*d, aa*e+cc*f+ee, bb*e+dd*f+ff];
  },
  translate(x, y) { this.transform(1, 0, 0, 1, x, y); },
  scale(x, y) { this.transform(x, 0, 0, y, 0, 0); },
  rotate(r) { this.transform(Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0); },
  point(x, y) { const [a,b,c,d,e,f] = this.matrix; return [a*x+c*y+e,b*x+d*y+f]; },
  save() { this.stack.push(this.matrix.slice()); }, restore() { this.matrix = this.stack.pop(); },
  beginPath() {}, closePath() {},
  moveTo(x,y) { assert.ok(Number.isFinite(x) && Number.isFinite(y)); },
  lineTo(x,y) { assert.ok(Number.isFinite(x) && Number.isFinite(y)); },
  clip() { this.clips++; }, fill(rule) { this.fills.push(rule); }, drawImage() {},
  fillText(ch, x, y) {
    const scale = runtime.params.fontSize / 192;
    this.native.push(this.point(x - (this.textAlign === 'center' ? 90 * scale : 0),
      y + (this.textBaseline === 'middle' ? 70 * scale : 0)));
  }
});
Object.assign(runtime, { params: { fontSize: 96, fontWeight: 700, fontFamily: 'serif', seed: 7 },
  baselineOffset: () => 78 });
new vm.Script(['spectralGlyphFrame', 'drawSurfaceGlyph', 'surfaceGlyphStrength', 'renderSpectralType'].map(extract).join('\n')).runInContext(runtime);
const glyph = { ch: 'R', x: 26, y: 31, w: 84, h: 120, ox: 68, oy: 91, tx: 33, ty: -27,
  rot: 33, skewX: -19, skewY: 12, scaleX: -1.3, scaleY: 0.8, opacity: 0.6 };
const data = { advance: 180, middleOffset: 70, contours, variants: new Map() };
const layout = { dx: 180, dy: -55, s: 1.2 };
for (const vertical of [true, false]) for (const grid of [true, false]) for (const upright of [true, false]) {
  runtime.params.vertical = vertical;
  const g = { ...glyph, grid, upright };
  const native = makeContext(), spectral = makeContext();
  runtime.drawSurfaceGlyph(native, g, 2, layout, {}, 1, '#000');
  runtime.spectralGlyphFrame(spectral, g, 2, layout, {}, data);
  const actual = spectral.point(0, 0);
  assert.ok(actual.every((v, i) => Math.abs(v - native.native[0][i]) < 1e-9), 'Native and spectral frame alignment');
}
let analyzed = 0;
const ctx = makeContext();
Object.assign(runtime, {
  compositionState: { enabled: true, phase: 0.25 },
  BATCH_PARAM_OPTIONS: { spectralMode: ['liquid', 'fluted', 'phase'] },
  surfaceScratch: () => ({ ctx, canvas: {} }),
  surfaceEffectColor: () => '#163e58',
  spectralGlyphData: () => { analyzed++; return data; }
});
const surface = { spectralType: 1, spectralMode: 'fluted', spectralAmount: 1, spectralDetail: 18,
  spectralFrequency: 7, spectralPhase: 0, spectralCounter: 0.9, spectralMotion: 0.45 };
const target = makeContext(); target.canvas = { width: 1280, height: 720 };
runtime.renderSpectralType(target, [
  { ...glyph, surface }, { ...glyph, ch: ' ', surface }, { ...glyph, surface: { ...surface, spectralType: 0 } },
  { ...glyph, opacity: 0, surface }, { ...glyph, surface: { ...surface, spectralAmount: 0 } }
], 1280, 720, 1, layout, {}, false);
assert.equal(analyzed, 1, 'Only active nonblank nontransparent nonzero glyphs are analyzed');
assert.equal(ctx.clips, 1, 'Real renderer clips counter ink to positive contours');
assert.deepEqual(ctx.fills, ['evenodd']);
assert.equal(ctx.native.length, 1, 'Zero takes native glyph path');
assert.equal(ctx.stack.length, 0, 'Canvas state restored');
// Presets only edit the current target profile, one Undo entry, no apply or camera mutation.
const presetSource = html.match(/      var SPECTRAL_TYPE_PRESETS = \{[\s\S]*?\n      \};/)[0];
const profile = { unrelated: 123 }, events = [];
Object.assign(runtime, { editableBatchProfile: () => profile, pushHistory: () => events.push('undo'),
  refreshBatchProfileControls: () => events.push('controls'), applyAllOperatorVisuals: () => events.push('draw'),
  markAutosaveDirty: () => events.push('save') });
new vm.Script(presetSource + '\n' + extract('applySpectralTypePreset')).runInContext(runtime);
assert.equal(runtime.applySpectralTypePreset('phase'), true);
assert.equal(profile.spectralMode, 'phase'); assert.equal(profile.unrelated, 123);
assert.deepEqual(events, ['undo', 'controls', 'draw', 'save']);
assert.equal(runtime.applySpectralTypePreset('missing'), false);
assert.equal(events.length, 4);
console.log('Spectral Type: 512 topology patterns, alpha contours (isovalue error ' + maxIsoError.toExponential(2) + '; circle proxies ' + maxCircleError.toFixed(5) + '/' + maxSmoothCircleError.toFixed(5) + 'px), material hierarchy, 3 grammars, loops, extremes, 8 coordinate frames, renderer, presets and integration passed.');
