// Embedded in the editor IIFE; see scripts/embed-differential.mjs.
var differentialController = DifferentialGrowth.createGrowthController();
var differentialFontRevision = 0, differentialTimer = null;
var differentialStatusSignature = '', differentialDrawSignature = '';
var differentialMaskCache = new Map(), differentialMaskPoints = 0;
var DIFFERENTIAL_TYPE_PRESETS = {
  rooted: { differentialAge: 1.6, differentialGrain: 4, differentialTension: .65, differentialMemory: .006, differentialPatch: .7, differentialArea: 1.1, differentialMotion: .55 },
  labyrinth: { differentialAge: 3, differentialGrain: 3, differentialTension: .35, differentialMemory: .0008, differentialPatch: .8, differentialArea: 1.1, differentialMotion: 1 },
  frond: { differentialAge: 2.6, differentialGrain: 3.5, differentialTension: .35, differentialMemory: .0015, differentialPatch: 1, differentialArea: 1.6, differentialMotion: .8 }
};
function applyDifferentialTypePreset(name) {
  var preset = DIFFERENTIAL_TYPE_PRESETS[name]; if (!preset) return;
  pushHistory(); Object.assign(editableBatchProfile(), preset);
  refreshBatchProfileControls(); applyAllOperatorVisuals(); markAutosaveDirty();
}
function differentialGlyphSettings(g) {
  var profile = g.surface || {};
  function value(key) { return Number.isFinite(profile[key]) ? profile[key] : params[key]; }
  return DifferentialGrowth.normalizeGrowthSettings({ age: value('differentialAge'), grain: value('differentialGrain'),
    tension: value('differentialTension'), memory: value('differentialMemory'), patch: value('differentialPatch'),
    areaGain: value('differentialArea'), seed: ((params.seed * 131 + (String(g.ch).codePointAt(0) || 0)) | 0) });
}
function differentialSourceKey(ch, g) {
  return differentialFontRevision + ':' + (g && g.fontAxes ? glyphFontSpec(g,192).key : params.fontWeight + ' 192px ' + params.fontFamily) + '\u0000' + ch;
}
function differentialGlyphData(ch, fontSpec) {
  var key = fontSpec ? fontSpec.key : differentialSourceKey(ch);
  if (differentialMaskCache.has(key)) return differentialMaskCache.get(key);
  var canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  var font = fontSpec && fontSpec.glyph ? glyphFontSpec(fontSpec.glyph,192).font : fontSpec ? fontSpec.font : params.fontWeight + ' 192px ' + params.fontFamily;
  ctx.font = font;
  var measure = ctx.measureText(ch); ctx.textBaseline = 'middle';
  var middle = ctx.measureText(ch);
  var middleOffset = Number.isFinite(middle.actualBoundingBoxAscent) && Number.isFinite(measure.actualBoundingBoxAscent)
    ? measure.actualBoundingBoxAscent - middle.actualBoundingBoxAscent : 192 * .35;
  var left = Math.ceil(Math.max(0, measure.actualBoundingBoxLeft || 0)) + 4;
  var ascent = Math.ceil(Math.max(1, measure.actualBoundingBoxAscent || 192)) + 4;
  canvas.width = Math.max(8, Math.min(4096, left + Math.ceil(Math.max(measure.width, measure.actualBoundingBoxRight || 0)) + 4));
  canvas.height = ascent + Math.ceil(Math.max(0, measure.actualBoundingBoxDescent || 0)) + 4;
  ctx.font = font; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff'; ctx.fillText(ch, left, ascent);
  var contours = spectralTraceContours(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
  var count = 0;
  contours = contours.map(function (contour) {
    count += contour.points.length;
    return { area: contour.area, points: contour.points.map(function (p) { return { x: p.x - left, y: p.y - ascent }; }) };
  });
  var result = { contours: contours, advance: measure.width, middleOffset: middleOffset, ascent: ascent - 4,
    descent: Math.max(0, measure.actualBoundingBoxDescent || 0), pointCount: count };
  while (differentialMaskCache.size && (differentialMaskCache.size >= 32 || differentialMaskPoints + count > 65536)) {
    var oldest = differentialMaskCache.keys().next().value;
    differentialMaskPoints -= differentialMaskCache.get(oldest).pointCount; differentialMaskCache.delete(oldest);
  }
  if (count <= 65536) { differentialMaskCache.set(key, result); differentialMaskPoints += count; }
  return result;
}
function differentialRequests(glyphs) {
  var requests = new Map();
  for (var i = 0; i < glyphs.length; i++) {
    var g = glyphs[i];
    // Invisible Compose instances still prepare their complete trajectory, so
    // a later frame cannot start a new simulation halfway through recording.
    if (surfaceGlyphStrength(g, 'differentialType') <= .002 || !String(g.ch || '').trim()) continue;
    var settings = differentialGlyphSettings(g); if (settings.age <= 0) continue;
    var sourceKey = differentialSourceKey(g.ch,g), key = DifferentialGrowth.growthRequestKey(sourceKey, settings);
    var previous = requests.get(key);
    if (!previous || previous.settings.age < settings.age) requests.set(key, {
      sourceKey: sourceKey, settings: settings, load: differentialGlyphData.bind(null, g.ch,
        { key: sourceKey, font: params.fontWeight + ' 192px ' + params.fontFamily, glyph: g.fontAxes ? g : null })
    });
  }
  return Array.from(requests.values());
}
function differentialHasAppliedBody() {
  for (var i = 0; i < metrics.length; i++) if (surfaceOperatorStrength(metrics[i], 'differentialType') > .002) return true;
  return false;
}
function differentialUpdateStatus() {
  var state = differentialController.state, container = document.getElementById('differentialWorkStatus');
  var button = document.getElementById('btnDifferentialPause'), more = document.getElementById('btnDifferentialMemory');
  var text = state.error ? 'Differential Type: ' + state.error
    : state.memoryPaused ? '成長履歴が' + Math.round(state.historyBytes / 1048576) + ' MiBに達したため停止。文字種を減らすか、追加メモリを許可してください（履歴以外のメモリは別途使用）。'
    : state.paused && state.pending ? 'Differential Type · 計算を一時停止中。未計算の字は元文字で表示。'
    : state.pending ? 'Differential Type · 成長を計算中。未計算の字は元文字で表示します。'
    : 'Differential Type · ' + state.total + '字形の成長が準備できました';
  var signature = text + ':' + state.total;
  var progress = document.getElementById('differentialWorkProgress');
  progress.hidden = !state.pending; progress.value = state.progress;
  progress.setAttribute('aria-valuetext', Math.floor(state.progress * 100) + '% · ' + state.ready + '/' + state.total + '字形');
  if (signature !== differentialStatusSignature) {
    differentialStatusSignature = signature;
    container.hidden = !state.total;
    document.getElementById('differentialWorkText').textContent = text;
    button.hidden = !state.pending || state.memoryPaused || !!state.error;
    button.textContent = state.paused ? '計算を再開' : '計算を一時停止';
    button.setAttribute('aria-pressed', String(state.paused)); more.hidden = !state.memoryPaused;
    more.textContent = '履歴上限を' + Math.round(state.historyLimit * 2 / 1048576) + ' MiBへ増やす';
  }
  var drawSignature = state.ready + ':' + state.total + ':' + state.error;
  if (drawSignature !== differentialDrawSignature) {
    differentialDrawSignature = drawSignature; scheduleSurfaceFxDraw();
    if (compositionState.enabled) scheduleCompositionDraw();
  }
  return state;
}
function differentialScheduleWork() {
  var state = differentialUpdateStatus();
  if (!state.pending || state.paused || state.memoryPaused || state.error || differentialTimer !== null) return;
  differentialTimer = requestAnimationFrame(function () {
    differentialTimer = null; differentialController.advance(4); differentialScheduleWork();
  });
}
function differentialPrepare(glyphs) {
  if(globalThis.TypeDeformerRenderJobs&&typeof Worker!=='undefined'&&!globalThis.TypeDeformerWorkerRuntime)return;
  differentialController.sync(differentialRequests(glyphs)); differentialScheduleWork();
}
function differentialAssertReady(glyphs) {
  if(globalThis.TypeDeformerRenderJobs&&typeof Worker!=='undefined'&&!globalThis.TypeDeformerWorkerRuntime)return;
  var requests = differentialRequests(glyphs);
  for (var i = 0; i < requests.length; i++) if (!differentialController.isReady(requests[i].sourceKey, requests[i].settings)) {
    var failure = new Error('Differential Typeの成長計算が未完了です。キャンバスの「準備できました」を確認して、もう一度書き出してください。');
    failure.code = 'GROWTH_PENDING'; throw failure;
  }
}
function differentialInvalidateFonts() {
  differentialFontRevision++; differentialController.reset();
  differentialMaskCache.clear(); differentialMaskPoints = 0; differentialStatusSignature = '';
  if (differentialTimer !== null) cancelAnimationFrame(differentialTimer);
  differentialTimer = null; scheduleSurfaceFxDraw();
}
function differentialShape(g, settings) {
  var profile = g.surface || {}, depth = Number.isFinite(profile.differentialMotion) ? profile.differentialMotion : params.differentialMotion;
  var age = compositionState.enabled ? DifferentialGrowth.growthLoopAge(compositionState.phase, settings.age, depth) : settings.age;
  if (age <= .00001) return null;
  return differentialController.read(differentialSourceKey(g.ch,g), settings, age);
}
function differentialEffectPad(glyphs) {
  var extra = 0, extents = new Map();
  for (var i = 0; i < glyphs.length; i++) {
    var g = glyphs[i]; if (surfaceGlyphStrength(g, 'differentialType') <= .002 || !String(g.ch || '').trim()) continue;
    var settings = differentialGlyphSettings(g), key = JSON.stringify([differentialSourceKey(g.ch,g), settings, g.surface && g.surface.differentialMotion]);
    if (!extents.has(key)) {
      var shape = differentialShape(g, settings), extent = -1;
      if (shape) {
        var d = shape.data; extent = 0;
        for (var r = 0; r < shape.rings.length; r++) for (var p = 0; p < shape.rings[r].points.length; p++) {
          var point = shape.rings[r].points[p];
          extent = Math.max(extent, -point.x, point.x - d.advance, -point.y - d.ascent, point.y - d.descent);
        }
      }
      extents.set(key, extent);
    }
    var extent = extents.get(key); if (extent < 0) continue;
    var stretch = Math.max(Math.abs(g.scaleX || 1), Math.abs(g.scaleY || 1));
    var shear = 1 + Math.abs(Math.tan((g.skewX || 0) * Math.PI / 180)) + Math.abs(Math.tan((g.skewY || 0) * Math.PI / 180));
    extra = Math.max(extra, (extent + 8) * params.fontSize / 192 * stretch * shear * Math.SQRT2);
  }
  return extra;
}
function renderDifferentialType(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
  if (coverBase) compositeSurfaceSource(targetCtx, buildSurfaceMask(glyphs, 'differentialType', width, height, pixelScale, L, fm), 'differentialType', true);
  var work = surfaceScratch('differential-type-v39-body', width, height, false), ctx = work.ctx;
  var color = surfaceEffectColor('differentialType'), samples = new Map();
  for (var i = 0; i < glyphs.length; i++) {
    var g = glyphs[i], strength = surfaceGlyphStrength(g, 'differentialType');
    if (strength <= .002 || (g.opacity != null && g.opacity <= .002) || !String(g.ch || '').trim()) continue;
    var settings = differentialGlyphSettings(g), key = JSON.stringify([differentialSourceKey(g.ch,g), settings, g.surface && g.surface.differentialMotion]);
    if (!samples.has(key)) samples.set(key, differentialShape(g, settings));
    var shape = samples.get(key);
    // Age zero retains native hinting/baseline. Pending preview is explicitly
    // native; strict render entry points reject it before drawing/exporting.
    if (!shape) { drawSurfaceGlyph(ctx, g, pixelScale, L, fm, strength, color); continue; }
    ctx.save(); spectralGlyphFrame(ctx, g, pixelScale, L, fm, shape.data);
    ctx.globalAlpha = strength * (g.opacity == null ? 1 : g.opacity); ctx.fillStyle = color;
    function trace(ring) {
      var points = ring.points; ctx.moveTo(points[0].x, points[0].y);
      for (var p = 1; p < points.length; p++) ctx.lineTo(points[p].x, points[p].y); ctx.closePath();
    }
    ctx.beginPath(); shape.rings.forEach(function (ring) { if (ring.area > 0) trace(ring); });
    ctx.clip(); ctx.beginPath(); shape.rings.forEach(trace); ctx.fill('evenodd'); ctx.restore();
  }
  targetCtx.save(); targetCtx.setTransform(1, 0, 0, 1, 0, 0);
  targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height); targetCtx.restore();
}
