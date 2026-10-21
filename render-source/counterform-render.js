// Canonical counterform-render declarations. Bundled for both editor and Worker.
// Environment dependencies are declared in manifest.json.

      function renderCounterformEngineLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var pressureAggregate = surfaceAggregate(glyphs, 'counterformEngine', 'counterformPressure', params.counterformPressure);
        if (!pressureAggregate.weight) return;
        var grammar = surfaceChoice(glyphs, 'counterformEngine', 'counterformGrammar', params.counterformGrammar, BATCH_PARAM_OPTIONS.counterformGrammar);
        if (grammar === 'legacy') grammar = surfaceChoice(glyphs, 'counterformEngine', 'counterformLegacyGrammar',
          params.counterformLegacyGrammar, BATCH_PARAM_OPTIONS.counterformLegacyGrammar);
        var pressure = pressureAggregate.value * pixelScale * L.s;
        var bridge = surfaceAggregate(glyphs, 'counterformEngine', 'counterformBridge', params.counterformBridge).value * pixelScale * L.s;
        var aperture = surfaceAggregate(glyphs, 'counterformEngine', 'counterformAperture', params.counterformAperture).value;
        var angle = surfaceAggregate(glyphs, 'counterformEngine', 'counterformAngle', params.counterformAngle).value * Math.PI / 180;
        var trap = surfaceAggregate(glyphs, 'counterformEngine', 'counterformTrap', params.counterformTrap).value * pixelScale * L.s;
        var mask = buildSurfaceMask(glyphs, 'counterformEngine', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'counterformEngine', coverBase);
        var source;
        try { source = mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height); }
        catch (error) { return; }
        var field = surfaceBoundaryDistance(source.data, width, height);
        if (!field.bounds) return;
        var topology = surfaceVoidTopology(field, width, height);
        var counterDistance = surfaceDistanceFromSeeds(topology.counter, width, height);
        var ridgeSeeds = new Uint8Array(width * height);
        for (var ry = Math.max(1, field.bounds[1]); ry < Math.min(height - 1, field.bounds[3]); ry++) {
          for (var rx = Math.max(1, field.bounds[0]); rx < Math.min(width - 1, field.bounds[2]); rx++) {
            var ridgeIndex = ry * width + rx;
            if (!field.inside[ridgeIndex] || field.distance[ridgeIndex] < 1.4) continue;
            var depth = field.distance[ridgeIndex];
            if (depth >= field.distance[ridgeIndex - 1] && depth >= field.distance[ridgeIndex + 1]
              && depth >= field.distance[ridgeIndex - width] && depth >= field.distance[ridgeIndex + width]) ridgeSeeds[ridgeIndex] = 1;
          }
        }
        var ridgeDistance = grammar === 'channel' || !topology.components.length
          ? surfaceDistanceFromSeeds(ridgeSeeds, width, height) : null;
        var work = surfaceScratch('counterform-engine-v26', width, height, true);
        var output = work.ctx.createImageData(width, height);
        var count = width * height;
        var cosA = Math.cos(angle), sinA = Math.sin(angle);
        for (var index = 0; index < count; index++) {
          var body = field.inside[index];
          var signed = surfaceSignedDistanceValue(field, index);
          if (pressure > 0 && body && counterDistance[index] <= pressure) body = false;
          else if (pressure < 0 && topology.counter[index] && field.distance[index] <= -pressure) body = true;
          if (body && grammar === 'channel' && ridgeDistance && ridgeDistance[index] <= bridge * (0.08 + aperture * 0.34)) body = false;
          if (body && grammar === 'trap') {
            var px = index % width, py = Math.floor(index / width);
            var normal = surfaceFieldNormal(field, width, height, px, py);
            var directional = Math.max(0, normal.x * cosA + normal.y * sinA);
            var counterNear = counterDistance[index] <= Math.max(1, trap * (0.38 + directional * 0.92));
            if (counterNear && field.distance[index] < trap * (0.2 + aperture * 0.45)) body = false;
          }
          if (!body) continue;
          var alpha = field.inside[index] ? Math.max(source.data[index * 4 + 3] / 255, 0.72) : 1;
          if (!field.inside[index] && pressure < 0) alpha = surfaceSmoothCoverage(-pressure - field.distance[index], 1.2);
          output.data[index * 4] = output.data[index * 4 + 1] = output.data[index * 4 + 2] = 255;
          output.data[index * 4 + 3] = Math.round(255 * alpha * pressureAggregate.strength);
        }

        // Destination material shading; the analysis grid and topology stay fixed.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext,discard=new Float64Array(4);RC.field(output,function(px,py,rgba){var x=px-.5,y=py-.5,outputX=x,outputY=y;var index=Math.floor(y)*(width)+Math.floor(x);
          var body = (RC.sample(field.inside,width,height,x,y)>=.5);
          var signed = RC.signed(field,width,height,x,y);
          if (pressure > 0 && body && RC.sample(counterDistance,width,height,x,y) <= pressure) body = false;
          else if (pressure < 0 && topology.counter[index] && RC.sample(field.distance,width,height,x,y) <= -pressure) body = true;
          if (body && grammar === 'channel' && ridgeDistance && RC.sample(ridgeDistance,width,height,x,y) <= bridge * (0.08 + aperture * 0.34)) body = false;
          if (body && grammar === 'trap') {
            var px = index % width, py = Math.floor(index / width);
            var normal = surfaceFieldNormal(field, width, height, px, py);
            var directional = Math.max(0, normal.x * cosA + normal.y * sinA);
            var counterNear = RC.sample(counterDistance,width,height,x,y) <= Math.max(1, trap * (0.38 + directional * 0.92));
            if (counterNear && RC.sample(field.distance,width,height,x,y) < trap * (0.2 + aperture * 0.45)) body = false;
          }
          if (!body) return;
          var alpha = (RC.sample(field.inside,width,height,x,y)>=.5) ? Math.max(RC.rasterSample(source.data,width,height,x,y,3) / 255, 0.72) : 1;
          if (!((RC.sample(field.inside,width,height,x,y)>=.5)) && pressure < 0) alpha = surfaceSmoothCoverage(-pressure - RC.sample(field.distance,width,height,x,y), 1.2);
          rgba[0] = rgba[1] = rgba[2] = 255;
          rgba[3] = Math.round(255 * alpha * pressureAggregate.strength);

        });}
        work.ctx.putImageData(output, 0, 0);
        var ctx = work.ctx;
        var components = topology.components.slice(0, 48);
        if (!components.length && field.bounds) components.push({
          x: (field.bounds[0] + field.bounds[2]) * 0.5,
          y: (field.bounds[1] + field.bounds[3]) * 0.5,
          minX: field.bounds[0], minY: field.bounds[1], maxX: field.bounds[2], maxY: field.bounds[3], size: 1
        });
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineCap = 'round';
        for (var c = 0; c < components.length; c++) {
          var component = components[c];
          var componentSpan = Math.max(4, component.maxX - component.minX, component.maxY - component.minY);
          var reach = Math.max(bridge, Math.min(Math.hypot(width, height) * 0.28,
            componentSpan * (0.45 + aperture * 1.8) + trap));
          var endX = component.x + cosA * reach;
          var endY = component.y + sinA * reach;
          var sideX = -sinA, sideY = cosA;
          if (grammar === 'stencil') {
            ctx.lineWidth = Math.max(0.8, bridge * (0.34 + aperture * 0.9));
            ctx.beginPath(); ctx.moveTo(component.x, component.y); ctx.lineTo(endX, endY); ctx.stroke();
          } else if (grammar === 'aperture') {
            var mouth = Math.max(1, bridge * 0.15);
            var opening = Math.max(mouth, bridge * (0.42 + aperture * 1.25));
            ctx.beginPath();
            ctx.moveTo(component.x + sideX * mouth, component.y + sideY * mouth);
            ctx.quadraticCurveTo(component.x + cosA * reach * 0.55 + sideX * opening * 0.3,
              component.y + sinA * reach * 0.55 + sideY * opening * 0.3,
              endX + sideX * opening, endY + sideY * opening);
            ctx.lineTo(endX - sideX * opening, endY - sideY * opening);
            ctx.quadraticCurveTo(component.x + cosA * reach * 0.55 - sideX * opening * 0.3,
              component.y + sinA * reach * 0.55 - sideY * opening * 0.3,
              component.x - sideX * mouth, component.y - sideY * mouth);
            ctx.closePath(); ctx.fill();
          } else if (grammar === 'trap' && trap > 0.2) {
            var trapWidth = Math.max(1, bridge * 0.5 + trap * 0.12);
            ctx.beginPath();
            ctx.moveTo(component.x + sideX * trapWidth, component.y + sideY * trapWidth);
            ctx.lineTo(component.x + cosA * trap, component.y + sinA * trap);
            ctx.lineTo(component.x - sideX * trapWidth, component.y - sideY * trapWidth);
            ctx.closePath(); ctx.fill();
          }
        }
        ctx.restore();
        paintSurfaceMask(targetCtx, work.canvas, surfaceEffectColor('counterformEngine'), 1, 'counterform-engine-v26-color');
      }

      function renderCounterformEngineV29(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var grammar = surfaceChoice(glyphs, 'counterformEngine', 'counterformGrammar', params.counterformGrammar, BATCH_PARAM_OPTIONS.counterformGrammar);
        if (/V29$/.test(grammar)) grammar = grammar.slice(0, -3);
        if (grammar === 'legacy') {
          renderCounterformEngineLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        var pressureAggregate = surfaceAggregate(glyphs, 'counterformEngine', 'counterformPressure', params.counterformPressure);
        if (!pressureAggregate.weight) return;
        var pressure = pressureAggregate.value * pixelScale * L.s;
        var bridge = Math.max(0, surfaceAggregate(glyphs, 'counterformEngine', 'counterformBridge', params.counterformBridge).value * pixelScale * L.s);
        var aperture = Math.max(0, Math.min(1, surfaceAggregate(glyphs, 'counterformEngine', 'counterformAperture', params.counterformAperture).value));
        var angle = surfaceAggregate(glyphs, 'counterformEngine', 'counterformAngle', params.counterformAngle).value * Math.PI / 180;
        var trap = Math.max(0, surfaceAggregate(glyphs, 'counterformEngine', 'counterformTrap', params.counterformTrap).value * pixelScale * L.s);
        var mask = buildSurfaceMask(glyphs, 'counterformEngine', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'counterformEngine', coverBase);
        var source;
        try { source = mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height); }
        catch (error) { return; }
        var field = surfaceBoundaryDistance(source.data, width, height);
        if (!field.bounds) return;
        var topology = surfaceVoidTopology(field, width, height);
        var counterDistance = topology.components.length ? surfaceDistanceFromSeeds(topology.counter, width, height) : null;
        var ridgeDistance = null;
        if (grammar === 'channel') {
          var ridgeSeeds = new Uint8Array(width * height);
          for (var ry = Math.max(1, field.bounds[1]); ry < Math.min(height - 1, field.bounds[3]); ry++) {
            for (var rx = Math.max(1, field.bounds[0]); rx < Math.min(width - 1, field.bounds[2]); rx++) {
              var ridgeIndex = ry * width + rx;
              var depth = field.distance[ridgeIndex];
              if (!field.inside[ridgeIndex] || depth < 2.2) continue;
              var horizontalPeak = depth >= field.distance[ridgeIndex - 1] && depth >= field.distance[ridgeIndex + 1];
              var verticalPeak = depth >= field.distance[ridgeIndex - width] && depth >= field.distance[ridgeIndex + width];
              if (horizontalPeak || verticalPeak) ridgeSeeds[ridgeIndex] = 1;
            }
          }
          ridgeDistance = surfaceDistanceFromSeeds(ridgeSeeds, width, height);
        }
        var work = surfaceScratch('counterform-engine-v29', width, height, true);
        var output = work.ctx.createImageData(width, height);
        var morph = Math.abs(pressure) * (0.28 + aperture * 0.32);
        var channelWidth = Math.max(0.35, bridge * (0.045 + aperture * 0.16));
        for (var index = 0; index < width * height; index++) {
          var body = !!field.inside[index];
          var alpha = source.data[index * 4 + 3] / 255;
          if (body && pressure > 0 && counterDistance && counterDistance[index] <= morph) {
            body = false;
          } else if (!body && pressure < 0 && topology.counter[index] && field.distance[index] <= morph) {
            body = true;
            alpha = surfaceSmoothCoverage(morph - field.distance[index], 1.15);
          }
          if (body && grammar === 'channel' && ridgeDistance && ridgeDistance[index] <= channelWidth
            && field.distance[index] > channelWidth * 1.32) body = false;
          if (!body) continue;
          output.data[index * 4] = output.data[index * 4 + 1] = output.data[index * 4 + 2] = 255;
          output.data[index * 4 + 3] = Math.round(255 * Math.max(alpha, field.inside[index] ? 0.74 : 0.2) * pressureAggregate.strength);
        }

        // Destination material shading; the analysis grid and topology stay fixed.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext,discard=new Float64Array(4);RC.field(output,function(px,py,rgba){var x=px-.5,y=py-.5,outputX=x,outputY=y;var index=Math.floor(y)*(width)+Math.floor(x);
          var body = !!((RC.sample(field.inside,width,height,x,y)>=.5));
          var alpha = RC.rasterSample(source.data,width,height,x,y,3) / 255;
          if (body && pressure > 0 && counterDistance && RC.sample(counterDistance,width,height,x,y) <= morph) {
            body = false;
          } else if (!body && pressure < 0 && topology.counter[index] && RC.sample(field.distance,width,height,x,y) <= morph) {
            body = true;
            alpha = surfaceSmoothCoverage(morph - RC.sample(field.distance,width,height,x,y), 1.15);
          }
          if (body && grammar === 'channel' && ridgeDistance && RC.sample(ridgeDistance,width,height,x,y) <= channelWidth
            && RC.sample(field.distance,width,height,x,y) > channelWidth * 1.32) body = false;
          if (!body) return;
          rgba[0] = rgba[1] = rgba[2] = 255;
          rgba[3] = Math.round(255 * Math.max(alpha, (RC.sample(field.inside,width,height,x,y)>=.5) ? 0.74 : 0.2) * pressureAggregate.strength);

        });}
        work.ctx.putImageData(output, 0, 0);
        var ctx = work.ctx;
        var components = topology.components.slice(0, 64);
        if (components.length) {
          for (var componentIndex = 0; componentIndex < components.length; componentIndex++) {
            var component = components[componentIndex];
            var spanX = Math.max(3, component.maxX - component.minX);
            var spanY = Math.max(3, component.maxY - component.minY);
            var componentSpan = Math.max(spanX, spanY);
            var dirX = Math.cos(angle), dirY = Math.sin(angle);
            var sideX = -dirY, sideY = dirX;
            if (grammar === 'stencil' && bridge > 0.2) {
              // Positive ink joins opposite counter walls; it is deliberately
              // source-over, not another subtraction masquerading as a bridge.
              var bridgeSpan = Math.min(componentSpan * 0.62, Math.hypot(spanX, spanY) * 0.54);
              ctx.save();
              ctx.globalCompositeOperation = 'source-over';
              ctx.strokeStyle = '#fff';
              ctx.lineCap = 'round';
              ctx.lineWidth = Math.max(0.8, Math.min(componentSpan * 0.42, bridge * (0.42 + aperture * 0.72)));
              ctx.beginPath();
              ctx.moveTo(component.x - dirX * bridgeSpan, component.y - dirY * bridgeSpan);
              ctx.lineTo(component.x + dirX * bridgeSpan, component.y + dirY * bridgeSpan);
              ctx.stroke();
              ctx.restore();
            } else if (grammar === 'aperture') {
              var exit = surfaceCounterExit(field, width, height, component, angle);
              var exitDx = exit.x - component.x, exitDy = exit.y - component.y;
              var exitLength = Math.max(1, Math.hypot(exitDx, exitDy));
              exitDx /= exitLength; exitDy /= exitLength;
              sideX = -exitDy; sideY = exitDx;
              var throat = Math.max(0.8, bridge * (0.08 + aperture * 0.16));
              var mouth = Math.max(throat * 1.3, bridge * (0.34 + aperture * 0.9), componentSpan * aperture * 0.14);
              ctx.save();
              ctx.globalCompositeOperation = 'destination-out';
              ctx.beginPath();
              ctx.moveTo(component.x + sideX * throat, component.y + sideY * throat);
              ctx.bezierCurveTo(component.x + exitDx * exitLength * 0.38 + sideX * throat,
                component.y + exitDy * exitLength * 0.38 + sideY * throat,
                component.x + exitDx * exitLength * 0.72 + sideX * mouth * 0.74,
                component.y + exitDy * exitLength * 0.72 + sideY * mouth * 0.74,
                exit.x + sideX * mouth, exit.y + sideY * mouth);
              ctx.lineTo(exit.x - sideX * mouth, exit.y - sideY * mouth);
              ctx.bezierCurveTo(component.x + exitDx * exitLength * 0.72 - sideX * mouth * 0.74,
                component.y + exitDy * exitLength * 0.72 - sideY * mouth * 0.74,
                component.x + exitDx * exitLength * 0.38 - sideX * throat,
                component.y + exitDy * exitLength * 0.38 - sideY * throat,
                component.x - sideX * throat, component.y - sideY * throat);
              ctx.closePath(); ctx.fill();
              ctx.restore();
            } else if (grammar === 'trap' && trap > 0.2) {
              ctx.save();
              ctx.globalCompositeOperation = 'destination-out';
              var halfProjection = Math.abs(dirX) * spanX * 0.5 + Math.abs(dirY) * spanY * 0.5;
              var trapWidth = Math.max(0.8, Math.min(componentSpan * 0.28, bridge * 0.36 + trap * 0.1));
              for (var trapSide = -1; trapSide <= 1; trapSide += 2) {
                var rootX = component.x + dirX * halfProjection * trapSide;
                var rootY = component.y + dirY * halfProjection * trapSide;
                ctx.beginPath();
                ctx.moveTo(rootX + sideX * trapWidth, rootY + sideY * trapWidth);
                ctx.lineTo(rootX + dirX * trap * trapSide, rootY + dirY * trap * trapSide);
                ctx.lineTo(rootX - sideX * trapWidth, rootY - sideY * trapWidth);
                ctx.quadraticCurveTo(rootX - dirX * trap * 0.16 * trapSide,
                  rootY - dirY * trap * 0.16 * trapSide,
                  rootX + sideX * trapWidth, rootY + sideY * trapWidth);
                ctx.closePath(); ctx.fill();
              }
              ctx.restore();
            }
          }
        }
        paintSurfaceMask(targetCtx, work.canvas, surfaceEffectColor('counterformEngine'), 1, 'counterform-engine-v29-color');
      }

      var CounterformEngine = (function () {
      /*
       * Counterform Engine v42 prototype
       *
       * The input is one high-resolution glyph alpha mask. All construction happens
       * in that glyph-local frame: counters are labelled independently from exterior
       * paper, open bays are recovered as fallback chambers, and each grammar uses a
       * different material operation. There are no DOM, Canvas or camera inputs.
       */

      const COUNTERFORM_GRAMMARS = Object.freeze(['aperture', 'stencil', 'trap', 'channel']);

      const TAU = Math.PI * 2;
      const INF = 1e9;

      function finite(value, fallback = 0) {
        return Number.isFinite(value) ? value : fallback;
      }

      function clamp(value, low, high) {
        return Math.max(low, Math.min(high, value));
      }

      function normalizeCounterformSettings(input = {}) {
        const grammar = COUNTERFORM_GRAMMARS.includes(input.grammar) ? input.grammar : 'aperture';
        return Object.freeze({
          grammar,
          pressure: finite(Number(input.pressure)),
          bridge: Math.max(0, finite(Number(input.bridge))),
          aperture: clamp(finite(Number(input.aperture), 0.35), 0, 1),
          angle: finite(Number(input.angle)) * Math.PI / 180,
          trap: Math.max(0, finite(Number(input.trap))),
          seed: Math.trunc(finite(Number(input.seed)))
        });
      }

      function isCounterformNative(input = {}) {
        const settings = normalizeCounterformSettings(input);
        return Math.abs(settings.pressure) < 1e-6 && settings.bridge < 1e-6 && settings.trap < 1e-6;
      }

      function assertDimensions(width, height, length) {
        if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
          throw new RangeError('Counterform Engine: invalid source dimensions');
        }
        if (width > 4096 || height > 4096 || width * height > 8_388_608) {
          throw new RangeError('Counterform Engine: source exceeds the bounded glyph raster');
        }
        if (length !== width * height && length !== width * height * 4) {
          throw new RangeError('Counterform Engine: alpha source length does not match its dimensions');
        }
      }

      function alphaPlane(source, width, height) {
        assertDimensions(width, height, source.length);
        const count = width * height;
        const alpha = new Uint8ClampedArray(count);
        if (source.length === count) alpha.set(source);
        else for (let i = 0; i < count; i++) alpha[i] = source[i * 4 + 3];
        return alpha;
      }

      function boundsOf(mask, width, height) {
        let minX = width;
        let minY = height;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          if (!mask[y * width + x]) continue;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
        return maxX < 0 ? null : [minX, minY, maxX, maxY];
      }

      function counterformDistanceFromSeeds(seeds, width, height) {
        assertDimensions(width, height, seeds.length);
        const count = width * height;
        const distance = new Float32Array(count);
        for (let i = 0; i < count; i++) distance[i] = seeds[i] ? 0 : INF;
        const diagonal = Math.SQRT2;
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          const i = y * width + x;
          let d = distance[i];
          if (x) d = Math.min(d, distance[i - 1] + 1);
          if (y) d = Math.min(d, distance[i - width] + 1);
          if (x && y) d = Math.min(d, distance[i - width - 1] + diagonal);
          if (x + 1 < width && y) d = Math.min(d, distance[i - width + 1] + diagonal);
          distance[i] = d;
        }
        for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
          const i = y * width + x;
          let d = distance[i];
          if (x + 1 < width) d = Math.min(d, distance[i + 1] + 1);
          if (y + 1 < height) d = Math.min(d, distance[i + width] + 1);
          if (x + 1 < width && y + 1 < height) d = Math.min(d, distance[i + width + 1] + diagonal);
          if (x && y + 1 < height) d = Math.min(d, distance[i + width - 1] + diagonal);
          distance[i] = d;
        }
        return distance;
      }

      function labelVoids(inside, distanceToInk, width, height) {
        const count = width * height;
        const outside = new Uint8Array(count);
        const counter = new Uint8Array(count);
        const visited = new Uint8Array(count);
        const queue = new Int32Array(count);
        let head = 0;
        let tail = 0;
        function enqueue(index) {
          if (index < 0 || index >= count || inside[index] || outside[index]) return;
          outside[index] = 1;
          queue[tail++] = index;
        }
        for (let x = 0; x < width; x++) {
          enqueue(x);
          enqueue((height - 1) * width + x);
        }
        for (let y = 1; y + 1 < height; y++) {
          enqueue(y * width);
          enqueue(y * width + width - 1);
        }
        while (head < tail) {
          const current = queue[head++];
          const x = current % width;
          const y = Math.floor(current / width);
          if (x) enqueue(current - 1);
          if (x + 1 < width) enqueue(current + 1);
          if (y) enqueue(current - width);
          if (y + 1 < height) enqueue(current + width);
        }
        for (let i = 0; i < count; i++) if (!inside[i] && !outside[i]) counter[i] = 1;

        const components = [];
        for (let start = 0; start < count; start++) {
          if (!counter[start] || visited[start]) continue;
          head = 0;
          tail = 0;
          queue[tail++] = start;
          visited[start] = 1;
          let size = 0;
          let sumX = 0;
          let sumY = 0;
          let minX = width;
          let minY = height;
          let maxX = -1;
          let maxY = -1;
          let radius = 0;
          while (head < tail) {
            const cell = queue[head++];
            const x = cell % width;
            const y = Math.floor(cell / width);
            size++;
            sumX += x;
            sumY += y;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
            radius = Math.max(radius, distanceToInk[cell]);
            const neighbours = [x ? cell - 1 : -1, x + 1 < width ? cell + 1 : -1,
              y ? cell - width : -1, y + 1 < height ? cell + width : -1];
            for (const next of neighbours) if (next >= 0 && counter[next] && !visited[next]) {
              visited[next] = 1;
              queue[tail++] = next;
            }
          }
          if (size >= 4) components.push({
            x: sumX / size,
            y: sumY / size,
            size,
            minX,
            minY,
            maxX,
            maxY,
            radius: Math.max(1, radius),
            closed: true
          });
        }
        components.sort((a, b) => b.size - a.size);
        if (components.length > 64) components.length = 64;
        return { outside, counter, components };
      }

      function rayHitsInk(inside, width, height, x, y, dx, dy, reach) {
        for (let step = 1; step <= reach; step += 1.25) {
          const px = Math.round(x + dx * step);
          const py = Math.round(y + dy * step);
          if (px < 0 || px >= width || py < 0 || py >= height) return false;
          if (inside[py * width + px]) return true;
        }
        return false;
      }

      function recoverOpenChambers(inside, outside, distanceToInk, bounds, width, height) {
        if (!bounds) return [];
        const [minX, minY, maxX, maxY] = bounds;
        const spanX = maxX - minX + 1;
        const spanY = maxY - minY + 1;
        const minSpan = Math.max(1, Math.min(spanX, spanY));
        const step = Math.max(2, Math.round(minSpan / 72));
        const minimumRadius = Math.max(2.25, minSpan * 0.022);
        const directions = [[1, 0], [-1, 0], [0, 1], [0, -1],
          [Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2],
          [Math.SQRT1_2, -Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2]];
        const candidates = [];
        for (let y = minY + step; y <= maxY - step; y += step) for (let x = minX + step; x <= maxX - step; x += step) {
          const index = y * width + x;
          if (!outside[index]) continue;
          const radius = distanceToInk[index];
          if (radius < minimumRadius || radius >= INF * 0.5) continue;
          let localMaximum = true;
          for (let oy = -step; oy <= step && localMaximum; oy += step) for (let ox = -step; ox <= step; ox += step) {
            if (!ox && !oy) continue;
            const nx = clamp(x + ox, 0, width - 1);
            const ny = clamp(y + oy, 0, height - 1);
            if (distanceToInk[ny * width + nx] > radius + 0.01) { localMaximum = false; break; }
          }
          if (!localMaximum) continue;
          const reach = Math.max(8, radius * 3.4);
          const hits = directions.map(([dx, dy]) => rayHitsInk(inside, width, height, x, y, dx, dy, reach));
          const hitCount = hits.reduce((sum, hit) => sum + Number(hit), 0);
          const opposing = Number(hits[0] && hits[1]) + Number(hits[2] && hits[3])
            + Number(hits[4] && hits[7]) + Number(hits[5] && hits[6]);
          if (hitCount < 3 || !opposing) continue;
          const edgeInset = Math.min(x - minX, maxX - x, y - minY, maxY - y);
          const enclosure = hitCount + opposing * 1.5 + Math.min(2, edgeInset / Math.max(1, radius));
          candidates.push({ x, y, radius, score: radius * enclosure, closed: false });
        }
        candidates.sort((a, b) => b.score - a.score);
        const chosen = [];
        for (const candidate of candidates) {
          if (chosen.some(other => Math.hypot(candidate.x - other.x, candidate.y - other.y)
            < Math.max(candidate.radius, other.radius) * 1.65)) continue;
          const reach = candidate.radius * 1.25;
          chosen.push({
            ...candidate,
            size: Math.PI * candidate.radius * candidate.radius,
            minX: Math.max(minX, candidate.x - reach),
            minY: Math.max(minY, candidate.y - reach),
            maxX: Math.min(maxX, candidate.x + reach),
            maxY: Math.min(maxY, candidate.y + reach)
          });
          if (chosen.length >= 6) break;
        }
        return chosen;
      }

      function medialRidges(inside, distanceToVoid, bounds, width, height) {
        const ridge = new Uint8Array(width * height);
        if (!bounds) return ridge;
        const [minX, minY, maxX, maxY] = bounds;
        for (let y = Math.max(1, minY); y <= Math.min(height - 2, maxY); y++) {
          for (let x = Math.max(1, minX); x <= Math.min(width - 2, maxX); x++) {
            const i = y * width + x;
            const depth = distanceToVoid[i];
            if (!inside[i] || depth < 2) continue;
            const horizontal = depth >= distanceToVoid[i - 1] && depth >= distanceToVoid[i + 1]
              && (depth > distanceToVoid[i - 1] || depth > distanceToVoid[i + 1]);
            const vertical = depth >= distanceToVoid[i - width] && depth >= distanceToVoid[i + width]
              && (depth > distanceToVoid[i - width] || depth > distanceToVoid[i + width]);
            const diagonalA = depth >= distanceToVoid[i - width - 1] && depth >= distanceToVoid[i + width + 1];
            const diagonalB = depth >= distanceToVoid[i - width + 1] && depth >= distanceToVoid[i + width - 1];
            if ((horizontal || vertical) && (diagonalA || diagonalB)) ridge[i] = 1;
          }
        }
        return ridge;
      }

      function prepareCounterformBody(source, width, height, options = {}) {
        const alpha = alphaPlane(source, width, height);
        const threshold = clamp(finite(Number(options.threshold), 127.5), 1, 254);
        const inside = new Uint8Array(width * height);
        const voidSeeds = new Uint8Array(width * height);
        for (let i = 0; i < inside.length; i++) {
          inside[i] = alpha[i] > threshold ? 1 : 0;
          voidSeeds[i] = inside[i] ? 0 : 1;
        }
        const bounds = boundsOf(inside, width, height);
        const distanceToInk = counterformDistanceFromSeeds(inside, width, height);
        const distanceToVoid = counterformDistanceFromSeeds(voidSeeds, width, height);
        const topology = labelVoids(inside, distanceToInk, width, height);
        const exteriorDistance = counterformDistanceFromSeeds(topology.outside, width, height);
        const counterDistance = topology.components.length
          ? counterformDistanceFromSeeds(topology.counter, width, height)
          : new Float32Array(width * height).fill(INF);
        const openChambers = recoverOpenChambers(inside, topology.outside, distanceToInk, bounds, width, height);
        const ridge = medialRidges(inside, distanceToVoid, bounds, width, height);
        const ridgeDistance = counterformDistanceFromSeeds(ridge, width, height);
        return Object.freeze({
          width,
          height,
          alpha,
          inside,
          bounds,
          distanceToInk,
          distanceToVoid,
          exteriorDistance,
          counterDistance,
          ridge,
          ridgeDistance,
          topology,
          openChambers
        });
      }

      function raySegment(body, component, angle) {
        const { inside, width, height } = body;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const limit = Math.hypot(width, height) * 0.48;
        let entered = false;
        let entry = null;
        let last = null;
        for (let step = 0; step <= limit; step += 0.75) {
          const x = Math.round(component.x + dx * step);
          const y = Math.round(component.y + dy * step);
          if (x < 0 || x >= width || y < 0 || y >= height) {
            if (entered) return { entry, exit: last || { x, y }, dx, dy, length: step };
            return null;
          }
          const ink = !!inside[y * width + x];
          if (ink && !entered) {
            entered = true;
            entry = { x, y, step };
          }
          if (entered && !ink) return { entry, exit: { x, y, step }, dx, dy, length: step };
          if (entered) last = { x, y, step };
        }
        return null;
      }

      function bestExit(body, component, angle) {
        const forward = raySegment(body, component, angle);
        const reverse = raySegment(body, component, angle + Math.PI);
        // Angle is an authored direction, not a hint to be silently flipped toward
        // the shortest wall. Only fall back to the opposite ray when the requested
        // ray never reaches a usable body segment.
        return forward || reverse;
      }

      function componentWall(body, component) {
        const spans = [];
        for (let i = 0; i < 16; i++) {
          const segment = raySegment(body, component, i * TAU / 16);
          if (segment) spans.push(Math.max(1, segment.exit.step - segment.entry.step));
        }
        if (!spans.length) return Math.max(2, Math.min(component.maxX - component.minX, component.maxY - component.minY) * 0.2);
        spans.sort((a, b) => a - b);
        return spans[Math.floor((spans.length - 1) * 0.45)];
      }

      function paintTaper(mask, width, height, from, to, startHalf, endHalf, curvature = 0, value = 1) {
        if (mask.presentationTapers) mask.presentationTapers.push({ from, to, startHalf, endHalf, curvature, value });
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.max(0.001, Math.hypot(dx, dy));
        const ux = dx / length;
        const uy = dy / length;
        const sx = -uy;
        const sy = ux;
        const reach = Math.max(startHalf, endHalf) + Math.abs(curvature) + 2;
        const minX = Math.max(0, Math.floor(Math.min(from.x, to.x) - reach));
        const maxX = Math.min(width - 1, Math.ceil(Math.max(from.x, to.x) + reach));
        const minY = Math.max(0, Math.floor(Math.min(from.y, to.y) - reach));
        const maxY = Math.min(height - 1, Math.ceil(Math.max(from.y, to.y) + reach));
        for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
          const rx = x + 0.5 - from.x;
          const ry = y + 0.5 - from.y;
          const projection = rx * ux + ry * uy;
          if (projection < 0 || projection > length) continue;
          const t = projection / length;
          const eased = t * t * (3 - 2 * t);
          const half = startHalf + (endHalf - startHalf) * eased;
          const bend = Math.sin(t * Math.PI) * curvature;
          const side = rx * sx + ry * sy - bend;
          if (Math.abs(side) <= half) mask[y * width + x] = value;
        }
      }

      function carveAperture(body, output, components, settings) {
        const { width, height, counterDistance } = body;
        for (let c = 0; c < components.length; c++) {
          const component = components[c];
          const spanX = Math.max(2, component.maxX - component.minX + 1);
          const spanY = Math.max(2, component.maxY - component.minY + 1);
          const span = Math.max(spanX, spanY);
          const wall = componentWall(body, component);
          const chamberGrowRaw = Math.max(0, settings.pressure) * (0.42 + settings.aperture * 0.25)
            + Math.min(spanX, spanY) * settings.aperture * 0.12
            + settings.bridge * (0.08 + settings.aperture * 0.08);
          const chamberGrow = Math.min(chamberGrowRaw, wall * (0.22 + settings.aperture * 0.42));
          if (output.presentationChambers) output.presentationChambers.push({ component, c, chamberGrow });
          if (chamberGrow > 0.25) {
            const pad = Math.ceil(chamberGrow * 1.35 + component.radius * 0.12);
            const minX = Math.max(0, Math.floor(component.minX - pad));
            const maxX = Math.min(width - 1, Math.ceil(component.maxX + pad));
            const minY = Math.max(0, Math.floor(component.minY - pad));
            const maxY = Math.min(height - 1, Math.ceil(component.maxY + pad));
            for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
              const index = y * width + x;
              if (!output[index]) continue;
              const theta = Math.atan2(y - component.y, x - component.x);
              const reciprocal = 0.72 + 0.22 * Math.abs(Math.cos(theta - settings.angle))
                + 0.1 * Math.sin(theta * 3 + settings.angle + c * 0.73);
              let distance;
              if (component.closed) distance = counterDistance[index];
              else distance = Math.max(0, Math.hypot(x - component.x, y - component.y) - component.radius);
              const reciprocalLimit = 0.52 + settings.aperture * 0.4;
              if (distance <= chamberGrow * reciprocal
                && distance < body.exteriorDistance[index] * reciprocalLimit) output[index] = 0;
            }
          }
          const exit = bestExit(body, component, settings.angle + c * 0.17);
          if (!exit || settings.bridge <= 0.1) continue;
          const throat = Math.max(0.7, settings.bridge * (0.055 + settings.aperture * 0.085));
          const mouth = Math.min(wall * (0.52 + settings.aperture * 0.25), Math.max(throat * 1.7,
            settings.bridge * (0.24 + settings.aperture * 0.56),
            span * settings.aperture * 0.065));
          paintTaper(output, width, height,
            { x: component.x, y: component.y },
            { x: exit.exit.x + exit.dx * 2, y: exit.exit.y + exit.dy * 2 },
            throat, mouth, Math.sin(settings.angle + c * 1.31) * mouth * settings.aperture * 0.28, 0);
        }
      }

      function carveStencil(body, output, components, settings) {
        const count = 1 + Math.min(3, Math.floor(settings.aperture * 3.999));
        const directions = [0, Math.PI, Math.PI / 2, -Math.PI / 2];
        for (let c = 0; c < components.length; c++) {
          const component = components[c];
          const span = Math.max(3, component.maxX - component.minX + 1, component.maxY - component.minY + 1);
          const half = Math.max(0.7, Math.min(span * 0.16,
            settings.bridge * (0.12 + settings.aperture * 0.22)));
          for (let slot = 0; slot < count; slot++) {
            const segment = raySegment(body, component, settings.angle + directions[slot]);
            if (!segment || settings.bridge <= 0.1) continue;
            paintTaper(output, body.width, body.height,
              { x: segment.entry.x - segment.dx * 1.5, y: segment.entry.y - segment.dy * 1.5 },
              { x: segment.exit.x + segment.dx * 2.5, y: segment.exit.y + segment.dy * 2.5 },
              half, half * (0.9 + settings.aperture * 0.18), 0, 0);
          }
        }
      }

      function carveTraps(body, output, components, settings) {
        const count = 2 + Math.min(5, Math.round(settings.aperture * 5));
        for (let c = 0; c < components.length; c++) {
          const component = components[c];
          const span = Math.max(3, component.maxX - component.minX + 1, component.maxY - component.minY + 1);
          for (let n = 0; n < count; n++) {
            const angle = settings.angle + n * TAU / count + c * 0.11;
            const segment = raySegment(body, component, angle);
            if (!segment || settings.trap <= 0.1) continue;
            const available = Math.max(1, segment.exit.step - segment.entry.step);
            const depth = Math.max(0.8, Math.min(available * 0.88,
              settings.trap * (0.64 + settings.aperture * 1.02), span * (0.16 + settings.aperture * 0.24)));
            const rootHalf = Math.max(0.7, Math.min(span * 0.13,
              settings.bridge * 0.14 + settings.trap * (0.085 + settings.aperture * 0.06)));
            paintTaper(output, body.width, body.height,
              { x: segment.entry.x - segment.dx, y: segment.entry.y - segment.dy },
              { x: segment.entry.x + segment.dx * depth, y: segment.entry.y + segment.dy * depth },
              rootHalf, Math.max(0.15, rootHalf * 0.08), 0, 0);
          }
        }
      }

      function carveChannels(body, output, settings) {
        const { width, height, bounds, ridgeDistance, distanceToVoid } = body;
        if (!bounds || settings.bridge <= 0.1) return;
        const [minX, minY, maxX, maxY] = bounds;
        const baseWidth = Math.max(0.7, settings.bridge * (0.1 + settings.aperture * 0.18));
        const period = Math.max(10, settings.bridge * (1.1 + settings.aperture * 1.4));
        const cos = Math.cos(settings.angle);
        const sin = Math.sin(settings.angle);
        for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
          const index = y * width + x;
          if (!output[index]) continue;
          const depth = distanceToVoid[index];
          const localWidth = Math.min(baseWidth * (0.82 + Math.min(1.5, depth / Math.max(1, baseWidth * 2)) * 0.22),
            depth * (0.3 + settings.aperture * 0.18));
          if (localWidth < 0.55 || ridgeDistance[index] > localWidth || depth <= localWidth * 1.12) continue;
          const coordinate = x * cos + y * sin + settings.seed * 0.618;
          const phase = ((coordinate / period) % 1 + 1) % 1;
          const valve = 0.055 + (1 - settings.aperture) * 0.06;
          if (phase < valve || phase > 1 - valve) continue;
          output[index] = 0;
        }
      }

      function applyPressure(body, output, settings) {
        if (settings.pressure > 0 && body.topology.components.length) {
          const grow = settings.pressure * (0.3 + settings.aperture * 0.24);
          const wallRatio = 0.4 + settings.aperture * 0.26;
          for (let i = 0; i < output.length; i++) {
            if (output[i] && body.counterDistance[i] <= grow
              && body.counterDistance[i] < body.exteriorDistance[i] * wallRatio) output[i] = 0;
          }
        } else if (settings.pressure < 0 && body.topology.components.length) {
          const fill = -settings.pressure * (0.48 + (1 - settings.aperture) * 0.24);
          for (let i = 0; i < output.length; i++) {
            if (!output[i] && body.topology.counter[i] && body.distanceToInk[i] <= fill) output[i] = 1;
          }
        }
      }

      function renderCounterformBody(body, input = {}) {
        if (!body || !body.inside || !body.topology) throw new TypeError('Counterform Engine: prepared body required');
        const settings = normalizeCounterformSettings(input);
        const output = body.inside.slice();
        output.presentationTapers = [];
        output.presentationChambers = [];
        if (!body.bounds || isCounterformNative(settings)) {
          return { mask: output, settings, metrics: counterformMaskMetrics(output, body.width, body.height) };
        }
        applyPressure(body, output, settings);
        const components = body.topology.components.length ? body.topology.components
          : body.openChambers.slice(0, 1 + Math.min(2, Math.round(settings.aperture * 2)));
        if (settings.grammar === 'aperture') carveAperture(body, output, components, settings);
        else if (settings.grammar === 'stencil') carveStencil(body, output, components, settings);
        else if (settings.grammar === 'trap') carveTraps(body, output, components, settings);
        else carveChannels(body, output, settings);
        return {
          mask: output,
          settings,
          metrics: {
            ...counterformMaskMetrics(output, body.width, body.height),
            counters: body.topology.components.length,
            openChambers: body.openChambers.length,
            grammar: settings.grammar
          }
        };
      }

      function counterformMaskMetrics(mask, width, height) {
        assertDimensions(width, height, mask.length);
        let ink = 0;
        const visited = new Uint8Array(mask.length);
        const queue = new Int32Array(mask.length);
        let components = 0;
        for (let i = 0; i < mask.length; i++) {
          if (mask[i]) ink++;
          if (!mask[i] || visited[i]) continue;
          components++;
          let head = 0;
          let tail = 0;
          queue[tail++] = i;
          visited[i] = 1;
          while (head < tail) {
            const cell = queue[head++];
            const x = cell % width;
            const y = Math.floor(cell / width);
            const neighbours = [x ? cell - 1 : -1, x + 1 < width ? cell + 1 : -1,
              y ? cell - width : -1, y + 1 < height ? cell + width : -1];
            for (const next of neighbours) if (next >= 0 && mask[next] && !visited[next]) {
              visited[next] = 1;
              queue[tail++] = next;
            }
          }
        }
        return { ink, inkRatio: ink / Math.max(1, mask.length), components, bounds: boundsOf(mask, width, height) };
      }

      function counterformMaskDistance(a, b) {
        if (!a || !b || a.length !== b.length) throw new RangeError('Counterform Engine: incomparable masks');
        let union = 0;
        let difference = 0;
        let intersection = 0;
        for (let i = 0; i < a.length; i++) {
          const av = !!a[i];
          const bv = !!b[i];
          if (av || bv) union++;
          if (av && bv) intersection++;
          if (av !== bv) difference++;
        }
        return { difference, union, intersection, normalized: difference / Math.max(1, union), iou: intersection / Math.max(1, union) };
      }

      function counterformMaskToRgba(mask, width, height) {
        assertDimensions(width, height, mask.length);
        const rgba = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < mask.length; i++) if (mask[i]) {
          rgba[i * 4] = 255;
          rgba[i * 4 + 1] = 255;
          rgba[i * 4 + 2] = 255;
          rgba[i * 4 + 3] = 255;
        }
        return rgba;
      }

      function traceCounterformMask(mask, width, height) {
        assertDimensions(width, height, mask.length);
        const stride = width + 2;
        const vertices = new Map();
        const outgoing = new Map();
        const segments = [];
        function value(x, y) {
          return x < 0 || y < 0 || x >= width || y >= height ? 0 : mask[y * width + x];
        }
        function crossing(x, y, vertical) {
          const key = ((y + 1) * stride + x + 1) * 2 + (vertical ? 1 : 0);
          if (!vertices.has(key)) vertices.set(key, {
            x: x + 0.5 + (vertical ? 0 : 0.5),
            y: y + 0.5 + (vertical ? 0.5 : 0)
          });
          return key;
        }
        function segment(start, end) {
          outgoing.set(start, segments.length);
          segments.push({ start, end });
        }
        for (let y = -1; y < height; y++) for (let x = -1; x < width; x++) {
          const a = value(x, y);
          const b = value(x + 1, y);
          const c = value(x + 1, y + 1);
          const d = value(x, y + 1);
          const code = (a ? 1 : 0) | (b ? 2 : 0) | (c ? 4 : 0) | (d ? 8 : 0);
          if (!code || code === 15) continue;
          const values = [a, b, c, d];
          const cross = [-1, -1, -1, -1];
          let enter = -1;
          let leave = -1;
          let count = 0;
          for (let side = 0; side < 4; side++) {
            const next = (side + 1) % 4;
            if (!!values[side] === !!values[next]) continue;
            if (side === 0) cross[side] = crossing(x, y, false);
            else if (side === 1) cross[side] = crossing(x + 1, y, true);
            else if (side === 2) cross[side] = crossing(x, y + 1, false);
            else cross[side] = crossing(x, y, true);
            if (values[side]) leave = cross[side];
            else enter = cross[side];
            count++;
          }
          if (count === 2) segment(leave, enter);
          else if (count === 4) for (let corner = 0; corner < 4; corner++) {
            if (values[corner]) segment(cross[corner], cross[(corner + 3) % 4]);
          }
        }
        const visited = new Uint8Array(segments.length);
        const contours = [];
        for (let first = 0; first < segments.length; first++) {
          if (visited[first]) continue;
          let index = first;
          const points = [];
          let area = 0;
          let closed = false;
          const origin = segments[first].start;
          while (index !== undefined && !visited[index]) {
            const edge = segments[index];
            const from = vertices.get(edge.start);
            const to = vertices.get(edge.end);
            visited[index] = 1;
            points.push(from);
            area += from.x * to.y - to.x * from.y;
            if (edge.end === origin) { closed = true; break; }
            index = outgoing.get(edge.end);
          }
          if (closed && points.length >= 3 && Math.abs(area) > 1e-6) contours.push({ points, area: area * 0.5 });
        }
        return contours;
      }
      return { COUNTERFORM_GRAMMARS, normalizeCounterformSettings, isCounterformNative, prepareCounterformBody, renderCounterformBody, counterformMaskMetrics };
      })();

      var counterformFontRevision = 0;

      var counterformSourceCache = new Map();

      var counterformSourceCells = 0;

      var counterformPreparedCache = new Map();

      var counterformPreparedCells = 0;

      var counterformVariantCache = new Map();

      var counterformVariantCells = 0;

      function counterformProfileSettings(g) {
        var profile = g.surface || {};
        function value(key) { return Number.isFinite(profile[key]) ? profile[key] : params[key]; }
        var grammar = BATCH_PARAM_OPTIONS.counterformGrammar.indexOf(profile.counterformGrammar) >= 0
          ? profile.counterformGrammar : params.counterformGrammar;
        var localScale = 768 / Math.max(1, params.fontSize);
        return { grammar: grammar, pressure: value('counterformPressure') * localScale,
          bridge: value('counterformBridge') * localScale, aperture: value('counterformAperture'),
          angle: value('counterformAngle'), trap: value('counterformTrap') * localScale, seed: params.seed };
      }

      function counterformOldGrammar(settings) { return settings.grammar === 'legacy' || /V29$/.test(settings.grammar); }

      function counterformSourceKey(ch, g) {
        return counterformFontRevision + ':' + (g && g.fontAxes ? glyphFontSpec(g,768).key : params.fontWeight + ' 768px ' + params.fontFamily) + '\u0000' + ch;
      }

      function counterformTouch(cache, key, value) { cache.delete(key); cache.set(key, value); return value; }

      function counterformTrim(cache, sizeKey, maximumEntries, maximumCells, currentCells) {
        while (cache.size > maximumEntries || currentCells > maximumCells) {
          var oldest = cache.keys().next().value, value = cache.get(oldest);
          currentCells -= value[sizeKey] || 0; cache.delete(oldest);
        }
        return currentCells;
      }

      function counterformSourceData(ch, g) {
        if (!String(ch || '').trim()) return null;
        var key = counterformSourceKey(ch,g), cached = counterformSourceCache.get(key);
        if (cached) return counterformTouch(counterformSourceCache, key, cached);
        var canvas = createRenderCanvas(), ctx = canvas.getContext('2d', { willReadFrequently: true });
        var font = g && g.fontAxes ? glyphFontSpec(g,768).font : params.fontWeight + ' 768px ' + params.fontFamily; ctx.font = font;
        var measure = ctx.measureText(ch), unit = 4;
        var left = Math.ceil(Math.max(0, measure.actualBoundingBoxLeft || 0)) + 16;
        var ascent = Math.ceil(Math.max(1, measure.actualBoundingBoxAscent || 768)) + 16;
        var right = Math.ceil(Math.max(measure.width, measure.actualBoundingBoxRight || 0)) + 16;
        var descent = Math.ceil(Math.max(0, measure.actualBoundingBoxDescent || 0)) + 16;
        var width = left + right, height = ascent + descent;
        if (!Number.isFinite(width + height) || width > 4096 || height > 4096 || width * height > 8388608) {
          throw new RangeError('Counterform Engine: この字形は高精度ソース上限を超えています。');
        }
        canvas.width = Math.max(8, width); canvas.height = Math.max(8, height);
        ctx.font = font; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff'; ctx.fillText(ch, left, ascent);
        var image = ctx.getImageData(0, 0, canvas.width, canvas.height), alpha = new Uint8ClampedArray(width * height);
        for (var i = 0; i < alpha.length; i++) alpha[i] = image.data[i * 4 + 3];
        ctx.textBaseline = 'middle'; var middle = ctx.measureText(ch);
        var middleOffset = Number.isFinite(middle.actualBoundingBoxAscent) && Number.isFinite(measure.actualBoundingBoxAscent)
          ? (measure.actualBoundingBoxAscent - middle.actualBoundingBoxAscent) / unit : 192 * .35;
        var result = { key: key, alpha: alpha, font: font, ch: ch, width: width, height: height, cells: width * height,
          left: left, ascentPx: ascent, unit: unit, advance: measure.width / unit, middleOffset: middleOffset };
        counterformSourceCache.set(key, result); counterformSourceCells += result.cells;
        counterformSourceCells = counterformTrim(counterformSourceCache, 'cells', 64, 12582912, counterformSourceCells);
        return result;
      }

      function counterformPreparedData(source) {
        var cached = counterformPreparedCache.get(source.key);
        if (cached) return counterformTouch(counterformPreparedCache, source.key, cached);
        var prepared = CounterformEngine.prepareCounterformBody(source.alpha, source.width, source.height);
        var result = { prepared: prepared, cells: source.cells };
        if (result.cells > 3145728) return result;
        counterformPreparedCache.set(source.key, result); counterformPreparedCells += result.cells;
        counterformPreparedCells = counterformTrim(counterformPreparedCache, 'cells', 12, 3145728, counterformPreparedCells);
        return result;
      }

      function counterformVariantKey(sourceKey, settings) {
        return sourceKey + '\u0000' + [settings.grammar, settings.pressure, settings.bridge,
          settings.aperture, settings.angle, settings.trap, settings.seed].join(':')
          + ':' + (globalThis.TypeDeformerRenderContext ? TypeDeformerRenderContext.key() : 'analysis');
      }

      function counterformPresentation(source, body, rendered, cropX, cropY, factor) {
        var R = TypeDeformerRenderContext, s = rendered.settings, w = body.width, h = body.height;
        var glyph = R.createCanvas(w, h, {factor:factor}), ctx = glyph.getContext('2d');
        ctx.font = source.font; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff';
        ctx.fillText(source.ch, source.left, source.ascentPx);
        var alpha = R.alphaSampler(glyph), tapers = rendered.mask.presentationTapers || [];
        R.release(glyph);
        var chambers = rendered.mask.presentationChambers || [];
        function sample(field,x,y){return R.sample(field,w,h,x,y);}
        function cover(distance,footprint){return Math.max(0,Math.min(1,.5+distance/Math.max(.0001,footprint)));}
        var shader = function(px,py,rgba,footprint){
          var x=px+cropX-.5,y=py+cropY-.5, ink=alpha(px+cropX,py+cropY);
          var cut=0,fill=0,counter=sample(body.counterDistance,x,y),exterior=sample(body.exteriorDistance,x,y);
          if(s.pressure>0&&body.topology.components.length){
            cut=cover(Math.min(s.pressure*(.3+s.aperture*.24)-counter,exterior*(.4+s.aperture*.26)-counter),footprint);
          }else if(s.pressure<0&&body.topology.components.length){
            fill=sample(body.topology.counter,x,y)*cover(-s.pressure*(.48+(1-s.aperture)*.24)-sample(body.distanceToInk,x,y),footprint);
          }
          for(var c=0;c<chambers.length;c++){
            var chamber=chambers[c];if(chamber.chamberGrow<=.25)continue;var component=chamber.component;
            var theta=Math.atan2(y-component.y,x-component.x),reciprocal=.72+.22*Math.abs(Math.cos(theta-s.angle))+.1*Math.sin(theta*3+s.angle+chamber.c*.73);
            var distance=component.closed?counter:Math.max(0,Math.hypot(x-component.x,y-component.y)-component.radius);
            cut=Math.max(cut,cover(Math.min(chamber.chamberGrow*reciprocal-distance,exterior*(.52+s.aperture*.4)-distance),footprint));
          }
          if(s.grammar==='channel'&&s.bridge>.1){
            var depth=sample(body.distanceToVoid,x,y),base=Math.max(.7,s.bridge*(.1+s.aperture*.18));
            var local=Math.min(base*(.82+Math.min(1.5,depth/Math.max(1,base*2))*.22),depth*(.3+s.aperture*.18));
            var period=Math.max(10,s.bridge*(1.1+s.aperture*1.4)),coordinate=x*Math.cos(s.angle)+y*Math.sin(s.angle)+s.seed*.618;
            var phase=((coordinate/period)%1+1)%1,valve=.055+(1-s.aperture)*.06;
            cut=Math.max(cut,cover(Math.min(local-.55,local-sample(body.ridgeDistance,x,y),depth-local*1.12,(phase-valve)*period,(1-valve-phase)*period),footprint));
          }
          // Taper geometry has analytic sides, curved centerlines and end caps.
          for(var k=0;k<tapers.length;k++){
            var t=tapers[k],dx=t.to.x-t.from.x,dy=t.to.y-t.from.y,length=Math.max(.001,Math.hypot(dx,dy));
            var rx=px+cropX-t.from.x,ry=py+cropY-t.from.y,along=(rx*dx+ry*dy)/length,u=along/length;
            if(u<0||u>1)continue;var half=t.startHalf+(t.endHalf-t.startHalf)*u*u*(3-2*u);
            var side=(-rx*dy+ry*dx)/length-Math.sin(u*Math.PI)*t.curvature;
            var distance=Math.min(half-Math.abs(side),along,length-along),coverage=cover(distance,footprint);
            if(t.value)fill=Math.max(fill,coverage);else cut=Math.max(cut,coverage);
          }
          rgba[0]=rgba[1]=rgba[2]=255;rgba[3]=Math.max(ink,fill)*(1-cut)*255;
        };shader.release=alpha.release;return shader;
      }

      function counterformVariantData(ch, settings, g, factor) {
        var sourceKey = counterformSourceKey(ch,g), variantKey = counterformVariantKey(sourceKey, settings);
        var cached = counterformVariantCache.get(variantKey);
        if (cached) return counterformTouch(counterformVariantCache, variantKey, cached);
        var source = counterformSourceData(ch,g), prepared = counterformPreparedData(source).prepared;
        var rendered = CounterformEngine.renderCounterformBody(prepared, settings), bounds = rendered.metrics.bounds;
        if (!bounds) return null;
        var pad = 2, x = Math.max(0, bounds[0] - pad), y = Math.max(0, bounds[1] - pad);
        var right = Math.min(source.width - 1, bounds[2] + pad), bottom = Math.min(source.height - 1, bounds[3] + pad);
        var width = right - x + 1, height = bottom - y + 1;
        var canvas = globalThis.TypeDeformerRenderContext ? TypeDeformerRenderContext.createCanvas(width,height,{factor:factor}) : createRenderCanvas(), ctx = canvas.getContext('2d');
        canvas.width = width; canvas.height = height; var image = ctx.createImageData(width, height);
        for (var py = 0; py < height; py++) for (var px = 0; px < width; px++) {
          if (!rendered.mask[(y + py) * source.width + x + px]) continue;
          var index = (py * width + px) * 4; image.data[index] = image.data[index + 1] = image.data[index + 2] = image.data[index + 3] = 255;
        }
        var presentation=null;
        if(globalThis.TypeDeformerRenderContext && TypeDeformerRenderContext.current())
          TypeDeformerRenderContext.field(image,presentation=counterformPresentation(source,prepared,rendered,x,y,factor));
        try{ctx.putImageData(image, 0, 0);}finally{if(presentation)presentation.release();}
        var result = { canvas: canvas, cropX: x, cropY: y, width: width, height: height, cells: width * height,
          left: source.left, ascentPx: source.ascentPx, unit: source.unit, advance: source.advance, middleOffset: source.middleOffset,
          metrics: rendered.metrics };
        if(globalThis.TypeDeformerRenderContext && TypeDeformerRenderContext.current()){result.ephemeral=true;return result;}
        counterformVariantCache.set(variantKey, result); counterformVariantCells += result.cells;
        counterformVariantCells = counterformTrim(counterformVariantCache, 'cells', 96, 12582912, counterformVariantCells);
        return result;
      }

      function counterformDrawVariant(ctx, g, data, pixelScale, L, fm, strength) {
        ctx.save();
        try {
          spectralGlyphFrame(ctx, g, pixelScale, L, fm, data);
          ctx.globalAlpha = strength * (g.opacity == null ? 1 : g.opacity); ctx.imageSmoothingEnabled = true;
          ctx.drawImage(data.canvas, (data.cropX - data.left) / data.unit, (data.cropY - data.ascentPx) / data.unit,
            data.width / data.unit, data.height / data.unit);
        } finally { ctx.restore(); }
      }

      function renderCounterformEngine(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase, livePreview) {
        if (coverBase) compositeSurfaceSource(targetCtx, buildSurfaceMask(glyphs, 'counterformEngine', width, height, pixelScale, L, fm), 'counterformEngine', true);
        var work = surfaceScratch('counterform-engine-v42-local-body', width, height, true), dirty = false;
        function flush() {
          if (!dirty) return;
          paintSurfaceMask(targetCtx, work.canvas, surfaceEffectColor('counterformEngine'), 1, 'counterform-engine-v42-color');
          work.ctx.setTransform(1, 0, 0, 1, 0, 0); work.ctx.clearRect(0, 0, width, height); dirty = false;
        }
        var renderError = '';
        for (var i = 0; i < glyphs.length; i++) {
          var g = glyphs[i], strength = surfaceGlyphStrength(g, 'counterformEngine');
          if (strength <= .002 || (g.opacity != null && g.opacity <= .002) || !String(g.ch || '').trim()) continue;
          var settings = counterformProfileSettings(g);
          if (counterformOldGrammar(settings)) {
            flush(); var old = [g], oldGrammar = settings.grammar;
            while (i + 1 < glyphs.length && counterformProfileSettings(glyphs[i + 1]).grammar === oldGrammar) old.push(glyphs[++i]);
            if (oldGrammar === 'legacy') renderCounterformEngineLegacy(targetCtx, old, width, height, pixelScale, L, fm, false);
            else renderCounterformEngineV29(targetCtx, old, width, height, pixelScale, L, fm, false);
            continue;
          }
          if (CounterformEngine.isCounterformNative(settings)) {
            drawSurfaceGlyph(work.ctx, g, pixelScale, L, fm, strength, '#fff'); dirty = true; continue;
          }
          try {
            var renderContext=globalThis.TypeDeformerRenderContext&&TypeDeformerRenderContext.current();
            // The source uses 768px type; map that space to the final glyph footprint,
            // including its local transform, instead of treating it as a stage canvas.
            var sourceFactor=renderContext?renderContext.factor*pixelScale*L.s*params.fontSize/768*Math.max(.00001,Math.abs(g.scaleX||1)*(1+Math.abs(Math.tan((g.skewY||0)*Math.PI/180))),Math.abs(g.scaleY||1)*(1+Math.abs(Math.tan((g.skewX||0)*Math.PI/180)))):undefined;
            var data = counterformVariantData(g.ch, settings, g, sourceFactor); if (!data) continue;
            try{counterformDrawVariant(work.ctx, g, data, pixelScale, L, fm, strength);}finally{if(data.ephemeral)TypeDeformerRenderContext.release(data.canvas);}dirty = true;
          } catch (error) {
            if (!livePreview) throw error;
            if (!renderError) renderError = g.ch + ': ' + (error.message || String(error));
            drawSurfaceGlyph(work.ctx, g, pixelScale, L, fm, strength, '#fff'); dirty = true;
          }
        }
        flush();
        if (livePreview) counterformSetRenderError(renderError);
      }
