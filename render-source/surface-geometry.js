// Canonical surface-geometry declarations. Bundled for both editor and Worker.
// Environment dependencies are declared in manifest.json.

      var SURFACE_BLEND_MODES = ['source-over', 'multiply', 'screen', 'overlay', 'difference', 'lighter'];

      var SURFACE_OPACITY_KEYS = TypeDeformerOperatorRegistry.tables.SURFACE_OPACITY_KEYS;

      var SURFACE_SOURCE_OPACITY_KEYS = TypeDeformerOperatorRegistry.tables.SURFACE_SOURCE_OPACITY_KEYS;

      var SURFACE_BLEND_KEYS = TypeDeformerOperatorRegistry.tables.SURFACE_BLEND_KEYS;

      function surfaceOperatorStrength(info, id) {
        var state = readOperatorState(info, id);
        return Math.max(0, Math.min(1, numericManual(state, state.current)));
      }

      var surfaceEnvelopeScale = 1;

      function surfaceGlyphStrength(g, id) {
        var value = g && g.surface ? Number(g.surface[id]) : 0;
        return isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
      }

      var SURFACE_SOURCE_MODE_KEYS = TypeDeformerOperatorRegistry.tables.SURFACE_SOURCE_MODE_KEYS;

      var SURFACE_COLOR_KEYS = TypeDeformerOperatorRegistry.tables.SURFACE_COLOR_KEYS;

      function surfaceSourceMode(id) {
        var key = SURFACE_SOURCE_MODE_KEYS[id];
        return key && params[key] ? params[key] : 'keep';
      }

      function surfaceSourceOpacity(id) {
        var key = SURFACE_SOURCE_OPACITY_KEYS[id];
        var value = key ? Number(params[key]) : NaN;
        if (isFinite(value)) return Math.max(0, Math.min(1, value));
        var mode = surfaceSourceMode(id);
        return mode === 'hide' ? 0 : (mode === 'ghost' ? 0.22 : 1);
      }

      function surfaceEffectColor(id) {
        var key = SURFACE_COLOR_KEYS[id];
        return key && params[key] ? params[key] : params.ink;
      }

      function surfaceOutputOpacity(id) {
        var key = SURFACE_OPACITY_KEYS[id];
        var value = key ? Number(params[key]) : 1;
        return isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
      }

      function surfaceBlendMode(id) {
        var key = SURFACE_BLEND_KEYS[id];
        var value = key ? params[key] : 'source-over';
        return SURFACE_BLEND_MODES.indexOf(value) === -1 ? 'source-over' : value;
      }

      function surfaceAggregate(glyphs, id, key, fallback) {
        var total = 0, weight = 0, maximum = 0;
        for (var i = 0; i < glyphs.length; i++) {
          var strength = surfaceGlyphStrength(glyphs[i], id);
          if (strength <= 0.002) continue;
          var raw = glyphs[i].surface && Number(glyphs[i].surface[key]);
          var value = isFinite(raw) ? raw : fallback;
          total += value * strength;
          weight += strength;
          maximum = Math.max(maximum, strength);
        }
        return { value: weight ? total / weight : fallback, strength: maximum, weight: weight };
      }

      function surfaceChoice(glyphs, id, key, fallback, options) {
        var scores = Object.create(null), maximum = 0, choice = fallback;
        for (var i = 0; i < glyphs.length; i++) {
          var strength = surfaceGlyphStrength(glyphs[i], id);
          if (strength <= 0.002) continue;
          var value = glyphs[i].surface && glyphs[i].surface[key];
          if (options.indexOf(value) === -1) value = fallback;
          scores[value] = (scores[value] || 0) + strength;
          if (scores[value] > maximum) {
            maximum = scores[value];
            choice = value;
          }
        }
        return choice;
      }

      function surfaceScratch(name, width, height, readFrequently) {
        var canvas = surfaceFxScratchCanvases[name];
        var renderContext=globalThis.TypeDeformerRenderContext,contextKey=renderContext?renderContext.key():'analysis';
        if (!canvas || canvas._tdScratchKey !== contextKey) {
          if(canvas && renderContext) renderContext.release(canvas);
          canvas = renderContext ? renderContext.createCanvas(width,height,{tiled:true}) : (globalThis.TypeDeformerRenderContext ? globalThis.TypeDeformerRenderContext.createCanvas() : createRenderCanvas());
          canvas._tdScratchKey=contextKey;
          surfaceFxScratchCanvases[name] = canvas;
        }
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        if (renderContext) renderContext.account(canvas);
        var ctx = canvas.getContext('2d', readFrequently ? { willReadFrequently: true } : undefined);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        if ('filter' in ctx) ctx.filter = 'none';
        ctx.clearRect(0, 0, width, height);
        return { canvas: canvas, ctx: ctx };
      }

      function surfaceGlyphTextSpec(g, fm) {
        var spec = { text: g.ch,
          font: g.fontAxes ? glyphFontSpec(g, params.fontSize).font : params.fontWeight + ' ' + params.fontSize + 'px ' + params.fontFamily,
          align: params.vertical || g.grid ? 'center' : 'left',
          baseline: params.vertical ? 'middle' : 'alphabetic',
          x: params.vertical || g.grid ? g.x + g.w / 2 : g.x,
          y: params.vertical ? g.y + g.h / 2 : g.y + baselineOffset(g, fm),
          angle: params.vertical && !g.upright ? Math.PI / 2 : 0 };
        return spec;
      }

      function drawSurfaceGlyph(ctx, g, pixelScale, L, fm, alpha, color) {
        if (alpha <= 0.001) return;
        ctx.save();
        ctx.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
        ctx.translate(L.dx, L.dy);
        ctx.scale(L.s, L.s);
        ctx.translate(g.ox + g.tx, g.oy + g.ty);
        ctx.rotate((g.rot || 0) * Math.PI / 180);
        ctx.transform(1, Math.tan((g.skewY || 0) * Math.PI / 180), Math.tan((g.skewX || 0) * Math.PI / 180), 1, 0, 0);
        ctx.scale(g.scaleX, g.scaleY);
        ctx.translate(-g.ox, -g.oy);
        ctx.globalAlpha = alpha * (g.opacity == null ? 1 : g.opacity);
        var spec = surfaceGlyphTextSpec(g, fm);
        ctx.font = spec.font;
        ctx.fillStyle = color || '#fff';
        ctx.textAlign = spec.align;
        if ('direction' in ctx) ctx.direction = g.direction || 'ltr';
        ctx.textBaseline = spec.baseline;
        if (spec.angle) {
          ctx.translate(spec.x, spec.y);
          ctx.rotate(spec.angle);
          ctx.fillText(spec.text, 0, 0);
        } else ctx.fillText(spec.text, spec.x, spec.y);
        ctx.restore();
      }

      function surfaceGlyphNode(g, operatorId, pixelScale, L, phase, chaos, speed, index, localU, localV, radiusScale) {
        localU = localU == null ? 0.5 : localU;
        localV = localV == null ? 0.5 : localV;
        radiusScale = radiusScale == null ? 1 : radiusScale;
        var localX = g.x + g.w * localU;
        var localY = g.y + g.h * localV;
        var rad = (g.rot || 0) * Math.PI / 180;
        var cos = Math.cos(rad), sin = Math.sin(rad);
        var tanX = Math.tan((g.skewX || 0) * Math.PI / 180);
        var tanY = Math.tan((g.skewY || 0) * Math.PI / 180);
        var a = cos * g.scaleX - sin * tanY * g.scaleX;
        var b = sin * g.scaleX + cos * tanY * g.scaleX;
        var c = cos * tanX * g.scaleY - sin * g.scaleY;
        var d = sin * tanX * g.scaleY + cos * g.scaleY;
        var lx = localX - g.ox, ly = localY - g.oy;
        var logicalX = g.ox + g.tx + a * lx + c * ly;
        var logicalY = g.oy + g.ty + b * lx + d * ly;
        var transformedW = Math.abs(g.w * g.scaleX);
        var transformedH = Math.abs(g.h * g.scaleY);
        var baseRadius = Math.max(2, Math.min(transformedW, transformedH) * 0.24 * L.s * pixelScale) * radiusScale;
        var wobblePhase = phase * (0.35 + speed * 2.4) + index * 1.618;
        return {
          x: (L.dx + logicalX * L.s) * pixelScale + Math.cos(wobblePhase * 1.07) * baseRadius * chaos * 0.48,
          y: (L.dy + logicalY * L.s) * pixelScale + Math.sin(wobblePhase * 0.91) * baseRadius * chaos * 0.48,
          r: baseRadius * (0.72 + hash(index, params.seed % 61, 503) * 0.56),
          strength: surfaceGlyphStrength(g, operatorId),
          glyphIndex: index,
          glyph: g
        };
      }

      function surfaceNodesForGlyphs(glyphs, operatorId, maxNodes, pixelScale, L, phase, chaos, speed) {
        var active = [];
        for (var i = 0; i < glyphs.length; i++) {
          if (surfaceGlyphStrength(glyphs[i], operatorId) > 0.002 && (glyphs[i].opacity == null || glyphs[i].opacity > 0.002)) {
            active.push({ glyph: glyphs[i], index: i });
          }
        }
        var stride = Math.max(1, Math.ceil(active.length / Math.max(1, maxNodes || active.length)));
        var nodes = [];
        for (var a = 0; a < active.length; a += stride) {
          nodes.push(surfaceGlyphNode(active[a].glyph, operatorId, pixelScale, L, phase, chaos, speed, active[a].index));
        }
        return nodes;
      }

      function surfaceFieldNodesForGlyphs(glyphs, operatorId, maxNodes, nodesPerGlyph, pixelScale, L, phase, chaos, speed) {
        var active = [];
        for (var i = 0; i < glyphs.length; i++) {
          if (surfaceGlyphStrength(glyphs[i], operatorId) > 0.002 && (glyphs[i].opacity == null || glyphs[i].opacity > 0.002)) {
            active.push({ glyph: glyphs[i], index: i });
          }
        }
        if (!active.length) return [];
        var glyphStride = Math.max(1, Math.ceil(active.length / Math.max(1, maxNodes)));
        var sampledGlyphs = Math.ceil(active.length / glyphStride);
        var perGlyph = Math.max(1, Math.min(nodesPerGlyph, Math.floor(maxNodes / Math.max(1, sampledGlyphs))));
        var nodes = [];
        for (var a = 0; a < active.length && nodes.length < maxNodes; a += glyphStride) {
          for (var p = 0; p < perGlyph && nodes.length < maxNodes; p++) {
            var seedIndex = active[a].index * 11 + p;
            var angle = hash(seedIndex, params.seed % 83, 509) * Math.PI * 2 + p * 2.39996;
            var orbit = 0.22 + hash(p, seedIndex, params.seed + 511) * 0.2;
            var localU = Math.max(0.1, Math.min(0.9, 0.5 + Math.cos(angle) * orbit));
            var localV = Math.max(0.1, Math.min(0.9, 0.5 + Math.sin(angle) * orbit * 1.08));
            var node = surfaceGlyphNode(active[a].glyph, operatorId, pixelScale, L, phase, chaos, speed,
              seedIndex, localU, localV, 0.48 + hash(seedIndex, p, params.seed + 521) * 0.28);
            node.glyphIndex = active[a].index;
            nodes.push(node);
          }
        }
        return nodes;
      }

      function surfaceGraphEdges(nodes, reach, extraLinks, salt, maxBridgeFactor, crossGlyphOnly) {
        if (nodes.length < 2) return [];
        var edges = [], used = {};
        var maxBridge = Math.max(reach, reach * (maxBridgeFactor || 2.4));
        function addEdge(a, b, kind) {
          if (a === b) return;
          var lo = Math.min(a, b), hi = Math.max(a, b);
          var key = lo + ':' + hi;
          if (used[key]) return;
          var dx = nodes[hi].x - nodes[lo].x, dy = nodes[hi].y - nodes[lo].y;
          var distance = Math.sqrt(dx * dx + dy * dy);
          used[key] = true;
          edges.push({ a: nodes[lo], b: nodes[hi], ai: lo, bi: hi, distance: distance, kind: kind || 'near' });
        }

        var selected = new Array(nodes.length);
        selected[0] = true;
        for (var count = 1; count < nodes.length; count++) {
          var bestA = -1, bestB = -1, bestDistance = Infinity;
          for (var i = 0; i < nodes.length; i++) if (selected[i]) {
            for (var j = 0; j < nodes.length; j++) if (!selected[j]) {
              if (crossGlyphOnly && nodes[i].glyphIndex === nodes[j].glyphIndex) continue;
              var dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y;
              var distance = dx * dx + dy * dy;
              if (distance < bestDistance) { bestDistance = distance; bestA = i; bestB = j; }
            }
          }
          if (bestB < 0) break;
          selected[bestB] = true;
          if (Math.sqrt(bestDistance) <= maxBridge) addEdge(bestA, bestB, 'trunk');
        }

        var linkDemand = Math.max(0, Math.min(4, extraLinks || 0));
        var baseLinks = Math.floor(linkDemand);
        var fractionalLink = linkDemand - baseLinks;
        for (var n = 0; n < nodes.length; n++) {
          var linksPerNode = Math.min(4, baseLinks + (hash(n, salt, params.seed + 523) < fractionalLink ? 1 : 0));
          var nearest = [];
          for (var m = n + 1; m < nodes.length; m++) {
            if (crossGlyphOnly && nodes[n].glyphIndex === nodes[m].glyphIndex) continue;
            var ndx = nodes[m].x - nodes[n].x, ndy = nodes[m].y - nodes[n].y;
            var nd = Math.sqrt(ndx * ndx + ndy * ndy);
            if (nd < 2 || nd > reach) continue;
            nearest.push({ index: m, distance: nd, bias: hash(n, m, params.seed + salt) });
          }
          nearest.sort(function (left, right) {
            var ld = left.distance * (0.92 + left.bias * 0.16);
            var rd = right.distance * (0.92 + right.bias * 0.16);
            return ld - rd;
          });
          for (var k = 0; k < Math.min(linksPerNode, nearest.length); k++) addEdge(n, nearest[k].index, 'branch');
        }
        return edges;
      }

      function surfaceCurveSpec(a, b, phase, tension, salt, spread) {
        var dx = b.x - a.x, dy = b.y - a.y;
        var distance = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
        var nx = -dy / distance, ny = dx / distance;
        var randomSign = hash(salt, params.seed % 79, 541) > 0.5 ? 1 : -1;
        var pulse = Math.sin(phase * (0.65 + hash(salt, 3, 547) * 0.8) + salt * 1.73);
        var bend = distance * (0.035 + tension * 0.16) * (0.55 + Math.abs(pulse) * 0.65) * randomSign;
        var lane = spread || 0;
        return {
          x0: a.x + nx * lane,
          y0: a.y + ny * lane,
          x1: a.x + dx * 0.34 + nx * (bend + lane * 0.55),
          y1: a.y + dy * 0.34 + ny * (bend + lane * 0.55),
          x2: a.x + dx * 0.68 + nx * (bend * (0.35 + pulse * 0.38) - lane * 0.55),
          y2: a.y + dy * 0.68 + ny * (bend * (0.35 + pulse * 0.38) - lane * 0.55),
          x3: b.x - nx * lane,
          y3: b.y - ny * lane
        };
      }

      function drawSurfaceTube(ctx, a, b, width, phase, tension, salt, alpha) {
        var curve = surfaceCurveSpec(a, b, phase, tension, salt, 0);
        var previous = cubicSurfacePoint(curve, 0);
        var segments = 3;
        ctx.lineCap = 'round';
        ctx.globalAlpha = alpha * 0.72;
        ctx.lineWidth = Math.max(0.65, width * 0.76);
        ctx.beginPath();
        ctx.moveTo(curve.x0, curve.y0);
        ctx.bezierCurveTo(curve.x1, curve.y1, curve.x2, curve.y2, curve.x3, curve.y3);
        ctx.stroke();
        for (var i = 1; i <= segments; i++) {
          var t = i / segments;
          var point = cubicSurfacePoint(curve, t);
          var taper = 0.68 + Math.sin(t * Math.PI) * 0.32;
          var flow = 0.82 + Math.sin(phase * 1.7 + salt + t * Math.PI * 2) * 0.18;
          ctx.globalAlpha = alpha * (0.78 + taper * 0.22);
          ctx.lineWidth = Math.max(0.65, width * taper * flow);
          ctx.beginPath();
          ctx.moveTo(previous.x, previous.y);
          ctx.lineTo(point.x, point.y);
          ctx.stroke();
          previous = point;
        }
      }

      function surfaceBoundaryDistance(alphaData, width, height) {
        var count = width * height;
        var inside = new Uint8Array(count);
        var distance = new Float32Array(count);
        var infinity = 1000000000;
        var minX = width, minY = height, maxX = -1, maxY = -1;
        var x, y, index;
        for (index = 0; index < count; index++) {
          inside[index] = alphaData[index * 4 + 3] > 20 ? 1 : 0;
          if (inside[index]) {
            x = index % width;
            y = Math.floor(index / width);
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
        for (y = 0; y < height; y++) for (x = 0; x < width; x++) {
          index = y * width + x;
          var value = inside[index];
          var boundary = !!value && (x === 0 || y === 0 || x === width - 1 || y === height - 1);
          if (x > 0 && inside[index - 1] !== value) boundary = true;
          if (x + 1 < width && inside[index + 1] !== value) boundary = true;
          if (y > 0 && inside[index - width] !== value) boundary = true;
          if (y + 1 < height && inside[index + width] !== value) boundary = true;
          distance[index] = boundary ? 0 : infinity;
        }
        var diagonal = 1.41421356;
        for (y = 0; y < height; y++) for (x = 0; x < width; x++) {
          index = y * width + x;
          var d = distance[index];
          if (x > 0) d = Math.min(d, distance[index - 1] + 1);
          if (y > 0) d = Math.min(d, distance[index - width] + 1);
          if (x > 0 && y > 0) d = Math.min(d, distance[index - width - 1] + diagonal);
          if (x + 1 < width && y > 0) d = Math.min(d, distance[index - width + 1] + diagonal);
          distance[index] = d;
        }
        for (y = height - 1; y >= 0; y--) for (x = width - 1; x >= 0; x--) {
          index = y * width + x;
          var reverse = distance[index];
          if (x + 1 < width) reverse = Math.min(reverse, distance[index + 1] + 1);
          if (y + 1 < height) reverse = Math.min(reverse, distance[index + width] + 1);
          if (x + 1 < width && y + 1 < height) reverse = Math.min(reverse, distance[index + width + 1] + diagonal);
          if (x > 0 && y + 1 < height) reverse = Math.min(reverse, distance[index + width - 1] + diagonal);
          distance[index] = reverse;
        }
        return { inside: inside, distance: distance, bounds: maxX >= 0 ? [minX, minY, maxX, maxY] : null };
      }

      function surfaceBoundaryEnvelopeCanvas(field, width, height, outerReach, outerOpacity, name) {
        var envelope = surfaceScratch(name, width, height, false);
        var image = envelope.ctx.createImageData(width, height);
        var reach = Math.max(0.001, outerReach || 0.001);
        var outsideAlpha = Math.max(0, Math.min(1, outerOpacity == null ? 0 : outerOpacity));
        for (var index = 0; index < field.inside.length; index++) {
          var alpha = field.inside[index] ? 1 : 0;
          if (!alpha && outsideAlpha > 0 && field.distance[index] <= reach) {
            var edge = 1 - field.distance[index] / reach;
            alpha = outsideAlpha * edge * edge * (3 - 2 * edge);
          }
          if (alpha <= 0.001) continue;
          var pixel = index * 4;
          image.data[pixel] = image.data[pixel + 1] = image.data[pixel + 2] = 255;
          image.data[pixel + 3] = Math.round(alpha * 255);
        }

        // Destination material shading; the analysis grid and topology stay fixed.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext,discard=new Float64Array(4);RC.field(image,function(px,py,rgba){var x=px-.5,y=py-.5,outputX=x,outputY=y;var index=Math.floor(y)*(width)+Math.floor(x);
          var alpha = (RC.sample(field.inside,width,height,x,y)>=.5) ? 1 : 0;
          if (!alpha && outsideAlpha > 0 && RC.sample(field.distance,width,height,x,y) <= reach) {
            var edge = 1 - RC.sample(field.distance,width,height,x,y) / reach;
            alpha = outsideAlpha * edge * edge * (3 - 2 * edge);
          }
          if (alpha <= 0.001) return;
          var pixel = index * 4;
          rgba[0] = rgba[1] = rgba[2] = 255;
          rgba[3] = Math.round(alpha * 255);

        });}
        envelope.ctx.putImageData(image, 0, 0);
        return envelope.canvas;
      }

      function surfaceSignedDistanceValue(field, index) {
        var distance = field.distance[index] + 0.5;
        return field.inside[index] ? distance : -distance;
      }

      function surfaceFieldNormal(field, width, height, x, y) {
        var left = Math.max(0, x - 2), right = Math.min(width - 1, x + 2);
        var top = Math.max(0, y - 2), bottom = Math.min(height - 1, y + 2);
        var gx = surfaceSignedDistanceValue(field, y * width + right)
          - surfaceSignedDistanceValue(field, y * width + left);
        var gy = surfaceSignedDistanceValue(field, bottom * width + x)
          - surfaceSignedDistanceValue(field, top * width + x);
        var length = Math.hypot(gx, gy);
        if (length < 0.0001) {
          var bounds = field.bounds || [0, 0, width - 1, height - 1];
          gx = (bounds[0] + bounds[2]) * 0.5 - x;
          gy = (bounds[1] + bounds[3]) * 0.5 - y;
          length = Math.max(0.0001, Math.hypot(gx, gy));
        }
        // Signed distance increases towards the black body, so its negative
        // gradient is the outward contour normal.
        return { x: -gx / length, y: -gy / length };
      }

      function surfaceDistanceFromSeeds(seeds, width, height) {
        var count = width * height;
        var distance = new Float32Array(count);
        var infinity = 1000000000;
        var x, y, index;
        for (index = 0; index < count; index++) distance[index] = seeds[index] ? 0 : infinity;
        var diagonal = 1.41421356;
        for (y = 0; y < height; y++) for (x = 0; x < width; x++) {
          index = y * width + x;
          var forward = distance[index];
          if (x > 0) forward = Math.min(forward, distance[index - 1] + 1);
          if (y > 0) forward = Math.min(forward, distance[index - width] + 1);
          if (x > 0 && y > 0) forward = Math.min(forward, distance[index - width - 1] + diagonal);
          if (x + 1 < width && y > 0) forward = Math.min(forward, distance[index - width + 1] + diagonal);
          distance[index] = forward;
        }
        for (y = height - 1; y >= 0; y--) for (x = width - 1; x >= 0; x--) {
          index = y * width + x;
          var reverse = distance[index];
          if (x + 1 < width) reverse = Math.min(reverse, distance[index + 1] + 1);
          if (y + 1 < height) reverse = Math.min(reverse, distance[index + width] + 1);
          if (x + 1 < width && y + 1 < height) reverse = Math.min(reverse, distance[index + width + 1] + diagonal);
          if (x > 0 && y + 1 < height) reverse = Math.min(reverse, distance[index + width - 1] + diagonal);
          distance[index] = reverse;
        }
        return distance;
      }

      function surfaceVoidTopology(field, width, height) {
        var count = width * height;
        var outside = new Uint8Array(count);
        var counter = new Uint8Array(count);
        var visited = new Uint8Array(count);
        var queue = new Int32Array(count);
        var head = 0, tail = 0;
        function enqueue(index) {
          if (index < 0 || index >= count || field.inside[index] || outside[index]) return;
          outside[index] = 1;
          queue[tail++] = index;
        }
        var x, y;
        for (x = 0; x < width; x++) {
          enqueue(x);
          enqueue((height - 1) * width + x);
        }
        for (y = 1; y + 1 < height; y++) {
          enqueue(y * width);
          enqueue(y * width + width - 1);
        }
        while (head < tail) {
          var current = queue[head++];
          var cx = current % width;
          var cy = Math.floor(current / width);
          if (cx > 0) enqueue(current - 1);
          if (cx + 1 < width) enqueue(current + 1);
          if (cy > 0) enqueue(current - width);
          if (cy + 1 < height) enqueue(current + width);
        }
        var components = [];
        for (var index = 0; index < count; index++) {
          if (field.inside[index] || outside[index]) continue;
          counter[index] = 1;
        }
        for (var start = 0; start < count; start++) {
          if (!counter[start] || visited[start]) continue;
          head = 0; tail = 0; queue[tail++] = start; visited[start] = 1;
          var size = 0, sumX = 0, sumY = 0;
          var minX = width, minY = height, maxX = -1, maxY = -1;
          while (head < tail) {
            var cell = queue[head++];
            var cellX = cell % width, cellY = Math.floor(cell / width);
            size++; sumX += cellX; sumY += cellY;
            minX = Math.min(minX, cellX); maxX = Math.max(maxX, cellX);
            minY = Math.min(minY, cellY); maxY = Math.max(maxY, cellY);
            var neighbors = [cellX > 0 ? cell - 1 : -1, cellX + 1 < width ? cell + 1 : -1,
              cellY > 0 ? cell - width : -1, cellY + 1 < height ? cell + width : -1];
            for (var n = 0; n < neighbors.length; n++) {
              var next = neighbors[n];
              if (next >= 0 && counter[next] && !visited[next]) {
                visited[next] = 1;
                queue[tail++] = next;
              }
            }
          }
          if (size >= 3) components.push({
            x: sumX / size, y: sumY / size, size: size,
            minX: minX, minY: minY, maxX: maxX, maxY: maxY
          });
        }
        components.sort(function (a, b) { return b.size - a.size; });
        if (components.length > 96) components.length = 96;
        return { outside: outside, counter: counter, components: components };
      }

      function surfaceSmoothCoverage(value, softness) {
        var normalized = Math.max(0, Math.min(1, 0.5 + value / Math.max(0.001, softness * 2)));
        return normalized * normalized * (3 - 2 * normalized);
      }

      function surfaceTerminalShapeLegacy(ctx, style, reach, base, trap, strength) {
        ctx.globalAlpha = strength;
        if (style === 'ball') {
          ctx.lineCap = 'round';
          ctx.lineWidth = Math.max(1, base * 0.72);
          ctx.beginPath(); ctx.moveTo(-base * 0.8, 0); ctx.quadraticCurveTo(reach * 0.35, -base * 0.18, reach * 0.66, 0); ctx.stroke();
          ctx.beginPath(); ctx.arc(reach * 0.72, 0, Math.max(1, base * 0.72), 0, Math.PI * 2); ctx.fill();
        } else if (style === 'flare') {
          ctx.beginPath();
          ctx.moveTo(-base * 0.75, -base * 0.42);
          ctx.bezierCurveTo(reach * 0.2, -base * 0.38, reach * 0.48, -base * 1.15, reach, -base * 0.72);
          ctx.quadraticCurveTo(reach * 0.72, 0, reach, base * 0.72);
          ctx.bezierCurveTo(reach * 0.48, base * 1.15, reach * 0.2, base * 0.38, -base * 0.75, base * 0.42);
          ctx.closePath(); ctx.fill();
        } else if (style === 'blade') {
          ctx.beginPath();
          ctx.moveTo(-base, -base * 0.5);
          ctx.quadraticCurveTo(reach * 0.42, -base * 0.22, reach, -base * 0.12);
          ctx.lineTo(reach * 0.68, base * 0.34);
          ctx.quadraticCurveTo(reach * 0.22, base * 0.82, -base * 0.8, base * 0.44);
          ctx.closePath(); ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(-base, -base * 0.55);
          ctx.lineTo(reach, 0);
          ctx.lineTo(-base, base * 0.55);
          ctx.quadraticCurveTo(-base * 0.35, 0, -base, -base * 0.55);
          ctx.closePath(); ctx.fill();
        }
        if (trap > 0.2) {
          ctx.save();
          ctx.globalCompositeOperation = 'destination-out';
          var trapWidth = Math.min(base * 0.68, trap * 0.28);
          ctx.beginPath();
          ctx.moveTo(-Math.min(trap, base * 1.5), -trapWidth);
          ctx.lineTo(Math.min(trap * 0.34, base * 0.5), 0);
          ctx.lineTo(-Math.min(trap, base * 1.5), trapWidth);
          ctx.closePath(); ctx.fill();
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      }

      function surfaceLigatureCurve(ctx, a, b, offset, tension) {
        var dx = b.x - a.x, dy = b.y - a.y;
        var distance = Math.max(1, Math.hypot(dx, dy));
        var px = -dy / distance, py = dx / distance;
        var bend = distance * tension * 0.18 + offset;
        ctx.moveTo(a.x + px * offset, a.y + py * offset);
        ctx.bezierCurveTo(a.x + dx * 0.34 + px * bend, a.y + dy * 0.34 + py * bend,
          a.x + dx * 0.66 - px * bend, a.y + dy * 0.66 - py * bend,
          b.x + px * offset, b.y + py * offset);
      }

      function surfaceSnapToMaskPoint(data, width, height, point, radius) {
        var minX = Math.max(0, Math.floor(point.x - radius));
        var maxX = Math.min(width - 1, Math.ceil(point.x + radius));
        var minY = Math.max(0, Math.floor(point.y - radius));
        var maxY = Math.min(height - 1, Math.ceil(point.y + radius));
        var best = null, bestDistance = Infinity;
        for (var y = minY; y <= maxY; y++) for (var x = minX; x <= maxX; x++) {
          if (data[(y * width + x) * 4 + 3] < 32) continue;
          var dx = x - point.x, dy = y - point.y;
          var distance = dx * dx + dy * dy;
          if (distance < bestDistance) { bestDistance = distance; best = { x: x, y: y }; }
        }
        return best || point;
      }

      function surfaceGlyphAnatomyMetas(glyphs, operatorId, pixelScale, L) {
        var metas = [];
        for (var i = 0; i < glyphs.length; i++) {
          var glyph = glyphs[i];
          var strength = surfaceGlyphStrength(glyph, operatorId);
          if (strength <= 0.002 || (glyph.opacity != null && glyph.opacity <= 0.002)) continue;
          var center = surfaceGlyphNode(glyph, operatorId, pixelScale, L, 0, 0, 0, i, 0.5, 0.5, 1);
          var scaleX = Math.max(0.05, Math.abs(glyph.scaleX || 1));
          var scaleY = Math.max(0.05, Math.abs(glyph.scaleY || 1));
          metas.push({
            glyph: glyph,
            index: i,
            x: center.x,
            y: center.y,
            halfW: Math.max(5, Math.abs(glyph.bw || glyph.w) * scaleX * pixelScale * L.s * 0.62),
            halfH: Math.max(5, Math.abs(glyph.bh || glyph.h) * scaleY * pixelScale * L.s * 0.62),
            strength: strength,
            line: glyph.line == null ? 0 : glyph.line,
            word: glyph.word == null ? 0 : glyph.word
          });
        }
        return metas;
      }

      function surfaceNearestGlyphMeta(metas, x, y) {
        var best = null, bestScore = Infinity;
        for (var i = 0; i < metas.length; i++) {
          var meta = metas[i];
          var nx = (x - meta.x) / meta.halfW;
          var ny = (y - meta.y) / meta.halfH;
          var score = nx * nx + ny * ny;
          if (score < bestScore) { bestScore = score; best = meta; }
        }
        return best;
      }

      function surfaceCounterExit(field, width, height, component, angle) {
        var directions = [1, -1];
        var best = null;
        for (var d = 0; d < directions.length; d++) {
          var sign = directions[d], enteredBody = false;
          for (var step = 0; step < Math.hypot(width, height) * 0.38; step += 1.5) {
            var x = Math.round(component.x + Math.cos(angle) * step * sign);
            var y = Math.round(component.y + Math.sin(angle) * step * sign);
            if (x < 0 || x >= width || y < 0 || y >= height) {
              var edgeCandidate = { x: x, y: y, distance: step, sign: sign };
              if (!best || edgeCandidate.distance < best.distance) best = edgeCandidate;
              break;
            }
            var inside = !!field.inside[y * width + x];
            if (inside) enteredBody = true;
            else if (enteredBody) {
              var candidate = { x: x, y: y, distance: step, sign: sign };
              if (!best || candidate.distance < best.distance) best = candidate;
              break;
            }
          }
        }
        if (best) return best;
        return {
          x: component.x + Math.cos(angle) * Math.max(width, height) * 0.2,
          y: component.y + Math.sin(angle) * Math.max(width, height) * 0.2,
          distance: Math.max(width, height) * 0.2,
          sign: 1
        };
      }

      function surfaceTerminalShape(ctx, style, reach, base, trap, strength) {
        reach = Math.max(1, reach);
        base = Math.max(1.2, base);
        var neck = base * 0.34;
        var collar = base * 0.9;
        ctx.globalAlpha = strength;
        ctx.fillStyle = '#fff';
        if (style === 'wedge') {
          ctx.beginPath();
          ctx.moveTo(-collar, -base * 0.38);
          ctx.bezierCurveTo(-base * 0.2, -base * 0.5, reach * 0.12, -base * 0.92, reach * 0.54, -base * 0.76);
          ctx.lineTo(reach, -base * 0.22);
          ctx.quadraticCurveTo(reach * 0.72, 0, reach, base * 0.22);
          ctx.lineTo(reach * 0.54, base * 0.76);
          ctx.bezierCurveTo(reach * 0.12, base * 0.92, -base * 0.2, base * 0.5, -collar, base * 0.38);
          ctx.quadraticCurveTo(-base * 0.3, 0, -collar, -base * 0.38);
          ctx.closePath(); ctx.fill();
        } else if (style === 'flare') {
          ctx.beginPath();
          ctx.moveTo(-collar, -base * 0.42);
          ctx.bezierCurveTo(-base * 0.04, -base * 0.32, reach * 0.22, -neck, reach * 0.44, -base * 0.58);
          ctx.bezierCurveTo(reach * 0.66, -base * 1.06, reach * 0.88, -base * 1.18, reach, -base * 0.9);
          ctx.quadraticCurveTo(reach * 0.72, 0, reach, base * 0.9);
          ctx.bezierCurveTo(reach * 0.88, base * 1.18, reach * 0.66, base * 1.06, reach * 0.44, base * 0.58);
          ctx.bezierCurveTo(reach * 0.22, neck, -base * 0.04, base * 0.32, -collar, base * 0.42);
          ctx.closePath(); ctx.fill();
        } else if (style === 'blade') {
          ctx.beginPath();
          ctx.moveTo(-collar, -base * 0.44);
          ctx.bezierCurveTo(reach * 0.12, -base * 0.38, reach * 0.55, -base * 0.62, reach, -base * 0.12);
          ctx.lineTo(reach * 0.64, base * 0.34);
          ctx.bezierCurveTo(reach * 0.28, base * 0.78, -base * 0.12, base * 0.68, -collar, base * 0.42);
          ctx.quadraticCurveTo(-base * 0.16, 0, -collar, -base * 0.44);
          ctx.closePath(); ctx.fill();
          ctx.beginPath();
          ctx.moveTo(reach * 0.12, -base * 0.2);
          ctx.lineTo(reach * 0.72, -base * 0.1);
          ctx.lineTo(reach * 0.42, base * 0.12);
          ctx.closePath(); ctx.fill();
        } else {
          // A teardrop grown from a bracketed neck, rather than a line ending
          // in a detached circle. At low reach it contracts into a swollen serif.
          ctx.beginPath();
          ctx.moveTo(-collar, -base * 0.38);
          ctx.bezierCurveTo(-base * 0.05, -base * 0.4, reach * 0.18, -neck, reach * 0.42, -base * 0.5);
          ctx.bezierCurveTo(reach * 0.72, -base * 1.03, reach * 1.08, -base * 0.76, reach, -base * 0.06);
          ctx.bezierCurveTo(reach * 1.08, base * 0.76, reach * 0.72, base * 1.03, reach * 0.42, base * 0.5);
          ctx.bezierCurveTo(reach * 0.18, neck, -base * 0.05, base * 0.4, -collar, base * 0.38);
          ctx.quadraticCurveTo(-base * 0.24, 0, -collar, -base * 0.38);
          ctx.closePath(); ctx.fill();
        }
        if (trap > 0.2) {
          ctx.save();
          ctx.globalCompositeOperation = 'destination-out';
          var depth = Math.min(trap, Math.max(base * 0.5, reach * 0.28));
          var widthAtRoot = Math.min(base * 0.44, trap * 0.16 + base * 0.12);
          ctx.beginPath();
          ctx.moveTo(-collar * 0.82, -widthAtRoot);
          ctx.quadraticCurveTo(-base * 0.08, 0, depth * 0.18, 0);
          ctx.quadraticCurveTo(-base * 0.08, 0, -collar * 0.82, widthAtRoot);
          ctx.closePath(); ctx.fill();
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      }

      function surfaceTerminalBranches(field, width, height, em, bias) {
        if (!field.bounds) return [];
        var left = field.bounds[0] - 1, top = field.bounds[1] - 1;
        var w = field.bounds[2] - left + 2, h = field.bounds[3] - top + 2;
        var ink = new Uint8Array(w * h), removals = new Int32Array(w * h);
        for (var y = 1; y < h - 1; y++) for (var x = 1; x < w - 1; x++) {
          ink[y*w+x] = field.inside[(y+top)*width+x+left];
        }
        // Revisit only exposed boundary pixels, never every solid interior on
        // every peel. Newly exposed pixels are eligible on the next subpass.
        var frontier = new Int32Array(w*h), queued = new Uint8Array(w*h), frontierCount = 0;
        for (var y = 1; y < h-1; y++) for (var x = 1; x < w-1; x++) {
          var i = y*w+x;
          if (ink[i] && (!ink[i-w] || !ink[i+1] || !ink[i+w] || !ink[i-1])) {
            frontier[frontierCount++] = i; queued[i] = 1;
          }
        }
        var changed = true;
        while (changed) {
          changed = false;
          for (var pass = 0; pass < 2; pass++) {
            var count = 0;
            var retained = 0;
            for (var scan = 0; scan < frontierCount; scan++) {
              var i = frontier[scan];
              if (!ink[i]) continue;
              frontier[retained++] = i;
              var n = ink[i-w], ne = ink[i-w+1], e = ink[i+1], se = ink[i+w+1];
              var s = ink[i+w], sw = ink[i+w-1], west = ink[i-1], nw = ink[i-w-1];
              var total = n+ne+e+se+s+sw+west+nw;
              if (total < 2 || total > 6) continue;
              var transitions = (!n&&ne)+(!ne&&e)+(!e&&se)+(!se&&s)+(!s&&sw)+(!sw&&west)+(!west&&nw)+(!nw&&n);
              if (transitions !== 1) continue;
              if (pass === 0 ? (n*e*s || e*s*west) : (n*e*west || n*s*west)) continue;
              removals[count++] = i;
            }
            frontierCount = retained;
            for (var j = 0; j < count; j++) ink[removals[j]] = 0;
            for (var j = 0; j < count; j++) {
              var removed = removals[j];
              for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
                var k = removed+dy*w+dx;
                if (ink[k] && !queued[k]) { queued[k]=1; frontier[frontierCount++]=k; }
              }
            }
            if (count) changed = true;
          }
        }
        // Do not create triangular graph shortcuts around an orthogonal step.
        function neighbors(i) {
          var result = [];
          for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            if (dx && dy && (ink[i+dx] || ink[i+dy*w])) continue;
            var k = i+dx+dy*w;
            if (ink[k]) result.push(k);
          }
          return result;
        }
        var result = [];
        for (var y = 1; y < h - 1; y++) for (var x = 1; x < w - 1; x++) {
          var start = y*w+x;
          if (!ink[start] || neighbors(start).length !== 1) continue;
          var path = [start], previous = -1, current = start, length = 0, radius = 0;
          var maxLength = Math.max(8, em*.26);
          while (length < maxLength) {
            var next = neighbors(current).filter(function(k) { return k !== previous; });
            if (next.length !== 1) break;
            var k = next[0];
            length += Math.hypot(k%w-current%w, Math.floor(k/w)-Math.floor(current/w));
            previous = current; current = k; path.push(k);
            radius = Math.max(radius, field.distance[(Math.floor(k/w)+top)*width+k%w+left]);
          }
          // Reject raster spurs and corners, not genuine thin-stroke terminals.
          if (length < Math.max(4, radius*2.3)) continue;
          var directionLength = Math.min(length, Math.max(4, Math.min(em*.10, radius*2.5)));
          var walked = 0, inner = start;
          for (var j = 1; j < path.length; j++) {
            walked += Math.hypot(path[j]%w-path[j-1]%w, Math.floor(path[j]/w)-Math.floor(path[j-1]/w));
            inner = path[j]; if (walked >= directionLength) break;
          }
          var nx = x-inner%w, ny = y-Math.floor(inner/w), norm = Math.hypot(nx,ny);
          if (!norm) continue;
          nx /= norm; ny /= norm;
          var ax = x+left, ay = y+top;
          for (var d = .5; d < Math.max(8,radius*4); d += .5) {
            var px = Math.round(x+left+nx*d), py = Math.round(y+top+ny*d);
            if (px<0 || py<0 || px>=width || py>=height || !field.inside[py*width+px]) break;
            ax = x+left+nx*d; ay = y+top+ny*d;
          }
          result.push({x:ax,y:ay,nx:nx,ny:ny,stemWidth:Math.max(1.5,radius*2),
            score:.78+Math.min(1,length/Math.max(1,radius*6))*.45+bias*(Math.abs(nx)-Math.abs(ny))*.36,
            branchLength:length});
        }
        return result;
      }

      function surfaceLigatureShoulder(ctx, point, directionX, directionY, band, strength) {
        ctx.save();
        ctx.translate(point.x, point.y);
        ctx.rotate(Math.atan2(directionY, directionX));
        ctx.globalAlpha = strength;
        ctx.beginPath();
        ctx.ellipse(0, 0, band * 0.92, band * 0.58, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      function surfaceLigatureBezierPointV62(a, b, bend, offset, t) {
        var dx = b.x - a.x, dy = b.y - a.y;
        var distance = Math.max(1, Math.hypot(dx, dy));
        var nx = -dy / distance, ny = dx / distance;
        var c1x = a.x + dx * 0.31 + nx * bend;
        var c1y = a.y + dy * 0.31 + ny * bend;
        var c2x = a.x + dx * 0.69 - nx * bend;
        var c2y = a.y + dy * 0.69 - ny * bend;
        var mt = 1 - t;
        var x = mt * mt * mt * a.x + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * b.x;
        var y = mt * mt * mt * a.y + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * b.y;
        var tx = 3 * mt * mt * (c1x - a.x) + 6 * mt * t * (c2x - c1x) + 3 * t * t * (b.x - c2x);
        var ty = 3 * mt * mt * (c1y - a.y) + 6 * mt * t * (c2y - c1y) + 3 * t * t * (b.y - c2y);
        var tangent = Math.max(0.0001, Math.hypot(tx, ty));
        return { x: x - ty / tangent * offset, y: y + tx / tangent * offset, nx: -ty / tangent, ny: tx / tangent };
      }

      function surfaceLigatureRibbonV62(ctx, a, b, widthA, widthB, bend, offset) {
        var steps = 18;
        var left = [], right = [];
        for (var step = 0; step <= steps; step++) {
          var t = step / steps;
          var point = surfaceLigatureBezierPointV62(a, b, bend, offset, t);
          var shoulder = 0.88 + Math.sin(t * Math.PI) * 0.24;
          var halfWidth = (widthA + (widthB - widthA) * t) * 0.5 * shoulder;
          left.push({ x: point.x + point.nx * halfWidth, y: point.y + point.ny * halfWidth });
          right.push({ x: point.x - point.nx * halfWidth, y: point.y - point.ny * halfWidth });
        }
        ctx.beginPath();
        ctx.moveTo(left[0].x, left[0].y);
        for (var leftIndex = 1; leftIndex < left.length; leftIndex++) ctx.lineTo(left[leftIndex].x, left[leftIndex].y);
        for (var rightIndex = right.length - 1; rightIndex >= 0; rightIndex--) ctx.lineTo(right[rightIndex].x, right[rightIndex].y);
        ctx.closePath();
        ctx.fill();
      }

      function surfaceLigatureWaistV62(ctx, x, y, angle, span, width, bias) {
        var halfSpan = span * 0.5;
        var flare = width * (0.92 + Math.abs(bias) * 0.08);
        var waist = width * (0.46 + Math.min(1, Math.abs(bias)) * 0.08);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(-flare, -halfSpan);
        ctx.bezierCurveTo(-width * 1.18, -halfSpan * 0.68, -waist, -halfSpan * 0.22, -waist, 0);
        ctx.bezierCurveTo(-waist, halfSpan * 0.22, -width * 1.18, halfSpan * 0.68, -flare, halfSpan);
        ctx.lineTo(flare, halfSpan);
        ctx.bezierCurveTo(width * 1.18, halfSpan * 0.68, waist, halfSpan * 0.22, waist, 0);
        ctx.bezierCurveTo(waist, -halfSpan * 0.22, width * 1.18, -halfSpan * 0.68, flare, -halfSpan);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      function surfaceLigatureLensV62(ctx, x, y, angle, length, width) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(-length * 0.5, 0);
        ctx.quadraticCurveTo(0, -width * 0.72, length * 0.5, 0);
        ctx.quadraticCurveTo(0, width * 0.72, -length * 0.5, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      function surfaceLigatureAnchorV62(glyph, glyphIndex, operatorId, pixelScale, L, sourceData,
        width, height, entry, transverse, radius) {
        var localU = params.vertical ? transverse : (entry ? 0.1 : 0.9);
        var localV = params.vertical ? (entry ? 0.1 : 0.9) : transverse;
        var node = surfaceGlyphNode(glyph, operatorId, pixelScale, L, 0, 0, 0, glyphIndex, localU, localV, 1);
        return surfaceSnapToMaskPoint(sourceData, width, height, node, radius);
      }

      function surfaceHexRgb(color) {
        if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) return [126, 143, 166];
        return [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)];
      }

      function surfaceToneCss(rgb, tone) {
        var amount = Math.max(-1, Math.min(1, tone));
        var target = amount >= 0 ? 255 : 0;
        amount = Math.abs(amount);
        return 'rgb(' + Math.round(rgb[0] + (target - rgb[0]) * amount) + ','
          + Math.round(rgb[1] + (target - rgb[1]) * amount) + ','
          + Math.round(rgb[2] + (target - rgb[2]) * amount) + ')';
      }

      function surfaceVoidApertureMask(mask, aperture) {
        var maxSide = 384;
        var scanScale = Math.min(1, maxSide / Math.max(1, mask.width, mask.height));
        var scanWidth = Math.max(8, Math.round(mask.width * scanScale));
        var scanHeight = Math.max(8, Math.round(mask.height * scanScale));
        var scan = surfaceScratch('void-portal-scan', scanWidth, scanHeight, true);
        scan.ctx.imageSmoothingEnabled = true;
        scan.ctx.drawImage(mask, 0, 0, scanWidth, scanHeight);
        var source;
        try { source = scan.ctx.getImageData(0, 0, scanWidth, scanHeight); }
        catch (error) { return null; }
        var count = scanWidth * scanHeight;
        var solid = new Uint8Array(count);
        var outside = new Uint8Array(count);
        var queue = new Int32Array(count);
        var head = 0, tail = 0;
        for (var index = 0; index < count; index++) solid[index] = source.data[index * 4 + 3] > 28 ? 1 : 0;
        function enqueue(index) {
          if (index < 0 || index >= count || solid[index] || outside[index]) return;
          outside[index] = 1;
          queue[tail++] = index;
        }
        for (var x = 0; x < scanWidth; x++) {
          enqueue(x);
          enqueue((scanHeight - 1) * scanWidth + x);
        }
        for (var y = 1; y + 1 < scanHeight; y++) {
          enqueue(y * scanWidth);
          enqueue(y * scanWidth + scanWidth - 1);
        }
        while (head < tail) {
          var current = queue[head++];
          var cx = current % scanWidth;
          var cy = Math.floor(current / scanWidth);
          if (cx > 0) enqueue(current - 1);
          if (cx + 1 < scanWidth) enqueue(current + 1);
          if (cy > 0) enqueue(current - scanWidth);
          if (cy + 1 < scanHeight) enqueue(current + scanWidth);
        }
        var field = surfaceBoundaryDistance(source.data, scanWidth, scanHeight);
        var output = scan.ctx.createImageData(scanWidth, scanHeight);
        var chamberThreshold = 1.25 + (1 - Math.max(0, Math.min(1, aperture))) * 8.5;
        var occupied = 0;
        for (var i = 0; i < count; i++) {
          var enclosed = !solid[i] && !outside[i];
          var chamber = aperture > 0.002 && field.inside[i] && field.distance[i] >= chamberThreshold;
          if (!enclosed && !chamber) continue;
          var alpha = enclosed ? 255 : Math.round(120 + aperture * 135);
          output.data[i * 4] = 255;
          output.data[i * 4 + 1] = 255;
          output.data[i * 4 + 2] = 255;
          output.data[i * 4 + 3] = alpha;
          occupied++;
        }
        if (!occupied) return null;
        if(globalThis.TypeDeformerRenderContext){var RC=TypeDeformerRenderContext;RC.field(output,function(px,py,rgba,footprint){
          var x=px-.5,y=py-.5,sourceAlpha=RC.rasterSample(source.data,scanWidth,scanHeight,x,y,3)/255;
          var enclosed=(1-RC.sample(outside,scanWidth,scanHeight,x,y))*(1-sourceAlpha);
          var chamber=aperture>.002?Math.max(0,Math.min(1,.5+(RC.signed(field,scanWidth,scanHeight,x,y)-chamberThreshold)/footprint)):0;
          rgba[0]=rgba[1]=rgba[2]=255;rgba[3]=Math.max(enclosed*255,chamber*(120+aperture*135));
        });}
        scan.ctx.putImageData(output, 0, 0);
        return scan.canvas;
      }

      function surfaceMorphGlyphField(ch, size, g) {
        var tile = surfaceScratch('morph-procession-field', size, size, true);
        var ctx = tile.ctx;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        var testSize = size * 0.72;
        ctx.font = g && g.fontAxes ? glyphFontSpec(g,testSize).font : params.fontWeight + ' ' + testSize + 'px ' + params.fontFamily;
        var measured = ctx.measureText(ch || ' ');
        var measuredWidth = Math.max(1, measured.width);
        var measuredHeight = Math.max(1, (measured.actualBoundingBoxAscent || testSize * 0.72) + (measured.actualBoundingBoxDescent || testSize * 0.22));
        var fit = Math.min(1, size * 0.82 / measuredWidth, size * 0.82 / measuredHeight);
        var drawSize = Math.max(6, testSize * fit);
        ctx.font = g && g.fontAxes ? glyphFontSpec(g,drawSize).font : params.fontWeight + ' ' + drawSize + 'px ' + params.fontFamily;
        measured = ctx.measureText(ch || ' ');
        var ascent = measured.actualBoundingBoxAscent || drawSize * 0.72;
        var descent = measured.actualBoundingBoxDescent || drawSize * 0.22;
        ctx.fillText(ch || ' ', size * 0.5, size * 0.5 + (ascent - descent) * 0.5);
        var source;
        try { source = ctx.getImageData(0, 0, size, size); }
        catch (error) { return null; }
        var field = surfaceBoundaryDistance(source.data, size, size);
        if (!field.bounds) return null;
        var signed = new Float32Array(size * size);
        for (var index = 0; index < signed.length; index++) {
          signed[index] = (field.inside[index] ? 1 : -1) * (field.distance[index] + 0.5);
        }
        return signed;
      }

      function surfaceMorphGlyphDescriptor(ch, size, g) {
        var field = surfaceMorphGlyphField(ch, size, g);
        if (!field) return null;
        var minX = size, minY = size, maxX = -1, maxY = -1;
        var count = 0, sumX = 0, sumY = 0;
        for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
          if (field[y * size + x] <= 0) continue;
          minX = Math.min(minX, x); minY = Math.min(minY, y);
          maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
          count++; sumX += x; sumY += y;
        }
        if (!count || maxX < minX || maxY < minY) return null;
        var cx = sumX / count, cy = sumY / count;
        var xx = 0, yy = 0, xy = 0;
        for (var momentY = minY; momentY <= maxY; momentY++) {
          for (var momentX = minX; momentX <= maxX; momentX++) {
            if (field[momentY * size + momentX] <= 0) continue;
            var dx = momentX - cx, dy = momentY - cy;
            xx += dx * dx; yy += dy * dy; xy += dx * dy;
          }
        }
        var principal = 0.5 * Math.atan2(2 * xy, xx - yy);
        while (principal > Math.PI * 0.5) principal -= Math.PI;
        while (principal < -Math.PI * 0.5) principal += Math.PI;
        return {
          field: field,
          size: size,
          cx: cx,
          cy: cy,
          halfW: Math.max(3, (maxX - minX + 1) * 0.5),
          halfH: Math.max(3, (maxY - minY + 1) * 0.5),
          angle: Math.max(-0.7, Math.min(0.7, principal)) * 0.22
        };
      }

      function surfaceMorphFieldSample(descriptor, nx, ny) {
        var cosA = Math.cos(descriptor.angle), sinA = Math.sin(descriptor.angle);
        var rx = nx * cosA - ny * sinA;
        var ry = nx * sinA + ny * cosA;
        var x = descriptor.cx + rx * descriptor.halfW * 1.08;
        var y = descriptor.cy + ry * descriptor.halfH * 1.08;
        var size = descriptor.size;
        var x0 = Math.max(0, Math.min(size - 1, Math.floor(x)));
        var y0 = Math.max(0, Math.min(size - 1, Math.floor(y)));
        var x1 = Math.min(size - 1, x0 + 1);
        var y1 = Math.min(size - 1, y0 + 1);
        var tx = Math.max(0, Math.min(1, x - x0));
        var ty = Math.max(0, Math.min(1, y - y0));
        var field = descriptor.field;
        var a = field[y0 * size + x0] * (1 - tx) + field[y0 * size + x1] * tx;
        var b = field[y1 * size + x0] * (1 - tx) + field[y1 * size + x1] * tx;
        return (a * (1 - ty) + b * ty) / Math.max(3, Math.min(descriptor.halfW, descriptor.halfH));
      }

      function surfaceMorphProcessionPairs(glyphs) {
        var active = [];
        for (var i = 0; i < glyphs.length; i++) {
          var glyph = glyphs[i];
          if (surfaceGlyphStrength(glyph, 'morphProcession') <= 0.002
            || (glyph.opacity != null && glyph.opacity <= 0.002)
            || !String(glyph.ch || '').trim()) continue;
          active.push({ glyph: glyph, index: i });
        }
        active.sort(function (a, b) {
          var lineA = a.glyph.line == null ? 0 : a.glyph.line;
          var lineB = b.glyph.line == null ? 0 : b.glyph.line;
          if (lineA !== lineB) return lineA - lineB;
          var wordA = a.glyph.word == null ? 0 : a.glyph.word;
          var wordB = b.glyph.word == null ? 0 : b.glyph.word;
          if (wordA !== wordB) return wordA - wordB;
          return a.index - b.index;
        });
        var pairs = [];
        for (var pairIndex = 0; pairIndex + 1 < active.length; pairIndex++) {
          var first = active[pairIndex], second = active[pairIndex + 1];
          if (first.glyph.line !== second.glyph.line || first.glyph.word !== second.glyph.word) continue;
          pairs.push({ first: first, second: second });
        }
        if (!pairs.length) for (var fallback = 0; fallback + 1 < active.length; fallback++) {
          if (active[fallback].glyph.line !== active[fallback + 1].glyph.line) continue;
          pairs.push({ first: active[fallback], second: active[fallback + 1] });
        }
        if (pairs.length <= 18) return pairs;
        var sampled = [], stride = Math.ceil(pairs.length / 18);
        for (var sampledIndex = 0; sampledIndex < pairs.length; sampledIndex += stride) sampled.push(pairs[sampledIndex]);
        return sampled.slice(0, 18);
      }

      function surfaceNoise01(x, y, salt) {
        var value = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(salt | 0, 1442695041)) | 0;
        value = Math.imul(value ^ (value >>> 13), 1274126177);
        return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
      }

      function surfaceCanonicalRasterPlan(glyphs) {
        var bounds = contentBounds(glyphs, Math.max(surfaceEffectPad(), ribbonEchoEffectPad(glyphs), contourEtchEffectPad(glyphs), rasterPressEffectPad(glyphs), hatchEngraveEffectPad(glyphs), differentialEffectPad(glyphs), conformalEffectPad(glyphs), auxeticEffectPad(glyphs), calligraphyEffectPad(glyphs), marblingEffectPad(glyphs)));
        bounds.w = Math.max(1, isFinite(bounds.w) ? bounds.w : 1);
        bounds.h = Math.max(1, isFinite(bounds.h) ? bounds.h : 1);
        bounds.x = isFinite(bounds.x) ? bounds.x : 0;
        bounds.y = isFinite(bounds.y) ? bounds.y : 0;
        var envelopeScale = typeof surfaceEnvelopeScale === 'number' ? surfaceEnvelopeScale : 1;
        if (globalThis.TypeDeformerRenderEnvelope) bounds = globalThis.TypeDeformerRenderEnvelope.expandBounds(bounds, envelopeScale);
        // A viewport breakpoint here would make browser zoom/orientation a
        // morphology input. Keep the raster budget identical on every device.
        var maxSide = 1440;
        var maxPixels = 2400000;
        var density = Math.min(
          1.5,
          maxSide / bounds.w,
          maxSide / bounds.h,
          Math.sqrt(maxPixels / Math.max(1, bounds.w * bounds.h))
        );
        density = Math.max(0.000001, isFinite(density) ? density : 1);
        return {
          bounds: bounds,
          density: density,
          width: Math.max(1, Math.ceil(bounds.w * density)),
          height: Math.max(1, Math.ceil(bounds.h * density)),
          layout: { w: bounds.w, h: bounds.h, s: 1, dx: -bounds.x, dy: -bounds.y },
          envelopeScale: envelopeScale
        };
      }

      function contentBounds(glyphs, pad) {
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (var i = 0; i < glyphs.length; i++) {
          var g = glyphs[i];
          // transformed corners: p' = O + t + R·K·S·(p − O)
          var rad = (g.rot || 0) * Math.PI / 180;
          var cosR = Math.cos(rad), sinR = Math.sin(rad);
          var tanX = Math.tan((g.skewX || 0) * Math.PI / 180);
          var tanY = Math.tan((g.skewY || 0) * Math.PI / 180);
          var ma = cosR * g.scaleX - sinR * tanY * g.scaleX;
          var mb = sinR * g.scaleX + cosR * tanY * g.scaleX;
          var mc = cosR * tanX * g.scaleY - sinR * g.scaleY;
          var md = sinR * tanX * g.scaleY + cosR * g.scaleY;
          var bx = g.bx != null ? g.bx : g.x;
          var by = g.by != null ? g.by : g.y;
          var bw = g.bw != null ? g.bw : g.w;
          var bh = g.bh != null ? g.bh : g.h;
          var xs = [bx, bx + bw], ys = [by, by + bh];
          for (var a = 0; a < 2; a++) for (var b = 0; b < 2; b++) {
            var lx = xs[a] - g.ox;
            var ly = ys[b] - g.oy;
            var px = g.ox + g.tx + ma * lx + mc * ly;
            var py = g.oy + g.ty + mb * lx + md * ly;
            var offsets = [[0, 0]];
            if (Math.abs(g.misregX) > 0.001 || Math.abs(g.misregY) > 0.001) offsets.push([g.misregX, g.misregY], [-g.misregX * 0.65, -g.misregY * 0.65]);
            if (Math.abs(g.moshPassAX || 0) > 0.001 || Math.abs(g.moshPassAY || 0) > 0.001) offsets.push([g.moshPassAX, g.moshPassAY], [g.moshPassBX, g.moshPassBY]);
            for (var pass = 0; pass < offsets.length; pass++) {
              var passX = px + offsets[pass][0], passY = py + offsets[pass][1];
              if (passX < minX) minX = passX; if (passX > maxX) maxX = passX;
              if (passY < minY) minY = passY; if (passY > maxY) maxY = passY;
            }
          }
        }
        if (!glyphs.length) { minX = minY = 0; maxX = maxY = 100; }
        return { x: minX - pad, y: minY - pad, w: (maxX - minX) + pad * 2, h: (maxY - minY) + pad * 2 };
      }

      function surfaceEffectPad() {
        var extra = 0;
        var structuralPad = typeof TypeDeformerStructuralOperators !== 'undefined'
          ? function (id, profile) { return TypeDeformerStructuralOperators.effectPad(id, profile, params.fontSize); }
          : function () { return 0; };
        var conditionPad = typeof TypeDeformerConditionsOperators !== 'undefined'
          ? function (id, profile) { return TypeDeformerConditionsOperators.effectPad(id, profile, params.fontSize); }
          : function () { return 0; };
        var fieldMaterialPad = typeof TypeDeformerFieldMaterials !== 'undefined'
          ? TypeDeformerFieldMaterials.effectPad : function () { return 0; };
        for (var i = 0; i < metrics.length; i++) {
          // Operator state is sparse; neutral text needs only the baseline pad.
          // Keep every nonzero strength, including values below the paint threshold.
          var activeSurface = false;
          for (var id in metrics[i].operatorStates) {
            var specification = TypeDeformerOperatorRegistry.byId[id];
            if (specification && specification.surface && surfaceOperatorStrength(metrics[i], id) !== 0) {
              activeSurface = true; break;
            }
          }
          if (!activeSurface) continue;
          var profile = batchProfileForKey(metrics[i].batchKey, metrics[i]);
          extra = Math.max(extra,
            surfaceOperatorStrength(metrics[i], 'misregistration') * Math.min(2400,
              Math.sqrt((profile.misregX || 0) * (profile.misregX || 0) + (profile.misregY || 0) * (profile.misregY || 0))
                * (1.2 + (profile.misregWarp || 0) * 0.9 + (profile.misregSlur || 0) * 0.42) + (profile.misregTrap || 0) * 2 + 16),
            surfaceOperatorStrength(metrics[i], 'dataMosh') * Math.min(5200,
              (profile.moshShift || 0) * (1 + (profile.moshSmear || 0) * 0.24)
                + (profile.moshChroma || 0) * 1.4 + (profile.moshBlock || 0) * 2),
            surfaceOperatorStrength(metrics[i], 'blobTrack') * Math.min(3600,
              (profile.blobInfluence || 0) + params.fontSize * (1 + (profile.blobVector || 0) * 0.8)
                + (profile.blobTrails || 0) * (2 + (profile.blobVector || 0) * 1.8)),
            surfaceOperatorStrength(metrics[i], 'plotterTrace') * ((profile.traceJitter || 0) + 8),
            surfaceOperatorStrength(metrics[i], 'webbing') * Math.min(2400,
              (profile.webReach || 0) * (0.12 + Math.abs(profile.webSag || 0) * 0.14) + (profile.webStroke || 0) * 2),
            surfaceOperatorStrength(metrics[i], 'softBlob') * Math.min(3400,
              (profile.softBlobSporeReach || 0) + params.fontSize * (0.3
                + (profile.softBlobInflation || 0) * 0.8 + (profile.softBlobMembrane || 0) * 0.72)),
            surfaceOperatorStrength(metrics[i], 'etchantBloom') * Math.min(1800,
              (profile.etchantSpill || 0) + (profile.etchantCell || 0) * 3),
            surfaceOperatorStrength(metrics[i], 'calligraphicStress') * Math.min(1800,
              Math.max(0, profile.calligraphyExpansion || 0) + params.fontSize * (0.25 + (profile.calligraphyContrast || 0) * 0.2)),
            surfaceOperatorStrength(metrics[i], 'asemicDuctus') * Math.min(2400,
              (profile.asemicFlourish || 0) + (profile.asemicWeight || 0) * (2 + (profile.asemicContrast || 0))
                + params.fontSize * Math.abs(profile.asemicFlow || 0) * 0.18),
            surfaceOperatorStrength(metrics[i], 'spectralType') * params.fontSize * (0.3 + (profile.spectralAmount || 0) * 1.8),
            surfaceOperatorStrength(metrics[i], 'counterformEngine') * Math.min(1200,
              Math.max(0, -(profile.counterformPressure || 0)) + (profile.counterformBridge || 0) + (profile.counterformTrap || 0)),
            surfaceOperatorStrength(metrics[i], 'terminalExcess') * Math.min(1800,
              (profile.terminalReach || 0) + (profile.terminalTrap || 0) + params.fontSize * (profile.terminalMass || 0) * 0.12),
            surfaceOperatorStrength(metrics[i], 'ligatureBody') * Math.min(3200,
              (profile.ligatureBodyReach || 0) * 0.35 + (profile.ligatureBodyBand || 0) * 2
                + params.fontSize * Math.abs(profile.ligatureBodyTension || 0) * 0.28),
            surfaceOperatorStrength(metrics[i], 'sigilForge') * ((profile.sigilReach || 0) * 1.35 + (profile.sigilStroke || 0) * 8 + 24),
            (profile.thornConstruction || params.thornConstruction) === 'legacy'
              ? surfaceOperatorStrength(metrics[i], 'thornCrown') * ((profile.thornLength || 0) * 1.25 + (profile.thornStroke || 0) * 8 + 12)
              : surfaceOperatorStrength(metrics[i], 'thornCrown') > 0.002 ? thornRootedExtent(profile) : 0,
            surfaceOperatorStrength(metrics[i], 'cipherLiturgy') * ((profile.cipherOrbit || 0) + (profile.cipherDrift || 0) * 0.5 + (profile.cipherScale || 0) * 7 + 24),
            surfaceOperatorStrength(metrics[i], 'boneScaffold') * ((profile.boneJoint || 0) + (profile.boneWeight || 0) * 4 + 8),
            surfaceOperatorStrength(metrics[i], 'roseEngine') * ((profile.roseRadius || 0) * 1.9 + (profile.roseStroke || 0) * 6 + 20),
            surfaceOperatorStrength(metrics[i], 'chromeReliquary') * ((profile.chromeBevel || 0) * 0.32 + 8),
            surfaceOperatorStrength(metrics[i], 'ligatureCrypt') * Math.min(4200,
              (profile.ligatureReach || 0) * (0.12 + Math.abs(profile.ligatureRise || 0) * 0.52)
                + (profile.ligatureBand || 0) + (profile.ligatureKnot || 0)),
            surfaceOperatorStrength(metrics[i], 'moireChoir') * ((profile.moireReach || 0) + (profile.moirePitch || 0) * 2),
            surfaceOperatorStrength(metrics[i], 'naveCutter') * ((profile.naveButtress || 0) * 2
              + params.fontSize * Math.abs(profile.naveWarp || 0) * 0.12),
            surfaceOperatorStrength(metrics[i], 'cloisterFold') * (params.fontSize * Math.abs(profile.cloisterFold || 0)
              * (0.45 + (profile.cloisterPerspective || 0) * 0.28) + (profile.cloisterCrease || 0) * 2),
            surfaceOperatorStrength(metrics[i], 'prismSacrament') * ((profile.prismBloom || 0)
              + (profile.prismDispersion || 0) * 0.72 + params.fontSize * Math.abs(profile.prismRefraction || 0) * 0.12),
            surfaceOperatorStrength(metrics[i], 'texturaMatrix') * ((profile.texturaSpur || 0) + (profile.texturaPitch || 0)),
            surfaceOperatorStrength(metrics[i], 'voidPortal') * Math.min(3600,
              (profile.voidDepth || 0) * Math.exp(Math.max(0, profile.voidTaper || 0) * 0.42) + params.fontSize),
            surfaceOperatorStrength(metrics[i], 'recursiveShrine') * Math.min(4800,
              (profile.recursiveOrbit || 0) + params.fontSize * Math.max(1,
                Math.pow(Math.max(0.25, profile.recursiveScale || 0.78), Math.min(12, Math.max(0, (profile.recursiveIterations || 1) - 1))))),
            surfaceOperatorStrength(metrics[i], 'morphProcession') * Math.min(2600,
              (profile.morphHalo || 0) * 2 + params.fontSize * (1 + Math.max(0, (profile.morphSpan || 1) - 1) * 3)),
            surfaceOperatorStrength(metrics[i], 'chimeraGraft') * Math.min(2600,
              (profile.chimeraSpan || 0) * (0.9 + (profile.chimeraForeignness || 0) * 0.72) + (profile.chimeraSeam || 0) * 2),
            surfaceOperatorStrength(metrics[i], 'fiberBody') * structuralPad('fiberBody', profile),
            surfaceOperatorStrength(metrics[i], 'glyphMutation') * structuralPad('glyphMutation', profile),
            surfaceOperatorStrength(metrics[i], 'suspendedSyntax') > 0.002 ? structuralPad('suspendedSyntax', profile) : 0,
            surfaceOperatorStrength(metrics[i], 'livingTextField') * structuralPad('livingTextField', profile),
            surfaceOperatorStrength(metrics[i], 'innerEruption') * structuralPad('innerEruption', profile),
            surfaceOperatorStrength(metrics[i], 'recursiveGraft') * structuralPad('recursiveGraft', profile),
            surfaceOperatorStrength(metrics[i], 'structuralCollision') * structuralPad('structuralCollision', profile),
            surfaceOperatorStrength(metrics[i], 'peelWeave') * structuralPad('peelWeave', profile),
            surfaceOperatorStrength(metrics[i], 'voidPressure') * structuralPad('voidPressure', profile),
            surfaceOperatorStrength(metrics[i], 'ornamentReserve') * fieldMaterialPad('ornamentReserve'),
            surfaceOperatorStrength(metrics[i], 'tensionMembrane') * fieldMaterialPad('tensionMembrane'),
            surfaceOperatorStrength(metrics[i], 'diffractiveGlyph') * fieldMaterialPad('diffractiveGlyph'),
            surfaceOperatorStrength(metrics[i], 'dendriteCast') * fieldMaterialPad('dendriteCast'),
            surfaceOperatorStrength(metrics[i], 'quasicrystalBody') * fieldMaterialPad('quasicrystalBody'),
            surfaceOperatorStrength(metrics[i], 'nematicFilm') * fieldMaterialPad('nematicFilm'),
            surfaceOperatorStrength(metrics[i], 'hyperbolicAtlas') * fieldMaterialPad('hyperbolicAtlas'),
            surfaceOperatorStrength(metrics[i], 'loadpathFoundry') * fieldMaterialPad('loadpathFoundry'),
            surfaceOperatorStrength(metrics[i], 'nodalGlaze') * fieldMaterialPad('nodalGlaze'),
            surfaceOperatorStrength(metrics[i], 'spinodalAlloy') * fieldMaterialPad('spinodalAlloy'),
            surfaceOperatorStrength(metrics[i], 'densityRecast') * fieldMaterialPad('densityRecast'),
            surfaceOperatorStrength(metrics[i], 'hopfLoom') * fieldMaterialPad('hopfLoom'),
            surfaceOperatorStrength(metrics[i], 'miuraVault') * fieldMaterialPad('miuraVault'),
            surfaceOperatorStrength(metrics[i], 'vortexBath') * fieldMaterialPad('vortexBath'),
            surfaceOperatorStrength(metrics[i], 'rationalCusp') * fieldMaterialPad('rationalCusp'),
            surfaceOperatorStrength(metrics[i], 'bladeBody') * fieldMaterialPad('bladeBody'),
            surfaceOperatorStrength(metrics[i], 'blackBastion') * fieldMaterialPad('blackBastion'),
            surfaceOperatorStrength(metrics[i], 'inktrapAbyss') * fieldMaterialPad('inktrapAbyss'),
            surfaceOperatorStrength(metrics[i], 'strangulation') * fieldMaterialPad('strangulation'),
            surfaceOperatorStrength(metrics[i], 'gillArray') * fieldMaterialPad('gillArray'),
            surfaceOperatorStrength(metrics[i], 'screwExtrusion') * fieldMaterialPad('screwExtrusion'),
            surfaceOperatorStrength(metrics[i], 'harmonicCage') * fieldMaterialPad('harmonicCage'),
            surfaceOperatorStrength(metrics[i], 'beltramiFlow') * fieldMaterialPad('beltramiFlow'),
            surfaceOperatorStrength(metrics[i], 'riemannRamification') * fieldMaterialPad('riemannRamification'),
            surfaceOperatorStrength(metrics[i], 'linkedTwist') * fieldMaterialPad('linkedTwist'),
            surfaceOperatorStrength(metrics[i], 'enneperBody') * fieldMaterialPad('enneperBody'),
            surfaceOperatorStrength(metrics[i], 'nibRecast') * fieldMaterialPad('nibRecast'),
            surfaceOperatorStrength(metrics[i], 'anatomyWarp') * fieldMaterialPad('anatomyWarp'),
            surfaceOperatorStrength(metrics[i], 'kreslingShell') * fieldMaterialPad('kreslingShell'),
            surfaceOperatorStrength(metrics[i], 'growthBuckle') * fieldMaterialPad('growthBuckle'),
            surfaceOperatorStrength(metrics[i], 'inversionBody') * fieldMaterialPad('inversionBody'),
            surfaceOperatorStrength(metrics[i], 'gravityLens') * fieldMaterialPad('gravityLens'),
            surfaceOperatorStrength(metrics[i], 'liquidRope') * fieldMaterialPad('liquidRope'),
            surfaceOperatorStrength(metrics[i], 'wulffBody') * fieldMaterialPad('wulffBody'),
            surfaceOperatorStrength(metrics[i], 'repulsiveCurves') * fieldMaterialPad('repulsiveCurves'),
            surfaceOperatorStrength(metrics[i], 'wassersteinLetters') * fieldMaterialPad('wassersteinLetters'),
            surfaceOperatorStrength(metrics[i], 'stressGlass') * fieldMaterialPad('stressGlass'),
            surfaceOperatorStrength(metrics[i], 'tensorFiligree') * fieldMaterialPad('tensorFiligree'),
            surfaceOperatorStrength(metrics[i], 'chromaticSwarm') * fieldMaterialPad('chromaticSwarm'),
            surfaceOperatorStrength(metrics[i], 'gyroidSculpture') * fieldMaterialPad('gyroidSculpture'),
            surfaceOperatorStrength(metrics[i], 'causticGlass') * fieldMaterialPad('causticGlass'),
            surfaceOperatorStrength(metrics[i], 'rubyUsurper') * conditionPad('rubyUsurper', profile),
            surfaceOperatorStrength(metrics[i], 'punctuationLoom') * conditionPad('punctuationLoom', profile),
            surfaceOperatorStrength(metrics[i], 'counterpage') * conditionPad('counterpage', profile),
            surfaceOperatorStrength(metrics[i], 'rendererDebt') * conditionPad('rendererDebt', profile),
            surfaceOperatorStrength(metrics[i], 'ligatureContagion') * conditionPad('ligatureContagion', profile),
            surfaceOperatorStrength(metrics[i], 'strokeCommons') * conditionPad('strokeCommons', profile),
            surfaceOperatorStrength(metrics[i], 'monolithCast') * Math.min(2400,
              Math.max(0, profile.monolithMass || 0) + Math.abs(profile.monolithFault || 0) + (profile.monolithModule || 0)),
            surfaceOperatorStrength(metrics[i], 'contourEtch') * Math.min(760, (profile.contourBands || 0) * (profile.contourSpacing || 0) + (profile.contourStroke || 0) * 2),
            surfaceOperatorStrength(metrics[i], 'pressureStroke') * (Math.max(0, profile.pressureWeight || 0)
              + params.fontSize * ((profile.pressureContrast || 0) * 0.72 + (profile.pressureBreath || 0) * 0.2 + Math.abs(profile.pressureTaper || 0) * 0.4)
              + (profile.pressureSoftness || 0) * 2),
            surfaceOperatorStrength(metrics[i], 'sinewTorque') * Math.min(3600,
              Math.abs(profile.sinewPull || 0) + params.fontSize * (0.8
                + Math.abs(profile.sinewTorque || 0) / 72
                + Math.max(0, Math.exp(Math.max(0, profile.sinewWaist || 0) * 0.42) - 1))),
            surfaceOperatorStrength(metrics[i], 'cellFracture') * ((profile.fractureScatter || 0)
              * (1 + (profile.fractureEnergy || 0) * 0.32) + (profile.fractureCell || 0) * (1 + (profile.fractureEnergy || 0) * 0.15)),
            surfaceOperatorStrength(metrics[i], 'ribbonEcho') * (Math.abs(profile.ribbonDepth || 0) * 1.25
              + params.fontSize * (0.5 + (profile.ribbonWeave || 0) * 0.38)),
            (surfaceOperatorStrength(metrics[i], 'copyDecay') > 0.002 && profile.copyFailure === 'transfer') ? copyTransferPad(profile)
              : surfaceOperatorStrength(metrics[i], 'copyDecay') * (Math.abs(profile.copyMotion || 0) + (profile.copyErosion || 0) * 3 + (profile.copyToner || 0) * 18),
            surfaceOperatorStrength(metrics[i], 'risoSeparation') * ((profile.risoRegister || 0) * 1.5 + 8),
            surfaceOperatorStrength(metrics[i], 'slitSweep') * (Math.abs(profile.slitTravel || 0) + (profile.slitWidth || 0) * 2));
        }
        return 40 + Math.ceil(extra);
      }
