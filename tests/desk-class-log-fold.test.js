// desk-class-log-fold.test.js — the teacher-only Class Log "Recording" fold on the
// Desk day panel (FABLE_SPRINT_2026_10_22B_SPEC.md track L; js/desk-class-log.js +
// lib/class-log-summary.js, copied from a2).
//
// Pins: the fold renders for a teacher from a stubbed 200 (apstats rows only,
// `course=apstats` on the wire, Bearer token, token never printed); students never
// get the fold and never trigger a fetch; no token -> the sign-in form; 401/403 ->
// the stored token is cleared and the form comes back; the Desk wiring + the PWA
// precache + bump-build list include the new files.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deskSource, deskHtml } from './helpers/desk-source.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = deskHtml();
const DESK_SRC = deskSource(); // the Desk's JS incl. js/desk-*.js modules: code pins read this
const SW = readFileSync(resolve(ROOT, 'sw.js'), 'utf8');
const BUMP = readFileSync(resolve(ROOT, 'scripts/bump-build.mjs'), 'utf8');
const LIB = readFileSync(resolve(ROOT, 'lib/class-log-summary.js'), 'utf8');
const GLUE = readFileSync(resolve(ROOT, 'js/desk-class-log.js'), 'utf8');

const TOKEN = 'a2-teacher-token-XYZ';
const DATE = '2026-10-19';

