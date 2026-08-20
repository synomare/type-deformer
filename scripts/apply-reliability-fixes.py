#!/usr/bin/env python3

from pathlib import Path
import json

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / 'index.html'
text = INDEX.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one occurrence, found {count}')
    text = text.replace(old, new, 1)


replace_once(
    '''          <select id="pVideoFormat">
            <option value="auto" selected>Auto</option>
            <option value="webm">WebM</option>
            <option value="mp4">MP4 — browser beta</option>
          </select>''',
    '''          <select id="pVideoFormat">
            <option value="auto" selected>Auto — WebM</option>
            <option value="webm">WebM</option>
            <option value="mp4" disabled>MP4 — exact timing unavailable</option>
          </select>''',
    'video format options',
)

replace_once(
    '''        <p class="note">指定秒数の中に選択した回数の完全なループを収録します。透過はWebM / VP9対応ブラウザでのみ保持される場合があります。MP4出力はブラウザの対応状況に依存するベータ機能です。</p>''',
    '''        <p class="note">指定秒数の中に選択した回数の完全なループをWebMで収録します。透過はVP9対応ブラウザでのみ保持される場合があります。MP4はMediaRecorderだけではフレーム時刻を保証できないため、正確な尺を実装するまで無効化しています。</p>''',
    'video timing note',
)

replace_once(
    '''        var mp4 = [
          'video/mp4;codecs=avc1.42E01E',
          'video/mp4'
        ];
        var candidates;
        if (format === 'webm') candidates = webm;
        else if (format === 'mp4') candidates = mp4;
        else candidates = webm.concat(mp4);''',
    '''        var candidates;
        if (format === 'mp4') return '';
        // Auto deliberately remains WebM-only. MediaRecorder does not expose
        // timestamp control for MP4, so exact loop duration cannot be repaired
        // after capture the way the WebM timecode scale can.
        candidates = webm;''',
    'video MIME selection',
)

replace_once(
    '''      document.getElementById('pVideoFormat').addEventListener('change', function (e) {
        params.videoFormat = e.target.value;
        updateVideoExportAvailability(true);
      });''',
    '''      document.getElementById('pVideoFormat').addEventListener('change', function (e) {
        params.videoFormat = e.target.value === 'webm' ? 'webm' : 'auto';
        updateVideoExportAvailability(true);
      });''',
    'video format change handler',
)

replace_once(
    "        document.getElementById('pVideoFormat').value = params.videoFormat;",
    "        if (params.videoFormat === 'mp4') params.videoFormat = 'auto';\n        document.getElementById('pVideoFormat').value = params.videoFormat;",
    'legacy MP4 project normalization',
)

replace_once(
    '''        var frameDurationMs = 1000 / fps;
        recorder.start(250);
        function recordNextFrame() {''',
    '''        var frameDurationMs = 1000 / fps;
        try {
          recorder.start(250);
        } catch (startError) {
          videoExportState.error = startError && startError.message
            ? startError.message : 'MediaRecorderを開始できません。';
          finishVideoExport();
          return;
        }
        function recordNextFrame() {''',
    'MediaRecorder start cleanup',
)

replace_once(
    '''      <div class="btns">
        <button id="btnSaveProj">Save .json</button>
        <button id="btnLoadProj">Load .json</button>
        <button class="primary" id="btnShare">Share URL</button>
        <input type="file" id="projFile" accept=".json,application/json" hidden>
      </div>
      <div class="danger-zone"><button id="btnNew">New 新規</button></div>''',
    '''      <div class="btns">
        <button id="btnSaveProj">Save .json</button>
        <button id="btnLoadProj">Load .json</button>
        <button class="primary" id="btnShare">Share URL</button>
        <input type="file" id="projFile" accept=".json,application/json" hidden>
      </div>
      <p class="autosave-status" id="autosaveStatus" role="status" aria-live="polite" data-state="ready">Autosave ready</p>
      <div class="danger-zone"><button id="btnNew">New 新規</button></div>''',
    'autosave status markup',
)

