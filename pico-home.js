/* pico-home.js — Pico Desk Phase 1, "the live home" (PICO_DESK_SPEC.md).
 *
 * A second view inside the Desk. It is opt-in: the Desk's <head> adds the class `pico-home` to
 * <html> when the URL has ?home=park or localStorage 'apstats-pico-home' is '1', and the same
 * <head> block hides the System 7 chrome (menu bar, desktop icons, main window) with CSS. With
 * the flag off this file does nothing at all.
 *
 * Presentation only. Every value shown here is read from the Desk's own state and functions
 * (S, cP, tdy, htm, cellAria, localLessonState, window.DeskState from rCal, the Do Now card, the
 * official grade pill, _zeroCurrentWarnings, _deskIsTeacher, getStudentEmail). Every click calls
 * the Desk's existing handler. No rule is re-derived and no network request is made here.
 *
 * From the game (the recovered PICO PARK sheets, via apstat-park/assets/pico-desk.png): the
 * sprites and the menu window's proportions. Ours, not the game's: the five-day strip, the
 * sign's layout, the top navigation labels, the stage-select grid (never captured from the
 * game), and the plain-text lettering. The look is the Phase 0 sketch (pico-desk-preview.html,
 * stage-select layout, plain text) without its preview controls.
 */
(function () {
  'use strict';

  var FLAG_KEY = 'apstats-pico-home';

  // Nothing happens unless the Desk's <head> flag check switched the Pico home on.
  if (!document.documentElement.classList.contains('pico-home')) return;

  // ── Art ────────────────────────────────────────────────────────────────────
  // Copy of DESK_ATLAS in apstat-park/assets/pico-desk-atlas.mjs (x, y, w, h only);
  // tests/pico-home.test.js checks they agree. Only the sprites the live home draws.
  var ATLAS_SIZE = { w: 256, h: 128 };
  var ATLAS = {
    pushBox:      { x: 48,  y: 0,  w: 48, h: 48 },
    signPost:     { x: 184, y: 0,  w: 24, h: 19 },
    lyingCat:     { x: 208, y: 0,  w: 31, h: 25 },
    tick:         { x: 40,  y: 48, w: 16, h: 16 },
    bang:         { x: 56,  y: 48, w: 14, h: 14 },
    flag:         { x: 70,  y: 48, w: 16, h: 32 },
    triangleBlue: { x: 86,  y: 48, w: 17, h: 18 },
    zzz:          { x: 103, y: 48, w: 20, h: 20 },
    tileRaised:   { x: 123, y: 48, w: 48, h: 16 },
    close:        { x: 171, y: 48, w: 12, h: 12 },
    crown:        { x: 183, y: 48, w: 32, h: 24 },
    signboard:    { x: 215, y: 48, w: 34, h: 40 },
    platform:     { x: 0,   y: 88, w: 64, h: 8 },
    triOutRight:  { x: 84,  y: 88, w: 17, h: 18 },
    triOutLeft:   { x: 101, y: 88, w: 17, h: 18 },
  };
  // Every main-sheet sprite is drawn at this one integer scale. The ✕ comes from the menu
  // sheet, which is already at display size, so it is drawn 1x.
  var SCALE = 2;

  var DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  var MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  var MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // ── Styles (Phase 0 sketch CSS, scoped under #pico-home) ──────────────────
  var CSS = [
    '#pico-home {',
    '  --orange: #FF864D; --cream: #FFFBF0; --paper: #FEFEFE; --ink: #000040; --warn: #d9b400;',
    '  --plain-font: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;',
    '  position: fixed; inset: 0; z-index: 4; overflow: auto;',
    '  background: var(--paper); color: var(--ink); font: 16px/1.35 var(--plain-font);',
    '}',
    '#pico-home *, #pico-home *::before { box-sizing: border-box; }',
    '#pico-home button { font: inherit; color: inherit; }',
    '#pico-home .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;',
    '  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }',
    '#pico-home .sp { display: inline-block; background-image: url("apstat-park/assets/pico-desk.png");',
    '  background-repeat: no-repeat; image-rendering: pixelated; flex: none; }',
    '#pico-home .scene { max-width: 1240px; min-height: 100%; margin: 0 auto; padding: 0 16px;',
    '  display: flex; flex-direction: column; gap: 6px; }',
    '#pico-home .scene > * { flex-shrink: 0; }',
    '#pico-home .topnav { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 28px; min-height: 48px; }',
    '#pico-home .title { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: .04em; white-space: nowrap; }',
    '#pico-home .navlist { display: flex; flex-wrap: wrap; gap: 4px 8px; list-style: none; margin: 0; padding: 0; }',
    '#pico-home .navbtn { position: relative; min-height: 44px; min-width: 44px; padding: 0 10px;',
    '  background: none; border: 4px solid transparent; cursor: pointer;',
    '  font-size: 18px; font-weight: 800; letter-spacing: .04em; white-space: nowrap; }',
    '#pico-home .navbtn[aria-current="page"] { border-color: var(--orange); }',
    '#pico-home .navbtn:hover, #pico-home .navbtn:focus-visible { border-color: var(--orange); outline: none; }',
    '#pico-home .nav-badge { display: inline-block; min-width: 20px; margin-left: 6px; padding: 0 5px;',
    '  border-radius: 10px; background: #cc0000; color: #fff; font-size: 13px; line-height: 20px; text-align: center; }',
    '#pico-home .nav-badge[hidden] { display: none; }',
    /* The Review icon's bob while cards are due (same motion as the Desk icon), motion-safe only. */
    '@media (prefers-reduced-motion: no-preference) {',
    '  #pico-home .nav-badge.is-bobbing { animation: pico-badge-bob 2.6s ease-in-out infinite; }',
    '  @keyframes pico-badge-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(4px); } }',
    '}',
    '#pico-home .player { margin-left: auto; font-weight: 700; }',
    /* Week picker: the main menu carousel inside the recovered window (top bar = unit). */
    '#pico-home .week-b { display: flex; justify-content: center; }',
    '#pico-home .win { position: relative; isolation: isolate; display: flex; flex-direction: column;',
    '  padding: 31px 12px 12px; max-height: 100%; }',
    '#pico-home .win::before { content: ""; position: absolute; inset: 0; z-index: -1; background: var(--orange);',
    '  clip-path: polygon(8px 0, calc(100% - 8px) 0, calc(100% - 8px) 3px, calc(100% - 4px) 3px, calc(100% - 4px) 7px, 100% 7px,',
    '    100% calc(100% - 8px), calc(100% - 4px) calc(100% - 8px), calc(100% - 4px) calc(100% - 4px),',
    '    calc(100% - 8px) calc(100% - 4px), calc(100% - 8px) 100%, 8px 100%, 8px calc(100% - 4px),',
    '    4px calc(100% - 4px), 4px calc(100% - 8px), 0 calc(100% - 8px), 0 7px, 4px 7px, 4px 3px, 8px 3px); }',
    '#pico-home .win-bar { position: absolute; top: 0; left: 12px; right: 44px; height: 31px;',
    '  display: flex; align-items: center; color: #fff; font-weight: 800; letter-spacing: .04em; white-space: nowrap; }',
    '#pico-home .week-win .win-bar { right: 12px; }',
    '#pico-home .win-body { background: var(--paper); padding: 16px 24px 18px; overflow: auto; }',
    '#pico-home .week-win-body { display: flex; align-items: center; flex-wrap: wrap; justify-content: center;',
    '  gap: 4px 16px; padding: 0 16px; }',
    '#pico-home .carousel { display: inline-flex; align-items: center; gap: 8px; }',
    '#pico-home .week-title { margin: 0; font-size: 24px; font-weight: 800; letter-spacing: .04em; white-space: nowrap; }',
    '#pico-home .week-page { font-size: 20px; font-weight: 700; min-height: 44px; display: inline-flex; align-items: center; }',
    '#pico-home .week-exam { font-size: 16px; }',
    '#pico-home .crown[hidden] { display: none; }',
    '#pico-home .arrow { background: none; border: 0; padding: 0; cursor: pointer; min-width: 44px; min-height: 44px;',
    '  display: inline-flex; align-items: center; justify-content: center; }',
    '#pico-home .arrow:disabled { opacity: .3; cursor: default; }',
    '#pico-home .arrow:focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; }',
    /* The Do Now sign: a board drawn like the recovered signboard, standing on the post sprite. */
    '#pico-home .sign { display: flex; flex-direction: column; align-items: center; }',
    '#pico-home .sign-board { display: flex; align-items: center; gap: 24px; width: min(960px, 100%);',
    '  background: var(--cream); border: 4px solid var(--orange); border-radius: 4px; padding: 6px 16px 6px 24px; }',
    '#pico-home .sign-board.is-warn { border-color: var(--warn); border-width: 8px; padding: 6px 12px 6px 20px; }',
    '#pico-home .sign-main { flex: 1; min-width: 0; }',
    '#pico-home .sign-main p { margin: 0; }',
    '#pico-home .sign-action { font-size: 22px; font-weight: 800; display: flex; align-items: center; gap: 12px; }',
    '#pico-home .sign-context, #pico-home .sign-when { font-size: 18px; }',
    '#pico-home .sign-when { display: flex; flex-wrap: wrap; align-items: center; column-gap: 12px; }',
    '#pico-home .sign-link { background: none; border: 0; padding: 0 2px; min-height: 44px; cursor: pointer;',
    '  color: #0645ad; text-decoration: underline; font-size: 18px; margin: -10px 0; }',
    '#pico-home .sign-go { flex: none; min-height: 48px; min-width: 44px; padding: 0 18px; background: var(--orange);',
    '  color: #fff; font-weight: 800; font-size: 18px; border: 0; border-radius: 4px; cursor: pointer; }',
    '#pico-home .sign-go:hover, #pico-home .sign-go:focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; }',
    '#pico-home .sign-grade { flex: none; min-width: 96px; max-width: 220px; min-height: 72px; padding: 2px 8px;',
    '  display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;',
    '  background: var(--paper); border: 4px solid var(--orange); border-radius: 4px; cursor: pointer; }',
    '#pico-home .sign-grade:hover, #pico-home .sign-grade:focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; }',
    '#pico-home .grade-num { font-size: 40px; font-weight: 800; line-height: 1; }',
    '#pico-home .grade-cap { font-size: 16px; }',
    '#pico-home .grade-status { font-size: 16px; }',
    /* Stage-select tiles. The tile art is recovered; the one-row grid is our reconstruction
       (the runtime captures never reached the game's stage-select screen). */
    '#pico-home .tiles { list-style: none; margin: 0 auto; padding: 0; display: flex; flex-wrap: wrap;',
    '  justify-content: center; gap: 8px 20px; }',
    '#pico-home .tiles li { position: relative; }',
    '#pico-home .tile { width: 168px; display: flex; flex-direction: column; align-items: center; background: none;',
    '  border: 6px solid transparent; padding: 4px 4px 6px; cursor: pointer; }',
    '#pico-home .tile[aria-disabled="true"] { cursor: default; }',
    '#pico-home .tile:focus-visible { outline: none; }',
    '#pico-home .tile:focus-visible .tile-name { text-decoration: underline; }',
    '#pico-home .tile-date { font-weight: 800; font-size: 18px; }',
    '#pico-home .tile-stage { position: relative; width: 128px; height: 88px; display: flex; flex-direction: column;',
    '  align-items: center; justify-content: flex-end; gap: 2px; }',
    '#pico-home .tile-stage .zzz { position: absolute; top: 8px; right: 4px; }',
    '#pico-home .tile-word { font-size: 14px; font-weight: 800; letter-spacing: .04em; }',
    '#pico-home .tile-floor { height: 32px; display: flex; align-items: flex-end; }',
    /* Same text as the calendar cell; long names are cut by CSS only, never by other data. */
    '#pico-home .tile-name { font-size: 17px; line-height: 1.3; min-height: 2.6em; margin-top: 4px; max-width: 100%;',
    '  overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; }',
    '#pico-home .tiles .continue { position: absolute; left: -30px; top: 72px; }',
    '#pico-home .tile.is-selected, #pico-home .action.is-selected { border-color: var(--orange);',
    '  clip-path: polygon(4px 0, calc(100% - 4px) 0, calc(100% - 4px) 2px, calc(100% - 2px) 2px, calc(100% - 2px) 4px, 100% 4px,',
    '    100% calc(100% - 4px), calc(100% - 2px) calc(100% - 4px), calc(100% - 2px) calc(100% - 2px),',
    '    calc(100% - 4px) calc(100% - 2px), calc(100% - 4px) 100%, 4px 100%, 4px calc(100% - 2px),',
    '    2px calc(100% - 2px), 2px calc(100% - 4px), 0 calc(100% - 4px), 0 4px, 2px 4px, 2px 2px, 4px 2px); }',
    /* The floor: the REAL classroom board (#classroom-board-mount, reparented here), sized to
       the height that is left so the home fits 1366x768 without scrolling. */
    '#pico-home .scene > .floor { flex: 1 0 0; min-height: 220px; container-type: size; display: flex;',
    '  flex-direction: column; justify-content: flex-end; align-items: center; }',
    '#pico-home .floor #classroom-board-mount { width: min(640px, 100%, calc((100cqh - 20px) * 0.96)) !important;',
    '  max-width: none !important; margin: 0 auto !important; }',
    '#pico-home .floor-band { flex: none; align-self: stretch; height: 16px; background: var(--orange); }',
    /* OPTION: the recovered menu window over a dimmed home. */
    '#pico-home .backdrop { position: fixed; inset: 0; z-index: 10; background: rgba(0, 0, 64, .45);',
    '  display: flex; align-items: center; justify-content: center; padding: 16px; overflow: auto; }',
    '#pico-home .backdrop[hidden] { display: none; }',
    '#pico-home .option-win { width: min(420px, 100%); }',
    '#pico-home .win-close { position: absolute; top: 0; right: 0; width: 44px; height: 44px;',
    '  background: none; border: 0; padding: 0; cursor: pointer; }',
    '#pico-home .win-close .sp { position: absolute; left: 20px; top: 11px; }',
    '#pico-home .win-close:focus-visible { outline: 3px solid var(--ink); outline-offset: -3px; }',
    '#pico-home .actions { list-style: none; margin: 0 auto; padding: 0; width: 100%; }',
    '#pico-home .option-head { margin: 10px 0 2px; font-size: 14px; font-weight: 800; text-align: center; letter-spacing: .06em; }',
    '#pico-home .action { width: 100%; min-height: 48px; margin: 2px 0; display: flex; align-items: center;',
    '  justify-content: center; gap: 6px; background: none; border: 6px solid transparent; cursor: pointer;',
    '  font-size: 18px; font-weight: 800; letter-spacing: .04em; }',
    '#pico-home .action:focus-visible { outline: none; }',
    '#pico-home .action:focus-visible .action-text { text-decoration: underline; }',
    /* LESSONS shows the existing calendar window over the home; its own close box returns. */
    'html.pico-home.pico-lessons-open #window-wrap { position: fixed; inset: 0; z-index: 6; overflow: auto;',
    '  background: rgba(0, 0, 64, .45); }',
    '@media (prefers-reduced-motion: no-preference) {',
    '  #pico-home .backdrop:not([hidden]) .win { animation: pico-win-in .12s ease-out; }',
    '  @keyframes pico-win-in { from { transform: scale(.96); opacity: 0; } to { transform: none; opacity: 1; } }',
    '}',
    '@media (max-width: 700px) {',
    '  #pico-home .player { margin-left: 0; }',
    '  #pico-home .tile { width: 140px; }',
    '  #pico-home .sign-board { flex-wrap: wrap; }',
    '}',
  ].join('\n');

  // ── Small DOM helpers ──────────────────────────────────────────────────────
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function button(className, text) {
    var node = el('button', className, text);
    node.type = 'button';
    return node;
  }

  function sprite(name, scale, extraClass) {
    var r = ATLAS[name];
    var s = scale || SCALE;
    var node = el('span', 'sp sp-' + name + (extraClass ? ' ' + extraClass : ''));
    node.setAttribute('aria-hidden', 'true');
    node.style.width = r.w * s + 'px';
    node.style.height = r.h * s + 'px';
    node.style.backgroundSize = ATLAS_SIZE.w * s + 'px ' + ATLAS_SIZE.h * s + 'px';
    node.style.backgroundPosition = (-r.x * s) + 'px ' + (-r.y * s) + 'px';
    return node;
  }

  function byId(id) {
    return document.getElementById(id);
  }

  // Call a Desk function by name if it exists. Never throws: the home must not break the Desk.
  function callDesk(name, args) {
    try {
      var fn = window[name];
      if (typeof fn !== 'function') return undefined;
      return fn.apply(window, args || []);
    } catch (_) {
      return undefined;
    }
  }

  // ── Reading the Desk's state ───────────────────────────────────────────────
  // The Desk's top-level `let`/`const` (S, cP, OFF, NC, EX, PO, R, MN) are shared with this
  // classic script by name; window.* covers the tests' stubs.

  function deskSchedule() {
    try { return Array.isArray(S) ? S : []; } catch (_) { return []; }
  }

  function deskPeriod() {
    try { return cP; } catch (_) { return 'B'; }
  }

  function deskToday() {
    var t = callDesk('tdy');
    if (t instanceof Date) return t;
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }

  function deskState() {
    return window.DeskState || {};
  }

  // Completion marks, read fresh the way rCal and paintLocalDoneCells read them
  // (getStudentMarks()), so a lesson finished between rebuilds ticks at once. The rCal
  // snapshot on DeskState is only a fallback.
  function freshMarks() {
    var marks = callDesk('getStudentMarks');
    if (marks && typeof marks === 'object') return marks;
    return deskState().gateMarks || {};
  }

  // Next-up = the call rCal and paintLocalDoneCells both make, with the same inputs:
  // calNextUpTopic(_orderedPeriodTopics(), marks). Falls back to rCal's DeskState value.
  function freshNextUp(marks) {
    var ordered = callDesk('_orderedPeriodTopics');
    if (typeof window.calNextUpTopic !== 'function' || !Array.isArray(ordered)) return deskState().nextUpTopic || null;
    var next = callDesk('calNextUpTopic', [ordered, marks]);
    return next === undefined ? (deskState().nextUpTopic || null) : next;
  }

  function sentinels() {
    try { return { OFF: OFF, NC: NC, EX: EX, PO: PO, R: R }; } catch (_) { return {}; }
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function isSignedIn() {
    return Boolean(callDesk('getStudentEmail'));
  }

  function isTeacher() {
    return callDesk('_deskIsTeacher') === true;
  }

  function isPreviewingAsStudent() {
    return callDesk('_previewAsStudentActive') === true;
  }

  // The calendar cell's own label: the `.tl` text of htm(inf, ds), parsed inertly.
  var parser = document.implementation.createHTMLDocument('');
  function cellParts(inf, ds) {
    var html = callDesk('htm', [inf, ds]);
    var box = parser.createElement('div');
    box.innerHTML = typeof html === 'string' ? html : '';
    var tl = box.querySelector('.tl');
    return { label: tl ? tl.textContent.trim() : '' };
  }

  // The tile "!" = exactly the set _paintZeroCells paints on the calendar: lessons whose zero has
  // already landed (w.past). Zeros that are only coming stay on the sign.
  function zeroTopics() {
    var set = {};
    var warns = callDesk('_zeroCurrentWarnings');
    if (!Array.isArray(warns)) return set;
    warns.forEach(function (w) { if (w && w.past && w.lessonKey) set[w.lessonKey] = true; });
    return set;
  }

  // ── Weeks: the schedule S grouped Mon–Fri, the way rCal groups it ─────────
  function mondayOf(date) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var dow = d.getDay();
    d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
    return d;
  }

  function buildWeeks() {
    var weeks = [];
    var byMonday = {};
    deskSchedule().forEach(function (entry) {
      var date = new Date(entry[0], entry[1], entry[2]);
      var monday = mondayOf(date);
      var key = monday.getTime();
      if (!byMonday[key]) {
        byMonday[key] = { monday: monday, entries: {}, summer: false };
        weeks.push(byMonday[key]);
      }
      byMonday[key].entries[date.getDay()] = entry;
    });
    // Summer-prep weeks go in front, as rCal does (empty once school has started).
    var summer = callDesk('_summerWeeks');
    if (!Array.isArray(summer) || !summer.length) return weeks;
    var front = summer.map(function (wk) {
      var entries = {};
      wk.d.forEach(function (entry) { entries[new Date(entry[0], entry[1], entry[2]).getDay()] = entry; });
      return { monday: wk.m, entries: entries, summer: true };
    });
    return front.concat(weeks);
  }

  // Today's week; before the year the first week, after it the last.
  function todayWeekIndex(weeks, today) {
    if (!weeks.length) return 0;
    for (var i = 0; i < weeks.length; i++) {
      var end = new Date(weeks[i].monday);
      end.setDate(end.getDate() + 6);
      if (today >= weeks[i].monday && today <= end) return i;
    }
    if (today < weeks[0].monday) return 0;
    return weeks.length - 1;
  }

  // ── Days: one tile's facts, all from the Desk ─────────────────────────────
  function isClickable(inf, c) {
    return Boolean(inf && inf !== c.OFF && inf !== c.NC && inf !== c.EX && inf !== c.PO && inf.t);
  }

  function isLessonCell(inf) {
    return Boolean(inf && typeof inf === 'object' && /^\d+\.\d+/.test(inf.t));
  }

  // The Day vocabulary kind for a cell: lesson / pc / work / noClass / sign.
  function dayKind(inf, c) {
    if (!inf || inf === c.NC || inf === c.OFF) return 'noClass';
    if (inf.kind === 'break') return 'noClass';
    if (inf.kind === 'work') return 'work';
    if (inf.kind === 'pc') return 'pc';
    if (inf === c.EX || inf === c.PO) return 'sign';
    if (inf.kind === 'poster' || inf.kind === 'orientation' || inf.kind === 'baseline') return 'sign';
    if (inf.t === c.R) return 'sign';
    if (isLessonCell(inf)) return 'lesson';
    return 'sign';
  }

  function buildDay(week, dow, today, ctx) {
    var date = new Date(week.monday);
    date.setDate(date.getDate() + (dow - 1));
    var entry = week.entries[dow];
    var inf = entry ? (ctx.period === 'B' ? entry[3] : entry[4]) : null;
    var ds = MONTH_SHORT[date.getMonth()] + ' ' + date.getDate();
    try { if (Array.isArray(MN)) ds = MN[date.getMonth()] + ' ' + date.getDate(); } catch (_) {}
    var day = {
      date: date, ds: ds, inf: inf, summer: week.summer,
      kind: dayKind(inf, ctx.c),
      today: sameDay(date, today),
      label: '', aria: ds, done: false, warn: false, next: false,
    };
    if (entry) {
      day.label = cellParts(inf, ds).label;
      var aria = callDesk('cellAria', [inf, ds]);
      if (typeof aria === 'string') day.aria = aria;
    }
    if (day.kind !== 'lesson') return day;
    day.done = callDesk('localLessonState', [inf.t, ctx.marks]) === 'done';
    day.warn = String(inf.t).split('+').some(function (key) { return ctx.zeros[key]; });
    // Continue here = the next-up cell rCal highlights (summer cells: the summer next-up).
    day.next = inf.t === ctx.nextUp || (week.summer && ctx.summerNextUp && inf.t === ctx.summerNextUp);
    return day;
  }

  function weekUnits(days) {
    var units = [];
    days.forEach(function (day) {
      var inf = day.inf;
      if (!inf || typeof inf !== 'object') return;
      var unit = (inf.ced && inf.ced.unit) || inf.u;
      if (unit && units.indexOf(unit) < 0) units.push(unit);
    });
    return units;
  }

  // ── State of the view ──────────────────────────────────────────────────────
  var view = { weekIndex: null, selected: 0, days: [], menu: null, menuOpener: null, menuSelected: 0, lessonsOpener: null };

  // ── Tile clicks: the same handler the calendar cell calls (rCal) ──────────
  function openDay(day) {
    var c = sentinels();
    var inf = day.inf;
    if (!isClickable(inf, c)) return;
    if (isLessonCell(inf) && isLocked(day)) {
      var prev = previousTopic(day);
      callDesk('_showLessonLockedDialog', [inf.t, prev, day.ds]);
      return;
    }
    if (inf.kind === 'orientation') { callDesk('openGradeHelp'); return; }
    if (inf.kind === 'baseline') { callDesk('_openBaselineInfo'); return; }
    callDesk('maybeBumpThenOpen', [inf, day.ds]);
  }

  function previousTopic(day) {
    var name = day.summer ? '_prevSummerTopic' : '_prevTopicInSequence';
    var prev = callDesk(name, [day.inf.t]);
    return prev == null ? null : prev;
  }

  // The Desk's own gate (it has returned "unlocked" for every lesson since 2026-09-10).
  function isLocked(day) {
    if (typeof window._isLessonUnlocked !== 'function') return false;
    var marks = freshMarks();
    var unlocked = callDesk('_isLessonUnlocked', [day.inf.t, day.date, previousTopic(day), deskToday(), marks, isSignedIn()]);
    return unlocked === false;
  }

  function openDayGrade(day) {
    if (!isClickable(day.inf, sentinels())) return;
    callDesk('openDayGrade', [day.ds]);
  }

  // ── Render: week picker ───────────────────────────────────────────────────
  function renderWeek(weeks, days) {
    var index = view.weekIndex;
    var monday = weeks.length ? weeks[index].monday : mondayOf(deskToday());
    byId('pico-week-title').textContent = 'WEEK OF ' + MONTHS[monday.getMonth()] + ' ' + monday.getDate();
    byId('pico-week-page').textContent = weeks.length ? '(' + (index + 1) + '/' + weeks.length + ')' : '';
    var units = weekUnits(days);
    byId('pico-unit').textContent = units.length ? 'UNIT ' + units.join(' / ') : '';
    byId('pico-week-prev').disabled = index <= 0;
    byId('pico-week-next').disabled = index >= weeks.length - 1;
    var lessons = days.filter(function (d) { return d.kind === 'lesson'; });
    var allDone = lessons.length > 0 && lessons.every(function (d) { return d.done; });
    byId('pico-crown').hidden = !allDone;
    var examNum = byId('cd-days') && byId('cd-days').querySelector('.num');
    var examText = examNum ? examNum.textContent.trim() : '';
    byId('pico-exam').textContent = /^\d+$/.test(examText) ? examText + ' days to exam' : '';
    var onToday = index === todayWeekIndex(weeks, deskToday());
    var todayBtn = document.querySelector('#pico-home .navbtn[data-nav="TODAY"]');
    if (onToday) todayBtn.setAttribute('aria-current', 'page');
    else todayBtn.removeAttribute('aria-current');
  }

  // ── Render: tiles ──────────────────────────────────────────────────────────
  function tileStage(day) {
    var stage = el('span', 'tile-stage');
    if (day.kind === 'pc') stage.appendChild(sprite('flag'));
    // Work Day: the push block; the words come from the cell's own label ("Work Day") below.
    if (day.kind === 'work') stage.appendChild(sprite('pushBox'));
    if (day.kind === 'noClass') {
      stage.appendChild(sprite('lyingCat'));
      stage.appendChild(sprite('zzz', SCALE, 'zzz'));
      stage.appendChild(el('span', 'tile-word', 'NO CLASS'));
    }
    if (day.kind === 'sign') stage.appendChild(sprite('signboard'));
    if (day.kind !== 'lesson') return stage;
    // Lesson: nothing for not started, "!" for missing work, tick for done.
    if (day.warn) stage.appendChild(sprite('bang'));
    else if (day.done) stage.appendChild(sprite('tick'));
    return stage;
  }

  // Words for screen readers that the marks carry visually.
  function tileAria(day) {
    var bits = [day.aria];
    if (day.today) bits.push('today');
    if (day.done) bits.push('complete');
    if (day.warn) bits.push('has work that became a zero');
    if (day.next) bits.push('continue here');
    return bits.join(', ');
  }

  function startTile(days) {
    for (var i = 0; i < days.length; i++) if (days[i].next) return i;
    for (var j = 0; j < days.length; j++) if (days[j].today) return j;
    return 0;
  }

  function selectTile(index, moveFocus) {
    var buttons = document.querySelectorAll('#pico-tiles .tile');
    if (!buttons.length) return;
    view.selected = (index + buttons.length) % buttons.length;
    buttons.forEach(function (btn, i) { btn.classList.toggle('is-selected', i === view.selected); });
    if (moveFocus && document.activeElement !== buttons[view.selected]) buttons[view.selected].focus();
  }

  function renderTiles(days) {
    var list = byId('pico-tiles');
    var hadFocus = list.contains(document.activeElement);
    list.textContent = '';
    days.forEach(function (day, i) {
      var item = el('li');
      if (day.next) item.appendChild(sprite('triangleBlue', SCALE, 'continue'));
      var btn = button('tile');
      if (!isClickable(day.inf, sentinels())) btn.setAttribute('aria-disabled', 'true');
      btn.setAttribute('aria-label', tileAria(day));
      btn.appendChild(el('span', 'tile-date', DOW[day.date.getDay()] + ' ' + day.date.getDate()));
      btn.appendChild(tileStage(day));
      var floor = el('span', 'tile-floor');
      floor.appendChild(sprite(day.today ? 'tileRaised' : 'platform'));
      btn.appendChild(floor);
      var name = el('span', 'tile-name', day.label);
      name.title = day.label;
      btn.appendChild(name);
      btn.addEventListener('click', function () { selectTile(i, false); openDay(day); });
      btn.addEventListener('dblclick', function (event) { event.preventDefault(); openDayGrade(day); });
      btn.addEventListener('contextmenu', function (event) { event.preventDefault(); openDayGrade(day); });
      btn.addEventListener('focus', function () { selectTile(i, false); });
      btn.addEventListener('mouseenter', function () { selectTile(i, false); });
      item.appendChild(btn);
      list.appendChild(item);
    });
    var keep = hadFocus ? Math.min(view.selected, days.length - 1) : startTile(days);
    selectTile(keep, hadFocus);
  }

  // Left / Right move the selection. Called from the capture-phase key handler, which also
  // stops arrows and Space so the cat does not walk or jump while a day is being chosen
  // (Space still presses the focused tile, since buttons activate on keyup).
  function onTileKey(event) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    selectTile(view.selected + (event.key === 'ArrowRight' ? 1 : -1), true);
  }

  // ── Render: the sign (mirrors the Do Now card) ────────────────────────────
  function doNowLines() {
    var msg = byId('donow-msg');
    var card = byId('donow-card');
    if (!msg || !card || card.style.display === 'none') return [];
    return msg.textContent.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function doNowWarn() {
    var card = byId('donow-card');
    if (!card) return false;
    return card.classList.contains('donow-zeros-soon') || card.classList.contains('donow-zeros-now');
  }

  // The missing-work pill's own words ("2 become a 0 by Thu Oct 8").
  function missingPillText() {
    var pill = document.querySelector('#donow-grades .qpill-missing');
    return pill ? pill.textContent.trim() : '';
  }

  // The current quarter's pill exactly as the Do Now shows it (official when published).
  function gradeInfo() {
    var status = byId('donow-grade-status');
    if (status && status.style.display !== 'none' && status.textContent.trim()) {
      var span = status.querySelector('span');
      return { status: (span || status).textContent.trim() };
    }
    var pill = document.querySelector('#donow-grades .qpill:not(.qpill-missing)');
    if (!pill) return null;
    var key = pill.querySelector('.qkey');
    var value = pill.querySelector('.qgrade');
    var rule = pill.querySelector('.qrule');
    return {
      key: key ? key.textContent.trim() : '',
      value: value ? value.textContent.trim() : '',
      official: Boolean(rule && /official/.test(rule.textContent)),
    };
  }

  // The Do Now's own primary action: today's lesson panel when there is one, else the card.
  function signOpen() {
    var todayInf = deskState().todayLessonInf;
    if (todayInf == null) { try { todayInf = _todayLessonInf; } catch (_) { todayInf = null; } }
    if (todayInf) { callDesk('_focusTodayLessonVideo'); return; }
    showLessons(byId('pico-sign-go'));
    callDesk('_menuShowDoNow');
  }

  function renderGrade(board) {
    var info = gradeInfo();
    var grade = button('sign-grade');
    grade.addEventListener('click', function () { callDesk('openWallet'); });
    if (info && info.status) {
      grade.appendChild(el('span', 'grade-status', info.status));
      grade.setAttribute('aria-label', info.status + ' Open My Grade');
      board.appendChild(grade);
      return;
    }
    var value = info && info.value ? info.value : '—';
    var caption = info ? (info.key + (info.official ? ' official' : '')) : 'My grade';
    grade.appendChild(el('span', 'grade-num', value));
    grade.appendChild(el('span', 'grade-cap', caption));
    grade.setAttribute('aria-label', caption + ' grade ' + value + '. Open My Grade');
    board.appendChild(grade);
  }

  function renderSignedOut(board) {
    var main = el('div', 'sign-main');
    main.appendChild(el('p', 'sign-action', 'Sign in to see your work'));
    board.appendChild(main);
    var go = button('sign-go', 'Sign in');
    go.id = 'pico-sign-go';
    go.addEventListener('click', function () { callDesk('openSignInModal'); });
    board.appendChild(go);
  }

  function renderSign() {
    var board = byId('pico-sign');
    board.textContent = '';
    board.classList.remove('is-warn');
    if (!isSignedIn()) { renderSignedOut(board); return; }

    var lines = doNowLines();
    var warn = doNowWarn();
    board.classList.toggle('is-warn', warn);
    var main = el('div', 'sign-main');
    var action = el('p', 'sign-action');
    if (warn) action.appendChild(sprite('bang'));
    action.appendChild(el('span', null, lines[0] || '…'));
    main.appendChild(action);
    if (lines.length > 1) main.appendChild(el('p', 'sign-context', lines.slice(1).join(' ')));
    if (warn) {
      var when = el('p', 'sign-when');
      var pillText = missingPillText();
      if (pillText) when.appendChild(el('span', null, pillText));
      var link = button('sign-link', 'See all missing work');
      link.addEventListener('click', function () { callDesk('openWallet'); });
      when.appendChild(link);
      main.appendChild(when);
    }
    board.appendChild(main);

    var go = button('sign-go', 'Open');
    go.id = 'pico-sign-go';
    go.setAttribute('aria-label', 'Open my Do Now');
    go.addEventListener('click', signOpen);
    board.appendChild(go);
    renderGrade(board);
  }

  // ── Render: name · period ──────────────────────────────────────────────────
  function playerName() {
    var who = null;
    try { who = window.rosterClient && window.rosterClient.current && window.rosterClient.current(); } catch (_) { who = null; }
    if (who && who.expired) return 'Sign-in expired';
    if (who) return who.realName || who.username || '';
    if (isSignedIn()) return String(callDesk('getStudentEmail'));
    return 'Not signed in';
  }

  function badgeCount(id) {
    var badge = byId(id);
    if (!badge || badge.hidden) return 0;
    var n = parseInt(badge.textContent, 10);
    return n > 0 ? n : 0;
  }

  // Badges that exist today (message from the teacher, teacher inbox) show on OPTION.
  function optionBadgeCount() {
    var total = badgeCount('menu-message-teacher-badge');
    if (isTeacher()) total += badgeCount('menu-teacher-inbox-badge');
    return total;
  }

  function setNavBadge(id, count, bob) {
    var badge = byId(id);
    badge.hidden = count === 0;
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.classList.toggle('is-bobbing', Boolean(bob) && count > 0);
  }

  function renderNav() {
    byId('pico-player').textContent = playerName() + ' · Period ' + deskPeriod();
    setNavBadge('pico-option-badge', optionBadgeCount(), false);
    // LESSONS carries the Bulletin (notices soon) and Review (cards due) icon badges.
    setNavBadge('pico-lessons-badge', bulletinBadge() + reviewBadge(), reviewBobbing());
  }

  // ── Render: everything ─────────────────────────────────────────────────────
  function render() {
    var root = byId('pico-home');
    if (!root) return;
    var weeks = buildWeeks();
    var today = deskToday();
    if (view.weekIndex == null || view.weekIndex >= weeks.length) view.weekIndex = todayWeekIndex(weeks, today);
    var marks = freshMarks();
    var ctx = {
      period: deskPeriod(),
      c: sentinels(),
      marks: marks,
      zeros: zeroTopics(),
      nextUp: freshNextUp(marks),
      summerNextUp: (function () { try { return _calNextUp; } catch (_) { return null; } })(),
    };
    var days = [];
    if (weeks.length) {
      for (var dow = 1; dow <= 5; dow++) days.push(buildDay(weeks[view.weekIndex], dow, today, ctx));
    }
    view.days = days;
    renderNav();
    renderWeek(weeks, days);
    renderSign();
    renderTiles(days);
  }

  var renderTimer = null;
  function scheduleRender() {
    if (renderTimer) return;
    renderTimer = setTimeout(function () { renderTimer = null; render(); }, 30);
  }

  function goWeek(step) {
    view.weekIndex = (view.weekIndex || 0) + step;
    render();
  }

  function goToday() {
    view.weekIndex = null;
    render();
  }

  // ── SCHEDULE: the existing calendar window over the home ──────────────────
  function showLessons(opener) {
    view.lessonsOpener = opener || null;
    document.documentElement.classList.add('pico-lessons-open');
    callDesk('restoreWindow');
  }

  // The window's own close / minimize boxes set display:none on #window-wrap.
  function watchLessonsWindow() {
    var wrap = byId('window-wrap');
    if (!wrap || typeof MutationObserver !== 'function') return;
    new MutationObserver(function () {
      if (wrap.style.display !== 'none') return;
      if (!document.documentElement.classList.contains('pico-lessons-open')) return;
      document.documentElement.classList.remove('pico-lessons-open');
      if (view.lessonsOpener) view.lessonsOpener.focus();
    }).observe(wrap, { attributes: true, attributeFilter: ['style'] });
  }

  // True when a Desk dialog or app window is showing, so Esc belongs to it.
  function deskOverlayOpen() {
    var nodes = document.querySelectorAll('[id$="-overlay"], .app-overlay, [role="dialog"]');
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (node.closest('#pico-home') || node.closest('#window-wrap')) continue;
      var display = node.style.display;
      if (display && display !== 'none') return true;
    }
    return false;
  }

  // ── Badges the desktop icons carry today, read from the icons themselves ──
  function iconBadgeCount(selector) {
    var badge = document.querySelector(selector);
    if (!badge) return 0;
    var n = parseInt(badge.textContent, 10);
    return n > 0 ? n : 0;
  }

  function bulletinBadge() {
    return iconBadgeCount('.app-icon[data-app="bulletin"] .bulletin-soon-badge');
  }

  function reviewBadge() {
    return iconBadgeCount('.app-icon[data-app="review"] .review-due-badge');
  }

  // The Review icon bobs while cards are due (class review-has-due); the Pico badge bobs too.
  function reviewBobbing() {
    var icon = document.querySelector('.app-icon[data-app="review"]');
    return Boolean(icon && icon.classList.contains('review-has-due'));
  }

  // ── Menus (OPTION, LESSONS, PRACTICE): one recovered window, one list ─────
  function optionItems() {
    var items = [];
    if (isSignedIn()) items.push({ label: 'SIGN OUT', run: function () { callDesk('signOutStudent'); } });
    else items.push({ label: 'SIGN IN', run: function () { callDesk('openSignInModal'); } });
    items.push({ label: 'CHANGE PASSWORD', run: function () { callDesk('changeMyPassword'); } });
    var muted = false;
    try { muted = Boolean(MacSFX && MacSFX.muted); } catch (_) { muted = false; }
    items.push({ label: 'SOUND: ' + (muted ? 'OFF' : 'ON'), keepOpen: true, run: function () { callDesk('_toggleSound'); } });
    ['B', 'E'].forEach(function (p) {
      items.push({ label: 'PERIOD ' + p, pressed: deskPeriod() === p, run: function () { callDesk('setP', [p]); } });
    });
    items.push({ label: 'MESSAGE TEACHER', badge: badgeCount('menu-message-teacher-badge'), run: function () { callDesk('_openStudentDmModal'); } });
    items.push({ label: 'HOW GRADES WORK', run: function () { callDesk('openGradeHelp'); } });
    items.push({ label: 'START HERE', run: function () { window.open('start-here.html', '_blank', 'noopener'); } });
    items.push({ label: 'USE ORIGINAL DESK', run: useOriginalDesk });
    if (isTeacher()) {
      items.push({ head: 'TEACHER' });
      items.push({ label: 'TEACHER WORKSPACE', run: function () { callDesk('openTeacherTools'); } });
      items.push({ label: 'TEACHER INBOX', badge: badgeCount('menu-teacher-inbox-badge'), run: function () { callDesk('openTeacherInbox'); } });
      items.push({ label: 'DOK LADDERS', run: function () { callDesk('openApp', ['dok']); } });
      items.push({ label: 'PREVIEW AS STUDENT', run: function () { callDesk('_togglePreviewAsStudent'); } });
    } else if (isPreviewingAsStudent()) {
      // A teacher previewing as a student needs the way back (the Desk's own toggle).
      items.push({ head: 'TEACHER' });
      items.push({ label: 'EXIT PREVIEW AS STUDENT', run: function () { callDesk('_togglePreviewAsStudent'); } });
    }
    return items;
  }

  // LESSONS: the routes the desktop icons and the Apps / Go menus give today.
  function lessonsItems() {
    return [
      { label: 'SCHEDULE', run: function () { showLessons(view.menuOpener); } },
      { label: 'BULLETIN', badge: bulletinBadge(), run: function () { callDesk('openBulletin'); } },
      { label: 'REVIEW', badge: reviewBadge(), bob: reviewBobbing(), run: function () { callDesk('openReview'); } },
      { label: 'THIS WEEK', run: function () { callDesk('openApp', ['week']); } },
      { label: 'PRACTICE', submenu: 'PRACTICE' },
    ];
  }

  // LESSONS → PRACTICE: the Apps-menu trainers and the Go-menu study links.
  function practiceItems() {
    return [
      { label: 'TI-84 TRAINER', run: function () { callDesk('openApp', ['ti84']); } },
      { label: 'AP STATS QUIZ', run: function () { callDesk('openApp', ['quiz']); } },
      { label: 'FORMULA LAB', run: function () { callDesk('openApp', ['formulas']); } },
      { label: 'FORMULA DEFENSE', run: function () { window.open('https://tmux-trainer.vercel.app/#deck=ap-stats-formulas', '_blank', 'noopener'); } },
      { label: 'STUDY GUIDE', run: function () { window.open('study_guide_diagnostic.html', '_blank', 'noopener'); } },
      { label: 'ALL WORKSHEETS', run: function () { window.open('TOC.html', '_blank', 'noopener'); } },
      { label: 'BACK', submenu: 'LESSONS' },
    ];
  }

  var MENUS = {
    OPTION: { title: 'OPTION', items: optionItems },
    LESSONS: { title: 'LESSONS', items: lessonsItems },
    PRACTICE: { title: 'LESSONS · PRACTICE', items: practiceItems },
  };

  function menuButtons() {
    return document.querySelectorAll('#pico-menu-list .action');
  }

  function selectMenuItem(index, moveFocus) {
    var buttons = menuButtons();
    if (!buttons.length) return;
    var i = (index + buttons.length) % buttons.length;
    buttons.forEach(function (btn, j) { btn.classList.toggle('is-selected', j === i); });
    view.menuSelected = i;
    if (moveFocus) buttons[i].focus();
  }

  function itemBadge(item) {
    var badge = el('span', 'nav-badge' + (item.bob ? ' is-bobbing' : ''), item.badge > 9 ? '9+' : String(item.badge));
    badge.setAttribute('aria-label', item.badge + ' new');
    return badge;
  }

  function renderMenuList() {
    var menu = MENUS[view.menu];
    byId('pico-menu-title').textContent = menu.title;
    var list = byId('pico-menu-list');
    list.setAttribute('aria-label', menu.title);
    list.textContent = '';
    var index = 0;
    menu.items().forEach(function (item) {
      var li = el('li');
      if (item.head) {
        li.appendChild(el('p', 'option-head', item.head));
        list.appendChild(li);
        return;
      }
      var btn = button('action');
      var myIndex = index++;
      btn.appendChild(el('span', 'action-text', item.label));
      if (item.submenu) btn.setAttribute('aria-haspopup', 'menu');
      if (item.pressed != null) btn.setAttribute('aria-pressed', item.pressed ? 'true' : 'false');
      if (item.badge) btn.appendChild(itemBadge(item));
      btn.addEventListener('click', function () { runMenuItem(item, myIndex); });
      btn.addEventListener('focus', function () { selectMenuItem(myIndex, false); });
      btn.addEventListener('mouseenter', function () { selectMenuItem(myIndex, false); });
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  function runMenuItem(item, index) {
    if (item.submenu) {
      view.menu = item.submenu;
      renderMenuList();
      selectMenuItem(0, true);
      return;
    }
    if (item.keepOpen) {
      item.run();
      renderMenuList();
      selectMenuItem(index, true);
      return;
    }
    closeMenu(false);
    item.run();
  }

  function isMenuOpen() {
    return !byId('pico-menu-backdrop').hidden;
  }

  function openMenu(name, opener) {
    view.menu = name;
    view.menuOpener = opener;
    renderMenuList();
    byId('pico-menu-backdrop').hidden = false;
    selectMenuItem(0, true);
  }

  function closeMenu(returnFocus) {
    var backdrop = byId('pico-menu-backdrop');
    if (backdrop.hidden) return;
    backdrop.hidden = true;
    if (returnFocus !== false && view.menuOpener) view.menuOpener.focus();
  }

  // Keys inside an open menu: Esc closes, Up/Down move the selection, Tab stays inside the
  // window. Called from onCaptureKey, so it sees the key before the Desk's own capture-phase
  // activity handler and the classroom board's document listener.
  function onMenuKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      selectMenuItem((view.menuSelected || 0) + (event.key === 'ArrowDown' ? 1 : -1), true);
      return;
    }
    if (event.key !== 'Tab') return;
    var focusable = byId('pico-menu').querySelectorAll('button');
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); return; }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  // Left / Right page the week while focus is on the week picker's arrows.
  function onWeekKey(event) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    goWeek(event.key === 'ArrowRight' ? 1 : -1);
  }

  var GAME_KEYS = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, ' ': 1, Spacebar: 1 };

  // One capture-phase listener on window runs before every Desk key handler (window comes
  // before document on the capture path). While a Pico menu is open, or focus is on the week
  // picker or the tiles, the keys are handled here and stopped, so the Desk's activity
  // handler and the classroom board never also act on them. Everything else passes through.
  function onCaptureKey(event) {
    var target = event.target;
    var inPico = Boolean(target && target.closest && target.closest('#pico-home'));
    if (isMenuOpen()) {
      // Keys from the menu itself; Esc also when focus has fallen back to the page body.
      // A Desk dialog opened on top keeps its own keys.
      var inMenu = inPico && Boolean(target.closest('#pico-menu-backdrop'));
      var looseEsc = event.key === 'Escape' && (!target || target === document || target === document.body || target === document.documentElement);
      if (!inMenu && !looseEsc) return;
      onMenuKey(event);
      if (GAME_KEYS[event.key] || event.key === 'Escape' || event.key === 'Tab') event.stopPropagation();
      return;
    }
    if (!inPico || !GAME_KEYS[event.key]) return;
    if (target.closest('#pico-tiles')) onTileKey(event);
    else if (target.closest('.carousel')) onWeekKey(event);
    else return;
    event.stopPropagation();
  }

  // ── The flag ───────────────────────────────────────────────────────────────
  function useOriginalDesk() {
    try { localStorage.removeItem(FLAG_KEY); } catch (_) {}
    var url = new URL(window.location.href);
    url.searchParams.delete('home');
    window.location.href = url.toString();
  }

  // ── Building the home ──────────────────────────────────────────────────────
  var MARKUP = [
    '<div class="scene">',
    '  <div class="topnav">',
    '    <h1 class="title">APSTAT PARK</h1>',
    '    <nav aria-label="Main"><ul class="navlist">',
    '      <li><button type="button" class="navbtn" data-nav="TODAY">TODAY</button></li>',
    '      <li><button type="button" class="navbtn" data-nav="LESSONS" aria-haspopup="dialog">LESSONS<span class="nav-badge" id="pico-lessons-badge" hidden></span></button></li>',
    '      <li><button type="button" class="navbtn" data-nav="MY GRADE">MY GRADE</button></li>',
    '      <li><button type="button" class="navbtn" data-nav="OPTION" aria-haspopup="dialog">OPTION<span class="nav-badge" id="pico-option-badge" hidden></span></button></li>',
    '    </ul></nav>',
    '    <span class="player" id="pico-player"></span>',
    '  </div>',
    '  <section class="week-b" aria-label="Week">',
    '    <div class="win week-win">',
    '      <div class="win-bar" id="pico-unit"></div>',
    '      <div class="win-body week-win-body">',
    '        <span class="carousel">',
    '          <button type="button" class="arrow" id="pico-week-prev" aria-label="Previous week"></button>',
    '          <h2 class="week-title" id="pico-week-title"></h2>',
    '          <button type="button" class="arrow" id="pico-week-next" aria-label="Next week"></button>',
    '        </span>',
    '        <span class="week-page" id="pico-week-page"></span>',
    '        <span class="crown" id="pico-crown" hidden><span class="sr-only">Whole week finished</span></span>',
    '        <span class="week-exam" id="pico-exam"></span>',
    '      </div>',
    '    </div>',
    '  </section>',
    '  <section class="sign" aria-label="Do Now">',
    '    <div class="sign-board" id="pico-sign"></div>',
    '    <span id="pico-sign-post"></span>',
    '  </section>',
    '  <ol class="tiles" id="pico-tiles" aria-label="This week"></ol>',
    '  <div class="floor" id="pico-floor"><div class="floor-band"></div></div>',
    '</div>',
    '<div class="backdrop" id="pico-menu-backdrop" hidden>',
    '  <section class="win option-win" id="pico-menu" role="dialog" aria-modal="true" aria-labelledby="pico-menu-title">',
    '    <div class="win-bar" id="pico-menu-title"></div>',
    '    <button type="button" class="win-close" id="pico-menu-close" aria-label="Close"></button>',
    '    <div class="win-body"><ul class="actions" id="pico-menu-list"></ul></div>',
    '  </section>',
    '</div>',
  ].join('\n');

  function injectStyle() {
    if (byId('pico-home-style')) return;
    var style = el('style');
    style.id = 'pico-home-style';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function buildRoot() {
    var root = el('div');
    root.id = 'pico-home';
    root.innerHTML = MARKUP;
    var mount = byId('pico-home-mount') || document.body;
    mount.appendChild(root);
    byId('pico-week-prev').appendChild(sprite('triOutLeft'));
    byId('pico-week-next').appendChild(sprite('triOutRight'));
    byId('pico-crown').appendChild(sprite('crown'));
    byId('pico-sign-post').appendChild(sprite('signPost'));
    byId('pico-menu-close').appendChild(sprite('close', 1));
    // The floor is the REAL board: the existing node moves here, never a second board.
    var board = byId('classroom-board-mount');
    if (board) byId('pico-floor').insertBefore(board, byId('pico-floor').firstChild);
    return root;
  }

  function wire() {
    byId('pico-week-prev').addEventListener('click', function () { goWeek(-1); });
    byId('pico-week-next').addEventListener('click', function () { goWeek(1); });
    document.querySelectorAll('#pico-home .navbtn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var name = btn.getAttribute('data-nav');
        if (name === 'TODAY') { goToday(); return; }
        if (name === 'MY GRADE') { callDesk('openWallet'); return; }
        openMenu(name, btn);
      });
    });
    byId('pico-menu-close').addEventListener('click', function () { closeMenu(); });
    byId('pico-menu-backdrop').addEventListener('click', function (event) {
      if (event.target === event.currentTarget) closeMenu();
    });
    window.addEventListener('keydown', onCaptureKey, true);
    // Esc closes the SCHEDULE window when no Desk dialog is on top of it.
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (!document.documentElement.classList.contains('pico-lessons-open')) return;
      if (deskOverlayOpen()) return;
      callDesk('closeCalendar');
    });
    watchLessonsWindow();
    watchDesk();
  }

  // Re-render whenever the Desk re-renders or repaints the calendar or the Do Now. The Desk's
  // functions are wrapped (call the original, then schedule a render); their bodies are never
  // touched. The observers catch DOM changes made by any other path.
  var WRAPPED = ['rCal', 'renderDoNow', 'paintLocalDoneCells', 'paintDonowCells'];

  function wrapDeskFunction(name) {
    var original = window[name];
    if (typeof original !== 'function' || original.picoWrapped) return;
    var wrapped = function () {
      var result = original.apply(this, arguments);
      scheduleRender();
      if (result && typeof result.then === 'function') result.then(scheduleRender, scheduleRender);
      return result;
    };
    wrapped.picoWrapped = true;
    window[name] = wrapped;
  }

  function watchDesk() {
    WRAPPED.forEach(wrapDeskFunction);
    if (typeof MutationObserver !== 'function') return;
    var observer = new MutationObserver(scheduleRender);
    var watch = [
      ['#cg', { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] }],
      ['#donow-card', { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style'] }],
      ['#menu-identity', { childList: true, subtree: true, characterData: true }],
      ['#menu-message-teacher-badge', { childList: true, attributes: true, attributeFilter: ['hidden'] }],
      ['#menu-teacher-inbox-badge', { childList: true, attributes: true, attributeFilter: ['hidden'] }],
      ['#cd-days', { childList: true, subtree: true, characterData: true }],
      ['.app-icon[data-app="bulletin"]', { childList: true, subtree: true, characterData: true }],
      ['.app-icon[data-app="review"]', { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] }],
    ];
    watch.forEach(function (pair) {
      var node = document.querySelector(pair[0]);
      if (node) observer.observe(node, pair[1]);
    });
  }

  function init() {
    if (byId('pico-home')) return;
    injectStyle();
    buildRoot();
    wire();
    render();
  }

  // For tests/pico-home.test.js.
  window.PicoHome = {
    atlas: ATLAS,
    atlasSize: ATLAS_SIZE,
    render: render,
    closeMenu: closeMenu,
    days: function () { return view.days; },
  };

  // The Desk's own functions are defined by later scripts on the page, so start once the
  // document has been parsed.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
