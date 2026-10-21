import {readAuthoredSource, readPageMarkup} from './source-reader.mjs';
const markup = readPageMarkup();
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function harness(canEncode = true, behavior = {}) {
  const calls = [];
  class BufferTarget { constructor() { this.buffer = new Uint8Array(behavior.bufferBytes || 3).buffer; } }
  class Output {
    constructor(options) { this.target = options.target; }
    addVideoTrack(source, metadata) { calls.push(['track', metadata.frameRate]); this.source = source; }
    async start() { calls.push(['start']); if (behavior.start) await behavior.start(); }
    async finalize() { calls.push(['finalize']); if (behavior.finalize) await behavior.finalize(); }
    async cancel() { calls.push(['cancel']); }
  }
  class CanvasSource {
    constructor(canvas, options) { calls.push(['source', options.codec]); this.options = options; }
    async add(timestamp, duration) { calls.push(['add', timestamp, duration]); if (behavior.packetBytes) this.options.onEncodedPacket({ byteLength: behavior.packetBytes }); if (behavior.add) await behavior.add(); }
    close() { calls.push(['close']); }
  }
  const M = { BufferTarget, Output, CanvasSource, Quality: class Quality {}, Mp4OutputFormat: class Mp4OutputFormat {}, WebMOutputFormat: class WebMOutputFormat {}, canEncodeVideo: async () => behavior.canEncode ? behavior.canEncode() : canEncode };
  const context = { VideoEncoder: class {}, VideoFrame: class {}, Blob, __Mediabunny: M };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(new URL('../render-context.js', import.meta.url), 'utf8'), context);
  let source = fs.readFileSync(new URL('../video-encoder.js', import.meta.url), 'utf8');
  source = source.replace("import('./assets/vendor/mediabunny-1.56.1.mjs')", 'Promise.resolve(root.__Mediabunny)');
  vm.runInNewContext(source, context);
  return { api: context.TypeDeformerVideoEncoder, calls, resources: context.TypeDeformerRenderContext.resources };
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
  const { api, resources } = harness(false);
  await assert.rejects(api.create({ width: 1920, height: 1080 }, { format: 'mp4', fps: 30, bitrate: 8000000 }), /MP4/);
  assert.equal(resources.inspect().reservedBytes, 0);
});

const dimensions = { width: 2, height: 2 };
const options = { format: 'webm', fps: 24, bitrate: 3000000 };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('video memory preflight includes frames, container growth and final Blob before starting a codec', async () => {
  const { api, calls, resources } = harness();
  const memory = api.plan(dimensions, options);
  await assert.rejects(api.create(dimensions, { ...options, fps: 1, bitrate: 8, expectedFrames: 11, memoryBudget: memory.fixedBytes + 30 }), { code: 'VIDEO_MEMORY_EXCEEDED' });
  assert.deepEqual(calls, []);assert.equal(resources.inspect().reservedBytes, 0);
  assert.equal(api.plan(dimensions, { ...options, fps: 1, bitrate: 8, expectedFrames: 10, memoryBudget: memory.fixedBytes + 30 }).estimatedPeakBytes, memory.fixedBytes + 30);
});

test('encoded packet budget failure cancels resources and permits a clean retry', async () => {
  const { api, calls, resources } = harness(true, { packetBytes: 11 });
  const budget = api.plan(dimensions, options).fixedBytes + 30;
  const encoder = await api.create(dimensions, { ...options, memoryBudget: budget });
  await assert.rejects(encoder.add(0), { code: 'VIDEO_MEMORY_EXCEEDED' });
  assert.equal(encoder.inspect().state, 'failed');assert.equal(resources.inspect().reservedBytes, 0);
  assert.equal(calls.filter(value => value[0] === 'cancel').length, 1);
  const retry = await api.create(dimensions, options);await retry.add(0);await retry.finish();assert.equal(resources.inspect().reservedBytes, 0);
});

test('start and finalize failures preserve errors while closing the source and reservation', async () => {
  for (const phase of ['start', 'finalize']) {
    const { api, calls, resources } = harness(true, { [phase]: () => { throw Error(phase + ' failure'); } });
    if (phase === 'start') await assert.rejects(api.create(dimensions, options), /start failure/);
    else { const encoder = await api.create(dimensions, options);await encoder.add(0);await assert.rejects(encoder.finish(), /finalize failure/);assert.equal(encoder.inspect().state, 'failed'); }
    assert.equal(calls.filter(value => value[0] === 'close').length, 1);assert.equal(calls.filter(value => value[0] === 'cancel').length, 1);assert.equal(resources.inspect().reservedBytes, 0);
  }
});

