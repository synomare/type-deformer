// Camera input controller: owns media stream, detector, tracking state and camera controls.
// This is authored source. Editor and tests consume this file directly.
(function (root) {
  'use strict';
  function create(options) {
    options = options || {};
      var stageArtwork = document.getElementById('stageArtwork');
      var blobTrackOverlay = document.getElementById('blobTrackOverlay');
      var blobTrackOverlayCtx = blobTrackOverlay.getContext('2d');
      var blobTrackPreview = document.getElementById('blobTrackPreview');
      var blobTrackPreviewCtx = blobTrackPreview.getContext('2d', { willReadFrequently: true });
      var blobTrackStatus = document.getElementById('blobTrackStatus');
      var btnBlobCamera = document.getElementById('btnBlobCamera');
      var btnBlobBackground = document.getElementById('btnBlobBackground');
      var blobTrackState = {
        stream: null, video: null, sourceCanvas: null, sourceCtx: null,
        background: null, blobs: [], nextId: 1, raf: null, lastFrame: 0,
        trails: Object.create(null), width: 160, height: 120
      };
      var cameraGeneration = 0;

      function setBlobTrackStatus(text, state) {
        blobTrackStatus.textContent = text;
        blobTrackStatus.dataset.state = state || 'idle';
      }

      function stopBlobCamera() {
        cameraGeneration++;
        if (blobTrackState.raf != null) cancelAnimationFrame(blobTrackState.raf);
        blobTrackState.raf = null;
        if (blobTrackState.stream) {
          var tracks = blobTrackState.stream.getTracks();
          for (var i = 0; i < tracks.length; i++) tracks[i].stop();
        }
        blobTrackState.stream = null;
        blobTrackState.background = null;
        blobTrackState.blobs = [];
        blobTrackState.trails = Object.create(null);
        if (blobTrackState.video) blobTrackState.video.srcObject = null;
        btnBlobCamera.textContent = 'Start Camera';
        btnBlobCamera.disabled = false;
        btnBlobBackground.disabled = true;
        blobTrackOverlay.hidden = true;
        blobTrackOverlayCtx.clearRect(0, 0, blobTrackOverlay.width, blobTrackOverlay.height);
        setBlobTrackStatus('CAMERA OFF · DEMO FIELD · Start Cameraで実入力', 'idle');
        applyBlobTrackingFrame();
      }

      async function startBlobCamera() {
        if (blobTrackState.stream) { stopBlobCamera(); return; }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setBlobTrackStatus('CAMERA UNAVAILABLE · HTTPSまたはlocalhostで開いてください', 'error');
          return;
        }
        btnBlobCamera.disabled = true;
        var generation = ++cameraGeneration, stream = null, video = null;
        setBlobTrackStatus('CAMERA REQUEST · カメラ使用を許可してください', 'idle');
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
          });
          if (generation !== cameraGeneration) return;
          video = blobTrackState.video || document.createElement('video');
          video.muted = true;
          video.playsInline = true;
          video.autoplay = true;
          video.srcObject = stream;
          await video.play();
          if (generation !== cameraGeneration) return;
          blobTrackState.stream = stream;
          blobTrackState.video = video;
          blobTrackState.background = null;
          blobTrackState.blobs = [];
          blobTrackState.trails = Object.create(null);
          btnBlobCamera.textContent = 'Stop Camera';
          btnBlobBackground.disabled = false;
          setBlobTrackStatus('LIVE · SIMPLE DETECTOR · Learn Backgroundで背景差分', 'live');
          blobTrackState.raf = requestAnimationFrame(processBlobTrackFrame);
        } catch (err) {
          if (generation !== cameraGeneration) return;
          setBlobTrackStatus(err && err.name === 'NotAllowedError'
            ? 'CAMERA BLOCKED · ブラウザ設定からカメラを許可してください'
            : 'CAMERA ERROR · 映像入力を開始できませんでした', 'error');
        } finally {
          // A pending permission/play request may complete after pagehide or
          // disposal. Only the current request can install the acquired stream.
          if (stream && blobTrackState.stream !== stream) {
            stream.getTracks().forEach(function (track) { track.stop(); });
            if (video && video.srcObject === stream) {
              video.pause();
              video.srcObject = null;
            }
          }
          if (generation === cameraGeneration) btnBlobCamera.disabled = false;
        }
      }

      function learnBlobBackground() {
        if (!blobTrackState.sourceCtx || !blobTrackState.stream) return;
        var frame = blobTrackState.sourceCtx.getImageData(0, 0, blobTrackState.width, blobTrackState.height).data;
        var bg = new Uint8Array(blobTrackState.width * blobTrackState.height);
        for (var i = 0, p = 0; i < frame.length; i += 4, p++) bg[p] = Math.round(frame[i] * 0.2126 + frame[i + 1] * 0.7152 + frame[i + 2] * 0.0722);
        blobTrackState.background = bg;
        blobTrackState.blobs = [];
        blobTrackState.trails = Object.create(null);
        setBlobTrackStatus('LIVE · BACKGROUND SUBTRACTION · 0 BLOBS', 'live');
      }

      function connectedBlobComponents(mask, width, height) {
        var seen = new Uint8Array(mask.length);
        var queue = new Int32Array(mask.length);
        var minPixels = Math.max(1, Math.round(options.params().blobMinArea * mask.length));
        var maxPixels = Math.max(minPixels, Math.round(options.params().blobMaxArea * mask.length));
        var components = [];
        for (var start = 0; start < mask.length; start++) {
          if (!mask[start] || seen[start]) continue;
          var head = 0, tail = 0;
          queue[tail++] = start;
          seen[start] = 1;
          var area = 0, sumX = 0, sumY = 0, sumXX = 0, sumYY = 0, sumXY = 0, perimeter = 0;
          var minX = width, minY = height, maxX = 0, maxY = 0;
          while (head < tail) {
            var index = queue[head++];
            var x = index % width, y = (index / width) | 0;
            area++; sumX += x; sumY += y; sumXX += x * x; sumYY += y * y; sumXY += x * y;
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
            if (x === 0 || !mask[index - 1]) perimeter++;
            if (x === width - 1 || !mask[index + 1]) perimeter++;
            if (y === 0 || !mask[index - width]) perimeter++;
            if (y === height - 1 || !mask[index + width]) perimeter++;
            for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) {
              if (!ox && !oy) continue;
              var nx = x + ox, ny = y + oy;
              if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
              var ni = ny * width + nx;
              if (mask[ni] && !seen[ni]) { seen[ni] = 1; queue[tail++] = ni; }
            }
          }
          if (area >= minPixels && area <= maxPixels) {
            var centerX = sumX / area, centerY = sumY / area;
            var covXX = Math.max(0, sumXX / area - centerX * centerX);
            var covYY = Math.max(0, sumYY / area - centerY * centerY);
            var covXY = sumXY / area - centerX * centerY;
            var trace = covXX + covYY;
            var discriminant = Math.sqrt(Math.max(0, (covXX - covYY) * (covXX - covYY) + 4 * covXY * covXY));
            var major = Math.max(0.0001, (trace + discriminant) * 0.5);
            var minor = Math.max(0.0001, (trace - discriminant) * 0.5);
            components.push({
              area: area / mask.length,
              cx: centerX / width, cy: centerY / height,
              x: minX / width, y: minY / height,
              w: (maxX - minX + 1) / width, h: (maxY - minY + 1) / height,
              angle: 0.5 * Math.atan2(2 * covXY, covXX - covYY),
              eccentricity: Math.sqrt(Math.max(0, 1 - minor / major)),
              compactness: Math.min(1, 4 * Math.PI * area / Math.max(1, perimeter * perimeter))
            });
          }
        }
        components.sort(function (a, b) { return b.area - a.area; });
        return components.slice(0, Math.max(1, Math.round(options.params().blobMaxBlobs)));
      }

      function trackBlobIds(detected) {
        var previous = blobTrackState.blobs.slice();
        var used = {};
        var smoothing = options.params().blobSmoothing;
        var maxMovement = Math.max(0.02, options.params().blobMaxMove);
        function angleLerp(from, to, amount) {
          var delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
          return from + delta * amount;
        }
        for (var i = 0; i < detected.length; i++) {
          var blob = detected[i], best = null, bestIndex = -1, bestD = maxMovement * maxMovement;
          for (var j = 0; j < previous.length; j++) {
            if (used[j]) continue;
            var predictedX = previous[j].cx + (previous[j].vx || 0) * (1 + (previous[j].lost || 0) * 0.35);
            var predictedY = previous[j].cy + (previous[j].vy || 0) * (1 + (previous[j].lost || 0) * 0.35);
            var dx = blob.cx - predictedX, dy = blob.cy - predictedY;
            var sizePenalty = Math.abs(Math.sqrt(blob.area) - Math.sqrt(previous[j].area || blob.area)) * 0.18;
            var d = dx * dx + dy * dy + sizePenalty * sizePenalty;
            if (d < bestD) { bestD = d; best = previous[j]; bestIndex = j; }
          }
          if (best) {
            used[bestIndex] = true;
            blob.id = best.id;
            var rawVx = blob.cx - best.cx, rawVy = blob.cy - best.cy;
            var velocityMix = Math.max(0.16, 1 - smoothing * 0.72);
            blob.vx = (best.vx || 0) * (1 - velocityMix) + rawVx * velocityMix;
            blob.vy = (best.vy || 0) * (1 - velocityMix) + rawVy * velocityMix;
            blob.speed = Math.sqrt(blob.vx * blob.vx + blob.vy * blob.vy);
            blob.cx = best.cx * smoothing + blob.cx * (1 - smoothing);
            blob.cy = best.cy * smoothing + blob.cy * (1 - smoothing);
            blob.x = best.x * smoothing + blob.x * (1 - smoothing);
            blob.y = best.y * smoothing + blob.y * (1 - smoothing);
            blob.w = best.w * smoothing + blob.w * (1 - smoothing);
            blob.h = best.h * smoothing + blob.h * (1 - smoothing);
            blob.area = best.area * smoothing + blob.area * (1 - smoothing);
            blob.angle = angleLerp(best.angle || 0, blob.angle || 0, 1 - smoothing);
            blob.eccentricity = (best.eccentricity || 0) * smoothing + (blob.eccentricity || 0) * (1 - smoothing);
            blob.compactness = (best.compactness || 0) * smoothing + (blob.compactness || 0) * (1 - smoothing);
            blob.age = (best.age || 0) + 1;
            blob.lost = 0;
          } else {
            blob.id = blobTrackState.nextId++;
            blob.vx = 0; blob.vy = 0; blob.speed = 0; blob.age = 1; blob.lost = 0;
          }
        }
        var revive = Math.max(0, Math.round(options.params().blobRevive));
        for (var p = 0; p < previous.length; p++) {
          if (used[p] || (previous[p].lost || 0) >= revive) continue;
          var retained = Object.assign({}, previous[p]);
          retained.lost = (retained.lost || 0) + 1;
          retained.cx = Math.max(-0.2, Math.min(1.2, retained.cx + (retained.vx || 0)));
          retained.cy = Math.max(-0.2, Math.min(1.2, retained.cy + (retained.vy || 0)));
          retained.vx = (retained.vx || 0) * 0.92;
          retained.vy = (retained.vy || 0) * 0.92;
          retained.speed = Math.sqrt(retained.vx * retained.vx + retained.vy * retained.vy);
          detected.push(retained);
        }
        detected.sort(function (a, b) { return (a.lost || 0) - (b.lost || 0) || b.area - a.area; });
        var keepIds = Object.create(null);
        var trailLimit = Math.max(2, Math.min(50, Math.max(options.params().blobTrails, options.params().blobRevive) + 2));
        for (var t = 0; t < detected.length; t++) {
          var tracked = detected[t];
          keepIds[tracked.id] = true;
          var trail = blobTrackState.trails[tracked.id] || (blobTrackState.trails[tracked.id] = []);
          trail.push({ cx: tracked.cx, cy: tracked.cy, vx: tracked.vx || 0, vy: tracked.vy || 0, angle: tracked.angle || 0, area: tracked.area, lost: tracked.lost || 0 });
          if (trail.length > trailLimit) trail.splice(0, trail.length - trailLimit);
        }
        for (var trailId in blobTrackState.trails) if (!keepIds[trailId]) delete blobTrackState.trails[trailId];
        return detected;
      }

      function drawBlobTrackPreview(mask, blobs, width, height) {
        var image = blobTrackPreviewCtx.createImageData(width, height);
        for (var i = 0; i < mask.length; i++) {
          var value = mask[i] ? 238 : 12, p = i * 4;
          image.data[p] = image.data[p + 1] = image.data[p + 2] = value;
          image.data[p + 3] = 255;
        }
        blobTrackPreviewCtx.putImageData(image, 0, 0);
        blobTrackPreviewCtx.strokeStyle = options.params().blobColor;
        blobTrackPreviewCtx.fillStyle = options.params().blobColor;
        blobTrackPreviewCtx.font = '7px monospace';
        blobTrackPreviewCtx.lineWidth = 1;
        for (var b = 0; b < blobs.length; b++) {
          var blob = blobs[b];
          blobTrackPreviewCtx.globalAlpha = Math.max(0.2, 1 - (blob.lost || 0) / Math.max(1, options.params().blobRevive + 1));
          blobTrackPreviewCtx.strokeRect(blob.x * width, blob.y * height, blob.w * width, blob.h * height);
          blobTrackPreviewCtx.fillText('id' + blob.id + (blob.lost ? ' L' + blob.lost : ''), blob.x * width + 2, Math.max(8, blob.y * height - 2));
        }
        blobTrackPreviewCtx.globalAlpha = 1;
      }

      function drawBlobTrackOverlay() {
        var show = !!blobTrackState.stream && options.params().blobDrawBounds && options.params().activeOperator === 'blobTrack';
        blobTrackOverlay.hidden = !show;
        if (!show) return;
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        var width = Math.max(1, stageArtwork.offsetWidth), height = Math.max(1, stageArtwork.offsetHeight);
        var pixelW = Math.round(width * dpr), pixelH = Math.round(height * dpr);
        if (blobTrackOverlay.width !== pixelW || blobTrackOverlay.height !== pixelH) {
          blobTrackOverlay.width = pixelW; blobTrackOverlay.height = pixelH;
        }
        blobTrackOverlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        blobTrackOverlayCtx.clearRect(0, 0, width, height);
        blobTrackOverlayCtx.strokeStyle = options.params().blobColor;
        blobTrackOverlayCtx.fillStyle = options.params().blobColor;
        blobTrackOverlayCtx.lineWidth = 1;
        blobTrackOverlayCtx.font = '10px monospace';
        for (var i = 0; i < blobTrackState.blobs.length; i++) {
          var blob = blobTrackState.blobs[i];
          var x = blob.x * width, y = blob.y * height, w = blob.w * width, h = blob.h * height;
          blobTrackOverlayCtx.strokeRect(x, y, w, h);
          blobTrackOverlayCtx.beginPath();
          blobTrackOverlayCtx.moveTo(blob.cx * width - 7, blob.cy * height);
          blobTrackOverlayCtx.lineTo(blob.cx * width + 7, blob.cy * height);
          blobTrackOverlayCtx.moveTo(blob.cx * width, blob.cy * height - 7);
          blobTrackOverlayCtx.lineTo(blob.cx * width, blob.cy * height + 7);
          blobTrackOverlayCtx.stroke();
          var vectorScale = Math.min(width, height) * options.params().blobVector * 2.2;
          blobTrackOverlayCtx.beginPath();
          blobTrackOverlayCtx.moveTo(blob.cx * width, blob.cy * height);
          blobTrackOverlayCtx.lineTo(blob.cx * width + (blob.vx || 0) * vectorScale, blob.cy * height + (blob.vy || 0) * vectorScale);
          blobTrackOverlayCtx.stroke();
          blobTrackOverlayCtx.fillText('blob ' + blob.id + ' · v' + ((blob.speed || 0) * 100).toFixed(1), x + 3, Math.max(11, y - 4));
        }
      }

      function applyBlobTrackingFrame() {
        drawBlobTrackOverlay();
        options.frameChanged();
      }

      function processBlobTrackFrame(now) {
        if (!blobTrackState.stream || !blobTrackState.video) return;
        blobTrackState.raf = requestAnimationFrame(processBlobTrackFrame);
        if (now - blobTrackState.lastFrame < 33 || blobTrackState.video.readyState < 2) return;
        blobTrackState.lastFrame = now;
        var width = blobTrackState.width, height = blobTrackState.height;
        if (!blobTrackState.sourceCanvas) {
          blobTrackState.sourceCanvas = (globalThis.TypeDeformerRenderContext ? globalThis.TypeDeformerRenderContext.createCanvas() : document.createElement('canvas'));
          blobTrackState.sourceCanvas.width = width; blobTrackState.sourceCanvas.height = height;
          blobTrackState.sourceCtx = blobTrackState.sourceCanvas.getContext('2d', { willReadFrequently: true });
        }
        var ctx = blobTrackState.sourceCtx;
        ctx.save(); ctx.translate(width, 0); ctx.scale(-1, 1);
        ctx.drawImage(blobTrackState.video, 0, 0, width, height); ctx.restore();
        var pixels = ctx.getImageData(0, 0, width, height).data;
        var mask = new Uint8Array(width * height);
        var threshold = options.params().blobThreshold * 255;
        for (var i = 0, p = 0; i < pixels.length; i += 4, p++) {
          var luminance = pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722;
          mask[p] = blobTrackState.background
            ? (Math.abs(luminance - blobTrackState.background[p]) >= threshold ? 1 : 0)
            : (luminance >= threshold ? 1 : 0);
        }
        blobTrackState.blobs = trackBlobIds(connectedBlobComponents(mask, width, height));
        drawBlobTrackPreview(mask, blobTrackState.blobs, width, height);
        var visibleBlobs = blobTrackState.blobs.filter(function (blob) { return !blob.lost; }).length;
        var predictedBlobs = blobTrackState.blobs.length - visibleBlobs;
        setBlobTrackStatus('LIVE · ' + (blobTrackState.background ? 'BACKGROUND SUBTRACTION' : 'SIMPLE DETECTOR')
          + ' · ' + visibleBlobs + ' LIVE' + (predictedBlobs ? ' · ' + predictedBlobs + ' PREDICTED' : ''), 'live');
        applyBlobTrackingFrame();
      }

      btnBlobCamera.addEventListener('click', startBlobCamera);
      btnBlobBackground.addEventListener('click', learnBlobBackground);
      window.addEventListener('pagehide', stopBlobCamera);


    return Object.freeze({
      state: blobTrackState,
      drawBlobTrackOverlay: drawBlobTrackOverlay,
      stop: stopBlobCamera,
      dispose: function () { stopBlobCamera(); btnBlobCamera.removeEventListener('click', startBlobCamera); btnBlobBackground.removeEventListener('click', learnBlobBackground); window.removeEventListener('pagehide', stopBlobCamera); }
    });
  }
  root.TypeDeformerBlobCamera = Object.freeze({ create: create });
})(typeof globalThis !== 'undefined' ? globalThis : this);
