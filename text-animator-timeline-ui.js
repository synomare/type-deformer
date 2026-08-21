(function (root) {
  'use strict';

  function start() {
    var engine = root.TypeDeformerTextAnimator;
    var timeline = engine && engine.timeline;
    var bridge = root.TypeDeformerTextAnimatorBridge;
    var panel = document.getElementById('textTimelinePanel');
    if (!engine || !timeline || !bridge || !panel) return;

    var propertySelect = document.getElementById('pTextTimelineProperty');
    var fpsInput = document.getElementById('pTextTimelineFps');
    var snapInput = document.getElementById('pTextTimelineSnap');
    var ruler = document.getElementById('textTimelineRuler');
    var playhead = document.getElementById('textTimelinePlayhead');
    var scrub = document.getElementById('pTextTimelineScrub');
    var timeReadout = document.getElementById('vTextTimelineTime');
    var sampleReadout = document.getElementById('vTextTimelineSample');
    var keySelect = document.getElementById('pTextTimelineKey');
    var valueInput = document.getElementById('pTextTimelineValue');
    var easingSelect = document.getElementById('pTextTimelineEasing');
    var setButton = document.getElementById('btnTextTimelineSet');
    var duplicateButton = document.getElementById('btnTextTimelineDuplicate');
    var deleteButton = document.getElementById('btnTextTimelineDelete');
    var copyButton = document.getElementById('btnTextTimelineCopy');
    var pasteButton = document.getElementById('btnTextTimelinePaste');
    var status = document.getElementById('textTimelineStatus');

    var property = 'x';
    var selectedKeyId = '';
    var clipboard = null;
    var drag = null;
    var lastKeySignature = '';
    var flashMessage = '';
    var flashUntil = 0;

    for (var i = 0; i < timeline.propertyNames.length; i++) {
      var name = timeline.propertyNames[i];
      var option = document.createElement('option');
      option.value = name;
      option.textContent = timeline.propertySpecs[name].label;
      propertySelect.appendChild(option);
    }
    propertySelect.value = property;

    function fps() {
      var value = Math.round(Number(fpsInput.value) || 30);
      value = Math.max(1, Math.min(120, value));
      if (String(value) !== fpsInput.value && document.activeElement !== fpsInput) fpsInput.value = value;
      return value;
    }

    function activeAnimator(state) {
      for (var index = 0; index < state.animators.length; index++) {
        if (state.animators[index].id === state.activeAnimatorId) return state.animators[index];
      }
      return state.animators[0];
    }

    function activeData() {
      var state = bridge.getState();
      return { state: state, animator: activeAnimator(state) };
    }

    function currentTrack(animator) {
      return animator && animator.tracks && Array.isArray(animator.tracks[property])
        ? animator.tracks[property] : [];
    }

    function selectedKey(keys) {
      for (var index = 0; index < keys.length; index++) {
        if (keys[index].id === selectedKeyId) return keys[index];
      }
      return null;
    }

    function pad(value, width) {
      var text = String(Math.max(0, Math.round(value)));
      while (text.length < width) text = '0' + text;
      return text;
    }

    function formatValue(value, spec) {
      value = Number(value) || 0;
      var rounded = Math.abs(value - Math.round(value)) < 0.0001
        ? String(Math.round(value)) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
      return rounded + spec.unit;
    }

    function snapPhase(value) {
      value = Math.max(0, Math.min(0.999999, Number(value) || 0));
      if (!snapInput.checked) return timeline.normalizePhase(value);
      return timeline.frameToPhase(timeline.phaseToFrame(value, fps()), fps());
    }

    function phaseFromClientX(clientX) {
      var rect = ruler.getBoundingClientRect();
      if (!rect.width) return 0;
      return snapPhase((clientX - rect.left) / rect.width);
    }

    function replaceAnimator(animator, options) {
      bridge.replaceActiveAnimator(animator, options || {});
    }

    function setPhase(value, dirty) {
      bridge.setPhase(timeline.normalizePhase(value), { dirty: dirty === true });
    }

    function flash(message) {
      flashMessage = message;
      flashUntil = Date.now() + 1800;
      render(true);
    }

    function keySignature(animator, keys) {
      return animator.id + '|' + property + '|' + fps() + '|' + keys.map(function (key) {
        return key.id + ':' + key.time.toFixed(6) + ':' + key.value + ':' + key.easing;
      }).join(';');
    }

    function selectKey(key, movePlayhead) {
      selectedKeyId = key ? key.id : '';
      if (key && movePlayhead !== false) setPhase(key.time, false);
      render(true);
    }

    function handleKeyKeyboard(event, keyId) {
      var data = activeData();
      var animator = data.animator;
      var keys = currentTrack(animator);
      var key = null;
      for (var i = 0; i < keys.length; i++) if (keys[i].id === keyId) key = keys[i];
      if (!key) return;
      var spec = timeline.propertySpecs[property];
      var next;
      var nextTime = key.time;
      var nextValue = key.value;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        var frames = event.shiftKey ? 10 : 1;
        nextTime = timeline.normalizePhase(key.time + (event.key === 'ArrowRight' ? frames : -frames) / fps());
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        nextValue = key.value + (event.key === 'ArrowUp' ? spec.step : -spec.step) * (event.shiftKey ? 10 : 1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        nextTime = 0;
      } else if (event.key === 'End') {
        event.preventDefault();
        nextTime = (fps() - 1) / fps();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        bridge.pushHistory();
        next = timeline.removeKey(animator, property, key.id);
        replaceAnimator(next, { history: false });
        selectedKeyId = '';
        flash('Keyframe deleted');
        return;
      } else {
        return;
      }
      bridge.pushHistory();
      next = timeline.moveKey(animator, property, key.id, nextTime, nextValue, key.easing);
      replaceAnimator(next, { history: false });
      selectedKeyId = key.id;
      setPhase(nextTime, false);
      render(true);
    }

    function beginDrag(event, keyId, button) {
      if (event.button !== 0) return;
      event.preventDefault();
      selectedKeyId = keyId;
      bridge.pushHistory();
      drag = { pointerId: event.pointerId, keyId: keyId, button: button };
      if (button.setPointerCapture) button.setPointerCapture(event.pointerId);

      function move(moveEvent) {
        if (!drag || moveEvent.pointerId !== drag.pointerId) return;
        var phase = phaseFromClientX(moveEvent.clientX);
        var data = activeData();
        var next = timeline.moveKey(data.animator, property, drag.keyId, phase, null, null);
        replaceAnimator(next, { history: false, resync: false });
        setPhase(phase, false);
        button.style.left = (phase * 100).toFixed(4) + '%';
        playhead.style.left = (phase * 100).toFixed(4) + '%';
      }

      function finish(upEvent) {
        if (!drag || upEvent.pointerId !== drag.pointerId) return;
        if (button.releasePointerCapture && button.hasPointerCapture(upEvent.pointerId)) {
          button.releasePointerCapture(upEvent.pointerId);
        }
        button.removeEventListener('pointermove', move);
        button.removeEventListener('pointerup', finish);
        button.removeEventListener('pointercancel', finish);
        drag = null;
        bridge.refresh();
        render(true);
      }

      button.addEventListener('pointermove', move);
      button.addEventListener('pointerup', finish);
      button.addEventListener('pointercancel', finish);
    }

    function renderKeys(animator, keys) {
      var oldKeys = ruler.querySelectorAll('.text-timeline-key');
      for (var i = 0; i < oldKeys.length; i++) oldKeys[i].remove();

      keySelect.textContent = '';
      var empty = document.createElement('option');
      empty.value = '';
      empty.textContent = keys.length ? 'Select a keyframe' : 'No keyframes';
      keySelect.appendChild(empty);

      var spec = timeline.propertySpecs[property];
      for (var index = 0; index < keys.length; index++) {
        (function (key) {
          var frame = timeline.phaseToFrame(key.time, fps());
          var option = document.createElement('option');
          option.value = key.id;
          option.textContent = 'F' + pad(frame, 3) + ' · ' + formatValue(key.value, spec) + ' · ' + key.easing;
          keySelect.appendChild(option);

          var button = document.createElement('button');
          button.type = 'button';
          button.className = 'text-timeline-key';
          button.dataset.keyId = key.id;
          button.style.left = (key.time * 100).toFixed(4) + '%';
          button.setAttribute('aria-label', spec.label + ' keyframe, frame ' + frame + ', ' + formatValue(key.value, spec));
          button.setAttribute('aria-pressed', String(key.id === selectedKeyId));
          button.addEventListener('click', function () { selectKey(key, true); });
          button.addEventListener('keydown', function (event) { handleKeyKeyboard(event, key.id); });
          button.addEventListener('pointerdown', function (event) { beginDrag(event, key.id, button); });
          ruler.appendChild(button);
        })(keys[index]);
      }
    }

    function render(force) {
      var data = activeData();
      var state = data.state;
      var animator = data.animator;
      if (!timeline.propertySpecs[property]) property = 'x';
      var spec = timeline.propertySpecs[property];
      var keys = currentTrack(animator);
      var chosen = selectedKey(keys);
      if (selectedKeyId && !chosen) selectedKeyId = '';
      var phase = timeline.normalizePhase(state.phase);
      var sample = timeline.sampleTrack(keys, phase, animator.transform[property], property);
      var signature = keySignature(animator, keys);

      if (!drag && (force || signature !== lastKeySignature)) {
        renderKeys(animator, keys);
        lastKeySignature = signature;
      }

      propertySelect.value = property;
      keySelect.value = selectedKeyId;
      playhead.style.left = (phase * 100).toFixed(4) + '%';
      if (document.activeElement !== scrub) scrub.value = phase;
      var frame = timeline.phaseToFrame(phase, fps());
      timeReadout.textContent = phase.toFixed(3) + ' · F' + pad(frame, 3);
      sampleReadout.textContent = formatValue(sample, spec);

      chosen = selectedKey(keys);
      if (document.activeElement !== valueInput) {
        valueInput.value = chosen ? chosen.value : Number(sample.toFixed(4));
      }
      valueInput.min = spec.min;
      valueInput.max = spec.max;
      valueInput.step = spec.step;
      if (document.activeElement !== easingSelect) easingSelect.value = chosen ? chosen.easing : 'linear';

      setButton.textContent = chosen && Math.abs(chosen.time - phase) <= timeline.timeEpsilon ? 'Update key' : 'Add key';
      duplicateButton.disabled = !chosen || keys.length >= timeline.maxKeysPerTrack;
      deleteButton.disabled = !chosen;
      copyButton.disabled = !keys.length;
      pasteButton.disabled = !clipboard;

      var message = Date.now() < flashUntil ? flashMessage : '';
      status.dataset.state = keys.length ? 'active' : 'idle';
      status.textContent = message || (keys.length
        ? keys.length + ' keyframe' + (keys.length === 1 ? '' : 's') + ' · ' + spec.label + ' · frame ' + frame
        : 'No keyframes · base value ' + formatValue(animator.transform[property], spec));
    }

    propertySelect.addEventListener('change', function () {
      property = propertySelect.value;
      selectedKeyId = '';
      lastKeySignature = '';
      render(true);
    });

    fpsInput.addEventListener('change', function () {
      fpsInput.value = fps();
      lastKeySignature = '';
      render(true);
    });
    snapInput.addEventListener('change', function () { render(true); });

    scrub.addEventListener('input', function () {
      setPhase(snapPhase(scrub.value), false);
      render(false);
    });
    scrub.addEventListener('change', function () { setPhase(snapPhase(scrub.value), true); });

    ruler.addEventListener('pointerdown', function (event) {
      if (event.target !== ruler) return;
      event.preventDefault();
      setPhase(phaseFromClientX(event.clientX), false);
      selectedKeyId = '';
      render(true);
    });
    ruler.addEventListener('keydown', function (event) {
      if (event.target !== ruler) return;
      var data = activeData();
      var phase = data.state.phase;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        var amount = (event.shiftKey ? 10 : 1) / fps();
        setPhase(phase + (event.key === 'ArrowRight' ? amount : -amount), false);
        render(false);
      } else if (event.key === 'Home') {
        event.preventDefault();
        setPhase(0, false);
        render(false);
      } else if (event.key === 'End') {
        event.preventDefault();
        setPhase((fps() - 1) / fps(), false);
        render(false);
      }
    });

    keySelect.addEventListener('change', function () {
      var data = activeData();
      var keys = currentTrack(data.animator);
      selectedKeyId = keySelect.value;
      selectKey(selectedKey(keys), true);
    });

    setButton.addEventListener('click', function () {
      var data = activeData();
      var phase = timeline.normalizePhase(data.state.phase);
      var value = Number(valueInput.value);
      var next = timeline.upsertKey(data.animator, property, phase, value, easingSelect.value);
      replaceAnimator(next, { history: true });
      var key = timeline.keyNearTime(next.tracks[property], phase);
      selectedKeyId = key ? key.id : '';
      flash(key && key.id === selectedKeyId ? 'Keyframe stored' : 'Track limit reached');
    });

    duplicateButton.addEventListener('click', function () {
      var data = activeData();
      var key = selectedKey(currentTrack(data.animator));
      if (!key) return;
      var phase = timeline.normalizePhase(key.time + 1 / fps());
      var next = timeline.duplicateKey(data.animator, property, key.id, 1 / fps());
      replaceAnimator(next, { history: true });
      var duplicate = timeline.keyNearTime(next.tracks[property], phase);
      selectedKeyId = duplicate ? duplicate.id : key.id;
      setPhase(phase, false);
      flash('Keyframe duplicated');
    });

    deleteButton.addEventListener('click', function () {
      var data = activeData();
      if (!selectedKeyId) return;
      var next = timeline.removeKey(data.animator, property, selectedKeyId);
      replaceAnimator(next, { history: true });
      selectedKeyId = '';
      flash('Keyframe deleted');
    });

    copyButton.addEventListener('click', function () {
      clipboard = timeline.copyTrack(activeData().animator, property);
      flash('Track copied in this session');
    });

    pasteButton.addEventListener('click', function () {
      if (!clipboard) return;
      var data = activeData();
      var next = timeline.pasteTrack(data.animator, property, clipboard);
      replaceAnimator(next, { history: true });
      selectedKeyId = '';
      flash('Track pasted');
    });

    valueInput.addEventListener('change', function () {
      var data = activeData();
      var key = selectedKey(currentTrack(data.animator));
      if (!key) return;
      var next = timeline.moveKey(data.animator, property, key.id, key.time, Number(valueInput.value), key.easing);
      replaceAnimator(next, { history: true });
      flash('Keyframe value updated');
    });

    easingSelect.addEventListener('change', function () {
      var data = activeData();
      var key = selectedKey(currentTrack(data.animator));
      if (!key) return;
      var next = timeline.moveKey(data.animator, property, key.id, key.time, key.value, easingSelect.value);
      replaceAnimator(next, { history: true });
      flash('Interpolation updated');
    });

    render(true);
    root.setInterval(function () {
      if (!document.hidden) render(false);
    }, 50);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})(typeof window !== 'undefined' ? window : globalThis);
