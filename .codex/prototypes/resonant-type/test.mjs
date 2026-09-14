// Independent numerical oracles + offline operator contracts. No UI evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {resonantNearest,prepareResonantDomain,resonantLaplacian,finishResonantField,
  solveResonantField,renderResonantBody,normalizeResonantSettings,RESONANT_STARTS} from './core.mjs';

function fixture(rows,pad=2){
  const w=Math.max(...rows.map(r=>r.length))+pad*2,h=rows.length+pad*2,alpha=new Uint8ClampedArray(w*h);
  rows.forEach((row,y)=>[...row].forEach((c,x)=>{alpha[(y+pad)*w+x+pad]=c==='#'?255:c==='+'?160:0;}));
  return prepareResonantDomain(alpha,w,h);
}
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b} (tolerance ${e})`);

// Dense, pivoted Gaussian elimination of a REAL 2N by 2N block system.
// Does not use the production graph, matvec, ILU, dot products or iterations.
function denseOracle(domain,field){
  const n=domain.count,N=2*n,a=Array.from({length:N},()=>new Float64Array(N+1));
  const xy=Array.from(domain.positions,p=>[p%domain.width,Math.floor(p/domain.width)]);
  for(let i=0;i<n;i++){
    let degree=0;
    for(let j=0;j<n;j++)if(Math.abs(xy[i][0]-xy[j][0])+Math.abs(xy[i][1]-xy[j][1])===1){
      const w=Math.min(domain.alpha[domain.positions[i]],domain.alpha[domain.positions[j]])/255;
      a[i][j]=-w;a[n+i][n+j]=-w;degree+=w;
    }
    a[i][i]=a[n+i][n+i]=degree-field.k2;a[i][n+i]=-field.eta;a[n+i][i]=field.eta;a[i][N]=field.rhs[i];
  }
  for(let col=0;col<N;col++){
    let pivot=col;for(let r=col+1;r<N;r++)if(Math.abs(a[r][col])>Math.abs(a[pivot][col]))pivot=r;
    assert.ok(Math.abs(a[pivot][col])>1e-15);[a[pivot],a[col]]=[a[col],a[pivot]];
    for(let r=col+1;r<N;r++){const factor=a[r][col]/a[col][col];for(let c=col;c<=N;c++)a[r][c]-=factor*a[col][c];}
  }
  const x=new Float64Array(N);
  for(let r=N-1;r>=0;r--){let v=a[r][N];for(let c=r+1;c<N;c++)v-=a[r][c]*x[c];x[r]=v/a[r][r];}
  return x;
}

test('exact distance/nearest oracle: exhaustive small masks and deterministic larger masks',()=>{
  let seed=1719;
  for(const [w,h,rounds] of [[1,1,2],[3,2,64],[7,5,80]])for(let r=0;r<rounds;r++){
    const mask=Uint8Array.from({length:w*h},(_,i)=>w*h<=6?(r>>i)&1:((seed=(Math.imul(seed,1664525)+1013904223)>>>0)>>>30)===0?1:0);
    for(const ink of [false,true]){
      const actual=resonantNearest(mask,w,h,ink),seeds=[...mask.keys()].filter(i=>!!mask[i]===ink);
      for(let p=0;p<mask.length;p++){
        const distance=q=>(q%w-p%w)**2+(Math.floor(q/w)-Math.floor(p/w))**2;
        const expected=seeds.length?Math.min(...seeds.map(distance)):1e20;
        assert.equal(actual.distances[p],expected);
        if(seeds.length){assert.equal(!!mask[actual.nearest[p]],ink);assert.equal(distance(actual.nearest[p]),expected);}
        else assert.equal(actual.nearest[p],-1);
      }
    }
  }
});

test('graph respects real paper/counter/disconnections, symmetric alpha weights, and constants',()=>{
  const d=fixture(['##+..#','#.#...','###.##']);
  assert.equal(d.components.length,3);
  assert.equal(d.mask[(2+1)*d.width+2+1],0);
  for(let i=0;i<d.count;i++){
    let degree=0;
    for(let k=0;k<4;k++){
      const j=d.neighbours[i*4+k];if(j<0)continue;
      const back=[0,1,2,3].find(e=>d.neighbours[j*4+e]===i);assert.notEqual(back,undefined);
      assert.equal(d.weights[i*4+k],d.weights[j*4+back]);degree+=d.weights[i*4+k];
      const p=d.positions[i],q=d.positions[j];assert.equal(Math.abs(p%d.width-q%d.width)+Math.abs(Math.floor(p/d.width)-Math.floor(q/d.width)),1);
    }
    near(degree,d.degree[i]);
  }
  assert.ok([...resonantLaplacian(d,new Float64Array(d.count).fill(1),new Float64Array(d.count))].every(v=>Math.abs(v)<1e-14));
});

test('complex response matches an independent dense solve at pitch/loss/axis endpoints',()=>{
  for(const rows of [['#'],['###'],['##+','#.#','+##'],['##..#','.+...','...##']]){
    const d=fixture(rows);
    for(const pitch of [10,38,120])for(const loss of [.025,.6])for(const axis of [-180,37,180]){
      const field=finishResonantField(d,{pitch,loss,axis},{tolerance:1e-10}),oracle=denseOracle(d,field);
      const relative=Math.sqrt([...field.real].reduce((sum,v,i)=>sum+(v-oracle[i])**2+(field.imag[i]-oracle[d.count+i])**2,0))/Math.max(1,Math.hypot(...oracle));
      assert.ok(relative<2e-7,`independent relative error ${relative}`);assert.ok(field.complexResidual<=1.1e-10);
    }
  }
});

test('connectivity changes the response; translated copies produce the same response',()=>{
  const full=fixture(['#####','#...#','#####']),split=fixture(['##.##','#...#','#####']);
  const a=finishResonantField(full),b=finishResonantField(split);
  let diff=0;for(let i=0;i<split.count;i++){const j=full.ids[split.positions[i]];diff+=Math.abs(a.normalizedReal[j]-b.normalizedReal[i]);}
  assert.ok(diff>.1);
  const shifted=fixture(['#####','#...#','#####'],6),c=finishResonantField(shifted);
  a.real.forEach((v,i)=>near(v,c.real[i],1e-6));a.imag.forEach((v,i)=>near(v,c.imag[i],1e-6));
});

test('deterministic, cooperative preparation; explicit non-convergence; cancellation stops generator',()=>{
  const d=fixture(Array.from({length:50},(_,y)=>Array.from({length:40},(_,x)=>x<8||y<7||y>42||x>31?'#':'.').join('')));
  const a=finishResonantField(d),b=finishResonantField(d);assert.deepEqual(a.real,b.real);assert.deepEqual(a.imag,b.imag);
  const work=solveResonantField(d),first=work.next();assert.equal(first.done,false);assert.equal(first.value.iterations,32);
  assert.equal(work.return().done,true);assert.equal(work.next().done,true);
  assert.throws(()=>finishResonantField(d,{}, {maxIterations:1}),/did not converge/);
  for(const options of [{tolerance:0},{tolerance:NaN},{tolerance:1},{maxIterations:0},{maxIterations:1.2}])assert.throws(()=>finishResonantField(d,{},options),/budget/);
});

test('replacement alpha: exact native bypass, empty ink, field identity, closed motion, no source mutation',()=>{
  const d=fixture(['.###.','##.##','.##..','..##.'],104),copy=d.alpha.slice(),s=RESONANT_STARTS.chamber,field=finishResonantField(d,s);
  assert.deepEqual(renderResonantBody(d,null,{excursion:0,cut:0}),copy);
  assert.deepEqual(renderResonantBody(d,field),renderResonantBody(d,field,s));
  assert.deepEqual(renderResonantBody(d,field,s,0),renderResonantBody(d,field,s,1));
  assert.deepEqual(renderResonantBody(d,field,{motion:0},.14),renderResonantBody(d,field,{motion:0},.72));
  assert.notDeepEqual(renderResonantBody(d,field,s,0),renderResonantBody(d,field,s,.25));
  const nearA=renderResonantBody(d,field,s,1e-8),nearB=renderResonantBody(d,field,s,1-1e-8);
  assert.ok(nearA.every((v,i)=>Math.abs(v-nearB[i])<=1));
  assert.deepEqual(d.alpha,copy);
  assert.throws(()=>renderResonantBody(d,field,{pitch:120}),/settings changed/);
  assert.throws(()=>renderResonantBody(d,null),/mismatch/);
  assert.throws(()=>renderResonantBody(fixture(['#'],104),field),/mismatch/);
  assert.throws(()=>renderResonantBody(d,field,s,NaN),/phase/);
  const empty=fixture(['...']);assert.equal(finishResonantField(empty).complexResidual,0);assert.ok(renderResonantBody(empty,null).every(v=>v===0));
});

test('all declared paint endpoints produce bounded alpha or explicit padding error',()=>{
  const d=fixture(['####','#..#','####'],104),field=finishResonantField(d);
  for(const excursion of [-96,0,96])for(const cut of [0,1])for(const bands of [1,16])for(const aperture of [.015,.6])for(const motion of [0,1])for(const phase of [0,.25,.75]){
    const result=renderResonantBody(d,field,{excursion,cut,bands,aperture,motion},phase);
    assert.equal(result.length,d.alpha.length);assert.ok(result.every(v=>Number.isInteger(v)&&v>=0&&v<=255));
  }
  const small=fixture(['#'],1),f=finishResonantField(small);
  assert.throws(()=>renderResonantBody(small,f,{excursion:-96,cut:0}),/padding/);
});

test('invalid alpha, paper margin, thin source, dimensions and resource budgets fail explicitly',()=>{
  const rows=fixture(['###']);assert.throws(()=>prepareResonantDomain(rows.alpha,rows.width,rows.height,{maxNodes:2}),/node budget/);
  for(const options of [{maxNodes:NaN},{maxNodes:65537},{maxPixels:0},{maxPixels:Infinity}])assert.throws(()=>prepareResonantDomain(rows.alpha,rows.width,rows.height,options),/budget/);
  for(const value of [-1,256,NaN,Infinity])assert.throws(()=>prepareResonantDomain([0,0,0,0,value,0,0,0,0],3,3),/invalid alpha/);
  assert.throws(()=>prepareResonantDomain([0,0,0,0,126,0,0,0,0],3,3),/too thin/);
  assert.throws(()=>prepareResonantDomain([1,0,0,0,255,0,0,0,0],3,3),/paper border/);
  assert.throws(()=>prepareResonantDomain([0,0,0],3,3),/dimensions/);
  assert.throws(()=>prepareResonantDomain(null,3,3),/dimensions/);
  assert.throws(()=>resonantNearest([0],2,1),/distance raster/);
  assert.throws(()=>resonantNearest([0],1,1,1),/distance raster/);
  const rgba=Uint8ClampedArray.from([...rows.alpha].flatMap(a=>[80,30,45,a]));
  assert.deepEqual(prepareResonantDomain(rgba,rows.width,rows.height).alpha,rows.alpha);
  assert.deepEqual(normalizeResonantSettings({pitch:Infinity}),normalizeResonantSettings());
});
