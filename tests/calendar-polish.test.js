/**
 * tests/calendar-polish.test.js
 *
 * Thread 2 (CALENDAR_POLISH) -- calendar grid polish in
 * ap_stats_roadmap_square_mode.html. Frozen contract: CALENDAR_POLISH_BUILD.md.
 *
 * Source assertions + Node `vm` runtime of the real helpers
 * (quarterOfDate / paintDonowCells), matching tests/desk-donow-coloring.test.js.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const REPO_ROOT = resolve(__dirname, '..');
const html = readFileSync(resolve(REPO_ROOT, 'ap_stats_roadmap_square_mode.html'), 'utf-8');

function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('not found: ' + name);
  let i = src.indexOf('(', m.index);
  let paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let depth = 0;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

// --- C1: done lessons greyscale ---------------------------------------------

describe('C1 -- done lessons render greyscale', () => {
  it('a .dc-done greyscale rule exists, excluding today + current', () => {
    expect(html).toMatch(/\.dc-done:not\(\.cell-today\):not\(\.cal-current\)\s*\{[^}]*grayscale/);
  });
  it('.dc-ahead keeps its celebratory pulse (not greyscaled)', () => {
    expect(html).toMatch(/\.dc-ahead\s*\{[^}]*box-shadow[^}]*\}/);
    expect(html).toMatch(/dcAheadPulse/);
  });
});

// --- C2: current lesson emphasis (CALENDAR_FOCUS -- rCal owns cal-current) ---

describe('C2 -- current lesson emphasis', () => {
  it('.cal-current CSS rule exists', () => {
    expect(html).toMatch(/\.cal-current\s*\{[^}]*outline/);
  });
  it('paintDonowCells no longer touches cal-current (rCal owns it now)', () => {
    const b = fnBody(html, 'paintDonowCells');
    // the quoted class literal -- a comment mentioning .cal-current is fine.
    expect(b).not.toMatch(/'cal-current'/);
  });
  it('rCal marks one cell -- the calNextUpTopic lesson -- as cal-current', () => {
    const b = fnBody(html, 'rCal');
    expect(b).toMatch(/calNextUpTopic\(/);
    expect(b).toMatch(/inf\.t\s*===\s*_nextUpTopic/);
    expect(b).toMatch(/classList\.add\('cal-current'\)/);
  });

  // behavioral: calNextUpTopic skips non-lesson (review) cells + done lessons.
  function loadCalNextUp() {
    const sandbox = {};
    createContext(sandbox);
    runInContext(
      fnBody(html, 'localLessonState') + '\n' +
      fnBody(html, 'calNextUpTopic') + '\nthis.__n = calNextUpTopic;', sandbox);
    return sandbox.__n;
  }
  it('calNextUpTopic -- first not-done lesson; skips review cells; null when all done', () => {
    const n = loadCalNextUp();
    const done = { '1.1|worksheet': { ts: 'y' } };
    expect(n(['1.1', '1.2', '1.3'], done)).toBe('1.2');           // 1.1 done -> 1.2
    expect(n(['1.1', 'REVIEW', '1.2'], done)).toBe('1.2');        // review cell skipped
    expect(n(['1.1', '1.2'], {})).toBe('1.1');                    // fresh -> first lesson
    const allDone = { '1.1|w': { ts: 'y' }, '1.2|w': { ts: 'y' } };
    expect(n(['1.1', '1.2', 'REVIEW'], allDone)).toBe(null);      // all done -> null
    expect(n(['1.1'], { '1.1|worksheet': { visitedAt: 'x' } })).toBe('1.1');  // partial counts
  });
});

// --- C3: Q1-Q4 quarter dividers ---------------------------------------------

describe('C3 -- Q1-Q4 quarter markers (F2: date-driven)', () => {
  it('.cal-qband CSS rule exists', () => {
    expect(html).toMatch(/\.cal-qband\s*\{/);
  });
  it('rCal emits a .cal-qband divider, date-driven via quarterOfDate', () => {
    const b = fnBody(html, 'rCal');
    expect(b).toMatch(/cal-qband/);
    expect(b).toMatch(/QUARTER_BAND_LABEL/);  // label keeps the unit list
    expect(b).toMatch(/quarterOfDate\(/);     // F2: position is date-driven
    expect(b).not.toMatch(/unitQuarter\(/);   // ...not the unit band
  });

  function loadQuarterOfDate() {
    const sandbox = {};
    createContext(sandbox);
    // quarterOfDate reads the QUARTER_WINDOWS const -- load both.
    const winSrc = /const QUARTER_WINDOWS = \[[\s\S]*?\n\];/.exec(html)[0];
    runInContext(winSrc + '\n' + fnBody(html, 'quarterOfDate') +
      '\nthis.__q = quarterOfDate;', sandbox);
    return sandbox.__q;
  }
  it('quarterOfDate maps calendar dates to the right quarter', () => {
    const q = loadQuarterOfDate();
    // JS Date month arg is 0-indexed: month 8 = September.
    expect(q(new Date(2026, 8, 9))).toBe(1);    // Sep 9 2026 -- Q1 opens
    expect(q(new Date(2026, 10, 13))).toBe(1);  // Nov 13 2026 -- Q1 closes
    expect(q(new Date(2026, 10, 14))).toBe(2);  // Nov 14 2026 -- Q2 opens
    expect(q(new Date(2027, 0, 29))).toBe(2);   // Jan 29 2027 -- Q2 closes
    expect(q(new Date(2027, 0, 30))).toBe(3);   // Jan 30 2027 -- Q3 opens
    expect(q(new Date(2027, 3, 9))).toBe(3);    // Apr 9 2027 -- Q3 closes
    expect(q(new Date(2027, 3, 10))).toBe(4);   // Apr 10 2027 -- Q4 opens
    expect(q(new Date(2027, 5, 23))).toBe(4);   // Jun 23 2027 -- Q4 closes
    expect(q(new Date(2026, 7, 31))).toBe(0);   // Aug 31 2026 -- before Q1
    expect(q(new Date(2027, 6, 1))).toBe(0);    // Jul 1 2027 -- after Q4
  });
});

// --- C4: per-cell direct-link icons removed ---------------------------------

describe('C4 -- per-cell direct-link icons removed', () => {
  it('htm() no longer builds a link-row', () => {
    const b = fnBody(html, 'htm');
    expect(b).not.toMatch(/link-row/);
    expect(b).not.toMatch(/linkHtml/);
  });
  it('the .link-row CSS rules are gone', () => {
    expect(html).not.toMatch(/\.link-row\s*\{/);
  });
});

// --- C5: CALENDAR_FOCUS synthwave next-up + local-done greyscale ------------

describe('C5 -- CALENDAR_FOCUS: synthwave next-up + local-done greyscale', () => {
  // A1: done-greyscale rule covers BOTH .dc-done and .dc-localdone, with grayscale + opacity
  it('A1 -- greyscale rule covers .dc-done AND .dc-localdone with grayscale + opacity', () => {
    expect(html).toMatch(/\.dc-done:not\(\.cell-today\):not\(\.cal-current\)\s*\{[^}]*grayscale[^}]*opacity/);
    expect(html).toMatch(/\.dc-localdone:not\(\.cell-today\):not\(\.cal-current\)\s*\{[^}]*grayscale[^}]*opacity/);
  });
  // A2: .dc-done and .dc-localdone both DEFINE a box-shadow ring in green #1f8b3b
  it('A2 -- .dc-done and .dc-localdone both have a box-shadow green ring (#1f8b3b)', () => {
    expect(html).toMatch(/\.dc-done\s*\{[^}]*box-shadow[^}]*#1f8b3b/);
    expect(html).toMatch(/\.dc-localdone\s*\{[^}]*box-shadow[^}]*#1f8b3b/);
  });
  // A3: .dc-partial and .dc-localpartial both DEFINE a box-shadow ring in amber #d99a00
  it('A3 -- .dc-partial and .dc-localpartial both have a box-shadow amber ring (#d99a00)', () => {
    expect(html).toMatch(/\.dc-partial\s*\{[^}]*box-shadow[^}]*#d99a00/);
    expect(html).toMatch(/\.dc-localpartial\s*\{[^}]*box-shadow[^}]*#d99a00/);
  });
  // A4: .cal-current uses synthwave magenta #ff2e97, a box-shadow, AND animation: calCurrentPulse
  it('A4 -- .cal-current has #ff2e97, box-shadow, and animation: calCurrentPulse', () => {
    expect(html).toMatch(/\.cal-current\s*\{[^}]*#ff2e97/s);
    expect(html).toMatch(/\.cal-current\s*\{[^}]*box-shadow/s);
    expect(html).toMatch(/\.cal-current\s*\{[^}]*animation:\s*calCurrentPulse/s);
  });
  // A5: @keyframes calCurrentPulse exists
  it('A5 -- @keyframes calCurrentPulse block exists', () => {
    expect(html).toMatch(/@keyframes\s+calCurrentPulse/);
  });
  // A6: the OLD plain .cal-current rule is gone
  it('A6 -- old plain .cal-current with outline: 3px solid var(--accent is gone', () => {
    expect(html).not.toMatch(/\.cal-current\s*\{\s*outline:\s*3px solid var\(--accent/);
  });
  // A7: prefers-reduced-motion disables .cal-current animation
  it('A7 -- prefers-reduced-motion media query disables .cal-current animation', () => {
    expect(html).toMatch(/prefers-reduced-motion[^{]*\{[^}]*\.cal-current\s*\{[^}]*animation:\s*none/);
  });
  // A8: localLessonState rolls a topic up from the STUDENT completion marks
  // (apstats_desk_marks_), where recordProgress() stamps `ts` on a Done --
  // NOT from REGISTRY readiness. Behavioral test of the real helper.
  function loadLocalLessonState() {
    const sandbox = {};
    createContext(sandbox);
    runInContext(fnBody(html, 'localLessonState') + '\nthis.__s = localLessonState;', sandbox);
    return sandbox.__s;
  }
  it('A8 -- localLessonState: done from a Done mark, partial from a visit-only mark', () => {
    const s = loadLocalLessonState();
    // a Done mark carries `ts` (recordProgress); a visit-only mark (recordLinkVisit) does not.
    expect(s('1.2', { '1.2|worksheet': { visitedAt: 'x', ts: 'y', score: null } })).toBe('done');
    expect(s('1.2', { '1.2|worksheet': { visitedAt: 'x' } })).toBe('partial');
    expect(s('1.2', {})).toBe('');
    expect(s('1.2', { '9.9|worksheet': { ts: 'y' } })).toBe('');   // a different topic
    expect(s('1.2', { '1.20|worksheet': { ts: 'y' } })).toBe('');  // prefix is exact: 1.2 != 1.20
    // multi-resource rollup: ANY resource with a ts -> done; all visited, none done -> partial
    expect(s('1.2', { '1.2|worksheet': { visitedAt: 'x' }, '1.2|blooket': { visitedAt: 'x', ts: 'y' } })).toBe('done');
    expect(s('1.2', { '1.2|worksheet': { visitedAt: 'x' }, '1.2|quiz': { visitedAt: 'x' } })).toBe('partial');
  });
  // A8b: the recede class is wired to localLessonState, NOT the REGISTRY `worst`
  it('A8b -- rCal derives the recede class from localLessonState(inf.t, _gateMarks), not REGISTRY worst', () => {
    const b = fnBody(html, 'rCal');
    expect(b).toMatch(/localLessonState\(\s*inf\.t\s*,\s*_gateMarks\s*\)/);
    expect(b).toMatch(/_localState\s*===\s*'done'\s*\?\s*'dc-localdone'/);
    expect(b).not.toMatch(/worst\s*===\s*'ready'\s*\?\s*'dc-localdone'/);
  });
  // A9: .dc-ahead is preserved -- @keyframes dcAheadPulse exists; greyscale rule does NOT mention .dc-ahead
  it('A9 -- .dc-ahead preserved; greyscale rule does not mention .dc-ahead', () => {
    expect(html).toMatch(/@keyframes\s+dcAheadPulse/);
    expect(html).not.toMatch(/\.dc-ahead[^{]*:not\(\.cell-today\)/);
  });
});

// --- CALENDAR_COMPACT -- focus window so the calendar never buries the board ---

describe('Calendar compaction -- always show a focus window', () => {
  it('rCal defines CAL_FOCUS_WEEKS = 2', () => {
    const b = fnBody(html, 'rCal');
    expect(b).toMatch(/CAL_FOCUS_WEEKS\s*=\s*2/);
  });

  it('rCal slices W down to the focus window', () => {
    const b = fnBody(html, 'rCal');
    expect(b).toMatch(/W\s*=\s*W\.slice\(/);
  });

  it('rCal anchors the window on the today-week index when in school', () => {
    const b = fnBody(html, 'rCal');
    // Source pin: the function scans W looking for the week whose days
    // include today, then uses that index as the focus anchor.
    expect(b).toMatch(/_todayWk\s*=\s*i/);
  });

  it('rCal clamps the start so the window always has CAL_FOCUS_WEEKS rows', () => {
    const b = fnBody(html, 'rCal');
    expect(b).toMatch(/Math\.max\(0,\s*Math\.min\(/);
  });

  it('rCal falls back by date when today has no week (pre/post-school)', () => {
    const b = fnBody(html, 'rCal');
    // Pre-school: t < W[0].m -> start 0. Post-school: -> last window.
    expect(b).toMatch(/t\s*<\s*W\[0\]\.m/);
    expect(b).toMatch(/W\.length\s*-\s*CAL_FOCUS_WEEKS/);
  });
});
