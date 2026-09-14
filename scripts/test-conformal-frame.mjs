import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const block=html.match(/^      \/\/ BEGIN CONFORMAL TYPE GENERATED\n[\s\S]*?^      \/\/ END CONFORMAL TYPE GENERATED/m)[0];
let paths=0, native=[], paints=[], matrix={a:1,b:0,c:0,d:1}, matrixStack=[], active;
class TestPath { constructor(){paths++;this.commands=[];} moveTo(x,y){this.commands.push(['M',x,y]);} lineTo(x,y){this.commands.push(['L',x,y]);} closePath(){this.commands.push(['Z']);} }
const ctx={save(){matrixStack.push(matrix);},restore(){matrix=matrixStack.pop();},getTransform(){return matrix;},
  fill(path){paints.push({id:active.id,alpha:this.globalAlpha,commands:path ? path.commands : this.commands});},
  beginPath(){this.commands=[];},moveTo:TestPath.prototype.moveTo,lineTo:TestPath.prototype.lineTo,closePath:TestPath.prototype.closePath};
const elements=new Map();
const params={fontFamily:'Synthetic',fontWeight:400,fontSize:192,conformalAmount:.82,conformalPower:-1,conformalSpiral:0,conformalAngle:-35,conformalMotion:.55};
const runtime=vm.createContext({params,compositionState:{enabled:true,phase:.3},Path2D:TestPath,
  surfaceGlyphStrength:(g,id)=>g.surface?.[id]||0,surfaceOutputOpacity:()=>1,surfaceEffectColor:()=> '#321',
  spectralGlyphFrame(ctx,g,scale,L){active=g;matrix={a:g.scaleX*scale*L.s,b:0,c:g.skewX||0,d:g.scaleY*scale*L.s};},
  drawSurfaceGlyph(ctx,g){native.push(g.id);},scheduleSurfaceFxDraw(){},scheduleCompositionDraw(){},
  document:{getElementById(id){if(!elements.has(id))elements.set(id,{hidden:false,setAttribute(){}});return elements.get(id);}},
  requestAnimationFrame(){return 1;},cancelAnimationFrame(){}
});
new vm.Script(block).runInContext(runtime);
const outline=Array.from({length:2048},(_,i)=>({x:80*Math.cos(i*Math.PI/1024),y:110*Math.sin(i*Math.PI/1024)}));
const compiled=runtime.ConformalType.compileConformalGlyph(runtime.ConformalType.prepareConformalGlyph([{points:outline}]));
const data={compiled,pointCount:2048,advance:160,ascent:110,descent:110,middleOffset:40};
runtime.conformalGlyphData=()=>data;
const glyphs=Array.from({length:300},(_,i)=>({id:i,ch:i%3===0?'A':'B',opacity:.4+(i%3)*.2,
  surface:{conformalType:1,conformalSpiral:i%3===2?2.5:0},scaleX:1+(i%5),scaleY:1,skewX:0}));
runtime.conformalPrepare(glyphs);while(runtime.conformalPool.state().pending)runtime.conformalPool.advance();
const original=runtime.ConformalType.renderConformalLod;let generated=[];
runtime.ConformalType.renderConformalLod=(...args)=>{const result=original(...args);generated.push({settings:args[1],tolerance:args[3].tolerance,shape:result});return result;};
const render=items=>{paths=0;paints=[];native=[];generated=[];runtime.renderConformalTypeDirect(ctx,items,1,{s:1,dx:0,dy:0},{},false);};
render(glyphs);
assert.equal(generated.length,3,'300 copies require only three distinct geometry evaluations');assert.equal(paths,3,'one retained vector path per shape');
assert.equal(paints.length,300);assert.deepEqual(paints.map(p=>p.id),glyphs.map(g=>g.id),'original paint order is retained');
assert.deepEqual(paints.map(p=>p.alpha),glyphs.map(g=>g.opacity),'per-copy opacity survives grouping');
for(const g of generated)assert.equal(g.tolerance,.04,'strictest transform (5x) chooses the shared error budget');
const at3=paints.map(p=>JSON.stringify(p.commands));
render([...glyphs].reverse());assert.deepEqual(paints.map(p=>JSON.stringify(p.commands)).reverse(),at3,'geometry is independent of request order');
runtime.Path2D=undefined;render(glyphs);assert.deepEqual(paints.map(p=>JSON.stringify(p.commands)),at3,'non-Path2D fallback produces identical paths');
runtime.Path2D=TestPath;
runtime.compositionState.phase=0;render(glyphs);const at0=paints.map(p=>JSON.stringify(p.commands));
runtime.compositionState.phase=1;render(glyphs);assert.deepEqual(paints.map(p=>JSON.stringify(p.commands)),at0,'phase 0/1 loop survives sharing');
const missing={...glyphs[0],ch:'unprepared'};assert.throws(()=>render([missing]),e=>e.code==='CONFORMAL_PENDING');assert.equal(paints.length,0);
const nativeGlyph={...missing,surface:{conformalType:1,conformalAmount:0}};render([nativeGlyph]);assert.deepEqual(native,[nativeGlyph.id]);assert.equal(generated.length,0);
paints=[];native=[];runtime.renderConformalTypeDirect(ctx,[missing],1,{s:1},{},true);assert.equal(runtime.conformalRenderError,'','pending is not an error');
const extreme={...glyphs[0],scaleX:1e10};
paints=[];assert.throws(()=>render([extreme]),/precision budget/);assert.equal(paints.length,0,'strict precision failure precedes partial paint');
assert.equal(matrixStack.length,0,'all prepass and paint transforms are restored');
console.log('Conformal frame: 300 copies -> 3 geometry/path builds; strictest 0.2px tolerance, order/alpha, reverse order, Path2D fallback, loop, native/missing source and transactional precision checks passed (VM/mocks, not browser FPS).');
