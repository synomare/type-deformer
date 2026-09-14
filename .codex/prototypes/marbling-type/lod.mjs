import { createMarblingMap } from './core.mjs';

// Retains every original point. Nodes only APPROXIMATE an arc when the source
// error transported through the current map, plus its chord curvature, fits
// the requested destination error. No fixed thinning or smoothing of the font.
// The same source hierarchy as synchronous compilation, suspended within a
// node's point scan (not merely between whole glyphs). The glyph must already
// be an immutable prepareMarblingGlyph result; capture/ink analysis is separate.
export function createMarblingCompileTask(glyph) {
  if (!glyph?.rings || !Object.isFrozen(glyph)) throw new TypeError('An immutable prepared Marbling glyph is required');
  const progress = { nodeCount: 0, visitedPoints: 0, workCount: 0 };
  let source = glyph, state = 'working', result = null, error = null;
  let trees = [], roots = [], stack = [], ringIndex = 0, rootIndex = 0;
  function push(start, end) {
    const points = source.rings[ringIndex].points, n = points.length;
    const a = points[start % n], b = points[end % n], dx = b.x - a.x, dy = b.y - a.y;
    stack.push({ start, end, a, b, dx, dy, length2: dx * dx + dy * dy, index: start,
      box: [Infinity, Infinity, -Infinity, -Infinity], error2: 0, stage: 0, left: null, right: null });
  }
  function nextRoot() {
    if (ringIndex >= source.rings.length) {
      result = Object.freeze({ glyph: source, trees: Object.freeze(trees), nodeCount: progress.nodeCount });
      source = null; state = 'complete'; trees = []; return;
    }
    const count = source.rings[ringIndex].points.length, divisions = Math.min(4, count);
    push(Math.floor(rootIndex * count / divisions), Math.floor((rootIndex + 1) * count / divisions));
  }
  function release() { source = null; trees = []; roots = []; stack = []; }
  nextRoot();
  return Object.freeze({
    get status() { return state; }, get result() { return result; }, get error() { return error; },
    get progress() { return { ...progress, state }; },
    cancel(reason = abortError()) {
      if (state !== 'working') return false;
      release(); state = 'cancelled'; error = reason; return true;
    },
    step({ maxWork = 2048, maxMs = 4, now = () => performance.now() } = {}) {
      if (state !== 'working') return state;
      const budget = Math.floor(limit(maxWork, 2048, 1, 1e7)), duration = limit(maxMs, Infinity, 0, 60000);
      const started = Number.isFinite(duration) ? now() : 0;
      try {
        let work = 0;
        while (state === 'working' && work < budget) {
          const node = stack[stack.length - 1];
          if (node.stage === 0) {
            const points = source.rings[ringIndex].points, count = points.length;
            const visits = Math.min(budget - work, node.end - node.index + 1,
              Number.isFinite(duration) ? duration === 0 ? 1 : 32 - work % 32 : Infinity);
            const { a, dx, dy, length2, box } = node;
            let error2 = node.error2;
            for (let i = 0; i < visits; i++) {
              const p = points[node.index++ % count];
              box[0] = Math.min(box[0], p.x); box[1] = Math.min(box[1], p.y);
              box[2] = Math.max(box[2], p.x); box[3] = Math.max(box[3], p.y);
              const t = length2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2)) : 0;
              error2 = Math.max(error2, (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2);
            }
            node.error2 = error2; work += visits; progress.workCount += visits; progress.visitedPoints += visits;
            if (node.index > node.end) { node.stage = 1; progress.nodeCount++; }
            // At most 32 visits between clock checks. This is cooperative work,
            // not a hard wall-time deadline or a guarantee about GC pauses.
            if (Number.isFinite(duration) && (duration === 0 || work % 32 === 0) && now() - started >= duration) break;
          } else if (node.stage === 1 && node.end - node.start > 1) {
            node.stage = 2; push(node.start, Math.floor((node.start + node.end) / 2));
          } else if (node.stage === 2) {
            node.stage = 3; push(Math.floor((node.start + node.end) / 2), node.end);
          } else {
            const data = Object.freeze({ start: node.start, end: node.end, a: node.a, b: node.b,
              box: Object.freeze(node.box), sourceError: Math.sqrt(node.error2), left: node.left, right: node.right });
            stack.pop();
            const parent = stack[stack.length - 1];
            if (parent) { if (parent.stage === 2) parent.left = data; else parent.right = data; }
            else {
              roots.push(data); rootIndex++;
              if (rootIndex === Math.min(4, source.rings[ringIndex].points.length)) {
                trees.push(Object.freeze(roots)); roots = []; rootIndex = 0; ringIndex++;
              }
              nextRoot();
            }
          }
        }
      } catch (failure) { release(); state = 'error'; error = failure; throw failure; }
      return state;
    },
  });
}

