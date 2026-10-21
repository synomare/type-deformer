(function(root){
  'use strict';
  // Shared authored renderers. Editor and Worker inject their frame environment;
  // the drawing implementation lives here, outside HTML extraction.
      function renderPlotterTrace(environment, targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var surfaceChoice=environment.surfaceChoice, params=environment.params, BATCH_PARAM_OPTIONS=environment.BATCH_PARAM_OPTIONS, renderPlotterTraceLegacy=environment.renderPlotterTraceLegacy, surfaceAggregate=environment.surfaceAggregate, buildSurfaceMask=environment.buildSurfaceMask, compositionState=environment.compositionState, traceMaskContoursV34=environment.traceMaskContoursV34, compositeSurfaceSource=environment.compositeSurfaceSource, traceAssignGlyphsV34=environment.traceAssignGlyphsV34, traceWarpPathV34=environment.traceWarpPathV34, traceOrderPathsV34=environment.traceOrderPathsV34, traceTimelineV34=environment.traceTimelineV34, surfaceScratch=environment.surfaceScratch, surfaceEffectColor=environment.surfaceEffectColor, renderTraceTimelineV34=environment.renderTraceTimelineV34;
        var grammar = surfaceChoice(glyphs, 'plotterTrace', 'traceGrammar', params.traceGrammar,
          BATCH_PARAM_OPTIONS.traceGrammar);
        if (grammar === 'legacy') {
          renderPlotterTraceLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        var density = surfaceAggregate(glyphs, 'plotterTrace', 'traceDensity', params.traceDensity);
        if (!density.weight) return;
        var definition = surfaceAggregate(glyphs, 'plotterTrace', 'traceDefinition', params.traceDefinition).value;
        var stroke = surfaceAggregate(glyphs, 'plotterTrace', 'traceStroke', params.traceStroke).value;
        var drift = surfaceAggregate(glyphs, 'plotterTrace', 'traceJitter', params.traceJitter).value * pixelScale * L.s;
        var lift = surfaceAggregate(glyphs, 'plotterTrace', 'traceLift', params.traceLift).value;
        var mask = buildSurfaceMask(glyphs, 'plotterTrace', width, height, pixelScale, L, fm);
        var animated = compositionState.enabled;
        var contours = traceMaskContoursV34(mask, density.value, animated);
        if (contours.length < 1) {
          renderPlotterTraceLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        compositeSurfaceSource(targetCtx, mask, 'plotterTrace', coverBase);
        traceAssignGlyphsV34(contours, glyphs, pixelScale, L);
        var diagonal = Math.max(1, Math.sqrt(width * width + height * height));
        var phase = animated ? (((compositionState.phase % 1) + 1) % 1) : 0;
        var phaseRad = phase * Math.PI * 2;
        var warpScale = grammar === 'circuit' ? 0.06 : (grammar === 'carriage' ? 0.035 : 0.09);
        var warp = Math.min(diagonal * 0.075, drift * warpScale);
        var routed = [];
        for (var contourIndex = 0; contourIndex < contours.length; contourIndex++) {
          routed.push(traceWarpPathV34(contours[contourIndex], warp, phaseRad, contourIndex + 1));
        }
        var orderBand = Math.max(12, params.fontSize * pixelScale * L.s * 0.8);
        var ordered = traceOrderPathsV34(routed, grammar, definition, orderBand);
        var timeline = traceTimelineV34(ordered, grammar, lift, drift);
        var work = surfaceScratch('plotter-v34-score', width, height, false);
        var ctx = work.ctx;
        ctx.strokeStyle = surfaceEffectColor('plotterTrace');
        ctx.fillStyle = surfaceEffectColor('plotterTrace');
        var baseWidth = Math.max(0.12, stroke * pixelScale * L.s);
        renderTraceTimelineV34(ctx, timeline, phase, baseWidth, density.strength, density.value,
          lift, drift, diagonal, animated, false);

        if (grammar === 'duet') {
          var responseDistance = Math.min(diagonal * 0.18,
            Math.max(baseWidth * 4.2, drift * 0.3 + params.fontSize * pixelScale * L.s * 0.055));
          var responsePaths = [];
          for (var responseIndex = 0; responseIndex < ordered.length; responseIndex++) {
            responsePaths.push(traceWarpPathV34(ordered[responseIndex], responseDistance,
              phaseRad + Math.PI * 0.64, responseIndex + 307));
          }
          var responseTimeline = traceTimelineV34(responsePaths, grammar, Math.min(1, lift * 0.78), drift);
          var responsePhase = animated ? (phase + 0.91) % 1 : 0;
          renderTraceTimelineV34(ctx, responseTimeline, responsePhase, baseWidth * 0.86,
            density.strength, density.value, lift, drift, diagonal, animated, true);
        }

        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderWebbing(environment, targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var surfaceChoice=environment.surfaceChoice, params=environment.params, BATCH_PARAM_OPTIONS=environment.BATCH_PARAM_OPTIONS, renderWebbingLegacy=environment.renderWebbingLegacy, surfaceAggregate=environment.surfaceAggregate, buildSurfaceMask=environment.buildSurfaceMask, compositeSurfaceSource=environment.compositeSurfaceSource, compositionState=environment.compositionState, surfaceFieldNodesForGlyphs=environment.surfaceFieldNodesForGlyphs, surfaceGraphEdges=environment.surfaceGraphEdges, hash=environment.hash, surfaceScratch=environment.surfaceScratch, surfaceEffectColor=environment.surfaceEffectColor;
        var topology = surfaceChoice(glyphs, 'webbing', 'webTopology', params.webTopology,
          BATCH_PARAM_OPTIONS.webTopology);
        if (topology === 'legacy') {
          renderWebbingLegacy(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase);
          return;
        }
        var density = surfaceAggregate(glyphs, 'webbing', 'webDensity', params.webDensity);
        if (!density.weight) return;
        var reach = Math.max(12,
          surfaceAggregate(glyphs, 'webbing', 'webReach', params.webReach).value * pixelScale * L.s);
        var tension = Math.max(0,
          surfaceAggregate(glyphs, 'webbing', 'webChaos', params.webChaos).value);
        var sag = surfaceAggregate(glyphs, 'webbing', 'webSag', params.webSag).value;
        var stroke = Math.max(0.1,
          surfaceAggregate(glyphs, 'webbing', 'webStroke', params.webStroke).value * pixelScale * L.s);
        var mask = buildSurfaceMask(glyphs, 'webbing', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'webbing', coverBase);
        var phase = compositionState.enabled
          ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : 0;
        var perGlyph = Math.min(6, Math.max(1, 1 + Math.round(density.value * 0.9)));
        var anchors = surfaceFieldNodesForGlyphs(glyphs, 'webbing', 108, perGlyph,
          pixelScale, L, phase, Math.min(1.8, tension * 0.045), 0.055);
        if (anchors.length < 2) return;
        var glyphCount = Object.create(null);
        for (var anchorCount = 0; anchorCount < anchors.length; anchorCount++) {
          glyphCount[anchors[anchorCount].glyphIndex] = true;
        }
        if (Object.keys(glyphCount).length < 2) return;

        var edges = surfaceGraphEdges(anchors, reach, Math.min(3.8, 0.8 + density.value * 0.78),
          2017, 3.2, true);
        if (!edges.length) return;
        var maximumEdges = Math.min(edges.length, 240);
        edges = edges.slice(0, maximumEdges);
        var junctions = [];
        var incident = new Array(anchors.length);
        for (var incidentIndex = 0; incidentIndex < incident.length; incidentIndex++) incident[incidentIndex] = [];
        for (var edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
          var edge = edges[edgeIndex];
          var edgeDx = edge.b.x - edge.a.x, edgeDy = edge.b.y - edge.a.y;
          var edgeLength = Math.max(1, Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy));
          var normalX = -edgeDy / edgeLength, normalY = edgeDx / edgeLength;
          var bias = (hash(edgeIndex, params.seed % 97, 2027) * 2 - 1) *
            edgeLength * Math.min(0.18, 0.018 + tension * 0.014);
          var gravity = Math.max(-edgeLength * 0.48, Math.min(edgeLength * 0.48,
            edgeLength * sag * 0.055));
          var junction = {
            x: (edge.a.x + edge.b.x) * 0.5 + normalX * bias,
            y: (edge.a.y + edge.b.y) * 0.5 + normalY * bias + gravity,
            seedX: (edge.a.x + edge.b.x) * 0.5 + normalX * bias,
            seedY: (edge.a.y + edge.b.y) * 0.5 + normalY * bias + gravity,
            a: edge.ai, b: edge.bi, edge: edge,
            strength: Math.min(edge.a.strength, edge.b.strength)
          };
          junctions.push(junction);
          incident[edge.ai].push(edgeIndex);
          incident[edge.bi].push(edgeIndex);
        }

        // A small force-density relaxation: glyph anchors remain fixed while
        // every free junction seeks weighted equilibrium with its two anchors
        // and neighbouring junctions that share an anchor. Gravity is an
        // external load, not an arbitrary Bezier decoration.
        if (topology === 'tensile' || topology === 'membrane') {
          var iterations = Math.min(18, 6 + Math.round(tension * 1.35));
          for (var iteration = 0; iteration < iterations; iteration++) {
            var nextPositions = new Array(junctions.length);
            for (var junctionIndex = 0; junctionIndex < junctions.length; junctionIndex++) {
              var current = junctions[junctionIndex];
              var sumX = current.edge.a.x + current.edge.b.x;
              var sumY = current.edge.a.y + current.edge.b.y;
              var totalWeight = 2;
              var neighborhood = incident[current.a].concat(incident[current.b]);
              for (var neighborIndex = 0; neighborIndex < neighborhood.length; neighborIndex++) {
                var otherIndex = neighborhood[neighborIndex];
                if (otherIndex === junctionIndex) continue;
                var other = junctions[otherIndex];
                var q = 0.14 + density.value * 0.045;
                sumX += other.x * q;
                sumY += other.y * q;
                totalWeight += q;
              }
              var load = sag * current.edge.distance * 0.0035;
              var targetX = sumX / totalWeight;
              var targetY = sumY / totalWeight + load;
              var restraint = Math.max(0.12, Math.min(0.72, 0.58 - tension * 0.025));
              nextPositions[junctionIndex] = {
                x: current.x * restraint + targetX * (1 - restraint),
                y: current.y * restraint + targetY * (1 - restraint)
              };
            }
            for (var updateIndex = 0; updateIndex < junctions.length; updateIndex++) {
              junctions[updateIndex].x = nextPositions[updateIndex].x;
              junctions[updateIndex].y = nextPositions[updateIndex].y;
            }
          }
        }

        var work = surfaceScratch('web-force-density', width, height, false);
        var ctx = work.ctx;
        var color = surfaceEffectColor('webbing');
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        var baseAlpha = Math.min(0.96, density.strength * (0.54 + density.value * 0.1));

        function strokeMember(a, j, b, offset, alpha, widthScale) {
          var dx = b.x - a.x, dy = b.y - a.y;
          var distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          var nx = -dy / distance, ny = dx / distance;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = Math.max(0.18, stroke * widthScale);
          ctx.beginPath();
          ctx.moveTo(a.x + nx * offset, a.y + ny * offset);
          ctx.quadraticCurveTo(j.x + nx * offset * 0.2, j.y + ny * offset * 0.2,
            b.x - nx * offset, b.y - ny * offset);
          ctx.stroke();
        }

        if (topology === 'radial') {
          var centerX = 0, centerY = 0, centerWeight = 0;
          for (var radialAnchorIndex = 0; radialAnchorIndex < anchors.length; radialAnchorIndex++) {
            centerX += anchors[radialAnchorIndex].x * anchors[radialAnchorIndex].strength;
            centerY += anchors[radialAnchorIndex].y * anchors[radialAnchorIndex].strength;
            centerWeight += anchors[radialAnchorIndex].strength;
          }
          centerX /= Math.max(0.001, centerWeight);
          centerY /= Math.max(0.001, centerWeight);
          var hubCount = Math.min(5, Math.max(1, Math.round(1 + density.value * 0.55)));
          var hubs = [];
          for (var hubIndex = 0; hubIndex < hubCount; hubIndex++) {
            var hubAngle = phase * 0.12 + hubIndex * Math.PI * 2 / hubCount;
            var hubOrbit = Math.min(reach * 0.16, (12 + tension * 3.5) * pixelScale * L.s);
            hubs.push({
              x: centerX + Math.cos(hubAngle) * hubOrbit,
              y: centerY + Math.sin(hubAngle) * hubOrbit + sag * hubOrbit * 0.08
            });
          }
          var sortedAnchors = anchors.slice().sort(function (left, right) {
            return Math.atan2(left.y - centerY, left.x - centerX) - Math.atan2(right.y - centerY, right.x - centerX);
          });
          for (var radialIndex = 0; radialIndex < sortedAnchors.length; radialIndex++) {
            var radialAnchor = sortedAnchors[radialIndex];
            var hub = hubs[radialIndex % hubs.length];
            strokeMember(radialAnchor, {
              x: (radialAnchor.x + hub.x) * 0.5 + Math.sin(radialIndex * 1.7 + phase) * stroke * (1 + tension * 0.2),
              y: (radialAnchor.y + hub.y) * 0.5 + sag * 2
            }, hub, 0, baseAlpha * radialAnchor.strength, 0.8);
            if (radialIndex > 0) {
              var previousAnchor = sortedAnchors[radialIndex - 1];
              strokeMember(previousAnchor, {
                x: (previousAnchor.x + radialAnchor.x) * 0.5,
                y: (previousAnchor.y + radialAnchor.y) * 0.5 + sag * 1.4
              }, radialAnchor, 0, baseAlpha * 0.5, 0.42);
            }
          }
          for (var radialHubIndex = 0; radialHubIndex < hubs.length; radialHubIndex++) {
            ctx.globalAlpha = baseAlpha;
            ctx.beginPath();
            ctx.arc(hubs[radialHubIndex].x, hubs[radialHubIndex].y,
              Math.max(1.2, stroke * (1.6 + density.value * 0.22)), 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (topology === 'braided') {
          for (var braidEdgeIndex = 0; braidEdgeIndex < junctions.length; braidEdgeIndex++) {
            var braidJunction = junctions[braidEdgeIndex];
            var braidEdge = braidJunction.edge;
            var braidWidth = stroke * (1.6 + Math.min(5, density.value) * 0.58);
            var passCount = Math.min(5, 2 + Math.round(density.value * 0.55));
            for (var braidPass = 0; braidPass < passCount; braidPass++) {
              var braidOffset = (braidPass - (passCount - 1) / 2) * braidWidth;
              var crossing = Math.sin(phase * 0.45 + braidEdgeIndex * 1.37 + braidPass * Math.PI) * braidWidth;
              strokeMember(braidEdge.a, {
                x: braidJunction.x + crossing,
                y: braidJunction.y - crossing * 0.35
              }, braidEdge.b, braidOffset, baseAlpha * (0.5 + 0.5 / passCount),
              0.38 + (braidPass % 2) * 0.22);
            }
            ctx.globalAlpha = baseAlpha * 0.52;
            ctx.lineWidth = Math.max(0.35, stroke * 0.32);
            ctx.beginPath();
            ctx.arc(braidJunction.x, braidJunction.y, Math.max(1.5, braidWidth * 0.46), 0, Math.PI * 2);
            ctx.stroke();
          }
        } else {
          for (var memberIndex = 0; memberIndex < junctions.length; memberIndex++) {
            var member = junctions[memberIndex];
            var memberStrands = Math.min(5, 1 + Math.round(density.value * 0.62));
            for (var memberStrand = 0; memberStrand < memberStrands; memberStrand++) {
              var strandOffset = (memberStrand - (memberStrands - 1) * 0.5) * stroke * (0.75 + tension * 0.08);
              strokeMember(member.edge.a, member, member.edge.b, strandOffset,
                baseAlpha * member.strength * (0.46 + 0.54 / memberStrands),
                member.edge.kind === 'trunk' ? 0.86 : 0.55);
            }
          }
          // Neighbouring equilibrated nodes make the field read as a cable
          // net. In membrane mode they close into translucent tensile cells.
          for (var anchorIndex = 0; anchorIndex < incident.length; anchorIndex++) {
            var ring = incident[anchorIndex].map(function (junctionIndex) { return junctions[junctionIndex]; });
            if (ring.length < 2) continue;
            var ringAnchor = anchors[anchorIndex];
            ring.sort(function (left, right) {
              return Math.atan2(left.y - ringAnchor.y, left.x - ringAnchor.x)
                - Math.atan2(right.y - ringAnchor.y, right.x - ringAnchor.x);
            });
            if (topology === 'membrane' && ring.length >= 3) {
              ctx.globalAlpha = Math.min(0.14, baseAlpha * 0.13);
              ctx.beginPath();
              ctx.moveTo(ring[0].x, ring[0].y);
              for (var cellIndex = 1; cellIndex < ring.length; cellIndex++) ctx.lineTo(ring[cellIndex].x, ring[cellIndex].y);
              ctx.closePath();
              ctx.fill();
            }
            ctx.globalAlpha = baseAlpha * (topology === 'membrane' ? 0.54 : 0.34);
            ctx.lineWidth = Math.max(0.22, stroke * (topology === 'membrane' ? 0.48 : 0.32));
            ctx.beginPath();
            ctx.moveTo(ring[0].x, ring[0].y);
            for (var ringIndex = 1; ringIndex < ring.length; ringIndex++) ctx.lineTo(ring[ringIndex].x, ring[ringIndex].y);
            if (topology === 'membrane' && ring.length > 2) ctx.closePath();
            ctx.stroke();
          }
        }

        for (var junctionDotIndex = 0; junctionDotIndex < junctions.length; junctionDotIndex++) {
          var dot = junctions[junctionDotIndex];
          ctx.globalAlpha = baseAlpha * dot.strength * (topology === 'membrane' ? 0.58 : 0.82);
          ctx.beginPath();
          ctx.arc(dot.x, dot.y, Math.max(0.7, stroke * (0.52 + Math.min(5, density.value) * 0.08)), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        targetCtx.save();
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.drawImage(work.canvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
        targetCtx.restore();
      }

      function renderSoftBlobSporeField(environment, cores, width, height, averageRadius, reach, density, phase) {
        var surfaceScratch=environment.surfaceScratch, hash=environment.hash, params=environment.params, fillOrganicNode=environment.fillOrganicNode;
        if (!cores.length || reach <= 1 || density <= 0.002) return null;
        var cloudRaw = surfaceScratch('blob-spore-cloud-raw', width, height, false);
        var cloudSoft = surfaceScratch('blob-spore-cloud-soft', width, height, false);
        var dust = surfaceScratch('blob-spore-dust', width, height, false);
        cloudRaw.ctx.fillStyle = '#fff';
        dust.ctx.fillStyle = '#fff';
        dust.ctx.strokeStyle = '#fff';
        dust.ctx.lineCap = 'round';

        // sqrt distribution favors the outer field instead of piling every
        // spore against the glyph. Caps keep extreme mobile settings usable.
        var budget = Math.min(620, Math.max(16, Math.round(cores.length *
          (1.4 + density * 2.8 + Math.min(2.2, reach / Math.max(80, averageRadius * 12))))));
        for (var i = 0; i < budget; i++) {
          var parentIndex = Math.min(cores.length - 1, Math.floor(hash(i, params.seed % 97, 701) * cores.length));
          var parent = cores[parentIndex];
          var radialUnit = Math.sqrt(hash(i, parentIndex, params.seed + 703));
          var distance = reach * (0.06 + radialUnit * 0.94);
          var baseAngle = hash(parentIndex, i, params.seed + 709) * Math.PI * 2;
          var curl = Math.sin(phase + parentIndex * 0.73 + i * 0.19) * (0.12 + density * 0.035);
          var angle = baseAngle + curl;
          var drift = reach * (0.018 + density * 0.008);
          var x = parent.x + Math.cos(angle) * distance + Math.cos(phase + i * 0.31) * drift;
          var y = parent.y + Math.sin(angle) * distance + Math.sin(phase + i * 0.27) * drift;
          var falloff = Math.max(0.18, 1 - radialUnit * 0.68);
          var sporeRadius = Math.max(0.48, averageRadius *
            (0.025 + hash(i, 5, params.seed + 719) * (0.055 + density * 0.018)));

          dust.ctx.globalAlpha = parent.strength * Math.min(0.72, (0.14 + density * 0.075) * falloff);
          dust.ctx.beginPath();
          dust.ctx.arc(x, y, sporeRadius, 0, Math.PI * 2);
          dust.ctx.fill();
          if (hash(i, 7, params.seed + 727) < 0.16 + density * 0.08) {
            dust.ctx.globalAlpha = parent.strength * (0.055 + density * 0.035) * falloff;
            dust.ctx.lineWidth = Math.max(0.38, sporeRadius * 0.28);
            dust.ctx.beginPath();
            dust.ctx.arc(x, y, sporeRadius * (1.8 + hash(i, 9, params.seed + 733) * 2.4), 0, Math.PI * 2);
            dust.ctx.stroke();
          }

          var clusterCount = 1 + Math.min(4, Math.floor(density));
          for (var cluster = 0; cluster < clusterCount; cluster++) {
            if (hash(i, cluster, params.seed + 739) > 0.34 + density * 0.11) continue;
            var clusterAngle = hash(cluster, i, params.seed + 743) * Math.PI * 2;
            var clusterDistance = averageRadius * (0.12 + hash(i, cluster, params.seed + 751) * (0.7 + density * 0.28));
            dust.ctx.globalAlpha = parent.strength * (0.08 + density * 0.035) * falloff;
            dust.ctx.beginPath();
            dust.ctx.arc(x + Math.cos(clusterAngle) * clusterDistance, y + Math.sin(clusterAngle) * clusterDistance,
              Math.max(0.34, sporeRadius * (0.36 + hash(cluster, i, params.seed + 757) * 0.58)), 0, Math.PI * 2);
            dust.ctx.fill();
          }

          if (hash(i, parentIndex, params.seed + 761) < 0.4 + density * 0.13) {
            var island = {
              x: x,
              y: y,
              r: Math.max(3, averageRadius * (0.5 + density * 0.48) *
                (0.7 + hash(i, 13, params.seed + 769) * 1.25))
            };
            cloudRaw.ctx.globalAlpha = parent.strength * Math.min(0.28, 0.07 + density * 0.04) * falloff;
            fillOrganicNode(cloudRaw.ctx, island, phase, 0.18 + density * 0.18, i + 773);
          }
        }

        // Sparse large fronts turn the particles into a discontinuous plane;
        // they remain porous because the crisp dust is painted separately.
        var frontCount = Math.min(64, Math.max(12, cores.length));
        for (var front = 0; front < frontCount; front++) {
          if (hash(front, params.seed % 83, 787) > 0.55 + density * 0.09) continue;
          // frontCount deliberately has a floor so a sparse one-glyph field
          // can still form a plane. Reuse a deterministic valid core instead
          // of indexing past the shorter core array.
          var frontCoreIndex = Math.min(cores.length - 1,
            Math.floor(hash(front, params.seed % 79, 791) * cores.length));
          var core = cores[frontCoreIndex];
          var frontAngle = hash(front, 17, params.seed + 797) * Math.PI * 2;
          var frontDistance = reach * (0.24 + hash(front, 19, params.seed + 809) * 0.56);
          var frontNode = {
            x: core.x + Math.cos(frontAngle) * frontDistance,
            y: core.y + Math.sin(frontAngle) * frontDistance,
            r: Math.max(6, reach * (0.05 + hash(front, 23, params.seed + 811) * (0.07 + density * 0.018)))
          };
          cloudRaw.ctx.globalAlpha = core.strength * Math.min(0.2, 0.06 + density * 0.025);
          fillOrganicNode(cloudRaw.ctx, frontNode, phase, 0.25 + density * 0.16, front + 821);
        }
        cloudRaw.ctx.globalAlpha = 1;
        dust.ctx.globalAlpha = 1;
        var blur = Math.min(42, 3 + density * 2.6 + reach * 0.012);
        if ('filter' in cloudSoft.ctx) cloudSoft.ctx.filter = 'blur(' + blur.toFixed(2) + 'px)';
        cloudSoft.ctx.globalAlpha = Math.min(1, 0.72 + density * 0.06);
        cloudSoft.ctx.drawImage(cloudRaw.canvas, 0, 0);
        if ('filter' in cloudSoft.ctx) cloudSoft.ctx.filter = 'none';
        cloudSoft.ctx.globalAlpha = 0.58;
        cloudSoft.ctx.drawImage(cloudRaw.canvas, 0, 0);
        cloudSoft.ctx.globalAlpha = 1;
        return { cloud: cloudSoft.canvas, dust: dust.canvas };
      }

      function renderSoftBlob(environment, targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {
        var surfaceAggregate=environment.surfaceAggregate, params=environment.params, buildSurfaceMask=environment.buildSurfaceMask, compositeSurfaceSource=environment.compositeSurfaceSource, surfaceScratch=environment.surfaceScratch, compositionState=environment.compositionState, surfaceFxPhase=environment.surfaceFxPhase, surfaceFieldNodesForGlyphs=environment.surfaceFieldNodesForGlyphs, renderSoftBlobSporeField=environment.renderSoftBlobSporeField, surfaceGraphEdges=environment.surfaceGraphEdges, hash=environment.hash, strokeSurfaceCurve=environment.strokeSurfaceCurve, drawSurfaceTube=environment.drawSurfaceTube, surfaceCurveSpec=environment.surfaceCurveSpec, cubicSurfacePoint=environment.cubicSurfacePoint, fillOrganicNode=environment.fillOrganicNode, paintSurfaceMask=environment.paintSurfaceMask, surfaceEffectColor=environment.surfaceEffectColor;
        var mass = surfaceAggregate(glyphs, 'softBlob', 'softBlobInflation', params.softBlobInflation);
        if (!mass.weight) return;
        var connectivity = surfaceAggregate(glyphs, 'softBlob', 'softBlobStiffness', params.softBlobStiffness).value;
        var branching = surfaceAggregate(glyphs, 'softBlob', 'softBlobChaos', params.softBlobChaos).value;
        var membrane = surfaceAggregate(glyphs, 'softBlob', 'softBlobMembrane', params.softBlobMembrane).value;
        var sporeReach = surfaceAggregate(glyphs, 'softBlob', 'softBlobSporeReach', params.softBlobSporeReach).value * pixelScale * L.s;
        var sporeDensity = surfaceAggregate(glyphs, 'softBlob', 'softBlobSporeDensity', params.softBlobSporeDensity).value;
        var pulse = surfaceAggregate(glyphs, 'softBlob', 'softBlobSpeed', params.softBlobSpeed).value;
        var mask = buildSurfaceMask(glyphs, 'softBlob', width, height, pixelScale, L, fm);
        compositeSurfaceSource(targetCtx, mask, 'softBlob', coverBase);
        var raw = surfaceScratch('blob-raw', width, height, false);
        raw.ctx.globalAlpha = Math.min(1, 0.26 + mass.value * 0.34);
        raw.ctx.drawImage(mask, 0, 0);
        raw.ctx.globalAlpha = 1;
        raw.ctx.fillStyle = '#fff';
        raw.ctx.strokeStyle = '#fff';
        raw.ctx.lineCap = 'round';
        var phase = compositionState.enabled ? (((compositionState.phase % 1) + 1) % 1) * Math.PI * 2 : surfaceFxPhase * Math.PI * 2;
        var particlesPerGlyph = Math.min(7, 2 + Math.round(mass.value * 0.4 + branching * 0.65));
        var cores = surfaceFieldNodesForGlyphs(glyphs, 'softBlob', 112, particlesPerGlyph, pixelScale, L, phase,
          branching * 0.42, pulse);
        if (!cores.length) return;
        var averageRadius = 0;
        for (var c = 0; c < cores.length; c++) {
          cores[c].r *= 0.28 + mass.value * 0.42 + membrane * 0.16;
          averageRadius += cores[c].r;
        }
        averageRadius /= cores.length;
        var sporeField = renderSoftBlobSporeField(cores, width, height, averageRadius, sporeReach, sporeDensity, phase);
        var reach = Math.max(averageRadius * 9, params.fontSize * pixelScale * L.s * (0.72 + connectivity * 1.85));
        var hasMultipleGlyphs = false;
        for (var glyphCheck = 1; glyphCheck < cores.length; glyphCheck++) {
          if (cores[glyphCheck].glyphIndex !== cores[0].glyphIndex) { hasMultipleGlyphs = true; break; }
        }
        var coreEdges = surfaceGraphEdges(cores, reach, 0.18 + branching * 0.55, 613, 2.15 + connectivity * 0.72, hasMultipleGlyphs);
        var degrees = new Array(cores.length);
        for (var degreeIndex = 0; degreeIndex < degrees.length; degreeIndex++) degrees[degreeIndex] = 0;
        for (var degreeEdge = 0; degreeEdge < coreEdges.length; degreeEdge++) {
          degrees[coreEdges[degreeEdge].ai] += 1;
          degrees[coreEdges[degreeEdge].bi] += 1;
        }
        var satellites = [], satelliteEdges = [];
        for (var n = 0; n < cores.length; n++) {
          var satellitesPerNode = hash(n, params.seed % 97, 617) < 0.03 + branching * 0.12 ? 1 : 0;
          if (branching > 0.72 && hash(n, params.seed % 67, 619) < branching * 0.34) satellitesPerNode += 1;
          for (var q = 0; q < satellitesPerNode; q++) {
            if (satellites.length >= 160 - cores.length) break;
            var angle = hash(n, q, params.seed + 623) * Math.PI * 2 + phase * (0.04 + pulse * 0.12);
            var orbit = cores[n].r * (2.5 + hash(q, n, params.seed + 631) * (2.1 + branching * 2.2));
            var satellite = {
              x: cores[n].x + Math.cos(angle) * orbit,
              y: cores[n].y + Math.sin(angle) * orbit,
              r: cores[n].r * (0.16 + hash(n + q, 5, params.seed + 637) * (0.12 + branching * 0.12)),
              strength: cores[n].strength,
              glyphIndex: cores[n].glyphIndex,
              parent: cores[n]
            };
            satellites.push(satellite);
            satelliteEdges.push({ a: cores[n], b: satellite, distance: orbit, kind: 'tendril' });
          }
        }
        var capillaryEdges = surfaceGraphEdges(satellites, Math.max(averageRadius * 6, reach * 0.48), branching * 0.65, 641, 1.2);

        raw.ctx.lineWidth = Math.max(0.42, averageRadius * (0.075 + branching * 0.055));
        for (var microEdge = 0; microEdge < capillaryEdges.length; microEdge++) {
          var micro = capillaryEdges[microEdge];
          if (micro.distance > reach * 0.48) continue;
          raw.ctx.globalAlpha = Math.min(micro.a.strength, micro.b.strength) * (0.12 + connectivity * 0.18 + branching * 0.14);
          strokeSurfaceCurve(raw.ctx, micro.a, micro.b, phase, 0.48 + branching * 0.62, microEdge + 643, 0);
        }

        var junctionWidths = new Array(cores.length);
        for (var junctionIndex = 0; junctionIndex < junctionWidths.length; junctionIndex++) junctionWidths[junctionIndex] = 0;
        for (var e = 0; e < coreEdges.length; e++) {
          var coreEdge = coreEdges[e];
          var wave = 0.82 + Math.sin(phase * (0.7 + pulse * 1.8) + e * 1.37) * (0.08 + pulse * 0.16);
          var edgeWeight = coreEdge.kind === 'trunk' ? 1 : 0.62 + connectivity * 0.17;
          var tubeWidth = Math.max((2 + mass.value * 3.2) * edgeWeight,
            Math.min(coreEdge.a.r, coreEdge.b.r) * (1.12 + mass.value * 1.16 + membrane * 0.34) * wave * edgeWeight);
          var edgeTension = coreEdge.kind === 'trunk' ? 0.44 + branching * 0.58 : 0.9 + branching * 0.92;
          junctionWidths[coreEdge.ai] = Math.max(junctionWidths[coreEdge.ai], tubeWidth);
          junctionWidths[coreEdge.bi] = Math.max(junctionWidths[coreEdge.bi], tubeWidth);
          drawSurfaceTube(raw.ctx, coreEdge.a, coreEdge.b, tubeWidth, phase, edgeTension, e + 647,
            Math.min(coreEdge.a.strength, coreEdge.b.strength) * (coreEdge.kind === 'trunk' ? 0.96 : 0.72));
          if (hash(e, params.seed % 89, 649) < 0.24 + mass.value * 0.28) {
            var tissueCurve = surfaceCurveSpec(coreEdge.a, coreEdge.b, phase, edgeTension, e + 647, 0);
            var tissuePoint = cubicSurfacePoint(tissueCurve, 0.36 + hash(e, 7, params.seed + 651) * 0.3);
            tissuePoint.r = tubeWidth * (0.48 + hash(e, 9, params.seed + 652) * 0.26);
            raw.ctx.globalAlpha = Math.min(coreEdge.a.strength, coreEdge.b.strength) * (coreEdge.kind === 'trunk' ? 0.9 : 0.64);
            fillOrganicNode(raw.ctx, tissuePoint, phase, branching * 0.7, e + 653);
          }
        }
        for (var t = 0; t < satelliteEdges.length; t++) {
          var tendril = satelliteEdges[t];
          drawSurfaceTube(raw.ctx, tendril.a, tendril.b, Math.max(0.75, tendril.a.r * (0.22 + mass.value * 0.22)), phase,
            0.38 + branching * 0.5, t + 653, tendril.a.strength * (0.38 + branching * 0.25));
        }
        for (var nodeIndex = 0; nodeIndex < cores.length; nodeIndex++) {
          var node = cores[nodeIndex];
          var nodePulse = 0.88 + Math.sin(phase * (0.65 + pulse * 1.9) + nodeIndex * 1.31) * pulse * 0.14;
          var originalRadius = node.r;
          node.r = Math.max(originalRadius * Math.min(1.02, 0.48 + Math.max(1, degrees[nodeIndex]) * 0.13 + mass.value * 0.12),
            junctionWidths[nodeIndex] * (0.5 + Math.min(3, degrees[nodeIndex]) * 0.08)) * nodePulse;
          raw.ctx.globalAlpha = node.strength * (0.78 + Math.min(3, degrees[nodeIndex]) * 0.06);
          fillOrganicNode(raw.ctx, node, phase, branching, nodeIndex + 661);
          node.r = originalRadius;
          if (hash(nodeIndex, params.seed % 71, 669) < 0.08 + branching * 0.28) {
            var sporeCount = 1 + (branching > 0.68 ? 1 : 0);
            for (var spore = 0; spore < sporeCount; spore++) {
              var sporeAngle = hash(nodeIndex, spore, params.seed + 673) * Math.PI * 2 + phase * 0.06;
              var sporeDistance = originalRadius * (2.8 + hash(spore, nodeIndex, params.seed + 677) * (2.2 + branching * 2));
              raw.ctx.globalAlpha = node.strength * (0.12 + branching * 0.22);
              raw.ctx.beginPath();
              raw.ctx.arc(node.x + Math.cos(sporeAngle) * sporeDistance, node.y + Math.sin(sporeAngle) * sporeDistance,
                Math.max(0.55, originalRadius * (0.045 + hash(spore, 7, params.seed + 683) * 0.065)), 0, Math.PI * 2);
              raw.ctx.fill();
            }
          }
        }
        for (var satelliteIndex = 0; satelliteIndex < satellites.length; satelliteIndex++) {
          raw.ctx.globalAlpha = satellites[satelliteIndex].strength * (0.38 + branching * 0.2);
          fillOrganicNode(raw.ctx, satellites[satelliteIndex], phase, branching * 0.7, satelliteIndex + 687);
        }
        raw.ctx.globalCompositeOperation = 'destination-out';
        raw.ctx.strokeStyle = '#000';
        raw.ctx.lineCap = 'round';
        for (var vein = 0; vein < coreEdges.length; vein++) {
          var veinEdge = coreEdges[vein];
          raw.ctx.globalAlpha = (veinEdge.kind === 'trunk' ? 0.045 : 0.025) + connectivity * 0.075;
          raw.ctx.lineWidth = Math.max(0.4, Math.min(veinEdge.a.r, veinEdge.b.r) * (0.045 + (1 - mass.value) * 0.045));
          strokeSurfaceCurve(raw.ctx, veinEdge.a, veinEdge.b, phase,
            veinEdge.kind === 'trunk' ? 0.44 + branching * 0.58 : 0.9 + branching * 0.92, vein + 691, 0);
        }
        raw.ctx.globalCompositeOperation = 'source-over';
        raw.ctx.globalAlpha = 1;
        var merged = surfaceScratch('blob-merged', width, height, false);
        if ('filter' in merged.ctx) merged.ctx.filter = 'blur(' + (0.7 + mass.value * 1.55 + membrane * 1.4).toFixed(2) + 'px)';
        merged.ctx.globalAlpha = Math.min(1, 0.64 + mass.value * 0.2);
        merged.ctx.drawImage(raw.canvas, 0, 0);
        if ('filter' in merged.ctx) merged.ctx.filter = 'none';
        merged.ctx.globalAlpha = Math.min(1, 0.72 + mass.value * 0.18);
        merged.ctx.drawImage(raw.canvas, 0, 0);
        merged.ctx.globalAlpha = 1;
        if (sporeField) {
          paintSurfaceMask(targetCtx, sporeField.cloud, surfaceEffectColor('softBlob'),
            mass.strength * Math.min(0.86, 0.34 + sporeDensity * 0.1), 'blob-spore-cloud-color');
        }
        if (membrane > 0.002) {
          var halo = surfaceScratch('blob-membrane', width, height, false);
          if ('filter' in halo.ctx) halo.ctx.filter = 'blur(' + (2 + membrane * 4.5 + mass.value * 0.8).toFixed(2) + 'px)';
          halo.ctx.globalAlpha = Math.min(0.92, 0.18 + membrane * 0.16);
          halo.ctx.drawImage(merged.canvas, 0, 0);
          if ('filter' in halo.ctx) halo.ctx.filter = 'none';
          halo.ctx.globalAlpha = 1;
          paintSurfaceMask(targetCtx, halo.canvas, surfaceEffectColor('softBlob'),
            mass.strength * Math.min(0.72, 0.12 + membrane * 0.14), 'blob-membrane-color');
        }
        paintSurfaceMask(targetCtx, merged.canvas, surfaceEffectColor('softBlob'), mass.strength, 'blob-color');
        if (sporeField) {
          paintSurfaceMask(targetCtx, sporeField.dust, surfaceEffectColor('softBlob'),
            mass.strength * Math.min(1, 0.5 + sporeDensity * 0.12), 'blob-spore-dust-color');
        }
      }

      function strokeWebCatenary(environment, ctx, a, b, phase, tension, sag, lane, salt) {
        var dx = b.x - a.x, dy = b.y - a.y;
        var distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        var nx = -dy / distance, ny = dx / distance;
        var wave = Math.sin(phase * 0.32 + salt * 1.73) * distance * Math.min(0.18, tension * 0.024);
        var gravity = Math.max(-distance * 0.8, Math.min(distance * 0.8, distance * sag * 0.12));
        var controlX = (a.x + b.x) * 0.5 + nx * (lane + wave);
        var controlY = (a.y + b.y) * 0.5 + ny * (lane + wave) + gravity;
        ctx.beginPath();
        ctx.moveTo(a.x + nx * lane, a.y + ny * lane);
        ctx.quadraticCurveTo(controlX, controlY, b.x + nx * lane, b.y + ny * lane);
        ctx.stroke();
      }
  root.TypeDeformerSharedSurface=Object.freeze({renderPlotterTrace:renderPlotterTrace,renderWebbing:renderWebbing,renderSoftBlobSporeField:renderSoftBlobSporeField,renderSoftBlob:renderSoftBlob,strokeWebCatenary:strokeWebCatenary});
})(typeof globalThis!=='undefined'?globalThis:this);
