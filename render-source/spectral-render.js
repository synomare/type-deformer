// Canonical spectral-render declarations. Bundled for both editor and Worker.
// Environment dependencies are declared in manifest.json.

      var spectralGlyphCache = new Map();

      var spectralBasisCache = new Map();

      var spectralCachePoints = 0;

      function spectralTraceContours(data, width, height) {
        // Interpolate the half-coverage boundary instead of tracing pixel
        // boxes. Locked counters then retain smooth alpha-derived outlines.
        // Samples are at pixel centers; a zero ring closes border contours.
        var threshold = 127.5, stride = width + 2;
        var vertices = new Map(), outgoing = new Map(), segments = [];
        function value(x, y) {
          return x < 0 || y < 0 || x >= width || y >= height ? 0 : data[(y * width + x) * 4 + 3];
        }
        function crossing(x, y, vertical, a, b) {
          var key = ((y + 1) * stride + x + 1) * 2 + (vertical ? 1 : 0);
          if (!vertices.has(key)) {
            var t = (threshold - a) / (b - a);
            vertices.set(key, { x: x + 0.5 + (vertical ? 0 : t), y: y + 0.5 + (vertical ? t : 0) });
          }
          return key;
        }
        function segment(start, end) {
          outgoing.set(start, segments.length);
          segments.push({ start: start, end: end });
        }
        for (var y = -1; y < height; y++) for (var x = -1; x < width; x++) {
          var a = value(x, y), b = value(x + 1, y), c = value(x + 1, y + 1), d = value(x, y + 1);
          var mask = (a > threshold ? 1 : 0) | (b > threshold ? 2 : 0) | (c > threshold ? 4 : 0) | (d > threshold ? 8 : 0);
          // Allocate edge bookkeeping only for boundary cells.
          if (mask === 0 || mask === 15) continue;
          var values = [a, b, c, d], high = [!!(mask & 1), !!(mask & 2), !!(mask & 4), !!(mask & 8)];
          var cross = [-1, -1, -1, -1], enter = -1, leave = -1, count = 0;
          for (var side = 0; side < 4; side++) {
            var next = (side + 1) % 4;
            if (high[side] === high[next]) continue;
            if (side === 0) cross[side] = crossing(x, y, false, values[0], values[1]);
            else if (side === 1) cross[side] = crossing(x + 1, y, true, values[1], values[2]);
            else if (side === 2) cross[side] = crossing(x, y + 1, false, values[3], values[2]);
            else cross[side] = crossing(x, y, true, values[0], values[3]);
            if (high[side]) leave = cross[side]; else enter = cross[side];
            count++;
          }
          // In the Canvas y-down frame, ink stays to the segment's right.
          if (count === 2) segment(leave, enter);
          // Four-connected ink keeps diagonal dots separate at a saddle.
          else if (count === 4) for (var corner = 0; corner < 4; corner++) {
            if (high[corner]) segment(cross[corner], cross[(corner + 3) % 4]);
          }
        }
        var visited = new Uint8Array(segments.length), contours = [];
        for (var first = 0; first < segments.length; first++) {
          if (visited[first]) continue;
          var index = first, points = [], area = 0, closed = false, origin = segments[first].start;
          while (index !== undefined && !visited[index]) {
            var edge = segments[index], from = vertices.get(edge.start), to = vertices.get(edge.end);
            visited[index] = 1; points.push(from); area += from.x * to.y - to.x * from.y;
            if (edge.end === origin) { closed = true; break; }
            index = outgoing.get(edge.end);
          }
          if (closed && points.length >= 3 && Math.abs(area) > 0.000001) contours.push({ points: points, area: area * 0.5 });
        }
        return contours;
      }

      function spectralBasis(count) {
        if (spectralBasisCache.has(count)) return spectralBasisCache.get(count);
        var cosine = new Float64Array(count * 48), sine = new Float64Array(count * 48);
        for (var k = 1; k <= 48; k++) for (var i = 0; i < count; i++) {
          var angle = Math.PI * 2 * k * i / count, offset = (k - 1) * count + i;
          cosine[offset] = Math.cos(angle); sine[offset] = Math.sin(angle);
        }
        var basis = { cosine: cosine, sine: sine };
        spectralBasisCache.set(count, basis);
        return basis;
      }

      function spectralCompileContour(contour, originX, originY) {
        var source = contour.points, cumulative = [0], length = 0;
        for (var p = 0; p < source.length; p++) {
          var a = source[p], b = source[(p + 1) % source.length];
          length += Math.hypot(b.x - a.x, b.y - a.y); cumulative.push(length);
        }
        var count = length > 640 ? 512 : length > 240 ? 256 : 128;
        var points = [], cursor = 0, cx = 0, cy = 0;
        for (var i = 0; i < count; i++) {
          var distance = i * length / count;
          while (cursor + 1 < source.length && cumulative[cursor + 1] < distance) cursor++;
          var from = source[cursor], to = source[(cursor + 1) % source.length];
          var t = (distance - cumulative[cursor]) / Math.max(0.0001, cumulative[cursor + 1] - cumulative[cursor]);
          var point = { x: from.x + (to.x - from.x) * t - originX, y: from.y + (to.y - from.y) * t - originY };
          points.push(point); cx += point.x / count; cy += point.y / count;
        }
        var basis = spectralBasis(count), coefficients = [];
        for (var k = 0; k < 48; k++) {
          var xc = 0, xs = 0, yc = 0, ys = 0;
          for (var j = 0; j < count; j++) {
            var c = basis.cosine[k * count + j], s = basis.sine[k * count + j];
            xc += (points[j].x - cx) * c; xs += (points[j].x - cx) * s;
            yc += (points[j].y - cy) * c; ys += (points[j].y - cy) * s;
          }
          coefficients.push({ xc: xc * 2 / count, xs: xs * 2 / count, yc: yc * 2 / count, ys: ys * 2 / count });
        }
        return { points: points, coefficients: coefficients, cx: cx, cy: cy,
          area: contour.area, length: length, radius: Math.sqrt(Math.abs(contour.area) / Math.PI) };
      }

      function spectralContourContains(contour, point) {
        var points = contour.points, inside = false;
        for (var i = 0, j = points.length - 1; i < points.length; j = i++) {
          var a = points[i], b = points[j];
          if ((a.y > point.y) !== (b.y > point.y)
            && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
        }
        return inside;
      }

      function spectralPrepareGlyphContours(contours) {
        // The frequency control describes a glyph, not seven identical waves
        // on every dot, counter and stem. Locate material regions once at
        // compile time and give each component a proportionate fold budget.
        // Canonical glyphs use a 192px em. A standalone period must not get
        // the same fold density as a full-em letter either.
        var dominantLength = 128;
        var bounds = contours.map(function (contour) {
          var box = [Infinity, Infinity, -Infinity, -Infinity];
          for (var b = 0; b < contour.points.length; b++) {
            var point = contour.points[b];
            box[0] = Math.min(box[0], point.x); box[1] = Math.min(box[1], point.y);
            box[2] = Math.max(box[2], point.x); box[3] = Math.max(box[3], point.y);
          }
          return box;
        });
        for (var i = 0; i < contours.length; i++) {
          var current = contours[i], parent = -1, parentArea = Infinity;
          if (current.area > 0) dominantLength = Math.max(dominantLength, current.length);
          for (var j = 0; j < contours.length; j++) {
            var candidateArea = Math.abs(contours[j].area);
            if (j === i || candidateArea <= Math.abs(current.area) || candidateArea >= parentArea) continue;
            var testPoint = current.points[0], box = bounds[j];
            if (testPoint.x < box[0] || testPoint.x > box[2] || testPoint.y < box[1] || testPoint.y > box[3]) continue;
            if (spectralContourContains(contours[j], current.points[0])) { parent = j; parentArea = candidateArea; }
          }
          current.parent = parent;
          current.materialArea = Math.abs(current.area);
          current.materialPerimeter = current.length;
        }
        // Exclude direct child counters from the parent's ink mass. Nested
        // positive islands retain their own region instead of being erased.
        for (var holeIndex = 0; holeIndex < contours.length; holeIndex++) {
          var hole = contours[holeIndex];
          if (hole.area >= 0 || hole.parent < 0) continue;
          var owner = contours[hole.parent];
          owner.materialArea = Math.max(0, owner.materialArea - Math.abs(hole.area));
          owner.materialPerimeter += hole.length;
        }
        for (var index = 0; index < contours.length; index++) {
          var contour = contours[index];
          var region = contour.area < 0 && contour.parent >= 0 ? contours[contour.parent] : contour;
          var strokeMeasure = 2 * region.materialArea / Math.max(1, region.materialPerimeter);
          contour.foldScale = Math.max(0.075, Math.min(1, contour.length / dominantLength));
          contour.foldDepth = Math.min(40, contour.radius * 0.23, strokeMeasure * 0.9);
        }
        return contours;
      }

      function spectralSynthesize(contour, settings, phase, seed) {
        var points = contour.points, count = points.length, basis = spectralBasis(count);
        var amount = Math.max(0, Math.min(4, settings.amount));
        if (amount <= 0.00001) return points;
        var detail = Math.max(2, Math.min(48, settings.detail));
        var frequency = Math.max(2, Math.min(24, Math.round(settings.frequency)));
        var foldFrequency = Math.max(1, Math.round(frequency * (contour.foldScale == null ? 1 : contour.foldScale)));
        var foldDepth = contour.foldDepth == null ? Math.min(40, contour.radius * 0.23) : contour.foldDepth;
        var motion = Math.max(0, Math.min(2, settings.motion));
        var time = settings.phase * Math.PI / 180 + (Math.sin(phase) + (1 - Math.cos(phase)) * 0.35) * motion * 1.7;
        var breathe = 1 + (Math.cos(phase) - 1) * motion * 0.18;
        var hole = contour.area < 0;
        var influence = hole ? 1 - Math.max(0, Math.min(1, settings.counter)) : 1;
        var cutoff = settings.mode === 'liquid' ? detail / (1 + frequency * 0.12) : detail;
        var out = [], weights = [], turnsCos = [], turnsSin = [];
        for (var k = 1; k <= 48; k++) {
          weights.push(Math.exp(-Math.pow(k / Math.max(1.5, cutoff), 4)));
          // Different shifts per harmonic deform the body. A common k*time
          // shift merely reparametrizes a closed path and would not be visible.
          var turn = settings.mode === 'phase' && k > 1
            ? (0.9 + time) * Math.sin(k * 0.73 + frequency * 0.27) * Math.min(1.8, (k - 1) * 0.25) : 0;
          turnsCos.push(Math.cos(turn)); turnsSin.push(Math.sin(turn));
        }
        for (var i = 0; i < count; i++) {
          var x = contour.cx, y = contour.cy, dx = 0, dy = 0;
          for (var harmonic = 0; harmonic < 48; harmonic++) {
            var weight = weights[harmonic]; if (weight < 0.0001) continue;
            var coefficient = contour.coefficients[harmonic];
            var co = basis.cosine[harmonic * count + i], si = basis.sine[harmonic * count + i];
            var turnCos = turnsCos[harmonic], turnSin = turnsSin[harmonic];
            var c = co * turnCos - si * turnSin, s = si * turnCos + co * turnSin;
            x += (coefficient.xc * c + coefficient.xs * s) * weight;
            y += (coefficient.yc * c + coefficient.ys * s) * weight;
            dx += (-coefficient.xc * s + coefficient.xs * c) * (harmonic + 1) * weight;
            dy += (-coefficient.yc * s + coefficient.ys * c) * (harmonic + 1) * weight;
          }
          if (settings.mode === 'fluted') {
            var theta = i / count * Math.PI * 2;
            var wave = Math.sin(theta * foldFrequency + time + seed * 0.013);
            var fine = Math.sin(theta * foldFrequency * 2 - time + seed * 0.021);
            var ridge = (wave + fine * 0.3) * (0.8 + wave * 0.25);
            var relief = foldDepth * ridge * breathe;
            var tangent = Math.max(0.001, Math.hypot(dx, dy));
            x += dy / tangent * relief; y -= dx / tangent * relief;
          } else if (settings.mode === 'liquid') {
            var thetaLiquid = i / count * Math.PI * 2;
            var expansion = Math.sin(thetaLiquid * 2 + time + seed * 0.009) * 0.12 * breathe;
            x += (x - contour.cx) * expansion; y -= (y - contour.cy) * expansion;
          }
          out.push({ x: points[i].x + (x - points[i].x) * amount * influence,
            y: points[i].y + (y - points[i].y) * amount * influence });
        }
        return out;
      }

      function spectralGlyphData(ch, g) {
        if (!String(ch).trim()) return null;
        var spec = g && g.fontAxes ? glyphFontSpec(g, 192) : null;
        var font = spec ? spec.font : params.fontWeight + ' 192px ' + params.fontFamily;
        var key = (spec ? spec.key : font) + '\u0000' + ch;
        if (spectralGlyphCache.has(key)) return spectralGlyphCache.get(key);
        var canvas = (globalThis.TypeDeformerRenderContext ? globalThis.TypeDeformerRenderContext.createCanvas() : createRenderCanvas()), ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.font = font;
        var measure = ctx.measureText(ch);
        ctx.textBaseline = 'middle';
        var middleMeasure = ctx.measureText(ch);
        var middleOffset = Number.isFinite(middleMeasure.actualBoundingBoxAscent) && Number.isFinite(measure.actualBoundingBoxAscent)
          ? measure.actualBoundingBoxAscent - middleMeasure.actualBoundingBoxAscent : 192 * 0.35;
        var left = Math.ceil(Math.max(0, measure.actualBoundingBoxLeft || 0)) + 4;
        var ascent = Math.ceil(Math.max(1, measure.actualBoundingBoxAscent || 192)) + 4;
        canvas.width = Math.max(8, Math.min(4096, left + Math.ceil(Math.max(measure.width, measure.actualBoundingBoxRight || 0)) + 4));
        canvas.height = ascent + Math.ceil(Math.max(0, measure.actualBoundingBoxDescent || 0)) + 4;
        ctx.font = font; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff'; ctx.fillText(ch, left, ascent);
        var contours;
        try { contours = spectralTraceContours(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height); }
        catch (error) { return null; }
        var compiled = contours.map(function (contour) { return spectralCompileContour(contour, left, ascent); });
        spectralPrepareGlyphContours(compiled);
        var total = compiled.reduce(function (sum, contour) { return sum + contour.points.length; }, 0);
        // Bound both cache entries and total geometry, not the number of live
        // glyphs. Long texts and dense Compose scenes never silently lose letters.
        while (spectralGlyphCache.size && (spectralGlyphCache.size >= 96 || spectralCachePoints + total > 49152)) {
          var oldest = spectralGlyphCache.keys().next().value;
          spectralCachePoints -= spectralGlyphCache.get(oldest).pointCount;
          spectralGlyphCache.delete(oldest);
        }
        var result = { contours: compiled, advance: measure.width, middleOffset: middleOffset, ascent: ascent - 4,
          descent: Math.max(0, measure.actualBoundingBoxDescent || 0), pointCount: total, variants: new Map() };
        if (total <= 49152) { spectralGlyphCache.set(key, result); spectralCachePoints += total; }
        return result;
      }

      function spectralGlyphFrame(ctx, g, pixelScale, L, fm, data) {
        ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
        ctx.translate(L.dx, L.dy); ctx.scale(L.s, L.s);
        ctx.translate(g.ox + g.tx, g.oy + g.ty); ctx.rotate((g.rot || 0) * Math.PI / 180);
        ctx.transform(1, Math.tan((g.skewY || 0) * Math.PI / 180), Math.tan((g.skewX || 0) * Math.PI / 180), 1, 0, 0);
        ctx.scale(g.scaleX, g.scaleY); ctx.translate(-g.ox, -g.oy);
        var scale = params.fontSize / 192;
        if (params.vertical) {
          ctx.translate(g.x + g.w / 2, g.y + g.h / 2);
          if (!g.upright) ctx.rotate(Math.PI / 2);
          ctx.scale(scale, scale);
          // Canvas middle baseline is em-box based, not the visible ink box.
          ctx.translate(-data.advance / 2, data.middleOffset);
        } else {
          ctx.translate(g.grid ? g.x + g.w / 2 : g.x, g.y + baselineOffset(g, fm));
          ctx.scale(scale, scale);
          if (g.grid) ctx.translate(-data.advance / 2, 0);
        }
      }

      function renderSpectralType(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        if (coverBase) compositeSurfaceSource(targetCtx, buildSurfaceMask(glyphs, 'spectralType', width, height, pixelScale, L, fm), 'spectralType', true);
        var work = surfaceScratch('spectral-type-v38-body', width, height, false), ctx = work.ctx;
        var phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var color = surfaceEffectColor('spectralType');
        for (var i = 0; i < glyphs.length; i++) {
          var g = glyphs[i], strength = surfaceGlyphStrength(g, 'spectralType');
          if (strength <= 0.002 || (g.opacity != null && g.opacity <= 0.002) || !String(g.ch || '').trim()) continue;
          var profile = g.surface || {};
          function number(key) { return Number.isFinite(profile[key]) ? profile[key] : params[key]; }
          var settings = { mode: BATCH_PARAM_OPTIONS.spectralMode.indexOf(profile.spectralMode) >= 0 ? profile.spectralMode : params.spectralMode,
            amount: number('spectralAmount'), detail: number('spectralDetail'), frequency: number('spectralFrequency'),
            phase: number('spectralPhase'), counter: number('spectralCounter'), motion: number('spectralMotion') };
          // True zero is the native glyph, including font hinting and baseline.
          if (settings.amount <= 0.00001) { drawSurfaceGlyph(ctx, g, pixelScale, L, fm, strength, color); continue; }
          var data = spectralGlyphData(g.ch, g);
          if (!data || !data.contours.length) { drawSurfaceGlyph(ctx, g, pixelScale, L, fm, strength, color); continue; }
          var seed = params.seed * 131 + (String(g.ch).codePointAt(0) || 0);
          var shapeKey = JSON.stringify(settings) + ':' + (settings.motion > 0 ? phase.toFixed(8) : 'static') + ':' + seed;
          var paths = data.variants.get(shapeKey);
          if (!paths) {
            paths = data.contours.map(function (contour) { return spectralSynthesize(contour, settings, phase, seed); });
            if (data.variants.size >= 4) data.variants.delete(data.variants.keys().next().value);
            data.variants.set(shapeKey, paths);
          }
          ctx.save(); spectralGlyphFrame(ctx, g, pixelScale, L, fm, data);
          ctx.globalAlpha = strength * (g.opacity == null ? 1 : g.opacity); ctx.fillStyle = color;
          // A counter is subtraction, never positive ink outside its parent.
          // Clip to the union of positive rings before the even-odd fill;
          // nested islands stay visible and cuts never erase another glyph.
          ctx.beginPath();
          for (var outerIndex = 0; outerIndex < paths.length; outerIndex++) {
            if (data.contours[outerIndex].area < 0) continue;
            var outer = paths[outerIndex]; ctx.moveTo(outer[0].x, outer[0].y);
            for (var op = 1; op < outer.length; op++) ctx.lineTo(outer[op].x, outer[op].y);
            ctx.closePath();
          }
          ctx.clip(); ctx.beginPath();
          for (var pathIndex = 0; pathIndex < paths.length; pathIndex++) {
            var points = paths[pathIndex];
            ctx.moveTo(points[0].x, points[0].y);
            for (var p = 1; p < points.length; p++) ctx.lineTo(points[p].x, points[p].y);
            ctx.closePath();
          }
          ctx.fill('evenodd'); ctx.restore();
        }
        targetCtx.save(); targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height); targetCtx.restore();
      }
