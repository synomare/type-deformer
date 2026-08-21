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

const after = `      function scheduleTextAnimatorTick(tick, delay) {
        textAnimatorPlayRaf = setTimeout(function () {
          tick(performance.now());
        }, delay);
      }

      function setTextAnimatorPlaying(playing) {
        if (!params.textAnimator.enabled) playing = false;
        if (!playing && textAnimatorPlayRaf !== null) {
          clearTimeout(textAnimatorPlayRaf);
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
          function tick(now) {
            if (textAnimatorPlayRaf === null || !params.textAnimator.enabled) return;
            if (!textAnimatorLastTime) textAnimatorLastTime = now;
            // Background tabs and headless browsers may throttle timers. The
            // delta cap prevents a later callback from jumping the animation.
            var delta = Math.min(0.1, Math.max(0, (now - textAnimatorLastTime) / 1000));
            textAnimatorLastTime = now;
            // mutableActiveTextAnimator() normalizes and replaces the state
            // object. Resolve speed first, then write phase through the current
            // reference; otherwise the assignment lands on the discarded state.
            var playbackSpeed = textAnimatorPlaybackSpeed();
            params.textAnimator.phase = (params.textAnimator.phase + delta * playbackSpeed + 1) % 1;
            syncTextAnimatorPhaseUI();
            applyTextAnimatorFrame(params.textAnimator.phase);
            scheduleTextAnimatorTick(tick, 16);
          }
          scheduleTextAnimatorTick(tick, 0);
        }
        updateTextAnimatorStatus();
      }

      window.TypeDeformerTextAnimatorRuntime = {
        play: function () { setTextAnimatorPlaying(true); },
        pause: function () { setTextAnimatorPlaying(false); },
        setPhase: function (phase) {
          params.textAnimator.phase = ((Number(phase) || 0) % 1 + 1) % 1;
          syncTextAnimatorPhaseUI();
          applyTextAnimatorFrame(params.textAnimator.phase);
          markAutosaveDirty();
          return params.textAnimator.phase;
        },
        snapshot: function () {
          var active = mutableActiveTextAnimator();
          return {
            enabled: !!params.textAnimator.enabled,
            playing: textAnimatorPlayRaf !== null,
            phase: Number(params.textAnimator.phase) || 0,
            lastTime: Number(textAnimatorLastTime) || 0,
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
console.log('Applied Text Animator realtime clock fix.');
