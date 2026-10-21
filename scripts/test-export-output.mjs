import test from 'node:test';
import assert from 'node:assert/strict';
import { exportFixture } from './export-fixture.mjs';

test('PNG print density replaces pHYs without changing encoded image or alpha', async () => {
  const { c } = exportFixture();
  const { canvas, ctx } = c.createSafeCanvas(31, 17, 1);
  ctx.fillStyle = '#40808088'; ctx.fillRect(5, 3, 9, 7);
  const original = new Blob([canvas.toBuffer('image/png')], {type:'image/png'});
  function chunks(bytes) {
    const list=[];
    for(let offset=8;offset<bytes.length;) {const size=bytes.readUInt32BE(offset), type=bytes.toString('ascii',offset+4,offset+8);list.push({type,data:bytes.subarray(offset+8,offset+8+size),crc:bytes.readUInt32BE(offset+8+size),checked:bytes.subarray(offset+4,offset+8+size)});offset+=size+12;}
    return list;
  }
  let blob = original;
  for (const dpi of [72, 150, 300, 600]) {
    blob = await c.pngWithDpi(blob, dpi);
    const out=chunks(Buffer.from(await blob.arrayBuffer())), phys=out.filter(c=>c.type==='pHYs');
    assert.equal(phys.length,1); assert.equal(phys[0].data.readUInt32BE(0),Math.round(dpi/.0254));
    assert.equal(phys[0].data.readUInt32BE(4),Math.round(dpi/.0254)); assert.equal(phys[0].data[8],1);
    assert.equal(phys[0].crc,c.pngCrc32(phys[0].checked));
    assert.ok(out.findIndex(c=>c.type==='pHYs')<out.findIndex(c=>c.type==='IDAT'));
    const imageBytes=cs=>Buffer.concat(cs.filter(c=>c.type!=='pHYs').map(c=>c.checked));
    assert.deepEqual(imageBytes(out),imageBytes(chunks(Buffer.from(await original.arrayBuffer()))));
  }
  assert.equal(c.pngCrc32(new TextEncoder().encode('123456789')),0xcbf43926,'independent CRC reference');
  await assert.rejects(()=>c.pngWithDpi(new Blob(['bad']),300),/ヘッダー/);
});

test('Auto margin is adjustable with a minimum anti-clipping gutter', () => {
  const { c }=exportFixture(); Object.assign(c.params,{transparentBg:true,exportPadding:0});
  const {canvas,ctx}=c.createSafeCanvas(600,400,1);ctx.fillRect(100,100,300,100);
  const layout={s:1,dx:0,dy:0}, small=c.measuredInkLayout(canvas,layout,1);
  assert.equal(small.w,308); assert.equal(small.h,108);
  c.params.exportPadding=10;const large=c.measuredInkLayout(canvas,layout,1);
  assert.equal(large.w,360);assert.equal(large.h,160);assert.equal(large.dx,-70);
  c.params.exportName='作品:/test* .'; assert.match(c.imageExportName('png','-page-2'),/^作品--test-.*-page-2\.png$/);
});

test('native ink at the output edge expands the camera before tightening', () => {
  const {c}=exportFixture();Object.assign(c.params,{transparentBg:true,exportPadding:1});
  const {canvas,ctx}=c.createSafeCanvas(800,400,1),L={w:800,h:400,s:1,dx:50,dy:60};
  ctx.fillRect(0,100,300,100);
  const result=c.refineImageInkLayout(canvas,L,1,true);
  assert.equal(result.expanded,true);assert.equal(result.layout.w,960);assert.equal(result.layout.dx,210);assert.equal(result.layout.h,400);
  ctx.clearRect(0,0,800,400);ctx.fillRect(100,100,300,100);
  const tight=c.refineImageInkLayout(canvas,L,1,true);assert.equal(tight.expanded,false);assert.ok(tight.layout.w<400);
  assert.equal(c.refineImageInkLayout(canvas,L,1,false),null,'bounded refinement can retain a safe extra gutter');
});

