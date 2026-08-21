import assert from 'node:assert/strict';
import test from 'node:test';

await import('../text-animator.js');
const engine = globalThis.TypeDeformerTextAnimator;

function items() {
  return [
    { characterIndex: 0, wordIndex: 0, lineIndex: 0 },
    { characterIndex: 1, wordIndex: 0, lineIndex: 0 },
    { characterIndex: 2, wordIndex: 1, lineIndex: 0 },
    { characterIndex: 3, wordIndex: 2, lineIndex: 1 }
  ];
}

test('normalizes hostile state and keeps animator ids unique', () => {
  const state = engine.normalizeState({
    enabled: 1,
    phase: 3.25,
    activeAnimatorId: 'same',
    animators: [
      {
        id: 'same',
        selector: { basis: 'unknown', start: -40, end: 180 },
        transform: { x: Infinity, scaleX: -3, opacity: 500 },
        motion: { speed: 99 }
      },
      { id: 'same', name: 'Second' }
    ]
  });

  assert.equal(state.enabled, true);
  assert.equal(state.phase, 0.25);
  assert.equal(state.animators.length, 2);
  assert.notEqual(state.animators[0].id, state.animators[1].id);
  assert.equal(state.animators[0].selector.basis, 'character');
  assert.equal(state.animators[0].selector.start, 0);
  assert.equal(state.animators[0].selector.end, 100);
  assert.equal(state.animators[0].transform.x, 0);
  assert.equal(state.animators[0].transform.scaleX, 1);
  assert.equal(state.animators[0].transform.opacity, 100);
  assert.equal(state.animators[0].motion.speed, 8);
});

test('word selector gives every glyph in the same word an identical channel', () => {
  const animator = engine.defaultAnimator('Word wave', 'word-wave');
  animator.selector.basis = 'word';
  animator.motion.enabled = true;
  animator.motion.waveform = 'sine';
  animator.motion.stagger = 0.25;
  animator.transform.y = 100;

  const result = engine.evaluateAnimator(animator, items(), 0.125);
  assert.equal(result[0].y, result[1].y);
  assert.notEqual(result[1].y, result[2].y);
});

test('range selector supports wrapped ranges and inversion', () => {
  const selector = {
    basis: 'character', shape: 'square', start: 75, end: 25,
    offset: 0, ease: 0, randomize: false, seed: 1, invert: false
  };
  assert.equal(engine.selectorWeight(selector, 0, 5), 1);
  assert.equal(engine.selectorWeight(selector, 2, 5), 0);
  selector.invert = true;
  assert.equal(engine.selectorWeight(selector, 2, 5), 1);
});

test('motion is exactly loopable at phase zero and one', () => {
  const state = engine.defaultState();
  state.enabled = true;
  const animator = state.animators[0];
  animator.motion.enabled = true;
  animator.motion.waveform = 'triangle';
  animator.motion.cycles = 3;
  animator.motion.stagger = 0.17;
  animator.wiggle.enabled = true;
  animator.wiggle.position = 20;
  animator.wiggle.rotation = 12;
  animator.transform.x = 90;

  assert.deepEqual(
    engine.evaluateStack(state, items(), 0),
    engine.evaluateStack(state, items(), 1)
  );
});

test('animator stack composes translation additively and scale multiplicatively', () => {
  const state = engine.defaultState();
  state.enabled = true;
  state.animators[0].transform.x = 20;
  state.animators[0].transform.scaleX = 200;
  const second = engine.defaultAnimator('Second', 'second');
  second.transform.x = 30;
  second.transform.scaleX = 150;
  state.animators.push(second);

  const result = engine.evaluateStack(state, [{ characterIndex: 0, wordIndex: 0, lineIndex: 0 }], 0)[0];
  assert.equal(result.x, 50);
  assert.equal(result.scaleX, 3);
});

test('preset activates the engine without destroying animator identity', () => {
  const state = engine.defaultState();
  const originalId = state.animators[0].id;
  const next = engine.applyPreset(state, 'signalRupture');

  assert.equal(next.enabled, true);
  assert.equal(next.animators[0].id, originalId);
  assert.equal(next.animators[0].motion.waveform, 'randomHold');
  assert.equal(next.animators[0].wiggle.enabled, true);
});
