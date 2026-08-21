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
for (const file of ['text-animator.js', 'keyframe-engine.js', 'deformer-engine.js']) {
  new vm.Script(fs.readFileSync(path.join(root, file), 'utf8'), { filename: file }).runInContext(sandbox);
}
const engine = sandbox.window.TypeDeformerTextAnimator;
const deformers = engine.deformers;
const items = Array.from({ length: 24 }, (_, index) => ({ index, lineIndex: 0 }));

test('stack normalization clamps hostile values and keeps node ids unique', () => {
  const stack = deformers.normalizeStack({
    enabled: true,
    activeNodeId: 'same',
    nodes: [
      { id: 'same', type: 'wave', amount: 9999, frequency: -4, mix: 4 },
      { id: 'same', type: 'unknown', origin: 8, falloff: -2 }
    ]
  });
  assert.equal(stack.nodes.length, 2);
  assert.equal(new Set(Array.from(stack.nodes, node => node.id)).size, 2);
  assert.equal(stack.nodes[0].amount, 720);
  assert.equal(stack.nodes[0].frequency, 0.05);
  assert.equal(stack.nodes[0].mix, 1);
  assert.equal(stack.nodes[1].type, 'bend');
  assert.equal(stack.nodes[1].origin, 1);
  assert.equal(stack.nodes[1].falloff, 0);
});

test('disabled stacks are a strict identity transform', () => {
  const output = deformers.evaluate({
    enabled: false,
    nodes: [{ id: 'wave', type: 'wave', amount: 120 }]
  }, items, 0.25);
  for (const value of output) {
    assert.equal(value.x, 0);
    assert.equal(value.y, 0);
    assert.equal(value.rotation, 0);
  }
});

test('wave deformation loops exactly at phase zero and one', () => {
  const stack = {
    enabled: true,
    nodes: [{ id: 'wave', type: 'wave', amount: 80, frequency: 2.5, speed: 1.5 }]
  };
  const start = deformers.evaluate(stack, items, 0);
  const end = deformers.evaluate(stack, items, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(start)), JSON.parse(JSON.stringify(end)));
});

test('node order materially changes the evaluated deformation', () => {
  const bend = { id: 'bend', type: 'bend', amount: 140, origin: 0.45, falloff: 0.15 };
  const wave = { id: 'wave', type: 'wave', amount: 75, frequency: 3, phase: 0.2, falloff: 0.4 };
  const first = deformers.evaluate({ enabled: true, nodes: [bend, wave] }, items, 0.3);
  const second = deformers.evaluate({ enabled: true, nodes: [wave, bend] }, items, 0.3);
  const difference = first.reduce((sum, value, index) => (
    sum + Math.abs(value.x - second[index].x) + Math.abs(value.y - second[index].y)
  ), 0);
  assert.ok(difference > 0.1);
});

test('Text Animator state normalization preserves the ordered deformer stack', () => {
  const animator = engine.defaultAnimator('Base', 'base');
  const raw = {
    enabled: true,
    phase: 0,
    activeAnimatorId: animator.id,
    animators: [animator],
    deformers: {
      enabled: true,
      activeNodeId: 'arc',
      nodes: [{ id: 'arc', type: 'arc', amount: 110 }]
    }
  };
  const normalized = engine.normalizeState(raw);
  assert.equal(normalized.deformers.nodes.length, 1);
  assert.equal(normalized.deformers.nodes[0].type, 'arc');
  assert.equal(normalized.deformers.nodes[0].amount, 110);
});
