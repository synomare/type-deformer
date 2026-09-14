import { createMarblingCompileTask } from './lod.mjs';

// Active source leases. A key identifies font + grapheme + capture contract;
// revision identifies immutable source content. Colours, poses, effect values,
// animation time and destination precision do not belong in this key.
// load receives the remaining source-point allowance and must synchronously
// return a prepareMarblingGlyph result. Capture/ink analysis is NOT time-sliced.
export function createMarblingSourcePool({ pointLimit = 262144, nodeLimit = 524288,
  taskFactory = createMarblingCompileTask } = {}) {
  for (const n of [pointLimit, nodeLimit]) if (!Number.isInteger(n) || n < 1) throw new RangeError('Invalid Marbling source limit');
  let entries = new Map(), paused = false, cursor = 0, loads = 0, builds = 0;
  function descriptor(request, requireLoad = true) {
    if (typeof request?.key !== 'string' || !request.key || typeof request.revision !== 'string' || !request.revision ||
      requireLoad && typeof request.load !== 'function') throw new TypeError('Marbling source needs a key, revision and loader');
    return { id: JSON.stringify([request.key, request.revision]), key: request.key, revision: request.revision, load: request.load };
  }
  function usage() {
    let points = 0, nodes = 0;
    for (const entry of entries.values()) { points += entry.points; nodes += entry.nodes; }
    return { points, nodes };
  }
  function retire(entry) {
    entry.task?.cancel(); entry.task = null; entry.data = null; entry.load = null;
    entry.points = 0; entry.nodes = 0; entry.error = null;
  }
  function ticket(entry) {
    const live = () => entries.get(entry.id) === entry;
    return Object.freeze({
      get status() { return !live() ? 'missing' : entry.data ? 'ready' : entry.error ? 'error' : 'pending'; },
      get result() { return live() ? entry.data : null; },
      get error() { return live() ? entry.error : null; },
    });
  }
  function sync(requests) {
    // A bad edit must not evict the last valid source set. Loader closures are
    // captured once per revision, not replaced by per-frame mutable settings.
    const descriptions = requests.map(r => descriptor(r)), next = new Map();
    for (const d of descriptions) if (!next.has(d.id)) next.set(d.id, entries.get(d.id) ||
      { ...d, data: null, task: null, error: null, points: 0, nodes: 0 });
    for (const [id, entry] of entries) if (!next.has(id)) retire(entry);
    entries = next;
    return descriptions.map(d => ticket(entries.get(d.id)));
  }
  function advance(options = {}) {
    if (paused) return false;
    const pending = [...entries.values()].filter(e => !e.data && !e.error);
    if (!pending.length) return false;
    const entry = pending[cursor++ % pending.length];
    try {
      if (!entry.task) {
        const used = usage();
        loads++;
        const glyph = entry.load({ maxPoints: pointLimit - used.points });
        if (!Object.isFrozen(glyph) || !Array.isArray(glyph?.rings) || !Object.isFrozen(glyph.rings) ||
          !Number.isInteger(glyph.pointCount) || glyph.pointCount < 0) throw new TypeError('Invalid immutable Marbling source');
        let points = 0, nodes = 0;
        for (const ring of glyph.rings) {
          if (!Object.isFrozen(ring) || !Array.isArray(ring.points) || !Object.isFrozen(ring.points) || ring.points.length < 3)
            throw new TypeError('Invalid immutable Marbling source ring');
          points += ring.points.length;
          nodes += 2 * ring.points.length - Math.min(4, ring.points.length);
        }
        if (points !== glyph.pointCount) throw new TypeError('Invalid Marbling source point count');
        if (used.points + points > pointLimit || used.nodes + nodes > nodeLimit) throw new RangeError('Marbling active source budget exceeded');
        // Reserve the full hierarchy before any partial allocation. Active
        // glyphs are never evicted to silently lower quality or make room.
        entry.points = points; entry.nodes = nodes;
        entry.task = taskFactory(glyph); builds++;
      } else entry.task.step(options);
      if (entry.task.status === 'complete') {
        if (entry.task.result.nodeCount !== entry.nodes) throw new Error('Marbling source hierarchy count mismatch');
        entry.data = entry.task.result; entry.task = null; entry.load = null;
      } else if (entry.task.status !== 'working') throw entry.task.error || new Error('Marbling source compilation failed');
    } catch (failure) {
      entry.task?.cancel(failure); entry.task = null; entry.data = null;
      entry.points = 0; entry.nodes = 0; entry.error = failure;
    }
    return true;
  }
  function state() {
    const all = [...entries.values()];
    return { total: all.length, ready: all.filter(e => e.data).length, pending: all.some(e => !e.data && !e.error),
      errors: all.filter(e => e.error).length, paused, loads, builds, usage: usage(), pointLimit, nodeLimit };
  }
  return Object.freeze({ sync, advance, state,
    // Read-only export/preflight inspection cannot prune the live working set.
    peek(request) { const { id } = descriptor(request, false); return entries.has(id) ? ticket(entries.get(id)) : null; },
    retry() { for (const e of entries.values()) e.error = null; paused = false; },
    setPaused(value) { paused = !!value; },
    reset() { for (const e of entries.values()) retire(e); entries.clear(); paused = false; cursor = 0; },
  });
}
