(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TypeDeformerRenderEnvelope = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function normalizeContact(value) {
    value = value || {};
    return { left: !!value.left, top: !!value.top, right: !!value.right, bottom: !!value.bottom };
  }

  function scanPixels(data, width, height, options) {
    options = options || {};
    width = Math.max(0, Math.floor(Number(width) || 0));
    height = Math.max(0, Math.floor(Number(height) || 0));
    var gutter = Math.max(1, Math.floor(Number(options.gutter) || 3));
    var threshold = Math.max(0, Math.min(255, Number(options.threshold) || 1));
    var contact = { left: false, top: false, right: false, bottom: false };
    if (!data || !width || !height) return contact;
    var leftLimit = Math.min(width, gutter), topLimit = Math.min(height, gutter);
    var rightStart = Math.max(0, width - gutter), bottomStart = Math.max(0, height - gutter);
    function opaque(x, y) { return data[(y * width + x) * 4 + 3] > threshold; }
    for (var y = 0; y < height && !(contact.left && contact.right); y++) {
      for (var x = 0; x < leftLimit && !contact.left; x++) if (opaque(x, y)) contact.left = true;
      for (var rx = rightStart; rx < width && !contact.right; rx++) if (opaque(rx, y)) contact.right = true;
    }
    for (var x2 = 0; x2 < width && !(contact.top && contact.bottom); x2++) {
      for (var ty = 0; ty < topLimit && !contact.top; ty++) if (opaque(x2, ty)) contact.top = true;
      for (var by = bottomStart; by < height && !contact.bottom; by++) if (opaque(x2, by)) contact.bottom = true;
    }
    return contact;
  }

  function scanCanvas(canvas, options) {
    if (!canvas || !canvas.width || !canvas.height) return normalizeContact();
    var context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return normalizeContact();
    options = options || {};
    var gutter = Math.max(1, Math.floor(Number(options.gutter) || 3));
    var threshold = Math.max(0, Math.min(255, Number(options.threshold) || 1));
    var width = canvas.width, height = canvas.height;
    var gx = Math.min(width, gutter), gy = Math.min(height, gutter);
    function stripHasAlpha(x, y, w, h) {
      var data = context.getImageData(x, y, w, h).data;
      for (var index = 3; index < data.length; index += 4) if (data[index] > threshold) return true;
      return false;
    }
    return {
      left: stripHasAlpha(0, 0, gx, height),
      top: stripHasAlpha(0, 0, width, gy),
      right: stripHasAlpha(width - gx, 0, gx, height),
      bottom: stripHasAlpha(0, height - gy, width, gy)
    };
  }

  function touches(contact) {
    contact = normalizeContact(contact);
    return contact.left || contact.top || contact.right || contact.bottom;
  }

  function nextScale(current, contact) {
    current = Math.max(1, Number(current) || 1);
    if (!touches(contact)) return current;
    return current < 2 ? 2 : current * 1.75;
  }

  function expandBounds(bounds, scale) {
    bounds = bounds || { x: 0, y: 0, w: 1, h: 1 };
    scale = Math.max(1, Number(scale) || 1);
    var width = Math.max(1, Number(bounds.w) || 1), height = Math.max(1, Number(bounds.h) || 1);
    var grownWidth = width * scale, grownHeight = height * scale;
    return {
      x: (Number(bounds.x) || 0) - (grownWidth - width) * 0.5,
      y: (Number(bounds.y) || 0) - (grownHeight - height) * 0.5,
      w: grownWidth,
      h: grownHeight
    };
  }

  return { scanPixels: scanPixels, scanCanvas: scanCanvas, touches: touches, nextScale: nextScale, expandBounds: expandBounds };
});
