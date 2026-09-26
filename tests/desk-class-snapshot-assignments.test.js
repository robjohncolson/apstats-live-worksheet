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
// Taught, not counting anywhere yet: recorded scores only, becomes a 0 after 9/27.
const W14 = { key: '1.4:worksheet', lessonKey: '1.4', track: 'worksheet', title: '1.4 Follow-Along', zeroDate: '2026-09-28', pending: true, n: 7,
  values: [88, 92, 95, 100, 100, 100, 102], zeros: 0 };

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
      { lessonKey: '1.5', due: { B: '2026-09-14', E: '2026-09-15' } },
      { lessonKey: '1.8', due: { B: '2026-09-30', E: '2026-10-01' } },
    ],
    _zeroTodayIso: () => '2026-09-26',
    cP: 'B',
    _renderSnapshotApp() { s.rerenders = (s.rerenders || 0) + 1; },
    fetch: async (url) => { calls.push(url); return { status, json: async () => ({ ok: true, section: 'all', sections: ['PeriodB', 'PeriodE'], assignments: [A12, Q13, B11, ...(s.withPending ? [W14] : [])] }) }; },
    openSnapshot() { s.opened = (s.opened || 0) + 1; },
    _zeroOpenLesson(k) { s.openedWork = ['worksheet', k]; }, _zeroOpenQuiz(k) { s.openedWork = ['quiz', k]; }, _zeroOpenFlashcards(_b, k) { s.openedWork = ['blooket', k]; },
  };
  createContext(s);
  runInContext(
    "var SNAPSHOT_TTL_MS = 300000;\nvar _snapApp = { mode: null, sections: {}, roster: " + JSON.stringify(roster) + ", pick: " + JSON.stringify(pick ? { PeriodB: pick } : {}) + ", request: 0, view: 'assignments', assign: {}, focusKey: null, amode: null, aidx: {}, aall: false };\nvar SNAP_TRACK_LABEL = { worksheet: 'worksheet', quiz: 'quiz', blooket: 'flashcards' };\n" +
    ['_snapSection', '_snapModes', '_snapAdvice', '_snapFocus', '_snapFocusIndex', '_snapPickedSection', '_snapOpenWork', '_snapOwnAssignmentScore', '_snapFetchAssignments', '_snapZeroDateText', '_snapAssignmentRow', '_renderAssignmentsView', '_snapTeacherPickedName', '_snapTeacherPickedLessons', '_snapOpenAssignment']
      .map(fnSrc).join('\n'), s);
  return { s, host: () => dom.window.document.getElementById('snapshot-content'), close: () => dom.window.close() };
}
const tick = () => new Promise(r => setTimeout(r, 0));

