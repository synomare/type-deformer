import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(root, 'index.html');
const packagePath = path.join(root, 'package.json');
const validatePath = path.join(root, 'scripts', 'validate.mjs');

function replaceOnce(source, needle, replacement, label) {
  const index = source.indexOf(needle);
  if (index < 0) throw new Error(`Patch anchor not found: ${label}`);
  const duplicate = source.indexOf(needle, index + needle.length);
  if (duplicate >= 0) throw new Error(`Patch anchor is ambiguous: ${label}`);
  return source.slice(0, index) + replacement + source.slice(index + needle.length);
}

let html = fs.readFileSync(indexPath, 'utf8');

const animatorCss = String.raw`
    .text-animator-panel { position: relative; }
    .text-animator-master {
      padding: 0.7rem;
      border: 1px solid var(--ink);
      background: color-mix(in srgb, var(--paper) 76%, transparent);
    }
    .text-animator-master .row:first-child { margin-top: 0; }
    .text-animator-master .row:last-child { margin-bottom: 0; }
    .text-animator-transport {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      gap: 0.4rem;
      align-items: center;
      margin: 0.65rem 0;
    }
    .text-animator-transport button { min-width: 4rem; box-shadow: none; }
    .text-animator-stack {
      display: grid;
      grid-template-columns: minmax(0, 1fr) repeat(3, auto);
      gap: 0.35rem;
      align-items: stretch;
      margin: 0.55rem 0;
    }
    .text-animator-stack button { min-width: 0; padding-inline: 0.55rem; box-shadow: none; }
    .text-animator-status {
      min-height: 1.5em;
      margin: 0.55rem 0 0;
      color: var(--dim);
      font-size: 0.52rem;
      line-height: 1.5;
      letter-spacing: 0.04em;
    }
    .text-animator-status[data-state="active"] { color: var(--red); }
    .text-animator-panel details {
      margin: 0;
      border-top: 1px solid var(--line);
    }
    .text-animator-panel details:last-of-type { border-bottom: 1px solid var(--line); }
    .text-animator-panel details > summary {
      min-height: 2.5rem;
      display: flex;
      align-items: center;
      cursor: pointer;
      list-style: none;
      color: var(--ink);
      font-size: 0.56rem;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .text-animator-panel details > summary::-webkit-details-marker { display: none; }
    .text-animator-panel details > summary::after {
      content: "+";
      margin-left: auto;
      color: var(--red);
      font-size: 0.8rem;
    }
    .text-animator-panel details[open] > summary { color: var(--red); }
    .text-animator-panel details[open] > summary::after { content: "−"; }
    .text-animator-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 0 0.7rem;
      padding-bottom: 0.65rem;
    }
    .text-animator-grid .row { min-width: 0; }
    .text-animator-grid .wide { grid-column: 1 / -1; }
    .text-animator-presets {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.35rem;
      margin: 0.7rem 0;
    }
    .text-animator-presets button { min-width: 0; box-shadow: none; }
    .text-animator-reset { width: 100%; box-shadow: none; }
    .stage.text-animator-active .c,
    .stage.many.text-animator-active .c {
      animation: none;
      opacity: var(--ta-opacity, 1);
      translate: 0 0;
      scale: 1;
      filter: blur(var(--ta-blur, 0px)) hue-rotate(var(--ta-hue, 0deg));
    }
    @media (max-width: 760px) {
      .text-animator-grid { grid-template-columns: minmax(0, 1fr); }
      .text-animator-grid .wide { grid-column: auto; }
      .text-animator-stack { grid-template-columns: minmax(0, 1fr) repeat(3, 44px); }
      .text-animator-presets { grid-template-columns: minmax(0, 1fr); }
      .text-animator-panel details > summary { min-height: 44px; }
    }
`;

html = replaceOnce(
  html,
  `    .composition-block-head .jp {\n      margin-left: auto;\n      color: var(--dim);\n      font-family: var(--jp);\n      letter-spacing: 0.14em;\n      text-transform: none;\n    }\n    .composition-engine-meta {`,
  `    .composition-block-head .jp {\n      margin-left: auto;\n      color: var(--dim);\n      font-family: var(--jp);\n      letter-spacing: 0.14em;\n      text-transform: none;\n    }${animatorCss}\n    .composition-engine-meta {`,
  'text animator CSS insertion'
);

