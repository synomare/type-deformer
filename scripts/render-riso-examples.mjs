// Saved examples plus isolated native FX; project loading is not browser-tested.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { canvas, fixture, textMask, authoredSource } from './riso-fixture.mjs';
import { exportFixture } from './export-fixture.mjs';
const directory=process.argv[2];if(!directory)throw Error('Pass an output directory');
fs.mkdirSync(directory,{recursive:true});
const extract=name=>authoredSource.match(new RegExp('^      function '+name+'\\([^]*?^      }','m'))[0];
const specs=[
  {id:'fine-ink',text:'B&O',size:250,font:'Times New Roman',pitch:2.5,depth:26,register:2},
  {id:'small-print',text:'BOUND',size:45,font:'Arial',pitch:1.5,depth:24,register:.5},
  {id:'open-screen',text:'Aa',size:280,font:'Arial',pitch:16,depth:42,register:0}
];
const manifest=[];
for(const spec of specs) {
  const settings={fontFamily:`"${spec.font}"`,fontSize:spec.size,fontWeight:400,seed:41,risoPlateMap:'duotone',
    risoScreenPitch:spec.pitch,risoToneDepth:spec.depth,risoRegister:spec.register,risoPressure:1.8,risoGrain:.3,
    risoColorA:'#ec5535',risoColorB:'#172438',risoSourceOpacity:0,risoOpacity:1,activeOperator:'risoSeparation'};
  const mask=textMask(spec.text,spec.size,spec.font,720,460),fx=fixture(mask,settings).render('duotone');
  const image=canvas.createCanvas(760,540),ctx=image.getContext('2d');ctx.fillStyle='#f3f0e8';ctx.fillRect(0,0,image.width,image.height);
  ctx.drawImage(fx,20,50);ctx.fillStyle='#302a26';ctx.font='16px Arial';ctx.fillText(spec.id+' / Tonal masters',26,30);
  ctx.font='12px Arial';ctx.fillText(`pitch ${spec.pitch} / depth ${spec.depth} / register ${spec.register} — native isolated FX, not browser`,26,518);
  fs.writeFileSync(path.join(directory,spec.id+'.png'),image.toBuffer('image/png'));
  const {c}=exportFixture();Object.assign(c.params,settings,{artboard:'auto',exportScale:1});c.setSource(spec.text,'risoSeparation');
  c.renderedSourceText=spec.text;c.cloneBatchProfiles=()=>({});c.cloneLookMemory=()=>({slots:[]});
  for(const m of c.metrics){m.currentIntensity=0;m.toggled=false;}
  vm.runInContext(extract('projectData')+'\n'+extract('letterState'),c);
  fs.writeFileSync(path.join(directory,spec.id+'.json'),JSON.stringify(c.projectData()));
  manifest.push({spec,settings,nativeViewport:{width:760,height:540},project:'Actual Project serializer; synthetic layout; browser recall not tested'});
}
fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2));console.log(directory);
