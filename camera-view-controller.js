// Preview camera controller: owns device-local view state; project geometry stays in the editor.
// This is authored source. Editor and tests consume this file directly.
(function (root) {
  'use strict';
  function create(options) {
    options = options || {};
      /* ---------------- canvas view camera ----------------
         View state is intentionally device-local and ephemeral: it changes
         only how the artwork is inspected, never project/export geometry. */
      var stageFrame = document.getElementById('stageFrame');
      var stageWrap = document.getElementById('stageWrap');
      var stageWorld = document.getElementById('stageWorld');
      var stageArtwork = document.getElementById('stageArtwork');
      var cameraListeners = [];
      var viewportObserver = null;
      function listen(target, event, handler, flags) {
        target.addEventListener(event, handler, flags);
        cameraListeners.push(function () { target.removeEventListener(event, handler, flags); });
      }
      var canvasView = { scale: 1, x: 0, y: 0, active: false, autoFit: true };
      var canvasViewPointers = new Map();
      var canvasViewDrag = null;
      var canvasViewPinch = null;
      var canvasViewLastTap = null;
      var CANVAS_VIEW_MIN = 0.05;
      var CANVAS_VIEW_FIT_MIN = 0.00001;
      var CANVAS_VIEW_MAX = 32;
      // A numerical guard only. It is intentionally far beyond any practical
      // gesture so the workspace has no user-visible pan boundary.
      var CANVAS_VIEW_EXTENT = 10000000;
      var btnViewMode = document.getElementById('btnViewMode');
      var btnMobileView = document.getElementById('btnMobileView');
      var btnViewReset = document.getElementById('btnViewReset');
      var canvasViewHint = document.getElementById('canvasViewHint');

      stageWrap.classList.add('has-view-camera');

      function normalizeCanvasView() {
        if (canvasView.autoFit == null) canvasView.autoFit = true;
        canvasView.scale = isFinite(canvasView.scale) ? canvasView.scale : 1;
        canvasView.scale = Math.max(canvasView.autoFit ? CANVAS_VIEW_FIT_MIN : CANVAS_VIEW_MIN,
          Math.min(CANVAS_VIEW_MAX, canvasView.scale));
        canvasView.x = isFinite(canvasView.x) ?
          Math.max(-CANVAS_VIEW_EXTENT, Math.min(CANVAS_VIEW_EXTENT, canvasView.x)) : 0;
        canvasView.y = isFinite(canvasView.y) ?
          Math.max(-CANVAS_VIEW_EXTENT, Math.min(CANVAS_VIEW_EXTENT, canvasView.y)) : 0;
      }

      function canvasCameraLayout(width, height) {
        normalizeCanvasView();
        return {
          w: Math.max(1, width), h: Math.max(1, height),
          s: canvasView.scale, dx: canvasView.x, dy: canvasView.y
        };
      }

      function canvasAutoFitBounds(scene) {
        if (!scene || !scene.glyphs || !scene.glyphs.length) return null;
        var effectPad = options.effectPad();
        var bounds = options.contentBounds(scene, effectPad);
        if (options.compositionEnabled() && scene.width > 0 && scene.height > 0) {
          var viewport = { x: -effectPad, y: -effectPad,
            w: scene.width + effectPad * 2, h: scene.height + effectPad * 2 };
          var minX = Math.min(bounds.x, viewport.x), minY = Math.min(bounds.y, viewport.y);
          var maxX = Math.max(bounds.x + bounds.w, viewport.x + viewport.w);
          var maxY = Math.max(bounds.y + bounds.h, viewport.y + viewport.h);
          bounds = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
        }
        return [bounds.x, bounds.y, bounds.w, bounds.h].every(Number.isFinite)
          && bounds.w > 0 && bounds.h > 0 ? bounds : null;
      }

      function fitCanvasViewToScene(scene) {
        if (canvasView.active || !canvasView.autoFit) return false;
        var bounds = canvasAutoFitBounds(scene);
        if (!bounds) return false;
        var width = Math.max(1, stageFrame.clientWidth), height = Math.max(1, stageFrame.clientHeight);
        var safe = Math.max(20, Math.min(56, Math.min(width, height) * 0.055));
        var usableWidth = Math.max(1, width - safe * 2), usableHeight = Math.max(1, height - safe * 2);
        var nextScale = Math.min(1, usableWidth / bounds.w, usableHeight / bounds.h);
        nextScale = Math.max(CANVAS_VIEW_FIT_MIN, Math.min(CANVAS_VIEW_MAX, nextScale));
        var nextX = safe + (usableWidth - bounds.w * nextScale) * 0.5 - bounds.x * nextScale;
        var nextY = safe + (usableHeight - bounds.h * nextScale) * 0.5 - bounds.y * nextScale;
        if (Math.abs(canvasView.scale - nextScale) < 0.00001
          && Math.abs(canvasView.x - nextX) < 0.05 && Math.abs(canvasView.y - nextY) < 0.05) return false;
        canvasView.scale = nextScale;
        canvasView.x = nextX;
        canvasView.y = nextY;
        applyCanvasView();
        return true;
      }

      function updateCanvasViewUI() {
        var percentValue = canvasView.scale * 100;
        var percent = (percentValue < 1 ? Math.max(0.001, percentValue).toFixed(percentValue < 0.1 ? 3 : 2)
          : Math.round(percentValue)) + '%';
        btnViewReset.textContent = (canvasView.autoFit ? 'FIT ' : '') + percent;
        btnViewReset.setAttribute('aria-label', (canvasView.autoFit ? 'Artwork fitted in preview' : 'Fit all artwork in preview') + ', current zoom ' + percent);
        btnViewMode.setAttribute('aria-pressed', String(canvasView.active));
        btnViewMode.textContent = canvasView.active ? 'DONE' : 'VIEW';
        btnViewMode.setAttribute('aria-label', canvasView.active ? 'Exit canvas view mode' : 'Enter canvas view mode');
        btnViewMode.title = canvasView.active ? 'View操作を終了（V）' : 'ドラッグ／ピンチ操作を有効化（V）';
        if (btnMobileView) {
          btnMobileView.setAttribute('aria-pressed', String(canvasView.active));
          btnMobileView.textContent = canvasView.active ? 'Done' : 'View';
          btnMobileView.setAttribute('aria-label', canvasView.active ? 'Exit canvas view mode' : 'Enter canvas view mode');
          btnMobileView.title = canvasView.active ? 'View操作を終了' : 'ドラッグ／ピンチ操作を有効化';
        }
        if (canvasViewHint) {
          canvasViewHint.textContent = window.matchMedia && window.matchMedia('(max-width: 760px)').matches
            ? 'UNBOUNDED VIEW · DRAG TO PAN · PINCH TO ZOOM · DOUBLE TAP TO RESET'
            : 'UNBOUNDED VIEW · DRAG TO PAN · WHEEL TO ZOOM · DOUBLE CLICK TO RESET';
          canvasViewHint.setAttribute('aria-hidden', String(!canvasView.active));
        }
        stageWrap.classList.toggle('view-pan-active', canvasView.active);
      }

      function applyCanvasView() {
        normalizeCanvasView();
        // The world is transformed, never the screen-sized canvas layers.
        // Canvas renderers consume the same camera explicitly below.
        stageArtwork.style.transform = 'none';
        stageWorld.style.transform =
          'translate3d(' + canvasView.x.toFixed(2) + 'px,' + canvasView.y.toFixed(2) + 'px,0) scale(' +
          canvasView.scale.toFixed(6) + ')';
        stageWrap.dataset.viewScale = canvasView.scale.toFixed(6);
        stageWrap.dataset.viewX = canvasView.x.toFixed(2);
        stageWrap.dataset.viewY = canvasView.y.toFixed(2);
        updateCanvasViewUI();
        options.changed();
      }

      function setCanvasViewActive(active) {
        canvasView.active = !!active;
        if (canvasView.active) canvasView.autoFit = false;
        // View mode owns the pointer completely. A mouse can remain "active"
        // from the Lens hover immediately before VIEW is pressed; without an
        // explicit hand-off, that stale pointer keeps toggling glyphs while a
        // pan gesture is in progress.
        canvasViewPointers.clear();
        canvasViewDrag = null;
        canvasViewPinch = null;
        stageWrap.classList.remove('view-pan-dragging');
        updateCanvasViewUI();
        options.modeChanged(canvasView.active);
      }

      function resetCanvasView() {
        if (canvasView.active) setCanvasViewActive(false);
        canvasView.autoFit = true;
        // An already-fitted scene can keep exactly the same transform, so the
        // fit calculation may return without repainting the control state.
        updateCanvasViewUI();
        options.requestFit();
      }

      function zoomCanvasViewAt(nextScale, clientX, clientY) {
        canvasView.autoFit = false;
        nextScale = Math.max(CANVAS_VIEW_MIN, Math.min(CANVAS_VIEW_MAX, nextScale));
        if (Math.abs(nextScale - canvasView.scale) < 0.0001) return;
        var wrapRect = stageFrame.getBoundingClientRect();
        var sx = clientX - wrapRect.left;
        var sy = clientY - wrapRect.top;
        var contentX = (sx - canvasView.x) / canvasView.scale;
        var contentY = (sy - canvasView.y) / canvasView.scale;
        canvasView.x = sx - contentX * nextScale;
        canvasView.y = sy - contentY * nextScale;
        canvasView.scale = nextScale;
        applyCanvasView();
      }

      function zoomCanvasViewBy(factor) {
        var rect = stageFrame.getBoundingClientRect();
        zoomCanvasViewAt(
          canvasView.scale * factor,
          rect.left + stageFrame.clientWidth * 0.5,
          rect.top + stageFrame.clientHeight * 0.5
        );
      }

      function canvasViewPointPair() {
        var points = Array.from(canvasViewPointers.values());
        return points.length >= 2 ? [points[0], points[1]] : null;
      }

      function beginCanvasViewPinch() {
        var pair = canvasViewPointPair();
        if (!pair) { canvasViewPinch = null; return; }
        var midX = (pair[0].x + pair[1].x) * 0.5;
        var midY = (pair[0].y + pair[1].y) * 0.5;
        canvasViewPinch = {
          distance: Math.max(1, Math.hypot(pair[1].x - pair[0].x, pair[1].y - pair[0].y)),
          scale: canvasView.scale,
          x: canvasView.x,
          y: canvasView.y,
          midX: midX,
          midY: midY
        };
      }

      function restartCanvasViewDrag() {
        var first = canvasViewPointers.values().next().value;
        canvasViewDrag = first ? {
          id: first.id, x0: first.x, y0: first.y,
          viewX: canvasView.x, viewY: canvasView.y, moved: false
        } : null;
      }

      listen(stageWrap, 'pointerdown', function (e) {
        if (!canvasView.active || e.target.closest('.canvas-view-controls')) return;
        canvasViewPointers.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });
        if (canvasViewPointers.size === 1) restartCanvasViewDrag();
        else beginCanvasViewPinch();
        stageWrap.classList.add('view-pan-dragging');
        try { stageWrap.setPointerCapture(e.pointerId); } catch (err) { }
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
      }, true);

      listen(stageWrap, 'pointermove', function (e) {
        if (!canvasView.active || !canvasViewPointers.has(e.pointerId)) return;
        canvasViewPointers.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });
        if (canvasViewPointers.size >= 2) {
          var pair = canvasViewPointPair();
          if (!canvasViewPinch) beginCanvasViewPinch();
          var distance = Math.max(1, Math.hypot(pair[1].x - pair[0].x, pair[1].y - pair[0].y));
          var midX = (pair[0].x + pair[1].x) * 0.5;
          var midY = (pair[0].y + pair[1].y) * 0.5;
          var wrapRect = stageFrame.getBoundingClientRect();
          var nextScale = Math.max(
            CANVAS_VIEW_MIN,
            Math.min(CANVAS_VIEW_MAX, canvasViewPinch.scale * distance / canvasViewPinch.distance)
          );
          var contentX = (
            canvasViewPinch.midX - wrapRect.left - canvasViewPinch.x
          ) / canvasViewPinch.scale;
          var contentY = (
            canvasViewPinch.midY - wrapRect.top - canvasViewPinch.y
          ) / canvasViewPinch.scale;
          canvasView.scale = nextScale;
          canvasView.x = midX - wrapRect.left - contentX * nextScale;
          canvasView.y = midY - wrapRect.top - contentY * nextScale;
          applyCanvasView();
        } else if (canvasViewDrag && canvasViewDrag.id === e.pointerId) {
          var dx = e.clientX - canvasViewDrag.x0;
          var dy = e.clientY - canvasViewDrag.y0;
          if (Math.abs(dx) > 3 || Math.abs(dy) > 3) canvasViewDrag.moved = true;
          canvasView.x = canvasViewDrag.viewX + dx;
          canvasView.y = canvasViewDrag.viewY + dy;
          applyCanvasView();
        }
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
      }, true);

      function endCanvasViewPointer(e) {
        if (!canvasViewPointers.has(e.pointerId)) return;
        var wasTap = canvasViewPointers.size === 1 && canvasViewDrag && !canvasViewDrag.moved;
        canvasViewPointers.delete(e.pointerId);
        try { stageWrap.releasePointerCapture(e.pointerId); } catch (err) { }
        if (canvasViewPointers.size >= 2) beginCanvasViewPinch();
        else {
          canvasViewPinch = null;
          restartCanvasViewDrag();
        }
        if (!canvasViewPointers.size) stageWrap.classList.remove('view-pan-dragging');
        if (wasTap && e.pointerType === 'touch') {
          var now = Date.now();
          if (canvasViewLastTap && now - canvasViewLastTap.time < 360 &&
              Math.hypot(e.clientX - canvasViewLastTap.x, e.clientY - canvasViewLastTap.y) < 22) {
            resetCanvasView();
            canvasViewLastTap = null;
          } else {
            canvasViewLastTap = { time: now, x: e.clientX, y: e.clientY };
          }
        }
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
      }
      listen(stageWrap, 'pointerup', endCanvasViewPointer, true);
      listen(stageWrap, 'pointercancel', endCanvasViewPointer, true);

      listen(stageWrap, 'wheel', function (e) {
        if (!canvasView.active && !e.ctrlKey && !e.metaKey) return;
        if (!canvasView.active) setCanvasViewActive(true);
        zoomCanvasViewAt(canvasView.scale * Math.exp(-e.deltaY * 0.002), e.clientX, e.clientY);
        if (e.cancelable) e.preventDefault();
      }, { passive: false });

      listen(stageWrap, 'dblclick', function (e) {
        if (!canvasView.active || e.target.closest('.canvas-view-controls')) return;
        resetCanvasView();
        e.preventDefault();
      }, true);

      listen(document.getElementById('btnViewZoomOut'), 'click', function () { zoomCanvasViewBy(1 / 1.25); });
      listen(document.getElementById('btnViewZoomIn'), 'click', function () { zoomCanvasViewBy(1.25); });
      listen(btnViewReset, 'click', resetCanvasView);
      listen(btnViewMode, 'click', function () { setCanvasViewActive(!canvasView.active); });
      if (btnMobileView) listen(btnMobileView, 'click', function () {
        setCanvasViewActive(!canvasView.active);
        options.closeMobileSheet();
      });
      function refreshCanvasViewAfterResize() {
        if (canvasView.autoFit && !canvasView.active) options.requestFit();
        else applyCanvasView();
      }
      listen(window, 'resize', refreshCanvasViewAfterResize);
      listen(window, 'type-deformer-frame-resize', refreshCanvasViewAfterResize);
      applyCanvasView();

      /* ---------------- screen viewport ---------------- */
      (function () {
        function notifyFrameResize() {
          window.dispatchEvent(new Event('type-deformer-frame-resize'));
        }
        // Clear dimensions persisted by releases where the preview itself was
        // a resizable artboard. Output dimensions remain in Export settings.
        stageFrame.style.width = '';
        stageFrame.style.height = '';
        try { localStorage.removeItem('typeDeformer.frameSize.v1'); } catch (e) { /* ignore */ }
        if (window.ResizeObserver) {
          viewportObserver = new ResizeObserver(notifyFrameResize);
          viewportObserver.observe(stageFrame);
        } else {
          listen(window, 'resize', notifyFrameResize);
        }
        notifyFrameResize();
      })();


    return Object.freeze({
      state: canvasView,
      canvasCameraLayout: canvasCameraLayout,
      canvasAutoFitBounds: canvasAutoFitBounds,
      fitCanvasViewToScene: fitCanvasViewToScene,
      setCanvasViewActive: setCanvasViewActive,
      resetCanvasView: resetCanvasView,
      applyCanvasView: applyCanvasView,
      updateCanvasViewUI: updateCanvasViewUI,
      dispose: function () { cameraListeners.splice(0).forEach(function (remove) { remove(); }); if (viewportObserver) viewportObserver.disconnect(); canvasViewPointers.clear(); }
    });
  }
  root.TypeDeformerCameraView = Object.freeze({ create: create });
})(typeof globalThis !== 'undefined' ? globalThis : this);
