import { describe, it, expect, vi } from 'vitest';
import { uni, classify, isPunctCluster, charInfo, batchKeyFor } from '../src/core/classify.js';

describe('uni (Unicode-property regex bundle)', () => {
  it('is non-null in this (modern Node) environment', () => {
    expect(uni).not.toBeNull();
    expect(typeof uni).toBe('object');
  });
});

describe('classify', () => {
  it('classifies kanji as "kanji"', () => {
    expect(classify('亜', '亜'.codePointAt(0))).toBe('kanji');
  });
  it('classifies hiragana as "hira"', () => {
    expect(classify('あ', 'あ'.codePointAt(0))).toBe('hira');
  });
  it('classifies katakana as "kata"', () => {
    expect(classify('ア', 'ア'.codePointAt(0))).toBe('kata');
  });
  it('classifies latin letters and digits as "latin"', () => {
    expect(classify('A', 'A'.codePointAt(0))).toBe('latin');
    expect(classify('5', '5'.codePointAt(0))).toBe('latin');
  });
  it('classifies everything else as "other"', () => {
    expect(classify('ا', 'ا'.codePointAt(0))).toBe('other'); // Arabic letter
    expect(classify('。', '。'.codePointAt(0))).toBe('other');
  });
});

describe('classify: fallback to code-point ranges when uni construction fails', () => {
  // Simulate an engine where the \p{...} unicode-property regexes used to
  // build `uni` are unsupported, by making `new RegExp(...)` throw for the
  // duration of a fresh import of the module. classify.js's IIFE catches
  // that and leaves `uni` as null, at which point classify() must fall
  // back to plain code-point range checks.
  it('produces the same classification results via range checks as via uni', async () => {
    const OriginalRegExp = globalThis.RegExp;
    class ThrowingRegExp {
      constructor() { throw new Error('forced failure: no unicode property escapes'); }
    }
    globalThis.RegExp = ThrowingRegExp;
    let fallbackMod;
    try {
      vi.resetModules();
      fallbackMod = await import('../src/core/classify.js?fallback-probe');
    } finally {
      globalThis.RegExp = OriginalRegExp;
    }

    expect(fallbackMod.uni).toBeNull();

    const cases = [
      ['A', 'latin'],
      ['z', 'latin'],
      ['5', 'latin'],
      ['あ', 'hira'],
      ['ア', 'kata'],
      ['亜', 'kanji'],
      ['!', 'other'],
      ['ا', 'other']
    ];
    for (const [ch, expected] of cases) {
      expect(fallbackMod.classify(ch, ch.codePointAt(0))).toBe(expected);
    }
  });
});

describe('isPunctCluster', () => {
  it('recognises common punctuation', () => {
    expect(isPunctCluster('、')).toBe(true);
    expect(isPunctCluster('。')).toBe(true);
    expect(isPunctCluster(',')).toBe(true);
  });
  it('rejects ordinary letters', () => {
    expect(isPunctCluster('A')).toBe(false);
    expect(isPunctCluster('亜')).toBe(false);
  });
});

describe('charInfo', () => {
  it('marks kanji as upright, non-joining, non-rtl', () => {
    const info = charInfo('亜', '亜'.codePointAt(0));
    expect(info.cls).toBe('kanji');
    expect(info.upright).toBe(true);
    expect(info.joins).toBe(false);
    expect(info.rtl).toBe(false);
  });

  it('marks latin letters as not upright', () => {
    const info = charInfo('A', 'A'.codePointAt(0));
    expect(info.cls).toBe('latin');
    expect(info.upright).toBe(false);
  });

  it('marks Arabic letters as joining and rtl', () => {
    const info = charInfo('ب', 'ب'.codePointAt(0)); // Arabic letter beh
    expect(info.joins).toBe(true);
    expect(info.rtl).toBe(true);
  });

  it('marks Hebrew letters as rtl but not joining', () => {
    const info = charInfo('א', 'א'.codePointAt(0)); // Hebrew alef
    expect(info.rtl).toBe(true);
    expect(info.joins).toBe(false);
  });

  it('flags punctuation via .punct', () => {
    expect(charInfo('、', '、'.codePointAt(0)).punct).toBe(true);
    expect(charInfo('A', 'A'.codePointAt(0)).punct).toBe(false);
  });
});

describe('batchKeyFor', () => {
  it('returns "digit" for decimal digits', () => {
    expect(batchKeyFor('5', '5'.codePointAt(0))).toBe('digit');
  });
  it('returns "punct" for punctuation, even before script keys', () => {
    expect(batchKeyFor('、', '、'.codePointAt(0))).toBe('punct');
  });
  it('returns the script class for kanji/hira/kata/latin', () => {
    expect(batchKeyFor('亜', '亜'.codePointAt(0))).toBe('kanji');
    expect(batchKeyFor('あ', 'あ'.codePointAt(0))).toBe('hira');
    expect(batchKeyFor('ア', 'ア'.codePointAt(0))).toBe('kata');
    expect(batchKeyFor('A', 'A'.codePointAt(0))).toBe('latin');
  });
  it('returns "" for characters outside all recognised classes', () => {
    expect(batchKeyFor('ا', 'ا'.codePointAt(0))).toBe('');
  });
  it('accepts a precomputed charInfo object to skip reclassification', () => {
    const info = charInfo('A', 'A'.codePointAt(0));
    expect(batchKeyFor('A', 'A'.codePointAt(0), info)).toBe('latin');
  });
});
