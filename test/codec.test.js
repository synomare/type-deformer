import { describe, it, expect } from 'vitest';
import { bytesToB64url, b64urlToBytes, escXml, escXmlAttr } from '../src/core/codec.js';

function roundTrip(bytes) {
  const encoded = bytesToB64url(bytes);
  const decoded = b64urlToBytes(encoded);
  return { encoded, decoded };
}

describe('bytesToB64url / b64urlToBytes round trip', () => {
  it('round trips an empty byte array', () => {
    const { decoded } = roundTrip(new Uint8Array(0));
    expect(Array.from(decoded)).toEqual([]);
  });

  it('round trips a single byte', () => {
    const { decoded } = roundTrip(new Uint8Array([65]));
    expect(Array.from(decoded)).toEqual([65]);
  });

  it('round trips all 256 possible byte values', () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    const { decoded } = roundTrip(bytes);
    expect(Array.from(decoded)).toEqual(Array.from(bytes));
  });

  it('round trips a large array that crosses the 0x8000 chunking boundary', () => {
    const size = 0x8000 * 2 + 137; // guarantees multiple chunk-loop iterations
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) bytes[i] = i % 256;
    const { decoded } = roundTrip(bytes);
    expect(decoded.length).toBe(size);
    expect(Array.from(decoded)).toEqual(Array.from(bytes));
  });

  it('produces a base64url string with no "+", "/" or "=" characters', () => {
    const bytes = new Uint8Array(300);
    for (let i = 0; i < 300; i++) bytes[i] = (i * 37 + 5) % 256; // varied byte values
    const { encoded } = roundTrip(bytes);
    expect(encoded).not.toMatch(/[+/=]/);
  });
});

describe('escXml', () => {
  it('escapes &, < and >', () => {
    expect(escXml('&')).toBe('&amp;');
    expect(escXml('<')).toBe('&lt;');
    expect(escXml('>')).toBe('&gt;');
    expect(escXml('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
  });

  it('processes "&" first, so it does not double-escape its own output', () => {
    // The literal text "&lt;" (not an actual '<' character) must become
    // "&amp;lt;" -- i.e. only the leading & is escaped, since by the time
    // the '<'/'>' replacements would run there is no real '<' character
    // left in the string to match.
    expect(escXml('&lt;')).toBe('&amp;lt;');
  });
});

describe('escXmlAttr', () => {
  it('escapes &, <, >, " and \'', () => {
    expect(escXmlAttr('a & b < c > d " e \' f')).toBe('a &amp; b &lt; c &gt; d &quot; e &apos; f');
  });

  it('builds on escXml (ampersand-first) before escaping quotes', () => {
    expect(escXmlAttr('&"')).toBe('&amp;&quot;');
  });

  it('coerces non-string input via String()', () => {
    expect(escXmlAttr(42)).toBe('42');
  });
});