test('cancellation during finalize rejects the late result and keeps the reservation until the muxer settles', async () => {
  const pending = deferred(), { api, resources } = harness(true, { finalize: () => pending.promise });
  const encoder = await api.create(dimensions, options);await encoder.add(0);
  const finishing = encoder.finish(), rejection = assert.rejects(finishing, { code: 'RENDER_CANCELLED' });
  assert.equal(encoder.finish(), finishing);
  const cancellation = encoder.cancel();assert.equal(encoder.cancel(), cancellation);assert.ok(resources.inspect().reservedBytes > 0);
  pending.resolve();await cancellation;await rejection;
  assert.equal(encoder.inspect().state, 'cancelled');assert.equal(resources.inspect().reservedBytes, 0);
});

test('frame sequence, concurrent adds and expected frame count cannot silently create an incomplete video', async () => {
  const pending = deferred(), { api } = harness(true, { add: () => pending.promise });
  const encoder = await api.create(dimensions, { ...options, expectedFrames: 2 });
  await assert.rejects(encoder.add(1), { code: 'VIDEO_FRAME_SEQUENCE' });
  const first = encoder.add(0);await assert.rejects(encoder.add(0), { code: 'VIDEO_FRAME_BUSY' });
  await assert.rejects(encoder.finish(), { code: 'VIDEO_FRAME_BUSY' });
  pending.resolve();await first;await assert.rejects(encoder.finish(), { code: 'VIDEO_FRAME_COUNT' });
  await encoder.add(1);const result = await encoder.finish();assert.equal(result.frames, 2);
});

test('cancel closes once, rejects later frame work and frees a lease for another job', async () => {
  const { api, calls, resources } = harness();const encoder = await api.create(dimensions, options);
  await assert.rejects(api.create(dimensions, options), { code: 'RENDER_RESOURCE_BUSY' });
  await encoder.cancel();await encoder.cancel();await assert.rejects(encoder.add(0), { code: 'RENDER_CANCELLED' });
  assert.equal(calls.filter(value => value[0] === 'close').length, 1);assert.equal(calls.filter(value => value[0] === 'cancel').length, 1);assert.equal(resources.inspect().reservedBytes, 0);
});

test('final container growth is checked before constructing the Blob', async () => {
  const { api, resources } = harness(true, { bufferBytes: 11 });const budget = api.plan(dimensions, options).fixedBytes + 30;
  const encoder = await api.create(dimensions, { ...options, memoryBudget: budget });await encoder.add(0);
  await assert.rejects(encoder.finish(), { code: 'VIDEO_MEMORY_EXCEEDED' });assert.equal(resources.inspect().reservedBytes, 0);
});

test('abort during codec preparation immediately releases its lease and prevents late source creation', async () => {
  const probe = deferred(), { api, calls, resources } = harness(true, { canEncode: () => probe.promise });
  const controller = new AbortController(), preparing = api.create(dimensions, { ...options, signal: controller.signal });
  const rejected = assert.rejects(preparing, { code: 'RENDER_CANCELLED' });
  await Promise.resolve();await Promise.resolve();assert.ok(resources.inspect().reservedBytes > 0);
  controller.abort();assert.equal(resources.inspect().reservedBytes, 0);
  probe.resolve(true);await rejected;assert.deepEqual(calls, []);
});

test('a previously aborted request never reserves resources or constructs a codec', async () => {
  const { api, calls, resources } = harness(), controller = new AbortController();controller.abort();
  await assert.rejects(api.create(dimensions, { ...options, signal: controller.signal }), { code: 'RENDER_CANCELLED' });
  assert.equal(resources.inspect().reservedBytes, 0);assert.deepEqual(calls, []);
});

test('encoder options are captured once and a resized frame fails with cleanup', async () => {
  const { api, calls, resources } = harness(), config = { ...options }, canvas = { ...dimensions };
  const encoder = await api.create(canvas, config);config.fps = 60;
  await encoder.add(0);assert.deepEqual(calls.find(value => value[0] === 'add'), ['add', 0, 1 / 24]);
  canvas.width = 4;await assert.rejects(encoder.add(1), { code: 'VIDEO_FRAME_CHANGED' });assert.equal(resources.inspect().reservedBytes, 0);
});

test('late video cleanup only releases resources from its captured generation', async () => {
  const authoredSource = readAuthoredSource();
  const source = authoredSource.match(/^      async function releaseVideoExport\([^]*?^      \}/m)?.[0];assert.ok(source);
  const pending = deferred(), releases = [], statuses = [], controls = [];
  const canvas = () => ({ width: 40, height: 30, parentNode: { removeChild(value) { value.parentNode = null; } } });
  const oldCanvas = canvas(), newCanvas = canvas(), oldClient = { dispose() {} }, newClient = { dispose() { throw Error('must not dispose new renderer'); } };
  const state = { active: true, generation: 1, encoder: { cancel: () => pending.promise }, encoderAbort: { abort() {} }, canvas: oldCanvas, renderClient: oldClient };
  const c = { videoExportState: state, TypeDeformerRenderContext: { release(value) { releases.push(value);value.width = value.height = 1; } }, videoCaptureHost: { hidden: false }, setVideoControlsLocked(value) { controls.push(value); }, restoreAfterVideoExport() {}, updateVideoExportAvailability() {}, setVideoProgress() {}, setVideoStatus(message) { statuses.push(message); } };
  vm.runInNewContext(source, c);
  const first = c.releaseVideoExport('old first', 'cancelled');await c.releaseVideoExport('old second', 'cancelled');
  Object.assign(state, { active: true, generation: 2, canvas: newCanvas, renderClient: newClient });
  pending.resolve();await first;
  assert.equal(state.canvas, newCanvas);assert.equal(state.renderClient, newClient);assert.equal(newCanvas.width, 40);assert.equal(state.active, true);
  assert.deepEqual(statuses, ['old second']);assert.deepEqual(controls, [false]);assert.ok(releases.every(value => value === oldCanvas));
});

