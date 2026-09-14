// Original, stateless glyph-material advection prototype. This is NOT a fluid
// solver, a tracing of a reference font, or an editor-registered operator yet.
// Elementary shears and radius-dependent twists have explicit inverses and
// determinant one. Their composition preserves the continuous ink domain.
// A polygonal approximation is a separate, tolerance-bounded representation.
import { marblingInkSupport } from './ink-support.mjs';
const TAU = Math.PI * 2;
const finite = (v, d, lo, hi) => Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;

export const MARBLING_MODES = Object.freeze(['rake', 'eddy', 'plume']);
export const MARBLING_PRESETS = Object.freeze({
  rake: Object.freeze({ mode: 'rake', amount: .65, pitch: 76, focus: .55, circulation: .9, angle: -18, motion: .55 }),
  eddy: Object.freeze({ mode: 'eddy', amount: .5, pitch: 118, focus: .35, circulation: 2.1, angle: -20, motion: .55 }),
  plume: Object.freeze({ mode: 'plume', amount: .75, pitch: 98, focus: .7, circulation: 1.8, angle: -12, motion: .55 }),
});

export function normalizeMarblingSettings(input = {}) {
  const normalized = (() => {
  return Object.freeze({
    mode: MARBLING_MODES.includes(input.mode) ? input.mode : 'rake',
    amount: finite(input.amount, .65, 0, 4),
    pitch: finite(input.pitch, 76, 12, 180),
    focus: finite(input.focus, .55, 0, 1),
    circulation: finite(input.circulation, .9, -4, 4),
    angle: finite(input.angle, -18, -180, 180),
    motion: finite(input.motion, 0, 0, 1),
  });
})();
  return globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.core('marbling',input,normalized) : normalized;
}

export function marblingSignedArea(points) {
  if (!points.length) return 0;
  const origin = points[0]; let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    sum += (a.x - origin.x) * (b.y - origin.y) - (b.x - origin.x) * (a.y - origin.y);
  }
  return sum / 2;
}

function moments(points) {
  if (points.length < 3) return { area: 0, x: 0, y: 0 };
  const origin = points[0]; let twiceArea = 0, x = 0, y = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const ax = a.x - origin.x, ay = a.y - origin.y, bx = b.x - origin.x, by = b.y - origin.y;
    const cross = ax * by - bx * ay;
    twiceArea += cross; x += (ax + bx) * cross; y += (ay + by) * cross;
  }
  return Math.abs(twiceArea) < 1e-12 ? { area: 0, x: origin.x, y: origin.y }
    : { area: twiceArea / 2, x: origin.x + x / (3 * twiceArea), y: origin.y + y / (3 * twiceArea) };
}

// Signed polygon moments after clipping to a half-plane recover actual ink
// mass above/below the glyph centre, including counter subtraction. No random
// glyph hash or ornamental points substitute for the source anatomy.
function halfPlane(points, axisY, sign) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const insideA = sign * (a.y - axisY) >= 0, insideB = sign * (b.y - axisY) >= 0;
    if (insideA) out.push(a);
    if (insideA !== insideB) {
      const t = (axisY - a.y) / (b.y - a.y);
      out.push({ x: a.x + (b.x - a.x) * t, y: axisY });
    }
  }
  return out;
}

function anatomyAnchors(rings, cx, cy) {
  const dominant = rings.reduce((best, ring) => Math.abs(ring.area) > Math.abs(best?.area || 0) ? ring : best, null);
  const orientation = Math.sign(dominant?.area || 1);
  const holes = rings.filter(ring => ring.area * orientation < -1e-6)
    .map(ring => moments(ring.points)).sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
  const halves = [-1, 1].map(sign => {
    let area = 0, x = 0, y = 0;
    for (const ring of rings) {
      const part = moments(halfPlane(ring.points, cy, sign));
      area += part.area; x += (part.x - cx) * part.area; y += (part.y - cy) * part.area;
    }
    return Math.abs(area) > 1e-8 ? { x: cx + x / area, y: cy + y / area } : { x: cx, y: cy };
  });
  let anchors;
  if (holes.length >= 2) anchors = holes.slice(0, 2);
  else if (holes.length === 1) {
    const hole = holes[0];
    const other = halves.reduce((a, b) => Math.hypot(a.x - hole.x, a.y - hole.y) > Math.hypot(b.x - hole.x, b.y - hole.y) ? a : b);
    anchors = [hole, other];
  } else anchors = halves;
  return Object.freeze(anchors.sort((a, b) => a.y - b.y || a.x - b.x).map(p => Object.freeze({ x: p.x, y: p.y })));
}

