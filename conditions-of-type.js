(function (root) {
  'use strict';

  // Six relation operators introduced in project schema v68. The host owns
  // text layout, glyph transforms and compositing. This module keeps the
  // relationship models and deterministic Canvas renderers together so the
  // editor, Look, Project, still and video outputs all use the same result.
  var IDS = [
    'rubyUsurper', 'punctuationLoom', 'counterpage',
    'rendererDebt', 'ligatureContagion', 'strokeCommons'
  ];

  var SCHEMAS = {
    rubyUsurper: {
      options: { rubyGrammar: ['interlinear', 'branching', 'canopy'] },
      limits: { rubyDominance: [0, 1], rubyLayers: [1, 4], rubySpread: [0, 240], rubyBodyRetention: [0.08, 1], rubyThread: [0.2, 8] },
      integers: ['rubyLayers'],
      defaults: { rubyGrammar: 'canopy', rubyDominance: 0.72, rubyLayers: 2, rubySpread: 54, rubyBodyRetention: 0.28, rubyThread: 1.2 }
    },
    punctuationLoom: {
      options: { punctuationAnchors: ['pairs', 'nested', 'terminals'] },
      limits: { punctuationTension: [0, 2], punctuationSag: [-240, 240], punctuationScale: [0.25, 3], punctuationBands: [1, 7], punctuationThread: [0.2, 10] },
      integers: ['punctuationBands'],
      defaults: { punctuationAnchors: 'nested', punctuationTension: 0.86, punctuationSag: 68, punctuationScale: 1.48, punctuationBands: 3, punctuationThread: 1.4 }
    },
    counterpage: {
      options: { counterpageMode: ['counter', 'gutter', 'shared'] },
      limits: { counterpageReveal: [0, 1], counterpageLayers: [1, 5], counterpageDepth: [0, 320], counterpageShift: [-240, 240], counterpageAperture: [0, 1], counterpagePerspective: [-1.5, 1.5] },
      integers: ['counterpageLayers'],
      defaults: { counterpageMode: 'shared', counterpageReveal: 0.86, counterpageLayers: 3, counterpageDepth: 82, counterpageShift: 34, counterpageAperture: 0.42, counterpagePerspective: 0.28 }
    },
    rendererDebt: {
      options: { rendererPath: ['chain', 'drag', 'spill'] },
      limits: { rendererInertia: [0, 1.5], rendererMemory: [1, 12], rendererDrag: [0, 1], rendererPooling: [0, 1], rendererSettle: [0, 1] },
      integers: ['rendererMemory'],
      defaults: { rendererPath: 'drag', rendererInertia: 0.82, rendererMemory: 6, rendererDrag: 0.64, rendererPooling: 0.58, rendererSettle: 0.22 }
    },
    ligatureContagion: {
      options: { contagionTrait: ['bifurcate', 'curl', 'counter'] },
      limits: { contagionOrigin: [0, 1], contagionReach: [1, 12], contagionInheritance: [0, 1], contagionBridge: [0, 120], contagionRecovery: [0, 1] },
      integers: ['contagionReach'],
      defaults: { contagionTrait: 'curl', contagionOrigin: 0.12, contagionReach: 7, contagionInheritance: 0.84, contagionBridge: 38, contagionRecovery: 0.18 }
    },
    strokeCommons: {
      options: { commonsAllocation: ['focus', 'wave', 'reciprocal'] },
      limits: { commonsFocus: [0, 1], commonsBudget: [0.25, 2], commonsTransfer: [0, 1], commonsMinimum: [0.05, 0.8], commonsReach: [1, 16] },
      integers: ['commonsReach'],
      defaults: { commonsAllocation: 'focus', commonsFocus: 0.08, commonsBudget: 1, commonsTransfer: 0.82, commonsMinimum: 0.18, commonsReach: 7 }
    }
  };

  function clamp(value, min, max) {
    value = Number(value);
    return Math.max(min, Math.min(max, isFinite(value) ? value : min));
  }

  function hash(a, b, seed) {
    var value = Math.sin((Number(a) || 0) * 127.1 + (Number(b) || 0) * 311.7 + (Number(seed) || 0) * 74.7) * 43758.5453123;
    return value - Math.floor(value);
  }

  function hexRgb(value) {
    var match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value || ''));
    if (!match) return [23, 20, 15];
    var raw = match[1];
    if (raw.length === 3) raw = raw.replace(/./g, function (part) { return part + part; });
    return [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16)];
  }

  function mixColor(a, b, amount) {
    var ca = hexRgb(a), cb = hexRgb(b), t = clamp(amount, 0, 1);
    function byte(index) { return Math.round(ca[index] + (cb[index] - ca[index]) * t).toString(16).padStart(2, '0'); }
    return '#' + byte(0) + byte(1) + byte(2);
  }

  function option(env, glyphs, id, key) {
    var schema = SCHEMAS[id], fallback = schema.defaults[key], choices = schema.options[key];
    return env.choice ? env.choice(glyphs, id, key, fallback, choices) : fallback;
  }

  function number(env, glyphs, id, key) {
    var schema = SCHEMAS[id], fallback = schema.defaults[key], limits = schema.limits[key];
    var value = env.aggregate ? env.aggregate(glyphs, id, key, fallback).value : fallback;
    value = clamp(value, limits[0], limits[1]);
    return schema.integers && schema.integers.indexOf(key) !== -1 ? Math.round(value) : value;
  }

  function activeGlyphs(env, glyphs, id) {
    var out = [];
    for (var i = 0; i < glyphs.length; i++) {
      var strength = env.strength(glyphs[i], id);
      if (strength > 0.002 && (glyphs[i].opacity == null || glyphs[i].opacity > 0.002)) out.push({ glyph: glyphs[i], index: i, strength: strength });
    }
    return out;
  }

  function scratch(env, name, width, height, readFrequently) {
    return env.scratch('conditions-v68-' + name, width, height, !!readFrequently);
  }

  function pointOnGlyph(g, u, v, pixelScale, L) {
    var localX = g.x + g.w * u, localY = g.y + g.h * v;
    var rad = (g.rot || 0) * Math.PI / 180;
    var cos = Math.cos(rad), sin = Math.sin(rad);
    var tanX = Math.tan((g.skewX || 0) * Math.PI / 180);
    var tanY = Math.tan((g.skewY || 0) * Math.PI / 180);
    var a = cos * g.scaleX - sin * tanY * g.scaleX;
    var b = sin * g.scaleX + cos * tanY * g.scaleX;
    var c = cos * tanX * g.scaleY - sin * g.scaleY;
    var d = sin * tanX * g.scaleY + cos * g.scaleY;
    var lx = localX - g.ox, ly = localY - g.oy;
    return {
      x: (L.dx + (g.ox + g.tx + a * lx + c * ly) * L.s) * pixelScale,
      y: (L.dy + (g.oy + g.ty + b * lx + d * ly) * L.s) * pixelScale
    };
  }

  function glyphBounds(g, pixelScale, L) {
    var points = [pointOnGlyph(g, 0, 0, pixelScale, L), pointOnGlyph(g, 1, 0, pixelScale, L), pointOnGlyph(g, 1, 1, pixelScale, L), pointOnGlyph(g, 0, 1, pixelScale, L)];
    var xs = points.map(function (p) { return p.x; }), ys = points.map(function (p) { return p.y; });
    var x = Math.min.apply(Math, xs), y = Math.min.apply(Math, ys);
    return { x: x, y: y, w: Math.max(1, Math.max.apply(Math, xs) - x), h: Math.max(1, Math.max.apply(Math, ys) - y), points: points };
  }

  function unionBounds(items, start, end, pixelScale, L) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (var i = start; i <= end && i < items.length; i++) {
      var b = glyphBounds(items[i].glyph, pixelScale, L);
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
    }
    return isFinite(x0) ? { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) } : { x: 0, y: 0, w: 1, h: 1 };
  }

  function shiftedGlyph(g, dxPixels, dyPixels, rotation, pixelScale, L) {
    var copy = Object.assign({}, g), scale = Math.max(0.000001, pixelScale * L.s);
    copy.tx = (g.tx || 0) + dxPixels / scale;
    copy.ty = (g.ty || 0) + dyPixels / scale;
    copy.rot = (g.rot || 0) + (rotation || 0);
    return copy;
  }

  function scaledGlyph(g, scaleX, scaleY) {
    var copy = Object.assign({}, g);
    copy.scaleX = (g.scaleX == null ? 1 : g.scaleX) * scaleX;
    copy.scaleY = (g.scaleY == null ? 1 : g.scaleY) * scaleY;
    return copy;
  }

  function cleanText(value, maxLength) {
    return String(value == null ? '' : value)
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
      .replace(/[ \t]+/g, ' ')
      .trim()
      .slice(0, maxLength || 4096);
  }

  function glyphChar(item) {
    return String(item && item.glyph && (item.glyph.sourceText != null ? item.glyph.sourceText : item.glyph.ch) || '');
  }

  // Ruby text accepts `parent=reading/second note|parent=reading`. A plain
  // pipe-separated list maps one item to one glyph in source order. One plain
  // item maps to the complete active range. Nothing is synthesized when the
  // parent cannot be matched.
  function parseRubyMapping(sourceGlyphs, rubyText) {
    var source = sourceGlyphs.map(function (item) { return glyphChar(item); });
    var parts = cleanText(rubyText, 4096).split(/[|\n]+/).map(function (part) { return part.trim(); }).filter(Boolean);
    if (!parts.length || !source.length) return [];
    var mappings = [], cursor = 0, explicit = parts.some(function (part) { return /[=→]/.test(part); });
    if (!explicit && parts.length === 1) return [{ start: 0, end: source.length - 1, parent: source.join(''), readings: parts[0].split('/').filter(Boolean), matched: true, explicit: false }];
    for (var p = 0; p < parts.length; p++) {
      var token = parts[p], split = token.search(/[=→]/), parent = '', reading = token;
      if (split >= 0) { parent = token.slice(0, split).trim(); reading = token.slice(split + 1).trim(); }
      var readings = reading.split('/').map(function (value) { return value.trim(); }).filter(Boolean);
      if (!readings.length) continue;
      if (split < 0) {
        if (cursor >= source.length) break;
        mappings.push({ start: cursor, end: cursor, parent: source[cursor], readings: readings, matched: true, explicit: false });
        cursor++;
        continue;
      }
      var parentGlyphs = Array.from(parent), found = -1;
      if (parentGlyphs.length) {
        for (var at = cursor; at <= source.length - parentGlyphs.length; at++) {
          var same = true;
          for (var k = 0; k < parentGlyphs.length; k++) if (source[at + k] !== parentGlyphs[k]) { same = false; break; }
          if (same) { found = at; break; }
        }
      }
      if (found < 0) {
        mappings.push({ start: -1, end: -1, parent: parent, readings: readings, matched: false, explicit: true });
      } else {
        mappings.push({ start: found, end: found + parentGlyphs.length - 1, parent: parent, readings: readings, matched: true, explicit: true });
        cursor = found + parentGlyphs.length;
      }
    }
    return mappings;
  }

  function fitText(ctx, text, maxWidth, fontSize) {
    ctx.font = '650 ' + Math.max(3, fontSize) + 'px ui-sans-serif, system-ui, sans-serif';
    return Math.min(1, maxWidth / Math.max(1, ctx.measureText(text).width));
  }

  // Canopy reads along the page's block axis. Every strand contains one
  // complete, explicitly supplied reading; branches terminate at its parent.
  function renderRubyCanopy(ctx, active, mappings, width, height, pixelScale, L, fm, env, settings) {
    var vertical = !!env.params.vertical, whole = unionBounds(active, 0, active.length - 1, pixelScale, L);
    var d = settings.dominance, bodyScale = 1 - d * (1 - settings.retention), layouts = [], maxField = 0;
    mappings.forEach(function (map) {
      if (!map.matched) return;
      var b = unionBounds(active, map.start, map.end, pixelScale, L), inline = vertical ? b.h : b.w;
      var font = Math.max(4 * pixelScale, Math.min(b.h, b.w) * (0.08 + d * 0.035));
      var readings = map.readings.slice(0, settings.layers), longest = Math.max.apply(Math, readings.map(function (r) { return Array.from(r).length; }));
      font = Math.min(font, (vertical ? width : height) * 0.36 / Math.max(1, longest));
      var rows = longest * font * 1.04, gap = font * 1.2 + settings.spread * d * 0.12;
      var field = rows * readings.length + gap * Math.max(0, readings.length - 1);
      var strength = 0; for (var i = map.start; i <= map.end; i++) strength += active[i].strength;
      strength /= map.end - map.start + 1;
      layouts.push({ map: map, b: b, font: font, rows: rows, gap: gap, field: field, readings: readings, inline: inline, strength: strength });
      maxField = Math.max(maxField, field);
    });
    var blockStart = vertical ? whole.x : whole.y, inlineStart = vertical ? whole.y : whole.x;
    var blockEnd = blockStart + maxField + settings.spread * d * 0.6 + 14 * pixelScale;
    var limit = vertical ? whole.x + whole.w - Math.max.apply(Math, layouts.map(function (entry) { return entry.font * 2; })) - 8 * pixelScale : height - 12 * pixelScale;
    var offset = Math.min(0, limit - blockEnd - (vertical ? whole.w : whole.h) * bodyScale * 0.5);
    function position(u, v) { return vertical ? { x: blockEnd + offset - (v - blockStart), y: u } : { x: u, y: v + offset }; }
    ctx.save(); ctx.lineCap = 'butt';
    layouts.forEach(function (layout) {
      var b = layout.b, start = vertical ? b.y : b.x, center = start + layout.inline * 0.5;
      var columns = Math.max(1, Math.min(48, Math.floor(layout.inline / (layout.font * (1.7 - d * 0.35)))));
      ctx.font = '500 ' + layout.font + 'px ' + (env.params.fontFamily || 'serif');
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      layout.readings.forEach(function (reading, layer) {
        var chars = Array.from(reading), rowStart = blockStart + layer * (layout.rows + layout.gap);
        for (var col = 0; col < columns; col++) {
          var u = start + (col + 0.5) * layout.inline / columns;
          // Stagger only by the actual strand position, not random noise.
          var stagger = Math.abs((col + 0.5) / columns - 0.5) * layout.font * d * 2;
          ctx.fillStyle = layer % 2 ? settings.primary : settings.secondary; ctx.globalAlpha = layout.strength;
          for (var c = 0; c < chars.length; c++) {
            var p = position(u, rowStart + stagger + c * layout.font * 1.04);
            ctx.save(); ctx.translate(p.x, p.y); if (vertical && /^[\x00-\x7f]$/.test(chars[c])) ctx.rotate(-Math.PI * 0.5); ctx.fillText(chars[c], 0, 0); ctx.restore();
          }
          var end = position(u, rowStart + stagger + chars.length * layout.font * 1.04 + layout.font * 0.2);
          var root = position(center + (u - center) * bodyScale, blockEnd);
          ctx.globalAlpha = layout.strength * (0.18 + d * 0.25); ctx.strokeStyle = settings.secondary;
          ctx.lineWidth = Math.max(0.2 * pixelScale, settings.thread * 0.28);
          ctx.beginPath(); ctx.moveTo(end.x, end.y); ctx.lineTo(root.x, root.y); ctx.stroke();
        }
      });
    });
    active.forEach(function (item, index) {
      var layout = layouts.find(function (entry) { return index >= entry.map.start && index <= entry.map.end; });
      var b = layout ? layout.b : glyphBounds(item.glyph, pixelScale, L);
      var center = vertical ? b.y + b.h * 0.5 : b.x + b.w * 0.5;
      var original = pointOnGlyph(item.glyph, 0.5, 0.5, pixelScale, L), u = vertical ? original.y : original.x;
      var target = position(center + (u - center) * bodyScale, blockEnd + (vertical ? whole.w : whole.h) * bodyScale * 0.35);
      var body = scaledGlyph(item.glyph, bodyScale, bodyScale);
      body = shiftedGlyph(body, target.x - original.x, target.y - original.y, 0, pixelScale, L);
      env.drawGlyph(ctx, body, pixelScale, L, fm, item.strength, settings.primary);
    });
    ctx.restore();
  }

  function renderRubyUsurper(ctx, glyphs, width, height, pixelScale, L, fm, env) {
    var id = 'rubyUsurper', active = activeGlyphs(env, glyphs, id);
    if (!active.length) return;
    var grammar = option(env, glyphs, id, 'rubyGrammar');
    var dominance = number(env, glyphs, id, 'rubyDominance');
    var requestedLayers = number(env, glyphs, id, 'rubyLayers');
    var spread = number(env, glyphs, id, 'rubySpread') * pixelScale;
    var retention = number(env, glyphs, id, 'rubyBodyRetention');
    var thread = number(env, glyphs, id, 'rubyThread') * pixelScale;
    var primary = env.color(id), secondary = mixColor(primary, env.params.accent, 0.78);
    var mappings = parseRubyMapping(active, env.params.rubyText);
    if (env.rubyStatus) env.rubyStatus(mappings);
    var matched = mappings.filter(function (mapping) { return mapping.matched; });
    if (!matched.length) {
      active.forEach(function (item) { env.drawGlyph(ctx, item.glyph, pixelScale, L, fm, item.strength, primary); });
      return;
    }
    if (grammar === 'canopy' && dominance > 0.01) return renderRubyCanopy(ctx, active, mappings, width, height, pixelScale, L, fm, env, { dominance: dominance, retention: retention, layers: requestedLayers, spread: spread, thread: thread, primary: primary, secondary: secondary });
    var bodyScale = 1 - dominance * (1 - retention);
    var shiftY = 0, shiftX = 0, minimumTop = Infinity, maximumRight = -Infinity, maximumBodyRight = -Infinity;
    for (var previewIndex = 0; previewIndex < mappings.length; previewIndex++) {
      var previewMapping = mappings[previewIndex]; if (!previewMapping.matched) continue;
      var previewBounds = unionBounds(active, previewMapping.start, previewMapping.end, pixelScale, L);
      maximumBodyRight = Math.max(maximumBodyRight, previewBounds.x + previewBounds.w);
      var previewLayers = Math.min(requestedLayers, previewMapping.readings.length), occupied = 0;
      for (var previewLayer = 0; previewLayer < previewLayers; previewLayer++) {
        var previewT = (previewLayer + 1) / Math.max(1, requestedLayers);
        var previewFont = Math.max(5, Math.min(previewBounds.h * (0.16 + dominance * 0.58), 92 * pixelScale)) * (1 + previewLayer * 0.09);
        var previewRise = spread * dominance * (0.25 + previewT * 0.75) + occupied;
        var previewBaseline = previewBounds.y - previewRise;
        minimumTop = Math.min(minimumTop, previewBaseline - previewFont * 0.9);
        maximumRight = Math.max(maximumRight, previewBounds.x + previewBounds.w + previewRise + previewFont * 1.2);
        occupied += previewFont * 1.08 + thread * 2.2;
      }
    }
    if (isFinite(minimumTop) && !env.params.vertical) {
      var visibleTop = ((Number(L.dy) || 0) + 8) * pixelScale;
      shiftY = Math.max(0, visibleTop - minimumTop);
    }
    if (env.params.vertical && isFinite(maximumRight)) shiftX = Math.min(0, maximumBodyRight - maximumRight);
    for (var i = 0; i < active.length; i++) {
      var item = active[i], shrunken = scaledGlyph(item.glyph, bodyScale, bodyScale);
      if (shiftY > 0.01 || Math.abs(shiftX) > 0.01) shrunken = shiftedGlyph(shrunken, shiftX, shiftY, 0, pixelScale, L);
      env.drawGlyph(ctx, shrunken, pixelScale, L, fm, item.strength * (0.48 + retention * 0.5), primary);
    }
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var annotationBoxes = [], whole = unionBounds(active, 0, active.length - 1, pixelScale, L);
    for (var m = 0; m < mappings.length; m++) {
      var mapping = mappings[m];
      if (!mapping.matched) continue;
      var bounds = unionBounds(active, mapping.start, mapping.end, pixelScale, L);
      var parentX = bounds.x + bounds.w * 0.5, parentY = bounds.y + bounds.h * 0.18 + shiftY;
      var availableLayers = Math.min(requestedLayers, mapping.readings.length);
      var layerOccupation = 0;
      for (var layer = 0; layer < availableLayers; layer++) {
        var reading = mapping.readings[layer], layerT = (layer + 1) / Math.max(1, requestedLayers);
        var rise = spread * dominance * (0.25 + layerT * 0.75) + layerOccupation;
        var direction = grammar === 'interlinear' ? 0 : ((m % 2 ? 1 : -1) * spread * 0.18 * dominance * layerT);
        if (grammar === 'canopy') direction = (mappings.length <= 1 ? 0 : (m / (mappings.length - 1) - 0.5)) * spread * 0.9;
        var annotationX = parentX + direction;
        var annotationY = bounds.y + shiftY - rise;
        var fontSize = Math.max(5, Math.min(bounds.h * (0.16 + dominance * 0.58), 92 * pixelScale)) * (1 + layer * 0.09);
        layerOccupation += fontSize * 1.08 + thread * 2.2;
        var scale = fitText(ctx, reading, Math.max(bounds.w * (0.9 + dominance * 1.4), fontSize * (3.2 + dominance * 1.8)), fontSize);
        var textWidth = ctx.measureText(reading).width * scale;
        // Keep the actual reading inside the parent text's inline extent. Padding
        // alone cannot protect a separately cropped export from wide annotations.
        var inlineWidth = env.params.vertical ? whole.h : whole.w;
        scale *= Math.min(1, inlineWidth / Math.max(1, textWidth));
        textWidth = ctx.measureText(reading).width * scale;
        var vertical = !!env.params.vertical;
        var inlineMin = vertical ? whole.y : whole.x;
        var inlineCenter = vertical ? bounds.y + bounds.h * 0.5 + direction : annotationX;
        inlineCenter = clamp(inlineCenter, inlineMin + textWidth * 0.5, inlineMin + inlineWidth - textWidth * 0.5);
        var block = vertical ? -(bounds.x + bounds.w + rise) : annotationY;
        var box = { x: inlineCenter - textWidth * 0.5, y: block - fontSize, w: textWidth, h: fontSize * 1.15 };
        for (var pass = 0; pass <= annotationBoxes.length; pass++) {
          var collision = annotationBoxes.find(function (other) { return box.x < other.x + other.w + thread * 3 && box.x + box.w + thread * 3 > other.x && box.y < other.y + other.h + thread * 3 && box.y + box.h + thread * 3 > other.y; });
          if (!collision) break;
          box.y = collision.y - box.h - thread * 3;
        }
        annotationBoxes.push(box); block = box.y + fontSize;
        annotationX = vertical ? -block : inlineCenter;
        annotationY = vertical ? inlineCenter : block;
        if (vertical) { parentX = bounds.x + bounds.w * 0.8; parentY = bounds.y + bounds.h * 0.5 + shiftY; }
        annotationX += shiftX; if (vertical) parentX += shiftX;
        ctx.strokeStyle = layer % 2 ? primary : secondary; ctx.lineWidth = Math.max(0.35, thread * (1 - layer * 0.1)); ctx.globalAlpha = 0.5 + dominance * 0.5;
        ctx.beginPath(); ctx.moveTo(parentX, parentY);
        if (vertical) ctx.bezierCurveTo(parentX + rise * 0.4, parentY, annotationX - fontSize * 0.3, annotationY, annotationX, annotationY);
        else if (grammar === 'branching') ctx.bezierCurveTo(parentX, parentY - rise * 0.28, annotationX - direction * 0.28, annotationY + fontSize * 0.75, annotationX, annotationY + fontSize * 0.25);
        else if (grammar === 'canopy') ctx.bezierCurveTo(parentX + direction * 0.12, parentY - rise * 0.42, annotationX, annotationY + fontSize, annotationX, annotationY + fontSize * 0.25);
        else ctx.lineTo(annotationX, annotationY + fontSize * 0.22);
        ctx.stroke();
        ctx.fillStyle = layer % 2 ? primary : secondary; ctx.globalAlpha = 0.82 + dominance * 0.18;
        ctx.save(); ctx.translate(annotationX, annotationY);
        if (vertical && /[^\x00-\x7f]/.test(reading)) {
          var readingChars = Array.from(reading), pitch = fontSize * scale;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          for (var rc = 0; rc < readingChars.length; rc++) ctx.fillText(readingChars[rc], fontSize * 0.42, (rc - (readingChars.length - 1) * 0.5) * pitch);
        } else {
          if (vertical) ctx.rotate(Math.PI * 0.5); ctx.scale(scale, 1); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(reading, 0, 0);
        }
        ctx.restore();
        ctx.beginPath(); ctx.arc(parentX, parentY, Math.max(1, thread * 1.35), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  var OPEN_TO_CLOSE = {
    '(': ')', '[': ']', '{': '}', '（': '）', '［': '］', '｛': '｝',
    '「': '」', '『': '』', '【': '】', '〈': '〉', '《': '》', '〔': '〕', '〖': '〗'
  };

  function pairPunctuation(chars) {
    var stack = [], pairs = [], unmatched = [];
    for (var i = 0; i < chars.length; i++) {
      var ch = String(chars[i] == null ? '' : chars[i]);
      if (OPEN_TO_CLOSE[ch]) { stack.push({ index: i, char: ch, depth: stack.length }); continue; }
      var top = stack.length ? stack[stack.length - 1] : null;
      if (top && OPEN_TO_CLOSE[top.char] === ch) {
        var opening = stack.pop();
        pairs.push({ open: opening.index, close: i, depth: opening.depth, openChar: opening.char, closeChar: ch });
      } else if (Object.keys(OPEN_TO_CLOSE).some(function (key) { return OPEN_TO_CLOSE[key] === ch; })) unmatched.push(i);
    }
    while (stack.length) unmatched.push(stack.pop().index);
    pairs.sort(function (a, b) { return a.open - b.open || b.close - a.close; });
    unmatched.sort(function (a, b) { return a - b; });
    return { pairs: pairs, unmatched: unmatched };
  }

  function quadraticPoint(a, control, b, t) {
    var u = 1 - t;
    return { x: u * u * a.x + 2 * u * t * control.x + t * t * b.x, y: u * u * a.y + 2 * u * t * control.y + t * t * b.y };
  }

  function renderPunctuationLoom(ctx, glyphs, width, height, pixelScale, L, fm, env) {
    var id = 'punctuationLoom', active = activeGlyphs(env, glyphs, id);
    if (!active.length) return;
    var mode = option(env, glyphs, id, 'punctuationAnchors');
    var tension = number(env, glyphs, id, 'punctuationTension');
    var sag = number(env, glyphs, id, 'punctuationSag') * pixelScale;
    var anchorScale = number(env, glyphs, id, 'punctuationScale');
    var bands = number(env, glyphs, id, 'punctuationBands');
    var thread = number(env, glyphs, id, 'punctuationThread') * pixelScale;
    var primary = env.color(id), secondary = mixColor(primary, env.params.accent, 0.7);
    var structure = pairPunctuation(active.map(glyphChar));
    var assignments = new Array(active.length);
    for (var p = 0; p < structure.pairs.length; p++) {
      var pair = structure.pairs[p];
      for (var a = pair.open + 1; a < pair.close; a++) {
        if (!assignments[a] || pair.close - pair.open < assignments[a].close - assignments[a].open) assignments[a] = pair;
      }
    }
    var anchors = new Set();
    var loomBounds = unionBounds(active, 0, active.length - 1, pixelScale, L);
    structure.pairs.forEach(function (pair) { anchors.add(pair.open); anchors.add(pair.close); });
    ctx.save(); ctx.lineCap = 'butt';
    for (var q = 0; q < structure.pairs.length; q++) {
      var pair = structure.pairs[q], lb = glyphBounds(active[pair.open].glyph, pixelScale, L), rb = glyphBounds(active[pair.close].glyph, pixelScale, L);
      var members = []; for (var k = pair.open + 1; k < pair.close; k++) if (!anchors.has(k) && (mode === 'pairs' || assignments[k] === pair)) members.push(k);
      if (!members.length) continue;
      var vertical = !!env.params.vertical, h = Math.min(lb.h, rb.h), fontScale = Math.min(0.24, 0.075 + thread / Math.max(1, h) * 2);
      var rows = bands * 2 + 1, repetitions = Math.max(1, Math.min(14, Math.floor((vertical ? Math.abs(rb.y - lb.y) : Math.abs(rb.x - lb.x)) / Math.max(1, h * fontScale * members.length * 0.65))));
      for (var row = 0; row < rows; row++) {
        var phase = rows === 1 ? 0 : row / (rows - 1) * 2 - 1, depth = mode === 'nested' ? 1 / (1 + pair.depth * 0.55) : 1;
        var start = { x: lb.x + lb.w * 0.5, y: lb.y + lb.h * (0.5 + phase * 0.32 * anchorScale) };
        var end = { x: rb.x + rb.w * 0.5, y: rb.y + rb.h * (0.5 - phase * 0.32 * anchorScale) };
        if (vertical) { start = { x: lb.x + lb.w * (0.5 + phase * 0.32 * anchorScale), y: lb.y + lb.h * 0.5 }; end = { x: rb.x + rb.w * (0.5 - phase * 0.32 * anchorScale), y: rb.y + rb.h * 0.5 }; }
        var control = { x: (start.x + end.x) * 0.5, y: (start.y + end.y) * 0.5 };
        control[vertical ? 'x' : 'y'] += (vertical ? -sag : sag) * depth * (1.4 - tension * 0.5) * (0.35 + Math.abs(phase) * 0.65);
        if (vertical) {
          var safeRight = loomBounds.x + loomBounds.w - h * fontScale - 4 * pixelScale;
          start.x = Math.min(start.x, safeRight); end.x = Math.min(end.x, safeRight); control.x = Math.min(control.x, safeRight);
        }
        var count = members.length * repetitions;
        for (var at = 0; at < count; at++) {
          var member = active[members[at % members.length]], t = (at + 0.5) / count;
          var target = quadraticPoint(start, control, end, t), before = quadraticPoint(start, control, end, Math.max(0, t - 0.01)), after = quadraticPoint(start, control, end, Math.min(1, t + 0.01));
          var angle = Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI - (vertical ? 90 : 0);
          var original = pointOnGlyph(member.glyph, 0.5, 0.5, pixelScale, L);
          var moved = shiftedGlyph(scaledGlyph(member.glyph, fontScale, fontScale), target.x - original.x, target.y - original.y, angle, pixelScale, L);
          env.drawGlyph(ctx, moved, pixelScale, L, fm, member.strength * 0.92, row % 2 ? primary : secondary);
        }
      }
    }
    active.forEach(function (item, i) {
      if (anchors.has(i)) env.drawGlyph(ctx, scaledGlyph(item.glyph, anchorScale, anchorScale), pixelScale, L, fm, item.strength, secondary);
      else if (!assignments[i]) {
        var terminal = mode === 'terminals' && (structure.unmatched.indexOf(i) >= 0 || /[,、，.。．!?！？]/.test(glyphChar(item)));
        env.drawGlyph(ctx, terminal ? scaledGlyph(item.glyph, anchorScale, anchorScale) : item.glyph, pixelScale, L, fm, item.strength, primary);
      }
    });
    ctx.restore();
  }

  function readMask(mask) {
    try { return mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, mask.width, mask.height); }
    catch (error) { return null; }
  }

  // Returns an RGBA mask of transparent pixels enclosed by glyph ink. The
  // flood fill is exact at the renderer raster and capped by the host's 2.4 MP
  // surface budget.
  function enclosedVoidMask(image, width, height, threshold) {
    var data = image && image.data ? image.data : image;
    if (!data || !width || !height) return new Uint8ClampedArray(0);
    var size = width * height, outside = new Uint8Array(size), queue = new Int32Array(size), head = 0, tail = 0;
    threshold = threshold == null ? 24 : threshold;
    function blank(at) { return (data[at * 4 + 3] || 0) <= threshold; }
    function push(at) {
      if (at < 0 || at >= size || outside[at] || !blank(at)) return;
      outside[at] = 1; queue[tail++] = at;
    }
    for (var x = 0; x < width; x++) { push(x); push((height - 1) * width + x); }
    for (var y = 0; y < height; y++) { push(y * width); push(y * width + width - 1); }
    while (head < tail) {
      var at = queue[head++], px = at % width;
      if (px > 0) push(at - 1); if (px + 1 < width) push(at + 1);
      if (at >= width) push(at - width); if (at + width < size) push(at + width);
    }
    var out = new Uint8ClampedArray(size * 4);
    for (var i = 0; i < size; i++) if (blank(i) && !outside[i]) out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = out[i * 4 + 3] = 255;
    return out;
  }

  function addGutterOpenings(c, active, aperture, pixelScale, L, vertical) {
    c.save(); c.fillStyle = '#fff';
    for (var i = 1; i < active.length; i++) {
      var previous = active[i - 1].glyph, current = active[i].glyph;
      if ((previous.line || 0) !== (current.line || 0)) continue;
      var left = glyphBounds(previous, pixelScale, L), right = glyphBounds(current, pixelScale, L);
      var gap = right.x - (left.x + left.w), centerX = (left.x + left.w + right.x) * 0.5;
      var centerY = (left.y + left.h * 0.5 + right.y + right.h * 0.5) * 0.5;
      var radiusX = Math.max(1.5, Math.abs(gap) * 0.5 + aperture * Math.min(left.w, right.w) * 0.16);
      var radiusY = Math.max(2, Math.min(left.h, right.h) * (0.14 + aperture * 0.24));
      if (vertical) {
        gap = right.y - (left.y + left.h); centerY = (left.y + left.h + right.y) * 0.5;
        centerX = (left.x + left.w * 0.5 + right.x + right.w * 0.5) * 0.5;
        radiusY = Math.max(1.5, Math.abs(gap) * 0.5 + aperture * Math.min(left.h, right.h) * 0.16);
        radiusX = Math.max(2, Math.min(left.w, right.w) * (0.14 + aperture * 0.24));
      }
      c.beginPath(); c.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }

  function renderCounterpage(ctx, glyphs, width, height, pixelScale, L, fm, env) {
    var id = 'counterpage', active = activeGlyphs(env, glyphs, id); if (!active.length) return;
    var mode = option(env, glyphs, id, 'counterpageMode'), reveal = number(env, glyphs, id, 'counterpageReveal');
    var layers = number(env, glyphs, id, 'counterpageLayers'), depth = number(env, glyphs, id, 'counterpageDepth') * pixelScale;
    var shift = number(env, glyphs, id, 'counterpageShift') * pixelScale, aperture = number(env, glyphs, id, 'counterpageAperture');
    var perspective = number(env, glyphs, id, 'counterpagePerspective'), primary = env.color(id), paper = env.params.paper;
    var mask = env.buildMask(glyphs, id, width, height, pixelScale, L, fm), image = readMask(mask); if (!image) return;
    var b = unionBounds(active, 0, active.length - 1, pixelScale, L), opening = scratch(env, 'counterpage-openings', width, height, false);
    if (mode !== 'gutter') { var voids = enclosedVoidMask(image, width, height, 24), im = opening.ctx.createImageData(width, height); im.data.set(voids); opening.ctx.putImageData(im, 0, 0); }
    if (mode !== 'counter') addGutterOpenings(opening.ctx, active, aperture, pixelScale, L, env.params.vertical);
    var expanded = scratch(env, 'counterpage-expanded-openings', width, height, false), radius = aperture * Math.min(b.h, b.w) * 0.11;
    // Hard edged apertures remain cut surfaces at every export resolution.
    expanded.ctx.drawImage(opening.canvas, 0, 0);
    for (var n = 0; n < 16 && radius > 0.1; n++) expanded.ctx.drawImage(opening.canvas, Math.cos(n * Math.PI / 8) * radius, Math.sin(n * Math.PI / 8) * radius);
    var face = scratch(env, 'counterpage-face', width, height, false), pages = composeCounterpages(env.params.counterpageText, layers);
    var page = scratch(env, 'counterpage-type-plane', width, height, false);
    for (var layer = layers - 1; layer >= 0; layer--) {
      var t = layers === 1 ? 0 : layer / (layers - 1), dx = shift * t, dy = depth * t * 0.34, scale = Math.max(0.65, 1 - perspective * t * 0.12);
      var fc = face.ctx; fc.clearRect(0, 0, width, height); fc.globalCompositeOperation = 'source-over'; fc.drawImage(mask, 0, 0);
      fc.globalCompositeOperation = 'destination-out'; fc.drawImage(expanded.canvas, 0, 0);
      fc.globalCompositeOperation = 'source-in'; fc.fillStyle = mixColor(primary, paper, layer === 0 ? 0.84 : 0.62 + t * 0.17); fc.fillRect(0, 0, width, height); fc.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.translate(b.x + dx, b.y + dy); ctx.transform(scale, 0, perspective * t * 0.08, 1, -b.x, -b.y);
      ctx.save(); ctx.globalAlpha = 0.16; ctx.drawImage(face.canvas, pixelScale * 1.4, pixelScale * 1.8); ctx.restore(); ctx.drawImage(face.canvas, 0, 0);
      if (pages[layer]) {
        var pc = page.ctx; pc.clearRect(0, 0, width, height); pc.globalCompositeOperation = 'source-over';
        var font = Math.max(7 * pixelScale, b.h * 0.22);
        pc.font = '600 ' + font + 'px ' + (env.params.fontFamily || 'serif'); pc.textBaseline = 'middle'; pc.textAlign = 'left';
        var lines = wrapPageText(pages[layer], function (s) { return pc.measureText(s).width; }, b.w * 0.96);
        pc.fillStyle = layer % 2 ? mixColor(primary, env.params.accent, 0.8) : primary;
        for (var row = 0; row < lines.length; row++) pc.fillText(lines[row], b.x + b.w * 0.02, b.y + b.h * (0.18 + t * 0.46) + row * font * 1.08);
        pc.globalCompositeOperation = 'destination-in'; pc.drawImage(expanded.canvas, 0, 0); pc.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = reveal; ctx.drawImage(page.canvas, 0, 0);
      }
      ctx.restore();
    }
  }

  function composeCounterpages(text, count) {
    var pages = cleanText(text, 8192).split(/\n\s*---\s*\n/).filter(Boolean);
    if (pages.length > 1) return pages.slice(0, count);
    // With one manuscript, paginate contiguous source ranges without repetition.
    var tokens = String(pages[0] || '').match(/\S+\s*|\s+/g) || [];
    if (tokens.length < count) tokens = Array.from(String(pages[0] || ''));
    var result = [], perPage = Math.max(1, Math.ceil(tokens.length / count));
    for (var at = 0; at < tokens.length; at += perPage) result.push(tokens.slice(at, at + perPage).join(''));
    return result;
  }

  function wrapPageText(text, measure, width) {
    var lines = [];
    String(text).split('\n').forEach(function (paragraph) {
      var line = '';
      Array.from(paragraph).forEach(function (char) {
        if (line && measure(line + char) > width) { lines.push(line); line = ''; }
        line += char;
      });
      lines.push(line);
    });
    return lines;
  }

  var skeletonCache = new Map();
  function skeletonStrokes(rgba, width, height) {
    var signature = 2166136261;
    for (var byte = 3; byte < rgba.length; byte += 4) signature = Math.imul(signature ^ rgba[byte], 16777619);
    var cacheKey = width + ':' + height + ':' + (signature >>> 0);
    if (skeletonCache.has(cacheKey)) return skeletonCache.get(cacheKey);
    var ink = new Uint8Array(width * height), removed = [];
    for (var i = 0; i < ink.length; i++) ink[i] = rgba[i * 4 + 3] > 70 ? 1 : 0;
    // Zhang-Suen thinning preserves stroke junctions and disconnected components.
    for (var iteration = 0; iteration < 48; iteration++) {
      var changed = 0;
      for (var phase = 0; phase < 2; phase++) {
        removed.length = 0;
        for (var y = 1; y < height - 1; y++) for (var x = 1; x < width - 1; x++) {
          var at = y * width + x; if (!ink[at]) continue;
          var n = [ink[at-width],ink[at-width+1],ink[at+1],ink[at+width+1],ink[at+width],ink[at+width-1],ink[at-1],ink[at-width-1]];
          var sum = 0, transitions = 0;
          for (var k = 0; k < 8; k++) { sum += n[k]; if (!n[k] && n[(k+1)%8]) transitions++; }
          if (sum < 2 || sum > 6 || transitions !== 1) continue;
          if (phase === 0 ? n[0]*n[2]*n[4] || n[2]*n[4]*n[6] : n[0]*n[2]*n[6] || n[0]*n[4]*n[6]) continue;
          removed.push(at);
        }
        for (var r = 0; r < removed.length; r++) ink[removed[r]] = 0;
        changed += removed.length;
      }
      if (!changed) break;
    }
    function neighbors(at) {
      var x = at % width, y = Math.floor(at / width), list = [];
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var nx = x + dx, ny = y + dy, next = ny * width + nx;
        if ((dx || dy) && nx >= 0 && nx < width && ny >= 0 && ny < height && ink[next]) list.push(next);
      }
      return list;
    }
    var visited = new Uint8Array(ink.length), strokes = [];
    for (var start = 0; start < ink.length; start++) {
      if (!ink[start] || visited[start]) continue;
      var stack = [{ at: start, from: -1 }];
      while (stack.length) {
        var node = stack.pop(); if (visited[node.at]) continue;
        var path = [], at = node.at, from = node.from;
        if (from >= 0) path.push({ x: from % width, y: Math.floor(from / width) });
        while (!visited[at]) {
          visited[at] = 1; path.push({ x: at % width, y: Math.floor(at / width) });
          var next = neighbors(at).filter(function (candidate) { return !visited[candidate]; });
          if (!next.length) break;
          for (var branch = 1; branch < next.length; branch++) stack.push({ at: next[branch], from: at });
          at = next[0];
        }
        if (path.length) strokes.push(path);
      }
    }
    if (skeletonCache.size >= 96) skeletonCache.delete(skeletonCache.keys().next().value);
    skeletonCache.set(cacheKey, strokes);
    return strokes;
  }

  function contourStrokes(rgba, w, h) {
    var edges = new Map();
    function ink(x, y) { return x >= 0 && x < w && y >= 0 && y < h && rgba[(y * w + x) * 4 + 3] > 90; }
    function add(x, y, a, b) { var key = x + ',' + y, list = edges.get(key) || []; list.push([a, b]); edges.set(key, list); }
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) if (ink(x, y)) {
      if (!ink(x, y - 1)) add(x, y, x + 1, y); if (!ink(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!ink(x, y + 1)) add(x + 1, y + 1, x, y + 1); if (!ink(x - 1, y)) add(x, y + 1, x, y);
    }
    var paths = [];
    while (edges.size) {
      var first = edges.keys().next().value, at = first, points = [];
      for (var limit = 0; limit < w * h * 4; limit++) {
        var xy = at.split(',').map(Number); points.push({ x: xy[0], y: xy[1] });
        var choices = edges.get(at); if (!choices) break;
        var next = choices.pop(); if (!choices.length) edges.delete(at); at = next.join(','); if (at === first) break;
      }
      if (points.length > 8) paths.push(points.map(function (p, i) {
        var a = points[(i + points.length - 2) % points.length], b = points[(i + 2) % points.length];
        return { x: (a.x + p.x * 2 + b.x) / 4, y: (a.y + p.y * 2 + b.y) / 4 };
      }));
    }
    return paths;
  }

  function renderRendererDebt(ctx, glyphs, width, height, pixelScale, L, fm, env) {
    var id = 'rendererDebt', active = activeGlyphs(env, glyphs, id); if (!active.length) return;
    var inertia = number(env, glyphs, id, 'rendererInertia'), memory = number(env, glyphs, id, 'rendererMemory');
    var drag = number(env, glyphs, id, 'rendererDrag'), pooling = number(env, glyphs, id, 'rendererPooling'), settle = number(env, glyphs, id, 'rendererSettle');
    var mode = option(env, glyphs, id, 'rendererPath'), primary = env.color(id), accent = mixColor(primary, env.params.accent, 0.68);
    var probe = scratch(env, 'debt-stroke-probe', width, height, false);
    var head = null, vx = 0, vy = 0, residual = 0, previousLine = null, audit = [];
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (var i = 0; i < active.length; i++) {
      var item = active[i], b = glyphBounds(item.glyph, pixelScale, L), line = item.glyph.line || 0;
      if (previousLine !== null && line !== previousLine) {
        vx *= 1 - settle; vy *= 1 - settle; residual *= 1 - settle;
        if (settle === 1) { head = null; vx = 0; vy = 0; residual = 0; }
      }
      probe.ctx.clearRect(0, 0, width, height); env.drawGlyph(probe.ctx, item.glyph, pixelScale, L, fm, 1, '#fff');
      var sampleScale = Math.min(1, 88 / Math.max(b.w, b.h));
      var sw = Math.max(4, Math.ceil(b.w * sampleScale) + 4), sh = Math.max(4, Math.ceil(b.h * sampleScale) + 4);
      var sample = scratch(env, 'debt-skeleton', sw, sh, true);
      sample.ctx.drawImage(probe.canvas, b.x, b.y, b.w, b.h, 2, 2, sw - 4, sh - 4);
      var contours = contourStrokes(sample.ctx.getImageData(0, 0, sw, sh).data, sw, sh), strokes = [];
      // Each pass retains curvature debt. Corners displace later paths more
      // than straight runs, and the path gradually pays that displacement back.
      for (var pass = 0; pass < memory; pass++) contours.forEach(function (contour) {
        var debt = 0, warped = contour.map(function (point, p) {
          var a = contour[(p + contour.length - 3) % contour.length], z = contour[(p + 3) % contour.length];
          var ux = point.x - a.x, uy = point.y - a.y, wx = z.x - point.x, wy = z.y - point.y;
          var turn = Math.atan2(ux * wy - uy * wx, ux * wx + uy * wy);
          debt = debt * (0.86 + inertia * 0.065) + turn * inertia;
          var tangentX = z.x - a.x, tangentY = z.y - a.y, norm = Math.max(0.1, Math.hypot(tangentX, tangentY));
          var displacement = pass * (0.36 + pooling * 0.34) + Math.max(-5, Math.min(5, debt)) * pass * 0.45;
          return { x: point.x - tangentY / norm * displacement, y: point.y + tangentX / norm * displacement };
        });
        warped.push(warped[0]); strokes.push(warped);
      });
      audit.push({ glyph: glyphChar(item), strokes: strokes.length, incoming: { vx: vx, vy: vy, residual: residual } });
      env.drawGlyph(ctx, item.glyph, pixelScale, L, fm, item.strength * 0.035, primary);
      for (var s = 0; s < strokes.length; s++) for (var p = 0; p < strokes[s].length; p++) {
        var point = strokes[s][p], target = { x: b.x + (point.x - 2) / Math.max(1, sw - 4) * b.w, y: b.y + (point.y - 2) / Math.max(1, sh - 4) * b.h };
        if (!head) head = { x: target.x, y: target.y };
        var steps = p === 0 ? 8 : 2;
        for (var step = 0; step < steps; step++) {
          var dx = target.x - head.x, dy = target.y - head.y;
          var damping = Math.min(0.87, 0.2 + inertia * 0.4 + memory * 0.01 - (mode === 'chain' ? 0.12 : 0));
          var pursuit = mode === 'spill' ? 0.2 : (mode === 'chain' ? 0.36 : 0.28);
          vx = vx * damping + dx * pursuit;
          vy = vy * damping + dy * pursuit;
          var speed = Math.hypot(vx, vy), cap = Math.max(2, Math.min(b.w, b.h) * 0.26);
          if (speed > cap) { vx *= cap / speed; vy *= cap / speed; speed = cap; }
          var next = { x: head.x + vx, y: head.y + vy };
          residual = residual * Math.exp(-1 / (memory * 8)) + pooling / (1 + speed * 0.2);
          var contact = p === 0 ? drag : 1;
          ctx.globalAlpha = item.strength * contact * (p === 0 ? 0.28 : 0.68);
          ctx.strokeStyle = mode === 'chain' ? primary : (s % 3 === 1 ? accent : primary);
          ctx.lineWidth = Math.max(pixelScale * 0.28, Math.min(b.w, b.h) * (0.002 + pooling * Math.min(0.004, residual * 0.00015))) * (p === 0 ? 0.38 : 1);
          ctx.beginPath(); ctx.moveTo(head.x, head.y); ctx.lineTo(next.x, next.y); ctx.stroke();
          head = next;
        }
      }
      previousLine = line;
    }
    ctx.restore(); root.TypeDeformerConditionsOperators.lastDebtAudit = audit;
  }

  function contagionGraph(items, origin, reach, inheritance, bridge, recovery) {
    var count = items.length, result = new Array(count), edges = [];
    if (!count) return { nodes: [], edges: [] };
    var originIndex = Math.max(0, Math.min(count - 1, Math.round(clamp(origin, 0, 1) * (count - 1))));
    var adjacency = new Array(count); for (var a = 0; a < count; a++) adjacency[a] = [];
    for (var i = 1; i < count; i++) {
      var left = items[i - 1], right = items[i], sameLine = Number(left.line || 0) === Number(right.line || 0);
      if (left.sourceIndex != null && right.sourceIndex != null && right.sourceIndex !== left.sourceIndex + 1) continue;
      var gapX = Math.max(0, Number(right.x || 0) - (Number(left.x || 0) + Number(left.w || 0)), Number(left.x || 0) - (Number(right.x || 0) + Number(right.w || 0)));
      var gapY = Math.max(0, Number(right.y || 0) - (Number(left.y || 0) + Number(left.h || 0)), Number(left.y || 0) - (Number(right.y || 0) + Number(right.h || 0)));
      var gap = Math.hypot(gapX, gapY);
      if (sameLine && gap <= bridge) { adjacency[i - 1].push(i); adjacency[i].push(i - 1); }
    }
    var queue = [originIndex]; result[originIndex] = { generation: 0, parent: -1, level: 1 };
    while (queue.length) {
      var current = queue.shift(), node = result[current];
      if (node.generation >= reach) continue;
      for (var n = 0; n < adjacency[current].length; n++) {
        var next = adjacency[current][n]; if (result[next]) continue;
        var generation = node.generation + 1;
        var level = Math.pow(clamp(inheritance, 0, 1), generation) * Math.max(0, 1 - clamp(recovery, 0, 1) * generation / Math.max(1, reach));
        result[next] = { generation: generation, parent: current, level: level }; edges.push({ from: current, to: next, generation: generation, level: level }); queue.push(next);
      }
    }
    return { nodes: result, edges: edges, origin: originIndex };
  }

  function drawCurl(ctx, x, y, radius, turns) {
    ctx.beginPath();
    for (var i = 0; i <= 28; i++) {
      var t = i / 28, angle = t * Math.PI * 2 * turns, r = radius * (1 - t * 0.78), px = x + Math.cos(angle) * r, py = y + Math.sin(angle) * r;
      if (!i) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  function renderLigatureContagion(ctx, glyphs, width, height, pixelScale, L, fm, env) {
    var id = 'ligatureContagion', active = activeGlyphs(env, glyphs, id); if (!active.length) return;
    var trait = option(env, glyphs, id, 'contagionTrait'), origin = number(env, glyphs, id, 'contagionOrigin');
    var reach = number(env, glyphs, id, 'contagionReach'), inheritance = number(env, glyphs, id, 'contagionInheritance');
    var bridge = number(env, glyphs, id, 'contagionBridge') * pixelScale, recovery = number(env, glyphs, id, 'contagionRecovery');
    var descriptors = active.map(function (item) { return Object.assign(glyphBounds(item.glyph, pixelScale, L), { line: item.glyph.line || 0, sourceIndex: item.index }); });
    var graph = contagionGraph(descriptors, origin, reach, inheritance, bridge, recovery);
    var tissue = scratch(env, 'contagion-tissue-raster', width, height, true), probe = scratch(env, 'contagion-attachment', width, height, true), c = tissue.ctx, anchors = [];
    active.forEach(function (item, n) {
      env.drawGlyph(c, item.glyph, pixelScale, L, fm, item.strength, '#fff');
      probe.ctx.clearRect(0, 0, width, height); env.drawGlyph(probe.ctx, item.glyph, pixelScale, L, fm, 1, '#fff');
      var b = descriptors[n], x = Math.max(0, Math.floor(b.x)), y = Math.max(0, Math.floor(b.y));
      var w = Math.min(width - x, Math.ceil(b.w)), h = Math.min(height - y, Math.ceil(b.h));
      var left = { x: b.x, y: b.y + b.h * 0.4 }, right = { x: b.x + b.w, y: b.y + b.h * 0.4 };
      if (w > 0 && h > 0) {
        var data = probe.ctx.getImageData(x, y, w, h).data, bestL = Infinity, bestR = Infinity;
        for (var py = 0; py < h; py++) for (var px = 0; px < w; px++) if (data[(py * w + px) * 4 + 3] > 160) {
          var penalty = Math.abs(py - h * 0.4) * 2.5;
          if (px + penalty < bestL) { bestL = px + penalty; left = { x: x + px, y: y + py }; }
          if (w - px + penalty < bestR) { bestR = w - px + penalty; right = { x: x + px, y: y + py }; }
        }
      }
      anchors.push({ left: left, right: right });
    });
    c.fillStyle = '#fff'; c.strokeStyle = '#fff'; c.lineCap = 'round';
    graph.edges.forEach(function (edge) {
      var a = descriptors[edge.from], b = descriptors[edge.to], forward = b.x > a.x;
      var p = anchors[edge.from][forward ? 'right' : 'left'], q = anchors[edge.to][forward ? 'left' : 'right'];
      var level = edge.level * Math.min(active[edge.from].strength, active[edge.to].strength); if (level < 0.002) return;
      var h = Math.min(a.h, b.h), t = h * (0.035 + level * 0.075), middle = (p.x + q.x) * 0.5;
      c.globalAlpha = level;
      c.beginPath(); c.moveTo(p.x, p.y - t);
      c.bezierCurveTo(middle, p.y - t, middle, q.y - t * 0.6, q.x, q.y - t * 0.6);
      c.lineTo(q.x, q.y + t);
      c.bezierCurveTo(middle, q.y + t, middle, p.y + t * 0.6, p.x, p.y + t * 0.6); c.closePath(); c.fill();
      c.save(); c.globalCompositeOperation = 'destination-out'; c.globalAlpha = level; c.lineWidth = Math.max(pixelScale, t * 0.24);
      if (trait === 'counter') {
        c.beginPath(); c.moveTo(p.x - t * 0.6, p.y);
        c.bezierCurveTo(middle, p.y - t * 0.6, middle, q.y - t * 0.6, q.x + t * 0.6, q.y);
        c.bezierCurveTo(middle, q.y + t * 0.5, middle, p.y + t * 0.5, p.x - t * 0.6, p.y); c.fill();
      } else if (trait === 'bifurcate') {
        c.beginPath(); c.moveTo(middle, (p.y + q.y) * 0.5 + t); c.lineTo(middle - t * 0.35, (p.y + q.y) * 0.5);
        c.lineTo(middle + t * 1.4, (p.y + q.y) * 0.5 - t * 1.5); c.stroke();
      } else drawCurl(c, q.x, q.y, t * 0.9, 1.2);
      c.restore();
    });
    // The origin bears the same incision even when propagation is stopped.
    graph.nodes.forEach(function (node, n) {
      if (!node || node.level < 0.002) return;
      var p = anchors[n].right, b = descriptors[n], radius = Math.min(b.w, b.h) * 0.12 * node.level;
      c.save(); c.globalCompositeOperation = 'destination-out'; c.globalAlpha = active[n].strength;
      c.lineWidth = Math.max(pixelScale * 0.5, radius * 0.16);
      if (trait === 'curl') drawCurl(c, p.x - radius * 0.7, p.y, radius, 1.15);
      else { c.beginPath(); c.moveTo(p.x, p.y - radius); c.lineTo(p.x - radius, p.y + radius * 0.5); c.stroke(); }
      c.restore();
    });
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-in'; c.fillStyle = env.color(id); c.fillRect(0, 0, width, height);
    c.globalCompositeOperation = 'source-over'; ctx.drawImage(tissue.canvas, 0, 0);
  }

  function allocateCommons(masses, focus, budget, minimum, reach, mode, transfer) {
    masses = masses.map(function (value) { value = Number(value); return isFinite(value) && value > 0 ? value : 0; });
    var count = masses.length, total = masses.reduce(function (sum, value) { return sum + value; }, 0);
    if (!count || total <= 0) return { allocations: masses.slice(), totalSource: total, totalAllocated: total, focus: 0 };
    var focusIndex = Math.max(0, Math.min(count - 1, Math.round(clamp(focus, 0, 1) * (count - 1))));
    budget = clamp(budget, 0.25, 2); minimum = clamp(minimum, 0.05, 0.8); reach = Math.max(1, Number(reach) || 1); transfer = clamp(transfer == null ? 1 : transfer, 0, 1);
    var target = total * budget, allocations = masses.map(function (mass) { return mass * budget; });
    var scope = [], outsideTotal = 0;
    for (var s = 0; s < count; s++) {
      if (Math.abs(s - focusIndex) <= reach) scope.push(s); else outsideTotal += allocations[s];
    }
    var available = Math.max(0, target - outsideTotal), bases = [], baseTotal = 0;
    for (var b = 0; b < scope.length; b++) { var floor = masses[scope[b]] * minimum; bases.push(floor); baseTotal += floor; }
    if (baseTotal > available) { var shrink = available / Math.max(1e-12, baseTotal); bases = bases.map(function (value) { return value * shrink; }); baseTotal = available; }
    var neutralTotal = scope.reduce(function (sum, index) { return sum + masses[index] * budget; }, 0);
    var desired = [], desiredTotal = 0;
    for (var d = 0; d < scope.length; d++) {
      var index = scope[d], distance = Math.abs(index - focusIndex), local;
      if (mode === 'wave') local = Math.pow(0.5 + 0.5 * Math.cos(Math.PI * distance / Math.max(1, reach + 1)), 2) + 0.04;
      else if (mode === 'reciprocal') local = 1 / Math.pow(1 + distance, 2);
      else local = index === focusIndex ? 1 : 0;
      desired.push(local); desiredTotal += local;
    }
    if (desiredTotal <= 0) { desired[scope.indexOf(focusIndex)] = 1; desiredTotal = 1; }
    var weights = [], weightTotal = 0;
    for (var w = 0; w < scope.length; w++) {
      var neutralShare = masses[scope[w]] * budget / Math.max(1e-12, neutralTotal);
      var desiredShare = desired[w] / desiredTotal;
      var weighted = neutralShare * (1 - transfer) + desiredShare * transfer;
      weights.push(weighted); weightTotal += weighted;
    }
    var remainder = Math.max(0, available - baseTotal);
    for (var a = 0; a < scope.length; a++) allocations[scope[a]] = bases[a] + remainder * weights[a] / Math.max(1e-12, weightTotal);
    var allocated = allocations.reduce(function (sum, value) { return sum + value; }, 0), correction = target - allocated;
    allocations[focusIndex] += correction;
    return { allocations: allocations, totalSource: total, totalAllocated: target, focus: focusIndex };
  }

  function measureGlyphMasses(active, width, height, pixelScale, L, fm, env) {
    var layer = scratch(env, 'commons-mass-probe', width, height, true), masses = [];
    for (var i = 0; i < active.length; i++) {
      layer.ctx.clearRect(0, 0, width, height); env.drawGlyph(layer.ctx, active[i].glyph, pixelScale, L, fm, 1, '#fff');
      var b = glyphBounds(active[i].glyph, pixelScale, L), x = Math.max(0, Math.floor(b.x - 2)), y = Math.max(0, Math.floor(b.y - 2));
      var w = Math.max(1, Math.min(width - x, Math.ceil(b.w + 4))), h = Math.max(1, Math.min(height - y, Math.ceil(b.h + 4))), sum = 0;
      try {
        var data = layer.ctx.getImageData(x, y, w, h).data;
        for (var p = 3; p < data.length; p += 4) sum += data[p] / 255;
      } catch (error) { sum = Math.max(1, b.w * b.h * 0.28); }
      masses.push(Math.max(1, sum));
    }
    layer.ctx.clearRect(0, 0, width, height);
    return masses;
  }

  function inkRail(canvas, bounds) {
    var x = Math.max(0, Math.floor(bounds.x)), y = Math.max(0, Math.floor(bounds.y + bounds.h * 0.3));
    var w = Math.min(canvas.width - x, Math.ceil(bounds.w)), h = Math.min(canvas.height - y, Math.ceil(bounds.h * 0.46));
    if (w <= 0 || h <= 0) return bounds.x + bounds.w * 0.5;
    var data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(x, y, w, h).data, scores = new Float32Array(w), peak = 0;
    for (var px = 0; px < w; px++) {
      for (var py = 0; py < h; py++) scores[px] += data[(py * w + px) * 4 + 3];
      if (scores[px] > scores[peak] || (scores[px] === scores[peak] && Math.abs(px - w * 0.5) < Math.abs(peak - w * 0.5))) peak = px;
    }
    var edge = peak;
    while (edge + 1 < w && scores[edge + 1] >= scores[peak] * 0.65) edge++;
    return x + edge;
  }

  function renderStrokeCommons(ctx, glyphs, width, height, pixelScale, L, fm, env) {
    var id = 'strokeCommons', active = activeGlyphs(env, glyphs, id);
    if (!active.length) return;
    var mode = option(env, glyphs, id, 'commonsAllocation'), focus = number(env, glyphs, id, 'commonsFocus');
    var budget = number(env, glyphs, id, 'commonsBudget'), transfer = number(env, glyphs, id, 'commonsTransfer');
    var minimum = number(env, glyphs, id, 'commonsMinimum'), reach = number(env, glyphs, id, 'commonsReach');
    var primary = env.color(id), secondary = mixColor(primary, env.params.accent, 0.74), masses = measureGlyphMasses(active, width, height, pixelScale, L, fm, env);
    var allocation = allocateCommons(masses, focus, budget, minimum, reach, mode, transfer);
    var ownedMasses = [], probe = scratch(env, 'commons-owned-layer', width, height, true);
    var donorLayer = scratch(env, 'commons-donor-material-raster', width, height, true);
    var totalGain = allocation.allocations.reduce(function (sum, mass, i) { return sum + Math.max(0, mass - masses[i]); }, 0);
    for (var owner = 0; owner < active.length; owner++) {
      probe.ctx.clearRect(0, 0, width, height);
      env.drawGlyph(probe.ctx, active[owner].glyph, pixelScale, L, fm, 1, '#fff');
      var ownerBox = glyphBounds(active[owner].glyph, pixelScale, L);
      var ownerRail = inkRail(probe.canvas, ownerBox);
      var gain = Math.max(0, allocation.allocations[owner] - masses[owner]);
      if (gain > 0.01 && totalGain > 0) {
        var graft = 0;
        for (var donor = 0; donor < active.length; donor++) {
          var loss = Math.max(0, masses[donor] - allocation.allocations[donor]); if (loss <= 0.01) continue;
          donorLayer.ctx.clearRect(0, 0, width, height);
          env.drawGlyph(donorLayer.ctx, active[donor].glyph, pixelScale, L, fm, 1, '#fff');
          var db = glyphBounds(active[donor].glyph, pixelScale, L), fraction = Math.min(0.82, loss / masses[donor]);
          var donorRail = inkRail(donorLayer.canvas, db), materialX = Math.min(db.x + db.w - 1, donorRail);
          var materialWidth = Math.max(1, Math.min(db.w * fraction, db.x + db.w - materialX)), targetWidth = Math.min(ownerBox.w * 0.7, materialWidth * gain / totalGain);
          var section = graft % 3, materialY = db.y + db.h * (0.12 + section * 0.2), materialHeight = db.h * 0.4;
          var targetX = ownerRail - Math.max(pixelScale, ownerBox.w * 0.025), targetY = ownerBox.y + ownerBox.h * (0.12 + section * 0.25);
          // A contiguous piece of the donor becomes a limb of the recipient.
          // Its ink participates in the same exact owned-alpha budget below.
          probe.ctx.drawImage(donorLayer.canvas, materialX, materialY, materialWidth, materialHeight, targetX, targetY, targetWidth, ownerBox.h * 0.4);
          graft++;
        }
      }
      var margin = Math.ceil(Math.sqrt(allocation.allocations[owner]) + 4);
      var x0 = Math.max(0, Math.floor(ownerBox.x - margin)), y0 = Math.max(0, Math.floor(ownerBox.y - margin));
      var x1 = Math.min(width, Math.ceil(ownerBox.x + ownerBox.w + margin)), y1 = Math.min(height, Math.ceil(ownerBox.y + ownerBox.h + margin));
      if (x1 <= x0 || y1 <= y0) { ownedMasses.push(0); continue; }
      var raster = probe.ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
      var redistributed = redistributeAlpha(raster.data, raster.width, raster.height, allocation.allocations[owner], minimum);
      var rgb = hexRgb(owner === allocation.focus ? secondary : primary);
      for (var px = 0; px < redistributed.alpha.length; px++) {
        raster.data[px * 4] = rgb[0]; raster.data[px * 4 + 1] = rgb[1]; raster.data[px * 4 + 2] = rgb[2]; raster.data[px * 4 + 3] = redistributed.alpha[px];
      }
      probe.ctx.clearRect(0, 0, width, height); probe.ctx.putImageData(raster, x0, y0);
      ctx.save(); ctx.globalAlpha = active[owner].strength; ctx.drawImage(probe.canvas, 0, 0); ctx.restore();
      ownedMasses.push(redistributed.mass);
    }
    // Ownership is measured before source-over: overlapping ink belongs to each
    // donor layer separately, not to the visible union. No unbudgeted decoration.
    root.TypeDeformerConditionsOperators.lastCommonsAudit = {
      source: masses, targets: allocation.allocations, owned: ownedMasses,
      totalSource: allocation.totalSource, totalTarget: allocation.totalAllocated,
      totalOwned: ownedMasses.reduce(function (sum, mass) { return sum + mass; }, 0), overlap: 'sum-of-owned-alpha-before-compositing'
    };
  }

  // Manhattan distance fields erode donors and grow recipients at fixed glyph
  // positions. The alpha floor preserves source structure. A deterministic
  // remainder pass makes the owned mass exact to one 8-bit alpha quantum.
  var alphaCache = new Map(), alphaCacheBytes = 0;
  function redistributeAlpha(rgba, width, height, target, minimum) {
    var signature = 2166136261;
    for (var byte = 3; byte < rgba.length; byte += 4) signature = Math.imul(signature ^ rgba[byte], 16777619);
    var cacheKey = width + ':' + height + ':' + (signature >>> 0) + ':' + Math.round(target * 255) + ':' + minimum;
    if (alphaCache.has(cacheKey)) return alphaCache.get(cacheKey);
    var size = width * height, inside = new Float32Array(size), outside = new Float32Array(size), source = new Uint8Array(size), sourceMass = 0;
    var infinity = width + height + 1;
    for (var i = 0; i < size; i++) { source[i] = rgba[i * 4 + 3]; sourceMass += source[i] / 255; inside[i] = source[i] > 127 ? infinity : 0; outside[i] = source[i] > 0 ? 0 : infinity; }
    function distance(field) {
      for (var p = 0; p < size; p++) { var x = p % width; if (x) field[p] = Math.min(field[p], field[p - 1] + 1); if (p >= width) field[p] = Math.min(field[p], field[p - width] + 1); }
      for (var q = size - 1; q >= 0; q--) { var x = q % width; if (x + 1 < width) field[q] = Math.min(field[q], field[q + 1] + 1); if (q + width < size) field[q] = Math.min(field[q], field[q + width] + 1); }
    }
    distance(inside); distance(outside);
    target = Math.max(0, Math.min(size, target));
    var growing = target >= sourceMass, floor = Math.min(clamp(minimum, 0, 1), target / Math.max(1, sourceMass));
    var lo = -infinity, hi = infinity;
    function alphaAt(p, level) {
      if (growing) return Math.max(source[p] / 255, clamp(level - outside[p] + 1, 0, 1));
      return source[p] / 255 * (floor + (1 - floor) * clamp(inside[p] + level, 0, 1));
    }
    for (var step = 0; step < 22; step++) {
      var mid = (lo + hi) * 0.5, mass = 0;
      for (var at = 0; at < size; at++) mass += alphaAt(at, mid);
      if (mass < target) lo = mid; else hi = mid;
    }
    var alpha = new Uint8ClampedArray(size), units = 0, desired = Math.round(target * 255), residuals = [];
    for (var a = 0; a < size; a++) {
      var value = alphaAt(a, (lo + hi) * 0.5) * 255;
      alpha[a] = Math.floor(value); units += alpha[a];
      if (value - alpha[a] > 0.00001 && alpha[a] < 255) residuals.push(a);
    }
    var remainder = desired - units;
    for (var r = 0; r < residuals.length && remainder > 0; r++, remainder--) alpha[residuals[r]]++;
    // Floating point binary search can leave a few units outside its boundary.
    for (var repair = 0; repair < size && remainder !== 0; repair++) {
      var delta = remainder > 0 ? Math.min(remainder, 255 - alpha[repair]) : -Math.min(-remainder, alpha[repair]);
      if (source[repair] || alpha[repair]) { alpha[repair] += delta; remainder -= delta; }
    }
    var result = { alpha: alpha, mass: (desired - remainder) / 255, sourceMass: sourceMass };
    while (alphaCacheBytes + alpha.length > 16 * 1024 * 1024 && alphaCache.size) {
      var oldest = alphaCache.keys().next().value; alphaCacheBytes -= alphaCache.get(oldest).alpha.length; alphaCache.delete(oldest);
    }
    alphaCache.set(cacheKey, result); alphaCacheBytes += alpha.length;
    return result;
  }

  var RENDERERS = {
    rubyUsurper: renderRubyUsurper,
    punctuationLoom: renderPunctuationLoom,
    counterpage: renderCounterpage,
    rendererDebt: renderRendererDebt,
    ligatureContagion: renderLigatureContagion,
    strokeCommons: renderStrokeCommons
  };

  function render(id, ctx, glyphs, width, height, pixelScale, L, fm, env) {
    if (!RENDERERS[id]) return false;
    RENDERERS[id](ctx, glyphs, width, height, pixelScale, L, fm, env);
    return true;
  }

  function effectPad(id, profile, fontSize) {
    profile = profile || {}; fontSize = Number(fontSize) || 52;
    switch (id) {
      case 'rubyUsurper': return (profile.rubySpread || 0) * 1.5 + (profile.rubyThread || 0) * 8
        + fontSize * (profile.rubyDominance || 0) * (2.4 + (profile.rubyLayers || 1) * 1.2);
      case 'punctuationLoom': return Math.abs(profile.punctuationSag || 0) + (profile.punctuationScale || 1) * fontSize * 0.28 + (profile.punctuationThread || 0) * (profile.punctuationBands || 1);
      case 'counterpage': return Math.abs(profile.counterpageShift || 0) + (profile.counterpageDepth || 0) * 0.45 + fontSize * (profile.counterpageAperture || 0) * 0.25;
      case 'rendererDebt': return fontSize * (0.25 + (profile.rendererInertia || 0) * 0.7 + (profile.rendererPooling || 0) * 0.35) + (profile.rendererMemory || 1) * 5;
      case 'ligatureContagion': return (profile.contagionBridge || 0) * 0.45 + fontSize * (0.18 + (profile.contagionInheritance || 0) * 0.34);
      case 'strokeCommons': return fontSize * (0.22 + (profile.commonsTransfer || 0) * 1.35 + Math.max(0, (profile.commonsBudget || 1) - 1) * 1.6);
      default: return 0;
    }
  }

  function requiresAnimation() { return false; }

  root.TypeDeformerConditionsOperators = {
    ids: IDS.slice(),
    schemas: SCHEMAS,
    render: render,
    effectPad: effectPad,
    requiresAnimation: requiresAnimation,
    internals: {
      clamp: clamp,
      hash: hash,
      parseRubyMapping: parseRubyMapping,
      pairPunctuation: pairPunctuation,
      enclosedVoidMask: enclosedVoidMask,
      composeCounterpages: composeCounterpages,
      wrapPageText: wrapPageText,
      skeletonStrokes: skeletonStrokes,
      contagionGraph: contagionGraph,
      allocateCommons: allocateCommons,
      redistributeAlpha: redistributeAlpha
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