const animatorHtml = String.raw`
      <div class="composition-block text-animator-panel" id="textAnimatorPanel">
        <div class="composition-block-head"><span class="index">03</span><span>Text Animator</span><span class="jp">文字アニメータ</span></div>
        <p class="composition-subnote">After Effects型のSelector × Transform × Motionを、文字・単語・行単位で積層します。現在の文字変形、Composition、PNG / SVG / video出力へ同じ結果を渡します。</p>
        <div class="text-animator-master">
          <div class="row"><label for="pTextAnimatorEnabled">Enable stack</label><input type="checkbox" id="pTextAnimatorEnabled"></div>
          <div class="text-animator-transport">
            <input type="range" id="pTextAnimatorPhase" min="0" max="1" step="0.001" value="0" aria-label="Text animator phase">
            <span class="val" id="vTextAnimatorPhase">0.000</span>
            <button type="button" id="btnTextAnimatorPlay">Play</button>
          </div>
          <div class="text-animator-stack">
            <select id="pTextAnimatorLayer" aria-label="Active text animator"></select>
            <button type="button" id="btnTextAnimatorAdd" title="Add animator">＋</button>
            <button type="button" id="btnTextAnimatorDuplicate" title="Duplicate animator">⧉</button>
            <button type="button" id="btnTextAnimatorDelete" title="Delete animator">−</button>
          </div>
          <div class="row"><label for="pTextAnimatorLayerEnabled">Animator enabled</label><input type="checkbox" id="pTextAnimatorLayerEnabled" checked></div>
          <p class="text-animator-status" id="textAnimatorStatus" role="status" aria-live="polite">Text Animator off</p>
        </div>

        <details open>
          <summary>Selector / Range</summary>
          <div class="text-animator-grid">
            <div class="row"><label for="pTextAnimatorBasis">Based on</label><select id="pTextAnimatorBasis"><option value="character" selected>Characters</option><option value="word">Words</option><option value="line">Lines</option></select></div>
            <div class="row"><label for="pTextAnimatorShape">Shape</label><select id="pTextAnimatorShape"><option value="smooth" selected>Smooth</option><option value="square">Square</option><option value="rampUp">Ramp Up</option><option value="rampDown">Ramp Down</option><option value="triangle">Triangle</option></select></div>
            <div class="row wide"><label for="pTextAnimatorStart">Start</label><input type="range" id="pTextAnimatorStart" min="0" max="100" step="1" value="0"><span class="val" id="vTextAnimatorStart">0%</span></div>
            <div class="row wide"><label for="pTextAnimatorEnd">End</label><input type="range" id="pTextAnimatorEnd" min="0" max="100" step="1" value="100"><span class="val" id="vTextAnimatorEnd">100%</span></div>
            <div class="row wide"><label for="pTextAnimatorOffset">Offset</label><input type="range" id="pTextAnimatorOffset" min="-200" max="200" step="1" value="0"><span class="val" id="vTextAnimatorOffset">0%</span></div>
            <div class="row wide"><label for="pTextAnimatorEase">Ease</label><input type="range" id="pTextAnimatorEase" min="0" max="1" step="0.01" value="0.65"><span class="val" id="vTextAnimatorEase">0.65</span></div>
            <div class="row"><label for="pTextAnimatorRandomize">Random order</label><input type="checkbox" id="pTextAnimatorRandomize"></div>
            <div class="row"><label for="pTextAnimatorInvert">Invert</label><input type="checkbox" id="pTextAnimatorInvert"></div>
            <div class="row wide"><label for="pTextAnimatorSeed">Seed</label><input type="range" id="pTextAnimatorSeed" min="-999" max="999" step="1" value="1"><span class="val" id="vTextAnimatorSeed">1</span></div>
          </div>
        </details>

        <details open>
          <summary>Transform</summary>
          <div class="text-animator-grid">
            <div class="row wide"><label for="pTextAnimatorX">Position X</label><input type="range" id="pTextAnimatorX" min="-800" max="800" step="1" value="0"><span class="val" id="vTextAnimatorX">0px</span></div>
            <div class="row wide"><label for="pTextAnimatorY">Position Y</label><input type="range" id="pTextAnimatorY" min="-800" max="800" step="1" value="0"><span class="val" id="vTextAnimatorY">0px</span></div>
            <div class="row wide"><label for="pTextAnimatorRotation">Rotation</label><input type="range" id="pTextAnimatorRotation" min="-360" max="360" step="1" value="0"><span class="val" id="vTextAnimatorRotation">0°</span></div>
            <div class="row wide"><label for="pTextAnimatorScaleX">Scale X</label><input type="range" id="pTextAnimatorScaleX" min="1" max="400" step="1" value="100"><span class="val" id="vTextAnimatorScaleX">100%</span></div>
            <div class="row wide"><label for="pTextAnimatorScaleY">Scale Y</label><input type="range" id="pTextAnimatorScaleY" min="1" max="400" step="1" value="100"><span class="val" id="vTextAnimatorScaleY">100%</span></div>
            <div class="row wide"><label for="pTextAnimatorSkewX">Skew</label><input type="range" id="pTextAnimatorSkewX" min="-85" max="85" step="1" value="0"><span class="val" id="vTextAnimatorSkewX">0°</span></div>
            <div class="row wide"><label for="pTextAnimatorOpacity">Opacity</label><input type="range" id="pTextAnimatorOpacity" min="0" max="100" step="1" value="100"><span class="val" id="vTextAnimatorOpacity">100%</span></div>
            <div class="row wide"><label for="pTextAnimatorBlur">Blur</label><input type="range" id="pTextAnimatorBlur" min="0" max="40" step="0.5" value="0"><span class="val" id="vTextAnimatorBlur">0.0px</span></div>
            <div class="row wide"><label for="pTextAnimatorHue">Hue</label><input type="range" id="pTextAnimatorHue" min="-360" max="360" step="1" value="0"><span class="val" id="vTextAnimatorHue">0°</span></div>
          </div>
        </details>

        <details open>
          <summary>Motion / Wiggly</summary>
          <div class="text-animator-grid">
            <div class="row"><label for="pTextAnimatorMotionEnabled">Motion</label><input type="checkbox" id="pTextAnimatorMotionEnabled"></div>
            <div class="row"><label for="pTextAnimatorWaveform">Wave</label><select id="pTextAnimatorWaveform"><option value="sine" selected>Sine</option><option value="triangle">Triangle</option><option value="saw">Saw</option><option value="square">Square</option><option value="randomHold">Random Hold</option></select></div>
            <div class="row wide"><label for="pTextAnimatorSpeed">Playback rate</label><input type="range" id="pTextAnimatorSpeed" min="-4" max="4" step="0.01" value="0.25"><span class="val" id="vTextAnimatorSpeed">0.25×</span></div>
            <div class="row wide"><label for="pTextAnimatorCycles">Cycles</label><input type="range" id="pTextAnimatorCycles" min="0.05" max="12" step="0.05" value="1"><span class="val" id="vTextAnimatorCycles">1.00</span></div>
            <div class="row wide"><label for="pTextAnimatorStagger">Stagger</label><input type="range" id="pTextAnimatorStagger" min="-1" max="1" step="0.01" value="0.08"><span class="val" id="vTextAnimatorStagger">0.08</span></div>
            <div class="row wide"><label for="pTextAnimatorAmount">Motion amount</label><input type="range" id="pTextAnimatorAmount" min="0" max="1" step="0.01" value="1"><span class="val" id="vTextAnimatorAmount">1.00</span></div>
            <div class="row"><label for="pTextAnimatorWiggleEnabled">Wiggly</label><input type="checkbox" id="pTextAnimatorWiggleEnabled"></div>
            <div class="row wide"><label for="pTextAnimatorWiggleFrequency">Wiggle frequency</label><input type="range" id="pTextAnimatorWiggleFrequency" min="0.05" max="12" step="0.05" value="1.4"><span class="val" id="vTextAnimatorWiggleFrequency">1.40</span></div>
            <div class="row wide"><label for="pTextAnimatorWigglePosition">Position wiggle</label><input type="range" id="pTextAnimatorWigglePosition" min="0" max="240" step="1" value="0"><span class="val" id="vTextAnimatorWigglePosition">0px</span></div>
            <div class="row wide"><label for="pTextAnimatorWiggleRotation">Rotation wiggle</label><input type="range" id="pTextAnimatorWiggleRotation" min="0" max="180" step="1" value="0"><span class="val" id="vTextAnimatorWiggleRotation">0°</span></div>
            <div class="row wide"><label for="pTextAnimatorWiggleScale">Scale wiggle</label><input type="range" id="pTextAnimatorWiggleScale" min="0" max="160" step="1" value="0"><span class="val" id="vTextAnimatorWiggleScale">0%</span></div>
          </div>
        </details>

        <div class="text-animator-presets" aria-label="Text animator presets">
          <button type="button" data-text-animator-preset="cascadeReveal">Cascade Reveal</button>
          <button type="button" data-text-animator-preset="kineticWave">Kinetic Wave</button>
          <button type="button" data-text-animator-preset="rubberType">Rubber Type</button>
          <button type="button" data-text-animator-preset="signalRupture">Signal Rupture</button>
        </div>
        <button type="button" class="text-animator-reset" id="btnTextAnimatorReset">Reset active animator</button>
      </div>

`;

html = replaceOnce(
  html,
  `        </div>\n      </div>\n\n      <div class="composition-block">\n        <div class="composition-block-head"><span class="index">03</span><span>Build</span><span class="jp">構築</span></div>`,
  `        </div>\n      </div>\n\n${animatorHtml}      <div class="composition-block">\n        <div class="composition-block-head"><span class="index">04</span><span>Build</span><span class="jp">構築</span></div>`,
  'text animator panel insertion'
);
html = replaceOnce(html, '<span class="index">04</span><span>FX Rack</span>', '<span class="index">05</span><span>FX Rack</span>', 'FX Rack renumber');
html = replaceOnce(html, '<span class="index">05</span><span>Output</span>', '<span class="index">06</span><span>Output</span>', 'Output renumber');

html = replaceOnce(
  html,
  `  <div id="editHud" hidden></div>\n\n  <script>\n    (function () {`,
  `  <div id="editHud" hidden></div>\n\n  <script src="text-animator.js"></script>\n  <script>\n    (function () {`,
  'text animator script tag'
);