export function compileMarblingGlyph(glyph) {
  // Keep the original synchronous fast path for callers that intentionally
  // perform offline work. The resumable path is independently parity-tested.
  let nodeCount = 0;
  const trees = glyph.rings.map(ring => {
    const source = ring.points, count = source.length;
    function build(start, end) {
      const a = source[start % count], b = source[end % count];
      const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
      const box = [Infinity, Infinity, -Infinity, -Infinity];
      let error2 = 0;
      for (let i = start; i <= end; i++) {
        const p = source[i % count];
        box[0] = Math.min(box[0], p.x); box[1] = Math.min(box[1], p.y);
        box[2] = Math.max(box[2], p.x); box[3] = Math.max(box[3], p.y);
        const t = length2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2)) : 0;
        error2 = Math.max(error2, (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2);
      }
      const middle = Math.floor((start + end) / 2); nodeCount++;
      return Object.freeze({ start, end, a, b, box: Object.freeze(box), sourceError: Math.sqrt(error2),
        left: end - start > 1 ? build(start, middle) : null, right: end - start > 1 ? build(middle, end) : null });
    }
    const roots = [], divisions = Math.min(4, count);
    for (let i = 0; i < divisions; i++) roots.push(build(Math.floor(i * count / divisions), Math.floor((i + 1) * count / divisions)));
    return Object.freeze(roots);
  });
  return Object.freeze({ glyph, trees: Object.freeze(trees), nodeCount });
}

const limit = (v, fallback, min, max) => Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
const abortError = () => Object.assign(new Error('Marbling computation cancelled'), { name: 'AbortError' });

export function createMarblingLodTask(compiled, settings, phase = 0, options = {}) {
  const tolerance = limit(options.tolerance, .08, .00001, 10);
  const maxPoints = Math.floor(limit(options.maxPoints, 262144, 3, 1000000));
  const maxDepth = Math.floor(limit(options.maxDepth, 22, 0, 28));
  let source = compiled, transform = createMarblingMap(compiled.glyph, settings, phase);
  let state = 'working', result = null, error = null, ringIndex = 0;
  let points = [], spans = [], rings = [], stack = [], origin = null, previous = null, twiceArea = 0;
  let pointCount = 0, visitedNodes = 0, mappedPoints = 0, maxErrorBound = 0, workCount = 0;
  const identity = transform.identity;
  function pushRing() {
    if (ringIndex >= source.glyph.rings.length) {
      result = Object.freeze({ rings: Object.freeze(rings), pointCount, visitedNodes, mappedPoints, maxErrorBound, tolerance, identity });
      state = 'complete'; source = null; transform = null; stack = [];
      return;
    }
    if (identity) {
      const ring = source.glyph.rings[ringIndex];
      for (let i = ring.points.length - 1; i >= 0; i--) stack.push({ native: true, a: ring.points[i], start: i, end: i + 1 });
    } else for (let i = source.trees[ringIndex].length - 1; i >= 0; i--) stack.push(source.trees[ringIndex][i]);
  }
  function release() {
    source = null; transform = null; points = []; spans = []; rings = []; stack = []; origin = null; previous = null;
  }
  function fail(message) { throw new RangeError(`Marbling ${message}; no truncated output returned`); }
  function emit(a, start, end, bound) {
    if (++pointCount > maxPoints) fail('geometry budget exceeded');
    mappedPoints++;
    const point = Object.freeze(transform.map(a));
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) fail('non-finite transformed geometry');
    if (!origin) origin = point;
    if (previous) twiceArea += (previous.x - origin.x) * (point.y - origin.y) - (point.x - origin.x) * (previous.y - origin.y);
    previous = point;
    points.push(point); spans.push(Object.freeze([start, end])); maxErrorBound = Math.max(maxErrorBound, bound);
  }
  function advance(node) {
    visitedNodes++;
    if (node.native) { emit(node.a, node.start, node.end, 0); return; }
    if (node.left) {
      const sourceBound = node.sourceError === 0 ? 0 : node.sourceError * transform.derivativeBoundForBox(node.box);
      // If the original arc alone cannot fit, do not spend a Hessian pass
      // testing its chord. Descend without compromising the source error.
      if (sourceBound <= tolerance) {
        const bound = sourceBound + transform.chordErrorBound(node.a, node.b);
        if (bound <= tolerance) { emit(node.a, node.start, node.end, bound); return; }
      }
      stack.push(node.right, node.left);
      return;
    }
    const bound = transform.chordErrorBound(node.a, node.b);
    if (bound <= tolerance) { emit(node.a, node.start, node.end, bound); return; }
    const depth = node.depth || 0;
    if (depth >= maxDepth || pointCount >= maxPoints) fail('geometry budget exceeded');
    const middle = { x: node.a.x + (node.b.x - node.a.x) / 2, y: node.a.y + (node.b.y - node.a.y) / 2 };
    const u = (node.start + node.end) / 2;
    stack.push({ a: middle, b: node.b, start: u, end: node.end, depth: depth + 1 },
      { a: node.a, b: middle, start: node.start, end: u, depth: depth + 1 });
  }
  pushRing();
  return Object.freeze({
    get status() { return state; },
    get error() { return error; },
    get result() { return result; },
    get progress() { return { state, pointCount, visitedNodes, workCount, ringIndex, pendingNodes: stack.length }; },
    cancel(reason = abortError()) {
      if (state !== 'working') return false;
      error = reason; state = 'cancelled'; release(); return true;
    },
    step({ maxWork = 128, maxMs = Infinity, now = () => performance.now() } = {}) {
      if (state !== 'working') return state;
      const budget = Math.floor(limit(maxWork, 128, 1, 1e7));
      const duration = limit(maxMs, Infinity, 0, 60000), started = now();
      try {
        for (let work = 0; work < budget && state === 'working'; work++) {
          const node = stack.pop(); workCount++; advance(node);
          if (!stack.length) {
            rings.push(Object.freeze({ points: Object.freeze(points), spans: Object.freeze(spans),
              sourceArea: source.glyph.rings[ringIndex].area, area: twiceArea / 2 }));
            points = []; spans = []; origin = null; previous = null; twiceArea = 0; ringIndex++; pushRing();
          }
          if (now() - started >= duration) break;
        }
      } catch (failure) { error = failure; state = 'error'; release(); throw failure; }
      return state;
    },
  });
}

