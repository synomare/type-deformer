import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
import { fixture, metric, extract, html } from './paragraph-current-fixture.mjs';
import { exportFixture } from './export-fixture.mjs';
import { setMeasuredPageSource } from './page-layout-fixture.mjs';
const plain = value => JSON.parse(JSON.stringify(value));

test('paragraph spacing is a global em setting with its actual input binding and reversible Grid disable (mock DOM)', () => {
  const c = fixture(), input = { value: '.55', listeners: {}, addEventListener(k, fn) { this.listeners[k] = fn; } }, val = {};
  c.document.getElementById = id => ({ pParagraphGap: input, vParagraphGap: val })[id] || null;
  Object.assign(c, { rangeControls: [], BATCH_PARAM_KEYS: [], sourceParameterMode: 'range', sourceParameterKey: () => false,
    fEm: v => v.toFixed(2) + 'em', applyStyle: () => c.applyTextMeasure() });
  vm.runInContext(extract('bindRange') + '\n' + html.match(/      bindRange\('pParagraphGap'[^\n]+/)[0], c);
  assert.equal(c.params.paragraphGap, .55);
  assert.match(html, /id="pParagraphGap" min="0" max="12" step="0.05" value="0.55" aria-describedby="paragraphGapHint"/);
  assert.match(html, /\.stage:not\(\.grid-layout\) p \{ margin: 0 0 var\(--paragraph-gap, 0.55em\); \}/);
  assert.match(html, /\.stage\.vertical:not\(\.grid-layout\) p \{ margin: 0 var\(--paragraph-gap, 0.55em\) 0 0; \}/);
  for (const gap of [0, .55, 3.25, 12]) {
    input.value = String(gap); input.listeners.input();
    assert.equal(c.params.paragraphGap, gap); assert.equal(val.textContent, gap.toFixed(2) + 'em');
    assert.equal(c.stage.style['--paragraph-gap'], gap + 'em');
    assert.equal(c.params.lineHeight, 1.1, 'paragraph spacing does not change leading');
  }
  for (const grid of [true, false, true, false]) {
    c.params.gridEnabled = grid; c.applyTextMeasure();
    assert.equal(input.disabled, grid); assert.equal(c.params.paragraphGap, 12);
  }
});

test('paragraph gap normalization uses finite bounds and retains the original default', () => {
  const c = fixture(); c.PARAM_DEFAULTS = { paragraphGap: .55 };
  vm.runInContext(extract('clampParam'), c);
  const statement = extract('normalizeParams').match(/clampParam\('paragraphGap'[^;]+;/)[0];
  for (const [value, expected] of [[-5,0],[100,12],[NaN,.55],[Infinity,.55],['broken',.55],['2.25',2.25],[0,0]]) {
    c.params.paragraphGap = value; vm.runInContext(statement, c); assert.equal(c.params.paragraphGap, expected);
  }
});

test('supplied em-spaced paragraph geometry keeps internal leading and trims space at page starts on both axes', () => {
  for (const vertical of [false, true]) {
    const {c} = exportFixture();
    Object.assign(c.params, { fontSize: 20, lineHeight: 1.5, textMeasure: 4, vertical, pageKeepLines: 1,
      pageLayout: 'continuous', pageDepth: 5, pageOrder: 'ltr' });
    const source = '文字列の長い段落\n次の段落\n\n空行の後';
    const position = m => vertical ? -m.flowX : m.flowY;
    const measure = gap => { c.params.paragraphGap = gap; setMeasuredPageSource(c, source, null, { paragraphSpacing: true }); };
    measure(.55); const before = c.metrics.map(position), sourceSpans = c.metrics.map(m => [m.el.dataset.sourceStart,m.el.dataset.sourceEnd]);
    measure(2.55);
    c.metrics.forEach((m, i) => assert.ok(Math.abs(position(m) - before[i] - Number(m.el.dataset.line) * 40) < 1e-7,
      'only explicit paragraph boundaries accumulate the additional 2em'));
    assert.deepEqual(c.metrics.map(m => [m.el.dataset.sourceStart,m.el.dataset.sourceEnd]),sourceSpans);
    assert.equal(c.textInput.value,source,'blank source lines are preserved');
    c.params.pageLayout = 'spreads'; measure(12);
    assert.equal(c.pageLayoutState.oversized,0);
    for (const page of c.pageLayoutState.pages) {
      const items=c.metrics.filter(m=>Number(m.el.dataset.sourceStart)>=page.start&&Number(m.el.dataset.sourceEnd)<=page.end);
      assert.ok(items.length>0); assert.ok(items.every(m=>Number.isFinite(m.relX)&&Number.isFinite(m.relY)));
    }
    // Two short paragraphs with a huge gap become adjacent page slots. Their
    // first-row coordinate is equal; the 12em gap is not carried onto page 2.
    setMeasuredPageSource(c,'文\n字',null,{paragraphSpacing:true});
    assert.equal(c.pageLayoutState.pages.length,2);
    const [a,b]=c.metrics;
    assert.equal(a.relY,b.relY);
    assert.equal(b.relX-a.relX,(vertical?c.params.pageDepth:c.params.textMeasure)*20+c.params.pageGutter*20);
    c.params.pageLayout='continuous'; measure(0);
    const first=c.metrics.find(m=>m.el.dataset.line==='1'), last=c.metrics.filter(m=>m.el.dataset.line==='0').at(-1);
    assert.ok(Math.abs(position(first)-position(last)-30)<1e-7,'zero extra spacing is ordinary 1.5em leading in this supplied geometry');
  }
});

test('3k/10k/50k paragraph spacing measurement retains every source glyph and is repeatable (native/synthetic, not browser)', t => {
  const passage='余白を読み、次の段落へ進む。 Quiet words.\n';
  for (const count of [3000,10000,50000]) {
    const source=passage.repeat(Math.ceil(count/passage.length)).slice(0,count), {c}=exportFixture();
    Object.assign(c.params,{textMeasure:32,pageLayout:'spreads',paragraphGap:2.25,pageDepth:40});
    const started=performance.now();setMeasuredPageSource(c,source,null,{paragraphSpacing:true});
    const ms=performance.now()-started, positions=c.metrics.map(m=>[m.relX,m.relY,m.pageIndex]);
    assert.equal(c.metrics.length,[...source].filter(ch=>!/[\r\n\t \u00a0]/.test(ch)).length);
    c.measureLayout();assert.deepEqual(c.metrics.map(m=>[m.relX,m.relY,m.pageIndex]),positions);
    t.diagnostic(`${count} source units / ${c.metrics.length} glyphs / ${c.pageLayoutState.pages.length} pages / ${ms.toFixed(1)}ms native metrics + synthetic wrapping + actual measurement; not DOM or device performance`);
  }
});
const plannerRows = (counts, step = 20) => counts.flatMap((count, paragraph) => Array.from({length:count}, () => ({paragraph})))
  .map((row, i) => ({ ...row, min: i * step, max: (i + 1) * step }));

test('paragraph line protection plans beyond the next page instead of stranding the final fragment', () => {
  const c = fixture(), rows = plannerRows([9]);
  const plan = c.planPageRows(rows, 80, 3);
  assert.deepEqual(plain(plan.pages.map(p => p.end - p.start)), [3,3,3]);
  assert.equal(plan.relaxedBreaks, 0);
});

test('line guards keep short paragraphs together, expose impossible splits and never create blank pages or lose oversized rows', () => {
  const c=fixture(), sizes=plan=>plain(plan.pages.map(p=>p.end-p.start));
  assert.deepEqual(sizes(c.planPageRows(plannerRows([3,3]),80,2)),[3,3]);
  assert.deepEqual(sizes(c.planPageRows(plannerRows([5]),80,2)),[3,2]);
  assert.deepEqual(sizes(c.planPageRows(plannerRows([9]),80,1)),[4,4,1], 'explicit off retains greedy packing');
  const impossible=c.planPageRows(plannerRows([3]),40,2);
  assert.deepEqual(sizes(impossible),[2,1]); assert.equal(impossible.relaxedBreaks,1);
  const rows=[{paragraph:0,min:0,max:100},{paragraph:0,min:120,max:140},{paragraph:1,min:160,max:180}];
  const oversized=c.planPageRows(rows,60,3);
  assert.deepEqual(sizes(oversized),[1,2]); assert.equal(oversized.relaxedBreaks,1);
  for (const plan of [impossible,oversized]) assert.ok(plan.pages.every(p=>p.end>p.start));
  assert.deepEqual(plain(c.planPageRows([],50,2)),{pages:[],protectedBreaks:0,relaxedBreaks:0});
});

// Exhaustive partition oracle, independent of the editor's backwards planner.
// Penalize each short paragraph edge, then page count; ties fill earlier pages.
function exhaustiveBreaks(rows,depth,minimum) {
  let best=null;
  for (let mask=0;mask<2**(rows.length-1);mask++) {
    const stops=[]; for(let i=0;i<rows.length-1;i++) if(mask&(2**i)) stops.push(i+1); stops.push(rows.length);
    const pages=[]; let start=0,valid=true;
    for(const end of stops) {
      if(end-start>1 && rows[end-1].max-rows[start].min>depth+.01) { valid=false; break; }
      pages.push({start,end}); start=end;
    }
    if(!valid) continue;
    let short=0;
    for(let i=0;i<pages.length-1;i++) {
      const b=pages[i].end; if(rows[b-1].paragraph!==rows[b].paragraph) continue;
      let left=b-1,right=b;
      while(left>pages[i].start&&rows[left-1].paragraph===rows[b].paragraph) left--;
      while(right+1<pages[i+1].end&&rows[right+1].paragraph===rows[b].paragraph) right++;
      if(b-left<minimum) short++; if(right-b+1<minimum) short++;
    }
    const rank=[short,pages.length,...stops.map(n=>-n)];
    if(!best||rank.some((v,i)=>v!==best.rank[i]&&rank.slice(0,i).every((q,j)=>q===best.rank[j])&&v<best.rank[i])) best={rank,stops};
  }
  return best.stops;
}

test('whole-flow pagination agrees with all partitions for mixed paragraphs, variable line heights and guard values', () => {
  const c=fixture(); let seed=415;
  const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
  for(let run=0;run<100;run++) {
    const counts=[]; let remaining=6+random(5);
    while(remaining) {const size=Math.min(remaining,1+random(5));counts.push(size);remaining-=size;}
    const rows=plannerRows(counts); let y=0;
    for(const row of rows) {row.min=y;row.max=y+10+random(15);y=row.max+random(6);}
    const depth=40+random(80),minimum=2+random(5);
    const actual=c.planPageRows(rows,depth,minimum);
    assert.deepEqual(plain(actual.pages.map(p=>p.end)),exhaustiveBreaks(rows,depth,minimum),JSON.stringify({counts,depth,minimum}));
  }
});

test('3k/10k/50k measured-line stress retains every row with linear-sized planning state', t => {
  const c=fixture();
  for(const count of [3000,10000,50000]) {
    const rows=plannerRows([count]); const begin=performance.now(),plan=c.planPageRows(rows,160,3);
    const ms=performance.now()-begin;
    assert.equal(plan.pages[0].start,0); assert.equal(plan.pages.at(-1).end,count); assert.equal(plan.relaxedBreaks,0);
    for(let i=0;i<plan.pages.length;i++) {
      const p=plan.pages[i]; assert.ok(p.end-p.start>=3&&p.end-p.start<=8);
      if(i) assert.equal(p.start,plan.pages[i-1].end);
    }
    t.diagnostic(`${count} measured rows / ${ms.toFixed(1)}ms planner only; synthetic geometry, not glyph measurement, browser input or device performance`);
  }
});

function setup(vertical = false, count = 12) {
  const c = fixture();
  Object.assign(c.params, { fontSize: 20, pageLayout: 'spreads', textMeasure: 8,
    pageDepth: 4, pageGutter: 2, pageGap: 5, vertical });
  c.canvasView = { scale: .75, x: -150, y: 13 };
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / 2), col = i % 2;
    const m = metric(c, vertical ? 900 - row * 30 : 100 + col * 20, vertical ? 100 + col * 20 : 200 + row * 30,
      { width: vertical ? 30 : 20, height: vertical ? 20 : 30, text: String.fromCharCode(65 + i % 26) });
    Object.assign(m.el.dataset, { sourceStart: String(i), sourceEnd: String(i + 1) }); c.metrics.push(m);
  }
  c.measureLayout(); return c;
}

