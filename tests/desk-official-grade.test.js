// desk-official-grade.test.js — the Do Now pill shows the official quarter grade (the number
// in Schoology) with the live Desk grade as "Today's estimate" (OFFICIAL_GRADE_SYNC_SPEC §4.4,
// teacher 2026-10-02: "the desk and schoology should agree").
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { deskSource } from './helpers/desk-source.js';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = deskSource();

function fnSource(name) {
  const m = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(DESK);
  if (!m) throw new Error('function not found: ' + name);
  let depth = 0;
  for (let i = DESK.indexOf('{', m.index); i < DESK.length; i++) {
    if (DESK[i] === '{') depth++;
    if (DESK[i] === '}' && --depth === 0) return DESK.slice(m.index, i + 1);
  }
  throw new Error('unbalanced: ' + name);
}

const OFFICIAL = {
  quarter: 'Q1', grade: 68.7, asOf: '2026-10-03T21:00:00Z',
  parts: { work: 36.14, pc: 66.7, base: 66.7, line: 41.14, earlyBonus: 2, bankedBonus: 3, rule: 'PC' },
};

function load({ response, viewAs = null, teacherToken = 'teacher-tok' } = {}) {
  const calls = [];
  const sandbox = {
    window: { rosterClient: { token: () => teacherToken } },
    ROADMAP_FETCH_TIMEOUT_MS: 1000,
    _viewAsContext: () => viewAs,
    fetch: async (url, opts) => {
      calls.push({ url, headers: (opts && opts.headers) || {} });
      if (response instanceof Error) throw response;
      return response;
    },
  };
  runInNewContext(fnSource('_fetchOfficialGrade') + '\n' + fnSource('_quarterName') + '\n' + fnSource('_officialGradeTitle') + '\nthis._f=_fetchOfficialGrade;this._t=_officialGradeTitle;', sandbox);
  return { fetchOfficial: sandbox._f, title: sandbox._t, calls };
}

const ok = body => ({ ok: true, status: 200, json: async () => body });

describe('_fetchOfficialGrade', () => {
  it('a student fetches their own official grade with their token', async () => {
    const s = load({ response: ok({ ok: true, official: OFFICIAL }) });
    const got = await s.fetchOfficial('https://roster.test', 'stu-tok', 'Q1');
    expect(got.grade).toBe(68.7);
    expect(s.calls[0].url).toBe('https://roster.test/official-grade?quarter=Q1');
    expect(s.calls[0].headers.Authorization).toBe('Bearer stu-tok');
  });

  it('teacher view-as asks for the student by id with the teacher token in the header', async () => {
    const s = load({ response: ok({ ok: true, official: OFFICIAL }), viewAs: { studentId: 'stu_b' } });
    await s.fetchOfficial('https://roster.test', 'stu-tok', 'Q1');
    expect(s.calls[0].url).toBe('https://roster.test/official-grade?quarter=Q1&studentId=stu_b');
    expect(s.calls[0].headers.Authorization).toBe('Bearer teacher-tok');
  });

  it('null when nothing is published, the server lacks the route, or the network fails', async () => {
    expect(await load({ response: ok({ ok: true, official: null }) }).fetchOfficial('b', 't', 'Q1')).toBeNull();
    expect(await load({ response: { ok: false, status: 503 } }).fetchOfficial('b', 't', 'Q1')).toBeNull();
    expect(await load({ response: new Error('offline') }).fetchOfficial('b', 't', 'Q1')).toBeNull();
    expect(await load({ response: ok({ ok: true, official: null }) }).fetchOfficial('b', null, 'Q1')).toBeNull();
  });
});

