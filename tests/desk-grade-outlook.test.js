// desk-grade-outlook.test.js — current-quarter grade prediction + the two v3
// tracks (PC mastery vs Work engagement) in the Do Now card. (2026-06: was a
// Q1-Q4 strip; now shows only the current quarter + which track drives it.)
// Static parse of the Desk HTML source; no DOM execution.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const deskPath = resolve(repo, 'ap_stats_roadmap_square_mode.html');
const DESK = existsSync(deskPath) ? readFileSync(deskPath, 'utf8') : null;

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

describe('Desk grade outlook (Q1-Q4 strip in Do Now card)', () => {
  it('00: Desk file loads', () => {
    expect(DESK).toBeTypeOf('string');
  });

  it('01: #donow-grades container is rendered inside #donow-card markup', () => {
    // The grades container must live inside the same donow-card body the
    // Do Now message sits in — that's how it stays visually attached.
    expect(DESK).toMatch(/<div\s+id="donow-grades"/);
    // And it must be DEFAULT-HIDDEN (no stale pills before fetch).
    const gradesIdx = DESK.indexOf('id="donow-grades"');
    expect(gradesIdx).toBeGreaterThan(-1);
    // The matching CSS must set display:none.
    expect(DESK).toMatch(/#donow-grades\s*\{[^}]*display\s*:\s*none/);
  });

  it('02: QUARTER_BAND_LABEL is declared with Q1-Q4 DATE labels (SY2627 real marking periods)', () => {
    // Must declare a top-level mapping object so the tooltip text stays in
    // sync with the server-side PHASE3_CONFIG.quarters and the existing
    // start-here.html render. SY2627: units straddle quarters (CED order), so
    // the labels are the quarter DATE windows, not unit lists.
    expect(DESK).toMatch(/const\s+QUARTER_BAND_LABEL\s*=\s*\{/);
    expect(DESK).toMatch(/Q1\s*:\s*['"]Sep 2 – Nov 6['"]/);
    expect(DESK).toMatch(/Q2\s*:\s*['"]Nov 9 – Jan 22['"]/);
    expect(DESK).toMatch(/Q3\s*:\s*['"]Jan 25 – Apr 14['"]/);
    expect(DESK).toMatch(/Q4\s*:\s*['"]Apr 15 – Jun 17['"]/);
    expect(DESK).not.toMatch(/Q1\s*:\s*['"]U1, U2, U3['"]/);
  });

  it('02b: renderDoNowGrades renders the "Schoology today" chip from data.gradebook and the early-bonus chip from the quarter fields', () => {
    const body = fnBody(DESK, 'renderDoNowGrades');
    expect(body).toMatch(/data\.gradebook/);
    expect(body).toMatch(/schoologyTotal/);
    expect(body).toMatch(/'Schoology today'/);
    expect(body).toMatch(/q\.earlyLessons/);
    expect(body).toMatch(/q\.aheadLessons/);
    expect(body).toMatch(/q\.earlyBonus/);
    expect(body).not.toMatch(/innerHTML\s*=\s*['"][^'"]*early/); // chips are textContent-only
  });

  it('03: renderDoNowGrades function exists and accepts baseUrl + token', () => {
    expect(DESK).toMatch(/async\s+function\s+renderDoNowGrades\s*\(\s*baseUrl\s*,\s*token\s*\)/);
  });

  it('04: renderDoNowGrades calls /grade with the token query param', () => {
    const body = fnBody(DESK, 'renderDoNowGrades');
    // P2 (TEACHER_STUDENT_CONSOLE_P2_BUILD.md §3.6): the fetch is now wrapped
    // by _maybeViewAsFetch (typeof-guarded), so the literal pattern is split
    // across endpoint construction + fetch invocation. The endpoint string
    // `/grade?token=` + encodeURIComponent(token) remains present in the source.
    expect(body).toMatch(/['"]\/grade\?token=['"]\s*\+\s*encodeURIComponent\s*\(\s*token\s*\)/);
    expect(body).toMatch(/_maybeViewAsFetch/);
    expect(body).toMatch(/await\s+fetch\s*\(\s*baseUrl\s*\+\s*__va\.endpoint/);
  });

  it('05: renderDoNowGrades iterates Q1, Q2, Q3, Q4 in order', () => {
    const body = fnBody(DESK, 'renderDoNowGrades');
    // The order array literal is pinned so future refactors don't accidentally
    // drop a quarter or reorder them.
    expect(body).toMatch(/\[\s*['"]Q1['"]\s*,\s*['"]Q2['"]\s*,\s*['"]Q3['"]\s*,\s*['"]Q4['"]\s*\]/);
  });

  it('06: renderDoNowGrades reads quarterGrade, pcAvg, workAvg (v3 tracks) from the response', () => {
    const body = fnBody(DESK, 'renderDoNowGrades');
    expect(body).toMatch(/\.quarterGrade\b/);
    // EFFORT_VISIBILITY_V2_SPEC §3: the ↑ceiling left the pill (the coach still has it).
    expect(body).not.toMatch(/q\.ceiling\b/);
    // 2026-06: now shows the current quarter + the two v3 tracks (PC vs Work),
    // not a per-quarter unit count.
    expect(body).toMatch(/\.pcAvg\b/);
    expect(body).toMatch(/\.workAvg\b/);
  });

  it('07: renderDoNowGrades creates pills via createElement (no innerHTML XSS surface)', () => {
    const body = fnBody(DESK, 'renderDoNowGrades');
    // Per the structure-test policy (no innerHTML on response data), pills
    // must be assembled via createElement + textContent.
    expect(body).toMatch(/createElement\s*\(\s*['"]span['"]/);
    expect(body).toMatch(/\.textContent\s*=/);
    // The host's initial clear is innerHTML="" which is fine (empties only).
    // But NO innerHTML assignment that interpolates response data.
    expect(body, 'must not write response data via innerHTML').not.toMatch(
      /\.innerHTML\s*=\s*[^'"]*(?:gradeRaw|qKey|ceiling|graded|total)/
    );
  });

  it('08: renderDoNowGrades wraps the fetch + render in try/catch (never throws)', () => {
    const body = fnBody(DESK, 'renderDoNowGrades');
    expect(body).toMatch(/try\s*\{/);
    expect(body).toMatch(/catch\s*\(/);
    // On any failure path, the host must hide.
    expect(body).toMatch(/host\.style\.display\s*=\s*['"]none['"]/);
  });

  it('09: renderDoNow calls renderDoNowGrades on the success path, typeof-guarded + fire-and-forget', () => {
    const body = fnBody(DESK, 'renderDoNow');
    // The call site itself.
    expect(body).toMatch(/renderDoNowGrades\s*\(\s*baseUrl\s*,\s*token\s*\)/);
    // The call must be fire-and-forget (not awaited) so it never blocks the
    // Do Now message render on /grade latency.
    expect(body, 'renderDoNowGrades call must NOT be awaited').not.toMatch(
      /await\s+renderDoNowGrades/
    );
    // And it must have a .catch so a rejected promise never escapes.
    expect(body).toMatch(/renderDoNowGrades\s*\([^)]*\)\s*\.catch/);
    // Cross-sprint typeof-guard: the call must be wrapped so the DN3a vm
    // test (which loads ONLY renderDoNow into its sandbox) doesn't throw a
    // ReferenceError. Mirrors the paintDonowCells DN3b guard.
    expect(body).toMatch(/typeof\s+renderDoNowGrades\s*===\s*['"]function['"]/);
  });

  it('10: renderDoNow hides the strip at the top of every entry (no stale state)', () => {
    const body = fnBody(DESK, 'renderDoNow');
    // The top-of-function reset clears innerHTML and sets display:none so
    // the strip never shows stale pills when the student signs out / loses
    // their token / etc.
    expect(body).toMatch(/getElementById\s*\(\s*['"]donow-grades['"]/);
    // Find the reset block: it should set display='none' and clear innerHTML.
    const resetIdx = body.indexOf("getElementById('donow-grades'");
    expect(resetIdx).toBeGreaterThan(-1);
    const slice = body.slice(resetIdx, resetIdx + 400);
    expect(slice).toMatch(/display\s*=\s*['"]none['"]/);
    expect(slice).toMatch(/innerHTML\s*=\s*['"]['"]/);
  });

  it('11: CSS for .qpill pills is defined (compact pill aesthetic)', () => {
    // Pins the styling hook the implementation creates pills for.
    expect(DESK).toMatch(/#donow-grades\s+\.qpill/);
    // Empty-state class so empty pills are visually distinct.
    expect(DESK).toMatch(/\.qpill\.empty/);
  });

  it('12: the pill no longer carries the ↑ceiling (EFFORT_VISIBILITY_V2_SPEC §3: it confused the wording)', () => {
    const body = fnBody(DESK, 'renderDoNowGrades');
    expect(body).not.toMatch(/['"]↑['"]/);
    expect(body).not.toContain('qceil');
    expect(DESK).not.toMatch(/\.qpill \.qceil/);
  });

  it('13: grade strip uses the ROSTER_SERVICE_URL (not Supabase) — server-mediated rule (Phase 0 §6.5)', () => {
    const body = fnBody(DESK, 'renderDoNowGrades');
    // Phase 0 §6.5: the Desk NEVER hits Supabase directly. The fetch path
    // must use the baseUrl param (which renderDoNow sources from
    // window.ROSTER_SERVICE_URL).
    expect(body, 'must use the baseUrl argument').toMatch(/baseUrl\s*\+/);
    expect(body, 'must NOT reference SUPABASE_URL').not.toMatch(/SUPABASE_URL/);
    expect(body, 'must NOT reference supabase').not.toMatch(/supabase\.co/i);
  });

  // ── Phase 6 pins (+5) ───────────────────────────────────────────────────────

  it('14: renderDoNowGrades reads lessonsDue, lessonsGraded, lessonsTotal from response (Phase 6)', () => {
    const body = fnBody(DESK, 'renderDoNowGrades');
    expect(body).toMatch(/\.lessonsDue\b/);
    expect(body).toMatch(/\.lessonsGraded\b/);
    expect(body).toMatch(/\.lessonsTotal\b/);
  });

  it('15: pill tooltip text includes lessons-graded and due-so-far (Phase 6 tooltip upgrade)', () => {
    const body = fnBody(DESK, 'renderDoNowGrades');
    // The tooltip must reference "lesson" (singular or plural) for the lesson count.
    expect(body).toMatch(/lesson/);
    // Must include "due so far" phrasing.
    expect(body).toMatch(/due so far/);
  });

  it('16: _gradeLessonsCache is populated with data.lessons when present (Phase 6 cache)', () => {
    const body = fnBody(DESK, 'renderDoNowGrades');
    // Must cache the lessons array for the modal.
    expect(body).toMatch(/_gradeLessonsCache\s*=/);
    expect(body).toMatch(/data\.lessons/);
  });

  it('17: empty-state pill renders when lessonsDue is 0 (no quarters counted yet)', () => {
    const body = fnBody(DESK, 'renderDoNowGrades');
    // The pill class includes "empty" when gradeRaw is null.
    expect(body).toMatch(/qpill.*empty/);
    // The empty pill text must be the dash character.
    expect(body).toMatch(/['"]—['"]/);
  });

  it('18: renderDoNowGrades caches lessons array as _gradeLessonsCache (null for non-array)', () => {
    // Must handle missing/non-array data.lessons gracefully.
    const body = fnBody(DESK, 'renderDoNowGrades');
    expect(body).toMatch(/Array\.isArray\s*\(\s*data\.lessons\s*\)/);
  });

  // ── 2026-06: show only the CURRENT quarter + the two v3 tracks ───────────────

  it('19: shows only the CURRENT quarter (quarterOfDate(today)), with a fallback', () => {
    const body = fnBody(DESK, 'renderDoNowGrades');
    expect(body, 'picks the current quarter via quarterOfDate').toMatch(/quarterOfDate\s*\(/);
    expect(body, 'renders a single current-quarter pill keyed by curQ').toMatch(/curQ/);
    // No per-quarter render loop anymore (the order array remains only as the
    // fallback scan for the first graded quarter).
    expect(body, 'no per-quarter render loop').not.toMatch(/for\s*\(\s*var\s+i\s*=\s*0;[^)]*order\.length/);
  });

  it('20: renders the two v3 tracks INSIDE the pill (qrule / qtrack spans), not as separate PC / Work chips', () => {
    const body = fnBody(DESK, 'renderDoNowGrades');
    expect(body).toMatch(/_gradePillRule\s*\(\s*pcAvg\s*,\s*workAvg/);
    expect(body).toContain("rule.className = 'qrule';");
    expect(body).toContain("trackSpan.className = 'qtrack';");
    expect(body).not.toMatch(/_trackChip\(\s*['"]PC['"]/);
    expect(body).not.toMatch(/_trackChip\(\s*['"]Work['"]/);
    expect(body).toContain('Once both tracks are at least 40%, your grade is the higher one.');
  });
});

describe('the pill rule, in words (EFFORT_VISIBILITY_V2_SPEC §3)', () => {
  // Pure function: run it straight out of the Desk source.
  const rule = new Function(fnBody(DESK, '_gradePillRule') + '\nreturn _gradePillRule;')();
  const text = (pieces) => pieces.map(p => p.text).join('');
  const tracks = (pieces) => pieces.filter(p => p.track).map(p => p.text);
  it('PC not counting yet, a PC on file: Work only, with the day the PC counts', () => {
    expect('Q1 86 ' + text(rule(null, 84.4, 'Tue 10/13', true))).toBe('Q1 86 = Work 84 \u00b7 PC \u2014 (counts from Tue 10/13)');
    expect(tracks(rule(null, 84.4, 'Tue 10/13', true))).toEqual(['Work 84', 'PC —']);
  });
  it('both tracks at least 40: the higher of the two', () => {
    expect('Q1 94 ' + text(rule(94.2, 61.4, null, true))).toBe('Q1 94 = higher of Work 61 · PC 94');
    expect(tracks(rule(94.2, 61.4))).toEqual(['Work 61', 'PC 94']);
  });
  it('one track under 40 (unrounded: 39.96 is under): penalized until it reaches 40', () => {
    expect('Q1 61 ' + text(rule(94, 35, null, true))).toBe('Q1 61 · Work 35 is under 40% → penalized until it reaches 40 (PC 94)');
    expect(text(rule(94, 39.96))).toBe('· Work 39.9 is under 40% → penalized until it reaches 40 (PC 94)');
    expect(text(rule(30, 61))).toBe('· PC 30 is under 40% → penalized until it reaches 40 (Work 61)');
    expect(text(rule(30, 35))).toBe('· Work 35 and PC 30 are under 40% → penalized until both reach 40');
  });
  it('no PC on file at all: Work only; no tracks at all: nothing', () => {
    expect('Q1 86 ' + text(rule(null, 86))).toBe('Q1 86 = Work 86 \u00b7 PC \u2014 (none yet)');
    expect(text(rule(null, 86, null, true))).toBe('= Work 86 \u00b7 PC \u2014 (not counting yet)');
    expect(rule(null, null)).toEqual([]);
    expect(text(rule(88, null))).toBe('= PC 88');
  });
});

describe('"show the math" (teacher 2026-09-27: the rule as inequalities, and why Schoology differs)', () => {
  const lines = new Function('DESK_V3_WORK_WEIGHTS', 'DESK_SCHOOLOGY_WEIGHTS', fnBody(DESK, '_gradeMathLines') + '\nreturn _gradeMathLines;')(
    { lessons: 0.30, quizzes: 0.30, posters: 0.30, blooket: 0.10 }, { Lesson: 15, Quizzes: 15, Blooket: 5, 'Progress Check': 50, Posters: 15 });
  it('PC not counting yet: names PC as — with its date, builds Work from its parts, states the two-case rule, plugs in, and explains Schoology', () => {
    const out = lines({ grade: 86, pcAvg: null, workAvg: 84.4, pcDay: 'Tue 10/13', pcOnFile: true,
      workTracks: { lessons: 84.0, quizzes: 77.8, blooket: 95.6, posters: null },
      schoologyTotal: 83.7, categoryAverages: { Lesson: 84.0, Quizzes: 77.8, Blooket: 95.6 } });
    expect(out[0]).toBe('Work = 84.4   PC = \u2014  (counts from Tue 10/13)');
    expect(out[1]).toBe('Work = [30\u00b784 (worksheets) + 30\u00b777.8 (quizzes) + 10\u00b795.6 (flashcards)] / 70 = 83   (posters join later)');
    expect(out[2]).toBe('If Work \u2265 40 and PC \u2265 40:  Grade = max(Work, PC)');
    expect(out[3]).toBe('Otherwise:  Grade = max(0.7\u00b7Work, 0.7\u00b7PC, (Work + PC) / 2)');
    expect(out[4]).toBe('Here: PC is not counting yet, so Grade = Work = 84.4');
    expect(out[5]).toBe('Schoology today = 83.7 = [84\u00d715 (Lesson) + 77.8\u00d715 (Quizzes) + 95.6\u00d75 (Blooket)] / 35');
    expect(out[6]).toContain('Progress Check, Posters join when their columns open');
    expect(out[6]).toContain('leaves out work done ahead of the calendar');
  });
  it('both tracks counting: plugs the numbers into the right case', () => {
    expect(lines({ pcAvg: 94.2, workAvg: 61.4 })[3]).toBe('Here: 61.4 \u2265 40 and 94.2 \u2265 40  \u2192  Grade = max(61.4, 94.2) = 94.2');
    expect(lines({ pcAvg: 94, workAvg: 35 })[3]).toBe('Here: Work 35 < 40  \u2192  Grade = max(24.5, 65.8, 64.5) = 65.8');
  });
  it('the Desk mirrors of the two weight tables equal the server\u2019s', async () => {
    const lg = await import('../roster-server/lesson-grade.js');
    const gg = await import('../roster-server/gradebook-grid.js');
    const v3 = new Function(DESK.match(/var DESK_V3_WORK_WEIGHTS = (\{[^}]+\});/)[1].replace(/^/, 'return ') )();
    const sch = new Function(DESK.match(/var DESK_SCHOOLOGY_WEIGHTS = (\{[^}]+\});/)[1].replace(/^/, 'return '))();
    expect(v3).toEqual(lg.V3_WORK_WEIGHTS);
    expect(sch).toEqual(gg.SCHOOLOGY_CATEGORY_WEIGHTS);
  });
  it('renderDoNowGrades adds the toggle after the Schoology chip', () => {
    const body = fnBody(DESK, 'renderDoNowGrades');
    expect(body).toContain('_gradeMathToggle(host, {');
    expect(fnBody(DESK, '_gradeMathToggle')).toContain("btn.textContent = 'show the math'");
  });
});
