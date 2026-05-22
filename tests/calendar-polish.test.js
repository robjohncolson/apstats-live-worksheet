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

// --- C2: current lesson emphasis --------------------------------------------

describe('C2 -- current lesson emphasis', () => {
  it('.cal-current CSS rule exists (a bright accent outline)', () => {
    expect(html).toMatch(/\.cal-current\s*\{[^}]*outline/);
  });
  it('paintDonowCells clears cal-current on every repaint', () => {
    const b = fnBody(html, 'paintDonowCells');
    expect(b).toMatch(/classList\.remove\([^)]*'cal-current'[^)]*\)/);
  });
  it('paintDonowCells marks the /donow nextTask lesson via donowLessonCovers', () => {
    const b = fnBody(html, 'paintDonowCells');
    expect(b).toMatch(/_donowData\s*&&\s*_donowData\.nextTask/);
    expect(b).toMatch(/donowLessonCovers\([^)]*\.lesson/);
    expect(b).toMatch(/classList\.add\('cal-current'\)/);
  });

  function paintWith(donow, cells) {
    const sandbox = {
      tdy: () => new Date(2026, 5, 15),
      document: { querySelectorAll: () => cells },
      console,
    };
    createContext(sandbox);
    runInContext(
      'var _donowData = ' + JSON.stringify(donow) + ';\n' +
      fnBody(html, 'donowLessonCovers') + '\n' +
      fnBody(html, 'donowCellState') + '\n' +
      fnBody(html, 'paintDonowCells') + '\nthis.__p = paintDonowCells;', sandbox);
    sandbox.__p();
  }
  function cell(topic) {
    const classes = new Set();
    return {
      dataset: { topic, dts: String(+new Date(2026, 5, 1)) },
      classList: {
        add: (...c) => c.forEach(x => classes.add(x)),
        remove: (...c) => c.forEach(x => classes.delete(x)),
        has: x => classes.has(x),
      },
      _classes: classes,
    };
  }

  it('marks the cell whose topic is the current nextTask lesson', () => {
    const c = cell('1.2');
    paintWith({ nextTask: { lesson: '1.2' } }, [c]);
    expect(c._classes.has('cal-current')).toBe(true);
  });
  it('a combined-lesson nextTask marks the cell donowLessonCovers matches', () => {
    // donowLessonCovers('4.1-2','4.1') is true (first dash-segment). cal-current
    // uses the same shipped helper as the done/partial coloring, so it marks
    // exactly the cells that helper matches -- staying consistent with it.
    const a = cell('4.1'), b = cell('9.9');
    paintWith({ nextTask: { lesson: '4.1-2' } }, [a, b]);
    expect(a._classes.has('cal-current')).toBe(true);
    expect(b._classes.has('cal-current')).toBe(false);
  });
  it('a non-current cell is not marked', () => {
    const c = cell('9.9');
    paintWith({ nextTask: { lesson: '1.2' } }, [c]);
    expect(c._classes.has('cal-current')).toBe(false);
  });
  it('no nextTask (all caught up) -> nothing marked', () => {
    const c = cell('1.2');
    paintWith({ lessons: [] }, [c]);
    expect(c._classes.has('cal-current')).toBe(false);
  });
  it('clears a stale cal-current when the nextTask moves on', () => {
    const c = cell('1.2');
    c.classList.add('cal-current');
    paintWith({ nextTask: { lesson: '9.9' } }, [c]);
    expect(c._classes.has('cal-current')).toBe(false);
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
