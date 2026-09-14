import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const context = {};
context.globalThis = context;
vm.runInNewContext(fs.readFileSync(new URL('../export-preflight.js', import.meta.url), 'utf8'), context);
const evaluate = context.TypeDeformerExportPreflight.evaluate;

test('image preflight reports dimensions, background and embedded raster warning', () => {
  const result = evaluate({ mode: 'image', format: 'svg', width: 2160, height: 2160, region: '作品全体', transparent: true, hasRasterSurface: true });
  assert.equal(result.status, 'warning');
  assert.equal(result.items.find(item => item.label === '実寸').value, '2160 × 2160 px');
  assert.match(result.warnings[0], /Raster/);
});

test('video preflight fixes frame count and blocks unsupported or over-budget work', () => {
  const unsupported = evaluate({ mode: 'video', format: 'webm', width: 1920, height: 1080, fps: 30, duration: 4, compositionEnabled: true, videoAvailable: false });
  assert.equal(unsupported.items.find(item => item.label === 'Frame').value, '120 frames · 30 fps');
  assert.equal(unsupported.status, 'blocked');
  const memory = evaluate({ mode: 'video', format: 'mp4', width: 3840, height: 3840, fps: 60, duration: 30, bitrate: 40000000, compositionEnabled: true, videoAvailable: true, memoryBudget: 64 * 1024 * 1024 });
  assert.equal(memory.status, 'blocked');
  assert.match(memory.blockers.join(' '), /メモリ/);
});
