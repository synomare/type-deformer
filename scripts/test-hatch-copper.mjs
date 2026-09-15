import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
import { fixture, textMask, canvas, html, installHatchOutput } from './hatch-copper-fixture.mjs';
import { exportFixture } from './export-fixture.mjs';
import { setMeasuredPageSource } from './page-layout-fixture.mjs';
const extract = name => html.match(new RegExp('^      function ' + name + '\\([^]*?^      }', 'm'))[0];
const pixels = c => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
const mass = a => a.reduce((n, v, i) => n + (i % 4 === 3 ? v : 0), 0);
const mask = textMask('B O', 105, 'Times New Roman', 260, 180);
const settings = { spacing: 5, stroke: 1.2, warp: .82, depth: 1.36, angle: -24*Math.PI/180, seed: 41 };

test('Copperplate is selectable without replacing any grammar, range, default, or storage route', () => {
  const c=fixture(mask);
  assert.equal(c.params.hatchGrammar,'tonal');
  assert.deepEqual(Array.from(c.BATCH_PARAM_OPTIONS.hatchGrammar),['legacy','tonalV29','crosscutV29','burinV29','woodcutV29','tonal','crosscut','burin','woodcut','copperplate']);
  assert.match(html,/<option value="copperplate">Copperplate/);
  assert.match(html,/id="pHatchGrammar" aria-describedby="hatchCopperHint"/);
  assert.ok(html.includes("bindProfileSelect('pHatchGrammar', 'hatchGrammar', applyAllOperatorVisuals)"));
  assert.ok(extract('snapshotGlyphs').includes('hatchGrammar: deform.hatchGrammar'));
  assert.ok(extract('normalizeParams').includes("chooseParam('hatchGrammar', BATCH_PARAM_OPTIONS.hatchGrammar)"));
  assert.match(extract('projectData'),/version: 92/);
});

test('signed smoothing matches an independent clamped convolution, including counters and edge pixels', () => {
  const c=fixture(mask),w=9,h=7,n=w*h;
  const field={inside:Uint8Array.from({length:n},(_,i)=>i%7<3?1:0),distance:Float32Array.from({length:n},(_,i)=>(i*7%11)/3)};
  for(const radius of [1,2,4]) {
    let oracle=Float32Array.from(field.distance,(d,i)=>(d+.5)*(field.inside[i]?1:-1));
    for(let pass=0;pass<2;pass++) {
      let horizontal=new Float32Array(n),vertical=new Float32Array(n);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
        let sum=0;for(let dx=-radius;dx<=radius;dx++)sum+=oracle[y*w+Math.max(0,Math.min(w-1,x+dx))];
        horizontal[y*w+x]=sum/(radius*2+1);
      }
      for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
        let sum=0;for(let dy=-radius;dy<=radius;dy++)sum+=horizontal[Math.max(0,Math.min(h-1,y+dy))*w+x];
        vertical[y*w+x]=sum/(radius*2+1);
      }
      oracle=vertical;
    }
    assert.deepEqual(Array.from(c.hatchCopperSmooth(field,w,h,radius)),Array.from(oracle));
  }
});

test('analytic line coverage agrees with an independent sampled footprint without pitch reduction', () => {
  const c=fixture(mask);
  for(const spacing of [.3,1,5,80])for(const half of [0,.07,.2,.5])for(const footprint of [.1,.8,2,8])for(const position of [-10.7,-.03,.22,6.61]) {
    let sum=0;const count=8192;
    for(let i=0;i<count;i++) {
      const v=position+((i+.5)/count-.5)*footprint;
      const d=Math.abs(v-Math.round(v/spacing)*spacing);
      sum+=d<=Math.min(spacing/2,half)?1:0;
    }
    assert.ok(Math.abs(c.hatchCopperCoverage(position,spacing,half,footprint)-sum/count)<.004);
  }
  assert.equal(c.hatchCopperCoverage(.2,1,.5,10),1);
});

test('empty, holes, zero amount and low assignment preserve geometry, source and proportional ink mass', () => {
  const c=fixture(mask),shape=pixels(mask),saved=shape.slice();
  const full=c.hatchCopperPlate(shape,shape,mask.width,mask.height,1,settings,0);
  assert.ok(mass(full)>0);
  for(let i=3;i<shape.length;i+=4)if(!shape[i])assert.equal(full[i],0);
  for(const strength of [.01,.05,.25,.5]) {
    const source=shape.slice();for(let i=3;i<source.length;i+=4)source[i]=Math.round(source[i]*strength);
    const low=c.hatchCopperPlate(source,shape,mask.width,mask.height,1,settings,0);
    for(let i=3;i<source.length;i+=4)assert.ok(Math.abs(low[i]-full[i]*strength)<=1.5);
    assert.ok(mass(low)>0);
  }
  assert.deepEqual(shape,saved);
  assert.equal(mass(pixels(c.render('copperplate',0))),0);
  assert.equal(mass(pixels(fixture(canvas.createCanvas(20,20)).render('copperplate'))),0);
});

