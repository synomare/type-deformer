// Editor preparation state. No DOM and no scheduler: the host owns one rAF.
import { createGrowthPool } from './pool.mjs';
import { normalizeGrowthSettings } from './runtime.mjs';

export function growthRequestKey(sourceKey, settings) {
  return JSON.stringify([sourceKey, { ...normalizeGrowthSettings(settings), age: 5 }]);
}

export function createGrowthController({ historyLimit = 64 * 1024 * 1024, now = () => performance.now() } = {}) {
  let pool = createGrowthPool({ idleEntries: 4, idleHistoryBytes: 8 * 1024 * 1024 });
  let records = new Map(), paused = false, memoryPaused = false, error = '', disposed = false;
  let limit = historyLimit;
  function state() {
    const values = [...records.values()];
    const ready = values.filter(r => r.lease && r.lease.state.status === 'ready').length;
    const progress = values.length ? values.reduce((n, r) => n + (r.lease ? r.lease.state.progress : 0), 0) / values.length : 1;
    return { total: values.length, ready, progress, pending: ready < values.length,
      paused, memoryPaused, error, historyBytes: pool.stats.historyBytes, historyLimit: limit, disposed };
  }
  return {
    sync(requests) {
      if (disposed) throw new Error('Growth controller is disposed');
      const desired = new Map();
      for (const request of requests) {
        const settings = normalizeGrowthSettings(request.settings);
        if (!settings.age) continue;
        const key = growthRequestKey(request.sourceKey, settings), previous = desired.get(key);
        if (!previous || previous.settings.age < settings.age) desired.set(key, { ...request, settings });
      }
      let changed = records.size !== desired.size;
      for (const [key, record] of records) if (!desired.has(key)) {
        if (record.lease) record.lease.release(); records.delete(key); changed = true;
      }
      for (const [key, request] of desired) {
        const record = records.get(key);
        if (record) {
          if (record.settings.age !== request.settings.age) changed = true;
          record.settings = request.settings;
          if (record.lease) record.lease.request(request.settings.age);
        } else { records.set(key, { ...request, lease: null, data: null }); changed = true; }
      }
      if (changed) error = '';
      if (!records.size) { paused = false; memoryPaused = false; limit = historyLimit; }
      if (memoryPaused && pool.stats.historyBytes < limit) memoryPaused = false;
      if (!this.state.pending) memoryPaused = false;
      return this.state;
    },
    advance(budgetMs = 4) {
      if (disposed || paused || error) return this.state;
      if (pool.stats.historyBytes >= limit) { memoryPaused = true; return this.state; }
      if (memoryPaused) return this.state;
      const start = now();
      try {
        // At most one mask/resample initialization per task. Repeated instances
        // use one record. No mask extraction happens inside the per-glyph draw.
        for (const record of records.values()) if (!record.lease) {
          record.data = record.load();
          if (!record.data || !record.data.contours.length) throw new Error('この字形の輪郭を取得できません。フォントを変更してください。');
          record.lease = pool.acquire(record.sourceKey, record.data.contours, record.settings);
          break;
        }
        pool.advance({ budgetMs: Math.max(0, budgetMs - (now() - start)), now });
      } catch (failure) { error = failure.message || '輪郭の計算に失敗しました。'; }
      if (pool.stats.historyBytes >= limit && this.state.pending) memoryPaused = true;
      return this.state;
    },
    read(sourceKey, settings, age = settings.age) {
      const record = records.get(growthRequestKey(sourceKey, settings));
      if (!record || !record.lease || record.lease.state.status !== 'ready') return null;
      const rings = record.lease.sample(age);
      return rings ? { data: record.data, rings } : null;
    },
    isReady(sourceKey, settings) {
      if (settings.age <= 0) return true;
      const record = records.get(growthRequestKey(sourceKey, settings));
      return !!(record && record.settings.age >= settings.age && record.lease && record.lease.state.status === 'ready');
    },
    setPaused(value) { paused = !!value; return this.state; },
    allowMoreMemory() { limit = Math.max(limit * 2, pool.stats.historyBytes + historyLimit); memoryPaused = false; return this.state; },
    get state() { return state(); },
    reset() {
      pool.dispose(); records.clear(); pool = createGrowthPool({ idleEntries: 4, idleHistoryBytes: 8 * 1024 * 1024 });
      paused = memoryPaused = false; error = ''; limit = historyLimit;
    },
    dispose() { pool.dispose(); records.clear(); disposed = true; }
  };
}
