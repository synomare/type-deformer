import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const extract=name=>{const source=html.match(new RegExp('^      function '+name+'\\([\\s\\S]*?^      \\}','m'));assert.ok(source,name);return source[0];};
const block=html.match(/\/\/ BEGIN CALLIGRAPHY FIELD GENERATED[\s\S]*?\/\/ END CALLIGRAPHY FIELD GENERATED/)[0];
const params={fontSize:192,fontWeight:700,fontFamily:'serif',vertical:false,calligraphyTool:'broad',calligraphyExpansion:0,calligraphyContrast:.4,calligraphyAngle:32,calligraphyPulse:.2,calligraphyWetness:.2};
const runtime=vm.createContext({params,compositionState:{enabled:true,phase:0},BATCH_PARAM_OPTIONS:{calligraphyTool:['legacy','broad','brush','split','chisel']},
  surfaceGlyphStrength:g=>g.surface?.calligraphicStress||0,surfaceOutputOpacity:()=>1,baselineOffset:()=>0});
new vm.Script(block+'\n'+extract('spectralGlyphFrame')+'\n'+extract('drawSurfaceGlyph')).runInContext(runtime);
const context=()=>({matrix:[1,0,0,1,0,0],stack:[],native:[],
  setTransform(...m){this.matrix=m;},transform(a,b,c,d,e,f){const[A,B,C,D,E,F]=this.matrix;this.matrix=[A*a+C*b,B*a+D*b,A*c+C*d,B*c+D*d,A*e+C*f+E,B*e+D*f+F];},
  translate(x,y){this.transform(1,0,0,1,x,y);},scale(x,y){this.transform(x,0,0,y,0,0);},rotate(r){this.transform(Math.cos(r),Math.sin(r),-Math.sin(r),Math.cos(r),0,0);},
  save(){this.stack.push(this.matrix.slice());},restore(){this.matrix=this.stack.pop();},
  getTransform(){return Object.fromEntries(['a','b','c','d','e','f'].map((key,i)=>[key,this.matrix[i]]));},
  point(x,y){const[a,b,c,d,e,f]=this.matrix;return[a*x+c*y+e,b*x+d*y+f];},
  fillText(ch,x,y){const scale=params.fontSize/192;this.nativeAxes=this.matrix.slice(0,4);this.native.push(this.point(x-(this.textAlign==='center'?90*scale:0),y+(this.textBaseline==='middle'?70*scale:0)));},
  createImageData(w,h){return{data:new Uint8ClampedArray(w*h*4)};},putImageData(image){this.pixels=image.data.slice();}
});
const ring=(rx,ry,n,reverse=false)=>({points:Array.from({length:n},(_,i)=>{const a=i/n*Math.PI*2*(reverse?-1:1);return{x:48+rx*Math.cos(a),y:48+ry*Math.sin(a)};})});
const rings=[ring(23,34,101),ring(9,17,49,true)],body=runtime.CalligraphyField.prepareCalligraphyBody(rings);
const glyph={ch:'B',x:0,y:0,w:96,h:96,ox:48,oy:48,tx:0,ty:0,rot:0,skewX:0,skewY:0,scaleX:1,scaleY:1,opacity:1,surface:{calligraphicStress:1}};
const source={body,advance:180,middleOffset:70};
for(const vertical of [false,true])for(const grid of [false,true])for(const upright of [false,true]){
  params.vertical=vertical;const g={...glyph,grid,upright,rot:33,skewX:-19,skewY:12,scaleX:-1.3,scaleY:.8,tx:33,ty:-27};
  const native=context(),reconstructed=context(),L={dx:180,dy:-55,s:1.2};
  runtime.drawSurfaceGlyph(native,g,2,L,{},1,'#000');runtime.spectralGlyphFrame(reconstructed,g,2,L,{},source);
  assert.ok(reconstructed.point(0,0).every((v,i)=>Math.abs(v-native.native[0][i])<1e-9),'Native glyph placement agrees in 8 frames');
  for(let axis=0;axis<4;axis++)assert.ok(Math.abs(reconstructed.matrix[axis]-native.nativeAxes[axis]*params.fontSize/192)<1e-9,'Both local axes agree, not only the baseline origin');
}
params.vertical=false;
let work,paints,legacy,builds,loads;const compiler=runtime.calligraphyGlyphData;
Object.assign(runtime,{calligraphyGlyphData:()=>{loads++;return source;},surfaceScratch:()=>{work=context();return{ctx:work,canvas:work};},
  surfaceEffectColor:()=>'#ad35ff',paintSurfaceMask:(ctx,canvas,color)=>{assert.equal(color,'#ad35ff');paints.push(canvas.pixels.slice());},
  renderCalligraphicStressLegacy:(ctx,g,w,h,p,L,f,cover)=>legacy.push({g,cover}),buildSurfaceMask:()=>{builds++;return{};},compositeSurfaceSource:()=>{}});