test('horizontal pages pack whole measured rows, pair in reading order and continue downward', () => {
  const c = setup();
  assert.equal(c.pageLayoutState.pages.length, 3);
  assert.deepEqual(c.metrics.map(m => m.pageIndex), [0,0,0,0,1,1,1,1,2,2,2,2]);
  assert.equal(c.metrics[0].relX, 110); assert.equal(c.metrics[0].relY, 215);
  assert.equal(c.metrics[4].relX, 310); assert.equal(c.metrics[4].relY, 215);
  assert.equal(c.metrics[8].relX, 110); assert.equal(c.metrics[8].relY, 395);
  assert.deepEqual(plain(c.pageLayoutState.pages.map(({ start, end, glyphs }) => ({ start, end, glyphs }))), [0,4,8].map(start => ({ start, end: start + 4, glyphs: 4 })));
  const original = c.metrics.map(m => [m.relX, m.relY]); c.measureLayout();
  assert.deepEqual(c.metrics.map(m => [m.relX, m.relY]), original, 'remeasure never accumulates page offsets');
  assert.deepEqual(c.canvasView, { scale: .75, x: -150, y: 13 });
});

test('vertical auto order is right-to-left; explicit LTR reverses page slots without reversing source', () => {
  const c = setup(true);
  const raw = c.metrics.map(m => m.el.textContent);
  assert.ok(c.metrics[0].relX > c.metrics[4].relX);
  assert.ok(c.metrics[0].relX > c.metrics[2].relX, 'columns read right to left');
  assert.ok(c.metrics[1].relY > c.metrics[0].relY, 'glyphs read downward');
  assert.ok(c.metrics[8].relY > c.metrics[0].relY);
  c.params.pageOrder = 'ltr'; c.measureLayout();
  assert.ok(c.metrics[0].relX < c.metrics[4].relX);
  assert.deepEqual(c.metrics.map(m => m.el.textContent), raw);
  assert.deepEqual(c.canvasView, { scale: .75, x: -150, y: 13 });
});

