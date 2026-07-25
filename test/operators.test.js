import { describe, it, expect } from 'vitest';
import {
  STRENGTH_MODES,
  EVALUATION_LAYERS,
  OPERATOR_DEFS,
  OPERATOR_IDS,
  OPERATOR_BY_SHORT,
  clampFinite,
  cloneManualValue,
  normalizeOperatorManual,
  encodeOperatorStates,
  decodeOperatorStates
} from '../src/core/operators.js';

describe('STRENGTH_MODES / EVALUATION_LAYERS', () => {
  it('exposes the four strength contracts', () => {
    expect(Object.values(STRENGTH_MODES).sort()).toEqual(
      ['continuous', 'stepped', 'stochastic', 'structural'].sort()
    );
  });

  it('every operator def references a valid strength mode and layer', () => {
    const validModes = new Set(Object.values(STRENGTH_MODES));
    const validLayers = new Set(Object.keys(EVALUATION_LAYERS));
    for (const id of Object.keys(OPERATOR_DEFS)) {
      const def = OPERATOR_DEFS[id];
      expect(validModes.has(def.strengthMode)).toBe(true);
      expect(validLayers.has(def.layer)).toBe(true);
      expect(def.layerOrder).toBe(EVALUATION_LAYERS[def.layer]);
    }
  });
});

describe('OPERATOR_IDS ordering', () => {
  it('is sorted by layerOrder then by order', () => {
    expect(OPERATOR_IDS).toEqual([
      'confuse', 'stretch', 'rotate', 'skew', 'baselineShift', 'mirror', 'misregistration'
    ]);
    // sanity re-derivation directly from the defs, independent of the
    // hard-coded array above
    const rederived = [...OPERATOR_IDS].sort((a, b) =>
      OPERATOR_DEFS[a].layerOrder - OPERATOR_DEFS[b].layerOrder ||
      OPERATOR_DEFS[a].order - OPERATOR_DEFS[b].order
    );
    expect(OPERATOR_IDS).toEqual(rederived);
  });
});

describe('OPERATOR_BY_SHORT', () => {
  it('is a 1:1 mapping with OPERATOR_DEFS[id].short', () => {
    expect(Object.keys(OPERATOR_BY_SHORT).length).toBe(OPERATOR_IDS.length);
    for (const id of OPERATOR_IDS) {
      const short = OPERATOR_DEFS[id].short;
      expect(OPERATOR_BY_SHORT[short]).toBe(id);
    }
  });
});

describe('clampFinite', () => {
  it('passes through a value already inside range', () => {
    expect(clampFinite(5, 0, 10, 99)).toBe(5);
  });
  it('clamps a value above max', () => {
    expect(clampFinite(15, 0, 10, 99)).toBe(10);
  });
  it('clamps a value below min', () => {
    expect(clampFinite(-15, 0, 10, 99)).toBe(0);
  });
  it('uses the fallback for non-finite input (NaN, Infinity, undefined)', () => {
    expect(clampFinite(NaN, -5, 5, 2)).toBe(2);
    expect(clampFinite(undefined, -5, 5, 2)).toBe(2);
    expect(clampFinite(Infinity, -5, 5, 2)).toBe(2);
  });
  it('coerces strings via Number()', () => {
    expect(clampFinite('7', 0, 10, 0)).toBe(7);
  });
  // NOTE: not a bug report, just documenting real behaviour -- the
  // fallback itself is passed through the same min/max clamp, so an
  // out-of-range fallback is silently clamped too.
  it('also clamps the fallback value itself when it is out of range', () => {
    expect(clampFinite(NaN, 0, 10, 99)).toBe(10);
  });
});

describe('cloneManualValue', () => {
  it('returns null for null/undefined', () => {
    expect(cloneManualValue(null)).toBeNull();
    expect(cloneManualValue(undefined)).toBeNull();
  });
  it('coerces a scalar to a number, defaulting to 0', () => {
    expect(cloneManualValue(5)).toBe(5);
    expect(cloneManualValue('3')).toBe(3);
    expect(cloneManualValue(NaN)).toBe(0);
  });
  it('clones a pair object rather than returning the same reference', () => {
    const original = { x: 2, y: 3 };
    const clone = cloneManualValue(original);
    expect(clone).toEqual({ x: 2, y: 3 });
    expect(clone).not.toBe(original);
    clone.x = 999;
    expect(original.x).toBe(2);
  });
  it('defaults missing/invalid pair fields to 0', () => {
    expect(cloneManualValue({})).toEqual({ x: 0, y: 0 });
    expect(cloneManualValue({ x: 'nope', y: undefined })).toEqual({ x: 0, y: 0 });
  });
});

