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
    '''  <script src="autosave-controller.js"></script>
  <script>
    (function () {''',
    '''  <script src="autosave-controller.js"></script>
  <script src="confuse-prewarm.js"></script>
  <script>
    (function () {''',
    'prewarm loader',
)

replace_once(
    '''      function loadConfuseDictionary() {
        if (CONFUSE_DATA) {
          confuseDictionaryState = 'ready';
          return Promise.resolve(CONFUSE_DATA);
        }
        if (confuseDictionaryPromise) return confuseDictionaryPromise;
        confuseDictionaryState = 'loading';
        confuseDictionaryPromise = new Promise(function (resolve, reject) {''',
    '''      function adoptConfuseDictionaryGlobal() {
        if (!CONFUSE_DATA && window.TYPE_DEFORMER_CONFUSE_DICTIONARY) {
          CONFUSE_DATA = window.TYPE_DEFORMER_CONFUSE_DICTIONARY;
        }
        return CONFUSE_DATA;
      }

      function loadConfuseDictionary() {
        adoptConfuseDictionaryGlobal();
        if (CONFUSE_DATA) {
          confuseDictionaryState = 'ready';
          return Promise.resolve(CONFUSE_DATA);
        }
        if (confuseDictionaryPromise) return confuseDictionaryPromise;
        if (window.TYPE_DEFORMER_CONFUSE_PRELOAD_PROMISE) {
          confuseDictionaryState = 'loading';
          confuseDictionaryPromise = Promise.resolve(window.TYPE_DEFORMER_CONFUSE_PRELOAD_PROMISE)
            .then(function (data) {
              CONFUSE_DATA = data || window.TYPE_DEFORMER_CONFUSE_DICTIONARY || null;
              if (!CONFUSE_DATA) throw new Error('Unicode dictionary did not expose data');
              confuseDictionaryState = 'ready';
              return CONFUSE_DATA;
            }).catch(function (error) {
              confuseDictionaryPromise = null;
              confuseDictionaryState = 'error';
              throw error;
            });
          return confuseDictionaryPromise;
        }
        confuseDictionaryState = 'loading';
        confuseDictionaryPromise = new Promise(function (resolve, reject) {''',
    'dictionary loader handoff',
)

INDEX.write_text(text, encoding='utf-8')

package_path = ROOT / 'package.json'
package_data = json.loads(package_path.read_text(encoding='utf-8'))
package_data['scripts']['check'] = (
    'node scripts/validate.mjs && node --check autosave-controller.js '
    '&& node --check confuse-prewarm.js'
)
package_path.write_text(json.dumps(package_data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

print('Confuse prewarm integration applied.')