test('continuous and Grid suspend page placement reversibly without deleting effects, locks or source', () => {
  const c = setup(), m = c.metrics[5]; m.locked = true;
  Object.assign(c.operatorState(m, 'rotate'), { toggled: true, current: .5, manual: 30 });
  const saved = plain(c.sparseOperatorState(m)), mapped = c.metrics.map(m => [m.relX,m.relY]);
  for (const grid of [true, false]) {
    c.params.gridEnabled = grid; c.params.pageLayout = grid ? 'spreads' : 'continuous'; c.measureLayout();
    for (const m of c.metrics) {
      assert.equal(m.relX, m.flowX); assert.equal(m.relY, m.flowY); assert.equal(m.pageIndex, null);
      assert.equal(m.el.style.getPropertyValue('--page-x'), '');
    }
    assert.deepEqual(plain(c.sparseOperatorState(m)), saved); assert.equal(m.locked, true);
  }
  c.params.pageLayout = 'spreads'; c.measureLayout();
  assert.deepEqual(c.metrics.map(m => [m.relX,m.relY]), mapped);
  c.params.textMeasure = 0; c.applyTextMeasure(); assert.equal(c.stageWorld.style.inlineSize, '32em');
  assert.equal(c.params.textMeasure, 0, 'effective default does not overwrite user setting');
  c.params.pageLayout = 'continuous'; c.applyTextMeasure(); assert.equal(c.stageWorld.style.inlineSize, '');
});

