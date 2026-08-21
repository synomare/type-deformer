import assert from 'node:assert/strict';
import test from 'node:test';

await import('../text-animator.js');
await import('../text-animator-timeline.js');

const engine = globalThis.TypeDeformerTextAnimator;
const timeline = engine.timeline;

function items() {
  return [
    { characterIndex: 0, wordIndex: 0, lineIndex: 0 },
    { characterIndex: 1, wordIndex: 0, lineIndex: 0 },
    { characterIndex: 2, wordIndex: 1, lineIndex: 0 },
    { characterIndex: 3, wordIndex: 2, lineIndex: 1 }
  ];
}

function oneItem() {
  return [{ characterIndex: 0, wordIndex: 0, lineIndex: 0 }];
}

test('normalizes keyframes, clamps values, and merges loop-equivalent times', () => {
  const track = timeline.normalizeTrack([
    { id: 'first', time: 0, value: -9999, easing: 'hold' },
    { id: 'last', time: 1, value: 240, easing: 'unknown' },
    { id: 'middle', time: 0.5, value: Infinity, easing: 'easeOut' }
  ], 'x');

  assert.equal(track.length, 2);
  assert.equal(track[0].id, 'last');
  assert.equal(track[0].time, 0);
  assert.equal(track[0].value, 240);
  assert.equal(track[0].easing, 'linear');
  assert.equal(track[1].time, 0.5);
  assert.equal(track[1].value, 0);
});

test('samples linear, hold, and eased segments deterministically', () => {
  const linear = [
    { id: 'a', time: 0, value: 0, easing: 'linear' },
    { id: 'b', time: 0.5, value: 200, easing: 'linear' }
  ];
  assert.equal(timeline.sampleTrack(linear, 0.25, 0, 'x'), 100);

  const hold = structuredClone(linear);
  hold[0].easing = 'hold';
  assert.equal(timeline.sampleTrack(hold, 0.25, 0, 'x'), 0);

  const eased = structuredClone(linear);
  eased[0].easing = 'easeIn';
  assert.equal(timeline.sampleTrack(eased, 0.25, 0, 'x'), 50);
});

test('wrap interpolation is continuous and phase one equals phase zero', () => {
  const track = [
    { id: 'late', time: 0.75, value: 100, easing: 'linear' },
    { id: 'early', time: 0.25, value: 0, easing: 'linear' }
  ];
  assert.equal(timeline.sampleTrack(track, 0, 0, 'x'), 50);
  assert.equal(timeline.sampleTrack(track, 1, 0, 'x'), 50);
  assert.equal(timeline.sampleTrack(track, 0.875, 0, 'x'), 75);
});

test('normalized animator state retains tracks and overrides transform at sample time', () => {
  const state = engine.defaultState();
  state.enabled = true;
  state.animators[0].transform.x = 15;
  state.animators[0] = timeline.upsertKey(state.animators[0], 'x', 0, 0, 'linear');
  state.animators[0] = timeline.upsertKey(state.animators[0], 'x', 0.5, 200, 'linear');

  const normalized = engine.normalizeState(JSON.parse(JSON.stringify(state)));
  assert.equal(normalized.animators[0].tracks.x.length, 2);
  assert.equal(timeline.sampleTransform(normalized.animators[0], 0.25).x, 100);
  assert.equal(engine.evaluateStack(normalized, oneItem(), 0.25)[0].x, 100);
  assert.deepEqual(
    engine.evaluateStack(normalized, oneItem(), 0),
    engine.evaluateStack(normalized, oneItem(), 1)
  );
});

test('keyframe operations add, move, duplicate, remove, copy, and paste tracks', () => {
  let animator = engine.defaultAnimator('Timeline', 'timeline');
  animator = timeline.upsertKey(animator, 'rotation', 0.1, 10, 'easeOut');
  const firstId = animator.tracks.rotation[0].id;
  animator = timeline.moveKey(animator, 'rotation', firstId, 0.2, 30, 'hold');
  assert.ok(Math.abs(animator.tracks.rotation[0].time - 0.2) < 1e-12);
  assert.equal(animator.tracks.rotation[0].value, 30);
  assert.equal(animator.tracks.rotation[0].easing, 'hold');

  animator = timeline.duplicateKey(animator, 'rotation', firstId, 1 / 30);
  assert.equal(animator.tracks.rotation.length, 2);

  const payload = timeline.copyTrack(animator, 'rotation');
  let target = engine.defaultAnimator('Target', 'target');
  target = timeline.pasteTrack(target, 'rotation', payload);
  assert.deepEqual(target.tracks.rotation, animator.tracks.rotation);

  target = timeline.removeKey(target, 'rotation', firstId);
  assert.equal(target.tracks.rotation.length, 1);
});

test('preset application preserves authored keyframe tracks', () => {
  let state = engine.defaultState();
  state.animators[0] = timeline.upsertKey(state.animators[0], 'y', 0.25, 120, 'easeInOut');
  const next = engine.applyPreset(state, 'kineticWave');
  assert.equal(next.animators[0].tracks.y.length, 1);
  assert.equal(next.animators[0].tracks.y[0].value, 120);
});
