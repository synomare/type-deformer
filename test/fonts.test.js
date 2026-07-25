import { describe, it, expect } from 'vitest';
import { fontLibraryHash, safeFontFamily, normalizeFontStack } from '../src/core/fonts.js';

describe('fontLibraryHash', () => {
  it('is deterministic for the same input', () => {
    expect(fontLibraryHash('Noto Sans JP')).toBe(fontLibraryHash('Noto Sans JP'));
  });

  it('differs for different input (sanity, not a collision guarantee)', () => {
    expect(fontLibraryHash('Noto Sans JP')).not.toBe(fontLibraryHash('Noto Serif JP'));
    expect(fontLibraryHash('')).not.toBe(fontLibraryHash('a'));
  });
});

describe('safeFontFamily', () => {
  it('strips double quotes and backslashes, replacing them with a space', () => {
    expect(safeFontFamily('My"Font\\Name')).toBe('My Font Name');
  });

  it('strips ASCII control characters', () => {
    var soh = String.fromCharCode(1);
    var unitSep = String.fromCharCode(31);
    var withControlChars = 'Ctrl' + soh + 'Char' + unitSep + 'Name';
    expect(safeFontFamily(withControlChars)).toBe('Ctrl Char Name');
  });

  it('collapses runs of whitespace and trims', () => {
    expect(safeFontFamily('  Zen   Old    Mincho  ')).toBe('Zen Old Mincho');
  });

  it('returns "" for empty or whitespace-only input', () => {
    expect(safeFontFamily('')).toBe('');
    expect(safeFontFamily('   ')).toBe('');
    expect(safeFontFamily(null)).toBe('');
    expect(safeFontFamily(undefined)).toBe('');
  });

  it('truncates to 160 characters', () => {
    const long = 'A'.repeat(200);
    expect(safeFontFamily(long).length).toBe(160);
  });
});

describe('normalizeFontStack: byte-exact preservation of the index.html font presets', () => {
  // These five strings are the literal <option value> font-stack presets
  // used by index.html. A project load re-derives the active preset by
  // comparing the loaded font stack against these strings, so
  // normalizeFontStack MUST return them completely unchanged, byte for
  // byte, or preset detection silently breaks after a round trip.
  const presets = [
    '"Zen Old Mincho", "Hiragino Mincho ProN", serif',
    '"Noto Sans JP", "Hiragino Sans", sans-serif',
    '"Zen Kaku Gothic New", "Hiragino Sans", sans-serif',
    '"EB Garamond", "Times New Roman", serif',
    '"Space Mono", Menlo, monospace'
  ];

  for (const preset of presets) {
    it(`preserves verbatim: ${preset}`, () => {
      expect(normalizeFontStack(preset)).toBe(preset);
    });
  }
});

describe('normalizeFontStack: sanitisation', () => {
  it('neutralises a CSS-injection attempt into a single quoted, inert family name', () => {
    const malicious = 'x; background:url(evil)';
    const result = normalizeFontStack(malicious);
    expect(result.startsWith('"')).toBe(true);
    expect(result.endsWith('"')).toBe(true);
    // exactly one family in the stack, fully quoted
    expect(result).toBe('"' + malicious + '"');
  });

  it('strips quotes/backslashes from a hostile family name and always yields balanced quoting', () => {
    const result = normalizeFontStack('My"Font\\Name');
    expect(result).not.toMatch(/\\/);
    const quoteCount = (result.match(/"/g) || []).length;
    expect(quoteCount % 2).toBe(0);
  });

  it('drops empty entries and stray whitespace-only segments', () => {
    expect(normalizeFontStack('Arial, , sans-serif')).toBe('Arial, sans-serif');
  });

  it('returns "" for empty/whitespace-only/null/undefined input', () => {
    expect(normalizeFontStack('')).toBe('');
    expect(normalizeFontStack('   ')).toBe('');
    expect(normalizeFontStack(null)).toBe('');
    expect(normalizeFontStack(undefined)).toBe('');
  });

  it('caps the output at 12 families', () => {
    const many = Array.from({ length: 15 }, (_, i) => 'Font' + i).join(', ');
    const result = normalizeFontStack(many);
    expect(result.split(', ').length).toBe(12);
    expect(result.split(', ')).toEqual(
      Array.from({ length: 12 }, (_, i) => 'Font' + i)
    );
  });

  it('quotes a bare CJK family name (not a plain ASCII identifier)', () => {
    expect(normalizeFontStack('游明朝')).toBe('"游明朝"');
  });

  it('leaves a plain ASCII identifier sequence unquoted', () => {
    expect(normalizeFontStack('Helvetica Neue')).toBe('Helvetica Neue');
  });
});