test('ink framing keeps distant faint pixels, respects paper and leaves a gutter', () => {
  for (const transparentBg of [false, true]) {
    const { c } = exportFixture(); Object.assign(c.params, { transparentBg, paper: '#102030' });
    const { canvas, ctx } = c.createSafeCanvas(900, 600, 1);
    if (!transparentBg) { ctx.fillStyle = c.params.paper; ctx.fillRect(0, 0, 900, 600); }
    assert.equal(c.measuredInkLayout(canvas, { s: 1, dx: 100, dy: 200 }, 1), null);
    ctx.fillStyle = '#408080'; ctx.fillRect(300, 250, 200, 60);
    const faint = ctx.createImageData(1, 1); faint.data.set(transparentBg ? [64, 128, 128, 1] : [17, 32, 48, 255]);
    ctx.putImageData(faint, 750, 420);
    const L = c.measuredInkLayout(canvas, { s: 1, dx: 100, dy: 200 }, 1);
    assert.ok(L.w < 500 && L.h < 200, 'discard unrelated safety envelope');
    assert.ok(L.dx + (300 - 100) > 0 && L.dy + (250 - 200) > 0);
    assert.ok(L.dx + (751 - 100) < L.w && L.dy + (421 - 200) < L.h, 'faint outlier is inside gutter');
  }
});

test('long-edge output redraws at native density only for eligible Auto artwork', () => {
  const { c } = exportFixture();
  Object.assign(c.params, { artboard: 'auto', exportRegion: 'work', exportTight: true, exportLongEdge: 8192, exportScale: 2 });
  const L = { w: 1024, h: 256 };
  assert.equal(c.imageExportScale(L), 8);
  assert.equal(c.imageOutputPurpose('proof'),'export','full-resolution tight proof uses the PNG budget');
  c.params.exportLongEdge = 16384;
  assert.equal(c.imageExportPreflightDimensions({w:9000,h:8000}).width,16384,'unknown ink aspect ratio must not block a valid narrow export');
  c.studioOutputOptions={inkMeasured:true};
  assert.throws(()=>c.imageExportPreflightDimensions({w:9000,h:8000}),/上限/,'measured dimensions still enforce pixel budget');
  c.studioOutputOptions=null;c.params.exportLongEdge=8192;
  for (const patch of [{ artboard: 'custom' }, { exportRegion: 'page' }, { exportTight: false }]) {
    const before = { ...c.params }; Object.assign(c.params, patch);
    assert.equal(c.imageExportScale(L), 2); Object.assign(c.params, before);
  }
  c.compositionState.enabled = true; assert.equal(c.imageExportScale(L), 2);
  c.compositionState.enabled = false; c.params.exportLongEdge = 0; assert.equal(c.imageExportScale(L), 2);
  c.params.exportTight=false;assert.equal(c.imageOutputPurpose('proof'),'proof','other proof paths retain their budget');
});

test('all nine anchors honor zero for top/left, with and without fitting', () => {
  const { c } = exportFixture();
  const bounds = { x: -35, y: 28, w: 300, h: 120 };
  for (const fit of [false, true]) for (const [row, ay] of [['t',0],['c',.5],['b',1]]) for (const [col, ax] of [['l',0],['c',.5],['r',1]]) {
    Object.assign(c.params, { fit, anchor: row + col, abW: 900, abH: 700, marginPct: 10 });
    const L = c.exportLayout(bounds), margin = 70, s = fit ? 760 / 300 : 1;
    assert.equal(L.dx + bounds.x * s, margin + (760 - 300 * s) * ax, row + col + ' horizontal');
    assert.equal(L.dy + bounds.y * s, margin + (560 - 120 * s) * ay, row + col + ' vertical');
  }
});

test('long-form preview fits its pixel budget even below five percent; final scale stays explicit', () => {
  const { c } = exportFixture();
  for (const ios of [false, true]) for (const [w,h] of [[500000,300], [900,500000], [100000,100000]]) {
    c.isIOS = ios;
    const s = c.previewScaleForLayout(w, h, 8);
    assert.ok(s > 0 && s < .05);
    assert.ok(Math.round(w * s) <= (ios ? 1600 : 2048));
    assert.ok(Math.round(h * s) <= (ios ? 1600 : 2048));
    assert.ok(Math.round(w * s) * Math.round(h * s) <= (ios ? 2200000 : 4000000));
    assert.equal(c.params.exportScale, 1);
  }
});

test('invalid raster dimensions fail before allocation, not as a blank successful image', () => {
  const { c, allocations } = exportFixture();
  for (const [w,h,s] of [[NaN,10,1],[10,Infinity,1],[-1,10,1],[0,10,1],[10,10,0]]) {
    assert.throws(() => c.createSafeCanvas(w,h,s), /サイズ|寸法/);
  }
  assert.equal(allocations(), 0);
});

