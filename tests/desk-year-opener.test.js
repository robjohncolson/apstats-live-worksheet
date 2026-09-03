// desk-year-opener.test.js — the SY26-27 school calendar opens with Day-1
// orientation (not graded) and goes straight into 1.1 on the next meeting.
// (The Day-2 no-stakes Unit-1 BASELINE was dropped by the teacher 2026-09-03.)
// Runs the REAL schedule generator to prove placement AND that the opener
// cell doesn't push tail lessons off the end of the year.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(repo, 'ap_stats_roadmap_square_mode.html'), 'utf8');

function fnBody(name) {
  const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(DESK);
  if (!m) throw new Error('fn not found: ' + name);
  const i = DESK.indexOf('{', m.index);
  let depth = 0;
  for (let j = i; j < DESK.length; j++) {
    if (DESK[j] === '{') depth++;
    else if (DESK[j] === '}') { depth--; if (depth === 0) return DESK.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}
function constArray(name) {
  const at = DESK.indexOf('const ' + name + ' = [');
  if (at < 0) throw new Error('not found: ' + name);
  const i = DESK.indexOf('[', at);
  let depth = 0;
  for (let j = i; j < DESK.length; j++) {
    if (DESK[j] === '[') depth++;
    else if (DESK[j] === ']') { depth--; if (depth === 0) return DESK.slice(at, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

// Real generator + pacing, plus the SY26-27 def's stable config (range/periods/
// daysOff/examDate copied from SCHEDULE_DEFS["SY26-27"]).
const SRC =
  'const R="review",OFF="off",EX="exam",PO="post",NC="noclass";\n'
  + ['d', 'dateFromArr', 'buildOffSet', 'enumWeekdays', 'injectPcPosterEvents', 'generateSchedule'].map(fnBody).join('\n') + '\n'
  + constArray('SY2627_PACING_B') + ';\n'
  + constArray('SY2627_PACING_E') + ';\n'
  + 'const def={range:{start:[2026,8,2],end:[2027,4,15]},examDate:[2027,4,11],'
  + 'periods:{B:{meetsDays:[1,2,4,5]},E:{meetsDays:[1,3,5],doubleDay:3}},'
  + 'daysOff:[[[2026,8,4]],[[2026,8,7]],[[2026,9,12]],[[2026,10,3]],[[2026,10,11]],[[2026,10,26],[2026,10,27]],'
  + '[[2026,11,24],[2026,11,25]],[[2026,11,28],[2027,0,1]],[[2027,0,18]],[[2027,1,15],[2027,1,19]],'
  + '[[2027,2,26]],[[2027,3,19],[2027,3,23]],[[2027,4,31]]],'
  + 'pacing:{B:injectPcPosterEvents(SY2627_PACING_B),E:injectPcPosterEvents(SY2627_PACING_E)}};\n'
  + 'return {S: generateSchedule(def), pacingB: def.pacing.B, pacingE: def.pacing.E};';

// eslint-disable-next-line no-new-func
const { S, pacingB, pacingE } = new Function(SRC)();

// The ordered non-empty cells for a period column (3 = B, 4 = E).
function cellsFor(col) {
  const out = [];
  for (const row of S) {
    const inf = row[col];
    if (inf && typeof inf === 'object' && inf.t) out.push(inf);
  }
  return out;
}

describe('SY26-27 year opener — placement', () => {
  it('period B opens orientation → 1.1 (no baseline day)', () => {
    const b = cellsFor(3);
    expect(b[0].kind).toBe('orientation');
    expect(b[1].t).toBe('1.1');
    expect(b.some((c) => c.kind === 'baseline')).toBe(false);
  });

  it('period E opens the same way', () => {
    const e = cellsFor(4);
    expect(e[0].kind).toBe('orientation');
    expect(e[1].t).toBe('1.1');
    expect(e.some((c) => c.kind === 'baseline')).toBe(false);
  });

  it('U1-PC1 appears exactly once per period — the unit-end PC only', () => {
    for (const col of [3, 4]) {
      const hits = cellsFor(col).filter((c) => c.t === 'U1-PC1');
      expect(hits.length).toBe(1);
      expect(hits[0].kind).toBe('pc');
    }
  });
});

describe('SY26-27 year opener — no tail drop (the +2 cells must not push lessons off the year)', () => {
  it('every period-B pacing item is placed on the calendar', () => {
    const placed = new Set(cellsFor(3).map((c) => c.t + '|' + (c.kind || '') + '|' + (c.n || '')));
    // generateSchedule drops queue items only if it runs out of meeting days. The
    // LAST pacing item appearing proves the whole queue fit.
    const last = pacingB[pacingB.length - 1];
    expect(placed.has(last.t + '|' + (last.kind || '') + '|' + (last.n || ''))).toBe(true);
    // also: at least as many placed cells as pacing items (no silent truncation)
    expect(cellsFor(3).length).toBeGreaterThanOrEqual(pacingB.length);
  });

  it('every period-E pacing item is placed on the calendar', () => {
    const last = pacingE[pacingE.length - 1];
    const placed = cellsFor(4).map((c) => c.t + '|' + (c.kind || '') + '|' + (c.n || ''));
    expect(placed).toContain(last.t + '|' + (last.kind || '') + '|' + (last.n || ''));
    expect(cellsFor(4).length).toBeGreaterThanOrEqual(pacingE.length);
  });
});

describe('SY26-27 — mid-unit MCQ Part A tiles (Phase 3)', () => {
  function assertMidUnitAfter(pacing, splitT, unit) {
    const idx = pacing.findIndex((c) => c.t === splitT);
    expect(idx).toBeGreaterThan(-1);
    const next = pacing[idx + 1]; // injected right after the split-point lesson
    expect(next.t).toBe('U' + unit + '-PCA');
    expect(next.kind).toBe('pc');
    expect(next.part).toBe('A');
    expect(next.u).toBe(unit);
  }

  it('injects U1-PCA right after 1.6 and U2-PCA right after 4.5 (both periods)', () => {
    assertMidUnitAfter(pacingB, '1.6', 1);
    assertMidUnitAfter(pacingB, '4.5', 2);
    assertMidUnitAfter(pacingE, '1.6', 1);
    assertMidUnitAfter(pacingE, '4.5', 2);
  });

  it('exactly U1 + U2 get a mid-unit Part A — U5 (single end-of-unit) gets none', () => {
    const paTags = (p) => p.filter((c) => c.part === 'A').map((c) => c.t).sort();
    expect(paTags(pacingB)).toEqual(['U1-PCA', 'U2-PCA']);
    expect(paTags(pacingE)).toEqual(['U1-PCA', 'U2-PCA']);
    expect(pacingB.some((c) => c.t === 'U5-PCA')).toBe(false);
    expect(pacingE.some((c) => c.t === 'U5-PCA')).toBe(false);
  });

  it('the PCA id is distinct from the baseline/auto PC1 (no collision)', () => {
    // U{u}-PCA must never be the U{u}-PC1 topic that the baseline + end PC1 share.
    expect(pacingB.filter((c) => c.t === 'U1-PC1').every((c) => c.part !== 'A')).toBe(true);
    expect(pacingB.some((c) => c.t === 'U1-PCA' && c.part === 'A')).toBe(true);
  });

  it('the +2 mid-unit A cells are placed on the real calendar (no tail drop)', () => {
    for (const col of [3, 4]) {
      const placed = new Set(cellsFor(col).map((c) => c.t));
      expect(placed.has('U1-PCA')).toBe(true);
      expect(placed.has('U2-PCA')).toBe(true);
    }
  });

  it('the placed mid-unit A cell carries part:A and renders via the Part-A branch', () => {
    const cell = cellsFor(3).find((c) => c.t === 'U1-PCA');
    expect(cell.kind).toBe('pc');
    expect(cell.part).toBe('A');
    // htm + cellAria have a dedicated part:'A' branch BEFORE the generic PC branch.
    const htm = fnBody('htm');
    expect(htm).toContain("i.kind==='pc'&&i.part==='A')return");
    expect(htm).toContain('MCQ A');
    const aria = fnBody('cellAria');
    expect(aria).toContain("i.kind==='pc'&&i.part==='A')");
    expect(aria).toContain('MCQ Part A');
  });
});

describe('SY26-27 year opener — render + click wiring', () => {
  it('cls/htm handle the orientation + baseline kinds', () => {
    const cls = fnBody('cls');
    const htm = fnBody('htm');
    expect(cls).toContain("i.kind==='orientation')return\"cell-orient\"");
    expect(cls).toContain("i.kind==='baseline')return\"cell-baseline\"");
    expect(htm).toContain('Start Here');
    expect(htm).toContain('Baseline');
  });

  it('orientation opens the grade-help explainer; styling exists', () => {
    expect(DESK).toMatch(/inf\.kind === 'orientation'[\s\S]{0,260}openGradeHelp/);
    expect(DESK).toContain('.cell-orient');
    expect(DESK).toContain('.cell-baseline');
  });

  it('baseline opens a no-stakes framing dialog (PCs are taken in AP Classroom, not Desk-launched)', () => {
    expect(DESK).toMatch(/inf\.kind === 'baseline'[\s\S]{0,400}_openBaselineInfo/);
    expect(DESK).toContain('function _openBaselineInfo');
    expect(DESK).toMatch(/Baseline Check — your starting line/);
    expect(DESK).toMatch(/only your <b>best<\/b> Progress-Check/);
  });
});
