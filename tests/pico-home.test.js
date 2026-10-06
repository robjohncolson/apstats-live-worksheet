// @vitest-environment node
/**
 * tests/pico-home.test.js
 *
 * Pico Desk Phase 1, "the live home" (PICO_DESK_SPEC.md). pico-home.js runs inside the real
 * Desk markup (scripts stripped) with the Desk's own htm / cellAria / groupLabel source and a
 * fixture schedule. Checks: the flag shows/hides the chrome; five tiles render with the same
 * labels the calendar cell gives; a tile click reaches maybeBumpThenOpen; the sign mirrors the
 * Do Now; OPTION lists the items; and with the flag OFF nothing in the Desk's DOM changes.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { DESK_ATLAS, DESK_ATLAS_SIZE } from '../apstat-park/assets/pico-desk-atlas.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const deskSource = readFileSync(resolve(repo, 'ap_stats_roadmap_square_mode.html'), 'utf8');
const picoSource = readFileSync(resolve(repo, 'pico-home.js'), 'utf8');
const bumpSource = readFileSync(resolve(repo, 'scripts/bump-build.mjs'), 'utf8');

function functionSource(name) {
  const match = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(deskSource);
  if (!match) throw new Error('Desk function not found: ' + name);
  let depth = 0;
  for (let index = deskSource.indexOf('{', match.index); index < deskSource.length; index += 1) {
    if (deskSource[index] === '{') depth += 1;
    if (deskSource[index] === '}' && --depth === 0) return deskSource.slice(match.index, index + 1);
  }
  throw new Error('Unbalanced Desk function: ' + name);
}

// The <head> flag check, exactly as the Desk ships it.
const FLAG_SCRIPT = (() => {
  const match = /<script>(try\{if\(\/\[\?&\]home=park[\s\S]*?)<\/script>/.exec(deskSource);
  if (!match) throw new Error('Pico flag check not found in the Desk <head>');
  return match[1];
})();

// The <head> rules that hide the System 7 chrome while the flag is on. jsdom's computed style
// ignores !important/specificity, so the tests check each element against the rules' selectors
// (the headless-Chrome screenshots check the real rendering). The menu bar is hidden with
// visibility, not display, so the Study Break challenge dialog inside it can still show.
const HIDE_STYLE = (() => {
  const match = /<style>(html\.pico-home \.app-icon[^<]*)<\/style>/.exec(deskSource);
  if (!match) throw new Error('Pico hide rules not found in the Desk <head>');
  return match[1];
})();
const HIDE_RULES = HIDE_STYLE.split('}').filter(Boolean).map((rule) => {
  const [selectors, declaration] = rule.split('{');
  return { selectors: selectors.split(','), declaration };
});

function ruleMatches(node, declaration) {
  return HIDE_RULES.some((rule) => rule.declaration === declaration
    && rule.selectors.some((selector) => node.matches(selector)));
}

// Hidden = display:none on the node or an ancestor, or visibility:hidden not re-shown.
function hiddenByFlag(node) {
  for (let n = node; n && n.nodeType === 1; n = n.parentElement) {
    if (ruleMatches(n, 'display:none!important')) return true;
  }
  if (ruleMatches(node, 'visibility:visible!important')) return false;
  for (let n = node; n && n.nodeType === 1; n = n.parentElement) {
    if (ruleMatches(n, 'visibility:hidden!important')) return true;
  }
  return false;
}

// The Desk's markup without any of its scripts (the tests supply the Desk functions).
const DESK_MARKUP = deskSource.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

// Fixture schedule rows [y, m, d, infB, infE]. Week of Mon Oct 5 2026 + the next week.
function lesson(t, n, u) { return { t, n, u }; }
function fixtureSchedule() {
  const work = { t: 'B-Work', n: 'Work Day', u: 2, kind: 'work' };
  const pc = { t: 'U2-PC', n: 'Unit 2 Progress Check', u: 2, kind: 'pc', admin: 1 };
  return [
    [2026, 9, 5, lesson('2.4', 'Two quantitative variables', 2), lesson('2.4', 'Two quantitative variables', 2)],
    [2026, 9, 6, lesson('2.5', 'Correlation', 2), 'noclass'],
    [2026, 9, 7, 'noclass', lesson('2.5', 'Correlation', 2)],
    [2026, 9, 8, work, work],
    [2026, 9, 9, pc, pc],
    [2026, 9, 12, lesson('2.6', 'Linear regression models', 2), lesson('2.6', 'Linear regression models', 2)],
    [2026, 9, 13, lesson('2.7', 'Residuals', 2), lesson('2.7', 'Residuals', 2)],
  ];
}

const CED_NAMES = {
  '2.4': 'Representing the Relationship Between Two Quantitative Variables',
  '2.5': 'Correlation',
  '2.6': 'Linear Regression Models',
  '2.7': 'Residuals',
};

function createDesk({ flag = 'url', signedIn = true, teacher = false, marks = {}, nextUp = '2.4', zeros = [] } = {}) {
  const url = 'https://desk.test/ap_stats_roadmap_square_mode.html' + (flag === 'url' ? '?home=park' : '');
  const fetchSpy = vi.fn(() => Promise.reject(new Error('no network in this test')));
  const dom = new JSDOM(DESK_MARKUP, {
    url,
    runScripts: 'outside-only',
    beforeParse(window) {
      window.fetch = fetchSpy;
      if (flag === 'storage') window.localStorage.setItem('apstats-pico-home', '1');
      if (teacher) window.localStorage.setItem('apstats_user_role', 'teacher');
    },
  });
  const win = dom.window;
  win.eval(FLAG_SCRIPT);

  // Desk constants + the Desk's own label functions (real source).
  win.eval('var R="review",OFF="off",EX="exam",PO="post",NC="noclass";'
    + 'var MN=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];'
    + 'var cYear="SY26-27";\n'
    + ['groupTopics', 'groupLabel', '_resourcePanelEsc', 'eq', 'htm', 'cellAria', '_deskIsTeacher',
      'calNextUpTopic', '_orderedPeriodTopics']
      .map(functionSource).join('\n'));
  win.cedLabel = (t) => ({ text: t + ' · ' + (CED_NAMES[t] || 'Lesson'), unit: Number(String(t).split('.')[0]) || null });
  win.S = fixtureSchedule();
  win.cP = 'B';
  win.tdy = () => new win.Date(2026, 9, 7);
  win._calNextUp = nextUp;
  win._todayLessonInf = null;
  win.DeskState = { nextUpTopic: nextUp, todayLessonInf: null, gateMarks: marks };
  win.localLessonState = (topic, m) => (m && m[topic]) || '';
  // The live marks object (the Desk reads it fresh with getStudentMarks()).
  win.getStudentMarks = () => marks;
  win.getStudentEmail = () => (signedIn ? 'robin@roster.local' : '');
  win._zeroCurrentWarnings = () => zeros;
  win.MacSFX = { muted: false };

  const spies = {};
  ['maybeBumpThenOpen', 'openWallet', 'openSignInModal', 'signOutStudent', 'changeMyPassword', '_toggleSound',
    'setP', '_openStudentDmModal', 'openGradeHelp', 'openTeacherTools', 'openTeacherInbox', 'openApp',
    '_togglePreviewAsStudent', 'restoreWindow', 'closeCalendar', '_focusTodayLessonVideo', '_menuShowDoNow',
    'openDayGrade', '_openBaselineInfo', 'openBulletin', 'openReview', 'paintLocalDoneCells',
    'paintDonowCells'].forEach((name) => { spies[name] = vi.fn(); win[name] = spies[name]; });

  spies.open = vi.fn();
  win.open = spies.open;
  return { dom, win, doc: win.document, spies, fetchSpy, marks };
}

// Load pico-home.js the way the Desk does (after the markup is parsed).
function loadPico(win) {
  win.eval(picoSource);
  if (win.document.readyState === 'loading') win.document.dispatchEvent(new win.Event('DOMContentLoaded'));
}

function tileNames(doc) {
  return [...doc.querySelectorAll('#pico-tiles .tile-name')].map((n) => n.textContent);
}

// The text the calendar cell shows for one schedule entry (rCal renders htm into the cell).
function calendarLabel(win, inf, ds) {
  const box = win.document.createElement('div');
  box.innerHTML = win.htm(inf, ds);
  const tl = box.querySelector('.tl');
  return tl ? tl.textContent.trim() : '';
}

function setDoNow(doc, { msg, mode = 'todo', zeros = '', pill = null, missing = '', status = '' }) {
  const card = doc.getElementById('donow-card');
  card.className = 'donow-' + mode + (zeros ? ' donow-zeros-' + zeros : '');
  card.style.display = 'flex';
  doc.getElementById('donow-msg').textContent = msg;
  const grades = doc.getElementById('donow-grades');
  grades.innerHTML = '';
  if (pill) {
    grades.innerHTML = '<span class="qpill"><span class="qkey">' + pill.key + '</span><span class="qgrade">'
      + pill.value + '</span>' + (pill.official ? '<span class="qrule">official (same as Schoology)</span>' : '') + '</span>'
      + (missing ? '<span class="qpill qpill-missing qpill-soon">' + missing + '</span>' : '');
  }
  const statusHost = doc.getElementById('donow-grade-status');
  statusHost.innerHTML = status ? '<span>' + status + '</span><button class="s7btn">Retry</button>' : '';
  statusHost.style.display = status ? 'flex' : 'none';
}

describe('pico-home -- the flag', () => {
  it('?home=park adds the class before first paint and the <head> CSS hides the chrome', () => {
    const { doc, win } = createDesk({ flag: 'url' });
    expect(doc.documentElement.classList.contains('pico-home')).toBe(true);
    expect(hiddenByFlag(doc.getElementById('menubar'))).toBe(true);
    expect(hiddenByFlag(doc.getElementById('window-wrap'))).toBe(true);
    expect(hiddenByFlag(doc.getElementById('desktop-icon'))).toBe(true);
    for (const icon of doc.querySelectorAll('.app-icon')) expect(hiddenByFlag(icon)).toBe(true);
    // The Desk's dialogs are not hidden: they still open on top.
    expect(hiddenByFlag(doc.getElementById('dialog-overlay'))).toBe(false);
    expect(hiddenByFlag(doc.getElementById('signin-overlay'))).toBe(false);
    // The menu bar's items are hidden, but an incoming Study Break challenge still shows.
    expect(hiddenByFlag(doc.getElementById('menu-identity'))).toBe(true);
    expect(hiddenByFlag(doc.getElementById('doge-challenge-panel'))).toBe(false);
  });

  it('LESSONS un-hides the main window (pico-lessons-open)', () => {
    const { doc } = createDesk({ flag: 'url' });
    doc.documentElement.classList.add('pico-lessons-open');
    expect(hiddenByFlag(doc.getElementById('window-wrap'))).toBe(false);
    expect(hiddenByFlag(doc.getElementById('menubar'))).toBe(true);
  });

  it("localStorage 'apstats-pico-home' = '1' turns it on too", () => {
    const { doc } = createDesk({ flag: 'storage' });
    expect(doc.documentElement.classList.contains('pico-home')).toBe(true);
  });

  it('flag off: no class, the chrome is not hidden', () => {
    const { doc, win } = createDesk({ flag: 'off' });
    expect(doc.documentElement.classList.contains('pico-home')).toBe(false);
    expect(hiddenByFlag(doc.getElementById('menubar'))).toBe(false);
    expect(hiddenByFlag(doc.getElementById('window-wrap'))).toBe(false);
    for (const icon of doc.querySelectorAll('.app-icon')) expect(hiddenByFlag(icon)).toBe(false);
  });

  it('flag off: loading pico-home.js changes nothing in the Desk DOM', () => {
    const { doc, win, fetchSpy } = createDesk({ flag: 'off' });
    const before = {
      menubar: doc.getElementById('menubar').outerHTML,
      window: doc.getElementById('window-wrap').outerHTML,
      body: doc.body.innerHTML,
      head: doc.head.innerHTML,
      html: doc.documentElement.className,
    };
    loadPico(win);
    doc.dispatchEvent(new win.Event('DOMContentLoaded'));
    expect(doc.getElementById('menubar').outerHTML).toBe(before.menubar);
    expect(doc.getElementById('window-wrap').outerHTML).toBe(before.window);
    expect(doc.body.innerHTML).toBe(before.body);
    expect(doc.head.innerHTML).toBe(before.head);
    expect(doc.documentElement.className).toBe(before.html);
    expect(doc.getElementById('pico-home')).toBeNull();
    expect(win.PicoHome).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('flag on: the chrome is hidden, not removed', () => {
    const { doc, win } = createDesk();
    loadPico(win);
    expect(doc.getElementById('menubar')).not.toBeNull();
    expect(doc.getElementById('window-wrap')).not.toBeNull();
    expect(doc.getElementById('donow-card')).not.toBeNull();
    expect(doc.getElementById('pico-home')).not.toBeNull();
  });
});

describe('pico-home -- the week strip', () => {
  it('renders five tiles with the same labels the calendar cell gives', () => {
    const { doc, win } = createDesk();
    loadPico(win);
    expect(doc.querySelectorAll('#pico-tiles .tile')).toHaveLength(5);
    const week = win.S.slice(0, 5);
    const expected = week.map((row) => {
      const inf = row[3];
      const ds = 'Oct ' + row[2];
      return inf === 'noclass' ? '' : calendarLabel(win, inf, ds);
    });
    expect(tileNames(doc)).toEqual(expected);
    // Spot-check the calendar's own words reached the tiles unchanged.
    expect(tileNames(doc)[0]).toBe('2.4 · Representing the Relationship Between Two Quantitative Variables');
    expect(tileNames(doc)[3]).toBe('Work Day');
    expect(tileNames(doc)[4]).toBe('U2 PC 1/2');
  });

  it('the tile aria-label starts with the calendar cell aria text', () => {
    const { doc, win } = createDesk();
    loadPico(win);
    const first = doc.querySelector('#pico-tiles .tile');
    expect(first.getAttribute('aria-label').startsWith(win.cellAria(win.S[0][3], 'Oct 5'))).toBe(true);
  });

  it('uses the Day vocabulary marks: tick, "!", flag, push block, lying cat, raised tile, triangle', () => {
    const { doc, win } = createDesk({ marks: { '2.4': 'done' }, nextUp: '2.5', zeros: [{ lessonKey: '2.5', past: true }] });
    loadPico(win);
    const tiles = [...doc.querySelectorAll('#pico-tiles li')];
    expect(tiles[0].querySelector('.sp-tick')).not.toBeNull();       // 2.4 done
    expect(tiles[1].querySelector('.sp-bang')).not.toBeNull();       // 2.5 is already a zero
    expect(tiles[1].querySelector('.sp-triangleBlue')).not.toBeNull(); // 2.5 = continue here
    expect(tiles[2].querySelector('.sp-lyingCat')).not.toBeNull();   // no class (B, Wed)
    expect(tiles[2].querySelector('.sp-tileRaised')).not.toBeNull(); // today = Wed Oct 7
    expect(tiles[3].querySelector('.sp-pushBox')).not.toBeNull();    // Work Day
    expect(tiles[4].querySelector('.sp-flag')).not.toBeNull();       // Progress Check
    expect(doc.querySelectorAll('#pico-tiles .sp-tileRaised')).toHaveLength(1);
  });

  it('tile "!" = only the zeros that have landed (the _paintZeroCells set); incoming zeros stay on the sign', () => {
    const { doc, win } = createDesk({ zeros: [{ lessonKey: '2.4', past: false }, { lessonKey: '2.5', past: true }] });
    loadPico(win);
    const tiles = [...doc.querySelectorAll('#pico-tiles li')];
    expect(tiles[0].querySelector('.sp-bang')).toBeNull();
    expect(tiles[1].querySelector('.sp-bang')).not.toBeNull();
  });

  it('completion and next-up are read live: a paintLocalDoneCells repaint ticks the tile and moves the triangle', async () => {
    const { doc, win, marks } = createDesk();
    loadPico(win);
    let tiles = [...doc.querySelectorAll('#pico-tiles li')];
    expect(tiles[0].querySelector('.sp-triangleBlue')).not.toBeNull();   // 2.4 = next up
    expect(tiles[0].querySelector('.sp-tick')).toBeNull();
    marks['2.4'] = 'done';                       // the student finishes 2.4; no rCal runs
    win.paintLocalDoneCells();                   // the Desk's repaint (wrapped, body untouched)
    await new Promise((r) => setTimeout(r, 60));
    tiles = [...doc.querySelectorAll('#pico-tiles li')];
    expect(tiles[0].querySelector('.sp-tick')).not.toBeNull();
    expect(tiles[0].querySelector('.sp-triangleBlue')).toBeNull();
    expect(tiles[1].querySelector('.sp-triangleBlue')).not.toBeNull();  // 2.5 = next up now
  });

  it('a lesson tile click reaches maybeBumpThenOpen with the calendar cell arguments', () => {
    const { doc, win, spies } = createDesk();
    loadPico(win);
    doc.querySelectorAll('#pico-tiles .tile')[0].click();
    expect(spies.maybeBumpThenOpen).toHaveBeenCalledTimes(1);
    expect(spies.maybeBumpThenOpen).toHaveBeenCalledWith(win.S[0][3], 'Oct 5');
  });

  it('a no-class tile opens nothing', () => {
    const { doc, win, spies } = createDesk();
    loadPico(win);
    doc.querySelectorAll('#pico-tiles .tile')[2].click();
    expect(spies.maybeBumpThenOpen).not.toHaveBeenCalled();
  });

  it('pages weeks with (n/m) and TODAY returns', () => {
    const { doc, win } = createDesk();
    loadPico(win);
    expect(doc.getElementById('pico-week-title').textContent).toBe('WEEK OF OCT 5');
    expect(doc.getElementById('pico-week-page').textContent).toBe('(1/2)');
    expect(doc.getElementById('pico-unit').textContent).toBe('UNIT 2');
    doc.getElementById('pico-week-next').click();
    expect(doc.getElementById('pico-week-title').textContent).toBe('WEEK OF OCT 12');
    expect(doc.getElementById('pico-week-page').textContent).toBe('(2/2)');
    doc.querySelector('#pico-home .navbtn[data-nav="TODAY"]').click();
    expect(doc.getElementById('pico-week-title').textContent).toBe('WEEK OF OCT 5');
  });

  it('the floor is the real classroom board node, moved, never copied', () => {
    const { doc, win } = createDesk();
    const board = doc.getElementById('classroom-board-mount');
    loadPico(win);
    expect(doc.querySelectorAll('#classroom-board-mount')).toHaveLength(1);
    expect(doc.getElementById('classroom-board-mount')).toBe(board);
    expect(doc.getElementById('pico-floor').contains(board)).toBe(true);
  });
});

describe('pico-home -- the sign mirrors the Do Now', () => {
  it('caught up: the Do Now message, quiet, official grade from the pill', () => {
    const { doc, win, spies } = createDesk();
    loadPico(win);
    setDoNow(doc, { msg: 'Do Now: 2.4 · Two variables — worksheet (2/5 done).', pill: { key: 'Q1', value: '91.5', official: true } });
    win.PicoHome.render();
    const sign = doc.getElementById('pico-sign');
    expect(sign.querySelector('.sign-action').textContent).toBe('Do Now: 2.4 · Two variables — worksheet (2/5 done).');
    expect(sign.classList.contains('is-warn')).toBe(false);
    expect(sign.querySelector('.sp-bang')).toBeNull();
    expect(sign.querySelector('.grade-num').textContent).toBe('91.5');
    expect(sign.querySelector('.grade-cap').textContent).toBe('Q1 official');
    sign.querySelector('.sign-grade').click();
    expect(spies.openWallet).toHaveBeenCalledTimes(1);
  });

  it('behind: "!" block + border, the missing-work words, and See all missing work → openWallet', () => {
    const { doc, win, spies } = createDesk();
    loadPico(win);
    setDoNow(doc, { msg: 'Do Now: 2.4 · Two variables — worksheet.', zeros: 'soon',
      pill: { key: 'Q1', value: '84' }, missing: '1 becomes a 0 by Thu Oct 8' });
    win.PicoHome.render();
    const sign = doc.getElementById('pico-sign');
    expect(sign.classList.contains('is-warn')).toBe(true);
    expect(sign.querySelector('.sign-action .sp-bang')).not.toBeNull();
    expect(sign.querySelector('.sign-when').textContent).toContain('1 becomes a 0 by Thu Oct 8');
    const link = [...sign.querySelectorAll('button')].find((b) => b.textContent === 'See all missing work');
    link.click();
    expect(spies.openWallet).toHaveBeenCalledTimes(1);
    expect(sign.querySelector('.grade-num').textContent).toBe('84');
  });

  it('a multi-line Do Now keeps every line (first = action, the rest = context)', () => {
    const { doc, win } = createDesk();
    loadPico(win);
    setDoNow(doc, { msg: 'Work Day — nothing new today.\nFinish: 2.4 · Two variables\nExit tickets are bonus (+5)', pill: { key: 'Q1', value: '88' } });
    win.PicoHome.render();
    const sign = doc.getElementById('pico-sign');
    expect(sign.querySelector('.sign-action').textContent).toBe('Work Day — nothing new today.');
    expect(sign.querySelector('.sign-context').textContent).toBe('Finish: 2.4 · Two variables Exit tickets are bonus (+5)');
  });

  it('Open = the Do Now primary action: today\'s lesson panel when there is one', () => {
    const { doc, win, spies } = createDesk();
    win.DeskState.todayLessonInf = win.S[0][3];
    loadPico(win);
    setDoNow(doc, { msg: 'Do Now: 2.4 — worksheet.' });
    win.PicoHome.render();
    doc.getElementById('pico-sign-go').click();
    expect(spies._focusTodayLessonVideo).toHaveBeenCalledTimes(1);
  });

  it('Open with no lesson today shows the Do Now card (calendar window + _menuShowDoNow)', () => {
    const { doc, win, spies } = createDesk();
    loadPico(win);
    setDoNow(doc, { msg: 'All caught up — every assigned item is done.', mode: 'done' });
    win.PicoHome.render();
    doc.getElementById('pico-sign-go').click();
    expect(spies.restoreWindow).toHaveBeenCalledTimes(1);
    expect(spies._menuShowDoNow).toHaveBeenCalledTimes(1);
  });

  it('grade unavailable: the Do Now status text replaces the number', () => {
    const { doc, win } = createDesk();
    loadPico(win);
    setDoNow(doc, { msg: 'Do Now: 2.4 — worksheet.', status: 'Grades are temporarily unavailable — your work is saved.' });
    win.PicoHome.render();
    const grade = doc.querySelector('#pico-sign .sign-grade');
    expect(grade.querySelector('.grade-num')).toBeNull();
    expect(grade.textContent).toBe('Grades are temporarily unavailable — your work is saved.');
  });

  it('signed out: "Sign in to see your work" and a sign-in button → openSignInModal, no grade', () => {
    const { doc, win, spies } = createDesk({ signedIn: false });
    loadPico(win);
    const sign = doc.getElementById('pico-sign');
    expect(sign.querySelector('.sign-action').textContent).toBe('Sign in to see your work');
    expect(sign.querySelector('.sign-grade')).toBeNull();
    doc.getElementById('pico-sign-go').click();
    expect(spies.openSignInModal).toHaveBeenCalledTimes(1);
  });

  it('re-renders when the Desk rewrites the Do Now card', async () => {
    const { doc, win } = createDesk();
    loadPico(win);
    setDoNow(doc, { msg: 'Do Now: 2.5 — quiz.' });
    await new Promise((r) => setTimeout(r, 80));
    expect(doc.querySelector('#pico-sign .sign-action').textContent).toBe('Do Now: 2.5 — quiz.');
  });
});

describe('pico-home -- navigation and OPTION', () => {
  // Teacher 2026-10-06: students never see a period switch (a B student sees only B's schedule).
  const STUDENT_ITEMS = ['SIGN OUT', 'CHANGE PASSWORD', 'SOUND: ON', 'MESSAGE TEACHER',
    'HOW GRADES WORK', 'START HERE', 'USE ORIGINAL DESK'];

  function optionLabels(doc) {
    return [...doc.querySelectorAll('#pico-menu-list .action .action-text')].map((n) => n.textContent);
  }

  it('the nav has TODAY / LESSONS / MY GRADE / OPTION and name · period', () => {
    const { doc, win } = createDesk();
    win.rosterClient = { current: () => ({ username: 'rexample', realName: 'Robin Example' }) };
    loadPico(win);
    const labels = [...doc.querySelectorAll('#pico-home .navbtn')].map((b) => b.getAttribute('data-nav'));
    expect(labels).toEqual(['TODAY', 'LESSONS', 'MY GRADE', 'OPTION']);
    expect(doc.getElementById('pico-player').textContent).toBe('Robin Example · Period B');
  });

  it('LESSONS → SCHEDULE shows the existing calendar window; its close box returns to the home', async () => {
    const { doc, win, spies } = createDesk();
    loadPico(win);
    doc.querySelector('#pico-home .navbtn[data-nav="LESSONS"]').click();
    [...doc.querySelectorAll('#pico-menu-list .action')].find((b) => b.textContent === 'SCHEDULE').click();
    expect(spies.restoreWindow).toHaveBeenCalledTimes(1);
    expect(doc.documentElement.classList.contains('pico-lessons-open')).toBe(true);
    doc.getElementById('window-wrap').style.display = 'none';   // what closeCalendar() does
    await new Promise((r) => setTimeout(r, 0));
    expect(doc.documentElement.classList.contains('pico-lessons-open')).toBe(false);
  });

  function menuLabels(doc) {
    return [...doc.querySelectorAll('#pico-menu-list .action .action-text')].map((n) => n.textContent);
  }

  function clickMenu(doc, label) {
    const btn = [...doc.querySelectorAll('#pico-menu-list .action')].find((b) => b.querySelector('.action-text').textContent === label);
    btn.click();
  }

  it('LESSONS lists exactly SCHEDULE / REVIEW / PRACTICE; each calls the existing opener', () => {
    const { doc, win, spies } = createDesk();
    loadPico(win);
    const lessons = doc.querySelector('#pico-home .navbtn[data-nav="LESSONS"]');
    const open = () => lessons.click();
    open();
    expect(doc.getElementById('pico-menu-title').textContent).toBe('LESSONS');
    expect(menuLabels(doc)).toEqual(['SCHEDULE', 'REVIEW', 'PRACTICE']);
    clickMenu(doc, 'REVIEW'); expect(spies.openReview).toHaveBeenCalledTimes(1);
    open(); clickMenu(doc, 'SCHEDULE'); expect(spies.restoreWindow).toHaveBeenCalledTimes(1);
    open(); clickMenu(doc, 'PRACTICE');
    expect(doc.getElementById('pico-menu-backdrop').hidden).toBe(false);
    expect(menuLabels(doc)).toEqual(['FORMULA DEFENSE', 'TI-84 TRAINER', 'ALL WORKSHEETS', 'BACK']);
    const practice = () => { open(); clickMenu(doc, 'PRACTICE'); };
    clickMenu(doc, 'FORMULA DEFENSE');
    expect(spies.open).toHaveBeenLastCalledWith('https://tmux-trainer.vercel.app/#deck=ap-stats-formulas', '_blank', 'noopener');
    practice(); clickMenu(doc, 'TI-84 TRAINER'); expect(spies.openApp).toHaveBeenLastCalledWith('ti84');
    practice(); clickMenu(doc, 'ALL WORKSHEETS');
    expect(spies.open).toHaveBeenLastCalledWith('TOC.html', '_blank', 'noopener');
    practice(); clickMenu(doc, 'BACK');
    expect(menuLabels(doc)).toEqual(['SCHEDULE', 'REVIEW', 'PRACTICE']);
    // Not listed any more (their Desk openers remain for the old Desk).
    expect(spies.openBulletin).not.toHaveBeenCalled();
    expect(spies.openApp.mock.calls.map((c) => c[0])).not.toContain('week');
    // The same targets the Desk's Apps / Go menus use.
    expect(deskSource).toContain("window.open('https://tmux-trainer.vercel.app/#deck=ap-stats-formulas','_blank','noopener')");
    expect(deskSource).toContain("window.open('TOC.html','_blank','noopener')");
  });

  it('the LESSONS badge mirrors only the Review icon badge (and its bob)', async () => {
    const { doc, win } = createDesk();
    loadPico(win);
    const lessonsBadge = doc.getElementById('pico-lessons-badge');
    expect(lessonsBadge.hidden).toBe(true);
    // A Bulletin badge no longer counts.
    const bulletinBadge = doc.createElement('span');
    bulletinBadge.className = 'bulletin-soon-badge';
    bulletinBadge.textContent = '2';
    doc.querySelector('.app-icon[data-app="bulletin"] .icon-img').appendChild(bulletinBadge);
    const reviewIcon = doc.querySelector('.app-icon[data-app="review"]');
    const reviewBadge = doc.createElement('span');
    reviewBadge.className = 'review-due-badge';
    reviewBadge.textContent = '5';
    reviewIcon.querySelector('.icon-img').appendChild(reviewBadge);
    reviewIcon.classList.add('review-has-due');
    await new Promise((r) => setTimeout(r, 60));   // the Review icon observer re-renders the nav
    expect(lessonsBadge.hidden).toBe(false);
    expect(lessonsBadge.textContent).toBe('5');
    expect(lessonsBadge.classList.contains('is-bobbing')).toBe(true);
    doc.querySelector('#pico-home .navbtn[data-nav="LESSONS"]').click();
    const item = (label) => [...doc.querySelectorAll('#pico-menu-list .action')].find((b) => b.querySelector('.action-text').textContent === label);
    expect(item('REVIEW').querySelector('.nav-badge').textContent).toBe('5');
    expect(item('REVIEW').querySelector('.nav-badge').classList.contains('is-bobbing')).toBe(true);
    // The bob is motion-safe only.
    expect(picoSource).toMatch(/prefers-reduced-motion: no-preference[\s\S]*?\.nav-badge\.is-bobbing/);
  });

  it('MY GRADE opens the ledger', () => {
    const { doc, win, spies } = createDesk();
    loadPico(win);
    doc.querySelector('#pico-home .navbtn[data-nav="MY GRADE"]').click();
    expect(spies.openWallet).toHaveBeenCalledTimes(1);
  });

  it('OPTION lists the student items; Esc closes it and focus returns to OPTION', () => {
    const { doc, win } = createDesk();
    loadPico(win);
    const optionBtn = doc.querySelector('#pico-home .navbtn[data-nav="OPTION"]');
    optionBtn.click();
    expect(doc.getElementById('pico-menu-backdrop').hidden).toBe(false);
    expect(optionLabels(doc)).toEqual(STUDENT_ITEMS);
    doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(doc.getElementById('pico-menu-backdrop').hidden).toBe(true);
    expect(doc.activeElement).toBe(optionBtn);
  });

  it('keys inside OPTION and the tiles stay there (the board document keys never see them)', () => {
    const { doc, win } = createDesk();
    loadPico(win);
    const seen = [];
    doc.addEventListener('keydown', (event) => seen.push(event.key));
    const tile = doc.querySelectorAll('#pico-tiles .tile')[0];
    tile.focus();
    tile.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(doc.activeElement).toBe(doc.querySelectorAll('#pico-tiles .tile')[1]);
    const optionBtn = doc.querySelector('#pico-home .navbtn[data-nav="OPTION"]');
    optionBtn.click();
    const first = doc.activeElement;
    expect(first.classList.contains('action')).toBe(true);
    first.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(doc.activeElement.textContent).toBe('CHANGE PASSWORD');
    doc.activeElement.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(doc.getElementById('pico-menu-backdrop').hidden).toBe(true);
    expect(doc.activeElement).toBe(optionBtn);
    expect(seen).toEqual([]);
  });

  it('OPTION items call the Desk functions', () => {
    const { doc, win, spies } = createDesk();
    loadPico(win);
    const run = (label) => {
      doc.querySelector('#pico-home .navbtn[data-nav="OPTION"]').click();
      const btn = [...doc.querySelectorAll('#pico-menu-list .action')].find((b) => b.querySelector('.action-text').textContent === label);
      btn.click();
    };
    run('SIGN OUT'); expect(spies.signOutStudent).toHaveBeenCalled();
    run('CHANGE PASSWORD'); expect(spies.changeMyPassword).toHaveBeenCalled();
    run('SOUND: ON'); expect(spies._toggleSound).toHaveBeenCalled();
    run('MESSAGE TEACHER'); expect(spies._openStudentDmModal).toHaveBeenCalled();
    run('HOW GRADES WORK'); expect(spies.openGradeHelp).toHaveBeenCalled();
  });

  it('signed out: OPTION starts with SIGN IN', () => {
    const { doc, win, spies } = createDesk({ signedIn: false });
    loadPico(win);
    doc.querySelector('#pico-home .navbtn[data-nav="OPTION"]').click();
    expect(optionLabels(doc)[0]).toBe('SIGN IN');
    doc.querySelector('#pico-menu-list .action').click();
    expect(spies.openSignInModal).toHaveBeenCalledTimes(1);
  });

  it('teacher-only items appear only for _deskIsTeacher()', () => {
    const student = createDesk();
    loadPico(student.win);
    student.doc.querySelector('#pico-home .navbtn[data-nav="OPTION"]').click();
    expect(optionLabels(student.doc)).not.toContain('TEACHER WORKSPACE');
    expect(optionLabels(student.doc)).not.toContain('PERIOD B');
    expect(optionLabels(student.doc)).not.toContain('PERIOD E');

    const teacher = createDesk({ teacher: true });
    loadPico(teacher.win);
    teacher.doc.querySelector('#pico-home .navbtn[data-nav="OPTION"]').click();
    expect(optionLabels(teacher.doc)).toEqual(STUDENT_ITEMS.concat(
      ['TEACHER WORKSPACE', 'TEACHER INBOX', 'DOK LADDERS', 'PREVIEW AS STUDENT', 'PERIOD B', 'PERIOD E']));
    const periodE = [...teacher.doc.querySelectorAll('#pico-menu-list .action')]
      .find((b) => b.querySelector('.action-text').textContent === 'PERIOD E');
    periodE.click();
    expect(teacher.spies.setP).toHaveBeenCalledWith('E');
  });

  it('existing badges (teacher message, teacher inbox) show on OPTION', () => {
    const { doc, win } = createDesk({ teacher: true });
    const msg = doc.getElementById('menu-message-teacher-badge');
    msg.hidden = false; msg.textContent = '2';
    const inbox = doc.getElementById('menu-teacher-inbox-badge');
    inbox.hidden = false; inbox.textContent = '3';
    loadPico(win);
    const badge = doc.getElementById('pico-option-badge');
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toBe('5');
  });
});

describe('pico-home -- wiring and art', () => {
  it('the atlas copy matches apstat-park/assets/pico-desk-atlas.mjs', () => {
    const { win } = createDesk();
    loadPico(win);
    expect(win.PicoHome.atlasSize).toEqual(DESK_ATLAS_SIZE);
    for (const [name, rect] of Object.entries(win.PicoHome.atlas)) {
      const { x, y, w, h } = DESK_ATLAS[name];
      expect(rect, name).toEqual({ x, y, w, h });
    }
  });

  it('makes no network request and never loads anything itself', () => {
    const { win, fetchSpy } = createDesk();
    loadPico(win);
    win.PicoHome.render();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(picoSource).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|railway|WebSocket/i);
  });

  it('the Desk loads pico-home.js beside classroom-board.js with the same build stamp', () => {
    const tags = deskSource.match(/<script src="(classroom-board|pico-home)\.js\?v=([^"]+)"><\/script>/g);
    expect(tags).toHaveLength(2);
    expect(tags[0]).toContain('classroom-board.js');
    expect(tags[1]).toContain('pico-home.js');
    expect(tags[0].split('?v=')[1]).toBe(tags[1].split('?v=')[1]);
    expect(bumpSource).toMatch(/'classroom-board\.js', 'pico-home\.js'\]/);
  });

  it('the View menu has "Pico Desk (live)…" right after "Pico Desk Preview…", setting the flag and reloading', () => {
    const preview = deskSource.indexOf('>Pico Desk Preview&hellip;</div>');
    const live = deskSource.indexOf('>Pico Desk (live)&hellip;</div>');
    expect(preview).toBeGreaterThan(0);
    expect(live).toBeGreaterThan(preview);
    const item = deskSource.slice(deskSource.lastIndexOf('<div', live), live);
    expect(item).toMatch(/localStorage\.setItem\('apstats-pico-home','1'\)/);
    expect(item).toMatch(/location\.reload\(\)/);
  });

  it('rCal exposes its closure values on window.DeskState right after rebuilding the grid', () => {
    const body = functionSource('rCal');
    const at = body.indexOf('g.replaceChildren(_frag);');
    const next = body.slice(at).split('\n')[1];
    expect(next).toMatch(/window\.DeskState\s*=\s*Object\.assign\(window\.DeskState \|\| \{\}, \{ nextUpTopic: _nextUpTopic, todayLessonInf: _todayLessonInf, gateMarks: _gateMarks \}\)/);
  });
});

// ── The real Desk (tests/journeys/harness.js boots the checked-in page with its real scripts
//    against a fake roster) ──────────────────────────────────────────────────────────────
describe('pico-home -- inside the real Desk', { timeout: 60_000 }, () => {
  const NOW = '2026-10-07T14:00:00.000Z';   // Wed Oct 7 2026, 10am in school time

  function gradeFixture() {
    return {
      ok: true, asOf: NOW, units: [], completion: {}, lessons: [], gradebook: {},
      quarters: { Q1: { quarterGrade: 87.5, pcAvg: 82, workAvg: 87.5, lessonsDue: 7, lessonsGraded: 5, lessonsTotal: 10 } },
    };
  }

  async function signIn(harness) {
    await harness.signIn('alpha_otter');
    await harness.waitFor(() => harness.document.getElementById('menu-identity').textContent.includes('Alpha Otter'),
      { message: 'signed-in identity chip did not render' });
    const dialog = harness.document.getElementById('dialog-overlay');
    if (dialog && dialog.style.display !== 'none') harness.document.getElementById('dialog-btn').click();
  }

  it('flag off: the real Desk boots without the Pico home', async () => {
    const { bootDesk } = await import('./journeys/harness.js');
    const harness = await bootDesk({ now: NOW });
    try {
      expect(harness.windowErrors).toEqual([]);
      expect(harness.document.getElementById('pico-home')).toBeNull();
      expect(harness.document.getElementById('pico-home-style')).toBeNull();
      expect(harness.window.PicoHome).toBeUndefined();
      expect(harness.document.documentElement.classList.contains('pico-home')).toBe(false);
      expect(harness.document.getElementById('window-wrap').contains(harness.document.getElementById('classroom-board-mount'))).toBe(true);
      // rCal still publishes DeskState (a plain object; nothing reads it with the flag off).
      expect(harness.window.DeskState).toBeTruthy();
    } finally {
      harness.teardown();
    }
  });

  it('?home=park: tiles carry the calendar cells\' own labels, the sign mirrors the real Do Now', async () => {
    const { bootDesk, DESK_URL } = await import('./journeys/harness.js');
    const harness = await bootDesk({ now: NOW, url: DESK_URL + '?home=park', roster: { grades: gradeFixture() } });
    try {
      const { document: doc, window: win } = harness;
      expect(harness.windowErrors).toEqual([]);
      expect(harness.jsdomErrors).toEqual([]);
      expect(doc.documentElement.classList.contains('pico-home')).toBe(true);
      expect(doc.getElementById('pico-floor').contains(doc.getElementById('classroom-board-mount'))).toBe(true);
      expect(doc.querySelectorAll('#pico-tiles .tile')).toHaveLength(5);

      await signIn(harness);
      await harness.waitFor(() => doc.querySelector('#donow-grades .qpill:not(.qpill-missing) .qgrade'),
        { message: 'Do Now grade pill did not render' });
      win.calToday();   // put today's week on the calendar so its cells can be compared
      win.PicoHome.render();

      // Same text as the calendar cell for every day both views show.
      const cells = [...doc.querySelectorAll('#cg .dc[data-dts]')];
      let compared = 0;
      for (const day of win.PicoHome.days()) {
        const cell = cells.find((c) => Number(c.dataset.dts) === day.date.getTime());
        if (!cell) continue;
        const tl = cell.querySelector('.tl');
        expect(day.label).toBe(tl ? tl.textContent.trim() : '');
        compared += 1;
      }
      expect(compared).toBeGreaterThan(0);

      // Next-up is the calendar's own (rCal's _nextUpTopic, exposed on DeskState).
      // alpha_otter has no marks, so next-up is the first lesson, 1.1 (as J1 shows in the Do Now).
      expect(win.DeskState.nextUpTopic).toBe('1.1');

      // The sign = the Do Now's first line + the pill's grade.
      const firstLine = doc.getElementById('donow-msg').textContent.split('\n')[0].trim();
      expect(doc.querySelector('#pico-sign .sign-action').textContent).toBe(firstLine);
      expect(doc.querySelector('#pico-sign .grade-num').textContent)
        .toBe(doc.querySelector('#donow-grades .qpill:not(.qpill-missing) .qgrade').textContent);
      expect(harness.windowErrors).toEqual([]);
    } finally {
      harness.teardown();
    }
  });

  // Page the Pico week picker back until a tile shows `topic`.
  function pageToTopic(win, doc, topic) {
    for (let i = 0; i < 60; i += 1) {
      if (win.PicoHome.days().some((d) => d.inf && d.inf.t === topic)) return true;
      const prev = doc.getElementById('pico-week-prev');
      if (prev.disabled) return false;
      prev.click();
    }
    return false;
  }

  it('a lesson finished between rebuilds: recordProgress + paintLocalDoneCells tick the tile and move the triangle', async () => {
    const { bootDesk, DESK_URL } = await import('./journeys/harness.js');
    const harness = await bootDesk({ now: NOW, url: DESK_URL + '?home=park', roster: { grades: gradeFixture() } });
    try {
      const { document: doc, window: win } = harness;
      await signIn(harness);
      expect(win.DeskState.nextUpTopic).toBe('1.1');
      expect(pageToTopic(win, doc, '1.1')).toBe(true);
      const tileFor = (topic) => {
        const i = win.PicoHome.days().findIndex((d) => d.inf && d.inf.t === topic);
        return doc.querySelectorAll('#pico-tiles li')[i];
      };
      expect(tileFor('1.1').querySelector('.sp-triangleBlue')).not.toBeNull();
      expect(tileFor('1.1').querySelector('.sp-tick')).toBeNull();

      // Count full rebuilds from here on: the fix must not depend on one.
      let rebuilds = 0;
      const wrappedRCal = win.rCal;
      win.rCal = function () { rebuilds += 1; return wrappedRCal.apply(this, arguments); };

      // Finish 1.1 the way the Desk's Done buttons do, then run the Desk's repaint.
      await win.recordProgress('1.1', 'worksheet', 100);
      await win.recordProgress('1.1', 'blooket', 100);
      win.paintLocalDoneCells();
      await harness.waitFor(() => tileFor('1.1') && tileFor('1.1').querySelector('.sp-tick'),
        { message: 'the Pico tile never showed the tick' });

      expect(rebuilds).toBe(0);
      expect(win.localLessonState('1.1', win.getStudentMarks())).toBe('done');
      expect(tileFor('1.1').querySelector('.sp-triangleBlue')).toBeNull();
      // The triangle now sits on the Desk's own next-up (the calendar's .cal-current source).
      const next = win.calNextUpTopic(win._orderedPeriodTopics(), win.getStudentMarks());
      expect(next).not.toBe('1.1');
      expect(win._calNextUp).toBe(next);
      const marked = win.PicoHome.days().filter((d) => d.next).map((d) => d.inf.t);
      expect(marked.every((t) => t === next)).toBe(true);
      expect(pageToTopic(win, doc, next)).toBe(true);
      expect(tileFor(next).querySelector('.sp-triangleBlue')).not.toBeNull();
    } finally {
      harness.teardown();
    }
  });

  it('ArrowDown in OPTION moves the selection and never reaches the Desk activity key handler', async () => {
    const { bootDesk, DESK_URL } = await import('./journeys/harness.js');
    const harness = await bootDesk({ now: NOW, url: DESK_URL + '?home=park', roster: { grades: gradeFixture() } });
    try {
      const { document: doc, window: win } = harness;
      await signIn(harness);
      // A live activity with this student in it: the Desk's capture-phase handler would turn
      // ArrowUp / ArrowDown into an activity value.
      const sendActivityValue = vi.fn();
      win._classroomBoardHandle = { sendActivityValue };
      win._lastClassroomSummary = { activity: { finished: false, state: { values: { alpha_otter: 0 } } } };
      const down = (target) => target.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));

      // Sanity: with no Pico menu open, the Desk handler is live.
      down(doc.body);
      expect(sendActivityValue).toHaveBeenCalledTimes(1);

      doc.querySelector('#pico-home .navbtn[data-nav="OPTION"]').click();
      expect(doc.activeElement.textContent).toBe('SIGN OUT');
      down(doc.activeElement);
      expect(doc.activeElement.textContent).toBe('CHANGE PASSWORD');
      expect(doc.activeElement.classList.contains('is-selected')).toBe(true);
      down(doc.activeElement);
      expect(doc.activeElement.textContent.startsWith('SOUND')).toBe(true);
      expect(sendActivityValue).toHaveBeenCalledTimes(1);

      // Same inside LESSONS.
      doc.activeElement.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      expect(doc.getElementById('pico-menu-backdrop').hidden).toBe(true);
      doc.querySelector('#pico-home .navbtn[data-nav="LESSONS"]').click();
      down(doc.activeElement);
      expect(doc.activeElement.textContent).toMatch(/^REVIEW/);
      expect(sendActivityValue).toHaveBeenCalledTimes(1);
    } finally {
      harness.teardown();
    }
  });
});
