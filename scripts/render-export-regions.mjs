// Real output handlers; native installed fonts and synthetic line wrapping.
// This is export evidence, not browser screenshots or a mobile interaction test.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {exportFixture,canvas,authoredSource} from './export-fixture.mjs';
import {extract} from './paragraph-current-fixture.mjs';
import {setMeasuredPageSource} from './page-layout-fixture.mjs';
const out=path.resolve(process.argv[2]||'');assert.ok(process.argv[2],'Pass an evidence directory outside the repo');fs.mkdirSync(out,{recursive:true});
const ja='窓を開くと、遠くの雨の音が聞こえた。読み終えたはずの文章が、余白を隔ててもう一度現れる。声の強さではなく、そのあいだにある距離を記しておく。頁をめくる前とあとで、同じ言葉の重さは少しだけ違っている。';
const en='The page holds two voices. One stays close enough to read; the other gathers along the edge. Nothing has been erased. The same sentence becomes a foreground, a border, or a distant texture. A place to pause is repeated without forcing every passage to sound alike.';
const records=[];
for(const [name,source,vertical] of [['horizontal',Array(8).fill(ja).join('\n'),false],['vertical',Array(8).fill(ja).join('\n'),true],['mixed',Array(4).fill(en+'\n'+ja).join('\n'),false]]){
  const env=exportFixture(),c=env.c;
  Object.assign(c.params,{fontSize:20,lineHeight:1.5,textMeasure:24,pageLayout:'spreads',pageDepth:16,pageGutter:3,pageGap:5,
    pageKeepLines:2,paragraphGap:.8,vertical,artboard:'auto',exportScale:1,readingScope:'spread',readingPressure:1.8,
    readingFocusU:.28,readingFocusV:.5,readingWidth:.48,readingHeight:.75,readingFeather:.12,currentBend:1.8,currentFlow:'crest'});
  setMeasuredPageSource(c,source,null,{paragraphSpacing:true});
  for(const m of c.metrics){Object.assign(c.operatorState(m, 'readingField'),{toggled:true,current:1});
    if(Number(m.el.dataset.line)%2)Object.assign(c.operatorState(m, 'paragraphCurrent'),{toggled:true,current:.7});}
  c.measureLayout();
  const sheet=canvas.createCanvas(1440,1000),ctx=sheet.getContext('2d');ctx.fillStyle='#deded8';ctx.fillRect(0,0,sheet.width,sheet.height);
  ctx.fillStyle='#262626';ctx.font='23px Arial';ctx.fillText(name+' / one artwork, three output windows',30,38);
  ctx.font='14px Arial';ctx.fillText('Native output + synthetic layout; not CSS/browser/iPhone. Same source, font, effects and phase.',30,64);
  let col=0;
  for(const [kind,number,label] of [['work',1,'A - full artwork'],['spread',2,'B - body spread 2'],['page',3,'C - body page 3']]){
    c.params.exportRegion=kind;c.params.exportRegionNumber=number;const output=c.renderCanvas(1);
    fs.writeFileSync(path.join(out,name+'-'+kind+'.png'),output.toBuffer('image/png'));
    const scale=Math.min(430/output.width,820/output.height);ctx.drawImage(output,col*480+25,125,output.width*scale,output.height*scale);
    ctx.fillStyle='#262626';ctx.font='17px Arial';ctx.fillText(label,col*480+25,104);
    ctx.font='13px Arial';ctx.fillText(`${output.width} x ${output.height} px`,col*480+25,971);
    records.push({name,kind,number,frame:c.exportRegionState().frame,pages:c.pageLayoutState.pages.length,width:output.width,height:output.height});col++;
  }
  c.params.exportRegion='spread';c.params.exportRegionNumber=2;
  c.cloneBatchProfiles=()=>({});c.cloneLookMemory=()=>({slots:[]});
  vm.runInContext(extract('projectData')+'\n'+extract('letterState'),c);
  fs.writeFileSync(path.join(out,name+'-project.json'),JSON.stringify(c.projectData()));
  fs.writeFileSync(path.join(out,name+'-windows.png'),sheet.toBuffer('image/png'));
}
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({sourceSha256:createHash('sha256').update(authoredSource).digest('hex'),records,
  limitations:['Native font metrics with synthetic wrapping, not browser CSS.','No live desktop/mobile/real iPhone or OS download test.','Surface resolution limit is not changed by cropping.','Installed system fonts used privately; no font/reference assets redistributed.']},null,2));
console.log(out);
