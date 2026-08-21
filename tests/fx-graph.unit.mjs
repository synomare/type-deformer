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
for (const file of ['text-animator.js', 'keyframe-engine.js', 'deformer-engine.js', 'fx-graph.js']) {
  new vm.Script(fs.readFileSync(path.join(root, file), 'utf8'), { filename: file }).runInContext(sandbox);
}
const engine = sandbox.window.TypeDeformerTextAnimator;
const graph = engine.fxGraph;

test('FX graph normalization clamps values and keeps ids unique', () => {
  const normalized = graph.normalizeGraph({
    enabled: true,
    activeNodeId: 'same',
    nodes: [
      { id: 'same', type: 'blur', radius: 999, mix: 8 },
      { id: 'same', type: 'threshold', level: -2, softness: 4 }
    ]
  });
  assert.equal(normalized.nodes.length, 2);
  assert.equal(new Set(Array.from(normalized.nodes, node => node.id)).size, 2);
  assert.equal(normalized.nodes[0].radius, 100);
  assert.equal(normalized.nodes[0].mix, 1);
  assert.equal(normalized.nodes[1].level, 0);
  assert.equal(normalized.nodes[1].softness, 0.5);
});

test('unknown future nodes survive normalization and bypass rendering', () => {
  const normalized = graph.normalizeGraph({
    enabled: true,
    nodes: [{
      id: 'future', type: 'spectralFold', name: 'Spectral Fold', enabled: true,
      mix: 0.8, customParameter: { bands: 17 }
    }]
  });
  assert.equal(normalized.nodes[0].type, 'spectralFold');
  assert.equal(normalized.nodes[0].unsupported, true);
  assert.equal(normalized.nodes[0].enabled, false);
  assert.equal(normalized.nodes[0].passthrough.customParameter.bands, 17);
  assert.equal(graph.buildPlan(normalized).operations.length, 0);
});

test('buildPlan preserves explicit node order and chains results', () => {
  const first = graph.buildPlan({
    enabled: true,
    nodes: [
      { id: 'blur', type: 'blur', radius: 4 },
      { id: 'split', type: 'chromaticSplit', amount: 12 }
    ]
  });
  assert.deepEqual(Array.from(first.operations, operation => operation.type), ['blur', 'chromaticSplit']);
  assert.equal(first.operations[0].input, 'SourceGraphic');
  assert.equal(first.operations[1].input, first.operations[0].output);
  assert.equal(first.output, first.operations[1].output);

  const second = graph.buildPlan({
    enabled: true,
    nodes: [
      { id: 'split', type: 'chromaticSplit', amount: 12 },
      { id: 'blur', type: 'blur', radius: 4 }
    ]
  });
  assert.deepEqual(Array.from(second.operations, operation => operation.type), ['chromaticSplit', 'blur']);
});

test('disabled and zero-mix nodes are strict graph bypasses', () => {
  const plan = graph.buildPlan({
    enabled: true,
    nodes: [
      { id: 'a', type: 'blur', enabled: false, radius: 8 },
      { id: 'b', type: 'glow', mix: 0, radius: 20 }
    ]
  });
  assert.equal(plan.operations.length, 0);
  assert.equal(plan.output, 'SourceGraphic');
});

test('Text Animator normalization and presets preserve the FX graph', () => {
  const animator = engine.defaultAnimator('Base', 'base');
  const state = {
    enabled: true,
    phase: 0,
    activeAnimatorId: animator.id,
    animators: [animator],
    deformers: { enabled: false, nodes: [] },
    fxGraph: {
      enabled: true,
      activeNodeId: 'glow',
      nodes: [{ id: 'glow', type: 'glow', radius: 22, color: '#ff0033' }]
    }
  };
  const normalized = engine.normalizeState(state);
  assert.equal(normalized.fxGraph.nodes.length, 1);
  assert.equal(normalized.fxGraph.nodes[0].radius, 22);
  const applied = engine.applyPreset(normalized, 'kineticWave', animator.id);
  assert.equal(applied.fxGraph.nodes[0].type, 'glow');
  assert.equal(applied.fxGraph.nodes[0].color, '#ff0033');
});
