import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {exportFixture,canvas,html} from './export-fixture.mjs';
import {extract} from './paragraph-current-fixture.mjs';
import {installHatchOutput} from './hatch-copper-fixture.mjs';
const kernelNames=['chromeStudioBlur','chromeStudioEnvironment','chromeStudioRelief','chromeStudioPlate'];
function core(){const c=vm.createContext({Math});vm.runInContext(['surfaceBoundaryDistance',...kernelNames].map(extract).join('\n'),c);return c;}
function mask(){const m=canvas.createCanvas(160,150),ctx=m.getContext('2d');ctx.fillStyle='white';ctx.font='bold 132px Arial';ctx.fillText('B',30,122);return ctx.getImageData(0,0,160,150).data;}
const settings={bevel:18,angle:-.6,bands:7,contrast:1.35,warp:.3,voltage:3.2,roughness:.12,color:[126,143,166],phase:0};
function install(c){
  installHatchOutput(c);c.SURFACE_OPERATOR_IDS=['chromeReliquary'];c.SURFACE_RENDER_ORDER_DEFAULT=['chromeReliquary'];
  vm.runInContext([...kernelNames,'surfaceNoise01','surfaceHexRgb','chromeReflectionMotion','renderChromeStudio','renderChromeReliquary'].map(extract).join('\n'),c);
  Object.assign(c.params,{chromeModel:'studio',chromeOpacity:1,chromeSourceOpacity:0,chromeBlend:'source-over'});return c;
}
test('Studio kernel is integrated exactly, selectable and keeps the prior Acid default',()=>{
  const prototype=fs.readFileSync(new URL('../.codex/prototypes/chrome-studio/kernel.js',import.meta.url),'utf8');
  for(const name of kernelNames.filter(name=>name!=='chromeStudioPlate'))assert.ok(prototype.includes(extract(name)),'integrated '+name);
  const original=vm.createContext({Math});vm.runInContext(extract('surfaceBoundaryDistance')+'\n'+prototype,original);
  const current=core(),shape=mask();
  for(const variant of [settings,{...settings,phase:1.7,roughness:.9},{...settings,bevel:4,bands:18}])assert.deepEqual(Array.from(current.chromeStudioPlate(shape,shape,160,150,variant)),Array.from(original.chromeStudioPlate(shape,shape,160,150,variant)),'reference-resolution pixels remain identical');
  assert.match(html,/chromeModel: 'acid'/);assert.match(html,/chromeModel: \['acid', 'studio'\]/);
  assert.match(html,/bindProfileSelect\('pChromeModel'/);assert.match(html,/chromeRoughness: deform.chromeRoughness/);
});
test('screened relief has zero exterior and solves a smooth nonnegative interior without a medial seam',()=>{
  const c=core(),shape=mask(),field=c.surfaceBoundaryDistance(shape,160,150),height=c.chromeStudioRelief(field,160,150,18);
  let maxResidual=0;
  for(let i=0;i<height.length;i++){
    assert.ok(Number.isFinite(height[i])&&height[i]>=0&&height[i]<=18);
    if(!field.inside[i])assert.equal(height[i],0);
    if(field.inside[i]&&i>160&&i<height.length-160&&i%160>0&&i%160<159){
      const residual=Math.abs(height[i]*(4+4/324)-height[i-1]-height[i+1]-height[i-160]-height[i+160]-4/18);
      maxResidual=Math.max(maxResidual,residual);
    }
  }
  assert.ok(maxResidual<.025,`relaxation residual ${maxResidual}`);
});
test('all seven axes alter actual pixels, full loop closes and tiny assignments preserve relief rather than flattening it',t=>{
  const c=core(),shape=mask(),draw=p=>c.chromeStudioPlate(shape,shape,160,150,{...settings,...p}),start=performance.now(),base=draw({});
  for(const change of [{bevel:2},{angle:2},{bands:20},{contrast:4},{warp:3},{voltage:0},{roughness:1}])assert.notDeepEqual(draw(change),base,JSON.stringify(change));
  assert.deepEqual(draw({phase:Math.PI*2}),base);assert.notDeepEqual(draw({phase:Math.PI}),base);
  const low=shape.slice();for(let i=3;i<low.length;i+=4)low[i]=Math.round(low[i]*.2);
  const light=c.chromeStudioPlate(shape,low,160,150,settings);
  for(let i=0;i<light.length;i+=4){assert.equal(light[i+3],low[i+3]);if(low[i+3])assert.deepEqual(light.slice(i,i+3),base.slice(i,i+3));}
  assert.ok(draw({bevel:96,warp:4,contrast:4,roughness:0,bands:24,voltage:6}).every(Number.isFinite));
  t.diagnostic(`${(performance.now()-start).toFixed(1)}ms for 13 native-mask renders at 160x150; not browser FPS`);
});
test('empty masks, real counters, source alpha and FX colors remain independent',()=>{
  const c=core(),shape=mask(),base=c.chromeStudioPlate(shape,shape,160,150,settings);
  for(let i=3;i<shape.length;i+=4)assert.equal(base[i],shape[i]);
  const blank=new Uint8ClampedArray(shape.length);assert.ok(c.chromeStudioPlate(blank,blank,160,150,settings).every(v=>v===0));
  assert.notDeepEqual(c.chromeStudioPlate(shape,shape,160,150,{...settings,color:[255,30,20]}),base);
});
test('actual shared compositor and PNG/SVG carry Studio with TEXT/FX independent and no scene mutation',async()=>{
  const {c,downloads}=exportFixture();install(c);
  Object.assign(c.params,{fontSize:48,artboard:'custom',abW:460,abH:200,transparentBg:true});
  c.setSource('B O 永','chromeReliquary');
  const before=JSON.stringify(c.params),scene=c.snapshotRenderableScene();
  const png=c.renderCanvas(1);c.exportPng();c.runSvgExport();assert.equal(downloads.length,2);
  const svg=await downloads[1].blob.text();assert.match(svg,/"model":"studio","roughness":0.12/);
  const embedded=svg.match(/data-effect-layer="surface-fx"[^]*?href="data:image\/png;base64,([^"]+)"/)[1];
  const fx=await canvas.loadImage(Buffer.from(embedded,'base64')),out=canvas.createCanvas(png.width,png.height);out.getContext('2d').drawImage(fx,0,0);
  assert.deepEqual(out.toBuffer('image/png'),png.toBuffer('image/png'));assert.equal(JSON.stringify(c.params),before);
  c.params.chromeOpacity=0;const hidden=c.renderCanvas(1).getContext('2d').getImageData(0,0,460,200).data;
  assert.ok(hidden.every(v=>v===0));c.params.chromeSourceOpacity=1;
  assert.ok(c.renderCanvas(1).getContext('2d').getImageData(0,0,460,200).data.some(v=>v));
  assert.equal(c.snapshotRenderableScene().glyphs.length,scene.glyphs.length);
});
test('Batch mode and softness normalize into the existing profile/snapshot machinery',()=>{
  const {c}=exportFixture();install(c);c.PARAM_DEFAULTS={...c.params};
  vm.runInContext(['BATCH_PARAM_KEYS','BATCH_PARAM_LIMITS'].map(name=>html.match(new RegExp('      var '+name+' = [^]*?\\n      [}\\]];'))[0]).join('\n'),c);
  c.BATCH_PROFILE_KEYS=['latin'];c.BATCH_TARGETS={byKey:{latin:{}}};vm.runInContext(extract('normalizeBatchProfiles'),c);
  const profile=c.normalizeBatchProfiles({latin:{chromeModel:'studio',chromeRoughness:.65}});
  assert.equal(profile.latin.chromeModel,'studio');assert.equal(profile.latin.chromeRoughness,.65);
  c.batchProfileForKey=()=>({...c.params,...profile.latin});c.setSource('A','chromeReliquary');
  // setSource sets source-parameter profiling; restore our explicit Batch mock.
  c.batchProfileForKey=()=>({...c.params,...profile.latin});
  const g=c.snapshotGlyphs(true)[0];assert.equal(g.surface.chromeModel,'studio');assert.equal(g.surface.chromeRoughness,.65);
});
test('Mirror softness is available only when the effective profile selects Studio',()=>{
  const input={disabled:false},c=vm.createContext({activeBatchProfile:'latin',document:{getElementById:id=>id==='pChromeRoughness'?input:null}});
  vm.runInContext(['parameterDisabledReasons','updateParameterRowAvailability','setParameterDisabledReason','syncChromeControls']
    .map(extract).join('\n'),c);
  c.batchProfileForKey=()=>({chromeModel:'acid'});c.syncChromeControls();assert.equal(input.disabled,true);
  c.batchProfileForKey=()=>({chromeModel:'studio'});c.syncChromeControls();assert.equal(input.disabled,false);
});
