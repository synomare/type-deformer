// Shipped inside the editor IIFE by embed-calligraphy-field.mjs.
var calligraphyGlyphCache = new Map(), calligraphyCachePoints = 0, calligraphyFontRevision = 0;
function calligraphyInvalidateFonts() {
  calligraphyGlyphCache.clear(); calligraphyCachePoints = 0; calligraphyFontRevision++;
}
function calligraphyGlyphSettings(g) {
  var profile = g.surface || {};
  function number(key) { return Number.isFinite(profile[key]) ? profile[key] : params[key]; }
  var tool = BATCH_PARAM_OPTIONS.calligraphyTool.indexOf(profile.calligraphyTool) >= 0 ? profile.calligraphyTool : params.calligraphyTool;
  return { tool: tool, expansion: number('calligraphyExpansion'), contrast: number('calligraphyContrast'),
    angle: number('calligraphyAngle'), pulse: number('calligraphyPulse'), wetness: number('calligraphyWetness'), fontSize: params.fontSize };
}
function calligraphyGlyphData(ch, g) {
  if (!String(ch || '').trim()) return null;
  var spec = g && g.fontAxes ? glyphFontSpec(g,768) : null, font = spec ? spec.font : params.fontWeight + ' 768px ' + params.fontFamily;
  var key = calligraphyFontRevision + ':' + (spec ? spec.key : font) + '\u0000' + ch;
  if (calligraphyGlyphCache.has(key)) {
    var cached = calligraphyGlyphCache.get(key);
    calligraphyGlyphCache.delete(key); calligraphyGlyphCache.set(key, cached); return cached;
  }
  var canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.font = font;
  var measure = ctx.measureText(ch), unit = 4;
  var left = Math.ceil(Math.max(0, measure.actualBoundingBoxLeft || 0)) + 16;
  var ascent = Math.ceil(Math.max(1, measure.actualBoundingBoxAscent || 768)) + 16;
  var right = Math.ceil(Math.max(measure.width, measure.actualBoundingBoxRight || 0)) + 16;
  var descent = Math.ceil(Math.max(0, measure.actualBoundingBoxDescent || 0)) + 16;
  var width = left + right, height = ascent + descent;
  if (!Number.isFinite(width + height) || width > 4096 || height > 4096) throw new RangeError('Calligraphic Stress: 字形の高精度ソースが4096px上限を超えています。');
  canvas.width = Math.max(8, width); canvas.height = Math.max(8, height);
  ctx.font = font; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff'; ctx.fillText(ch, left, ascent);
  var source = spectralTraceContours(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
  var count = 0;
  var contours = source.map(function (ring) {
    count += ring.points.length;
    return { points: ring.points.map(function (p) { return { x: (p.x - left) / unit, y: (p.y - ascent) / unit }; }) };
  });
  ctx.textBaseline = 'middle'; var middle = ctx.measureText(ch);
  var middleOffset = Number.isFinite(middle.actualBoundingBoxAscent) && Number.isFinite(measure.actualBoundingBoxAscent)
    ? (measure.actualBoundingBoxAscent - middle.actualBoundingBoxAscent) / unit : 192 * .35;
  var result = { body: CalligraphyField.prepareCalligraphyBody(contours), advance: measure.width / unit,
    middleOffset: middleOffset, pointCount: count };
  // Bound retained source geometry, never the active text or Compose copies.
  // One oversized source is rendered uncached; no contour is resampled/dropped.
  if (count <= 262144) {
    while (calligraphyGlyphCache.size && (calligraphyGlyphCache.size >= 96 || calligraphyCachePoints + count > 262144)) {
      var oldest = calligraphyGlyphCache.keys().next().value;
      calligraphyCachePoints -= calligraphyGlyphCache.get(oldest).pointCount; calligraphyGlyphCache.delete(oldest);
    }
    calligraphyGlyphCache.set(key, result); calligraphyCachePoints += count;
  }
  return result;
}
function calligraphyEffectPad(glyphs) {
  if (surfaceOutputOpacity('calligraphicStress') <= .002) return 0;
  var extra = 0;
  for (var i = 0; i < glyphs.length; i++) {
    var g = glyphs[i];
    if (surfaceGlyphStrength(g, 'calligraphicStress') <= .002 || (g.opacity != null && g.opacity <= .002) || !String(g.ch || '').trim()) continue;
    var settings = calligraphyGlyphSettings(g); if (settings.tool === 'legacy') continue;
    settings = CalligraphyField.normalizeCalligraphyBodySettings(settings);
    var reach = Math.abs(settings.expansion) + settings.fontSize *
      (settings.contrast * (settings.tool === 'brush' ? .075 : .105) + settings.pulse * (settings.tool === 'brush' ? .052 : .032))
      + (.65 + settings.wetness * 3.1) * 3 + 7;
    var kx = Math.tan((g.skewX || 0) * Math.PI / 180), ky = Math.tan((g.skewY || 0) * Math.PI / 180);
    // Frobenius norm bounds every orientation, including negative scales.
    var stretch = Math.hypot(g.scaleX, ky * g.scaleX, kx * g.scaleY, g.scaleY);
    extra = Math.max(extra, reach * Math.SQRT2 * stretch + 4);
  }
  return extra;
}
function renderCalligraphicStress(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
  var hasModern = glyphs.some(function (g) {
    return surfaceGlyphStrength(g, 'calligraphicStress') > .002 && (g.opacity == null || g.opacity > .002)
      && String(g.ch || '').trim() && calligraphyGlyphSettings(g).tool !== 'legacy';
  });
  // Preserve the old renderer byte-for-byte for a wholly legacy scene.
  if (!hasModern) { renderCalligraphicStressLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase); return; }
  if (coverBase) compositeSurfaceSource(targetCtx, buildSurfaceMask(glyphs, 'calligraphicStress', width, height, pixelScale, L, fm), 'calligraphicStress', true);
  var work = surfaceScratch('calligraphic-stress-local-body', width, height, true);
  var output = work.ctx.createImageData(width, height), dirty = false, outputCalls = [];
  var phase = compositionState.enabled ? compositionState.phase : 0;
  function flush() {
    if (!dirty) return;
    work.ctx.putImageData(output, 0, 0);
    if(globalThis.TypeDeformerRenderContext)globalThis.TypeDeformerRenderContext.present(work.canvas,function(ctx,factor,presentation){
      var w=ctx.canvas.width,h=ctx.canvas.height,image=ctx.createImageData(w,h);
      outputCalls.forEach(function(call){var m=call.matrix,matrix={a:m.a*factor,b:m.b*factor,c:m.c*factor,d:m.d*factor,e:(m.e-presentation.originX)*factor,f:(m.f-presentation.originY)*factor};CalligraphyField.rasterCalligraphyBody(call.body,call.settings,phase,matrix,w,h,image.data,call.alpha);});
      ctx.resetTransform();ctx.putImageData(image,0,0);
    });
    outputCalls.length=0;
    paintSurfaceMask(targetCtx, work.canvas, surfaceEffectColor('calligraphicStress'), 1, 'calligraphic-stress-local-color');
    output.data.fill(0); dirty = false;
  }
  for (var i = 0; i < glyphs.length; i++) {
    var g = glyphs[i], strength = surfaceGlyphStrength(g, 'calligraphicStress');
    if (strength <= .002 || (g.opacity != null && g.opacity <= .002) || !String(g.ch || '').trim()) continue;
    var settings = calligraphyGlyphSettings(g);
    if (settings.tool === 'legacy') {
      flush(); var legacy = [g];
      while (i + 1 < glyphs.length && calligraphyGlyphSettings(glyphs[i + 1]).tool === 'legacy') legacy.push(glyphs[++i]);
      renderCalligraphicStressLegacy(targetCtx, legacy, width, height, pixelScale, L, fm, false); continue;
    }
    var data = calligraphyGlyphData(g.ch,g); if (!data || !data.body.bounds) continue;
    work.ctx.save(); var matrix;
    try { spectralGlyphFrame(work.ctx, g, pixelScale, L, fm, data); matrix = work.ctx.getTransform(); }
    finally { work.ctx.restore(); }
    var result = CalligraphyField.rasterCalligraphyBody(data.body, settings, phase, matrix, width, height, output.data,
      strength * (g.opacity == null ? 1 : g.opacity));
    outputCalls.push({body:data.body,settings:settings,matrix:matrix,alpha:strength*(g.opacity==null?1:g.opacity)});
    dirty = dirty || result.pixels > 0;
  }
  flush();
}
