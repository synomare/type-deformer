// Native output from the real page/frame/map/draw functions. The supplied
// line boxes use native font widths and synthetic wrapping, not browser CSS.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { exportFixture, canvas, authoredSource } from './export-fixture.mjs';
import { setMeasuredPageSource } from './page-layout-fixture.mjs';
const [beforePath,outputPath]=process.argv.slice(2);
assert.ok(beforePath&&outputPath,'Usage: node scripts/render-reading-spreads.mjs saved-before.html output-directory');
const beforeHTML=fs.readFileSync(beforePath,'utf8'),out=path.resolve(outputPath);fs.mkdirSync(out,{recursive:true});
const from=(src,name)=>src.match(new RegExp('      function '+name+'\\([^]*?\\n      }'))[0];
const ja='窓を開くと、遠くの雨の音が聞こえた。読み終えたはずの文章が、余白を隔ててもう一度現れる。声の強さではなく、そのあいだにある距離を記しておく。頁をめくる前とあとで、同じ言葉の重さは少しだけ違っている。';
const en='The page holds two voices. One stays close enough to read; the other gathers along the edge. Nothing has been erased. The same sentence becomes a foreground, a border, or a distant texture. A place to pause is repeated without forcing every passage to sound alike. ';
const studies=[
  {name:'horizontal-spreads',source:Array(12).fill(ja).join('\n'),vertical:false,old:'document',scope:'spread',size:20,measure:24,depth:15},
  {name:'vertical-spreads',source:Array(10).fill(ja).join('\n'),vertical:true,old:'document',scope:'spread',size:20,measure:24,depth:15},
  {name:'editorial-pages',source:Array(8).fill(en).join('\n\n'),vertical:false,old:'paragraph',scope:'page',size:20,measure:28,depth:16}
];
const records=[];
for(const study of studies) {
  const make=(scope,legacy=false)=>{
    const {c}=exportFixture();
    Object.assign(c.params,{fontSize:study.size,fontFamily:study.name==='editorial-pages'?'"Times New Roman"':'"Yu Mincho"',
      lineHeight:1.5,textMeasure:study.measure,pageLayout:'spreads',pageDepth:study.depth,pageKeepLines:2,
      pageGutter:4,pageGap:5,paragraphGap:.55,vertical:study.vertical,readingScope:scope,readingPressure:2.4,
      readingWidth:study.vertical?.65:.38,readingHeight:study.vertical?.38:.65,
      readingFocusU:study.vertical?.5:.23,readingFocusV:study.vertical?.77:.5,readingFeather:.1,artboard:'auto'});
    if(legacy) vm.runInContext(['applyPageLayout','buildReadingFieldFrames','applyReadingFieldVisual'].map(n=>from(beforeHTML,n)).join('\n'),c);
    setMeasuredPageSource(c,study.source,null,{paragraphSpacing:true});
    for(const m of c.metrics) { m.currentIntensity=0;m.toggled=false;Object.assign(c.operatorState(m, 'readingField'),{current:1,toggled:true}); }
    c.measureLayout();return c;
  };
  const before=make(study.old,true),same=make(study.old),after=make(study.scope);
  const states=[before,after].map(c=>{const glyphs=c.snapshotGlyphs(true);return {c,glyphs,bounds:c.contentBounds(glyphs,0)};});
  const L={s:1,dx:90-Math.min(...states.map(s=>s.bounds.x)),dy:120-Math.min(...states.map(s=>s.bounds.y))};
  const w=1600,h=1800;
  const ink=(c)=>{const surface=canvas.createCanvas(w,h),ctx=surface.getContext('2d');ctx.fillStyle='#f4f3ef';ctx.fillRect(0,0,w,h);
    c.drawGlyphs(ctx,c.snapshotGlyphs(true),1,L,c.fontMetrics(),false);return surface;};
  const surfaces=[ink(before),ink(after)];
  assert.deepEqual(ink(same).toBuffer('image/png'),surfaces[0].toBuffer('image/png'),'old scope ink is exactly unchanged');
  assert.notDeepEqual(surfaces[0].toBuffer('image/png'),surfaces[1].toBuffer('image/png'));
  for(let i=0;i<2;i++) {
    const {c,bounds}=states[i],label=i?'B-layout-scope':'A-original-scope',name=study.name+'-'+label;
    assert.ok(bounds.x+L.dx>=0&&bounds.y+L.dy>=0&&bounds.x+bounds.w+L.dx<w&&bounds.y+bounds.h+L.dy<h,'whole artwork inside identical viewport');
    const ctx=surfaces[i].getContext('2d');ctx.fillStyle='#41474b';ctx.font='18px Arial';ctx.fillText(`${study.name} / ${label} / ${c.params.readingScope}`,40,38);
    ctx.font='12px Arial';ctx.fillText('Same source, font, size, pressure, focus ratios and viewport. Only scope changes.',40,62);
    ctx.fillText('OFFLINE: native type + synthetic line boxes. Not CSS/browser/iPhone evidence.',40,82);
    fs.writeFileSync(path.join(out,name+'.png'),surfaces[i].toBuffer('image/png'));
    c.renderedSourceText=study.source;c.cloneBatchProfiles=()=>({});c.cloneLookMemory=()=>({slots:[]});
    vm.runInContext(from(i?authoredSource:beforeHTML,'projectData')+'\n'+from(authoredSource,'letterState'),c);
    fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(c.projectData()));
    records.push({name,scope:c.params.readingScope,pages:c.pageLayoutState.pages.length,glyphs:c.metrics.length,viewport:L,
      unchangedLegacyInk:true,sourceHash:createHash('sha256').update(study.source).digest('hex')});
  }
  for(const order of ['AB','BA']) {const pair=canvas.createCanvas(2*w,h),ctx=pair.getContext('2d');
    ctx.drawImage(surfaces[order==='AB'?0:1],0,0);ctx.drawImage(surfaces[order==='AB'?1:0],w,0);
    fs.writeFileSync(path.join(out,study.name+'-'+order+'.png'),pair.toBuffer('image/png'));}
}
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({beforeSha256:createHash('sha256').update(beforeHTML).digest('hex'),
  afterSha256:createHash('sha256').update(authoredSource).digest('hex'),records,
  limitations:['Synthetic text layout; native font rendering.','No actual browser, mobile, Compose UI, font loading or download interaction.','System fonts are used privately and not redistributed.']},null,2));
console.log(out);
