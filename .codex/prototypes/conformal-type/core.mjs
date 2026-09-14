// Conformal Type: independent glyph-body research prototype, not editor code.
// The same holomorphic map transforms every outer ring and counter. No outline
// decoration, Fourier resynthesis, physics history, texture, or external assets.
const TAU = Math.PI * 2;
const finite = (value, fallback, min, max) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

export const CONFORMAL_TYPE_PRESETS = Object.freeze({
  lens: Object.freeze({ amount: .82, power: -1, spiral: 0, angle: -35, motion: .55 }),
  coil: Object.freeze({ amount: .82, power: .2, spiral: 2.5, angle: -45, motion: .55 }),
  flare: Object.freeze({ amount: .8, power: 2.5, spiral: 0, angle: -60, motion: .55 }),
});

export function normalizeConformalSettings(input = {}) {
  const normalized = (() => {
  return {
    amount: finite(input.amount, 0.72, 0, 0.94),
    power: finite(input.power, -1, -3, 4),
    spiral: finite(input.spiral, 0, -4, 4),
    angle: finite(input.angle, 0, -180, 180),
    motion: finite(input.motion, 0, 0, 1),
  };
})();
  return globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.core('conformal',input,normalized) : normalized;
}

export function prepareConformalGlyph(contours) {
  if (!Array.isArray(contours)) throw new TypeError('Contours must be an array');
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const rings = contours.map(contour => {
    if (!Array.isArray(contour.points) || contour.points.length < 3) throw new TypeError('Each ring needs at least three points');
    const points = contour.points.map(p => {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new TypeError('Non-finite source coordinate');
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      return Object.freeze({ x: p.x, y: p.y });
    });
    return Object.freeze({ points: Object.freeze(points), area: signedArea(points) });
  });
  const cx = rings.length ? (minX + maxX) / 2 : 0;
  const cy = rings.length ? (minY + maxY) / 2 : 0;
  let radius = 1;
  for (const ring of rings) for (const p of ring.points) radius = Math.max(radius, Math.hypot(p.x - cx, p.y - cy));
  return Object.freeze({ rings: Object.freeze(rings), cx, cy, radius });
}

export function signedArea(points) {
  // Translate before summation to avoid cancellation for large world offsets.
  if (!points.length) return 0;
  const origin = points[0]; let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    area += (a.x - origin.x) * (b.y - origin.y) - (b.x - origin.x) * (a.y - origin.y);
  }
  return area / 2;
}

