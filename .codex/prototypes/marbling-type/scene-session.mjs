import { normalizeMarblingSettings } from './core.mjs';
import { marblingPixelTolerance } from './lod.mjs';
import { createMarblingSourcePool } from './source-pool.mjs';
import { createMarblingFrameController } from './frame-controller.mjs';

// The native host supplies the entire scene AND render state/clock as plain
// data, and a real destination getTransform() for each body. It must paint
// read().scene, not its newer mutable candidate. This module owns no clock,
// camera, DOM, renderer, or project schema. It is not editor registration.
function snapshotData(value, seen = new Set(), budget = { count: 0 }) {
  if (++budget.count > 500000) throw new RangeError('Marbling scene snapshot budget exceeded');
  if (value === null || value === undefined || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || (!Array.isArray(value) && Object.prototype.toString.call(value) !== '[object Object]'))
    throw new TypeError('Marbling scenes must contain finite plain data');
  if (seen.has(value)) throw new TypeError('Marbling scene cannot contain cycles');
  seen.add(value);
  const result = Array.isArray(value) ? new Array(value.length) : {};
  for (const key of Object.keys(value)) {
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (!property || !('value' in property)) throw new TypeError('Marbling scene cannot contain accessors');
    Object.defineProperty(result, key, { value: snapshotData(property.value, seen, budget), enumerable: true });
  }
  seen.delete(value);
  return Object.freeze(result);
}

function describe(input) {
  if (typeof input?.revision !== 'string' || !input.revision || !Number.isFinite(input.stamp)
    || !Array.isArray(input.scene?.glyphs) || !Array.isArray(input.instances))
    throw new TypeError('Marbling scene needs a revision, stamp, glyphs and instances');
  const scene = snapshotData(input.scene), indices = new Set(), revisions = new Map();
  const instances = Object.freeze(input.instances.map(item => {
    const index = item?.glyphIndex;
    if (!Number.isInteger(index) || index < 0 || index >= scene.glyphs.length || indices.has(index))
      throw new TypeError('Marbling needs one valid request per applied glyph');
    indices.add(index);
    const settings = normalizeMarblingSettings(item.settings), glyph = scene.glyphs[index];
    const phase = item.phase === undefined ? 0 : item.phase;
    if (!Number.isFinite(phase)) throw new TypeError('Marbling scene phase must be finite');
    const kind = !String(glyph.ch || '').trim() || glyph.opacity === 0 ? 'skip' : settings.amount === 0 ? 'native' : 'body';
    if (kind !== 'body') return Object.freeze({ glyphIndex: index, kind, settings, phase });
    const source = item.source;
    if (typeof source?.key !== 'string' || !source.key || typeof source.revision !== 'string' || !source.revision || typeof source.load !== 'function')
      throw new TypeError('Marbling body needs a captured source loader and revision');
    if (revisions.has(source.key) && revisions.get(source.key) !== source.revision)
      throw new TypeError('Conflicting Marbling source revisions in one scene');
    revisions.set(source.key, source.revision);
    // Read only four scalar values; never retain a mutable DOMMatrix.
    const matrix = item.transform;
    if (!matrix) throw new TypeError('Marbling body needs its destination transform');
    const tolerance = marblingPixelTolerance({ a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d }, item.pixelError ?? .2);
    return Object.freeze({ glyphIndex: index, kind, settings, phase, tolerance,
      source: Object.freeze({ key: source.key, revision: source.revision, load: source.load }) });
  }));
  const sourceKey = JSON.stringify([input.revision, instances.map(i => [i.glyphIndex, i.kind, i.source?.key, i.source?.revision])]);
  return Object.freeze({ revision: input.revision, stamp: input.stamp, scene, instances, sourceKey });
}