html = replaceOnce(
  html,
  `      --op-rotate: 0deg; --op-skew-x: 0deg; --op-skew-y: 0deg;\n      --op-mirror-x: 1; --op-mirror-y: 1;\n      transform:\n        translateX(var(--tx, 0)) translateY(var(--ty, 0))\n        translateX(var(--op-baseline-x)) translateY(var(--op-baseline-y))\n        translateX(var(--op-blob-x)) translateY(var(--op-blob-y))\n        translateX(var(--op-mosh-x)) translateY(var(--op-mosh-y))\n        rotate(var(--rot, 0deg)) rotate(var(--op-rotate))\n        skew(var(--op-skew-x), var(--op-skew-y))\n        scale(var(--op-mirror-x), var(--op-mirror-y))\n        scale(var(--op-blob-scale))\n        scale(var(--op-mosh-scale-x), var(--op-mosh-scale-y))\n        scale(var(--sx, 1), var(--sy, 1)) scale(var(--ix, 1), var(--iy, 1));`,
  `      --op-rotate: 0deg; --op-skew-x: 0deg; --op-skew-y: 0deg;\n      --op-mirror-x: 1; --op-mirror-y: 1;\n      --ta-x: 0px; --ta-y: 0px; --ta-rotation: 0deg;\n      --ta-skew-x: 0deg; --ta-skew-y: 0deg;\n      --ta-scale-x: 1; --ta-scale-y: 1; --ta-opacity: 1;\n      --ta-blur: 0px; --ta-hue: 0deg;\n      transform:\n        translateX(var(--tx, 0)) translateY(var(--ty, 0))\n        translateX(var(--ta-x)) translateY(var(--ta-y))\n        translateX(var(--op-baseline-x)) translateY(var(--op-baseline-y))\n        translateX(var(--op-blob-x)) translateY(var(--op-blob-y))\n        translateX(var(--op-mosh-x)) translateY(var(--op-mosh-y))\n        rotate(var(--rot, 0deg)) rotate(var(--op-rotate)) rotate(var(--ta-rotation))\n        skew(var(--op-skew-x), var(--op-skew-y))\n        skew(var(--ta-skew-x), var(--ta-skew-y))\n        scale(var(--ta-scale-x), var(--ta-scale-y))\n        scale(var(--op-mirror-x), var(--op-mirror-y))\n        scale(var(--op-blob-scale))\n        scale(var(--op-mosh-scale-x), var(--op-mosh-scale-y))\n        scale(var(--sx, 1), var(--sy, 1)) scale(var(--ix, 1), var(--iy, 1));`,
  'glyph transform stack'
);

html = replaceOnce(
  html,
  `        videoFormat: 'auto',\n        gridEnabled: false,`,
  `        videoFormat: 'auto',\n        textAnimator: window.TypeDeformerTextAnimator.defaultState(),\n        gridEnabled: false,`,
  'text animator project state'
);

