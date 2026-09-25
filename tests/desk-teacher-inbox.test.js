// tests/desk-teacher-inbox.test.js
//
// TEACHER_INBOX_ICON_SPEC.md (teacher 2026-09-25): a teacher-only desktop icon
// on the Desk that counts student messages newer than the teacher workspace's
// unfiltered "Mark read" marker (tsc-inbox-seen-at:all — the view the icon opens)
// and opens the workspace on the right tab. Read-only: the Desk never writes the
// marker. Runs the real Desk helpers in a jsdom sandbox.
import { describe, it, expect } from 'vitest';
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

const MESSAGES = [
  { nudgeId: 3, senderUsername: 'kiwi_toad', section: 'PeriodB', text: 'what am I missing?', createdAt: '2026-09-25T15:00:00.000Z' },
  { nudgeId: 2, senderUsername: 'lemon_seal', section: 'PeriodE', text: 'hi', createdAt: '2026-09-17T15:11:00.000Z' },
  { nudgeId: 1, senderUsername: 'peach_whale', section: 'PeriodE', text: 'grade?', createdAt: '2026-08-20T18:46:00.000Z' },
];

// The fake server honours since= the way roster-server/nudge-db.js does (created_at > since).
function sandbox({ teacher = true, messages = MESSAGES, status = 200, token = 'tok' } = {}) {
  const dom = new JSDOM(`
    <div class="app-icon" data-app="teacherinbox" style="display:none"><div class="icon-img"></div><div class="icon-label">Teacher Inbox</div></div>
    <div id="menu-teacher-inbox">Teacher Inbox<span id="menu-teacher-inbox-badge" class="menu-nudge-badge" hidden>0</span></div>`,
    { url: 'https://robjohncolson.github.io/apstats-live-worksheet/', pretendToBeVisual: true }); // the tick skips hidden tabs
  const calls = [];
  const s = {
    document: dom.window.document, window: dom.window, localStorage: dom.window.localStorage, console,
    _deskIsTeacher: () => teacher,
    _reviewCfg: () => ({ token, base: 'https://roster.test' }),
    fetch: async (url, opts) => {
      calls.push({ url, auth: opts && opts.headers && opts.headers.Authorization });
      if (status === 'network') throw new Error('offline');
      const since = new URL(url).searchParams.get('since');
      const body = since ? messages.filter(m => m.createdAt > since) : messages;
      return { status, json: async () => ({ ok: true, messages: body }) };
    },
    opened: [], openTeacherTools(view) { s.opened.push(view); },
    arranged: 0,
    setInterval() {}, calls,
  };
  s.window._arrangeDesktopIcons = () => { s.arranged++; };
  createContext(s);
  runInContext(
    "var TEACHER_INBOX_SEEN_KEY = 'tsc-inbox-seen-at:all';\nvar _teacherInboxState = { newMessages: 0, unavailable: false, halted: null };\nvar _teacherInboxRequest = 0;\n" +
    ['_teacherInboxSeenAt', '_teacherInboxCountNew', '_teacherInboxRefreshVisibility', '_teacherInboxTitle', '_teacherInboxPaint', '_teacherInboxFetch', '_teacherInboxTick', '_teacherInboxOnStorage', 'openTeacherInbox']
      .map(fnSrc).join('\n'), s);
  const icon = () => dom.window.document.querySelector('.app-icon[data-app="teacherinbox"]');
  const badge = () => icon().querySelector('.teacher-inbox-badge');
  const menuBadge = () => dom.window.document.getElementById('menu-teacher-inbox-badge');
  return { s, dom, icon, badge, menuBadge, close: () => dom.window.close() };
}

