// Original continuous vertex/edge contact constraint; no third-party code.
// Coordinates and clearance are in the 192px glyph frame. This is a tolerant
// floating-point solver, not exact predicates or a repair of invalid input.
function cross(ax, ay, bx, by) { return ax * by - ay * bx; }

export function vertexEdgeHit(p, a, b) {
  const ex = b.x - a.x, ey = b.y - a.y, rx = p.x - a.x, ry = p.y - a.y;
  const evx = b.mx - a.mx, evy = b.my - a.my, rvx = p.mx - a.mx, rvy = p.my - a.my;
  const c = cross(ex, ey, rx, ry);
  const d = cross(ex, ey, rvx, rvy) + cross(evx, evy, rx, ry), e = cross(evx, evy, rvx, rvy);
  const mid = c + d * .5, end = c + d + e;
  const tolerance = 1e-11 * (1 + Math.abs(c) + Math.abs(d) + Math.abs(e));
  // Bernstein control values bound the orientation polynomial over the step.
  if (c > tolerance && mid > tolerance && end > tolerance
    || c < -tolerance && mid < -tolerance && end < -tolerance) return null;
  const roots = [];
  if (Math.abs(e) < tolerance) {
    if (Math.abs(d) > tolerance) roots.push(-c / d);
  } else {
    const discriminant = d * d - 4 * e * c;
    if (discriminant >= 0) {
      const sq = Math.sqrt(discriminant), q = -.5 * (d + (d >= 0 ? sq : -sq));
      roots.push(q / e);
      if (q) roots.push(c / q);
    }
  }
  roots.sort((x, y) => x - y);
  for (const time of roots) {
    if (time < 1e-8 || time > 1) continue;
    const dx = ex + evx * time, dy = ey + evy * time;
    const px = rx + rvx * time, py = ry + rvy * time, dd = dx * dx + dy * dy;
    if (dd < 1e-16) continue;
    const u = (px * dx + py * dy) / dd;
    if (u < -1e-8 || u > 1 + 1e-8) continue;
    // Ignore opening/grazing roots. Persistent collinearity and initial contact
    // are outside this test; a closing hit is separated before it is committed.
    const side = c >= 0 ? 1 : -1;
    if ((d + 2 * e * time) * side >= -tolerance) continue;
    const length = Math.sqrt(dd);
    return { p, a, b, time, u: Math.max(0, Math.min(1, u)), nx: -dy / length * side, ny: dx / length * side };
  }
  return null;
}

export function createContactGuard(cellSize) {
  if (!Number.isFinite(cellSize) || cellSize <= 0) throw new RangeError('Expected positive contact cell size');
  const edgePool = [], rows = new Map(), rowPool = [], bucketPool = [];
  let contacts = 0, stops = 0;
  function* grid(rings) {
    rows.clear(); let edgeCount = 0, rowCount = 0, bucketCount = 0;
    for (const ring of rings) for (let i = 0; i < ring.points.length; i++) {
      const a = ring.points[i], b = ring.points[(i + 1) % ring.points.length];
      const edge = edgePool[edgeCount] || (edgePool[edgeCount] = {}); edgeCount++;
      edge.a = a; edge.b = b;
      edge.minX = Math.min(a.x, a.x + a.mx, b.x, b.x + b.mx);
      edge.maxX = Math.max(a.x, a.x + a.mx, b.x, b.x + b.mx);
      edge.minY = Math.min(a.y, a.y + a.my, b.y, b.y + b.my);
      edge.maxY = Math.max(a.y, a.y + a.my, b.y, b.y + b.my);
      edge.cx = Math.floor(edge.minX / cellSize); edge.cy = Math.floor(edge.minY / cellSize);
      for (let y = edge.cy; y <= Math.floor(edge.maxY / cellSize); y++) {
        let row = rows.get(y);
        if (!row) { row = rowPool[rowCount] || (rowPool[rowCount] = new Map()); rowCount++; row.clear(); rows.set(y, row); }
        for (let x = edge.cx; x <= Math.floor(edge.maxX / cellSize); x++) {
          let bucket = row.get(x);
          if (!bucket) { bucket = bucketPool[bucketCount] || (bucketPool[bucketCount] = []); bucketCount++; bucket.length = 0; row.set(x, bucket); }
          bucket.push(edge);
        }
      }
      if (edgeCount % 128 === 0) yield;
    }
  }
  function hit(a, b) {
    if (a.a === b.a || a.a === b.b || a.b === b.a || a.b === b.b) return null;
    if (a.minX > b.maxX || a.maxX < b.minX || a.minY > b.maxY || a.maxY < b.minY) return null;
    let earliest = null;
    for (const candidate of [vertexEdgeHit(a.a, b.a, b.b), vertexEdgeHit(a.b, b.a, b.b),
      vertexEdgeHit(b.a, a.a, a.b), vertexEdgeHit(b.b, a.a, a.b)]) {
      if (candidate && (!earliest || candidate.time < earliest.time)) earliest = candidate;
    }
    return earliest;
  }
  return {
    // A read-only test for a proposed history chord. Ordinary floating-point
    // tolerances and the same valid-input limitations as the growth guard.
    intersects(rings) {
      for (const pause of grid(rings)) { /* drain the read-only broad phase */ }
      for (const [cy, row] of rows) for (const [cx, bucket] of row)
        for (let i = 0; i < bucket.length; i++) for (let j = i + 1; j < bucket.length; j++) {
          const a = bucket[i], b = bucket[j];
          if (cx === Math.max(a.cx, b.cx) && cy === Math.max(a.cy, b.cy) && hit(a, b)) return true;
        }
      return false;
    },
    *constrain(rings) {
      for (let pass = 0; pass < 12; pass++) {
        yield* grid(rings);
        let found = 0, visited = 0;
        for (const [cy, row] of rows) for (const [cx, bucket] of row)
          for (let i = 0; i < bucket.length; i++) for (let j = i + 1; j < bucket.length; j++) {
            const a = bucket[i], b = bucket[j];
            // Visit a pair in its first common grid cell, once per pass.
            if (cx !== Math.max(a.cx, b.cx) || cy !== Math.max(a.cy, b.cy)) continue;
            const collision = hit(a, b);
            if (collision) {
              found++; contacts++;
              const { p, a, b, u, nx, ny } = collision;
              if (pass >= 8) { p.mx = p.my = a.mx = a.my = b.mx = b.my = 0; }
              else {
                const signed = (p.x + p.mx - a.x - a.mx - u * (b.x + b.mx - a.x - a.mx)) * nx
                  + (p.y + p.my - a.y - a.my - u * (b.y + b.my - a.y - a.my)) * ny;
                // Distribute the normal correction; retain tangential motion.
                const impulse = Math.max(0, (.0125 - signed) / (1 + (1 - u) * (1 - u) + u * u));
                p.mx += nx * impulse; p.my += ny * impulse;
                a.mx -= nx * impulse * (1 - u); a.my -= ny * impulse * (1 - u);
                b.mx -= nx * impulse * u; b.my -= ny * impulse * u;
              }
            }
            if (++visited % 256 === 0) yield;
          }
        if (!found) return;
        yield;
      }
      // Conservative last resort: reject this positional step, not the whole
      // trajectory. Observable stats let regressions detect repeated stalling.
      for (const ring of rings) for (const p of ring.points) p.mx = p.my = 0;
      stops++;
    },
    get stats() { return { contacts, stops }; },
    dispose() { edgePool.length = 0; rows.clear(); rowPool.length = 0; bucketPool.length = 0; }
  };
}
