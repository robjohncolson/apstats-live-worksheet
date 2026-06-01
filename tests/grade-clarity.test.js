// grade-clarity.test.js — pins the student-facing grade explanation (v3 two-track)
// and the Desk "how grades work" modal, plus guards against the stale band labels
// and the old "PC only raises / two pieces count" framing that v3 contradicts.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const START = readFileSync(resolve(repo, 'start-here.html'), 'utf8');
const DESK = readFileSync(resolve(repo, 'ap_stats_roadmap_square_mode.html'), 'utf8');

describe('start-here.html — v3 two-track grade explanation', () => {
  it('quarter band labels match the engine (Q1 = U1,U2,U3; Q2 = U4,U5)', () => {
    expect(START).toMatch(/Q1:\s*'U1, U2, U3'/);
    expect(START).toMatch(/Q2:\s*'U4, U5'/);
    // The stale Phase-6 mapping must be gone.
    expect(START).not.toMatch(/Q1:\s*'U1, U2',/);
    expect(START).not.toMatch(/Q2:\s*'U3, U4, U5'/);
  });

  it('explains the two-track higher-of-two model with the 40% floor / 70% cap', () => {
    expect(START).toMatch(/two tracks/i);
    expect(START).toMatch(/higher of the two/i);
    expect(START).toMatch(/40% on each/i);
    expect(START).toMatch(/capped at 70%/i);
    expect(START).toMatch(/ceiling/i);
  });

  it('states the Schoology relationship (same number, live, a step ahead)', () => {
    expect(START).toMatch(/posts to Schoology/i);
    expect(START).toMatch(/step ahead of Schoology/i);
  });

  it('exposes the how-your-grade anchor for the Desk deep-link', () => {
    expect(START).toMatch(/<section\s+id="how-your-grade"/);
  });

  it('drops the old model framing that v3 contradicts', () => {
    expect(START).not.toContain('only</em> raise your unit grade, never lower it');
    expect(START).not.toContain('Two pieces count toward your grade');
    expect(START).not.toContain('Progress Check is how you top each unit off');
    expect(START).not.toContain("Blooket · ungraded");
  });
});

describe('ap_stats_roadmap_square_mode.html — Desk "how grades work" modal', () => {
  it('defines the grade-help overlay + open/close handlers', () => {
    expect(DESK).toMatch(/id="grade-help-overlay"/);
    expect(DESK).toMatch(/function openGradeHelp\s*\(/);
    expect(DESK).toMatch(/function closeGradeHelp\s*\(/);
  });

  it('renders a "how grades work" trigger on the quarter strip', () => {
    expect(DESK).toMatch(/how grades work/i);
    expect(DESK).toMatch(/openGradeHelp\s*\(\s*\)/);
  });

  it('the modal carries the two-track + Schoology framing and links to start-here', () => {
    expect(DESK).toMatch(/higher of two tracks/i);
    expect(DESK).toMatch(/capped at 70%/i);
    expect(DESK).toMatch(/step ahead of Schoology/i);
    expect(DESK).toMatch(/start-here\.html#how-your-grade/);
  });
});
