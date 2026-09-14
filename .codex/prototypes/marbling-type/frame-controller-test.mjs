import assert from 'node:assert/strict';
import { createMarblingFrameController } from './frame-controller.mjs';
import { createMarblingFramePool } from './frame-pool.mjs';
import { MARBLING_PRESETS, prepareMarblingGlyph } from './core.mjs';
import { compileMarblingGlyph, renderMarblingLod } from './lod.mjs';

function instrumentedFactory() {
  const log = { starts: [], cancels: [], steps: 0 };
  function taskFactory(compiled, settings, phase, { tolerance, maxPoints }) {
    const id = log.starts.length, cost = compiled.glyph.cost || 19, points = compiled.glyph.points || 5;
    log.starts.push({ id, compiled, settings, phase, tolerance });
    if (compiled.glyph.fail) throw new Error('shape failed');
    let status = 'working', result = null, work = 0;
    return {
      get status() { return status; }, get result() { return result; },
      get progress() { return { pointCount: Math.min(points, Math.floor(work * points / cost)) }; },
      step({ maxWork }) {
        log.steps++; work += Math.min(maxWork, cost - work);
        if (points > maxPoints) throw new RangeError('geometry budget');
        if (work >= cost) {
          result = Object.freeze({ pointCount: points, tolerance, phase, mode: settings.mode,
            amount: settings.amount, name: compiled.glyph.name }); status = 'complete';
        }
      },
      cancel() { if (status !== 'working') return false; log.cancels.push(id); status = 'cancelled'; return true; },
    };
  }
  return { taskFactory, log };
}
const a = { glyph: { name: 'A', cost: 19 }, trees: [] }, b = { glyph: { name: 'B', cost: 37 }, trees: [] };
const settings = { ...MARBLING_PRESETS.eddy };
function frame(stamp, overrides = {}) {
  return { revision: 'scene-1', stamp, requests: [a, b].map((compiled, i) => ({ compiled, settings,
    phase: stamp + i * .13, tolerance: .08 })), ...overrides };
}
function drain(controller, max = 10000) {
  let steps = 0;
  while (controller.state().status === 'pending') { controller.advance({ maxWork: 3, maxMs: Infinity }); assert.ok(++steps < max); }
}

// Negative control: replacing the raw working-set every display tick never
// finishes even its first expensive source. This is not a shipped UI diagnosis.
const naiveMock = instrumentedFactory(), naive = createMarblingFramePool({ taskFactory: naiveMock.taskFactory });
let naiveReady = 0;
for (let i = 0; i < 120; i++) {
  const tickets = naive.sync(frame(i / 120).requests); naive.advance({ maxWork: 3 });
  if (tickets.every(t => t.status === 'ready')) naiveReady++;
}
assert.equal(naiveReady, 0); assert.ok(naiveMock.log.cancels.length > 100);

const mock = instrumentedFactory(), controller = createMarblingFrameController({ taskFactory: mock.taskFactory });
let last = null, published = 0;
for (let i = 0; i < 120; i++) {
  controller.submit(frame(i / 120), { intent: 'play' }); controller.advance({ maxWork: 3 });
  const current = controller.read();
  if (current && current !== last) {
    published++;
    assert.equal(current.results.length, 2);
    current.requests.forEach((r, j) => assert.equal(current.results[j].phase, r.phase));
    assert.ok(current.stamp <= i / 120); assert.ok(!last || current.stamp > last.stamp);
    last = current;
  }
}
assert.ok(published >= 3); assert.equal(mock.log.cancels.length, 0, 'play never cancels unfinished frames');
assert.ok(controller.state().queued || controller.state().status === 'pending');
drain(controller); assert.equal(controller.read().stamp, 119 / 120, 'drains to only the latest request, not a backlog');
assert.equal(controller.state().status, 'ready');
const stable = controller.read(), before = controller.state();
controller.submit(frame(119 / 120), { intent: 'play' });
assert.equal(controller.read(), stable); assert.equal(controller.state().accepted, before.accepted);
assert.equal(controller.state().pool.builds, before.pool.builds);

