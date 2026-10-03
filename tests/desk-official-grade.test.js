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

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(repo, 'ap_stats_roadmap_square_mode.html'), 'utf8');

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
  runInNewContext(fnSource('_fetchOfficialGrade') + '\n' + fnSource('_officialGradeTitle') + '\nthis._f=_fetchOfficialGrade;this._t=_officialGradeTitle;', sandbox);
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
    expect(t).toMatch(/^Official Q1 grade/);
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
});