test('Current and paragraph Reading use page fragments, while document Reading retains whole composition', () => {
  const c = setup();
  assert.equal(c.metrics[0].currentFrame, c.metrics[3].currentFrame);
  assert.notEqual(c.metrics[0].currentFrame, c.metrics[4].currentFrame);
  assert.equal(c.metrics[0].currentFrame.lineCount, 2);
  assert.notEqual(c.metrics[0].readingParagraphFrame, c.metrics[4].readingParagraphFrame);
  assert.equal(c.metrics[0].readingDocumentFrame, c.metrics[11].readingDocumentFrame);
  for (const m of c.metrics) c.operatorState(m, 'paragraphCurrent').current = 1;
  c.measureLayout();
  assert.equal(c.metrics[0].el.style.getPropertyValue('--op-current-y'), c.metrics[4].el.style.getPropertyValue('--op-current-y'));
  c.params.pageLayout = 'continuous'; c.measureLayout();
  assert.equal(c.metrics[0].currentFrame, c.metrics[11].currentFrame);
});

test('snapshot and selection carry page translation once, including independent effect translation and rotation', () => {
  const c = setup(), m = c.metrics[5];
  m.el.style.setProperty('--op-baseline-y', '10em'); m.el.style.setProperty('--op-rotate', '12deg');
  const g = c.snapshotGlyphs(true)[5];
  assert.equal(g.x, m.relX - m.w / 2); assert.equal(g.y, m.relY - m.h / 2);
  assert.equal(g.ty, 200); assert.equal(g.rot, 12);
  assert.equal(c.findNearestLetter(m.relX, m.relY + 200), m);
  assert.equal(g.ox, m.relX); assert.equal(g.oy, m.relY + m.h / 4);
  assert.equal(c.snapshotGlyphs(true).length, c.metrics.length);
  assert.match(html, /translateX\(var\(--page-x\)\) translateY\(var\(--page-y\)\)/);
});