describe('Assignments view — student', () => {
  it('fetches the pooled by=assignment picture, focuses the most overdue 0, lists oldest first, and opens the full data set only where the student has a 0 or nothing', async () => {
    const { s, host, close } = sandbox();
    try {
      s._renderAssignmentsView(host(), false);
      await tick(); await tick();
      expect(s.calls).toEqual(['https://roster.test/class/snapshot?section=all&by=assignment']);
      // focused: the 0 that has been counting longest (1.1 Blooket), with a pager and advice
      expect([...host().querySelectorAll('.snap-arow')].map(r => r.dataset.key)).toEqual(['1.1:blooket']);
      expect(host().querySelector('.snap-pager-pos').textContent).toBe('1 of 3');
      expect(host().querySelector('.snap-advice').textContent).toContain('Do this next.');
      host().querySelector('.snap-advice-btn').onclick();
      expect(s.openedWork).toEqual(['blooket', '1.1']);
      host().querySelector('.snap-pager-all').onclick();
      expect(s._snapApp.aall).toBe(true);
      host().innerHTML = '';
      s._renderAssignmentsView(host(), false);
      await tick(); await tick();
      const rows = [...host().querySelectorAll('.snap-arow')];
      expect(rows.map(r => r.dataset.key)).toEqual(['1.1:blooket', '1.2:worksheet', '1.3:quiz']);   // oldest zero date first
      // 1.2 worksheet: student never opened it → list open, one red zero, caption says You: 0
      const ws = rows[1];   // 1.2 worksheet
      expect(ws.querySelector('.snap-alist').hidden).toBe(false);
      expect(ws.querySelector('.snap-alist-lead').textContent).toBe('All 15 scores for 1.2 Follow-Along:');
      expect([...ws.querySelectorAll('.snap-alist-seq span')].map(x => x.textContent).join(' ')).toBe('0 0 0 85 88 91 95 97 100 100 100 100 100 100 100');
      expect(ws.querySelectorAll('.snap-alist-you').length).toBe(1);
      expect(ws.querySelector('.snap-alist-foot').textContent).toBe('12 of 15 classmates have a score here. Every 0 on this list can still be replaced.');
      expect(ws.querySelector('.snap-caption').textContent).toContain('You: 0 — below Q1 — an outlier by the 1.5×IQR rule.');
      // 1.1 Blooket: never played → also open
      expect(rows[0].querySelector('.snap-alist').hidden).toBe(false);
      // 1.3 quiz: scored 67 → collapsed, with a toggle; caption uses the real score
      const qz = rows[2];
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
  it('shows ONE pooled card; the teacher\'s own dot until a student is picked (from either period); then the pick names the line and marks the zero', async () => {
    const none = sandbox({ teacher: true, roster: ROSTER });
    try {
      none.s._renderAssignmentsView(none.host(), true);
      await tick(); await tick();
      expect(none.s.calls).toEqual(['https://roster.test/class/snapshot?section=all&by=assignment']);
      const cards = [...none.host().querySelectorAll('.wallet-snapshot-card')];
      expect(cards.map(c => c.dataset.section)).toEqual(['all']);
      expect(cards[0].querySelector('h4')).toBeNull();
      // the teacher's own 0 counting longest (1.1 flashcards) is the focus, marked in red like a student's
      const own = cards[0].querySelector('.snap-arow');
      expect(own.dataset.key).toBe('1.1:blooket');
      expect(own.querySelector('.snap-caption').textContent).toContain('You: 0 — below Q1');
      expect(own.querySelector('.snap-alist').hidden).toBe(false);
      expect(none.s._snapPickedSection()).toBeNull();
    } finally { none.close(); }
    const picked = sandbox({ teacher: true, roster: ROSTER, pick: 'cherry_seal' });
    try {
      picked.s._snapApp.focusKey = '1.2:worksheet';
      picked.s._renderAssignmentsView(picked.host(), true);
      await tick(); await tick();
      expect(picked.s._snapPickedSection()).toBe('PeriodB');
      const row = picked.host().querySelector('.wallet-snapshot-card[data-section="all"] .snap-arow[data-key="1.2:worksheet"]');
      expect(row.querySelector('.snap-caption').textContent).toContain('Allison R: 0 — below Q1');
      expect(row.querySelector('.snap-alist').hidden).toBe(false);
      expect(row.querySelectorAll('.snap-alist-you').length).toBe(1);
      expect(row.querySelector('.snap-advice').textContent).toBe('Allison R has a 0 here — the worksheet was never turned in. Any score replaces it.');
      expect(row.querySelector('.snap-advice-btn')).toBeNull();
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

describe('Assignments view — forms', () => {
  it('offers the forms the section has learned (dot, stem, histogram before 1.8; stem default), sizes each row canvas for the form, and re-renders on a click', async () => {
    const { s, host, close } = sandbox();
    try {
      s._renderAssignmentsView(host(), false);
      await tick(); await tick();
      const bar = host().querySelector('.snap-amodes');
      expect([...bar.querySelectorAll('button')].map(b => b.textContent)).toEqual(['Dot plot', 'Stem-and-leaf', 'Histogram']);
      expect([...bar.querySelectorAll('button')].map(b => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
      const canvas = host().querySelector('.snap-arow canvas');
      expect(canvas.height).toBe(C.miniHeight('stem', B11.values));   // 1.1 Blooket is the focus
      bar.querySelectorAll('button')[2].onclick();
      expect(s._snapApp.amode).toBe('hist');
      expect(s.rerenders).toBe(1);
    } finally { close(); }
  });
  it('the teacher gets all four forms with the box plot as default', async () => {
    const { s, host, close } = sandbox({ teacher: true, roster: [] });
    try {
      s._renderAssignmentsView(host(), true);
      await tick(); await tick();
      expect([...host().querySelector('.snap-amodes').querySelectorAll('button')].map(b => b.textContent)).toEqual(['Dot plot', 'Stem-and-leaf', 'Histogram', 'Box plot']);
      expect(s._snapApp.amode).toBe('box');
      expect(host().querySelector('.snap-arow canvas').height).toBe(26);
    } finally { close(); }
  });
});

describe('Assignments view — focus and advice', () => {
  it('picks the viewer\'s 0 counting longest, else the score furthest below the median among those below Q1, else flags all clear on the newest', () => {
    const { s, close } = sandbox();
    try {
      const rows = [Q13, A12, B11];
      expect(s._snapFocusIndex(rows, [67, null, null], undefined)).toBe(2);        // 1.1 zeroDate is earliest
      expect(s._snapFocus(rows, [50, 100, 100], undefined)).toEqual({ index: 0, clear: false });   // 50 on Q13 is below its Q1 (67)
      expect(s._snapFocus(rows, [100, 100, 93], undefined)).toEqual({ index: 2, clear: true });    // 93 on B11 is inside the box → nothing to fix → newest (last row)
      expect(s._snapFocus(rows, [null, null, null], null)).toEqual({ index: 0, clear: false });    // nobody placed → most overdue
    } finally { close(); }
  });
  it('advises by position: below Q1 gets a fix with a button, inside the box and above Q3 get left alone', () => {
    const { s, close } = sandbox();
    try {
      expect(s._snapAdvice(A12, 50, undefined)).toEqual({ text: 'You have 50, below Q1 — three quarters of the class scored higher. Revise the worksheet — Check keeps your latest answer and AI grading only raises.', action: 'Open the worksheet', kind: 'worksheet' });
      expect(s._snapAdvice(Q13, 50, undefined).text).toBe('You have 50, below Q1 — three quarters of the class scored higher. Retake the quiz for a better score.');
      expect(s._snapAdvice(A12, 97, undefined).text).toBe('You have 97, inside the box — with the middle half of the class. Nothing to fix here.');
      expect(s._snapAdvice(B11, 100, undefined).text).toBe('You have 100, inside the box — with the middle half of the class. Nothing to fix here.');   // Q3 is 100
      expect(s._snapAdvice({ track: 'quiz', values: [0, 50, 60, 70, 80, 90, 95], zeros: 1 }, 100, undefined).text).toBe('You have 100, above Q3. Nothing to do here.');
      expect(s._snapAdvice(A12, 50, 'Allison R').action).toBeNull();
      expect(s._snapAdvice(A12, 0, null).text).toBe('3 of 15 count as a 0 here. Pick a student on the Class tab to place their dot.');
    } finally { close(); }
  });
  it('Prev/Next move the focus; "see the class" lands on that assignment', async () => {
    const { s, host, close } = sandbox({ lessons: [{ lessonKey: '1.1', hasBlooket: true, blooket: 100 }, { lessonKey: '1.2', lessonGradeNoQuiz: 100 }, { lessonKey: '1.3', quizTotal: 3, Q: 100 }] });
    try {
      s._renderAssignmentsView(host(), false);
      await tick(); await tick();
      // all clear → the newest (last) row is the focus
      expect(host().querySelector('.snap-pager-pos').textContent).toBe('3 of 3');
      expect(host().querySelectorAll('.snap-pager button')[1].disabled).toBe(true);   // Next on the last
      host().querySelectorAll('.snap-pager button')[0].onclick();                     // Prev
      expect(s._snapApp.aidx.all).toBe(1);
      expect(s.rerenders).toBe(1);
      s._snapApp.focusKey = '1.1:blooket';
      host().innerHTML = '';
      s._renderAssignmentsView(host(), false);
      await tick(); await tick();
      expect(host().querySelector('.snap-arow').dataset.key).toBe('1.1:blooket');
      expect(host().querySelector('.snap-arow').classList.contains('snap-arow-focus')).toBe(true);
      expect(s._snapApp.focusKey).toBeNull();
    } finally { close(); }
  });
});

describe('score list — the red mark is the viewer’s own score, never a borrowed classmate', () => {
  it('a teacher whose 0 is not in the pool gets an inserted red chip, in order, instead of a classmate’s 0', async () => {
    const { s, host, close } = sandbox({ teacher: true, roster: [], lessons: [{ lessonKey: '1.1', hasBlooket: true, blooket: null }] });
    try {
      s._renderAssignmentsView(host(), true);
      await tick(); await tick();
      const row = host().querySelector('.snap-arow[data-key="1.1:blooket"]');
      const chips = [...row.querySelectorAll('.snap-alist-seq span')];
      // B11 already holds a 0 → the teacher's 0 is marked in place, not inserted
      expect(chips.map(x => x.textContent).join(' ')).toBe('0 80 85 90 90 95 97 98 100 100 100 100 100 100 100');
      expect(row.querySelector('.snap-alist-added')).toBeNull();
      expect(row.querySelectorAll('.snap-alist-you').length).toBe(1);
    } finally { close(); }
  });
  it('a scored viewer absent from the pool (a picked student with a score nobody else has) is inserted in sorted order with "(you)"', async () => {
    const roster = [{ username: 'x', realName: 'Pat Q', section: 'PeriodB', role: 'student', lessons: [{ lessonKey: '1.1', hasBlooket: true, blooket: 93 }] }];
    const { s, host, close } = sandbox({ teacher: true, roster, pick: 'x' });
    try {
      s._snapApp.focusKey = '1.1:blooket';
      s._renderAssignmentsView(host(), true);
      await tick(); await tick();
      const row = host().querySelector('.snap-arow[data-key="1.1:blooket"]');
      row.querySelector('.snap-alist-toggle').onclick();
      const chips = [...row.querySelectorAll('.snap-alist-seq span')];
      expect(chips.map(x => x.textContent).join(' ')).toBe('0 80 85 90 90 93 95 97 98 100 100 100 100 100 100 100');
      const mine = row.querySelector('.snap-alist-you');
      expect(mine.textContent).toBe('93');
      expect(mine.classList.contains('snap-alist-added')).toBe(true);
      expect(mine.title).toBe('Pat Q');
      expect(row.querySelector('.snap-alist-foot').textContent).toBe('14 of 15 classmates have a score here.');
    } finally { close(); }
  });
  it('a viewer whose score IS in the pool is marked in place, not duplicated', async () => {
    const { s, host, close } = sandbox({ lessons: [{ lessonKey: '1.1', hasBlooket: true, blooket: 97 }] });
    try {
      s._snapApp.focusKey = '1.1:blooket';
      s._renderAssignmentsView(host(), false);
      await tick(); await tick();
      const row = host().querySelector('.snap-arow[data-key="1.1:blooket"]');
      row.querySelector('.snap-alist-toggle').onclick();
      expect([...row.querySelectorAll('.snap-alist-seq span')].length).toBe(15);
      expect(row.querySelector('.snap-alist-you').textContent).toBe('97');
      expect(row.querySelector('.snap-alist-added')).toBeNull();
    } finally { close(); }
  });
});

describe('Assignments view — all clear (teacher 2026-09-26: "something I\u2019ve nothing to fix on.. 1.1 blooket.. why?")', () => {
  it('when nothing is a 0 or below Q1, says so above the pager and shows the newest assignment', async () => {
    const { s, host, close } = sandbox({ lessons: [
      { lessonKey: '1.1', hasBlooket: true, blooket: 93.3 },
      { lessonKey: '1.2', lessonGradeNoQuiz: 100 },
      { lessonKey: '1.3', quizTotal: 3, Q: 100 },
    ] });
    try {
      s._renderAssignmentsView(host(), false);
      await tick(); await tick();
      expect(host().querySelector('.snap-clear').textContent).toBe('You have no 0s, nothing missing, and nothing below Q1 on any of the 3 assignments so far. Showing the newest; use Prev to look back.');
      expect(host().querySelector('.snap-arow').dataset.key).toBe('1.3:quiz');
      expect(host().querySelector('.snap-pager-pos').textContent).toBe('3 of 3');
    } finally { close(); }
  });
  it('a score below Q1 is the focus and there is no all-clear line', async () => {
    const { s, host, close } = sandbox({ lessons: [
      { lessonKey: '1.1', hasBlooket: true, blooket: 100 },
      { lessonKey: '1.2', lessonGradeNoQuiz: 100 },
      { lessonKey: '1.3', quizTotal: 3, Q: 50 },
    ] });
    try {
      s._renderAssignmentsView(host(), false);
      await tick(); await tick();
      expect(host().querySelector('.snap-clear')).toBeNull();
      expect(host().querySelector('.snap-arow').dataset.key).toBe('1.3:quiz');
      expect(host().querySelector('.snap-advice').textContent).toContain('below Q1');
    } finally { close(); }
  });
});

describe('Assignments view — "becomes a 0 soon" items (teacher 2026-09-26: the card lists 1.3–1.5, the picture showed 1.1–1.3)', () => {
  it('a pending assignment is in the picture after the counting ones; missing work there is "nothing yet", not a 0, with a dated Do-this-next', async () => {
    const { s, host, close } = sandbox({ lessons: [
      { lessonKey: '1.1', hasBlooket: true, blooket: 100 }, { lessonKey: '1.2', lessonGradeNoQuiz: 100 }, { lessonKey: '1.3', quizTotal: 3, Q: 100 },
    ] });
    s.withPending = true;
    try {
      s._renderAssignmentsView(host(), false);
      await tick(); await tick();
      // the only thing missing is the pending 1.4 → it is the focus, last in date order
      expect(host().querySelector('.snap-clear')).toBeNull();
      const row = host().querySelector('.snap-arow');
      expect(row.dataset.key).toBe('1.4:worksheet');
      expect(host().querySelector('.snap-pager-pos').textContent).toBe('4 of 4');
      expect(row.querySelector('.snap-arow-when').textContent).toBe('counts from Mon 9/28');
      expect(row.querySelector('.snap-caption').textContent).toBe('Median 100 · IQR 8 · 0 zeros. You: nothing yet (counts from Mon 9/28).');
      expect(row.querySelector('.snap-advice').textContent).toContain('Do this next. It becomes a 0 after Mon 9/28 — turn in anything before then and there is no 0 at all.');
      expect(row.querySelector('.snap-advice-btn').textContent).toBe('Open the worksheet');
      // "see the class" from the card lands on it
      s._snapApp.focusKey = '1.4:worksheet';
      host().innerHTML = '';
      s._renderAssignmentsView(host(), false);
      await tick(); await tick();
      expect(host().querySelector('.snap-arow').dataset.key).toBe('1.4:worksheet');
    } finally { close(); }
  });
  it('a counting 0 still outranks a pending gap; a picked student with nothing there gets a dated line and no button', async () => {
    const roster = [{ username: 'x', realName: 'Pat Q', section: 'PeriodE', role: 'student', lessons: [
      { lessonKey: '1.1', hasBlooket: true, blooket: 100 }, { lessonKey: '1.2', lessonGradeNoQuiz: null }, { lessonKey: '1.3', quizTotal: 3, Q: 100 },
    ] }];
    const { s, host, close } = sandbox({ teacher: true, roster, pick: 'x' });
    s.withPending = true;
    try {
      s._renderAssignmentsView(host(), true);
      await tick(); await tick();
      expect(host().querySelector('.snap-arow').dataset.key).toBe('1.2:worksheet');      // the real 0 first
      host().querySelectorAll('.snap-pager button')[1].onclick();                          // Next → 1.3 quiz
      s._snapApp.aidx.all = 3;
      host().innerHTML = '';
      s._renderAssignmentsView(host(), true);
      await tick(); await tick();
      const row = host().querySelector('.snap-arow');
      expect(row.dataset.key).toBe('1.4:worksheet');
      expect(row.querySelector('.snap-advice').textContent).toBe('Pat Q has nothing here yet — it becomes a 0 after Mon 9/28.');
      expect(row.querySelector('.snap-advice-btn')).toBeNull();
      expect(row.querySelector('.snap-caption').textContent).toContain('Pat Q: nothing yet');
    } finally { close(); }
  });
});
