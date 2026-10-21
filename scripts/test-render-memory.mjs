import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const native = require(process.env.TYPE_DEFORMER_CANVAS_MODULE || '@napi-rs/canvas');
const root = new URL('../', import.meta.url);
function fixture() {
  const canvases = [];
  const c = vm.createContext({ document: { createElement() { const canvas = native.createCanvas(1, 1); canvases.push(canvas); return canvas; } }, DOMMatrix: native.DOMMatrix, ArrayBuffer, Uint8Array, Uint8ClampedArray, Float32Array, Float64Array });
  for (const name of ['render-context.js', 'numerical-kernels.js', 'field-material-operators.js']) {
    const path = process.env.TD_MEMORY_BASELINE ? new URL(name, 'file:///' + process.env.TD_MEMORY_BASELINE.replaceAll('\\', '/') + '/') : new URL(name, root);
    vm.runInContext(fs.readFileSync(path, 'utf8'), c);
  }
  return { c, R: c.TypeDeformerRenderContext, canvases };
}

function draw(count, memoryBudget) {
  const { c, R, canvases } = fixture(), api = c.TypeDeformerFieldMaterials;
  const context = R.make({ purpose: 'export', factor: 2, memoryBudget });
  const output = native.createCanvas(count * 48 * 2, 256 * 2);
  const glyphs = Array.from({ length: count }, (_, i) => ({ x: 16 + i * 48, y: 104, w: 24, h: 36, ox: 0, oy: 0, tx: 0, ty: 0, rot: 0, scaleX: 1, scaleY: 1, surface: { tensorSpacing: 3 + i % 7 } }));
  const env = {
    params: { accent: '#b52254', seed: 17 }, strength: () => 1, color: () => '#176273',
    scratch(_name, w, h) { const canvas = R.createCanvas(w, h); return { canvas, ctx: canvas.getContext('2d') }; },
    drawGlyph(ctx, g, scale) { ctx.fillStyle = '#fff'; ctx.fillRect(g.x * scale, g.y * scale, g.w * scale, g.h * scale); }
  };
  R.withContext(context, () => {
    const paint = () => {
      const target = R.createCanvas(count * 48, 256);
      api.render('tensorFiligree', target.getContext('2d'), glyphs, count * 48, 256, 1, { dx: 0, dy: 0, s: 1 }, {}, env);
      output.getContext('2d').drawImage(R.physical(target), 0, 0);
    };
    if (R.withScope) R.withScope(paint); else paint();
  });
  const cached = api.cacheStats().bytes;
  const result = { peakBytes: context.peakBytes, liveBytes: context.bytes, cacheBytes: cached, hash: createHash('sha256').update(output.getContext('2d').getImageData(0, 0, output.width, output.height).data).digest('hex') };
  api.clearCache();
  result.retainedCanvasBytes = canvases.reduce((sum, canvas) => sum + (canvas.width * canvas.height > 1 ? canvas.width * canvas.height * 4 : 0), 0);
  return result;
}

test('tight export allocates glyph rasters at local destination density without changing analysis pixels', () => {
  const { c, R } = fixture(), api = c.TypeDeformerFieldMaterials;
  const g = { x: 0, y: 0, w: 18, h: 26, scaleX: 1.5, scaleY: .75, surface: { tensorSpacing: 3 } };
  const env = {
    params: { accent: '#b52254', seed: 17 }, color: () => '#176273',
    scratch(_name, w, h) { const canvas = R.createCanvas(w, h); return { canvas, ctx: canvas.getContext('2d') }; },
    drawGlyph(ctx, glyph, scale) { ctx.fillStyle = '#fff'; ctx.fillRect(glyph.x * scale, glyph.y * scale, glyph.w * scale, glyph.h * scale); }
  };
  function render(nativeLocalDensity) {
    return R.withContext(R.make({ purpose: 'export', factor: 8, viewScale: 4, nativeLocalDensity }), () => R.withScope(() => {
      const pair = api.internals.entryFor('tensorFiligree', g, { s: 1, dx: 0, dy: 0 }, {}, env);
      const logical = R.analysis(pair.entry.canvas), visual = R.physical(pair.entry.canvas);
      return { width: logical.width, physicalWidth: visual.width, scale: pair.source.scale,
        pixels: Buffer.from(logical.getContext('2d').getImageData(0, 0, logical.width, logical.height).data) };
    }));
  }
  const old = render(false), fitted = render(true);
  assert.deepEqual(fitted.pixels, old.pixels, 'the geometry/analysis grid is unchanged');
  assert.equal(fitted.physicalWidth, Math.ceil(fitted.width * 4 * 1.5 / fitted.scale));
  assert.ok(fitted.physicalWidth < old.physicalWidth);
  assert.ok(fitted.physicalWidth > fitted.width, 'still draws new high-resolution detail');
  api.clearCache();
});