test('wide unsplittable words and oversized rows are not cropped; explicit source paragraphs stay separate', () => {
  const c = setup(false, 0);
  c.metrics = [metric(c, 20, 0, { width: 500, height: 100, paragraph: 0 }), metric(c, 20, 150, { paragraph: 2 })];
  c.measureLayout();
  assert.equal(c.pageLayoutState.pages.length, 2); assert.equal(c.pageLayoutState.oversized, 1);
  assert.equal(c.metrics[1].relX - c.metrics[0].relX, 300, 'next page uses oversized inline extent, not a clip');
  assert.notEqual(c.metrics[0].currentFrame, c.metrics[1].currentFrame);
  assert.equal(c.snapshotGlyphs(true)[0].w, 500);
});

test('page/spread capture uses settled source bounds, refuses invalid/IME targets and never applies an effect', () => {
  const c = setup(), controls = {};
  for (const id of ['pLayoutTargetUnit','pLayoutTargetNumber','pSourceScope']) controls[id] = { value: '', focus() { c.focused = id; } };
  c.document.getElementById = id => controls[id] || null;
  c.flushPendingTextRebuild = () => { c.flushed = true; };
  c.updateApplicationSummary = () => { c.summaryUpdated = true; };
  c.openSourceTargetSection = s => { c.section = s; };
  c.textComposing = false;
  vm.runInContext(extract('captureLayoutTarget'), c);
  controls.pLayoutTargetUnit.value = 'page'; controls.pLayoutTargetNumber.value = '2';
  assert.equal(c.captureLayoutTarget(), true);
  assert.deepEqual(plain(c.sourceTarget), { mode: 'range', start: 4, end: 8, valid: true });
  assert.equal(c.section, 'apply'); assert.equal(c.focused, 'pSourceScope'); assert.equal(c.flushed, true);
  controls.pLayoutTargetUnit.value = 'spread'; controls.pLayoutTargetNumber.value = '2';
  assert.equal(c.captureLayoutTarget(), true); assert.equal(c.sourceTarget.end, 12);
  const before = plain(c.sourceTarget);
  for (const value of ['0','-1','1.5','9','','NaN']) {
    controls.pLayoutTargetNumber.value = value; assert.equal(c.captureLayoutTarget(), false); assert.deepEqual(plain(c.sourceTarget), before);
  }
  controls.pLayoutTargetNumber.value = '1'; c.textComposing = true; assert.equal(c.captureLayoutTarget(), false);
  assert.deepEqual(plain(c.sourceTarget), before);
  assert.ok(c.metrics.every(m => Object.values(m.operatorStates).every(s => !s.toggled && s.current === 0)));
});

