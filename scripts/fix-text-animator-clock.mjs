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
            // Timers continue to receive heavily throttled callbacks in hidden
            // tabs. Freeze the phase there instead of producing a large jump
            // when the document becomes visible again.
            if (document.hidden) {
              textAnimatorLastTime = 0;
              scheduleTextAnimatorTick(tick, 250);
              return;
            }
            if (!textAnimatorLastTime) textAnimatorLastTime = now;
            var delta = Math.min(0.1, Math.max(0, (now - textAnimatorLastTime) / 1000));
            textAnimatorLastTime = now;
            params.textAnimator.phase = (params.textAnimator.phase + delta * textAnimatorPlaybackSpeed() + 1) % 1;
            syncTextAnimatorPhaseUI();
            applyTextAnimatorFrame(params.textAnimator.phase);
            scheduleTextAnimatorTick(tick, 16);
          }
          scheduleTextAnimatorTick(tick, 0);
        }
        updateTextAnimatorStatus();
      }
`;

const index = source.indexOf(before);
if (index < 0) throw new Error('Text Animator playback block was not found.');
if (source.indexOf(before, index + before.length) >= 0) {
  throw new Error('Text Animator playback block is ambiguous.');
}
source = source.slice(0, index) + after + source.slice(index + before.length);
fs.writeFileSync(indexPath, source);
console.log('Applied Text Animator realtime clock fix.');
