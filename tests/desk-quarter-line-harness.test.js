// @vitest-environment node
// tests/desk-quarter-line-harness.test.js — QUARTER_LINE_BY_DUE_DATE_SPEC.md §3 / §6 acceptance, on the
// REAL Desk (System 7 and the Pico home) booted in JSDOM with a /grade payload carrying the new
// server fields: two pills by role, grouped rows (each once) with Pico ↔ System 7 parity, the
// calendar band + marks, the Pico week badge, the one-time notice, the "final" week after the
// close, and the degrade path (an older payload keeps today's single-quarter view).
import { describe, it, expect } from 'vitest';
import { bootDesk, budget, DESK_URL } from './journeys/harness.js';

const P = (b, e) => ({ B: b, E: e, X: b });
const LESSONS = () => [
  { lessonKey: '2.1', unit: 2, worksheetKey: '1', due: P('2026-10-19', '2026-10-23'), zeroDate: P('2026-11-01', '2026-11-05'),
    quarter: P('Q1', 'Q1'), liftQuarter: P(null, null), lessonGradeNoQuiz: null, Cws: null, quizTotal: 0, Q: null },
  { lessonKey: '4.1', unit: 4, worksheetKey: '1-2', due: P('2026-10-23', '2026-10-26'), zeroDate: P('2026-11-05', '2026-11-08'),
    quarter: P('Q1', 'Q2'), liftQuarter: P(null, 'Q1'), lessonGradeNoQuiz: 90, Cws: 90, quizTotal: 0, Q: null, hasBlooket: true, blooket: null },
  { lessonKey: '4.2', unit: 4, worksheetKey: '1-2', due: P('2026-10-26', '2026-10-28'), zeroDate: P('2026-11-08', '2026-11-10'),
    quarter: P('Q2', 'Q2'), liftQuarter: P('Q1', 'Q1'), lessonGradeNoQuiz: 90, Cws: 90, quizTotal: 3, Q: null, hasBlooket: true, blooket: null },
  { lessonKey: '4.3', unit: 4, worksheetKey: '3-4-5', due: P('2026-10-27', '2026-10-28'), zeroDate: P('2026-11-09', '2026-11-10'),
    quarter: P('Q2', 'Q2'), liftQuarter: P('Q1', 'Q1'), lessonGradeNoQuiz: null, Cws: null, quizTotal: 0, Q: null },
  { lessonKey: '4.6', unit: 4, worksheetKey: '6', due: P('2026-11-05', '2026-11-06'), zeroDate: P('2026-11-18', '2026-11-19'),
    quarter: P('Q2', 'Q2'), liftQuarter: P('Q1', 'Q1'), lessonGradeNoQuiz: null, Cws: null, quizTotal: 0, Q: null },
];
const CONFIG = { Q1: { start: '2026-09-02', end: '2026-11-06', close: '2026-11-12', finalUntil: '2026-11-19' },
  Q2: { start: '2026-11-09', end: '2027-01-22' }, Q3: { start: '2027-01-25', end: '2027-04-14' }, Q4: { start: '2027-04-15', end: '2027-06-17' } };
const OLD_CONFIG = Object.fromEntries(Object.entries(CONFIG).map(([q, { start, end }]) => [q, { start, end }]));
const OFFICIAL_Q1 = { quarter: 'Q1', grade: 92.4, asOf: '2026-11-09T02:00:00.000Z', parts: { work: 92.4, rule: 'work' } };