test('many glyphs fit a bounded working set and keep the same output pixels', t => {
  const generous = draw(64, 768 * 1024 * 1024);
  t.diagnostic(JSON.stringify(generous));
  if (process.env.TD_MEMORY_BASELINE) return;
  const bounded = draw(64, 24 * 1024 * 1024);
  assert.equal(bounded.hash, generous.hash);
  assert.equal(bounded.liveBytes, 0);
  assert.equal(bounded.retainedCanvasBytes, 0);
  assert.ok(bounded.peakBytes < 24 * 1024 * 1024);
  assert.ok(bounded.cacheBytes <= 32 * 1024 * 1024);
});

test('nested allocation scopes clean up exceptions, preserve caches and recover', () => {
  if (process.env.TD_MEMORY_BASELINE) return;
  const { R } = fixture(), context = R.make({ factor: 2, memoryBudget: 100000 });
  let retained, temporary;
  R.withContext(context, () => {
    R.withScope(() => {
      retained = R.createCanvas(10, 10); R.retain(retained);
      assert.throws(() => R.withScope(() => { temporary = R.createCanvas(10, 10); R.alphaSampler(temporary); throw Error('interrupted'); }), /interrupted/);
      assert.equal(R.physical(temporary).width, 1);
      assert.equal(R.physical(retained).width, 20);
    });
    assert.equal(context.bytes, 0);
    R.release(retained); R.release(retained);
    assert.equal(context.bytes, 0);
  });
});

test('pixel uploads cross transfer-tile seams without losing translucent pixels', () => {
  if (process.env.TD_MEMORY_BASELINE) return;
  const { R } = fixture(), context = R.make({ factor: 2, memoryBudget: 24 * 1024 * 1024 });
  R.withContext(context, () => R.withScope(() => {
    const c = R.createCanvas(600, 300), ctx = c.getContext('2d'), im = ctx.createImageData(600, 300);
    for (let i = 0; i < im.data.length; i += 4) { im.data[i] = 80; im.data[i + 1] = 120; im.data[i + 2] = 160; im.data[i + 3] = 128; }
    ctx.putImageData(im, 0, 0);
    const pixels = R.physical(c).getContext('2d').getImageData(0, 0, 1200, 600).data;
    for (const x of [1, 510, 511, 512, 513, 1023, 1024, 1198]) for (const y of [1, 510, 511, 512, 513, 598]) assert.equal(pixels[(y * 1200 + x) * 4 + 3], 128, x + ',' + y);
  }));
  assert.equal(context.bytes, 0);
});


test('larger work budgets admit a 320 MiB raster and reject oversized allocations before creating the display backing', () => {
  const allocated = [];
  const c = vm.createContext({ document: { createElement() { const canvas = { width: 1, height: 1, getContext: () => ({ setTransform() {} }) }; allocated.push(canvas); return canvas; } } });
  vm.runInContext(fs.readFileSync(new URL('render-context.js', root), 'utf8'), c);
  const R = c.TypeDeformerRenderContext, context = R.make({ purpose: 'export', factor: 2 });
  assert.equal(context.memoryBudget, 2048 * 1024 * 1024);
  assert.equal(R.budgets.layerBytes, 512 * 1024 * 1024);
  assert.equal(R.budgets.composeBytes, 512 * 1024 * 1024);
  R.withContext(context, () => R.withScope(() => {
    const raster = R.createCanvas(4096, 4096);
    assert.equal(R.physical(raster).width, 8192);
    assert.equal(context.bytes, 320 * 1024 * 1024);
  }));
  assert.equal(context.bytes, 0);
  const constrained = R.make({ purpose: 'export', factor: 2, memoryBudget: 192 * 1024 * 1024 });
  assert.throws(() => R.withContext(constrained, () => R.createCanvas(4096, 4096)), /192 MB/);
  assert.equal(constrained.bytes, 0);
  assert.ok(allocated.every(canvas => canvas.width === 1 && canvas.height === 1));
});