const integrationBlock = String.raw`
      var textAnimatorEngine = window.TypeDeformerTextAnimator;
      if (!textAnimatorEngine) throw new Error('Text Animator engine failed to load.');
      params.textAnimator = textAnimatorEngine.normalizeState(params.textAnimator);
      var textAnimatorItemsCache = null;
      var textAnimatorPlayRaf = null;
      var textAnimatorLastTime = 0;
      var textAnimatorIdCounter = 1;
      var textAnimatorUiBound = false;

      function mutableActiveTextAnimator() {
        params.textAnimator = textAnimatorEngine.normalizeState(params.textAnimator);
        for (var i = 0; i < params.textAnimator.animators.length; i++) {
          if (params.textAnimator.animators[i].id === params.textAnimator.activeAnimatorId) return params.textAnimator.animators[i];
        }
        params.textAnimator.activeAnimatorId = params.textAnimator.animators[0].id;
        return params.textAnimator.animators[0];
      }

      function rebuildTextAnimatorItems() {
        var indexByElement = new Map();
        for (var metricIndex = 0; metricIndex < metrics.length; metricIndex++) {
          indexByElement.set(metrics[metricIndex].el, metricIndex);
        }
        var items = new Array(metrics.length);
        var paragraphs = stage.querySelectorAll(':scope > p');
        var globalWord = -1;
        for (var lineIndex = 0; lineIndex < paragraphs.length; lineIndex++) {
          var paragraph = paragraphs[lineIndex];
          var inWord = false;
          for (var nodeIndex = 0; nodeIndex < paragraph.childNodes.length; nodeIndex++) {
            var node = paragraph.childNodes[nodeIndex];
            if (node.nodeType === 3) {
              if (/\s/.test(node.nodeValue || '')) inWord = false;
              continue;
            }
            if (!node.classList || !node.classList.contains('c')) continue;
            var characterIndex = indexByElement.get(node);
            if (characterIndex == null) continue;
            var batch = node.dataset.batch || '';
            if (!inWord) {
              globalWord++;
              inWord = true;
            }
            items[characterIndex] = {
              characterIndex: characterIndex,
              wordIndex: globalWord,
              lineIndex: lineIndex,
              sourceText: node.dataset.sourceText || node.textContent || ''
            };
            if (batch === 'punct') inWord = false;
          }
        }
        for (var fallbackIndex = 0; fallbackIndex < items.length; fallbackIndex++) {
          if (!items[fallbackIndex]) items[fallbackIndex] = {
            characterIndex: fallbackIndex,
            wordIndex: fallbackIndex,
            lineIndex: 0,
            sourceText: metrics[fallbackIndex].el.dataset.sourceText || metrics[fallbackIndex].el.textContent || ''
          };
        }
        textAnimatorItemsCache = items;
        return items;
      }

      var TEXT_ANIMATOR_STYLE_PROPERTIES = [
        '--ta-x', '--ta-y', '--ta-rotation', '--ta-scale-x', '--ta-scale-y',
        '--ta-skew-x', '--ta-skew-y', '--ta-opacity', '--ta-blur', '--ta-hue'
      ];

      function clearTextAnimatorStyles() {
        stage.classList.remove('text-animator-active');
        for (var i = 0; i < metrics.length; i++) {
          for (var p = 0; p < TEXT_ANIMATOR_STYLE_PROPERTIES.length; p++) {
            metrics[i].el.style.removeProperty(TEXT_ANIMATOR_STYLE_PROPERTIES[p]);
          }
        }
        invalidateCompositionSource();
        scheduleVisualOverscan();
        scheduleCompositionDraw();
      }

      function updateTextAnimatorStatus() {
        var status = document.getElementById('textAnimatorStatus');
        if (!status || !params.textAnimator) return;
        var state = params.textAnimator;
        var active = mutableActiveTextAnimator();
        var enabledCount = 0;
        for (var i = 0; i < state.animators.length; i++) if (state.animators[i].enabled) enabledCount++;
        status.dataset.state = state.enabled ? 'active' : 'idle';
        status.textContent = state.enabled
          ? 'STACK ON · ' + state.animators.length + ' animator' + (state.animators.length === 1 ? '' : 's')
            + ' · ' + enabledCount + ' enabled · ' + active.name + ' · ' + active.selector.basis
            + (textAnimatorPlayRaf !== null ? ' · PLAYING' : '')
          : 'Text Animator off · settings are preserved';
      }

      function applyTextAnimatorFrame(phase) {
        params.textAnimator = textAnimatorEngine.normalizeState(params.textAnimator);
        var state = params.textAnimator;
        if (!metrics.length) return;
        if (!state.enabled) {
          clearTextAnimatorStyles();
          updateTextAnimatorStatus();
          updateVideoExportAvailability();
          return;
        }
        var items = textAnimatorItemsCache && textAnimatorItemsCache.length === metrics.length
          ? textAnimatorItemsCache : rebuildTextAnimatorItems();
        var results = textAnimatorEngine.evaluateStack(state, items, phase == null ? state.phase : phase);
        stage.classList.add('text-animator-active');
        for (var i = 0; i < metrics.length; i++) {
          var value = results[i];
          var style = metrics[i].el.style;
          style.setProperty('--ta-x', value.x.toFixed(3) + 'px');
          style.setProperty('--ta-y', value.y.toFixed(3) + 'px');
          style.setProperty('--ta-rotation', value.rotation.toFixed(3) + 'deg');
          style.setProperty('--ta-scale-x', value.scaleX.toFixed(5));
          style.setProperty('--ta-scale-y', value.scaleY.toFixed(5));
          style.setProperty('--ta-skew-x', value.skewX.toFixed(3) + 'deg');
          style.setProperty('--ta-skew-y', value.skewY.toFixed(3) + 'deg');
          style.setProperty('--ta-opacity', value.opacity.toFixed(5));
          style.setProperty('--ta-blur', value.blur.toFixed(3) + 'px');
          style.setProperty('--ta-hue', value.hue.toFixed(3) + 'deg');
        }
        invalidateCompositionSource();
        scheduleVisualOverscan();
        scheduleCompositionDraw();
        scheduleEffectStatusUpdate();
        updateTextAnimatorStatus();
        updateVideoExportAvailability();
      }

      function syncTextAnimatorPhaseUI() {
        var input = document.getElementById('pTextAnimatorPhase');
        var output = document.getElementById('vTextAnimatorPhase');
        if (input) input.value = params.textAnimator.phase;
        if (output) output.textContent = params.textAnimator.phase.toFixed(3);
      }

      function textAnimatorPlaybackSpeed() {
        return mutableActiveTextAnimator().motion.speed;
      }

      function setTextAnimatorPlaying(playing) {
        if (!params.textAnimator.enabled) playing = false;
        if (!playing && textAnimatorPlayRaf !== null) {
          cancelAnimationFrame(textAnimatorPlayRaf);
          textAnimatorPlayRaf = null;
          textAnimatorLastTime = 0;
          markAutosaveDirty();
          if (typeof scheduleAutosave === 'function') scheduleAutosave();
        }
        var button = document.getElementById('btnTextAnimatorPlay');
        if (button) {
          button.setAttribute('aria-pressed', String(playing));
          button.textContent = playing ? 'Pause' : 'Play';
        }
        if (playing && textAnimatorPlayRaf === null) {
          textAnimatorLastTime = 0;
          textAnimatorPlayRaf = requestAnimationFrame(function tick(now) {
            if (textAnimatorPlayRaf === null || !params.textAnimator.enabled) return;
            if (!textAnimatorLastTime) textAnimatorLastTime = now;
            var delta = Math.min(0.1, Math.max(0, (now - textAnimatorLastTime) / 1000));
            textAnimatorLastTime = now;
            params.textAnimator.phase = (params.textAnimator.phase + delta * textAnimatorPlaybackSpeed() + 1) % 1;
            syncTextAnimatorPhaseUI();
            applyTextAnimatorFrame(params.textAnimator.phase);
            textAnimatorPlayRaf = requestAnimationFrame(tick);
          });
        }
        updateTextAnimatorStatus();
      }

      var TEXT_ANIMATOR_RANGE_SPECS = [
        ['pTextAnimatorStart', 'vTextAnimatorStart', 'selector.start', 0, '%'],
        ['pTextAnimatorEnd', 'vTextAnimatorEnd', 'selector.end', 0, '%'],
        ['pTextAnimatorOffset', 'vTextAnimatorOffset', 'selector.offset', 0, '%'],
        ['pTextAnimatorEase', 'vTextAnimatorEase', 'selector.ease', 2, ''],
        ['pTextAnimatorSeed', 'vTextAnimatorSeed', 'selector.seed', 0, ''],
        ['pTextAnimatorX', 'vTextAnimatorX', 'transform.x', 0, 'px'],
        ['pTextAnimatorY', 'vTextAnimatorY', 'transform.y', 0, 'px'],
        ['pTextAnimatorRotation', 'vTextAnimatorRotation', 'transform.rotation', 0, '°'],
        ['pTextAnimatorScaleX', 'vTextAnimatorScaleX', 'transform.scaleX', 0, '%'],
        ['pTextAnimatorScaleY', 'vTextAnimatorScaleY', 'transform.scaleY', 0, '%'],
        ['pTextAnimatorSkewX', 'vTextAnimatorSkewX', 'transform.skewX', 0, '°'],
        ['pTextAnimatorOpacity', 'vTextAnimatorOpacity', 'transform.opacity', 0, '%'],
        ['pTextAnimatorBlur', 'vTextAnimatorBlur', 'transform.blur', 1, 'px'],
        ['pTextAnimatorHue', 'vTextAnimatorHue', 'transform.hue', 0, '°'],
        ['pTextAnimatorSpeed', 'vTextAnimatorSpeed', 'motion.speed', 2, '×'],
        ['pTextAnimatorCycles', 'vTextAnimatorCycles', 'motion.cycles', 2, ''],
        ['pTextAnimatorStagger', 'vTextAnimatorStagger', 'motion.stagger', 2, ''],
        ['pTextAnimatorAmount', 'vTextAnimatorAmount', 'motion.amount', 2, ''],
        ['pTextAnimatorWiggleFrequency', 'vTextAnimatorWiggleFrequency', 'wiggle.frequency', 2, ''],
        ['pTextAnimatorWigglePosition', 'vTextAnimatorWigglePosition', 'wiggle.position', 0, 'px'],
        ['pTextAnimatorWiggleRotation', 'vTextAnimatorWiggleRotation', 'wiggle.rotation', 0, '°'],
        ['pTextAnimatorWiggleScale', 'vTextAnimatorWiggleScale', 'wiggle.scale', 0, '%']
      ];

      function animatorPathValue(animator, path) {
        var parts = path.split('.');
        return animator[parts[0]][parts[1]];
      }

      function setAnimatorPathValue(animator, path, value) {
        var parts = path.split('.');
        animator[parts[0]][parts[1]] = value;
      }

      function populateTextAnimatorLayers() {
        var select = document.getElementById('pTextAnimatorLayer');
        if (!select) return;
        var state = params.textAnimator;
        select.textContent = '';
        for (var i = 0; i < state.animators.length; i++) {
          var option = document.createElement('option');
          option.value = state.animators[i].id;
          option.textContent = (i + 1) + ' · ' + state.animators[i].name + (state.animators[i].enabled ? '' : ' (off)');
          select.appendChild(option);
        }
        select.value = state.activeAnimatorId;
      }

      function syncTextAnimatorUI() {
        params.textAnimator = textAnimatorEngine.normalizeState(params.textAnimator);
        var state = params.textAnimator;
        var animator = mutableActiveTextAnimator();
        var master = document.getElementById('pTextAnimatorEnabled');
        if (!master) return;
        master.checked = state.enabled;
        document.getElementById('pTextAnimatorLayerEnabled').checked = animator.enabled;
        populateTextAnimatorLayers();
        document.getElementById('pTextAnimatorBasis').value = animator.selector.basis;
        document.getElementById('pTextAnimatorShape').value = animator.selector.shape;
        document.getElementById('pTextAnimatorRandomize').checked = animator.selector.randomize;
        document.getElementById('pTextAnimatorInvert').checked = animator.selector.invert;
        document.getElementById('pTextAnimatorMotionEnabled').checked = animator.motion.enabled;
        document.getElementById('pTextAnimatorWaveform').value = animator.motion.waveform;
        document.getElementById('pTextAnimatorWiggleEnabled').checked = animator.wiggle.enabled;
        for (var i = 0; i < TEXT_ANIMATOR_RANGE_SPECS.length; i++) {
          var spec = TEXT_ANIMATOR_RANGE_SPECS[i];
          var value = animatorPathValue(animator, spec[2]);
          var input = document.getElementById(spec[0]);
          var output = document.getElementById(spec[1]);
          if (input) input.value = value;
          if (output) output.textContent = Number(value).toFixed(spec[3]) + spec[4];
        }
        syncTextAnimatorPhaseUI();
        var play = document.getElementById('btnTextAnimatorPlay');
        if (play) {
          play.disabled = !state.enabled;
          play.textContent = textAnimatorPlayRaf !== null ? 'Pause' : 'Play';
          play.setAttribute('aria-pressed', String(textAnimatorPlayRaf !== null));
        }
        document.getElementById('btnTextAnimatorDelete').disabled = state.animators.length <= 1;
        document.getElementById('btnTextAnimatorAdd').disabled = state.animators.length >= textAnimatorEngine.maxAnimators;
        updateTextAnimatorStatus();
        scheduleParameterUIRefresh();
      }

      function commitTextAnimatorChange(resync) {
        params.textAnimator = textAnimatorEngine.normalizeState(params.textAnimator);
        markAutosaveDirty();
        if (resync !== false) syncTextAnimatorUI();
        applyTextAnimatorFrame(params.textAnimator.phase);
      }

      function bindTextAnimatorUI() {
        if (textAnimatorUiBound || !document.getElementById('textAnimatorPanel')) return;
        textAnimatorUiBound = true;
        document.getElementById('pTextAnimatorEnabled').addEventListener('change', function (event) {
          pushHistory();
          params.textAnimator.enabled = event.target.checked;
          if (!params.textAnimator.enabled) setTextAnimatorPlaying(false);
          commitTextAnimatorChange();
        });
        document.getElementById('pTextAnimatorLayer').addEventListener('change', function (event) {
          params.textAnimator.activeAnimatorId = event.target.value;
          syncTextAnimatorUI();
        });
        document.getElementById('pTextAnimatorLayerEnabled').addEventListener('change', function (event) {
          pushHistory();
          mutableActiveTextAnimator().enabled = event.target.checked;
          commitTextAnimatorChange();
        });
        document.getElementById('btnTextAnimatorAdd').addEventListener('click', function () {
          params.textAnimator = textAnimatorEngine.normalizeState(params.textAnimator);
          if (params.textAnimator.animators.length >= textAnimatorEngine.maxAnimators) return;
          pushHistory();
          textAnimatorIdCounter++;
          var id = 'animator-' + Date.now().toString(36) + '-' + textAnimatorIdCounter;
          var animator = textAnimatorEngine.defaultAnimator('Animator ' + (params.textAnimator.animators.length + 1), id);
          params.textAnimator.animators.push(animator);
          params.textAnimator.activeAnimatorId = id;
          params.textAnimator.enabled = true;
          commitTextAnimatorChange();
        });
        document.getElementById('btnTextAnimatorDuplicate').addEventListener('click', function () {
          params.textAnimator = textAnimatorEngine.normalizeState(params.textAnimator);
          if (params.textAnimator.animators.length >= textAnimatorEngine.maxAnimators) return;
          pushHistory();
          var source = mutableActiveTextAnimator();
          var duplicate = JSON.parse(JSON.stringify(source));
          textAnimatorIdCounter++;
          duplicate.id = 'animator-' + Date.now().toString(36) + '-' + textAnimatorIdCounter;
          duplicate.name = (source.name + ' copy').slice(0, 40);
          params.textAnimator.animators.push(duplicate);
          params.textAnimator.activeAnimatorId = duplicate.id;
          params.textAnimator.enabled = true;
          commitTextAnimatorChange();
        });
        document.getElementById('btnTextAnimatorDelete').addEventListener('click', function () {
          params.textAnimator = textAnimatorEngine.normalizeState(params.textAnimator);
          if (params.textAnimator.animators.length <= 1) return;
          pushHistory();
          var activeId = params.textAnimator.activeAnimatorId;
          params.textAnimator.animators = params.textAnimator.animators.filter(function (animator) { return animator.id !== activeId; });
          params.textAnimator.activeAnimatorId = params.textAnimator.animators[0].id;
          commitTextAnimatorChange();
        });

        [
          ['pTextAnimatorBasis', 'selector.basis'],
          ['pTextAnimatorShape', 'selector.shape'],
          ['pTextAnimatorWaveform', 'motion.waveform']
        ].forEach(function (spec) {
          document.getElementById(spec[0]).addEventListener('change', function (event) {
            pushHistory();
            setAnimatorPathValue(mutableActiveTextAnimator(), spec[1], event.target.value);
            commitTextAnimatorChange();
          });
        });
        [
          ['pTextAnimatorRandomize', 'selector.randomize'],
          ['pTextAnimatorInvert', 'selector.invert'],
          ['pTextAnimatorMotionEnabled', 'motion.enabled'],
          ['pTextAnimatorWiggleEnabled', 'wiggle.enabled']
        ].forEach(function (spec) {
          document.getElementById(spec[0]).addEventListener('change', function (event) {
            pushHistory();
            setAnimatorPathValue(mutableActiveTextAnimator(), spec[1], event.target.checked);
            commitTextAnimatorChange();
          });
        });

        for (var rangeIndex = 0; rangeIndex < TEXT_ANIMATOR_RANGE_SPECS.length; rangeIndex++) {
          (function (spec) {
            var input = document.getElementById(spec[0]);
            var historyOpen = false;
            function beginHistory() {
              if (historyOpen) return;
              pushHistory();
              historyOpen = true;
            }
            input.addEventListener('pointerdown', beginHistory);
            input.addEventListener('keydown', beginHistory);
            input.addEventListener('pointerup', function () { historyOpen = false; });
            input.addEventListener('change', function () { historyOpen = false; });
            input.addEventListener('input', function () {
              setAnimatorPathValue(mutableActiveTextAnimator(), spec[2], Number(input.value));
              var output = document.getElementById(spec[1]);
              if (output) output.textContent = Number(input.value).toFixed(spec[3]) + spec[4];
              commitTextAnimatorChange(false);
            });
          })(TEXT_ANIMATOR_RANGE_SPECS[rangeIndex]);
        }

        document.getElementById('pTextAnimatorPhase').addEventListener('input', function (event) {
          params.textAnimator.phase = Number(event.target.value) || 0;
          syncTextAnimatorPhaseUI();
          applyTextAnimatorFrame(params.textAnimator.phase);
        });
        document.getElementById('pTextAnimatorPhase').addEventListener('change', markAutosaveDirty);
        document.getElementById('btnTextAnimatorPlay').addEventListener('click', function () {
          setTextAnimatorPlaying(textAnimatorPlayRaf === null);
        });
        Array.prototype.forEach.call(document.querySelectorAll('[data-text-animator-preset]'), function (button) {
          button.addEventListener('click', function () {
            pushHistory();
            params.textAnimator = textAnimatorEngine.applyPreset(
              params.textAnimator,
              button.dataset.textAnimatorPreset,
              params.textAnimator.activeAnimatorId
            );
            commitTextAnimatorChange();
          });
        });
        document.getElementById('btnTextAnimatorReset').addEventListener('click', function () {
          pushHistory();
          var active = mutableActiveTextAnimator();
          var replacement = textAnimatorEngine.defaultAnimator(active.name, active.id);
          for (var i = 0; i < params.textAnimator.animators.length; i++) {
            if (params.textAnimator.animators[i].id === active.id) params.textAnimator.animators[i] = replacement;
          }
          commitTextAnimatorChange();
        });
        syncTextAnimatorUI();
      }
`;

