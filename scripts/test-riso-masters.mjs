import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
import { canvas, fixture, textMask, html } from './riso-fixture.mjs';
const extract = name => html.match(new RegExp('^      function ' + name + '\\([^]*?^      }', 'm'))[0];
const pixels = c => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
const mass = data => data.reduce((sum, v, i) => sum + (i % 4 === 3 ? v : 0), 0);
const mask = textMask('B O', 105, 'Times New Roman', 260, 190);
const settings = { pressure: 1.36, balance: -.12, overlap: .42, depth: 24, pitch: 7, grain: .22, seed: 41 };

test('tonal masters are an additional integrated choice; old modes/default and ranges remain', () => {
  const c = fixture(mask);
  assert.equal(c.params.risoPlateMap, 'area');
  assert.deepEqual(Array.from(c.BATCH_PARAM_OPTIONS.risoPlateMap), ['legacy','field','area','edge','halftone','duotone']);
  assert.match(html, /<option value="duotone">Tonal masters/);
  for (const [key, id, range] of [['risoToneDepth','RisoToneDepth',[0,160]], ['risoScreenPitch','RisoScreenPitch',[1,48]]]) {
    assert.ok(extract('snapshotGlyphs').includes(`${key}: deform.${key}`));
    assert.ok(html.includes(`bindRange('p${id}', 'v${id}', '${key}'`));
    assert.ok(html.includes(`clampParam('${key}', ${range[0]}, ${range[1]}, false)`));
    assert.ok(html.includes(`${key}: [${range.join(', ')}]`));
  }
  assert.match(extract('projectData'), /version: 92/);
  assert.ok(html.includes('toneDepth: params.risoToneDepth, screenPitch: params.risoScreenPitch'));
});

test('screen ink-area calibration matches an independent sampled area, including dark tones', () => {
  const c = fixture(mask), radii = c.risoToneRadii();
  assert.equal(radii[0], 0); assert.ok(radii.every((r, i) => !i || r >= radii[i-1]));
  for (const tone of [0,.08,.25,.5,.78,.88,.96,1]) {
    let sum = 0;
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) sum += c.risoScreenCoverage((x+.5)/2,(y+.5)/2,64,tone,1,0,0,radii);
    assert.ok(Math.abs(sum / 16384 - tone) < .006, `${tone}: ${sum/16384}`);
    assert.equal(c.risoScreenCoverage(11,17,1,tone,1,0,0,radii),tone, 'unresolved screen tends to mean');
  }
});

test('local stroke spans match an independent per-pixel scan oracle, including holes/diagonals', () => {
  const c = fixture(mask), w = 31, h = 25, input = new Uint8Array(w*h);
  for (let y=0;y<h;y++) for(let x=0;x<w;x++) input[y*w+x]=((x+y)%11<3 || (x>5&&x<20&&y>5&&y<20&&!(x>9&&x<16&&y>9&&y<16)))?1:0;
  const actual = c.risoStrokeWidths(input,w,h);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    if(!input[y*w+x]) { assert.equal(actual[y*w+x],0);continue; }
    let l=x,r=x,t=y,b=y;
    while(l>0&&input[y*w+l-1])l--;while(r+1<w&&input[y*w+r+1])r++;
    while(t>0&&input[(t-1)*w+x])t--;while(b+1<h&&input[(b+1)*w+x])b++;
    assert.equal(actual[y*w+x], Math.min(r-l+1,b-t+1)/2);
  }
});

test('empty/zero assignment, holes and source pixels remain intact; plate masks are different', () => {
  const c=fixture(mask), source=pixels(mask), original=source.slice();
  const plates=c.risoDuotonePlates(source,mask.width,mask.height,1,settings,0);
  assert.ok(mass(plates.a)>0&&mass(plates.b)>0);assert.notDeepEqual(plates.a,plates.b);
  for(let i=3;i<source.length;i+=4) if(source[i]===0) {assert.equal(plates.a[i],0);assert.equal(plates.b[i],0);}
  assert.deepEqual(source,original);
  assert.equal(mass(pixels(fixture(canvas.createCanvas(20,20)).render('duotone'))),0);
  assert.equal(mass(pixels(c.render('duotone',0))),0);
});

