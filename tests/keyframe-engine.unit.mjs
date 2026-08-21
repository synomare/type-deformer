import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = { window: Object.create(null), console };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
for (const file of ['text-animator.js', 'keyframe-engine.js']) {
  new vm.Script(fs.readFileSync(path.join(root, file), 'utf8'), { filename: file }).runInContext(sandbox);
}
const engine = sandbox.window.TypeDeformerTextAnimator;
const keyframes = engine.keyframes;

test('default animators expose normalized empty keyframe tracks', () => {
  const animator = engine.defaultAnimator('Timeline', 'timeline');
  assert.ok(animator.tracks);
  assert.deepEqual(Array.from(keyframes.properties), [
    'x', 'y', 'rotation', 'scaleX', 'scaleY',
    'skewX', 'skewY', 'opacity', 'blur', 'hue'
  ]);
  for (const property of keyframes.properties) assert.deepEqual(Array.from(animator.tracks[property]), []);
});

test('track normalization clamps hostile values, sorts time, and keeps ids unique', () => {
  const track = keyframes.normalizeTrack([
    { id: 'same', time: 2, value: 'bad', easing: 'unknown' },
    { id: 'same', time: -2, value: 20, easing: 'hold' },
    { time: 0.5, value: 10, easing: 'easeInOut' }
  ], 4);
  assert.equal(track.length, 3);
  assert.deepEqual(Array.from(track, frame => frame.time), [0, 0.5, 1]);
  assert.equal(new Set(Array.from(track, frame => frame.id)).size, 3);
  assert.equal(track[2].value, 4);
  assert.equal(track[2].easing, 'linear');
});

test('linear and eased tracks evaluate deterministically', () => {
  const linear = [
    { id: 'a', time: 0, value: 0, easing: 'linear' },
    { id: 'b', time: 0.5, value: 100, easing: 'linear' },
    { id: 'c', time: 1, value: 0, easing: 'linear' }
  ];
  assert.equal(keyframes.evaluateTrack(linear, 0.25, 0), 50);
  assert.equal(keyframes.evaluateTrack(linear, 0.75, 0), 50);

  const eased = [
    { id: 'a', time: 0, value: 0, easing: 'easeIn' },
    { id: 'b', time: 0.5, value: 100, easing: 'linear' }
  ];
  assert.equal(keyframes.evaluateTrack(eased, 0.25, 0), 12.5);
});

test('hold interpolation and loop boundaries are exact', () => {
  const track = [
    { id: 'a', time: 0, value: 12, easing: 'hold' },
    { id: 'b', time: 0.6, value: 90, easing: 'linear' }
  ];
  assert.equal(keyframes.evaluateTrack(track, 0.4, 0), 12);
  assert.equal(keyframes.evaluateTrack(track, 0, 0), keyframes.evaluateTrack(track, 1, 0));
  assert.equal(keyframes.evaluateTrack(track, -1, 0), keyframes.evaluateTrack(track, 2, 0));
});

test('upsert replaces the keyframe at the same time and remove is stable', () => {
  let track = keyframes.upsert([], { id: 'a', time: 0.25, value: 10, easing: 'linear' }, 0);
  track = keyframes.upsert(track, { id: 'b', time: 0.25, value: 30, easing: 'easeOut' }, 0);
  assert.equal(track.length, 1);
  assert.equal(track[0].id, 'b');
  assert.equal(track[0].value, 30);
  track = keyframes.remove(track, 'b', 0);
  assert.equal(track.length, 0);
});
