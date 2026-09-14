import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function harness(canEncode = true) {
  const calls = [];
  class BufferTarget { constructor() { this.buffer = new Uint8Array([1, 2, 3]).buffer; } }
  class Output {
    constructor(options) { this.target = options.target; }
    addVideoTrack(source, metadata) { calls.push(['track', metadata.frameRate]); this.source = source; }
    async start() { calls.push(['start']); }
    async finalize() { calls.push(['finalize']); }
    async cancel() { calls.push(['cancel']); }
  }
  class CanvasSource {
    constructor(canvas, options) { calls.push(['source', options.codec]); this.options = options; }
    async add(timestamp, duration) { calls.push(['add', timestamp, duration]); }
    close() { calls.push(['close']); }
  }
  const M = { BufferTarget, Output, CanvasSource, Quality: class Quality {}, Mp4OutputFormat: class Mp4OutputFormat {}, WebMOutputFormat: class WebMOutputFormat {}, canEncodeVideo: async () => canEncode };
  const context = { VideoEncoder: class {}, VideoFrame: class {}, Blob, __Mediabunny: M };
  context.globalThis = context;
  let source = fs.readFileSync(new URL('../video-encoder.js', import.meta.url), 'utf8');
  source = source.replace("import('./assets/vendor/mediabunny-1.56.1.mjs')", 'Promise.resolve(root.__Mediabunny)');
  vm.runInNewContext(source, context);
  return { api: context.TypeDeformerVideoEncoder, calls };
}

test('Video encoder adds each frame with an explicit timestamp', async () => {
  const { api, calls } = harness();
  const encoder = await api.create({ width: 640, height: 360 }, { format: 'webm', fps: 24, bitrate: 3000000 });
  await encoder.add(0); await encoder.add(1); await encoder.add(2);
  const result = await encoder.finish();
  assert.equal(result.frames, 3);
  assert.deepEqual(calls.filter(call => call[0] === 'add'), [['add', 0, 1 / 24], ['add', 1 / 24, 1 / 24], ['add', 2 / 24, 1 / 24]]);
  assert.equal(result.blob.type, 'video/webm');
});

test('Video encoder checks the requested codec without format fallback', async () => {
  const { api } = harness(false);
  await assert.rejects(api.create({ width: 1920, height: 1080 }, { format: 'mp4', fps: 30, bitrate: 8000000 }), /MP4/);
});
