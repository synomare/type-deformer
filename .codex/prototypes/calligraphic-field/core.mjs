// Half-alpha contours are supplied by the editor. This module never changes
// them: only the nib orientation is regularized over contour arclength.
export function createCalligraphyContourQuery(contours, normalReach = 4) {
  if (!Number.isFinite(normalReach) || normalReach < 0) throw new RangeError('Invalid normal reach');
  const edges = [];
  for (const ring of contours) {
    const points = ring.points, arc = [0];
    if (!points || points.length < 3) continue;
    for (const p of points) if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new TypeError('Invalid contour point');
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      arc.push(arc[arc.length - 1] + Math.hypot(b.x - a.x, b.y - a.y));
    }
    const total = arc[arc.length - 1]; if (total < 1e-8) continue;
    function at(s) {
      s = ((s % total) + total) % total;
      let lo = 0, hi = points.length;
      while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (arc[mid] <= s) lo = mid; else hi = mid; }
      const a = points[lo], b = points[(lo + 1) % points.length];
      const t = (s - arc[lo]) / Math.max(1e-12, arc[lo + 1] - arc[lo]);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    const reach = Math.min(Math.max(1e-6, normalReach), total / 8);
    const normals = points.map((p, i) => {
      const a = at(arc[i] - reach), b = at(arc[i] + reach);
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      // In the y-down contour compiler ink is on the right, including holes.
      return length > 1e-12 ? { x: (b.y - a.y) / length, y: -(b.x - a.x) / length } : { x: 0, y: 0 };
    });
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length], dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
      if (len2 < 1e-16) continue;
      edges.push({ id: edges.length, x: a.x, y: a.y, dx, dy, len2, n0: normals[i], n1: normals[(i + 1) % points.length],
        minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) });
    }
  }
  function tree(items) {
    if (!items.length) return null;
    const node = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const e of items) { node.minX = Math.min(node.minX, e.minX); node.minY = Math.min(node.minY, e.minY); node.maxX = Math.max(node.maxX, e.maxX); node.maxY = Math.max(node.maxY, e.maxY); }
    if (items.length <= 8) { node.edges = items; return node; }
    const axis = node.maxX - node.minX >= node.maxY - node.minY ? 'X' : 'Y';
    items.sort((a, b) => a['min' + axis] + a['max' + axis] - b['min' + axis] - b['max' + axis] || a.id - b.id);
    const mid = items.length >> 1; node.left = tree(items.slice(0, mid)); node.right = tree(items.slice(mid)); return node;
  }
  const root = tree(edges);
  function box(node, x, y) {
    const dx = Math.max(node.minX - x, 0, x - node.maxX), dy = Math.max(node.minY - y, 0, y - node.maxY); return dx * dx + dy * dy;
  }
  return { bounds: root && [root.minX, root.minY, root.maxX, root.maxY], edgeCount: edges.length,
    createChordQuery(ux, uy) {
      const length = Math.hypot(ux, uy);
      if (!Number.isFinite(length) || length === 0) throw new RangeError('Invalid chord direction');
      ux /= length; uy /= length;
      // Project the existing full-resolution segments once per writing angle.
      // An ink chord is one nonzero-winding interval, never a bridge over a
      // counter or an unrelated component. This is not recovered pen ductus.
      function project(node) {
        if (!node) return null;
        if (node.edges) {
          const items = node.edges.map(e => ({u:e.x*ux+e.y*uy, v:-e.x*uy+e.y*ux,
            du:e.dx*ux+e.dy*uy, dv:-e.dx*uy+e.dy*ux}));
          let min = Infinity, max = -Infinity;
          for (const e of items) { min=Math.min(min,e.v,e.v+e.dv); max=Math.max(max,e.v,e.v+e.dv); }
          return {min,max,items};
        }
        const left=project(node.left),right=project(node.right);
        return {min:Math.min(left.min,right.min),max:Math.max(left.max,right.max),left,right};
      }
      const projected=project(root),hits=[];
      return (x,y,out={}) => {
        if (!Number.isFinite(x)||!Number.isFinite(y)) throw new TypeError('Invalid chord point');
        const u=x*ux+y*uy,v=-x*uy+y*ux;
        hits.length=0; out.before=out.after=0; out.inside=false;
        function visit(node) {
          if (!node || v<node.min || v>=node.max) return;
          if (!node.items) { visit(node.left); visit(node.right); return; }
          for (const e of node.items) {
            const end=e.v+e.dv;
            if (!((e.v<=v&&v<end)||(end<=v&&v<e.v))) continue;
            hits.push({u:e.u+(v-e.v)*e.du/e.dv,delta:e.dv>0?1:-1});
          }
        }
        visit(projected); hits.sort((a,b)=>a.u-b.u);
        let winding=0,start=0;
        for (let i=0;i<hits.length;) {
          const at=hits[i].u,previous=winding;
          // Shared vertices/tangencies change winding together. Tolerance only
          // covers floating arithmetic at coincident crossings, not geometry.
          const epsilon=32*Number.EPSILON*Math.max(1,Math.abs(at));
          do { winding+=hits[i++].delta; } while(i<hits.length&&Math.abs(hits[i].u-at)<=epsilon);
          if (!previous&&winding) start=at;
          if (previous&&!winding && start<=u&&u<at) {
            out.before=u-start; out.after=at-u; out.inside=true; return out;
          }
        }
        return out;
      };
    },
    contains(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError('Invalid query point');
      let winding = 0;
      function visit(node) {
        if (!node || y < node.minY || y >= node.maxY || node.maxX <= x) return;
        if (!node.edges) { visit(node.left); visit(node.right); return; }
        for (const edge of node.edges) {
          const endY = edge.y + edge.dy;
          if (!((edge.y <= y && y < endY) || (endY <= y && y < edge.y))) continue;
          if (edge.x + (y - edge.y) * edge.dx / edge.dy > x) winding += edge.dy > 0 ? 1 : -1;
        }
      }
      visit(root); return winding !== 0;
    },
    query(x, y, out = {}) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError('Invalid query point');
      let best = Infinity, edge = null, fraction = 0;
      function visit(node) {
        if (!node || box(node, x, y) > best) return;
        if (node.edges) {
          for (const e of node.edges) {
            const t = Math.max(0, Math.min(1, ((x - e.x) * e.dx + (y - e.y) * e.dy) / e.len2));
            const dx = x - e.x - t * e.dx, dy = y - e.y - t * e.dy, d = dx * dx + dy * dy;
            if (d < best || (d === best && (!edge || e.id < edge.id))) { best = d; edge = e; fraction = t; }
          }
        } else if (box(node.left, x, y) <= box(node.right, x, y)) { visit(node.left); visit(node.right); }
        else { visit(node.right); visit(node.left); }
      }
      visit(root); out.distance = Math.sqrt(best);
      const nx = edge ? edge.n0.x * (1 - fraction) + edge.n1.x * fraction : 0;
      const ny = edge ? edge.n0.y * (1 - fraction) + edge.n1.y * fraction : 0;
      const length = Math.hypot(nx, ny);
      out.nx = length > 1e-12 ? nx / length : edge ? edge.dy / Math.sqrt(edge.len2) : 0;
      out.ny = length > 1e-12 ? ny / length : edge ? -edge.dx / Math.sqrt(edge.len2) : 0;
      return out;
    }
  };
}

