// Original contact-aware temporal sampling. Growth positions are never edited.
// Preserves the existing ~.2px trajectory fidelity in the 192px glyph frame,
// while retaining extra computed steps when a straight playback chord crosses.
import { createContactGuard } from './contacts.mjs';

function growthMaterialPoint(data, u, cursor) {
  while (cursor.i + 3 < data.length && data[cursor.i + 3] <= u) cursor.i += 3;
  const k = cursor.i, next = (k + 3) % data.length, nextU = next === 0 ? 1 : data[next];
  const w = (u - data[k]) / Math.max(Number.EPSILON, nextU - data[k]);
  cursor.x = data[k + 1] + (data[next + 1] - data[k + 1]) * w;
  cursor.y = data[k + 2] + (data[next + 2] - data[k + 2]) * w;
}

export function createHistoryRefiner(radius, { tolerance = .2 } = {}) {
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new RangeError('Expected finite temporal tolerance');
  const guard = createContactGuard(radius), scratch = [];
  let tests = 0, contactSplits = 0, errorSplits = 0;
  function motion(from, to) {
    scratch.length = to.rings.length;
    for (let ri = 0; ri < to.rings.length; ri++) {
      const data = to.rings[ri].data, previous = from.rings[ri].data, cursor = { i: 0 };
      const ring = scratch[ri] || (scratch[ri] = { points: [] }); ring.points.length = data.length / 3;
      for (let i = 0; i < data.length; i += 3) {
        growthMaterialPoint(previous, data[i], cursor);
        const p = ring.points[i / 3] || (ring.points[i / 3] = {});
        p.x = cursor.x; p.y = cursor.y; p.mx = data[i + 1] - p.x; p.my = data[i + 2] - p.y;
      }
    }
    return scratch;
  }
  function errorSquared(frame, from, to) {
    const t = (frame.step - from.step) / (to.step - from.step); let maximum = 0;
    for (let ri = 0; ri < to.rings.length; ri++) {
      const data = to.rings[ri].data, a = from.rings[ri].data, b = frame.rings[ri].data;
      const ca = { i: 0 }, cb = { i: 0 };
      for (let i = 0; i < data.length; i += 3) {
        growthMaterialPoint(a, data[i], ca); growthMaterialPoint(b, data[i], cb);
        const dx = ca.x + (data[i + 1] - ca.x) * t - cb.x;
        const dy = ca.y + (data[i + 2] - ca.y) * t - cb.y;
        maximum = Math.max(maximum, dx * dx + dy * dy);
      }
    }
    return maximum;
  }
  return {
    // Input is every computed step in one short interval, with ordered material
    // coordinates and stable ring identity. Return original frames, not morphs.
    select(frames) {
      const retained = [];
      function span(lo, hi) {
        if (hi - lo <= 1) { retained.push(frames[hi]); return; }
        const from = frames[lo], to = frames[hi]; let maximum = 0, split = (lo + hi) >> 1;
        for (let i = lo + 1; i < hi; i++) {
          const error = errorSquared(frames[i], from, to);
          if (error > maximum) { maximum = error; split = i; }
        }
        if (maximum > tolerance * tolerance) { errorSplits++; span(lo, split); span(split, hi); return; }
        tests++;
        if (guard.intersects(motion(from, to))) {
          contactSplits++; split = (lo + hi) >> 1; span(lo, split); span(split, hi); return;
        }
        retained.push(to);
      }
      if (frames.length > 1) span(0, frames.length - 1);
      return retained;
    },
    get stats() { return { tests, contactSplits, errorSplits }; },
    dispose() { guard.dispose(); scratch.length = 0; }
  };
}

export function createGrowthHistory(radius) {
  const refiner = createHistoryRefiner(radius), frames = [], recent = [], free = [], owned = [];
  let bytes = 0, disposed = false;
  function retain(frame) {
    // Retained frames own exact-sized buffers; scratch capacity is never hidden
    // in a retained subarray or recycled beneath an existing playback sample.
    const saved = { step: frame.step, rings: frame.rings.map(r => {
      const data = new Float64Array(r.data); bytes += data.byteLength;
      return { area: r.area, data };
    }) };
    frames.push(saved);
  }
  return {
    frames,
    capture(rings, step) {
      if (disposed) throw new Error('Growth history capture is disposed');
      const frame = free.pop() || { step: 0, rings: [], buffers: [] };
      if (!owned.includes(frame)) owned.push(frame);
      frame.step = step; frame.rings.length = rings.length;
      for (let ri = 0; ri < rings.length; ri++) {
        const r = rings[ri], size = r.points.length * 3;
        let buffer = frame.buffers[ri];
        if (!buffer || buffer.length < size) buffer = frame.buffers[ri] = new Float64Array(Math.max(24, 2 ** Math.ceil(Math.log2(size))));
        const data = buffer.subarray(0, size);
        for (let i = 0; i < r.points.length; i++) {
          const p = r.points[i]; data[i * 3] = p.u; data[i * 3 + 1] = p.x; data[i * 3 + 2] = p.y;
        }
        frame.rings[ri] = { area: r.area, data };
      }
      if (!frames.length) { retain(frame); free.push(frame); recent.push(frames[0]); }
      else recent.push(frame);
    },
    commit() {
      if (recent.length <= 1) return;
      for (const frame of refiner.select(recent)) retain(frame);
      for (let i = 1; i < recent.length; i++) free.push(recent[i]);
      recent.length = 0; recent.push(frames[frames.length - 1]);
    },
    get pendingSteps() { return Math.max(0, recent.length - 1); },
    get bytes() { return bytes; },
    get captureBytes() { return owned.reduce((n, f) => n + f.buffers.reduce((n, b) => n + b.byteLength, 0), 0); },
    get stats() { return refiner.stats; },
    disposeScratch() { refiner.dispose(); recent.length = 0; free.length = 0; owned.length = 0; disposed = true; }
  };
}
