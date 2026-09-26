// tests/desk-class-snapshot.test.js — CLASS_SNAPSHOT_SPEC.md, Desk side: the "Where you stand"
// card sits at the top of My Ledger for EVERY signed-in student (teacher 2026-09-26: "not just the
// ones who are falling behind"), fetches /class/snapshot for the student's own section with the
// roster token, draws the class picture with the student's value in red, and never throws.
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
let ClassSnapshot;
beforeAll(async () => { await import('../lib/class-snapshot.js'); ClassSnapshot = globalThis.ClassSnapshot; });

const PAYLOAD = { ok: true, section: 'PeriodB', quarter: 'Q1', n: 15, values: [31, 37, 39, 50, 61, 92, 97, 97, 99, 99, 100, 100, 100, 100, 100] };

function sandbox({ teacher = false, section = 'PeriodB', own = 31, warnings = [], lessons = null, status = 200, token = 'tok' } = {}) {
  const dom = new JSDOM('<div id="wallet-content"><div class="wallet-zero-card" data-sig="x">zero card</div><div class="old">receipts</div></div>',
    { url: 'https://robjohncolson.github.io/apstats-live-worksheet/' });
  const calls = [];
  const drawn = [];
  // The Desk reads the roster client off window (window.rosterClient.current()).
  dom.window.rosterClient = { current: () => ({ section }), token: () => token };
  const s = {
    document: dom.window.document, window: dom.window, console,
    ClassSnapshot: Object.assign({}, ClassSnapshot, { draw: (canvas, opts) => { drawn.push(opts); } }),
    _deskIsTeacher: () => teacher,
    _reviewCfg: () => ({ token, base: 'https://roster.test' }),
    _gradeQuartersCache: { Q1: { quarterGrade: own } },
    _gradeLessonsCache: lessons || [{ lessonKey: '1.5', due: { B: '2026-09-14', E: '2026-09-15' } }, { lessonKey: '1.8', due: { B: '2026-09-30', E: '2026-10-01' } }],
    cP: section === 'PeriodE' ? 'E' : 'B',
    tdy: () => new Date('2026-09-26T12:00:00'),
    quarterOfDate: () => 1,
    _zeroTodayIso: () => '2026-09-26',
    _zeroCurrentWarnings: () => warnings,
    fetch: async (url, opts) => { calls.push({ url, auth: opts && opts.headers && opts.headers.Authorization }); return { status, json: async () => PAYLOAD }; },
    Date, Promise, encodeURIComponent, calls, drawn,
  };
  createContext(s);
  runInContext(
    'var SNAPSHOT_TTL_MS = 300000;\nvar _snapState = { section: null, data: null, fetchedAt: 0, inflight: null, mode: null, error: null };\n' +
    ['_snapSection', '_snapCurrentQuarterKey', '_snapOwnGrade', '_snapModes', '_snapFetch', '_walletPrependSnapshot', '_snapPaint'].map(fnSrc).join('\n'), s);
  const host = () => dom.window.document.getElementById('wallet-content');
  const card = () => host().querySelector('.wallet-snapshot-card');
  return { s, host, card, close: () => dom.window.close() };
}
const tick = () => new Promise(r => setTimeout(r, 0));

