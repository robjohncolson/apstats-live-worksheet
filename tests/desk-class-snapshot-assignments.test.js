// tests/desk-class-snapshot-assignments.test.js — CLASS_SNAPSHOT_SPEC.md Phase 2 (teacher
// 2026-09-26): "a box plot for each assignment; the student that has a zero should see the entire
// data set — no names, just the numbers." Desk side of the feature (lib + app Assignments view).
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { createContext, runInContext } from 'node:vm';

const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'ap_stats_roadmap_square_mode.html'), 'utf8');
function fnSrc(name) {
  const m = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(html);
  if (!m) throw new Error('missing ' + name);
  let depth = 0;
  for (let i = html.indexOf('{', m.index); i < html.length; i++) {
    if (html[i] === '{') depth++;
    if (html[i] === '}' && --depth === 0) return html.slice(m.index, i + 1);
  }
  throw new Error('unbalanced ' + name);
}
let C;
beforeAll(async () => { await import('../lib/class-snapshot.js'); C = globalThis.ClassSnapshot; });

const A12 = { key: '1.2:worksheet', lessonKey: '1.2', track: 'worksheet', title: '1.2 Follow-Along', zeroDate: '2026-09-23', n: 15,
  values: [0, 0, 0, 85, 88, 91, 95, 97, 100, 100, 100, 100, 100, 100, 100], zeros: 3 };
const Q13 = { key: '1.3:quiz', lessonKey: '1.3', track: 'quiz', title: '1.3 Quiz', zeroDate: '2026-09-24', n: 15,
  values: [0, 0, 67, 67, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100], zeros: 2 };
const B11 = { key: '1.1:blooket', lessonKey: '1.1', track: 'blooket', title: '1.1 Blooket', zeroDate: '2026-09-21', n: 15,
  values: [0, 80, 85, 90, 90, 95, 97, 98, 100, 100, 100, 100, 100, 100, 100], zeros: 1 };

describe('lib — assignment caption + mini box plot', () => {
  it('captions a zero as below Q1 and an outlier, and omits the "You" sentence for the teacher view', () => {
    expect(C.assignmentCaption(A12, 0)).toBe('Median 97 · IQR 15 · 3 zeros. You: 0 — below Q1 — an outlier by the 1.5×IQR rule.');
    expect(C.assignmentCaption(A12, null)).toContain('You: 0');            // missing reads as 0
    expect(C.assignmentCaption(A12)).toBe('Median 97 · IQR 15 · 3 zeros.');
    expect(C.assignmentCaption({ values: [], zeros: null })).toBe('Not enough classmates yet.');
  });
  it('drawMini draws the box, marks outliers, and a red dot for "you"; tolerates a missing context', () => {
    const calls = [];
    const ctx = new Proxy({ font: '', fillStyle: '', strokeStyle: '', lineWidth: 1 }, {
      get(t, k) { if (k in t) return t[k]; return (...a) => { calls.push([k, ...a]); }; },
      set(t, k, v) { t[k] = v; return true; },
    });
    C.drawMini({ width: 300, height: 26, getContext: () => ctx }, { values: A12.values, own: 0 });
    const arcs = calls.filter(c => c[0] === 'arc');
    expect(arcs.length).toBe(4);                        // 3 outlier zeros + the red "you" dot
    expect(calls.some(c => c[0] === 'fillRect')).toBe(true);
    expect(() => C.drawMini({ width: 10, height: 10, getContext: () => null }, { values: A12.values })).not.toThrow();
  });
});

function sandbox({ teacher = false, lessons, pick = null, roster = null, status = 200 } = {}) {
  const dom = new JSDOM('<div id="snapshot-content"></div>', { url: 'https://robjohncolson.github.io/apstats-live-worksheet/' });
  dom.window.rosterClient = { current: () => ({ section: 'PeriodB' }), token: () => 'tok' };
  const calls = [];
  const s = {
    document: dom.window.document, window: dom.window, console, Date, Promise, encodeURIComponent, calls,
    ClassSnapshot: C,
    _deskIsTeacher: () => teacher,
    _reviewCfg: () => ({ token: 'tok', base: 'https://roster.test' }),
    _gradeLessonsCache: lessons || [
      { lessonKey: '1.1', hasBlooket: true, blooket: null, lessonGradeNoQuiz: 101.7, Cws: 100, quizTotal: 0, Q: null },
      { lessonKey: '1.2', hasBlooket: true, blooket: 97.6, lessonGradeNoQuiz: null, Cws: null, quizTotal: 3, Q: 100 },
      { lessonKey: '1.3', hasBlooket: true, blooket: 80, lessonGradeNoQuiz: 100, Cws: 100, quizTotal: 3, Q: 67 },
    ],
    _zeroTodayIso: () => '2026-09-26',
    fetch: async (url) => { calls.push(url); return { status, json: async () => ({ ok: true, section: 'PeriodB', assignments: [A12, Q13, B11] }) }; },
    openSnapshot() { s.opened = (s.opened || 0) + 1; },
  };
  createContext(s);
  runInContext(
    "var SNAPSHOT_TTL_MS = 300000;\nvar _snapApp = { mode: null, sections: {}, roster: " + JSON.stringify(roster) + ", pick: " + JSON.stringify(pick ? { PeriodB: pick } : {}) + ", request: 0, view: 'assignments', assign: {}, focusKey: null };\nvar SNAP_TRACK_LABEL = { worksheet: 'worksheet', quiz: 'quiz', blooket: 'flashcards' };\n" +
    ['_snapSection', '_snapOwnAssignmentScore', '_snapFetchAssignments', '_snapZeroDateText', '_snapAssignmentRow', '_renderAssignmentsView', '_snapTeacherPickedName', '_snapTeacherPickedLessons', '_snapOpenAssignment']
      .map(fnSrc).join('\n'), s);
  return { s, host: () => dom.window.document.getElementById('snapshot-content'), close: () => dom.window.close() };
}
const tick = () => new Promise(r => setTimeout(r, 0));