export function prepareMarblingGlyph(contours) {
  if (!Array.isArray(contours)) throw new TypeError('Marbling: contours must be an array');
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, count = 0;
  const rings = contours.map(contour => {
    if (!Array.isArray(contour?.points) || contour.points.length < 3) throw new TypeError('Marbling: each ring needs at least three points');
    const points = contour.points.map(point => {
      if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) throw new TypeError('Marbling: non-finite source coordinate');
      if (++count > 131072) throw new RangeError('Marbling: source point budget exceeded');
      minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
      return Object.freeze({ x: point.x, y: point.y });
    });
    return Object.freeze({ points: Object.freeze(points), area: marblingSignedArea(points) });
  });
  const cx = count ? minX + (maxX - minX) / 2 : 0;
  const cy = count ? minY + (maxY - minY) / 2 : 0;
  if (![cx, cy, maxX - minX, maxY - minY].every(Number.isFinite) && count) throw new RangeError('Marbling: source extent overflow');
  const anchors = anatomyAnchors(rings, cx, cy);
  return Object.freeze({ rings: Object.freeze(rings), cx, cy,
    anchors, eddySites: marblingInkSupport(rings, anchors),
    width: count ? maxX - minX : 0, height: count ? maxY - minY : 0, pointCount: count });
}

// Small outward allowance mitigates double precision rounding; these are
// numerical interval estimates, not a machine-checked exact-arithmetic proof.
const outward = (lo, hi) => {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [-Infinity, Infinity];
  const pad = (1 + Math.max(Math.abs(lo), Math.abs(hi))) * Number.EPSILON * 8;
  return [lo - pad, hi + pad];
};
const iadd = (a, b) => outward(a[0] + b[0], a[1] + b[1]);
const ineg = a => [-a[1], -a[0]];
const iscale = (a, s) => s === 0 ? [0, 0] : s > 0 ? outward(a[0] * s, a[1] * s) : outward(a[1] * s, a[0] * s);
function imul(a, b) {
  const aa = a[0] * b[0], ab = a[0] * b[1], ba = a[1] * b[0], bb = a[1] * b[1];
  if (Number.isNaN(aa) || Number.isNaN(ab) || Number.isNaN(ba) || Number.isNaN(bb)) return [-Infinity, Infinity];
  return outward(Math.min(aa, ab, ba, bb), Math.max(aa, ab, ba, bb));
}
function isquare(a) {
  return outward(a[0] <= 0 && a[1] >= 0 ? 0 : Math.min(a[0] ** 2, a[1] ** 2), Math.max(a[0] ** 2, a[1] ** 2));
}
function isin(a) {
  if (!a.every(Number.isFinite) || a[1] - a[0] >= TAU) return [-1, 1];
  let lo = Math.min(Math.sin(a[0]), Math.sin(a[1])), hi = Math.max(Math.sin(a[0]), Math.sin(a[1]));
  const first = Math.ceil((a[0] - Math.PI / 2) / Math.PI);
  const last = Math.floor((a[1] - Math.PI / 2) / Math.PI);
  for (let k = first; k <= last; k++) if (k % 2 === 0) hi = 1; else lo = -1;
  return outward(lo, hi);
}
const icos = a => isin(iadd(a, [Math.PI / 2, Math.PI / 2]));
const iexp = a => outward(Math.exp(a[0]), Math.exp(a[1]));
const imax = a => Math.max(Math.abs(a[0]), Math.abs(a[1]));
const jet = (a, b) => ({ v: [Math.min(a, b), Math.max(a, b)], d: [b - a, b - a], dd: [0, 0] });
const add = (a, b) => ({ v: iadd(a.v, b.v), d: iadd(a.d, b.d), dd: iadd(a.dd, b.dd) });
const scale = (a, s) => ({ v: iscale(a.v, s), d: iscale(a.d, s), dd: iscale(a.dd, s) });
// Constant translation needs no temporary constant jet. Keep even the +0
// operations and outward allowances, so every interval endpoint is unchanged.
const shift = (a, b) => ({
  v: outward(a.v[0] + b, a.v[1] + b),
  d: outward(a.d[0] + 0, a.d[1] + 0),
  dd: outward(a.dd[0] + 0, a.dd[1] + 0),
});
function multiply(a, b) {
  return { v: imul(a.v, b.v), d: iadd(imul(a.d, b.v), imul(a.v, b.d)),
    dd: iadd(iadd(imul(a.dd, b.v), iscale(imul(a.d, b.d), 2)), imul(a.v, b.dd)) };
}
function square(a) {
  return { v: isquare(a.v), d: iscale(imul(a.v, a.d), 2), dd: iscale(iadd(isquare(a.d), imul(a.v, a.dd)), 2) };
}
function unary(a, v, derivative, second) {
  return { v, d: imul(derivative, a.d), dd: iadd(imul(second, isquare(a.d)), imul(derivative, a.dd)) };
}
function sinCos(a) {
  const s = isin(a.v), c = icos(a.v);
  return { sin: unary(a, s, c, ineg(s)), cos: unary(a, c, ineg(s), ineg(c)) };
}
const exp = a => { const value = iexp(a.v); return unary(a, value, value, value); };

