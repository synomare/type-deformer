// Embedded in the editor IIFE; see scripts/embed-auxetic.mjs.
var auxeticPool = AuxeticType.createAuxeticSourcePool({ pointLimit: 262144 });
var auxeticFontRevision = 0, auxeticTimer = null, auxeticStatusSignature = '';
var auxeticRenderError = '', auxeticDrawSignature = '';
var AUXETIC_TYPE_STARTS_EDITOR = {
  aperture: { auxeticOpening: 28, auxeticModule: 24, auxeticAspect: 1, auxeticAxis: 0, auxeticLigament: .75, auxeticMotion: .65 },
  lancet: { auxeticOpening: 43, auxeticModule: 26, auxeticAspect: 3.4, auxeticAxis: 28, auxeticLigament: .8, auxeticMotion: .55 },
  cipher: { auxeticOpening: 78, auxeticModule: 38, auxeticAspect: .65, auxeticAxis: -20, auxeticLigament: .5, auxeticMotion: .8 }
};
function applyAuxeticTypePreset(name) {
  var preset = AUXETIC_TYPE_STARTS_EDITOR[name]; if (!preset) return;
  pushHistory(); Object.assign(editableBatchProfile(), preset);
  auxeticRenderError = ''; refreshBatchProfileControls(); applyAllOperatorVisuals(); markAutosaveDirty();
}
function auxeticGlyphSettings(g) {
  var profile = g.surface || {};
  function value(key) { return Number.isFinite(profile[key]) ? profile[key] : params[key]; }
  return AuxeticType.normalizeAuxeticSettings({ opening: value('auxeticOpening'), module: value('auxeticModule'),
    aspect: value('auxeticAspect'), axis: value('auxeticAxis'), ligament: value('auxeticLigament'), motion: value('auxeticMotion') });
}
function auxeticIsNative(settings) { return settings.opening === 0; }
function auxeticIsNativeAtPhase(settings, phase) {
  if (auxeticIsNative(settings)) return true;
  var loop = Number.isFinite(phase) ? ((phase % 1) + 1) % 1 : 0;
  return settings.motion === 1 && Math.abs(loop - .5) < 1e-12;
}
function auxeticSourceKey(ch, settings, g) {
  return auxeticFontRevision + ':' + (g && g.fontAxes ? glyphFontSpec(g,768).key : params.fontWeight + ' 768px ' + params.fontFamily) + '\u0000' + ch
    + '\u0000' + settings.module + ':' + settings.aspect + ':' + settings.axis;
}
function auxeticGlyphData(ch, fontSpec, settings, available) {
  var canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  var font = fontSpec.glyph ? glyphFontSpec(fontSpec.glyph,768).font : fontSpec.font; ctx.font = font;
  var measure = ctx.measureText(ch), unit = 4;
  var left = Math.ceil(Math.max(0, measure.actualBoundingBoxLeft || 0)) + 16;
  var ascent = Math.ceil(Math.max(1, measure.actualBoundingBoxAscent || 768)) + 16;
  var right = Math.ceil(Math.max(measure.width, measure.actualBoundingBoxRight || 0)) + 16;
  var descent = Math.ceil(Math.max(0, measure.actualBoundingBoxDescent || 0)) + 16;
  var width = left + right, height = ascent + descent;
  if (width > 4096 || height > 4096) throw new RangeError('この字形はAuxetic Typeの4096pxソース上限を超えています。');
  canvas.width = Math.max(8, width); canvas.height = Math.max(8, height);
  ctx.font = font; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff'; ctx.fillText(ch, left, ascent);
  var traced = spectralTraceContours(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
  var contours = traced.map(function (contour) { return { points: contour.points.map(function (point) {
    return { x: (point.x - left) / unit, y: (point.y - ascent) / unit };
  }) }; });
  var glyph = AuxeticType.prepareAuxeticGlyph(contours);
  var compiled = AuxeticType.compileAuxeticGlyph(glyph, settings);
  var pointCount = glyph.pointCount + compiled.pointCount;
  if (pointCount > available) throw new RangeError('Auxetic Typeの字形メモリ上限に達しました。適用する文字種を減らしてください。');
  ctx.textBaseline = 'middle'; var middle = ctx.measureText(ch);
  var middleOffset = Number.isFinite(middle.actualBoundingBoxAscent) && Number.isFinite(measure.actualBoundingBoxAscent)
    ? (measure.actualBoundingBoxAscent - middle.actualBoundingBoxAscent) / unit : 192 * .35;
  return { compiled: compiled, pointCount: pointCount, advance: measure.width / unit, middleOffset: middleOffset,
    ascent: Math.max(1, measure.actualBoundingBoxAscent || 768) / unit, descent: Math.max(0, measure.actualBoundingBoxDescent || 0) / unit };
}
function auxeticRequests(glyphs) {
  var requests = new Map(), font = params.fontWeight + ' 768px ' + params.fontFamily;
  if (surfaceOutputOpacity('auxeticType') <= .002) return [];
  for (var i = 0; i < glyphs.length; i++) {
    var g = glyphs[i], settings = auxeticGlyphSettings(g);
    if (surfaceGlyphStrength(g, 'auxeticType') <= .002 || !String(g.ch || '').trim() || auxeticIsNative(settings)) continue;
    var key = auxeticSourceKey(g.ch, settings, g);
    if (!requests.has(key)) requests.set(key, { key: key,
      load: auxeticGlyphData.bind(null, g.ch, { key: key, font: font, glyph: g.fontAxes ? g : null }, settings) });
  }
  return Array.from(requests.values());
}
function auxeticUpdateStatus() {
  var state = auxeticPool.state(), container = document.getElementById('auxeticWorkStatus');
  var button = document.getElementById('btnAuxeticPause'), retry = document.getElementById('btnAuxeticRetry');
  var error = auxeticRenderError || state.error;
  var text = error ? 'Auxetic Type · ' + error
    : state.paused && state.pending ? 'Auxetic Type · 切断字形の準備を一時停止中。未準備の字は元文字で表示します。'
    : state.pending ? 'Auxetic Type · 切断字形を準備中。未準備の字は元文字で表示します。'
    : 'Auxetic Type · ' + state.total + '字形 / ' + state.points.toLocaleString() + '輪郭点を準備済み';
  var signature = text + ':' + state.ready + ':' + state.total;
  var progress = document.getElementById('auxeticWorkProgress');
  progress.hidden = !state.pending; progress.value = state.total ? state.ready / state.total : 1;
  progress.setAttribute('aria-valuetext', state.ready + '/' + state.total + '字形');
  if (signature !== auxeticStatusSignature) {
    auxeticStatusSignature = signature; container.hidden = !state.total && !error;
    document.getElementById('auxeticWorkText').textContent = text;
    button.hidden = !state.pending; button.textContent = state.paused ? '準備を再開' : '準備を一時停止';
    button.setAttribute('aria-pressed', String(state.paused)); retry.hidden = !error;
  }
  var drawSignature = state.ready + ':' + state.total + ':' + error;
  if (drawSignature !== auxeticDrawSignature) {
    auxeticDrawSignature = drawSignature; scheduleSurfaceFxDraw(); if (compositionState.enabled) scheduleCompositionDraw();
  }
  return state;
}
function auxeticScheduleWork() {
  var state = auxeticUpdateStatus(); if (!state.pending || state.paused || auxeticTimer !== null) return;
  auxeticTimer = requestAnimationFrame(function () { auxeticTimer = null; auxeticPool.advance(); auxeticScheduleWork(); });
}
function auxeticPrepare(glyphs) {
  if(globalThis.TypeDeformerRenderJobs&&typeof Worker!=='undefined'&&!globalThis.TypeDeformerWorkerRuntime)return;
  var requests = auxeticRequests(glyphs); auxeticPool.sync(requests);
  if (!requests.length) {
    auxeticRenderError = ''; auxeticPool.setPaused(false);
    if (auxeticTimer !== null) cancelAnimationFrame(auxeticTimer); auxeticTimer = null;
  }
  auxeticScheduleWork();
}
function auxeticAssertReady(glyphs) {
  if(globalThis.TypeDeformerRenderJobs&&typeof Worker!=='undefined'&&!globalThis.TypeDeformerWorkerRuntime)return;
  var requests = auxeticRequests(glyphs);
  for (var i = 0; i < requests.length; i++) {
    var state = auxeticPool.inspect(requests[i].key); if (state.status === 'ready') continue;
    var failure = new Error(state.error || 'Auxetic Typeの切断字形を準備中です。キャンバスの準備完了を確認してください。');
    failure.code = state.status === 'error' ? 'AUXETIC_ERROR' : 'AUXETIC_PENDING'; throw failure;
  }
}
function auxeticRetry() { auxeticPool.retry(); auxeticRenderError = ''; auxeticScheduleWork(); scheduleSurfaceFxDraw(); }
function auxeticInvalidateFonts() {
  auxeticFontRevision++; auxeticPool.reset(); auxeticRenderError = ''; auxeticStatusSignature = '';
  if (auxeticTimer !== null) cancelAnimationFrame(auxeticTimer); auxeticTimer = null; scheduleSurfaceFxDraw();
}
function auxeticHasAppliedBody() {
  for (var i = 0; i < metrics.length; i++) if (surfaceOperatorStrength(metrics[i], 'auxeticType') > .002) return true;
  return false;
}
function auxeticEffectPad(glyphs) {
  var extra = 0, extents = new Map(); if (surfaceOutputOpacity('auxeticType') <= .002) return 0;
  for (var i = 0; i < glyphs.length; i++) {
    var g = glyphs[i], settings = auxeticGlyphSettings(g);
    if (surfaceGlyphStrength(g, 'auxeticType') <= .002 || !String(g.ch || '').trim() || auxeticIsNative(settings)) continue;
    var key = auxeticSourceKey(g.ch, settings, g), data = auxeticPool.read(key); if (!data) continue;
    var phase = compositionState.enabled ? compositionState.phase : 0, extentKey = key + ':' + settings.opening + ':' + settings.ligament + ':' + settings.motion + ':' + phase;
    var extent = extents.get(extentKey);
    if (extent == null) {
      try {
        var shape = AuxeticType.renderAuxeticGlyph(data.compiled, settings, phase, { tolerance: .08, maxPoints: 524288 });
        extent = 0;
        for (var r = 0; r < shape.rings.length; r++) for (var p = 0; p < shape.rings[r].points.length; p++) {
          var point = shape.rings[r].points[p];
          extent = Math.max(extent, -point.x, point.x - data.advance, -point.y - data.ascent, point.y - data.descent);
        }
      } catch (error) { auxeticRenderError = error.message || String(error); auxeticUpdateStatus(); continue; }
      extents.set(extentKey, extent);
    }
    var stretch = Math.max(Math.abs(g.scaleX || 1), Math.abs(g.scaleY || 1));
    var shear = 1 + Math.abs(Math.tan((g.skewX || 0) * Math.PI / 180)) + Math.abs(Math.tan((g.skewY || 0) * Math.PI / 180));
    extra = Math.max(extra, (extent + .2) * params.fontSize / 192 * stretch * shear * Math.SQRT2);
  }
  return extra;
}
function auxeticTraceRings(path, rings) {
  for (var r = 0; r < rings.length; r++) {
    var points = rings[r].points; if (!points.length) continue;
    path.moveTo(points[0].x, points[0].y);
    for (var p = 1; p < points.length; p++) path.lineTo(points[p].x, points[p].y); path.closePath();
  }
}
function renderAuxeticTypeDirect(targetCtx, glyphs, pixelScale, L, fm, livePreview) {
  var ctx = targetCtx, color = surfaceEffectColor('auxeticType'); auxeticRenderError = '';
  if (surfaceOutputOpacity('auxeticType') <= .002) return;
  var phase = compositionState.enabled ? compositionState.phase : 0, groups = new Map(), items = [];
  for (var i = 0; i < glyphs.length; i++) {
    var g = glyphs[i], strength = surfaceGlyphStrength(g, 'auxeticType');
    if (strength <= .002 || (g.opacity != null && g.opacity <= .002) || !String(g.ch || '').trim()) continue;
    var settings = auxeticGlyphSettings(g), sourceKey = auxeticSourceKey(g.ch, settings, g), data = auxeticPool.read(sourceKey);
    var item = { glyph: g, strength: strength, data: data, group: null, error: null, native: auxeticIsNativeAtPhase(settings, phase) }; items.push(item);
    if (item.native) continue;
    if (!data) {
      var state = auxeticPool.inspect(sourceKey); item.error = new Error(state.error || 'Auxetic Typeの切断字形を準備中です。');
      item.error.code = state.error ? 'AUXETIC_ERROR' : 'AUXETIC_PENDING'; if (!livePreview) throw item.error; continue;
    }
    ctx.save();
    try {
      spectralGlyphFrame(ctx, g, pixelScale, L, fm, data);
      var tolerance = AuxeticType.auxeticPixelTolerance(globalThis.TypeDeformerRenderContext?TypeDeformerRenderContext.physical(ctx.canvas).getContext('2d').getTransform():ctx.getTransform(), .2);
      var groupKey = JSON.stringify([sourceKey, settings]), group = groups.get(groupKey);
      if (!group) { group = { data: data, settings: settings, tolerance: tolerance, remaining: 0, generated: false, shape: null, path: null, error: null }; groups.set(groupKey, group); }
      group.tolerance = Math.min(group.tolerance, tolerance); group.remaining++; item.group = group;
    } catch (error) { item.error = error; if (!livePreview) throw error; }
    finally { ctx.restore(); }
  }
  for (var j = 0; j < items.length; j++) {
    var entry = items[j], group = entry.group, glyph = entry.glyph;
    if (group && !group.generated) {
      group.generated = true;
      try {
        group.shape = AuxeticType.renderAuxeticGlyph(group.data.compiled, group.settings, phase, { tolerance: group.tolerance, maxPoints: 524288 });
        if (typeof Path2D === 'function') { group.path = new Path2D(); auxeticTraceRings(group.path, group.shape.rings); group.shape = null; }
      } catch (error) { group.error = error; }
    }
    var error = entry.error || (group && group.error); if (error && !livePreview) throw error;
    if (error && error.code !== 'AUXETIC_PENDING' && !auxeticRenderError) auxeticRenderError = error.message || String(error);
    if (entry.native || !group || error) drawSurfaceGlyph(ctx, glyph, pixelScale, L, fm, entry.strength, color);
    else {
      ctx.save();
      try {
        spectralGlyphFrame(ctx, glyph, pixelScale, L, fm, entry.data);
        ctx.globalAlpha = entry.strength * (glyph.opacity == null ? 1 : glyph.opacity); ctx.fillStyle = color;
        if (group.path) ctx.fill(group.path); else { ctx.beginPath(); auxeticTraceRings(ctx, group.shape.rings); ctx.fill(); }
      } finally { ctx.restore(); }
    }
    if (group && --group.remaining === 0) { group.path = null; group.shape = null; }
  }
  auxeticUpdateStatus();
}