describe('Teacher Inbox icon — visibility', () => {
  it('stays hidden for a student, shows for a teacher, and re-arranges the desktop only when that changes', () => {
    const student = sandbox({ teacher: false });
    try {
      student.s._teacherInboxRefreshVisibility();
      expect(student.icon().style.display).toBe('none');
      expect(student.s.arranged).toBe(0);
    } finally { student.close(); }
    const teacher = sandbox();
    try {
      teacher.s._teacherInboxRefreshVisibility();
      expect(teacher.icon().style.display).toBe('');
      expect(teacher.s.arranged).toBe(1);
      teacher.s._teacherInboxRefreshVisibility();
      expect(teacher.s.arranged).toBe(1);
    } finally { teacher.close(); }
  });

  it('hiding (view-as / preview / sign-out) also clears the Teacher-menu count; showing clears a stale sign-in halt', async () => {
    let teacher = true;
    const { s, menuBadge, close } = sandbox();
    try {
      s._deskIsTeacher = () => teacher;
      await s._teacherInboxTick();
      expect(menuBadge().hidden).toBe(false);
      teacher = false;
      s._teacherInboxRefreshVisibility();
      expect(menuBadge().hidden).toBe(true);
      teacher = true;
      s._teacherInboxState.halted = 'signin';
      s._teacherInboxRefreshVisibility();
      expect(s._teacherInboxState.halted).toBeNull();
    } finally { close(); }
  });

  it('the static markup ships hidden, hidden icons take no desktop slot, and role refresh drives the icon', () => {
    expect(html).toMatch(/data-app="teacherinbox"[^>]*display:none/);
    expect(fnSrc('arrangeByUsage')).toContain("el.style.display !== 'none'");
    expect(fnSrc('updateUserRoleUI')).toContain('_teacherInboxRefreshVisibility');
    // The workspace's selectView() is the only tab whitelist; the Desk passes the view through.
    expect(fnSrc('_paintTeacherTools')).not.toMatch(/\['class', 'attention'/);
    expect(fnSrc('_paintTeacherTools')).toContain('encodeURIComponent(String(view');
  });
});

describe('Teacher Inbox icon — count', () => {
  it('counts every message when nothing has been marked read, with a badge, a menu badge and an accessible title', async () => {
    const { s, icon, badge, menuBadge, close } = sandbox();
    try {
      await s._teacherInboxTick();
      expect(s.calls[0].url).toBe('https://roster.test/teacher/nudge-inbox?limit=200');
      expect(s.calls[0].auth).toBe('Bearer tok');
      expect(badge().textContent).toBe('3');
      expect(badge().getAttribute('role')).toBe('status');
      expect(icon().title).toBe('3 new student messages — open Teacher Inbox');
      expect(menuBadge().hidden).toBe(false);
      expect(menuBadge().textContent).toBe('3');
    } finally { close(); }
  });

  it('uses the unfiltered workspace marker: passes it as since=, counts only newer messages, never writes it', async () => {
    const { s, icon, badge, close } = sandbox();
    try {
      s.localStorage.setItem('tsc-inbox-seen-at:all', '2026-09-20T00:00:00.000Z');
      s.localStorage.setItem('tsc-inbox-seen-at:PeriodB', '2026-09-26T00:00:00.000Z'); // a section marker is NOT the unfiltered view
      await s._teacherInboxTick();
      expect(s.calls[0].url).toBe('https://roster.test/teacher/nudge-inbox?limit=200&since=2026-09-20T00%3A00%3A00.000Z');
      expect(badge().textContent).toBe('1');
      expect(icon().title).toBe('1 new student message — open Teacher Inbox');
      expect(s.localStorage.getItem('tsc-inbox-seen-at:all')).toBe('2026-09-20T00:00:00.000Z');
      expect(s.localStorage.length).toBe(2);
    } finally { close(); }
  });

  it('hides both badges at zero and clamps at 99+', async () => {
    const { s, badge, icon, menuBadge, close } = sandbox();
    try {
      s.localStorage.setItem('tsc-inbox-seen-at:all', '2026-09-26T00:00:00.000Z');
      await s._teacherInboxTick();
      expect(badge()).toBeNull();
      expect(menuBadge().hidden).toBe(true);
      expect(icon().title).toBe('Teacher Inbox — no new student messages');
    } finally { close(); }
    const many = Array.from({ length: 120 }, (_, i) => ({ nudgeId: i, senderUsername: 'x', createdAt: '2026-09-25T15:00:00.' + String(i).padStart(3, '0') + 'Z' }));
    const big = sandbox({ messages: many });
    try {
      await big.s._teacherInboxTick();
      expect(big.badge().textContent).toBe('99+');
      expect(big.menuBadge().textContent).toBe('99+');
    } finally { big.close(); }
  });

  it('a storage event on the unfiltered marker re-polls at once; other keys are ignored', async () => {
    const { s, badge, close } = sandbox();
    try {
      await s._teacherInboxTick();
      expect(badge().textContent).toBe('3');
      s.localStorage.setItem('tsc-inbox-seen-at:all', '2026-09-26T00:00:00.000Z');
      s._teacherInboxOnStorage({ key: 'tsc-inbox-seen-at:all' });
      await new Promise(r => setTimeout(r, 0));
      expect(badge()).toBeNull();
      expect(s.calls.length).toBe(2);
      s._teacherInboxOnStorage({ key: 'tsc-inbox-seen-at:PeriodB' });
      s._teacherInboxOnStorage({ key: 'unrelated' });
      await new Promise(r => setTimeout(r, 0));
      expect(s.calls.length).toBe(2);
    } finally { close(); }
  });

  it('keeps the previous count and says unavailable on a network failure; never throws; keeps polling', async () => {
    const offline = sandbox({ status: 'network' });
    try {
      offline.s._teacherInboxState.newMessages = 2;
      await expect(offline.s._teacherInboxTick()).resolves.toBeUndefined();
      expect(offline.icon().title).toBe('Teacher Inbox — inbox unavailable, open to retry');
      expect(offline.badge().textContent).toBe('2');
      expect(offline.s._teacherInboxState.halted).toBeNull();
    } finally { offline.close(); }
  });

  it('backs off after 401 (expired sign-in) and 503 (not provisioned) until an explicit open or a role refresh', async () => {
    const expired = sandbox({ status: 401 });
    try {
      await expired.s._teacherInboxTick();
      expect(expired.icon().title).toBe('Teacher Inbox — sign in as a teacher to see messages');
      await expired.s._teacherInboxTick();
      expect(expired.s.calls.length).toBe(1);   // halted: no more polling
      expired.s.openTeacherInbox();             // explicit open clears the halt
      await expired.s._teacherInboxTick();
      expect(expired.s.calls.length).toBe(2);
    } finally { expired.close(); }
    const off = sandbox({ status: 503 });
    try {
      await off.s._teacherInboxTick();
      expect(off.icon().title).toBe('Teacher Inbox — student messages are not turned on');
      await off.s._teacherInboxTick();
      expect(off.s.calls.length).toBe(1);
    } finally { off.close(); }
  });

  it('ignores a slow, stale response that lands after a newer poll', async () => {
    const { s, badge, close } = sandbox();
    try {
      let release;
      const gate = new Promise(r => { release = r; });
      const realFetch = s.fetch;
      s.fetch = async (url, opts) => { const r = await realFetch(url, opts); if (s.calls.length === 1) await gate; return r; };
      const slow = s._teacherInboxTick();               // request 1 (resolves last, carries 3)
      s.localStorage.setItem('tsc-inbox-seen-at:all', '2026-09-26T00:00:00.000Z');
      await s._teacherInboxTick();                      // request 2: zero new
      expect(badge()).toBeNull();
      release(); await slow;
      expect(badge()).toBeNull();                       // the stale 3 never overwrote the 0
    } finally { close(); }
  });

  it('does nothing for a student; a missing token reads as signed out', async () => {
    const student = sandbox({ teacher: false });
    try {
      await student.s._teacherInboxTick();
      expect(student.s.calls.length).toBe(0);
    } finally { student.close(); }
    const signedOut = sandbox({ token: null });
    try {
      await signedOut.s._teacherInboxTick();
      expect(signedOut.s.calls.length).toBe(0);
      expect(signedOut.icon().title).toContain('sign in as a teacher');
    } finally { signedOut.close(); }
  });
});

describe('Teacher Inbox icon — opening', () => {
  it('opens the workspace on Messages when there are new messages, else on Needs attention; never for a student', async () => {
    const { s, close } = sandbox();
    try {
      await s._teacherInboxTick();
      s.openTeacherInbox();
      s._teacherInboxState.newMessages = 0;
      s.openTeacherInbox();
      expect(s.opened).toEqual(['messages', 'attention']);
    } finally { close(); }
    const student = sandbox({ teacher: false });
    try {
      student.s.openTeacherInbox();
      expect(student.s.opened).toEqual([]);
    } finally { student.close(); }
  });
});

describe('Desktop icon auto-arrange', () => {
  it('skips hidden icons so a student never sees a gap where the Teacher Inbox would be', () => {
    const dom = new JSDOM('<div class="app-icon" data-app="wallet"></div><div class="app-icon" data-app="teacherinbox" style="display:none"></div><div class="app-icon" data-app="week"></div>');
    const doc = dom.window.document;
    const s = { document: doc, window: dom.window, icons: Array.from(doc.querySelectorAll('.app-icon')), getUsageCounts: () => ({}), ICON_TOP_START: 36, ICON_GAP: 72, ICON_RIGHT: 20 };
    createContext(s);
    runInContext(fnSrc('arrangeByUsage') + '\narrangeByUsage();', s);
    const tops = Array.from(doc.querySelectorAll('.app-icon')).map(el => [el.dataset.app, el.style.top]);
    expect(tops).toEqual([['wallet', '36px'], ['teacherinbox', ''], ['week', '108px']]);
    dom.window.close();
  });
});
