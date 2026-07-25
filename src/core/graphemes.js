// Grapheme cluster splitting. One cluster is one deformable unit.

/* ---------------- grapheme splitting (ported) ---------------- */
var graphemeSegmenter = (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function')
  ? new Intl.Segmenter('ja', { granularity: 'grapheme' }) : null;

function toGraphemes(str) {
  if (graphemeSegmenter) {
    return Array.from(graphemeSegmenter.segment(str), function (entry) { return entry.segment; });
  }
  return fallbackGraphemes(str);
}

function fallbackGraphemes(str) {
  var result = [], index = 0;
  while (index < str.length) {
    var cp = str.codePointAt(index);
    var cluster = String.fromCodePoint(cp);
    index += cp > 0xFFFF ? 2 : 1;
    while (index < str.length) {
      var nextCp = str.codePointAt(index);
      if (nextCp === 0x200D) {
        cluster += String.fromCodePoint(nextCp);
        index += 1;
        if (index < str.length) {
          nextCp = str.codePointAt(index);
          cluster += String.fromCodePoint(nextCp);
          index += nextCp > 0xFFFF ? 2 : 1;
          continue;
        }
        break;
      }
      // Every variation selector attaches to its base: VS1–VS16 (U+FE00) and
      // the ideographic supplement (U+E0100). Confuse emits IVS sequences, so
      // splitting them here would tear a substituted glyph into two tokens.
      if (nextCp >= 0xFE00 && nextCp <= 0xFE0F) { cluster += String.fromCodePoint(nextCp); index += 1; continue; }
      if (nextCp >= 0xE0100 && nextCp <= 0xE01EF) { cluster += String.fromCodePoint(nextCp); index += 2; continue; }
      if (nextCp >= 0x1F3FB && nextCp <= 0x1F3FF) { cluster += String.fromCodePoint(nextCp); index += nextCp > 0xFFFF ? 2 : 1; continue; }
      break;
    }
    result.push(cluster);
  }
  return result;
}

export {
  toGraphemes,
  fallbackGraphemes
};
