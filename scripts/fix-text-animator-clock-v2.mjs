import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(root, 'index.html');
let source = fs.readFileSync(indexPath, 'utf8');

const before = `            // Timers continue to receive heavily throttled callbacks in hidden
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
`;

const after = `            // Keep the timeline tied to monotonic elapsed time. Hidden tabs are
            // sampled less often, but their phase still advances correctly; this
            // avoids background CPU churn without leaving the playhead stale.
            if (!textAnimatorLastTime) {
              textAnimatorLastTime = now;
            } else {
              var delta = Math.max(0, (now - textAnimatorLastTime) / 1000);
              textAnimatorLastTime = now;
              params.textAnimator.phase = (params.textAnimator.phase + delta * textAnimatorPlaybackSpeed() + 1) % 1;
              syncTextAnimatorPhaseUI();
              applyTextAnimatorFrame(params.textAnimator.phase);
            }
            scheduleTextAnimatorTick(tick, document.hidden ? 250 : 16);
`;

const index = source.indexOf(before);
if (index < 0) throw new Error('Frozen Text Animator clock block was not found.');
if (source.indexOf(before, index + before.length) >= 0) {
  throw new Error('Frozen Text Animator clock block is ambiguous.');
}
source = source.slice(0, index) + after + source.slice(index + before.length);
fs.writeFileSync(indexPath, source);
console.log('Applied monotonic Text Animator clock fix.');
