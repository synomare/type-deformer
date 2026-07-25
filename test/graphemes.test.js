import { describe, it, expect } from 'vitest';
import { toGraphemes, fallbackGraphemes } from '../src/core/graphemes.js';

describe('graphemes: toGraphemes (Intl.Segmenter) vs fallbackGraphemes agree', () => {
  const agreeing = {
    'empty string': '',
    'plain BMP string': 'abc123',
    'BMP Japanese string': 'こんにちは',
    'surrogate pair kanji (koto)': '𠮷野家',
    'surrogate pair kanji (fugu)': '𩸽',
    'emoji + emoji-presentation variation selector (VS16, FE0F)': '神' + String.fromCodePoint(0xFE0F),
    'emoji with skin tone modifier': '\u{1F44D}\u{1F3FD}', // 👍🏽
    'ZWJ family emoji (3 members)': '\u{1F468}‍\u{1F469}‍\u{1F467}', // 👨‍👩‍👧
    'ZWJ family emoji (4 members)': '\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}'
  };

  for (const [name, input] of Object.entries(agreeing)) {
    it(`matches for: ${name}`, () => {
      expect(fallbackGraphemes(input)).toEqual(toGraphemes(input));
    });
  }

  it('both return an empty array for the empty string', () => {
    expect(toGraphemes('')).toEqual([]);
    expect(fallbackGraphemes('')).toEqual([]);
  });
});

describe('graphemes: known Intl.Segmenter vs fallbackGraphemes discrepancy (non-emoji variation selectors)', () => {
  // fallbackGraphemes only special-cases the two *emoji* variation selectors
  // (U+FE0E, U+FE0F). Intl.Segmenter (the real Unicode grapheme-cluster
  // algorithm) also merges the full standard variation-selector block
  // (U+FE00-FE0F) and the ideographic variation-selector supplement
  // (U+E0100-E01EF, IVS) into the preceding base character, because all
  // variation selectors are Grapheme_Extend. fallbackGraphemes does not
  // know about that, so for a base character followed by e.g. VS1 (U+FE00)
  // or an IVS selector, the two splitters disagree: Intl.Segmenter keeps
  // one cluster, the hand-rolled fallback splits it into two.
  //
  // This is being asserted (not softened) per the task instructions: this
  // is suspected to be a real bug in fallbackGraphemes (see the final
  // report to the requester) rather than an acceptable divergence, since
  // confuseHasVariationSelector() elsewhere in the codebase treats exactly
  // this same U+FE00-FE0F / U+E0100-E01EF range as "a variation selector",
  // while fallbackGraphemes only recognises two code points out of that
  // range.
  it('VS1 (U+FE00, a non-emoji standard variation selector) after a kanji base', () => {
    const input = '神' + String.fromCodePoint(0xFE00); // 神 + VS1 (explicit code point -- do not retype the raw glyph, it is easy to mistake for VS16/FE0F)
    expect(fallbackGraphemes(input)).toEqual(toGraphemes(input));
  });

  it('IVS (U+E0100, ideographic variation selector) after a kanji base', () => {
    const input = '葛\u{E0100}'; // 葛 + IVS selector 1
    expect(fallbackGraphemes(input)).toEqual(toGraphemes(input));
  });
});