describe('Where you stand — placement', () => {
  it('prepends the card above the zero card for a signed-in student, fetching that student\'s own section with the roster token', async () => {
    const { s, host, card, close } = sandbox();
    try {
      s._walletPrependSnapshot(host());
      expect(host().firstChild).toBe(card());
      await tick(); await tick();
      expect(s.calls).toEqual([{ url: 'https://roster.test/class/snapshot?section=PeriodB', auth: 'Bearer tok' }]);
      expect(card().querySelector('.snap-title').textContent).toBe('Where you stand — Period B, 15 students');
      // the zero card is still there, right under it
      expect(host().children[1].className).toBe('wallet-zero-card');
    } finally { close(); }
  });
  it('re-prepends itself after the zero card repaints on top, without a second fetch inside the TTL', async () => {
    const { s, host, card, close } = sandbox();
    try {
      s._walletPrependSnapshot(host()); await tick(); await tick();
      const first = card();
      host().insertBefore(host().querySelector('.wallet-zero-card'), host().firstChild);   // what _walletPrependZeroCard does
      s._walletPrependSnapshot(host()); await tick();
      expect(host().firstChild).toBe(first);
      expect(s.calls.length).toBe(1);
    } finally { close(); }
  });
  it('renders for a student with NO missing work (it is for everyone) — the caption then ends with the encouraging line', async () => {
    const { s, host, card, close } = sandbox({ own: 100, warnings: [] });
    try {
      s._walletPrependSnapshot(host()); await tick(); await tick();
      expect(card().querySelector('.snap-caption').textContent).toBe('Shape: skewed left. Median 97. You: 100. Every score here can still move.');
    } finally { close(); }
  });
  it('with missing work the caption points at the list below', async () => {
    const { s, host, card, close } = sandbox({ own: 31, warnings: [{ kind: 'quiz' }] });
    try {
      s._walletPrependSnapshot(host()); await tick(); await tick();
      expect(card().querySelector('.snap-caption').textContent).toBe('Shape: skewed left. Median 97. You: 31. The list below is the gap.');
    } finally { close(); }
  });
  it('does not render for the teacher, a signed-out visitor, or when the lib is missing', () => {
    const t = sandbox({ teacher: true }); try { t.s._walletPrependSnapshot(t.host()); expect(t.card()).toBeNull(); } finally { t.close(); }
    const o = sandbox({ section: null }); try { o.s._walletPrependSnapshot(o.host()); expect(o.card()).toBeNull(); } finally { o.close(); }
    const n = sandbox(); try { n.s.ClassSnapshot = undefined; n.s._walletPrependSnapshot(n.host()); expect(n.card()).toBeNull(); } finally { n.close(); }
  });
});

