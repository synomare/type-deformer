// Canonical conformal-render declarations. Bundled for both editor and Worker.
// Environment dependencies are declared in manifest.json.

      var ConformalType = (function () {
      // Conformal Type: independent glyph-body research prototype, not editor code.
      // The same holomorphic map transforms every outer ring and counter. No outline
      // decoration, Fourier resynthesis, physics history, texture, or external assets.
      const TAU = Math.PI * 2;
      const finite = (value, fallback, min, max) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

      const CONFORMAL_TYPE_PRESETS = Object.freeze({
        lens: Object.freeze({ amount: .82, power: -1, spiral: 0, angle: -35, motion: .55 }),
        coil: Object.freeze({ amount: .82, power: .2, spiral: 2.5, angle: -45, motion: .55 }),
        flare: Object.freeze({ amount: .8, power: 2.5, spiral: 0, angle: -60, motion: .55 }),
      });

      function normalizeConformalSettings(input = {}) {
        const normalized = (() => {
        return {
          amount: finite(input.amount, 0.72, 0, 0.94),
          power: finite(input.power, -1, -3, 4),
          spiral: finite(input.spiral, 0, -4, 4),
          angle: finite(input.angle, 0, -180, 180),
          motion: finite(input.motion, 0, 0, 1),
        };
      })();
        return globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.core('conformal',input,normalized) : normalized;
      }

      function prepareConformalGlyph(contours) {
        if (!Array.isArray(contours)) throw new TypeError('Contours must be an array');
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const rings = contours.map(contour => {
          if (!Array.isArray(contour.points) || contour.points.length < 3) throw new TypeError('Each ring needs at least three points');
          const points = contour.points.map(p => {
            if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new TypeError('Non-finite source coordinate');
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
            return Object.freeze({ x: p.x, y: p.y });
          });
          return Object.freeze({ points: Object.freeze(points), area: signedArea(points) });
        });
        const cx = rings.length ? (minX + maxX) / 2 : 0;
        const cy = rings.length ? (minY + maxY) / 2 : 0;
        let radius = 1;
        for (const ring of rings) for (const p of ring.points) radius = Math.max(radius, Math.hypot(p.x - cx, p.y - cy));
        return Object.freeze({ rings: Object.freeze(rings), cx, cy, radius });
      }

      function signedArea(points) {
        // Translate before summation to avoid cancellation for large world offsets.
        if (!points.length) return 0;
        const origin = points[0]; let area = 0;
        for (let i = 0; i < points.length; i++) {
          const a = points[i], b = points[(i + 1) % points.length];
          area += (a.x - origin.x) * (b.y - origin.y) - (b.x - origin.x) * (a.y - origin.y);
        }
        return area / 2;
      }

      function createConformalMap(glyph, input, phase = 0) {
        const settings = normalizeConformalSettings(input);
        const phase01 = Number.isFinite(phase) ? ((phase % 1) + 1) % 1 : 0;
        const time = phase01 * TAU;
        const angle = settings.angle * Math.PI / 180 + settings.motion * Math.sin(time) * 0.7;
        const q = settings.amount * (1 - settings.motion * (1 - Math.cos(time)) * 0.22);
        const pr = settings.power, pi = settings.spiral;
        const co = Math.cos(angle), si = Math.sin(angle);
        const { cx, cy, radius } = glyph;
        const identity = q === 0 || (pr === 1 && pi === 0);
        const local = p => ({ x: ((p.x - cx) * co + (p.y - cy) * si) / radius,
          y: (-(p.x - cx) * si + (p.y - cy) * co) / radius });
        function logarithm(p) {
          const z = local(p), x = q * z.x, y = q * z.y;
          // Source lies in |z|<=1 and q<1: principal log never crosses its cut.
          if (1 + x <= 0) throw new RangeError('Point outside the prepared map domain');
          return { x: Math.log1p(2 * x + x * x + y * y) / 2, y: Math.atan2(y, 1 + x) };
        }
        function map(p) {
          if (identity) return { x: p.x, y: p.y };
          const log = logarithm(p);
          let x, y;
          const norm = pr * pr + pi * pi;
          if (norm === 0) { x = log.x / q; y = log.y / q; }
          else {
            const a = pr * log.x - pi * log.y, b = pr * log.y + pi * log.x;
            // Stable expm1(a+ib), including the identity/complex-log limits.
            const ex = Math.expm1(a) * Math.cos(b) - 2 * Math.sin(b / 2) ** 2;
            const ey = Math.exp(a) * Math.sin(b);
            x = (ex * pr + ey * pi) / (norm * q);
            y = (ey * pr - ex * pi) / (norm * q);
          }
          return { x: cx + radius * (x * co - y * si), y: cy + radius * (x * si + y * co) };
        }
        function derivative(p) {
          if (identity) return { x: 1, y: 0 };
          const log = logarithm(p), a = (pr - 1) * log.x - pi * log.y;
          const b = (pr - 1) * log.y + pi * log.x, magnitude = Math.exp(a);
          return { x: magnitude * Math.cos(b), y: magnitude * Math.sin(b) };
        }
        function chordErrorBound(a, b) {
          if (identity) return 0;
          const za = local(a), zb = local(b);
          const ax = 1 + q * za.x, ay = q * za.y, bx = 1 + q * zb.x, by = q * zb.y;
          const dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy;
          const t = length2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length2)) : 0;
          const rMin = Math.hypot(ax + t * dx, ay + t * dy);
          const rMax = Math.max(Math.hypot(ax, ay), Math.hypot(bx, by));
          const radial = Math.pow(pr >= 2 ? rMax : rMin, pr - 2);
          const angular = Math.exp(Math.max(-pi * Math.atan2(ay, ax), -pi * Math.atan2(by, bx)));
          const secondDerivative = q * Math.hypot(pr - 1, pi) / radius * radial * angular;
          return ((b.x - a.x) ** 2 + (b.y - a.y) ** 2) * secondDerivative / 8;
        }
        function derivativeBoundForBox(box) {
          if (identity) return 1;
          const corners = [{ x: box[0], y: box[1] }, { x: box[2], y: box[1] },
            { x: box[2], y: box[3] }, { x: box[0], y: box[3] }].map(p => {
            const z = local(p); return { x: 1 + q * z.x, y: q * z.y };
          });
          // A box may extend beyond the containing disk. Never use its bound if it
          // crosses the log cut/right-half-plane guard; descend to smaller nodes.
          if (corners.some(p => p.x <= 0)) return Infinity;
          let rMin = Infinity, rMax = 0, angular = 0;
          for (let i = 0; i < 4; i++) {
            const a = corners[i], b = corners[(i + 1) % 4], dx = b.x - a.x, dy = b.y - a.y;
            const d2 = dx * dx + dy * dy, t = d2 ? Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / d2)) : 0;
            rMin = Math.min(rMin, Math.hypot(a.x + t * dx, a.y + t * dy));
            rMax = Math.max(rMax, Math.hypot(a.x, a.y));
            angular = Math.max(angular, Math.exp(-pi * Math.atan2(a.y, a.x)));
          }
          return Math.pow(pr >= 1 ? rMax : rMin, pr - 1) * angular;
        }
        // A sufficient (not necessary) global injectivity condition: imaginary span
        // of p*Log(1+qz) is <2pi over the containing disk. Else overlaps are possible,
        // even though the analytic local derivative is nonzero everywhere.
        const argumentSpanBound = Math.abs(pr) * 2 * Math.asin(q)
          + Math.abs(pi) * Math.log((1 + q) / (1 - q));
        return { map, derivative, chordErrorBound, derivativeBoundForBox, identity, settings,
          injectivity: pr === 0 && pi === 0 || argumentSpanBound < TAU ? 'certified-domain' : 'overlap-possible',
          argumentSpanBound };
      }

      function deformConformalGlyph(glyph, input, phase = 0, options = {}) {
        const transform = createConformalMap(glyph, input, phase);
        const tolerance = finite(options.tolerance, 0.08, 0.00001, 10);
        const maxPoints = Math.floor(finite(options.maxPoints, 131072, 3, 1000000));
        let pointCount = 0, subdivisions = 0, maxErrorBound = 0;
        const rings = glyph.rings.map(ring => {
          const points = [], material = [];
          function edge(a, b, mappedA, mappedB, u0, u1, depth) {
            const error = transform.chordErrorBound(a, b);
            if (error > tolerance) {
              if (depth >= 24 || pointCount >= maxPoints) throw new RangeError('Conformal geometry budget exceeded; output not truncated');
              const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, mappedMid = transform.map(mid);
              const um = (u0 + u1) / 2; subdivisions++;
              edge(a, mid, mappedA, mappedMid, u0, um, depth + 1);
              edge(mid, b, mappedMid, mappedB, um, u1, depth + 1);
            } else {
              if (++pointCount > maxPoints) throw new RangeError('Conformal geometry budget exceeded; output not truncated');
              if (!Number.isFinite(mappedA.x) || !Number.isFinite(mappedA.y)) throw new RangeError('Non-finite transformed geometry');
              points.push(mappedA); material.push(u0); maxErrorBound = Math.max(maxErrorBound, error);
            }
          }
          const mapped = ring.points.map(transform.map);
          for (let i = 0; i < ring.points.length; i++) {
            const j = (i + 1) % ring.points.length;
            edge(ring.points[i], ring.points[j], mapped[i], mapped[j], i, i + 1, 0);
          }
          return { points, material, area: signedArea(points), sourceArea: ring.area };
        });
        return { rings, pointCount, subdivisions, maxErrorBound, tolerance,
          injectivity: transform.injectivity, argumentSpanBound: transform.argumentSpanBound };
      }

      // Retain the original high-resolution polyline. Every tree node knows the
      // distance of that entire source arc to its chord, not just the last revision.
      // This is an error-bounded hierarchy, not CGAL topology-preserving decimation.
      function compileConformalGlyph(glyph) {
        let nodeCount = 0;
        const trees = glyph.rings.map(ring => {
          const source = ring.points, count = source.length;
          function build(start, end) {
            const a = source[start % count], b = source[end % count];
            const box = [Infinity, Infinity, -Infinity, -Infinity];
            const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
            let error2 = 0;
            for (let i = start; i <= end; i++) {
              const p = source[i % count];
              box[0] = Math.min(box[0], p.x); box[1] = Math.min(box[1], p.y);
              box[2] = Math.max(box[2], p.x); box[3] = Math.max(box[3], p.y);
              const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
              error2 = Math.max(error2, (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2);
            }
            const node = { start, end, a, b, box, sourceError: Math.sqrt(error2), left: null, right: null };
            if (end - start > 1) {
              const middle = (start + end) >> 1;
              node.left = build(start, middle); node.right = build(middle, end);
            }
            nodeCount++;
            return node;
          }
          // Each closed ring keeps at least 3/4 original anchors even at tiny scale.
          // No detached mark or counter can disappear because it failed a quota.
          const roots = [], divisions = Math.min(4, count);
          for (let i = 0; i < divisions; i++) roots.push(build(Math.floor(i * count / divisions), Math.floor((i + 1) * count / divisions)));
          return roots;
        });
        return { glyph, trees, nodeCount };
      }

      function renderConformalLod(compiled, settings, phase = 0, options = {}) {
        const transform = createConformalMap(compiled.glyph, settings, phase);
        const tolerance = Number.isFinite(options.tolerance) ? Math.max(.00001, Math.min(10, options.tolerance)) : .08;
        const maxPoints = Number.isFinite(options.maxPoints) ? Math.max(3, Math.min(1000000, Math.floor(options.maxPoints))) : 131072;
        let pointCount = 0, visitedNodes = 0, mappedPoints = 0, maxErrorBound = 0;
        const map = p => { mappedPoints++; return transform.map(p); };
        const rings = compiled.glyph.rings.map((ring, index) => {
          const points = [], spans = [];
          function emit(a, start, end, error) {
            if (++pointCount > maxPoints) throw new RangeError('Conformal geometry budget exceeded; output not truncated');
            const p = map(a);
            if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new RangeError('Non-finite transformed geometry');
            points.push(p); spans.push([start, end]); maxErrorBound = Math.max(maxErrorBound, error);
          }
          function edge(a, b, start, end, depth) {
            const error = transform.chordErrorBound(a, b);
            if (error <= tolerance) { emit(a, start, end, error); return; }
            if (depth >= 24 || pointCount >= maxPoints) throw new RangeError('Conformal geometry budget exceeded; output not truncated');
            const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, u = (start + end) / 2;
            edge(a, middle, start, u, depth + 1); edge(middle, b, u, end, depth + 1);
          }
          function visit(node) {
            visitedNodes++;
            if (!node.left) { edge(node.a, node.b, node.start, node.end, 0); return; }
            const sourceBound = node.sourceError === 0 ? 0 : node.sourceError * transform.derivativeBoundForBox(node.box);
            const bound = sourceBound + transform.chordErrorBound(node.a, node.b);
            if (bound <= tolerance) emit(node.a, node.start, node.end, bound);
            else { visit(node.left); visit(node.right); }
          }
          compiled.trees[index].forEach(visit);
          return { points, spans, sourceArea: ring.area, area: signedArea(points) };
        });
        return { rings, pointCount, mappedPoints, visitedNodes, maxErrorBound, tolerance,
          injectivity: transform.injectivity, argumentSpanBound: transform.argumentSpanBound };
      }

      // Maximum singular value of the actual affine transform maps a glyph-space
      // error to a physical-pixel bound, including skew/mirror and export scale.
      function conformalPixelTolerance(matrix, pixelError = .2) {
        const { a, b, c, d } = matrix;
        if (![a, b, c, d, pixelError].every(Number.isFinite) || pixelError <= 0) throw new TypeError('Invalid output transform');
        const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d));
        if (scale === 0) return 10;
        const an = a / scale, bn = b / scale, cn = c / scale, dn = d / scale;
        const aa = an * an + bn * bn, cc = cn * cn + dn * dn, ac = an * cn + bn * dn;
        const sigma = scale * Math.sqrt((aa + cc + Math.hypot(aa - cc, 2 * ac)) / 2);
        // Fail explicitly instead of quietly losing the requested precision at
        // exceptionally high zoom. Singular/invisible transforms need no detail.
        const tolerance = sigma > 0 ? pixelError / sigma : 10;
        if (tolerance < .00001) throw new RangeError('Output scale exceeds Conformal precision budget');
        return Math.min(10, tolerance);
      }
      // Active glyph leases only: copies share a source; no active glyph is evicted
      // to make room for another. Over budget is explicit, never lower resolution.
      function createConformalSourcePool(options = {}) {
        const limit = options.pointLimit ?? 262144;
        let entries = new Map(), points = 0, paused = false;
        function sync(requests) {
          const next = new Map();
          for (const request of requests) if (!next.has(request.key)) {
            next.set(request.key, entries.get(request.key) || { request, data: null, error: '' });
          }
          entries = next;
          points = [...entries.values()].reduce((sum, entry) => sum + (entry.data?.pointCount || 0), 0);
        }
        function advance() {
          if (paused) return false;
          const entry = [...entries.values()].find(e => !e.data && !e.error);
          if (!entry) return false;
          try {
            const data = entry.request.load(Math.max(0, limit - points));
            if (!Number.isInteger(data.pointCount) || data.pointCount < 0) throw new Error('Invalid glyph source');
            if (points + data.pointCount > limit) throw new RangeError('字形メモリ上限に達しました。適用する文字種を減らしてください。');
            entry.data = data; points += data.pointCount;
          } catch (error) { entry.error = error.message || String(error); }
          return true;
        }
        function retry() { for (const entry of entries.values()) entry.error = ''; paused = false; }
        function state() {
          const all = [...entries.values()], ready = all.filter(e => e.data).length;
          return { total: all.length, ready, pending: all.some(e => !e.data && !e.error), paused, points,
            error: all.find(e => e.error)?.error || '', limit };
        }
        function inspect(key) {
          const entry = entries.get(key);
          return { status: !entry ? 'missing' : entry.data ? 'ready' : entry.error ? 'error' : 'pending', error: entry?.error || '' };
        }
        return { sync, advance, retry, state, inspect, read: key => entries.get(key)?.data || null,
          setPaused: value => { paused = !!value; }, reset: () => { entries.clear(); points = 0; paused = false; } };
      }
      return { CONFORMAL_TYPE_PRESETS, normalizeConformalSettings, prepareConformalGlyph, createConformalMap, compileConformalGlyph, renderConformalLod, conformalPixelTolerance, createConformalSourcePool };
      })();

      var conformalPool = ConformalType.createConformalSourcePool({ pointLimit: 262144 });

      var conformalFontRevision = 0;

      var conformalTimer = null;

      var conformalRenderError = '';

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
        var canvas = createRenderCanvas(), ctx = canvas.getContext('2d', { willReadFrequently: true });
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
