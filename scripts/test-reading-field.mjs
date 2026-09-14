// Actual model/snapshot/draw functions; DOM geometry is explicitly mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import vm from 'node:vm';
import { fixture, metric, html, extract } from './paragraph-current-fixture.mjs';

const plain = x => JSON.parse(JSON.stringify(x));

function pagedReading(vertical = false, rows = 20) {
  const c = fixture();
  Object.assign(c.params, { fontSize: 20, pageLayout: 'spreads', pageDepth: 6, pageGutter: 2, pageGap: 3,
    textMeasure: 8, pageKeepLines: 1, vertical, readingScope: 'spread' });
  for(let i=0;i<rows*8;i++) {
    const row=Math.floor(i/8),col=i%8;
    const m=metric(c,vertical?1000-row*30:col*20,vertical?col*20:row*30,
      {width:vertical?30:20,height:vertical?20:30,paragraph:Math.floor(row/2),text:'文'});
    Object.assign(m.el.dataset,{sourceStart:String(i),sourceEnd:String(i+1)});
    Object.assign(c.operatorState(m, 'readingField'),{current:1,toggled:true});c.metrics.push(m);
  }
  c.measureLayout();return c;
}

test('page and spread frames use the full declared layout including gutter and the unoccupied final slot', () => {
  for(const vertical of [false,true]) {
    const c=pagedReading(vertical), uniquePages=new Map(),uniqueSpreads=new Map();
    assert.equal(c.pageLayoutState.pages.length,5);
    for(const m of c.metrics) {
      if(uniquePages.has(m.pageIndex)) assert.equal(m.readingPageFrame,uniquePages.get(m.pageIndex));
      if(uniqueSpreads.has(m.spreadIndex)) assert.equal(m.readingSpreadFrame,uniqueSpreads.get(m.spreadIndex));
      uniquePages.set(m.pageIndex,m.readingPageFrame);uniqueSpreads.set(m.spreadIndex,m.readingSpreadFrame);
    }
    assert.equal(uniquePages.size,5);assert.equal(uniqueSpreads.size,3);
    for(const f of uniquePages.values()) { assert.equal(f.maxU-f.minU,160);assert.equal(f.maxV-f.minV,120); }
    for(const f of uniqueSpreads.values()) {
      assert.equal(f.maxU-f.minU,vertical?160:360);assert.equal(f.maxV-f.minV,vertical?280:120);
    }
    const frames=plain(c.metrics.map(m=>m.readingSpreadFrame));
    c.metrics.forEach((m,i)=>c.operatorState(m, 'readingField').current=i%3?0:1);c.measureLayout();
    assert.deepEqual(plain(c.metrics.map(m=>m.readingSpreadFrame)),frames,'partial Apply cannot recenter the shared frame');
  }
});

test('each spread repeats the map; later source pages do not move the first spread focus', () => {
  for(const vertical of [false,true]) {
    const short=pagedReading(vertical,8),long=pagedReading(vertical,20);
    const channel=m=>['--op-reading-x','--op-reading-y','--op-reading-sx','--op-reading-sy'].map(k=>m.el.style.getPropertyValue(k));
    assert.deepEqual(short.metrics.map(channel),long.metrics.slice(0,64).map(channel),'translation-independent local frame');
    assert.deepEqual(long.metrics.slice(0,64).map(channel),long.metrics.slice(64,128).map(channel),'repeated complete spreads use the same field');
    const before=channel(long.metrics[8]);
    long.params.readingScope='page';applyReading(long);
    assert.notDeepEqual(channel(long.metrics[8]),before,'page and spread are not aliases');
    const g=long.snapshotGlyphs(true)[8],composed=long.compositionGlyph({glyph:g,sourceIndex:8},400,300,1,1,0,null,1,0);
    assert.equal(composed.scaleX,g.scaleX);assert.equal(composed.scaleY,g.scaleY);assert.equal(composed.tx,g.tx);
  }
});