function payload({ closed = null, old = false } = {}) {
  const lessons = old
    ? LESSONS().map(({ quarter, liftQuarter, ...rest }) => (rest.lessonKey >= '4.2' ? { ...rest, zeroDate: P(null, null), neverZero: P(true, true) } : rest))
    : LESSONS();
  return {
    ok: true, asOf: '2026-11-09T14:00:00.000Z', units: {}, completion: {}, gradebook: {}, lessons,
    config: { quarters: old ? OLD_CONFIG : CONFIG },
    quarters: {
      Q1: { quarterGrade: 91.6, pcAvg: 80, workAvg: 91.6, lessonsDue: 27, lessonsGraded: 25, lessonsTotal: 27, closed },
      Q2: { quarterGrade: 84.6, pcAvg: null, workAvg: 84.6, lessonsDue: 2, lessonsGraded: 1, lessonsTotal: 34, closed: null },
      Q3: { quarterGrade: null }, Q4: { quarterGrade: null },
    },
  };
}

const USERS = [{ studentId: 'stu-alpha', username: 'alpha_otter', realName: 'Alpha Otter', section: 'PeriodB', role: 'student', password: '1234' }];
const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim();

// officials: the official grade GET /official-grade publishes per quarter (Quarter 1 only by default).
async function boot({ now = '2026-11-09T14:00:00.000Z', park = false, grade = payload(), officials = { Q1: OFFICIAL_Q1 } } = {}) {
  const harness = await bootDesk({
    now,
    url: DESK_URL + (park ? '?home=park' : ''),
    roster: {
      users: USERS,
      grades: grade,
      routes: {
        'GET /official-grade': (request) => {
          const q = new URL(request.url).searchParams.get('quarter');
          return { ok: true, official: officials[q] || null };
        },
      },
    },
  });
  await harness.signIn('alpha_otter');
  const doc = harness.document;
  const dialog = doc.getElementById('dialog-overlay');
  if (dialog && dialog.style.display !== 'none') doc.getElementById('dialog-btn').click();
  if (typeof harness.window.closeNameFinder === 'function') harness.window.closeNameFinder();
  if (typeof harness.window._closeRosterDropdown === 'function') harness.window._closeRosterDropdown();
  await harness.waitFor(() => doc.querySelector('#donow-grades .qpill[data-role="current"] .qgrade'),
    { timeoutMs: 8000, message: 'the current-quarter pill never rendered' });
  harness.window._snapFetchAssignments = () => null;   // no class picture: rows stay as built
  harness.window._walletFetchBonusReceipts = async () => [];
  return harness;
}

async function openLedger(harness, selector) {
  harness.window.openWallet();
  let last = '';
  await harness.waitFor(async () => {
    await new Promise((r) => setTimeout(r, 120));
    const now = [...harness.document.querySelectorAll(selector)].map((n) => n.textContent).join('|');
    const stable = now.length > 0 && now === last;
    last = now;
    return stable;
  }, { timeoutMs: 8000, message: 'the ledger never settled' });
}

const pillText = (pill) => [...pill.children].map((c) => norm(c.textContent)).join(' ');
function rowFacts(row) {
  const pick = (sel) => (row.querySelector(sel) ? norm(row.querySelector(sel).textContent) : null);
  return { key: row.getAttribute('data-key'), when: pick('.wz-when'), schoology: pick('.wz-sgy'), lift: pick('.wz-lift') };
}

