// Character classification: script class, punctuation, vertical uprightness,
// joining behaviour, and the batch-profile key derived from them.

// Unicode property based classification (full Unicode coverage);
// falls back to the original range checks on old engines.
var uni = (function () {
  try {
    return {
      punct: new RegExp('\\p{P}', 'u'),
      hira: new RegExp('\\p{sc=Hiragana}', 'u'),
      kata: new RegExp('\\p{sc=Katakana}', 'u'),
      han: new RegExp('[\\p{sc=Han}\\p{sc=Hangul}]', 'u'),
      latin: new RegExp('[\\p{sc=Latin}0-9]', 'u'),
      // approximation of UAX#50: what stays upright in vertical flow
      upright: new RegExp('[\\p{sc=Han}\\p{sc=Hiragana}\\p{sc=Katakana}\\p{sc=Hangul}\\p{sc=Bopomofo}\\p{sc=Yi}\\uFF01-\\uFF60\\uFFE0-\\uFFE6\\u3000-\\u303F\\u3190-\\u319F\\u3200-\\u32FF\\u3300-\\u33FF\\u2460-\\u24FF\\u3040-\\u30FF\\uFE30-\\uFE4F]|\\p{Extended_Pictographic}', 'u'),
      rtl: new RegExp('[\\p{sc=Arabic}\\p{sc=Hebrew}\\p{sc=Syriac}\\p{sc=Thaana}\\p{sc=Nko}]', 'u'),
      // scripts whose letters connect / reshape across characters —
      // kept together per word so shaping survives the span split
      joining: new RegExp('[\\p{sc=Arabic}\\p{sc=Syriac}\\p{sc=Mongolian}\\p{sc=Nko}\\p{sc=Devanagari}\\p{sc=Bengali}\\p{sc=Gurmukhi}\\p{sc=Gujarati}\\p{sc=Oriya}\\p{sc=Tamil}\\p{sc=Telugu}\\p{sc=Kannada}\\p{sc=Malayalam}\\p{sc=Sinhala}\\p{sc=Myanmar}\\p{sc=Khmer}\\p{sc=Lao}\\p{sc=Thai}\\p{sc=Tibetan}]', 'u')
    };
  } catch (e) { return null; }
})();

function classify(ch, cp) {
  if (uni) {
    if (uni.hira.test(ch)) return 'hira';
    if (uni.kata.test(ch)) return 'kata';
    if (uni.han.test(ch)) return 'kanji';
    if (uni.latin.test(ch)) return 'latin';
    return 'other';
  }
  if ((cp >= 0x0041 && cp <= 0x024F) || (cp >= 0x0030 && cp <= 0x0039)) return 'latin';
  if (cp >= 0x3040 && cp <= 0x309F) return 'hira';
  if (cp >= 0x30A0 && cp <= 0x30FF) return 'kata';
  if (cp >= 0x4E00 && cp <= 0x9FFF) return 'kanji';
  return 'other';
}

var punctStr = '、。，．！？・：；（）［］｛｝「」『』—…‥,.!?;:(){}[]—–…‥';

function isPunctCluster(ch) {
  return uni ? uni.punct.test(ch) : punctStr.indexOf(ch) !== -1;
}

// Per-token classification cache — texts repeat characters heavily,
// so this removes almost all regex work from rebuilds of large texts.
var charInfoCache = new Map();

function charInfo(ch, cp) {
  var c = charInfoCache.get(ch);
  if (!c) {
    if (charInfoCache.size > 20000) charInfoCache.clear();
    var cls = classify(ch, cp);
    c = {
      cls: cls,
      punct: isPunctCluster(ch),
      upright: uni ? uni.upright.test(ch) : cls !== 'latin',
      joins: !!(uni && uni.joining.test(ch)),
      rtl: !!(uni && uni.rtl.test(ch))
    };
    charInfoCache.set(ch, c);
  }
  return c;
}

var digitRe = (function () {
  try { return new RegExp('\\p{Nd}', 'u'); } catch (e) { return /[0-9０-９]/; }
})();

function batchKeyFor(ch, cp, info) {
  info = info || charInfo(ch, cp);
  if (info.punct) return 'punct';
  if (digitRe.test(ch)) return 'digit';
  if (info.cls === 'kanji' || info.cls === 'hira' || info.cls === 'kata' || info.cls === 'latin') return info.cls;
  return '';
}

export {
  uni,
  classify,
  isPunctCluster,
  charInfo,
  batchKeyFor
};
