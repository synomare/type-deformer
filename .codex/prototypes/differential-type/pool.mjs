// Shared, caller-owned leases. The v39 editor owns scheduling. No timers or DOM.
import { createGrowthJob, normalizeGrowthSettings } from './runtime.mjs';

export function createGrowthPool({ idleEntries = 8, idleHistoryBytes = 16 * 1024 * 1024, historyEvery = 12 } = {}) {
  idleEntries = Number.isFinite(idleEntries) ? Math.max(0, Math.floor(idleEntries)) : 8;
  idleHistoryBytes = Number.isFinite(idleHistoryBytes) ? Math.max(0, idleHistoryBytes) : 16 * 1024 * 1024;
  historyEvery = Number.isFinite(historyEvery) ? Math.max(1, Math.floor(historyEvery)) : 12;
  const entries = new Map();
  let disposed = false, sequence = 0, cursor = 0;
  const clampAge = age => Number.isFinite(age) ? Math.max(0, Math.min(5, age)) : 0;
  const requiredStep = age => Math.min(4800, Math.ceil(clampAge(age) * 960 / historyEvery) * historyEvery);
  function trim() {
    const idle = [...entries.values()].filter(entry => !entry.leases.size).sort((a, b) => a.used - b.used);
    let bytes = idle.reduce((n, entry) => n + entry.job.historyBytes, 0);
    while (idle.length > idleEntries || bytes > idleHistoryBytes) {
      const entry = idle.shift(); if (!entry) break;
      bytes -= entry.job.historyBytes; entry.job.cancel(); entries.delete(entry.key);
    }
  }
  return {
    acquire(sourceKey, contours, settings = {}) {
      if (disposed) throw new Error('Growth pool is disposed');
      if (typeof sourceKey !== 'string' || !sourceKey) throw new TypeError('A stable font/mask/glyph identity is required');
      const normalized = normalizeGrowthSettings(settings), requestedAge = normalized.age;
      // The complete trajectory is independent of current age. Work only as far
      // as requested, on canonical history boundaries, so access order cannot
      // introduce arbitrary checkpoints that change subsequent interpolation.
      normalized.age = 5;
      const key = JSON.stringify([sourceKey, normalized]);
      let entry = entries.get(key);
      if (!entry) {
        entry = { key, job: createGrowthJob(contours, normalized, { historyEvery }), leases: new Map(), used: ++sequence };
        entries.set(key, entry);
      }
      const token = Symbol(), request = { age: requestedAge }; let released = false;
      entry.leases.set(token, request); entry.used = ++sequence;
      function assertLive() { if (released || disposed) throw new Error('Growth lease is released'); }
      return {
        request(age) { assertLive(); request.age = clampAge(age); entry.used = ++sequence; return this; },
        get state() {
          if (released || disposed) return { status: 'released', progress: 0 };
          const target = requiredStep(request.age), available = entry.job.completedSteps;
          const ready = !target || entry.job.status === 'complete' || available >= target;
          return { status: ready ? 'ready' : 'pending', age: request.age, availableAge: available / 960,
            progress: target ? Math.min(1, available / target) : 1 };
        },
        sample(age = request.age) {
          assertLive();
          // Playback reads an earlier point without lowering the preparation
          // target. A complete Compose loop must be prepared before recording.
          age = clampAge(age);
          return this.state.status === 'ready' && age <= request.age ? entry.job.sample(age) : null;
        },
        release() {
          if (released) return;
          released = true; entry.leases.delete(token); entry.used = ++sequence; trim();
        }
      };
    },
    advance({ budgetMs = 4, now = () => performance.now() } = {}) {
      if (disposed) return this;
      budgetMs = Number.isFinite(budgetMs) ? Math.max(0, Math.min(12, budgetMs)) : 4;
      const start = now();
      const pending = [...entries.values()].filter(entry => entry.leases.size && entry.job.status !== 'complete'
        && [...entry.leases.values()].some(request => requiredStep(request.age) > entry.job.completedSteps));
      // One shared time budget, not four milliseconds multiplied by glyph count.
      for (let visited = 0; visited < pending.length; visited++) {
        const remaining = budgetMs - (now() - start); if (remaining <= 0) break;
        const entry = pending[cursor % pending.length]; cursor++;
        const target = Math.max(...[...entry.leases.values()].map(request => requiredStep(request.age)));
        entry.job.advance({ budgetMs: remaining, maxSteps: target - entry.job.completedSteps, now });
      }
      trim(); return this;
    },
    get stats() {
      const values = [...entries.values()];
      return { entries: values.length, activeEntries: values.filter(entry => entry.leases.size).length,
        leases: values.reduce((n, entry) => n + entry.leases.size, 0),
        historyBytes: values.reduce((n, entry) => n + entry.job.historyBytes, 0),
        idleHistoryBytes: values.filter(entry => !entry.leases.size).reduce((n, entry) => n + entry.job.historyBytes, 0),
        completedSteps: values.reduce((n, entry) => n + entry.job.completedSteps, 0), disposed };
    },
    dispose() {
      for (const entry of entries.values()) entry.job.cancel();
      entries.clear(); disposed = true;
    }
  };
}