html = replaceOnce(
  html,
  `      };\n\n      var BATCH_PROFILE_KEYS = ['kanji', 'hira', 'kata', 'latin', 'digit', 'punct'];`,
  `      };\n${integrationBlock}\n      var BATCH_PROFILE_KEYS = ['kanji', 'hira', 'kata', 'latin', 'digit', 'punct'];`,
  'text animator runtime integration'
);

html = replaceOnce(
  html,
  `        chooseParam('videoFormat', ['auto', 'webm', 'mp4']);\n        chooseParam('mode', ['flow', 'lock', 'edit', 'grid']);`,
  `        chooseParam('videoFormat', ['auto', 'webm', 'mp4']);\n        params.textAnimator = textAnimatorEngine.normalizeState(params.textAnimator);\n        chooseParam('mode', ['flow', 'lock', 'edit', 'grid']);`,
  'text animator state normalization'
);

html = replaceOnce(
  html,
  `        rebuildMetrics();\n        if (params.gridEnabled) layoutGrid();`,
  `        rebuildMetrics();\n        rebuildTextAnimatorItems();\n        applyTextAnimatorFrame(params.textAnimator.phase);\n        if (params.gridEnabled) layoutGrid();`,
  'text rebuild animator refresh'
);
html = replaceOnce(
  html,
  `        syncMetricsSeeds(); // metrics were built from pre-carry dataset values\n        if (params.gridEnabled) layoutGrid();`,
  `        syncMetricsSeeds(); // metrics were built from pre-carry dataset values\n        rebuildTextAnimatorItems();\n        applyTextAnimatorFrame(params.textAnimator.phase);\n        if (params.gridEnabled) layoutGrid();`,
  'preserved text animator refresh'
);

