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
// Just the "How your grade works" modal markup.
const MODAL = DESK.slice(DESK.indexOf('<div id="grade-help-overlay"'), DESK.indexOf('<!-- ═══ My Gradebook Modal'));

const plain = html => html.replace(/<[^>]+>/g, '').replace(/&mdash;/g, '—').replace(/&nbsp;/g, ' ');
const occurrences = (s, needle) => s.split(needle).length - 1;
// The one <p>…</p> that contains `needle`.
function paragraphWith(html, needle) {
  const found = (html.match(/<p[\s\S]*?<\/p>/g) || []).filter(p => p.includes(needle));
  expect(found.length).toBe(1);
  return found[0];
}
// The official rule (tools/schoology_official.py official_grade, no bonus): PC counts once
// Work >= 40 and only if higher.
const officialGrade = (work, pc) => (work >= 40 ? Math.max(work, pc) : work);

describe('start-here.html — v3 two-track grade explanation', () => {
  it('quarter band labels are the SY2627 date windows (units straddle quarters in CED order)', () => {
    expect(START).toMatch(/Q1:\s*'Sep 2 – Nov 6'/);
    expect(START).toMatch(/Q2:\s*'Nov 9 – Jan 22'/);
    // The stale unit-list mappings must be gone.
    expect(START).not.toMatch(/Q1:\s*'U1, U2, U3'/);
    expect(START).not.toMatch(/Q1:\s*'U1, U2',/);
    expect(START).not.toMatch(/Q2:\s*'U3, U4, U5'/);
  });

  it('explains the OFFICIAL rule: Work first, a higher PC replaces it past 40%, never lowers', () => {
    expect(START).toMatch(/two tracks/i);
    expect(START).toMatch(/if it's higher/i);
    expect(START).toMatch(/never lowers/i);
    expect(START).toMatch(/at least <strong>40%<\/strong>/);
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
    expect(MODAL).toMatch(/higher of two tracks/i);
    expect(MODAL).toMatch(/step ahead of Schoology/i);
    expect(MODAL).toMatch(/start-here\.html#how-your-grade/);
  });

  it('states the official rule and the current numbers (2026-10-10)', () => {
    const text = plain(MODAL);
    expect(text).toContain('Once Work (with bonus) is at least 40%, your Progress Check score replaces it if it\'s higher.');
    expect(text).toContain('A low Progress Check never lowers you');
    expect(text).toMatch(/worksheets 50%, quizzes 35%, Blookets 15%/);       // V3_WORK_WEIGHTS
    expect(text).toContain('13 days after its class day');                   // grade-config dueLagDays
    expect(text).toContain('3 days before');                                 // Desk ZERO_WARN_DAYS
    expect(text).toContain('+5 / +3 / +1');                                  // exit-ticket bonus
    expect(text).toContain('+7.5 / +4.5 / +1.5');                            // 5/3/1 x BONUS_MULTIPLIER 1.5
    expect(text).toContain('one retry');
    expect(text).toContain('half credit');
    expect(text).toMatch(/official/);
    expect(text).toContain('Candy, keys and games never change your grade.');
  });

  it('the 40/70 estimate formula appears ONLY in the "Today\'s estimate" note', () => {
    expect(occurrences(MODAL, 'capped at 70%')).toBe(1);
    const note = paragraphWith(MODAL, "Today's estimate");
    expect(note).toContain('capped at 70%');
    expect(note).toContain('40% on the Progress Check side');
    expect(MODAL).not.toContain('Skip a whole track');
  });

  it('drops the stale report-card / poster-slice framing', () => {
    expect(MODAL).not.toMatch(/report-card version/i);
    expect(MODAL).not.toMatch(/blended a little differently/i);
    expect(MODAL).not.toMatch(/posters?\s+30%/i);
  });
});

describe('start-here.html — the full explanation carries the same numbers', () => {
  const SECTION = START.slice(START.indexOf('<section id="how-your-grade">'), START.indexOf('<section id="where-you-stand">'));
  const PROSE = SECTION.replace(/<script[\s\S]*?<\/script>/g, '');   // playground logic is not prose
  const text = plain(PROSE);

  it('states every current rule', () => {
    expect(text).toMatch(/worksheets 50%, quizzes 35%, Blookets 15%/);
    expect(text).toContain('never lowers');
    expect(text).toContain('13 days after its class day');
    expect(text).toContain('3 days before');
    expect(text).toContain('+5 (E), +3 (P), or +1 (I)');
    expect(text).toContain('+7.5 / +4.5 / +1.5');
    expect(text).toContain('up to +5 a quarter');
    expect(text).toContain('one retry');
    expect(text).toContain('half credit');
    expect(text).toContain('Candy, keys and games never change your grade.');
    expect(text).toContain("Today's estimate");
  });

  it('the 40/70 estimate formula appears ONLY in the "Today\'s estimate" note', () => {
    expect(occurrences(PROSE, 'capped at 70%')).toBe(1);
    expect(occurrences(PROSE, '40% on each')).toBe(1);
    const note = paragraphWith(PROSE, 'slightly stricter formula');
    expect(note).toContain('capped at 70%');
    expect(note).toContain('40% on each');
    expect(note).toContain("Today's estimate");
  });

  it('worked example uses the real formula (50/35/15) and the official rule', () => {
    expect(text).toContain('0.50 × 90 + 0.35 × 70 + 0.15 × 80 = 45 + 24.5 + 12 = 81.5%');
    expect(0.50 * 90 + 0.35 * 70 + 0.15 * 80).toBeCloseTo(81.5, 10);
    expect(text).toContain('If your Progress Check is 88%, it\'s higher, so your grade is 88%');
    expect(text).toContain('If your Progress Check is 60%, your grade stays at 81.5%');
    expect(officialGrade(81.5, 88)).toBe(88);
    expect(officialGrade(81.5, 60)).toBe(81.5);
    expect(Math.round((45 + 12) / 0.65 * 10) / 10).toBe(87.7);
    expect(text).toContain('87.7%');
  });
});

describe('lib/effort-facts.js — the short "how your grade is counted" note', () => {
  const LIB = readFileSync(resolve(repo, 'lib/effort-facts.js'), 'utf8');
  it('carries the weights, the official 40% rule and the bonus-only-raises line', () => {
    expect(LIB).toContain('Work is worksheets 50%, quizzes 35%, Blookets 15%; once Work (with bonus) is at least 40%, a higher Progress Check score replaces it, and a low one never lowers you.');
    expect(LIB).toContain('they can only raise your grade.');
    expect(LIB).not.toContain('capped at 70%');
  });
});
