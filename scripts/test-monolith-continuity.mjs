import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {canvas} from './thorn-rooted-fixture.mjs';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function extract(name){const start=html.indexOf('      function '+name+'(');assert.ok(start>=0,name);const tail=html.slice(start);return tail.slice(0,tail.indexOf('\n      }')+8);}
export function monolithFixture(bodySource=extract('monolithBodyV35')){
  const scratch=new Map(),c=vm.createContext({params:{seed:1},Uint8Array,Float32Array,Int32Array,Uint32Array,Uint8ClampedArray,
    surfaceScratch(name,w,h){let item=scratch.get(name);if(!item||item.canvas.width!==w||item.canvas.height!==h){const cv=canvas.createCanvas(w,h);item={canvas:cv,ctx:cv.getContext('2d')};scratch.set(name,item)}item.ctx.clearRect(0,0,w,h);return item;}
  });
  vm.runInContext(['hash','surfaceBoundaryDistance','surfaceVoidTopology','surfaceSignedDistanceValue','surfaceSmoothCoverage'].map(extract).join('\n')+'\n'+bodySource,c);
  return c;
}
export function monolithScan(text='B',font='Georgia',weight=400){
  const cv=canvas.createCanvas(240,240),ctx=cv.getContext('2d');ctx.font=weight+' 180px "'+font+'"';ctx.fillStyle='white';ctx.fillText(text,24,190);
  return {bounds:{scanW:240,scanH:240},image:ctx.getImageData(0,0,240,240)};
}
export function castPixels(c,scan,fault,mass=0){const shape=c.monolithBodyV35(scan,mass,18,fault,1,1,0,19);assert.ok(shape);return new Uint8ClampedArray(shape.body.getContext('2d').getImageData(0,0,240,240).data);}
test('Monolith subpixel fault responds below the former one-pixel rounding threshold',()=>{
  const c=monolithFixture(),scan=monolithScan(),a=castPixels(c,scan,0),b=castPixels(c,scan,.5);
  assert.notDeepEqual(a,b,'small fault values must not all produce the same body');
  let total=0;for(let i=3;i<a.length;i+=4)total+=Math.abs(a[i]-b[i]);assert.ok(total>20&&total<15000);
  const before=castPixels(c,scan,.49999),after=castPixels(c,scan,.50001);let jump=0;
  for(let i=3;i<before.length;i+=4)jump=Math.max(jump,Math.abs(before[i]-after[i]));assert.ok(jump<=1,'continuous sample does not introduce a full-pixel jump');
});
test('Monolith zero, counters, extreme signed mass and fault remain deterministic and bounded',()=>{
  const c=monolithFixture();
  for(const [text,font,weight] of [['B','Georgia',400],['永','Yu Mincho',400],['R','Arial',900]]){
    const scan=monolithScan(text,font,weight),zero=castPixels(c,scan,0);
    assert.ok(zero.some((v,i)=>i%4===3&&v===255));assert.ok(zero.some((v,i)=>i%4===3&&v===0));
    assert.deepEqual(zero,castPixels(c,scan,0));
    for(const fault of [-480,480])assert.ok(castPixels(c,scan,fault,6).some((v,i)=>i%4===3&&v>0));
  }
});
