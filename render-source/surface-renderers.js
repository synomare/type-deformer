// Canonical surface-renderers declarations. Bundled for both editor and Worker.
// Environment dependencies are declared in manifest.json.

      function renderPlotterTraceLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var density = surfaceAggregate(glyphs, 'plotterTrace', 'traceDensity', params.traceDensity);
        if (!density.weight) return;
        var definition = surfaceAggregate(glyphs, 'plotterTrace', 'traceDefinition', params.traceDefinition).value;
        var stroke = surfaceAggregate(glyphs, 'plotterTrace', 'traceStroke', params.traceStroke).value;
        var jitter = surfaceAggregate(glyphs, 'plotterTrace', 'traceJitter', params.traceJitter).value * pixelScale * L.s;
        var lift = surfaceAggregate(glyphs, 'plotterTrace', 'traceLift', params.traceLift).value;
        var mask = buildSurfaceMask(glyphs, 'plotterTrace', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'plotterTrace', coverBase);
        var points = sampleSurfaceMask(mask, density.value, true, Math.min(1500, Math.round(180 + density.value * 720)));
        points = orderedPlotterPoints(points, definition, jitter * (compositionState.enabled ? 0.42 : 1));
        if (points.length < 2) return;

        var work = surfaceScratch('plotter-lines', width, height, false);
        var ctx = work.ctx;
        var baseWidth = Math.max(0.12, stroke * pixelScale * L.s);
        var phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) : 0;
        var phaseRad = phase * Math.PI * 2;
        ctx.strokeStyle = surfaceEffectColor('plotterTrace');
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = baseWidth;
        ctx.globalAlpha = density.strength * (compositionState.enabled ? 0.1 : 1);
        var liftedSegments = [];
        var liftThreshold = Math.max(8, params.fontSize * pixelScale * L.s * (0.2 + (1 - lift) * 0.72));
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (var i = 1; i < points.length; i++) {
          var routeDx = points[i].x - points[i - 1].x;
          var routeDy = points[i].y - points[i - 1].y;
          var routeDistance = Math.sqrt(routeDx * routeDx + routeDy * routeDy);
          var shouldLift = lift > 0.002 && routeDistance > liftThreshold
            && hash(i, params.seed % 101, 547) < Math.min(1, lift * (0.58 + routeDistance / Math.max(1, liftThreshold) * 0.18));
          if (shouldLift) {
            liftedSegments.push({ a: points[i - 1], b: points[i], distance: routeDistance });
            ctx.moveTo(points[i].x, points[i].y);
          } else ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.stroke();

        if (liftedSegments.length) {
          ctx.setLineDash([Math.max(2, baseWidth * 1.5), Math.max(5, baseWidth * (4 + lift * 4))]);
          ctx.lineWidth = Math.max(0.38, baseWidth * 0.52);
          ctx.globalAlpha = density.strength * (0.12 + lift * 0.34);
          for (var liftIndex = 0; liftIndex < liftedSegments.length; liftIndex++) {
            var lifted = liftedSegments[liftIndex];
            ctx.beginPath();
            ctx.moveTo(lifted.a.x, lifted.a.y);
            ctx.lineTo(lifted.b.x, lifted.b.y);
            ctx.stroke();
            if (hash(liftIndex, params.seed % 79, 551) < 0.22 + lift * 0.48) {
              var markerSize = Math.max(0.8, baseWidth * (0.7 + lift));
              ctx.fillStyle = surfaceEffectColor('plotterTrace');
              ctx.globalAlpha = density.strength * (0.36 + lift * 0.44);
              ctx.fillRect(lifted.b.x - markerSize, lifted.b.y - markerSize, markerSize * 2, markerSize * 2);
              ctx.globalAlpha = density.strength * (0.12 + lift * 0.34);
            }
          }
          ctx.setLineDash([]);
        }

        if (compositionState.enabled) {
          var passes = 2 + Math.round(density.value * 2);
          for (var pass = 0; pass < passes; pass++) {
            var drift = jitter * (0.18 + pass * 0.12);
            var windowCenter = (phase + pass / Math.max(1, passes) * 0.72) % 1;
            var windowSize = 0.052 + density.value * 0.062 + pass * 0.008;
            var drawingWindow = false;
            ctx.beginPath();
            for (var p = 0; p < points.length; p++) {
              var t = p / Math.max(1, points.length - 1);
              var phaseDistance = Math.abs(t - windowCenter);
              phaseDistance = Math.min(phaseDistance, 1 - phaseDistance);
              if (phaseDistance > windowSize) { drawingWindow = false; continue; }
              var px = points[p].x + Math.cos(t * Math.PI * (5 + pass * 2) + phaseRad + pass) * drift;
              var py = points[p].y + Math.sin(t * Math.PI * (4 + pass) - phaseRad * 0.7 + pass) * drift;
              if (!drawingWindow) ctx.moveTo(px, py); else ctx.lineTo(px, py);
              drawingWindow = true;
            }
            ctx.setLineDash([Math.max(3, 5 + definition * 0.42), Math.max(8, 30 - density.value * 18 + pass * 5)]);
            ctx.lineDashOffset = -phase * (180 + definition * 8) - pass * 17;
            ctx.lineWidth = baseWidth * (0.68 + pass * 0.24);
            ctx.globalAlpha = density.strength * (0.34 + pass * 0.09);
            ctx.stroke();
          }

          ctx.setLineDash([]);
          var head = Math.floor(phase * points.length);
          var headLength = Math.max(12, Math.round(points.length * (0.045 + density.value * 0.055)));
          ctx.beginPath();
          for (var h = 0; h <= headLength; h++) {
            var point = points[(head + h) % points.length];
            if (!h) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y);
          }
          ctx.lineWidth = baseWidth * 1.65;
          ctx.globalAlpha = density.strength;
          ctx.stroke();

          var travelNodes = surfaceNodesForGlyphs(glyphs, 'plotterTrace', 56, pixelScale, L, phaseRad, 0.08, 0.2);
          var travelReach = Math.max(24, params.fontSize * pixelScale * L.s * (1.25 + density.value));
          var travelEdges = surfaceGraphEdges(travelNodes, travelReach, 0.18 + density.value * 0.5, 569, 2.1);
          ctx.setLineDash([Math.max(2, baseWidth * 2), Math.max(5, baseWidth * 6)]);
          ctx.lineDashOffset = phase * -120;
          ctx.lineWidth = Math.max(0.45, baseWidth * 0.62);
          ctx.globalAlpha = density.strength * 0.34;
          for (var e = 0; e < travelEdges.length; e++) {
            var edgeGate = (hash(e, params.seed % 91, 571) + phase * (0.62 + hash(e, 3, 573) * 0.54)) % 1;
            if (edgeGate > 0.18 + density.value * 0.16) continue;
            var travelTension = 0.25 + Math.min(1, jitter / 20) * 0.72;
            strokeSurfaceCurve(ctx, travelEdges[e].a, travelEdges[e].b, phaseRad, travelTension, e + 577, 0);
            var travelCurve = surfaceCurveSpec(travelEdges[e].a, travelEdges[e].b, phaseRad, travelTension, e + 577, 0);
            var travelPoint = cubicSurfacePoint(travelCurve,
              (phase * (0.72 + hash(e, 7, 579) * 0.84) + hash(e, 11, 581)) % 1);
            ctx.fillStyle = surfaceEffectColor('plotterTrace');
            ctx.globalAlpha = density.strength * 0.72;
            ctx.beginPath();
            ctx.arc(travelPoint.x, travelPoint.y, Math.max(0.75, baseWidth * (0.8 + density.value)), 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = density.strength * 0.34;
          }
          ctx.setLineDash([]);
        }

        ctx.globalAlpha = 1;
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderTraceTimelineV34(ctx, timeline, phase, baseWidth, strength, density,
        lift, drift, diagonal, animated, secondary) {
        var role = secondary ? 0.62 : 1;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (!animated) {
          ctx.setLineDash([]);
          ctx.lineWidth = baseWidth * role;
          ctx.globalAlpha = strength * (secondary ? 0.58 : 0.86);
          traceStrokeItemsV34(ctx, timeline, 'draw');
          ctx.setLineDash([Math.max(2, baseWidth * 1.7), Math.max(5, baseWidth * (4.5 + lift * 5))]);
          ctx.lineWidth = Math.max(0.38, baseWidth * 0.5 * role);
          ctx.globalAlpha = strength * (secondary ? 0.09 : 0.12 + lift * 0.3);
          traceStrokeItemsV34(ctx, timeline, 'travel');
          traceDrawLiftMarkersV34(ctx, timeline, Math.max(1.5, baseWidth * 1.9), strength * lift * (secondary ? 0.16 : 0.55));
          ctx.setLineDash([]);
          return;
        }

        ctx.setLineDash([]);
        ctx.lineWidth = Math.max(0.28, baseWidth * 0.48 * role);
        ctx.globalAlpha = strength * (secondary ? 0.025 : 0.065);
        traceStrokeItemsV34(ctx, timeline, 'draw');
        var memory = Math.min(0.72, 0.16 + Math.min(0.3, density * 0.055)
          + Math.min(0.22, drift / Math.max(1, diagonal) * 1.8));
        var bands = [
          [0, Math.min(0.018, memory), 1.1, 1.82],
          [0.018, Math.min(0.055, memory), 0.76, 1.42],
          [0.055, Math.min(0.13, memory), 0.48, 1.08],
          [0.13, memory, 0.2, 0.72]
        ];
        for (var bandIndex = 0; bandIndex < bands.length; bandIndex++) {
          if (bands[bandIndex][1] <= bands[bandIndex][0]) continue;
          ctx.lineWidth = Math.max(0.3, baseWidth * bands[bandIndex][3] * role);
          ctx.globalAlpha = strength * bands[bandIndex][2] * (secondary ? 0.56 : 1);
          traceStrokeAgeBandV34(ctx, timeline, phase, bands[bandIndex][0], bands[bandIndex][1], 'draw');
        }
        ctx.setLineDash([Math.max(2, baseWidth * 1.8), Math.max(5, baseWidth * 6)]);
        ctx.lineDashOffset = -phase * (120 + density * 90);
        ctx.lineWidth = Math.max(0.38, baseWidth * 0.55 * role);
        ctx.globalAlpha = strength * lift * (secondary ? 0.04 : 0.13);
        traceStrokeItemsV34(ctx, timeline, 'travel');
        ctx.globalAlpha = strength * (secondary ? 0.4 : 0.9);
        traceStrokeAgeBandV34(ctx, timeline, phase, 0, Math.min(0.035, memory), 'travel');
        ctx.setLineDash([]);
        traceDrawLiftMarkersV34(ctx, timeline, Math.max(1.5, baseWidth * 1.8), strength * lift * (secondary ? 0.1 : 0.32));
        var head = traceTimelineHeadV34(timeline, phase);
        traceDrawHeadV34(ctx, head, Math.max(2.2, baseWidth * (secondary ? 1.45 : 1.8)), strength * (secondary ? 0.64 : 1));
      }

      function renderPlotterTrace(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        return TypeDeformerSharedSurface.renderPlotterTrace({surfaceChoice:surfaceChoice,params:params,BATCH_PARAM_OPTIONS:BATCH_PARAM_OPTIONS,renderPlotterTraceLegacy:renderPlotterTraceLegacy,surfaceAggregate:surfaceAggregate,buildSurfaceMask:buildSurfaceMask,compositionState:compositionState,traceMaskContoursV34:traceMaskContoursV34,compositeSurfaceSource:compositeSurfaceSource,traceAssignGlyphsV34:traceAssignGlyphsV34,traceWarpPathV34:traceWarpPathV34,traceOrderPathsV34:traceOrderPathsV34,traceTimelineV34:traceTimelineV34,surfaceScratch:surfaceScratch,surfaceEffectColor:surfaceEffectColor,renderTraceTimelineV34:renderTraceTimelineV34}, targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
      }

      function renderWebbingLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var density = surfaceAggregate(glyphs, 'webbing', 'webDensity', params.webDensity);
        if (!density.weight) return;
        var reach = surfaceAggregate(glyphs, 'webbing', 'webReach', params.webReach).value * pixelScale * L.s;
        var tension = surfaceAggregate(glyphs, 'webbing', 'webChaos', params.webChaos).value;
        var sag = surfaceAggregate(glyphs, 'webbing', 'webSag', params.webSag).value;
        var stroke = surfaceAggregate(glyphs, 'webbing', 'webStroke', params.webStroke).value;
        var mask = buildSurfaceMask(glyphs, 'webbing', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'webbing', coverBase);

        var phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var nodesPerGlyph = Math.min(5, 1 + Math.round(density.value * 1.35));
        var nodes = surfaceFieldNodesForGlyphs(glyphs, 'webbing', 120, nodesPerGlyph, pixelScale, L, phase,
          tension * 0.14, 0.18);
        if (nodes.length < 2) return;
        var hasMultipleGlyphs = false;
        for (var glyphCheck = 1; glyphCheck < nodes.length; glyphCheck++) {
          if (nodes[glyphCheck].glyphIndex !== nodes[0].glyphIndex) { hasMultipleGlyphs = true; break; }
        }
        if (!hasMultipleGlyphs) return;
        var edges = surfaceGraphEdges(nodes, Math.max(12, reach), density.value * 1.6, 587, 2.45,
          true);
        var degrees = new Array(nodes.length);
        for (var degreeIndex = 0; degreeIndex < degrees.length; degreeIndex++) degrees[degreeIndex] = 0;
        for (var degreeEdge = 0; degreeEdge < edges.length; degreeEdge++) {
          degrees[edges[degreeEdge].ai] += 1;
          degrees[edges[degreeEdge].bi] += 1;
        }
        var work = surfaceScratch('web-lines', width, height, false);
        var ctx = work.ctx;
        ctx.strokeStyle = surfaceEffectColor('webbing');
        ctx.fillStyle = surfaceEffectColor('webbing');
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        var lineWidth = Math.max(0.12, stroke * pixelScale * L.s);
        var strands = Math.min(8, 1 + Math.round(density.value * 3));
        for (var i = 0; i < edges.length; i++) {
          var edge = edges[i];
          for (var s = 0; s < strands; s++) {
            var lane = (s - (strands - 1) / 2) * lineWidth * (1.25 + tension * 1.8);
            ctx.lineWidth = lineWidth * (0.58 + hash(i, s, params.seed + 593) * 0.62);
            ctx.globalAlpha = density.strength * (0.06 + 0.28 / strands)
              / (1 + Math.max(0, stroke - 4) * 0.045);
            strokeWebCatenary(ctx, edge.a, edge.b, phase + s * 0.27, tension, sag,
              lane, i * 7 + s + 599);
          }
        }

        ctx.setLineDash([]);
        for (var n = 0; n < nodes.length; n++) {
          var showJunction = degrees[n] >= 3 || hash(n, params.seed % 73, 607) < 0.14 + tension * 0.12;
          if (!showJunction) continue;
          var anchorRadius = Math.max(0.72, lineWidth * (0.62 + Math.min(4, degrees[n]) * 0.18));
          ctx.globalAlpha = nodes[n].strength * (0.52 + Math.min(4, degrees[n]) * 0.08);
          ctx.beginPath();
          ctx.arc(nodes[n].x, nodes[n].y, anchorRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = nodes[n].strength * (0.16 + Math.min(5, Math.abs(sag)) * 0.035);
          ctx.lineWidth = Math.max(0.42, lineWidth * 0.38);
          ctx.beginPath();
          ctx.arc(nodes[n].x, nodes[n].y, anchorRadius * (1.75 + Math.min(2, Math.abs(sag) * 0.22)), 0, Math.PI * 2);
          ctx.stroke();
          if (tension > 0.55 && hash(n, degrees[n], params.seed + 611) < tension * 0.42) {
            ctx.globalAlpha = nodes[n].strength * 0.24;
            ctx.lineWidth = Math.max(0.4, lineWidth * 0.42);
            ctx.beginPath();
            ctx.arc(nodes[n].x, nodes[n].y, anchorRadius * (1.7 + tension), 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderWebbing(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        return TypeDeformerSharedSurface.renderWebbing({surfaceChoice:surfaceChoice,params:params,BATCH_PARAM_OPTIONS:BATCH_PARAM_OPTIONS,renderWebbingLegacy:renderWebbingLegacy,surfaceAggregate:surfaceAggregate,buildSurfaceMask:buildSurfaceMask,compositeSurfaceSource:compositeSurfaceSource,compositionState:compositionState,surfaceFieldNodesForGlyphs:surfaceFieldNodesForGlyphs,surfaceGraphEdges:surfaceGraphEdges,hash:hash,surfaceScratch:surfaceScratch,surfaceEffectColor:surfaceEffectColor}, targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
      }

      function renderSoftBlobSporeField(cores, width, height, averageRadius, reach, density, phase) {
        return TypeDeformerSharedSurface.renderSoftBlobSporeField({surfaceScratch:surfaceScratch,hash:hash,params:params,fillOrganicNode:fillOrganicNode}, cores, width, height, averageRadius, reach, density, phase);
      }

      function renderSoftBlob(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        return TypeDeformerSharedSurface.renderSoftBlob({surfaceAggregate:surfaceAggregate,params:params,buildSurfaceMask:buildSurfaceMask,compositeSurfaceSource:compositeSurfaceSource,surfaceScratch:surfaceScratch,compositionState:compositionState,surfaceFxPhase:surfaceFxPhase,surfaceFieldNodesForGlyphs:surfaceFieldNodesForGlyphs,renderSoftBlobSporeField:renderSoftBlobSporeField,surfaceGraphEdges:surfaceGraphEdges,hash:hash,strokeSurfaceCurve:strokeSurfaceCurve,drawSurfaceTube:drawSurfaceTube,surfaceCurveSpec:surfaceCurveSpec,cubicSurfacePoint:cubicSurfacePoint,fillOrganicNode:fillOrganicNode,paintSurfaceMask:paintSurfaceMask,surfaceEffectColor:surfaceEffectColor}, targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
      }

      function renderRasterPressLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var cellAggregate = surfaceAggregate(glyphs, 'rasterPress', 'rasterCell', params.rasterCell);
        if (!cellAggregate.weight) return;
        var gain = surfaceAggregate(glyphs, 'rasterPress', 'rasterGain', params.rasterGain).value;
        var angle = surfaceAggregate(glyphs, 'rasterPress', 'rasterAngle', params.rasterAngle).value * Math.PI / 180;
        var noise = surfaceAggregate(glyphs, 'rasterPress', 'rasterNoise', params.rasterNoise).value;
        var mask = buildSurfaceMask(glyphs, 'rasterPress', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'rasterPress', coverBase);
        var maskCtx = mask.getContext('2d', { willReadFrequently: true });
        var data;
        try { data = maskCtx.getImageData(0, 0, width, height).data; }
        catch (error) { return; }
        var cell = Math.max(1.5, cellAggregate.value * pixelScale * L.s);
        var estimated = width * height / Math.max(1, cell * cell);
        if (estimated > 9000) cell *= Math.sqrt(estimated / 9000);
        var work = surfaceScratch('raster-press', width, height, false);
        var ctx = work.ctx;
        var cx = width / 2, cy = height / 2;
        var cos = Math.cos(angle), sin = Math.sin(angle);
        var diagonal = Math.sqrt(width * width + height * height) + cell * 3;
        var phaseShift = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * cell : 0;
        ctx.fillStyle = surfaceEffectColor('rasterPress');
        var rowIndex = 0;
        for (var gy = -diagonal / 2 - cell; gy <= diagonal / 2 + cell; gy += cell) {
          var colIndex = 0;
          for (var gx = -diagonal / 2 - cell; gx <= diagonal / 2 + cell; gx += cell) {
            var screenX = gx + phaseShift;
            var px = Math.round(cx + screenX * cos - gy * sin);
            var py = Math.round(cy + screenX * sin + gy * cos);
            if (px < 0 || px >= width || py < 0 || py >= height) { colIndex++; continue; }
            var alpha = sampleMaskNeighborhoodAlpha(data, width, height, px, py, cell * 0.34);
            if (alpha < 0.025) { colIndex++; continue; }
            var grain = hash(colIndex, rowIndex, params.seed + 701) * 2 - 1;
            var dropout = hash(colIndex + 17, rowIndex + 31, params.seed + 709);
            if (noise > 0.55 && dropout < Math.min(0.66, (noise - 0.55) * 0.28)) { colIndex++; continue; }
            var radius = cell * 0.47 * gain * alpha * Math.max(0.08, 1 + grain * noise * 0.5);
            radius = Math.min(cell * (0.52 + gain * 0.38), Math.max(0.18, radius));
            ctx.globalAlpha = alpha * (0.72 + hash(colIndex, rowIndex, params.seed + 719) * 0.28);
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(angle + grain * noise * 0.13);
            if (gain > 1.35 || noise > 1.2) {
              var stretch = 1 + Math.max(0, gain - 1.35) * 0.72;
              ctx.fillRect(-radius * stretch, -radius * 0.72, radius * stretch * 2, radius * 1.44);
            } else {
              ctx.beginPath();
              ctx.arc(0, 0, radius, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
            colIndex++;
          }
          rowIndex++;
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(mask, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderHatchEngraveLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var spacingAggregate = surfaceAggregate(glyphs, 'hatchEngrave', 'hatchSpacing', params.hatchSpacing);
        if (!spacingAggregate.weight) return;
        var angle = surfaceAggregate(glyphs, 'hatchEngrave', 'hatchAngle', params.hatchAngle).value * Math.PI / 180;
        var warp = surfaceAggregate(glyphs, 'hatchEngrave', 'hatchWarp', params.hatchWarp).value;
        var stroke = surfaceAggregate(glyphs, 'hatchEngrave', 'hatchStroke', params.hatchStroke).value * pixelScale * L.s;
        var spacing = Math.max(1, spacingAggregate.value * pixelScale * L.s);
        var mask = buildSurfaceMask(glyphs, 'hatchEngrave', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'hatchEngrave', coverBase);
        var work = surfaceScratch('hatch-engrave', width, height, false);
        var ctx = work.ctx;
        var diagonal = Math.sqrt(width * width + height * height) + spacing * 4;
        var phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        ctx.strokeStyle = surfaceEffectColor('hatchEngrave');
        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.rotate(angle);
        drawHatchFamily(ctx, diagonal, spacing, warp, Math.max(0.12, stroke), phase, spacingAggregate.strength, 743);
        if (warp > 0.72) {
          ctx.rotate(Math.PI / 2 + Math.sin(warp) * 0.16);
          drawHatchFamily(ctx, diagonal, spacing * (1.45 + Math.min(2, warp) * 0.22), warp * 0.62,
            Math.max(0.1, stroke * 0.72), -phase * 0.73, spacingAggregate.strength * Math.min(0.72, 0.12 + warp * 0.2), 751);
        }
        ctx.restore();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(mask, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderRasterPress(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var screen = surfaceChoice(glyphs, 'rasterPress', 'rasterScreen', params.rasterScreen, BATCH_PARAM_OPTIONS.rasterScreen);
        var rasterV29 = /V29$/.test(screen);
        if (rasterV29) screen = screen.slice(0, -3);
        if (screen === 'legacy') {
          renderRasterPressLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        var cellAggregate = surfaceAggregate(glyphs, 'rasterPress', 'rasterCell', params.rasterCell);
        if (!cellAggregate.weight) return;
        var gain = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('rasterGain', surfaceAggregate(glyphs, 'rasterPress', 'rasterGain', params.rasterGain).value, 0, 0.02, Infinity) : Math.max(0.02, surfaceAggregate(glyphs, 'rasterPress', 'rasterGain', params.rasterGain).value));
        var angle = surfaceAggregate(glyphs, 'rasterPress', 'rasterAngle', params.rasterAngle).value * Math.PI / 180;
        var noise = Math.max(0, surfaceAggregate(glyphs, 'rasterPress', 'rasterNoise', params.rasterNoise).value);
        var modulation = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('rasterModulation', surfaceAggregate(glyphs, 'rasterPress', 'rasterModulation', params.rasterModulation).value, 0, 0, 4) : Math.max(0, Math.min(4, surfaceAggregate(glyphs, 'rasterPress', 'rasterModulation', params.rasterModulation).value)));
        var mask = buildSurfaceMask(glyphs, 'rasterPress', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'rasterPress', coverBase);
        var maskCtx = mask.getContext('2d', { willReadFrequently: true });
        var source;
        try { source = maskCtx.getImageData(0, 0, width, height); }
        catch (error) { return; }
        var boundary = surfaceBoundaryDistance(source.data, width, height);
        if (!boundary.bounds) return;
        var cell = Math.max(1.4, cellAggregate.value * pixelScale * L.s);
        // Plate pressure is visible beyond the exact glyph edge. This keeps the
        // screened cause legible even when the independently controlled source
        // text is kept at 100% opacity.
        var haloReach = Math.max(2, cell * (0.62 + modulation * 0.24 + noise * 0.12));
        var haloOpacity = Math.min(0.78, 0.28 + modulation * 0.09 + noise * 0.08);
        var densityScale = screen === 'mezzotint' ? 0.46 : 1;
        var estimate = width * height / Math.max(1, cell * cell * densityScale * densityScale);
        if (estimate > 10800) cell *= Math.sqrt(estimate / 10800) * densityScale;
        var work = surfaceScratch('raster-press-v24', width, height, false);
        var ctx = work.ctx;
        var cx = width / 2, cy = height / 2;
        var cos = Math.cos(angle), sin = Math.sin(angle);
        var diagonal = Math.sqrt(width * width + height * height) + cell * 5;
        var phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        ctx.fillStyle = surfaceEffectColor('rasterPress');
        ctx.strokeStyle = surfaceEffectColor('rasterPress');

        if (screen === 'gravure') {
          var gravureCells = rasterGravurePlanV58(source.data, boundary, width, height, cell, gain, angle,
            noise, modulation, cellAggregate.strength, phase / (Math.PI * 2), params.seed,
            haloReach, haloOpacity, 12000);
          drawRasterGravureV58(ctx, gravureCells, surfaceEffectColor('rasterPress'));
          rasterPressOutput(targetCtx, work, mask, boundary, haloReach, haloOpacity);
          return;
        }

        if (screen === 'line') {
          var lineSpacing = Math.max(2, cell * (0.78 + modulation * 0.1));
          var lineRows = Math.ceil(diagonal / lineSpacing);
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(angle);
          ctx.lineCap = modulation > 2.4 ? 'square' : 'round';
          for (var lineRow = -lineRows; lineRow <= lineRows; lineRow++) {
            var baseY = lineRow * lineSpacing;
            var lineSegments = Math.max(18, Math.min(96, Math.round(diagonal / Math.max(5, cell * 0.72))));
            ctx.beginPath();
            for (var lineSegment = 0; lineSegment <= lineSegments; lineSegment++) {
              var lineT = lineSegment / lineSegments;
              var lineX = -diagonal / 2 + lineT * diagonal;
              var lineWave = Math.sin(lineT * Math.PI * (2 + modulation * 1.5) + lineRow * 0.67 + phase)
                * cell * modulation * 0.18;
              var lineFray = (hash(lineSegment, lineRow, params.seed + 1811) * 2 - 1) * cell * noise * 0.08;
              if (!lineSegment) ctx.moveTo(lineX, baseY + lineWave + lineFray);
              else ctx.lineTo(lineX, baseY + lineWave + lineFray);
            }
            ctx.globalAlpha = cellAggregate.strength * (0.78 + hash(lineRow, params.seed % 97, 1813) * 0.2);
            ctx.lineWidth = Math.max(0.8, lineSpacing * gain * (0.42 + modulation * 0.075));
            ctx.stroke();
          }
          ctx.restore();
          rasterPressOutput(targetCtx, work, mask, rasterV29 ? null : boundary, haloReach, haloOpacity);
          return;
        }

        var sampleCell = screen === 'mezzotint' ? Math.max(1.25, cell * 0.46) : cell;
        var rows = Math.ceil(diagonal / sampleCell) + 2;
        var cols = rows;
        for (var row = -rows; row <= rows; row++) {
          for (var col = -cols; col <= cols; col++) {
            var localX = col * sampleCell;
            var localY = row * sampleCell;
            var jitterScale = screen === 'stochastic' ? 0.44 : (screen === 'mezzotint' ? 0.3 : 0.08 + noise * 0.05);
            localX += (hash(col, row, params.seed + 1823) * 2 - 1) * sampleCell * jitterScale;
            localY += (hash(col, row, params.seed + 1829) * 2 - 1) * sampleCell * jitterScale;
            var px = Math.round(cx + localX * cos - localY * sin);
            var py = Math.round(cy + localX * sin + localY * cos);
            if (px < 0 || px >= width || py < 0 || py >= height) continue;
            var index = py * width + px;
            var onBody = !!boundary.inside[index];
            if (rasterV29 && !onBody) continue;
            var grain = hash(col + 13, row + 29, params.seed + 1831);
            var edgeFalloff = onBody ? 1 : Math.max(0, 1 - boundary.distance[index] / haloReach);
            if (!onBody && (edgeFalloff <= 0 || grain > 0.28 + edgeFalloff * (0.34 + modulation * 0.06))) continue;
            var alpha = onBody
              ? sampleMaskNeighborhoodAlpha(source.data, width, height, px, py, sampleCell * 0.3)
              : edgeFalloff * edgeFalloff * haloOpacity;
            if (alpha < 0.02) continue;
            var depth = boundary.distance[index];
            var localTone = onBody
              ? Math.max(0, Math.min(1, 0.26 + depth / Math.max(1, cell * (0.7 + modulation * 0.3)) * 0.9))
              : Math.max(0.08, edgeFalloff * (0.34 + modulation * 0.08));
            var beat = 0.78 + Math.sin((col - row) * 0.43 + phase + depth * 0.06) * modulation * 0.1;
            var radius;
            if (screen === 'stochastic') {
              var keep = Math.min(0.96, 0.18 + localTone * (0.56 + modulation * 0.12) + alpha * 0.24);
              if (grain > keep) continue;
              radius = sampleCell * gain * (0.12 + modulation * 0.035) * (0.72 + hash(col, row, params.seed + 1837) * 0.42);
            } else if (screen === 'mezzotint') {
              var bite = hash(col + 7, row + 11, params.seed + 1847);
              if (bite > Math.min(0.98, 0.46 + localTone * 0.34 + modulation * 0.1)) continue;
              radius = sampleCell * gain * (0.22 + localTone * 0.3) * (0.75 + bite * 0.56);
            } else {
              radius = cell * gain * (0.16 + localTone * (0.34 + modulation * 0.06)) * beat;
            }
            radius = Math.max(0.18, Math.min(sampleCell * (0.72 + gain * 0.12), radius));
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(angle + (grain * 2 - 1) * noise * 0.12);
            ctx.globalAlpha = cellAggregate.strength * alpha * (0.82 + grain * 0.18);
            if (screen === 'mezzotint') {
              var scratchLength = radius * (2.2 + modulation * 0.85);
              ctx.lineWidth = Math.max(0.32, radius * (0.55 + gain * 0.18));
              ctx.beginPath();
              ctx.moveTo(-scratchLength, 0);
              ctx.lineTo(scratchLength, (grain * 2 - 1) * radius * 0.5);
              ctx.stroke();
              if (modulation > 2.15 && hash(col, row, params.seed + 1853) > 0.6) {
                ctx.rotate(Math.PI * (0.34 + grain * 0.16));
                ctx.beginPath();
                ctx.moveTo(-scratchLength * 0.58, 0);
                ctx.lineTo(scratchLength * 0.58, 0);
                ctx.stroke();
              }
            } else if (screen === 'adaptive' && modulation > 2.35 && (row + col) % 3 === 0) {
              ctx.beginPath();
              ctx.moveTo(0, -radius * 1.18);
              ctx.lineTo(radius, 0);
              ctx.lineTo(0, radius * 1.18);
              ctx.lineTo(-radius, 0);
              ctx.closePath();
              ctx.fill();
            } else {
              ctx.beginPath();
              ctx.arc(0, 0, radius, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          }
        }
        rasterPressOutput(targetCtx, work, mask, rasterV29 ? null : boundary, haloReach, haloOpacity);
      }

      function renderHatchEngrave(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var grammar = surfaceChoice(glyphs, 'hatchEngrave', 'hatchGrammar', params.hatchGrammar, BATCH_PARAM_OPTIONS.hatchGrammar);
        if (grammar === 'copperplate') {
          hatchCopperRender(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        var hatchV29 = /V29$/.test(grammar);
        if (hatchV29) grammar = grammar.slice(0, -3);
        if (grammar === 'legacy') {
          renderHatchEngraveLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        var spacingAggregate = surfaceAggregate(glyphs, 'hatchEngrave', 'hatchSpacing', params.hatchSpacing);
        if (!spacingAggregate.weight) return;
        var angle = surfaceAggregate(glyphs, 'hatchEngrave', 'hatchAngle', params.hatchAngle).value * Math.PI / 180;
        var warp = Math.max(0, surfaceAggregate(glyphs, 'hatchEngrave', 'hatchWarp', params.hatchWarp).value);
        var stroke = Math.max(0.12, surfaceAggregate(glyphs, 'hatchEngrave', 'hatchStroke', params.hatchStroke).value * pixelScale * L.s);
        var depth = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('hatchDepth', surfaceAggregate(glyphs, 'hatchEngrave', 'hatchDepth', params.hatchDepth).value, 0, 0, 4) : Math.max(0, Math.min(4, surfaceAggregate(glyphs, 'hatchEngrave', 'hatchDepth', params.hatchDepth).value)));
        var spacing = Math.max(2.1, spacingAggregate.value * pixelScale * L.s);
        var estimatedLines = (width + height) / spacing;
        if (estimatedLines > 620) spacing *= estimatedLines / 620;
        var mask = buildSurfaceMask(glyphs, 'hatchEngrave', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'hatchEngrave', coverBase);
        var maskCtx = mask.getContext('2d', { willReadFrequently: true });
        var source;
        try { source = maskCtx.getImageData(0, 0, width, height); }
        catch (error) { return; }
        var boundary = surfaceBoundaryDistance(source.data, width, height);
        if (!boundary.bounds) return;
        var plateReach = hatchV29 ? 0 : Math.max(1.5, spacing * (0.58 + depth * 0.16));
        var plateAlpha = Math.min(0.72, 0.22 + depth * 0.1 + warp * 0.035);
        var work = surfaceScratch('hatch-engrave-v24', width, height, false);
        var ctx = work.ctx;
        var phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        ctx.strokeStyle = surfaceEffectColor('hatchEngrave');

        if (grammar === 'burin') {
          var nodes = surfaceNodesForGlyphs(glyphs, 'hatchEngrave', 96, pixelScale, L, 0, 0, 0);
          ctx.lineCap = 'round';
          for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
            var node = nodes[nodeIndex];
            var cuts = Math.min(42, 12 + Math.round(depth * 7 + node.r / Math.max(3, spacing) * 0.28));
            for (var cut = 0; cut < cuts; cut++) {
              var cutAngle = angle + cut / Math.max(1, cuts) * Math.PI * 2
                + (hash(cut, nodeIndex, params.seed + 1889) * 2 - 1) * (0.08 + warp * 0.12);
              var inner = node.r * (0.04 + hash(cut, 3, params.seed + 1891) * 0.22);
              var reach = node.r * (0.72 + depth * 0.38 + hash(cut, 7, params.seed + 1901) * 0.55);
              var bend = Math.sin(cut * 1.7 + phase) * node.r * warp * 0.13;
              var sx = node.x + Math.cos(cutAngle) * inner;
              var sy = node.y + Math.sin(cutAngle) * inner;
              var ex = node.x + Math.cos(cutAngle) * reach;
              var ey = node.y + Math.sin(cutAngle) * reach;
              ctx.globalAlpha = spacingAggregate.strength * (0.3 + hash(cut, nodeIndex, params.seed + 1907) * 0.62);
              var burinWidth = stroke * (0.58 + depth * 0.16 + hash(cut, 11, params.seed + 1913) * 0.65);
              var controlX = (sx + ex) / 2 - Math.sin(cutAngle) * bend;
              var controlY = (sy + ey) / 2 + Math.cos(cutAngle) * bend;
              if (hatchV29) {
                ctx.lineWidth = burinWidth;
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.quadraticCurveTo(controlX, controlY, ex, ey);
                ctx.stroke();
              } else {
                var previousX = sx, previousY = sy;
                // A burin groove swells under pressure and releases to a hairline;
                // drawing short width-modulated segments keeps that physical
                // envelope visible instead of reducing it to a uniform ray.
                for (var burinStep = 1; burinStep <= 9; burinStep++) {
                  var burinT = burinStep / 9;
                  var burinOneMinus = 1 - burinT;
                  var burinX = burinOneMinus * burinOneMinus * sx
                    + 2 * burinOneMinus * burinT * controlX + burinT * burinT * ex;
                  var burinY = burinOneMinus * burinOneMinus * sy
                    + 2 * burinOneMinus * burinT * controlY + burinT * burinT * ey;
                  var swell = Math.pow(Math.sin(Math.PI * burinT), 0.72);
                  ctx.lineWidth = Math.max(0.22, burinWidth * (0.16 + swell * (0.92 + depth * 0.08)));
                  ctx.beginPath();
                  ctx.moveTo(previousX, previousY);
                  ctx.lineTo(burinX, burinY);
                  ctx.stroke();
                  previousX = burinX; previousY = burinY;
                }
              }
            }
          }
        } else if (grammar === 'crosscut') {
          drawAdaptiveHatchFamily(ctx, boundary, width, height, angle, spacing, warp, stroke,
            phase, spacingAggregate.strength, 1919, 0, 'crosscut', plateReach);
          drawAdaptiveHatchFamily(ctx, boundary, width, height, angle + Math.PI * (0.31 + depth * 0.025),
            spacing * (1.04 + depth * 0.09), warp * 0.74, stroke * 0.82, -phase,
            spacingAggregate.strength * Math.min(0.92, 0.36 + depth * 0.18), 1931,
            0, 'crosscut', plateReach * 0.82);
          drawAdaptiveHatchFamily(ctx, boundary, width, height, angle - Math.PI * (0.27 + depth * 0.018),
            spacing * (1.34 + depth * 0.08), warp * 0.52, stroke * 0.62, phase * 0.73,
            spacingAggregate.strength * Math.min(0.72, 0.12 + depth * 0.15), 1933,
            spacing * Math.max(0.08, 0.5 - depth * 0.1), 'crosscut', plateReach * 0.55);
        } else if (grammar === 'woodcut') {
          drawAdaptiveHatchFamily(ctx, boundary, width, height, angle, spacing * 1.18, warp + depth * 0.18,
            stroke * (1.45 + depth * 0.18), phase, spacingAggregate.strength, 1949, 0, 'woodcut', plateReach * 1.18);
          drawAdaptiveHatchFamily(ctx, boundary, width, height, angle + Math.PI * 0.46, spacing * (1.85 - Math.min(0.5, depth * 0.08)),
            warp * 0.48, stroke * 0.72, -phase * 0.82, spacingAggregate.strength * Math.min(0.66, 0.12 + depth * 0.14),
            1951, spacing * Math.max(0.42, 1.55 - depth * 0.2), 'woodcut', plateReach * 0.68);
        } else {
          drawAdaptiveHatchFamily(ctx, boundary, width, height, angle, spacing * 0.84, warp, stroke * 1.08,
            phase, spacingAggregate.strength, 1973, 0, 'tonal', plateReach);
          drawAdaptiveHatchFamily(ctx, boundary, width, height, angle + Math.PI * (0.38 + warp * 0.018),
            spacing * (1.45 + Math.max(0, 1.2 - depth) * 0.2), warp * 0.58, stroke * 0.68,
            -phase * 0.64, spacingAggregate.strength * Math.min(0.76, 0.16 + depth * 0.18), 1979,
            spacing * Math.max(0.12, 0.78 - depth * 0.17), 'tonal', plateReach * 0.58);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(hatchV29 ? mask : surfaceBoundaryEnvelopeCanvas(boundary, width, height, plateReach, plateAlpha,
          'hatch-engrave-envelope'), 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        if (!hatchV29) {
          var paperCuts = colorizeSurfaceCanvas(work.canvas, params.paper, 'hatch-engrave-paper-cuts');
          var relief = Math.max(0.45, Math.min(2.4, stroke * (0.4 + depth * 0.16)));
          targetCtx.globalAlpha = Math.min(0.96, 0.62 + depth * 0.08);
          targetCtx.drawImage(paperCuts, relief, relief * 0.58,
            targetCtx.canvas.width, targetCtx.canvas.height);
          targetCtx.globalAlpha = 1;
        }
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderTerminalExcessLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var reachAggregate = surfaceAggregate(glyphs, 'terminalExcess', 'terminalReach', params.terminalReach);
        if (!reachAggregate.weight) return;
        var style = surfaceChoice(glyphs, 'terminalExcess', 'terminalStyle', params.terminalStyle, BATCH_PARAM_OPTIONS.terminalStyle);
        if (style === 'legacy') style = surfaceChoice(glyphs, 'terminalExcess', 'terminalLegacyStyle',
          params.terminalLegacyStyle, BATCH_PARAM_OPTIONS.terminalLegacyStyle);
        var reach = reachAggregate.value * pixelScale * L.s;
        var mass = surfaceAggregate(glyphs, 'terminalExcess', 'terminalMass', params.terminalMass).value;
        var selection = surfaceAggregate(glyphs, 'terminalExcess', 'terminalSelection', params.terminalSelection).value;
        var bias = surfaceAggregate(glyphs, 'terminalExcess', 'terminalBias', params.terminalBias).value;
        var trap = surfaceAggregate(glyphs, 'terminalExcess', 'terminalTrap', params.terminalTrap).value * pixelScale * L.s;
        var mask = buildSurfaceMask(glyphs, 'terminalExcess', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'terminalExcess', coverBase);
        var source;
        try { source = mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height); }
        catch (error) { return; }
        var field = surfaceBoundaryDistance(source.data, width, height);
        if (!field.bounds) return;
        var points = sampleSurfaceMask(mask, Math.max(0.2, selection), true, 1200);
        var activeMeta = [];
        for (var glyphIndex = 0; glyphIndex < glyphs.length; glyphIndex++) {
          var activeStrength = surfaceGlyphStrength(glyphs[glyphIndex], 'terminalExcess');
          if (activeStrength <= 0.002) continue;
          var center = surfaceGlyphNode(glyphs[glyphIndex], 'terminalExcess', pixelScale, L, 0, 0, 0, glyphIndex, 0.5, 0.5, 1);
          activeMeta.push({
            index: glyphIndex,
            x: center.x,
            y: center.y,
            halfW: Math.max(4, Math.abs(glyphs[glyphIndex].w * glyphs[glyphIndex].scaleX) * pixelScale * L.s * 0.58),
            halfH: Math.max(4, Math.abs(glyphs[glyphIndex].h * glyphs[glyphIndex].scaleY) * pixelScale * L.s * 0.58)
          });
        }
        var candidates = [];
        for (var i = 0; i < points.length; i++) {
          var point = points[i];
          var px = Math.max(0, Math.min(width - 1, Math.round(point.x)));
          var py = Math.max(0, Math.min(height - 1, Math.round(point.y)));
          var normal = surfaceFieldNormal(field, width, height, px, py);
          var owner = null, ownerDistance = Infinity;
          for (var ownerIndex = 0; ownerIndex < activeMeta.length; ownerIndex++) {
            var possibleOwner = activeMeta[ownerIndex];
            var normalizedX = (point.x - possibleOwner.x) / possibleOwner.halfW;
            var normalizedY = (point.y - possibleOwner.y) / possibleOwner.halfH;
            var normalizedDistance = normalizedX * normalizedX + normalizedY * normalizedY;
            if (normalizedDistance < ownerDistance) { ownerDistance = normalizedDistance; owner = possibleOwner; }
          }
          if (!owner) continue;
          var radialX = point.x - owner.x, radialY = point.y - owner.y;
          var radialLength = Math.max(0.001, Math.hypot(radialX, radialY));
          var extremity = (normal.x * radialX + normal.y * radialY) / radialLength;
          var axisBias = bias * (Math.abs(normal.x) - Math.abs(normal.y));
          var score = extremity * 0.82 + axisBias * 0.42 + hash(i, params.seed % 131, 2203) * 0.18;
          if (score > 0.12) candidates.push({ x: point.x, y: point.y, nx: normal.x, ny: normal.y, score: score, glyphIndex: owner.index });
        }
        candidates.sort(function (a, b) { return b.score - a.score; });
        var activeGlyphs = activeMeta.length;
        var targetCount = Math.min(72, Math.max(2, Math.round(activeGlyphs * (0.35 + selection * 1.8))));
        var chosen = [];
        var chosenByGlyph = {};
        var perGlyphLimit = Math.max(1, Math.round(0.45 + selection * 2.4));
        var separation = Math.max(4, Math.min(reach * 0.58, params.fontSize * pixelScale * L.s * (0.18 + mass * 0.08)));
        for (var candidateIndex = 0; candidateIndex < candidates.length && chosen.length < targetCount; candidateIndex++) {
          var candidate = candidates[candidateIndex];
          if ((chosenByGlyph[candidate.glyphIndex] || 0) >= perGlyphLimit) continue;
          var clear = true;
          for (var chosenIndex = 0; chosenIndex < chosen.length; chosenIndex++) {
            if (Math.hypot(candidate.x - chosen[chosenIndex].x, candidate.y - chosen[chosenIndex].y) < separation) { clear = false; break; }
          }
          if (clear) {
            chosen.push(candidate);
            chosenByGlyph[candidate.glyphIndex] = (chosenByGlyph[candidate.glyphIndex] || 0) + 1;
          }
        }
        var work = surfaceScratch('terminal-excess-v26', width, height, false);
        work.ctx.drawImage(mask, 0, 0);
        work.ctx.fillStyle = '#fff';
        work.ctx.strokeStyle = '#fff';
        var base = Math.max(1.5, params.fontSize * pixelScale * L.s * (0.035 + mass * 0.045) + reach * 0.035);
        for (var terminalIndex = 0; terminalIndex < chosen.length; terminalIndex++) {
          var terminal = chosen[terminalIndex];
          var cadence = 0.72 + hash(terminalIndex, params.seed % 89, 2213) * 0.5;
          work.ctx.save();
          work.ctx.translate(terminal.x, terminal.y);
          work.ctx.rotate(Math.atan2(terminal.ny, terminal.nx));
          surfaceTerminalShapeLegacy(work.ctx, style, reach * cadence, base * (0.82 + cadence * 0.18), trap,
            reachAggregate.strength * (0.78 + terminal.score * 0.16));
          work.ctx.restore();
        }
        paintSurfaceMask(targetCtx, work.canvas, surfaceEffectColor('terminalExcess'), 1, 'terminal-excess-v26-color');
      }

      function renderLigatureBodyLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var fusionAggregate = surfaceAggregate(glyphs, 'ligatureBody', 'ligatureBodyFusion', params.ligatureBodyFusion);
        if (!fusionAggregate.weight) return;
        var grammar = surfaceChoice(glyphs, 'ligatureBody', 'ligatureBodyGrammar', params.ligatureBodyGrammar, BATCH_PARAM_OPTIONS.ligatureBodyGrammar);
        if (grammar === 'legacy') grammar = surfaceChoice(glyphs, 'ligatureBody', 'ligatureBodyLegacyGrammar',
          params.ligatureBodyLegacyGrammar, BATCH_PARAM_OPTIONS.ligatureBodyLegacyGrammar);
        var fusion = fusionAggregate.value;
        var reach = surfaceAggregate(glyphs, 'ligatureBody', 'ligatureBodyReach', params.ligatureBodyReach).value * pixelScale * L.s;
        var band = Math.max(1, surfaceAggregate(glyphs, 'ligatureBody', 'ligatureBodyBand', params.ligatureBodyBand).value * pixelScale * L.s
          * (0.68 + fusion * 0.22));
        var counter = surfaceAggregate(glyphs, 'ligatureBody', 'ligatureBodyCounter', params.ligatureBodyCounter).value;
        var tension = surfaceAggregate(glyphs, 'ligatureBody', 'ligatureBodyTension', params.ligatureBodyTension).value;
        var mask = buildSurfaceMask(glyphs, 'ligatureBody', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'ligatureBody', coverBase);
        var sourceData;
        try { sourceData = mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height).data; }
        catch (error) { return; }
        var active = [];
        for (var i = 0; i < glyphs.length; i++) if (surfaceGlyphStrength(glyphs[i], 'ligatureBody') > 0.002) active.push(glyphs[i]);
        if (!active.length) return;
        var work = surfaceScratch('ligature-body-v26', width, height, false);
        var ctx = work.ctx;
        ctx.drawImage(mask, 0, 0);
        ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        var cuts = [];
        var cadence = Math.max(1, Math.round(3.6 - Math.min(2.6, fusion * 0.9)));
        var cadenceOffset = Math.floor(hash(params.seed % 127, active.length, 2243) * cadence);
        for (var pairIndex = 0; pairIndex + 1 < active.length; pairIndex++) {
          if (cadence > 1 && (pairIndex + cadenceOffset) % cadence !== 0) continue;
          var first = active[pairIndex], second = active[pairIndex + 1];
          var registerA = 0.3 + hash(pairIndex, params.seed % 113, 2251) * 0.42;
          var registerB = 0.3 + hash(pairIndex, params.seed % 109, 2267) * 0.42;
          var a = surfaceGlyphNode(first, 'ligatureBody', pixelScale, L, 0, 0, 0, pairIndex,
            params.vertical ? registerA : 0.86, params.vertical ? 0.86 : registerA, 1);
          var b = surfaceGlyphNode(second, 'ligatureBody', pixelScale, L, 0, 0, 0, pairIndex + 1,
            params.vertical ? registerB : 0.14, params.vertical ? 0.14 : registerB, 1);
          var snapRadius = Math.max(6, params.fontSize * pixelScale * L.s * 0.46);
          a = surfaceSnapToMaskPoint(sourceData, width, height, a, snapRadius);
          b = surfaceSnapToMaskPoint(sourceData, width, height, b, snapRadius);
          var dx = b.x - a.x, dy = b.y - a.y;
          var distance = Math.hypot(dx, dy);
          if (reach <= 0.001 || distance > Math.max(reach, band * 1.4)) continue;
          var normalX = -dy / Math.max(1, distance), normalY = dx / Math.max(1, distance);
          var curve = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('ligatureBodyTension', tension, 0, -4, 4) : Math.max(-4, Math.min(4, tension))) * (0.52 + fusion * 0.12);
          ctx.globalAlpha = fusionAggregate.strength;
          if (grammar === 'sharedStem') {
            ctx.lineWidth = band;
            ctx.beginPath(); surfaceLigatureCurve(ctx, a, b, 0, curve * 0.22); ctx.stroke();
            var midX = (a.x + b.x) * 0.5, midY = (a.y + b.y) * 0.5;
            ctx.save(); ctx.translate(midX, midY); ctx.rotate(Math.atan2(dy, dx));
            var stemLength = params.fontSize * pixelScale * L.s * (0.72 + fusion * 0.3);
            ctx.fillRect(-band * 0.38, -stemLength * 0.5, band * 0.76, stemLength);
            ctx.restore();
          } else if (grammar === 'counterWeave') {
            ctx.lineWidth = band * 1.18;
            ctx.beginPath(); surfaceLigatureCurve(ctx, a, b, 0, curve); ctx.stroke();
            ctx.beginPath(); surfaceLigatureCurve(ctx, a, b, band * 0.46, -curve * 0.72); ctx.stroke();
            cuts.push({ a: a, b: b, offset: band * 0.2, curve: -curve * 0.72, width: band * counter * 0.42 });
          } else if (grammar === 'melt') {
            var steps = Math.max(8, Math.min(32, Math.round(10 + fusion * 5)));
            var bend = distance * curve * 0.18;
            for (var step = 0; step <= steps; step++) {
              var t = step / steps, mt = 1 - t;
              var cx = mt * mt * mt * a.x + 3 * mt * mt * t * (a.x + dx * 0.33 + normalX * bend)
                + 3 * mt * t * t * (a.x + dx * 0.67 - normalX * bend) + t * t * t * b.x;
              var cy = mt * mt * mt * a.y + 3 * mt * mt * t * (a.y + dy * 0.33 + normalY * bend)
                + 3 * mt * t * t * (a.y + dy * 0.67 - normalY * bend) + t * t * t * b.y;
              var radius = band * (0.4 + fusion * 0.08) * (0.78 + Math.sin(t * Math.PI) * 0.38);
              ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
            }
            cuts.push({ a: a, b: b, offset: 0, curve: curve, width: band * counter * 0.25 });
          } else {
            ctx.lineWidth = band * (0.72 + fusion * 0.12);
            ctx.beginPath(); surfaceLigatureCurve(ctx, a, b, 0, curve); ctx.stroke();
            var knotX = (a.x + b.x) * 0.5 + normalX * band * curve * 0.08;
            var knotY = (a.y + b.y) * 0.5 + normalY * band * curve * 0.08;
            ctx.beginPath(); ctx.arc(knotX, knotY, band * (0.32 + fusion * 0.045), 0, Math.PI * 2); ctx.fill();
            cuts.push({ a: a, b: b, offset: 0, curve: curve * 0.38, width: band * counter * 0.22 });
          }
          ctx.globalAlpha = 1;
        }
        if (counter > 0.002 && cuts.length) {
          ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.lineCap = 'round';
          for (var cutIndex = 0; cutIndex < cuts.length; cutIndex++) {
            var cut = cuts[cutIndex];
            ctx.lineWidth = Math.max(0.5, cut.width);
            ctx.beginPath(); surfaceLigatureCurve(ctx, cut.a, cut.b, cut.offset, cut.curve); ctx.stroke();
          }
          ctx.restore();
        }
        paintSurfaceMask(targetCtx, work.canvas, surfaceEffectColor('ligatureBody'), 1, 'ligature-body-v26-color');
      }

      function renderAsemicDuctus(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var defaultGrammar = surfaceChoice(glyphs, 'asemicDuctus', 'asemicGrammar', params.asemicGrammar, BATCH_PARAM_OPTIONS.asemicGrammar);
        var mask = buildSurfaceMask(glyphs, 'asemicDuctus', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'asemicDuctus', coverBase);
        var source;
        try { source = mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height); }
        catch (error) { return; }
        var field = surfaceBoundaryDistance(source.data, width, height);
        if (!field.bounds) return;
        var metas = surfaceGlyphAnatomyMetas(glyphs, 'asemicDuctus', pixelScale, L);
        if (!metas.length) return;
        var topology = surfaceVoidTopology(field, width, height);
        var phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var work = surfaceScratch('asemic-ductus-v37-body', width, height, false);
        // Finish the opaque writing and its cuts in an isolated glyph group.
        // One reused layer, not an allocation or full-frame copy per character.
        var glyphWork = surfaceScratch('asemic-ductus-v37-glyph', width, height, false);
        var ctx = glyphWork.ctx;
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#fff';
        for (var metaIndex = 0; metaIndex < metas.length; metaIndex++) {
          var meta = metas[metaIndex];
          var glyphText = String(meta.glyph.ch || '');
          // Whitespace carries rhythm and advance width but has no writing
          // body. Never synthesize a fallback mark into an intentional gap.
          if (!glyphText.trim()) continue;
          var codepoint = glyphText.codePointAt ? (glyphText.codePointAt(0) || 0) : (glyphText.charCodeAt(0) || 0);
          var seed = codepoint + params.seed * 131 + meta.index * 977;
          var grammar = asemicMetaChoice(meta, 'asemicGrammar', defaultGrammar, BATCH_PARAM_OPTIONS.asemicGrammar);
          var memory = asemicMetaParam(meta, 'asemicMemory', params.asemicMemory, 0, 1, false);
          var gestures = asemicMetaParam(meta, 'asemicGestures', params.asemicGestures, 2, 16, true);
          if (metas.length > 96) gestures = Math.min(gestures, 6);
          var weight = asemicMetaParam(meta, 'asemicWeight', params.asemicWeight, 0.4, 64, false) * pixelScale * L.s;
          var flow = asemicMetaParam(meta, 'asemicFlow', params.asemicFlow, -4, 4, false);
          var contrast = asemicMetaParam(meta, 'asemicContrast', params.asemicContrast, 0, 6, false);
          var flourish = asemicMetaParam(meta, 'asemicFlourish', params.asemicFlourish, 0, 480, false) * pixelScale * L.s;
          var counterMemory = asemicMetaParam(meta, 'asemicCounter', params.asemicCounter, 0, 1.5, false);
          var counters = asemicCounterComponents(topology, metas, meta);
          var anchors = asemicBuildAnchors(field, width, height, metas, meta, grammar,
            memory, gestures, flow, flourish, phase, seed);
          if (anchors.length < 2) continue;
          var inkBounds = asemicBodyBounds(anchors, counters, meta, weight, contrast, flow, grammar, width, height);
          if (!inkBounds) continue;
          ctx.clearRect(inkBounds.x, inkBounds.y, inkBounds.width, inkBounds.height);
          ctx.save();
          ctx.globalAlpha = 1;
          if (grammar === 'chamber') {
            asemicRenderChamber(ctx, anchors, counters, meta, weight, contrast, flow, phase, seed);
          } else if (grammar === 'polyphonic') {
            var voiceGap = weight * (1.08 + contrast * 0.055);
            asemicRenderPath(ctx, asemicOffsetPath(anchors, -voiceGap), weight, contrast, flow,
              phase, seed + 7, grammar, false, 0.58);
            asemicRenderPath(ctx, anchors, weight, contrast, flow, phase, seed + 11, grammar, false, 0.72);
            asemicRenderPath(ctx, asemicOffsetPath(anchors, voiceGap), weight, contrast, flow,
              phase, seed + 13, grammar, false, 0.58);
            ctx.lineWidth = Math.max(0.5, weight * 0.34);
            ctx.lineCap = 'round';
            for (var bridge = 1; bridge + 1 < anchors.length; bridge += 3) {
              var bridgeA = asemicOffsetPath([anchors[Math.max(0, bridge - 1)], anchors[bridge], anchors[Math.min(anchors.length - 1, bridge + 1)]], -voiceGap)[1];
              var bridgeB = asemicOffsetPath([anchors[Math.max(0, bridge - 1)], anchors[bridge], anchors[Math.min(anchors.length - 1, bridge + 1)]], voiceGap)[1];
              ctx.beginPath(); ctx.moveTo(bridgeA.x, bridgeA.y); ctx.lineTo(bridgeB.x, bridgeB.y); ctx.stroke();
            }
          } else {
            asemicRenderPath(ctx, anchors, weight, contrast, flow, phase, seed, grammar, false, 1);
          }
          asemicCutCounters(ctx, counters, meta, counterMemory, weight, grammar, flow, seed);
          ctx.restore();
          work.ctx.save();
          work.ctx.globalAlpha = meta.strength;
          work.ctx.drawImage(glyphWork.canvas, inkBounds.x, inkBounds.y, inkBounds.width, inkBounds.height,
            inkBounds.x, inkBounds.y, inkBounds.width, inkBounds.height);
          work.ctx.restore();
        }
        paintSurfaceMask(targetCtx, work.canvas, surfaceEffectColor('asemicDuctus'), 1, 'asemic-ductus-v37-color');
      }

      function renderTerminalExcess(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var style = surfaceChoice(glyphs, 'terminalExcess', 'terminalStyle', params.terminalStyle, BATCH_PARAM_OPTIONS.terminalStyle);
        if (style === 'legacy') {
          renderTerminalExcessLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        var reachAggregate = surfaceAggregate(glyphs, 'terminalExcess', 'terminalReach', params.terminalReach);
        if (!reachAggregate.weight) return;
        var reach = Math.max(0, reachAggregate.value * pixelScale * L.s);
        var mass = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('terminalMass', surfaceAggregate(glyphs, 'terminalExcess', 'terminalMass', params.terminalMass).value, 0, 0.1, Infinity) : Math.max(0.1, surfaceAggregate(glyphs, 'terminalExcess', 'terminalMass', params.terminalMass).value));
        var selection = Math.max(0.05, Math.min(1, surfaceAggregate(glyphs, 'terminalExcess', 'terminalSelection', params.terminalSelection).value));
        var bias = Math.max(-1, Math.min(1, surfaceAggregate(glyphs, 'terminalExcess', 'terminalBias', params.terminalBias).value));
        var trap = Math.max(0, surfaceAggregate(glyphs, 'terminalExcess', 'terminalTrap', params.terminalTrap).value * pixelScale * L.s);
        var mask = buildSurfaceMask(glyphs, 'terminalExcess', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'terminalExcess', coverBase);
        var source;
        try { source = mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height); }
        catch (error) { return; }
        var field = surfaceBoundaryDistance(source.data, width, height);
        if (!field.bounds) return;
        var metas = surfaceGlyphAnatomyMetas(glyphs, 'terminalExcess', pixelScale, L);
        var points = surfaceTerminalBranches(field, width, height, params.fontSize * pixelScale * L.s, bias);
        var grouped = Object.create(null);
        for (var pointIndex = 0; pointIndex < points.length; pointIndex++) {
          var candidate = points[pointIndex];
          var meta = surfaceNearestGlyphMeta(metas, candidate.x, candidate.y);
          if (!meta) continue;
          candidate.meta = meta;
          candidate.angle = Math.atan2(candidate.y - meta.y, candidate.x - meta.x);
          if (!grouped[meta.index]) grouped[meta.index] = [];
          grouped[meta.index].push(candidate);
        }
        var chosen = [];
        var perGlyphLimit = Math.min(4, Math.max(1, Math.round(0.45 + selection * 2.4)));
        for (var metaIndex = 0; metaIndex < metas.length; metaIndex++) {
          var candidates = grouped[metas[metaIndex].index] || [];
          candidates.sort(function (a, b) { return b.score - a.score; });
          var glyphChosen = [];
          for (var candidateIndex = 0; candidateIndex < candidates.length && glyphChosen.length < perGlyphLimit; candidateIndex++) {
            var candidate = candidates[candidateIndex];
            var clear = true;
            for (var chosenIndex = 0; chosenIndex < glyphChosen.length; chosenIndex++) {
              var angleDelta = Math.abs(Math.atan2(Math.sin(candidate.angle - glyphChosen[chosenIndex].angle),
                Math.cos(candidate.angle - glyphChosen[chosenIndex].angle)));
              var pointDistance = Math.hypot(candidate.x - glyphChosen[chosenIndex].x, candidate.y - glyphChosen[chosenIndex].y);
              if (angleDelta < 0.62 || pointDistance < Math.max(5, candidate.stemWidth * 1.15)) { clear = false; break; }
            }
            if (clear) glyphChosen.push(candidate);
          }
          for (var appendIndex = 0; appendIndex < glyphChosen.length; appendIndex++) chosen.push(glyphChosen[appendIndex]);
        }
        var work = surfaceScratch('terminal-excess-v29', width, height, false);
        work.ctx.drawImage(mask, 0, 0);
        for (var terminalIndex = 0; terminalIndex < chosen.length; terminalIndex++) {
          var terminal = chosen[terminalIndex];
          var localBase = Math.max(1.8, reach * (0.075 + mass * 0.045),
            Math.min(terminal.stemWidth * (0.4 + mass * 0.24),
              params.fontSize * pixelScale * L.s * (0.05 + mass * 0.09)));
          var localReach = reach * (0.72 + Math.min(1.4, terminal.score) * 0.2)
            * (0.88 + Math.min(1, terminal.stemWidth / Math.max(1, localBase * 2)) * 0.2);
          work.ctx.save();
          work.ctx.translate(terminal.x, terminal.y);
          work.ctx.rotate(Math.atan2(terminal.ny, terminal.nx));
          surfaceTerminalShape(work.ctx, style, localReach, localBase, trap,
            reachAggregate.strength * terminal.meta.strength);
          work.ctx.restore();
        }
        paintSurfaceMask(targetCtx, work.canvas, surfaceEffectColor('terminalExcess'), 1, 'terminal-excess-v29-color');
      }

      function renderLigatureBodyV29(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var grammar = surfaceChoice(glyphs, 'ligatureBody', 'ligatureBodyGrammar', params.ligatureBodyGrammar, BATCH_PARAM_OPTIONS.ligatureBodyGrammar);
        if (grammar === 'legacy') {
          renderLigatureBodyLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        var fusionAggregate = surfaceAggregate(glyphs, 'ligatureBody', 'ligatureBodyFusion', params.ligatureBodyFusion);
        if (!fusionAggregate.weight) return;
        var fusion = Math.max(0, fusionAggregate.value);
        var reach = Math.max(0, surfaceAggregate(glyphs, 'ligatureBody', 'ligatureBodyReach', params.ligatureBodyReach).value * pixelScale * L.s);
        var band = Math.max(1, surfaceAggregate(glyphs, 'ligatureBody', 'ligatureBodyBand', params.ligatureBodyBand).value * pixelScale * L.s
          * (0.72 + fusion * 0.2));
        var counter = Math.max(0, surfaceAggregate(glyphs, 'ligatureBody', 'ligatureBodyCounter', params.ligatureBodyCounter).value);
        var tension = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('ligatureBodyTension', surfaceAggregate(glyphs, 'ligatureBody', 'ligatureBodyTension', params.ligatureBodyTension).value, 0, -4, 4) : Math.max(-4, Math.min(4, surfaceAggregate(glyphs, 'ligatureBody', 'ligatureBodyTension', params.ligatureBodyTension).value)));
        var mask = buildSurfaceMask(glyphs, 'ligatureBody', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'ligatureBody', coverBase);
        var sourceData;
        try { sourceData = mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height).data; }
        catch (error) { return; }
        var active = [];
        for (var i = 0; i < glyphs.length; i++) {
          if (surfaceGlyphStrength(glyphs[i], 'ligatureBody') > 0.002) active.push({ glyph: glyphs[i], index: i });
        }
        active.sort(function (a, b) {
          if (a.glyph.line !== b.glyph.line) return a.glyph.line - b.glyph.line;
          if (a.glyph.word !== b.glyph.word) return a.glyph.word - b.glyph.word;
          return a.index - b.index;
        });
        if (!active.length) return;
        var work = surfaceScratch('ligature-body-v29', width, height, false);
        var ctx = work.ctx;
        ctx.drawImage(mask, 0, 0);
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        var cuts = [];
        var pairCount = 0;
        for (var pairIndex = 0; pairIndex + 1 < active.length && pairCount < 96; pairIndex++) {
          var firstEntry = active[pairIndex], secondEntry = active[pairIndex + 1];
          var first = firstEntry.glyph, second = secondEntry.glyph;
          if (first.line !== second.line || first.word !== second.word) continue;
          var registerA = pairIndex % 2 ? 0.34 : 0.66;
          var registerB = pairIndex % 2 ? 0.66 : 0.34;
          var a = surfaceGlyphNode(first, 'ligatureBody', pixelScale, L, 0, 0, 0, firstEntry.index,
            params.vertical ? registerA : 0.9, params.vertical ? 0.9 : registerA, 1);
          var b = surfaceGlyphNode(second, 'ligatureBody', pixelScale, L, 0, 0, 0, secondEntry.index,
            params.vertical ? registerB : 0.1, params.vertical ? 0.1 : registerB, 1);
          var snapRadius = Math.max(7, params.fontSize * pixelScale * L.s * 0.52);
          a = surfaceSnapToMaskPoint(sourceData, width, height, a, snapRadius);
          b = surfaceSnapToMaskPoint(sourceData, width, height, b, snapRadius);
          var dx = b.x - a.x, dy = b.y - a.y;
          var distance = Math.hypot(dx, dy);
          if (distance < 1 || reach <= 0.001 || distance > Math.max(reach, band * 1.6)) continue;
          pairCount++;
          var pairStrength = Math.min(surfaceGlyphStrength(first, 'ligatureBody'), surfaceGlyphStrength(second, 'ligatureBody'));
          var nx = -dy / distance, ny = dx / distance;
          var curve = tension * (0.46 + fusion * 0.14);
          var midX = (a.x + b.x) * 0.5, midY = (a.y + b.y) * 0.5;
          ctx.globalAlpha = pairStrength;
          if (grammar === 'sharedStem') {
            var stemLength = Math.min(params.fontSize * pixelScale * L.s * (0.72 + fusion * 0.22), Math.max(band * 2.4, distance * 1.34));
            ctx.lineWidth = band * 0.78;
            ctx.beginPath(); surfaceLigatureCurve(ctx, a, { x: midX, y: midY }, 0, curve * 0.34); ctx.stroke();
            ctx.beginPath(); surfaceLigatureCurve(ctx, { x: midX, y: midY }, b, 0, -curve * 0.34); ctx.stroke();
            ctx.save();
            ctx.translate(midX, midY);
            ctx.rotate(Math.atan2(dy, dx));
            var stemHalfW = band * 0.48;
            var stemHalfH = stemLength * 0.5;
            var stemRadius = Math.min(band * 0.42, stemLength * 0.08);
            ctx.beginPath();
            ctx.moveTo(-stemHalfW + stemRadius, -stemHalfH);
            ctx.lineTo(stemHalfW - stemRadius, -stemHalfH);
            ctx.quadraticCurveTo(stemHalfW, -stemHalfH, stemHalfW, -stemHalfH + stemRadius);
            ctx.lineTo(stemHalfW, stemHalfH - stemRadius);
            ctx.quadraticCurveTo(stemHalfW, stemHalfH, stemHalfW - stemRadius, stemHalfH);
            ctx.lineTo(-stemHalfW + stemRadius, stemHalfH);
            ctx.quadraticCurveTo(-stemHalfW, stemHalfH, -stemHalfW, stemHalfH - stemRadius);
            ctx.lineTo(-stemHalfW, -stemHalfH + stemRadius);
            ctx.quadraticCurveTo(-stemHalfW, -stemHalfH, -stemHalfW + stemRadius, -stemHalfH);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            surfaceLigatureShoulder(ctx, a, dx, dy, band, pairStrength);
            surfaceLigatureShoulder(ctx, b, -dx, -dy, band, pairStrength);
            cuts.push({ kind: 'seam', x: midX, y: midY, angle: Math.atan2(dy, dx), width: band * counter * 0.24, length: stemLength * 0.72 });
          } else if (grammar === 'counterWeave') {
            var weaveOffset = band * (0.42 + fusion * 0.06);
            ctx.lineWidth = band * 0.72;
            ctx.beginPath(); surfaceLigatureCurve(ctx, a, b, weaveOffset, curve); ctx.stroke();
            ctx.beginPath(); surfaceLigatureCurve(ctx, a, b, -weaveOffset, -curve * 0.88); ctx.stroke();
            surfaceLigatureShoulder(ctx, a, dx, dy, band * 0.72, pairStrength);
            surfaceLigatureShoulder(ctx, b, -dx, -dy, band * 0.72, pairStrength);
            cuts.push({ kind: 'curve', a: a, b: b, offset: weaveOffset, curve: curve, width: band * counter * 0.22 });
            cuts.push({ kind: 'cross', x: midX, y: midY, angle: Math.atan2(dy, dx), width: band * (0.2 + counter * 0.18), length: band * 1.45 });
          } else if (grammar === 'melt') {
            var steps = Math.max(10, Math.min(44, Math.round(12 + fusion * 7)));
            var bend = distance * curve * 0.15;
            for (var step = 0; step <= steps; step++) {
              var t = step / steps, mt = 1 - t;
              var cx = mt * mt * mt * a.x + 3 * mt * mt * t * (a.x + dx * 0.32 + nx * bend)
                + 3 * mt * t * t * (a.x + dx * 0.68 - nx * bend) + t * t * t * b.x;
              var cy = mt * mt * mt * a.y + 3 * mt * mt * t * (a.y + dy * 0.32 + ny * bend)
                + 3 * mt * t * t * (a.y + dy * 0.68 - ny * bend) + t * t * t * b.y;
              var radius = band * (0.42 + fusion * 0.08) * (0.78 + Math.sin(t * Math.PI) * 0.62);
              ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
            }
            surfaceLigatureShoulder(ctx, a, dx, dy, band * 1.02, pairStrength);
            surfaceLigatureShoulder(ctx, b, -dx, -dy, band * 1.02, pairStrength);
            cuts.push({ kind: 'curve', a: a, b: b, offset: 0, curve: curve * 0.76, width: band * counter * 0.2 });
            cuts.push({ kind: 'seam', x: midX, y: midY, angle: Math.atan2(dy, dx), width: band * counter * 0.14, length: band * 1.8 });
          } else {
            // A broad body and its inner counter form one contextual component.
            ctx.lineWidth = band * (0.9 + fusion * 0.1);
            ctx.beginPath(); surfaceLigatureCurve(ctx, a, b, 0, curve); ctx.stroke();
            ctx.lineWidth = band * 0.38;
            ctx.beginPath(); surfaceLigatureCurve(ctx, a, b, band * 0.48, -curve * 0.7); ctx.stroke();
            surfaceLigatureShoulder(ctx, a, dx, dy, band, pairStrength);
            surfaceLigatureShoulder(ctx, b, -dx, -dy, band, pairStrength);
            cuts.push({ kind: 'curve', a: a, b: b, offset: 0, curve: curve * 0.6, width: band * counter * 0.2 });
            cuts.push({ kind: 'seam', x: midX, y: midY, angle: Math.atan2(dy, dx), width: band * counter * 0.16, length: band * 1.35 });
          }
          ctx.globalAlpha = 1;
        }
        if (counter > 0.002 && cuts.length) {
          ctx.save();
          ctx.globalCompositeOperation = 'destination-out';
          ctx.lineCap = 'round';
          for (var cutIndex = 0; cutIndex < cuts.length; cutIndex++) {
            var cut = cuts[cutIndex];
            if (cut.kind === 'curve') {
              ctx.lineWidth = Math.max(0.45, cut.width);
              ctx.beginPath(); surfaceLigatureCurve(ctx, cut.a, cut.b, cut.offset, cut.curve); ctx.stroke();
            } else {
              ctx.save();
              ctx.translate(cut.x, cut.y);
              ctx.rotate(cut.angle + Math.PI / 2);
              ctx.lineWidth = Math.max(0.45, cut.width);
              ctx.beginPath(); ctx.moveTo(-cut.length * 0.5, 0); ctx.lineTo(cut.length * 0.5, 0); ctx.stroke();
              ctx.restore();
            }
          }
          ctx.restore();
        }
        paintSurfaceMask(targetCtx, work.canvas, surfaceEffectColor('ligatureBody'), 1, 'ligature-body-v29-color');
      }

      function renderLigatureCounterbodyV62(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var fusionAggregate = surfaceAggregate(glyphs, 'ligatureBody', 'ligatureBodyFusion', params.ligatureBodyFusion);
        if (!fusionAggregate.weight) return;
        var fusion = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('ligatureBodyFusion', fusionAggregate.value, 0, 0, 4) : Math.max(0, Math.min(4, fusionAggregate.value)));
        var reach = Math.max(0, surfaceAggregate(glyphs, 'ligatureBody', 'ligatureBodyReach', params.ligatureBodyReach).value * pixelScale * L.s);
        var requestedBand = Math.max(1, surfaceAggregate(glyphs, 'ligatureBody', 'ligatureBodyBand', params.ligatureBodyBand).value * pixelScale * L.s);
        var counter = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('ligatureBodyCounter', surfaceAggregate(glyphs, 'ligatureBody', 'ligatureBodyCounter', params.ligatureBodyCounter).value, 0, 0, 1.5) : Math.max(0, Math.min(1.5, surfaceAggregate(glyphs, 'ligatureBody', 'ligatureBodyCounter', params.ligatureBodyCounter).value)));
        var tension = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('ligatureBodyTension', surfaceAggregate(glyphs, 'ligatureBody', 'ligatureBodyTension', params.ligatureBodyTension).value, 0, -4, 4) : Math.max(-4, Math.min(4, surfaceAggregate(glyphs, 'ligatureBody', 'ligatureBodyTension', params.ligatureBodyTension).value)));
        var mask = buildSurfaceMask(glyphs, 'ligatureBody', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'ligatureBody', coverBase);
        var sourceData;
        try { sourceData = mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height).data; }
        catch (error) { return; }
        var active = [];
        for (var glyphIndex = 0; glyphIndex < glyphs.length; glyphIndex++) {
          if (surfaceGlyphStrength(glyphs[glyphIndex], 'ligatureBody') > 0.002) active.push({ glyph: glyphs[glyphIndex], index: glyphIndex });
        }
        active.sort(function (a, b) {
          if (a.glyph.line !== b.glyph.line) return a.glyph.line - b.glyph.line;
          if (a.glyph.word !== b.glyph.word) return a.glyph.word - b.glyph.word;
          return a.index - b.index;
        });
        if (!active.length) return;
        var work = surfaceScratch('ligature-body-counterbody-v62', width, height, false);
        var ctx = work.ctx;
        ctx.drawImage(mask, 0, 0);
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#fff';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        var cuts = [];
        var groups = [];
        for (var activeIndex = 0; activeIndex < active.length; activeIndex++) {
          var item = active[activeIndex];
          var line = item.glyph.line == null ? 0 : item.glyph.line;
          var word = item.glyph.word == null ? 0 : item.glyph.word;
          var key = line + ':' + word;
          var group = groups.length && groups[groups.length - 1].key === key ? groups[groups.length - 1] : null;
          if (!group) { group = { key: key, items: [] }; groups.push(group); }
          group.items.push(item);
        }
        var pairBudget = 96;
        for (var groupIndex = 0; groupIndex < groups.length && pairBudget > 0; groupIndex++) {
          var items = groups[groupIndex].items;
          if (items.length < 2) continue;
          var wordChannel = [];
          var wordChannelWidth = Infinity;
          var wordStrength = 1;
          for (var pairIndex = 0; pairIndex + 1 < items.length && pairBudget > 0; pairIndex++) {
            var firstEntry = items[pairIndex], secondEntry = items[pairIndex + 1];
            var first = firstEntry.glyph, second = secondEntry.glyph;
            var firstSpan = Math.abs((params.vertical ? (first.bw || first.w) * (first.scaleX || 1)
              : (first.bh || first.h) * (first.scaleY || 1)) * pixelScale * L.s);
            var secondSpan = Math.abs((params.vertical ? (second.bw || second.w) * (second.scaleX || 1)
              : (second.bh || second.h) * (second.scaleY || 1)) * pixelScale * L.s);
            var glyphSpan = Math.max(8, Math.min(firstSpan || params.fontSize * pixelScale * L.s,
              secondSpan || params.fontSize * pixelScale * L.s));
            var bodyBand = Math.max(1.5, Math.min(requestedBand * (0.88 + fusion * 0.2), glyphSpan * (0.11 + fusion * 0.055)));
            var snapRadius = Math.max(7, glyphSpan * 0.58);
            var registerNoise = (hash(firstEntry.index, secondEntry.index, params.seed + 6201) - 0.5) * 0.07;
            var wordPhase = hash(groupIndex, params.seed % 211, 6211) * Math.PI * 2;
            var cadence = Math.sin((pairIndex + 0.5) / Math.max(1, items.length - 1) * Math.PI * 2 + wordPhase);
            var registerShift = cadence * (0.1 + fusion * 0.018) + registerNoise;
            var upper = Math.max(0.12, Math.min(0.4, 0.27 + registerShift - tension * 0.01));
            var lower = Math.min(0.88, Math.max(0.6, 0.73 + registerShift + tension * 0.01));
            var aUpper = surfaceLigatureAnchorV62(first, firstEntry.index, 'ligatureBody', pixelScale, L,
              sourceData, width, height, false, upper, snapRadius);
            var aLower = surfaceLigatureAnchorV62(first, firstEntry.index, 'ligatureBody', pixelScale, L,
              sourceData, width, height, false, lower, snapRadius);
            var bUpper = surfaceLigatureAnchorV62(second, secondEntry.index, 'ligatureBody', pixelScale, L,
              sourceData, width, height, true, upper, snapRadius);
            var bLower = surfaceLigatureAnchorV62(second, secondEntry.index, 'ligatureBody', pixelScale, L,
              sourceData, width, height, true, lower, snapRadius);
            var aCenter = { x: (aUpper.x + aLower.x) * 0.5, y: (aUpper.y + aLower.y) * 0.5 };
            var bCenter = { x: (bUpper.x + bLower.x) * 0.5, y: (bUpper.y + bLower.y) * 0.5 };
            var readingDx = bCenter.x - aCenter.x, readingDy = bCenter.y - aCenter.y;
            var gapDistance = Math.hypot(readingDx, readingDy);
            if (gapDistance < 0.75 || reach <= 0.001 || gapDistance > Math.max(reach, bodyBand * 2.2)) continue;
            pairBudget--;
            var pairStrength = Math.min(surfaceGlyphStrength(first, 'ligatureBody'), surfaceGlyphStrength(second, 'ligatureBody'));
            wordStrength = Math.min(wordStrength, pairStrength);
            ctx.globalAlpha = pairStrength;
            var phase = hash(firstEntry.index + groupIndex * 17, secondEntry.index, params.seed + 6229) > 0.5 ? 1 : -1;
            var crossing = ((pairIndex + groupIndex) & 1) ? -phase : phase;
            var bend = Math.min(glyphSpan * 0.34, gapDistance * (0.16 + Math.abs(tension) * 0.08))
              * (tension < 0 ? -crossing : crossing);
            var outerWidth = bodyBand * (0.82 + fusion * 0.075);
            var innerWidth = bodyBand * (0.58 + fusion * 0.05);
            if (crossing > 0) {
              surfaceLigatureRibbonV62(ctx, aUpper, bLower, outerWidth, innerWidth, bend, bodyBand * 0.06);
              surfaceLigatureRibbonV62(ctx, aLower, bUpper, innerWidth, outerWidth, -bend * 0.88, -bodyBand * 0.06);
            } else {
              surfaceLigatureRibbonV62(ctx, aUpper, bUpper, outerWidth, innerWidth, bend, bodyBand * 0.08);
              surfaceLigatureRibbonV62(ctx, aLower, bLower, innerWidth, outerWidth, -bend * 0.88, -bodyBand * 0.08);
            }
            var midX = (aCenter.x + bCenter.x) * 0.5;
            var midY = (aCenter.y + bCenter.y) * 0.5;
            var readingAngle = Math.atan2(readingDy, readingDx);
            var transverseSpan = Math.max(bodyBand * 2.8, Math.min(glyphSpan * (0.44 + fusion * 0.055),
              bodyBand * (4.8 + fusion * 0.6))) * (0.88 + hash(pairIndex, groupIndex, params.seed + 6257) * 0.22);
            surfaceLigatureWaistV62(ctx, midX, midY, readingAngle, transverseSpan, bodyBand * 0.54, tension);
            surfaceLigatureShoulder(ctx, aUpper, bCenter.x - aUpper.x, bCenter.y - aUpper.y, bodyBand * 0.62, pairStrength);
            surfaceLigatureShoulder(ctx, aLower, bCenter.x - aLower.x, bCenter.y - aLower.y, bodyBand * 0.62, pairStrength);
            surfaceLigatureShoulder(ctx, bUpper, aCenter.x - bUpper.x, aCenter.y - bUpper.y, bodyBand * 0.62, pairStrength);
            surfaceLigatureShoulder(ctx, bLower, aCenter.x - bLower.x, aCenter.y - bLower.y, bodyBand * 0.62, pairStrength);
            cuts.push({ kind: 'lens', x: midX, y: midY, angle: readingAngle + Math.PI / 2,
              length: transverseSpan * (0.45 + counter * 0.28), width: bodyBand * (0.3 + counter * 0.42), alpha: pairStrength });
            cuts.push({ kind: 'caret', x: midX, y: midY, angle: readingAngle + Math.PI / 2,
              length: transverseSpan * 0.94, width: bodyBand * counter * 0.1, eye: transverseSpan * (0.18 + counter * 0.1), alpha: pairStrength });
            if (!wordChannel.length) wordChannel.push(aCenter);
            wordChannel.push({ x: midX, y: midY });
            if (pairIndex === items.length - 2) wordChannel.push(bCenter);
            wordChannelWidth = Math.min(wordChannelWidth, bodyBand * (0.1 + counter * 0.26));
          }
          if (counter > 0.002 && wordChannel.length > 2 && isFinite(wordChannelWidth)) {
            cuts.push({ kind: 'channel', nodes: wordChannel, width: wordChannelWidth,
              tension: tension * 0.16, alpha: wordStrength });
          }
        }
        ctx.globalAlpha = 1;
        if (counter > 0.002 && cuts.length) {
          ctx.save();
          ctx.globalCompositeOperation = 'destination-out';
          ctx.fillStyle = '#000';
          ctx.strokeStyle = '#000';
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          for (var cutIndex = 0; cutIndex < cuts.length; cutIndex++) {
            var cut = cuts[cutIndex];
            ctx.globalAlpha = cut.alpha;
            if (cut.kind === 'lens') {
              surfaceLigatureLensV62(ctx, cut.x, cut.y, cut.angle, cut.length, cut.width);
            } else if (cut.kind === 'caret') {
              ctx.save();
              ctx.translate(cut.x, cut.y);
              ctx.rotate(cut.angle);
              ctx.lineWidth = Math.max(0.45, cut.width);
              ctx.beginPath();
              ctx.moveTo(-cut.length * 0.5, 0);
              ctx.lineTo(-cut.eye * 0.5, 0);
              ctx.moveTo(cut.eye * 0.5, 0);
              ctx.lineTo(cut.length * 0.5, 0);
              ctx.stroke();
              ctx.restore();
            } else if (cut.kind === 'channel') {
              ctx.lineWidth = Math.max(0.45, cut.width);
              for (var channelIndex = 0; channelIndex + 1 < cut.nodes.length; channelIndex++) {
                ctx.beginPath();
                surfaceLigatureCurve(ctx, cut.nodes[channelIndex], cut.nodes[channelIndex + 1], 0,
                  cut.tension * (channelIndex & 1 ? -1 : 1));
                ctx.stroke();
              }
            }
          }
          ctx.restore();
        }
        paintSurfaceMask(targetCtx, work.canvas, surfaceEffectColor('ligatureBody'), 1, 'ligature-body-counterbody-v62-color');
      }

      function renderLigatureBody(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var grammar = surfaceChoice(glyphs, 'ligatureBody', 'ligatureBodyGrammar', params.ligatureBodyGrammar, BATCH_PARAM_OPTIONS.ligatureBodyGrammar);
        if (grammar === 'counterbody') {
          renderLigatureCounterbodyV62(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        renderLigatureBodyV29(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
      }

      function renderEtchantBloomLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var patternAggregate = surfaceAggregate(glyphs, 'etchantBloom', 'etchantPattern', params.etchantPattern);
        if (!patternAggregate.weight) return;
        var pattern = Math.max(0, Math.min(1, patternAggregate.value));
        var reactionScale = Math.max(2, surfaceAggregate(glyphs, 'etchantBloom', 'etchantCell', params.etchantCell).value * pixelScale * L.s);
        var growth = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('etchantGrowth', Math.round(surfaceAggregate(glyphs, 'etchantBloom', 'etchantGrowth', params.etchantGrowth).value), 0, 8, 192) : Math.max(8, Math.min(192, Math.round(surfaceAggregate(glyphs, 'etchantBloom', 'etchantGrowth', params.etchantGrowth).value))));
        var polarity = Math.max(-1, Math.min(1, surfaceAggregate(glyphs, 'etchantBloom', 'etchantPolarity', params.etchantPolarity).value));
        var spill = Math.max(0, surfaceAggregate(glyphs, 'etchantBloom', 'etchantSpill', params.etchantSpill).value * pixelScale * L.s);
        var mask = buildSurfaceMask(glyphs, 'etchantBloom', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'etchantBloom', coverBase);
        var maskCtx = mask.getContext('2d', { willReadFrequently: true });
        var source;
        try { source = maskCtx.getImageData(0, 0, width, height); }
        catch (error) { return; }
        var field = surfaceBoundaryDistance(source.data, width, height);
        if (!field.bounds) return;

        var pad = spill + reactionScale * 2.5;
        var regionX = Math.max(0, Math.floor(field.bounds[0] - pad));
        var regionY = Math.max(0, Math.floor(field.bounds[1] - pad));
        var regionRight = Math.min(width, Math.ceil(field.bounds[2] + pad + 1));
        var regionBottom = Math.min(height, Math.ceil(field.bounds[3] + pad + 1));
        var regionWidth = Math.max(1, regionRight - regionX);
        var regionHeight = Math.max(1, regionBottom - regionY);
        var sampleStep = Math.max(1, reactionScale / 3.6);
        var gridWidth = Math.max(8, Math.ceil(regionWidth / sampleStep));
        var gridHeight = Math.max(8, Math.ceil(regionHeight / sampleStep));
        var gridLimit = 144;
        if (Math.max(gridWidth, gridHeight) > gridLimit) {
          sampleStep *= Math.max(gridWidth, gridHeight) / gridLimit;
          gridWidth = Math.max(8, Math.ceil(regionWidth / sampleStep));
          gridHeight = Math.max(8, Math.ceil(regionHeight / sampleStep));
        }
        var count = gridWidth * gridHeight;
        var chemicalA = new Float32Array(count);
        var chemicalB = new Float32Array(count);
        var nextA = new Float32Array(count);
        var nextB = new Float32Array(count);
        var permitted = new Float32Array(count);
        var sampleX = new Int32Array(gridWidth);
        var sampleY = new Int32Array(gridHeight);
        var x, y, index;
        for (x = 0; x < gridWidth; x++) sampleX[x] = Math.max(0, Math.min(width - 1, Math.round(regionX + (x + 0.5) * regionWidth / gridWidth)));
        for (y = 0; y < gridHeight; y++) sampleY[y] = Math.max(0, Math.min(height - 1, Math.round(regionY + (y + 0.5) * regionHeight / gridHeight)));
        var spillBand = Math.max(1, spill + reactionScale * 0.8);
        for (y = 0; y < gridHeight; y++) for (x = 0; x < gridWidth; x++) {
          index = y * gridWidth + x;
          var sourceIndex = sampleY[y] * width + sampleX[x];
          var inside = !!field.inside[sourceIndex];
          var distance = field.distance[sourceIndex];
          var nutrient = inside ? 1 : (spill > 0 ? Math.max(0, 1 - distance / spillBand) : 0);
          permitted[index] = nutrient;
          chemicalA[index] = 1;
          if (nutrient <= 0.001) continue;
          var sourceAlpha = source.data[sourceIndex * 4 + 3] / 255;
          var seedNoise = hash(x * 11 + y * 3, y * 17 + x * 5, params.seed + 1901);
          var boundarySeed = Math.exp(-distance / Math.max(1, reactionScale * 0.62));
          var islands = seedNoise > 0.86 - pattern * 0.08 ? 0.38 + seedNoise * 0.46 : 0;
          var seeded = Math.min(1, sourceAlpha * (0.06 + seedNoise * 0.18) + boundarySeed * 0.2 + islands * nutrient);
          chemicalB[index] = seeded;
          chemicalA[index] = 1 - seeded * 0.48;
        }

        var feed, kill;
        if (pattern < 0.5) {
          var firstMix = pattern * 2;
          feed = 0.0367 + (0.055 - 0.0367) * firstMix;
          kill = 0.0649 + (0.062 - 0.0649) * firstMix;
        } else {
          var secondMix = (pattern - 0.5) * 2;
          feed = 0.055 + (0.063 - 0.055) * secondMix;
          kill = 0.062 + (0.0602 - 0.062) * secondMix;
        }
        for (var iteration = 0; iteration < growth; iteration++) {
          nextA.set(chemicalA);
          nextB.set(chemicalB);
          for (y = 1; y < gridHeight - 1; y++) for (x = 1; x < gridWidth - 1; x++) {
            index = y * gridWidth + x;
            var nutrientAtCell = permitted[index];
            if (nutrientAtCell <= 0.001) { nextA[index] = 1; nextB[index] = 0; continue; }
            var left = index - 1, right = index + 1, top = index - gridWidth, bottom = index + gridWidth;
            var topLeft = top - 1, topRight = top + 1, bottomLeft = bottom - 1, bottomRight = bottom + 1;
            var a = chemicalA[index], b = chemicalB[index];
            var lapA = -a + (chemicalA[left] + chemicalA[right] + chemicalA[top] + chemicalA[bottom]) * 0.2
              + (chemicalA[topLeft] + chemicalA[topRight] + chemicalA[bottomLeft] + chemicalA[bottomRight]) * 0.05;
            var lapB = -b + (chemicalB[left] + chemicalB[right] + chemicalB[top] + chemicalB[bottom]) * 0.2
              + (chemicalB[topLeft] + chemicalB[topRight] + chemicalB[bottomLeft] + chemicalB[bottomRight]) * 0.05;
            var reaction = a * b * b;
            var localNoise = hash(x, y, params.seed + 1913) - 0.5;
            var localFeed = feed * (0.92 + nutrientAtCell * 0.12) + localNoise * 0.0012;
            var localKill = kill + (0.5 - nutrientAtCell) * 0.0014;
            nextA[index] = Math.max(0, Math.min(1, a + (lapA - reaction + localFeed * (1 - a))));
            nextB[index] = Math.max(0, Math.min(1, b + (0.5 * lapB + reaction - (localKill + localFeed) * b)));
          }
          var swapA = chemicalA; chemicalA = nextA; nextA = swapA;
          var swapB = chemicalB; chemicalB = nextB; nextB = swapB;
        }

        var grid = surfaceScratch('etchant-bloom-grid', gridWidth, gridHeight, true);
        var image = grid.ctx.createImageData(gridWidth, gridHeight);
        var polarityMix = (polarity + 1) * 0.5;
        function smoothBand(value, low, high) {
          var t = Math.max(0, Math.min(1, (value - low) / Math.max(0.0001, high - low)));
          return t * t * (3 - 2 * t);
        }
        for (index = 0; index < count; index++) {
          var gridX = index % gridWidth;
          var gridY = Math.floor(index / gridWidth);
          var chemicalRaw = chemicalB[index];
          var chemical = Math.max(0, Math.min(1, chemicalRaw * 2.75));
          var neighborLeft = chemicalB[gridX > 0 ? index - 1 : index];
          var neighborRight = chemicalB[gridX + 1 < gridWidth ? index + 1 : index];
          var neighborTop = chemicalB[gridY > 0 ? index - gridWidth : index];
          var neighborBottom = chemicalB[gridY + 1 < gridHeight ? index + gridWidth : index];
          var gradient = Math.max(
            Math.abs(chemicalRaw - neighborLeft),
            Math.abs(chemicalRaw - neighborRight),
            Math.abs(chemicalRaw - neighborTop),
            Math.abs(chemicalRaw - neighborBottom)
          );
          var laplacianRidge = Math.abs(chemicalRaw * 4 - neighborLeft - neighborRight - neighborTop - neighborBottom);
          var membrane = smoothBand(gradient * 18 + laplacianRidge * 7, 0.035, 0.42);
          var bloomThreshold = 0.1 + pattern * 0.085;
          var bloom = smoothBand(chemical, bloomThreshold, bloomThreshold + 0.075);
          var etchBand = smoothBand(chemical, bloomThreshold * 0.42, bloomThreshold * 0.9)
            * (1 - smoothBand(chemical, bloomThreshold * 1.18, bloomThreshold * 1.78));
          var poreNoise = hash(gridX * 5 + gridY * 13, gridY * 7 + gridX * 3, params.seed + 1931);
          var porousBody = bloom * (0.56 + poreNoise * 0.44);
          bloom = Math.max(porousBody, membrane * (0.72 + pattern * 0.24));
          var etched = Math.max(etchBand * (0.68 + poreNoise * 0.32), membrane);
          var coverage = (etched * (1 - polarityMix) + bloom * polarityMix) * permitted[index];
          coverage *= 0.38 + patternAggregate.strength * 0.62;
          var alpha = Math.max(0, Math.min(255, Math.round(coverage * 255)));
          image.data[index * 4] = 255;
          image.data[index * 4 + 1] = 255;
          image.data[index * 4 + 2] = 255;
          image.data[index * 4 + 3] = alpha;
        }

        // Destination material shading; the analysis grid and topology stay fixed.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext,discard=new Float64Array(4);RC.field(image,function(px,py,rgba){var x=px-.5,y=py-.5,outputX=x,outputY=y;var index=Math.floor(y)*(gridWidth)+Math.floor(x);
          var gridX = x;
          var gridY = y;
          var chemicalRaw = RC.sample(chemicalB,gridWidth,gridHeight,x,y);
          var chemical = Math.max(0, Math.min(1, chemicalRaw * 2.75));
          var neighborLeft = chemicalB[gridX > 0 ? index - 1 : index];
          var neighborRight = chemicalB[gridX + 1 < gridWidth ? index + 1 : index];
          var neighborTop = chemicalB[gridY > 0 ? index - gridWidth : index];
          var neighborBottom = chemicalB[gridY + 1 < gridHeight ? index + gridWidth : index];
          var gradient = Math.max(
            Math.abs(chemicalRaw - neighborLeft),
            Math.abs(chemicalRaw - neighborRight),
            Math.abs(chemicalRaw - neighborTop),
            Math.abs(chemicalRaw - neighborBottom)
          );
          var laplacianRidge = Math.abs(chemicalRaw * 4 - neighborLeft - neighborRight - neighborTop - neighborBottom);
          var membrane = smoothBand(gradient * 18 + laplacianRidge * 7, 0.035, 0.42);
          var bloomThreshold = 0.1 + pattern * 0.085;
          var bloom = smoothBand(chemical, bloomThreshold, bloomThreshold + 0.075);
          var etchBand = smoothBand(chemical, bloomThreshold * 0.42, bloomThreshold * 0.9)
            * (1 - smoothBand(chemical, bloomThreshold * 1.18, bloomThreshold * 1.78));
          var poreNoise = hash(gridX * 5 + gridY * 13, gridY * 7 + gridX * 3, params.seed + 1931);
          var porousBody = bloom * (0.56 + poreNoise * 0.44);
          bloom = Math.max(porousBody, membrane * (0.72 + pattern * 0.24));
          var etched = Math.max(etchBand * (0.68 + poreNoise * 0.32), membrane);
          var coverage = (etched * (1 - polarityMix) + bloom * polarityMix) * RC.sample(permitted,gridWidth,gridHeight,x,y);
          coverage *= 0.38 + patternAggregate.strength * 0.62;
          var alpha = Math.max(0, Math.min(255, Math.round(coverage * 255)));
          rgba[0] = 255;
          rgba[1] = 255;
          rgba[2] = 255;
          rgba[3] = alpha;

        });}
        grid.ctx.putImageData(image, 0, 0);
        var expanded = surfaceScratch('etchant-bloom-expanded', width, height, false);
        expanded.ctx.imageSmoothingEnabled = true;
        expanded.ctx.imageSmoothingQuality = 'high';
        expanded.ctx.drawImage(grid.canvas, regionX, regionY, regionWidth, regionHeight);
        paintSurfaceMask(targetCtx, expanded.canvas, surfaceEffectColor('etchantBloom'), 1, 'etchant-bloom-color');
      }

      function renderEtchantBloom(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var regime = surfaceChoice(glyphs, 'etchantBloom', 'etchantRegime', params.etchantRegime,
          BATCH_PARAM_OPTIONS.etchantRegime);
        if (regime === 'legacy') {
          renderEtchantBloomLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        var patternAggregate = surfaceAggregate(glyphs, 'etchantBloom', 'etchantPattern', params.etchantPattern);
        if (!patternAggregate.weight) return;
        var pattern = Math.max(0, Math.min(1, patternAggregate.value));
        var reactionScale = Math.max(2,
          surfaceAggregate(glyphs, 'etchantBloom', 'etchantCell', params.etchantCell).value * pixelScale * L.s);
        var growth = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('etchantGrowth', Math.round(
          surfaceAggregate(glyphs, 'etchantBloom', 'etchantGrowth', params.etchantGrowth).value), 0, 8, 192) : Math.max(8, Math.min(192, Math.round(
          surfaceAggregate(glyphs, 'etchantBloom', 'etchantGrowth', params.etchantGrowth).value))));
        var polarity = Math.max(-1, Math.min(1,
          surfaceAggregate(glyphs, 'etchantBloom', 'etchantPolarity', params.etchantPolarity).value));
        var spill = Math.max(0,
          surfaceAggregate(glyphs, 'etchantBloom', 'etchantSpill', params.etchantSpill).value * pixelScale * L.s);
        var mask = buildSurfaceMask(glyphs, 'etchantBloom', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'etchantBloom', coverBase);
        var maskCtx = mask.getContext('2d', { willReadFrequently: true });
        var source;
        try { source = maskCtx.getImageData(0, 0, width, height); }
        catch (error) { return; }
        var field = surfaceBoundaryDistance(source.data, width, height);
        if (!field.bounds) return;

        var pad = spill + reactionScale * 3.2;
        var regionX = Math.max(0, Math.floor(field.bounds[0] - pad));
        var regionY = Math.max(0, Math.floor(field.bounds[1] - pad));
        var regionRight = Math.min(width, Math.ceil(field.bounds[2] + pad + 1));
        var regionBottom = Math.min(height, Math.ceil(field.bounds[3] + pad + 1));
        var regionWidth = Math.max(1, regionRight - regionX);
        var regionHeight = Math.max(1, regionBottom - regionY);
        var sampleStep = Math.max(1, reactionScale / (regime === 'crystal' ? 3.8 : 3.1));
        var gridWidth = Math.max(10, Math.ceil(regionWidth / sampleStep));
        var gridHeight = Math.max(10, Math.ceil(regionHeight / sampleStep));
        var gridLimit = 156;
        if (Math.max(gridWidth, gridHeight) > gridLimit) {
          sampleStep *= Math.max(gridWidth, gridHeight) / gridLimit;
          gridWidth = Math.max(10, Math.ceil(regionWidth / sampleStep));
          gridHeight = Math.max(10, Math.ceil(regionHeight / sampleStep));
        }
        var count = gridWidth * gridHeight;
        var chemicalA = new Float32Array(count);
        var chemicalB = new Float32Array(count);
        var nextA = new Float32Array(count);
        var nextB = new Float32Array(count);
        var permitted = new Float32Array(count);
        var sampleX = new Int32Array(gridWidth);
        var sampleY = new Int32Array(gridHeight);
        var phase = compositionState.enabled
          ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var x, y, index;
        for (x = 0; x < gridWidth; x++) {
          sampleX[x] = Math.max(0, Math.min(width - 1,
            Math.round(regionX + (x + 0.5) * regionWidth / gridWidth)));
        }
        for (y = 0; y < gridHeight; y++) {
          sampleY[y] = Math.max(0, Math.min(height - 1,
            Math.round(regionY + (y + 0.5) * regionHeight / gridHeight)));
        }
        var spillBand = Math.max(1, spill + reactionScale * 0.72);
        for (y = 0; y < gridHeight; y++) for (x = 0; x < gridWidth; x++) {
          index = y * gridWidth + x;
          var sourceIndex = sampleY[y] * width + sampleX[x];
          var inside = !!field.inside[sourceIndex];
          var distance = field.distance[sourceIndex];
          var nutrient = inside ? 1 : (spill > 0 ? Math.max(0, 1 - distance / spillBand) : 0);
          permitted[index] = nutrient;
          chemicalA[index] = 1;
          if (nutrient <= 0.001) continue;
          var nx = gridWidth > 1 ? x / (gridWidth - 1) : 0;
          var ny = gridHeight > 1 ? y / (gridHeight - 1) : 0;
          var coarseX = Math.floor(x / Math.max(2, 7 - Math.round(pattern * 3)));
          var coarseY = Math.floor(y / Math.max(2, 7 - Math.round(pattern * 3)));
          var cellNoise = hash(coarseX, coarseY, params.seed + 1949);
          var fineNoise = hash(x * 7 + y * 3, y * 11 + x * 5, params.seed + 1951);
          var boundarySeed = Math.exp(-distance / Math.max(1, reactionScale * 0.5));
          var seedSignal = 0;
          if (regime === 'labyrinth') {
            var waveA = Math.sin((nx * (5 + pattern * 8) + ny * (3 - pattern * 2)) * Math.PI
              + cellNoise * 4.2 + phase * 0.18);
            var waveB = Math.sin((ny * (7 + pattern * 7) - nx * (2 + pattern * 4)) * Math.PI
              + fineNoise * 3.7 - phase * 0.11);
            var interference = Math.abs(waveA + waveB * 0.68);
            if (interference < 0.16 + pattern * 0.08 && cellNoise > 0.16) {
              seedSignal = 0.68 + (1 - interference) * 0.2;
            }
            if (boundarySeed > 0.54 && fineNoise > 0.38) seedSignal = Math.max(seedSignal, 0.54 + fineNoise * 0.2);
          } else if (regime === 'mitosis') {
            var spotCell = Math.max(4, Math.round(13 - pattern * 7));
            var localX = (x % spotCell) / spotCell - 0.5;
            var localY = (y % spotCell) / spotCell - 0.5;
            var spotRadius = Math.sqrt(localX * localX + localY * localY);
            if (cellNoise > 0.36 && spotRadius < 0.13 + pattern * 0.12) seedSignal = 0.82;
            if (boundarySeed > 0.68 && fineNoise > 0.62) seedSignal = Math.max(seedSignal, 0.58);
          } else if (regime === 'coral') {
            var invasion = nx * (0.72 + pattern * 0.24) + ny * 0.28
              + (cellNoise - 0.5) * (0.32 + pattern * 0.18);
            var front = 0.27 + Math.sin(phase * 0.12 + params.seed * 0.07) * 0.04;
            if (Math.abs(invasion - front) < 0.07 + pattern * 0.045 ||
                (boundarySeed > 0.48 && fineNoise > 0.72)) seedSignal = 0.66 + fineNoise * 0.26;
          } else {
            var crystalAngle = (nx - 0.5) * (8 + pattern * 15) + (ny - 0.5) * (6 - pattern * 3);
            var facet = Math.abs(Math.sin(crystalAngle * Math.PI + cellNoise * 1.7));
            var chevron = Math.abs(Math.sin(((nx - 0.5) - Math.abs(ny - 0.5) * 0.72)
              * Math.PI * (7 + pattern * 10)));
            if (facet < 0.12 + pattern * 0.08 || chevron < 0.1 + pattern * 0.07) seedSignal = 0.76;
            if (boundarySeed > 0.62) seedSignal = Math.max(seedSignal, 0.42);
          }
          chemicalB[index] = Math.min(1, seedSignal * nutrient);
          chemicalA[index] = 1 - chemicalB[index] * 0.52;
        }

        var feed = 0.0367, kill = 0.0649, diffusionB = 0.5;
        if (regime === 'labyrinth') {
          feed = 0.029 + pattern * 0.018;
          kill = 0.057 + pattern * 0.006;
          diffusionB = 0.47;
        } else if (regime === 'mitosis') {
          feed = 0.035 + pattern * 0.008;
          kill = 0.0635 + pattern * 0.0022;
          diffusionB = 0.49;
        } else if (regime === 'coral') {
          feed = 0.051 + pattern * 0.01;
          kill = 0.061 + pattern * 0.002;
          diffusionB = 0.43;
        } else {
          feed = 0.044 + pattern * 0.012;
          kill = 0.0585 + pattern * 0.003;
          diffusionB = 0.38;
        }
        for (var iteration = 0; iteration < growth; iteration++) {
          nextA.set(chemicalA);
          nextB.set(chemicalB);
          for (y = 1; y < gridHeight - 1; y++) for (x = 1; x < gridWidth - 1; x++) {
            index = y * gridWidth + x;
            var nutrientAtCell = permitted[index];
            if (nutrientAtCell <= 0.001) { nextA[index] = 1; nextB[index] = 0; continue; }
            var left = index - 1, right = index + 1, top = index - gridWidth, bottom = index + gridWidth;
            var topLeft = top - 1, topRight = top + 1, bottomLeft = bottom - 1, bottomRight = bottom + 1;
            var a = chemicalA[index], b = chemicalB[index];
            var lapA = -a + (chemicalA[left] + chemicalA[right] + chemicalA[top] + chemicalA[bottom]) * 0.2
              + (chemicalA[topLeft] + chemicalA[topRight] + chemicalA[bottomLeft] + chemicalA[bottomRight]) * 0.05;
            var lapB = -b + (chemicalB[left] + chemicalB[right] + chemicalB[top] + chemicalB[bottom]) * 0.2
              + (chemicalB[topLeft] + chemicalB[topRight] + chemicalB[bottomLeft] + chemicalB[bottomRight]) * 0.05;
            if (regime === 'crystal') {
              lapB += (chemicalB[left] + chemicalB[right] - chemicalB[top] - chemicalB[bottom])
                * (0.045 + pattern * 0.035);
            }
            var reaction = a * b * b;
            var localNoise = (hash(x, y, params.seed + 1961) - 0.5) * 0.0014;
            var localFeed = feed * (0.91 + nutrientAtCell * 0.13) + localNoise;
            var localKill = kill + (0.55 - nutrientAtCell) * 0.0016;
            nextA[index] = Math.max(0, Math.min(1, a + lapA - reaction + localFeed * (1 - a)));
            nextB[index] = Math.max(0, Math.min(1,
              b + diffusionB * lapB + reaction - (localKill + localFeed) * b));
          }
          var swapA = chemicalA; chemicalA = nextA; nextA = swapA;
          var swapB = chemicalB; chemicalB = nextB; nextB = swapB;
        }

        var grid = surfaceScratch('etchant-regime-grid', gridWidth, gridHeight, true);
        var image = grid.ctx.createImageData(gridWidth, gridHeight);
        var contourValues = new Float32Array(count);
        var polarityMix = (polarity + 1) * 0.5;
        function smoothBand(value, low, high) {
          var t = Math.max(0, Math.min(1, (value - low) / Math.max(0.0001, high - low)));
          return t * t * (3 - 2 * t);
        }
        function ridgeBand(value, center, halfWidth) {
          var distanceFromCenter = Math.abs(value - center);
          return 1 - smoothBand(distanceFromCenter, halfWidth * 0.28, halfWidth);
        }
        for (index = 0; index < count; index++) {
          var gridX = index % gridWidth;
          var gridY = Math.floor(index / gridWidth);
          var raw = chemicalB[index];
          contourValues[index] = raw;
          var neighborLeft = chemicalB[gridX > 0 ? index - 1 : index];
          var neighborRight = chemicalB[gridX + 1 < gridWidth ? index + 1 : index];
          var neighborTop = chemicalB[gridY > 0 ? index - gridWidth : index];
          var neighborBottom = chemicalB[gridY + 1 < gridHeight ? index + gridWidth : index];
          var gradient = Math.max(Math.abs(raw - neighborLeft), Math.abs(raw - neighborRight),
            Math.abs(raw - neighborTop), Math.abs(raw - neighborBottom));
          var pore = hash(gridX * 5 + gridY * 13, gridY * 7 + gridX * 3, params.seed + 1973);
          var body = 0, incision = 0;
          if (regime === 'labyrinth') {
            body = Math.max(ridgeBand(raw, 0.115, 0.031),
              ridgeBand(raw, 0.205, 0.034) * 0.78) * (0.76 + pore * 0.24);
            incision = Math.max(ridgeBand(gradient, 0.035, 0.022),
              ridgeBand(raw, 0.295, 0.048) * 0.58) * (1 - smoothBand(raw, 0.66, 0.9));
          } else if (regime === 'mitosis') {
            body = Math.max(ridgeBand(raw, 0.16, 0.043),
              ridgeBand(raw, 0.35, 0.055) * 0.72) * (0.72 + pore * 0.28);
            incision = Math.max(ridgeBand(gradient, 0.052, 0.031),
              ridgeBand(raw, 0.49, 0.055) * 0.64) * (1 - smoothBand(raw, 0.76, 0.94));
          } else if (regime === 'coral') {
            body = Math.max(ridgeBand(raw, 0.09, 0.028),
              ridgeBand(raw, 0.21, 0.046) * 0.76) * (0.58 + pore * 0.42);
            incision = Math.max(ridgeBand(gradient, 0.032, 0.023),
              ridgeBand(raw, 0.39, 0.068) * 0.72) * (1 - smoothBand(raw, 0.79, 0.96));
          } else {
            var facetSignal = 0.5 + 0.5 * Math.sin((gridX - gridY * 0.72) * (0.72 + pattern * 0.55));
            body = Math.max(ridgeBand(raw, 0.12, 0.036),
              ridgeBand(raw, 0.29, 0.05) * 0.68) * (0.38 + facetSignal * 0.62);
            incision = Math.max(ridgeBand(gradient, 0.041, 0.026),
              ridgeBand(Math.abs(facetSignal - 0.5), 0.43, 0.095) * body);
          }
          var coverage = (incision * (1 - polarityMix) + body * polarityMix) * permitted[index];
          coverage *= 0.32 + patternAggregate.strength * 0.68;
          if (coverage > 0.02 && pore < 0.018 + pattern * 0.018 && regime !== 'crystal') coverage *= 0.08;
          image.data[index * 4] = image.data[index * 4 + 1] = image.data[index * 4 + 2] = 255;
          image.data[index * 4 + 3] = Math.max(0, Math.min(255, Math.round(coverage * 255)));
        }

        // Destination material shading; the analysis grid and topology stay fixed.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext,discard=new Float64Array(4);RC.field(image,function(px,py,rgba){var x=px-.5,y=py-.5,outputX=x,outputY=y;var index=Math.floor(y)*(gridWidth)+Math.floor(x);
          var gridX = x;
          var gridY = y;
          var raw = RC.sample(chemicalB,gridWidth,gridHeight,x,y);

          var neighborLeft = chemicalB[gridX > 0 ? index - 1 : index];
          var neighborRight = chemicalB[gridX + 1 < gridWidth ? index + 1 : index];
          var neighborTop = chemicalB[gridY > 0 ? index - gridWidth : index];
          var neighborBottom = chemicalB[gridY + 1 < gridHeight ? index + gridWidth : index];
          var gradient = Math.max(Math.abs(raw - neighborLeft), Math.abs(raw - neighborRight),
            Math.abs(raw - neighborTop), Math.abs(raw - neighborBottom));
          var pore = hash(gridX * 5 + gridY * 13, gridY * 7 + gridX * 3, params.seed + 1973);
          var body = 0, incision = 0;
          if (regime === 'labyrinth') {
            body = Math.max(ridgeBand(raw, 0.115, 0.031),
              ridgeBand(raw, 0.205, 0.034) * 0.78) * (0.76 + pore * 0.24);
            incision = Math.max(ridgeBand(gradient, 0.035, 0.022),
              ridgeBand(raw, 0.295, 0.048) * 0.58) * (1 - smoothBand(raw, 0.66, 0.9));
          } else if (regime === 'mitosis') {
            body = Math.max(ridgeBand(raw, 0.16, 0.043),
              ridgeBand(raw, 0.35, 0.055) * 0.72) * (0.72 + pore * 0.28);
            incision = Math.max(ridgeBand(gradient, 0.052, 0.031),
              ridgeBand(raw, 0.49, 0.055) * 0.64) * (1 - smoothBand(raw, 0.76, 0.94));
          } else if (regime === 'coral') {
            body = Math.max(ridgeBand(raw, 0.09, 0.028),
              ridgeBand(raw, 0.21, 0.046) * 0.76) * (0.58 + pore * 0.42);
            incision = Math.max(ridgeBand(gradient, 0.032, 0.023),
              ridgeBand(raw, 0.39, 0.068) * 0.72) * (1 - smoothBand(raw, 0.79, 0.96));
          } else {
            var facetSignal = 0.5 + 0.5 * Math.sin((gridX - gridY * 0.72) * (0.72 + pattern * 0.55));
            body = Math.max(ridgeBand(raw, 0.12, 0.036),
              ridgeBand(raw, 0.29, 0.05) * 0.68) * (0.38 + facetSignal * 0.62);
            incision = Math.max(ridgeBand(gradient, 0.041, 0.026),
              ridgeBand(Math.abs(facetSignal - 0.5), 0.43, 0.095) * body);
          }
          var coverage = (incision * (1 - polarityMix) + body * polarityMix) * RC.sample(permitted,gridWidth,gridHeight,x,y);
          coverage *= 0.32 + patternAggregate.strength * 0.68;
          if (coverage > 0.02 && pore < 0.018 + pattern * 0.018 && regime !== 'crystal') coverage *= 0.08;
          rgba[0] = rgba[1] = rgba[2] = 255;
          rgba[3] = Math.max(0, Math.min(255, Math.round(coverage * 255)));

        });}
        grid.ctx.putImageData(image, 0, 0);
        var expanded = surfaceScratch('etchant-regime-expanded', width, height, false);
        // Keep the reaction lattice legible. A smoothed low-resolution alpha
        // field reads as an ordinary outer glow; nearest-cell deposition plus
        // vector isocontours preserves fronts, pores and finite reaction cells.
        expanded.ctx.imageSmoothingEnabled = false;
        expanded.ctx.globalAlpha = 0.54;
        expanded.ctx.drawImage(grid.canvas, regionX, regionY, regionWidth, regionHeight);
        expanded.ctx.globalAlpha = 1;
        expanded.ctx.save();
        expanded.ctx.translate(regionX, regionY);
        expanded.ctx.strokeStyle = '#fff';
        expanded.ctx.lineCap = 'round';
        expanded.ctx.lineJoin = 'round';
        expanded.ctx.globalAlpha = Math.min(0.94, 0.48 + patternAggregate.strength * 0.46);
        expanded.ctx.lineWidth = Math.max(0.52, reactionScale * (regime === 'crystal' ? 0.09 : 0.065));
        var scaleX = regionWidth / gridWidth, scaleY = regionHeight / gridHeight;
        var contourThresholds = regime === 'mitosis' ? [0.12, 0.21, 0.34, 0.49]
          : regime === 'coral' ? [0.07, 0.14, 0.24, 0.39]
          : regime === 'crystal' ? [0.09, 0.18, 0.29, 0.43]
          : [0.085, 0.135, 0.205, 0.295];
        for (var contourIndex = 0; contourIndex < contourThresholds.length; contourIndex++) {
          expanded.ctx.globalAlpha = Math.max(0.24,
            Math.min(0.94, 0.82 + patternAggregate.strength * 0.12 - contourIndex * 0.15));
          expanded.ctx.lineWidth = Math.max(0.34,
            reactionScale * (regime === 'crystal' ? 0.088 : 0.068) * (1 - contourIndex * 0.12));
          strokeEtchantContours(expanded.ctx, contourValues, gridWidth, gridHeight,
            contourThresholds[contourIndex], scaleX, scaleY);
        }
        expanded.ctx.restore();
        paintSurfaceMask(targetCtx, expanded.canvas, surfaceEffectColor('etchantBloom'), 1,
          'etchant-regime-color');
      }

      function renderSinewTorqueLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var pullAggregate = surfaceAggregate(glyphs, 'sinewTorque', 'sinewPull', params.sinewPull);
        if (!pullAggregate.weight) return;
        var globalStrength = pullAggregate.strength;
        var pull = pullAggregate.value * pixelScale * L.s * globalStrength;
        var torque = surfaceAggregate(glyphs, 'sinewTorque', 'sinewTorqueAmount', params.sinewTorque).value * Math.PI / 180 * globalStrength;
        var tension = surfaceAggregate(glyphs, 'sinewTorque', 'sinewTension', params.sinewTension).value;
        var waistAmount = surfaceAggregate(glyphs, 'sinewTorque', 'sinewWaist', params.sinewWaist).value * globalStrength;
        var axis = surfaceAggregate(glyphs, 'sinewTorque', 'sinewAxis', params.sinewAxis).value * Math.PI / 180;
        var mask = buildSurfaceMask(glyphs, 'sinewTorque', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'sinewTorque', coverBase);
        var sourceCtx = mask.getContext('2d', { willReadFrequently: true });
        var source;
        try { source = sourceCtx.getImageData(0, 0, width, height); }
        catch (error) { return; }
        var field = surfaceBoundaryDistance(source.data, width, height);
        if (!field.bounds) return;

        var centerX = (field.bounds[0] + field.bounds[2]) * 0.5;
        var centerY = (field.bounds[1] + field.bounds[3]) * 0.5;
        var cosAxis = Math.cos(axis), sinAxis = Math.sin(axis);
        var corners = [
          [field.bounds[0], field.bounds[1]], [field.bounds[2], field.bounds[1]],
          [field.bounds[2], field.bounds[3]], [field.bounds[0], field.bounds[3]]
        ];
        var halfU = 2, halfV = 2;
        for (var cornerIndex = 0; cornerIndex < corners.length; cornerIndex++) {
          var cornerDx = corners[cornerIndex][0] - centerX;
          var cornerDy = corners[cornerIndex][1] - centerY;
          halfU = Math.max(halfU, Math.abs(cornerDx * cosAxis + cornerDy * sinAxis));
          halfV = Math.max(halfV, Math.abs(-cornerDx * sinAxis + cornerDy * cosAxis));
        }
        // The inverse deformation decides whether a destination pixel belongs
        // to the body. A predicted reach rectangle is not a valid clipping
        // boundary: extreme pull/torque can fold real output beyond it.
        var minX = 0, maxX = width - 1, minY = 0, maxY = height - 1;
        var warped = surfaceScratch('sinew-torque-mask', width, height, true);
        var output = warped.ctx.createImageData(width, height);
        var exponent = 0.45 + (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('sinewTension', tension, 0, 0.1, 8) : Math.max(0.1, Math.min(8, tension))) * 0.32;

        function sourceAlphaAt(x, y) {
          if (x < 0 || y < 0 || x >= width - 1 || y >= height - 1) return 0;
          var x0 = Math.floor(x), y0 = Math.floor(y);
          var tx = x - x0, ty = y - y0;
          var i00 = (y0 * width + x0) * 4 + 3;
          var i10 = i00 + 4;
          var i01 = i00 + width * 4;
          var i11 = i01 + 4;
          var top = source.data[i00] * (1 - tx) + source.data[i10] * tx;
          var bottom = source.data[i01] * (1 - tx) + source.data[i11] * tx;
          return top * (1 - ty) + bottom * ty;
        }

        for (var y = minY; y <= maxY; y++) for (var x = minX; x <= maxX; x++) {
          var dx = x - centerX, dy = y - centerY;
          var destinationU = dx * cosAxis + dy * sinAxis;
          var destinationV = -dx * sinAxis + dy * cosAxis;
          var sourceU = destinationU, sourceV = destinationV;
          var q = Math.max(-1.5, Math.min(1.5, sourceV / halfV));
          for (var solve = 0; solve < 4; solve++) {
            var flex = (q < 0 ? -1 : 1) * Math.pow(Math.abs(q), exponent);
            var localAngle = torque * flex * 0.5;
            var bend = pull * (q * 0.35 + Math.sin(q * Math.PI * 0.5) * 0.65);
            var shiftedU = destinationU - bend;
            var cosLocal = Math.cos(localAngle), sinLocal = Math.sin(localAngle);
            var scaledU = shiftedU * cosLocal + destinationV * sinLocal;
            sourceV = -shiftedU * sinLocal + destinationV * cosLocal;
            q = Math.max(-1.5, Math.min(1.5, sourceV / halfV));
            var centerPressure = Math.max(0, 1 - Math.min(1, Math.abs(q)));
            var waistScale = Math.max(0.08, Math.min(5, Math.exp(waistAmount * centerPressure * 0.42)));
            sourceU = scaledU / waistScale;
          }
          var sourceX = centerX + sourceU * cosAxis - sourceV * sinAxis;
          var sourceY = centerY + sourceU * sinAxis + sourceV * cosAxis;
          var alpha = sourceAlphaAt(sourceX, sourceY);
          if (alpha < 0.5) continue;
          var outputIndex = (y * width + x) * 4;
          output.data[outputIndex] = 255;
          output.data[outputIndex + 1] = 255;
          output.data[outputIndex + 2] = 255;
          output.data[outputIndex + 3] = Math.max(0, Math.min(255, Math.round(alpha)));
        }

        // Output pixels sample the fixed geometry and original glyph raster.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext;function outputSourceAlphaAt(x,y){return RC.rasterSample(source.data,width,height,x,y,3);}RC.field(output,function(px,py,rgba){var x=px-.5,y=py-.5;if(y<(minY)||!(y <= maxY))return;if(x<(minX)||!(x <= maxX))return;
          var dx = x - centerX, dy = y - centerY;
          var destinationU = dx * cosAxis + dy * sinAxis;
          var destinationV = -dx * sinAxis + dy * cosAxis;
          var sourceU = destinationU, sourceV = destinationV;
          var q = Math.max(-1.5, Math.min(1.5, sourceV / halfV));
          for (var solve = 0; solve < 4; solve++) {
            var flex = (q < 0 ? -1 : 1) * Math.pow(Math.abs(q), exponent);
            var localAngle = torque * flex * 0.5;
            var bend = pull * (q * 0.35 + Math.sin(q * Math.PI * 0.5) * 0.65);
            var shiftedU = destinationU - bend;
            var cosLocal = Math.cos(localAngle), sinLocal = Math.sin(localAngle);
            var scaledU = shiftedU * cosLocal + destinationV * sinLocal;
            sourceV = -shiftedU * sinLocal + destinationV * cosLocal;
            q = Math.max(-1.5, Math.min(1.5, sourceV / halfV));
            var centerPressure = Math.max(0, 1 - Math.min(1, Math.abs(q)));
            var waistScale = Math.max(0.08, Math.min(5, Math.exp(waistAmount * centerPressure * 0.42)));
            sourceU = scaledU / waistScale;
          }
          var sourceX = centerX + sourceU * cosAxis - sourceV * sinAxis;
          var sourceY = centerY + sourceU * sinAxis + sourceV * cosAxis;
          var alpha = outputSourceAlphaAt(sourceX, sourceY);
          if (alpha < 0.5) return;
          var outputIndex = (y * width + x) * 4;
          rgba[0] = 255;
          rgba[1] = 255;
          rgba[2] = 255;
          rgba[3] = Math.max(0, Math.min(255, Math.round(alpha)));

        });}
        warped.ctx.putImageData(output, 0, 0);
        paintSurfaceMask(targetCtx, warped.canvas, surfaceEffectColor('sinewTorque'), 1, 'sinew-torque-color');
      }

      function renderSinewTorque(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var system = surfaceChoice(glyphs, 'sinewTorque', 'sinewSystem', params.sinewSystem,
          BATCH_PARAM_OPTIONS.sinewSystem);
        if (system === 'legacy') {
          renderSinewTorqueLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        // Each typographic line becomes one continuous tissue body. Treating
        // every line as one global muscle made a lower line fold through the
        // line above it; per-line fields keep readable baselines while still
        // coupling all glyphs within the line through one pennation system.
        var lineGroups = Object.create(null);
        var lineOrder = [];
        for (var glyphIndex = 0; glyphIndex < glyphs.length; glyphIndex++) {
          var glyph = glyphs[glyphIndex];
          var lineKey = glyph.line != null ? String(glyph.line)
            : String(Math.round(((glyph.by != null ? glyph.by : glyph.y) || 0) / Math.max(1, fm.ascent + fm.descent)));
          if (!lineGroups[lineKey]) {
            lineGroups[lineKey] = [];
            lineOrder.push(lineKey);
          }
          lineGroups[lineKey].push(glyph);
        }
        for (var lineIndex = 0; lineIndex < lineOrder.length; lineIndex++) {
          renderSinewTorqueField(targetCtx, lineGroups[lineOrder[lineIndex]], width, height,
            pixelScale, L, fm, coverBase, system);
        }
      }

      function renderSinewTorqueField(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase, system) {
        var pullAggregate = surfaceAggregate(glyphs, 'sinewTorque', 'sinewPull', params.sinewPull);
        if (!pullAggregate.weight) return;
        var globalStrength = pullAggregate.strength;
        var pull = pullAggregate.value * pixelScale * L.s * globalStrength;
        var torque = surfaceAggregate(glyphs, 'sinewTorque', 'sinewTorqueAmount', params.sinewTorque).value
          * Math.PI / 180 * globalStrength;
        var tension = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('sinewTension', surfaceAggregate(glyphs, 'sinewTorque', 'sinewTension', params.sinewTension).value, 0, 0.1, 8) : Math.max(0.1, Math.min(8,
          surfaceAggregate(glyphs, 'sinewTorque', 'sinewTension', params.sinewTension).value)));
        var waistAmount = surfaceAggregate(glyphs, 'sinewTorque', 'sinewWaist', params.sinewWaist).value
          * globalStrength;
        var axis = surfaceAggregate(glyphs, 'sinewTorque', 'sinewAxis', params.sinewAxis).value
          * Math.PI / 180;
        var mask = buildSurfaceMask(glyphs, 'sinewTorque', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'sinewTorque', coverBase);
        // Fascia joins neighbouring glyph bodies before deformation. These
        // short internal bridges turn a row into one muscle architecture while
        // retaining the original counters and most inter-letter air.
        var tissueMask = surfaceScratch('sinew-connected-source', width, height, false);
        tissueMask.ctx.drawImage(mask, 0, 0);
        var orderedGlyphs = glyphs.slice().sort(function (a, b) {
          var ax = a.x != null ? a.x : a.bx;
          var bx = b.x != null ? b.x : b.bx;
          return ax - bx;
        });
        tissueMask.ctx.strokeStyle = '#fff';
        tissueMask.ctx.lineCap = 'round';
        tissueMask.ctx.lineJoin = 'round';
        tissueMask.ctx.lineWidth = Math.max(1.2,
          (fm.ascent + fm.descent) * pixelScale * L.s * (0.026 + tension * 0.004));
        for (var bridgeIndex = 0; bridgeIndex < orderedGlyphs.length - 1; bridgeIndex++) {
          var bridgeLevel = 0.2 + hash(bridgeIndex, params.seed % 97, 2251) * 0.6;
          var bridgeCounterLevel = Math.max(0.14, Math.min(0.86, bridgeLevel
            + (hash(bridgeIndex, params.seed % 89, 2257) - 0.5) * 0.22));
          var bridgeA = surfaceGlyphNode(orderedGlyphs[bridgeIndex], 'sinewTorque', pixelScale, L,
            0, 0, 0, bridgeIndex, 0.8, bridgeLevel, 1);
          var bridgeB = surfaceGlyphNode(orderedGlyphs[bridgeIndex + 1], 'sinewTorque', pixelScale, L,
            0, 0, 0, bridgeIndex + 1, 0.2, bridgeCounterLevel, 1);
          var bridgeDx = bridgeB.x - bridgeA.x;
          var bridgeDy = bridgeB.y - bridgeA.y;
          var bridgeLength = Math.sqrt(bridgeDx * bridgeDx + bridgeDy * bridgeDy);
          var bridgeLimit = Math.max(20, (fm.ascent + fm.descent) * pixelScale * L.s * 1.18);
          if (bridgeLength > bridgeLimit) continue;
          var bridgeLift = (hash(bridgeIndex, params.seed % 97, 2267) - 0.5)
            * tissueMask.ctx.lineWidth * (system === 'braid' ? 3.4 : 2.2);
          tissueMask.ctx.beginPath();
          tissueMask.ctx.moveTo(bridgeA.x, bridgeA.y);
          tissueMask.ctx.quadraticCurveTo((bridgeA.x + bridgeB.x) * 0.5,
            (bridgeA.y + bridgeB.y) * 0.5 + bridgeLift, bridgeB.x, bridgeB.y);
          tissueMask.ctx.stroke();
        }
        var sourceCtx = tissueMask.ctx;
        var source;
        try { source = sourceCtx.getImageData(0, 0, width, height); }
        catch (error) { return; }
        var field = surfaceBoundaryDistance(source.data, width, height);
        if (!field.bounds) return;

        var centerX = (field.bounds[0] + field.bounds[2]) * 0.5;
        var centerY = (field.bounds[1] + field.bounds[3]) * 0.5;
        var cosAxis = Math.cos(axis), sinAxis = Math.sin(axis);
        var corners = [
          [field.bounds[0], field.bounds[1]], [field.bounds[2], field.bounds[1]],
          [field.bounds[2], field.bounds[3]], [field.bounds[0], field.bounds[3]]
        ];
        var halfU = 2, halfV = 2;
        for (var cornerIndex = 0; cornerIndex < corners.length; cornerIndex++) {
          var cornerDx = corners[cornerIndex][0] - centerX;
          var cornerDy = corners[cornerIndex][1] - centerY;
          halfU = Math.max(halfU, Math.abs(cornerDx * cosAxis + cornerDy * sinAxis));
          halfV = Math.max(halfV, Math.abs(-cornerDx * sinAxis + cornerDy * cosAxis));
        }
        var phase = compositionState.enabled
          ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var exponent = 0.45 + tension * 0.32;

        function deformationAt(u, v, family) {
          var q = Math.max(-1.6, Math.min(1.6, v / halfV));
          var centerPressure = Math.max(0, 1 - Math.min(1, Math.abs(q)));
          var flex = (q < 0 ? -1 : 1) * Math.pow(Math.abs(q), exponent);
          var angle = 0, bend = 0, scaleU = 1, scaleV = 1, transverse = 0;
          if (system === 'torsion') {
            angle = torque * (flex * 0.68 + Math.sin(q * Math.PI) * 0.32);
            bend = pull * (q * 0.3 + Math.sin(q * Math.PI * 0.5) * 0.7);
            scaleU = Math.exp(waistAmount * centerPressure * 0.36);
          } else if (system === 'fascicle') {
            var pennation = Math.sin(q * Math.PI * (1.15 + tension * 0.05) + phase * 0.16);
            angle = torque * (0.13 + tension * 0.018) * pennation;
            bend = pull * (q * 0.18 + Math.sin(q * Math.PI * 0.7) * 0.82);
            scaleU = Math.exp(waistAmount * centerPressure * 0.28);
            transverse = Math.sin((u / halfU) * Math.PI * (1.2 + tension * 0.16)
              + q * 2.2 + phase * 0.2 + (family || 0) * Math.PI) * halfV * 0.035 * tension;
          } else if (system === 'compression') {
            scaleU = Math.exp(waistAmount * centerPressure * 0.52)
              * (1 + Math.max(0, tension - 1) * centerPressure * 0.055);
            scaleV = Math.max(0.24, 1 - Math.min(0.62, Math.abs(pull) / Math.max(20, halfV * 3.2))
              * centerPressure);
            bend = pull * 0.16 * Math.sin(q * Math.PI);
            angle = torque * 0.08 * Math.sin(q * Math.PI * 2);
          } else {
            var braidSign = family ? -1 : 1;
            angle = torque * braidSign * (0.19 + tension * 0.025)
              * Math.sin(q * Math.PI * (2.15 + tension * 0.06) + phase * 0.18 + (family || 0) * Math.PI);
            bend = pull * (0.26 * q + 0.74 * Math.sin(q * Math.PI * 1.35 + (family || 0) * Math.PI));
            scaleU = Math.exp(waistAmount * centerPressure * 0.22);
            transverse = braidSign * Math.sin((u / halfU) * Math.PI * 1.7 + q * Math.PI * 2.4 + phase * 0.25)
              * halfV * (0.018 + tension * 0.006);
          }
          var scaledU = u * scaleU + bend;
          var scaledV = v * scaleV + transverse;
          var cosLocal = Math.cos(angle), sinLocal = Math.sin(angle);
          return {
            u: scaledU * cosLocal - scaledV * sinLocal,
            v: scaledU * sinLocal + scaledV * cosLocal
          };
        }

        function sourceAlphaAt(x, y) {
          if (x < 0 || y < 0 || x >= width - 1 || y >= height - 1) return 0;
          var x0 = Math.floor(x), y0 = Math.floor(y);
          var tx = x - x0, ty = y - y0;
          var i00 = (y0 * width + x0) * 4 + 3;
          var i10 = i00 + 4;
          var i01 = i00 + width * 4;
          var i11 = i01 + 4;
          var top = source.data[i00] * (1 - tx) + source.data[i10] * tx;
          var bottom = source.data[i01] * (1 - tx) + source.data[i11] * tx;
          return top * (1 - ty) + bottom * ty;
        }

        // Never turn a performance estimate into an artwork boundary. Scan the
        // complete analysis surface; the shared render envelope grows it when
        // real pixels reach an edge.
        var minX = 0, maxX = width - 1, minY = 0, maxY = height - 1;
        var warped = surfaceScratch('sinew-tissue-mask', width, height, true);
        var output = warped.ctx.createImageData(width, height);
        for (var y = minY; y <= maxY; y++) for (var x = minX; x <= maxX; x++) {
          var dx = x - centerX, dy = y - centerY;
          var destinationU = dx * cosAxis + dy * sinAxis;
          var destinationV = -dx * sinAxis + dy * cosAxis;
          var sourceU = destinationU, sourceV = destinationV;
          // Invert the nonlinear tissue field by fixed-point correction. This
          // keeps the contour continuous even under extreme pull/torque.
          for (var solve = 0; solve < 7; solve++) {
            var mapped = deformationAt(sourceU, sourceV, 0);
            sourceU += (destinationU - mapped.u) * 0.66;
            sourceV += (destinationV - mapped.v) * 0.66;
          }
          var sourceX = centerX + sourceU * cosAxis - sourceV * sinAxis;
          var sourceY = centerY + sourceU * sinAxis + sourceV * cosAxis;
          var alpha = sourceAlphaAt(sourceX, sourceY);
          if (alpha < 0.5) continue;
          var outputIndex = (y * width + x) * 4;
          output.data[outputIndex] = output.data[outputIndex + 1] = output.data[outputIndex + 2] = 255;
          output.data[outputIndex + 3] = Math.max(0, Math.min(255, Math.round(alpha)));
        }

        // Output pixels sample the fixed geometry and original glyph raster.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext;function outputSourceAlphaAt(x,y){return RC.rasterSample(source.data,width,height,x,y,3);}RC.field(output,function(px,py,rgba){var x=px-.5,y=py-.5;if(y<(minY)||!(y <= maxY))return;if(x<(minX)||!(x <= maxX))return;
          var dx = x - centerX, dy = y - centerY;
          var destinationU = dx * cosAxis + dy * sinAxis;
          var destinationV = -dx * sinAxis + dy * cosAxis;
          var sourceU = destinationU, sourceV = destinationV;
          // Invert the nonlinear tissue field by fixed-point correction. This
          // keeps the contour continuous even under extreme pull/torque.
          for (var solve = 0; solve < 7; solve++) {
            var mapped = deformationAt(sourceU, sourceV, 0);
            sourceU += (destinationU - mapped.u) * 0.66;
            sourceV += (destinationV - mapped.v) * 0.66;
          }
          var sourceX = centerX + sourceU * cosAxis - sourceV * sinAxis;
          var sourceY = centerY + sourceU * sinAxis + sourceV * cosAxis;
          var alpha = outputSourceAlphaAt(sourceX, sourceY);
          if (alpha < 0.5) return;
          var outputIndex = (y * width + x) * 4;
          rgba[0] = rgba[1] = rgba[2] = 255;
          rgba[3] = Math.max(0, Math.min(255, Math.round(alpha)));

        });}
        warped.ctx.putImageData(output, 0, 0);

        var fibers = surfaceScratch('sinew-fascicle-grooves', width, height, false);
        var fiberCtx = fibers.ctx;
        fiberCtx.strokeStyle = '#fff';
        fiberCtx.lineCap = 'round';
        fiberCtx.lineJoin = 'round';
        var fiberCount = Math.min(86, Math.max(10, Math.round(13 + tension * 7 + Math.abs(waistAmount) * 3)));
        var sampleCount = 32;
        function worldPoint(localU, localV, family) {
          var deformed = deformationAt(localU, localV, family);
          return {
            x: centerX + deformed.u * cosAxis - deformed.v * sinAxis,
            y: centerY + deformed.u * sinAxis + deformed.v * cosAxis
          };
        }
        function strokeFiber(localV, family, alphaScale, widthScale) {
          fiberCtx.globalAlpha = alphaScale;
          fiberCtx.lineWidth = Math.max(0.38, pixelScale * L.s * widthScale);
          fiberCtx.beginPath();
          for (var sample = 0; sample <= sampleCount; sample++) {
            var u = -halfU * 1.15 + halfU * 2.3 * sample / sampleCount;
            var ripple = Math.sin(sample / sampleCount * Math.PI * (1.8 + tension * 0.08)
              + localV / halfV * 2.3 + phase * 0.18 + family * Math.PI) * halfV * 0.018 * tension;
            var point = worldPoint(u, localV + ripple, family);
            if (sample === 0) fiberCtx.moveTo(point.x, point.y);
            else fiberCtx.lineTo(point.x, point.y);
          }
          fiberCtx.stroke();
        }
        for (var fiberIndex = 0; fiberIndex < fiberCount; fiberIndex++) {
          var localV = -halfV + halfV * 2 * (fiberIndex + 0.5) / fiberCount;
          var centerBias = Math.max(0, 1 - Math.abs(localV / halfV));
          strokeFiber(localV, 0, (0.16 + centerBias * 0.38) * globalStrength,
            0.58 + tension * 0.055);
          if (system === 'braid') {
            strokeFiber(localV + halfV / fiberCount * 0.48, 1,
              (0.11 + centerBias * 0.31) * globalStrength, 0.46 + tension * 0.045);
          }
        }

        if (system === 'compression') {
          var ringCount = Math.min(28, Math.max(5, Math.round(5 + tension * 2.5)));
          for (var ringIndex = 0; ringIndex < ringCount; ringIndex++) {
            var ringU = -halfU + halfU * 2 * (ringIndex + 0.5) / ringCount;
            fiberCtx.globalAlpha = globalStrength * (0.12 + 0.24 * Math.sin((ringIndex + 1) / (ringCount + 1) * Math.PI));
            fiberCtx.lineWidth = Math.max(0.4, pixelScale * L.s * (0.42 + tension * 0.035));
            fiberCtx.beginPath();
            for (var ringSample = 0; ringSample <= 24; ringSample++) {
              var ringV = -halfV * 1.05 + halfV * 2.1 * ringSample / 24;
              var ringPoint = worldPoint(ringU + Math.sin(ringV / halfV * Math.PI) * halfU * 0.025 * tension,
                ringV, 0);
              if (ringSample === 0) fiberCtx.moveTo(ringPoint.x, ringPoint.y);
              else fiberCtx.lineTo(ringPoint.x, ringPoint.y);
            }
            fiberCtx.stroke();
          }
        }
        fiberCtx.globalAlpha = 1;
        fiberCtx.globalCompositeOperation = 'destination-in';
        fiberCtx.drawImage(warped.canvas, 0, 0);
        fiberCtx.globalCompositeOperation = 'source-over';
        warped.ctx.save();
        warped.ctx.globalCompositeOperation = 'destination-out';
        warped.ctx.globalAlpha = system === 'fascicle' ? 0.34 : system === 'braid' ? 0.4 : 0.28;
        warped.ctx.drawImage(fibers.canvas, 0, 0);
        warped.ctx.restore();

        // A longitudinal aponeurosis makes the field legible as one anatomical
        // body, not a texture placed over independent glyphs.
        var seam = surfaceScratch('sinew-aponeurosis', width, height, false);
        seam.ctx.strokeStyle = '#fff';
        seam.ctx.lineCap = 'round';
        seam.ctx.lineJoin = 'round';
        seam.ctx.globalAlpha = Math.min(0.64, 0.24 + tension * 0.045) * globalStrength;
        seam.ctx.lineWidth = Math.max(0.7, pixelScale * L.s * (0.9 + tension * 0.18));
        seam.ctx.beginPath();
        for (var seamSample = 0; seamSample <= 48; seamSample++) {
          var seamU = -halfU * 1.05 + halfU * 2.1 * seamSample / 48;
          var seamV = Math.sin(seamU / halfU * Math.PI * 1.35 + phase * 0.12)
            * halfV * 0.036 * tension;
          var seamPoint = worldPoint(seamU, seamV, 0);
          if (seamSample === 0) seam.ctx.moveTo(seamPoint.x, seamPoint.y);
          else seam.ctx.lineTo(seamPoint.x, seamPoint.y);
        }
        seam.ctx.stroke();
        seam.ctx.globalCompositeOperation = 'destination-in';
        seam.ctx.drawImage(warped.canvas, 0, 0);
        seam.ctx.globalCompositeOperation = 'source-over';
        warped.ctx.save();
        warped.ctx.globalCompositeOperation = 'destination-out';
        warped.ctx.globalAlpha = 0.24;
        warped.ctx.drawImage(seam.canvas, 0, 0);
        warped.ctx.restore();
        paintSurfaceMask(targetCtx, warped.canvas, surfaceEffectColor('sinewTorque'), 1,
          'sinew-tissue-color');
      }

      function renderBoneTrabecularV36(targetCtx, glyphs, width, height, pixelScale, L, fm,
        coverBase, cellAggregate, marrow, branching, weight, joint, warp) {
        var mask = buildSurfaceMask(glyphs, 'boneScaffold', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'boneScaffold', coverBase);
        var source;
        try { source = mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height); }
        catch (error) { return; }
        var sourceField = surfaceBoundaryDistance(source.data, width, height);
        if (!sourceField.bounds) return;
        var metas = surfaceGlyphAnatomyMetas(glyphs, 'boneScaffold', pixelScale, L);
        if (!metas.length) return;

        var effect = surfaceEffectColor('boneScaffold');
        var effectRgb = surfaceHexRgb(effect);
        var shadow = surfaceToneCss(effectRgb, -0.56);
        var middle = surfaceToneCss(effectRgb, -0.12);
        var highlight = surfaceToneCss(effectRgb, 0.76);
        var pale = surfaceToneCss(effectRgb, 0.9);
        var cell = Math.max(2, cellAggregate.value * pixelScale * L.s);
        // A literal clip to the source outline leaves no room for marrow or
        // trabeculae in a light Mincho stem. Grow one bounded periosteal body
        // around the glyph before constructing it; counters remain holes and
        // the original mask is still used for independent source mixing.
        var periostealReach = Math.min(cell * 0.56,
          weight * 1.32 + joint * 0.18 + 0.7 * pixelScale * L.s);
        var constructionMask = surfaceBoundaryEnvelopeCanvas(sourceField, width, height,
          periostealReach, 1, 'bone-v36-periosteal-envelope');
        var constructionSource;
        try {
          constructionSource = constructionMask.getContext('2d', { willReadFrequently: true })
            .getImageData(0, 0, width, height);
        } catch (constructionError) { return; }
        var field = surfaceBoundaryDistance(constructionSource.data, width, height);
        if (!field.bounds) return;
        var shellWidth = Math.max(0.9 * pixelScale * L.s,
          weight * (1.08 + Math.min(6, marrow) * 0.105) + cell * 0.035);
        var phase = compositionState.enabled
          ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var work = surfaceScratch('bone-v36-trabecular-body', width, height, true);
        var ctx = work.ctx;
        var cortical = ctx.createImageData(width, height);
        var lamellae = ctx.createImageData(width, height);
        var minX = field.bounds[0], minY = field.bounds[1];
        var maxX = field.bounds[2], maxY = field.bounds[3];
        var shellStrength = Math.max(0, Math.min(1, cellAggregate.strength));
        var lamellaPitch = Math.max(1.35 * pixelScale * L.s,
          shellWidth * (0.42 + Math.min(6, marrow) * 0.025));

        // A continuous shell is the legibility floor at small text sizes. Its
        // slight thickness modulation prevents the result becoming a simple
        // outline, while distance bands expose compact-bone lamellae.
        for (var shellY = minY; shellY <= maxY; shellY++) {
          for (var shellX = minX; shellX <= maxX; shellX++) {
            var shellIndex = shellY * width + shellX;
            if (!field.inside[shellIndex]) continue;
            var shellDistance = field.distance[shellIndex];
            var shellModulation = 0.9
              + Math.sin(shellX * 0.071 + shellY * 0.047 + params.seed * 0.41) * 0.08
              + Math.sin(shellX * 0.019 - shellY * 0.061 + phase) * Math.min(0.12, warp * 0.018);
            var shellLimit = shellWidth * shellModulation;
            var pixelIndex = shellIndex * 4;
            if (shellDistance <= shellLimit) {
              var shellEdge = Math.max(0, Math.min(1, (shellLimit - shellDistance + 1) / 1.35));
              cortical.data[pixelIndex] = effectRgb[0];
              cortical.data[pixelIndex + 1] = effectRgb[1];
              cortical.data[pixelIndex + 2] = effectRgb[2];
              cortical.data[pixelIndex + 3] = Math.round(255 * shellStrength * (0.74 + shellEdge * 0.26));
            }
            var bandDistance = shellDistance + Math.sin(shellX * 0.043 + shellY * 0.029) * 0.28;
            var bandPhase = bandDistance / lamellaPitch;
            var bandFraction = bandPhase - Math.floor(bandPhase);
            if (shellDistance <= shellLimit * 2.35
              && bandFraction > 0.43 && bandFraction < 0.57) {
              lamellae.data[pixelIndex] = 255;
              lamellae.data[pixelIndex + 1] = 255;
              lamellae.data[pixelIndex + 2] = 255;
              lamellae.data[pixelIndex + 3] = Math.round(150 * shellStrength
                * (1 - shellDistance / Math.max(1, shellLimit * 2.7)));
            }
          }
        }

        // Destination material shading; the analysis grid and topology stay fixed.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext,discard=new Float64Array(4);RC.field(cortical,function(px,py,rgba){var x=px-.5,y=py-.5,shellX=x,shellY=y;

            var shellIndex=Math.floor(shellY)*width+Math.floor(shellX);
            if (!((RC.sample(field.inside,width,height,shellX,shellY)>=.5))) return;
            var shellDistance = RC.sample(field.distance,width,height,shellX,shellY);
            var shellModulation = 0.9
              + Math.sin(shellX * 0.071 + shellY * 0.047 + params.seed * 0.41) * 0.08
              + Math.sin(shellX * 0.019 - shellY * 0.061 + phase) * Math.min(0.12, warp * 0.018);
            var shellLimit = shellWidth * shellModulation;
            var pixelIndex = shellIndex * 4;
            if (shellDistance <= shellLimit) {
              var shellEdge = Math.max(0, Math.min(1, (shellLimit - shellDistance + 1) / 1.35));
              rgba[0] = effectRgb[0];
              rgba[1] = effectRgb[1];
              rgba[2] = effectRgb[2];
              rgba[3] = Math.round(255 * shellStrength * (0.74 + shellEdge * 0.26));
            }
            var bandDistance = shellDistance + Math.sin(shellX * 0.043 + shellY * 0.029) * 0.28;
            var bandPhase = bandDistance / lamellaPitch;
            var bandFraction = bandPhase - Math.floor(bandPhase);
            if (shellDistance <= shellLimit * 2.35
              && bandFraction > 0.43 && bandFraction < 0.57) {
              discard[0] = 255;
              discard[1] = 255;
              discard[2] = 255;
              discard[3] = Math.round(150 * shellStrength
                * (1 - shellDistance / Math.max(1, shellLimit * 2.7)));
            }


        });}
        ctx.putImageData(cortical, 0, 0);
        var lamellaCanvas = surfaceScratch('bone-v36-lamellae-mask', width, height, false);

        // Destination material shading; the analysis grid and topology stay fixed.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext,discard=new Float64Array(4);RC.field(lamellae,function(px,py,rgba){var x=px-.5,y=py-.5,shellX=x,shellY=y;

            var shellIndex=Math.floor(shellY)*width+Math.floor(shellX);
            if (!((RC.sample(field.inside,width,height,shellX,shellY)>=.5))) return;
            var shellDistance = RC.sample(field.distance,width,height,shellX,shellY);
            var shellModulation = 0.9
              + Math.sin(shellX * 0.071 + shellY * 0.047 + params.seed * 0.41) * 0.08
              + Math.sin(shellX * 0.019 - shellY * 0.061 + phase) * Math.min(0.12, warp * 0.018);
            var shellLimit = shellWidth * shellModulation;
            var pixelIndex = shellIndex * 4;
            if (shellDistance <= shellLimit) {
              var shellEdge = Math.max(0, Math.min(1, (shellLimit - shellDistance + 1) / 1.35));
              discard[0] = effectRgb[0];
              discard[1] = effectRgb[1];
              discard[2] = effectRgb[2];
              discard[3] = Math.round(255 * shellStrength * (0.74 + shellEdge * 0.26));
            }
            var bandDistance = shellDistance + Math.sin(shellX * 0.043 + shellY * 0.029) * 0.28;
            var bandPhase = bandDistance / lamellaPitch;
            var bandFraction = bandPhase - Math.floor(bandPhase);
            if (shellDistance <= shellLimit * 2.35
              && bandFraction > 0.43 && bandFraction < 0.57) {
              rgba[0] = 255;
              rgba[1] = 255;
              rgba[2] = 255;
              rgba[3] = Math.round(150 * shellStrength
                * (1 - shellDistance / Math.max(1, shellLimit * 2.7)));
            }


        });}
        lamellaCanvas.ctx.putImageData(lamellae, 0, 0);
        paintSurfaceMask(ctx, lamellaCanvas.canvas, highlight, 0.78,
          'bone-v36-lamellae-highlight');

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        var totalNodes = 0;
        var maximumNodes = 2600;

        function insideAt(x, y) {
          x = Math.max(0, Math.min(width - 1, Math.round(x)));
          y = Math.max(0, Math.min(height - 1, Math.round(y)));
          return !!field.inside[y * width + x];
        }

        function distanceAt(x, y) {
          x = Math.max(0, Math.min(width - 1, Math.round(x)));
          y = Math.max(0, Math.min(height - 1, Math.round(y)));
          return field.distance[y * width + x];
        }

        function segmentInside(a, b) {
          return insideAt(a.x * 0.75 + b.x * 0.25, a.y * 0.75 + b.y * 0.25)
            && insideAt((a.x + b.x) * 0.5, (a.y + b.y) * 0.5)
            && insideAt(a.x * 0.25 + b.x * 0.75, a.y * 0.25 + b.y * 0.75);
        }

        function traceTrabecula(a, b, bend, offset) {
          var dx = b.x - a.x, dy = b.y - a.y;
          var length = Math.sqrt(dx * dx + dy * dy) || 1;
          var nx = -dy / length, ny = dx / length;
          ctx.beginPath();
          ctx.moveTo(a.x + nx * offset, a.y + ny * offset);
          ctx.quadraticCurveTo((a.x + b.x) * 0.5 + nx * (bend + offset),
            (a.y + b.y) * 0.5 + ny * (bend + offset),
            b.x + nx * offset, b.y + ny * offset);
        }

        function strokeTrabecula(a, b, hierarchy, edgeIndex, localAlpha) {
          var depth = Math.min(a.distance, b.distance) / Math.max(1, cell);
          var plateWidth = Math.max(0.72 * pixelScale * L.s,
            weight * hierarchy * (0.92 + Math.min(2.8, depth) * 0.22));
          var bend = (hash(edgeIndex, a.seed, params.seed + 2129) * 2 - 1)
            * cell * warp * 0.075;
          var relief = Math.max(0.35 * pixelScale * L.s, plateWidth * 0.16);
          ctx.strokeStyle = shadow;
          ctx.globalAlpha = localAlpha * 0.56;
          ctx.lineWidth = plateWidth * 1.3;
          traceTrabecula(a, b, bend, relief);
          ctx.stroke();
          ctx.strokeStyle = effect;
          ctx.globalAlpha = localAlpha;
          ctx.lineWidth = plateWidth;
          traceTrabecula(a, b, bend, 0);
          ctx.stroke();
          ctx.strokeStyle = highlight;
          ctx.globalAlpha = localAlpha * 0.72;
          ctx.lineWidth = Math.max(0.34 * pixelScale * L.s, plateWidth * 0.2);
          traceTrabecula(a, b, bend, -relief * 0.74);
          ctx.stroke();
          if (plateWidth > 2.4 * pixelScale * L.s && marrow > 0.4) {
            ctx.strokeStyle = middle;
            ctx.globalAlpha = localAlpha * Math.min(0.5, 0.16 + marrow * 0.045);
            ctx.lineWidth = Math.max(0.25 * pixelScale * L.s, plateWidth * 0.09);
            traceTrabecula(a, b, bend, relief * 0.28);
            ctx.stroke();
          }
          a.degree++;
          b.degree++;
        }

        function drawOsteon(node, radius, localAlpha, angle, hubIndex) {
          radius = Math.max(0.7 * pixelScale * L.s, radius);
          var axis = 1.08 + Math.min(0.34, warp * 0.04);
          ctx.save();
          ctx.translate(node.x, node.y);
          ctx.rotate(angle);
          ctx.fillStyle = shadow;
          ctx.globalAlpha = localAlpha * 0.52;
          ctx.beginPath();
          ctx.ellipse(radius * 0.12, radius * 0.1, radius * axis * 1.12,
            radius * 0.98, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = effect;
          ctx.globalAlpha = localAlpha;
          ctx.beginPath();
          ctx.ellipse(0, 0, radius * axis, radius * 0.88, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = highlight;
          ctx.globalAlpha = localAlpha * 0.88;
          ctx.lineWidth = Math.max(0.35 * pixelScale * L.s, radius * 0.12);
          for (var ring = 0; ring < 2; ring++) {
            ctx.beginPath();
            ctx.ellipse(0, 0, radius * axis * (0.52 + ring * 0.25),
              radius * (0.43 + ring * 0.21), 0, 0, Math.PI * 2);
            ctx.stroke();
          }
          if (marrow > 0.05) {
            ctx.fillStyle = params.paper;
            ctx.globalAlpha = localAlpha * Math.min(0.98, 0.72 + marrow * 0.04);
            ctx.beginPath();
            ctx.ellipse(0, 0, radius * Math.min(0.42, 0.16 + marrow * 0.04),
              radius * Math.min(0.34, 0.12 + marrow * 0.032), 0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.strokeStyle = pale;
          ctx.globalAlpha = localAlpha * Math.min(0.66, 0.18 + branching * 0.06);
          ctx.lineWidth = Math.max(0.24 * pixelScale * L.s, radius * 0.055);
          var canalCount = Math.max(4, Math.min(10, 4 + Math.floor(branching * 0.75)));
          for (var canal = 0; canal < canalCount; canal++) {
            var canalAngle = canal * Math.PI * 2 / canalCount
              + hash(hubIndex, canal, params.seed + 2137) * 0.32;
            ctx.beginPath();
            ctx.moveTo(Math.cos(canalAngle) * radius * 0.48,
              Math.sin(canalAngle) * radius * 0.42);
            ctx.lineTo(Math.cos(canalAngle) * radius * (1.08 + marrow * 0.08),
              Math.sin(canalAngle) * radius * (0.94 + marrow * 0.07));
            ctx.stroke();
          }
          ctx.restore();
        }

        for (var metaIndex = 0; metaIndex < metas.length && totalNodes < maximumNodes; metaIndex++) {
          var meta = metas[metaIndex];
          var vertical = meta.halfH >= meta.halfW * 0.82;
          var principal = vertical ? Math.PI / 2 : 0;
          principal += (hash(meta.index, params.seed % 199, 2111) * 2 - 1)
            * Math.min(0.72, 0.08 + warp * 0.075);
          principal += Math.sin(phase + meta.index * 0.73) * Math.min(0.12, warp * 0.018);
          var cosA = Math.cos(principal), sinA = Math.sin(principal);
          var extent = Math.sqrt(meta.halfW * meta.halfW + meta.halfH * meta.halfH) * 1.08;
          var stepU = Math.max(weight * 2.05, cell * (0.58 + Math.min(6, marrow) * 0.025));
          var stepV = Math.max(weight * 2.25, cell * (0.72 + Math.min(6, marrow) * 0.04));
          var jitterReach = Math.min(stepU, stepV) * Math.min(0.28, warp * 0.045);
          var points = [];
          var pointMap = Object.create(null);
          var rowIndex = 0;
          for (var localV = -extent; localV <= extent && totalNodes < maximumNodes;
            localV += stepV, rowIndex++) {
            var columnIndex = 0;
            for (var localU = -extent + (rowIndex % 2 ? stepU * 0.5 : 0);
              localU <= extent && totalNodes < maximumNodes; localU += stepU, columnIndex++) {
              var pointSeed = rowIndex * 131 + columnIndex * 17 + meta.index * 1009;
              var jitterU = (hash(pointSeed, 7, params.seed + 2113) * 2 - 1) * jitterReach;
              var jitterV = (hash(pointSeed, 11, params.seed + 2117) * 2 - 1) * jitterReach;
              var pointX = meta.x + cosA * (localU + jitterU) - sinA * (localV + jitterV);
              var pointY = meta.y + sinA * (localU + jitterU) + cosA * (localV + jitterV);
              if (!insideAt(pointX, pointY)) continue;
              var pointDistance = distanceAt(pointX, pointY);
              if (pointDistance < Math.max(0.45, shellWidth * 0.26)) continue;
              var point = { x: pointX, y: pointY, distance: pointDistance,
                row: rowIndex, column: columnIndex, degree: 0, seed: pointSeed,
                strength: meta.strength };
              points.push(point);
              pointMap[rowIndex + ':' + columnIndex] = point;
              totalNodes++;
            }
          }
          if (!points.length) continue;

          function findGridNeighbour(node, rowDelta, columnDelta) {
            for (var reach = 1; reach <= 2; reach++) {
              var neighbour = pointMap[(node.row + rowDelta * reach) + ':'
                + (node.column + columnDelta * reach)];
              if (neighbour) return neighbour;
            }
            return null;
          }

          var edgeIndex = 0;
          var crossChance = Math.min(0.95, 0.18 + branching * 0.095);
          var diagonalChance = Math.min(0.78, Math.max(0, branching - 0.6) * 0.105);
          for (var pointIndex = 0; pointIndex < points.length; pointIndex++) {
            var node = points[pointIndex];
            var forward = findGridNeighbour(node, 0, 1);
            if (forward && segmentInside(node, forward)) {
              strokeTrabecula(node, forward, 1.28, edgeIndex++,
                cellAggregate.strength * meta.strength * 0.98);
            }
            var cross = findGridNeighbour(node, 1, 0);
            if (cross && segmentInside(node, cross)
              && hash(node.seed, cross.seed, params.seed + 2141) < crossChance) {
              strokeTrabecula(node, cross, 0.82, edgeIndex++,
                cellAggregate.strength * meta.strength * 0.82);
            }
            var diagonalDirection = (node.row + node.column + meta.index) % 2 ? 1 : -1;
            var diagonal = findGridNeighbour(node, 1, diagonalDirection);
            if (diagonal && segmentInside(node, diagonal)
              && hash(node.seed, diagonal.seed, params.seed + 2143) < diagonalChance) {
              strokeTrabecula(node, diagonal, 0.62, edgeIndex++,
                cellAggregate.strength * meta.strength * 0.68);
            }
          }

          var minimumHubRadius = Math.max(weight * 1.15, 0.7 * pixelScale * L.s);
          var maximumHubRadius = Math.max(minimumHubRadius, cell * 0.42);
          var osteonChance = Math.min(0.38, 0.08 + branching * 0.028 + marrow * 0.012);
          for (var hubIndex = 0; hubIndex < points.length; hubIndex++) {
            var hub = points[hubIndex];
            if (hub.degree < 3
              && hash(hub.seed, hub.degree, params.seed + 2147) >= osteonChance) continue;
            var hubRadius = Math.min(maximumHubRadius,
              Math.max(minimumHubRadius, joint * (0.28 + Math.min(5, hub.degree) * 0.055)));
            drawOsteon(hub, hubRadius,
              cellAggregate.strength * meta.strength * (hub.degree >= 3 ? 0.96 : 0.72),
              principal + (hash(hub.seed, 19, params.seed + 2153) * 2 - 1) * 0.34,
              hubIndex + meta.index * 101);
          }
        }

        // Preserve a tangible bone body even when an extremely large spacing
        // value leaves few interior nodes. The shell remains causal, while the
        // fallback bosses expose marrow and osteon scale instead of vanishing.
        if (totalNodes < metas.length) {
          for (var fallbackIndex = 0; fallbackIndex < metas.length; fallbackIndex++) {
            var fallbackMeta = metas[fallbackIndex];
            if (!insideAt(fallbackMeta.x, fallbackMeta.y)) continue;
            drawOsteon({ x: fallbackMeta.x, y: fallbackMeta.y },
              Math.min(cell * 0.4, Math.max(weight * 1.3, joint * 0.42)),
              cellAggregate.strength * fallbackMeta.strength * 0.86,
              hash(fallbackIndex, params.seed, 2159) * Math.PI, fallbackIndex);
          }
        }

        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(constructionMask, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderBoneLamellar(targetCtx, glyphs, width, height, pixelScale, L, fm,
        coverBase, cellAggregate, marrow, branching, weight, joint, warp) {
        var mask = buildSurfaceMask(glyphs, 'boneScaffold', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'boneScaffold', coverBase);
        // Geometry uses full coverage; the weighted live mask applies strength
        // once at the end. Low intensity must not change the cell topology.
        var fullMask = boneLamellarFullMask(glyphs, width, height, pixelScale, L, fm);
        var source;
        try { source = fullMask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height); }
        catch (error) { return; }
        var field = surfaceBoundaryDistance(source.data, width, height);
        if (!field.bounds) return;
        var units = Math.max(0.01, pixelScale * L.s);
        var cell = Math.max(2, cellAggregate.value * units);
        var seeds = boneLamellarSeeds(field, width, height, cell, warp, params.seed);
        var work = surfaceScratch('bone-lamellar-body', width, height, false);
        var image = work.ctx.createImageData(width, height), data = image.data;
        var rgb = surfaceHexRgb(surfaceEffectColor('boneScaffold'));
        var phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var lightX = -0.65 + Math.sin(phase) * Math.min(0.12, warp * 0.025);
        var lightY = -0.72;
        var shell = Math.max(0.65 * units, weight * 0.46);
        var pitch = Math.max(1.6 * units, cell * 0.1 + weight * 0.18);
        var b = field.bounds, neighborhoods = Object.create(null);
        for (var y = b[1]; y <= b[3]; y++) for (var x = b[0]; x <= b[2]; x++) {
          var index = y * width + x;
          if (!field.inside[index]) continue;
          var d = field.distance[index], nearest = null, q1 = Infinity, q2 = Infinity, nu = 0, nv = 0;
          var bx = Math.floor((x - seeds.x) / seeds.step), by = Math.floor((y - seeds.y) / seeds.step);
          var neighborhoodKey = bx + ':' + by, nearby = neighborhoods[neighborhoodKey];
          if (!nearby) {
            nearby = neighborhoods[neighborhoodKey] = [];
            for (var gy = -2; gy <= 2; gy++) for (var gx = -2; gx <= 2; gx++) {
              var bucket = seeds.buckets[(bx + gx) + ':' + (by + gy)];
              if (bucket) for (var bi = 0; bi < bucket.length; bi++) nearby.push(bucket[bi]);
            }
          }
          for (var n = 0; n < nearby.length; n++) {
              var point = nearby[n], dx = x - point.x, dy = y - point.y;
              var u = (dx * point.c + dy * point.s) / point.aspect;
              var v = -dx * point.s + dy * point.c;
              var q = Math.sqrt(u * u + v * v);
              if (q < q1) { q2 = q1; q1 = q; nearest = point; nu = u; nv = v; }
              else if (q < q2) q2 = q;
          }
          var alpha = 1, tone = -0.1;
          if (nearest) {
            var theta = Math.atan2(nv, nu);
            var irregularity = Math.min(0.17, 0.035 + warp * 0.025);
            var wave = Math.sin(theta * 3 + nearest.phase) * 0.65 + Math.sin(theta * 5 - nearest.phase) * 0.35;
            var radial = q1 * (1 + irregularity * wave);
            var osteonScale = 0.65 + Math.sqrt(Math.max(0, joint / units)) * 0.115;
            var canal = Math.min(nearest.depth * 0.65,
              Math.min(nearest.depth * 0.48, nearest.radius * (0.035 + marrow * 0.047)) * nearest.pore * osteonScale);
            var edge = radial - canal;
            // Porosity is actual alpha, never a paint stroke in the paper colour.
            var pore = Math.max(0, Math.min(1, (edge + 0.6 * units) / Math.max(0.8 * units, weight * 0.12)));
            var cortical = Math.max(0, Math.min(1, (shell + units - d) / units));
            alpha = marrow <= 0 ? 1 : Math.max(pore, cortical);
            var localPitch = pitch * nearest.pitch;
            var rings = (radial - canal) / localPitch;
            var ring = Math.sin(rings * Math.PI * 2);
            var territory = Math.max(0, Math.min(1, (nearest.radius * 1.25 - radial) / Math.max(1, nearest.radius * 0.35)));
            var cement = Math.max(0, 1 - (q2 - q1) / Math.max(0.6 * units, weight * 0.28));
            var radialX = (nu / nearest.aspect * nearest.c - nv * nearest.s) / Math.max(0.5, q1);
            var radialY = (nu / nearest.aspect * nearest.s + nv * nearest.c) / Math.max(0.5, q1);
            var slope = -ring * 0.22 * territory + Math.max(0, 1 - Math.abs(edge) / (units * 2.2)) * 0.72;
            var lighting = (radialX * lightX + radialY * lightY) * slope;
            tone = -0.16 + territory * (0.12 + Math.cos(rings * Math.PI * 2) * 0.10) + lighting - cement * 0.38;
            // Tangential lacunae and radial canaliculi are subordinate to the
            // vascular cavity. Their pitch follows the same lamellar coordinate.
            if (branching > 0 && edge > localPitch * 0.5 && territory > 0.1) {
              var count = Math.max(5, Math.min(28, 6 + Math.floor(branching * 2 + radial / localPitch * 0.7)));
              var angleCycle = (theta + nearest.phase) * count / (Math.PI * 2);
              var angular = Math.abs(angleCycle - Math.round(angleCycle)) * Math.PI * 2 * Math.max(1, radial) / count;
              var lamellar = Math.abs(rings - 0.45 - Math.round(rings - 0.45)) * localPitch;
              var pitWidth = Math.max(0.55 * units, Math.min(localPitch * 0.5, joint * 0.14));
              var pit = Math.max(0, 1 - angular / Math.max(0.5, pitWidth * 1.5))
                * Math.max(0, 1 - lamellar / Math.max(0.45 * units, pitWidth * 0.42));
              var canaliculus = Math.max(0, 1 - angular / Math.max(0.28 * units, pitWidth * 0.17));
              tone -= (pit * 0.52 + canaliculus * Math.min(0.2, branching * 0.025)) * territory;
            }
          } else {
            // Fine strokes with no viable osteon stay continuous, not missing.
            tone += Math.cos(d / pitch * Math.PI * 2) * 0.08;
          }
          var edgeLight = Math.max(0, 1 - d / Math.max(1, shell * 1.6));
          tone += edgeLight * 0.24;
          tone = Math.max(-0.78, Math.min(0.7, tone));
          var i = index * 4;
          for (var channel = 0; channel < 3; channel++) data[i + channel] = Math.round(tone > 0
            ? rgb[channel] + (255 - rgb[channel]) * tone : rgb[channel] * (1 + tone));
          data[i + 3] = Math.round(255 * alpha);
        }

        // Output pixels sample the fixed geometry and original glyph raster.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext;RC.field(image,function(px,py,rgba){var x=px-.5,y=py-.5;if(y<(b[1])||!(y <= b[3]))return;if(x<(b[0])||!(x <= b[2]))return;
          var index = Math.floor(y) * width + Math.floor(x);
          if (!(RC.sample(field.inside,width,height,x,y)>=.5)) return;
          var d = RC.sample(field.distance,width,height,x,y), nearest = null, q1 = Infinity, q2 = Infinity, nu = 0, nv = 0;
          var bx = Math.floor((x - seeds.x) / seeds.step), by = Math.floor((y - seeds.y) / seeds.step);
          var neighborhoodKey = bx + ':' + by, nearby = neighborhoods[neighborhoodKey];
          if (!nearby) {
            nearby = neighborhoods[neighborhoodKey] = [];
            for (var gy = -2; gy <= 2; gy++) for (var gx = -2; gx <= 2; gx++) {
              var bucket = seeds.buckets[(bx + gx) + ':' + (by + gy)];
              if (bucket) for (var bi = 0; bi < bucket.length; bi++) nearby.push(bucket[bi]);
            }
          }
          for (var n = 0; n < nearby.length; n++) {
              var point = nearby[n], dx = x - point.x, dy = y - point.y;
              var u = (dx * point.c + dy * point.s) / point.aspect;
              var v = -dx * point.s + dy * point.c;
              var q = Math.sqrt(u * u + v * v);
              if (q < q1) { q2 = q1; q1 = q; nearest = point; nu = u; nv = v; }
              else if (q < q2) q2 = q;
          }
          var alpha = 1, tone = -0.1;
          if (nearest) {
            var theta = Math.atan2(nv, nu);
            var irregularity = Math.min(0.17, 0.035 + warp * 0.025);
            var wave = Math.sin(theta * 3 + nearest.phase) * 0.65 + Math.sin(theta * 5 - nearest.phase) * 0.35;
            var radial = q1 * (1 + irregularity * wave);
            var osteonScale = 0.65 + Math.sqrt(Math.max(0, joint / units)) * 0.115;
            var canal = Math.min(nearest.depth * 0.65,
              Math.min(nearest.depth * 0.48, nearest.radius * (0.035 + marrow * 0.047)) * nearest.pore * osteonScale);
            var edge = radial - canal;
            // Porosity is actual alpha, never a paint stroke in the paper colour.
            var pore = Math.max(0, Math.min(1, (edge + 0.6 * units) / Math.max(0.8 * units, weight * 0.12)));
            var cortical = Math.max(0, Math.min(1, (shell + units - d) / units));
            alpha = marrow <= 0 ? 1 : Math.max(pore, cortical);
            var localPitch = pitch * nearest.pitch;
            var rings = (radial - canal) / localPitch;
            var ring = Math.sin(rings * Math.PI * 2);
            var territory = Math.max(0, Math.min(1, (nearest.radius * 1.25 - radial) / Math.max(1, nearest.radius * 0.35)));
            var cement = Math.max(0, 1 - (q2 - q1) / Math.max(0.6 * units, weight * 0.28));
            var radialX = (nu / nearest.aspect * nearest.c - nv * nearest.s) / Math.max(0.5, q1);
            var radialY = (nu / nearest.aspect * nearest.s + nv * nearest.c) / Math.max(0.5, q1);
            var slope = -ring * 0.22 * territory + Math.max(0, 1 - Math.abs(edge) / (units * 2.2)) * 0.72;
            var lighting = (radialX * lightX + radialY * lightY) * slope;
            tone = -0.16 + territory * (0.12 + Math.cos(rings * Math.PI * 2) * 0.10) + lighting - cement * 0.38;
            // Tangential lacunae and radial canaliculi are subordinate to the
            // vascular cavity. Their pitch follows the same lamellar coordinate.
            if (branching > 0 && edge > localPitch * 0.5 && territory > 0.1) {
              var count = Math.max(5, Math.min(28, 6 + Math.floor(branching * 2 + radial / localPitch * 0.7)));
              var angleCycle = (theta + nearest.phase) * count / (Math.PI * 2);
              var angular = Math.abs(angleCycle - Math.round(angleCycle)) * Math.PI * 2 * Math.max(1, radial) / count;
              var lamellar = Math.abs(rings - 0.45 - Math.round(rings - 0.45)) * localPitch;
              var pitWidth = Math.max(0.55 * units, Math.min(localPitch * 0.5, joint * 0.14));
              var pit = Math.max(0, 1 - angular / Math.max(0.5, pitWidth * 1.5))
                * Math.max(0, 1 - lamellar / Math.max(0.45 * units, pitWidth * 0.42));
              var canaliculus = Math.max(0, 1 - angular / Math.max(0.28 * units, pitWidth * 0.17));
              tone -= (pit * 0.52 + canaliculus * Math.min(0.2, branching * 0.025)) * territory;
            }
          } else {
            // Fine strokes with no viable osteon stay continuous, not missing.
            tone += Math.cos(d / pitch * Math.PI * 2) * 0.08;
          }
          var edgeLight = Math.max(0, 1 - d / Math.max(1, shell * 1.6));
          tone += edgeLight * 0.24;
          tone = Math.max(-0.78, Math.min(0.7, tone));
          var i = index * 4;
          for (var channel = 0; channel < 3; channel++) rgba[channel] = Math.round(tone > 0
            ? rgb[channel] + (255 - rgb[channel]) * tone : rgb[channel] * (1 + tone));
          rgba[3] = Math.round(255 * alpha);

        });}
        work.ctx.putImageData(image, 0, 0);
        work.ctx.globalCompositeOperation = 'destination-in';
        work.ctx.drawImage(mask, 0, 0);
        work.ctx.globalCompositeOperation = 'source-over';
        targetCtx.save(); targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderBoneScaffold(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var cellAggregate = surfaceAggregate(glyphs, 'boneScaffold', 'boneCell', params.boneCell);
        if (!cellAggregate.weight) return;
        var architecture = surfaceChoice(glyphs, 'boneScaffold', 'boneArchitecture', params.boneArchitecture, BATCH_PARAM_OPTIONS.boneArchitecture);
        var marrow = Math.max(0, surfaceAggregate(glyphs, 'boneScaffold', 'boneMarrow', params.boneMarrow).value);
        var branching = Math.max(0, surfaceAggregate(glyphs, 'boneScaffold', 'boneBranching', params.boneBranching).value);
        var weight = Math.max(0.2, surfaceAggregate(glyphs, 'boneScaffold', 'boneWeight', params.boneWeight).value * pixelScale * L.s);
        var joint = Math.max(0, surfaceAggregate(glyphs, 'boneScaffold', 'boneJoint', params.boneJoint).value * pixelScale * L.s);
        var warp = Math.max(0, surfaceAggregate(glyphs, 'boneScaffold', 'boneWarp', params.boneWarp).value);
        if (architecture === 'lamellar') {
          renderBoneLamellar(targetCtx, glyphs, width, height, pixelScale, L, fm,
            coverBase, cellAggregate, marrow, branching, weight, joint, warp);
          return;
        }
        if (architecture === 'trabecular') {
          renderBoneTrabecularV36(targetCtx, glyphs, width, height, pixelScale, L, fm,
            coverBase, cellAggregate, marrow, branching, weight, joint, warp);
          return;
        }
        var cell = Math.max(2, cellAggregate.value * pixelScale * L.s);
        var mask = buildSurfaceMask(glyphs, 'boneScaffold', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'boneScaffold', coverBase);
        var source;
        try { source = mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height); }
        catch (error) { return; }
        var field = surfaceBoundaryDistance(source.data, width, height);
        if (!field.bounds) return;
        var metas = surfaceGlyphAnatomyMetas(glyphs, 'boneScaffold', pixelScale, L);
        if (!metas.length) return;
        var work = surfaceScratch('bone-scaffold-structural', width, height, false);
        var ctx = work.ctx;
        var effect = surfaceEffectColor('boneScaffold');
        ctx.strokeStyle = effect;
        ctx.fillStyle = effect;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        var totalNodes = 0;
        var densityScale = Math.sqrt(Math.max(1, metas.length / 180));

        function insideAt(x, y) {
          x = Math.max(0, Math.min(width - 1, Math.round(x)));
          y = Math.max(0, Math.min(height - 1, Math.round(y)));
          return !!field.inside[y * width + x];
        }

        function distanceAt(x, y) {
          x = Math.max(0, Math.min(width - 1, Math.round(x)));
          y = Math.max(0, Math.min(height - 1, Math.round(y)));
          return field.distance[y * width + x];
        }

        function traceBonePath(a, b, bend, lineWidth, alpha, channelScale) {
          var dx = b.x - a.x, dy = b.y - a.y;
          var segmentLength = Math.sqrt(dx * dx + dy * dy) || 1;
          var normalX = -dy / segmentLength, normalY = dx / segmentLength;
          var middleX = (a.x + b.x) * 0.5 + normalX * bend;
          var middleY = (a.y + b.y) * 0.5 + normalY * bend;
          var corticalWidth = Math.max(0.55, lineWidth * (1.18 + Math.min(4, marrow) * 0.08));
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.quadraticCurveTo(middleX, middleY, b.x, b.y);
          ctx.strokeStyle = effect;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = corticalWidth;
          ctx.stroke();
          if (marrow > 0.005 && corticalWidth > 1) {
            ctx.strokeStyle = params.paper;
            ctx.globalAlpha = alpha * Math.min(0.98, 0.78 + marrow * 0.045);
            ctx.lineWidth = Math.max(0.42, corticalWidth * Math.min(0.68,
              (0.1 + marrow * 0.13) * (channelScale == null ? 1 : channelScale)));
            ctx.stroke();
            ctx.strokeStyle = effect;
          }
        }

        function drawBoneJoint(node, radius, alpha, angle, terminal) {
          if (radius <= 0.05) return;
          var longAxis = terminal ? 1.5 : 1.08;
          var shortAxis = terminal ? 0.66 : 0.86;
          ctx.save();
          ctx.translate(node.x, node.y);
          ctx.rotate(angle || 0);
          ctx.globalAlpha = alpha;
          ctx.fillStyle = effect;
          ctx.beginPath();
          ctx.ellipse(0, 0, radius * longAxis, radius * shortAxis, 0, 0, Math.PI * 2);
          ctx.fill();
          if (marrow > 0.005 && radius > 1.2) {
            ctx.globalAlpha = alpha * Math.min(0.94, 0.7 + marrow * 0.06);
            ctx.fillStyle = params.paper;
            ctx.beginPath();
            ctx.ellipse(0, 0, radius * longAxis * Math.min(0.62, 0.22 + marrow * 0.08),
              radius * shortAxis * Math.min(0.54, 0.18 + marrow * 0.07), 0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
          ctx.fillStyle = effect;
        }

        function sampleSlice(meta, vertical, axisPosition) {
          var crossMin = vertical ? meta.x - meta.halfW : meta.y - meta.halfH;
          var crossMax = vertical ? meta.x + meta.halfW : meta.y + meta.halfH;
          var nodes = [];
          var inRun = false, bestCross = 0, bestDistance = -1;
          var scanStep = Math.max(1, Math.min(2, pixelScale * L.s));
          for (var cross = crossMin; cross <= crossMax + scanStep; cross += scanStep) {
            var x = vertical ? cross : axisPosition;
            var y = vertical ? axisPosition : cross;
            var occupied = cross <= crossMax && insideAt(x, y);
            if (occupied) {
              inRun = true;
              var localDistance = distanceAt(x, y);
              if (localDistance > bestDistance) {
                bestDistance = localDistance;
                bestCross = cross;
              }
            } else if (inRun) {
              if (bestDistance >= Math.max(0.45, weight * 0.08)) {
                var nodeX = vertical ? bestCross : axisPosition;
                var nodeY = vertical ? axisPosition : bestCross;
                var jitter = Math.min(bestDistance * 0.24, cell * 0.16) * warp
                  * (hash(Math.round(nodeX), Math.round(nodeY), params.seed + 1949) * 2 - 1);
                if (vertical) nodeX += jitter; else nodeY += jitter;
                nodes.push({ x: nodeX, y: nodeY, distance: bestDistance,
                  axis: axisPosition, cross: bestCross, strength: meta.strength, track: -1 });
              }
              inRun = false;
              bestCross = 0;
              bestDistance = -1;
            }
          }
          return nodes;
        }

        for (var metaIndex = 0; metaIndex < metas.length && totalNodes < 3600; metaIndex++) {
          var meta = metas[metaIndex];
          var vertical = meta.halfH >= meta.halfW * 0.78;
          var axisMin = vertical ? meta.y - meta.halfH : meta.x - meta.halfW;
          var axisMax = vertical ? meta.y + meta.halfH : meta.x + meta.halfW;
          var axisSpan = Math.max(1, axisMax - axisMin);
          var sliceStep = Math.max(3 * pixelScale * L.s,
            cell * densityScale * (architecture === 'spine' ? 0.68 : architecture === 'truss' ? 0.56 : 0.62));
          sliceStep = Math.min(sliceStep, Math.max(3, axisSpan * 0.34));
          var tracks = [];
          var previous = [];
          for (var axis = axisMin + sliceStep * 0.36; axis <= axisMax; axis += sliceStep) {
            var current = sampleSlice(meta, vertical, axis);
            totalNodes += current.length;
            var usedPrevious = Object.create(null);
            for (var currentIndex = 0; currentIndex < current.length; currentIndex++) {
              var currentNode = current[currentIndex];
              var bestPrevious = null, bestPreviousIndex = -1, bestScore = Infinity;
              for (var previousIndex = 0; previousIndex < previous.length; previousIndex++) {
                if (usedPrevious[previousIndex]) continue;
                var previousNode = previous[previousIndex];
                var crossDifference = Math.abs(currentNode.cross - previousNode.cross);
                var depthDifference = Math.abs(currentNode.distance - previousNode.distance);
                var trackingScore = crossDifference + depthDifference * 0.32;
                var trackingReach = cell * (1.08 + Math.min(4, branching) * 0.16)
                  + Math.min(currentNode.distance, previousNode.distance) * 0.72;
                if (trackingScore < bestScore && crossDifference <= trackingReach) {
                  bestPrevious = previousNode;
                  bestPreviousIndex = previousIndex;
                  bestScore = trackingScore;
                }
              }
              if (bestPrevious) {
                currentNode.track = bestPrevious.track;
                tracks[currentNode.track].nodes.push(currentNode);
                tracks[currentNode.track].score += currentNode.distance;
                usedPrevious[bestPreviousIndex] = true;
              } else {
                currentNode.track = tracks.length;
                tracks.push({ nodes: [currentNode], score: currentNode.distance });
              }
            }
            previous = current;
            if (totalNodes >= 3600) break;
          }
          if (!tracks.length) continue;
          tracks.sort(function (left, right) {
            return (right.nodes.length * 2 + right.score / Math.max(1, cell))
              - (left.nodes.length * 2 + left.score / Math.max(1, cell));
          });
          var trackLimit = architecture === 'spine' ? 1 : architecture === 'ribcage' ? 2
            : architecture === 'truss' ? 2 : Math.max(2, Math.min(5, 2 + Math.floor(branching * 0.75)));
          var selectedTracks = tracks.slice(0, trackLimit);
          var primary = selectedTracks[0];
          var metaAlpha = cellAggregate.strength * meta.strength;

          for (var trackIndex = 0; trackIndex < selectedTracks.length; trackIndex++) {
            var track = selectedTracks[trackIndex];
            var hierarchy = trackIndex === 0 ? 1 : 0.55 + Math.min(0.28, branching * 0.07);
            for (var segmentIndex = 1; segmentIndex < track.nodes.length; segmentIndex++) {
              var a = track.nodes[segmentIndex - 1];
              var b = track.nodes[segmentIndex];
              var middleInside = insideAt((a.x + b.x) * 0.5, (a.y + b.y) * 0.5);
              if (!middleInside) continue;
              var segmentBend = (hash(meta.index, trackIndex * 97 + segmentIndex, params.seed + 1951) * 2 - 1)
                * cell * warp * 0.14;
              var localDepth = Math.min(a.distance, b.distance) / Math.max(1, cell);
              var localWidth = weight * hierarchy * (1.45 + Math.min(2.5, localDepth) * 0.22);
              traceBonePath(a, b, segmentBend, localWidth,
                metaAlpha * (trackIndex ? 0.68 : 0.96), trackIndex ? 0.72 : 1);
            }
            if (track.nodes.length === 1) {
              drawBoneJoint(track.nodes[0], Math.max(weight * 1.1, joint * 0.36), metaAlpha * 0.82, 0, true);
            }
          }

          if (!primary || !primary.nodes.length) continue;
          var primaryNodes = primary.nodes;
          var axisAngle = vertical ? Math.PI / 2 : 0;
          if (architecture === 'spine') {
            drawBoneJoint(primaryNodes[0], Math.max(weight * 1.15, joint * 0.48), metaAlpha, axisAngle, true);
            if (primaryNodes.length > 1) drawBoneJoint(primaryNodes[primaryNodes.length - 1],
              Math.max(weight * 1.15, joint * 0.48), metaAlpha, axisAngle, true);
          }

          if (architecture === 'ribcage' || architecture === 'adaptive') {
            var ribStride = Math.max(1, Math.round(3 - Math.min(3, branching) * 0.58));
            for (var ribIndex = 1; ribIndex < primaryNodes.length - 1; ribIndex += ribStride) {
              var ribNode = primaryNodes[ribIndex];
              var normalX = vertical ? 1 : 0;
              var normalY = vertical ? 0 : 1;
              var ribReach = Math.min(vertical ? meta.halfW * 0.82 : meta.halfH * 0.82,
                Math.max(weight * 2.1, ribNode.distance * (1.05 + Math.min(4, branching) * 0.08)));
              var ribBend = cell * (0.1 + Math.min(4, branching) * 0.035)
                * ((ribIndex + meta.index) % 2 ? -1 : 1);
              for (var ribSide = -1; ribSide <= 1; ribSide += 2) {
                var ribEnd = { x: ribNode.x + normalX * ribReach * ribSide,
                  y: ribNode.y + normalY * ribReach * ribSide };
                var shrink = 0;
                while (!insideAt(ribEnd.x, ribEnd.y) && shrink < 5) {
                  ribReach *= 0.78;
                  ribEnd.x = ribNode.x + normalX * ribReach * ribSide;
                  ribEnd.y = ribNode.y + normalY * ribReach * ribSide;
                  shrink++;
                }
                if (ribReach > weight * 0.9) traceBonePath(ribNode, ribEnd,
                  ribBend * ribSide, weight * (architecture === 'ribcage' ? 0.92 : 0.62),
                  metaAlpha * (architecture === 'ribcage' ? 0.88 : 0.58), 0.72);
              }
              drawBoneJoint(ribNode, Math.max(weight * 0.78, joint * 0.32), metaAlpha * 0.9,
                axisAngle, false);
            }
          }

          if (architecture === 'ribcage' && selectedTracks.length > 1) {
            // Separate stems become one cage only where the source glyph
            // supplies an occupied crossbar. This turns H, 骨 and similar
            // multi-stem forms into articulated skeletons without bridging
            // counters or jumping between letters.
            for (var cageTrackIndex = 1; cageTrackIndex < selectedTracks.length; cageTrackIndex++) {
              var cageTrack = selectedTracks[cageTrackIndex];
              var cageCandidates = [];
              for (var cagePrimaryIndex = 0; cagePrimaryIndex < primaryNodes.length; cagePrimaryIndex++) {
                for (var cageSecondaryIndex = 0; cageSecondaryIndex < cageTrack.nodes.length; cageSecondaryIndex++) {
                  var cageA = primaryNodes[cagePrimaryIndex];
                  var cageB = cageTrack.nodes[cageSecondaryIndex];
                  var cageDx = cageB.x - cageA.x, cageDy = cageB.y - cageA.y;
                  var cageDistanceSq = cageDx * cageDx + cageDy * cageDy;
                  if (cageDistanceSq > Math.pow(cell * (2.4 + branching * 0.2), 2)) continue;
                  if (!insideAt((cageA.x + cageB.x) * 0.5, (cageA.y + cageB.y) * 0.5)) continue;
                  cageCandidates.push({ a: cageA, b: cageB, distanceSq: cageDistanceSq,
                    axis: (cageA.axis + cageB.axis) * 0.5 });
                }
              }
              cageCandidates.sort(function (left, right) { return left.distanceSq - right.distanceSq; });
              var cageUsedAxes = [];
              var cageLimit = Math.min(3, 1 + Math.floor(branching * 0.7));
              for (var cageCandidateIndex = 0;
                cageCandidateIndex < cageCandidates.length && cageUsedAxes.length < cageLimit;
                cageCandidateIndex++) {
                var cageCandidate = cageCandidates[cageCandidateIndex];
                var cageSeparated = true;
                for (var cageAxisIndex = 0; cageAxisIndex < cageUsedAxes.length; cageAxisIndex++) {
                  if (Math.abs(cageCandidate.axis - cageUsedAxes[cageAxisIndex]) < cell * 1.15) {
                    cageSeparated = false;
                    break;
                  }
                }
                if (!cageSeparated) continue;
                traceBonePath(cageCandidate.a, cageCandidate.b,
                  (cageUsedAxes.length % 2 ? -1 : 1) * cell * warp * 0.12,
                  weight * 0.9, metaAlpha * 0.9, 0.76);
                drawBoneJoint(cageCandidate.a, Math.max(weight * 0.72, joint * 0.28),
                  metaAlpha * 0.86, axisAngle, false);
                drawBoneJoint(cageCandidate.b, Math.max(weight * 0.72, joint * 0.28),
                  metaAlpha * 0.86, axisAngle, false);
                cageUsedAxes.push(cageCandidate.axis);
              }
            }
          }

          if (architecture === 'truss') {
            var previousLeft = null, previousRight = null;
            for (var trussIndex = 0; trussIndex < primaryNodes.length; trussIndex++) {
              var trussNode = primaryNodes[trussIndex];
              var trussNormalX = vertical ? 1 : 0;
              var trussNormalY = vertical ? 0 : 1;
              var trussReach = Math.min(vertical ? meta.halfW * 0.72 : meta.halfH * 0.72,
                Math.max(weight * 1.8, trussNode.distance * 0.86));
              var leftNode = { x: trussNode.x - trussNormalX * trussReach,
                y: trussNode.y - trussNormalY * trussReach };
              var rightNode = { x: trussNode.x + trussNormalX * trussReach,
                y: trussNode.y + trussNormalY * trussReach };
              if (insideAt(leftNode.x, leftNode.y)) traceBonePath(trussNode, leftNode, 0,
                weight * 0.62, metaAlpha * 0.72, 0.55);
              if (insideAt(rightNode.x, rightNode.y)) traceBonePath(trussNode, rightNode, 0,
                weight * 0.62, metaAlpha * 0.72, 0.55);
              if (previousLeft && previousRight) {
                var diagonalStart = trussIndex % 2 ? previousLeft : previousRight;
                var diagonalEnd = trussIndex % 2 ? rightNode : leftNode;
                if (insideAt((diagonalStart.x + diagonalEnd.x) * 0.5,
                  (diagonalStart.y + diagonalEnd.y) * 0.5)) traceBonePath(diagonalStart,
                    diagonalEnd, 0, weight * 0.48, metaAlpha * 0.58, 0.45);
              }
              previousLeft = leftNode;
              previousRight = rightNode;
            }
          }

          if (architecture === 'adaptive' && selectedTracks.length > 1) {
            for (var bridgeTrackIndex = 1; bridgeTrackIndex < selectedTracks.length; bridgeTrackIndex++) {
              var bridgeTrack = selectedTracks[bridgeTrackIndex];
              if (!bridgeTrack.nodes.length) continue;
              var bridgeNode = bridgeTrack.nodes[Math.floor(bridgeTrack.nodes.length * 0.5)];
              var nearestPrimary = primaryNodes[0], nearestDistance = Infinity;
              for (var nearestIndex = 0; nearestIndex < primaryNodes.length; nearestIndex++) {
                var nearestDx = primaryNodes[nearestIndex].x - bridgeNode.x;
                var nearestDy = primaryNodes[nearestIndex].y - bridgeNode.y;
                var nearestSq = nearestDx * nearestDx + nearestDy * nearestDy;
                if (nearestSq < nearestDistance) {
                  nearestDistance = nearestSq;
                  nearestPrimary = primaryNodes[nearestIndex];
                }
              }
              if (nearestPrimary && insideAt((nearestPrimary.x + bridgeNode.x) * 0.5,
                (nearestPrimary.y + bridgeNode.y) * 0.5)) {
                traceBonePath(nearestPrimary, bridgeNode,
                  (bridgeTrackIndex % 2 ? -1 : 1) * cell * warp * 0.12,
                  weight * 0.58, metaAlpha * 0.62, 0.58);
                drawBoneJoint(nearestPrimary, Math.max(weight * 0.7, joint * 0.25),
                  metaAlpha * 0.72, axisAngle, false);
              }
            }
          }
        }

        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(mask, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderRoseEngine(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var petalAggregate = surfaceAggregate(glyphs, 'roseEngine', 'rosePetals', params.rosePetals);
        if (!petalAggregate.weight) return;
        var core = surfaceChoice(glyphs, 'roseEngine', 'roseCore', params.roseCore, BATCH_PARAM_OPTIONS.roseCore);
        var interlace = surfaceAggregate(glyphs, 'roseEngine', 'roseInterlace', params.roseInterlace).value;
        var petals = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('rosePetals', Math.round(petalAggregate.value), 0, 3, 32) : Math.max(3, Math.min(32, Math.round(petalAggregate.value))));
        var rings = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('roseRings', Math.round(surfaceAggregate(glyphs, 'roseEngine', 'roseRings', params.roseRings).value), 0, 1, 8) : Math.max(1, Math.min(8, Math.round(surfaceAggregate(glyphs, 'roseEngine', 'roseRings', params.roseRings).value))));
        var radius = Math.max(1, surfaceAggregate(glyphs, 'roseEngine', 'roseRadius', params.roseRadius).value * pixelScale * L.s);
        var warp = surfaceAggregate(glyphs, 'roseEngine', 'roseWarp', params.roseWarp).value;
        var stroke = Math.max(0.2, surfaceAggregate(glyphs, 'roseEngine', 'roseStroke', params.roseStroke).value * pixelScale * L.s);
        var mask = buildSurfaceMask(glyphs, 'roseEngine', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'roseEngine', coverBase);
        var nodes = surfaceNodesForGlyphs(glyphs, 'roseEngine', 96, pixelScale, L, 0, 0, 0);
        if (!nodes.length) return;
        var centerX = 0, centerY = 0, totalWeight = 0;
        for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
          var nodeWeight = 0.25 + nodes[nodeIndex].strength * 0.75;
          centerX += nodes[nodeIndex].x * nodeWeight;
          centerY += nodes[nodeIndex].y * nodeWeight;
          totalWeight += nodeWeight;
        }
        centerX /= totalWeight || 1;
        centerY /= totalWeight || 1;
        var clusterSpread = 0;
        for (var spreadIndex = 0; spreadIndex < nodes.length; spreadIndex++) {
          var spreadX = nodes[spreadIndex].x - centerX;
          var spreadY = nodes[spreadIndex].y - centerY;
          clusterSpread = Math.max(clusterSpread, Math.sqrt(spreadX * spreadX + spreadY * spreadY) + nodes[spreadIndex].r * 0.35);
        }
        var outerRadius = radius + Math.min(radius * 0.72, clusterSpread * 0.18);
        var phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 / petals : 0;
        // Petals, rings, source warp and the project seed select a coherent
        // tracery grammar. This keeps the centre generative without adding
        // another opaque mode selector to the already dense panel.
        var topology = core === 'oculus' ? 0 : core === 'foil' ? 1 : core === 'compass' ? 2
          : core === 'knot' ? 3 : core === 'rosette' ? 4
            : Math.floor(hash(petals + Math.round(Math.abs(warp) * 7), rings + nodes.length,
              params.seed + 1841) * 5);
        var work = surfaceScratch('rose-engine', width, height, false);
        var ctx = work.ctx;
        var roseInk = surfaceEffectColor('roseEngine');
        ctx.strokeStyle = roseInk;
        ctx.fillStyle = roseInk;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = stroke;
        ctx.globalAlpha = petalAggregate.strength;
        var sector = Math.PI * 2 / petals;
        var tipPoints = [];
        var ringTipSets = [];

        function strokeRoseCurrentPath(structuralWidth, railWidth, alpha, hollowRatio) {
          structuralWidth = Math.max(railWidth, structuralWidth);
          railWidth = Math.max(0.2, railWidth);
          ctx.strokeStyle = roseInk;
          ctx.globalAlpha = petalAggregate.strength * alpha * 0.2;
          ctx.lineWidth = structuralWidth;
          ctx.stroke();
          if (hollowRatio > 0.02 && structuralWidth > railWidth * 1.45) {
            ctx.strokeStyle = params.paper;
            ctx.globalAlpha = petalAggregate.strength * alpha * 0.96;
            ctx.lineWidth = Math.max(0.2, structuralWidth * hollowRatio);
            ctx.stroke();
          }
          ctx.strokeStyle = roseInk;
          ctx.globalAlpha = petalAggregate.strength * alpha;
          ctx.lineWidth = railWidth;
          ctx.stroke();
        }

        function drawRoseBoss(x, y, radius, alpha, angle) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(angle || 0);
          ctx.globalAlpha = petalAggregate.strength * alpha;
          ctx.fillStyle = roseInk;
          ctx.beginPath();
          ctx.moveTo(0, -radius);
          ctx.lineTo(radius * 0.72, 0);
          ctx.lineTo(0, radius);
          ctx.lineTo(-radius * 0.72, 0);
          ctx.closePath();
          ctx.fill();
          if (radius > stroke * 1.4) {
            ctx.globalAlpha = petalAggregate.strength * alpha * 0.82;
            ctx.fillStyle = params.paper;
            ctx.beginPath();
            ctx.arc(0, 0, radius * 0.26, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
          ctx.fillStyle = roseInk;
        }

        function tracePolarStar(pointCount, innerRadius, outerStarRadius, rotation) {
          ctx.beginPath();
          for (var pointIndex = 0; pointIndex < pointCount * 2; pointIndex++) {
            var pointRadius = pointIndex % 2 ? innerRadius : outerStarRadius;
            var pointAngle = rotation + pointIndex * Math.PI / pointCount;
            var pointX = centerX + Math.cos(pointAngle) * pointRadius;
            var pointY = centerY + Math.sin(pointAngle) * pointRadius;
            if (!pointIndex) ctx.moveTo(pointX, pointY); else ctx.lineTo(pointX, pointY);
          }
          ctx.closePath();
          strokeRoseCurrentPath(stroke * 3.8, stroke * 0.74, 0.9, 0.5);
        }

        function tracePointedPetal(baseRadius, tipRadius, angle, halfAngle) {
          var leftX = centerX + Math.cos(angle - halfAngle) * baseRadius;
          var leftY = centerY + Math.sin(angle - halfAngle) * baseRadius;
          var rightX = centerX + Math.cos(angle + halfAngle) * baseRadius;
          var rightY = centerY + Math.sin(angle + halfAngle) * baseRadius;
          var tipX = centerX + Math.cos(angle) * tipRadius;
          var tipY = centerY + Math.sin(angle) * tipRadius;
          var shoulderRadius = baseRadius + (tipRadius - baseRadius) * 0.56;
          ctx.beginPath();
          ctx.moveTo(leftX, leftY);
          ctx.quadraticCurveTo(centerX + Math.cos(angle - halfAngle * 0.48) * shoulderRadius,
            centerY + Math.sin(angle - halfAngle * 0.48) * shoulderRadius, tipX, tipY);
          ctx.quadraticCurveTo(centerX + Math.cos(angle + halfAngle * 0.48) * shoulderRadius,
            centerY + Math.sin(angle + halfAngle * 0.48) * shoulderRadius, rightX, rightY);
          strokeRoseCurrentPath(stroke * 3.1, stroke * 0.68, 0.82, 0.48);
        }

        function drawRoseHub(hubRadius) {
          ctx.save();
          ctx.globalAlpha = petalAggregate.strength * 0.9;
          ctx.lineWidth = Math.max(0.2, stroke * 1.42);
          if (topology === 0) {
            // Oculus: concentric glass rings crossed by a restrained compass.
            for (var oculusRing = 0; oculusRing < 3; oculusRing++) {
              ctx.beginPath();
              ctx.arc(centerX, centerY, hubRadius * (0.58 + oculusRing * 0.58), 0, Math.PI * 2);
              ctx.stroke();
            }
            var oculusSpokes = Math.max(4, Math.min(12, Math.round(petals / 2)));
            for (var oculusSpoke = 0; oculusSpoke < oculusSpokes; oculusSpoke++) {
              var oculusAngle = phase + oculusSpoke * Math.PI * 2 / oculusSpokes;
              ctx.beginPath();
              ctx.moveTo(centerX + Math.cos(oculusAngle) * hubRadius * 0.58,
                centerY + Math.sin(oculusAngle) * hubRadius * 0.58);
              ctx.lineTo(centerX + Math.cos(oculusAngle) * hubRadius * 1.72,
                centerY + Math.sin(oculusAngle) * hubRadius * 1.72);
              ctx.stroke();
            }
          } else if (topology === 1) {
            // Foil: three to six rounded lobes around a small eye.
            var foilCount = 3 + (petals + rings) % 4;
            for (var foil = 0; foil < foilCount; foil++) {
              var foilAngle = phase + foil * Math.PI * 2 / foilCount;
              var foilCenterX = centerX + Math.cos(foilAngle) * hubRadius * 0.88;
              var foilCenterY = centerY + Math.sin(foilAngle) * hubRadius * 0.88;
              ctx.beginPath();
              ctx.ellipse(foilCenterX, foilCenterY, hubRadius * 0.76, hubRadius * 0.42,
                foilAngle, 0, Math.PI * 2);
              ctx.stroke();
            }
            ctx.beginPath();
            ctx.arc(centerX, centerY, hubRadius * 0.42, 0, Math.PI * 2);
            ctx.stroke();
          } else if (topology === 2) {
            // Compass: nested hard stars produce a clearly different centre.
            var starPoints = Math.max(4, Math.min(12, Math.round(petals / 2)));
            tracePolarStar(starPoints, hubRadius * 0.48, hubRadius * 1.9, phase - Math.PI / 2);
            ctx.globalAlpha = petalAggregate.strength * 0.56;
            tracePolarStar(starPoints, hubRadius * 0.8, hubRadius * 1.36,
              phase - Math.PI / 2 + Math.PI / starPoints);
            ctx.beginPath();
            ctx.arc(centerX, centerY, hubRadius * 0.3, 0, Math.PI * 2);
            ctx.stroke();
          } else if (topology === 3) {
            // Spiral knot: several expanding arms cross without becoming a ring.
            var spiralArms = 2 + (rings % 3);
            for (var arm = 0; arm < spiralArms; arm++) {
              ctx.beginPath();
              for (var spiralStep = 0; spiralStep < 28; spiralStep++) {
                var spiralT = spiralStep / 27;
                var spiralRadius = hubRadius * (0.22 + spiralT * 1.72);
                var spiralAngle = phase + arm * Math.PI * 2 / spiralArms
                  + spiralT * Math.PI * (1.25 + Math.min(1.2, Math.abs(warp)) * 0.34);
                var spiralX = centerX + Math.cos(spiralAngle) * spiralRadius;
                var spiralY = centerY + Math.sin(spiralAngle) * spiralRadius;
                if (!spiralStep) ctx.moveTo(spiralX, spiralY); else ctx.lineTo(spiralX, spiralY);
              }
              ctx.stroke();
            }
            ctx.beginPath();
            ctx.arc(centerX, centerY, hubRadius * 0.34, 0, Math.PI * 2);
            ctx.stroke();
          } else {
            // Rosette: a second, miniature lancet window occupies the hub.
            var rosetteCount = Math.max(5, Math.min(16, petals));
            for (var rosette = 0; rosette < rosetteCount; rosette++) {
              tracePointedPetal(hubRadius * 0.36, hubRadius * 1.9,
                phase + rosette * Math.PI * 2 / rosetteCount, Math.PI * 0.32 / rosetteCount);
            }
            ctx.beginPath();
            ctx.arc(centerX, centerY, hubRadius * 0.32, 0, Math.PI * 2);
            ctx.stroke();
          }
          drawRoseBoss(centerX, centerY, Math.max(stroke * 1.7, hubRadius * 0.24),
            0.96, phase + Math.PI / 4);
          ctx.restore();
        }

        function traceRoseEngineRail(railX, railY, railRadius, railLobes, railPhase,
          railModulation, railWeight, railAlpha, railAspect) {
          railAspect = railAspect == null ? 1 : railAspect;
          var railSteps = Math.max(96, Math.min(360, Math.round(railLobes * 20)));
          var secondaryLobes = Math.max(1, railLobes - 2 + (rings % 3));
          ctx.beginPath();
          for (var railStep = 0; railStep <= railSteps; railStep++) {
            var railAngle = railStep / railSteps * Math.PI * 2;
            var railWave = Math.sin(railAngle * railLobes + railPhase) * railModulation
              + Math.sin(railAngle * secondaryLobes - railPhase * 0.73) * railModulation * 0.31;
            var railEpicycle = railRadius * railModulation * 0.2;
            var railDistance = railRadius * (1 + railWave);
            var railPointX = railX + Math.cos(railAngle) * railDistance
              + Math.cos(railAngle * (railLobes * 0.5 + 1) + railPhase) * railEpicycle;
            var railPointY = railY + Math.sin(railAngle) * railDistance * railAspect
              + Math.sin(railAngle * (railLobes * 0.5 + 1) + railPhase) * railEpicycle * railAspect;
            if (!railStep) ctx.moveTo(railPointX, railPointY); else ctx.lineTo(railPointX, railPointY);
          }
          ctx.closePath();
          // Plate-like cores keep a heavier solid mullion; bar-tracery cores
          // open a paper channel between two crisp rails.
          var railStructure = Math.min(railRadius * 0.18,
            railWeight * (4.2 + Math.min(4, interlace) * 0.62));
          strokeRoseCurrentPath(railStructure, railWeight, railAlpha,
            topology === 0 || topology === 2 ? 0.3 : 0.54);
        }

        function traceRoseConnection(satellite, connectionIndex, hubRadius) {
          var connectionDx = satellite.x - centerX;
          var connectionDy = satellite.y - centerY;
          var connectionDistance = Math.max(0.001,
            Math.sqrt(connectionDx * connectionDx + connectionDy * connectionDy));
          var connectionUx = connectionDx / connectionDistance;
          var connectionUy = connectionDy / connectionDistance;
          var connectionNx = -connectionUy;
          var connectionNy = connectionUx;
          var connectionSpread = Math.max(stroke * 1.8,
            Math.min(satellite.r * 0.38, outerRadius * (0.025 + interlace * 0.006)));
          var connectionBend = (connectionIndex % 2 ? -1 : 1)
            * connectionSpread * (1.2 + Math.abs(warp) * 0.28);
          for (var connectionSide = -1; connectionSide <= 1; connectionSide += 2) {
            var connectionStartX = centerX + connectionUx * hubRadius * 1.28
              + connectionNx * connectionSpread * connectionSide;
            var connectionStartY = centerY + connectionUy * hubRadius * 1.28
              + connectionNy * connectionSpread * connectionSide;
            var connectionEndX = satellite.x - connectionUx * satellite.r * 0.84
              + connectionNx * connectionSpread * connectionSide * 0.62;
            var connectionEndY = satellite.y - connectionUy * satellite.r * 0.84
              + connectionNy * connectionSpread * connectionSide * 0.62;
            var connectionMidX = (connectionStartX + connectionEndX) * 0.5
              + connectionNx * connectionBend * connectionSide;
            var connectionMidY = (connectionStartY + connectionEndY) * 0.5
              + connectionNy * connectionBend * connectionSide;
            ctx.beginPath();
            ctx.moveTo(connectionStartX, connectionStartY);
            ctx.quadraticCurveTo(connectionMidX, connectionMidY, connectionEndX, connectionEndY);
            strokeRoseCurrentPath(stroke * (3.8 + interlace * 0.42),
              stroke * 0.62, 0.78, 0.5);
          }
        }

        if (interlace > 0.005) {
          // The evolved path is one articulated rose-window ensemble: clear
          // concentric stone rings plus braided radial ribs. It deliberately
          // bypasses the legacy tip-polygons and glyph-to-tip starburst below.
          var evolvedPreviousRadius = Math.max(stroke * 3.2,
            outerRadius / Math.max(7, petals * 1.08));
          for (var evolvedRing = 0; evolvedRing < rings; evolvedRing++) {
            var evolvedOuter = outerRadius * (evolvedRing + 1) / rings;
            var evolvedPhase = phase + (evolvedRing % 2 ? sector * 0.5 : 0)
              + evolvedRing * sector * (topology === 3 ? 0.14 : 0.055) * (warp < 0 ? -1 : 1);
            var evolvedGap = Math.max(stroke * 1.35,
              (evolvedOuter - evolvedPreviousRadius) * Math.min(0.16, 0.055 + interlace * 0.018));
            var evolvedModulation = Math.min(0.18, 0.012 + interlace * 0.014
              + Math.abs(warp) * 0.024 + evolvedRing * 0.003);
            var evolvedCenterShift = outerRadius * Math.min(0.075,
              Math.abs(warp) * 0.018 + interlace * 0.006) * (evolvedRing / Math.max(1, rings));
            var evolvedCenterX = centerX + Math.cos(evolvedPhase * 1.7 + evolvedRing * 2.1) * evolvedCenterShift;
            var evolvedCenterY = centerY + Math.sin(evolvedPhase * 1.3 - evolvedRing * 1.6) * evolvedCenterShift;
            traceRoseEngineRail(evolvedCenterX, evolvedCenterY, evolvedOuter, petals,
              evolvedPhase, evolvedModulation,
              stroke * (0.82 + evolvedRing / Math.max(1, rings) * 0.32),
              Math.min(0.98, 0.62 + evolvedRing / Math.max(1, rings) * 0.3),
              0.96 + Math.sin(evolvedPhase + evolvedRing) * Math.min(0.08, Math.abs(warp) * 0.035));
            traceRoseEngineRail(evolvedCenterX, evolvedCenterY,
              Math.max(evolvedPreviousRadius + evolvedGap, evolvedOuter - evolvedGap),
              Math.max(3, petals - 1 + (evolvedRing % 2 ? 2 : 0)), evolvedPhase + sector * 0.5,
              evolvedModulation * 0.58, Math.max(0.2, stroke * 0.46),
              Math.min(0.74, 0.32 + interlace * 0.1), 1.01);

            var evolvedTips = [];
            for (var evolvedPetal = 0; evolvedPetal < petals; evolvedPetal++) {
              var evolvedSource = nodes[(evolvedPetal + evolvedRing * 3) % nodes.length];
              var evolvedBaseAngle = evolvedPhase + evolvedPetal * sector;
              var evolvedSourceAngle = Math.atan2(evolvedSource.y - centerY, evolvedSource.x - centerX);
              var evolvedDelta = Math.atan2(Math.sin(evolvedSourceAngle - evolvedBaseAngle),
                Math.cos(evolvedSourceAngle - evolvedBaseAngle));
              var evolvedTipAngle = evolvedBaseAngle
                + evolvedDelta * Math.max(-0.16, Math.min(0.16, warp * 0.075));
              var evolvedTwist = sector * (0.12 + Math.min(4, interlace) * 0.035)
                * ((evolvedPetal + evolvedRing) % 2 ? -1 : 1);
              var evolvedStartRadius = evolvedRing ? evolvedPreviousRadius + evolvedGap : evolvedPreviousRadius * 0.72;
              var evolvedStartX = centerX + Math.cos(evolvedBaseAngle - evolvedTwist) * evolvedStartRadius;
              var evolvedStartY = centerY + Math.sin(evolvedBaseAngle - evolvedTwist) * evolvedStartRadius;
              var evolvedEndX = centerX + Math.cos(evolvedTipAngle + evolvedTwist * 0.35) * evolvedOuter;
              var evolvedEndY = centerY + Math.sin(evolvedTipAngle + evolvedTwist * 0.35) * evolvedOuter;
              var evolvedMidRadius = (evolvedStartRadius + evolvedOuter) * 0.5;
              var evolvedControlAngle = evolvedBaseAngle + evolvedTwist * (0.9 + Math.min(2, interlace) * 0.16);
              var evolvedRailAlpha = Math.min(0.9,
                0.46 + evolvedRing / Math.max(1, rings) * 0.22 + interlace * 0.06);
              var evolvedRailWidth = stroke * (0.62 + (evolvedRing + 1) / rings * 0.3);
              ctx.beginPath();
              ctx.moveTo(evolvedStartX, evolvedStartY);
              ctx.quadraticCurveTo(centerX + Math.cos(evolvedControlAngle) * evolvedMidRadius,
                centerY + Math.sin(evolvedControlAngle) * evolvedMidRadius, evolvedEndX, evolvedEndY);
              strokeRoseCurrentPath(evolvedRailWidth * (3.4 + interlace * 0.3),
                evolvedRailWidth, evolvedRailAlpha, 0.48);

              // A counter-running rib creates the woven crossing while staying
              // inside the same annular cell.
              var evolvedCounterStartX = centerX + Math.cos(evolvedBaseAngle + evolvedTwist) * evolvedStartRadius;
              var evolvedCounterStartY = centerY + Math.sin(evolvedBaseAngle + evolvedTwist) * evolvedStartRadius;
              var evolvedCounterEndX = centerX + Math.cos(evolvedTipAngle - evolvedTwist * 0.35) * evolvedOuter;
              var evolvedCounterEndY = centerY + Math.sin(evolvedTipAngle - evolvedTwist * 0.35) * evolvedOuter;
              ctx.beginPath();
              ctx.moveTo(evolvedCounterStartX, evolvedCounterStartY);
              ctx.quadraticCurveTo(centerX + Math.cos(evolvedBaseAngle - evolvedTwist * 0.9) * evolvedMidRadius,
                centerY + Math.sin(evolvedBaseAngle - evolvedTwist * 0.9) * evolvedMidRadius,
                evolvedCounterEndX, evolvedCounterEndY);
              strokeRoseCurrentPath(evolvedRailWidth * 2.3,
                evolvedRailWidth * 0.58, evolvedRailAlpha * 0.72, 0.46);
              evolvedTips.push({
                x: (evolvedEndX + evolvedCounterEndX) * 0.5,
                y: (evolvedEndY + evolvedCounterEndY) * 0.5,
                angle: evolvedTipAngle
              });
            }
            // Each annular bay closes with a pointed cusp. This is the
            // load-bearing cell missing from the former concentric diagram.
            for (var cuspIndex = 0; cuspIndex < evolvedTips.length; cuspIndex++) {
              var cuspA = evolvedTips[cuspIndex];
              var cuspB = evolvedTips[(cuspIndex + 1) % evolvedTips.length];
              var cuspAngle = Math.atan2(Math.sin(cuspA.angle) + Math.sin(cuspB.angle),
                Math.cos(cuspA.angle) + Math.cos(cuspB.angle));
              var cuspDepth = Math.max(stroke * 2.4,
                (evolvedOuter - evolvedPreviousRadius) * (0.22 + Math.min(4, interlace) * 0.025));
              ctx.beginPath();
              ctx.moveTo(cuspA.x, cuspA.y);
              ctx.quadraticCurveTo(centerX + Math.cos(cuspAngle) * (evolvedOuter - cuspDepth),
                centerY + Math.sin(cuspAngle) * (evolvedOuter - cuspDepth), cuspB.x, cuspB.y);
              strokeRoseCurrentPath(stroke * (2.7 + interlace * 0.24),
                stroke * 0.58, 0.54 + evolvedRing / Math.max(1, rings) * 0.22, 0.5);
              if (evolvedRing === rings - 1) drawRoseBoss(cuspA.x, cuspA.y,
                stroke * (1.18 + Math.min(4, interlace) * 0.12), 0.76, cuspA.angle);
            }
            ringTipSets.push(evolvedTips);
            evolvedPreviousRadius = evolvedOuter;
          }
          // A doubled archivolt contains the field and establishes a clear
          // outside edge independent from the inner rosette grammar.
          for (var archivolt = 0; archivolt < 2; archivolt++) {
            ctx.beginPath();
            ctx.arc(centerX, centerY, outerRadius + stroke * (2.4 + archivolt * 2.9), 0, Math.PI * 2);
            strokeRoseCurrentPath(stroke * (5.2 - archivolt * 0.8),
              stroke * (0.82 - archivolt * 0.12), 0.82 - archivolt * 0.18, 0.48);
          }
          tipPoints = ringTipSets[ringTipSets.length - 1] || [];
          var evolvedHub = Math.max(stroke * 3.4, outerRadius / Math.max(6, petals));
          var satelliteCount = Math.min(nodes.length, Math.max(1, Math.min(4,
            2 + Math.floor(Math.max(0, interlace - 1.2) * 0.8) + (rings >= 5 ? 1 : 0))));
          var satelliteCandidates = nodes.slice().sort(function (left, right) {
            var leftDx = left.x - centerX, leftDy = left.y - centerY;
            var rightDx = right.x - centerX, rightDy = right.y - centerY;
            return rightDx * rightDx + rightDy * rightDy - leftDx * leftDx - leftDy * leftDy;
          });
          var satellites = [];
          for (var satelliteCandidateIndex = 0;
            satelliteCandidateIndex < satelliteCandidates.length && satellites.length < satelliteCount;
            satelliteCandidateIndex++) {
            var satelliteCandidate = satelliteCandidates[satelliteCandidateIndex];
            var satelliteDx = satelliteCandidate.x - centerX;
            var satelliteDy = satelliteCandidate.y - centerY;
            var satelliteDistance = Math.sqrt(satelliteDx * satelliteDx + satelliteDy * satelliteDy);
            var satelliteAngle = satelliteDistance > 0.001
              ? Math.atan2(satelliteDy, satelliteDx)
              : phase + satelliteCandidateIndex * Math.PI * 2 / satelliteCount;
            var satelliteTargetDistance = outerRadius * (0.55
              + ((satelliteCandidateIndex + rings) % 3) * 0.14);
            var satelliteRadius = outerRadius * (0.2
              + ((satelliteCandidateIndex + topology) % 3) * 0.028
              + Math.min(4, interlace) * 0.008);
            var satellite = {
              x: centerX + Math.cos(satelliteAngle) * satelliteTargetDistance,
              y: centerY + Math.sin(satelliteAngle) * satelliteTargetDistance,
              r: satelliteRadius,
              angle: satelliteAngle
            };
            var satelliteSeparated = true;
            for (var existingSatellite = 0; existingSatellite < satellites.length; existingSatellite++) {
              var existingDx = satellite.x - satellites[existingSatellite].x;
              var existingDy = satellite.y - satellites[existingSatellite].y;
              if (Math.sqrt(existingDx * existingDx + existingDy * existingDy)
                < (satellite.r + satellites[existingSatellite].r) * 1.35) satelliteSeparated = false;
            }
            if (satelliteSeparated) satellites.push(satellite);
          }
          for (var connectionIndex = 0; connectionIndex < satellites.length; connectionIndex++) {
            traceRoseConnection(satellites[connectionIndex], connectionIndex, evolvedHub);
          }
          for (var satelliteIndex = 0; satelliteIndex < satellites.length; satelliteIndex++) {
            var satelliteRose = satellites[satelliteIndex];
            var satelliteLobes = Math.max(3, Math.min(12,
              3 + ((petals + satelliteIndex * 2 + topology) % 8)));
            traceRoseEngineRail(satelliteRose.x, satelliteRose.y, satelliteRose.r,
              satelliteLobes, satelliteRose.angle + phase,
              Math.min(0.22, 0.045 + interlace * 0.025 + Math.abs(warp) * 0.02),
              stroke * (0.82 + satelliteIndex * 0.08), 0.9,
              0.82 + (satelliteIndex % 2) * 0.2);
            traceRoseEngineRail(satelliteRose.x, satelliteRose.y, satelliteRose.r * 0.48,
              Math.max(3, satelliteLobes - 1), satelliteRose.angle - phase * 0.6,
              0.06 + Math.min(0.1, interlace * 0.018), Math.max(0.2, stroke * 0.58), 0.7, 1.04);
            ctx.globalAlpha = petalAggregate.strength * 0.74;
            ctx.lineWidth = Math.max(0.2, stroke * 0.54);
            ctx.beginPath();
            ctx.arc(satelliteRose.x, satelliteRose.y, Math.max(stroke * 1.5, satelliteRose.r * 0.16), 0, Math.PI * 2);
            ctx.stroke();
          }
          traceRoseEngineRail(centerX, centerY, evolvedHub * 2.08,
            Math.max(3, Math.min(12, Math.round(petals / 2))), phase + sector * 0.25,
            0.05 + Math.min(0.1, interlace * 0.022), stroke * 0.82, 0.86, 1);
          drawRoseHub(evolvedHub);
          targetCtx.save();
          targetCtx.setTransform(1, 0, 0, 1, 0, 0);
          targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
          targetCtx.restore();
          return;
        }

        for (var ring = 0; ring < rings; ring++) {
          var ringOuter = outerRadius * (ring + 1) / rings;
          var ringInner = ring ? outerRadius * (ring + 0.18) / rings : Math.max(stroke * 2.4, ringOuter * 0.12);
          var ringPhase = phase + (ring % 2 ? sector * 0.5 : 0);
          if (topology === 1) ringPhase += Math.sin((ring + 1) * 1.7) * sector * 0.16;
          else if (topology === 2) ringPhase += ring * sector * 0.14;
          else if (topology === 3) ringPhase += ring * sector * (warp < 0 ? -0.34 : 0.34);
          else if (topology === 4) ringPhase += (ring % 3) * sector * 0.22;
          var ringTips = [];
          for (var petal = 0; petal < petals; petal++) {
            var sourceNode = nodes[(petal + ring) % nodes.length];
            var baseAngle = ringPhase + petal * sector;
            var sourceAngle = Math.atan2(sourceNode.y - centerY, sourceNode.x - centerX);
            var sourceDelta = Math.atan2(Math.sin(sourceAngle - baseAngle), Math.cos(sourceAngle - baseAngle));
            var tipAngle = baseAngle + sourceDelta * Math.max(-0.42, Math.min(0.42, warp * 0.18))
              + (hash(petal, ring, params.seed + 1847) * 2 - 1) * Math.abs(warp) * sector * 0.075;
            var half = sector * (0.3 + topology * 0.012 + Math.min(1.4, Math.abs(warp)) * 0.035);
            var leftX = centerX + Math.cos(baseAngle - half) * ringInner;
            var leftY = centerY + Math.sin(baseAngle - half) * ringInner;
            var rightX = centerX + Math.cos(baseAngle + half) * ringInner;
            var rightY = centerY + Math.sin(baseAngle + half) * ringInner;
            var tipX = centerX + Math.cos(tipAngle) * ringOuter;
            var tipY = centerY + Math.sin(tipAngle) * ringOuter;
            var shoulderRadius = ringInner + (ringOuter - ringInner) * (0.48 + Math.min(1, Math.abs(warp)) * 0.08);
            var leftControlX = centerX + Math.cos(baseAngle - half * 0.58) * shoulderRadius;
            var leftControlY = centerY + Math.sin(baseAngle - half * 0.58) * shoulderRadius;
            var rightControlX = centerX + Math.cos(baseAngle + half * 0.58) * shoulderRadius;
            var rightControlY = centerY + Math.sin(baseAngle + half * 0.58) * shoulderRadius;
            ctx.globalAlpha = petalAggregate.strength * (0.48 + (ring + 1) / rings * 0.48);
            ctx.lineWidth = stroke * (0.72 + (ring + 1) / rings * 0.34);
            ctx.beginPath();
            ctx.moveTo(leftX, leftY);
            ctx.quadraticCurveTo(leftControlX, leftControlY, tipX, tipY);
            ctx.quadraticCurveTo(rightControlX, rightControlY, rightX, rightY);
            ctx.stroke();
            ringTips.push({ x: tipX, y: tipY, angle: tipAngle });
          }
          ctx.globalAlpha = petalAggregate.strength * (0.26 + (ring + 1) / rings * 0.24);
          ctx.lineWidth = Math.max(0.2, stroke * 0.62);
          if (interlace > 0.005) {
            // Curved stone tracery closes every ring without the straight
            // star-polygons that used to overwhelm the central rose.
            for (var arcIndex = 0; arcIndex < ringTips.length; arcIndex++) {
              var arcA = ringTips[arcIndex];
              var arcB = ringTips[(arcIndex + 1) % ringTips.length];
              var arcAngle = Math.atan2(Math.sin(arcA.angle) + Math.sin(arcB.angle),
                Math.cos(arcA.angle) + Math.cos(arcB.angle));
              var arcRadius = ringOuter * Math.max(0.38, 0.82 - Math.min(4, interlace) * 0.035);
              ctx.beginPath();
              ctx.moveTo(arcA.x, arcA.y);
              ctx.quadraticCurveTo(centerX + Math.cos(arcAngle) * arcRadius,
                centerY + Math.sin(arcAngle) * arcRadius, arcB.x, arcB.y);
              ctx.stroke();
            }
            ctx.globalAlpha = petalAggregate.strength * Math.min(0.72, 0.26 + interlace * 0.12);
            ctx.lineWidth = Math.max(0.2, stroke * (0.38 + Math.min(4, interlace) * 0.08));
            ctx.beginPath();
            ctx.arc(centerX, centerY, ringOuter, 0, Math.PI * 2);
            ctx.stroke();
          } else {
            ctx.beginPath();
            for (var tipIndex = 0; tipIndex < ringTips.length; tipIndex++) {
              var tipPoint = ringTips[tipIndex];
              if (!tipIndex) ctx.moveTo(tipPoint.x, tipPoint.y); else ctx.lineTo(tipPoint.x, tipPoint.y);
            }
            ctx.closePath();
            ctx.stroke();
          }
          ringTipSets.push(ringTips);
          if (ring === rings - 1) tipPoints = ringTips;
        }

        if (interlace > 0.005 && ringTipSets.length > 1) {
          // Adjacent rings weave as alternating curved ribs; all rings remain
          // part of one articulated ensemble instead of independent stars.
          for (var laceRing = 1; laceRing < ringTipSets.length; laceRing++) {
            var innerTips = ringTipSets[laceRing - 1];
            var outerTips = ringTipSets[laceRing];
            for (var lace = 0; lace < petals; lace++) {
              var innerTip = innerTips[(lace + (laceRing % 2)) % innerTips.length];
              var outerTip = outerTips[lace % outerTips.length];
              var alternateOuter = outerTips[(lace + 1) % outerTips.length];
              var laceTarget = lace % 2 ? alternateOuter : outerTip;
              var laceMidX = (innerTip.x + laceTarget.x) * 0.5;
              var laceMidY = (innerTip.y + laceTarget.y) * 0.5;
              var laceAngle = Math.atan2(laceMidY - centerY, laceMidX - centerX)
                + (lace % 2 ? 1 : -1) * sector * 0.18 * Math.min(2, interlace);
              var laceRadius = Math.sqrt((laceMidX - centerX) * (laceMidX - centerX)
                + (laceMidY - centerY) * (laceMidY - centerY));
              ctx.globalAlpha = petalAggregate.strength * Math.min(0.82, 0.34 + interlace * 0.13);
              ctx.lineWidth = Math.max(0.2, stroke * (0.42 + interlace * 0.1));
              ctx.beginPath();
              ctx.moveTo(innerTip.x, innerTip.y);
              ctx.quadraticCurveTo(centerX + Math.cos(laceAngle) * laceRadius,
                centerY + Math.sin(laceAngle) * laceRadius, laceTarget.x, laceTarget.y);
              ctx.stroke();
            }
          }
        }

        var supportCount = interlace > 0.005
          ? Math.min(nodes.length, Math.max(3, petals))
          : Math.min(nodes.length, Math.max(petals, 32));
        for (var support = 0; support < supportCount; support++) {
          var supportNode = interlace > 0.005
            ? nodes[Math.min(nodes.length - 1, Math.floor(support * nodes.length / supportCount))]
            : nodes[support];
          var targetTip = tipPoints[support % tipPoints.length];
          var controlMix = 0.42 + hash(support, params.seed % 83, 1861) * 0.2;
          var tangent = (support % 2 ? -1 : 1) * (warp * stroke * 3.2
            + (interlace > 0.005 ? sector * outerRadius * 0.08 * Math.min(2, interlace) : 0));
          var targetDx = targetTip.x - supportNode.x;
          var targetDy = targetTip.y - supportNode.y;
          var targetLength = Math.sqrt(targetDx * targetDx + targetDy * targetDy) || 1;
          ctx.globalAlpha = petalAggregate.strength * Math.min(0.72,
            (interlace > 0.005 ? 0.14 : 0.2) + supportNode.strength * (interlace > 0.005 ? 0.3 : 0.42));
          ctx.lineWidth = Math.max(0.2, stroke * (0.44 + supportNode.strength * 0.42));
          ctx.beginPath();
          ctx.moveTo(supportNode.x, supportNode.y);
          ctx.quadraticCurveTo(supportNode.x + targetDx * controlMix - targetDy / targetLength * tangent,
            supportNode.y + targetDy * controlMix + targetDx / targetLength * tangent, targetTip.x, targetTip.y);
          ctx.stroke();
        }
        var hub = Math.max(stroke * 3.2, outerRadius / Math.max(6, petals * 0.9));
        drawRoseHub(hub);
        for (var intersection = 0; intersection < tipPoints.length; intersection++) {
          var mark = stroke * (1.25 + (intersection % 3) * 0.22);
          ctx.save();
          ctx.translate(tipPoints[intersection].x, tipPoints[intersection].y);
          ctx.rotate(Math.PI / 4 + tipPoints[intersection].angle);
          ctx.globalAlpha = petalAggregate.strength * 0.58;
          ctx.strokeRect(-mark, -mark, mark * 2, mark * 2);
          ctx.restore();
        }
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderChromeStudio(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase, settings) {
        var shape = buildSurfaceMask(glyphs, 'chromeReliquary', width, height, pixelScale, L, fm, true);
        var mask = buildSurfaceMask(glyphs, 'chromeReliquary', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'chromeReliquary', coverBase);
        var full = shape.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height).data;
        var weighted = mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height).data;
        settings.phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        settings.color = surfaceHexRgb(surfaceEffectColor('chromeReliquary'));
        var result = chromeStudioPlate(full, weighted, width, height, settings);
        var work = surfaceScratch('chrome-studio-mirror', width, height, false);
        var image = work.ctx.createImageData(width, height); image.data.set(result); if(globalThis.TypeDeformerRenderContext)globalThis.TypeDeformerRenderContext.copyField(image,result); work.ctx.putImageData(image, 0, 0);
        targetCtx.save();
        try {
          targetCtx.setTransform(1, 0, 0, 1, 0, 0);
          targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        } finally { targetCtx.restore(); }
      }

      function renderChromeReliquary(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var bevelAggregate = surfaceAggregate(glyphs, 'chromeReliquary', 'chromeBevel', params.chromeBevel);
        if (!bevelAggregate.weight) return;
        var voltage = surfaceAggregate(glyphs, 'chromeReliquary', 'chromeVoltage', params.chromeVoltage).value;
        var voltageNormalized = Math.min(1, Math.max(0, voltage) / 4);
        var bevel = Math.max(1, bevelAggregate.value * pixelScale * L.s);
        var lightAngle = surfaceAggregate(glyphs, 'chromeReliquary', 'chromeAngle', params.chromeAngle).value * Math.PI / 180;
        var bands = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('chromeBands', Math.round(surfaceAggregate(glyphs, 'chromeReliquary', 'chromeBands', params.chromeBands).value), 0, 2, 24) : Math.max(2, Math.min(24, Math.round(surfaceAggregate(glyphs, 'chromeReliquary', 'chromeBands', params.chromeBands).value))));
        var contrast = surfaceAggregate(glyphs, 'chromeReliquary', 'chromeContrast', params.chromeContrast).value;
        var warp = surfaceAggregate(glyphs, 'chromeReliquary', 'chromeWarp', params.chromeWarp).value;
        if (surfaceChoice(glyphs, 'chromeReliquary', 'chromeModel', params.chromeModel, BATCH_PARAM_OPTIONS.chromeModel) === 'studio') {
          renderChromeStudio(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase, {
            bevel: bevel, voltage: voltage, angle: lightAngle, bands: bands, contrast: contrast, warp: warp,
            roughness: surfaceAggregate(glyphs, 'chromeReliquary', 'chromeRoughness', params.chromeRoughness).value
          });
          return;
        }
        var mask = buildSurfaceMask(glyphs, 'chromeReliquary', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'chromeReliquary', coverBase);
        var maskCtx = mask.getContext('2d', { willReadFrequently: true });
        var source;
        try { source = maskCtx.getImageData(0, 0, width, height); }
        catch (error) { return; }
        var field = surfaceBoundaryDistance(source.data, width, height);
        if (!field.bounds) return;
        var work = surfaceScratch('chrome-reliquary', width, height, false);
        var output = work.ctx.createImageData(width, height);
        var rgb = surfaceHexRgb(surfaceEffectColor('chromeReliquary'));
        var lightX = Math.cos(lightAngle);
        var lightY = Math.sin(lightAngle);
        var acidAmount = Math.max(0, Math.min(1, contrast * 0.17 + warp * 0.14 + voltage * 0.16));
        var outerShell = Math.max(1, Math.min(bevel * (0.34 + warp * 0.07 + voltage * 0.025),
          (38 + voltage * 6) * pixelScale * L.s));
        var minX = Math.max(0, Math.floor(field.bounds[0] - outerShell - 2));
        var minY = Math.max(0, Math.floor(field.bounds[1] - outerShell - 2));
        var maxX = Math.min(width - 1, Math.ceil(field.bounds[2] + outerShell + 2));
        var maxY = Math.min(height - 1, Math.ceil(field.bounds[3] + outerShell + 2));
        var phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var motion = chromeReflectionMotion(phase);
        var boundsCenterX = (field.bounds[0] + field.bounds[2]) * 0.5;
        var boundsCenterY = (field.bounds[1] + field.bounds[3]) * 0.5;
        var boundsSpan = Math.max(1, field.bounds[2] - field.bounds[0], field.bounds[3] - field.bounds[1]);
        var tangentX = -lightY;
        var tangentY = lightX;
        function distanceAt(x, y) {
          x = Math.max(0, Math.min(width - 1, x));
          y = Math.max(0, Math.min(height - 1, y));
          return field.distance[y * width + x];
        }
        for (var y = minY; y <= maxY; y++) for (var x = minX; x <= maxX; x++) {
          var index = y * width + x;
          var inside = !!field.inside[index];
          var distance = field.distance[index];
          if (!inside && distance > outerShell) continue;
          var dx = distanceAt(x + 1, y) - distanceAt(x - 1, y);
          var dy = distanceAt(x, y + 1) - distanceAt(x, y - 1);
          var magnitude = Math.sqrt(dx * dx + dy * dy);
          var normalX = magnitude > 0.001 ? dx / magnitude : 0;
          var normalY = magnitude > 0.001 ? dy / magnitude : -1;
          if (inside) { normalX *= -1; normalY *= -1; }
          var facing = normalX * lightX + normalY * lightY;
          var normalizedDistance = Math.min(1, distance / Math.max(1, bevel));
          var coarseNoise = surfaceNoise01(x >> 3, y >> 3, params.seed + 1871) * 2 - 1;
          var fineNoise = surfaceNoise01(x, y, params.seed + 1877) * 2 - 1;
          var relativeX = x - boundsCenterX;
          var relativeY = y - boundsCenterY;
          var environmentU = (relativeX * lightX + relativeY * lightY) / boundsSpan;
          var tangentU = (relativeX * tangentX + relativeY * tangentY) / boundsSpan;
          var mercuryShear = Math.sin(tangentU * Math.PI * (3.2 + warp * 1.7)
            + motion.mercury + coarseNoise * 1.4) * warp * 0.075
            + Math.sin(environmentU * Math.PI * 5 - tangentU * Math.PI * 2.2) * warp * 0.022;
          var environmentPhase = (environmentU + mercuryShear) * Math.PI * (2.25 + bands * 0.17)
            + tangentU * Math.PI * (0.48 + warp * 0.36) + motion.environment;
          var environmentBand = 0.5 + Math.sin(environmentPhase) * 0.5;
          var horizonBand = Math.pow(Math.max(0,
            1 - Math.abs(environmentU + mercuryShear * 0.62 - 0.035) * (5.2 + contrast * 0.75)), 2.1);
          var anisotropicGlint = Math.pow(Math.max(0, Math.cos(tangentU * Math.PI * (4.4 + bands * 0.32)
            + environmentU * Math.PI * (0.8 + warp * 0.5) + motion.glint + coarseNoise * 0.34)),
            Math.max(3.5, 12 - warp * 1.45 - contrast * 0.45));
          var wavePhase = normalizedDistance * bands * Math.PI * 2
            + facing * Math.PI * (0.72 + contrast * 0.18)
            + coarseNoise * warp * 1.12 + environmentPhase * (0.12 + warp * 0.04)
            + motion.mirror * Math.min(1, warp * 0.28);
          var mirrorBand = 0.5 + Math.sin(wavePhase) * 0.5;
          var directional = 0.5 + facing * 0.5;
          var tone = 0.055 + mirrorBand * 0.27 + environmentBand * 0.4 + directional * 0.18
            + anisotropicGlint * (0.08 + Math.min(0.2, warp * 0.035 + contrast * 0.025))
            - horizonBand * (0.18 + contrast * 0.045) + fineNoise * warp * 0.024;
          tone = Math.max(0, Math.min(1, 0.5 + (tone - 0.5) * (1 + contrast * 1.05)));
          if (voltage > 0.005) {
            var posterSteps = Math.max(2, Math.round(8 - Math.min(6, voltage) * 0.78));
            var posterTone = Math.round(tone * (posterSteps - 1)) / Math.max(1, posterSteps - 1);
            var posterMix = Math.min(0.92, voltage * 0.2);
            tone = tone * (1 - posterMix) + posterTone * posterMix;
          }
          var specular = Math.pow(Math.max(0, facing), Math.max(2.5, 9 - contrast * 1.2));
          specular *= 0.24 + mirrorBand * 0.32 + environmentBand * 0.44;
          var shellFade = inside ? 1 : Math.max(0, 1 - distance / outerShell);
          var edgeGlint = Math.max(0, 1 - distance / Math.max(1, bevel * 0.16));
          var blackMirror = Math.pow(Math.max(0, 1 - mirrorBand), Math.max(0.72, 1.6 - voltage * 0.1))
            * Math.min(0.96, 0.28 + contrast * 0.13 + voltage * 0.075);
          var airbrush = Math.pow(Math.max(0, 1 - Math.abs(facing - 0.42) * 1.42), 2)
            * (0.08 + Math.min(0.58, warp * 0.11 + contrast * 0.055));
          var hotLine = Math.pow(Math.max(0, Math.cos(wavePhase * 0.5 + coarseNoise * 0.28)),
            Math.max(2.2, 7.5 - warp * 0.7));
          // Chromatic reflections use a deliberately broader field than the
          // silver bands. Sharing the band's high frequency made saturated
          // values average back to grey when the preview was downsampled.
          var chromaPhase = (environmentU + mercuryShear) * Math.PI * (2.1 + Math.min(4.4, warp * 0.72))
            + tangentU * Math.PI * (0.9 + voltageNormalized * 1.6)
            + facing * 1.55 + coarseNoise * warp * 0.34 + motion.chroma;
          var acidR = 0.12 + (0.5 + Math.sin(chromaPhase) * 0.5) * 0.88;
          var acidG = 0.12 + (0.5 + Math.sin(chromaPhase + Math.PI * 2 / 3) * 0.5) * 0.88;
          var acidB = 0.12 + (0.5 + Math.sin(chromaPhase + Math.PI * 4 / 3) * 0.5) * 0.88;
          var chromaWeight = Math.min(0.98, acidAmount * (0.26
            + Math.abs(environmentBand - 0.5) * 0.82 + Math.abs(mirrorBand - 0.5) * 0.24)
            + voltageNormalized * (0.08 + Math.abs(facing) * 0.12 + anisotropicGlint * 0.12)
            + (!inside ? acidAmount * (0.22 + voltageNormalized * 0.18) : 0));
          var baseScale = Math.max(0.025, (0.1 + tone * 1.04) * (1 - blackMirror));
          if (voltage > 0.005) {
            var midTone = Math.max(0, 1 - Math.abs(tone - 0.5) * 2);
            baseScale *= Math.max(0.32, 1 - voltageNormalized * midTone * 0.58);
          }
          var highlight = Math.min(0.99, specular * (0.48 + contrast * 0.15 + voltage * 0.035)
            + edgeGlint * directional * (0.24 + acidAmount * 0.28 + voltageNormalized * 0.22)
            + hotLine * (0.06 + acidAmount * 0.24 + voltageNormalized * 0.18)
            + anisotropicGlint * (0.12 + contrast * 0.055 + warp * 0.045) + airbrush);
          var offset = index * 4;
          var metalR = rgb[0] * baseScale;
          var metalG = rgb[1] * baseScale;
          var metalB = rgb[2] * baseScale;
          var spectralR = 255 * acidR * (0.45 + tone * 0.68);
          var spectralG = 255 * acidG * (0.45 + tone * 0.68);
          var spectralB = 255 * acidB * (0.45 + tone * 0.68);
          var finalR = metalR * (1 - chromaWeight) + spectralR * chromaWeight;
          var finalG = metalG * (1 - chromaWeight) + spectralG * chromaWeight;
          var finalB = metalB * (1 - chromaWeight) + spectralB * chromaWeight;
          var highlightR = 255;
          var highlightG = 248 + acidG * 7;
          var highlightB = 244 + acidB * 11;
          output.data[offset] = Math.max(0, Math.min(255, Math.round(finalR * (1 - highlight) + highlightR * highlight)));
          output.data[offset + 1] = Math.max(0, Math.min(255, Math.round(finalG * (1 - highlight) + highlightG * highlight)));
          output.data[offset + 2] = Math.max(0, Math.min(255, Math.round(finalB * (1 - highlight) + highlightB * highlight)));
          var sourceAlpha = source.data[offset + 3] / 255;
          var alpha = inside ? Math.max(sourceAlpha, 0.76 + edgeGlint * 0.24)
            : shellFade * (0.34 + directional * 0.28 + acidAmount * 0.22 + voltageNormalized * 0.14);
          output.data[offset + 3] = Math.round(255 * Math.min(1, alpha) * bevelAggregate.strength);
        }

        // Output pixels sample the fixed geometry and original glyph raster.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext;RC.field(output,function(px,py,rgba){var x=px-.5,y=py-.5;if(y<(minY)||!(y <= maxY))return;if(x<(minX)||!(x <= maxX))return;
          var index = Math.floor(y) * width + Math.floor(x);
          var inside = !!(RC.sample(field.inside,width,height,x,y)>=.5);
          var distance = RC.sample(field.distance,width,height,x,y);
          if (!inside && distance > outerShell) return;
          var dx = distanceAt(x + 1, y) - distanceAt(x - 1, y);
          var dy = distanceAt(x, y + 1) - distanceAt(x, y - 1);
          var magnitude = Math.sqrt(dx * dx + dy * dy);
          var normalX = magnitude > 0.001 ? dx / magnitude : 0;
          var normalY = magnitude > 0.001 ? dy / magnitude : -1;
          if (inside) { normalX *= -1; normalY *= -1; }
          var facing = normalX * lightX + normalY * lightY;
          var normalizedDistance = Math.min(1, distance / Math.max(1, bevel));
          var coarseNoise = surfaceNoise01(x >> 3, y >> 3, params.seed + 1871) * 2 - 1;
          var fineNoise = surfaceNoise01(Math.floor(x), Math.floor(y), params.seed + 1877) * 2 - 1;
          var relativeX = x - boundsCenterX;
          var relativeY = y - boundsCenterY;
          var environmentU = (relativeX * lightX + relativeY * lightY) / boundsSpan;
          var tangentU = (relativeX * tangentX + relativeY * tangentY) / boundsSpan;
          var mercuryShear = Math.sin(tangentU * Math.PI * (3.2 + warp * 1.7)
            + motion.mercury + coarseNoise * 1.4) * warp * 0.075
            + Math.sin(environmentU * Math.PI * 5 - tangentU * Math.PI * 2.2) * warp * 0.022;
          var environmentPhase = (environmentU + mercuryShear) * Math.PI * (2.25 + bands * 0.17)
            + tangentU * Math.PI * (0.48 + warp * 0.36) + motion.environment;
          var environmentBand = 0.5 + Math.sin(environmentPhase) * 0.5;
          var horizonBand = Math.pow(Math.max(0,
            1 - Math.abs(environmentU + mercuryShear * 0.62 - 0.035) * (5.2 + contrast * 0.75)), 2.1);
          var anisotropicGlint = Math.pow(Math.max(0, Math.cos(tangentU * Math.PI * (4.4 + bands * 0.32)
            + environmentU * Math.PI * (0.8 + warp * 0.5) + motion.glint + coarseNoise * 0.34)),
            Math.max(3.5, 12 - warp * 1.45 - contrast * 0.45));
          var wavePhase = normalizedDistance * bands * Math.PI * 2
            + facing * Math.PI * (0.72 + contrast * 0.18)
            + coarseNoise * warp * 1.12 + environmentPhase * (0.12 + warp * 0.04)
            + motion.mirror * Math.min(1, warp * 0.28);
          var mirrorBand = 0.5 + Math.sin(wavePhase) * 0.5;
          var directional = 0.5 + facing * 0.5;
          var tone = 0.055 + mirrorBand * 0.27 + environmentBand * 0.4 + directional * 0.18
            + anisotropicGlint * (0.08 + Math.min(0.2, warp * 0.035 + contrast * 0.025))
            - horizonBand * (0.18 + contrast * 0.045) + fineNoise * warp * 0.024;
          tone = Math.max(0, Math.min(1, 0.5 + (tone - 0.5) * (1 + contrast * 1.05)));
          if (voltage > 0.005) {
            var posterSteps = Math.max(2, Math.round(8 - Math.min(6, voltage) * 0.78));
            var posterTone = Math.round(tone * (posterSteps - 1)) / Math.max(1, posterSteps - 1);
            var posterMix = Math.min(0.92, voltage * 0.2);
            tone = tone * (1 - posterMix) + posterTone * posterMix;
          }
          var specular = Math.pow(Math.max(0, facing), Math.max(2.5, 9 - contrast * 1.2));
          specular *= 0.24 + mirrorBand * 0.32 + environmentBand * 0.44;
          var shellFade = inside ? 1 : Math.max(0, 1 - distance / outerShell);
          var edgeGlint = Math.max(0, 1 - distance / Math.max(1, bevel * 0.16));
          var blackMirror = Math.pow(Math.max(0, 1 - mirrorBand), Math.max(0.72, 1.6 - voltage * 0.1))
            * Math.min(0.96, 0.28 + contrast * 0.13 + voltage * 0.075);
          var airbrush = Math.pow(Math.max(0, 1 - Math.abs(facing - 0.42) * 1.42), 2)
            * (0.08 + Math.min(0.58, warp * 0.11 + contrast * 0.055));
          var hotLine = Math.pow(Math.max(0, Math.cos(wavePhase * 0.5 + coarseNoise * 0.28)),
            Math.max(2.2, 7.5 - warp * 0.7));
          // Chromatic reflections use a deliberately broader field than the
          // silver bands. Sharing the band's high frequency made saturated
          // values average back to grey when the preview was downsampled.
          var chromaPhase = (environmentU + mercuryShear) * Math.PI * (2.1 + Math.min(4.4, warp * 0.72))
            + tangentU * Math.PI * (0.9 + voltageNormalized * 1.6)
            + facing * 1.55 + coarseNoise * warp * 0.34 + motion.chroma;
          var acidR = 0.12 + (0.5 + Math.sin(chromaPhase) * 0.5) * 0.88;
          var acidG = 0.12 + (0.5 + Math.sin(chromaPhase + Math.PI * 2 / 3) * 0.5) * 0.88;
          var acidB = 0.12 + (0.5 + Math.sin(chromaPhase + Math.PI * 4 / 3) * 0.5) * 0.88;
          var chromaWeight = Math.min(0.98, acidAmount * (0.26
            + Math.abs(environmentBand - 0.5) * 0.82 + Math.abs(mirrorBand - 0.5) * 0.24)
            + voltageNormalized * (0.08 + Math.abs(facing) * 0.12 + anisotropicGlint * 0.12)
            + (!inside ? acidAmount * (0.22 + voltageNormalized * 0.18) : 0));
          var baseScale = Math.max(0.025, (0.1 + tone * 1.04) * (1 - blackMirror));
          if (voltage > 0.005) {
            var midTone = Math.max(0, 1 - Math.abs(tone - 0.5) * 2);
            baseScale *= Math.max(0.32, 1 - voltageNormalized * midTone * 0.58);
          }
          var highlight = Math.min(0.99, specular * (0.48 + contrast * 0.15 + voltage * 0.035)
            + edgeGlint * directional * (0.24 + acidAmount * 0.28 + voltageNormalized * 0.22)
            + hotLine * (0.06 + acidAmount * 0.24 + voltageNormalized * 0.18)
            + anisotropicGlint * (0.12 + contrast * 0.055 + warp * 0.045) + airbrush);
          var offset = index * 4;
          var metalR = rgb[0] * baseScale;
          var metalG = rgb[1] * baseScale;
          var metalB = rgb[2] * baseScale;
          var spectralR = 255 * acidR * (0.45 + tone * 0.68);
          var spectralG = 255 * acidG * (0.45 + tone * 0.68);
          var spectralB = 255 * acidB * (0.45 + tone * 0.68);
          var finalR = metalR * (1 - chromaWeight) + spectralR * chromaWeight;
          var finalG = metalG * (1 - chromaWeight) + spectralG * chromaWeight;
          var finalB = metalB * (1 - chromaWeight) + spectralB * chromaWeight;
          var highlightR = 255;
          var highlightG = 248 + acidG * 7;
          var highlightB = 244 + acidB * 11;
          rgba[0] = Math.max(0, Math.min(255, Math.round(finalR * (1 - highlight) + highlightR * highlight)));
          rgba[1] = Math.max(0, Math.min(255, Math.round(finalG * (1 - highlight) + highlightG * highlight)));
          rgba[2] = Math.max(0, Math.min(255, Math.round(finalB * (1 - highlight) + highlightB * highlight)));
          var sourceAlpha = source.data[offset + 3] / 255;
          var alpha = inside ? Math.max(sourceAlpha, 0.76 + edgeGlint * 0.24)
            : shellFade * (0.34 + directional * 0.28 + acidAmount * 0.22 + voltageNormalized * 0.14);
          rgba[3] = Math.round(255 * Math.min(1, alpha) * bevelAggregate.strength);

        });}
        work.ctx.putImageData(output, 0, 0);
        var reflection = surfaceScratch('chrome-reliquary-reflection', width, height, false);
        var reflectionCtx = reflection.ctx;
        var reflectionSpan = boundsSpan * 1.45 + bevel * 4;
        var coatBands = Math.max(2, Math.min(7, Math.round(2 + bands / 5 + warp * 0.35)));
        reflectionCtx.save();
        reflectionCtx.translate(boundsCenterX, boundsCenterY);
        reflectionCtx.rotate(lightAngle + Math.PI * 0.5);
        reflectionCtx.lineCap = 'round';
        for (var coatBand = 0; coatBand < coatBands; coatBand++) {
          var coatPosition = (coatBand / Math.max(1, coatBands - 1) - 0.5) * boundsSpan * 0.82
            + Math.sin(motion.coat + coatBand * 2.17) * warp * bevel * 0.42;
          var coatWidth = Math.max(0.75, bevel * (0.035 + (coatBand % 3) * 0.022)
            * (1 + contrast * 0.18));
          var coatGradient = reflectionCtx.createLinearGradient(0,
            coatPosition - coatWidth * 2.8, 0, coatPosition + coatWidth * 2.8);
          coatGradient.addColorStop(0, 'rgba(255,255,255,0)');
          coatGradient.addColorStop(0.42, 'rgba(255,255,255,'
            + Math.min(0.88, 0.18 + contrast * 0.1 + voltageNormalized * 0.2).toFixed(3) + ')');
          coatGradient.addColorStop(0.5, 'rgba(255,255,255,'
            + Math.min(0.98, 0.46 + contrast * 0.11).toFixed(3) + ')');
          coatGradient.addColorStop(0.58, 'rgba(255,255,255,'
            + Math.min(0.72, 0.12 + warp * 0.08).toFixed(3) + ')');
          coatGradient.addColorStop(1, 'rgba(255,255,255,0)');
          reflectionCtx.strokeStyle = coatGradient;
          reflectionCtx.lineWidth = coatWidth * (1.8 + voltageNormalized * 0.7);
          reflectionCtx.globalAlpha = bevelAggregate.strength;
          reflectionCtx.beginPath();
          reflectionCtx.moveTo(-reflectionSpan, coatPosition - warp * bevel * 0.3);
          reflectionCtx.bezierCurveTo(-reflectionSpan * 0.34,
            coatPosition + Math.sin(coatBand * 1.9 + phase) * warp * bevel * 0.42,
            reflectionSpan * 0.34,
            coatPosition - Math.cos(coatBand * 1.37 - phase) * warp * bevel * 0.52,
            reflectionSpan, coatPosition + warp * bevel * 0.24);
          reflectionCtx.stroke();
        }
        reflectionCtx.restore();
        reflectionCtx.globalCompositeOperation = 'destination-in';
        reflectionCtx.globalAlpha = 1;
        reflectionCtx.drawImage(mask, 0, 0);
        reflectionCtx.globalCompositeOperation = 'source-over';
        work.ctx.save();
        work.ctx.globalCompositeOperation = 'screen';
        work.ctx.globalAlpha = Math.min(0.92, 0.5 + contrast * 0.08 + voltageNormalized * 0.16);
        work.ctx.drawImage(reflection.canvas, 0, 0);
        work.ctx.restore();
        function chromeOffsetShell(name, shiftX, shiftY, color, opacity) {
          var shell = surfaceScratch(name, width, height, false);
          shell.ctx.drawImage(mask, shiftX, shiftY);
          shell.ctx.globalCompositeOperation = 'destination-out';
          shell.ctx.drawImage(mask, 0, 0);
          shell.ctx.globalCompositeOperation = 'source-in';
          shell.ctx.fillStyle = color;
          shell.ctx.globalAlpha = opacity;
          shell.ctx.fillRect(0, 0, width, height);
          shell.ctx.globalAlpha = 1;
          shell.ctx.globalCompositeOperation = 'source-over';
          return shell.canvas;
        }
        var chromaticShift = Math.max(0.5, Math.min((22 + voltage * 8) * pixelScale * L.s,
          bevel * (0.06 + acidAmount * 0.2 + voltage * 0.035)));
        var extrusionShift = Math.max(1, Math.min(outerShell * (1.1 + voltageNormalized * 0.42),
          chromaticShift * (1.9 + voltageNormalized * 0.8)));
        var extrusion = chromeOffsetShell('chrome-reliquary-extrusion',
          -lightX * extrusionShift, -lightY * extrusionShift,
          'rgba(18, 2, 35, 1)', Math.min(0.94, 0.5 + contrast * 0.1));
        var cyanRim = chromeOffsetShell('chrome-reliquary-cyan-rim',
          -lightY * chromaticShift + lightX * chromaticShift * 0.35,
          lightX * chromaticShift + lightY * chromaticShift * 0.35,
          'rgba(0, 244, 255, 1)', Math.min(0.72, 0.08 + acidAmount * 0.42));
        var magentaRim = chromeOffsetShell('chrome-reliquary-magenta-rim',
          lightY * chromaticShift - lightX * chromaticShift * 0.28,
          -lightX * chromaticShift - lightY * chromaticShift * 0.28,
          'rgba(255, 0, 196, 1)', Math.min(0.68, 0.06 + acidAmount * 0.4));
        var limeRim = chromeOffsetShell('chrome-reliquary-lime-rim',
          lightX * chromaticShift * 0.82, lightY * chromaticShift * 0.82,
          'rgba(186, 255, 22, 1)', Math.min(0.48, acidAmount * 0.26));
        var whiteRim = chromeOffsetShell('chrome-reliquary-white-rim',
          lightX * chromaticShift * 0.26, lightY * chromaticShift * 0.26,
          'rgba(255, 255, 255, 1)', Math.min(0.78, voltageNormalized * 0.52));
        var bloom = surfaceScratch('chrome-reliquary-bloom', width, height, false);
        var bloomRadius = Math.max(0, Math.min(22 * pixelScale * L.s,
          bevel * (0.08 + warp * 0.045 + contrast * 0.018 + voltage * 0.012)));
        if (bloomRadius > 0.65 && acidAmount > 0.08) {
          bloom.ctx.save();
          bloom.ctx.globalAlpha = Math.min(0.46, acidAmount * 0.34)
            * Math.max(0.34, 1 - voltageNormalized * 0.58);
          bloom.ctx.globalCompositeOperation = 'screen';
          bloom.ctx.filter = 'blur(' + bloomRadius.toFixed(2) + 'px) saturate(' + (1.2 + acidAmount * 1.8).toFixed(2) + ')';
          bloom.ctx.drawImage(work.canvas, 0, 0);
          bloom.ctx.restore();
        }
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.globalCompositeOperation = 'source-over';
        targetCtx.drawImage(extrusion, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        if (acidAmount > 0.08) {
          targetCtx.globalCompositeOperation = 'screen';
          targetCtx.drawImage(cyanRim, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
          targetCtx.drawImage(magentaRim, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
          targetCtx.drawImage(limeRim, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
          if (voltage > 0.05) targetCtx.drawImage(whiteRim, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        }
        if (bloomRadius > 0.65 && acidAmount > 0.08) {
          targetCtx.globalCompositeOperation = 'screen';
          targetCtx.drawImage(bloom.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
          targetCtx.globalCompositeOperation = 'source-over';
        }
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderLigatureCryptV31(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var reachAggregate = surfaceAggregate(glyphs, 'ligatureCrypt', 'ligatureReach', params.ligatureReach);
        if (!reachAggregate.weight || reachAggregate.value <= 0.001) return;
        var grammar = surfaceChoice(glyphs, 'ligatureCrypt', 'ligatureGrammar', params.ligatureGrammar, BATCH_PARAM_OPTIONS.ligatureGrammar);
        var weave = surfaceAggregate(glyphs, 'ligatureCrypt', 'ligatureWeave', params.ligatureWeave).value;
        var reach = Math.max(0, reachAggregate.value * pixelScale * L.s);
        var band = Math.max(1, surfaceAggregate(glyphs, 'ligatureCrypt', 'ligatureBand', params.ligatureBand).value * pixelScale * L.s);
        var rise = surfaceAggregate(glyphs, 'ligatureCrypt', 'ligatureRise', params.ligatureRise).value;
        var counter = surfaceAggregate(glyphs, 'ligatureCrypt', 'ligatureCounter', params.ligatureCounter).value;
        var knot = Math.max(0, surfaceAggregate(glyphs, 'ligatureCrypt', 'ligatureKnot', params.ligatureKnot).value * pixelScale * L.s);
        var mask = buildSurfaceMask(glyphs, 'ligatureCrypt', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'ligatureCrypt', coverBase);
        var nodes = surfaceNodesForGlyphs(glyphs, 'ligatureCrypt', 97, pixelScale, L, 0, 0, 0);
        if (!nodes.length) return;
        if (grammar !== 'ribbon') {
          var constructionPairs = [];
          for (var constructionIndex = 0; constructionIndex < nodes.length - 1 && constructionPairs.length < 96; constructionIndex++) {
            var constructionA = nodes[constructionIndex];
            var constructionB = nodes[constructionIndex + 1];
            // Newlines are not ligatures. The old centre-to-centre bridge
            // connected the last glyph of one line to the first of the next,
            // producing the large accidental vertical ribbon seen in normal
            // multi-line text.
            if (constructionA.glyph && constructionB.glyph
              && (constructionA.glyph.line !== constructionB.glyph.line
                || constructionA.glyph.word !== constructionB.glyph.word)) continue;
            var centerDx = constructionB.x - constructionA.x;
            var centerDy = constructionB.y - constructionA.y;
            var horizontal = Math.abs(centerDx) >= Math.abs(centerDy) * 0.72;
            var directionPositive = horizontal ? centerDx >= 0 : centerDy >= 0;
            var anchorVariance = (hash(constructionIndex, params.seed % 89, 2147) * 2 - 1) * 0.12;
            var anchorA = surfaceGlyphNode(constructionA.glyph, 'ligatureCrypt', pixelScale, L, 0, 0, 0,
              constructionA.glyphIndex, horizontal ? (directionPositive ? 0.82 : 0.18) : 0.5 + anchorVariance,
              horizontal ? 0.5 + anchorVariance : (directionPositive ? 0.82 : 0.18), 0.5);
            var anchorB = surfaceGlyphNode(constructionB.glyph, 'ligatureCrypt', pixelScale, L, 0, 0, 0,
              constructionB.glyphIndex, horizontal ? (directionPositive ? 0.18 : 0.82) : 0.5 - anchorVariance,
              horizontal ? 0.5 - anchorVariance : (directionPositive ? 0.18 : 0.82), 0.5);
            var anchorDx = anchorB.x - anchorA.x, anchorDy = anchorB.y - anchorA.y;
            var anchorDistance = Math.sqrt(anchorDx * anchorDx + anchorDy * anchorDy);
            if (anchorDistance < 1 || anchorDistance > reach) continue;
            constructionPairs.push({
              a: anchorA, b: anchorB, distance: anchorDistance,
              strength: Math.min(constructionA.strength, constructionB.strength),
              glyphA: constructionA, glyphB: constructionB
            });
          }
          var constructionWork = surfaceScratch('ligature-crypt-construction', width, height, false);
          var constructionCtx = constructionWork.ctx;
          constructionCtx.fillStyle = surfaceEffectColor('ligatureCrypt');
          constructionCtx.strokeStyle = surfaceEffectColor('ligatureCrypt');
          constructionCtx.lineCap = grammar === 'blackletter' ? 'square' : 'round';
          constructionCtx.lineJoin = grammar === 'blackletter' ? 'miter' : 'round';

          if (!constructionPairs.length && nodes.length === 1) {
            var constructionSolitary = nodes[0];
            var constructionSeal = Math.max(knot * 1.8, Math.min(constructionSolitary.r, band * 1.25));
            constructionCtx.globalAlpha = constructionSolitary.strength;
            constructionCtx.lineWidth = Math.max(0.8, band * 0.1);
            traceLigatureCryptSeal(constructionCtx, constructionSolitary.x, constructionSolitary.y,
              -Math.PI / 2, constructionSeal);
          }

          for (var constructionPairIndex = 0; constructionPairIndex < constructionPairs.length; constructionPairIndex++) {
            var constructionPair = constructionPairs[constructionPairIndex];
            var constructionDirection = constructionPairIndex % 2 ? -1 : 1;
            var constructionRiseVariation = 0.55
              + hash(constructionPairIndex, params.seed % 101, 2151) * 0.9;
            var constructionRise = constructionDirection * Math.min(constructionPair.distance * 0.35,
              Math.abs(rise) * band * (0.42 + Math.min(4, weave) * 0.14) * constructionRiseVariation);
            if (grammar === 'joinery' && constructionPairIndex % 4 === 0) constructionRise *= 0.28;
            if (rise < 0) constructionRise *= -1;
            var constructionHalf = Math.min(constructionPair.distance * 0.26,
              band * (grammar === 'suture' ? 0.16 : grammar === 'blackletter' ? 0.48 : 0.38));
            var constructionWaist = Math.max(0.18, Math.min(0.88,
              0.64 - counter * 0.22 + hash(constructionPairIndex, params.seed, 2153) * 0.16));
            var constructionAngular = grammar === 'blackletter';
            var constructionGeometry = ligatureConstructionGeometry(constructionPair, constructionRise);

            if (grammar !== 'suture') {
              constructionCtx.globalAlpha = constructionPair.strength * (grammar === 'blackletter' ? 0.86 : 0.72);
              traceLigatureConstructionBand(constructionCtx, constructionPair, constructionHalf,
                constructionRise, constructionWaist, constructionAngular);
              constructionCtx.fill();
              constructionCtx.globalAlpha = constructionPair.strength;
              constructionCtx.lineWidth = Math.max(0.65, band * (grammar === 'blackletter' ? 0.095 : 0.065));
              traceLigatureConstructionBand(constructionCtx, constructionPair, constructionHalf,
                constructionRise, constructionWaist, constructionAngular);
              constructionCtx.stroke();
              constructionCtx.strokeStyle = params.paper;
              constructionCtx.globalAlpha = constructionPair.strength * Math.min(0.88, 0.36 + counter * 0.34);
              constructionCtx.lineWidth = Math.max(0.7, constructionHalf * Math.min(0.52, 0.16 + counter * 0.28));
              strokeLigatureConstructionRail(constructionCtx, constructionPair, constructionRise, 0, constructionAngular);
              constructionCtx.strokeStyle = surfaceEffectColor('ligatureCrypt');
              if (grammar === 'joinery') {
                var joineryRailOffset = constructionHalf * 0.56;
                constructionCtx.strokeStyle = params.paper;
                constructionCtx.globalAlpha = constructionPair.strength * 0.58;
                constructionCtx.lineWidth = Math.max(0.6, band * 0.042);
                strokeLigatureConstructionRail(constructionCtx, constructionPair, constructionRise,
                  joineryRailOffset, false);
                strokeLigatureConstructionRail(constructionCtx, constructionPair, constructionRise,
                  -joineryRailOffset, false);
                constructionCtx.strokeStyle = surfaceEffectColor('ligatureCrypt');
                constructionCtx.globalAlpha = constructionPair.strength * 0.88;
                constructionCtx.lineWidth = Math.max(0.4, band * 0.019);
                strokeLigatureConstructionRail(constructionCtx, constructionPair, constructionRise,
                  joineryRailOffset, false);
                strokeLigatureConstructionRail(constructionCtx, constructionPair, constructionRise,
                  -joineryRailOffset, false);
              }
            } else {
              var sutureSpread = Math.max(1.2 * pixelScale * L.s,
                Math.min(constructionHalf, band * (0.12 + weave * 0.06)));
              constructionCtx.globalAlpha = constructionPair.strength * 0.86;
              constructionCtx.lineWidth = Math.max(0.55, band * 0.045);
              strokeLigatureConstructionRail(constructionCtx, constructionPair, constructionRise,
                sutureSpread, false);
              strokeLigatureConstructionRail(constructionCtx, constructionPair, constructionRise,
                -sutureSpread, false);
            }

            // Edge plates and diamonds make the bridge terminate in the glyph
            // rather than floating from centre point to centre point.
            constructionCtx.globalAlpha = constructionPair.strength * 0.82;
            constructionCtx.lineWidth = Math.max(0.55, band * 0.055);
            var capHalf = Math.max(constructionHalf * 0.86, knot * 0.45);
            for (var capIndex = 0; capIndex < 2; capIndex++) {
              var capNode = capIndex ? constructionPair.b : constructionPair.a;
              var inwardSign = capIndex ? 1 : -1;
              var plateDepth = Math.max(band * 0.18,
                Math.min(capHalf * 1.4, constructionPair.distance * 0.13));
              var plateInnerX = capNode.x + constructionGeometry.ux * inwardSign * plateDepth;
              var plateInnerY = capNode.y + constructionGeometry.uy * inwardSign * plateDepth;
              constructionCtx.globalAlpha = constructionPair.strength * 0.72;
              constructionCtx.beginPath();
              constructionCtx.moveTo(capNode.x - constructionGeometry.nx * capHalf,
                capNode.y - constructionGeometry.ny * capHalf);
              constructionCtx.lineTo(plateInnerX - constructionGeometry.nx * capHalf * 1.28,
                plateInnerY - constructionGeometry.ny * capHalf * 1.28);
              constructionCtx.lineTo(plateInnerX + constructionGeometry.nx * capHalf * 1.28,
                plateInnerY + constructionGeometry.ny * capHalf * 1.28);
              constructionCtx.lineTo(capNode.x + constructionGeometry.nx * capHalf,
                capNode.y + constructionGeometry.ny * capHalf);
              constructionCtx.closePath();
              constructionCtx.fill();
              constructionCtx.globalAlpha = constructionPair.strength * 0.88;
              constructionCtx.beginPath();
              constructionCtx.moveTo(capNode.x - constructionGeometry.nx * capHalf,
                capNode.y - constructionGeometry.ny * capHalf);
              constructionCtx.lineTo(capNode.x + constructionGeometry.nx * capHalf,
                capNode.y + constructionGeometry.ny * capHalf);
              constructionCtx.stroke();
            }
            if (grammar === 'joinery') {
              var mortiseLength = Math.max(2 * pixelScale * L.s,
                Math.min(constructionPair.distance * 0.11, band * (0.18 + weave * 0.045)));
              var mortiseHalf = Math.max(0.8 * pixelScale * L.s,
                Math.min(constructionHalf * 0.48, band * (0.055 + counter * 0.08)));
              constructionCtx.save();
              constructionCtx.translate(constructionGeometry.midX, constructionGeometry.midY);
              constructionCtx.rotate(Math.atan2(constructionGeometry.uy, constructionGeometry.ux));
              constructionCtx.fillStyle = params.paper;
              constructionCtx.globalAlpha = constructionPair.strength * Math.min(0.94, 0.58 + counter * 0.24);
              constructionCtx.fillRect(-mortiseLength, -mortiseHalf, mortiseLength * 2, mortiseHalf * 2);
              constructionCtx.strokeStyle = surfaceEffectColor('ligatureCrypt');
              constructionCtx.globalAlpha = constructionPair.strength * 0.82;
              constructionCtx.lineWidth = Math.max(0.55, band * 0.032);
              constructionCtx.strokeRect(-mortiseLength, -mortiseHalf, mortiseLength * 2, mortiseHalf * 2);
              constructionCtx.restore();
              constructionCtx.fillStyle = surfaceEffectColor('ligatureCrypt');
              constructionCtx.strokeStyle = surfaceEffectColor('ligatureCrypt');
            }
            if (grammar === 'blackletter') {
              var diamond = Math.max(1, Math.min(band * 0.22, knot + band * 0.08));
              constructionCtx.save();
              constructionCtx.translate(constructionGeometry.midX, constructionGeometry.midY);
              constructionCtx.rotate(Math.atan2(constructionGeometry.dy, constructionGeometry.dx) + Math.PI / 4);
              constructionCtx.fillRect(-diamond * 0.5, -diamond * 0.5, diamond, diamond);
              constructionCtx.restore();
            } else if (grammar === 'joinery' && constructionPairIndex % 3 === 1) {
              var joineryRivet = Math.max(1.2 * pixelScale * L.s,
                Math.min(knot * 0.62 + band * 0.06, constructionHalf * 0.42));
              constructionCtx.beginPath();
              constructionCtx.arc(constructionGeometry.midX, constructionGeometry.midY,
                joineryRivet, 0, Math.PI * 2);
              constructionCtx.fill();
              constructionCtx.strokeStyle = params.paper;
              constructionCtx.globalAlpha = constructionPair.strength * 0.76;
              constructionCtx.lineWidth = Math.max(0.45, joineryRivet * 0.22);
              constructionCtx.beginPath();
              constructionCtx.arc(constructionGeometry.midX, constructionGeometry.midY,
                joineryRivet * 0.45, 0, Math.PI * 2);
              constructionCtx.stroke();
              constructionCtx.strokeStyle = surfaceEffectColor('ligatureCrypt');
            }

            var stitchCount = Math.min(18, Math.max(2, Math.round(2 + weave * 3.2
              + constructionPair.distance / Math.max(18, band * 2.4))));
            for (var stitchIndex = 1; stitchIndex < stitchCount; stitchIndex++) {
              if (grammar === 'joinery' && stitchIndex % 2 === 0 && weave < 2) continue;
              var stitchPoint = ligatureConstructionPoint(constructionPair, constructionRise,
                stitchIndex / stitchCount);
              var stitchHalf = grammar === 'suture'
                ? Math.max(2 * pixelScale * L.s, constructionHalf * 1.5)
                : Math.max(1, constructionHalf * (0.34 + Math.min(4, weave) * 0.08));
              constructionCtx.globalAlpha = constructionPair.strength * (grammar === 'suture' ? 0.78 : 0.42);
              constructionCtx.lineWidth = Math.max(0.45, band * (grammar === 'suture' ? 0.032 : 0.024));
              constructionCtx.beginPath();
              constructionCtx.moveTo(stitchPoint.x - stitchPoint.nx * stitchHalf,
                stitchPoint.y - stitchPoint.ny * stitchHalf);
              constructionCtx.lineTo(stitchPoint.x + stitchPoint.nx * stitchHalf,
                stitchPoint.y + stitchPoint.ny * stitchHalf);
              constructionCtx.stroke();
            }
          }
          constructionCtx.globalAlpha = 1;
          constructionCtx.globalCompositeOperation = 'source-over';
          targetCtx.save();
          targetCtx.setTransform(1, 0, 0, 1, 0, 0);
          targetCtx.drawImage(constructionWork.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
          targetCtx.restore();
          return;
        }
        var pairs = [];
        for (var i = 0; i < nodes.length - 1 && pairs.length < 96; i++) {
          var a = nodes[i], b = nodes[i + 1];
          if (a.glyph && b.glyph
            && (a.glyph.line !== b.glyph.line || a.glyph.word !== b.glyph.word)) continue;
          var dx = b.x - a.x, dy = b.y - a.y;
          var distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < 1 || distance > reach) continue;
          var directionX = dx / distance, directionY = dy / distance;
          var anchorInsetA = Math.min(a.r * 0.58, distance * 0.22);
          var anchorInsetB = Math.min(b.r * 0.58, distance * 0.22);
          pairs.push({
            a: { x: a.x + directionX * anchorInsetA, y: a.y + directionY * anchorInsetA, source: a },
            b: { x: b.x - directionX * anchorInsetB, y: b.y - directionY * anchorInsetB, source: b },
            distance: Math.max(1, distance - anchorInsetA - anchorInsetB),
            strength: Math.min(a.strength, b.strength),
            directionX: directionX, directionY: directionY
          });
        }
        var work = surfaceScratch('ligature-crypt', width, height, false);
        var ctx = work.ctx;
        ctx.fillStyle = surfaceEffectColor('ligatureCrypt');
        ctx.strokeStyle = surfaceEffectColor('ligatureCrypt');
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (!pairs.length && nodes.length === 1) {
          var solitary = nodes[0];
          var solitarySize = Math.max(knot * 1.8, Math.min(solitary.r * 0.72, band * 1.2));
          ctx.globalAlpha = solitary.strength;
          ctx.lineWidth = Math.max(0.8, band * 0.12);
          traceLigatureCryptSeal(ctx, solitary.x, solitary.y, -Math.PI / 2, solitarySize);
          ctx.beginPath();
          ctx.ellipse(solitary.x, solitary.y, solitarySize * 1.45, solitarySize * 0.7,
            hash(solitary.glyphIndex, params.seed, 2127) * Math.PI, 0, Math.PI * 2);
          ctx.stroke();
        }

        for (var p = 0; p < pairs.length; p++) {
          var pair = pairs[p];
          var curve = ligatureCryptCurve(pair, p, band, rise);
          pair.cryptRise = curve.rise;
          pair.cryptSkew = curve.skew;
          var halfWidth = Math.min(pair.distance * 0.25, band * 0.32 * (0.72 + pair.strength * 0.28));
          pair.cryptHalfWidth = halfWidth;
          ctx.globalAlpha = pair.strength * 0.62;
          traceLigatureCryptBand(ctx, pair.a, pair.b, halfWidth, curve.rise, curve.skew);
          ctx.fill();
          ctx.globalAlpha = pair.strength;
          ctx.lineWidth = Math.max(0.6, Math.min(halfWidth * 0.24, band * 0.1));
          traceLigatureCryptBand(ctx, pair.a, pair.b, halfWidth, curve.rise, curve.skew);
          ctx.stroke();
        }
        if (counter > 0.005) {
          ctx.globalCompositeOperation = 'destination-out';
          for (var c = 0; c < pairs.length; c++) {
            var counterPair = pairs[c];
            var apertureInterval = counter > 0.32 ? 2 : 3;
            if (c % apertureInterval !== 1) continue;
            var outerHalf = counterPair.cryptHalfWidth;
            var innerHalf = outerHalf * Math.min(0.8, 0.24 + counter * 0.52);
            if (innerHalf <= 0.2 || counterPair.distance < outerHalf * 2.4) continue;
            ctx.globalAlpha = Math.min(1, counterPair.strength * (0.72 + counter * 0.28));
            var counterMidX = (counterPair.a.x + counterPair.b.x) * 0.5
              - counterPair.directionY * counterPair.cryptRise * (0.64 + counterPair.cryptSkew * 0.08);
            var counterMidY = (counterPair.a.y + counterPair.b.y) * 0.5
              + counterPair.directionX * counterPair.cryptRise * (0.64 + counterPair.cryptSkew * 0.08);
            cutLigatureCryptAperture(ctx, counterMidX, counterMidY,
              Math.atan2(counterPair.directionY, counterPair.directionX),
              Math.min(counterPair.distance * 0.25, outerHalf * (1.6 + counter * 0.46)), innerHalf);
          }
          ctx.globalCompositeOperation = 'source-over';
        }

        // The cut counter exposes a continuous suture, turning a row of
        // polygons into one word-bound connective structure.
        for (var spineIndex = 0; spineIndex < pairs.length; spineIndex++) {
          var spinePair = pairs[spineIndex];
          ctx.strokeStyle = params.paper;
          ctx.globalAlpha = spinePair.strength * (0.42 + Math.min(1, counter) * 0.2);
          ctx.lineWidth = Math.max(0.7, Math.min(band * 0.105, 4 * pixelScale * L.s));
          ctx.setLineDash(spineIndex % 2 ? [band * 0.36, band * 0.18] : []);
          strokeLigatureCryptSpine(ctx, spinePair.a, spinePair.b,
            spinePair.cryptRise, spinePair.cryptSkew, 0);
          ctx.setLineDash([]);
          ctx.globalAlpha = spinePair.strength * 0.2;
          ctx.lineWidth = Math.max(0.45, Math.min(band * 0.045, 1.7 * pixelScale * L.s));
          strokeLigatureCryptSpine(ctx, spinePair.a, spinePair.b,
            spinePair.cryptRise, spinePair.cryptSkew, spinePair.cryptHalfWidth * 0.46);
          strokeLigatureCryptSpine(ctx, spinePair.a, spinePair.b,
            spinePair.cryptRise, spinePair.cryptSkew, -spinePair.cryptHalfWidth * 0.46);
          var midX = (spinePair.a.x + spinePair.b.x) * 0.5
            - spinePair.directionY * spinePair.cryptRise * (0.64 + spinePair.cryptSkew * 0.08);
          var midY = (spinePair.a.y + spinePair.b.y) * 0.5
            + spinePair.directionX * spinePair.cryptRise * (0.64 + spinePair.cryptSkew * 0.08);
          var sealSize = Math.max(ctx.lineWidth * 1.8, Math.min(band * 0.38, spinePair.distance * 0.12));
          ctx.lineWidth = Math.max(0.5, ctx.lineWidth * 0.72);
          ctx.globalAlpha = spinePair.strength * 0.62;
          if (spineIndex % 3 === 1 || (spineIndex + spinePair.a.source.glyphIndex) % 7 === 0) {
            traceLigatureCryptSeal(ctx, midX, midY,
              Math.atan2(spinePair.directionY, spinePair.directionX) + Math.PI / 2,
              sealSize);
          }
        }

        if (knot > 0.2) {
          ctx.strokeStyle = surfaceEffectColor('ligatureCrypt');
          var nodeDegree = [];
          for (var pairIndex = 0; pairIndex < pairs.length; pairIndex++) {
            var pairSourceA = pairs[pairIndex].a.source.glyphIndex;
            var pairSourceB = pairs[pairIndex].b.source.glyphIndex;
            nodeDegree[pairSourceA] = (nodeDegree[pairSourceA] || 0) + 1;
            nodeDegree[pairSourceB] = (nodeDegree[pairSourceB] || 0) + 1;
          }
          for (var n = 0; n < nodes.length; n++) {
            var node = nodes[n];
            if (n % 2 && (nodeDegree[node.glyphIndex] || 0) < 3) continue;
            var radius = Math.max(0.5, knot * (0.58 + hash(node.glyphIndex, params.seed, 2131) * 0.42));
            ctx.save();
            ctx.translate(node.x, node.y);
            ctx.rotate(hash(node.glyphIndex, params.seed, 2137) * Math.PI);
            ctx.globalAlpha = node.strength * 0.76;
            ctx.lineWidth = Math.max(0.5, Math.min(radius * 0.28, band * 0.08));
            ctx.beginPath();
            ctx.ellipse(-radius * 0.28, 0, radius * 0.74, radius * 0.38, Math.PI / 4, 0, Math.PI * 2);
            ctx.ellipse(radius * 0.28, 0, radius * 0.74, radius * 0.38, -Math.PI / 4, 0, Math.PI * 2);
            ctx.stroke();
            if ((nodeDegree[node.glyphIndex] || 0) > 1) {
              ctx.beginPath();
              ctx.arc(0, 0, radius * 0.24, 0, Math.PI * 2);
              ctx.stroke();
            }
            ctx.restore();
          }
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderLigatureCryptV32(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase, grammar) {
        var reachAggregate = surfaceAggregate(glyphs, 'ligatureCrypt', 'ligatureReach', params.ligatureReach);
        if (!reachAggregate.weight || reachAggregate.value <= 0.001) return;
        var weave = surfaceAggregate(glyphs, 'ligatureCrypt', 'ligatureWeave', params.ligatureWeave).value;
        var reach = Math.max(0, reachAggregate.value * pixelScale * L.s);
        var band = Math.max(1, surfaceAggregate(glyphs, 'ligatureCrypt', 'ligatureBand', params.ligatureBand).value * pixelScale * L.s);
        var rise = surfaceAggregate(glyphs, 'ligatureCrypt', 'ligatureRise', params.ligatureRise).value;
        var counter = surfaceAggregate(glyphs, 'ligatureCrypt', 'ligatureCounter', params.ligatureCounter).value;
        var knot = Math.max(0, surfaceAggregate(glyphs, 'ligatureCrypt', 'ligatureKnot', params.ligatureKnot).value * pixelScale * L.s);
        var mask = buildSurfaceMask(glyphs, 'ligatureCrypt', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'ligatureCrypt', coverBase);
        var nodes = surfaceNodesForGlyphs(glyphs, 'ligatureCrypt', 97, pixelScale, L, 0, 0, 0);
        if (!nodes.length) return;
        var maskData;
        try { maskData = mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height).data; }
        catch (error) {
          renderLigatureCryptV31(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        var pairs = ligatureCryptPairsV32(nodes, maskData, width, height, reach, band);
        var body = surfaceScratch('ligature-crypt-word-form-v32', width, height, false);
        body.ctx.drawImage(mask, 0, 0);
        body.ctx.fillStyle = '#fff';
        body.ctx.strokeStyle = '#fff';
        var solitary = [];
        for (var pairIndex = 0; pairIndex < pairs.length; pairIndex++) {
          var pair = pairs[pairIndex];
          if (grammar === 'joinery') ligatureCryptDrawMortiseMaskV32(body.ctx, pair, band, weave, counter, knot);
          else if (grammar === 'blackletter') ligatureCryptDrawBraidMaskV32(body.ctx, pair, band, weave, counter, rise);
          else ligatureCryptPrepareSutureV32(body.ctx, pair, band, weave, counter, knot, rise);
        }
        if (!pairs.length) {
          for (var nodeIndex = 0; nodeIndex < nodes.length && nodeIndex < 16; nodeIndex++) {
            solitary.push(ligatureCryptPrepareSolitaryV32(body.ctx, maskData, width, height,
              nodes[nodeIndex], grammar, band, weave, counter, knot, rise));
          }
        }

        var painted = surfaceScratch('ligature-crypt-word-form-paint-v32', width, height, false);
        painted.ctx.drawImage(body.canvas, 0, 0);
        painted.ctx.globalCompositeOperation = 'source-in';
        painted.ctx.fillStyle = surfaceEffectColor('ligatureCrypt');
        painted.ctx.fillRect(0, 0, width, height);
        painted.ctx.globalCompositeOperation = 'source-over';
        for (var detailIndex = 0; detailIndex < pairs.length; detailIndex++) {
          if (grammar === 'joinery') ligatureCryptPaintMortiseV32(painted.ctx, pairs[detailIndex], weave, counter, knot);
          else if (grammar === 'blackletter') ligatureCryptPaintBraidV32(painted.ctx, pairs[detailIndex], weave, counter);
          else ligatureCryptPaintSutureV32(painted.ctx, pairs[detailIndex], band, weave, knot);
        }
        for (var solitaryIndex = 0; solitaryIndex < solitary.length; solitaryIndex++) {
          ligatureCryptPaintSolitaryV32(painted.ctx, solitary[solitaryIndex]);
        }
        painted.ctx.globalAlpha = 1;
        painted.ctx.globalCompositeOperation = 'source-over';
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(painted.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderLigatureCrypt(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var grammar = surfaceChoice(glyphs, 'ligatureCrypt', 'ligatureGrammar',
          params.ligatureGrammar, BATCH_PARAM_OPTIONS.ligatureGrammar);
        if (grammar === 'ribbon') {
          renderLigatureCryptV31(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        renderLigatureCryptV32(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase, grammar);
      }

      function renderMoireChoirLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var pitchAggregate = surfaceAggregate(glyphs, 'moireChoir', 'moirePitch', params.moirePitch);
        if (!pitchAggregate.weight) return;
        var pitch = Math.max(1, pitchAggregate.value * pixelScale * L.s);
        var detune = surfaceAggregate(glyphs, 'moireChoir', 'moireDetune', params.moireDetune).value;
        var angle = surfaceAggregate(glyphs, 'moireChoir', 'moireAngle', params.moireAngle).value * Math.PI / 180;
        var depth = surfaceAggregate(glyphs, 'moireChoir', 'moireDepth', params.moireDepth).value;
        var reach = Math.max(0, surfaceAggregate(glyphs, 'moireChoir', 'moireReach', params.moireReach).value * pixelScale * L.s);
        var mask = buildSurfaceMask(glyphs, 'moireChoir', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'moireChoir', coverBase);
        var maskCtx = mask.getContext('2d', { willReadFrequently: true });
        var source;
        try { source = maskCtx.getImageData(0, 0, width, height); }
        catch (error) { return; }
        var field = surfaceBoundaryDistance(source.data, width, height);
        if (!field.bounds) return;
        var work = surfaceScratch('moire-choir', width, height, false);
        var output = work.ctx.createImageData(width, height);
        var rgb = surfaceHexRgb(surfaceEffectColor('moireChoir'));
        var frequency = Math.PI * 2 / pitch;
        var secondFrequency = frequency * Math.max(0.12, 1 + detune * 0.72);
        var secondAngle = angle + detune * Math.PI * 0.46;
        var cosA = Math.cos(angle), sinA = Math.sin(angle);
        var cosB = Math.cos(secondAngle), sinB = Math.sin(secondAngle);
        var motionPhase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var seedPhase = params.seed * 0.173;
        var pad = Math.ceil(reach + pitch * 2);
        var minX = Math.max(0, Math.floor(field.bounds[0] - pad));
        var minY = Math.max(0, Math.floor(field.bounds[1] - pad));
        var maxX = Math.min(width - 1, Math.ceil(field.bounds[2] + pad));
        var maxY = Math.min(height - 1, Math.ceil(field.bounds[3] + pad));
        for (var y = minY; y <= maxY; y++) for (var x = minX; x <= maxX; x++) {
          var index = y * width + x;
          var inside = !!field.inside[index];
          var distance = field.distance[index];
          if (!inside && (reach <= 0 || distance > reach)) continue;
          var influence = inside ? 1 : Math.pow(Math.max(0, 1 - distance / Math.max(1, reach)), 1.18);
          var distancePhase = distance / pitch * depth;
          var phaseA = (x * cosA + y * sinA) * frequency + distancePhase + motionPhase + seedPhase;
          var phaseB = (x * cosB + y * sinB) * secondFrequency - distancePhase * 0.73 - motionPhase * 0.61 - seedPhase * 0.47;
          var lineA = Math.pow(Math.max(0, 1 - Math.abs(Math.sin(phaseA))), 3.4);
          var lineB = Math.pow(Math.max(0, 1 - Math.abs(Math.sin(phaseB))), 3.4);
          var beat = 0.5 + Math.cos(phaseA - phaseB) * 0.5;
          var filament = Math.max(lineA, lineB) * (0.16 + beat * 0.72) + Math.min(lineA, lineB) * 0.72;
          var sourceAlpha = source.data[index * 4 + 3] / 255;
          var alpha = Math.min(1, filament) * influence * pitchAggregate.strength * (inside ? 0.68 + sourceAlpha * 0.32 : 0.78);
          if (alpha <= 0.008) continue;
          output.data[index * 4] = rgb[0];
          output.data[index * 4 + 1] = rgb[1];
          output.data[index * 4 + 2] = rgb[2];
          output.data[index * 4 + 3] = Math.round(alpha * 255);
        }

        // Output pixels sample the fixed geometry and original glyph raster.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext;RC.field(output,function(px,py,rgba){var x=px-.5,y=py-.5;if(y<(minY)||!(y <= maxY))return;if(x<(minX)||!(x <= maxX))return;
          var index = Math.floor(y) * width + Math.floor(x);
          var inside = !!(RC.sample(field.inside,width,height,x,y)>=.5);
          var distance = RC.sample(field.distance,width,height,x,y);
          if (!inside && (reach <= 0 || distance > reach)) return;
          var influence = inside ? 1 : Math.pow(Math.max(0, 1 - distance / Math.max(1, reach)), 1.18);
          var distancePhase = distance / pitch * depth;
          var phaseA = (x * cosA + y * sinA) * frequency + distancePhase + motionPhase + seedPhase;
          var phaseB = (x * cosB + y * sinB) * secondFrequency - distancePhase * 0.73 - motionPhase * 0.61 - seedPhase * 0.47;
          var lineA = Math.pow(Math.max(0, 1 - Math.abs(Math.sin(phaseA))), 3.4);
          var lineB = Math.pow(Math.max(0, 1 - Math.abs(Math.sin(phaseB))), 3.4);
          var beat = 0.5 + Math.cos(phaseA - phaseB) * 0.5;
          var filament = Math.max(lineA, lineB) * (0.16 + beat * 0.72) + Math.min(lineA, lineB) * 0.72;
          var sourceAlpha = RC.rasterSample(source.data,width,height,x,y,3) / 255;
          var alpha = Math.min(1, filament) * influence * pitchAggregate.strength * (inside ? 0.68 + sourceAlpha * 0.32 : 0.78);
          if (alpha <= 0.008) return;
          rgba[0] = rgb[0];
          rgba[1] = rgb[1];
          rgba[2] = rgb[2];
          rgba[3] = Math.round(alpha * 255);

        });}
        work.ctx.putImageData(output, 0, 0);
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderNaveCutterLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var columnAggregate = surfaceAggregate(glyphs, 'naveCutter', 'naveColumns', params.naveColumns);
        if (!columnAggregate.weight) return;
        var columns = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('naveColumns', Math.round(columnAggregate.value), 0, 1, 24) : Math.max(1, Math.min(24, Math.round(columnAggregate.value))));
        var rise = surfaceAggregate(glyphs, 'naveCutter', 'naveRise', params.naveRise).value;
        var voidAmount = surfaceAggregate(glyphs, 'naveCutter', 'naveVoid', params.naveVoid).value;
        var buttress = Math.max(0, surfaceAggregate(glyphs, 'naveCutter', 'naveButtress', params.naveButtress).value * pixelScale * L.s);
        var warp = surfaceAggregate(glyphs, 'naveCutter', 'naveWarp', params.naveWarp).value;
        var mask = buildSurfaceMask(glyphs, 'naveCutter', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'naveCutter', coverBase);
        var maskCtx = mask.getContext('2d', { willReadFrequently: true });
        var source;
        try { source = maskCtx.getImageData(0, 0, width, height); }
        catch (error) { return; }
        var field = surfaceBoundaryDistance(source.data, width, height);
        if (!field.bounds) return;
        var work = surfaceScratch('nave-cutter', width, height, false);
        var ctx = work.ctx;
        ctx.drawImage(mask, 0, 0);
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = surfaceEffectColor('naveCutter');
        ctx.fillRect(0, 0, width, height);
        var minX = field.bounds[0], minY = field.bounds[1], maxX = field.bounds[2], maxY = field.bounds[3];
        var spanW = Math.max(1, maxX - minX + 1);
        var spanH = Math.max(1, maxY - minY + 1);
        var cellWidth = spanW / columns;
        if (voidAmount > 0.001) {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.globalAlpha = Math.min(1, voidAmount * 1.7);
          for (var i = 0; i < columns; i++) {
            var centerX = minX + (i + 0.5) * cellWidth
              + Math.sin((i + 1) * 1.731 + params.seed * 0.17) * warp * cellWidth * 0.22;
            var apertureWidth = Math.max(1, cellWidth * (0.16 + voidAmount * 0.76));
            var baseY = maxY + 2;
            var archHeight = spanH * (0.34 + voidAmount * 0.52);
            var apexY = baseY - archHeight * rise;
            var shoulderY = baseY - archHeight * 0.5;
            ctx.beginPath();
            ctx.moveTo(centerX - apertureWidth * 0.5, baseY);
            ctx.lineTo(centerX - apertureWidth * 0.5, shoulderY);
            ctx.quadraticCurveTo(centerX - apertureWidth * 0.44, apexY + archHeight * 0.13, centerX, apexY);
            ctx.quadraticCurveTo(centerX + apertureWidth * 0.44, apexY + archHeight * 0.13, centerX + apertureWidth * 0.5, shoulderY);
            ctx.lineTo(centerX + apertureWidth * 0.5, baseY);
            ctx.closePath();
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        if (buttress > 0.05) {
          var supports = surfaceScratch('nave-cutter-supports', width, height, false);
          supports.ctx.strokeStyle = surfaceEffectColor('naveCutter');
          supports.ctx.fillStyle = surfaceEffectColor('naveCutter');
          supports.ctx.lineCap = 'square';
          supports.ctx.lineJoin = 'miter';
          supports.ctx.lineWidth = buttress;
          for (var s = 0; s <= columns; s++) {
            var supportX = minX + s * cellWidth;
            supports.ctx.beginPath();
            supports.ctx.moveTo(supportX, minY);
            supports.ctx.lineTo(supportX, maxY + 1);
            supports.ctx.stroke();
            if (s < columns) {
              supports.ctx.beginPath();
              supports.ctx.moveTo(supportX, maxY);
              supports.ctx.lineTo(supportX + cellWidth * 0.5, minY + spanH * 0.18);
              supports.ctx.lineTo(supportX + cellWidth, maxY);
              supports.ctx.stroke();
            }
          }
          supports.ctx.globalCompositeOperation = 'destination-in';
          supports.ctx.drawImage(mask, 0, 0);
          supports.ctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(supports.canvas, 0, 0);
        }
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderCloisterFoldLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var planeAggregate = surfaceAggregate(glyphs, 'cloisterFold', 'cloisterPlanes', params.cloisterPlanes);
        if (!planeAggregate.weight) return;
        var planes = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('cloisterPlanes', Math.round(planeAggregate.value), 0, 1, 32) : Math.max(1, Math.min(32, Math.round(planeAggregate.value))));
        var fold = surfaceAggregate(glyphs, 'cloisterFold', 'cloisterFoldAmount', params.cloisterFold).value;
        var axis = surfaceAggregate(glyphs, 'cloisterFold', 'cloisterAxis', params.cloisterAxis).value * Math.PI / 180;
        var perspective = surfaceAggregate(glyphs, 'cloisterFold', 'cloisterPerspective', params.cloisterPerspective).value;
        var crease = Math.max(0, surfaceAggregate(glyphs, 'cloisterFold', 'cloisterCrease', params.cloisterCrease).value * pixelScale * L.s);
        var mask = buildSurfaceMask(glyphs, 'cloisterFold', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'cloisterFold', coverBase);
        var maskCtx = mask.getContext('2d', { willReadFrequently: true });
        var source;
        try { source = maskCtx.getImageData(0, 0, width, height); }
        catch (error) { return; }
        var field = surfaceBoundaryDistance(source.data, width, height);
        if (!field.bounds) return;
        var colored = surfaceScratch('cloister-fold-source', width, height, false);
        colored.ctx.drawImage(mask, 0, 0);
        colored.ctx.globalCompositeOperation = 'source-in';
        colored.ctx.fillStyle = surfaceEffectColor('cloisterFold');
        colored.ctx.fillRect(0, 0, width, height);
        colored.ctx.globalCompositeOperation = 'source-over';
        var work = surfaceScratch('cloister-fold', width, height, false);
        var ctx = work.ctx;
        var foldedMask = surfaceScratch('cloister-fold-mask', width, height, false);
        var foldedMaskCtx = foldedMask.ctx;
        var minX = field.bounds[0], minY = field.bounds[1], maxX = field.bounds[2], maxY = field.bounds[3];
        var centerX = (minX + maxX) * 0.5, centerY = (minY + maxY) * 0.5;
        var spanW = Math.max(1, maxX - minX + 1), spanH = Math.max(1, maxY - minY + 1);
        var ux = Math.cos(axis), uy = Math.sin(axis), nx = -uy, ny = ux;
        var normalSpan = Math.max(1, Math.abs(nx) * spanW + Math.abs(ny) * spanH);
        var band = normalSpan / planes;
        var axialExtent = Math.sqrt(width * width + height * height) + normalSpan * 2;
        var motion = compositionState.enabled ? Math.sin((((compositionState.phase % 1) + 1) % 1) * Math.PI * 2) * 0.16 : 0;
        var foldAmount = fold * (1 + motion);
        var foldMagnitude = Math.min(2, Math.abs(foldAmount));
        for (var plane = 0; plane < planes; plane++) {
          var d0 = -normalSpan * 0.5 + plane * band - 2;
          var d1 = d0 + band + 4;
          var mid = (d0 + d1) * 0.5;
          var p0x = centerX + nx * d0 - ux * axialExtent;
          var p0y = centerY + ny * d0 - uy * axialExtent;
          var p1x = centerX + nx * d0 + ux * axialExtent;
          var p1y = centerY + ny * d0 + uy * axialExtent;
          var p2x = centerX + nx * d1 + ux * axialExtent;
          var p2y = centerY + ny * d1 + uy * axialExtent;
          var p3x = centerX + nx * d1 - ux * axialExtent;
          var p3y = centerY + ny * d1 - uy * axialExtent;
          var sign = ((plane + (foldAmount < 0 ? 1 : 0)) % 2 ? -1 : 1);
          var localCenterX = centerX + nx * mid;
          var localCenterY = centerY + ny * mid;
          var compression = Math.max(0.08, 1 - foldMagnitude * (0.24 + perspective * 0.055));
          var axialScale = Math.max(0.35, 1 + sign * foldAmount * perspective * 0.055);
          var shear = sign * foldAmount * (0.12 + perspective * 0.035);
          var lift = sign * foldAmount * band * (0.18 + perspective * 0.1);
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(p0x, p0y); ctx.lineTo(p1x, p1y); ctx.lineTo(p2x, p2y); ctx.lineTo(p3x, p3y); ctx.closePath();
          ctx.clip();
          ctx.translate(localCenterX, localCenterY);
          ctx.rotate(axis);
          ctx.transform(axialScale, 0, shear, compression, 0, lift);
          ctx.rotate(-axis);
          ctx.translate(-localCenterX, -localCenterY);
          ctx.globalAlpha = planeAggregate.strength * Math.max(0.16,
            0.74 + sign * foldAmount * 0.16 - foldMagnitude * perspective * 0.035);
          ctx.drawImage(colored.canvas, 0, 0);
          ctx.restore();
          foldedMaskCtx.save();
          foldedMaskCtx.beginPath();
          foldedMaskCtx.moveTo(p0x, p0y); foldedMaskCtx.lineTo(p1x, p1y); foldedMaskCtx.lineTo(p2x, p2y); foldedMaskCtx.lineTo(p3x, p3y); foldedMaskCtx.closePath();
          foldedMaskCtx.clip();
          foldedMaskCtx.translate(localCenterX, localCenterY);
          foldedMaskCtx.rotate(axis);
          foldedMaskCtx.transform(axialScale, 0, shear, compression, 0, lift);
          foldedMaskCtx.rotate(-axis);
          foldedMaskCtx.translate(-localCenterX, -localCenterY);
          foldedMaskCtx.globalAlpha = planeAggregate.strength;
          foldedMaskCtx.drawImage(mask, 0, 0);
          foldedMaskCtx.restore();
        }
        if (crease > 0.05 && planes > 1) {
          var baseRgb = surfaceHexRgb(surfaceEffectColor('cloisterFold'));
          var seams = surfaceScratch('cloister-fold-seams', width, height, false);
          var seamCtx = seams.ctx;
          seamCtx.lineCap = 'butt';
          for (var seam = 1; seam < planes; seam++) {
            var seamD = -normalSpan * 0.5 + seam * band;
            var seamX = centerX + nx * seamD;
            var seamY = centerY + ny * seamD;
            var light = seam % 2 === 0;
            seamCtx.strokeStyle = light
              ? 'rgb(' + Math.round(baseRgb[0] + (255 - baseRgb[0]) * 0.62) + ',' + Math.round(baseRgb[1] + (255 - baseRgb[1]) * 0.62) + ',' + Math.round(baseRgb[2] + (255 - baseRgb[2]) * 0.62) + ')'
              : 'rgb(' + Math.round(baseRgb[0] * 0.26) + ',' + Math.round(baseRgb[1] * 0.26) + ',' + Math.round(baseRgb[2] * 0.26) + ')';
            seamCtx.globalAlpha = planeAggregate.strength * Math.min(0.92, 0.2 + foldMagnitude * 0.34);
            seamCtx.lineWidth = crease * (light ? 0.48 : 1);
            seamCtx.beginPath();
            seamCtx.moveTo(seamX - ux * axialExtent, seamY - uy * axialExtent);
            seamCtx.lineTo(seamX + ux * axialExtent, seamY + uy * axialExtent);
            seamCtx.stroke();
          }
          seamCtx.globalAlpha = 1;
          seamCtx.globalCompositeOperation = 'destination-in';
          seamCtx.drawImage(foldedMask.canvas, 0, 0);
          seamCtx.globalCompositeOperation = 'source-over';
          ctx.drawImage(seams.canvas, 0, 0);
        }
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderPrismSacramentLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var refractionAggregate = surfaceAggregate(glyphs, 'prismSacrament', 'prismRefraction', params.prismRefraction);
        if (!refractionAggregate.weight) return;
        var refraction = refractionAggregate.value;
        var dispersion = Math.max(0, surfaceAggregate(glyphs, 'prismSacrament', 'prismDispersion', params.prismDispersion).value * pixelScale * L.s);
        var facets = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('prismFacets', Math.round(surfaceAggregate(glyphs, 'prismSacrament', 'prismFacets', params.prismFacets).value), 0, 1, 32) : Math.max(1, Math.min(32, Math.round(surfaceAggregate(glyphs, 'prismSacrament', 'prismFacets', params.prismFacets).value))));
        var caustic = surfaceAggregate(glyphs, 'prismSacrament', 'prismCaustic', params.prismCaustic).value;
        var bloom = Math.max(0, surfaceAggregate(glyphs, 'prismSacrament', 'prismBloom', params.prismBloom).value * pixelScale * L.s);
        var mask = buildSurfaceMask(glyphs, 'prismSacrament', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'prismSacrament', coverBase);
        var maskCtx = mask.getContext('2d', { willReadFrequently: true });
        var source;
        try { source = maskCtx.getImageData(0, 0, width, height); }
        catch (error) { return; }
        var field = surfaceBoundaryDistance(source.data, width, height);
        if (!field.bounds) return;
        var work = surfaceScratch('prism-sacrament', width, height, false);
        var output = work.ctx.createImageData(width, height);
        var rgbA = surfaceHexRgb(surfaceEffectColor('prismSacrament'));
        var rgbB = surfaceHexRgb(params.prismColorB);
        var facetStep = Math.PI * 2 / facets;
        var phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var pad = Math.ceil(Math.max(bloom, dispersion * 0.72) + 8 * pixelScale * L.s);
        var minX = Math.max(0, Math.floor(field.bounds[0] - pad));
        var minY = Math.max(0, Math.floor(field.bounds[1] - pad));
        var maxX = Math.min(width - 1, Math.ceil(field.bounds[2] + pad));
        var maxY = Math.min(height - 1, Math.ceil(field.bounds[3] + pad));
        function signedDistanceAt(x, y) {
          x = Math.max(0, Math.min(width - 1, Math.round(x)));
          y = Math.max(0, Math.min(height - 1, Math.round(y)));
          var index = y * width + x;
          return field.inside[index] ? field.distance[index] : -field.distance[index];
        }
        function alphaAt(x, y) {
          x = Math.max(0, Math.min(width - 1, Math.round(x)));
          y = Math.max(0, Math.min(height - 1, Math.round(y)));
          return source.data[(y * width + x) * 4 + 3] / 255;
        }
        for (var y = minY; y <= maxY; y++) for (var x = minX; x <= maxX; x++) {
          var index = y * width + x;
          var inside = !!field.inside[index];
          var distance = field.distance[index];
          if (!inside && (bloom <= 0.001 || distance > bloom)) continue;
          var gx = signedDistanceAt(x + 1, y) - signedDistanceAt(x - 1, y);
          var gy = signedDistanceAt(x, y + 1) - signedDistanceAt(x, y - 1);
          var gradientLength = Math.sqrt(gx * gx + gy * gy);
          var rawAngle = gradientLength > 0.001 ? Math.atan2(gy, gx) : Math.atan2(y - (minY + maxY) * 0.5, x - (minX + maxX) * 0.5);
          var facetAngle = Math.round((rawAngle + phase * 0.04) / facetStep) * facetStep;
          var normalX = Math.cos(facetAngle), normalY = Math.sin(facetAngle);
          var baseShift = refraction * (4 + Math.min(48, distance * 0.16)) * pixelScale * L.s;
          var offsetA = baseShift + dispersion * 0.5;
          var offsetB = baseShift - dispersion * 0.5;
          var sampleA = alphaAt(x + normalX * offsetA, y + normalY * offsetA);
          var sampleB = alphaAt(x + normalX * offsetB, y + normalY * offsetB);
          var edgeWidth = Math.max(1, 3 * pixelScale * L.s + dispersion * 0.035);
          var edge = Math.exp(-distance / edgeWidth);
          var sourceAlpha = source.data[index * 4 + 3] / 255;
          var facetHighlight = inside ? Math.pow(Math.max(0, Math.cos(rawAngle * facets - phase)), 12) * (0.12 + Math.min(1, caustic / 6) * 0.34) : 0;
          var outsideFalloff = !inside && bloom > 0 ? Math.pow(Math.max(0, 1 - distance / bloom), 1.7) : 0;
          var causticBand = outsideFalloff * Math.pow(Math.max(0,
            Math.cos(distance / Math.max(2, 7 * pixelScale * L.s + dispersion * 0.055) * Math.PI * 2 + facetAngle * facets * 0.5 - phase)), 6) * Math.min(1.5, caustic * 0.32);
          var weightA = sampleA * (0.34 + edge * 0.66) + causticBand * 0.58;
          var weightB = sampleB * (0.34 + edge * 0.66) + causticBand * 0.42;
          var lens = inside ? sourceAlpha * (0.08 + Math.min(1, Math.abs(refraction) * 0.12)) + edge * 0.18 : 0;
          var highlight = facetHighlight + causticBand * 0.22;
          var total = weightA + weightB + lens + highlight;
          if (total <= 0.005) continue;
          var mixWeight = Math.max(0.001, weightA + weightB + lens + highlight);
          var midR = (rgbA[0] + rgbB[0]) * 0.5, midG = (rgbA[1] + rgbB[1]) * 0.5, midB = (rgbA[2] + rgbB[2]) * 0.5;
          output.data[index * 4] = Math.round((rgbA[0] * weightA + rgbB[0] * weightB + midR * lens + 255 * highlight) / mixWeight);
          output.data[index * 4 + 1] = Math.round((rgbA[1] * weightA + rgbB[1] * weightB + midG * lens + 255 * highlight) / mixWeight);
          output.data[index * 4 + 2] = Math.round((rgbA[2] * weightA + rgbB[2] * weightB + midB * lens + 255 * highlight) / mixWeight);
          output.data[index * 4 + 3] = Math.round(255 * refractionAggregate.strength * Math.min(1, total * 0.68));
        }

        // Output pixels sample the fixed geometry and original glyph raster.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext;function outputAlphaAt(x,y){return RC.rasterSample(source.data,width,height,x,y,3)/255;}RC.field(output,function(px,py,rgba){var x=px-.5,y=py-.5;if(y<(minY)||!(y <= maxY))return;if(x<(minX)||!(x <= maxX))return;
          var index = Math.floor(y) * width + Math.floor(x);
          var inside = !!(RC.sample(field.inside,width,height,x,y)>=.5);
          var distance = RC.sample(field.distance,width,height,x,y);
          if (!inside && (bloom <= 0.001 || distance > bloom)) return;
          var gx = signedDistanceAt(x + 1, y) - signedDistanceAt(x - 1, y);
          var gy = signedDistanceAt(x, y + 1) - signedDistanceAt(x, y - 1);
          var gradientLength = Math.sqrt(gx * gx + gy * gy);
          var rawAngle = gradientLength > 0.001 ? Math.atan2(gy, gx) : Math.atan2(y - (minY + maxY) * 0.5, x - (minX + maxX) * 0.5);
          var facetAngle = Math.round((rawAngle + phase * 0.04) / facetStep) * facetStep;
          var normalX = Math.cos(facetAngle), normalY = Math.sin(facetAngle);
          var baseShift = refraction * (4 + Math.min(48, distance * 0.16)) * pixelScale * L.s;
          var offsetA = baseShift + dispersion * 0.5;
          var offsetB = baseShift - dispersion * 0.5;
          var sampleA = outputAlphaAt(x + normalX * offsetA, y + normalY * offsetA);
          var sampleB = outputAlphaAt(x + normalX * offsetB, y + normalY * offsetB);
          var edgeWidth = Math.max(1, 3 * pixelScale * L.s + dispersion * 0.035);
          var edge = Math.exp(-distance / edgeWidth);
          var sourceAlpha = RC.rasterSample(source.data,width,height,x,y,3) / 255;
          var facetHighlight = inside ? Math.pow(Math.max(0, Math.cos(rawAngle * facets - phase)), 12) * (0.12 + Math.min(1, caustic / 6) * 0.34) : 0;
          var outsideFalloff = !inside && bloom > 0 ? Math.pow(Math.max(0, 1 - distance / bloom), 1.7) : 0;
          var causticBand = outsideFalloff * Math.pow(Math.max(0,
            Math.cos(distance / Math.max(2, 7 * pixelScale * L.s + dispersion * 0.055) * Math.PI * 2 + facetAngle * facets * 0.5 - phase)), 6) * Math.min(1.5, caustic * 0.32);
          var weightA = sampleA * (0.34 + edge * 0.66) + causticBand * 0.58;
          var weightB = sampleB * (0.34 + edge * 0.66) + causticBand * 0.42;
          var lens = inside ? sourceAlpha * (0.08 + Math.min(1, Math.abs(refraction) * 0.12)) + edge * 0.18 : 0;
          var highlight = facetHighlight + causticBand * 0.22;
          var total = weightA + weightB + lens + highlight;
          if (total <= 0.005) return;
          var mixWeight = Math.max(0.001, weightA + weightB + lens + highlight);
          var midR = (rgbA[0] + rgbB[0]) * 0.5, midG = (rgbA[1] + rgbB[1]) * 0.5, midB = (rgbA[2] + rgbB[2]) * 0.5;
          rgba[0] = Math.round((rgbA[0] * weightA + rgbB[0] * weightB + midR * lens + 255 * highlight) / mixWeight);
          rgba[1] = Math.round((rgbA[1] * weightA + rgbB[1] * weightB + midG * lens + 255 * highlight) / mixWeight);
          rgba[2] = Math.round((rgbA[2] * weightA + rgbB[2] * weightB + midB * lens + 255 * highlight) / mixWeight);
          rgba[3] = Math.round(255 * refractionAggregate.strength * Math.min(1, total * 0.68));

        });}
        work.ctx.putImageData(output, 0, 0);
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderTexturaMatrixLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var pitchAggregate = surfaceAggregate(glyphs, 'texturaMatrix', 'texturaPitch', params.texturaPitch);
        if (!pitchAggregate.weight) return;
        var pitch = Math.max(2, pitchAggregate.value * pixelScale * L.s);
        var nibAngle = surfaceAggregate(glyphs, 'texturaMatrix', 'texturaAngle', params.texturaAngle).value * Math.PI / 180;
        var weight = surfaceAggregate(glyphs, 'texturaMatrix', 'texturaWeight', params.texturaWeight).value;
        var split = surfaceAggregate(glyphs, 'texturaMatrix', 'texturaSplit', params.texturaSplit).value;
        var spur = Math.max(0, surfaceAggregate(glyphs, 'texturaMatrix', 'texturaSpur', params.texturaSpur).value * pixelScale * L.s);
        var mask = buildSurfaceMask(glyphs, 'texturaMatrix', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'texturaMatrix', coverBase);
        var maskCtx = mask.getContext('2d', { willReadFrequently: true });
        var source;
        try { source = maskCtx.getImageData(0, 0, width, height); }
        catch (error) { return; }
        var field = surfaceBoundaryDistance(source.data, width, height);
        if (!field.bounds) return;
        var spanW = Math.max(1, field.bounds[2] - field.bounds[0] + 1);
        if (spanW / pitch > 180) pitch = spanW / 180;
        var stemWidth = Math.max(0.5, Math.min(pitch * 1.9, pitch * weight * 0.58));
        var work = surfaceScratch('textura-matrix', width, height, false);
        var ctx = work.ctx;
        ctx.fillStyle = surfaceEffectColor('texturaMatrix');
        ctx.strokeStyle = surfaceEffectColor('texturaMatrix');
        var phaseOffset = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * pitch : 0;
        var startX = field.bounds[0] + pitch * 0.5 + phaseOffset;
        while (startX > field.bounds[0] + pitch) startX -= pitch;
        var previous = [];
        for (var x = startX; x <= field.bounds[2] + pitch * 0.5; x += pitch) {
          var sampleX = Math.max(0, Math.min(width - 1, Math.round(x)));
          var runs = [];
          var runStart = -1, alphaTotal = 0, alphaCount = 0;
          for (var y = field.bounds[1]; y <= field.bounds[3] + 1; y++) {
            var active = false, sampleAlpha = 0;
            if (y <= field.bounds[3]) {
              for (var offset = -1; offset <= 1; offset++) {
                var sx = Math.max(0, Math.min(width - 1, Math.round(sampleX + offset * Math.max(1, pitch * 0.18))));
                sampleAlpha = Math.max(sampleAlpha, source.data[(y * width + sx) * 4 + 3] / 255);
              }
              active = sampleAlpha > 0.08;
            }
            if (active) {
              if (runStart < 0) runStart = y;
              alphaTotal += sampleAlpha;
              alphaCount++;
            } else if (runStart >= 0) {
              var runEnd = y - 1;
              if (runEnd - runStart >= 1) runs.push({ x: sampleX, start: runStart, end: runEnd, alpha: alphaTotal / Math.max(1, alphaCount) });
              runStart = -1; alphaTotal = 0; alphaCount = 0;
            }
          }
          for (var runIndex = 0; runIndex < runs.length; runIndex++) {
            var run = runs[runIndex];
            traceTexturaStem(ctx, run.x, run.start, run.end, stemWidth, nibAngle, split, spur,
              pitchAggregate.strength * (0.58 + run.alpha * 0.42));
            var best = null, bestOverlap = 0;
            for (var previousIndex = 0; previousIndex < previous.length; previousIndex++) {
              var candidate = previous[previousIndex];
              var overlapStart = Math.max(run.start, candidate.start);
              var overlapEnd = Math.min(run.end, candidate.end);
              var overlap = overlapEnd - overlapStart;
              if (overlap > bestOverlap) {
                bestOverlap = overlap;
                best = { run: candidate, y: (overlapStart + overlapEnd) * 0.5 };
              }
            }
            if (best && bestOverlap > stemWidth * 0.35) {
              var joinTilt = Math.tan(nibAngle) * Math.min(pitch * 0.42, stemWidth * 0.7);
              ctx.globalAlpha = pitchAggregate.strength * Math.min(0.86, 0.28 + run.alpha * 0.48);
              ctx.lineWidth = Math.max(0.5, stemWidth * (0.2 + weight * 0.08));
              ctx.lineCap = 'square';
              ctx.beginPath();
              ctx.moveTo(best.run.x, best.y - joinTilt);
              ctx.lineTo(run.x, best.y + joinTilt);
              ctx.stroke();
            }
          }
          previous = runs;
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(mask, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderMoireChoir(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var topology = surfaceChoice(glyphs, 'moireChoir', 'moireLattice', params.moireLattice, BATCH_PARAM_OPTIONS.moireLattice);
        var resonanceAggregate = surfaceAggregate(glyphs, 'moireChoir', 'moireResonance', params.moireResonance);
        var resonance = Math.max(0, resonanceAggregate.value);
        if (topology === 'linear' && resonance <= 0.001) {
          renderMoireChoirLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        var pitchAggregate = surfaceAggregate(glyphs, 'moireChoir', 'moirePitch', params.moirePitch);
        if (!pitchAggregate.weight) return;
        var pitch = Math.max(1, pitchAggregate.value * pixelScale * L.s);
        var detune = surfaceAggregate(glyphs, 'moireChoir', 'moireDetune', params.moireDetune).value;
        var angle = surfaceAggregate(glyphs, 'moireChoir', 'moireAngle', params.moireAngle).value * Math.PI / 180;
        var depth = surfaceAggregate(glyphs, 'moireChoir', 'moireDepth', params.moireDepth).value;
        var reach = Math.max(0, surfaceAggregate(glyphs, 'moireChoir', 'moireReach', params.moireReach).value * pixelScale * L.s);
        var mask = buildSurfaceMask(glyphs, 'moireChoir', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'moireChoir', coverBase);
        var maskCtx = mask.getContext('2d', { willReadFrequently: true });
        var source;
        try { source = maskCtx.getImageData(0, 0, width, height); }
        catch (error) { return; }
        var field = surfaceBoundaryDistance(source.data, width, height);
        if (!field.bounds) return;
        var motionPhase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var nodes = surfaceNodesForGlyphs(glyphs, 'moireChoir', 12, pixelScale, L, motionPhase, 0, 0);
        if (!nodes.length) {
          renderMoireChoirLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        // A single glyph still needs a real path-difference field. Virtual
        // companions inherit its scale and rotate with the declared field
        // angle; they are wave sources, not rendered copies of the glyph.
        if (nodes.length === 1) {
          var loneSpan = Math.max(pitch * 2.4,
            Math.abs((nodes[0].glyph.w || pitch) * (nodes[0].glyph.scaleX || 1) * L.s * pixelScale) * 0.72);
          nodes.push({ x: nodes[0].x + Math.cos(angle) * loneSpan,
            y: nodes[0].y + Math.sin(angle) * loneSpan, glyph: nodes[0].glyph });
        }
        if (nodes.length === 2) {
          var pairMidX = (nodes[0].x + nodes[1].x) * 0.5;
          var pairMidY = (nodes[0].y + nodes[1].y) * 0.5;
          var pairDx = nodes[1].x - nodes[0].x, pairDy = nodes[1].y - nodes[0].y;
          var pairLength = Math.max(pitch * 2, Math.sqrt(pairDx * pairDx + pairDy * pairDy));
          nodes.push({ x: pairMidX - pairDy / pairLength * pairLength * 0.42,
            y: pairMidY + pairDx / pairLength * pairLength * 0.42, glyph: nodes[0].glyph });
        }
        var work = surfaceScratch('moire-choir-v35-wavefront-field', width, height, false);
        var output = work.ctx.createImageData(width, height);
        var rgb = surfaceHexRgb(surfaceEffectColor('moireChoir'));
        var frequency = Math.PI * 2 / pitch;
        var secondFrequency = frequency * Math.max(0.08, 1 + detune * 0.52);
        var thirdFrequency = frequency * Math.max(0.12, 1 - detune * 0.31 + resonance * 0.018);
        var cosA = Math.cos(angle), sinA = Math.sin(angle);
        var seedPhase = params.seed * 0.173;
        var sharpness = 1.9 + Math.min(8, resonance) * 0.72;
        var broadness = 0.42 + Math.min(8, resonance) * 0.07;
        var pad = Math.ceil(reach + pitch * 3.5);
        var minX = Math.max(0, Math.floor(field.bounds[0] - pad));
        var minY = Math.max(0, Math.floor(field.bounds[1] - pad));
        var maxX = Math.min(width - 1, Math.ceil(field.bounds[2] + pad));
        var maxY = Math.min(height - 1, Math.ceil(field.bounds[3] + pad));
        function moirePhaseLine(phase, power) {
          return Math.pow(Math.max(0, 1 - Math.abs(Math.sin(phase))), power);
        }
        function moirePhaseBand(phase, power) {
          return Math.pow(Math.max(0, 0.5 + Math.cos(phase) * 0.5), power);
        }
        for (var y = minY; y <= maxY; y++) for (var x = minX; x <= maxX; x++) {
          var index = y * width + x;
          var inside = !!field.inside[index];
          var boundaryDistance = field.distance[index];
          if (!inside && (reach <= 0 || boundaryDistance > reach)) continue;
          var nearestIndex = -1, nearestDistance = Infinity;
          var secondIndex = -1, secondDistance = Infinity;
          var thirdIndex = -1, thirdDistance = Infinity;
          for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
            var nodeDx = x - nodes[nodeIndex].x, nodeDy = y - nodes[nodeIndex].y;
            var nodeDistance = nodeDx * nodeDx + nodeDy * nodeDy;
            if (nodeDistance < nearestDistance) {
              thirdDistance = secondDistance; thirdIndex = secondIndex;
              secondDistance = nearestDistance; secondIndex = nearestIndex;
              nearestDistance = nodeDistance; nearestIndex = nodeIndex;
            } else if (nodeDistance < secondDistance) {
              thirdDistance = secondDistance; thirdIndex = secondIndex;
              secondDistance = nodeDistance; secondIndex = nodeIndex;
            } else if (nodeDistance < thirdDistance) {
              thirdDistance = nodeDistance; thirdIndex = nodeIndex;
            }
          }
          var node = nodes[nearestIndex];
          var neighbour = nodes[secondIndex];
          var thirdNode = nodes[thirdIndex];
          var dx = x - node.x, dy = y - node.y;
          var secondDx = x - neighbour.x, secondDy = y - neighbour.y;
          var thirdDx = x - thirdNode.x, thirdDy = y - thirdNode.y;
          var radial = Math.sqrt(nearestDistance);
          var secondRadial = Math.sqrt(secondDistance);
          var thirdRadial = Math.sqrt(thirdDistance);
          var polar = Math.atan2(dy, dx) - angle;
          var secondPolar = Math.atan2(secondDy, secondDx) - angle;
          var ndx = neighbour.x - node.x, ndy = neighbour.y - node.y;
          var bridgeAngle = Math.atan2(ndy, ndx);
          var localX = dx * Math.cos(bridgeAngle) + dy * Math.sin(bridgeAngle);
          var localY = -dx * Math.sin(bridgeAngle) + dy * Math.cos(bridgeAngle);
          var fieldX = dx * cosA + dy * sinA;
          var fieldY = -dx * sinA + dy * cosA;
          var secondFieldX = secondDx * cosA + secondDy * sinA;
          var secondFieldY = -secondDx * sinA + secondDy * cosA;
          var signedBoundary = inside ? -boundaryDistance : boundaryDistance;
          var distancePhase = signedBoundary / pitch * depth;
          var phaseA = 0, phaseB = 0, phaseC = 0;
          var lineA = 0, lineB = 0, lineC = 0;
          var envelope = 0, structural = 0, filament = 0, toneField = 0;
          if (topology === 'concentric') {
            // Three coherent circular wavefronts produce lobe fields and
            // singular crossings rather than a single fingerprint texture.
            // A restrained ellipse keeps them recognisably wavefront-like while
            // giving Field angle a real, visible orientation in this grammar.
            var wellAnisotropy = Math.min(0.34, 0.12 + resonance * 0.018 + Math.abs(detune) * 0.04);
            var orientedRadial = Math.sqrt(fieldX * fieldX * Math.pow(1 + wellAnisotropy, 2)
              + fieldY * fieldY * Math.pow(1 - wellAnisotropy, 2));
            var orientedSecondRadial = Math.sqrt(secondFieldX * secondFieldX * Math.pow(1 - wellAnisotropy, 2)
              + secondFieldY * secondFieldY * Math.pow(1 + wellAnisotropy, 2));
            var thirdFieldX = thirdDx * cosA + thirdDy * sinA;
            var thirdFieldY = -thirdDx * sinA + thirdDy * cosA;
            var orientedThirdRadial = Math.sqrt(thirdFieldX * thirdFieldX * Math.pow(1 + wellAnisotropy * 0.7, 2)
              + thirdFieldY * thirdFieldY * Math.pow(1 - wellAnisotropy * 0.7, 2));
            phaseA = orientedRadial * frequency + distancePhase * 0.34 + motionPhase + nearestIndex * 0.73 + seedPhase;
            phaseB = orientedSecondRadial * secondFrequency - distancePhase * 0.27 - motionPhase * 0.71 + secondIndex * 0.47;
            phaseC = orientedThirdRadial * thirdFrequency + distancePhase * 0.18 + motionPhase * 0.43 + thirdIndex * 0.31;
            var waveA = Math.cos(phaseA), waveB = Math.cos(phaseB), waveC = Math.cos(phaseC);
            var waveSum = (waveA + waveB + waveC * 0.72) / 2.72;
            var intensity = waveSum * waveSum;
            lineA = moirePhaseLine(phaseA * 0.5, sharpness);
            lineB = moirePhaseLine(phaseB * 0.5, sharpness);
            lineC = moirePhaseLine(phaseC * 0.5, sharpness + 0.55);
            var ringCrossing = Math.min(Math.max(lineA, lineB), Math.max(lineB, lineC));
            envelope = Math.pow(Math.min(1, Math.abs(waveSum)), broadness);
            filament = intensity * (0.56 + resonance * 0.045)
              + Math.max(lineA, lineB, lineC) * 0.38 + ringCrossing * (0.38 + resonance * 0.035);
            structural = envelope * 0.12;
            toneField = waveSum;
          } else if (topology === 'radial') {
            // Angular families rotate around different glyph sources. Their
            // path-difference rail bends the spokes into visible caustics.
            var spokesA = Math.max(4, Math.round(6 + resonance * 2.2 + Math.abs(detune) * 3));
            var spokesB = Math.max(5, Math.round(spokesA + 2 + detune * 2.4));
            phaseA = polar * spokesA + radial * frequency * 0.115 + distancePhase * 0.44 + motionPhase + seedPhase;
            phaseB = secondPolar * spokesB - secondRadial * secondFrequency * 0.09 - distancePhase * 0.31 - motionPhase * 0.68;
            var causticPhase = Math.PI * (radial - secondRadial) / pitch
              + (polar + secondPolar) * (0.7 + resonance * 0.09) + detune * 2.1;
            var orbitPhase = (radial + secondRadial) * frequency * 0.28 + distancePhase * 0.2 - motionPhase * 0.37;
            lineA = moirePhaseLine(phaseA * 0.5, sharpness);
            lineB = moirePhaseLine(phaseB * 0.5, sharpness);
            var caustic = moirePhaseLine(causticPhase, 1.8 + resonance * 0.25);
            var orbit = moirePhaseLine(orbitPhase * 0.5, sharpness + 0.4);
            envelope = moirePhaseBand(causticPhase * 0.46, broadness);
            filament = Math.max(lineA, lineB) * (0.36 + envelope * 0.58)
              + Math.min(lineA, lineB) * (0.48 + resonance * 0.05)
              + caustic * (0.34 + resonance * 0.045) + orbit * 0.14;
            structural = envelope * 0.09;
            toneField = caustic - Math.min(lineA, lineB) * 0.72;
          } else if (topology === 'interlace') {
            // Two locally warped carrier fabrics are multiplied. Alternating
            // over/under gates keep crossings woven while the phase
            // difference creates large, slow beat cells.
            var warpStrength = 0.54 + resonance * 0.34;
            var wovenX = localX * 0.48 + fieldX * 0.52;
            var wovenY = localY * 0.48 + fieldY * 0.52;
            phaseA = wovenX * frequency + Math.sin(wovenY * frequency * 0.43 + motionPhase) * warpStrength
              + distancePhase * 0.36 + seedPhase;
            phaseB = wovenY * secondFrequency + Math.sin(wovenX * frequency * 0.37 - motionPhase * 0.79) * warpStrength
              - distancePhase * 0.29 - seedPhase * 0.42;
            lineA = moirePhaseLine(phaseA * 0.5, sharpness + 0.65);
            lineB = moirePhaseLine(phaseB * 0.5, sharpness + 0.65);
            var beatPhase = (phaseA - phaseB) * 0.5;
            var beat = moirePhaseBand(beatPhase, broadness);
            var beatRail = moirePhaseLine(beatPhase, 1.6 + resonance * 0.21);
            var overGate = 0.5 + Math.cos((phaseA + phaseB) * 0.5 + motionPhase * 0.33) * 0.5;
            var wovenA = lineA * (0.28 + overGate * 0.72);
            var wovenB = lineB * (1 - overGate * 0.58);
            var crossing = Math.min(lineA, lineB);
            envelope = beat;
            filament = Math.max(wovenA, wovenB) * (0.48 + beat * 0.5)
              + crossing * (0.52 + resonance * 0.07) + beatRail * 0.24;
            structural = beat * 0.085;
            toneField = overGate * 2 - 1;
          } else if (topology === 'linear') {
            phaseA = (x * cosA + y * sinA) * frequency + distancePhase + motionPhase + seedPhase;
            phaseB = (x * Math.cos(angle + detune * 1.44) + y * Math.sin(angle + detune * 1.44))
              * secondFrequency - distancePhase * 0.73 - motionPhase * 0.61 - seedPhase * 0.47;
            lineA = moirePhaseLine(phaseA * 0.5, sharpness);
            lineB = moirePhaseLine(phaseB * 0.5, sharpness);
            envelope = moirePhaseBand((phaseA - phaseB) * 0.5, broadness);
            filament = Math.max(lineA, lineB) * (0.24 + envelope * 0.72)
              + Math.min(lineA, lineB) * (0.5 + resonance * 0.055);
            structural = envelope * 0.07;
            toneField = envelope * 2 - 1;
          } else {
            // Nodal Choir uses path difference directly: whole wavelengths
            // become antinodal rails, half wavelengths become true quiet
            // lanes, and a third glyph source modulates the broad envelope.
            var pathPhase = Math.PI * (radial - secondRadial) / pitch
              + detune * (radial + secondRadial) * frequency * 0.18 + motionPhase * 0.42
              + (nearestIndex - secondIndex) * 0.21;
            var triadPhase = Math.PI * (radial - thirdRadial) / Math.max(1, pitch * 1.24)
              - motionPhase * 0.31 + (nearestIndex - thirdIndex) * 0.17;
            var carrierPhase = (radial + secondRadial) * frequency * 0.47
              + (localX * 0.035 + fieldX * 0.12) * frequency * (1 + detune * 0.16) + distancePhase * 0.38
              + motionPhase + seedPhase;
            var antinodeRail = moirePhaseLine(pathPhase, 1.7 + resonance * 0.29);
            var nodalRail = moirePhaseLine(pathPhase - Math.PI * 0.5, 2.1 + resonance * 0.34);
            var triadRail = moirePhaseLine(triadPhase, 2.2 + resonance * 0.18);
            var antinodeBand = moirePhaseBand(pathPhase * 2, broadness);
            var triadBand = moirePhaseBand(triadPhase * 2, broadness + 0.18);
            var choralEnvelope = antinodeBand * (0.54 + triadBand * 0.46);
            var carrier = moirePhaseLine(carrierPhase * 0.5, sharpness + 0.4);
            envelope = choralEnvelope;
            filament = carrier * (0.24 + choralEnvelope * 0.72)
              + antinodeRail * (0.43 + resonance * 0.055) + triadRail * 0.17;
            filament *= 1 - nodalRail * (0.56 + Math.min(0.3, resonance * 0.035));
            structural = choralEnvelope * 0.14;
            toneField = nodalRail - antinodeRail;
          }
          var influence = inside ? 1 : Math.pow(Math.max(0, 1 - boundaryDistance / Math.max(1, reach)), 0.72);
          var sourceAlpha = source.data[index * 4 + 3] / 255;
          var alpha = Math.min(1, filament * (0.72 + Math.min(8, resonance) * 0.045) + structural)
            * influence * pitchAggregate.strength * (inside ? 0.82 + sourceAlpha * 0.18 : 0.86);
          if (alpha <= 0.008) continue;
          var tone = Math.max(-1, Math.min(1, toneField));
          var toneTarget = tone >= 0 ? 255 : 0;
          var toneMix = Math.abs(tone) * (tone >= 0
            ? Math.min(0.34, 0.09 + resonance * 0.026)
            : Math.min(0.58, 0.16 + resonance * 0.045));
          output.data[index * 4] = Math.round(rgb[0] + (toneTarget - rgb[0]) * toneMix);
          output.data[index * 4 + 1] = Math.round(rgb[1] + (toneTarget - rgb[1]) * toneMix);
          output.data[index * 4 + 2] = Math.round(rgb[2] + (toneTarget - rgb[2]) * toneMix);
          output.data[index * 4 + 3] = Math.round(alpha * 255);
        }

        // Output pixels sample the fixed geometry and original glyph raster.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext;RC.field(output,function(px,py,rgba){var x=px-.5,y=py-.5;if(y<(minY)||!(y <= maxY))return;if(x<(minX)||!(x <= maxX))return;
          var index = Math.floor(y) * width + Math.floor(x);
          var inside = !!(RC.sample(field.inside,width,height,x,y)>=.5);
          var boundaryDistance = RC.sample(field.distance,width,height,x,y);
          if (!inside && (reach <= 0 || boundaryDistance > reach)) return;
          var nearestIndex = -1, nearestDistance = Infinity;
          var secondIndex = -1, secondDistance = Infinity;
          var thirdIndex = -1, thirdDistance = Infinity;
          for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
            var nodeDx = x - nodes[nodeIndex].x, nodeDy = y - nodes[nodeIndex].y;
            var nodeDistance = nodeDx * nodeDx + nodeDy * nodeDy;
            if (nodeDistance < nearestDistance) {
              thirdDistance = secondDistance; thirdIndex = secondIndex;
              secondDistance = nearestDistance; secondIndex = nearestIndex;
              nearestDistance = nodeDistance; nearestIndex = nodeIndex;
            } else if (nodeDistance < secondDistance) {
              thirdDistance = secondDistance; thirdIndex = secondIndex;
              secondDistance = nodeDistance; secondIndex = nodeIndex;
            } else if (nodeDistance < thirdDistance) {
              thirdDistance = nodeDistance; thirdIndex = nodeIndex;
            }
          }
          var node = nodes[nearestIndex];
          var neighbour = nodes[secondIndex];
          var thirdNode = nodes[thirdIndex];
          var dx = x - node.x, dy = y - node.y;
          var secondDx = x - neighbour.x, secondDy = y - neighbour.y;
          var thirdDx = x - thirdNode.x, thirdDy = y - thirdNode.y;
          var radial = Math.sqrt(nearestDistance);
          var secondRadial = Math.sqrt(secondDistance);
          var thirdRadial = Math.sqrt(thirdDistance);
          var polar = Math.atan2(dy, dx) - angle;
          var secondPolar = Math.atan2(secondDy, secondDx) - angle;
          var ndx = neighbour.x - node.x, ndy = neighbour.y - node.y;
          var bridgeAngle = Math.atan2(ndy, ndx);
          var localX = dx * Math.cos(bridgeAngle) + dy * Math.sin(bridgeAngle);
          var localY = -dx * Math.sin(bridgeAngle) + dy * Math.cos(bridgeAngle);
          var fieldX = dx * cosA + dy * sinA;
          var fieldY = -dx * sinA + dy * cosA;
          var secondFieldX = secondDx * cosA + secondDy * sinA;
          var secondFieldY = -secondDx * sinA + secondDy * cosA;
          var signedBoundary = inside ? -boundaryDistance : boundaryDistance;
          var distancePhase = signedBoundary / pitch * depth;
          var phaseA = 0, phaseB = 0, phaseC = 0;
          var lineA = 0, lineB = 0, lineC = 0;
          var envelope = 0, structural = 0, filament = 0, toneField = 0;
          if (topology === 'concentric') {
            // Three coherent circular wavefronts produce lobe fields and
            // singular crossings rather than a single fingerprint texture.
            // A restrained ellipse keeps them recognisably wavefront-like while
            // giving Field angle a real, visible orientation in this grammar.
            var wellAnisotropy = Math.min(0.34, 0.12 + resonance * 0.018 + Math.abs(detune) * 0.04);
            var orientedRadial = Math.sqrt(fieldX * fieldX * Math.pow(1 + wellAnisotropy, 2)
              + fieldY * fieldY * Math.pow(1 - wellAnisotropy, 2));
            var orientedSecondRadial = Math.sqrt(secondFieldX * secondFieldX * Math.pow(1 - wellAnisotropy, 2)
              + secondFieldY * secondFieldY * Math.pow(1 + wellAnisotropy, 2));
            var thirdFieldX = thirdDx * cosA + thirdDy * sinA;
            var thirdFieldY = -thirdDx * sinA + thirdDy * cosA;
            var orientedThirdRadial = Math.sqrt(thirdFieldX * thirdFieldX * Math.pow(1 + wellAnisotropy * 0.7, 2)
              + thirdFieldY * thirdFieldY * Math.pow(1 - wellAnisotropy * 0.7, 2));
            phaseA = orientedRadial * frequency + distancePhase * 0.34 + motionPhase + nearestIndex * 0.73 + seedPhase;
            phaseB = orientedSecondRadial * secondFrequency - distancePhase * 0.27 - motionPhase * 0.71 + secondIndex * 0.47;
            phaseC = orientedThirdRadial * thirdFrequency + distancePhase * 0.18 + motionPhase * 0.43 + thirdIndex * 0.31;
            var waveA = Math.cos(phaseA), waveB = Math.cos(phaseB), waveC = Math.cos(phaseC);
            var waveSum = (waveA + waveB + waveC * 0.72) / 2.72;
            var intensity = waveSum * waveSum;
            lineA = moirePhaseLine(phaseA * 0.5, sharpness);
            lineB = moirePhaseLine(phaseB * 0.5, sharpness);
            lineC = moirePhaseLine(phaseC * 0.5, sharpness + 0.55);
            var ringCrossing = Math.min(Math.max(lineA, lineB), Math.max(lineB, lineC));
            envelope = Math.pow(Math.min(1, Math.abs(waveSum)), broadness);
            filament = intensity * (0.56 + resonance * 0.045)
              + Math.max(lineA, lineB, lineC) * 0.38 + ringCrossing * (0.38 + resonance * 0.035);
            structural = envelope * 0.12;
            toneField = waveSum;
          } else if (topology === 'radial') {
            // Angular families rotate around different glyph sources. Their
            // path-difference rail bends the spokes into visible caustics.
            var spokesA = Math.max(4, Math.round(6 + resonance * 2.2 + Math.abs(detune) * 3));
            var spokesB = Math.max(5, Math.round(spokesA + 2 + detune * 2.4));
            phaseA = polar * spokesA + radial * frequency * 0.115 + distancePhase * 0.44 + motionPhase + seedPhase;
            phaseB = secondPolar * spokesB - secondRadial * secondFrequency * 0.09 - distancePhase * 0.31 - motionPhase * 0.68;
            var causticPhase = Math.PI * (radial - secondRadial) / pitch
              + (polar + secondPolar) * (0.7 + resonance * 0.09) + detune * 2.1;
            var orbitPhase = (radial + secondRadial) * frequency * 0.28 + distancePhase * 0.2 - motionPhase * 0.37;
            lineA = moirePhaseLine(phaseA * 0.5, sharpness);
            lineB = moirePhaseLine(phaseB * 0.5, sharpness);
            var caustic = moirePhaseLine(causticPhase, 1.8 + resonance * 0.25);
            var orbit = moirePhaseLine(orbitPhase * 0.5, sharpness + 0.4);
            envelope = moirePhaseBand(causticPhase * 0.46, broadness);
            filament = Math.max(lineA, lineB) * (0.36 + envelope * 0.58)
              + Math.min(lineA, lineB) * (0.48 + resonance * 0.05)
              + caustic * (0.34 + resonance * 0.045) + orbit * 0.14;
            structural = envelope * 0.09;
            toneField = caustic - Math.min(lineA, lineB) * 0.72;
          } else if (topology === 'interlace') {
            // Two locally warped carrier fabrics are multiplied. Alternating
            // over/under gates keep crossings woven while the phase
            // difference creates large, slow beat cells.
            var warpStrength = 0.54 + resonance * 0.34;
            var wovenX = localX * 0.48 + fieldX * 0.52;
            var wovenY = localY * 0.48 + fieldY * 0.52;
            phaseA = wovenX * frequency + Math.sin(wovenY * frequency * 0.43 + motionPhase) * warpStrength
              + distancePhase * 0.36 + seedPhase;
            phaseB = wovenY * secondFrequency + Math.sin(wovenX * frequency * 0.37 - motionPhase * 0.79) * warpStrength
              - distancePhase * 0.29 - seedPhase * 0.42;
            lineA = moirePhaseLine(phaseA * 0.5, sharpness + 0.65);
            lineB = moirePhaseLine(phaseB * 0.5, sharpness + 0.65);
            var beatPhase = (phaseA - phaseB) * 0.5;
            var beat = moirePhaseBand(beatPhase, broadness);
            var beatRail = moirePhaseLine(beatPhase, 1.6 + resonance * 0.21);
            var overGate = 0.5 + Math.cos((phaseA + phaseB) * 0.5 + motionPhase * 0.33) * 0.5;
            var wovenA = lineA * (0.28 + overGate * 0.72);
            var wovenB = lineB * (1 - overGate * 0.58);
            var crossing = Math.min(lineA, lineB);
            envelope = beat;
            filament = Math.max(wovenA, wovenB) * (0.48 + beat * 0.5)
              + crossing * (0.52 + resonance * 0.07) + beatRail * 0.24;
            structural = beat * 0.085;
            toneField = overGate * 2 - 1;
          } else if (topology === 'linear') {
            phaseA = (x * cosA + y * sinA) * frequency + distancePhase + motionPhase + seedPhase;
            phaseB = (x * Math.cos(angle + detune * 1.44) + y * Math.sin(angle + detune * 1.44))
              * secondFrequency - distancePhase * 0.73 - motionPhase * 0.61 - seedPhase * 0.47;
            lineA = moirePhaseLine(phaseA * 0.5, sharpness);
            lineB = moirePhaseLine(phaseB * 0.5, sharpness);
            envelope = moirePhaseBand((phaseA - phaseB) * 0.5, broadness);
            filament = Math.max(lineA, lineB) * (0.24 + envelope * 0.72)
              + Math.min(lineA, lineB) * (0.5 + resonance * 0.055);
            structural = envelope * 0.07;
            toneField = envelope * 2 - 1;
          } else {
            // Nodal Choir uses path difference directly: whole wavelengths
            // become antinodal rails, half wavelengths become true quiet
            // lanes, and a third glyph source modulates the broad envelope.
            var pathPhase = Math.PI * (radial - secondRadial) / pitch
              + detune * (radial + secondRadial) * frequency * 0.18 + motionPhase * 0.42
              + (nearestIndex - secondIndex) * 0.21;
            var triadPhase = Math.PI * (radial - thirdRadial) / Math.max(1, pitch * 1.24)
              - motionPhase * 0.31 + (nearestIndex - thirdIndex) * 0.17;
            var carrierPhase = (radial + secondRadial) * frequency * 0.47
              + (localX * 0.035 + fieldX * 0.12) * frequency * (1 + detune * 0.16) + distancePhase * 0.38
              + motionPhase + seedPhase;
            var antinodeRail = moirePhaseLine(pathPhase, 1.7 + resonance * 0.29);
            var nodalRail = moirePhaseLine(pathPhase - Math.PI * 0.5, 2.1 + resonance * 0.34);
            var triadRail = moirePhaseLine(triadPhase, 2.2 + resonance * 0.18);
            var antinodeBand = moirePhaseBand(pathPhase * 2, broadness);
            var triadBand = moirePhaseBand(triadPhase * 2, broadness + 0.18);
            var choralEnvelope = antinodeBand * (0.54 + triadBand * 0.46);
            var carrier = moirePhaseLine(carrierPhase * 0.5, sharpness + 0.4);
            envelope = choralEnvelope;
            filament = carrier * (0.24 + choralEnvelope * 0.72)
              + antinodeRail * (0.43 + resonance * 0.055) + triadRail * 0.17;
            filament *= 1 - nodalRail * (0.56 + Math.min(0.3, resonance * 0.035));
            structural = choralEnvelope * 0.14;
            toneField = nodalRail - antinodeRail;
          }
          var influence = inside ? 1 : Math.pow(Math.max(0, 1 - boundaryDistance / Math.max(1, reach)), 0.72);
          var sourceAlpha = RC.rasterSample(source.data,width,height,x,y,3) / 255;
          var alpha = Math.min(1, filament * (0.72 + Math.min(8, resonance) * 0.045) + structural)
            * influence * pitchAggregate.strength * (inside ? 0.82 + sourceAlpha * 0.18 : 0.86);
          if (alpha <= 0.008) return;
          var tone = Math.max(-1, Math.min(1, toneField));
          var toneTarget = tone >= 0 ? 255 : 0;
          var toneMix = Math.abs(tone) * (tone >= 0
            ? Math.min(0.34, 0.09 + resonance * 0.026)
            : Math.min(0.58, 0.16 + resonance * 0.045));
          rgba[0] = Math.round(rgb[0] + (toneTarget - rgb[0]) * toneMix);
          rgba[1] = Math.round(rgb[1] + (toneTarget - rgb[1]) * toneMix);
          rgba[2] = Math.round(rgb[2] + (toneTarget - rgb[2]) * toneMix);
          rgba[3] = Math.round(alpha * 255);

        });}
        work.ctx.putImageData(output, 0, 0);
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderNaveCutter(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var plan = surfaceChoice(glyphs, 'naveCutter', 'navePlan', params.navePlan, BATCH_PARAM_OPTIONS.navePlan);
        var ribworkAggregate = surfaceAggregate(glyphs, 'naveCutter', 'naveRibwork', params.naveRibwork);
        var ribwork = Math.max(0, ribworkAggregate.value);
        if (plan === 'arcade' && ribwork <= 0.001) {
          renderNaveCutterLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        var columnAggregate = surfaceAggregate(glyphs, 'naveCutter', 'naveColumns', params.naveColumns);
        if (!columnAggregate.weight) return;
        var columns = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('naveColumns', Math.round(columnAggregate.value), 0, 1, 24) : Math.max(1, Math.min(24, Math.round(columnAggregate.value))));
        var rise = surfaceAggregate(glyphs, 'naveCutter', 'naveRise', params.naveRise).value;
        var voidAmount = surfaceAggregate(glyphs, 'naveCutter', 'naveVoid', params.naveVoid).value;
        var buttress = Math.max(0, surfaceAggregate(glyphs, 'naveCutter', 'naveButtress', params.naveButtress).value * pixelScale * L.s);
        var warp = surfaceAggregate(glyphs, 'naveCutter', 'naveWarp', params.naveWarp).value;
        var mask = buildSurfaceMask(glyphs, 'naveCutter', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'naveCutter', coverBase);
        var maskCtx = mask.getContext('2d', { willReadFrequently: true });
        var source;
        try { source = maskCtx.getImageData(0, 0, width, height); }
        catch (error) { return; }
        var field = surfaceBoundaryDistance(source.data, width, height);
        if (!field.bounds) return;
        var nodes = surfaceNodesForGlyphs(glyphs, 'naveCutter', 192, pixelScale, L, 0, 0, 0);
        if (!nodes.length) return;
        var work = surfaceScratch('nave-cutter-v34', width, height, false);
        var ctx = work.ctx;
        var color = surfaceEffectColor('naveCutter');
        var rgb = surfaceHexRgb(color);
        var deepest = surfaceToneCss(rgb, -0.78);
        var dark = surfaceToneCss(rgb, -0.54);
        var shadow = surfaceToneCss(rgb, -0.31);
        var light = surfaceToneCss(rgb, 0.58);
        var glint = surfaceToneCss(rgb, 0.84);
        var unit = Math.max(0.5, pixelScale * L.s);
        var phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var breath = compositionState.enabled ? Math.sin(phase) : 0;
        var axisX = params.vertical ? 0 : 1;
        var axisY = params.vertical ? 1 : 0;
        var normalX = -axisY;
        var normalY = axisX;
        function navePoint(u, v) {
          return { x: axisX * u + normalX * v, y: axisY * u + normalY * v };
        }
        function moveNave(context, u, v) {
          var point = navePoint(u, v);
          context.moveTo(point.x, point.y);
        }
        function lineNave(context, u, v) {
          var point = navePoint(u, v);
          context.lineTo(point.x, point.y);
        }
        function quadNave(context, cu, cv, u, v) {
          var control = navePoint(cu, cv), point = navePoint(u, v);
          context.quadraticCurveTo(control.x, control.y, point.x, point.y);
        }
        function bezierNave(context, c1u, c1v, c2u, c2v, u, v) {
          var c1 = navePoint(c1u, c1v), c2 = navePoint(c2u, c2v), point = navePoint(u, v);
          context.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, point.x, point.y);
        }

        // A small dilation fuses fragile strokes into stone without replacing
        // the source silhouette with the rectangular block used by Monolith.
        var bodyMask = surfaceScratch('nave-cutter-v34-body-mask', width, height, false);
        var bodyMaskCtx = bodyMask.ctx;
        var masonryGrowth = Math.min(18 * unit, Math.max(1.2 * unit,
          buttress * 0.14 + ribwork * 0.72 * unit));
        var growthSteps = Math.max(1, Math.min(4, Math.ceil(masonryGrowth / Math.max(1, 2.8 * unit))));
        bodyMaskCtx.globalAlpha = columnAggregate.strength;
        bodyMaskCtx.drawImage(mask, 0, 0);
        for (var growthStep = 1; growthStep <= growthSteps; growthStep++) {
          var growthRadius = masonryGrowth * growthStep / growthSteps;
          for (var growthAngle = 0; growthAngle < 8; growthAngle++) {
            var growthTheta = growthAngle * Math.PI / 4;
            bodyMaskCtx.drawImage(mask, Math.cos(growthTheta) * growthRadius, Math.sin(growthTheta) * growthRadius);
          }
        }
        bodyMaskCtx.globalAlpha = 1;
        var masonry = surfaceScratch('nave-cutter-v34-masonry', width, height, false);
        masonry.ctx.drawImage(bodyMask.canvas, 0, 0);
        masonry.ctx.globalCompositeOperation = 'source-in';
        var minX = field.bounds[0], minY = field.bounds[1], maxX = field.bounds[2], maxY = field.bounds[3];
        var stoneLight = params.vertical
          ? masonry.ctx.createLinearGradient(minX, 0, maxX, 0)
          : masonry.ctx.createLinearGradient(0, minY, 0, maxY);
        stoneLight.addColorStop(0, light);
        stoneLight.addColorStop(0.18, color);
        stoneLight.addColorStop(0.52, shadow);
        stoneLight.addColorStop(0.78, color);
        stoneLight.addColorStop(1, deepest);
        masonry.ctx.fillStyle = stoneLight;
        masonry.ctx.fillRect(0, 0, width, height);
        masonry.ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(masonry.canvas, 0, 0);

        var groupsByLine = {};
        for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
          var lineKey = String(nodes[nodeIndex].glyph.line || 0);
          if (!groupsByLine[lineKey]) groupsByLine[lineKey] = [];
          groupsByLine[lineKey].push(nodes[nodeIndex]);
        }
        var halls = [];
        Object.keys(groupsByLine).sort(function (a, b) { return Number(a) - Number(b); }).forEach(function (lineKey) {
          var lineNodes = groupsByLine[lineKey];
          for (var i = 0; i < lineNodes.length; i++) {
            var node = lineNodes[i];
            node.naveU = node.x * axisX + node.y * axisY;
            node.naveV = node.x * normalX + node.y * normalY;
            node.naveAxisExtent = Math.max(2 * unit, Math.abs((params.vertical ? node.glyph.h * node.glyph.scaleY : node.glyph.w * node.glyph.scaleX) * L.s * pixelScale));
            node.naveCrossExtent = Math.max(2 * unit, Math.abs((params.vertical ? node.glyph.w * node.glyph.scaleX : node.glyph.h * node.glyph.scaleY) * L.s * pixelScale));
          }
          lineNodes.sort(function (a, b) { return a.naveU - b.naveU; });
          var lineMinU = Infinity, lineMaxU = -Infinity, lineMinV = Infinity, lineMaxV = -Infinity, largestCross = 0;
          for (var n = 0; n < lineNodes.length; n++) {
            lineMinU = Math.min(lineMinU, lineNodes[n].naveU - lineNodes[n].naveAxisExtent * 0.5);
            lineMaxU = Math.max(lineMaxU, lineNodes[n].naveU + lineNodes[n].naveAxisExtent * 0.5);
            lineMinV = Math.min(lineMinV, lineNodes[n].naveV - lineNodes[n].naveCrossExtent * 0.52);
            lineMaxV = Math.max(lineMaxV, lineNodes[n].naveV + lineNodes[n].naveCrossExtent * 0.52);
            largestCross = Math.max(largestCross, lineNodes[n].naveCrossExtent);
          }
          var hallHeight = Math.max(20 * unit, lineMaxV - lineMinV, largestCross);
          var axialPadding = Math.min(hallHeight * 0.28, 24 * unit + buttress * 0.12);
          lineMinU -= axialPadding;
          lineMaxU += axialPadding;
          lineMinV -= hallHeight * 0.08;
          lineMaxV += hallHeight * 0.08;
          hallHeight = lineMaxV - lineMinV;
          var possibleBays = Math.max(1, Math.round((lineMaxU - lineMinU) / Math.max(20 * unit, hallHeight * 0.36)));
          var bayCount = Math.max(1, Math.min(24, Math.min(columns, possibleBays)));
          var bayWidth = (lineMaxU - lineMinU) / bayCount;
          var hall = { nodes: lineNodes, minU: lineMinU, maxU: lineMaxU, minV: lineMinV, maxV: lineMaxV,
            height: hallHeight, bays: bayCount, bayWidth: bayWidth, centers: [], crowns: [] };
          for (var bay = 0; bay < bayCount; bay++) {
            var warpPhase = (bay + 1) * 1.731 + Number(lineKey) * 0.89 + params.seed * 0.17 + phase * 0.19;
            var bayCenter = lineMinU + (bay + 0.5) * bayWidth
              + Math.sin(warpPhase) * warp * bayWidth * 0.16;
            hall.centers.push(bayCenter);
            hall.crowns.push(lineMinV + hallHeight * (0.1 + 0.04 / Math.max(0.25, rise))
              - breath * hallHeight * Math.min(0.08, ribwork * 0.012) * (plan === 'fan' ? 1.35 : 1));
          }
          halls.push(hall);
        });

        function tracePointedOpening(context, centerU, floorV, openingWidth, openingHeight, crownLift) {
          var leftU = centerU - openingWidth * 0.5;
          var rightU = centerU + openingWidth * 0.5;
          var crownV = floorV - openingHeight * rise * crownLift;
          var springV = floorV - openingHeight * (plan === 'clerestory' ? 0.44 : 0.5);
          context.beginPath();
          moveNave(context, leftU, floorV);
          lineNave(context, leftU, springV);
          quadNave(context, leftU + openingWidth * 0.08, crownV + openingHeight * 0.13, centerU, crownV);
          quadNave(context, rightU - openingWidth * 0.08, crownV + openingHeight * 0.13, rightU, springV);
          lineNave(context, rightU, floorV);
          context.closePath();
        }

        // The aperture is actual alpha subtraction. Painting paper into a
        // glyph left a pale triangular tooth; this makes the void structural.
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = columnAggregate.strength * Math.min(1, voidAmount * (0.72 + voidAmount * 0.38));
        for (var hallIndex = 0; hallIndex < halls.length; hallIndex++) {
          var apertureHall = halls[hallIndex];
          for (var apertureBay = 0; apertureBay < apertureHall.bays; apertureBay++) {
            var apertureWidth = apertureHall.bayWidth * (plan === 'clerestory' ? 0.34 : 0.22 + voidAmount * 0.55);
            var apertureHeight = apertureHall.height * (plan === 'clerestory' ? 0.5 : 0.34 + voidAmount * 0.42);
            tracePointedOpening(ctx, apertureHall.centers[apertureBay], apertureHall.maxV + 2 * unit,
              Math.max(2 * unit, apertureWidth), apertureHeight, plan === 'fan' ? 1.12 : 1);
            ctx.fill();
            if (plan === 'clerestory') {
              var lancetWidth = Math.max(2 * unit, apertureHall.bayWidth * (0.12 + voidAmount * 0.13));
              var lancetFloor = apertureHall.minV + apertureHall.height * 0.47;
              tracePointedOpening(ctx, apertureHall.centers[apertureBay], lancetFloor,
                lancetWidth, apertureHall.height * 0.26, 1.18);
              ctx.fill();
            }
          }
        }
        ctx.restore();

        var ribs = surfaceScratch('nave-cutter-v34-rib-network', width, height, false);
        var ribsCtx = ribs.ctx;
        ribsCtx.lineCap = 'round';
        ribsCtx.lineJoin = 'round';
        var ribWidth = Math.max(0.75 * unit,
          buttress * (0.11 + ribwork * 0.022) + ribwork * unit * 0.42);
        function strokeNaveRib(trace, widthScale, alphaScale) {
          var layers = [
            { color: deepest, width: ribWidth * widthScale * 2.35, alpha: 0.28 },
            { color: dark, width: ribWidth * widthScale * 1.42, alpha: 0.9 },
            { color: color, width: ribWidth * widthScale * 0.82, alpha: 0.98 },
            { color: glint, width: Math.max(0.45 * unit, ribWidth * widthScale * 0.2), alpha: 0.72 }
          ];
          for (var layer = 0; layer < layers.length; layer++) {
            ribsCtx.beginPath();
            trace(ribsCtx);
            ribsCtx.strokeStyle = layers[layer].color;
            ribsCtx.lineWidth = layers[layer].width;
            ribsCtx.globalAlpha = columnAggregate.strength * alphaScale * layers[layer].alpha;
            ribsCtx.stroke();
          }
          ribsCtx.globalAlpha = 1;
        }
        function tracePointedRib(context, leftU, rightU, springV, crownV) {
          var centerU = (leftU + rightU) * 0.5;
          moveNave(context, leftU, springV);
          quadNave(context, leftU + (rightU - leftU) * 0.18, crownV + (springV - crownV) * 0.12, centerU, crownV);
          quadNave(context, rightU - (rightU - leftU) * 0.18, crownV + (springV - crownV) * 0.12, rightU, springV);
        }
        function drawNaveBoss(u, v, radius, ornate) {
          var point = navePoint(u, v);
          ribsCtx.globalAlpha = columnAggregate.strength;
          ribsCtx.fillStyle = deepest;
          ribsCtx.beginPath();
          ribsCtx.arc(point.x, point.y, radius * 1.42, 0, Math.PI * 2);
          ribsCtx.fill();
          ribsCtx.fillStyle = color;
          ribsCtx.beginPath();
          ribsCtx.arc(point.x, point.y, radius, 0, Math.PI * 2);
          ribsCtx.fill();
          if (ornate) {
            ribsCtx.fillStyle = light;
            for (var lobe = 0; lobe < 4; lobe++) {
              var lobeAngle = lobe * Math.PI * 0.5 + Math.PI * 0.25;
              ribsCtx.beginPath();
              ribsCtx.arc(point.x + Math.cos(lobeAngle) * radius * 0.74,
                point.y + Math.sin(lobeAngle) * radius * 0.74, radius * 0.33, 0, Math.PI * 2);
              ribsCtx.fill();
            }
          }
          ribsCtx.strokeStyle = glint;
          ribsCtx.lineWidth = Math.max(0.45 * unit, radius * 0.18);
          ribsCtx.beginPath();
          ribsCtx.arc(point.x, point.y, radius * 0.72, 0, Math.PI * 2);
          ribsCtx.stroke();
          ribsCtx.globalAlpha = 1;
        }
        function drawClusteredPier(u, topV, springV, floorV, weight) {
          strokeNaveRib(function (context) { moveNave(context, u, floorV); lineNave(context, u, topV); }, weight, 0.84);
          var shaftOffset = ribWidth * (1.05 + ribwork * 0.08);
          strokeNaveRib(function (context) {
            moveNave(context, u - shaftOffset, floorV); lineNave(context, u - shaftOffset * 0.72, springV);
            moveNave(context, u + shaftOffset, floorV); lineNave(context, u + shaftOffset * 0.72, springV);
          }, 0.34 * weight, 0.58);
          strokeNaveRib(function (context) {
            moveNave(context, u - ribWidth * 2.4, springV); lineNave(context, u + ribWidth * 2.4, springV);
            moveNave(context, u - ribWidth * 1.9, floorV); lineNave(context, u + ribWidth * 1.9, floorV);
          }, 0.42 * weight, 0.7);
        }

        for (var structureIndex = 0; structureIndex < halls.length; structureIndex++) {
          var hall = halls[structureIndex];
          var topV = hall.minV;
          var floorV = hall.maxV;
          var springV = floorV - hall.height * (0.19 + Math.min(1, voidAmount) * 0.08);
          var ridgeV = hall.minV + hall.height * (plan === 'clerestory' ? 0.31 : 0.16);
          for (var pier = 0; pier <= hall.bays; pier++) {
            var pierU = hall.minU + pier * hall.bayWidth;
            drawClusteredPier(pierU, topV + hall.height * (plan === 'fan' ? 0.28 : 0.08), springV, floorV,
              pier === 0 || pier === hall.bays ? 1.18 : 0.88);
            if (buttress > 0.01) {
              var outward = (pier === hall.bays ? 1 : pier === 0 ? -1 : (pier % 2 ? -1 : 1));
              var flyerU = pierU + outward * Math.min(hall.bayWidth * 0.24, buttress * (0.34 + ribwork * 0.05));
              strokeNaveRib(function (context) {
                moveNave(context, pierU, springV - hall.height * 0.08);
                quadNave(context, flyerU, springV + hall.height * 0.02, flyerU, floorV);
              }, 0.48, 0.52);
            }
          }
          for (var structureBay = 0; structureBay < hall.bays; structureBay++) {
            var leftU = hall.minU + structureBay * hall.bayWidth;
            var rightU = leftU + hall.bayWidth;
            var centerU = hall.centers[structureBay];
            var crownV = hall.crowns[structureBay];
            var bossV = crownV + hall.height * (plan === 'clerestory' ? 0.2 : 0.16 + 0.025 * Math.min(4, ribwork));
            strokeNaveRib(function (context) { tracePointedRib(context, leftU, rightU, springV, crownV); }, 1.08, 0.94);
            if (plan === 'fan') {
              var fanRays = Math.max(3, Math.min(10, Math.round(3 + ribwork * 1.6)));
              for (var fanRay = 0; fanRay < fanRays; fanRay++) {
                var fanT = fanRays === 1 ? 0.5 : fanRay / (fanRays - 1);
                var fanTargetU = leftU + hall.bayWidth * fanT;
                var fanTargetV = crownV + Math.abs(fanT - 0.5) * hall.height * 0.16;
                var fanOriginU = fanT < 0.5 ? leftU : rightU;
                strokeNaveRib(function (context) {
                  moveNave(context, fanOriginU, springV);
                  quadNave(context, centerU, crownV + hall.height * (0.18 + Math.abs(fanT - 0.5) * 0.08), fanTargetU, fanTargetV);
                }, 0.34, 0.54 + ribwork * 0.05);
              }
            } else if (plan === 'loop') {
              var loopWidth = hall.bayWidth * (0.18 + Math.min(4, ribwork) * 0.025);
              var loopHeight = hall.height * (0.09 + Math.min(4, ribwork) * 0.012);
              strokeNaveRib(function (context) {
                moveNave(context, centerU, bossV - loopHeight);
                bezierNave(context, centerU + loopWidth, bossV - loopHeight, centerU + loopWidth, bossV + loopHeight, centerU, bossV + loopHeight);
                bezierNave(context, centerU - loopWidth, bossV + loopHeight, centerU - loopWidth, bossV - loopHeight, centerU, bossV - loopHeight);
              }, 0.48, 0.72);
              strokeNaveRib(function (context) {
                moveNave(context, leftU, springV);
                bezierNave(context, leftU + hall.bayWidth * 0.16, crownV, centerU - loopWidth, bossV, centerU, bossV);
                bezierNave(context, centerU + loopWidth, bossV, rightU - hall.bayWidth * 0.16, crownV, rightU, springV);
              }, 0.46, 0.72);
            } else if (plan === 'clerestory') {
              var triforiumV = hall.minV + hall.height * 0.52;
              var clerestoryV = hall.minV + hall.height * 0.28;
              strokeNaveRib(function (context) {
                moveNave(context, leftU, triforiumV); lineNave(context, rightU, triforiumV);
                moveNave(context, leftU, clerestoryV); lineNave(context, rightU, clerestoryV);
              }, 0.38, 0.64);
              var lancetHalf = hall.bayWidth * 0.15;
              strokeNaveRib(function (context) {
                tracePointedRib(context, centerU - lancetHalf, centerU + lancetHalf,
                  triforiumV - hall.height * 0.03, hall.minV + hall.height * 0.08);
              }, 0.46, 0.78);
            } else {
              strokeNaveRib(function (context) {
                moveNave(context, leftU, springV);
                quadNave(context, centerU - hall.bayWidth * 0.18, bossV + hall.height * 0.04, centerU, bossV);
                quadNave(context, centerU + hall.bayWidth * 0.18, bossV + hall.height * 0.04, rightU, springV);
              }, 0.54, 0.78);
              if (ribwork > 1.45) {
                strokeNaveRib(function (context) {
                  moveNave(context, leftU, topV + hall.height * 0.28);
                  quadNave(context, centerU - hall.bayWidth * 0.25, bossV, centerU, bossV);
                  quadNave(context, centerU + hall.bayWidth * 0.25, bossV, rightU, topV + hall.height * 0.28);
                }, 0.32, Math.min(0.74, 0.36 + ribwork * 0.11));
              }
            }
            drawNaveBoss(centerU, bossV, Math.max(ribWidth * 0.88, Math.min(hall.bayWidth, hall.height) * 0.025),
              plan === 'loop' || ribwork > 2.35);
          }
          // A longitudinal ridge makes consecutive bays one nave instead of
          // a row of unrelated triangles.
          strokeNaveRib(function (context) {
            for (var ridge = 0; ridge < hall.centers.length; ridge++) {
              var ridgePointV = hall.crowns[ridge] + hall.height * (plan === 'clerestory' ? 0.2 : 0.16 + 0.025 * Math.min(4, ribwork));
              if (ridge === 0) moveNave(context, hall.centers[ridge], ridgePointV);
              else lineNave(context, hall.centers[ridge], ridgePointV);
            }
          }, 0.42, 0.72);
          if (plan === 'clerestory' || ribwork > 2.05) {
            var galleryCount = plan === 'clerestory' ? 3 : 2;
            for (var gallery = 1; gallery <= galleryCount; gallery++) {
              var galleryV = hall.minV + hall.height * (0.18 + gallery * (plan === 'clerestory' ? 0.17 : 0.21));
              strokeNaveRib(function (context) {
                moveNave(context, hall.minU, galleryV); lineNave(context, hall.maxU, galleryV);
              }, 0.24, 0.36 + ribwork * 0.06);
            }
          }
        }

        // Cast relief first, then the complete axial network, then a second
        // full-strength pass anchored to the fused source body.
        var ribShadow = surfaceScratch('nave-cutter-v34-rib-shadow', width, height, false);
        ribShadow.ctx.drawImage(ribs.canvas, 0, 0);
        ribShadow.ctx.globalCompositeOperation = 'source-in';
        ribShadow.ctx.fillStyle = deepest;
        ribShadow.ctx.fillRect(0, 0, width, height);
        ribShadow.ctx.globalCompositeOperation = 'source-over';
        ctx.save();
        ctx.globalAlpha = Math.min(0.72, 0.28 + ribwork * 0.1);
        ctx.drawImage(ribShadow.canvas, ribWidth * 0.72, ribWidth * 0.92);
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = Math.min(0.96, 0.62 + ribwork * 0.08);
        ctx.drawImage(ribs.canvas, 0, 0);
        ctx.restore();
        ribsCtx.globalCompositeOperation = 'destination-in';
        ribsCtx.drawImage(bodyMask.canvas, 0, 0);
        ribsCtx.globalCompositeOperation = 'source-over';
        ctx.drawImage(ribs.canvas, 0, 0);
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderCloisterFold(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var topology = surfaceChoice(glyphs, 'cloisterFold', 'cloisterTessellation', params.cloisterTessellation, BATCH_PARAM_OPTIONS.cloisterTessellation);
        var reliefAggregate = surfaceAggregate(glyphs, 'cloisterFold', 'cloisterRelief', params.cloisterRelief);
        var relief = Math.max(0, reliefAggregate.value);
        // Strips is the explicit compatibility lane. Modern topologies below
        // are real connected fold meshes; they no longer fall back to an
        // in-mask lighting treatment that leaves the glyph silhouette flat.
        if (topology === 'strips') {
          renderCloisterFoldLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        var planeAggregate = surfaceAggregate(glyphs, 'cloisterFold', 'cloisterPlanes', params.cloisterPlanes);
        if (!planeAggregate.weight) return;
        var planes = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('cloisterPlanes', Math.round(planeAggregate.value), 0, 1, 32) : Math.max(1, Math.min(32, Math.round(planeAggregate.value))));
        var fold = surfaceAggregate(glyphs, 'cloisterFold', 'cloisterFoldAmount', params.cloisterFold).value;
        var axis = surfaceAggregate(glyphs, 'cloisterFold', 'cloisterAxis', params.cloisterAxis).value * Math.PI / 180;
        var perspective = surfaceAggregate(glyphs, 'cloisterFold', 'cloisterPerspective', params.cloisterPerspective).value;
        var crease = Math.max(0, surfaceAggregate(glyphs, 'cloisterFold', 'cloisterCrease', params.cloisterCrease).value * pixelScale * L.s);
        var mask = buildSurfaceMask(glyphs, 'cloisterFold', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'cloisterFold', coverBase);
        var maskCtx = mask.getContext('2d', { willReadFrequently: true });
        var source;
        try { source = maskCtx.getImageData(0, 0, width, height); }
        catch (error) { return; }
        var field = surfaceBoundaryDistance(source.data, width, height);
        if (!field.bounds) return;
        var rgb = surfaceHexRgb(surfaceEffectColor('cloisterFold'));
        var minX = field.bounds[0], minY = field.bounds[1], maxX = field.bounds[2], maxY = field.bounds[3];
        var centerX = (minX + maxX) * 0.5, centerY = (minY + maxY) * 0.5;
        var spanW = Math.max(1, maxX - minX + 1), spanH = Math.max(1, maxY - minY + 1);
        var ux = Math.cos(axis), uy = Math.sin(axis), nx = -uy, ny = ux;
        var motion = compositionState.enabled ? Math.sin((((compositionState.phase % 1) + 1) % 1) * Math.PI * 2) : 0;
        var foldSign = fold < 0 ? -1 : 1;
        var corners = [
          [minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]
        ];
        var uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
        for (var cornerIndex = 0; cornerIndex < corners.length; cornerIndex++) {
          var cornerDx = corners[cornerIndex][0] - centerX;
          var cornerDy = corners[cornerIndex][1] - centerY;
          var cornerU = cornerDx * ux + cornerDy * uy;
          var cornerV = cornerDx * nx + cornerDy * ny;
          uMin = Math.min(uMin, cornerU); uMax = Math.max(uMax, cornerU);
          vMin = Math.min(vMin, cornerV); vMax = Math.max(vMax, cornerV);
        }
        var axialSpan = Math.max(1, uMax - uMin);
        var normalSpan = Math.max(1, vMax - vMin);
        var cellNormal = normalSpan / Math.max(1, planes);
        var foldEnergy = Math.min(1.18, Math.abs(fold) * 0.5 * (1 + motion * 0.16) + relief * 0.035);
        var amplitude = Math.min(normalSpan * 0.3, cellNormal
          * (0.32 + relief * 0.16)
          * (0.38 + foldEnergy * 1.05)
          * (0.86 + perspective * 0.11));
        // Signed exploration must pass through an unfolded sheet, not jump
        // between two finite-depth meshes at Fold=0. Keep established shapes
        // outside the narrow neutral zone exactly unchanged.
        var foldZeroT = Math.min(1, Math.abs(fold) * 4);
        var foldZeroEase = foldZeroT * foldZeroT * (3 - 2 * foldZeroT);
        amplitude *= foldZeroEase;
        var compression = Math.max(0.5, 1 - Math.min(0.42,
          foldEnergy * 0.17 + relief * 0.022 + perspective * 0.026));
        var facets = [];
        var creases = [];
        var vertexSerial = 0;

        function localSource(u, v) {
          return { x: centerX + ux * u + nx * v, y: centerY + uy * u + ny * v };
        }

        function projectedPoint(u, v, z, offsetU, offsetV) {
          var projectedU = u + (offsetU || 0) + z * (0.15 + perspective * 0.055);
          var projectedV = v * compression + (offsetV || 0) + z * (0.52 + perspective * 0.14);
          return {
            x: centerX + ux * projectedU + nx * projectedV,
            y: centerY + uy * projectedU + ny * projectedV
          };
        }

        function foldVertex(u, v, z, offsetU, offsetV, id) {
          return {
            id: id || ('cfv-' + (vertexSerial++)),
            u: u, v: v, z: z,
            source: localSource(u, v),
            dest: projectedPoint(u, v, z, offsetU, offsetV)
          };
        }

        function addFacet(a, b, c, bias) {
          var e1u = b.u - a.u, e1v = b.v - a.v, e1z = b.z - a.z;
          var e2u = c.u - a.u, e2v = c.v - a.v, e2z = c.z - a.z;
          var normalU = e1v * e2z - e1z * e2v;
          var normalV = e1z * e2u - e1u * e2z;
          var normalZ = e1u * e2v - e1v * e2u;
          if (normalZ < 0) { normalU *= -1; normalV *= -1; normalZ *= -1; }
          var normalLength = Math.sqrt(normalU * normalU + normalV * normalV + normalZ * normalZ) || 1;
          var light = normalU / normalLength * -0.38
            + normalV / normalLength * -0.54
            + normalZ / normalLength * 0.72;
          var tone = Math.max(-0.82, Math.min(0.72, (light - 0.54) * 1.15 + (bias || 0)));
          facets.push({
            vertices: [a, b, c],
            tone: cloisterFacetTone(tone),
            depth: (a.z + b.z + c.z) / 3
          });
        }

        function addCrease(a, b, kind, outline) {
          creases.push({ a: a.dest, b: b.dest, kind: kind || 0, outline: !!outline });
        }

        if (topology === 'accordion') {
          // One broad hinge spans the entire word at each plane boundary.
          // Shared end vertices make the pleats continuous instead of copied
          // strips that drift apart under strong Perspective values.
          var accordionRows = [];
          for (var accordionIndex = 0; accordionIndex <= planes; accordionIndex++) {
            var accordionV = vMin + accordionIndex / planes * normalSpan;
            var accordionDirection = ((accordionIndex + (fold < 0 ? 1 : 0)) & 1) ? -1 : 1;
            var accordionZ = accordionDirection * amplitude * foldSign;
            var endTwist = accordionDirection * amplitude * perspective * 0.035;
            accordionRows.push([
              foldVertex(uMin, accordionV, accordionZ - endTwist, -endTwist * 0.24, 0, 'cfa-' + accordionIndex + '-0'),
              foldVertex(uMax, accordionV, accordionZ + endTwist, endTwist * 0.24, 0, 'cfa-' + accordionIndex + '-1')
            ]);
          }
          for (var accordionCell = 0; accordionCell < planes; accordionCell++) {
            var aa = accordionRows[accordionCell][0], ab = accordionRows[accordionCell][1];
            var ac = accordionRows[accordionCell + 1][1], ad = accordionRows[accordionCell + 1][0];
            addFacet(aa, ab, ac, accordionCell & 1 ? -0.08 : 0.08);
            addFacet(aa, ac, ad, accordionCell & 1 ? -0.08 : 0.08);
            if (accordionCell) addCrease(aa, ab, accordionCell & 1 ? -1 : 1, false);
          }
          addCrease(accordionRows[0][0], accordionRows[0][1], 0, true);
          addCrease(accordionRows[planes][0], accordionRows[planes][1], 0, true);
        } else if (topology === 'diamond') {
          // Each cell has a true raised or sunken centre. Four triangles share
          // that centre and the perimeter corners with adjacent cells, so the
          // result reads as a vault tessellation rather than diagonal shading.
          var diamondRows = Math.max(1, Math.min(planes, 12));
          var diamondColumns = Math.max(2, Math.min(8, Math.floor(36 / diamondRows)));
          var diamondGrid = [];
          for (var diamondRow = 0; diamondRow <= diamondRows; diamondRow++) {
            var diamondGridRow = [];
            for (var diamondColumn = 0; diamondColumn <= diamondColumns; diamondColumn++) {
              var diamondU = uMin + diamondColumn / diamondColumns * axialSpan;
              var diamondV = vMin + diamondRow / diamondRows * normalSpan;
              var diamondCornerZ = (((diamondRow + diamondColumn) & 1) ? -1 : 1)
                * amplitude * 0.12 * foldSign;
              diamondGridRow.push(foldVertex(diamondU, diamondV, diamondCornerZ, 0, 0,
                'cfd-' + diamondRow + '-' + diamondColumn));
            }
            diamondGrid.push(diamondGridRow);
          }
          for (var diamondY = 0; diamondY < diamondRows; diamondY++) {
            for (var diamondX = 0; diamondX < diamondColumns; diamondX++) {
              var d0 = diamondGrid[diamondY][diamondX];
              var d1 = diamondGrid[diamondY][diamondX + 1];
              var d2 = diamondGrid[diamondY + 1][diamondX + 1];
              var d3 = diamondGrid[diamondY + 1][diamondX];
              var vaultDirection = ((diamondX + diamondY) & 1) ? -1 : 1;
              var centreU = (d0.u + d2.u) * 0.5;
              var centreV = (d0.v + d2.v) * 0.5;
              var vaultCentre = foldVertex(centreU, centreV,
                vaultDirection * amplitude * 1.18 * foldSign,
                vaultDirection * axialSpan / diamondColumns * 0.025 * foldEnergy,
                vaultDirection * normalSpan / diamondRows * 0.025 * foldEnergy,
                'cfd-centre-' + diamondY + '-' + diamondX);
              addFacet(d0, d1, vaultCentre, 0.06);
              addFacet(d1, d2, vaultCentre, -0.08);
              addFacet(d2, d3, vaultCentre, -0.02);
              addFacet(d3, d0, vaultCentre, 0.1);
              addCrease(vaultCentre, d0, vaultDirection, false);
              addCrease(vaultCentre, d1, -vaultDirection, false);
              addCrease(vaultCentre, d2, vaultDirection, false);
              addCrease(vaultCentre, d3, -vaultDirection, false);
            }
          }
          for (var diamondSeamY = 1; diamondSeamY < diamondRows; diamondSeamY++) {
            for (var diamondSeamX = 0; diamondSeamX < diamondColumns; diamondSeamX++) {
              addCrease(diamondGrid[diamondSeamY][diamondSeamX], diamondGrid[diamondSeamY][diamondSeamX + 1],
                (diamondSeamX + diamondSeamY) & 1 ? -1 : 1, false);
            }
          }
        } else if (topology === 'fan') {
          // A perimeter fan tiles the complete source bounds. An inner ring
          // introduces a second mountain/valley event without clipping away
          // the rectangular corners of wide Latin or multi-script lines.
          var fanWedges = Math.max(8, Math.min(24, Math.ceil(Math.max(4, planes * 1.7) / 4) * 4));
          var pivotU = -axialSpan * 0.16 * foldSign * foldZeroEase;
          var pivotV = Math.max(vMin + normalSpan * 0.18, Math.min(vMax - normalSpan * 0.18,
            motion * normalSpan * 0.035));
          var fanPivot = foldVertex(pivotU, pivotV, -amplitude * 0.12 * foldSign, 0, 0, 'cff-pivot');
          var fanInner = [], fanOuter = [];
          function perimeterPoint(t) {
            var perimeterPhase = ((t % 1) + 1) % 1 * 4;
            if (perimeterPhase < 1) return { u: uMin + axialSpan * perimeterPhase, v: vMin };
            if (perimeterPhase < 2) return { u: uMax, v: vMin + normalSpan * (perimeterPhase - 1) };
            if (perimeterPhase < 3) return { u: uMax - axialSpan * (perimeterPhase - 2), v: vMax };
            return { u: uMin, v: vMax - normalSpan * (perimeterPhase - 3) };
          }
          for (var fanIndex = 0; fanIndex < fanWedges; fanIndex++) {
            var perimeter = perimeterPoint(fanIndex / fanWedges);
            var fanDu = perimeter.u - pivotU, fanDv = perimeter.v - pivotV;
            var fanLength = Math.sqrt(fanDu * fanDu + fanDv * fanDv) || 1;
            var tangentU = -fanDv / fanLength, tangentV = fanDu / fanLength;
            var fanDirection = (fanIndex & 1) ? -1 : 1;
            var fanTangential = fanDirection * amplitude * (0.12 + perspective * 0.045) * foldSign;
            fanInner.push(foldVertex(pivotU + fanDu * 0.54, pivotV + fanDv * 0.54,
              fanDirection * amplitude * 1.08 * foldSign,
              tangentU * fanTangential, tangentV * fanTangential,
              'cff-inner-' + fanIndex));
            fanOuter.push(foldVertex(perimeter.u, perimeter.v,
              -fanDirection * amplitude * 0.48 * foldSign,
              tangentU * fanTangential * 0.38, tangentV * fanTangential * 0.38,
              'cff-outer-' + fanIndex));
          }
          for (var fanCell = 0; fanCell < fanWedges; fanCell++) {
            var fanNext = (fanCell + 1) % fanWedges;
            addFacet(fanPivot, fanInner[fanCell], fanInner[fanNext], fanCell & 1 ? -0.06 : 0.06);
            addFacet(fanInner[fanCell], fanOuter[fanCell], fanOuter[fanNext], fanCell & 1 ? 0.05 : -0.05);
            addFacet(fanInner[fanCell], fanOuter[fanNext], fanInner[fanNext], fanCell & 1 ? 0.05 : -0.05);
            addCrease(fanPivot, fanInner[fanCell], fanCell & 1 ? -1 : 1, false);
            addCrease(fanInner[fanCell], fanOuter[fanCell], fanCell & 1 ? 1 : -1, false);
            addCrease(fanInner[fanCell], fanInner[fanNext], fanCell & 1 ? -1 : 1, false);
          }
        } else {
          // Miura is a bounded quadrilateral mesh with shared degree-four
          // vertices. Alternating diagonals and a staggered projection make
          // every cell participate in the same one-sheet kinematic field.
          var miuraRows = Math.max(1, planes);
          var miuraColumns = Math.max(2, Math.min(6, Math.floor(64 / miuraRows)));
          var miuraGrid = [];
          var miuraCellU = axialSpan / miuraColumns;
          var miuraCellV = normalSpan / miuraRows;
          for (var miuraRow = 0; miuraRow <= miuraRows; miuraRow++) {
            var miuraGridRow = [];
            for (var miuraColumn = 0; miuraColumn <= miuraColumns; miuraColumn++) {
              var miuraU = uMin + miuraColumn / miuraColumns * axialSpan;
              var miuraV = vMin + miuraRow / miuraRows * normalSpan;
              var miuraDirection = ((miuraRow + miuraColumn) & 1) ? -1 : 1;
              var stagger = ((miuraRow & 1) ? 1 : -1) * miuraCellU * 0.13 * foldEnergy;
              if (miuraColumn === 0 || miuraColumn === miuraColumns) stagger *= 0.42;
              var crossStagger = ((miuraColumn & 1) ? 1 : -1) * miuraCellV * 0.065 * foldEnergy;
              miuraGridRow.push(foldVertex(miuraU, miuraV,
                miuraDirection * amplitude * foldSign,
                stagger, crossStagger,
                'cfm-' + miuraRow + '-' + miuraColumn));
            }
            miuraGrid.push(miuraGridRow);
          }
          for (var miuraY = 0; miuraY < miuraRows; miuraY++) {
            for (var miuraX = 0; miuraX < miuraColumns; miuraX++) {
              var m0 = miuraGrid[miuraY][miuraX];
              var m1 = miuraGrid[miuraY][miuraX + 1];
              var m2 = miuraGrid[miuraY + 1][miuraX + 1];
              var m3 = miuraGrid[miuraY + 1][miuraX];
              if ((miuraX + miuraY) & 1) {
                addFacet(m0, m1, m3, -0.04);
                addFacet(m1, m2, m3, 0.04);
                addCrease(m1, m3, -1, false);
              } else {
                addFacet(m0, m1, m2, 0.04);
                addFacet(m0, m2, m3, -0.04);
                addCrease(m0, m2, 1, false);
              }
            }
          }
          for (var miuraSeamRow = 1; miuraSeamRow < miuraRows; miuraSeamRow++) {
            for (var miuraSeamColumn = 0; miuraSeamColumn < miuraColumns; miuraSeamColumn++) {
              addCrease(miuraGrid[miuraSeamRow][miuraSeamColumn], miuraGrid[miuraSeamRow][miuraSeamColumn + 1],
                (miuraSeamRow + miuraSeamColumn) & 1 ? -1 : 1, false);
            }
          }
          for (var miuraColumnSeam = 1; miuraColumnSeam < miuraColumns; miuraColumnSeam++) {
            for (var miuraRowSeam = 0; miuraRowSeam < miuraRows; miuraRowSeam++) {
              addCrease(miuraGrid[miuraRowSeam][miuraColumnSeam], miuraGrid[miuraRowSeam + 1][miuraColumnSeam],
                (miuraColumnSeam + miuraRowSeam) & 1 ? 1 : -1, false);
            }
          }
        }

        function affineTriangle(ctx, sourceCanvas, facet, offsetX, offsetY, alpha) {
          var s0 = facet.vertices[0].source, s1 = facet.vertices[1].source, s2 = facet.vertices[2].source;
          var d0 = facet.vertices[0].dest, d1 = facet.vertices[1].dest, d2 = facet.vertices[2].dest;
          var sourceAX = s1.x - s0.x, sourceAY = s1.y - s0.y;
          var sourceBX = s2.x - s0.x, sourceBY = s2.y - s0.y;
          var determinant = sourceAX * sourceBY - sourceBX * sourceAY;
          if (Math.abs(determinant) < 0.00001) return;
          var inverse00 = sourceBY / determinant;
          var inverse01 = -sourceBX / determinant;
          var inverse10 = -sourceAY / determinant;
          var inverse11 = sourceAX / determinant;
          var destinationAX = d1.x - d0.x, destinationAY = d1.y - d0.y;
          var destinationBX = d2.x - d0.x, destinationBY = d2.y - d0.y;
          var a = destinationAX * inverse00 + destinationBX * inverse10;
          var c = destinationAX * inverse01 + destinationBX * inverse11;
          var b = destinationAY * inverse00 + destinationBY * inverse10;
          var d = destinationAY * inverse01 + destinationBY * inverse11;
          var e = d0.x + (offsetX || 0) - a * s0.x - c * s0.y;
          var f = d0.y + (offsetY || 0) - b * s0.x - d * s0.y;
          ctx.save();
          ctx.setTransform(a, b, c, d, e, f);
          ctx.beginPath();
          ctx.moveTo(s0.x, s0.y); ctx.lineTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.closePath();
          ctx.clip();
          ctx.globalAlpha = alpha;
          ctx.drawImage(sourceCanvas, 0, 0);
          ctx.restore();
        }

        // Exact output colours, not quantized lighting. Reuse at most the same
        // seven mask slots as the old palette; repeated faces share their ink.
        // Frame-local keys prevent stale alpha when the glyph or layout moves.
        var facetInkCache = [], facetInkClock = 0;
        function facetInkForTone(tone) {
          var color = surfaceToneCss(rgb, tone), entry = null, oldest = null;
          for (var inkIndex = 0; inkIndex < facetInkCache.length; inkIndex++) {
            var cachedInk = facetInkCache[inkIndex];
            if (cachedInk.color === color) { entry = cachedInk; break; }
            if (!oldest || cachedInk.used < oldest.used) oldest = cachedInk;
          }
          if (!entry) {
            if (facetInkCache.length < 7) {
              var inkLayer = surfaceScratch('cloister-fold-piecewise-tone-' + facetInkCache.length, width, height, false);
              inkLayer.ctx.drawImage(mask, 0, 0);
              entry = { layer: inkLayer, color: null, used: 0 };
              facetInkCache.push(entry);
            } else entry = oldest;
            entry.layer.ctx.globalCompositeOperation = 'source-in';
            entry.layer.ctx.fillStyle = color;
            entry.layer.ctx.fillRect(0, 0, width, height);
            entry.layer.ctx.globalCompositeOperation = 'source-over';
            entry.color = color;
          }
          entry.used = ++facetInkClock;
          return entry.layer.canvas;
        }
        var shadowSource = surfaceScratch('cloister-fold-piecewise-shadow-source', width, height, false);
        shadowSource.ctx.drawImage(mask, 0, 0);
        shadowSource.ctx.globalCompositeOperation = 'source-in';
        shadowSource.ctx.fillStyle = surfaceToneCss(rgb, -0.96);
        shadowSource.ctx.fillRect(0, 0, width, height);
        shadowSource.ctx.globalCompositeOperation = 'source-over';

        var body = surfaceScratch('cloister-fold-piecewise-body', width, height, false);
        var shadow = surfaceScratch('cloister-fold-piecewise-shadow', width, height, false);
        var orderedFacets = facets.slice().sort(function (left, right) { return left.depth - right.depth; });
        var shadowDistance = Math.min(42 * pixelScale * L.s,
          amplitude * (0.14 + perspective * 0.07) + crease * 0.18);
        var shadowX = (ux * 0.28 + nx * 0.82) * shadowDistance;
        var shadowY = (uy * 0.28 + ny * 0.82) * shadowDistance;
        var shadowAlpha = planeAggregate.strength * Math.min(0.46,
          0.08 + relief * 0.055 + perspective * 0.035 + foldEnergy * 0.08);
        for (var facetIndex = 0; facetIndex < orderedFacets.length; facetIndex++) {
          var facet = orderedFacets[facetIndex];
          affineTriangle(shadow.ctx, shadowSource.canvas, facet, shadowX, shadowY, shadowAlpha);
          affineTriangle(body.ctx, facetInkForTone(facet.tone), facet, 0, 0, planeAggregate.strength);
        }

        var seams = surfaceScratch('cloister-fold-piecewise-seams', width, height, false);
        var seamCtx = seams.ctx;
        if (crease > 0.05) {
          seamCtx.lineCap = 'round';
          seamCtx.lineJoin = 'round';
          for (var creaseIndex = 0; creaseIndex < creases.length; creaseIndex++) {
            var foldCrease = creases[creaseIndex];
            var segmentX = foldCrease.b.x - foldCrease.a.x;
            var segmentY = foldCrease.b.y - foldCrease.a.y;
            var segmentLength = Math.sqrt(segmentX * segmentX + segmentY * segmentY) || 1;
            var railNormalX = -segmentY / segmentLength;
            var railNormalY = segmentX / segmentLength;
            var railDirection = foldCrease.kind < 0 ? -1 : 1;
            var railWidth = Math.max(0.45, crease * (foldCrease.outline ? 0.44 : 0.72));
            seamCtx.strokeStyle = surfaceToneCss(rgb, foldCrease.outline ? -0.72 : -0.86);
            seamCtx.globalAlpha = planeAggregate.strength * Math.min(0.94,
              (foldCrease.outline ? 0.26 : 0.42) + relief * 0.09 + foldEnergy * 0.16);
            seamCtx.lineWidth = railWidth;
            seamCtx.beginPath();
            seamCtx.moveTo(foldCrease.a.x, foldCrease.a.y);
            seamCtx.lineTo(foldCrease.b.x, foldCrease.b.y);
            seamCtx.stroke();
            seamCtx.strokeStyle = surfaceToneCss(rgb, 0.9);
            seamCtx.globalAlpha *= 0.62;
            seamCtx.lineWidth = Math.max(0.35, railWidth * 0.34);
            seamCtx.beginPath();
            seamCtx.moveTo(foldCrease.a.x + railNormalX * railWidth * 0.42 * railDirection,
              foldCrease.a.y + railNormalY * railWidth * 0.42 * railDirection);
            seamCtx.lineTo(foldCrease.b.x + railNormalX * railWidth * 0.42 * railDirection,
              foldCrease.b.y + railNormalY * railWidth * 0.42 * railDirection);
            seamCtx.stroke();
          }
          seamCtx.globalAlpha = 1;
          seamCtx.globalCompositeOperation = 'destination-in';
          seamCtx.drawImage(body.canvas, 0, 0);
          seamCtx.globalCompositeOperation = 'source-over';
        }

        var work = surfaceScratch('cloister-fold-piecewise', width, height, false);
        if (shadowAlpha > 0.01) {
          work.ctx.save();
          work.ctx.filter = 'blur(' + Math.min(12, 0.8 + relief * 0.9 + perspective * 0.55) + 'px)';
          work.ctx.drawImage(shadow.canvas, 0, 0);
          work.ctx.restore();
          work.ctx.globalAlpha = 0.24 + Math.min(0.22, relief * 0.035);
          work.ctx.drawImage(shadow.canvas, 0, 0);
          work.ctx.globalAlpha = 1;
        }
        work.ctx.drawImage(body.canvas, 0, 0);
        if (crease > 0.05) work.ctx.drawImage(seams.canvas, 0, 0);
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderPrismBirefringentV61(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var refractionAggregate = surfaceAggregate(glyphs, 'prismSacrament', 'prismRefraction', params.prismRefraction);
        if (!refractionAggregate.weight) return;
        var iridescence = Math.max(0, surfaceAggregate(glyphs, 'prismSacrament', 'prismIridescence', params.prismIridescence).value);
        var refraction = surfaceAggregate(glyphs, 'prismSacrament', 'prismRefraction', params.prismRefraction).value;
        var dispersion = Math.max(0, surfaceAggregate(glyphs, 'prismSacrament', 'prismDispersion', params.prismDispersion).value * pixelScale * L.s);
        var facets = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('prismFacets', Math.round(surfaceAggregate(glyphs, 'prismSacrament', 'prismFacets', params.prismFacets).value), 0, 1, 32) : Math.max(1, Math.min(32, Math.round(surfaceAggregate(glyphs, 'prismSacrament', 'prismFacets', params.prismFacets).value))));
        var caustic = Math.max(0, surfaceAggregate(glyphs, 'prismSacrament', 'prismCaustic', params.prismCaustic).value);
        var bloom = Math.max(0, surfaceAggregate(glyphs, 'prismSacrament', 'prismBloom', params.prismBloom).value * pixelScale * L.s);
        var mask = buildSurfaceMask(glyphs, 'prismSacrament', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'prismSacrament', coverBase);
        var maskCtx = mask.getContext('2d', { willReadFrequently: true });
        var source;
        try { source = maskCtx.getImageData(0, 0, width, height); }
        catch (error) { return; }
        var field = surfaceBoundaryDistance(source.data, width, height);
        if (!field.bounds) return;
        var rgbA = surfaceHexRgb(surfaceEffectColor('prismSacrament'));
        var rgbB = surfaceHexRgb(params.prismColorB);
        var minX = field.bounds[0], minY = field.bounds[1], maxX = field.bounds[2], maxY = field.bounds[3];
        var bodyArea = Math.max(1, (maxX - minX + 1) * (maxY - minY + 1));
        var facetCell = Math.max(7 * pixelScale * L.s,
          Math.min(180 * pixelScale * L.s, Math.sqrt(bodyArea / Math.max(2, facets * 2.35))));
        var phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var phaseWave = Math.sin(phase), phaseCosine = Math.cos(phase);
        var lightAngle = -0.68 + (hash(params.seed, facets, 967) * 2 - 1) * 0.34 + phaseWave * 0.16;
        var lightX = Math.cos(lightAngle), lightY = Math.sin(lightAngle);
        var tangentX = -lightY, tangentY = lightX;
        var pad = Math.ceil(Math.max(bloom, dispersion * 0.72) + 8 * pixelScale * L.s);
        var scanMinX = Math.max(0, Math.floor(minX - pad));
        var scanMinY = Math.max(0, Math.floor(minY - pad));
        var scanMaxX = Math.min(width - 1, Math.ceil(maxX + pad));
        var scanMaxY = Math.min(height - 1, Math.ceil(maxY + pad));
        function alphaAt(x, y) {
          x = Math.max(0, Math.min(width - 1, Math.round(x)));
          y = Math.max(0, Math.min(height - 1, Math.round(y)));
          return source.data[(y * width + x) * 4 + 3] / 255;
        }
        var work = surfaceScratch('prism-sacrament-birefringent-v61', width, height, false);
        var output = work.ctx.createImageData(width, height);
        for (var y = scanMinY; y <= scanMaxY; y++) for (var x = scanMinX; x <= scanMaxX; x++) {
          var index = y * width + x;
          var inside = !!field.inside[index];
          var distance = field.distance[index];
          if (!inside && (bloom <= 0.001 || caustic <= 0.001 || distance > bloom)) continue;
          var pixel = index * 4;
          var normal = surfaceFieldNormal(field, width, height, x, y);
          if (inside) {
            var facet = prismFacetCellV61(x, y, facetCell, params.seed + 971, phase);
            var axisX = Math.cos(facet.axis), axisY = Math.sin(facet.axis);
            var crossX = -axisY, crossY = axisX;
            var contourAngle = Math.atan2(normal.y, normal.x);
            var axisResponse = Math.sin((contourAngle - facet.axis + phaseWave * 0.09) * 2);
            axisResponse *= axisResponse;
            var thickness = distance + 0.5;
            var bodyShift = refraction * (1.5 + Math.min(54, thickness * (0.16 + iridescence * 0.025))) * pixelScale * L.s;
            var raySplit = dispersion * (0.16 + Math.min(0.22, iridescence * 0.035));
            var ordinary = alphaAt(x + axisX * (bodyShift + raySplit), y + axisY * (bodyShift + raySplit));
            var extraordinary = alphaAt(x + crossX * (bodyShift - raySplit), y + crossY * (bodyShift - raySplit));
            var retardance = (thickness * (0.72 + iridescence * 0.34)
              + facet.strain * facetCell * 0.1
              + (x * axisX + y * axisY) * iridescence * 0.012)
              * (0.75 + iridescence * 1.28);
            var analyzer = phaseWave * 0.62 + facet.phase * 0.06;
            var transmissionR = Math.sin(retardance / 18.4 + analyzer); transmissionR *= transmissionR;
            var transmissionG = Math.sin(retardance / 14.1 + analyzer); transmissionG *= transmissionG;
            var transmissionB = Math.sin(retardance / 10.9 + analyzer); transmissionB *= transmissionB;
            var edge = Math.exp(-distance / Math.max(1, (2.1 + iridescence * 0.65) * pixelScale * L.s));
            var seam = facet.seam * (0.12 + Math.min(0.68, caustic * 0.11 + iridescence * 0.08));
            var ordinaryWeight = ordinary * (0.2 + edge * 0.58);
            var extraordinaryWeight = extraordinary * (0.2 + edge * 0.58);
            var bodyWeight = (source.data[pixel + 3] / 255) * (0.18 + (1 - axisResponse) * 0.22);
            var spectralWeight = axisResponse * (0.1 + iridescence * 0.18) * (0.42 + edge * 0.58);
            var seamWeight = seam * (0.32 + edge * 0.38);
            var extinctionWeight = (1 - axisResponse) * bodyWeight * (0.18 + iridescence * 0.04);
            var total = ordinaryWeight + extraordinaryWeight + bodyWeight + spectralWeight + seamWeight + extinctionWeight;
            if (total <= 0.003) continue;
            var baseMix = 0.5 + Math.sin(facet.axis * 2 + facet.phase) * 0.24;
            var baseR = rgbA[0] * (1 - baseMix) + rgbB[0] * baseMix;
            var baseG = rgbA[1] * (1 - baseMix) + rgbB[1] * baseMix;
            var baseB = rgbA[2] * (1 - baseMix) + rgbB[2] * baseMix;
            output.data[pixel] = Math.round((rgbA[0] * ordinaryWeight + rgbB[0] * extraordinaryWeight + baseR * bodyWeight
              + 255 * transmissionR * spectralWeight + 255 * seamWeight + 6 * extinctionWeight) / total);
            output.data[pixel + 1] = Math.round((rgbA[1] * ordinaryWeight + rgbB[1] * extraordinaryWeight + baseG * bodyWeight
              + 255 * transmissionG * spectralWeight + 255 * seamWeight + 8 * extinctionWeight) / total);
            output.data[pixel + 2] = Math.round((rgbA[2] * ordinaryWeight + rgbB[2] * extraordinaryWeight + baseB * bodyWeight
              + 255 * transmissionB * spectralWeight + 255 * seamWeight + 14 * extinctionWeight) / total);
            output.data[pixel + 3] = Math.round(255 * refractionAggregate.strength * Math.min(1, total * 0.92));
          } else {
            var falloff = Math.pow(Math.max(0, 1 - distance / Math.max(0.001, bloom)), 1.55);
            var facing = Math.max(0, normal.x * lightX + normal.y * lightY);
            var projected = x * tangentX + y * tangentY;
            var fold = projected / Math.max(3, facetCell * 0.44)
              + distance / Math.max(3, (7 + dispersion * 0.035) * pixelScale * L.s)
              + phaseCosine * 0.48;
            var narrow = Math.pow(Math.max(0, Math.cos(fold)), 14);
            var cusp = Math.pow(Math.max(0, Math.cos(fold * 0.47 + normal.x * 3.1 - normal.y * 2.3)), 22);
            var causticWeight = falloff * Math.pow(0.08 + facing, 1.75)
              * Math.min(1.8, caustic * 0.24) * (narrow * 0.72 + cusp * 0.54);
            if (causticWeight <= 0.002) continue;
            var spread = distance * (0.055 + dispersion / Math.max(64, width + height) * 0.18);
            var spectralR = 0.42 + Math.sin(spread + phaseWave * 0.4) * 0.38;
            var spectralB = 0.42 + Math.sin(spread * 1.31 + 2.1 + phaseWave * 0.4) * 0.38;
            output.data[pixel] = Math.round(rgbA[0] * spectralR + rgbB[0] * (1 - spectralR));
            output.data[pixel + 1] = Math.round((rgbA[1] + rgbB[1]) * 0.28 + 112 * (narrow + cusp * 0.4));
            output.data[pixel + 2] = Math.round(rgbB[2] * spectralB + rgbA[2] * (1 - spectralB));
            output.data[pixel + 3] = Math.round(255 * refractionAggregate.strength * Math.min(0.9, causticWeight));
          }
        }

        // Output pixels sample the fixed geometry and original glyph raster.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext;function outputAlphaAt(x,y){return RC.rasterSample(source.data,width,height,x,y,3)/255;}RC.field(output,function(px,py,rgba){var x=px-.5,y=py-.5;if(y<(scanMinY)||!(y <= scanMaxY))return;if(x<(scanMinX)||!(x <= scanMaxX))return;
          var index = Math.floor(y) * width + Math.floor(x);
          var inside = !!(RC.sample(field.inside,width,height,x,y)>=.5);
          var distance = RC.sample(field.distance,width,height,x,y);
          if (!inside && (bloom <= 0.001 || caustic <= 0.001 || distance > bloom)) return;
          var pixel = index * 4;
          var normal = RC.normal(field,width,height,x,y);
          if (inside) {
            var facet = prismFacetCellV61(x, y, facetCell, params.seed + 971, phase);
            var axisX = Math.cos(facet.axis), axisY = Math.sin(facet.axis);
            var crossX = -axisY, crossY = axisX;
            var contourAngle = Math.atan2(normal.y, normal.x);
            var axisResponse = Math.sin((contourAngle - facet.axis + phaseWave * 0.09) * 2);
            axisResponse *= axisResponse;
            var thickness = distance + 0.5;
            var bodyShift = refraction * (1.5 + Math.min(54, thickness * (0.16 + iridescence * 0.025))) * pixelScale * L.s;
            var raySplit = dispersion * (0.16 + Math.min(0.22, iridescence * 0.035));
            var ordinary = outputAlphaAt(x + axisX * (bodyShift + raySplit), y + axisY * (bodyShift + raySplit));
            var extraordinary = outputAlphaAt(x + crossX * (bodyShift - raySplit), y + crossY * (bodyShift - raySplit));
            var retardance = (thickness * (0.72 + iridescence * 0.34)
              + facet.strain * facetCell * 0.1
              + (x * axisX + y * axisY) * iridescence * 0.012)
              * (0.75 + iridescence * 1.28);
            var analyzer = phaseWave * 0.62 + facet.phase * 0.06;
            var transmissionR = Math.sin(retardance / 18.4 + analyzer); transmissionR *= transmissionR;
            var transmissionG = Math.sin(retardance / 14.1 + analyzer); transmissionG *= transmissionG;
            var transmissionB = Math.sin(retardance / 10.9 + analyzer); transmissionB *= transmissionB;
            var edge = Math.exp(-distance / Math.max(1, (2.1 + iridescence * 0.65) * pixelScale * L.s));
            var seam = facet.seam * (0.12 + Math.min(0.68, caustic * 0.11 + iridescence * 0.08));
            var ordinaryWeight = ordinary * (0.2 + edge * 0.58);
            var extraordinaryWeight = extraordinary * (0.2 + edge * 0.58);
            var bodyWeight = (RC.rasterSample(source.data,width,height,x,y,3) / 255) * (0.18 + (1 - axisResponse) * 0.22);
            var spectralWeight = axisResponse * (0.1 + iridescence * 0.18) * (0.42 + edge * 0.58);
            var seamWeight = seam * (0.32 + edge * 0.38);
            var extinctionWeight = (1 - axisResponse) * bodyWeight * (0.18 + iridescence * 0.04);
            var total = ordinaryWeight + extraordinaryWeight + bodyWeight + spectralWeight + seamWeight + extinctionWeight;
            if (total <= 0.003) return;
            var baseMix = 0.5 + Math.sin(facet.axis * 2 + facet.phase) * 0.24;
            var baseR = rgbA[0] * (1 - baseMix) + rgbB[0] * baseMix;
            var baseG = rgbA[1] * (1 - baseMix) + rgbB[1] * baseMix;
            var baseB = rgbA[2] * (1 - baseMix) + rgbB[2] * baseMix;
            rgba[0] = Math.round((rgbA[0] * ordinaryWeight + rgbB[0] * extraordinaryWeight + baseR * bodyWeight
              + 255 * transmissionR * spectralWeight + 255 * seamWeight + 6 * extinctionWeight) / total);
            rgba[1] = Math.round((rgbA[1] * ordinaryWeight + rgbB[1] * extraordinaryWeight + baseG * bodyWeight
              + 255 * transmissionG * spectralWeight + 255 * seamWeight + 8 * extinctionWeight) / total);
            rgba[2] = Math.round((rgbA[2] * ordinaryWeight + rgbB[2] * extraordinaryWeight + baseB * bodyWeight
              + 255 * transmissionB * spectralWeight + 255 * seamWeight + 14 * extinctionWeight) / total);
            rgba[3] = Math.round(255 * refractionAggregate.strength * Math.min(1, total * 0.92));
          } else {
            var falloff = Math.pow(Math.max(0, 1 - distance / Math.max(0.001, bloom)), 1.55);
            var facing = Math.max(0, normal.x * lightX + normal.y * lightY);
            var projected = x * tangentX + y * tangentY;
            var fold = projected / Math.max(3, facetCell * 0.44)
              + distance / Math.max(3, (7 + dispersion * 0.035) * pixelScale * L.s)
              + phaseCosine * 0.48;
            var narrow = Math.pow(Math.max(0, Math.cos(fold)), 14);
            var cusp = Math.pow(Math.max(0, Math.cos(fold * 0.47 + normal.x * 3.1 - normal.y * 2.3)), 22);
            var causticWeight = falloff * Math.pow(0.08 + facing, 1.75)
              * Math.min(1.8, caustic * 0.24) * (narrow * 0.72 + cusp * 0.54);
            if (causticWeight <= 0.002) return;
            var spread = distance * (0.055 + dispersion / Math.max(64, width + height) * 0.18);
            var spectralR = 0.42 + Math.sin(spread + phaseWave * 0.4) * 0.38;
            var spectralB = 0.42 + Math.sin(spread * 1.31 + 2.1 + phaseWave * 0.4) * 0.38;
            rgba[0] = Math.round(rgbA[0] * spectralR + rgbB[0] * (1 - spectralR));
            rgba[1] = Math.round((rgbA[1] + rgbB[1]) * 0.28 + 112 * (narrow + cusp * 0.4));
            rgba[2] = Math.round(rgbB[2] * spectralB + rgbA[2] * (1 - spectralB));
            rgba[3] = Math.round(255 * refractionAggregate.strength * Math.min(0.9, causticWeight));
          }

        });}
        work.ctx.putImageData(output, 0, 0);
        if (bloom > 1 && caustic > 0.02) {
          var emitterSpacing = Math.max(5 * pixelScale * L.s, Math.min(72 * pixelScale * L.s, facetCell * 0.44));
          var emitterLimit = Math.max(2, Math.min(56, Math.round(facets * (1.4 + Math.min(2, caustic * 0.28)))));
          var emitters = prismBoundaryEmittersV61(field, width, height, emitterSpacing, emitterLimit,
            params.seed + 977, phase, lightAngle);
          var beamLayer = surfaceScratch('prism-sacrament-birefringent-beams-v61', width, height, false);
          var beamCtx = beamLayer.ctx;
          var splitAngle = Math.min(0.24, 0.012 + dispersion / Math.max(96, bloom * 7 + 1) * 0.16 + iridescence * 0.008);
          for (var emitterIndex = 0; emitterIndex < emitters.length; emitterIndex++) {
            var emitter = emitters[emitterIndex];
            var outwardAngle = Math.atan2(emitter.ny, emitter.nx);
            var rayAngle = outwardAngle * 0.82 + lightAngle * 0.18;
            var rayLength = bloom * (0.36 + hash(emitterIndex, facets, params.seed + 983) * 0.6);
            var rayWidth = Math.max(0.7, (0.85 + caustic * 1.16 + iridescence * 0.42) * pixelScale * L.s);
            var bend = (hash(emitterIndex, params.seed, 991) * 2 - 1) * rayLength * (0.045 + iridescence * 0.008)
              + phaseWave * rayLength * 0.025;
            var rayAlpha = refractionAggregate.strength * (0.1 + emitter.facing * 0.2)
              * Math.min(1, 0.32 + caustic * 0.16);
            prismBeamPathV61(beamCtx, emitter, rayAngle - splitAngle, rayLength, rayWidth, bend, rgbA, rayAlpha);
            prismBeamPathV61(beamCtx, emitter, rayAngle + splitAngle, rayLength * (0.92 + iridescence * 0.025),
              rayWidth * 0.82, -bend * 0.72, rgbB, rayAlpha * 0.86);
          }
          work.ctx.drawImage(beamLayer.canvas, 0, 0);
        }
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderPrismSacramentV23(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var optics = surfaceChoice(glyphs, 'prismSacrament', 'prismOptics', params.prismOptics, BATCH_PARAM_OPTIONS.prismOptics);
        var iridescenceAggregate = surfaceAggregate(glyphs, 'prismSacrament', 'prismIridescence', params.prismIridescence);
        var iridescence = Math.max(0, iridescenceAggregate.value);
        if (optics === 'legacy' && iridescence <= 0.001) {
          renderPrismSacramentLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        var refractionAggregate = surfaceAggregate(glyphs, 'prismSacrament', 'prismRefraction', params.prismRefraction);
        if (!refractionAggregate.weight) return;
        var refraction = refractionAggregate.value;
        var dispersion = Math.max(0, surfaceAggregate(glyphs, 'prismSacrament', 'prismDispersion', params.prismDispersion).value * pixelScale * L.s);
        var facets = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('prismFacets', Math.round(surfaceAggregate(glyphs, 'prismSacrament', 'prismFacets', params.prismFacets).value), 0, 1, 32) : Math.max(1, Math.min(32, Math.round(surfaceAggregate(glyphs, 'prismSacrament', 'prismFacets', params.prismFacets).value))));
        var caustic = surfaceAggregate(glyphs, 'prismSacrament', 'prismCaustic', params.prismCaustic).value;
        var bloom = Math.max(0, surfaceAggregate(glyphs, 'prismSacrament', 'prismBloom', params.prismBloom).value * pixelScale * L.s);
        var mask = buildSurfaceMask(glyphs, 'prismSacrament', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'prismSacrament', coverBase);
        var maskCtx = mask.getContext('2d', { willReadFrequently: true });
        var source;
        try { source = maskCtx.getImageData(0, 0, width, height); }
        catch (error) { return; }
        var field = surfaceBoundaryDistance(source.data, width, height);
        if (!field.bounds) return;
        var work = surfaceScratch('prism-sacrament-evolved', width, height, false);
        var output = work.ctx.createImageData(width, height);
        var rgbA = surfaceHexRgb(surfaceEffectColor('prismSacrament'));
        var rgbB = surfaceHexRgb(params.prismColorB);
        var minX = field.bounds[0], minY = field.bounds[1], maxX = field.bounds[2], maxY = field.bounds[3];
        var centerX = (minX + maxX) * 0.5, centerY = (minY + maxY) * 0.5;
        var phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var facetStep = Math.PI * 2 / facets;
        var pad = Math.ceil(Math.max(bloom, dispersion * 0.86) + (8 + iridescence * 3) * pixelScale * L.s);
        var scanMinX = Math.max(0, Math.floor(minX - pad));
        var scanMinY = Math.max(0, Math.floor(minY - pad));
        var scanMaxX = Math.min(width - 1, Math.ceil(maxX + pad));
        var scanMaxY = Math.min(height - 1, Math.ceil(maxY + pad));
        function signedDistanceAt(x, y) {
          x = Math.max(0, Math.min(width - 1, Math.round(x)));
          y = Math.max(0, Math.min(height - 1, Math.round(y)));
          var index = y * width + x;
          return field.inside[index] ? field.distance[index] : -field.distance[index];
        }
        function alphaAt(x, y) {
          x = Math.max(0, Math.min(width - 1, Math.round(x)));
          y = Math.max(0, Math.min(height - 1, Math.round(y)));
          return source.data[(y * width + x) * 4 + 3] / 255;
        }
        for (var y = scanMinY; y <= scanMaxY; y++) for (var x = scanMinX; x <= scanMaxX; x++) {
          var index = y * width + x;
          var inside = !!field.inside[index];
          var distance = field.distance[index];
          if (!inside && (bloom <= 0.001 || distance > bloom)) continue;
          var gx = signedDistanceAt(x + 1, y) - signedDistanceAt(x - 1, y);
          var gy = signedDistanceAt(x, y + 1) - signedDistanceAt(x, y - 1);
          var gradientLength = Math.sqrt(gx * gx + gy * gy);
          var rawAngle = gradientLength > 0.001 ? Math.atan2(gy, gx) : Math.atan2(y - centerY, x - centerX);
          var polar = Math.atan2(y - centerY, x - centerX);
          var radial = Math.sqrt((x - centerX) * (x - centerX) + (y - centerY) * (y - centerY));
          var facetAngle;
          if (optics === 'lenticular') facetAngle = Math.round((rawAngle + Math.sin((x + y) * 0.025 + phase) * 0.4) / facetStep) * facetStep;
          else if (optics === 'fresnel') facetAngle = Math.round((polar + phase * 0.035) / facetStep) * facetStep;
          else facetAngle = Math.round((rawAngle + polar * iridescence * 0.035 + phase * 0.025) / facetStep) * facetStep;
          var normalX = Math.cos(facetAngle), normalY = Math.sin(facetAngle);
          var baseShift = refraction * (5 + Math.min(72, distance * (0.14 + iridescence * 0.025))) * pixelScale * L.s;
          var splitScale = optics === 'spectral' ? 0.82 : (optics === 'fresnel' ? 0.42 : 0.58);
          var offsetA = baseShift + dispersion * splitScale;
          var offsetB = baseShift - dispersion * splitScale;
          var sampleA = alphaAt(x + normalX * offsetA, y + normalY * offsetA);
          var sampleB = alphaAt(x + normalX * offsetB, y + normalY * offsetB);
          var edgeWidth = Math.max(1, (3 + iridescence * 1.2) * pixelScale * L.s + dispersion * 0.032);
          var edge = Math.exp(-distance / edgeWidth);
          var sourceAlpha = source.data[index * 4 + 3] / 255;
          var facetWave;
          if (optics === 'fresnel') facetWave = Math.pow(Math.max(0,
            Math.cos(distance / Math.max(2, edgeWidth * 1.6) * Math.PI * 2 - phase)), 8);
          else if (optics === 'lenticular') facetWave = Math.pow(Math.max(0,
            Math.cos((x * normalX + y * normalY) / Math.max(2, 5 * pixelScale * L.s + dispersion * 0.03) * Math.PI + phase)), 7);
          else facetWave = Math.pow(Math.max(0, Math.cos((rawAngle - facetAngle) * facets * 0.5 + phase * 0.22)), 9);
          var outsideFalloff = !inside && bloom > 0 ? Math.pow(Math.max(0, 1 - distance / bloom), 1.38) : 0;
          var causticBand = outsideFalloff * Math.pow(Math.max(0,
            Math.cos(distance / Math.max(2, (6 + iridescence * 2) * pixelScale * L.s + dispersion * 0.045)
              * Math.PI * 2 + facetAngle * facets * 0.38 - phase)), 7) * Math.min(1.7, caustic * 0.34 + iridescence * 0.08);
          var body = inside ? sourceAlpha * (0.24 + Math.min(0.34, Math.abs(refraction) * 0.08) + iridescence * 0.035) : 0;
          if (optics === 'fresnel') body *= 0.54 + edge * 0.86;
          var weightA = sampleA * (0.3 + edge * 0.7) + causticBand * (optics === 'spectral' ? 0.78 : 0.5);
          var weightB = sampleB * (0.3 + edge * 0.7) + causticBand * (optics === 'spectral' ? 0.58 : 0.42);
          var white = (inside ? facetWave * (0.12 + iridescence * 0.15) + edge * (0.18 + iridescence * 0.045) : 0)
            + causticBand * (0.2 + iridescence * 0.06);
          var dark = inside ? (1 - facetWave) * body * (optics === 'crystal' ? 0.22 : 0.1) : 0;
          var total = weightA + weightB + body + white + dark;
          if (total <= 0.005) continue;
          var midR = (rgbA[0] + rgbB[0]) * 0.5, midG = (rgbA[1] + rgbB[1]) * 0.5, midB = (rgbA[2] + rgbB[2]) * 0.5;
          output.data[index * 4] = Math.round((rgbA[0] * weightA + rgbB[0] * weightB + midR * body + 255 * white + 8 * dark) / total);
          output.data[index * 4 + 1] = Math.round((rgbA[1] * weightA + rgbB[1] * weightB + midG * body + 10 * dark + 255 * white) / total);
          output.data[index * 4 + 2] = Math.round((rgbA[2] * weightA + rgbB[2] * weightB + midB * body + 18 * dark + 255 * white) / total);
          var alphaScale = optics === 'spectral' ? 0.86 : (optics === 'fresnel' ? 0.72 : 0.92);
          output.data[index * 4 + 3] = Math.round(255 * refractionAggregate.strength * Math.min(1, total * alphaScale));
        }

        // Output pixels sample the fixed geometry and original glyph raster.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext;function outputAlphaAt(x,y){return RC.rasterSample(source.data,width,height,x,y,3)/255;}RC.field(output,function(px,py,rgba){var x=px-.5,y=py-.5;if(y<(scanMinY)||!(y <= scanMaxY))return;if(x<(scanMinX)||!(x <= scanMaxX))return;
          var index = Math.floor(y) * width + Math.floor(x);
          var inside = !!(RC.sample(field.inside,width,height,x,y)>=.5);
          var distance = RC.sample(field.distance,width,height,x,y);
          if (!inside && (bloom <= 0.001 || distance > bloom)) return;
          var gx = signedDistanceAt(x + 1, y) - signedDistanceAt(x - 1, y);
          var gy = signedDistanceAt(x, y + 1) - signedDistanceAt(x, y - 1);
          var gradientLength = Math.sqrt(gx * gx + gy * gy);
          var rawAngle = gradientLength > 0.001 ? Math.atan2(gy, gx) : Math.atan2(y - centerY, x - centerX);
          var polar = Math.atan2(y - centerY, x - centerX);
          var radial = Math.sqrt((x - centerX) * (x - centerX) + (y - centerY) * (y - centerY));
          var facetAngle;
          if (optics === 'lenticular') facetAngle = Math.round((rawAngle + Math.sin((x + y) * 0.025 + phase) * 0.4) / facetStep) * facetStep;
          else if (optics === 'fresnel') facetAngle = Math.round((polar + phase * 0.035) / facetStep) * facetStep;
          else facetAngle = Math.round((rawAngle + polar * iridescence * 0.035 + phase * 0.025) / facetStep) * facetStep;
          var normalX = Math.cos(facetAngle), normalY = Math.sin(facetAngle);
          var baseShift = refraction * (5 + Math.min(72, distance * (0.14 + iridescence * 0.025))) * pixelScale * L.s;
          var splitScale = optics === 'spectral' ? 0.82 : (optics === 'fresnel' ? 0.42 : 0.58);
          var offsetA = baseShift + dispersion * splitScale;
          var offsetB = baseShift - dispersion * splitScale;
          var sampleA = outputAlphaAt(x + normalX * offsetA, y + normalY * offsetA);
          var sampleB = outputAlphaAt(x + normalX * offsetB, y + normalY * offsetB);
          var edgeWidth = Math.max(1, (3 + iridescence * 1.2) * pixelScale * L.s + dispersion * 0.032);
          var edge = Math.exp(-distance / edgeWidth);
          var sourceAlpha = RC.rasterSample(source.data,width,height,x,y,3) / 255;
          var facetWave;
          if (optics === 'fresnel') facetWave = Math.pow(Math.max(0,
            Math.cos(distance / Math.max(2, edgeWidth * 1.6) * Math.PI * 2 - phase)), 8);
          else if (optics === 'lenticular') facetWave = Math.pow(Math.max(0,
            Math.cos((x * normalX + y * normalY) / Math.max(2, 5 * pixelScale * L.s + dispersion * 0.03) * Math.PI + phase)), 7);
          else facetWave = Math.pow(Math.max(0, Math.cos((rawAngle - facetAngle) * facets * 0.5 + phase * 0.22)), 9);
          var outsideFalloff = !inside && bloom > 0 ? Math.pow(Math.max(0, 1 - distance / bloom), 1.38) : 0;
          var causticBand = outsideFalloff * Math.pow(Math.max(0,
            Math.cos(distance / Math.max(2, (6 + iridescence * 2) * pixelScale * L.s + dispersion * 0.045)
              * Math.PI * 2 + facetAngle * facets * 0.38 - phase)), 7) * Math.min(1.7, caustic * 0.34 + iridescence * 0.08);
          var body = inside ? sourceAlpha * (0.24 + Math.min(0.34, Math.abs(refraction) * 0.08) + iridescence * 0.035) : 0;
          if (optics === 'fresnel') body *= 0.54 + edge * 0.86;
          var weightA = sampleA * (0.3 + edge * 0.7) + causticBand * (optics === 'spectral' ? 0.78 : 0.5);
          var weightB = sampleB * (0.3 + edge * 0.7) + causticBand * (optics === 'spectral' ? 0.58 : 0.42);
          var white = (inside ? facetWave * (0.12 + iridescence * 0.15) + edge * (0.18 + iridescence * 0.045) : 0)
            + causticBand * (0.2 + iridescence * 0.06);
          var dark = inside ? (1 - facetWave) * body * (optics === 'crystal' ? 0.22 : 0.1) : 0;
          var total = weightA + weightB + body + white + dark;
          if (total <= 0.005) return;
          var midR = (rgbA[0] + rgbB[0]) * 0.5, midG = (rgbA[1] + rgbB[1]) * 0.5, midB = (rgbA[2] + rgbB[2]) * 0.5;
          rgba[0] = Math.round((rgbA[0] * weightA + rgbB[0] * weightB + midR * body + 255 * white + 8 * dark) / total);
          rgba[1] = Math.round((rgbA[1] * weightA + rgbB[1] * weightB + midG * body + 10 * dark + 255 * white) / total);
          rgba[2] = Math.round((rgbA[2] * weightA + rgbB[2] * weightB + midB * body + 18 * dark + 255 * white) / total);
          var alphaScale = optics === 'spectral' ? 0.86 : (optics === 'fresnel' ? 0.72 : 0.92);
          rgba[3] = Math.round(255 * refractionAggregate.strength * Math.min(1, total * alphaScale));

        });}
        work.ctx.putImageData(output, 0, 0);
        var facetLines = surfaceScratch('prism-sacrament-facets', width, height, false);
        var facetCtx = facetLines.ctx;
        var span = Math.sqrt(width * width + height * height);
        facetCtx.lineCap = 'butt';
        facetCtx.lineJoin = 'miter';
        facetCtx.strokeStyle = surfaceToneCss(rgbA, 0.82);
        facetCtx.globalAlpha = refractionAggregate.strength * Math.min(0.82, 0.18 + iridescence * 0.14);
        facetCtx.lineWidth = Math.max(0.55, (0.65 + iridescence * 0.28) * pixelScale * L.s);
        for (var facet = 0; facet < facets; facet++) {
          var rayAngle = facet / facets * Math.PI * 2 + phase * 0.025;
          facetCtx.beginPath();
          facetCtx.moveTo(centerX, centerY);
          facetCtx.lineTo(centerX + Math.cos(rayAngle) * span, centerY + Math.sin(rayAngle) * span);
          facetCtx.stroke();
        }
        if (optics === 'fresnel' || optics === 'lenticular') {
          facetCtx.strokeStyle = surfaceToneCss(rgbB, 0.72);
          facetCtx.globalAlpha *= 0.76;
          var ringStep = Math.max(3, (6 + dispersion * 0.06) * pixelScale * L.s);
          var rings = Math.min(36, Math.ceil(Math.max(maxX - minX, maxY - minY) / Math.max(1, ringStep)));
          for (var ring = 1; ring <= rings; ring++) {
            facetCtx.beginPath();
            facetCtx.ellipse(centerX, centerY, ring * ringStep, ring * ringStep * (optics === 'lenticular' ? 0.36 : 0.78), 0, 0, Math.PI * 2);
            facetCtx.stroke();
          }
        }
        facetCtx.globalAlpha = 1;
        facetCtx.globalCompositeOperation = 'destination-in';
        facetCtx.drawImage(mask, 0, 0);
        facetCtx.globalCompositeOperation = 'source-over';
        work.ctx.drawImage(facetLines.canvas, 0, 0);
        if (bloom > 1 && (caustic > 0.02 || iridescence > 0.02)) {
          var rays = surfaceScratch('prism-sacrament-rays', width, height, false);
          var raysCtx = rays.ctx;
          var nodes = surfaceNodesForGlyphs(glyphs, 'prismSacrament', 8, pixelScale, L, phase, 0, 0);
          var raysPerNode = Math.max(1, Math.min(5, Math.round(1 + iridescence * 0.85 + caustic * 0.25)));
          raysCtx.lineCap = 'round';
          for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
            for (var branch = 0; branch < raysPerNode; branch++) {
              var salt = nodeIndex * 17 + branch * 29;
              var direction = (hash(salt, params.seed % 97, 811) * 2 - 1) * Math.PI
                + phase * (0.04 + branch * 0.012);
              if (optics === 'lenticular') direction = phase * 0.08 + (branch - (raysPerNode - 1) * 0.5) * 0.12;
              var length = bloom * (0.34 + hash(salt, branch, params.seed + 823) * 0.62);
              var endX = nodes[nodeIndex].x + Math.cos(direction) * length;
              var endY = nodes[nodeIndex].y + Math.sin(direction) * length;
              var gradient = raysCtx.createLinearGradient(nodes[nodeIndex].x, nodes[nodeIndex].y, endX, endY);
              gradient.addColorStop(0, branch % 2 ? surfaceToneCss(rgbA, 0.72) : surfaceToneCss(rgbB, 0.72));
              gradient.addColorStop(0.36, branch % 2 ? surfaceToneCss(rgbB, 0.25) : surfaceToneCss(rgbA, 0.25));
              gradient.addColorStop(1, 'rgba(255,255,255,0)');
              raysCtx.strokeStyle = gradient;
              raysCtx.globalAlpha = refractionAggregate.strength * Math.min(0.82, 0.12 + caustic * 0.09 + iridescence * 0.08);
              raysCtx.lineWidth = Math.max(0.5, (0.6 + iridescence * 0.35 + (branch % 2) * 0.8) * pixelScale * L.s);
              raysCtx.beginPath();
              raysCtx.moveTo(nodes[nodeIndex].x, nodes[nodeIndex].y);
              raysCtx.quadraticCurveTo((nodes[nodeIndex].x + endX) * 0.5 + Math.sin(direction) * length * 0.08,
                (nodes[nodeIndex].y + endY) * 0.5 - Math.cos(direction) * length * 0.08, endX, endY);
              raysCtx.stroke();
            }
          }
          raysCtx.globalAlpha = 1;
          work.ctx.drawImage(rays.canvas, 0, 0);
        }
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderPrismSacrament(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var optics = surfaceChoice(glyphs, 'prismSacrament', 'prismOptics', params.prismOptics, BATCH_PARAM_OPTIONS.prismOptics);
        if (optics === 'birefringent') {
          renderPrismBirefringentV61(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        renderPrismSacramentV23(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
      }

      function renderTexturaDuctusV60(targetCtx, mask, prepared, width, height, settings, strength, color) {
        if (!prepared.paths.length && !prepared.isolates.length) return null;
        var geometry = texturaDuctusGeometryV60(prepared, settings);
        var work = surfaceScratch('textura-matrix-v60-ductus', width, height, false);
        var ctx = work.ctx;
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        for (var polygonIndex = 0; polygonIndex < geometry.polygons.length; polygonIndex++) {
          var polygon = geometry.polygons[polygonIndex];
          ctx.globalAlpha = strength * polygon.alpha;
          ctx.beginPath();
          for (var cornerIndex = 0; cornerIndex < polygon.points.length; cornerIndex++) {
            if (cornerIndex) ctx.lineTo(polygon.points[cornerIndex].x, polygon.points[cornerIndex].y);
            else ctx.moveTo(polygon.points[cornerIndex].x, polygon.points[cornerIndex].y);
          }
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalAlpha = strength;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (var lineIndex = 0; lineIndex < geometry.centerlines.length; lineIndex++) {
          var line = geometry.centerlines[lineIndex];
          ctx.lineWidth = line.width;
          ctx.beginPath();
          ctx.moveTo(line.a.x, line.a.y);
          ctx.lineTo(line.b.x, line.b.y);
          ctx.stroke();
        }
        function drawNodeDiamond(node) {
          ctx.beginPath();
          for (var corner = 0; corner < 4; corner++) {
            var angle = Math.PI / 4 + corner * Math.PI / 2;
            var x = node.x + Math.cos(angle) * node.radius;
            var y = node.y + Math.sin(angle) * node.radius;
            if (corner) ctx.lineTo(x, y); else ctx.moveTo(x, y);
          }
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalAlpha = strength * 0.92;
        for (var nodeIndex = 0; nodeIndex < geometry.junctions.length; nodeIndex++) drawNodeDiamond(geometry.junctions[nodeIndex]);
        for (nodeIndex = 0; nodeIndex < geometry.isolates.length; nodeIndex++) drawNodeDiamond(geometry.isolates[nodeIndex]);
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.64;
        for (var cutIndex = 0; cutIndex < geometry.cuts.length; cutIndex++) {
          var cut = geometry.cuts[cutIndex];
          ctx.lineWidth = cut.width;
          ctx.beginPath();
          ctx.moveTo(cut.a.x, cut.a.y);
          ctx.lineTo(cut.b.x, cut.b.y);
          ctx.stroke();
        }
        var base = surfaceScratch('textura-matrix-v60-ductus-base', width, height, false);
        base.ctx.drawImage(mask, 0, 0);
        base.ctx.globalCompositeOperation = 'source-in';
        base.ctx.fillStyle = color;
        base.ctx.fillRect(0, 0, width, height);
        base.ctx.globalCompositeOperation = 'source-over';
        ctx.globalCompositeOperation = 'destination-over';
        ctx.globalAlpha = strength * Math.min(0.34, 0.075 + settings.rhythm * 0.018);
        ctx.drawImage(base.canvas, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
        return { prepared: prepared, geometry: geometry };
      }

      function renderTexturaMatrix(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var grammar = surfaceChoice(glyphs, 'texturaMatrix', 'texturaGrammar', params.texturaGrammar, BATCH_PARAM_OPTIONS.texturaGrammar);
        var rhythmAggregate = surfaceAggregate(glyphs, 'texturaMatrix', 'texturaRhythm', params.texturaRhythm);
        var rhythm = Math.max(0, rhythmAggregate.value);
        if (grammar === 'stems' && rhythm <= 0.001) {
          renderTexturaMatrixLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        var pitchAggregate = surfaceAggregate(glyphs, 'texturaMatrix', 'texturaPitch', params.texturaPitch);
        if (!pitchAggregate.weight) return;
        var pitch = Math.max(2, pitchAggregate.value * pixelScale * L.s);
        var nibAngle = surfaceAggregate(glyphs, 'texturaMatrix', 'texturaAngle', params.texturaAngle).value * Math.PI / 180;
        var weight = surfaceAggregate(glyphs, 'texturaMatrix', 'texturaWeight', params.texturaWeight).value;
        var split = surfaceAggregate(glyphs, 'texturaMatrix', 'texturaSplit', params.texturaSplit).value;
        var spur = Math.max(0, surfaceAggregate(glyphs, 'texturaMatrix', 'texturaSpur', params.texturaSpur).value * pixelScale * L.s);
        var mask = buildSurfaceMask(glyphs, 'texturaMatrix', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'texturaMatrix', coverBase);
        if (grammar === 'ductus') {
          var ductusSignature = texturaDuctusSignatureV60(glyphs, width, height, pixelScale, L, fm);
          var prepared = texturaDuctusPreparedCacheV60.signature === ductusSignature
            ? texturaDuctusPreparedCacheV60.value : null;
          var ductusBounds = prepared && prepared.bounds;
          if (!prepared) {
            var ductusSource;
            try { ductusSource = mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height); }
            catch (error) { return; }
            ductusBounds = texturaDuctusBoundsV60(ductusSource.data, width, height);
            if (!ductusBounds) return;
            prepared = texturaDuctusPrepareV60(ductusSource.data, width, height, ductusBounds, ductusSignature);
          }
          if (!ductusBounds) return;
          var ductusSpanW = Math.max(1, ductusBounds[2] - ductusBounds[0] + 1);
          if (ductusSpanW / pitch > 180) pitch = ductusSpanW / 180;
          renderTexturaDuctusV60(targetCtx, mask, prepared, width, height, {
            pitch: pitch, angle: nibAngle * 180 / Math.PI, weight: weight, split: split, spur: spur, rhythm: rhythm,
            phase: compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) : 0
          }, pitchAggregate.strength, surfaceEffectColor('texturaMatrix'));
          return;
        }
        var maskCtx = mask.getContext('2d', { willReadFrequently: true });
        var source;
        try { source = maskCtx.getImageData(0, 0, width, height); }
        catch (error) { return; }
        var field = surfaceBoundaryDistance(source.data, width, height);
        if (!field.bounds) return;
        var spanW = Math.max(1, field.bounds[2] - field.bounds[0] + 1);
        if (spanW / pitch > 180) pitch = spanW / 180;
        var stemWidth = Math.max(0.5, Math.min(pitch * 2.15, pitch * weight * (grammar === 'bastarda' ? 0.46 : 0.62)));
        var work = surfaceScratch('textura-matrix-evolved', width, height, false);
        var ctx = work.ctx;
        var color = surfaceEffectColor('texturaMatrix');
        var rgb = surfaceHexRgb(color);
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        var phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) : 0;
        var phaseOffset = phase * pitch;
        var startX = field.bounds[0] + pitch * 0.5 + phaseOffset;
        while (startX > field.bounds[0] + pitch) startX -= pitch;
        var previous = [];
        var columnIndex = 0;
        for (var x = startX; x <= field.bounds[2] + pitch * 0.5; x += pitch, columnIndex++) {
          var sampleX = Math.max(0, Math.min(width - 1, Math.round(x)));
          var runs = [];
          var runStart = -1, alphaTotal = 0, alphaCount = 0;
          for (var y = field.bounds[1]; y <= field.bounds[3] + 1; y++) {
            var active = false, sampleAlpha = 0;
            if (y <= field.bounds[3]) {
              for (var offset = -1; offset <= 1; offset++) {
                var sx = Math.max(0, Math.min(width - 1, Math.round(sampleX + offset * Math.max(1, pitch * 0.2))));
                sampleAlpha = Math.max(sampleAlpha, source.data[(y * width + sx) * 4 + 3] / 255);
              }
              active = sampleAlpha > 0.07;
            }
            if (active) {
              if (runStart < 0) runStart = y;
              alphaTotal += sampleAlpha;
              alphaCount++;
            } else if (runStart >= 0) {
              var runEnd = y - 1;
              if (runEnd - runStart >= 1) runs.push({ x: sampleX, start: runStart, end: runEnd, alpha: alphaTotal / Math.max(1, alphaCount) });
              runStart = -1; alphaTotal = 0; alphaCount = 0;
            }
          }
          for (var runIndex = 0; runIndex < runs.length; runIndex++) {
            var run = runs[runIndex];
            var cadence = 1 + Math.sin((columnIndex + runIndex * 0.43) * (1.2 + rhythm * 0.08) + phase * Math.PI * 2) * rhythm * 0.035;
            traceTexturaGrammarStem(ctx, grammar, run.x, run.start, run.end, stemWidth * cadence,
              nibAngle, split, spur, pitchAggregate.strength * (0.66 + run.alpha * 0.34), rhythm, columnIndex * 13 + runIndex);
            var best = null, bestOverlap = 0;
            for (var previousIndex = 0; previousIndex < previous.length; previousIndex++) {
              var candidate = previous[previousIndex];
              var overlapStart = Math.max(run.start, candidate.start);
              var overlapEnd = Math.min(run.end, candidate.end);
              var overlap = overlapEnd - overlapStart;
              if (overlap > bestOverlap) {
                bestOverlap = overlap;
                best = { run: candidate, y: (overlapStart + overlapEnd) * 0.5 };
              }
            }
            if (best && bestOverlap > stemWidth * 0.28) {
              var joinTilt = Math.tan(nibAngle) * Math.min(pitch * 0.5, stemWidth * 0.75);
              ctx.save();
              ctx.globalAlpha = pitchAggregate.strength * Math.min(0.94, 0.34 + run.alpha * 0.42 + rhythm * 0.04);
              ctx.lineWidth = Math.max(0.5, stemWidth * (grammar === 'bastarda' ? 0.13 : 0.2 + weight * 0.055));
              ctx.lineCap = grammar === 'bastarda' ? 'round' : 'square';
              ctx.lineJoin = 'miter';
              ctx.beginPath();
              if (grammar === 'fraktur') {
                var fractureY = best.y + (hash(columnIndex, runIndex, params.seed + 877) * 2 - 1) * stemWidth;
                ctx.moveTo(best.run.x, best.y - joinTilt);
                ctx.lineTo((best.run.x + run.x) * 0.5, fractureY - stemWidth * 0.32);
                ctx.lineTo(run.x, best.y + joinTilt);
              } else if (grammar === 'bastarda') {
                ctx.moveTo(best.run.x, best.y - joinTilt * 0.4);
                ctx.bezierCurveTo(best.run.x + pitch * 0.45, best.y - stemWidth,
                  run.x - pitch * 0.45, best.y + stemWidth, run.x, best.y + joinTilt * 0.4);
              } else if (grammar === 'lattice') {
                ctx.moveTo(best.run.x, best.y - joinTilt);
                ctx.lineTo(run.x, best.y + joinTilt);
                ctx.moveTo(best.run.x, best.y + joinTilt);
                ctx.lineTo(run.x, best.y - joinTilt);
              } else {
                ctx.moveTo(best.run.x, best.y - joinTilt);
                ctx.lineTo(run.x, best.y + joinTilt);
              }
              ctx.stroke();
              ctx.restore();
            }
          }
          previous = runs;
        }
        var texturaBase = surfaceScratch('textura-matrix-evolved-base', width, height, false);
        texturaBase.ctx.drawImage(mask, 0, 0);
        texturaBase.ctx.globalCompositeOperation = 'source-in';
        texturaBase.ctx.fillStyle = surfaceToneCss(rgb, grammar === 'fraktur' ? -0.2 : 0.16);
        texturaBase.ctx.fillRect(0, 0, width, height);
        texturaBase.ctx.globalCompositeOperation = 'source-over';
        ctx.save();
        ctx.globalCompositeOperation = 'destination-over';
        ctx.globalAlpha = pitchAggregate.strength * Math.min(0.34, 0.08 + rhythm * 0.055);
        ctx.drawImage(texturaBase.canvas, 0, 0);
        ctx.restore();
        if (grammar === 'lattice' && rhythm > 0.1) {
          var lattice = surfaceScratch('textura-matrix-lattice', width, height, false);
          var latticeCtx = lattice.ctx;
          latticeCtx.strokeStyle = surfaceToneCss(rgb, 0.62);
          latticeCtx.globalAlpha = pitchAggregate.strength * Math.min(0.72, 0.14 + rhythm * 0.12);
          latticeCtx.lineWidth = Math.max(0.5, stemWidth * 0.08);
          for (var diagonal = -height; diagonal < width + height; diagonal += pitch * 2) {
            latticeCtx.beginPath();
            latticeCtx.moveTo(diagonal, field.bounds[1] - spur);
            latticeCtx.lineTo(diagonal - (field.bounds[3] - field.bounds[1]) * 0.45, field.bounds[3] + spur);
            latticeCtx.stroke();
          }
          latticeCtx.globalAlpha = 1;
          latticeCtx.globalCompositeOperation = 'destination-in';
          var expanded = surfaceScratch('textura-matrix-lattice-mask', width, height, false);
          expanded.ctx.filter = 'blur(' + Math.max(0.5, Math.min(12, spur * 0.08)) + 'px)';
          expanded.ctx.drawImage(mask, 0, 0);
          expanded.ctx.filter = 'none';
          latticeCtx.drawImage(expanded.canvas, 0, 0);
          latticeCtx.globalCompositeOperation = 'source-over';
          ctx.drawImage(lattice.canvas, 0, 0);
        }
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderVoidPortalLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var depthAggregate = surfaceAggregate(glyphs, 'voidPortal', 'voidDepth', params.voidDepth);
        if (!depthAggregate.weight) return;
        var angle = surfaceAggregate(glyphs, 'voidPortal', 'voidAngle', params.voidAngle).value * Math.PI / 180;
        var aperture = surfaceAggregate(glyphs, 'voidPortal', 'voidAperture', params.voidAperture).value;
        var taper = surfaceAggregate(glyphs, 'voidPortal', 'voidTaper', params.voidTaper).value;
        var ribs = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('voidRibs', Math.round(surfaceAggregate(glyphs, 'voidPortal', 'voidRibs', params.voidRibs).value), 0, 1, 32) : Math.max(1, Math.min(32, Math.round(surfaceAggregate(glyphs, 'voidPortal', 'voidRibs', params.voidRibs).value))));
        var mask = buildSurfaceMask(glyphs, 'voidPortal', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'voidPortal', coverBase);
        var maskCtx = mask.getContext('2d', { willReadFrequently: true });
        var source;
        try { source = maskCtx.getImageData(0, 0, width, height); }
        catch (error) { return; }
        var field = surfaceBoundaryDistance(source.data, width, height);
        if (!field.bounds) return;
        var apertureMask = surfaceVoidApertureMask(mask, aperture);
        if (!apertureMask) return;
        var centerX = (field.bounds[0] + field.bounds[2]) * 0.5;
        var centerY = (field.bounds[1] + field.bounds[3]) * 0.5;
        var depth = depthAggregate.value * pixelScale * L.s;
        var phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var direction = angle + phase;
        var work = surfaceScratch('void-portal', width, height, false);
        var ctx = work.ctx;
        ctx.imageSmoothingEnabled = true;
        for (var rib = ribs; rib >= 1; rib--) {
          var t = rib / ribs;
          var ribScale = Math.max(0.16, Math.min(5, Math.exp(taper * t * 0.42)));
          var offsetX = Math.cos(direction) * depth * t;
          var offsetY = Math.sin(direction) * depth * t;
          ctx.save();
          ctx.globalAlpha = depthAggregate.strength * (0.22 + (1 - t) * 0.58);
          ctx.translate(centerX + offsetX, centerY + offsetY);
          ctx.scale(ribScale, ribScale);
          ctx.translate(-centerX, -centerY);
          ctx.drawImage(apertureMask, 0, 0, apertureMask.width, apertureMask.height, 0, 0, width, height);
          ctx.restore();
        }
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = 1;
        ctx.drawImage(mask, 0, 0);
        ctx.drawImage(apertureMask, 0, 0, apertureMask.width, apertureMask.height, 0, 0, width, height);
        ctx.globalCompositeOperation = 'source-over';
        paintSurfaceMask(targetCtx, work.canvas, surfaceEffectColor('voidPortal'), 1, 'void-portal-color');
      }

      function renderVoidPortalComponentV33(layers, component, architecture, depth, angle, taper,
        aperture, ribs, strength, phase, glyphIndex, componentIndex, pixelScale) {
        var outlineRadius = Math.max(0.6, Math.min(2.8, component.scanScale * pixelScale * (1.05 + aperture * 0.9)));
        var outline = ribbonOutlineMaskV31(component.mask, outlineRadius, 'void-portal-v33-component-outline');
        var near = voidPortalSectionStateV33(architecture, 0, depth, angle, taper, aperture,
          phase, glyphIndex, componentIndex);
        var far = voidPortalSectionStateV33(architecture, 1, depth, angle, taper, aperture,
          phase, glyphIndex, componentIndex);
        drawVoidPortalMaskV33(layers.paper.ctx, component.mask, component, near, strength);
        drawVoidPortalMaskV33(layers.shadow.ctx, component.mask, component, far,
          strength * (architecture === 'horizon' ? 0.96 : 0.72));

        var anchors = component.anchors;
        var planeCtx = layers.planes.ctx;
        for (var anchorIndex = 0; anchorIndex < anchors.length; anchorIndex++) {
          var nextAnchor = anchors[(anchorIndex + 1) % anchors.length];
          if (!nextAnchor || (anchorIndex + componentIndex) % 2) continue;
          var nearA = voidPortalTransformPointV33(anchors[anchorIndex], component.centerX, component.centerY, near);
          var nearB = voidPortalTransformPointV33(nextAnchor, component.centerX, component.centerY, near);
          var farA = voidPortalTransformPointV33(anchors[anchorIndex], component.centerX, component.centerY, far);
          var farB = voidPortalTransformPointV33(nextAnchor, component.centerX, component.centerY, far);
          planeCtx.globalAlpha = strength * (architecture === 'horizon' ? 0.1 : 0.16);
          planeCtx.beginPath();
          planeCtx.moveTo(nearA.x, nearA.y); planeCtx.lineTo(nearB.x, nearB.y);
          planeCtx.lineTo(farB.x, farB.y); planeCtx.lineTo(farA.x, farA.y);
          planeCtx.closePath(); planeCtx.fill();
        }
        planeCtx.globalAlpha = 1;

        var railCtx = layers.rails.ctx;
        railCtx.strokeStyle = '#fff';
        railCtx.lineCap = architecture === 'carceri' ? 'square' : 'round';
        railCtx.lineJoin = architecture === 'carceri' ? 'miter' : 'round';
        railCtx.lineWidth = Math.max(0.55, pixelScale * (architecture === 'carceri' ? 1.35 : 0.9));
        for (var railIndex = 0; railIndex < anchors.length; railIndex += architecture === 'horizon' ? 1 : 2) {
          var railStart = voidPortalTransformPointV33(anchors[railIndex], component.centerX, component.centerY, near);
          var railEnd = voidPortalTransformPointV33(anchors[railIndex], component.centerX, component.centerY, far);
          var railDx = railEnd.x - railStart.x, railDy = railEnd.y - railStart.y;
          var railLength = Math.max(0.001, Math.hypot(railDx, railDy));
          var normalX = -railDy / railLength, normalY = railDx / railLength;
          var bend = architecture === 'archivolt' ? 0 : (architecture === 'carceri' ? railLength * 0.08 : railLength * 0.13);
          railCtx.globalAlpha = strength * (0.42 + (railIndex % 3) * 0.12);
          railCtx.beginPath(); railCtx.moveTo(railStart.x, railStart.y);
          railCtx.quadraticCurveTo((railStart.x + railEnd.x) * 0.5 + normalX * bend,
            (railStart.y + railEnd.y) * 0.5 + normalY * bend, railEnd.x, railEnd.y);
          railCtx.stroke();
        }
        railCtx.globalAlpha = 1;

        for (var rib = ribs; rib >= 0; rib--) {
          var t = ribs ? rib / ribs : 0;
          var state = voidPortalSectionStateV33(architecture, t, depth, angle, taper, aperture,
            phase, glyphIndex, componentIndex);
          var ribAlpha = strength * (0.24 + (1 - t) * 0.62);
          if (architecture === 'carceri') ribAlpha *= 0.72 + ((rib + componentIndex) % 3) * 0.14;
          if (architecture === 'horizon') ribAlpha *= 0.72 + Math.pow(1 - t, 0.5) * 0.38;
          drawVoidPortalMaskV33(layers.ribs.ctx, outline, component, state, ribAlpha);
          if (rib === 0 || rib === ribs || rib % Math.max(2, Math.round(ribs / 5)) === 0) {
            drawVoidPortalMaskV33(layers.glints.ctx, outline, component, state,
              strength * (rib === 0 ? 0.94 : 0.3 + (1 - t) * 0.28));
          }
          if (architecture === 'carceri' && anchors.length >= 4 && rib > 0 && rib < ribs && rib % 3 === 0) {
            var braceA = anchors[(rib + componentIndex) % anchors.length];
            var braceB = anchors[(rib + componentIndex + Math.floor(anchors.length / 2)) % anchors.length];
            var braceStart = voidPortalTransformPointV33(braceA, component.centerX, component.centerY, state);
            var braceEnd = voidPortalTransformPointV33(braceB, component.centerX, component.centerY, state);
            railCtx.globalAlpha = strength * 0.42;
            railCtx.beginPath(); railCtx.moveTo(braceStart.x, braceStart.y);
            railCtx.lineTo(braceEnd.x, braceEnd.y); railCtx.stroke();
          }
        }
        railCtx.globalAlpha = 1;
        drawVoidPortalMaskV33(layers.rim.ctx, outline, component, near, strength * 0.96);
      }

      function renderVoidPortal(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var architecture = surfaceChoice(glyphs, 'voidPortal', 'voidArchitecture',
          params.voidArchitecture, BATCH_PARAM_OPTIONS.voidArchitecture);
        if (architecture === 'legacy') {
          renderVoidPortalLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        var depthAggregate = surfaceAggregate(glyphs, 'voidPortal', 'voidDepth', params.voidDepth);
        if (!depthAggregate.weight) return;
        var depth = Math.max(0, depthAggregate.value * pixelScale * L.s);
        var angle = surfaceAggregate(glyphs, 'voidPortal', 'voidAngle', params.voidAngle).value * Math.PI / 180;
        var aperture = Math.max(0, Math.min(1,
          surfaceAggregate(glyphs, 'voidPortal', 'voidAperture', params.voidAperture).value));
        var taper = surfaceAggregate(glyphs, 'voidPortal', 'voidTaper', params.voidTaper).value;
        var ribs = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('voidRibs', Math.round(
          surfaceAggregate(glyphs, 'voidPortal', 'voidRibs', params.voidRibs).value), 0, 1, 32) : Math.max(1, Math.min(32, Math.round(
          surfaceAggregate(glyphs, 'voidPortal', 'voidRibs', params.voidRibs).value))));
        var sourceMask = buildSurfaceMask(glyphs, 'voidPortal', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, sourceMask, 'voidPortal', coverBase);
        var phase = compositionState.enabled
          ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var layers = {
          paper: surfaceScratch('void-portal-v33-paper-mouths', width, height, false),
          shadow: surfaceScratch('void-portal-v33-terminal-dark', width, height, false),
          planes: surfaceScratch('void-portal-v33-side-planes', width, height, false),
          ribs: surfaceScratch('void-portal-v33-archivolts', width, height, false),
          rails: surfaceScratch('void-portal-v33-perspective-rails', width, height, false),
          glints: surfaceScratch('void-portal-v33-depth-glints', width, height, false),
          rim: surfaceScratch('void-portal-v33-mouth-rims', width, height, false)
        };
        layers.planes.ctx.fillStyle = '#fff';

        var active = [];
        for (var glyphIndex = 0; glyphIndex < glyphs.length; glyphIndex++) {
          var glyph = glyphs[glyphIndex];
          if (surfaceGlyphStrength(glyph, 'voidPortal') <= 0.002
            || (glyph.opacity != null && glyph.opacity <= 0.002)
            || !glyph.ch || /^\s+$/.test(glyph.ch)) continue;
          active.push({ glyph: glyph, index: glyphIndex });
        }
        var maxGlyphs = 56;
        var stride = Math.max(1, Math.ceil(active.length / maxGlyphs));
        var totalComponents = 0;
        for (var activeIndex = 0; activeIndex < active.length && totalComponents < 168; activeIndex += stride) {
          var entry = active[activeIndex];
          var bounds = voidPortalGlyphBoundsV33(entry.glyph, width, height, pixelScale, L);
          if (!bounds) continue;
          var scan = voidPortalGlyphScanV33(entry.glyph, bounds, pixelScale, L, fm);
          if (!scan) continue;
          var apertures = voidPortalAperturesV33(scan, aperture);
          for (var apertureIndex = 0; apertureIndex < apertures.length && totalComponents < 168; apertureIndex++) {
            var component = voidPortalComponentV33(scan, apertures[apertureIndex]);
            if (!component.anchors.length) continue;
            renderVoidPortalComponentV33(layers, component, architecture, depth, angle, taper,
              aperture, ribs, surfaceGlyphStrength(entry.glyph, 'voidPortal'), phase,
              entry.index, apertureIndex, pixelScale);
            totalComponents++;
          }
        }
        if (!totalComponents) return;

        var occlusion = surfaceScratch('void-portal-v33-source-occlusion', width, height, false);
        occlusion.ctx.drawImage(sourceMask, 0, 0);
        occlusion.ctx.globalCompositeOperation = 'destination-out';
        occlusion.ctx.drawImage(layers.paper.canvas, 0, 0);
        occlusion.ctx.globalCompositeOperation = 'source-over';
        var occludedLayers = [layers.shadow, layers.planes, layers.ribs, layers.rails, layers.glints];
        for (var layerIndex = 0; layerIndex < occludedLayers.length; layerIndex++) {
          occludedLayers[layerIndex].ctx.globalCompositeOperation = 'destination-out';
          occludedLayers[layerIndex].ctx.globalAlpha = 1;
          occludedLayers[layerIndex].ctx.drawImage(occlusion.canvas, 0, 0);
          occludedLayers[layerIndex].ctx.globalCompositeOperation = 'source-over';
        }

        var rgb = surfaceHexRgb(surfaceEffectColor('voidPortal'));
        paintSurfaceMask(targetCtx, layers.paper.canvas, params.paper, 1, 'void-portal-v33-paper-color');
        paintSurfaceMask(targetCtx, layers.shadow.canvas, surfaceToneCss(rgb, -0.84),
          0.9, 'void-portal-v33-terminal-color');
        paintSurfaceMask(targetCtx, layers.planes.canvas, surfaceToneCss(rgb, -0.48),
          0.78, 'void-portal-v33-plane-color');
        paintSurfaceMask(targetCtx, layers.ribs.canvas, surfaceToneCss(rgb, -0.08),
          1, 'void-portal-v33-rib-color');
        paintSurfaceMask(targetCtx, layers.rails.canvas, surfaceToneCss(rgb, 0.22),
          0.9, 'void-portal-v33-rail-color');
        paintSurfaceMask(targetCtx, layers.glints.canvas, surfaceToneCss(rgb, 0.7),
          0.82, 'void-portal-v33-glint-color');
        paintSurfaceMask(targetCtx, layers.rim.canvas, surfaceToneCss(rgb, -0.36),
          0.96, 'void-portal-v33-rim-color');
      }

      function renderRecursiveShrineLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var iterationsAggregate = surfaceAggregate(glyphs, 'recursiveShrine', 'recursiveIterations', params.recursiveIterations);
        if (!iterationsAggregate.weight) return;
        var iterations = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('recursiveIterations', Math.round(iterationsAggregate.value), 0, 1, 24) : Math.max(1, Math.min(24, Math.round(iterationsAggregate.value))));
        var recursiveScale = surfaceAggregate(glyphs, 'recursiveShrine', 'recursiveScale', params.recursiveScale).value;
        var turn = surfaceAggregate(glyphs, 'recursiveShrine', 'recursiveTurn', params.recursiveTurn).value * Math.PI / 180;
        var orbit = surfaceAggregate(glyphs, 'recursiveShrine', 'recursiveOrbit', params.recursiveOrbit).value * pixelScale * L.s;
        var parity = Math.max(0, Math.min(1, surfaceAggregate(glyphs, 'recursiveShrine', 'recursiveParity', params.recursiveParity).value));
        var mask = buildSurfaceMask(glyphs, 'recursiveShrine', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'recursiveShrine', coverBase);
        var source;
        try { source = mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height); }
        catch (error) { return; }
        var field = surfaceBoundaryDistance(source.data, width, height);
        if (!field.bounds) return;
        var centerX = (field.bounds[0] + field.bounds[2]) * 0.5;
        var centerY = (field.bounds[1] + field.bounds[3]) * 0.5;
        var unionLayer = surfaceScratch('recursive-shrine-union', width, height, true);
        var xorLayer = surfaceScratch('recursive-shrine-xor', width, height, true);
        xorLayer.ctx.globalCompositeOperation = 'xor';
        var phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        for (var iteration = 0; iteration < iterations; iteration++) {
          var progress = iterations === 1 ? 0 : iteration / (iterations - 1);
          var scale = Math.max(0.035, Math.min(8, Math.pow(recursiveScale, iteration)));
          var theta = turn * iteration + phase * (iteration + 1);
          var offsetX = Math.cos(theta) * orbit * progress;
          var offsetY = Math.sin(theta) * orbit * progress;
          var alpha = iterationsAggregate.strength * (0.34 + (1 - progress) * 0.66);
          drawRecursiveMask(unionLayer.ctx, mask, width, height, centerX, centerY, scale, theta, offsetX, offsetY, alpha);
          drawRecursiveMask(xorLayer.ctx, mask, width, height, centerX, centerY, scale, theta, offsetX, offsetY, alpha);
        }
        xorLayer.ctx.globalCompositeOperation = 'source-over';
        var unionData, xorData;
        try {
          unionData = unionLayer.ctx.getImageData(0, 0, width, height);
          xorData = xorLayer.ctx.getImageData(0, 0, width, height);
        } catch (error) { return; }
        var mixed = unionLayer.ctx.createImageData(width, height);
        for (var pixel = 0; pixel < width * height; pixel++) {
          var alphaUnion = unionData.data[pixel * 4 + 3];
          var alphaXor = xorData.data[pixel * 4 + 3];
          var alphaMixed = Math.round(alphaUnion * (1 - parity) + alphaXor * parity);
          if (!alphaMixed) continue;
          mixed.data[pixel * 4] = 255;
          mixed.data[pixel * 4 + 1] = 255;
          mixed.data[pixel * 4 + 2] = 255;
          mixed.data[pixel * 4 + 3] = alphaMixed;
        }
        unionLayer.ctx.clearRect(0, 0, width, height);

        // Destination material shading; the analysis grid and topology stay fixed.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext,discard=new Float64Array(4);RC.field(mixed,function(px,py,rgba){var x=px-.5,y=py-.5,outputX=x,outputY=y;var pixel=Math.floor(y)*(width)+Math.floor(x);
          var alphaUnion = RC.rasterSample(unionData.data,width,height,x,y,3);
          var alphaXor = RC.rasterSample(xorData.data,width,height,x,y,3);
          var alphaMixed = Math.round(alphaUnion * (1 - parity) + alphaXor * parity);
          if (!alphaMixed) return;
          rgba[0] = 255;
          rgba[1] = 255;
          rgba[2] = 255;
          rgba[3] = alphaMixed;

        });}
        unionLayer.ctx.putImageData(mixed, 0, 0);
        paintSurfaceMask(targetCtx, unionLayer.canvas, surfaceEffectColor('recursiveShrine'), 1, 'recursive-shrine-color');
      }

      function renderRecursiveShrine(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var structure = surfaceChoice(glyphs, 'recursiveShrine', 'recursiveStructure',
          params.recursiveStructure, BATCH_PARAM_OPTIONS.recursiveStructure);
        if (structure === 'legacy') {
          renderRecursiveShrineLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        var iterationsAggregate = surfaceAggregate(glyphs, 'recursiveShrine', 'recursiveIterations', params.recursiveIterations);
        if (!iterationsAggregate.weight) return;
        var generations = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('recursiveIterations', Math.round(iterationsAggregate.value), 0, 1, 24) : Math.max(1, Math.min(24, Math.round(iterationsAggregate.value))));
        var inheritance = surfaceAggregate(glyphs, 'recursiveShrine', 'recursiveScale', params.recursiveScale).value;
        var turn = surfaceAggregate(glyphs, 'recursiveShrine', 'recursiveTurn', params.recursiveTurn).value * Math.PI / 180;
        var reach = Math.max(0, surfaceAggregate(glyphs, 'recursiveShrine', 'recursiveOrbit', params.recursiveOrbit).value
          * pixelScale * L.s);
        var parity = Math.max(0, Math.min(1,
          surfaceAggregate(glyphs, 'recursiveShrine', 'recursiveParity', params.recursiveParity).value));
        var sourceMask = buildSurfaceMask(glyphs, 'recursiveShrine', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, sourceMask, 'recursiveShrine', coverBase);
        var phase = compositionState.enabled
          ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;

        var body = surfaceScratch('recursive-shrine-v32-body', width, height, false);
        var apertures = surfaceScratch('recursive-shrine-v32-apertures', width, height, false);
        var accent = surfaceScratch('recursive-shrine-v32-accent', width, height, false);
        var rails = surfaceScratch('recursive-shrine-v32-rails', width, height, false);
        var glints = surfaceScratch('recursive-shrine-v32-glints', width, height, false);
        body.ctx.globalAlpha = 0.66 + iterationsAggregate.strength * 0.34;
        body.ctx.drawImage(sourceMask, 0, 0);
        body.ctx.globalAlpha = 1;

        var active = [];
        for (var glyphIndex = 0; glyphIndex < glyphs.length; glyphIndex++) {
          var glyph = glyphs[glyphIndex];
          if (surfaceGlyphStrength(glyph, 'recursiveShrine') <= 0.002
            || (glyph.opacity != null && glyph.opacity <= 0.002)
            || !glyph.ch || /^\s+$/.test(glyph.ch)) continue;
          active.push({ glyph: glyph, index: glyphIndex });
        }
        if (!active.length) return;
        var maxGlyphs = 48;
        var stride = Math.max(1, Math.ceil(active.length / maxGlyphs));
        var sampled = [];
        for (var activeIndex = 0; activeIndex < active.length && sampled.length < maxGlyphs; activeIndex += stride) {
          sampled.push(active[activeIndex]);
        }
        var totalNodeBudget = 360;
        var nodeBudget = Math.max(2, Math.floor(totalNodeBudget / Math.max(1, sampled.length)));
        for (var sampledIndex = 0; sampledIndex < sampled.length; sampledIndex++) {
          var entry = sampled[sampledIndex];
          var strength = surfaceGlyphStrength(entry.glyph, 'recursiveShrine');
          var center = surfaceGlyphNode(entry.glyph, 'recursiveShrine', pixelScale, L,
            0, 0, 0, entry.index, 0.5, 0.5, 1);
          var radius = Math.max(3, center.r * 1.24);
          var lineWidth = Math.max(0.55, Math.min(18 * pixelScale,
            radius * (0.072 + parity * 0.035)));
          var glyphMask = surfaceScratch('recursive-shrine-v32-glyph', width, height, false);
          drawSurfaceGlyph(glyphMask.ctx, entry.glyph, pixelScale, L, fm, 1, '#fff');
          var outline = ribbonOutlineMaskV31(glyphMask.canvas,
            Math.max(0.75, lineWidth * (1.2 + parity * 0.55)), 'recursive-shrine-v32-outline');
          rails.ctx.save();
          rails.ctx.globalAlpha = strength * (0.3 + parity * 0.3);
          rails.ctx.drawImage(outline, 0, 0);
          rails.ctx.restore();

          var nodes = recursiveShrineGraphV32(structure, generations, inheritance, turn, reach,
            phase, center.x, center.y, radius, nodeBudget, entry.index);
          for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
            var node = nodes[nodeIndex];
            var nodeFade = Math.max(0.26, 1 - node.level / Math.max(2, generations) * 0.5);
            var nodeAlpha = strength * nodeFade;
            var negative = node.level > 0 && (node.level % 2 === 1);
            if (structure === 'cantor' && node.level > 0) {
              negative = (node.level + (node.branch < 0 ? 1 : 0)) % 2 === 1;
            }
            if (structure === 'tracery') {
              drawRecursiveNodeMaskV32(body.ctx, glyphMask.canvas, center.x, center.y, node,
                nodeAlpha * (node.level ? 0.78 : 0.96), node.stretchX, node.stretchY);
              if (node.level > 0 && parity > 0.002) {
                body.ctx.globalCompositeOperation = 'destination-out';
                drawRecursiveNodeMaskV32(body.ctx, glyphMask.canvas, center.x, center.y, node,
                  nodeAlpha * (0.34 + parity * 0.66),
                  node.stretchX * (0.32 + parity * 0.22), node.stretchY * (0.32 + parity * 0.22));
                body.ctx.globalCompositeOperation = 'source-over';
                drawRecursiveNodeMaskV32(apertures.ctx, glyphMask.canvas, center.x, center.y, node,
                  nodeAlpha * parity, node.stretchX * (0.32 + parity * 0.22),
                  node.stretchY * (0.32 + parity * 0.22));
              }
              if (node.level > 0) drawRecursiveNodeMaskV32(accent.ctx, glyphMask.canvas,
                center.x, center.y, node, nodeAlpha * 0.36,
                node.stretchX * 0.76, node.stretchY * 0.76);
              continue;
            }
            if (negative && parity > 0.002) {
              body.ctx.globalCompositeOperation = 'destination-out';
              drawRecursiveNodeMaskV32(body.ctx, glyphMask.canvas, center.x, center.y, node,
                nodeAlpha * (0.3 + parity * 0.7), node.stretchX, node.stretchY);
              body.ctx.globalCompositeOperation = 'source-over';
              drawRecursiveNodeMaskV32(apertures.ctx, glyphMask.canvas, center.x, center.y, node,
                nodeAlpha * parity, node.stretchX, node.stretchY);
            } else {
              drawRecursiveNodeMaskV32(body.ctx, glyphMask.canvas, center.x, center.y, node,
                nodeAlpha * (node.level ? 0.82 : 0.98), node.stretchX, node.stretchY);
              if (node.level > 0) drawRecursiveNodeMaskV32(accent.ctx, glyphMask.canvas,
                center.x, center.y, node, nodeAlpha * 0.5, node.stretchX * 0.88, node.stretchY * 0.88);
            }
          }
          drawRecursiveShrineRailsV32(rails.ctx, nodes, structure, radius, lineWidth * 2.3, strength);
          drawRecursiveShrineRailsV32(glints.ctx, nodes, structure, radius, lineWidth * 0.72, strength * 0.9);
        }

        var shadow = surfaceScratch('recursive-shrine-v32-shadow', width, height, false);
        if ('filter' in shadow.ctx) shadow.ctx.filter = 'blur(' + Math.max(0.8, Math.min(9, pixelScale * 2.4)) + 'px)';
        shadow.ctx.globalAlpha = 0.58;
        shadow.ctx.drawImage(body.canvas, Math.max(1, pixelScale * 2.2), Math.max(1, pixelScale * 2.8));
        if ('filter' in shadow.ctx) shadow.ctx.filter = 'none';

        var rgb = surfaceHexRgb(surfaceEffectColor('recursiveShrine'));
        paintSurfaceMask(targetCtx, shadow.canvas, surfaceToneCss(rgb, -0.72),
          0.3 + iterationsAggregate.strength * 0.16, 'recursive-shrine-v32-cast-shadow');
        paintSurfaceMask(targetCtx, apertures.canvas, params.paper,
          0.24 + parity * 0.7, 'recursive-shrine-v32-paper-apertures');
        paintSurfaceMask(targetCtx, body.canvas, surfaceToneCss(rgb, -0.1), 1,
          'recursive-shrine-v32-body-color');
        paintSurfaceMask(targetCtx, accent.canvas, surfaceToneCss(rgb, 0.34),
          0.72, 'recursive-shrine-v32-accent-color');
        paintSurfaceMask(targetCtx, rails.canvas, surfaceToneCss(rgb, -0.58),
          0.96, 'recursive-shrine-v32-rail-color');
        paintSurfaceMask(targetCtx, glints.canvas, surfaceToneCss(rgb, 0.62),
          0.86, 'recursive-shrine-v32-glint-color');
      }

      function renderMorphProcessionLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var stepsAggregate = surfaceAggregate(glyphs, 'morphProcession', 'morphInbetweens', params.morphInbetweens);
        if (!stepsAggregate.weight) return;
        var active = [];
        for (var i = 0; i < glyphs.length; i++) {
          if (surfaceGlyphStrength(glyphs[i], 'morphProcession') <= 0.002 || (glyphs[i].opacity != null && glyphs[i].opacity <= 0.002)) continue;
          active.push({ glyph: glyphs[i], index: i });
        }
        if (active.length < 2) return;
        var stride = Math.max(1, Math.ceil((active.length - 1) / 12));
        var sampled = [];
        for (var activeIndex = 0; activeIndex < active.length; activeIndex += stride) sampled.push(active[activeIndex]);
        if (sampled[sampled.length - 1] !== active[active.length - 1]) sampled.push(active[active.length - 1]);
        var inbetweens = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('morphInbetweens', Math.round(stepsAggregate.value), 0, 1, 24) : Math.max(1, Math.min(24, Math.round(stepsAggregate.value))));
        var span = surfaceAggregate(glyphs, 'morphProcession', 'morphSpan', params.morphSpan).value;
        var melt = surfaceAggregate(glyphs, 'morphProcession', 'morphMelt', params.morphMelt).value;
        var twist = surfaceAggregate(glyphs, 'morphProcession', 'morphTwist', params.morphTwist).value * Math.PI / 180;
        var halo = surfaceAggregate(glyphs, 'morphProcession', 'morphHalo', params.morphHalo).value * pixelScale * L.s;
        var mask = buildSurfaceMask(glyphs, 'morphProcession', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'morphProcession', coverBase);
        var work = surfaceScratch('morph-procession', width, height, false);
        var tileSize = 72;
        var tile = surfaceScratch('morph-procession-tile', tileSize, tileSize, false);
        var fieldCache = Object.create(null);
        var phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        for (var pairIndex = 0; pairIndex + 1 < sampled.length && pairIndex < 12; pairIndex++) {
          var first = sampled[pairIndex];
          var second = sampled[pairIndex + 1];
          var firstKey = String(first.glyph.ch || '') + ':' + params.fontFamily + ':' + params.fontWeight + ':' + JSON.stringify(first.glyph.fontAxes);
          var secondKey = String(second.glyph.ch || '') + ':' + params.fontFamily + ':' + params.fontWeight + ':' + JSON.stringify(second.glyph.fontAxes);
          var firstField = fieldCache[firstKey] || (fieldCache[firstKey] = surfaceMorphGlyphField(first.glyph.ch, tileSize, first.glyph));
          var secondField = fieldCache[secondKey] || (fieldCache[secondKey] = surfaceMorphGlyphField(second.glyph.ch, tileSize, second.glyph));
          if (!firstField || !secondField) continue;
          var firstNode = surfaceGlyphNode(first.glyph, 'morphProcession', pixelScale, L, 0, 0, 0, first.index);
          var secondNode = surfaceGlyphNode(second.glyph, 'morphProcession', pixelScale, L, 0, 0, 0, second.index);
          var pairStrength = Math.min(firstNode.strength, secondNode.strength, stepsAggregate.strength);
          for (var stepIndex = 1; stepIndex <= inbetweens; stepIndex++) {
            var t = stepIndex / (inbetweens + 1);
            var wave = Math.sin(Math.PI * t);
            var morphT = Math.max(0, Math.min(1, t + Math.sin(phase + pairIndex * 0.73) * wave * 0.16));
            var output = tile.ctx.createImageData(tileSize, tileSize);
            for (var fieldIndex = 0; fieldIndex < firstField.length; fieldIndex++) {
              var signed = firstField[fieldIndex] * (1 - morphT) + secondField[fieldIndex] * morphT + melt * wave * 4.5;
              var alpha = Math.max(0, Math.min(1, (signed + 0.85) / 1.7));
              if (alpha <= 0.002) continue;
              output.data[fieldIndex * 4] = 255;
              output.data[fieldIndex * 4 + 1] = 255;
              output.data[fieldIndex * 4 + 2] = 255;
              output.data[fieldIndex * 4 + 3] = Math.round(255 * alpha * pairStrength);
            }

        // Destination material shading; the analysis grid and topology stay fixed.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext,discard=new Float64Array(4);RC.field(output,function(px,py,rgba){var x=px-.5,y=py-.5,outputX=x,outputY=y;var fieldIndex=Math.floor(y)*(tileSize)+Math.floor(x);
              var signed = RC.sample(firstField,tileSize,tileSize,x,y) * (1 - morphT) + RC.sample(secondField,tileSize,tileSize,x,y) * morphT + melt * wave * 4.5;
              var alpha = Math.max(0, Math.min(1, (signed + 0.85) / 1.7));
              if (alpha <= 0.002) return;
              rgba[0] = 255;
              rgba[1] = 255;
              rgba[2] = 255;
              rgba[3] = Math.round(255 * alpha * pairStrength);

        });}
        tile.ctx.putImageData(output, 0, 0);
            var positionT = 0.5 + (t - 0.5) * span;
            var centerX = firstNode.x + (secondNode.x - firstNode.x) * positionT;
            var centerY = firstNode.y + (secondNode.y - firstNode.y) * positionT;
            var drawSize = Math.max(16, Math.min(Math.max(width, height), (firstNode.r * (1 - t) + secondNode.r * t) * 4.2));
            var rotation = twist * wave * (pairIndex % 2 ? -1 : 1) + phase * ((pairIndex % 3) - 1);
            work.ctx.save();
            work.ctx.translate(centerX, centerY);
            work.ctx.rotate(rotation);
            if (halo > 0.2) {
              work.ctx.globalAlpha = 0.26;
              work.ctx.filter = 'blur(' + Math.min(64, halo) + 'px)';
              work.ctx.drawImage(tile.canvas, -drawSize * 0.5, -drawSize * 0.5, drawSize, drawSize);
              work.ctx.filter = 'none';
            }
            work.ctx.globalAlpha = 0.88;
            work.ctx.drawImage(tile.canvas, -drawSize * 0.5, -drawSize * 0.5, drawSize, drawSize);
            work.ctx.restore();
          }
        }
        paintSurfaceMask(targetCtx, work.canvas, surfaceEffectColor('morphProcession'), 1, 'morph-procession-color');
      }

      function renderMorphProcession(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var choreography = surfaceChoice(glyphs, 'morphProcession', 'morphChoreography',
          params.morphChoreography, BATCH_PARAM_OPTIONS.morphChoreography);
        if (choreography === 'legacy') {
          renderMorphProcessionLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        var stepsAggregate = surfaceAggregate(glyphs, 'morphProcession', 'morphInbetweens', params.morphInbetweens);
        if (!stepsAggregate.weight) return;
        var pairs = surfaceMorphProcessionPairs(glyphs);
        if (!pairs.length) return;
        var inbetweens = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('morphInbetweens', Math.round(stepsAggregate.value), 0, 1, 24) : Math.max(1, Math.min(24, Math.round(stepsAggregate.value))));
        var span = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('morphSpan', surfaceAggregate(glyphs, 'morphProcession', 'morphSpan', params.morphSpan).value, 0, 0.1, Infinity) : Math.max(0.1, surfaceAggregate(glyphs, 'morphProcession', 'morphSpan', params.morphSpan).value));
        var melt = surfaceAggregate(glyphs, 'morphProcession', 'morphMelt', params.morphMelt).value;
        var twist = surfaceAggregate(glyphs, 'morphProcession', 'morphTwist', params.morphTwist).value * Math.PI / 180;
        var halo = Math.max(0, surfaceAggregate(glyphs, 'morphProcession', 'morphHalo', params.morphHalo).value * pixelScale * L.s);
        var mask = buildSurfaceMask(glyphs, 'morphProcession', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'morphProcession', coverBase);
        var work = surfaceScratch('morph-procession-v31', width, height, false);
        var ctx = work.ctx;
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        var tileSize = 96;
        var tile = surfaceScratch('morph-procession-v31-tile', tileSize, tileSize, false);
        var descriptorCache = Object.create(null);
        var phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var counterCuts = [];

        function descriptor(entry) {
          var key = String(entry.glyph.ch || '') + ':' + params.fontFamily + ':' + params.fontWeight + ':' + JSON.stringify(entry.glyph.fontAxes);
          return descriptorCache[key]
            || (descriptorCache[key] = surfaceMorphGlyphDescriptor(entry.glyph.ch, tileSize, entry.glyph));
        }

        for (var pairIndex = 0; pairIndex < pairs.length; pairIndex++) {
          var pair = pairs[pairIndex];
          var firstDescriptor = descriptor(pair.first);
          var secondDescriptor = descriptor(pair.second);
          if (!firstDescriptor || !secondDescriptor) continue;
          var firstNode = surfaceGlyphNode(pair.first.glyph, 'morphProcession', pixelScale, L, 0, 0, 0, pair.first.index);
          var secondNode = surfaceGlyphNode(pair.second.glyph, 'morphProcession', pixelScale, L, 0, 0, 0, pair.second.index);
          var pairStrength = Math.min(firstNode.strength, secondNode.strength, stepsAggregate.strength);
          var distance = Math.max(1, Math.hypot(secondNode.x - firstNode.x, secondNode.y - firstNode.y));
          var averageRadius = Math.max(8, (firstNode.r + secondNode.r) * 0.5);
          var directionX = (secondNode.x - firstNode.x) / distance;
          var directionY = (secondNode.y - firstNode.y) / distance;
          // Start at the facing ink edges. Keeping the interpolants out of the
          // source interiors makes the procession occupy typographic space
          // between letters instead of repeatedly over-printing each glyph.
          var edgeInset = Math.min(distance * 0.18, averageRadius * 1.15);
          var firstEdge = {
            x: firstNode.x + directionX * edgeInset,
            y: firstNode.y + directionY * edgeInset
          };
          var secondEdge = {
            x: secondNode.x - directionX * edgeInset,
            y: secondNode.y - directionY * edgeInset
          };
          var corridorDistance = Math.max(1, Math.hypot(secondEdge.x - firstEdge.x, secondEdge.y - firstEdge.y));
          var bendSign = pairIndex % 2 ? -1 : 1;
          var bend = bendSign * corridorDistance * Math.min(0.42,
            0.055 + Math.abs(twist) / (Math.PI * 7) + Math.abs(melt) * 0.035);
          bend += Math.sin(phase + pairIndex * 0.81) * corridorDistance * 0.045;
          var geometry = morphPathGeometry(firstEdge, secondEdge, bend, 0);

          if (choreography === 'corridor') {
            for (var rail = -1; rail <= 1; rail++) {
              var railGeometry = morphPathGeometry(firstEdge, secondEdge, bend * (1 - Math.abs(rail) * 0.12), rail * averageRadius * 0.17);
              ctx.globalAlpha = pairStrength * (rail ? 0.32 : 0.62);
              ctx.lineWidth = Math.max(0.9, averageRadius * (rail ? 0.035 : 0.065));
              strokeMorphCorrespondence(ctx, railGeometry);
            }
          } else if (choreography === 'braid') {
            for (var lane = -1; lane <= 1; lane += 2) {
              var laneGeometry = morphPathGeometry(firstEdge, secondEdge, bend * lane, lane * averageRadius * 0.23);
              ctx.globalAlpha = pairStrength * 0.46;
              ctx.lineWidth = Math.max(1, averageRadius * 0.1);
              strokeMorphCorrespondence(ctx, laneGeometry);
            }
          } else if (choreography === 'cascade') {
            ctx.globalAlpha = pairStrength * 0.42;
            ctx.lineWidth = Math.max(0.8, averageRadius * 0.035);
            strokeMorphCorrespondence(ctx, geometry);
          } else {
            ctx.globalAlpha = pairStrength * 0.5;
            ctx.lineWidth = Math.max(4, averageRadius * (0.42 + Math.abs(melt) * 0.09));
            strokeMorphCorrespondence(ctx, geometry);
          }

          for (var stepIndex = 1; stepIndex <= inbetweens; stepIndex++) {
            var t = stepIndex / (inbetweens + 1);
            var wave = Math.sin(Math.PI * t);
            var morphT = Math.max(0, Math.min(1,
              t + Math.sin(phase + pairIndex * 0.73) * wave * 0.12));
            var tileRendering = choreography === 'corridor' ? 'contour'
              : (choreography === 'braid' ? 'doubleContour' : 'fill');
            paintFeatureMorphTile(tile, firstDescriptor, secondDescriptor, morphT, melt, wave, 1, tileRendering);
            var positionT = 0.5 + (t - 0.5) * span;
            var point = morphPathPoint(geometry, positionT);
            var laneOffset = 0;
            var densityFade = Math.min(1, Math.sqrt(7 / Math.max(1, inbetweens)));
            var scale = 0.66 + wave * 0.08;
            var opacity = 0.64 * densityFade;
            if (choreography === 'braid') {
              laneOffset = Math.sin(t * Math.PI * 4 + phase + pairIndex * 0.4) * averageRadius * (0.3 + Math.abs(melt) * 0.07);
              scale = 0.54 + wave * 0.12;
              opacity = 0.62 * densityFade;
              if (stepIndex % 2 === 0) counterCuts.push({ x: point.x, y: point.y, r: averageRadius * 0.13 });
            } else if (choreography === 'cascade') {
              laneOffset = bendSign * wave * averageRadius * (0.48 + Math.abs(melt) * 0.12);
              scale = 0.28 + t * 0.74;
              opacity = (0.2 + t * 0.34) * densityFade;
            } else if (choreography === 'membrane') {
              laneOffset = Math.sin(t * Math.PI * 2 + phase) * averageRadius * 0.08;
              scale = 0.72 + wave * 0.1;
              opacity = 0.28 * densityFade;
            }
            var drawSpecimen = choreography === 'braid' || choreography === 'cascade'
              || stepIndex % 2 === 1 || stepIndex === Math.ceil(inbetweens * 0.5);
            if (!drawSpecimen) continue;
            point.x += geometry.nx * laneOffset;
            point.y += geometry.ny * laneOffset;
            var drawSize = Math.max(24, Math.min(Math.max(width, height),
              (firstNode.r * (1 - t) + secondNode.r * t) * 3.6 * scale));
            var rotation = twist * wave * bendSign;
            if (choreography === 'braid') rotation *= stepIndex % 2 ? 1 : -1;
            if (choreography === 'cascade') rotation = twist * (t - 0.5) + phase * 0.08;
            ctx.save();
            ctx.translate(point.x, point.y);
            ctx.rotate(rotation);
            if (halo > 0.2) {
              ctx.globalAlpha = pairStrength * Math.min(0.22, 0.08 + halo / 900);
              ctx.filter = 'blur(' + Math.min(48, halo) + 'px)';
              ctx.drawImage(tile.canvas, -drawSize * 0.5, -drawSize * 0.5, drawSize, drawSize);
              ctx.filter = 'none';
            }
            ctx.globalAlpha = pairStrength * opacity;
            ctx.drawImage(tile.canvas, -drawSize * 0.5, -drawSize * 0.5, drawSize, drawSize);
            ctx.restore();
          }

          if (choreography === 'membrane') {
            counterCuts.push({ geometry: geometry, width: Math.max(1.5, averageRadius * (0.1 + Math.max(0, melt) * 0.035)) });
          }
        }

        if (counterCuts.length) {
          ctx.save();
          ctx.globalCompositeOperation = 'destination-out';
          ctx.globalAlpha = 0.94;
          for (var cutIndex = 0; cutIndex < counterCuts.length; cutIndex++) {
            var cut = counterCuts[cutIndex];
            if (cut.geometry) {
              ctx.lineWidth = cut.width;
              strokeMorphCorrespondence(ctx, cut.geometry);
            } else {
              ctx.beginPath(); ctx.arc(cut.x, cut.y, cut.r, 0, Math.PI * 2); ctx.fill();
            }
          }
          ctx.restore();
        }
        ctx.globalAlpha = 1;
        paintSurfaceMask(targetCtx, work.canvas, surfaceEffectColor('morphProcession'), 1, 'morph-procession-v31-color');
      }

      function renderContourEtchLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var bandsAggregate = surfaceAggregate(glyphs, 'contourEtch', 'contourBands', params.contourBands);
        if (!bandsAggregate.weight) return;
        var bands = Math.max(1, Math.round(bandsAggregate.value));
        var spacing = Math.max(1, surfaceAggregate(glyphs, 'contourEtch', 'contourSpacing', params.contourSpacing).value * pixelScale * L.s);
        var stroke = Math.max(0.25, surfaceAggregate(glyphs, 'contourEtch', 'contourStroke', params.contourStroke).value * pixelScale * L.s);
        var drift = surfaceAggregate(glyphs, 'contourEtch', 'contourDrift', params.contourDrift).value;
        var mask = buildSurfaceMask(glyphs, 'contourEtch', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'contourEtch', coverBase);
        var maskCtx = mask.getContext('2d', { willReadFrequently: true });
        var source;
        try { source = maskCtx.getImageData(0, 0, width, height); }
        catch (error) { return; }
        var field = surfaceBoundaryDistance(source.data, width, height);
        if (!field.bounds) return;
        var work = surfaceScratch('contour-etch', width, height, false);
        var output = work.ctx.createImageData(width, height);
        var availableMargin = Math.max(1, Math.min(field.bounds[0], field.bounds[1],
          width - 1 - field.bounds[2], height - 1 - field.bounds[3]) - 3);
        var reach = Math.min(Math.sqrt(width * width + height * height), bands * spacing, availableMargin);
        var halfStroke = Math.min(spacing * 0.48, stroke * 0.5);
        var phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * spacing : 0;
        for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
          var index = y * width + x;
          var distance = field.distance[index];
          if (distance > reach) continue;
          var terrain = drift ? Math.sin(x * 0.031 + y * 0.019 + params.seed * 0.17) * spacing * drift * 0.38
            + Math.sin(x * 0.009 - y * 0.027 - params.seed * 0.11) * spacing * drift * 0.18 : 0;
          var stepped = distance + terrain + phase;
          var modulo = ((stepped % spacing) + spacing) % spacing;
          var edgeDistance = Math.min(modulo, spacing - modulo);
          if (edgeDistance > halfStroke) continue;
          var contourIndex = Math.floor(Math.max(0, distance) / spacing);
          var fade = 1 - Math.min(0.72, contourIndex / Math.max(1, bands) * 0.55);
          var interiorGain = field.inside[index] ? 1 : 0.78;
          output.data[index * 4] = 255;
          output.data[index * 4 + 1] = 255;
          output.data[index * 4 + 2] = 255;
          output.data[index * 4 + 3] = Math.round(255 * bandsAggregate.strength * fade * interiorGain);
        }

        // Output pixels sample the fixed geometry and original glyph raster.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext;RC.field(output,function(px,py,rgba){var x=px-.5,y=py-.5;if(y<(0)||!(y < height))return;if(x<(0)||!(x < width))return;
          var index = Math.floor(y) * width + Math.floor(x);
          var distance = RC.sample(field.distance,width,height,x,y);
          if (distance > reach) return;
          var terrain = drift ? Math.sin(x * 0.031 + y * 0.019 + params.seed * 0.17) * spacing * drift * 0.38
            + Math.sin(x * 0.009 - y * 0.027 - params.seed * 0.11) * spacing * drift * 0.18 : 0;
          var stepped = distance + terrain + phase;
          var modulo = ((stepped % spacing) + spacing) % spacing;
          var edgeDistance = Math.min(modulo, spacing - modulo);
          if (edgeDistance > halfStroke) return;
          var contourIndex = Math.floor(Math.max(0, distance) / spacing);
          var fade = 1 - Math.min(0.72, contourIndex / Math.max(1, bands) * 0.55);
          var interiorGain = (RC.sample(field.inside,width,height,x,y)>=.5) ? 1 : 0.78;
          rgba[0] = 255;
          rgba[1] = 255;
          rgba[2] = 255;
          rgba[3] = Math.round(255 * bandsAggregate.strength * fade * interiorGain);

        });}
        work.ctx.putImageData(output, 0, 0);
        paintSurfaceMask(targetCtx, work.canvas, surfaceEffectColor('contourEtch'), 1, 'contour-etch-color');
      }

      function renderContourReliefV57(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var bandsAggregate = surfaceAggregate(glyphs, 'contourEtch', 'contourBands', params.contourBands);
        if (!bandsAggregate.weight) return;
        var bands = Math.max(1, Math.round(bandsAggregate.value));
        var spacing = Math.max(1, surfaceAggregate(glyphs, 'contourEtch', 'contourSpacing', params.contourSpacing).value * pixelScale * L.s);
        var stroke = Math.max(0.25, surfaceAggregate(glyphs, 'contourEtch', 'contourStroke', params.contourStroke).value * pixelScale * L.s);
        var drift = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('contourDrift', surfaceAggregate(glyphs, 'contourEtch', 'contourDrift', params.contourDrift).value, 0, 0, Infinity) : Math.max(0, surfaceAggregate(glyphs, 'contourEtch', 'contourDrift', params.contourDrift).value));
        var relief = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('contourRelief', surfaceAggregate(glyphs, 'contourEtch', 'contourRelief', params.contourRelief).value, 0, 0, 4) : Math.max(0, Math.min(4, surfaceAggregate(glyphs, 'contourEtch', 'contourRelief', params.contourRelief).value)));
        var mask = buildSurfaceMask(glyphs, 'contourEtch', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'contourEtch', coverBase);
        var maskCtx = mask.getContext('2d', { willReadFrequently: true });
        var source;
        try { source = maskCtx.getImageData(0, 0, width, height); }
        catch (error) { return; }
        var field = surfaceBoundaryDistance(source.data, width, height);
        if (!field.bounds) return;
        var topology = surfaceVoidTopology(field, width, height);
        var surface = contourReliefFieldV57(field, width, height);
        var work = surfaceScratch('contour-etch-relief-v57', width, height, false);
        var output = work.ctx.createImageData(width, height);
        var availableMargin = Math.max(1, Math.min(field.bounds[0], field.bounds[1],
          width - 1 - field.bounds[2], height - 1 - field.bounds[3]) - 3);
        var reach = Math.min(Math.sqrt(width * width + height * height),
          bands * spacing * (1 + relief * 0.075), availableMargin);
        var phase = compositionState.enabled ? ((compositionState.phase % 1) + 1) % 1 : 0;
        if (phase < 0.0000001 || phase > 0.9999999) phase = 0;
        var phaseShift = Math.sin(phase * Math.PI * 2) * spacing * Math.min(0.38, 0.08 + relief * 0.065);
        for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
          var index = y * width + x;
          var signed = contourReliefSignedV57(surface, field, index);
          var magnitude = Math.abs(signed);
          // Warp changes the elevation value, never the declared spatial
          // envelope. This keeps destructive settings honest without hiding
          // overflow through camera fitting or a clipped frame edge.
          if (field.distance[index] > reach) continue;
          var warped = signed + contourReliefWarpV57(x, y, magnitude, spacing, drift, relief, phase, params.seed) + phaseShift;
          if (Math.abs(warped) > reach) continue;
          var modulo = ((warped % spacing) + spacing) % spacing;
          var edgeDistance = Math.min(modulo, spacing - modulo);
          var level = Math.abs(Math.floor(warped / spacing));
          var major = level % 5 === 0;
          var halfStroke = Math.min(spacing * 0.46, stroke * 0.5
            * (major ? 1.72 + relief * 0.16 : 0.58 + relief * 0.055));
          var coverage = surfaceSmoothCoverage(halfStroke - edgeDistance, Math.max(0.45, Math.min(1.4, stroke * 0.38)));
          if (coverage <= 0.002) continue;
          var fade = 1 - Math.min(0.82, Math.abs(warped) / Math.max(1, reach) * 0.72);
          var sideGain = field.inside[index] ? 1 : (topology.counter[index] ? 0.9 : 0.62);
          var alpha = coverage * bandsAggregate.strength * fade * sideGain * (major ? 1 : 0.78);
          if (!major && level % 5 === 2 && relief > 2.2
            && hash(x >> 1, y >> 1, params.seed + level * 19) > 0.82) alpha *= 0.32;
          if (alpha <= 0.002) continue;
          var pixel = index * 4;
          output.data[pixel] = output.data[pixel + 1] = output.data[pixel + 2] = 255;
          output.data[pixel + 3] = Math.round(255 * Math.min(1, alpha));
        }

        // Output pixels sample the fixed geometry and original glyph raster.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext;RC.field(output,function(px,py,rgba){var x=px-.5,y=py-.5;if(y<(0)||!(y < height))return;if(x<(0)||!(x < width))return;
          var index = Math.floor(y) * width + Math.floor(x);
          var signed = (surface.values?RC.sample(surface.values,width,height,x,y):RC.signed(field,width,height,x,y));
          var magnitude = Math.abs(signed);
          // Warp changes the elevation value, never the declared spatial
          // envelope. This keeps destructive settings honest without hiding
          // overflow through camera fitting or a clipped frame edge.
          if (RC.sample(field.distance,width,height,x,y) > reach) return;
          var warped = signed + contourReliefWarpV57(x, y, magnitude, spacing, drift, relief, phase, params.seed) + phaseShift;
          if (Math.abs(warped) > reach) return;
          var modulo = ((warped % spacing) + spacing) % spacing;
          var edgeDistance = Math.min(modulo, spacing - modulo);
          var level = Math.abs(Math.floor(warped / spacing));
          var major = level % 5 === 0;
          var halfStroke = Math.min(spacing * 0.46, stroke * 0.5
            * (major ? 1.72 + relief * 0.16 : 0.58 + relief * 0.055));
          var coverage = surfaceSmoothCoverage(halfStroke - edgeDistance, Math.max(0.45, Math.min(1.4, stroke * 0.38)));
          if (coverage <= 0.002) return;
          var fade = 1 - Math.min(0.82, Math.abs(warped) / Math.max(1, reach) * 0.72);
          var sideGain = (RC.sample(field.inside,width,height,x,y)>=.5) ? 1 : (topology.counter[index] ? 0.9 : 0.62);
          var alpha = coverage * bandsAggregate.strength * fade * sideGain * (major ? 1 : 0.78);
          if (!major && level % 5 === 2 && relief > 2.2
            && hash(x >> 1, y >> 1, params.seed + level * 19) > 0.82) alpha *= 0.32;
          if (alpha <= 0.002) return;
          var pixel = index * 4;
          rgba[0] = rgba[1] = rgba[2] = 255;
          rgba[3] = Math.round(255 * Math.min(1, alpha));

        });}
        work.ctx.putImageData(output, 0, 0);
        var marks = contourReliefHachuresV57(surface, field, topology, width, height, reach,
          spacing, stroke, drift, relief, phase, params.seed, 12000);
        var counterTicks = contourReliefCounterTicksV57(surface, field, topology, width, height,
          spacing, stroke, relief, params.seed, 768);
        contourReliefDrawMarksV57(work.ctx, marks, bandsAggregate.strength);
        contourReliefDrawMarksV57(work.ctx, counterTicks, bandsAggregate.strength);
        work.ctx.globalAlpha = 1;
        paintSurfaceMask(targetCtx, work.canvas, surfaceEffectColor('contourEtch'), 1, 'contour-etch-relief-v57-color');
      }

      function renderContourEtch(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var grammar = surfaceChoice(glyphs, 'contourEtch', 'contourGrammar', params.contourGrammar, BATCH_PARAM_OPTIONS.contourGrammar);
        if (grammar === 'legacy') {
          renderContourEtchLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        if (grammar === 'relief') {
          renderContourReliefV57(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        var bandsAggregate = surfaceAggregate(glyphs, 'contourEtch', 'contourBands', params.contourBands);
        if (!bandsAggregate.weight) return;
        var bands = Math.max(1, Math.round(bandsAggregate.value));
        var spacing = Math.max(1, surfaceAggregate(glyphs, 'contourEtch', 'contourSpacing', params.contourSpacing).value * pixelScale * L.s);
        var stroke = Math.max(0.25, surfaceAggregate(glyphs, 'contourEtch', 'contourStroke', params.contourStroke).value * pixelScale * L.s);
        var drift = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('contourDrift', surfaceAggregate(glyphs, 'contourEtch', 'contourDrift', params.contourDrift).value, 0, 0, Infinity) : Math.max(0, surfaceAggregate(glyphs, 'contourEtch', 'contourDrift', params.contourDrift).value));
        var relief = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('contourRelief', surfaceAggregate(glyphs, 'contourEtch', 'contourRelief', params.contourRelief).value, 0, 0, 4) : Math.max(0, Math.min(4, surfaceAggregate(glyphs, 'contourEtch', 'contourRelief', params.contourRelief).value)));
        var mask = buildSurfaceMask(glyphs, 'contourEtch', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'contourEtch', coverBase);
        var maskCtx = mask.getContext('2d', { willReadFrequently: true });
        var source;
        try { source = maskCtx.getImageData(0, 0, width, height); }
        catch (error) { return; }
        var field = surfaceBoundaryDistance(source.data, width, height);
        if (!field.bounds) return;
        var work = surfaceScratch('contour-etch-v25', width, height, false);
        var output = work.ctx.createImageData(width, height);
        var reach = Math.min(Math.sqrt(width * width + height * height), bands * spacing * (1 + relief * 0.055));
        var baseHalfStroke = Math.min(spacing * 0.46, stroke * 0.5);
        var phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * spacing : 0;
        var seedPhase = params.seed * 0.137;
        for (var y = 0; y < height; y++) {
          var rowFold = Math.sin(y * (0.006 + drift * 0.0017) - seedPhase * 0.73);
          for (var x = 0; x < width; x++) {
            var index = y * width + x;
            var distance = field.distance[index];
            if (distance > reach) continue;
            var terrain = drift ? (Math.sin(x * 0.027 + y * 0.016 + seedPhase) * 0.42
              + Math.sin(x * 0.008 - y * 0.023 - seedPhase * 0.61) * 0.22
              + rowFold * Math.sin(x * 0.004 + seedPhase * 0.37) * 0.24) * spacing * drift : 0;
            var reliefFold = relief ? Math.sin((x + y * 0.37) * 0.011 + seedPhase) * spacing * relief * 0.12 : 0;
            var stepped = Math.max(0, distance + terrain + reliefFold + phase);
            var modulo = ((stepped % spacing) + spacing) % spacing;
            var edgeDistance = Math.min(modulo, spacing - modulo);
            var contourIndex = Math.floor(stepped / spacing);
            var fade = 1 - Math.min(0.78, contourIndex / Math.max(1, bands) * (0.46 + relief * 0.055));
            var interiorGain = field.inside[index] ? 1 : 0.78;
            var alpha = 0;

            if (grammar === 'terraces') {
              var terraceWidth = spacing * Math.min(0.78, 0.18 + relief * 0.12);
              var plateau = modulo < terraceWidth;
              var wall = edgeDistance <= Math.min(spacing * 0.48, baseHalfStroke * (1.4 + relief * 0.32));
              if (plateau || wall) {
                var plateauTone = (contourIndex % 2 ? 0.19 : 0.34) + relief * 0.065;
                alpha = wall ? Math.min(1, 0.68 + relief * 0.12) : Math.min(0.82, plateauTone);
              }
            } else {
              var halfStroke = baseHalfStroke;
              if (grammar === 'index' && contourIndex % 5 === 0) halfStroke *= 1.9 + relief * 0.28;
              var supplementary = grammar === 'index' && relief > 1.65 && contourIndex % 5 === 2
                && edgeDistance < baseHalfStroke * 0.72;
              var lineHit = edgeDistance <= halfStroke || supplementary;
              if (grammar === 'watershed' && lineHit) {
                var drainage = Math.abs(Math.sin(x * 0.014 + rowFold * 1.7 + seedPhase)
                  + Math.sin(y * 0.021 - x * 0.003 + seedPhase * 0.41) * 0.52);
                if (drainage < 0.09 + relief * 0.035) lineHit = false;
              }
              if (lineHit) {
                alpha = grammar === 'index' && contourIndex % 5 === 0 ? 1 : (supplementary ? 0.42 : 0.76);
                if (supplementary && ((x + y + contourIndex * 7) % Math.max(4, Math.round(spacing * 1.7))) > spacing * 0.72) alpha = 0;
              }
            }
            if (alpha <= 0.002) continue;
            var pixel = index * 4;
            output.data[pixel] = output.data[pixel + 1] = output.data[pixel + 2] = 255;
            output.data[pixel + 3] = Math.round(255 * Math.min(1, alpha * bandsAggregate.strength * fade * interiorGain));
          }
        }

        // Destination material shading; the analysis grid and topology stay fixed.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext,discard=new Float64Array(4);RC.field(output,function(px,py,rgba){var x=px-.5,y=py-.5,outputX=x,outputY=y;
          var rowFold = Math.sin(y * (0.006 + drift * 0.0017) - seedPhase * 0.73);

            var index=Math.floor(y)*width+Math.floor(x);
            var distance = RC.sample(field.distance,width,height,x,y);
            if (distance > reach) return;
            var terrain = drift ? (Math.sin(x * 0.027 + y * 0.016 + seedPhase) * 0.42
              + Math.sin(x * 0.008 - y * 0.023 - seedPhase * 0.61) * 0.22
              + rowFold * Math.sin(x * 0.004 + seedPhase * 0.37) * 0.24) * spacing * drift : 0;
            var reliefFold = relief ? Math.sin((x + y * 0.37) * 0.011 + seedPhase) * spacing * relief * 0.12 : 0;
            var stepped = Math.max(0, distance + terrain + reliefFold + phase);
            var modulo = ((stepped % spacing) + spacing) % spacing;
            var edgeDistance = Math.min(modulo, spacing - modulo);
            var contourIndex = Math.floor(stepped / spacing);
            var fade = 1 - Math.min(0.78, contourIndex / Math.max(1, bands) * (0.46 + relief * 0.055));
            var interiorGain = (RC.sample(field.inside,width,height,x,y)>=.5) ? 1 : 0.78;
            var alpha = 0;

            if (grammar === 'terraces') {
              var terraceWidth = spacing * Math.min(0.78, 0.18 + relief * 0.12);
              var plateau = modulo < terraceWidth;
              var wall = edgeDistance <= Math.min(spacing * 0.48, baseHalfStroke * (1.4 + relief * 0.32));
              if (plateau || wall) {
                var plateauTone = (contourIndex % 2 ? 0.19 : 0.34) + relief * 0.065;
                alpha = wall ? Math.min(1, 0.68 + relief * 0.12) : Math.min(0.82, plateauTone);
              }
            } else {
              var halfStroke = baseHalfStroke;
              if (grammar === 'index' && contourIndex % 5 === 0) halfStroke *= 1.9 + relief * 0.28;
              var supplementary = grammar === 'index' && relief > 1.65 && contourIndex % 5 === 2
                && edgeDistance < baseHalfStroke * 0.72;
              var lineHit = edgeDistance <= halfStroke || supplementary;
              if (grammar === 'watershed' && lineHit) {
                var drainage = Math.abs(Math.sin(x * 0.014 + rowFold * 1.7 + seedPhase)
                  + Math.sin(y * 0.021 - x * 0.003 + seedPhase * 0.41) * 0.52);
                if (drainage < 0.09 + relief * 0.035) lineHit = false;
              }
              if (lineHit) {
                alpha = grammar === 'index' && contourIndex % 5 === 0 ? 1 : (supplementary ? 0.42 : 0.76);
                if (supplementary && ((x + y + contourIndex * 7) % Math.max(4, Math.round(spacing * 1.7))) > spacing * 0.72) alpha = 0;
              }
            }
            if (alpha <= 0.002) return;
            var pixel = index * 4;
            rgba[0] = rgba[1] = rgba[2] = 255;
            rgba[3] = Math.round(255 * Math.min(1, alpha * bandsAggregate.strength * fade * interiorGain));


        });}
        work.ctx.putImageData(output, 0, 0);

        if (grammar === 'watershed' && relief > 0.02) {
          var nodes = surfaceNodesForGlyphs(glyphs, 'contourEtch', 52, pixelScale, L, 0, 0, 0);
          var streamCount = Math.min(6, Math.max(1, Math.round(1 + relief * 1.15)));
          work.ctx.save();
          work.ctx.strokeStyle = '#fff';
          work.ctx.lineCap = 'round';
          work.ctx.lineJoin = 'round';
          for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
            for (var stream = 0; stream < streamCount; stream++) {
              var salt = nodeIndex * 37 + stream * 11;
              var angle = hash(salt, params.seed % 101, 2131) * Math.PI * 2;
              var length = reach * (0.28 + hash(stream, nodeIndex, 2137) * 0.58);
              var steps = Math.max(5, Math.min(34, Math.round(length / Math.max(5, spacing * 0.85))));
              var px = nodes[nodeIndex].x, py = nodes[nodeIndex].y;
              work.ctx.beginPath();
              work.ctx.moveTo(px, py);
              for (var step = 1; step <= steps; step++) {
                var t = step / steps;
                angle += Math.sin(step * 0.73 + salt + seedPhase) * (0.035 + relief * 0.012)
                  + (hash(step, salt, 2141) * 2 - 1) * 0.06;
                px += Math.cos(angle) * length / steps;
                py += Math.sin(angle) * length / steps;
                work.ctx.lineTo(px, py);
              }
              work.ctx.globalAlpha = nodes[nodeIndex].strength * (0.18 + relief * 0.12) * (1 - stream / (streamCount + 1) * 0.45);
              work.ctx.lineWidth = Math.max(0.45, stroke * (0.48 + (streamCount - stream) * 0.1));
              work.ctx.stroke();
            }
          }
          work.ctx.restore();
        }
        paintSurfaceMask(targetCtx, work.canvas, surfaceEffectColor('contourEtch'), 1, 'contour-etch-v25-color');
      }

      function renderMonolithCastLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var massAggregate = surfaceAggregate(glyphs, 'monolithCast', 'monolithMass', params.monolithMass);
        if (!massAggregate.weight) return;
        var moduleSize = Math.max(2, surfaceAggregate(glyphs, 'monolithCast', 'monolithModule', params.monolithModule).value * pixelScale * L.s);
        var fault = surfaceAggregate(glyphs, 'monolithCast', 'monolithFault', params.monolithFault).value * pixelScale * L.s;
        var counter = Math.max(0, Math.min(1, surfaceAggregate(glyphs, 'monolithCast', 'monolithCounter', params.monolithCounter).value));
        var formwork = Math.max(0, surfaceAggregate(glyphs, 'monolithCast', 'monolithFormwork', params.monolithFormwork).value);
        var mask = buildSurfaceMask(glyphs, 'monolithCast', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'monolithCast', coverBase);
        var maskCtx = mask.getContext('2d', { willReadFrequently: true });
        var source;
        try { source = maskCtx.getImageData(0, 0, width, height); }
        catch (error) { return; }
        var field = surfaceBoundaryDistance(source.data, width, height);
        if (!field.bounds) return;
        var mass = massAggregate.value * pixelScale * L.s;
        var reach = Math.max(moduleSize, Math.max(0, mass) + Math.abs(fault) + moduleSize * 0.75);
        var minX = Math.max(0, Math.floor(field.bounds[0] - reach));
        var minY = Math.max(0, Math.floor(field.bounds[1] - Math.max(moduleSize, Math.max(0, mass))));
        var maxX = Math.min(width - 1, Math.ceil(field.bounds[2] + reach));
        var maxY = Math.min(height - 1, Math.ceil(field.bounds[3] + Math.max(moduleSize, Math.max(0, mass))));
        var originY = field.bounds[1] - moduleSize * 0.5;
        var work = surfaceScratch('monolith-cast', width, height, false);
        var output = work.ctx.createImageData(width, height);
        for (var y = minY; y <= maxY; y++) {
          var course = Math.floor((y - originY) / moduleSize);
          var courseCenter = originY + (course + 0.5) * moduleSize;
          var shift = (hash(course, params.seed % 997, 1619) * 2 - 1) * fault;
          var stagger = (course & 1) ? moduleSize * 0.28 * Math.sign(fault || 1) : 0;
          var withinCourse = ((y - originY) % moduleSize + moduleSize) % moduleSize;
          var jointDistance = Math.min(withinCourse, moduleSize - withinCourse);
          for (var x = minX; x <= maxX; x++) {
            var sampleX = Math.max(0, Math.min(width - 1, Math.round(x - shift - stagger)));
            var sampleY = Math.max(0, Math.min(height - 1, Math.round(courseCenter)));
            var sampleIndex = sampleY * width + sampleX;
            var signedDistance = field.inside[sampleIndex] ? -field.distance[sampleIndex] : field.distance[sampleIndex];
            var edgeSoftness = Math.max(0.75, Math.min(3.5, moduleSize * 0.08));
            var coverage = (mass - signedDistance + edgeSoftness) / (edgeSoftness * 2);
            coverage = Math.max(0, Math.min(1, coverage));
            coverage = coverage * coverage * (3 - 2 * coverage);
            if (coverage <= 0.002) continue;
            var courseGroove = formwork > 0.002
              ? Math.max(0, 1 - jointDistance / Math.max(0.8, moduleSize * (0.025 + formwork * 0.018)))
              : 0;
            var boardWave = 0.5 + 0.5 * Math.sin((x - shift) / Math.max(2, moduleSize) * (6.2 + formwork * 2.4)
              + course * 1.71 + params.seed * 0.13);
            var pore = surfaceNoise01(x >> 2, y >> 2, params.seed + course * 31 + 1627);
            var markLoss = Math.min(0.82, courseGroove * Math.min(0.72, formwork * 0.24)
              + formwork * 0.055 * boardWave + (pore > 0.91 - Math.min(0.28, formwork * 0.06) ? formwork * 0.09 : 0));
            var alpha = coverage * massAggregate.strength * (1 - markLoss);
            if (alpha <= 0.002) continue;
            var index = (y * width + x) * 4;
            output.data[index] = output.data[index + 1] = output.data[index + 2] = 255;
            output.data[index + 3] = Math.round(255 * Math.min(1, alpha));
          }
        }

        // Destination material shading; the analysis grid and topology stay fixed.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext,discard=new Float64Array(4);RC.field(output,function(px,py,rgba){var x=px-.5,y=py-.5,outputX=x,outputY=y;
          var course = Math.floor((y - originY) / moduleSize);
          var courseCenter = originY + (course + 0.5) * moduleSize;
          var shift = (hash(course, params.seed % 997, 1619) * 2 - 1) * fault;
          var stagger = (course & 1) ? moduleSize * 0.28 * Math.sign(fault || 1) : 0;
          var withinCourse = ((y - originY) % moduleSize + moduleSize) % moduleSize;
          var jointDistance = Math.min(withinCourse, moduleSize - withinCourse);

            var sampleX = Math.max(0, Math.min(width - 1, Math.round(x - shift - stagger)));
            var sampleY = Math.max(0, Math.min(height - 1, Math.round(courseCenter)));
            var sampleIndex = sampleY * width + sampleX;
            var signedDistance = field.inside[sampleIndex] ? -field.distance[sampleIndex] : field.distance[sampleIndex];
            var edgeSoftness = Math.max(0.75, Math.min(3.5, moduleSize * 0.08));
            var coverage = (mass - signedDistance + edgeSoftness) / (edgeSoftness * 2);
            coverage = Math.max(0, Math.min(1, coverage));
            coverage = coverage * coverage * (3 - 2 * coverage);
            if (coverage <= 0.002) return;
            var courseGroove = formwork > 0.002
              ? Math.max(0, 1 - jointDistance / Math.max(0.8, moduleSize * (0.025 + formwork * 0.018)))
              : 0;
            var boardWave = 0.5 + 0.5 * Math.sin((x - shift) / Math.max(2, moduleSize) * (6.2 + formwork * 2.4)
              + course * 1.71 + params.seed * 0.13);
            var pore = surfaceNoise01(x >> 2, y >> 2, params.seed + course * 31 + 1627);
            var markLoss = Math.min(0.82, courseGroove * Math.min(0.72, formwork * 0.24)
              + formwork * 0.055 * boardWave + (pore > 0.91 - Math.min(0.28, formwork * 0.06) ? formwork * 0.09 : 0));
            var alpha = coverage * massAggregate.strength * (1 - markLoss);
            if (alpha <= 0.002) return;
            var index = (y * width + x) * 4;
            rgba[0] = rgba[1] = rgba[2] = 255;
            rgba[3] = Math.round(255 * Math.min(1, alpha));


        });}
        work.ctx.putImageData(output, 0, 0);
        if (counter > 0.002) {
          var counterMask = surfaceVoidApertureMask(mask, 0);
          if (counterMask) {
            work.ctx.save();
            work.ctx.globalCompositeOperation = 'destination-out';
            work.ctx.globalAlpha = counter;
            work.ctx.drawImage(counterMask, 0, 0, width, height);
            work.ctx.restore();
          }
        }
        paintSurfaceMask(targetCtx, work.canvas, surfaceEffectColor('monolithCast'), 1, 'monolith-cast-color');
      }

      function renderMonolithCast(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var grammar = surfaceChoice(glyphs, 'monolithCast', 'monolithGrammar', params.monolithGrammar,
          BATCH_PARAM_OPTIONS.monolithGrammar);
        if (grammar === 'legacy') {
          renderMonolithCastLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        var massAggregate = surfaceAggregate(glyphs, 'monolithCast', 'monolithMass', params.monolithMass);
        if (!massAggregate.weight) return;
        var modulePx = Math.max(2, surfaceAggregate(glyphs, 'monolithCast', 'monolithModule', params.monolithModule).value * pixelScale * L.s);
        var faultPx = surfaceAggregate(glyphs, 'monolithCast', 'monolithFault', params.monolithFault).value * pixelScale * L.s;
        var counterReturn = Math.max(0, Math.min(1,
          surfaceAggregate(glyphs, 'monolithCast', 'monolithCounter', params.monolithCounter).value));
        var formwork = Math.max(0,
          surfaceAggregate(glyphs, 'monolithCast', 'monolithFormwork', params.monolithFormwork).value);
        var rawMassPx = massAggregate.value * pixelScale * L.s;
        // A linear 28px dilation already bridges ordinary tracking. Compress
        // the legibility zone, then open the response after six modules so
        // the upper end still becomes deliberately monumental.
        var massMagnitude = Math.abs(rawMassPx);
        var massBase = Math.sqrt(massMagnitude * Math.max(2, modulePx * 0.5));
        var massTail = Math.max(0, massMagnitude - modulePx * 6);
        var massPx = (rawMassPx < 0 ? -1 : 1) * (massBase * (rawMassPx < 0 ? 0.78 : 0.42)
          + massTail * (rawMassPx < 0 ? 0.2 : 0.35));
        var sourceMask = buildSurfaceMask(glyphs, 'monolithCast', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, sourceMask, 'monolithCast', coverBase);
        var phase = compositionState.enabled
          ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var active = [];
        for (var glyphIndex = 0; glyphIndex < glyphs.length; glyphIndex++) {
          var glyph = glyphs[glyphIndex];
          var strength = surfaceGlyphStrength(glyph, 'monolithCast');
          if (strength <= 0.002 || (glyph.opacity != null && glyph.opacity <= 0.002)
            || !glyph.ch || /^\s+$/.test(glyph.ch)) continue;
          active.push({ glyph: glyph, index: glyphIndex, strength: strength });
        }
        if (!active.length) return;
        var scanLimit = active.length > 96 ? 128 : (active.length > 48 ? 176 : (active.length > 20 ? 240 : 380));
        var layers = {
          shadow: surfaceScratch('monolith-v35-shadow', width, height, false),
          body: surfaceScratch('monolith-v35-body', width, height, false),
          marks: surfaceScratch('monolith-v35-marks', width, height, false),
          bevel: surfaceScratch('monolith-v35-bevel', width, height, false),
          joints: surfaceScratch('monolith-v35-joints', width, height, false),
          rim: surfaceScratch('monolith-v35-rim', width, height, false)
        };
        var rendered = 0;
        for (var activeIndex = 0; activeIndex < active.length; activeIndex++) {
          var entry = active[activeIndex];
          var baseReach = Math.max(5, Math.max(0, massPx) + modulePx * 1.25);
          baseReach += Math.min(Math.abs(faultPx) * 0.22, modulePx * 3.5);
          var bounds = monolithGlyphBoundsV35(entry.glyph, width, height, pixelScale, L, baseReach, scanLimit);
          if (!bounds) continue;
          var scan = voidPortalGlyphScanV33(entry.glyph, bounds, pixelScale, L, fm);
          if (!scan) continue;
          var localModule = Math.max(2, modulePx * bounds.scale);
          var localFault = faultPx * bounds.scale;
          var localMass = massPx * bounds.scale;
          var salt = entry.index * 37 + params.seed * 11 + 4303;
          var cast = monolithBodyV35(scan, localMass, localModule, localFault,
            counterReturn, entry.strength, phase, salt);
          if (!cast) continue;
          var shadowDepth = Math.max(1, Math.min(8, (1.2 + formwork * 0.9) * pixelScale));
          layers.shadow.ctx.globalAlpha = 0.42;
          layers.shadow.ctx.drawImage(cast.body, bounds.x + shadowDepth, bounds.y + shadowDepth,
            bounds.w, bounds.h);
          layers.body.ctx.globalAlpha = 1;
          layers.body.ctx.drawImage(cast.body, bounds.x, bounds.y, bounds.w, bounds.h);

          var localJoints = surfaceScratch('monolith-v35-local-joints', bounds.scanW, bounds.scanH, false);
          if (grammar === 'strata') monolithDrawStrataV35(localJoints.ctx, bounds.scanW, bounds.scanH,
            localModule, localFault, formwork, phase, salt);
          else if (grammar === 'ashlar') monolithDrawAshlarV35(localJoints.ctx, bounds.scanW, bounds.scanH,
            localModule, localFault, formwork, phase, salt);
          else if (grammar === 'vault') monolithDrawVaultV35(localJoints.ctx, bounds.scanW, bounds.scanH,
            localModule, localFault, formwork, phase, salt, cast.anchors);
          else monolithDrawStereotomyV35(localJoints.ctx, bounds.scanW, bounds.scanH,
            localModule, localFault, formwork, phase, salt, cast.anchors);
          monolithClipLocalV35(localJoints, cast.body);

          var localBevel = surfaceScratch('monolith-v35-local-bevel', bounds.scanW, bounds.scanH, false);
          var bevelOffset = Math.max(0.65, Math.min(2.6, 0.65 + formwork * 0.34));
          localBevel.ctx.globalAlpha = 0.88;
          localBevel.ctx.drawImage(localJoints.canvas, -bevelOffset, -bevelOffset);
          monolithClipLocalV35(localBevel, cast.body);

          var localMarks = surfaceScratch('monolith-v35-local-marks', bounds.scanW, bounds.scanH, false);
          monolithDrawMarksV35(localMarks.ctx, bounds.scanW, bounds.scanH, localModule,
            formwork, phase, salt, grammar);
          monolithClipLocalV35(localMarks, cast.body);

          layers.marks.ctx.globalAlpha = 1;
          layers.marks.ctx.drawImage(localMarks.canvas, bounds.x, bounds.y, bounds.w, bounds.h);
          layers.bevel.ctx.globalAlpha = 1;
          layers.bevel.ctx.drawImage(localBevel.canvas, bounds.x, bounds.y, bounds.w, bounds.h);
          layers.joints.ctx.globalAlpha = 1;
          layers.joints.ctx.drawImage(localJoints.canvas, bounds.x, bounds.y, bounds.w, bounds.h);
          layers.rim.ctx.globalAlpha = 1;
          layers.rim.ctx.drawImage(cast.rim, bounds.x, bounds.y, bounds.w, bounds.h);
          rendered++;
        }
        if (!rendered) return;
        var rgb = surfaceHexRgb(surfaceEffectColor('monolithCast'));
        paintSurfaceMask(targetCtx, layers.shadow.canvas, surfaceToneCss(rgb, -0.86),
          0.76, 'monolith-v35-shadow-color');
        paintSurfaceMask(targetCtx, layers.body.canvas, surfaceToneCss(rgb, -0.08),
          1, 'monolith-v35-body-color');
        paintSurfaceMask(targetCtx, layers.marks.canvas, surfaceToneCss(rgb, -0.5),
          Math.min(0.88, 0.28 + formwork * 0.13), 'monolith-v35-mark-color');
        paintSurfaceMask(targetCtx, layers.bevel.canvas, surfaceToneCss(rgb, 0.68),
          0.72, 'monolith-v35-bevel-color');
        paintSurfaceMask(targetCtx, layers.joints.canvas, surfaceToneCss(rgb, -0.82),
          0.94, 'monolith-v35-joint-color');
        paintSurfaceMask(targetCtx, layers.rim.canvas, surfaceToneCss(rgb, 0.76),
          0.58, 'monolith-v35-rim-color');
      }

      function renderChimeraGraftLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var graftAggregate = surfaceAggregate(glyphs, 'chimeraGraft', 'chimeraGrafts', params.chimeraGrafts);
        if (!graftAggregate.weight) return;
        var span = surfaceAggregate(glyphs, 'chimeraGraft', 'chimeraSpan', params.chimeraSpan).value * pixelScale * L.s;
        var assimilation = Math.max(0, Math.min(1,
          surfaceAggregate(glyphs, 'chimeraGraft', 'chimeraAssimilation', params.chimeraAssimilation).value));
        var foreignness = Math.max(0,
          surfaceAggregate(glyphs, 'chimeraGraft', 'chimeraForeignness', params.chimeraForeignness).value);
        var seam = Math.max(0,
          surfaceAggregate(glyphs, 'chimeraGraft', 'chimeraSeam', params.chimeraSeam).value * pixelScale * L.s);
        var active = [];
        for (var glyphIndex = 0; glyphIndex < glyphs.length; glyphIndex++) {
          if (surfaceGlyphStrength(glyphs[glyphIndex], 'chimeraGraft') > 0.002) active.push(glyphs[glyphIndex]);
        }
        if (!active.length) return;
        var mask = buildSurfaceMask(glyphs, 'chimeraGraft', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'chimeraGraft', coverBase);
        var work = surfaceScratch('chimera-graft', width, height, false);
        work.ctx.drawImage(mask, 0, 0);
        var totalEvents = Math.min(160, Math.max(active.length, Math.round(graftAggregate.value * active.length)));
        var phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var processedEvents = 0;
        for (var hostIndex = 0; hostIndex < active.length && processedEvents < totalEvents; hostIndex++) {
          var host = active[hostIndex];
          var donor = active[(hostIndex + 1) % active.length];
          var hostMask = surfaceScratch('chimera-host', width, height, true);
          drawSurfaceGlyph(hostMask.ctx, host, pixelScale, L, fm, 1);
          var donorMask = surfaceScratch('chimera-donor', width, height, true);
          drawSurfaceGlyph(donorMask.ctx, donor, pixelScale, L, fm, 1);
          var hostEdges = sampleSurfaceMask(hostMask.canvas, 0.82, true, 112);
          var donorEdges = sampleSurfaceMask(donorMask.canvas, 0.72, true, 112);
          if (!hostEdges.length || !donorEdges.length) continue;
          var centerX = 0, centerY = 0;
          for (var centerIndex = 0; centerIndex < hostEdges.length; centerIndex++) {
            centerX += hostEdges[centerIndex].x;
            centerY += hostEdges[centerIndex].y;
          }
          centerX /= hostEdges.length;
          centerY /= hostEdges.length;
          var eventsForHost = Math.floor(totalEvents / active.length) + (hostIndex < totalEvents % active.length ? 1 : 0);
          var hostStrength = surfaceGlyphStrength(host, 'chimeraGraft');
          for (var localEvent = 0; localEvent < eventsForHost && processedEvents < totalEvents; localEvent++, processedEvents++) {
            var eventSeed = hostIndex * 131 + localEvent * 17 + params.seed * 7;
            var hostPoint = hostEdges[Math.floor(hash(eventSeed, hostEdges.length, 1657) * hostEdges.length)];
            var donorPoint = donorEdges[Math.floor(hash(eventSeed, donorEdges.length, 1663) * donorEdges.length)];
            var angle = Math.atan2(hostPoint.y - centerY, hostPoint.x - centerX);
            if (!isFinite(angle)) angle = hash(eventSeed, params.seed, 1667) * Math.PI * 2;
            angle += (hash(eventSeed, params.seed, 1669) * 2 - 1) * foreignness * 0.22;
            var pulse = 1 + Math.sin(phase + hostIndex * 1.17 + localEvent * 0.71) * Math.min(0.18, foreignness * 0.045);
            var travel = span * (0.3 + foreignness * 0.35) * (0.62 + hash(eventSeed, params.seed, 1673) * 0.72) * pulse;
            var targetX = hostPoint.x + Math.cos(angle) * travel;
            var targetY = hostPoint.y + Math.sin(angle) * travel;
            var chunkRadius = Math.max(3, span * (0.16 + foreignness * 0.045)
              * (0.7 + hash(eventSeed, params.seed, 1679) * 0.65));
            var tissueWidth = Math.max(1.5, chunkRadius * (0.52 + assimilation * 1.18));
            var controlBend = (hash(eventSeed, params.seed, 1681) * 2 - 1) * travel * (0.12 + foreignness * 0.09);
            var normalX = -Math.sin(angle), normalY = Math.cos(angle);
            work.ctx.save();
            work.ctx.globalCompositeOperation = 'source-over';
            work.ctx.globalAlpha = Math.min(1, hostStrength * (0.72 + assimilation * 0.28));
            work.ctx.strokeStyle = '#fff';
            work.ctx.lineCap = 'round';
            work.ctx.lineJoin = 'round';
            work.ctx.lineWidth = tissueWidth;
            work.ctx.beginPath();
            work.ctx.moveTo(hostPoint.x, hostPoint.y);
            work.ctx.bezierCurveTo(
              hostPoint.x + Math.cos(angle) * travel * 0.32 + normalX * controlBend,
              hostPoint.y + Math.sin(angle) * travel * 0.32 + normalY * controlBend,
              targetX - Math.cos(angle) * travel * 0.26 - normalX * controlBend * 0.35,
              targetY - Math.sin(angle) * travel * 0.26 - normalY * controlBend * 0.35,
              targetX, targetY
            );
            work.ctx.stroke();
            work.ctx.restore();

            work.ctx.save();
            work.ctx.globalCompositeOperation = 'source-over';
            work.ctx.globalAlpha = Math.min(1, hostStrength * (0.62 + assimilation * 0.38));
            work.ctx.beginPath();
            work.ctx.ellipse(targetX, targetY, chunkRadius * (1.1 + foreignness * 0.12), chunkRadius,
              angle, 0, Math.PI * 2);
            work.ctx.clip();
            var donorScale = Math.max(0.28, Math.min(3.2, 0.64 + foreignness * 0.28));
            var donorTurn = (hash(eventSeed, params.seed, 1693) * 2 - 1) * foreignness * 0.78;
            work.ctx.translate(targetX, targetY);
            work.ctx.rotate(donorTurn);
            work.ctx.scale(donorScale, donorScale * (0.78 + hash(eventSeed, params.seed, 1697) * 0.44));
            work.ctx.translate(-donorPoint.x, -donorPoint.y);
            work.ctx.drawImage(donorMask.canvas, 0, 0);
            work.ctx.restore();

            if (seam > 0.05) {
              work.ctx.save();
              work.ctx.globalCompositeOperation = 'destination-out';
              work.ctx.globalAlpha = Math.min(0.94, hostStrength * (0.2 + (1 - assimilation) * 0.72));
              work.ctx.strokeStyle = '#000';
              work.ctx.lineCap = 'round';
              work.ctx.lineWidth = seam;
              work.ctx.beginPath();
              work.ctx.arc(hostPoint.x, hostPoint.y, Math.max(seam, chunkRadius * 0.48),
                angle - Math.PI * 0.58, angle + Math.PI * 0.58);
              work.ctx.stroke();
              work.ctx.restore();
            }
          }
        }
        paintSurfaceMask(targetCtx, work.canvas, surfaceEffectColor('chimeraGraft'), 1, 'chimera-graft-color');
      }

      function renderChimeraGraft(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var system = surfaceChoice(glyphs, 'chimeraGraft', 'chimeraSystem', params.chimeraSystem,
          BATCH_PARAM_OPTIONS.chimeraSystem);
        if (system === 'legacy') {
          renderChimeraGraftLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        var graftAggregate = surfaceAggregate(glyphs, 'chimeraGraft', 'chimeraGrafts', params.chimeraGrafts);
        if (!graftAggregate.weight) return;
        var span = Math.max(4,
          surfaceAggregate(glyphs, 'chimeraGraft', 'chimeraSpan', params.chimeraSpan).value * pixelScale * L.s);
        var assimilation = Math.max(0, Math.min(1,
          surfaceAggregate(glyphs, 'chimeraGraft', 'chimeraAssimilation', params.chimeraAssimilation).value));
        var foreignness = Math.max(0,
          surfaceAggregate(glyphs, 'chimeraGraft', 'chimeraForeignness', params.chimeraForeignness).value);
        var seam = Math.max(0,
          surfaceAggregate(glyphs, 'chimeraGraft', 'chimeraSeam', params.chimeraSeam).value * pixelScale * L.s);
        var active = [];
        for (var glyphIndex = 0; glyphIndex < glyphs.length; glyphIndex++) {
          if (surfaceGlyphStrength(glyphs[glyphIndex], 'chimeraGraft') > 0.002) {
            active.push({ glyph: glyphs[glyphIndex], index: glyphIndex });
          }
        }
        if (!active.length) return;
        active.sort(function (left, right) {
          if (left.glyph.line !== right.glyph.line) return left.glyph.line - right.glyph.line;
          return params.vertical ? left.glyph.y - right.glyph.y : left.glyph.x - right.glyph.x;
        });
        var pairs = [];
        for (var activeIndex = 0; activeIndex < active.length - 1; activeIndex++) {
          if (active[activeIndex].glyph.line !== active[activeIndex + 1].glyph.line) continue;
          pairs.push({ host: active[activeIndex], donor: active[activeIndex + 1], self: false });
        }
        if (!pairs.length && active.length > 1) {
          for (var fallbackPair = 0; fallbackPair < active.length - 1; fallbackPair++) {
            pairs.push({ host: active[fallbackPair], donor: active[fallbackPair + 1], self: false });
          }
        }
        if (!pairs.length) pairs.push({ host: active[0], donor: active[0], self: true });

        var mask = buildSurfaceMask(glyphs, 'chimeraGraft', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'chimeraGraft', coverBase);
        var work = surfaceScratch('chimera-graft-union', width, height, false);
        work.ctx.drawImage(mask, 0, 0);
        work.ctx.fillStyle = '#fff';
        work.ctx.strokeStyle = '#fff';
        work.ctx.lineCap = 'round';
        work.ctx.lineJoin = 'round';
        var phase = compositionState.enabled
          ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var totalEvents = Math.min(96, Math.max(pairs.length,
          Math.round(graftAggregate.value * Math.max(1, Math.sqrt(pairs.length)))));
        var seams = [];

        function glyphCenter(glyph, index) {
          return surfaceGlyphNode(glyph, 'chimeraGraft', pixelScale, L, 0, 0, 0, index, 0.5, 0.5, 1);
        }
        function curveControls(a, b, bend) {
          var dx = b.x - a.x, dy = b.y - a.y;
          var distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          var nx = -dy / distance, ny = dx / distance;
          return {
            c1x: a.x + dx * 0.34 + nx * bend,
            c1y: a.y + dy * 0.34 + ny * bend,
            c2x: a.x + dx * 0.68 - nx * bend * 0.34,
            c2y: a.y + dy * 0.68 - ny * bend * 0.34
          };
        }
        function traceCurve(ctx, a, b, bend) {
          var controls = curveControls(a, b, bend);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.bezierCurveTo(controls.c1x, controls.c1y, controls.c2x, controls.c2y, b.x, b.y);
        }
        function curvePoint(a, b, bend, t) {
          var controls = curveControls(a, b, bend);
          var mt = 1 - t;
          return {
            x: mt * mt * mt * a.x + 3 * mt * mt * t * controls.c1x
              + 3 * mt * t * t * controls.c2x + t * t * t * b.x,
            y: mt * mt * mt * a.y + 3 * mt * mt * t * controls.c1y
              + 3 * mt * t * t * controls.c2y + t * t * t * b.y
          };
        }
        function closestFacingPoints(hostEdges, donorEdges, hostCenter, donorCenter, salt, selfPair) {
          if (selfPair) {
            var first = hostEdges[Math.floor(hash(salt, params.seed % 83, 1709) * hostEdges.length)];
            var farthest = first, farthestDistance = -1;
            for (var oppositeIndex = 0; oppositeIndex < hostEdges.length; oppositeIndex++) {
              var oppositeDx = hostEdges[oppositeIndex].x - first.x;
              var oppositeDy = hostEdges[oppositeIndex].y - first.y;
              var oppositeDistance = oppositeDx * oppositeDx + oppositeDy * oppositeDy;
              if (oppositeDistance > farthestDistance) {
                farthestDistance = oppositeDistance;
                farthest = hostEdges[oppositeIndex];
              }
            }
            return { a: first, b: farthest };
          }
          var hostCandidates = hostEdges.slice().sort(function (left, right) {
            var leftDx = left.x - donorCenter.x, leftDy = left.y - donorCenter.y;
            var rightDx = right.x - donorCenter.x, rightDy = right.y - donorCenter.y;
            return leftDx * leftDx + leftDy * leftDy - rightDx * rightDx - rightDy * rightDy;
          }).slice(0, Math.min(18, hostEdges.length));
          var donorCandidates = donorEdges.slice().sort(function (left, right) {
            var leftDx = left.x - hostCenter.x, leftDy = left.y - hostCenter.y;
            var rightDx = right.x - hostCenter.x, rightDy = right.y - hostCenter.y;
            return leftDx * leftDx + leftDy * leftDy - rightDx * rightDx - rightDy * rightDy;
          }).slice(0, Math.min(18, donorEdges.length));
          var best = null, bestScore = Infinity;
          for (var hostCandidateIndex = 0; hostCandidateIndex < hostCandidates.length; hostCandidateIndex++) {
            for (var donorCandidateIndex = 0; donorCandidateIndex < donorCandidates.length; donorCandidateIndex++) {
              var candidateDx = donorCandidates[donorCandidateIndex].x - hostCandidates[hostCandidateIndex].x;
              var candidateDy = donorCandidates[donorCandidateIndex].y - hostCandidates[hostCandidateIndex].y;
              var distance = candidateDx * candidateDx + candidateDy * candidateDy;
              var jitter = hash(hostCandidateIndex + salt, donorCandidateIndex, params.seed + 1721) * span * span * 0.018;
              if (distance + jitter < bestScore) {
                bestScore = distance + jitter;
                best = { a: hostCandidates[hostCandidateIndex], b: donorCandidates[donorCandidateIndex] };
              }
            }
          }
          return best || { a: hostEdges[0], b: donorEdges[0] };
        }

        var processed = 0;
        for (var pairIndex = 0; pairIndex < pairs.length && processed < totalEvents; pairIndex++) {
          var pair = pairs[pairIndex];
          var hostMask = surfaceScratch('chimera-host-work', width, height, true);
          drawSurfaceGlyph(hostMask.ctx, pair.host.glyph, pixelScale, L, fm, 1);
          var donorMask = surfaceScratch('chimera-donor-work', width, height, true);
          drawSurfaceGlyph(donorMask.ctx, pair.donor.glyph, pixelScale, L, fm, 1);
          var hostEdges = sampleSurfaceMask(hostMask.canvas, 0.94, true, 128);
          var donorEdges = pair.self ? hostEdges : sampleSurfaceMask(donorMask.canvas, 0.94, true, 128);
          var hostInterior = sampleSurfaceMask(hostMask.canvas, 0.78, false, 160);
          if (!hostEdges.length || !donorEdges.length) continue;
          var hostCenter = glyphCenter(pair.host.glyph, pair.host.index);
          var donorCenter = glyphCenter(pair.donor.glyph, pair.donor.index);
          var eventsForPair = Math.floor(totalEvents / pairs.length)
            + (pairIndex < totalEvents % pairs.length ? 1 : 0);
          var pairStrength = Math.min(surfaceGlyphStrength(pair.host.glyph, 'chimeraGraft'),
            surfaceGlyphStrength(pair.donor.glyph, 'chimeraGraft'));
          for (var localEvent = 0; localEvent < eventsForPair && processed < totalEvents;
               localEvent++, processed++) {
            var eventSeed = pairIndex * 173 + localEvent * 31 + params.seed * 11;
            var facing = closestFacingPoints(hostEdges, donorEdges, hostCenter, donorCenter,
              eventSeed, pair.self);
            var a = { x: facing.a.x, y: facing.a.y };
            var b = { x: facing.b.x, y: facing.b.y };
            var dx = b.x - a.x, dy = b.y - a.y;
            var distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
            var nx = -dy / distance, ny = dx / distance;
            var eventSpread = (localEvent - (eventsForPair - 1) * 0.5)
              * Math.min(span * 0.11, Math.max(2, seam * 1.8 + 2));
            a.x += nx * eventSpread; a.y += ny * eventSpread;
            b.x += nx * eventSpread; b.y += ny * eventSpread;
            var pulse = 1 + Math.sin(phase + pairIndex * 1.13 + localEvent * 0.77)
              * Math.min(0.16, 0.025 + foreignness * 0.032);
            var bend = (hash(eventSeed, params.seed % 89, 1733) * 2 - 1)
              * Math.min(span, distance) * (0.08 + foreignness * 0.055) * pulse;
            var bodyWidth = Math.max(2.2, Math.min(span * 0.78,
              span * (0.11 + assimilation * 0.1 + foreignness * 0.032))) * pulse;

            if (system === 'anastomosis') {
              work.ctx.globalAlpha = pairStrength * (0.72 + assimilation * 0.28);
              work.ctx.lineWidth = bodyWidth;
              traceCurve(work.ctx, a, b, bend);
              work.ctx.stroke();
              var capillaryCount = Math.min(7, 2 + Math.round(foreignness * 1.2 + assimilation * 2));
              for (var capillary = 0; capillary < capillaryCount; capillary++) {
                var capillaryOffset = (capillary - (capillaryCount - 1) * 0.5) * bodyWidth * 0.58;
                var ca = { x: a.x + nx * capillaryOffset, y: a.y + ny * capillaryOffset };
                var cb = { x: b.x - nx * capillaryOffset, y: b.y - ny * capillaryOffset };
                work.ctx.globalAlpha = pairStrength * (0.2 + assimilation * 0.18);
                work.ctx.lineWidth = Math.max(0.5, bodyWidth * 0.08);
                traceCurve(work.ctx, ca, cb, bend * (0.42 + capillary * 0.09));
                work.ctx.stroke();
              }
              seams.push({ type: 'curve', a: a, b: b, bend: bend,
                width: Math.max(seam, bodyWidth * (0.16 + (1 - assimilation) * 0.12)), alpha: 0.82 });
              seams.push({ type: 'ring', x: a.x, y: a.y, radius: bodyWidth * 0.62, width: Math.max(seam, bodyWidth * 0.11), alpha: 0.48 });
              seams.push({ type: 'ring', x: b.x, y: b.y, radius: bodyWidth * 0.62, width: Math.max(seam, bodyWidth * 0.11), alpha: 0.48 });
            } else if (system === 'symbiosis') {
              var lobeCount = Math.min(18, 7 + Math.round(assimilation * 6 + foreignness * 1.5));
              for (var lobe = 0; lobe <= lobeCount; lobe++) {
                var t = lobe / lobeCount;
                var lobePoint = curvePoint(a, b, bend, t);
                var lobeEnvelope = Math.sin(t * Math.PI);
                var lobeRadius = bodyWidth * (0.52 + lobeEnvelope * (0.7 + assimilation * 0.65))
                  * (0.78 + hash(eventSeed, lobe, params.seed + 1741) * 0.42);
                work.ctx.globalAlpha = pairStrength * (0.54 + assimilation * 0.4);
                fillOrganicNode(work.ctx, { x: lobePoint.x, y: lobePoint.y, r: lobeRadius },
                  phase, 0.18 + foreignness * 0.12, eventSeed + lobe * 7);
              }
              var organ = curvePoint(a, b, bend, 0.5);
              work.ctx.globalAlpha = pairStrength * 0.94;
              fillOrganicNode(work.ctx, { x: organ.x, y: organ.y,
                r: bodyWidth * (1.25 + assimilation * 0.75) }, phase, 0.26 + foreignness * 0.16,
                eventSeed + 1753);
              seams.push({ type: 'curve', a: a, b: b, bend: -bend * 0.45,
                width: Math.max(seam * 0.72, bodyWidth * 0.08), alpha: 0.42 });
            } else {
              var target = hostInterior.length
                ? hostInterior[Math.floor(hash(eventSeed, hostInterior.length, 1759) * hostInterior.length)]
                : a;
              var donorPoint = donorEdges[Math.floor(hash(eventSeed, donorEdges.length, 1777) * donorEdges.length)];
              if (system === 'transplant') {
                target = {
                  x: a.x * (0.38 + assimilation * 0.28) + hostCenter.x * (0.62 - assimilation * 0.28),
                  y: a.y * (0.38 + assimilation * 0.28) + hostCenter.y * (0.62 - assimilation * 0.28)
                };
              }
              var patchRadius = Math.max(3, Math.min(span * 0.62,
                span * (0.12 + foreignness * 0.045 + assimilation * 0.04)
                * (0.74 + hash(eventSeed, params.seed % 101, 1783) * 0.52)));
              var patchTurn = (hash(eventSeed, params.seed % 79, 1787) * 2 - 1)
                * (0.35 + foreignness * 0.28);
              var patchScale = Math.max(0.35, Math.min(2.8, 0.58 + foreignness * 0.26 + assimilation * 0.42));
              work.ctx.save();
              work.ctx.globalAlpha = pairStrength * (0.68 + assimilation * 0.32);
              work.ctx.beginPath();
              if (system === 'mosaic') {
                var sides = 5 + Math.floor(hash(eventSeed, 3, params.seed + 1789) * 4);
                for (var side = 0; side < sides; side++) {
                  var sideAngle = patchTurn + side * Math.PI * 2 / sides;
                  var sideRadius = patchRadius * (0.72 + hash(eventSeed, side, params.seed + 1801) * 0.48);
                  var sideX = target.x + Math.cos(sideAngle) * sideRadius;
                  var sideY = target.y + Math.sin(sideAngle) * sideRadius;
                  if (side === 0) work.ctx.moveTo(sideX, sideY); else work.ctx.lineTo(sideX, sideY);
                }
                work.ctx.closePath();
              } else {
                work.ctx.ellipse(target.x, target.y, patchRadius * (1.25 + foreignness * 0.08),
                  patchRadius * (0.72 + assimilation * 0.26), patchTurn, 0, Math.PI * 2);
              }
              work.ctx.clip();
              work.ctx.translate(target.x, target.y);
              work.ctx.rotate(patchTurn);
              work.ctx.scale(patchScale, patchScale * (0.78 + assimilation * 0.34));
              work.ctx.translate(-donorPoint.x, -donorPoint.y);
              work.ctx.drawImage(donorMask.canvas, 0, 0);
              work.ctx.restore();
              if (system === 'transplant') {
                work.ctx.globalAlpha = pairStrength * (0.5 + assimilation * 0.35);
                work.ctx.lineWidth = Math.max(1.5, patchRadius * (0.22 + assimilation * 0.18));
                traceCurve(work.ctx, a, target, bend * 0.42);
                work.ctx.stroke();
              }
              seams.push({ type: 'ellipse', x: target.x, y: target.y,
                rx: patchRadius * (system === 'mosaic' ? 1.02 : 1.27),
                ry: patchRadius * (system === 'mosaic' ? 0.92 : 0.74 + assimilation * 0.26),
                angle: patchTurn, width: Math.max(seam, patchRadius * (0.075 + (1 - assimilation) * 0.07)),
                alpha: system === 'mosaic' ? 0.76 : 0.58 });
            }
          }
        }
        work.ctx.globalAlpha = 1;
        if (seams.length) {
          work.ctx.save();
          work.ctx.globalCompositeOperation = 'destination-out';
          work.ctx.strokeStyle = '#000';
          work.ctx.lineCap = 'round';
          work.ctx.lineJoin = 'round';
          for (var seamIndex = 0; seamIndex < seams.length; seamIndex++) {
            var cut = seams[seamIndex];
            if (cut.width <= 0.05) continue;
            work.ctx.globalAlpha = Math.max(0, Math.min(0.96, cut.alpha * (0.42 + (1 - assimilation) * 0.58)));
            work.ctx.lineWidth = cut.width;
            if (cut.type === 'curve') {
              traceCurve(work.ctx, cut.a, cut.b, cut.bend);
              work.ctx.stroke();
            } else if (cut.type === 'ring') {
              work.ctx.beginPath();
              work.ctx.arc(cut.x, cut.y, cut.radius, 0, Math.PI * 2);
              work.ctx.stroke();
            } else {
              work.ctx.beginPath();
              work.ctx.ellipse(cut.x, cut.y, cut.rx, cut.ry, cut.angle, 0, Math.PI * 2);
              work.ctx.stroke();
            }
          }
          work.ctx.restore();
        }
        paintSurfaceMask(targetCtx, work.canvas, surfaceEffectColor('chimeraGraft'), 1,
          'chimera-graft-union-color');
      }

      function renderPressureStrokeLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var weightAggregate = surfaceAggregate(glyphs, 'pressureStroke', 'pressureWeight', params.pressureWeight);
        if (!weightAggregate.weight) return;
        var contrast = surfaceAggregate(glyphs, 'pressureStroke', 'pressureContrast', params.pressureContrast).value;
        var angle = surfaceAggregate(glyphs, 'pressureStroke', 'pressureAngle', params.pressureAngle).value * Math.PI / 180;
        var frequency = surfaceAggregate(glyphs, 'pressureStroke', 'pressureFrequency', params.pressureFrequency).value;
        var softness = Math.max(0.1, surfaceAggregate(glyphs, 'pressureStroke', 'pressureSoftness', params.pressureSoftness).value * pixelScale * L.s);
        var breath = Math.max(0, surfaceAggregate(glyphs, 'pressureStroke', 'pressureBreath', params.pressureBreath).value);
        var dryness = Math.max(0, Math.min(1,
          surfaceAggregate(glyphs, 'pressureStroke', 'pressureDryness', params.pressureDryness).value));
        var taper = surfaceAggregate(glyphs, 'pressureStroke', 'pressureTaper', params.pressureTaper).value;
        var mask = buildSurfaceMask(glyphs, 'pressureStroke', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'pressureStroke', coverBase);
        var maskCtx = mask.getContext('2d', { willReadFrequently: true });
        var source;
        try { source = maskCtx.getImageData(0, 0, width, height); }
        catch (error) { return; }
        var boundary = surfaceBoundaryDistance(source.data, width, height);
        if (!boundary.bounds) return;
        var work = surfaceScratch('pressure-stroke', width, height, false);
        var output = work.ctx.createImageData(width, height);
        var baseWeight = weightAggregate.value * pixelScale * L.s;
        var availableMargin = Math.max(0, Math.min(boundary.bounds[0], boundary.bounds[1],
          width - 1 - boundary.bounds[2], height - 1 - boundary.bounds[3]) - 2);
        var pressureRange = Math.max(4, params.fontSize * pixelScale * L.s * 0.58 + Math.abs(baseWeight) * 0.14);
        var phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var cos = Math.cos(angle), sin = Math.sin(angle);
        var corners = [
          [boundary.bounds[0], boundary.bounds[1]], [boundary.bounds[2], boundary.bounds[1]],
          [boundary.bounds[0], boundary.bounds[3]], [boundary.bounds[2], boundary.bounds[3]]
        ];
        var minAlong = Infinity, maxAlong = -Infinity, minAcross = Infinity, maxAcross = -Infinity;
        for (var cornerIndex = 0; cornerIndex < corners.length; cornerIndex++) {
          var cornerAlong = corners[cornerIndex][0] * cos + corners[cornerIndex][1] * sin;
          var cornerAcross = -corners[cornerIndex][0] * sin + corners[cornerIndex][1] * cos;
          minAlong = Math.min(minAlong, cornerAlong);
          maxAlong = Math.max(maxAlong, cornerAlong);
          minAcross = Math.min(minAcross, cornerAcross);
          maxAcross = Math.max(maxAcross, cornerAcross);
        }
        var alongSpan = Math.max(1, maxAlong - minAlong);
        var acrossSpan = Math.max(1, maxAcross - minAcross);
        var taperRange = params.fontSize * pixelScale * L.s * 0.72;
        for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
          var index = y * width + x;
          var along = ((x * cos + y * sin) - minAlong) / alongSpan;
          var across = ((-x * sin + y * cos) - minAcross) / acrossSpan;
          var primary = Math.sin(along * frequency * Math.PI * 2 + phase + params.seed * 0.19);
          var counter = Math.sin(across * (frequency * 0.43 + 0.7) * Math.PI * 2 - phase * 0.37 - params.seed * 0.11);
          var broadNoise = surfaceNoise01(x >> 4, y >> 4, params.seed + 823) * 2 - 1;
          var pressure = primary * 0.58 + counter * 0.25 + broadNoise * 0.17;
          var respiration = Math.sin(phase + along * Math.PI * 2 * (0.45 + breath * 0.2)
            + params.seed * 0.071) * pressureRange * breath * 0.24;
          var taperShift = (0.5 - along) * taper * taperRange;
          var localWeight = baseWeight + pressure * pressureRange * contrast + respiration + taperShift;
          if (localWeight > 0) localWeight = Math.min(localWeight, availableMargin);
          var signedDistance = boundary.inside[index] ? -boundary.distance[index] : boundary.distance[index];
          var coverage = (localWeight - signedDistance + softness) / Math.max(0.001, softness * 2);
          coverage = Math.max(0, Math.min(1, coverage));
          coverage = coverage * coverage * (3 - 2 * coverage);
          if (dryness > 0.001 && coverage > 0.002) {
            var fiber = 0.5 + 0.5 * Math.sin(across * Math.PI * (18 + frequency * 1.7)
              + along * Math.PI * 3.4 + params.seed * 0.41);
            var dryNoise = surfaceNoise01(x >> 1, y >> 1, params.seed + 1733);
            var drySignal = dryNoise * 0.62 + fiber * 0.38;
            var retention = Math.max(0, Math.min(1, 1 - dryness * 1.2 + drySignal * dryness * 1.28));
            if (dryness > 0.68 && drySignal < (dryness - 0.68) * 0.9) retention = 0;
            coverage *= retention;
          }
          if (coverage <= 0.002) continue;
          output.data[index * 4] = output.data[index * 4 + 1] = output.data[index * 4 + 2] = 255;
          output.data[index * 4 + 3] = Math.round(255 * coverage * weightAggregate.strength);
        }

        // Output pixels sample the fixed geometry and original glyph raster.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext;RC.field(output,function(px,py,rgba){var x=px-.5,y=py-.5;if(y<(0)||!(y < height))return;if(x<(0)||!(x < width))return;
          var index = Math.floor(y) * width + Math.floor(x);
          var along = ((x * cos + y * sin) - minAlong) / alongSpan;
          var across = ((-x * sin + y * cos) - minAcross) / acrossSpan;
          var primary = Math.sin(along * frequency * Math.PI * 2 + phase + params.seed * 0.19);
          var counter = Math.sin(across * (frequency * 0.43 + 0.7) * Math.PI * 2 - phase * 0.37 - params.seed * 0.11);
          var broadNoise = surfaceNoise01(x >> 4, y >> 4, params.seed + 823) * 2 - 1;
          var pressure = primary * 0.58 + counter * 0.25 + broadNoise * 0.17;
          var respiration = Math.sin(phase + along * Math.PI * 2 * (0.45 + breath * 0.2)
            + params.seed * 0.071) * pressureRange * breath * 0.24;
          var taperShift = (0.5 - along) * taper * taperRange;
          var localWeight = baseWeight + pressure * pressureRange * contrast + respiration + taperShift;
          if (localWeight > 0) localWeight = Math.min(localWeight, availableMargin);
          var signedDistance = (RC.sample(boundary.inside,width,height,x,y)>=.5) ? -RC.sample(boundary.distance,width,height,x,y) : RC.sample(boundary.distance,width,height,x,y);
          var coverage = (localWeight - signedDistance + softness) / Math.max(0.001, softness * 2);
          coverage = Math.max(0, Math.min(1, coverage));
          coverage = coverage * coverage * (3 - 2 * coverage);
          if (dryness > 0.001 && coverage > 0.002) {
            var fiber = 0.5 + 0.5 * Math.sin(across * Math.PI * (18 + frequency * 1.7)
              + along * Math.PI * 3.4 + params.seed * 0.41);
            var dryNoise = surfaceNoise01(x >> 1, y >> 1, params.seed + 1733);
            var drySignal = dryNoise * 0.62 + fiber * 0.38;
            var retention = Math.max(0, Math.min(1, 1 - dryness * 1.2 + drySignal * dryness * 1.28));
            if (dryness > 0.68 && drySignal < (dryness - 0.68) * 0.9) retention = 0;
            coverage *= retention;
          }
          if (coverage <= 0.002) return;
          rgba[0] = rgba[1] = rgba[2] = 255;
          rgba[3] = Math.round(255 * coverage * weightAggregate.strength);

        });}
        work.ctx.putImageData(output, 0, 0);
        paintSurfaceMask(targetCtx, work.canvas, surfaceEffectColor('pressureStroke'), 1, 'pressure-stroke-color');
      }

      function renderPressureStroke(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var system = surfaceChoice(glyphs, 'pressureStroke', 'pressureSystem', params.pressureSystem,
          BATCH_PARAM_OPTIONS.pressureSystem);
        if (system === 'legacy') {
          renderPressureStrokeLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        var weightAggregate = surfaceAggregate(glyphs, 'pressureStroke', 'pressureWeight', params.pressureWeight);
        if (!weightAggregate.weight) return;
        var contrast = surfaceAggregate(glyphs, 'pressureStroke', 'pressureContrast', params.pressureContrast).value;
        var angle = surfaceAggregate(glyphs, 'pressureStroke', 'pressureAngle', params.pressureAngle).value * Math.PI / 180;
        var frequency = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('pressureFrequency', surfaceAggregate(glyphs, 'pressureStroke', 'pressureFrequency', params.pressureFrequency).value, 0, 0.1, Infinity) : Math.max(0.1, surfaceAggregate(glyphs, 'pressureStroke', 'pressureFrequency', params.pressureFrequency).value));
        var softness = Math.max(0.1, surfaceAggregate(glyphs, 'pressureStroke', 'pressureSoftness', params.pressureSoftness).value * pixelScale * L.s);
        var breath = Math.max(0, surfaceAggregate(glyphs, 'pressureStroke', 'pressureBreath', params.pressureBreath).value);
        var dryness = Math.max(0, Math.min(1,
          surfaceAggregate(glyphs, 'pressureStroke', 'pressureDryness', params.pressureDryness).value));
        var taper = surfaceAggregate(glyphs, 'pressureStroke', 'pressureTaper', params.pressureTaper).value;
        var mask = buildSurfaceMask(glyphs, 'pressureStroke', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'pressureStroke', coverBase);
        var maskCtx = mask.getContext('2d', { willReadFrequently: true });
        var source;
        try { source = maskCtx.getImageData(0, 0, width, height); }
        catch (error) { return; }
        var boundary = surfaceBoundaryDistance(source.data, width, height);
        if (!boundary.bounds) return;
        var work = surfaceScratch('pressure-stroke-v30', width, height, false);
        var output = work.ctx.createImageData(width, height);
        var baseWeight = weightAggregate.value * pixelScale * L.s;
        var availableMargin = Math.max(0, Math.min(boundary.bounds[0], boundary.bounds[1],
          width - 1 - boundary.bounds[2], height - 1 - boundary.bounds[3]) - 2);
        var brushRange = Math.max(4, params.fontSize * pixelScale * L.s * 0.18 + Math.abs(baseWeight) * 0.12);
        var materialScale = Math.max(0.001, pixelScale * L.s);
        var phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var cos = Math.cos(angle), sin = Math.sin(angle);
        var corners = [
          [boundary.bounds[0], boundary.bounds[1]], [boundary.bounds[2], boundary.bounds[1]],
          [boundary.bounds[0], boundary.bounds[3]], [boundary.bounds[2], boundary.bounds[3]]
        ];
        var minAlong = Infinity, maxAlong = -Infinity, minAcross = Infinity, maxAcross = -Infinity;
        for (var cornerIndex = 0; cornerIndex < corners.length; cornerIndex++) {
          var cornerAlong = corners[cornerIndex][0] * cos + corners[cornerIndex][1] * sin;
          var cornerAcross = -corners[cornerIndex][0] * sin + corners[cornerIndex][1] * cos;
          minAlong = Math.min(minAlong, cornerAlong); maxAlong = Math.max(maxAlong, cornerAlong);
          minAcross = Math.min(minAcross, cornerAcross); maxAcross = Math.max(maxAcross, cornerAcross);
        }
        var alongSpan = Math.max(1, maxAlong - minAlong);
        var acrossSpan = Math.max(1, maxAcross - minAcross);
        var taperRange = params.fontSize * pixelScale * L.s * 0.72;
        var expansion = Math.min(availableMargin, Math.abs(baseWeight) + brushRange * Math.max(0.6, contrast));
        var minX = Math.max(0, Math.floor(boundary.bounds[0] - expansion - softness * 2));
        var maxX = Math.min(width - 1, Math.ceil(boundary.bounds[2] + expansion + softness * 2));
        var minY = Math.max(0, Math.floor(boundary.bounds[1] - expansion - softness * 2));
        var maxY = Math.min(height - 1, Math.ceil(boundary.bounds[3] + expansion + softness * 2));

        for (var y = minY; y <= maxY; y++) for (var x = minX; x <= maxX; x++) {
          var index = y * width + x;
          var along = ((x * cos + y * sin) - minAlong) / alongSpan;
          var across = ((-x * sin + y * cos) - minAcross) / acrossSpan;
          var gesturePhase = along * frequency * Math.PI * 2 + phase + params.seed * 0.19;
          var gesture = Math.sin(gesturePhase);
          var velocity = Math.abs(Math.cos(gesturePhase));
          // A periodic driver keeps both sides of the phase seam continuous;
          // multiplying wrapped phase by .31 produced a large terminal snap.
          var sideBend = Math.sin(across * Math.PI * (2.6 + frequency * 0.18) - Math.sin(phase) * 0.31 + params.seed * 0.07);
          var materialX = (x - boundary.bounds[0]) / materialScale;
          var materialY = (y - boundary.bounds[1]) / materialScale;
          var broadNoise = pressureContinuousNoise(materialX / 16, materialY / 16, params.seed + 823) * 2 - 1;
          var respiration = Math.sin(phase + along * Math.PI * 2 * (0.45 + breath * 0.2)
            + params.seed * 0.071) * brushRange * breath * 0.2;
          var taperShift = (0.5 - along) * taper * taperRange;
          var pressureSignal = gesture * 0.62 + sideBend * 0.2 + broadNoise * 0.18;
          var systemShift = 0;
          if (system === 'bristle') {
            pressureSignal = gesture * 0.42 + sideBend * 0.34 + broadNoise * 0.24;
            systemShift = brushRange * (0.04 + (1 - velocity) * 0.12);
          } else if (system === 'pool') {
            var dwell = Math.pow(1 - velocity, 1.7);
            pressureSignal = gesture * 0.24 + sideBend * 0.12 + dwell * 0.96 + broadNoise * 0.1;
            systemShift = brushRange * (0.08 + dwell * (0.18 + breath * 0.05));
          } else if (system === 'flyingWhite') {
            pressureSignal = gesture * 0.5 + sideBend * 0.24 + broadNoise * 0.26;
            systemShift = -brushRange * (0.02 + velocity * 0.05);
          }
          var localWeight = baseWeight + pressureSignal * brushRange * contrast + respiration + taperShift + systemShift;
          // Positive-weight Gesture and Pool defaults must retain a readable
          // continuous body; contrast changes its cadence, not whether a whole
          // phase of the word vanishes. Negative Base weight still permits
          // deliberate erosion across the full historical range.
          if (baseWeight >= 0 && dryness < 0.45 && (system === 'gesture' || system === 'pool')) {
            var continuityFloor = baseWeight * (system === 'pool' ? 0.42 : 0.3)
              - softness * (0.35 + dryness * 0.8);
            localWeight = Math.max(continuityFloor, localWeight);
          }
          if (Math.abs(baseWeight) < 1 && contrast < 0.7 && (system === 'gesture' || system === 'pool')) {
            var legibilityCap = params.fontSize * pixelScale * L.s
              * (system === 'pool' ? 0.055 : 0.036 + contrast * 0.018);
            localWeight = Math.min(localWeight, legibilityCap);
          }
          // The historic -120 endpoint could erase every pixel. A physical
          // brush does not end in an empty frame: the last loaded bristles
          // leave a pressure-modulated medial trace. Once erosion passes the
          // useful thinning range, converge on that dry skeleton instead of
          // letting the replacement body disappear completely.
          var erosionStart = params.fontSize * pixelScale * L.s * 0.32;
          var extremeErosion = Math.max(0, Math.min(1,
            (-baseWeight - erosionStart) / Math.max(1, params.fontSize * pixelScale * L.s * 1.35)));
          if (extremeErosion > 0) {
            var drySkeletonFloor = -Math.max(softness * 0.68,
              params.fontSize * pixelScale * L.s * 0.012);
            localWeight = Math.max(localWeight, drySkeletonFloor
              + pressureSignal * softness * (0.22 + extremeErosion * 0.38));
          }
          if (localWeight > 0) localWeight = Math.min(localWeight, availableMargin);
          var signedDistance = boundary.inside[index] ? -boundary.distance[index] : boundary.distance[index];
          var coverage = (localWeight - signedDistance + softness) / Math.max(0.001, softness * 2);
          coverage = Math.max(0, Math.min(1, coverage));
          coverage = coverage * coverage * (3 - 2 * coverage);
          if (coverage <= 0.002) continue;

          var fineNoise = surfaceNoise01(x, y, params.seed + 1741);
          var fiberNoise = pressureContinuousNoise(along * (3 + frequency * 0.35),
            across * (8 + frequency * 0.75), params.seed + 1747);
          var fiberPhase = across * Math.PI * (18 + frequency * 1.5)
            + along * Math.PI * (2.4 + breath * 0.7) + params.seed * 0.41;
          var fiber = 0.5 + 0.5 * Math.sin(fiberPhase + (fiberNoise - 0.5) * 1.8);
          var retention = 1;
          if (system === 'bristle') {
            var fan = 0.5 + 0.5 * Math.sin(fiberPhase * 0.58 + along * along * Math.PI * (3 + breath));
            retention = 0.42 + Math.pow(fiber * 0.58 + fan * 0.42, 0.72) * 0.72;
            if (fiber < 0.08 + dryness * 0.34 && fineNoise < 0.72) retention *= 0.08;
          } else if (system === 'pool') {
            var poolDwell = Math.pow(1 - velocity, 1.4);
            var poolGrain = 0.82 + pressureContinuousNoise(materialX / 4, materialY / 4, params.seed + 1753) * 0.3;
            retention = Math.min(1.28, (0.8 + poolDwell * 0.5) * poolGrain);
          } else if (system === 'flyingWhite') {
            var whiteLane = Math.pow(fiber, 2.2) * 0.72 + fineNoise * 0.28;
            var flyingDryness = Math.max(0.38, dryness);
            retention = whiteLane > 0.26 + flyingDryness * 0.24 ? 1 : 0.12 + whiteLane * 0.36;
            if (velocity > 0.82 && fiberNoise < 0.42 + flyingDryness * 0.15) retention *= 0.22;
          }
          if (dryness > 0.001 && system !== 'flyingWhite') {
            var drySignal = fineNoise * 0.54 + fiber * 0.46;
            retention *= Math.max(0, Math.min(1, 1 - dryness * 1.16 + drySignal * dryness * 1.34));
            if (dryness > 0.66 && drySignal < (dryness - 0.66) * 0.94) retention = 0;
          }
          coverage = Math.max(0, Math.min(1, coverage * retention));
          if (coverage <= 0.002) continue;
          var pixel = index * 4;
          output.data[pixel] = output.data[pixel + 1] = output.data[pixel + 2] = 255;
          output.data[pixel + 3] = Math.round(255 * coverage * weightAggregate.strength);
        }

        // Output pixels sample the fixed geometry and original glyph raster.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext;RC.field(output,function(px,py,rgba){var x=px-.5,y=py-.5;if(y<(minY)||!(y <= maxY))return;if(x<(minX)||!(x <= maxX))return;
          var index = Math.floor(y) * width + Math.floor(x);
          var along = ((x * cos + y * sin) - minAlong) / alongSpan;
          var across = ((-x * sin + y * cos) - minAcross) / acrossSpan;
          var gesturePhase = along * frequency * Math.PI * 2 + phase + params.seed * 0.19;
          var gesture = Math.sin(gesturePhase);
          var velocity = Math.abs(Math.cos(gesturePhase));
          // A periodic driver keeps both sides of the phase seam continuous;
          // multiplying wrapped phase by .31 produced a large terminal snap.
          var sideBend = Math.sin(across * Math.PI * (2.6 + frequency * 0.18) - Math.sin(phase) * 0.31 + params.seed * 0.07);
          var materialX = (x - boundary.bounds[0]) / materialScale;
          var materialY = (y - boundary.bounds[1]) / materialScale;
          var broadNoise = pressureContinuousNoise(materialX / 16, materialY / 16, params.seed + 823) * 2 - 1;
          var respiration = Math.sin(phase + along * Math.PI * 2 * (0.45 + breath * 0.2)
            + params.seed * 0.071) * brushRange * breath * 0.2;
          var taperShift = (0.5 - along) * taper * taperRange;
          var pressureSignal = gesture * 0.62 + sideBend * 0.2 + broadNoise * 0.18;
          var systemShift = 0;
          if (system === 'bristle') {
            pressureSignal = gesture * 0.42 + sideBend * 0.34 + broadNoise * 0.24;
            systemShift = brushRange * (0.04 + (1 - velocity) * 0.12);
          } else if (system === 'pool') {
            var dwell = Math.pow(1 - velocity, 1.7);
            pressureSignal = gesture * 0.24 + sideBend * 0.12 + dwell * 0.96 + broadNoise * 0.1;
            systemShift = brushRange * (0.08 + dwell * (0.18 + breath * 0.05));
          } else if (system === 'flyingWhite') {
            pressureSignal = gesture * 0.5 + sideBend * 0.24 + broadNoise * 0.26;
            systemShift = -brushRange * (0.02 + velocity * 0.05);
          }
          var localWeight = baseWeight + pressureSignal * brushRange * contrast + respiration + taperShift + systemShift;
          // Positive-weight Gesture and Pool defaults must retain a readable
          // continuous body; contrast changes its cadence, not whether a whole
          // phase of the word vanishes. Negative Base weight still permits
          // deliberate erosion across the full historical range.
          if (baseWeight >= 0 && dryness < 0.45 && (system === 'gesture' || system === 'pool')) {
            var continuityFloor = baseWeight * (system === 'pool' ? 0.42 : 0.3)
              - softness * (0.35 + dryness * 0.8);
            localWeight = Math.max(continuityFloor, localWeight);
          }
          if (Math.abs(baseWeight) < 1 && contrast < 0.7 && (system === 'gesture' || system === 'pool')) {
            var legibilityCap = params.fontSize * pixelScale * L.s
              * (system === 'pool' ? 0.055 : 0.036 + contrast * 0.018);
            localWeight = Math.min(localWeight, legibilityCap);
          }
          // The historic -120 endpoint could erase every pixel. A physical
          // brush does not end in an empty frame: the last loaded bristles
          // leave a pressure-modulated medial trace. Once erosion passes the
          // useful thinning range, converge on that dry skeleton instead of
          // letting the replacement body disappear completely.
          var erosionStart = params.fontSize * pixelScale * L.s * 0.32;
          var extremeErosion = Math.max(0, Math.min(1,
            (-baseWeight - erosionStart) / Math.max(1, params.fontSize * pixelScale * L.s * 1.35)));
          if (extremeErosion > 0) {
            var drySkeletonFloor = -Math.max(softness * 0.68,
              params.fontSize * pixelScale * L.s * 0.012);
            localWeight = Math.max(localWeight, drySkeletonFloor
              + pressureSignal * softness * (0.22 + extremeErosion * 0.38));
          }
          if (localWeight > 0) localWeight = Math.min(localWeight, availableMargin);
          var signedDistance = (RC.sample(boundary.inside,width,height,x,y)>=.5) ? -RC.sample(boundary.distance,width,height,x,y) : RC.sample(boundary.distance,width,height,x,y);
          var coverage = (localWeight - signedDistance + softness) / Math.max(0.001, softness * 2);
          coverage = Math.max(0, Math.min(1, coverage));
          coverage = coverage * coverage * (3 - 2 * coverage);
          if (coverage <= 0.002) return;

          var fineNoise = surfaceNoise01(Math.floor(x), Math.floor(y), params.seed + 1741);
          var fiberNoise = pressureContinuousNoise(along * (3 + frequency * 0.35),
            across * (8 + frequency * 0.75), params.seed + 1747);
          var fiberPhase = across * Math.PI * (18 + frequency * 1.5)
            + along * Math.PI * (2.4 + breath * 0.7) + params.seed * 0.41;
          var fiber = 0.5 + 0.5 * Math.sin(fiberPhase + (fiberNoise - 0.5) * 1.8);
          var retention = 1;
          if (system === 'bristle') {
            var fan = 0.5 + 0.5 * Math.sin(fiberPhase * 0.58 + along * along * Math.PI * (3 + breath));
            retention = 0.42 + Math.pow(fiber * 0.58 + fan * 0.42, 0.72) * 0.72;
            if (fiber < 0.08 + dryness * 0.34 && fineNoise < 0.72) retention *= 0.08;
          } else if (system === 'pool') {
            var poolDwell = Math.pow(1 - velocity, 1.4);
            var poolGrain = 0.82 + pressureContinuousNoise(materialX / 4, materialY / 4, params.seed + 1753) * 0.3;
            retention = Math.min(1.28, (0.8 + poolDwell * 0.5) * poolGrain);
          } else if (system === 'flyingWhite') {
            var whiteLane = Math.pow(fiber, 2.2) * 0.72 + fineNoise * 0.28;
            var flyingDryness = Math.max(0.38, dryness);
            retention = whiteLane > 0.26 + flyingDryness * 0.24 ? 1 : 0.12 + whiteLane * 0.36;
            if (velocity > 0.82 && fiberNoise < 0.42 + flyingDryness * 0.15) retention *= 0.22;
          }
          if (dryness > 0.001 && system !== 'flyingWhite') {
            var drySignal = fineNoise * 0.54 + fiber * 0.46;
            retention *= Math.max(0, Math.min(1, 1 - dryness * 1.16 + drySignal * dryness * 1.34));
            if (dryness > 0.66 && drySignal < (dryness - 0.66) * 0.94) retention = 0;
          }
          coverage = Math.max(0, Math.min(1, coverage * retention));
          if (coverage <= 0.002) return;
          var pixel = index * 4;
          rgba[0] = rgba[1] = rgba[2] = 255;
          rgba[3] = Math.round(255 * coverage * weightAggregate.strength);

        });}
        work.ctx.putImageData(output, 0, 0);
        paintSurfaceMask(targetCtx, work.canvas, surfaceEffectColor('pressureStroke'), 1, 'pressure-stroke-v30-color');
      }

      function renderCellFractureLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var cellAggregate = surfaceAggregate(glyphs, 'cellFracture', 'fractureCell', params.fractureCell);
        if (!cellAggregate.weight) return;
        var scatter = surfaceAggregate(glyphs, 'cellFracture', 'fractureScatter', params.fractureScatter).value * pixelScale * L.s;
        var gap = surfaceAggregate(glyphs, 'cellFracture', 'fractureGap', params.fractureGap).value * pixelScale * L.s;
        var spin = surfaceAggregate(glyphs, 'cellFracture', 'fractureSpin', params.fractureSpin).value * Math.PI / 180;
        var mask = buildSurfaceMask(glyphs, 'cellFracture', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'cellFracture', coverBase);
        var maskCtx = mask.getContext('2d', { willReadFrequently: true });
        var data;
        try { data = maskCtx.getImageData(0, 0, width, height).data; }
        catch (error) { return; }
        var cell = Math.max(3, cellAggregate.value * pixelScale * L.s);
        var estimate = width * height / Math.max(1, cell * cell);
        if (estimate > 3200) cell *= Math.sqrt(estimate / 3200);
        var cols = Math.ceil(width / cell) + 2;
        var rows = Math.ceil(height / cell) + 2;
        var points = new Array(rows);
        for (var row = 0; row < rows; row++) {
          points[row] = new Array(cols);
          for (var col = 0; col < cols; col++) {
            var jitterX = (hash(col, row, params.seed + 757) * 2 - 1) * cell * 0.28;
            var jitterY = (hash(col, row, params.seed + 761) * 2 - 1) * cell * 0.28;
            points[row][col] = { x: (col - 1) * cell + jitterX, y: (row - 1) * cell + jitterY };
          }
        }
        var nodes = surfaceNodesForGlyphs(glyphs, 'cellFracture', 160, pixelScale, L, 0, 0, 0);
        var work = surfaceScratch('cell-fracture', width, height, false);
        var ctx = work.ctx;
        ctx.fillStyle = surfaceEffectColor('cellFracture');
        ctx.strokeStyle = surfaceEffectColor('cellFracture');
        var phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var triangleIndex = 0;
        function paintTriangle(a, b, c) {
          var centerX = (a.x + b.x + c.x) / 3;
          var centerY = (a.y + b.y + c.y) / 3;
          var sampleX = Math.max(0, Math.min(width - 1, Math.round(centerX)));
          var sampleY = Math.max(0, Math.min(height - 1, Math.round(centerY)));
          var alpha = sampleMaskNeighborhoodAlpha(data, width, height, sampleX, sampleY, cell * 0.42);
          if (alpha < 0.03) { triangleIndex++; return; }
          var nearest = null, nearestDistance = Infinity;
          for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
            var ndx = centerX - nodes[nodeIndex].x, ndy = centerY - nodes[nodeIndex].y;
            var nd = ndx * ndx + ndy * ndy;
            if (nd < nearestDistance) { nearestDistance = nd; nearest = nodes[nodeIndex]; }
          }
          var vx = nearest ? centerX - nearest.x : centerX - width / 2;
          var vy = nearest ? centerY - nearest.y : centerY - height / 2;
          var distance = Math.max(0.001, Math.sqrt(vx * vx + vy * vy));
          vx /= distance; vy /= distance;
          var randomAngle = (hash(triangleIndex, 3, params.seed + 769) * 2 - 1) * Math.PI;
          vx = vx * 0.68 + Math.cos(randomAngle) * 0.32;
          vy = vy * 0.68 + Math.sin(randomAngle) * 0.32;
          var pulse = compositionState.enabled ? 0.62 + Math.sin(phase + triangleIndex * 0.41) * 0.38 : 1;
          var travel = scatter * alpha * (0.28 + hash(triangleIndex, 7, params.seed + 773) * 0.72) * pulse;
          var dx = vx * travel, dy = vy * travel;
          var rotation = spin * (hash(triangleIndex, 11, params.seed + 787) * 2 - 1) * alpha * pulse;
          var shrink = Math.max(0.04, 1 - gap / Math.max(2, cell * 0.72));
          var cosR = Math.cos(rotation), sinR = Math.sin(rotation);
          function moved(point) {
            var lx = (point.x - centerX) * shrink;
            var ly = (point.y - centerY) * shrink;
            return { x: centerX + lx * cosR - ly * sinR + dx, y: centerY + lx * sinR + ly * cosR + dy };
          }
          var pa = moved(a), pb = moved(b), pc = moved(c);
          ctx.globalAlpha = alpha * (0.56 + hash(triangleIndex, 13, params.seed + 797) * 0.44);
          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.lineTo(pc.x, pc.y); ctx.closePath();
          ctx.fill();
          if (gap < 0.75 && cell > 9) {
            ctx.globalAlpha *= 0.42;
            ctx.lineWidth = Math.max(0.25, cell * 0.025);
            ctx.stroke();
          }
          triangleIndex++;
        }
        for (var r = 0; r < rows - 1; r++) for (var c = 0; c < cols - 1; c++) {
          var p00 = points[r][c], p10 = points[r][c + 1], p01 = points[r + 1][c], p11 = points[r + 1][c + 1];
          if (hash(c, r, params.seed + 809) < 0.5) {
            paintTriangle(p00, p10, p11); paintTriangle(p00, p11, p01);
          } else {
            paintTriangle(p00, p10, p01); paintTriangle(p10, p11, p01);
          }
        }
        ctx.globalAlpha = 1;
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderRibbonEchoLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var depthAggregate = surfaceAggregate(glyphs, 'ribbonEcho', 'ribbonDepth', params.ribbonDepth);
        if (!depthAggregate.weight) return;
        var steps = Math.max(1, Math.round(surfaceAggregate(glyphs, 'ribbonEcho', 'ribbonSteps', params.ribbonSteps).value));
        var twist = surfaceAggregate(glyphs, 'ribbonEcho', 'ribbonTwist', params.ribbonTwist).value * Math.PI / 180;
        var fade = surfaceAggregate(glyphs, 'ribbonEcho', 'ribbonFade', params.ribbonFade).value;
        var mask = buildSurfaceMask(glyphs, 'ribbonEcho', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'ribbonEcho', coverBase);
        var work = surfaceScratch('ribbon-echo', width, height, false);
        var ctx = work.ctx;
        var phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var depth = depthAggregate.value * pixelScale * L.s;
        var direction = 0.36 + phase;
        var cx = width / 2, cy = height / 2;
        steps = Math.min(96, steps);
        for (var slice = steps; slice >= 1; slice--) {
          var t = slice / steps;
          var eased = t * t * (3 - 2 * t);
          var opacity = depthAggregate.strength * (0.08 + (1 - fade * t) * 0.38) / Math.max(1, Math.sqrt(steps / 9));
          ctx.save();
          ctx.globalAlpha = Math.max(0.012, opacity);
          ctx.translate(cx + Math.cos(direction) * depth * eased, cy + Math.sin(direction) * depth * eased * 0.58);
          ctx.rotate(twist * eased + (compositionState.enabled ? Math.sin(phase + t * Math.PI) * 0.08 : 0));
          ctx.scale(1 + Math.abs(depth) / Math.max(width, height) * t * 0.12, 1 - Math.min(0.24, Math.abs(depth) / Math.max(width, height) * t * 0.08));
          ctx.translate(-cx, -cy);
          ctx.drawImage(mask, 0, 0);
          ctx.restore();
        }
        ctx.globalCompositeOperation = 'source-in';
        ctx.globalAlpha = 1;
        ctx.fillStyle = surfaceEffectColor('ribbonEcho');
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = 'source-over';
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderImpactFractureV31(workCtx, cutsCtx, edgesCtx, glyphMask, glyph,
        glyphIndex, pixelScale, L, energy, cell, scatter, gap, spin, phase, inkPoints) {
        var extent = fractureGlyphExtent(glyph, pixelScale, L);
        var origin = fractureSnapOriginToInk(
          fractureImpactOrigin(glyph, glyphIndex, pixelScale, L), inkPoints, extent);
        var rings = Math.min(5, 2 + Math.round(energy * 0.75));
        var sectors = Math.min(24, 8 + Math.round(energy * 3.2));
        var startOffset = hash(glyphIndex, params.seed % 79, 2323) * Math.PI * 2 + phase * 0.035;
        var fragmentScale = Math.max(0.48, 1 - gap / Math.max(5, cell * 1.7));
        for (var ring = 0; ring < rings; ring++) {
          var ringT = (ring + 1) / rings;
          var inner = ring / rings * extent * 1.18;
          var outer = ringT * extent * 1.18;
          var ringSectors = sectors + ring * 2;
          for (var sector = 0; sector < ringSectors; sector++) {
            var angularJitter = (hash(sector, ring + glyphIndex * 17, params.seed + 2333) * 2 - 1)
              * Math.PI / ringSectors * 0.24;
            var start = startOffset + sector / ringSectors * Math.PI * 2 + angularJitter;
            var end = startOffset + (sector + 0.9) / ringSectors * Math.PI * 2 + angularJitter;
            var mid = (start + end) * 0.5;
            var roughness = (hash(sector, ring, params.seed + 2339) * 2 - 1) * (0.035 + energy * 0.012);
            var travel = scatter * Math.pow(ringT, 1.35) * (0.12 + energy * 0.19)
              * (0.42 + hash(sector, ring, params.seed + 2341) * 0.74);
            var pulse = 0.8 + Math.sin(phase + sector * 0.47 + ring * 0.81) * 0.2;
            var moveX = Math.cos(mid) * travel * pulse;
            var moveY = Math.sin(mid) * travel * pulse;
            var pivotRadius = (inner + outer) * 0.5;
            var pivotX = origin.x + Math.cos(mid) * pivotRadius;
            var pivotY = origin.y + Math.sin(mid) * pivotRadius;
            var rotation = spin * (hash(sector, ring, params.seed + 2347) * 2 - 1)
              * ringT * (0.045 + energy * 0.035);
            drawTransformedFractureFragment(workCtx, glyphMask.canvas, pivotX, pivotY,
              moveX, moveY, rotation, fragmentScale, function (pathCtx) {
                traceFracturePlate(pathCtx, origin.x, origin.y, inner, outer, start, end, roughness);
              });
          }
        }

        var rayCount = Math.min(18, 6 + Math.round(energy * 2.8));
        cutsCtx.lineCap = edgesCtx.lineCap = 'round';
        cutsCtx.lineJoin = edgesCtx.lineJoin = 'round';
        for (var ray = 0; ray < rayCount; ray++) {
          var angle = startOffset + ray / rayCount * Math.PI * 2
            + (hash(ray, glyphIndex, params.seed + 2351) * 2 - 1) * 0.19;
          var reach = extent * (0.74 + energy * 0.13 + hash(ray, glyphIndex, params.seed + 2357) * 0.32);
          var segments = 4 + Math.min(4, Math.round(energy));
          var points = [{ x: origin.x, y: origin.y }];
          for (var segment = 1; segment <= segments; segment++) {
            var t = segment / segments;
            var lateral = (hash(ray, segment, params.seed + 2371) * 2 - 1) * cell * (0.08 + energy * 0.035);
            points.push({
              x: origin.x + Math.cos(angle) * reach * t - Math.sin(angle) * lateral,
              y: origin.y + Math.sin(angle) * reach * t + Math.cos(angle) * lateral
            });
          }
          cutsCtx.globalAlpha = 0.76 + hash(ray, glyphIndex, params.seed + 2377) * 0.22;
          cutsCtx.lineWidth = Math.max(0.9, gap * 0.68 + cell * (0.026 + energy * 0.008));
          strokeFracturePolyline(cutsCtx, points);
          edgesCtx.globalAlpha = 0.28 + hash(ray, 3, params.seed + 2381) * 0.32;
          edgesCtx.lineWidth = Math.max(0.45, cell * 0.022);
          strokeFracturePolyline(edgesCtx, points);
          if (energy > 0.8 && ray % 2 === 0) {
            var branchPoint = points[Math.min(points.length - 2, 2 + (ray % 2))];
            var branchAngle = angle + (ray % 4 < 2 ? 1 : -1) * (0.38 + energy * 0.07);
            var branchReach = reach * (0.18 + hash(ray, 5, params.seed + 2389) * 0.18);
            var branch = [branchPoint, {
              x: branchPoint.x + Math.cos(branchAngle) * branchReach,
              y: branchPoint.y + Math.sin(branchAngle) * branchReach
            }];
            cutsCtx.globalAlpha = 0.68;
            cutsCtx.lineWidth *= 0.68;
            strokeFracturePolyline(cutsCtx, branch);
          }
        }
        var pitRadius = Math.max(1.8, cell * (0.08 + energy * 0.035));
        cutsCtx.globalAlpha = Math.min(0.92, 0.58 + energy * 0.08);
        cutsCtx.beginPath(); cutsCtx.arc(origin.x, origin.y, pitRadius, 0, Math.PI * 2); cutsCtx.fill();
        edgesCtx.globalAlpha = 0.72;
        edgesCtx.lineWidth = Math.max(0.7, cell * 0.045);
        edgesCtx.beginPath(); edgesCtx.arc(origin.x, origin.y, pitRadius * 1.8, 0, Math.PI * 2); edgesCtx.stroke();
        edgesCtx.globalAlpha = 0.18;
        edgesCtx.lineWidth = Math.max(0.5, cell * 0.03);
        edgesCtx.beginPath(); edgesCtx.arc(origin.x, origin.y, extent * 0.22, 0, Math.PI * 2); edgesCtx.stroke();
        edgesCtx.beginPath(); edgesCtx.arc(origin.x, origin.y, extent * 0.36, 0, Math.PI * 2); edgesCtx.stroke();
      }

      function renderFaultFractureV31(workCtx, cutsCtx, edgesCtx, mask, bounds,
        energy, cell, scatter, gap, spin, phase) {
        var centerX = (bounds[0] + bounds[2]) * 0.5;
        var centerY = (bounds[1] + bounds[3]) * 0.5;
        var boundsWidth = bounds[2] - bounds[0] + 1;
        var boundsHeight = bounds[3] - bounds[1] + 1;
        var extent = Math.hypot(boundsWidth, boundsHeight) * 0.7 + cell * 2;
        var angle = 0.84 + (hash(params.seed % 109, 7, 2411) * 2 - 1) * 0.28 + Math.sin(phase) * 0.04;
        var tangentX = Math.cos(angle), tangentY = Math.sin(angle);
        var normalX = -tangentY, normalY = tangentX;
        var spacing = Math.max(5, cell * Math.max(0.48, 0.78 - energy * 0.055));
        var stripCount = Math.min(72, Math.ceil(extent / spacing) + 2);
        var faultSeparation = cell * (2.7 + energy * 0.35);
        var seamBand = Math.max(spacing, cell * (1.15 + energy * 0.28));
        // Strip width already opens the fault. Scaling every strip around the
        // global centre would shrink the whole composition into a ghost copy.
        var fragmentScale = 1;
        for (var strip = -stripCount; strip <= stripCount; strip++) {
          var offset = strip * spacing;
          var stripWidth = Math.max(1.2, spacing - gap * (0.72 + energy * 0.08));
          var faultIndex = Math.max(-1, Math.min(1, Math.round(offset / faultSeparation)));
          var faultDelta = offset - faultIndex * faultSeparation;
          var side = faultDelta < 0 ? -1 : 1;
          var seamDistance = Math.abs(faultDelta) / seamBand;
          var seamInfluence = Math.pow(Math.max(0, 1 - seamDistance), 1.35);
          var faultPolarity = faultIndex === 0 ? 1 : -1;
          var slip = scatter * side * faultPolarity * (0.22 + energy * 0.24)
            * (0.54 + hash(strip, params.seed % 71, 2417) * 0.72) * seamInfluence;
          var opening = side * (gap + cell * 0.05) * (0.46 + energy * 0.12) * seamInfluence;
          var moveX = tangentX * slip + normalX * opening;
          var moveY = tangentY * slip + normalY * opening;
          var rotation = spin * side * (0.012 + energy * 0.012)
            * (0.72 + seamDistance * 0.28) * seamInfluence;
          var localCenterX = centerX + normalX * offset;
          var localCenterY = centerY + normalY * offset;
          drawTransformedFractureFragment(workCtx, mask, centerX, centerY,
            moveX, moveY, rotation, fragmentScale, function (pathCtx) {
              pathCtx.moveTo(localCenterX - tangentX * extent - normalX * stripWidth * 0.5,
                localCenterY - tangentY * extent - normalY * stripWidth * 0.5);
              pathCtx.lineTo(localCenterX + tangentX * extent - normalX * stripWidth * 0.5,
                localCenterY + tangentY * extent - normalY * stripWidth * 0.5);
              pathCtx.lineTo(localCenterX + tangentX * extent + normalX * stripWidth * 0.5,
                localCenterY + tangentY * extent + normalY * stripWidth * 0.5);
              pathCtx.lineTo(localCenterX - tangentX * extent + normalX * stripWidth * 0.5,
                localCenterY - tangentY * extent + normalY * stripWidth * 0.5);
            });
        }

        var seamPoints = [];
        var seamSegments = 9;
        for (var seamIndex = 0; seamIndex <= seamSegments; seamIndex++) {
          var seamT = seamIndex / seamSegments * 2 - 1;
          var seamNoise = (hash(seamIndex, params.seed % 67, 2423) * 2 - 1) * cell * (0.16 + energy * 0.06);
          seamPoints.push({
            x: centerX + tangentX * extent * seamT + normalX * seamNoise,
            y: centerY + tangentY * extent * seamT + normalY * seamNoise
          });
        }
        cutsCtx.globalAlpha = 0.96;
        cutsCtx.lineCap = cutsCtx.lineJoin = 'round';
        cutsCtx.lineWidth = Math.max(2.4, gap * 1.65 + cell * (0.09 + energy * 0.02));
        var mainSeamWidth = cutsCtx.lineWidth;
        strokeFracturePolyline(cutsCtx, seamPoints);
        edgesCtx.lineCap = edgesCtx.lineJoin = 'round';
        edgesCtx.globalAlpha = 0.72;
        edgesCtx.lineWidth = Math.max(0.65, cell * 0.045);
        for (var seamSide = -1; seamSide <= 1; seamSide += 2) {
          var edgePoints = [];
          for (var edgeIndex = 0; edgeIndex < seamPoints.length; edgeIndex++) edgePoints.push({
            x: seamPoints[edgeIndex].x + normalX * seamSide * cutsCtx.lineWidth * 0.66,
            y: seamPoints[edgeIndex].y + normalY * seamSide * cutsCtx.lineWidth * 0.66
          });
          strokeFracturePolyline(edgesCtx, edgePoints);
        }
        for (var faultLine = -1; faultLine <= 1; faultLine += 2) {
          var secondaryPoints = [];
          for (var secondaryIndex = 0; secondaryIndex < seamPoints.length; secondaryIndex++) {
            secondaryPoints.push({
              x: seamPoints[secondaryIndex].x + normalX * faultLine * faultSeparation,
              y: seamPoints[secondaryIndex].y + normalY * faultLine * faultSeparation
            });
          }
          cutsCtx.globalAlpha = 0.74;
          cutsCtx.lineWidth = Math.max(1.4, mainSeamWidth * 0.62);
          strokeFracturePolyline(cutsCtx, secondaryPoints);
          edgesCtx.globalAlpha = 0.46;
          edgesCtx.lineWidth = Math.max(0.5, cutsCtx.lineWidth * 0.42);
          strokeFracturePolyline(edgesCtx, secondaryPoints);
        }
        var splayCount = Math.min(9, 3 + Math.round(energy * 1.4));
        for (var splay = 0; splay < splayCount; splay++) {
          var anchorIndex = 2 + Math.floor(hash(splay, 4, params.seed + 2437) * (seamPoints.length - 4));
          var anchor = seamPoints[anchorIndex];
          var splayAngle = angle + (splay % 2 ? 1 : -1) * (0.35 + hash(splay, 8, params.seed + 2441) * 0.34);
          var splayLength = cell * (1.4 + energy * 0.8 + hash(splay, 3, params.seed + 2447));
          cutsCtx.globalAlpha = 0.68;
          cutsCtx.lineWidth = Math.max(0.7, mainSeamWidth * 0.48);
          strokeFracturePolyline(cutsCtx, [anchor, {
            x: anchor.x + Math.cos(splayAngle) * splayLength,
            y: anchor.y + Math.sin(splayAngle) * splayLength
          }]);
        }
      }

      function renderCrystalFractureV31(workCtx, cutsCtx, edgesCtx, glyphMask, glyph,
        glyphIndex, pixelScale, L, energy, cell, scatter, gap, spin, phase) {
        var center = surfaceGlyphNode(glyph, 'cellFracture', pixelScale, L, 0, 0, 0,
          glyphIndex, 0.5, 0.5, 1);
        var extent = fractureGlyphExtent(glyph, pixelScale, L);
        var lattice = Math.max(7, cell * Math.max(0.72, 1.14 - energy * 0.075));
        var rowHeight = lattice * 0.82;
        var grid = Math.min(5, Math.ceil(extent / Math.max(5, lattice) * 0.72) + 2);
        var angleChoices = [-Math.PI / 6, 0, Math.PI / 6];
        var baseAngle = angleChoices[Math.floor(hash(glyphIndex, params.seed % 73, 2459) * angleChoices.length)]
          + spin * 0.035 + Math.sin(phase + glyphIndex) * 0.025;
        var cosA = Math.cos(baseAngle), sinA = Math.sin(baseAngle);
        var fragmentScale = Math.max(0.5, 1 - gap / Math.max(5, lattice * 1.7));
        function point(localX, localY) {
          return {
            x: center.x + localX * cosA - localY * sinA,
            y: center.y + localX * sinA + localY * cosA
          };
        }
        for (var row = -grid; row <= grid; row++) {
          for (var column = -grid; column <= grid; column++) {
            var localX = (column + (row & 1) * 0.5) * lattice;
            var localY = row * rowHeight;
            var localPoints = [
              [localX - lattice * 0.55, localY + rowHeight * 0.5],
              [localX, localY - rowHeight * 0.5],
              [localX + lattice * 0.55, localY + rowHeight * 0.5],
              [localX, localY + rowHeight * 1.08]
            ];
            for (var triangle = 0; triangle < 2; triangle++) {
              var p0 = point(localPoints[0][0], localPoints[0][1]);
              var p1 = point(localPoints[triangle ? 2 : 1][0], localPoints[triangle ? 2 : 1][1]);
              var p2 = point(localPoints[triangle ? 3 : 2][0], localPoints[triangle ? 3 : 2][1]);
              var pivotX = (p0.x + p1.x + p2.x) / 3;
              var pivotY = (p0.y + p1.y + p2.y) / 3;
              var plane = Math.abs(row + column + triangle) % 3;
              var planeAngle = baseAngle + plane * Math.PI / 3;
              var radial = Math.min(1, Math.hypot(pivotX - center.x, pivotY - center.y) / Math.max(1, extent));
              var travel = scatter * (0.06 + energy * 0.085) * (0.42 + radial * 0.72)
                * (0.44 + hash(row + triangle, column, params.seed + 2473) * 0.72);
              var moveX = Math.cos(planeAngle) * travel * (triangle ? -1 : 1);
              var moveY = Math.sin(planeAngle) * travel * (triangle ? -1 : 1);
              var rotation = spin * (hash(row, column + triangle, params.seed + 2477) * 2 - 1)
                * (0.018 + energy * 0.018);
              drawTransformedFractureFragment(workCtx, glyphMask.canvas, pivotX, pivotY,
                moveX, moveY, rotation, fragmentScale, function (pathCtx) {
                  pathCtx.moveTo(p0.x, p0.y); pathCtx.lineTo(p1.x, p1.y); pathCtx.lineTo(p2.x, p2.y);
                });
              var facetCode = Math.abs(row * 11 + column * 7 + triangle + glyphIndex);
              if (facetCode % 7 === 0) {
                cutsCtx.save();
                cutsCtx.globalAlpha = 0.46;
                cutsCtx.beginPath();
                cutsCtx.moveTo(p0.x, p0.y); cutsCtx.lineTo(p1.x, p1.y); cutsCtx.lineTo(p2.x, p2.y);
                cutsCtx.closePath(); cutsCtx.fill();
                cutsCtx.restore();
              } else if (facetCode % 3 === 0) {
                edgesCtx.save();
                edgesCtx.globalAlpha = 0.34;
                edgesCtx.lineWidth = Math.max(0.45, lattice * 0.022);
                edgesCtx.beginPath();
                edgesCtx.moveTo(p0.x, p0.y); edgesCtx.lineTo(p1.x, p1.y); edgesCtx.lineTo(p2.x, p2.y);
                edgesCtx.closePath(); edgesCtx.stroke();
                edgesCtx.restore();
              }
            }
          }
        }

        cutsCtx.lineCap = 'square';
        cutsCtx.globalAlpha = 0.8;
        cutsCtx.lineWidth = Math.max(0.8, gap * 0.54 + lattice * 0.035);
        edgesCtx.lineCap = 'square';
        edgesCtx.globalAlpha = 0.36;
        edgesCtx.lineWidth = Math.max(0.45, lattice * 0.018);
        for (var family = 0; family < 3; family++) {
          var familyAngle = baseAngle + family * Math.PI / 3;
          var familyTangentX = Math.cos(familyAngle), familyTangentY = Math.sin(familyAngle);
          var familyNormalX = -familyTangentY, familyNormalY = familyTangentX;
          for (var planeOffset = -grid; planeOffset <= grid; planeOffset++) {
            var offset = planeOffset * lattice * 0.9;
            var start = {
              x: center.x + familyNormalX * offset - familyTangentX * extent,
              y: center.y + familyNormalY * offset - familyTangentY * extent
            };
            var end = {
              x: center.x + familyNormalX * offset + familyTangentX * extent,
              y: center.y + familyNormalY * offset + familyTangentY * extent
            };
            if ((planeOffset + family + glyphIndex) % 2 === 0) strokeFracturePolyline(cutsCtx, [start, end]);
            else strokeFracturePolyline(edgesCtx, [start, end]);
          }
        }
      }

      function renderSpallFractureV31(workCtx, cutsCtx, edgesCtx, glyphMask, glyph,
        glyphIndex, pixelScale, L, energy, cell, scatter, gap, spin, phase, inkPoints) {
        var extent = fractureGlyphExtent(glyph, pixelScale, L);
        var origin = fractureSnapOriginToInk(
          fractureImpactOrigin(glyph, glyphIndex, pixelScale, L), inkPoints, extent);
        var rings = Math.min(9, 3 + Math.round(energy * 1.45));
        var fragmentScale = Math.max(0.46, 1 - gap / Math.max(5, cell * 1.55));
        var rotationOffset = hash(glyphIndex, params.seed % 89, 2503) * Math.PI * 2 + phase * 0.025;
        for (var ring = 0; ring < rings; ring++) {
          var ringT = (ring + 1) / rings;
          var inner = ring / rings * extent * 1.22;
          var outer = ringT * extent * 1.22;
          var segments = Math.min(24, 5 + ring * 2 + Math.round(energy * 1.2));
          for (var segment = 0; segment < segments; segment++) {
            var start = rotationOffset + segment / segments * Math.PI * 2;
            var end = rotationOffset + (segment + 0.82 - Math.min(0.18, gap / Math.max(4, cell) * 0.04))
              / segments * Math.PI * 2;
            var mid = (start + end) * 0.5;
            var roughness = (hash(segment, ring, params.seed + 2507) * 2 - 1) * (0.05 + ringT * 0.035);
            var travel = scatter * Math.pow(ringT, 1.65) * (0.12 + energy * 0.16)
              * (0.4 + hash(segment, ring, params.seed + 2521) * 0.78);
            var pivotRadius = (inner + outer) * 0.5;
            var pivotX = origin.x + Math.cos(mid) * pivotRadius;
            var pivotY = origin.y + Math.sin(mid) * pivotRadius;
            var pulse = 0.84 + Math.sin(phase + ring * 0.77 + segment * 0.31) * 0.16;
            drawTransformedFractureFragment(workCtx, glyphMask.canvas, pivotX, pivotY,
              Math.cos(mid) * travel * pulse, Math.sin(mid) * travel * pulse,
              spin * (hash(segment, ring, params.seed + 2531) * 2 - 1) * ringT * (0.035 + energy * 0.025),
              fragmentScale, function (pathCtx) {
                traceFracturePlate(pathCtx, origin.x, origin.y, inner, outer, start, end, roughness);
              });
          }
        }
        var pitRadius = Math.max(3.6, cell * (0.28 + energy * 0.09));
        cutsCtx.globalAlpha = Math.min(0.98, 0.72 + energy * 0.06);
        cutsCtx.beginPath(); cutsCtx.arc(origin.x, origin.y, pitRadius, 0, Math.PI * 2); cutsCtx.fill();
        cutsCtx.lineCap = 'round';
        cutsCtx.lineWidth = Math.max(1.4, gap * 1.1 + cell * 0.085);
        edgesCtx.lineCap = 'round';
        edgesCtx.lineWidth = Math.max(0.55, cell * 0.026);
        for (var ringLine = 1; ringLine <= rings; ringLine++) {
          var ringRadius = ringLine / rings * extent * 1.04;
          cutsCtx.globalAlpha = 0.42 + ringLine / rings * 0.42;
          cutsCtx.beginPath();
          var scallops = 14 + ringLine * 2;
          for (var scallop = 0; scallop <= scallops; scallop++) {
            var a = scallop / scallops * Math.PI * 2 + rotationOffset;
            var rr = ringRadius * (1 + Math.sin(a * (3 + ringLine % 4) + glyphIndex) * 0.035);
            var x = origin.x + Math.cos(a) * rr, y = origin.y + Math.sin(a) * rr;
            if (!scallop) cutsCtx.moveTo(x, y); else cutsCtx.lineTo(x, y);
          }
          cutsCtx.closePath(); cutsCtx.stroke();
          if (ringLine === 1 || ringLine === rings) {
            edgesCtx.globalAlpha = ringLine === 1 ? 0.78 : 0.42;
            edgesCtx.beginPath(); edgesCtx.arc(origin.x, origin.y, ringRadius, 0, Math.PI * 2); edgesCtx.stroke();
          }
        }
        var radialCount = Math.min(16, 5 + Math.round(energy * 2.1));
        for (var radial = 0; radial < radialCount; radial++) {
          var radialAngle = rotationOffset + radial / radialCount * Math.PI * 2
            + (hash(radial, glyphIndex, params.seed + 2543) * 2 - 1) * 0.16;
          var radialStart = pitRadius * (1.05 + hash(radial, 2, params.seed + 2549) * 0.45);
          var radialEnd = extent * (0.74 + hash(radial, 5, params.seed + 2551) * 0.3);
          cutsCtx.globalAlpha = 0.48 + hash(radial, glyphIndex, params.seed + 2557) * 0.36;
          strokeFracturePolyline(cutsCtx, [{
            x: origin.x + Math.cos(radialAngle) * radialStart,
            y: origin.y + Math.sin(radialAngle) * radialStart
          }, {
            x: origin.x + Math.cos(radialAngle) * radialEnd,
            y: origin.y + Math.sin(radialAngle) * radialEnd
          }]);
        }
      }

      function renderCellFracture(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var topology = surfaceChoice(glyphs, 'cellFracture', 'fractureTopology',
          params.fractureTopology, BATCH_PARAM_OPTIONS.fractureTopology);
        if (topology === 'triangles') {
          renderCellFractureLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        var cellAggregate = surfaceAggregate(glyphs, 'cellFracture', 'fractureCell', params.fractureCell);
        if (!cellAggregate.weight) return;
        var energy = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('fractureEnergy', surfaceAggregate(glyphs, 'cellFracture', 'fractureEnergy', params.fractureEnergy).value, 0, 0, 4) : Math.max(0, Math.min(4,
          surfaceAggregate(glyphs, 'cellFracture', 'fractureEnergy', params.fractureEnergy).value)));
        var cell = Math.max(4, cellAggregate.value * pixelScale * L.s);
        var scatter = Math.max(0,
          surfaceAggregate(glyphs, 'cellFracture', 'fractureScatter', params.fractureScatter).value * pixelScale * L.s);
        var gap = Math.max(0,
          surfaceAggregate(glyphs, 'cellFracture', 'fractureGap', params.fractureGap).value * pixelScale * L.s);
        var spin = surfaceAggregate(glyphs, 'cellFracture', 'fractureSpin', params.fractureSpin).value * Math.PI / 180;
        var mask = buildSurfaceMask(glyphs, 'cellFracture', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'cellFracture', coverBase);
        var bounds = fractureMaskBounds(mask);
        if (!bounds) return;
        var work = surfaceScratch('cell-fracture-v31-fragments', width, height, false);
        var cuts = surfaceScratch('cell-fracture-v31-cuts', width, height, false);
        var edges = surfaceScratch('cell-fracture-v31-edges', width, height, false);
        var workCtx = work.ctx, cutsCtx = cuts.ctx, edgesCtx = edges.ctx;
        workCtx.fillStyle = cutsCtx.fillStyle = edgesCtx.fillStyle = '#fff';
        workCtx.strokeStyle = cutsCtx.strokeStyle = edgesCtx.strokeStyle = '#fff';
        var phase = compositionState.enabled
          ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;

        if (topology === 'fault') {
          renderFaultFractureV31(workCtx, cutsCtx, edgesCtx, mask, bounds,
            energy, cell, scatter, gap, spin, phase);
        } else {
          var inkPoints = (topology === 'impact' || topology === 'spall')
            ? sampleSurfaceMask(mask, 0.82, false,
              Math.min(1800, Math.max(180, glyphs.length * 64))) : null;
          for (var glyphIndex = 0; glyphIndex < glyphs.length; glyphIndex++) {
            var glyph = glyphs[glyphIndex];
            var strength = surfaceGlyphStrength(glyph, 'cellFracture');
            if (strength <= 0.002 || (glyph.opacity != null && glyph.opacity <= 0.002)) continue;
            var glyphMask = surfaceScratch('cell-fracture-v31-glyph', width, height, false);
            drawSurfaceGlyph(glyphMask.ctx, glyph, pixelScale, L, fm, strength);
            if (topology === 'crystal') {
              renderCrystalFractureV31(workCtx, cutsCtx, edgesCtx, glyphMask, glyph,
                glyphIndex, pixelScale, L, energy, cell, scatter, gap, spin, phase);
            } else if (topology === 'spall') {
              renderSpallFractureV31(workCtx, cutsCtx, edgesCtx, glyphMask, glyph,
                glyphIndex, pixelScale, L, energy, cell, scatter, gap, spin, phase, inkPoints);
            } else {
              renderImpactFractureV31(workCtx, cutsCtx, edgesCtx, glyphMask, glyph,
                glyphIndex, pixelScale, L, energy, cell, scatter, gap, spin, phase, inkPoints);
            }
          }
        }

        fractureColorizeAndOutput(targetCtx, work, surfaceEffectColor('cellFracture'));
        cutsCtx.globalCompositeOperation = 'destination-in';
        cutsCtx.globalAlpha = 1; cutsCtx.drawImage(mask, 0, 0);
        cutsCtx.globalCompositeOperation = 'source-over';
        edgesCtx.globalCompositeOperation = 'destination-in';
        edgesCtx.globalAlpha = 1; edgesCtx.drawImage(mask, 0, 0);
        edgesCtx.globalCompositeOperation = 'source-over';
        paintSurfaceMask(targetCtx, cuts.canvas, params.paper,
          Math.min(0.98, 0.72 + energy * 0.055), 'cell-fracture-v31-paper-cuts');
        paintSurfaceMask(targetCtx, edges.canvas, surfaceEffectColor('cellFracture'),
          Math.min(1, 0.68 + energy * 0.06), 'cell-fracture-v31-propagation-edges');
      }

      function renderRibbonLamina(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var aggregate = surfaceAggregate(glyphs, 'ribbonEcho', 'ribbonDepth', params.ribbonDepth);
        if (!aggregate.weight) return;
        var mask = buildSurfaceMask(glyphs, 'ribbonEcho', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'ribbonEcho', coverBase);
        var bounds = fractureMaskBounds(mask);
        if (!bounds) return;
        bounds = [Math.max(0, bounds[0] - 1), Math.max(0, bounds[1] - 1),
          Math.min(width, bounds[2] + 2), Math.min(height, bounds[3] + 2)];
        var depth = aggregate.value * pixelScale * L.s;
        var weave = surfaceAggregate(glyphs, 'ribbonEcho', 'ribbonWeave', params.ribbonWeave).value;
        var twist = surfaceAggregate(glyphs, 'ribbonEcho', 'ribbonTwist', params.ribbonTwist).value * Math.PI / 180;
        var fade = surfaceAggregate(glyphs, 'ribbonEcho', 'ribbonFade', params.ribbonFade).value;
        // Four sections are the minimum to represent a whole backbone turn;
        // endpoints alone alias the curve to an edge-on sheet at high twist.
        var steps = 3 + (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('ribbonSteps', Math.round(surfaceAggregate(glyphs, 'ribbonEcho', 'ribbonSteps', params.ribbonSteps).value), 0, 1, 96) : Math.max(1, Math.min(96, Math.round(surfaceAggregate(glyphs, 'ribbonEcho', 'ribbonSteps', params.ribbonSteps).value))));
        var phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var color = surfaceEffectColor('ribbonEcho'), rgb = surfaceHexRgb(color);
        var result = surfaceScratch('ribbon-lamina-body', width, height, false);
        var faces = [], dx = (bounds[2] - bounds[0]) / steps;
        for (var i = 0; i < steps; i++) {
          var left = bounds[0] + i * dx, right = bounds[0] + (i + 1) * dx;
          var uv = [{ x: left, y: bounds[1] }, { x: right, y: bounds[1] },
            { x: right, y: bounds[3] }, { x: left, y: bounds[3] }];
          var points = uv.map(function (p) { return ribbonLaminaPoint(p.x, p.y, bounds, depth, weave, twist, phase); });
          var u = { x: points[1].x - points[0].x, y: points[1].y - points[0].y, z: points[1].z - points[0].z };
          var v = { x: points[3].x - points[0].x, y: points[3].y - points[0].y, z: points[3].z - points[0].z };
          var nx = u.y * v.z - u.z * v.y, ny = u.z * v.x - u.x * v.z, nz = u.x * v.y - u.y * v.x;
          var norm = Math.max(0.00001, Math.hypot(nx, ny, nz));
          var light = (nx * -0.25 + ny * -0.45 + nz * 0.85) / norm;
          faces.push({ uv: uv, points: points, z: points.reduce(function (s, p) { return s + p.z; }, 0) / 4,
            tone: Math.max(-0.7, Math.min(0.72, light * 0.8 - 0.05)), alpha: 1 - fade * Math.max(0, -nz / norm) * 0.65 });
        }
        faces.sort(function (a, b) { return a.z - b.z; });
        var minX = width, minY = height, maxX = 0, maxY = 0;
        faces.forEach(function (face) { face.points.forEach(function (p) {
          minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
        }); });
        minX = Math.max(0, Math.floor(minX)); minY = Math.max(0, Math.floor(minY));
        maxX = Math.min(width, Math.ceil(maxX)); maxY = Math.min(height, Math.ceil(maxY));
        if (maxX <= minX || maxY <= minY) return;
        var raster = result.ctx.createImageData(maxX - minX, maxY - minY);
        raster.originX = minX; raster.originY = minY;
        raster.depth = new Float32Array(raster.width * raster.height); raster.depth.fill(-Infinity);
        var source = mask.getContext('2d').getImageData(bounds[0], bounds[1], bounds[2] - bounds[0], bounds[3] - bounds[1]);
        source.originX = bounds[0]; source.originY = bounds[1];
        for (var f = 0; f < faces.length; f++) {
          var face = faces[f];
          var faceColor = surfaceToneCss(rgb, face.tone).match(/[\d.]+/g).slice(0, 3).map(Number);
          ribbonLaminaTriangle(raster, source, [face.uv[0], face.uv[1], face.uv[2]],
            [face.points[0], face.points[1], face.points[2]], faceColor, face.alpha);
          ribbonLaminaTriangle(raster, source, [face.uv[0], face.uv[2], face.uv[3]],
            [face.points[0], face.points[2], face.points[3]], faceColor, face.alpha);
        }
        result.ctx.putImageData(raster, minX, minY);
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext,triangles=[];faces.forEach(function(face){var ink=surfaceToneCss(rgb,face.tone).match(/[\d.]+/g).slice(0,3).map(Number);[[0,1,2],[0,2,3]].forEach(function(ids){triangles.push({v:ids.map(function(i){return face.points[i];}),uv:ids.map(function(i){return face.uv[i];}),ink:ink,alpha:face.alpha});});});RC.shadedMesh(result.canvas,triangles,function(t,a,b,c,rgba){var x=t.uv[0].x*a+t.uv[1].x*b+t.uv[2].x*c-.5-source.originX,y=t.uv[0].y*a+t.uv[1].y*b+t.uv[2].y*c-.5-source.originY;for(var k=0;k<3;k++)rgba[k]=t.ink[k];rgba[3]=RC.rasterSample(source.data,source.width,source.height,x,y,3)*t.alpha;});}
        targetCtx.save(); targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.globalAlpha = aggregate.strength;
        targetCtx.drawImage(result.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderRibbonEcho(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var path = surfaceChoice(glyphs, 'ribbonEcho', 'ribbonPath', params.ribbonPath, BATCH_PARAM_OPTIONS.ribbonPath);
        if (path === 'lamina') {
          renderRibbonLamina(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        if (path === 'legacy') {
          renderRibbonEchoLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        var depthAggregate = surfaceAggregate(glyphs, 'ribbonEcho', 'ribbonDepth', params.ribbonDepth);
        if (!depthAggregate.weight) return;
        var steps = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('ribbonSteps', Math.round(surfaceAggregate(glyphs, 'ribbonEcho', 'ribbonSteps', params.ribbonSteps).value), 0, 1, 96) : Math.max(1, Math.min(96, Math.round(surfaceAggregate(glyphs, 'ribbonEcho', 'ribbonSteps', params.ribbonSteps).value))));
        var twist = surfaceAggregate(glyphs, 'ribbonEcho', 'ribbonTwist', params.ribbonTwist).value * Math.PI / 180;
        var fade = Math.max(0, Math.min(1, surfaceAggregate(glyphs, 'ribbonEcho', 'ribbonFade', params.ribbonFade).value));
        var weave = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('ribbonWeave', surfaceAggregate(glyphs, 'ribbonEcho', 'ribbonWeave', params.ribbonWeave).value, 0, 0, 4) : Math.max(0, Math.min(4, surfaceAggregate(glyphs, 'ribbonEcho', 'ribbonWeave', params.ribbonWeave).value)));
        var depth = depthAggregate.value * pixelScale * L.s;
        var mask = buildSurfaceMask(glyphs, 'ribbonEcho', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'ribbonEcho', coverBase);
        var bounds = fractureMaskBounds(mask) || [0, 0, width - 1, height - 1];
        var spanX = Math.max(1, bounds[2] - bounds[0]);
        var spanY = Math.max(1, bounds[3] - bounds[1]);
        var centerX = (bounds[0] + bounds[2]) * 0.5;
        var centerY = (bounds[1] + bounds[3]) * 0.5;
        var phase = compositionState.enabled
          ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var body = surfaceScratch('ribbon-echo-v31-section-body', width, height, false);
        var shade = surfaceScratch('ribbon-echo-v31-back-faces', width, height, false);
        var highlight = surfaceScratch('ribbon-echo-v31-front-faces', width, height, false);
        var rails = surfaceScratch('ribbon-echo-v31-section-rails', width, height, false);
        var cuts = surfaceScratch('ribbon-echo-v31-paper-gaps', width, height, false);
        var outline = ribbonOutlineMaskV31(mask, Math.max(0.75, pixelScale * L.s * (0.8 + weave * 0.24)),
          'ribbon-echo-v31-source-outline');
        var bodyCtx = body.ctx, shadeCtx = shade.ctx, highlightCtx = highlight.ctx;
        var railCtx = rails.ctx, cutCtx = cuts.ctx;
        var items = [];
        var braidFrameSets = null;
        var braidHalfWidths = null;

        if (path === 'extrude') {
          var solidSamples = Math.min(96, Math.max(8,
            Math.ceil(Math.abs(depth) / Math.max(3, pixelScale * L.s * 5))));
          for (var solidIndex = solidSamples; solidIndex >= 0; solidIndex--) {
            var solidT = solidIndex / solidSamples;
            var solidState = ribbonSectionStateV31(path, solidT, depth, weave, phase, twist, bounds, 0);
            bodyCtx.save();
            ribbonApplyStateV31(bodyCtx, centerX, centerY, solidState);
            bodyCtx.globalAlpha = Math.max(0.1, 0.78 - fade * solidT * 0.52);
            bodyCtx.drawImage(mask, 0, 0);
            bodyCtx.restore();
          }
          var farState = ribbonSectionStateV31(path, 1, depth, weave, phase, twist, bounds, 0);
          var nearState = ribbonSectionStateV31(path, 0, depth, weave, phase, twist, bounds, 0);
          ribbonDrawSectionV31(shadeCtx, mask, bounds, 'x', bounds[0], bounds[2],
            centerX, centerY, farState, 0.92, 1);
          ribbonDrawSectionV31(highlightCtx, mask, bounds, 'x', bounds[0], bounds[2],
            centerX, centerY, nearState, 0.72, 1);
          var ribCount = Math.min(26, Math.max(2, Math.round(Math.sqrt(steps) * 3.2)));
          for (var rib = 1; rib < ribCount; rib++) {
            var ribT = rib / ribCount;
            var ribState = ribbonSectionStateV31(path, ribT, depth, weave, phase, twist, bounds, 0);
            ribbonDrawSectionV31(railCtx, outline, bounds, 'x', bounds[0], bounds[2],
              centerX, centerY, ribState, 0.25 + (1 - ribT) * 0.38, 1);
            if (rib % 4 === 0) ribbonDrawSectionV31(cutCtx, outline, bounds, 'x', bounds[0], bounds[2],
              centerX, centerY, ribState, 0.18 + fade * 0.22, 0.5);
          }
        } else {
          var sectionCount = steps;
          var bandWidth = spanX / sectionCount;
          var groupSize = path === 'braid'
            ? Math.max(1, Math.round(sectionCount / Math.max(4, 4 + weave * 2.2))) : 1;
          for (var section = 0; section < sectionCount; section++) {
            var sectionT = sectionCount === 1 ? 0.5 : (section + 0.5) / sectionCount;
            var lane = path === 'braid' ? (Math.floor(section / groupSize) & 1) : 0;
            var sectionState = ribbonSectionStateV31(path, sectionT, depth, weave,
              phase, twist, bounds, lane);
            items.push({
              index: section,
              t: sectionT,
              lane: lane,
              start: bounds[0] + section * bandWidth,
              end: section === sectionCount - 1 ? bounds[2] : bounds[0] + (section + 1) * bandWidth,
              center: bounds[0] + (section + 0.5) * bandWidth,
              state: sectionState
            });
          }
          var drawItems = items.slice().sort(function (a, b) {
            return a.state.facing - b.state.facing || a.index - b.index;
          });
          var fanPivotX = depth < 0 ? bounds[2] : bounds[0];
          var pivotX = path === 'fan' ? fanPivotX : centerX;
          var pivotY = centerY;
          var profileHalf = Math.min(spanY * 0.24,
            Math.max(pixelScale * L.s * 5, spanY * (0.035 + weave * 0.026)));
          if (path === 'helix') {
            ribbonSkinStripV31(bodyCtx, items, pivotX, pivotY, centerY, profileHalf,
              function (a, b) { return Math.max(0.14, 0.62 - fade * (a.t + b.t) * 0.2); });
            ribbonSkinStripV31(shadeCtx, items, pivotX, pivotY, centerY, profileHalf,
              function (a, b) {
                var facing = (a.state.facing + b.state.facing) * 0.5;
                return facing < 0.16 ? Math.min(0.82, 0.16 - facing * 0.5) : 0;
              });
            ribbonSkinStripV31(highlightCtx, items, pivotX, pivotY, centerY, profileHalf * 0.9,
              function (a, b) {
                var facing = (a.state.facing + b.state.facing) * 0.5;
                return facing > 0.28 ? Math.min(0.42, (facing - 0.18) * 0.34) : 0;
              });
            ribbonStrokeRailV31(cutCtx, items, pivotX, pivotY,
              function (item) { return { x: item.center, y: centerY }; },
              Math.max(0.8, profileHalf * (0.08 + weave * 0.016)), 0.3 + fade * 0.25);
          } else if (path === 'fan') {
            ribbonFanLeavesV31(bodyCtx, shadeCtx, railCtx, cutCtx, items,
              pivotX, pivotY, centerY, profileHalf * 1.18,
              Math.max(0.7, pixelScale * L.s * (0.9 + weave * 0.58)), fade);
          } else {
            var laneSampleCount = Math.min(56, Math.max(8, steps));
            braidFrameSets = [[], []];
            braidHalfWidths = [0, 0];
            for (var laneIndex = 0; laneIndex < 2; laneIndex++) {
              var laneFrames = [];
              for (var laneSample = 0; laneSample < laneSampleCount; laneSample++) {
                var laneT = laneSampleCount === 1 ? 0.5 : laneSample / (laneSampleCount - 1);
                laneFrames.push({
                  t: laneT,
                  center: bounds[0] + spanX * laneT,
                  state: ribbonSectionStateV31(path, laneT, depth, weave,
                    phase, twist, bounds, laneIndex)
                });
              }
              var laneHalf = profileHalf * (0.94 + laneIndex * 0.12);
              braidFrameSets[laneIndex] = laneFrames;
              braidHalfWidths[laneIndex] = laneHalf;
              ribbonSkinStripV31(bodyCtx, laneFrames, pivotX, pivotY, centerY, laneHalf,
                function (a, b) { return Math.max(0.22, 0.68 - fade * (a.t + b.t) * 0.2); });
              ribbonSkinStripV31(shadeCtx, laneFrames, pivotX, pivotY, centerY, laneHalf,
                function (a, b) {
                  var facing = (a.state.facing + b.state.facing) * 0.5;
                  return facing < -0.08 ? Math.min(0.78, 0.1 - facing * 0.56) : 0;
                });
              ribbonSkinStripV31(highlightCtx, laneFrames, pivotX, pivotY, centerY, laneHalf * 0.9,
                function (a, b) {
                  var facing = (a.state.facing + b.state.facing) * 0.5;
                  return facing > 0.22 ? Math.min(0.62, 0.12 + facing * 0.42) : 0;
                });
              cutCtx.save();
              cutCtx.lineCap = 'round';
              cutCtx.lineWidth = Math.max(1, laneHalf * 1.72);
              for (var laneCut = 1; laneCut < laneFrames.length; laneCut++) {
                var cutA = laneFrames[laneCut - 1], cutB = laneFrames[laneCut];
                var cutFacing = (cutA.state.facing + cutB.state.facing) * 0.5;
                var cutTurn = (cutA.state.turn + cutB.state.turn) * 0.5;
                if (cutFacing > -0.12 || Math.abs(Math.sin(cutTurn)) > 0.34) continue;
                var cutPointA = ribbonTransformPointV31(cutA.center, centerY,
                  pivotX, pivotY, cutA.state);
                var cutPointB = ribbonTransformPointV31(cutB.center, centerY,
                  pivotX, pivotY, cutB.state);
                cutCtx.globalAlpha = 0.72 + fade * 0.24;
                cutCtx.beginPath(); cutCtx.moveTo(cutPointA.x, cutPointA.y);
                cutCtx.lineTo(cutPointB.x, cutPointB.y); cutCtx.stroke();
              }
              cutCtx.restore();
            }
          }
          for (var drawIndex = 0; drawIndex < drawItems.length; drawIndex++) {
            var item = drawItems[drawIndex];
            var fragmentBase = path === 'helix' ? 0.48 : (path === 'fan' ? 0.36 : 0.28);
            var bodyAlpha = Math.max(fragmentBase * 0.42,
              fragmentBase * (1 - fade * item.t * 0.58));
            ribbonDrawSectionV31(bodyCtx, mask, bounds, 'x', item.start, item.end,
              pivotX, pivotY, item.state, bodyAlpha, Math.max(0.7, bandWidth * 0.08));
            if (item.state.facing < 0.12) ribbonDrawSectionV31(shadeCtx, mask, bounds, 'x', item.start, item.end,
              pivotX, pivotY, item.state, Math.min(0.62, 0.12 - item.state.facing * 0.34), 0.8);
            if (item.state.facing > 0.28) ribbonDrawSectionV31(highlightCtx, mask, bounds, 'x', item.start, item.end,
              pivotX, pivotY, item.state, Math.min(0.54, 0.1 + item.state.facing * 0.3), 0.8);
            if (item.index % Math.max(1, Math.round(3.5 - weave * 0.5)) === 0) {
              ribbonDrawSectionV31(railCtx, outline, bounds, 'x', item.start, item.end,
                pivotX, pivotY, item.state, 0.34 + weave * 0.08, 0.7);
            }
            if ((path === 'braid' && Math.abs(item.state.facing) < 0.24)
              || (path === 'fan' && item.index > 0 && item.index % 2 === 0)) {
              ribbonDrawSectionV31(cutCtx, outline, bounds, 'x', item.start, item.end,
                pivotX, pivotY, item.state, 0.38 + fade * 0.34, 0.45);
            }
          }

          var railWidth = Math.max(0.7, Math.min(5.5, pixelScale * L.s * (0.9 + weave * 0.58)));
          if (path === 'helix') {
            ribbonStrokeRailV31(railCtx, items, pivotX, pivotY,
              function (item) { return { x: item.center, y: centerY - profileHalf }; }, railWidth, 0.82);
            ribbonStrokeRailV31(railCtx, items, pivotX, pivotY,
              function (item) { return { x: item.center, y: centerY + profileHalf }; }, railWidth, 0.58);
          } else if (path === 'fan') {
            railCtx.save();
            railCtx.lineWidth = Math.max(0.55, railWidth * 0.52);
            railCtx.lineCap = 'round';
            for (var fanRail = 0; fanRail < items.length; fanRail += Math.max(1, Math.round(3 - weave * 0.32))) {
              var fanItem = items[fanRail];
              var fanPoint = ribbonTransformPointV31(fanItem.center,
                fanRail & 1 ? bounds[1] : bounds[3], pivotX, pivotY, fanItem.state);
              railCtx.globalAlpha = 0.28 + (1 - fanItem.t) * 0.38;
              railCtx.beginPath(); railCtx.moveTo(pivotX, pivotY); railCtx.lineTo(fanPoint.x, fanPoint.y); railCtx.stroke();
            }
            railCtx.restore();
            ribbonStrokeRailV31(railCtx, items, pivotX, pivotY,
              function (item) { return { x: item.center, y: bounds[1] }; }, railWidth, 0.55);
          } else {
            for (var braidLane = 0; braidLane < 2; braidLane++) {
              var laneItems = braidFrameSets[braidLane];
              var laneEdge = braidHalfWidths[braidLane];
              ribbonStrokeRailV31(railCtx, laneItems, pivotX, pivotY,
                function (item) { return { x: item.center, y: centerY - laneEdge }; },
                railWidth * (braidLane ? 0.72 : 0.88), braidLane ? 0.58 : 0.82);
              ribbonStrokeRailV31(railCtx, laneItems, pivotX, pivotY,
                function (item) { return { x: item.center, y: centerY + laneEdge }; },
                railWidth * (braidLane ? 0.58 : 0.7), braidLane ? 0.42 : 0.62);
            }
          }
        }

        var baseRgb = surfaceHexRgb(surfaceEffectColor('ribbonEcho'));
        var strength = depthAggregate.strength;
        paintSurfaceMask(targetCtx, body.canvas, surfaceEffectColor('ribbonEcho'), strength,
          'ribbon-echo-v31-section-color');
        paintSurfaceMask(targetCtx, shade.canvas, surfaceToneCss(baseRgb, -0.62), strength * 0.78,
          'ribbon-echo-v31-depth-shadow');
        paintSurfaceMask(targetCtx, cuts.canvas, params.paper, strength * 0.88,
          'ribbon-echo-v31-paper-cuts');
        paintSurfaceMask(targetCtx, highlight.canvas, surfaceToneCss(baseRgb, 0.72), strength * 0.62,
          'ribbon-echo-v31-facing-light');
        paintSurfaceMask(targetCtx, rails.canvas, surfaceToneCss(baseRgb, 0.86), strength * 0.88,
          'ribbon-echo-v31-cross-section-rails');
      }

      function renderMisregistration(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var offsetX = surfaceAggregate(glyphs, 'misregistration', 'misregOffsetX', params.misregX).value * pixelScale * L.s;
        var offsetY = surfaceAggregate(glyphs, 'misregistration', 'misregOffsetY', params.misregY).value * pixelScale * L.s;
        var warp = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('misregWarp', surfaceAggregate(glyphs, 'misregistration', 'misregWarp', params.misregWarp).value, 0, 0, 4) : Math.max(0, Math.min(4, surfaceAggregate(glyphs, 'misregistration', 'misregWarp', params.misregWarp).value)));
        var zones = Math.max(1, Math.round(surfaceAggregate(glyphs, 'misregistration', 'misregZones', params.misregZones).value));
        var slur = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('misregSlur', surfaceAggregate(glyphs, 'misregistration', 'misregSlur', params.misregSlur).value, 0, 0, 4) : Math.max(0, Math.min(4, surfaceAggregate(glyphs, 'misregistration', 'misregSlur', params.misregSlur).value)));
        var trap = Math.max(0, surfaceAggregate(glyphs, 'misregistration', 'misregTrap', params.misregTrap).value) * pixelScale * L.s;
        var system = surfaceChoice(glyphs, 'misregistration', 'misregSystem', params.misregSystem, BATCH_PARAM_OPTIONS.misregSystem);
        var mask = buildSurfaceMask(glyphs, 'misregistration', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'misregistration', coverBase);
        var colorA = colorizeSurfaceCanvas(mask, params.misregColorA, 'misreg-source-a-v27');
        var colorB = colorizeSurfaceCanvas(mask, params.misregColorB, 'misreg-source-b-v27');
        var plateA = surfaceScratch('misreg-plate-a-v27', width, height, false);
        var plateB = surfaceScratch('misreg-plate-b-v27', width, height, false);

        if (system === 'trap') {
          var spread = Math.max(0.25, Math.min(36, trap));
          var impressions = Math.max(4, Math.min(24, Math.ceil(6 + spread * 0.7)));
          plateA.ctx.globalAlpha = 0.18 + Math.min(0.12, slur * 0.025);
          for (var ring = 0; ring < impressions; ring++) {
            var angle = ring / impressions * Math.PI * 2;
            var radius = spread * (0.34 + (ring % 3) / 3 * 0.66);
            plateA.ctx.drawImage(colorA, offsetX + Math.cos(angle) * radius, offsetY + Math.sin(angle) * radius);
          }
          plateA.ctx.globalAlpha = 0.92;
          plateA.ctx.drawImage(colorA, offsetX, offsetY);
          plateB.ctx.drawImage(colorB, -offsetX * 0.62, -offsetY * 0.62);
          if (spread > 1) {
            plateB.ctx.globalCompositeOperation = 'destination-out';
            plateB.ctx.globalAlpha = Math.min(0.72, spread / 42);
            for (var choke = 0; choke < 8; choke++) {
              var chokeAngle = choke / 8 * Math.PI * 2;
              plateB.ctx.drawImage(mask, -offsetX * 0.62 + Math.cos(chokeAngle) * spread * 0.42,
                -offsetY * 0.62 + Math.sin(chokeAngle) * spread * 0.42);
            }
            plateB.ctx.globalCompositeOperation = 'source-over';
          }
        } else {
          drawRegistrationSliceField(plateA, colorA, system, offsetX, offsetY, warp, zones, slur, 3343);
          drawRegistrationSliceField(plateB, colorB, system, -offsetX * 0.62, -offsetY * 0.62, warp * 0.78, zones, slur * 0.82, 3359);
        }

        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.globalAlpha = 0.9;
        targetCtx.drawImage(plateA.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.globalCompositeOperation = 'multiply';
        targetCtx.globalAlpha = 0.84;
        targetCtx.drawImage(plateB.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderDataMosh(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var grammar = surfaceChoice(glyphs, 'dataMosh', 'moshGrammar', params.moshGrammar, BATCH_PARAM_OPTIONS.moshGrammar);
        var shift = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('moshShift', surfaceAggregate(glyphs, 'dataMosh', 'moshShift', params.moshShift).value, 0, 0, Infinity) : Math.max(0, surfaceAggregate(glyphs, 'dataMosh', 'moshShift', params.moshShift).value)) * pixelScale * L.s;
        var blockLogical = Math.max(4, surfaceAggregate(glyphs, 'dataMosh', 'moshBlock', params.moshBlock).value);
        var memory = Math.max(1, Math.round(surfaceAggregate(glyphs, 'dataMosh', 'moshMemory', params.moshMemory).value));
        var coherence = Math.max(0, Math.min(1, surfaceAggregate(glyphs, 'dataMosh', 'moshCoherence', params.moshCoherence).value));
        var chroma = Math.max(0, surfaceAggregate(glyphs, 'dataMosh', 'moshChroma', params.moshChroma).value) * pixelScale * L.s;
        var crush = Math.max(0, Math.min(1, surfaceAggregate(glyphs, 'dataMosh', 'moshCrush', params.moshCrush).value));
        var smear = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('moshSmear', surfaceAggregate(glyphs, 'dataMosh', 'moshSmear', params.moshSmear).value, 0, 0, 12) : Math.max(0, Math.min(12, surfaceAggregate(glyphs, 'dataMosh', 'moshSmear', params.moshSmear).value)));
        var tear = Math.max(0, Math.min(1, surfaceAggregate(glyphs, 'dataMosh', 'moshTear', params.moshTear).value));
        var hold = Math.max(1, Math.round(surfaceAggregate(glyphs, 'dataMosh', 'moshHold', params.moshHold).value));
        var mask = buildSurfaceMask(glyphs, 'dataMosh', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'dataMosh', coverBase);
        var plateA = surfaceScratch('data-mosh-plate-a-v27', width, height, false);
        var plateB = surfaceScratch('data-mosh-plate-b-v27', width, height, false);
        var ctxA = plateA.ctx, ctxB = plateB.ctx;
        ctxA.imageSmoothingEnabled = false; ctxB.imageSmoothingEnabled = false;
        var frame = dataMoshFrameIndex(hold, memory);

        if (grammar === 'legacy') {
          ctxA.globalAlpha = 0.8; ctxA.drawImage(mask, chroma, chroma * 0.22);
          ctxB.globalAlpha = 0.76; ctxB.drawImage(mask, -chroma * 0.86, -chroma * 0.18);
        } else {
          var cell = Math.max(9, Math.min(128, blockLogical * pixelScale * L.s));
          var columns = Math.ceil(width / cell), rows = Math.ceil(height / cell);
          var blockCount = Math.max(1, columns * rows);
          var historyStep = Math.max(1, Math.ceil(blockCount * memory / 3600));
          var clusterSpan = Math.max(1, Math.round(1 + coherence * 5));
          for (var row = 0; row < rows; row++) for (var col = 0; col < columns; col++) {
            var sx = Math.floor(col * cell), sy = Math.floor(row * cell);
            var sw = Math.max(1, Math.min(width - sx, Math.ceil(cell + 0.5)));
            var sh = Math.max(1, Math.min(height - sy, Math.ceil(cell + 0.5)));
            if (sw <= 0 || sh <= 0) continue;
            var clusterX = Math.floor(col / clusterSpan), clusterY = Math.floor(row / Math.max(1, Math.round(clusterSpan * 0.72)));
            var salt = frame * 149 + clusterX * 17 + clusterY * 37;
            var angle = surfaceNoise01(clusterX, clusterY, params.seed + salt + 3371) * Math.PI * 2;
            var magnitude = shift * (0.08 + surfaceNoise01(clusterY, clusterX, params.seed + salt + 3373) * (0.36 + crush * 0.78));
            var vectorX = Math.cos(angle) * magnitude;
            var vectorY = Math.sin(angle) * magnitude * (0.32 + crush * 0.48);
            var localNoise = surfaceNoise01(col, row, params.seed + frame + 3379) * 2 - 1;
            vectorX += localNoise * shift * (1 - coherence) * 0.32;
            vectorY += surfaceNoise01(row, col, params.seed + frame + 3381) * shift * (1 - coherence) * 0.16;

            if (grammar === 'motionVectors') {
              vectorX *= 1.12 + smear * 0.08;
              vectorY *= 0.74 + coherence * 0.42;
            } else if (grammar === 'entropy') {
              var rowSign = (clusterY + frame) % 2 ? -1 : 1;
              vectorX = rowSign * Math.round(Math.abs(vectorX) / Math.max(1, cell)) * cell;
              vectorY = (clusterY % 3 - 1) * cell * (0.2 + crush * 0.44);
            }

            var keyBlock = grammar === 'keyframe' && surfaceNoise01(clusterX, clusterY, params.seed + frame + 3389) > 0.72;
            var missing = surfaceNoise01(col, row, params.seed + frame + 3391) < tear * (keyBlock ? 0.08 : 0.34);
            var sampleDriftX = grammar === 'keyframe' && !keyBlock
              ? (surfaceNoise01(clusterY, clusterX, params.seed + frame + 3397) * 2 - 1) * cell * (1 + crush * 3)
              : 0;
            var sampleDriftY = grammar === 'entropy'
              ? (surfaceNoise01(clusterX, frame, params.seed + 3407) * 2 - 1) * cell * 1.5 : 0;
            var sourceX = Math.max(0, Math.min(width - sw, sx + sampleDriftX));
            var sourceY = Math.max(0, Math.min(height - sh, sy + sampleDriftY));
            var stretchX = 1 + Math.abs(vectorX) / Math.max(1, width) * smear * (grammar === 'motionVectors' ? 1.9 : 1.15);
            var stretchY = Math.max(0.18, 1 - crush * Math.abs(localNoise) * (grammar === 'entropy' ? 0.78 : 0.46));
            if (!missing || keyBlock) {
              var baseAlpha = keyBlock ? 0.86 : (0.46 + crush * 0.28);
              ctxA.globalCompositeOperation = 'source-over';
              ctxB.globalCompositeOperation = 'source-over';
              ctxA.globalAlpha = baseAlpha;
              ctxB.globalAlpha = baseAlpha * 0.9;
              ctxA.drawImage(mask, sourceX, sourceY, sw, sh,
                sx + vectorX - chroma * 0.34, sy + vectorY - chroma * 0.08, sw * stretchX, sh * stretchY);
              ctxB.drawImage(mask, sourceX, sourceY, sw, sh,
                sx + vectorX + chroma * 0.42, sy + vectorY + chroma * 0.11, sw * (1 + (stretchX - 1) * 0.72), sh * stretchY);
            }

            ctxA.globalCompositeOperation = 'lighter';
            ctxB.globalCompositeOperation = 'lighter';
            for (var history = historyStep; history < memory; history += historyStep) {
              var t = history / Math.max(1, memory - 1);
              var retain = Math.pow(1 - t, 0.62 + crush * 0.82) / Math.max(1, Math.sqrt(memory * 0.48));
              if (grammar === 'keyframe') retain *= 1.18;
              if (grammar === 'entropy' && (history + row) % 3) retain *= 0.58;
              var historyBend = (surfaceNoise01(clusterX + history, clusterY, params.seed + frame + 3413) * 2 - 1) * cell * crush;
              var historyX = vectorX * (0.2 + t * (grammar === 'motionVectors' ? 1.55 : 1.08));
              var historyY = vectorY * (0.2 + t * 1.18) + historyBend;
              ctxA.globalAlpha = retain * 0.66;
              ctxB.globalAlpha = retain * 0.58;
              ctxA.drawImage(mask, sourceX, sourceY, sw, sh,
                sx + historyX - chroma * (0.1 + t * 0.48), sy + historyY, sw * (1 + (stretchX - 1) * t), sh * stretchY);
              ctxB.drawImage(mask, sourceX, sourceY, sw, sh,
                sx + historyX + chroma * (0.12 + t * 0.54), sy + historyY, sw * (1 + (stretchX - 1) * t * 0.76), sh * stretchY);
            }
          }
        }

        var coloredA = colorizeSurfaceCanvas(plateA.canvas, params.moshColorA, 'data-mosh-color-a-v27');
        var coloredB = colorizeSurfaceCanvas(plateB.canvas, params.moshColorB, 'data-mosh-color-b-v27');
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.globalAlpha = 0.92;
        targetCtx.drawImage(coloredA, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.globalCompositeOperation = 'screen';
        targetCtx.globalAlpha = 0.84;
        targetCtx.drawImage(coloredB, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderBlobTrack(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var visual = surfaceChoice(glyphs, 'blobTrack', 'blobVisual', params.blobVisual, BATCH_PARAM_OPTIONS.blobVisual);
        var densityAggregate = surfaceAggregate(glyphs, 'blobTrack', 'blobDensity', params.blobDensity);
        if (!densityAggregate.weight) return;
        var density = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('blobDensity', densityAggregate.value, 0, 0.1, 4) : Math.max(0.1, Math.min(4, densityAggregate.value)));
        var influence = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('blobInfluence', surfaceAggregate(glyphs, 'blobTrack', 'blobInfluence', params.blobInfluence).value, 0, 24, Infinity) : Math.max(24, surfaceAggregate(glyphs, 'blobTrack', 'blobInfluence', params.blobInfluence).value)) * pixelScale * L.s;
        var vectorGain = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('blobVector', surfaceAggregate(glyphs, 'blobTrack', 'blobVector', params.blobVector).value, 0, 0, 8) : Math.max(0, Math.min(8, surfaceAggregate(glyphs, 'blobTrack', 'blobVector', params.blobVector).value)));
        var trailMemory = Math.max(0, Math.round(surfaceAggregate(glyphs, 'blobTrack', 'blobTrails', params.blobTrails).value));
        var stroke = Math.max(0.2, surfaceAggregate(glyphs, 'blobTrack', 'blobStroke', params.blobStroke).value * pixelScale * L.s);
        var mask = buildSurfaceMask(glyphs, 'blobTrack', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'blobTrack', coverBase);
        if (visual === 'legacy') return;
        var sources = blobTrackSurfaceSources(glyphs, width, height, pixelScale, L, density, vectorGain, visual);
        if (!sources.length) return;
        var work = surfaceScratch('blob-track-field-v27', width, height, false);
        var ctx = work.ctx;
        ctx.strokeStyle = surfaceEffectColor('blobTrack');
        ctx.fillStyle = surfaceEffectColor('blobTrack');
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = stroke;

        function drawTrail(source, alpha) {
          if (!trailMemory || !source.trail || source.trail.length < 2) return;
          ctx.save();
          ctx.globalAlpha = alpha * source.strength;
          ctx.beginPath();
          ctx.moveTo(source.trail[0].x, source.trail[0].y);
          for (var i = 1; i < source.trail.length; i++) {
            var prior = source.trail[i - 1], point = source.trail[i];
            ctx.quadraticCurveTo(prior.x, prior.y, (prior.x + point.x) * 0.5, (prior.y + point.y) * 0.5);
          }
          ctx.lineTo(source.x, source.y);
          ctx.stroke();
          ctx.restore();
        }

        if (visual === 'flow') {
          var spacing = Math.max(14, Math.min(62, 48 / Math.sqrt(density)));
          var maxSeeds = 1250;
          var estimated = Math.ceil(width / spacing) * Math.ceil(height / spacing);
          if (estimated > maxSeeds) spacing *= Math.sqrt(estimated / maxSeeds);
          var steps = Math.max(5, Math.min(22, Math.round(7 + density * 3.4 + vectorGain * 0.8)));
          var stepLength = Math.max(3, Math.min(18, spacing * (0.25 + vectorGain * 0.035)));
          function vectorAt(x, y) {
            var fx = 0, fy = 0, total = 0, maximum = 0;
            for (var s = 0; s < sources.length; s++) {
              var source = sources[s];
              var dx = source.x - x, dy = source.y - y;
              var distance = Math.sqrt(dx * dx + dy * dy) || 0.001;
              var reach = influence + source.r * 1.4;
              var weight = Math.exp(-(distance * distance) / Math.max(1, reach * reach * 0.72)) * source.strength;
              if (weight < 0.008) continue;
              var radialX = dx / distance, radialY = dy / distance;
              var swirl = (params.blobSwirl || 0.24) * (0.45 + source.eccentricity * 0.7);
              fx += (radialX * 0.52 - radialY * swirl + source.vx * vectorGain * 0.024) * weight;
              fy += (radialY * 0.52 + radialX * swirl + source.vy * vectorGain * 0.024) * weight;
              total += weight; maximum = Math.max(maximum, weight);
            }
            if (!total) return { x: 0, y: 0, weight: 0 };
            var curlAngle = Math.sin(x * 0.0067 + surfaceFxPhase * 1.7 + params.seed * 0.11) * 1.45
              + Math.cos(y * 0.0053 - surfaceFxPhase * 1.25 + params.seed * 0.07) * 1.15;
            var curlMix = 0.08 + density * 0.035;
            fx += Math.cos(curlAngle) * total * curlMix;
            fy += Math.sin(curlAngle) * total * curlMix;
            var length = Math.sqrt(fx * fx + fy * fy) || 1;
            return { x: fx / length, y: fy / length, weight: maximum };
          }
          for (var y = spacing * 0.5; y < height; y += spacing) for (var x = spacing * 0.5; x < width; x += spacing) {
            var jitterX = (surfaceNoise01(Math.round(x), Math.round(y), params.seed + 3461) * 2 - 1) * spacing * 0.32;
            var jitterY = (surfaceNoise01(Math.round(y), Math.round(x), params.seed + 3463) * 2 - 1) * spacing * 0.32;
            var px = x + jitterX, py = y + jitterY;
            var initial = vectorAt(px, py);
            if (initial.weight < 0.035) continue;
            ctx.globalAlpha = densityAggregate.strength * Math.min(0.72, 0.08 + initial.weight * 0.58);
            ctx.beginPath(); ctx.moveTo(px, py);
            for (var step = 0; step < steps; step++) {
              var field = vectorAt(px, py);
              if (field.weight < 0.012) break;
              px += field.x * stepLength; py += field.y * stepLength;
              ctx.lineTo(px, py);
              if (px < -influence || px > width + influence || py < -influence || py > height + influence) break;
            }
            ctx.stroke();
          }
          for (var flowTrail = 0; flowTrail < sources.length; flowTrail++) drawTrail(sources[flowTrail], 0.56);
        } else if (visual === 'contours') {
          for (var c = 0; c < sources.length; c++) {
            var contourSource = sources[c];
            drawTrail(contourSource, 0.72);
            var rings = Math.max(3, Math.min(28, Math.round(4 + density * 5.5 + contourSource.eccentricity * 4)));
            for (var ring = 0; ring < rings; ring++) {
              var t = (ring + 1) / rings;
              var radius = contourSource.r + influence * t * (0.28 + density * 0.08);
              var velocityStretch = 1 + Math.min(3, Math.sqrt(contourSource.vx * contourSource.vx + contourSource.vy * contourSource.vy) * vectorGain * 0.018);
              ctx.save();
              ctx.translate(contourSource.x + contourSource.vx * t * vectorGain * 0.8,
                contourSource.y + contourSource.vy * t * vectorGain * 0.8);
              ctx.rotate(contourSource.angle);
              ctx.globalAlpha = contourSource.strength * (0.62 - t * 0.5) * densityAggregate.strength;
              ctx.lineWidth = Math.max(0.35, stroke * (1.28 - t * 0.72));
              ctx.beginPath();
              var start = -Math.PI * (0.82 + hash(c, ring, 3473) * 0.18);
              var end = Math.PI * (0.82 + hash(ring, c, 3479) * 0.18);
              ctx.ellipse(0, 0, radius * velocityStretch, radius * (0.46 + (1 - contourSource.eccentricity) * 0.42), 0, start, end);
              ctx.stroke();
              ctx.restore();
            }
          }
        } else if (visual === 'mesh') {
          var nodes = [];
          for (var m = 0; m < sources.length; m++) {
            var meshSource = sources[m];
            nodes.push({ x: meshSource.x, y: meshSource.y, r: meshSource.r, strength: meshSource.strength, glyphIndex: m, kind: 'core' });
            var satellites = Math.max(3, Math.min(6, Math.round(3 + density * 0.8)));
            for (var satellite = 0; satellite < satellites; satellite++) {
              var satelliteAngle = surfaceFxPhase * (0.22 + hash(m, satellite, 3481) * 0.24)
                + satellite / satellites * Math.PI * 2 + hash(satellite, m, params.seed + 3483) * 0.9;
              var satelliteRadius = meshSource.r * (0.72 + hash(m, satellite, 3487) * 0.82)
                + Math.min(influence * 0.12, 34 * pixelScale * L.s);
              nodes.push({
                x: meshSource.x + Math.cos(satelliteAngle) * satelliteRadius + meshSource.vx * vectorGain * 0.16,
                y: meshSource.y + Math.sin(satelliteAngle) * satelliteRadius * (0.58 + meshSource.eccentricity * 0.34)
                  + meshSource.vy * vectorGain * 0.16,
                r: Math.max(2, stroke * 1.4),
                strength: meshSource.strength * (0.42 + hash(satellite, m, 3489) * 0.34),
                glyphIndex: m,
                kind: 'satellite'
              });
            }
            var meshTrail = meshSource.trail || [];
            var trailStride = Math.max(1, Math.ceil(meshTrail.length / Math.max(2, Math.round(2 + density * 2))));
            for (var mt = 0; mt < meshTrail.length; mt += trailStride) nodes.push({
              x: meshTrail[mt].x, y: meshTrail[mt].y, r: Math.max(2, stroke * 2),
              strength: meshSource.strength * (0.18 + meshTrail[mt].alpha * 0.5), glyphIndex: m, kind: 'trail'
            });
          }
          var sourcePairs = {};
          var bridgeCount = Math.max(1, Math.min(4, Math.round(1 + density * 0.72)));
          for (var sourceIndex = 0; sourceIndex < sources.length; sourceIndex++) {
            var nearestSources = [];
            for (var otherIndex = sourceIndex + 1; otherIndex < sources.length; otherIndex++) {
              var sourceDx = sources[otherIndex].x - sources[sourceIndex].x;
              var sourceDy = sources[otherIndex].y - sources[sourceIndex].y;
              var sourceDistance = Math.sqrt(sourceDx * sourceDx + sourceDy * sourceDy);
              if (sourceDistance <= influence * 2.4) nearestSources.push({ index: otherIndex, distance: sourceDistance });
            }
            nearestSources.sort(function (left, right) { return left.distance - right.distance; });
            for (var nearestIndex = 0; nearestIndex < Math.min(bridgeCount, nearestSources.length); nearestIndex++) {
              var other = nearestSources[nearestIndex].index;
              var pairKey = sourceIndex + ':' + other;
              if (sourcePairs[pairKey]) continue;
              sourcePairs[pairKey] = true;
              var bridge = surfaceCurveSpec(sources[sourceIndex], sources[other], surfaceFxPhase,
                0.34 + density * 0.12, sourceIndex * 31 + other * 17 + 3491, 0);
              var bridgeFalloff = Math.max(0, 1 - nearestSources[nearestIndex].distance / Math.max(1, influence * 2.4));
              ctx.globalAlpha = Math.min(sources[sourceIndex].strength, sources[other].strength)
                * (0.11 + bridgeFalloff * 0.34) * densityAggregate.strength;
              ctx.lineWidth = Math.max(0.35, stroke * 1.45);
              ctx.beginPath(); ctx.moveTo(bridge.x0, bridge.y0);
              ctx.bezierCurveTo(bridge.x1, bridge.y1, bridge.x2, bridge.y2, bridge.x3, bridge.y3); ctx.stroke();
              ctx.globalAlpha *= 0.55;
              ctx.lineWidth = Math.max(0.3, stroke * 0.52);
              ctx.beginPath(); ctx.moveTo(bridge.x0, bridge.y0);
              ctx.bezierCurveTo(bridge.x1 + stroke * 3, bridge.y1 - stroke * 3,
                bridge.x2 - stroke * 3, bridge.y2 + stroke * 3, bridge.x3, bridge.y3); ctx.stroke();
            }
          }
          var edges = surfaceGraphEdges(nodes, influence * 0.78, 0.9 + density * 0.74, 3497, 2.45, false);
          for (var edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
            var edge = edges[edgeIndex];
            var falloff = Math.max(0, 1 - edge.distance / Math.max(1, influence * 2.4));
            ctx.globalAlpha = Math.min(edge.a.strength, edge.b.strength) * (0.14 + falloff * 0.58) * densityAggregate.strength;
            ctx.lineWidth = Math.max(0.35, stroke * (edge.kind === 'trunk' ? 1.35 : 0.72));
            var dx = edge.b.x - edge.a.x, dy = edge.b.y - edge.a.y;
            var bend = Math.sin((edge.ai + edge.bi) * 1.7 + params.seed) * edge.distance * 0.14;
            ctx.beginPath();
            ctx.moveTo(edge.a.x, edge.a.y);
            ctx.quadraticCurveTo((edge.a.x + edge.b.x) * 0.5 - dy / Math.max(1, edge.distance) * bend,
              (edge.a.y + edge.b.y) * 0.5 + dx / Math.max(1, edge.distance) * bend, edge.b.x, edge.b.y);
            ctx.stroke();
          }
          for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
            ctx.globalAlpha = nodes[nodeIndex].strength * 0.74;
            var nodeScale = nodes[nodeIndex].kind === 'core' ? 2.8 : nodes[nodeIndex].kind === 'satellite' ? 1.35 : 0.9;
            ctx.beginPath(); ctx.arc(nodes[nodeIndex].x, nodes[nodeIndex].y, Math.max(1.2, stroke * nodeScale), 0, Math.PI * 2); ctx.fill();
            if (nodes[nodeIndex].kind === 'core') {
              ctx.globalAlpha *= 0.42;
              ctx.lineWidth = Math.max(0.3, stroke * 0.5);
              ctx.beginPath(); ctx.arc(nodes[nodeIndex].x, nodes[nodeIndex].y,
                Math.max(4, nodes[nodeIndex].r * 0.42), 0, Math.PI * 2); ctx.stroke();
            }
          }
        } else {
          ctx.font = Math.max(7, params.fontSize * pixelScale * L.s * 0.12) + 'px monospace';
          for (var d = 0; d < sources.length; d++) {
            var diagnostic = sources[d];
            drawTrail(diagnostic, 0.82);
            ctx.globalAlpha = diagnostic.strength * densityAggregate.strength;
            ctx.lineWidth = stroke;
            ctx.save(); ctx.translate(diagnostic.x, diagnostic.y); ctx.rotate(diagnostic.angle);
            ctx.strokeRect(-diagnostic.r, -diagnostic.r * 0.62, diagnostic.r * 2, diagnostic.r * 1.24);
            ctx.beginPath(); ctx.moveTo(-diagnostic.r * 0.28, 0); ctx.lineTo(diagnostic.r * 0.28, 0);
            ctx.moveTo(0, -diagnostic.r * 0.28); ctx.lineTo(0, diagnostic.r * 0.28); ctx.stroke();
            ctx.restore();
            ctx.beginPath(); ctx.moveTo(diagnostic.x, diagnostic.y);
            ctx.lineTo(diagnostic.x + diagnostic.vx * vectorGain * 2.4, diagnostic.y + diagnostic.vy * vectorGain * 2.4); ctx.stroke();
            ctx.fillText('id' + diagnostic.id + (diagnostic.live ? ' LIVE' : ' DEMO'), diagnostic.x + diagnostic.r + 4, diagnostic.y - 4);
          }
        }

        // A quiet source-derived registration contour keeps the field tied to
        // the selected typography without turning it into another blob fill.
        ctx.globalAlpha = 0.12 * densityAggregate.strength;
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(colorizeSurfaceCanvas(mask, surfaceEffectColor('blobTrack'), 'blob-track-mask-color-v27'), 0, 0);
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderCopyDecayLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var generationAggregate = surfaceAggregate(glyphs, 'copyDecay', 'copyGenerations', params.copyGenerations);
        if (!generationAggregate.weight) return;
        var generations = Math.max(1, Math.round(generationAggregate.value));
        var exposure = surfaceAggregate(glyphs, 'copyDecay', 'copyExposure', params.copyExposure).value;
        var motion = surfaceAggregate(glyphs, 'copyDecay', 'copyMotion', params.copyMotion).value * pixelScale * L.s;
        var erosion = surfaceAggregate(glyphs, 'copyDecay', 'copyErosion', params.copyErosion).value * pixelScale * L.s;
        var toner = surfaceAggregate(glyphs, 'copyDecay', 'copyToner', params.copyToner).value;
        var dust = surfaceAggregate(glyphs, 'copyDecay', 'copyDust', params.copyDust).value;
        var mask = buildSurfaceMask(glyphs, 'copyDecay', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'copyDecay', coverBase);
        var maskCtx = mask.getContext('2d', { willReadFrequently: true });
        var source;
        try { source = maskCtx.getImageData(0, 0, width, height); }
        catch (error) { return; }
        var work = surfaceScratch('copy-decay', width, height, false);
        var output = work.ctx.createImageData(width, height);
        var sourceData = source.data;
        var severity = Math.min(1, (generations - 1) / 31);
        var erosionRadius = Math.max(0, Math.min(28, Math.round(erosion * (0.25 + severity * 0.75))));
        var tonerRadius = Math.max(1, Math.min(32, Math.round((1 + toner * 4.2) * pixelScale * L.s)));
        var phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var bandHeight = Math.max(1, Math.round(13 - severity * 10));
        // Even a fully overexposed copier should retain a relationship to the
        // source sheet; clamping here prevents empty paper from becoming one
        // flat rectangle while still allowing heavy toner fog near the glyphs.
        var threshold = Math.max(0.08, Math.min(0.9, 0.46 - exposure * 0.22 - toner * 0.035 + severity * 0.035));
        var gain = 2.2 + generations * 0.085 + Math.abs(exposure) * 0.7;
        function alphaAt(x, y) {
          x = Math.round(x); y = Math.round(y);
          if (x < 0 || x >= width || y < 0 || y >= height) return 0;
          return sourceData[(y * width + x) * 4 + 3] / 255;
        }
        for (var y = 0; y < height; y++) {
          var band = Math.floor(y / bandHeight);
          var bandNoise = surfaceNoise01(band, generations, params.seed + 907);
          var scanWave = Math.sin(y * (0.008 + severity * 0.035) + phase + params.seed * 0.13);
          var rowDrift = motion * (0.12 + severity * 0.88) * (0.18 + bandNoise * 0.82)
            + motion * scanWave * (0.04 + severity * 0.12);
          var verticalJitter = (surfaceNoise01(band, 7, params.seed + 911) * 2 - 1) * (0.6 + severity * 5.5);
          for (var x = 0; x < width; x++) {
            var sx = x - rowDrift;
            var sy = y - verticalJitter;
            var alpha = alphaAt(sx, sy);
            if (erosionRadius > 0 && alpha > 0) {
              var eroded = Math.min(alpha, alphaAt(sx - erosionRadius, sy), alphaAt(sx + erosionRadius, sy),
                alphaAt(sx, sy - erosionRadius), alphaAt(sx, sy + erosionRadius));
              alpha += (eroded - alpha) * Math.min(1, erosion * 0.07 + severity * 0.34);
            }
            if (toner > 0.01) {
              var spread = Math.max(alpha, alphaAt(sx - tonerRadius, sy), alphaAt(sx + tonerRadius, sy),
                alphaAt(sx, sy - tonerRadius), alphaAt(sx, sy + tonerRadius));
              alpha += (spread - alpha) * Math.min(0.88, toner * 0.17 + severity * 0.16);
            }
            var noise = surfaceNoise01(x, y, params.seed + generations * 17 + 919);
            var coarse = surfaceNoise01(x >> 2, y >> 2, params.seed + generations * 29 + 929);
            var dropout = Math.min(0.82, dust * 0.055 + severity * 0.12 + Math.max(0, -exposure) * 0.08);
            if (alpha > 0.01 && noise < dropout * (0.42 + coarse * 0.58)) alpha *= 0.03 + coarse * 0.16;
            var level = (alpha - threshold) * gain + 0.5;
            level = Math.max(0, Math.min(1, level));
            level = level * level * (3 - 2 * level);
            if (level < 0.012 && dust > 0.01) {
              var nearby = Math.max(alphaAt(sx - tonerRadius * 2, sy), alphaAt(sx + tonerRadius * 2, sy),
                alphaAt(sx, sy - tonerRadius * 2), alphaAt(sx, sy + tonerRadius * 2));
              if (nearby > 0.08 && coarse > 0.92 - Math.min(0.18, dust * 0.035)) level = dust * 0.06 * coarse;
            }
            if (level <= 0.002) continue;
            var index = (y * width + x) * 4;
            output.data[index] = output.data[index + 1] = output.data[index + 2] = 255;
            output.data[index + 3] = Math.round(255 * level * generationAggregate.strength);
          }
        }

        // Destination material shading; the analysis grid and topology stay fixed.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext,discard=new Float64Array(4);RC.field(output,function(px,py,rgba){var x=px-.5,y=py-.5,outputX=x,outputY=y;function outputAlphaAt(x,y){return RC.rasterSample(source.data,width,height,x,y,3)/255;}
          var band = Math.floor(y / bandHeight);
          var bandNoise = surfaceNoise01(band, generations, params.seed + 907);
          var scanWave = Math.sin(y * (0.008 + severity * 0.035) + phase + params.seed * 0.13);
          var rowDrift = motion * (0.12 + severity * 0.88) * (0.18 + bandNoise * 0.82)
            + motion * scanWave * (0.04 + severity * 0.12);
          var verticalJitter = (surfaceNoise01(band, 7, params.seed + 911) * 2 - 1) * (0.6 + severity * 5.5);

            var sx = x - rowDrift;
            var sy = y - verticalJitter;
            var alpha = outputAlphaAt(sx, sy);
            if (erosionRadius > 0 && alpha > 0) {
              var eroded = Math.min(alpha, outputAlphaAt(sx - erosionRadius, sy), outputAlphaAt(sx + erosionRadius, sy),
                outputAlphaAt(sx, sy - erosionRadius), outputAlphaAt(sx, sy + erosionRadius));
              alpha += (eroded - alpha) * Math.min(1, erosion * 0.07 + severity * 0.34);
            }
            if (toner > 0.01) {
              var spread = Math.max(alpha, outputAlphaAt(sx - tonerRadius, sy), outputAlphaAt(sx + tonerRadius, sy),
                outputAlphaAt(sx, sy - tonerRadius), outputAlphaAt(sx, sy + tonerRadius));
              alpha += (spread - alpha) * Math.min(0.88, toner * 0.17 + severity * 0.16);
            }
            var noise = surfaceNoise01(Math.floor(x), Math.floor(y), params.seed + generations * 17 + 919);
            var coarse = surfaceNoise01(x >> 2, y >> 2, params.seed + generations * 29 + 929);
            var dropout = Math.min(0.82, dust * 0.055 + severity * 0.12 + Math.max(0, -exposure) * 0.08);
            if (alpha > 0.01 && noise < dropout * (0.42 + coarse * 0.58)) alpha *= 0.03 + coarse * 0.16;
            var level = (alpha - threshold) * gain + 0.5;
            level = Math.max(0, Math.min(1, level));
            level = level * level * (3 - 2 * level);
            if (level < 0.012 && dust > 0.01) {
              var nearby = Math.max(outputAlphaAt(sx - tonerRadius * 2, sy), outputAlphaAt(sx + tonerRadius * 2, sy),
                outputAlphaAt(sx, sy - tonerRadius * 2), outputAlphaAt(sx, sy + tonerRadius * 2));
              if (nearby > 0.08 && coarse > 0.92 - Math.min(0.18, dust * 0.035)) level = dust * 0.06 * coarse;
            }
            if (level <= 0.002) return;
            var index = (y * width + x) * 4;
            rgba[0] = rgba[1] = rgba[2] = 255;
            rgba[3] = Math.round(255 * level * generationAggregate.strength);


        });}
        work.ctx.putImageData(output, 0, 0);
        paintSurfaceMask(targetCtx, work.canvas, surfaceEffectColor('copyDecay'), 1, 'copy-decay-color');
      }

      function renderCopyTransfer(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var aggregate = surfaceAggregate(glyphs, 'copyDecay', 'copyGenerations', params.copyGenerations);
        if (!aggregate.weight) return;
        var profile = {}, keys = ['copyGenerations', 'copyMotion', 'copyInstability', 'copyToner', 'copyErosion', 'copyDust', 'copyExposure'];
        for (var k = 0; k < keys.length; k++) profile[keys[k]] = surfaceAggregate(glyphs, 'copyDecay', keys[k], params[keys[k]]).value;
        var units = Math.max(0.0001, pixelScale * L.s);
        var mask = buildSurfaceMask(glyphs, 'copyDecay', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'copyDecay', coverBase);
        var weighted = mask.getContext('2d').getImageData(0, 0, width, height).data;
        // Draw full coverage only for selected glyphs. Preserve glyph opacity
        // in assignment mass, not in the nonlinear density simulation.
        var fullGlyphs = [];
        for (var g = 0; g < glyphs.length; g++) if (surfaceGlyphStrength(glyphs[g], 'copyDecay') > 0.002) {
          var full = Object.assign({}, glyphs[g]);
          full.surface = Object.assign({}, glyphs[g].surface, { copyDecay: 1 }); full.opacity = 1;
          fullGlyphs.push(full);
        }
        var fullMask = buildSurfaceMask(fullGlyphs, 'copyDecay', width, height, pixelScale, L, fm);
        var rgba = fullMask.getContext('2d').getImageData(0, 0, width, height).data;
        var minX = width, minY = height, maxX = -1, maxY = -1;
        for (var i = 0; i < width * height; i++) if (rgba[i * 4 + 3]) {
          var px = i % width, py = (i / width) | 0;
          minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
        }
        if (maxX < 0) return;
        var pad = Math.ceil(copyTransferPad(profile) * units + Math.max(0, 1 - units) * 96);
        minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
        maxX = Math.min(width - 1, maxX + pad); maxY = Math.min(height - 1, maxY + pad);
        var w = maxX - minX + 1, h = maxY - minY + 1, count = w * h;
        var ink = new Float32Array(count), mass = new Float32Array(count);
        var nextInk = new Float32Array(count), nextMass = new Float32Array(count), fields = new Float32Array(count);
        var seed = params.seed, pow = Math.pow;
        for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
          var index = y * w + x, source = ((minY + y) * width + minX + x) * 4;
          ink[index] = rgba[source + 3] / 255; mass[index] = weighted[source + 3] / 255;
          var wx = (minX + x - (L.dx || 0) * pixelScale) / units;
          var wy = (minY + y - (L.dy || 0) * pixelScale) / units;
          var fine = surfaceNoise01(Math.floor(wx), Math.floor(wy), seed + 2393);
          var fiber = surfaceNoise01(Math.floor(wx / 2.3), Math.floor(wy / 6.1), seed + 2399);
          fields[index] = 0.006 + pow(fine, 10) * 0.18 + pow(fiber, 8) * 0.12;
        }
        var n = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('copyGenerations', Math.round(profile.copyGenerations), 0, 1, 48) : Math.max(1, Math.min(48, Math.round(profile.copyGenerations))));
        var options = { units: units, x: minX, y: minY, dy: (L.dy || 0) * pixelScale, seed: seed,
          phase: compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0,
          motion: profile.copyMotion, instability: profile.copyInstability, toner: profile.copyToner,
          erosion: profile.copyErosion, dust: profile.copyDust, exposure: profile.copyExposure };
        for (var generation = 0; generation < n; generation++) {
          copyTransferStep(ink, mass, nextInk, nextMass, w, h, fields, options, generation);
          var swap = ink; ink = nextInk; nextInk = swap; swap = mass; mass = nextMass; nextMass = swap;
        }
        var work = surfaceScratch('copy-transfer', width, height, false), output = work.ctx.createImageData(w, h);
        for (var p = 0; p < count; p++) {
          output.data[p * 4] = output.data[p * 4 + 1] = output.data[p * 4 + 2] = 255;
          output.data[p * 4 + 3] = Math.round(255 * mass[p]);
        }

        // Destination material shading; the analysis grid and topology stay fixed.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext,discard=new Float64Array(4);RC.field(output,function(px,py,rgba){var x=px-.5,y=py-.5,outputX=x,outputY=y;var p=Math.floor(y)*(w)+Math.floor(x);
          rgba[0] = rgba[1] = rgba[2] = 255;
          rgba[3] = Math.round(255 * RC.sample(mass,w,h,x,y));

        });}
        work.ctx.putImageData(output, minX, minY);
        paintSurfaceMask(targetCtx, work.canvas, surfaceEffectColor('copyDecay'), 1, 'copy-transfer-color');
      }

      function renderCopyDecay(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var failure = surfaceChoice(glyphs, 'copyDecay', 'copyFailure', params.copyFailure, BATCH_PARAM_OPTIONS.copyFailure);
        if (failure === 'transfer') {
          renderCopyTransfer(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        var copyV29 = /V29$/.test(failure);
        if (copyV29) failure = failure.slice(0, -3);
        if (failure === 'legacy') {
          renderCopyDecayLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        var generationAggregate = surfaceAggregate(glyphs, 'copyDecay', 'copyGenerations', params.copyGenerations);
        if (!generationAggregate.weight) return;
        var generations = Math.max(1, Math.round(generationAggregate.value));
        var exposure = surfaceAggregate(glyphs, 'copyDecay', 'copyExposure', params.copyExposure).value;
        var motion = surfaceAggregate(glyphs, 'copyDecay', 'copyMotion', params.copyMotion).value * pixelScale * L.s;
        var erosion = surfaceAggregate(glyphs, 'copyDecay', 'copyErosion', params.copyErosion).value * pixelScale * L.s;
        var toner = Math.max(0, surfaceAggregate(glyphs, 'copyDecay', 'copyToner', params.copyToner).value);
        var dust = Math.max(0, surfaceAggregate(glyphs, 'copyDecay', 'copyDust', params.copyDust).value);
        var instability = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('copyInstability', surfaceAggregate(glyphs, 'copyDecay', 'copyInstability', params.copyInstability).value, 0, 0, 4) : Math.max(0, Math.min(4, surfaceAggregate(glyphs, 'copyDecay', 'copyInstability', params.copyInstability).value)));
        var mask = buildSurfaceMask(glyphs, 'copyDecay', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'copyDecay', coverBase);
        var maskCtx = mask.getContext('2d', { willReadFrequently: true });
        var source;
        try { source = maskCtx.getImageData(0, 0, width, height); }
        catch (error) { return; }
        var sourceData = source.data;
        var boundary = (!copyV29 || failure === 'residual') ? surfaceBoundaryDistance(sourceData, width, height) : null;
        if (boundary && !boundary.bounds) return;
        var work = surfaceScratch('copy-decay-v25', width, height, false);
        var output = work.ctx.createImageData(width, height);
        var severity = Math.min(1, (generations - 1) / 32);
        var phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var erosionRadius = Math.max(0, Math.min(30, Math.round(erosion * (0.22 + severity * 0.62 + instability * 0.08))));
        var tonerRadius = Math.max(1, Math.min(36, Math.round((1 + toner * 3.8 + instability) * pixelScale * L.s)));
        var threshold = Math.max(0.04, Math.min(0.93, 0.46 - exposure * 0.23 - toner * 0.028 + severity * 0.03));
        var gain = 2.15 + generations * 0.074 + Math.abs(exposure) * 0.76 + instability * 0.09;
        var bandHeight = Math.max(1, Math.round(18 - severity * 9 - instability * 1.8));
        var motionSign = motion < 0 ? -1 : 1;
        var motionMagnitude = Math.abs(motion);
        var ghostCount = Math.max(2, Math.min(10, Math.round(2 + generations * 0.09 + instability * 1.35)));

        function alphaAt(x, y) {
          x = Math.round(x); y = Math.round(y);
          if (x < 0 || x >= width || y < 0 || y >= height) return 0;
          return sourceData[(y * width + x) * 4 + 3] / 255;
        }

        for (var y = 0; y < height; y++) {
          var band = Math.floor(y / bandHeight);
          var bandRandom = surfaceNoise01(band, generations, params.seed + 2203);
          var bandWave = Math.sin(y * (0.012 + instability * 0.018) + phase + params.seed * 0.17);
          var rowJitter = (bandRandom * 2 - 1) * instability * (0.8 + severity * 3.2);
          for (var x = 0; x < width; x++) {
            var alpha = 0;
            var defectLevel = 0;
            var sourceX = x, sourceY = y;
            if (failure === 'generational') {
              var drift = motion * (0.06 + severity * 0.28) * (0.25 + bandRandom * 0.75);
              sourceX -= drift + rowJitter;
              sourceY -= Math.sin(y * 0.019 + phase) * instability * (0.6 + severity * 1.8);
              alpha = alphaAt(sourceX, sourceY);
              var copies = Math.min(5, 1 + Math.floor(generations / 9));
              for (var copy = 1; copy <= copies; copy++) {
                var copyT = copy / (copies + 1);
                var copyAlpha = alphaAt(sourceX - motion * copyT * 0.2,
                  sourceY + (surfaceNoise01(copy, band, params.seed + 2213) * 2 - 1) * instability * 2.5);
                alpha = Math.max(alpha, copyAlpha * (0.34 - copyT * 0.18));
                defectLevel = Math.max(defectLevel, copyAlpha * (0.2 + instability * 0.045) * (1 - copyT * 0.58));
              }
            } else if (failure === 'banding') {
              sourceX -= rowJitter + motion * bandWave * (0.015 + instability * 0.012);
              alpha = alphaAt(sourceX, y);
              var hardBand = Math.sin((y / Math.max(1, bandHeight)) * Math.PI + phase * 0.32);
              var density = 0.56 + bandWave * (0.12 + instability * 0.09) + hardBand * (0.08 + instability * 0.055);
              if (band % Math.max(2, Math.round(8 - instability)) === 0) density *= 0.42 + bandRandom * 0.38;
              alpha *= Math.max(0.04, Math.min(1.35, density + exposure * 0.12));
              if (!copyV29 && x >= boundary.bounds[0] - tonerRadius && x <= boundary.bounds[2] + tonerRadius
                && boundary.distance[y * width + x] < tonerRadius * (0.72 + instability * 0.24)) {
                var bandScar = Math.max(0, 0.5 - Math.abs(hardBand) * 0.5);
                defectLevel = Math.max(defectLevel, bandScar * (0.16 + instability * 0.06 + toner * 0.025));
              }
            } else if (failure === 'ghosting') {
              alpha = alphaAt(x - rowJitter * 0.22, y);
              for (var ghost = 1; ghost <= ghostCount; ghost++) {
                var ghostT = ghost / ghostCount;
                var ghostDistance = motionMagnitude * ghostT;
                var ghostX = x - motionSign * ghostDistance * (0.18 + instability * 0.035);
                var ghostY = y - motionSign * ghostDistance * (0.82 - instability * 0.035);
                var ghostAlpha = alphaAt(ghostX, ghostY);
                var ghostGain = (0.42 + instability * 0.12) * Math.pow(1 - ghostT, 0.7 + severity * 0.8) / Math.sqrt(ghostCount * 0.55);
                alpha = Math.max(alpha, ghostAlpha * ghostGain);
                defectLevel = Math.max(defectLevel, ghostAlpha * ghostGain * (0.76 + toner * 0.08));
              }
            } else {
              alpha = alphaAt(x - rowJitter * 0.18, y);
              var distance = boundary && boundary.bounds ? boundary.distance[y * width + x] : 100000;
              var contaminationReach = tonerRadius * (2.2 + toner * 0.55 + instability * 0.7);
              if (distance < contaminationReach) {
                var smear = alphaAt(x - motion * 0.12, y - motionSign * Math.min(motionMagnitude, contaminationReach) * 0.22);
                var residueNoise = surfaceNoise01(x >> 2, y >> 2, params.seed + 2221);
                var streak = Math.max(0, Math.sin(y * (0.024 + instability * 0.012) + phase + params.seed * 0.11));
                var fog = (1 - distance / contaminationReach) * (0.04 + toner * 0.055 + instability * 0.045)
                  * (0.32 + residueNoise * 0.68) * (0.54 + streak * 0.46);
                alpha = Math.max(alpha, smear * (0.16 + instability * 0.08), fog);
                defectLevel = Math.max(defectLevel, fog * (2.2 + toner * 0.26), smear * (0.1 + instability * 0.04));
              }
            }

            if (erosionRadius > 0 && alpha > 0.002) {
              var eroded = Math.min(alpha, alphaAt(sourceX - erosionRadius, sourceY), alphaAt(sourceX + erosionRadius, sourceY),
                alphaAt(sourceX, sourceY - erosionRadius), alphaAt(sourceX, sourceY + erosionRadius));
              alpha += (eroded - alpha) * Math.min(0.94, erosion * 0.065 + severity * 0.25 + instability * 0.055);
            }
            if (toner > 0.01 && failure !== 'residual') {
              var spread = Math.max(alpha, alphaAt(sourceX - tonerRadius, sourceY), alphaAt(sourceX + tonerRadius, sourceY),
                alphaAt(sourceX, sourceY - tonerRadius), alphaAt(sourceX, sourceY + tonerRadius));
              alpha += (spread - alpha) * Math.min(0.9, toner * 0.15 + instability * 0.045);
            }
            var fineNoise = surfaceNoise01(x, y, params.seed + generations * 19 + 2237);
            var coarseNoise = surfaceNoise01(x >> 2, y >> 2, params.seed + generations * 31 + 2239);
            var dropout = Math.min(0.88, dust * 0.052 + severity * 0.095 + instability * 0.035 + Math.max(0, -exposure) * 0.07);
            if (alpha > 0.006 && fineNoise < dropout * (0.38 + coarseNoise * 0.62)) alpha *= 0.025 + coarseNoise * 0.18;
            var level = (alpha - threshold) * gain + 0.5;
            level = Math.max(0, Math.min(1, level));
            level = level * level * (3 - 2 * level);
            var sourceIndex = y * width + x;
            if (!copyV29 && !boundary.inside[sourceIndex] && boundary.distance[sourceIndex] < tonerRadius * (1.2 + instability * 0.42)) {
              var haloNoise = surfaceNoise01(x >> 1, y >> 1, params.seed + 2243);
              var haloFalloff = 1 - boundary.distance[sourceIndex] / Math.max(1, tonerRadius * (1.2 + instability * 0.42));
              if (haloNoise > 0.72 - Math.min(0.24, toner * 0.035 + dust * 0.025)) {
                defectLevel = Math.max(defectLevel, haloFalloff * haloFalloff
                  * (0.08 + toner * 0.035 + dust * 0.026 + instability * 0.025));
              }
            }
            if (!copyV29) {
              var defectGain = failure === 'ghosting' ? 1.4 : (failure === 'residual' ? 1.18 : 0.92);
              level = Math.max(level, Math.min(0.92, defectLevel * defectGain * generationAggregate.strength));
            }
            if (level <= 0.002) continue;
            var pixel = (y * width + x) * 4;
            output.data[pixel] = output.data[pixel + 1] = output.data[pixel + 2] = 255;
            output.data[pixel + 3] = Math.round(255 * level * generationAggregate.strength);
          }
        }

        // Destination material shading; the analysis grid and topology stay fixed.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext,discard=new Float64Array(4);RC.field(output,function(px,py,rgba){var x=px-.5,y=py-.5,outputX=x,outputY=y;function outputAlphaAt(x,y){return RC.rasterSample(source.data,width,height,x,y,3)/255;}
          var band = Math.floor(y / bandHeight);
          var bandRandom = surfaceNoise01(band, generations, params.seed + 2203);
          var bandWave = Math.sin(y * (0.012 + instability * 0.018) + phase + params.seed * 0.17);
          var rowJitter = (bandRandom * 2 - 1) * instability * (0.8 + severity * 3.2);

            var alpha = 0;
            var defectLevel = 0;
            var sourceX = x, sourceY = y;
            if (failure === 'generational') {
              var drift = motion * (0.06 + severity * 0.28) * (0.25 + bandRandom * 0.75);
              sourceX -= drift + rowJitter;
              sourceY -= Math.sin(y * 0.019 + phase) * instability * (0.6 + severity * 1.8);
              alpha = outputAlphaAt(sourceX, sourceY);
              var copies = Math.min(5, 1 + Math.floor(generations / 9));
              for (var copy = 1; copy <= copies; copy++) {
                var copyT = copy / (copies + 1);
                var copyAlpha = outputAlphaAt(sourceX - motion * copyT * 0.2,
                  sourceY + (surfaceNoise01(copy, band, params.seed + 2213) * 2 - 1) * instability * 2.5);
                alpha = Math.max(alpha, copyAlpha * (0.34 - copyT * 0.18));
                defectLevel = Math.max(defectLevel, copyAlpha * (0.2 + instability * 0.045) * (1 - copyT * 0.58));
              }
            } else if (failure === 'banding') {
              sourceX -= rowJitter + motion * bandWave * (0.015 + instability * 0.012);
              alpha = outputAlphaAt(sourceX, y);
              var hardBand = Math.sin((y / Math.max(1, bandHeight)) * Math.PI + phase * 0.32);
              var density = 0.56 + bandWave * (0.12 + instability * 0.09) + hardBand * (0.08 + instability * 0.055);
              if (band % Math.max(2, Math.round(8 - instability)) === 0) density *= 0.42 + bandRandom * 0.38;
              alpha *= Math.max(0.04, Math.min(1.35, density + exposure * 0.12));
              if (!copyV29 && x >= boundary.bounds[0] - tonerRadius && x <= boundary.bounds[2] + tonerRadius
                && boundary.distance[y * width + x] < tonerRadius * (0.72 + instability * 0.24)) {
                var bandScar = Math.max(0, 0.5 - Math.abs(hardBand) * 0.5);
                defectLevel = Math.max(defectLevel, bandScar * (0.16 + instability * 0.06 + toner * 0.025));
              }
            } else if (failure === 'ghosting') {
              alpha = outputAlphaAt(x - rowJitter * 0.22, y);
              for (var ghost = 1; ghost <= ghostCount; ghost++) {
                var ghostT = ghost / ghostCount;
                var ghostDistance = motionMagnitude * ghostT;
                var ghostX = x - motionSign * ghostDistance * (0.18 + instability * 0.035);
                var ghostY = y - motionSign * ghostDistance * (0.82 - instability * 0.035);
                var ghostAlpha = outputAlphaAt(ghostX, ghostY);
                var ghostGain = (0.42 + instability * 0.12) * Math.pow(1 - ghostT, 0.7 + severity * 0.8) / Math.sqrt(ghostCount * 0.55);
                alpha = Math.max(alpha, ghostAlpha * ghostGain);
                defectLevel = Math.max(defectLevel, ghostAlpha * ghostGain * (0.76 + toner * 0.08));
              }
            } else {
              alpha = outputAlphaAt(x - rowJitter * 0.18, y);
              var distance = boundary && boundary.bounds ? boundary.distance[y * width + x] : 100000;
              var contaminationReach = tonerRadius * (2.2 + toner * 0.55 + instability * 0.7);
              if (distance < contaminationReach) {
                var smear = outputAlphaAt(x - motion * 0.12, y - motionSign * Math.min(motionMagnitude, contaminationReach) * 0.22);
                var residueNoise = surfaceNoise01(x >> 2, y >> 2, params.seed + 2221);
                var streak = Math.max(0, Math.sin(y * (0.024 + instability * 0.012) + phase + params.seed * 0.11));
                var fog = (1 - distance / contaminationReach) * (0.04 + toner * 0.055 + instability * 0.045)
                  * (0.32 + residueNoise * 0.68) * (0.54 + streak * 0.46);
                alpha = Math.max(alpha, smear * (0.16 + instability * 0.08), fog);
                defectLevel = Math.max(defectLevel, fog * (2.2 + toner * 0.26), smear * (0.1 + instability * 0.04));
              }
            }

            if (erosionRadius > 0 && alpha > 0.002) {
              var eroded = Math.min(alpha, outputAlphaAt(sourceX - erosionRadius, sourceY), outputAlphaAt(sourceX + erosionRadius, sourceY),
                outputAlphaAt(sourceX, sourceY - erosionRadius), outputAlphaAt(sourceX, sourceY + erosionRadius));
              alpha += (eroded - alpha) * Math.min(0.94, erosion * 0.065 + severity * 0.25 + instability * 0.055);
            }
            if (toner > 0.01 && failure !== 'residual') {
              var spread = Math.max(alpha, outputAlphaAt(sourceX - tonerRadius, sourceY), outputAlphaAt(sourceX + tonerRadius, sourceY),
                outputAlphaAt(sourceX, sourceY - tonerRadius), outputAlphaAt(sourceX, sourceY + tonerRadius));
              alpha += (spread - alpha) * Math.min(0.9, toner * 0.15 + instability * 0.045);
            }
            var fineNoise = surfaceNoise01(Math.floor(x), Math.floor(y), params.seed + generations * 19 + 2237);
            var coarseNoise = surfaceNoise01(x >> 2, y >> 2, params.seed + generations * 31 + 2239);
            var dropout = Math.min(0.88, dust * 0.052 + severity * 0.095 + instability * 0.035 + Math.max(0, -exposure) * 0.07);
            if (alpha > 0.006 && fineNoise < dropout * (0.38 + coarseNoise * 0.62)) alpha *= 0.025 + coarseNoise * 0.18;
            var level = (alpha - threshold) * gain + 0.5;
            level = Math.max(0, Math.min(1, level));
            level = level * level * (3 - 2 * level);
            var sourceIndex=Math.floor(y)*width+Math.floor(x);
            if (!copyV29 && !((RC.sample(boundary.inside,width,height,x,y)>=.5)) && RC.sample(boundary.distance,width,height,x,y) < tonerRadius * (1.2 + instability * 0.42)) {
              var haloNoise = surfaceNoise01(x >> 1, y >> 1, params.seed + 2243);
              var haloFalloff = 1 - RC.sample(boundary.distance,width,height,x,y) / Math.max(1, tonerRadius * (1.2 + instability * 0.42));
              if (haloNoise > 0.72 - Math.min(0.24, toner * 0.035 + dust * 0.025)) {
                defectLevel = Math.max(defectLevel, haloFalloff * haloFalloff
                  * (0.08 + toner * 0.035 + dust * 0.026 + instability * 0.025));
              }
            }
            if (!copyV29) {
              var defectGain = failure === 'ghosting' ? 1.4 : (failure === 'residual' ? 1.18 : 0.92);
              level = Math.max(level, Math.min(0.92, defectLevel * defectGain * generationAggregate.strength));
            }
            if (level <= 0.002) return;
            var pixel = (y * width + x) * 4;
            rgba[0] = rgba[1] = rgba[2] = 255;
            rgba[3] = Math.round(255 * level * generationAggregate.strength);


        });}
        work.ctx.putImageData(output, 0, 0);
        paintSurfaceMask(targetCtx, work.canvas, surfaceEffectColor('copyDecay'), 1, 'copy-decay-v25-color');
      }

      function renderRisoSeparationLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var splitAggregate = surfaceAggregate(glyphs, 'risoSeparation', 'risoSplit', params.risoSplit);
        if (!splitAggregate.weight) return;
        var overlap = surfaceAggregate(glyphs, 'risoSeparation', 'risoOverlap', params.risoOverlap).value;
        var register = surfaceAggregate(glyphs, 'risoSeparation', 'risoRegister', params.risoRegister).value * pixelScale * L.s;
        var grain = surfaceAggregate(glyphs, 'risoSeparation', 'risoGrain', params.risoGrain).value;
        var mask = buildSurfaceMask(glyphs, 'risoSeparation', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'risoSeparation', coverBase);
        var maskCtx = mask.getContext('2d', { willReadFrequently: true });
        var source;
        try { source = maskCtx.getImageData(0, 0, width, height); }
        catch (error) { return; }
        var plateA = surfaceScratch('riso-plate-a', width, height, false);
        var plateB = surfaceScratch('riso-plate-b', width, height, false);
        var imageA = plateA.ctx.createImageData(width, height);
        var imageB = plateB.ctx.createImageData(width, height);
        var threshold = 0.5 + splitAggregate.value * 0.34;
        var overlapZone = 0.025 + overlap * 0.24;
        var time = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
          var index = y * width + x;
          var sourceAlpha = source.data[index * 4 + 3] / 255;
          if (sourceAlpha <= 0.004) continue;
          var field = 0.5 + Math.sin(x * 0.019 + y * 0.011 + params.seed * 0.31 + time * 0.25) * 0.23
            + Math.cos(x * 0.006 - y * 0.023 - params.seed * 0.17) * 0.16
            + (surfaceNoise01(x >> 3, y >> 3, params.seed + 881) - 0.5) * 0.18;
          var roughness = surfaceNoise01(x, y, params.seed + 887);
          var dropout = grain > 0.01 && roughness < Math.min(0.42, grain * 0.075);
          var variation = Math.max(0.08, 1 - grain * 0.22 + roughness * grain * 0.26);
          var alpha = Math.round(255 * sourceAlpha * variation * (dropout ? 0.05 : 1));
          if (field <= threshold + overlapZone) {
            imageA.data[index * 4] = imageA.data[index * 4 + 1] = imageA.data[index * 4 + 2] = 255;
            imageA.data[index * 4 + 3] = alpha;
          }
          if (field >= threshold - overlapZone) {
            imageB.data[index * 4] = imageB.data[index * 4 + 1] = imageB.data[index * 4 + 2] = 255;
            imageB.data[index * 4 + 3] = alpha;
          }
        }

        // Destination material shading; the analysis grid and topology stay fixed.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext,discard=new Float64Array(4);RC.field(imageA,function(px,py,rgba){var x=px-.5,y=py-.5,outputX=x,outputY=y;
          var index=Math.floor(y)*width+Math.floor(x);
          var sourceAlpha = RC.rasterSample(source.data,width,height,x,y,3) / 255;
          if (sourceAlpha <= 0.004) return;
          var field = 0.5 + Math.sin(x * 0.019 + y * 0.011 + params.seed * 0.31 + time * 0.25) * 0.23
            + Math.cos(x * 0.006 - y * 0.023 - params.seed * 0.17) * 0.16
            + (surfaceNoise01(x >> 3, y >> 3, params.seed + 881) - 0.5) * 0.18;
          var roughness = surfaceNoise01(Math.floor(x), Math.floor(y), params.seed + 887);
          var dropout = grain > 0.01 && roughness < Math.min(0.42, grain * 0.075);
          var variation = Math.max(0.08, 1 - grain * 0.22 + roughness * grain * 0.26);
          var alpha = Math.round(255 * sourceAlpha * variation * (dropout ? 0.05 : 1));
          if (field <= threshold + overlapZone) {
            rgba[0] = rgba[1] = rgba[2] = 255;
            rgba[3] = alpha;
          }
          if (field >= threshold - overlapZone) {
            discard[0] = discard[1] = discard[2] = 255;
            discard[3] = alpha;
          }

        });}
        plateA.ctx.putImageData(imageA, 0, 0);

        // Destination material shading; the analysis grid and topology stay fixed.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext,discard=new Float64Array(4);RC.field(imageB,function(px,py,rgba){var x=px-.5,y=py-.5,outputX=x,outputY=y;
          var index=Math.floor(y)*width+Math.floor(x);
          var sourceAlpha = RC.rasterSample(source.data,width,height,x,y,3) / 255;
          if (sourceAlpha <= 0.004) return;
          var field = 0.5 + Math.sin(x * 0.019 + y * 0.011 + params.seed * 0.31 + time * 0.25) * 0.23
            + Math.cos(x * 0.006 - y * 0.023 - params.seed * 0.17) * 0.16
            + (surfaceNoise01(x >> 3, y >> 3, params.seed + 881) - 0.5) * 0.18;
          var roughness = surfaceNoise01(Math.floor(x), Math.floor(y), params.seed + 887);
          var dropout = grain > 0.01 && roughness < Math.min(0.42, grain * 0.075);
          var variation = Math.max(0.08, 1 - grain * 0.22 + roughness * grain * 0.26);
          var alpha = Math.round(255 * sourceAlpha * variation * (dropout ? 0.05 : 1));
          if (field <= threshold + overlapZone) {
            discard[0] = discard[1] = discard[2] = 255;
            discard[3] = alpha;
          }
          if (field >= threshold - overlapZone) {
            rgba[0] = rgba[1] = rgba[2] = 255;
            rgba[3] = alpha;
          }

        });}
        plateB.ctx.putImageData(imageB, 0, 0);
        var coloredA = colorizeSurfaceCanvas(plateA.canvas, params.risoColorA, 'riso-color-a');
        var coloredB = colorizeSurfaceCanvas(plateB.canvas, params.risoColorB, 'riso-color-b');
        var direction = -0.58 + time;
        var offsetX = Math.cos(direction) * register;
        var offsetY = Math.sin(direction) * register;
        var scaleX = targetCtx.canvas.width / width;
        var scaleY = targetCtx.canvas.height / height;
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.globalAlpha = 0.94;
        targetCtx.drawImage(coloredA, -offsetX * scaleX, -offsetY * scaleY, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.globalCompositeOperation = 'multiply';
        targetCtx.drawImage(coloredB, offsetX * scaleX, offsetY * scaleY, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderRisoDuotone(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var split = surfaceAggregate(glyphs, 'risoSeparation', 'risoSplit', params.risoSplit);
        if (!split.weight) return;
        function value(key) { return surfaceAggregate(glyphs, 'risoSeparation', key, params[key]).value; }
        var units = Math.max(0.001, pixelScale * L.s), pressure = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('risoPressure', value('risoPressure'), 0, 0, 4) : Math.max(0, Math.min(4, value('risoPressure'))));
        var mask = buildSurfaceMask(glyphs, 'risoSeparation', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'risoSeparation', coverBase);
        var source;
        try { source = mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height); }
        catch (error) { return; }
        // Separate assigned ink mass from geometry. Low-strength glyphs must
        // not lose their silhouette at the distance-field alpha threshold.
        var fullGlyphs = [];
        for (var g = 0; g < glyphs.length; g++) if (surfaceGlyphStrength(glyphs[g], 'risoSeparation') > 0.002) {
          var full = Object.assign({}, glyphs[g]);
          full.surface = Object.assign({}, glyphs[g].surface, { risoSeparation: 1 }); full.opacity = 1;
          fullGlyphs.push(full);
        }
        var shape;
        try { shape = buildSurfaceMask(fullGlyphs, 'risoSeparation', width, height, pixelScale, L, fm).getContext('2d').getImageData(0, 0, width, height).data; }
        catch (error) { return; }
        var time = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var plates = risoDuotonePlates(source.data, width, height, units, {
          pressure: pressure, balance: (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('risoSplit', split.value, 0, -1, 1) : Math.max(-1, Math.min(1, split.value))), overlap: (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('risoOverlap', value('risoOverlap'), 0, 0, 1.5) : Math.max(0, Math.min(1.5, value('risoOverlap')))),
          depth: (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('risoToneDepth', value('risoToneDepth'), 0, 0, 160) : Math.max(0, Math.min(160, value('risoToneDepth')))), pitch: (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('risoScreenPitch', value('risoScreenPitch'), 0, 1, 48) : Math.max(1, Math.min(48, value('risoScreenPitch')))),
          grain: (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('risoGrain', value('risoGrain'), 0, 0, 2) : Math.max(0, Math.min(2, value('risoGrain')))), seed: params.seed
        }, time, shape);
        var a = surfaceScratch('riso-tonal-a', width, height, false), b = surfaceScratch('riso-tonal-b', width, height, false);
        var imageA = a.ctx.createImageData(width, height), imageB = b.ctx.createImageData(width, height);
        imageA.data.set(plates.a); imageB.data.set(plates.b);if(globalThis.TypeDeformerRenderContext){globalThis.TypeDeformerRenderContext.copyField(imageA,plates.a);globalThis.TypeDeformerRenderContext.copyField(imageB,plates.b);}
        a.ctx.putImageData(imageA, 0, 0); b.ctx.putImageData(imageB, 0, 0);
        var colorA = colorizeSurfaceCanvas(a.canvas, params.risoColorA, 'riso-tonal-color-a');
        var colorB = colorizeSurfaceCanvas(b.canvas, params.risoColorB, 'riso-tonal-color-b');
        var register = value('risoRegister') * units;
        var direction = -0.58 + risoLoopMotion(time).registration * (0.04 + pressure * 0.015);
        var dx = Math.cos(direction) * register * targetCtx.canvas.width / width;
        var dy = Math.sin(direction) * register * targetCtx.canvas.height / height;
        targetCtx.save();
        try {
          targetCtx.setTransform(1, 0, 0, 1, 0, 0);
          targetCtx.globalAlpha = Math.min(1, 0.82 + pressure * 0.055);
          targetCtx.drawImage(colorA, -dx, -dy, targetCtx.canvas.width, targetCtx.canvas.height);
          targetCtx.globalCompositeOperation = 'multiply';
          targetCtx.drawImage(colorB, dx, dy, targetCtx.canvas.width, targetCtx.canvas.height);
        } finally { targetCtx.restore(); }
      }

      function renderRisoSeparation(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var plateMap = surfaceChoice(glyphs, 'risoSeparation', 'risoPlateMap', params.risoPlateMap, BATCH_PARAM_OPTIONS.risoPlateMap);
        if (plateMap === 'duotone') {
          renderRisoDuotone(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        if (plateMap === 'legacy') {
          renderRisoSeparationLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        var splitAggregate = surfaceAggregate(glyphs, 'risoSeparation', 'risoSplit', params.risoSplit);
        if (!splitAggregate.weight) return;
        var overlap = Math.max(0, surfaceAggregate(glyphs, 'risoSeparation', 'risoOverlap', params.risoOverlap).value);
        var register = surfaceAggregate(glyphs, 'risoSeparation', 'risoRegister', params.risoRegister).value * pixelScale * L.s;
        var grain = Math.max(0, surfaceAggregate(glyphs, 'risoSeparation', 'risoGrain', params.risoGrain).value);
        var pressure = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('risoPressure', surfaceAggregate(glyphs, 'risoSeparation', 'risoPressure', params.risoPressure).value, 0, 0, 4) : Math.max(0, Math.min(4, surfaceAggregate(glyphs, 'risoSeparation', 'risoPressure', params.risoPressure).value)));
        var mask = buildSurfaceMask(glyphs, 'risoSeparation', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'risoSeparation', coverBase);
        var maskCtx = mask.getContext('2d', { willReadFrequently: true });
        var source;
        try { source = maskCtx.getImageData(0, 0, width, height); }
        catch (error) { return; }
        var boundary = surfaceBoundaryDistance(source.data, width, height);
        if (!boundary.bounds) return;
        var sourceData = source.data;
        var plateA = surfaceScratch('riso-plate-a-v25', width, height, false);
        var plateB = surfaceScratch('riso-plate-b-v25', width, height, false);
        var imageA = plateA.ctx.createImageData(width, height);
        var imageB = plateB.ctx.createImageData(width, height);
        var threshold = 0.5 + splitAggregate.value * 0.32;
        var overlapZone = 0.018 + overlap * (0.16 + pressure * 0.025);
        var time = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var motion = risoLoopMotion(time);
        var spreadRadius = Math.max(0, Math.min(10, Math.round(pressure * pixelScale * L.s * 1.35)));
        var edgeWidth = Math.max(1, (2.2 + pressure * 2.6 + overlap * 3.5) * pixelScale * L.s);
        var screenCell = Math.max(3, (10.5 - pressure * 1.15) * pixelScale * L.s);
        var angleA = 22 * Math.PI / 180;
        var angleB = 67 * Math.PI / 180;
        var cosA = Math.cos(angleA), sinA = Math.sin(angleA);
        var cosB = Math.cos(angleB), sinB = Math.sin(angleB);

        function alphaAt(x, y) {
          x = Math.round(x); y = Math.round(y);
          if (x < 0 || x >= width || y < 0 || y >= height) return 0;
          return sourceData[(y * width + x) * 4 + 3] / 255;
        }

        function screenDistance(u, v, cell, phaseOffset) {
          var localU = ((u + phaseOffset) % cell + cell) % cell - cell * 0.5;
          var localV = ((v + phaseOffset * 0.41) % cell + cell) % cell - cell * 0.5;
          return Math.sqrt(localU * localU + localV * localV);
        }

        for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
          var index = y * width + x;
          var sourceAlpha = sourceData[index * 4 + 3] / 255;
          var expandedAlpha = sourceAlpha;
          if (spreadRadius > 0 && sourceAlpha < 0.995) {
            expandedAlpha = Math.max(expandedAlpha, alphaAt(x - spreadRadius, y), alphaAt(x + spreadRadius, y),
              alphaAt(x, y - spreadRadius), alphaAt(x, y + spreadRadius));
            expandedAlpha = sourceAlpha + (expandedAlpha - sourceAlpha) * Math.min(0.92, pressure * 0.18);
          }
          if (expandedAlpha <= 0.003) continue;
          var roughness = surfaceNoise01(x, y, params.seed + 2267);
          var coarse = surfaceNoise01(x >> 3, y >> 3, params.seed + 2269);
          var dropout = grain > 0.01 && roughness < Math.min(0.48, grain * (0.055 + pressure * 0.012));
          var pressureGain = Math.min(1.2, 0.84 + pressure * 0.085 + coarse * grain * 0.18);
          var alpha = Math.round(255 * Math.min(1, expandedAlpha * pressureGain) * (dropout ? 0.035 + coarse * 0.09 : 1));
          var putA = false, putB = false;

          if (plateMap === 'edge') {
            var edgeDistance = boundary.distance[index];
            var keyPlate = edgeDistance <= edgeWidth * (1 + overlap * 0.28);
            putA = expandedAlpha > 0.01;
            putB = keyPlate || (overlap > 0.72 && boundary.inside[index] && edgeDistance < edgeWidth * (1.2 + overlap));
            if (putA && boundary.inside[index] && edgeDistance < edgeWidth * Math.max(0, 0.62 - pressure * 0.08)) {
              imageA.data[index * 4 + 3] = Math.round(alpha * Math.max(0.18, 0.82 - pressure * 0.08));
              putA = false;
            }
          } else if (plateMap === 'halftone') {
            var tone = Math.max(0.04, Math.min(1, expandedAlpha * (0.72 + pressure * 0.09)));
            var radiusA = screenCell * Math.min(0.68, Math.sqrt(tone) * (0.23 + (1 - splitAggregate.value) * 0.09 + overlap * 0.035));
            var radiusB = screenCell * Math.min(0.68, Math.sqrt(tone) * (0.23 + (1 + splitAggregate.value) * 0.09 + overlap * 0.035));
            var uA = x * cosA + y * sinA, vA = -x * sinA + y * cosA;
            var uB = x * cosB + y * sinB, vB = -x * sinB + y * cosB;
            putA = screenDistance(uA, vA, screenCell, motion.screenA * screenCell * 0.07) <= radiusA;
            putB = screenDistance(uB, vB, screenCell, screenCell * 0.31 - motion.screenB * screenCell * 0.05) <= radiusB;
          } else {
            var selection;
            if (plateMap === 'area') {
              var areaScale = Math.max(42, (96 - pressure * 9) * pixelScale * L.s);
              var areaX = (x * 0.82 + y * 0.57) / areaScale;
              var areaY = (y * 0.74 - x * 0.31) / (areaScale * 1.27);
              selection = 0.5 + Math.sin(areaX + params.seed * 0.23 + motion.area * 0.08) * 0.34
                + Math.cos(areaY * 1.37 - params.seed * 0.17) * 0.19;
            } else {
              selection = 0.5 + Math.sin(x * 0.019 + y * 0.011 + params.seed * 0.31 + motion.field * 0.23) * 0.23
                + Math.cos(x * 0.006 - y * 0.023 - params.seed * 0.17) * 0.16
                + (coarse - 0.5) * (0.14 + pressure * 0.035);
            }
            putA = selection <= threshold + overlapZone;
            putB = selection >= threshold - overlapZone;
          }

          if (putA) {
            imageA.data[index * 4] = imageA.data[index * 4 + 1] = imageA.data[index * 4 + 2] = 255;
            imageA.data[index * 4 + 3] = alpha;
          }
          if (putB) {
            imageB.data[index * 4] = imageB.data[index * 4 + 1] = imageB.data[index * 4 + 2] = 255;
            imageB.data[index * 4 + 3] = alpha;
          }
        }

        // Destination material shading; the analysis grid and topology stay fixed.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext,discard=new Float64Array(4);RC.field(imageA,function(px,py,rgba){var x=px-.5,y=py-.5,outputX=x,outputY=y;function outputAlphaAt(x,y){return RC.rasterSample(sourceData,width,height,x,y,3)/255;}
          var index=Math.floor(y)*width+Math.floor(x);
          var sourceAlpha = RC.rasterSample(sourceData,width,height,x,y,3) / 255;
          var expandedAlpha = sourceAlpha;
          if (spreadRadius > 0 && sourceAlpha < 0.995) {
            expandedAlpha = Math.max(expandedAlpha, outputAlphaAt(x - spreadRadius, y), outputAlphaAt(x + spreadRadius, y),
              outputAlphaAt(x, y - spreadRadius), outputAlphaAt(x, y + spreadRadius));
            expandedAlpha = sourceAlpha + (expandedAlpha - sourceAlpha) * Math.min(0.92, pressure * 0.18);
          }
          if (expandedAlpha <= 0.003) return;
          var roughness = surfaceNoise01(Math.floor(x), Math.floor(y), params.seed + 2267);
          var coarse = surfaceNoise01(x >> 3, y >> 3, params.seed + 2269);
          var dropout = grain > 0.01 && roughness < Math.min(0.48, grain * (0.055 + pressure * 0.012));
          var pressureGain = Math.min(1.2, 0.84 + pressure * 0.085 + coarse * grain * 0.18);
          var alpha = Math.round(255 * Math.min(1, expandedAlpha * pressureGain) * (dropout ? 0.035 + coarse * 0.09 : 1));
          var putA = false, putB = false;

          if (plateMap === 'edge') {
            var edgeDistance = RC.sample(boundary.distance,width,height,x,y);
            var keyPlate = edgeDistance <= edgeWidth * (1 + overlap * 0.28);
            putA = expandedAlpha > 0.01;
            putB = keyPlate || (overlap > 0.72 && (RC.sample(boundary.inside,width,height,x,y)>=.5) && edgeDistance < edgeWidth * (1.2 + overlap));
            if (putA && (RC.sample(boundary.inside,width,height,x,y)>=.5) && edgeDistance < edgeWidth * Math.max(0, 0.62 - pressure * 0.08)) {
              rgba[3] = Math.round(alpha * Math.max(0.18, 0.82 - pressure * 0.08));
              putA = false;
            }
          } else if (plateMap === 'halftone') {
            var tone = Math.max(0.04, Math.min(1, expandedAlpha * (0.72 + pressure * 0.09)));
            var radiusA = screenCell * Math.min(0.68, Math.sqrt(tone) * (0.23 + (1 - splitAggregate.value) * 0.09 + overlap * 0.035));
            var radiusB = screenCell * Math.min(0.68, Math.sqrt(tone) * (0.23 + (1 + splitAggregate.value) * 0.09 + overlap * 0.035));
            var uA = x * cosA + y * sinA, vA = -x * sinA + y * cosA;
            var uB = x * cosB + y * sinB, vB = -x * sinB + y * cosB;
            putA = screenDistance(uA, vA, screenCell, motion.screenA * screenCell * 0.07) <= radiusA;
            putB = screenDistance(uB, vB, screenCell, screenCell * 0.31 - motion.screenB * screenCell * 0.05) <= radiusB;
          } else {
            var selection;
            if (plateMap === 'area') {
              var areaScale = Math.max(42, (96 - pressure * 9) * pixelScale * L.s);
              var areaX = (x * 0.82 + y * 0.57) / areaScale;
              var areaY = (y * 0.74 - x * 0.31) / (areaScale * 1.27);
              selection = 0.5 + Math.sin(areaX + params.seed * 0.23 + motion.area * 0.08) * 0.34
                + Math.cos(areaY * 1.37 - params.seed * 0.17) * 0.19;
            } else {
              selection = 0.5 + Math.sin(x * 0.019 + y * 0.011 + params.seed * 0.31 + motion.field * 0.23) * 0.23
                + Math.cos(x * 0.006 - y * 0.023 - params.seed * 0.17) * 0.16
                + (coarse - 0.5) * (0.14 + pressure * 0.035);
            }
            putA = selection <= threshold + overlapZone;
            putB = selection >= threshold - overlapZone;
          }

          if (putA) {
            rgba[0] = rgba[1] = rgba[2] = 255;
            rgba[3] = alpha;
          }
          if (putB) {
            discard[0] = discard[1] = discard[2] = 255;
            discard[3] = alpha;
          }

        });}
        plateA.ctx.putImageData(imageA, 0, 0);

        // Destination material shading; the analysis grid and topology stay fixed.
        if(globalThis.TypeDeformerRenderContext){var RC=globalThis.TypeDeformerRenderContext,discard=new Float64Array(4);RC.field(imageB,function(px,py,rgba){var x=px-.5,y=py-.5,outputX=x,outputY=y;function outputAlphaAt(x,y){return RC.rasterSample(sourceData,width,height,x,y,3)/255;}
          var index=Math.floor(y)*width+Math.floor(x);
          var sourceAlpha = RC.rasterSample(sourceData,width,height,x,y,3) / 255;
          var expandedAlpha = sourceAlpha;
          if (spreadRadius > 0 && sourceAlpha < 0.995) {
            expandedAlpha = Math.max(expandedAlpha, outputAlphaAt(x - spreadRadius, y), outputAlphaAt(x + spreadRadius, y),
              outputAlphaAt(x, y - spreadRadius), outputAlphaAt(x, y + spreadRadius));
            expandedAlpha = sourceAlpha + (expandedAlpha - sourceAlpha) * Math.min(0.92, pressure * 0.18);
          }
          if (expandedAlpha <= 0.003) return;
          var roughness = surfaceNoise01(Math.floor(x), Math.floor(y), params.seed + 2267);
          var coarse = surfaceNoise01(x >> 3, y >> 3, params.seed + 2269);
          var dropout = grain > 0.01 && roughness < Math.min(0.48, grain * (0.055 + pressure * 0.012));
          var pressureGain = Math.min(1.2, 0.84 + pressure * 0.085 + coarse * grain * 0.18);
          var alpha = Math.round(255 * Math.min(1, expandedAlpha * pressureGain) * (dropout ? 0.035 + coarse * 0.09 : 1));
          var putA = false, putB = false;

          if (plateMap === 'edge') {
            var edgeDistance = RC.sample(boundary.distance,width,height,x,y);
            var keyPlate = edgeDistance <= edgeWidth * (1 + overlap * 0.28);
            putA = expandedAlpha > 0.01;
            putB = keyPlate || (overlap > 0.72 && (RC.sample(boundary.inside,width,height,x,y)>=.5) && edgeDistance < edgeWidth * (1.2 + overlap));
            if (putA && (RC.sample(boundary.inside,width,height,x,y)>=.5) && edgeDistance < edgeWidth * Math.max(0, 0.62 - pressure * 0.08)) {
              discard[3] = Math.round(alpha * Math.max(0.18, 0.82 - pressure * 0.08));
              putA = false;
            }
          } else if (plateMap === 'halftone') {
            var tone = Math.max(0.04, Math.min(1, expandedAlpha * (0.72 + pressure * 0.09)));
            var radiusA = screenCell * Math.min(0.68, Math.sqrt(tone) * (0.23 + (1 - splitAggregate.value) * 0.09 + overlap * 0.035));
            var radiusB = screenCell * Math.min(0.68, Math.sqrt(tone) * (0.23 + (1 + splitAggregate.value) * 0.09 + overlap * 0.035));
            var uA = x * cosA + y * sinA, vA = -x * sinA + y * cosA;
            var uB = x * cosB + y * sinB, vB = -x * sinB + y * cosB;
            putA = screenDistance(uA, vA, screenCell, motion.screenA * screenCell * 0.07) <= radiusA;
            putB = screenDistance(uB, vB, screenCell, screenCell * 0.31 - motion.screenB * screenCell * 0.05) <= radiusB;
          } else {
            var selection;
            if (plateMap === 'area') {
              var areaScale = Math.max(42, (96 - pressure * 9) * pixelScale * L.s);
              var areaX = (x * 0.82 + y * 0.57) / areaScale;
              var areaY = (y * 0.74 - x * 0.31) / (areaScale * 1.27);
              selection = 0.5 + Math.sin(areaX + params.seed * 0.23 + motion.area * 0.08) * 0.34
                + Math.cos(areaY * 1.37 - params.seed * 0.17) * 0.19;
            } else {
              selection = 0.5 + Math.sin(x * 0.019 + y * 0.011 + params.seed * 0.31 + motion.field * 0.23) * 0.23
                + Math.cos(x * 0.006 - y * 0.023 - params.seed * 0.17) * 0.16
                + (coarse - 0.5) * (0.14 + pressure * 0.035);
            }
            putA = selection <= threshold + overlapZone;
            putB = selection >= threshold - overlapZone;
          }

          if (putA) {
            discard[0] = discard[1] = discard[2] = 255;
            discard[3] = alpha;
          }
          if (putB) {
            rgba[0] = rgba[1] = rgba[2] = 255;
            rgba[3] = alpha;
          }

        });}
        plateB.ctx.putImageData(imageB, 0, 0);
        var coloredA = colorizeSurfaceCanvas(plateA.canvas, params.risoColorA, 'riso-color-a-v25');
        var coloredB = colorizeSurfaceCanvas(plateB.canvas, params.risoColorB, 'riso-color-b-v25');
        var direction = -0.58 + motion.registration * (0.04 + pressure * 0.015);
        var offsetX = Math.cos(direction) * register;
        var offsetY = Math.sin(direction) * register;
        var scaleX = targetCtx.canvas.width / width;
        var scaleY = targetCtx.canvas.height / height;
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.globalAlpha = Math.min(1, 0.82 + pressure * 0.055);
        targetCtx.drawImage(coloredA, -offsetX * scaleX, -offsetY * scaleY, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.globalCompositeOperation = 'multiply';
        targetCtx.drawImage(coloredB, offsetX * scaleX, offsetY * scaleY, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderSlitSweepLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var widthAggregate = surfaceAggregate(glyphs, 'slitSweep', 'slitWidth', params.slitWidth);
        if (!widthAggregate.weight) return;
        var travel = surfaceAggregate(glyphs, 'slitSweep', 'slitTravel', params.slitTravel).value * pixelScale * L.s;
        var frequency = surfaceAggregate(glyphs, 'slitSweep', 'slitFrequency', params.slitFrequency).value;
        var memory = Math.max(1, Math.round(surfaceAggregate(glyphs, 'slitSweep', 'slitMemory', params.slitMemory).value));
        var speed = surfaceAggregate(glyphs, 'slitSweep', 'slitSpeed', params.slitSpeed).value;
        var slit = Math.max(1, widthAggregate.value * pixelScale * L.s);
        var mask = buildSurfaceMask(glyphs, 'slitSweep', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'slitSweep', coverBase);
        var work = surfaceScratch('slit-sweep', width, height, false);
        var ctx = work.ctx;
        var vertical = params.slitAxis === 'vertical';
        var axisLength = vertical ? width : height;
        var bandCount = Math.max(1, Math.ceil(axisLength / slit));
        var historyStep = Math.max(1, Math.ceil(bandCount * memory / 5600));
        var phaseBase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) : surfaceFxPhase * speed;
        var phase = phaseBase * Math.PI * 2;
        ctx.globalCompositeOperation = 'lighter';
        for (var band = 0, position = 0; position < axisLength; band++, position += slit) {
          var size = Math.min(slit + 0.75, axisLength - position);
          var normalized = (position + size * 0.5) / Math.max(1, axisLength);
          var currentWave = Math.sin(normalized * frequency * Math.PI * 2 + phase);
          var currentOffset = travel * currentWave * 0.18;
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = widthAggregate.strength * 0.78;
          if (vertical) ctx.drawImage(mask, position, 0, size, height, position, currentOffset, size, height);
          else ctx.drawImage(mask, 0, position, width, size, currentOffset, position, width, size);
          ctx.globalCompositeOperation = 'lighter';
          for (var history = historyStep; history < memory; history += historyStep) {
            var t = memory <= 1 ? 0 : history / (memory - 1);
            var historicWave = Math.sin(normalized * frequency * Math.PI * 2 + phase - t * Math.PI * (0.8 + memory * 0.075));
            var offset = travel * (currentWave * 0.18 + (historicWave - currentWave) * t);
            var travelLimit = Math.abs(travel);
            offset = Math.max(-travelLimit, Math.min(travelLimit, offset));
            ctx.globalAlpha = widthAggregate.strength * (0.07 + (1 - t) * 0.32) / Math.max(1, Math.sqrt(memory / 5));
            if (vertical) ctx.drawImage(mask, position, 0, size, height, position, offset, size, height);
            else ctx.drawImage(mask, 0, position, width, size, offset, position, width, size);
          }
        }
        ctx.globalCompositeOperation = 'source-in';
        ctx.globalAlpha = 1;
        ctx.fillStyle = surfaceEffectColor('slitSweep');
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = 'source-over';
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderSlitSweep(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var timeMap = surfaceChoice(glyphs, 'slitSweep', 'slitTimeMap', params.slitTimeMap, BATCH_PARAM_OPTIONS.slitTimeMap);
        if (timeMap === 'legacy') {
          renderSlitSweepLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        var widthAggregate = surfaceAggregate(glyphs, 'slitSweep', 'slitWidth', params.slitWidth);
        if (!widthAggregate.weight) return;
        var travel = surfaceAggregate(glyphs, 'slitSweep', 'slitTravel', params.slitTravel).value * pixelScale * L.s;
        var frequency = surfaceAggregate(glyphs, 'slitSweep', 'slitFrequency', params.slitFrequency).value;
        var memory = Math.max(1, Math.round(surfaceAggregate(glyphs, 'slitSweep', 'slitMemory', params.slitMemory).value));
        var speed = surfaceAggregate(glyphs, 'slitSweep', 'slitSpeed', params.slitSpeed).value;
        var nonlinearity = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('slitNonlinearity', surfaceAggregate(glyphs, 'slitSweep', 'slitNonlinearity', params.slitNonlinearity).value, 0, 0, 4) : Math.max(0, Math.min(4, surfaceAggregate(glyphs, 'slitSweep', 'slitNonlinearity', params.slitNonlinearity).value)));
        var slit = Math.max(1, widthAggregate.value * pixelScale * L.s);
        var mask = buildSurfaceMask(glyphs, 'slitSweep', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'slitSweep', coverBase);
        var work = surfaceScratch('slit-sweep-v31-temporal-field', width, height, false);
        var ctx = work.ctx;
        ctx.imageSmoothingEnabled = true;
        var vertical = params.slitAxis === 'vertical';
        var axisLength = vertical ? width : height;
        var phaseBase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) : surfaceFxPhase * speed;
        var phase = phaseBase * Math.PI * 2;
        var bandCount = Math.max(1, Math.ceil(axisLength / slit));
        var maxDraws = 6800;
        var recursionCount = timeMap === 'feedback'
          ? Math.max(2, Math.min(8, 2 + Math.floor(nonlinearity * 1.2 + memory / 18))) : 1;
        if (bandCount * recursionCount > maxDraws) {
          recursionCount = Math.max(1, Math.floor(maxDraws / bandCount));
        }
        var foldSeam = 0.5 + Math.sin(phase) * Math.min(0.2, 0.045 + nonlinearity * 0.032);

        for (var band = 0, position = 0; position < axisLength; band++, position += slit) {
          var size = Math.min(slit + 0.75, axisLength - position);
          var normalized = (position + size * 0.5) / Math.max(1, axisLength);
          var rawTime = slitTimeCoordinateV31(timeMap, normalized, phase, frequency, nonlinearity, band);
          var discrete = timeMap === 'staircase' || timeMap === 'feedback';
          var samples = slitTemporalSamplesV31(rawTime, memory, discrete);
          var gap = timeMap === 'staircase'
            ? Math.min(size * 0.28, Math.max(0.7, (0.7 + nonlinearity * 0.68) * pixelScale * L.s)) : 0;
          var clipPosition = position + gap * 0.5;
          var clipSize = Math.max(0.2, size - gap);
          var clipX = vertical ? clipPosition : 0;
          var clipY = vertical ? 0 : clipPosition;
          var clipW = vertical ? clipSize : width;
          var clipH = vertical ? height : clipSize;
          var foldSide = normalized < foldSeam ? -1 : 1;
          var foldSpan = foldSide < 0 ? Math.max(0.08, foldSeam) : Math.max(0.08, 1 - foldSeam);
          var foldDistance = Math.min(1, Math.abs(normalized - foldSeam) / foldSpan);

          if (timeMap === 'feedback') {
            for (var recursion = recursionCount - 1; recursion >= 0; recursion--) {
              var recursiveTime = Math.max(-1, Math.min(1,
                samples[0].time + Math.sin(phase * (recursion + 1) + normalized * Math.PI * 2)
                * recursion * (0.045 + nonlinearity * 0.018)));
              slitDrawTemporalStateV31(ctx, mask, clipX, clipY, clipW, clipH, {
                mode: timeMap, time: recursiveTime, normalized: normalized, phase: phase,
                nonlinearity: nonlinearity, travel: travel, vertical: vertical, band: band,
                iteration: recursion, alpha: widthAggregate.strength * Math.pow(0.7, recursion)
                  * (recursion ? 0.52 + nonlinearity * 0.045 : 0.82),
                composite: recursion ? 'lighter' : 'source-over'
              });
            }
          } else {
            var modeAlpha = timeMap === 'staircase' ? 0.92 : timeMap === 'fold' ? 0.82 : 0.78;
            for (var sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
              slitDrawTemporalStateV31(ctx, mask, clipX, clipY, clipW, clipH, {
                mode: timeMap, time: samples[sampleIndex].time, normalized: normalized, phase: phase,
                nonlinearity: nonlinearity, travel: travel, vertical: vertical, band: band,
                foldSide: foldSide, foldDistance: foldDistance, iteration: 0,
                alpha: widthAggregate.strength * modeAlpha * samples[sampleIndex].weight
              });
            }
          }
        }

        if (timeMap === 'fold') {
          var seamPosition = foldSeam * axisLength;
          var seamWidth = Math.max(1, Math.min(slit * 1.8, (2 + nonlinearity * 2.2) * pixelScale * L.s));
          var seamClipX = vertical ? seamPosition - seamWidth : 0;
          var seamClipY = vertical ? 0 : seamPosition - seamWidth;
          var seamClipW = vertical ? seamWidth * 2 : width;
          var seamClipH = vertical ? height : seamWidth * 2;
          for (var seamSide = -1; seamSide <= 1; seamSide += 2) {
            slitDrawTemporalStateV31(ctx, mask, seamClipX, seamClipY, seamClipW, seamClipH, {
              mode: 'fold', time: seamSide, normalized: foldSeam, phase: phase,
              nonlinearity: nonlinearity, travel: travel, vertical: vertical,
              band: seamSide < 0 ? 0 : 1, foldSide: seamSide, foldDistance: 0,
              iteration: 0, alpha: widthAggregate.strength * 0.32, composite: 'lighter'
            });
          }
          ctx.save();
          ctx.globalCompositeOperation = 'destination-out';
          ctx.globalAlpha = Math.min(0.96, 0.62 + nonlinearity * 0.08);
          if (vertical) ctx.fillRect(seamPosition - Math.max(0.5, seamWidth * 0.1), 0,
            Math.max(1, seamWidth * 0.2), height);
          else ctx.fillRect(0, seamPosition - Math.max(0.5, seamWidth * 0.1), width,
            Math.max(1, seamWidth * 0.2));
          ctx.restore();
        }

        paintSurfaceMask(targetCtx, work.canvas, surfaceEffectColor('slitSweep'), 1,
          'slit-sweep-v31-temporal-color');
      }

      function renderSigilForgeLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var complexityAggregate = surfaceAggregate(glyphs, 'sigilForge', 'sigilComplexity', params.sigilComplexity);
        if (!complexityAggregate.weight) return;
        var reach = surfaceAggregate(glyphs, 'sigilForge', 'sigilReach', params.sigilReach).value * pixelScale * L.s;
        var symmetry = surfaceAggregate(glyphs, 'sigilForge', 'sigilSymmetry', params.sigilSymmetry).value;
        var stroke = Math.max(0.2, surfaceAggregate(glyphs, 'sigilForge', 'sigilStroke', params.sigilStroke).value * pixelScale * L.s);
        var barbs = surfaceAggregate(glyphs, 'sigilForge', 'sigilBarbs', params.sigilBarbs).value;
        var complexity = Math.max(1, Math.round(complexityAggregate.value));
        var mask = buildSurfaceMask(glyphs, 'sigilForge', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'sigilForge', coverBase);
        var nodes = surfaceNodesForGlyphs(glyphs, 'sigilForge', 96, pixelScale, L, 0, 0, 0);
        if (!nodes.length) return;

        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (var n = 0; n < nodes.length; n++) {
          minX = Math.min(minX, nodes[n].x - nodes[n].r);
          maxX = Math.max(maxX, nodes[n].x + nodes[n].r);
          minY = Math.min(minY, nodes[n].y - nodes[n].r);
          maxY = Math.max(maxY, nodes[n].y + nodes[n].r);
        }
        var axisX = (minX + maxX) * 0.5;
        var axisY = (minY + maxY) * 0.5;
        var spanY = Math.max(12, maxY - minY);
        var spanX = Math.max(12, maxX - minX);
        var axisReach = reach * (0.28 + Math.min(4, symmetry) * 0.12);
        var top = minY - axisReach;
        var bottom = maxY + axisReach;
        var work = surfaceScratch('sigil-forge', width, height, false);
        var ctx = work.ctx;
        var color = surfaceEffectColor('sigilForge');
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineCap = 'square';
        ctx.lineJoin = 'miter';
        ctx.lineWidth = stroke;

        function strokeBranch(endX, endY, alpha, salt) {
          var dx = endX - axisX;
          var bend = (hash(salt, params.seed % 101, 1601) * 2 - 1) * reach * 0.18;
          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
          ctx.beginPath();
          ctx.moveTo(axisX, endY + bend * 0.18);
          ctx.quadraticCurveTo(axisX + dx * (0.34 + hash(salt, 7, 1607) * 0.24), endY + bend, endX, endY);
          ctx.stroke();
          var barbCount = Math.min(6, Math.floor(barbs) + (hash(salt, 11, 1613) < barbs % 1 ? 1 : 0));
          for (var b = 0; b < barbCount; b++) {
            var t = 0.34 + (b + 1) / (barbCount + 2) * 0.54;
            var px = axisX + dx * t;
            var py = endY + bend * Math.sin(t * Math.PI) * 0.72;
            var side = dx < 0 ? -1 : 1;
            var barbLength = Math.min(Math.abs(dx) * 0.32 + reach * 0.08, reach * (0.1 + 0.035 * barbs));
            var vertical = (hash(salt, b, 1619) * 2 - 1) * barbLength * 0.72;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px - side * barbLength, py + vertical);
            ctx.stroke();
          }
          ctx.restore();
        }

        ctx.globalAlpha = 0.32 + complexityAggregate.strength * 0.58;
        ctx.beginPath();
        ctx.moveTo(axisX, top);
        ctx.lineTo(axisX, bottom);
        ctx.stroke();
        var nestedAxes = Math.min(3, Math.floor(Math.max(0, symmetry - 1)));
        for (var axis = 0; axis < nestedAxes; axis++) {
          var axisOffset = stroke * (3.2 + axis * 2.3);
          ctx.globalAlpha = 0.22 + complexityAggregate.strength * 0.24;
          ctx.beginPath();
          ctx.moveTo(axisX - axisOffset, top + axisReach * 0.2);
          ctx.lineTo(axisX - axisOffset, bottom - axisReach * 0.2);
          ctx.moveTo(axisX + axisOffset, top + axisReach * 0.2);
          ctx.lineTo(axisX + axisOffset, bottom - axisReach * 0.2);
          ctx.stroke();
        }

        var mirrorMix = Math.max(0, Math.min(1, symmetry));
        for (var i = 0; i < nodes.length; i++) {
          var node = nodes[i];
          var alpha = node.strength * (0.42 + hash(i, params.seed % 89, 1621) * 0.5);
          strokeBranch(node.x, node.y, alpha, i * 2 + 1);
          var mirrorX = axisX * 2 - node.x;
          if (mirrorMix > 0.01 && Math.abs(mirrorX - node.x) > stroke) {
            strokeBranch(mirrorX, node.y, alpha * mirrorMix, i * 2 + 2);
          }
          var diamond = Math.max(stroke * 2.4, Math.min(node.r * 0.22, reach * 0.11 + stroke * 3));
          ctx.save();
          ctx.translate(node.x, node.y);
          ctx.rotate(Math.PI / 4);
          ctx.globalAlpha = Math.min(1, 0.36 + node.strength * 0.56);
          ctx.strokeRect(-diamond * 0.5, -diamond * 0.5, diamond, diamond);
          if (hash(i, params.seed % 73, 1627) > 0.52) ctx.fillRect(-stroke * 0.7, -stroke * 0.7, stroke * 1.4, stroke * 1.4);
          ctx.restore();
        }

        for (var motif = 0; motif < complexity; motif++) {
          var t = (motif + 0.5) / complexity;
          var y = minY + spanY * t;
          var randomLength = reach * (0.16 + hash(motif, params.seed % 79, 1637) * 0.84);
          var structuralLength = Math.max(spanX * 0.16, randomLength) * (0.62 + Math.min(4, symmetry) * 0.12);
          var tilt = (hash(motif, complexity, 1643) * 2 - 1) * structuralLength * 0.34;
          ctx.globalAlpha = (0.18 + hash(motif, params.seed % 97, 1657) * 0.48) * complexityAggregate.strength;
          ctx.beginPath();
          ctx.moveTo(axisX - structuralLength, y + tilt);
          ctx.lineTo(axisX, y);
          if (symmetry > 0.02) ctx.lineTo(axisX + structuralLength, y - tilt * mirrorMix);
          else ctx.lineTo(axisX + structuralLength * (0.2 + hash(motif, 17, 1663)), y - tilt * 0.18);
          ctx.stroke();
          var mark = Math.max(stroke * 2, Math.min(12 * pixelScale, structuralLength * 0.08));
          ctx.save();
          ctx.translate(axisX, y);
          ctx.rotate(Math.PI / 4);
          ctx.strokeRect(-mark * 0.5, -mark * 0.5, mark, mark);
          ctx.restore();
        }

        var crown = Math.max(stroke * 4, Math.min(reach * 0.22 + stroke * 4, 34 * pixelScale));
        ctx.globalAlpha = 0.45 + complexityAggregate.strength * 0.45;
        ctx.beginPath();
        ctx.moveTo(axisX, top - crown * 0.45);
        ctx.lineTo(axisX - crown * 0.52, top + crown * 0.3);
        ctx.lineTo(axisX + crown * 0.52, top + crown * 0.3);
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(axisX, bottom + crown * 0.18, crown * 0.34, 0, Math.PI * 2);
        ctx.stroke();

        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderSigilForge(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var topology = surfaceChoice(glyphs, 'sigilForge', 'sigilTopology', params.sigilTopology, BATCH_PARAM_OPTIONS.sigilTopology);
        if (topology === 'legacy') {
          renderSigilForgeLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        var complexityAggregate = surfaceAggregate(glyphs, 'sigilForge', 'sigilComplexity', params.sigilComplexity);
        if (!complexityAggregate.weight) return;
        var binding = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('sigilBinding', surfaceAggregate(glyphs, 'sigilForge', 'sigilBinding', params.sigilBinding).value, 0, 0, 4) : Math.max(0, Math.min(4, surfaceAggregate(glyphs, 'sigilForge', 'sigilBinding', params.sigilBinding).value)));
        var complexity = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('sigilComplexity', Math.round(complexityAggregate.value), 0, 1, 24) : Math.max(1, Math.min(24, Math.round(complexityAggregate.value))));
        var reach = Math.max(0, surfaceAggregate(glyphs, 'sigilForge', 'sigilReach', params.sigilReach).value * pixelScale * L.s);
        var symmetry = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('sigilSymmetry', surfaceAggregate(glyphs, 'sigilForge', 'sigilSymmetry', params.sigilSymmetry).value, 0, 0, 4) : Math.max(0, Math.min(4, surfaceAggregate(glyphs, 'sigilForge', 'sigilSymmetry', params.sigilSymmetry).value)));
        var stroke = Math.max(0.2, surfaceAggregate(glyphs, 'sigilForge', 'sigilStroke', params.sigilStroke).value * pixelScale * L.s);
        var counterCuts = (globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.normalize('sigilBarbs', surfaceAggregate(glyphs, 'sigilForge', 'sigilBarbs', params.sigilBarbs).value, 0, 0, 6) : Math.max(0, Math.min(6, surfaceAggregate(glyphs, 'sigilForge', 'sigilBarbs', params.sigilBarbs).value)));
        var sourceMask = buildSurfaceMask(glyphs, 'sigilForge', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, sourceMask, 'sigilForge', coverBase);
        var components = prepareSigilComponentsV31(glyphs, width, height, pixelScale, L, fm, complexity);
        if (!components.length) return;

        var centerX = 0, centerY = 0, averageRadius = 0;
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (var componentIndex = 0; componentIndex < components.length; componentIndex++) {
          var componentNode = components[componentIndex].node;
          centerX += componentNode.x;
          centerY += componentNode.y;
          averageRadius += componentNode.r;
          minX = Math.min(minX, componentNode.x - componentNode.r);
          minY = Math.min(minY, componentNode.y - componentNode.r);
          maxX = Math.max(maxX, componentNode.x + componentNode.r);
          maxY = Math.max(maxY, componentNode.y + componentNode.r);
        }
        centerX /= components.length;
        centerY /= components.length;
        averageRadius /= components.length;
        var spanX = Math.max(12, maxX - minX), spanY = Math.max(12, maxY - minY);
        var phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var body = surfaceScratch('sigil-forge-v31-compound-body', width, height, false);
        var cuts = surfaceScratch('sigil-forge-v31-negative-counters', width, height, false);
        var bodyCtx = body.ctx, cutsCtx = cuts.ctx;
        bodyCtx.fillStyle = '#fff';
        bodyCtx.strokeStyle = '#fff';
        cutsCtx.fillStyle = '#fff';
        cutsCtx.strokeStyle = '#fff';
        bodyCtx.lineCap = bodyCtx.lineJoin = 'round';
        cutsCtx.lineCap = cutsCtx.lineJoin = 'round';
        var bodyWeight = Math.max(stroke * (4.5 + binding * 1.2),
          Math.min(averageRadius * 1.05, stroke * 7 + averageRadius * (0.16 + binding * 0.05)));
        var placed = [];

        function placeComponent(component, x, y, rotation, scaleX, scaleY, alpha) {
          sigilComponentTransformV31(bodyCtx, component, x, y, rotation, scaleX, scaleY,
            alpha, bodyWeight * (0.18 + binding * 0.028), pixelScale, L, fm);
          placed.push({ x: x, y: y, r: component.node.r * Math.max(Math.abs(scaleX), Math.abs(scaleY)),
            rotation: rotation, strength: component.strength, glyphIndex: component.glyphIndex });
        }

        if (topology === 'cartouche') {
          var cartoucheRadiusX = Math.max(averageRadius * 2.8, spanX * 0.3 + reach * (0.22 + binding * 0.055));
          var cartoucheRadiusY = Math.max(averageRadius * 2.15, spanY * 0.28 + reach * (0.14 + binding * 0.038));
          var cartoucheRotation = (hash(components.length, params.seed % 97, 3527) * 2 - 1) * 0.08 + Math.sin(phase) * 0.035;
          var cartoucheExponent = 2 + symmetry * 0.72;
          bodyCtx.globalAlpha = complexityAggregate.strength * 0.92;
          bodyCtx.lineWidth = bodyWeight;
          sigilSuperellipsePathV31(bodyCtx, centerX, centerY, cartoucheRadiusX, cartoucheRadiusY,
            cartoucheExponent, 48, cartoucheRotation);
          bodyCtx.stroke();
          var cartoucheCount = Math.min(32, Math.max(4, Math.max(components.length, complexity + Math.floor(binding * 2))));
          for (var cartoucheIndex = 0; cartoucheIndex < cartoucheCount; cartoucheIndex++) {
            var cartoucheAngle = cartoucheIndex / cartoucheCount * Math.PI * 2 + phase * 0.018;
            var cartouchePower = 2 / cartoucheExponent;
            var cartoucheCos = Math.cos(cartoucheAngle), cartoucheSin = Math.sin(cartoucheAngle);
            var localX = Math.sign(cartoucheCos) * Math.pow(Math.abs(cartoucheCos), cartouchePower) * cartoucheRadiusX;
            var localY = Math.sign(cartoucheSin) * Math.pow(Math.abs(cartoucheSin), cartouchePower) * cartoucheRadiusY;
            var targetX = centerX + localX * Math.cos(cartoucheRotation) - localY * Math.sin(cartoucheRotation);
            var targetY = centerY + localX * Math.sin(cartoucheRotation) + localY * Math.cos(cartoucheRotation);
            var component = components[cartoucheIndex % components.length];
            var componentScale = Math.max(0.38, Math.min(1.52, 0.62 + binding * 0.12 +
              hash(cartoucheIndex, component.glyphIndex, 3533) * 0.26));
            var tangent = Math.atan2(cartoucheRadiusY * Math.cos(cartoucheAngle), -cartoucheRadiusX * Math.sin(cartoucheAngle));
            placeComponent(component, targetX, targetY, tangent + cartoucheRotation,
              componentScale * (1 + symmetry * 0.035), componentScale * (0.76 + binding * 0.045),
              complexityAggregate.strength * (0.76 + component.strength * 0.22));
          }
          var crossCount = Math.min(6, Math.max(2, 2 + Math.floor(symmetry)));
          for (var cross = 0; cross < crossCount; cross++) {
            var crossA = placed[Math.floor(cross / crossCount * placed.length) % placed.length];
            var crossB = placed[(Math.floor(cross / crossCount * placed.length) + Math.floor(placed.length / 2)) % placed.length];
            sigilCurveLinkV31(bodyCtx, crossA, crossB, bodyWeight * (0.62 + binding * 0.07),
              Math.min(cartoucheRadiusY * 0.3, reach * 0.08), complexityAggregate.strength * 0.72, cross + 3541);
          }
          var cartoucheCoreCount = Math.min(5, Math.max(2, 2 + Math.floor(symmetry * 0.76)));
          for (var cartoucheCore = 0; cartoucheCore < cartoucheCoreCount; cartoucheCore++) {
            var coreSource = components[(cartoucheCore * 3 + Math.floor(binding)) % components.length];
            var coreFold = cartoucheCore - (cartoucheCoreCount - 1) * 0.5;
            var coreScale = 0.9 + binding * 0.1 + hash(cartoucheCore, coreSource.glyphIndex, 3543) * 0.22;
            placeComponent(coreSource,
              centerX + Math.cos(cartoucheRotation) * coreFold * bodyWeight * 0.68,
              centerY + Math.sin(cartoucheRotation) * coreFold * bodyWeight * 0.68,
              cartoucheRotation + coreFold * (0.13 + symmetry * 0.022),
              coreScale * (1 + symmetry * 0.04), coreScale * (0.74 + binding * 0.052),
              complexityAggregate.strength * 0.86);
          }
          cutsCtx.save();
          cutsCtx.globalAlpha = Math.min(0.96, 0.48 + counterCuts * 0.075);
          cutsCtx.lineWidth = Math.max(stroke * (0.58 + counterCuts * 0.1),
            bodyWeight * (0.11 + counterCuts * 0.018));
          sigilSuperellipsePathV31(cutsCtx, centerX, centerY,
            Math.max(1, cartoucheRadiusX - bodyWeight * 0.31),
            Math.max(1, cartoucheRadiusY - bodyWeight * 0.31),
            cartoucheExponent, 48, cartoucheRotation);
          cutsCtx.stroke();
          cutsCtx.restore();
          if (counterCuts > 0.02) {
            var cartoucheCutStride = Math.max(1, Math.round(6 - counterCuts * 0.72));
            for (var cartoucheCut = 0; cartoucheCut < cartoucheCount; cartoucheCut += cartoucheCutStride) {
              var cutNode = placed[cartoucheCut];
              sigilCutV31(cutsCtx, cutNode.x, cutNode.y,
                bodyWeight * (0.13 + counterCuts * 0.022),
                bodyWeight * (0.54 + counterCuts * 0.07),
                cutNode.rotation + Math.PI / 2, cartoucheCut % 3 ? 2 : 1,
                Math.min(1, 0.38 + counterCuts * 0.1));
            }
          }
          var centralCut = Math.min(cartoucheRadiusX, cartoucheRadiusY) * (0.1 + counterCuts * 0.026);
          sigilCutV31(cutsCtx, centerX, centerY, centralCut * (1.05 + symmetry * 0.08), centralCut,
            cartoucheRotation + Math.PI / 4, 1, Math.min(1, 0.48 + counterCuts * 0.12));
        } else if (topology === 'radial') {
          var radialCount = Math.min(28, Math.max(3, Math.max(components.length, complexity + Math.floor(symmetry * 2))));
          var radialRadius = Math.max(averageRadius * 5, Math.min(Math.max(width, height) * 0.44,
            Math.min(spanX, spanY) * 0.34 + reach * (0.52 + binding * 0.09)));
          var coreComponent = components[Math.floor(hash(params.seed, components.length, 3557) * components.length) % components.length];
          placeComponent(coreComponent, centerX, centerY, phase * 0.025, 1 + binding * 0.1,
            1 + binding * 0.1, complexityAggregate.strength * 0.96);
          var radialLobes = Math.min(18, Math.max(4, Math.round(radialCount * (0.48 + symmetry * 0.05))));
          bodyCtx.save();
          bodyCtx.globalAlpha = complexityAggregate.strength * 0.88;
          bodyCtx.lineWidth = bodyWeight * (0.58 + binding * 0.052);
          sigilRosettePathV31(bodyCtx, centerX, centerY, radialRadius * 0.48,
            radialLobes, 0.12 + symmetry * 0.018, phase * 0.08);
          bodyCtx.stroke();
          bodyCtx.restore();
          cutsCtx.save();
          cutsCtx.globalAlpha = Math.min(0.9, 0.42 + counterCuts * 0.08);
          cutsCtx.lineWidth = Math.max(stroke * 0.58, bodyWeight * (0.1 + counterCuts * 0.018));
          sigilRosettePathV31(cutsCtx, centerX, centerY, radialRadius * 0.48,
            radialLobes, 0.12 + symmetry * 0.018, phase * 0.08);
          cutsCtx.stroke();
          cutsCtx.restore();
          for (var radialIndex = 0; radialIndex < radialCount; radialIndex++) {
            var radialAngle = radialIndex / radialCount * Math.PI * 2 + phase * 0.032;
            var radialPulse = 0.72 + hash(radialIndex, params.seed % 89, 3559) * 0.32;
            var radialX = centerX + Math.cos(radialAngle) * radialRadius * radialPulse;
            var radialY = centerY + Math.sin(radialAngle) * radialRadius * radialPulse;
            var radialComponent = components[radialIndex % components.length];
            var radialScale = Math.max(0.38, Math.min(1.4, 0.58 + binding * 0.1 +
              hash(radialIndex, radialComponent.glyphIndex, 3563) * 0.25));
            sigilCurveLinkV31(bodyCtx, { x: centerX, y: centerY }, { x: radialX, y: radialY },
              bodyWeight * (0.58 + binding * 0.065), radialRadius * (0.035 + symmetry * 0.012),
              complexityAggregate.strength * 0.78, radialIndex + 3569);
            placeComponent(radialComponent, radialX, radialY, radialAngle + Math.PI / 2,
              radialScale * (1 + symmetry * 0.04), radialScale * (0.68 + binding * 0.055),
              complexityAggregate.strength * (0.74 + radialComponent.strength * 0.24));
            if (counterCuts > 0.02 && radialIndex % Math.max(1, Math.round(7 - counterCuts)) === 0) {
              sigilCutV31(cutsCtx, centerX + Math.cos(radialAngle) * radialRadius * 0.56,
                centerY + Math.sin(radialAngle) * radialRadius * 0.56,
                bodyWeight * (0.18 + counterCuts * 0.035), bodyWeight * (0.72 + counterCuts * 0.08),
                radialAngle, 0, Math.min(1, 0.46 + counterCuts * 0.09));
            }
          }
          for (var radialRail = 0; radialRail < radialCount; radialRail++) {
            if (radialRail % Math.max(1, Math.round(2.6 - symmetry * 0.34))) continue;
            var radialRailA = placed[radialRail + 1];
            var radialRailB = placed[(radialRail + 1) % radialCount + 1];
            sigilCurveLinkV31(bodyCtx, radialRailA, radialRailB,
              bodyWeight * (0.24 + binding * 0.032), radialRadius * (0.018 + symmetry * 0.008),
              complexityAggregate.strength * 0.64, radialRail + 3571);
          }
          sigilCutV31(cutsCtx, centerX, centerY, averageRadius * (0.2 + counterCuts * 0.055),
            averageRadius * (0.2 + counterCuts * 0.055), phase * 0.03, 0, Math.min(1, 0.54 + counterCuts * 0.075));
        } else if (topology === 'branching') {
          var branchCount = Math.min(28, Math.max(3, Math.max(components.length, complexity + Math.floor(binding * 2))));
          var branchHeight = Math.max(averageRadius * 5.2, spanY * 0.48 + reach * (0.5 + binding * 0.07));
          var branchWidth = Math.max(averageRadius * 3.2, spanX * 0.32 + reach * (0.4 + symmetry * 0.055));
          var root = { x: centerX, y: centerY + branchHeight * 0.56 };
          var crown = { x: centerX, y: centerY - branchHeight * 0.42 };
          sigilCurveLinkV31(bodyCtx, root, crown, bodyWeight * (1.12 + binding * 0.08),
            branchWidth * 0.08, complexityAggregate.strength * 0.96, 3581);
          for (var branchIndex = 0; branchIndex < branchCount; branchIndex++) {
            var branchT = branchCount <= 1 ? 0.5 : branchIndex / (branchCount - 1);
            var branchSide = branchIndex % 2 ? 1 : -1;
            var branchLevel = 0.12 + branchT * 0.84;
            var branchOrigin = {
              x: centerX + Math.sin(branchLevel * Math.PI + phase * 0.025) * bodyWeight * 0.45,
              y: root.y + (crown.y - root.y) * branchLevel
            };
            var branchSpread = branchWidth * (0.3 + Math.sin(branchLevel * Math.PI) * 0.68) *
              (0.68 + hash(branchIndex, params.seed % 79, 3583) * 0.4);
            var branchTarget = {
              x: branchOrigin.x + branchSide * branchSpread,
              y: branchOrigin.y - branchHeight * (0.08 + hash(branchIndex, params.seed % 83, 3593) * 0.18)
            };
            var branchLineWeight = bodyWeight * (0.82 - branchLevel * 0.34 + binding * 0.04);
            sigilCurveLinkV31(bodyCtx, branchOrigin, branchTarget, branchLineWeight,
              branchSpread * (0.12 + symmetry * 0.025), complexityAggregate.strength * 0.88,
              branchIndex + 3599);
            var branchComponent = components[branchIndex % components.length];
            var branchScale = Math.max(0.38, Math.min(1.48, 0.54 + binding * 0.1 +
              hash(branchIndex, branchComponent.glyphIndex, 3607) * 0.26));
            placeComponent(branchComponent, branchTarget.x, branchTarget.y,
              branchSide * (0.34 + hash(branchIndex, params.seed % 67, 3613) * 0.38),
              branchScale, branchScale * (0.7 + symmetry * 0.055),
              complexityAggregate.strength * (0.72 + branchComponent.strength * 0.24));
            if (counterCuts > 0.02 && branchIndex % Math.max(1, Math.round(6 - counterCuts * 0.7)) === 0) {
              sigilCutV31(cutsCtx, branchOrigin.x, branchOrigin.y,
                branchLineWeight * (0.2 + counterCuts * 0.035), branchLineWeight * (0.74 + counterCuts * 0.08),
                branchSide * 0.48, 1, Math.min(1, 0.44 + counterCuts * 0.09));
            }
          }
          cutsCtx.globalAlpha = Math.min(1, 0.38 + counterCuts * 0.1);
          cutsCtx.lineWidth = Math.max(0.4, stroke * (0.65 + counterCuts * 0.22));
          cutsCtx.beginPath();
          cutsCtx.moveTo(root.x, root.y - bodyWeight * 0.5);
          cutsCtx.bezierCurveTo(centerX - bodyWeight * 0.5, centerY + branchHeight * 0.22,
            centerX + bodyWeight * 0.45, centerY - branchHeight * 0.18, crown.x, crown.y + bodyWeight * 0.4);
          cutsCtx.stroke();
        } else {
          var targetNodes = [];
          var constellationPull = Math.min(0.86, 0.34 + binding * 0.12);
          for (var constellationIndex = 0; constellationIndex < components.length; constellationIndex++) {
            var constellationComponent = components[constellationIndex];
            var sourceNode = constellationComponent.node;
            var directionX = sourceNode.x - centerX, directionY = sourceNode.y - centerY;
            var directionLength = Math.max(1, Math.sqrt(directionX * directionX + directionY * directionY));
            var drift = reach * (0.04 + hash(constellationIndex, params.seed % 91, 3623) * 0.13);
            targetNodes.push({
              x: sourceNode.x + (centerX - sourceNode.x) * constellationPull + directionX / directionLength * drift,
              y: sourceNode.y + (centerY - sourceNode.y) * constellationPull + directionY / directionLength * drift,
              r: sourceNode.r,
              strength: constellationComponent.strength,
              glyphIndex: constellationComponent.glyphIndex
            });
          }
          var graphReach = Math.max(averageRadius * 7.5, reach * (1.05 + binding * 0.18));
          var constellationEdges = surfaceGraphEdges(targetNodes, graphReach, Math.min(4, 0.6 + binding),
            3631, 8 + binding * 1.2, true);
          for (var constellationEdgeIndex = 0; constellationEdgeIndex < constellationEdges.length; constellationEdgeIndex++) {
            var constellationEdge = constellationEdges[constellationEdgeIndex];
            var edgeWeight = bodyWeight * (constellationEdge.kind === 'trunk' ? 0.96 : 0.64);
            var edgeBend = Math.min(graphReach * 0.12, constellationEdge.distance * (0.05 + symmetry * 0.018));
            sigilCurveLinkV31(bodyCtx, constellationEdge.a, constellationEdge.b, edgeWeight, edgeBend,
              Math.min(constellationEdge.a.strength, constellationEdge.b.strength) *
              (constellationEdge.kind === 'trunk' ? 0.88 : 0.7), constellationEdgeIndex + 3637);
            if (counterCuts > 0.02) {
              sigilCurveLinkV31(cutsCtx, constellationEdge.a, constellationEdge.b,
                Math.max(0.35, edgeWeight * (0.17 + counterCuts * 0.034)), edgeBend,
                Math.min(0.92, 0.36 + counterCuts * 0.09), constellationEdgeIndex + 3637);
            }
          }
          var constellationCopies = Math.min(28, Math.max(targetNodes.length, complexity));
          for (var constellationCopy = 0; constellationCopy < constellationCopies; constellationCopy++) {
            var targetNode = targetNodes[constellationCopy % targetNodes.length];
            var constellationSource = components[constellationCopy % components.length];
            var orbitAngle = hash(constellationCopy, params.seed % 73, 3659) * Math.PI * 2 + phase * 0.02;
            var orbit = constellationCopy < targetNodes.length ? 0 : averageRadius * (0.6 + binding * 0.28);
            var constellationScale = Math.max(0.42, Math.min(1.48, 0.68 + binding * 0.1 +
              hash(constellationCopy, constellationSource.glyphIndex, 3671) * 0.28));
            placeComponent(constellationSource, targetNode.x + Math.cos(orbitAngle) * orbit,
              targetNode.y + Math.sin(orbitAngle) * orbit, orbitAngle * (0.22 + symmetry * 0.08),
              constellationScale, constellationScale * (0.72 + binding * 0.05),
              complexityAggregate.strength * (0.7 + constellationSource.strength * 0.25));
          }
          for (var constellationCut = 0; constellationCut < targetNodes.length; constellationCut++) {
            if (hash(constellationCut, params.seed % 61, 3673) > Math.min(0.9, 0.2 + counterCuts * 0.11)) continue;
            sigilCutV31(cutsCtx, targetNodes[constellationCut].x, targetNodes[constellationCut].y,
              bodyWeight * (0.24 + counterCuts * 0.035), bodyWeight * (0.24 + counterCuts * 0.035),
              Math.PI / 4, constellationCut % 2 ? 0 : 1, Math.min(1, 0.46 + counterCuts * 0.09));
          }
        }

        bodyCtx.save();
        bodyCtx.globalCompositeOperation = 'destination-out';
        bodyCtx.globalAlpha = Math.min(1, 0.72 + counterCuts * 0.045);
        bodyCtx.drawImage(cuts.canvas, 0, 0);
        bodyCtx.restore();
        paintSurfaceMask(targetCtx, body.canvas, surfaceEffectColor('sigilForge'), 1,
          'sigil-forge-v31-compound-color');
      }

      function renderThornRooted(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var aggregate = surfaceAggregate(glyphs, 'thornCrown', 'thornLength', params.thornLength);
        if (!aggregate.weight) return;
        var units = Math.max(0.01, pixelScale * L.s), length = Math.max(0, aggregate.value * units);
        var mask = buildSurfaceMask(glyphs, 'thornCrown', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'thornCrown', coverBase);
        if (length < 0.05) return;
        var strengthData = mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height).data;
        var fullGlyphs = glyphs.filter(function (g) { return surfaceGlyphStrength(g, 'thornCrown') > 0.002; }).map(function (g) {
          return Object.assign({}, g, { surface: Object.assign({}, g.surface, { thornCrown: 1 }) });
        });
        // Stable geometry through intensity easing; strength only controls ink.
        mask = buildSurfaceMask(fullGlyphs, 'thornCrown', width, height, pixelScale, L, fm);
        var data = mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height).data;
        function setting(key) { return surfaceAggregate(glyphs, 'thornCrown', key, params[key]).value; }
        var armor = setting('thornArmor'), density = setting('thornDensity'), curl = setting('thornCurl');
        var stroke = Math.max(0.2, setting('thornStroke') * units), branches = setting('thornBranches');
        var grammar = surfaceChoice(glyphs, 'thornCrown', 'thornGrammar', params.thornGrammar, BATCH_PARAM_OPTIONS.thornGrammar);
        var roots = thornContourRoots(data, strengthData, width, height, units, length,
          (length * 0.05 + stroke * 0.65) * (0.75 + armor * 0.15), density, setting('thornClearance'), params.seed);
        var work = surfaceScratch('thorn-rooted', width, height, false), ctx = work.ctx;
        for (var i = 0; i < roots.length; i++) {
          var root = roots[i], family = grammar === 'hybrid' ? ['lancet', 'hook', 'vine', 'trident'][Math.floor(hash(root.key, 17, params.seed) * 4)] : grammar;
          var paths = thornOrganPaths(root, length * (0.7 + hash(root.key, 31, params.seed) * 0.45), root.width, curl, family, branches, armor, root.key);
          var minX = width, minY = height, maxX = 0, maxY = 0;
          paths.forEach(function (path) { path.outline.forEach(function (point) {
            minX = Math.min(minX, point.x); minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y);
          }); });
          minX = Math.max(0, Math.floor(minX) - 1); minY = Math.max(0, Math.floor(minY) - 1);
          maxX = Math.min(width, Math.ceil(maxX) + 1); maxY = Math.min(height, Math.ceil(maxY) + 1);
          if (maxX <= minX || maxY <= minY) continue;
          // Isolate each organ: its incision cannot erase another crossing root.
          // Crop the scratch surface to visible ink rather than clearing a full
          // export-size canvas for every root. Apply intensity after carving.
          var organ = surfaceScratch('thorn-rooted-organ', maxX - minX, maxY - minY, false), oc = organ.ctx;
          oc.translate(-minX, -minY);
          oc.fillStyle = surfaceEffectColor('thornCrown');
          oc.beginPath();
          for (var p = 0; p < paths.length; p++) {
            var outline = paths[p].outline;
            oc.moveTo(outline[0].x, outline[0].y);
            for (var k = 1; k < outline.length; k++) oc.lineTo(outline[k].x, outline[k].y);
            oc.closePath();
          }
          oc.fill();
          if (armor > 0.05) {
            oc.globalCompositeOperation = 'destination-out';
            oc.globalAlpha = Math.min(0.85, armor * 0.2);
            oc.beginPath();
            for (var pathIndex = 0; pathIndex < paths.length; pathIndex++) {
              var keel = paths[pathIndex].keel;
              // One tapered cut, not overlapping round-capped short strokes.
              for (var side = 0; side < 2; side++) for (var segment = 0; segment < keel.length; segment++) {
                var ki = side ? keel.length - 1 - segment : segment, point = keel[ki];
                var half = point.width * 0.11 * Math.sin(Math.PI * ki / Math.max(1, keel.length - 1));
                var px = point.x + point.nx * half * (side ? -1 : 1), py = point.y + point.ny * half * (side ? -1 : 1);
                if (!side && !segment) oc.moveTo(px, py); else oc.lineTo(px, py);
              }
              oc.closePath();
            }
            oc.fill();
          }
          ctx.globalAlpha = root.strength;
          ctx.drawImage(organ.canvas, minX, minY);
        }
        ctx.globalAlpha = 1;
        targetCtx.save(); targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height); targetCtx.restore();
      }

      function renderThornCrown(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var legacy = [], rooted = [];
        for (var i = 0; i < glyphs.length; i++) {
          var g = glyphs[i];
          if (surfaceGlyphStrength(g, 'thornCrown') <= 0.002) continue;
          var construction = g.surface && g.surface.thornConstruction || params.thornConstruction;
          (construction === 'legacy' ? legacy : rooted).push(g);
        }
        if (legacy.length) renderThornCrownLegacy(targetCtx, legacy, width, height, pixelScale, L, fm, coverBase);
        if (rooted.length) renderThornRooted(targetCtx, rooted, width, height, pixelScale, L, fm, coverBase);
      }

      function renderThornCrownLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var lengthAggregate = surfaceAggregate(glyphs, 'thornCrown', 'thornLength', params.thornLength);
        if (!lengthAggregate.weight) return;
        var grammar = surfaceChoice(glyphs, 'thornCrown', 'thornGrammar', params.thornGrammar, BATCH_PARAM_OPTIONS.thornGrammar);
        var armor = surfaceAggregate(glyphs, 'thornCrown', 'thornArmor', params.thornArmor).value;
        var length = Math.max(0, lengthAggregate.value * pixelScale * L.s);
        var density = surfaceAggregate(glyphs, 'thornCrown', 'thornDensity', params.thornDensity).value;
        var curl = surfaceAggregate(glyphs, 'thornCrown', 'thornCurl', params.thornCurl).value;
        var stroke = Math.max(0.2, surfaceAggregate(glyphs, 'thornCrown', 'thornStroke', params.thornStroke).value * pixelScale * L.s);
        var branching = surfaceAggregate(glyphs, 'thornCrown', 'thornBranches', params.thornBranches).value;
        var mask = buildSurfaceMask(glyphs, 'thornCrown', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'thornCrown', coverBase);
        if (length <= 0.05) return;
        // Select a sparse hierarchy of roots instead of decorating every
        // boundary sample. Dense, equally weighted spikes collapse into an
        // arrow brush; spaced roots leave room for a stem, branches, crockets
        // and a terminal to read as one authored ornament.
        var maxSamples = Math.min(680, Math.max(80, Math.round(110 + density * 104)));
        var candidates = sampleSurfaceMask(mask, Math.min(1, density / 2.2), true, maxSamples);
        if (!candidates.length) return;
        candidates.sort(function (a, b) {
          return hash(Math.round(a.x * 0.37 + a.y * 0.71), params.seed % 137, 1697)
            - hash(Math.round(b.x * 0.37 + b.y * 0.71), params.seed % 137, 1697);
        });
        var rootLimit = Math.min(72, Math.max(4, Math.round(4 + density * 13 + branching * 2)));
        var rootSpacing = Math.max(8 * pixelScale * L.s,
          Math.min(length * 0.86, (28 + stroke * 3.1) * pixelScale * L.s)
          / Math.sqrt(Math.max(0.35, density)));
        var rootSpacingSq = rootSpacing * rootSpacing;
        var points = [];
        for (var candidateIndex = 0; candidateIndex < candidates.length && points.length < rootLimit; candidateIndex++) {
          var candidate = candidates[candidateIndex];
          var separated = true;
          for (var selectedIndex = 0; selectedIndex < points.length; selectedIndex++) {
            var selectedDx = points[selectedIndex].x - candidate.x;
            var selectedDy = points[selectedIndex].y - candidate.y;
            if (selectedDx * selectedDx + selectedDy * selectedDy < rootSpacingSq) {
              separated = false;
              break;
            }
          }
          if (separated) points.push(candidate);
        }
        if (!points.length) points.push(candidates[0]);
        var maskContext = mask.getContext('2d', { willReadFrequently: true });
        var data;
        try { data = maskContext.getImageData(0, 0, width, height).data; }
        catch (error) { return; }
        var centerX = 0, centerY = 0;
        for (var p = 0; p < points.length; p++) { centerX += points[p].x; centerY += points[p].y; }
        centerX /= points.length;
        centerY /= points.length;
        var work = surfaceScratch('thorn-crown', width, height, false);
        var ctx = work.ctx;
        ctx.strokeStyle = surfaceEffectColor('thornCrown');
        ctx.fillStyle = surfaceEffectColor('thornCrown');
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        function alphaAt(x, y) {
          x = Math.max(0, Math.min(width - 1, Math.round(x)));
          y = Math.max(0, Math.min(height - 1, Math.round(y)));
          return data[(y * width + x) * 4 + 3] / 255;
        }

        function quadraticPoint(aX, aY, cX, cY, bX, bY, t) {
          var inverse = 1 - t;
          return {
            x: inverse * inverse * aX + 2 * inverse * t * cX + t * t * bX,
            y: inverse * inverse * aY + 2 * inverse * t * cY + t * t * bY
          };
        }

        function quadraticDirection(aX, aY, cX, cY, bX, bY, t) {
          var dx = 2 * (1 - t) * (cX - aX) + 2 * t * (bX - cX);
          var dy = 2 * (1 - t) * (cY - aY) + 2 * t * (bY - cY);
          var magnitude = Math.sqrt(dx * dx + dy * dy) || 1;
          return { x: dx / magnitude, y: dy / magnitude };
        }

        function drawTaperedArmature(aX, aY, cX, cY, bX, bY, rootWidth, alpha) {
          var segments = 9;
          var left = [], right = [];
          for (var segment = 0; segment <= segments; segment++) {
            var t = segment / segments;
            var position = quadraticPoint(aX, aY, cX, cY, bX, bY, t);
            var direction = quadraticDirection(aX, aY, cX, cY, bX, bY, t);
            var sideX = -direction.y, sideY = direction.x;
            var taper = Math.pow(1 - t, 0.72);
            var localWidth = Math.max(stroke * 0.16, rootWidth * (0.16 + taper * 0.84));
            left.push({ x: position.x + sideX * localWidth, y: position.y + sideY * localWidth });
            right.push({ x: position.x - sideX * localWidth, y: position.y - sideY * localWidth });
          }
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.moveTo(left[0].x, left[0].y);
          for (var leftIndex = 1; leftIndex < left.length; leftIndex++) ctx.lineTo(left[leftIndex].x, left[leftIndex].y);
          for (var rightIndex = right.length - 1; rightIndex >= 0; rightIndex--) ctx.lineTo(right[rightIndex].x, right[rightIndex].y);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = alpha * 0.58;
          ctx.lineWidth = Math.max(0.2, stroke * 0.28);
          ctx.beginPath();
          ctx.moveTo(aX, aY);
          ctx.quadraticCurveTo(cX, cY, bX, bY);
          ctx.stroke();
          ctx.restore();
        }

        function drawLancet(tipX, tipY, directionX, directionY, size, widthScale, alpha) {
          var sideX = -directionY, sideY = directionX;
          var baseX = tipX - directionX * size;
          var baseY = tipY - directionY * size;
          var shoulderX = tipX - directionX * size * 0.5;
          var shoulderY = tipY - directionY * size * 0.5;
          var bladeWidth = size * widthScale;
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.lineWidth = Math.max(0.2, stroke * 0.68);
          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.bezierCurveTo(shoulderX + sideX * bladeWidth, shoulderY + sideY * bladeWidth,
            baseX + sideX * bladeWidth * 0.62, baseY + sideY * bladeWidth * 0.62, baseX, baseY);
          ctx.bezierCurveTo(baseX - sideX * bladeWidth * 0.62, baseY - sideY * bladeWidth * 0.62,
            shoulderX - sideX * bladeWidth, shoulderY - sideY * bladeWidth, tipX, tipY);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.globalAlpha = alpha * 0.62;
          ctx.lineWidth = Math.max(0.2, stroke * 0.34);
          ctx.beginPath();
          ctx.moveTo(baseX + directionX * size * 0.14, baseY + directionY * size * 0.14);
          ctx.quadraticCurveTo(shoulderX + sideX * bladeWidth * 0.12,
            shoulderY + sideY * bladeWidth * 0.12,
            tipX - directionX * size * 0.12, tipY - directionY * size * 0.12);
          ctx.stroke();
          ctx.restore();
        }

        function drawHook(tipX, tipY, directionX, directionY, size, sign, alpha) {
          var sideX = -directionY * sign, sideY = directionX * sign;
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.lineWidth = Math.max(0.2, stroke * 0.82);
          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.bezierCurveTo(tipX + directionX * size * 0.16 + sideX * size * 0.08,
            tipY + directionY * size * 0.16 + sideY * size * 0.08,
            tipX - directionX * size * 0.03 + sideX * size * 0.72,
            tipY - directionY * size * 0.03 + sideY * size * 0.72,
            tipX - directionX * size * 0.48 + sideX * size * 0.34,
            tipY - directionY * size * 0.48 + sideY * size * 0.34);
          ctx.stroke();
          ctx.lineWidth = Math.max(0.2, stroke * 0.42);
          ctx.beginPath();
          ctx.moveTo(tipX - directionX * size * 0.48 + sideX * size * 0.34,
            tipY - directionY * size * 0.48 + sideY * size * 0.34);
          ctx.quadraticCurveTo(tipX - directionX * size * 0.64 + sideX * size * 0.2,
            tipY - directionY * size * 0.64 + sideY * size * 0.2,
            tipX - directionX * size * 0.54 + sideX * size * 0.04,
            tipY - directionY * size * 0.54 + sideY * size * 0.04);
          ctx.stroke();
          ctx.restore();
        }

        function drawBud(endX, endY, directionX, directionY, size, sign, alpha) {
          var sideX = -directionY * sign, sideY = directionX * sign;
          var baseX = endX - directionX * size * 0.75;
          var baseY = endY - directionY * size * 0.75;
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.lineWidth = Math.max(0.2, stroke * 0.36);
          ctx.beginPath();
          ctx.moveTo(endX, endY);
          ctx.quadraticCurveTo(endX - directionX * size * 0.34 + sideX * size * 0.28,
            endY - directionY * size * 0.34 + sideY * size * 0.28, baseX, baseY);
          ctx.quadraticCurveTo(endX - directionX * size * 0.42 - sideX * size * 0.18,
            endY - directionY * size * 0.42 - sideY * size * 0.18, endX, endY);
          ctx.closePath();
          ctx.globalAlpha = alpha * 0.52;
          ctx.fill();
          ctx.globalAlpha = alpha;
          ctx.stroke();
          ctx.globalAlpha = alpha * 0.5;
          ctx.beginPath();
          ctx.moveTo(baseX + directionX * size * 0.08, baseY + directionY * size * 0.08);
          ctx.lineTo(endX - directionX * size * 0.12, endY - directionY * size * 0.12);
          ctx.stroke();
          ctx.restore();
        }

        function drawBasalPad(originX, originY, normalX, normalY, tangentX, tangentY,
          size, alpha, family) {
          var padDepth = size * (0.52 + Math.min(4, armor) * 0.08);
          var padWidth = size * (family === 2 ? 0.68 : family === 1 ? 0.82 : 1);
          var innerX = originX - normalX * padDepth;
          var innerY = originY - normalY * padDepth;
          var neckX = originX + normalX * padDepth * 0.56;
          var neckY = originY + normalY * padDepth * 0.56;
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.moveTo(innerX - tangentX * padWidth, innerY - tangentY * padWidth);
          ctx.bezierCurveTo(originX - tangentX * padWidth * 1.12,
            originY - tangentY * padWidth * 1.12,
            neckX - tangentX * padWidth * 0.34, neckY - tangentY * padWidth * 0.34,
            neckX, neckY);
          ctx.bezierCurveTo(neckX + tangentX * padWidth * 0.34,
            neckY + tangentY * padWidth * 0.34,
            originX + tangentX * padWidth * 1.12, originY + tangentY * padWidth * 1.12,
            innerX + tangentX * padWidth, innerY + tangentY * padWidth);
          ctx.quadraticCurveTo(innerX - normalX * padDepth * 0.18,
            innerY - normalY * padDepth * 0.18,
            innerX - tangentX * padWidth, innerY - tangentY * padWidth);
          ctx.closePath();
          ctx.fill();
          if (armor > 0.4) {
            ctx.globalAlpha = alpha * 0.62;
            ctx.strokeStyle = params.paper;
            ctx.lineWidth = Math.max(0.35, stroke * (0.3 + Math.min(4, armor) * 0.08));
            ctx.beginPath();
            ctx.moveTo(innerX - tangentX * padWidth * 0.62, innerY - tangentY * padWidth * 0.62);
            ctx.quadraticCurveTo(originX - normalX * padDepth * 0.08,
              originY - normalY * padDepth * 0.08,
              innerX + tangentX * padWidth * 0.62, innerY + tangentY * padWidth * 0.62);
            ctx.stroke();
            ctx.strokeStyle = surfaceEffectColor('thornCrown');
          }
          ctx.restore();
        }

        function drawBackBarb(baseX, baseY, directionX, directionY, size, sign, alpha) {
          var sideX = -directionY * sign, sideY = directionX * sign;
          var endX = baseX - directionX * size * 0.46 + sideX * size * 0.72;
          var endY = baseY - directionY * size * 0.46 + sideY * size * 0.72;
          var controlX = baseX + directionX * size * 0.08 + sideX * size * 0.42;
          var controlY = baseY + directionY * size * 0.08 + sideY * size * 0.42;
          drawTaperedArmature(baseX, baseY, controlX, controlY, endX, endY,
            Math.max(stroke * 0.42, size * 0.075), alpha);
        }

        function drawTrident(nodeX, nodeY, directionX, directionY, size, alpha) {
          var sideX = -directionY, sideY = directionX;
          for (var prongSign = -1; prongSign <= 1; prongSign += 2) {
            var prongEndX = nodeX + directionX * size * 0.7 + sideX * size * 0.62 * prongSign;
            var prongEndY = nodeY + directionY * size * 0.7 + sideY * size * 0.62 * prongSign;
            var prongControlX = nodeX + directionX * size * 0.28 + sideX * size * 0.34 * prongSign;
            var prongControlY = nodeY + directionY * size * 0.28 + sideY * size * 0.34 * prongSign;
            drawTaperedArmature(nodeX, nodeY, prongControlX, prongControlY,
              prongEndX, prongEndY, Math.max(stroke * 0.52, size * 0.085), alpha * 0.9);
          }
          ctx.save();
          ctx.translate(nodeX, nodeY);
          ctx.rotate(Math.atan2(directionY, directionX) + Math.PI / 4);
          ctx.globalAlpha = alpha * 0.82;
          var nodeSize = Math.max(stroke * 1.4, size * 0.12);
          ctx.fillRect(-nodeSize * 0.5, -nodeSize * 0.5, nodeSize, nodeSize);
          ctx.restore();
        }

        var gradientReach = Math.max(2, Math.round(pixelScale * 2.5));
        for (var i = 0; i < points.length; i++) {
          var point = points[i];
          var gx = alphaAt(point.x + gradientReach, point.y) - alphaAt(point.x - gradientReach, point.y);
          var gy = alphaAt(point.x, point.y + gradientReach) - alphaAt(point.x, point.y - gradientReach);
          var nx = -gx, ny = -gy;
          var magnitude = Math.sqrt(nx * nx + ny * ny);
          if (magnitude < 0.035) {
            nx = point.x - centerX;
            ny = point.y - centerY;
            magnitude = Math.sqrt(nx * nx + ny * ny) || 1;
          }
          nx /= magnitude;
          ny /= magnitude;
          var tangentX = -ny, tangentY = nx;
          var family = grammar === 'lancet' ? 0 : grammar === 'hook' ? 1 : grammar === 'vine' ? 2
            : grammar === 'trident' ? 3 : Math.floor(hash(i, params.seed % 131, 1731) * 4);
          var random = hash(i, params.seed % 107, 1709);
          var familyLength = family === 0 ? 1.06 : family === 1 ? 0.94 : family === 2 ? 1.14 : 0.9;
          var thornLength = length * (0.52 + random * 0.58) * (0.58 + point.alpha * 0.42) * familyLength;
          var originX = point.x + nx * stroke * 0.65;
          var originY = point.y + ny * stroke * 0.65;
          var handedness = hash(i, 13, 1721) > 0.5 ? 1 : -1;
          var familyCurl = family === 1 ? 0.72 : family === 2 ? 0.48 : family === 3 ? 0.14 : 0.08;
          var curve = curl * thornLength * familyCurl * handedness;
          var controlX = originX + nx * thornLength * (family === 1 ? 0.48 : 0.58) + tangentX * curve;
          var controlY = originY + ny * thornLength * (family === 1 ? 0.48 : 0.58) + tangentY * curve;
          var tipX = originX + nx * thornLength + tangentX * curve * (family === 1 ? 0.76 : 0.28);
          var tipY = originY + ny * thornLength + tangentY * curve * (family === 1 ? 0.76 : 0.28);
          var ornamentAlpha = Math.min(1, 0.3 + point.alpha * 0.68) * lengthAggregate.strength;
          ctx.globalAlpha = ornamentAlpha;
          ctx.lineWidth = Math.max(0.2, stroke * (0.5 + hash(i, 19, 1723) * 0.9));
          var collar = Math.min(thornLength * 0.2, stroke * 6.4 + 3 * pixelScale);
          drawBasalPad(originX, originY, nx, ny, tangentX, tangentY, collar,
            ornamentAlpha * (0.78 + Math.min(4, armor) * 0.05), family);
          var armatureWidth = Math.max(stroke * (family === 0 ? 2.5 : family === 1 ? 1.72
            : family === 2 ? 1.34 : 2.05), collar * (0.18 + Math.min(4, armor) * 0.045));
          drawTaperedArmature(originX, originY, controlX, controlY, tipX, tipY,
            armatureWidth, ornamentAlpha);

          if (armor > 0.005) {
            var armorStrength = Math.min(1, armor * 0.52);
            var rootSize = Math.min(thornLength * 0.24, collar * (1.3 + armor * 0.34));
            ctx.save();
            ctx.globalAlpha = ornamentAlpha * (0.5 + armorStrength * 0.42);
            ctx.lineWidth = Math.max(0.25, stroke * (0.58 + armor * 0.16));
            // A nested, swept root plate makes each growth read as attached
            // ornament rather than an arrow dropped onto the contour.
            for (var rootBand = 0; rootBand < Math.min(3, 1 + Math.floor(armor)); rootBand++) {
              var rootOffset = rootBand * stroke * 1.18;
              ctx.beginPath();
              ctx.moveTo(originX - tangentX * (rootSize + rootOffset), originY - tangentY * (rootSize + rootOffset));
              ctx.quadraticCurveTo(originX - nx * (rootSize * 0.54 + rootOffset), originY - ny * (rootSize * 0.54 + rootOffset),
                originX + tangentX * (rootSize + rootOffset), originY + tangentY * (rootSize + rootOffset));
              ctx.stroke();
            }
            ctx.translate(originX + nx * rootSize * 0.08, originY + ny * rootSize * 0.08);
            ctx.rotate(Math.atan2(ny, nx) + Math.PI / 4);
            var rivet = Math.max(stroke * 0.9, rootSize * (0.1 + armorStrength * 0.07));
            ctx.fillRect(-rivet * 0.5, -rivet * 0.5, rivet, rivet);
            ctx.restore();

            // Parallel armature and alternating scales give the crown a
            // crafted metal/botanical body before the terminal ornament.
            var railOffset = Math.min(rootSize * 0.2, stroke * (0.75 + armor * 0.38));
            var railCount = armor > 2.4 ? 2 : 1;
            for (var rail = 0; rail < railCount; rail++) {
              var railSign = rail ? -1 : 1;
              ctx.globalAlpha = ornamentAlpha * (0.35 + armorStrength * 0.35);
              ctx.lineWidth = Math.max(0.2, stroke * 0.36);
              ctx.beginPath();
              ctx.moveTo(originX + tangentX * railOffset * railSign, originY + tangentY * railOffset * railSign);
              ctx.quadraticCurveTo(controlX + tangentX * railOffset * railSign,
                controlY + tangentY * railOffset * railSign,
                tipX + tangentX * railOffset * railSign * 0.28,
                tipY + tangentY * railOffset * railSign * 0.28);
              ctx.stroke();
            }
            var scaleCount = Math.min(6, 1 + Math.floor(armor * 1.35));
            for (var scaleIndex = 0; scaleIndex < scaleCount; scaleIndex++) {
              var scaleT = 0.2 + scaleIndex / Math.max(1, scaleCount - 1) * 0.56;
              var scaleBase = quadraticPoint(originX, originY, controlX, controlY, tipX, tipY, scaleT);
              var scaleDirection = quadraticDirection(originX, originY, controlX, controlY, tipX, tipY, scaleT);
              var scaleSideX = -scaleDirection.y, scaleSideY = scaleDirection.x;
              var scaleSign = (scaleIndex + i) % 2 ? -1 : 1;
              var scaleSize = Math.min(thornLength * 0.13, stroke * (2.8 + armor * 1.5));
              ctx.globalAlpha = ornamentAlpha * (0.36 + armorStrength * 0.42);
              ctx.beginPath();
              ctx.moveTo(scaleBase.x, scaleBase.y);
              ctx.quadraticCurveTo(scaleBase.x + scaleSideX * scaleSize * scaleSign * 0.68
                - scaleDirection.x * scaleSize * 0.14,
                scaleBase.y + scaleSideY * scaleSize * scaleSign * 0.68
                - scaleDirection.y * scaleSize * 0.14,
                scaleBase.x + scaleDirection.x * scaleSize * 0.26,
                scaleBase.y + scaleDirection.y * scaleSize * 0.26);
              ctx.quadraticCurveTo(scaleBase.x + scaleSideX * scaleSize * scaleSign * 0.24,
                scaleBase.y + scaleSideY * scaleSize * scaleSign * 0.24,
                scaleBase.x, scaleBase.y);
              ctx.fill();
            }
          }

          var branchCount = Math.min(4, Math.floor(branching) + (hash(i, 23, 1733) < branching % 1 ? 1 : 0));
          if (family === 0) branchCount = Math.min(1, branchCount);
          if (family === 1) branchCount = Math.min(2, branchCount);
          if (family === 3) branchCount = Math.min(1, branchCount);
          if (family === 2 && branchCount < 2 && branching > 0.1) branchCount = 2;
          for (var branch = 0; branch < branchCount; branch++) {
            var t = 0.34 + (branch + 1) / (branchCount + 2) * 0.48;
            var base = quadraticPoint(originX, originY, controlX, controlY, tipX, tipY, t);
            var stemDirection = quadraticDirection(originX, originY, controlX, controlY, tipX, tipY, t);
            var stemSideX = -stemDirection.y, stemSideY = stemDirection.x;
            var sign = (branch + i) % 2 ? -1 : 1;
            var branchLength = thornLength * (0.12 + hash(i, branch, 1741) * (family === 2 ? 0.32 : 0.2));
            var branchX = base.x + stemDirection.x * branchLength * 0.34 + stemSideX * branchLength * sign;
            var branchY = base.y + stemDirection.y * branchLength * 0.34 + stemSideY * branchLength * sign;
            var branchControlX = base.x + stemDirection.x * branchLength * 0.12 + stemSideX * branchLength * sign * 0.62;
            var branchControlY = base.y + stemDirection.y * branchLength * 0.12 + stemSideY * branchLength * sign * 0.62;
            var branchAlpha = ornamentAlpha * (0.65 + hash(i, branch, 1743) * 0.28);
            drawTaperedArmature(base.x, base.y, branchControlX, branchControlY, branchX, branchY,
              Math.max(stroke * 0.32, stroke * (0.5 + hash(i, branch, 1745) * 0.28)), branchAlpha);
            var branchDirectionX = branchX - branchControlX;
            var branchDirectionY = branchY - branchControlY;
            var branchMagnitude = Math.sqrt(branchDirectionX * branchDirectionX + branchDirectionY * branchDirectionY) || 1;
            branchDirectionX /= branchMagnitude;
            branchDirectionY /= branchMagnitude;
            if (family === 2 || hash(i, branch, 1747) > 0.58) {
              drawBud(branchX, branchY, branchDirectionX, branchDirectionY,
                Math.max(stroke * 2.4, branchLength * 0.28), sign, ornamentAlpha * 0.78);
            }
          }

          if (thornLength > stroke * 5) {
            var tipDirection = quadraticDirection(originX, originY, controlX, controlY, tipX, tipY, 1);
            var terminalSize = Math.min(thornLength * (family === 3 ? 0.34 : 0.26),
              stroke * (11 + armor * 2.4) + (8 + armor * 2) * pixelScale);
            if (family === 1) {
              // A hook is the continuation of the prickle itself. One or two
              // backward barbs replace the old loop/arrow terminal.
              var hookBase = quadraticPoint(originX, originY, controlX, controlY, tipX, tipY, 0.74);
              var hookDirection = quadraticDirection(originX, originY, controlX, controlY, tipX, tipY, 0.74);
              drawBackBarb(hookBase.x, hookBase.y, hookDirection.x, hookDirection.y,
                terminalSize * 0.92, handedness, ornamentAlpha * 0.9);
              if (armor > 2.2) drawBackBarb(tipX - tipDirection.x * terminalSize * 0.42,
                tipY - tipDirection.y * terminalSize * 0.42, tipDirection.x, tipDirection.y,
                terminalSize * 0.62, -handedness, ornamentAlpha * 0.58);
            } else if (family === 2) {
              drawBud(tipX, tipY, tipDirection.x, tipDirection.y,
                terminalSize * 1.18, -handedness, ornamentAlpha);
            } else if (family === 3) {
              var tridentNode = quadraticPoint(originX, originY, controlX, controlY, tipX, tipY, 0.68);
              var tridentDirection = quadraticDirection(originX, originY, controlX, controlY, tipX, tipY, 0.68);
              drawTrident(tridentNode.x, tridentNode.y, tridentDirection.x,
                tridentDirection.y, terminalSize * 1.28, ornamentAlpha);
            } else if (armor > 1.6) {
              // Lancet is already a single fused tapered plate. A shallow
              // incised keel adds craft without attaching a second arrowhead.
              ctx.save();
              ctx.globalAlpha = ornamentAlpha * 0.58;
              ctx.strokeStyle = params.paper;
              ctx.lineWidth = Math.max(0.3, stroke * 0.34);
              ctx.beginPath();
              ctx.moveTo(originX + nx * collar * 0.38, originY + ny * collar * 0.38);
              ctx.quadraticCurveTo(controlX, controlY,
                tipX - tipDirection.x * terminalSize * 0.18,
                tipY - tipDirection.y * terminalSize * 0.18);
              ctx.stroke();
              ctx.restore();
              ctx.strokeStyle = surfaceEffectColor('thornCrown');
            }
          }
        }

        ctx.globalAlpha = 1;

        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderCipherLiturgy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var scaleAggregate = surfaceAggregate(glyphs, 'cipherLiturgy', 'cipherScale', params.cipherScale);
        if (!scaleAggregate.weight) return;
        var dialect = surfaceChoice(glyphs, 'cipherLiturgy', 'cipherDialect', params.cipherDialect, BATCH_PARAM_OPTIONS.cipherDialect);
        var registers = surfaceAggregate(glyphs, 'cipherLiturgy', 'cipherRegisters', params.cipherRegisters).value;
        var density = surfaceAggregate(glyphs, 'cipherLiturgy', 'cipherDensity', params.cipherDensity).value;
        var orbit = surfaceAggregate(glyphs, 'cipherLiturgy', 'cipherOrbit', params.cipherOrbit).value * pixelScale * L.s;
        var drift = surfaceAggregate(glyphs, 'cipherLiturgy', 'cipherDrift', params.cipherDrift).value * pixelScale * L.s;
        var callouts = surfaceAggregate(glyphs, 'cipherLiturgy', 'cipherCallouts', params.cipherCallouts).value;
        var fontSize = Math.max(3, scaleAggregate.value * pixelScale * L.s);
        var mask = buildSurfaceMask(glyphs, 'cipherLiturgy', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'cipherLiturgy', coverBase);
        var nodes = surfaceNodesForGlyphs(glyphs, 'cipherLiturgy', 96, pixelScale, L, 0, 0, 0);
        if (!nodes.length) return;
        var work = surfaceScratch('cipher-liturgy', width, height, false);
        var ctx = work.ctx;
        var color = surfaceEffectColor('cipherLiturgy');
        var turn = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.font = Math.max(3, fontSize) + 'px "SFMono-Regular", Consolas, "Liberation Mono", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = Math.max(0.5, fontSize * 0.08);

        function fixedHex(value) {
          var hex = Math.max(0, value || 0).toString(16).toUpperCase();
          while (hex.length < 4) hex = '0' + hex;
          return hex;
        }

        function paddedNumber(value, length) {
          var text = String(Math.max(0, Math.round(value || 0)));
          while (text.length < length) text = '0' + text;
          return text;
        }

        function cipherScriptTag(glyph) {
          var key = String(glyph && glyph.batchKey || 'other');
          if (key === 'kanji') return 'KJ';
          if (key === 'hira' || key === 'hiragana') return 'HR';
          if (key === 'kata' || key === 'katakana') return 'KT';
          if (key === 'latin') return 'LT';
          if (key === 'digit') return 'DG';
          if (key === 'punct') return 'PN';
          return 'GL';
        }

        function cipherChecksum(codepoint, index, row, column) {
          return ((codepoint * 17 + index * 31 + row * 13 + column * 7 + params.seed) >>> 0) & 0xFFFF;
        }

        function cipherToken(node, row, column) {
          var glyph = node.glyph || {};
          var source = String(glyph.ch || '');
          var codepoint = source ? source.codePointAt(0) : 0;
          var hex = fixedHex(codepoint);
          var index = Math.max(0, node.glyphIndex || 0);
          var indexText = paddedNumber(index, 3);
          var kind = cipherScriptTag(glyph);
          var checksum = fixedHex(cipherChecksum(codepoint, index, row, column));
          var lowByte = codepoint & 0xFF;
          var binary = lowByte.toString(2);
          while (binary.length < 8) binary = '0' + binary;
          if (dialect === 'unicode') {
            var unicodeVariant = (row + column + index) % 6;
            if (unicodeVariant === 0) return 'U+' + hex;
            if (unicodeVariant === 1) return 'PL' + Math.floor(codepoint / 65536) + '·' + hex.slice(-4);
            if (unicodeVariant === 2) return kind + '/CP' + paddedNumber(codepoint % 100000, 5);
            if (unicodeVariant === 3) return 'HEX ' + hex.slice(0, 2) + ':' + hex.slice(-2);
            if (unicodeVariant === 4) return '[' + kind + ' ' + indexText + ']';
            return 'SCALAR/' + checksum.slice(-3);
          }
          if (dialect === 'machine') {
            var machineVariant = (row * 5 + column * 3 + index) % 6;
            if (machineVariant === 0) return binary.slice(0, 4) + ' ' + binary.slice(4);
            if (machineVariant === 1) return '0x' + hex;
            if (machineVariant === 2) return 'O' + (codepoint & 511).toString(8).toUpperCase();
            if (machineVariant === 3) return 'CHK/' + checksum;
            if (machineVariant === 4) return 'ADR ' + indexText + ':' + hex.slice(-2);
            return 'BIT ' + paddedNumber(lowByte, 3);
          }
          if (dialect === 'ledger') {
            var ledgerVariant = (row * 2 + column + index) % 6;
            if (ledgerVariant === 0) return 'ROW ' + paddedNumber(row, 2) + ' / ' + kind;
            if (ledgerVariant === 1) return 'COL ' + paddedNumber(column, 2) + ' / ' + indexText;
            if (ledgerVariant === 2) return indexText + '—' + paddedNumber(index + 1, 3);
            if (ledgerVariant === 3) return 'FOL.' + paddedNumber(index + row, 3);
            if (ledgerVariant === 4) return kind + ' ENTRY ' + hex.slice(-2);
            return 'SUM ' + checksum.slice(-4);
          }
          if (dialect === 'ritual') {
            var ritualVariant = (row * 7 + column * 3 + index) % 6;
            if (ritualVariant === 0) return 'SIG:' + checksum.slice(-4);
            if (ritualVariant === 1) return '◈' + kind + '·' + hex.slice(-3);
            if (ritualVariant === 2) return 'R' + paddedNumber(row, 2) + '✶' + paddedNumber(column, 2);
            if (ritualVariant === 3) return 'SEAL/' + indexText;
            if (ritualVariant === 4) return 'Ⅰ' + hex.slice(0, 2) + 'Ⅱ' + hex.slice(-2);
            return '†' + checksum.slice(-3) + '†';
          }
          var variant = (row * 3 + column * 5 + Math.floor(hash(index + row, column, params.seed + 1753) * 17)) % 14;
          if (variant === 0) return 'U+' + hex;
          if (variant === 1) return kind + '#' + indexText;
          if (variant === 2) return hex.slice(-4) + ':' + indexText;
          if (variant === 3) return kind + '·' + hex.slice(-3);
          if (variant === 4) return 'D' + paddedNumber(codepoint % 100000, 5);
          if (variant === 5) return 'B' + binary.slice(-8);
          if (variant === 6) return 'X' + checksum.slice(-4);
          if (variant === 7) return 'P' + Math.floor(codepoint / 65536) + '·' + kind;
          if (variant === 8) return 'R' + paddedNumber(row, 2) + 'C' + paddedNumber(column, 2);
          if (variant === 9) return indexText + '>' + paddedNumber(index + 1, 3);
          if (variant === 10) return '[' + kind + ':' + hex.slice(-2) + ']';
          if (variant === 11) return 'O' + (codepoint & 511).toString(8).toUpperCase();
          if (variant === 12) return hex.slice(0, 2) + '.' + hex.slice(-2);
          return kind + '/' + checksum.slice(-3);
        }

        function cipherSecondaryToken(node, row, column) {
          var glyph = node.glyph || {};
          var source = String(glyph.ch || '');
          var codepoint = source ? source.codePointAt(0) : 0;
          var index = Math.max(0, node.glyphIndex || 0);
          var kind = cipherScriptTag(glyph);
          var checksum = fixedHex(cipherChecksum(codepoint, index, row + 11, column + 17));
          if (dialect === 'unicode') return 'SCALAR ' + fixedHex(codepoint) + ' / ' + kind;
          if (dialect === 'machine') return 'BIN ' + (codepoint & 255).toString(2).padStart(8, '0') + ' / ' + checksum.slice(-2);
          if (dialect === 'ledger') return 'FOLIO ' + paddedNumber(index, 3) + ' · ' + paddedNumber(row, 2) + ':' + paddedNumber(column, 2);
          if (dialect === 'ritual') return 'SEAL ' + checksum + ' · ' + kind;
          var variant = Math.floor(hash(index, row + column, params.seed + 1761) * 5);
          if (variant === 0) return 'SRC ' + kind + ' / ' + paddedNumber(index, 3);
          if (variant === 1) return 'CP ' + fixedHex(codepoint) + ' / ' + checksum.slice(-2);
          if (variant === 2) return 'REG ' + paddedNumber(row, 2) + ':' + paddedNumber(column, 2);
          if (variant === 3) return 'SEQ ' + paddedNumber(index, 3) + '—' + paddedNumber(index + 1, 3);
          return 'CHK ' + checksum;
        }

        function cipherCollectGroups(level) {
          var groupMap = {};
          var groups = [];
          for (var groupNodeIndex = 0; groupNodeIndex < nodes.length; groupNodeIndex++) {
            var groupNode = nodes[groupNodeIndex];
            var groupGlyph = groupNode.glyph || {};
            var lineKey = groupGlyph.line == null ? 0 : groupGlyph.line;
            var wordKey = groupGlyph.word == null ? groupNode.glyphIndex : groupGlyph.word;
            var groupKey = level === 'line' ? String(lineKey) : String(lineKey) + ':' + String(wordKey);
            var group = groupMap[groupKey];
            if (!group) {
              group = groupMap[groupKey] = {
                key: groupKey, level: level, nodes: [], scripts: {},
                minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity,
                firstIndex: Infinity, lastIndex: -Infinity
              };
              groups.push(group);
            }
            var groupRadius = Math.max(fontSize * 0.85, groupNode.r * 0.82);
            group.minX = Math.min(group.minX, groupNode.x - groupRadius);
            group.minY = Math.min(group.minY, groupNode.y - groupRadius);
            group.maxX = Math.max(group.maxX, groupNode.x + groupRadius);
            group.maxY = Math.max(group.maxY, groupNode.y + groupRadius);
            group.firstIndex = Math.min(group.firstIndex, groupNode.glyphIndex || 0);
            group.lastIndex = Math.max(group.lastIndex, groupNode.glyphIndex || 0);
            var scriptTag = cipherScriptTag(groupGlyph);
            group.scripts[scriptTag] = true;
            group.nodes.push(groupNode);
          }
          groups.sort(function (left, right) { return left.firstIndex - right.firstIndex; });
          return groups;
        }

        function cipherGroupChecksum(group, groupIndex) {
          var checksum = 0;
          for (var checksumNodeIndex = 0; checksumNodeIndex < group.nodes.length; checksumNodeIndex++) {
            var checksumGlyph = group.nodes[checksumNodeIndex].glyph || {};
            var checksumSource = String(checksumGlyph.ch || '');
            checksum ^= cipherChecksum(checksumSource ? checksumSource.codePointAt(0) : 0,
              group.nodes[checksumNodeIndex].glyphIndex || 0, groupIndex, checksumNodeIndex);
          }
          return fixedHex(checksum);
        }

        function cipherMacroToken(group, groupIndex) {
          var scriptList = Object.keys(group.scripts).join('+') || 'GL';
          var checksum = cipherGroupChecksum(group, groupIndex);
          var range = paddedNumber(group.firstIndex, 3) + '—' + paddedNumber(group.lastIndex, 3);
          var prefix = group.level === 'line' ? 'L' : 'W';
          if (dialect === 'unicode') return prefix + paddedNumber(groupIndex, 2) + ' / ' + scriptList
            + ' / CP ' + range;
          if (dialect === 'machine') return 'BUS ' + prefix + paddedNumber(groupIndex, 2)
            + ' · N' + paddedNumber(group.nodes.length, 2) + ' · CRC ' + checksum;
          if (dialect === 'ledger') return 'FOLIO ' + paddedNumber(groupIndex, 2)
            + ' · ENTRY ' + range + ' · SUM ' + checksum.slice(-3);
          if (dialect === 'ritual') return 'CANON ' + paddedNumber(groupIndex, 2)
            + ' · SEAL ' + checksum + ' · ' + scriptList;
          return 'REGION ' + prefix + paddedNumber(groupIndex, 2) + ' / ' + scriptList
            + ' / N' + paddedNumber(group.nodes.length, 2) + ' / ' + checksum;
        }

        function cipherHierarchyKind(group, groupIndex) {
          if (dialect === 'machine') return 0;
          if (dialect === 'ledger') return 1;
          if (dialect === 'ritual') return 2;
          if (dialect === 'unicode') return 3;
          return Math.floor(hash(group.firstIndex, groupIndex, params.seed + 1813) * 4);
        }

        function traceCipherFrameCorners(group, padding, corner, groupIndex) {
          var left = group.minX - padding, top = group.minY - padding;
          var right = group.maxX + padding, bottom = group.maxY + padding;
          ctx.beginPath();
          ctx.moveTo(left + corner, top); ctx.lineTo(left, top); ctx.lineTo(left, top + corner);
          ctx.moveTo(right - corner, top); ctx.lineTo(right, top); ctx.lineTo(right, top + corner);
          ctx.moveTo(left, bottom - corner); ctx.lineTo(left, bottom); ctx.lineTo(left + corner, bottom);
          ctx.moveTo(right, bottom - corner); ctx.lineTo(right, bottom); ctx.lineTo(right - corner, bottom);
          ctx.stroke();
          var frameKind = cipherHierarchyKind(group, groupIndex);
          if (frameKind === 0) {
            var bitCount = Math.max(4, Math.min(16, group.nodes.length * 2));
            var bitWidth = Math.max(fontSize * 0.36, (right - left) / Math.max(1, bitCount));
            for (var frameBit = 0; frameBit < bitCount; frameBit++) {
              var frameBitX = left + frameBit * bitWidth;
              ctx.strokeRect(frameBitX, top - fontSize * 0.54, bitWidth * 0.72, fontSize * 0.34);
              if ((cipherGroupChecksum(group, groupIndex).charCodeAt(frameBit % 4) >> (frameBit % 3)) & 1) {
                ctx.fillRect(frameBitX + bitWidth * 0.16, top - fontSize * 0.47,
                  bitWidth * 0.4, fontSize * 0.2);
              }
            }
          } else if (frameKind === 1) {
            ctx.beginPath();
            ctx.moveTo(left, top + (bottom - top) * 0.34); ctx.lineTo(right, top + (bottom - top) * 0.34);
            ctx.moveTo(left, top + (bottom - top) * 0.68); ctx.lineTo(right, top + (bottom - top) * 0.68);
            ctx.stroke();
          } else if (frameKind === 2) {
            var sealRadius = Math.max(fontSize * 0.54, corner * 0.38);
            ctx.beginPath();
            ctx.arc(right, top, sealRadius, 0, Math.PI * 2);
            ctx.arc(right, top, sealRadius * 0.45, 0, Math.PI * 2);
            ctx.stroke();
          } else {
            var tabWidth = Math.min(right - left, fontSize * (3.4 + Math.min(3, density)));
            ctx.beginPath();
            ctx.moveTo(left, top); ctx.lineTo(left + tabWidth * 0.76, top);
            ctx.lineTo(left + tabWidth, top + fontSize * 0.48);
            ctx.lineTo(left + tabWidth * 0.76, top + fontSize * 0.96);
            ctx.lineTo(left, top + fontSize * 0.96);
            ctx.stroke();
          }
        }

        function drawCipherHierarchy() {
          var wordGroups = cipherCollectGroups('word');
          var lineGroups = cipherCollectGroups('line');
          var hierarchyAlpha = Math.min(0.96, 0.28 + registers * 0.13 + callouts * 0.08);
          ctx.save();
          ctx.strokeStyle = color;
          ctx.fillStyle = color;
          ctx.lineCap = 'square';
          ctx.lineJoin = 'miter';
          for (var wordGroupIndex = 0; wordGroupIndex < wordGroups.length; wordGroupIndex++) {
            var wordGroup = wordGroups[wordGroupIndex];
            var wordPadding = fontSize * (0.64 + Math.min(4, registers) * 0.16);
            var wordCorner = Math.min((wordGroup.maxX - wordGroup.minX) * 0.16 + fontSize * 0.4,
              fontSize * (1.2 + density * 0.16));
            ctx.globalAlpha = hierarchyAlpha * (0.56 + Math.min(1, wordGroup.nodes.length / 4) * 0.28);
            ctx.lineWidth = Math.max(0.65, fontSize * (0.07 + registers * 0.012));
            traceCipherFrameCorners(wordGroup, wordPadding, wordCorner, wordGroupIndex);
            ctx.font = Math.max(4, fontSize * 0.9) + 'px "SFMono-Regular", Consolas, "Liberation Mono", monospace';
            ctx.textAlign = 'left';
            ctx.fillText(cipherMacroToken(wordGroup, wordGroupIndex),
              wordGroup.minX - wordPadding, wordGroup.minY - wordPadding - fontSize * 0.78);
          }
          for (var lineGroupIndex = 0; lineGroupIndex < lineGroups.length; lineGroupIndex++) {
            var lineGroup = lineGroups[lineGroupIndex];
            var lineOffset = fontSize * (1.3 + Math.min(4, registers) * 0.34)
              + orbit * Math.min(0.14, 0.035 + callouts * 0.015);
            var lineY = lineGroup.maxY + lineOffset
              + Math.sin(turn * 0.2 + lineGroupIndex * 1.71) * drift * 0.12;
            var lineLeft = lineGroup.minX - fontSize * (1.3 + registers * 0.3);
            var lineRight = lineGroup.maxX + fontSize * (1.3 + registers * 0.3);
            ctx.globalAlpha = hierarchyAlpha;
            ctx.lineWidth = Math.max(0.8, fontSize * (0.09 + registers * 0.018));
            ctx.beginPath();
            ctx.moveTo(lineLeft, lineY - fontSize * 0.72); ctx.lineTo(lineLeft, lineY);
            ctx.lineTo(lineRight, lineY); ctx.lineTo(lineRight, lineY - fontSize * 0.72);
            ctx.stroke();
            ctx.globalAlpha *= 0.62;
            for (var lineNodeIndex = 0; lineNodeIndex < lineGroup.nodes.length; lineNodeIndex++) {
              var lineNode = lineGroup.nodes[lineNodeIndex];
              ctx.beginPath();
              ctx.moveTo(lineNode.x, lineY - fontSize * (0.26 + (lineNodeIndex % 3) * 0.12));
              ctx.lineTo(lineNode.x, lineY + fontSize * 0.26);
              ctx.stroke();
            }
            ctx.globalAlpha = hierarchyAlpha;
            ctx.font = Math.max(5, fontSize * 1.22) + 'px "SFMono-Regular", Consolas, "Liberation Mono", monospace';
            ctx.fillText(cipherMacroToken(lineGroup, lineGroupIndex), lineLeft, lineY + fontSize * 1.02);
          }
          ctx.restore();
          ctx.font = Math.max(3, fontSize) + 'px "SFMono-Regular", Consolas, "Liberation Mono", monospace';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
        }

        var inscriptionCount = 0;
        var maxInscriptions = 1400;
        for (var i = 0; i < nodes.length && inscriptionCount < maxInscriptions; i++) {
          var node = nodes[i];
          var cellX = Math.max(fontSize * 5.3, fontSize * (6.35 - Math.min(2.2, density) * 0.42));
          var cellY = Math.max(fontSize * 1.05, fontSize * (1.42 - Math.min(2.5, density) * 0.1));
          var areaRadius = Math.max(node.r * 1.18, fontSize * 1.2);
          var columns = Math.max(1, Math.min(8, Math.ceil(areaRadius * 2 / cellX * density)));
          var rows = Math.max(1, Math.min(14, Math.ceil(areaRadius * 2 / cellY * density)));
          var startX = node.x - (columns * cellX) * 0.5;
          var startY = node.y - (rows - 1) * cellY * 0.5;
          ctx.globalAlpha = Math.min(0.76, 0.16 + node.strength * 0.54);
          for (var row = 0; row < rows && inscriptionCount < maxInscriptions; row++) {
            var rowDrift = (hash(i, row, params.seed + 1759) * 2 - 1) * drift
              + Math.sin(turn + row * 0.73 + i * 0.19) * drift * 0.22;
            for (var column = 0; column < columns && inscriptionCount < maxInscriptions; column++) {
              ctx.fillText(cipherToken(node, row, column), startX + column * cellX + rowDrift, startY + row * cellY);
              inscriptionCount++;
            }
          }
        }
        ctx.globalCompositeOperation = 'destination-in';
        ctx.globalAlpha = 1;
        ctx.drawImage(mask, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        drawCipherHierarchy();

        if (registers > 0.005) {
          var fullRegisters = Math.min(4, Math.floor(registers));
          var fractionalRegister = registers % 1;
          for (var registerNodeIndex = 0; registerNodeIndex < nodes.length; registerNodeIndex++) {
            var registerNode = nodes[registerNodeIndex];
            var registerGlyph = registerNode.glyph || {};
            var registerSource = String(registerGlyph.ch || '');
            var registerCodepoint = registerSource ? registerSource.codePointAt(0) : 0;
            var registerCount = fullRegisters
              + (hash(registerNodeIndex, params.seed % 97, 1769) < fractionalRegister ? 1 : 0);
            for (var registerLayer = 0; registerLayer < registerCount; registerLayer++) {
              var registerKind = dialect === 'machine' ? 0 : dialect === 'ledger' ? 1 : dialect === 'ritual' ? 2
                : dialect === 'unicode' ? 3 : Math.floor(hash(registerNodeIndex, registerLayer, params.seed + 1771) * 4);
              var registerAngle = hash(registerNodeIndex, registerLayer, 1773) * Math.PI * 2 + turn * 0.08;
              var registerRadius = Math.max(registerNode.r * (0.72 + registerLayer * 0.16), fontSize * (2.2 + registerLayer * 0.8));
              var registerX = registerNode.x + Math.cos(registerAngle) * registerRadius;
              var registerY = registerNode.y + Math.sin(registerAngle) * registerRadius;
              ctx.save();
              ctx.translate(registerX, registerY);
              ctx.rotate(registerAngle + Math.PI * 0.5);
              ctx.globalAlpha = Math.min(0.92, registerNode.strength * (0.42 + registers * 0.1));
              ctx.lineWidth = Math.max(0.5, fontSize * 0.07);
              if (registerKind === 0) {
                // Machine register: the low byte becomes an eight-cell strip.
                var bitText = (registerCodepoint & 255).toString(2);
                while (bitText.length < 8) bitText = '0' + bitText;
                var bitCell = fontSize * 0.48;
                for (var bit = 0; bit < 8; bit++) {
                  ctx.strokeRect((bit - 4) * bitCell, -bitCell * 0.5, bitCell * 0.78, bitCell);
                  if (bitText.charAt(bit) === '1') ctx.fillRect((bit - 4) * bitCell + bitCell * 0.18,
                    -bitCell * 0.32, bitCell * 0.42, bitCell * 0.64);
                }
              } else if (registerKind === 1) {
                // Ledger register: a source-indexed ruled entry, not another
                // floating HUD label.
                var ledgerWidth = fontSize * (4.2 + Math.min(2, density));
                var ledgerHeight = fontSize * 1.8;
                ctx.strokeRect(-ledgerWidth * 0.5, -ledgerHeight * 0.5, ledgerWidth, ledgerHeight);
                for (var ledgerRule = 1; ledgerRule < 3; ledgerRule++) {
                  var ledgerRuleY = -ledgerHeight * 0.5 + ledgerRule * ledgerHeight / 3;
                  ctx.beginPath();
                  ctx.moveTo(-ledgerWidth * 0.5, ledgerRuleY);
                  ctx.lineTo(ledgerWidth * 0.5, ledgerRuleY);
                  ctx.stroke();
                }
                var ledgerMark = ((registerNode.glyphIndex || 0) % 7 + 1) / 8;
                ctx.fillRect(-ledgerWidth * 0.46, -ledgerHeight * 0.37,
                  ledgerWidth * ledgerMark * 0.86, Math.max(1, fontSize * 0.12));
              } else if (registerKind === 2) {
                // Ritual register: checksum notches orbit a double seal.
                var sealRadius = fontSize * (0.82 + registerLayer * 0.16);
                ctx.beginPath();
                ctx.arc(0, 0, sealRadius, 0, Math.PI * 2);
                ctx.arc(0, 0, sealRadius * 0.46, 0, Math.PI * 2);
                ctx.stroke();
                var checksumValue = cipherChecksum(registerCodepoint, registerNode.glyphIndex || 0,
                  registerLayer, registerNodeIndex);
                for (var notch = 0; notch < 12; notch++) if ((checksumValue >> (notch % 8)) & 1) {
                  var notchAngle = notch * Math.PI * 2 / 12;
                  ctx.beginPath();
                  ctx.moveTo(Math.cos(notchAngle) * sealRadius * 1.08, Math.sin(notchAngle) * sealRadius * 1.08);
                  ctx.lineTo(Math.cos(notchAngle) * sealRadius * 1.42, Math.sin(notchAngle) * sealRadius * 1.42);
                  ctx.stroke();
                }
              } else {
                // Unicode register: plane/block brackets derived from the
                // scalar value form an indexed manuscript tab.
                var tabWidth = fontSize * 3.8;
                var tabHeight = fontSize * 1.15;
                ctx.beginPath();
                ctx.moveTo(-tabWidth * 0.5, tabHeight * 0.5);
                ctx.lineTo(-tabWidth * 0.5, -tabHeight * 0.5);
                ctx.lineTo(tabWidth * 0.22, -tabHeight * 0.5);
                ctx.lineTo(tabWidth * 0.5, 0);
                ctx.lineTo(tabWidth * 0.22, tabHeight * 0.5);
                ctx.closePath();
                ctx.stroke();
                ctx.textAlign = 'center';
                ctx.fillText('U+' + fixedHex(registerCodepoint), -tabWidth * 0.08, 0);
                ctx.textAlign = 'left';
              }
              ctx.restore();
            }
          }
        }

        var clusterX = 0, clusterY = 0;
        for (var c = 0; c < nodes.length; c++) { clusterX += nodes[c].x; clusterY += nodes[c].y; }
        clusterX /= nodes.length;
        clusterY /= nodes.length;
        var fullCallouts = Math.min(4, Math.floor(callouts));
        var fractionalCallouts = callouts % 1;
        var calloutIndex = 0;
        for (var n = 0; n < nodes.length; n++) {
          var repeats = fullCallouts + (hash(n, params.seed % 113, 1777) < fractionalCallouts ? 1 : 0);
          for (var repeat = 0; repeat < repeats; repeat++) {
            var sourceNode = nodes[n];
            var radialX = sourceNode.x - clusterX;
            var radialY = sourceNode.y - clusterY;
            var radialLength = Math.sqrt(radialX * radialX + radialY * radialY);
            var angle = radialLength > 1
              ? Math.atan2(radialY, radialX) + (repeat - (repeats - 1) * 0.5) * 0.46
              : hash(n, repeat, params.seed + 1783) * Math.PI * 2;
            angle += (hash(n, repeat, 1787) * 2 - 1) * 0.22;
            var dirX = Math.cos(angle), dirY = Math.sin(angle);
            var startDistance = Math.max(sourceNode.r * 0.62, fontSize * 1.2);
            var travel = orbit * (0.42 + hash(n, repeat, 1789) * 0.72) + fontSize * 1.6;
            var startX = sourceNode.x + dirX * startDistance;
            var startY = sourceNode.y + dirY * startDistance;
            var elbowX = startX + dirX * travel;
            var elbowY = startY + dirY * travel;
            var side = dirX < 0 ? -1 : 1;
            var labelX = elbowX + side * fontSize * (2.2 + hash(n, repeat, 1801) * 2.4);
            var labelY = elbowY + (hash(n, repeat, 1807) * 2 - 1) * drift * 0.34;
            var calloutTemplate = Math.floor(hash(n, repeat, params.seed + 1811) * 5);
            ctx.globalAlpha = Math.min(1, (0.28 + sourceNode.strength * 0.62) / Math.max(1, Math.sqrt(repeats)));
            ctx.lineWidth = Math.max(0.5, fontSize * 0.075);
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(elbowX, elbowY);
            ctx.lineTo(labelX, labelY);
            ctx.stroke();
            var bracket = fontSize * 0.72;
            if (calloutTemplate === 0) {
              ctx.beginPath();
              ctx.moveTo(labelX, labelY - bracket);
              ctx.lineTo(labelX, labelY + bracket);
              ctx.lineTo(labelX + side * bracket * 0.55, labelY + bracket);
              ctx.stroke();
            } else if (calloutTemplate === 1) {
              ctx.beginPath();
              ctx.arc(startX, startY, bracket * 0.38, 0, Math.PI * 2);
              ctx.moveTo(labelX, labelY - bracket * 0.7);
              ctx.lineTo(labelX, labelY + bracket * 0.7);
              ctx.moveTo(labelX - side * bracket * 0.34, labelY);
              ctx.lineTo(labelX + side * bracket * 0.34, labelY);
              ctx.stroke();
            } else if (calloutTemplate === 2) {
              ctx.beginPath();
              ctx.moveTo(labelX, labelY);
              ctx.lineTo(labelX + side * bracket * 0.78, labelY - bracket * 0.58);
              ctx.moveTo(labelX, labelY);
              ctx.lineTo(labelX + side * bracket * 0.78, labelY + bracket * 0.58);
              ctx.stroke();
            } else if (calloutTemplate === 3) {
              ctx.strokeRect(labelX - bracket * 0.34, labelY - bracket * 0.34, bracket * 0.68, bracket * 0.68);
              ctx.beginPath();
              ctx.moveTo(labelX, labelY - bracket * 0.62);
              ctx.lineTo(labelX, labelY + bracket * 0.62);
              ctx.stroke();
            } else {
              ctx.beginPath();
              ctx.arc(labelX, labelY, bracket * 0.48, -Math.PI * 0.76, Math.PI * 0.76);
              ctx.moveTo(labelX + side * bracket * 0.18, labelY - bracket * 0.7);
              ctx.lineTo(labelX + side * bracket * 0.18, labelY + bracket * 0.7);
              ctx.stroke();
            }
            ctx.textAlign = side < 0 ? 'right' : 'left';
            var textOffset = labelX + side * fontSize * 0.92;
            ctx.fillText(cipherToken(sourceNode, repeat, calloutIndex), textOffset, labelY - fontSize * 0.34);
            if (calloutTemplate >= 2 || repeat % 2) {
              ctx.globalAlpha *= 0.62;
              ctx.fillText(cipherSecondaryToken(sourceNode, repeat, calloutIndex), textOffset, labelY + fontSize * 0.72);
            }
            ctx.textAlign = 'left';
            calloutIndex++;
          }
        }

        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }
