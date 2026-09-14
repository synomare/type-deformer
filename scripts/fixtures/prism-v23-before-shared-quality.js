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
        var facets = Math.max(1, Math.min(32, Math.round(surfaceAggregate(glyphs, 'prismSacrament', 'prismFacets', params.prismFacets).value)));
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