describe('normalizeOperatorManual', () => {
  it('clamps confuse to 0..1', () => {
    expect(normalizeOperatorManual('confuse', 2)).toBe(1);
    expect(normalizeOperatorManual('confuse', -1)).toBe(0);
    expect(normalizeOperatorManual('confuse', 0.4)).toBe(0.4);
  });

  it('clamps rotate to +/-360', () => {
    expect(normalizeOperatorManual('rotate', 400)).toBe(360);
    expect(normalizeOperatorManual('rotate', -400)).toBe(-360);
  });

  it('clamps baselineShift to +/-5', () => {
    expect(normalizeOperatorManual('baselineShift', 10)).toBe(5);
    expect(normalizeOperatorManual('baselineShift', -10)).toBe(-5);
  });

  it('clamps skew pair to +/-85 on each axis', () => {
    expect(normalizeOperatorManual('skew', { x: 100, y: -100 })).toEqual({ x: 85, y: -85 });
  });

  it('clamps mirror pair to +/-1 on each axis', () => {
    expect(normalizeOperatorManual('mirror', { x: 3, y: -3 })).toEqual({ x: 1, y: -1 });
  });

  it('clamps misregistration pair to +/-120 on each axis', () => {
    expect(normalizeOperatorManual('misregistration', { x: 200, y: -200 })).toEqual({ x: 120, y: -120 });
  });

  it('falls back to 0 for scalar operators given NaN/undefined', () => {
    expect(normalizeOperatorManual('rotate', NaN)).toBe(0);
    expect(normalizeOperatorManual('rotate', undefined)).toBe(0);
    expect(normalizeOperatorManual('confuse', undefined)).toBe(0);
    expect(normalizeOperatorManual('baselineShift', NaN)).toBe(0);
  });

  it('falls back to 0 for skew/misregistration pair axes given a missing object', () => {
    expect(normalizeOperatorManual('skew', undefined)).toEqual({ x: 0, y: 0 });
    expect(normalizeOperatorManual('misregistration', undefined)).toEqual({ x: 0, y: 0 });
  });

  it('falls back to 1 for mirror pair axes given a missing object (mirror default is "unflipped")', () => {
    expect(normalizeOperatorManual('mirror', undefined)).toEqual({ x: 1, y: 1 });
    expect(normalizeOperatorManual('mirror', {})).toEqual({ x: 1, y: 1 });
  });

  it('returns null for stretch and any other unrecognised id', () => {
    expect(normalizeOperatorManual('stretch', 5)).toBeNull();
    expect(normalizeOperatorManual('nonexistent', 5)).toBeNull();
  });
});

