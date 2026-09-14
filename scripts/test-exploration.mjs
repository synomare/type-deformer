import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../exploration.js', import.meta.url), 'utf8'), context);
const api = context.TypeDeformerExplorer;
const plain = value => JSON.parse(JSON.stringify(value));
const spec = [
  { key: 'field', min: -2, max: 2, step: .05, value: .8, label: 'Field', disabled: false },
  { key: 'power', min: 1, max: 10, step: 1, value: 3, label: 'Power', disabled: false },
  { key: 'orbit', min: 0, max: 1, step: .01, value: .4, label: 'Orbit', disabled: true }
];
const base = { version: 65, text: 'B& / 書', params: { seed: 893, fontFamily: 'Georgia', fontWeight: 400, fontAxes: '{}',
  field: .8, frozenMoment: JSON.stringify({ schema: 1, phase: .4, surfacePhase: 12, logicalWidth: 960, logicalHeight: 680 }) },
  composition: { enabled: true, phase: .4, seed: 19, type: 'field' }, batchProfiles: { latin: { field: .9 }, kana: { field: .5 } },
  letters: [{ o: { ct: { current: 1 } } }] };

test('exploration is a bounded, non-playing schema with at most two distinct numeric axes', () => {
  assert.equal(api.normalize('').mode, 'time');
  assert.equal(api.normalize('bad').seconds, 8);
  const c = api.normalize({ seconds: Infinity, axes: [{ key: 'field', start: 0, end: 1 }, { key: 'field', start: 1, end: 2 },
    { key: '__proto__', start: 0, end: 1 }, { key: 'power', start: 1, end: 10 }, { key: 'orbit', start: 0, end: 1 }] });
  assert.deepEqual(plain(c.axes.map(a => a.key)), ['field', 'power']); assert.equal(c.seconds, 8);
  assert.equal('playing' in c, false);
});
test('time candidates preserve seeds, font, letters and source without mutating the artwork', () => {
  const before = JSON.stringify(base);
  const c = api.variant(base, { mode: 'time', from: .2, to: .8 }, spec, .5, ['all']);
  assert.equal(c.phase, .5); assert.equal(c.state.params.seed, 893); assert.equal(c.state.composition.seed, 19);
  assert.deepEqual(plain(c.state.letters), base.letters); assert.equal(c.state.params.fontFamily, 'Georgia');
  assert.equal(api.normalizeMoment(c.state.params.frozenMoment).logicalWidth, 960);
  assert.equal(JSON.stringify(base), before);
});
test('parameter candidates only change applied target profiles, never discrete grammars or seeds', () => {
  const c = api.variant(base, { mode: 'parameters', axes: [{ key: 'field', start: -2, end: 2 }, { key: 'power', start: 1, end: 10 }] }, spec, .5, ['latin']);
  assert.deepEqual(plain(c.values), { field: 0, power: 6 });
  assert.equal(c.state.params.field, .8); assert.equal(c.state.batchProfiles.latin.field, 0);
  assert.equal(c.state.batchProfiles.kana.field, .5); assert.equal(c.phase, .4);
  assert.equal(c.state.params.seed, 893); assert.deepEqual(plain(c.state.letters), base.letters);
});
test('unavailable axes cannot silently produce no-op candidates; extremes respect real bounds and steps', () => {
  assert.throws(() => api.variant(base, { mode: 'parameters', axes: [{ key: 'orbit', start: 0, end: 1 }] }, spec, .5, ['all']), /数値軸/);
  const axes = api.boundedAxes({ axes: [{ key: 'field', start: -999, end: 999 }, { key: 'power', start: 1.1, end: 8.9 }] }, spec);
  assert.equal(axes[0].start, -2); assert.equal(axes[0].end, 2); assert.equal(axes[1].end, 9);
});
test('6/9/12 time sheets avoid duplicate full-loop endpoints and include non-loop extremes', () => {
  for (const count of [6, 9, 12]) {
    const samples = api.positions(count, { mode: 'time', from: 0, to: 1 });
    assert.equal(samples.length, count); assert.equal(samples[0], 0); assert.ok(samples.at(-1) < 1);
    assert.equal(api.positions(count, { mode: 'parameters' }).at(-1), 1);
  }
  assert.equal(api.positions(100, {}).length, 9);
});
test('frozen moments validate clocks, quality, font references and geometry dimensions independently', () => {
  assert.equal(api.normalizeMoment('bad'), null);
  const moment = api.normalizeMoment({ schema: 1, phase: -9, surfacePhase: Infinity, logicalWidth: -1,
    quality: 'auto', fonts: [{ family: 'Local Font', label: 'Local.otf' }, null] });
  assert.equal(moment.phase, 0); assert.equal(moment.surfacePhase, 0); assert.equal(moment.logicalWidth, 1);
  assert.equal(moment.quality, 'normal'); assert.deepEqual(plain(moment.fonts), [{ family: 'Local Font', label: 'Local.otf' }]);
});

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
function scopeRuntime() {
  const input = { id: 'field', min: '0', max: '1', step: '.01', disabled: false,
    closest: () => ({ dataset: { operatorPanel: 'test' } }) };
  const c = vm.createContext({ activeBatchProfile: 'all', sourceTarget: { mode: 'all' },
    metrics: [{ ch: 'A', batchKey: 'latin' }, { ch: 'a', batchKey: 'latin' }],
    batchProfiles: { latin: { field: .2 } }, syncOperatorParameterAvailability() {},
    rangeControls: [{ key: 'field', profiled: true, input }],
    parameterDisabledReasons: () => new Set(['rotate-grammar']),
    document: { querySelector: () => ({ textContent: 'Field' }) },
    batchProfileForKey: () => ({ field: .2 }), batchSourceText: m => m.ch, operatorAffectsMetric: () => true,
    BATCH_TARGETS: { byKey: { latin: {}, 'latin.upper': { test: true }, 'latin.vowel': { test: true } },
      keys: text => ['latin', ...(text === text.toUpperCase() ? ['latin.upper'] : []), ...(/[Aa]/.test(text) ? ['latin.vowel'] : [])],
      matches: (key, text) => key === 'all' || key === 'latin' || key === 'latin.upper' && text === text.toUpperCase() || key === 'latin.vowel' && /[Aa]/.test(text) }
  });
  const functions = ['studioTargetKeys', 'studioAxes'].map(name => {
    const source = html.match(new RegExp('^      function ' + name + '\\([\\s\\S]*?^      \\}', 'm'))?.[0];
    assert.ok(source, name); return source;
  }).join('\n');
  vm.runInContext(functions, c); return c;
}
test('All exploration reaches existing detailed overrides; narrow Targets never write their parent family', () => {
  const c = scopeRuntime(); c.batchProfiles['latin.upper'] = { field: .5 };
  assert.deepEqual(plain(c.studioTargetKeys('test')).sort(), ['all', 'latin', 'latin.upper']);
  c.activeBatchProfile = 'latin.upper'; delete c.batchProfiles['latin.upper'];
  assert.deepEqual(plain(c.studioTargetKeys('test')), ['latin.upper']);
  const result = api.variant({ ...base, batchProfiles: { latin: { field: .2 } } },
    { mode: 'parameters', axes: [{ key: 'field', start: 0, end: 1 }] }, spec, 1, ['latin.upper']);
  assert.equal(result.state.batchProfiles['latin.upper'].field, 1);
  assert.equal(result.state.batchProfiles.latin.field, .2);
});
test('overlapping detailed profiles, local overrides and partial source ranges show explicit unavailable reasons', () => {
  const c = scopeRuntime(); c.activeBatchProfile = 'latin.upper';
  assert.equal(c.studioAxes('test')[0].disabled, false);
  c.batchProfiles['latin.vowel'] = { field: .6 };
  assert.match(c.studioAxes('test')[0].reason, /範囲外/); assert.equal(c.studioAxes('test')[0].disabled, true);
  c.activeBatchProfile = 'all'; assert.equal(c.studioAxes('test')[0].disabled, false);
  c.metrics[0].localParams = { field: .7 };
  assert.match(c.studioAxes('test')[0].reason, /個別値/);
  c.metrics[0].localParams = null; c.sourceTarget.mode = 'range';
  assert.match(c.studioAxes('test')[0].reason, /原文の部分範囲/);
  c.sourceTarget.mode = 'all'; c.rangeControls[0].input.disabled = true;
  assert.match(c.studioAxes('test')[0].reason, /文法/);
});