describe('quarter line on the real Desk (Mon Nov 9, Period B)', { timeout: budget(120_000) }, () => {
  it('System 7: two pills by role, the per-quarter missing pill, the calendar band + mark, the grouped ledger, the notice', async () => {
    const harness = await boot();
    try {
      const doc = harness.document;
      const pills = [...doc.querySelectorAll('#donow-grades .qpill:not(.qpill-missing)')];
      expect(pills.map((p) => p.dataset.role)).toEqual(['closing', 'current']);
      expect(pills.map((p) => p.dataset.quarter)).toEqual(['Q1', 'Q2']);
      expect(pillText(pills[0])).toBe('Quarter 1 92.4 official · closes Thu Nov 12');
      expect(norm(pills[1].querySelector('.qkey').textContent)).toBe('Quarter 2');
      expect(norm(pills[1].querySelector('.qgrade').textContent)).toBe('85');
      const missing = doc.querySelector('#donow-grades .qpill-missing');
      expect(missing.previousElementSibling).toBe(pills[1]);
      expect(missing.textContent).toBe('Quarter 1: 2 are 0s now, fix by Thu 11/12 · Quarter 2: 2 are 0s now · 1 more by Mon 11/9');
      // The calendar: Quarter 2's band names the close; Thu 11/12 carries its mark.
      // (A student who is behind opens on the overdue week; Today shows this week.)
      harness.window.calToday();
      const bands = [...doc.querySelectorAll('#cg .cal-qband')].map((b) => norm(b.textContent));
      expect(bands).toContain('Quarter 2 (Nov 9 – Jan 22) · Quarter 1 closes Thu Nov 12');
      const marks = [...doc.querySelectorAll('#cg .cal-qmark')].map((m) => m.textContent);
      expect(marks).toContain('Quarter 1 closes');
      // The one-time notice (its 0 dates: Sun 11/8 and today).
      const notice = doc.getElementById('donow-notice');
      expect(notice.style.display).toBe('flex');
      expect(norm(notice.querySelector('.donow-notice-text').textContent))
        .toBe('Quarter 1 ended Friday. 2.3 Day 2 (0 date Sun 11/8) and 2.4 (0 date today) count for Quarter 2; finish them to clear them.');
      // My Ledger: each row once, under its quarter; Quarter 1 in its own line on the balance card.
      await openLedger(harness, '#wallet-content .wallet-zero-card .wz-row');
      const card = doc.querySelector('#wallet-content .wallet-zero-card');
      expect([...card.querySelectorAll('.wz-quarter-head')].map((h) => norm(h.textContent)))
        .toEqual(['Quarter 1 (closes Thu Nov 12)', 'Quarter 2 (0 dates after Fri Nov 6)']);
      const keys = [...card.querySelectorAll('.wz-row')].map((r) => r.dataset.key);
      expect(keys).toEqual(['2.1:worksheet', '4.1:blooket', '4.2:quiz', '4.2:blooket', '4.3:worksheet', '4.6:worksheet:later']);
      expect(norm(card.querySelector('.wz-status').textContent)).toMatch(/^Quarter 1 so far: 92\.4% \(closes Thu Nov 12\)\. .* Quarter 2 so far: 85%\. /);
      expect(norm(doc.querySelector('#wallet-content .wallet-grade-other').textContent))
        .toBe('Quarter 1: 92.4% official · closes Thu Nov 12. Its 0s can still be fixed until then.');
    } finally {
      harness.teardown();
    }
  });

  it('D3: the ended quarter’s official is fetched once per school day; every re-render asks only for the current one', async () => {
    const harness = await boot();
    try {
      const asked = (q) => harness.requests.filter((r) => r.url.includes('/official-grade?quarter=' + q)).length;
      const bootQ1 = asked('Q1');
      const bootQ2 = asked('Q2');
      expect(bootQ1).toBeGreaterThanOrEqual(1);
      const token = harness.window.rosterClient.token();
      for (let i = 0; i < 3; i++) await harness.window.renderDoNowGrades(harness.window.ROSTER_SERVICE_URL, token);
      await harness.flush(8);   // let each render's fire-and-forget bonus line land before teardown
      expect(asked('Q2')).toBe(bootQ2 + 3);   // the current quarter: once per render
      expect(asked('Q1')).toBe(bootQ1);       // the ended quarter: the per-day cache answers
      expect(asked('Q1')).toBe(1);            // boot + 3 re-renders: once in all (4 times before the fix)
      const pills = [...harness.document.querySelectorAll('#donow-grades .qpill:not(.qpill-missing)')];
      expect(pills.map((p) => p.dataset.role)).toEqual(['closing', 'current']);
      expect(pillText(pills[0])).toBe('Quarter 1 92.4 official · closes Thu Nov 12');   // the cached official still leads
    } finally {
      harness.teardown();
    }
  });

  it('Pico: the sign reads the pills by role, shows the notice and the week badge; My Grade buckets match System 7 row for row', async () => {
    const classic = await boot();
    let s7;
    try {
      await openLedger(classic, '#wallet-content .wallet-zero-card .wz-row');
      const card = classic.document.querySelector('#wallet-content .wallet-zero-card');
      s7 = { rows: [...card.querySelectorAll('.wz-row')].map(rowFacts), status: norm(card.querySelector('.wz-status').textContent) };
    } finally {
      classic.teardown();
    }
    const harness = await boot({ park: true });
    try {
      const doc = harness.document;
      await harness.waitFor(() => doc.querySelector('#pico-sign .grade-side'), { timeoutMs: 8000, message: 'the sign never showed Quarter 1' });
      const sign = doc.getElementById('pico-sign');
      expect(norm(sign.querySelector('.grade-num').textContent)).toBe('85');
      expect(norm(sign.querySelector('.grade-cap').textContent)).toBe('Quarter 2');
      expect(norm(sign.querySelector('.grade-side').textContent)).toBe('Quarter 1 92.4 · official · closes Thu Nov 12');
      expect(norm(sign.querySelector('.sign-notice span').textContent)).toMatch(/^Quarter 1 ended Friday\. 2\.3 Day 2/);
      expect(norm(doc.getElementById('pico-quarter').textContent)).toBe('Q2 · Q1 CLOSES THU');
      expect(doc.getElementById('pico-quarter').hidden).toBe(false);
      expect(norm(doc.getElementById('pico-week-title').textContent)).toBe('WEEK OF NOV 9');   // untouched
      await openLedger(harness, '#pico-ledger-zero .pl-tile');
      const tiles = [...doc.querySelectorAll('#pico-ledger-zero .pl-tile:not(.wz-done)')];
      expect(tiles.map(rowFacts)).toEqual(s7.rows);
      expect(norm(doc.getElementById('pico-ledger-status').textContent)).toBe(s7.status);
      const heads = (bucket) => [...doc.querySelectorAll('#pico-ledger-zero .pl-quarter-head[data-bucket="' + bucket + '"]')].map((h) => norm(h.textContent));
      expect(heads('zeroed')).toEqual(['Quarter 1 (closes Thu Nov 12)', 'Quarter 2 (0 dates after Fri Nov 6)']);
      expect(heads('soon')).toEqual(['Quarter 2 (0 dates after Fri Nov 6)']);
      expect(heads('notyet')).toEqual(['Quarter 2 (0 dates after Fri Nov 6)']);
      expect(doc.querySelector('#pico-ledger-zero .wz-quarter-head')).toBeNull();   // Pico's own heading class
      expect(norm(doc.querySelector('#pico-ledger-balance .wallet-grade-other').textContent))
        .toBe('Quarter 1: 92.4% official · closes Thu Nov 12. Its 0s can still be fixed until then.');
      // Dismissing on the sign dismisses the Desk's notice too.
      sign.querySelector('.sign-notice button').click();
      await harness.waitFor(() => !doc.querySelector('#pico-sign .sign-notice'), { timeoutMs: 4000, message: 'the notice stayed on the sign' });
      expect(doc.getElementById('donow-notice').style.display).toBe('none');
    } finally {
      harness.teardown();
    }
  });
});