function shear(cx, cy, angle, amplitude, pitch, focus, phase) {
  const co = Math.cos(angle), si = Math.sin(angle), frequency = TAU / pitch;
  const k = focus * 5;
  // Normalise peak displacement, so Focus narrows the flow instead of merely
  // making every deformation disappear as its envelope becomes narrower.
  const z = k ? 2 * k / (1 + Math.sqrt(1 + 4 * k * k)) : 0;
  const gain = 1 / (Math.sqrt(1 - z * z) * Math.exp(k * (z - 1)));
  function apply(point, sign = 1) {
    const y = -(point.x - cx) * si + (point.y - cy) * co;
    const t = y * frequency + phase;
    const d = sign * amplitude * gain * Math.sin(t) * Math.exp(k * (Math.cos(t) - 1));
    return { x: point.x + co * d, y: point.y + si * d };
  }
  function bound(point) {
    const y = add(scale(shift(point.x, -cx), -si), scale(shift(point.y, -cy), co));
    const t = shift(scale(y, frequency), phase);
    const trig = sinCos(t);
    const displacement = scale(multiply(trig.sin, exp(scale(shift(trig.cos, -1), k))), amplitude * gain);
    return { x: add(point.x, scale(displacement, co)), y: add(point.y, scale(displacement, si)) };
  }
  function boxDerivative(box) {
    const x = iadd(box[0], [-cx, -cx]), y = iadd(box[1], [-cy, -cy]);
    const t = iadd(iscale(iadd(iscale(x, -si), iscale(y, co)), frequency), [phase, phase]);
    const sine = isin(t), cosine = icos(t), envelope = iexp(iscale(iadd(cosine, [-1, -1]), k));
    const displacement = iscale(imul(sine, envelope), amplitude * gain);
    const slope = iscale(imul(envelope, iadd(cosine, iscale(isquare(sine), -k))), amplitude * gain * frequency);
    const slopeBound = imax(slope);
    return { norm: (Math.hypot(2, slopeBound) + slopeBound) / 2,
      box: [iadd(box[0], iscale(displacement, co)), iadd(box[1], iscale(displacement, si))],
      matrix: [iadd([1, 1], iscale(slope, -co * si)), iscale(slope, -si * si),
        iscale(slope, co * co), iadd([1, 1], iscale(slope, si * co))] };
  }
  return { apply, bound, boxDerivative, kind: 'shear', amplitude, pitch };
}

