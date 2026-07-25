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
    // Standard (non-emoji) variation selector, VS1. Historically
    // fallbackGraphemes only special-cased the two *emoji* variation
    // selectors (FE0E/FE0F); a base char + VS1 (U+FE00) used to be split
    // into two clusters by the fallback while Intl.Segmenter kept it as
    // one (variation selectors are Grapheme_Extend). That range check has
    // since been widened to the full U+FE00-FE0F block, so this now agrees.
    'non-emoji variation selector (VS1, FE00)': '神' + String.fromCodePoint(0xFE00),
    // Ideographic variation selector (IVS supplement), same reasoning.
    'ideographic variation selector (IVS, U+E0100)': '葛\u{E0100}',
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