describe('the week after the close (Fri Nov 13) and the degrade path', { timeout: budget(120_000) }, () => {
  it('Fri Nov 13: "Quarter 1 final", Quarter 1 rows gone from the Do Now and the ledger, the final line stays', async () => {
    const harness = await boot({ now: '2026-11-13T14:00:00.000Z', grade: payload({ closed: { grade: 92, at: '2026-11-12T22:00:00Z', bonusApplied: null } }) });
    try {
      const doc = harness.document;
      const pills = [...doc.querySelectorAll('#donow-grades .qpill:not(.qpill-missing)')];
      expect(pills.map((p) => p.dataset.role)).toEqual(['final', 'current']);
      expect(pillText(pills[0])).toBe('Quarter 1 final 92.4');   // never below the official grade
      const missing = doc.querySelector('#donow-grades .qpill-missing');
      expect(missing.textContent).not.toMatch(/Quarter 1/);
      expect(missing.textContent).toBe('3 are 0s now');
      expect(doc.getElementById('donow-notice').style.display).toBe('none');
      harness.window.calToday();
      expect([...doc.querySelectorAll('#cg .cal-qband')].map((b) => b.textContent).join('|')).not.toContain('closes');
      await openLedger(harness, '#wallet-content .wallet-zero-card .wz-row');
      const card = doc.querySelector('#wallet-content .wallet-zero-card');
      expect([...card.querySelectorAll('.wz-row')].map((r) => r.dataset.key)).not.toContain('2.1:worksheet');
      expect(card.querySelector('.wz-quarter-head')).toBeNull();
      expect(norm(doc.querySelector('#wallet-content .wallet-grade-other').textContent)).toBe('Quarter 1 final: 92.4%');
    } finally {
      harness.teardown();
    }
  });

  it('D8: Thu Nov 12 with the close already reported: "final" at once, Quarter 1 rows gone, the band stops saying "closes"', async () => {
    const harness = await boot({ now: '2026-11-12T14:00:00.000Z', grade: payload({ closed: { grade: 92, at: '2026-11-12T13:00:00Z', bonusApplied: null } }) });
    try {
      const doc = harness.document;
      const pills = [...doc.querySelectorAll('#donow-grades .qpill:not(.qpill-missing)')];
      expect(pills.map((p) => p.dataset.role)).toEqual(['final', 'current']);
      expect(pillText(pills[0])).toBe('Quarter 1 final 92.4');   // never "closes Thu Nov 12" once it has closed
      expect(doc.querySelector('#donow-grades .qpill-missing').textContent).not.toMatch(/Quarter 1|fix by/);
      harness.window.calToday();
      expect([...doc.querySelectorAll('#cg .cal-qband')].map((b) => b.textContent).join('|')).not.toContain('closes');
      await openLedger(harness, '#wallet-content .wallet-zero-card .wz-row');
      const card = doc.querySelector('#wallet-content .wallet-zero-card');
      expect([...card.querySelectorAll('.wz-row')].map((r) => r.dataset.key)).not.toContain('2.1:worksheet');
      expect(card.querySelector('.wz-lift')).toBeNull();
      expect(norm(doc.querySelector('#wallet-content .wallet-grade-other').textContent)).toBe('Quarter 1 final: 92.4%');
    } finally {
      harness.teardown();
    }
  });

  it('Sun Nov 8 (Pico): Quarter 2 has no grade yet ("starts Mon Nov 9"), so the sign leads with Quarter 1', async () => {
    const grade = payload();
    grade.quarters.Q2 = { quarterGrade: null, lessonsDue: 0, lessonsGraded: 0, lessonsTotal: 34, closed: null };
    const harness = await boot({ now: '2026-11-08T17:00:00.000Z', park: true, grade });
    try {
      const doc = harness.document;
      const pills = [...doc.querySelectorAll('#donow-grades .qpill:not(.qpill-missing)')];
      expect(pills.map((p) => p.dataset.role)).toEqual(['closing', 'current']);
      expect(pillText(pills[1])).toBe('Quarter 2 — starts Mon Nov 9');
      expect(pills[1].classList.contains('empty')).toBe(true);
      await harness.waitFor(() => doc.querySelector('#pico-sign .grade-side'), { timeoutMs: 8000, message: 'the sign never showed both quarters' });
      const sign = doc.getElementById('pico-sign');
      expect(norm(sign.querySelector('.grade-num').textContent)).toBe('92.4');
      expect(norm(sign.querySelector('.grade-cap').textContent)).toBe('Quarter 1 official');
      expect(norm(sign.querySelector('.grade-side').textContent)).toBe('Quarter 2 · starts Mon Nov 9');
      expect(norm(doc.getElementById('pico-quarter').textContent)).toBe('Q1 ENDS FRI');   // the week of Nov 2
      // Review D9 (the engine reports Quarter 2 null before Mon Nov 9): no Quarter 2 number anywhere.
      // The balance card and the coach speak for Quarter 1 until Quarter 2 has a grade.
      expect(harness.window._walletCurrentQuarter().quarter).toBe('Q1');
      expect(harness.window._walletOtherQuarterLine('Q1')).toBe('Quarter 1 closes Thu Nov 12. Its 0s can still be fixed until then.');
      const coach = doc.querySelector('#donow-helper .wsl-btn');
      expect(coach).not.toBeNull();
      coach.click();
      expect(norm(doc.querySelector('#donow-helper .wsl-head').textContent)).toBe('Your Quarter 1 grade is 91.6%.');
      expect(norm(doc.getElementById('donow-grades').textContent)).not.toMatch(/Quarter 2 \d/);
      expect(norm(sign.querySelector('.sign-notice span').textContent))
        .toBe('Quarter 1 ended Friday. 2.3 Day 2 (0 date today) and 2.4 (0 date Mon 11/9) count for Quarter 2; finish them to clear them.');
    } finally {
      harness.teardown();
    }
  });

  it('an older payload (no close dates, no quarter fields): one pill keyed "Q2", one plain list, no notice', async () => {
    const harness = await boot({ grade: payload({ old: true }) });
    try {
      const doc = harness.document;
      const pills = [...doc.querySelectorAll('#donow-grades .qpill:not(.qpill-missing)')];
      expect(pills).toHaveLength(1);
      expect(pills[0].dataset.role).toBe('current');
      expect(norm(pills[0].querySelector('.qkey').textContent)).toBe('Q2');
      expect(doc.querySelector('#donow-grades .qpill-missing').textContent).toBe('2 are 0s now');
      expect(doc.getElementById('donow-notice').style.display).toBe('none');
      await openLedger(harness, '#wallet-content .wallet-zero-card .wz-row');
      const card = doc.querySelector('#wallet-content .wallet-zero-card');
      expect(card.querySelector('.wz-quarter-head')).toBeNull();
      expect([...card.querySelectorAll('.wz-later-head')].map((h) => norm(h.textContent))).toEqual(['Late — never a 0']);
      expect(doc.querySelector('#wallet-content .wallet-grade-other')).toBeNull();
    } finally {
      harness.teardown();
    }
  });
});

