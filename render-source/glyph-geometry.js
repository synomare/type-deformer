// Canonical glyph-geometry declarations. Bundled for both editor and Worker.
// Environment dependencies are declared in manifest.json.

      var batchResolvedProfiles = new Map();

      var batchResolvedSource = batchProfiles;

      var batchResolvedDictionary = CONFUSE_DATA;

      function sourceParameterProfile(base, glyph) {
        if (!glyph || !glyph.localParams) return base;
        var cache = glyph.localParameterCache;
        if (!cache || cache.base !== base || cache.local !== glyph.localParams) {
          cache = glyph.localParameterCache = { base: base, local: glyph.localParams,
            value: Object.assign(Object.create(base), glyph.localParams) };
        }
        return cache.value;
      }

      function batchSourceText(glyph) {
        if (typeof glyph === 'string') return glyph;
        if (!glyph) return '';
        if (glyph.el) return glyph.el.dataset.sourceText || glyph.el.textContent || '';
        return glyph.sourceText || glyph.ch || '';
      }

      function batchProfileForKey(key, glyph) {
        if (batchResolvedSource !== batchProfiles || batchResolvedDictionary !== CONFUSE_DATA) {
          batchResolvedProfiles.clear(); batchResolvedSource = batchProfiles; batchResolvedDictionary = CONFUSE_DATA;
        }
        var text = batchSourceText(glyph);
        var definition = BATCH_TARGETS.byKey[key];
        var parent = definition && definition.test ? definition.parent : key;
        var base = batchProfiles[parent] || params;
        var cacheKey = key + '\u0000' + text;
        if (batchResolvedProfiles.has(cacheKey)) {
          var cached = batchResolvedProfiles.get(cacheKey);
          return glyph && glyph.localParams ? sourceParameterProfile(cached, glyph) : cached;
        }
        var candidates = text ? BATCH_TARGETS.keys(text) : [key];
        var resolved = base;
        for (var i = 0; i < candidates.length; i++) {
          var target = candidates[i];
          if (!BATCH_TARGETS.byKey[target] || !BATCH_TARGETS.byKey[target].test || !batchProfiles[target]) continue;
          if (resolved === base) resolved = Object.create(base);
          Object.assign(resolved, batchProfiles[target]);
        }
        if (batchResolvedProfiles.size >= 4096) batchResolvedProfiles.clear();
        batchResolvedProfiles.set(cacheKey, resolved);
        return glyph && glyph.localParams ? sourceParameterProfile(resolved, glyph) : resolved;
      }

      var graphemeSegmenter = (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function')
        ? new Intl.Segmenter('ja', { granularity: 'grapheme' }) : null;

      function toGraphemes(str) {
        if (graphemeSegmenter) {
          return Array.from(graphemeSegmenter.segment(str), function (entry) { return entry.segment; });
        }
        return fallbackGraphemes(str);
      }

      function fallbackGraphemes(str) {
        return TypeDeformerTextLayout.fallbackGraphemes(str);
      }

      var uni = (function () {
        try {
          return {
            punct: new RegExp('\\p{P}', 'u'),
            hira: new RegExp('\\p{sc=Hiragana}', 'u'),
            kata: new RegExp('\\p{sc=Katakana}', 'u'),
            han: new RegExp('[\\p{sc=Han}\\p{sc=Hangul}]', 'u'),
            latin: new RegExp('[\\p{sc=Latin}0-9]', 'u'),
            // approximation of UAX#50: what stays upright in vertical flow
            upright: new RegExp('[\\p{sc=Han}\\p{sc=Hiragana}\\p{sc=Katakana}\\p{sc=Hangul}\\p{sc=Bopomofo}\\p{sc=Yi}\\uFF01-\\uFF60\\uFFE0-\\uFFE6\\u3000-\\u303F\\u3190-\\u319F\\u3200-\\u32FF\\u3300-\\u33FF\\u2460-\\u24FF\\u3040-\\u30FF\\uFE30-\\uFE4F]|\\p{Extended_Pictographic}', 'u'),
            rtl: new RegExp('[\\p{sc=Arabic}\\p{sc=Hebrew}\\p{sc=Syriac}\\p{sc=Thaana}\\p{sc=Nko}]', 'u'),
            // scripts whose letters connect / reshape across characters —
            // kept together per word so shaping survives the span split
            joining: new RegExp('[\\p{sc=Arabic}\\p{sc=Syriac}\\p{sc=Mongolian}\\p{sc=Nko}\\p{sc=Devanagari}\\p{sc=Bengali}\\p{sc=Gurmukhi}\\p{sc=Gujarati}\\p{sc=Oriya}\\p{sc=Tamil}\\p{sc=Telugu}\\p{sc=Kannada}\\p{sc=Malayalam}\\p{sc=Sinhala}\\p{sc=Myanmar}\\p{sc=Khmer}\\p{sc=Lao}\\p{sc=Thai}\\p{sc=Tibetan}]', 'u')
          };
        } catch (e) { return null; }
      })();

      function classify(ch, cp) {
        if (uni) {
          if (uni.hira.test(ch)) return 'hira';
          if (uni.kata.test(ch)) return 'kata';
          if (uni.han.test(ch)) return 'kanji';
          if (uni.latin.test(ch)) return 'latin';
          return 'other';
        }
        if ((cp >= 0x0041 && cp <= 0x024F) || (cp >= 0x0030 && cp <= 0x0039)) return 'latin';
        if (cp >= 0x3040 && cp <= 0x309F) return 'hira';
        if (cp >= 0x30A0 && cp <= 0x30FF) return 'kata';
        if (cp >= 0x4E00 && cp <= 0x9FFF) return 'kanji';
        return 'other';
      }

      var punctStr = '、。，．！？・：；（）［］｛｝「」『』—…‥,.!?;:(){}[]—–…‥';

      function isPunctCluster(ch) {
        return uni ? uni.punct.test(ch) : punctStr.indexOf(ch) !== -1;
      }

      var charInfoCache = new Map();

      function charInfo(ch, cp) {
        var c = charInfoCache.get(ch);
        if (!c) {
          if (charInfoCache.size > 20000) charInfoCache.clear();
          var cls = classify(ch, cp);
          c = {
            cls: cls,
            punct: isPunctCluster(ch),
            upright: uni ? uni.upright.test(ch) : cls !== 'latin',
            joins: !!(uni && uni.joining.test(ch)),
            rtl: !!(uni && uni.rtl.test(ch))
          };
          charInfoCache.set(ch, c);
        }
        return c;
      }

      function batchKeyFor(ch, cp, info) {
        return BATCH_TARGETS.family(ch);
      }

      function hash(j, cp, k) {
        return (Math.abs(Math.sin((j + 1) * (cp + 1) * (k + params.seed * 13.37))) * 43758.5453) % 1;
      }

      function tokenizeLine(line) {
        return TypeDeformerTextLayout.tokenizeLine(line, toGraphemes, charInfo);
      }

      var EMPTY_OPERATOR_STATE = Object.freeze({ toggled: false, hovered: false, current: 0, manual: null });

      function readOperatorState(m, id) {
        return m && m.operatorStates && m.operatorStates[id]
          ? m.operatorStates[id]
          : EMPTY_OPERATOR_STATE;
      }

      function numericManual(state, fallback) {
        return state.manual != null && isFinite(Number(state.manual)) ? Number(state.manual) : fallback;
      }

      function buildSurfaceMask(glyphs, id, width, height, pixelScale, L, fm) {
        var mask = surfaceScratch('mask-' + id, width, height, true);
        for (var i = 0; i < glyphs.length; i++) {
          var strength = surfaceGlyphStrength(glyphs[i], id);
          if (strength > 0.002) drawSurfaceGlyph(mask.ctx, glyphs[i], pixelScale, L, fm, strength);
        }
        return mask.canvas;
      }

      function paintSurfaceMask(targetCtx, mask, color, opacity, name) {
        if (opacity <= 0.001) return;
        var painted = surfaceScratch(name, mask.width, mask.height, false);
        painted.ctx.drawImage(mask, 0, 0);
        painted.ctx.globalCompositeOperation = 'source-in';
        painted.ctx.fillStyle = color;
        painted.ctx.fillRect(0, 0, mask.width, mask.height);
        painted.ctx.globalCompositeOperation = 'source-over';
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.globalAlpha = opacity;
        targetCtx.drawImage(painted.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function compositeSurfaceSource(targetCtx, mask, id, coverBase) {
        if (!coverBase) return;
        var sourceOpacity = surfaceSourceOpacity(id);
        if (sourceOpacity >= 0.999) return;
        var veilOpacity = 1 - sourceOpacity;
        // The paper veil is continuous: presets are only convenient points on
        // the same 0–100% control. Effect ink is always painted separately.
        if (veilOpacity < 0.995) {
          paintSurfaceMask(targetCtx, mask, params.paper, veilOpacity, id + '-source');
          return;
        }
        // Repeated, slightly offset impressions saturate the anti-aliased edge.
        // A single paper pass leaves a dark hairline from the DOM glyph below.
        var veil = surfaceScratch(id + '-source-hide', mask.width, mask.height, false);
        var spread = 0.82;
        veil.ctx.drawImage(mask, 0, 0);
        veil.ctx.drawImage(mask, 0, 0);
        veil.ctx.drawImage(mask, -spread, 0);
        veil.ctx.drawImage(mask, spread, 0);
        veil.ctx.drawImage(mask, 0, -spread);
        veil.ctx.drawImage(mask, 0, spread);
        paintSurfaceMask(targetCtx, veil.canvas, params.paper, 1, id + '-source');
      }

      function sampleMaskNeighborhoodAlpha(data, width, height, x, y, radius) {
        var offsets = [-1, 0, 1];
        var maximum = 0, total = 0, count = 0;
        var reach = Math.max(1, radius || 1);
        for (var oy = 0; oy < offsets.length; oy++) for (var ox = 0; ox < offsets.length; ox++) {
          var px = Math.max(0, Math.min(width - 1, Math.round(x + offsets[ox] * reach)));
          var py = Math.max(0, Math.min(height - 1, Math.round(y + offsets[oy] * reach)));
          var value = data[(py * width + px) * 4 + 3] / 255;
          maximum = Math.max(maximum, value);
          total += value;
          count++;
        }
        return maximum * 0.72 + total / Math.max(1, count) * 0.28;
      }

      function sampleSurfaceMask(mask, density, edgeOnly, maxCount) {
        var ctx = mask.getContext('2d', { willReadFrequently: true });
        var data;
        try { data = ctx.getImageData(0, 0, mask.width, mask.height).data; }
        catch (error) { return []; }
        var step = Math.max(2, Math.round((edgeOnly ? 8 : 11) - Math.max(0, Math.min(1, density)) * (edgeOnly ? 6 : 8)));
        var points = [];
        var reach = Math.max(1, Math.floor(step * 0.6));
        for (var y = Math.floor(step / 2); y < mask.height; y += step) {
          for (var x = Math.floor(step / 2); x < mask.width; x += step) {
            var alpha = data[(y * mask.width + x) * 4 + 3];
            if (alpha < 6) continue;
            if (edgeOnly) {
              var left = data[(y * mask.width + Math.max(0, x - reach)) * 4 + 3];
              var right = data[(y * mask.width + Math.min(mask.width - 1, x + reach)) * 4 + 3];
              var top = data[(Math.max(0, y - reach) * mask.width + x) * 4 + 3];
              var bottom = data[(Math.min(mask.height - 1, y + reach) * mask.width + x) * 4 + 3];
              if (left > 24 && right > 24 && top > 24 && bottom > 24) continue;
            }
            points.push({ x: x, y: y, alpha: alpha / 255 });
          }
        }
        if (points.length <= maxCount) return points;
        var reduced = [];
        var stride = points.length / maxCount;
        for (var i = 0; i < maxCount; i++) reduced.push(points[Math.floor(i * stride)]);
        return reduced;
      }

      function orderedPlotterPoints(points, definition, jitter) {
        if (points.length < 2) return points.slice();
        var remaining = points.slice();
        var start = Math.floor(hash(points.length, params.seed % 97, 419) * remaining.length);
        var ordered = [remaining.splice(start, 1)[0]];
        while (remaining.length) {
          var current = ordered[ordered.length - 1];
          var bestIndex = 0, bestDistance = Infinity;
          var tries = Math.min(remaining.length, Math.max(4, Math.round(definition)));
          for (var c = 0; c < tries; c++) {
            var candidateIndex = Math.floor(hash(ordered.length + c * 17, remaining.length + c, params.seed + 431) * remaining.length);
            var candidate = remaining[candidateIndex];
            var dx = candidate.x - current.x, dy = candidate.y - current.y;
            var distance = dx * dx + dy * dy;
            if (distance < bestDistance) { bestDistance = distance; bestIndex = candidateIndex; }
          }
          ordered.push(remaining.splice(bestIndex, 1)[0]);
        }
        if (jitter > 0.001) {
          for (var i = 0; i < ordered.length; i++) {
            ordered[i] = {
              x: ordered[i].x + (hash(i, params.seed % 53, 443) * 2 - 1) * jitter,
              y: ordered[i].y + (hash(i, params.seed % 47, 457) * 2 - 1) * jitter,
              alpha: ordered[i].alpha
            };
          }
        }
        return ordered;
      }

      function strokeSurfaceCurve(ctx, a, b, phase, tension, salt, spread) {
        var curve = surfaceCurveSpec(a, b, phase, tension, salt, spread);
        ctx.beginPath();
        ctx.moveTo(curve.x0, curve.y0);
        ctx.bezierCurveTo(curve.x1, curve.y1, curve.x2, curve.y2, curve.x3, curve.y3);
        ctx.stroke();
      }

      function cubicSurfacePoint(curve, t) {
        var mt = 1 - t;
        var mt2 = mt * mt, t2 = t * t;
        return {
          x: curve.x0 * mt2 * mt + 3 * curve.x1 * mt2 * t + 3 * curve.x2 * mt * t2 + curve.x3 * t2 * t,
          y: curve.y0 * mt2 * mt + 3 * curve.y1 * mt2 * t + 3 * curve.y2 * mt * t2 + curve.y3 * t2 * t
        };
      }

      function fillOrganicNode(ctx, node, phase, branching, salt) {
        var steps = 12;
        ctx.beginPath();
        for (var i = 0; i <= steps; i++) {
          var angle = i / steps * Math.PI * 2;
          var wobble = 1 + Math.sin(angle * 3 + phase * 1.4 + salt) * (0.035 + branching * 0.075) +
            (hash(i, salt, params.seed + 557) * 2 - 1) * branching * 0.055;
          var x = node.x + Math.cos(angle) * node.r * wobble;
          var y = node.y + Math.sin(angle) * node.r * wobble;
          if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
      }

      function tracePointKeyV34(point, step) {
        return Math.round(point.x * 2 / step) + ':' + Math.round(point.y * 2 / step);
      }

      function tracePathMetricsV34(path) {
        var points = path.points || path;
        var cumulative = [0];
        var length = 0;
        for (var i = 1; i < points.length; i++) {
          var dx = points[i].x - points[i - 1].x;
          var dy = points[i].y - points[i - 1].y;
          length += Math.sqrt(dx * dx + dy * dy);
          cumulative.push(length);
        }
        path.length = length;
        path.cumulative = cumulative;
        return path;
      }

      function traceSimplifyPointsV34(points, tolerance) {
        if (points.length < 4) return points.slice();
        var simplified = [points[0]];
        for (var i = 1; i < points.length - 1; i++) {
          var previous = simplified[simplified.length - 1];
          var current = points[i];
          var next = points[i + 1];
          var dx = current.x - previous.x, dy = current.y - previous.y;
          if (dx * dx + dy * dy < tolerance * tolerance) continue;
          var ax = current.x - previous.x, ay = current.y - previous.y;
          var bx = next.x - current.x, by = next.y - current.y;
          var cross = Math.abs(ax * by - ay * bx);
          var span = Math.max(1, Math.sqrt((next.x - previous.x) * (next.x - previous.x)
            + (next.y - previous.y) * (next.y - previous.y)));
          if (cross / span < tolerance * 0.12 && ax * bx + ay * by >= 0) continue;
          simplified.push(current);
        }
        simplified.push(points[points.length - 1]);
        return simplified;
      }

      function traceMaskContoursV34(mask, density, animated) {
        var width = mask.width, height = mask.height;
        var source;
        try { source = mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height).data; }
        catch (error) { return []; }
        var densityNorm = Math.max(0, Math.min(1, Math.log(1 + density * 2.4) / Math.log(10.6)));
        var areaBudget = animated ? 150000 : 260000;
        var areaStep = Math.max(1, Math.ceil(Math.sqrt(width * height / areaBudget)));
        var step = Math.max(areaStep, Math.max(2, Math.round(10 - densityNorm * 8)));
        var maxSegments = Math.min(7200, Math.max(900, Math.round(1300 + density * 1250)));
        var segments = [];

        function inside(x, y) {
          x = Math.max(0, Math.min(width - 1, Math.round(x)));
          y = Math.max(0, Math.min(height - 1, Math.round(y)));
          return source[(y * width + x) * 4 + 3] >= 32;
        }
        function addSegment(a, b) {
          segments.push({ a: a, b: b, ak: tracePointKeyV34(a, step), bk: tracePointKeyV34(b, step) });
        }

        contourScan:
        for (var y = 0; y < height - step; y += step) {
          for (var x = 0; x < width - step; x += step) {
            var state = (inside(x, y) ? 1 : 0) | (inside(x + step, y) ? 2 : 0)
              | (inside(x + step, y + step) ? 4 : 0) | (inside(x, y + step) ? 8 : 0);
            if (!state || state === 15) continue;
            var top = { x: x + step * 0.5, y: y };
            var right = { x: x + step, y: y + step * 0.5 };
            var bottom = { x: x + step * 0.5, y: y + step };
            var left = { x: x, y: y + step * 0.5 };
            var centreInside = inside(x + step * 0.5, y + step * 0.5);
            if (state === 1) addSegment(top, left);
            else if (state === 2) addSegment(right, top);
            else if (state === 3) addSegment(right, left);
            else if (state === 4) addSegment(bottom, right);
            else if (state === 5) {
              if (centreInside) { addSegment(top, right); addSegment(bottom, left); }
              else { addSegment(top, left); addSegment(bottom, right); }
            } else if (state === 6) addSegment(bottom, top);
            else if (state === 7) addSegment(bottom, left);
            else if (state === 8) addSegment(left, bottom);
            else if (state === 9) addSegment(top, bottom);
            else if (state === 10) {
              if (centreInside) { addSegment(top, left); addSegment(right, bottom); }
              else { addSegment(top, right); addSegment(left, bottom); }
            } else if (state === 11) addSegment(right, bottom);
            else if (state === 12) addSegment(left, right);
            else if (state === 13) addSegment(top, right);
            else if (state === 14) addSegment(left, top);
            if (segments.length >= maxSegments) break contourScan;
          }
        }
        if (!segments.length) return [];

        var adjacency = Object.create(null);
        for (var segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
          var segment = segments[segmentIndex];
          (adjacency[segment.ak] || (adjacency[segment.ak] = [])).push(segmentIndex);
          (adjacency[segment.bk] || (adjacency[segment.bk] = [])).push(segmentIndex);
        }
        var visited = new Uint8Array(segments.length);
        var paths = [];

        function extend(points, key, prepend) {
          var guard = 0;
          while (guard++ < segments.length) {
            var connected = adjacency[key] || [];
            var nextIndex = -1;
            for (var c = 0; c < connected.length; c++) {
              if (!visited[connected[c]]) { nextIndex = connected[c]; break; }
            }
            if (nextIndex < 0) break;
            visited[nextIndex] = 1;
            var nextSegment = segments[nextIndex];
            var point, nextKey;
            if (nextSegment.ak === key) { point = nextSegment.b; nextKey = nextSegment.bk; }
            else { point = nextSegment.a; nextKey = nextSegment.ak; }
            if (prepend) points.unshift(point); else points.push(point);
            key = nextKey;
          }
        }

        for (var startIndex = 0; startIndex < segments.length; startIndex++) {
          if (visited[startIndex]) continue;
          var start = segments[startIndex];
          visited[startIndex] = 1;
          var points = [start.a, start.b];
          extend(points, start.bk, false);
          extend(points, start.ak, true);
          points = traceSimplifyPointsV34(points, step * 0.34);
          if (points.length < 3) continue;
          var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          var centerX = 0, centerY = 0;
          for (var pointIndex = 0; pointIndex < points.length; pointIndex++) {
            minX = Math.min(minX, points[pointIndex].x); minY = Math.min(minY, points[pointIndex].y);
            maxX = Math.max(maxX, points[pointIndex].x); maxY = Math.max(maxY, points[pointIndex].y);
            centerX += points[pointIndex].x; centerY += points[pointIndex].y;
          }
          var path = {
            points: points,
            centerX: centerX / points.length,
            centerY: centerY / points.length,
            bounds: [minX, minY, maxX, maxY],
            closed: Math.abs(points[0].x - points[points.length - 1].x) <= step
              && Math.abs(points[0].y - points[points.length - 1].y) <= step,
            glyphIndex: -1
          };
          tracePathMetricsV34(path);
          if (path.length >= step * 2.4) paths.push(path);
        }
        paths.sort(function (a, b) { return b.length - a.length; });
        var pointBudget = Math.min(5600, Math.max(1400, Math.round(1900 + density * 960)));
        var retained = [], usedPoints = 0;
        for (var pathIndex = 0; pathIndex < paths.length && retained.length < 220; pathIndex++) {
          var candidate = paths[pathIndex];
          if (usedPoints >= pointBudget) break;
          if (usedPoints + candidate.points.length > pointBudget) {
            var allowed = pointBudget - usedPoints;
            if (allowed < 3) break;
            var reduced = [];
            var stride = candidate.points.length / allowed;
            for (var rp = 0; rp < allowed; rp++) reduced.push(candidate.points[Math.min(candidate.points.length - 1, Math.floor(rp * stride))]);
            candidate.points = reduced;
            tracePathMetricsV34(candidate);
          }
          retained.push(candidate);
          usedPoints += candidate.points.length;
        }
        return retained;
      }

      function traceAssignGlyphsV34(paths, glyphs, pixelScale, L) {
        var centers = [];
        for (var i = 0; i < glyphs.length; i++) {
          if (surfaceGlyphStrength(glyphs[i], 'plotterTrace') <= 0.002) continue;
          var node = surfaceGlyphNode(glyphs[i], 'plotterTrace', pixelScale, L, 0, 0, 0, i, 0.5, 0.5, 1);
          centers.push({ x: node.x, y: node.y, r: Math.max(1, node.r), glyphIndex: i });
        }
        if (!centers.length) return paths;
        for (var pathIndex = 0; pathIndex < paths.length; pathIndex++) {
          var path = paths[pathIndex];
          var best = centers[0], bestScore = Infinity;
          for (var centerIndex = 0; centerIndex < centers.length; centerIndex++) {
            var center = centers[centerIndex];
            var dx = path.centerX - center.x, dy = path.centerY - center.y;
            var score = (dx * dx + dy * dy) / Math.max(1, center.r * center.r);
            if (score < bestScore) { bestScore = score; best = center; }
          }
          path.glyphIndex = best.glyphIndex;
        }
        return paths;
      }

      function traceClonePathV34(path, reverse) {
        var points = reverse ? path.points.slice().reverse() : path.points.slice();
        var clone = {
          points: points,
          centerX: path.centerX,
          centerY: path.centerY,
          bounds: path.bounds,
          closed: path.closed,
          glyphIndex: path.glyphIndex
        };
        return tracePathMetricsV34(clone);
      }

      function traceWarpPathV34(path, amount, phase, salt) {
        if (Math.abs(amount) < 0.05) return traceClonePathV34(path, false);
        var warped = [];
        for (var i = 0; i < path.points.length; i++) {
          var previous = path.points[Math.max(0, i - 1)];
          var next = path.points[Math.min(path.points.length - 1, i + 1)];
          var tx = next.x - previous.x, ty = next.y - previous.y;
          var length = Math.max(0.001, Math.sqrt(tx * tx + ty * ty));
          var wave = Math.sin(i * 0.57 + phase * (1.3 + (salt % 5) * 0.11) + salt * 0.73) * 0.68
            + (hash(i, salt, params.seed + 601) * 2 - 1) * 0.32;
          warped.push({
            x: path.points[i].x - ty / length * amount * wave,
            y: path.points[i].y + tx / length * amount * wave
          });
        }
        var clone = traceClonePathV34(path, false);
        clone.points = warped;
        return tracePathMetricsV34(clone);
      }

      function traceEndpointChoiceV34(candidate, current) {
        if (!current) return { distance: -candidate.length, reverse: false };
        var first = candidate.points[0], last = candidate.points[candidate.points.length - 1];
        var firstDx = first.x - current.x, firstDy = first.y - current.y;
        var lastDx = last.x - current.x, lastDy = last.y - current.y;
        var firstDistance = firstDx * firstDx + firstDy * firstDy;
        var lastDistance = lastDx * lastDx + lastDy * lastDy;
        return lastDistance < firstDistance
          ? { distance: lastDistance, reverse: true }
          : { distance: firstDistance, reverse: false };
      }

      function traceOrientSequenceV34(paths) {
        var oriented = [], current = null;
        for (var i = 0; i < paths.length; i++) {
          var choice = traceEndpointChoiceV34(paths[i], current);
          var path = traceClonePathV34(paths[i], choice.reverse);
          oriented.push(path);
          current = path.points[path.points.length - 1];
        }
        return oriented;
      }

      function traceGreedyOrderV34(paths, definition) {
        var remaining = paths.slice(), ordered = [], current = null;
        while (remaining.length) {
          var tries = Math.min(remaining.length, Math.max(1, Math.round(definition)));
          var bestIndex = 0, bestChoice = null;
          for (var i = 0; i < tries; i++) {
            var choice = traceEndpointChoiceV34(remaining[i], current);
            if (!bestChoice || choice.distance < bestChoice.distance) {
              bestChoice = choice; bestIndex = i;
            }
          }
          var selected = remaining.splice(bestIndex, 1)[0];
          var oriented = traceClonePathV34(selected, bestChoice && bestChoice.reverse);
          ordered.push(oriented);
          current = oriented.points[oriented.points.length - 1];
        }
        return ordered;
      }

      function traceOrderPathsV34(paths, grammar, definition, band) {
        if (grammar === 'duet') return traceGreedyOrderV34(paths, definition);
        var sorted = paths.slice();
        if (grammar === 'carriage') {
          sorted.sort(function (a, b) {
            var majorA = params.vertical ? Math.floor(a.centerX / band) : Math.floor(a.centerY / band);
            var majorB = params.vertical ? Math.floor(b.centerX / band) : Math.floor(b.centerY / band);
            if (majorA !== majorB) return majorA - majorB;
            var minorA = params.vertical ? a.centerY : a.centerX;
            var minorB = params.vertical ? b.centerY : b.centerX;
            return majorA % 2 ? minorB - minorA : minorA - minorB;
          });
          return traceOrientSequenceV34(sorted);
        }
        sorted.sort(function (a, b) {
          if (a.glyphIndex !== b.glyphIndex) return a.glyphIndex - b.glyphIndex;
          return b.length - a.length;
        });
        if (grammar === 'circuit') return traceOrientSequenceV34(sorted);
        var relay = [], group = [], activeGlyph = null, current = null;
        function flushGroup() {
          if (!group.length) return;
          var groupOrder = traceGreedyOrderV34(group, definition);
          if (current && groupOrder.length) {
            var firstChoice = traceEndpointChoiceV34(groupOrder[0], current);
            if (firstChoice.reverse) groupOrder[0] = traceClonePathV34(groupOrder[0], true);
          }
          for (var g = 0; g < groupOrder.length; g++) relay.push(groupOrder[g]);
          current = relay[relay.length - 1].points[relay[relay.length - 1].points.length - 1];
          group = [];
        }
        for (var i = 0; i < sorted.length; i++) {
          if (activeGlyph != null && sorted[i].glyphIndex !== activeGlyph) flushGroup();
          activeGlyph = sorted[i].glyphIndex;
          group.push(sorted[i]);
        }
        flushGroup();
        return relay;
      }

      function traceTravelPointsV34(a, b, grammar, index, drift) {
        var points = [a];
        if (grammar === 'carriage') {
          var elbow = params.vertical ? { x: a.x, y: b.y } : { x: b.x, y: a.y };
          points.push(elbow);
        } else if (grammar === 'relay' || grammar === 'duet') {
          var dx = b.x - a.x, dy = b.y - a.y;
          var distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          var nx = -dy / distance, ny = dx / distance;
          var bend = Math.min(distance * (grammar === 'duet' ? 0.28 : 0.18), 90 + drift * 0.22)
            * (hash(index, params.seed % 97, 607) < 0.5 ? -1 : 1);
          var control = { x: (a.x + b.x) * 0.5 + nx * bend, y: (a.y + b.y) * 0.5 + ny * bend };
          for (var s = 1; s < 6; s++) {
            var t = s / 6, mt = 1 - t;
            points.push({
              x: mt * mt * a.x + 2 * mt * t * control.x + t * t * b.x,
              y: mt * mt * a.y + 2 * mt * t * control.y + t * t * b.y
            });
          }
        }
        points.push(b);
        return points;
      }

      function traceTimelineV34(paths, grammar, lift, drift) {
        var items = [];
        for (var i = 0; i < paths.length; i++) {
          if (i && grammar !== 'circuit') {
            var previous = paths[i - 1].points[paths[i - 1].points.length - 1];
            var next = paths[i].points[0];
            var travelPath = { points: traceTravelPointsV34(previous, next, grammar, i, drift) };
            tracePathMetricsV34(travelPath);
            var lifted = hash(i, params.seed % 113, 613) < lift;
            items.push({ type: lifted ? 'travel' : 'draw', path: travelPath, lifted: lifted });
          }
          items.push({ type: 'draw', path: paths[i], lifted: false });
        }
        var total = 0;
        for (var itemIndex = 0; itemIndex < items.length; itemIndex++) {
          var item = items[itemIndex];
          item.timeLength = item.path.length * (item.type === 'travel' ? 0.28 + lift * 0.72 : 1);
          total += item.timeLength;
        }
        total = Math.max(1, total);
        var cursor = 0;
        for (var timelineIndex = 0; timelineIndex < items.length; timelineIndex++) {
          items[timelineIndex].start = cursor / total;
          cursor += items[timelineIndex].timeLength;
          items[timelineIndex].end = cursor / total;
        }
        return { items: items, total: total };
      }

      function traceStrokePathV34(ctx, points) {
        if (!points || points.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        if (points.length < 4) {
          for (var direct = 1; direct < points.length; direct++) ctx.lineTo(points[direct].x, points[direct].y);
        } else {
          for (var i = 1; i < points.length - 1; i++) {
            var midpointX = (points[i].x + points[i + 1].x) * 0.5;
            var midpointY = (points[i].y + points[i + 1].y) * 0.5;
            ctx.quadraticCurveTo(points[i].x, points[i].y, midpointX, midpointY);
          }
          ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
        }
        ctx.stroke();
      }

      function traceStrokeItemsV34(ctx, timeline, type) {
        for (var i = 0; i < timeline.items.length; i++) {
          if (timeline.items[i].type !== type) continue;
          traceStrokePathV34(ctx, timeline.items[i].path.points);
        }
      }

      function traceStrokeAgeBandV34(ctx, timeline, head, minAge, maxAge, type) {
        ctx.beginPath();
        var hasSegments = false;
        for (var itemIndex = 0; itemIndex < timeline.items.length; itemIndex++) {
          var item = timeline.items[itemIndex];
          if (item.type !== type || item.path.points.length < 2) continue;
          var itemSpan = Math.max(0.000001, item.end - item.start);
          for (var pointIndex = 1; pointIndex < item.path.points.length; pointIndex++) {
            var local = (item.path.cumulative[pointIndex - 1] + item.path.cumulative[pointIndex])
              / Math.max(0.000001, item.path.length) * 0.5;
            var position = item.start + itemSpan * local;
            var age = (head - position + 1) % 1;
            if (age < minAge || age >= maxAge) continue;
            ctx.moveTo(item.path.points[pointIndex - 1].x, item.path.points[pointIndex - 1].y);
            ctx.lineTo(item.path.points[pointIndex].x, item.path.points[pointIndex].y);
            hasSegments = true;
          }
        }
        if (hasSegments) ctx.stroke();
      }

      function tracePointOnPathV34(path, ratio) {
        ratio = Math.max(0, Math.min(1, ratio));
        var target = path.length * ratio;
        var points = path.points;
        for (var i = 1; i < points.length; i++) {
          if (path.cumulative[i] < target) continue;
          var span = Math.max(0.000001, path.cumulative[i] - path.cumulative[i - 1]);
          var t = (target - path.cumulative[i - 1]) / span;
          return {
            x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
            y: points[i - 1].y + (points[i].y - points[i - 1].y) * t,
            angle: Math.atan2(points[i].y - points[i - 1].y, points[i].x - points[i - 1].x)
          };
        }
        var last = points[points.length - 1], before = points[Math.max(0, points.length - 2)];
        return { x: last.x, y: last.y, angle: Math.atan2(last.y - before.y, last.x - before.x) };
      }

      function traceTimelineHeadV34(timeline, phase) {
        phase = ((phase % 1) + 1) % 1;
        for (var i = 0; i < timeline.items.length; i++) {
          var item = timeline.items[i];
          if (phase > item.end && i < timeline.items.length - 1) continue;
          var local = (phase - item.start) / Math.max(0.000001, item.end - item.start);
          var point = tracePointOnPathV34(item.path, local);
          point.type = item.type;
          return point;
        }
        return null;
      }

      function traceDrawLiftMarkersV34(ctx, timeline, size, alpha) {
        ctx.save();
        ctx.setLineDash([]);
        ctx.lineWidth = Math.max(0.45, size * 0.18);
        ctx.globalAlpha = alpha;
        var count = 0;
        for (var i = 0; i < timeline.items.length && count < 96; i++) {
          var item = timeline.items[i];
          if (item.type !== 'travel') continue;
          var point = item.path.points[item.path.points.length - 1];
          ctx.strokeRect(point.x - size * 0.42, point.y - size * 0.42, size * 0.84, size * 0.84);
          count++;
        }
        ctx.restore();
      }

      function traceDrawHeadV34(ctx, head, size, alpha) {
        if (!head) return;
        ctx.save();
        ctx.translate(head.x, head.y);
        ctx.rotate(head.angle || 0);
        ctx.setLineDash([]);
        ctx.globalAlpha = alpha;
        ctx.lineWidth = Math.max(0.55, size * 0.17);
        if (head.type === 'travel') {
          ctx.rotate(Math.PI / 4);
          ctx.strokeRect(-size * 0.58, -size * 0.58, size * 1.16, size * 1.16);
          ctx.beginPath();
          ctx.moveTo(-size * 0.9, 0); ctx.lineTo(size * 0.9, 0);
          ctx.moveTo(0, -size * 0.9); ctx.lineTo(0, size * 0.9);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(size * 1.65, 0);
          ctx.lineTo(-size * 0.75, size * 0.72);
          ctx.lineTo(-size * 0.22, 0);
          ctx.lineTo(-size * 0.75, -size * 0.72);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.arc(0, 0, size * 1.12, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      function strokeWebCatenary(ctx, a, b, phase, tension, sag, lane, salt) {
        return TypeDeformerSharedSurface.strokeWebCatenary({}, ctx, a, b, phase, tension, sag, lane, salt);
      }

      function drawHatchFamily(ctx, diagonal, spacing, warp, stroke, phase, alpha, salt) {
        ctx.globalAlpha = alpha;
        ctx.lineWidth = stroke;
        ctx.lineCap = warp > 2.4 ? 'butt' : 'round';
        var segments = Math.max(14, Math.min(56, Math.round(diagonal / Math.max(18, spacing * 1.7))));
        var row = 0;
        for (var y = -diagonal / 2 - spacing; y <= diagonal / 2 + spacing; y += spacing) {
          if (warp > 1.55 && hash(row, salt, params.seed + 727) < Math.min(0.68, (warp - 1.55) * 0.18)) { row++; continue; }
          ctx.beginPath();
          for (var segment = 0; segment <= segments; segment++) {
            var t = segment / segments;
            var x = -diagonal / 2 + t * diagonal;
            var wave = Math.sin(t * Math.PI * (2.2 + warp * 1.35) + row * 0.71 + phase + salt) * spacing * warp * 0.34;
            var fracture = (hash(segment, row, params.seed + salt + 733) * 2 - 1) * spacing * warp * 0.08;
            var py = y + wave + fracture;
            if (!segment) ctx.moveTo(x, py); else ctx.lineTo(x, py);
          }
          if (warp > 2.7) {
            var dash = Math.max(1, spacing * (0.55 + hash(row, salt, params.seed + 739)));
            ctx.setLineDash([dash, dash * (0.6 + warp * 0.16)]);
            ctx.lineDashOffset = -phase * spacing * 2 + row * 1.7;
          } else ctx.setLineDash([]);
          ctx.stroke();
          row++;
        }
        ctx.setLineDash([]);
      }

      function rasterPressOutput(targetCtx, work, mask, boundary, outerReach, outerOpacity) {
        work.ctx.globalAlpha = 1;
        work.ctx.globalCompositeOperation = 'destination-in';
        work.ctx.drawImage(boundary
          ? surfaceBoundaryEnvelopeCanvas(boundary, mask.width, mask.height, outerReach, outerOpacity, 'raster-press-envelope')
          : mask, 0, 0);
        work.ctx.globalCompositeOperation = 'source-over';
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function rasterGravureCellPathV58(ctx, radiusX, radiusY, facet) {
        var shoulder = Math.max(0.42, Math.min(0.78, 0.56 + facet * 0.08));
        ctx.beginPath();
        ctx.moveTo(0, -radiusY);
        ctx.lineTo(radiusX * shoulder, -radiusY * 0.72);
        ctx.lineTo(radiusX, -radiusY * 0.12);
        ctx.lineTo(radiusX * 0.84, radiusY * 0.54);
        ctx.lineTo(0, radiusY);
        ctx.lineTo(-radiusX * 0.84, radiusY * 0.54);
        ctx.lineTo(-radiusX, -radiusY * 0.12);
        ctx.lineTo(-radiusX * shoulder, -radiusY * 0.72);
        ctx.closePath();
      }

      function rasterGravurePlanV58(sourceData, boundary, width, height, cell, gain, angle, noise,
        modulation, strength, phase, seed, haloReach, haloOpacity, maxCells) {
        var cells = [];
        var budget = Math.max(1, Math.min(12000, Math.round(maxCells || 12000)));
        var candidateBudget = Math.max(2048, Math.min(48000, budget * 24));
        var cx = width * 0.5, cy = height * 0.5;
        var cos = Math.cos(angle), sin = Math.sin(angle);
        var rowStep = Math.max(1.2, cell * 0.82);
        var loopPhase = (((phase % 1) + 1) % 1) * Math.PI * 2;
        var bounds = boundary.bounds || [0, 0, width - 1, height - 1];
        var reach = haloReach + cell * (0.9 + gain * 0.24);
        var minX = bounds[0] - reach, minY = bounds[1] - reach;
        var maxX = bounds[2] + reach, maxY = bounds[3] + reach;
        var corners = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];
        var localMinX = Infinity, localMinY = Infinity, localMaxX = -Infinity, localMaxY = -Infinity;
        for (var cornerIndex = 0; cornerIndex < corners.length; cornerIndex++) {
          var cornerX = corners[cornerIndex][0] - cx;
          var cornerY = corners[cornerIndex][1] - cy;
          var rotatedX = cornerX * cos + cornerY * sin;
          var rotatedY = -cornerX * sin + cornerY * cos;
          localMinX = Math.min(localMinX, rotatedX);
          localMaxX = Math.max(localMaxX, rotatedX);
          localMinY = Math.min(localMinY, rotatedY);
          localMaxY = Math.max(localMaxY, rotatedY);
        }
        var rowStart = Math.floor(localMinY / rowStep) - 2;
        var rowEnd = Math.ceil(localMaxY / rowStep) + 2;
        var candidates = 0;
        for (var row = rowStart; row <= rowEnd && cells.length < budget && candidates < candidateBudget; row++) {
          var rowStagger = (Math.abs(row) % 2) * cell * 0.5;
          var colStart = Math.floor((localMinX - rowStagger) / cell) - 2;
          var colEnd = Math.ceil((localMaxX - rowStagger) / cell) + 2;
          for (var col = colStart; col <= colEnd && cells.length < budget && candidates < candidateBudget; col++) {
            candidates++;
            var grain = hash(col + 19, row + 43, seed + 1901);
            var localX = col * cell + rowStagger;
            var localY = row * rowStep;
            var jitter = cell * noise * (0.025 + modulation * 0.012);
            localX += (hash(col, row, seed + 1907) * 2 - 1) * jitter;
            localY += (hash(col + 31, row - 17, seed + 1913) * 2 - 1) * jitter;
            var sampleX = Math.round(cx + localX * cos - localY * sin);
            var sampleY = Math.round(cy + localX * sin + localY * cos);
            if (sampleX < 1 || sampleX + 1 >= width || sampleY < 1 || sampleY + 1 >= height
              || sampleX < minX || sampleX > maxX || sampleY < minY || sampleY > maxY) continue;
            var index = sampleY * width + sampleX;
            var onBody = !!boundary.inside[index];
            var edgeFalloff = onBody ? 1 : Math.max(0, 1 - boundary.distance[index] / Math.max(1, haloReach));
            if (!onBody) {
              var pressureKeep = edgeFalloff * (0.16 + modulation * 0.055 + noise * 0.045);
              if (edgeFalloff <= 0 || hash(col - 29, row + 11, seed + 1919) > pressureKeep) continue;
            }
            var coverage = onBody
              ? sampleMaskNeighborhoodAlpha(sourceData, width, height, sampleX, sampleY, cell * 0.32)
              : edgeFalloff * edgeFalloff * haloOpacity;
            if (coverage < 0.018) continue;
            if (noise > 0.78 && hash(col + 71, row - 37, seed + 1927)
              < Math.min(0.52, (noise - 0.78) * 0.16 * (1.08 - coverage))) continue;
            var depth = boundary.distance[index];
            var depthTone = onBody
              ? Math.max(0, Math.min(1, depth / Math.max(1, cell * (0.72 + modulation * 0.18))))
              : edgeFalloff * 0.34;
            var pulse = Math.sin(loopPhase + row * 0.37 - col * 0.21 + depth * 0.055);
            var tone = Math.max(0.03, Math.min(1,
              coverage * (0.34 + modulation * 0.025) + depthTone * (0.54 + modulation * 0.035)
              + pulse * modulation * 0.018));
            var plateFill = Math.max(0.18, Math.min(1.42, gain * (0.46 + tone * 0.7)));
            var outerX = cell * Math.max(0.18, Math.min(0.68, 0.28 + plateFill * 0.22 + modulation * 0.01));
            var outerY = cell * Math.max(0.15, Math.min(0.62,
              0.16 + plateFill * 0.13 + modulation * 0.008 + (grain - 0.5) * noise * 0.025));
            var aperture = Math.max(0.18, Math.min(0.84, 0.18 + tone * 0.42 + gain * 0.055));
            var normal = surfaceFieldNormal(boundary, width, height, sampleX, sampleY);
            var displacement = cell * modulation * (0.008 + tone * 0.012) * pulse;
            cells.push({
              x: sampleX,
              y: sampleY,
              rotation: angle + Math.PI * 0.25 + (grain * 2 - 1) * noise * 0.075,
              outerX: outerX,
              outerY: outerY,
              innerX: Math.max(0.16, outerX * aperture),
              innerY: Math.max(0.16, outerY * Math.max(0.16, aperture * (0.76 + depthTone * 0.14))),
              offsetX: normal.x * displacement,
              offsetY: normal.y * displacement,
              wallAlpha: strength * coverage * Math.min(0.84, 0.5 + (1 - tone) * 0.14 + modulation * 0.025),
              inkAlpha: strength * coverage * Math.min(0.98, 0.44 + tone * 0.5 + gain * 0.025),
              facet: modulation * 0.42 + (grain - 0.5) * noise * 0.5,
              seam: modulation > 1.7 && tone > 0.32
                ? Math.min(1, (modulation - 1.7) * 0.34 + tone * 0.18) : 0
            });
          }
        }
        cells.candidates = candidates;
        cells.budget = budget;
        return cells;
      }

      function drawRasterGravureV58(ctx, cells, color) {
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        for (var index = 0; index < cells.length; index++) {
          var cell = cells[index];
          ctx.save();
          ctx.translate(cell.x, cell.y);
          ctx.rotate(cell.rotation);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = cell.wallAlpha;
          rasterGravureCellPathV58(ctx, cell.outerX, cell.outerY, cell.facet);
          ctx.fill();
          var moatX = Math.max(cell.innerX + 0.34, cell.outerX * 0.82);
          var moatY = Math.max(cell.innerY + 0.34, cell.outerY * 0.82);
          if (moatX < cell.outerX * 0.98 && moatY < cell.outerY * 0.98) {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.globalAlpha = 0.9;
            rasterGravureCellPathV58(ctx, moatX, moatY, cell.facet);
            ctx.fill();
          }
          ctx.globalCompositeOperation = 'source-over';
          ctx.translate(cell.offsetX, cell.offsetY);
          ctx.globalAlpha = cell.inkAlpha;
          rasterGravureCellPathV58(ctx, cell.innerX, cell.innerY, cell.facet * 0.7);
          ctx.fill();
          if (cell.seam > 0 && cell.innerX > 0.7) {
            ctx.globalAlpha = cell.inkAlpha * cell.seam * 0.52;
            ctx.lineWidth = Math.max(0.28, Math.min(1.4, cell.innerY * 0.18));
            ctx.beginPath();
            ctx.moveTo(-cell.innerX * 0.52, cell.innerY * 0.08);
            ctx.lineTo(cell.innerX * 0.58, -cell.innerY * 0.16);
            ctx.stroke();
          }
          ctx.restore();
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }

      function drawAdaptiveHatchFamily(ctx, boundary, width, height, angle, spacing, warp, stroke,
        phase, alpha, salt, threshold, style, outsideReach) {
        var cx = width / 2, cy = height / 2;
        var diagonal = Math.sqrt(width * width + height * height) + spacing * 5;
        var cos = Math.cos(angle), sin = Math.sin(angle);
        var rowCount = Math.ceil(diagonal / spacing) + 1;
        var sampleStep = Math.max(1.1, spacing * (style === 'woodcut' ? 0.3 : 0.34));
        var segments = Math.max(24, Math.min(640, Math.ceil(diagonal / sampleStep)));
        ctx.lineWidth = stroke;
        ctx.lineCap = style === 'woodcut' ? 'butt' : 'round';
        ctx.lineJoin = 'round';
        for (var row = -rowCount; row <= rowCount; row++) {
          var v = row * spacing;
          var drawing = false;
          ctx.beginPath();
          for (var segment = 0; segment <= segments; segment++) {
            var t = segment / segments;
            var u = -diagonal / 2 + t * diagonal;
            var wave = Math.sin(t * Math.PI * (2.2 + warp * 1.3) + row * 0.69 + phase + salt)
              * spacing * warp * 0.28;
            var chatter = (hash(segment, row, params.seed + salt + 1861) * 2 - 1) * spacing * warp * 0.045;
            var localV = v + wave + chatter;
            var px = Math.round(cx + u * cos - localV * sin);
            var py = Math.round(cy + u * sin + localV * cos);
            var inCanvas = px >= 0 && px < width && py >= 0 && py < height;
            var index = inCanvas ? py * width + px : 0;
            var onBody = inCanvas && !!boundary.inside[index];
            var plateBite = inCanvas && !onBody && outsideReach > 0 && boundary.distance[index] <= outsideReach
              && hash(segment >> 1, row, params.seed + salt + 1867) > 0.42;
            var deepEnough = inCanvas && ((onBody && boundary.distance[index] >= threshold) || plateBite);
            if (deepEnough && style === 'woodcut') {
              var breakSignal = hash(Math.floor(segment / 3), row, params.seed + salt + 1871);
              deepEnough = breakSignal > Math.min(0.46, 0.08 + warp * 0.06);
            }
            if (!deepEnough) {
              drawing = false;
              continue;
            }
            if (!drawing) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            drawing = true;
          }
          ctx.globalAlpha = alpha * (0.7 + hash(row, salt, params.seed + 1873) * 0.3);
          ctx.stroke();
        }
      }

      function hatchCopperSmooth(field, width, height, radius) {
        // Signed geometry, including counters. Two separable box passes round
        // the distance ridge without moving or blurring the actual glyph mask.
        var data = new Float32Array(width * height), scratch = new Float32Array(data.length);
        for (var i = 0; i < data.length; i++) data[i] = (field.distance[i] + 0.5) * (field.inside[i] ? 1 : -1);
        var r = Math.max(1, Math.round(radius)), divisor = r * 2 + 1;
        for (var pass = 0; pass < 2; pass++) {
          for (var y = 0; y < height; y++) {
            var sum = 0, row = y * width;
            for (var k = -r; k <= r; k++) sum += data[row + Math.max(0, Math.min(width - 1, k))];
            for (var x = 0; x < width; x++) {
              scratch[row + x] = sum / divisor;
              sum += data[row + Math.min(width - 1, x + r + 1)] - data[row + Math.max(0, x - r)];
            }
          }
          for (var column = 0; column < width; column++) {
            var columnSum = 0;
            for (var dy = -r; dy <= r; dy++) columnSum += scratch[Math.max(0, Math.min(height - 1, dy)) * width + column];
            for (var line = 0; line < height; line++) {
              data[line * width + column] = columnSum / divisor;
              columnSum += scratch[Math.min(height - 1, line + r + 1) * width + column]
                - scratch[Math.max(0, line - r) * width + column];
            }
          }
        }
        return data;
      }

      function hatchCopperCoverage(position, spacing, halfWidth, footprint) {
        // Integrate a periodic cut across its pixel footprint. Subpixel lines
        // retain their mean ink coverage instead of dropping detail or pitch.
        var half = Math.max(0, Math.min(spacing * 0.5, halfWidth));
        var span = Math.max(0.0001, footprint);
        function integral(value) {
          var shifted = value + half, turns = Math.floor(shifted / spacing);
          return turns * half * 2 + Math.min(half * 2, shifted - turns * spacing);
        }
        return Math.max(0, Math.min(1, (integral(position + span * 0.5) - integral(position - span * 0.5)) / span));
      }

      function hatchCopperPlate(source, shape, width, height, units, settings, phase) {
        var field = surfaceBoundaryDistance(shape, width, height), result = new Uint8ClampedArray(source.length);
        if (!field.bounds) return result;
        var spacing = Math.max(0.001, settings.spacing * units), stroke = settings.stroke * units;
        var smooth = hatchCopperSmooth(field, width, height, Math.max(1, units * (1.4 + settings.warp * 0.65)));
        var nx = -Math.sin(settings.angle), ny = Math.cos(settings.angle);
        var warp = settings.warp, depth = settings.depth;
        var motion = Math.sin(phase) * spacing * 0.3;
        var lightX = Math.cos(settings.angle - 1.1 + Math.sin(phase) * 0.24);
        var lightY = Math.sin(settings.angle - 1.1 + Math.sin(phase) * 0.24);
        var originX = field.bounds[0], originY = field.bounds[1];
        var offset = hash(7, 19, settings.seed + 1987) * spacing;
        for (var y = originY; y <= field.bounds[3]; y++) for (var x = originX; x <= field.bounds[2]; x++) {
          var i = y * width + x, pixel = i * 4, alpha = source[pixel + 3];
          if (!alpha) continue;
          var dx = (smooth[y * width + Math.min(width - 1, x + 1)] - smooth[y * width + Math.max(0, x - 1)]) * 0.5;
          var dy = (smooth[Math.min(height - 1, y + 1) * width + x] - smooth[Math.max(0, y - 1) * width + x]) * 0.5;
          var normalLength = Math.max(0.2, Math.hypot(dx, dy));
          var shade = Math.max(0, Math.min(1, 0.5 + (dx * lightX + dy * lightY) / normalLength * 0.5));
          var distance = field.inside[i] ? field.distance[i] + 0.5 : 0;
          var taper = Math.min(1, (distance + units * 0.3) / Math.max(units, stroke * 1.2));
          taper = taper * taper * (3 - 2 * taper);
          var pressure = (0.2 + depth * (0.22 + shade * 0.78)) * taper;
          var gx = nx + warp * dx, gy = ny + warp * dy;
          var position = (x - originX) * nx + (y - originY) * ny + warp * smooth[i] + offset + motion;
          // Pressure opens each groove within its own plate interval. Warp
          // transports the interval and its groove together; it must not also
          // multiply the ink fraction until adjacent cuts become one flat slab.
          var cutWidth = spacing * -Math.expm1(-stroke * pressure / spacing);
          var coverage = hatchCopperCoverage(position, spacing, cutWidth * 0.5,
            Math.max(0.05, Math.abs(gx) + Math.abs(gy)));
          result[pixel] = result[pixel + 1] = result[pixel + 2] = 255;
          result[pixel + 3] = Math.round(alpha * coverage);
        }
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext;RC.field(result,function(px,py,rgba,footprint){var x=px-.5,y=py-.5;
          var i = y * width + x, pixel = i * 4, alpha = RC.rasterSample(source,width,height,x,y,3);
          if (!alpha) return;
          var dx = (RC.sample(smooth,width,height,x+1,y) - RC.sample(smooth,width,height,x-1,y)) * 0.5;
          var dy = (RC.sample(smooth,width,height,x,y+1) - RC.sample(smooth,width,height,x,y-1)) * 0.5;
          var normalLength = Math.max(0.2, Math.hypot(dx, dy));
          var shade = Math.max(0, Math.min(1, 0.5 + (dx * lightX + dy * lightY) / normalLength * 0.5));
          var distance = (RC.sample(field.inside,width,height,x,y)>=.5) ? RC.sample(field.distance,width,height,x,y) + 0.5 : 0;
          var taper = Math.min(1, (distance + units * 0.3) / Math.max(units, stroke * 1.2));
          taper = taper * taper * (3 - 2 * taper);
          var pressure = (0.2 + depth * (0.22 + shade * 0.78)) * taper;
          var gx = nx + warp * dx, gy = ny + warp * dy;
          var position = (x - originX) * nx + (y - originY) * ny + warp * RC.sample(smooth,width,height,x,y) + offset + motion;
          // Pressure opens each groove within its own plate interval. Warp
          // transports the interval and its groove together; it must not also
          // multiply the ink fraction until adjacent cuts become one flat slab.
          var cutWidth = spacing * -Math.expm1(-stroke * pressure / spacing);
          var coverage = hatchCopperCoverage(position, spacing, cutWidth * 0.5,
            Math.max(0.0001,(Math.abs(gx)+Math.abs(gy))*footprint));
          rgba[0] = rgba[1] = rgba[2] = 255;
          rgba[3] = Math.round(alpha * coverage);
        });}
        return result;
      }

      function hatchCopperRender(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var aggregate = surfaceAggregate(glyphs, 'hatchEngrave', 'hatchSpacing', params.hatchSpacing);
        if (!aggregate.weight) return;
        function value(key) { return surfaceAggregate(glyphs, 'hatchEngrave', key, params[key]).value; }
        var mask = buildSurfaceMask(glyphs, 'hatchEngrave', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'hatchEngrave', coverBase);
        var source = mask.getContext('2d').getImageData(0, 0, width, height).data;
        // Assignment affects ink mass, never the contour or counter geometry.
        var fullGlyphs = [];
        for (var g = 0; g < glyphs.length; g++) if (surfaceGlyphStrength(glyphs[g], 'hatchEngrave') > 0.002
          && (glyphs[g].opacity == null || glyphs[g].opacity > 0.002)) {
          var full = Object.assign({}, glyphs[g]);
          full.surface = Object.assign({}, glyphs[g].surface, { hatchEngrave: 1 }); full.opacity = 1;
          fullGlyphs.push(full);
        }
        var shape = buildSurfaceMask(fullGlyphs, 'hatchEngrave', width, height, pixelScale, L, fm).getContext('2d').getImageData(0, 0, width, height).data;
        var phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var units = Math.max(0.001, pixelScale * L.s);
        var plate = hatchCopperPlate(source, shape, width, height, units, {
          spacing: (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('hatchSpacing', aggregate.value, 0, 1, 80) : Math.max(1, Math.min(80, aggregate.value))), stroke: (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('hatchStroke', value('hatchStroke'), 0, 0.1, 12) : Math.max(0.1, Math.min(12, value('hatchStroke')))),
          warp: (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('hatchWarp', value('hatchWarp'), 0, 0, 5) : Math.max(0, Math.min(5, value('hatchWarp')))), depth: (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('hatchDepth', value('hatchDepth'), 0, 0, 4) : Math.max(0, Math.min(4, value('hatchDepth')))),
          angle: value('hatchAngle') * Math.PI / 180, seed: params.seed
        }, phase);
        var work = surfaceScratch('hatch-copper-plate', width, height, false), image = work.ctx.createImageData(width, height);
        image.data.set(plate); if(globalThis.TypeDeformerRenderContext)globalThis.TypeDeformerRenderContext.copyField(image,plate); work.ctx.putImageData(image, 0, 0);
        var ink = colorizeSurfaceCanvas(work.canvas, surfaceEffectColor('hatchEngrave'), 'hatch-copper-ink');
        targetCtx.save();
        try {
          targetCtx.setTransform(1, 0, 0, 1, 0, 0);
          targetCtx.drawImage(ink, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        } finally { targetCtx.restore(); }
      }

      function asemicMetaParam(meta, key, fallback, min, max, integer) {
        var raw = meta && meta.glyph && meta.glyph.surface ? Number(meta.glyph.surface[key]) : NaN;
        var value = isFinite(raw) ? raw : fallback;
        value = Math.max(min, Math.min(max, value));
        return integer ? Math.round(value) : value;
      }

      function asemicMetaChoice(meta, key, fallback, options) {
        var value = meta && meta.glyph && meta.glyph.surface ? meta.glyph.surface[key] : fallback;
        return options.indexOf(value) === -1 ? fallback : value;
      }

      function asemicCounterComponents(topology, metas, meta) {
        var counters = [];
        for (var i = 0; i < topology.components.length && counters.length < 4; i++) {
          var component = topology.components[i];
          if (surfaceNearestGlyphMeta(metas, component.x, component.y) !== meta) continue;
          var nx = Math.abs(component.x - meta.x) / Math.max(1, meta.halfW);
          var ny = Math.abs(component.y - meta.y) / Math.max(1, meta.halfH);
          var componentW = component.maxX - component.minX + 1;
          var componentH = component.maxY - component.minY + 1;
          if (nx > 1.08 || ny > 1.08 || componentW > meta.halfW * 1.9 || componentH > meta.halfH * 1.9) continue;
          counters.push(component);
        }
        return counters;
      }

      function asemicCanonicalPoint(meta, grammar, index, count, seed) {
        var t = count <= 1 ? 0.5 : index / (count - 1);
        var phase = hash(index + meta.index * 7, seed % 997, 1709) * Math.PI * 2;
        var u, v;
        if (grammar === 'chamber') {
          var angle = -Math.PI * 0.5 + t * Math.PI * 2;
          u = 0.5 + Math.cos(angle) * (0.28 + hash(index, seed, 1721) * 0.08);
          v = 0.5 + Math.sin(angle) * (0.34 + hash(index, seed, 1733) * 0.08);
        } else if (grammar === 'incised') {
          u = 0.14 + t * 0.72;
          v = (index % 2 ? 0.76 : 0.24) + Math.sin(phase) * 0.08;
        } else {
          u = 0.12 + t * 0.76;
          var amplitude = grammar === 'polyphonic' ? 0.21 : 0.29;
          v = 0.5 + Math.sin(t * Math.PI * (1.4 + hash(meta.index, seed, 1747) * 1.6) + phase * 0.24) * amplitude;
        }
        if (params.vertical && grammar !== 'chamber') {
          var swap = u; u = v; v = swap;
        }
        return {
          x: meta.x + (u - 0.5) * meta.halfW * 2,
          y: meta.y + (v - 0.5) * meta.halfH * 2
        };
      }

      function asemicCandidatePool(field, width, height, metas, meta, budget, memory, seed) {
        var grid = Math.max(9, Math.min(19, budget * 2 + 3));
        var minX = Math.max(0, Math.floor(meta.x - meta.halfW * 1.04));
        var maxX = Math.min(width - 1, Math.ceil(meta.x + meta.halfW * 1.04));
        var minY = Math.max(0, Math.floor(meta.y - meta.halfH * 1.04));
        var maxY = Math.min(height - 1, Math.ceil(meta.y + meta.halfH * 1.04));
        var stepX = Math.max(1, (maxX - minX) / Math.max(1, grid - 1));
        var stepY = Math.max(1, (maxY - minY) / Math.max(1, grid - 1));
        var sampleX = Math.max(1, Math.round(stepX * 0.58));
        var sampleY = Math.max(1, Math.round(stepY * 0.58));
        var pool = [];
        for (var gy = 0; gy < grid; gy++) for (var gx = 0; gx < grid; gx++) {
          var x = Math.max(0, Math.min(width - 1, Math.round(minX + gx * stepX)));
          var y = Math.max(0, Math.min(height - 1, Math.round(minY + gy * stepY)));
          var index = y * width + x;
          if (!field.inside[index] || surfaceNearestGlyphMeta(metas, x, y) !== meta) continue;
          var distance = field.distance[index];
          var left = field.distance[y * width + Math.max(0, x - sampleX)];
          var right = field.distance[y * width + Math.min(width - 1, x + sampleX)];
          var top = field.distance[Math.max(0, y - sampleY) * width + x];
          var bottom = field.distance[Math.min(height - 1, y + sampleY) * width + x];
          var ridge = (distance + 0.2 >= left && distance + 0.2 >= right ? 1 : 0)
            + (distance + 0.2 >= top && distance + 0.2 >= bottom ? 1 : 0);
          var keepInterior = hash(gx + meta.index * 31, gy + seed, 1759) < 0.08 + (1 - memory) * 0.2;
          if (!ridge && !keepInterior) continue;
          var nx = (x - meta.x) / Math.max(1, meta.halfW);
          var ny = (y - meta.y) / Math.max(1, meta.halfH);
          var centrality = Math.max(0, 1 - Math.sqrt(nx * nx + ny * ny) * 0.52);
          pool.push({
            x: x, y: y,
            score: distance * (0.68 + ridge * 0.72) + centrality * Math.min(meta.halfW, meta.halfH) * 0.14
              + hash(gx, gy + seed, 1777) * 0.9
          });
        }
        if (pool.length >= 2) return pool;
        for (var fallbackIndex = 0; fallbackIndex < Math.max(2, budget); fallbackIndex++) {
          var fallback = asemicCanonicalPoint(meta, 'current', fallbackIndex, Math.max(2, budget), seed);
          pool.push({ x: fallback.x, y: fallback.y, score: 1 });
        }
        return pool;
      }

      function asemicSelectAnchors(pool, count, meta, seed) {
        if (!pool.length) return [];
        pool = pool.slice().sort(function (a, b) { return b.score - a.score; });
        var startBand = Math.min(pool.length, 5);
        var start = Math.floor(hash(meta.index, seed % 991, 1789) * startBand);
        var selected = [pool.splice(start, 1)[0]];
        var normalizer = Math.max(1, meta.halfW * meta.halfW + meta.halfH * meta.halfH);
        while (pool.length && selected.length < count) {
          var bestIndex = 0, bestScore = -Infinity;
          for (var i = 0; i < pool.length; i++) {
            var minimum = Infinity;
            for (var j = 0; j < selected.length; j++) {
              var dx = pool[i].x - selected[j].x;
              var dy = pool[i].y - selected[j].y;
              minimum = Math.min(minimum, dx * dx + dy * dy);
            }
            var score = minimum / normalizer * 7.2 + pool[i].score / Math.max(1, Math.min(meta.halfW, meta.halfH))
              + hash(i + selected.length * 17, seed, 1801) * 0.08;
            if (score > bestScore) { bestScore = score; bestIndex = i; }
          }
          selected.push(pool.splice(bestIndex, 1)[0]);
        }
        return selected;
      }

      function asemicOrderAnchors(points, grammar, meta, seed) {
        var ordered = points.slice();
        if (grammar === 'chamber') {
          ordered.sort(function (a, b) {
            return Math.atan2(a.y - meta.y, a.x - meta.x) - Math.atan2(b.y - meta.y, b.x - meta.x);
          });
        } else {
          ordered.sort(function (a, b) {
            var primaryA = params.vertical ? a.y : a.x;
            var primaryB = params.vertical ? b.y : b.x;
            return primaryA - primaryB || (params.vertical ? a.x - b.x : a.y - b.y);
          });
          if (grammar === 'incised' && ordered.length > 3) {
            var folded = [], left = 0, right = ordered.length - 1;
            while (left <= right) {
              folded.push(ordered[left++]);
              if (left <= right) folded.push(ordered[right--]);
            }
            ordered = folded;
          }
        }
        if (hash(meta.index, seed, 1811) > 0.5 && grammar !== 'chamber') ordered.reverse();
        return ordered;
      }

      function asemicBuildAnchors(field, width, height, metas, meta, grammar, memory, gestureCount, flow, flourish, phase, seed) {
        var pool = asemicCandidatePool(field, width, height, metas, meta, gestureCount, memory, seed);
        var source = asemicOrderAnchors(asemicSelectAnchors(pool, gestureCount, meta, seed), grammar, meta, seed);
        var anchors = [];
        var sourceShare = 0.12 + memory * 0.88;
        var motionReach = Math.min(meta.halfW, meta.halfH) * (0.014 + Math.abs(flow) * 0.018);
        for (var i = 0; i < source.length; i++) {
          var canonical = asemicCanonicalPoint(meta, grammar, i, source.length, seed);
          var motion = Math.sin(phase + i * 1.47 + seed * 0.013);
          anchors.push({
            x: canonical.x * (1 - sourceShare) + source[i].x * sourceShare
              + Math.cos(phase + i * 0.91) * motionReach * motion,
            y: canonical.y * (1 - sourceShare) + source[i].y * sourceShare
              + Math.sin(phase * 2 + i * 1.13) * motionReach * motion
          });
        }
        if (grammar !== 'chamber' && anchors.length >= 2 && flourish > 0.01) {
          var first = anchors[0], second = anchors[1];
          var last = anchors[anchors.length - 1], before = anchors[anchors.length - 2];
          var startDx = second.x - first.x, startDy = second.y - first.y;
          var endDx = last.x - before.x, endDy = last.y - before.y;
          var startLength = Math.max(0.001, Math.hypot(startDx, startDy));
          var endLength = Math.max(0.001, Math.hypot(endDx, endDy));
          var startReach = flourish * (0.58 + hash(meta.index, seed, 1823) * 0.42);
          var endReach = flourish * (0.72 + hash(meta.index, seed, 1831) * 0.52);
          anchors.unshift({
            x: first.x - startDx / startLength * startReach - startDy / startLength * flow * startReach * 0.11,
            y: first.y - startDy / startLength * startReach + startDx / startLength * flow * startReach * 0.11
          });
          anchors.push({
            x: last.x + endDx / endLength * endReach - endDy / endLength * flow * endReach * 0.14,
            y: last.y + endDy / endLength * endReach + endDx / endLength * flow * endReach * 0.14
          });
        }
        return anchors;
      }

      function asemicOffsetPath(points, offset) {
        if (!offset) return points.slice();
        var shifted = [];
        for (var i = 0; i < points.length; i++) {
          var previous = points[Math.max(0, i - 1)];
          var next = points[Math.min(points.length - 1, i + 1)];
          var dx = next.x - previous.x, dy = next.y - previous.y;
          var length = Math.max(0.001, Math.hypot(dx, dy));
          shifted.push({ x: points[i].x - dy / length * offset, y: points[i].y + dx / length * offset });
        }
        return shifted;
      }

      function asemicRenderPath(ctx, points, weight, contrast, flow, phase, seed, grammar, closed, voiceScale) {
        if (points.length < 2) return;
        var path = points.slice();
        if (closed) path.push(points[0]);
        var nibAngle = -0.52 + hash(seed % 257, points.length, 1847) * 1.04 + flow * 0.045;
        ctx.lineCap = grammar === 'incised' ? 'butt' : 'round';
        ctx.lineJoin = grammar === 'incised' ? 'miter' : 'round';
        ctx.strokeStyle = '#fff';
        ctx.fillStyle = '#fff';
        for (var i = 0; i + 1 < path.length; i++) {
          var a = path[i], b = path[i + 1];
          var dx = b.x - a.x, dy = b.y - a.y;
          var distance = Math.max(0.001, Math.hypot(dx, dy));
          var angle = Math.atan2(dy, dx);
          var orientation = Math.abs(Math.cos(angle - nibAngle));
          var widthScale = Math.max(0.22, 1 - contrast * 0.08 + orientation * contrast * 0.22);
          var segmentWidth = Math.max(0.35, weight * widthScale * (voiceScale == null ? 1 : voiceScale));
          var gap = grammar === 'incised' ? Math.min(distance * 0.2, segmentWidth * 0.45) : 0;
          var ux = dx / distance, uy = dy / distance;
          var ax = a.x + ux * gap, ay = a.y + uy * gap;
          var bx = b.x - ux * gap, by = b.y - uy * gap;
          ctx.lineWidth = segmentWidth;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          if (grammar === 'incised') {
            ctx.lineTo(bx, by);
          } else {
            var curvature = Math.max(-0.44, Math.min(0.44,
              flow * 0.075 * Math.sin(i * 1.31 + phase + seed * 0.017)));
            var controlX = (ax + bx) * 0.5 - uy * distance * curvature;
            var controlY = (ay + by) * 0.5 + ux * distance * curvature;
            ctx.quadraticCurveTo(controlX, controlY, bx, by);
          }
          ctx.stroke();
          if (grammar !== 'incised' && i + 1 < path.length - 1) {
            ctx.beginPath();
            ctx.ellipse(b.x, b.y, segmentWidth * 0.44, segmentWidth * 0.35,
              angle + Math.PI * 0.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        if (grammar === 'incised') {
          for (var joint = 0; joint < points.length; joint++) {
            var radius = weight * (0.28 + contrast * 0.035);
            ctx.save();
            ctx.translate(points[joint].x, points[joint].y);
            ctx.rotate(Math.PI * 0.25 + flow * 0.08);
            ctx.fillRect(-radius * 0.72, -radius * 0.72, radius * 1.44, radius * 1.44);
            ctx.restore();
          }
        }
      }

      function asemicRenderChamber(ctx, anchors, counters, meta, weight, contrast, flow, phase, seed) {
        asemicRenderPath(ctx, anchors, weight, contrast, flow, phase, seed, 'chamber', true, 1);
        var spineStart = params.vertical ? { x: meta.x - meta.halfW * 0.58, y: meta.y }
          : { x: meta.x, y: meta.y - meta.halfH * 0.62 };
        var spineEnd = params.vertical ? { x: meta.x + meta.halfW * 0.58, y: meta.y }
          : { x: meta.x, y: meta.y + meta.halfH * 0.62 };
        asemicRenderPath(ctx, [spineStart, { x: meta.x + flow * weight * 0.42, y: meta.y }, spineEnd],
          weight * 0.78, contrast, flow, phase, seed + 19, 'current', false, 1);
        var loopSources = counters.length ? counters : [{
          x: meta.x, y: meta.y,
          minX: meta.x - meta.halfW * 0.18, maxX: meta.x + meta.halfW * 0.18,
          minY: meta.y - meta.halfH * 0.16, maxY: meta.y + meta.halfH * 0.16
        }];
        for (var c = 0; c < loopSources.length && c < 3; c++) {
          var source = loopSources[c];
          var radiusX = Math.max(weight * 1.15, Math.min(meta.halfW * 0.31, (source.maxX - source.minX + 1) * 0.58));
          var radiusY = Math.max(weight, Math.min(meta.halfH * 0.3, (source.maxY - source.minY + 1) * 0.58));
          var loop = [];
          for (var p = 0; p < 8; p++) {
            var angle = p / 8 * Math.PI * 2;
            var pulse = 1 + Math.sin(angle * 3 + seed * 0.021 + phase) * 0.08;
            loop.push({ x: source.x + Math.cos(angle) * radiusX * pulse, y: source.y + Math.sin(angle) * radiusY / pulse });
          }
          asemicRenderPath(ctx, loop, weight * 0.62, contrast * 0.72, flow * 0.45,
            phase, seed + c * 23, 'chamber', true, 1);
        }
      }

      function asemicBodyBounds(anchors, counters, meta, weight, contrast, flow, grammar, width, height) {
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        function include(x, y) {
          minX = Math.min(minX, x); minY = Math.min(minY, y);
          maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
        for (var i = 0; i < anchors.length; i++) include(anchors[i].x, anchors[i].y);
        if (grammar === 'chamber') {
          include(meta.x - meta.halfW * 0.58, meta.y - meta.halfH * 0.62);
          include(meta.x + meta.halfW * 0.58, meta.y + meta.halfH * 0.62);
          include(meta.x + flow * weight * 0.42, meta.y);
          var loopSources = counters.length ? counters : [meta];
          // Loop pulses lie in [.92, 1.08], including synthetic chambers.
          var loopX = Math.max(weight * 1.15, meta.halfW * 0.31) * 1.08;
          var loopY = Math.max(weight, meta.halfH * 0.3) / 0.92;
          for (var c = 0; c < loopSources.length && c < 3; c++) {
            include(loopSources[c].x - loopX, loopSources[c].y - loopY);
            include(loopSources[c].x + loopX, loopSources[c].y + loopY);
          }
        }
        if (!Number.isFinite(minX)) return null;
        var voiceGap = grammar === 'polyphonic' ? weight * (1.08 + contrast * 0.055) : 0;
        // A quadratic lies inside its endpoint/control-point convex hull.
        var bend = grammar === 'incised' ? 0 : Math.min(0.44, Math.abs(flow) * 0.075);
        var controlReach = bend * Math.hypot(maxX - minX + voiceGap * 2, maxY - minY + voiceGap * 2);
        var nibReach = Math.max(0.5, weight * (1 + contrast * 0.14) * 0.5,
          weight * (0.28 + contrast * 0.035) * Math.SQRT2 * 0.72);
        var padding = voiceGap + controlReach + nibReach + 2; // antialias fringe
        var x = Math.max(0, Math.floor(minX - padding)), y = Math.max(0, Math.floor(minY - padding));
        var right = Math.min(width, Math.ceil(maxX + padding)), bottom = Math.min(height, Math.ceil(maxY + padding));
        return right > x && bottom > y ? { x: x, y: y, width: right - x, height: bottom - y } : null;
      }

      function asemicCutCounters(ctx, counters, meta, amount, weight, grammar, flow, seed) {
        if (amount <= 0.01) return;
        var cutSources = counters.slice(0, 3);
        if (!cutSources.length && (grammar === 'chamber' || amount > 1.02)) {
          cutSources.push({
            x: meta.x, y: meta.y,
            minX: meta.x - weight * 1.2, maxX: meta.x + weight * 1.2,
            minY: meta.y - weight, maxY: meta.y + weight
          });
        }
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = '#000';
        ctx.strokeStyle = '#000';
        for (var i = 0; i < cutSources.length; i++) {
          var source = cutSources[i];
          var componentW = source.maxX - source.minX + 1;
          var componentH = source.maxY - source.minY + 1;
          var radiusX = Math.max(weight * 0.46, Math.min(meta.halfW * 0.28, componentW * (0.2 + amount * 0.24)));
          var radiusY = Math.max(weight * 0.38, Math.min(meta.halfH * 0.27, componentH * (0.2 + amount * 0.24)));
          ctx.beginPath();
          ctx.ellipse(source.x, source.y, radiusX, radiusY,
            flow * 0.08 + (hash(i, seed, 1861) - 0.5) * 0.24, 0, Math.PI * 2);
          ctx.fill();
          if (amount > 0.88) {
            var direction = (hash(i, seed, 1871) > 0.5 ? 1 : -1);
            ctx.lineWidth = Math.max(1, weight * (amount - 0.72) * 0.48);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(source.x, source.y);
            if (params.vertical) ctx.lineTo(meta.x + direction * meta.halfW * 1.08, source.y + flow * weight * 0.35);
            else ctx.lineTo(source.x + flow * weight * 0.35, meta.y + direction * meta.halfH * 1.08);
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      function strokeEtchantContours(ctx, values, gridWidth, gridHeight, threshold, scaleX, scaleY) {
        ctx.beginPath();
        function crossing(a, b) {
          var denominator = b - a;
          return Math.abs(denominator) < 0.00001 ? 0.5 : Math.max(0, Math.min(1, (threshold - a) / denominator));
        }
        for (var y = 0; y < gridHeight - 1; y++) for (var x = 0; x < gridWidth - 1; x++) {
          var index = y * gridWidth + x;
          var a = values[index], b = values[index + 1];
          var c = values[index + gridWidth + 1], d = values[index + gridWidth];
          var points = [];
          if ((a < threshold) !== (b < threshold)) points.push({ x: x + crossing(a, b), y: y });
          if ((b < threshold) !== (c < threshold)) points.push({ x: x + 1, y: y + crossing(b, c) });
          if ((d < threshold) !== (c < threshold)) points.push({ x: x + crossing(d, c), y: y + 1 });
          if ((a < threshold) !== (d < threshold)) points.push({ x: x, y: y + crossing(a, d) });
          if (points.length === 2) {
            ctx.moveTo((points[0].x + 0.5) * scaleX, (points[0].y + 0.5) * scaleY);
            ctx.lineTo((points[1].x + 0.5) * scaleX, (points[1].y + 0.5) * scaleY);
          } else if (points.length === 4) {
            var flip = hash(x, y, params.seed + 1987) > 0.5;
            var firstA = flip ? 0 : 1, firstB = flip ? 1 : 2;
            var secondA = flip ? 2 : 3, secondB = flip ? 3 : 0;
            ctx.moveTo((points[firstA].x + 0.5) * scaleX, (points[firstA].y + 0.5) * scaleY);
            ctx.lineTo((points[firstB].x + 0.5) * scaleX, (points[firstB].y + 0.5) * scaleY);
            ctx.moveTo((points[secondA].x + 0.5) * scaleX, (points[secondA].y + 0.5) * scaleY);
            ctx.lineTo((points[secondB].x + 0.5) * scaleX, (points[secondB].y + 0.5) * scaleY);
          }
        }
        ctx.stroke();
      }

      function boneLamellarSeeds(field, width, height, cell, warp, seed) {
        var bounds = field.bounds;
        var spanX = bounds[2] - bounds[0] + 1, spanY = bounds[3] - bounds[1] + 1;
        var step = Math.max(6, cell * 2.05, Math.sqrt(spanX * spanY / 1800));
        var buckets = Object.create(null), points = [];
        function depth(x, y) {
          x = Math.max(0, Math.min(width - 1, Math.round(x)));
          y = Math.max(0, Math.min(height - 1, Math.round(y)));
          var i = y * width + x;
          return field.inside[i] ? field.distance[i] : 0;
        }
        var rows = Math.ceil(spanY / step), columns = Math.ceil(spanX / step);
        for (var row = 0; row <= rows; row++) for (var col = 0; col <= columns; col++) {
          var id = row * (columns + 1) + col;
          var x = bounds[0] + (col + 0.18 + hash(id, seed, 2701) * 0.64) * step;
          var y = bounds[1] + (row + 0.18 + hash(id, seed, 2707) * 0.64) * step;
          // Choose the deepest occupied sample of this tile. A narrow stem
          // does not have to happen to cross the jittered grid center.
          var best = depth(x, y), bestScore = best * (0.75 + hash(id, seed, 2693) * 0.55);
          for (var sy = 0; sy < 5; sy++) for (var sx = 0; sx < 5; sx++) {
            var px = bounds[0] + (col + (sx + 0.5) / 5) * step;
            var py = bounds[1] + (row + (sy + 0.5) / 5) * step;
            var d = depth(px, py);
            var score = d * (0.75 + hash(id * 31 + sy * 5 + sx, seed, 2699) * 0.55);
            if (score > bestScore + 0.2) { x = px; y = py; best = d; bestScore = score; }
          }
          if (best < 1) continue;
          var radius = Math.max(2, Math.min(step * 0.3, best * 0.7));
          var xx = 0, yy = 0, xy = 0;
          for (var axis = 0; axis < 8; axis++) {
            var a = axis * Math.PI / 4;
            var ax = x + Math.cos(a) * radius, ay = y + Math.sin(a) * radius;
            var gx = depth(ax + 2, ay) - depth(ax - 2, ay);
            var gy = depth(ax, ay + 2) - depth(ax, ay - 2);
            xx += gx * gx; yy += gy * gy; xy += gx * gy;
          }
          var tangent = 0.5 * Math.atan2(2 * xy, xx - yy) + Math.PI / 2;
          if (xx + yy < 0.01) tangent = hash(id, seed, 2711) * Math.PI;
          var aspect = 1.25 + Math.min(3, warp) * 0.25 + hash(id, seed, 2713) * 0.35;
          var point = { x: x, y: y, id: id, depth: best, c: Math.cos(tangent), s: Math.sin(tangent),
            aspect: aspect, radius: step * (0.32 + hash(id, seed, 2719) * 0.38),
            pitch: 0.8 + hash(id, seed, 2731) * 0.4,
            pore: 0.68 + hash(id, seed, 2737) * 0.65,
            phase: hash(id, seed, 2729) * Math.PI * 2 };
          points.push(point);
          var key = Math.floor((x - bounds[0]) / step) + ':' + Math.floor((y - bounds[1]) / step);
          (buckets[key] || (buckets[key] = [])).push(point);
        }
        return { points: points, buckets: buckets, step: step, x: bounds[0], y: bounds[1] };
      }

      function boneLamellarFullMask(glyphs, width, height, pixelScale, L, fm) {
        var full = surfaceScratch('bone-lamellar-full-mask', width, height, true);
        for (var i = 0; i < glyphs.length; i++) {
          if (surfaceGlyphStrength(glyphs[i], 'boneScaffold') <= 0.002) continue;
          var glyph = Object.assign({}, glyphs[i], { opacity: 1 });
          drawSurfaceGlyph(full.ctx, glyph, pixelScale, L, fm, 1);
        }
        return full.canvas;
      }

      function chromeReflectionMotion(phase) {
        // A closed two-axis orbit, evaluated once per frame. Its projections
        // give the metal and coat different drift directions without a global
        // ping-pong reversal. All offsets are zero at rest; the original still
        // material remains exact. Do not wrap the downstream wavePhase: its
        // half-frequency hotLine also needs a genuinely closed input field.
        var orbitX = Math.PI * Math.sin(phase);
        var orbitY = 1 - Math.cos(phase);
        return {
          mercury: orbitX * 0.42 + orbitY * 0.28,
          environment: orbitX * 0.18 + orbitY * 0.25,
          glint: orbitX * 0.72 - orbitY * 0.4,
          mirror: orbitX + orbitY * 0.6,
          chroma: orbitX * 0.22 - orbitY * 0.2,
          coat: orbitX * 0.34 + orbitY * 0.38
        };
      }

      function chromeStudioBlur(values, width, height, radius) {
        var temp = new Float32Array(values.length), result = new Float32Array(values.length), n = radius * 2 + 1;
        for (var y = 0; y < height; y++) {
          var sum = 0, row = y * width;
          for (var k = -radius; k <= radius; k++) sum += values[row + Math.max(0, Math.min(width - 1, k))];
          for (var x = 0; x < width; x++) {
            temp[row + x] = sum / n;
            sum += values[row + Math.min(width - 1, x + radius + 1)] - values[row + Math.max(0, x - radius)];
          }
        }
        for (var x = 0; x < width; x++) {
          var sum = 0;
          for (var k = -radius; k <= radius; k++) sum += temp[Math.max(0, Math.min(height - 1, k)) * width + x];
          for (var y = 0; y < height; y++) {
            result[y * width + x] = sum / n;
            sum += temp[Math.min(height - 1, y + radius + 1) * width + x] - temp[Math.max(0, y - radius) * width + x];
          }
        }
        return result;
      }

      function chromeStudioEnvironment(bands, roughness, voltage, phase) {
        var width = 256, height = 128, data = new Float32Array(width * height * 3);
        var softness = 0.045 + roughness * roughness * 0.38;
        var acid = Math.max(0, Math.min(1, voltage / 6));
        function panel(distance, extent) {
          var t = Math.max(0, Math.min(1, (extent + softness - distance) / (2 * softness)));
          return t * t * (3 - 2 * t);
        }
        for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
          var u = x / width * Math.PI * 2 - Math.PI, v = (y / (height - 1) - 0.5) * Math.PI;
          // A large white softbox, a dark floor and narrow reflected strips.
          // Their unequal scales create a readable body, shadow and highlight.
          var horizon = 0.012 + 0.045 * Math.max(0, Math.sin(v + 0.6));
          var main = panel(Math.abs(u + 0.5), 0.46) * panel(Math.abs(v + 0.3), 0.68)
            * (3 + 6 * Math.exp(-((u + 0.45) * (u + 0.45) * 4 + v * v * 1.4)));
          var side = panel(Math.abs(u - 1.12), 0.28) * panel(Math.abs(v - 0.2), 0.88) * 2.8;
          var strip = Math.pow(Math.max(0, Math.cos(u * bands + v * 0.38 + Math.sin(phase) * 0.6)), 12 - roughness * 9)
            * panel(Math.abs(v - 0.32), 0.43) * 1.8;
          var offset = (y * width + x) * 3;
          for (var ch = 0; ch < 3; ch++) {
            var color = 0.18 + 0.82 * (0.5 + 0.5 * Math.sin(u * 2.1 + v * 3.4 + ch * Math.PI * 2 / 3 + Math.sin(phase) * 0.85));
            data[offset + ch] = horizon * (1 + ch * 0.1) + main * (1 - acid * 0.65 + acid * color * 0.65)
              + side * (1 - acid * 0.86 + acid * color * 0.86) + strip * (1 - acid * 0.4 + acid * color * 0.4);
          }
        }
        return { width: width, height: height, data: data };
      }

      function chromeStudioRelief(field, width, height, bevel) {
        // Screened Poisson relaxation, with a zero-height silhouette boundary.
        // Unlike nearest-edge normals, the interior has no Voronoi crease at
        // the medial axis: adjoining strokes form one continuous metal skin.
        var a = new Float32Array(width * height), active = [[], []];
        var lambda = 4 / (bevel * bevel), load = 4 / bevel;
        for (var i = 0; i < a.length; i++) if (field.inside[i]) {
          a[i] = bevel * (1 - Math.exp(-field.distance[i] / bevel));
          active[((i % width) + Math.floor(i / width)) % 2].push(i);
        }
        for (var iteration = 0; iteration < Math.min(160, Math.max(24, Math.ceil(bevel * 6))); iteration++) {
          for (var parity = 0; parity < 2; parity++) for (var n = 0; n < active[parity].length; n++) {
            var i = active[parity][n], x = i % width;
            var target = ((x ? a[i - 1] : 0) + (x + 1 < width ? a[i + 1] : 0)
              + (i >= width ? a[i - width] : 0) + (i + width < a.length ? a[i + width] : 0) + load) / (4 + lambda);
            a[i] = Math.max(0, a[i] + 1.55 * (target - a[i]));
          }
        }
        return a;
      }

      function chromeStudioPlate(shape, weighted, width, height, settings) {
        var field = surfaceBoundaryDistance(shape, width, height), result = new Uint8ClampedArray(width * height * 4);
        if (!field.bounds) return result;
        var bevel = Math.max(0.5, settings.bevel), phase = settings.phase, warp = settings.warp;
        var heights = chromeStudioRelief(field, width, height, bevel);
        var span = Math.max(1, field.bounds[2] - field.bounds[0], field.bounds[3] - field.bounds[1]);
        var centerX = (field.bounds[0] + field.bounds[2]) * 0.5, centerY = (field.bounds[1] + field.bounds[3]) * 0.5;
        for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
          var i = y * width + x;
          if (!field.inside[i]) continue;
          var d = Math.max(0, field.distance[i]), u = (x - centerX) / span, v = (y - centerY) / span;
          var body = heights[i];
          var wave = Math.sin(u * 14 + Math.sin(phase) * 0.9) * Math.cos(v * 11 + Math.cos(phase) * 0.7)
            + 0.36 * Math.sin((u + v) * 24 - Math.sin(phase) * 0.6);
          heights[i] = body * (1 + warp * 0.24 * wave);
        }
        heights = chromeStudioBlur(heights, width, height, Math.max(1, Math.min(8, Math.round(bevel * 0.13))));
        var env = chromeStudioEnvironment(settings.bands, settings.roughness, settings.voltage, phase);
        var angle = settings.angle + Math.sin(phase) * 0.38, cos = Math.cos(angle), sin = Math.sin(angle);
        var exposure = 0.6 + settings.contrast * 0.64;
        var tint = settings.color.map(function (v) { return 0.38 + 0.62 * Math.pow(v / 255, 2.2); });
        for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
          var i = y * width + x, offset = i * 4;
          if (!weighted[offset + 3]) continue;
          var dx = (heights[y * width + Math.min(width - 1, x + 1)] - heights[y * width + Math.max(0, x - 1)]) * 0.5;
          var dy = (heights[Math.min(height - 1, y + 1) * width + x] - heights[Math.max(0, y - 1) * width + x]) * 0.5;
          var inv = 1 / Math.sqrt(1 + dx * dx + dy * dy), nx = -dx * inv, ny = -dy * inv, nz = inv;
          var rx = 2 * nx * nz, ry = 2 * ny * nz, rz = 2 * nz * nz - 1;
          var ru = rx * cos - ry * sin, rv = rx * sin + ry * cos;
          var eu = ((Math.atan2(ru, rz) / (Math.PI * 2) + 0.5) * env.width + env.width) % env.width;
          var ev = (Math.asin(Math.max(-1, Math.min(1, rv))) / Math.PI + 0.5) * (env.height - 1);
          var x0 = Math.floor(eu), y0 = Math.floor(ev), fx = eu - x0, fy = ev - y0;
          for (var ch = 0; ch < 3; ch++) {
            var a = env.data[(y0 * env.width + x0) * 3 + ch];
            var b = env.data[(y0 * env.width + (x0 + 1) % env.width) * 3 + ch];
            var c = env.data[(Math.min(env.height - 1, y0 + 1) * env.width + x0) * 3 + ch];
            var d = env.data[(Math.min(env.height - 1, y0 + 1) * env.width + (x0 + 1) % env.width) * 3 + ch];
            var light = ((a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy);
            var fresnel = tint[ch] + (1 - tint[ch]) * Math.pow(1 - nz, 5);
            var energy = Math.max(0, light * fresnel * exposure);
            result[offset + ch] = Math.round(255 * Math.pow(energy / (1 + energy), 1 / 2.2));
          }
          result[offset + 3] = weighted[offset + 3];
        }
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext;RC.field(result,function(px,py,rgba){var x=px-.5,y=py-.5;
          var i = y * width + x, offset = i * 4;
          if (!RC.rasterSample(weighted,width,height,x,y,3)) return;
          var dx = (RC.sample(heights,width,height,x+1,y) - RC.sample(heights,width,height,x-1,y)) * 0.5;
          var dy = (RC.sample(heights,width,height,x,y+1) - RC.sample(heights,width,height,x,y-1)) * 0.5;
          var inv = 1 / Math.sqrt(1 + dx * dx + dy * dy), nx = -dx * inv, ny = -dy * inv, nz = inv;
          var rx = 2 * nx * nz, ry = 2 * ny * nz, rz = 2 * nz * nz - 1;
          var ru = rx * cos - ry * sin, rv = rx * sin + ry * cos;
          var eu = ((Math.atan2(ru, rz) / (Math.PI * 2) + 0.5) * env.width + env.width) % env.width;
          var ev = (Math.asin(Math.max(-1, Math.min(1, rv))) / Math.PI + 0.5) * (env.height - 1);
          var x0 = Math.floor(eu), y0 = Math.floor(ev), fx = eu - x0, fy = ev - y0;
          for (var ch = 0; ch < 3; ch++) {
            var a = env.data[(y0 * env.width + x0) * 3 + ch];
            var b = env.data[(y0 * env.width + (x0 + 1) % env.width) * 3 + ch];
            var c = env.data[(Math.min(env.height - 1, y0 + 1) * env.width + x0) * 3 + ch];
            var d = env.data[(Math.min(env.height - 1, y0 + 1) * env.width + (x0 + 1) % env.width) * 3 + ch];
            var light = ((a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy);
            var fresnel = tint[ch] + (1 - tint[ch]) * Math.pow(1 - nz, 5);
            var energy = Math.max(0, light * fresnel * exposure);
            rgba[ch] = Math.round(255 * Math.pow(energy / (1 + energy), 1 / 2.2));
          }
          rgba[3] = RC.rasterSample(weighted,width,height,x,y,3);
        });}
        return result;
      }

      function ligatureCryptCurve(pair, index, band, rise) {
        var orderA = pair.a.source.glyphIndex || 0;
        var orderB = pair.b.source.glyphIndex || orderA + 1;
        var sourcePhase = hash(orderA * 17 + index, orderB * 31, params.seed + 2141);
        var orderPhase = (orderA + orderB + Math.floor(sourcePhase * 5)) % 5;
        var direction = rise < 0 ? -1 : 1;
        var polarity = orderPhase === 0 || orderPhase === 4 ? -direction : direction;
        var magnitude = Math.abs(rise);
        return {
          rise: polarity * (pair.distance * (0.08 + sourcePhase * 0.11) * magnitude
            + band * (0.16 + sourcePhase * 0.3) * Math.min(1.4, magnitude)),
          skew: hash(orderB * 19 + index, orderA * 23, params.seed + 2143) * 1.4 - 0.7
        };
      }

      function traceLigatureCryptBand(ctx, a, b, halfWidth, rise, skew) {
        var dx = b.x - a.x, dy = b.y - a.y;
        var distance = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
        var nx = -dy / distance, ny = dx / distance;
        var firstT = 0.28 + skew * 0.08;
        var secondT = 0.72 + skew * 0.08;
        var firstRise = rise * (0.48 - skew * 0.28);
        var secondRise = rise * (1.02 + skew * 0.24);
        var leftControlX = a.x + dx * firstT + nx * (firstRise + halfWidth);
        var leftControlY = a.y + dy * firstT + ny * (firstRise + halfWidth);
        var rightControlX = a.x + dx * secondT + nx * (secondRise + halfWidth);
        var rightControlY = a.y + dy * secondT + ny * (secondRise + halfWidth);
        ctx.beginPath();
        ctx.moveTo(a.x + nx * halfWidth, a.y + ny * halfWidth);
        ctx.bezierCurveTo(leftControlX, leftControlY, rightControlX, rightControlY,
          b.x + nx * halfWidth, b.y + ny * halfWidth);
        ctx.lineTo(b.x - nx * halfWidth, b.y - ny * halfWidth);
        ctx.bezierCurveTo(a.x + dx * secondT + nx * (secondRise - halfWidth),
          a.y + dy * secondT + ny * (secondRise - halfWidth),
          a.x + dx * firstT + nx * (firstRise - halfWidth),
          a.y + dy * firstT + ny * (firstRise - halfWidth),
          a.x - nx * halfWidth, a.y - ny * halfWidth);
        ctx.closePath();
      }

      function strokeLigatureCryptSpine(ctx, a, b, rise, skew, offset) {
        var dx = b.x - a.x, dy = b.y - a.y;
        var distance = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
        var nx = -dy / distance, ny = dx / distance;
        var firstT = 0.28 + skew * 0.08;
        var secondT = 0.72 + skew * 0.08;
        var firstRise = rise * (0.48 - skew * 0.28) + (offset || 0);
        var secondRise = rise * (1.02 + skew * 0.24) + (offset || 0);
        ctx.beginPath();
        ctx.moveTo(a.x + nx * (offset || 0), a.y + ny * (offset || 0));
        ctx.bezierCurveTo(a.x + dx * firstT + nx * firstRise,
          a.y + dy * firstT + ny * firstRise,
          a.x + dx * secondT + nx * secondRise,
          a.y + dy * secondT + ny * secondRise,
          b.x + nx * (offset || 0), b.y + ny * (offset || 0));
        ctx.stroke();
      }

      function traceLigatureCryptSeal(ctx, x, y, angle, size) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(-size, size * 0.5);
        ctx.bezierCurveTo(-size * 0.92, -size * 0.24, -size * 0.42, -size * 0.72, 0, -size);
        ctx.bezierCurveTo(size * 0.42, -size * 0.72, size * 0.92, -size * 0.24, size, size * 0.5);
        ctx.lineTo(size * 0.46, size);
        ctx.lineTo(0, size * 0.64);
        ctx.lineTo(-size * 0.46, size);
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-size * 0.44, size * 0.28);
        ctx.quadraticCurveTo(0, -size * 0.5, size * 0.44, size * 0.28);
        ctx.moveTo(0, -size * 0.52);
        ctx.lineTo(0, size * 0.64);
        ctx.stroke();
        ctx.restore();
      }

      function cutLigatureCryptAperture(ctx, x, y, angle, halfLength, halfHeight) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(-halfLength, 0);
        ctx.bezierCurveTo(-halfLength * 0.58, -halfHeight * 0.22,
          -halfLength * 0.32, -halfHeight, 0, -halfHeight);
        ctx.bezierCurveTo(halfLength * 0.32, -halfHeight,
          halfLength * 0.58, -halfHeight * 0.22, halfLength, 0);
        ctx.bezierCurveTo(halfLength * 0.58, halfHeight * 0.22,
          halfLength * 0.32, halfHeight, 0, halfHeight);
        ctx.bezierCurveTo(-halfLength * 0.32, halfHeight,
          -halfLength * 0.58, halfHeight * 0.22, -halfLength, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      function ligatureConstructionGeometry(pair, riseOffset) {
        var dx = pair.b.x - pair.a.x, dy = pair.b.y - pair.a.y;
        var distance = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
        var nx = -dy / distance, ny = dx / distance;
        return {
          dx: dx, dy: dy, distance: distance,
          ux: dx / distance, uy: dy / distance, nx: nx, ny: ny,
          midX: (pair.a.x + pair.b.x) * 0.5 + nx * riseOffset,
          midY: (pair.a.y + pair.b.y) * 0.5 + ny * riseOffset
        };
      }

      function traceLigatureConstructionBand(ctx, pair, halfWidth, riseOffset, waist, angular) {
        var geometry = ligatureConstructionGeometry(pair, riseOffset);
        var nx = geometry.nx, ny = geometry.ny;
        var midHalf = halfWidth * waist;
        ctx.beginPath();
        ctx.moveTo(pair.a.x + nx * halfWidth, pair.a.y + ny * halfWidth);
        if (angular) {
          ctx.lineTo(pair.a.x + geometry.dx * 0.34 + nx * (riseOffset * 0.58 + halfWidth * 0.78),
            pair.a.y + geometry.dy * 0.34 + ny * (riseOffset * 0.58 + halfWidth * 0.78));
          ctx.lineTo(geometry.midX + nx * midHalf, geometry.midY + ny * midHalf);
          ctx.lineTo(pair.a.x + geometry.dx * 0.68 + nx * (riseOffset * 0.72 + halfWidth * 0.78),
            pair.a.y + geometry.dy * 0.68 + ny * (riseOffset * 0.72 + halfWidth * 0.78));
          ctx.lineTo(pair.b.x + nx * halfWidth, pair.b.y + ny * halfWidth);
        } else {
          ctx.quadraticCurveTo(pair.a.x + geometry.dx * 0.26 + nx * (riseOffset * 0.42 + halfWidth),
            pair.a.y + geometry.dy * 0.26 + ny * (riseOffset * 0.42 + halfWidth),
            geometry.midX + nx * midHalf, geometry.midY + ny * midHalf);
          ctx.quadraticCurveTo(pair.a.x + geometry.dx * 0.74 + nx * (riseOffset * 0.42 + halfWidth),
            pair.a.y + geometry.dy * 0.74 + ny * (riseOffset * 0.42 + halfWidth),
            pair.b.x + nx * halfWidth, pair.b.y + ny * halfWidth);
        }
        ctx.lineTo(pair.b.x - nx * halfWidth, pair.b.y - ny * halfWidth);
        if (angular) {
          ctx.lineTo(pair.a.x + geometry.dx * 0.68 + nx * (riseOffset * 0.72 - halfWidth * 0.78),
            pair.a.y + geometry.dy * 0.68 + ny * (riseOffset * 0.72 - halfWidth * 0.78));
          ctx.lineTo(geometry.midX - nx * midHalf, geometry.midY - ny * midHalf);
          ctx.lineTo(pair.a.x + geometry.dx * 0.34 + nx * (riseOffset * 0.58 - halfWidth * 0.78),
            pair.a.y + geometry.dy * 0.34 + ny * (riseOffset * 0.58 - halfWidth * 0.78));
          ctx.lineTo(pair.a.x - nx * halfWidth, pair.a.y - ny * halfWidth);
        } else {
          ctx.quadraticCurveTo(pair.a.x + geometry.dx * 0.74 + nx * (riseOffset * 0.42 - halfWidth),
            pair.a.y + geometry.dy * 0.74 + ny * (riseOffset * 0.42 - halfWidth),
            geometry.midX - nx * midHalf, geometry.midY - ny * midHalf);
          ctx.quadraticCurveTo(pair.a.x + geometry.dx * 0.26 + nx * (riseOffset * 0.42 - halfWidth),
            pair.a.y + geometry.dy * 0.26 + ny * (riseOffset * 0.42 - halfWidth),
            pair.a.x - nx * halfWidth, pair.a.y - ny * halfWidth);
        }
        ctx.closePath();
      }

      function strokeLigatureConstructionRail(ctx, pair, riseOffset, offset, angular) {
        var geometry = ligatureConstructionGeometry(pair, riseOffset);
        ctx.beginPath();
        ctx.moveTo(pair.a.x + geometry.nx * offset, pair.a.y + geometry.ny * offset);
        if (angular) {
          ctx.lineTo(geometry.midX + geometry.nx * offset, geometry.midY + geometry.ny * offset);
          ctx.lineTo(pair.b.x + geometry.nx * offset, pair.b.y + geometry.ny * offset);
        } else {
          ctx.quadraticCurveTo(geometry.midX + geometry.nx * offset,
            geometry.midY + geometry.ny * offset,
            pair.b.x + geometry.nx * offset, pair.b.y + geometry.ny * offset);
        }
        ctx.stroke();
      }

      function ligatureConstructionPoint(pair, riseOffset, t) {
        var geometry = ligatureConstructionGeometry(pair, riseOffset);
        var inverse = 1 - t;
        return {
          x: inverse * inverse * pair.a.x + 2 * inverse * t * geometry.midX + t * t * pair.b.x,
          y: inverse * inverse * pair.a.y + 2 * inverse * t * geometry.midY + t * t * pair.b.y,
          nx: geometry.nx, ny: geometry.ny
        };
      }

      function ligatureCryptPairCompatibleV32(a, b) {
        if (!a || !b || !a.glyph || !b.glyph) return false;
        if (a.glyph.line !== b.glyph.line || a.glyph.word !== b.glyph.word) return false;
        if (a.glyph.composition || b.glyph.composition) {
          if (!a.glyph.composition || !b.glyph.composition) return false;
          var sourceA = Number(a.glyph.sourceIndex);
          var sourceB = Number(b.glyph.sourceIndex);
          // Generated layouts may place the end of one copy immediately
          // beside the beginning of another. Only consecutive source glyphs
          // are allowed to become one word-form.
          if (!isFinite(sourceA) || !isFinite(sourceB) || sourceB !== sourceA + 1) return false;
        }
        return true;
      }

      function ligatureCryptMaskAlphaV32(data, width, height, x, y) {
        var px = Math.round(x), py = Math.round(y);
        if (px < 0 || py < 0 || px >= width || py >= height) return 0;
        return data[(py * width + px) * 4 + 3];
      }

      function ligatureCryptMaskAnchorV32(data, width, height, node, other, band) {
        var dx = other.x - node.x, dy = other.y - node.y;
        var distance = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
        var ux = dx / distance, uy = dy / distance;
        var nx = -uy, ny = ux;
        var step = Math.max(1, Math.min(3, band * 0.075));
        var forward = Math.min(distance * 0.48, Math.max(node.r * 3.2, band * 2.2));
        var backward = Math.min(distance * 0.2, Math.max(node.r * 1.15, band * 0.68));
        var normalSpan = Math.min(Math.max(node.r * 1.9, band * 0.92), Math.max(band, distance * 0.46));
        var bestScore = -Infinity, weightedT = 0, weightedS = 0, weight = 0;
        for (var t = -backward; t <= forward; t += step) {
          for (var s = -normalSpan; s <= normalSpan; s += step) {
            var alpha = ligatureCryptMaskAlphaV32(data, width, height,
              node.x + ux * t + nx * s, node.y + uy * t + ny * s);
            if (alpha < 18) continue;
            // A serif tip can be farther forward than the actual joining
            // stroke. Penalising lateral travel selects the nearest useful
            // face while still escaping an empty counter at the box centre.
            var score = t - Math.abs(s) * 0.58;
            if (score > bestScore + step * 0.56) {
              bestScore = score;
              weightedT = t * alpha;
              weightedS = s * alpha;
              weight = alpha;
            } else if (Math.abs(score - bestScore) <= step * 1.12) {
              weightedT += t * alpha;
              weightedS += s * alpha;
              weight += alpha;
            }
          }
        }
        var bestT;
        if (!isFinite(bestScore)) {
          bestT = Math.min(distance * 0.2, Math.max(node.r, band * 0.42));
          weightedT = bestT;
          weightedS = 0;
          weight = 1;
        } else bestT = weightedT / Math.max(1, weight);
        var normalOffset = weight ? weightedS / weight : 0;
        var inset = Math.min(band * 0.05, Math.max(0, bestT * 0.08));
        return {
          x: node.x + ux * (bestT - inset) + nx * normalOffset,
          y: node.y + uy * (bestT - inset) + ny * normalOffset
        };
      }

      function ligatureCryptPairsV32(nodes, maskData, width, height, reach, band) {
        var pairs = [];
        for (var i = 0; i < nodes.length - 1 && pairs.length < 96; i++) {
          var nodeA = nodes[i], nodeB = nodes[i + 1];
          if (!ligatureCryptPairCompatibleV32(nodeA, nodeB)) continue;
          var centerDx = nodeB.x - nodeA.x, centerDy = nodeB.y - nodeA.y;
          var centerDistance = Math.sqrt(centerDx * centerDx + centerDy * centerDy);
          if (centerDistance < 1 || centerDistance > reach) continue;
          var anchorA = ligatureCryptMaskAnchorV32(maskData, width, height, nodeA, nodeB, band);
          var anchorB = ligatureCryptMaskAnchorV32(maskData, width, height, nodeB, nodeA, band);
          var centerUx = centerDx / centerDistance, centerUy = centerDy / centerDistance;
          var centerNx = -centerUy, centerNy = centerUx;
          var advanceA = Math.max(0, (anchorA.x - nodeA.x) * centerUx + (anchorA.y - nodeA.y) * centerUy);
          var advanceB = Math.max(0, -((anchorB.x - nodeB.x) * centerUx + (anchorB.y - nodeB.y) * centerUy));
          var normalA = (anchorA.x - nodeA.x) * centerNx + (anchorA.y - nodeA.y) * centerNy;
          var normalB = (anchorB.x - nodeB.x) * centerNx + (anchorB.y - nodeB.y) * centerNy;
          var sharedNormal = Math.max(-band * 0.2, Math.min(band * 0.2, (normalA + normalB) * 0.5));
          // The face search still determines how deeply each glyph is
          // entered, but both faces share one writing-direction seam. This
          // keeps a word coherent instead of turning every serif tip into a
          // new diagonal connector.
          anchorA.x = nodeA.x + centerUx * advanceA + centerNx * sharedNormal;
          anchorA.y = nodeA.y + centerUy * advanceA + centerNy * sharedNormal;
          anchorB.x = nodeB.x - centerUx * advanceB + centerNx * sharedNormal;
          anchorB.y = nodeB.y - centerUy * advanceB + centerNy * sharedNormal;
          var dx = anchorB.x - anchorA.x, dy = anchorB.y - anchorA.y;
          var gapDistance = Math.sqrt(dx * dx + dy * dy);
          if (gapDistance < 0.8) {
            anchorA.x -= centerUx * band * 0.12;
            anchorA.y -= centerUy * band * 0.12;
            anchorB.x += centerUx * band * 0.12;
            anchorB.y += centerUy * band * 0.12;
            dx = anchorB.x - anchorA.x;
            dy = anchorB.y - anchorA.y;
            gapDistance = Math.max(0.8, Math.sqrt(dx * dx + dy * dy));
          }
          var sourceA = nodeA.glyph.sourceText || nodeA.glyph.ch || '';
          var sourceB = nodeB.glyph.sourceText || nodeB.glyph.ch || '';
          var codeA = sourceA.codePointAt(0) || nodeA.glyphIndex;
          var codeB = sourceB.codePointAt(0) || nodeB.glyphIndex;
          pairs.push({
            a: anchorA, b: anchorB, distance: gapDistance,
            ux: dx / gapDistance, uy: dy / gapDistance,
            nx: -dy / gapDistance, ny: dx / gapDistance,
            strength: Math.min(nodeA.strength, nodeB.strength),
            aNode: nodeA, bNode: nodeB,
            variant: Math.floor(hash(codeA + i * 13, codeB + i * 29, params.seed + 3191) * 4),
            polarity: hash(codeB + i * 17, codeA + i * 31, params.seed + 3193) < 0.5 ? -1 : 1
          });
        }
        return pairs;
      }

      function ligatureCryptDrawMortiseMaskV32(ctx, pair, band, weave, counter, knot) {
        var d = pair.distance;
        var half = Math.max(2, Math.min(band * (0.27 + Math.min(4, weave) * 0.035),
          Math.max(band * 0.18, d * 0.4)));
        var nodeReach = Math.max(pair.aNode.r, pair.bNode.r);
        var depth = Math.max(half * 1.08,
          Math.min(nodeReach * (0.64 + Math.min(4, weave) * 0.055), band * 0.58));
        var neck = half * Math.max(0.38, 0.68 - Math.min(1.5, counter) * 0.16);
        var keyHalf = Math.min(d * 0.13, half * (0.46 + Math.min(4, weave) * 0.045));
        var shoulder = half * (1.04 + (pair.variant % 2) * 0.08);
        pair.mortiseV32 = { half: half, depth: depth, neck: neck, keyHalf: keyHalf };
        ctx.save();
        ctx.translate(pair.a.x, pair.a.y);
        ctx.rotate(Math.atan2(pair.uy, pair.ux));
        ctx.globalAlpha = pair.strength;
        ctx.beginPath();
        ctx.moveTo(-depth, -shoulder);
        ctx.lineTo(depth * 0.18, -shoulder);
        ctx.lineTo(depth * 0.18, -neck);
        ctx.lineTo(d * 0.5 - keyHalf, -neck);
        ctx.lineTo(d * 0.5 - keyHalf, -half * 0.78);
        ctx.lineTo(d * 0.5 + keyHalf, -half * 0.78);
        ctx.lineTo(d * 0.5 + keyHalf, -neck);
        ctx.lineTo(d - depth * 0.18, -neck);
        ctx.lineTo(d - depth * 0.18, -shoulder);
        ctx.lineTo(d + depth, -shoulder);
        ctx.lineTo(d + depth, shoulder);
        ctx.lineTo(d - depth * 0.18, shoulder);
        ctx.lineTo(d - depth * 0.18, neck);
        ctx.lineTo(d * 0.5 + keyHalf, neck);
        ctx.lineTo(d * 0.5 + keyHalf, half * 0.78);
        ctx.lineTo(d * 0.5 - keyHalf, half * 0.78);
        ctx.lineTo(d * 0.5 - keyHalf, neck);
        ctx.lineTo(depth * 0.18, neck);
        ctx.lineTo(depth * 0.18, shoulder);
        ctx.lineTo(-depth, shoulder);
        ctx.closePath();
        ctx.fill();

        var pegRadius = Math.max(0.8, Math.min(half * 0.36, knot * 0.34 + band * 0.035));
        if (pegRadius > 0.85 && pair.variant !== 0) {
          ctx.beginPath();
          if (pair.variant === 2) {
            ctx.moveTo(d * 0.5, -pegRadius * 1.3);
            ctx.lineTo(d * 0.5 + pegRadius * 1.3, 0);
            ctx.lineTo(d * 0.5, pegRadius * 1.3);
            ctx.lineTo(d * 0.5 - pegRadius * 1.3, 0);
            ctx.closePath();
          } else ctx.arc(d * 0.5, 0, pegRadius, 0, Math.PI * 2);
          ctx.fill();
        }

        if (counter > 0.02 && d > 2) {
          var slotLength = Math.max(0.8, Math.min(d * 0.14, half * (0.34 + counter * 0.28)));
          var slotHeight = Math.max(0.55, Math.min(neck * 0.56, half * (0.1 + counter * 0.16)));
          ctx.globalCompositeOperation = 'destination-out';
          ctx.globalAlpha = pair.strength * Math.min(1, 0.58 + counter * 0.34);
          ctx.fillRect(d * 0.5 - slotLength, -slotHeight, slotLength * 2, slotHeight * 2);
          if (weave > 2.15 && d > half * 2.4) {
            var sideSlot = Math.min(d * 0.2, half * 0.92);
            ctx.fillRect(d * 0.28 - sideSlot * 0.5, -slotHeight * 0.72, sideSlot, slotHeight * 1.44);
            ctx.fillRect(d * 0.72 - sideSlot * 0.5, -slotHeight * 0.72, sideSlot, slotHeight * 1.44);
          }
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.restore();
      }

      function ligatureCryptBraidPathV32(ctx, pair, braid, over) {
        var d = pair.distance;
        var sign = braid.sign * (over ? -1 : 1);
        var start = -braid.depth;
        var span = d + braid.depth * 2;
        ctx.save();
        ctx.translate(pair.a.x, pair.a.y);
        ctx.rotate(Math.atan2(pair.uy, pair.ux));
        ctx.beginPath();
        ctx.moveTo(start, sign * braid.width * 0.18);
        ctx.lineTo(start + span * 0.27, sign * braid.arch);
        ctx.lineTo(start + span * 0.48, -sign * braid.arch * 0.08);
        ctx.lineTo(start + span * 0.73, -sign * braid.arch * 0.62);
        ctx.lineTo(d + braid.depth, -sign * braid.width * 0.18);
        ctx.stroke();
        ctx.restore();
      }

      function ligatureCryptDrawBraidMaskV32(ctx, pair, band, weave, counter, rise) {
        var width = Math.max(2, Math.min(band * (0.19 + weave * 0.025),
          Math.max(band * 0.14, pair.distance * 0.28)));
        var nodeReach = Math.max(pair.aNode.r, pair.bNode.r);
        var depth = Math.max(width * 1.28, Math.min(nodeReach * 0.82, band * 0.52));
        var fullSpan = pair.distance + depth * 2;
        var arch = Math.max(width * 0.78, Math.min(fullSpan * 0.34,
          Math.abs(rise) * band * (0.34 + weave * 0.075)));
        var sign = (rise < 0 ? -1 : 1) * pair.polarity;
        var braid = { width: width, depth: depth, arch: arch, sign: sign };
        pair.braidV32 = braid;
        ctx.save();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = width;
        ctx.lineCap = 'square';
        ctx.lineJoin = 'miter';
        ctx.globalAlpha = pair.strength * 0.94;
        ligatureCryptBraidPathV32(ctx, pair, braid, false);
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = pair.strength * Math.min(1, 0.64 + counter * 0.22);
        ctx.save();
        ctx.translate(pair.a.x, pair.a.y);
        ctx.rotate(Math.atan2(pair.uy, pair.ux));
        ctx.beginPath();
        ctx.ellipse(pair.distance * 0.5, 0,
          Math.max(0.9, width * (0.18 + counter * 0.18)),
          Math.max(0.8, width * (0.7 + counter * 0.18)), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = pair.strength;
        ligatureCryptBraidPathV32(ctx, pair, braid, true);
        ctx.save();
        ctx.translate(pair.a.x, pair.a.y);
        ctx.rotate(Math.atan2(pair.uy, pair.ux));
        if (weave > 2.2) {
          var nib = width * (0.32 + Math.min(4, weave) * 0.025);
          for (var endIndex = 0; endIndex < 2; endIndex++) {
            var endX = endIndex ? pair.distance : 0;
            ctx.save();
            ctx.translate(endX, 0);
            ctx.rotate(Math.PI / 4);
            ctx.fillRect(-nib, -nib, nib * 2, nib * 2);
            ctx.restore();
          }
        }
        ctx.restore();
        ctx.restore();
      }

      function ligatureCryptPrepareSutureV32(bodyCtx, pair, band, weave, counter, knot, rise) {
        var radius = Math.max(0.68, Math.min(band * 0.12, knot * 0.22 + band * 0.022));
        var count = Math.min(14, Math.max(3, Math.round(2.5 + weave * 1.35 + counter * 0.8)));
        var maxRadius = Math.max(pair.aNode.r, pair.bNode.r);
        var spread = Math.max(radius * 3.4, Math.min(maxRadius * 1.18, band * (0.45 + weave * 0.12)));
        var pitch = count > 1 ? spread * 2 / (count - 1) : 0;
        var sutures = [];
        bodyCtx.save();
        bodyCtx.fillStyle = '#fff';
        bodyCtx.globalAlpha = pair.strength;
        for (var i = 0; i < count; i++) {
          var offset = -spread + pitch * i;
          var stagger = (i % 2 ? 1 : -1) * pitch * (0.18 + Math.min(1.5, counter) * 0.08);
          var aPoint = {
            x: pair.a.x + pair.nx * offset - pair.ux * radius * 0.62,
            y: pair.a.y + pair.ny * offset - pair.uy * radius * 0.62
          };
          var bPoint = {
            x: pair.b.x + pair.nx * (offset + stagger) + pair.ux * radius * 0.62,
            y: pair.b.y + pair.ny * (offset + stagger) + pair.uy * radius * 0.62
          };
          bodyCtx.beginPath();
          bodyCtx.arc(aPoint.x, aPoint.y, radius * 1.72, 0, Math.PI * 2);
          bodyCtx.arc(bPoint.x, bPoint.y, radius * 1.72, 0, Math.PI * 2);
          bodyCtx.fill();
          sutures.push({
            a: aPoint, b: bPoint,
            bow: pair.polarity * (i % 2 ? -1 : 1) * band * rise * (0.07 + weave * 0.012),
            knot: i % Math.max(2, 5 - Math.min(3, Math.floor(weave))) === 0
          });
        }
        bodyCtx.globalCompositeOperation = 'destination-out';
        bodyCtx.globalAlpha = pair.strength * Math.min(1, 0.72 + counter * 0.2);
        for (var h = 0; h < sutures.length; h++) {
          bodyCtx.beginPath();
          bodyCtx.arc(sutures[h].a.x, sutures[h].a.y, radius, 0, Math.PI * 2);
          bodyCtx.arc(sutures[h].b.x, sutures[h].b.y, radius, 0, Math.PI * 2);
          bodyCtx.fill();
        }
        bodyCtx.restore();
        pair.sutureV32 = { radius: radius, sutures: sutures };
      }

      function ligatureCryptNearestInkV32(data, width, height, node, radius) {
        var step = Math.max(1, radius / 14);
        var best = null, bestDistance = Infinity;
        for (var y = node.y - radius; y <= node.y + radius; y += step) {
          for (var x = node.x - radius; x <= node.x + radius; x += step) {
            var alpha = ligatureCryptMaskAlphaV32(data, width, height, x, y);
            if (alpha < 32) continue;
            var dx = x - node.x, dy = y - node.y;
            var distance = dx * dx + dy * dy - alpha * 0.006;
            if (distance < bestDistance) {
              bestDistance = distance;
              best = { x: x, y: y };
            }
          }
        }
        return best || { x: node.x, y: node.y };
      }

      function ligatureCryptPrepareSolitaryV32(bodyCtx, data, width, height, node,
        grammar, band, weave, counter, knot, rise) {
        var point = ligatureCryptNearestInkV32(data, width, height, node, Math.max(node.r * 1.9, band));
        var size = Math.max(1.5, Math.min(node.r * 0.74, band * (0.22 + weave * 0.035)));
        bodyCtx.save();
        bodyCtx.translate(point.x, point.y);
        bodyCtx.rotate((hash(node.glyphIndex, params.seed, 3251) * 0.5 - 0.25) * Math.PI);
        bodyCtx.globalCompositeOperation = 'destination-out';
        bodyCtx.globalAlpha = node.strength * Math.min(1, 0.58 + counter * 0.28);
        if (grammar === 'joinery') bodyCtx.fillRect(-size * 1.25, -size * 0.28, size * 2.5, size * 0.56);
        else if (grammar === 'blackletter') {
          bodyCtx.beginPath();
          bodyCtx.moveTo(0, -size);
          bodyCtx.lineTo(size * 0.55, 0);
          bodyCtx.lineTo(0, size);
          bodyCtx.lineTo(-size * 0.55, 0);
          bodyCtx.closePath();
          bodyCtx.fill();
        } else {
          bodyCtx.fillRect(-size * 0.14, -size * 1.2, size * 0.28, size * 2.4);
          bodyCtx.beginPath();
          bodyCtx.arc(-size * 0.72, -size * 0.65, Math.max(0.7, knot * 0.16), 0, Math.PI * 2);
          bodyCtx.arc(size * 0.72, size * 0.65, Math.max(0.7, knot * 0.16), 0, Math.PI * 2);
          bodyCtx.fill();
        }
        bodyCtx.restore();
        return { point: point, size: size, grammar: grammar, strength: node.strength, rise: rise };
      }

      function ligatureCryptPaintMortiseV32(ctx, pair, weave, counter, knot) {
        var joint = pair.mortiseV32;
        if (!joint) return;
        ctx.save();
        ctx.translate(pair.a.x, pair.a.y);
        ctx.rotate(Math.atan2(pair.uy, pair.ux));
        ctx.globalAlpha = pair.strength * 0.78;
        ctx.strokeStyle = params.paper;
        ctx.lineCap = 'square';
        ctx.lineJoin = 'miter';
        ctx.lineWidth = Math.max(0.55, joint.half * 0.075);
        ctx.beginPath();
        ctx.moveTo(joint.depth * 0.2, -joint.half * 0.62);
        ctx.lineTo(pair.distance * 0.5 - joint.keyHalf, -joint.half * 0.62);
        ctx.moveTo(pair.distance * 0.5 + joint.keyHalf, joint.half * 0.62);
        ctx.lineTo(pair.distance - joint.depth * 0.2, joint.half * 0.62);
        ctx.moveTo(joint.depth * 0.18, -joint.half);
        ctx.lineTo(joint.depth * 0.18, joint.half);
        ctx.moveTo(pair.distance - joint.depth * 0.18, -joint.half);
        ctx.lineTo(pair.distance - joint.depth * 0.18, joint.half);
        ctx.stroke();
        var pegRadius = Math.max(0.8, Math.min(joint.half * 0.36, knot * 0.34 + joint.half * 0.1));
        if (pegRadius > 0.9) {
          ctx.globalAlpha = pair.strength * 0.88;
          ctx.lineWidth = Math.max(0.55, pegRadius * 0.22);
          ctx.beginPath();
          ctx.arc(pair.distance * 0.5, 0, pegRadius * 0.62, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (weave > 1.1) {
          var ticks = Math.min(12, Math.max(2, Math.round(weave * 2.4)));
          ctx.globalAlpha = pair.strength * 0.4;
          ctx.lineWidth = Math.max(0.45, joint.half * 0.035);
          for (var i = 1; i < ticks; i++) {
            var x = pair.distance * i / ticks;
            if (Math.abs(x - pair.distance * 0.5) < joint.keyHalf * 1.35) continue;
            ctx.beginPath();
            ctx.moveTo(x, -joint.neck * 0.88);
            ctx.lineTo(x + (pair.variant % 2 ? joint.half * 0.12 : 0), joint.neck * 0.88);
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      function ligatureCryptPaintBraidV32(ctx, pair, weave, counter) {
        var braid = pair.braidV32;
        if (!braid) return;
        ctx.save();
        ctx.strokeStyle = params.paper;
        ctx.lineCap = 'square';
        ctx.lineJoin = 'miter';
        ctx.globalAlpha = pair.strength * Math.min(0.9, 0.4 + counter * 0.32);
        ctx.lineWidth = Math.max(0.65, braid.width * Math.min(0.42, 0.12 + counter * 0.18));
        ligatureCryptBraidPathV32(ctx, pair, braid, false);
        ligatureCryptBraidPathV32(ctx, pair, braid, true);
        if (weave > 1.45) {
          ctx.strokeStyle = surfaceEffectColor('ligatureCrypt');
          ctx.globalAlpha = pair.strength * 0.68;
          ctx.lineWidth = Math.max(0.4, braid.width * 0.045);
          ligatureCryptBraidPathV32(ctx, pair, braid, false);
          ligatureCryptBraidPathV32(ctx, pair, braid, true);
        }
        ctx.restore();
      }

      function ligatureCryptThreadPathV32(ctx, stitch, pair) {
        var dx = stitch.b.x - stitch.a.x, dy = stitch.b.y - stitch.a.y;
        ctx.beginPath();
        ctx.moveTo(stitch.a.x, stitch.a.y);
        ctx.bezierCurveTo(stitch.a.x + dx * 0.34 + pair.nx * stitch.bow,
          stitch.a.y + dy * 0.34 + pair.ny * stitch.bow,
          stitch.a.x + dx * 0.66 + pair.nx * stitch.bow,
          stitch.a.y + dy * 0.66 + pair.ny * stitch.bow,
          stitch.b.x, stitch.b.y);
        ctx.stroke();
      }

      function ligatureCryptPaintSutureV32(ctx, pair, band, weave, knot) {
        var seam = pair.sutureV32;
        if (!seam) return;
        var threadWidth = Math.max(0.48, Math.min(band * 0.038, seam.radius * (0.44 + weave * 0.035)));
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (var pass = 0; pass < 2; pass++) {
          ctx.strokeStyle = pass ? surfaceEffectColor('ligatureCrypt') : params.paper;
          ctx.lineWidth = pass ? threadWidth : threadWidth * 2.15;
          ctx.globalAlpha = pair.strength * (pass ? 0.92 : 0.84);
          for (var i = 0; i < seam.sutures.length; i++) ligatureCryptThreadPathV32(ctx, seam.sutures[i], pair);
        }
        for (var k = 0; k < seam.sutures.length; k++) {
          var stitch = seam.sutures[k];
          if (!stitch.knot || knot <= 0.2) continue;
          var mx = (stitch.a.x + stitch.b.x) * 0.5 + pair.nx * stitch.bow * 0.72;
          var my = (stitch.a.y + stitch.b.y) * 0.5 + pair.ny * stitch.bow * 0.72;
          var loop = Math.max(threadWidth * 1.5, Math.min(seam.radius * 1.28, knot * 0.34));
          ctx.strokeStyle = surfaceEffectColor('ligatureCrypt');
          ctx.globalAlpha = pair.strength * 0.9;
          ctx.lineWidth = threadWidth;
          ctx.beginPath();
          ctx.ellipse(mx, my, loop, loop * 0.48,
            Math.atan2(pair.uy, pair.ux) + (k % 2 ? 0.4 : -0.4), 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      function ligatureCryptPaintSolitaryV32(ctx, item) {
        ctx.save();
        ctx.translate(item.point.x, item.point.y);
        ctx.strokeStyle = params.paper;
        ctx.fillStyle = surfaceEffectColor('ligatureCrypt');
        ctx.globalAlpha = item.strength * 0.82;
        ctx.lineWidth = Math.max(0.55, item.size * 0.13);
        if (item.grammar === 'joinery') {
          ctx.strokeRect(-item.size * 1.55, -item.size * 0.58, item.size * 3.1, item.size * 1.16);
          ctx.beginPath();
          ctx.arc(0, 0, item.size * 0.28, 0, Math.PI * 2);
          ctx.stroke();
        } else if (item.grammar === 'blackletter') {
          ctx.rotate(Math.PI / 4);
          ctx.strokeRect(-item.size * 0.64, -item.size * 0.64, item.size * 1.28, item.size * 1.28);
        } else {
          ctx.beginPath();
          ctx.moveTo(-item.size, -item.size * 0.82);
          ctx.bezierCurveTo(item.size * 0.5, -item.size * 0.22,
            -item.size * 0.5, item.size * 0.22, item.size, item.size * 0.82);
          ctx.stroke();
        }
        ctx.restore();
      }

      function traceTexturaStem(ctx, centerX, startY, endY, width, nibAngle, split, spur, alpha) {
        var half = width * 0.5;
        var runHeight = Math.max(1, endY - startY);
        var slant = Math.sin(nibAngle) * Math.min(width * 0.72, runHeight * 0.18);
        var gap = Math.min(width * 0.72, width * split * 0.58);
        function stemPart(left, right) {
          if (right - left <= 0.2) return;
          ctx.beginPath();
          ctx.moveTo(centerX + left + slant, startY);
          ctx.lineTo(centerX + right + slant, startY);
          ctx.lineTo(centerX + right - slant, endY);
          ctx.lineTo(centerX + left - slant, endY);
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalAlpha = alpha;
        if (gap > 0.15) {
          stemPart(-half, -gap * 0.5);
          stemPart(gap * 0.5, half);
        } else stemPart(-half, half);
        var cap = Math.min(width * 0.88, Math.max(0.5, runHeight * 0.18));
        ctx.beginPath();
        ctx.moveTo(centerX + slant - half, startY);
        ctx.lineTo(centerX + slant, startY - cap);
        ctx.lineTo(centerX + slant + half, startY);
        ctx.lineTo(centerX + slant, startY + cap * 0.42);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(centerX - slant - half, endY);
        ctx.lineTo(centerX - slant, endY - cap * 0.42);
        ctx.lineTo(centerX - slant + half, endY);
        ctx.lineTo(centerX - slant, endY + cap);
        ctx.closePath();
        ctx.fill();
        if (spur > 0.2) {
          var direction = Math.cos(nibAngle) < 0 ? -1 : 1;
          ctx.lineCap = 'square';
          ctx.lineWidth = Math.max(0.5, width * 0.28);
          ctx.beginPath();
          ctx.moveTo(centerX + slant, startY + cap * 0.15);
          ctx.lineTo(centerX + slant + Math.cos(nibAngle) * spur * direction, startY + cap * 0.15 + Math.sin(nibAngle) * spur * direction);
          ctx.moveTo(centerX - slant, endY - cap * 0.15);
          ctx.lineTo(centerX - slant - Math.cos(nibAngle) * spur * direction, endY - cap * 0.15 - Math.sin(nibAngle) * spur * direction);
          ctx.stroke();
        }
      }

      function cloisterFacetTone(tone) {
        // Preserve the established ink ramp, but not its seven-step popping.
        var toneAmounts = [-0.84, -0.62, -0.4, -0.14, 0.08, 0.3, 0.54];
        var position = Math.max(0, Math.min(6, (tone + 0.82) / 1.54 * 6));
        var lower = Math.floor(position), upper = Math.min(6, lower + 1);
        return toneAmounts[lower] + (toneAmounts[upper] - toneAmounts[lower]) * (position - lower);
      }

      function prismFacetCellV61(x, y, cell, seed, phase) {
        var baseX = Math.floor(x / cell), baseY = Math.floor(y / cell);
        var nearest = Infinity, second = Infinity, ownerX = baseX, ownerY = baseY;
        for (var offsetY = -1; offsetY <= 1; offsetY++) for (var offsetX = -1; offsetX <= 1; offsetX++) {
          var cellX = baseX + offsetX, cellY = baseY + offsetY;
          var pointX = (cellX + 0.16 + hash(cellX, cellY, seed + 907) * 0.68) * cell;
          var pointY = (cellY + 0.16 + hash(cellX, cellY, seed + 911) * 0.68) * cell;
          var dx = x - pointX, dy = y - pointY;
          var distance = dx * dx + dy * dy;
          if (distance < nearest) {
            second = nearest;
            nearest = distance;
            ownerX = cellX;
            ownerY = cellY;
          } else if (distance < second) second = distance;
        }
        var ownerPhase = hash(ownerX, ownerY, seed + 919) * Math.PI * 2;
        var axis = hash(ownerX, ownerY, seed + 929) * Math.PI
          + Math.sin(phase + ownerPhase) * 0.085;
        var seamGap = Math.max(0, Math.sqrt(second) - Math.sqrt(nearest));
        var seam = Math.exp(-seamGap / Math.max(0.7, cell * 0.042));
        return {
          axis: axis,
          seam: seam,
          strain: hash(ownerX, ownerY, seed + 937) * 2 - 1,
          phase: ownerPhase
        };
      }

      function prismBoundaryEmittersV61(field, width, height, spacing, maxEmitters, seed, phase, lightAngle) {
        if (!field.bounds || maxEmitters <= 0) return [];
        var candidates = [];
        var step = Math.max(1, Math.floor(spacing * 0.22));
        var lightX = Math.cos(lightAngle), lightY = Math.sin(lightAngle);
        for (var y = field.bounds[1]; y <= field.bounds[3]; y += step) for (var x = field.bounds[0]; x <= field.bounds[2]; x += step) {
          var index = y * width + x;
          if (!field.inside[index] || field.distance[index] > 0.01) continue;
          var normal = surfaceFieldNormal(field, width, height, x, y);
          var facing = Math.max(0, normal.x * lightX + normal.y * lightY);
          var random = hash(x, y, seed + 947);
          var score = facing * 0.76 + random * 0.24;
          if (score < 0.12) continue;
          candidates.push({
            x: x,
            y: y,
            nx: normal.x,
            ny: normal.y,
            facing: facing,
            score: score,
            phase: hash(x, y, seed + 953) * Math.PI * 2
          });
        }
        candidates.sort(function (a, b) { return b.score - a.score; });
        var selected = [], spacingSq = spacing * spacing;
        for (var candidateIndex = 0; candidateIndex < candidates.length && selected.length < maxEmitters; candidateIndex++) {
          var candidate = candidates[candidateIndex], clear = true;
          for (var selectedIndex = 0; selectedIndex < selected.length; selectedIndex++) {
            var dx = candidate.x - selected[selectedIndex].x;
            var dy = candidate.y - selected[selectedIndex].y;
            if (dx * dx + dy * dy < spacingSq) { clear = false; break; }
          }
          if (clear) selected.push(candidate);
        }
        return selected;
      }

      function prismRgbaV61(rgb, alpha) {
        return 'rgba(' + Math.round(rgb[0]) + ',' + Math.round(rgb[1]) + ',' + Math.round(rgb[2]) + ','
          + Math.max(0, Math.min(1, alpha)) + ')';
      }

      function prismBeamPathV61(ctx, emitter, angle, length, beamWidth, bend, rgb, alpha) {
        if (length <= 0.5 || beamWidth <= 0.05 || alpha <= 0.001) return;
        var directionX = Math.cos(angle), directionY = Math.sin(angle);
        var normalX = -directionY, normalY = directionX;
        var samples = 12, left = [], right = [], center = [];
        for (var sample = 0; sample <= samples; sample++) {
          var t = sample / samples;
          var bow = Math.sin(t * Math.PI) * bend;
          var centerX = emitter.x + directionX * length * t + normalX * bow;
          var centerY = emitter.y + directionY * length * t + normalY * bow;
          var localWidth = beamWidth * (0.12 + Math.pow(Math.sin(t * Math.PI), 0.72) * 0.88)
            * Math.pow(Math.max(0, 1 - t * 0.86), 0.72);
          center.push({ x: centerX, y: centerY });
          left.push({ x: centerX + normalX * localWidth, y: centerY + normalY * localWidth });
          right.push({ x: centerX - normalX * localWidth, y: centerY - normalY * localWidth });
        }
        var end = center[center.length - 1];
        var gradient = ctx.createLinearGradient(emitter.x, emitter.y, end.x, end.y);
        gradient.addColorStop(0, prismRgbaV61(rgb, alpha * 0.18));
        gradient.addColorStop(0.16, prismRgbaV61(rgb, alpha));
        gradient.addColorStop(0.58, prismRgbaV61(rgb, alpha * 0.54));
        gradient.addColorStop(1, prismRgbaV61(rgb, 0));
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(left[0].x, left[0].y);
        for (var leftIndex = 1; leftIndex < left.length; leftIndex++) ctx.lineTo(left[leftIndex].x, left[leftIndex].y);
        for (var rightIndex = right.length - 1; rightIndex >= 0; rightIndex--) ctx.lineTo(right[rightIndex].x, right[rightIndex].y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = prismRgbaV61([255, 255, 255], alpha * 0.5);
        ctx.lineWidth = Math.max(0.35, beamWidth * 0.11);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(center[0].x, center[0].y);
        for (var centerIndex = 1; centerIndex < center.length; centerIndex++) ctx.lineTo(center[centerIndex].x, center[centerIndex].y);
        ctx.stroke();
      }

      function traceTexturaGrammarStem(ctx, grammar, centerX, startY, endY, width, nibAngle, split, spur, alpha, rhythm, index) {
        var runHeight = Math.max(1, endY - startY);
        var pulse = 1 + Math.sin(index * 1.618 + params.seed * 0.071) * Math.min(0.34, rhythm * 0.075);
        var rhythmicWidth = Math.max(0.45, width * pulse);
        traceTexturaStem(ctx, centerX, startY, endY, rhythmicWidth, nibAngle,
          Math.min(1, split * (grammar === 'fraktur' ? 1.18 : 1)), spur, alpha);
        var half = rhythmicWidth * 0.5;
        var slant = Math.sin(nibAngle) * Math.min(rhythmicWidth * 0.72, runHeight * 0.18);
        ctx.save();
        ctx.globalAlpha = alpha * Math.min(0.94, 0.34 + rhythm * 0.16);
        ctx.lineCap = grammar === 'bastarda' ? 'round' : 'square';
        ctx.lineJoin = 'miter';
        if (grammar === 'fraktur') {
          ctx.lineWidth = Math.max(0.5, rhythmicWidth * (0.16 + rhythm * 0.025));
          ctx.beginPath();
          ctx.moveTo(centerX - half - slant, startY + runHeight * 0.08);
          ctx.lineTo(centerX + half * 0.2, startY + runHeight * 0.24);
          ctx.lineTo(centerX - half * 0.65, startY + runHeight * 0.39);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(centerX - half * 0.15, endY - runHeight * 0.2);
          ctx.lineTo(centerX + half + slant, endY - runHeight * 0.04);
          ctx.lineTo(centerX + half * 0.25, endY + Math.min(spur, rhythmicWidth));
          ctx.stroke();
        } else if (grammar === 'bastarda') {
          ctx.lineWidth = Math.max(0.5, rhythmicWidth * (0.13 + rhythm * 0.022));
          var tail = Math.max(spur, rhythmicWidth * (0.8 + rhythm * 0.25));
          ctx.beginPath();
          ctx.moveTo(centerX - slant, endY - runHeight * 0.06);
          ctx.bezierCurveTo(centerX + tail * 0.22, endY + tail * 0.14,
            centerX + tail * 0.82, endY - tail * 0.38, centerX + tail, endY + tail * 0.12);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(centerX + slant, startY + runHeight * 0.08);
          ctx.quadraticCurveTo(centerX - tail * 0.42, startY - tail * 0.18, centerX - tail * 0.68, startY + tail * 0.08);
          ctx.stroke();
        } else if (grammar === 'lattice') {
          var diamond = Math.max(1, rhythmicWidth * (0.38 + rhythm * 0.055));
          var middleY = (startY + endY) * 0.5;
          ctx.beginPath();
          ctx.moveTo(centerX, middleY - diamond);
          ctx.lineTo(centerX + diamond, middleY);
          ctx.lineTo(centerX, middleY + diamond);
          ctx.lineTo(centerX - diamond, middleY);
          ctx.closePath();
          ctx.fill();
          ctx.lineWidth = Math.max(0.5, rhythmicWidth * 0.14);
          ctx.beginPath();
          ctx.moveTo(centerX - half, startY + runHeight * 0.28);
          ctx.lineTo(centerX + half, startY + runHeight * 0.72);
          ctx.moveTo(centerX + half, startY + runHeight * 0.28);
          ctx.lineTo(centerX - half, startY + runHeight * 0.72);
          ctx.stroke();
        } else {
          ctx.lineWidth = Math.max(0.45, rhythmicWidth * (0.08 + rhythm * 0.018));
          ctx.beginPath();
          ctx.moveTo(centerX + half * 0.72 + slant, startY + rhythmicWidth * 0.3);
          ctx.lineTo(centerX - half * 0.72 - slant, endY - rhythmicWidth * 0.3);
          ctx.stroke();
          if (rhythm > 1.2) {
            var cap = Math.min(rhythmicWidth, runHeight * 0.18);
            ctx.beginPath();
            ctx.moveTo(centerX - half, startY);
            ctx.lineTo(centerX, startY - cap * 1.35);
            ctx.lineTo(centerX + half, startY);
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      var TEXTURA_DUCTUS_NEIGHBORS_V60 = [
        [0, -1], [1, -1], [1, 0], [1, 1],
        [0, 1], [-1, 1], [-1, 0], [-1, -1]
      ];

      var texturaDuctusPreparedCacheV60 = { key: '', signature: '', value: null };

      function texturaDuctusClampV60(value, min, max) {
        return Math.max(min, Math.min(max, value));
      }

      function texturaDuctusBoundsV60(source, width, height) {
        var minX = width, minY = height, maxX = -1, maxY = -1;
        for (var index = 0; index < width * height; index++) {
          if (source[index * 4 + 3] <= 20) continue;
          var x = index % width, y = Math.floor(index / width);
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
        return maxX >= 0 ? [minX, minY, maxX, maxY] : null;
      }

      function texturaDuctusSignatureV60(glyphs, width, height, pixelScale, L, fm) {
        var hashA = 2166136261, hashB = 2246822507;
        function mix(value) {
          var integer = Math.round((Number(value) || 0) * 1000);
          hashA ^= integer;
          hashA = Math.imul(hashA, 16777619);
          hashB ^= integer + 2654435769 + (hashB << 6) + (hashB >>> 2);
          hashB = Math.imul(hashB, 3266489909);
        }
        function mixText(value) {
          var text = String(value == null ? '' : value);
          mix(text.length);
          for (var index = 0; index < text.length; index++) mix(text.charCodeAt(index));
        }
        mix(width); mix(height); mix(pixelScale); mix(L.s); mix(L.dx); mix(L.dy);
        mix(fm.ascent); mix(fm.descent); mix(params.fontSize); mix(params.vertical ? 1 : 0);
        mixText(params.fontWeight); mixText(params.fontFamily);
        for (var glyphIndex = 0; glyphIndex < glyphs.length; glyphIndex++) {
          var glyph = glyphs[glyphIndex];
          var strength = surfaceGlyphStrength(glyph, 'texturaMatrix');
          if (strength <= 0.002) continue;
          mixText(glyph.ch);
          if (glyph.fontAxes) mixText(JSON.stringify(glyph.fontAxes));
          mix(strength); mix(glyph.opacity == null ? 1 : glyph.opacity);
          mix(glyph.x); mix(glyph.y); mix(glyph.w); mix(glyph.h);
          mix(glyph.ox); mix(glyph.oy); mix(glyph.tx); mix(glyph.ty);
          mix(glyph.rot); mix(glyph.skewX); mix(glyph.skewY); mix(glyph.scaleX); mix(glyph.scaleY);
          mix(glyph.grid ? 1 : 0); mix(glyph.upright ? 1 : 0);
        }
        return [width, height, glyphs.length, hashA >>> 0, hashB >>> 0].join(':');
      }

      function texturaDuctusDownsampleV60(source, width, height, bounds) {
        if (!bounds) return null;
        var padding = 3;
        var sourceWidth = bounds[2] - bounds[0] + 1;
        var sourceHeight = bounds[3] - bounds[1] + 1;
        var scale = Math.min(1, 360 / Math.max(sourceWidth, sourceHeight));
        var analysisWidth = Math.max(5, Math.ceil(sourceWidth * scale) + padding * 2);
        var analysisHeight = Math.max(5, Math.ceil(sourceHeight * scale) + padding * 2);
        if (analysisWidth * analysisHeight > 589824) throw new Error('Textura Ductus analysis budget exceeded.');
        var alpha = new Uint8Array(analysisWidth * analysisHeight);
        var binary = new Uint8Array(alpha.length);
        var hashValue = 2166136261;
        for (var ay = padding; ay < analysisHeight - padding; ay++) {
          for (var ax = padding; ax < analysisWidth - padding; ax++) {
            var sx0 = texturaDuctusClampV60(Math.floor(bounds[0] + (ax - padding) / scale), 0, width - 1);
            var sx1 = texturaDuctusClampV60(Math.ceil(bounds[0] + (ax - padding + 1) / scale), sx0 + 1, width);
            var sy0 = texturaDuctusClampV60(Math.floor(bounds[1] + (ay - padding) / scale), 0, height - 1);
            var sy1 = texturaDuctusClampV60(Math.ceil(bounds[1] + (ay - padding + 1) / scale), sy0 + 1, height);
            var maximum = 0, total = 0, samples = 0;
            for (var sy = sy0; sy < sy1; sy++) for (var sx = sx0; sx < sx1; sx++) {
              var sample = source[(sy * width + sx) * 4 + 3];
              maximum = Math.max(maximum, sample);
              total += sample;
              samples++;
            }
            var value = Math.round(maximum * 0.72 + total / Math.max(1, samples) * 0.28);
            var index = ay * analysisWidth + ax;
            alpha[index] = value;
            binary[index] = value > 20 ? 1 : 0;
            hashValue ^= value;
            hashValue = Math.imul(hashValue, 16777619);
          }
        }
        return {
          alpha: alpha, binary: binary, width: analysisWidth, height: analysisHeight,
          scale: scale, padding: padding, bounds: bounds.slice(),
          key: [width, height, bounds.join(','), analysisWidth, analysisHeight, hashValue >>> 0].join(':')
        };
      }

      function texturaDuctusChamferV60(binary, width, height) {
        var distance = new Float32Array(binary.length);
        var diagonal = Math.SQRT2;
        var index;
        for (index = 0; index < distance.length; index++) distance[index] = binary[index] ? 1000000 : 0;
        for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
          index = y * width + x;
          if (!binary[index]) continue;
          var forward = distance[index];
          if (x > 0) forward = Math.min(forward, distance[index - 1] + 1);
          if (y > 0) forward = Math.min(forward, distance[index - width] + 1);
          if (x > 0 && y > 0) forward = Math.min(forward, distance[index - width - 1] + diagonal);
          if (x + 1 < width && y > 0) forward = Math.min(forward, distance[index - width + 1] + diagonal);
          distance[index] = forward;
        }
        for (y = height - 1; y >= 0; y--) for (x = width - 1; x >= 0; x--) {
          index = y * width + x;
          if (!binary[index]) continue;
          var reverse = distance[index];
          if (x + 1 < width) reverse = Math.min(reverse, distance[index + 1] + 1);
          if (y + 1 < height) reverse = Math.min(reverse, distance[index + width] + 1);
          if (x + 1 < width && y + 1 < height) reverse = Math.min(reverse, distance[index + width + 1] + diagonal);
          if (x > 0 && y + 1 < height) reverse = Math.min(reverse, distance[index + width - 1] + diagonal);
          distance[index] = reverse;
        }
        return distance;
      }

      function texturaDuctusThinV60(source, width, height) {
        var pixels = new Uint8Array(source.length);
        pixels.set(source);
        var removable = new Int32Array(pixels.length);
        function sample(x, y) { return pixels[y * width + x]; }
        var passes = 0;
        for (; passes < 96; passes++) {
          var removedThisPass = 0;
          for (var subpass = 0; subpass < 2; subpass++) {
            var count = 0;
            for (var y = 1; y < height - 1; y++) for (var x = 1; x < width - 1; x++) {
              var index = y * width + x;
              if (!pixels[index]) continue;
              var p2 = sample(x, y - 1), p3 = sample(x + 1, y - 1), p4 = sample(x + 1, y), p5 = sample(x + 1, y + 1);
              var p6 = sample(x, y + 1), p7 = sample(x - 1, y + 1), p8 = sample(x - 1, y), p9 = sample(x - 1, y - 1);
              var neighbors = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
              if (neighbors < 2 || neighbors > 6) continue;
              var transitions = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6)
                + (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2);
              if (transitions !== 1) continue;
              if (!subpass) {
                if (p2 && p4 && p6) continue;
                if (p4 && p6 && p8) continue;
              } else {
                if (p2 && p4 && p8) continue;
                if (p2 && p6 && p8) continue;
              }
              removable[count++] = index;
            }
            for (var i = 0; i < count; i++) pixels[removable[i]] = 0;
            removedThisPass += count;
          }
          if (!removedThisPass) break;
        }
        return { pixels: pixels, passes: passes };
      }

      function texturaDuctusNeighborsV60(index, skeleton, width, height) {
        var x = index % width, y = Math.floor(index / width), result = [];
        for (var i = 0; i < TEXTURA_DUCTUS_NEIGHBORS_V60.length; i++) {
          var dx = TEXTURA_DUCTUS_NEIGHBORS_V60[i][0], dy = TEXTURA_DUCTUS_NEIGHBORS_V60[i][1];
          var nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          // A diagonal only joins a genuine diagonal run. At an orthogonal corner
          // it would create a false third branch and shred one stroke into scraps.
          if (dx && dy && (skeleton[y * width + nx] || skeleton[ny * width + x])) continue;
          var next = ny * width + nx;
          if (skeleton[next]) result.push(next);
        }
        return result;
      }

      function texturaDuctusEdgeKeyV60(a, b) {
        return a < b ? a + ':' + b : b + ':' + a;
      }

      function texturaDuctusTraceV60(skeleton, distance, width, height) {
        var degrees = new Uint8Array(skeleton.length);
        var nodes = [];
        for (var i = 0; i < skeleton.length; i++) if (skeleton[i]) {
          degrees[i] = texturaDuctusNeighborsV60(i, skeleton, width, height).length;
          nodes.push(i);
        }
        var visited = new Set();
        var paths = [];
        function follow(start, first) {
          var indices = [start];
          var previous = start, current = first, guard = 0;
          visited.add(texturaDuctusEdgeKeyV60(previous, current));
          while (guard++ <= nodes.length + 1) {
            indices.push(current);
            if (degrees[current] !== 2) break;
            var adjacent = texturaDuctusNeighborsV60(current, skeleton, width, height);
            var next = -1;
            for (var optionIndex = 0; optionIndex < adjacent.length; optionIndex++) {
              var option = adjacent[optionIndex];
              if (option === previous) continue;
              if (next < 0) next = option;
              if (!visited.has(texturaDuctusEdgeKeyV60(current, option))) { next = option; break; }
            }
            if (next < 0 || visited.has(texturaDuctusEdgeKeyV60(current, next))) break;
            visited.add(texturaDuctusEdgeKeyV60(current, next));
            previous = current;
            current = next;
          }
          if (indices.length > 1) paths.push({
            indices: indices, startDegree: degrees[start], endDegree: degrees[indices[indices.length - 1]]
          });
        }
        for (i = 0; i < nodes.length; i++) if (degrees[nodes[i]] !== 2) {
          var nextNodes = texturaDuctusNeighborsV60(nodes[i], skeleton, width, height);
          for (var n = 0; n < nextNodes.length; n++) {
            if (!visited.has(texturaDuctusEdgeKeyV60(nodes[i], nextNodes[n]))) follow(nodes[i], nextNodes[n]);
          }
        }
        for (i = 0; i < nodes.length; i++) {
          nextNodes = texturaDuctusNeighborsV60(nodes[i], skeleton, width, height);
          for (n = 0; n < nextNodes.length; n++) {
            if (!visited.has(texturaDuctusEdgeKeyV60(nodes[i], nextNodes[n]))) follow(nodes[i], nextNodes[n]);
          }
        }
        return { paths: paths, degrees: degrees, nodes: nodes };
      }

      function texturaDuctusPointLineDistanceV60(point, a, b) {
        var dx = b.x - a.x, dy = b.y - a.y;
        var length2 = dx * dx + dy * dy;
        if (length2 < 0.000000001) return Math.hypot(point.x - a.x, point.y - a.y);
        var t = texturaDuctusClampV60(((point.x - a.x) * dx + (point.y - a.y) * dy) / length2, 0, 1);
        return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
      }

      function texturaDuctusSimplifyV60(points, tolerance) {
        if (points.length <= 2) return points.slice();
        var farthest = -1, greatest = tolerance;
        for (var i = 1; i < points.length - 1; i++) {
          var candidate = texturaDuctusPointLineDistanceV60(points[i], points[0], points[points.length - 1]);
          if (candidate > greatest) { greatest = candidate; farthest = i; }
        }
        if (farthest < 0) return [points[0], points[points.length - 1]];
        return texturaDuctusSimplifyV60(points.slice(0, farthest + 1), tolerance).slice(0, -1)
          .concat(texturaDuctusSimplifyV60(points.slice(farthest), tolerance));
      }

      function texturaDuctusMapPointV60(index, analysis, distance) {
        var ax = index % analysis.width, ay = Math.floor(index / analysis.width);
        return {
          x: analysis.bounds[0] + (ax - analysis.padding + 0.5) / analysis.scale,
          y: analysis.bounds[1] + (ay - analysis.padding + 0.5) / analysis.scale,
          radius: Math.max(0.5, distance[index] / analysis.scale),
          alpha: analysis.alpha[index] / 255
        };
      }

      function texturaDuctusPrepareV60(source, width, height, bounds, signature) {
        if (signature && texturaDuctusPreparedCacheV60.signature === signature && texturaDuctusPreparedCacheV60.value) {
          return texturaDuctusPreparedCacheV60.value;
        }
        var analysis = texturaDuctusDownsampleV60(source, width, height, bounds);
        if (!analysis) return { width: width, height: height, paths: [], junctions: [], isolates: [], stats: { empty: true } };
        if (!signature && texturaDuctusPreparedCacheV60.key === analysis.key && texturaDuctusPreparedCacheV60.value) {
          return texturaDuctusPreparedCacheV60.value;
        }
        var distance = texturaDuctusChamferV60(analysis.binary, analysis.width, analysis.height);
        var thinned = texturaDuctusThinV60(analysis.binary, analysis.width, analysis.height);
        var traced = texturaDuctusTraceV60(thinned.pixels, distance, analysis.width, analysis.height);
        var paths = [];
        for (var pathIndex = 0; pathIndex < traced.paths.length; pathIndex++) {
          var tracedPath = traced.paths[pathIndex];
          var raw = [];
          for (var pointIndex = 0; pointIndex < tracedPath.indices.length; pointIndex++) {
            raw.push(texturaDuctusMapPointV60(tracedPath.indices[pointIndex], analysis, distance));
          }
          var length = 0;
          for (pointIndex = 1; pointIndex < raw.length; pointIndex++) {
            length += Math.hypot(raw[pointIndex].x - raw[pointIndex - 1].x, raw[pointIndex].y - raw[pointIndex - 1].y);
          }
          if (length < Math.max(1.4, 0.7 / analysis.scale)) continue;
          paths.push({
            points: texturaDuctusSimplifyV60(raw, Math.max(0.28, 0.42 / analysis.scale)),
            startDegree: tracedPath.startDegree, endDegree: tracedPath.endDegree, length: length
          });
        }
        var junctions = [], isolates = [];
        for (var nodeIndex = 0; nodeIndex < traced.nodes.length; nodeIndex++) {
          var node = traced.nodes[nodeIndex], degree = traced.degrees[node];
          if (degree > 2) junctions.push(Object.assign(texturaDuctusMapPointV60(node, analysis, distance), { degree: degree }));
          else if (degree === 0) isolates.push(texturaDuctusMapPointV60(node, analysis, distance));
        }
        var prepared = {
          width: width, height: height, bounds: analysis.bounds.slice(), paths: paths, junctions: junctions, isolates: isolates,
          stats: {
            empty: false, analysisWidth: analysis.width, analysisHeight: analysis.height, analysisScale: analysis.scale,
            thinningPasses: thinned.passes, skeletonPixels: traced.nodes.length, pathCount: paths.length,
            junctionCount: junctions.length, isolateCount: isolates.length
          }
        };
        texturaDuctusPreparedCacheV60 = { key: analysis.key, signature: signature || '', value: prepared };
        return prepared;
      }

      function texturaDuctusExtendedPointsV60(path, spur) {
        var points = path.points.map(function (point) { return Object.assign({}, point); });
        if (points.length < 2 || spur <= 0) return points;
        function extend(point, neighbor, amount) {
          var dx = point.x - neighbor.x, dy = point.y - neighbor.y;
          var length = Math.hypot(dx, dy) || 1;
          point.x += dx / length * amount;
          point.y += dy / length * amount;
        }
        if (path.startDegree <= 1) extend(points[0], points[1], spur);
        if (path.endDegree <= 1) extend(points[points.length - 1], points[points.length - 2], spur);
        return points;
      }

      function texturaDuctusGeometryV60(prepared, settings) {
        var pitch = texturaDuctusClampV60(Number(settings.pitch || 22), 0.5, 720);
        var angle = texturaDuctusClampV60(Number(settings.angle || 0), -90, 90) * Math.PI / 180;
        var weight = texturaDuctusClampV60(Number(settings.weight || 1.5), 0.1, 4);
        var rhythm = texturaDuctusClampV60(Number(settings.rhythm || 0), 0, 4);
        var split = texturaDuctusClampV60(Number(settings.split || 0), 0, 1);
        var spur = texturaDuctusClampV60(Number(settings.spur || 0), 0, 512);
        var phase = ((Number(settings.phase || 0) % 1) + 1) % 1;
        var nibX = Math.cos(angle), nibY = Math.sin(angle);
        var polygons = [], centerlines = [], cuts = [], junctions = [], isolates = [];
        var maxWidth = 0;
        for (var pathIndex = 0; pathIndex < prepared.paths.length; pathIndex++) {
          var path = prepared.paths[pathIndex];
          var points = texturaDuctusExtendedPointsV60(path, spur * (0.12 + rhythm * 0.055));
          var progress = 0, widths = [];
          for (var pointIndex = 0; pointIndex < points.length; pointIndex++) {
            if (pointIndex) progress += Math.hypot(points[pointIndex].x - points[pointIndex - 1].x, points[pointIndex].y - points[pointIndex - 1].y);
            var pulse = 1 + Math.sin(pathIndex * 1.618 + progress / Math.max(2, pitch) * Math.PI * 1.25
              + phase * Math.PI * 2 + params.seed * 0.013) * Math.min(0.28, rhythm * 0.065);
            var local = points[pointIndex].radius * 2 * (0.54 + weight * 0.3);
            var cap = pitch * (0.45 + weight * 0.43);
            var strokeWidth = texturaDuctusClampV60(local * pulse, 0.7, cap);
            maxWidth = Math.max(maxWidth, strokeWidth);
            widths.push(strokeWidth);
          }
          for (pointIndex = 1; pointIndex < points.length; pointIndex++) {
            var a = points[pointIndex - 1], b = points[pointIndex], wa = widths[pointIndex - 1], wb = widths[pointIndex];
            polygons.push({
              points: [
                { x: a.x - nibX * wa * 0.5, y: a.y - nibY * wa * 0.5 },
                { x: a.x + nibX * wa * 0.5, y: a.y + nibY * wa * 0.5 },
                { x: b.x + nibX * wb * 0.5, y: b.y + nibY * wb * 0.5 },
                { x: b.x - nibX * wb * 0.5, y: b.y - nibY * wb * 0.5 }
              ],
              alpha: texturaDuctusClampV60((a.alpha + b.alpha) * 0.55, 0.2, 1)
            });
            centerlines.push({ a: a, b: b, width: Math.max(0.55, Math.min(wa, wb) * (0.045 + weight * 0.018)) });
            var segmentLength = Math.hypot(b.x - a.x, b.y - a.y);
            var projectedBody = Math.abs((b.x - a.x) * nibY - (b.y - a.y) * nibX) / Math.max(0.001, segmentLength)
              * (wa + wb) * 0.5;
            if (split > 0.02 && projectedBody > 2.4
              && ((pointIndex + pathIndex) % Math.max(2, Math.round(5 - split * 3))) !== 0) {
              cuts.push({ a: a, b: b, width: texturaDuctusClampV60(projectedBody * split * 0.12, 0.35, Math.max(0.4, projectedBody * 0.28)) });
            }
          }
        }
        for (var junctionIndex = 0; junctionIndex < prepared.junctions.length; junctionIndex++) {
          var junction = prepared.junctions[junctionIndex];
          junctions.push({
            x: junction.x, y: junction.y,
            radius: texturaDuctusClampV60(junction.radius * (0.62 + weight * 0.22), 0.8, pitch * 0.62),
            degree: junction.degree
          });
        }
        for (var isolateIndex = 0; isolateIndex < prepared.isolates.length; isolateIndex++) {
          var isolated = prepared.isolates[isolateIndex];
          isolates.push({
            x: isolated.x, y: isolated.y,
            radius: texturaDuctusClampV60(isolated.radius * (0.7 + weight * 0.24), 0.8, pitch * 0.48)
          });
        }
        return {
          polygons: polygons, centerlines: centerlines, cuts: cuts, junctions: junctions, isolates: isolates,
          maxWidth: maxWidth, settings: { pitch: pitch, angle: angle, weight: weight, rhythm: rhythm, split: split, spur: spur, phase: phase }
        };
      }

      function voidPortalGlyphPointV33(glyph, x, y, pixelScale, L) {
        var scaleX = isFinite(glyph.scaleX) ? glyph.scaleX : 1;
        var scaleY = isFinite(glyph.scaleY) ? glyph.scaleY : 1;
        var localX = (x - glyph.ox) * scaleX;
        var localY = (y - glyph.oy) * scaleY;
        var shearX = Math.tan((glyph.skewX || 0) * Math.PI / 180);
        var shearY = Math.tan((glyph.skewY || 0) * Math.PI / 180);
        var shearedX = localX + shearX * localY;
        var shearedY = shearY * localX + localY;
        var rotation = (glyph.rot || 0) * Math.PI / 180;
        var cos = Math.cos(rotation), sin = Math.sin(rotation);
        var logicalX = glyph.ox + glyph.tx + cos * shearedX - sin * shearedY;
        var logicalY = glyph.oy + glyph.ty + sin * shearedX + cos * shearedY;
        return {
          x: (L.dx + logicalX * L.s) * pixelScale,
          y: (L.dy + logicalY * L.s) * pixelScale
        };
      }

      function voidPortalGlyphBoundsV33(glyph, width, height, pixelScale, L) {
        var baseX = isFinite(glyph.bx) ? glyph.bx : glyph.x;
        var baseY = isFinite(glyph.by) ? glyph.by : glyph.y;
        var baseW = Math.max(1, isFinite(glyph.bw) ? glyph.bw : glyph.w);
        var baseH = Math.max(1, isFinite(glyph.bh) ? glyph.bh : glyph.h);
        var logicalPad = Math.max(2, params.fontSize * 0.18);
        var corners = [
          voidPortalGlyphPointV33(glyph, baseX - logicalPad, baseY - logicalPad, pixelScale, L),
          voidPortalGlyphPointV33(glyph, baseX + baseW + logicalPad, baseY - logicalPad, pixelScale, L),
          voidPortalGlyphPointV33(glyph, baseX + baseW + logicalPad, baseY + baseH + logicalPad, pixelScale, L),
          voidPortalGlyphPointV33(glyph, baseX - logicalPad, baseY + baseH + logicalPad, pixelScale, L)
        ];
        var minX = width, minY = height, maxX = 0, maxY = 0;
        for (var cornerIndex = 0; cornerIndex < corners.length; cornerIndex++) {
          minX = Math.min(minX, corners[cornerIndex].x);
          minY = Math.min(minY, corners[cornerIndex].y);
          maxX = Math.max(maxX, corners[cornerIndex].x);
          maxY = Math.max(maxY, corners[cornerIndex].y);
        }
        minX = Math.max(0, Math.floor(minX - 3));
        minY = Math.max(0, Math.floor(minY - 3));
        maxX = Math.min(width, Math.ceil(maxX + 3));
        maxY = Math.min(height, Math.ceil(maxY + 3));
        if (maxX - minX < 3 || maxY - minY < 3) return null;
        var scanScale = Math.min(1, 320 / Math.max(maxX - minX, maxY - minY));
        return {
          x: minX, y: minY, w: maxX - minX, h: maxY - minY,
          scale: scanScale,
          scanW: Math.max(3, Math.round((maxX - minX) * scanScale)),
          scanH: Math.max(3, Math.round((maxY - minY) * scanScale))
        };
      }

      function voidPortalGlyphScanV33(glyph, bounds, pixelScale, L, fm) {
        var scan = surfaceScratch('void-portal-v33-glyph-scan', bounds.scanW, bounds.scanH, true);
        var ctx = scan.ctx;
        var scale = pixelScale * bounds.scale;
        ctx.save();
        ctx.setTransform(scale, 0, 0, scale, -bounds.x * bounds.scale, -bounds.y * bounds.scale);
        ctx.translate(L.dx, L.dy);
        ctx.scale(L.s, L.s);
        ctx.translate(glyph.ox + glyph.tx, glyph.oy + glyph.ty);
        ctx.rotate((glyph.rot || 0) * Math.PI / 180);
        ctx.transform(1, Math.tan((glyph.skewY || 0) * Math.PI / 180),
          Math.tan((glyph.skewX || 0) * Math.PI / 180), 1, 0, 0);
        ctx.scale(glyph.scaleX, glyph.scaleY);
        ctx.translate(-glyph.ox, -glyph.oy);
        ctx.font = glyph.fontAxes ? glyphFontSpec(glyph, params.fontSize).font : params.fontWeight + ' ' + params.fontSize + 'px ' + params.fontFamily;
        ctx.fillStyle = '#fff';
        if (params.vertical) {
          var centerX = glyph.x + glyph.w / 2;
          var centerY = glyph.y + glyph.h / 2;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          if (!glyph.upright) {
            ctx.translate(centerX, centerY);
            ctx.rotate(Math.PI / 2);
            ctx.fillText(glyph.ch, 0, 0);
          } else ctx.fillText(glyph.ch, centerX, centerY);
        } else {
          ctx.textAlign = glyph.grid ? 'center' : 'left';
          ctx.textBaseline = 'alphabetic';
          ctx.fillText(glyph.ch, glyph.grid ? glyph.x + glyph.w / 2 : glyph.x,
            glyph.y + baselineOffset(glyph, fm));
        }
        ctx.restore();
        var image;
        try { image = ctx.getImageData(0, 0, bounds.scanW, bounds.scanH); }
        catch (error) { return null; }
        return { canvas: scan.canvas, image: image, bounds: bounds };
      }

      function voidPortalLabelComponentsV33(bits, width, height, minimumSize, maximumCount) {
        var count = width * height;
        var labels = new Uint16Array(count);
        var queue = new Int32Array(count);
        var components = [];
        var nextLabel = 1;
        for (var start = 0; start < count && nextLabel < 65535; start++) {
          if (!bits[start] || labels[start]) continue;
          var head = 0, tail = 0;
          queue[tail++] = start;
          labels[start] = nextLabel;
          var size = 0, sumX = 0, sumY = 0;
          var minX = width, minY = height, maxX = -1, maxY = -1;
          while (head < tail) {
            var cell = queue[head++];
            var x = cell % width, y = Math.floor(cell / width);
            size++; sumX += x; sumY += y;
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            var left = x > 0 ? cell - 1 : -1;
            var right = x + 1 < width ? cell + 1 : -1;
            var top = y > 0 ? cell - width : -1;
            var bottom = y + 1 < height ? cell + width : -1;
            if (left >= 0 && bits[left] && !labels[left]) { labels[left] = nextLabel; queue[tail++] = left; }
            if (right >= 0 && bits[right] && !labels[right]) { labels[right] = nextLabel; queue[tail++] = right; }
            if (top >= 0 && bits[top] && !labels[top]) { labels[top] = nextLabel; queue[tail++] = top; }
            if (bottom >= 0 && bits[bottom] && !labels[bottom]) { labels[bottom] = nextLabel; queue[tail++] = bottom; }
          }
          if (size >= minimumSize) components.push({
            label: nextLabel, size: size, x: sumX / size, y: sumY / size,
            minX: minX, minY: minY, maxX: maxX, maxY: maxY
          });
          nextLabel++;
        }
        components.sort(function (a, b) { return b.size - a.size; });
        if (components.length > maximumCount) components.length = maximumCount;
        return { labels: labels, components: components };
      }

      function voidPortalAperturesV33(scan, aperture) {
        var width = scan.bounds.scanW, height = scan.bounds.scanH;
        var field = surfaceBoundaryDistance(scan.image.data, width, height);
        if (!field.bounds) return [];
        var topology = surfaceVoidTopology(field, width, height);
        var minimumSize = Math.max(3, Math.round(Math.pow(params.fontSize * scan.bounds.scale * 0.026, 2)));
        var counterLabels = voidPortalLabelComponentsV33(topology.counter, width, height, minimumSize, 8);
        if (counterLabels.components.length) {
          for (var counterIndex = 0; counterIndex < counterLabels.components.length; counterIndex++) {
            counterLabels.components[counterIndex].kind = 'counter';
            counterLabels.components[counterIndex].labels = counterLabels.labels;
          }
          return counterLabels.components;
        }
        if (aperture <= 0.002) return [];
        var maximumDistance = 0;
        for (var fieldIndex = 0; fieldIndex < field.inside.length; fieldIndex++) {
          if (field.inside[fieldIndex]) maximumDistance = Math.max(maximumDistance, field.distance[fieldIndex]);
        }
        if (maximumDistance < 0.75) return [];
        var chamberThreshold = Math.max(0.7, maximumDistance * (0.74 - aperture * 0.44));
        scan.chamberField=field;scan.chamberThreshold=chamberThreshold;
        var chambers = new Uint8Array(width * height);
        for (var chamberIndex = 0; chamberIndex < chambers.length; chamberIndex++) {
          if (field.inside[chamberIndex] && field.distance[chamberIndex] >= chamberThreshold) chambers[chamberIndex] = 1;
        }
        var chamberCount = Math.max(1, Math.min(5, 1 + Math.floor(aperture * 4)));
        var chamberLabels = voidPortalLabelComponentsV33(chambers, width, height, minimumSize, chamberCount);
        for (var componentIndex = 0; componentIndex < chamberLabels.components.length; componentIndex++) {
          chamberLabels.components[componentIndex].kind = 'chamber';
          chamberLabels.components[componentIndex].labels = chamberLabels.labels;
        }
        return chamberLabels.components;
      }

      function voidPortalComponentV33(scan, component) {
        var margin = 4;
        var minX = Math.max(0, component.minX - margin);
        var minY = Math.max(0, component.minY - margin);
        var maxX = Math.min(scan.bounds.scanW - 1, component.maxX + margin);
        var maxY = Math.min(scan.bounds.scanH - 1, component.maxY + margin);
        var localWidth = maxX - minX + 1, localHeight = maxY - minY + 1;
        var mask = surfaceScratch('void-portal-v33-component-mask', localWidth, localHeight, false);
        var image = mask.ctx.createImageData(localWidth, localHeight);
        var bins = 12;
        var boundaryBins = new Array(bins), boundaryDistances = new Float32Array(bins);
        for (var y = component.minY; y <= component.maxY; y++) for (var x = component.minX; x <= component.maxX; x++) {
          var sourceIndex = y * scan.bounds.scanW + x;
          if (component.labels[sourceIndex] !== component.label) continue;
          var pixelIndex = ((y - minY) * localWidth + (x - minX)) * 4;
          image.data[pixelIndex] = image.data[pixelIndex + 1] = image.data[pixelIndex + 2] = 255;
          image.data[pixelIndex + 3] = 255;
          var boundary = x === 0 || y === 0 || x + 1 === scan.bounds.scanW || y + 1 === scan.bounds.scanH
            || component.labels[sourceIndex - 1] !== component.label
            || component.labels[sourceIndex + 1] !== component.label
            || component.labels[sourceIndex - scan.bounds.scanW] !== component.label
            || component.labels[sourceIndex + scan.bounds.scanW] !== component.label;
          if (!boundary) continue;
          var dx = x - component.x, dy = y - component.y;
          var angle = Math.atan2(dy, dx);
          var bin = Math.max(0, Math.min(bins - 1, Math.floor((angle + Math.PI) / (Math.PI * 2) * bins)));
          var distance = dx * dx + dy * dy;
          if (!boundaryBins[bin] || distance > boundaryDistances[bin]) {
            boundaryDistances[bin] = distance;
            boundaryBins[bin] = { x: x, y: y };
          }
        }
        if(globalThis.TypeDeformerRenderContext){var RC=TypeDeformerRenderContext,localField=surfaceBoundaryDistance(image.data,localWidth,localHeight);RC.field(image,function(px,py,rgba,footprint){
          var x=px-.5,y=py-.5,sx=x+minX,sy=y+minY;
          var neighborhood=Math.max(0,Math.min(1,RC.signed(localField,localWidth,localHeight,x,y)+1.5));
          var alpha=component.kind==='counter'?1-RC.rasterSample(scan.image.data,scan.bounds.scanW,scan.bounds.scanH,sx,sy,3)/255
            :Math.max(0,Math.min(1,.5+(RC.signed(scan.chamberField,scan.bounds.scanW,scan.bounds.scanH,sx,sy)-scan.chamberThreshold)/footprint));
          rgba[0]=rgba[1]=rgba[2]=255;rgba[3]=alpha*neighborhood*255;
        });}
        mask.ctx.putImageData(image, 0, 0);
        var reciprocal = 1 / scan.bounds.scale;
        var anchors = [];
        for (var binIndex = 0; binIndex < boundaryBins.length; binIndex++) if (boundaryBins[binIndex]) anchors.push({
          x: scan.bounds.x + boundaryBins[binIndex].x * reciprocal,
          y: scan.bounds.y + boundaryBins[binIndex].y * reciprocal
        });
        return {
          mask: mask.canvas,
          baseX: scan.bounds.x + minX * reciprocal,
          baseY: scan.bounds.y + minY * reciprocal,
          width: localWidth * reciprocal,
          height: localHeight * reciprocal,
          centerX: scan.bounds.x + component.x * reciprocal,
          centerY: scan.bounds.y + component.y * reciprocal,
          scanScale: scan.bounds.scale,
          kind: component.kind,
          anchors: anchors
        };
      }

      function voidPortalSectionStateV33(architecture, t, depth, angle, taper, aperture,
        phase, glyphIndex, componentIndex) {
        var seed = params.seed + glyphIndex * 97 + componentIndex * 31;
        var side = hash(glyphIndex, componentIndex, seed + 4019) > 0.5 ? 1 : -1;
        var mouthScale = 0.7 + aperture * 0.52;
        var perspective = Math.max(0.12, Math.min(6, Math.exp(-taper * t * 0.62)));
        var breath = 1 + Math.sin(phase + glyphIndex * 0.37 + componentIndex * 0.83) * 0.026 * Math.sin(t * Math.PI);
        var direction = angle;
        var eased = t * (0.58 + t * 0.42);
        var travel = depth * eased;
        var normalTravel = 0;
        var rotation = 0;
        var scaleX = mouthScale * perspective * breath;
        var scaleY = mouthScale * perspective / breath;
        if (architecture === 'carceri') {
          direction += (hash(componentIndex, glyphIndex, seed + 4021) * 2 - 1) * (0.18 + aperture * 0.22);
          travel = depth * t * (0.78 + hash(glyphIndex, componentIndex, seed + 4027) * 0.24);
          normalTravel = Math.sin(t * Math.PI) * depth
            * (0.055 + hash(componentIndex, glyphIndex, seed + 4049) * 0.075) * side;
          rotation = (hash(glyphIndex, componentIndex, seed + 4051) * 2 - 1) * t * 0.36
            + Math.sin(phase + t * Math.PI * 2 + componentIndex) * 0.035 * Math.sin(t * Math.PI);
          scaleX *= 0.92 + Math.sin(t * Math.PI * 2 + componentIndex) * 0.11;
          scaleY *= 1.04 + Math.cos(t * Math.PI * 2 + glyphIndex) * 0.09;
        } else if (architecture === 'horizon') {
          direction += (hash(componentIndex, glyphIndex, seed + 4057) * 2 - 1) * 0.08;
          travel = depth * (t * 0.18 + t * t * 0.82);
          normalTravel = Math.sin(t * Math.PI) * depth * (0.08 + aperture * 0.1) * side;
          rotation = side * t * (0.38 + Math.abs(taper) * 0.18)
            + Math.sin(phase + glyphIndex * 0.43) * 0.045 * Math.sin(t * Math.PI);
          scaleX *= Math.max(0.18, 1 - t * (0.2 + aperture * 0.14));
          scaleY *= 1 + t * 0.1;
        } else {
          normalTravel = Math.sin(t * Math.PI) * Math.min(24, depth * 0.025) * side;
        }
        return {
          x: Math.cos(direction) * travel - Math.sin(direction) * normalTravel,
          y: Math.sin(direction) * travel + Math.cos(direction) * normalTravel,
          rotation: rotation,
          scaleX: scaleX,
          scaleY: scaleY
        };
      }

      function voidPortalTransformPointV33(point, centerX, centerY, state) {
        var dx = (point.x - centerX) * state.scaleX;
        var dy = (point.y - centerY) * state.scaleY;
        var cos = Math.cos(state.rotation), sin = Math.sin(state.rotation);
        return {
          x: centerX + state.x + cos * dx - sin * dy,
          y: centerY + state.y + sin * dx + cos * dy
        };
      }

      function drawVoidPortalMaskV33(ctx, mask, component, state, alpha) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx.translate(component.centerX + state.x, component.centerY + state.y);
        ctx.rotate(state.rotation);
        ctx.scale(state.scaleX, state.scaleY);
        ctx.translate(-component.centerX, -component.centerY);
        ctx.drawImage(mask, component.baseX, component.baseY, component.width, component.height);
        ctx.restore();
      }

      function drawRecursiveMask(ctx, mask, width, height, centerX, centerY, scale, angle, offsetX, offsetY, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(centerX + offsetX, centerY + offsetY);
        ctx.rotate(angle);
        ctx.scale(scale, scale);
        ctx.translate(-centerX, -centerY);
        ctx.drawImage(mask, 0, 0, width, height);
        ctx.restore();
      }

      function drawRecursiveNodeMaskV32(ctx, mask, centerX, centerY, node, alpha, scaleX, scaleY) {
        if (!node || alpha <= 0.002 || node.scale <= 0.002) return;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx.translate(node.x, node.y);
        ctx.rotate(node.angle || 0);
        ctx.scale(node.scale * (scaleX == null ? 1 : scaleX),
          node.scale * (scaleY == null ? 1 : scaleY));
        ctx.translate(-centerX, -centerY);
        ctx.drawImage(mask, 0, 0);
        ctx.restore();
      }

      function recursiveShrineGraphV32(structure, generations, inheritance, turn, reach,
        phase, centerX, centerY, radius, budget, glyphIndex) {
        var shrink = 0.32 + (Math.max(0.25, Math.min(1.5, inheritance)) - 0.25) / 1.25 * 0.52;
        var nodes = [{
          x: centerX, y: centerY, scale: 1.06, angle: Math.sin(phase + glyphIndex * 0.17) * 0.025,
          direction: -Math.PI * 0.5, level: 0, parent: -1, branch: 0, stretchX: 1, stretchY: 1
        }];
        var depth = Math.max(1, Math.min(24, generations));
        budget = Math.max(1, Math.min(96, budget || depth));
        if (depth <= 1 || budget <= 1) return nodes;

        if (structure === 'tracery' || structure === 'cantor') {
          var frontier = [0];
          var maximumDepth = Math.min(depth - 1, structure === 'tracery' ? 8 : 9);
          for (var level = 0; level < maximumDepth && frontier.length && nodes.length < budget; level++) {
            var next = [];
            for (var parentCursor = 0; parentCursor < frontier.length && nodes.length < budget; parentCursor++) {
              var parentIndex = frontier[parentCursor];
              var parent = nodes[parentIndex];
              for (var sideIndex = 0; sideIndex < 2 && nodes.length < budget; sideIndex++) {
                var side = sideIndex ? 1 : -1;
                var childScale = parent.scale * shrink * (structure === 'cantor' ? 0.82 : 0.9);
                if (childScale < 0.028) continue;
                var direction, distance, angle, stretchX = 1, stretchY = 1;
                if (structure === 'tracery') {
                  var spread = 0.34 + Math.min(1.3, Math.abs(turn) / Math.PI) * 0.46;
                  direction = parent.direction + side * spread * (0.84 + level * 0.045)
                    + Math.sin(phase + glyphIndex * 0.31 + level * 0.77 + side) * 0.07;
                  distance = (radius * 0.9 + reach * 0.15) * Math.max(0.2, parent.scale)
                    * (0.78 + level * 0.045);
                  angle = parent.angle + side * turn * 0.22
                    + Math.sin(phase + level + side) * 0.045;
                  stretchX = 0.82 + (level % 2) * 0.16;
                  stretchY = 1.08 + Math.min(0.22, Math.abs(turn) * 0.08);
                } else {
                  var axis = turn * 0.18 + (level % 2 ? Math.PI * 0.5 : 0)
                    + Math.sin(phase + glyphIndex * 0.23) * 0.08;
                  direction = axis + (side > 0 ? 0 : Math.PI);
                  distance = (radius * 0.78 + reach * 0.13) * Math.max(0.22, parent.scale)
                    * (0.9 + level * 0.055);
                  angle = parent.angle + (level % 2 ? -turn : turn) * 0.14;
                  stretchX = level % 2 ? 0.78 : 1.18;
                  stretchY = level % 2 ? 1.16 : 0.8;
                }
                var child = {
                  x: parent.x + Math.cos(direction) * distance,
                  y: parent.y + Math.sin(direction) * distance,
                  scale: childScale,
                  angle: angle,
                  direction: direction,
                  level: level + 1,
                  parent: parentIndex,
                  branch: side,
                  stretchX: stretchX,
                  stretchY: stretchY
                };
                nodes.push(child);
                next.push(nodes.length - 1);
              }
            }
            frontier = next;
          }
          return nodes;
        }

        var maximumChain = Math.min(depth, budget);
        for (var generation = 1; generation < maximumChain; generation++) {
          var inheritedScale = Math.max(0.024, Math.pow(shrink, generation) * 1.06);
          var progress = 1 - Math.pow(shrink, generation);
          var nodeAngle, nodeX, nodeY, nodeStretchX = 1, nodeStretchY = 1;
          if (structure === 'mandorla') {
            nodeX = centerX + Math.sin(phase + generation * 1.17 + glyphIndex * 0.29)
              * reach * progress * 0.08;
            nodeY = centerY - Math.cos(turn * 0.7 + generation * 0.66)
              * reach * progress * 0.12;
            nodeAngle = (generation % 2 ? -1 : 1) * turn * (0.12 + generation * 0.012)
              + Math.sin(phase + generation) * 0.035;
            nodeStretchX = 0.78 + (generation % 2) * 0.22;
            nodeStretchY = 1.12 + (generation % 3) * 0.08;
          } else {
            nodeX = centerX + Math.sin(turn * generation * 0.62 + phase + glyphIndex * 0.19)
              * reach * progress * 0.2;
            nodeY = centerY - reach * progress * 0.28
              + Math.cos(turn * generation * 0.37 + phase) * radius * progress * 0.11;
            nodeAngle = turn * generation * 0.24 + Math.sin(phase + generation * 0.9) * 0.04;
            nodeStretchX = 0.92 + (generation % 2) * 0.12;
            nodeStretchY = 1.06 - (generation % 2) * 0.08;
          }
          nodes.push({
            x: nodeX, y: nodeY, scale: inheritedScale, angle: nodeAngle,
            direction: -Math.PI * 0.5, level: generation, parent: generation - 1,
            branch: generation % 2 ? -1 : 1, stretchX: nodeStretchX, stretchY: nodeStretchY
          });
        }
        return nodes;
      }

      function recursiveShrineFrameV32(ctx, node, structure, radius, lineWidth, alpha) {
        var localRadius = Math.max(lineWidth * 2.8, radius * Math.max(0.08, node.scale));
        var rw = localRadius * (0.68 + Math.abs(node.stretchX || 1) * 0.32);
        var rh = localRadius * (0.82 + Math.abs(node.stretchY || 1) * 0.48);
        ctx.save();
        ctx.translate(node.x, node.y);
        ctx.rotate(node.angle || 0);
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx.beginPath();
        if (structure === 'mandorla') {
          ctx.moveTo(0, -rh);
          ctx.bezierCurveTo(rw, -rh * 0.52, rw, rh * 0.52, 0, rh);
          ctx.bezierCurveTo(-rw, rh * 0.52, -rw, -rh * 0.52, 0, -rh);
          ctx.closePath();
        } else if (structure === 'cantor') {
          ctx.moveTo(-rw, rh * 0.58);
          ctx.lineTo(-rw, -rh * 0.12);
          ctx.lineTo(0, -rh);
          ctx.lineTo(rw, -rh * 0.12);
          ctx.lineTo(rw, rh * 0.58);
          ctx.closePath();
        } else if (structure === 'tracery') {
          ctx.moveTo(-rw, rh * 0.55);
          ctx.quadraticCurveTo(-rw * 0.9, -rh * 0.42, 0, -rh);
          ctx.quadraticCurveTo(rw * 0.9, -rh * 0.42, rw, rh * 0.55);
          ctx.quadraticCurveTo(0, rh * 0.22, -rw, rh * 0.55);
        } else {
          ctx.moveTo(-rw, rh * 0.62);
          ctx.lineTo(-rw, -rh * 0.06);
          ctx.quadraticCurveTo(-rw * 0.82, -rh * 0.58, 0, -rh);
          ctx.quadraticCurveTo(rw * 0.82, -rh * 0.58, rw, -rh * 0.06);
          ctx.lineTo(rw, rh * 0.62);
          ctx.lineTo(-rw, rh * 0.62);
        }
        ctx.stroke();
        ctx.restore();
      }

      function drawRecursiveShrineRailsV32(ctx, nodes, structure, radius, lineWidth, strength) {
        ctx.save();
        ctx.strokeStyle = '#fff';
        ctx.fillStyle = '#fff';
        ctx.lineWidth = lineWidth;
        ctx.lineCap = structure === 'cantor' ? 'square' : 'round';
        ctx.lineJoin = structure === 'cantor' ? 'miter' : 'round';
        for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
          var node = nodes[nodeIndex];
          var fade = Math.max(0.18, 1 - node.level / Math.max(2, nodes.length) * 0.72);
          recursiveShrineFrameV32(ctx, node, structure, radius, lineWidth,
            strength * fade * (node.level ? 0.62 : 0.82));
          if (node.parent < 0 || !nodes[node.parent]) continue;
          var parent = nodes[node.parent];
          var dx = node.x - parent.x, dy = node.y - parent.y;
          var length = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
          var nx = -dy / length, ny = dx / length;
          ctx.globalAlpha = strength * fade * 0.9;
          ctx.beginPath();
          ctx.moveTo(parent.x, parent.y);
          if (structure === 'cantor') {
            var middleX = parent.x + dx * 0.5;
            var middleY = parent.y + dy * 0.5;
            ctx.lineTo(middleX, parent.y);
            ctx.lineTo(middleX, node.y);
            ctx.lineTo(node.x, node.y);
          } else {
            var bend = (node.branch || 1) * Math.min(radius * 0.46, length * 0.24);
            ctx.bezierCurveTo(parent.x + dx * 0.32 + nx * bend,
              parent.y + dy * 0.32 + ny * bend,
              parent.x + dx * 0.72 - nx * bend * 0.58,
              parent.y + dy * 0.72 - ny * bend * 0.58, node.x, node.y);
          }
          ctx.stroke();
          var joint = Math.max(lineWidth * 1.35, Math.min(radius * 0.12, length * 0.09));
          ctx.save();
          ctx.translate(node.x, node.y);
          ctx.rotate(Math.PI * 0.25 + node.angle);
          if (structure === 'mandorla') {
            ctx.beginPath();
            ctx.ellipse(0, 0, joint * 0.68, joint * 1.26, 0, 0, Math.PI * 2);
            ctx.fill();
          } else ctx.fillRect(-joint * 0.55, -joint * 0.55, joint * 1.1, joint * 1.1);
          ctx.restore();
        }
        ctx.restore();
      }

      function paintFeatureMorphTile(tile, first, second, morphT, melt, wave, strength, rendering) {
        var size = first.size;
        var output = tile.ctx.createImageData(size, size);
        var easedT = morphT * morphT * (3 - 2 * morphT);
        var expansion = melt * wave * 0.055;
        for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
          var nx = ((x + 0.5) / size - 0.5) * 2.12;
          var ny = ((y + 0.5) / size - 0.5) * 2.12;
          var sourceDistance = surfaceMorphFieldSample(first, nx, ny);
          var targetDistance = surfaceMorphFieldSample(second, nx, ny);
          var signed = sourceDistance * (1 - easedT) + targetDistance * easedT + expansion;
          var alpha;
          if (rendering === 'contour') {
            var contour = Math.max(0, 1 - Math.abs(signed) / 0.044);
            alpha = contour * contour * (3 - 2 * contour);
          } else if (rendering === 'doubleContour') {
            var bandDistance = Math.min(Math.abs(signed - 0.055), Math.abs(signed + 0.035));
            var band = Math.max(0, 1 - bandDistance / 0.038);
            alpha = band * band * (3 - 2 * band);
          } else {
            alpha = Math.max(0, Math.min(1, 0.5 + signed / 0.075));
          }
          if (alpha <= 0.002) continue;
          var offset = (y * size + x) * 4;
          output.data[offset] = output.data[offset + 1] = output.data[offset + 2] = 255;
          output.data[offset + 3] = Math.round(255 * alpha * strength);
        }

        // Output pixels sample the fixed geometry and original glyph raster.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext;RC.field(output,function(px,py,rgba){var x=px-.5,y=py-.5;if(y<(0)||!(y < size))return;if(x<(0)||!(x < size))return;
          var nx = ((x + 0.5) / size - 0.5) * 2.12;
          var ny = ((y + 0.5) / size - 0.5) * 2.12;
          var sourceDistance = surfaceMorphFieldSample(first, nx, ny);
          var targetDistance = surfaceMorphFieldSample(second, nx, ny);
          var signed = sourceDistance * (1 - easedT) + targetDistance * easedT + expansion;
          var alpha;
          if (rendering === 'contour') {
            var contour = Math.max(0, 1 - Math.abs(signed) / 0.044);
            alpha = contour * contour * (3 - 2 * contour);
          } else if (rendering === 'doubleContour') {
            var bandDistance = Math.min(Math.abs(signed - 0.055), Math.abs(signed + 0.035));
            var band = Math.max(0, 1 - bandDistance / 0.038);
            alpha = band * band * (3 - 2 * band);
          } else {
            alpha = Math.max(0, Math.min(1, 0.5 + signed / 0.075));
          }
          if (alpha <= 0.002) return;
          var offset = (y * size + x) * 4;
          rgba[0] = rgba[1] = rgba[2] = 255;
          rgba[3] = Math.round(255 * alpha * strength);

        });}
        tile.ctx.putImageData(output, 0, 0);
      }

      function morphPathGeometry(a, b, bend, offset) {
        var dx = b.x - a.x, dy = b.y - a.y;
        var distance = Math.max(1, Math.hypot(dx, dy));
        var nx = -dy / distance, ny = dx / distance;
        return {
          ax: a.x + nx * offset,
          ay: a.y + ny * offset,
          bx: b.x + nx * offset,
          by: b.y + ny * offset,
          c1x: a.x + dx * 0.34 + nx * (offset + bend),
          c1y: a.y + dy * 0.34 + ny * (offset + bend),
          c2x: a.x + dx * 0.68 + nx * (offset - bend * 0.32),
          c2y: a.y + dy * 0.68 + ny * (offset - bend * 0.32),
          nx: nx,
          ny: ny,
          distance: distance
        };
      }

      function strokeMorphCorrespondence(ctx, geometry) {
        ctx.beginPath();
        ctx.moveTo(geometry.ax, geometry.ay);
        ctx.bezierCurveTo(geometry.c1x, geometry.c1y, geometry.c2x, geometry.c2y, geometry.bx, geometry.by);
        ctx.stroke();
      }

      function morphPathPoint(geometry, t) {
        var mt = 1 - t;
        return {
          x: mt * mt * mt * geometry.ax + 3 * mt * mt * t * geometry.c1x
            + 3 * mt * t * t * geometry.c2x + t * t * t * geometry.bx,
          y: mt * mt * mt * geometry.ay + 3 * mt * mt * t * geometry.c1y
            + 3 * mt * t * t * geometry.c2y + t * t * t * geometry.by
        };
      }

      function contourReliefFieldV57(field, width, height) {
        var count = width * height;
        // Avoid allocating two additional full-resolution fields on extreme
        // exports. The renderer remains available with the shared chamfer
        // distance and still obeys the same bounded hachure budget.
        if (count > 8388608) return { values: null, smoothed: false };
        var values = new Float32Array(count);
        var horizontal = new Float32Array(count);
        var x, y, index;
        for (index = 0; index < count; index++) values[index] = surfaceSignedDistanceValue(field, index);
        for (y = 0; y < height; y++) for (x = 0; x < width; x++) {
          index = y * width + x;
          var left = values[y * width + Math.max(0, x - 1)];
          var right = values[y * width + Math.min(width - 1, x + 1)];
          horizontal[index] = (left + values[index] * 2 + right) * 0.25;
        }
        for (y = 0; y < height; y++) for (x = 0; x < width; x++) {
          index = y * width + x;
          var top = horizontal[Math.max(0, y - 1) * width + x];
          var bottom = horizontal[Math.min(height - 1, y + 1) * width + x];
          var smoothed = (top + horizontal[index] * 2 + bottom) * 0.25;
          // Smoothing may never swap ink and paper. Preserve the source-side
          // topology at subpixel bridges and small counters.
          if (field.inside[index] ? smoothed <= 0 : smoothed >= 0) {
            smoothed = values[index] * 0.5;
          }
          values[index] = smoothed;
        }
        return { values: values, smoothed: true };
      }

      function contourReliefSignedV57(surface, field, index) {
        return surface.values ? surface.values[index] : surfaceSignedDistanceValue(field, index);
      }

      function contourReliefNormalV57(surface, field, width, height, x, y) {
        var left = Math.max(0, x - 2), right = Math.min(width - 1, x + 2);
        var top = Math.max(0, y - 2), bottom = Math.min(height - 1, y + 2);
        var gx = contourReliefSignedV57(surface, field, y * width + right)
          - contourReliefSignedV57(surface, field, y * width + left);
        var gy = contourReliefSignedV57(surface, field, bottom * width + x)
          - contourReliefSignedV57(surface, field, top * width + x);
        var length = Math.hypot(gx, gy);
        if (length < 0.0001) return surfaceFieldNormal(field, width, height, x, y);
        return { x: -gx / length, y: -gy / length };
      }

      function contourReliefWarpV57(x, y, magnitude, spacing, drift, relief, phase, seed) {
        if (drift <= 0.0001) return 0;
        var anchor = Math.min(1, magnitude / Math.max(1, spacing * 1.25));
        var phaseAngle = phase * Math.PI * 2;
        var seedPhase = seed * 0.137;
        var octave = Math.sin(x * 0.018 + y * 0.011 + seedPhase + phaseAngle) * 0.5
          + Math.sin(x * 0.006 - y * 0.021 - seedPhase * 0.57 - phaseAngle) * 0.3
          + Math.sin((x + y) * 0.0037 + seedPhase * 1.31 + phaseAngle * 0.5) * 0.2;
        return octave * spacing * drift * (0.16 + relief * 0.028) * anchor;
      }

      function contourReliefMarkFitsV57(mark, width, height, padding) {
        var tx = -mark.ny, ty = mark.nx;
        var startX = mark.x - mark.nx * mark.length * 0.43;
        var startY = mark.y - mark.ny * mark.length * 0.43;
        var endX = mark.x + mark.nx * mark.length * 0.57;
        var endY = mark.y + mark.ny * mark.length * 0.57;
        var middleX = mark.x + tx * mark.bend;
        var middleY = mark.y + ty * mark.bend;
        var radius = mark.width * (mark.bundle ? 2.2 : 1.1) + 1;
        var margin = Math.max(0, padding || 0) + radius;
        return Math.min(startX, endX, middleX) >= margin
          && Math.max(startX, endX, middleX) <= width - 1 - margin
          && Math.min(startY, endY, middleY) >= margin
          && Math.max(startY, endY, middleY) <= height - 1 - margin;
      }

      function contourReliefHachuresV57(surface, field, topology, width, height, reach,
        spacing, stroke, drift, relief, phase, seed, maximumMarks) {
        if (!field.bounds || relief <= 0.001 || reach <= 0.001) return [];
        var stride = Math.max(3, Math.min(28, spacing * Math.max(0.58, 1.18 - relief * 0.1)));
        var expansion = reach + Math.min(96, spacing * (1 + relief * 0.6));
        var minX = Math.max(1, Math.floor(field.bounds[0] - expansion));
        var minY = Math.max(1, Math.floor(field.bounds[1] - expansion));
        var maxX = Math.min(width - 2, Math.ceil(field.bounds[2] + expansion));
        var maxY = Math.min(height - 2, Math.ceil(field.bounds[3] + expansion));
        var limit = Math.max(0, Math.min(20000, maximumMarks == null ? 12000 : Math.round(maximumMarks)));
        var marks = [];
        var phaseAngle = phase * Math.PI * 2;
        for (var gridY = minY; gridY <= maxY && marks.length < limit; gridY += stride) {
          for (var gridX = minX; gridX <= maxX && marks.length < limit; gridX += stride) {
            var salt = Math.round(gridX * 17 + gridY * 29);
            var x = Math.max(1, Math.min(width - 2, Math.round(gridX
              + (hash(salt, seed, 2851) * 2 - 1) * stride * 0.42)));
            var y = Math.max(1, Math.min(height - 2, Math.round(gridY
              + (hash(seed, salt, 2857) * 2 - 1) * stride * 0.42)));
            var index = y * width + x;
            var signed = contourReliefSignedV57(surface, field, index);
            var magnitude = Math.abs(signed);
            if (magnitude < Math.max(1, spacing * 0.16) || magnitude > reach * 0.96) continue;
            var isCounter = !!topology.counter[index];
            var density = Math.min(0.9, 0.34 + relief * 0.12 + Math.min(0.16, drift * 0.03)
              + (isCounter ? 0.18 : 0));
            if (hash(salt, seed, 2861) > density) continue;
            var normal = contourReliefNormalV57(surface, field, width, height, x, y);
            var fade = Math.max(0.12, 1 - magnitude / reach * 0.82);
            var pulse = Math.sin(phaseAngle + salt * 0.071) * spacing * Math.min(0.38, drift * 0.035);
            var length = Math.max(3, Math.min(120, spacing * (0.96 + relief * 0.52)
              * (0.72 + hash(seed, salt, 2867) * 0.68) + pulse));
            var insideGain = field.inside[index] ? 0.86 : (isCounter ? 1 : 0.72);
            var mark = {
              x: x, y: y, nx: normal.x, ny: normal.y,
              length: length,
              width: Math.max(0.38, stroke * (0.48 + relief * 0.11)),
              bend: (hash(salt, seed, 2879) * 2 - 1) * drift * length * 0.055,
              alpha: Math.min(0.96, fade * insideGain * (0.42 + relief * 0.15)),
              bundle: relief > 0.9 && hash(seed, salt, 2887) < Math.min(0.56, (relief - 0.62) * 0.25),
              counter: isCounter
            };
            if (contourReliefMarkFitsV57(mark, width, height, 2)) marks.push(mark);
          }
        }
        return marks;
      }

      function contourReliefCounterTicksV57(surface, field, topology, width, height,
        spacing, stroke, relief, seed, maximumTicks) {
        var ticks = [];
        var limit = Math.max(0, Math.min(2048, maximumTicks == null ? 768 : Math.round(maximumTicks)));
        for (var componentIndex = 0; componentIndex < topology.components.length && ticks.length < limit; componentIndex++) {
          var component = topology.components[componentIndex];
          var boundary = [];
          for (var y = component.minY; y <= component.maxY; y++) for (var x = component.minX; x <= component.maxX; x++) {
            var index = y * width + x;
            if (!topology.counter[index]) continue;
            var touchesInk = (x > 0 && field.inside[index - 1]) || (x + 1 < width && field.inside[index + 1])
              || (y > 0 && field.inside[index - width]) || (y + 1 < height && field.inside[index + width]);
            if (touchesInk) boundary.push({ x: x, y: y, angle: Math.atan2(y - component.y, x - component.x) });
          }
          if (!boundary.length) continue;
          boundary.sort(function (a, b) { return a.angle - b.angle; });
          var perimeterEstimate = Math.max(4, (component.maxX - component.minX + component.maxY - component.minY) * 2);
          var count = Math.max(4, Math.min(48, Math.round(perimeterEstimate / Math.max(3, spacing * 1.25))));
          count = Math.min(count, boundary.length, limit - ticks.length);
          for (var tickIndex = 0; tickIndex < count; tickIndex++) {
            var point = boundary[Math.min(boundary.length - 1, Math.floor((tickIndex + 0.5) * boundary.length / count))];
            var normal = contourReliefNormalV57(surface, field, width, height, point.x, point.y);
            var towardX = component.x - point.x, towardY = component.y - point.y;
            if (normal.x * towardX + normal.y * towardY < 0) {
              normal.x *= -1; normal.y *= -1;
            }
            var salt = componentIndex * 97 + tickIndex * 13;
            var mark = {
              x: point.x, y: point.y, nx: normal.x, ny: normal.y,
              length: Math.max(3, Math.min(52, spacing * (0.68 + relief * 0.34)
                * (0.82 + hash(salt, seed, 2897) * 0.34))),
              width: Math.max(0.42, stroke * (0.68 + relief * 0.1)),
              bend: (hash(seed, salt, 2903) * 2 - 1) * spacing * 0.12,
              alpha: Math.min(1, 0.62 + relief * 0.09), bundle: false, counter: true
            };
            if (contourReliefMarkFitsV57(mark, width, height, 2)) ticks.push(mark);
          }
        }
        return ticks;
      }

      function contourReliefDrawBladeV57(ctx, mark, offset, widthScale, alphaScale) {
        var tx = -mark.ny, ty = mark.nx;
        var x = mark.x + tx * offset, y = mark.y + ty * offset;
        var startX = x - mark.nx * mark.length * 0.43;
        var startY = y - mark.ny * mark.length * 0.43;
        var endX = x + mark.nx * mark.length * 0.57;
        var endY = y + mark.ny * mark.length * 0.57;
        var middleX = x + tx * mark.bend;
        var middleY = y + ty * mark.bend;
        var half = mark.width * widthScale * 0.5;
        ctx.globalAlpha = mark.alpha * alphaScale;
        ctx.beginPath();
        ctx.moveTo(startX + tx * half, startY + ty * half);
        ctx.quadraticCurveTo(middleX + tx * half * 0.58, middleY + ty * half * 0.58, endX, endY);
        ctx.quadraticCurveTo(middleX - tx * half * 0.58, middleY - ty * half * 0.58,
          startX - tx * half, startY - ty * half);
        ctx.closePath();
        ctx.fill();
      }

      function contourReliefDrawMarksV57(ctx, marks, strength) {
        ctx.save();
        ctx.fillStyle = '#fff';
        for (var index = 0; index < marks.length; index++) {
          var mark = marks[index];
          mark.alpha *= strength;
          if (mark.bundle) {
            var gap = Math.max(0.55, mark.width * 0.72);
            contourReliefDrawBladeV57(ctx, mark, -gap, 0.48, 0.82);
            contourReliefDrawBladeV57(ctx, mark, gap, 0.48, 0.82);
          } else contourReliefDrawBladeV57(ctx, mark, 0, 1, 1);
        }
        ctx.restore();
      }

      function contourEtchEffectPad(glyphs) {
        var selected = glyphs.filter(function (g) {
          return surfaceGlyphStrength(g, 'contourEtch') > 0.002 && (g.opacity == null || g.opacity > 0.002);
        });
        if (!selected.length) return 0;
        var grammar = surfaceChoice(selected, 'contourEtch', 'contourGrammar', params.contourGrammar,
          BATCH_PARAM_OPTIONS.contourGrammar);
        var bands = Math.max(1, Math.round(surfaceAggregate(selected, 'contourEtch', 'contourBands', params.contourBands).value));
        var spacing = Math.max(1, surfaceAggregate(selected, 'contourEtch', 'contourSpacing', params.contourSpacing).value);
        var stroke = Math.max(0.25, surfaceAggregate(selected, 'contourEtch', 'contourStroke', params.contourStroke).value);
        var relief = (globalThis.TypeDeformerParameters
          ? globalThis.TypeDeformerParameters.normalize('contourRelief', surfaceAggregate(selected, 'contourEtch', 'contourRelief', params.contourRelief).value, 0, 0, 4)
          : Math.max(0, Math.min(4, surfaceAggregate(selected, 'contourEtch', 'contourRelief', params.contourRelief).value)));
        var reach = bands * spacing;
        if (grammar === 'relief') reach *= 1 + relief * 0.075;
        else if (grammar !== 'legacy') reach *= 1 + relief * 0.055;
        var marks = grammar === 'relief' ? Math.min(96, spacing * (1 + relief * 0.6)) : 0;
        return Math.ceil(reach + marks + stroke * 4 + 12);
      }

      function rasterPressEffectPad(glyphs) {
        var selected = glyphs.filter(function (g) {
          return surfaceGlyphStrength(g, 'rasterPress') > 0.002 && (g.opacity == null || g.opacity > 0.002);
        });
        if (!selected.length) return 0;
        var screen = surfaceChoice(selected, 'rasterPress', 'rasterScreen', params.rasterScreen,
          BATCH_PARAM_OPTIONS.rasterScreen);
        if (screen === 'legacy' || /V29$/.test(screen)) return 0;
        var cell = Math.max(1.4, surfaceAggregate(selected, 'rasterPress', 'rasterCell', params.rasterCell).value);
        var noise = Math.max(0, surfaceAggregate(selected, 'rasterPress', 'rasterNoise', params.rasterNoise).value);
        var modulation = (globalThis.TypeDeformerParameters
          ? globalThis.TypeDeformerParameters.normalize('rasterModulation', surfaceAggregate(selected, 'rasterPress', 'rasterModulation', params.rasterModulation).value, 0, 0, 4)
          : Math.max(0, Math.min(4, surfaceAggregate(selected, 'rasterPress', 'rasterModulation', params.rasterModulation).value)));
        var source = contentBounds(selected, 0);
        var pad = 40;
        // The renderer may enlarge its cell to stay within the hard mark budget.
        // Iterate the same dependency because the reserved halo also enlarges the raster.
        for (var pass = 0; pass < 3; pass++) {
          var budgetCell = Math.sqrt(Math.max(1, (source.w + pad * 2) * (source.h + pad * 2)) / 10800);
          var effectiveCell = Math.max(cell, budgetCell);
          pad = Math.max(2, effectiveCell * (0.62 + modulation * 0.24 + noise * 0.12)) + 6;
        }
        return Math.ceil(pad);
      }

      function hatchEngraveEffectPad(glyphs) {
        var selected = glyphs.filter(function (g) {
          return surfaceGlyphStrength(g, 'hatchEngrave') > 0.002 && (g.opacity == null || g.opacity > 0.002);
        });
        if (!selected.length) return 0;
        var grammar = surfaceChoice(selected, 'hatchEngrave', 'hatchGrammar', params.hatchGrammar,
          BATCH_PARAM_OPTIONS.hatchGrammar);
        if (grammar === 'legacy' || grammar === 'copperplate' || /V29$/.test(grammar)) return 0;
        var spacing = Math.max(2.1, surfaceAggregate(selected, 'hatchEngrave', 'hatchSpacing', params.hatchSpacing).value);
        var depth = (globalThis.TypeDeformerParameters
          ? globalThis.TypeDeformerParameters.normalize('hatchDepth', surfaceAggregate(selected, 'hatchEngrave', 'hatchDepth', params.hatchDepth).value, 0, 0, 4)
          : Math.max(0, Math.min(4, surfaceAggregate(selected, 'hatchEngrave', 'hatchDepth', params.hatchDepth).value)));
        var stroke = Math.max(0.12, surfaceAggregate(selected, 'hatchEngrave', 'hatchStroke', params.hatchStroke).value);
        var source = contentBounds(selected, 0);
        var pad = 40;
        for (var pass = 0; pass < 3; pass++) {
          var budgetSpacing = (source.w + source.h + pad * 4) / 620;
          var effectiveSpacing = Math.max(spacing, budgetSpacing);
          var plateReach = Math.max(1.5, effectiveSpacing * (0.58 + depth * 0.16));
          var relief = Math.max(0.45, Math.min(2.4, stroke * (0.4 + depth * 0.16)));
          pad = plateReach + relief + 6;
        }
        return Math.ceil(pad);
      }

      function monolithGlyphBoundsV35(glyph, width, height, pixelScale, L, reach, maxScan) {
        var base = voidPortalGlyphBoundsV33(glyph, width, height, pixelScale, L);
        if (!base) return null;
        var pad = Math.max(4, reach || 0);
        var minX = Math.max(0, Math.floor(base.x - pad));
        var minY = Math.max(0, Math.floor(base.y - pad));
        var maxX = Math.min(width, Math.ceil(base.x + base.w + pad));
        var maxY = Math.min(height, Math.ceil(base.y + base.h + pad));
        if (maxX - minX < 3 || maxY - minY < 3) return null;
        var scanLimit = Math.max(96, maxScan || 360);
        var scanScale = Math.min(1, scanLimit / Math.max(maxX - minX, maxY - minY));
        return {
          x: minX, y: minY, w: maxX - minX, h: maxY - minY,
          scale: scanScale,
          scanW: Math.max(3, Math.round((maxX - minX) * scanScale)),
          scanH: Math.max(3, Math.round((maxY - minY) * scanScale))
        };
      }

      function monolithNearestAnchorV35(anchors, x, y) {
        var nearest = anchors[0], best = Infinity;
        for (var i = 0; i < anchors.length; i++) {
          var dx = x - anchors[i].x, dy = y - anchors[i].y;
          var score = dx * dx + dy * dy;
          if (score < best) { best = score; nearest = anchors[i]; }
        }
        return nearest;
      }

      function monolithBodyV35(scan, mass, moduleSize, fault, counterReturn, strength, phase, salt) {
        var width = scan.bounds.scanW, height = scan.bounds.scanH;
        var field = surfaceBoundaryDistance(scan.image.data, width, height);
        if (!field.bounds) return null;
        var topology = surfaceVoidTopology(field, width, height);
        var body = surfaceScratch('monolith-v35-local-body', width, height, true);
        var rim = surfaceScratch('monolith-v35-local-rim', width, height, true);
        var bodyImage = body.ctx.createImageData(width, height);
        var rimImage = rim.ctx.createImageData(width, height);
        var softness = Math.max(0.7, Math.min(3.2, moduleSize * 0.11));
        // Fault is intentionally quiet around the default so letter identity
        // survives; the declared extreme range still accelerates into large
        // displaced lifts instead of flattening every value into one slab.
        var requestedFault = fault * 0.22;
        var visualFault = Math.max(-Math.min(width * 0.32, moduleSize * 4.5),
          Math.min(Math.min(width * 0.32, moduleSize * 4.5), requestedFault));
        var deepest = { x: (field.bounds[0] + field.bounds[2]) * 0.5,
          y: (field.bounds[1] + field.bounds[3]) * 0.5, depth: -1 };
        var bodyPixels = 0;
        for (var y = 0; y < height; y++) {
          var course = Math.floor(y / Math.max(2, moduleSize));
          var courseShift = (hash(course, salt, 4139) * 2 - 1) * visualFault;
          courseShift += Math.sin(phase + course * 1.618 + salt * 0.071)
            * Math.min(moduleSize * 0.16, Math.abs(visualFault) * 0.08);
          for (var x = 0; x < width; x++) {
            var sampleX = x - courseShift;
            if (sampleX < 0 || sampleX > width - 1) continue;
            var sampleLeft = Math.floor(sampleX), sampleRight = Math.min(width - 1, sampleLeft + 1), blendX = sampleX - sampleLeft;
            var indexLeft = y * width + sampleLeft, indexRight = y * width + sampleRight;
            var sampleIndex = y * width + Math.round(sampleX);
            // Continuous fault transport, retaining exactly the previous
            // signed field at integer offsets. Small edits no longer disappear
            // until the whole local scan jumps by one pixel.
            var signed = surfaceSignedDistanceValue(field, indexLeft) * (1 - blendX)
              + surfaceSignedDistanceValue(field, indexRight) * blendX;
            var coverage = surfaceSmoothCoverage(signed + mass, softness);
            var carveLeft = topology.counter[indexLeft] ? Math.min(1, counterReturn * (0.82 + Math.min(0.18, field.distance[indexLeft] / Math.max(1, moduleSize) * 0.12))) : 0;
            var carveRight = topology.counter[indexRight] ? Math.min(1, counterReturn * (0.82 + Math.min(0.18, field.distance[indexRight] / Math.max(1, moduleSize) * 0.12))) : 0;
            coverage *= 1 - carveLeft * (1 - blendX) - carveRight * blendX;
            if (coverage <= 0.002) continue;
            var alpha = Math.max(0, Math.min(1, coverage * strength));
            var index = (y * width + x) * 4;
            bodyImage.data[index] = bodyImage.data[index + 1] = bodyImage.data[index + 2] = 255;
            bodyImage.data[index + 3] = Math.round(alpha * 255);
            bodyPixels++;
            if (coverage > 0.08 && coverage < 0.94) {
              rimImage.data[index] = rimImage.data[index + 1] = rimImage.data[index + 2] = 255;
              rimImage.data[index + 3] = Math.round(alpha * (1 - Math.abs(coverage - 0.5) * 1.45) * 235);
            }
            if (field.inside[sampleIndex] && field.distance[sampleIndex] > deepest.depth) {
              deepest = { x: x, y: y, depth: field.distance[sampleIndex] };
            }
          }
        }
        if (!bodyPixels) return null;

        // Destination material shading; the analysis grid and topology stay fixed.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext,discard=new Float64Array(4);RC.field(bodyImage,function(px,py,rgba){var x=px-.5,y=py-.5,outputX=x,outputY=y;
          var course = Math.floor(y / Math.max(2, moduleSize));
          var courseShift = (hash(course, salt, 4139) * 2 - 1) * visualFault;
          courseShift += Math.sin(phase + course * 1.618 + salt * 0.071)
            * Math.min(moduleSize * 0.16, Math.abs(visualFault) * 0.08);

            var sampleX = x - courseShift;
            if (sampleX < 0 || sampleX > width - 1) return;
            var sampleLeft = Math.floor(sampleX), sampleRight = Math.min(width - 1, sampleLeft + 1), blendX = sampleX - sampleLeft;
            var indexLeft = Math.floor(y) * width + sampleLeft, indexRight = Math.floor(y) * width + sampleRight;
            var sampleIndex = Math.floor(y) * width + Math.round(sampleX);
            // Continuous fault transport, retaining exactly the previous
            // signed field at integer offsets. Small edits no longer disappear
            // until the whole local scan jumps by one pixel.
            var signed = RC.signed(field,width,height,sampleX,y);
            var coverage = surfaceSmoothCoverage(signed + mass, softness);
            var carveLeft = topology.counter[indexLeft] ? Math.min(1, counterReturn * (0.82 + Math.min(0.18, field.distance[indexLeft] / Math.max(1, moduleSize) * 0.12))) : 0;
            var carveRight = topology.counter[indexRight] ? Math.min(1, counterReturn * (0.82 + Math.min(0.18, field.distance[indexRight] / Math.max(1, moduleSize) * 0.12))) : 0;
            coverage *= 1 - carveLeft * (1 - blendX) - carveRight * blendX;
            if (coverage <= 0.002) return;
            var alpha = Math.max(0, Math.min(1, coverage * strength));
            var index = (y * width + x) * 4;
            rgba[0] = rgba[1] = rgba[2] = 255;
            rgba[3] = Math.round(alpha * 255);

            if (coverage > 0.08 && coverage < 0.94) {
              discard[0] = discard[1] = discard[2] = 255;
              discard[3] = Math.round(alpha * (1 - Math.abs(coverage - 0.5) * 1.45) * 235);
            }



        });}
        body.ctx.putImageData(bodyImage, 0, 0);

        // Destination material shading; the analysis grid and topology stay fixed.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext,discard=new Float64Array(4);RC.field(rimImage,function(px,py,rgba){var x=px-.5,y=py-.5,outputX=x,outputY=y;
          var course = Math.floor(y / Math.max(2, moduleSize));
          var courseShift = (hash(course, salt, 4139) * 2 - 1) * visualFault;
          courseShift += Math.sin(phase + course * 1.618 + salt * 0.071)
            * Math.min(moduleSize * 0.16, Math.abs(visualFault) * 0.08);

            var sampleX = x - courseShift;
            if (sampleX < 0 || sampleX > width - 1) return;
            var sampleLeft = Math.floor(sampleX), sampleRight = Math.min(width - 1, sampleLeft + 1), blendX = sampleX - sampleLeft;
            var indexLeft = Math.floor(y) * width + sampleLeft, indexRight = Math.floor(y) * width + sampleRight;
            var sampleIndex = Math.floor(y) * width + Math.round(sampleX);
            // Continuous fault transport, retaining exactly the previous
            // signed field at integer offsets. Small edits no longer disappear
            // until the whole local scan jumps by one pixel.
            var signed = RC.signed(field,width,height,sampleX,y);
            var coverage = surfaceSmoothCoverage(signed + mass, softness);
            var carveLeft = topology.counter[indexLeft] ? Math.min(1, counterReturn * (0.82 + Math.min(0.18, field.distance[indexLeft] / Math.max(1, moduleSize) * 0.12))) : 0;
            var carveRight = topology.counter[indexRight] ? Math.min(1, counterReturn * (0.82 + Math.min(0.18, field.distance[indexRight] / Math.max(1, moduleSize) * 0.12))) : 0;
            coverage *= 1 - carveLeft * (1 - blendX) - carveRight * blendX;
            if (coverage <= 0.002) return;
            var alpha = Math.max(0, Math.min(1, coverage * strength));
            var index = (y * width + x) * 4;
            discard[0] = discard[1] = discard[2] = 255;
            discard[3] = Math.round(alpha * 255);

            if (coverage > 0.08 && coverage < 0.94) {
              rgba[0] = rgba[1] = rgba[2] = 255;
              rgba[3] = Math.round(alpha * (1 - Math.abs(coverage - 0.5) * 1.45) * 235);
            }



        });}
        rim.ctx.putImageData(rimImage, 0, 0);
        var anchors = [];
        for (var componentIndex = 0; componentIndex < topology.components.length && componentIndex < 8; componentIndex++) {
          var component = topology.components[componentIndex];
          anchors.push({
            x: component.x, y: component.y,
            rx: Math.max(moduleSize * 0.55, (component.maxX - component.minX + 1) * 0.5),
            ry: Math.max(moduleSize * 0.55, (component.maxY - component.minY + 1) * 0.5),
            counter: true
          });
        }
        if (!anchors.length) anchors.push({
          x: deepest.x, y: deepest.y,
          rx: Math.max(moduleSize, deepest.depth * 0.72),
          ry: Math.max(moduleSize, deepest.depth * 0.72), counter: false
        });
        return { body: body.canvas, rim: rim.canvas, field: field, topology: topology, anchors: anchors };
      }

      function monolithClipLocalV35(layer, body) {
        layer.ctx.globalCompositeOperation = 'destination-in';
        layer.ctx.globalAlpha = 1;
        layer.ctx.drawImage(body, 0, 0);
        layer.ctx.globalCompositeOperation = 'source-over';
      }

      function monolithDrawStrataV35(ctx, width, height, moduleSize, fault, formwork, phase, salt) {
        var courseSize = Math.max(3, moduleSize);
        var wave = Math.min(courseSize * 0.24, Math.abs(fault) * 0.045 + formwork * 0.7);
        ctx.strokeStyle = '#fff';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(0.7, 0.72 + formwork * 0.34);
        for (var y = courseSize * 0.55, row = 0; y < height; y += courseSize, row++) {
          ctx.beginPath();
          for (var x = -courseSize; x <= width + courseSize; x += Math.max(3, courseSize * 0.28)) {
            var lineY = y + Math.sin(x / courseSize * 1.7 + row * 1.31 + phase + salt * 0.017) * wave;
            if (x <= -courseSize + 0.1) ctx.moveTo(x, lineY); else ctx.lineTo(x, lineY);
          }
          ctx.globalAlpha = 0.78;
          ctx.stroke();
          var jointStep = courseSize * (2.1 + hash(row, salt, 4153) * 1.2);
          var offset = (row & 1 ? jointStep * 0.52 : 0) + (hash(row, salt, 4157) - 0.5) * courseSize;
          for (var jointX = offset; jointX < width + jointStep; jointX += jointStep) {
            var lean = (hash(row, Math.round(jointX), 4159 + salt) * 2 - 1)
              * Math.min(courseSize * 0.42, Math.abs(fault) * 0.08 + courseSize * 0.12);
            ctx.beginPath();
            ctx.moveTo(jointX, y - courseSize * 0.45);
            ctx.lineTo(jointX + lean, y + courseSize * 0.45);
            ctx.globalAlpha = 0.68;
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      }

      function monolithDrawAshlarV35(ctx, width, height, moduleSize, fault, formwork, phase, salt) {
        var courseSize = Math.max(4, moduleSize * 1.35);
        ctx.strokeStyle = '#fff';
        ctx.lineJoin = 'bevel';
        ctx.lineCap = 'square';
        ctx.lineWidth = Math.max(0.8, 0.86 + formwork * 0.3);
        for (var y = courseSize * 0.5, row = 0; y < height + courseSize; y += courseSize, row++) {
          var ridge = (hash(row, salt, 4177) * 2 - 1) * courseSize * 0.18;
          ctx.beginPath();
          ctx.moveTo(-courseSize, y + ridge);
          for (var x = 0; x <= width + courseSize; x += courseSize * 0.72) {
            var rise = (hash(Math.round(x), row, salt + 4179) * 2 - 1) * courseSize * 0.22;
            ctx.lineTo(x, y + ridge + rise);
          }
          ctx.globalAlpha = 0.84;
          ctx.stroke();
          var blockX = -courseSize * (0.3 + hash(row, salt, 4181));
          while (blockX < width + courseSize) {
            var blockWidth = courseSize * (1.15 + hash(Math.round(blockX), row, salt + 4187) * 1.45);
            blockX += blockWidth;
            var lean = (hash(row, Math.round(blockX), salt + 4199) * 2 - 1)
              * (courseSize * 0.32 + Math.min(courseSize, Math.abs(fault) * 0.06));
            var notch = (row & 1 ? 1 : -1) * courseSize * (0.12 + formwork * 0.025);
            ctx.beginPath();
            ctx.moveTo(blockX - lean * 0.35, y - courseSize * 0.5);
            ctx.lineTo(blockX + notch, y - courseSize * 0.08);
            ctx.lineTo(blockX - notch * 0.45, y + courseSize * 0.5);
            ctx.globalAlpha = 0.76;
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      }

      function monolithDrawVaultV35(ctx, width, height, moduleSize, fault, formwork, phase, salt, anchors) {
        ctx.strokeStyle = '#fff';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(0.75, 0.78 + formwork * 0.31);
        for (var anchorIndex = 0; anchorIndex < anchors.length; anchorIndex++) {
          var anchor = anchors[anchorIndex];
          var ringCount = Math.max(2, Math.min(10, Math.round(2 + formwork * 1.4 +
            Math.max(anchor.rx, anchor.ry) / Math.max(3, moduleSize) * 0.45)));
          for (var ring = 0; ring < ringCount; ring++) {
            var ringStep = moduleSize * (0.66 + ring * 0.04);
            var rx = anchor.rx + ringStep * (ring + 1);
            var ry = anchor.ry + ringStep * (ring + 1) * (0.82 + hash(ring, anchorIndex, salt + 4211) * 0.22);
            ctx.beginPath();
            ctx.ellipse(anchor.x, anchor.y + Math.sin(phase + ring * 0.91) * Math.min(moduleSize * 0.08, Math.abs(fault) * 0.015),
              rx, ry, (hash(ring, anchorIndex, salt + 4217) - 0.5) * 0.08, Math.PI, Math.PI * 2);
            ctx.globalAlpha = 0.8 - ring / Math.max(1, ringCount) * 0.28;
            ctx.stroke();
          }
          var spokeCount = Math.max(7, Math.min(28, Math.round((anchor.rx + anchor.ry) / Math.max(3, moduleSize) * 3.2 + 8)));
          for (var spoke = 0; spoke < spokeCount; spoke++) {
            var t = spoke / Math.max(1, spokeCount - 1);
            var angle = Math.PI + t * Math.PI;
            var innerX = anchor.x + Math.cos(angle) * (anchor.rx + moduleSize * 0.35);
            var innerY = anchor.y + Math.sin(angle) * (anchor.ry + moduleSize * 0.35);
            var outerX = anchor.x + Math.cos(angle) * (anchor.rx + moduleSize * (2.3 + formwork * 0.42));
            var outerY = anchor.y + Math.sin(angle) * (anchor.ry + moduleSize * (2 + formwork * 0.38));
            ctx.beginPath(); ctx.moveTo(innerX, innerY); ctx.lineTo(outerX, outerY);
            ctx.globalAlpha = spoke === Math.floor(spokeCount / 2) ? 0.96 : 0.66;
            ctx.stroke();
          }
        }
        for (var y = height * 0.68; y < height; y += Math.max(4, moduleSize * 1.15)) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y + Math.sin(phase + y * 0.03) * moduleSize * 0.08);
          ctx.globalAlpha = 0.34; ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      function monolithDrawStereotomyV35(ctx, width, height, moduleSize, fault, formwork, phase, salt, anchors) {
        var courseSize = Math.max(4, moduleSize * 1.08);
        ctx.strokeStyle = '#fff';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(0.75, 0.82 + formwork * 0.33);
        for (var y = courseSize * 0.5, row = 0; y < height + courseSize; y += courseSize, row++) {
          ctx.beginPath();
          for (var x = -courseSize; x <= width + courseSize; x += Math.max(3, courseSize * 0.24)) {
            var anchor = monolithNearestAnchorV35(anchors, x, y);
            var dx = x - anchor.x;
            var span = Math.max(courseSize * 3, anchor.rx * 2.8 + courseSize * 2.2);
            var arch = Math.max(0, 1 - Math.abs(dx) / span);
            arch = arch * arch * courseSize * (0.62 + (anchor.counter ? 0.82 : 0.28));
            var decay = Math.exp(-Math.abs(y - anchor.y) / Math.max(courseSize, anchor.ry * 2.1));
            var settle = Math.sin(phase + row * 0.73 + salt * 0.013) * courseSize * 0.08;
            var lineY = y - arch * decay + settle;
            if (x <= -courseSize + 0.1) ctx.moveTo(x, lineY); else ctx.lineTo(x, lineY);
          }
          ctx.globalAlpha = 0.74;
          ctx.stroke();
        }
        var columnStep = Math.max(6, courseSize * 1.7);
        for (var gy = courseSize; gy < height; gy += courseSize) {
          var rowIndex = Math.round(gy / courseSize);
          for (var gx = (rowIndex & 1 ? columnStep * 0.5 : 0); gx < width + columnStep; gx += columnStep) {
            var jitterX = (hash(Math.round(gx), rowIndex, salt + 4241) * 2 - 1) * courseSize * 0.32;
            var jitterY = (hash(rowIndex, Math.round(gx), salt + 4243) * 2 - 1) * courseSize * 0.16;
            var px = gx + jitterX, py = gy + jitterY;
            var forceAnchor = monolithNearestAnchorV35(anchors, px, py);
            var fx = (px - forceAnchor.x) * 0.58;
            var fy = courseSize + Math.max(0, py - forceAnchor.y) * 0.32;
            var angle = Math.atan2(fy, fx) + Math.PI * 0.5;
            angle += (hash(rowIndex, Math.round(gx), salt + 4253) * 2 - 1)
              * Math.min(0.42, Math.abs(fault) / Math.max(1, width) * 0.6);
            var length = courseSize * (0.72 + hash(Math.round(gx), rowIndex, salt + 4259) * 0.55);
            var lock = length * (0.12 + formwork * 0.024);
            ctx.save(); ctx.translate(px, py); ctx.rotate(angle);
            ctx.beginPath();
            ctx.moveTo(-length * 0.5, 0);
            ctx.lineTo(-length * 0.18, 0);
            ctx.lineTo(-length * 0.08, lock);
            ctx.lineTo(length * 0.08, -lock);
            ctx.lineTo(length * 0.18, 0);
            ctx.lineTo(length * 0.5, 0);
            ctx.globalAlpha = 0.88;
            ctx.stroke();
            ctx.restore();
          }
        }
        for (var anchorIndex = 0; anchorIndex < anchors.length; anchorIndex++) {
          var anchor = anchors[anchorIndex];
          if (!anchor.counter) continue;
          for (var ring = 1; ring <= 2; ring++) {
            ctx.beginPath();
            ctx.ellipse(anchor.x, anchor.y, anchor.rx + courseSize * ring * 0.62,
              anchor.ry + courseSize * ring * 0.62, 0, Math.PI, Math.PI * 2);
            ctx.globalAlpha = 0.88 - ring * 0.18;
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      }

      function monolithDrawMarksV35(ctx, width, height, moduleSize, formwork, phase, salt, grammar) {
        if (formwork <= 0.002) return;
        ctx.strokeStyle = '#fff';
        ctx.fillStyle = '#fff';
        ctx.lineCap = 'round';
        var markCount = Math.min(240, Math.round((width * height) / Math.max(36, moduleSize * moduleSize)
          * (0.08 + formwork * 0.075)));
        for (var mark = 0; mark < markCount; mark++) {
          var x = hash(mark, salt, 4271) * width;
          var y = hash(salt, mark, 4273) * height;
          var size = Math.max(0.45, moduleSize * (0.035 + hash(mark, salt, 4283) * 0.085) * (0.7 + formwork * 0.24));
          if (grammar === 'strata' && mark % 3) {
            var length = moduleSize * (0.45 + hash(mark, salt, 4289) * 1.35);
            ctx.beginPath(); ctx.moveTo(x - length * 0.5, y);
            ctx.quadraticCurveTo(x, y + Math.sin(phase + mark) * size, x + length * 0.5, y);
            ctx.lineWidth = Math.max(0.35, size * 0.28);
            ctx.globalAlpha = Math.min(0.7, 0.12 + formwork * 0.11);
            ctx.stroke();
          } else {
            ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.globalAlpha = Math.min(0.78, 0.16 + formwork * 0.13);
            ctx.fill();
          }
        }
        if (formwork > 0.32) {
          var tieStep = Math.max(moduleSize * 3.2, 18);
          for (var tieY = tieStep * 0.62; tieY < height; tieY += tieStep) {
            for (var tieX = tieStep * 0.62; tieX < width; tieX += tieStep) {
              if (hash(Math.round(tieX), Math.round(tieY), salt + 4297) < 0.42) continue;
              ctx.beginPath();
              ctx.arc(tieX, tieY, Math.max(0.7, Math.min(moduleSize * 0.16, 1 + formwork * 0.55)), 0, Math.PI * 2);
              ctx.globalAlpha = Math.min(0.82, 0.25 + formwork * 0.12);
              ctx.fill();
            }
          }
        }
        ctx.globalAlpha = 1;
      }

      function pressureContinuousNoise(x, y, salt) {
        var ix = Math.floor(x), iy = Math.floor(y);
        var u = x - ix, v = y - iy;
        u = u * u * u * (u * (u * 6 - 15) + 10);
        v = v * v * v * (v * (v * 6 - 15) + 10);
        var a = surfaceNoise01(ix, iy, salt), b = surfaceNoise01(ix + 1, iy, salt);
        var c = surfaceNoise01(ix, iy + 1, salt), d = surfaceNoise01(ix + 1, iy + 1, salt);
        return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
      }

      function fractureColorizeAndOutput(targetCtx, work, color) {
        work.ctx.globalCompositeOperation = 'source-in';
        work.ctx.globalAlpha = 1;
        work.ctx.fillStyle = color;
        work.ctx.fillRect(0, 0, work.canvas.width, work.canvas.height);
        work.ctx.globalCompositeOperation = 'source-over';
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function fractureMaskBounds(mask) {
        var context = mask.getContext('2d', { willReadFrequently: true });
        var data;
        try { data = context.getImageData(0, 0, mask.width, mask.height).data; }
        catch (error) { return null; }
        var minX = mask.width, minY = mask.height, maxX = -1, maxY = -1;
        for (var y = 0; y < mask.height; y++) for (var x = 0; x < mask.width; x++) {
          if (data[(y * mask.width + x) * 4 + 3] < 8) continue;
          minX = Math.min(minX, x); minY = Math.min(minY, y);
          maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
        return maxX < minX ? null : [minX, minY, maxX, maxY];
      }

      function drawTransformedFractureFragment(ctx, glyphMask, pivotX, pivotY,
        moveX, moveY, rotation, scale, trace) {
        ctx.save();
        ctx.translate(pivotX + moveX, pivotY + moveY);
        ctx.rotate(rotation);
        ctx.scale(scale, scale);
        ctx.translate(-pivotX, -pivotY);
        ctx.beginPath();
        trace(ctx);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(glyphMask, 0, 0);
        ctx.restore();
      }

      function traceFracturePlate(ctx, cx, cy, innerRadius, outerRadius,
        startAngle, endAngle, roughness) {
        var midAngle = (startAngle + endAngle) * 0.5;
        var outerMid = outerRadius * (1 + roughness);
        var innerMid = innerRadius * (1 - roughness * 0.46);
        ctx.moveTo(cx + Math.cos(startAngle) * outerRadius, cy + Math.sin(startAngle) * outerRadius);
        ctx.lineTo(cx + Math.cos(midAngle) * outerMid, cy + Math.sin(midAngle) * outerMid);
        ctx.lineTo(cx + Math.cos(endAngle) * outerRadius, cy + Math.sin(endAngle) * outerRadius);
        if (innerRadius > 0.5) {
          ctx.lineTo(cx + Math.cos(endAngle) * innerRadius, cy + Math.sin(endAngle) * innerRadius);
          ctx.lineTo(cx + Math.cos(midAngle) * innerMid, cy + Math.sin(midAngle) * innerMid);
          ctx.lineTo(cx + Math.cos(startAngle) * innerRadius, cy + Math.sin(startAngle) * innerRadius);
        } else ctx.lineTo(cx, cy);
      }

      function fractureGlyphExtent(glyph, pixelScale, L) {
        var transformedW = Math.abs(glyph.w * (glyph.scaleX == null ? 1 : glyph.scaleX));
        var transformedH = Math.abs(glyph.h * (glyph.scaleY == null ? 1 : glyph.scaleY));
        return Math.max(14, Math.hypot(transformedW, transformedH) * L.s * pixelScale * 0.62);
      }

      function fractureImpactOrigin(glyph, glyphIndex, pixelScale, L) {
        var u = 0.28 + hash(glyphIndex, params.seed % 97, 2311) * 0.44;
        var v = 0.26 + hash(glyphIndex, params.seed % 83, 2317) * 0.48;
        return surfaceGlyphNode(glyph, 'cellFracture', pixelScale, L, 0, 0, 0,
          glyphIndex, u, v, 1);
      }

      function fractureSnapOriginToInk(proposed, inkPoints, extent) {
        if (!inkPoints || !inkPoints.length) return proposed;
        var best = null;
        var bestDistance = Math.pow(Math.max(8, extent * 0.82), 2);
        for (var pointIndex = 0; pointIndex < inkPoints.length; pointIndex++) {
          var point = inkPoints[pointIndex];
          var dx = point.x - proposed.x, dy = point.y - proposed.y;
          var distance = dx * dx + dy * dy;
          if (distance < bestDistance) {
            best = point;
            bestDistance = distance;
          }
        }
        return best ? { x: best.x, y: best.y, r: proposed.r } : proposed;
      }

      function strokeFracturePolyline(ctx, points) {
        if (!points || points.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (var pointIndex = 1; pointIndex < points.length; pointIndex++) {
          ctx.lineTo(points[pointIndex].x, points[pointIndex].y);
        }
        ctx.stroke();
      }

      function ribbonOutlineMaskV31(mask, radius, name) {
        var outline = surfaceScratch(name, mask.width, mask.height, false);
        var ctx = outline.ctx;
        var reach = Math.max(0.6, radius);
        var spokes = 12;
        for (var spoke = 0; spoke < spokes; spoke++) {
          var angle = spoke / spokes * Math.PI * 2;
          ctx.drawImage(mask, Math.cos(angle) * reach, Math.sin(angle) * reach);
        }
        ctx.globalCompositeOperation = 'destination-out';
        ctx.drawImage(mask, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        return outline.canvas;
      }

      function ribbonSectionStateV31(path, t, depth, weave, phase, twist, bounds, strand) {
        var spanX = Math.max(1, bounds[2] - bounds[0]);
        var spanY = Math.max(1, bounds[3] - bounds[1]);
        var minSpan = Math.min(spanX, spanY);
        var maxSpan = Math.max(spanX, spanY);
        var direction = 0.18 + phase;
        var ux = Math.cos(direction), uy = Math.sin(direction);
        var nx = -uy, ny = ux;
        var eased = t * t * (3 - 2 * t);
        var travel = depth * eased;
        var lane = strand || 0;
        var state = {
          x: ux * travel,
          y: uy * travel,
          rotation: twist * t * 0.14,
          scaleX: 1 + weave * 0.018 * t,
          scaleY: Math.max(0.26, 1 - weave * 0.025 * t),
          facing: 1,
          turn: 0
        };
        if (path === 'helix') {
          var helixCycles = 0.68 + weave * 0.52;
          var helixTurn = t * Math.PI * 2 * helixCycles + phase + lane * Math.PI;
          var helixRadius = Math.min(maxSpan * 0.46,
            Math.abs(depth) * (0.1 + weave * 0.14) + minSpan * (0.025 + weave * 0.018));
          state.x += nx * Math.sin(helixTurn) * helixRadius;
          state.y += ny * Math.sin(helixTurn) * helixRadius;
          state.rotation = twist * t + Math.cos(helixTurn) * (0.08 + weave * 0.12);
          state.scaleX = 1 + Math.sin(helixTurn) * weave * 0.025;
          state.scaleY = Math.max(0.12, 0.22 + Math.abs(Math.cos(helixTurn)) * 0.78);
          state.facing = Math.cos(helixTurn);
          state.turn = helixTurn;
        } else if (path === 'fan') {
          var fanSign = depth < 0 ? -1 : 1;
          var fanArc = Math.PI * (0.22 + weave * 0.2);
          var fanTurn = fanSign * (t - 0.08) * fanArc + Math.sin(phase) * 0.22;
          state.x = ux * depth * eased * 0.2 + nx * Math.sin(phase + t * Math.PI) * minSpan * weave * 0.025;
          state.y = uy * depth * eased * 0.2 + ny * Math.sin(phase + t * Math.PI) * minSpan * weave * 0.025;
          state.rotation = fanTurn + twist * (t - 0.5) * 0.32;
          state.scaleX = 1 + weave * 0.035 * Math.sin(t * Math.PI);
          state.scaleY = Math.max(0.34, 1 - weave * 0.045 * t);
          state.facing = Math.cos(fanTurn);
          state.turn = fanTurn;
        } else if (path === 'braid') {
          var braidCycles = 0.72 + weave * 0.44;
          var braidTurn = t * Math.PI * 2 * braidCycles + phase + lane * Math.PI;
          var braidRadius = Math.min(maxSpan * 0.38,
            Math.abs(depth) * (0.07 + weave * 0.13) + minSpan * (0.018 + weave * 0.014));
          state.x += nx * Math.sin(braidTurn) * braidRadius;
          state.y += ny * Math.sin(braidTurn) * braidRadius;
          state.rotation = twist * t * 0.46 + Math.cos(braidTurn) * (0.07 + weave * 0.09);
          state.scaleX = 1 + weave * 0.02 * Math.sin(braidTurn);
          state.scaleY = Math.max(0.2, 0.42 + Math.abs(Math.cos(braidTurn)) * 0.58);
          state.facing = Math.cos(braidTurn);
          state.turn = braidTurn;
        } else {
          state.scaleY = Math.max(0.38, 1 - t * (0.06 + weave * 0.035));
          state.rotation = twist * t * 0.14 + Math.sin(t * Math.PI + phase) * weave * 0.025;
        }
        return state;
      }

      function ribbonTransformPointV31(x, y, pivotX, pivotY, state) {
        var dx = (x - pivotX) * state.scaleX;
        var dy = (y - pivotY) * state.scaleY;
        var cos = Math.cos(state.rotation), sin = Math.sin(state.rotation);
        return {
          x: pivotX + state.x + dx * cos - dy * sin,
          y: pivotY + state.y + dx * sin + dy * cos
        };
      }

      function ribbonApplyStateV31(ctx, pivotX, pivotY, state) {
        ctx.translate(pivotX + state.x, pivotY + state.y);
        ctx.rotate(state.rotation);
        ctx.scale(state.scaleX, state.scaleY);
        ctx.translate(-pivotX, -pivotY);
      }

      function ribbonDrawSectionV31(ctx, source, bounds, axis, start, end,
        pivotX, pivotY, state, alpha, padding) {
        var pad = Math.max(0, padding || 0);
        ctx.save();
        ribbonApplyStateV31(ctx, pivotX, pivotY, state);
        ctx.beginPath();
        if (axis === 'y') {
          ctx.rect(bounds[0] - pad, start - pad,
            bounds[2] - bounds[0] + pad * 2, Math.max(0.5, end - start + pad * 2));
        } else {
          ctx.rect(start - pad, bounds[1] - pad,
            Math.max(0.5, end - start + pad * 2), bounds[3] - bounds[1] + pad * 2);
        }
        ctx.clip();
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx.drawImage(source, 0, 0);
        ctx.restore();
      }

      function ribbonStrokeRailV31(ctx, items, pivotX, pivotY, pointSelector, lineWidth, alpha) {
        if (!items.length) return;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (var i = 0; i < items.length; i++) {
          var sourcePoint = pointSelector(items[i], i);
          var point = ribbonTransformPointV31(sourcePoint.x, sourcePoint.y,
            pivotX, pivotY, items[i].state);
          if (!i) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        }
        ctx.stroke();
        ctx.restore();
      }

      function ribbonSkinStripV31(ctx, items, pivotX, pivotY, centerY, halfWidth, alphaResolver) {
        if (items.length < 2) return;
        ctx.save();
        ctx.fillStyle = '#000';
        for (var i = 1; i < items.length; i++) {
          var previous = items[i - 1], current = items[i];
          var alpha = typeof alphaResolver === 'function'
            ? alphaResolver(previous, current, i) : alphaResolver;
          if (alpha <= 0.001) continue;
          var p0a = ribbonTransformPointV31(previous.center, centerY - halfWidth,
            pivotX, pivotY, previous.state);
          var p0b = ribbonTransformPointV31(previous.center, centerY + halfWidth,
            pivotX, pivotY, previous.state);
          var p1a = ribbonTransformPointV31(current.center, centerY - halfWidth,
            pivotX, pivotY, current.state);
          var p1b = ribbonTransformPointV31(current.center, centerY + halfWidth,
            pivotX, pivotY, current.state);
          ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
          ctx.beginPath();
          ctx.moveTo(p0a.x, p0a.y); ctx.lineTo(p1a.x, p1a.y);
          ctx.lineTo(p1b.x, p1b.y); ctx.lineTo(p0b.x, p0b.y);
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }

      function ribbonFanLeavesV31(bodyCtx, shadeCtx, railCtx, cutCtx, items,
        pivotX, pivotY, centerY, halfWidth, railWidth, fade) {
        bodyCtx.save(); shadeCtx.save(); railCtx.save(); cutCtx.save();
        bodyCtx.fillStyle = shadeCtx.fillStyle = '#000';
        railCtx.strokeStyle = cutCtx.strokeStyle = '#000';
        railCtx.lineCap = cutCtx.lineCap = 'round';
        for (var i = 0; i < items.length; i++) {
          var item = items[i];
          var leafHalf = halfWidth * (0.54 + Math.sin(item.t * Math.PI) * 0.46);
          var outerA = ribbonTransformPointV31(item.center, centerY - leafHalf,
            pivotX, pivotY, item.state);
          var outerB = ribbonTransformPointV31(item.center, centerY + leafHalf,
            pivotX, pivotY, item.state);
          var hingeHalf = Math.max(1.5, halfWidth * (0.07 + item.t * 0.035));
          bodyCtx.globalAlpha = Math.max(0.14, 0.54 - fade * item.t * 0.25);
          bodyCtx.beginPath();
          bodyCtx.moveTo(pivotX, pivotY - hingeHalf);
          bodyCtx.lineTo(outerA.x, outerA.y);
          bodyCtx.lineTo(outerB.x, outerB.y);
          bodyCtx.lineTo(pivotX, pivotY + hingeHalf);
          bodyCtx.closePath(); bodyCtx.fill();
          if (item.state.facing < 0.24) {
            shadeCtx.globalAlpha = Math.min(0.82, 0.18 - item.state.facing * 0.48);
            shadeCtx.beginPath();
            shadeCtx.moveTo(pivotX, pivotY - hingeHalf);
            shadeCtx.lineTo(outerA.x, outerA.y); shadeCtx.lineTo(outerB.x, outerB.y);
            shadeCtx.lineTo(pivotX, pivotY + hingeHalf); shadeCtx.closePath(); shadeCtx.fill();
          }
          railCtx.globalAlpha = 0.18 + (1 - item.t) * 0.36;
          railCtx.lineWidth = Math.max(0.55, railWidth * 0.42);
          railCtx.beginPath(); railCtx.moveTo(pivotX, pivotY);
          railCtx.lineTo((outerA.x + outerB.x) * 0.5, (outerA.y + outerB.y) * 0.5); railCtx.stroke();
          if (i > 0 && (i & 1) === 0) {
            cutCtx.globalAlpha = 0.28 + fade * 0.3;
            cutCtx.lineWidth = Math.max(0.5, railWidth * 0.35);
            cutCtx.beginPath(); cutCtx.moveTo(pivotX, pivotY);
            cutCtx.lineTo(outerA.x, outerA.y); cutCtx.stroke();
          }
        }
        bodyCtx.restore(); shadeCtx.restore(); railCtx.restore(); cutCtx.restore();
      }

      function ribbonLaminaPoint(x, y, bounds, depth, weave, twist, phase) {
        var t = (x - bounds[0]) / Math.max(1, bounds[2] - bounds[0]);
        var cy = (bounds[1] + bounds[3]) * 0.5;
        var turn = t * Math.PI * 2 + phase;
        var roll = twist * (t - 0.5) + weave * 0.72 * Math.sin(turn);
        var dy = y - cy;
        return { x: x + depth * 0.25 * (t - 0.5) + dy * Math.sin(roll) * 0.38,
          y: cy + depth * 0.72 * Math.sin(turn) + dy * Math.cos(roll),
          z: depth * 0.4 * Math.cos(turn) + dy * Math.sin(roll) };
      }

      function ribbonLaminaTriangle(raster, source, uv, points, color, opacity) {
        var u1 = uv[1].x - uv[0].x, v1 = uv[1].y - uv[0].y;
        var u2 = uv[2].x - uv[0].x, v2 = uv[2].y - uv[0].y;
        var dx1 = points[1].x - points[0].x, dy1 = points[1].y - points[0].y;
        var dx2 = points[2].x - points[0].x, dy2 = points[2].y - points[0].y;
        var det = dx1 * dy2 - dx2 * dy1;
        if (Math.abs(det) < 0.000001) return;
        var x0 = Math.max(raster.originX, Math.floor(Math.min(points[0].x, points[1].x, points[2].x)));
        var y0 = Math.max(raster.originY, Math.floor(Math.min(points[0].y, points[1].y, points[2].y)));
        var x1 = Math.min(raster.originX + raster.width, Math.ceil(Math.max(points[0].x, points[1].x, points[2].x)));
        var y1 = Math.min(raster.originY + raster.height, Math.ceil(Math.max(points[0].y, points[1].y, points[2].y)));
        for (var y = y0; y < y1; y++) for (var x = x0; x < x1; x++) {
          var px = x + 0.5 - points[0].x, py = y + 0.5 - points[0].y;
          var s = (px * dy2 - dx2 * py) / det, t = (dx1 * py - px * dy1) / det;
          if (s < -1e-9 || t < -1e-9 || s + t > 1 + 1e-9) continue;
          var z = points[0].z + s * (points[1].z - points[0].z) + t * (points[2].z - points[0].z);
          var pixel = (y - raster.originY) * raster.width + x - raster.originX;
          if (z <= raster.depth[pixel] + 1e-7) continue;
          var sx = uv[0].x + s * u1 + t * u2 - 0.5 - source.originX;
          var sy = uv[0].y + s * v1 + t * v2 - 0.5 - source.originY;
          var ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
          if (ix < 0 || iy < 0 || ix + 1 >= source.width || iy + 1 >= source.height) continue;
          var offset = (iy * source.width + ix) * 4 + 3;
          var alpha = ((source.data[offset] * (1 - fx) + source.data[offset + 4] * fx) * (1 - fy)
            + (source.data[offset + source.width * 4] * (1 - fx) + source.data[offset + source.width * 4 + 4] * fx) * fy) * opacity;
          if (alpha < 0.5) continue;
          raster.depth[pixel] = z;
          var out = pixel * 4;
          raster.data[out] = color[0]; raster.data[out + 1] = color[1]; raster.data[out + 2] = color[2];
          raster.data[out + 3] = alpha;
        }
      }

      function ribbonLaminaEffectPad(glyphs) {
        if (surfaceChoice(glyphs, 'ribbonEcho', 'ribbonPath', params.ribbonPath, BATCH_PARAM_OPTIONS.ribbonPath) !== 'lamina') return 0;
        var selected = glyphs.filter(function (g) { return surfaceGlyphStrength(g, 'ribbonEcho') > 0.002; });
        if (!selected.length) return 0;
        var bounds = contentBounds(selected, 0);
        var depth = Math.abs(surfaceAggregate(selected, 'ribbonEcho', 'ribbonDepth', params.ribbonDepth).value);
        // y stays inside the source height plus the backbone excursion; x
        // additionally carries an orthographic transverse roll component.
        return Math.ceil(Math.max(depth * 0.72, depth * 0.125 + bounds.h * 0.19) + 4);
      }

      var ribbonEchoEffectPadCache = { key: '', value: 0 };

      function ribbonEchoEffectPad(glyphs) {
        var path = surfaceChoice(glyphs, 'ribbonEcho', 'ribbonPath', params.ribbonPath, BATCH_PARAM_OPTIONS.ribbonPath);
        if (path === 'lamina') return ribbonLaminaEffectPad(glyphs);
        var selected = glyphs.filter(function (g) {
          return surfaceGlyphStrength(g, 'ribbonEcho') > 0.002 && (g.opacity == null || g.opacity > 0.002);
        });
        if (!selected.length) return 0;
        var source = contentBounds(selected, 0);
        if (path === 'legacy') {
          var legacyDepth = Math.abs(surfaceAggregate(selected, 'ribbonEcho', 'ribbonDepth', params.ribbonDepth).value);
          return Math.ceil(legacyDepth * 1.25 + params.fontSize * 0.5 + 12);
        }
        var depth = surfaceAggregate(selected, 'ribbonEcho', 'ribbonDepth', params.ribbonDepth).value;
        var weave = (globalThis.TypeDeformerParameters
          ? globalThis.TypeDeformerParameters.normalize('ribbonWeave', surfaceAggregate(selected, 'ribbonEcho', 'ribbonWeave', params.ribbonWeave).value, 0, 0, 4)
          : Math.max(0, Math.min(4, surfaceAggregate(selected, 'ribbonEcho', 'ribbonWeave', params.ribbonWeave).value)));
        var twist = surfaceAggregate(selected, 'ribbonEcho', 'ribbonTwist', params.ribbonTwist).value * Math.PI / 180;
        var left = source.x, top = source.y, right = source.x + source.w, bottom = source.y + source.h;
        var centerX = (left + right) * 0.5, centerY = (top + bottom) * 0.5;
        var pivotX = path === 'fan' ? (depth < 0 ? right : left) : centerX;
        var pivotY = centerY;
        var cacheKey = [path, depth, weave, twist, left, top, right, bottom, params.fontSize].join('|');
        if (ribbonEchoEffectPadCache.key === cacheKey) return ribbonEchoEffectPadCache.value;
        var minX = left, minY = top, maxX = right, maxY = bottom;
        var corners = [[left, top], [right, top], [right, bottom], [left, bottom]];
        var lanes = path === 'braid' ? 2 : 1;
        // Animation rotates the trajectory direction through a complete turn.
        // Sample that closed interval together with the continuous ribbon path;
        // the safety gutter below covers the sub-sample curvature and strokes.
        for (var phaseIndex = 0; phaseIndex < 64; phaseIndex++) {
          var phase = phaseIndex / 64 * Math.PI * 2;
          for (var sample = 0; sample <= 96; sample++) {
            var t = sample / 96;
            for (var lane = 0; lane < lanes; lane++) {
              var state = ribbonSectionStateV31(path, t, depth, weave, phase, twist,
                [left, top, right, bottom], lane);
              for (var corner = 0; corner < corners.length; corner++) {
                var point = ribbonTransformPointV31(corners[corner][0], corners[corner][1], pivotX, pivotY, state);
                minX = Math.min(minX, point.x); minY = Math.min(minY, point.y);
                maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y);
              }
            }
          }
        }
        var expansion = Math.max(left - minX, top - minY, maxX - right, maxY - bottom, 0);
        var sampleSlack = Math.hypot(source.w, source.h) * (Math.PI * 2 / 64) + Math.abs(depth) * (Math.PI * 2 / 64);
        var value = Math.ceil(expansion + sampleSlack + Math.max(12, params.fontSize * 0.08));
        ribbonEchoEffectPadCache = { key: cacheKey, value: value };
        return value;
      }

      function colorizeSurfaceCanvas(mask, color, name) {
        var painted = surfaceScratch(name, mask.width, mask.height, false);
        painted.ctx.drawImage(mask, 0, 0);
        painted.ctx.globalCompositeOperation = 'source-in';
        painted.ctx.fillStyle = color;
        painted.ctx.fillRect(0, 0, mask.width, mask.height);
        painted.ctx.globalCompositeOperation = 'source-over';
        return painted.canvas;
      }

      function drawRegistrationSliceField(target, source, system, baseX, baseY, warp, zones, slur, salt) {
        var ctx = target.ctx;
        ctx.imageSmoothingEnabled = true;
        var width = source.width, height = source.height;
        if (system === 'legacy') {
          ctx.drawImage(source, baseX, baseY);
          return;
        }
        if (system === 'slur' || system === 'doubling') {
          var bands = Math.max(3, Math.min(72, Math.round(zones * (system === 'slur' ? 2.4 : 1.45))));
          var bandHeight = height / bands;
          var echoes = Math.max(1, Math.min(9, Math.ceil(slur * (system === 'slur' ? 2.2 : 1.25))));
          for (var row = 0; row < bands; row++) {
            var sy = Math.floor(row * bandHeight);
            var sh = Math.max(1, Math.ceil((row + 1) * bandHeight) - sy);
            var v = (row + 0.5) / bands;
            var pressure = 0.28 + surfaceNoise01(row, salt, params.seed + 3301) * 0.92;
            var rowWave = Math.sin(v * Math.PI * (2 + warp * 1.4) + salt * 0.37);
            var dragX = baseX + (baseX || 1) * rowWave * warp * (0.32 + pressure * 0.28);
            var dragY = baseY + (baseY || 1) * Math.cos(v * Math.PI * 1.7 + salt) * warp * 0.22;
            if (system === 'doubling') {
              dragX *= 0.38 + pressure * 0.24;
              dragY *= 0.38 + pressure * 0.18;
            }
            for (var echo = 0; echo < echoes; echo++) {
              var t = echoes <= 1 ? 1 : echo / (echoes - 1);
              ctx.globalAlpha = system === 'slur'
                ? (0.12 + (1 - t) * 0.42) / Math.sqrt(echoes)
                : (echo ? 0.24 / Math.sqrt(echoes) : 0.72);
              var micro = (surfaceNoise01(row, echo, params.seed + salt + 3307) * 2 - 1) * (0.5 + slur * 1.7);
              ctx.drawImage(source, 0, sy, width, sh,
                dragX * (0.18 + t * 0.82) + micro, sy + dragY * (0.22 + t * 0.78),
                width * (1 + Math.abs(dragX) / Math.max(1, width) * slur * 0.65), sh);
            }
          }
          ctx.globalAlpha = 1;
          return;
        }

        var columns = Math.max(1, Math.min(24, Math.round(zones)));
        var rows = Math.max(2, Math.min(18, Math.round(columns * 0.68)));
        var cellW = width / columns, cellH = height / rows;
        var amplitude = Math.max(1, Math.sqrt(baseX * baseX + baseY * baseY)) * warp;
        for (var y = 0; y < rows; y++) for (var x = 0; x < columns; x++) {
          var sx = Math.floor(x * cellW), sy = Math.floor(y * cellH);
          var sw = Math.max(1, Math.ceil((x + 1) * cellW) - sx);
          var sh = Math.max(1, Math.ceil((y + 1) * cellH) - sy);
          var u = (x + 0.5) / columns, v = (y + 0.5) / rows;
          // Paper stretch is spatial, not a global shadow offset: pressure and
          // moisture accumulate differently across lateral ink zones.
          var bow = (u - 0.5) * (u - 0.5) * (u < 0.5 ? -1 : 1) * 3.4;
          var cross = Math.sin(v * Math.PI) * Math.sin(u * Math.PI * (1.2 + warp * 0.34));
          var noise = surfaceNoise01(x, y, params.seed + salt + 3319) * 2 - 1;
          var dx = baseX * (0.34 + u * 0.66) + amplitude * (bow * 0.22 + cross * 0.31 + noise * 0.08);
          var dy = baseY * (0.32 + v * 0.68) + amplitude * (Math.sin(u * Math.PI) * (v - 0.5) * 0.42 + noise * 0.06);
          ctx.globalAlpha = 0.72 + surfaceNoise01(y, x, params.seed + salt + 3323) * 0.24;
          ctx.drawImage(source, sx, sy, sw, sh, sx + dx, sy + dy, sw + 0.35, sh + 0.35);
        }
        ctx.globalAlpha = 1;
      }

      function dataMoshFrameIndex(hold, memory) {
        if (compositionState.enabled) {
          var phase = ((compositionState.phase % 1) + 1) % 1;
          return Math.floor(phase * Math.max(24, memory * hold * 2) / Math.max(1, hold));
        }
        return Math.floor(dataMoshFrame / Math.max(1, hold));
      }

      function blobTrackSurfaceSources(glyphs, width, height, pixelScale, L, density, vectorGain, visual) {
        var sources = [];
        if (blobTrackState.blobs.length) {
          for (var i = 0; i < blobTrackState.blobs.length; i++) {
            var blob = blobTrackState.blobs[i];
            var fade = Math.max(0.08, 1 - (blob.lost || 0) / Math.max(1, params.blobRevive + 1));
            var trailRaw = blobTrackState.trails[blob.id] || [];
            var trail = [];
            var trailStart = Math.max(0, trailRaw.length - Math.max(0, Math.round(params.blobTrails)));
            for (var t = trailStart; t < trailRaw.length; t++) trail.push({
              x: trailRaw[t].cx * width, y: trailRaw[t].cy * height,
              alpha: (t - trailStart + 1) / Math.max(1, trailRaw.length - trailStart)
            });
            sources.push({
              id: blob.id, x: blob.cx * width, y: blob.cy * height,
              r: Math.max(16, Math.sqrt(Math.max(0.001, blob.area || 0.01)) * Math.min(width, height) * 0.92),
              vx: (blob.vx || 0) * width, vy: (blob.vy || 0) * height,
              angle: blob.angle || 0, eccentricity: blob.eccentricity || 0,
              strength: fade, trail: trail, live: !(blob.lost || 0)
            });
          }
          return sources;
        }

        // Camera-off fallback is an inspectable demo field sourced from the
        // applied glyphs. It never moves the source letters and is replaced as
        // soon as real tracked blobs exist.
        var phase = compositionState.enabled
          ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2
          : surfaceFxPhase * Math.PI * 0.55;
        var sourceBudget = visual === 'mesh'
          ? Math.max(10, Math.min(18, Math.round(10 + density * 2)))
          : visual === 'contours'
            ? Math.max(6, Math.min(14, Math.round(6 + density * 2)))
            : visual === 'flow'
              ? Math.max(6, Math.min(12, Math.round(6 + density * 1.5)))
              : Math.max(4, Math.min(10, Math.round(4 + density * 1.4)));
        var nodesPerGlyph = visual === 'mesh' ? 3 : visual === 'flow' ? 2 : 1;
        var nodes = surfaceFieldNodesForGlyphs(glyphs, 'blobTrack', sourceBudget, nodesPerGlyph,
          pixelScale, L, 0, 0, 0);
        for (var n = 0; n < nodes.length; n++) {
          var orbit = phase * (0.28 + hash(n, 7, 3427) * 0.34)
            + n * 2.399963 + hash(n, params.seed % 97, 3433) * 1.4;
          var orbitRadius = nodes[n].r * (0.12 + hash(n, 9, 3435) * 0.18);
          var sourceX = nodes[n].x + Math.cos(orbit) * orbitRadius;
          var sourceY = nodes[n].y + Math.sin(orbit * 0.86) * orbitRadius;
          var angle = orbit + Math.PI * 0.5;
          var speed = (2.2 + hash(n, params.seed % 73, 3439) * 4.8) * (0.35 + vectorGain * 0.18);
          var demoTrail = [];
          var trailCount = Math.min(24, Math.max(0, Math.round(params.blobTrails)));
          for (var h = trailCount - 1; h >= 0; h--) {
            var ht = h / Math.max(1, trailCount - 1);
            demoTrail.push({
              x: sourceX - Math.cos(angle) * speed * h + Math.sin(angle + h * 0.18) * nodes[n].r * 0.08,
              y: sourceY - Math.sin(angle) * speed * h + Math.cos(angle + h * 0.16) * nodes[n].r * 0.08,
              alpha: 1 - ht * 0.84
            });
          }
          sources.push({
            id: n + 1, x: sourceX, y: sourceY,
            r: Math.max(18, nodes[n].r * (1.1 + density * 0.08)),
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            angle: angle, eccentricity: 0.62 + hash(n, 5, 3449) * 0.3,
            strength: nodes[n].strength, trail: demoTrail, live: false
          });
        }
        return sources;
      }

      function copyTransferSample(plane, width, height, x, y) {
        if (x < 0 || y < 0 || x >= width - 1 || y >= height - 1) return 0;
        var ix = x | 0, iy = y | 0, fx = x - ix, fy = y - iy, i = iy * width + ix;
        return (plane[i] * (1 - fx) + plane[i + 1] * fx) * (1 - fy)
          + (plane[i + width] * (1 - fx) + plane[i + width + 1] * fx) * fy;
      }

      function copyTransferPad(profile) {
        var n = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('copyGenerations', Math.round(profile.copyGenerations || 1), 0, 1, 48) : Math.max(1, Math.min(48, Math.round(profile.copyGenerations || 1))));
        return n * (Math.abs(profile.copyMotion || 0) / 48
          + Math.max(0, profile.copyInstability || 0) * 0.38
          + 2.45 + Math.max(0, profile.copyToner || 0) * 0.24) + 4;
      }

      function copyTransferStep(ink, mass, nextInk, nextMass, width, height, fields, options, generation) {
        var sample = copyTransferSample, sin = Math.sin, min = Math.min, max = Math.max;
        var radius = (0.45 + options.toner * 0.24) * options.units;
        var diagonal = radius * 0.7071067811865476;
        var wear = min(0.9, options.erosion * 0.038);
        var bloom = min(0.85, options.toner * 0.12);
        var phase = options.phase;
        for (var y = 0; y < height; y++) {
          var worldY = (y + options.y - options.dy) / options.units;
          var wobble = sin(worldY * 0.036 + phase + generation * 0.37)
            * sin(worldY * 0.009 - phase + options.seed * 0.13);
          var dx = (options.motion / 48 + options.instability * 0.28 * wobble) * options.units;
          var dy = options.instability * 0.1 * sin(phase + generation * 0.71) * options.units;
          for (var x = 0; x < width; x++) {
            var i = y * width + x, sx = x - dx, sy = y - dy;
            var a = sample(ink, width, height, sx, sy);
            var l = sample(ink, width, height, sx - radius, sy);
            var r = sample(ink, width, height, sx + radius, sy);
            var u = sample(ink, width, height, sx, sy - radius);
            var d = sample(ink, width, height, sx, sy + radius);
            var ul = sample(ink, width, height, sx - diagonal, sy - diagonal);
            var ur = sample(ink, width, height, sx + diagonal, sy - diagonal);
            var dl = sample(ink, width, height, sx - diagonal, sy + diagonal);
            var dr = sample(ink, width, height, sx + diagonal, sy + diagonal);
            var blurred = a * 0.5 + (l + r + u + d + ul + ur + dl + dr) * 0.0625;
            if (blurred < 0.00001) { nextInk[i] = nextMass[i] = 0; continue; }
            var weighted = sample(mass, width, height, sx, sy) * 0.5
              + (sample(mass, width, height, sx - radius, sy) + sample(mass, width, height, sx + radius, sy)
              + sample(mass, width, height, sx, sy - radius) + sample(mass, width, height, sx, sy + radius)
              + sample(mass, width, height, sx - diagonal, sy - diagonal) + sample(mass, width, height, sx + diagonal, sy - diagonal)
              + sample(mass, width, height, sx - diagonal, sy + diagonal) + sample(mass, width, height, sx + diagonal, sy + diagonal)) * 0.0625;
            var assignment = min(1, weighted / blurred);
            // Optical blur followed by toner development and edge starvation.
            a += (blurred - a) * 0.32;
            a += (max(a, l,r, u, d, ul, ur, dl, dr) - a) * bloom;
            a += (min(a, l, r, u, d, ul, ur, dl, dr) - a) * wear;
            a += a * (1 - a) * options.exposure * 0.48;
            a -= fields[i] * options.dust * (0.28 + a * 0.72);
            a = max(0, min(1, a));
            a += (a * a * (3 - 2 * a) - a) * 0.3;
            nextInk[i] = a; nextMass[i] = a * assignment;
          }
        }
      }

      function risoLoopMotion(phase) {
        // Project one closed orbit onto distinct plate/screen axes. All drives
        // are zero at rest and have the old local tangent there; the second
        // axis keeps their excursions without a shared ping-pong reversal.
        // Multiplying a wrapped angle by fractional rates only agrees at the
        // exact endpoints: it jumps immediately before each loop boundary.
        var traverse = Math.sin(phase);
        var returnArc = Math.PI * (1 - Math.cos(phase));
        return {
          area: traverse + returnArc * 0.82,
          field: traverse + returnArc * 0.68,
          screenA: traverse + returnArc * 0.9,
          screenB: traverse - returnArc * 0.75,
          registration: traverse + returnArc * 0.6
        };
      }

      function risoToneRadii() {
        var result = new Float32Array(257);
        for (var i = 1; i < 257; i++) {
          var low = 0, high = Math.SQRT1_2;
          for (var step = 0; step < 20; step++) {
            var r = (low + high) * 0.5, area = Math.PI * r * r;
            if (r > 0.5) area -= 4 * (r * r * Math.acos(0.5 / r) - 0.5 * Math.sqrt(r * r - 0.25));
            if (area < i / 256) low = r; else high = r;
          }
          result[i] = (low + high) * 0.5;
        }
        return result;
      }

      function risoScreenCoverage(x, y, pitch, tone, cos, sin, phase, radii, footprint) {
        footprint=footprint||1;var physicalPitch=pitch/footprint;
        tone = Math.max(0, Math.min(1, tone));
        if (tone <= 0 || tone >= 1 || physicalPitch < 2) return tone;
        var u = ((x * cos + y * sin + phase) / pitch % 1 + 1) % 1 - 0.5;
        var v = ((-x * sin + y * cos + phase * 0.41) / pitch % 1 + 1) % 1 - 0.5;
        var position = tone * 256, index = Math.min(255, Math.floor(position));
        var radius = radii[index] + (radii[index + 1] - radii[index]) * (position - index);
        var coverage = Math.max(0, Math.min(1, 0.5 + (radius - Math.hypot(u, v)) * physicalPitch));
        // Subpixel screens tend to their mean, not a flickering binary mask.
        var resolved = Math.max(0, Math.min(1, (physicalPitch - 2) / 2));
        return tone + (coverage - tone) * resolved;
      }

      function risoStrokeWidths(inside, width, height) {
        var span = new Float32Array(width * height);
        for (var y = 0; y < height; y++) {
          var x = 0;
          while (x < width) {
            if (!inside[y * width + x]) { x++; continue; }
            var start = x;
            while (x < width && inside[y * width + x]) x++;
            for (var fill = start; fill < x; fill++) span[y * width + fill] = (x - start) * 0.5;
          }
        }
        for (var col = 0; col < width; col++) {
          var row = 0;
          while (row < height) {
            if (!inside[row * width + col]) { row++; continue; }
            var first = row;
            while (row < height && inside[row * width + col]) row++;
            for (var r = first; r < row; r++) {
              var index = r * width + col;
              span[index] = Math.min(span[index], (row - first) * 0.5);
            }
          }
        }
        return span;
      }

      function risoDuotonePlates(source, width, height, units, settings, phase, shape) {
        var field = surfaceBoundaryDistance(shape || source, width, height);
        var a = new Uint8ClampedArray(source.length), b = new Uint8ClampedArray(source.length);
        if (!field.bounds) return { a: a, b: b };
        var widths = risoStrokeWidths(field.inside, width, height), radii = risoToneRadii();
        var depth = Math.max(0, settings.depth) * units, pitch = Math.max(0.01, settings.pitch * units);
        var pressure = settings.pressure, overlap = settings.overlap, balance = settings.balance;
        var motion = risoLoopMotion(phase), inkGain = 0.86 + pressure * 0.1;
        var angleA = Math.PI * 22 / 180, angleB = Math.PI * 67 / 180;
        var cosA = Math.cos(angleA), sinA = Math.sin(angleA), cosB = Math.cos(angleB), sinB = Math.sin(angleB);
        var originX = field.bounds[0], originY = field.bounds[1];
        for (var y = originY; y <= field.bounds[3]; y++) {
          for (var x = originX; x <= field.bounds[2]; x++) {
            var index = y * width + x, pixel = index * 4, alpha = source[pixel + 3] / 255;
            var distance = field.distance[index] + 0.5;
            if (alpha <= 0) continue;
            // Local stroke span, not the bounding box of the whole text: a
            // thin serif and a large stem both receive meaningful separation.
            var reach = Math.max(0.5, Math.min(depth, widths[index] || depth));
            var insideTone = depth > 0 ? Math.min(1, distance / reach) : 0.5;
            if (!field.inside[index]) insideTone = 0;
            var transition = insideTone * insideTone * (3 - 2 * insideTone);
            var toneB = Math.max(0, Math.min(1, 0.08 + transition * 0.84 - balance * 0.65));
            var toneA = Math.max(0, Math.min(1, 1 - toneB + overlap * 0.36));
            toneB = Math.min(1, toneB + overlap * 0.36);
            toneA = Math.min(1, toneA * inkGain); toneB = Math.min(1, toneB * inkGain);
            var px = x - originX, py = y - originY;
            var coverageA = risoScreenCoverage(px, py, pitch, toneA, cosA, sinA, motion.screenA * pitch * 0.07, radii);
            var coverageB = risoScreenCoverage(px, py, pitch, toneB, cosB, sinB, pitch * 0.31 - motion.screenB * pitch * 0.05, radii);
            // Independent masters have independent pinholes; one shared
            // dropout mask incorrectly punches both inks at identical sites.
            var noiseA = surfaceNoise01(Math.floor(px / units), Math.floor(py / units), settings.seed + 2281);
            var noiseB = surfaceNoise01(Math.floor(px / units), Math.floor(py / units), settings.seed + 2287);
            var lossA = noiseA < settings.grain * 0.09 ? 0.08 : 1 - settings.grain * 0.1 * (1 - noiseA);
            var lossB = noiseB < settings.grain * 0.09 ? 0.08 : 1 - settings.grain * 0.1 * (1 - noiseB);
            a[pixel] = a[pixel + 1] = a[pixel + 2] = b[pixel] = b[pixel + 1] = b[pixel + 2] = 255;
            a[pixel + 3] = Math.round(255 * alpha * coverageA * lossA);
            b[pixel + 3] = Math.round(255 * alpha * coverageB * lossB);
          }
        }

        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext,unused=new Float64Array(4);function shade(x,y,rgbaA,rgbaB,footprint){
            var index = y * width + x, pixel = index * 4, alpha = RC.rasterSample(source,width,height,x,y,3) / 255;
            var distance = RC.sample(field.distance,width,height,x,y) + 0.5;
            if (alpha <= 0) return;
            // Local stroke span, not the bounding box of the whole text: a
            // thin serif and a large stem both receive meaningful separation.
            var reach = Math.max(0.5, Math.min(depth, RC.sample(widths,width,height,x,y) || depth));
            var insideTone = depth > 0 ? Math.min(1, distance / reach) : 0.5;
            if (!(RC.sample(field.inside,width,height,x,y)>=.5)) insideTone = 0;
            var transition = insideTone * insideTone * (3 - 2 * insideTone);
            var toneB = Math.max(0, Math.min(1, 0.08 + transition * 0.84 - balance * 0.65));
            var toneA = Math.max(0, Math.min(1, 1 - toneB + overlap * 0.36));
            toneB = Math.min(1, toneB + overlap * 0.36);
            toneA = Math.min(1, toneA * inkGain); toneB = Math.min(1, toneB * inkGain);
            var px = x - originX, py = y - originY;
            var coverageA = risoScreenCoverage(px, py, pitch, toneA, cosA, sinA, motion.screenA * pitch * 0.07, radii,footprint);
            var coverageB = risoScreenCoverage(px, py, pitch, toneB, cosB, sinB, pitch * 0.31 - motion.screenB * pitch * 0.05, radii,footprint);
            // Independent masters have independent pinholes; one shared
            // dropout mask incorrectly punches both inks at identical sites.
            var noiseA = surfaceNoise01(Math.floor(px / units), Math.floor(py / units), settings.seed + 2281);
            var noiseB = surfaceNoise01(Math.floor(px / units), Math.floor(py / units), settings.seed + 2287);
            var lossA = noiseA < settings.grain * 0.09 ? 0.08 : 1 - settings.grain * 0.1 * (1 - noiseA);
            var lossB = noiseB < settings.grain * 0.09 ? 0.08 : 1 - settings.grain * 0.1 * (1 - noiseB);
            rgbaA[0] = rgbaA[1] = rgbaA[2] = rgbaB[0] = rgbaB[1] = rgbaB[2] = 255;
            rgbaA[3] = Math.round(255 * alpha * coverageA * lossA);
            rgbaB[3] = Math.round(255 * alpha * coverageB * lossB);}RC.field(a,function(px,py,rgba,footprint){shade(px-.5,py-.5,rgba,unused,footprint);});RC.field(b,function(px,py,rgba,footprint){shade(px-.5,py-.5,unused,rgba,footprint);});}
        return { a: a, b: b };
      }

      function slitTimeCoordinateV31(mode, normalized, phase, frequency, nonlinearity, band) {
        var tau = Math.PI * 2;
        var cycle = normalized * frequency * tau;
        var value;
        if (mode === 'staircase') {
          var slabCount = Math.max(2, Math.min(36, Math.round(3 + frequency * 1.2 + nonlinearity * 2.2)));
          var temporalWave = 0.5 + Math.sin(cycle + phase) * 0.5;
          var slabIndex = Math.round(temporalWave * (slabCount - 1));
          value = slabIndex / Math.max(1, slabCount - 1) * 2 - 1;
          value += (band % 2 ? -1 : 1) * Math.sin(phase * 2) * nonlinearity * 0.025;
        } else if (mode === 'fold') {
          var seam = 0.5 + Math.sin(phase) * Math.min(0.2, 0.045 + nonlinearity * 0.032);
          var side = normalized < seam ? -1 : 1;
          var sideSpan = side < 0 ? Math.max(0.08, seam) : Math.max(0.08, 1 - seam);
          var distance = Math.min(1, Math.abs(normalized - seam) / sideSpan);
          var collision = Math.cos(distance * Math.PI * (0.7 + frequency * 0.22) + phase * side);
          var hinge = Math.sin(distance * Math.PI * 2 + phase * 2) * (0.12 + nonlinearity * 0.055);
          value = side * collision * (0.66 + nonlinearity * 0.07) + hinge;
        } else if (mode === 'feedback') {
          value = Math.sin(cycle + phase);
          var iterations = Math.min(7, 2 + Math.floor(nonlinearity * 1.25));
          for (var iteration = 0; iteration < iterations; iteration++) {
            value = Math.sin(value * Math.PI * (1.08 + nonlinearity * 0.25)
              + cycle * (0.16 + iteration * 0.045) - phase * (iteration + 1));
          }
          value = value * 0.78 + Math.sin(cycle * 0.27 + phase * 2 + band * 0.11) * 0.22;
        } else {
          value = Math.sin(cycle + phase) * 0.62
            + Math.sin(cycle * (1.54 + nonlinearity * 0.11) - phase * 2) * (0.2 + nonlinearity * 0.045)
            + Math.cos(cycle * 0.37 + phase * 3) * (0.08 + nonlinearity * 0.035);
        }
        return Math.max(-1, Math.min(1, value));
      }

      function slitTemporalSamplesV31(value, memory, discrete) {
        var frames = Math.max(1, Math.min(64, Math.round(memory)));
        if (frames <= 1) return [{ time: 0, weight: 1 }];
        var position = (Math.max(-1, Math.min(1, value)) * 0.5 + 0.5) * (frames - 1);
        if (discrete) {
          var selected = Math.round(position);
          return [{ time: selected / (frames - 1) * 2 - 1, weight: 1 }];
        }
        var lower = Math.floor(position);
        var upper = Math.min(frames - 1, lower + 1);
        var mix = position - lower;
        if (upper === lower || mix <= 0.001) {
          return [{ time: lower / (frames - 1) * 2 - 1, weight: 1 }];
        }
        return [
          { time: lower / (frames - 1) * 2 - 1, weight: 1 - mix },
          { time: upper / (frames - 1) * 2 - 1, weight: mix }
        ];
      }

      function slitDrawTemporalStateV31(ctx, mask, clipX, clipY, clipW, clipH, options) {
        if (clipW <= 0.01 || clipH <= 0.01 || options.alpha <= 0.001) return;
        var vertical = options.vertical;
        var time = options.time;
        var nonlinearity = options.nonlinearity;
        var iteration = options.iteration || 0;
        var phase = options.phase;
        var normalized = options.normalized;
        var mode = options.mode;
        var travel = options.travel;
        var recursion = iteration > 0 ? Math.pow(0.84 + nonlinearity * 0.018, iteration) : 1;
        var amplitude = Math.min(0.94, 0.34 + nonlinearity * 0.135);
        if (mode === 'staircase') amplitude = Math.min(0.96, 0.56 + nonlinearity * 0.09);
        else if (mode === 'fold') amplitude = Math.min(0.92, 0.44 + nonlinearity * 0.11);
        else if (mode === 'feedback') amplitude = Math.min(0.9, 0.38 + nonlinearity * 0.105);
        var primary = travel * time * amplitude * recursion;
        var tangent = Math.sin(phase * (iteration + 1) + normalized * Math.PI * 2
          + iteration * 0.83) * Math.abs(travel) * (0.012 + nonlinearity * 0.014);
        var angle = time * nonlinearity * 0.018;
        var shear = Math.sin(phase * 2 + normalized * Math.PI * 2) * nonlinearity * 0.018;
        var scalePrimary = 1 + time * nonlinearity * 0.045;
        var scaleTangent = 1 + Math.sin(phase + normalized * Math.PI * 2) * nonlinearity * 0.012;

        if (mode === 'staircase') {
          tangent = (options.band % 2 ? -1 : 1) * Math.abs(travel) * nonlinearity * 0.008;
          angle = 0;
          shear = 0;
          scalePrimary = 1 + Math.abs(time) * nonlinearity * 0.018;
        } else if (mode === 'fold') {
          var foldSide = options.foldSide || 1;
          var foldNear = 1 - Math.min(1, options.foldDistance == null ? 1 : options.foldDistance);
          tangent += foldSide * Math.abs(travel) * foldNear * (0.025 + nonlinearity * 0.025);
          angle = foldSide * (0.012 + nonlinearity * 0.018) * foldNear + time * nonlinearity * 0.01;
          shear = foldSide * nonlinearity * 0.022 * foldNear;
          scaleTangent = Math.max(0.58, 1 - foldNear * (0.06 + nonlinearity * 0.045));
          scalePrimary = 1 + Math.abs(time) * nonlinearity * 0.052;
        } else if (mode === 'feedback') {
          var orbit = Math.abs(travel) * iteration * (0.012 + nonlinearity * 0.008);
          tangent += Math.cos(phase * (iteration + 1) + time * Math.PI) * orbit;
          primary += Math.sin(phase * (iteration + 2) - time * Math.PI) * orbit;
          angle += (iteration % 2 ? -1 : 1) * iteration * (0.035 + nonlinearity * 0.018);
          scalePrimary *= recursion;
          scaleTangent *= recursion;
          shear += (iteration % 2 ? -1 : 1) * nonlinearity * iteration * 0.009;
        }

        scalePrimary = Math.max(0.34, Math.min(1.9, scalePrimary));
        scaleTangent = Math.max(0.34, Math.min(1.9, scaleTangent));
        var centerX = mask.width * 0.5;
        var centerY = mask.height * 0.5;
        var moveX = vertical ? tangent : primary;
        var moveY = vertical ? primary : tangent;
        var scaleX = vertical ? scaleTangent : scalePrimary;
        var scaleY = vertical ? scalePrimary : scaleTangent;

        ctx.save();
        ctx.beginPath();
        ctx.rect(clipX, clipY, clipW, clipH);
        ctx.clip();
        ctx.globalAlpha = Math.max(0, Math.min(1, options.alpha));
        ctx.globalCompositeOperation = options.composite || 'source-over';
        ctx.translate(centerX + moveX, centerY + moveY);
        ctx.rotate(angle);
        if (vertical) ctx.transform(1, shear, 0, 1, 0, 0);
        else ctx.transform(1, 0, shear, 1, 0, 0);
        ctx.scale(scaleX, scaleY);
        ctx.drawImage(mask, -centerX, -centerY);
        ctx.restore();
      }

      function prepareSigilComponentsV31(glyphs, width, height, pixelScale, L, fm, componentBudget) {
        var active = [];
        for (var glyphIndex = 0; glyphIndex < glyphs.length; glyphIndex++) {
          var strength = surfaceGlyphStrength(glyphs[glyphIndex], 'sigilForge');
          if (strength > 0.002 && (glyphs[glyphIndex].opacity == null || glyphs[glyphIndex].opacity > 0.002)) {
            active.push({ glyph: glyphs[glyphIndex], index: glyphIndex, strength: strength });
          }
        }
        if (!active.length) return [];
        var cap = Math.min(24, active.length, Math.max(1, Math.round(componentBudget || active.length)));
        var components = [];
        for (var componentIndex = 0; componentIndex < cap; componentIndex++) {
          // A midpoint sample keeps the selected components in source order
          // while representing the whole phrase even at the one-component
          // minimum. The control therefore changes anatomy, not only ornament.
          var activeIndex = Math.min(active.length - 1,
            Math.floor((componentIndex + 0.5) * active.length / cap));
          var entry = active[activeIndex];
          components.push({
            glyph: entry.glyph,
            glyphIndex: entry.index,
            strength: entry.strength,
            node: surfaceGlyphNode(entry.glyph, 'sigilForge', pixelScale, L, 0, 0, 0, entry.index)
          });
        }
        return components;
      }

      function sigilComponentTransformV31(ctx, component, targetX, targetY, rotation, scaleX, scaleY,
        alpha, embolden, pixelScale, L, fm) {
        if (alpha <= 0.002) return;
        var g = component.glyph;
        ctx.save();
        ctx.translate(targetX, targetY);
        ctx.rotate(rotation || 0);
        ctx.scale(scaleX, scaleY);
        ctx.translate(-component.node.x, -component.node.y);
        ctx.transform(pixelScale, 0, 0, pixelScale, 0, 0);
        ctx.translate(L.dx, L.dy);
        ctx.scale(L.s, L.s);
        ctx.translate(g.ox + g.tx, g.oy + g.ty);
        ctx.rotate((g.rot || 0) * Math.PI / 180);
        ctx.transform(1, Math.tan((g.skewY || 0) * Math.PI / 180),
          Math.tan((g.skewX || 0) * Math.PI / 180), 1, 0, 0);
        ctx.scale(g.scaleX, g.scaleY);
        ctx.translate(-g.ox, -g.oy);
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha)) * (g.opacity == null ? 1 : g.opacity);
        ctx.font = g.fontAxes ? glyphFontSpec(g, params.fontSize).font : params.fontWeight + ' ' + params.fontSize + 'px ' + params.fontFamily;
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#fff';
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        var transformedScale = pixelScale * L.s * Math.sqrt(Math.max(0.001,
          Math.abs(scaleX * scaleY * g.scaleX * g.scaleY)));
        ctx.lineWidth = Math.max(0, embolden || 0) / Math.max(0.001, transformedScale);
        if (params.vertical) {
          var glyphCenterX = g.x + g.w / 2;
          var glyphCenterY = g.y + g.h / 2;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          if (!g.upright) {
            ctx.translate(glyphCenterX, glyphCenterY);
            ctx.rotate(Math.PI / 2);
            if (embolden > 0.01) ctx.strokeText(g.ch, 0, 0);
            ctx.fillText(g.ch, 0, 0);
          } else {
            if (embolden > 0.01) ctx.strokeText(g.ch, glyphCenterX, glyphCenterY);
            ctx.fillText(g.ch, glyphCenterX, glyphCenterY);
          }
        } else {
          ctx.textAlign = g.grid ? 'center' : 'left';
          ctx.textBaseline = 'alphabetic';
          var glyphX = g.grid ? g.x + g.w / 2 : g.x;
          var glyphY = g.y + baselineOffset(g, fm);
          if (embolden > 0.01) ctx.strokeText(g.ch, glyphX, glyphY);
          ctx.fillText(g.ch, glyphX, glyphY);
        }
        ctx.restore();
      }

      function sigilSuperellipsePathV31(ctx, centerX, centerY, radiusX, radiusY, exponent, steps, rotation) {
        var power = 2 / Math.max(1.25, exponent || 2);
        var cosRotation = Math.cos(rotation || 0), sinRotation = Math.sin(rotation || 0);
        ctx.beginPath();
        for (var step = 0; step <= steps; step++) {
          var angle = step / steps * Math.PI * 2;
          var cos = Math.cos(angle), sin = Math.sin(angle);
          var localX = Math.sign(cos) * Math.pow(Math.abs(cos), power) * radiusX;
          var localY = Math.sign(sin) * Math.pow(Math.abs(sin), power) * radiusY;
          var x = centerX + localX * cosRotation - localY * sinRotation;
          var y = centerY + localX * sinRotation + localY * cosRotation;
          if (!step) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
      }

      function sigilRosettePathV31(ctx, centerX, centerY, radius, lobes, depth, phase) {
        var safeLobes = Math.max(3, Math.round(lobes || 6));
        var steps = Math.max(72, safeLobes * 18);
        ctx.beginPath();
        for (var step = 0; step <= steps; step++) {
          var angle = step / steps * Math.PI * 2;
          var primary = Math.cos(angle * safeLobes + (phase || 0));
          var secondary = Math.cos(angle * safeLobes * 2 - (phase || 0) * 0.63);
          var localRadius = radius * (1 + depth * (primary + secondary * 0.22));
          var x = centerX + Math.cos(angle) * localRadius;
          var y = centerY + Math.sin(angle) * localRadius;
          if (!step) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
      }

      function sigilCurveLinkV31(ctx, a, b, width, bend, alpha, salt) {
        var dx = b.x - a.x, dy = b.y - a.y;
        var distance = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
        var nx = -dy / distance, ny = dx / distance;
        var signedBend = bend * (hash(salt, params.seed % 101, 3511) > 0.5 ? 1 : -1);
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx.lineWidth = Math.max(0.2, width);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.bezierCurveTo(a.x + dx * 0.32 + nx * signedBend, a.y + dy * 0.32 + ny * signedBend,
          a.x + dx * 0.68 - nx * signedBend * 0.38, a.y + dy * 0.68 - ny * signedBend * 0.38,
          b.x, b.y);
        ctx.stroke();
        ctx.restore();
      }

      function sigilCutV31(ctx, x, y, radiusX, radiusY, rotation, kind, alpha) {
        if (radiusX <= 0.05 || radiusY <= 0.05 || alpha <= 0.002) return;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotation || 0);
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx.beginPath();
        if (kind === 1) {
          ctx.moveTo(0, -radiusY);
          ctx.lineTo(radiusX, 0);
          ctx.lineTo(0, radiusY);
          ctx.lineTo(-radiusX, 0);
          ctx.closePath();
        } else if (kind === 2) {
          ctx.rect(-radiusX, -radiusY, radiusX * 2, radiusY * 2);
        } else {
          ctx.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.restore();
      }

      function thornSpine(curve, t) {
        var s = 1 - t, a = curve[0], b = curve[1], c = curve[2], d = curve[3];
        var dx = 3 * (s * s * (b.x - a.x) + 2 * s * t * (c.x - b.x) + t * t * (d.x - c.x));
        var dy = 3 * (s * s * (b.y - a.y) + 2 * s * t * (c.y - b.y) + t * t * (d.y - c.y));
        var norm = Math.hypot(dx, dy) || 1;
        return { x: s * s * s * a.x + 3 * s * s * t * b.x + 3 * s * t * t * c.x + t * t * t * d.x,
          y: s * s * s * a.y + 3 * s * s * t * b.y + 3 * s * t * t * c.y + t * t * t * d.y, nx: -dy / norm, ny: dx / norm };
      }

      function thornOrganPaths(root, length, rootWidth, curl, family, branches, armor, seed) {
        var nx = root.nx, ny = root.ny, tx = -ny, ty = nx;
        var handed = hash(seed, 7, params.seed + 1871) < 0.5 ? -1 : 1;
        var bend = curl * handed;
        function local(u, v) { return { x: root.x + nx * u + tx * v, y: root.y + ny * u + ty * v }; }
        var curve = family === 'hook'
          ? [local(-rootWidth * 0.45, 0), local(length * 0.62, -length * bend * 0.09),
            local(length * 1.2, length * (0.35 * handed + bend * 0.25)), local(length * 0.48, length * (0.46 * handed + bend * 0.18))]
          : [local(-rootWidth * 0.45, 0), local(length * 0.32, length * bend * (family === 'vine' ? -0.16 : 0.05)),
            local(length * 0.73, length * bend * (family === 'vine' ? 0.24 : 0.14)), local(length, length * bend * 0.1)];
        var paths = [{ curve: curve, width: rootWidth, role: 'main' }];
        var count = family === 'vine' ? Math.min(6, Math.floor(branches * 1.5 + 0.5))
          : family === 'trident' ? 2 : family === 'hook' ? Math.min(2, Math.floor(branches)) : 0;
        for (var i = 0; i < count; i++) {
          var at = family === 'trident' ? 0.47 : 0.28 + i / Math.max(1, count) * 0.48;
          var joint = thornSpine(curve, at), sign = i % 2 ? -1 : 1;
          var extent = length * (family === 'trident' ? 0.53 : 0.22 + hash(seed, i, 1877) * 0.12);
          var alongX = joint.ny, alongY = -joint.nx, sideX = joint.nx * sign, sideY = joint.ny * sign;
          if (family === 'hook') { alongX *= -0.6; alongY *= -0.6; }
          var end = { x: joint.x + alongX * extent * 0.72 + sideX * extent * 0.6,
            y: joint.y + alongY * extent * 0.72 + sideY * extent * 0.6 };
          paths.push({ curve: [{ x: joint.x, y: joint.y },
            { x: joint.x + alongX * extent * 0.15, y: joint.y + alongY * extent * 0.15 },
            { x: end.x - alongX * extent * 0.32 + sideX * extent * 0.2, y: end.y - alongY * extent * 0.32 + sideY * extent * 0.2 }, end],
            width: rootWidth * (family === 'vine' ? 0.46 : 0.58) * Math.pow(1 - at, 0.55), role: 'branch' });
        }
        paths.forEach(function (path) {
          var steps = Math.min(96, Math.max(20, Math.ceil(length / 4)));
          var left = [], right = [], keel = [];
          for (var step = 0; step <= steps; step++) {
            var t = step / steps, p = thornSpine(path.curve, t);
            var width = path.width * Math.pow(1 - t, 1.45) * (1 + Math.sin(Math.PI * t) * (0.3 + armor * 0.08));
            left.push({ x: p.x + p.nx * width, y: p.y + p.ny * width });
            right.push({ x: p.x - p.nx * width, y: p.y - p.ny * width });
            if (t > 0.1 && t < 0.82) keel.push({ x: p.x, y: p.y, nx: p.nx, ny: p.ny, width: width });
          }
          path.outline = left.concat(right.reverse());
          path.keel = keel;
        });
        return paths;
      }

      function thornContourRoots(data, strengthData, width, height, units, length, weight, density, clearance, seed) {
        function alpha(x, y, field) {
          x = Math.round(x); y = Math.round(y);
          return x < 0 || x >= width || y < 0 || y >= height ? 0 : field[(y * width + x) * 4 + 3] / 255;
        }
        var minX = width, minY = height, maxX = -1, maxY = -1;
        for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
          if (data[(y * width + x) * 4 + 3] < 128) continue;
          minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
        if (maxX < minX) return [];
        var step = Math.max(1, Math.round(2 * units)), reach = Math.max(2, units * 2.5), candidates = [];
        for (var cy = minY; cy <= maxY; cy += step) for (var cx = minX; cx <= maxX; cx += step) {
          if (alpha(cx, cy, data) < 0.5) continue;
          var gx = 0, gy = 0;
          for (var tap = -1; tap <= 1; tap++) {
            gx += alpha(cx + reach, cy + tap * reach * 0.5, data) - alpha(cx - reach, cy + tap * reach * 0.5, data);
            gy += alpha(cx + tap * reach * 0.5, cy + reach, data) - alpha(cx + tap * reach * 0.5, cy - reach, data);
          }
          var norm = Math.hypot(gx, gy);
          if (norm < 0.15) continue; // no global-centroid fallback across letters
          var nx = -gx / norm, ny = -gy / norm, boundary = 0;
          while (boundary < reach * 2 && alpha(cx + nx * boundary, cy + ny * boundary, data) >= 0.5) boundary += 0.5;
          if (boundary >= reach * 2) continue;
          var rx = cx + nx * (boundary - 0.25), ry = cy + ny * (boundary - 0.25);
          var free = length;
          for (var d = reach * 1.5; d < length; d += Math.max(1, length / 24)) {
            if (alpha(rx + nx * d, ry + ny * d, data) > 0.2) { free = d; break; }
          }
          if (free < length * clearance * 0.72) continue;
          var depth = units;
          while (depth < weight * 3 && alpha(rx - nx * depth, ry - ny * depth, data) > 0.5) depth += units;
          var rootWidth = Math.min(weight, Math.max(units * 0.7, depth * 0.65));
          var strength = 0;
          for (var sy = -1; sy <= 1; sy++) for (var sx = -1; sx <= 1; sx++) {
            strength = Math.max(strength, alpha(cx + sx * units, cy + sy * units, strengthData));
          }
          if (strength <= 0.002) continue;
          var key = Math.round((rx - minX) / units * 0.7 + (ry - minY) / units * 1.3);
          candidates.push({ x: rx, y: ry, nx: nx, ny: ny, width: rootWidth, strength: strength,
            key: key, score: hash(key, seed % 137, 1861) + Math.min(1, free / Math.max(1, length)) * 0.12 });
        }
        candidates.sort(function (a, b) { return b.score - a.score || a.key - b.key; });
        var roots = [], limit = Math.min(160, Math.max(4, Math.round(8 + density * 22)));
        var gap = Math.max(6 * units, weight * 3.4, length * 0.24) / Math.sqrt(Math.max(0.1, density));
        for (var i = 0; i < candidates.length && roots.length < limit; i++) {
          var p = candidates[i], separated = true;
          for (var j = 0; j < roots.length; j++) {
            if (Math.hypot(p.x - roots[j].x, p.y - roots[j].y) < gap) { separated = false; break; }
          }
          if (separated) roots.push(p);
        }
        return roots;
      }

      function thornRootedExtent(profile) {
        // Cubic hull + branched tips, in world units. Rooted intensity fades
        // ink, not geometry: do not crop low-opacity tips to a shorter pad.
        var length = Math.max(0, profile.thornLength || 0);
        return length > 0.05 ? length * 2 + (profile.thornStroke || 0) * 4 + 12 : 0;
      }

      function structuralSurfaceRenderer(id) {
        return function (ctx, glyphs, width, height, pixelScale, L, fm) {
          if (typeof TypeDeformerStructuralOperators === 'undefined') return false;
          var phase = compositionState.enabled
            ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2
            : surfaceFxPhase * Math.PI * 2;
          return TypeDeformerStructuralOperators.render(id, ctx, glyphs, width, height, pixelScale, L, fm, {
            params: params,
            phase: phase,
            sourceText: renderedSourceText,
            strength: surfaceGlyphStrength,
            aggregate: surfaceAggregate,
            choice: surfaceChoice,
            color: surfaceEffectColor,
            scratch: surfaceScratch,
            buildMask: buildSurfaceMask,
            drawGlyph: drawSurfaceGlyph
          });
        };
      }

      function fieldMaterialSourceKey(g, fm) { return surfaceGlyphTextSpec(g, fm); }

      function fieldMaterialRenderer(id) {
        return function(ctx, glyphs, width, height, pixelScale, L, fm) {
          return TypeDeformerFieldMaterials.render(id, ctx, glyphs, width, height, pixelScale, L, fm, {
            params: params, renderContext: globalThis.TypeDeformerRenderContext && globalThis.TypeDeformerRenderContext.current(), strength: surfaceGlyphStrength, color: surfaceEffectColor,
            scratch: surfaceScratch, drawGlyph: drawSurfaceGlyph, sourceKey: fieldMaterialSourceKey, traceContours: spectralTraceContours, font: glyphFontSpec, charInfo: charInfo, bounds: contentBounds
          });
        };
      }

      function conditionSurfaceRenderer(id) {
        return function (ctx, glyphs, width, height, pixelScale, L, fm) {
          if (typeof TypeDeformerConditionsOperators === 'undefined') return false;
          var phase = compositionState.enabled
            ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2
            : surfaceFxPhase * Math.PI * 2;
          return TypeDeformerConditionsOperators.render(id, ctx, glyphs, width, height, pixelScale, L, fm, {
            params: params,
            phase: phase,
            sourceText: renderedSourceText,
            rubyStatus: reportRubyMappings,
            strength: surfaceGlyphStrength,
            aggregate: surfaceAggregate,
            choice: surfaceChoice,
            color: surfaceEffectColor,
            scratch: surfaceScratch,
            buildMask: buildSurfaceMask,
            drawGlyph: drawSurfaceGlyph
          });
        };
      }

      function lerpHex(a, b, t) {
        function channel(hex, at) { return parseInt(hex.slice(at, at + 2), 16); }
        t = Math.max(0, Math.min(1, t));
        var r = Math.round(channel(a, 1) + (channel(b, 1) - channel(a, 1)) * t);
        var g = Math.round(channel(a, 3) + (channel(b, 3) - channel(a, 3)) * t);
        var bl = Math.round(channel(a, 5) + (channel(b, 5) - channel(a, 5)) * t);
        return '#' + [r, g, bl].map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
      }

      function orientedCompositionPoint(x, y, width, height) {
        if (!compositionAxisIsVertical()) return { x: x, y: y, rotation: 0 };
        return { x: width - (y / Math.max(1, height)) * width, y: (x / Math.max(1, width)) * height, rotation: 90 };
      }

      function generateCascadeAutomaton(tokens, width, height, runtime) {
        var c = compositionState.cascade;
        var rows = c.rows, cols = cascadeGridColumns(c.cells, rows);
        var backgroundLimited = cols < c.cells;
        var cellW = width / cols, cellH = height / rows;
        var gap = Math.min(cellW, cellH) * c.gap * 0.5;
        var rule = c.rule === 'custom' ? c.customRule : Number(c.rule);
        var clock = runtime && runtime.clock ? runtime.clock : createLoopClock(compositionState.phase, 240, compositionState.seed, compositionState.direction);
        // A deterministic forward/back generation timeline removes the
        // discontinuity of resetting a non-reversible automaton at turn 1.
        var generationSpan = Math.max(2, c.generationCount);
        var pingTurn = clock.turn * 2;
        var timelineTurn = c.pingPong ? (pingTurn <= 1 ? pingTurn : 2 - pingTurn) : clock.turn;
        var generationPosition = timelineTurn * (generationSpan - 1);
        var generationIndex = Math.floor(generationPosition);
        var generationMix = (generationPosition - generationIndex) * c.generationBlend;
        var cells = cascadeSeed(tokens, cols);
        var nextCells;
        if (c.automatonMode === 'life2d') {
          var board = new Array(rows * cols);
          for (var bi = 0; bi < board.length; bi++) {
            var seedToken = tokens[bi % tokens.length];
            board[bi] = cascadeSeed([seedToken], 1)[0] ^ (hash(bi, compositionState.seed, 71) > 0.72 ? 1 : 0);
          }
          for (var lifePre = 0; lifePre < generationIndex; lifePre++) board = cascadeLifeStep(board, rows, cols, c.lifeRule);
          var nextBoard = cascadeLifeStep(board, rows, cols, c.lifeRule);
          cells = board;
          nextCells = nextBoard;
        } else {
          for (var pre = 0; pre < generationIndex; pre++) cells = cascadeAutomatonStep(cells, rule);
          nextCells = cascadeAutomatonStep(cells, rule);
        }
        var glyphs = [], bands = [], instanceIndex = 0, limit = compositionLimit();
        cascadeBackdrop(width, height, bands);
        for (var row = 0; row < rows; row++) {
          var renderCells = cells;
          var renderNextCells = nextCells;
          if (c.automatonMode !== 'life2d') {
            for (var rowAdvance = 0; rowAdvance < row; rowAdvance++) {
              renderCells = cascadeAutomatonStep(renderCells, rule);
              renderNextCells = cascadeAutomatonStep(renderNextCells, rule);
            }
          }
          for (var col = 0; col < cols; col++) {
            var sourceCol = c.mirror && row > (rows - 1) / 2 ? cols - 1 - col : col;
            var cellIndex = c.automatonMode === 'life2d' ? row * cols + sourceCol : sourceCol;
            var currentState = renderCells[cellIndex] ? 1 : 0;
            var nextState = renderNextCells[cellIndex] ? 1 : 0;
            var stateAmount = currentState + (nextState - currentState) * generationMix;
            var state = stateAmount >= 0.5 ? 1 : 0;
            var token = tokens[(row * cols + col) % tokens.length];
            var fill = cascadeColorFor(row, col, state, token, rows, cols);
            var cellOpacity = c.opacity * (0.2 + stateAmount * 0.8);
            if (c.bands) bands.push(cascadeShapeItem(col * cellW + gap, row * cellH + gap, cellW - gap * 2, cellH - gap * 2, fill, cellOpacity, state ? 0 : c.round * 45, state));
            if (!token.space) {
              if (instanceIndex >= limit) {
                cascadePostProcess(width, height, bands);
                return { glyphs: glyphs, bands: bands, limited: true };
              }
              var glyph = compositionGlyph(
                token, (col + 0.5) * cellW, (row + 0.5) * cellH,
                Math.max(0.02, cellW / Math.max(1, params.fontSize * 0.72)),
                Math.max(0.02, cellH * (1 - c.lineSpace) / Math.max(1, params.fontSize * params.lineHeight)),
                0, cascadeGlyphColor(fill, state), 0.3 + stateAmount * 0.7, instanceIndex++
              );
              if (glyph) glyphs.push(glyph);
            }
          }
        }
        cascadePostProcess(width, height, bands);
        return { glyphs: glyphs, bands: bands, limited: backgroundLimited };
      }

      function generateCascadeCircuit(tokens, width, height, runtime) {
        var c = compositionState.cascade;
        var cols = Math.max(8, Math.round(c.cells * c.circuitDensity));
        var rows = c.rows, cellW = width / cols, rowH = height / rows;
        var glyphs = [], bands = [], instanceIndex = 0, limit = compositionLimit();
        var clock = runtime && runtime.clock ? runtime.clock : createLoopClock(compositionState.phase, 240, compositionState.seed, compositionState.direction);
        var inputs = runtime && runtime.inputs ? runtime.inputs : createCompositionInputBus(tokens, width, height, clock);
        var phase = clock.angle;
        cascadeBackdrop(width, height, bands);
        for (var row = 0; row < rows; row++) {
          var baseY = (row + 0.5) * rowH;
          var points = [{ x: 0, y: baseY }];
          for (var col = 0; col < cols; col++) {
            var token = tokens[(row * cols + col) % tokens.length];
            var cp = cascadeTokenCode(token);
            var x = (col + 0.5) * cellW;
            var signal = Math.sin(phase + row * 0.83 + col * 0.51 + (cp % 17));
            if (inputs.pointer.active && c.pointerInject) {
              var pointerFalloff = Math.max(0, 1 - Math.abs(x - inputs.pointer.px) / Math.max(1, width * 0.3));
              signal += (inputs.pointer.py / Math.max(1, height) - 0.5) * pointerFalloff * 2;
            }
            var routeY = baseY + signal * rowH * c.amplitude * 0.28;
            points.push({ x: x, y: points[points.length - 1].y });
            points.push({ x: x, y: routeY });
            var active = hash(row, cp || col, col + 23) < c.circuitDensity;
            if (active && c.bands) {
              var pulse = (Math.sin(phase * 2 + col * 0.72 - row * 0.4) + 1) * 0.5;
              var fill = cascadeColorFor(row, col, pulse > 1 - c.pulse ? 1 : 0, token, rows, cols);
              var routerBoost = col % Math.max(1, Math.round(cols / Math.max(1, c.circuitRouters))) === 0 ? 1.45 : 1;
              var nodeSize = Math.min(cellW, rowH) * (0.22 + pulse * c.pulse * 0.48) * routerBoost;
              bands.push(cascadeShapeItem(x - nodeSize / 2, routeY - nodeSize / 2, nodeSize, nodeSize, fill, c.opacity, signal * 20, active ? 1 : 0));
              if (c.packetTrail > 0) {
                var trail = cellW * (0.5 + c.packetTrail * 2.5);
                bands.push({
                  kind: 'path', points: [{ x: x - trail, y: routeY }, { x: x, y: routeY }],
                  stroke: fill, strokeWidth: Math.max(0.5, rowH * 0.025),
                  opacity: c.packetTrail * (0.12 + pulse * 0.45) * Math.min(1.5, c.circuitPackets / 16), blend: c.blend
                });
              }
              if (c.addressNodes > 0 && hash(cp, row, col) < c.addressNodes * 0.4) {
                var addressRing = cascadeShapeItem(x - nodeSize, routeY - nodeSize, nodeSize * 2, nodeSize * 2, fill, c.addressNodes * 0.5, 0, 1);
                addressRing.shape = 'ring';
                addressRing.stroke = fill;
                addressRing.strokeWidth = Math.max(0.75, c.stroke || 1);
                bands.push(addressRing);
              }
            }
            if (!token.space && col % Math.max(1, Math.round(1 / Math.max(0.12, c.circuitDensity))) === 0) {
              if (instanceIndex >= limit) {
                cascadePostProcess(width, height, bands);
                return { glyphs: glyphs, bands: bands, limited: true };
              }
              var glyphFill = c.glyphMode === 'fixed' ? c.glyph : cascadeColorFor(row, col, 1, token, rows, cols);
              var glyph = compositionGlyph(token, x, routeY, Math.max(0.02, cellW / Math.max(1, params.fontSize)), Math.max(0.02, rowH * 0.72 / Math.max(1, params.fontSize * params.lineHeight)), 0, glyphFill, 0.8, instanceIndex++);
              if (glyph) glyphs.push(glyph);
            }
          }
          points.push({ x: width, y: points[points.length - 1].y });
          if (c.bands) {
            bands.push({
              kind: 'path', points: points, stroke: cascadePalette()[row % 3],
              strokeWidth: Math.max(0.75, c.stroke || rowH * 0.035),
              opacity: 0.32 + c.opacity * 0.55, blend: c.blend
            });
            if (row < rows - 1 && hash(row, compositionState.seed, 109) < c.circuitBranches / 8) {
              var branchX = ((hash(row, compositionState.seed, 113) * 0.7 + 0.15) * width);
              bands.push({
                kind: 'path',
                points: [{ x: branchX, y: baseY }, { x: branchX, y: baseY + rowH }, { x: branchX + cellW, y: baseY + rowH }],
                stroke: cascadePalette()[(row + 1) % 3],
                strokeWidth: Math.max(0.75, c.stroke || rowH * 0.035),
                opacity: 0.2 + c.circuitBranches / 8 * 0.55, blend: c.blend
              });
            }
            if (c.circuitHeatmap > 0) {
              bands.push({
                kind: 'shape', shape: 'rect', x: 0, y: row * rowH, w: width, h: rowH,
                fill: lerpHex(c.fieldA, c.fieldB, (Math.sin(phase + row) + 1) * 0.5),
                opacity: c.circuitHeatmap * 0.08, blend: c.blend
              });
            }
          }
        }
        cascadePostProcess(width, height, bands);
        return { glyphs: glyphs, bands: bands, limited: false };
      }

      function generateCascadeSdf(tokens, width, height, runtime) {
        var c = compositionState.cascade;
        var opticalLayers = Math.max(1, c.contours);
        var rows = c.rows, cols = cascadeGridColumns(c.cells, rows, 1 + Math.round(opticalLayers * c.sdfFeedback));
        var backgroundLimited = cols < c.cells;
        var cellW = width / cols, cellH = height / rows;
        var clock = runtime && runtime.clock ? runtime.clock : createLoopClock(compositionState.phase, 240, compositionState.seed, compositionState.direction);
        var phase = clock.angle;
        var glyphs = [], bands = [], instanceIndex = 0, limit = compositionLimit();
        var palette = cascadePalette();
        cascadeBackdrop(width, height, bands);
        for (var row = 0; row < rows; row++) {
          var contourPoints = [];
          for (var col = 0; col < cols; col++) {
            var nx = (col + 0.5) / cols;
            var ny = (row + 0.5) / rows;
            var field = cascadeOpticalField(nx, ny, phase, c);
            var state = field > c.threshold * 2 - 1 ? 1 : 0;
            var token = tokens[(row * cols + col) % tokens.length];
            var magnitude = Math.min(1.4, Math.abs(field));
            var fill = cascadeColorFor(row, col, state, token, rows, cols);
            if (c.chromatic > 0) fill = lerpHex(fill, palette[(row + col + 2) % palette.length], Math.min(1, magnitude * c.chromatic));
            var scale = Math.max(0.1, Math.min(1.55, 0.18 + magnitude * (0.9 + c.amplitude * 0.2)));
            var centerX = (col + 0.5) * cellW + Math.sin(field * Math.PI + phase) * cellW * c.warp * 0.35;
            var centerY = (row + 0.5) * cellH + Math.cos(field * Math.PI - phase) * cellH * c.warp * 0.35;
            if (c.glyphWarp > 0) {
              var glyphSignal = (cascadeTokenCode(token) % 29) / 28 * Math.PI * 2;
              centerX += Math.cos(glyphSignal + phase) * cellW * c.glyphWarp;
              centerY += Math.sin(glyphSignal - phase) * cellH * c.glyphWarp;
            }
            var shapeW = cellW * scale * (1 - c.gap);
            var shapeH = cellH * scale * (1 - c.gap);
            contourPoints.push({ x: centerX, y: centerY + field * cellH * c.warp * 0.55 });
            if (c.bands && (state || magnitude > 0.5)) {
              for (var layer = opticalLayers - 1; layer >= 0; layer--) {
                var layerT = opticalLayers <= 1 ? 0 : layer / (opticalLayers - 1);
                var feedbackScale = 1 + layerT * c.sdfFeedback * 2.4 + Math.sin(field * Math.PI * c.frequency) * c.diffraction * 0.22;
                var offsetPhase = phase + layer * 1.618 + field * Math.PI;
                var echoX = Math.sin(offsetPhase) * cellW * layerT * c.sdfFeedback;
                var echoY = Math.cos(offsetPhase * 0.87) * cellH * layerT * c.sdfFeedback;
                var echoFill = layer === 0 ? fill : palette[(row + col + layer) % palette.length];
                var item = cascadeShapeItem(
                  centerX + echoX - shapeW * feedbackScale / 2,
                  centerY + echoY - shapeH * feedbackScale / 2,
                  shapeW * feedbackScale, shapeH * feedbackScale,
                  echoFill,
                  c.opacity * (layer === 0 ? 0.72 + magnitude * 0.28 : (0.06 + c.sdfFeedback * 0.11) * (1 - layerT * 0.35)),
                  field * 70 + clock.turn * 360 + layer * 17,
                  state
                );
                if (layer > 0) {
                  item.shape = 'ring';
                  item.stroke = echoFill;
                  item.strokeWidth = Math.max(0.6, c.stroke || Math.min(cellW, cellH) * (0.035 + layerT * 0.025));
                  item.blend = c.blend === 'source-over' ? 'difference' : c.blend;
                }
                bands.push(item);
              }
            }
            if (!token.space && (state || (row + col) % 3 === 0)) {
              if (instanceIndex >= limit) {
                cascadePostProcess(width, height, bands);
                return { glyphs: glyphs, bands: bands, limited: true };
              }
              var glyph = compositionGlyph(
                token, centerX, centerY,
                Math.max(0.02, cellW * (0.75 + magnitude * 0.45) / Math.max(1, params.fontSize)),
                Math.max(0.02, cellH * (0.72 + magnitude * 0.52) / Math.max(1, params.fontSize * params.lineHeight)),
                field * 28 + (c.sdfMode === 'tunnel' ? Math.atan2(ny - 0.5, nx - 0.5) * 180 / Math.PI : 0),
                cascadeGlyphColor(fill, state), state ? 0.96 : 0.28, instanceIndex++
              );
              if (glyph) glyphs.push(glyph);
            }
          }
          if (c.bands && contourPoints.length > 1) {
            bands.push({
              kind: 'path', points: contourPoints,
              stroke: palette[row % palette.length],
              strokeWidth: Math.max(0.45, c.stroke || 0.75),
              opacity: 0.1 + c.sdfFeedback * 0.2,
              blend: c.blend === 'source-over' ? 'difference' : c.blend
            });
          }
        }
        cascadePostProcess(width, height, bands);
        return { glyphs: glyphs, bands: bands, limited: backgroundLimited };
      }

      function generateCascadeMoire(tokens, width, height) {
        var c = compositionState.cascade;
        var rows = c.rows, rowH = height / rows;
        var samples = Math.min(192, Math.max(48, c.quantize * 6));
        var phaseTurn = ((compositionState.phase % 1) + 1) % 1;
        var phase = phaseTurn * Math.PI * 2;
        var palette = cascadePalette();
        var glyphs = [], bands = [], instanceIndex = 0, limit = compositionLimit();
        var units = tokens.reduce(function (sum, token) { return sum + token.units; }, 0) || 1;
        var unitW = width / Math.max(1, units + Math.max(0, tokens.length - 1) * c.tracking);
        cascadeBackdrop(width, height, bands);
        for (var row = 0; row < rows; row++) {
          var logicalRow = c.mirror && row > (rows - 1) / 2 ? rows - 1 - row : row;
          for (var layer = 0; layer < c.signalLayers; layer++) {
            var points = [];
            for (var sample = 0; sample <= samples; sample++) {
              var nx = sample / samples;
              var carrier = Math.sin(nx * Math.PI * 2 * (2 + c.waveLength * 18) + phase * (1 + layer) + logicalRow * 0.54);
              var interference = Math.sin(nx * Math.PI * 2 * (3 + layer * 0.37) - phase * 2 + row * 0.29);
              var signal = carrier * 0.64 + interference * 0.36;
              var y = (row + 0.5) * rowH + signal * rowH * c.amplitude * (0.18 + c.signalFeedback * 0.32);
              var qStep = Math.max(0.5, rowH / Math.max(2, c.quantize));
              y = Math.round(y / qStep) * qStep;
              points.push({ x: nx * width, y: y + (layer - (c.signalLayers - 1) / 2) * c.signalFeedback * 1.5 });
            }
            if (c.bands) {
              bands.push({
                kind: 'path', points: points,
                stroke: palette[(row + layer) % palette.length],
                strokeWidth: Math.max(0.8, (c.stroke || 0.8) + (c.signalLayers - layer) * 0.32),
                opacity: c.opacity * (0.22 + (1 - layer / Math.max(1, c.signalLayers)) * (0.28 + c.signalFeedback * 0.35)),
                blend: c.blend === 'source-over' && layer > 0 ? 'difference' : c.blend
              });
            }
          }
          if (c.bands) {
            var nodeCount = Math.min(28, Math.max(6, Math.round(c.quantize * 1.35)));
            for (var node = 0; node < nodeCount; node++) {
              var nodeX = (node + 0.5) / nodeCount * width;
              var nodeNX = nodeX / Math.max(1, width);
              var nodeCarrier = Math.sin(nodeNX * Math.PI * 2 * (2 + c.waveLength * 18) + phase + logicalRow * 0.54);
              var nodeInterference = Math.sin(nodeNX * Math.PI * 2 * 3 - phase * 2 + row * 0.29);
              var nodeSignal = nodeCarrier * 0.64 + nodeInterference * 0.36;
              if (Math.abs(nodeSignal) < 0.34 && (node + row) % 3) continue;
              var nodeY = (row + 0.5) * rowH + nodeSignal * rowH * c.amplitude * (0.2 + c.signalFeedback * 0.36);
              var nodeSize = Math.max(2, rowH * (0.1 + Math.abs(nodeSignal) * (0.16 + c.signalFeedback * 0.24)));
              var nodeItem = cascadeShapeItem(
                nodeX - nodeSize / 2, nodeY - nodeSize / 2,
                nodeSize * (1.2 + Math.abs(nodeSignal) * 1.8), nodeSize,
                palette[(row + node) % palette.length],
                c.opacity * (0.38 + Math.abs(nodeSignal) * 0.48),
                nodeSignal * 38, nodeSignal > 0 ? 1 : 0
              );
              nodeItem.shape = (node + row) % 5 === 0 ? 'cross' : ((node + row) % 3 === 0 ? 'ring' : c.shape);
              nodeItem.blend = c.blend === 'source-over' ? 'difference' : c.blend;
              bands.push(nodeItem);
            }
          }
          var cursor = 0;
          for (var ti = 0; ti < tokens.length; ti++) {
            var token = tokens[ti], tokenW = token.units * unitW;
            var nxToken = (cursor + tokenW / 2) / Math.max(1, width);
            var wave = Math.sin(nxToken * Math.PI * 2 * (2 + c.waveLength * 18) + phase + logicalRow * 0.54);
            var glyphY = (row + 0.5) * rowH + wave * rowH * c.amplitude * (0.2 + c.signalFeedback * 0.32);
            if (!token.space) {
              if (instanceIndex >= limit) return { glyphs: glyphs, bands: bands, limited: true };
              var glyphFill = cascadeColorFor(row, ti, wave > 0 ? 1 : 0, token, rows, tokens.length);
              var glyph = compositionGlyph(
                token, cursor + tokenW / 2, glyphY,
                Math.max(0.02, unitW / Math.max(1, params.fontSize * 0.78)),
                Math.max(0.02, rowH * (0.65 + Math.abs(wave) * c.signalFeedback) / Math.max(1, params.fontSize * params.lineHeight)),
                wave * c.signalFeedback * 34,
                c.glyphMode === 'contrast' ? cascadeGlyphColor(glyphFill, wave > 0 ? 1 : 0) : c.glyph,
                0.45 + Math.abs(wave) * 0.55,
                instanceIndex++
              );
              if (glyph) glyphs.push(glyph);
            }
            cursor += tokenW + unitW * c.tracking;
          }
        }
        var railCount = Math.min(24, Math.max(4, Math.round(c.quantize * 0.7)));
        if (c.bands) {
          for (var rail = 0; rail <= railCount; rail++) {
            var railX = rail / railCount * width;
            bands.push({
              kind: 'path',
              points: [{ x: railX, y: 0 }, { x: railX + Math.sin(phase + rail) * c.signalFeedback * rowH, y: height }],
              stroke: palette[rail % palette.length],
              strokeWidth: Math.max(0.55, c.stroke || 0.75),
              opacity: 0.07 + c.signalFeedback * 0.14,
              blend: c.blend === 'source-over' ? 'difference' : c.blend
            });
          }
        }
        cascadePostProcess(width, height, bands);
        return { glyphs: glyphs, bands: bands, limited: false };
      }

      function generateCascadeRadar(tokens, width, height) {
        var c = compositionState.cascade;
        var phaseTurn = ((compositionState.phase % 1) + 1) % 1;
        var phase = phaseTurn * Math.PI * 2;
        var palette = cascadePalette();
        var glyphs = [], bands = [], instanceIndex = 0, limit = compositionLimit();
        var ringCount = Math.min(22, Math.max(4, c.rows));
        var minSide = Math.min(width, height);
        var centerX = width * (0.5 + Math.sin(phase) * c.signalFeedback * 0.12);
        var centerY = height * (0.5 + Math.cos(phase) * c.signalFeedback * 0.12);
        cascadeBackdrop(width, height, bands);
        for (var ring = 0; ring < ringCount; ring++) {
          var radius = minSide * (0.06 + ring / Math.max(1, ringCount - 1) * 0.78);
          var ellipseY = radius * (0.55 + 0.35 * Math.sin(ring * 0.47 + phase));
          for (var layer = 0; layer < c.signalLayers; layer++) {
            var pulse = Math.sin(phase * 2 - ring * 0.63 + layer * 0.91);
            var layerRadius = radius + pulse * c.signalFeedback * (4 + layer * 2.5);
            if (c.bands) {
              var ringItem = cascadeShapeItem(
                centerX - layerRadius, centerY - ellipseY - layer * c.signalFeedback,
                layerRadius * 2, ellipseY * 2,
                palette[(ring + layer) % palette.length],
                c.opacity * (0.18 + (1 - layer / Math.max(1, c.signalLayers)) * 0.34),
                phaseTurn * 360 + ring * 3.7, pulse > 0 ? 1 : 0
              );
              ringItem.shape = 'ring';
              ringItem.stroke = palette[(ring + layer) % palette.length];
              ringItem.strokeWidth = Math.max(1.05, (c.stroke || 0.8) + layer * 0.35);
              ringItem.blend = c.blend === 'source-over' && layer > 0 ? 'difference' : c.blend;
              bands.push(ringItem);
            }
          }
          if (c.bands) {
            var pulseNodeCount = Math.min(24, Math.max(8, c.quantize));
            for (var pulseNode = ring % 3; pulseNode < pulseNodeCount; pulseNode += 3) {
              var pulseAngle = pulseNode / pulseNodeCount * Math.PI * 2 + phase + ring * 0.07;
              var pulseX = centerX + Math.cos(pulseAngle) * radius;
              var pulseY = centerY + Math.sin(pulseAngle) * ellipseY;
              var pulseSize = Math.max(2.5, minSide / ringCount * (0.12 + c.signalFeedback * 0.2));
              var pulseItem = cascadeShapeItem(
                pulseX - pulseSize / 2, pulseY - pulseSize / 2,
                pulseSize * (1 + (ring % 4) * 0.45), pulseSize,
                palette[(ring + pulseNode) % palette.length],
                c.opacity * (0.48 + c.signalFeedback * 0.42),
                pulseAngle * 180 / Math.PI, pulseNode % 2
              );
              pulseItem.shape = pulseNode % 4 === 0 ? 'cross' : (pulseNode % 2 ? 'ring' : c.shape);
              pulseItem.blend = c.blend === 'source-over' ? 'difference' : c.blend;
              bands.push(pulseItem);
            }
          }
          var tokenStep = Math.max(1, Math.floor(tokens.length / Math.max(18, c.quantize * 1.5)));
          for (var ti = ring % tokenStep; ti < tokens.length; ti += tokenStep) {
            var token = tokens[ti];
            if (token.space) continue;
            if (instanceIndex >= limit) return { glyphs: glyphs, bands: bands, limited: true };
            var angle = ti / Math.max(1, tokens.length) * Math.PI * 2 + phase + ring * 0.17;
            var gx = centerX + Math.cos(angle) * radius;
            var gy = centerY + Math.sin(angle) * ellipseY;
            var fill = cascadeColorFor(ring, ti, Math.sin(angle + phase) > 0 ? 1 : 0, token, ringCount, tokens.length);
            var glyph = compositionGlyph(
              token, gx, gy,
              Math.max(0.02, minSide / ringCount * 0.74 / Math.max(1, params.fontSize)),
              Math.max(0.02, minSide / ringCount * (0.7 + c.signalFeedback * 0.8) / Math.max(1, params.fontSize * params.lineHeight)),
              angle * 180 / Math.PI + 90,
              cascadeGlyphColor(fill, 1), 0.55 + c.signalFeedback * 0.4, instanceIndex++
            );
            if (glyph) glyphs.push(glyph);
          }
        }
        var spokeCount = Math.min(48, Math.max(6, c.quantize));
        if (c.bands) {
          for (var spoke = 0; spoke < spokeCount; spoke++) {
            var spokeAngle = spoke / spokeCount * Math.PI * 2 + phase;
            var spokeRadius = minSide * 0.82;
            bands.push({
              kind: 'path',
              points: [
                { x: centerX, y: centerY },
                { x: centerX + Math.cos(spokeAngle) * spokeRadius, y: centerY + Math.sin(spokeAngle) * spokeRadius * 0.65 }
              ],
              stroke: palette[spoke % palette.length],
              strokeWidth: Math.max(0.7, c.stroke || 0.9),
              opacity: 0.07 + c.signalFeedback * 0.16,
              blend: c.blend === 'source-over' ? 'difference' : c.blend
            });
          }
          for (var scan = 0; scan < 3; scan++) {
            var scanAngle = phase * (scan + 1) + scan * Math.PI * 0.08;
            var scanRadius = minSide * (0.56 + scan * 0.12);
            bands.push({
              kind: 'path',
              points: [
                { x: centerX, y: centerY },
                { x: centerX + Math.cos(scanAngle) * scanRadius, y: centerY + Math.sin(scanAngle) * scanRadius * 0.65 }
              ],
              stroke: palette[(scan + 1) % palette.length],
              strokeWidth: Math.max(1.8, (c.stroke || 0.8) * (3.6 - scan * 0.8)),
              opacity: c.opacity * (0.42 - scan * 0.09),
              blend: c.blend === 'source-over' ? 'difference' : c.blend
            });
          }
        }
        cascadePostProcess(width, height, bands);
        return { glyphs: glyphs, bands: bands, limited: false };
      }

      function generateCascadeBands(tokens, width, height) {
        var c = compositionState.cascade;
        if (c.signalMode === 'moire') return generateCascadeMoire(tokens, width, height);
        if (c.signalMode === 'radar') return generateCascadeRadar(tokens, width, height);
        var units = tokens.reduce(function (sum, token) { return sum + token.units; }, 0) || 1;
        var unitW = width / Math.max(1, units + Math.max(0, tokens.length - 1) * c.tracking);
        var rowH = height / c.rows;
        var limit = compositionLimit();
        var phaseTurn = ((compositionState.phase % 1) + 1) % 1;
        var phase = phaseTurn * Math.PI * 2;
        var palette = cascadePalette();
        var glyphs = [], bands = [], instanceIndex = 0;
        cascadeBackdrop(width, height, bands);
        for (var row = 0; row < c.rows; row++) {
          var cursor = 0;
          var logicalRow = c.mirror && row > (c.rows - 1) / 2 ? c.rows - 1 - row : row;
          for (var ti = 0; ti < tokens.length; ti++) {
            var token = tokens[ti];
            var tokenW = token.units * unitW;
            var raw = Math.sin(-phase + logicalRow * (Math.PI * 2 / c.rows) + ti * c.waveLength * Math.PI * 2);
            var shaped = Math.sign(raw) * (1 - Math.pow(1 - Math.abs(raw), c.slope));
            var bandH = rowH * (1 - c.lineSpace) * Math.max(0.08, 1 + shaped * c.amplitude);
            var cy = (row + 0.5) * rowH + shaped * c.amplitude * rowH * 0.28;
            var quantStep = Math.max(0.5, rowH / Math.max(2, c.quantize));
            cy = Math.round(cy / quantStep) * quantStep;
            var fill = cascadeColorFor(row, ti, raw > 0 ? 1 : 0, token, c.rows, tokens.length);
            var gap = Math.min(tokenW, bandH) * c.gap * 0.5;
            if (c.bands) {
              for (var layer = c.signalLayers - 1; layer > 0; layer--) {
                var layerT = layer / Math.max(1, c.signalLayers - 1);
                var echoScale = 1 + layerT * c.signalFeedback * 0.65;
                var echoW = (tokenW + unitW * c.tracking - gap * 2 + 0.5) * echoScale;
                var echoH = (bandH - gap * 2) * echoScale;
                var echo = cascadeShapeItem(
                  cursor + tokenW / 2 - echoW / 2 + Math.sin(phase + row + ti + layer) * unitW * c.signalFeedback * layerT,
                  cy - echoH / 2 + Math.cos(phase + ti - layer) * rowH * c.signalFeedback * layerT,
                  echoW, echoH,
                  palette[(row + ti + layer) % palette.length],
                  c.opacity * (0.04 + c.signalFeedback * 0.12) * (1 - layerT * 0.35),
                  shaped * c.round * 28 + layer * 9,
                  raw > 0 ? 1 : 0
                );
                echo.blend = c.blend === 'source-over' ? 'difference' : c.blend;
                if (layer % 2) {
                  echo.shape = 'ring';
                  echo.stroke = echo.fill;
                  echo.strokeWidth = Math.max(0.55, c.stroke || 0.8);
                }
                bands.push(echo);
              }
              bands.push(cascadeShapeItem(cursor + gap, cy - bandH / 2 + gap, tokenW + unitW * c.tracking - gap * 2 + 0.5, bandH - gap * 2, fill, c.opacity, shaped * c.round * 28, raw > 0 ? 1 : 0));
            }
            if (!token.space) {
              if (instanceIndex >= limit) {
                cascadePostProcess(width, height, bands);
                return { glyphs: glyphs, bands: bands, limited: true };
              }
              var glyph = compositionGlyph(token, cursor + tokenW / 2, cy, unitW / Math.max(1, params.fontSize * 0.72), Math.max(0.02, bandH / Math.max(1, params.fontSize * params.lineHeight)), shaped * c.signalFeedback * 28, cascadeGlyphColor(fill, raw > 0 ? 1 : 0), 1, instanceIndex++);
              if (glyph) glyphs.push(glyph);
            }
            cursor += tokenW + unitW * c.tracking;
          }
        }
        cascadePostProcess(width, height, bands);
        return { glyphs: glyphs, bands: bands, limited: false };
      }

      function contourScalar(nx, ny, tokens, clock, inputs, contour) {
        var value = 0;
        if (contour.source === 'interference') {
          value = (
            Math.sin((nx * 4 + Math.cos(clock.angle) * 0.35) * Math.PI * 2) +
            Math.cos((ny * 5 + Math.sin(clock.angle) * 0.35) * Math.PI * 2) +
            Math.sin((nx + ny) * 7 * Math.PI + clock.angle * 2)
          ) / 3;
        } else {
          var visible = Math.max(1, tokens.length);
          var nearest = Infinity, charge = 0;
          var sources = Math.min(24, visible);
          for (var si = 0; si < sources; si++) {
            var token = tokens[Math.floor(si / sources * visible) % visible];
            var cp = cascadeTokenCode(token);
            var sx = 0.08 + hash(cp, si, compositionState.seed) * 0.84;
            var sy = 0.08 + hash(si, cp, compositionState.seed + 17) * 0.84;
            var dx = nx - sx, dy = ny - sy;
            var distance = Math.sqrt(dx * dx + dy * dy);
            nearest = Math.min(nearest, distance);
            charge += (((cp % 7) - 3) / 3) / Math.max(0.035, distance) * 0.025;
          }
          if (contour.source === 'voronoi') value = 1 - Math.min(1, nearest * 5);
          else if (contour.source === 'unicodeCharge') value = Math.tanh(charge * contour.charge);
          else value = Math.cos(Math.min(1, nearest) * Math.PI * (4 + contour.spacing * 8) - clock.angle)
            * (0.35 + contour.textHeight * 0.65);
        }
        value += Math.sin((nx - ny) * Math.PI * 6 + clock.angle) * contour.interference * 0.18;
        if (inputs.pointer.active && contour.pointerRelief > 0) {
          var pd = Math.hypot(nx - inputs.pointer.x, ny - inputs.pointer.y);
          value += Math.max(0, 1 - pd * 4) * contour.pointerRelief * inputs.pointer.pressure;
        }
        return Math.max(-1, Math.min(1, value));
      }

      function contourEdgePoint(edge, x, y, cellW, cellH, a, b, c, d, level) {
        function mix(v0, v1) {
          var denom = v1 - v0;
          return Math.max(0, Math.min(1, Math.abs(denom) < 0.000001 ? 0.5 : (level - v0) / denom));
        }
        if (edge === 0) return { x: x + mix(a, b) * cellW, y: y };
        if (edge === 1) return { x: x + cellW, y: y + mix(b, c) * cellH };
        if (edge === 2) return { x: x + (1 - mix(d, c)) * cellW, y: y + cellH };
        return { x: x, y: y + (1 - mix(a, d)) * cellH };
      }

      function contourSegmentsForCell(x, y, cellW, cellH, a, b, c, d, level) {
        var state = (a >= level ? 8 : 0) | (b >= level ? 4 : 0) | (c >= level ? 2 : 0) | (d >= level ? 1 : 0);
        var table = {
          1: [[3, 2]], 2: [[2, 1]], 3: [[3, 1]], 4: [[0, 1]],
          5: [[0, 3], [2, 1]], 6: [[0, 2]], 7: [[0, 3]],
          8: [[3, 0]], 9: [[0, 2]], 10: [[3, 2], [0, 1]],
          11: [[0, 1]], 12: [[3, 1]], 13: [[2, 1]], 14: [[3, 2]]
        };
        var edges = table[state] || [];
        return edges.map(function (pair) {
          return [
            contourEdgePoint(pair[0], x, y, cellW, cellH, a, b, c, d, level),
            contourEdgePoint(pair[1], x, y, cellW, cellH, a, b, c, d, level)
          ];
        });
      }

      function createPathLoomBasePath(loom, width, height) {
        var points = [], closed = false;
        var count = 160;
        var minimum = Math.min(width, height);
        if (loom.grammar === 'custom' && loom.customPath.length > 1) {
          points = loom.customPath.map(function (point) { return { x: point.x * width, y: point.y * height }; });
        } else if (loom.grammar === 'orbit') {
          closed = true;
          for (var orbitIndex = 0; orbitIndex < count; orbitIndex++) {
            var orbitTurn = orbitIndex / count;
            var orbitAngle = orbitTurn * Math.PI * 2 - Math.PI * 0.5;
            var lobe = 1 + Math.sin(orbitAngle * loom.turns) * loom.amplitude * 0.035;
            points.push({
              x: width * 0.5 + Math.cos(orbitAngle) * width * 0.37 * lobe,
              y: height * 0.5 + Math.sin(orbitAngle) * height * (0.28 + loom.amplitude * 0.025) * lobe
            });
          }
        } else if (loom.grammar === 'spiral') {
          for (var spiralIndex = 0; spiralIndex < count; spiralIndex++) {
            var spiralTurn = spiralIndex / (count - 1);
            var spiralAngle = (spiralTurn * loom.turns - 0.25) * Math.PI * 2;
            var spiralRadius = minimum * (0.035 + spiralTurn * (0.28 + loom.amplitude * 0.045));
            points.push({
              x: width * 0.5 + Math.cos(spiralAngle) * spiralRadius,
              y: height * 0.5 + Math.sin(spiralAngle) * spiralRadius
            });
          }
        } else {
          var pad = Math.max(24, minimum * 0.075);
          for (var ribbonIndex = 0; ribbonIndex < count; ribbonIndex++) {
            var ribbonTurn = ribbonIndex / (count - 1);
            var envelope = Math.sin(Math.PI * ribbonTurn);
            var wave = Math.sin((ribbonTurn * loom.turns - 0.08) * Math.PI * 2);
            var counterWave = Math.sin((ribbonTurn * (loom.turns * 0.5 + 0.5) + 0.19) * Math.PI * 2);
            points.push({
              x: pad + ribbonTurn * (width - pad * 2),
              y: height * 0.5 + (wave * 0.78 + counterWave * 0.22) * minimum * 0.18 * loom.amplitude * envelope
            });
          }
        }
        var smoothed = pathLoomSmoothPoints(points, loom.smoothing, closed);
        return { points: pathLoomResample(smoothed, 220, closed), closed: closed };
      }

      function offsetPathLoomPolyline(points, closed, offset, weave, loom, strandIndex, clock, width, height) {
        var output = [], count = points.length, minimum = Math.min(width, height);
        var weavePhase = clock.angle * (loom.loop ? Math.max(1, Math.abs(loom.travel)) : 0);
        for (var index = 0; index < count; index++) {
          var previousIndex = index === 0 ? (closed ? count - 1 : 0) : index - 1;
          var nextIndex = index === count - 1 ? (closed ? 0 : count - 1) : index + 1;
          var dx = points[nextIndex].x - points[previousIndex].x;
          var dy = points[nextIndex].y - points[previousIndex].y;
          var magnitude = Math.max(0.0001, Math.sqrt(dx * dx + dy * dy));
          var nx = -dy / magnitude, ny = dx / magnitude;
          var progress = index / Math.max(1, count - (closed ? 0 : 1));
          var cross = Math.sin(progress * loom.turns * Math.PI * 2 + strandIndex * Math.PI * 2 / Math.max(1, loom.strands) + weavePhase)
            * weave * minimum * 0.035;
          output.push({ x: points[index].x + nx * (offset + cross), y: points[index].y + ny * (offset + cross) });
        }
        return output;
      }

      function fxNumber(module, keys, fallback, min, max) {
        if (!module) return fallback;
        keys = Array.isArray(keys) ? keys : [keys];
        var value;
        for (var i = 0; i < keys.length; i++) {
          if (module[keys[i]] != null) {
            value = Number(module[keys[i]]);
            if (isFinite(value)) break;
          }
        }
        if (!isFinite(value)) value = fallback;
        if (min != null) value = Math.max(min, value);
        if (max != null) value = Math.min(max, value);
        return value;
      }

      function fxEnabled(module) {
        if (!module) return false;
        if (module.enabled != null) return module.enabled === true || module.enabled === 1;
        if (module.on != null) return module.on === true || module.on === 1;
        return fxNumber(module, ['amount', 'intensity', 'mix'], 0, 0, 1) > 0.0005;
      }

      function copySceneGlyph(glyph) {
        var copy = {};
        for (var key in glyph) if (Object.prototype.hasOwnProperty.call(glyph, key)) copy[key] = glyph[key];
        return copy;
      }

      function copySceneBand(band) {
        var copy = {};
        for (var key in band) if (Object.prototype.hasOwnProperty.call(band, key)) copy[key] = band[key];
        if (band.points) {
          copy.points = band.points.map(function (point) { return { x: point.x, y: point.y }; });
        }
        return copy;
      }

      function transformScenePoint(x, y, cx, cy, scale, rotation, dx, dy) {
        var rad = rotation * Math.PI / 180;
        var cos = Math.cos(rad), sin = Math.sin(rad);
        var px = (x - cx) * scale, py = (y - cy) * scale;
        return {
          x: cx + px * cos - py * sin + dx,
          y: cy + px * sin + py * cos + dy
        };
      }

      function transformSceneGlyph(glyph, width, height, transform, alpha, marker) {
        var copy = copySceneGlyph(glyph);
        var cx = width / 2, cy = height / 2;
        var point = transformScenePoint(
          glyph.ox + (glyph.tx || 0), glyph.oy + (glyph.ty || 0),
          cx, cy, transform.scale, transform.rotation, transform.dx, transform.dy
        );
        copy.tx = point.x - glyph.ox;
        copy.ty = point.y - glyph.oy;
        copy.rot = (glyph.rot || 0) + transform.rotation;
        copy.scaleX = glyph.scaleX * transform.scale;
        copy.scaleY = glyph.scaleY * transform.scale;
        copy.opacity = Math.max(0, Math.min(1, (glyph.opacity == null ? 1 : glyph.opacity) * alpha));
        copy.fxPass = marker;
        return copy;
      }

      function transformSceneBand(band, width, height, transform, alpha, marker) {
        var copy = copySceneBand(band);
        var cx = width / 2, cy = height / 2;
        if (copy.kind === 'path' && copy.points) {
          copy.points = copy.points.map(function (point) {
            return transformScenePoint(point.x, point.y, cx, cy, transform.scale, transform.rotation, transform.dx, transform.dy);
          });
          copy.strokeWidth = Math.max(0.1, (copy.strokeWidth || 1) * Math.abs(transform.scale));
        } else {
          var center = transformScenePoint(
            copy.x + copy.w / 2, copy.y + copy.h / 2,
            cx, cy, transform.scale, transform.rotation, transform.dx, transform.dy
          );
          copy.w *= Math.abs(transform.scale);
          copy.h *= Math.abs(transform.scale);
          copy.x = center.x - copy.w / 2;
          copy.y = center.y - copy.h / 2;
          copy.rotation = (copy.rotation || 0) + transform.rotation;
          if (copy.strokeWidth) copy.strokeWidth *= Math.abs(transform.scale);
        }
        copy.opacity = Math.max(0, Math.min(1, (band.opacity == null ? 1 : band.opacity) * alpha));
        copy.fxPass = marker;
        return copy;
      }

      function appendTransformedScenePass(scene, sourceGlyphs, sourceBands, transform, alpha, marker, budget) {
        var room = Math.max(0, budget - (scene._basePrimitiveCount || 0) - scene.glyphs.length - scene.bands.length);
        if (!room || alpha <= 0.001) return;
        for (var bi = 0; bi < sourceBands.length && room > 0; bi++, room--) {
          scene.bands.push(transformSceneBand(sourceBands[bi], scene.width, scene.height, transform, alpha, marker));
        }
        for (var gi = 0; gi < sourceGlyphs.length && room > 0; gi++, room--) {
          scene.glyphs.push(transformSceneGlyph(sourceGlyphs[gi], scene.width, scene.height, transform, alpha, marker));
        }
        if (room <= 0) scene.limited = true;
      }

      function applyEchoTrailFx(scene, module, budget) {
        if (!fxEnabled(module)) return scene;
        var amount = fxNumber(module, ['amount', 'intensity', 'mix'], 0.5, 0, 1);
        var requested = fxNumber(module, ['count', 'echoes', 'passes'], 4, 1, 16);
        var count = Math.max(1, Math.round(requested));
        var decay = fxNumber(module, 'decay', 0.68, 0.05, 0.98);
        var distance = fxNumber(module, ['distance', 'offset', 'spacing'], 12, -240, 240);
        var angle = fxNumber(module, 'angle', 0, -360, 360) * Math.PI / 180;
        var scaleStep = fxNumber(module, ['scale', 'zoom'], 0.018, -0.2, 0.2);
        var rotationStep = fxNumber(module, ['rotation', 'rotate'], 2, -45, 45);
        var phaseSpacing = fxNumber(module, ['phaseSpacing', 'phase'], 0.08, -1, 1);
        var phase = (((compositionState.phase || 0) % 1) + 1) % 1;
        var sourceGlyphs = scene.glyphs.slice();
        var sourceBands = scene.bands.slice();
        var effectGlyphs = [], effectBands = [];
        var target = {
          glyphs: effectGlyphs, bands: effectBands,
          width: scene.width, height: scene.height, limited: scene.limited,
          _basePrimitiveCount: scene.glyphs.length + scene.bands.length
        };
        for (var pass = count; pass >= 1; pass--) {
          var phaseAngle = Math.PI * 2 * (phase + pass * phaseSpacing);
          var passDistance = distance * pass * amount;
          appendTransformedScenePass(target, sourceGlyphs, sourceBands, {
            dx: Math.cos(angle + phaseAngle) * passDistance,
            dy: Math.sin(angle + phaseAngle) * passDistance,
            scale: Math.max(0.05, 1 + scaleStep * pass * amount),
            rotation: rotationStep * pass * amount
          }, amount * Math.pow(decay, pass), 'echoTrail', budget);
        }
        scene.glyphs = effectGlyphs.concat(scene.glyphs);
        scene.bands = effectBands.concat(scene.bands);
        scene.limited = scene.limited || target.limited;
        return scene;
      }

      function applyFeedbackFx(scene, module, budget) {
        if (!fxEnabled(module)) return scene;
        var amount = fxNumber(module, ['amount', 'intensity', 'mix'], 0.42, 0, 1);
        var persistence = fxNumber(module, ['persistence', 'decay'], 0.72, 0.05, 0.98);
        var requested = fxNumber(module, ['passes', 'count', 'echoes'], 5, 1, 14);
        var count = Math.max(1, Math.round(requested));
        var zoom = fxNumber(module, ['zoom', 'scale'], 0.04, -0.2, 0.2);
        var rotation = fxNumber(module, ['rotation', 'rotate'], 3, -45, 45);
        var warp = fxNumber(module, 'warp', 0, 0, 1);
        var phase = (((compositionState.phase || 0) % 1) + 1) % 1;
        var phaseAngle = phase * Math.PI * 2;
        var sourceGlyphs = scene.glyphs.slice();
        var sourceBands = scene.bands.slice();
        var effectGlyphs = [], effectBands = [];
        var target = {
          glyphs: effectGlyphs, bands: effectBands,
          width: scene.width, height: scene.height, limited: scene.limited,
          _basePrimitiveCount: scene.glyphs.length + scene.bands.length
        };
        for (var pass = count; pass >= 1; pass--) {
          var loopWarp = Math.sin(phaseAngle + pass * 1.618) * warp;
          appendTransformedScenePass(target, sourceGlyphs, sourceBands, {
            dx: Math.cos(phaseAngle + pass * 0.73) * loopWarp * scene.width * 0.025 * pass,
            dy: Math.sin(phaseAngle - pass * 0.61) * loopWarp * scene.height * 0.025 * pass,
            scale: Math.max(0.05, 1 + zoom * pass * amount),
            rotation: rotation * pass * amount + loopWarp * 8
          }, amount * Math.pow(persistence, pass), 'feedback', budget);
        }
        scene.glyphs = effectGlyphs.concat(scene.glyphs);
        scene.bands = effectBands.concat(scene.bands);
        scene.limited = scene.limited || target.limited;
        return scene;
      }

      function hexLuminance(color) {
        if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) return 0.5;
        var r = parseInt(color.slice(1, 3), 16) / 255;
        var g = parseInt(color.slice(3, 5), 16) / 255;
        var b = parseInt(color.slice(5, 7), 16) / 255;
        return r * 0.2126 + g * 0.7152 + b * 0.0722;
      }

      function applySignalMaskFx(scene, module) {
        if (!fxEnabled(module)) return scene;
        var amount = fxNumber(module, ['amount', 'intensity', 'mix'], 0.5, 0, 1);
        var threshold = fxNumber(module, 'threshold', 0.5, 0, 1);
        var softness = Math.max(0.02, fxNumber(module, ['softness', 'feather'], 0.2, 0, 1));
        var mode = module.mode || module.mask || 'text';
        var phase = (((compositionState.phase || 0) % 1) + 1) % 1 * Math.PI * 2;
        function fieldAt(x, y) {
          var wave = 0.5 + 0.25 * Math.sin(phase + x / Math.max(1, scene.width) * Math.PI * 4)
            + 0.25 * Math.cos(phase - y / Math.max(1, scene.height) * Math.PI * 4);
          return Math.max(0, Math.min(1, (wave - threshold + softness) / (softness * 2)));
        }
        for (var gi = 0; gi < scene.glyphs.length; gi++) {
          var glyph = scene.glyphs[gi];
          var glyphAlpha = 1;
          if (mode === 'inverseText' || mode === 'inverse-text' || mode === 'inverse') glyphAlpha = 1 - amount;
          else if (mode === 'field') glyphAlpha = 1 - amount + amount * fieldAt(glyph.ox + (glyph.tx || 0), glyph.oy + (glyph.ty || 0));
          else if (mode === 'luma') glyphAlpha = 1 - amount + amount * (hexLuminance(glyph.fill || params.ink) >= threshold ? 1 : softness);
          glyph.opacity = Math.max(0, Math.min(1, (glyph.opacity == null ? 1 : glyph.opacity) * glyphAlpha));
        }
        for (var bi = 0; bi < scene.bands.length; bi++) {
          var band = scene.bands[bi];
          var bandAlpha = mode === 'text' ? 1 - amount : 1;
          var bx = band.kind === 'path' && band.points && band.points.length ? band.points[0].x : band.x + band.w / 2;
          var by = band.kind === 'path' && band.points && band.points.length ? band.points[0].y : band.y + band.h / 2;
          if (mode === 'field') bandAlpha = 1 - amount + amount * fieldAt(bx, by);
          else if (mode === 'luma') bandAlpha = 1 - amount + amount * (hexLuminance(band.fill || band.stroke || params.ink) >= threshold ? 1 : softness);
          band.opacity = Math.max(0, Math.min(1, (band.opacity == null ? 1 : band.opacity) * bandAlpha));
        }
        return scene;
      }

      function applyChromaticSplitFx(scene, module, budget) {
        if (!fxEnabled(module)) return scene;
        var amount = fxNumber(module, ['amount', 'intensity', 'mix'], 0.55, 0, 1);
        var distance = fxNumber(module, ['distance', 'offset'], 7, 0, 120) * amount;
        if (distance < 0.01) return scene;
        var angle = fxNumber(module, 'angle', 0, -360, 360) * Math.PI / 180;
        var alpha = fxNumber(module, ['opacity', 'alpha'], 0.72, 0, 1) * amount;
        var blend = module.blend || 'multiply';
        var colorA = /^#[0-9a-f]{6}$/i.test(module.colorA || '') ? module.colorA : (compositionState.color2 || params.accent);
        var colorB = /^#[0-9a-f]{6}$/i.test(module.colorB || '') ? module.colorB : (compositionState.color3 || params.ink);
        var originals = scene.glyphs.slice();
        var passes = [];
        var room = Math.max(0, budget - scene.glyphs.length - scene.bands.length);
        for (var pass = 0; pass < 2 && room > 0; pass++) {
          var sign = pass ? -1 : 1;
          for (var gi = 0; gi < originals.length && room > 0; gi++, room--) {
            var copy = copySceneGlyph(originals[gi]);
            copy.tx = (copy.tx || 0) + Math.cos(angle) * distance * sign;
            copy.ty = (copy.ty || 0) + Math.sin(angle) * distance * sign;
            copy.fill = pass ? colorB : colorA;
            copy.opacity = Math.max(0, Math.min(1, (copy.opacity == null ? 1 : copy.opacity) * alpha));
            copy.fxBlend = blend;
            copy.fxPass = 'chromaticSplit';
            passes.push(copy);
          }
        }
        if (room <= 0) scene.limited = true;
        scene.glyphs = passes.concat(scene.glyphs);
        return scene;
      }

      function quantizeHex(color, steps) {
        if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) return color;
        var divisor = Math.max(1, steps - 1);
        var values = [1, 3, 5].map(function (at) {
          var value = parseInt(color.slice(at, at + 2), 16);
          return Math.round(Math.round(value / 255 * divisor) / divisor * 255);
        });
        return '#' + values.map(function (value) { return value.toString(16).padStart(2, '0'); }).join('');
      }

      function applyRasterMaterialFx(scene, module, budget) {
        if (!fxEnabled(module)) return scene;
        var mix = fxNumber(module, ['amount', 'intensity', 'mix'], 1, 0, 1);
        var pixelate = fxNumber(module, ['pixelate', 'pixelation'], 0, 0, 1) * mix;
        var posterize = fxNumber(module, 'posterize', 0, 0, 1) * mix;
        var scanline = fxNumber(module, ['scanline', 'scanlines'], 0, 0, 1) * mix;
        var noise = fxNumber(module, 'noise', 0, 0, 1) * mix;
        var snap = pixelate > 0.001 ? 1 + pixelate * 31 : 0;
        var steps = Math.max(2, Math.round(16 - posterize * 13));
        for (var gi = 0; gi < scene.glyphs.length; gi++) {
          var glyph = scene.glyphs[gi];
          if (snap) {
            var gx = glyph.ox + (glyph.tx || 0), gy = glyph.oy + (glyph.ty || 0);
            glyph.tx = Math.round(gx / snap) * snap - glyph.ox;
            glyph.ty = Math.round(gy / snap) * snap - glyph.oy;
          }
          if (posterize > 0.001) glyph.fill = quantizeHex(glyph.fill || params.ink, steps);
        }
        for (var bi = 0; bi < scene.bands.length; bi++) {
          var band = scene.bands[bi];
          if (snap && band.kind === 'path' && band.points) {
            band.points.forEach(function (point) {
              point.x = Math.round(point.x / snap) * snap;
              point.y = Math.round(point.y / snap) * snap;
            });
          } else if (snap && band.x != null) {
            band.x = Math.round(band.x / snap) * snap;
            band.y = Math.round(band.y / snap) * snap;
            band.w = Math.max(snap, Math.round(band.w / snap) * snap);
            band.h = Math.max(snap, Math.round(band.h / snap) * snap);
          }
          if (posterize > 0.001) {
            if (band.fill) band.fill = quantizeHex(band.fill, steps);
            if (band.stroke) band.stroke = quantizeHex(band.stroke, steps);
          }
        }
        var room = Math.max(0, budget - scene.glyphs.length - scene.bands.length);
        if (scanline > 0.001 && room > 0) {
          var lineGap = Math.max(3, Math.round(18 - scanline * 14));
          var lineCount = Math.min(room, 240, Math.ceil(scene.height / lineGap));
          for (var line = 0; line < lineCount; line++) {
            var y = line * lineGap + (((compositionState.phase || 0) * lineGap) % lineGap);
            scene.bands.push({
              kind: 'path',
              points: [{ x: 0, y: y }, { x: scene.width, y: y }],
              stroke: module.scanlineColor || params.ink,
              strokeWidth: Math.max(0.5, scanline * 1.8),
              opacity: scanline * 0.16,
              blend: module.blend || 'multiply',
              fxPass: 'rasterMaterial'
            });
          }
          room -= lineCount;
        }
        if (noise > 0.001 && room > 0) {
          var noiseCount = Math.min(room, Math.round(24 + noise * 176));
          var phase = (((compositionState.phase || 0) % 1) + 1) % 1 * Math.PI * 2;
          for (var ni = 0; ni < noiseCount; ni++) {
            var seed = (ni + 1) * 12.9898;
            var nx = ((Math.sin(seed * 1.17) * 43758.5453) % 1 + 1) % 1;
            var ny = ((Math.sin(seed * 2.31) * 24634.6345) % 1 + 1) % 1;
            nx = (nx + Math.sin(phase + seed) * noise * 0.025 + 1) % 1;
            ny = (ny + Math.cos(phase - seed) * noise * 0.025 + 1) % 1;
            var size = 0.6 + (((Math.sin(seed * 0.73) * 9758.13) % 1 + 1) % 1) * (1 + noise * 4);
            scene.bands.push({
              kind: 'shape', shape: 'rect',
              x: nx * scene.width, y: ny * scene.height, w: size, h: size,
              fill: ni % 3 ? params.ink : (compositionState.color2 || params.accent),
              opacity: noise * (0.06 + (ni % 7) * 0.008),
              blend: module.blend || 'difference',
              fxPass: 'rasterMaterial'
            });
          }
          room -= noiseCount;
        }
        if (room <= 0) scene.limited = true;
        scene.rasterMaterial = {
          pixelate: pixelate,
          posterize: posterize,
          scanline: scanline,
          noise: noise,
          vectorApproximation: true
        };
        return scene;
      }

      function enforceCompositionPrimitiveBudget(scene, budget) {
        function bandCost(band) {
          if (band && band.kind === 'path' && band.points) return Math.max(1, Math.ceil(band.points.length / 8));
          return 1;
        }
        var rasterCost = (scene.rasterPasses || []).length * 32;
        var total = scene.glyphs.length + rasterCost;
        for (var totalIndex = 0; totalIndex < scene.bands.length; totalIndex++) {
          total += bandCost(scene.bands[totalIndex]);
        }
        if (total <= budget) return scene;
        var available = Math.max(0, budget - rasterCost);
        var keepGlyphs = Math.min(
          scene.glyphs.length,
          scene.bands.length ? Math.floor(available * 0.58) : available
        );
        var room = available - keepGlyphs;
        var keptBands = [];
        for (var bandIndex = scene.bands.length - 1; bandIndex >= 0; bandIndex--) {
          var cost = bandCost(scene.bands[bandIndex]);
          if (cost > room) continue;
          keptBands.unshift(scene.bands[bandIndex]);
          room -= cost;
        }
        if (room > 0) keepGlyphs = Math.min(scene.glyphs.length, keepGlyphs + room);
        scene.bands = keptBands;
        scene.glyphs = scene.glyphs.slice(scene.glyphs.length - keepGlyphs);
        scene.limited = true;
        return scene;
      }

      function webglCompositionAvailable() {
        if (compositionWebGLState.checked) return compositionWebGLState.available && !compositionWebGLState.lost;
        compositionWebGLState.checked = true;
        try {
          var probe = (globalThis.TypeDeformerRenderContext ? globalThis.TypeDeformerRenderContext.createCanvas() : createRenderCanvas());
          compositionWebGLState.available = !!probe.getContext('webgl2', { alpha: true });
        } catch (error) {
          if(error.code==='RENDER_BUDGET_EXCEEDED')throw error;
          compositionWebGLState.available = false;
        }
        return compositionWebGLState.available;
      }

      function ensureCompositionWebGL(width, height) {
        if (!webglCompositionAvailable()) return null;
        var state = compositionWebGLState;
        if (!state.canvas) {
          var canvas = (globalThis.TypeDeformerRenderContext ? globalThis.TypeDeformerRenderContext.createCanvas() : createRenderCanvas());
          var gl = canvas.getContext('webgl2', {
            alpha: true, premultipliedAlpha: true, antialias: false,
            preserveDrawingBuffer: true
          });
          if (!gl) return null;
          canvas.addEventListener('webglcontextlost', function (event) {
            event.preventDefault();
            state.lost = true;
            scheduleCompositionDraw();
          });
          canvas.addEventListener('webglcontextrestored', function () {
            state.lost = false; state.program = null; state.texture = null;
            state.available = true;
            scheduleCompositionDraw();
          });
          state.canvas = canvas;
          state.gl = gl;
        }
        var presentation=globalThis.TypeDeformerCompositionPresentation||{density:1},density=presentation.density||1;
        var targetW=Math.max(1,Math.ceil(width*density)),targetH=Math.max(1,Math.ceil(height*density));
        var limit=state.gl.getParameter(state.gl.MAX_TEXTURE_SIZE);
        if(targetW>limit||targetH>limit||targetW*targetH*8>(globalThis.TypeDeformerRenderContext?TypeDeformerRenderContext.limits(presentation.purpose||'edit').composeBytes:512*1024*1024)){var error=new Error('Composeの光学描画が表示用メモリ予算を超えました。低負荷表示に切り替えるか設定を軽くしてください。設定値は保持されています。');error.code='RENDER_BUDGET_EXCEEDED';throw error;}
        if (state.canvas.width !== targetW) state.canvas.width = targetW;
        if (state.canvas.height !== targetH) state.canvas.height = targetH;
        var gl = state.gl;
        if (!state.program) {
          var vertexSource = '#version 300 es\n'
            + 'in vec2 a_position; out vec2 v_uv;\n'
            + 'void main(){v_uv=a_position*.5+.5;gl_Position=vec4(a_position,0.,1.);}';
          var fragmentSource = '#version 300 es\n'
            + 'precision highp float; in vec2 v_uv; out vec4 outColor;\n'
            + 'uniform sampler2D u_text; uniform vec2 u_resolution;\n'
            + 'uniform float u_phase,u_mode,u_intensity,u_depth,u_instability;\n'
            + 'uniform float u_zoom,u_rotation,u_decay,u_echoes,u_warp,u_frequency;\n'
            + 'uniform vec3 u_colorA,u_colorB,u_colorC;\n'
            + 'mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}\n'
            + 'void main(){vec2 uv=v_uv;vec2 p=uv-.5;float ink=texture(u_text,uv).a;'
            + 'vec3 col=u_colorA;float alpha=0.;\n'
            + 'if(u_mode>.5){float acc=0.;vec3 spectral=vec3(0.);'
            + 'for(int i=0;i<16;i++){float fi=float(i);if(fi>=u_echoes)break;'
            + 'float sc=pow(max(.82,1.+u_zoom),fi);'
            + 'vec2 q=rot(-(u_rotation*fi+sin(u_phase+fi*.37)*u_warp*.08))*(p/sc);'
            + 'q+=vec2(sin(u_phase+fi*.53),cos(u_phase-fi*.41))*u_warp*.012*fi;'
            + 'float a=texture(u_text,q+.5).a*pow(u_decay,fi);'
            + 'acc+=a;spectral+=mix(u_colorB,u_colorC,fract(fi*.37))*a;}'
            + 'col=mix(u_colorA,spectral/max(.001,acc),clamp(acc,0.,1.));'
            + 'alpha=clamp(acc*(.18+.45*u_intensity),0.,.82);'
            + '}else{float r=length(p);float a=atan(p.y,p.x);'
            + 'float warp=sin(a*6.+u_phase)*u_warp*.18;'
            + 'float f=sin((r+warp)*u_frequency*28.-u_phase*2.);'
            + 'f+=cos((p.x-p.y)*u_frequency*8.+u_phase);'
            + 'f+=sin((p.x+p.y)*u_frequency*11.-u_phase);f/=3.;'
            + 'float contour=smoothstep(.18,.02,abs(fract(f*4.)-.5));'
            + 'float glow=smoothstep(.65,.05,abs(f));'
            + 'col=mix(u_colorA,u_colorB,.5+.5*f);col=mix(col,u_colorC,contour*.55);'
            + 'alpha=(.05+contour*.28+glow*.1+ink*.22)*(.35+.65*u_intensity);}'
            + 'alpha*=smoothstep(.86,.38,length(p));outColor=vec4(col*alpha,alpha);}';
          var vertex = compileCompositionShader(gl, gl.VERTEX_SHADER, vertexSource);
          var fragment = compileCompositionShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
          var program = gl.createProgram();
          gl.attachShader(program, vertex); gl.attachShader(program, fragment);
          gl.linkProgram(program);
          gl.deleteShader(vertex); gl.deleteShader(fragment);
          if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'WebGL link failed');
          state.program = program;
          state.position = gl.getAttribLocation(program, 'a_position');
          state.uniforms = {};
          ['u_text', 'u_resolution', 'u_phase', 'u_mode', 'u_intensity', 'u_depth',
            'u_instability', 'u_zoom', 'u_rotation', 'u_decay', 'u_echoes',
            'u_warp', 'u_frequency', 'u_colorA', 'u_colorB', 'u_colorC'
          ].forEach(function (name) { state.uniforms[name] = gl.getUniformLocation(program, name); });
          var buffer = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
          gl.enableVertexAttribArray(state.position);
          gl.vertexAttribPointer(state.position, 2, gl.FLOAT, false, 0, 0);
          state.texture = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, state.texture);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        }
        return state;
      }

      function webglHexColor(hex) {
        if (!/^#[0-9a-f]{6}$/i.test(hex || '')) hex = '#17140f';
        return [
          parseInt(hex.slice(1, 3), 16) / 255,
          parseInt(hex.slice(3, 5), 16) / 255,
          parseInt(hex.slice(5, 7), 16) / 255
        ];
      }

      function updateCompositionWebGLTextTexture(state) {
        var gl = state.gl;
        var maskSize = 1024,density=(globalThis.TypeDeformerCompositionPresentation||{}).density||1,physicalSize=Math.max(1,Math.ceil(maskSize*density));
        var limit=gl.getParameter(gl.MAX_TEXTURE_SIZE);if(physicalSize>limit||physicalSize*physicalSize*4>(globalThis.TypeDeformerRenderContext?TypeDeformerRenderContext.limits((globalThis.TypeDeformerCompositionPresentation||{}).purpose||'edit').textureBytes:256*1024*1024)){var error=new Error('Composeの文字テクスチャがGPUの作業予算を超えます。設定値は保持されています。');error.code='RENDER_BUDGET_EXCEEDED';throw error;}
        var key = renderedSourceText + '|' + params.fontFamily + '|' + params.fontWeight + '|' + params.vertical+'|'+density;
        if (state.maskKey === key && state.maskCanvas) return;
        state.maskKey = key;
        if (!state.maskCanvas) state.maskCanvas = (globalThis.TypeDeformerRenderContext ? globalThis.TypeDeformerRenderContext.createCanvas() : createRenderCanvas());
        var canvas = state.maskCanvas;
        canvas.width = physicalSize; canvas.height = physicalSize;
        var ctx = canvas.getContext('2d');ctx.setTransform(density,0,0,density,0,0);
        ctx.clearRect(0, 0, maskSize, maskSize);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var clean = renderedSourceText.replace(/\s+/g, ' ').trim() || 'TYPE';
        var size = Math.max(20, Math.min(180, maskSize / Math.max(5, Math.sqrt(clean.length) * 1.7)));
        ctx.font = params.fontWeight + ' ' + size + 'px ' + params.fontFamily;
        var lines = [];
        var cursor = '';
        for (var i = 0; i < clean.length; i++) {
          var next = cursor + clean[i];
          if (ctx.measureText(next).width > maskSize * 0.82 && cursor) { lines.push(cursor); cursor = clean[i]; }
          else cursor = next;
        }
        if (cursor) lines.push(cursor);
        lines = lines.slice(0, Math.max(1, Math.floor(maskSize / (size * 1.2))));
        var startY = maskSize * 0.5 - (lines.length - 1) * size * 0.58;
        lines.forEach(function (line, index) { ctx.fillText(line, maskSize * 0.5, startY + index * size * 1.16); });
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, state.texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      }

      function baselineOffset(g, fm) {
        if (g.fontAxes) fm = fontMetrics(g);
        var leading = g.h - (fm.ascent + fm.descent);
        return leading / 2 + fm.ascent;
      }