test('weak assignment scales each plate without changing the full-strength separation geometry', () => {
  const c=fixture(mask), shape=pixels(mask), full=c.risoDuotonePlates(shape,mask.width,mask.height,1,settings,0);
  for(const strength of [.01,.05,.25,.5]) {
    const source=shape.slice();for(let i=3;i<source.length;i+=4)source[i]=Math.round(source[i]*strength);
    const low=c.risoDuotonePlates(source,mask.width,mask.height,1,settings,0,shape);
    for(const key of ['a','b']) for(let i=3;i<shape.length;i+=4) assert.ok(Math.abs(low[key][i]-full[key][i]*strength)<=1.5, `${strength}/${key}/${i}`);
    assert.ok(mass(low.a)+mass(low.b)>0);
  }
});

test('all controls change actual plates/output; endpoints and closed time orbit remain finite', t => {
  const c=fixture(mask), source=pixels(mask), base=c.risoDuotonePlates(source,mask.width,mask.height,1,settings,0);
  const ranges={depth:[0,160],pitch:[1,48],pressure:[0,4],balance:[-1,1],overlap:[0,1.5],grain:[0,2]};
  let maxMs=0;
  for(const [key,values] of Object.entries(ranges)) for(const value of values) {
    const profile={...settings,[key]:value}, start=performance.now();
    const plates=c.risoDuotonePlates(source,mask.width,mask.height,1,profile,0);
    maxMs=Math.max(maxMs,performance.now()-start);
    assert.notDeepEqual(plates,base,key+'/'+value);
    for(const ink of ['a','b']) assert.ok(plates[ink].every(v=>Number.isFinite(v)&&v>=0&&v<=255));
  }
  const zero=pixels(c.render('duotone',1,0));
  assert.deepEqual(pixels(c.render('duotone',1,1)),zero);
  assert.deepEqual(pixels(c.render('duotone',1,-.125)),pixels(c.render('duotone',1,.875)));
  const left=pixels(c.render('duotone',1,1-1e-6)),right=pixels(c.render('duotone',1,1e-6));
  assert.ok(left.reduce((sum,v,i)=>sum+Math.abs(v-right[i]),0)/left.length < .05);
  c.compositionState.enabled=false;assert.deepEqual(pixels(c.render('duotone',1,.37)),zero);
  c.params.risoRegister=0;assert.notDeepEqual(pixels(c.render('duotone')),zero);
  t.diagnostic(JSON.stringify({ maxMs:+maxMs.toFixed(1), scope:'260x190 native supplied mask; not browser FPS' }));
});

test('actual per-glyph masks keep unequal assignment, exclude unapplied text and do not mutate glyphs', () => {
  const c=fixture(canvas.createCanvas(600,200),{fontFamily:'Arial',fontSize:90,fontWeight:700,risoScreenPitch:1,risoRegister:0,risoGrain:0});
  vm.runInContext(extract('buildSurfaceMask')+'\n'+extract('drawSurfaceGlyph'),c);c.baselineOffset=()=>90;
  const glyph=(x,strength)=>({ch:'H',x,y:45,w:85,h:90,ox:x,oy:45,tx:0,ty:0,scaleX:1,scaleY:1,surface:{...c.params,risoSeparation:strength}});
  const glyphs=[glyph(25,1),glyph(225,.25),glyph(425,0)], before=JSON.stringify(glyphs), output=canvas.createCanvas(600,200);
  let plates;const original=c.risoDuotonePlates;c.risoDuotonePlates=(...args)=>(plates=original(...args));
  c.renderRisoDuotone(output.getContext('2d'),glyphs,600,200,1,{s:1,dx:0,dy:0},{},false);
  for(const key of ['a','b']) {
    const totals=[0,0,0];for(let i=3;i<plates[key].length;i+=4)totals[Math.floor(((i-3)/4%600)/200)]+=plates[key][i];
    assert.ok(totals[0]>0);assert.ok(totals[1]/totals[0]>.24&&totals[1]/totals[0]<.26);assert.equal(totals[2],0);
  }
  assert.equal(JSON.stringify(glyphs),before);
});

