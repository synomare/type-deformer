// Embedded in the editor IIFE; see scripts/embed-conformal.mjs.
var conformalPool = ConformalType.createConformalSourcePool({ pointLimit: 262144 });
var conformalFontRevision = 0, conformalTimer = null, conformalStatusSignature = '';
var conformalRenderError = '', conformalDrawSignature = '';
var CONFORMAL_TYPE_STARTS = {
  lens: { conformalAmount: .82, conformalPower: -1, conformalSpiral: 0, conformalAngle: -35, conformalMotion: .55 },
  coil: { conformalAmount: .82, conformalPower: .2, conformalSpiral: 2.5, conformalAngle: -45, conformalMotion: .55 },
  flare: { conformalAmount: .8, conformalPower: 2.5, conformalSpiral: 0, conformalAngle: -60, conformalMotion: .55 }
};
function applyConformalTypePreset(name) {
  var preset = CONFORMAL_TYPE_STARTS[name]; if (!preset) return;
  pushHistory(); Object.assign(editableBatchProfile(), preset);
  conformalRenderError = ''; refreshBatchProfileControls(); applyAllOperatorVisuals(); markAutosaveDirty();
}
function conformalGlyphSettings(g) {
  var profile = g.surface || {};
  function value(key) { return Number.isFinite(profile[key]) ? profile[key] : params[key]; }
  return ConformalType.normalizeConformalSettings({ amount: value('conformalAmount'), power: value('conformalPower'),
    spiral: value('conformalSpiral'), angle: value('conformalAngle'), motion: value('conformalMotion') });
}
function conformalSourceKey(ch, g) {
  return conformalFontRevision + ':' + (g && g.fontAxes ? glyphFontSpec(g,768).key : params.fontWeight + ' 768px ' + params.fontFamily) + '\u0000' + ch;
}
function conformalIsNative(settings) {
  return settings.amount === 0 || (settings.power === 1 && settings.spiral === 0);
}
function conformalGlyphData(ch, fontSpec, available) {
  var canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  var font = fontSpec.glyph ? glyphFontSpec(fontSpec.glyph,768).font : fontSpec.font; ctx.font = font;
  var measure = ctx.measureText(ch), unit = 4;
  var left = Math.ceil(Math.max(0, measure.actualBoundingBoxLeft || 0)) + 16;
  var ascent = Math.ceil(Math.max(1, measure.actualBoundingBoxAscent || 768)) + 16;
  var right = Math.ceil(Math.max(measure.width, measure.actualBoundingBoxRight || 0)) + 16;
  var descent = Math.ceil(Math.max(0, measure.actualBoundingBoxDescent || 0)) + 16;
  var width = left + right, height = ascent + descent;
  if (width > 4096 || height > 4096) throw new RangeError('この字形は高精度ソースの4096px上限を超えています。');
  canvas.width = Math.max(8, width); canvas.height = Math.max(8, height);
  ctx.font = font; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff'; ctx.fillText(ch, left, ascent);
  var source = spectralTraceContours(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
  var count = 0;
  var contours = source.map(function (contour) {
    count += contour.points.length;
    return { points: contour.points.map(function (point) { return { x: (point.x - left) / unit, y: (point.y - ascent) / unit }; }) };
  });
  if (count > available) throw new RangeError('字形メモリ上限に達しました。適用する文字種を減らしてください。');
  ctx.textBaseline = 'middle'; var middle = ctx.measureText(ch);
  var middleOffset = Number.isFinite(middle.actualBoundingBoxAscent) && Number.isFinite(measure.actualBoundingBoxAscent)
    ? (measure.actualBoundingBoxAscent - middle.actualBoundingBoxAscent) / unit : 192 * .35;
  var glyph = ConformalType.prepareConformalGlyph(contours);
  return { compiled: ConformalType.compileConformalGlyph(glyph), pointCount: count, advance: measure.width / unit,
    middleOffset: middleOffset, ascent: Math.max(1, measure.actualBoundingBoxAscent || 768) / unit,
    descent: Math.max(0, measure.actualBoundingBoxDescent || 0) / unit };
}
function conformalRequests(glyphs) {
  var requests = new Map(), font = params.fontWeight + ' 768px ' + params.fontFamily;
  if (surfaceOutputOpacity('conformalType') <= .002) return [];
  for (var i = 0; i < glyphs.length; i++) {
    var g = glyphs[i];
    if (surfaceGlyphStrength(g, 'conformalType') <= .002 || !String(g.ch || '').trim()) continue;
    if (conformalIsNative(conformalGlyphSettings(g))) continue;
    var key = conformalSourceKey(g.ch,g);
    if (!requests.has(key)) requests.set(key, { key: key, load: conformalGlyphData.bind(null, g.ch, { key: key, font: font, glyph: g.fontAxes ? g : null }) });
  }
  return Array.from(requests.values());
}
function conformalUpdateStatus() {
  var state = conformalPool.state(), container = document.getElementById('conformalWorkStatus');
  var button = document.getElementById('btnConformalPause'), retry = document.getElementById('btnConformalRetry');
  var error = conformalRenderError || state.error;
  var text = error ? 'Conformal Type · ' + error
    : state.paused && state.pending ? 'Conformal Type · 高精度字形の準備を一時停止中。未準備の字は元文字で表示します。'
    : state.pending ? 'Conformal Type · 高精度字形を準備中。未準備の字は元文字で表示します。'
    : 'Conformal Type · ' + state.total + '字形 / ' + state.points.toLocaleString() + '輪郭点を準備済み';
  var signature = text + ':' + state.ready + ':' + state.total;
  var progress = document.getElementById('conformalWorkProgress');
  progress.hidden = !state.pending; progress.value = state.total ? state.ready / state.total : 1;
  progress.setAttribute('aria-valuetext', state.ready + '/' + state.total + '字形');
  if (signature !== conformalStatusSignature) {
    conformalStatusSignature = signature; container.hidden = !state.total && !error;
    document.getElementById('conformalWorkText').textContent = text;
    button.hidden = !state.pending; button.textContent = state.paused ? '準備を再開' : '準備を一時停止';
    button.setAttribute('aria-pressed', String(state.paused));
    retry.hidden = !error;
  }
  var drawSignature = state.ready + ':' + state.total + ':' + error;
  if (drawSignature !== conformalDrawSignature) {
    conformalDrawSignature = drawSignature; scheduleSurfaceFxDraw(); if (compositionState.enabled) scheduleCompositionDraw();
  }
  return state;
}
function conformalScheduleWork() {
  var state = conformalUpdateStatus();
  if (!state.pending || state.paused || conformalTimer !== null) return;
  conformalTimer = requestAnimationFrame(function () {
    conformalTimer = null; conformalPool.advance(); conformalScheduleWork();
  });
}
function conformalPrepare(glyphs) {
  if(globalThis.TypeDeformerRenderJobs&&typeof Worker!=='undefined'&&!globalThis.TypeDeformerWorkerRuntime)return;
  var requests = conformalRequests(glyphs); conformalPool.sync(requests);
  if (!requests.length) {
    conformalRenderError = ''; conformalPool.setPaused(false);
    if (conformalTimer !== null) cancelAnimationFrame(conformalTimer); conformalTimer = null;
  }
  conformalScheduleWork();
}
function conformalAssertReady(glyphs) {
  if(globalThis.TypeDeformerRenderJobs&&typeof Worker!=='undefined'&&!globalThis.TypeDeformerWorkerRuntime)return;
  // Export preflight observes only its own requirements. It must not replace
  // the live scene's leases or let an old preview error poison a fresh render.
  var requests = conformalRequests(glyphs);
  for (var i = 0; i < requests.length; i++) {
    var state = conformalPool.inspect(requests[i].key); if (state.status === 'ready') continue;
    var failure = new Error(state.error || 'Conformal Typeの高精度字形を準備中です。キャンバスの準備完了を確認してください。');
    failure.code = state.status === 'error' ? 'CONFORMAL_ERROR' : 'CONFORMAL_PENDING'; throw failure;
  }
}
function conformalRetry() { conformalPool.retry(); conformalRenderError = ''; conformalScheduleWork(); scheduleSurfaceFxDraw(); }
function conformalInvalidateFonts() {
  conformalFontRevision++; conformalPool.reset(); conformalRenderError = ''; conformalStatusSignature = '';
  if (conformalTimer !== null) cancelAnimationFrame(conformalTimer); conformalTimer = null; scheduleSurfaceFxDraw();
}
function conformalHasAppliedBody() {
  for (var i = 0; i < metrics.length; i++) if (surfaceOperatorStrength(metrics[i], 'conformalType') > .002) return true;
  return false;
}
function conformalEffectPad(glyphs) {
  var extra = 0, extents = new Map();
  if (surfaceOutputOpacity('conformalType') <= .002) return 0;
  for (var i = 0; i < glyphs.length; i++) {
    var g = glyphs[i]; if (surfaceGlyphStrength(g, 'conformalType') <= .002 || !String(g.ch || '').trim()) continue;
    var data = conformalPool.read(conformalSourceKey(g.ch,g)); if (!data) continue;
    var settings = conformalGlyphSettings(g), phase = compositionState.enabled ? compositionState.phase : 0;
    if (conformalIsNative(settings)) continue;
    var key = JSON.stringify([conformalSourceKey(g.ch,g), settings, phase]), extent = extents.get(key);
    if (extent == null) {
      var shape;
      try { shape = ConformalType.renderConformalLod(data.compiled, settings, phase, { tolerance: .08, maxPoints: 131072 }); }
      catch (error) { conformalRenderError = error.message || String(error); conformalUpdateStatus(); continue; }
      extent = 0;
      for (var r = 0; r < shape.rings.length; r++) for (var p = 0; p < shape.rings[r].points.length; p++) {
        var point = shape.rings[r].points[p];
        extent = Math.max(extent, -point.x, point.x - data.advance, -point.y - data.ascent, point.y - data.descent);
      }
      extents.set(key, extent);
    }
    var stretch = Math.max(Math.abs(g.scaleX || 1), Math.abs(g.scaleY || 1));
    var shear = 1 + Math.abs(Math.tan((g.skewX || 0) * Math.PI / 180)) + Math.abs(Math.tan((g.skewY || 0) * Math.PI / 180));
    extra = Math.max(extra, (extent + .2) * params.fontSize / 192 * stretch * shear * Math.SQRT2);
  }
  return extra;
}
function conformalTraceRings(path, rings) {
  for (var r = 0; r < rings.length; r++) {
    var points = rings[r].points; if (!points.length) continue;
    path.moveTo(points[0].x, points[0].y);
    for (var p = 1; p < points.length; p++) path.lineTo(points[p].x, points[p].y); path.closePath();
  }
}
function renderConformalTypeDirect(targetCtx, glyphs, pixelScale, L, fm, livePreview) {
  var ctx = targetCtx, color = surfaceEffectColor('conformalType'); conformalRenderError = '';
  if (surfaceOutputOpacity('conformalType') <= .002) return;
  var phase = compositionState.enabled ? compositionState.phase : 0, groups = new Map(), items = [];
  // Pass 1: one geometry group per source and settings, at the strictest
  // actual output tolerance requested by ANY copy. Never quantize matrices,
  // lower precision, or let iteration order choose the shared silhouette.
  for (var i = 0; i < glyphs.length; i++) {
    var g = glyphs[i], strength = surfaceGlyphStrength(g, 'conformalType');
    if (strength <= .002 || (g.opacity != null && g.opacity <= .002) || !String(g.ch || '').trim()) continue;
    var sourceKey = conformalSourceKey(g.ch,g), data = conformalPool.read(sourceKey), settings = conformalGlyphSettings(g);
    var item = { glyph: g, strength: strength, data: data, group: null, error: null }; items.push(item);
    if (conformalIsNative(settings)) continue;
    if (!data) {
      var state = conformalPool.inspect(sourceKey);
      item.error = new Error(state.error || 'Conformal Typeの高精度字形を準備中です。');
      item.error.code = state.error ? 'CONFORMAL_ERROR' : 'CONFORMAL_PENDING';
      if (!livePreview) throw item.error;
      continue;
    }
    ctx.save();
    try {
      spectralGlyphFrame(ctx, g, pixelScale, L, fm, data);
      var tolerance = ConformalType.conformalPixelTolerance(globalThis.TypeDeformerRenderContext?TypeDeformerRenderContext.physical(ctx.canvas).getContext('2d').getTransform():ctx.getTransform(), .2);
      var key = JSON.stringify([sourceKey, settings]), group = groups.get(key);
      if (!group) { group = { data: data, settings: settings, tolerance: tolerance, remaining: 0, generated: false, shape: null, path: null, error: null }; groups.set(key, group); }
      group.tolerance = Math.min(group.tolerance, tolerance); group.remaining++; item.group = group;
    } catch (error) { item.error = error; if (!livePreview) throw error; }
    finally { ctx.restore(); }
  }
  // Pass 2 retains original glyph paint order/alpha. Path2D caches vector
  // commands only (never a bitmap) and each group is released after last use.
  for (var j = 0; j < items.length; j++) {
    var entry = items[j], group = entry.group, glyph = entry.glyph;
    if (group && !group.generated) {
      group.generated = true;
      try {
        group.shape = ConformalType.renderConformalLod(group.data.compiled, group.settings, phase, { tolerance: group.tolerance, maxPoints: 131072 });
        if (typeof Path2D === 'function') { group.path = new Path2D(); conformalTraceRings(group.path, group.shape.rings); group.shape = null; }
      } catch (error) { group.error = error; }
    }
    var error = entry.error || (group && group.error);
    if (error && !livePreview) throw error;
    if (error && error.code !== 'CONFORMAL_PENDING' && !conformalRenderError) conformalRenderError = error.message || String(error);
    if (!group || error) drawSurfaceGlyph(ctx, glyph, pixelScale, L, fm, entry.strength, color);
    else {
      ctx.save();
      try {
        spectralGlyphFrame(ctx, glyph, pixelScale, L, fm, entry.data);
        ctx.globalAlpha = entry.strength * (glyph.opacity == null ? 1 : glyph.opacity); ctx.fillStyle = color;
        // Keep nonzero winding: intentional multiple coverage remains ink.
        if (group.path) ctx.fill(group.path);
        else { ctx.beginPath(); conformalTraceRings(ctx, group.shape.rings); ctx.fill(); }
      } finally { ctx.restore(); }
    }
    if (group && --group.remaining === 0) { group.path = null; group.shape = null; }
  }
  conformalUpdateStatus();
}
