// Font family sanitising. A stack that does not parse is dropped by CSS
// but silently leaves the previous font in ctx.font, so it must be fixed
// at the input boundary rather than detected later.

function fontLibraryHash(value) {
  var hash = 2166136261;
  for (var i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function safeFontFamily(value) {
  return String(value || '').replace(/["\\\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
}

// A family name may stay unquoted only when it is a plain ASCII CSS
// identifier sequence. Everything else — including bare CJK names — is
// quoted, which is always valid and avoids guessing at ident rules.
var UNQUOTED_FONT_NAME = /^[A-Za-z_][A-Za-z0-9_-]*(?: [A-Za-z_][A-Za-z0-9_-]*)*$/;

// A font stack from a project or share link reaches CSS — where an
// unparseable value is simply dropped — but also ctx.font, where an
// unparseable value silently leaves the *previous* font in place. That
// would have Glyph Guard rating Confuse candidates against the wrong
// typeface and the PNG exporter drawing in it. Sanitise per family and
// quote anything that would not parse bare, so the stack always parses.
// Valid input is preserved verbatim, which keeps the <option> values in
// the font preset list matching after a project load.
function normalizeFontStack(value) {
  var parts = String(value == null ? '' : value).split(',');
  var out = [];
  for (var i = 0; i < parts.length && out.length < 12; i++) {
    var raw = parts[i].trim();
    if (!raw) continue;
    var quoted = raw.length > 1 && /^(".*"|'.*')$/.test(raw);
    var name = safeFontFamily(quoted ? raw.slice(1, -1) : raw);
    if (!name) continue;
    out.push(!quoted && UNQUOTED_FONT_NAME.test(name) ? name : '"' + name + '"');
  }
  return out.join(', ');
}

export {
  fontLibraryHash,
  safeFontFamily,
  normalizeFontStack
};
