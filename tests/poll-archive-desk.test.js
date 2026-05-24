// poll-archive-desk.test.js -- v2.1 U4: poll archive indicators on the Desk calendar.
// Static-parse of ap_stats_roadmap_square_mode.html; no DOM execution.
//
// Covered assertions (BUILD doc 5):
//   (1) The Desk loads ti84-plot.js via a <script src> tag.
//   (2) _groupPollsByDate helper groups an array of polls by pollDate.
//   (3) _fetchPollArchive fetches GET /poll-archive with Bearer token, stores
//       grouped result in _pollArchive, and calls rCal() on success.
//   (4) rCal adds a .poll-dot indicator on a cell whose date key is present in
//       _pollArchive.
//   (5) The click handler stopPropagation()s, calls showResultScreen (guarded),
//       and scrolls the board mount into view (guarded).
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const deskPath = resolve(repo, 'ap_stats_roadmap_square_mode.html');
const DESK = existsSync(deskPath) ? readFileSync(deskPath, 'utf8') : null;

// Extract the source body of a named (optionally async) function.
// Handles nested braces.
function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  let i = src.indexOf('{', m.index);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) return src.slice(m.index, j + 1);
    }
  }
  throw new Error('unbalanced braces for ' + name);
}

// ── (1) ti84-plot.js script tag ──────────────────────────────────────────────

