/* Browser layout is an adapter: source identity and logical order are not DOM order.
 * The renderer receives float boxes measured in untransformed document coordinates.
 * Independent deformation units disable optional ligatures; joining-script runs stay intact.
 */
(function (root) {
  'use strict';
  var VERSION = 1, serial = 0, fontEpoch = 0, layouts = new WeakMap(), runAdapters = new WeakMap();
  if (root.document && root.document.fonts && root.document.fonts.addEventListener) root.document.fonts.addEventListener('loadingdone', function () { fontEpoch++; });
  var prefix = 'source-' + (root.crypto && typeof root.crypto.randomUUID === 'function'
    ? root.crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
  var mark;
  try { mark = new RegExp('\\p{M}', 'u'); } catch (_) { mark = /[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]/; }
  function fallbackGraphemes(text) {
    var out = [], join = false, regional = 0;
    for (var cp of String(text)) {
      var n = cp.codePointAt(0), ri = n >= 0x1f1e6 && n <= 0x1f1ff;
      var extend = mark.test(cp) || n === 0xfe0f || n === 0xfe0e || n >= 0x1f3fb && n <= 0x1f3ff
        || n >= 0xe0020 && n <= 0xe007f;
      if (out.length && (join || extend || n === 0x200d || ri && regional % 2 === 1 || cp === '\n' && out[out.length - 1] === '\r')) out[out.length - 1] += cp;
      else out.push(cp);
      join = n === 0x200d; regional = ri ? regional + 1 : 0;
    }
    return out;
  }
  function tokenizeLine(line, segment, info) {
    var iterator = tokenizeLineSteps(line, segment, info), result;
    do { result = iterator.next(); } while (!result.done);
    return result.value;
  }
  function* tokenizeLineSteps(line, segment, info, batchSize) {
    var tokens = [], offset = 0, count = 0;
    for (var part of segment(line)) {
      var ch = typeof part === 'string' ? part : part.segment;
      var start = offset; offset += ch.length;
      var whitespace = /^[\t \u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]$/.test(ch);
      var control = /^[\u061c\u200b\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]$/.test(ch);
      var joining = !whitespace && !control && info(ch, ch.codePointAt(0)).joins;
      var cluster = { start: start, end: offset };
      var previous = tokens[tokens.length - 1];
      if (joining && previous && previous.join) {
        previous.text += ch; previous.sourceEnd = offset; previous.clusters.push(cluster);
      } else tokens.push({ text: ch, space: whitespace || control, whitespace: whitespace ? (ch === '\t' ? 'tab' : ch === '\u00a0' || ch === '\u202f' ? 'nonbreaking' : 'space') : null,
        control: control, join: !!joining, unit: joining ? 'joining-run' : whitespace ? 'whitespace' : control ? 'bidi-control' : 'grapheme',
        sourceStart: start, sourceEnd: offset, clusters: [cluster] });
      if (++count % (batchSize || 128) === 0) yield;
    }
    return tokens;
  }
  function assignIdentity(token) {
    if (!token.sourceId) token.sourceId = prefix + '-' + (++serial).toString(36);
    return token.sourceId;
  }
  function reference(element) {
    var d = element.dataset || {};
    return { id: d.sourceId || '', start: Number(d.sourceStart), end: Number(d.sourceEnd), text: d.sourceText || element.textContent,
      unit: d.sourceUnit || 'grapheme', clusters: d.sourceClusters ? JSON.parse(d.sourceClusters) : [] };
  }
  // New projects resolve explicit source references. Only rows without a
  // reference may use the historical positional adapter.
  function mapStates(elements, states) {
    var byId = new Map(), byRange = new Map(), result = new Array(elements.length).fill(null);
    elements.forEach(function (el, i) { var r = reference(el); if (r.id) byId.set(r.id, i); byRange.set(r.start + ':' + r.end + ':' + r.text, i); });
    (states || []).forEach(function (state, i) {
      if (!state || typeof state !== 'object') return;
      var r = state.source, at;
      if (r && typeof r === 'object') {
        at = byId.get(r.id);
        if (at === undefined) at = byRange.get(r.start + ':' + r.end + ':' + r.text);
      } else at = i < elements.length ? i : undefined;
      if (at !== undefined && result[at] === null) result[at] = state;
    });
    return result;
  }
  function finite(value) { return Number.isFinite(value) ? value : 0; }
  function requiresContiguousRuns(doc) {
    if (runAdapters.has(doc)) return runAdapters.get(doc);
    var probe = doc.createElement('span'), needed = false;
    probe.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;white-space:pre;font:100px "Times New Roman",serif;font-kerning:normal;letter-spacing:0';
    try {
      probe.textContent = 'AV'; doc.body.appendChild(probe);
      var whole = probe.getBoundingClientRect().width;
      probe.innerHTML = '<span>A</span><span>V</span>';
      needed = Math.abs(whole - probe.getBoundingClientRect().width) > .1;
    } finally { probe.remove(); }
    runAdapters.set(doc, needed); return needed;
  }
  var runStyleKeys = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontStretch', 'fontFeatureSettings',
    'fontVariationSettings', 'fontKerning', 'fontVariantLigatures', 'fontVariantEastAsian', 'fontOpticalSizing',
    'letterSpacing', 'wordSpacing', 'lineHeight', 'writingMode', 'textOrientation', 'textTransform', 'textRendering',
    'whiteSpace', 'tabSize', 'direction'];
  // Some engines stop shaping at a text-node boundary, including display:contents.
  // Temporarily coalesce only equal-style runs, then restore the actual glyph nodes.
  function contiguousRuns(paragraphs, doc) {
    var entries = new Map(), saved = [], replacements = [];
    function styleOf(el) {
      var computed = root.getComputedStyle(el), values = runStyleKeys.map(function (key) { return computed[key] || ''; });
      var language = el.closest('[lang]'), lang = language ? language.lang : '';
      return { values: values, lang: lang, key: JSON.stringify([values, lang]), line: parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.2 };
    }
    // Read styles before changing any paragraph; detached glyphs lose inheritance.
    paragraphs.forEach(function (p) {
      var children = Array.from(p.childNodes), base = styleOf(p), runs = [], run;
      saved.push({ paragraph: p, children: children });
      children.forEach(function (child) {
        var glyph = child.nodeType === 1 && child.classList.contains('c');
        if (child.nodeType !== 3 && !glyph) { run = null; runs.push({ node: child.cloneNode(true) }); return; }
        var style = glyph ? styleOf(child) : base, text = child.textContent;
        if (!run || run.style.key !== style.key) { run = { style: style, text: '', glyphs: [] }; runs.push(run); }
        if (glyph) run.glyphs.push({ element: child, start: run.text.length, end: run.text.length + text.length, parent: p, line: style.line });
        run.text += text;
      });
      var fragment = doc.createDocumentFragment();
      runs.forEach(function (part) {
        if (part.node) { fragment.appendChild(part.node); return; }
        var span = doc.createElement('span'), node = doc.createTextNode(part.text);
        runStyleKeys.forEach(function (key, i) { span.style[key] = part.style.values[i]; });
        if (part.style.lang) span.lang = part.style.lang;
        span.appendChild(node); fragment.appendChild(span);
        part.glyphs.forEach(function (entry) { entry.node = node; entries.set(entry.element, entry); });
      });
      replacements.push({ paragraph: p, fragment: fragment });
    });
    function restore() { saved.forEach(function (row) { row.paragraph.replaceChildren.apply(row.paragraph, row.children); }); }
    try { replacements.forEach(function (row) { row.paragraph.replaceChildren(row.fragment); }); }
    catch (error) { restore(); throw error; }
    return { entries: entries, restore: restore };
  }
  function rangeInkBox(range) {
    // Bidi boundaries can contribute a remote zero-width caret rect to the range.
    // It is not part of the selected glyph's box.
    var rects = Array.from(range.getClientRects()).filter(function (r) { return r.width > 0 && r.height > 0; });
    if (!rects.length) return range.getBoundingClientRect();
    var left = Math.min.apply(null, rects.map(function (r) { return r.left; }));
    var top = Math.min.apply(null, rects.map(function (r) { return r.top; }));
    var right = Math.max.apply(null, rects.map(function (r) { return r.right; }));
    var bottom = Math.max.apply(null, rects.map(function (r) { return r.bottom; }));
    return { left: left, top: top, width: right - left, height: bottom - top };
  }
  function matchRangeEdit(previousText, nextText, previous, next, selection, match) {
    if (!selection || !Number.isInteger(selection.start) || !Number.isInteger(selection.end)) return null;
    var start = selection.start, end = selection.end, delta = nextText.length - previousText.length;
    if (start < 0 || end < start || end > previousText.length) return null;
    if (start === end && delta < 0) {
      if (/Backward$/.test(selection.inputType || '')) start += delta;
      else if (/Forward$/.test(selection.inputType || '')) end -= delta;
      else return null;
    }
    var inserted = end - start + delta;
    if (start < 0 || end > previousText.length || inserted < 0
      || previousText.slice(0, start) !== nextText.slice(0, start)
      || previousText.slice(end) !== nextText.slice(start + inserted)) return null;
    var mapped = new Int32Array(next.length); mapped.fill(-1);
    var outside = new Map(), oldInside = [], newInside = [], oldIndices = [], newIndices = [];
    previous.forEach(function (row, i) {
      var a = Number(row.data.sourceStart), b = Number(row.data.sourceEnd);
      if (b <= start || a >= end) {
        var shift = a >= end ? delta : 0;
        outside.set((a + shift) + ':' + (b + shift) + ':' + row.text, i);
      } else { oldInside.push(row.text); oldIndices.push(i); }
    });
    next.forEach(function (token, i) {
      var at = outside.get(token.sourceStart + ':' + token.sourceEnd + ':' + token.text);
      if (at !== undefined) mapped[i] = at;
      else if (token.sourceEnd > start && token.sourceStart < start + inserted) { newInside.push(token.text); newIndices.push(i); }
    });
    var inside = match(oldInside, newInside);
    for (var i = 0; i < inside.length; i++) if (inside[i] >= 0) mapped[newIndices[i]] = oldIndices[inside[i]];
    return mapped;
  }
  // Read-only v92 migration. That schema stored states in a manually reversed
  // visual order. Reproduce its indexing only here, then attach logical ranges.
  // This function must never drive current DOM creation or text editing.
  function migrateLegacyStates(text, states, segment, info) {
    var rows = [], offset = 0, sourceIndex = 0;
    String(text).split(/\r\n|\r|\n/).forEach(function (line) {
      var tokens = [], local = 0;
      segment(line).forEach(function (ch) {
        var start = offset + local; local += ch.length;
        var cp = ch.codePointAt(0), space = cp === 32 || cp === 9 || cp === 160;
        var joins = !space && info(ch, cp).joins, previous = tokens[tokens.length - 1];
        if (joins && previous && previous.join) { previous.text += ch; previous.end = offset + local; }
        else tokens.push({ text: ch, start: start, end: offset + local, space: space, join: joins });
      });
      var at = 0;
      function details(t) { return info(t.text, t.text.codePointAt(0)); }
      while (at < tokens.length) {
        if (!tokens[at].space && details(tokens[at]).rtl) {
          var last = at, cursor = at + 1;
          while (cursor < tokens.length) {
            var token = tokens[cursor];
            if (!token.space && details(token).rtl) { last = cursor; cursor++; }
            else if (token.space || details(token).punct) cursor++;
            else break;
          }
          if (last > at) tokens.splice.apply(tokens, [at, last - at + 1].concat(tokens.slice(at, last + 1).reverse()));
          at = last + 1;
        } else at++;
      }
      tokens.forEach(function (token) {
        if (token.space) return;
        var state = states[sourceIndex++];
        if (state && typeof state === 'object') rows.push(Object.assign({}, state, { source: { start: token.start, end: token.end, text: token.text } }));
      });
      offset += line.length;
      if (text.slice(offset, offset + 2) === '\r\n') offset += 2;
      else if (offset < text.length) offset++;
    });
    return rows;
  }
  function measure(world, stage, elements, options) {
    options = options || {};
    var grid = !!options.grid, vertical = !!options.vertical, doc = world.ownerDocument;
    var paragraphs = Array.from(world.querySelectorAll('p'));
    var baseStyle = root.getComputedStyle(world), stageRect = stage.getBoundingClientRect();
    var objectStyles = Array.from(world.querySelectorAll('.text-object'), function (el) { return el.style.cssText; });
    var shapeKeys = runStyleKeys.concat(['wordBreak', 'lineBreak', 'overflowWrap', 'textIndent', 'textAlign', 'textAlignLast']);
    var geometryKey = JSON.stringify([fontEpoch, grid, vertical, options.key || '', stageRect.width, stageRect.height,
      shapeKeys.map(function (key) { return baseStyle[key]; }), world.closest('[lang]') && world.closest('[lang]').lang,
      baseStyle.paddingLeft, baseStyle.paddingRight, baseStyle.paddingTop, baseStyle.paddingBottom,
      world.style.inlineSize, world.style.minInlineSize, objectStyles]);
    function inlineShape(el) {
      // Compare actual shaping declarations without crossing the CSSOM for
      // dozens of absent properties on each of tens of thousands of glyphs.
      return (el.style.cssText.match(/(?:^|;)\s*(?:font(?:-[\w-]+)?|letter-spacing|word-spacing|line-height|writing-mode|text-orientation|text-transform|text-rendering|white-space|tab-size|direction|word-break|line-break|overflow-wrap|text-indent|text-align(?:-last)?)\s*:[^;]*/g) || []).join(';');
    }
    var groups = new Map(paragraphs.map(function (p) { return [p, { elements: [], shapes: [] }]; }));
    elements.forEach(function (el) {
      var group = groups.get(el.parentElement);
      if (group) {
        group.elements.push(el);
        group.shapes.push([el.textContent, el.getAttribute('lang'), el.getAttribute('dir'), inlineShape(el)]);
      }
    });
    groups.forEach(function (group, p) {
      group.signature = JSON.stringify([p.textContent, p.getAttribute('lang'), p.getAttribute('dir'),
        inlineShape(p), group.shapes]);
    });
    var signature = JSON.stringify([fontEpoch, grid, vertical, options.key || '', stageRect.width, stageRect.height,
      baseStyle.font, baseStyle.fontFeatureSettings, baseStyle.fontVariationSettings, baseStyle.letterSpacing,
      baseStyle.lineHeight, baseStyle.textAlign, baseStyle.writingMode, baseStyle.paddingLeft, baseStyle.paddingRight,
      baseStyle.paddingTop, baseStyle.paddingBottom, world.style.inlineSize, world.style.minInlineSize,
      paragraphs.map(function (p) { return p.textContent; }),
      objectStyles, geometryKey, Array.from(groups.values(), function (group) { return group.signature; }),
      elements.map(function (el) { return [el.dataset.sourceId, el.dataset.sourceStart, el.dataset.sourceEnd, el.textContent,
        el.style.fontVariationSettings, el.style.fontSize, el.style.fontFamily, el.style.fontWeight,
        grid ? [el.style.left, el.style.top, el.style.width, el.style.height] : null]; })]);
    var cached = layouts.get(world);
    if (cached && cached.signature === signature && cached.elements.length === elements.length
      && cached.elements.every(function (el, i) { return el === elements[i]; })) return cached.snapshot;
    var reused = new Map(), changed = paragraphs;
    // Fixed cached paragraph widths must not conceal a shrinking max-content
    // container. Reuse implicit-width paragraphs only while the viewport's
    // minimum width is binding; otherwise take the full native path.
    var stableConstraint = world.style.inlineSize && world.style.inlineSize !== 'max-content'
      || !vertical && cached && parseFloat(cached.measuredInlineSize) <= stageRect.width + 0.1;
    if (!grid && cached && stableConstraint && cached.geometryKey === geometryKey && cached.paragraphs) {
      changed = [];
      groups.forEach(function (group, p) {
        var previous = cached.paragraphs.get(p);
        if (previous && previous.signature === group.signature && previous.elements.length === group.elements.length
          && previous.elements.every(function (el, i) { return el === group.elements[i]; })) {
          group.elements.forEach(function (el, i) { reused.set(el, previous.boxes[i]); });
        } else changed.push(p);
      });
    }
    var partial = !grid && changed.length < paragraphs.length;
    world.classList.add(partial ? 'text-layout-coordinates' : 'text-layout-reading');
    if (partial) changed.forEach(function (p) { p.classList.add('text-layout-reading', 'text-layout-measuring'); });
    else if (!grid) world.classList.add('text-layout-measuring');
    var snapshot, runs, contiguous = !grid && requiresContiguousRuns(doc), measuredInlineSize;
    try {
      if (contiguous) runs = contiguousRuns(changed, doc);
      // A changed longest line can change the available inline measure even
      // when the CSS constraint is unchanged. In that case every paragraph's
      // alignment/wrapping must be measured again.
      measuredInlineSize = root.getComputedStyle(world).inlineSize;
      if (partial && measuredInlineSize !== cached.measuredInlineSize) {
        if (runs) { runs.restore(); runs = null; }
        changed.forEach(function (p) { p.classList.remove('text-layout-reading', 'text-layout-measuring'); });
        world.classList.remove('text-layout-coordinates');
        world.classList.add('text-layout-reading', 'text-layout-measuring');
        partial = false; reused.clear(); changed = paragraphs;
        if (contiguous) runs = contiguousRuns(paragraphs, doc);
        measuredInlineSize = root.getComputedStyle(world).inlineSize;
      }
      // This phase only reads layout. No per-glyph writes can force another layout.
      var base = stage.getBoundingClientRect(), worldStyle = root.getComputedStyle(world);
      var paragraphBoxes = new Map(paragraphs.map(function (p) { var r = p.getBoundingClientRect(); return [p, { x: r.left, y: r.top, w: r.width, h: r.height }]; }));
      var range = doc.createRange(), styleCache = new Map();
      var boxes = elements.map(function (el) {
        var entry = runs && runs.entries.get(el), rect, line, parent = paragraphBoxes.get(entry ? entry.parent : el.parentElement);
        var previous = reused.get(el);
        if (previous) {
          var source = reference(el); source.clusters = Object.freeze(source.clusters.map(function (cluster) { return Object.freeze(cluster); })); Object.freeze(source);
          return Object.freeze({ source: source, x: finite(parent.x + previous.localX - base.left), y: finite(parent.y + previous.localY - base.top),
            w: previous.w, h: previous.h, localX: previous.localX, localY: previous.localY, direction: previous.direction });
        }
        if (entry) { range.setStart(entry.node, entry.start); range.setEnd(entry.node, entry.end); rect = rangeInkBox(range); line = entry.line; }
        else {
          rect = el.getBoundingClientRect();
          var style = root.getComputedStyle(el), key = style.fontSize + '/' + style.lineHeight;
          line = styleCache.get(key);
          if (!line) { line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2; styleCache.set(key, line); }
        }
        var x = rect.left, y = rect.top, w = rect.width, h = rect.height, rtl = false;
        if (!grid) {
          if (vertical) { x += (w - line) / 2; w = line; } else { y += (h - line) / 2; h = line; }
          // Caret geometry exposes the browser's resolved inline direction,
          // including mirrored brackets and explicit embedding/isolation controls.
          var node = entry ? entry.node : el.firstChild;
          if (!vertical && node && node.nodeType === 3) {
            range.setStart(node, entry ? entry.start : 0); range.collapse(true); var first = range.getBoundingClientRect();
            range.setStart(node, entry ? entry.end : node.length); range.collapse(true); var last = range.getBoundingClientRect();
            rtl = last.left < first.left;
          }
        }
        var source = reference(el); source.clusters = Object.freeze(source.clusters.map(function (cluster) { return Object.freeze(cluster); })); Object.freeze(source);
        return Object.freeze({ source: source, x: finite(x - base.left), y: finite(y - base.top), w: finite(w), h: finite(h),
          localX: parent ? finite(x - parent.x) : 0, localY: parent ? finite(y - parent.y) : 0, direction: rtl ? 'rtl' : 'ltr' });
      });
      snapshot = Object.freeze({ version: VERSION, engine: contiguous ? 'browser-contiguous-runs' : 'browser-inline-runs', unitModel: 'grapheme-or-joining-run',
        reusedParagraphs: partial ? paragraphs.length - changed.length : 0,
        optionalLigatures: false, grid: grid, vertical: vertical,
        inputs: Object.freeze({ font: worldStyle.font, fontFeatures: worldStyle.fontFeatureSettings, fontVariations: worldStyle.fontVariationSettings,
          letterSpacing: worldStyle.letterSpacing, writingMode: worldStyle.writingMode, inlineSize: worldStyle.inlineSize,
          paddingLeft: worldStyle.paddingLeft, paddingTop: worldStyle.paddingTop, tabSize: worldStyle.tabSize }), boxes: Object.freeze(boxes) });
      // Writes happen only after the final geometry read.
      if (runs) { runs.restore(); runs = null; }
      if (!grid) {
        paragraphBoxes.forEach(function (r, p) {
          if (partial && changed.indexOf(p) < 0) return;
          p.style.setProperty('--layout-flow-width', r.w + 'px'); p.style.setProperty('--layout-flow-height', r.h + 'px'); p.dataset.layoutFlow = '1';
        });
        boxes.forEach(function (box, i) { var el = elements[i];
          if (reused.has(el)) return;
          el.style.setProperty('--layout-x', box.localX + 'px'); el.style.setProperty('--layout-y', box.localY + 'px');
          el.style.setProperty('--layout-w', box.w + 'px'); el.style.setProperty('--layout-h', box.h + 'px');
          el.dataset.layoutDirection = box.direction;
        });
      }
    } finally {
      if (runs) runs.restore();
      if (partial) changed.forEach(function (p) { p.classList.remove('text-layout-reading', 'text-layout-measuring'); });
      world.classList.remove('text-layout-measuring', 'text-layout-reading', 'text-layout-coordinates');
    }
    var byElement = new Map(elements.map(function (el, i) { return [el, snapshot.boxes[i]]; }));
    groups.forEach(function (group) { group.boxes = group.elements.map(function (el) { return byElement.get(el); }); delete group.shapes; });
    layouts.set(world, { signature: signature, geometryKey: geometryKey, measuredInlineSize: measuredInlineSize,
      paragraphs: groups, elements: Array.from(elements), snapshot: snapshot });
    return snapshot;
  }
  root.TypeDeformerTextLayout = Object.freeze({ version: VERSION, fallbackGraphemes: fallbackGraphemes, tokenizeLine: tokenizeLine, tokenizeLineSteps: tokenizeLineSteps,
    assignIdentity: assignIdentity, reference: reference, mapStates: mapStates, matchRangeEdit: matchRangeEdit, migrateLegacyStates: migrateLegacyStates, measure: measure,
    invalidate: function () { fontEpoch++; } });
})(typeof globalThis !== 'undefined' ? globalThis : this);