test('continuous/Grid suspend layout-only Reading without losing assignments, and page mode never invents a spread', () => {
  const c=pagedReading(),m=c.metrics[9],saved=plain(c.sparseOperatorState(m));
  const before=c.snapshotGlyphs(true).map(g=>[g.tx,g.ty,g.scaleX,g.scaleY]);
  for(const mode of ['continuous','pages']) {
    c.params.pageLayout=mode;c.measureLayout();
    assert.ok(c.metrics.every(m=>m.readingSpreadFrame===null));
    assert.equal(m.el.style.getPropertyValue('--op-reading-sx'),'');
    assert.deepEqual(plain(c.sparseOperatorState(m)),saved);
  }
  c.params.readingScope='page';c.measureLayout();assert.notEqual(m.el.style.getPropertyValue('--op-reading-sx'),'');
  c.params.gridEnabled=true;c.measureLayout();assert.equal(m.readingPageFrame,null);assert.equal(m.el.style.getPropertyValue('--op-reading-sx'),'');
  c.params.gridEnabled=false;c.params.pageLayout='spreads';c.params.readingScope='spread';c.measureLayout();
  assert.deepEqual(c.snapshotGlyphs(true).map(g=>[g.tx,g.ty,g.scaleX,g.scaleY]),before);
  m.locked=true;const frozen=m.el.style.getPropertyValue('--op-reading-sx');
  c.params.pageLayout='continuous';c.measureLayout();assert.equal(m.el.style.getPropertyValue('--op-reading-sx'),frozen,'Lock intentionally preserves frozen channels');
  m.locked=false;c.measureLayout();assert.equal(m.el.style.getPropertyValue('--op-reading-sx'),'');
});

test('scope status explains availability/mixed values without changing layout, target or the disabled control (mock UI)', () => {
  const c=fixture(),input={value:'spread',disabled:true},hint={textContent:''};
  c.document.getElementById=id=>({pReadingScope:input,readingScopeHint:hint})[id]||null;
  for(const [mode,grid,scope,pattern] of [['continuous',false,'spread',/休止中/],['pages',false,'spread',/休止中/],
    ['spreads',false,'spread',/左右2ページ/],['spreads',true,'page',/休止中/],['pages',false,'page',/各ページ/],
    ['continuous',false,'document',/全ページ/],['spreads',false,'__mixed',/複数の基準/]]) {
    c.params.pageLayout=mode;c.params.gridEnabled=grid;input.value=scope;
    const params=plain(c.params);c.syncReadingScopeUI();assert.match(hint.textContent,pattern);
    assert.deepEqual(plain(c.params),params);assert.equal(input.disabled,true);
  }
  assert.match(extract('refreshSourceParameterControls'),/syncReadingScopeUI\(\)/);
  assert.match(extract('refreshParameterUI'),/syncOperatorParameterAvailability\(\)/);
});

test('3k/10k/50k page-scoped Reading keeps all glyphs and shared frames with no quality reduction (synthetic geometry)', t => {
  for(const count of [3000,10000,50000]) {
    const started=performance.now(),c=pagedReading(false,count/8),spreadMs=performance.now()-started;
    assert.equal(c.metrics.length,count);assert.ok(c.metrics.every(m=>Number(m.el.style.getPropertyValue('--op-reading-sx'))>0));
    const startPage=performance.now();c.params.readingScope='page';c.measureLayout();const pageMs=performance.now()-startPage;
    assert.equal(new Set(c.metrics.map(m=>m.readingPageFrame)).size,c.pageLayoutState.pages.length);
    assert.ok(c.metrics.every(m=>Number(m.el.style.getPropertyValue('--op-reading-sx'))>0));
    t.diagnostic(`${count} glyphs / ${c.pageLayoutState.pages.length} pages / spread setup ${spreadMs.toFixed(1)}ms / page remeasure ${pageMs.toFixed(1)}ms; actual functions + synthetic DOM, not browser performance`);
  }
});