test('SVG with raster FX enforces canvas bounds and reports failure without incomplete downloads', () => {
  const { c, downloads, statuses } = exportFixture(); c.setSource('本文');
  const scene = c.snapshotRenderableScene(); c.snapshotRenderableScene = () => scene;
  c.params.abW = 20000; c.surfaceAnyEffectPresent = () => true;
  let allocations = 0;
  c.document.createElement = () => { allocations++; return { getContext: () => null }; };
  c.runSvgExport();
  assert.equal(downloads.length, 0); assert.equal(statuses.at(-1).state, 'error');
  assert.match(statuses.at(-1).message, /SVG.*(上限|サイズ)/);
  assert.equal(allocations, 0, 'must preflight, not attempt a huge Canvas');
});

test('IME-in-progress export is blocked instead of capturing a stale source revision', () => {
  const { c, downloads, statuses } = exportFixture(); c.setSource('本文'); c.textComposing = true;
  c.exportPng(); c.runSvgExport();
  assert.equal(downloads.length, 0); assert.match(statuses.at(-1).message, /確定/);
});

test('pure-vector SVG remains available beyond raster limits, and context failure never omits FX silently', async () => {
  const { c, downloads, statuses } = exportFixture(); c.setSource('A<&本文');
  const scene = c.snapshotRenderableScene(); c.snapshotRenderableScene = () => scene;
  c.params.abW = 20000;
  c.document.createElement = () => { throw Error('Vector SVG must not allocate a Canvas'); };
  c.runSvgExport(); assert.equal(downloads.length, 1);
  const svg = await downloads[0].blob.text();
  assert.match(svg, /width="20000"/); assert.match(svg, /&lt;/); assert.match(svg, /&amp;/);
  c.params.abW = 100; c.params.abH = 100; c.surfaceAnyEffectPresent = () => true;
  c.document.createElement = () => ({ getContext: () => null });
  c.runSvgExport(); assert.equal(downloads.length, 1);
  assert.equal(statuses.at(-1).state, 'error'); assert.match(statuses.at(-1).message, /Canvas/);
});

test('size inspection reports raster SVG limits and clipping without allocating output or changing settings', () => {
  const { c, downloads, statuses, allocations } = exportFixture(); c.setSource('本文');
  const scene = c.snapshotRenderableScene(); c.snapshotRenderableScene = () => scene;
  Object.assign(c.params, { abW: 20000, abH: 100, exportScale: 8, fit: false });
  c.surfaceAnyEffectPresent = () => true;
  const before = JSON.stringify(c.params), count = allocations(); c.inspectExport();
  assert.equal(allocations(), count); assert.equal(downloads.length, 0);
  assert.equal(JSON.stringify(c.params), before); assert.equal(statuses.at(-1).state, 'error');
  assert.match(statuses.at(-1).message, /SVGのFX/);
  Object.assign(c.params, { abW: 16, abH: 16, exportScale: 1 });
  c.inspectExport(); assert.match(statuses.at(-1).message, /切れます/);
});

test('portable SVG always releases its rendered canvas, including metadata, PNG, Blob and download failures', () => {
  for (const phase of ['success', 'metadata', 'png', 'blob', 'download']) {
    const { c, statuses } = exportFixture();c.setSource('Portable');
    const scene = c.snapshotRenderableScene();c.snapshotRenderableScene = () => scene;
    let released = 0;
    const target = { width: 128, height: 64, toDataURL() { if (phase === 'png') throw Error('PNG encoding failed');return 'data:image/png;base64,AA=='; } };
    c.params.svgMode = 'portable';c.params.svgMetadata = phase === 'metadata';c.renderCanvas = () => target;
    c.currentLookState = () => { throw Error('Metadata capture failed'); };
    c.TypeDeformerRenderContext = { release(canvas) { assert.equal(canvas, target);released++;canvas.width = canvas.height = 1; } };
    if (phase === 'blob') c.Blob = class { constructor() { throw Error('Blob allocation failed'); } };
    if (phase === 'download') c.download = () => { throw Error('Download failed'); };
    c.runSvgExport();
    assert.equal(released, 1, phase);assert.equal(target.width, 1, phase);
    assert.equal(statuses.at(-1).state, phase === 'success' ? 'done' : 'error', phase);
  }
});
