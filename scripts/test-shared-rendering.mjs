import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const canvas=require(process.env.TYPE_DEFORMER_CANVAS_MODULE||'@napi-rs/canvas');
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
function fixture(){const c=vm.createContext({document:{createElement:()=>canvas.createCanvas(1,1)},DOMMatrix:canvas.DOMMatrix,ArrayBuffer,Uint8Array,Uint8ClampedArray,Float32Array,Float64Array});for(const name of ['parameter-model.js','parameter-definitions.js','render-context.js','render-jobs.js'])vm.runInContext(read(name),c);return c;}
test('normal slider travel, mathematical domains and render budgets remain independent',()=>{
 const p=fixture().TypeDeformerParameters;
 for(const [key,value]of [['rotateAngle',1080.5],['skewX',110],['baselineShift',-12],['enneperOrder',5],['wassersteinMetric',8],['wassersteinEntropy',.2],['beltramiAnisotropy',.9],['textObjects.scale',5],['composition.logicalViewport.width',10000]]){
  assert.equal(p.validate(key,value).ok,true,key);assert.equal(p.normalize(key,value,1,-1,1,true),value,key+' must not be clipped by old callers');
 }
 for(const [key,value]of [['skewX',90],['skewY',-270],['enneperOrder',1.2],['enneperOrder',1e20],['wassersteinMetric',0],['wassersteinEntropy',-1],['beltramiAnisotropy',1]])assert.equal(p.validate(key,value).ok,false,key);
 for(const value of ['', ' ', 'NaN', 'Infinity','1foo'])assert.equal(p.validate('rotateAngle',value).ok,false);
 const value=100000000;assert.equal(p.validate('rotateAngle',value).ok,true);assert.throws(()=>p.assertBudget('rotateAngle',value),/保持/);assert.equal(p.normalize('rotateAngle',value,0),value);
 assert.equal(p.byControl.pRotateAngle.slider.max,720);
});
test('latest request wins, at most one waits, stale images close and cancellation recovers',()=>{
 const c=fixture(),workers=[];let closed=0;
 class Worker{constructor(){this.sent=[];workers.push(this);}postMessage(message){this.sent.push(message);}terminate(){this.terminated=true;}}
 const q=c.TypeDeformerRenderJobs.create({workerFactory:()=>new Worker()});q.request('a',{});q.request('b',{});q.request('c',{});
 assert.equal(workers[0].sent.length,1);assert.equal(q.status().counters.maxWaiting,1);
 workers[0].onmessage({data:{id:1,type:'result',result:{bitmap:{close(){closed++;}}}}});assert.equal(closed,1);assert.equal(q.status().ready,false);assert.equal(workers[0].sent[1].key,'c');
 workers[0].onmessage({data:{id:3,type:'result',result:{bitmap:{close(){closed++;}}}}});assert.equal(q.status().ready,true);
 q.request('d',{});workers[0].onmessage({data:{id:4,type:'error',message:'budget'}});assert.equal(q.status().error,'budget');assert.equal(closed,1,'last completed image stays retained');
 q.retry();assert.equal(workers[0].terminated,true);assert.equal(workers.length,2);workers[1].onmessage({data:{id:5,type:'result',result:{}}});assert.equal(q.status().ready,true);assert.equal(closed,2);q.dispose();
});
test('output purpose ignores low mode and high resolution shades original scalar coordinates',()=>{
 const R=fixture().TypeDeformerRenderContext,context=R.make({purpose:'proof',presentation:'low',factor:4,width:64,height:64});assert.equal(context.presentation,'standard');
 R.withContext(context,()=>{const out=R.createCanvas(16,16),ctx=out.getContext('2d'),im=ctx.createImageData(16,16);for(let y=0;y<16;y++)for(let x=0;x<16;x++)im.data[(y*16+x)*4+3]=(x+.5<8.125)?255:0;
 R.field(im,(x,y,rgba)=>{rgba[0]=255;rgba[3]=x<8.125?255:0;});ctx.putImageData(im,0,0);
 const actual=R.physical(out).getContext('2d').getImageData(0,0,64,64).data;for(let y=0;y<64;y++)for(let x=0;x<64;x++)assert.equal(actual[(y*64+x)*4+3],x+.5<32.5?255:0);
 assert.equal(out.width,16);assert.equal(R.physical(out).width,64);assert.ok(context.peakBytes>=16*16*4+64*64*4);
 });
});
test('source coverage is rasterized before inverse sampling, and temporary canvases release their budget',()=>{
 const R=fixture().TypeDeformerRenderContext,context=R.make({purpose:'export',factor:4,width:64,height:64});
 R.withContext(context,()=>{const source=R.createCanvas(16,16),ctx=source.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(4.25,2,.25,10);const sample=R.alphaSampler(source),old=context.bytes;
 assert.ok(sample(4.375,5)>.9,'a fine source stroke is sampled from its output raster');R.release(source);assert.ok(context.bytes<old);assert.ok(sample(4.375,5)>.9,'captured coverage survives release');
 const target=R.createCanvas(16,16),tc=target.getContext('2d');tc.fillStyle='#fff';tc.fillRect(0,0,16,16);R.applyAlpha(target,x=>x<8?1:0);const alpha=R.physical(target).getContext('2d').getImageData(0,0,64,64).data;assert.equal(alpha[(32*64+31)*4+3],255);assert.equal(alpha[(32*64+32)*4+3],0);
 });
 const tiny=R.make({factor:4,width:10,height:10,memoryBudget:100});assert.throws(()=>R.withContext(tiny,()=>R.createCanvas(16,16)),/予算/);
});
test('tiling uses a complete nonoverlapping output lattice',()=>{const R=fixture().TypeDeformerRenderContext,w=2137,h=1473,coverage=new Uint8Array(w*h);for(const tile of R.tiles(w,h,512))for(let y=tile.y;y<tile.y+tile.height;y++)for(let x=tile.x;x<tile.x+tile.width;x++)coverage[y*w+x]++;assert.ok(coverage.every(v=>v===1));});

test('destination field pixels agree across clipped tile seams',()=>{
 const R=fixture().TypeDeformerRenderContext,factor=4,w=32,h=24;
 function render(tiles){const result=canvas.createCanvas(w*factor,h*factor),target=result.getContext('2d');for(const tile of tiles){const context=R.make({purpose:'export',factor,width:w*factor,height:h*factor,referenceWidth:w,referenceHeight:h,tile,overscan:8});R.withContext(context,()=>{const source=R.createCanvas(w,h,{tiled:true}),ctx=source.getContext('2d'),im=ctx.createImageData(w,h);R.field(im,(x,y,rgba)=>{rgba[0]=33;rgba[1]=70;rgba[2]=128;rgba[3]=255*(.5+.5*Math.sin(x*.73+y*.41));});ctx.putImageData(im,0,0);if(tile)R.drawImage(target,source,tile.x/factor,tile.y/factor,tile.width/factor,tile.height/factor,tile.x,tile.y,tile.width,tile.height);else target.drawImage(R.physical(source),0,0);});}return result.getContext('2d').getImageData(0,0,w*factor,h*factor).data;}
 assert.deepEqual(render(R.tiles(w*factor,h*factor,37)),render([null]));
});