export function renderMarblingLod(compiled, settings, phase = 0, options = {}) {
  const task = createMarblingLodTask(compiled, settings, phase, options);
  while (task.status === 'working') task.step({ maxWork: 65536 });
  return task.result;
}

// Genuine task yielding, not a Promise.resolve microtask loop. The scheduler
// API is optional; a timer works on runtimes/Safari without scheduler.yield.
export function yieldMarblingWork() {
  return globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise(resolve => setTimeout(resolve, 0));
}

export async function runMarblingLodTask(task, { signal, yieldWork = yieldMarblingWork, maxWork = 96, maxMs = 4 } = {}) {
  let rejectAbort;
  const aborted = new Promise((_, reject) => { rejectAbort = reject; });
  // A rejection may occur before the first yield; attach a handler immediately.
  aborted.catch(() => {});
  const onAbort = () => { const reason = signal.reason === undefined ? abortError() : signal.reason; task.cancel(reason); rejectAbort(reason); };
  if (signal?.aborted) { task.cancel(signal.reason); throw signal.reason; }
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    while (task.status === 'working') {
      task.step({ maxWork, maxMs });
      if (task.status === 'working') await Promise.race([Promise.resolve().then(yieldWork), aborted]);
    }
    if (signal?.aborted) throw signal.reason;
    if (task.status !== 'complete') throw task.error;
    return task.result;
  } catch (failure) { task.cancel(failure); throw failure; }
  finally { signal?.removeEventListener('abort', onAbort); }
}

export function marblingPixelTolerance(matrix, pixelError = .2) {
  const { a, b, c, d } = matrix;
  if (![a, b, c, d, pixelError].every(Number.isFinite) || pixelError <= 0) throw new TypeError('Invalid Marbling output transform');
  const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d));
  if (scale === 0) return 10;
  const an = a / scale, bn = b / scale, cn = c / scale, dn = d / scale;
  const aa = an * an + bn * bn, cc = cn * cn + dn * dn, ac = an * cn + bn * dn;
  const sigma = scale * Math.sqrt((aa + cc + Math.hypot(aa - cc, 2 * ac)) / 2);
  const tolerance = pixelError / sigma;
  if (tolerance < .00001) throw new RangeError('Output scale exceeds Marbling precision budget');
  return Math.min(10, tolerance);
}