describe('Desk loads ti84-plot.js', () => {
  it('00: Desk file exists', () => {
    expect(DESK, 'ap_stats_roadmap_square_mode.html must exist').toBeTypeOf('string');
  });

  it('01: <head> contains <script src="ti84-plot.js"></script>', () => {
    // The tag must appear in the head script block (near classroom-board.js).
    expect(DESK).toMatch(/<script\s+src=["']ti84-plot\.js["']/);
  });

  it('02: ti84-plot.js is loaded near classroom-board.js (within 200 chars)', () => {
    const cbIdx = DESK.indexOf('classroom-board.js');
    const plotIdx = DESK.indexOf('ti84-plot.js');
    expect(cbIdx).toBeGreaterThan(-1);
    expect(plotIdx).toBeGreaterThan(-1);
    // They should be adjacent script tags; the gap must be small.
    expect(Math.abs(plotIdx - cbIdx)).toBeLessThan(200);
  });
});

// ── (2) _groupPollsByDate helper ─────────────────────────────────────────────

describe('_groupPollsByDate helper', () => {
  it('03: function _groupPollsByDate is declared', () => {
    expect(DESK).toMatch(/function\s+_groupPollsByDate\s*\(/);
  });

  it('04: groups polls by pollDate key', () => {
    const body = fnBody(DESK, '_groupPollsByDate');
    // Must read p.pollDate as the grouping key.
    expect(body).toMatch(/\.pollDate\b/);
    // Must return an object keyed by date strings.
    expect(body).toMatch(/\boutput\b|\bout\b/);
  });

  it('05: returns empty object for non-array input (guard)', () => {
    const body = fnBody(DESK, '_groupPollsByDate');
    // Must check Array.isArray before iterating.
    expect(body).toMatch(/Array\.isArray\s*\(/);
  });

  it('06: skips entries with no pollDate (guard)', () => {
    const body = fnBody(DESK, '_groupPollsByDate');
    // Must guard for a missing/falsy pollDate.
    expect(body).toMatch(/if\s*\(\s*![^)]*pollDate|if\s*\(!d\)/);
  });
});

// ── (3) _fetchPollArchive function ───────────────────────────────────────────

describe('_fetchPollArchive function', () => {
  it('07: function _fetchPollArchive is declared as async', () => {
    expect(DESK).toMatch(/async\s+function\s+_fetchPollArchive\s*\(\s*\)/);
  });

  it('08: fetches GET /poll-archive via ROSTER_SERVICE_URL', () => {
    const body = fnBody(DESK, '_fetchPollArchive');
    // P2 (TEACHER_STUDENT_CONSOLE_P2_BUILD.md §3.6): the fetch is now wrapped
    // by _maybeViewAsFetch (typeof-guarded). The literal '/poll-archive'
    // endpoint remains in the source as the argument to _maybeViewAsFetch.
    expect(body).toMatch(/_maybeViewAsFetch\(\s*['"]\/poll-archive['"]/);
    expect(body).toMatch(/await\s+fetch\s*\(\s*baseUrl\s*\+\s*__va\.endpoint/);
  });

  it('09: sends Authorization: Bearer token header', () => {
    const body = fnBody(DESK, '_fetchPollArchive');
    expect(body).toMatch(/Authorization.*Bearer/);
    expect(body).toMatch(/token\b/);
  });

  it('10: guards on missing token -- returns early with no fetch', () => {
    const body = fnBody(DESK, '_fetchPollArchive');
    // token null-check before fetch
    expect(body).toMatch(/if\s*\(\s*!token\s*\)\s*return/);
  });

  it('11: guards on missing ROSTER_SERVICE_URL', () => {
    const body = fnBody(DESK, '_fetchPollArchive');
    expect(body).toMatch(/if\s*\(\s*!baseUrl\s*\)\s*return/);
  });

  it('12: stores grouped result in _pollArchive', () => {
    const body = fnBody(DESK, '_fetchPollArchive');
    expect(body).toMatch(/_pollArchive\s*=/);
    expect(body).toMatch(/_groupPollsByDate\s*\(/);
  });

  it('13: calls rCal() after storing the archive', () => {
    const body = fnBody(DESK, '_fetchPollArchive');
    expect(body).toMatch(/\brCal\s*\(\s*\)/);
  });

  it('14: entire body wrapped in try/catch (never throws)', () => {
    const body = fnBody(DESK, '_fetchPollArchive');
    // The outermost try must enclose the fetch call.
    const tryIdx = body.indexOf('try');
    const fetchIdx = body.indexOf('fetch(');
    expect(tryIdx).toBeGreaterThan(-1);
    expect(fetchIdx).toBeGreaterThan(tryIdx);
    expect(body).toMatch(/catch\s*\(_\)\s*\{\}/);
  });

  it('15: _fetchPollArchive is called at Desk init', () => {
    // Called once at startup alongside _mountClassroomBoard.
    const initIdx = DESK.indexOf('_mountClassroomBoard');
    const fetchCallIdx = DESK.indexOf('_fetchPollArchive()', initIdx);
    expect(initIdx).toBeGreaterThan(-1);
    expect(fetchCallIdx).toBeGreaterThan(-1);
    // Must be within 300 chars of the _mountClassroomBoard call.
    expect(fetchCallIdx - initIdx).toBeLessThan(300);
  });
});

// ── (4) rCal adds .poll-dot indicator ────────────────────────────────────────

describe('rCal poll-dot indicator', () => {
  it('16: rCal function exists', () => {
    expect(DESK).toMatch(/function\s+rCal\s*\(\s*\)/);
  });

  it('17: rCal creates a .poll-dot element when _pollArchive has entries for that date', () => {
    const body = fnBody(DESK, 'rCal');
    expect(body).toMatch(/poll-dot/);
    expect(body).toMatch(/_pollArchive\[/);
  });

  it('18: rCal formats the date as YYYY-MM-DD using padStart for month and day', () => {
    const body = fnBody(DESK, 'rCal');
    // Must build a YYYY-MM-DD key inside rCal (for _pollArchive lookup).
    expect(body).toMatch(/padStart\s*\(\s*2\s*,\s*['"]0['"]\s*\)/);
    // Month must be offset by +1.
    expect(body).toMatch(/getMonth\s*\(\s*\)\s*\+\s*1/);
  });

  it('19: .poll-dot is appended to the cell (not via insertAdjacentHTML)', () => {
    const body = fnBody(DESK, 'rCal');
    // Created as a real DOM element; appended via appendChild.
    expect(body).toMatch(/createElement\s*\(\s*['"]span['"]\s*\)/);
    expect(body).toMatch(/className\s*=\s*['"]poll-dot['"]/);
    expect(body).toMatch(/appendChild\s*\(_dot\)/);
  });

  it('20: cell gets position:relative when a poll-dot is added', () => {
    const body = fnBody(DESK, 'rCal');
    // position must be set so the absolute-positioned dot lands correctly.
    // Check the poll-dot block sets position to relative.
    const dotIdx = body.indexOf('poll-dot');
    expect(dotIdx).toBeGreaterThan(-1);
    // Within 500 chars of the poll-dot assignment, position:relative must appear.
    const nearby = body.slice(Math.max(0, dotIdx - 300), dotIdx + 300);
    expect(nearby).toMatch(/position\s*=\s*['"]relative['"]/);
  });
});

// ── (5) Click handler: guarded, stopPropagation, showResultScreen, scroll ────

describe('poll-dot click handler', () => {
  it('21: click handler calls ev.stopPropagation()', () => {
    const body = fnBody(DESK, 'rCal');
    // Must stopPropagation so the cell resource panel does not open.
    expect(body).toMatch(/ev\.stopPropagation\s*\(\s*\)/);
  });

  it('22: click handler calls showResultScreen with the day polls', () => {
    const body = fnBody(DESK, 'rCal');
    expect(body).toMatch(/showResultScreen\s*\(\s*_dayPolls\s*\)/);
  });

  it('23: showResultScreen call is guarded: _classroomBoardHandle null-check', () => {
    const body = fnBody(DESK, 'rCal');
    // Must check _classroomBoardHandle is truthy before calling showResultScreen.
    const srIdx = body.indexOf('showResultScreen');
    expect(srIdx).toBeGreaterThan(-1);
    // The guard must appear within 300 chars before showResultScreen.
    const guardWindow = body.slice(Math.max(0, srIdx - 300), srIdx);
    expect(guardWindow).toMatch(/_classroomBoardHandle/);
  });

  it('24: showResultScreen call is guarded: typeof check on the method', () => {
    const body = fnBody(DESK, 'rCal');
    // Must also verify showResultScreen is a function on the handle.
    expect(body).toMatch(/typeof\s+_classroomBoardHandle\.showResultScreen\s*===\s*['"]function['"]/);
  });

  it('25: click handler scrolls the classroom-board-mount into view', () => {
    const body = fnBody(DESK, 'rCal');
    expect(body).toMatch(/classroom-board-mount/);
    expect(body).toMatch(/scrollIntoView\s*\(/);
  });

  it('26: scrollIntoView is wrapped in try/catch (guarded)', () => {
    const body = fnBody(DESK, 'rCal');
    // The scrollIntoView call must be inside a try block so a missing element
    // or JSDOM restriction never surfaces to the user.
    const scrollIdx = body.indexOf('scrollIntoView');
    expect(scrollIdx).toBeGreaterThan(-1);
    // There must be a try before it (within 200 chars).
    const preScroll = body.slice(Math.max(0, scrollIdx - 200), scrollIdx);
    expect(preScroll).toMatch(/\btry\b/);
  });

  it('27: the poll-dot click listener uses addEventListener (not onclick assignment)', () => {
    const body = fnBody(DESK, 'rCal');
    // addEventListener keeps other handlers intact; do not assign onclick
    // directly on the dot (which could stomp on unrelated listeners).
    expect(body).toMatch(/_dot\.addEventListener\s*\(\s*['"]click['"]/);
  });
});

// ── (6) _pollArchive module-level var + CSS class ────────────────────────────

describe('_pollArchive declaration and CSS', () => {
  it('28: _pollArchive is declared as a module-level var', () => {
    expect(DESK).toMatch(/var\s+_pollArchive\s*=\s*\{\}/);
  });

  it('29: .poll-dot CSS class is defined in the <style> block', () => {
    expect(DESK).toMatch(/\.poll-dot\s*\{/);
  });

  it('30: .poll-dot CSS uses position:absolute (so it overlays the cell)', () => {
    const styleStart = DESK.indexOf('.poll-dot {');
    expect(styleStart).toBeGreaterThan(-1);
    const styleBlock = DESK.slice(styleStart, DESK.indexOf('}', styleStart) + 1);
    expect(styleBlock).toMatch(/position\s*:\s*absolute/);
  });
});
