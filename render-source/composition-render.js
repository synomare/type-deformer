// Canonical composition-render declarations. Bundled for both editor and Worker.
// Environment dependencies are declared in manifest.json.

      function compositionAxisIsVertical() {
        return compositionState.axis === 'vertical' || (compositionState.axis === 'inherit' && params.vertical);
      }

      function compositionSourceTokens(sourceGlyphs) {
        var tokens = [];
        var glyphIndex = 0;
        var lines = renderedSourceText.replace(/\r\n?/g, '\n').split('\n');
        for (var li = 0; li < lines.length; li++) {
          var line = tokenizeLine(lines[li]);
          for (var ti = 0; ti < line.length; ti++) {
            if (line[ti].space) {
              if (!tokens.length || !tokens[tokens.length - 1].space) tokens.push({ space: true, units: 0.55 });
            } else if (glyphIndex < sourceGlyphs.length) {
              tokens.push({ space: false, units: 1, sourceIndex: glyphIndex, glyph: sourceGlyphs[glyphIndex] });
              glyphIndex++;
            }
          }
          if (li < lines.length - 1 && tokens.length && !tokens[tokens.length - 1].space) tokens.push({ space: true, units: 0.8 });
        }
        if (!tokens.length) {
          for (var gi = 0; gi < sourceGlyphs.length; gi++) tokens.push({ space: false, units: 1, sourceIndex: gi, glyph: sourceGlyphs[gi] });
        }
        while (tokens.length && tokens[0].space) tokens.shift();
        while (tokens.length && tokens[tokens.length - 1].space) tokens.pop();
        return tokens;
      }

      function createLoopClock(phase, frameCount, seed, direction) {
        var turn = ((Number(phase) || 0) % 1 + 1) % 1;
        var count = Math.max(1, Math.round(frameCount || 240));
        return {
          turn: turn,
          angle: Math.PI * 2 * turn,
          frame: Math.round(turn * count) % count,
          frameCount: count,
          seed: Math.max(0, Math.round(Number(seed) || 0)),
          direction: direction === -1 ? -1 : 1
        };
      }

      function compositionLoopNoise(clock, x, y, salt) {
        var a = clock.angle;
        return hash(
          Math.round((Math.cos(a) + 1) * 4096 + x * 131),
          Math.round((Math.sin(a) + 1) * 4096 + y * 137),
          (clock.seed + (salt || 0)) | 0
        ) * 2 - 1;
      }

      function compileCompositionSource(sourceGlyphs, width, height, state) {
        var tokens = compositionSourceTokens(sourceGlyphs);
        var clock = createLoopClock(state.phase, 240, state.seed, state.direction);
        return {
          sourceGlyphs: sourceGlyphs,
          tokens: tokens,
          viewport: { width: width, height: height },
          clock: clock,
          inputs: createCompositionInputBus(tokens, width, height, clock),
          state: state
        };
      }

      function compositionMacro(name, fallback) {
        var value = compositionState.macros && Number(compositionState.macros[name]);
        return isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
      }

      function compositionPalette() {
        return [params.ink, params.paper, params.accent, compositionState.color2, compositionState.color3];
      }

      function compositionGlyph(token, cx, cy, scaleX, scaleY, rotation, fill, opacity, instanceIndex) {
        if (!token || token.space || !token.glyph) return null;
        var source = token.glyph;
        var w = Math.max(1, source.w || params.fontSize);
        var h = Math.max(1, source.h || params.fontSize * params.lineHeight);
        var point = orientedCompositionPoint(cx, cy, compositionScene.width, compositionScene.height);
        var x = point.x - w / 2;
        var y = point.y - h / 2;
        return {
          ch: source.ch,
          direction: source.direction || 'ltr',
          fontFamily: source.fontFamily, fontWeight: source.fontWeight, fontAxes: source.fontAxes,
          textObject: source.textObject,
          sourceText: source.sourceText || source.ch,
          batchKey: source.batchKey,
          sourceIndex: token.sourceIndex,
          instanceIndex: instanceIndex,
          // Relational word-form Operators must keep the source text
          // structure in generated scenes. Without these fields, every
          // adjacent Compose instance looked like one accidental mega-word.
          line: source.line,
          word: source.word,
          composition: true,
          upright: source.upright,
          accent: source.accent,
          opacity: Math.max(0, Math.min(1, opacity == null ? 1 : opacity)),
          fill: source.textObject && source.fill ? source.fill : fill || (source.accent ? params.accent : params.ink),
          x: x, y: y, w: w, h: h, bx: x, by: y, bw: w, bh: h, grid: false,
          ox: x + w / 2, oy: y + h * 0.75,
          tx: source.tx || 0, ty: source.ty || 0,
          rot: (source.rot || 0) + rotation + point.rotation,
          skewX: source.skewX || 0, skewY: source.skewY || 0,
          scaleX: (source.scaleX || 1) * Math.max(0.02, scaleX),
          scaleY: (source.scaleY || 1) * Math.max(0.02, scaleY),
          misregX: source.misregX || 0, misregY: source.misregY || 0,
          moshPassAX: source.moshPassAX || 0, moshPassAY: source.moshPassAY || 0,
          moshPassBX: source.moshPassBX || 0, moshPassBY: source.moshPassBY || 0,
          moshClipTop: source.moshClipTop || 0, moshClipBottom: source.moshClipBottom || 0,
          surface: source.surface ? Object.assign({}, source.surface) : null
        };
      }

      function compositionSignalSource(slot, glyph, glyphIndex, glyphCount, compiled, width, height, frequencies, maxFrequency) {
        var sourceCount = Math.max(1, compiled.sourceGlyphs.length);
        var sourceIndex = Math.max(0, Number(glyph.sourceIndex) || 0);
        var character = glyph.ch || '';
        var codePoint = character ? character.codePointAt(0) : 0;
        var nx = Math.max(0, Math.min(1, glyph.ox / Math.max(1, width)));
        var ny = Math.max(0, Math.min(1, glyph.oy / Math.max(1, height)));
        if (slot.source === 'instanceOrder') return glyphCount > 1 ? glyphIndex / (glyphCount - 1) : 0.5;
        if (slot.source === 'unicode') return hash(codePoint, sourceIndex, compositionState.seed);
        if (slot.source === 'frequency') return (frequencies[character] || 0) / Math.max(1, maxFrequency);
        if (slot.source === 'script') {
          var scriptValues = { hiragana: 0.08, katakana: 0.24, kanji: 0.43, latin: 0.63, digit: 0.79, punct: 0.94, other: 0.54 };
          return Object.prototype.hasOwnProperty.call(scriptValues, glyph.batchKey) ? scriptValues[glyph.batchKey] : scriptValues.other;
        }
        if (slot.source === 'ink') return Math.max(0, Math.min(1, (glyph.bw || glyph.w || params.fontSize) / Math.max(1, params.fontSize * 1.15)));
        if (slot.source === 'x') return nx;
        if (slot.source === 'y') return ny;
        if (slot.source === 'radius') {
          var dx = nx - 0.5, dy = ny - 0.5;
          return Math.max(0, Math.min(1, Math.sqrt(dx * dx + dy * dy) / Math.sqrt(0.5)));
        }
        if (slot.source === 'pointer') {
          var pointerInput = compiled.inputs && compiled.inputs.pointer ? compiled.inputs.pointer : { x: 0.5, y: 0.5 };
          var pointerDx = nx - pointerInput.x, pointerDy = ny - pointerInput.y;
          return Math.max(0, Math.min(1, Math.sqrt(pointerDx * pointerDx + pointerDy * pointerDy) / Math.sqrt(2)));
        }
        return sourceCount > 1 ? sourceIndex / (sourceCount - 1) : 0.5;
      }

      function compositionSignalShape(slot, base, slotIndex, glyphIndex, clock) {
        var turn = ((base * slot.frequency + slot.phase + clock.turn * slot.motion * clock.direction) % 1 + 1) % 1;
        var shaped;
        if (slot.shape === 'sine') shaped = 0.5 - Math.cos(turn * Math.PI * 2) * 0.5;
        else if (slot.shape === 'triangle') shaped = 1 - Math.abs(turn * 2 - 1);
        else if (slot.shape === 'steps') shaped = Math.round(turn * (slot.steps - 1)) / Math.max(1, slot.steps - 1);
        else if (slot.shape === 'pulse') shaped = Math.floor(turn * slot.steps) % 2 ? 0 : 1;
        else if (slot.shape === 'noise') {
          var noiseAngle = clock.angle * slot.motion * clock.direction + slot.phase * Math.PI * 2;
          shaped = hash(
            Math.round((Math.cos(noiseAngle) + 1) * 4096 + base * slot.frequency * 977),
            Math.round((Math.sin(noiseAngle) + 1) * 4096 + glyphIndex * 131),
            clock.seed + slotIndex * 919
          );
        } else shaped = turn;
        if (slot.range === 'bipolar') return shaped * 2 - 1;
        if (slot.range === 'inverse') return 1 - shaped;
        return shaped;
      }

      function applyCompositionSignalRouter(scene, compiled, width, height) {
        var slots = compositionState.signalRouter || [];
        var active = slots.some(function (slot) { return slot && slot.enabled && Math.abs(slot.amount) > 0.0001; });
        if (!active || !scene.glyphs || !scene.glyphs.length) return scene;
        var frequencies = {}, maxFrequency = 1;
        for (var tokenIndex = 0; tokenIndex < compiled.tokens.length; tokenIndex++) {
          var token = compiled.tokens[tokenIndex];
          if (!token || token.space || !token.glyph) continue;
          var character = token.glyph.ch || '';
          frequencies[character] = (frequencies[character] || 0) + 1;
          maxFrequency = Math.max(maxFrequency, frequencies[character]);
        }
        var clock = compiled.clock || createLoopClock(compositionState.phase, 240, compositionState.seed, compositionState.direction);
        for (var slotIndex = 0; slotIndex < slots.length; slotIndex++) {
          var slot = slots[slotIndex];
          if (!slot || !slot.enabled || Math.abs(slot.amount) <= 0.0001) continue;
          for (var glyphIndex = 0; glyphIndex < scene.glyphs.length; glyphIndex++) {
            var glyph = scene.glyphs[glyphIndex];
            var base = compositionSignalSource(slot, glyph, glyphIndex, scene.glyphs.length, compiled, width, height, frequencies, maxFrequency);
            var signalValue = compositionSignalShape(slot, base, slotIndex, glyphIndex, clock);
            if (slot.target === 'x' || slot.target === 'y') {
              var shift = signalValue * slot.amount * (slot.target === 'x' ? width : height) * 0.25;
              if (slot.target === 'x') { glyph.x += shift; glyph.bx += shift; glyph.ox += shift; }
              else { glyph.y += shift; glyph.by += shift; glyph.oy += shift; }
            } else if (slot.target === 'rotation') glyph.rot += signalValue * slot.amount * 180;
            else if (slot.target === 'skewX') glyph.skewX += signalValue * slot.amount * 45;
            else if (slot.target === 'skewY') glyph.skewY += signalValue * slot.amount * 45;
            else if (slot.target === 'scale' || slot.target === 'scaleX' || slot.target === 'scaleY') {
              var scaleFactor = Math.max(1 / 32, Math.min(32, Math.pow(2, signalValue * slot.amount)));
              if (slot.target !== 'scaleY') glyph.scaleX *= scaleFactor;
              if (slot.target !== 'scaleX') glyph.scaleY *= scaleFactor;
            } else if (slot.target === 'opacity' || slot.target === 'color') {
              var gate = slot.range === 'bipolar' ? (signalValue + 1) * 0.5 : signalValue;
              gate = Math.max(0, Math.min(1, gate));
              var depth = Math.min(1, Math.abs(slot.amount) / 4);
              var selected = slot.amount >= 0 ? gate : 1 - gate;
              if (slot.target === 'opacity') glyph.opacity *= 1 - depth + depth * selected;
              else glyph.fill = lerpHex(glyph.fill || (glyph.accent ? params.accent : params.ink), slot.color, depth * selected);
            }
          }
        }
        scene.signalRouter = slots.map(function (slot) {
          return { enabled: !!slot.enabled, source: slot.source, shape: slot.shape, target: slot.target };
        });
        return scene;
      }

      function compositionEffectiveQuality() {
        if (compositionQualityOverride) return compositionQualityOverride;
        if (compositionState.quality !== 'auto') return compositionState.quality;
        // Auto keeps the authored scene stable. Display cost belongs to the
        // device preview preference, never to instance generation.
        return 'normal';
      }

      function compositionLimit() {
        var mobile = matchesRenderMedia('(max-width: 760px)');
        var base = mobile ? 2000 : 5000;
        var quality = compositionEffectiveQuality();
        if (quality === 'performance') return Math.round(base * 0.55);
        if (quality === 'high') return Math.round(base * 1.6);
        return base;
      }

      function generateFieldScene(tokens, width, height, runtime) {
        var field = compositionState.field;
        var cols = field.cols, rows = field.rows;
        var pad = Math.min(28, Math.max(8, Math.min(width, height) * 0.025));
        var cellW = Math.max(1, (width - pad * 2) / cols);
        var cellH = Math.max(1, (height - pad * 2) / rows);
        var baseScale = Math.max(0.04, Math.min(cellW / Math.max(1, params.fontSize * 0.75), cellH / Math.max(1, params.fontSize * params.lineHeight)) * 0.92);
        var clock = runtime && runtime.clock ? runtime.clock : createLoopClock(compositionState.phase, 240, compositionState.seed, compositionState.direction);
        var inputs = runtime && runtime.inputs ? runtime.inputs : createCompositionInputBus(tokens, width, height, clock);
        var phase = clock.angle;
        var limit = compositionLimit();
        var glyphs = [], bands = [], instanceIndex = 0;
        var intensity = compositionMacro('intensity', 0.65);
        var instability = compositionMacro('instability', 0.35);
        var depthMacro = compositionMacro('depth', 0.45);
        var networkPoints = [];
        for (var row = 0; row < rows; row++) {
          networkPoints[row] = [];
          for (var col = 0; col < cols; col++) {
            if (instanceIndex >= limit) return { glyphs: glyphs, bands: bands, limited: true };
            var token = tokens[(row * cols + col) % tokens.length];
            var nx = (col + 0.5) / cols, ny = (row + 0.5) / rows;
            var cx = pad + nx * (width - pad * 2);
            var cy = pad + ny * (height - pad * 2);
            if (field.topology === 'polar' || field.topology === 'spiral') {
              var theta = nx * Math.PI * 2 + phase * field.echoOrbit * 0.2;
              var radius = Math.min(width, height) * (0.06 + ny * 0.46);
              if (field.topology === 'spiral') radius *= 0.38 + nx * 0.82;
              cx = width * 0.5 + Math.cos(theta) * radius;
              cy = height * 0.5 + Math.sin(theta) * radius;
            }
            var cp = cascadeTokenCode(token);
            var variationSignal = 0;
            if (field.variationMode === 'unicode') variationSignal = hash(cp || col, row, compositionState.seed) * 2 - 1;
            else if (field.variationMode === 'script') {
              var variationChar = token && token.glyph ? token.glyph.ch : '';
              variationSignal = hash(String(batchKeyFor(variationChar, cp, charInfo(variationChar, cp))).length, row, col) * 2 - 1;
            } else if (field.variationMode === 'ink') {
              variationSignal = token && token.glyph ? Math.max(-1, Math.min(1, ((token.glyph.w || params.fontSize) / Math.max(1, params.fontSize) - 0.7) * 2)) : 0;
            }
            var tokenVariation = variationSignal * field.variation;
            var warpedX = nx + Math.sin(ny * Math.PI * 2 + phase) * field.domainWarp * 0.08;
            var warpedY = ny + Math.cos(nx * Math.PI * 2 - phase) * field.domainWarp * 0.08;
            var waveA = Math.sin(phase + col / field.waveX + row / field.waveY + tokenVariation);
            var waveB = Math.cos(phase + col / field.waveX - row / field.waveY - tokenVariation);
            if (field.fieldType === 'curl' || field.fieldType === 'vortex') {
              var dxCenter = warpedX - 0.5, dyCenter = warpedY - 0.5;
              var angle = Math.atan2(dyCenter, dxCenter) + phase;
              waveA = Math.cos(angle + (field.fieldType === 'curl' ? Math.hypot(dxCenter, dyCenter) * 16 : 0));
              waveB = Math.sin(angle + (field.fieldType === 'curl' ? Math.hypot(dxCenter, dyCenter) * 16 : 0));
            } else if (field.fieldType === 'attractor') {
              waveA = (0.5 - warpedX) * 2;
              waveB = (0.5 - warpedY) * 2;
            } else if (field.fieldType === 'textDistance') {
              var textSignal = ((cp % 97) / 96) * Math.PI * 2;
              waveA = Math.sin(textSignal + phase);
              waveB = Math.cos(textSignal - phase);
            }
            for (var sourceIndex = 1; sourceIndex < field.sources; sourceIndex++) {
              var sourceAngle = phase + sourceIndex / field.sources * Math.PI * 2;
              waveA += Math.sin((warpedX - 0.5 - Math.cos(sourceAngle) * 0.25) * (6 + sourceIndex) + phase) / field.sources;
              waveB += Math.cos((warpedY - 0.5 - Math.sin(sourceAngle) * 0.25) * (6 + sourceIndex) - phase) / field.sources;
            }
            if (inputs.pointer.active && field.pointerMode !== 'none') {
              var pdx = cx - inputs.pointer.px, pdy = cy - inputs.pointer.py;
              var pd = Math.max(12, Math.sqrt(pdx * pdx + pdy * pdy));
              var pointerGain = Math.max(0, 1 - pd / (Math.min(width, height) * 0.45)) * inputs.pointer.pressure;
              if (field.pointerMode === 'vortex') {
                waveA += -pdy / pd * pointerGain * 2 * field.pointerForce;
                waveB += pdx / pd * pointerGain * 2 * field.pointerForce;
              } else {
                var sign = field.pointerMode === 'attract' ? -1 : 1;
                waveA += pdx / pd * pointerGain * sign * 2 * field.pointerForce;
                waveB += pdy / pd * pointerGain * sign * 2 * field.pointerForce;
              }
            }
            waveA += compositionLoopNoise(clock, col, row, 31) * instability * 0.3;
            waveB += compositionLoopNoise(clock, row, col, 47) * instability * 0.3;
            var depth = Math.max(0.05, 1 + waveA * field.depth * (0.4 + depthMacro));
            var sx = baseScale * depth * Math.max(0.05, 1 + waveB * field.scaleX);
            var sy = baseScale * depth * Math.max(0.05, 1 + waveA * field.scaleY);
            cx += waveA * field.ampX * cellW * intensity;
            cy += waveB * field.ampY * cellH * intensity;
            var perspective = 1 - field.perspective * Math.max(0, ny - 0.5) * (0.25 + field.depthFalloff * 0.75);
            sx *= perspective; sy *= perspective;
            var rotation = waveA * field.rotation;
            if (field.orientation === 'tangent') rotation += Math.atan2(waveB, waveA) * 180 / Math.PI;
            else if (field.orientation === 'normal') rotation += Math.atan2(waveB, waveA) * 180 / Math.PI + 90;
            else if (field.orientation === 'lookAtCenter') rotation += Math.atan2(height * 0.5 - cy, width * 0.5 - cx) * 180 / Math.PI;
            var fill = null;
            if (field.colorMode === 'depth') fill = lerpHex(compositionState.color2, compositionState.color3, Math.max(0, Math.min(1, (depth - 0.5) / 1.2)));
            else if (field.colorMode === 'unicode') fill = compositionPalette()[Math.abs(cp) % compositionPalette().length];
            else if (field.colorMode === 'field') fill = lerpHex(params.ink, params.accent, (waveA + 1) * 0.5);
            var glyph = compositionGlyph(token, cx, cy, sx, sy, rotation, fill, 0.72 + depth * 0.24, instanceIndex++);
            if (glyph) glyphs.push(glyph);
            if (glyph && field.echoOrbit > 0) {
              for (var orbit = 1; orbit <= field.echoOrbit && instanceIndex < limit; orbit++) {
                var orbitAngle = phase + orbit / field.echoOrbit * Math.PI * 2;
                var orbitRadius = Math.min(cellW, cellH) * orbit * 0.22;
                var orbitGlyph = compositionGlyph(
                  token,
                  cx + Math.cos(orbitAngle) * orbitRadius,
                  cy + Math.sin(orbitAngle) * orbitRadius,
                  sx * (1 - orbit / (field.echoOrbit + 1) * 0.25),
                  sy * (1 - orbit / (field.echoOrbit + 1) * 0.25),
                  rotation + orbit * 6,
                  fill,
                  (0.45 / orbit) * compositionMacro('depth', 0.45),
                  instanceIndex++
                );
                if (orbitGlyph) glyphs.push(orbitGlyph);
              }
            }
            networkPoints[row][col] = { x: cx, y: cy };
            if (field.network > 0 && col > 0 && ((row + col) % Math.max(1, Math.round(4 - field.network * 3)) === 0)) {
              bands.push({
                kind: 'path', points: [networkPoints[row][col - 1], networkPoints[row][col]],
                stroke: fill || params.ink, strokeWidth: 0.5 + field.network * 1.5,
                opacity: field.network * (0.12 + (1 - compositionMacro('legibility', 0.85)) * 0.5)
              });
            }
          }
        }
        return { glyphs: glyphs, bands: bands, limited: false };
      }

      function generateFluxScene(tokens, width, height, runtime) {
        var flux = compositionState.fluxRows;
        var palette = compositionPalette();
        var units = tokens.reduce(function (sum, token) { return sum + token.units; }, 0) || 1;
        var rowH = height / flux.rows;
        var limit = compositionLimit();
        var glyphs = [], bands = [], instanceIndex = 0;
        var clock = runtime && runtime.clock ? runtime.clock : createLoopClock(compositionState.phase, 240, compositionState.seed, compositionState.direction);
        var inputs = runtime && runtime.inputs ? runtime.inputs : createCompositionInputBus(tokens, width, height, clock);
        var densityMacro = compositionMacro('density', 0.6);
        var instability = compositionMacro('instability', 0.35);
        var midpoint = (flux.rows - 1) / 2;
        for (var row = 0; row < flux.rows; row++) {
          var edge = flux.mirror && midpoint > 0 ? Math.abs(row - midpoint) / midpoint : 1 - row / Math.max(1, flux.rows - 1);
          var density = Math.pow(Math.max(0, 1 - edge), flux.curve);
          var repeats = 1 + Math.round(density * Math.max(1, Math.floor(flux.rows / 2)) * (0.45 + densityMacro * 0.55 + flux.density * 0.5));
          var unitW = width / Math.max(1, units * repeats);
          var phraseW = units * unitW + Math.max(0, tokens.length - 1) * unitW * flux.tracking;
          var rowDirection = flux.flip && row % 2 ? -1 : 1;
          if (flux.mirror && row > midpoint) rowDirection *= -1;
          if (flux.laneSpeed === 'alternate' && row % 2) rowDirection *= -1;
          if (flux.laneSpeed === 'mirror' && row > midpoint) rowDirection *= -1;
          if (flux.counterflow > 0 && row % 2) rowDirection *= -1;
          var requestedCycles = Math.max(0, flux.scroll + (flux.laneSpeed === 'unicode' ? cascadeTokenCode(tokens[row % tokens.length]) % 3 : 0));
          var laneCycles = (flux.integerTravel || compositionState.loopLock) ? Math.max(0, Math.round(requestedCycles)) : requestedCycles;
          var offset = ((clock.turn * phraseW * laneCycles * rowDirection) % phraseW + phraseW) % phraseW;
          var rowPhase = clock.angle + row * flux.phaseOffset * Math.PI * 2;
          var fluxWave = 1 - flux.amount * 0.5 + Math.sin(rowPhase) * flux.amount * 0.5;
          fluxWave *= 1 + Math.sin(rowPhase * 2) * flux.accordion * 0.35;
          var perspectiveScale = 1 - flux.perspective * Math.abs(row - midpoint) / Math.max(1, midpoint) * 0.55;
          var scaleX = unitW / Math.max(1, params.fontSize * 0.72) * perspectiveScale;
          var scaleY = Math.max(0.04, rowH * (1 - flux.lineGap) / Math.max(1, params.fontSize * params.lineHeight) * fluxWave);
          var baseY = (row + 0.5) * rowH;
          var cursor = -offset - phraseW;
          for (var copy = 0; copy < repeats + 3; copy++) {
            for (var ti = 0; ti < tokens.length; ti++) {
              var token = tokens[ti];
              var tokenW = token.units * unitW;
              var progress = (cursor + tokenW * 0.5) / Math.max(1, width);
              var baselineSignal = 0;
              if (flux.baseline === 'wave') baselineSignal = Math.sin(progress * Math.PI * 2 + rowPhase);
              else if (flux.baseline === 'braid') baselineSignal = Math.sin(progress * Math.PI * 4 + rowPhase + (row % 2) * Math.PI);
              else if (flux.baseline === 'fold') baselineSignal = Math.asin(Math.sin(progress * Math.PI * 2 + rowPhase)) * 2 / Math.PI;
              baselineSignal += compositionLoopNoise(clock, row, ti, copy) * instability * 0.14;
              var y = baseY + baselineSignal * rowH * flux.amplitude;
              if (flux.weave > 0) y += Math.sin(progress * Math.PI * 2 + row * Math.PI) * rowH * flux.weave * 0.35;
              if (inputs.pointer.active && flux.pointerBranch > 0) {
                var pointerDistance = Math.abs(cursor + tokenW * 0.5 - inputs.pointer.px);
                y += (y < inputs.pointer.py ? -1 : 1) * Math.max(0, 1 - pointerDistance / Math.max(1, width * 0.25)) * rowH * flux.pointerBranch;
              }
              if (!token.space && cursor + tokenW >= -unitW && cursor <= width + unitW) {
                if (instanceIndex >= limit) return { glyphs: glyphs, bands: bands, limited: true };
                var color = token.glyph && token.glyph.accent ? params.accent : params.ink;
                if (flux.colorMode === 'lane') color = palette[row % palette.length];
                else if (flux.colorMode === 'phrase') color = palette[copy % palette.length];
                else if (flux.colorMode === 'glyph') color = palette[Math.abs(cascadeTokenCode(token)) % palette.length];
                var localScaleX = scaleX * (1 - flux.compression * Math.max(0, Math.sin(progress * Math.PI * 2 + rowPhase)) * 0.7);
                var slitOpacity = flux.slit > 0 && Math.abs(progress - 0.5) < flux.slit * 0.14 ? 0.08 : 1;
                var tangentRotation = flux.tangent * Math.atan2(baselineSignal * flux.amplitude, 1) * 180 / Math.PI;
                var glyph = compositionGlyph(token, cursor + tokenW / 2, y, localScaleX, scaleY, tangentRotation, color, slitOpacity, instanceIndex++);
                if (glyph) glyphs.push(glyph);
                if (flux.trail > 0) {
                  var trailLength = unitW * (0.5 + flux.trail * 3);
                  bands.push({
                    kind: 'path',
                    points: [{ x: cursor + tokenW / 2 - trailLength * rowDirection, y: y }, { x: cursor + tokenW / 2, y: y }],
                    stroke: color, strokeWidth: Math.max(0.5, rowH * 0.025),
                    opacity: flux.trail * 0.3
                  });
                }
              }
              cursor += tokenW + unitW * flux.tracking;
            }
          }
          if (flux.scanEcho > 0) {
            for (var scan = 0; scan < flux.scanEcho; scan++) {
              var scanX = ((clock.turn * (row % 3 + 1) + row / flux.rows + scan / flux.scanEcho) % 1) * width;
              bands.push({
                kind: 'path', points: [{ x: scanX, y: row * rowH }, { x: scanX, y: (row + 1) * rowH }],
                stroke: palette[(row + scan + 2) % palette.length], strokeWidth: 0.5 + scan / Math.max(1, flux.scanEcho) * 2,
                opacity: 0.12 + scan / Math.max(1, flux.scanEcho) * 0.18, blend: 'difference'
              });
            }
          }
        }
        return { glyphs: glyphs, bands: bands, limited: false };
      }

      function cascadePalette() {
        var c = compositionState.cascade;
        return [c.fieldA, c.fieldB, c.fieldC, c.edge];
      }

      function cascadeTokenCode(token) {
        var ch = token && token.glyph && token.glyph.ch ? token.glyph.ch : '';
        return ch ? ch.codePointAt(0) : 0;
      }

      function cascadeColorFor(row, col, state, token, totalRows, totalCols) {
        var c = compositionState.cascade;
        var palette = cascadePalette();
        if (c.colorMode === 'ink') return c.fieldA;
        if (c.colorMode === 'row') return palette[row % 3];
        if (c.colorMode === 'column') return palette[col % 3];
        if (c.colorMode === 'unicode') return palette[cascadeTokenCode(token) % 3];
        if (c.colorMode === 'gradient') {
          var t = (row / Math.max(1, totalRows - 1) + col / Math.max(1, totalCols - 1)) * 0.5;
          return t < 0.5 ? lerpHex(c.fieldA, c.fieldB, t * 2) : lerpHex(c.fieldB, c.fieldC, (t - 0.5) * 2);
        }
        return state ? palette[1 + ((row + col + state) % 3)] : palette[0];
      }

      function cascadeGlyphColor(fill, state) {
        var c = compositionState.cascade;
        if (c.glyphMode === 'fixed') return c.glyph;
        if (c.glyphMode === 'state') return state ? c.glyph : c.edge;
        var r = parseInt(fill.slice(1, 3), 16);
        var g = parseInt(fill.slice(3, 5), 16);
        var b = parseInt(fill.slice(5, 7), 16);
        var luminance = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
        return luminance > 0.57 ? c.fieldA : c.glyph;
      }

      function cascadeShapeItem(x, y, w, h, fill, opacity, rotation, state) {
        var c = compositionState.cascade;
        return {
          kind: 'shape', shape: c.shape, x: x, y: y, w: Math.max(0.1, w), h: Math.max(0.1, h),
          fill: fill, opacity: opacity == null ? c.opacity : opacity,
          stroke: c.stroke > 0 ? c.edge : null, strokeWidth: c.stroke,
          radius: c.round, rotation: rotation || 0, blend: c.blend,
          state: state || 0
        };
      }

      function cascadeBackdrop(width, height, bands) {
        var c = compositionState.cascade;
        if (c.backdropEnabled && c.backdropOpacity > 0) {
          bands.push({
            kind: 'shape', shape: 'rect', x: 0, y: 0, w: width, h: height,
            fill: c.backdrop, opacity: c.backdropOpacity, blend: 'source-over', backdrop: true
          });
        }
      }

      function cascadePostProcess(width, height, bands) {
        var c = compositionState.cascade;
        if (c.scanline <= 0) return;
        var spacing = Math.max(3, Math.round(11 - c.scanline * 7));
        var lineH = Math.max(0.5, c.scanline * 1.6);
        for (var y = 0; y < height; y += spacing) {
          bands.push({
            kind: 'shape', shape: 'rect', x: 0, y: y, w: width, h: lineH,
            fill: c.edge, opacity: 0.025 + c.scanline * 0.13,
            blend: c.blend, post: true
          });
        }
      }

      function cascadeSeed(tokens, cells) {
        var c = compositionState.cascade;
        var visible = tokens.filter(function (token) { return !token.space && token.glyph; });
        if (!visible.length) visible = tokens;
        var seed = [];
        for (var col = 0; col < cells; col++) {
          var token = visible[col % visible.length];
          var cp = cascadeTokenCode(token);
          if (c.seed === 'alternating') seed[col] = col % 2;
          else if (c.seed === 'sparse') seed[col] = hash(col, cp || col, 19) > 0.82 ? 1 : 0;
          else if (c.seed === 'glyphMask') {
            var glyphWidth = token && token.glyph ? token.glyph.w || params.fontSize : params.fontSize;
            seed[col] = hash(Math.round(glyphWidth), cp || col, col + compositionState.seed) > 0.48 ? 1 : 0;
          }
          else if (c.seed === 'class') {
            var ch = token && token.glyph ? token.glyph.ch : '';
            var info = charInfo(ch, cp);
            var key = batchKeyFor(ch, cp, info);
            seed[col] = key === 'kanji' || key === 'digit' || key === 'punct' ? 1 : 0;
          } else seed[col] = (cp >> (col % 16)) & 1;
        }
        if (seed.indexOf(1) === -1) seed[Math.floor(cells / 2)] = 1;
        return seed;
      }

      function cascadeAutomatonStep(cells, rule) {
        var next = new Array(cells.length);
        for (var i = 0; i < cells.length; i++) {
          var left = cells[(i - 1 + cells.length) % cells.length] ? 1 : 0;
          var center = cells[i] ? 1 : 0;
          var right = cells[(i + 1) % cells.length] ? 1 : 0;
          var pattern = (left << 2) | (center << 1) | right;
          next[i] = (rule >> pattern) & 1;
        }
        return next;
      }

      function cascadeLifeStep(board, rows, cols, ruleName) {
        var parts = String(ruleName || 'B3/S23').split('/');
        var births = (parts[0] || 'B3').replace('B', '');
        var survives = (parts[1] || 'S23').replace('S', '');
        var next = new Array(board.length);
        for (var row = 0; row < rows; row++) {
          for (var col = 0; col < cols; col++) {
            var neighbors = 0;
            for (var oy = -1; oy <= 1; oy++) {
              for (var ox = -1; ox <= 1; ox++) {
                if (!ox && !oy) continue;
                var ni = ((row + oy + rows) % rows) * cols + ((col + ox + cols) % cols);
                neighbors += board[ni] ? 1 : 0;
              }
            }
            var alive = board[row * cols + col] ? 1 : 0;
            next[row * cols + col] = alive
              ? (survives.indexOf(String(neighbors)) !== -1 ? 1 : 0)
              : (births.indexOf(String(neighbors)) !== -1 ? 1 : 0);
          }
        }
        return next;
      }

      function cascadeGridColumns(requested, rows, layers) {
        var mobile = matchesRenderMedia('(max-width: 760px)');
        var backgroundLimit = mobile ? 2400 : 8000;
        return Math.max(8, Math.min(requested, Math.floor(backgroundLimit / Math.max(1, rows * (layers || 1)))));
      }

      function cascadeOpticalField(nx, ny, phase, c) {
        if (c.sdfMode === 'singularity') {
          var singularX = 0.5 + Math.cos(phase) * 0.22;
          var singularY = 0.5 + Math.sin(phase * 2) * 0.22;
          var sdx = nx - singularX, sdy = ny - singularY;
          var sr = Math.sqrt(sdx * sdx + sdy * sdy);
          var sa = Math.atan2(sdy, sdx);
          return Math.sin(sr * c.frequency * 34 - phase * 3 + Math.sin(sa * 6 + phase) * c.warp * 2.5);
        }
        if (c.sdfMode === 'tunnel') {
          var tdx = nx - 0.5, tdy = ny - 0.5;
          var tr = Math.sqrt(tdx * tdx + tdy * tdy);
          var ta = Math.atan2(tdy, tdx);
          return Math.sin(Math.log(tr + 0.035) * c.frequency * 3.4 - phase * 3 + ta * c.warp * 3.2);
        }
        if (c.sdfMode === 'metaball') {
          var centers = [
            [0.5 + Math.cos(phase) * 0.25, 0.5 + Math.sin(phase * 2) * 0.22],
            [0.5 + Math.cos(phase * 2 + 2.1) * 0.31, 0.5 + Math.sin(phase * 3 + 1.4) * 0.27],
            [0.5 + Math.cos(phase * 3 + 4.2) * 0.19, 0.5 + Math.sin(phase + 3.5) * 0.34]
          ];
          var energy = 0;
          for (var ci = 0; ci < centers.length; ci++) {
            var mdx = nx - centers[ci][0], mdy = ny - centers[ci][1];
            energy += 0.018 / Math.max(0.002, mdx * mdx + mdy * mdy);
          }
          return Math.sin(energy * c.frequency * 0.42 + phase * 2);
        }
        var warpX = Math.sin(ny * c.frequency * Math.PI * 2 + phase) * c.warp;
        var warpY = Math.cos(nx * c.frequency * Math.PI * 2 - phase) * c.warp;
        var interference = (
          Math.sin((nx * c.frequency + warpX) * Math.PI * 2 + phase)
          + Math.cos((ny * c.frequency * 0.73 + warpY) * Math.PI * 2 - phase)
        ) * 0.5;
        for (var source = 1; source < c.signalSources; source++) {
          var sourcePhase = phase * (1 + Math.round(c.signalSync * 2)) + source / c.signalSources * Math.PI * 2;
          interference += Math.sin(
            (nx * (c.frequency + source) + ny * source * 0.35) * Math.PI * 2 + sourcePhase
          ) / (2 + source);
        }
        return Math.max(-1.4, Math.min(1.4, interference));
      }

      function generateContourAtlasScene(tokens, width, height, runtime) {
        var contour = compositionState.contourAtlas;
        var clock = runtime && runtime.clock ? runtime.clock : createLoopClock(compositionState.phase, 240, compositionState.seed, compositionState.direction);
        var inputs = runtime && runtime.inputs ? runtime.inputs : createCompositionInputBus(tokens, width, height, clock);
        var effectiveQuality = compositionEffectiveQuality();
        var qualityScale = effectiveQuality === 'performance' ? 0.62 : (effectiveQuality === 'high' ? 1.25 : 1);
        var cols = Math.max(12, Math.min(144, Math.round(contour.resolution * qualityScale)));
        var rows = Math.max(12, Math.round(cols * height / Math.max(1, width)));
        var values = new Float32Array((cols + 1) * (rows + 1));
        for (var gy = 0; gy <= rows; gy++) {
          for (var gx = 0; gx <= cols; gx++) {
            values[gy * (cols + 1) + gx] = contourScalar(gx / cols, gy / rows, tokens, clock, inputs, contour);
          }
        }
        var cellW = width / cols, cellH = height / rows;
        var palette = compositionPalette();
        var glyphs = [], bands = [], segments = [], instanceIndex = 0, limit = compositionLimit();
        // Marching Squares can otherwise allocate levels × rows × columns
        // objects before the shared FX budget has a chance to trim the scene.
        var segmentLimit = Math.max(256, limit);
        var bandLimit = Math.max(128, Math.floor(limit * 0.65));
        var contourCapped = false;
        var needsStoredSegments = contour.glyphs || contour.rendering === 'glyphs' || contour.rendering === 'hybrid';
        var needsBands = contour.rendering !== 'glyphs' || contour.filled;
        var levelCount = Math.max(2, contour.levels);
        contourLevels:
        for (var levelIndex = 0; levelIndex < levelCount; levelIndex++) {
          var thresholdShift = (contour.threshold - 0.5) * 0.9;
          var level = -0.82 + levelIndex / Math.max(1, levelCount - 1) * 1.64 + thresholdShift;
          for (var row = 0; row < rows; row++) {
            for (var col = 0; col < cols; col++) {
              var a = values[row * (cols + 1) + col];
              var b = values[row * (cols + 1) + col + 1];
              var c = values[(row + 1) * (cols + 1) + col + 1];
              var d = values[(row + 1) * (cols + 1) + col];
              var cellSegments = contourSegmentsForCell(col * cellW, row * cellH, cellW, cellH, a, b, c, d, level);
              for (var segmentIndex = 0; segmentIndex < cellSegments.length; segmentIndex++) {
                var segment = cellSegments[segmentIndex];
                if (needsStoredSegments) {
                  if (segments.length < segmentLimit) segments.push(segment);
                  else contourCapped = true;
                }
                if (contour.rendering !== 'glyphs' && bands.length < bandLimit) {
                  bands.push({
                    kind: 'path', points: segment,
                    stroke: contour.colorMode === 'ink' ? params.ink : palette[levelIndex % palette.length],
                    strokeWidth: contour.lineWidth,
                    opacity: 0.2 + contour.density * 0.7,
                    dash: contour.dash > 0 ? [2 + contour.dash * 12, 2 + contour.dash * 8] : null,
                    blend: levelIndex % 3 === 2 ? 'difference' : 'source-over'
                  });
                } else if (contour.rendering !== 'glyphs') contourCapped = true;
              }
              // A filled cell is a cell primitive, not one fill per contour
              // segment (ambiguous marching states may have two segments).
              if ((contour.filled || contour.rendering === 'filled') && a >= level && levelIndex % 2 === 0) {
                if (bands.length < bandLimit) {
                  bands.push({
                    kind: 'shape', shape: 'rect', x: col * cellW, y: row * cellH,
                    w: cellW + 0.5, h: cellH + 0.5,
                    fill: contour.colorMode === 'ink' ? params.ink : palette[levelIndex % palette.length],
                    opacity: contour.fillOpacity * (0.15 + contour.density * 0.35)
                  });
                } else contourCapped = true;
              }
              if ((!needsStoredSegments || segments.length >= segmentLimit) &&
                  (!needsBands || bands.length >= bandLimit)) {
                contourCapped = true;
                break contourLevels;
              }
            }
          }
        }
        if (contour.glyphs || contour.rendering === 'glyphs' || contour.rendering === 'hybrid') {
          var step = Math.max(1, Math.round(4 - contour.density * 3));
          for (var si = 0; si < segments.length && instanceIndex < limit; si += step) {
            var points = segments[si];
            var token = tokens[instanceIndex % tokens.length];
            if (token.space) continue;
            var dx = points[1].x - points[0].x, dy = points[1].y - points[0].y;
            var scale = Math.max(0.025, Math.min(cellW, cellH) * 1.5 / Math.max(1, params.fontSize));
            var glyph = compositionGlyph(
              token,
              (points[0].x + points[1].x) * 0.5,
              (points[0].y + points[1].y) * 0.5,
              scale, scale,
              Math.atan2(dy, dx) * 180 / Math.PI * contour.tangent,
              palette[instanceIndex % palette.length],
              0.45 + compositionMacro('legibility', 0.85) * 0.55,
              instanceIndex++
            );
            if (glyph) glyphs.push(glyph);
          }
        }
        return { glyphs: glyphs, bands: bands, limited: contourCapped || instanceIndex >= limit };
      }

      function generateFeedbackChamberScene(tokens, width, height, runtime) {
        var feedback = compositionState.feedbackChamber;
        var clock = runtime && runtime.clock ? runtime.clock : createLoopClock(compositionState.phase, 240, compositionState.seed, compositionState.direction);
        var inputs = runtime && runtime.inputs ? runtime.inputs : createCompositionInputBus(tokens, width, height, clock);
        var glyphs = [], bands = [], instanceIndex = 0, limit = compositionLimit();
        var visible = tokens.filter(function (token) { return token && !token.space && token.glyph; });
        var phrase = visible.length ? visible : tokens;
        var echoCount = Math.min(feedback.echoes, Math.max(1, Math.floor(limit / Math.max(1, phrase.length))));
        var usePointerCenter = feedback.pointerCenter && inputs.pointer.active;
        var centerX = usePointerCenter ? inputs.pointer.px : width * 0.5;
        var centerY = usePointerCenter ? inputs.pointer.py : height * 0.5;
        var baseAdvance = Math.min(width / Math.max(1, phrase.length), params.fontSize * 1.1);
        var baseWidth = phrase.length * baseAdvance;
        var palette = compositionPalette();
        for (var echo = echoCount - 1; echo >= 0; echo--) {
          var t = echo / Math.max(1, echoCount - 1);
          var echoPhase = clock.angle + t * Math.PI * 2;
          var scale = Math.pow(1 + feedback.zoom, echo);
          var rotation = feedback.rotation * echo + Math.sin(echoPhase) * feedback.warpAmount * 12;
          var driftX = feedback.driftX * width * t + Math.cos(echoPhase) * feedback.warpAmount * width * 0.035;
          var driftY = feedback.driftY * height * t + Math.sin(echoPhase) * feedback.warpAmount * height * 0.035;
          var copies = feedback.mirror === 'quad' ? 4 : (feedback.mirror === 'bilateral' ? 2 : (feedback.mirror === 'kaleidoscope' ? feedback.kaleidoscope : 1));
          for (var copy = 0; copy < copies; copy++) {
            var copyAngle = copy / copies * Math.PI * 2;
            for (var ti = 0; ti < phrase.length; ti++) {
              if (instanceIndex >= limit) return { glyphs: glyphs, bands: bands, limited: true, rasterPasses: [{ kind: 'rasterPass', shader: 'feedback', fallback: true }] };
              var token = phrase[ti];
              var localX = -baseWidth * 0.5 + (ti + 0.5) * baseAdvance;
              var localY = 0;
              var glyphRotation = rotation;
              if (feedback.warp === 'wave') localY += Math.sin(ti / Math.max(1, phrase.length) * Math.PI * 2 + echoPhase) * params.fontSize * feedback.warpAmount;
              else if (feedback.warp === 'twist') glyphRotation += Math.sin(ti / Math.max(1, phrase.length) * Math.PI * 2 + echoPhase) * feedback.warpAmount * 16;
              else if (feedback.warp === 'tunnel') localY += Math.sin(echoPhase + ti * 0.7) * t * height * 0.08;
              else if (feedback.warp === 'glyphSdf') localY += compositionLoopNoise(clock, ti, echo, cascadeTokenCode(token)) * feedback.warpAmount * params.fontSize;
              var ca = copyAngle + glyphRotation * Math.PI / 180;
              var gx = centerX + Math.cos(ca) * localX * scale - Math.sin(ca) * localY * scale + driftX;
              var gy = centerY + Math.sin(ca) * localX * scale + Math.cos(ca) * localY * scale + driftY;
              var opacity = feedback.injection * Math.pow(feedback.decay, echo) * (0.4 + feedback.persistence * 0.6);
              if (opacity < feedback.threshold * 0.08) continue;
              var glyph = compositionGlyph(
                token, gx, gy,
                scale * (1 + feedback.shear * t * 0.2), scale,
                glyphRotation + copyAngle * 180 / Math.PI,
                palette[(echo + copy) % palette.length],
                Math.min(1, opacity), instanceIndex++
              );
              if (glyph) {
                glyph.skewX += feedback.shear * echo * 8;
                glyphs.push(glyph);
              }
            }
          }
          bands.push({
            kind: 'shape', shape: 'ring',
            x: centerX - baseWidth * scale * 0.52, y: centerY - params.fontSize * scale,
            w: baseWidth * scale * 1.04, h: params.fontSize * scale * 2,
            fill: palette[echo % palette.length], stroke: palette[echo % palette.length],
            strokeWidth: Math.max(0.5, 1.5 * (1 - t)),
            opacity: Math.pow(feedback.decay, echo) * feedback.persistence * 0.18,
            rotation: rotation, blend: echo % 2 ? 'screen' : 'difference'
          });
        }
        return {
          glyphs: glyphs, bands: bands, limited: false,
          rasterPasses: [{ kind: 'rasterPass', shader: 'feedback', fallback: true, loopLocked: compositionState.loopLock && feedback.loopLock }]
        };
      }

      function generateCascadeScene(tokens, width, height, runtime) {
        var system = compositionState.cascade.system;
        var generated;
        if (system === 'automaton') generated = generateCascadeAutomaton(tokens, width, height, runtime);
        else if (system === 'circuit') generated = generateCascadeCircuit(tokens, width, height, runtime);
        else if (system === 'sdf') generated = generateCascadeSdf(tokens, width, height, runtime);
        else generated = generateCascadeBands(tokens, width, height);
        var c = compositionState.cascade;
        generated.glyphs.forEach(function (glyph) { glyph.opacity *= c.textAmount; });
        generated.bands.forEach(function (band) {
          band.opacity = (band.opacity == null ? 1 : band.opacity) * c.backgroundAmount;
        });
        return generated;
      }

      function generateTypeMatrixScene(tokens, width, height, runtime) {
        var matrix = compositionState.typeMatrix;
        var clock = runtime && runtime.clock
          ? runtime.clock
          : createLoopClock(compositionState.phase, 240, compositionState.seed, compositionState.direction);
        var glyphs = [], bands = [], limit = compositionLimit();
        var visible = [], frequencies = {}, previousSpace = true;
        for (var tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
          var sourceToken = tokens[tokenIndex];
          if (!sourceToken || sourceToken.space || !sourceToken.glyph) {
            previousSpace = true;
            continue;
          }
          var character = sourceToken.glyph.ch || '';
          frequencies[character] = (frequencies[character] || 0) + 1;
          visible.push({ token: sourceToken, order: visible.length, wordStart: previousSpace });
          previousSpace = false;
        }
        if (!visible.length) return { glyphs: glyphs, bands: bands, limited: false };

        var maxFrequency = 1;
        Object.keys(frequencies).forEach(function (key) { maxFrequency = Math.max(maxFrequency, frequencies[key]); });
        var scriptValues = { hiragana: 0.08, katakana: 0.24, kanji: 0.43, latin: 0.63, digit: 0.79, punct: 0.94, other: 0.54 };
        var scriptColors = { hiragana: 2, katakana: 3, kanji: 0, latin: 4, digit: 2, punct: 4, other: 3 };
        var items = [];
        for (var copy = 0; copy < matrix.copies; copy++) {
          for (var visibleIndex = 0; visibleIndex < visible.length; visibleIndex++) {
            var entry = visible[visibleIndex];
            var glyphCharacter = entry.token.glyph.ch || '';
            var batchKey = entry.token.glyph.batchKey || 'other';
            var orderSignal = visible.length > 1 ? visibleIndex / (visible.length - 1) : 0.5;
            var frequencySignal = frequencies[glyphCharacter] / maxFrequency;
            var scriptSignal = Object.prototype.hasOwnProperty.call(scriptValues, batchKey) ? scriptValues[batchKey] : scriptValues.other;
            var inkSignal = Math.max(0, Math.min(1, (entry.token.glyph.w || params.fontSize) / Math.max(1, params.fontSize * 1.15)));
            var signal = matrix.signal === 'frequency' ? frequencySignal
              : (matrix.signal === 'script' ? scriptSignal : (matrix.signal === 'ink' ? inkSignal : orderSignal));
            items.push({
              token: entry.token,
              order: orderSignal,
              frequency: frequencySignal,
              script: scriptSignal,
              scriptKey: batchKey,
              ink: inkSignal,
              signal: signal,
              wordStart: entry.wordStart,
              copy: copy
            });
          }
        }

        var columns = matrix.columns, rows = matrix.rows;
        var marginX = width * matrix.margin, marginY = height * matrix.margin;
        var innerW = Math.max(1, width - marginX * 2), innerH = Math.max(1, height - marginY * 2);
        var cellW = innerW / columns, cellH = innerH / rows;
        var voidCX = marginX + matrix.voidX * innerW, voidCY = marginY + matrix.voidY * innerH;
        var voidRadius = matrix.voidSize * Math.min(innerW, innerH) * 0.48;
        var cells = [];
        function addCell(col, row) {
          var nx = (col + 0.5) / columns, ny = (row + 0.5) / rows;
          var dx = (marginX + (col + 0.5) * cellW) - voidCX;
          var dy = (marginY + (row + 0.5) * cellH) - voidCY;
          var distance = Math.sqrt(dx * dx + dy * dy);
          var edge = Math.min(nx, 1 - nx, ny, 1 - ny);
          if (matrix.grammar === 'perimeter' && edge > 0.14 + (1 - matrix.voidSize) * 0.08) return;
          if ((matrix.grammar === 'editorial' || matrix.grammar === 'perimeter') && matrix.voidSize > 0.02 && distance < voidRadius) return;
          cells.push({ col: col, row: row, index: row * columns + col });
        }
        if (matrix.reading === 'vertical') {
          for (var cellCol = 0; cellCol < columns; cellCol++) {
            for (var cellRow = 0; cellRow < rows; cellRow++) addCell(cellCol, cellRow);
          }
        } else {
          for (var pathRow = 0; pathRow < rows; pathRow++) {
            if (matrix.reading === 'snake' && pathRow % 2) {
              for (var reverseCol = columns - 1; reverseCol >= 0; reverseCol--) addCell(reverseCol, pathRow);
            } else {
              for (var pathCol = 0; pathCol < columns; pathCol++) addCell(pathCol, pathRow);
            }
          }
        }
        if (matrix.reading === 'reverse') cells.reverse();
        if (!cells.length) cells.push({ col: 0, row: 0, index: 0 });
        var allowed = {};
        cells.forEach(function (cell) { allowed[cell.index] = true; });
        var alternateCells = cells.slice().sort(function (a, b) {
          return hash(a.index, compositionState.seed, 1709) - hash(b.index, compositionState.seed, 1709);
        });
        var occupancy = {}, pathCursor = 0, occupancyLayer = 0;
        function canOccupy(cell, spanX, spanY) {
          if (cell.col + spanX > columns || cell.row + spanY > rows) return false;
          for (var oy = 0; oy < spanY; oy++) {
            for (var ox = 0; ox < spanX; ox++) {
              var key = (cell.row + oy) * columns + cell.col + ox;
              if (!allowed[key] || occupancy[key]) return false;
            }
          }
          return true;
        }
        function occupy(cell, spanX, spanY) {
          for (var oy = 0; oy < spanY; oy++) {
            for (var ox = 0; ox < spanX; ox++) occupancy[(cell.row + oy) * columns + cell.col + ox] = true;
          }
        }
        function matrixPlacement(item, itemIndex) {
          if (matrix.grammar !== 'editorial') {
            return { cell: cells[itemIndex % cells.length], spanX: 1, spanY: 1, layer: Math.floor(itemIndex / cells.length) };
          }
          var spanReach = Math.min(3, columns - 1);
          var phraseWeight = item.wordStart ? matrix.emphasis : 0;
          var spanX = 1 + Math.floor(matrix.span * (item.signal * 0.7 + phraseWeight * 0.7) * spanReach);
          var spanY = matrix.span > 0.55 && item.signal + phraseWeight * 0.45 > 0.82 && rows > 2 ? 2 : 1;
          for (var attempt = 0; attempt < cells.length; attempt++) {
            var pathIndex = (pathCursor + attempt) % cells.length;
            var candidate = cells[pathIndex];
            if (canOccupy(candidate, spanX, spanY)) {
              occupy(candidate, spanX, spanY);
              pathCursor = pathIndex + 1;
              return { cell: candidate, spanX: spanX, spanY: spanY, layer: occupancyLayer };
            }
          }
          occupancy = {};
          occupancyLayer++;
          pathCursor = 0;
          var fallbackCell = cells[itemIndex % cells.length];
          occupancy[fallbackCell.index] = true;
          return { cell: fallbackCell, spanX: 1, spanY: 1, layer: occupancyLayer };
        }

        function guidePath(points, opacity) {
          bands.push({ kind: 'path', points: points, stroke: params.ink, strokeWidth: Math.max(0.5, Math.min(width, height) / 1080), opacity: opacity });
        }
        if (matrix.guides !== 'none' && matrix.guideOpacity > 0) {
          var guideOpacity = matrix.guideOpacity * 0.62;
          guidePath([
            { x: marginX, y: marginY }, { x: width - marginX, y: marginY },
            { x: width - marginX, y: height - marginY }, { x: marginX, y: height - marginY },
            { x: marginX, y: marginY }
          ], guideOpacity);
          if (matrix.guides === 'cells') {
            for (var gx = 1; gx < columns; gx++) guidePath([{ x: marginX + gx * cellW, y: marginY }, { x: marginX + gx * cellW, y: height - marginY }], guideOpacity * 0.55);
            for (var gy = 1; gy < rows; gy++) guidePath([{ x: marginX, y: marginY + gy * cellH }, { x: width - marginX, y: marginY + gy * cellH }], guideOpacity * 0.55);
          } else if (matrix.guides === 'baseline') {
            for (var baseline = 0; baseline < rows; baseline++) {
              var baselineY = marginY + (baseline + 0.78) * cellH;
              guidePath([{ x: marginX, y: baselineY }, { x: width - marginX, y: baselineY }], guideOpacity * 0.72);
            }
          }
          if ((matrix.grammar === 'perimeter' || matrix.grammar === 'tension') && voidRadius > 1) {
            var voidPoints = [];
            for (var va = 0; va <= 32; va++) {
              var angle = va / 32 * Math.PI * 2;
              voidPoints.push({ x: voidCX + Math.cos(angle) * voidRadius, y: voidCY + Math.sin(angle) * voidRadius });
            }
            guidePath(voidPoints, guideOpacity * 0.75);
          }
        }

        var palette = compositionPalette();
        var morphAmount = matrix.morph * (0.5 - 0.5 * Math.cos(clock.angle));
        var intensity = compositionMacro('intensity', 0.65);
        var density = compositionMacro('density', 0.6);
        var instability = compositionMacro('instability', 0.35);
        var depth = compositionMacro('depth', 0.45);
        var instanceIndex = 0;
        var desiredCount = Math.max(1, Math.round(items.length * (0.45 + density * 0.92)));
        for (var itemIndex = 0; itemIndex < desiredCount && instanceIndex < limit; itemIndex++) {
          var item = items[itemIndex % items.length];
          var placement = matrixPlacement(item, itemIndex);
          var cell = placement.cell;
          var spanW = cellW * placement.spanX, spanH = cellH * placement.spanY;
          var cx = marginX + (cell.col + placement.spanX * 0.5) * cellW;
          var cy = marginY + (cell.row + placement.spanY * 0.5) * cellH;
          var target = alternateCells[itemIndex % alternateCells.length];
          var targetX = marginX + (target.col + 0.5) * cellW;
          var targetY = marginY + (target.row + 0.5) * cellH;
          cx += (targetX - cx) * morphAmount;
          cy += (targetY - cy) * morphAmount;

          var alignment = matrix.alignment;
          if (alignment === 'alternate') alignment = (itemIndex + placement.layer) % 2 ? 'end' : 'start';
          if (alignment === 'start') cx -= spanW * 0.27;
          else if (alignment === 'end') cx += spanW * 0.27;

          var jitterGain = matrix.jitter * (0.25 + instability * 1.25);
          cx += (hash(itemIndex, compositionState.seed, 271) * 2 - 1) * cellW * jitterGain;
          cy += (hash(itemIndex, compositionState.seed, 503) * 2 - 1) * cellH * jitterGain;
          if (placement.layer) {
            cx += (placement.layer % 3 - 1) * cellW * 0.08 * depth;
            cy += (placement.layer % 2 ? 1 : -1) * cellH * 0.08 * depth;
          }

          var rotation = (item.signal - 0.5) * 2 * matrix.rotation * (0.25 + intensity * 0.75);
          if (matrix.grammar === 'perimeter') {
            rotation += Math.atan2(cy - voidCY, cx - voidCX) * 180 / Math.PI + 90;
          } else if (matrix.grammar === 'tension') {
            var tensionX = cx - voidCX, tensionY = cy - voidCY;
            var tensionLength = Math.max(1, Math.sqrt(tensionX * tensionX + tensionY * tensionY));
            var tensionForce = matrix.collision * Math.min(cellW, cellH) * (0.6 + item.signal * 1.8);
            cx += tensionX / tensionLength * tensionForce;
            cy += tensionY / tensionLength * tensionForce;
            rotation += (hash(itemIndex, compositionState.seed, 919) * 2 - 1) * matrix.rotation * matrix.collision;
          }

          var sourceW = Math.max(1, item.token.glyph.w || params.fontSize);
          var sourceH = Math.max(1, item.token.glyph.h || params.fontSize * params.lineHeight);
          var usableW = Math.max(1, spanW * (1 - matrix.gutter));
          var usableH = Math.max(1, spanH * (1 - matrix.gutter));
          var baseScale = Math.min(usableW / sourceW, usableH / sourceH);
          var hierarchy = matrix.minScale + (matrix.maxScale - matrix.minScale) * Math.pow(item.signal, 0.72);
          var phraseBoost = item.wordStart ? 1 + matrix.emphasis * 1.1 : 1;
          if (matrix.grammar === 'modular') phraseBoost = 1 + (phraseBoost - 1) * 0.28;
          var scale = Math.max(0.02, baseScale * hierarchy * phraseBoost);
          var scaleX = scale, scaleY = scale;
          if (matrix.grammar === 'editorial' && placement.spanX > 1) scaleX *= 1 + (placement.spanX - 1) * matrix.span * 0.22;
          if (matrix.grammar === 'tension') {
            scaleX *= 1 + matrix.collision * item.signal * 1.8;
            scaleY *= Math.max(0.08, 1 - matrix.collision * (1 - item.signal) * 0.82);
          }

          var fill;
          if (matrix.colorMode === 'order') fill = lerpHex(params.ink, params.accent, item.order);
          else if (matrix.colorMode === 'frequency') fill = lerpHex(compositionState.color2, compositionState.color3, item.frequency);
          else if (matrix.colorMode === 'script') fill = palette[scriptColors[item.scriptKey] == null ? scriptColors.other : scriptColors[item.scriptKey]];
          else fill = item.token.glyph.accent ? params.accent : params.ink;
          var generatedGlyph = compositionGlyph(item.token, cx, cy, scaleX, scaleY, rotation, fill, 0.72 + item.signal * 0.28, instanceIndex++);
          if (generatedGlyph) glyphs.push(generatedGlyph);
        }
        return {
          glyphs: glyphs,
          bands: bands,
          limited: desiredCount > instanceIndex,
          layout: { engine: 'typeMatrix', grammar: matrix.grammar, columns: columns, rows: rows, sourceOrder: true }
        };
      }

      function pathLoomSmoothPoints(points, amount, closed) {
        var output = points.slice();
        var passes = Math.max(0, Math.min(3, Math.round((Number(amount) || 0) * 3)));
        for (var pass = 0; pass < passes && output.length > 2; pass++) {
          var next = [];
          if (!closed) next.push(output[0]);
          var segmentCount = closed ? output.length : output.length - 1;
          for (var index = 0; index < segmentCount; index++) {
            var a = output[index], b = output[(index + 1) % output.length];
            next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
            next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
          }
          if (!closed) next.push(output[output.length - 1]);
          output = next;
        }
        return output;
      }

      function pathLoomPolylineInfo(points, closed) {
        var pathPoints = points.slice();
        if (closed && pathPoints.length > 1) pathPoints.push({ x: pathPoints[0].x, y: pathPoints[0].y });
        var cumulative = [0], total = 0;
        for (var index = 1; index < pathPoints.length; index++) {
          var dx = pathPoints[index].x - pathPoints[index - 1].x;
          var dy = pathPoints[index].y - pathPoints[index - 1].y;
          total += Math.sqrt(dx * dx + dy * dy);
          cumulative.push(total);
        }
        return { points: pathPoints, cumulative: cumulative, total: Math.max(1, total), closed: !!closed };
      }

      function pathLoomPointAt(info, progress) {
        var turn = ((Number(progress) || 0) % 1 + 1) % 1;
        var target = turn * info.total;
        var low = 1, high = info.cumulative.length - 1;
        while (low < high) {
          var middle = (low + high) >> 1;
          if (info.cumulative[middle] < target) low = middle + 1;
          else high = middle;
        }
        var index = Math.max(1, low);
        var a = info.points[index - 1], b = info.points[index] || a;
        var segmentStart = info.cumulative[index - 1];
        var segmentLength = Math.max(0.0001, info.cumulative[index] - segmentStart);
        var local = Math.max(0, Math.min(1, (target - segmentStart) / segmentLength));
        var dx = b.x - a.x, dy = b.y - a.y;
        var magnitude = Math.max(0.0001, Math.sqrt(dx * dx + dy * dy));
        return {
          x: a.x + dx * local,
          y: a.y + dy * local,
          angle: Math.atan2(dy, dx),
          nx: -dy / magnitude,
          ny: dx / magnitude,
          progress: turn
        };
      }

      function pathLoomResample(points, count, closed) {
        var info = pathLoomPolylineInfo(points, closed);
        var output = [], samples = Math.max(24, count || 192);
        for (var index = 0; index < samples; index++) {
          var denominator = closed ? samples : samples - 1;
          if (!closed && index === samples - 1) {
            output.push({ x: points[points.length - 1].x, y: points[points.length - 1].y });
            continue;
          }
          var point = pathLoomPointAt(info, index / Math.max(1, denominator));
          output.push({ x: point.x, y: point.y });
        }
        return output;
      }

      function generatePathLoomScene(tokens, width, height, runtime) {
        var loom = compositionState.pathLoom;
        var clock = runtime && runtime.clock
          ? runtime.clock
          : createLoopClock(compositionState.phase, 240, compositionState.seed, compositionState.direction);
        var glyphs = [], bands = [], limit = compositionLimit();
        var entries = [], pendingSpace = 0;
        for (var tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
          var token = tokens[tokenIndex];
          if (!token || token.space || !token.glyph) {
            pendingSpace += token && token.units ? token.units : 0.55;
            continue;
          }
          entries.push({ token: token, sourceOrder: entries.length, spaceBefore: pendingSpace });
          pendingSpace = 0;
        }
        if (!entries.length) return { glyphs: glyphs, bands: bands, limited: false };
        var base = createPathLoomBasePath(loom, width, height);
        var minimum = Math.min(width, height);
        var intensity = compositionMacro('intensity', 0.65);
        var depth = compositionMacro('depth', 0.45);
        var palette = compositionPalette();
        var scriptColors = { hiragana: 2, katakana: 3, kanji: 0, latin: 4, digit: 2, punct: 4, other: 3 };
        var instanceIndex = 0;
        var desiredCount = entries.length * loom.copies * loom.strands;

        function guideBand(pathInfo, strandIndex, opacity) {
          bands.push({
            kind: 'path', points: pathInfo.points.map(function (point) { return { x: point.x, y: point.y }; }),
            stroke: lerpHex(compositionState.color2, compositionState.color3, loom.strands > 1 ? strandIndex / (loom.strands - 1) : 0.5),
            strokeWidth: Math.max(0.65, minimum / 1080 * 1.25), opacity: opacity
          });
        }

        for (var strand = 0; strand < loom.strands; strand++) {
          var strandCenter = strand - (loom.strands - 1) * 0.5;
          var strandOffset = strandCenter * loom.spread * minimum * 0.055;
          var strandPath = offsetPathLoomPolyline(base.points, base.closed, strandOffset, loom.weave, loom, strand, clock, width, height);
          var pathInfo = pathLoomPolylineInfo(strandPath, base.closed);
          if (loom.guides !== 'none' && loom.guideOpacity > 0) {
            guideBand(pathInfo, strand, loom.guideOpacity * 0.72);
            if (loom.guides === 'rails') {
              var railDistance = Math.max(3, params.fontSize * loom.scale * 0.34);
              var outerRail = offsetPathLoomPolyline(strandPath, base.closed, railDistance, 0, loom, strand, clock, width, height);
              var innerRail = offsetPathLoomPolyline(strandPath, base.closed, -railDistance, 0, loom, strand, clock, width, height);
              guideBand(pathLoomPolylineInfo(outerRail, base.closed), strand, loom.guideOpacity * 0.38);
              guideBand(pathLoomPolylineInfo(innerRail, base.closed), strand, loom.guideOpacity * 0.38);
            }
          }

          var strandEntries = entries.slice();
          if (loom.flow === 'interleave') {
            strandEntries = entries.filter(function (entry, entryIndex) { return entryIndex % loom.strands === strand; });
            if (!strandEntries.length) strandEntries = entries.slice(strand % entries.length, strand % entries.length + 1);
          }
          var reversePath = (loom.flow === 'alternate' || loom.flow === 'mirror') && strand % 2 === 1;
          if (loom.flow === 'mirror' && reversePath) strandEntries.reverse();
          var rawAdvanceTotal = 0;
          for (var measureIndex = 0; measureIndex < strandEntries.length; measureIndex++) {
            var measureEntry = strandEntries[measureIndex];
            rawAdvanceTotal += (Math.max(1, measureEntry.token.glyph.w || params.fontSize)
              + measureEntry.spaceBefore * params.fontSize * 0.55 + params.fontSize * 0.08) * loom.spacing;
          }
          var availableDistance = pathInfo.total * loom.length;
          var fitFactor = availableDistance / Math.max(1, rawAdvanceTotal * loom.scale);
          fitFactor = Math.max(0.025, Math.min(20, fitFactor));
          var glyphFitScale = loom.spacingMode === 'fit' ? fitFactor : 1;
          var advanceFitScale = loom.spacingMode === 'natural' ? 1 : fitFactor;

          for (var copy = 0; copy < loom.copies; copy++) {
            var cursor = 0, previousHalfWidth = 0;
            var copyOffset = copy / Math.max(1, loom.copies);
            for (var entryIndex = 0; entryIndex < strandEntries.length && instanceIndex < limit; entryIndex++) {
              var entry = strandEntries[entryIndex];
              var sourceWidth = Math.max(1, entry.token.glyph.w || params.fontSize);
              var rawAdvance = (sourceWidth + entry.spaceBefore * params.fontSize * 0.55 + params.fontSize * 0.08) * loom.spacing;
              var glyphScale = Math.max(0.02, loom.scale * glyphFitScale);
              var pulseSignal = Math.sin((entry.sourceOrder / Math.max(1, entries.length) * loom.turns + clock.turn * loom.travel * clock.direction) * Math.PI * 2);
              glyphScale *= Math.max(0.03, 1 + pulseSignal * loom.scalePulse * (0.25 + intensity * 0.75));
              var halfWidth = sourceWidth * glyphScale * 0.5;
              var advanceDistance = rawAdvance * loom.scale * advanceFitScale;
              var collisionDistance = (previousHalfWidth + halfWidth) * (0.35 + loom.collision * 0.65);
              if (entryIndex === 0) cursor = halfWidth;
              else cursor += Math.max(advanceDistance, collisionDistance);
              previousHalfWidth = halfWidth;
              if (cursor > availableDistance && loom.length <= 1 && loom.spacingMode === 'natural') break;

              var travel = loom.loop ? clock.turn * loom.travel * clock.direction : 0;
              var pathProgress = loom.start + copyOffset + travel + cursor / pathInfo.total;
              if (reversePath) pathProgress = 1 - pathProgress;
              var pathPoint = pathLoomPointAt(pathInfo, pathProgress);
              var codePoint = (entry.token.glyph.ch || '').codePointAt(0) || 0;
              var normalSignal = hash(codePoint, entry.token.sourceIndex, compositionState.seed) * 2 - 1;
              var normalPush = normalSignal * loom.push * minimum * 0.06 * (0.35 + depth * 0.65);
              var cx = pathPoint.x + pathPoint.nx * normalPush;
              var cy = pathPoint.y + pathPoint.ny * normalPush;
              var rotation = 0;
              if (loom.orientation === 'tangent') rotation = pathPoint.angle * 180 / Math.PI + (reversePath ? 180 : 0);
              else if (loom.orientation === 'normal') rotation = pathPoint.angle * 180 / Math.PI + 90 + (reversePath ? 180 : 0);
              var fill;
              if (loom.colorMode === 'strand') fill = lerpHex(compositionState.color2, compositionState.color3, loom.strands > 1 ? strand / (loom.strands - 1) : 0.5);
              else if (loom.colorMode === 'order') fill = lerpHex(compositionState.color2, compositionState.color3, entry.sourceOrder / Math.max(1, entries.length - 1));
              else if (loom.colorMode === 'script') fill = palette[scriptColors[entry.token.glyph.batchKey] == null ? scriptColors.other : scriptColors[entry.token.glyph.batchKey]];
              else fill = entry.token.glyph.accent ? params.accent : params.ink;
              var edgeFade = 1;
              if (!base.closed && loom.loop && loom.travel !== 0) edgeFade = Math.min(1, Math.min(pathPoint.progress, 1 - pathPoint.progress) / 0.025);
              var generatedGlyph = compositionGlyph(entry.token, cx, cy, glyphScale, glyphScale, rotation, fill, (0.76 + Math.abs(normalSignal) * 0.24) * edgeFade, instanceIndex++);
              if (!generatedGlyph) continue;
              var flipGlyph = loom.flip === 'alternate' && strand % 2 === 1;
              if (loom.flip === 'inside') {
                flipGlyph = (pathPoint.x - width * 0.5) * pathPoint.nx + (pathPoint.y - height * 0.5) * pathPoint.ny > 0;
              }
              if (flipGlyph) generatedGlyph.scaleY *= -1;
              glyphs.push(generatedGlyph);
            }
          }
        }
        return {
          glyphs: glyphs,
          bands: bands,
          limited: desiredCount > instanceIndex && instanceIndex >= limit,
          layout: {
            engine: 'pathLoom', grammar: loom.grammar, strands: loom.strands,
            measuredSpacing: true, customPathPoints: loom.customPath.length, sourceOrder: true
          }
        };
      }

      var glyphVesselFieldCache = { key: '', field: null };

      function glyphVesselImageValues(vessel, size) {
        if (!vessel.imageData || !vessel.imageWidth || !vessel.imageHeight) return null;
        try {
          var binary = atob(vessel.imageData);
          var expected = vessel.imageWidth * vessel.imageHeight;
          if (binary.length !== expected) return null;
          var values = new Float32Array(size * size);
          for (var y = 0; y < size; y++) {
            var sy = Math.min(vessel.imageHeight - 1, Math.floor(y / size * vessel.imageHeight));
            for (var x = 0; x < size; x++) {
              var sx = Math.min(vessel.imageWidth - 1, Math.floor(x / size * vessel.imageWidth));
              values[y * size + x] = binary.charCodeAt(sy * vessel.imageWidth + sx) / 255;
            }
          }
          return values;
        } catch (error) { return null; }
      }

      function glyphVesselRasterGlyph(vessel, size) {
        var canvas = glyphVesselRasterGlyph.canvas || (glyphVesselRasterGlyph.canvas = (globalThis.TypeDeformerRenderContext ? globalThis.TypeDeformerRenderContext.createCanvas() : createRenderCanvas()));
        canvas.width = size;
        canvas.height = size;
        var ctx = canvas.getContext('2d', { willReadFrequently: true });
        var values = new Float32Array(size * size);
        if (!ctx) return values;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, size, size);
        var glyph = vessel.vesselGlyph || 'あ';
        var fontSize = size * 0.86;
        ctx.font = params.fontWeight + ' ' + fontSize + 'px ' + params.fontFamily;
        var measured = ctx.measureText(glyph);
        if (measured.width > size * 0.86) fontSize *= size * 0.86 / Math.max(1, measured.width);
        ctx.font = params.fontWeight + ' ' + fontSize + 'px ' + params.fontFamily;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(2, size * 0.14);
        ctx.strokeStyle = '#fff';
        ctx.fillStyle = '#fff';
        ctx.save();
        ctx.filter = 'blur(' + Math.max(1, size * 0.035) + 'px)';
        ctx.strokeText(glyph, size * 0.5, size * 0.51);
        ctx.restore();
        ctx.strokeText(glyph, size * 0.5, size * 0.51);
        ctx.fillText(glyph, size * 0.5, size * 0.51);
        var pixels = ctx.getImageData(0, 0, size, size).data;
        for (var index = 0; index < values.length; index++) values[index] = pixels[index * 4 + 3] / 255;
        return values;
      }

      function glyphVesselBuildField(vessel) {
        var size = 72;
        var requestedSource = vessel.source;
        var imageKey = vessel.imageData ? vessel.imageData.length + ':' + vessel.imageData.slice(0, 24) + ':' + vessel.imageData.slice(-24) : '';
        var key = [requestedSource, vessel.vesselGlyph, params.fontFamily, params.fontWeight, imageKey,
          vessel.holes, vessel.holeSize, vessel.threshold, vessel.gamma, vessel.invert].join('|');
        if (glyphVesselFieldCache.key === key && glyphVesselFieldCache.field) return glyphVesselFieldCache.field;
        var values = null;
        var sourceUsed = requestedSource;
        if (requestedSource === 'image') values = glyphVesselImageValues(vessel, size);
        if (!values && requestedSource === 'image') sourceUsed = 'glyph';
        if (!values && sourceUsed === 'glyph') values = glyphVesselRasterGlyph(vessel, size);
        if (!values) {
          values = new Float32Array(size * size);
          for (var y = 0; y < size; y++) {
            var ny = (y + 0.5) / size - 0.5;
            for (var x = 0; x < size; x++) {
              var nx = (x + 0.5) / size - 0.5;
              var value = 0;
              if (sourceUsed === 'diamond') {
                value = Math.max(0, Math.min(1, (0.43 - Math.abs(nx) - Math.abs(ny)) * 18 + 0.5));
              } else {
                var capsuleX = Math.max(0, Math.abs(nx) - 0.18);
                var capsuleDistance = Math.sqrt(capsuleX * capsuleX + ny * ny);
                value = Math.max(0, Math.min(1, (0.36 - capsuleDistance) * 18 + 0.5));
              }
              values[y * size + x] = value;
            }
          }
        }
        var gamma = Math.max(0.1, vessel.gamma);
        var holes = [];
        for (var holeIndex = 0; holeIndex < vessel.holes; holeIndex++) {
          var angle = Math.PI * 2 * (holeIndex / Math.max(1, vessel.holes) + hash(holeIndex, compositionState.seed, 401) * 0.08);
          var radius = 0.07 + hash(holeIndex, compositionState.seed, 587) * 0.18;
          holes.push({
            x: 0.5 + Math.cos(angle) * radius,
            y: 0.5 + Math.sin(angle) * radius,
            r: vessel.holeSize * (0.62 + hash(holeIndex, compositionState.seed, 773) * 0.58)
          });
        }
        var inside = new Uint8Array(size * size);
        var insideCells = [];
        for (var valueIndex = 0; valueIndex < values.length; valueIndex++) {
          var px = valueIndex % size, py = Math.floor(valueIndex / size);
          var value = Math.pow(Math.max(0, Math.min(1, values[valueIndex])), gamma);
          if (vessel.invert) value = 1 - value;
          for (var hi = 0; hi < holes.length; hi++) {
            var hole = holes[hi];
            var hdx = (px + 0.5) / size - hole.x, hdy = (py + 0.5) / size - hole.y;
            var holeDistance = Math.sqrt(hdx * hdx + hdy * hdy);
            var holeEdge = Math.max(0, Math.min(1, (holeDistance - hole.r) * size * 0.42));
            value *= holeEdge;
          }
          values[valueIndex] = value;
          if (value >= vessel.threshold) {
            inside[valueIndex] = 1;
            insideCells.push({ x: px, y: py, value: value, index: valueIndex });
          }
        }
        var distance = new Float32Array(size * size);
        var large = size * 4;
        for (var di = 0; di < distance.length; di++) distance[di] = inside[di] ? large : 0;
        for (var fy = 0; fy < size; fy++) {
          for (var fx = 0; fx < size; fx++) {
            var fi = fy * size + fx;
            if (!inside[fi]) continue;
            var best = distance[fi];
            if (fx > 0) best = Math.min(best, distance[fi - 1] + 1);
            if (fy > 0) best = Math.min(best, distance[fi - size] + 1);
            if (fx > 0 && fy > 0) best = Math.min(best, distance[fi - size - 1] + 1.4142);
            if (fx + 1 < size && fy > 0) best = Math.min(best, distance[fi - size + 1] + 1.4142);
            distance[fi] = best;
          }
        }
        var maxDistance = 1;
        for (var by = size - 1; by >= 0; by--) {
          for (var bx = size - 1; bx >= 0; bx--) {
            var bi = by * size + bx;
            if (!inside[bi]) continue;
            var backBest = distance[bi];
            if (bx + 1 < size) backBest = Math.min(backBest, distance[bi + 1] + 1);
            if (by + 1 < size) backBest = Math.min(backBest, distance[bi + size] + 1);
            if (bx + 1 < size && by + 1 < size) backBest = Math.min(backBest, distance[bi + size + 1] + 1.4142);
            if (bx > 0 && by + 1 < size) backBest = Math.min(backBest, distance[bi + size - 1] + 1.4142);
            distance[bi] = backBest;
            maxDistance = Math.max(maxDistance, backBest);
          }
        }
        for (var cellIndex = 0; cellIndex < insideCells.length; cellIndex++) {
          insideCells[cellIndex].distance = distance[insideCells[cellIndex].index] / maxDistance;
        }
        var field = {
          size: size, values: values, inside: inside, insideCells: insideCells,
          distance: distance, maxDistance: maxDistance,
          sourceUsed: sourceUsed, requestedSource: requestedSource, holes: holes
        };
        glyphVesselFieldCache.key = key;
        glyphVesselFieldCache.field = field;
        return field;
      }

      function glyphVesselSample(field, nx, ny, distanceMode) {
        var size = field.size;
        var x = Math.max(0, Math.min(size - 1, nx * (size - 1)));
        var y = Math.max(0, Math.min(size - 1, ny * (size - 1)));
        var x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(size - 1, x0 + 1), y1 = Math.min(size - 1, y0 + 1);
        var tx = x - x0, ty = y - y0;
        var source = distanceMode ? field.distance : field.values;
        function valueAt(px, py) { return source[py * size + px] / (distanceMode ? field.maxDistance : 1); }
        var top = valueAt(x0, y0) + (valueAt(x1, y0) - valueAt(x0, y0)) * tx;
        var bottom = valueAt(x0, y1) + (valueAt(x1, y1) - valueAt(x0, y1)) * tx;
        return top + (bottom - top) * ty;
      }

      function glyphVesselGradient(field, nx, ny) {
        var step = 1 / field.size;
        var gx = glyphVesselSample(field, nx + step, ny, true) - glyphVesselSample(field, nx - step, ny, true);
        var gy = glyphVesselSample(field, nx, ny + step, true) - glyphVesselSample(field, nx, ny - step, true);
        var magnitude = Math.max(0.0001, Math.sqrt(gx * gx + gy * gy));
        return { x: gx / magnitude, y: gy / magnitude, angle: Math.atan2(gy, gx) };
      }

      function glyphVesselMakeToken(group, text, measureCtx) {
        if (!group.length || !group[0].glyph) return null;
        var source = Object.assign({}, group[0].glyph);
        source.ch = text;
        var measuredWidth = measureCtx ? measureCtx.measureText(text).width : Math.max(1, text.length * params.fontSize * 0.62);
        source.w = Math.max(1, measuredWidth);
        source.bw = source.w;
        source.h = Math.max(1, source.h || params.fontSize * params.lineHeight);
        source.bh = source.h;
        return { space: false, units: 1, sourceIndex: group[0].sourceIndex, glyph: source };
      }

      function glyphVesselUnits(tokens, unitMode) {
        var visible = [];
        for (var i = 0; i < tokens.length; i++) if (tokens[i] && !tokens[i].space && tokens[i].glyph) visible.push(tokens[i]);
        if (unitMode === 'glyph') return visible;
        var canvas = glyphVesselUnits.canvas || (glyphVesselUnits.canvas = (globalThis.TypeDeformerRenderContext ? globalThis.TypeDeformerRenderContext.createCanvas() : createRenderCanvas()));
        var measureCtx = canvas.getContext('2d');
        if (measureCtx) measureCtx.font = params.fontWeight + ' ' + params.fontSize + 'px ' + params.fontFamily;
        var words = [], current = [];
        function flushWord() {
          if (!current.length) return;
          var maxChunk = unitMode === 'word' ? 5 : 7;
          for (var start = 0; start < current.length; start += maxChunk) words.push(current.slice(start, start + maxChunk));
          current = [];
        }
        for (var tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
          var token = tokens[tokenIndex];
          if (!token || token.space || !token.glyph) flushWord();
          else current.push(token);
        }
        flushWord();
        if (!words.length) return visible;
        if (unitMode === 'word') {
          return words.map(function (word) {
            return glyphVesselMakeToken(word, word.map(function (token) { return token.glyph.ch; }).join(''), measureCtx);
          }).filter(Boolean);
        }
        var phrases = [];
        for (var wordIndex = 0; wordIndex < words.length; wordIndex += 3) {
          var phraseWords = words.slice(wordIndex, wordIndex + 3);
          var phraseTokens = [];
          var phraseText = phraseWords.map(function (word) {
            phraseTokens = phraseTokens.concat(word);
            return word.map(function (token) { return token.glyph.ch; }).join('');
          }).join(' ');
          var phrase = glyphVesselMakeToken(phraseTokens, phraseText, measureCtx);
          if (phrase) phrases.push(phrase);
        }
        return phrases.length ? phrases : visible;
      }

      function glyphVesselGuideBands(field, vessel, width, height, bands) {
        if (vessel.guides === 'none' || vessel.guideOpacity <= 0) return;
        var size = field.size;
        var cellW = width / (size - 1), cellH = height / (size - 1);
        var bandLimit = 900;
        function contour(source, level, opacity, color) {
          for (var y = 0; y < size - 1 && bands.length < bandLimit; y++) {
            for (var x = 0; x < size - 1 && bands.length < bandLimit; x++) {
              function sample(px, py) { return source[py * size + px]; }
              var a = sample(x, y), b = sample(x + 1, y), c = sample(x + 1, y + 1), d = sample(x, y + 1);
              var segments = contourSegmentsForCell(x * cellW, y * cellH, cellW, cellH, a, b, c, d, level);
              for (var segmentIndex = 0; segmentIndex < segments.length && bands.length < bandLimit; segmentIndex++) {
                bands.push({ kind: 'path', points: segments[segmentIndex], stroke: color, strokeWidth: Math.max(0.7, Math.min(width, height) / 1080), opacity: opacity });
              }
            }
          }
        }
        if (vessel.guides === 'outline') {
          contour(field.values, vessel.threshold, vessel.guideOpacity, vessel.colorA);
        } else if (vessel.guides === 'distance') {
          var normalizedDistance = new Float32Array(field.distance.length);
          for (var i = 0; i < normalizedDistance.length; i++) normalizedDistance[i] = field.distance[i] / field.maxDistance;
          [0.12, 0.28, 0.48, 0.72].forEach(function (level, index) {
            contour(normalizedDistance, level, vessel.guideOpacity * (0.8 - index * 0.11), index % 2 ? vessel.colorB : vessel.colorA);
          });
        } else if (vessel.guides === 'force') {
          for (var gy = 4; gy < size - 4 && bands.length < bandLimit; gy += 7) {
            for (var gx = 4; gx < size - 4 && bands.length < bandLimit; gx += 7) {
              if (!field.inside[gy * size + gx]) continue;
              var nx = gx / (size - 1), ny = gy / (size - 1);
              var gradient = glyphVesselGradient(field, nx, ny);
              var length = Math.min(width, height) * 0.018;
              bands.push({
                kind: 'path',
                points: [{ x: nx * width, y: ny * height }, { x: nx * width + gradient.x * length, y: ny * height + gradient.y * length }],
                stroke: vessel.colorB, strokeWidth: Math.max(0.7, Math.min(width, height) / 1350), opacity: vessel.guideOpacity
              });
            }
          }
        }
      }

      function generateGlyphVesselScene(tokens, width, height, runtime) {
        var vessel = compositionState.glyphVessel;
        var clock = runtime && runtime.clock
          ? runtime.clock
          : createLoopClock(compositionState.phase, 240, compositionState.seed, compositionState.direction);
        var glyphs = [], bands = [], limit = Math.min(1600, compositionLimit());
        var units = glyphVesselUnits(tokens, vessel.unit);
        if (!units.length) return { glyphs: glyphs, bands: bands, limited: false };
        var field = glyphVesselBuildField(vessel);
        if (!field.insideCells.length) return { glyphs: glyphs, bands: bands, limited: false, layout: { engine: 'glyphVessel', emptyMask: true } };
        glyphVesselGuideBands(field, vessel, width, height, bands);

        var frequencies = {}, maxFrequency = 1;
        for (var unitIndex = 0; unitIndex < units.length; unitIndex++) {
          var unitCharacter = units[unitIndex].glyph.ch || '';
          frequencies[unitCharacter] = (frequencies[unitCharacter] || 0) + 1;
          maxFrequency = Math.max(maxFrequency, frequencies[unitCharacter]);
        }
        var scriptValues = { hira: 0.12, hiragana: 0.12, kata: 0.28, katakana: 0.28, kanji: 0.46, latin: 0.66, digit: 0.82, punct: 0.94, other: 0.54 };
        var densityMacro = compositionMacro('density', 0.6);
        var instability = compositionMacro('instability', 0.35);
        var intensity = compositionMacro('intensity', 0.65);
        var desiredCount = Math.min(limit, Math.max(8, Math.round(vessel.count * (0.55 + densityMacro * 0.75))));
        var minimum = Math.min(width, height);
        var requests = [];
        for (var requestIndex = 0; requestIndex < desiredCount; requestIndex++) {
          var unit = units[requestIndex % units.length];
          var character = unit.glyph.ch || '';
          var orderSignal = desiredCount > 1 ? requestIndex / (desiredCount - 1) : 0.5;
          var sourceOrderSignal = units.length > 1 ? (requestIndex % units.length) / (units.length - 1) : orderSignal;
          var frequencySignal = (frequencies[character] || 1) / maxFrequency;
          var scriptKey = unit.glyph.batchKey || 'other';
          var scriptSignal = Object.prototype.hasOwnProperty.call(scriptValues, scriptKey) ? scriptValues[scriptKey] : scriptValues.other;
          var inkSignal = Math.max(0, Math.min(1, (unit.glyph.w || params.fontSize) / Math.max(1, params.fontSize * Math.max(1, Array.from(character).length))));
          var signal = vessel.sizeSignal === 'frequency' ? frequencySignal
            : (vessel.sizeSignal === 'script' ? scriptSignal : (vessel.sizeSignal === 'ink' ? inkSignal : orderSignal));
          if (vessel.sizeSignal === 'field') signal = 0.45 + hash(requestIndex, compositionState.seed, 1847) * 0.25;
          var hierarchySignal = Math.max(0, Math.min(1, signal * 0.78 + hash(requestIndex, compositionState.seed, 1663) * 0.22));
          var hierarchy = vessel.minScale + (vessel.maxScale - vessel.minScale) * Math.pow(hierarchySignal, 2.2);
          requests.push({
            token: unit, requestIndex: requestIndex, order: orderSignal, frequency: frequencySignal,
            sourceOrder: sourceOrderSignal,
            script: scriptSignal, scriptKey: scriptKey, ink: inkSignal, signal: signal,
            hierarchy: hierarchy
          });
        }
        if (vessel.mode === 'tight' || vessel.mode === 'edge') requests.sort(function (a, b) { return b.hierarchy - a.hierarchy; });
        var flowCells = field.insideCells.slice().sort(function (a, b) {
          var rowA = Math.floor(a.y / 3), rowB = Math.floor(b.y / 3);
          if (rowA !== rowB) return rowA - rowB;
          return rowA % 2 ? b.x - a.x : a.x - b.x;
        });
        var edgeCells = field.insideCells.slice().sort(function (a, b) { return a.distance - b.distance; });
        var edgeCellCount = Math.max(1, Math.floor(edgeCells.length * 0.36));
        var placed = [], buckets = Object.create(null), bucketSize = Math.max(18, minimum / 22), maxRadius = bucketSize;
        var gapFactor = vessel.gap >= 0 ? 1 + vessel.gap * 0.5 : Math.max(0.2, 1 + vessel.gap * 0.9);
        function bucketKey(x, y) { return Math.floor(x / bucketSize) + ':' + Math.floor(y / bucketSize); }
        function addPlaced(item) {
          placed.push(item);
          maxRadius = Math.max(maxRadius, item.radius);
          var key = bucketKey(item.x, item.y);
          (buckets[key] || (buckets[key] = [])).push(item);
        }
        function collisionAt(x, y, radius) {
          var range = Math.max(1, Math.ceil((radius + maxRadius) * gapFactor / bucketSize));
          var bx = Math.floor(x / bucketSize), by = Math.floor(y / bucketSize);
          var overlap = 0;
          for (var oy = -range; oy <= range; oy++) {
            for (var ox = -range; ox <= range; ox++) {
              var list = buckets[(bx + ox) + ':' + (by + oy)];
              if (!list) continue;
              for (var pi = 0; pi < list.length; pi++) {
                var other = list[pi];
                var dx = x - other.x, dy = y - other.y;
                var required = (radius + other.radius) * gapFactor;
                var distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < required) overlap += required - distance;
              }
            }
          }
          return overlap;
        }
        function fitsMask(x, y, halfW, halfH) {
          var nx = x / width, ny = y / height;
          var points = [[0, 0], [-0.72, -0.72], [0.72, -0.72], [0.72, 0.72], [-0.72, 0.72], [-0.92, 0], [0.92, 0], [0, -0.92], [0, 0.92]];
          for (var pointIndex = 0; pointIndex < points.length; pointIndex++) {
            var sampleX = nx + points[pointIndex][0] * halfW / width;
            var sampleY = ny + points[pointIndex][1] * halfH / height;
            if (sampleX < 0 || sampleX > 1 || sampleY < 0 || sampleY > 1 || glyphVesselSample(field, sampleX, sampleY, false) < vessel.threshold) return false;
          }
          return true;
        }
        function candidateCell(request, attempt) {
          var list = field.insideCells;
          var index;
          if (vessel.mode === 'flow') {
            list = flowCells;
            index = (Math.floor(request.order * Math.max(0, list.length - 1)) + attempt * 17) % list.length;
          } else if (vessel.mode === 'edge') {
            list = edgeCells;
            index = Math.floor(hash(request.requestIndex, attempt, compositionState.seed + 223) * edgeCellCount);
          } else {
            index = Math.floor(hash(request.requestIndex, attempt, compositionState.seed + 449) * list.length);
          }
          return list[Math.max(0, Math.min(list.length - 1, index))];
        }
        var attempts = Math.max(1, Math.min(32, 1 + Math.round(vessel.relaxation / 3.2)));
        for (var ri = 0; ri < requests.length && glyphs.length < limit; ri++) {
          var request = requests[ri];
          var sourceW = Math.max(1, request.token.glyph.w || params.fontSize) * Math.max(0.02, Math.abs(request.token.glyph.scaleX || 1));
          var sourceH = Math.max(1, request.token.glyph.h || params.fontSize * params.lineHeight) * Math.max(0.02, Math.abs(request.token.glyph.scaleY || 1));
          var unitFactor = vessel.unit === 'glyph' ? 1 : (vessel.unit === 'word' ? 0.86 : 0.72);
          var baseTargetHeight = minimum * 0.052 * request.hierarchy * unitFactor;
          var best = null;
          for (var shrinkPass = 0; shrinkPass < 4 && !best; shrinkPass++) {
            for (var attempt = 0; attempt < attempts; attempt++) {
              var cell = candidateCell(request, attempt + shrinkPass * attempts);
              var jitterX = (hash(request.requestIndex, attempt, 1013 + shrinkPass) * 2 - 1) * vessel.jitter * (width / field.size) * (0.25 + instability);
              var jitterY = (hash(request.requestIndex, attempt, 1297 + shrinkPass) * 2 - 1) * vessel.jitter * (height / field.size) * (0.25 + instability);
              var cx = (cell.x + 0.5) / field.size * width + jitterX;
              var cy = (cell.y + 0.5) / field.size * height + jitterY;
              var fieldValue = glyphVesselSample(field, cx / width, cy / height, false);
              var distanceValue = glyphVesselSample(field, cx / width, cy / height, true);
              var fieldScale = vessel.sizeSignal === 'field' || vessel.mode === 'density' ? 0.32 + fieldValue * 1.28 : 1;
              var scale = baseTargetHeight / sourceH * fieldScale * Math.pow(0.78, shrinkPass);
              var halfW = sourceW * scale * 0.5, halfH = sourceH * scale * 0.5;
              var radius = Math.sqrt(halfW * halfW + halfH * halfH) * 0.54;
              if (!fitsMask(cx, cy, halfW, halfH)) continue;
              var overlap = collisionAt(cx, cy, radius);
              var score = -overlap * 12 + distanceValue * 0.5;
              if (vessel.mode === 'density') score += fieldValue * 4;
              if (vessel.mode === 'edge') score += (1 - distanceValue) * 4;
              if (vessel.edgePull >= 0) score += vessel.edgePull * (1 - distanceValue);
              else score += -vessel.edgePull * distanceValue;
              if (!best || score > best.score) best = { x: cx, y: cy, scale: scale, radius: radius, field: fieldValue, distance: distanceValue, score: score, overlap: overlap };
              if (overlap <= 0.001 && (vessel.mode === 'flow' || attempt >= Math.min(4, attempts - 1))) break;
            }
            if (best && best.overlap > 0.001) best = null;
          }
          if (!best) continue;
          var gradient = glyphVesselGradient(field, best.x / width, best.y / height);
          var rotation = (hash(request.requestIndex, compositionState.seed, 1559) * 2 - 1) * vessel.rotation * (0.3 + intensity * 0.7);
          if (vessel.orientation === 'axial') rotation = Math.round(rotation / 90) * 90;
          else if (vessel.orientation === 'edge') rotation = gradient.angle * 180 / Math.PI;
          else if (vessel.orientation === 'tangent') rotation = gradient.angle * 180 / Math.PI + 90;
          var reducedMotion = matchesRenderMedia('(prefers-reduced-motion: reduce)');
          var motionTurn = reducedMotion ? 0 : clock.turn;
          var motionPhase = Math.sin(Math.PI * 2 * (motionTurn * vessel.motionSpeed * clock.direction + hash(request.requestIndex, compositionState.seed, 2029)));
          var renderX = best.x, renderY = best.y, renderScale = best.scale;
          if (vessel.motion === 'breathe') renderScale *= Math.max(0.08, 1 + motionPhase * vessel.motionAmount * 0.12);
          else if (vessel.motion === 'circulate') {
            var orbitAngle = vessel.motionAmount * motionPhase * 0.08;
            var odx = best.x - width * 0.5, ody = best.y - height * 0.5;
            renderX = width * 0.5 + odx * Math.cos(orbitAngle) - ody * Math.sin(orbitAngle);
            renderY = height * 0.5 + odx * Math.sin(orbitAngle) + ody * Math.cos(orbitAngle);
            rotation += vessel.motionAmount * motionPhase * 10;
          } else if (vessel.motion === 'rupture') {
            var rdx = best.x - width * 0.5, rdy = best.y - height * 0.5;
            var rm = Math.max(1, Math.sqrt(rdx * rdx + rdy * rdy));
            renderX += rdx / rm * vessel.motionAmount * motionPhase * minimum * 0.045;
            renderY += rdy / rm * vessel.motionAmount * motionPhase * minimum * 0.045;
            rotation += vessel.motionAmount * motionPhase * 18;
          }
          var fill = vessel.colorA;
          if (vessel.colorMode === 'order') {
            fill = request.sourceOrder < 0.5
              ? lerpHex(vessel.colorA, vessel.colorB, request.sourceOrder * 2)
              : lerpHex(vessel.colorB, vessel.colorC, request.sourceOrder * 2 - 1);
          } else if (vessel.colorMode === 'field') fill = lerpHex(vessel.colorB, vessel.colorC, best.field);
          else if (vessel.colorMode === 'script') {
            if (request.scriptKey === 'kanji' || request.scriptKey === 'punct') fill = vessel.colorA;
            else if (request.scriptKey === 'latin' || request.scriptKey === 'digit') fill = vessel.colorB;
            else fill = vessel.colorC;
          }
          var generated = compositionGlyph(request.token, renderX, renderY, renderScale, renderScale, rotation, fill, 0.7 + best.field * 0.3, glyphs.length);
          if (generated) {
            glyphs.push(generated);
            addPlaced({ x: best.x, y: best.y, radius: best.radius });
          }
        }
        return {
          glyphs: glyphs,
          bands: bands,
          limited: glyphs.length >= limit && glyphs.length < desiredCount,
          layout: {
            engine: 'glyphVessel', mode: vessel.mode, unit: vessel.unit,
            source: field.sourceUsed, requestedSource: field.requestedSource,
            fallback: field.sourceUsed !== field.requestedSource,
            maskResolution: field.size, packed: glyphs.length, requested: desiredCount, saturated: glyphs.length < desiredCount,
            collisionPacking: true, holesPreserved: true, sourceOrder: true
          }
        };
      }

      function applyCompositionLegibility(scene) {
        var legibility = compositionMacro('legibility', 0.85);
        for (var i = 0; i < scene.glyphs.length; i++) {
          scene.glyphs[i].opacity *= legibility;
        }
        for (var j = 0; j < scene.bands.length; j++) {
          if (scene.bands[j].backdrop) continue;
          scene.bands[j].opacity = (scene.bands[j].opacity == null ? 1 : scene.bands[j].opacity) * (0.3 + (1 - legibility) * 0.7);
        }
        return scene;
      }

      function compositionFxModule(primary, aliases) {
        var rack = compositionState && (compositionState.fxRack || compositionState.fx);
        if (!rack || typeof rack !== 'object') return null;
        if (rack[primary] && typeof rack[primary] === 'object') return rack[primary];
        aliases = aliases || [];
        for (var i = 0; i < aliases.length; i++) {
          if (rack[aliases[i]] && typeof rack[aliases[i]] === 'object') return rack[aliases[i]];
        }
        return null;
      }

      function compositionFxBudget(qualityMode) {
        var compact = matchesRenderMedia('(max-width: 760px)');
        var quality = compositionEffectiveQuality();
        if (quality === 'performance') return compact ? 4200 : 9000;
        if (quality === 'high') return compact ? 9000 : 22000;
        return compact ? 6500 : 16000;
      }

      var compositionWebGLState = {
        checked: false, available: false, canvas: null, gl: null, program: null,
        position: null, uniforms: null, texture: null, maskCanvas: null,
        maskKey: '', lost: false
      };

      function compileCompositionShader(gl, type, source) {
        var shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          var message = gl.getShaderInfoLog(shader) || 'WebGL shader compile failed';
          gl.deleteShader(shader);
          throw new Error(message);
        }
        return shader;
      }

      function renderCompositionWebGLPass(scene) {
        var useFeedback = compositionState.type === 'feedbackChamber';
        var useOptical = compositionState.type === 'cascade' && compositionState.cascade.system === 'sdf';
        if ((!useFeedback && !useOptical) || !webglCompositionAvailable()) return null;
        try {
          var state = ensureCompositionWebGL(scene.width, scene.height);
          if (!state) return null;
          var gl = state.gl, uniforms = state.uniforms;
          gl.viewport(0, 0, state.canvas.width, state.canvas.height);
          gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
          gl.useProgram(state.program);
          updateCompositionWebGLTextTexture(state);
          gl.uniform1i(uniforms.u_text, 0);
          gl.uniform2f(uniforms.u_resolution, state.canvas.width, state.canvas.height);
          var shaderTurn = (((compositionState.phase || 0) % 1) + 1) % 1;
          gl.uniform1f(uniforms.u_phase, shaderTurn * Math.PI * 2);
          gl.uniform1f(uniforms.u_mode, useFeedback ? 1 : 0);
          gl.uniform1f(uniforms.u_intensity, compositionState.macros.intensity);
          gl.uniform1f(uniforms.u_depth, compositionState.macros.depth);
          gl.uniform1f(uniforms.u_instability, compositionState.macros.instability);
          var feedback = compositionState.feedbackChamber;
          var optical = compositionState.cascade;
          gl.uniform1f(uniforms.u_zoom, useFeedback ? feedback.zoom : 0);
          gl.uniform1f(uniforms.u_rotation, (useFeedback ? feedback.rotation : optical.chromatic * 8) * Math.PI / 180);
          gl.uniform1f(uniforms.u_decay, useFeedback ? feedback.decay : 0.72);
          gl.uniform1f(uniforms.u_echoes, useFeedback ? Math.min(16, feedback.echoes) : Math.min(16, optical.contours));
          gl.uniform1f(uniforms.u_warp, useFeedback ? feedback.warpAmount : optical.warp);
          gl.uniform1f(uniforms.u_frequency, useFeedback ? 7 : optical.frequency);
          var colorA = webglHexColor(params.ink), colorB = webglHexColor(params.accent), colorC = webglHexColor(compositionState.color2);
          gl.uniform3fv(uniforms.u_colorA, colorA); gl.uniform3fv(uniforms.u_colorB, colorB); gl.uniform3fv(uniforms.u_colorC, colorC);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          return {
            kind: 'raster', source: state.canvas, x: 0, y: 0,
            w: scene.width, h: scene.height,
            opacity: useFeedback ? 0.82 : 0.72,
            blend: useFeedback ? 'screen' : 'difference',
            webgl: true
          };
        } catch (error) {
          if(error.code==='RENDER_BUDGET_EXCEEDED')throw error;
          compositionWebGLState.available = false;
          return null;
        }
      }

      function applyCompositionFxRack(scene, width, height, qualityMode) {
        if (!scene || !compositionState || !compositionState.enabled) return scene;
        if (scene._v6FxApplied) return scene;
        scene.glyphs = scene.glyphs || [];
        scene.bands = scene.bands || [];
        scene.width = Math.max(1, width || scene.width || 1);
        scene.height = Math.max(1, height || scene.height || 1);
        var budget = compositionFxBudget(qualityMode);
        // Contractually fixed order:
        // Engine → Echo/Trail → Feedback → Signal Mask →
        // Chromatic Split → Raster Material → Output.
        applyEchoTrailFx(scene, compositionFxModule('echoTrail', ['echo', 'trail']), budget);
        applyFeedbackFx(scene, compositionFxModule('feedback'), budget);
        applySignalMaskFx(scene, compositionFxModule('signalMask', ['mask']));
        applyChromaticSplitFx(scene, compositionFxModule('chromaticSplit', ['chromatic']), budget);
        applyRasterMaterialFx(scene, compositionFxModule('rasterMaterial', ['raster']), budget);
        enforceCompositionPrimitiveBudget(scene, budget);
        var webglBand = renderCompositionWebGLPass(scene);
        if (webglBand) scene.bands.unshift(webglBand);
        scene.fxOrder = ['echoTrail', 'feedback', 'signalMask', 'chromaticSplit', 'rasterMaterial'];
        scene._v6FxApplied = true;
        return scene;
      }

      var renderCompositionGenerators = {field:generateFieldScene, fluxRows:generateFluxScene, cascade:generateCascadeScene, contourAtlas:generateContourAtlasScene, feedbackChamber:generateFeedbackChamberScene, typeMatrix:generateTypeMatrixScene, pathLoom:generatePathLoomScene, glyphVessel:generateGlyphVesselScene};

      function evaluateCompositionScene(width, height, qualityMode, sourceGlyphs) {
        width = Math.max(1, width); height = Math.max(1, height);
        compositionScene.width = width; compositionScene.height = height;
        var previousOverride = compositionQualityOverride;
        if (['high', 'normal', 'performance'].indexOf(qualityMode) !== -1) compositionQualityOverride = qualityMode;
        try {
          var compiled = compileCompositionSource(sourceGlyphs, width, height, compositionState);
          if (!compiled.tokens.length) return { glyphs: [], bands: [], width: width, height: height, limited: false, masks: [], rasterPasses: [] };
          compiled.quality = compositionEffectiveQuality();
          var generator = renderCompositionGenerators[compositionState.type] || renderCompositionGenerators.field;
          var generated = generator(compiled.tokens, width, height, compiled);
          generated.glyphs = generated.glyphs || []; generated.bands = generated.bands || [];
          generated.masks = generated.masks || []; generated.rasterPasses = generated.rasterPasses || [];
          generated = applyCompositionSignalRouter(generated, compiled, width, height);
          generated = applyCompositionLegibility(generated);
          generated.width = width; generated.height = height;
          generated.engine = compositionState.type; generated.clock = compiled.clock;
          return generated;
        } finally { compositionQualityOverride = previousOverride; }
      }
