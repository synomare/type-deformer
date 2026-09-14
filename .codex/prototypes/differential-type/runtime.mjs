// Original incremental growth runtime, embedded in the v39 editor.
// solver.mjs is retained as the independent, pre-optimization geometry oracle.
import { resample } from './solver.mjs';
import { createContactGuard } from './contacts.mjs';
import { createGrowthHistory } from './history.mjs';

export function normalizeGrowthSettings(settings = {}) {
  const normalized = (() => {
  const ranges = { age: [0, 5, 1], grain: [2.5, 12, 4], tension: [.18, 1.2, .8],
    memory: [0, .05, .007], patch: [0, 1, .8], areaGain: [.5, 2, 1.1], seed: [-2147483648, 2147483647, 31] };
  const result = {};
  for (const [key, [lo, hi, fallback]] of Object.entries(ranges)) {
    result[key] = Number.isFinite(settings[key]) ? Math.max(lo, Math.min(hi, settings[key])) : fallback;
  }
  return result;
})();
  return globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.core('differential',settings,normalized) : normalized;
}

export function createGrowthJob(contours, settings = {}, options = {}) {
  const s = normalizeGrowthSettings(settings);
  if (!Array.isArray(contours)) throw new TypeError('Expected contour array');
  for (const c of contours) {
    if (!Number.isFinite(c.area) || !Array.isArray(c.points) || c.points.length < 3
      || c.points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
      throw new TypeError('Expected finite closed contours');
    }
  }
  const rand = (x, y) => {
    const v = Math.sin(x * 127.1 + y * 311.7 + s.seed * 91.37) * 43758.5453123;
    return v - Math.floor(v);
  };
  function noise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y); let u = x - ix, v = y - iy;
    u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
    return (rand(ix, iy) * (1 - u) + rand(ix + 1, iy) * u) * (1 - v)
      + (rand(ix, iy + 1) * (1 - u) + rand(ix + 1, iy + 1) * u) * v;
  }
  function node(x, y, ax, ay, rest, u) {
    // Anchors never move: their seeded nutrient value need only be computed once.
    const nutrient = (1 - s.patch) + s.patch * (.2 + 1.8 * noise(ax / 28, ay / 28));
    return { x, y, ax, ay, rest, u, growth: 1 + .0018 * nutrient,
      ri: 0, i: 0, dx: 0, dy: 0, mx: 0, my: 0, bucket: null };
  }
  const rings = contours.map(c => {
    const sampled = resample(c.points, s.grain * .8);
    return { area: c.area, points: sampled.map((p, i) => node(p.x, p.y, p.x, p.y, 0, i / sampled.length)) };
  });
  for (const r of rings) r.points.forEach((p, i) => {
    const q = r.points[(i + 1) % r.points.length]; p.rest = Math.hypot(p.x - q.x, p.y - q.y);
  });
  const totalSteps = rings.length ? Math.round(s.age * 960) : 0, initialPoints = rings.reduce((n, r) => n + r.points.length, 0);
  const pointBudget = Math.max(4096, initialPoints), radius = s.grain * 2.5, radiusSquared = radius * radius;
  const contactGuard = createContactGuard(radius);
  // Linearized fourth-difference bending has spectral radius 16*tension;
  // neighboring .6 springs add at most 2.4 and the anchor adds memory.
  // Keep h*lambda below 2 with headroom, avoiding a hidden period-two mode at
  // high bending. This is not a stability proof for the nonlinear contact field.
  const integrationStep = Math.min(.11, 1.8 / (16 * s.tension + 2.4 + s.memory));
  let livePoints = initialPoints, maxPoints = initialPoints, completedSteps = 0, budgetReached = false;
  let status = totalSteps && rings.length ? 'pending' : 'complete';
  const historyEvery = Number.isFinite(options.historyEvery) ? Math.max(1, Math.round(options.historyEvery)) : 12;
  const recorder = options.history !== false ? createGrowthHistory(radius) : null;
  const history = recorder ? recorder.frames : [];
  // Reused numeric rows, buckets and ordered neighbor lists. No packed-key aliases.
  const grid = new Map(), bucketPool = [], rowPool = [], all = [];
  function releaseScratch() {
    contactGuard.dispose();
    recorder?.disposeScratch();
    for (const r of rings) for (const p of r.points) p.bucket = null;
    grid.clear(); bucketPool.length = 0; rowPool.length = 0; all.length = 0;
  }
  function record() {
    recorder?.commit();
  }
  recorder?.capture(rings, 0);
  if (!totalSteps) releaseScratch();
  function* simulate() {
    for (let step = 0; step < totalSteps && status !== 'cancelled'; step++) {
      grid.clear(); all.length = 0; let rowCount = 0, bucketCount = 0;
      for (let ri = 0; ri < rings.length; ri++) {
        const ps = rings[ri].points;
        for (let i = 0; i < ps.length; i++) {
          const p = ps[i]; p.ri = ri; p.i = i; p.dx = 0; p.dy = 0; all.push(p);
          const cx = Math.floor(p.x / radius), cy = Math.floor(p.y / radius);
          let row = grid.get(cy);
          if (!row) { row = rowPool[rowCount] || (rowPool[rowCount] = new Map()); rowCount++; row.clear(); grid.set(cy, row); }
          let bucket = row.get(cx);
          if (!bucket) {
            bucket = bucketPool[bucketCount] || (bucketPool[bucketCount] = { x: 0, y: 0, points: [], neighbors: [] });
            bucketCount++; bucket.x = cx; bucket.y = cy; bucket.points.length = 0; bucket.neighbors.length = 0; row.set(cx, bucket);
          }
          bucket.points.push(p); p.bucket = bucket;
        }
      }
      for (let i = 0; i < bucketCount; i++) {
        const bucket = bucketPool[i];
        for (let oy = -1; oy <= 1; oy++) {
          const row = grid.get(bucket.y + oy); if (!row) continue;
          for (let ox = -1; ox <= 1; ox++) {
            const neighbor = row.get(bucket.x + ox); if (neighbor) bucket.neighbors.push(neighbor.points);
          }
        }
      }
      yield;
      for (const r of rings) {
        const ps = r.points, n = ps.length; let area = 0, perimeter = 0;
        for (let j = 0; j < n; j++) {
          const a = ps[j], b = ps[(j + 1) % n];
          area += a.x * b.y - b.x * a.y; perimeter += Math.hypot(a.x - b.x, a.y - b.y);
        }
        const pressure = Math.max(-.5, Math.min(.5, (r.area * s.areaGain - area * .5) / Math.max(1, perimeter) * .09));
        for (let i = 0; i < n; i++) {
          const p = ps[i], q = ps[(i + 1) % n], a = ps[(i + n - 1) % n], aa = ps[(i + n - 2) % n], qq = ps[(i + 2) % n];
          p.rest = Math.min(s.grain * 1.5, p.rest * p.growth);
          const vx = q.x - p.x, vy = q.y - p.y, d = Math.max(.0001, Math.hypot(vx, vy)), force = (d - p.rest) * .6;
          p.dx += vx / d * force; p.dy += vy / d * force; q.dx -= vx / d * force; q.dy -= vy / d * force;
          const tx = q.x - a.x, ty = q.y - a.y, td = Math.max(.001, Math.hypot(tx, ty));
          p.dx += (-aa.x + 4 * a.x - 6 * p.x + 4 * q.x - qq.x) * s.tension + (p.ax - p.x) * s.memory + ty / td * pressure;
          p.dy += (-aa.y + 4 * a.y - 6 * p.y + 4 * q.y - qq.y) * s.tension + (p.ay - p.y) * s.memory - tx / td * pressure;
          for (const neighbors of p.bucket.neighbors) for (let bi = 0; bi < neighbors.length; bi++) {
            const b = neighbors[bi];
            if (b === p || b.ri === p.ri && (Math.abs(b.i - i) <= 3 || Math.abs(b.i - i) >= n - 3)) continue;
            const bx = p.x - b.x, by = p.y - b.y;
            if (bx * bx + by * by >= radiusSquared) continue;
            const bd = Math.hypot(bx, by);
            if (bd < radius && bd > 1e-5) {
              const repel = (1 - bd / radius) ** 2 * .8; p.dx += bx / bd * repel; p.dy += by / bd * repel;
            }
          }
          if (i % 32 === 31) yield;
        }
      }
      // Point repulsion alone misses an edge slipping between its neighbors.
      // Constrain proposed displacements before publishing any positions.
      for (const p of all) {
        const limit = Math.min(integrationStep, s.grain * .15 / Math.max(.0001, Math.hypot(p.dx, p.dy)));
        p.mx = p.dx * limit; p.my = p.dy * limit;
      }
      yield* contactGuard.constrain(rings);
      // Publish a whole step, never half-updated positions.
      for (const p of all) { p.x += p.mx; p.y += p.my; }
      if (step % 12 === 11) for (const r of rings) {
        const next = [];
        for (let i = 0; i < r.points.length; i++) {
          const p = r.points[i], q = r.points[(i + 1) % r.points.length]; next.push(p);
          if (Math.hypot(p.x - q.x, p.y - q.y) > s.grain * 1.25 && livePoints < pointBudget) {
            p.rest *= .5; livePoints++;
            next.push(node((p.x + q.x) / 2, (p.y + q.y) / 2, (p.ax + q.ax) / 2, (p.ay + q.ay) / 2, p.rest,
              (p.u + (i + 1 === r.points.length ? 1 : q.u)) / 2));
          }
        }
        r.points = next;
      }
      maxPoints = Math.max(maxPoints, livePoints); budgetReached = budgetReached || livePoints === pointBudget;
      completedSteps = step + 1;
      recorder?.capture(rings, completedSteps);
      // Initial font corners relax much faster than mature growth. Preserve
      // that short transient densely instead of inflating the entire history.
      if (completedSteps <= 48 && completedSteps % 4 === 0 || completedSteps % historyEvery === 0
        || completedSteps === totalSteps || recorder?.pendingSteps >= 12) record();
      if (completedSteps === totalSteps) { status = 'complete'; releaseScratch(); }
      yield;
    }
  }
  const iterator = simulate();
  function snapshot() {
    return { rings: rings.map(r => ({ area: r.area, points: r.points.map(p => ({ x: p.x, y: p.y, u: p.u })) })),
      steps: completedSteps, totalSteps, initialPoints, maxPoints, pointBudget, budgetReached,
      contact: contactGuard.stats, history: recorder?.stats || null, settings: { ...s }, status };
  }
  const job = {
    get status() { return status; }, get completedSteps() { return completedSteps; }, get totalSteps() { return totalSteps; },
    get progress() { return totalSteps ? completedSteps / totalSteps : 1; },
    get historyBytes() { return recorder?.bytes || 0; }, get historyFrames() { return history.length; },
    get historyCaptureBytes() { return recorder?.captureBytes || 0; },
    advance({ budgetMs = 4, maxSteps = Infinity, now = () => performance.now(), signal } = {}) {
      if (signal?.aborted) job.cancel();
      budgetMs = budgetMs === Infinity ? Infinity : Number.isFinite(budgetMs) ? Math.max(0, budgetMs) : 4;
      maxSteps = Number.isFinite(maxSteps) ? Math.floor(maxSteps) : Infinity;
      if (status === 'complete' || status === 'cancelled' || budgetMs <= 0 || maxSteps <= 0) return job;
      const start = now(), target = Math.min(totalSteps, completedSteps + maxSteps); status = 'running';
      while (completedSteps < target) {
        if (signal?.aborted) { job.cancel(); break; }
        if (now() - start >= budgetMs) break;
        if (iterator.next().done) { status = 'complete'; break; }
      }
      if (status === 'running') status = 'paused';
      return job;
    },
    cancel() { if (status !== 'complete') { status = 'cancelled'; iterator.return(); releaseScratch(); } return job; },
    snapshot,
    checkpoint() { record(); return job; },
    sample(age) { return sampleGrowthHistory(history, Number.isFinite(age) ? Math.max(0, age) * 960 : 0); }
  };
  return job;
}

