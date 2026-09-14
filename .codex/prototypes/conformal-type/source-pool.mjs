// Active glyph leases only: copies share a source; no active glyph is evicted
// to make room for another. Over budget is explicit, never lower resolution.
export function createConformalSourcePool(options = {}) {
  const limit = options.pointLimit ?? 262144;
  let entries = new Map(), points = 0, paused = false;
  function sync(requests) {
    const next = new Map();
    for (const request of requests) if (!next.has(request.key)) {
      next.set(request.key, entries.get(request.key) || { request, data: null, error: '' });
    }
    entries = next;
    points = [...entries.values()].reduce((sum, entry) => sum + (entry.data?.pointCount || 0), 0);
  }
  function advance() {
    if (paused) return false;
    const entry = [...entries.values()].find(e => !e.data && !e.error);
    if (!entry) return false;
    try {
      const data = entry.request.load(Math.max(0, limit - points));
      if (!Number.isInteger(data.pointCount) || data.pointCount < 0) throw new Error('Invalid glyph source');
      if (points + data.pointCount > limit) throw new RangeError('字形メモリ上限に達しました。適用する文字種を減らしてください。');
      entry.data = data; points += data.pointCount;
    } catch (error) { entry.error = error.message || String(error); }
    return true;
  }
  function retry() { for (const entry of entries.values()) entry.error = ''; paused = false; }
  function state() {
    const all = [...entries.values()], ready = all.filter(e => e.data).length;
    return { total: all.length, ready, pending: all.some(e => !e.data && !e.error), paused, points,
      error: all.find(e => e.error)?.error || '', limit };
  }
  function inspect(key) {
    const entry = entries.get(key);
    return { status: !entry ? 'missing' : entry.data ? 'ready' : entry.error ? 'error' : 'pending', error: entry?.error || '' };
  }
  return { sync, advance, retry, state, inspect, read: key => entries.get(key)?.data || null,
    setPaused: value => { paused = !!value; }, reset: () => { entries.clear(); points = 0; paused = false; } };
}