describe('Where you stand — modes and drawing', () => {
  it('offers the graphs the section has learned (dot + stem today), defaults to the newest, and draws your value in that mode', async () => {
    const { s, host, card, close } = sandbox();
    try {
      s._walletPrependSnapshot(host()); await tick(); await tick();
      const tabs = [...card().querySelectorAll('.snap-tabs button')];
      expect(tabs.map(b => b.textContent)).toEqual(['Dot plot', 'Stem-and-leaf']);
      expect(tabs.map(b => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
      const last = s.drawn.at(-1);
      expect(last.mode).toBe('stem'); expect(last.own).toBe(31); expect(last.values).toEqual(PAYLOAD.values);
      tabs[0].onclick();
      expect(s.drawn.at(-1).mode).toBe('dot');
      expect(card().querySelector('.snap-tabs button').getAttribute('aria-pressed')).toBe('true');
    } finally { close(); }
  });
  it('before 1.5 there are no tabs; after 1.8 the box plot is the default', async () => {
    const early = sandbox({ lessons: [{ lessonKey: '1.5', due: { B: '2026-10-05' } }] });
    try { early.s._walletPrependSnapshot(early.host()); await tick(); await tick(); expect(early.card().querySelector('.snap-tabs').hidden).toBe(true); expect(early.s.drawn.at(-1).mode).toBe('dot'); } finally { early.close(); }
    const late = sandbox({ lessons: [{ lessonKey: '1.5', due: { B: '2026-09-01' } }, { lessonKey: '1.8', due: { B: '2026-09-20' } }] });
    try { late.s._walletPrependSnapshot(late.host()); await tick(); await tick(); expect(late.s.drawn.at(-1).mode).toBe('box'); expect(late.card().querySelector('.snap-caption').textContent).toContain('Five-number summary'); } finally { late.close(); }
  });
  it('says the picture is unavailable on a server error and never throws', async () => {
    const { s, host, card, close } = sandbox({ status: 503 });
    try {
      s._walletPrependSnapshot(host()); await tick(); await tick();
      expect(card().querySelector('.snap-caption').textContent).toBe('Class picture unavailable right now.');
    } finally { close(); }
  });
});

describe('Class Snapshot desktop app (teacher 2026-09-26: "an app accessible from the desktop, like the ledger")', () => {
  function appSandbox({ teacher = false, section = 'PeriodB' } = {}) {
    const base = sandbox({ teacher, section });
    const doc = base.s.document;
    doc.body.insertAdjacentHTML('beforeend', '<div class="app-overlay" id="app-snapshot-overlay" style="display:none"><div class="app-window"><div class="app-content" id="snapshot-content"></div></div></div>');
    const teacherCalls = [];
    base.s.fetch = async (url, opts) => {
      teacherCalls.push(url);
      if (url.includes('/class/grades')) return { status: 200, json: async () => ({ ok: true, students: [
        { username: 'cherry_seal', realName: 'Allison R', section: 'PeriodB', role: 'student', quarters: { Q1: { quarterGrade: 30.8 } } },
        { username: 'kiwi_toad', realName: 'Kiwi T', section: 'PeriodB', role: 'student', quarters: { Q1: { quarterGrade: 99 } } },
        { username: 'teach', realName: 'Teacher', section: 'PeriodB', role: 'teacher', quarters: { Q1: { quarterGrade: 100 } } },
        { username: 'melon_bear', realName: 'Jesselly', section: 'PeriodE', role: 'student', quarters: { Q1: { quarterGrade: 71.5 } } },
      ] }) };
      return { status: 200, json: async () => Object.assign({}, PAYLOAD, { section: new URL(url).searchParams.get('section') }) };
    };
    runInContext("var _snapApp = { mode: null, sections: {}, roster: null, pick: {}, request: 0 };\n" +
      ['openSnapshot', '_snapTeacherFetch', '_renderSnapshotApp', '_snapTeacherSectionCard'].map(fnSrc).join('\n'), base.s);
    return Object.assign(base, { teacherCalls, content: () => doc.getElementById('snapshot-content'), overlay: () => doc.getElementById('app-snapshot-overlay') });
  }
  it('opens the window and, for a student, shows the same "Where you stand" card as My Ledger with an intro above it', async () => {
    const t = appSandbox();
    try {
      t.s.openSnapshot();
      expect(t.overlay().style.display).toBe('block');
      await tick(); await tick();
      expect(t.content().firstChild.className).toBe('snap-intro');
      const card = t.content().querySelector('.wallet-snapshot-card');
      expect(card.querySelector('.snap-title').textContent).toBe('Where you stand — Period B, 15 students');
      expect(t.s.drawn.at(-1).own).toBe(31);
    } finally { t.close(); }
  });
  it('for the teacher, shows one card per section with all three modes and a "place a student" picker built from the class gradebook (teacher rows excluded, no dot until picked)', async () => {
    const t = appSandbox({ teacher: true });
    try {
      t.s.openSnapshot();
      await tick(); await tick(); await tick();
      const cards = [...t.content().querySelectorAll('.wallet-snapshot-card')];
      expect(cards.map(c => c.dataset.section)).toEqual(['PeriodB', 'PeriodE']);
      expect([...cards[0].querySelectorAll('.snap-tabs button')].map(b => b.textContent)).toEqual(['Dot plot', 'Stem-and-leaf', 'Box plot']);
      const select = cards[0].querySelector('select');
      expect([...select.options].map(o => o.textContent)).toEqual(['(no dot)', 'Allison R', 'Kiwi T']);
      expect(t.s.drawn.at(-1).own).toBeNull();
      select.value = 'cherry_seal'; select.onchange();
      const last = t.s.drawn.at(-1);
      expect(last.own).toBe(30.8);
      expect(cards[0].querySelector('.snap-caption').textContent).toContain('Allison R: 30.8');
      // the picker never comes from the anonymous endpoint: names came from /class/grades only
      expect(t.teacherCalls.some(u => u.includes('/class/grades'))).toBe(true);
    } finally { t.close(); }
  });
  it('markup pins: a desktop icon for everyone, an app window wired to the generic close/minimize, and the ledger card stays student-only', () => {
    expect(html).toMatch(/data-app="snapshot"[^>]*ondblclick="openSnapshot\(\)"/);
    expect(html).not.toMatch(/data-app="snapshot"[^>]*display:none/);
    expect(html).toContain('id="app-snapshot-overlay"');
    expect(html).toContain("onclick=\"destroyApp('snapshot')\"");
    expect(html).toContain("onclick=\"minimizeApp('snapshot')\"");
    expect(fnSrc('_walletPrependSnapshot')).toContain('_deskIsTeacher()) return;');
  });
});

describe('wiring pins', () => {
  it('the Desk loads the shared renderer, precaches it, repaints the card after every ledger paint, and the Do Now pill opens the ledger', () => {
    expect(html).toContain('<script src="lib/class-snapshot.js" onerror=""></script>');
    expect(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'sw.js'), 'utf8')).toContain("'lib/class-snapshot.js'");
    expect((fnSrc('renderWallet').match(/_walletPrependSnapshot\(host\)/g) || []).length).toBe(3);
    expect(fnSrc('_walletRefreshZeroCard')).toContain('_walletPrependSnapshot(host)');
    expect(fnSrc('renderDoNowGrades')).toContain("pill.onclick = function () { if (typeof openWallet === 'function') openWallet(); };");
  });
});