test('global, sparse source and broad/character Batch codecs accept page/spread and reject unknown scopes', () => {
  const c=fixture();
  for(const name of ['BATCH_PARAM_OPTIONS','BATCH_PARAM_LIMITS','SOURCE_PARAMETER_KEYS'])
    vm.runInContext(html.match(new RegExp('      var '+name+' = \\{[^]*?\\n      };'))[0],c);
  vm.runInContext(html.match(/      var BATCH_PARAM_KEYS = \[[^]*?\n      \];/)[0],c);
  vm.runInContext(['chooseParam','sourceParameterKey','normalizeSourceParameters','normalizeBatchProfiles'].map(extract).join('\n'),c);
  c.PARAM_DEFAULTS={readingScope:'paragraph'};c.BATCH_PROFILE_KEYS=['latin','latin_upper'];c.BATCH_TARGETS={byKey:{latin:{},latin_upper:{test:()=>true}}};
  const statement=extract('normalizeParams').match(/chooseParam\('readingScope'[^;]+;/)[0];
  for(const scope of ['page','spread']) {
    c.params.readingScope=scope;vm.runInContext(statement,c);assert.equal(c.params.readingScope,scope);
    assert.equal(c.normalizeSourceParameters({readingScope:scope}).readingScope,scope);
    const profiles=c.normalizeBatchProfiles({latin:{readingScope:scope},latin_upper:{readingScope:scope}});
    assert.equal(profiles.latin.readingScope,scope);assert.equal(profiles.latin_upper.readingScope,scope);
  }
  c.params.readingScope='arbitrary';vm.runInContext(statement,c);assert.equal(c.params.readingScope,'paragraph');
  assert.equal(c.normalizeSourceParameters({readingScope:'arbitrary'}),null);
});
function applyReading(c, strength = 1) {
  c.buildReadingFieldFrames(c.metrics, c.params.vertical);
  for (const m of c.metrics) {
    Object.assign(c.operatorState(m, 'readingField'), { current: strength, toggled: strength > 0 });
    c.applyReadingFieldVisual(m, c.params);
  }
  c.invalidateCompositionSource();
}
function lattice(c) {
  c.params.fontSize = 20;
  c.metrics = Array.from({ length: 600 }, (_, i) => metric(c, (i % 40) * 20, Math.floor(i / 40) * 30));
}

test('new registered box operator, eight controls, parameter schema and four owned channels', () => {
  const c = fixture();
  assert.equal(c.OPERATOR_IDS.length, 116); assert.equal(c.OPERATOR_BY_SHORT.rf, 'readingField');
  assert.equal(c.OPERATOR_DEFS.readingField.layer, 'box');
  assert.match(html, /data-operator-panel="readingField"/);
  assert.match(html, /readingField: \['--op-reading-x', '--op-reading-y', '--op-reading-sx', '--op-reading-sy'\]/);
  for (const key of ['Scope', 'Pressure', 'Width', 'Height', 'FocusU', 'FocusV', 'Feather', 'Body']) assert.ok(html.includes("'pReading" + key + "'"));
  assert.match(extract('normalizeParams'), /clampParam\('readingPressure', -3, 6/);
  assert.match(extract('projectData'), /version: 92/);
  assert.ok(html.includes('Number(data.version || 0) < 45'), 'Thorn migration cutoff must not shift with the current schema');
});

test('source paragraph frames include full boxes and document scope shares one frame', () => {
  const c = fixture();
  c.metrics = [metric(c, 0, 0), metric(c, 100, 30), metric(c, 10, 150, { paragraph: 2 })];
  const frames = c.buildReadingFieldFrames(c.metrics, false);
  assert.equal(frames.size, 2);
  assert.deepEqual(plain(c.metrics[0].readingParagraphFrame), { minU: 0, maxU: 120, minV: 0, maxV: 60 });
  assert.equal(c.metrics[0].readingDocumentFrame, c.metrics[2].readingDocumentFrame);
  assert.notEqual(c.metrics[0].readingParagraphFrame, c.metrics[2].readingParagraphFrame);
});

test('core and zero pressure/strength are exact identity; font, ink and opacity untouched', () => {
  const c = fixture(), frame = { minU: 0, maxU: 800, minV: 0, maxV: 600 }, p = c.params;
  const sample = (x, y, settings = p, strength = 1) => plain(c.readingFieldSample(x, y, 10, 15, frame, settings, strength, 20));
  const neutral = { du: 0, dv: 0, su: 1, sv: 1 };
  assert.deepEqual(sample(400, 300), neutral);
  assert.deepEqual(sample(30, 40, { ...p, readingPressure: 0 }), neutral);
  assert.deepEqual(sample(30, 40, p, 0), neutral);
  assert.deepEqual(sample(30, 40, { ...p, readingWidth: 1, readingHeight: 1 }), neutral);
  lattice(c); const paramsBefore = JSON.stringify(c.params); applyReading(c);
  assert.equal(JSON.stringify(c.params), paramsBefore);
  assert.ok(c.metrics.every(m => m.el.style.opacity === '1' && m.el.textContent === 'A'));
});

test('axis map is C2 at core boundaries and strictly increasing at all extrema', () => {
  const c = fixture(), f = c.readingFieldAxis;
  for (const pressure of [-3, -1, 0, 2, 6]) for (const feather of [.01, 12, 600]) {
    let previous = -Infinity;
    for (let x = -1000; x <= 1000; x += .5) {
      const y = f(x, 30, 100, feather, pressure);
      assert.ok(Number.isFinite(y) && y > previous); previous = y;
    }
    for (const edge of [-70, 130]) {
      const e = feather * 1e-4;
      const first = (f(edge + e, 30, 100, feather, pressure) - f(edge - e, 30, 100, feather, pressure)) / (2 * e);
      assert.ok(Math.abs(first - 1) < 1e-5);
    }
  }
});

test('edge-mapped adjacent boxes preserve order and shared edges under compression/expansion', () => {
  const c = fixture(), frame = { minU: 0, maxU: 800, minV: 0, maxV: 300 };
  for (const readingPressure of [-3, 2, 6]) for (const readingWidth of [0, .44, 1]) {
    const p = { ...c.params, readingPressure, readingWidth };
    let lastRight = null;
    for (let x = 10; x < 800; x += 20) {
      const s = c.readingFieldSample(x, 100, 10, 15, frame, p, 1, 20);
      const left = x + s.du - 10 * s.su, right = x + s.du + 10 * s.su;
      assert.ok(right > left);
      if (lastRight != null) assert.ok(Math.abs(left - lastRight) < 1e-9);
      lastRight = right;
    }
  }
});

test('scale follows mapped spacing, not merely independent per-glyph reduction', () => {
  const c = fixture(); lattice(c); applyReading(c);
  const m = c.metrics[0], g = c.snapshotGlyphs(true)[0];
  assert.ok(g.scaleX < .6 && g.scaleY < .6);
  assert.ok(g.tx > 40 && g.ty > 40, 'peripheral boxes actually gather toward the fixed core');
  assert.ok(Math.abs(c.glyphLinearMatrix(m.el).a - g.scaleX) < 1e-12);
  const center = { x: m.relX + g.tx, y: m.relY + m.h * .25 * (1 - g.scaleY) + g.ty };
  assert.equal(c.findNearestLetter(center.x, center.y), m);
  const carried = c.compositionGlyph({ glyph: g, sourceIndex: 0 }, 300, 200, 1, 1, 0, null, 1, 0);
  assert.equal(carried.scaleX, g.scaleX); assert.equal(carried.scaleY, g.scaleY);
  assert.equal(carried.tx, g.tx); assert.equal(carried.ty, g.ty);
  c.params.readingBody = 0; applyReading(c);
  assert.equal(c.snapshotGlyphs(true)[0].scaleX, 1);
});

test('logical axes and origin compensation agree for horizontal and vertical layout', () => {
  const c = fixture(); lattice(c); applyReading(c);
  const before = c.snapshotGlyphs(true), metrics = c.metrics;
  c.metrics = metrics.map(m => metric(c, -m.relY - m.h / 2, m.relX - m.w / 2, { width: m.h, height: m.w }));
  c.params.vertical = true; applyReading(c);
  const after = c.snapshotGlyphs(true);
  before.forEach((g, i) => {
    const b = after[i];
    assert.equal(b.scaleX, g.scaleY); assert.equal(b.scaleY, g.scaleX);
    assert.ok(Math.abs(b.tx + g.ty + metrics[i].h * .25 * (1 - g.scaleY)) < .001);
    assert.ok(Math.abs(b.ty + c.metrics[i].h * .25 * (1 - b.scaleY) - g.tx) < .001);
  });
});

test('expanded and rotated context letters remain selectable at their visible corners', () => {
  const c = fixture(), m = metric(c, 0, 0); c.metrics = [m];
  m.el.style.setProperty('--op-reading-sx', '20'); m.el.style.setProperty('--op-reading-sy', '20');
  m.el.style.setProperty('--op-rotate', '45deg');
  const a = c.glyphLinearMatrix(m.el), ox = m.relX, oy = m.relY + m.h * .25;
  const px = ox + a.a * 9.6 - a.c * 21, py = oy + a.b * 9.6 - a.d * 21;
  assert.ok(Math.abs(px - m.relX) > Math.max(m.w, m.h) * 5 + 100, 'outside the old prefilter');
  assert.equal(c.findNearestLetter(px, py), m);
});

test('locked source carry, remeasure, zero/removal and legacy-state restoration retain ownership', () => {
  const c = fixture(); lattice(c); applyReading(c); const m = c.metrics[0];
  m.locked = true; const old = m.el.style.getPropertyValue('--op-reading-x');
  c.params.readingPressure = -3; c.measureLayout(); assert.equal(m.el.style.getPropertyValue('--op-reading-x'), old);
  delete m.readingParagraphFrame; delete m.readingDocumentFrame;
  c.applyReadingFieldVisual(m, c.params); assert.equal(m.el.style.getPropertyValue('--op-reading-x'), old);
  c.measureLayout(); assert.equal(m.el.style.getPropertyValue('--op-reading-x'), old);
  c.operatorState(m, 'readingField').current = 0; c.applyReadingFieldVisual(m, c.params);
  assert.equal(m.el.style.getPropertyValue('--op-reading-sx'), '');
  c.restoreOperatorStates(m, { rotate: { t: 1, i: .5, m: 12 } });
  assert.equal(c.readingFieldStrength(m), 0, 'old states do not accidentally enable a new operator');
});

test('sparse Project and Share codecs preserve manual intensity and do not alias Current', () => {
  const c = fixture(), m = metric(c, 0, 0), dest = metric(c, 0, 0);
  Object.assign(c.operatorState(m, 'readingField'), { current: 1, toggled: true, manual: .42 });
  c.restoreOperatorStates(dest, JSON.parse(JSON.stringify(c.sparseOperatorState(m))));
  assert.equal(c.readingFieldStrength(dest), .42); assert.equal(c.paragraphCurrentStrength(dest), 0);
  c.restoreOperatorStates(dest, c.decodeOperatorStates(c.encodeOperatorStates(dest)));
  assert.equal(c.manualValueAtDragStart(dest, 'readingField'), .42);
});

test('3k/10k/50k sparse state model: finite bounded maps, source invariant, deterministic restoration', t => {
  const c = fixture(); c.params.fontSize = 20;
  for (const count of [3000, 10000, 50000]) {
    c.metrics = Array.from({ length: count }, (_, i) => metric(c, (i % 40) * 20, Math.floor(i / 40) * 30, { paragraph: Math.floor(i / 800), text: i % 2 ? '書' : 'A' }));
    const start = performance.now(); applyReading(c); const ms = performance.now() - start;
    const saved = c.metrics.map(m => plain(c.sparseOperatorState(m)));
    c.metrics.forEach((m, i) => { c.restoreOperatorStates(m, saved[i]); assert.equal(c.readingFieldStrength(m), 1); });
    assert.ok(c.metrics.every(m => Number(m.el.style.getPropertyValue('--op-reading-sx')) > 0));
    assert.deepEqual(Object.keys(c.metrics[0].operatorStates), ['stretch', 'readingField']);
    t.diagnostic(JSON.stringify({ glyphs: count, ms: +ms.toFixed(1), scope: 'frame+field+mock style, 2 instantiated states; not DOM frame rate, heap, full editor or device performance' }));
  }
});