function twist(cx, cy, radius, strength) {
  const falloff = -.5 / (radius * radius);
  function apply(point, sign = 1) {
    const x = point.x - cx, y = point.y - cy;
    const angle = sign * strength * Math.exp((x * x + y * y) * falloff);
    const co = Math.cos(angle), si = Math.sin(angle);
    return { x: cx + x * co - y * si, y: cy + x * si + y * co };
  }
  function bound(point) {
    const x = shift(point.x, -cx), y = shift(point.y, -cy);
    const angle = scale(exp(scale(add(square(x), square(y)), falloff)), strength);
    const trig = sinCos(angle), co = trig.cos, si = trig.sin;
    return { x: shift(add(multiply(x, co), scale(multiply(y, si), -1)), cx),
      y: shift(add(multiply(x, si), multiply(y, co)), cy) };
  }
  function boxDerivative(box) {
    const x = iadd(box[0], [-cx, -cx]), y = iadd(box[1], [-cy, -cy]);
    const radius2 = iadd(isquare(x), isquare(y));
    const angle = iscale(iexp(iscale(radius2, falloff)), strength);
    const co = icos(angle), si = isin(angle);
    const tx = iadd(imul(x, co), ineg(imul(y, si))), ty = iadd(imul(x, si), imul(y, co));
    const gx = iscale(imul(x, angle), 2 * falloff), gy = iscale(imul(y, angle), 2 * falloff);
    // In polar coordinates this derivative is a shear of r*phi'(r), between
    // orthogonal frames. q*exp(-q/2) peaks at q=2; retain this independent cap
    // when the rectangular interval Jacobian becomes excessively wide.
    const q0 = Math.max(0, radius2[0] / (radius * radius)), q1 = Math.max(0, radius2[1] / (radius * radius));
    const profile = q => Number.isFinite(q) ? q * Math.exp(-q / 2) : 0;
    const shearBound = Math.abs(strength) * Math.max(profile(q0), profile(q1), q0 <= 2 && q1 >= 2 ? 2 / Math.E : 0) * (1 + 32 * Number.EPSILON);
    return { norm: (Math.hypot(2, shearBound) + shearBound) / 2,
      box: [iadd(tx, [cx, cx]), iadd(ty, [cy, cy])],
      matrix: [iadd(co, ineg(imul(ty, gx))), iadd(si, imul(tx, gx)),
        ineg(iadd(si, imul(ty, gy))), iadd(co, imul(tx, gy))] };
  }
  return { apply, bound, boxDerivative, kind: 'twist', radius, strength };
}

// Conjugate a circular twist by an invertible area-neutral local frame. This
// remains a planar bijection with an explicit inverse and determinant one;
// anisotropy is in the field, not an extra scale applied to the final glyph.
function ellipticTwist(cx, cy, radius, strength, angle, stretch) {
  const co = Math.cos(angle), si = Math.sin(angle), q = stretch;
  const m = [co * q, si * q, -si / q, co / q];
  const inv = [co / q, -si * q, si / q, co * q];
  const circular = twist(0, 0, radius, strength);
  const linear = (matrix, x, y) => [matrix[0] * x + matrix[2] * y, matrix[1] * x + matrix[3] * y];
  const range = (matrix, box) => [iadd(iscale(box[0], matrix[0]), iscale(box[1], matrix[2])),
    iadd(iscale(box[0], matrix[1]), iscale(box[1], matrix[3]))];
  const jets = (matrix, point) => ({ x: add(scale(point.x, matrix[0]), scale(point.y, matrix[2])),
    y: add(scale(point.x, matrix[1]), scale(point.y, matrix[3])) });
  function apply(point, sign = 1) {
    const [x, y] = linear(inv, point.x - cx, point.y - cy);
    const moved = circular.apply({ x, y }, sign), [dx, dy] = linear(m, moved.x, moved.y);
    return { x: cx + dx, y: cy + dy };
  }
  function bound(point) {
    const local = jets(inv, { x: shift(point.x, -cx), y: shift(point.y, -cy) });
    const mapped = jets(m, circular.bound(local));
    return { x: shift(mapped.x, cx), y: shift(mapped.y, cy) };
  }
  function boxDerivative(box) {
    const localBox = range(inv, [iadd(box[0], [-cx, -cx]), iadd(box[1], [-cy, -cy])]);
    const local = circular.boxDerivative(localBox), j = local.matrix;
    const right = [iadd(iscale(j[0], inv[0]), iscale(j[2], inv[1])),
      iadd(iscale(j[1], inv[0]), iscale(j[3], inv[1])),
      iadd(iscale(j[0], inv[2]), iscale(j[2], inv[3])),
      iadd(iscale(j[1], inv[2]), iscale(j[3], inv[3]))];
    const matrix = [iadd(iscale(right[0], m[0]), iscale(right[1], m[2])),
      iadd(iscale(right[0], m[1]), iscale(right[1], m[3])),
      iadd(iscale(right[2], m[0]), iscale(right[3], m[2])),
      iadd(iscale(right[2], m[1]), iscale(right[3], m[3]))];
    const output = range(m, local.box);
    return { norm: local.norm * Math.max(q, 1 / q) ** 2, matrix,
      box: [iadd(output[0], [cx, cx]), iadd(output[1], [cy, cy])] };
  }
  return { apply, bound, boxDerivative, kind: 'elliptic-twist' };
}

