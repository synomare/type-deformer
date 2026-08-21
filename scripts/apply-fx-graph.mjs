import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(root, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(label + ' anchor was not found');
  if (source.indexOf(before, index + before.length) >= 0) throw new Error(label + ' anchor is ambiguous');
  return source.slice(0, index) + after + source.slice(index + before.length);
}

if (html.includes('id="textAnimatorFxGraph"')) throw new Error('FX graph is already integrated');

const scriptPattern = /(<script\b[^>]*\bsrc=["']deformer-engine\.js["'][^>]*><\/script>)/i;
if (!scriptPattern.test(html)) throw new Error('deformer-engine.js script tag was not found');
html = html.replace(scriptPattern, '$1\n  <script src="fx-graph.js"></script>');

const css = `
    .fx-graph-defs {
      position: absolute;
      width: 0;
      height: 0;
      overflow: hidden;
      pointer-events: none;
    }
    .stage.fx-graph-active,
    .fx-graph-output.fx-graph-active {
      filter: url(#textAnimatorFxFilter) !important;
    }
    .fx-graph-editor {
      margin-top: 0.9rem;
      padding-top: 0.75rem;
      border-top: 1px solid var(--ink);
    }
    .fx-graph-toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
      gap: 0.35rem;
      align-items: center;
    }
    .fx-graph-actions {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0.35rem;
      margin: 0.45rem 0 0.65rem;
    }
    .fx-graph-toolbar button,
    .fx-graph-actions button { min-width: 0; box-shadow: none; }
    .fx-graph-node-card {
      padding: 0.65rem;
      border: 1px solid var(--line);
      background: color-mix(in srgb, var(--card) 92%, var(--paper));
    }
    .fx-graph-node-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.7rem;
      margin-bottom: 0.55rem;
      color: var(--red);
    }
    .fx-graph-node-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.45rem;
    }
    .fx-graph-node-grid .row { margin: 0; }
    .fx-graph-status {
      min-height: 1.4em;
      margin: 0.55rem 0 0;
      color: var(--dim);
      font-size: 0.52rem;
      line-height: 1.45;
      letter-spacing: 0.05em;
    }
    .fx-graph-status[data-state="active"] { color: var(--red); }
    @media (max-width: 720px) {
      .fx-graph-toolbar { grid-template-columns: 1fr 1fr auto; }
      .fx-graph-node-grid { grid-template-columns: 1fr; }
    }
`;
html = replaceOnce(html, '  </style>', css + '\n  </style>', 'style closing tag');

const markupAnchor = `            <p class="deformer-status" id="textAnimatorDeformerStatus" role="status">No deformer nodes</p>
          </div>`;
const markup = `${markupAnchor}
          <div class="fx-graph-editor" id="textAnimatorFxGraph">
            <div class="sub-head"><span>FX Graph</span><span class="r">全体エフェクト</span></div>
            <div class="row">
              <label for="pTextAnimatorFxGraphEnabled">Graph</label>
              <input id="pTextAnimatorFxGraphEnabled" type="checkbox">
              <span>Enable ordered layer FX</span>
            </div>
            <div class="fx-graph-toolbar">
              <label for="pTextAnimatorFxNode" class="sr-only">Active effect</label>
              <select id="pTextAnimatorFxNode" aria-label="Active effect"></select>
              <label for="pTextAnimatorFxAddType" class="sr-only">New effect type</label>
              <select id="pTextAnimatorFxAddType" aria-label="New effect type">
                <option value="blur">Blur</option>
                <option value="glow">Glow</option>
                <option value="chromaticSplit">Chromatic Split</option>
                <option value="threshold">Threshold</option>
              </select>
              <button type="button" id="btnTextAnimatorFxAdd">Add</button>
            </div>
            <div class="fx-graph-actions">
              <button type="button" id="btnTextAnimatorFxUp">Up</button>
              <button type="button" id="btnTextAnimatorFxDown">Down</button>
              <button type="button" id="btnTextAnimatorFxDuplicate">Duplicate</button>
              <button type="button" id="btnTextAnimatorFxDelete">Delete</button>
            </div>
            <div class="fx-graph-node-card" id="textAnimatorFxNodeCard">
              <div class="fx-graph-node-head">
                <strong id="textAnimatorFxTypeLabel">No effect</strong>
                <label><input id="pTextAnimatorFxNodeEnabled" type="checkbox"> Node enabled</label>
              </div>
              <div class="fx-graph-node-grid">
                <div class="row" id="textAnimatorFxMixRow">
                  <label for="pTextAnimatorFxMix">Mix</label>
                  <input id="pTextAnimatorFxMix" type="range" min="0" max="1" step="0.001" value="1">
                  <output id="vTextAnimatorFxMix">1.000</output>
                </div>
                <div class="row" id="textAnimatorFxRadiusRow" data-fx-types="blur glow">
                  <label for="pTextAnimatorFxRadius">Radius</label>
                  <input id="pTextAnimatorFxRadius" type="range" min="0" max="80" step="0.1" value="6">
                  <output id="vTextAnimatorFxRadius">6.0px</output>
                </div>
                <div class="row" id="textAnimatorFxStrengthRow" data-fx-types="glow">
                  <label for="pTextAnimatorFxStrength">Strength</label>
                  <input id="pTextAnimatorFxStrength" type="range" min="0" max="5" step="0.01" value="1.4">
                  <output id="vTextAnimatorFxStrength">1.40×</output>
                </div>
                <div class="row" id="textAnimatorFxColorRow" data-fx-types="glow">
                  <label for="pTextAnimatorFxColor">Glow color</label>
                  <input id="pTextAnimatorFxColor" type="color" value="#ffffff">
                </div>
                <div class="row" id="textAnimatorFxAmountRow" data-fx-types="chromaticSplit">
                  <label for="pTextAnimatorFxAmount">Separation</label>
                  <input id="pTextAnimatorFxAmount" type="range" min="0" max="80" step="0.1" value="12">
                  <output id="vTextAnimatorFxAmount">12.0px</output>
                </div>
                <div class="row" id="textAnimatorFxAngleRow" data-fx-types="chromaticSplit">
                  <label for="pTextAnimatorFxAngle">Angle</label>
                  <input id="pTextAnimatorFxAngle" type="range" min="-180" max="180" step="1" value="0">
                  <output id="vTextAnimatorFxAngle">0°</output>
                </div>
                <div class="row" id="textAnimatorFxLevelRow" data-fx-types="threshold">
                  <label for="pTextAnimatorFxLevel">Level</label>
                  <input id="pTextAnimatorFxLevel" type="range" min="0" max="1" step="0.001" value="0.5">
                  <output id="vTextAnimatorFxLevel">0.500</output>
                </div>
                <div class="row" id="textAnimatorFxSoftnessRow" data-fx-types="threshold">
                  <label for="pTextAnimatorFxSoftness">Softness</label>
                  <input id="pTextAnimatorFxSoftness" type="range" min="0.001" max="0.5" step="0.001" value="0.06">
                  <output id="vTextAnimatorFxSoftness">0.060</output>
                </div>
              </div>
            </div>
            <p class="fx-graph-status" id="textAnimatorFxStatus" role="status">No FX nodes</p>
          </div>`;
html = replaceOnce(html, markupAnchor, markup, 'deformer editor closing block');

const svgDefs = `
  <svg class="fx-graph-defs" aria-hidden="true" focusable="false">
    <defs>
      <filter id="textAnimatorFxFilter" x="-100%" y="-100%" width="300%" height="300%" color-interpolation-filters="sRGB"></filter>
    </defs>
  </svg>
`;
html = replaceOnce(html, '</body>', svgDefs + '\n</body>', 'body closing tag');

const runtime = `
      var textAnimatorFxUiBound = false;
      var textAnimatorFxCounter = 0;
      var TEXT_ANIMATOR_FX_SPECS = [
        ['pTextAnimatorFxMix', 'vTextAnimatorFxMix', 'mix', 3, ''],
        ['pTextAnimatorFxRadius', 'vTextAnimatorFxRadius', 'radius', 1, 'px'],
        ['pTextAnimatorFxStrength', 'vTextAnimatorFxStrength', 'strength', 2, '×'],
        ['pTextAnimatorFxAmount', 'vTextAnimatorFxAmount', 'amount', 1, 'px'],
        ['pTextAnimatorFxAngle', 'vTextAnimatorFxAngle', 'angle', 0, '°'],
        ['pTextAnimatorFxLevel', 'vTextAnimatorFxLevel', 'level', 3, ''],
        ['pTextAnimatorFxSoftness', 'vTextAnimatorFxSoftness', 'softness', 3, '']
      ];

      function mutableFxGraph() {
        params.textAnimator = textAnimatorEngine.normalizeState(params.textAnimator);
        return params.textAnimator.fxGraph;
      }

      function mutableActiveFxNode() {
        var graph = mutableFxGraph();
        for (var i = 0; i < graph.nodes.length; i++) {
          if (graph.nodes[i].id === graph.activeNodeId) return graph.nodes[i];
        }
        return graph.nodes.length ? graph.nodes[0] : null;
      }

      function populateFxNodes() {
        var select = document.getElementById('pTextAnimatorFxNode');
        if (!select) return;
        var graph = mutableFxGraph();
        select.textContent = '';
        for (var i = 0; i < graph.nodes.length; i++) {
          var option = document.createElement('option');
          option.value = graph.nodes[i].id;
          option.textContent = (i + 1) + ' · ' + graph.nodes[i].name
            + (graph.nodes[i].unsupported ? ' (unsupported)' : graph.nodes[i].enabled ? '' : ' (off)');
          select.appendChild(option);
        }
        select.value = graph.activeNodeId;
      }

      function applyTextFxGraph() {
        if (!textAnimatorEngine.fxGraph) return;
        params.textAnimator = textAnimatorEngine.normalizeState(params.textAnimator);
        var filter = document.getElementById('textAnimatorFxFilter');
        var plan = textAnimatorEngine.fxGraph.renderSvgFilter(filter, params.textAnimator.fxGraph);
        var active = plan.operations.length > 0;
        stage.classList.toggle('fx-graph-active', active);
        stage.dataset.fxGraphNodes = String(plan.operations.length);
        var outputs = document.querySelectorAll('#compositionCanvas, .composition-canvas, [data-composition-canvas]');
        for (var i = 0; i < outputs.length; i++) {
          outputs[i].classList.add('fx-graph-output');
          outputs[i].classList.toggle('fx-graph-active', active);
        }
      }

      function syncFxGraphUI() {
        var panel = document.getElementById('textAnimatorFxGraph');
        if (!panel || !textAnimatorEngine.fxGraph) return;
        var graph = mutableFxGraph();
        var node = mutableActiveFxNode();
        populateFxNodes();
        document.getElementById('pTextAnimatorFxGraphEnabled').checked = graph.enabled;
        var controls = panel.querySelectorAll('#textAnimatorFxNodeCard input, #textAnimatorFxNodeCard select');
        for (var c = 0; c < controls.length; c++) controls[c].disabled = !node || node.unsupported;
        document.getElementById('btnTextAnimatorFxUp').disabled = !node || graph.nodes[0] === node;
        document.getElementById('btnTextAnimatorFxDown').disabled = !node || graph.nodes[graph.nodes.length - 1] === node;
        document.getElementById('btnTextAnimatorFxDuplicate').disabled = !node || graph.nodes.length >= textAnimatorEngine.fxGraph.maxNodes;
        document.getElementById('btnTextAnimatorFxDelete').disabled = !node;
        document.getElementById('btnTextAnimatorFxAdd').disabled = graph.nodes.length >= textAnimatorEngine.fxGraph.maxNodes;

        document.getElementById('textAnimatorFxTypeLabel').textContent = node
          ? textAnimatorEngine.fxGraph.typeLabel(node.type) + ' · ' + node.name
            + (node.unsupported ? ' · bypassed' : '')
          : 'No effect';
        if (node && !node.unsupported) {
          document.getElementById('pTextAnimatorFxNodeEnabled').checked = node.enabled;
          document.getElementById('pTextAnimatorFxColor').value = node.color;
          for (var i = 0; i < TEXT_ANIMATOR_FX_SPECS.length; i++) {
            var spec = TEXT_ANIMATOR_FX_SPECS[i];
            var input = document.getElementById(spec[0]);
            var output = document.getElementById(spec[1]);
            input.value = node[spec[2]];
            output.textContent = Number(node[spec[2]]).toFixed(spec[3]) + spec[4];
          }
        }
        var parameterRows = panel.querySelectorAll('[data-fx-types]');
        for (var r = 0; r < parameterRows.length; r++) {
          var types = parameterRows[r].dataset.fxTypes.split(/\\s+/);
          parameterRows[r].hidden = !node || node.unsupported || types.indexOf(node.type) < 0;
        }
        var status = document.getElementById('textAnimatorFxStatus');
        var enabledCount = 0;
        var unsupportedCount = 0;
        for (var n = 0; n < graph.nodes.length; n++) {
          if (graph.nodes[n].unsupported) unsupportedCount++;
          else if (graph.nodes[n].enabled && graph.nodes[n].mix > 0) enabledCount++;
        }
        status.dataset.state = graph.enabled && enabledCount ? 'active' : 'idle';
        status.textContent = graph.nodes.length
          ? (graph.enabled ? 'GRAPH ON' : 'GRAPH BYPASSED') + ' · ' + graph.nodes.length + ' node'
            + (graph.nodes.length === 1 ? '' : 's') + ' · ' + enabledCount + ' active'
            + (unsupportedCount ? ' · ' + unsupportedCount + ' unsupported' : '')
          : 'No FX nodes';
        applyTextFxGraph();
      }

      function commitFxGraphChange(resync) {
        params.textAnimator = textAnimatorEngine.normalizeState(params.textAnimator);
        markAutosaveDirty();
        applyTextFxGraph();
        invalidateCompositionSource();
        scheduleCompositionDraw();
        if (resync !== false) syncFxGraphUI();
      }

      function addFxNode(type) {
        var graph = mutableFxGraph();
        if (graph.nodes.length >= textAnimatorEngine.fxGraph.maxNodes) return;
        pushHistory();
        textAnimatorFxCounter++;
        var id = 'fx-' + Date.now().toString(36) + '-' + textAnimatorFxCounter;
        var node = textAnimatorEngine.fxGraph.defaultNode(type, id);
        node.name = textAnimatorEngine.fxGraph.typeLabel(node.type) + ' ' + (graph.nodes.length + 1);
        graph.nodes.push(node);
        graph.activeNodeId = id;
        graph.enabled = true;
        params.textAnimator.enabled = true;
        commitFxGraphChange();
      }

      function moveActiveFxNode(direction) {
        var graph = mutableFxGraph();
        var node = mutableActiveFxNode();
        if (!node) return;
        var index = graph.nodes.indexOf(node);
        var target = index + direction;
        if (target < 0 || target >= graph.nodes.length) return;
        pushHistory();
        graph.nodes.splice(index, 1);
        graph.nodes.splice(target, 0, node);
        commitFxGraphChange();
      }

      function bindFxGraphUI() {
        if (textAnimatorFxUiBound || !document.getElementById('textAnimatorFxGraph')) return;
        textAnimatorFxUiBound = true;
        document.getElementById('pTextAnimatorFxGraphEnabled').addEventListener('change', function (event) {
          pushHistory();
          var graph = mutableFxGraph();
          graph.enabled = event.target.checked && graph.nodes.length > 0;
          if (graph.enabled) params.textAnimator.enabled = true;
          commitFxGraphChange();
        });
        document.getElementById('pTextAnimatorFxNode').addEventListener('change', function (event) {
          mutableFxGraph().activeNodeId = event.target.value;
          syncFxGraphUI();
        });
        document.getElementById('btnTextAnimatorFxAdd').addEventListener('click', function () {
          addFxNode(document.getElementById('pTextAnimatorFxAddType').value);
        });
        document.getElementById('btnTextAnimatorFxUp').addEventListener('click', function () { moveActiveFxNode(-1); });
        document.getElementById('btnTextAnimatorFxDown').addEventListener('click', function () { moveActiveFxNode(1); });
        document.getElementById('btnTextAnimatorFxDuplicate').addEventListener('click', function () {
          var graph = mutableFxGraph();
          var source = mutableActiveFxNode();
          if (!source || graph.nodes.length >= textAnimatorEngine.fxGraph.maxNodes) return;
          pushHistory();
          textAnimatorFxCounter++;
          var duplicate = JSON.parse(JSON.stringify(source));
          duplicate.id = 'fx-' + Date.now().toString(36) + '-' + textAnimatorFxCounter;
          duplicate.name = (source.name + ' copy').slice(0, 40);
          var index = graph.nodes.indexOf(source) + 1;
          graph.nodes.splice(index, 0, duplicate);
          graph.activeNodeId = duplicate.id;
          commitFxGraphChange();
        });
        document.getElementById('btnTextAnimatorFxDelete').addEventListener('click', function () {
          var graph = mutableFxGraph();
          var node = mutableActiveFxNode();
          if (!node) return;
          pushHistory();
          var index = graph.nodes.indexOf(node);
          graph.nodes.splice(index, 1);
          graph.activeNodeId = graph.nodes.length ? graph.nodes[Math.min(index, graph.nodes.length - 1)].id : '';
          if (!graph.nodes.length) graph.enabled = false;
          commitFxGraphChange();
        });
        document.getElementById('pTextAnimatorFxNodeEnabled').addEventListener('change', function (event) {
          var node = mutableActiveFxNode();
          if (!node || node.unsupported) return;
          pushHistory();
          node.enabled = event.target.checked;
          commitFxGraphChange();
        });
        document.getElementById('pTextAnimatorFxColor').addEventListener('input', function (event) {
          var node = mutableActiveFxNode();
          if (!node || node.unsupported) return;
          node.color = event.target.value;
          commitFxGraphChange(false);
        });
        document.getElementById('pTextAnimatorFxColor').addEventListener('change', function () {
          markAutosaveDirty();
          syncFxGraphUI();
        });

        for (var i = 0; i < TEXT_ANIMATOR_FX_SPECS.length; i++) {
          (function (spec) {
            var input = document.getElementById(spec[0]);
            var historyOpen = false;
            function beginHistory() {
              if (historyOpen || !mutableActiveFxNode()) return;
              pushHistory();
              historyOpen = true;
            }
            input.addEventListener('pointerdown', beginHistory);
            input.addEventListener('keydown', beginHistory);
            input.addEventListener('pointerup', function () { historyOpen = false; });
            input.addEventListener('change', function () { historyOpen = false; });
            input.addEventListener('input', function () {
              var node = mutableActiveFxNode();
              if (!node || node.unsupported) return;
              node[spec[2]] = Number(input.value);
              document.getElementById(spec[1]).textContent = Number(input.value).toFixed(spec[3]) + spec[4];
              commitFxGraphChange(false);
            });
          })(TEXT_ANIMATOR_FX_SPECS[i]);
        }
        syncFxGraphUI();
      }
`;

html = replaceOnce(
  html,
  '      function bindTextAnimatorUI() {',
  runtime + '\n      function bindTextAnimatorUI() {',
  'Text Animator UI binding function'
);
html = replaceOnce(
  html,
  "        syncDeformerStackUI();\n        updateTextAnimatorStatus();",
  "        syncDeformerStackUI();\n        syncFxGraphUI();\n        updateTextAnimatorStatus();",
  'Text Animator UI sync hook'
);
html = replaceOnce(
  html,
  "        bindDeformerStackUI();\n        document.getElementById('pTextAnimatorEnabled')",
  "        bindDeformerStackUI();\n        bindFxGraphUI();\n        document.getElementById('pTextAnimatorEnabled')",
  'Text Animator UI bind hook'
);
html = replaceOnce(
  html,
  "        scheduleCompositionDraw();\n        scheduleEffectStatusUpdate();\n        updateTextAnimatorStatus();",
  "        scheduleCompositionDraw();\n        applyTextFxGraph();\n        scheduleEffectStatusUpdate();\n        updateTextAnimatorStatus();",
  'Text Animator frame FX hook'
);

fs.writeFileSync(indexPath, html);
console.log('Applied ordered SVG FX graph integration.');