describe('_officialGradeTitle', () => {
  it('explains the number: Schoology work, the PC that counts, the early bonus', () => {
    const t = load({ response: null }).title(OFFICIAL);
    expect(t).toMatch(/^Official Quarter 1 grade/);   // re-pinned 2026-11-08 (review D4): never "Q1"
    expect(t).toContain('the same number Schoology shows');
    expect(t).toContain('Work 36.1 (from Schoology)');
    expect(t).toContain('your Progress Check 66.7 is higher, and it counts because Work + bonuses reached 40');
    expect(t).toContain('+ 2 early-finish bonus');
  });

  it('under the line, says when the Progress Check will count', () => {
    const t = load({ response: null }).title({ ...OFFICIAL, parts: { work: 15.7, pc: 61.1, earlyBonus: 1, rule: 'work (under 40)' } });
    expect(t).toContain('your Progress Check 61.1 counts once Work + bonuses reach 40');
  });
});

describe('My Ledger balance card (_walletCurrentGrade)', () => {
  // byQuarter: the per-quarter cache (QUARTER_LINE_BY_DUE_DATE_SPEC §3.1); undefined = an older page
  // without it (the sandbox then has only the single _officialGradeCache, as before).
  // startsText (optional) stands in for the Desk's _quarterStartsText(q): 'starts Mon Nov 9' while q has not started.
  function walletGrade({ official, quarterGrade = 37.9, quarter = 'Q1', byQuarter, startsText }) {
    const sandbox = {
      _officialGradeCache: official,
      _walletCurrentQuarter: () => ({ quarter, data: { quarterGrade } }),
    };
    if (byQuarter !== undefined) sandbox._officialGradeByQuarter = byQuarter;
    if (startsText !== undefined) sandbox._quarterStartsText = startsText;
    runInNewContext(fnSource('_walletPct') + '\n' + fnSource('_walletCurrentGrade') + '\nthis._g=_walletCurrentGrade;', sandbox);
    return sandbox._g();
  }

  it('leads with the official grade and keeps the live grade as the estimate', () => {
    const g = walletGrade({ official: OFFICIAL });
    expect(g.pct).toBe(68.7);
    expect(g.q).toBe('Q1');
    expect(g.estimate).toBe(38);
    expect(g.official).toBe(OFFICIAL);
  });

  it('falls back to the Desk grade when nothing is published', () => {
    expect(walletGrade({ official: null })).toEqual({ pct: 38, q: 'Q1' });
  });

  it('ignores an official grade from another quarter', () => {
    expect(walletGrade({ official: { ...OFFICIAL, quarter: 'Q2' } })).toEqual({ pct: 38, q: 'Q1' });
    // Re-pinned 2026-11-07: also with the per-quarter cache holding only other quarters.
    expect(walletGrade({ official: { ...OFFICIAL, quarter: 'Q2' }, byQuarter: { Q2: { ...OFFICIAL, quarter: 'Q2' } } }))
      .toEqual({ pct: 38, q: 'Q1' });
  });

  it('per-quarter cache (QUARTER_LINE §3.1): the shown quarter\'s own official grade, even when the Do Now\'s current pill is another quarter', () => {
    // Sunday 11/8: the Do Now's current pill is Quarter 2 (no grade yet), so the single slot holds
    // Q2's (empty) official while this card shows Quarter 1; the per-quarter cache answers for Q1.
    const g = walletGrade({ official: null, byQuarter: { Q1: OFFICIAL, Q2: null } });
    expect(g).toEqual({ pct: 68.7, q: 'Q1', official: OFFICIAL, estimate: 38 });
    // The single slot still wins for its own quarter (the same object in a real page).
    const own = { ...OFFICIAL, grade: 70.1 };
    expect(walletGrade({ official: own, byQuarter: { Q1: OFFICIAL } }).pct).toBe(70.1);
  });

  it('Finding R6b: never the official grade of a quarter that has not started, even a cached one', () => {
    const sunday = (q) => (q === 'Q2' ? 'starts Mon Nov 9' : '');   // Sun Nov 8: Quarter 2 starts Monday
    const early = { ...OFFICIAL, quarter: 'Q2', grade: 80 };
    // No quarter with a grade yet: no number at all, never Quarter 2's early 80.
    expect(walletGrade({ official: early, quarter: null, quarterGrade: null, startsText: sunday })).toEqual({ pct: null, q: null });
    // The quarter shown (Quarter 1, started) keeps its own official.
    expect(walletGrade({ official: early, byQuarter: { Q1: OFFICIAL, Q2: early }, startsText: sunday }))
      .toEqual({ pct: 68.7, q: 'Q1', official: OFFICIAL, estimate: 38 });
    // Monday: Quarter 2 has started, so its official leads as before.
    expect(walletGrade({ official: early, quarter: 'Q2', startsText: () => '' })).toMatchObject({ pct: 80, q: 'Q2', official: early });
  });

  it('the card labels it and shows the estimate line', () => {
    const paint = fnSource('_walletPaint');
    expect(paint).toMatch(/grade\.official \? 'Official grade \(same as Schoology\)' : 'Grade'/);
    expect(paint).toMatch(/"Today's estimate: "/);
  });
});

