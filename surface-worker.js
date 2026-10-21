'use strict';
importScripts('operator-registry.js','shared-surface-renderers.js','surface-state.js','render-context.js','render-envelope.js','parameter-model.js','parameter-definitions.js','font-axes.js','text-layout.js');
// The kernels use only Canvas, font measurement and immutable frame data.
// No editor DOM, storage or UI state is accessible from this worker.
self.TypeDeformerWorkerRuntime=true;
var workerMobile=false,workerReducedMotion=false;
importScripts('numerical-kernels.js','structural-operators.js','pattern-tension-operators.js','wave-growth-operators.js','order-matter-operators.js','hyperbolic-atlas-operator.js','loadpath-foundry-operator.js','nodal-glaze-operator.js','spinodal-alloy-operator.js','density-recast-operator.js','hopf-loom-operator.js','miura-vault-operator.js','vortex-bath-operator.js','stress-glass-operator.js','excess-body-operators.js','ramified-body-operators.js','folded-body-operators.js','letterform-body-operators.js','metamorphic-body-operators.js','gravity-lens-operator.js','liquid-rope-body.js','wulff-body-operator.js','repulsive-curves-body.js','wasserstein-letters.js','field-material-operators.js','conditions-of-type.js');
var workerFontMetrics={},workerCompositionInputs={},workerSourceGlyphs=[],compositionScene={},compositionQualityOverride=null;
var params={},compositionState={},renderedSourceText='',surfaceFxPhase=0,dataMoshFrame=0,blobTrackState={blobs:[]},surfaceFxScratchCanvases={};
var workerFontRuntime=TypeDeformerAxes.createRuntime({fonts:self.fonts}),workerFontKeys=new Set();
var axisFieldEditor={font:function(g,size){return workerFontRuntime.activate(params,g,size);}};
importScripts('editor-model.js','render-engine.js','surface-worker-adapter.js','surface-worker-kernels.js');
var defaultFontCss=new Map(),defaultFontLoads=new Map();
function fontProperty(body,name){var m=body.match(new RegExp('(?:^|;)\\s*'+name+'\\s*:\\s*([^;]+)'));return m?m[1].trim():'';}
function inFontRange(text,range){if(!range)return true;var intervals=range.split(',').map(function(r){r=r.trim().replace(/^U\+/i,'');if(r.includes('?'))return [parseInt(r.replace(/\?/g,'0'),16),parseInt(r.replace(/\?/g,'F'),16)];var a=r.split('-');return [parseInt(a[0],16),parseInt(a[1]||a[0],16)];});return Array.from(text).some(function(ch){var cp=ch.codePointAt(0);return intervals.some(function(r){return cp>=r[0]&&cp<=r[1];});});}
async function loadFonts(records,frame){
  for(var record of records||[]){var digest=await crypto.subtle.digest('SHA-256',record.buffer),key=record.family+'/'+Array.from(new Uint8Array(digest)).map(function(b){return b.toString(16).padStart(2,'0');}).join('');if(workerFontKeys.has(key))continue;var face=new FontFace(record.family,record.buffer,{weight:'100 900',style:'normal'});await face.load();self.fonts.add(face);TypeDeformerFieldMaterials.invalidateSources();await workerFontRuntime.register(record);workerFontKeys.add(key);}
  var families=[params.fontFamily,...frame.glyphs.map(function(g){return g.fontFamily||'';})].join(','),characters=frame.text+(params.wassersteinPartner||'')+frame.glyphs.map(function(g){return g.ch||'';}).join('');
  if(!/EB Garamond|Space Mono|Zen Old Mincho|Noto Sans JP|Zen Kaku Gothic New/.test(families))return;
  for(var url of frame.fontCss||[]){
    if(!defaultFontCss.has(url))defaultFontCss.set(url,fetch(url).then(function(r){if(!r.ok)throw new Error('Webフォントの定義を読み込めませんでした。');return r.text();}).catch(function(error){defaultFontCss.delete(url);throw error;}));
    var css=await defaultFontCss.get(url),tasks=[];
    for(var block of css.matchAll(/@font-face\s*\{([^}]+)\}/g)){
      var body=block[1],family=fontProperty(body,'font-family').replace(/['"]/g,''),range=fontProperty(body,'unicode-range');if(!families.includes(family)||!inFontRange(characters,range))continue;
      var src=fontProperty(body,'src'),weight=fontProperty(body,'font-weight')||'normal',style=fontProperty(body,'font-style')||'normal',id=family+'|'+src+'|'+weight+'|'+style;
      if(!defaultFontLoads.has(id)){var face=new FontFace(family,src,{weight:weight,style:style,unicodeRange:range||'U+0-10FFFF'});defaultFontLoads.set(id,face.load().then(function(f){self.fonts.add(f);TypeDeformerFieldMaterials.invalidateSources();return f;}).catch(function(error){defaultFontLoads.delete(id);throw new Error('Webフォントを描画処理へ読み込めませんでした: '+error.message);}));}
      tasks.push(defaultFontLoads.get(id));
    }
    await Promise.all(tasks);
  }
}
async function renderFrame(frame,emitLayer,emitProgress){
  var jobStarted=performance.now(),budget=TypeDeformerRenderContext.limits(frame.purpose,frame.mobile);
  params=frame.params;compositionState=frame.composition;renderedSourceText=frame.text;surfaceFxPhase=frame.surfacePhase;dataMoshFrame=frame.dataMoshFrame;blobTrackState=frame.blobTrack||{blobs:[]};
  workerMobile=!!frame.mobile;workerReducedMotion=!!frame.reducedMotion;
  TypeDeformerSurfaceState.unpack(frame.glyphs,frame.surfaces,params);
  if(emitProgress)emitProgress({stage:'fonts',text:'描画用のフォントを準備しています。'});
  await loadFonts(frame.fonts,frame);workerFontMetrics=frame.fm;
  for(var op of frame.operators||[])for(var key of frame.operatorKeys[op]||[])for(var g of frame.glyphs)if(workerEngine.surfaceGlyphStrength(g,op)>.002&&typeof g.surface[key]==='number')TypeDeformerParameters.assertBudget(key,g.surface[key]);
  if(frame.kind!=='composition'){
    workerEngine.differentialPrepare(frame.glyphs);workerEngine.conformalPrepare(frame.glyphs);workerEngine.auxeticPrepare(frame.glyphs);workerEngine.marblingPrepare(frame.glyphs);
    var solverStarted=performance.now(),prepareProgressAt=0;
    while(true){
      try{workerEngine.differentialAssertReady(frame.glyphs);workerEngine.conformalAssertReady(frame.glyphs);workerEngine.auxeticAssertReady(frame.glyphs);workerEngine.marblingAssertReady(frame.glyphs);break;}
      catch(error){
        if(!/_PENDING$/.test(error.code||''))throw error;
        if(performance.now()-solverStarted>(frame.purpose==='export'?budget.timeoutMs:100000))throw Object.assign(new Error('字形の準備が計算時間の予算を超えました。設定値は保持しています。'),{code:'RENDER_TIMEOUT'});
        var growth=workerEngine.differentialController.state;
        if(growth.memoryPaused&&frame.purpose==='export'&&growth.historyLimit<budget.workBytes/4)workerEngine.differentialController.allowMoreMemory();
        else if(growth.memoryPaused||growth.error)throw Object.assign(new Error(growth.error||'成長履歴のメモリ予算を超えました。'),{code:growth.error?'':'RENDER_MEMORY_EXCEEDED'});
        if(performance.now()-prepareProgressAt>150){if(emitProgress)emitProgress({stage:'prepare',text:error.message});prepareProgressAt=performance.now();await new Promise(function(resolve){setTimeout(resolve,0);});}
      }
      workerEngine.differentialController.advance(50);workerEngine.conformalPool.advance();workerEngine.auxeticPool.advance();workerEngine.marblingPool.advance({maxWork:65536,maxMs:30});
    }
  }
  if(frame.kind==='composition'){
    globalThis.TypeDeformerCompositionPresentation={purpose:frame.purpose,density:frame.density};
    var composeStarted=performance.now();workerCompositionInputs=frame.inputs;workerSourceGlyphs=frame.glyphs;compositionQualityOverride=frame.quality;
    // Own parameter values are needed by the existing scene glyph copier.
    workerSourceGlyphs.forEach(function(g){if(g.surface)g.surface=Object.assign({},params,g.surface);});
    for(var key in TypeDeformerParameters.definitions)if(key.startsWith('composition.')){var parts=key.split('.').slice(1),value=compositionState;for(var part of parts)value=value&&value[part];if(typeof value==='number')TypeDeformerParameters.assertBudget(key,value);}
    var scene=workerEngine.applyCompositionFxRack(workerEngine.evaluateCompositionScene(frame.width,frame.height,frame.quality,workerSourceGlyphs),frame.width,frame.height,frame.quality);
    var transfers=[];for(var band of scene.bands||[])if(band.source instanceof OffscreenCanvas){band.source=await createImageBitmap(band.source);transfers.push(band.source);}
    scene.glyphs.forEach(function(g){if(!g.surface)return;var overrides={};for(var key in g.surface)if(g.surface[key]!==params[key])overrides[key]=g.surface[key];g.surface=overrides;});
    return {kind:'composition',scene:scene,layers:{},transfers:transfers,duration:performance.now()-jobStarted,paintDuration:performance.now()-composeStarted,presentation:{purpose:frame.purpose,density:frame.density,gpu:scene.bands.some(function(b){return b.webgl;}),gpuWidth:workerEngine.compositionWebGLState.canvas?.width||0,gpuHeight:workerEngine.compositionWebGLState.canvas?.height||0,maskWidth:workerEngine.compositionWebGLState.maskCanvas?.width||0}};
  }
  if(frame.kind==='bounds'){
    var boundsStarted=performance.now();if(emitProgress)emitProgress({stage:'bounds',text:'効果を含む作品全体の範囲を計算しています。'});
    for(var op of frame.operators)for(var fieldKey of frame.operatorKeys[op]||[])for(var item of frame.glyphs)if(workerEngine.surfaceGlyphStrength(item,op)>.002&&typeof item.surface[fieldKey]==='number')TypeDeformerParameters.assertBudget(fieldKey,item.surface[fieldKey]);
    var pad=Math.max(workerEngine.differentialEffectPad(frame.glyphs),workerEngine.conformalEffectPad(frame.glyphs),workerEngine.auxeticEffectPad(frame.glyphs),workerEngine.marblingEffectPad(frame.glyphs,frame.composition.phase)),grown=workerEngine.contentBounds(frame.glyphs,pad),b=frame.bounds;var merged={x:Math.min(b.x,grown.x),y:Math.min(b.y,grown.y),w:0,h:0};merged.w=Math.max(b.x+b.w,grown.x+grown.w)-merged.x;merged.h=Math.max(b.y+b.h,grown.y+grown.h)-merged.y;
    var boundsContext=TypeDeformerRenderContext.make({purpose:frame.purpose,mobile:frame.mobile,software:frame.software});
    var bodyBounds=TypeDeformerRenderContext.withContext(boundsContext,function(){return TypeDeformerRenderContext.withScope(function(){return TypeDeformerFieldMaterials.bodyBounds(frame.glyphs,merged,frame.fm,{params:params,strength:workerEngine.surfaceGlyphStrength,color:workerEngine.surfaceEffectColor,scratch:workerEngine.surfaceScratch,drawGlyph:workerEngine.drawSurfaceGlyph,sourceKey:workerEngine.fieldMaterialSourceKey,traceContours:workerEngine.spectralTraceContours,font:axisFieldEditor.font.bind(axisFieldEditor),charInfo:workerEngine.charInfo,bounds:workerEngine.contentBounds});});});
    return {kind:'bounds',geometryKey:frame.geometryKey,bounds:bodyBounds,layers:{},duration:performance.now()-jobStarted,paintDuration:performance.now()-boundsStarted};
  }
  var started=performance.now(),R=TypeDeformerRenderContext,plan=frame.plan||workerEngine.surfaceCanonicalRasterPlan(frame.glyphs),L=frame.layout,scale=frame.scale,width=plan.width,height=plan.height,envelopeResult=null;
  var factor=scale*L.s/plan.density,projectedX=scale*(L.dx+plan.bounds.x*L.s),projectedY=scale*(L.dy+plan.bounds.y*L.s);
  var viewX=Math.max(0,Math.floor(-projectedX)),viewY=Math.max(0,Math.floor(-projectedY));
  var viewW=Math.max(0,Math.min(Math.ceil(width*factor),Math.ceil(frame.width-projectedX))-viewX),viewH=Math.max(0,Math.min(Math.ceil(height*factor),Math.ceil(frame.height-projectedY))-viewY);
  var tiles=R.tiles(viewW,viewH,1024).map(function(t){t.x+=viewX;t.y+=viewY;return t;}),layers={},timings={},peakBytes=0,resultBytes=0;
  var streamLayers=frame.purpose!=='edit'&&frame.streamLayers&&emitLayer,layerBytes=frame.width*frame.height*4;
  var progressAt=0,operatorIndex=0;
  try{for(var id of frame.operators){
    if(!workerEngine.renderers[id])throw new Error('Worker renderer missing: '+id);
    for(var key of frame.operatorKeys[id]||[])for(var glyph of frame.glyphs){if(workerEngine.surfaceGlyphStrength(glyph,id)>.002&&glyph.surface&&typeof glyph.surface[key]==='number')TypeDeformerParameters.assertBudget(key,glyph.surface[key]);}
    var start=performance.now();
    resultBytes=streamLayers?layerBytes:resultBytes+layerBytes;if(resultBytes>budget.layerBytes)throw new Error(frame.purpose==='export'?'効果の画像が書き出し用メモリ予算を超えました。出力倍率や出力範囲を調整してください。設定値は保持されています。':'重ねた効果が表示用メモリ予算を超えました。低負荷表示に切り替えるか、効果を減らしてください。設定値は保持されています。');
    var canvas=new OffscreenCanvas(frame.width,frame.height),target=canvas.getContext('2d',frame.software?{willReadFrequently:true}:undefined);R.assertCanvas(canvas);
    var tileIndex=0;
    for(var tile of tiles){
      var context=R.make({purpose:frame.purpose,mobile:frame.mobile,software:frame.software,presentation:frame.presentation,nativeLocalDensity:frame.nativeLocalDensity,width:frame.width,height:frame.height,viewScale:scale*L.s,factor:factor,tile:tile,referenceWidth:width,referenceHeight:height,overscan:Math.ceil(64*factor)});
      R.withContext(context,function(){return R.withScope(function(){
        var layer=workerEngine.surfaceScratch('worker-layer',width,height,true);
        workerEngine.renderers[id](layer.ctx,frame.glyphs,width,height,plan.density,plan.layout,frame.fm,false,false,context);
        R.assertCanvas(layer.canvas);
        var contact=TypeDeformerRenderEnvelope.scanCanvas(layer.canvas,{gutter:3,threshold:1});
        if(TypeDeformerRenderEnvelope.touches(contact)){envelopeResult={kind:'envelope',contact:contact,requiredScale:TypeDeformerRenderEnvelope.nextScale(plan.envelopeScale||1,contact),layers:{},duration:performance.now()-jobStarted,paintDuration:performance.now()-started};return;}
        target.save();target.setTransform(factor,0,0,factor,projectedX,projectedY);
        var tx=tile.x/factor,ty=tile.y/factor,tw=tile.width/factor,th=tile.height/factor;
        R.drawImage(target,layer.canvas,tx,ty,tw,th,tx,ty,tw,th);target.restore();
      });});
      if(envelopeResult){Object.values(layers).forEach(function(bitmap){bitmap.close();});canvas.width=canvas.height=1;return envelopeResult;}
      peakBytes=Math.max(peakBytes,context.peakBytes);
      tileIndex++;
      if(streamLayers&&emitProgress&&(performance.now()-progressAt>100||tileIndex===tiles.length)){
        emitProgress({stage:'effects',operator:id,operatorIndex:operatorIndex,totalOperators:frame.operators.length,completed:operatorIndex*tiles.length+tileIndex,total:frame.operators.length*tiles.length});progressAt=performance.now();
      }
    }
    R.assertCanvas(canvas);var bitmap=canvas.transferToImageBitmap();canvas.width=canvas.height=1;timings[id]=performance.now()-start;
    if(streamLayers)await emitLayer(id,bitmap);else layers[id]=bitmap;
    operatorIndex++;
  }
  return {layers:layers,streamed:!!streamLayers,timings:timings,duration:performance.now()-jobStarted,paintDuration:performance.now()-started,peakBytes:peakBytes,resultBytes:resultBytes,cacheBytes:TypeDeformerFieldMaterials.cacheStats().bytes,numericalCache:TypeDeformerNumerics.cacheStats(),workBudget:budget.workBytes};
  }catch(error){if(canvas)canvas.width=canvas.height=1;Object.values(layers).forEach(function(bitmap){bitmap.close();});throw error;}
}
var layerAck=null;
self.onmessage=async function(event){var message=event.data;
  if(message.type==='layerAck'){if(layerAck&&layerAck.id===message.id&&layerAck.operator===message.operator){var resolve=layerAck.resolve;layerAck=null;resolve();}return;}
  try{var result=await renderFrame(message.payload,function(operator,bitmap){return new Promise(function(resolve,reject){layerAck={id:message.id,operator:operator,resolve:resolve};try{self.postMessage({type:'layer',id:message.id,result:{operator:operator,bitmap:bitmap}},[bitmap]);}catch(error){layerAck=null;bitmap.close();reject(error);}});},function(value){self.postMessage({type:'progress',id:message.id,value:value});});self.postMessage({type:'result',id:message.id,result:result},Object.values(result.layers).concat(result.transfers||[]));}catch(error){self.postMessage({type:'error',id:message.id,message:error.message,code:error.code||((error instanceof RangeError||/allocation|out of memory/i.test(error.message))?'RENDER_MEMORY_EXCEEDED':''),stack:error.stack});}
};
