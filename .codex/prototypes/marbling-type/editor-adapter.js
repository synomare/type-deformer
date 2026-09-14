// Embedded in the editor IIFE. Source compilation is sliced; final body
// evaluation is synchronous at the caller's actual clock/destination, never
// a stale asynchronous shape pasted onto newer Compose poses. This preserves
// correctness but is NOT the asynchronous native-session/playback integration.
var marblingPool = MarblingType.createMarblingSourcePool();
var marblingFontRevision = 0, marblingTimer = null, marblingRenderError = '';
var marblingStatusSignature = '', marblingDrawSignature = '';
var marblingCache = new Map(), marblingCachePoints = 0;
function marblingClearGeometry() { marblingCache.clear(); marblingCachePoints = 0; }
function marblingPhase(phase) {
  var value = Number.isFinite(phase) ? phase : compositionState.enabled ? compositionState.phase : 0;
  return ((value % 1) + 1) % 1;
}
function applyMarblingTypePreset(name) {
  var preset = MarblingType.MARBLING_PRESETS[name]; if (!preset) return;
  pushHistory(); var profile = editableBatchProfile();
  Object.keys(preset).forEach(function (key) { profile['marbling' + key[0].toUpperCase() + key.slice(1)] = preset[key]; });
  marblingRenderError = ''; refreshBatchProfileControls(); applyAllOperatorVisuals(); markAutosaveDirty();
}
function marblingGlyphSettings(g) {
  var profile = g.surface || {}, settings = {};
  ['amount', 'pitch', 'focus', 'circulation', 'angle', 'motion'].forEach(function (field) {
    var key = 'marbling' + field[0].toUpperCase() + field.slice(1);
    settings[field] = Number.isFinite(profile[key]) ? profile[key] : params[key];
  });
  settings.mode = MarblingType.MARBLING_MODES.indexOf(profile.marblingMode) >= 0 ? profile.marblingMode : params.marblingMode;
  return MarblingType.normalizeMarblingSettings(settings);
}
function marblingSource(ch, g) {
  var spec = g && g.fontAxes ? glyphFontSpec(g,768) : null, font = params.fontWeight + ' 768px ' + params.fontFamily;
  return { key: (spec ? spec.key : font) + '\u0000' + ch, revision: String(marblingFontRevision),
    load: marblingGlyphData.bind(null, ch, { font: font, glyph: g && g.fontAxes ? g : null }) };
}
function marblingGlyphData(ch, fontSpec, allowance) {
  var canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Marbling Typeの字形Canvasを作成できません。');
  var font = fontSpec.glyph ? glyphFontSpec(fontSpec.glyph,768).font : fontSpec.font;
  try {
    ctx.font = font; var measure = ctx.measureText(ch), unit = 4;
    var left = Math.ceil(Math.max(0, measure.actualBoundingBoxLeft || 0)) + 16;
    var ascent = Math.ceil(Math.max(1, measure.actualBoundingBoxAscent || 768)) + 16;
    var right = Math.ceil(Math.max(measure.width, measure.actualBoundingBoxRight || 0)) + 16;
    var descent = Math.ceil(Math.max(0, measure.actualBoundingBoxDescent || 0)) + 16;
    if (left + right > 4096 || ascent + descent > 4096) throw new RangeError('Marbling Typeの字形ソースは4096pxが上限です。');
    canvas.width = Math.max(8, left + right); canvas.height = Math.max(8, ascent + descent);
    ctx.font = font; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff'; ctx.fillText(ch, left, ascent);
    var traced = spectralTraceContours(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
    var count = 0, contours = traced.map(function (ring) {
      count += ring.points.length;
      return { points: ring.points.map(function (p) { return { x: (p.x - left) / unit, y: (p.y - ascent) / unit }; }) };
    });
    if (count > allowance.maxPoints) throw new RangeError('Marbling Typeの字形メモリ上限です。適用する文字種を減らしてください。');
    ctx.textBaseline = 'middle'; var middle = ctx.measureText(ch);
    var middleOffset = Number.isFinite(middle.actualBoundingBoxAscent) && Number.isFinite(measure.actualBoundingBoxAscent)
      ? (measure.actualBoundingBoxAscent - middle.actualBoundingBoxAscent) / unit : 192 * .35;
    return Object.freeze(Object.assign({}, MarblingType.prepareMarblingGlyph(contours), {
      nativeMetrics: Object.freeze({ advance: measure.width / unit, middleOffset: middleOffset,
        ascent: Math.max(1, measure.actualBoundingBoxAscent || 768) / unit,
        descent: Math.max(0, measure.actualBoundingBoxDescent || 0) / unit })
    }));
  } finally { canvas.width = 0; canvas.height = 0; }
}
function marblingRequests(glyphs) {
  var requests = new Map(); if (surfaceOutputOpacity('marblingType') <= .002) return [];
  glyphs.forEach(function (g) {
    if (surfaceGlyphStrength(g, 'marblingType') <= .002 || !String(g.ch || '').trim() || g.opacity === 0 || marblingGlyphSettings(g).amount === 0) return;
    var request = marblingSource(g.ch,g); if (!requests.has(request.key)) requests.set(request.key, request);
  });
  return Array.from(requests.values());
}
function marblingUpdateStatus() {
  var state = marblingPool.state(), box = document.getElementById('marblingWorkStatus');
  var text = marblingRenderError ? 'Marbling Type · ' + marblingRenderError
    : state.errors ? 'Marbling Type · 字形の準備に失敗しました。文字種を減らすか再準備してください。'
    : state.pending ? 'Marbling Type · ' + (state.paused ? '字形準備を停止中。' : '字形を準備中。') + '未準備の字は元文字で表示します。'
    : 'Marbling Type · ' + state.ready + '字形を準備済み';
  var signature = text + ':' + state.total + ':' + state.ready;
  if (box && signature !== marblingStatusSignature) {
    marblingStatusSignature = signature; box.hidden = !state.total && !marblingRenderError;
    document.getElementById('marblingWorkText').textContent = text;
    var progress = document.getElementById('marblingWorkProgress');
    progress.hidden = !state.pending; progress.value = state.total ? state.ready / state.total : 1;
    progress.setAttribute('aria-valuetext', state.ready + '/' + state.total + '字形');
    var pause = document.getElementById('btnMarblingPause'); pause.hidden = !state.pending;
    pause.textContent = state.paused ? '準備を再開' : '準備を一時停止'; pause.setAttribute('aria-pressed', String(state.paused));
    document.getElementById('btnMarblingRetry').hidden = !state.errors && !marblingRenderError;
  }
  var drawSignature = state.total + ':' + state.ready + ':' + state.errors;
  if (drawSignature !== marblingDrawSignature) {
    marblingDrawSignature = drawSignature; scheduleSurfaceFxDraw(); if (compositionState.enabled) scheduleCompositionDraw();
  }
  return state;
}
function marblingScheduleWork() {
  var state = marblingUpdateStatus(); if (!state.pending || state.paused || marblingTimer !== null) return;
  marblingTimer = requestAnimationFrame(function () {
    marblingTimer = null; marblingPool.advance({ maxWork: 2048, maxMs: 2 }); marblingScheduleWork();
  });
}
function marblingPrepare(glyphs) {
  if(globalThis.TypeDeformerRenderJobs&&typeof Worker!=='undefined'&&!globalThis.TypeDeformerWorkerRuntime)return;
  var requests = marblingRequests(glyphs); marblingPool.sync(requests);
  var active = new Set(requests.map(function (r) { return r.key; }));
  marblingCache.forEach(function (entry, key) {
    if (!active.has(entry.sourceKey)) { marblingCachePoints -= entry.shape.pointCount; marblingCache.delete(key); }
  });
  if (!requests.length) {
    marblingRenderError = ''; marblingClearGeometry(); marblingPool.setPaused(false);
    if (marblingTimer !== null) cancelAnimationFrame(marblingTimer); marblingTimer = null;
  }
  marblingScheduleWork();
}
function marblingAssertReady(glyphs) {
  if(globalThis.TypeDeformerRenderJobs&&typeof Worker!=='undefined'&&!globalThis.TypeDeformerWorkerRuntime)return;
  marblingRequests(glyphs).forEach(function (request) {
    var ticket = marblingPool.peek(request); if (ticket && ticket.status === 'ready') return;
    var error = new Error(ticket && ticket.error ? ticket.error.message : 'Marbling Typeの字形を準備中です。キャンバスの準備完了を待ってください。');
    error.code = ticket && ticket.status === 'error' ? 'MARBLING_ERROR' : 'MARBLING_PENDING'; throw error;
  });
}
function marblingRetry() { marblingPool.retry(); marblingRenderError = ''; marblingClearGeometry(); marblingScheduleWork(); scheduleSurfaceFxDraw(); }
function marblingInvalidateFonts() {
  marblingFontRevision++; marblingPool.reset(); marblingClearGeometry(); marblingRenderError = ''; marblingStatusSignature = '';
  if (marblingTimer !== null) cancelAnimationFrame(marblingTimer); marblingTimer = null; scheduleSurfaceFxDraw();
}
function marblingHasAppliedBody() {
  return metrics.some(function (m) { return surfaceOperatorStrength(m, 'marblingType') > .002; });
}
function marblingShape(compiled, settings, phase, tolerance, sourceKey) {
  // Keep destination LODs independent: a high-resolution export must not
  // replace the preview's tessellation and change its paused pixels.
  var key = JSON.stringify([marblingFontRevision, sourceKey, settings, settings.motion ? marblingPhase(phase) : 0, tolerance]);
  var cached = marblingCache.get(key);
  if (cached && cached.compiled === compiled && cached.shape.tolerance <= tolerance) {
    marblingCache.delete(key); marblingCache.set(key, cached); return cached.shape;
  }
  var shape = MarblingType.renderMarblingLod(compiled, settings, phase, { tolerance: tolerance, maxPoints: 262144 });
  if (cached) { marblingCachePoints -= cached.shape.pointCount; marblingCache.delete(key); }
  while (marblingCache.size && marblingCachePoints + shape.pointCount > 262144) {
    var oldest = marblingCache.keys().next().value; marblingCachePoints -= marblingCache.get(oldest).shape.pointCount; marblingCache.delete(oldest);
  }
  marblingCache.set(key, { compiled: compiled, shape: shape, sourceKey: sourceKey }); marblingCachePoints += shape.pointCount;
  return shape;
}
function marblingEffectPad(glyphs, phase) {
  var extra = 0; if (surfaceOutputOpacity('marblingType') <= .002) return 0;
  glyphs.forEach(function (g) {
    var settings = marblingGlyphSettings(g);
    if (surfaceGlyphStrength(g, 'marblingType') <= .002 || !String(g.ch || '').trim() || g.opacity === 0 || settings.amount === 0) return;
    var request = marblingSource(g.ch,g), ticket = marblingPool.peek(request); if (!ticket || ticket.status !== 'ready') return;
    try {
      var compiled = ticket.result, fm = compiled.glyph.nativeMetrics;
      var shape = marblingShape(compiled, settings, marblingPhase(phase), .08, request.key), extent = 0;
      shape.rings.forEach(function (ring) { ring.points.forEach(function (p) {
        extent = Math.max(extent, -p.x, p.x - fm.advance, -p.y - fm.ascent, p.y - fm.descent);
      }); });
      var stretch = Math.max(Math.abs(g.scaleX == null ? 1 : g.scaleX), Math.abs(g.scaleY == null ? 1 : g.scaleY));
      var shear = 1 + Math.abs(Math.tan((g.skewX || 0) * Math.PI / 180)) + Math.abs(Math.tan((g.skewY || 0) * Math.PI / 180));
      extra = Math.max(extra, (extent + .08) * params.fontSize / 192 * stretch * shear * Math.SQRT2);
    } catch (error) { marblingRenderError = error.message; marblingUpdateStatus(); }
  });
  return extra;
}
function marblingTraceRings(ctx, rings) {
  rings.forEach(function (ring) {
    var points = ring.points; if (!points.length) return;
    ctx.moveTo(points[0].x, points[0].y);
    for (var i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y); ctx.closePath();
  });
}
function renderMarblingTypeDirect(ctx, glyphs, pixelScale, L, fm, livePreview) {
  if (surfaceOutputOpacity('marblingType') <= .002) return;
  var color = surfaceEffectColor('marblingType'), phase = marblingPhase(), groups = new Map(), items = [], usedPoints = 0;
  marblingRenderError = '';
  glyphs.forEach(function (g) {
    var strength = surfaceGlyphStrength(g, 'marblingType');
    if (strength <= .002 || !String(g.ch || '').trim() || g.opacity === 0) return;
    var settings = marblingGlyphSettings(g), entry = { g: g, strength: strength, native: settings.amount === 0, group: null, error: null };
    items.push(entry); if (entry.native) return;
    var source = marblingSource(g.ch,g), ticket = marblingPool.peek(source);
    if (!ticket || ticket.status !== 'ready') {
      entry.error = Object.assign(new Error(ticket && ticket.error ? ticket.error.message : 'Marbling Typeの字形を準備中です。'),
        { code: ticket && ticket.status === 'error' ? 'MARBLING_ERROR' : 'MARBLING_PENDING' });
      if (!livePreview) throw entry.error; return;
    }
    ctx.save();
    try {
      spectralGlyphFrame(ctx, g, pixelScale, L, fm, ticket.result.glyph.nativeMetrics);
      var tolerance = MarblingType.marblingPixelTolerance(globalThis.TypeDeformerRenderContext?TypeDeformerRenderContext.physical(ctx.canvas).getContext('2d').getTransform():ctx.getTransform(), .2), key = JSON.stringify([source.key, settings]);
      var group = groups.get(key);
      if (!group) { group = { compiled: ticket.result, sourceKey: source.key, settings: settings, tolerance: tolerance, generated: false, shape: null, error: null, remaining: 0 }; groups.set(key, group); }
      group.tolerance = Math.min(group.tolerance, tolerance); group.remaining++; entry.group = group;
    } catch (error) { entry.error = error; if (!livePreview) throw error; }
    finally { ctx.restore(); }
  });
  items.forEach(function (entry) {
    var group = entry.group;
    if (group && !group.generated) {
      group.generated = true;
      try {
        group.shape = marblingShape(group.compiled, group.settings, phase, group.tolerance, group.sourceKey);
        usedPoints += group.shape.pointCount;
        if (usedPoints > 262144) throw new RangeError('Marbling Typeの1フレームの輪郭上限です。文字種・設定の種類を減らしてください。');
        if (typeof Path2D === 'function') { group.path = new Path2D(); marblingTraceRings(group.path, group.shape.rings); }
      } catch (error) { group.shape = null; group.error = error; }
    }
    var error = entry.error || (group && group.error); if (error && !livePreview) throw error;
    if (error && error.code !== 'MARBLING_PENDING' && !marblingRenderError) marblingRenderError = error.message;
    if (entry.native || !group || error) drawSurfaceGlyph(ctx, entry.g, pixelScale, L, fm, entry.strength, color);
    else {
      ctx.save();
      try {
        spectralGlyphFrame(ctx, entry.g, pixelScale, L, fm, group.compiled.glyph.nativeMetrics);
        ctx.globalAlpha = entry.strength * (entry.g.opacity == null ? 1 : entry.g.opacity); ctx.fillStyle = color;
        if (group.path) ctx.fill(group.path); else { ctx.beginPath(); marblingTraceRings(ctx, group.shape.rings); ctx.fill(); }
      } finally { ctx.restore(); }
    }
    if (group && --group.remaining === 0) { group.shape = null; group.path = null; }
  });
  marblingUpdateStatus();
}
