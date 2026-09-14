import { createMarblingFramePool, normalizeMarblingFrameRequest } from './frame-pool.mjs';

// Coherent display + in-flight geometry, with ONE latest desired frame.
// This is not a clock or an interpolator: stamp belongs to the caller. Native
// placement, colour, opacity and other animated layers must be evaluated at the
// returned display stamp, never at a newer desired stamp. Human edits change
// revision; play coalesces clock updates; seek replaces unfinished work.
export function createMarblingFrameController(options = {}) {
  const pool = createMarblingFramePool(options), identities = new WeakMap();
  let nextId = 0, desired = null, visible = null, pending = null, failure = null, paused = false;
  let accepted = 0, requestsSubmitted = 0, replacements = 0;
  function geometryKey(request) {
    const { compiled, settings, phase } = request;
    if (!identities.has(compiled)) identities.set(compiled, ++nextId);
    return JSON.stringify([identities.get(compiled), settings.amount === 0 ? 'native' : Object.values(settings), phase]);
  }
  function describe(frame) {
    if (typeof frame?.revision !== 'string' || !frame.revision || !Number.isFinite(frame.stamp) || !Array.isArray(frame.requests))
      throw new TypeError('Marbling frame needs a revision, finite stamp and requests');
    const requests = Object.freeze(frame.requests.map(normalizeMarblingFrameRequest));
    const keys = Object.freeze(requests.map(geometryKey));
    const sourceKey = JSON.stringify([frame.revision, requests.map(r => identities.get(r.compiled))]);
    const targetKey = JSON.stringify(requests.map((r, i) => [keys[i], r.tolerance]));
    return Object.freeze({ revision: frame.revision, stamp: frame.stamp, requests, keys, sourceKey, targetKey });
  }
  function snapshot(frame, results) {
    return Object.freeze({ revision: frame.revision, stamp: frame.stamp, requests: frame.requests,
      results: Object.freeze([...results]) });
  }
  function lookup(frame) {
    if (!visible || frame.revision !== visible.frame.revision || frame.revision !== desired?.revision) return null;
    const shapes = new Map();
    visible.frame.keys.forEach((key, i) => {
      const result = visible.snapshot.results[i], old = shapes.get(key);
      if (!old || result.tolerance < old.tolerance) shapes.set(key, result);
    });
    const results = frame.keys.map((key, i) => {
      const result = shapes.get(key); return result && result.tolerance <= frame.requests[i].tolerance ? result : null;
    });
    return results.every(Boolean) ? results : null;
  }
  function keepVisibleOnly() { pool.sync(visible?.frame.requests || []); }
  function replacePending() {
    if (pending) replacements++;
    pending = null; keepVisibleOnly();
  }
  function accept(frame, results) {
    visible = { frame, snapshot: snapshot(frame, results) }; accepted++;
  }
  function start() {
    if (paused || failure || pending || !desired || !desired.requests.length) return false;
    const reusable = lookup(desired);
    if (reusable) {
      // Static geometry can serve a new native-layout stamp without rework.
      if (visible.frame.stamp !== desired.stamp || visible.frame.targetKey !== desired.targetKey) {
        accept(desired, reusable); keepVisibleOnly();
      } else visible.frame = desired;
      return false;
    }
    const retained = visible?.frame.requests || [];
    // Keep displayed geometry leased while building the new frame. The one
    // pool cap includes BOTH; overlapping/static shapes share the same entry.
    const tickets = pool.sync([...retained, ...desired.requests]).slice(retained.length);
    pending = { frame: desired, tickets };
    return true;
  }
  function settle() {
    if (!pending) return false;
    const failed = pending.tickets.find(t => t.status === 'error' || t.status === 'missing');
    if (failed) {
      failure = failed.error || new Error('Marbling pending frame source disappeared');
      pending = null; keepVisibleOnly(); return true;
    }
    if (!pending.tickets.every(t => t.status === 'ready')) return false;
    const completed = pending;
    accept(completed.frame, completed.tickets.map(t => t.result));
    pending = null; keepVisibleOnly(); return true;
  }
  function submit(frame, { intent = 'seek' } = {}) {
    if (intent !== 'play' && intent !== 'seek') throw new TypeError('Invalid Marbling frame intent');
    const next = describe(frame); // validate everything before touching leases
    const changedSource = desired && desired.sourceKey !== next.sourceKey;
    const changedTarget = desired && desired.targetKey !== next.targetKey;
    requestsSubmitted++;
    if (changedSource || !next.requests.length) {
      if (pending) replacements++;
      pending = null; visible = null; failure = null; pool.reset(); pool.setPaused(paused);
    } else if (intent === 'seek' && (changedTarget || failure)) {
      replacePending(); failure = null;
    }
    desired = next;
    if (pending?.frame.targetKey === next.targetKey) pending.frame = next;
    start(); settle();
    return state();
  }
  function advance(options = {}) {
    if (paused || failure) return false;
    const started = start();
    if (!pending) return started;
    const worked = pool.advance(options), changed = settle();
    return started || worked || changed;
  }
  function state() {
    const current = !!desired && !!visible && desired === visible.frame;
    return { status: !desired?.requests.length ? 'empty' : failure ? 'error' : current && !pending ? 'ready' : 'pending',
      paused, desiredStamp: desired?.stamp ?? null, pendingStamp: pending?.frame.stamp ?? null,
      displayStamp: visible?.frame.stamp ?? null, queued: !!pending && pending.frame !== desired,
      accepted, requestsSubmitted, replacements, error: failure, pool: pool.state() };
  }
  return Object.freeze({ submit, advance, state,
    read() { return visible?.snapshot || null; },
    // A strict export cannot mistake the held display for the newly requested
    // phase. Subsets/reordering are allowed only when exact sufficient-accuracy
    // geometry exists in the visible frame; this never mutates the live pool.
    readExact(frame) { const target = describe(frame), results = lookup(target); return results ? snapshot(target, results) : null; },
    retry() { failure = null; replacePending(); paused = false; pool.setPaused(false); start(); },
    setPaused(value) { paused = !!value; pool.setPaused(paused); },
    reset() { pool.reset(); desired = null; visible = null; pending = null; failure = null; paused = false; },
  });
}
