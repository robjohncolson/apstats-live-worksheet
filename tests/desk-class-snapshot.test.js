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

describe('wiring pins', () => {
  it('the Desk loads the shared renderer, precaches it, repaints the card after every ledger paint, and the Do Now pill opens the ledger', () => {
    expect(html).toContain('<script src="lib/class-snapshot.js" onerror=""></script>');
    expect(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'sw.js'), 'utf8')).toContain("'lib/class-snapshot.js'");
    expect((fnSrc('renderWallet').match(/_walletPrependSnapshot\(host\)/g) || []).length).toBe(3);
    expect(fnSrc('_walletRefreshZeroCard')).toContain('_walletPrependSnapshot(host)');
    expect(fnSrc('renderDoNowGrades')).toContain("pill.onclick = function () { if (typeof openWallet === 'function') openWallet(); };");
  });
});
