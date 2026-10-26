// grade-clarity.test.js — pins the student-facing grade explanation (v3 two-track)
// and the Desk "how grades work" modal, plus guards against the stale band labels
// and the old "PC only raises / two pieces count" framing that v3 contradicts.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deskSource, deskHtml } from './helpers/desk-source.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const START = readFileSync(resolve(repo, 'start-here.html'), 'utf8');
const DESK = deskHtml();
const DESK_SRC = deskSource(); // the Desk's JS incl. js/desk-*.js modules: code pins read this
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
    expect(text).toMatch(/worksheets 30%, quizzes 30%, the unit poster 30%, Blookets 10%/);       // V3_WORK_WEIGHTS
    expect(text).toContain('Your unit poster is scored 90 to 115, so it can only help you unless the rest of your Work is above 90.');
    expect(text).not.toMatch(/unit posters\)/);                              // posters are not banked bonus
    expect(text).toContain('13 days after its class day');                   // grade-config dueLagDays
    expect(text).toContain('3 days before');                                 // Desk ZERO_WARN_DAYS
    expect(text).toContain('+5 / +3 / +1');                                  // exit-ticket bonus
    expect(text).toContain('+7.5 / +4.5 / +1.5');                            // 5/3/1 x BONUS_MULTIPLIER 1.5
    expect(text).toMatch(/the first answer is the grade/i);              // QUIZ_RETRY_REMOVAL_SPEC.md
    expect(text).not.toContain('one retry');
    expect(text).toContain('half credit');                                  // talk it through
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

  it('drops the stale report-card framing; the poster is a Work slice again (POSTER_WORK_TRACK_SPEC.md)', () => {
    expect(MODAL).not.toMatch(/report-card version/i);
    expect(MODAL).not.toMatch(/blended a little differently/i);
    expect(plain(MODAL)).toMatch(/the unit poster 30%/);
    expect(MODAL).not.toMatch(/100\/85\/60/);
  });
});

describe('start-here.html — the full explanation carries the same numbers', () => {
  const SECTION = START.slice(START.indexOf('<section id="how-your-grade">'), START.indexOf('<section id="where-you-stand">'));
  const PROSE = SECTION.replace(/<script[\s\S]*?<\/script>/g, '');   // playground logic is not prose
  const text = plain(PROSE);

  it('states every current rule', () => {
    expect(text).toMatch(/worksheets 30%, quizzes 30%, the unit poster 30%, Blookets 10%/);
    expect(text).toContain('Your unit poster counts 30% of Work. It is scored 90 to 115 (I = 90, P = 100, E = 115), so it can only help you unless the rest of your Work is above 90.');
    expect(text).toContain('Your unit poster is not bonus: it is part of Work, scored 90 to 115.');
    expect(text).not.toMatch(/posters are bonus/i);
    expect(text).not.toMatch(/100\/85\/60/);
    expect(text).toContain('never lowers');
    expect(text).toContain('13 days after its class day');
    expect(text).toContain('3 days before');
    expect(text).toContain('+5 (E), +3 (P), or +1 (I)');
    expect(text).toContain('+7.5 / +4.5 / +1.5');
    expect(text).toContain('up to +5 a quarter');
    expect(text).toMatch(/the first answer is the grade/i);              // QUIZ_RETRY_REMOVAL_SPEC.md
    expect(text).not.toContain('one retry');
    expect(text).toContain('half credit');                                  // talk it through
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

  it('worked example uses the real formula (30/30/30/10) and the official rule', () => {
    expect(text).toContain('0.30 × 90 + 0.30 × 70 + 0.30 × 100 + 0.10 × 80 = 27 + 21 + 30 + 8 = 86%');
    expect(0.30 * 90 + 0.30 * 70 + 0.30 * 100 + 0.10 * 80).toBeCloseTo(86, 10);
    expect(text).toContain('If your Progress Check is 88%, it\'s higher, so your grade is 88%');
    expect(text).toContain('If your Progress Check is 60%, your grade stays at 86%');
    expect(officialGrade(86, 88)).toBe(88);
    expect(officialGrade(86, 60)).toBe(86);
    expect(Math.round((27 + 30 + 8) / 0.70 * 10) / 10).toBe(92.9);
    expect(text).toContain('(27 + 30 + 8) ÷ 0.70 = 92.9%');
  });
});

describe('lib/effort-facts.js — the short "how your grade is counted" note', () => {
  const LIB = readFileSync(resolve(repo, 'lib/effort-facts.js'), 'utf8');
  it('carries the weights, the official 40% rule and the bonus-only-raises line', () => {
    expect(LIB).toContain('Work is worksheets 30%, quizzes 30%, the unit poster 30%, Blookets 10%; once Work (with bonus) is at least 40%, a higher Progress Check score replaces it, and a low one never lowers you.');
    expect(LIB).toContain('Your unit poster is scored 90 to 115; DOK bonus sheets are banked');
    expect(LIB).toContain('they can only raise your grade.');
    expect(LIB).not.toContain('capped at 70%');
  });
});
