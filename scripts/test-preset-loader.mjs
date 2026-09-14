import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function load() {
  const context = {};
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(new URL('../preset-loader.js', import.meta.url), 'utf8'), context);
  return context;
}

test('Preset loader shares one promise and loads all sources sequentially', async () => {
  const context = load();
  const calls = [];
  const options = { loadScript: async source => { calls.push(source); if (source === 'preset-library.js') context.TypeDeformerPresets = { recipes: Array(436) }; } };
  const first = context.TypeDeformerPresetLoader.load(options);
  const second = context.TypeDeformerPresetLoader.load(options);
  assert.equal(first, second);
  const result = await first;
  assert.equal(result.recipes.length, 436);
  assert.deepEqual(calls, Array.from(context.TypeDeformerPresetLoader.sources));
  assert.equal(calls.length, 14);
});

test('Preset loader clears a failed promise so the same settings can retry', async () => {
  const context = load();
  let attempts = 0;
  await assert.rejects(context.TypeDeformerPresetLoader.load({ loadScript: async source => { attempts++; if (attempts === 2) throw new Error('offline'); } }), /offline/);
  const calls = [];
  await context.TypeDeformerPresetLoader.load({ loadScript: async source => { calls.push(source); if (source === 'preset-library.js') context.TypeDeformerPresets = { ready: true }; } });
  assert.equal(context.TypeDeformerPresets.ready, true);
  assert.equal(calls.length, 14);
});
