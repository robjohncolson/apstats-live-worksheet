// pc-curve.test.js - the class scale for a unit's Progress Check (PC_CURVE_SPEC.md §1.2).
// The blended unit PC % is curved piecewise-linearly through frozen teacher knots;
// below the first knot the first segment extends down, above the last knot the last
// segment extends up, and the result is clamped to [0, 100]. A unit without knots
// is uncurved.
// NO network, NO server, NO I/O.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { PC_CURVE, pcCurvePct } from '../grade-config.js';

describe('PC_CURVE - Unit 1 knots are frozen numbers', () => {
  it('Unit 1: 58.8 -> 70, 79.5 -> 90, 92.6 -> 99', () => {
    expect(PC_CURVE[1]).toEqual([[58.8, 70], [79.5, 90], [92.6, 99]]);
  });
});

describe('pcCurvePct - Unit 1 worked values', () => {
  it('lands exactly on the knots', () => {
    expect(pcCurvePct(1, 92.6)).toBeCloseTo(99, 6);
    expect(pcCurvePct(1, 79.5)).toBeCloseTo(90, 6);
    expect(pcCurvePct(1, 58.8)).toBeCloseTo(70, 6);
  });

  it('interpolates between knots', () => {
    expect(pcCurvePct(1, 84.9)).toBeCloseTo(93.7, 1);
    expect(pcCurvePct(1, 68.8)).toBeCloseTo(79.7, 1);
  });

  it('extends the first segment below the lowest knot (no floor)', () => {
    expect(pcCurvePct(1, 52.3)).toBeCloseTo(63.7, 1);
    expect(pcCurvePct(1, 51.4)).toBeCloseTo(62.9, 1);
  });

  it('extends the last segment above the top knot, clamped to 100', () => {
    // unclamped: 99 + (100 - 92.6) * 9 / 13.1 = 104.1
    expect(pcCurvePct(1, 100)).toBe(100);
  });

  it('a raw 0 stays 0: no PC work earns no place on the class scale', () => {
    expect(pcCurvePct(1, 0)).toBe(0);
    expect(pcCurvePct(1, -5)).toBe(0);
    // just above zero the first segment still applies: 70 - (58.8 - 1) * 20 / 20.7 = 14.2
    expect(pcCurvePct(1, 1)).toBeCloseTo(14.2, 1);
  });

  it('accepts the unit as a number only (grade.js passes unitNumber(uKey))', () => {
    expect(pcCurvePct(1, 79.5)).toBeCloseTo(90, 6);
  });
});

describe('pcCurvePct - edges', () => {
  it('null and non-finite stay null', () => {
    expect(pcCurvePct(1, null)).toBe(null);
    expect(pcCurvePct(1, undefined)).toBe(null);
    expect(pcCurvePct(1, NaN)).toBe(null);
    expect(pcCurvePct(1, Infinity)).toBe(null);
  });

  it('a unit without knots is unchanged', () => {
    expect(pcCurvePct(2, 55)).toBe(55);
    expect(pcCurvePct(9, 0)).toBe(0);
    expect(pcCurvePct(null, 42.5)).toBe(42.5);
  });

  it('fewer than 2 knots is unchanged', () => {
    expect(pcCurvePct(3, 40, { 3: [[50, 80]] })).toBe(40);
    expect(pcCurvePct(3, 40, { 3: [] })).toBe(40);
  });

  it('a two-knot curve extrapolates both ends and clamps at 0 and 100', () => {
    const curves = { 5: [[80, 90], [40, 50]] }; // unsorted on purpose: slope 1, +10
    expect(pcCurvePct(5, 60, curves)).toBeCloseTo(70, 6);
    expect(pcCurvePct(5, 20, curves)).toBeCloseTo(30, 6);
    expect(pcCurvePct(5, 85, curves)).toBeCloseTo(95, 6);
    expect(pcCurvePct(5, 95, curves)).toBe(100);
    const steep = { 6: [[50, 10], [60, 30]] }; // slope 2: raw 40 -> -10 -> 0
    expect(pcCurvePct(6, 40, steep)).toBe(0);
  });
});