test('video preflight uses the raised budget and names an explicit lower override accurately', () => {
  const { c } = fixture();
  vm.runInContext(fs.readFileSync(new URL('export-preflight.js', root), 'utf8'), c);
  const input = { mode: 'video', format: 'mp4', width: 3840, height: 3840, fps: 24, duration: 10, bitrate: 64000000, compositionEnabled: true, videoAvailable: true };
  assert.equal(c.TypeDeformerExportPreflight.evaluate(input).status, 'ready');
  const limited = c.TypeDeformerExportPreflight.evaluate({ ...input, memoryBudget: 192 * 1024 * 1024 });
  assert.equal(limited.status, 'blocked');
  assert.match(limited.blockers.join(' '), /192 MB/);
});

test('editing uses bounded desktop/mobile budgets while proof/export keep larger explicit capacity',()=>{
 const {R}=fixture();assert.equal(R.make({purpose:'edit',mobile:false}).memoryBudget,256*1024*1024);assert.equal(R.make({purpose:'edit',mobile:true}).memoryBudget,128*1024*1024);assert.equal(R.make({purpose:'proof',mobile:true}).memoryBudget,768*1024*1024);assert.equal(R.limits('edit',true).layerBytes,64*1024*1024);
 const context=R.make({purpose:'edit',mobile:true});assert.throws(()=>R.withContext(context,()=>R.createCanvas(4000,4000)),/予算/);assert.equal(context.bytes,0);
 assert.equal(R.make({purpose:'export',mobile:false}).memoryBudget,2048*1024*1024);assert.equal(R.make({purpose:'export',mobile:true}).memoryBudget,1024*1024*1024);
 assert.equal(R.limits('export',false).timeoutMs,1800000);assert.equal(R.limits('export',true).timeoutMs,1800000);
});

test('iPhone and touch Mac platform reporting both select the mobile edit budget',()=>{
 const source=fs.readFileSync(new URL('render-context.js',root),'utf8');
 for(const navigator of [{platform:'iPhone',userAgent:'WebKit'},{platform:'MacIntel',userAgent:'Macintosh',maxTouchPoints:5}]){const c=vm.createContext({navigator});vm.runInContext(source,c);assert.equal(c.TypeDeformerRenderContext.make().memoryBudget,128*1024*1024);}
});

test('explicit software canvas preference reaches both rasters on the first context call',()=>{
 const observed=[];
 const c=vm.createContext({document:{createElement(){const record={calls:[]};observed.push(record);return {width:1,height:1,getContext(_type,attributes){record.calls.push(attributes);return {setTransform(){}};}};}}});
 vm.runInContext(fs.readFileSync(new URL('render-context.js',root),'utf8'),c);const R=c.TypeDeformerRenderContext;
 for(const factor of [1,2])R.withContext(R.make({factor}),()=>{
  const start=observed.length,canvas=R.createCanvas(20,30,{willReadFrequently:true});canvas.width=40;canvas.getContext('2d');
  const created=observed.slice(start);assert.equal(created.length,factor===1?1:2);
  for(const record of created)assert.equal(record.calls[0].willReadFrequently,true,'context attributes must be supplied before implicit initialization');R.release(canvas);
 });
});

