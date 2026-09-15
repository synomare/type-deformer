import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../render-envelope.js', import.meta.url), 'utf8');
const context = { globalThis: {} };
vm.runInNewContext(source, context, { filename: 'render-envelope.js' });
const envelope = context.globalThis.TypeDeformerRenderEnvelope;

function pixels(width, height, points) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y, alpha = 255] of points) data[(y * width + x) * 4 + 3] = alpha;
  return data;
}

test('detects artwork touching every hidden raster boundary', () => {
  const contact = envelope.scanPixels(pixels(10, 8, [[0, 4], [9, 3], [5, 0], [4, 7]]), 10, 8, { gutter: 1 });
  assert.deepEqual({ ...contact }, { left: true, top: true, right: true, bottom: true });
  assert.equal(envelope.touches(contact), true);
});

test('ignores artwork that has a transparent safety gutter', () => {
  const contact = envelope.scanPixels(pixels(12, 12, [[5, 5], [8, 8]]), 12, 12, { gutter: 3 });
  assert.equal(envelope.touches(contact), false);
  assert.equal(envelope.nextScale(4, contact), 4);
});

test('expands world bounds around the same center until edge contact clears', () => {
  assert.equal(envelope.nextScale(1, { bottom: true }), 2);
  assert.equal(envelope.nextScale(2, { right: true }), 3.5);
  assert.deepEqual({ ...envelope.expandBounds({ x: 10, y: 20, w: 100, h: 50 }, 2) }, { x: -40, y: -5, w: 200, h: 100 });
});