const width=256,height=128,L={dx:0,dy:0,s:1};
function render(glyphs,cover=false){paints=[];legacy=[];loads=0;builds=0;runtime.renderCalligraphicStress({},glyphs,width,height,1,L,{},cover);assert.equal(work?.stack.length||0,0);return paints[0];}
const first=render([glyph]),other={...glyph,x:150,ox:198,surface:{calligraphicStress:.6,calligraphyTool:'brush',calligraphyAngle:-65,calligraphyContrast:.8}};
const alone=render([other]),together=render([glyph,other]);
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4+3;
  assert.ok(Math.abs(together[i]-(alone[i]+first[i]*(1-alone[i]/255)))<=1,'Per-glyph Batch settings source-over, without aggregation');
}
const before=JSON.stringify([glyph,other]);render([glyph,other],true);assert.equal(builds,1);assert.equal(JSON.stringify([glyph,other]),before);
render(Array.from({length:140},()=>({...glyph,opacity:.01})));assert.equal(loads,140,'No active Compose-copy cutoff');
const old={...glyph,surface:{calligraphicStress:1,calligraphyTool:'legacy'}};
render([old,old],true);assert.equal(legacy.length,1);assert.equal(legacy[0].g.length,2);assert.equal(legacy[0].cover,true);assert.equal(loads,0);
render([glyph,old,old,other],true);assert.equal(legacy.length,1);assert.equal(legacy[0].g.length,2);assert.equal(legacy[0].cover,false);assert.equal(paints.length,2);assert.equal(builds,1);
render([{...glyph,ch:' '},{...glyph,opacity:0},{...glyph,surface:{calligraphicStress:0}}]);assert.equal(loads,0);
const pad=runtime.calligraphyEffectPad([{...glyph,scaleX:-3,skewX:40,surface:{...glyph.surface,calligraphyExpansion:260,calligraphyContrast:4,calligraphyPulse:4}}]);
assert.ok(pad>1700,'Extreme rotated/sheared local envelope expands allocation');
assert.equal(runtime.calligraphyEffectPad([{...glyph,opacity:0}]),0);
runtime.surfaceOutputOpacity=()=>0;assert.equal(runtime.calligraphyEffectPad([glyph]),0);runtime.surfaceOutputOpacity=()=>1;
// Actual high-resolution compiler. Canvas capture is mocked, not browser evidence.
runtime.calligraphyGlyphData=compiler;let captures=0,traceInput,canvasCount=0,large=false,pointCount=3;
runtime.document={createElement:()=>{
  canvasCount++;const canvas={};const ctx={textBaseline:'alphabetic',measureText:()=>({width:large?5000:600,actualBoundingBoxLeft:24,actualBoundingBoxRight:620,actualBoundingBoxAscent:ctx.textBaseline==='middle'?300:560,actualBoundingBoxDescent:100}),
    fillText:()=>{captures++;assert.match(ctx.font,/768px/);assert.equal(ctx.textBaseline,'alphabetic');},getImageData:()=>({data:new Uint8ClampedArray(canvas.width*canvas.height*4)})};
  canvas.getContext=()=>ctx;return canvas;
}};
runtime.spectralTraceContours=(data,w,h)=>{traceInput={w,h};return[{points:Array.from({length:pointCount},(_,i)=>({x:40+(i%3===1?400:0),y:576+(i%3===2?100:0)}))}];};
const cacheA=runtime.calligraphyGlyphData('A');assert.equal(cacheA.advance,150);assert.equal(cacheA.middleOffset,65);assert.equal(traceInput.w,676);assert.equal(traceInput.h,692);
assert.deepEqual(Array.from(cacheA.body.bounds),[0,0,100,25]);assert.equal(cacheA.pointCount,3);
assert.equal(runtime.calligraphyGlyphData('A'),cacheA);assert.equal(captures,1);
assert.equal(runtime.calligraphyGlyphData(' '),null);assert.equal(canvasCount,1);
params.fontWeight=400;assert.notEqual(runtime.calligraphyGlyphData('A'),cacheA);assert.equal(captures,2);
params.fontFamily='second-font';runtime.calligraphyGlyphData('A');assert.equal(captures,3);
runtime.calligraphyInvalidateFonts();assert.equal(runtime.calligraphyCachePoints,0);assert.equal(runtime.calligraphyGlyphCache.size,0);
runtime.calligraphyGlyphData('A');assert.equal(captures,4);
large=true;assert.throws(()=>runtime.calligraphyGlyphData('wide'),/4096/);large=false;
// Cache budget bookkeeping without allocating a pathological geometry fixture.
runtime.CalligraphyField.prepareCalligraphyBody=()=>({bounds:[0,0,100,25]});
pointCount=90000;runtime.calligraphyGlyphData('one');runtime.calligraphyGlyphData('two');runtime.calligraphyGlyphData('three');
assert.equal(runtime.calligraphyCachePoints,180000);assert.equal(runtime.calligraphyGlyphCache.size,2);
pointCount=262145;assert.equal(runtime.calligraphyGlyphData('oversized').pointCount,262145);assert.equal(runtime.calligraphyGlyphCache.size,2,'Uncacheable source must not evict reusable sources');
assert.ok(html.includes('conformalInvalidateFonts(); auxeticInvalidateFonts(); calligraphyInvalidateFonts();'));
assert.ok(extract('surfaceCanonicalRasterPlan').includes('calligraphyEffectPad(glyphs)'));
assert.ok(extract('sceneContentBounds').includes('calligraphyEffectPad(scene.glyphs)'));
console.log('Calligraphy editor: shipped renderer, 8 native frames, per-Batch isolation, 140 copies, legacy/mixed paint order, source-over, 768px source metrics, font invalidation/cache budget and transformed bounds passed (VM, not browser).');