function workerFixture(){
 const images={live:0,peak:0,closed:0},messages=[];
 class Canvas{
  constructor(w,h){this.width=w;this.height=h;}
  getContext(){let transform={a:1,b:0,c:0,d:1,e:0,f:0};return {canvas:this,save(){},restore(){},setTransform(a,b,c,d,e,f){transform={a,b,c,d,e,f};},getTransform(){return transform;},drawImage(){},clearRect(){}};}
  transferToImageBitmap(){images.live++;images.peak=Math.max(images.peak,images.live);let closed=false;return {width:this.width,height:this.height,close(){assert.equal(closed,false);closed=true;images.live--;images.closed++;}};}
 }
 const noop=()=>{},c=vm.createContext({OffscreenCanvas:Canvas,performance,setTimeout,clearTimeout,fonts:{add(){},delete(){},addEventListener(){}}});
 c.self=c;c.postMessage=m=>messages.push(m);
 c.importScripts=(...files)=>files.forEach(file=>vm.runInContext(fs.readFileSync(new URL(file,root),'utf8'),c,{filename:file}));
 vm.runInContext(fs.readFileSync(new URL('surface-worker.js',root),'utf8'),c,{filename:'surface-worker.js'});
 assert.equal(Object.keys(c.workerEngine.renderers).length,100,'load the actual canonical engine and Worker adapter');
 // These tests model layer allocation/acknowledgement, not pixel content. Keep
 // synthetic empty layers while exercising the real engine scratch and scopes.
 c.TypeDeformerRenderEnvelope.scanCanvas=()=>({});c.TypeDeformerRenderEnvelope.touches=()=>false;
 const ids=Array.from({length:9},(_,i)=>'ink'+i);Object.assign(c.workerEngine.renderers,Object.fromEntries(ids.map(id=>[id,noop])));
 const frame={kind:'frame',purpose:'export',mobile:false,params:{fontFamily:'Arial'},composition:{phase:0},text:'A',glyphs:[],fm:{},operators:ids,operatorKeys:{},scale:1,layout:{s:1,dx:0,dy:0},width:4096,height:4096,plan:{width:16,height:16,density:1,bounds:{x:0,y:0},layout:{}}};
 // Keep the original 512 MiB layer cap to isolate streaming from the raised cap.
 const limits=c.TypeDeformerRenderContext.limits;c.TypeDeformerRenderContext.limits=(purpose,mobile)=>({...limits(purpose,mobile),layerBytes:512*1024*1024});
 return {c,images,messages,frame};
}

test('nine 4K layers exceed the former cap together but export individually with one live bitmap and measured progress',async()=>{
 const legacy=workerFixture();await assert.rejects(legacy.c.renderFrame(legacy.frame),/メモリ予算/);assert.equal(legacy.images.live,0);
 const {c,images,frame}=workerFixture(),order=[],progress=[];
 const result=await c.renderFrame({...frame,streamLayers:true},async(id,bitmap)=>{order.push(id);assert.equal(images.live,1);bitmap.close();},v=>progress.push(v));
 assert.deepEqual(order,frame.operators);assert.equal(result.streamed,true);assert.equal(Object.keys(result.layers).length,0);assert.equal(result.resultBytes,4096*4096*4);assert.equal(images.peak,1);assert.equal(images.live,0);assert.equal(images.closed,9);
 assert.equal(progress[0].stage,'fonts');const drawing=progress.filter(v=>v.stage==='effects');assert.equal(drawing.length,9);assert.equal(drawing.at(-1).completed,drawing.at(-1).total);assert.ok(drawing.every((v,i)=>v.completed===i+1));
});

test('the worker waits for a matching consumed-layer acknowledgement before allocating the next bitmap',async()=>{
 const {c,images,messages,frame}=workerFixture();frame.operators=frame.operators.slice(0,2);
 const run=c.onmessage({data:{id:41,payload:{...frame,streamLayers:true}}});await Promise.resolve();await Promise.resolve();
 let layers=messages.filter(m=>m.type==='layer');assert.equal(layers.length,1);assert.equal(images.live,1);
 await c.onmessage({data:{type:'layerAck',id:40,operator:layers[0].result.operator}});await Promise.resolve();assert.equal(messages.filter(m=>m.type==='layer').length,1);
 layers[0].result.bitmap.close();await c.onmessage({data:{type:'layerAck',id:41,operator:layers[0].result.operator}});await Promise.resolve();
 layers=messages.filter(m=>m.type==='layer');assert.equal(layers.length,2);assert.equal(images.peak,1);layers[1].result.bitmap.close();await c.onmessage({data:{type:'layerAck',id:41,operator:layers[1].result.operator}});await run;
 assert.equal(messages.at(-1).type,'result');assert.equal(images.live,0);
});