test('independent colors do not modify the source; Canvas state also restores after a draw failure', () => {
  const c=fixture(mask), original=pixels(mask), base=pixels(c.render('duotone'));
  c.params.risoColorA='#102010';assert.notDeepEqual(pixels(c.render('duotone')),base);
  c.params.risoColorB='#fb9700';const second=pixels(c.render('duotone'));assert.notDeepEqual(second,base);
  c.params.paper='#b30099';assert.deepEqual(pixels(c.render('duotone')),second);assert.deepEqual(pixels(mask),original);
  const ctx=canvas.createCanvas(mask.width,mask.height).getContext('2d');ctx.globalAlpha=.27;ctx.globalCompositeOperation='screen';ctx.translate(5,8);
  const before=ctx.getTransform().toString(),alpha=ctx.globalAlpha;
  ctx.drawImage=()=>{throw Error('injected draw failure');};
  assert.throws(()=>c.renderRisoDuotone(ctx,[{surface:{...c.params,risoSeparation:1}}],mask.width,mask.height,1,{s:1},{},false),/injected/);
  assert.equal(ctx.globalAlpha,alpha);assert.equal(ctx.globalCompositeOperation,'screen');assert.equal(ctx.getTransform().toString(),before);
});

test('mode-specific controls hide/disable and recover on mode changes without losing values (DOM mock)', () => {
  const c=fixture(mask), nodes={pRisoPlateMap:{value:'area'},risoTonalControls:{},pRisoToneDepth:{value:'101'},pRisoScreenPitch:{value:'4.25'}};
  c.document={getElementById:id=>nodes[id]};
  vm.runInContext(['parameterDisabledReasons','updateParameterRowAvailability','setParameterDisabledReason','syncRisoControls']
    .map(extract).join('\n'),c);
  for(const mode of ['area','duotone','legacy','duotone']) {
    nodes.pRisoPlateMap.value=mode;c.syncRisoControls();
    assert.equal(nodes.risoTonalControls.hidden,mode!=='duotone');assert.equal(nodes.pRisoToneDepth.disabled,mode!=='duotone');
    assert.equal(nodes.pRisoScreenPitch.disabled,mode!=='duotone');assert.equal(nodes.pRisoToneDepth.value,'101');
  }
  assert.ok(extract('syncOperatorParameterAvailability').includes('syncRisoControls()'));
  assert.ok(extract('syncUI').includes('syncOperatorParameterAvailability()'));
  assert.ok(extract('refreshParameterUI').includes('syncOperatorParameterAvailability()'));
});

test('actual broad/sparse Batch normalization keeps the new master and clamps both new axes', () => {
  const c=fixture(mask);
  vm.runInContext(html.match(/      var BATCH_PARAM_KEYS = \[[^]*?\n      \];/)[0]+'\n'+html.match(/      var BATCH_PARAM_LIMITS = \{[^]*?\n      };/)[0]+'\n'+extract('normalizeBatchProfiles'),c);
  c.BATCH_PROFILE_KEYS=['latin','latin_upper'];c.BATCH_TARGETS={byKey:{latin:{},latin_upper:{test:()=>true}}};
  const normalized=c.normalizeBatchProfiles({latin:{risoPlateMap:'duotone',risoToneDepth:999,risoScreenPitch:-9},latin_upper:{risoPlateMap:'duotone',risoToneDepth:38.5,risoScreenPitch:2.25}});
  assert.equal(normalized.latin.risoPlateMap,'duotone');assert.equal(normalized.latin.risoToneDepth,160);assert.equal(normalized.latin.risoScreenPitch,1);
  assert.equal(normalized.latin_upper.risoScreenPitch,2.25);assert.equal(normalized.latin_upper.risoToneDepth,38.5);
  const invalid=c.normalizeBatchProfiles({latin_upper:{risoToneDepth:Infinity,risoScreenPitch:NaN,risoPlateMap:'unknown'}});
  assert.equal(invalid.latin_upper,undefined);
});
