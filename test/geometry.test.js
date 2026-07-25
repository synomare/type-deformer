import { describe, it, expect } from 'vitest';
import {
  quant,
  buildCellOrder,
  lerpHex,
  baselineOffset,
  fitCompositionViewport,
  contentBounds,
  exportLayout
} from '../src/core/geometry.js';

describe('quant', () => {
  it('rounds to the nearest multiple of step', () => {
    expect(quant(12, 5)).toBe(10);
    expect(quant(13, 5)).toBe(15);
    expect(quant(0, 5)).toBe(0);
    expect(quant(-3, 5)).toBe(-5);
  });
});

describe('buildCellOrder', () => {
  it('horizontal: plain row-major sequence 0..cols*rows-1', () => {
    expect(buildCellOrder(3, 2, false)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(buildCellOrder(4, 1, false)).toEqual([0, 1, 2, 3]);
  });

  it('vertical: genkou-youshi order (columns right-to-left, each column top-to-bottom)', () => {
    expect(buildCellOrder(3, 2, true)).toEqual([2, 5, 1, 4, 0, 3]);
  });

  it('vertical with a single row is just columns right-to-left', () => {
    expect(buildCellOrder(4, 1, true)).toEqual([3, 2, 1, 0]);
  });
});

describe('lerpHex', () => {
  it('interpolates midpoint between black and white to mid-gray', () => {
    expect(lerpHex('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
  it('returns the start color at t=0 and end color at t=1', () => {
    expect(lerpHex('#112233', '#445566', 0)).toBe('#112233');
    expect(lerpHex('#112233', '#445566', 1)).toBe('#445566');
  });
  it('clamps t below 0 and above 1', () => {
    expect(lerpHex('#000000', '#ffffff', -5)).toBe('#000000');
    expect(lerpHex('#000000', '#ffffff', 5)).toBe('#ffffff');
  });
});

describe('baselineOffset', () => {
  it('centers ascent+descent leading around the box height', () => {
    expect(baselineOffset({ h: 100 }, { ascent: 80, descent: 20 })).toBe(80);
    expect(baselineOffset({ h: 120 }, { ascent: 80, descent: 20 })).toBe(90);
  });
});

describe('fitCompositionViewport', () => {
  it('scales to fit and centers the source inside the target', () => {
    const result = fitCompositionViewport(200, 100, 100, 100);
    expect(result).toEqual({ w: 100, h: 100, s: 0.5, dx: 0, dy: 25 });
  });

  it('picks the smaller of the two axis scales (letterboxing)', () => {
    const result = fitCompositionViewport(100, 200, 100, 100);
    expect(result.s).toBeCloseTo(0.5, 10);
    expect(result.dx).toBeCloseTo(25, 10);
    expect(result.dy).toBeCloseTo(0, 10);
  });
});

describe('contentBounds', () => {
  const baseGlyph = () => ({
    x: 10, y: 20, w: 30, h: 40,
    ox: 0, oy: 0, tx: 0, ty: 0,
    rot: 0, scaleX: 1, scaleY: 1,
    skewX: 0, skewY: 0,
    misregX: 0, misregY: 0
  });

  it('with no transform, produces a plain padded rectangle', () => {
    const bounds = contentBounds([baseGlyph()], 5);
    expect(bounds.x).toBeCloseTo(5, 10);   // 10 - 5
    expect(bounds.y).toBeCloseTo(15, 10);  // 20 - 5
    expect(bounds.w).toBeCloseTo(40, 10);  // 30 + 2*5
    expect(bounds.h).toBeCloseTo(50, 10);  // 40 + 2*5
  });

  it('empty glyph list falls back to a 100x100 box at the origin', () => {
    const bounds = contentBounds([], 0);
    expect(bounds).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });

  it('rot=90 swaps effective width and height', () => {
    const glyph = {
      x: 0, y: 0, w: 30, h: 40,
      ox: 15, oy: 20, tx: 0, ty: 0, // rotate about the box center
      rot: 90, scaleX: 1, scaleY: 1,
      skewX: 0, skewY: 0,
      misregX: 0, misregY: 0
    };
    const bounds = contentBounds([glyph], 0);
    expect(bounds.w).toBeCloseTo(40, 6); // original h
    expect(bounds.h).toBeCloseTo(30, 6); // original w
  });

  it('misregistration widens the bounds', () => {
    const plain = contentBounds([baseGlyph()], 0);
    const misreg = contentBounds([{ ...baseGlyph(), misregX: 10 }], 0);
    expect(plain.w).toBeCloseTo(30, 6);
    expect(misreg.w).toBeGreaterThan(plain.w);
    // base glyph spans x:[10,40]; extra passes at +misregX and -misregX*0.65
    // push the observed corners out to [10-6.5, 40+10] = [3.5, 50]
    expect(misreg.x).toBeCloseTo(3.5, 6);
    expect(misreg.w).toBeCloseTo(46.5, 6);
  });
});

describe('exportLayout', () => {
  it('auto artboard: bounds moved to the origin at scale 1', () => {
    const bounds = { x: 5, y: 10, w: 100, h: 50 };
    const result = exportLayout(bounds, { artboard: 'auto' });
    expect(result).toEqual({ w: 100, h: 50, s: 1, dx: -5, dy: -10 });
  });

  // SUSPECTED BUG (reported, not fixed — see final report): geometry.js
  // computes the anchor fractions as
  //   var ax = { l: 0, c: 0.5, r: 1 }[layout.anchor.charAt(1)] || 0.5;
  //   var ay = { t: 0, c: 0.5, b: 1 }[layout.anchor.charAt(0)] || 0.5;
  // Because `0 || 0.5` evaluates to 0.5 in JavaScript, any anchor whose
  // top/left component legitimately maps to 0 (i.e. anything containing
  // 't' or 'l', such as 'tl', 'tc', 'cl') silently collapses that axis to
  // 0.5 (center) instead of 0. Only 'c' and 'r'/'b' (which map to 0.5/1,
  // both truthy) behave as documented. The two tests below assert the
  // semantically correct behaviour (a top/left anchor hugs the top/left
  // margin) and are expected to FAIL against the current implementation.
  it('fixed artboard: margin, anchor and fit-to-scale', () => {
    const bounds = { x: 0, y: 0, w: 100, h: 50 };
    const layout = { artboard: 'fixed', abW: 1000, abH: 1000, marginPct: 10, anchor: 'tl', fit: true };
    const result = exportLayout(bounds, layout);
    // m = 100, availW = availH = 800, s = min(800/100, 800/50) = 8
    expect(result.w).toBe(1000);
    expect(result.h).toBe(1000);
    expect(result.s).toBeCloseTo(8, 10);
    expect(result.dx).toBeCloseTo(100, 10); // anchor 'l' -> ax should be 0
    expect(result.dy).toBeCloseTo(100, 10); // anchor 't' -> ay should be 0
  });

  it('anchor affects placement within the remaining space', () => {
    const bounds = { x: 0, y: 0, w: 50, h: 100 };
    const layout = { artboard: 'fixed', abW: 1000, abH: 1000, marginPct: 10, fit: true, anchor: 'cc' };
    // s = min(800/50, 800/100) = 8; bounds.w*s = 400 fills half of availW(800)
    const cc = exportLayout(bounds, layout);
    expect(cc.dx).toBeCloseTo(100 + (800 - 400) * 0.5, 6);

    const br = exportLayout(bounds, { ...layout, anchor: 'br' });
    expect(br.dx).toBeCloseTo(100 + (800 - 400) * 1, 6);

    // Expected: a left anchor (ax=0) hugs the left margin, so dx === m (100).
    const tl = exportLayout(bounds, { ...layout, anchor: 'tl' });
    expect(tl.dx).toBeCloseTo(100, 6);
  });

  it('fit=false always uses scale 1', () => {
    const bounds = { x: 0, y: 0, w: 700, h: 700 };
    const layout = { artboard: 'fixed', abW: 1000, abH: 1000, marginPct: 10, fit: false, anchor: 'cc' };
    const result = exportLayout(bounds, layout);
    expect(result.s).toBe(1);
  });

  it('falls back to a 1080x1080 artboard when abW/abH are missing', () => {
    const bounds = { x: 0, y: 0, w: 10, h: 10 };
    const layout = { artboard: 'fixed', marginPct: 0, fit: false, anchor: 'tl' };
    const result = exportLayout(bounds, layout);
    expect(result.w).toBe(1080);
    expect(result.h).toBe(1080);
  });
});
