// Trial: integrate actual signed ink in the two anatomy sites' Voronoi cells.
// Moments are measured around the tool site (not just its empty counter).
function clipCell(points, site, other) {
  const nx = other.x - site.x, ny = other.y - site.y;
  if (nx === 0 && ny === 0) return points;
  const mx = site.x + nx / 2, my = site.y + ny / 2;
  const distance = p => (p.x - mx) * nx + (p.y - my) * ny;
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], da = distance(a), db = distance(b);
    if (da <= 0) out.push(a);
    if ((da <= 0) !== (db <= 0)) {
      const t = da / (da - db); out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

export function marblingInkSupport(rings, anchors) {
  if (!Array.isArray(rings) || !Array.isArray(anchors) || anchors.length !== 2) throw new TypeError('Expected rings and two sites');
  return Object.freeze(anchors.map((site, index) => {
    let area = 0, x = 0, y = 0, xx = 0, xy = 0, yy = 0;
    for (const ring of rings) {
      const points = clipCell(ring.points, site, anchors[1 - index]);
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        const ax = a.x - site.x, ay = a.y - site.y, bx = b.x - site.x, by = b.y - site.y;
        const cross = ax * by - bx * ay;
        area += cross / 2; x += (ax + bx) * cross / 6; y += (ay + by) * cross / 6;
        xx += (ax * ax + ax * bx + bx * bx) * cross / 12;
        xy += (2 * ax * ay + ax * by + bx * ay + 2 * bx * by) * cross / 24;
        yy += (ay * ay + ay * by + by * by) * cross / 12;
      }
    }
    if (Math.abs(area) < 1e-10) return Object.freeze({ ...site, area: 0, radius: 1, stretch: 1, angle: 0, covariance: Object.freeze([0, 0, 0]), centroid: Object.freeze({ ...site }) });
    const momentXX = Math.max(0, xx / area), momentYY = Math.max(0, yy / area), momentXY = xy / area;
    const trace = momentXX + momentYY, split = Math.hypot(momentXX - momentYY, 2 * momentXY);
    const major = Math.max(0, (trace + split) / 2), minor = Math.max(0, (trace - split) / 2);
    const regularizer = Math.max(1e-8, trace * .08), a = major + regularizer, b = minor + regularizer;
    return Object.freeze({ ...site, area: Math.abs(area), radius: 2.4 * Math.pow(a * b, .25),
      stretch: Math.pow(a / b, .25), angle: split > trace * 1e-10 ? Math.atan2(2 * momentXY, momentXX - momentYY) / 2 : 0,
      covariance: Object.freeze([momentXX, momentXY, momentYY]), centroid: Object.freeze({ x: site.x + x / area, y: site.y + y / area }) });
  }));
}
