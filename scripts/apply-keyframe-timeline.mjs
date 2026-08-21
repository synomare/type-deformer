import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(root, 'index.html');

function replaceOnce(source, needle, replacement, label) {
  const index = source.indexOf(needle);
  if (index < 0) throw new Error(`Patch anchor not found: ${label}`);
  if (source.indexOf(needle, index + needle.length) >= 0) {
    throw new Error(`Patch anchor is ambiguous: ${label}`);
  }
  return source.slice(0, index) + replacement + source.slice(index + needle.length);
}

let html = fs.readFileSync(indexPath, 'utf8');

const css = String.raw`
    .text-timeline {
      margin: 0 0 0.75rem;
      padding-bottom: 0.75rem;
    }
    .text-timeline-toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 72px auto;
      gap: 0.4rem;
      align-items: end;
      margin-bottom: 0.55rem;
    }
    .text-timeline-field {
      display: grid;
      gap: 0.2rem;
      min-width: 0;
      color: var(--dim);
      font-size: 0.48rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .text-timeline-field select,
    .text-timeline-field input { min-width: 0; width: 100%; box-sizing: border-box; }
    .text-timeline-snap {
      min-height: 2.2rem;
      display: flex;
      align-items: center;
      gap: 0.35rem;
      color: var(--dim);
      font-size: 0.48rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .text-timeline-snap input { width: auto; }
    .text-timeline-ruler {
      position: relative;
      height: 48px;
      overflow: hidden;
      border: 1px solid var(--ink);
      background:
        repeating-linear-gradient(90deg, transparent 0, transparent calc(10% - 1px), var(--line) calc(10% - 1px), var(--line) 10%),
        color-mix(in srgb, var(--paper) 84%, transparent);
      touch-action: none;
      cursor: crosshair;
    }
    .text-timeline-ruler:focus-visible { outline: 2px solid var(--red); outline-offset: 2px; }
    .text-timeline-loop-start,
    .text-timeline-loop-end {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 1px;
      background: var(--ink);
      pointer-events: none;
    }
    .text-timeline-loop-start { left: 0; }
    .text-timeline-loop-end { right: 0; }
    .text-timeline-playhead {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      width: 1px;
      background: var(--red);
      pointer-events: none;
      z-index: 3;
    }
    .text-timeline-playhead::before {
      content: "";
      position: absolute;
      top: 0;
      left: -4px;
      width: 0;
      height: 0;
      border-left: 4px solid transparent;
      border-right: 4px solid transparent;
      border-top: 7px solid var(--red);
    }
    .text-timeline-key {
      position: absolute;
      left: 0;
      top: 25px;
      width: 13px;
      height: 13px;
      min-width: 0;
      margin: 0;
      padding: 0;
      border: 1px solid var(--ink);
      border-radius: 0;
      background: var(--paper);
      box-shadow: none;
      transform: translate(-50%, -50%) rotate(45deg);
      z-index: 4;
      touch-action: none;
    }
    .text-timeline-key:hover,
    .text-timeline-key:focus-visible,
    .text-timeline-key[aria-pressed="true"] {
      border-color: var(--red);
      background: var(--red);
      color: var(--paper);
      box-shadow: none;
      transform: translate(-50%, -50%) rotate(45deg) scale(1.12);
    }
    .text-timeline-scrub { width: 100%; margin: 0.45rem 0 0; }
    .text-timeline-readout {
      display: flex;
      justify-content: space-between;
      gap: 0.6rem;
      min-height: 1.5em;
      margin: 0.2rem 0 0.55rem;
      color: var(--dim);
      font-size: 0.5rem;
      letter-spacing: 0.06em;
    }
    .text-timeline-readout strong { color: var(--red); font-weight: 400; }
    .text-timeline-editor {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 0.45rem 0.7rem;
      align-items: end;
    }
    .text-timeline-editor .wide { grid-column: 1 / -1; }
    .text-timeline-actions {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.35rem;
      grid-column: 1 / -1;
    }
    .text-timeline-actions button { min-width: 0; box-shadow: none; }
    .text-timeline-status {
      min-height: 1.5em;
      margin: 0.45rem 0 0;
      color: var(--dim);
      font-size: 0.5rem;
      letter-spacing: 0.04em;
    }
    .text-timeline-status[data-state="active"] { color: var(--red); }
    @media (max-width: 760px) {
      .text-timeline-toolbar { grid-template-columns: minmax(0, 1fr) 74px; }
      .text-timeline-snap { grid-column: 1 / -1; min-height: 44px; }
      .text-timeline-ruler { height: 58px; }
      .text-timeline-key { top: 30px; width: 16px; height: 16px; }
      .text-timeline-editor { grid-template-columns: minmax(0, 1fr); }
      .text-timeline-editor .wide,
      .text-timeline-actions { grid-column: auto; }
      .text-timeline-actions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .text-timeline-actions button { min-height: 44px; }
    }
`;

html = replaceOnce(
  html,
  `    .text-animator-panel details > summary::after {\n      content: "+";`,
  `${css}\n    .text-animator-panel details > summary::after {\n      content: "+";`,
  'timeline CSS'
);