test('3k/10k/50k pagination measures all glyphs and preserves sparse states', t => {
  for (const count of [3000,10000,50000]) {
    const c = fixture(); Object.assign(c.params, { pageLayout: 'spreads', fontSize: 20, pageDepth: 40, textMeasure: 32 });
    c.metrics = Array.from({ length: count }, (_, i) => {
      const m = metric(c, (i % 32) * 20, Math.floor(i / 32) * 30, { paragraph: Math.floor(i / 997), text: '字' });
      Object.assign(m.el.dataset, { sourceStart: String(i), sourceEnd: String(i + 1) }); return m;
    });
    const start = performance.now(); c.measureLayout(); const ms = performance.now() - start;
    assert.equal(c.pageLayoutState.pages.reduce((n,p) => n+p.glyphs, 0), count);
    assert.equal(c.pageLayoutState.pages.at(-1).end, count);
    assert.ok(c.metrics.every(m => Number.isFinite(m.relX) && Number.isFinite(m.relY) && Object.keys(m.operatorStates).length === 1));
    t.diagnostic(`${count} glyphs, ${c.pageLayoutState.pages.length} pages, ${ms.toFixed(1)}ms actual measurement+page+frames / synthetic DOM; not browser or device performance`);
  }
});

test('layout UI keeps invalid target numbers explicit, suspends under Grid and disables capture during IME', () => {
  const c = setup(), controls = {};
  for (const id of ['pageLayoutStatus','pPageLayout','pPageOrder','pageLayoutOptions','pPageGutter','pPageKeepLines',
    'pLayoutTargetUnit','pLayoutTargetNumber','btnUseLayoutTarget']) controls[id] = { value: '', textContent: '', disabled: false, hidden: false };
  controls.pLayoutTargetUnit.value = 'page'; controls.pLayoutTargetNumber.value = '2';
  c.document.getElementById = id => controls[id] || null; c.textComposing = false;
  c.updatePageLayoutUI();
  assert.equal(controls.pageLayoutOptions.hidden, false); assert.equal(controls.btnUseLayoutTarget.disabled, false);
  assert.equal(controls.pLayoutTargetNumber.max, '3'); assert.match(controls.pageLayoutStatus.textContent, /3ページ/);
  controls.pLayoutTargetNumber.value = '20'; c.updatePageLayoutUI();
  assert.equal(controls.pLayoutTargetNumber.value, '20'); assert.equal(controls.btnUseLayoutTarget.disabled, true);
  controls.pLayoutTargetNumber.value = '1'; c.textComposing = true; c.updatePageLayoutUI();
  assert.equal(controls.btnUseLayoutTarget.disabled, true);
  c.textComposing = false; c.params.gridEnabled = true; c.updatePageLayoutUI();
  assert.equal(controls.btnUseLayoutTarget.disabled, true); assert.match(controls.pageLayoutStatus.textContent, /一時無効/);
  assert.equal(c.params.pageLayout, 'spreads');
  c.params.gridEnabled = false; c.params.pageLayout = 'continuous'; c.updatePageLayoutUI();
  assert.equal(controls.pageLayoutOptions.hidden, true); assert.match(controls.pageLayoutStatus.textContent, /連続/);
  c.params.pageLayout='spreads';c.params.pageKeepLines=6;c.measureLayout();
  assert.match(controls.pageLayoutStatus.textContent,/行保護できない分割 2箇所/);
  c.params.gridEnabled=true;c.updatePageLayoutUI();assert.equal(controls.pPageKeepLines.disabled,true);
  c.params.gridEnabled=false;c.params.pageDepth=10;c.measureLayout();
  assert.equal(controls.pPageKeepLines.disabled,false);assert.doesNotMatch(controls.pageLayoutStatus.textContent,/行保護できない/);
});

