// Look Memory controller: owns slot controls, confirmations, thumbnails and comparison overlay.
// This is authored source. Editor and tests consume this file directly.
(function (root) {
  'use strict';
  function create(options) {
    options = options || {};
      var lookMemory = options.memory;
      var LOOK_MEMORY_SLOT_IDS = options.slotIds;
      var PARAM_DEFAULTS = options.defaults;
      var OPERATOR_IDS = options.operatorIds;
      var cloneCompositionDefaults = options.compositionDefaults;
      var currentLookState = options.captureState;
      var currentLookSummary = options.summary;
      var renderCanvasScreenshot = options.screenshot;
      var markAutosaveDirty = options.dirty;
      var scheduleAutosave = options.save;
      var applyLookState = options.applyState;
      /* ---------------- Look Memory: full-scene takes + A/B wipe ----------------
         A parameter preset is intentionally lightweight and reusable across
         texts. Look Memory is the opposite: it records the exact artwork,
         including source text, per-glyph application, compositor order,
         Composition and output conditions. Four explicit slots keep this
         powerful state model legible on an iPhone. */
      function cleanLookName(value, fallback) {
        value = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : '';
        return value.slice(0, 32) || fallback;
      }

      function cloneLookMemory() {
        return JSON.parse(JSON.stringify(lookMemory));
      }

      function cloneKnownParams(source) {
        var result = {};
        source = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
        for (var key in PARAM_DEFAULTS) {
          if (Object.prototype.hasOwnProperty.call(source, key)) result[key] = source[key];
        }
        return result;
      }

      function normalizeLookState(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        if (typeof raw.text !== 'string' || raw.text.length > 500000) return null;
        if (!raw.params || typeof raw.params !== 'object' || Array.isArray(raw.params)) return null;
        if (raw.letters != null && !Array.isArray(raw.letters)) return null;
        if ((raw.letters || []).length > 200000) return null;
        var version = raw.version == null ? 28 : Number(raw.version);
        if (!Number.isInteger(version) || version < 1 || version > 93) return null;
        return {
          version: version,
          text: raw.text,
          params: cloneKnownParams(raw.params),
          batchProfiles: raw.batchProfiles && typeof raw.batchProfiles === 'object'
            ? JSON.parse(JSON.stringify(raw.batchProfiles)) : {},
          composition: raw.composition && typeof raw.composition === 'object'
            ? JSON.parse(JSON.stringify(raw.composition)) : cloneCompositionDefaults(),
          letters: JSON.parse(JSON.stringify((raw.letters || []).slice(0, 200000)))
        };
      }

      function normalizeLookSummary(raw, state) {
        raw = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
        var names = Array.isArray(raw.names) ? raw.names : [];
        var cleanNames = [];
        for (var i = 0; i < names.length && cleanNames.length < 4; i++) {
          var name = cleanLookName(names[i], '');
          if (name) cleanNames.push(name);
        }
        return {
          names: cleanNames,
          effectCount: Math.max(0, Math.min(OPERATOR_IDS.length + 1, Math.round(Number(raw.effectCount) || cleanNames.length))),
          glyphCount: Math.max(0, Math.min(500000, Math.round(Number(raw.glyphCount) || Array.from(state.text).length))),
          composition: cleanLookName(raw.composition, '')
        };
      }

      function normalizeLookMemory(raw) {
        var out = { schemaVersion: 1, active: -1, slots: [null, null, null, null] };
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
        var sourceSlots = Array.isArray(raw.slots) ? raw.slots : [];
        for (var i = 0; i < LOOK_MEMORY_SLOT_IDS.length; i++) {
          var source = sourceSlots[i];
          if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
          var state = normalizeLookState(source.state);
          if (!state) continue;
          var preview = typeof source.preview === 'string' && /^data:image\/(?:jpeg|png);base64,/i.test(source.preview)
            && source.preview.length <= 1200000 ? source.preview : '';
          out.slots[i] = {
            name: cleanLookName(source.name, 'Look ' + LOOK_MEMORY_SLOT_IDS[i]),
            createdAt: Math.max(0, Math.round(Number(source.createdAt) || 0)),
            preview: preview,
            summary: normalizeLookSummary(source.summary, state),
            state: state
          };
        }
        var active = Math.round(Number(raw.active));
        out.active = active >= 0 && active < LOOK_MEMORY_SLOT_IDS.length && out.slots[active] ? active : -1;
        return out;
      }



      function createLookPreview() {
        var source = renderCanvasScreenshot();
        var maxWidth = 960;
        var maxHeight = 600;
        var ratio = Math.min(1, maxWidth / Math.max(1, source.width), maxHeight / Math.max(1, source.height));
        var canvas = (globalThis.TypeDeformerRenderContext ? globalThis.TypeDeformerRenderContext.createCanvas() : document.createElement('canvas'));
        canvas.width = Math.max(1, Math.round(source.width * ratio));
        canvas.height = Math.max(1, Math.round(source.height * ratio));
        var context = canvas.getContext('2d');
        if (!context) return '';
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.72);
      }

      function lookMemoryDescription(slot) {
        if (!slot) return 'Empty — 現在の作品を記憶できます';
        var summary = slot.summary || {};
        var names = (summary.names || []).join(' · ');
        if (!names) names = 'No applied effects';
        var more = summary.effectCount > (summary.names || []).length
          ? ' +' + (summary.effectCount - summary.names.length) : '';
        return names + more + ' / ' + summary.glyphCount + ' glyphs';
      }

      var lookMemoryGrid = document.getElementById('lookMemoryGrid');
      var lookMemoryCount = document.getElementById('lookMemoryCount');
      var lookMemoryStatus = document.getElementById('lookMemoryStatus');
      var lookMemoryBlock = document.getElementById('lookMemoryBlock');
      var btnLookCompare = document.getElementById('btnLookCompare');
      var btnLookReturn = document.getElementById('btnLookReturn');
      var LOOK_MEMORY_DEFAULT_STATUS = '空の枠へCaptureすると、現在の作品状態を記憶します。';
      var lookMemoryStatusTimer = null;
      var lookMemoryConfirmIndex = -1;
      var lookMemoryConfirmAction = '';
      var lookMemoryConfirmTimer = null;
      var lookMemoryBusyIndex = -1;

      function setLookMemoryStatus(message, state, sticky) {
        if (lookMemoryStatusTimer !== null) {
          clearTimeout(lookMemoryStatusTimer);
          lookMemoryStatusTimer = null;
        }
        lookMemoryStatus.textContent = message || LOOK_MEMORY_DEFAULT_STATUS;
        if (state) lookMemoryStatus.dataset.state = state;
        else lookMemoryStatus.removeAttribute('data-state');
        if (message && !sticky) {
          lookMemoryStatusTimer = setTimeout(function () {
            lookMemoryStatusTimer = null;
            lookMemoryStatus.textContent = LOOK_MEMORY_DEFAULT_STATUS;
            lookMemoryStatus.removeAttribute('data-state');
          }, 5000);
        }
      }

      function focusLookMemoryAction(index, action) {
        requestAnimationFrame(function () {
          var card = lookMemoryGrid.querySelector('.look-memory-card[data-slot="'
            + LOOK_MEMORY_SLOT_IDS[index] + '"]');
          var button = card && card.querySelector('[data-look-action="' + action + '"]');
          if (!button || button.disabled) return;
          try { button.focus({ preventScroll: true }); }
          catch (focusError) { button.focus(); }
        });
      }

      function clearLookMemoryConfirmationState() {
        if (lookMemoryConfirmTimer !== null) {
          clearTimeout(lookMemoryConfirmTimer);
          lookMemoryConfirmTimer = null;
        }
        lookMemoryConfirmIndex = -1;
        lookMemoryConfirmAction = '';
      }

      function cancelLookMemoryConfirmation(announce, restoreFocus) {
        if (lookMemoryConfirmIndex < 0 || !lookMemoryConfirmAction) return;
        var index = lookMemoryConfirmIndex;
        var action = lookMemoryConfirmAction;
        clearLookMemoryConfirmationState();
        syncLookMemoryUI();
        if (announce) {
          setLookMemoryStatus((action === 'overwrite' ? 'Overwrite' : 'Clear')
            + ' cancelled · Look ' + LOOK_MEMORY_SLOT_IDS[index] + 'は変更されていません。', 'done', false);
        } else setLookMemoryStatus('', '', false);
        if (restoreFocus) focusLookMemoryAction(index, action === 'overwrite' ? 'capture' : 'clear');
      }

      function armLookMemoryConfirmation(action, index) {
        cancelLookMemoryConfirmation(false, false);
        lookMemoryConfirmAction = action;
        lookMemoryConfirmIndex = index;
        syncLookMemoryUI();
        var slotId = LOOK_MEMORY_SLOT_IDS[index];
        var message = action === 'overwrite'
          ? 'Look ' + slotId + 'を上書きします · 8秒以内に「Confirm overwrite」をもう一度押してください。'
          : 'Look ' + slotId + 'を消去します · 8秒以内に「Confirm clear」をもう一度押してください。';
        setLookMemoryStatus(message, 'warning', true);
        focusLookMemoryAction(index, action === 'overwrite' ? 'capture' : 'clear');
        lookMemoryConfirmTimer = setTimeout(function () {
          lookMemoryConfirmTimer = null;
          cancelLookMemoryConfirmation(true, true);
        }, 8000);
      }

      function buildLookMemoryCard(index) {
        var slot = lookMemory.slots[index];
        var slotId = LOOK_MEMORY_SLOT_IDS[index];
        var isBusy = lookMemoryBusyIndex >= 0;
        var confirmingOverwrite = lookMemoryConfirmIndex === index && lookMemoryConfirmAction === 'overwrite';
        var confirmingClear = lookMemoryConfirmIndex === index && lookMemoryConfirmAction === 'clear';
        var card = document.createElement('div');
        card.className = 'look-memory-card'
          + (lookMemory.active === index ? ' is-active' : '')
          + (confirmingOverwrite || confirmingClear ? ' is-confirming' : '');
        card.dataset.slot = slotId;
        card.setAttribute('role', 'group');
        card.setAttribute('aria-label', 'Look Memory ' + slotId + (slot ? ' saved' : ' empty'));

        var preview = document.createElement('div');
        preview.className = 'look-memory-preview';
        var badge = document.createElement('span');
        badge.className = 'look-memory-slot';
        badge.textContent = slotId;
        preview.appendChild(badge);
        var previewImage = null;
        if (slot && slot.preview) {
          previewImage = document.createElement('img');
          previewImage.src = slot.preview;
          previewImage.alt = (slot.name || ('Look ' + slotId)) + ' preview';
          preview.appendChild(previewImage);
        } else {
          var empty = document.createElement('span');
          empty.className = 'look-memory-empty';
          empty.textContent = slot ? 'preview unavailable' : 'empty';
          preview.appendChild(empty);
        }
        card.appendChild(preview);

        var body = document.createElement('div');
        body.className = 'look-memory-card-body';
        var input = document.createElement('input');
        input.className = 'look-memory-name';
        input.type = 'text';
        input.maxLength = 32;
        input.value = slot ? slot.name : 'Look ' + slotId;
        input.disabled = !slot || isBusy || confirmingOverwrite || confirmingClear;
        input.setAttribute('aria-label', 'Name Look Memory ' + slotId);
        input.addEventListener('change', function () {
          if (!lookMemory.slots[index]) return;
          var name = cleanLookName(input.value, 'Look ' + slotId);
          lookMemory.slots[index].name = name;
          input.value = name;
          if (previewImage) previewImage.alt = name + ' preview';
          markAutosaveDirty();
          scheduleAutosave();
          setLookMemoryStatus(name + 'へ名前を変更しました。', 'done', false);
        });
        body.appendChild(input);

        var meta = document.createElement('p');
        meta.className = 'look-memory-meta';
        meta.textContent = lookMemoryDescription(slot);
        body.appendChild(meta);

        var actions = document.createElement('div');
        actions.className = 'look-memory-actions';
        var recall = document.createElement('button');
        recall.type = 'button';
        recall.textContent = 'Recall';
        recall.disabled = !slot || isBusy;
        recall.dataset.lookAction = 'recall';
        recall.setAttribute('aria-label', 'Recall Look Memory ' + slotId);
        recall.setAttribute('aria-describedby', 'lookMemoryStatus');
        recall.addEventListener('click', function () { recallLookSlot(index); });
        actions.appendChild(recall);
        var capture = document.createElement('button');
        capture.type = 'button';
        capture.textContent = lookMemoryBusyIndex === index
          ? 'Recording…'
          : confirmingOverwrite ? 'Confirm overwrite / 上書き確認' : slot ? 'Overwrite' : 'Capture';
        capture.disabled = isBusy;
        capture.dataset.lookAction = 'capture';
        if (confirmingOverwrite) capture.dataset.confirming = 'true';
        capture.setAttribute('aria-label', confirmingOverwrite
          ? 'Confirm overwrite Look Memory ' + slotId
          : (slot ? 'Overwrite' : 'Capture') + ' Look Memory ' + slotId);
        capture.setAttribute('aria-describedby', 'lookMemoryStatus');
        capture.addEventListener('click', function () { captureLookSlot(index); });
        actions.appendChild(capture);
        var clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'look-clear';
        clear.textContent = confirmingClear ? 'Confirm clear / 消去確認' : 'Clear / 消去';
        clear.disabled = !slot || isBusy;
        clear.dataset.lookAction = 'clear';
        if (confirmingClear) clear.dataset.confirming = 'true';
        clear.setAttribute('aria-label', confirmingClear
          ? 'Confirm clear Look Memory ' + slotId
          : 'Clear Look Memory ' + slotId);
        clear.setAttribute('aria-describedby', 'lookMemoryStatus');
        clear.addEventListener('click', function () { clearLookSlot(index); });
        actions.appendChild(clear);
        body.appendChild(actions);
        card.appendChild(body);
        return card;
      }

      function syncLookMemoryUI() {
        if (!lookMemoryGrid) return;
        lookMemoryGrid.textContent = '';
        var filled = 0;
        for (var i = 0; i < LOOK_MEMORY_SLOT_IDS.length; i++) {
          if (lookMemory.slots[i]) filled++;
          lookMemoryGrid.appendChild(buildLookMemoryCard(i));
        }
        lookMemoryCount.textContent = filled + ' / ' + LOOK_MEMORY_SLOT_IDS.length;
        var canCompare = lookMemoryBusyIndex < 0 && lookMemory.slots.some(function (slot) { return slot && slot.preview; });
        btnLookCompare.disabled = !canCompare;
        var headerCompare = document.getElementById('btnHeaderCompare');
        if (headerCompare) headerCompare.disabled = !canCompare;
        btnLookReturn.disabled = lookMemoryBusyIndex >= 0 || !options.hasPreviousRecall();
      }

      function captureLookSlot(index) {
        if (lookMemoryBusyIndex >= 0) return;
        var existing = lookMemory.slots[index];
        if (existing && !(lookMemoryConfirmIndex === index && lookMemoryConfirmAction === 'overwrite')) {
          armLookMemoryConfirmation('overwrite', index);
          return;
        }
        clearLookMemoryConfirmationState();
        lookMemoryBusyIndex = index;
        syncLookMemoryUI();
        setLookMemoryStatus('Look ' + LOOK_MEMORY_SLOT_IDS[index] + 'を記録中…', 'working', true);
        var run = function () {
          try {
            var preview = '';
            try { preview = createLookPreview(); } catch (previewError) { /* state remains useful without a thumbnail */ }
            lookMemory.slots[index] = {
              name: existing ? existing.name : 'Look ' + LOOK_MEMORY_SLOT_IDS[index],
              createdAt: Date.now(),
              preview: preview,
              summary: currentLookSummary(),
              state: currentLookState()
            };
            lookMemory.active = index;
            lookMemoryBusyIndex = -1;
            markAutosaveDirty();
            scheduleAutosave();
            syncLookMemoryUI();
            setLookMemoryStatus('Look ' + LOOK_MEMORY_SLOT_IDS[index] + 'へ作品全体を記録しました。', 'done', false);
            focusLookMemoryAction(index, 'capture');
          } catch (captureError) {
            lookMemoryBusyIndex = -1;
            syncLookMemoryUI();
            setLookMemoryStatus('Look ' + LOOK_MEMORY_SLOT_IDS[index] + 'を記録できませんでした。', 'error', false);
            focusLookMemoryAction(index, 'capture');
          }
        };
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(run, run); else run();
      }


      function recallLookSlot(index) {
        cancelLookMemoryConfirmation(false, false);
        var slot = lookMemory.slots[index];
        if (!slot) return;
        var label = slot.name;
        if (!applyLookState(slot.state, index, true)) {
          setLookMemoryStatus(label + 'を復元できませんでした。', 'error', false);
          focusLookMemoryAction(index, 'recall');
          return;
        }
        setLookMemoryStatus(label + 'を復元しました。Returnで直前の状態へ戻せます。', 'done', false);
        focusLookMemoryAction(index, 'recall');
      }

      function clearLookSlot(index) {
        if (lookMemoryBusyIndex >= 0 || !lookMemory.slots[index]) return;
        if (!(lookMemoryConfirmIndex === index && lookMemoryConfirmAction === 'clear')) {
          armLookMemoryConfirmation('clear', index);
          return;
        }
        clearLookMemoryConfirmationState();
        lookMemory.slots[index] = null;
        if (lookMemory.active === index) lookMemory.active = -1;
        markAutosaveDirty();
        scheduleAutosave();
        syncLookMemoryUI();
        setLookMemoryStatus('Look ' + LOOK_MEMORY_SLOT_IDS[index] + 'を消去しました。', 'done', false);
        focusLookMemoryAction(index, 'capture');
      }

      btnLookReturn.addEventListener('click', function () {
        cancelLookMemoryConfirmation(false, false);
        if (options.returnRecall()) {
          setLookMemoryStatus('Recall直前の作品状態へ戻しました。', 'done', false);
        }
      });

      lookMemoryBlock.addEventListener('toggle', function () {
        if (!lookMemoryBlock.open) cancelLookMemoryConfirmation(false, false);
      });
      document.addEventListener('click', function (event) {
        if (lookMemoryConfirmIndex < 0 || lookMemoryBlock.contains(event.target)) return;
        cancelLookMemoryConfirmation(false, false);
      }, true);
      document.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape' || lookMemoryConfirmIndex < 0) return;
        cancelLookMemoryConfirmation(true, true);
        event.preventDefault();
        event.stopImmediatePropagation();
      }, true);

      var lookCompareOverlay = document.getElementById('lookCompareOverlay');
      var lookCompareFrame = document.getElementById('lookCompareFrame');
      var lookCompareImageA = document.getElementById('lookCompareImageA');
      var lookCompareImageB = document.getElementById('lookCompareImageB');
      var lookCompareHandle = document.getElementById('lookCompareHandle');
      var lookCompareRange = document.getElementById('lookCompareRange');
      var lookCompareSourceA = document.getElementById('lookCompareSourceA');
      var lookCompareSourceB = document.getElementById('lookCompareSourceB');
      var lookCompareFocusReturn = null;
      var lookComparePointer = null;
      var lookCompareCurrentPreview = '';

      function lookCompareSources() {
        var sources = [{ id: 'current', name: 'Current / 現在', preview: lookCompareCurrentPreview }];
        for (var i = 0; i < LOOK_MEMORY_SLOT_IDS.length; i++) {
          var slot = lookMemory.slots[i];
          if (!slot || !slot.preview) continue;
          sources.push({ id: 'slot-' + i, name: LOOK_MEMORY_SLOT_IDS[i] + ' · ' + slot.name, preview: slot.preview, createdAt: slot.createdAt || 0 });
        }
        return sources;
      }

      function populateLookCompareSelect(select, sources) {
        select.textContent = '';
        for (var i = 0; i < sources.length; i++) {
          var option = document.createElement('option');
          option.value = sources[i].id;
          option.textContent = sources[i].name;
          select.appendChild(option);
        }
      }

      function renderLookCompareSources() {
        var sources = lookCompareSources();
        var sourceById = {};
        for (var i = 0; i < sources.length; i++) sourceById[sources[i].id] = sources[i];
        var a = sourceById[lookCompareSourceA.value] || sources[0];
        var b = sourceById[lookCompareSourceB.value] || sources[Math.min(1, sources.length - 1)];
        document.getElementById('lookCompareNameA').textContent = a.name;
        document.getElementById('lookCompareNameB').textContent = b.name;
        lookCompareImageA.src = a.preview;
        lookCompareImageB.src = b.preview;
      }

      function setLookCompareWipe(value) {
        value = Math.max(0, Math.min(100, Number(value) || 0));
        lookCompareRange.value = String(Math.round(value));
        lookCompareImageB.style.clipPath = 'inset(0 0 0 ' + value + '%)';
        lookCompareHandle.style.left = value + '%';
      }

      function openLookCompare() {
        cancelLookMemoryConfirmation(false, false);
        var saved = lookMemory.slots.map(function (slot, index) { return { slot: slot, index: index }; })
          .filter(function (entry) { return entry.slot && entry.slot.preview; })
          .sort(function (a, b) { return (b.slot.createdAt || 0) - (a.slot.createdAt || 0); });
        if (!saved.length || lookMemoryBusyIndex >= 0) return;
        try { lookCompareCurrentPreview = createLookPreview(); }
        catch (previewError) { setLookMemoryStatus('Currentの比較画像を作成できませんでした。', 'error', false); return; }
        lookCompareFocusReturn = document.activeElement;
        var sources = lookCompareSources();
        populateLookCompareSelect(lookCompareSourceA, sources);
        populateLookCompareSelect(lookCompareSourceB, sources);
        lookCompareSourceA.value = 'current';
        lookCompareSourceB.value = 'slot-' + saved[0].index;
        renderLookCompareSources();
        setLookCompareWipe(50);
        lookCompareOverlay.hidden = false;
        document.getElementById('btnLookCompareClose').focus();
      }

      function closeLookCompare() {
        if (lookCompareOverlay.hidden) return;
        lookCompareOverlay.hidden = true;
        lookCompareImageA.removeAttribute('src');
        lookCompareImageB.removeAttribute('src');
        lookCompareCurrentPreview = '';
        if (lookCompareFocusReturn && typeof lookCompareFocusReturn.focus === 'function') lookCompareFocusReturn.focus();
        lookCompareFocusReturn = null;
      }

      function setWipeFromPointer(event) {
        var rect = lookCompareFrame.getBoundingClientRect();
        if (!rect.width) return;
        setLookCompareWipe((event.clientX - rect.left) / rect.width * 100);
        if (event.cancelable) event.preventDefault();
      }

      btnLookCompare.addEventListener('click', openLookCompare);
      document.getElementById('btnHeaderCompare').addEventListener('click', openLookCompare);
      document.getElementById('btnLookCompareClose').addEventListener('click', closeLookCompare);
      lookCompareSourceA.addEventListener('change', renderLookCompareSources);
      lookCompareSourceB.addEventListener('change', renderLookCompareSources);
      lookCompareRange.addEventListener('input', function () { setLookCompareWipe(lookCompareRange.value); });
      lookCompareFrame.addEventListener('pointerdown', function (event) {
        lookComparePointer = event.pointerId;
        try { lookCompareFrame.setPointerCapture(event.pointerId); } catch (captureError) { }
        setWipeFromPointer(event);
      });
      lookCompareFrame.addEventListener('pointermove', function (event) {
        if (lookComparePointer === event.pointerId) setWipeFromPointer(event);
      });
      function endLookComparePointer(event) {
        if (lookComparePointer !== event.pointerId) return;
        lookComparePointer = null;
        try { lookCompareFrame.releasePointerCapture(event.pointerId); } catch (releaseError) { }
      }
      lookCompareFrame.addEventListener('pointerup', endLookComparePointer);
      lookCompareFrame.addEventListener('pointercancel', endLookComparePointer);
      lookCompareOverlay.addEventListener('click', function (event) {
        if (event.target === lookCompareOverlay) closeLookCompare();
      });
      document.addEventListener('keydown', function (event) {
        if (lookCompareOverlay.hidden) return;
        if (event.key === 'Escape') {
          closeLookCompare();
          event.preventDefault();
          return;
        }
        if (event.key !== 'Tab') return;
        var focusable = [document.getElementById('btnLookCompareClose'), lookCompareSourceA, lookCompareSourceB, lookCompareRange];
        var current = focusable.indexOf(document.activeElement);
        if (event.shiftKey && current <= 0) {
          focusable[focusable.length - 1].focus();
          event.preventDefault();
        } else if (!event.shiftKey && current === focusable.length - 1) {
          focusable[0].focus();
          event.preventDefault();
        }
      });


    return Object.freeze({
      cloneLookMemory: cloneLookMemory,
      cloneKnownParams: cloneKnownParams,
      normalizeLookState: normalizeLookState,
      normalizeLookMemory: normalizeLookMemory,
      createLookPreview: createLookPreview,
      syncLookMemoryUI: syncLookMemoryUI
    });
  }
  root.TypeDeformerLookMemory = Object.freeze({ create: create });
})(typeof globalThis !== 'undefined' ? globalThis : this);
