// Before/after evidence from a saved source snapshot. Native Canvas with
// explicitly synthetic wrapping: not browser CSS, a UI screenshot or iPhone QA.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { exportFixture, canvas, authoredSource } from './export-fixture.mjs';
import { extract } from './paragraph-current-fixture.mjs';
import { setMeasuredPageSource } from './page-layout-fixture.mjs';

const [beforePath, outputPath] = process.argv.slice(2);
assert.ok(beforePath && outputPath, 'Usage: node scripts/render-page-breaks.mjs saved-before.html output-directory');
const beforeHTML = fs.readFileSync(beforePath, 'utf8');
const beforeMap = beforeHTML.match(/      function applyPageLayout\([^]*?\n      }/)?.[0];
assert.ok(beforeMap, 'saved pre-change mapper is required');
const out = path.resolve(outputPath); fs.mkdirSync(out, { recursive: true });
const plain = v => JSON.parse(JSON.stringify(v));
const passage = '窓を開くと、遠くの雨の音が聞こえた。読み終えたはずの文章が、余白を隔ててもう一度現れる。声の強さではなく、そのあいだにある距離を記しておく。頁をめくる前とあとで、同じ言葉の重さは少しだけ違っている。';
const prose = '余白の往復\n' + Array(5).fill(passage).join('\n\n');
const studies = [
  {name:'horizontal-prose', source:prose, vertical:false, depth:12, keep:2},
  {name:'vertical-prose', source:prose, vertical:true, depth:12, keep:2},
  {name:'nine-line-paragraph', source:'言葉は余白を隔てて次の頁へ進む。'.repeat(16).slice(0,216), vertical:false, depth:6, keep:3}
];
const records=[];
for (const study of studies) {
  const base = {fontSize:20,fontFamily:'"Yu Mincho"',lineHeight:1.5,textMeasure:24,
    pageLayout:'spreads',pageDepth:study.depth,pageKeepLines:study.keep,pageGutter:6,pageGap:6,pageOrder:'auto',vertical:study.vertical};
  const make = (legacy=false, off=false) => {
    const {c}=exportFixture(); Object.assign(c.params,base);
    if(legacy) vm.runInContext(beforeMap,c);
    if(legacy||off) c.params.pageKeepLines=1;
    setMeasuredPageSource(c,study.source); return c;
  };
  const before=make(true), after=make(), off=make(false,true);
  const positions=c=>c.metrics.map(m=>[m.relX,m.relY,m.pageIndex]);
  assert.deepEqual(positions(off),positions(before),'OFF preserves every old glyph position/page');
  assert.notDeepEqual(positions(after),positions(before),'study must actually change page breaks');
  assert.equal(after.pageLayoutState.relaxedBreaks,0,'these studies must satisfy the requested guard');
  const renders=[];
  for (const [label,c] of [['A-before',before],['B-protected',after]]) {
    const surface=canvas.createCanvas(1360,2000),ctx=surface.getContext('2d');
    ctx.fillStyle='#f4f3ef';ctx.fillRect(0,0,surface.width,surface.height);
    const minX=Math.min(...c.metrics.map(m=>m.flowX-m.w/2)),minY=Math.min(...c.metrics.map(m=>m.flowY-m.h/2));
    const viewport={dx:90-minX,dy:140-minY,s:1},glyphs=c.snapshotGlyphs(true),bounds=c.contentBounds(glyphs,0);
    assert.ok(bounds.x+viewport.dx>=0&&bounds.y+viewport.dy>=0&&bounds.x+bounds.w+viewport.dx<=surface.width&&bounds.y+bounds.h+viewport.dy<=surface.height,'every glyph in fixed viewport');
    c.drawGlyphs(ctx,glyphs,1,viewport,c.fontMetrics(),false);
    ctx.fillStyle='#41474b';ctx.font='18px Arial';ctx.fillText(`${study.name} / ${label} / keep ${c.params.pageKeepLines}`,48,40);
    ctx.font='12px Arial';ctx.fillText('OFFLINE: identical text, font, scale and viewport / native glyphs, synthetic wrapping',48,67);
    ctx.fillText('Original source retained. No clipping or automatic zoom. Not browser or iPhone evidence.',48,87);
    const name=study.name+'-'+label;
    fs.writeFileSync(path.join(out,name+'.png'),surface.toBuffer('image/png'));renders.push(surface);
    c.renderedSourceText=study.source;c.cloneBatchProfiles=()=>({});c.cloneLookMemory=()=>({slots:[]});
    for(const m of c.metrics) {m.currentIntensity=0;m.toggled=false;}
    vm.runInContext(extract('projectData')+'\n'+extract('letterState'),c);
    fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(c.projectData()));
    const fragments=new Map();
    for(const m of c.metrics) fragments.set(m.currentFrame,{page:m.pageIndex,paragraph:Number(m.el.dataset.line),lines:m.currentFrame.lineCount});
    records.push({name,source:study.source,params:plain(c.params),state:plain(c.pageLayoutState),glyphs:c.metrics.length,
      viewport,fragments:[...fragments.values()],pages:c.metrics.map(m=>m.pageIndex),offMatchesBefore:true});
  }
  const pair=canvas.createCanvas(2720,2000),ctx=pair.getContext('2d');
  ctx.drawImage(renders[0],0,0);ctx.drawImage(renders[1],1360,0);
  fs.writeFileSync(path.join(out,study.name+'-AB.png'),pair.toBuffer('image/png'));
}
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({
  beforeSha256:createHash('sha256').update(beforeHTML).digest('hex'),
  afterSha256:createHash('sha256').update(authoredSource).digest('hex'),
  limitations:['Native system font for private verification only; no redistribution.','Synthetic wrapping is not browser Japanese typesetting.','No UI, console, performance or real-device acceptance implied.'],records
},null,2));
console.log(out);
