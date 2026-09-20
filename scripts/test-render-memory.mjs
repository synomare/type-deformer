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
  for (const name of ['render-context.js', 'field-material-operators.js']) {
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
  assert.equal(context.memoryBudget, 768 * 1024 * 1024);
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
});

test('iPhone and touch Mac platform reporting both select the mobile edit budget',()=>{
 const source=fs.readFileSync(new URL('render-context.js',root),'utf8');
 for(const navigator of [{platform:'iPhone',userAgent:'WebKit'},{platform:'MacIntel',userAgent:'Macintosh',maxTouchPoints:5}]){const c=vm.createContext({navigator});vm.runInContext(source,c);assert.equal(c.TypeDeformerRenderContext.make().memoryBudget,128*1024*1024);}
});