function row(course, section, extra) {
  return Object.assign({
    date: DATE, course, section, model: 'gemini-2.5-flash', markdown: '# x',
    landed: ['Sampling variability'], studentQuestions: ['Why n-1?'], promises: ['Post the key'], nextPrep: ['Print slips'],
    recordedAt: '2026-10-19T14:05:00Z',
  }, extra || {});
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// A window with the two scripts evaluated the way the Desk loads them (classic
// scripts, globals on window). `teacher` sets the gate the Desk exposes.
function boot({ teacher = true, token = TOKEN, responses = [] } = {}) {
  const dom = new JSDOM('<div id="resource-body"></div>', { url: 'https://desk.test/ap_stats_roadmap_square_mode.html', runScripts: 'outside-only' });
  const win = dom.window;
  win._deskIsTeacher = () => teacher;
  if (token) win.localStorage.setItem('apstats_classlog_token', token);
  const queue = responses.slice();
  win.fetch = vi.fn(async () => {
    const next = queue.shift();
    if (!next) throw new Error('unexpected fetch');
    return typeof next === 'function' ? next() : next;
  });
  win.eval(LIB);
  win.eval(GLUE);
  win.ClassLogSummary._reset();
  return { win, host: win.document.getElementById('resource-body') };
}

async function settle(fold) { await fold._pending; await new Promise((r) => setTimeout(r, 0)); }

describe('Desk wiring', () => {
  it('loads the lib copy and the glue after the other lib scripts, versioned like the entry scripts', () => {
    expect(DESK).toContain('<script src="lib/class-log-summary.js" onerror=""></script>');
    expect(DESK).toMatch(/<script src="js\/desk-class-log\.js\?v=[^"<>]+" onerror=""><\/script>/);
    expect(DESK.indexOf('lib/class-log-summary.js')).toBeGreaterThan(DESK.indexOf('<script src="lib/sfx.js"'));
  });
  it('mounts the fold from the lesson panel and the work-day panel, gated on the module', () => {
    const calls = DESK.match(/_mountClassLogFold\(/g) || [];
    expect(calls.length).toBe(3); // definition + lesson panel + work-day panel (the typeof guards have no paren)
    const helper = DESK.slice(DESK.indexOf('function _mountClassLogFold('), DESK.indexOf('function _mountClassLogFold(') + 700);
    expect(helper).toContain('DeskClassLog.mount(window, body, iso, cP)');
    expect(helper).toContain('DeskClassLog.isoFromDisplay(dateStr');
    // Both call sites are typeof-guarded: sandboxed tests extract the panel functions alone.
    const lessonAt = DESK.indexOf("document.getElementById('resource-body').innerHTML = html;\n    if (typeof _mountClassLogFold === 'function') _mountClassLogFold(document.getElementById('resource-body'), dateStr);");
    expect(lessonAt).toBeGreaterThan(DESK.indexOf('function showResourcePanel('));
    const work = DESK.slice(DESK.indexOf('function _showWorkDayPanel('), DESK.indexOf('function showResourcePanel('));
    expect(work).toContain("if (typeof _mountClassLogFold === 'function') _mountClassLogFold(body, dateStr)");
  });
  it('precaches both files and versions the glue on bump-build', () => {
    const core = SW.slice(SW.indexOf('const CORE = ['), SW.indexOf('];', SW.indexOf('const CORE = [')));
    expect(core).toContain("'lib/class-log-summary.js'");
    expect(core).toContain("'js/desk-class-log.js'");
    expect(BUMP).toContain("'js/desk-class-log.js'");
  });
  it('the lib copy names its a2 source and filters apstats', () => {
    expect(LIB).toContain('school/algebra2-live-worksheet/lib/class-log-summary.js');
    expect(LIB).toContain("DEFAULT_COURSE = 'apstats'");
  });
});

describe('isoFromDisplay', () => {
  const { win } = boot({ token: null });
  const today = new Date(2026, 9, 22); // 2026-10-22
  it('resolves the calendar label inside the school year', () => {
    expect(win.DeskClassLog.isoFromDisplay('Oct 19', today)).toBe('2026-10-19');
    expect(win.DeskClassLog.isoFromDisplay('Sep 3', today)).toBe('2026-09-03');
    expect(win.DeskClassLog.isoFromDisplay('Mar 3', today)).toBe('2027-03-03');
    expect(win.DeskClassLog.isoFromDisplay('Jun 10', new Date(2027, 3, 1))).toBe('2027-06-10');
  });
  it('returns null for the empty label the lesson-key opener passes', () => {
    expect(win.DeskClassLog.isoFromDisplay('', today)).toBe(null);
    expect(win.DeskClassLog.isoFromDisplay('2026-10-19', today)).toBe(null);
  });
});

describe('Recording fold', () => {
  it('renders the apstats row for the section from a stubbed 200, course on the wire, token never printed', async () => {
    const body = { from: DATE, to: DATE, summaries: [
      row('algebra2', 'B', { landed: ['WRONG COURSE'] }),
      row('apstats', 'E', { landed: ['WRONG SECTION'] }),
      row('apstats', 'B'),
    ] };
    const { win, host } = boot({ responses: [jsonResponse(200, body)] });
    const fold = win.DeskClassLog.mount(win, host, DATE, 'B');
    expect(fold).not.toBe(null);
    expect(fold.tagName).toBe('DETAILS');
    expect(fold.querySelector('summary').textContent).toBe('Recording');
    await settle(fold);
    const text = fold.textContent;
    expect(text).toContain('Landed');
    expect(text).toContain('Sampling variability');
    expect(text).toContain('Student questions');
    expect(text).toContain('Why n-1?');
    expect(text).toContain('Promises');
    expect(text).toContain('Next prep');
    expect(text).toContain('gemini-2.5-flash');
    expect(text).not.toContain('WRONG COURSE');
    expect(text).not.toContain('WRONG SECTION');
    expect(host.innerHTML).not.toContain(TOKEN);
    expect(win.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = win.fetch.mock.calls[0];
    expect(url).toBe('https://a2-live-worksheets-production.up.railway.app/teacher/summaries?course=apstats&from=2026-10-19&to=2026-10-19');
    expect(init.headers.Authorization).toBe('Bearer ' + TOKEN);
  });
  it('says "No recording summary" when the day has rows for other sections only', async () => {
    const { win, host } = boot({ responses: [jsonResponse(200, { summaries: [row('apstats', 'E')] })] });
    const fold = win.DeskClassLog.mount(win, host, DATE, 'B');
    await settle(fold);
    expect(fold.textContent).toContain('No recording summary');
  });
  it('is hidden for students: no fold, no fetch', () => {
    const { win, host } = boot({ teacher: false, responses: [jsonResponse(200, { summaries: [row('apstats', 'B')] })] });
    expect(win.DeskClassLog.mount(win, host, DATE, 'B')).toBe(null);
    expect(host.children.length).toBe(0);
    expect(win.fetch).not.toHaveBeenCalled();
  });
  it('is skipped without a date or section', () => {
    const { win, host } = boot();
    expect(win.DeskClassLog.mount(win, host, null, 'B')).toBe(null);
    expect(win.DeskClassLog.mount(win, host, DATE, '')).toBe(null);
    expect(host.children.length).toBe(0);
  });
  it('shows the Class Log sign-in when no token is stored, then fetches after a teacher sign-in', async () => {
    const { win, host } = boot({ token: null, responses: [
      jsonResponse(200, { ok: true, token: 'fresh-token', role: 'teacher', studentId: 't1' }),
      jsonResponse(200, { summaries: [row('apstats', 'B')] }),
    ] });
    const fold = win.DeskClassLog.mount(win, host, DATE, 'B');
    await settle(fold);
    const form = fold.querySelector('form.desk-classlog-signin');
    expect(form).not.toBe(null);
    expect(win.fetch).not.toHaveBeenCalled();
    form.querySelector('input[name=username]').value = 'mrcolson';
    form.querySelector('input[name=password]').value = 'pw';
    await form.onsubmit({ preventDefault() {} });
    await new Promise((r) => setTimeout(r, 0));
    const [url, init] = win.fetch.mock.calls[0];
    expect(url).toBe('https://a2-live-worksheets-production.up.railway.app/roster/verify');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ username: 'mrcolson', password: 'pw' });
    expect(win.localStorage.getItem('apstats_classlog_token')).toBe('fresh-token');
    expect(win.fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer fresh-token');
    expect(fold.querySelector('form')).toBe(null);
    expect(fold.textContent).toContain('Sampling variability');
    expect(host.innerHTML).not.toContain('fresh-token');
  });
  it('refuses a non-teacher account and stores nothing', async () => {
    const { win, host } = boot({ token: null, responses: [
      jsonResponse(200, { ok: true, token: 'student-token', role: 'student', studentId: 's1' }),
    ] });
    const fold = win.DeskClassLog.mount(win, host, DATE, 'B');
    await settle(fold);
    const form = fold.querySelector('form');
    form.querySelector('input[name=username]').value = 'kid';
    form.querySelector('input[name=password]').value = 'pw';
    await form.onsubmit({ preventDefault() {} });
    expect(win.localStorage.getItem('apstats_classlog_token')).toBe(null);
    expect(fold.querySelector('.desk-classlog-status').textContent).toContain('not a teacher');
    expect(fold.querySelector('form')).not.toBe(null);
    expect(host.innerHTML).not.toContain('student-token');
  });
  it('clears the token and re-prompts on 401 and 403', async () => {
    for (const status of [401, 403]) {
      const { win, host } = boot({ responses: [jsonResponse(status, { error: 'Teacher sign-in required' })] });
      const fold = win.DeskClassLog.mount(win, host, DATE, 'B');
      await settle(fold);
      expect(win.localStorage.getItem('apstats_classlog_token')).toBe(null);
      expect(fold.querySelector('form.desk-classlog-signin')).not.toBe(null);
      expect(fold.textContent).toContain('expired');
      expect(host.innerHTML).not.toContain(TOKEN);
    }
  });
  it('keeps the token on a 503 and says the summary is unavailable', async () => {
    const { win, host } = boot({ responses: [jsonResponse(503, { error: 'unavailable' })] });
    const fold = win.DeskClassLog.mount(win, host, DATE, 'B');
    await settle(fold);
    expect(win.localStorage.getItem('apstats_classlog_token')).toBe(TOKEN);
    expect(fold.textContent).toContain('Recording summary unavailable');
    expect(fold.querySelector('form')).toBe(null);
  });
});