describe('Assignments view — student', () => {
  it('fetches by=assignment for the student\'s section, lists due items newest first, and opens the full data set only where the student has a 0 or nothing', async () => {
    const { s, host, close } = sandbox();
    try {
      s._renderAssignmentsView(host(), false);
      await tick(); await tick();
      expect(s.calls).toEqual(['https://roster.test/class/snapshot?section=PeriodB&by=assignment']);
      const rows = [...host().querySelectorAll('.snap-arow')];
      expect(rows.map(r => r.dataset.key)).toEqual(['1.3:quiz', '1.2:worksheet', '1.1:blooket']);   // newest zero date first
      // 1.2 worksheet: student never opened it → list open, one red zero, caption says You: 0
      const ws = rows[1];
      expect(ws.querySelector('.snap-alist').hidden).toBe(false);
      expect(ws.querySelector('.snap-alist-lead').textContent).toBe('All 15 scores for 1.2 Follow-Along:');
      expect([...ws.querySelectorAll('.snap-alist-seq span')].map(x => x.textContent).join(' ')).toBe('0 0 0 85 88 91 95 97 100 100 100 100 100 100 100');
      expect(ws.querySelectorAll('.snap-alist-you').length).toBe(1);
      expect(ws.querySelector('.snap-alist-foot').textContent).toBe('12 of 15 classmates have a score here. Every 0 on this list can still be replaced.');
      expect(ws.querySelector('.snap-caption').textContent).toContain('You: 0 — below Q1 — an outlier by the 1.5×IQR rule.');
      // 1.1 Blooket: never played → also open
      expect(rows[2].querySelector('.snap-alist').hidden).toBe(false);
      // 1.3 quiz: scored 67 → collapsed, with a toggle; caption uses the real score
      const qz = rows[0];
      expect(qz.querySelector('.snap-alist').hidden).toBe(true);
      expect(qz.querySelector('.snap-caption').textContent).toContain('You: 67');
      qz.querySelector('.snap-alist-toggle').onclick();
      expect(qz.querySelector('.snap-alist').hidden).toBe(false);
      // never a name anywhere
      expect(host().textContent).not.toMatch(/Allison|Jesselly|kiwi_toad/);
    } finally { close(); }
  });
  it('says the picture is unavailable on a server error and does not throw', async () => {
    const { s, host, close } = sandbox({ status: 503 });
    try {
      s._renderAssignmentsView(host(), false);
      await tick(); await tick();
      expect(host().textContent).toContain('Assignment picture unavailable right now.');
    } finally { close(); }
  });
});

describe('Assignments view — teacher', () => {
  const ROSTER = [
    { username: 'cherry_seal', realName: 'Allison R', section: 'PeriodB', role: 'student', lessons: [
      { lessonKey: '1.2', lessonGradeNoQuiz: null, Cws: null, quizTotal: 3, Q: null, hasBlooket: true, blooket: null },
      { lessonKey: '1.3', lessonGradeNoQuiz: 100, Cws: 100, quizTotal: 3, Q: null, hasBlooket: true, blooket: null },
    ] },
  ];
  it('shows both sections with no dot and no "You" line until a student is picked; then the pick names the line and marks the zero', async () => {
    const none = sandbox({ teacher: true, roster: ROSTER });
    try {
      none.s._renderAssignmentsView(none.host(), true);
      await tick(); await tick();
      const cards = [...none.host().querySelectorAll('.wallet-snapshot-card')];
      expect(cards.map(c => c.dataset.section)).toEqual(['PeriodB', 'PeriodE']);
      const row = cards[0].querySelector('.snap-arow[data-key="1.2:worksheet"]');
      expect(row.querySelector('.snap-caption').textContent).toBe('Median 97 · IQR 15 · 3 zeros.');
      expect(row.querySelector('.snap-alist').hidden).toBe(true);
      expect(row.querySelectorAll('.snap-alist-you').length).toBe(0);
    } finally { none.close(); }
    const picked = sandbox({ teacher: true, roster: ROSTER, pick: 'cherry_seal' });
    try {
      picked.s._renderAssignmentsView(picked.host(), true);
      await tick(); await tick();
      const row = picked.host().querySelector('.wallet-snapshot-card[data-section="PeriodB"] .snap-arow[data-key="1.2:worksheet"]');
      expect(row.querySelector('.snap-caption').textContent).toContain('Allison R: 0 — below Q1');
      expect(row.querySelector('.snap-alist').hidden).toBe(false);
      expect(row.querySelectorAll('.snap-alist-you').length).toBe(1);
    } finally { picked.close(); }
  });
});

describe('wiring', () => {
  it('the Missing-work rows carry a "see the class" button that opens the app on that assignment, and the app has Class | Assignments tabs', () => {
    const { s, close } = sandbox();
    try {
      s._snapOpenAssignment('1.2', 'quiz');
      expect(s.opened).toBe(1);
      expect(s._snapApp.view).toBe('assignments');
      expect(s._snapApp.focusKey).toBe('1.2:quiz');
    } finally { close(); }
    expect(fnSrc('_walletPrependZeroCard')).toContain("see.textContent = 'see the class'");
    expect(fnSrc('_renderSnapshotApp')).toContain("[['class', 'Class'], ['assignments', 'Assignments']]");
    // bonus decks never appear in the missing list (review 2026-09-26)
    expect(fnSrc('_zeroWarnings')).toContain('!L.blooketBonus');
  });
});