describe('renderDoNowGrades wiring', () => {
  const body = fnSource('renderDoNowGrades');
  it('fetches the official grade and makes it the headline number', () => {
    expect(body).toMatch(/_fetchOfficialGrade\(baseUrl, token, curQ\)/);
    expect(body).toMatch(/if \(official\) gradeSpan\.textContent = String\(Math\.round\(official\.grade \* 10\) \/ 10\)/);
    expect(body).toMatch(/official \(same as Schoology\)/);
  });
  it('shows the live Desk grade as "Today\'s estimate" only when an official grade exists', () => {
    expect(body).toMatch(/if \(official\) host\.appendChild\(_trackChip\("Today's estimate", gradeRaw/);
    expect(body).toMatch(/else host\.appendChild\(_trackChip\('Schoology today'/);
  });
  it('Finding R6b: the official of a quarter that has not started is dropped before the pill or any cache reads it', () => {
    const drop = body.indexOf('if (startsText) official = null;');
    expect(body).toContain("var startsText = (sideQ && typeof _quarterStartsText === 'function') ? _quarterStartsText(curQ) : '';");
    expect(drop).toBeGreaterThan(body.indexOf('var official = officials[0];'));
    expect(drop).toBeLessThan(body.indexOf('_officialGradeCache = official;'));
    expect(drop).toBeLessThan(body.indexOf('_officialGradeByQuarter[curQ] = official;'));
    expect(drop).toBeLessThan(body.indexOf('if (official) gradeSpan.textContent'));
    // The starts rule, in the pill and in its tooltip; the readers skip a not-started official too.
    expect(body).toContain('} else if (startsText) {');
    expect(body).toContain("if (startsText && gradeRaw == null) pill.title = curQWords + ' ' + startsText + '. It has no grade until then. ' + pill.title;");
    expect(fnSource('_officialGradeFor')).toContain("if (typeof _quarterStartsText === 'function' && _quarterStartsText(q)) return null;");
    expect(fnSource('_walletCurrentGrade')).toContain("if (official && typeof _quarterStartsText === 'function' && _quarterStartsText(official.quarter)) official = null;");
  });
  it('one official per quarter (QUARTER_LINE §3.1): the closing / final pill fetches its own into the per-quarter cache', () => {
    // Re-pinned 2026-11-08 (review D3): both fetched at once; the ended quarter's through its per-day cache.
    expect(body).toContain('var officials = await Promise.all([');
    expect(body).toContain("(sideQ && typeof _fetchSideOfficialGrade === 'function') ? _fetchSideOfficialGrade(baseUrl, token, sideQ) : null,");
    expect(body).toContain('var sideOfficial = officials[1];');
    expect(fnSource('_fetchSideOfficialGrade')).toContain('_fetchOfficialGrade(baseUrl, token, quarter)');
    expect(body).toContain('_officialGradeByQuarter = {};');
    expect(body).toContain('_officialGradeByQuarter[curQ] = official;');
    expect(body).toContain('if (sideQ) _officialGradeByQuarter[sideQ] = sideOfficial;');
    // The single slot stays the CURRENT pill's official (never the side quarter's).
    expect(body).toContain('if (typeof _officialGradeCache !== \'undefined\') _officialGradeCache = official;');
    expect(body).not.toMatch(/_officialGradeCache = sideOfficial/);
  });
});