const timelineHtml = String.raw`
        <details open id="textTimelinePanel">
          <summary>Timeline / Keyframes</summary>
          <div class="text-timeline">
            <div class="text-timeline-toolbar">
              <label class="text-timeline-field" for="pTextTimelineProperty"><span>Property</span><select id="pTextTimelineProperty"></select></label>
              <label class="text-timeline-field" for="pTextTimelineFps"><span>FPS</span><input type="number" id="pTextTimelineFps" min="1" max="120" step="1" value="30"></label>
              <label class="text-timeline-snap" for="pTextTimelineSnap"><input type="checkbox" id="pTextTimelineSnap" checked>Snap to frames</label>
            </div>
            <div class="text-timeline-ruler" id="textTimelineRuler" tabindex="0" role="group" aria-label="Keyframe timeline">
              <span class="text-timeline-loop-start" aria-hidden="true"></span>
              <span class="text-timeline-loop-end" aria-hidden="true"></span>
              <span class="text-timeline-playhead" id="textTimelinePlayhead" aria-hidden="true"></span>
            </div>
            <input class="text-timeline-scrub" type="range" id="pTextTimelineScrub" min="0" max="1" step="0.001" value="0" aria-label="Timeline playhead">
            <div class="text-timeline-readout"><strong id="vTextTimelineTime">0.000 · F000</strong><span id="vTextTimelineSample">0px</span></div>
            <div class="text-timeline-editor">
              <label class="text-timeline-field wide" for="pTextTimelineKey"><span>Keyframe</span><select id="pTextTimelineKey"><option value="">No key selected</option></select></label>
              <label class="text-timeline-field" for="pTextTimelineValue"><span>Value</span><input type="number" id="pTextTimelineValue" step="1" value="0"></label>
              <label class="text-timeline-field" for="pTextTimelineEasing"><span>Outgoing interpolation</span><select id="pTextTimelineEasing"><option value="linear">Linear</option><option value="hold">Hold</option><option value="easeIn">Ease In</option><option value="easeOut">Ease Out</option><option value="easeInOut">Ease In-Out</option></select></label>
              <div class="text-timeline-actions">
                <button type="button" id="btnTextTimelineSet">Add key</button>
                <button type="button" id="btnTextTimelineDuplicate">Duplicate</button>
                <button type="button" id="btnTextTimelineDelete">Delete</button>
                <button type="button" id="btnTextTimelineCopy">Copy track</button>
                <button type="button" id="btnTextTimelinePaste">Paste track</button>
              </div>
            </div>
            <p class="text-timeline-status" id="textTimelineStatus" role="status" aria-live="polite">No keyframes</p>
          </div>
        </details>

`;

html = replaceOnce(
  html,
  `        </details>\n\n        <div class="text-animator-presets" aria-label="Text animator presets">`,
  `        </details>\n\n${timelineHtml}        <div class="text-animator-presets" aria-label="Text animator presets">`,
  'timeline panel'
);

html = replaceOnce(
  html,
  `  <script src="text-animator.js"></script>\n  <script>`,
  `  <script src="text-animator.js"></script>\n  <script src="text-animator-timeline.js"></script>\n  <script>`,
  'timeline engine script'
);

const runtimeStart = html.indexOf('      window.TypeDeformerTextAnimatorRuntime = {');
if (runtimeStart < 0) throw new Error('Text Animator runtime bridge anchor was not found.');
const runtimeEndMarker = '\n      };';
const runtimeEnd = html.indexOf(runtimeEndMarker, runtimeStart);
if (runtimeEnd < 0) throw new Error('Text Animator runtime bridge end was not found.');
const bridge = String.raw`

      window.TypeDeformerTextAnimatorBridge = {
        getState: function () {
          params.textAnimator = textAnimatorEngine.normalizeState(params.textAnimator);
          return JSON.parse(JSON.stringify(params.textAnimator));
        },
        getActiveAnimator: function () {
          return JSON.parse(JSON.stringify(mutableActiveTextAnimator()));
        },
        pushHistory: function () { pushHistory(); },
        replaceActiveAnimator: function (nextAnimator, options) {
          options = options || {};
          params.textAnimator = textAnimatorEngine.normalizeState(params.textAnimator);
          var activeId = params.textAnimator.activeAnimatorId;
          if (options.history !== false) pushHistory();
          var normalized = textAnimatorEngine.normalizeAnimator(nextAnimator);
          normalized.id = activeId;
          for (var i = 0; i < params.textAnimator.animators.length; i++) {
            if (params.textAnimator.animators[i].id === activeId) {
              params.textAnimator.animators[i] = normalized;
              break;
            }
          }
          params.textAnimator.enabled = true;
          commitTextAnimatorChange(options.resync !== false);
          return JSON.parse(JSON.stringify(normalized));
        },
        setPhase: function (value, options) {
          options = options || {};
          params.textAnimator = textAnimatorEngine.normalizeState(params.textAnimator);
          params.textAnimator.phase = textAnimatorEngine.timeline.normalizePhase(value);
          syncTextAnimatorPhaseUI();
          applyTextAnimatorFrame(params.textAnimator.phase);
          if (options.dirty !== false) markAutosaveDirty();
          return params.textAnimator.phase;
        },
        refresh: function () {
          syncTextAnimatorUI();
          applyTextAnimatorFrame(params.textAnimator.phase);
        }
      };
`;
html = html.slice(0, runtimeEnd + runtimeEndMarker.length)
  + bridge
  + html.slice(runtimeEnd + runtimeEndMarker.length);

html = replaceOnce(
  html,
  `\n</body>\n</html>`,
  `\n  <script src="text-animator-timeline-ui.js"></script>\n</body>\n</html>`,
  'timeline UI script'
);

fs.writeFileSync(indexPath, html);
console.log('Applied keyframe timeline integration.');