test('proof also streams nine 4K layers with one bitmap in flight',async()=>{
 const {c,images,frame}=workerFixture();
 const result=await c.renderFrame({...frame,purpose:'proof',streamLayers:true},async(_id,bitmap)=>bitmap.close());
 assert.equal(result.streamed,true);assert.equal(images.peak,1);assert.equal(images.live,0);
});

test('lost or unavailable canvases fail explicitly instead of publishing empty layers',async()=>{
 const {R}=fixture();for(const context of [null,{isContextLost:()=>true}])assert.throws(()=>R.assertCanvas({getContext:()=>context}),{code:'CANVAS_CONTEXT_LOST'});
 const {c,images,frame,messages}=workerFixture();
 const normal=c.OffscreenCanvas.prototype.getContext;
 c.OffscreenCanvas.prototype.getContext=function(){return {...normal.call(this),isContextLost:()=>true};};
 await c.onmessage({data:{id:1,payload:frame}});
 assert.equal(messages.at(-1).type,'error');assert.equal(messages.at(-1).code,'CANVAS_CONTEXT_LOST');assert.equal(images.live,0);
});

test('a cleared retained destination is invalid even when its context is healthy',()=>{
 const {R}=fixture(),canvas=R.createCanvas(32,24),expected={width:32,height:24};
 assert.equal(R.assertCanvas(canvas,expected),canvas);
 canvas.width=canvas.height=1;
 assert.throws(()=>R.assertCanvas(canvas,expected),{code:'CANVAS_CONTEXT_LOST'});
});

test('output readback distinguishes blank paper from thin ink without downsampling',()=>{
 const {R}=fixture(),canvas=R.createCanvas(1030,140),ctx=canvas.getContext('2d');
 assert.equal(R.hasVisiblePixels(canvas),false);
 ctx.fillStyle='#123456';ctx.fillRect(0,0,1030,140);
 assert.equal(R.hasVisiblePixels(canvas,[18,52,86]),false);
 ctx.fillStyle='#abcdef';ctx.fillRect(1029,139,1,1);
 assert.equal(R.hasVisiblePixels(canvas,[18,52,86]),true);
 ctx.clearRect(0,0,1030,140);ctx.fillRect(1029,139,1,1);
 assert.equal(R.hasVisiblePixels(canvas),true);
});

test('software retry is inherited by nested render contexts and has a separate cache key',()=>{
 const {R}=fixture(),cpu=R.make({purpose:'export',software:true});
 R.withContext(cpu,()=>{
  const inherited=R.make({purpose:'export'}),explicit=R.make({purpose:'export',software:false});
  assert.equal(inherited.software,true);assert.equal(explicit.software,false);
  assert.notEqual(inherited.key,explicit.key);
 });
 assert.equal(R.make({purpose:'export'}).software,false);
});

test('allocation failures carry a retryable code and software retry initializes CPU contexts',()=>{
 const {R}=fixture();assert.throws(()=>R.withContext(R.make({memoryBudget:10}),()=>R.createCanvas(100,100)),{code:'RENDER_MEMORY_EXCEEDED'});
 const calls=[],c=vm.createContext({document:{createElement(){return {width:1,height:1,getContext(_type,attributes){calls.push(attributes);return {setTransform(){}};}};}}});
 vm.runInContext(fs.readFileSync(new URL('render-context.js',root),'utf8'),c);
 const api=c.TypeDeformerRenderContext;api.withContext(api.make({software:true}),()=>api.createCanvas(10,10));assert.equal(calls[0].willReadFrequently,true);
});

