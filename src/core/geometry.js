// Pure geometry shared by layout, preview and every export path.

function quant(x, step) { return Math.round(x / step) * step; }

// Reading-order sequence of cell indices for a cols×rows grid.
// Horizontal: row-major, left-to-right, top-to-bottom.
// Vertical: genkou-youshi convention — columns right-to-left,
// each column read top-to-bottom.
function buildCellOrder(cols, rows, vertical) {
  var order = [];
  if (!vertical) {
    for (var i = 0; i < cols * rows; i++) order.push(i);
  } else {
    for (var c = cols - 1; c >= 0; c--) {
      for (var r = 0; r < rows; r++) order.push(r * cols + c);
    }
  }
  return order;
}

function lerpHex(a, b, t) {
  function channel(hex, at) { return parseInt(hex.slice(at, at + 2), 16); }
  t = Math.max(0, Math.min(1, t));
  var r = Math.round(channel(a, 1) + (channel(b, 1) - channel(a, 1)) * t);
  var g = Math.round(channel(a, 3) + (channel(b, 3) - channel(a, 3)) * t);
  var bl = Math.round(channel(a, 5) + (channel(b, 5) - channel(a, 5)) * t);
  return '#' + [r, g, bl].map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
}

// baseline y inside a glyph's layout box (half-leading model)
function baselineOffset(g, fm) {
  var leading = g.h - (fm.ascent + fm.descent);
  return leading / 2 + fm.ascent;
}

function fitCompositionViewport(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  var scale = Math.min(targetWidth / Math.max(1, sourceWidth), targetHeight / Math.max(1, sourceHeight));
  return {
    w: targetWidth,
    h: targetHeight,
    s: scale,
    dx: (targetWidth - sourceWidth * scale) * 0.5,
    dy: (targetHeight - sourceHeight * scale) * 0.5
  };
}

function contentBounds(glyphs, pad) {
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (var i = 0; i < glyphs.length; i++) {
    var g = glyphs[i];
    // transformed corners: p' = O + t + R·K·S·(p − O)
    var rad = (g.rot || 0) * Math.PI / 180;
    var cosR = Math.cos(rad), sinR = Math.sin(rad);
    var tanX = Math.tan((g.skewX || 0) * Math.PI / 180);
    var tanY = Math.tan((g.skewY || 0) * Math.PI / 180);
    var ma = cosR * g.scaleX - sinR * tanY * g.scaleX;
    var mb = sinR * g.scaleX + cosR * tanY * g.scaleX;
    var mc = cosR * tanX * g.scaleY - sinR * g.scaleY;
    var md = sinR * tanX * g.scaleY + cosR * g.scaleY;
    var bx = g.bx != null ? g.bx : g.x;
    var by = g.by != null ? g.by : g.y;
    var bw = g.bw != null ? g.bw : g.w;
    var bh = g.bh != null ? g.bh : g.h;
    var xs = [bx, bx + bw], ys = [by, by + bh];
    for (var a = 0; a < 2; a++) for (var b = 0; b < 2; b++) {
      var lx = xs[a] - g.ox;
      var ly = ys[b] - g.oy;
      var px = g.ox + g.tx + ma * lx + mc * ly;
      var py = g.oy + g.ty + mb * lx + md * ly;
      var offsets = [[0, 0]];
      if (Math.abs(g.misregX) > 0.001 || Math.abs(g.misregY) > 0.001) offsets.push([g.misregX, g.misregY], [-g.misregX * 0.65, -g.misregY * 0.65]);
      for (var pass = 0; pass < offsets.length; pass++) {
        var passX = px + offsets[pass][0], passY = py + offsets[pass][1];
        if (passX < minX) minX = passX; if (passX > maxX) maxX = passX;
        if (passY < minY) minY = passY; if (passY > maxY) maxY = passY;
      }
    }
  }
  if (!glyphs.length) { minX = minY = 0; maxX = maxY = 100; }
  return { x: minX - pad, y: minY - pad, w: (maxX - minX) + pad * 2, h: (maxY - minY) + pad * 2 };
}

// Anchor codes are <vertical><horizontal>, e.g. 'tl', 'cc', 'br'.
var ANCHOR_X = { l: 0, c: 0.5, r: 1 };
var ANCHOR_Y = { t: 0, c: 0.5, b: 1 };

// Where the content goes on the output: auto = tight bounds,
// otherwise a fixed artboard with anchor / margin / fit-scale.
function exportLayout(bounds, layout) {
  if (layout.artboard === 'auto') {
    return { w: bounds.w, h: bounds.h, s: 1, dx: -bounds.x, dy: -bounds.y };
  }
  var W = Math.max(16, Math.round(layout.abW) || 1080);
  var H = Math.max(16, Math.round(layout.abH) || 1080);
  var m = Math.min(W, H) * layout.marginPct / 100;
  var availW = Math.max(1, W - 2 * m);
  var availH = Math.max(1, H - 2 * m);
  var s = layout.fit ? Math.min(availW / bounds.w, availH / bounds.h) : 1;
  // `|| 0.5` here would fold the left and top anchors — whose fraction is 0,
  // and therefore falsy — into centre. Distinguish "no such anchor" from zero.
  var ax = ANCHOR_X[layout.anchor.charAt(1)];
  var ay = ANCHOR_Y[layout.anchor.charAt(0)];
  if (ax == null) ax = 0.5;
  if (ay == null) ay = 0.5;
  var dx = m + (availW - bounds.w * s) * ax - bounds.x * s;
  var dy = m + (availH - bounds.h * s) * ay - bounds.y * s;
  return { w: W, h: H, s: s, dx: dx, dy: dy };
}

export {
  quant,
  buildCellOrder,
  lerpHex,
  baselineOffset,
  fitCompositionViewport,
  contentBounds,
  exportLayout
};
