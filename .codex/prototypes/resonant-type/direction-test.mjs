import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareResonantDomain,finishResonantField,RESONANT_STARTS} from './core.mjs';
import {prepareResonantDirection} from './direction-field.mjs';
import {renderResonantTransportStudy as render} from './transport-study.mjs';
const near=(a,b,e=2e-6)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
function fixture(rows,pad=8){
  const w=Math.max(...rows.map(r=>r.length))+pad*2,h=rows.length+pad*2,alpha=new Uint8ClampedArray(w*h);
  rows.forEach((r,y)=>[...r].forEach((c,x)=>{alpha[(y+pad)*w+x+pad]=c==='#'?255:c==='+'?160:0;}));
  return prepareResonantDomain(alpha,w,h);
}
// Direct 2D kernel summation and eigen-axis reconstruction. No prefix sums,
// separable filter, production projection formula, or vertex sampling.
function oracle(d,r){
  const w=d.width,h=d.height,result=Array.from({length:w*h},()=>[0,0,0]);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let a=0,b=0,c=0;
    for(let yy=Math.max(1,y-r);yy<=Math.min(h-2,y+r);yy++)for(let xx=Math.max(1,x-r);xx<=Math.min(w-2,x+r);xx++){
      const p=yy*w+xx;if(!d.mask[p])continue;
      const gx=(d.signed[p+1]-d.signed[p-1])/2,gy=(d.signed[p+w]-d.signed[p-w])/2;
      const weight=(r+1-Math.abs(xx-x))*(r+1-Math.abs(yy-y));
      a+=weight*gx*gx;b+=weight*gx*gy;c+=weight*gy*gy;
    }
    if(a+c<1e-10)continue;
    const theta=.5*Math.atan2(2*b,a-c),cs=Math.cos(theta),sn=Math.sin(theta),coherence=Math.hypot(a-c,2*b)/(a+c);
    result[y*w+x]=[coherence*cs*cs,coherence*cs*sn,coherence*sn*sn];
  }
  return result;
}

test('source direction matches direct 2D tensor oracle, including short border halos',()=>{
  for(const rows of [['####','##.#','.###'],['#...','.#..','..#.','...#'],['#'],['#.#','###','#.#']])for(const pad of [2,7]){
    const d=fixture(rows,pad);
    for(const radius of [1,3,6]){
      const actual=prepareResonantDirection(d,{radius}),expected=oracle(d,radius);
      expected.forEach((v,p)=>{near(actual.normalXX[p],v[0]);near(actual.normalXY[p],v[1]);near(actual.normalYY[p],v[2]);});
    }
  }
});

test('normal projection follows horizontal/vertical strokes and cancels at a symmetric crossing',()=>{
  const rows=Array.from({length:31},(_,y)=>Array.from({length:31},(_,x)=>Math.abs(x-15)<=1||Math.abs(y-15)<=1?'#':'.').join(''));
  const d=fixture(rows),f=prepareResonantDirection(d,{radius:3}),p=(x,y)=>(y+8)*d.width+x+8;
  // Keep the radius-three window away from both the cap and the crossing.
  // A cap contributes a second gradient direction and is not fully coherent.
  near(f.normalXX[p(15,7)],1);near(f.normalYY[p(15,7)],0);
  near(f.normalXX[p(7,15)],0);near(f.normalYY[p(7,15)],1);
  assert.ok(f.normalXX[p(15,4)]>0&&f.normalXX[p(15,4)]<1);
  near(f.normalXX[p(15,15)]+f.normalYY[p(15,15)],0);
});

test('quarter-turn covariance and projection norm bound without eigenvector sign flips',()=>{
  const d=fixture(['#####..','##..+..','###....','..###..','...####'],10),w=d.width,h=d.height,alpha=new Uint8ClampedArray(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)alpha[x*h+h-1-y]=d.alpha[y*w+x];
  const rotated=prepareResonantDomain(alpha,h,w),a=prepareResonantDirection(d),b=prepareResonantDirection(rotated);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const p=y*w+x,q=x*h+h-1-y;near(a.normalXX[p],b.normalYY[q]);near(a.normalYY[p],b.normalXX[q]);near(a.normalXY[p],-b.normalXY[q]);
    for(const angle of [0,.3,1.1,2.7]){
      const vx=Math.cos(angle),vy=Math.sin(angle),ux=a.normalXX[p]*vx+a.normalXY[p]*vy,uy=a.normalXY[p]*vx+a.normalYY[p]*vy;
      assert.ok(Math.hypot(ux,uy)<=1+2e-6);assert.ok(vx*ux+vy*uy>=-2e-6);
    }
  }
});

test('prepared direction is deterministic/source-local; active fold changes, no-fold does not',()=>{
  const d=fixture(['#######','##...##','#######','##...##','#######'],120),s=RESONANT_STARTS.reed,f=finishResonantField(d,s),copy=d.alpha.slice();
  const direction=prepareResonantDirection(d);assert.deepEqual(direction.normalXX,prepareResonantDirection(d).normalXX);
  assert.notDeepEqual(render(d,f,null,s,0),render(d,f,direction,s,0));
  assert.deepEqual(render(d,f,null,{cut:0},0),render(d,f,direction,{cut:0},0));
  assert.deepEqual(render(d,f,direction,s,0),render(d,f,direction,s,1));
  assert.deepEqual(render(d,f,direction,{motion:0},.2),render(d,f,direction,{motion:0},.7));
  assert.deepEqual(copy,d.alpha);
  assert.throws(()=>render(d,f,{...direction,domain:{}},s),/direction\/domain/);
  assert.throws(()=>render(d,f,{...direction,normalXY:new Float32Array(1)},s),/direction\/domain/);
  const bad={...direction,normalXX:new Float32Array(d.alpha.length).fill(NaN)};
  assert.throws(()=>render(d,f,bad,s),/invalid direction/);
});

test('direction bounds, empty input and all 144 transport endpoints',()=>{
  const empty=fixture(['...']);assert.ok(prepareResonantDirection(empty).normalXX.every(v=>v===0));
  for(const radius of [0,65,1.2,NaN])assert.throws(()=>prepareResonantDirection(empty,{radius}),/radius/);
  assert.throws(()=>prepareResonantDirection({width:3,height:3,mask:[],signed:[]}),/domain/);
  const d=fixture(['####','#..#','####'],170),f=finishResonantField(d),direction=prepareResonantDirection(d);let count=0;
  for(const excursion of [-96,0,96])for(const cut of [0,1])for(const bands of [1,16])for(const aperture of [.015,.6])for(const motion of [0,1])for(const phase of [0,.25,.75]){
    const output=render(d,f,direction,{excursion,cut,bands,aperture,motion},phase);
    assert.ok(output.every(v=>Number.isFinite(v)&&v>=0&&v<=255));count++;
  }
  assert.equal(count,144);
});