test('source page lookup respects UTF-16 spans, exclusive ends, whitespace, empty paragraphs and reversed token order', () => {
  const c = setup(false, 0);
  // A + a surrogate pair + combining glyph; a blank paragraph; a joining word.
  const spans = [
    { start:0, end:1, paragraph:0, page:0 }, { start:1, end:3, paragraph:0, page:1 },
    { start:3, end:5, paragraph:0, page:1 }, { start:9, end:16, paragraph:2, page:2 }
  ];
  const paragraphs = [{start:0,end:6},{start:7,end:7},{start:8,end:17},{start:18,end:18}];
  const items = [...spans].reverse().map(s => ({ pageIndex:s.page, el:{dataset:{sourceStart:s.start,sourceEnd:s.end,line:s.paragraph}} }));
  items.push({ pageIndex:null, el:{dataset:{sourceStart:17,sourceEnd:18,line:3}} });
  const index = c.buildPageSourceIndex(items); assert.deepEqual(plain(index), spans);
  const at = (s,e=s) => plain(c.sourcePageContext(index, paragraphs, s,e));
  for (const [s,e,page] of [[0,0,0],[0,1,0],[1,1,1],[2,2,1],[4,5,1],[6,6,1],[8,8,2],[12,13,2],[17,17,2]])
    assert.deepEqual(at(s,e), {first:page,last:page});
  assert.deepEqual(at(0,9), {first:0,last:1}, 'next paragraph starts before its first glyph; end remains exclusive');
  assert.deepEqual(at(0,10), {first:0,last:2});
  for (const [s,e] of [[5,6],[7,7],[7,9],[18,18],[19,19],[-1,0],[2,1],[1.5,2]]) assert.equal(at(s,e), null);
  assert.equal(c.sourcePageContext([], paragraphs, 0,0), null);
  assert.equal(c.sourcePageContext(index, [], 0,0), null);
});

function withSelectionUI(c) {
  const controls = {};
  for (const id of ['sourceLayoutTarget','sourceLayoutLocation','canvasLayoutLocation',
    'btnUseSourcePages','btnUseSourceSpreads','btnUseCanvasPage','btnUseCanvasSpread','pSourceScope'])
    controls[id] = { disabled:false, hidden:false, textContent:'', focus() { c.focused=id; } };
  c.document.getElementById = id => controls[id] || null;
  c.textInput = { value:'ABCDEFGHIJKL', selectionStart:5, selectionEnd:5 };
  c.renderedSourceText = c.textInput.value; c.sourceParagraphs = [{ start:0,end:12 }];
  c.textComposing = false; c.selectedM = c.metrics[10];
  c.flushPendingTextRebuild = () => {};
  c.openSourceTargetSection = section => { c.section=section; };
  c.updateApplicationSummary = () => {};
  c.sourceTarget = {mode:'all',start:0,end:0,valid:false};
  return controls;
}

