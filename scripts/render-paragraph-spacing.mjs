// Same-condition source/output comparison, not a browser screenshot. Native
// font widths and an explicit em-spacing/wrap model supply the measured boxes.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { exportFixture, canvas, authoredSource } from './export-fixture.mjs';
import { extract } from './paragraph-current-fixture.mjs';
import { setMeasuredPageSource } from './page-layout-fixture.mjs';

const [beforePath, outputPath] = process.argv.slice(2);
assert.ok(beforePath && outputPath,'Usage: node scripts/render-paragraph-spacing.mjs saved-before.html output-directory');
const beforeHTML=fs.readFileSync(beforePath,'utf8'), out=path.resolve(outputPath);
assert.ok(beforeHTML.includes('.stage p { margin: 0 0 0.55em; }'),'baseline must have the original fixed gap');
fs.mkdirSync(out,{recursive:true});
const from=(source,name)=>source.match(new RegExp('      function '+name+'\\([^]*?\\n      }'))[0];
const source='余白の往復\n窓を開くと、遠くの雨の音が聞こえた。読み終えたはずの文章が、余白を隔ててもう一度現れる。声の強さではなく、そのあいだにある距離を記しておく。\n頁をめくる前とあとで、同じ言葉の重さは少しだけ違っている。 The page remains open. A pause is not an absence.\n\n何も書かれていない場所にも、前の段落から届く気配が残る。読む速さを一定にせず、次の言葉へ向かう時間を余白で選ぶ。\n最後の行を読み終えても、まだ窓は開いている。';
const studies=[
  {name:'continuous-tight',pageLayout:'continuous',vertical:false,gap:0,effect:null},
  {name:'spreads-open',pageLayout:'spreads',vertical:false,gap:2.5,effect:null},
  {name:'vertical-current',pageLayout:'spreads',vertical:true,gap:2.5,effect:'paragraphCurrent'}
];
const records=[];
for(const study of studies) {
  const make=(gap,legacy=false)=>{
    const {c}=exportFixture();
    Object.assign(c.params,{fontSize:20,lineHeight:1.5,textMeasure:24,pageLayout:study.pageLayout,pageDepth:16,
      pageKeepLines:2,pageGutter:5,pageGap:5,pageOrder:'auto',vertical:study.vertical,paragraphGap:gap,
      currentBend:1.25,currentSpread:.25,artboard:'auto'});
    if(legacy) vm.runInContext(from(beforeHTML,'applyPageLayout'),c);
    setMeasuredPageSource(c,source,null,{paragraphSpacing:true});
    for(const m of c.metrics) {
      m.currentIntensity=0;m.toggled=false;
      if(study.effect) Object.assign(c.operatorState(m, study.effect),{current:1,toggled:true});
    }
    c.measureLayout(); return c;
  };
  const before=make(.55,true),unchanged=make(.55),after=make(study.gap);
  const coordinates=c=>c.metrics.map(m=>[m.relX,m.relY,m.pageIndex]);
  assert.deepEqual(coordinates(unchanged),coordinates(before),'original gap is position-compatible in the supplied model');
  assert.notDeepEqual(coordinates(after),coordinates(before));
  const frames=[before,after].map(c=>{const glyphs=c.snapshotGlyphs(true);return {c,glyphs,bounds:c.contentBounds(glyphs,0)};});
  const viewport={s:1,dx:100-Math.min(...frames.map(f=>f.bounds.x)),dy:150-Math.min(...frames.map(f=>f.bounds.y))};
  const surfaces=[];
  for(let i=0;i<frames.length;i++) {
    const {c,glyphs,bounds}=frames[i], label=i?'B-adjustable':'A-fixed';
    const surface=canvas.createCanvas(1600,1800),ctx=surface.getContext('2d');
    assert.ok(bounds.x+viewport.dx>=0&&bounds.y+viewport.dy>=0&&bounds.x+bounds.w+viewport.dx<=1600&&bounds.y+bounds.h+viewport.dy<=1800,'all glyphs inside the shared fixed viewport');
    ctx.fillStyle='#f4f3ef';ctx.fillRect(0,0,1600,1800);
    c.drawGlyphs(ctx,glyphs,1,viewport,c.fontMetrics(),false);
    ctx.fillStyle='#41474b';ctx.font='18px Arial';ctx.fillText(`${study.name} / ${label} / paragraph ${c.params.paragraphGap}em`,48,40);
    ctx.font='12px Arial';ctx.fillText('OFFLINE: identical source, font, size, leading, effect and viewport. Only paragraph spacing differs.',48,66);
    ctx.fillText('Native glyphs + synthetic wrap/spacing; not CSS layout, UI, browser or iPhone proof.',48,86);
    const name=study.name+'-'+label;fs.writeFileSync(path.join(out,name+'.png'),surface.toBuffer('image/png'));
    surfaces.push(surface);
    c.renderedSourceText=source;c.cloneBatchProfiles=()=>({});c.cloneLookMemory=()=>({slots:[]});
    vm.runInContext(from(i?authoredSource:beforeHTML,'projectData')+'\n'+extract('letterState'),c);
    const project=JSON.parse(JSON.stringify(c.projectData()));if(!i) delete project.params.paragraphGap;
    fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(project));
    records.push({name,gap:c.params.paragraphGap,glyphs:glyphs.length,pages:c.pageLayoutState.pages.length,viewport,
      originalGapMatches:true,sourceHash:createHash('sha256').update(source).digest('hex')});
  }
  for(const order of ['AB','BA']) {
    const pair=canvas.createCanvas(3200,1800),ctx=pair.getContext('2d');
    ctx.drawImage(surfaces[order==='AB'?0:1],0,0);ctx.drawImage(surfaces[order==='AB'?1:0],1600,0);
    fs.writeFileSync(path.join(out,study.name+'-'+order+'.png'),pair.toBuffer('image/png'));
  }
}
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({beforeSha256:createHash('sha256').update(beforeHTML).digest('hex'),
  afterSha256:createHash('sha256').update(authoredSource).digest('hex'),records,
  limitations:['Synthetic spacing and wrapping do not execute browser CSS.','Private local system font only; font file is not redistributed.','No mobile, live preview or output-download UI acceptance.']},null,2));
console.log(out);
