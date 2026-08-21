import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(root, 'index.html');
let source = fs.readFileSync(indexPath, 'utf8');

const before = `      function setTextAnimatorPlaying(playing) {
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
`;

const after = `      var textAnimatorTickCount = 0;
      var textAnimatorLastDelta = 0;

      function setTextAnimatorPlaying(playing) {
        if (!params.textAnimator.enabled) playing = false;
        if (!playing && textAnimatorPlayRaf !== null) {
          clearInterval(textAnimatorPlayRaf);
          textAnimatorPlayRaf = null;
          textAnimatorLastTime = 0;
          textAnimatorLastDelta = 0;
          markAutosaveDirty();
          if (typeof scheduleAutosave === 'function') scheduleAutosave();
        }
        var button = document.getElementById('btnTextAnimatorPlay');
        if (button) {
          button.setAttribute('aria-pressed', String(playing));
          button.textContent = playing ? 'Pause' : 'Play';
        }
        if (playing && textAnimatorPlayRaf === null) {
          textAnimatorLastTime = performance.now();
          textAnimatorPlayRaf = setInterval(function () {
            if (textAnimatorPlayRaf === null || !params.textAnimator.enabled) return;
            var now = performance.now();
            var delta = Math.min(0.1, Math.max(0, (now - textAnimatorLastTime) / 1000));
            textAnimatorLastTime = now;
            textAnimatorLastDelta = delta;
            textAnimatorTickCount++;

            // Read the active speed first because resolving the active animator
            // normalizes and replaces params.textAnimator. Then write the phase
            // into one explicit normalized state object.
            var playbackSpeed = textAnimatorPlaybackSpeed();
            var nextState = textAnimatorEngine.normalizeState(params.textAnimator);
            nextState.phase = (nextState.phase + delta * playbackSpeed + 1) % 1;
            params.textAnimator = nextState;
            syncTextAnimatorPhaseUI();
            applyTextAnimatorFrame(nextState.phase);
          }, 16);
        }
        updateTextAnimatorStatus();
      }

      window.TypeDeformerTextAnimatorRuntime = {
        play: function () { setTextAnimatorPlaying(true); },
        pause: function () { setTextAnimatorPlaying(false); },
        setPhase: function (phase) {
          var nextState = textAnimatorEngine.normalizeState(params.textAnimator);
          nextState.phase = ((Number(phase) || 0) % 1 + 1) % 1;
          params.textAnimator = nextState;
          syncTextAnimatorPhaseUI();
          applyTextAnimatorFrame(nextState.phase);
          markAutosaveDirty();
          return nextState.phase;
        },
        snapshot: function () {
          var active = mutableActiveTextAnimator();
          return {
            enabled: !!params.textAnimator.enabled,
            playing: textAnimatorPlayRaf !== null,
            phase: Number(params.textAnimator.phase) || 0,
            lastTime: Number(textAnimatorLastTime) || 0,
            lastDelta: Number(textAnimatorLastDelta) || 0,
            tickCount: textAnimatorTickCount,
            timerHandle: textAnimatorPlayRaf,
            speed: Number(active.motion.speed) || 0,
            motionEnabled: !!active.motion.enabled,
            visibility: document.visibilityState
          };
        }
      };
`;

const index = source.indexOf(before);
if (index < 0) throw new Error('Text Animator playback block was not found.');
if (source.indexOf(before, index + before.length) >= 0) {
  throw new Error('Text Animator playback block is ambiguous.');
}
source = source.slice(0, index) + after + source.slice(index + before.length);
fs.writeFileSync(indexPath, source);
console.log('Applied Text Animator isolated playback clock.');
