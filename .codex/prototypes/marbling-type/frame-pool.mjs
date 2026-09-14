import { normalizeMarblingSettings } from './core.mjs';
import { createMarblingLodTask } from './lod.mjs';

export function normalizeMarblingFrameRequest(request) {
  const compiled = request?.compiled;
  if (!compiled?.glyph || !compiled?.trees) throw new TypeError('A compiled Marbling source is required');
  const settings = normalizeMarblingSettings(request.settings);
  const time = Number.isFinite(request.phase) ? ((request.phase % 1) + 1) % 1 : 0;
  const phase = settings.motion === 0 || settings.amount === 0 ? 0 : time;
  const tolerance = request.tolerance === undefined ? .08 : request.tolerance;
  if (!Number.isFinite(tolerance) || tolerance < .00001 || tolerance > 10) throw new RangeError('Invalid Marbling requested precision');
  return Object.freeze({ compiled, settings, phase, tolerance });
}

// A coherent active-frame working set. The caller chooses WHEN to accept a
// new animation phase; no quantisation, hidden temporal interpolation, or
// background frame history is introduced. Paint order/opacity stay with caller.
export function createMarblingFramePool({ pointLimit = 262144, taskFactory = createMarblingLodTask } = {}) {
  if (!Number.isInteger(pointLimit) || pointLimit < 3) throw new RangeError('Invalid Marbling pool point limit');
  const identities = new WeakMap();
  let entries = new Map(), nextId = 0, paused = false, cursor = 0, builds = 0;
  function descriptor(request) {
    const { compiled, settings, phase, tolerance } = normalizeMarblingFrameRequest(request);
    if (!identities.has(compiled)) identities.set(compiled, ++nextId);
    const settingsKey = settings.amount === 0 ? 'native' : Object.values(settings).join('/');
    return { key: `${identities.get(compiled)}:${settingsKey}:${phase}`, compiled, settings, phase, tolerance };
  }
  function pointUsage() {
    let ready = 0, working = 0;
    for (const entry of entries.values()) {
      ready += entry.data?.pointCount || 0;
      if (entry.task?.status === 'working') working += entry.task.progress.pointCount;
    }
    return { ready, working, total: ready + working };
  }
  function begin(entry) {
    if (entry.error || entry.data && entry.data.tolerance <= entry.tolerance) return;
    if (entry.task && entry.taskTolerance <= entry.tolerance) return;
    entry.task?.cancel();
    try {
      entry.task = taskFactory(entry.compiled, entry.settings, entry.phase, { tolerance: entry.tolerance, maxPoints: pointLimit });
      entry.taskTolerance = entry.tolerance; builds++;
      if (entry.task.status === 'complete') { entry.data = entry.task.result; entry.task = null; }
    } catch (failure) { entry.task = null; entry.error = failure; }
  }
  function ticket(entry, tolerance) {
    const live = () => entries.get(entry.key) === entry;
    const readable = () => live() && entry.data && entry.data.tolerance <= tolerance;
    return Object.freeze({
      key: entry.key,
      get status() { return !live() ? 'missing' : readable() ? 'ready' : entry.error ? 'error' : 'pending'; },
      get result() { return readable() ? entry.data : null; },
      get error() { return live() && !readable() ? entry.error : null; },
    });
  }
  function retire(entry) {
    entry.task?.cancel(); entry.task = null; entry.data = null;
    entry.compiled = null; entry.settings = null; entry.error = null;
  }
  function sync(requests) {
    // Validate ALL requests before mutating the existing frame/leases.
    const descriptions = requests.map(descriptor), targets = new Map();
    for (const description of descriptions) {
      const previous = targets.get(description.key);
      if (previous) previous.tolerance = Math.min(previous.tolerance, description.tolerance);
      else targets.set(description.key, { ...description });
    }
    const next = new Map();
    for (const target of targets.values()) {
      const entry = entries.get(target.key) || { ...target, data: null, task: null, error: null };
      entry.tolerance = target.tolerance; next.set(target.key, entry);
    }
    for (const [key, entry] of entries) if (!next.has(key)) retire(entry);
    entries = next; cursor = 0;
    for (const entry of entries.values()) {
      if (entry.data && entry.data.tolerance <= entry.tolerance) { entry.task?.cancel(); entry.task = null; entry.error = null; }
      begin(entry);
    }
    return descriptions.map(d => ticket(entries.get(d.key), d.tolerance));
  }
  function advance({ maxWork = 96, maxMs = 4, now } = {}) {
    if (paused) return false;
    const pending = [...entries.values()].filter(entry => entry.task?.status === 'working');
    if (!pending.length) return false;
    const entry = pending[cursor++ % pending.length], remaining = pointLimit - pointUsage().total;
    try {
      if (remaining <= 0) throw new RangeError('Marbling active geometry memory budget exceeded');
      // One work unit emits at most one point. Never exceed the active cap,
      // even while retaining a coarse result during a precision upgrade.
      entry.task.step({ maxWork: Math.max(1, Math.min(remaining, Number.isFinite(maxWork) ? maxWork : 96)), maxMs, ...(now ? { now } : {}) });
      if (entry.task.status === 'complete') {
        entry.data = entry.task.result; entry.task = null; entry.error = null;
      }
    } catch (error) { entry.task?.cancel(error); entry.task = null; entry.error = error; }
    return true;
  }
  function state() {
    const all = [...entries.values()];
    return { total: all.length, ready: all.filter(e => e.data && e.data.tolerance <= e.tolerance).length,
      pending: all.some(e => e.task?.status === 'working'), errors: all.filter(e => e.error).length,
      pointUsage: pointUsage(), pointLimit, paused, builds };
  }
  function retry() {
    for (const entry of entries.values()) if (entry.error) { entry.error = null; begin(entry); }
    paused = false;
  }
  return Object.freeze({ sync, advance, state, retry,
    setPaused(value) { paused = !!value; },
    reset() { for (const entry of entries.values()) retire(entry); entries.clear(); paused = false; cursor = 0; },
  });
}