export function createMarblingMap(glyph, input, phase = 0) {
  const settings = normalizeMarblingSettings(input);
  const phase01 = Number.isFinite(phase) ? ((phase % 1) + 1) % 1 : 0;
  const time = phase01 * TAU, wave = Math.sin(time), breath = 1 - settings.motion * .22 * (1 - Math.cos(time));
  const angle = settings.angle * Math.PI / 180 + settings.motion * .25 * wave;
  const amount = settings.amount * breath;
  const pitch = settings.pitch, focus = settings.focus, circulation = settings.circulation;
  const amplitude = amount * pitch * .52, offset = settings.motion * wave * .9;
  const { cx, cy } = glyph;
  const operations = [];
  // Later tools act at transported anatomy sites. Eddy's footprint measures
  // surrounding ink, not just a possibly tiny empty counter; Plume retains
  // its original circular field and stage sequence.
  const anatomyAt = index => {
    let point = glyph.anchors[index];
    for (const operation of operations) point = operation.apply(point);
    return [point.x, point.y];
  };
  if (settings.amount !== 0 && glyph.rings.length) {
    if (settings.mode === 'rake') {
      operations.push(shear(cx, cy, angle, amplitude, pitch, focus, offset));
      operations.push(shear(cx, cy, angle + Math.PI / 2, amplitude * .22 * circulation, pitch * 1.7, focus * .3, 1.1 - offset));
      operations.push(shear(cx, cy, angle, -amplitude * .38, pitch * 1.12, focus, 1.7 + offset));
    } else if (settings.mode === 'eddy') {
      // Split the first tool around the second: a single final full vortex
      // otherwise overwhelms the two source sites with one common envelope.
      // Total signed strengths are unchanged. Each revisit follows its source
      // anchor through ALL previous tools; it is not a frozen canvas centre.
      for (const [i, fraction] of [[0, .5], [1, 1], [0, .5]]) {
        const site = glyph.eddySites[i], centre = anatomyAt(i);
        operations.push(ellipticTwist(...centre, site.radius * pitch / 118 * (1 - focus * .45),
          amount * circulation * (i ? -2 : 2.5) * fraction, site.angle + angle, site.stretch));
      }
      operations.push(shear(cx, cy, angle, amplitude * .18, pitch * 1.8, focus * .25, offset));
    } else {
      operations.push(shear(cx, cy, angle + Math.PI / 2, amplitude * 1.1, pitch, focus, .6 + offset));
      operations.push(twist(...anatomyAt(0), pitch * .68, amount * circulation * 1.4));
      operations.push(shear(cx, cy, angle, -amplitude * .8, pitch * 1.45, focus * .55, .8 - offset));
      operations.push(twist(...anatomyAt(1), pitch * .4, -amount * circulation * .7));
    }
  }
  function map(point) {
    let result = { x: point.x, y: point.y };
    for (const operation of operations) result = operation.apply(result);
    return result;
  }
  function inverse(point) {
    let result = { x: point.x, y: point.y };
    for (let i = operations.length - 1; i >= 0; i--) result = operations[i].apply(result, -1);
    return result;
  }
  function chordErrorBound(a, b) {
    if (!operations.length || a.x === b.x && a.y === b.y) return 0;
    // Local t always ranges 0..1 on THIS source segment. Composition of second
    // derivative interval jets bounds its mapped chord deviation by M / 8.
    let point = { x: jet(a.x - cx, b.x - cx), y: jet(a.y - cy, b.y - cy) };
    point = { x: shift(point.x, cx), y: shift(point.y, cy) };
    for (const operation of operations) point = operation.bound(point);
    return Math.hypot(imax(point.x.dd), imax(point.y.dd)) / 8;
  }
  function derivativeBoundForBox(box) {
    if (!operations.length) return 1;
    let range = [[box[0], box[2]], [box[1], box[3]]];
    let jacobian = [[1, 1], [0, 0], [0, 0], [1, 1]];
    let normProduct = 1;
    for (const operation of operations) {
      const local = operation.boxDerivative(range), m = local.matrix, j = jacobian;
      normProduct *= local.norm;
      jacobian = [iadd(imul(m[0], j[0]), imul(m[2], j[1])),
        iadd(imul(m[1], j[0]), imul(m[3], j[1])),
        iadd(imul(m[0], j[2]), imul(m[2], j[3])),
        iadd(imul(m[1], j[2]), imul(m[3], j[3]))];
      range = local.box;
    }
    // |Jv| <= abs(J) abs(v): the spectral norm of the entrywise upper
    // magnitudes bounds EVERY derivative in the propagated source box.
    const [a, b, c, d] = jacobian.map(imax), magnitude = Math.max(a, b, c, d);
    if (!Number.isFinite(magnitude)) return normProduct;
    if (magnitude === 0) return 0;
    const aa = (a / magnitude) ** 2 + (b / magnitude) ** 2;
    const cc = (c / magnitude) ** 2 + (d / magnitude) ** 2;
    const ac = (a / magnitude) * (c / magnitude) + (b / magnitude) * (d / magnitude);
    return Math.min(normProduct, magnitude * Math.sqrt((aa + cc + Math.hypot(aa - cc, 2 * ac)) / 2));
  }
  return Object.freeze({ map, inverse, chordErrorBound, derivativeBoundForBox, settings,
    identity: operations.length === 0, operations: operations.map(({ kind }) => kind), phase: phase01 });
}

