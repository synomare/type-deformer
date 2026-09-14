import { createConformalMap, signedArea } from './core.mjs';

// Retain the original high-resolution polyline. Every tree node knows the
// distance of that entire source arc to its chord, not just the last revision.
// This is an error-bounded hierarchy, not CGAL topology-preserving decimation.
export function compileConformalGlyph(glyph) {
  let nodeCount = 0;
  const trees = glyph.rings.map(ring => {
    const source = ring.points, count = source.length;
    function build(start, end) {
      const a = source[start % count], b = source[end % count];
      const box = [Infinity, Infinity, -Infinity, -Infinity];
      const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
      let error2 = 0;
      for (let i = start; i <= end; i++) {
        const p = source[i % count];
        box[0] = Math.min(box[0], p.x); box[1] = Math.min(box[1], p.y);
        box[2] = Math.max(box[2], p.x); box[3] = Math.max(box[3], p.y);
        const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
        error2 = Math.max(error2, (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2);
      }
      const node = { start, end, a, b, box, sourceError: Math.sqrt(error2), left: null, right: null };
      if (end - start > 1) {
        const middle = (start + end) >> 1;
        node.left = build(start, middle); node.right = build(middle, end);
      }
      nodeCount++;
      return node;
    }
    // Each closed ring keeps at least 3/4 original anchors even at tiny scale.
    // No detached mark or counter can disappear because it failed a quota.
    const roots = [], divisions = Math.min(4, count);
    for (let i = 0; i < divisions; i++) roots.push(build(Math.floor(i * count / divisions), Math.floor((i + 1) * count / divisions)));
    return roots;
  });
  return { glyph, trees, nodeCount };
}

export function renderConformalLod(compiled, settings, phase = 0, options = {}) {
  const transform = createConformalMap(compiled.glyph, settings, phase);
  const tolerance = Number.isFinite(options.tolerance) ? Math.max(.00001, Math.min(10, options.tolerance)) : .08;
  const maxPoints = Number.isFinite(options.maxPoints) ? Math.max(3, Math.min(1000000, Math.floor(options.maxPoints))) : 131072;
  let pointCount = 0, visitedNodes = 0, mappedPoints = 0, maxErrorBound = 0;
  const map = p => { mappedPoints++; return transform.map(p); };
  const rings = compiled.glyph.rings.map((ring, index) => {
    const points = [], spans = [];
    function emit(a, start, end, error) {
      if (++pointCount > maxPoints) throw new RangeError('Conformal geometry budget exceeded; output not truncated');
      const p = map(a);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new RangeError('Non-finite transformed geometry');
      points.push(p); spans.push([start, end]); maxErrorBound = Math.max(maxErrorBound, error);
    }
    function edge(a, b, start, end, depth) {
      const error = transform.chordErrorBound(a, b);
      if (error <= tolerance) { emit(a, start, end, error); return; }
      if (depth >= 24 || pointCount >= maxPoints) throw new RangeError('Conformal geometry budget exceeded; output not truncated');
      const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, u = (start + end) / 2;
      edge(a, middle, start, u, depth + 1); edge(middle, b, u, end, depth + 1);
    }
    function visit(node) {
      visitedNodes++;
      if (!node.left) { edge(node.a, node.b, node.start, node.end, 0); return; }
      const sourceBound = node.sourceError === 0 ? 0 : node.sourceError * transform.derivativeBoundForBox(node.box);
      const bound = sourceBound + transform.chordErrorBound(node.a, node.b);
      if (bound <= tolerance) emit(node.a, node.start, node.end, bound);
      else { visit(node.left); visit(node.right); }
    }
    compiled.trees[index].forEach(visit);
    return { points, spans, sourceArea: ring.area, area: signedArea(points) };
  });
  return { rings, pointCount, mappedPoints, visitedNodes, maxErrorBound, tolerance,
    injectivity: transform.injectivity, argumentSpanBound: transform.argumentSpanBound };
}

// Maximum singular value of the actual affine transform maps a glyph-space
// error to a physical-pixel bound, including skew/mirror and export scale.
export function conformalPixelTolerance(matrix, pixelError = .2) {
  const { a, b, c, d } = matrix;
  if (![a, b, c, d, pixelError].every(Number.isFinite) || pixelError <= 0) throw new TypeError('Invalid output transform');
  const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d));
  if (scale === 0) return 10;
  const an = a / scale, bn = b / scale, cn = c / scale, dn = d / scale;
  const aa = an * an + bn * bn, cc = cn * cn + dn * dn, ac = an * cn + bn * dn;
  const sigma = scale * Math.sqrt((aa + cc + Math.hypot(aa - cc, 2 * ac)) / 2);
  // Fail explicitly instead of quietly losing the requested precision at
  // exceptionally high zoom. Singular/invisible transforms need no detail.
  const tolerance = sigma > 0 ? pixelError / sigma : 10;
  if (tolerance < .00001) throw new RangeError('Output scale exceeds Conformal precision budget');
  return Math.min(10, tolerance);
}
