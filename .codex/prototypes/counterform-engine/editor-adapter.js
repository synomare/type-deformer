// Embedded in the editor IIFE; see scripts/embed-counterform.mjs.
var counterformFontRevision = 0;
var counterformSourceCache = new Map(), counterformSourceCells = 0;
var counterformPreparedCache = new Map(), counterformPreparedCells = 0;
var counterformVariantCache = new Map(), counterformVariantCells = 0;
var counterformRenderError = '';
function counterformSetRenderError(message) {
  message = String(message || '');
  if (message === counterformRenderError) return;
  counterformRenderError = message;
  var status = document.getElementById('counterformWorkStatus');
  if (!status) return;
  status.hidden = !message;
  status.textContent = message ? 'Counterform Engine · ' + message + ' 該当する文字は元の字形で表示しています。設定またはフォントを変更して再試行してください。' : '';
}
function counterformResetInactive(glyphs) {
  if (surfaceOutputOpacity('counterformEngine') <= .002 || !glyphs.some(function (g) {
    return surfaceGlyphStrength(g, 'counterformEngine') > .002 && (g.opacity == null || g.opacity > .002) && String(g.ch || '').trim();
  })) counterformSetRenderError('');
}
var COUNTERFORM_STARTS_EDITOR = {
  chamber: { counterformGrammar: 'aperture', counterformPressure: 3, counterformBridge: 8, counterformAperture: .35, counterformAngle: 0, counterformTrap: 8 },
  stencil: { counterformGrammar: 'stencil', counterformPressure: 1, counterformBridge: 11, counterformAperture: .48, counterformAngle: 0, counterformTrap: 8 },
  reservoir: { counterformGrammar: 'trap', counterformPressure: 1, counterformBridge: 12, counterformAperture: .58, counterformAngle: -15, counterformTrap: 20 },
  canal: { counterformGrammar: 'channel', counterformPressure: 0, counterformBridge: 11, counterformAperture: .46, counterformAngle: 18, counterformTrap: 0 }
};
function applyCounterformPreset(name) {
  var preset = COUNTERFORM_STARTS_EDITOR[name]; if (!preset) return;
  pushHistory(); Object.assign(editableBatchProfile(), preset); counterformSetRenderError('');
  refreshBatchProfileControls(); applyAllOperatorVisuals(); markAutosaveDirty();
}
function counterformProfileSettings(g) {
  var profile = g.surface || {};
  function value(key) { return Number.isFinite(profile[key]) ? profile[key] : params[key]; }
  var grammar = BATCH_PARAM_OPTIONS.counterformGrammar.indexOf(profile.counterformGrammar) >= 0
    ? profile.counterformGrammar : params.counterformGrammar;
  var localScale = 768 / Math.max(1, params.fontSize);
  return { grammar: grammar, pressure: value('counterformPressure') * localScale,
    bridge: value('counterformBridge') * localScale, aperture: value('counterformAperture'),
    angle: value('counterformAngle'), trap: value('counterformTrap') * localScale, seed: params.seed };
}
function counterformOldGrammar(settings) { return settings.grammar === 'legacy' || /V29$/.test(settings.grammar); }
function counterformSourceKey(ch, g) {
  return counterformFontRevision + ':' + (g && g.fontAxes ? glyphFontSpec(g,768).key : params.fontWeight + ' 768px ' + params.fontFamily) + '\u0000' + ch;
}
function counterformTouch(cache, key, value) { cache.delete(key); cache.set(key, value); return value; }
function counterformTrim(cache, sizeKey, maximumEntries, maximumCells, currentCells) {
  while (cache.size > maximumEntries || currentCells > maximumCells) {
    var oldest = cache.keys().next().value, value = cache.get(oldest);
    currentCells -= value[sizeKey] || 0; cache.delete(oldest);
  }
  return currentCells;
}
function counterformSourceData(ch, g) {
  if (!String(ch || '').trim()) return null;
  var key = counterformSourceKey(ch,g), cached = counterformSourceCache.get(key);
  if (cached) return counterformTouch(counterformSourceCache, key, cached);
  var canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  var font = g && g.fontAxes ? glyphFontSpec(g,768).font : params.fontWeight + ' 768px ' + params.fontFamily; ctx.font = font;
  var measure = ctx.measureText(ch), unit = 4;
  var left = Math.ceil(Math.max(0, measure.actualBoundingBoxLeft || 0)) + 16;
  var ascent = Math.ceil(Math.max(1, measure.actualBoundingBoxAscent || 768)) + 16;
  var right = Math.ceil(Math.max(measure.width, measure.actualBoundingBoxRight || 0)) + 16;
  var descent = Math.ceil(Math.max(0, measure.actualBoundingBoxDescent || 0)) + 16;
  var width = left + right, height = ascent + descent;
  if (!Number.isFinite(width + height) || width > 4096 || height > 4096 || width * height > 8388608) {
    throw new RangeError('Counterform Engine: この字形は高精度ソース上限を超えています。');
  }
  canvas.width = Math.max(8, width); canvas.height = Math.max(8, height);
  ctx.font = font; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff'; ctx.fillText(ch, left, ascent);
  var image = ctx.getImageData(0, 0, canvas.width, canvas.height), alpha = new Uint8ClampedArray(width * height);
  for (var i = 0; i < alpha.length; i++) alpha[i] = image.data[i * 4 + 3];
  ctx.textBaseline = 'middle'; var middle = ctx.measureText(ch);
  var middleOffset = Number.isFinite(middle.actualBoundingBoxAscent) && Number.isFinite(measure.actualBoundingBoxAscent)
    ? (measure.actualBoundingBoxAscent - middle.actualBoundingBoxAscent) / unit : 192 * .35;
  var result = { key: key, alpha: alpha, font: font, ch: ch, width: width, height: height, cells: width * height,
    left: left, ascentPx: ascent, unit: unit, advance: measure.width / unit, middleOffset: middleOffset };
  counterformSourceCache.set(key, result); counterformSourceCells += result.cells;
  counterformSourceCells = counterformTrim(counterformSourceCache, 'cells', 64, 12582912, counterformSourceCells);
  return result;
}
function counterformPreparedData(source) {
  var cached = counterformPreparedCache.get(source.key);
  if (cached) return counterformTouch(counterformPreparedCache, source.key, cached);
  var prepared = CounterformEngine.prepareCounterformBody(source.alpha, source.width, source.height);
  var result = { prepared: prepared, cells: source.cells };
  if (result.cells > 3145728) return result;
  counterformPreparedCache.set(source.key, result); counterformPreparedCells += result.cells;
  counterformPreparedCells = counterformTrim(counterformPreparedCache, 'cells', 12, 3145728, counterformPreparedCells);
  return result;
}
function counterformVariantKey(sourceKey, settings) {
  return sourceKey + '\u0000' + [settings.grammar, settings.pressure, settings.bridge,
    settings.aperture, settings.angle, settings.trap, settings.seed].join(':')
    + ':' + (globalThis.TypeDeformerRenderContext ? TypeDeformerRenderContext.key() : 'analysis');
}
// Preserve the reference topology and cut construction, then evaluate their
// continuous distances against freshly drawn font coverage at output pixels.
function counterformPresentation(source, body, rendered, cropX, cropY, factor) {
  var R = TypeDeformerRenderContext, s = rendered.settings, w = body.width, h = body.height;
  var glyph = R.createCanvas(w, h, {factor:factor}), ctx = glyph.getContext('2d');
  ctx.font = source.font; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff';
  ctx.fillText(source.ch, source.left, source.ascentPx);
  var alpha = R.alphaSampler(glyph), tapers = rendered.mask.presentationTapers || [];
  R.release(glyph);
  var chambers = rendered.mask.presentationChambers || [];
  function sample(field,x,y){return R.sample(field,w,h,x,y);}
  function cover(distance,footprint){return Math.max(0,Math.min(1,.5+distance/Math.max(.0001,footprint)));}
  var shader = function(px,py,rgba,footprint){
    var x=px+cropX-.5,y=py+cropY-.5, ink=alpha(px+cropX,py+cropY);
    var cut=0,fill=0,counter=sample(body.counterDistance,x,y),exterior=sample(body.exteriorDistance,x,y);
    if(s.pressure>0&&body.topology.components.length){
      cut=cover(Math.min(s.pressure*(.3+s.aperture*.24)-counter,exterior*(.4+s.aperture*.26)-counter),footprint);
    }else if(s.pressure<0&&body.topology.components.length){
      fill=sample(body.topology.counter,x,y)*cover(-s.pressure*(.48+(1-s.aperture)*.24)-sample(body.distanceToInk,x,y),footprint);
    }
    for(var c=0;c<chambers.length;c++){
      var chamber=chambers[c];if(chamber.chamberGrow<=.25)continue;var component=chamber.component;
      var theta=Math.atan2(y-component.y,x-component.x),reciprocal=.72+.22*Math.abs(Math.cos(theta-s.angle))+.1*Math.sin(theta*3+s.angle+chamber.c*.73);
      var distance=component.closed?counter:Math.max(0,Math.hypot(x-component.x,y-component.y)-component.radius);
      cut=Math.max(cut,cover(Math.min(chamber.chamberGrow*reciprocal-distance,exterior*(.52+s.aperture*.4)-distance),footprint));
    }
    if(s.grammar==='channel'&&s.bridge>.1){
      var depth=sample(body.distanceToVoid,x,y),base=Math.max(.7,s.bridge*(.1+s.aperture*.18));
      var local=Math.min(base*(.82+Math.min(1.5,depth/Math.max(1,base*2))*.22),depth*(.3+s.aperture*.18));
      var period=Math.max(10,s.bridge*(1.1+s.aperture*1.4)),coordinate=x*Math.cos(s.angle)+y*Math.sin(s.angle)+s.seed*.618;
      var phase=((coordinate/period)%1+1)%1,valve=.055+(1-s.aperture)*.06;
      cut=Math.max(cut,cover(Math.min(local-.55,local-sample(body.ridgeDistance,x,y),depth-local*1.12,(phase-valve)*period,(1-valve-phase)*period),footprint));
    }
    // Taper geometry has analytic sides, curved centerlines and end caps.
    for(var k=0;k<tapers.length;k++){
      var t=tapers[k],dx=t.to.x-t.from.x,dy=t.to.y-t.from.y,length=Math.max(.001,Math.hypot(dx,dy));
      var rx=px+cropX-t.from.x,ry=py+cropY-t.from.y,along=(rx*dx+ry*dy)/length,u=along/length;
      if(u<0||u>1)continue;var half=t.startHalf+(t.endHalf-t.startHalf)*u*u*(3-2*u);
      var side=(-rx*dy+ry*dx)/length-Math.sin(u*Math.PI)*t.curvature;
      var distance=Math.min(half-Math.abs(side),along,length-along),coverage=cover(distance,footprint);
      if(t.value)fill=Math.max(fill,coverage);else cut=Math.max(cut,coverage);
    }
    rgba[0]=rgba[1]=rgba[2]=255;rgba[3]=Math.max(ink,fill)*(1-cut)*255;
  };shader.release=alpha.release;return shader;
}
function counterformVariantData(ch, settings, g, factor) {
  var sourceKey = counterformSourceKey(ch,g), variantKey = counterformVariantKey(sourceKey, settings);
  var cached = counterformVariantCache.get(variantKey);
  if (cached) return counterformTouch(counterformVariantCache, variantKey, cached);
  var source = counterformSourceData(ch,g), prepared = counterformPreparedData(source).prepared;
  var rendered = CounterformEngine.renderCounterformBody(prepared, settings), bounds = rendered.metrics.bounds;
  if (!bounds) return null;
  var pad = 2, x = Math.max(0, bounds[0] - pad), y = Math.max(0, bounds[1] - pad);
  var right = Math.min(source.width - 1, bounds[2] + pad), bottom = Math.min(source.height - 1, bounds[3] + pad);
  var width = right - x + 1, height = bottom - y + 1;
  var canvas = globalThis.TypeDeformerRenderContext ? TypeDeformerRenderContext.createCanvas(width,height,{factor:factor}) : document.createElement('canvas'), ctx = canvas.getContext('2d');
  canvas.width = width; canvas.height = height; var image = ctx.createImageData(width, height);
  for (var py = 0; py < height; py++) for (var px = 0; px < width; px++) {
    if (!rendered.mask[(y + py) * source.width + x + px]) continue;
    var index = (py * width + px) * 4; image.data[index] = image.data[index + 1] = image.data[index + 2] = image.data[index + 3] = 255;
  }
  var presentation=null;
  if(globalThis.TypeDeformerRenderContext && TypeDeformerRenderContext.current())
    TypeDeformerRenderContext.field(image,presentation=counterformPresentation(source,prepared,rendered,x,y,factor));
  try{ctx.putImageData(image, 0, 0);}finally{if(presentation)presentation.release();}
  var result = { canvas: canvas, cropX: x, cropY: y, width: width, height: height, cells: width * height,
    left: source.left, ascentPx: source.ascentPx, unit: source.unit, advance: source.advance, middleOffset: source.middleOffset,
    metrics: rendered.metrics };
  if(globalThis.TypeDeformerRenderContext && TypeDeformerRenderContext.current()){result.ephemeral=true;return result;}
  counterformVariantCache.set(variantKey, result); counterformVariantCells += result.cells;
  counterformVariantCells = counterformTrim(counterformVariantCache, 'cells', 96, 12582912, counterformVariantCells);
  return result;
}
function counterformInvalidateFonts() {
  counterformFontRevision++; counterformSourceCache.clear(); counterformPreparedCache.clear(); counterformVariantCache.clear();
  counterformSourceCells = counterformPreparedCells = counterformVariantCells = 0; counterformSetRenderError('');
}
function counterformDrawVariant(ctx, g, data, pixelScale, L, fm, strength) {
  ctx.save();
  try {
    spectralGlyphFrame(ctx, g, pixelScale, L, fm, data);
    ctx.globalAlpha = strength * (g.opacity == null ? 1 : g.opacity); ctx.imageSmoothingEnabled = true;
    ctx.drawImage(data.canvas, (data.cropX - data.left) / data.unit, (data.cropY - data.ascentPx) / data.unit,
      data.width / data.unit, data.height / data.unit);
  } finally { ctx.restore(); }
}
function renderCounterformEngine(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase, livePreview) {
  if (coverBase) compositeSurfaceSource(targetCtx, buildSurfaceMask(glyphs, 'counterformEngine', width, height, pixelScale, L, fm), 'counterformEngine', true);
  var work = surfaceScratch('counterform-engine-v42-local-body', width, height, true), dirty = false;
  function flush() {
    if (!dirty) return;
    paintSurfaceMask(targetCtx, work.canvas, surfaceEffectColor('counterformEngine'), 1, 'counterform-engine-v42-color');
    work.ctx.setTransform(1, 0, 0, 1, 0, 0); work.ctx.clearRect(0, 0, width, height); dirty = false;
  }
  var renderError = '';
  for (var i = 0; i < glyphs.length; i++) {
    var g = glyphs[i], strength = surfaceGlyphStrength(g, 'counterformEngine');
    if (strength <= .002 || (g.opacity != null && g.opacity <= .002) || !String(g.ch || '').trim()) continue;
    var settings = counterformProfileSettings(g);
    if (counterformOldGrammar(settings)) {
      flush(); var old = [g], oldGrammar = settings.grammar;
      while (i + 1 < glyphs.length && counterformProfileSettings(glyphs[i + 1]).grammar === oldGrammar) old.push(glyphs[++i]);
      if (oldGrammar === 'legacy') renderCounterformEngineLegacy(targetCtx, old, width, height, pixelScale, L, fm, false);
      else renderCounterformEngineV29(targetCtx, old, width, height, pixelScale, L, fm, false);
      continue;
    }
    if (CounterformEngine.isCounterformNative(settings)) {
      drawSurfaceGlyph(work.ctx, g, pixelScale, L, fm, strength, '#fff'); dirty = true; continue;
    }
    try {
      var renderContext=globalThis.TypeDeformerRenderContext&&TypeDeformerRenderContext.current();
      // The source uses 768px type; map that space to the final glyph footprint,
      // including its local transform, instead of treating it as a stage canvas.
      var sourceFactor=renderContext?renderContext.factor*pixelScale*L.s*params.fontSize/768*Math.max(.00001,Math.abs(g.scaleX||1)*(1+Math.abs(Math.tan((g.skewY||0)*Math.PI/180))),Math.abs(g.scaleY||1)*(1+Math.abs(Math.tan((g.skewX||0)*Math.PI/180)))):undefined;
      var data = counterformVariantData(g.ch, settings, g, sourceFactor); if (!data) continue;
      try{counterformDrawVariant(work.ctx, g, data, pixelScale, L, fm, strength);}finally{if(data.ephemeral)TypeDeformerRenderContext.release(data.canvas);}dirty = true;
    } catch (error) {
      if (!livePreview) throw error;
      if (!renderError) renderError = g.ch + ': ' + (error.message || String(error));
      drawSurfaceGlyph(work.ctx, g, pixelScale, L, fm, strength, '#fff'); dirty = true;
    }
  }
  flush();
  if (livePreview) counterformSetRenderError(renderError);
}