autosave_css = '''    .autosave-status {
      display: flex;
      align-items: center;
      gap: 0.55rem;
      min-height: 1.6rem;
      margin: 0.7rem 0 0;
      color: var(--dim);
      font-family: var(--mono);
      font-size: 0.52rem;
      letter-spacing: 0.06em;
      line-height: 1.45;
    }
    .autosave-status::before {
      content: "";
      width: 0.48rem;
      height: 0.48rem;
      flex: 0 0 auto;
      border: 1px solid currentColor;
      border-radius: 50%;
      background: transparent;
    }
    .autosave-status[data-state="saving"]::before,
    .autosave-status[data-state="saved"]::before { background: currentColor; }
    .autosave-status[data-state="pending"] { color: var(--ink); }
    .autosave-status[data-state="failed"] { color: var(--red); }

'''
replace_once('    /* paper grain */', autosave_css + '    /* paper grain */', 'autosave status CSS')

block_start = text.index('      /* ---------------- autosave ---------------- */')
block_end = text.index('      /* ---------------- parameter presets ---------------- */', block_start)
autosave_adapter = '''      /* ---------------- autosave ---------------- */
      var autosaveController = window.TypeDeformerAutosave.create({
        projectData: projectData,
        isProjectData: isProjectData,
        loadProject: loadProject,
        statusElement: document.getElementById('autosaveStatus'),
        intervalMs: 8000,
        isPlaybackActive: function () { return compositionPlayRaf !== null; },
        isTyping: function () { return rebuildTimer !== null && document.activeElement === textInput; }
      });

      function markAutosaveDirty() { autosaveController.markDirty(); }
      function saveAutosave() { return autosaveController.save(); }
      function cancelScheduledAutosave() { autosaveController.cancelScheduled(); }
      function scheduleAutosave() { autosaveController.schedule(); }
      function tryRestoreAutosave() { return autosaveController.restore(); }

      function startAutosave() {
        var panel = document.querySelector('.panel');
        if (panel) {
          panel.addEventListener('input', markAutosaveDirty, true);
          panel.addEventListener('change', markAutosaveDirty, true);
          panel.addEventListener('click', flushPendingTextRebuild, true);
        }
        autosaveController.start();
      }

      document.getElementById('btnNew').addEventListener('click', function () {
        if (!confirm('作品を初期化しますか？（自動保存も消去されます）')) return;
        autosaveController.suspend();
        autosaveController.setStatus('saving', 'Clearing autosave…');
        autosaveController.clear().then(function () {
          location.replace(location.href.split('#')[0]);
        }, function () {
          location.replace(location.href.split('#')[0]);
        });
      });

'''
text = text[:block_start] + autosave_adapter + text[block_end:]

replace_once(
    '''      tryRestoreFromHash().then(function (fromHash) {
        if (!fromHash) tryRestoreAutosave();
        startAutosave();
      });''',
    '''      tryRestoreFromHash().then(function (fromHash) {
        if (fromHash) return false;
        return tryRestoreAutosave();
      }).catch(function (error) {
        autosaveController.setStatus('failed', 'Autosave restore failed');
        if (window.console && console.error) console.error('Type Deformer restore failed:', error);
        return false;
      }).then(function () {
        startAutosave();
      });''',
    'asynchronous autosave restore boot',
)

replace_once(
    '''  <script>
    (function () {''',
    '''  <script src="autosave-controller.js"></script>
  <script>
    (function () {''',
    'autosave controller loader',
)

INDEX.write_text(text, encoding='utf-8')

package_path = ROOT / 'package.json'
package_data = json.loads(package_path.read_text(encoding='utf-8'))
package_data['scripts'] = {
    'check': 'node scripts/validate.mjs && node --check autosave-controller.js',
    'test': 'npm run check',
    'test:e2e': 'playwright test',
    'test:all': 'npm run check && npm run test:e2e',
    'serve': 'node scripts/serve.mjs',
}
package_data['engines'] = {'node': '>=24'}
package_path.write_text(json.dumps(package_data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

validate_workflow = '''name: Validate repository

on:
  push:
  pull_request:

permissions:
  contents: read

concurrency:
  group: validate-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  validate:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Check out repository
        uses: actions/checkout@v7

      - name: Set up Node.js
        uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm

      - name: Validate source and generated dictionary
        run: npm test

  browser-smoke:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Check out repository
        uses: actions/checkout@v7

      - name: Set up Node.js
        uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Install Chromium
        run: npx playwright install --with-deps chromium

      - name: Run browser smoke tests
        run: npm run test:e2e
'''
(ROOT / '.github/workflows/validate.yml').write_text(validate_workflow, encoding='utf-8')

print('Reliability integration patch applied.')
