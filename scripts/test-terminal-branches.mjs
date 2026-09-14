// Dependency-free tests of actual editor code. Offline Canvas proof is separate.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');
function extract(name) {
  const p=html.indexOf(`      function ${name}(`);assert.ok(p>=0,name);
  const tail=html.slice(p);return tail.slice(0,tail.indexOf('\n      }')+8);
}
let captured;
const branches=extract('surfaceTerminalBranches').replace(
  '        var result = [];\n        for (var y = 1; y < h - 1; y++)',
  '        capture(ink, w, h, left, top);\n        var result = [];\n        for (var y = 1; y < h - 1; y++)');
assert.ok(branches.includes('capture(ink'));
const api=new Function('capture',branches+'\n'+extract('surfaceBoundaryDistance')+
  '\nreturn {surfaceTerminalBranches,surfaceBoundaryDistance};')(
  (ink,w,h,left,top)=>{captured={ink:ink.slice(),w,h,left,top};});
function field(w,h,fn) {
  const rgba=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)rgba[(y*w+x)*4+3]=fn(x,y)?255:0;
  return api.surfaceBoundaryDistance(rgba,w,h);
}
// Deliberately slow, full-grid oracle, independent of the exposed-pixel queue.
function fullScan(field,width) {
  const left=field.bounds[0]-1,top=field.bounds[1]-1;
  const w=field.bounds[2]-left+2,h=field.bounds[3]-top+2,ink=new Uint8Array(w*h);
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++)ink[y*w+x]=field.inside[(y+top)*width+x+left];
  let changed;
  do {
    changed=false;
    for(let phase=0;phase<2;phase++){
      const removals=[];
      for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
        const i=y*w+x;if(!ink[i])continue;
        const p=[-w,-w+1,1,w+1,w,w-1,-1,-w-1].map(d=>ink[i+d]);
        const n=p.reduce((sum,a)=>sum+a,0);
        const transitions=p.reduce((sum,a,j)=>sum+(!a&&!!p[(j+1)%8]),0);
        const triplets=phase===0?[[0,2,4],[2,4,6]]:[[0,2,6],[0,4,6]];
        if(n>=2&&n<=6&&transitions===1&&!triplets.some(t=>t.every(j=>p[j])))removals.push(i);
      }
      for(const i of removals)ink[i]=0;
      changed ||= removals.length>0;
    }
  }while(changed);
  return {ink,w,h,left,top};
}
const fixtures=[
  ['horizontal',120,90,(x,y)=>x>=10&&x<=100&&y>=30&&y<=44,2],
  ['vertical',90,120,(x,y)=>y>=10&&y<=100&&x>=30&&x<=44,2],
  ['thin',120,90,(x,y)=>x>=10&&x<=100&&y===30,2],
  ['diagonal',120,120,(x,y)=>x>15&&x<100&&Math.abs(y-x)<5,2],
  ['ring',120,120,(x,y)=>Math.hypot(x-60,y-60)>31&&Math.hypot(x-60,y-60)<44,0],
  ['dot',90,90,(x,y)=>Math.hypot(x-45,y-45)<14,0],
  ['empty',90,90,()=>false,0],
  ['edge-touch',120,90,(x,y)=>x>=0&&x<=100&&y>=0&&y<=14,2]
];
for(const [name,w,h,fn,count] of fixtures){
  const f=field(w,h,fn),input=f.inside.slice();
  const a=api.surfaceTerminalBranches(f,w,h,120,0);
  assert.equal(a.length,count,name);
  if(f.bounds)assert.deepEqual(captured,fullScan(f,w),'frontier preserves exact thinning');
  assert.deepEqual(a,api.surfaceTerminalBranches(f,w,h,120,0),'deterministic');
  assert.deepEqual(f.inside,input,'source mask immutable');
  for(const p of a){
    assert.ok(Object.values(p).every(Number.isFinite),name);
    assert.ok(Math.abs(Math.hypot(p.nx,p.ny)-1)<1e-12);
    assert.ok(f.inside[Math.round(p.y)*w+Math.round(p.x)],'root stays in ink');
  }
}
// Queue correctness over disconnected, thin, touching and high-frequency shapes.
let seed=941;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(let trial=0;trial<80;trial++){
  const centers=Array.from({length:9},()=>[random()*64,random()*64,1+random()*17]);
  const f=field(64,64,(x,y)=>centers.some(([cx,cy,r])=>Math.hypot(x-cx,y-cy)<r));
  api.surfaceTerminalBranches(f,64,64,64,trial%3-1);
  assert.deepEqual(captured,fullScan(f,64),'full-scan oracle '+trial);
}
// Exactly translate a real branch-bearing mask; no camera-relative re-selection.
const line=(x,y)=>x>=10&&x<=100&&y>=30&&y<=44;
const a=api.surfaceTerminalBranches(field(160,120,line),160,120,120,0);
const b=api.surfaceTerminalBranches(field(160,120,(x,y)=>line(x-13,y-17)),160,120,120,0);
assert.deepEqual(b,a.map(p=>({...p,x:p.x+13,y:p.y+17})));
// All prior cap paths, including their existing traps, remain byte-exact.
const hash=s=>createHash('sha256').update(s.replaceAll('\r\n','\n')).digest('hex');
const frozen=JSON.parse(await fs.readFile(new URL('./terminal-preserved-functions.json',import.meta.url),'utf8'));
for(const [name,expected] of Object.entries(frozen))assert.equal(hash(extract(name)),expected,name);
const render=extract('renderTerminalExcess');
assert.ok(render.includes('surfaceTerminalBranches(field, width, height'));
assert.ok(!render.includes('sampleSurfaceMask('),'no bowl-extrema fallback on closed loops');
let legacyCalls=0,maskCalls=0;
const dispatch=new Function('surfaceChoice','params','BATCH_PARAM_OPTIONS','renderTerminalExcessLegacy','surfaceAggregate','buildSurfaceMask',
  render+'\nreturn renderTerminalExcess;')(()=> 'legacy',{}, {terminalStyle:[]},()=>legacyCalls++,()=>{throw Error('modern aggregation on legacy');},()=>maskCalls++);
dispatch({},[],10,10,1,{s:1},{},false);assert.equal(legacyCalls,1);assert.equal(maskCalls,0);
console.log(JSON.stringify({status:'pass',fixtureGroups:8,fullScanOracles:87,translation:true,preservedFunctions:Object.keys(frozen),legacyDispatch:true,
  scope:'actual math/source contract only; not browser, Compose, native export or device QA'}));