export function sampleGrowthHistory(history, step) {
  if (!history.length) return [];
  let lo = 0, hi = history.length - 1;
  if (step <= history[lo].step) hi = lo;
  else if (step >= history[hi].step) lo = hi;
  else {
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (history[mid].step <= step) lo = mid; else hi = mid; }
    if (step === history[lo].step) hi = lo;
  }
  const from = history[lo], to = history[hi];
  const t = from === to ? 0 : (step - from.step) / (to.step - from.step);
  return to.rings.map((ring, ri) => {
    const a = from.rings[ri].data, b = ring.data, points = []; let k = 0;
    for (let j = 0; j < b.length; j += 3) {
      const u = b[j]; while (k + 3 < a.length && a[k + 3] <= u) k += 3;
      const next = (k + 3) % a.length, nextU = next === 0 ? 1 : a[next];
      const w = (u - a[k]) / Math.max(Number.EPSILON, nextU - a[k]);
      const x = a[k + 1] + (a[next + 1] - a[k + 1]) * w, y = a[k + 2] + (a[next + 2] - a[k + 2]) * w;
      points.push({ x: x + (b[j + 1] - x) * t, y: y + (b[j + 2] - y) * t, u });
    }
    return { area: ring.area, points };
  });
}

export function growthLoopAge(phase, age, depth = 1) {
  const p = Number.isFinite(phase) ? phase - Math.floor(phase) : 0;
  return Math.max(0, Math.min(5, Number.isFinite(age) ? age : 0))
    * (1 - Math.max(0, Math.min(1, Number.isFinite(depth) ? depth : 0)) * (1 - Math.cos(p * Math.PI * 2)) / 2);
}

export function grow(contours, settings = {}) {
  const job = createGrowthJob(contours, settings, { history: false });
  job.advance({ budgetMs: Infinity });
  return job.snapshot();
}

// Yield a task, not only a microtask. A UI adapter may inject its own scheduler.
export async function runGrowthJob(job, { budgetMs = 4, signal, onProgress, yieldTask } = {}) {
  const pause = yieldTask || (() => globalThis.scheduler?.yield ? globalThis.scheduler.yield()
    : new Promise(resolve => setTimeout(resolve, 0)));
  try {
    while (job.status !== 'complete' && job.status !== 'cancelled') {
      job.advance({ budgetMs: Number.isFinite(budgetMs) ? Math.max(.1, Math.min(12, budgetMs)) : 4, signal });
      if (signal?.aborted) job.cancel();
      if (job.status === 'cancelled') break;
      onProgress?.(job);
      if (job.status !== 'complete') await pause();
    }
  } catch (error) { job.cancel(); throw error; }
  return job;
}