html = replaceOnce(
  html,
  `        var sharedScale = ownNumber('--op-blob-scale', 1);\n        var sx = ownNumber('--sx', 1) * ownNumber('--ix', 1) * ownNumber('--op-mirror-x', 1) * sharedScale * ownNumber('--op-mosh-scale-x', 1);\n        var sy = ownNumber('--sy', 1) * ownNumber('--iy', 1) * ownNumber('--op-mirror-y', 1) * sharedScale * ownNumber('--op-mosh-scale-y', 1);\n        var rot = ((parseFloat(st.getPropertyValue('--rot')) || 0) + (parseFloat(st.getPropertyValue('--op-rotate')) || 0)) * Math.PI / 180;\n        var tanX = Math.tan((parseFloat(st.getPropertyValue('--op-skew-x')) || 0) * Math.PI / 180);\n        var tanY = Math.tan((parseFloat(st.getPropertyValue('--op-skew-y')) || 0) * Math.PI / 180);`,
  `        var sharedScale = ownNumber('--op-blob-scale', 1);\n        var sx = ownNumber('--sx', 1) * ownNumber('--ix', 1) * ownNumber('--ta-scale-x', 1) * ownNumber('--op-mirror-x', 1) * sharedScale * ownNumber('--op-mosh-scale-x', 1);\n        var sy = ownNumber('--sy', 1) * ownNumber('--iy', 1) * ownNumber('--ta-scale-y', 1) * ownNumber('--op-mirror-y', 1) * sharedScale * ownNumber('--op-mosh-scale-y', 1);\n        var rot = ((parseFloat(st.getPropertyValue('--rot')) || 0) + (parseFloat(st.getPropertyValue('--op-rotate')) || 0) + (parseFloat(st.getPropertyValue('--ta-rotation')) || 0)) * Math.PI / 180;\n        var tanX = Math.tan(((parseFloat(st.getPropertyValue('--op-skew-x')) || 0) + (parseFloat(st.getPropertyValue('--ta-skew-x')) || 0)) * Math.PI / 180);\n        var tanY = Math.tan(((parseFloat(st.getPropertyValue('--op-skew-y')) || 0) + (parseFloat(st.getPropertyValue('--ta-skew-y')) || 0)) * Math.PI / 180);`,
  'glyph matrix animator channels'
);

html = replaceOnce(
  html,
  `          var tx = ((parseFloat(st.getPropertyValue('--tx')) || 0)\n            + (parseFloat(st.getPropertyValue('--op-baseline-x')) || 0)) * params.fontSize\n            + (parseFloat(st.getPropertyValue('--op-blob-x')) || 0)\n            + (parseFloat(st.getPropertyValue('--op-mosh-x')) || 0);\n          var ty = ((parseFloat(st.getPropertyValue('--ty')) || 0)\n            + (parseFloat(st.getPropertyValue('--op-baseline-y')) || 0)) * params.fontSize\n            + (parseFloat(st.getPropertyValue('--op-blob-y')) || 0)\n            + (parseFloat(st.getPropertyValue('--op-mosh-y')) || 0);`,
  `          var tx = ((parseFloat(st.getPropertyValue('--tx')) || 0)\n            + (parseFloat(st.getPropertyValue('--op-baseline-x')) || 0)) * params.fontSize\n            + (parseFloat(st.getPropertyValue('--ta-x')) || 0)\n            + (parseFloat(st.getPropertyValue('--op-blob-x')) || 0)\n            + (parseFloat(st.getPropertyValue('--op-mosh-x')) || 0);\n          var ty = ((parseFloat(st.getPropertyValue('--ty')) || 0)\n            + (parseFloat(st.getPropertyValue('--op-baseline-y')) || 0)) * params.fontSize\n            + (parseFloat(st.getPropertyValue('--ta-y')) || 0)\n            + (parseFloat(st.getPropertyValue('--op-blob-y')) || 0)\n            + (parseFloat(st.getPropertyValue('--op-mosh-y')) || 0);`,
  'visual overscan animator translation'
);

html = replaceOnce(
  html,
  `          var tx = ((parseFloat(st.getPropertyValue('--tx')) || 0) + (parseFloat(st.getPropertyValue('--op-baseline-x')) || 0)) * fs\n            + (parseFloat(st.getPropertyValue('--op-blob-x')) || 0) + (parseFloat(st.getPropertyValue('--op-mosh-x')) || 0);\n          var ty = ((parseFloat(st.getPropertyValue('--ty')) || 0) + (parseFloat(st.getPropertyValue('--op-baseline-y')) || 0)) * fs\n            + (parseFloat(st.getPropertyValue('--op-blob-y')) || 0) + (parseFloat(st.getPropertyValue('--op-mosh-y')) || 0);`,
  `          var tx = ((parseFloat(st.getPropertyValue('--tx')) || 0) + (parseFloat(st.getPropertyValue('--op-baseline-x')) || 0)) * fs\n            + (parseFloat(st.getPropertyValue('--ta-x')) || 0)\n            + (parseFloat(st.getPropertyValue('--op-blob-x')) || 0) + (parseFloat(st.getPropertyValue('--op-mosh-x')) || 0);\n          var ty = ((parseFloat(st.getPropertyValue('--ty')) || 0) + (parseFloat(st.getPropertyValue('--op-baseline-y')) || 0)) * fs\n            + (parseFloat(st.getPropertyValue('--ta-y')) || 0)\n            + (parseFloat(st.getPropertyValue('--op-blob-y')) || 0) + (parseFloat(st.getPropertyValue('--op-mosh-y')) || 0);`,
  'pointer hit test animator translation'
);