test('video cleanup reclaims the canvas and unlocks controls even when renderer disposal fails', async () => {
  const authoredSource = readAuthoredSource();
  const source = authoredSource.match(/^      async function releaseVideoExport\([^]*?^      \}/m)?.[0];assert.ok(source);
  const target = { width: 40, height: 30 }, state = { active: true, generation: 1, canvas: target, renderClient: { dispose() { throw Error('renderer already detached'); } } };
  const c = { videoExportState: state, videoCaptureHost: null, setVideoControlsLocked() {}, restoreAfterVideoExport() {}, updateVideoExportAvailability() {}, setVideoProgress() {}, setVideoStatus() {} };
  vm.runInNewContext(source, c);await c.releaseVideoExport('cancel', 'cancelled');
  assert.equal(target.width, 1);assert.equal(state.canvas, null);assert.equal(state.active, false);
});

test('video capture freezes source, font bytes, camera and clocks while subsequent editor changes remain independent', () => {
  const authoredSource=readAuthoredSource();
  const source={text:'captured',params:{fontFamily:'Test',paper:'#ffffff',transparentBg:true,videoFps:24,videoDuration:1,videoLoops:2,videoStart:'current',videoSize:'canvas',videoFormat:'webm',frozenMoment:JSON.stringify({schema:1,phase:.5,surfacePhase:.2,logicalWidth:100,logicalHeight:80})},composition:{phase:.5,direction:-1}};
  const buffer=new Uint8Array([1,2,3]).buffer,viewport={width:100,height:80,scale:2,x:15,y:25},camera={w:100,h:80,s:2,dx:15,dy:25};
  const c={studioCaptureState:()=>JSON.parse(JSON.stringify(source)),studioBridge:()=>({viewport:()=>viewport}),compositionLogicalDimensions:()=>({width:100,height:80}),canvasCameraLayout:()=>camera,studioFontBuffers:new Map([['Test',{family:'Test',label:'Test',buffer}]]),TypeDeformerFontRegistry:{families:()=>['Test']}};
  vm.runInNewContext(fs.readFileSync(new URL('../exploration.js',import.meta.url),'utf8'),c);
  for(const name of ['captureVideoRequest','videoFrameRequest'])vm.runInNewContext(authoredSource.match(new RegExp('^      function '+name+'\\([^]*?^      \\}','m'))[0],c);
  const capture=c.captureVideoRequest({w:100,h:80});source.text='live edit';source.params.paper='#000000';source.composition.phase=.9;viewport.x=200;camera.dx=300;new Uint8Array(buffer).fill(9);
  const frame=c.videoFrameRequest(capture,1);
  assert.equal(frame.state.text,'captured');assert.equal(frame.state.params.paper,'#ffffff');assert.equal(frame.state.params.transparentBg,true);
  assert.equal(frame.viewport.x,15);assert.equal(frame.output.video.camera.dx,15);assert.ok(Math.abs(frame.state.composition.phase-(.5-2/24))<1e-9);
  assert.equal(JSON.parse(frame.state.params.frozenMoment).surfacePhase,.2);assert.deepEqual(Array.from(new Uint8Array(capture.fonts[0].buffer)),[1,2,3]);
  assert.equal(source.composition.phase,.9);assert.equal(source.text,'live edit');assert.equal(Object.isFrozen(capture.request.state.params),true);
});

test('video preflight uses the encoded duration even when loop count does not divide the frame count', () => {
  const authoredSource=readAuthoredSource();
  let planned;
  const c={btnVideoRecord:{},videoExportState:{active:false},videoDimensions:()=>({w:100,h:80}),params:{videoDuration:1,videoFps:24,videoLoops:5,videoFormat:'webm'},compositionState:{enabled:true},TypeDeformerVideoEncoder:{available:()=>true},TypeDeformerExportPreflight:{evaluate(value){planned=value;return {status:'ready'};}},renderExportPreflight(){},videoStatus:{dataset:{state:'done'}}};
  vm.runInNewContext(authoredSource.match(/^      function updateVideoExportAvailability\([^]*?^      \}/m)[0],c);
  c.updateVideoExportAvailability(false);
  assert.equal(planned.fps,24);assert.equal(planned.duration,1);
});