describe('encodeOperatorStates / decodeOperatorStates round trip', () => {
  // encodeOperatorStates and decodeOperatorStates are deliberately
  // asymmetric in field naming: encode consumes {toggled, current, manual}
  // keyed by operator id, decode produces {t, i, m} keyed by operator id.
  // "Round trip" here means: encode a states map, decode the resulting
  // string, and check that decoded.t/i/m reconstruct the original
  // toggled/current/manual (current is quantized to 1/1000, so up to
  // 0.001 of drift is expected and acceptable).

  it('round trips a scalar manual value (rotate)', () => {
    const states = { rotate: { toggled: true, current: 0.5, manual: 45 } };
    const encoded = encodeOperatorStates(states);
    const decoded = decodeOperatorStates(encoded);
    expect(decoded.rotate.t).toBe(1);
    expect(decoded.rotate.i).toBeCloseTo(0.5, 3);
    expect(decoded.rotate.m).toBeCloseTo(45, 3);
  });

  it('round trips a scalar manual value (baselineShift), toggled off', () => {
    const states = { baselineShift: { toggled: false, current: 0.125, manual: -2.5 } };
    const encoded = encodeOperatorStates(states);
    const decoded = decodeOperatorStates(encoded);
    expect(decoded.baselineShift.t).toBe(0);
    expect(decoded.baselineShift.i).toBeCloseTo(0.125, 3);
    expect(decoded.baselineShift.m).toBeCloseTo(-2.5, 3);
  });

  it('round trips a scalar manual value (confuse)', () => {
    const states = { confuse: { toggled: true, current: 1, manual: 0.75 } };
    const encoded = encodeOperatorStates(states);
    const decoded = decodeOperatorStates(encoded);
    expect(decoded.confuse.t).toBe(1);
    expect(decoded.confuse.i).toBeCloseTo(1, 3);
    expect(decoded.confuse.m).toBeCloseTo(0.75, 3);
  });

  it('round trips a pair manual value (skew)', () => {
    const states = { skew: { toggled: false, current: 0.25, manual: { x: 10, y: -20 } } };
    const encoded = encodeOperatorStates(states);
    const decoded = decodeOperatorStates(encoded);
    expect(decoded.skew.t).toBe(0);
    expect(decoded.skew.i).toBeCloseTo(0.25, 3);
    expect(decoded.skew.m.x).toBeCloseTo(10, 3);
    expect(decoded.skew.m.y).toBeCloseTo(-20, 3);
  });

  it('round trips a pair manual value (mirror)', () => {
    const states = { mirror: { toggled: true, current: 0.9, manual: { x: -1, y: 1 } } };
    const encoded = encodeOperatorStates(states);
    const decoded = decodeOperatorStates(encoded);
    expect(decoded.mirror.t).toBe(1);
    expect(decoded.mirror.i).toBeCloseTo(0.9, 3);
    expect(decoded.mirror.m.x).toBeCloseTo(-1, 3);
    expect(decoded.mirror.m.y).toBeCloseTo(1, 3);
  });

  it('round trips a pair manual value (misregistration) with a fractional current', () => {
    const states = { misregistration: { toggled: true, current: 0.3333, manual: { x: 60.4, y: -119.9 } } };
    const encoded = encodeOperatorStates(states);
    const decoded = decodeOperatorStates(encoded);
    expect(decoded.misregistration.t).toBe(1);
    // current is quantized to 1/1000, so drift below 0.001 is acceptable
    expect(Math.abs(decoded.misregistration.i - 0.3333)).toBeLessThan(0.001);
    expect(decoded.misregistration.m.x).toBeCloseTo(60.4, 2);
    expect(decoded.misregistration.m.y).toBeCloseTo(-119.9, 2);
  });

  it('"stretch" is always skipped by both encode and decode', () => {
    const states = {
      stretch: { toggled: true, current: 1, manual: 5 },
      rotate: { toggled: true, current: 0.1, manual: 3 }
    };
    const encoded = encodeOperatorStates(states);
    // stretch's short id is 's' -- it must never appear as a row
    expect(encoded.split('~').some(row => row.startsWith('s:'))).toBe(false);

    const decoded = decodeOperatorStates(encoded);
    expect(decoded.stretch).toBeUndefined();
    expect(decoded.rotate).toBeDefined();

    // even a hand-crafted string using stretch's short is ignored on decode
    const manualEncoded = decodeOperatorStates('s:1:500:5000');
    expect(manualEncoded).toEqual({});
  });

  it('encodes an empty state map to an empty string, and decodes back to an empty map', () => {
    expect(encodeOperatorStates({})).toBe('');
    expect(decodeOperatorStates('')).toEqual({});
  });

  it('skips operators with no toggled/current/manual (all defaulted/untouched)', () => {
    const encoded = encodeOperatorStates({ rotate: { toggled: false, current: 0, manual: null } });
    expect(encoded).toBe('');
  });

  it('decode tolerates falsy/malformed input without throwing', () => {
    expect(decodeOperatorStates(undefined)).toEqual({});
    expect(decodeOperatorStates(null)).toEqual({});
    expect(decodeOperatorStates(0)).toEqual({});
    expect(() => decodeOperatorStates('garbage:::::')).not.toThrow();
    expect(() => decodeOperatorStates('r')).not.toThrow();
    expect(decodeOperatorStates('r')).toEqual({ rotate: { t: 0, i: 0 } });
  });

  it('decode ignores rows with an unknown operator short code', () => {
    expect(decodeOperatorStates('z:1:500:100')).toEqual({});
  });

  it('decode clamps the strength field to 0..1 even if out of range in the string', () => {
    const decoded = decodeOperatorStates('r:1:5000:0'); // current field = 5000/1000 = 5, clamps to 1
    expect(decoded.rotate.i).toBe(1);
  });
});
