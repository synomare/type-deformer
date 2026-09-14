/* Contextual Fit: world-space, neighbour-conditioned outline transport.
 * No random masks, bridges, raster dilation, or camera-dependent geometry.
 * Each pass is a strictly increasing slice map. Counters and white channels
 * are different constraints: the former live inside a body, the latter between bodies.
 */
(function (root) {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const finite = (v, d) => Number.isFinite(v) ? v : d;
  function settings(p = {}) {
    return { pressure: clamp(finite(p.pressure, 1), 0, 3), channel: clamp(finite(p.channel, .035), 0, .5),
      follow: clamp(finite(p.follow, .85), 0, 2), counter: clamp(finite(p.counter, 1), 0, 1),
      axis: ['horizontal', 'vertical', 'both'].includes(p.axis) ? p.axis : 'horizontal',
      side: ['both', 'before', 'after'].includes(p.side) ? p.side : 'both', baseline: p.baseline !== false };
  }
  function bounds(rings) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of rings) for (const p of r.points) {
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
    }
    return { x0, y0, x1, y1 };
  }
  function intervals(rings, q, vertical = false) {
    const hits = [], a = vertical ? 'y' : 'x', b = vertical ? 'x' : 'y';
    for (const ring of rings) {
      const pts = ring.points;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const p = pts[j], r = pts[i];
        if ((p[b] <= q && r[b] > q) || (r[b] <= q && p[b] > q)) hits.push(p[a] + (q - p[b]) * (r[a] - p[a]) / (r[b] - p[b]));
      }
    }
    hits.sort((x, y) => x - y);
    return hits;
  }
  // Weighted isotonic regression with exact immovable anchors. Every interval
  // has an explicit minimum length. An infeasible fixed corridor is reported,
  // never solved by silently moving an unselected glyph or closing a counter.
  function project(target, lengths, fixed) {
    const offsets = [0];
    for (const n of lengths) offsets.push(offsets[offsets.length - 1] + n);
    const blocks = [];
    for (let i = 0; i < target.length; i++) {
      const v = target[i] - offsets[i];
      blocks.push({ from: i, to: i, sum: v, weight: 1, value: v, fixed: !!fixed[i] });
      while (blocks.length > 1 && blocks[blocks.length - 2].value > blocks[blocks.length - 1].value + 1e-9) {
        const b = blocks.pop(), a = blocks.pop();
        if (a.fixed && b.fixed) return null;
        const sum = a.sum + b.sum, weight = a.weight + b.weight;
        blocks.push({ from: a.from, to: b.to, sum, weight, fixed: a.fixed || b.fixed,
          value: a.fixed ? a.value : b.fixed ? b.value : sum / weight });
      }
    }
    const out = new Array(target.length);
    for (const b of blocks) for (let i = b.from; i <= b.to; i++) out[i] = b.value + offsets[i];
    return out;
  }
  function minimumBody(hits, p, em, from = -Infinity, to = Infinity) {
    let ink = 0, white = 0;
    for (let i = 1; i < hits.length; i++) {
      const w = Math.max(0, Math.min(to, hits[i]) - Math.max(from, hits[i - 1]));
      if (i % 2) ink += Math.min(w, em * .008); else white += w * Math.max(.04, p.counter);
    }
    return Math.max(em * .002, ink + white);
  }
  function sliceMap(hits, lo, hi, p, em, anchor = null) {
    if (hits.length < 2) return null;
    if (Math.abs(lo - hits[0]) < 1e-10 && Math.abs(hi - hits[hits.length - 1]) < 1e-10) return null;
    const inside = Number.isFinite(anchor) && anchor > hits[0] + 1e-8 && anchor < hits[hits.length - 1] - 1e-8;
    const source = inside ? [...new Set([...hits, anchor])].sort((a,b)=>a-b) : hits.slice();
    const cuts = inside ? [0, source.indexOf(anchor), source.length - 1] : [0, source.length - 1];
    const targets = inside ? [lo, anchor, hi] : [lo, hi], dest = new Array(source.length);
    for (let block = 0; block < cuts.length - 1; block++) {
      const weights = [], reserved = []; let sum = 0, reserve = 0;
      for (let i = cuts[block] + 1; i <= cuts[block + 1]; i++) {
        const w = Math.max(0, source[i] - source[i - 1]), midpoint = (source[i] + source[i - 1]) / 2;
        let index = 0; while (index + 1 < hits.length && hits[index + 1] <= midpoint) index++;
        const ink = index % 2 === 0;
        const r = ink ? Math.min(w, em * .008) : w * Math.max(.04, p.counter);
        reserved.push(r); reserve += r;
        const weight = Math.max(0, w - r) * (ink ? 1 : 1 - p.counter);
        weights.push(weight); sum += weight;
      }
      dest[cuts[block]] = targets[block];
      const spare = Math.max(0, targets[block + 1] - targets[block] - reserve);
      for (let i = 0; i < weights.length; i++) dest[cuts[block] + i + 1] = dest[cuts[block] + i] + reserved[i] + spare * weights[i] / Math.max(1e-12, sum);
      dest[cuts[block + 1]] = targets[block + 1];
    }
    return { source, dest };
  }
  function mapAt(map, x) {
    if (!map) return x;
    const s = map.source, d = map.dest;
    if (x <= s[0]) return x + d[0] - s[0];
    if (x >= s[s.length - 1]) return x + d[d.length - 1] - s[s.length - 1];
    let lo = 0, hi = s.length - 1;
    while (hi - lo > 1) { const mid = (hi + lo) >> 1; if (s[mid] <= x) lo = mid; else hi = mid; }
    return mix(d[lo], d[hi], (x - s[lo]) / Math.max(1e-12, s[hi] - s[lo]));
  }
  function enabled(g, vertical) { return g.active && (g.settings.axis === 'both' || g.settings.axis === (vertical ? 'vertical' : 'horizontal')); }
  function transport(input, options = {}) {
    const em = finite(options.em, 192), maxPoints = finite(options.maxPoints, 240000), maxGlyphs = finite(options.maxGlyphs, 96);
    if (!(em > 0) || !Array.isArray(input) || input.length > maxGlyphs) throw new RangeError('Contextual Fitは96字以内の短語・見出し用です。適用範囲を短くしてください。');
    let points = 0;
    let glyphs = input.map((g, i) => {
      if (!Array.isArray(g.rings)) throw new TypeError('Contextual Fit requires real glyph contours');
      const rings = g.rings.map(r => ({ points: r.points.map(p => {
        if (++points > maxPoints) throw new RangeError('Contextual Fitの輪郭量が上限に達しました。適用文字を減らしてください。');
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new TypeError('Invalid Contextual Fit outline');
        return { x: p.x, y: p.y };
      }) }));
      return { ...g, id: g.id ?? i, rings, active: g.active !== false, settings: settings(g.settings), bounds: bounds(rings) };
    });
    const warnings = new Set(); let contacts = 0;
    for (const vertical of [false, true]) {
      if (!glyphs.some(g => enabled(g, vertical) && g.settings.pressure > 0)) continue;
      const a0 = vertical ? 'y0' : 'x0', a1 = vertical ? 'y1' : 'x1', b0 = vertical ? 'x0' : 'y0', b1 = vertical ? 'x1' : 'y1';
      const candidates = glyphs.filter(g => g.rings.length && Number.isFinite(g.bounds[a0]));
      const lo = Math.min(...candidates.map(g => g.bounds[b0])), hi = Math.max(...candidates.map(g => g.bounds[b1]));
      if (!(hi > lo)) continue;
      const count = Math.ceil((hi - lo) / (em / 112)) + 1;
      if (count > 2048) throw new RangeError('Contextual Fitの配置が広すぎます。短い見出しの範囲を選択してください。');
      const step = (hi - lo) / count, maps = new Map(candidates.map(g => [g, new Array(count + 1)]));
      for (let row = 0; row <= count; row++) {
        const q = lo + step * row;
        const slices = candidates.map(g => ({ g, hits: intervals(g.rings, clamp(q, g.bounds[b0] + 1e-6, g.bounds[b1] - 1e-6), vertical) }))
          .filter(s => q >= s.g.bounds[b0] - step && q <= s.g.bounds[b1] + step && s.hits.length >= 2)
          .sort((s, t) => s.g.bounds[a0] + s.g.bounds[a1] - t.g.bounds[a0] - t.g.bounds[a1]);
        // Work on contact runs; distant words never become a stretched ribbon.
        let start = 0;
        while (start < slices.length) {
          let end = start + 1;
          while (end < slices.length) {
            const s = slices[end - 1], t = slices[end];
            if (t.g.bounds[a0] - s.g.bounds[a1] > em * 1.25 || (!vertical && s.g.line != null && t.g.line != null && s.g.line !== t.g.line)) break;
            end++;
          }
          const run = slices.slice(start, end), target = [], lengths = [], fixed = [];
          for (const s of run) {
            const on = enabled(s.g, vertical) && s.g.settings.pressure > 0;
            target.push(s.hits[0], s.hits[s.hits.length - 1]); fixed.push(!on, !on);
          }
          for (let i = 0; i < run.length - 1; i++) {
            const s = run[i], t = run[i + 1], sp = s.g.settings, tp = t.g.settings;
            const sa = enabled(s.g, vertical) && sp.side !== 'before', ta = enabled(t.g, vertical) && tp.side !== 'after';
            const r = s.hits[s.hits.length - 1], l = t.hits[0], base = (s.g.bounds[a1] + t.g.bounds[a0]) / 2;
            const follow = (sp.follow + tp.follow) / 2, seam = mix(base, (r + l) / 2, follow);
            const channel = em * Math.max(sa ? sp.channel : 0, ta ? tp.channel : 0);
            // A short isolated stroke may meet a neighbour, but cannot inflate
            // into a full slab merely because the rest of its glyph is absent
            // on this scanline. Cap excursion by both em and local ink span.
            const sReach = Math.min(em * .32, (r - s.hits[0]) * .65) * sp.pressure;
            const tReach = Math.min(em * .32, (t.hits[t.hits.length - 1] - l) * .65) * tp.pressure;
            const sr = sa ? r + clamp((seam - channel / 2 - r) * sp.pressure, -sReach, sReach) : r;
            const tl = ta ? l + clamp((seam + channel / 2 - l) * tp.pressure, -tReach, tReach) : l;
            target[i * 2 + 1] = sr; target[i * 2 + 2] = tl;
            if ((sa && sp.pressure > 0) || (ta && tp.pressure > 0)) contacts++;
          }
          const nodes = [], nodeFixed = [], leftIndex = [], rightIndex = [];
          for (let i = 0; i < run.length; i++) {
            const s = run[i], p = s.g.settings, on = enabled(s.g, vertical), t = on ? Math.min(1, p.pressure) : 0;
            const a = s.hits[0], b = s.hits[s.hits.length - 1], anchor = vertical && p.baseline ? s.g.baseline : null;
            const anchored = Number.isFinite(anchor), inside = anchored && anchor > a + 1e-8 && anchor < b - 1e-8;
            leftIndex.push(nodes.length); nodes.push(anchored && anchor <= a ? a : target[i * 2]);
            nodeFixed.push(fixed[i * 2] || (anchored && anchor <= a));
            if (inside) {
              lengths.push(mix(anchor - a, minimumBody(s.hits, p, em, a, anchor), t));
              nodes.push(anchor); nodeFixed.push(true);
              lengths.push(mix(b - anchor, minimumBody(s.hits, p, em, anchor, b), t));
            } else lengths.push(mix(b - a, minimumBody(s.hits, p, em), t));
            rightIndex.push(nodes.length); nodes.push(anchored && anchor >= b ? b : target[i * 2 + 1]);
            nodeFixed.push(fixed[i * 2 + 1] || (anchored && anchor >= b));
            if (i < run.length - 1) {
              const next = run[i + 1], np = next.g.settings;
              const amount = Math.min(1, Math.max(on ? p.pressure : 0, enabled(next.g, vertical) ? np.pressure : 0));
              lengths.push(mix(next.hits[0] - s.hits[s.hits.length - 1], em * Math.max(on ? p.channel : 0, enabled(next.g, vertical) ? np.channel : 0), amount));
            }
          }
          const projected = project(nodes, lengths, nodeFixed);
          if (!projected) warnings.add('固定した隣字の間に余白が足りない箇所は元の輪郭を維持しています。隣字も選択するか圧力・通路幅を下げてください。');
          for (let i = 0; i < run.length; i++) {
            const s = run[i];
            if (projected && enabled(s.g, vertical) && s.g.settings.pressure > 0) {
              maps.get(s.g)[row] = sliceMap(s.hits, projected[leftIndex[i]], projected[rightIndex[i]], s.g.settings, em,
                vertical && s.g.settings.baseline ? s.g.baseline : null);
            }
          }
          start = end;
        }
      }
      glyphs = glyphs.map(g => {
        if (!enabled(g, vertical) || !maps.has(g) || !g.settings.pressure || !maps.get(g).some(Boolean)) return g;
        const table = maps.get(g), a = vertical ? 'y' : 'x', b = vertical ? 'x' : 'y';
        function smoothMap(row, x) {
          let value = 0, total = 0;
          for (let k = -4; k <= 4; k++) {
            const weight = 5 - Math.abs(k), j = clamp(row + k, 0, count);
            value += mapAt(table[j], x) * weight; total += weight;
          }
          return value / total;
        }
        const rings = g.rings.map(r => {
          const dense = [];
          for (let k = 0; k < r.points.length; k++) {
            const p = r.points[k], next = r.points[(k + 1) % r.points.length];
            const n = Math.max(1, Math.ceil(Math.hypot(next.x - p.x, next.y - p.y) / (em / 112)));
            if (points + n - 1 > maxPoints) throw new RangeError('Contextual Fitの変形輪郭が上限に達しました。適用文字を減らしてください。');
            points += n - 1;
            for (let j = 0; j < n; j++) dense.push({ x: mix(p.x, next.x, j / n), y: mix(p.y, next.y, j / n) });
          }
          return { points: dense.map(p => {
          const u = clamp((p[b] - lo) / step, 0, count), i = Math.min(count - 1, Math.floor(u));
          const value = mix(smoothMap(i, p[a]), smoothMap(i + 1, p[a]), u - i);
          return { ...p, [a]: value };
          }) };
        });
        return { ...g, rings, bounds: bounds(rings) };
      });
    }
    return { glyphs, warnings: [...warnings], contacts, pointCount: points, bounds: bounds(glyphs.flatMap(g => g.rings)) };
  }
  root.TypeDeformerContextualFit = { settings, bounds, intervals, project, sliceMap, mapAt, transport };
})(typeof globalThis !== 'undefined' ? globalThis : this);