html = replaceOnce(
  html,
  `          var blobScale = cssNumber(cs, '--op-blob-scale', 1);\n          var moshScaleX = cssNumber(cs, '--op-mosh-scale-x', 1);\n          var moshScaleY = cssNumber(cs, '--op-mosh-scale-y', 1);\n          var tx = (cssNumber(cs, '--tx', 0) + cssNumber(cs, '--op-baseline-x', 0)) * params.fontSize\n            + cssNumber(cs, '--op-blob-x', 0) + cssNumber(cs, '--op-mosh-x', 0); // em + px\n          var ty = (cssNumber(cs, '--ty', 0) + cssNumber(cs, '--op-baseline-y', 0)) * params.fontSize\n            + cssNumber(cs, '--op-blob-y', 0) + cssNumber(cs, '--op-mosh-y', 0);`,
  `          var blobScale = cssNumber(cs, '--op-blob-scale', 1);\n          var moshScaleX = cssNumber(cs, '--op-mosh-scale-x', 1);\n          var moshScaleY = cssNumber(cs, '--op-mosh-scale-y', 1);\n          var textAnimatorScaleX = cssNumber(cs, '--ta-scale-x', 1);\n          var textAnimatorScaleY = cssNumber(cs, '--ta-scale-y', 1);\n          var tx = (cssNumber(cs, '--tx', 0) + cssNumber(cs, '--op-baseline-x', 0)) * params.fontSize\n            + cssNumber(cs, '--ta-x', 0) + cssNumber(cs, '--op-blob-x', 0) + cssNumber(cs, '--op-mosh-x', 0); // em + px\n          var ty = (cssNumber(cs, '--ty', 0) + cssNumber(cs, '--op-baseline-y', 0)) * params.fontSize\n            + cssNumber(cs, '--ta-y', 0) + cssNumber(cs, '--op-blob-y', 0) + cssNumber(cs, '--op-mosh-y', 0);`,
  'export snapshot animator translation and scale'
);
html = replaceOnce(
  html,
  `          var rot = cssNumber(cs, '--rot', 0) + cssNumber(cs, '--op-rotate', 0); // deg\n          var skewX = cssNumber(cs, '--op-skew-x', 0);\n          var skewY = cssNumber(cs, '--op-skew-y', 0);`,
  `          var rot = cssNumber(cs, '--rot', 0) + cssNumber(cs, '--op-rotate', 0) + cssNumber(cs, '--ta-rotation', 0); // deg\n          var skewX = cssNumber(cs, '--op-skew-x', 0) + cssNumber(cs, '--ta-skew-x', 0);\n          var skewY = cssNumber(cs, '--op-skew-y', 0) + cssNumber(cs, '--ta-skew-y', 0);`,
  'export snapshot animator rotation'
);
html = replaceOnce(
  html,
  `            scaleX: sx * ix * mirrorX * blobScale * moshScaleX,\n            scaleY: sy * iy * mirrorY * blobScale * moshScaleY,`,
  `            scaleX: sx * ix * textAnimatorScaleX * mirrorX * blobScale * moshScaleX,\n            scaleY: sy * iy * textAnimatorScaleY * mirrorY * blobScale * moshScaleY,`,
  'export snapshot animator scale'
);

html = replaceOnce(
  html,
  `        return params.seed + '|' + arr.join(';') + '|F=' + fontSnapshot + '|C=' + encodeURIComponent(JSON.stringify(cloneCompositionState()));`,
  `        return params.seed + '|' + arr.join(';') + '|F=' + fontSnapshot\n          + '|A=' + encodeURIComponent(JSON.stringify(params.textAnimator))\n          + '|C=' + encodeURIComponent(JSON.stringify(cloneCompositionState()));`,
  'undo snapshot animator state'
);
html = replaceOnce(
  html,
  `        var fontMarker = body.lastIndexOf('|F=');\n        var encodedFont = '';`,
  `        var animatorMarker = body.lastIndexOf('|A=');\n        var encodedAnimator = '';\n        if (animatorMarker !== -1) {\n          encodedAnimator = body.slice(animatorMarker + 3);\n          body = body.slice(0, animatorMarker);\n        }\n        var fontMarker = body.lastIndexOf('|F=');\n        var encodedFont = '';`,
  'undo animator marker parsing'
);
html = replaceOnce(
  html,
  `        restoreStates(states);\n        if (encodedComposition) {`,
  `        restoreStates(states);\n        if (encodedAnimator) {\n          try { params.textAnimator = textAnimatorEngine.normalizeState(JSON.parse(decodeURIComponent(encodedAnimator))); }\n          catch (textAnimatorUndoError) { params.textAnimator = textAnimatorEngine.defaultState(); }\n          setTextAnimatorPlaying(false);\n          syncTextAnimatorUI();\n          applyTextAnimatorFrame(params.textAnimator.phase);\n        }\n        if (encodedComposition) {`,
  'undo animator restore'
);

html = replaceOnce(
  html,
  `        var compositionActive = compositionState.enabled;\n        var signature = params.activeOperator + '|' + active.map(function (item) {\n          return item.id + ':' + item.count;\n        }).join(',') + '|composition:' + (compositionActive ? compositionState.type + ':' + compositionScene.glyphs.length : 'off')`,
  `        var compositionActive = compositionState.enabled;\n        var textAnimatorActive = !!(params.textAnimator && params.textAnimator.enabled);\n        var signature = params.activeOperator + '|' + active.map(function (item) {\n          return item.id + ':' + item.count;\n        }).join(',') + '|textAnimator:' + (textAnimatorActive ? params.textAnimator.animators.length : 'off')\n          + '|composition:' + (compositionActive ? compositionState.type + ':' + compositionScene.glyphs.length : 'off')`,
  'effect inventory animator signature'
);
html = replaceOnce(
  html,
  `        empty.hidden = active.length > 0 || compositionActive;\n        total.textContent = (active.length + (compositionActive ? 1 : 0)) + ' / ' + (OPERATOR_IDS.length + 1);`,
  `        empty.hidden = active.length > 0 || compositionActive || textAnimatorActive;\n        total.textContent = (active.length + (textAnimatorActive ? 1 : 0) + (compositionActive ? 1 : 0)) + ' / ' + (OPERATOR_IDS.length + 2);`,
  'effect inventory animator count'
);
const animatorInventory = String.raw`
        if (textAnimatorActive) {
          var animatorRow = document.createElement('div');
          animatorRow.className = 'effect-status-row';
          var animatorSelect = document.createElement('button');
          animatorSelect.type = 'button';
          animatorSelect.className = 'effect-status-select';
          animatorSelect.setAttribute('aria-label', 'Focus Text Animator');
          var animatorName = document.createElement('span');
          animatorName.className = 'effect-status-name';
          animatorName.textContent = 'Text Animator';
          var animatorGlyphs = document.createElement('span');
          animatorGlyphs.className = 'effect-status-glyphs';
          animatorGlyphs.textContent = params.textAnimator.animators.length + ' stack';
          animatorSelect.appendChild(animatorName);
          animatorSelect.appendChild(animatorGlyphs);
          animatorSelect.addEventListener('click', function () {
            if (window.matchMedia && window.matchMedia('(max-width: 760px)').matches) openMobileSheet('compose', 'textAnimatorPanel');
            else {
              openDesktopSection('compose');
              requestAnimationFrame(function () {
                var panel = document.getElementById('textAnimatorPanel');
                if (panel) panel.scrollIntoView({ block: 'center', behavior: 'smooth' });
              });
            }
          });
          var animatorReset = document.createElement('button');
          animatorReset.type = 'button';
          animatorReset.className = 'effect-status-reset';
          animatorReset.textContent = 'Reset';
          animatorReset.setAttribute('aria-label', 'Reset Text Animator stack');
          animatorReset.addEventListener('click', function () {
            pushHistory();
            setTextAnimatorPlaying(false);
            params.textAnimator = textAnimatorEngine.defaultState();
            syncTextAnimatorUI();
            applyTextAnimatorFrame(0);
            markAutosaveDirty();
          });
          animatorRow.appendChild(animatorSelect);
          animatorRow.appendChild(animatorReset);
          list.appendChild(animatorRow);
        }
`;
html = replaceOnce(
  html,
  `        }\n        if (compositionActive) {\n          var compositionRow = document.createElement('div');`,
  `        }\n${animatorInventory}        if (compositionActive) {\n          var compositionRow = document.createElement('div');`,
  'effect inventory animator row'
);

