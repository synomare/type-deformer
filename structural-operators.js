(function (root) {
  'use strict';

  // Nine structural/material operators introduced in project schema v67.
  // The host owns glyph layout, state, fonts and compositing. This module owns
  // only deterministic geometry so the same renderers serve the editor, Look,
  // Project, PNG/SVG and video paths.
  var IDS = [
    'fiberBody', 'glyphMutation', 'suspendedSyntax', 'livingTextField',
    'innerEruption', 'recursiveGraft', 'structuralCollision', 'peelWeave',
    'voidPressure'
  ];

  var SCHEMAS = {
    fiberBody: {
      options: { fiberGrammar: ['microtype', 'cable', 'mycelial'] },
      limits: { fiberUnit: [3, 18], fiberDensity: [0.4, 3], fiberFlow: [-2, 2], fiberFray: [0, 1] },
      defaults: { fiberGrammar: 'microtype', fiberUnit: 7, fiberDensity: 1.35, fiberFlow: 0.55, fiberFray: 0.22 }
    },
    glyphMutation: {
      options: { mutationGrammar: ['sector', 'fault', 'organ'] },
      limits: { mutationRegions: [2, 12], mutationDisplace: [0, 160], mutationContrast: [0, 1], mutationSeam: [0, 20] },
      integers: ['mutationRegions'],
      defaults: { mutationGrammar: 'sector', mutationRegions: 5, mutationDisplace: 28, mutationContrast: 0.72, mutationSeam: 2 }
    },
    suspendedSyntax: {
      options: { suspensionGrammar: ['catenary', 'gantry', 'mobile'] },
      limits: { suspensionDrop: [0, 320], suspensionTension: [0, 2], suspensionCable: [0.2, 16], suspensionTypeSize: [3, 24] },
      defaults: { suspensionGrammar: 'catenary', suspensionDrop: 132, suspensionTension: 0.8, suspensionCable: 2.8, suspensionTypeSize: 8 }
    },
    livingTextField: {
      options: { livingGrammar: ['particles', 'lexemes', 'constellation'] },
      limits: { livingCell: [3, 32], livingDensity: [0.1, 3], livingDrift: [0, 240], livingMotion: [0, 2] },
      defaults: { livingGrammar: 'particles', livingCell: 8, livingDensity: 1.2, livingDrift: 36, livingMotion: 0.55 }
    },
    innerEruption: {
      options: { eruptionGrammar: ['lamina', 'shard', 'plume'] },
      limits: { eruptionForce: [0, 3], eruptionLayers: [1, 18], eruptionReach: [0, 320], eruptionRupture: [0, 1] },
      integers: ['eruptionLayers'],
      defaults: { eruptionGrammar: 'shard', eruptionForce: 1.1, eruptionLayers: 7, eruptionReach: 72, eruptionRupture: 0.62 }
    },
    recursiveGraft: {
      options: { graftGrammar: ['dendrite', 'coral', 'splice'] },
      limits: { graftGenerations: [1, 7], graftReach: [4, 240], graftTurn: [-120, 120], graftFusion: [0, 240], graftWeight: [0.2, 16] },
      integers: ['graftGenerations'],
      defaults: { graftGrammar: 'dendrite', graftGenerations: 4, graftReach: 62, graftTurn: 28, graftFusion: 48, graftWeight: 1.8 }
    },
    structuralCollision: {
      options: { collisionSystem: ['opposed', 'radial', 'stack'], collisionReaction: ['weld', 'void', 'flare'] },
      limits: { collisionBodies: [2, 5], collisionForce: [0, 240], collisionAngle: [-180, 180], collisionSeam: [0, 32] },
      integers: ['collisionBodies'],
      defaults: { collisionSystem: 'opposed', collisionBodies: 3, collisionForce: 46, collisionAngle: 22, collisionReaction: 'weld', collisionSeam: 4 }
    },
    peelWeave: {
      options: { peelGrammar: ['lamina', 'braid', 'knot'] },
      limits: { peelLayers: [2, 18], peelDepth: [0, 240], peelBand: [2, 80], peelTwist: [-2, 2], peelKnot: [0, 1] },
      integers: ['peelLayers'],
      defaults: { peelGrammar: 'lamina', peelLayers: 7, peelDepth: 64, peelBand: 18, peelTwist: 0.65, peelKnot: 0.72 }
    },
    voidPressure: {
      options: { voidPressureMode: ['counter', 'gutter', 'breach'] },
      limits: { voidPressureForce: [0, 3], voidPressureReach: [0, 240], voidPressureRupture: [0, 1], voidPressureAxis: [-180, 180] },
      defaults: { voidPressureMode: 'counter', voidPressureForce: 1.25, voidPressureReach: 72, voidPressureRupture: 0.55, voidPressureAxis: 0 }
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

  function cleanPhrase(value) {
    var phrase = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    return phrase || 'TYPE DEFORMER';
  }

  function option(env, glyphs, id, key) {
    var schema = SCHEMAS[id], fallback = schema.defaults[key], choices = schema.options[key];
    return env.choice ? env.choice(glyphs, id, key, fallback, choices) : fallback;
  }

  function number(env, glyphs, id, key) {
    var schema = SCHEMAS[id], fallback = schema.defaults[key], limits = schema.limits[key];
    var value = env.aggregate ? env.aggregate(glyphs, id, key, fallback).value : fallback;
    value = root.TypeDeformerParameters ? root.TypeDeformerParameters.normalize(key,value,fallback,limits[0],limits[1],schema.integers && schema.integers.indexOf(key)!==-1) : clamp(value, limits[0], limits[1]);
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
    return env.scratch('structural-v67-' + name, width, height, !!readFrequently);
  }

  function tintMask(env, mask, color, name) {
    var layer = scratch(env, name, mask.width, mask.height, false);
    layer.ctx.drawImage(mask, 0, 0);
    layer.ctx.globalCompositeOperation = 'source-in';
    layer.ctx.fillStyle = color;
    layer.ctx.fillRect(0, 0, mask.width, mask.height);
    layer.ctx.globalCompositeOperation = 'source-over';
    return layer.canvas;
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

  // Vertical Latin and punctuation are rotated a second time by the host's
  // glyph painter.  Suspended Syntax needs anchors on that painted geometry,
  // rather than on the unrotated layout cell used by the other operators.
  function suspensionPointOnGlyph(g, u, v, pixelScale, L, vertical) {
    if (!vertical || g.upright) return pointOnGlyph(g, u, v, pixelScale, L);
    var cx = g.x + g.w * 0.5, cy = g.y + g.h * 0.5;
    var rawX = g.x + g.w * u, rawY = g.y + g.h * v;
    var localX = cx - (rawY - cy), localY = cy + (rawX - cx);
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

  function suspensionGlyphBounds(g, pixelScale, L, vertical) {
    if (!vertical || g.upright) return glyphBounds(g, pixelScale, L);
    var points = [
      suspensionPointOnGlyph(g, 0, 0, pixelScale, L, true),
      suspensionPointOnGlyph(g, 1, 0, pixelScale, L, true),
      suspensionPointOnGlyph(g, 1, 1, pixelScale, L, true),
      suspensionPointOnGlyph(g, 0, 1, pixelScale, L, true)
    ];
    var xs = points.map(function (point) { return point.x; }), ys = points.map(function (point) { return point.y; });
    var x = Math.min.apply(Math, xs), y = Math.min.apply(Math, ys);
    return { x: x, y: y, w: Math.max(1, Math.max.apply(Math, xs) - x), h: Math.max(1, Math.max.apply(Math, ys) - y), points: points };
  }

  function shiftedGlyph(g, dxPixels, dyPixels, rotation, pixelScale, L) {
    var copy = Object.assign({}, g);
    var scale = Math.max(0.000001, pixelScale * L.s);
    copy.tx = (g.tx || 0) + dxPixels / scale;
    copy.ty = (g.ty || 0) + dyPixels / scale;
    copy.rot = (g.rot || 0) + (rotation || 0);
    return copy;
  }

  function readMask(mask) {
    try { return mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, mask.width, mask.height); }
    catch (error) { return null; }
  }

  function rgbaColor(value, alpha) {
    var rgb = hexRgb(value);
    return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + clamp(alpha, 0, 1) + ')';
  }

  function richPalette(primary, accent, paper) {
    return {
      base: primary,
      dark: mixColor(primary, '#08070b', 0.42),
      deep: mixColor(primary, '#08070b', 0.7),
      light: mixColor(primary, paper || '#f4f3ef', 0.58),
      pale: mixColor(primary, paper || '#f4f3ef', 0.8),
      accent: mixColor(primary, accent || primary, 0.7),
      hot: mixColor(accent || primary, paper || '#f4f3ef', 0.24)
    };
  }

  function imageAlpha(image, width, height, x, y) {
    x = Math.max(0, Math.min(width - 1, Math.round(x)));
    y = Math.max(0, Math.min(height - 1, Math.round(y)));
    return image && image.data ? image.data[(y * width + x) * 4 + 3] / 255 : 0;
  }

  // Sample actual glyph edges and estimate their outward normals. Sampling is
  // deliberately coarse and capped: it gives the material renderers anatomy
  // without turning every animation frame into a full contour tracer.
  function boundarySamples(image, width, height, bounds, spacing, limit, seed) {
    if (!image || !image.data) return [];
    spacing = Math.max(2, Math.round(spacing || 5));
    limit = Math.max(1, Math.round(limit || 96));
    var x0 = Math.max(spacing, Math.floor(bounds.x));
    var y0 = Math.max(spacing, Math.floor(bounds.y));
    var x1 = Math.min(width - spacing - 1, Math.ceil(bounds.x + bounds.w));
    var y1 = Math.min(height - spacing - 1, Math.ceil(bounds.y + bounds.h));
    var found = [];
    for (var y = y0; y <= y1; y += spacing) for (var x = x0; x <= x1; x += spacing) {
      var alpha = imageAlpha(image, width, height, x, y);
      if (alpha < 0.16) continue;
      var left = imageAlpha(image, width, height, x - spacing, y);
      var right = imageAlpha(image, width, height, x + spacing, y);
      var top = imageAlpha(image, width, height, x, y - spacing);
      var bottom = imageAlpha(image, width, height, x, y + spacing);
      if (Math.min(left, right, top, bottom) > 0.22) continue;
      var gx = right - left, gy = bottom - top, magnitude = Math.hypot(gx, gy);
      var nx, ny;
      if (magnitude > 0.03) { nx = -gx / magnitude; ny = -gy / magnitude; }
      else {
        nx = x - (bounds.x + bounds.w * 0.5); ny = y - (bounds.y + bounds.h * 0.5);
        magnitude = Math.max(0.001, Math.hypot(nx, ny)); nx /= magnitude; ny /= magnitude;
      }
      found.push({ x: x, y: y, nx: nx, ny: ny, rank: hash(x / spacing, y / spacing, seed || 1) });
    }
    if (found.length <= limit) return found;
    found.sort(function (a, b) { return a.rank - b.rank; });
    return found.slice(0, limit);
  }

  function drawMaterialMask(target, env, mask, primary, accent, name, options) {
    options = options || {};
    var palette = richPalette(primary, accent, env.params.paper);
    var layer = scratch(env, name + '-material', mask.width, mask.height, false), c = layer.ctx;
    c.drawImage(mask, 0, 0);
    c.globalCompositeOperation = 'source-in';
    var angle = Number(options.angle) || -0.68, cx = mask.width * 0.5, cy = mask.height * 0.5;
    var radius = Math.hypot(mask.width, mask.height) * 0.62;
    var gradient = c.createLinearGradient(cx - Math.cos(angle) * radius, cy - Math.sin(angle) * radius, cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    gradient.addColorStop(0, palette.deep);
    gradient.addColorStop(0.26, palette.base);
    gradient.addColorStop(0.52, options.duotone === false ? palette.light : palette.accent);
    gradient.addColorStop(0.74, palette.base);
    gradient.addColorStop(1, palette.dark);
    c.fillStyle = gradient; c.fillRect(0, 0, mask.width, mask.height);
    c.globalCompositeOperation = 'source-over';

    var depth = Math.max(0, Number(options.depth) || 0);
    target.save();
    target.globalAlpha = options.alpha == null ? 1 : options.alpha;
    if (depth > 0.05) {
      target.shadowColor = rgbaColor(palette.deep, 0.46);
      target.shadowBlur = depth * 1.5;
      target.shadowOffsetX = depth * 0.72;
      target.shadowOffsetY = depth * 0.92;
    }
    target.drawImage(layer.canvas, 0, 0);
    target.restore();

    if (options.gloss !== false) {
      var sheen = scratch(env, name + '-sheen', mask.width, mask.height, false), sc = sheen.ctx;
      sc.drawImage(mask, 0, 0); sc.globalCompositeOperation = 'source-in';
      var shine = sc.createLinearGradient(0, 0, mask.width, mask.height);
      shine.addColorStop(0, rgbaColor(palette.pale, 0.06));
      shine.addColorStop(0.42, rgbaColor(palette.pale, 0.62));
      shine.addColorStop(0.5, rgbaColor(palette.hot, 0.16));
      shine.addColorStop(0.64, rgbaColor(palette.pale, 0));
      shine.addColorStop(1, rgbaColor(palette.deep, 0.14));
      sc.fillStyle = shine; sc.fillRect(0, 0, mask.width, mask.height); sc.globalCompositeOperation = 'source-over';
      target.save(); target.globalCompositeOperation = 'screen'; target.globalAlpha = options.sheen == null ? 0.5 : options.sheen;
      target.drawImage(sheen.canvas, 0, 0); target.restore();
    }
    return palette;
  }

  function drawRichCurve(ctx, start, controlA, controlB, end, width, palette, alpha) {
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = rgbaColor(palette.deep, 0.58); ctx.lineWidth = Math.max(0.7, width * 1.22);
    ctx.shadowColor = rgbaColor(palette.deep, 0.36); ctx.shadowBlur = Math.max(1, width * 0.62); ctx.shadowOffsetY = Math.max(0.5, width * 0.22);
    ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.bezierCurveTo(controlA.x, controlA.y, controlB.x, controlB.y, end.x, end.y); ctx.stroke();
    ctx.shadowColor = 'transparent'; ctx.strokeStyle = palette.base; ctx.lineWidth = Math.max(0.5, width);
    ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.bezierCurveTo(controlA.x, controlA.y, controlB.x, controlB.y, end.x, end.y); ctx.stroke();
    ctx.strokeStyle = rgbaColor(palette.light, 0.82); ctx.lineWidth = Math.max(0.35, width * 0.16);
    ctx.beginPath(); ctx.moveTo(start.x, start.y - width * 0.12); ctx.bezierCurveTo(controlA.x, controlA.y - width * 0.12, controlB.x, controlB.y - width * 0.12, end.x, end.y - width * 0.12); ctx.stroke();
    ctx.restore();
  }

  function organicLoopPath(ctx, cx, cy, rx, ry, rotation, roughness, seed, startAngle, endAngle) {
    startAngle = startAngle == null ? 0 : startAngle;
    endAngle = endAngle == null ? Math.PI * 2 : endAngle;
    var full = Math.abs(endAngle - startAngle) >= Math.PI * 1.99;
    var steps = Math.max(18, Math.round(34 * Math.abs(endAngle - startAngle) / (Math.PI * 2)));
    var cosR = Math.cos(rotation || 0), sinR = Math.sin(rotation || 0);
    var phaseA = hash(seed, 3, 17) * Math.PI * 2, phaseB = hash(seed, 7, 23) * Math.PI * 2;
    ctx.beginPath();
    for (var stepIndex = 0; stepIndex <= steps; stepIndex++) {
      var t = startAngle + (endAngle - startAngle) * stepIndex / steps;
      var modulation = 1 + roughness * (Math.sin(t * 3 + phaseA) * 0.46 + Math.sin(t * 5 + phaseB) * 0.28 + Math.sin(t * 9 + phaseA - phaseB) * 0.12);
      var lx = Math.cos(t) * rx * modulation, ly = Math.sin(t) * ry * (1 + (modulation - 1) * 0.76);
      var px = cx + lx * cosR - ly * sinR, py = cy + lx * sinR + ly * cosR;
      if (stepIndex === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    if (full) ctx.closePath();
  }

  function clipAxisHalf(ctx, cx, cy, angle, positive, width, height) {
    var span = Math.hypot(width, height) * 1.2;
    ctx.translate(cx, cy); ctx.rotate(angle);
    ctx.beginPath(); ctx.rect(positive ? 0 : -span, -span, span, span * 2); ctx.clip();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function clipAxisBand(ctx, cx, cy, angle, start, end, width, height) {
    var span = Math.hypot(width, height) * 1.2;
    ctx.translate(cx, cy); ctx.rotate(angle);
    ctx.beginPath(); ctx.rect(start, -span, Math.max(0.5, end - start), span * 2); ctx.clip();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // Find transparent components that are enclosed by ink. Work on a coarse
  // occupancy grid so counter analysis remains bounded for a 2.4 MP Surface.
  function findInteriorVoids(image, width, height, step) {
    var data = image && image.data ? image.data : image;
    if (!data || !width || !height) return [];
    step = Math.max(1, Math.round(step || 4));
    var cols = Math.ceil(width / step), rows = Math.ceil(height / step), size = cols * rows;
    var solid = new Uint8Array(size), outside = new Uint8Array(size);
    var x, y, gx, gy, index;
    for (gy = 0; gy < rows; gy++) for (gx = 0; gx < cols; gx++) {
      var samples = 0, alpha = 0;
      for (y = gy * step; y < Math.min(height, (gy + 1) * step); y += Math.max(1, Math.floor(step / 2))) {
        for (x = gx * step; x < Math.min(width, (gx + 1) * step); x += Math.max(1, Math.floor(step / 2))) {
          alpha += data[(y * width + x) * 4 + 3] || 0; samples++;
        }
      }
      solid[gy * cols + gx] = alpha / Math.max(1, samples) > 28 ? 1 : 0;
    }
    var queue = new Int32Array(size), head = 0, tail = 0;
    function push(gx0, gy0) {
      if (gx0 < 0 || gy0 < 0 || gx0 >= cols || gy0 >= rows) return;
      var at = gy0 * cols + gx0;
      if (solid[at] || outside[at]) return;
      outside[at] = 1; queue[tail++] = at;
    }
    for (gx = 0; gx < cols; gx++) { push(gx, 0); push(gx, rows - 1); }
    for (gy = 0; gy < rows; gy++) { push(0, gy); push(cols - 1, gy); }
    while (head < tail) {
      index = queue[head++]; gx = index % cols; gy = Math.floor(index / cols);
      push(gx - 1, gy); push(gx + 1, gy); push(gx, gy - 1); push(gx, gy + 1);
    }
    var seen = new Uint8Array(size), holes = [];
    for (index = 0; index < size; index++) {
      if (solid[index] || outside[index] || seen[index]) continue;
      head = 0; tail = 0; queue[tail++] = index; seen[index] = 1;
      var count = 0, sumX = 0, sumY = 0, minX = cols, minY = rows, maxX = 0, maxY = 0;
      while (head < tail) {
        var current = queue[head++]; gx = current % cols; gy = Math.floor(current / cols);
        count++; sumX += gx; sumY += gy; minX = Math.min(minX, gx); minY = Math.min(minY, gy); maxX = Math.max(maxX, gx); maxY = Math.max(maxY, gy);
        var neighbours = [current - 1, current + 1, current - cols, current + cols];
        for (var n = 0; n < neighbours.length; n++) {
          var next = neighbours[n], nx = next % cols, ny = Math.floor(next / cols);
          if (next < 0 || next >= size || (n === 0 && gx === 0) || (n === 1 && gx === cols - 1)) continue;
          if (!solid[next] && !outside[next] && !seen[next]) { seen[next] = 1; queue[tail++] = next; }
        }
      }
      if (count < 2) continue;
      holes.push({
        x: (sumX / count + 0.5) * step,
        y: (sumY / count + 0.5) * step,
        rx: Math.max(step, (maxX - minX + 1) * step * 0.5),
        ry: Math.max(step, (maxY - minY + 1) * step * 0.5),
        area: count * step * step
      });
    }
    holes.sort(function (a, b) { return b.area - a.area; });
    return holes.slice(0, 24);
  }

  function maskVoids(mask, pixelScale) {
    var image = readMask(mask);
    return image ? findInteriorVoids(image, mask.width, mask.height, Math.max(3, Math.round(5 * pixelScale))) : [];
  }

  function renderFiberBody(ctx, glyphs, width, height, pixelScale, L, fm, env) {
    var id = 'fiberBody', active = activeGlyphs(env, glyphs, id);
    if (!active.length) return;
    var grammar = option(env, glyphs, id, 'fiberGrammar');
    var unit = number(env, glyphs, id, 'fiberUnit') * pixelScale;
    var density = number(env, glyphs, id, 'fiberDensity');
    var flow = number(env, glyphs, id, 'fiberFlow');
    var fray = number(env, glyphs, id, 'fiberFray');
    var mask = env.buildMask(glyphs, id, width, height, pixelScale, L, fm), image = readMask(mask);
    var layer = scratch(env, 'fiber-body-layer', width, height, false), c = layer.ctx;
    var phrase = cleanPhrase(env.sourceText), primary = env.color(id), palette = richPalette(primary, env.params.accent, env.params.paper);
    c.textBaseline = 'alphabetic'; c.textAlign = 'left'; c.lineCap = 'round'; c.lineJoin = 'round';
    for (var i = 0; i < active.length; i++) {
      var item = active[i], bounds = glyphBounds(item.glyph, pixelScale, L);
      var grammarUnit = grammar === 'cable' ? 1.38 : (grammar === 'mycelial' ? 0.64 : 0.82);
      var fontSize = Math.max(2.5, unit * grammarUnit * (0.78 + item.strength * 0.22));
      c.font = '650 ' + fontSize + 'px ui-monospace, SFMono-Regular, Consolas, monospace';
      var measured = Math.max(1, c.measureText(phrase).width);
      var fit = Math.min(1, Math.max(0.14, (bounds.w * (grammar === 'microtype' ? 0.88 : grammar === 'cable' ? 1.16 : 0.96)) / measured));
      var rowGap = Math.max(2, fontSize * ((grammar === 'cable' ? 0.82 : grammar === 'mycelial' ? 1.18 : 1.03) / density));
      var rows = Math.min(96, Math.ceil(bounds.h / rowGap) + 4);
      for (var row = -1; row < rows; row++) {
        var rowPhase = (row + 1) * 1.17 + i * 0.79;
        var y = bounds.y + (row + 0.72) * rowGap;
        var wave = Math.sin(rowPhase) * flow * fontSize * (grammar === 'mycelial' ? 1.28 : grammar === 'cable' ? 0.72 : 0.34);
        var slant = grammar === 'cable' ? (row % 2 ? -1 : 1) * (0.19 + Math.abs(flow) * 0.12) + Math.sin(row * 0.61 + i) * 0.055 :
          grammar === 'mycelial' ? (hash(i, row, env.params.seed) - 0.5) * 0.92 * (0.72 + Math.abs(flow)) : flow * 0.008;
        var x = bounds.x + (bounds.w - measured * fit) * 0.5 + wave + (grammar === 'cable' ? (row % 2 ? -1 : 1) * fontSize * 0.38 : 0);
        c.save();
        c.translate(x, y); c.rotate(slant); c.scale(fit, 1);
        c.globalAlpha = item.strength * (0.34 + fray * 0.18);
        c.fillStyle = palette.deep; c.shadowColor = rgbaColor(palette.deep, 0.42); c.shadowBlur = fontSize * 0.42;
        c.fillText(phrase, fontSize * 0.18, fontSize * 0.22);
        c.shadowColor = 'transparent';
        c.globalAlpha = item.strength * (0.88 + (row % 2 ? 0.1 : 0));
        c.fillStyle = row % 5 === 1 ? palette.accent : (row % 5 === 3 ? palette.deep : (row % 5 === 4 ? palette.hot : palette.base));
        c.fillText(phrase, 0, 0);
        c.globalCompositeOperation = 'screen'; c.globalAlpha = item.strength * 0.18;
        c.fillStyle = palette.pale; c.fillText(phrase, 0, -fontSize * 0.09);
        c.globalCompositeOperation = 'source-over';
        c.restore();
        c.save(); c.globalAlpha = item.strength * (0.12 + fray * 0.38); c.strokeStyle = row % 3 ? palette.base : palette.hot;
        c.lineWidth = Math.max(0.35, pixelScale * (0.38 + fray * 0.9));
        c.beginPath(); c.moveTo(bounds.x - fray * fontSize * 1.8, y - fontSize * 0.46);
        c.bezierCurveTo(bounds.x + bounds.w * 0.27, y - fontSize * flow * 0.28, bounds.x + bounds.w * 0.71, y + fontSize * flow * 0.28, bounds.x + bounds.w + fray * fontSize * 1.8, y - fontSize * 0.46);
        c.stroke(); c.restore();
      }

      // A sparse warp crosses the complete phrases. It makes the body read as
      // a woven sheet rather than unrelated lines of microtype.
      var columns = Math.max(3, Math.min(16, Math.round(bounds.w / Math.max(fontSize * 2.8, 8 * pixelScale))));
      for (var column = 0; column <= columns; column++) {
        var u = column / Math.max(1, columns), warpX = bounds.x + bounds.w * u;
        c.save(); c.globalAlpha = item.strength * (0.16 + density * 0.05); c.strokeStyle = column % 3 ? palette.light : palette.accent;
        c.lineWidth = Math.max(0.3, pixelScale * (0.34 + fray * 0.72));
        c.beginPath(); c.moveTo(warpX, bounds.y - fontSize * fray);
        c.bezierCurveTo(warpX + Math.sin(column * 1.7 + i) * flow * fontSize, bounds.y + bounds.h * 0.3,
          warpX - Math.cos(column * 1.31 + i) * flow * fontSize, bounds.y + bounds.h * 0.72,
          warpX + Math.sin(column + i) * flow * fontSize * 0.5, bounds.y + bounds.h + fontSize * fray);
        c.stroke(); c.restore();
      }

      if (grammar === 'cable') {
        for (var cableIndex = 0; cableIndex < 4; cableIndex++) {
          var cableY = bounds.y + bounds.h * (0.18 + cableIndex * 0.21);
          var cableBow = (cableIndex % 2 ? -1 : 1) * fontSize * flow * 1.2;
          c.save(); c.globalAlpha = item.strength * (0.29 + density * 0.05); c.strokeStyle = cableIndex % 2 ? palette.hot : palette.deep;
          c.lineWidth = Math.max(0.8, fontSize * (0.24 + fray * 0.1)); c.shadowColor = rgbaColor(palette.deep, 0.38); c.shadowBlur = fontSize * 0.34;
          c.beginPath(); c.moveTo(bounds.x - fontSize, cableY);
          c.bezierCurveTo(bounds.x + bounds.w * 0.28, cableY + cableBow, bounds.x + bounds.w * 0.7, cableY - cableBow, bounds.x + bounds.w + fontSize, cableY); c.stroke();
          c.shadowColor = 'transparent'; c.strokeStyle = palette.light; c.globalAlpha *= 0.68; c.lineWidth = Math.max(0.35, fontSize * 0.035);
          c.beginPath(); c.moveTo(bounds.x - fontSize, cableY - fontSize * 0.05);
          c.bezierCurveTo(bounds.x + bounds.w * 0.28, cableY + cableBow - fontSize * 0.05, bounds.x + bounds.w * 0.7, cableY - cableBow - fontSize * 0.05, bounds.x + bounds.w + fontSize, cableY - fontSize * 0.05); c.stroke(); c.restore();
        }
      } else if (grammar === 'mycelial') {
        var hyphae = Math.max(5, Math.min(12, Math.round(4 + density * 3)));
        for (var hypha = 0; hypha < hyphae; hypha++) {
          var hx = bounds.x + bounds.w * hash(hypha, i, env.params.seed + 751), hy = bounds.y + bounds.h * hash(i, hypha, env.params.seed + 757);
          var ha = (hash(hypha, i, env.params.seed + 761) - 0.5) * Math.PI + flow * 0.32;
          var hlen = Math.max(fontSize * 2, bounds.w * (0.28 + hash(i, hypha, env.params.seed + 763) * 0.55));
          c.save(); c.globalAlpha = item.strength * (0.36 + fray * 0.24); c.strokeStyle = hypha % 3 ? palette.deep : palette.accent;
          c.lineWidth = Math.max(0.42, pixelScale * (0.58 + fray * 0.78)); c.beginPath(); c.moveTo(hx, hy);
          c.bezierCurveTo(hx + Math.cos(ha - 0.5) * hlen * 0.32, hy + Math.sin(ha - 0.5) * hlen * 0.32,
            hx + Math.cos(ha + 0.38) * hlen * 0.66, hy + Math.sin(ha + 0.38) * hlen * 0.66,
            hx + Math.cos(ha) * hlen, hy + Math.sin(ha) * hlen); c.stroke();
          c.fillStyle = hypha % 2 ? palette.hot : palette.light; c.beginPath(); c.arc(hx, hy, Math.max(0.5, pixelScale * (0.7 + fray)), 0, Math.PI * 2); c.fill(); c.restore();
        }
      }
    }
    c.globalCompositeOperation = 'destination-in'; c.drawImage(mask, 0, 0); c.globalCompositeOperation = 'source-over';

    // A quiet silhouette shadow gives the cut text-web thickness while leaving
    // the phrase units visually dominant.
    ctx.save(); ctx.globalAlpha = 0.3; ctx.shadowColor = rgbaColor(palette.deep, 0.68); ctx.shadowBlur = Math.max(1, unit * 0.72); ctx.shadowOffsetX = unit * 0.22; ctx.shadowOffsetY = unit * 0.34;
    ctx.drawImage(tintMask(env, mask, palette.deep, 'fiber-body-shadow'), 0, 0); ctx.restore();
    ctx.drawImage(layer.canvas, 0, 0);

    if (image && fray > 0.025) {
      ctx.save(); ctx.lineCap = 'round';
      var effectiveFray = Math.min(1, fray * (grammar === 'mycelial' ? 2.45 : grammar === 'cable' ? 1.25 : 1));
      for (var edgeIndex = 0; edgeIndex < active.length; edgeIndex++) {
        var edgeItem = active[edgeIndex], edgeBounds = glyphBounds(edgeItem.glyph, pixelScale, L);
        var edges = boundarySamples(image, width, height, edgeBounds, Math.max(3, unit * (grammar === 'mycelial' ? 0.5 : 0.8)), Math.round(8 + effectiveFray * 38), env.params.seed + edgeIndex * 19);
        for (var e = 0; e < edges.length; e++) {
          if (hash(e, edgeIndex, env.params.seed + 701) > effectiveFray * 0.88) continue;
          var point = edges[e], length = unit * (0.8 + hash(edgeIndex, e, env.params.seed + 703) * (grammar === 'mycelial' ? 5.2 : 3.4)) * effectiveFray;
          var tangentX = -point.ny, tangentY = point.nx, sway = (hash(e, edgeIndex, env.params.seed + 709) - 0.5) * length;
          ctx.globalAlpha = edgeItem.strength * (0.22 + fray * 0.42); ctx.strokeStyle = e % 4 ? palette.base : palette.hot;
          ctx.lineWidth = Math.max(0.32, pixelScale * (0.35 + hash(e, 2, env.params.seed) * 0.45));
          ctx.beginPath(); ctx.moveTo(point.x, point.y);
          ctx.quadraticCurveTo(point.x + point.nx * length * 0.5 + tangentX * sway, point.y + point.ny * length * 0.5 + tangentY * sway,
            point.x + point.nx * length, point.y + point.ny * length); ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  function clipPolygon(c, points) {
    c.beginPath(); c.moveTo(points[0].x, points[0].y);
    for (var i = 1; i < points.length; i++) c.lineTo(points[i].x, points[i].y);
    c.closePath(); c.clip();
  }

  function renderGlyphMutation(ctx, glyphs, width, height, pixelScale, L, fm, env) {
    var id = 'glyphMutation', active = activeGlyphs(env, glyphs, id);
    if (!active.length) return;
    var grammar = option(env, glyphs, id, 'mutationGrammar');
    var regions = number(env, glyphs, id, 'mutationRegions');
    var displace = number(env, glyphs, id, 'mutationDisplace') * pixelScale;
    var contrast = number(env, glyphs, id, 'mutationContrast');
    var seam = number(env, glyphs, id, 'mutationSeam') * pixelScale;
    var primary = env.color(id), secondary = env.params.accent, palette = richPalette(primary, secondary, env.params.paper);
    var mask = env.buildMask(glyphs, id, width, height, pixelScale, L, fm), maskImage = readMask(mask);
    drawMaterialMask(ctx, env, mask, primary, secondary, 'glyph-mutation-ground', {
      alpha: grammar === 'organ' ? 0.34 : 0.18, depth: Math.max(0.6, seam * 0.28), sheen: 0.34
    });
    for (var i = 0; i < active.length; i++) {
      var item = active[i], g = item.glyph, bounds = glyphBounds(g, pixelScale, L);
      var centerX = bounds.x + bounds.w * (0.45 + (hash(i, 91, env.params.seed) - 0.5) * 0.16 * contrast);
      var centerY = bounds.y + bounds.h * (0.5 + (hash(i, 97, env.params.seed) - 0.5) * 0.14 * contrast);
      var regionAngles = [];
      for (var region = 0; region < regions; region++) {
        var angle = (region / regions) * Math.PI * 2 + (hash(i, region, env.params.seed) - 0.5) * 0.46;
        regionAngles.push(angle);
        var direction = region % 2 ? 1 : -1;
        var shift = displace * item.strength * (0.18 + 0.82 * hash(region, i, env.params.seed + 7));
        var dx = Math.cos(angle) * shift * direction, dy = Math.sin(angle) * shift * direction;
        if (grammar === 'fault') { dx = direction * shift; dy = (hash(region, i, env.params.seed + 9) - 0.5) * shift * 0.28; }
        var mutation = shiftedGlyph(g, dx, dy, (hash(region, i, env.params.seed + 11) - 0.5) * contrast * (grammar === 'organ' ? 34 : 24), pixelScale, L);
        var swell = (hash(region, i, env.params.seed + 13) - 0.5) * contrast;
        mutation.scaleX *= 1 + swell * (grammar === 'organ' ? 0.34 : 0.16);
        mutation.scaleY *= 1 - swell * (grammar === 'organ' ? 0.18 : 0.1);
        ctx.save();
        if (grammar === 'sector') {
          var radius = Math.hypot(bounds.w, bounds.h) * (0.72 + contrast * 0.22);
          clipPolygon(ctx, [{ x: centerX, y: centerY }, { x: centerX + Math.cos(angle - Math.PI / regions * 1.18) * radius, y: centerY + Math.sin(angle - Math.PI / regions * 1.18) * radius }, { x: centerX + Math.cos(angle + Math.PI / regions * 1.18) * radius, y: centerY + Math.sin(angle + Math.PI / regions * 1.18) * radius }]);
        } else if (grammar === 'fault') {
          var band = bounds.h / regions, y0 = bounds.y + region * band;
          var faultTilt = bounds.w * (0.1 + contrast * 0.22) * (i % 2 ? -1 : 1);
          clipPolygon(ctx, [{ x: bounds.x - bounds.w * 0.35, y: y0 - faultTilt }, { x: bounds.x + bounds.w * 1.35, y: y0 + faultTilt }, { x: bounds.x + bounds.w * 1.35, y: y0 + band + faultTilt }, { x: bounds.x - bounds.w * 0.35, y: y0 + band - faultTilt }]);
        } else {
          var ox = bounds.x + bounds.w * (0.18 + 0.64 * hash(region, i, env.params.seed + 19));
          var oy = bounds.y + bounds.h * (0.16 + 0.68 * hash(i, region, env.params.seed + 23));
          ctx.beginPath(); ctx.ellipse(ox, oy, bounds.w * (0.18 + 0.2 * contrast), bounds.h * (0.13 + 0.18 * contrast), angle, 0, Math.PI * 2); ctx.clip();
        }
        var color = region % 4 === 0 ? palette.light : (region % 4 === 1 ? palette.accent : (region % 4 === 2 ? palette.base : palette.dark));
        var shadowMutation = shiftedGlyph(mutation, seam * 0.45, seam * 0.72, 0, pixelScale, L);
        env.drawGlyph(ctx, shadowMutation, pixelScale, L, fm, item.strength * (0.2 + contrast * 0.18), palette.deep);
        env.drawGlyph(ctx, mutation, pixelScale, L, fm, item.strength, color);
        var shineMutation = shiftedGlyph(mutation, -Math.max(0.35, seam * 0.18), -Math.max(0.35, seam * 0.24), 0, pixelScale, L);
        ctx.globalCompositeOperation = 'screen'; env.drawGlyph(ctx, shineMutation, pixelScale, L, fm, item.strength * (0.12 + contrast * 0.2), palette.pale);
        ctx.restore();
      }
      if (seam > 0.05) {
        ctx.save(); ctx.globalAlpha = item.strength * (0.35 + contrast * 0.58); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.shadowColor = rgbaColor(palette.deep, 0.42); ctx.shadowBlur = seam * 1.1; ctx.strokeStyle = palette.pale; ctx.lineWidth = seam;
        if (grammar === 'sector') {
          // The sector sutures are cut into the original glyph body. Drawing
          // them through the global paper reads as a starburst laid on top of
          // the letter, so build a local seam plate and mask it by real ink.
          var seamRadius = Math.hypot(bounds.w, bounds.h) * 0.72;
          var seamPlate = scratch(env, 'glyph-mutation-sector-seam', width, height, false), sc = seamPlate.ctx;
          sc.save(); sc.beginPath(); sc.rect(bounds.x - seam * 2, bounds.y - seam * 2, bounds.w + seam * 4, bounds.h + seam * 4); sc.clip();
          sc.lineCap = 'round'; sc.lineJoin = 'round';
          for (var s = 0; s < regions; s++) {
            var sa = regionAngles[s] - Math.PI / regions * 1.12;
            var endX = centerX + Math.cos(sa) * seamRadius, endY = centerY + Math.sin(sa) * seamRadius;
            var controlX = centerX + Math.cos(sa + (s % 2 ? -0.14 : 0.14)) * seamRadius * 0.52;
            var controlY = centerY + Math.sin(sa + (s % 2 ? -0.14 : 0.14)) * seamRadius * 0.52;
            sc.strokeStyle = rgbaColor(palette.deep, 0.72); sc.lineWidth = Math.max(0.7, seam * 1.85); sc.shadowColor = rgbaColor(palette.deep, 0.48); sc.shadowBlur = seam * 1.25;
            sc.beginPath(); sc.moveTo(centerX, centerY); sc.quadraticCurveTo(controlX, controlY, endX, endY); sc.stroke();
            sc.shadowColor = 'transparent'; sc.strokeStyle = s % 3 ? palette.pale : palette.hot; sc.lineWidth = Math.max(0.42, seam * 0.54);
            sc.beginPath(); sc.moveTo(centerX, centerY); sc.quadraticCurveTo(controlX, controlY, endX, endY); sc.stroke();
            for (var sectorStitch = 1; sectorStitch <= 3; sectorStitch++) {
              var st = 0.22 + sectorStitch * 0.19, sx = centerX + (endX - centerX) * st, sy = centerY + (endY - centerY) * st;
              var stitchHalf = seam * (1.1 + contrast * 0.9);
              sc.strokeStyle = sectorStitch % 2 ? palette.accent : palette.light; sc.lineWidth = Math.max(0.35, seam * 0.26);
              sc.beginPath(); sc.moveTo(sx - Math.sin(sa) * stitchHalf, sy + Math.cos(sa) * stitchHalf); sc.lineTo(sx + Math.sin(sa) * stitchHalf, sy - Math.cos(sa) * stitchHalf); sc.stroke();
            }
          }
          sc.fillStyle = palette.hot; sc.shadowColor = rgbaColor(palette.deep, 0.5); sc.shadowBlur = seam * 1.8; sc.beginPath(); sc.arc(centerX, centerY, seam * (1.5 + contrast * 1.5), 0, Math.PI * 2); sc.fill(); sc.restore();
          sc.globalCompositeOperation = 'destination-in'; sc.drawImage(mask, 0, 0); sc.globalCompositeOperation = 'source-over';
          ctx.save(); ctx.globalAlpha = item.strength * (0.76 + contrast * 0.2); ctx.drawImage(seamPlate.canvas, 0, 0); ctx.restore();

          var sectorEdges = boundarySamples(maskImage, width, height, bounds, Math.max(3, seam * 2.2), Math.min(56, regions * 8), env.params.seed + i * 173);
          for (var sectorNode = 0; sectorNode < regions && sectorEdges.length; sectorNode++) {
            var targetAngle = regionAngles[sectorNode] - Math.PI / regions * 1.12, best = sectorEdges[0], bestScore = -Infinity;
            for (var edgeIndex = 0; edgeIndex < sectorEdges.length; edgeIndex++) {
              var edge = sectorEdges[edgeIndex], edgeAngle = Math.atan2(edge.y - centerY, edge.x - centerX);
              var alignment = Math.cos(edgeAngle - targetAngle), edgeDistance = Math.hypot(edge.x - centerX, edge.y - centerY);
              var score = alignment * 2 + edgeDistance / Math.max(1, seamRadius);
              if (score > bestScore) { bestScore = score; best = edge; }
            }
            ctx.save(); ctx.translate(best.x, best.y); ctx.rotate(Math.atan2(best.ny, best.nx));
            ctx.globalAlpha = item.strength * (0.58 + contrast * 0.35); ctx.fillStyle = sectorNode % 3 ? palette.accent : palette.hot; ctx.strokeStyle = palette.pale; ctx.lineWidth = Math.max(0.35, seam * 0.24);
            ctx.shadowColor = rgbaColor(palette.deep, 0.45); ctx.shadowBlur = seam * 1.15; ctx.beginPath(); ctx.ellipse(0, 0, seam * (1.45 + contrast), seam * (0.72 + contrast * 0.36), 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
          }
        } else if (grammar === 'fault') {
          for (var f = 1; f < regions; f++) {
            var fy = bounds.y + bounds.h * f / regions, lean = bounds.w * (0.1 + contrast * 0.22) * (i % 2 ? -1 : 1);
            ctx.beginPath(); ctx.moveTo(bounds.x, fy - lean); ctx.bezierCurveTo(bounds.x + bounds.w * 0.28, fy + lean * 0.1, bounds.x + bounds.w * 0.68, fy - lean * 0.1, bounds.x + bounds.w, fy + lean); ctx.stroke();
            for (var stitch = 1; stitch < 5; stitch++) {
              var sx = bounds.x + bounds.w * stitch / 5, sy = fy - lean + (lean * 2) * stitch / 5;
              ctx.lineWidth = Math.max(0.45, seam * 0.22); ctx.beginPath(); ctx.moveTo(sx - seam * 2, sy - seam * 1.5); ctx.lineTo(sx + seam * 2, sy + seam * 1.5); ctx.stroke();
            }
            ctx.lineWidth = seam;
          }
        } else {
          var edgePoints = boundarySamples(maskImage, width, height, bounds, Math.max(4, seam * 3), Math.min(30, regions * 3), env.params.seed + i * 31);
          for (var ep = 0; ep < edgePoints.length; ep++) {
            var node = edgePoints[ep], nodeRadius = seam * (0.7 + hash(ep, i, env.params.seed) * 1.5);
            ctx.fillStyle = ep % 3 ? palette.accent : palette.hot; ctx.beginPath(); ctx.ellipse(node.x, node.y, nodeRadius * 1.45, nodeRadius, Math.atan2(node.ny, node.nx), 0, Math.PI * 2); ctx.fill();
            if (ep > 0 && ep % 2) { var previous = edgePoints[ep - 1]; ctx.lineWidth = Math.max(0.4, seam * 0.34); ctx.beginPath(); ctx.moveTo(previous.x, previous.y); ctx.quadraticCurveTo(centerX, centerY, node.x, node.y); ctx.stroke(); }
          }
        }
        ctx.restore();
      }
    }
  }

  function suspensionMass(box, strength, typeSize) {
    var reference = Math.max(1, typeSize * typeSize * 54);
    return Math.max(0.08, Number(strength) || 0) * (0.68 + Math.min(1.65, Math.sqrt(Math.max(1, box.w * box.h) / reference)));
  }

  // A loaded cable with fixed end supports can be described by constant
  // horizontal force and slope jumps at each point load.  Solving the one
  // remaining end-height constraint gives a deterministic funicular polygon;
  // scaling it to the requested sag preserves every equilibrium relation.
  function solveSuspensionCable(xs, loads, left, right, supportY, sag) {
    var count = Math.min(xs.length, loads.length), span = Math.max(0.001, right - left);
    if (!count) return { points: [{ x: left, y: supportY }, { x: right, y: supportY }], slopes: [0], loads: [], scale: 0 };
    var positions = [left], weights = [];
    for (var i = 0; i < count; i++) {
      var x = clamp(xs[i], left + span * 0.00001, right - span * 0.00001);
      if (x <= positions[positions.length - 1]) x = positions[positions.length - 1] + span * 0.00001;
      positions.push(Math.min(x, right - span * 0.00001));
      weights.push(Math.max(0.0001, Number(loads[i]) || 0.0001));
    }
    positions.push(right);
    var cumulative = 0, drift = 0;
    for (var segment = 0; segment < positions.length - 1; segment++) {
      if (segment > 0) cumulative += weights[segment - 1];
      drift += cumulative * (positions[segment + 1] - positions[segment]);
    }
    var initialSlope = -drift / span, rawY = [0], rawSlopes = [], slope = initialSlope;
    for (var s = 0; s < positions.length - 1; s++) {
      if (s > 0) slope += weights[s - 1];
      rawSlopes.push(slope);
      rawY.push(rawY[rawY.length - 1] + slope * (positions[s + 1] - positions[s]));
    }
    var depth = Math.max.apply(Math, rawY.map(function (value) { return -value; }));
    var scale = depth > 0.000001 ? Math.max(0, sag) / depth : 0;
    return {
      points: positions.map(function (x, index) { return { x: x, y: supportY - rawY[index] * scale }; }),
      slopes: rawSlopes.map(function (value) { return -value * scale; }),
      loads: weights.map(function (value) { return value * scale; }),
      scale: scale
    };
  }

  function cablePointAt(solution, x) {
    var points = solution.points;
    if (!points.length) return { x: x, y: 0, slope: 0 };
    if (x <= points[0].x) return { x: x, y: points[0].y, slope: solution.slopes[0] || 0 };
    for (var i = 0; i < points.length - 1; i++) {
      if (x > points[i + 1].x) continue;
      var span = Math.max(0.000001, points[i + 1].x - points[i].x), t = (x - points[i].x) / span;
      return { x: x, y: points[i].y + (points[i + 1].y - points[i].y) * t, slope: solution.slopes[i] || 0 };
    }
    return { x: x, y: points[points.length - 1].y, slope: solution.slopes[solution.slopes.length - 1] || 0 };
  }

  // Simply-supported beam statics: reactions and bending moment are exact for
  // the supplied point loads.  The displayed chord deflection integrates the
  // piecewise-linear moment twice, then normalizes only its amplitude.
  function solveSuspensionBeam(xs, loads, left, right, targetSag) {
    var count = Math.min(xs.length, loads.length), span = Math.max(0.001, right - left), total = 0, rightMoment = 0;
    for (var i = 0; i < count; i++) {
      loads[i] = Math.max(0.0001, Number(loads[i]) || 0.0001);
      total += loads[i]; rightMoment += loads[i] * (xs[i] - left);
    }
    var reactionRight = rightMoment / span, reactionLeft = total - reactionRight;
    var positions = [left].concat(xs.map(function (x) { return clamp(x, left, right); })).concat([right]);
    positions.sort(function (a, b) { return a - b; });
    var unique = [];
    for (var p = 0; p < positions.length; p++) if (!unique.length || positions[p] - unique[unique.length - 1] > span * 0.000001) unique.push(positions[p]);
    if (right - unique[unique.length - 1] > span * 0.000001) unique.push(right); else unique[unique.length - 1] = right;
    function momentAt(x) {
      var moment = reactionLeft * (x - left);
      for (var j = 0; j < count; j++) if (xs[j] < x) moment -= loads[j] * (x - xs[j]);
      return moment;
    }
    function shearAt(x) {
      var shear = reactionLeft;
      for (var j = 0; j < count; j++) if (xs[j] <= x) shear -= loads[j];
      return shear;
    }
    var raw = [0], slope = 0;
    for (var u = 0; u < unique.length - 1; u++) {
      var dx = unique[u + 1] - unique[u], m0 = momentAt(unique[u]), m1 = momentAt(unique[u + 1]);
      raw.push(raw[raw.length - 1] + slope * dx + m0 * dx * dx * 0.5 + (m1 - m0) * dx * dx / 6);
      slope += (m0 + m1) * dx * 0.5;
    }
    var endDrift = raw[raw.length - 1], adjusted = raw.map(function (value, index) { return value - endDrift * (unique[index] - left) / span; });
    var signedAverage = adjusted.slice(1, -1).reduce(function (sum, value) { return sum + value; }, 0);
    var direction = signedAverage < 0 ? -1 : 1;
    var peak = Math.max.apply(Math, adjusted.map(function (value) { return Math.abs(value); }));
    var scale = peak > 0.000001 ? Math.max(0, targetSag) / peak : 0;
    return {
      points: unique.map(function (x, index) { return { x: x, y: adjusted[index] * direction * scale }; }),
      reactionLeft: reactionLeft, reactionRight: reactionRight,
      momentAt: momentAt, shearAt: shearAt
    };
  }

  function beamDeflectionAt(solution, x) {
    var points = solution.points;
    if (!points.length || x <= points[0].x) return points.length ? points[0].y : 0;
    for (var i = 0; i < points.length - 1; i++) {
      if (x > points[i + 1].x) continue;
      var t = (x - points[i].x) / Math.max(0.000001, points[i + 1].x - points[i].x);
      return points[i].y + (points[i + 1].y - points[i].y) * t;
    }
    return points[points.length - 1].y;
  }

  function buildSuspensionMobile(leaves) {
    function build(start, end) {
      if (end - start === 1) return { leaf: leaves[start], weight: leaves[start].weight, x: leaves[start].x, start: start, end: end };
      var total = 0;
      for (var i = start; i < end; i++) total += leaves[i].weight;
      var running = 0, split = start + 1, best = Infinity;
      for (var s = start + 1; s < end; s++) {
        running += leaves[s - 1].weight;
        var delta = Math.abs(total * 0.5 - running);
        if (delta < best) { best = delta; split = s; }
      }
      var left = build(start, split), right = build(split, end), weight = left.weight + right.weight;
      return { left: left, right: right, weight: weight, x: (left.x * left.weight + right.x * right.weight) / weight, start: start, end: end };
    }
    return leaves.length ? build(0, leaves.length) : null;
  }

  function suspensionMobileDepth(node) {
    return !node || node.leaf ? 0 : 1 + Math.max(suspensionMobileDepth(node.left), suspensionMobileDepth(node.right));
  }

  function drawSuspensionMember(ctx, a, b, width, palette, alpha, accent) {
    ctx.save(); ctx.lineCap = 'square'; ctx.lineJoin = 'miter'; ctx.globalAlpha = alpha;
    ctx.strokeStyle = palette.deep; ctx.lineWidth = Math.max(0.9, width * 1.2);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.strokeStyle = accent ? palette.accent : palette.base; ctx.lineWidth = Math.max(0.42, width * 0.42);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.restore();
  }

  function drawSuspensionCable(ctx, points, width, palette, alpha) {
    if (points.length < 2) return;
    function trace(offsetY) {
      ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y + offsetY);
      for (var i = 1; i < points.length - 1; i++) {
        var midX = (points[i].x + points[i + 1].x) * 0.5, midY = (points[i].y + points[i + 1].y) * 0.5 + offsetY;
        ctx.quadraticCurveTo(points[i].x, points[i].y + offsetY, midX, midY);
      }
      ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y + offsetY);
    }
    ctx.save(); ctx.lineCap = 'square'; ctx.lineJoin = 'miter'; ctx.globalAlpha = alpha;
    ctx.strokeStyle = palette.deep; ctx.lineWidth = Math.max(1.05, width * 1.24); trace(0); ctx.stroke();
    ctx.strokeStyle = palette.accent; ctx.lineWidth = Math.max(0.4, width * 0.34); trace(0); ctx.stroke(); ctx.restore();
  }

  function drawSuspensionPlate(ctx, point, size, palette, alpha, accent, angle) {
    size = Math.max(1.6, size * 0.42);
    ctx.save(); ctx.translate(point.x, point.y); ctx.rotate(angle || 0); ctx.globalAlpha = alpha;
    ctx.fillStyle = accent ? palette.accent : palette.deep;
    ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size, 0); ctx.lineTo(0, size); ctx.lineTo(-size, 0); ctx.closePath(); ctx.fill();
    if (accent) { ctx.fillStyle = palette.hot; ctx.globalAlpha = alpha * 0.8; ctx.fillRect(-size * 0.16, -size * 0.16, size * 0.32, size * 0.32); }
    ctx.restore();
  }

  function clipSuspensionHalfPlane(ctx, a, b, side, offset, width, height) {
    var dx = b.x - a.x, dy = b.y - a.y, length = Math.max(0.0001, Math.hypot(dx, dy));
    var tx = dx / length, ty = dy / length, nx = -ty, ny = tx;
    var extent = Math.hypot(width, height) * 2 + 128;
    var ax = a.x + nx * offset, ay = a.y + ny * offset, bx = b.x + nx * offset, by = b.y + ny * offset;
    ctx.beginPath();
    ctx.moveTo(ax - tx * extent, ay - ty * extent);
    ctx.lineTo(bx + tx * extent, by + ty * extent);
    ctx.lineTo(bx + tx * extent + nx * side * extent * 2, by + ty * extent + ny * side * extent * 2);
    ctx.lineTo(ax - tx * extent + nx * side * extent * 2, ay - ty * extent + ny * side * extent * 2);
    ctx.closePath(); ctx.clip();
  }

  function drawSuspensionBodies(ctx, env, entries, width, height, pixelScale, L, fm, cable, palette, grammar) {
    if (!entries.length) return;
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i], mask = scratch(env, 'suspension-cut-mask', width, height, false);
      env.drawGlyph(mask.ctx, entry.glyph, pixelScale, L, fm, entry.item.strength, '#ffffff');
      var face = tintMask(env, mask.canvas, palette.deep, 'suspension-cut-face');
      var box = suspensionGlyphBounds(entry.glyph, pixelScale, L, !!(env.params && env.params.vertical));
      var cutA = entry.cutA || { x: box.x - 2, y: box.y + box.h * 0.38 };
      var cutB = entry.cutB || { x: box.x + box.w + 2, y: box.y + box.h * 0.38 };
      var dx = cutB.x - cutA.x, dy = cutB.y - cutA.y, length = Math.max(0.0001, Math.hypot(dx, dy));
      var nx = -dy / length, ny = dx / length;
      var split = clamp(Number(entry.split) || 0, 0, Math.max(box.w, box.h) * 0.44);
      var gap = Math.max(1.2 * pixelScale, Math.min(cable * 0.72, Math.min(box.w, box.h) * 0.042));

      var upperPiece = scratch(env, 'suspension-cut-upper', width, height, false);
      upperPiece.ctx.save(); clipSuspensionHalfPlane(upperPiece.ctx, cutA, cutB, -1, -gap * 0.5, width, height);
      upperPiece.ctx.drawImage(face, 0, 0); upperPiece.ctx.restore();
      var lowerPiece = scratch(env, 'suspension-cut-lower', width, height, false);
      lowerPiece.ctx.save(); clipSuspensionHalfPlane(lowerPiece.ctx, cutA, cutB, 1, gap * 0.5, width, height);
      lowerPiece.ctx.drawImage(face, 0, 0); lowerPiece.ctx.restore();
      ctx.drawImage(upperPiece.canvas, -nx * split * 0.12, -ny * split * 0.12);
      ctx.drawImage(lowerPiece.canvas, nx * split, ny * split);

      if (entry.accent) {
        ctx.save(); ctx.globalAlpha = 0.9; ctx.strokeStyle = palette.accent; ctx.lineCap = 'square';
        ctx.lineWidth = Math.max(1.1 * pixelScale, cable * 0.42);
        var seam = scratch(env, 'suspension-cut-seam', width, height, false);
        seam.ctx.strokeStyle = palette.accent; seam.ctx.lineWidth = Math.max(1.1 * pixelScale, cable * 0.42); seam.ctx.lineCap = 'square';
        seam.ctx.beginPath(); seam.ctx.moveTo(cutA.x, cutA.y); seam.ctx.lineTo(cutB.x, cutB.y); seam.ctx.stroke();
        seam.ctx.globalCompositeOperation = 'destination-in'; seam.ctx.drawImage(mask.canvas, 0, 0); seam.ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(seam.canvas, 0, 0); ctx.restore();
      }
    }
  }

  function suspensionStressIndex(values) {
    var index = 0;
    for (var i = 1; i < values.length; i++) if (values[i] > values[index]) index = i;
    return index;
  }

  function suspensionQuadratic(a, b, c, t) {
    var u = 1 - t;
    return { x: u * u * a.x + 2 * u * t * b.x + t * t * c.x, y: u * u * a.y + 2 * u * t * b.y + t * t * c.y };
  }

  function suspensionQuadraticTangent(a, b, c, t) {
    return { x: 2 * (1 - t) * (b.x - a.x) + 2 * t * (c.x - b.x), y: 2 * (1 - t) * (b.y - a.y) + 2 * t * (c.y - b.y) };
  }

  function suspensionTransformedGlyph(g, targetX, targetY, scale, rotation, pixelScale, L) {
    var copy = Object.assign({}, g);
    copy.scaleX = (g.scaleX == null ? 1 : g.scaleX) * scale;
    copy.scaleY = (g.scaleY == null ? 1 : g.scaleY) * scale;
    copy.rot = (g.rot || 0) + rotation;
    var center = pointOnGlyph(copy, 0.5, 0.5, pixelScale, L);
    var unit = Math.max(0.000001, pixelScale * L.s);
    copy.tx = (copy.tx || 0) + (targetX - center.x) / unit;
    copy.ty = (copy.ty || 0) + (targetY - center.y) / unit;
    return copy;
  }

  function renderSuspendedSyntaxInstallation(ctx, active, width, height, pixelScale, L, fm, env, drop, tension, cable, typeSize, palette) {
    var rows = Object.create(null), placements = [], paths = [];
    for (var activeIndex = 0; activeIndex < active.length; activeIndex++) {
      if (!String(active[activeIndex].glyph.ch || '').trim()) continue;
      var lineKey = active[activeIndex].glyph.line || 0;
      (rows[lineKey] || (rows[lineKey] = [])).push(active[activeIndex]);
    }
    var keys = Object.keys(rows).sort(function (a, b) { return Number(a) - Number(b); });
    var sourceBoxes = active.filter(function (item) { return String(item.glyph.ch || '').trim(); }).map(function (item) { return glyphBounds(item.glyph, pixelScale, L); });
    if (!sourceBoxes.length) return;
    var sourceLeft = Math.min.apply(Math, sourceBoxes.map(function (box) { return box.x; }));
    var sourceRight = Math.max.apply(Math, sourceBoxes.map(function (box) { return box.x + box.w; }));
    var sourceTop = Math.min.apply(Math, sourceBoxes.map(function (box) { return box.y; }));
    var sourceBottom = Math.max.apply(Math, sourceBoxes.map(function (box) { return box.y + box.h; }));
    var fontPad = (Number(env.params && env.params.fontSize) || 52) * pixelScale * L.s * 0.1;
    var ownPad = drop * 0.8 + typeSize * 1.8 + cable * 6 + fontPad;
    var frame = {
      x: sourceLeft - ownPad,
      y: sourceTop - ownPad,
      w: Math.max(1, sourceRight - sourceLeft + ownPad * 2),
      h: Math.max(1, sourceBottom - sourceTop + ownPad * 2)
    };
    var looseness = 1 / (0.74 + tension * 0.34), dropScale = clamp(drop / frame.h, 0, 0.55);
    for (var keyIndex = 0; keyIndex < keys.length; keyIndex++) {
      var key = keys[keyIndex], row = rows[key].sort(function (a, b) { return a.glyph.x - b.glyph.x; });
      var band = keys.length === 1 ? 0.5 : keyIndex / Math.max(1, keys.length - 1);
      var pathSpec;
      if (keyIndex % 2 === 0) pathSpec = {
        a: { x: frame.x - frame.w * 0.1, y: frame.y + frame.h * (0.29 + band * 0.22) },
        b: { x: frame.x + frame.w * 0.48, y: frame.y + frame.h * (0.1 + band * 0.19) - drop * 0.12 },
        c: { x: frame.x + frame.w * 1.12, y: frame.y + frame.h * (0.58 + band * 0.1) + drop * 0.08 }
      };
      else pathSpec = {
        a: { x: frame.x + frame.w * 0.06, y: frame.y + frame.h * (0.91 - band * 0.09) + drop * 0.08 },
        b: { x: frame.x + frame.w * 0.47, y: frame.y + frame.h * (0.35 + band * 0.04) - drop * 0.16 },
        c: { x: frame.x + frame.w * 1.1, y: frame.y + frame.h * (0.29 + band * 0.15) }
      };
      pathSpec.strength = clamp(row.reduce(function (sum, item) { return sum + item.strength; }, 0) / Math.max(1, row.length), 0, 1);
      paths.push(pathSpec);
      var leaves = [];
      for (var itemIndex = 0; itemIndex < row.length; itemIndex++) {
        var item = row[itemIndex], t = row.length === 1 ? 0.5 : itemIndex / (row.length - 1);
        t = 0.045 + 0.91 * Math.pow(t, keyIndex % 2 ? 0.86 : 1.12);
        var point = suspensionQuadratic(pathSpec.a, pathSpec.b, pathSpec.c, t);
        var tangent = suspensionQuadraticTangent(pathSpec.a, pathSpec.b, pathSpec.c, t);
        var tangentLength = Math.max(1, Math.hypot(tangent.x, tangent.y)), nx = -tangent.y / tangentLength, ny = tangent.x / tangentLength;
        var focusCenter = keyIndex % 2 ? 0.48 : 0.57;
        var focus = Math.exp(-Math.pow((t - focusCenter) / (0.19 + dropScale * 0.1), 2));
        var depth = (itemIndex * 5 + keyIndex * 2 + Math.floor(hash(itemIndex, keyIndex, env.params.seed + 401) * 3)) % 3;
        var variance = hash(itemIndex, keyIndex, env.params.seed + 419) - 0.5;
        var normalOffset = variance * (typeSize * 2.2 + drop * (0.12 + focus * 0.16)) * looseness + (keyIndex % 2 ? -typeSize * 1.05 : typeSize * 0.9);
        var scale = clamp((0.48 + focus * 0.54 + depth * 0.13) * (0.93 + hash(itemIndex, keyIndex, env.params.seed + 431) * 0.14), 0.44, 1.23);
        var angle = Math.atan2(tangent.y, tangent.x) * 180 / Math.PI * 0.24 + variance * 28 * looseness;
        var centerX = point.x + nx * normalOffset, centerY = point.y + ny * normalOffset + (depth - 1) * typeSize * 0.72;
        var transformed = suspensionTransformedGlyph(item.glyph, centerX, centerY, scale, angle, pixelScale, L);
        var mass = suspensionMass(glyphBounds(transformed, pixelScale, L), item.strength, typeSize);
        var placement = { item: item, glyph: transformed, point: point, x: centerX, y: centerY, nx: nx, ny: ny, depth: depth, focus: focus, mass: mass, index: itemIndex, line: keyIndex };
        placements.push(placement); leaves.push({ x: centerX, weight: mass, placement: placement });
      }
      var mobile = buildSuspensionMobile(leaves.sort(function (a, b) { return a.x - b.x; }));
      if (mobile) pathSpec.balanceX = mobile.x;
    }

    ctx.save(); ctx.beginPath(); ctx.rect(frame.x, frame.y, frame.w, frame.h); ctx.clip(); ctx.lineCap = 'square'; ctx.lineJoin = 'miter';
    for (var pathIndex = 0; pathIndex < paths.length; pathIndex++) {
      var path = paths[pathIndex];
      ctx.strokeStyle = palette.deep; ctx.globalAlpha = 0.26 * path.strength; ctx.lineWidth = Math.max(0.55, cable * 0.34);
      ctx.beginPath(); ctx.moveTo(path.a.x, path.a.y); ctx.quadraticCurveTo(path.b.x, path.b.y, path.c.x, path.c.y); ctx.stroke();
      if (path.balanceX != null) {
        var balanceT = clamp((path.balanceX - frame.x) / frame.w, 0.08, 0.92), balancePoint = suspensionQuadratic(path.a, path.b, path.c, balanceT);
        drawSuspensionMember(ctx, { x: balancePoint.x - typeSize * 1.7, y: balancePoint.y }, { x: balancePoint.x + typeSize * 1.7, y: balancePoint.y }, cable * 0.46, palette, 0.5 * path.strength, false);
      }
    }
    for (var tetherIndex = 0; tetherIndex < placements.length; tetherIndex++) {
      var tether = placements[tetherIndex], tetherEnd = { x: tether.x - tether.nx * typeSize * 0.42, y: tether.y - tether.ny * typeSize * 0.42 };
      drawSuspensionMember(ctx, tether.point, tetherEnd, cable * (0.18 + tether.depth * 0.06), palette, tether.item.strength * (0.18 + tether.depth * 0.12), false);
    }
    placements.sort(function (a, b) { return a.depth - b.depth || a.focus - b.focus; });
    for (var placementIndex = 0; placementIndex < placements.length; placementIndex++) {
      var placement = placements[placementIndex];
      var tone = placement.depth === 0 ? palette.light : (placement.depth === 1 ? palette.base : palette.deep);
      var placementAlpha = (0.48 + placement.depth * 0.24) * placement.item.strength;
      env.drawGlyph(ctx, placement.glyph, pixelScale, L, fm, placementAlpha, tone);
    }
    var knot = placements[0];
    for (var knotIndex = 1; knotIndex < placements.length; knotIndex++) {
      if (placements[knotIndex].focus * (placements[knotIndex].depth + 1) > knot.focus * (knot.depth + 1)) knot = placements[knotIndex];
    }
    if (knot) drawSuspensionPlate(ctx, knot.point, cable * 5.8, palette, knot.item.strength, true, Math.PI * 0.25);
    ctx.restore();
  }

  // Tension Cut keeps the proven statics helpers, but makes their load paths
  // pass through the glyph bodies.  The cable or beam is therefore visible in
  // the cut itself; a single maximum-load fragment carries the spot colour.
  function renderSuspendedSyntaxTasteVertical(ctx, active, width, height, pixelScale, L, fm, env, grammar, drop, tension, cable, typeSize, palette) {
    var columns = Object.create(null), deferredGlyphs = [];
    for (var activeIndex = 0; activeIndex < active.length; activeIndex++) {
      var lineKey = active[activeIndex].glyph.line || 0;
      (columns[lineKey] || (columns[lineKey] = [])).push(active[activeIndex]);
    }
    Object.keys(columns).sort(function (a, b) { return Number(a) - Number(b); }).forEach(function (columnKey) {
      var column = columns[columnKey].sort(function (a, b) { return a.glyph.y - b.glyph.y; }).filter(function (item) { return String(item.glyph.ch || '').trim(); });
      if (!column.length) return;
      var boxes = column.map(function (item) { return suspensionGlyphBounds(item.glyph, pixelScale, L, true); });
      var top = Math.min.apply(Math, boxes.map(function (box) { return box.y; }));
      var bottom = Math.max.apply(Math, boxes.map(function (box) { return box.y + box.h; }));
      var left = Math.min.apply(Math, boxes.map(function (box) { return box.x; }));
      var averageWidth = boxes.reduce(function (sum, box) { return sum + box.w; }, 0) / boxes.length;
      var centersY = boxes.map(function (box) { return box.y + box.h * 0.5; });
      var masses = boxes.map(function (box, index) { return suspensionMass(box, column[index].strength, typeSize); });
      var stressIndex = suspensionStressIndex(masses);
      var spanPad = Math.max(typeSize * 1.45, cable * 5.2), supportTop = top - spanPad, supportBottom = bottom + spanPad;
      var columnAlpha = clamp(column.reduce(function (sum, item) { return sum + item.strength; }, 0) / column.length, 0, 1);
      var columnNumber = Number(columnKey) || 0;
      ctx.save(); ctx.lineCap = 'square'; ctx.lineJoin = 'miter';

      if (grammar === 'catenary') {
        var cableX = left + averageWidth * 0.31 - drop * (columnNumber % 2 ? 0.035 : 0.072);
        var lateralSag = Math.min(drop * 0.56, drop * (0.34 + Math.min(0.11, columnNumber * 0.05)) / (0.68 + tension * 0.6));
        var verticalCable = solveSuspensionCable(centersY, masses, supportTop, supportBottom, cableX, lateralSag);
        var cableStressIndex = 0, cableStressDepth = -Infinity;
        for (var cableStressScan = 0; cableStressScan < centersY.length; cableStressScan++) {
          var cableStressPoint = cablePointAt(verticalCable, centersY[cableStressScan]);
          if (cableStressPoint.y > cableStressDepth) { cableStressDepth = cableStressPoint.y; cableStressIndex = cableStressScan; }
        }
        var verticalPoints = verticalCable.points.map(function (point) { return { x: point.y, y: point.x }; });
        drawSuspensionCable(ctx, verticalPoints, cable * 1.56, palette, columnAlpha);
        drawSuspensionMember(ctx, { x: cableX - typeSize * 0.48, y: supportTop }, { x: cableX + typeSize * 0.48, y: supportTop }, cable * 1.08, palette, columnAlpha, false);
        drawSuspensionMember(ctx, { x: cableX - typeSize * 0.48, y: supportBottom }, { x: cableX + typeSize * 0.48, y: supportBottom }, cable * 1.08, palette, columnAlpha, false);
        for (var cableIndex = 0; cableIndex < column.length; cableIndex++) {
          var cableItem = column[cableIndex], solvedNode = cablePointAt(verticalCable, centersY[cableIndex]);
          var cableNode = { x: solvedNode.y, y: solvedNode.x };
          var originalCut = suspensionPointOnGlyph(cableItem.glyph, 0.37, 0.5, pixelScale, L, true);
          var cableGlyph = shiftedGlyph(cableItem.glyph, cableNode.x - originalCut.x, 0, clamp(-(solvedNode.slope || 0) * 4, -4, 4), pixelScale, L);
          var cutA = suspensionPointOnGlyph(cableGlyph, 0.37, 0.02, pixelScale, L, true), cutB = suspensionPointOnGlyph(cableGlyph, 0.37, 0.98, pixelScale, L, true);
          var cableLoadRatio = Math.pow(Math.max(0, 1 - Math.abs(cableIndex - cableStressIndex) / Math.max(1, column.length * 0.5)), 2.4);
          deferredGlyphs.push({ item: cableItem, glyph: cableGlyph, cutA: cutA, cutB: cutB,
            split: cable * 0.28 + drop * (0.006 + cableLoadRatio * 0.24) / (0.88 + tension * 0.2), accent: cableIndex === cableStressIndex });
          if (cableIndex === cableStressIndex) drawSuspensionPlate(ctx, cableNode, cable * 5.2, palette, cableItem.strength, true, Math.PI * 0.5);
        }
      } else if (grammar === 'gantry') {
        var beamX = left + averageWidth * 0.42 - drop * 0.035;
        var verticalBeam = solveSuspensionBeam(centersY, masses.slice(), supportTop, supportBottom, drop * 0.22 / (0.7 + tension * 0.52));
        var beamSpine = verticalBeam.points.map(function (point) { return { x: beamX + point.y, y: point.x }; });
        for (var spineIndex = 0; spineIndex < beamSpine.length - 1; spineIndex++) {
          drawSuspensionMember(ctx, beamSpine[spineIndex], beamSpine[spineIndex + 1], cable * 1.42, palette, columnAlpha, false);
          if (spineIndex % 2 === 0) {
            var sideX = beamX + (spineIndex % 4 ? -1 : 1) * averageWidth * 0.34;
            drawSuspensionMember(ctx, beamSpine[spineIndex], { x: sideX, y: beamSpine[spineIndex + 1].y }, cable * 0.56, palette, columnAlpha * 0.62, false);
          }
        }
        var gantryStressIndex = 0, gantryMaxMoment = 0, previousCutEnd = null;
        for (var gantryStressScan = 0; gantryStressScan < centersY.length; gantryStressScan++) {
          var gantryMoment = Math.abs(verticalBeam.momentAt(centersY[gantryStressScan]));
          if (gantryMoment > gantryMaxMoment) { gantryMaxMoment = gantryMoment; gantryStressIndex = gantryStressScan; }
        }
        gantryMaxMoment = Math.max(0.0001, gantryMaxMoment);
        for (var gantryIndex = 0; gantryIndex < column.length; gantryIndex++) {
          var gantryItem = column[gantryIndex], gantryNode = { x: beamX + beamDeflectionAt(verticalBeam, centersY[gantryIndex]), y: centersY[gantryIndex] };
          var gantryCut = suspensionPointOnGlyph(gantryItem.glyph, 0.43, 0.5, pixelScale, L, true);
          var gantryGlyph = shiftedGlyph(gantryItem.glyph, gantryNode.x - gantryCut.x, 0, 0, pixelScale, L);
          var gantryA = suspensionPointOnGlyph(gantryGlyph, gantryIndex % 2 ? 0.63 : 0.33, 0.02, pixelScale, L, true);
          var gantryB = suspensionPointOnGlyph(gantryGlyph, gantryIndex % 2 ? 0.33 : 0.63, 0.98, pixelScale, L, true);
          var gantryRatio = Math.abs(verticalBeam.momentAt(centersY[gantryIndex])) / gantryMaxMoment;
          if (previousCutEnd) drawSuspensionMember(ctx, previousCutEnd, gantryA, cable * 0.42, palette, columnAlpha * 0.66, false);
          drawSuspensionMember(ctx, gantryA, gantryB, cable * (0.42 + gantryRatio * 0.26), palette, columnAlpha * 0.72, gantryIndex === gantryStressIndex);
          previousCutEnd = gantryB;
          deferredGlyphs.push({ item: gantryItem, glyph: gantryGlyph, cutA: gantryA, cutB: gantryB,
            split: cable * 0.28 + drop * (0.008 + gantryRatio * 0.12) / (0.86 + tension * 0.2), accent: gantryIndex === gantryStressIndex });
          if (gantryIndex === gantryStressIndex) drawSuspensionPlate(ctx, gantryNode, cable * 5, palette, gantryItem.strength, true, Math.PI * 0.5);
        }
      } else {
        var trunkX = left + averageWidth * 0.22 - drop * 0.045;
        var previousPivot = { x: trunkX + averageWidth * 0.38, y: supportTop - typeSize * 0.7 };
        for (var mobileIndex = 0; mobileIndex < column.length; mobileIndex++) {
          var mobileItem = column[mobileIndex], mobileVariance = hash(mobileIndex, columnNumber, env.params.seed + 347);
          var barY = centersY[mobileIndex] + (mobileVariance - 0.5) * typeSize * 0.72;
          var pivotX = trunkX + (mobileIndex % 2 ? averageWidth * 0.22 : -averageWidth * 0.08);
          var mobileCut = suspensionPointOnGlyph(mobileItem.glyph, 0.5, 0.36, pixelScale, L, true);
          var mobileGlyph = shiftedGlyph(mobileItem.glyph, (mobileVariance - 0.5) * drop * 0.055, barY - mobileCut.y,
            clamp((mobileVariance - 0.5) * 9, -6, 6), pixelScale, L);
          var mobileA = suspensionPointOnGlyph(mobileGlyph, 0.02, 0.36, pixelScale, L, true), mobileB = suspensionPointOnGlyph(mobileGlyph, 0.98, 0.36, pixelScale, L, true);
          var pivot = { x: pivotX, y: (mobileA.y + mobileB.y) * 0.5 };
          drawSuspensionMember(ctx, previousPivot, pivot, cable * 0.48, palette, columnAlpha * 0.52, false);
          drawSuspensionMember(ctx, { x: Math.min(pivot.x, mobileA.x - typeSize * 0.28), y: mobileA.y }, { x: mobileB.x + typeSize * 0.32, y: mobileB.y },
            cable * (0.9 + masses[mobileIndex] * 0.08), palette, columnAlpha, mobileIndex === stressIndex);
          deferredGlyphs.push({ item: mobileItem, glyph: mobileGlyph, cutA: mobileA, cutB: mobileB,
            split: cable * 0.32 + drop * (0.014 + (mobileIndex === stressIndex ? 0.085 : 0.028)) / (0.86 + tension * 0.2), accent: mobileIndex === stressIndex });
          if (mobileIndex === stressIndex) drawSuspensionPlate(ctx, pivot, cable * 5.2, palette, columnAlpha, true, 0);
          previousPivot = pivot;
        }
      }
      ctx.restore();
    });
    drawSuspensionBodies(ctx, env, deferredGlyphs, width, height, pixelScale, L, fm, cable, palette, grammar);
  }

  function renderSuspendedSyntaxTaste(ctx, glyphs, width, height, pixelScale, L, fm, env) {
    var id = 'suspendedSyntax', active = activeGlyphs(env, glyphs, id);
    if (!active.length) return;
    var grammar = option(env, glyphs, id, 'suspensionGrammar');
    var drop = number(env, glyphs, id, 'suspensionDrop') * pixelScale;
    var tension = number(env, glyphs, id, 'suspensionTension');
    var cable = number(env, glyphs, id, 'suspensionCable') * pixelScale;
    var typeSize = number(env, glyphs, id, 'suspensionTypeSize') * pixelScale;
    var primary = env.color(id), palette = richPalette(primary, env.params.accent, env.params.paper);
    if (env.params && env.params.vertical) {
      renderSuspendedSyntaxTasteVertical(ctx, active, width, height, pixelScale, L, fm, env, grammar, drop, tension, cable, typeSize, palette);
      return;
    }
    if (grammar === 'mobile') {
      renderSuspendedSyntaxInstallation(ctx, active, width, height, pixelScale, L, fm, env, drop, tension, cable, typeSize, palette);
      return;
    }
    var rows = Object.create(null), deferredGlyphs = [];
    for (var i = 0; i < active.length; i++) (rows[active[i].glyph.line || 0] || (rows[active[i].glyph.line || 0] = [])).push(active[i]);
    Object.keys(rows).sort(function (a, b) { return Number(a) - Number(b); }).forEach(function (rowKey) {
      var row = rows[rowKey].sort(function (a, b) { return a.glyph.x - b.glyph.x; }).filter(function (item) { return String(item.glyph.ch || '').trim(); });
      if (!row.length) return;
      var boxes = row.map(function (item) { return glyphBounds(item.glyph, pixelScale, L); });
      var left = Math.min.apply(Math, boxes.map(function (box) { return box.x; }));
      var right = Math.max.apply(Math, boxes.map(function (box) { return box.x + box.w; }));
      var top = Math.min.apply(Math, boxes.map(function (box) { return box.y; }));
      var averageHeight = boxes.reduce(function (sum, box) { return sum + box.h; }, 0) / boxes.length;
      var sourceCenters = boxes.map(function (box) { return box.x + box.w * 0.5; });
      var masses = boxes.map(function (box, index) { return suspensionMass(box, row[index].strength, typeSize); });
      var stressIndex = suspensionStressIndex(masses), rowNumber = Number(rowKey) || 0;
      var rowOffset = (rowNumber % 2 ? 1 : -1) * Math.min(drop * 0.22, width * 0.055);
      var rowYOffset = Math.min(drop * 0.72, height * 0.12) + rowNumber * Math.min(drop * 0.22, height * 0.05);
      var centers = sourceCenters.map(function (center) { return center + rowOffset; });
      var spanPad = Math.max(typeSize * 1.5, cable * 5.2);
      var supportLeft = left + rowOffset - spanPad * (rowNumber % 2 ? 2.05 : 0.62);
      var supportRight = right + rowOffset + spanPad * (rowNumber % 2 ? 0.62 : 2.05);
      var rowAlpha = clamp(row.reduce(function (sum, item) { return sum + item.strength; }, 0) / row.length, 0, 1);
      ctx.save(); ctx.lineCap = 'square'; ctx.lineJoin = 'miter';

      if (grammar === 'catenary') {
        var supportY = top + rowYOffset + averageHeight * 0.22 - drop * 0.075;
        var cableSag = Math.min(drop * 0.72, drop * (0.36 + Math.min(0.1, rowNumber * 0.05)) / (0.7 + tension * 0.58));
        var cableShape = solveSuspensionCable(centers, masses, supportLeft, supportRight, supportY, cableSag);
        var cableStressIndex = 0, cableStressDepth = -Infinity;
        for (var cableStressScan = 0; cableStressScan < centers.length; cableStressScan++) {
          var cableStressPoint = cablePointAt(cableShape, centers[cableStressScan]);
          if (cableStressPoint.y > cableStressDepth) { cableStressDepth = cableStressPoint.y; cableStressIndex = cableStressScan; }
        }
        drawSuspensionCable(ctx, cableShape.points, cable * 1.62, palette, rowAlpha);
        drawSuspensionMember(ctx, { x: supportLeft, y: supportY - typeSize * 0.48 }, { x: supportLeft, y: supportY + typeSize * 0.48 }, cable * 1.12, palette, rowAlpha, false);
        drawSuspensionMember(ctx, { x: supportRight, y: supportY - typeSize * 0.48 }, { x: supportRight, y: supportY + typeSize * 0.48 }, cable * 1.12, palette, rowAlpha, false);
        for (var cIndex = 0; cIndex < row.length; cIndex++) {
          var cItem = row[cIndex], cNode = cablePointAt(cableShape, centers[cIndex]);
          var cVariance = hash(cIndex, rowNumber, env.params.seed + 17);
          var cOriginalCut = pointOnGlyph(cItem.glyph, 0.5, 0.39, pixelScale, L);
          var cSway = (cVariance - 0.5) * typeSize * 0.34 / (0.65 + tension);
          var cRotation = clamp(Math.atan(cNode.slope || 0) * 180 / Math.PI * 0.34, -6.5, 6.5);
          var cGlyph = shiftedGlyph(cItem.glyph, rowOffset + cSway, cNode.y - cOriginalCut.y, cRotation, pixelScale, L);
          var cCutA = pointOnGlyph(cGlyph, 0.02, 0.39, pixelScale, L), cCutB = pointOnGlyph(cGlyph, 0.98, 0.39, pixelScale, L);
          var cLoadRatio = Math.pow(Math.max(0, 1 - Math.abs(cIndex - cableStressIndex) / Math.max(1, row.length * 0.5)), 2.4);
          deferredGlyphs.push({ item: cItem, glyph: cGlyph, cutA: cCutA, cutB: cCutB,
            split: cable * 0.28 + drop * (0.006 + cLoadRatio * 0.29) / (0.88 + tension * 0.2), accent: cIndex === cableStressIndex });
          if (cIndex === cableStressIndex) drawSuspensionPlate(ctx, cNode, cable * 5.6, palette, cItem.strength, true, Math.atan(cNode.slope || 0));
        }
      } else if (grammar === 'gantry') {
        var beamSag = drop * 0.2 / (0.68 + tension * 0.64);
        var beam = solveSuspensionBeam(centers, masses.slice(), supportLeft, supportRight, beamSag);
        var beamY = top + rowYOffset + averageHeight * 0.48 - drop * 0.035;
        var deck = beam.points.map(function (point) { return { x: point.x, y: beamY + point.y }; });
        var maxMoment = 0;
        var gantryStressIndex = 0;
        for (var statIndex = 0; statIndex < centers.length; statIndex++) {
          var sampleMoment = Math.abs(beam.momentAt(centers[statIndex]));
          if (sampleMoment > maxMoment) { maxMoment = sampleMoment; gantryStressIndex = statIndex; }
        }
        maxMoment = Math.max(0.0001, maxMoment);
        for (var memberIndex = 0; memberIndex < deck.length - 1; memberIndex++) {
          var memberX = (deck[memberIndex].x + deck[memberIndex + 1].x) * 0.5;
          var momentRatio = Math.abs(beam.momentAt(memberX)) / maxMoment;
          drawSuspensionMember(ctx, deck[memberIndex], deck[memberIndex + 1], cable * (1.16 + momentRatio * 0.92), palette, rowAlpha, false);
        }
        var previousCutEnd = null;
        for (var gIndex = 0; gIndex < row.length; gIndex++) {
          var gItem = row[gIndex], gDeckY = beamY + beamDeflectionAt(beam, centers[gIndex]);
          var gRotation = clamp(Math.atan((beamDeflectionAt(beam, centers[gIndex] + 1) - beamDeflectionAt(beam, centers[gIndex] - 1)) * 0.5) * 180 / Math.PI * 0.28, -4, 4);
          var gOriginalCut = pointOnGlyph(gItem.glyph, 0.5, 0.48, pixelScale, L);
          var gGlyph = shiftedGlyph(gItem.glyph, rowOffset, gDeckY - gOriginalCut.y, gRotation, pixelScale, L);
          var gCutA = pointOnGlyph(gGlyph, 0.02, gIndex % 2 ? 0.63 : 0.33, pixelScale, L);
          var gCutB = pointOnGlyph(gGlyph, 0.98, gIndex % 2 ? 0.33 : 0.63, pixelScale, L);
          var gMoment = Math.abs(beam.momentAt(centers[gIndex])) / maxMoment;
          if (previousCutEnd) drawSuspensionMember(ctx, previousCutEnd, gCutA, cable * 0.42, palette, rowAlpha * 0.66, false);
          drawSuspensionMember(ctx, gCutA, gCutB, cable * (0.42 + gMoment * 0.26), palette, rowAlpha * 0.72, gIndex === gantryStressIndex);
          previousCutEnd = gCutB;
          deferredGlyphs.push({ item: gItem, glyph: gGlyph, cutA: gCutA, cutB: gCutB,
            split: cable * 0.28 + drop * (0.008 + gMoment * 0.14) / (0.86 + tension * 0.2), accent: gIndex === gantryStressIndex });
          if (gIndex === gantryStressIndex) drawSuspensionPlate(ctx, { x: centers[gIndex], y: gDeckY }, cable * 5.4, palette, gItem.strength, true, 0);
        }
      }
      ctx.restore();
    });
    drawSuspensionBodies(ctx, env, deferredGlyphs, width, height, pixelScale, L, fm, cable, palette, grammar);
  }

  function renderLivingTextField(ctx, glyphs, width, height, pixelScale, L, fm, env) {
    var id = 'livingTextField', active = activeGlyphs(env, glyphs, id);
    if (!active.length) return;
    var grammar = option(env, glyphs, id, 'livingGrammar');
    var cell = number(env, glyphs, id, 'livingCell') * pixelScale;
    var density = number(env, glyphs, id, 'livingDensity');
    var drift = number(env, glyphs, id, 'livingDrift') * pixelScale;
    var motion = number(env, glyphs, id, 'livingMotion');
    var mask = env.buildMask(glyphs, id, width, height, pixelScale, L, fm), image = readMask(mask);
    if (!image) return;
    var grammarScale = grammar === 'lexemes' ? 1.42 : (grammar === 'constellation' ? 1.18 : 0.94);
    var data = image.data, step = Math.max(3, Math.round(cell * grammarScale / Math.sqrt(density))), maxPoints = grammar === 'particles' ? 6200 : 4200;
    var points = [], phase = (env.phase || 0) * (0.6 + motion * 2.2), seed = env.params.seed || 1;
    for (var y = Math.floor(step / 2); y < height && points.length < maxPoints; y += step) for (var x = Math.floor(step / 2); x < width && points.length < maxPoints; x += step) {
      var alpha = data[(y * width + x) * 4 + 3] / 255;
      var population = grammar === 'particles' ? 0.36 + density * 0.36 : (grammar === 'lexemes' ? 0.32 + density * 0.27 : 0.28 + density * 0.25);
      if (alpha < 0.04 || hash(x / step, y / step, seed + 31) > Math.min(0.98, population)) continue;
      var cellX = x / step, cellY = y / step;
      var randomAngle = hash(cellY, cellX, seed + 37) * Math.PI * 2;
      var curl = Math.sin(cellX * 0.37 + phase * 0.7) - Math.cos(cellY * 0.29 - phase * 0.52);
      var fieldAngle = randomAngle * 0.42 + curl * 1.18;
      var pulse = 0.24 + 0.76 * (0.5 + 0.5 * Math.sin(phase + hash(x, y, seed + 41) * Math.PI * 2));
      var staticDrift = drift * (0.045 + hash(cellX, cellY, seed + 45) * 0.08);
      var displacement = staticDrift + drift * pulse * motion * (0.34 + hash(cellY, cellX, seed + 46) * 0.66);
      var px = x + (hash(cellX, cellY, seed + 48) - 0.5) * step * 0.72 + Math.cos(fieldAngle + phase * 0.4) * displacement;
      var py = y + (hash(cellY, cellX, seed + 49) - 0.5) * step * 0.72 + Math.sin(fieldAngle + phase * 0.5) * displacement;
      points.push({ x: px, y: py, ox: x, oy: y, alpha: alpha, angle: fieldAngle, pulse: pulse,
        size: Math.max(0.8, step * (0.13 + hash(x, y, seed + 43) * 0.28)), col: Math.round(cellX), row: Math.round(cellY) });
    }
    var primary = env.color(id), palette = richPalette(primary, env.params.accent, env.params.paper);
    var source = cleanPhrase(env.sourceText), phrase = Array.from(source), words = source.split(/\s+/).filter(Boolean);
    var memoryAlpha = grammar === 'particles' ? 0.14 : (grammar === 'lexemes' ? 0.085 : 0.105);
    ctx.save(); ctx.globalAlpha = memoryAlpha + Math.min(0.055, density * 0.018); ctx.shadowColor = rgbaColor(palette.base, 0.18); ctx.shadowBlur = cell * 0.65;
    ctx.drawImage(tintMask(env, mask, palette.base, 'living-field-memory'), 0, 0); ctx.restore();

    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var linkLimit = grammar === 'constellation' ? 1800 : (grammar === 'lexemes' ? 520 : 280), links = 0;
    for (var p = 1; p < points.length && links < linkLimit; p++) {
      var current = points[p], previous = points[p - 1];
      var distance = Math.hypot(current.x - previous.x, current.y - previous.y);
      var threshold = grammar === 'constellation' ? step * 4.4 : (grammar === 'lexemes' ? step * 2.2 : step * 1.55);
      var linkChance = grammar === 'constellation' ? 0.68 : (grammar === 'lexemes' ? 0.26 : 0.12);
      if (distance > threshold || hash(p, points.length, seed + 79) > linkChance) continue;
      ctx.globalAlpha = (grammar === 'constellation' ? 0.34 : grammar === 'lexemes' ? 0.12 : 0.08) * Math.min(current.alpha, previous.alpha);
      ctx.strokeStyle = p % 5 ? (grammar === 'constellation' ? palette.deep : palette.base) : palette.accent;
      ctx.lineWidth = Math.max(0.34, pixelScale * (grammar === 'constellation' ? 0.86 : grammar === 'lexemes' ? 0.48 : 0.38));
      var bend = Math.sin(p * 1.7 + phase) * step * 0.42;
      ctx.beginPath(); ctx.moveTo(previous.x, previous.y); ctx.quadraticCurveTo((previous.x + current.x) * 0.5 + bend, (previous.y + current.y) * 0.5 - bend, current.x, current.y); ctx.stroke(); links++;
    }
    // Motion remains legible as a trajectory rather than a teleport between
    // particle positions. At rest the short filaments still reveal the field.
    for (var trail = 0; trail < points.length; trail += grammar === 'particles' ? 3 : (grammar === 'lexemes' ? 7 : 5)) {
      var tp = points[trail], trailAlpha = (grammar === 'constellation' ? 0.14 : 0.105) + motion * 0.13;
      ctx.globalAlpha = tp.alpha * trailAlpha; ctx.strokeStyle = trail % 3 ? palette.light : palette.accent;
      ctx.lineWidth = Math.max(0.3, tp.size * 0.35); ctx.beginPath(); ctx.moveTo(tp.ox, tp.oy);
      ctx.quadraticCurveTo((tp.ox + tp.x) * 0.5 - Math.sin(tp.angle) * step, (tp.oy + tp.y) * 0.5 + Math.cos(tp.angle) * step, tp.x, tp.y); ctx.stroke();
    }
    ctx.restore();

    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (var i = 0; i < points.length; i++) {
      var point = points[i], strength = Math.min(1, point.alpha * (0.54 + hash(i, seed, 47) * 0.46));
      ctx.globalAlpha = strength; ctx.fillStyle = i % 7 === 1 ? palette.accent : (i % 11 === 3 ? palette.hot : (i % 5 === 0 ? palette.deep : palette.base));
      if (grammar === 'lexemes') {
        var token = i % 9 === 0 && words.length ? words[i % words.length] : (phrase[i % phrase.length] || '•');
        var tokenSize = Math.max(3.5, step * (token.length > 1 ? 0.68 : 1.05) * (0.8 + point.pulse * 0.36));
        ctx.font = (i % 8 === 0 ? '750 ' : '560 ') + tokenSize + 'px ui-monospace, SFMono-Regular, Consolas, monospace';
        ctx.save(); ctx.translate(point.x, point.y); ctx.rotate((point.angle - Math.PI * 0.5) * 0.24); ctx.shadowColor = rgbaColor(palette.deep, 0.42); ctx.shadowBlur = tokenSize * 0.2; ctx.fillText(token, 0, 0);
        if (i % 6 === 0) { ctx.globalAlpha = strength * 0.44; ctx.strokeStyle = palette.light; ctx.lineWidth = Math.max(0.35, pixelScale * 0.42); ctx.strokeText(token, 0, 0); } ctx.restore();
      } else {
        var radius = point.size * (grammar === 'constellation' ? 0.88 : 1 + point.pulse * 0.42);
        if (i % 13 === 0) {
          ctx.save(); ctx.globalAlpha = strength * 0.2; ctx.fillStyle = palette.accent; ctx.shadowColor = rgbaColor(palette.accent, 0.55); ctx.shadowBlur = radius * 3.2;
          ctx.beginPath(); ctx.arc(point.x, point.y, radius * 2.25, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
        ctx.beginPath(); ctx.arc(point.x, point.y, radius, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = strength * 0.62; ctx.fillStyle = palette.pale;
        ctx.beginPath(); ctx.arc(point.x - radius * 0.28, point.y - radius * 0.3, Math.max(0.28, radius * 0.24), 0, Math.PI * 2); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
        if (grammar === 'constellation' && i % 4 === 0) {
          ctx.globalAlpha = strength * 0.64; ctx.strokeStyle = i % 8 ? palette.accent : palette.hot; ctx.lineWidth = Math.max(0.35, pixelScale * 0.48);
          ctx.beginPath(); ctx.arc(point.x, point.y, radius * (1.8 + hash(i, 5, seed) * 0.7), 0, Math.PI * 2); ctx.stroke();
        } else if (grammar === 'particles' && i % 9 === 0) {
          ctx.globalAlpha = strength * 0.42; ctx.strokeStyle = palette.light; ctx.lineWidth = Math.max(0.3, pixelScale * 0.4);
          ctx.beginPath(); ctx.ellipse(point.x, point.y, radius * 1.7, radius * 1.18, point.angle, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  function fallbackVoidCenters(active, pixelScale, L) {
    return active.slice(0, 12).map(function (item) {
      var b = glyphBounds(item.glyph, pixelScale, L);
      return { x: b.x + b.w * 0.5, y: b.y + b.h * 0.5, rx: b.w * 0.11, ry: b.h * 0.12, area: b.w * b.h * 0.02 };
    });
  }

  function renderInnerEruption(ctx, glyphs, width, height, pixelScale, L, fm, env) {
    var id = 'innerEruption', active = activeGlyphs(env, glyphs, id);
    if (!active.length) return;
    var grammar = option(env, glyphs, id, 'eruptionGrammar');
    var force = number(env, glyphs, id, 'eruptionForce'), layers = number(env, glyphs, id, 'eruptionLayers');
    var reach = number(env, glyphs, id, 'eruptionReach') * pixelScale, rupture = number(env, glyphs, id, 'eruptionRupture');
    var mask = env.buildMask(glyphs, id, width, height, pixelScale, L, fm), primary = env.color(id), palette = richPalette(primary, env.params.accent, env.params.paper);
    drawMaterialMask(ctx, env, mask, primary, env.params.accent, 'inner-eruption-body', {
      alpha: 0.9, depth: Math.max(pixelScale * 0.8, reach * force * 0.018), angle: -0.82, sheen: 0.62
    });
    var holes = maskVoids(mask, pixelScale); if (!holes.length) holes = fallbackVoidCenters(active, pixelScale, L);
    holes = holes.slice(0, 12);
    for (var h = 0; h < holes.length; h++) {
      var hole = holes[h], radius = Math.max(hole.rx, hole.ry), expansion = reach * force * (0.2 + rupture * 0.38);
      var orientation = (hash(h, 17, env.params.seed) - 0.5) * 1.1 + h * 0.17;
      var nearestGlyph = active[0], nearestGlyphDistance = Infinity;
      for (var ownerIndex = 0; ownerIndex < active.length; ownerIndex++) {
        var ownerBounds = glyphBounds(active[ownerIndex].glyph, pixelScale, L);
        var ownerDistance = Math.hypot(hole.x - (ownerBounds.x + ownerBounds.w * 0.5), hole.y - (ownerBounds.y + ownerBounds.h * 0.5));
        if (ownerDistance < nearestGlyphDistance) { nearestGlyphDistance = ownerDistance; nearestGlyph = active[ownerIndex]; }
      }
      var nearestBounds = glyphBounds(nearestGlyph.glyph, pixelScale, L), outwardAngle = Math.atan2(hole.y - (nearestBounds.y + nearestBounds.h * 0.5), hole.x - (nearestBounds.x + nearestBounds.w * 0.5));
      if (nearestGlyphDistance < Math.min(nearestBounds.w, nearestBounds.h) * 0.12) outwardAngle = hash(h, 29, env.params.seed) * Math.PI * 2;

      // Dark-to-light cavity: this is the interior volume from which the
      // laminae, shards or plumes emerge.
      ctx.save(); ctx.translate(hole.x, hole.y); ctx.rotate(orientation);
      var cavity = ctx.createRadialGradient(-hole.rx * 0.18, -hole.ry * 0.22, Math.max(1, radius * 0.08), 0, 0, radius + expansion * 0.28);
      cavity.addColorStop(0, rgbaColor(palette.deep, 0.96)); cavity.addColorStop(0.36, rgbaColor(palette.accent, 0.72));
      cavity.addColorStop(0.72, rgbaColor(palette.base, 0.24)); cavity.addColorStop(1, rgbaColor(palette.pale, 0));
      ctx.globalAlpha = 0.42 + rupture * 0.36; ctx.fillStyle = cavity;
      organicLoopPath(ctx, 0, 0, hole.rx + expansion * 0.32, hole.ry + expansion * 0.24, 0, 0.1 + rupture * 0.09, env.params.seed + h * 31); ctx.fill(); ctx.restore();

      ctx.save(); ctx.translate(hole.x, hole.y); ctx.rotate(orientation); ctx.globalAlpha = 0.9;
      if (grammar === 'lamina') {
        for (var ring = 1; ring <= layers; ring++) {
          var t = ring / layers, wobble = (hash(ring, h, env.params.seed + 101) - 0.5) * expansion * 0.14;
          var rx = hole.rx + expansion * t, ry = hole.ry + expansion * t * (0.64 + 0.22 * force);
          ctx.strokeStyle = rgbaColor(palette.deep, 0.5); ctx.lineWidth = Math.max(1, pixelScale * (3.2 - t * 1.4)); ctx.shadowColor = rgbaColor(palette.deep, 0.44); ctx.shadowBlur = Math.max(1, pixelScale * 2.2); ctx.shadowOffsetY = pixelScale * 1.4;
          organicLoopPath(ctx, wobble, -wobble * 0.45, rx, ry, t * 0.22, 0.055 + rupture * 0.065, env.params.seed + h * 101 + ring * 7); ctx.stroke();
          ctx.shadowColor = 'transparent'; ctx.strokeStyle = ring % 3 === 1 ? palette.hot : (ring % 2 ? palette.base : palette.accent);
          ctx.lineWidth = Math.max(0.65, pixelScale * (1.7 - t * 0.62)); ctx.globalAlpha = 0.5 + (1 - t) * 0.42;
          organicLoopPath(ctx, wobble, -wobble * 0.45, rx, ry, t * 0.22, 0.055 + rupture * 0.065, env.params.seed + h * 101 + ring * 7, -Math.PI * (0.92 + rupture * 0.08), Math.PI * (0.78 + rupture * 0.22)); ctx.stroke();
          ctx.strokeStyle = palette.pale; ctx.globalAlpha *= 0.48; ctx.lineWidth = Math.max(0.35, pixelScale * 0.45);
          organicLoopPath(ctx, wobble - pixelScale, -wobble * 0.45 - pixelScale, rx, ry, t * 0.22, 0.045, env.params.seed + h * 101 + ring * 7, Math.PI * 0.08, Math.PI * 0.74); ctx.stroke();
        }
      } else if (grammar === 'plume') {
        for (var plume = 0; plume < layers * 2; plume++) {
          var plumeLobe = plume % 3 === 0 ? 1 : 0;
          var plumeAxis = outwardAngle - orientation + plumeLobe * Math.PI * (0.58 + hash(h, 41, env.params.seed) * 0.24);
          var pa = plumeAxis + (hash(plume, h, env.params.seed + 109) - 0.5) * (1.02 + rupture * 0.72), pr = radius + expansion * (0.58 + hash(plume, h, env.params.seed) * 0.58);
          var start = { x: Math.cos(pa) * hole.rx * 0.72, y: Math.sin(pa) * hole.ry * 0.72 };
          var end = { x: Math.cos(pa + (hash(plume, h, env.params.seed + 113) - 0.5) * 0.36) * pr, y: Math.sin(pa + (hash(plume, h, env.params.seed + 113) - 0.5) * 0.36) * pr };
          var curl = (plume % 2 ? -1 : 1) * pr * (0.28 + rupture * 0.22);
          drawRichCurve(ctx, start,
            { x: Math.cos(pa) * pr * 0.34 - Math.sin(pa) * curl, y: Math.sin(pa) * pr * 0.34 + Math.cos(pa) * curl },
            { x: Math.cos(pa) * pr * 0.72 + Math.sin(pa) * curl * 0.4, y: Math.sin(pa) * pr * 0.72 - Math.cos(pa) * curl * 0.4 }, end,
            Math.max(pixelScale * 0.75, pixelScale * (2.8 - plume / Math.max(1, layers))), plume % 3 ? palette : Object.assign({}, palette, { base: palette.accent }), 0.42 + rupture * 0.5);
          if (plume % 3 === 0) { ctx.fillStyle = palette.hot; ctx.globalAlpha = 0.58; ctx.beginPath(); ctx.arc(end.x, end.y, Math.max(1, pixelScale * (1.4 + rupture * 2.1)), 0, Math.PI * 2); ctx.fill(); }
        }
      } else {
        var shardCount = Math.max(7, Math.round(layers * 2.15));
        for (var shard = 0; shard < shardCount; shard++) {
          var lobe = shard % 4 === 0 ? 1 : 0;
          var lobeAxis = outwardAngle - orientation + lobe * Math.PI * (0.64 + hash(h, 47, env.params.seed) * 0.18);
          var angle = lobeAxis + (hash(h, shard, env.params.seed + 127) - 0.5) * (0.92 + rupture * 0.92);
          var inner = radius * (0.48 + hash(shard, h, env.params.seed + 3) * 0.3), outer = radius + expansion * (0.5 + hash(h, shard, env.params.seed + 5) * 0.72);
          var spread = 0.045 + rupture * 0.105, shoulder = inner + (outer - inner) * (0.26 + hash(shard, 4, env.params.seed) * 0.34);
          var ax = Math.cos(angle - spread) * inner, ay = Math.sin(angle - spread) * inner;
          var bx = Math.cos(angle - spread * 0.54) * shoulder, by = Math.sin(angle - spread * 0.54) * shoulder;
          var tx = Math.cos(angle) * outer, ty = Math.sin(angle) * outer;
          var cx = Math.cos(angle + spread) * inner, cy = Math.sin(angle + spread) * inner;
          ctx.save(); ctx.shadowColor = rgbaColor(palette.deep, 0.48); ctx.shadowBlur = Math.max(1, pixelScale * 2.2); ctx.shadowOffsetX = Math.cos(angle) * pixelScale * 1.4; ctx.shadowOffsetY = Math.sin(angle) * pixelScale * 1.4;
          var facet = ctx.createLinearGradient(ax, ay, tx, ty); facet.addColorStop(0, shard % 3 ? palette.deep : palette.accent); facet.addColorStop(0.52, shard % 2 ? palette.base : palette.hot); facet.addColorStop(1, palette.pale);
          ctx.fillStyle = facet; ctx.globalAlpha = 0.54 + rupture * 0.4; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(tx, ty); ctx.lineTo(cx, cy); ctx.closePath(); ctx.fill();
          ctx.shadowColor = 'transparent'; ctx.strokeStyle = rgbaColor(palette.pale, 0.8); ctx.lineWidth = Math.max(0.35, pixelScale * 0.48); ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(tx, ty); ctx.lineTo(cx, cy); ctx.stroke(); ctx.restore();
        }
      }
      ctx.restore();

      // Re-open the counter after the emerging geometry, then trace its torn
      // lip so the eruption visibly passes through the glyph body.
      ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = Math.min(1, 0.48 + rupture * 0.68);
      organicLoopPath(ctx, hole.x, hole.y, hole.rx + expansion * 0.13, hole.ry + expansion * 0.1, orientation, 0.11 + rupture * 0.1, env.params.seed + h * 139); ctx.fill(); ctx.restore();
      ctx.save(); ctx.strokeStyle = palette.hot; ctx.globalAlpha = 0.72 + rupture * 0.22; ctx.lineWidth = Math.max(0.6, pixelScale * (1.2 + rupture * 1.6));
      ctx.shadowColor = rgbaColor(palette.deep, 0.48); ctx.shadowBlur = pixelScale * 2.4;
      organicLoopPath(ctx, hole.x, hole.y, hole.rx + expansion * 0.135, hole.ry + expansion * 0.105, orientation, 0.11 + rupture * 0.1, env.params.seed + h * 139, -Math.PI * 0.92, Math.PI * 0.74); ctx.stroke(); ctx.restore();
    }
  }

  function buildRecursiveBranches(anchor, angle, length, generations, turn, seed, grammar) {
    var segments = [], endpoints = [], stack = [{ x: anchor.x, y: anchor.y, angle: angle, length: length, generation: 0 }];
    while (stack.length && segments.length < 768) {
      var branch = stack.pop(), x2 = branch.x + Math.cos(branch.angle) * branch.length, y2 = branch.y + Math.sin(branch.angle) * branch.length;
      segments.push({ x1: branch.x, y1: branch.y, x2: x2, y2: y2, generation: branch.generation });
      if (branch.generation + 1 >= generations) { endpoints.push({ x: x2, y: y2 }); continue; }
      var count = grammar === 'splice' ? 1 : (grammar === 'coral' && branch.generation < 2 ? 3 : 2);
      for (var child = 0; child < count; child++) {
        var centered = count === 1 ? (hash(branch.generation, segments.length, seed) - 0.5) : (child / (count - 1) - 0.5);
        var jitter = (hash(segments.length, child, seed + 13) - 0.5) * Math.abs(turn) * 0.36;
        stack.push({ x: x2, y: y2, angle: branch.angle + (centered * turn + jitter) * Math.PI / 180, length: branch.length * (grammar === 'coral' ? 0.61 : 0.66), generation: branch.generation + 1 });
      }
    }
    return { segments: segments, endpoints: endpoints };
  }

  function renderRecursiveGraft(ctx, glyphs, width, height, pixelScale, L, fm, env) {
    var id = 'recursiveGraft', active = activeGlyphs(env, glyphs, id);
    if (!active.length) return;
    var grammar = option(env, glyphs, id, 'graftGrammar'), generations = number(env, glyphs, id, 'graftGenerations');
    var reach = number(env, glyphs, id, 'graftReach') * pixelScale, turn = number(env, glyphs, id, 'graftTurn');
    var fusion = number(env, glyphs, id, 'graftFusion') * pixelScale, weight = number(env, glyphs, id, 'graftWeight') * pixelScale;
    var mask = env.buildMask(glyphs, id, width, height, pixelScale, L, fm), maskImage = readMask(mask), primary = env.color(id);
    var palette = drawMaterialMask(ctx, env, mask, primary, env.params.accent, 'recursive-graft-body', {
      alpha: grammar === 'splice' ? 0.78 : 0.64, depth: Math.max(pixelScale, weight * 0.8), sheen: 0.48, angle: -1.05
    });
    var allEnds = [];
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (var i = 0; i < active.length && i < 32; i++) {
      var item = active[i], bounds = glyphBounds(item.glyph, pixelScale, L);
      var candidates = boundarySamples(maskImage, width, height, bounds, Math.max(4, weight * 2.4), 20, env.params.seed + i * 23);
      if (!candidates.length) {
        var fallback = pointOnGlyph(item.glyph, hash(i, 2, env.params.seed) > 0.5 ? 0.86 : 0.14, hash(i, 7, env.params.seed) > 0.5 ? 0.16 : 0.84, pixelScale, L);
        candidates = [{ x: fallback.x, y: fallback.y, nx: fallback.x < bounds.x + bounds.w * 0.5 ? -1 : 1, ny: fallback.y < bounds.y + bounds.h * 0.5 ? -0.7 : 0.7 }];
      }
      var rootCount = active.length > 22 ? 1 : (grammar === 'coral' ? 3 : 2);
      for (var rootIndex = 0; rootIndex < rootCount; rootIndex++) {
        var anchor = candidates[Math.floor(rootIndex * candidates.length / rootCount + hash(i, rootIndex, env.params.seed) * Math.max(1, candidates.length / rootCount)) % candidates.length];
        var baseAngle = Math.atan2(anchor.ny, anchor.nx) + (hash(i, rootIndex, env.params.seed + 67) - 0.5) * (grammar === 'splice' ? 0.36 : 0.72);
        var rootReach = reach * item.strength * (0.46 + hash(rootIndex, i, env.params.seed + 69) * 0.54);
        var tree = buildRecursiveBranches(anchor, baseAngle, rootReach, generations, turn, env.params.seed + i * 37 + rootIndex * 11, grammar);
        ctx.save(); ctx.fillStyle = rootIndex % 2 ? palette.accent : palette.hot; ctx.globalAlpha = item.strength * 0.84;
        ctx.shadowColor = rgbaColor(palette.deep, 0.44); ctx.shadowBlur = weight * 1.8; ctx.beginPath();
        ctx.ellipse(anchor.x, anchor.y, weight * (2.6 + rootIndex * 0.28), weight * (1.45 + rootIndex * 0.16), baseAngle, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        for (var s = 0; s < tree.segments.length; s++) {
          var segment = tree.segments[s], fade = 1 - segment.generation / Math.max(1, generations) * 0.7;
          var segmentWidth = Math.max(0.38, weight * fade * (grammar === 'splice' ? 1.75 : grammar === 'coral' ? 1.24 : 1));
          var vx = segment.x2 - segment.x1, vy = segment.y2 - segment.y1, length = Math.max(1, Math.hypot(vx, vy));
          var normalX = -vy / length, normalY = vx / length, curve = (hash(s, rootIndex, env.params.seed + i) - 0.5) * length * (grammar === 'splice' ? 0.16 : 0.28);
          drawRichCurve(ctx, { x: segment.x1, y: segment.y1 },
            { x: segment.x1 + vx * 0.33 + normalX * curve, y: segment.y1 + vy * 0.33 + normalY * curve },
            { x: segment.x1 + vx * 0.68 - normalX * curve * 0.35, y: segment.y1 + vy * 0.68 - normalY * curve * 0.35 },
            { x: segment.x2, y: segment.y2 }, segmentWidth,
            segment.generation % 2 ? Object.assign({}, palette, { base: palette.accent }) : palette, item.strength * fade);
          if ((grammar === 'coral' && segment.generation > 0) || (grammar === 'splice' && s % 2 === 0)) {
            ctx.save(); ctx.fillStyle = segment.generation % 2 ? palette.hot : palette.light; ctx.globalAlpha = item.strength * fade * 0.76;
            ctx.beginPath(); ctx.arc(segment.x2, segment.y2, segmentWidth * (grammar === 'coral' ? 1.4 : 1.05), 0, Math.PI * 2); ctx.fill(); ctx.restore();
          }
        }
        tree.endpoints.forEach(function (end, endpointIndex) {
          allEnds.push({ x: end.x, y: end.y, owner: i, strength: item.strength, width: weight, endpoint: endpointIndex });
          ctx.save(); ctx.globalAlpha = item.strength * (0.42 + 0.35 * hash(endpointIndex, i, env.params.seed));
          ctx.strokeStyle = palette.light; ctx.fillStyle = endpointIndex % 3 ? palette.accent : palette.hot; ctx.lineWidth = Math.max(0.35, weight * 0.3);
          ctx.beginPath(); ctx.arc(end.x, end.y, Math.max(0.8, weight * (0.9 + hash(i, endpointIndex, env.params.seed) * 0.9)), 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
        });
      }
    }
    var joins = 0;
    for (var a = 0; a < allEnds.length && joins < 96; a++) for (var b = a + 1; b < allEnds.length && joins < 96; b++) {
      if (allEnds[a].owner === allEnds[b].owner) continue;
      var distance = Math.hypot(allEnds[a].x - allEnds[b].x, allEnds[a].y - allEnds[b].y);
      if (distance > fusion || hash(a, b, env.params.seed + 71) > 0.38) continue;
      var midpoint = { x: (allEnds[a].x + allEnds[b].x) / 2, y: (allEnds[a].y + allEnds[b].y) / 2 };
      var joinPalette = Object.assign({}, palette, { base: palette.hot });
      drawRichCurve(ctx, allEnds[a], { x: allEnds[a].x, y: midpoint.y }, { x: allEnds[b].x, y: midpoint.y }, allEnds[b], Math.max(0.5, weight * 1.22), joinPalette,
        Math.min(allEnds[a].strength, allEnds[b].strength) * 0.76);
      ctx.save(); ctx.fillStyle = palette.accent; ctx.strokeStyle = palette.light; ctx.lineWidth = Math.max(0.4, weight * 0.38); ctx.globalAlpha = 0.82;
      ctx.shadowColor = rgbaColor(palette.deep, 0.42); ctx.shadowBlur = weight * 2.2; ctx.beginPath(); ctx.ellipse(midpoint.x, midpoint.y, weight * 2.5, weight * 1.55, Math.atan2(allEnds[b].y - allEnds[a].y, allEnds[b].x - allEnds[a].x), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.ellipse(midpoint.x, midpoint.y, weight * 0.9, weight * 0.48, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); joins++;
    }
    ctx.restore();
  }

  function drawCollisionBody(target, active, bodyIndex, bodies, force, angle, system, pixelScale, L, fm, env) {
    var centered = bodyIndex - (bodies - 1) / 2;
    for (var i = 0; i < active.length; i++) {
      var item = active[i], bodyAngle = angle;
      if (system === 'radial') bodyAngle += bodyIndex / bodies * Math.PI * 2;
      if (system === 'stack') bodyAngle = Math.PI / 2 + angle * 0.25;
      var distance = system === 'radial' ? force * (0.45 + bodyIndex / Math.max(1, bodies - 1)) : centered * force;
      var moved = shiftedGlyph(item.glyph, Math.cos(bodyAngle) * distance * item.strength, Math.sin(bodyAngle) * distance * item.strength, system === 'radial' ? centered * 8 : centered * 2.5, pixelScale, L);
      env.drawGlyph(target, moved, pixelScale, L, fm, item.strength, '#fff');
    }
  }

  function renderStructuralCollision(ctx, glyphs, width, height, pixelScale, L, fm, env) {
    var id = 'structuralCollision', active = activeGlyphs(env, glyphs, id);
    if (!active.length) return;
    var system = option(env, glyphs, id, 'collisionSystem'), bodies = number(env, glyphs, id, 'collisionBodies');
    var force = number(env, glyphs, id, 'collisionForce') * pixelScale, angle = number(env, glyphs, id, 'collisionAngle') * Math.PI / 180;
    var reaction = option(env, glyphs, id, 'collisionReaction'), seam = number(env, glyphs, id, 'collisionSeam') * pixelScale;
    var primary = env.color(id), secondary = env.params.accent, palette = richPalette(primary, secondary, env.params.paper), masks = [];
    for (var bodyIndex = 0; bodyIndex < bodies; bodyIndex++) {
      var body = scratch(env, 'collision-body-' + bodyIndex, width, height, true);
      drawCollisionBody(body.ctx, active, bodyIndex, bodies, force, angle, system, pixelScale, L, fm, env); masks.push(body.canvas);
      var tone = mixColor(primary, secondary, bodies === 1 ? 0 : bodyIndex / (bodies - 1) * 0.82);
      drawMaterialMask(ctx, env, body.canvas, tone, bodyIndex % 2 ? primary : secondary, 'collision-tint-' + bodyIndex, {
        alpha: 0.74 + 0.2 / bodies, depth: Math.max(pixelScale, seam * 0.48), angle: angle + bodyIndex * 0.54, sheen: 0.58
      });

      // Each displaced body carries a different internal construction. The
      // collision is therefore between materials, not duplicate flat glyphs.
      var texture = scratch(env, 'collision-texture-' + bodyIndex, width, height, false), tc = texture.ctx;
      tc.save(); tc.strokeStyle = bodyIndex % 2 ? palette.hot : palette.light; tc.fillStyle = bodyIndex % 2 ? palette.accent : palette.dark;
      tc.globalAlpha = 0.38 + bodyIndex * 0.04;
      var pitch = Math.max(5 * pixelScale, (9 + bodyIndex * 3) * pixelScale);
      if (bodyIndex % 3 === 0) {
        tc.lineWidth = Math.max(0.45, pixelScale * 0.72);
        for (var line = -height; line < width + height; line += pitch) { tc.beginPath(); tc.moveTo(line, 0); tc.lineTo(line - Math.sin(angle + 0.7) * height, height); tc.stroke(); }
      } else if (bodyIndex % 3 === 1) {
        for (var dotY = pitch * 0.5; dotY < height; dotY += pitch) for (var dotX = pitch * 0.5; dotX < width; dotX += pitch) {
          var dotRadius = Math.max(0.7, pixelScale * (1.1 + hash(dotX / pitch, dotY / pitch, env.params.seed + bodyIndex) * 1.5));
          tc.beginPath(); tc.arc(dotX + (Math.floor(dotY / pitch) % 2) * pitch * 0.32, dotY, dotRadius, 0, Math.PI * 2); tc.fill();
        }
      } else {
        tc.lineWidth = Math.max(0.45, pixelScale * 0.64);
        for (var rail = 0; rail < height; rail += pitch) {
          tc.beginPath(); tc.moveTo(0, rail); tc.bezierCurveTo(width * 0.3, rail + Math.sin(rail / pitch) * pitch, width * 0.7, rail - Math.cos(rail / pitch) * pitch, width, rail); tc.stroke();
        }
      }
      tc.restore(); tc.globalCompositeOperation = 'destination-in'; tc.drawImage(body.canvas, 0, 0); tc.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.globalAlpha = 0.76; ctx.globalCompositeOperation = bodyIndex % 2 ? 'screen' : 'multiply'; ctx.drawImage(texture.canvas, 0, 0); ctx.restore();
    }
    var intersection = scratch(env, 'collision-intersection', width, height, true);
    for (var first = 0; first < masks.length; first++) for (var second = first + 1; second < masks.length; second++) {
      var pair = scratch(env, 'collision-pair-' + first + '-' + second, width, height, false);
      pair.ctx.drawImage(masks[first], 0, 0); pair.ctx.globalCompositeOperation = 'destination-in'; pair.ctx.drawImage(masks[second], 0, 0); pair.ctx.globalCompositeOperation = 'source-over';
      intersection.ctx.drawImage(pair.canvas, 0, 0);
    }
    var intersectionImage = readMask(intersection.canvas);
    if (reaction === 'void') {
      ctx.save(); ctx.globalAlpha = 0.85; ctx.shadowColor = rgbaColor(palette.hot, 0.78); ctx.shadowBlur = Math.max(2, seam * 3.4); ctx.drawImage(tintMask(env, intersection.canvas, palette.hot, 'collision-void-halo'), 0, 0); ctx.restore();
      ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 0.96; ctx.drawImage(intersection.canvas, 0, 0); ctx.restore();
    } else if (reaction === 'weld') {
      drawMaterialMask(ctx, env, intersection.canvas, palette.hot, palette.accent, 'collision-weld-volume', {
        alpha: 0.98, depth: Math.max(pixelScale, seam * 0.72), angle: angle - 0.92, sheen: 0.86
      });
    } else {
      var reactionLayer = tintMask(env, intersection.canvas, reaction === 'flare' ? palette.hot : palette.accent, 'collision-reaction');
      ctx.save(); ctx.globalAlpha = reaction === 'flare' ? 0.88 : 0.96;
      ctx.shadowColor = rgbaColor(reaction === 'flare' ? palette.hot : palette.deep, 0.72); ctx.shadowBlur = Math.max(2, seam * (reaction === 'flare' ? 4.8 : 1.8));
      if (reaction === 'flare') ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(reactionLayer, 0, 0); ctx.restore();
    }
    if (seam > 0.05) {
      var activeBounds = active.map(function (entry) { return glyphBounds(entry.glyph, pixelScale, L); });
      var unionBounds = {
        x: Math.min.apply(Math, activeBounds.map(function (b) { return b.x; })) - force,
        y: Math.min.apply(Math, activeBounds.map(function (b) { return b.y; })) - force,
        w: Math.max.apply(Math, activeBounds.map(function (b) { return b.x + b.w; })) - Math.min.apply(Math, activeBounds.map(function (b) { return b.x; })) + force * 2,
        h: Math.max.apply(Math, activeBounds.map(function (b) { return b.y + b.h; })) - Math.min.apply(Math, activeBounds.map(function (b) { return b.y; })) + force * 2
      };
      var seamPoints = boundarySamples(intersectionImage, width, height, unionBounds, Math.max(3, seam * 1.42), 280, env.params.seed + 821);
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (var sp = 0; sp < seamPoints.length; sp++) {
        var point = seamPoints[sp], tangentX = -point.ny, tangentY = point.nx, seamLength = seam * (1.4 + hash(sp, 7, env.params.seed) * 2.6);
        ctx.globalAlpha = 0.58 + hash(sp, 9, env.params.seed) * 0.38; ctx.strokeStyle = sp % 5 ? palette.pale : palette.hot;
        ctx.lineWidth = Math.max(0.45, seam * (sp % 4 === 0 ? 0.72 : 0.3));
        ctx.beginPath(); ctx.moveTo(point.x - tangentX * seamLength, point.y - tangentY * seamLength);
        ctx.quadraticCurveTo(point.x + point.nx * seam * (reaction === 'void' ? 1.8 : -0.7), point.y + point.ny * seam * (reaction === 'void' ? 1.8 : -0.7), point.x + tangentX * seamLength, point.y + tangentY * seamLength); ctx.stroke();
        if (sp % 6 === 0) {
          ctx.fillStyle = reaction === 'weld' ? palette.hot : palette.accent; ctx.strokeStyle = palette.deep; ctx.lineWidth = Math.max(0.35, seam * 0.14);
          ctx.beginPath(); ctx.arc(point.x, point.y, seam * (0.52 + hash(sp, 11, env.params.seed) * 0.48), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = palette.pale; ctx.globalAlpha *= 0.72; ctx.beginPath(); ctx.arc(point.x - seam * 0.18, point.y - seam * 0.2, Math.max(0.3, seam * 0.16), 0, Math.PI * 2); ctx.fill();
        }
        if (reaction === 'flare' && sp % 9 === 0) {
          ctx.strokeStyle = palette.hot; ctx.globalAlpha = 0.34; ctx.lineWidth = Math.max(0.35, seam * 0.16); ctx.beginPath(); ctx.moveTo(point.x, point.y);
          ctx.lineTo(point.x + point.nx * seamLength * 5.4, point.y + point.ny * seamLength * 5.4); ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  function drawWeaveConnections(ctx, active, pixelScale, L, palette, band, twist, knot, grammar) {
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (var i = 1; i < active.length && i < 96; i++) {
      if ((active[i - 1].glyph.line || 0) !== (active[i].glyph.line || 0)) continue;
      if (grammar === 'lamina' && i % 3 !== 1) continue;
      var strength = Math.min(active[i - 1].strength, active[i].strength);
      var aTop = pointOnGlyph(active[i - 1].glyph, 0.74, 0.34, pixelScale, L), bBottom = pointOnGlyph(active[i].glyph, 0.26, 0.68, pixelScale, L);
      var aBottom = pointOnGlyph(active[i - 1].glyph, 0.74, 0.68, pixelScale, L), bTop = pointOnGlyph(active[i].glyph, 0.26, 0.34, pixelScale, L);
      var midX = (aTop.x + bBottom.x) * 0.5, midY = (aTop.y + bBottom.y) * 0.5 + Math.sin(i * 1.7) * twist * band * 2.2;
      var grammarScale = grammar === 'lamina' ? 0.34 : (grammar === 'braid' ? 0.82 : 0.64);
      var bow = band * (grammar === 'braid' ? 2.1 : 1.25) * (1 + Math.abs(twist) * 2.2) * (i % 2 ? -1 : 1);
      drawRichCurve(ctx, aTop, { x: midX - band, y: aTop.y + bow }, { x: midX + band, y: bBottom.y - bow * 0.25 }, bBottom,
        Math.max(0.7, band * 0.72 * grammarScale), i % 2 ? palette : Object.assign({}, palette, { base: palette.accent }), strength * ((grammar === 'lamina' ? 0.24 : 0.5) + knot * 0.32));
      drawRichCurve(ctx, aBottom, { x: midX - band, y: aBottom.y - bow }, { x: midX + band, y: bTop.y + bow * 0.25 }, bTop,
        Math.max(0.6, band * 0.5 * grammarScale), Object.assign({}, palette, { base: palette.hot }), strength * ((grammar === 'lamina' ? 0.18 : 0.4) + knot * 0.3));
      if (knot > 0.04 && grammar !== 'lamina') {
        ctx.save(); ctx.translate(midX, midY); ctx.rotate(Math.atan2(bBottom.y - aTop.y, bBottom.x - aTop.x));
        ctx.fillStyle = palette.deep; ctx.strokeStyle = palette.light; ctx.lineWidth = Math.max(0.4, band * 0.09); ctx.globalAlpha = strength * (0.35 + knot * 0.55);
        ctx.shadowColor = rgbaColor(palette.deep, 0.5); ctx.shadowBlur = band * 0.55; ctx.beginPath(); ctx.ellipse(0, 0, band * (0.34 + knot * 0.22), band * (0.18 + knot * 0.12), 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.ellipse(0, 0, band * 0.16, band * 0.075, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      if (grammar === 'knot') {
        ctx.save(); ctx.translate(midX, midY); ctx.rotate(i % 2 ? twist : -twist); ctx.globalAlpha = strength * (0.46 + knot * 0.42);
        ctx.strokeStyle = i % 2 ? palette.hot : palette.accent; ctx.lineWidth = Math.max(0.65, band * 0.16); ctx.shadowColor = rgbaColor(palette.deep, 0.5); ctx.shadowBlur = band * 0.38;
        ctx.beginPath(); ctx.moveTo(-band * 0.65, 0); ctx.bezierCurveTo(-band * 0.28, -band * 0.72, band * 0.28, -band * 0.72, band * 0.65, 0);
        ctx.bezierCurveTo(band * 0.28, band * 0.72, -band * 0.28, band * 0.72, -band * 0.65, 0); ctx.stroke();
        ctx.strokeStyle = palette.light; ctx.lineWidth = Math.max(0.35, band * 0.035); ctx.stroke(); ctx.restore();
      }
    }
    ctx.restore();
  }

  function renderPeelWeave(ctx, glyphs, width, height, pixelScale, L, fm, env) {
    var id = 'peelWeave', active = activeGlyphs(env, glyphs, id);
    if (!active.length) return;
    var grammar = option(env, glyphs, id, 'peelGrammar'), layers = number(env, glyphs, id, 'peelLayers');
    var depth = number(env, glyphs, id, 'peelDepth') * pixelScale, band = number(env, glyphs, id, 'peelBand') * pixelScale;
    var twist = number(env, glyphs, id, 'peelTwist'), knot = number(env, glyphs, id, 'peelKnot');
    var primary = env.color(id), palette = richPalette(primary, env.params.accent, env.params.paper);
    var mask = env.buildMask(glyphs, id, width, height, pixelScale, L, fm), maskImage = readMask(mask);
    drawMaterialMask(ctx, env, mask, primary, env.params.accent, 'peel-weave-ground', { alpha: 0.24, depth: Math.max(pixelScale, band * 0.12), sheen: 0.22 });

    var material = scratch(env, 'peel-weave-sheet', width, height, false), mc = material.ctx;
    mc.drawImage(mask, 0, 0); mc.globalCompositeOperation = 'source-in';
    var sheetGradient = mc.createLinearGradient(0, 0, width, height);
    sheetGradient.addColorStop(0, palette.deep); sheetGradient.addColorStop(0.32, palette.base); sheetGradient.addColorStop(0.57, palette.light); sheetGradient.addColorStop(0.75, palette.accent); sheetGradient.addColorStop(1, palette.dark);
    mc.fillStyle = sheetGradient; mc.fillRect(0, 0, width, height); mc.globalCompositeOperation = 'source-over';

    for (var glyphIndex = 0; glyphIndex < active.length; glyphIndex++) {
      var item = active[glyphIndex], bounds = glyphBounds(item.glyph, pixelScale, L), strip = Math.max(2, bounds.h / layers);
      // Isolate this letter before peeling: a full-row source also picks up
      // neighbouring letters and repeats them once for every overlapping clip.
      var glyphSheet = scratch(env, 'peel-weave-isolated-sheet', width, height, false);
      env.drawGlyph(glyphSheet.ctx, item.glyph, pixelScale, L, fm, 1, '#fff');
      var glyphShadow = tintMask(env, glyphSheet.canvas, palette.deep, 'peel-weave-isolated-shadow');
      glyphSheet.ctx.globalCompositeOperation = 'source-in';
      glyphSheet.ctx.drawImage(material.canvas, 0, 0);
      glyphSheet.ctx.globalCompositeOperation = 'source-over';
      for (var layer = 0; layer < layers; layer++) {
        var y = Math.floor(bounds.y + layer * strip), h = Math.ceil(Math.min(bounds.y + bounds.h - y, strip + 1));
        var progress = layer / Math.max(1, layers - 1), phase = progress * Math.PI * (grammar === 'knot' ? 3.4 : 1.35) + twist + glyphIndex * 0.43;
        var wave = Math.sin(phase) * depth * item.strength;
        var offset = grammar === 'braid' ? (layer % 2 ? -1 : 1) * depth * (0.32 + Math.abs(twist) * 0.24) * item.strength : wave;
        var lift = Math.abs(offset) * (0.045 + knot * 0.055) + Math.cos(phase) * depth * twist * 0.035;
        ctx.save(); ctx.beginPath(); ctx.rect(bounds.x - depth - band, y - 1, bounds.w + depth * 2 + band * 2, h + 2); ctx.clip();
        ctx.globalAlpha = item.strength * (0.28 + knot * 0.18); ctx.shadowColor = rgbaColor(palette.deep, 0.62); ctx.shadowBlur = Math.max(1, band * 0.45); ctx.shadowOffsetX = offset * 0.08; ctx.shadowOffsetY = band * 0.28 + lift * 0.15;
        ctx.drawImage(glyphShadow, 0, y, width, h, offset + band * 0.12, y + lift + band * 0.18, width, h);
        ctx.shadowColor = 'transparent'; ctx.globalAlpha = item.strength * (0.76 + 0.22 * (1 - progress));
        ctx.drawImage(glyphSheet.canvas, 0, y, width, h, offset, y + lift, width, h);
        ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = item.strength * 0.38; ctx.fillStyle = palette.pale;
        ctx.fillRect(bounds.x + offset, y + lift, bounds.w, Math.max(0.55, pixelScale * 0.7)); ctx.restore();

        if ((grammar !== 'lamina' || layer % 2 === 0) && maskImage) {
          var edgeCandidates = boundarySamples(maskImage, width, height, bounds, Math.max(4, band * 0.58), 48, env.params.seed + glyphIndex * 41 + layer);
          for (var edge = 0; edge < edgeCandidates.length; edge++) {
            var point = edgeCandidates[edge];
            if (point.y < y - strip * 0.35 || point.y > y + h + strip * 0.35 || hash(edge, layer, env.params.seed + 887) > 0.28 + knot * 0.28) continue;
            var curlLength = band * (0.6 + hash(edge, glyphIndex, env.params.seed + 889) * 1.8) * (0.38 + knot);
            var start = { x: point.x + offset, y: point.y + lift }, tangent = { x: -point.ny, y: point.nx };
            drawRichCurve(ctx, start,
              { x: start.x + point.nx * curlLength * 0.34 + tangent.x * curlLength * twist, y: start.y + point.ny * curlLength * 0.34 + tangent.y * curlLength * twist },
              { x: start.x - point.nx * curlLength * 0.15 + tangent.x * curlLength * (0.6 + twist), y: start.y - point.ny * curlLength * 0.15 + tangent.y * curlLength * (0.6 + twist) },
              { x: start.x + tangent.x * curlLength, y: start.y + tangent.y * curlLength }, Math.max(0.5, band * 0.16), layer % 2 ? palette : Object.assign({}, palette, { base: palette.accent }), item.strength * (0.26 + knot * 0.42));
          }
        }
      }
    }
    drawWeaveConnections(ctx, active, pixelScale, L, palette, band, twist, knot, grammar);

    if (grammar === 'knot') {
      ctx.save(); ctx.strokeStyle = palette.hot; ctx.lineWidth = Math.max(0.6, band * 0.13); ctx.globalAlpha = 0.72;
      ctx.shadowColor = rgbaColor(palette.deep, 0.48); ctx.shadowBlur = band * 0.42;
      for (var k = 0; k < active.length; k++) { var b = glyphBounds(active[k].glyph, pixelScale, L); ctx.beginPath(); ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w * 0.34, b.h * 0.18, twist + k * 0.18, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
    }
  }

  function renderVoidPressure(ctx, glyphs, width, height, pixelScale, L, fm, env) {
    var id = 'voidPressure', active = activeGlyphs(env, glyphs, id);
    if (!active.length) return;
    var mode = option(env, glyphs, id, 'voidPressureMode'), force = number(env, glyphs, id, 'voidPressureForce');
    var reach = number(env, glyphs, id, 'voidPressureReach') * pixelScale, rupture = number(env, glyphs, id, 'voidPressureRupture');
    var axis = number(env, glyphs, id, 'voidPressureAxis') * Math.PI / 180, primary = env.color(id), palette = richPalette(primary, env.params.accent, env.params.paper);
    var mask = env.buildMask(glyphs, id, width, height, pixelScale, L, fm), maskImage = readMask(mask), holes = maskVoids(mask, pixelScale);
    var gaps = [];
    for (var gap = 1; gap < active.length; gap++) {
      if ((active[gap - 1].glyph.line || 0) !== (active[gap].glyph.line || 0)) continue;
      var left = glyphBounds(active[gap - 1].glyph, pixelScale, L), right = glyphBounds(active[gap].glyph, pixelScale, L);
      gaps.push({ x: (left.x + left.w + right.x) * 0.5, y: (left.y + left.h * 0.5 + right.y + right.h * 0.5) * 0.5,
        rx: Math.max(2, reach * force * 0.068), ry: Math.max(left.h, right.h) * 0.31, area: Math.max(left.h, right.h) * reach, kind: 'gutter' });
    }
    if (!holes.length) holes = fallbackVoidCenters(active, pixelScale, L);
    var breaches = [];
    if (mode === 'breach' && maskImage) {
      var breachStride = Math.max(2, Math.ceil(active.length / 8));
      for (var breachGlyph = 0; breachGlyph < active.length && breaches.length < 10; breachGlyph += breachStride) {
        var breachBounds = glyphBounds(active[breachGlyph].glyph, pixelScale, L);
        var breachEdges = boundarySamples(maskImage, width, height, breachBounds, Math.max(4, reach * 0.07), 18, env.params.seed + breachGlyph * 59);
        if (!breachEdges.length) continue;
        var breachEdge = breachEdges[Math.floor(hash(breachGlyph, 61, env.params.seed) * breachEdges.length) % breachEdges.length];
        var breachDepth = reach * force * (0.035 + rupture * 0.035);
        breaches.push({
          x: breachEdge.x - breachEdge.nx * breachDepth,
          y: breachEdge.y - breachEdge.ny * breachDepth,
          rx: Math.max(pixelScale * 2.5, reach * force * (0.052 + rupture * 0.036)),
          ry: Math.max(pixelScale * 2, reach * force * (0.028 + rupture * 0.024)),
          area: breachDepth * reach,
          kind: 'breach',
          angle: Math.atan2(breachEdge.ny, breachEdge.nx) + (hash(breachGlyph, 67, env.params.seed) - 0.5) * 0.62
        });
      }
    }
    var pressureVoids = mode === 'gutter' ? gaps : holes.slice(0, 18).map(function (hole) { return Object.assign({ kind: 'counter' }, hole); });
    if (mode === 'breach') pressureVoids = breaches;
    if (!pressureVoids.length) pressureVoids = fallbackVoidCenters(active, pixelScale, L);

    drawMaterialMask(ctx, env, mask, primary, env.params.accent, 'void-pressure-ground', {
      alpha: 0.18, depth: Math.max(pixelScale * 0.7, reach * force * 0.012), sheen: 0.28, angle: axis - 0.6
    });

    var shift = reach * force * (0.13 + rupture * 0.075), bands = 7;
    for (var i = 0; i < active.length; i++) {
      var item = active[i], b = glyphBounds(item.glyph, pixelScale, L), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      var nearest = pressureVoids[0], nearestDistance = Infinity;
      for (var pv = 0; pv < pressureVoids.length; pv++) {
        var candidateDistance = Math.hypot(pressureVoids[pv].x - cx, pressureVoids[pv].y - cy);
        if (candidateDistance < nearestDistance) { nearest = pressureVoids[pv]; nearestDistance = candidateDistance; }
      }
      var pcx = nearest && nearestDistance < Math.max(b.w, b.h) * 1.4 ? nearest.x : cx;
      var pcy = nearest && nearestDistance < Math.max(b.w, b.h) * 1.4 ? nearest.y : cy;
      var span = Math.hypot(b.w, b.h) * 0.72, bandWidth = span * 2 / bands;
      for (var slice = 0; slice < bands; slice++) {
        var start = -span + slice * bandWidth, end = start + bandWidth + 1;
        var signed = (slice + 0.5) / bands * 2 - 1, direction = signed < 0 ? -1 : 1;
        var pressure = Math.pow(1 - Math.min(1, Math.abs(signed)), 0.62);
        var localShift = direction * shift * item.strength * (0.38 + pressure * 0.82);
        var tangentShift = Math.sin(slice * 1.73 + i * 0.81) * shift * rupture * 0.1;
        var dx = Math.cos(axis) * localShift - Math.sin(axis) * tangentShift;
        var dy = Math.sin(axis) * localShift + Math.cos(axis) * tangentShift;
        var rotation = direction * rupture * pressure * 4.2;
        var moved = shiftedGlyph(item.glyph, dx, dy, rotation, pixelScale, L);
        ctx.save(); clipAxisBand(ctx, pcx, pcy, axis, start, end, width, height);
        var shadow = shiftedGlyph(moved, pixelScale * 1.1, pixelScale * 1.6, 0, pixelScale, L);
        env.drawGlyph(ctx, shadow, pixelScale, L, fm, item.strength * 0.38, palette.deep);
        env.drawGlyph(ctx, moved, pixelScale, L, fm, item.strength, slice % 3 === 1 ? palette.accent : palette.base);
        var shine = shiftedGlyph(moved, -pixelScale * 0.55, -pixelScale * 0.5, 0, pixelScale, L);
        ctx.globalCompositeOperation = 'screen'; env.drawGlyph(ctx, shine, pixelScale, L, fm, item.strength * (0.14 + pressure * 0.12), palette.pale); ctx.restore();
      }
    }

    // Draw the hot pressure rim first, then remove the expanding void. This
    // leaves a colored lip around an actually transparent counter or gutter.
    for (var h = 0; h < pressureVoids.length && h < 24; h++) {
      var hole = pressureVoids[h], expand = reach * force * (0.075 + rupture * 0.2);
      var holeAngle = hole.kind === 'breach' ? hole.angle : axis + h * 0.07;
      var holeRoughness = hole.kind === 'breach' ? 0.24 + rupture * 0.16 : (hole.kind === 'gutter' ? 0.07 + rupture * 0.05 : 0.11 + rupture * 0.1);
      var expandX = hole.kind === 'gutter' ? expand * 0.55 : expand;
      var expandY = hole.kind === 'breach' ? expand * 0.46 : (hole.kind === 'gutter' ? expand * 0.38 : expand * 0.72);
      ctx.save(); ctx.strokeStyle = h % 3 ? palette.hot : palette.light; ctx.globalAlpha = 0.34 + rupture * 0.34;
      ctx.shadowColor = rgbaColor(palette.accent, 0.55); ctx.shadowBlur = Math.max(2, expand * 0.22); ctx.lineWidth = Math.max(pixelScale * 0.6, expand * 0.08);
      for (var ring = 3; ring >= 1; ring--) {
        ctx.globalAlpha = (0.12 + rupture * 0.14) * ring;
        organicLoopPath(ctx, hole.x, hole.y, hole.rx + expandX * (0.42 + ring * 0.18), hole.ry + expandY * (0.42 + ring * 0.16), holeAngle,
          holeRoughness * (0.7 + ring * 0.1), env.params.seed + h * 149 + ring * 11); ctx.stroke();
      }
      ctx.restore();
      ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 0.96;
      organicLoopPath(ctx, hole.x, hole.y, hole.rx + expandX, hole.ry + expandY, holeAngle, holeRoughness, env.params.seed + h * 149 + 43); ctx.fill(); ctx.restore();
      ctx.save(); ctx.strokeStyle = palette.hot; ctx.globalAlpha = 0.78; ctx.lineWidth = Math.max(0.5, pixelScale * (0.8 + rupture * 1.8));
      organicLoopPath(ctx, hole.x, hole.y, hole.rx + expandX * 1.01, hole.ry + expandY * 1.01, holeAngle, holeRoughness, env.params.seed + h * 149 + 43, -Math.PI * 0.88, Math.PI * 0.72); ctx.stroke(); ctx.restore();
    }

    if (mode === 'breach' && pressureVoids.length > 1) {
      for (var breach = 1; breach < pressureVoids.length && breach < 12; breach++) {
        var from = pressureVoids[breach - 1], to = pressureVoids[breach];
        var distance = Math.hypot(to.x - from.x, to.y - from.y);
        if (distance > reach * force * 2.8 + Math.max(from.rx, from.ry, to.rx, to.ry)) continue;
        var tunnel = Math.max(pixelScale * 2, reach * force * (0.055 + rupture * 0.07));
        var bend = (hash(breach, 73, env.params.seed) - 0.5) * distance * 0.42;
        var vx = to.x - from.x, vy = to.y - from.y, mag = Math.max(1, Math.hypot(vx, vy)), nx = -vy / mag, ny = vx / mag;
        ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = palette.hot; ctx.globalAlpha = 0.72; ctx.lineWidth = tunnel * 1.35; ctx.shadowColor = rgbaColor(palette.accent, 0.62); ctx.shadowBlur = tunnel;
        ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.bezierCurveTo(from.x + vx * 0.34 + nx * bend, from.y + vy * 0.34 + ny * bend, from.x + vx * 0.68 - nx * bend * 0.3, from.y + vy * 0.68 - ny * bend * 0.3, to.x, to.y); ctx.stroke();
        ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 1; ctx.lineWidth = tunnel;
        ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.bezierCurveTo(from.x + vx * 0.34 + nx * bend, from.y + vy * 0.34 + ny * bend, from.x + vx * 0.68 - nx * bend * 0.3, from.y + vy * 0.68 - ny * bend * 0.3, to.x, to.y); ctx.stroke(); ctx.restore();
      }
    }

    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = palette.accent;
    for (var j = 0; j < pressureVoids.length && j < 20; j++) {
      var center = pressureVoids[j], cracks = mode === 'breach' ? 9 : 5;
      for (var crack = 0; crack < cracks; crack++) {
        var a = axis + (crack / cracks - 0.5) * Math.PI * (mode === 'breach' ? 1.85 : 0.9) + (hash(j, crack, env.params.seed + 931) - 0.5) * 0.26;
        var inner = Math.max(center.rx, center.ry) * (0.74 + rupture * 0.24), outer = inner + reach * force * (0.16 + hash(j, crack, env.params.seed) * 0.28);
        var mid = inner + (outer - inner) * (0.42 + hash(crack, j, env.params.seed + 937) * 0.18), kink = (hash(crack, j, 91) - 0.5) * 0.3;
        ctx.globalAlpha = 0.38 + rupture * 0.5; ctx.lineWidth = Math.max(0.42, pixelScale * (0.62 + rupture * 1.32));
        ctx.beginPath(); ctx.moveTo(center.x + Math.cos(a) * inner, center.y + Math.sin(a) * inner);
        ctx.lineTo(center.x + Math.cos(a + kink) * mid, center.y + Math.sin(a + kink) * mid);
        ctx.lineTo(center.x + Math.cos(a - kink * 0.35) * outer, center.y + Math.sin(a - kink * 0.35) * outer); ctx.stroke();
      }
    }
    if (maskImage) {
      for (var glyphEdge = 0; glyphEdge < active.length; glyphEdge++) {
        var edgeBounds = glyphBounds(active[glyphEdge].glyph, pixelScale, L), pressureEdges = boundarySamples(maskImage, width, height, edgeBounds, Math.max(5, reach * 0.08), 28, env.params.seed + glyphEdge * 43);
        for (var pe = 0; pe < pressureEdges.length; pe++) {
          var edgePoint = pressureEdges[pe], alignment = Math.abs(edgePoint.nx * Math.cos(axis) + edgePoint.ny * Math.sin(axis));
          if (alignment < 0.62 || hash(pe, glyphEdge, env.params.seed + 941) > 0.34 + rupture * 0.25) continue;
          ctx.strokeStyle = pe % 3 ? palette.light : palette.hot; ctx.globalAlpha = 0.34 + alignment * 0.38; ctx.lineWidth = Math.max(0.35, pixelScale * 0.52);
          ctx.beginPath(); ctx.moveTo(edgePoint.x - edgePoint.nx * pixelScale * 1.5, edgePoint.y - edgePoint.ny * pixelScale * 1.5);
          ctx.lineTo(edgePoint.x - edgePoint.nx * reach * force * 0.08, edgePoint.y - edgePoint.ny * reach * force * 0.08); ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  var RENDERERS = {
    fiberBody: renderFiberBody,
    glyphMutation: renderGlyphMutation,
    suspendedSyntax: renderSuspendedSyntaxTaste,
    livingTextField: renderLivingTextField,
    innerEruption: renderInnerEruption,
    recursiveGraft: renderRecursiveGraft,
    structuralCollision: renderStructuralCollision,
    peelWeave: renderPeelWeave,
    voidPressure: renderVoidPressure
  };

  function render(id, ctx, glyphs, width, height, pixelScale, L, fm, env) {
    if (!RENDERERS[id]) return false;
    RENDERERS[id](ctx, glyphs, width, height, pixelScale, L, fm, env);
    return true;
  }

  function effectPad(id, profile, fontSize) {
    profile = profile || {}; fontSize = Number(fontSize) || 52;
    switch (id) {
      case 'fiberBody': return (profile.fiberUnit || 7) * (1 + (profile.fiberFray || 0) * 3);
      case 'glyphMutation': return (profile.mutationDisplace || 0) + (profile.mutationSeam || 0) * 2;
      case 'suspendedSyntax': return (profile.suspensionDrop || 0) * 0.8 + (profile.suspensionTypeSize || 0) * 1.8 + (profile.suspensionCable || 0) * 6 + fontSize * 0.1;
      case 'livingTextField': return (profile.livingDrift || 0) * (profile.livingMotion || 0) + (profile.livingCell || 0) * 2;
      case 'innerEruption': return (profile.eruptionReach || 0) * (profile.eruptionForce || 0) * 0.72 + fontSize * 0.28;
      case 'recursiveGraft': return (profile.graftReach || 0) * 3.15 + (profile.graftFusion || 0) * 1.2 + (profile.graftWeight || 0) * 5 + fontSize * 0.16;
      case 'structuralCollision': return (profile.collisionForce || 0) * Math.max(1.25, ((profile.collisionBodies || 2) - 1) * 0.86) + (profile.collisionSeam || 0) * 3 + fontSize * 0.08;
      case 'peelWeave': return (profile.peelDepth || 0) + (profile.peelBand || 0) * 2;
      case 'voidPressure': return (profile.voidPressureReach || 0) * (0.35 + (profile.voidPressureForce || 0) * 0.3) + fontSize * 0.15;
      default: return 0;
    }
  }

  function requiresAnimation(id, profile) {
    return id === 'livingTextField' && Number(profile && profile.livingMotion) > 0.001;
  }

  root.TypeDeformerStructuralOperators = {
    ids: IDS.slice(),
    schemas: SCHEMAS,
    render: render,
    effectPad: effectPad,
    requiresAnimation: requiresAnimation,
    internals: {
      clamp: clamp,
      hash: hash,
      cleanPhrase: cleanPhrase,
      pointOnGlyph: pointOnGlyph,
      suspensionPointOnGlyph: suspensionPointOnGlyph,
      suspensionGlyphBounds: suspensionGlyphBounds,
      suspensionMass: suspensionMass,
      solveSuspensionCable: solveSuspensionCable,
      cablePointAt: cablePointAt,
      solveSuspensionBeam: solveSuspensionBeam,
      beamDeflectionAt: beamDeflectionAt,
      buildSuspensionMobile: buildSuspensionMobile,
      suspensionMobileDepth: suspensionMobileDepth,
      findInteriorVoids: findInteriorVoids,
      buildRecursiveBranches: buildRecursiveBranches
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