export function deformMarblingGlyph(glyph, input, phase = 0, options = {}) {
  const transform = createMarblingMap(glyph, input, phase);
  const tolerance = finite(options.tolerance, .08, .00001, 10);
  const maxPoints = Math.floor(finite(options.maxPoints, 131072, 3, 1000000));
  const maxDepth = Math.floor(finite(options.maxDepth, 22, 0, 28));
  let pointCount = 0, subdivisions = 0, maxErrorBound = 0;
  const fail = () => { throw new RangeError('Marbling geometry budget exceeded; no truncated output returned'); };
  const rings = glyph.rings.map(ring => {
    const points = [], material = [];
    function edge(a, b, mappedA, u0, u1, depth) {
      const error = transform.chordErrorBound(a, b);
      if (!(error <= tolerance)) {
        if (depth >= maxDepth || pointCount >= maxPoints) fail();
        const mid = { x: a.x + (b.x - a.x) / 2, y: a.y + (b.y - a.y) / 2 }, um = (u0 + u1) / 2;
        subdivisions++;
        edge(a, mid, mappedA, u0, um, depth + 1);
        edge(mid, b, transform.map(mid), um, u1, depth + 1);
      } else {
        if (++pointCount > maxPoints) fail();
        if (!Number.isFinite(mappedA.x) || !Number.isFinite(mappedA.y)) throw new RangeError('Marbling: non-finite transformed geometry');
        points.push(mappedA); material.push(u0); maxErrorBound = Math.max(maxErrorBound, error);
      }
    }
    for (let i = 0; i < ring.points.length; i++) {
      const a = ring.points[i], b = ring.points[(i + 1) % ring.points.length];
      edge(a, b, transform.map(a), i, i + 1, 0);
    }
    return { points, material, area: marblingSignedArea(points), sourceArea: ring.area };
  });
  return { rings, pointCount, subdivisions, maxErrorBound, tolerance, identity: transform.identity };
}