test('render contexts reject async callbacks before execution and release promise-returning scopes', async()=>{
 const {R}=fixture(),context=R.make();let invoked=false,canvas;
 assert.throws(()=>R.withContext(context,async()=>{invoked=true;}),{code:'RENDER_ASYNC_SCOPE'});
 assert.equal(invoked,false);assert.equal(R.current(),null);
 R.withContext(context,()=>{
  assert.throws(()=>R.withScope(()=>{canvas=R.createCanvas(10,10);return Promise.resolve();}),{code:'RENDER_ASYNC_SCOPE'});
  assert.equal(canvas.width,1);assert.equal(context.bytes,0);
 });
 await Promise.resolve();assert.equal(R.current(),null);
});

test('native canvas resize remains budgeted outside the original synchronous context',()=>{
 const {R}=fixture(),context=R.make({memoryBudget:2000,maxCanvasPixels:1000});
 const canvas=R.withContext(context,()=>R.createCanvas(10,10));
 assert.equal(context.bytes,400);canvas.width=20;assert.equal(context.bytes,800);
 assert.throws(()=>{canvas.height=30;},{code:'RENDER_MEMORY_EXCEEDED'});
 assert.equal(canvas.height,10);assert.equal(context.bytes,800);
 R.withContext(context,()=>R.release(canvas));assert.equal(context.bytes,0);assert.equal(canvas.width,1);
});

test('high density resize rejects before mutating either raster and retains exact accounting',()=>{
 const {R}=fixture(),context=R.make({factor:2,memoryBudget:4000});
 const canvas=R.withContext(context,()=>R.createCanvas(10,10));
 assert.equal(context.bytes,2000);assert.throws(()=>{canvas.width=30;},{code:'RENDER_MEMORY_EXCEEDED'});
 assert.equal(canvas.width,10);assert.equal(R.physical(canvas).width,20);assert.equal(context.bytes,2000);
 R.release(canvas);assert.equal(context.bytes,0);
});

test('retaining an outer allocation inside a nested scope removes its original scope owner',()=>{
 const {R}=fixture(),context=R.make();let canvas;
 R.withContext(context,()=>R.withScope(()=>{
  canvas=R.createCanvas(10,10);R.withScope(()=>R.retain(canvas));
 }));
 assert.equal(canvas.width,10);assert.equal(context.bytes,0);assert.equal(R.memoryStats().retainedBytes,400);
 R.release(canvas);R.release(canvas);assert.equal(R.memoryStats().retainedBytes,0);
});

test('alpha and mesh failures release their temporary arrays without an enclosing allocation scope',()=>{
 const {R}=fixture(),context=R.make({factor:2});
 R.withContext(context,()=>{
  const canvas=R.createCanvas(10,10),baseline=context.bytes;
  assert.throws(()=>R.applyAlpha(canvas,()=>{throw Error('sample failure');}),/sample failure/);
  assert.equal(context.bytes,baseline);
  assert.throws(()=>R.mesh(canvas,[[0,0,0],[10,0,0],[0,10,0]],[[0,1,2]],()=>{throw Error('draw failure');}),/draw failure/);
  assert.equal(context.bytes,baseline);R.release(canvas);
 });assert.equal(context.bytes,0);
});

test('same-origin render jobs share exclusive reservations and reclaim them idempotently',()=>{
 const {R}=fixture(),pool=R.createResourcePool(1000),first=pool.reserve('export',600,true);
 assert.throws(()=>pool.reserve('video',200,true),{code:'RENDER_RESOURCE_BUSY'});
 assert.throws(()=>pool.reserve('buffer',500,false),{code:'RENDER_RESERVATION_EXCEEDED'});
 const second=pool.reserve('buffer',200,false);assert.equal(pool.inspect().reservedBytes,800);
 const nested=pool.reserve('same-video-frame',100,true,first.group);assert.equal(pool.inspect().reservedBytes,900);nested.release();
 first.release();first.release();second.release();assert.equal(pool.inspect().reservedBytes,0);assert.equal(pool.inspect().peakReservedBytes,900);
 const child=vm.createContext({parent:{TypeDeformerRenderContext:R}});vm.runInContext(fs.readFileSync(new URL('render-context.js',root),'utf8'),child);
 assert.equal(child.TypeDeformerRenderContext.resources,R.resources);
});
