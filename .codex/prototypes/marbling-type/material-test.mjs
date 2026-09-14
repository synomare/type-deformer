import assert from 'node:assert/strict';
import { prepareMarblingGlyph, MARBLING_PRESETS, createMarblingMap } from './core.mjs';

const glyph = prepareMarblingGlyph([
  { points: [{ x: -73, y: -89 }, { x: 86, y: -89 }, { x: 86, y: 94 }, { x: -73, y: 94 }] },
  { points: [{ x: -42, y: -61 }, { x: -42, y: -10 }, { x: 25, y: -10 }, { x: 25, y: -61 }] },
  { points: [{ x: -19, y: 22 }, { x: -19, y: 68 }, { x: 57, y: 68 }, { x: 57, y: 22 }] },
]);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const tau = 2 * Math.PI;

// Independent scalar point oracle. It knows nothing about interval jets, LOD,
// operation arrays or anatomyAt. Ink-moment preparation has a separate analytic
// oracle in ink-support-test; this checks composition of the resulting tools.
function reference(settings, phase, point) {
  const t = (((phase % 1) + 1) % 1) * tau;
  const angle = settings.angle * Math.PI / 180 + settings.motion * .25 * Math.sin(t);
  const amount = settings.amount * (1 - settings.motion * .22 * (1 - Math.cos(t)));
  const pitch = settings.pitch, focus = settings.focus, c = settings.circulation;
  const amplitude = amount * pitch * .52, offset = settings.motion * Math.sin(t) * .9;
  const { cx, cy } = glyph;
  const shear = (p, a, force, gap, f, shift) => {
    const co = Math.cos(a), si = Math.sin(a), u = -(p.x - cx) * si + (p.y - cy) * co;
    const k = f * 5, z = k ? 2 * k / (1 + Math.sqrt(1 + 4 * k * k)) : 0;
    const gain = 1 / (Math.sqrt(1 - z * z) * Math.exp(k * (z - 1)));
    const q = u * tau / gap + shift, d = force * gain * Math.sin(q) * Math.exp(k * (Math.cos(q) - 1));
    return { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d };
  };
  const spin = (p, anchor, radius, strength) => {
    const dx = p.x - anchor.x, dy = p.y - anchor.y;
    const theta = strength * Math.exp(-(dx * dx + dy * dy) / (2 * radius * radius));
    return { x: anchor.x + dx * Math.cos(theta) - dy * Math.sin(theta),
      y: anchor.y + dx * Math.sin(theta) + dy * Math.cos(theta) };
  };
  if (settings.amount === 0) return { ...point };
  if (settings.mode === 'rake') {
    const p = shear(point, angle, amplitude, pitch, focus, offset);
    const q = shear(p, angle + Math.PI / 2, amplitude * .22 * c, pitch * 1.7, focus * .3, 1.1 - offset);
    return shear(q, angle, -amplitude * .38, pitch * 1.12, focus, 1.7 + offset);
  }
  if (settings.mode === 'eddy') {
    const localSpin = (p, site, centre, strength) => {
      const theta = site.angle + angle, co = Math.cos(theta), si = Math.sin(theta), q = site.stretch;
      const dx = p.x - centre.x, dy = p.y - centre.y;
      const local = { x: (co * dx + si * dy) / q, y: (-si * dx + co * dy) * q };
      const moved = spin(local, { x: 0, y: 0 }, site.radius * pitch / 118 * (1 - focus * .45), strength);
      return { x: centre.x + co * q * moved.x - si / q * moved.y,
        y: centre.y + si * q * moved.x + co / q * moved.y };
    };
    const first = p => localSpin(p, glyph.eddySites[0], glyph.anchors[0], amount * c * 1.25);
    const centre = first(glyph.anchors[1]);
    const second = p => localSpin(first(p), glyph.eddySites[1], centre, -amount * c * 2);
    const returnCentre = second(glyph.anchors[0]);
    const q = localSpin(second(point), glyph.eddySites[0], returnCentre, amount * c * 1.25);
    return shear(q, angle, amplitude * .18, pitch * 1.8, focus * .25, offset);
  }
  const first = p => shear(p, angle + Math.PI / 2, amplitude * 1.1, pitch, focus, .6 + offset);
  const firstAnchor = first(glyph.anchors[0]);
  const second = p => spin(first(p), firstAnchor, pitch * .68, amount * c * 1.4);
  const third = p => shear(second(p), angle, -amplitude * .8, pitch * 1.45, focus * .55, .8 - offset);
  const secondAnchor = third(glyph.anchors[1]);
  return spin(third(point), secondAnchor, pitch * .4, -amount * c * .7);
}

let checks = 0, maximumError = 0, inverseError = 0, seamError = 0;
for (const mode of ['rake', 'eddy', 'plume']) for (let variant = 0; variant < 32; variant++) {
  const settings = variant === 0 ? MARBLING_PRESETS[mode] : {
    ...MARBLING_PRESETS[mode], amount: variant & 1 ? 4 : .75, pitch: variant & 2 ? 12 : 180,
    focus: variant & 4 ? 1 : 0, circulation: variant & 8 ? -4 : 4, angle: variant & 16 ? -179 : 73, motion: 1
  };
  for (const phase of [0, .173, .5, .91, 1]) {
    const map = createMarblingMap(glyph, settings, phase);
    for (let i = 0; i < 18; i++) {
      const point = { x: 158 * Math.sin(i * 3.71), y: 190 * Math.cos(i * 1.43) };
      const actual = map.map(point), expected = reference(settings, phase, point);
      maximumError = Math.max(maximumError, dist(actual, expected));
      inverseError = Math.max(inverseError, dist(point, map.inverse(actual)));
      assert.ok(dist(actual, expected) < 1e-7, `${mode} stage oracle`);
      assert.ok(dist(point, map.inverse(actual)) < 1e-6, `${mode} inverse`);
      checks++;
    }
  }
}
// The transported centres must be continuous in Amount, Angle and phase;
// no nearest-source switch or random field change during motion is introduced.
const probe = { x: 41, y: -33 }, delta = 1e-7;
for (const mode of ['eddy', 'plume']) {
  const settings = MARBLING_PRESETS[mode];
  for (const key of ['amount', 'angle']) {
    const left = createMarblingMap(glyph, { ...settings, [key]: settings[key] - delta }, .23).map(probe);
    const right = createMarblingMap(glyph, { ...settings, [key]: settings[key] + delta }, .23).map(probe);
    assert.ok(dist(left, right) < .001, `${mode} ${key} continuous`);
  }
  for (const point of glyph.rings.flatMap(ring => ring.points)) {
    const a = createMarblingMap(glyph, settings, delta).map(point), b = createMarblingMap(glyph, settings, 1 - delta).map(point);
    seamError = Math.max(seamError, dist(a, b));
    assert.ok(dist(a, b) < .001, `${mode} near-seam continuous`);
  }
  assert.ok(dist(createMarblingMap(glyph, { ...settings, angle: -180 }).map(probe),
    createMarblingMap(glyph, { ...settings, angle: 180 }).map(probe)) < 1e-10, `${mode} equivalent angle endpoints, within floating-point roundoff`);
}
console.log(JSON.stringify({ status: 'pass', checks, maximumError, inverseError, seamError,
  scope: 'Plume and split Eddy transported-centre scalar oracle, original Rake law, extreme map inverse and both modes control/phase continuity; not all-font topology' }));