html = replaceOnce(
  html,
  `        if (compositionState.enabled) changed = true;\n        if (!changed) return false;`,
  `        if (compositionState.enabled) changed = true;\n        if (params.textAnimator && params.textAnimator.enabled) changed = true;\n        if (!changed) return false;`,
  'reset all detects animator'
);
html = replaceOnce(
  html,
  `        compositionState = cloneCompositionDefaults();\n        compositionInspector = 'field';\n        setCompositionPlaying(false);\n        syncCompositionUI();`,
  `        compositionState = cloneCompositionDefaults();\n        compositionInspector = 'field';\n        setCompositionPlaying(false);\n        setTextAnimatorPlaying(false);\n        params.textAnimator = textAnimatorEngine.defaultState();\n        syncCompositionUI();\n        syncTextAnimatorUI();\n        applyTextAnimatorFrame(0);`,
  'reset all clears animator'
);

html = replaceOnce(
  html,
  `        syncCompositionUI();\n        updateExportInfo();`,
  `        syncCompositionUI();\n        syncTextAnimatorUI();\n        applyTextAnimatorFrame(params.textAnimator.phase);\n        updateExportInfo();`,
  'project load animator sync'
);
html = replaceOnce(
  html,
  `      initProgressiveUI();\n      initParameterNavigator();`,
  `      initProgressiveUI();\n      initParameterNavigator();\n      bindTextAnimatorUI();`,
  'text animator UI binding'
);
html = replaceOnce(
  html,
  `      syncCompositionUI();\n      // restore order: shared URL wins, then the autosave; autosaving only`,
  `      syncCompositionUI();\n      syncTextAnimatorUI();\n      applyTextAnimatorFrame(params.textAnimator.phase);\n      // restore order: shared URL wins, then the autosave; autosaving only`,
  'boot animator sync'
);

html = replaceOnce(
  html,
  `        recordedStartedAt: 0,\n        recordedDurationMs: 0`,
  `        recordedStartedAt: 0,\n        recordedDurationMs: 0,\n        savedTextAnimatorPhase: 0,\n        savedTextAnimatorPlaying: false`,
  'video animator saved state'
);
html = replaceOnce(
  html,
  `        btnVideoRecord.disabled = !compositionState.enabled || !captureSupported || !mime;`,
  `        var motionReady = compositionState.enabled || !!(params.textAnimator && params.textAnimator.enabled);\n        btnVideoRecord.disabled = !motionReady || !captureSupported || !mime;`,
  'video animator availability'
);
html = replaceOnce(
  html,
  `        } else if (!compositionState.enabled) {\n          setVideoStatus('Compositionを適用すると映像を書き出せます。', 'ready');`,
  `        } else if (!motionReady) {\n          setVideoStatus('CompositionまたはText Animatorを有効にすると映像を書き出せます。', 'ready');`,
  'video animator ready message'
);
html = replaceOnce(
  html,
  `        if (!compositionState.enabled) {\n          setVideoStatus('先にField / Flux Rows / CascadeをApplyしてください。', 'error');\n          return;\n        }`,
  `        if (!compositionState.enabled && !(params.textAnimator && params.textAnimator.enabled)) {\n          setVideoStatus('先にCompositionまたはText Animatorを有効にしてください。', 'error');\n          return;\n        }`,
  'video animator start gate'
);
html = replaceOnce(
  html,
  `        videoExportState.savedPhase = compositionState.phase;\n        videoExportState.savedPlaying = compositionPlayRaf !== null;`,
  `        videoExportState.savedPhase = compositionState.phase;\n        videoExportState.savedPlaying = compositionPlayRaf !== null;\n        videoExportState.savedTextAnimatorPhase = params.textAnimator.phase;\n        videoExportState.savedTextAnimatorPlaying = textAnimatorPlayRaf !== null;`,
  'video animator save playback'
);
html = replaceOnce(
  html,
  `        setCompositionPlaying(false);\n        setVideoControlsLocked(true);`,
  `        setCompositionPlaying(false);\n        setTextAnimatorPlaying(false);\n        setVideoControlsLocked(true);`,
  'video animator pause'
);
html = replaceOnce(
  html,
  `        var startPhase = params.videoStart === 'current' ? videoExportState.savedPhase : 0;`,
  `        var startPhase = params.videoStart === 'current' ? videoExportState.savedPhase : 0;\n        var textAnimatorStartPhase = params.videoStart === 'current' ? videoExportState.savedTextAnimatorPhase : 0;`,
  'video animator start phase'
);
html = replaceOnce(
  html,
  `          if (phaseInput) phaseInput.value = compositionState.phase;\n          if (phaseValue) phaseValue.textContent = compositionState.phase.toFixed(3);\n          try {\n            renderVideoFrame(output.canvas, dims.w, dims.h);`,
  `          if (phaseInput) phaseInput.value = compositionState.phase;\n          if (phaseValue) phaseValue.textContent = compositionState.phase.toFixed(3);\n          if (params.textAnimator && params.textAnimator.enabled) {\n            params.textAnimator.phase = (textAnimatorStartPhase + phaseInLoop + 1) % 1;\n            syncTextAnimatorPhaseUI();\n            applyTextAnimatorFrame(params.textAnimator.phase);\n          }\n          try {\n            renderVideoFrame(output.canvas, dims.w, dims.h);`,
  'video animator frame phase'
);
html = replaceOnce(
  html,
  `        scheduleCompositionDraw();\n        if (videoExportState.savedPlaying) setCompositionPlaying(true);\n      }`,
  `        scheduleCompositionDraw();\n        params.textAnimator.phase = videoExportState.savedTextAnimatorPhase;\n        syncTextAnimatorPhaseUI();\n        applyTextAnimatorFrame(params.textAnimator.phase);\n        if (videoExportState.savedPlaying) setCompositionPlaying(true);\n        if (videoExportState.savedTextAnimatorPlaying) setTextAnimatorPlaying(true);\n      }`,
  'video animator restore'
);

fs.writeFileSync(indexPath, html);

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
pkg.scripts = pkg.scripts || {};
pkg.scripts.check = pkg.scripts.check || 'node scripts/validate.mjs';
pkg.scripts['test:unit'] = 'node --test tests/text-animator.unit.mjs';
pkg.scripts['test:e2e'] = 'playwright test';
pkg.scripts.test = 'npm run check && npm run test:unit';
pkg.devDependencies = Object.assign({}, pkg.devDependencies, { '@playwright/test': '1.62.1' });
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');

let validate = fs.readFileSync(validatePath, 'utf8');
validate = replaceOnce(
  validate,
  `    if (srcMatch) {\n      const asset = localAssetPath(srcMatch[2]);\n      if (asset && !fs.existsSync(asset)) {\n        noteFailure(\`Missing local script referenced by index.html: \${path.relative(root, asset)}\`);\n      }\n      continue;\n    }`,
  `    if (srcMatch) {\n      const asset = localAssetPath(srcMatch[2]);\n      if (asset && !fs.existsSync(asset)) {\n        noteFailure(\`Missing local script referenced by index.html: \${path.relative(root, asset)}\`);\n      } else if (asset && path.basename(asset) !== 'confuse-dictionary.js') {\n        const externalSource = readRequired(asset);\n        if (externalSource) {\n          try { new vm.Script(externalSource, { filename: path.relative(root, asset) }); }\n          catch (error) { noteFailure(\`JavaScript syntax error in \${path.relative(root, asset)}: \${error.message}\`); }\n        }\n      }\n      continue;\n    }`,
  'external script syntax validation'
);
fs.writeFileSync(validatePath, validate);

console.log('Applied Text Animator foundation patch.');