// Snapshot isolation, native time and strict read-only exports.
const mutable = frame(2); controller.submit(mutable, { intent: 'play' });
mutable.requests[0].phase = .888; mutable.requests[0].tolerance = 8;
mutable.requests[0].settings = { ...settings, amount: 0 }; mutable.requests.reverse();
controller.submit(frame(2.8), { intent: 'play' });
while (controller.read().stamp === stable.stamp) controller.advance({ maxWork: 3 });
assert.equal(controller.read().stamp, 2); assert.equal(controller.read().results[0].phase, 0);
assert.equal(controller.read().requests[0].settings.amount, settings.amount);
assert.ok(Object.isFrozen(controller.read()) && Object.isFrozen(controller.read().requests) && Object.isFrozen(controller.read().results));
assert.equal(controller.readExact(frame(2.8)), null, 'held old display cannot satisfy an exact newer export');
const inspectState = controller.state();
const subset = frame(2, { requests: [frame(2).requests[1]] });
assert.equal(controller.readExact(subset).results[0], controller.read().results[1]);
assert.deepEqual(controller.state(), inspectState, 'subset export must not mutate or evict');
assert.equal(controller.readExact({ ...subset, revision: 'wrong' }), null);
drain(controller);

// Invalid edits are transactional; seek overrides the obsolete in-flight time.
const previousState = controller.state(), previousDisplay = controller.read();
assert.throws(() => controller.submit({ ...frame(3), stamp: NaN }), /stamp/);
assert.throws(() => controller.submit(frame(3), { intent: 'unknown' }), /intent/);
assert.throws(() => controller.submit(frame(3, { requests: [...frame(3).requests, { compiled: a, tolerance: NaN }] })), /precision/);
assert.deepEqual(controller.state(), previousState); assert.equal(controller.read(), previousDisplay);
controller.submit(frame(3.4), { intent: 'play' }); controller.advance({ maxWork: 1 });
const cancelledBefore = mock.log.cancels.length;
controller.submit(frame(.125), { intent: 'seek' });
assert.ok(mock.log.cancels.length > cancelledBefore); drain(controller);
assert.equal(controller.read().stamp, .125);
controller.submit(frame(.75), { intent: 'play' }); controller.advance({ maxWork: 1 });
controller.setPaused(true); const pausedState = controller.state(), stepCount = mock.log.steps;
for (let i = 0; i < 5; i++) assert.equal(controller.advance(), false);
assert.deepEqual(controller.state(), pausedState); assert.equal(mock.log.steps, stepCount);
controller.submit(frame(.9), { intent: 'play' }); assert.equal(mock.log.steps, stepCount);
controller.setPaused(false); drain(controller); assert.equal(controller.read().stamp, .9);
controller.submit(frame(4), { intent: 'play' }); controller.advance({ maxWork: 1 });
controller.submit(frame(4.1, { revision: 'new text/font/settings' }), { intent: 'play' });
assert.equal(controller.read(), null, 'human scene revision cannot display the old content'); drain(controller);
controller.submit(frame(4.2, { revision: 'new text/font/settings', requests: [{ compiled: a, settings, phase: .2 }] }), { intent: 'play' });
assert.equal(controller.read(), null, 'changed source order/membership invalidates old display even without a revision bump'); drain(controller);
controller.submit(frame(5, { requests: [] }));
assert.equal(controller.read(), null); assert.equal(controller.state().status, 'empty'); assert.equal(controller.state().pool.pointUsage.total, 0);

// Animated settings and requested accuracy may change while a frame computes.
// The old snapshot has its own time/quality contract; do not starve it.
const animMock = instrumentedFactory(), animated = createMarblingFrameController({ taskFactory: animMock.taskFactory });
for (let i = 0; i < 120; i++) {
  const request = { compiled: a, settings: { ...settings, amount: .5 + i / 120 }, phase: i / 120, tolerance: .04 + .04 * i / 120 };
  animated.submit(frame(i, { requests: [request] }), { intent: 'play' }); animated.advance({ maxWork: 3 });
}
assert.ok(animated.state().accepted > 2); assert.equal(animMock.log.cancels.length, 0); drain(animated);
assert.equal(animated.read().stamp, 119);