export function buildCalligraphyContourField(contours, data, width, height, normalReach, padding) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || data.length !== width * height * 4) throw new RangeError('Invalid field dimensions');
  if (!Number.isFinite(padding) || padding < 0) throw new RangeError('Invalid field padding');
  const query = createCalligraphyContourQuery(contours, normalReach), count = width * height;
  const inside = new Uint8Array(count), distance = new Float32Array(count), nx = new Float32Array(count), ny = new Float32Array(count);
  // Preserve the existing signed-distance reader's +.5 convention. Values
  // outside the evaluated body+effect region are explicitly far outside.
  distance.fill(1e9);
  if (query.bounds) {
    const [x0, y0, x1, y1] = query.bounds, sample = {};
    const minX = Math.max(0, Math.floor(x0 - padding)), maxX = Math.min(width - 1, Math.ceil(x1 + padding));
    const minY = Math.max(0, Math.floor(y0 - padding)), maxY = Math.min(height - 1, Math.ceil(y1 + padding));
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const i = y * width + x; inside[i] = data[i * 4 + 3] > 127.5 ? 1 : 0;
      query.query(x + .5, y + .5, sample); distance[i] = sample.distance - .5; nx[i] = sample.nx; ny[i] = sample.ny;
    }
  }
  return { inside, distance, nx, ny, bounds: query.bounds };
}
