/**
 * tests/calendar-polish.test.js
 *
 * Thread 2 (CALENDAR_POLISH) -- calendar grid polish in
 * ap_stats_roadmap_square_mode.html. Frozen contract: CALENDAR_POLISH_BUILD.md.
 *
 * Source assertions + Node `vm` runtime of the real helpers
 * (unitQuarter / paintDonowCells), matching tests/desk-donow-coloring.test.js.
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

describe('C3 -- Q1-Q4 quarter markers', () => {
  it('.cal-qband CSS rule exists', () => {
    expect(html).toMatch(/\.cal-qband\s*\{/);
  });
  it('rCal emits a .cal-qband divider sourced from QUARTER_BAND_LABEL', () => {
    const b = fnBody(html, 'rCal');
    expect(b).toMatch(/cal-qband/);
    expect(b).toMatch(/QUARTER_BAND_LABEL/);
    expect(b).toMatch(/unitQuarter\(/);
  });

  function loadUnitQuarter() {
    const sandbox = {};
    createContext(sandbox);
    runInContext(fnBody(html, 'unitQuarter') + '\nthis.__q = unitQuarter;', sandbox);
    return sandbox.__q;
  }
  it('unitQuarter maps units to the Phase-6 quarter bands', () => {
    const q = loadUnitQuarter();
    expect([q(1), q(2), q(3)]).toEqual([1, 1, 1]);
    expect([q(4), q(5)]).toEqual([2, 2]);
    expect([q(6), q(7)]).toEqual([3, 3]);
    expect([q(8), q(9)]).toEqual([4, 4]);
    expect(q(0)).toBe(0);
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