// Frozen/zero motion reuses geometry while carrying the new native pose stamp.
const staticMock = instrumentedFactory(), staticController = createMarblingFrameController({ taskFactory: staticMock.taskFactory });
const staticFrame = stamp => frame(stamp, { requests: [{ compiled: a, settings: { ...settings, motion: 0 }, phase: stamp }] });
staticController.submit(staticFrame(0)); drain(staticController);
const staticResult = staticController.read().results[0], staticBuilds = staticController.state().pool.builds;
for (const stamp of [1, -2, 19, .99]) {
  staticController.submit(staticFrame(stamp), { intent: 'play' });
  assert.equal(staticController.read().stamp, stamp); assert.equal(staticController.read().results[0], staticResult);
}
assert.equal(staticController.state().pool.builds, staticBuilds);

// Retained display AND pending points must fit the same cap. An error keeps
// only the valid display, stops automatic play retries, and rejects newer export.
const smallMock = instrumentedFactory(), small = createMarblingFrameController({ pointLimit: 8, taskFactory: smallMock.taskFactory });
const single = stamp => frame(stamp, { requests: [{ compiled: a, settings, phase: stamp }] });
small.submit(single(0)); drain(small); const held = small.read();
small.submit(single(.3), { intent: 'play' });
while (small.state().status === 'pending') {
  small.advance({ maxWork: 2 }); assert.ok(small.state().pool.pointUsage.total <= 8);
}
assert.equal(small.state().status, 'error'); assert.equal(small.read(), held); assert.equal(small.readExact(single(.3)), null);
const failedBuilds = small.state().pool.builds;
for (let i = 0; i < 20; i++) { small.submit(single(.4 + i / 100), { intent: 'play' }); assert.equal(small.advance(), false); }
assert.equal(small.state().pool.builds, failedBuilds);
small.retry(); assert.ok(small.state().pool.builds > failedBuilds);
small.submit({ ...single(.3), revision: 'clear old working set' }); drain(small);
assert.equal(small.state().status, 'ready');
const failing = { glyph: { name: 'bad', fail: true }, trees: [] };
small.submit(frame(1, { requests: [{ compiled: failing, settings }] }));
assert.equal(small.state().status, 'error'); assert.equal(small.read(), null);
small.reset(); assert.equal(small.state().status, 'empty'); assert.equal(small.state().pool.pointUsage.total, 0);

// Real source, original deformation law: no interpolation or altered defaults.
const glyph = prepareMarblingGlyph([{ points: Array.from({ length: 128 }, (_, i) => ({ x: Math.cos(i * Math.PI / 64) * 65, y: Math.sin(i * Math.PI / 64) * 90 })) }]);
const compiled = compileMarblingGlyph(glyph), real = createMarblingFrameController();
const realFrame = stamp => frame(stamp, { requests: Array.from({ length: 300 }, (_, i) => ({ compiled,
  settings: Object.values(MARBLING_PRESETS)[i % 3], phase: stamp, tolerance: i % 5 === 0 ? .04 : .08 })) });
let realAccepted = 0, realPrevious = null;
for (let tick = 0; tick < 240; tick++) {
  real.submit(realFrame(tick / 240), { intent: 'play' }); real.advance({ maxWork: 96, maxMs: Infinity });
  const value = real.read();
  if (value && value !== realPrevious) {
    realAccepted++; realPrevious = value;
    for (let i = 0; i < 3; i++) assert.deepEqual(value.results[i], renderMarblingLod(compiled, Object.values(MARBLING_PRESETS)[i], value.stamp, { tolerance: .04 }));
    for (let i = 0; i < 300; i++) assert.equal(value.results[i], value.results[i % 3]);
  }
}
assert.ok(realAccepted > 0); drain(real, 100000);
assert.equal(real.read().stamp, 239 / 240);
assert.equal(real.state().replacements, 0);
console.log(JSON.stringify({ status: 'pass', naiveReady, coherentPublishedDuring120Ticks: published, realAcceptedDuring240Ticks: realAccepted,
  checks: 'whole-frame publication; play coalescing; exact source law; mutable-input isolation; native stamp; strict subset export; seek/revision; pause; static reuse; animated precision/settings; combined memory cap; stable failure/retry/reset',
  scope: 'offline scheduler/state/geometry tests, not browser, actual Compose or measured display FPS' }));
