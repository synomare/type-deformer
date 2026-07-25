// Script detection for the Confuse operator, and the packed-pair lookup
// its curated tables are stored in.

function confusePairLookup(packed, ch) {
  var out = [];
  for (var i = 0; i < packed.length; i += 2) {
    if (packed[i] === ch) out.push(packed[i + 1]);
    else if (packed[i + 1] === ch) out.push(packed[i]);
  }
  return out;
}

// Script detection is asked the same question thousands of times per
// frame: twice per candidate while building the dictionary, and twice
// per glyph in updateEffectStatus. NFKC plus seven Unicode property
// probes is far too expensive to repeat when the answer depends only on
// the string. Same bounded-cache shape as charInfoCache.
var confuseScriptCache = new Map();

function confuseScript(value) {
  if (!value) return 'common';
  var cached = confuseScriptCache.get(value);
  if (cached !== undefined) return cached;
  var result = computeConfuseScript(value);
  if (confuseScriptCache.size > 20000) confuseScriptCache.clear();
  confuseScriptCache.set(value, result);
  return result;
}

function computeConfuseScript(value) {
  var normalized = value;
  try { normalized = value.normalize('NFKC'); } catch (e) { /* older browser */ }
  var chars = Array.from(normalized);
  for (var i = 0; i < chars.length; i++) {
    var character = chars[i];
    var cp = chars[i].codePointAt(0);
    if (/\p{Script=Latin}/u.test(character)) return 'latin';
    if (/\p{Decimal_Number}/u.test(character)) return cp >= 0x30 && cp <= 0x39 ? 'digit' : 'other-number';
    if (/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(character)) return 'kana';
    if (/\p{Script=Han}/u.test(character)) return 'han';
    if (/\p{Script=Greek}/u.test(character)) return 'greek';
    if (/\p{Script=Cyrillic}/u.test(character)) return 'cyrillic';
    // Unknown letters must not silently pass as Common: that would leak
    // Cherokee, Armenian, historic alphabets, etc. while Mixed is off.
    if (/\p{Alphabetic}/u.test(character)) return 'other';
  }
  return 'common';
}

function confuseHasVariationSelector(value) {
  var chars = Array.from(value || '');
  for (var i = 0; i < chars.length; i++) {
    var cp = chars[i].codePointAt(0);
    if (cp >= 0xFE00 && cp <= 0xFE0F || cp >= 0xE0100 && cp <= 0xE01EF) return true;
  }
  return false;
}

export {
  confusePairLookup,
  confuseScript,
  confuseHasVariationSelector
};