export function createConformalMap(glyph, input, phase = 0) {
  const settings = normalizeConformalSettings(input);
  const phase01 = Number.isFinite(phase) ? ((phase % 1) + 1) % 1 : 0;
  const time = phase01 * TAU;
  const angle = settings.angle * Math.PI / 180 + settings.motion * Math.sin(time) * 0.7;
  const q = settings.amount * (1 - settings.motion * (1 - Math.cos(time)) * 0.22);
  const pr = settings.power, pi = settings.spiral;
  const co = Math.cos(angle), si = Math.sin(angle);
  const { cx, cy, radius } = glyph;
  const identity = q === 0 || (pr === 1 && pi === 0);
  const local = p => ({ x: ((p.x - cx) * co + (p.y - cy) * si) / radius,
    y: (-(p.x - cx) * si + (p.y - cy) * co) / radius });
  function logarithm(p) {
    const z = local(p), x = q * z.x, y = q * z.y;
    // Source lies in |z|<=1 and q<1: principal log never crosses its cut.
    if (1 + x <= 0) throw new RangeError('Point outside the prepared map domain');
    return { x: Math.log1p(2 * x + x * x + y * y) / 2, y: Math.atan2(y, 1 + x) };
  }
  function map(p) {
    if (identity) return { x: p.x, y: p.y };
    const log = logarithm(p);
    let x, y;
    const norm = pr * pr + pi * pi;
    if (norm === 0) { x = log.x / q; y = log.y / q; }
    else {
      const a = pr * log.x - pi * log.y, b = pr * log.y + pi * log.x;
      // Stable expm1(a+ib), including the identity/complex-log limits.
      const ex = Math.expm1(a) * Math.cos(b) - 2 * Math.sin(b / 2) ** 2;
      const ey = Math.exp(a) * Math.sin(b);
      x = (ex * pr + ey * pi) / (norm * q);
      y = (ey * pr - ex * pi) / (norm * q);
    }
    return { x: cx + radius * (x * co - y * si), y: cy + radius * (x * si + y * co) };
  }
  function derivative(p) {
    if (identity) return { x: 1, y: 0 };
    const log = logarithm(p), a = (pr - 1) * log.x - pi * log.y;
    const b = (pr - 1) * log.y + pi * log.x, magnitude = Math.exp(a);
    return { x: magnitude * Math.cos(b), y: magnitude * Math.sin(b) };
  }
  function chordErrorBound(a, b) {
    if (identity) return 0;
    const za = local(a), zb = local(b);
    const ax = 1 + q * za.x, ay = q * za.y, bx = 1 + q * zb.x, by = q * zb.y;
    const dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy;
    const t = length2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length2)) : 0;
    const rMin = Math.hypot(ax + t * dx, ay + t * dy);
    const rMax = Math.max(Math.hypot(ax, ay), Math.hypot(bx, by));
    const radial = Math.pow(pr >= 2 ? rMax : rMin, pr - 2);
    const angular = Math.exp(Math.max(-pi * Math.atan2(ay, ax), -pi * Math.atan2(by, bx)));
    const secondDerivative = q * Math.hypot(pr - 1, pi) / radius * radial * angular;
    return ((b.x - a.x) ** 2 + (b.y - a.y) ** 2) * secondDerivative / 8;
  }
  function derivativeBoundForBox(box) {
    if (identity) return 1;
    const corners = [{ x: box[0], y: box[1] }, { x: box[2], y: box[1] },
      { x: box[2], y: box[3] }, { x: box[0], y: box[3] }].map(p => {
      const z = local(p); return { x: 1 + q * z.x, y: q * z.y };
    });
    // A box may extend beyond the containing disk. Never use its bound if it
    // crosses the log cut/right-half-plane guard; descend to smaller nodes.
    if (corners.some(p => p.x <= 0)) return Infinity;
    let rMin = Infinity, rMax = 0, angular = 0;
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4], dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy, t = d2 ? Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / d2)) : 0;
      rMin = Math.min(rMin, Math.hypot(a.x + t * dx, a.y + t * dy));
      rMax = Math.max(rMax, Math.hypot(a.x, a.y));
      angular = Math.max(angular, Math.exp(-pi * Math.atan2(a.y, a.x)));
    }
    return Math.pow(pr >= 1 ? rMax : rMin, pr - 1) * angular;
  }
  // A sufficient (not necessary) global injectivity condition: imaginary span
  // of p*Log(1+qz) is <2pi over the containing disk. Else overlaps are possible,
  // even though the analytic local derivative is nonzero everywhere.
  const argumentSpanBound = Math.abs(pr) * 2 * Math.asin(q)
    + Math.abs(pi) * Math.log((1 + q) / (1 - q));
  return { map, derivative, chordErrorBound, derivativeBoundForBox, identity, settings,
    injectivity: pr === 0 && pi === 0 || argumentSpanBound < TAU ? 'certified-domain' : 'overlap-possible',
    argumentSpanBound };
}

export function deformConformalGlyph(glyph, input, phase = 0, options = {}) {
  const transform = createConformalMap(glyph, input, phase);
  const tolerance = finite(options.tolerance, 0.08, 0.00001, 10);
  const maxPoints = Math.floor(finite(options.maxPoints, 131072, 3, 1000000));
  let pointCount = 0, subdivisions = 0, maxErrorBound = 0;
  const rings = glyph.rings.map(ring => {
    const points = [], material = [];
    function edge(a, b, mappedA, mappedB, u0, u1, depth) {
      const error = transform.chordErrorBound(a, b);
      if (error > tolerance) {
        if (depth >= 24 || pointCount >= maxPoints) throw new RangeError('Conformal geometry budget exceeded; output not truncated');
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, mappedMid = transform.map(mid);
        const um = (u0 + u1) / 2; subdivisions++;
        edge(a, mid, mappedA, mappedMid, u0, um, depth + 1);
        edge(mid, b, mappedMid, mappedB, um, u1, depth + 1);
      } else {
        if (++pointCount > maxPoints) throw new RangeError('Conformal geometry budget exceeded; output not truncated');
        if (!Number.isFinite(mappedA.x) || !Number.isFinite(mappedA.y)) throw new RangeError('Non-finite transformed geometry');
        points.push(mappedA); material.push(u0); maxErrorBound = Math.max(maxErrorBound, error);
      }
    }
    const mapped = ring.points.map(transform.map);
    for (let i = 0; i < ring.points.length; i++) {
      const j = (i + 1) % ring.points.length;
      edge(ring.points[i], ring.points[j], mapped[i], mapped[j], i, i + 1, 0);
    }
    return { points, material, area: signedArea(points), sourceArea: ring.area };
  });
  return { rings, pointCount, subdivisions, maxErrorBound, tolerance,
    injectivity: transform.injectivity, argumentSpanBound: transform.argumentSpanBound };
}