export function createMarblingSceneSession({ sourceOptions, frameOptions } = {}) {
  const sources = createMarblingSourcePool(sourceOptions), frames = createMarblingFrameController(frameOptions);
  let desired = null, nativeVisible = null, tickets = [], paused = false, serial = 0, submitted = null;
  let records = new Map(), acceptedFrames = 0, lastDisplayId = null, cachedGeometry = null, cachedPacket = null;
  const bodyItems = frame => frame.instances.filter(i => i.kind === 'body');
  function packet(frame, geometry) {
    let offset = 0;
    return Object.freeze({ revision: frame.revision, stamp: frame.stamp, scene: frame.scene,
      instances: Object.freeze(frame.instances.map(item => item.kind !== 'body' ? item : Object.freeze({
        glyphIndex: item.glyphIndex, kind: item.kind, settings: item.settings, phase: item.phase,
        shape: geometry.results[offset], source: geometry.requests[offset++].compiled.glyph,
      }))) });
  }
  function prune() {
    const state = frames.state(), retained = new Set([state.displayStamp, state.pendingStamp, state.desiredStamp]);
    for (const id of records.keys()) if (!retained.has(id)) records.delete(id);
    if (state.displayStamp !== null && state.displayStamp !== lastDisplayId) { lastDisplayId = state.displayStamp; acceptedFrames++; }
  }
  function sourceError() { return tickets.find(t => t.status === 'error')?.error || null; }
  function offerPrepared() {
    if (!desired || submitted === desired || !tickets.every(t => t.status === 'ready')) return false;
    const body = bodyItems(desired);
    if (!body.length) { nativeVisible = packet(desired, null); submitted = desired; return true; }
    const id = ++serial;
    const requests = body.map((item, i) => ({ compiled: tickets[i].result, settings: item.settings, phase: item.phase, tolerance: item.tolerance }));
    records.set(id, desired);
    frames.submit({ revision: desired.revision, stamp: id, requests }, { intent: desired.intent });
    submitted = desired; nativeVisible = null; prune(); return true;
  }
  function submit(input, { intent = 'seek' } = {}) {
    if (intent !== 'seek' && intent !== 'play') throw new TypeError('Invalid Marbling scene intent');
    const next = Object.freeze({ ...describe(input), intent }); // validate/snapshot before changing ANY live state
    if (!desired || next.sourceKey !== desired.sourceKey) {
      frames.reset(); frames.setPaused(paused); records.clear(); nativeVisible = null; lastDisplayId = null;
      cachedGeometry = null; cachedPacket = null;
    }
    desired = next;
    tickets = sources.sync(bodyItems(next).map(i => i.source));
    offerPrepared();
    return state();
  }
  function advance({ source = { maxWork: 2048, maxMs: 2 }, frame = { maxWork: 96, maxMs: 2 } } = {}) {
    if (paused) return false;
    // One source OR geometry slice. Synchronous glyph capture remains a
    // separate latency risk; maxMs is not a hard UI responsiveness guarantee.
    if (sources.state().pending) { const worked = sources.advance(source); offerPrepared(); return worked; }
    if (sourceError()) return false;
    const offered = offerPrepared(), worked = frames.advance(frame); prune(); return offered || worked;
  }
  function read() {
    if (nativeVisible) return nativeVisible;
    const geometry = frames.read(), record = geometry && records.get(geometry.stamp);
    if (!record) return null;
    if (cachedGeometry !== geometry) { cachedGeometry = geometry; cachedPacket = packet(record, geometry); }
    return cachedPacket;
  }
  function state() {
    const source = sources.state(), frame = frames.state(), visible = read();
    const error = sourceError() || frame.error;
    return { status: !desired ? 'empty' : error ? 'error' : source.pending ? 'preparing'
      : submitted !== desired || (!nativeVisible && frame.status !== 'ready') ? 'pending' : 'ready',
      paused, desiredStamp: desired?.stamp ?? null, displayStamp: visible?.stamp ?? null,
      error, source, frame, retainedScenes: new Set([...records.values(), desired].filter(Boolean)).size, acceptedFrames };
  }
  function readExact(input) {
    const target = describe(input), body = bodyItems(target);
    if (!body.length) return packet(target, null);
    const prepared = body.map(i => sources.peek(i.source));
    if (!prepared.every(t => t?.status === 'ready')) return null;
    const geometry = frames.readExact({ revision: target.revision, stamp: 0,
      requests: body.map((item, i) => ({ compiled: prepared[i].result, settings: item.settings, phase: item.phase, tolerance: item.tolerance })) });
    return geometry ? packet(target, geometry) : null;
  }
  return Object.freeze({ submit, advance, read, readExact, state,
    // Read-only owner handoff for native raster leases. External callers that
    // retain an older packet must acquire their own resource lease first.
    retainedSceneData() { return Object.freeze([...new Set([...records.values(), desired].filter(Boolean).map(frame => frame.scene))]); },
    requireExact(input) {
      const exact = readExact(input); if (exact) return exact;
      // A failed unrelated/live frame must not poison a valid export subset.
      const error = new Error('Marbling Typeの指定時刻・出力精度の字形が未準備です。');
      error.code = 'MARBLING_PENDING'; throw error;
    },
    setPaused(value) { paused = !!value; sources.setPaused(paused); frames.setPaused(paused); },
    retry() { sources.retry(); frames.retry(); paused = false; offerPrepared(); prune(); },
    reset() { sources.reset(); frames.reset(); desired = null; nativeVisible = null; submitted = null; tickets = []; records.clear(); paused = false; lastDisplayId = null; cachedGeometry = null; cachedPacket = null; },
  });
}
