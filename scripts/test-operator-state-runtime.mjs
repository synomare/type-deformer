import {createAuthoredTestContext} from './authored-test-context.mjs';
import {readAuthoredSource, readPageMarkup} from './source-reader.mjs';
const markup = readPageMarkup();
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const authoredSource = readAuthoredSource();

function functionSource(name) {
  const match = authoredSource.match(new RegExp('^      function ' + name + '\\([^]*?^      }', 'm'));
  if (!match) throw new Error('Missing actual function: ' + name);
  return match[0];
}

function runtime(operatorIds) {
  const empty = authoredSource.match(/^      var EMPTY_OPERATOR_STATE = .*;$/m);
  assert.ok(empty, 'missing EMPTY_OPERATOR_STATE');
  const context = createAuthoredTestContext({
    Object,
    OPERATOR_IDS: operatorIds,
    OPERATOR_DEFS: Object.fromEntries(operatorIds.map(id => [id, { id }])),
    isSurfaceOperator: id => id === 'boneScaffold' || id === 'dataMosh',
    metrics: []
  });
  vm.runInContext([
    empty[0],
    functionSource('createOperatorState'),
    functionSource('createOperatorStates'),
    functionSource('readOperatorState'),
    functionSource('operatorState'),
    functionSource('numericManual'),
    functionSource('surfaceOperatorStrength'),
    functionSource('hasVisibleSurfaceOperator'),
    functionSource('operatorAffectedCounts')
  ].join('\n'), context);
  return context;
}

test('clean glyph state is sparse and read-only lookups do not allocate Operators', () => {
  const ids = ['stretch', ...Array.from({ length: 53 }, (_, index) => 'operator' + index)];
  const context = runtime(ids);
  const metric = { operatorStates: context.createOperatorStates(), manualX: null, manualY: null };
  assert.deepEqual(Object.keys(metric.operatorStates), ['stretch']);

  for (const id of ids) context.readOperatorState(metric, id);
  assert.deepEqual(Object.keys(metric.operatorStates), ['stretch']);

  const used = context.operatorState(metric, 'operator17');
  used.toggled = true;
  used.current = 0.4;
  assert.deepEqual(Object.keys(metric.operatorStates), ['stretch', 'operator17']);
  assert.equal(context.readOperatorState(metric, 'operator17'), used);
});

test('active-effect inventory visits instantiated states without allocating the registry', () => {
  const ids = ['stretch', 'boneScaffold', 'dataMosh', 'caesuraField'];
  const context = runtime(ids);
  const clean = { operatorStates: context.createOperatorStates(), manualX: null, manualY: null };
  const stretched = { operatorStates: context.createOperatorStates(), manualX: 1.4, manualY: null };
  const bone = { operatorStates: context.createOperatorStates(), manualX: null, manualY: null };
  context.operatorState(bone, 'boneScaffold').current = 0.75;
  context.metrics.push(clean, stretched, bone);

  assert.deepEqual({ ...context.operatorAffectedCounts() }, { stretch: 1, boneScaffold: 1 });
  assert.deepEqual(Object.keys(clean.operatorStates), ['stretch']);
  assert.deepEqual(Object.keys(stretched.operatorStates), ['stretch']);
  assert.deepEqual(Object.keys(bone.operatorStates), ['stretch', 'boneScaffold']);
  assert.equal(context.hasVisibleSurfaceOperator(clean), false);
  assert.equal(context.hasVisibleSurfaceOperator(stretched), false);
  assert.equal(context.hasVisibleSurfaceOperator(bone), true);
});

test('hot paths iterate instantiated glyph states instead of every Operator', () => {
  const update = functionSource('update');
  const sourceAlpha = functionSource('metricSurfaceSourceAlpha');
  const visible = functionSource('hasVisibleOperatorDeform');
  const create = functionSource('createOperatorStates');
  const snapshot = functionSource('snapshotGlyphs');

  assert.match(update, /for \(var operatorId in info\.operatorStates\)/);
  assert.doesNotMatch(update, /for \(var oi = 0; oi < OPERATOR_IDS\.length/);
  assert.match(sourceAlpha, /for \(var id in states\)/);
  assert.match(visible, /for \(var id in states\)/);
  assert.doesNotMatch(create, /OPERATOR_IDS/);
  assert.match(snapshot, /var surface = snapshotSurfaceState\(m, deform, misreg, surfaceSnapshots/);
  assert.match(functionSource('snapshotSurfaceState'), /if \(!hasVisibleSurfaceOperator\(metric\)\) return null/);
});

test('restoring Surface manual offsets preserves pairs before the scalar strength fallback', () => {
  const ids = ['stretch', 'dataMosh', 'blobTrack', 'misregistration', 'boneScaffold'];
  const context = runtime(ids);
  context.isSurfaceOperator = id => id !== 'stretch';
  vm.runInContext(['clampFinite', 'normalizeOperatorManual', 'restoreOperatorStates'].map(functionSource).join('\n'), context);
  const metric = { operatorStates: context.createOperatorStates() };
  const saved = { dataMosh: { t: 1, i: .7, m: { x: 112, y: -94 } }, blobTrack: { t: 1, i: 1, m: { x: -740, y: 1500 } },
    misregistration: { t: 1, i: 1, m: { x: 15, y: -11 } }, boneScaffold: { t: 1, i: .4, m: .35 } };
  const original = JSON.stringify(saved);
  context.restoreOperatorStates(metric, saved);
  for (const id of ['dataMosh', 'blobTrack', 'misregistration']) assert.deepEqual({ ...metric.operatorStates[id].manual }, saved[id].m);
  assert.equal(metric.operatorStates.boneScaffold.manual, .35);
  assert.equal(JSON.stringify(saved), original, 'restoring never rewrites the saved original');
  for (const [id, bound] of [['dataMosh', 640], ['blobTrack', 2000], ['misregistration', 120]]) {
    assert.deepEqual({ ...context.normalizeOperatorManual(id, { x: bound + 1, y: -bound - 1 }) }, { x: bound, y: -bound });
    assert.equal(context.normalizeOperatorManual(id, .6), .6, id + ' scalar compatibility');
  }
  assert.equal(context.normalizeOperatorManual('boneScaffold', 2), 1);
  assert.equal(context.normalizeOperatorManual('boneScaffold', -1), 0);
});
