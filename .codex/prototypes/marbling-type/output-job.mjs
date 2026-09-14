import { createMarblingSceneSession } from './scene-session.mjs';
import { yieldMarblingWork, marblingPixelTolerance } from './lod.mjs';

const abortError = () => Object.assign(new Error('Marbling output preparation cancelled'), { name: 'AbortError' });
function outputRequest(display, destination) {
  if (!display || !Object.isFrozen(display) || !Object.isFrozen(display.scene)
    || !Array.isArray(display.instances)) throw new TypeError('Output needs an accepted immutable scene packet');
  if (!Array.isArray(destination?.transforms)) throw new TypeError('Output needs destination transforms');
  const pixelError = destination.pixelError ?? .2, transforms = new Map();
  marblingPixelTolerance({ a: 1, b: 0, c: 0, d: 1 }, pixelError);
  for (const item of destination.transforms) {
    if (!Number.isInteger(item?.glyphIndex) || item.glyphIndex < 0 || item.glyphIndex >= display.scene.glyphs.length
      || transforms.has(item.glyphIndex)) throw new TypeError('Invalid or duplicate output glyph index');
    const matrix = {};
    for (const key of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const value = item[key];
      if (!Number.isFinite(value)) throw new TypeError('Output transform must contain six finite coefficients');
      matrix[key] = value;
    }
    marblingPixelTolerance(matrix, pixelError);
    transforms.set(item.glyphIndex, Object.freeze({ glyphIndex: item.glyphIndex, ...matrix }));
  }
  const identities = new Map();
  const instances = display.instances.map(item => {
    if (!Object.isFrozen(item)) throw new TypeError('Output instance must be an accepted immutable record');
    const base = { glyphIndex: item.glyphIndex, settings: item.settings, phase: item.phase };
    if (item.kind === 'skip' || item.kind === 'native') return base;
    if (item.kind !== 'body' || !Object.isFrozen(item.source)) throw new TypeError('Output needs the accepted source glyph');
    const matrix = transforms.get(item.glyphIndex);
    if (!matrix) throw new TypeError('Missing destination transform for Marbling body');
    const source = item.source;
    if (!identities.has(source)) identities.set(source, 'source-' + identities.size);
    // Pin the already captured immutable source, not a live font loader or the
    // displayed coarse polygon. Repeated copies share one independent lease.
    return { ...base, transform: matrix, pixelError,
      source: { key: identities.get(source), revision: 'accepted-source', load: () => source } };
  });
  return { input: { revision: display.revision, stamp: display.stamp, scene: display.scene, instances },
    transforms: Object.freeze([...transforms.values()]), pixelError };
}

// One pinned output frame. Own pools are deliberately independent of live
// playback: neither finer output nor release may evict a live frame. Limits
// apply per job; hosts must serialize jobs to bound aggregate process memory.
// This prepares geometry; it is not a PNG/SVG encoder or a download handler.
export function createMarblingOutputJob(display, destination, options = {}) {
  let request = outputRequest(display, destination);
  const sourceOptions = options.sourceOptions && { ...options.sourceOptions };
  const frameOptions = options.frameOptions && { ...options.frameOptions };
  let session = createMarblingSceneSession({ sourceOptions, frameOptions });
  session.submit(request.input);
  let status = 'preparing', error = null, result = null, runner = null, slices = 0;
  let terminal, resolveTerminal, rejectTerminal;
  function resetTerminal() {
    terminal = new Promise((resolve, reject) => { resolveTerminal = resolve; rejectTerminal = reject; });
    terminal.catch(() => {}); // Manual jobs can fail before an async runner exists.
  }
  resetTerminal();
  function settle() {
    if (status !== 'preparing') return;
    const state = session.state();
    if (state.status === 'error') {
      status = 'error'; error = state.error; rejectTerminal(error); return;
    }
    if (state.status === 'ready') {
      // Recheck exact requested phase and destination precision, never accept a
      // coherent-but-older packet. This lookup is read-only.
      const packet = session.requireExact(request.input);
      result = Object.freeze({ packet, transforms: request.transforms, pixelError: request.pixelError });
      // Notification only: a fulfilled terminal promise must not pin geometry
      // after dispose() clears result and the session's working sets.
      status = 'ready'; resolveTerminal();
    }
  }
  settle();
  function fail(reason) {
    if (status !== 'preparing') return;
    status = 'error'; error = reason; session.reset(); rejectTerminal(reason);
  }
  function cancel(reason = abortError()) {
    if (status !== 'preparing') return false;
    status = 'cancelled'; error = reason; result = null;
    session.reset(); request = null; rejectTerminal(reason); return true;
  }
  function advance(budget) {
    if (status !== 'preparing') return false;
    try { slices++; const worked = session.advance(budget); settle(); return worked; }
    catch (failure) { fail(failure); return false; }
  }
  const api = Object.freeze({
    advance, cancel,
    read() { return status === 'ready' ? result : null; },
    require() {
      if (status === 'ready') return result;
      if (status === 'error' || status === 'cancelled' || status === 'disposed') throw error;
      throw Object.assign(new Error('Marbling output is not ready'), { code: 'MARBLING_PENDING' });
    },
    state() { return { status, error, slices, retainedResult: !!result, resources: session.state() }; },
    retry() {
      if (status !== 'error' || runner) return false;
      session.reset();
      session = createMarblingSceneSession({ sourceOptions, frameOptions });
      session.submit(request.input); status = 'preparing'; error = null; result = null;
      resetTerminal(); settle(); return true;
    },
    dispose() {
      if (status === 'disposed') return false;
      const reason = abortError(); reason.message = 'Marbling output preparation disposed';
      if (status === 'preparing') rejectTerminal(reason);
      session.reset(); request = null; result = null; error = reason; status = 'disposed'; return true;
    },
    run({ signal, yieldWork = yieldMarblingWork, budget } = {}) {
      if (runner) return Promise.reject(new Error('Marbling output runner is already active'));
      if (typeof yieldWork !== 'function') return Promise.reject(new TypeError('yieldWork must be a function'));
      const aborted = () => cancel(signal.reason === undefined ? abortError() : signal.reason);
      if (signal?.aborted) {
        const reason = signal.reason === undefined ? abortError() : signal.reason;
        cancel(reason); return Promise.reject(reason);
      }
      if (status === 'ready') return Promise.resolve(result);
      if (status !== 'preparing') return Promise.reject(error);
      signal?.addEventListener('abort', aborted, { once: true });
      // Start in a microtask so even immediately-ready work installs runner
      // before its finally block clears it. Race every yield with terminal
      // cancellation; an unresolved scheduler promise cannot retain the job.
      runner = Promise.resolve().then(async () => {
        try {
          while (status === 'preparing') {
            advance(budget);
            if (status === 'preparing') await Promise.race([Promise.resolve().then(yieldWork), terminal]);
          }
          return api.require();
        } catch (failure) { fail(failure); throw failure; }
        finally { signal?.removeEventListener('abort', aborted); runner = null; }
      });
      return runner;
    },
  });
  return api;
}
