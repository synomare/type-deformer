import test from 'node:test';
import assert from 'node:assert/strict';
import {createCalligraphyContourQuery} from '../.codex/prototypes/calligraphic-field/core.mjs';
import {prepareCalligraphyBody,createCalligraphyBodySampler,rasterCalligraphyBody} from '../.codex/prototypes/calligraphic-field/body.mjs';

const box=(x0,y0,x1,y1,reverse=false)=>({points:(reverse?[[x0,y0],[x0,y1],[x1,y1],[x1,y0]]:[[x0,y0],[x1,y0],[x1,y1],[x0,y1]]).map(([x,y])=>({x,y}))});
const near=(a,b,epsilon=1e-9)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} != ${b}`);
const rectangles=[[0,0,80,70,1],[12,12,58,52,-1],[100,10,122,65,1],[4,72,20,90,1]];
const contours=rectangles.map(([a,b,c,d,w])=>box(a,b,c,d,w<0));
const ink=(x,y)=>rectangles.reduce((w,[a,b,c,d,sign])=>w+(a<x&&x<c&&b<y&&y<d?sign:0),0)!==0;
// Independent interval oracle: clip a parametric ray to each axis-aligned
// rectangle with slabs, then resolve ink membership between its boundaries.
function oracle(x,y,ux,uy){
  const endpoints=[];
  for(const [a,b,c,d] of rectangles){let lo=-Infinity,hi=Infinity;
    for(const [p,v,min,max] of [[x,ux,a,c],[y,uy,b,d]]){
      if(!v){if(p<min||p>=max){lo=1;hi=0;break;}}
      else{const s=(min-p)/v,t=(max-p)/v;lo=Math.max(lo,Math.min(s,t));hi=Math.min(hi,Math.max(s,t));}
    }
    if(lo<hi)endpoints.push(lo,hi);
  }
  const sorted=[...new Set(endpoints)].sort((a,b)=>a-b);let start=null;
  for(let i=0;i+1<sorted.length;i++){
    const mid=(sorted[i]+sorted[i+1])/2,on=ink(x+ux*mid,y+uy*mid);
    if(on&&start===null)start=sorted[i];
    if(start!==null&&(!on||i===sorted.length-2)){
      const end=on?sorted[i+1]:sorted[i];if(start<=0&&0<end)return {before:-start,after:end,inside:true};start=null;
    }
  }
  return {before:0,after:0,inside:false};
}

test('ink chord follows each stroke, not a glyph-wide centre or a counter',()=>{
  const q=createCalligraphyContourQuery(contours),line=q.createChordQuery(1,0),out={};
  assert.deepEqual(line(6,30,out),{before:6,after:6,inside:true});
  assert.equal(line(6,30,out),out,'reuse result ownership');
  assert.deepEqual(line(64,30),{before:6,after:16,inside:true});
  assert.deepEqual(line(110,30),{before:10,after:12,inside:true});
  assert.equal(line(40,30).inside,false);assert.equal(line(90,30).inside,false);
  assert.equal(line(-2,30).inside,false);assert.equal(line(110,100).inside,false);
});

test('36 directions and 3600 probes agree with independent slab/Boolean oracle',()=>{
  const q=createCalligraphyContourQuery(contours);let seed=829;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
  for(let k=0;k<36;k++){const a=k*Math.PI/18,ux=Math.cos(a),uy=Math.sin(a),query=q.createChordQuery(ux,uy);
    for(let j=0;j<100;j++){const x=random()*145-10,y=random()*110-10,actual=query(x,y),expected=oracle(x,y,ux,uy);
      assert.equal(actual.inside,expected.inside);near(actual.before,expected.before);near(actual.after,expected.after);
    }
  }
});

test('shared vertices, tangencies, nonzero-winding overlap and reversed direction',()=>{
  const diamond={points:[{x:0,y:-20},{x:20,y:0},{x:0,y:20},{x:-20,y:0}]};
  const q=createCalligraphyContourQuery([diamond,box(0,0,30,25)]),axis=q.createChordQuery(1,0);
  assert.deepEqual(axis(1,1),{before:20,after:29,inside:true},'overlap is one nonzero interval');
  assert.deepEqual(axis(1,0),{before:21,after:29,inside:true},'exact vertex half-open rule');
  assert.equal(axis(-1,20).inside,false,'tangent does not create ink');
  assert.equal(axis(2,-20).inside,false);
  const reverse=q.createChordQuery(-2,0),forward=axis(4,5),back=reverse(4,5);
  near(forward.before,back.after);near(forward.after,back.before);
  const flipped=createCalligraphyContourQuery([diamond,box(0,0,30,25)].map(r=>({points:[...r.points].reverse()}))).createChordQuery(1,0);
  assert.deepEqual(flipped(1,1),axis(1,1));
});

test('source and result ownership, empty/invalid input, scale and arbitrary rotation covariance',()=>{
  const original=JSON.stringify(contours),q=createCalligraphyContourQuery(contours),first=q.createChordQuery(.7,.3),second=q.createChordQuery(.3,-.8);
  const held=first(7,30);second(7,30);assert.deepEqual(first(7,30),held);
  assert.equal(JSON.stringify(contours),original);
  const editable=structuredClone(contours),owned=createCalligraphyContourQuery(editable).createChordQuery(1,0),saved=owned(6,30);
  editable[0].points[0].x=900;assert.deepEqual(owned(6,30),saved,'caller source edits cannot corrupt projected intervals');
  for(const angle of [.13,.77,1.8]){const c=Math.cos(angle),s=Math.sin(angle),scale=3.7,tx=63,ty=-28;
    const move=(x,y)=>({x:scale*(x*c-y*s)+tx,y:scale*(x*s+y*c)+ty});
    const moved=createCalligraphyContourQuery(contours.map(r=>({points:r.points.map(p=>move(p.x,p.y))})),4*scale).createChordQuery(.7*c-.3*s,.7*s+.3*c);
    for(const [x,y] of [[6,30],[65,38],[110,40],[10,79]]){const p=move(x,y),a=first(x,y),b=moved(p.x,p.y);assert.equal(b.inside,a.inside);near(b.before,a.before*scale);near(b.after,a.after*scale);}
  }
  assert.equal(createCalligraphyContourQuery([]).createChordQuery(1,0)(0,0).inside,false);
  assert.throws(()=>q.createChordQuery(0,0));assert.throws(()=>q.createChordQuery(NaN,1));assert.throws(()=>first(Infinity,0));
});

test('Split channels occur in multiple stems; other nibs and thin walls remain ink',()=>{
  const source=[box(0,0,22,120),box(58,0,80,120)],body=prepareCalligraphyBody(source);
  const input={tool:'split',angle:0,contrast:.4,pulse:0,wetness:0,fontSize:192};
  const split=createCalligraphyBodySampler(body,input),broad=createCalligraphyBodySampler(body,{...input,tool:'broad'});
  assert.ok(split.sample(11,60)<.1);assert.ok(split.sample(69,60)<.1);
  assert.ok(broad.sample(11,60)>.99);assert.ok(split.sample(4,60)>.99);
  assert.equal(split.sample(40,60),0);
  const thin=prepareCalligraphyBody([box(0,0,2,120)]),sampler=createCalligraphyBodySampler(thin,input);
  assert.ok(sampler.sample(1,60)>.9,'thin original stem must not become a slit');
});

test('formed-body shoulders are preserved at destructive weight; loop and local transform stay exact',()=>{
  const body=prepareCalligraphyBody([box(20,10,45,90)]);
  // Omitting chord cuts is an oracle for the exact same Split exterior equation.
  const uncut={...body,query:{...body.query,createChordQuery:()=>()=>({inside:false})}};
  for(const expansion of [-15,-5,0,12])for(const contrast of [0,.4,1.4,4])for(const [wetness,fontSize,aa] of [[.2,192,0],[1,52,3],[1,192,15]]){
    const p={tool:'split',angle:27,expansion,contrast,pulse:.4,wetness,fontSize};
    const cut=createCalligraphyBodySampler(body,p,.17,aa),base=createCalligraphyBodySampler(uncut,p,.17,aa);
    for(let y=0;y<105;y+=1.25)for(let x=0;x<65;x+=1.25){const a=base.sample(x,y),b=cut.sample(x,y);assert.ok(b<=a+1e-12);if(a<1)near(a,b,0);}
  }
  const render=(phase,matrix)=>{const result=new Uint8ClampedArray(128*128*4);rasterCalligraphyBody(body,{tool:'split'},phase,matrix,128,128,result);return result;};
  const m={a:1,b:0,c:0,d:1,e:0,f:0},a=render(0,m),b=render(1,m),r=render(0,{a:0,b:1,c:-1,d:0,e:128,f:0});
  assert.deepEqual(a,b);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++)assert.equal(a[(y*128+x)*4+3],r[(x*128+127-y)*4+3]);
});