test('source and canvas page controls expose separate contexts, capture only on request and preserve camera/effects', () => {
  const c = setup(), controls = withSelectionUI(c);
  const camera = plain(c.canvasView), before = c.metrics.map(m => plain(c.sparseOperatorState(m)));
  c.updateLayoutSelectionUI();
  assert.equal(controls.sourceLayoutLocation.textContent, '原文の入力位置：ページ 2 / 見開き 1');
  assert.match(controls.canvasLayoutLocation.textContent, /ページ 3 \/ 見開き 2/);
  assert.equal(c.sourceTarget.mode, 'all');
  assert.equal(c.captureSourceLayoutTarget('page'), true);
  assert.deepEqual(plain(c.sourceTarget), {mode:'range',start:4,end:8,valid:true});
  assert.equal(c.captureCanvasLayoutTarget('spread'), true);
  assert.deepEqual(plain(c.sourceTarget), {mode:'range',start:8,end:12,valid:true});
  c.textInput.selectionStart=3; c.textInput.selectionEnd=5; c.updateLayoutSelectionUI();
  assert.match(controls.sourceLayoutLocation.textContent, /原文の選択：ページ 1–2/);
  assert.equal(controls.btnUseSourcePages.textContent, '選択を含むページを対象に');
  assert.equal(c.captureSourceLayoutTarget('page'), true); assert.equal(c.sourceTarget.start,0); assert.equal(c.sourceTarget.end,8);
  assert.equal(c.focused,'pSourceScope'); assert.equal(c.section,'apply');
  assert.deepEqual(c.metrics.map(m => plain(c.sparseOperatorState(m))),before);
  assert.deepEqual(plain(c.canvasView),camera);
  const saved = plain(c.sourceTarget); c.selectedM={pageIndex:0};
  assert.equal(c.captureCanvasLayoutTarget('page'),false, 'detached selections cannot retarget');
  assert.equal(c.captureSourceLayoutTarget('invalid'),false); assert.deepEqual(plain(c.sourceTarget),saved);
});

test('pending reflow, IME, Grid and empty text disable page controls without silently changing the target', () => {
  const c = setup(), controls = withSelectionUI(c);
  assert.equal(c.captureSourceLayoutTarget('page'),true); const target = plain(c.sourceTarget);
  for (const state of ['dirty','draft','ime','grid','continuous']) {
    c.metricsDirty=state==='dirty'; c.textComposing=state==='ime'; c.params.gridEnabled=state==='grid';
    c.params.pageLayout=state==='continuous'?'continuous':'spreads';
    c.textInput.value=state==='draft'?'未確定の新しい原文':c.renderedSourceText;
    c.updateLayoutSelectionUI();
    for (const id of ['btnUseSourcePages','btnUseSourceSpreads','btnUseCanvasPage','btnUseCanvasSpread']) assert.equal(controls[id].disabled,true,state+id);
    assert.deepEqual(plain(c.sourceTarget),target);
    if (state==='ime') { assert.equal(c.captureSourceLayoutTarget('page'),false); assert.equal(c.captureCanvasLayoutTarget('page'),false); }
  }
  c.params.pageLayout='spreads'; c.params.gridEnabled=false; c.textComposing=false;
  c.textInput.value=c.renderedSourceText; c.metricsDirty=true;
  const measure=c.measureLayout; let measured=0;
  c.measureLayout=() => { measured++; measure(); };
  c.params.pageDepth=6;
  assert.equal(c.captureSourceLayoutTarget('page'),true); assert.equal(measured,1,'capture remeasures before using stale page indices');
  assert.equal(c.sourceTarget.start,0); assert.equal(c.sourceTarget.end,8,'current layout, not previous four-glyph page');
  // Exercise the real early frame branch after clearing all text.
  c.metrics=[]; c.textInput.value=''; c.renderedSourceText=''; c.sourceParagraphs=[{start:0,end:0}]; c.metricsDirty=true; c.raf=9;
  vm.runInContext(extract('update'),c); c.update();
  assert.equal(c.raf,null); assert.equal(c.metricsDirty,false); assert.equal(c.pageSourceIndex.length,0); assert.equal(c.pageLayoutState.pages.length,0);
  assert.equal(controls.btnUseSourcePages.disabled,true); assert.match(controls.sourceLayoutLocation.textContent,/配置された文字がありません/);
  const calls=measured; c.update(); assert.equal(measured,calls,'empty idle frames do not continually measure');
});