test('all five axes, extreme values, seeds and time have actual output effects; orbit closes continuously', t => {
  const c=fixture(mask),source=pixels(mask),baseline=c.hatchCopperPlate(source,source,260,180,1,settings,0);
  let maxMs=0;
  for(const [key,values] of Object.entries({spacing:[1,80],stroke:[.1,12],warp:[0,5],depth:[0,4],angle:[-Math.PI,Math.PI/2],seed:[7,900]}))for(const value of values) {
    const start=performance.now(),changed=c.hatchCopperPlate(source,source,260,180,1,{...settings,[key]:value},0);
    maxMs=Math.max(maxMs,performance.now()-start);assert.notDeepEqual(changed,baseline,key+'/'+value);
    assert.ok(changed.every(v=>Number.isFinite(v)&&v>=0&&v<=255));
  }
  const zero=pixels(c.render('copperplate',1,0));
  assert.deepEqual(pixels(c.render('copperplate',1,1)),zero);
  assert.notDeepEqual(pixels(c.render('copperplate',1,.25)),zero);
  assert.deepEqual(pixels(c.render('copperplate',1,-.125)),pixels(c.render('copperplate',1,.875)));
  const left=pixels(c.render('copperplate',1,1-1e-6)),right=pixels(c.render('copperplate',1,1e-6));
  assert.ok(left.reduce((n,v,i)=>n+Math.abs(v-right[i]),0)/left.length<.05);
  c.compositionState.enabled=false;assert.deepEqual(pixels(c.render('copperplate',1,.37)),zero);
  t.diagnostic(`260x180 native-mask kernel max ${maxMs.toFixed(1)}ms; not browser FPS`);
});

test('modern Hatch Engrave reserves its exterior plate and relief at declared extremes', () => {
  const c = fixture(mask, { hatchGrammar: 'woodcut', hatchSpacing: 80, hatchDepth: 4, hatchStroke: 12 });
  const glyph = { x: 0, y: 0, w: 600, h: 240, opacity: 1,
    surface: { ...c.params, hatchEngrave: 1 } };
  const pad = c.hatchEngraveEffectPad([glyph]);
  const declared = 80 * (0.58 + 4 * 0.16) + 2.4 + 6;
  assert.ok(pad >= declared, `expected at least ${declared}, received ${pad}`);
  for (const grammar of ['legacy', 'tonalV29', 'copperplate']) {
    glyph.surface.hatchGrammar = grammar;
    assert.equal(c.hatchEngraveEffectPad([glyph]), 0, grammar);
  }
});

test('actual per-glyph masks retain unequal amounts and exclude unassigned or invisible glyphs', () => {
  const c=fixture(canvas.createCanvas(600,200),{fontFamily:'Arial',fontSize:90,fontWeight:700,hatchWarp:0,hatchSpacing:1});
  vm.runInContext(extract('buildSurfaceMask')+'\n'+extract('drawSurfaceGlyph'),c);c.baselineOffset=()=>90;
  const glyph=(x,strength,opacity=1)=>({ch:'H',x,y:45,w:85,h:90,ox:x,oy:45,tx:0,ty:0,scaleX:1,scaleY:1,opacity,surface:{...c.params,hatchEngrave:strength}});
  const glyphs=[glyph(25,1),glyph(175,.25),glyph(325,0),glyph(475,1,0)],saved=JSON.stringify(glyphs),output=canvas.createCanvas(600,200);
  let source,shape;const original=c.hatchCopperPlate;c.hatchCopperPlate=(...args)=>{[source,shape]=args;return original(...args);};
  c.hatchCopperRender(output.getContext('2d'),glyphs,600,200,1,{s:1,dx:0,dy:0},{},false);
  const totals=[0,0,0,0],shapes=[0,0,0,0];
  for(let i=3;i<source.length;i+=4) {const region=Math.floor(((i-3)/4%600)/150);totals[region]+=source[i];shapes[region]+=shape[i];}
  assert.ok(totals[0]>0);assert.ok(totals[1]/totals[0]>.24&&totals[1]/totals[0]<.26);
  assert.equal(shapes[0],shapes[1]);assert.equal(totals[2]+totals[3]+shapes[2]+shapes[3],0);
  assert.equal(JSON.stringify(glyphs),saved);
});

