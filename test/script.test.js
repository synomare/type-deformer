import { describe, it, expect } from 'vitest';
import { confusePairLookup, confuseScript, confuseHasVariationSelector } from '../src/core/script.js';

describe('confusePairLookup', () => {
  const packed = 'かがきぎ'; // pairs: (か,が) (き,ぎ)

  it('looks up the right-hand member from the left', () => {
    expect(confusePairLookup(packed, 'か')).toEqual(['が']);
    expect(confusePairLookup(packed, 'き')).toEqual(['ぎ']);
  });

  it('looks up the left-hand member from the right (bidirectional)', () => {
    expect(confusePairLookup(packed, 'が')).toEqual(['か']);
    expect(confusePairLookup(packed, 'ぎ')).toEqual(['き']);
  });

  it('returns an empty array for a character not present in the packed string', () => {
    expect(confusePairLookup(packed, 'a')).toEqual([]);
    expect(confusePairLookup('', 'か')).toEqual([]);
  });
});

describe('confuseScript', () => {
  it.each([
    ['A', 'latin'],
    ['あ', 'kana'],
    ['ア', 'kana'],
    ['亜', 'han'],
    ['α', 'greek'],
    ['а', 'cyrillic'], // Cyrillic small letter a, "а"
    ['5', 'digit'],
    ['。', 'common'],
    ['', 'common']
  ])('classifies %j as %j', (input, expected) => {
    expect(confuseScript(input)).toBe(expected);
  });

  it('is memoized: repeated calls with the same input return the same result', () => {
    const first = confuseScript('亜');
    const second = confuseScript('亜');
    expect(second).toBe(first);
    expect(second).toBe('han');
  });

  it('flags non-Latin alphabetic scripts it does not special-case as "other" rather than leaking as common', () => {
    // Armenian letter -- not Latin/digit/kana/han/greek/cyrillic but still Alphabetic
    expect(confuseScript('Ա')).toBe('other');
  });
});

describe('confuseHasVariationSelector', () => {
  it('detects standard variation selectors (U+FE00-FE0F)', () => {
    expect(confuseHasVariationSelector('神' + String.fromCodePoint(0xFE00))).toBe(true); // VS1
    expect(confuseHasVariationSelector('神' + String.fromCodePoint(0xFE0F))).toBe(true); // VS16 (emoji presentation)
  });

  it('detects ideographic variation selectors (U+E0100-E01EF)', () => {
    expect(confuseHasVariationSelector('葛\u{E0100}')).toBe(true);
    expect(confuseHasVariationSelector('葛\u{E01EF}')).toBe(true);
  });

  it('returns false for ordinary characters', () => {
    expect(confuseHasVariationSelector('神')).toBe(false);
    expect(confuseHasVariationSelector('abc')).toBe(false);
  });

  it('returns false for empty/falsy input', () => {
    expect(confuseHasVariationSelector('')).toBe(false);
    expect(confuseHasVariationSelector(undefined)).toBe(false);
  });
});
