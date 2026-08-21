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

if (html.includes('id="textAnimatorDeformers"')) throw new Error('Deformer stack is already integrated');

const scriptPattern = /(<script\b[^>]*\bsrc=["']keyframe-engine\.js["'][^>]*><\/script>)/i;
if (!scriptPattern.test(html)) throw new Error('keyframe-engine.js script tag was not found');
html = html.replace(scriptPattern, '$1\n  <script src="deformer-engine.js"></script>');

const css = `
    .deformer-editor {
      margin-top: 0.9rem;
      padding-top: 0.75rem;
      border-top: 1px solid var(--ink);
    }
    .deformer-toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 0.8fr) auto;
      gap: 0.35rem;
      align-items: center;
    }
    .deformer-actions {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0.35rem;
      margin: 0.45rem 0 0.65rem;
    }
    .deformer-toolbar button,
    .deformer-actions button { min-width: 0; box-shadow: none; }
    .deformer-node-card {
      padding: 0.65rem;
      border: 1px solid var(--line);
      background: color-mix(in srgb, var(--card) 92%, var(--paper));
    }
    .deformer-node-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.7rem;
      margin-bottom: 0.55rem;
      color: var(--red);
    }
    .deformer-node-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.45rem;
    }
    .deformer-node-grid .row { margin: 0; }
    .deformer-status {
      min-height: 1.4em;
      margin: 0.55rem 0 0;
      color: var(--dim);
      font-size: 0.52rem;
      line-height: 1.45;
      letter-spacing: 0.05em;
    }
    .deformer-status[data-state="active"] { color: var(--red); }
    @media (max-width: 720px) {
      .deformer-toolbar { grid-template-columns: 1fr 1fr auto; }
      .deformer-node-grid { grid-template-columns: 1fr; }
    }
`;
html = replaceOnce(html, '  </style>', css + '\n  </style>', 'style closing tag');

const markupAnchor = `            <p class="keyframe-status" id="textAnimatorKeyframeStatus" role="status">No Position X keyframes</p>
          </div>`;
const markup = `${markupAnchor}
          <div class="deformer-editor" id="textAnimatorDeformers">
            <div class="sub-head"><span>Deformer Stack</span><span class="r">変形ノード</span></div>
            <div class="row">
              <label for="pTextAnimatorDeformerStackEnabled">Stack</label>
              <input id="pTextAnimatorDeformerStackEnabled" type="checkbox">
              <span>Enable ordered deformation</span>
            </div>
            <div class="deformer-toolbar">
              <label for="pTextAnimatorDeformerNode" class="sr-only">Active deformer</label>
              <select id="pTextAnimatorDeformerNode" aria-label="Active deformer"></select>
              <label for="pTextAnimatorDeformerAddType" class="sr-only">New deformer type</label>
              <select id="pTextAnimatorDeformerAddType" aria-label="New deformer type">
                <option value="bend">Bend</option>
                <option value="arc">Arc</option>
                <option value="wave">Wave</option>
              </select>
              <button type="button" id="btnTextAnimatorDeformerAdd">Add</button>
            </div>
            <div class="deformer-actions">
              <button type="button" id="btnTextAnimatorDeformerUp">Up</button>
              <button type="button" id="btnTextAnimatorDeformerDown">Down</button>
              <button type="button" id="btnTextAnimatorDeformerDuplicate">Duplicate</button>
              <button type="button" id="btnTextAnimatorDeformerDelete">Delete</button>
            </div>
            <div class="deformer-node-card" id="textAnimatorDeformerNodeCard">
              <div class="deformer-node-head">
                <strong id="textAnimatorDeformerTypeLabel">No node</strong>
                <label><input id="pTextAnimatorDeformerNodeEnabled" type="checkbox"> Node enabled</label>
              </div>
              <div class="deformer-node-grid">
                <div class="row">
                  <label for="pTextAnimatorDeformerAxis">Axis</label>
                  <select id="pTextAnimatorDeformerAxis"><option value="y">Y</option><option value="x">X</option></select>
                </div>
                <div class="row">
                  <label for="pTextAnimatorDeformerAmount">Amount</label>
                  <input id="pTextAnimatorDeformerAmount" type="range" min="-360" max="360" step="1" value="0">
                  <output id="vTextAnimatorDeformerAmount">0</output>
                </div>
                <div class="row">
                  <label for="pTextAnimatorDeformerOrigin">Origin</label>
                  <input id="pTextAnimatorDeformerOrigin" type="range" min="0" max="1" step="0.001" value="0.5">
                  <output id="vTextAnimatorDeformerOrigin">0.500</output>
                </div>
                <div class="row">
                  <label for="pTextAnimatorDeformerFrequency">Frequency</label>
                  <input id="pTextAnimatorDeformerFrequency" type="range" min="0.05" max="12" step="0.05" value="1">
                  <output id="vTextAnimatorDeformerFrequency">1.00</output>
                </div>
                <div class="row">
                  <label for="pTextAnimatorDeformerPhase">Node phase</label>
                  <input id="pTextAnimatorDeformerPhase" type="range" min="-2" max="2" step="0.001" value="0">
                  <output id="vTextAnimatorDeformerPhase">0.000</output>
                </div>
                <div class="row">
                  <label for="pTextAnimatorDeformerSpeed">Phase speed</label>
                  <input id="pTextAnimatorDeformerSpeed" type="range" min="-4" max="4" step="0.01" value="0">
                  <output id="vTextAnimatorDeformerSpeed">0.00×</output>
                </div>
                <div class="row">
                  <label for="pTextAnimatorDeformerFalloff">Edge falloff</label>
                  <input id="pTextAnimatorDeformerFalloff" type="range" min="0" max="1" step="0.001" value="0.25">
                  <output id="vTextAnimatorDeformerFalloff">0.250</output>
                </div>
                <div class="row">
                  <label for="pTextAnimatorDeformerMix">Mix</label>
                  <input id="pTextAnimatorDeformerMix" type="range" min="0" max="1" step="0.001" value="1">
                  <output id="vTextAnimatorDeformerMix">1.000</output>
                </div>
              </div>
            </div>
            <p class="deformer-status" id="textAnimatorDeformerStatus" role="status">No deformer nodes</p>
          </div>`;
html = replaceOnce(html, markupAnchor, markup, 'keyframe editor closing block');

const runtime = `
      var textAnimatorDeformerUiBound = false;
      var textAnimatorDeformerCounter = 0;
      var TEXT_ANIMATOR_DEFORMER_SPECS = [
        ['pTextAnimatorDeformerAmount', 'vTextAnimatorDeformerAmount', 'amount', 1, ''],
        ['pTextAnimatorDeformerOrigin', 'vTextAnimatorDeformerOrigin', 'origin', 3, ''],
        ['pTextAnimatorDeformerFrequency', 'vTextAnimatorDeformerFrequency', 'frequency', 2, ''],
        ['pTextAnimatorDeformerPhase', 'vTextAnimatorDeformerPhase', 'phase', 3, ''],
        ['pTextAnimatorDeformerSpeed', 'vTextAnimatorDeformerSpeed', 'speed', 2, '×'],
        ['pTextAnimatorDeformerFalloff', 'vTextAnimatorDeformerFalloff', 'falloff', 3, ''],
        ['pTextAnimatorDeformerMix', 'vTextAnimatorDeformerMix', 'mix', 3, '']
      ];

      function mutableDeformerStack() {
        params.textAnimator = textAnimatorEngine.normalizeState(params.textAnimator);
        return params.textAnimator.deformers;
      }

      function mutableActiveDeformer() {
        var stack = mutableDeformerStack();
        for (var i = 0; i < stack.nodes.length; i++) {
          if (stack.nodes[i].id === stack.activeNodeId) return stack.nodes[i];
        }
        return stack.nodes.length ? stack.nodes[0] : null;
      }

      function deformerTypeLabel(type) {
        return type === 'arc' ? 'Arc' : type === 'wave' ? 'Wave' : 'Bend';
      }

      function populateDeformerNodes() {
        var select = document.getElementById('pTextAnimatorDeformerNode');
        if (!select) return;
        var stack = mutableDeformerStack();
        select.textContent = '';
        for (var i = 0; i < stack.nodes.length; i++) {
          var option = document.createElement('option');
          option.value = stack.nodes[i].id;
          option.textContent = (i + 1) + ' · ' + stack.nodes[i].name + (stack.nodes[i].enabled ? '' : ' (off)');
          select.appendChild(option);
        }
        select.value = stack.activeNodeId;
      }

      function syncDeformerStackUI() {
        var panel = document.getElementById('textAnimatorDeformers');
        if (!panel || !textAnimatorEngine.deformers) return;
        var stack = mutableDeformerStack();
        var node = mutableActiveDeformer();
        populateDeformerNodes();
        document.getElementById('pTextAnimatorDeformerStackEnabled').checked = stack.enabled;
        var controls = panel.querySelectorAll('#textAnimatorDeformerNodeCard input, #textAnimatorDeformerNodeCard select');
        for (var c = 0; c < controls.length; c++) controls[c].disabled = !node;
        document.getElementById('btnTextAnimatorDeformerUp').disabled = !node || stack.nodes[0] === node;
        document.getElementById('btnTextAnimatorDeformerDown').disabled = !node || stack.nodes[stack.nodes.length - 1] === node;
        document.getElementById('btnTextAnimatorDeformerDuplicate').disabled = !node || stack.nodes.length >= textAnimatorEngine.deformers.maxNodes;
        document.getElementById('btnTextAnimatorDeformerDelete').disabled = !node;
        document.getElementById('btnTextAnimatorDeformerAdd').disabled = stack.nodes.length >= textAnimatorEngine.deformers.maxNodes;

        var label = document.getElementById('textAnimatorDeformerTypeLabel');
        label.textContent = node ? deformerTypeLabel(node.type) + ' · ' + node.name : 'No node';
        if (node) {
          document.getElementById('pTextAnimatorDeformerNodeEnabled').checked = node.enabled;
          document.getElementById('pTextAnimatorDeformerAxis').value = node.axis;
          var amount = document.getElementById('pTextAnimatorDeformerAmount');
          amount.min = node.type === 'wave' ? -300 : -360;
          amount.max = node.type === 'wave' ? 300 : 360;
          for (var i = 0; i < TEXT_ANIMATOR_DEFORMER_SPECS.length; i++) {
            var spec = TEXT_ANIMATOR_DEFORMER_SPECS[i];
            var input = document.getElementById(spec[0]);
            var output = document.getElementById(spec[1]);
            input.value = node[spec[2]];
            output.textContent = Number(node[spec[2]]).toFixed(spec[3]) + spec[4];
          }
        }
        var status = document.getElementById('textAnimatorDeformerStatus');
        status.dataset.state = stack.enabled && stack.nodes.length ? 'active' : 'idle';
        status.textContent = stack.nodes.length
          ? (stack.enabled ? 'STACK ON' : 'STACK BYPASSED') + ' · ' + stack.nodes.length + ' node' + (stack.nodes.length === 1 ? '' : 's')
            + (node ? ' · ' + deformerTypeLabel(node.type) : '')
          : 'No deformer nodes';
      }

      function commitDeformerChange(resync) {
        params.textAnimator = textAnimatorEngine.normalizeState(params.textAnimator);
        markAutosaveDirty();
        applyTextAnimatorFrame(params.textAnimator.phase);
        if (resync !== false) syncDeformerStackUI();
      }

      function addDeformerNode(type) {
        var stack = mutableDeformerStack();
        if (stack.nodes.length >= textAnimatorEngine.deformers.maxNodes) return;
        pushHistory();
        textAnimatorDeformerCounter++;
        var id = 'deformer-' + Date.now().toString(36) + '-' + textAnimatorDeformerCounter;
        var node = textAnimatorEngine.deformers.defaultNode(type, id);
        node.name = deformerTypeLabel(node.type) + ' ' + (stack.nodes.length + 1);
        stack.nodes.push(node);
        stack.activeNodeId = id;
        stack.enabled = true;
        params.textAnimator.enabled = true;
        commitDeformerChange();
      }

      function moveActiveDeformer(direction) {
        var stack = mutableDeformerStack();
        var node = mutableActiveDeformer();
        if (!node) return;
        var index = stack.nodes.indexOf(node);
        var target = index + direction;
        if (target < 0 || target >= stack.nodes.length) return;
        pushHistory();
        stack.nodes.splice(index, 1);
        stack.nodes.splice(target, 0, node);
        commitDeformerChange();
      }

      function bindDeformerStackUI() {
        if (textAnimatorDeformerUiBound || !document.getElementById('textAnimatorDeformers')) return;
        textAnimatorDeformerUiBound = true;
        document.getElementById('pTextAnimatorDeformerStackEnabled').addEventListener('change', function (event) {
          pushHistory();
          var stack = mutableDeformerStack();
          stack.enabled = event.target.checked && stack.nodes.length > 0;
          if (stack.enabled) params.textAnimator.enabled = true;
          commitDeformerChange();
        });
        document.getElementById('pTextAnimatorDeformerNode').addEventListener('change', function (event) {
          mutableDeformerStack().activeNodeId = event.target.value;
          syncDeformerStackUI();
        });
        document.getElementById('btnTextAnimatorDeformerAdd').addEventListener('click', function () {
          addDeformerNode(document.getElementById('pTextAnimatorDeformerAddType').value);
        });
        document.getElementById('btnTextAnimatorDeformerUp').addEventListener('click', function () { moveActiveDeformer(-1); });
        document.getElementById('btnTextAnimatorDeformerDown').addEventListener('click', function () { moveActiveDeformer(1); });
        document.getElementById('btnTextAnimatorDeformerDuplicate').addEventListener('click', function () {
          var stack = mutableDeformerStack();
          var source = mutableActiveDeformer();
          if (!source || stack.nodes.length >= textAnimatorEngine.deformers.maxNodes) return;
          pushHistory();
          textAnimatorDeformerCounter++;
          var duplicate = JSON.parse(JSON.stringify(source));
          duplicate.id = 'deformer-' + Date.now().toString(36) + '-' + textAnimatorDeformerCounter;
          duplicate.name = (source.name + ' copy').slice(0, 40);
          var index = stack.nodes.indexOf(source) + 1;
          stack.nodes.splice(index, 0, duplicate);
          stack.activeNodeId = duplicate.id;
          commitDeformerChange();
        });
        document.getElementById('btnTextAnimatorDeformerDelete').addEventListener('click', function () {
          var stack = mutableDeformerStack();
          var node = mutableActiveDeformer();
          if (!node) return;
          pushHistory();
          var index = stack.nodes.indexOf(node);
          stack.nodes.splice(index, 1);
          stack.activeNodeId = stack.nodes.length ? stack.nodes[Math.min(index, stack.nodes.length - 1)].id : '';
          if (!stack.nodes.length) stack.enabled = false;
          commitDeformerChange();
        });
        document.getElementById('pTextAnimatorDeformerNodeEnabled').addEventListener('change', function (event) {
          var node = mutableActiveDeformer();
          if (!node) return;
          pushHistory();
          node.enabled = event.target.checked;
          commitDeformerChange();
        });
        document.getElementById('pTextAnimatorDeformerAxis').addEventListener('change', function (event) {
          var node = mutableActiveDeformer();
          if (!node) return;
          pushHistory();
          node.axis = event.target.value;
          commitDeformerChange();
        });

        for (var i = 0; i < TEXT_ANIMATOR_DEFORMER_SPECS.length; i++) {
          (function (spec) {
            var input = document.getElementById(spec[0]);
            var historyOpen = false;
            function beginHistory() {
              if (historyOpen || !mutableActiveDeformer()) return;
              pushHistory();
              historyOpen = true;
            }
            input.addEventListener('pointerdown', beginHistory);
            input.addEventListener('keydown', beginHistory);
            input.addEventListener('pointerup', function () { historyOpen = false; });
            input.addEventListener('change', function () { historyOpen = false; });
            input.addEventListener('input', function () {
              var node = mutableActiveDeformer();
              if (!node) return;
              node[spec[2]] = Number(input.value);
              document.getElementById(spec[1]).textContent = Number(input.value).toFixed(spec[3]) + spec[4];
              commitDeformerChange(false);
            });
          })(TEXT_ANIMATOR_DEFORMER_SPECS[i]);
        }
        syncDeformerStackUI();
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
  "        syncKeyframeTimelineUI();\n        updateTextAnimatorStatus();",
  "        syncKeyframeTimelineUI();\n        syncDeformerStackUI();\n        updateTextAnimatorStatus();",
  'Text Animator UI sync hook'
);
html = replaceOnce(
  html,
  "        bindKeyframeTimelineUI();\n        document.getElementById('pTextAnimatorEnabled')",
  "        bindKeyframeTimelineUI();\n        bindDeformerStackUI();\n        document.getElementById('pTextAnimatorEnabled')",
  'Text Animator UI bind hook'
);

fs.writeFileSync(indexPath, html);
console.log('Applied ordered deformer stack integration.');