// Finding R6b (Codex re-review, finding 6): a nightly pass can publish a Quarter 2 official on the Sunday
// before Quarter 2 starts. A quarter that has not started still shows "starts Mon Nov 9" and no number;
// once it starts, the official leads exactly as before.
const OFFICIAL_Q2 = { quarter: 'Q2', grade: 80, asOf: '2026-11-08T21:50:00.000Z', parts: { work: 80, rule: 'work' } };

describe('Finding R6b: a Quarter 2 official published before Quarter 2 starts', { timeout: budget(120_000) }, () => {
  it('Sun Nov 8 (Pico): the pill reads "starts Mon Nov 9" with no number and nothing keeps the 80; Quarter 1 leads as before', async () => {
    const grade = payload();
    grade.quarters.Q2 = { quarterGrade: null, lessonsDue: 0, lessonsGraded: 0, lessonsTotal: 34, closed: null };
    const harness = await boot({ now: '2026-11-08T17:00:00.000Z', park: true, grade, officials: { Q1: OFFICIAL_Q1, Q2: OFFICIAL_Q2 } });
    try {
      const doc = harness.document;
      const win = harness.window;
      // The fetch is unchanged: Quarter 2's official is still asked for, then set aside.
      expect(harness.requests.some((r) => r.url.includes('/official-grade?quarter=Q2'))).toBe(true);
      const pills = [...doc.querySelectorAll('#donow-grades .qpill:not(.qpill-missing)')];
      expect(pills.map((p) => p.dataset.role)).toEqual(['closing', 'current']);
      expect(pillText(pills[0])).toBe('Quarter 1 92.4 official \u00b7 closes Thu Nov 12');   // Quarter 1 unaffected
      expect(pillText(pills[1])).toBe('Quarter 2 \u2014 starts Mon Nov 9');
      expect(pills[1].classList.contains('empty')).toBe(true);
      expect(pills[1].title).toMatch(/^Quarter 2 starts Mon Nov 9\. It has no grade until then\. Quarter 2 covers /);
      expect(pills[1].title).not.toMatch(/Official|Schoology shows/);
      expect(norm(doc.getElementById('donow-grades').textContent)).not.toMatch(/Quarter 2 \d|official \(same as Schoology\)|Today's estimate/);
      // Nothing keeps it: the balance card, My Ledger's lead and Pico read these.
      expect(win._officialGradeCache).toBeNull();
      expect(win._officialGradeByQuarter.Q2).toBeNull();
      expect(win._walletQuarterGrade('Q2').pct).toBeNull();
      expect(win._walletCurrentGrade()).toMatchObject({ pct: 92.4, q: 'Q1' });
      // Pico copies the pills: the sign leads with Quarter 1 and adds Quarter 2's start.
      await harness.waitFor(() => doc.querySelector('#pico-sign .grade-side'), { timeoutMs: 8000, message: 'the sign never showed both quarters' });
      const sign = doc.getElementById('pico-sign');
      expect(norm(sign.querySelector('.grade-num').textContent)).toBe('92.4');
      expect(norm(sign.querySelector('.grade-cap').textContent)).toBe('Quarter 1 official');
      expect(norm(sign.querySelector('.grade-side').textContent)).toBe('Quarter 2 \u00b7 starts Mon Nov 9');
    } finally {
      harness.teardown();
    }
  });

  it('Mon Nov 9 (Pico): Quarter 2 has started, so the same 80 leads with "official (same as Schoology)"; Quarter 1 unchanged', async () => {
    const harness = await boot({ park: true, officials: { Q1: OFFICIAL_Q1, Q2: OFFICIAL_Q2 } });
    try {
      const doc = harness.document;
      const pills = [...doc.querySelectorAll('#donow-grades .qpill:not(.qpill-missing)')];
      expect(pills.map((p) => p.dataset.role)).toEqual(['closing', 'current']);
      expect(pillText(pills[0])).toBe('Quarter 1 92.4 official \u00b7 closes Thu Nov 12');
      expect(pillText(pills[1])).toBe('Quarter 2 80 official (same as Schoology)');
      expect(pills[1].title).toMatch(/^Official Quarter 2 grade/);
      expect(harness.window._officialGradeCache).toMatchObject({ quarter: 'Q2', grade: 80 });
      const chips = [...doc.querySelectorAll('#donow-grades > .qtrack')].map((c) => norm(c.textContent));
      expect(chips).toContain("Today's estimate 84.6%");
      await harness.waitFor(() => doc.querySelector('#pico-sign .grade-side'), { timeoutMs: 8000, message: 'the sign never showed both quarters' });
      const sign = doc.getElementById('pico-sign');
      expect(norm(sign.querySelector('.grade-num').textContent)).toBe('80');
      expect(norm(sign.querySelector('.grade-cap').textContent)).toBe('Quarter 2 official');
      expect(norm(sign.querySelector('.grade-side').textContent)).toBe('Quarter 1 92.4 \u00b7 official \u00b7 closes Thu Nov 12');
    } finally {
      harness.teardown();
    }
  });
});