test('FX color is independent of paper/text color, and caller Canvas state survives exceptions', () => {
  const c=fixture(mask),base=pixels(c.render('copperplate')),source=pixels(mask);
  c.params.hatchColor='#102030';const changed=pixels(c.render('copperplate'));assert.notDeepEqual(changed,base);
  c.params.paper='#aa0044';c.params.ink='#22ff00';assert.deepEqual(pixels(c.render('copperplate')),changed);assert.deepEqual(pixels(mask),source);
  const ctx=canvas.createCanvas(260,180).getContext('2d');ctx.translate(8,9);ctx.globalAlpha=.37;ctx.globalCompositeOperation='screen';
  const transform=ctx.getTransform().toString(),alpha=ctx.globalAlpha;
  ctx.drawImage=()=>{throw Error('injected paint failure');};
  assert.throws(()=>c.hatchCopperRender(ctx,[{surface:{hatchEngrave:1}}],260,180,1,{s:1},{},false),/injected/);
  assert.equal(ctx.getTransform().toString(),transform);assert.equal(ctx.globalAlpha,alpha);assert.equal(ctx.globalCompositeOperation,'screen');
});

test('actual Batch normalization accepts Copperplate and still rejects unknown grammars', () => {
  const c=fixture(mask);
  vm.runInContext(html.match(/      var BATCH_PARAM_KEYS = \[[^]*?\n      \];/)[0]+'\n'+html.match(/      var BATCH_PARAM_LIMITS = \{[^]*?\n      };/)[0]+'\n'+extract('normalizeBatchProfiles'),c);
  c.BATCH_PROFILE_KEYS=['latin','latin_upper'];c.BATCH_TARGETS={byKey:{latin:{},latin_upper:{test:()=>true}}};
  const profiles=c.normalizeBatchProfiles({latin:{hatchGrammar:'copperplate',hatchWarp:999},latin_upper:{hatchGrammar:'copperplate',hatchSpacing:2}});
  assert.equal(profiles.latin.hatchGrammar,'copperplate');assert.equal(profiles.latin.hatchWarp,5);assert.equal(profiles.latin_upper.hatchSpacing,2);
  assert.equal(c.normalizeBatchProfiles({latin_upper:{hatchGrammar:'unknown'}}).latin_upper,undefined);
});

test('shared Surface compositor, independent Mixer and actual PNG/SVG output handlers carry Copperplate ink', async t => {
  const {c,downloads,statuses}=exportFixture();installHatchOutput(c);
  Object.assign(c.params,{fontSize:72,fontFamily:'"Yu Mincho"',textMeasure:16,lineHeight:1.3,
    artboard:'custom',abW:760,abH:360,fit:true,transparentBg:true,hatchSpacing:3,hatchWarp:1.1});
  setMeasuredPageSource(c,'B O / 永書\nCOPPER');
  for(const m of c.metrics)Object.assign(c.operatorState(m, 'hatchEngrave'),{current:1,toggled:true});
  c.invalidateCompositionSource();
  const params=JSON.stringify(c.params),base=c.renderCanvas(1,false),data=pixels(base);
  assert.ok(mass(data)>0);assert.equal(JSON.stringify(c.params),params,'render cannot change UI params/camera');
  c.params.hatchOpacity=.25;const low=pixels(c.renderCanvas(1,false));
  assert.ok(mass(low)/mass(data)>.24&&mass(low)/mass(data)<.26,'FX alpha is applied once by Mixer');
  c.params.hatchOpacity=0;assert.equal(mass(pixels(c.renderCanvas(1,false))),0,'TEXT remains hidden even with FX muted');
  c.params.hatchSourceOpacity=1;assert.ok(mass(pixels(c.renderCanvas(1,false)))>mass(data),'text can be restored independently');
  c.params.hatchSourceOpacity=0;c.params.hatchOpacity=1;
  c.exportPng();assert.equal(downloads.length,1);
  assert.deepEqual(Buffer.from(await downloads[0].blob.arrayBuffer()),base.toBuffer('image/png'));
  c.runSvgExport();assert.equal(downloads.length,2,JSON.stringify(statuses.at(-1)));
  const svg=await downloads[1].blob.text();assert.match(svg,/data:image\/png;base64,/);assert.match(svg,/copperplate/);
  const embedded=svg.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/)?.[1];assert.ok(embedded);
  const png=await canvas.loadImage(Buffer.from(embedded,'base64'));assert.ok(png.width>0&&png.height>0);
  const decoded=canvas.createCanvas(png.width,png.height);decoded.getContext('2d').drawImage(png,0,0);assert.ok(mass(pixels(decoded))>0);
  assert.deepEqual(pixels(decoded),data,'the SVG embedded FX matches the transparent PNG at the same dimensions');
  assert.equal(JSON.stringify(c.params),params);
  t.diagnostic(`${c.metrics.length} native glyphs; actual shared compositor + PNG/SVG handlers, synthetic layout/download, fixed existing canonical raster budget`);
});
