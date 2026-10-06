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
    '  position: fixed; inset: 0; z-index: 4; overflow-x: hidden; overflow-y: auto;',
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
    /* The floor: the REAL classroom board (#classroom-board-mount, reparented here) IS the page's
       bottom edge. It spans the whole page width with no box of its own (the board paints no
       background in its room; the page's white shows through), its ground line is the page's
       orange floor, and only the band from the floor up to the tallest idle thing standing on it
       is shown (the rest of the room is cropped above). While a game is running the band grows to
       the whole room (see layoutFloor). Signed out (no board yet) the Pico band is the floor. */
    '#pico-home .scene > .floor { flex: none; margin-top: auto; position: relative; overflow: hidden;',
    '  width: 100vw; margin-left: calc(50% - 50vw); margin-right: calc(50% - 50vw); }',
    '#pico-home .floor #classroom-board-mount { position: absolute !important; left: 0; right: 0; bottom: 0;',
    '  width: 100% !important; max-width: none !important; margin: 0 !important; }',
    '#pico-home .floor:not(.has-board) { height: 16px; }',
    '#pico-home .floor-band { position: absolute; left: 0; right: 0; bottom: 0; height: 16px; background: var(--orange); }',
    '#pico-home .floor.has-board .floor-band { display: none; }',
    /* The board's pull-down result screen holds a width:100% chart canvas (320x160 intrinsic); at
       page width that chart alone would be ~700 px tall and push the question, stepper and close
       button out of the board. Cap the chart (2:1, centred) at 320 px or the board height minus the
       controls (--pico-result-chart-max, set by layoutFloor), whichever is smaller. */
    '#pico-home #classroom-board-mount [data-classroom-result-canvas] { width: auto !important; max-width: 100%;',
    '  height: min(320px, var(--pico-result-chart-max, 320px)) !important; margin: 0 auto; }',
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
    /* Phase 2: the Desk's own lesson panel and ledger windows in the recovered frame. Scoped to
       html.pico-home (flag on); the Desk DOM keeps its place, ids and handlers. */
    'html.pico-home .pico-frame {',
    '  --orange: #FF864D; --paper: #FEFEFE; --ink: #000040;',
    '  --plain-font: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;',
    '}',
    'html.pico-home .pico-frame:not(.game-window) { isolation: isolate; text-align: left;',
    '  background: none !important; border: 0 !important; outline: 0 !important; box-shadow: none !important;',
    '  border-radius: 0 !important; padding: 31px 12px 12px !important;',
    '}',
    /* Study Break: zero change to the window's box (padding, border, size) so the game area is
       exactly the Desk's. The frame is a ring drawn with box-shadow (no layout), the title bar sits
       over the System 7 title bar's own strip, and the ✕ is the window's own close box. */
    'html.pico-home .pico-frame.game-window { box-shadow: 0 0 0 10px var(--orange) !important; }',
    'html.pico-home .pico-frame.game-window > .win-bar { top: 1px; left: 48px; right: 48px; height: 19px; pointer-events: none;',
    '  font-size: 13px; background: var(--orange); }',
    /* Study Break's ✕ is its own System 7 close box (onclick="closeGame()"), restyled in place:
       44px wide, exactly as tall as the title strip, so it never reaches the canvas below. */
    'html.pico-home .pico-frame.game-window > .game-title-bar .close-box { left: 0; top: 0; width: 44px; height: 100%;',
    '  margin: 0; border: 0; background: transparent; box-shadow: none; }',
    'html.pico-home .pico-frame.game-window > .game-title-bar .close-box::after { content: ""; position: absolute; left: 16px;',
    '  top: 50%; margin-top: -6px; width: 12px; height: 12px; background: url("apstat-park/assets/pico-desk.png") -171px -48px / 256px 128px no-repeat;',
    '  image-rendering: pixelated; }',
    'html.pico-home .pico-frame.game-window > .game-title-bar { background: var(--orange); }',
    /* The Study Break window keeps its own fonts and box model (its canvas and messages are untouched). */
    'html.pico-home .pico-frame:not(.game-window) { color: var(--ink); font: 16px/1.35 var(--plain-font); }',
    'html.pico-home .pico-frame:not(.game-window)::before { content: ""; position: absolute; inset: 0; z-index: -1; background: var(--orange);',
    '  clip-path: polygon(8px 0, calc(100% - 8px) 0, calc(100% - 8px) 3px, calc(100% - 4px) 3px, calc(100% - 4px) 7px, 100% 7px,',
    '    100% calc(100% - 8px), calc(100% - 4px) calc(100% - 8px), calc(100% - 4px) calc(100% - 4px),',
    '    calc(100% - 8px) calc(100% - 4px), calc(100% - 8px) 100%, 8px 100%, 8px calc(100% - 4px),',
    '    4px calc(100% - 4px), 4px calc(100% - 8px), 0 calc(100% - 8px), 0 7px, 4px 7px, 4px 3px, 8px 3px); }',
    'html.pico-home .pico-frame:not(.game-window) *, html.pico-home .pico-frame:not(.game-window) *::before { box-sizing: border-box; }',
    'html.pico-home .pico-frame > .win-bar { position: absolute; top: 0; left: 12px; right: 44px; height: 31px;',
    '  display: flex; align-items: center; color: #fff; font: 800 16px/1 var(--plain-font); letter-spacing: .04em;',
    '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    'html.pico-home .pico-frame > .win-close { position: absolute; top: 0; right: 0; width: 44px; height: 44px;',
    '  background: none; border: 0; padding: 0; cursor: pointer; }',
    'html.pico-home .pico-frame > .win-close .sp { position: absolute; left: 20px; top: 11px; }',
    'html.pico-home .pico-frame > .win-close:focus-visible { outline: 3px solid var(--ink); outline-offset: -3px; }',
    'html.pico-home .pico-frame .sp { display: inline-block; background-image: url("apstat-park/assets/pico-desk.png");',
    '  background-repeat: no-repeat; image-rendering: pixelated; flex: none; }',
    'html.pico-home .pico-frame .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;',
    '  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }',
    /* Lesson panel. */
    'html.pico-home #resource-overlay.pico-lesson { background: rgba(0, 0, 64, .45); }',
    'html.pico-home #resource-overlay.pico-lesson .pico-frame { display: flex; flex-direction: column;',
    '  width: min(640px, calc(100vw - 32px)) !important;',
    '  max-width: none !important; max-height: calc(100vh - 32px); }',
    'html.pico-home .pico-frame-body { background: var(--paper); padding: 14px 20px 16px; overflow: auto; min-height: 0; }',
    'html.pico-home #resource-overlay.pico-lesson #resource-header { font: 800 22px/1.25 var(--plain-font) !important;',
    '  text-align: center; border: 0 !important; margin: 0 0 8px !important; padding: 0 !important; }',
    'html.pico-home #resource-overlay.pico-lesson #resource-body { font: 16px/1.35 var(--plain-font) !important;',
    '  max-height: none !important; overflow: visible !important; }',
    'html.pico-home #resource-body .pico-lesson-list { list-style: none; margin: 0; padding: 0 0 0 44px; }',
    'html.pico-home #resource-body .pico-lesson-item { position: relative; }',
    'html.pico-home #resource-body .pico-lesson-item > .continue { position: absolute; left: -44px; top: 50%; margin-top: -18px; }',
    'html.pico-home #resource-body .pico-list-head { margin: 10px 0 2px; font-size: 14px; font-weight: 800; letter-spacing: .06em; }',
    'html.pico-home #resource-body .pico-list-head .chicago { font: inherit !important; text-transform: uppercase; }',
    'html.pico-home #resource-body .pico-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px;',
    '  min-height: 52px; margin: 2px 0 !important; padding: 4px 10px; border: 6px solid transparent; }',
    'html.pico-home #resource-body .pico-row.is-selected { border-color: var(--orange);',
    '  clip-path: polygon(4px 0, calc(100% - 4px) 0, calc(100% - 4px) 2px, calc(100% - 2px) 2px, calc(100% - 2px) 4px, 100% 4px,',
    '    100% calc(100% - 4px), calc(100% - 2px) calc(100% - 4px), calc(100% - 2px) calc(100% - 2px),',
    '    calc(100% - 4px) calc(100% - 2px), calc(100% - 4px) 100%, 4px 100%, 4px calc(100% - 2px),',
    '    2px calc(100% - 2px), 2px calc(100% - 4px), 0 calc(100% - 4px), 0 4px, 2px 4px, 2px 2px, 4px 2px); }',
    'html.pico-home #resource-body .pico-row > a { font-size: 18px; font-weight: 800; color: var(--ink) !important;',
    '  min-height: 44px; display: inline-flex; align-items: center; }',
    'html.pico-home #resource-body .pico-row a:focus-visible, html.pico-home #resource-body .pico-row button:focus-visible {',
    '  outline: 3px solid var(--ink); outline-offset: 2px; }',
    'html.pico-home #resource-overlay.pico-lesson .s7btn { font: 700 15px/1.2 var(--plain-font) !important;',
    '  min-height: 44px; min-width: 44px; padding: 4px 12px !important; }',
    'html.pico-home #resource-body .pico-row span { font-size: 15px !important; }',
    'html.pico-home #resource-body .pico-more { margin-top: 10px; border-top: 2px solid #e4e4e4; padding-top: 6px; }',
    'html.pico-home #resource-body .pico-more summary { min-height: 44px; display: flex; align-items: center;',
    '  cursor: pointer; font-weight: 800; letter-spacing: .04em; }',
    'html.pico-home #resource-body .pico-more-body > * { margin: 4px 0; }',
    'html.pico-home .pico-lesson-day { margin: 12px 0 0; padding-top: 10px; border-top: 2px solid #e4e4e4;',
    '  display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; }',
    'html.pico-home .pico-lesson-day[hidden] { display: none; }',
    'html.pico-home .pico-lesson-day dt { font-weight: 700; }',
    'html.pico-home .pico-lesson-day dd { margin: 0; }',
    'html.pico-home .pico-day-btn { min-height: 44px; padding: 4px 12px; font: 700 15px/1.2 var(--plain-font);',
    '  background: var(--paper); color: var(--ink); border: 3px solid var(--orange); border-radius: 4px; cursor: pointer; }',
    /* My Grade: the ledger window. */
    'html.pico-home #app-wallet-overlay.pico-mygrade { background: rgba(0, 0, 64, .45); pointer-events: auto; }',
    'html.pico-home #app-wallet-overlay.pico-mygrade .pico-frame { display: flex; flex-direction: column;',
    '  width: min(760px, calc(100vw - 32px)) !important;',
    '  height: calc(100vh - 32px); max-height: none; max-width: none; }',
    'html.pico-home #app-wallet-overlay.pico-mygrade .game-title-bar { display: none; }',
    'html.pico-home .pico-grade-head { background: var(--paper); text-align: center; padding: 12px 16px 4px; }',
    'html.pico-home .pico-grade-head .grade-num { display: block; font-size: 56px; font-weight: 800; line-height: 1; }',
    'html.pico-home .pico-grade-head .grade-cap { display: block; font-size: 18px; }',
    'html.pico-home .pico-grade-head .grade-status { margin: 0; font-size: 18px; }',
    'html.pico-home #app-wallet-overlay.pico-mygrade #wallet-content { background: var(--paper); border: 0; margin: 0;',
    '  font-size: 16px; font-family: var(--plain-font); }',
    'html.pico-home #app-wallet-overlay.pico-mygrade #wallet-content * { font-family: var(--plain-font) !important; }',
    /* Phase 3: every other Desk window in the plain frame. Position, size and stacking stay the
       Desk's; the frame adds the orange border, a paper interior and the Pico type and buttons. */
    'html.pico-home .pico-p3:not(.game-window)::after { content: ""; position: absolute; inset: 31px 12px 12px; z-index: -1; background: var(--paper); }',
    'html.pico-home .pico-p3:not(.app-window):not(.game-window) {',
    '  padding: 47px 28px 28px !important; }',
    'html.pico-home .pico-p3 > .win-close[hidden] { display: none; }',
    /* The QR cards are not positioned by the Desk; the frame's bar and ✕ anchor to the card. */
    'html.pico-home #verify-qr-card.pico-p3, html.pico-home #reconcile-qr-card.pico-p3, html.pico-home #guest-pass-card.pico-p3 { position: relative; }',
    'html.pico-home .pico-p3 > .game-title-bar .title-text, html.pico-home .pico-p3 > .game-title-bar .title-stripes,',
    'html.pico-home .pico-p3:not(.game-window) > .game-title-bar .close-box, html.pico-home .pico-p3 > .game-title-bar .collapse-box { display: none !important; }',
    'html.pico-home .pico-p3 > .game-title-bar.pico-orig-bar-empty { display: none !important; }',
    'html.pico-home .pico-p3.app-window > .game-title-bar { box-shadow: none; background: var(--paper); }',
    'html.pico-home .pico-p3 .app-content { border: 0; margin: 0; }',
    'html.pico-home .pico-p3:not(.game-window) .geneva, html.pico-home .pico-p3:not(.game-window) .chicago,',
    'html.pico-home .pico-p3:not(.game-window) .dialog-msg { font-family: var(--plain-font) !important; }',
    'html.pico-home .pico-p3 .dialog-msg { font-size: 15px; line-height: 1.4; }',
    'html.pico-home .pico-p3:not(.game-window) .s7btn { font: 700 15px/1.2 var(--plain-font) !important; min-height: 40px;',
    '  padding: 4px 14px !important; background: var(--paper); color: var(--ink); border: 3px solid var(--orange);',
    '  border-radius: 4px; box-shadow: none; outline: 0; cursor: pointer; }',
    'html.pico-home .pico-p3:not(.game-window) .s7btn.s7btn-default { background: var(--orange); color: #fff; }',
    'html.pico-home .pico-p3:not(.game-window) .s7btn:focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; }',
    'html.pico-home .pico-p3:not(.game-window) .s7btn[disabled] { opacity: .5; cursor: default; }',
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

  // Elapsed-time checks use the monotonic clock (wall-clock time can jump, or be pinned in tests).
  function monotonicNow() {
    return (window.performance && typeof window.performance.now === 'function') ? window.performance.now() : Date.now();
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
  var view = {
    weekIndex: null, selected: 0, days: [], menu: null, menuOpener: null, menuSelected: 0, lessonsOpener: null,
    panel: { open: false, source: null, opener: null, selected: null, recommended: -1 },
    walletOpener: null,
  };

  // ── Tile clicks: the same handler the calendar cell calls (rCal) ──────────
  function openDay(day, opener) {
    var c = sentinels();
    var inf = day.inf;
    if (!isClickable(inf, c)) return;
    cancelPollReturn();
    notePanelSource('tile', opener, day);
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
      btn.addEventListener('click', function () { selectTile(i, false); openDay(day, btn); });
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
    cancelPollReturn();
    var todayInf = deskState().todayLessonInf;
    if (todayInf == null) { try { todayInf = _todayLessonInf; } catch (_) { todayInf = null; } }
    if (todayInf) {
      notePanelSource('sign', byId('pico-sign-go'));
      callDesk('_focusTodayLessonVideo');
      return;
    }
    showLessons(byId('pico-sign-go'));
    callDesk('_menuShowDoNow');
  }

  function renderGrade(board) {
    var info = gradeInfo();
    var grade = button('sign-grade');
    grade.addEventListener('click', function () { view.walletOpener = { sign: 'grade' }; callDesk('openWallet'); });
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
    if (isWalletOpen()) renderGradeHead();
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
      // Teacher 2026-10-06: only the teacher may switch periods — a B student sees only B's schedule
      // (the Desk sets the period from the roster section at sign-in).
      ['B', 'E'].forEach(function (p) {
        items.push({ label: 'PERIOD ' + p, pressed: deskPeriod() === p, run: function () { callDesk('setP', [p]); } });
      });
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
    closeMenu();
    if (view.menuOpener) notePendingOpener(openerRef(view.menuOpener));
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
  // Typing targets keep every key: inputs, textareas, selects, contenteditable, iframes.
  function isEditable(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.isContentEditable) return true;
    return /^(INPUT|TEXTAREA|SELECT|IFRAME)$/.test(node.tagName);
  }

  function onCaptureKey(event) {
    var target = event.target;
    if (isEditable(target)) return;
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
    if (isPanelOpen() && target && target.closest && target.closest('#resource-overlay')) {
      // A Desk dialog stacked above the panel owns the keys: pass them through untouched.
      if (modalAbovePanel()) return;
      if (onPanelKey(event) || GAME_KEYS[event.key]) event.stopPropagation();
      return;
    }
    if (!inPico || !GAME_KEYS[event.key]) return;
    if (target.closest('#pico-tiles')) onTileKey(event);
    else if (target.closest('.carousel')) onWeekKey(event);
    else return;
    event.stopPropagation();
  }

  // ── Phase 2: the Desk's lesson panel and ledger inside recovered Pico windows ──
  // WRAP, DON'T REWRITE. The Desk's own #resource-overlay and #app-wallet-overlay stay where
  // they are (so their stacking order, ids and every handler are untouched). With the flag on
  // they get a Pico frame (a title bar + ✕ added once) and CSS scoped to html.pico-home. The
  // panel's own rows are regrouped inside #resource-body after each Desk render: one Pico list
  // row per action, everything else in a "More" fold. Nothing is dropped and no row is rebuilt.

  // How the panel was opened: a Pico tile (title = its weekday + date) or the sign (title = the
  // lesson label). Anything else looks the date up in the schedule.
  function notePanelSource(kind, opener, day) {
    view.panel.source = { kind: kind, day: day || null };
    view.panel.opener = openerRef(opener);
  }

  // Openers are remembered by a stable identity, not the node: renderTiles / renderSign replace
  // their nodes on every Pico re-render (an async grade refresh, a Do Now update), so a saved
  // node can be gone by the time a window closes. A tile is its date; the sign and nav buttons
  // are their role. Anything else (e.g. a calendar cell in SCHEDULE) keeps the node itself.
  function openerRef(node) {
    if (!node || node.nodeType !== 1) return null;
    var tile = node.closest('#pico-tiles .tile');
    if (tile) {
      var tiles = Array.prototype.slice.call(document.querySelectorAll('#pico-tiles .tile'));
      var day = view.days[tiles.indexOf(tile)];
      if (day) return { tile: day.date.getTime() };
    }
    if (node.id === 'pico-sign-go') return { sign: 'go' };
    if (node.closest('#pico-sign .sign-grade')) return { sign: 'grade' };
    var nav = node.closest('#pico-home .navbtn');
    if (nav) return { nav: nav.getAttribute('data-nav') };
    return { node: node };
  }

  function resolveOpener(ref) {
    var fallback = document.querySelector('#pico-home .navbtn[data-nav="TODAY"]');
    if (!ref) return fallback;
    if (ref.tile) {
      var index = -1;
      view.days.forEach(function (day, i) { if (day.date.getTime() === ref.tile) index = i; });
      return document.querySelectorAll('#pico-tiles .tile')[index] || fallback;
    }
    if (ref.sign === 'go') return byId('pico-sign-go') || fallback;
    if (ref.sign === 'grade') return document.querySelector('#pico-sign .sign-grade') || fallback;
    if (ref.nav) return document.querySelector('#pico-home .navbtn[data-nav="' + ref.nav + '"]') || fallback;
    if (ref.node && document.contains(ref.node)) return ref.node;
    return fallback;
  }

  function restoreFocus(ref) {
    var target = resolveOpener(ref);
    if (target && typeof target.focus === 'function') target.focus();
  }

  // ── Which modal is on top ───────────────────────────────────────────────────
  // Desk dialogs that can open over the lesson panel (day grade, alerts, appeals, sign-in, the
  // flashcard deck, app windows…). The panel owns Esc / arrows only when none of these is showing
  // above it; otherwise the key passes through untouched to the dialog on top.
  var DESK_MODALS = '[id$="-overlay"], [id$="-modal"], .dialog-overlay, .app-overlay, [role="dialog"][aria-modal="true"]';

  function isShown(node) {
    for (var n = node; n && n.nodeType === 1; n = n.parentElement) {
      var style = window.getComputedStyle(n);
      if (style.display === 'none') return false;
    }
    return window.getComputedStyle(node).visibility !== 'hidden';
  }

  function zIndexOf(node) {
    var z = parseInt(window.getComputedStyle(node).zIndex, 10);
    return isNaN(z) ? null : z;
  }

  // A shown Desk modal stacked at or above the lesson panel (unknown stacking counts as above).
  function modalAbovePanel() {
    var overlay = panelOverlay();
    var panelZ = zIndexOf(overlay);
    var nodes = document.querySelectorAll(DESK_MODALS);
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (node === overlay || overlay.contains(node) || node.contains(overlay)) continue;
      if (node.closest('#pico-home')) continue;
      if (!isShown(node)) continue;
      var z = zIndexOf(node);
      if (z === null || panelZ === null || z >= panelZ) return node;
    }
    return null;
  }

  function firstFocusable(root) {
    return root.querySelector('button:not([disabled]), a[href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])');
  }

  // After a panel button opens a Desk dialog: if the Desk left focus behind in the panel, move
  // it into the dialog on top, so Esc and Tab reach that dialog first.
  // When that dialog closes again, focus comes back to the panel button that opened it.
  function focusDialogAbove() {
    var returnTo = document.activeElement;
    if (!panelOverlay().contains(returnTo)) return;
    var modal = modalAbovePanel();
    if (!modal) return;
    var target = firstFocusable(modal) || modal;
    if (!target.hasAttribute('tabindex') && !firstFocusable(modal)) target.setAttribute('tabindex', '-1');
    target.focus();
    var watcher = new MutationObserver(function () {
      if (isShown(modal)) return;
      watcher.disconnect();
      if (!isPanelOpen()) return;
      var active = document.activeElement;
      if (active && active !== document.body && isShown(active)) return;
      if (document.contains(returnTo)) returnTo.focus();
      else selectPanelRow(view.panel.selected || 0, true);
    });
    watcher.observe(modal, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
  }

  function panelOverlay() {
    return byId('resource-overlay');
  }

  function isPanelOpen() {
    var overlay = panelOverlay();
    return Boolean(overlay && overlay.style.display && overlay.style.display !== 'none');
  }

  // The schedule row for the panel's day string ("Oct 5"), so the bar can name the weekday.
  function dateForDs(ds) {
    var rows = deskSchedule();
    for (var i = 0; i < rows.length; i++) {
      var date = new Date(rows[i][0], rows[i][1], rows[i][2]);
      var label = MONTH_SHORT[date.getMonth()] + ' ' + date.getDate();
      try { if (Array.isArray(MN)) label = MN[date.getMonth()] + ' ' + date.getDate(); } catch (_) {}
      if (label === ds) return date;
    }
    return null;
  }

  function dayTitle(date) {
    return DOW[date.getDay()] + ' ' + MONTHS[date.getMonth()] + ' ' + date.getDate();
  }

  function lastPanel() {
    try { return _lastResourcePanel || null; } catch (_) { return null; }
  }

  function panelTitle() {
    var source = view.panel.source || {};
    var header = byId('resource-header');
    var label = header ? header.textContent.trim() : '';
    if (source.kind === 'tile' && source.day) return dayTitle(source.day.date);
    if (source.kind === 'sign') return label;
    var last = lastPanel();
    var date = last ? dateForDs(last.dateStr) : null;
    return date ? dayTitle(date) : label;
  }

  // ── Rows: which panel elements are actions, and their status ─────────────
  function hasControl(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.matches('a, button, label, input')) return true;
    return Boolean(node.querySelector('a, button, input'));
  }

  // A section = the panel's "Today's Lesson" / "Due Today" / "Assigned Today" block: a div whose
  // first child is its small .chicago heading.
  function isSection(node) {
    if (!node || node.tagName !== 'DIV') return false;
    var head = node.firstElementChild;
    return Boolean(head && head.classList.contains('chicago') && !hasControl(head) && node.children.length > 1);
  }

  // The panel's own status for a row: 'done' (✓ Completed / flashcards ✓ done / video ✓ visited),
  // 'todo' (a Done slot not yet done, an unvisited video), or null (no status: tutor, links).
  function rowStatus(row) {
    var text = row.textContent;
    if (/✓ Completed|✓ done|✓ perfected/.test(text)) return 'done';
    if (row.querySelector('.worksheet-done-slot, .desk-quiz-done-slot')) return 'todo';
    if (/\bVideo \d/.test(text)) return /✓ visited/.test(text) ? 'done' : 'todo';
    return null;
  }

  function rowControl(row) {
    if (row.matches('a, button')) return row;
    return row.querySelector('a[href], button:not([disabled]), a, button, input, label');
  }

  // Regroup the freshly rendered #resource-body (idempotent: once per Desk render).
  function decoratePanel() {
    var body = byId('resource-body');
    if (!body || body.querySelector(':scope > .pico-lesson-list')) return false;
    var list = el('ol', 'pico-lesson-list');
    list.setAttribute('aria-label', 'Activities');
    var more = el('details', 'pico-more');
    more.appendChild(el('summary', null, 'More'));
    var moreBody = el('div', 'pico-more-body');
    more.appendChild(moreBody);

    function addRow(row) {
      var item = el('li', 'pico-lesson-item');
      row.classList.add('pico-row');
      item.appendChild(row);
      list.appendChild(item);
    }

    Array.prototype.slice.call(body.children).forEach(function (node) {
      if (isSection(node)) {
        Array.prototype.slice.call(node.children).forEach(function (child, i) {
          if (i === 0) {
            var head = el('li', 'pico-list-head');
            head.appendChild(child);
            list.appendChild(head);
            return;
          }
          if (hasControl(child)) addRow(child);
          else moreBody.appendChild(child);
        });
        node.remove();
        return;
      }
      if (hasControl(node)) { addRow(node); return; }
      if (node.classList.contains('lesson-coach')) moreBody.appendChild(node);
      // Anything else (the panel's own message paragraphs) stays where it is.
    });

    body.appendChild(list);
    if (moreBody.children.length) body.appendChild(more);
    markRecommended();
    return true;
  }

  function panelRows() {
    return document.querySelectorAll('#resource-body .pico-row');
  }

  // The coloured triangle: the first not-done action by the panel's own status. Never moves.
  function markRecommended() {
    var rows = panelRows();
    view.panel.recommended = -1;
    for (var i = 0; i < rows.length; i++) {
      if (rowStatus(rows[i]) !== 'todo') continue;
      view.panel.recommended = i;
      var item = rows[i].parentNode;
      item.insertBefore(sprite('triangleBlue', SCALE, 'continue'), rows[i]);
      item.insertBefore(el('span', 'sr-only', 'Recommended: '), rows[i]);
      return;
    }
  }

  // The orange outline: the selection. Follows Tab / arrows / mouse. Moving the selection moves
  // focus to the row's main control, so Enter always activates the outlined row — unless focus
  // is already on a control inside that row (a secondary link, a Done button), which keeps it.
  function selectPanelRow(index, moveFocus, fromPointer) {
    var rows = panelRows();
    if (!rows.length) return;
    var i = (index + rows.length) % rows.length;
    rows.forEach(function (row, j) { row.classList.toggle('is-selected', j === i); });
    view.panel.selected = i;
    if (!moveFocus) return;
    if (rows[i].contains(document.activeElement)) return;
    if (isEditable(document.activeElement)) return;
    var control = rowControl(rows[i]);
    if (control) control.focus(fromPointer ? { preventScroll: true } : undefined);
  }

  function wirePanelRows() {
    panelRows().forEach(function (row, i) {
      row.addEventListener('focusin', function () { selectPanelRow(i, false); });
      row.addEventListener('mouseenter', function () { selectPanelRow(i, true, true); });
    });
  }

  // "This day" details the calendar cell carries today (its aria text: date, label, due, 2x,
  // status), the day grade (double-click / right-click on the cell) and the day's polls.
  function renderPanelDay() {
    var host = byId('pico-lesson-day');
    if (!host) return;
    host.textContent = '';
    var last = lastPanel();
    if (!last || !last.inf) { host.hidden = true; return; }
    var rows = [];
    var aria = callDesk('cellAria', [last.inf, last.dateStr]);
    if (typeof aria === 'string' && aria) rows.push({ term: 'This day', text: aria });
    var dayGrade = button('pico-day-btn', 'Day grade');
    dayGrade.addEventListener('click', function () {
      callDesk('openDayGrade', [last.dateStr]);
      focusDialogAbove();
    });
    rows.push({ term: 'Day grade', node: dayGrade });
    var polls = dayPolls(last.dateStr);
    if (polls && polls.length && boardCanShowPolls()) {
      var pollBtn = button('pico-day-btn', 'Class poll results (' + polls.length + ')');
      pollBtn.setAttribute('data-poll', '1');
      pollBtn.addEventListener('click', function () { showPollsFromPanel(polls, last); });
      rows.push({ term: 'Class poll', node: pollBtn });
    }
    rows.forEach(function (row) {
      host.appendChild(el('dt', null, row.term));
      var dd = el('dd');
      if (row.node) dd.appendChild(row.node);
      else dd.textContent = row.text;
      host.appendChild(dd);
    });
    host.hidden = rows.length === 0;
  }

  // The polls archived for a day: the same _pollArchive lookup the calendar's poll dot makes.
  function dayPolls(ds) {
    var date = dateForDs(ds);
    if (!date) return null;
    var key = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    try { return (_pollArchive && _pollArchive[key]) || null; } catch (_) { return null; }
  }

  // Same as the poll dot's click: the board's result screen. Returns false when there is no
  // board to show it on (e.g. signed out).
  function showPolls(polls) {
    try {
      if (_classroomBoardHandle && typeof _classroomBoardHandle.showResultScreen === 'function') {
        _classroomBoardHandle.showResultScreen(polls);
        return true;
      }
    } catch (_) {}
    return false;
  }

  // The board draws its result screen inside the floor (under #pico-home), which sits below the
  // lesson panel's layer, so the panel steps aside: close it, show the result on the board and
  // scroll the board into view (as the calendar's poll dot does), then re-open the same lesson
  // when the result screen is dismissed (its close button or its own 2 s timer) and put focus
  // back on the poll button.
  function resultScreenNode() {
    return document.querySelector('#classroom-board-mount [data-classroom-result-screen]');
  }

  function resultScreenShown(node) {
    return Boolean(node) && node.style.transform !== 'translateY(-100%)';
  }

  function boardCanShowPolls() {
    try { return Boolean(_classroomBoardHandle && typeof _classroomBoardHandle.showResultScreen === 'function'); } catch (_) { return false; }
  }

  // The pending return is ONE cancellable token: { reopen, watcher, timer }. Anything else the
  // student does before the result screen is dismissed (another panel, a tile, a nav button, My
  // Grade, Use Original Desk) or the board going away cancels it, so a stale lesson never
  // re-opens over what they chose next.
  var pollReturn = null;

  function cancelPollReturn() {
    if (!pollReturn) return;
    if (pollReturn.watcher) pollReturn.watcher.disconnect();
    if (pollReturn.timer) clearTimeout(pollReturn.timer);
    pollReturn = null;
  }

  function showPollsFromPanel(polls, last) {
    cancelPollReturn();
    var token = { reopen: { inf: last.inf, ds: last.dateStr, source: view.panel.source, opener: view.panel.opener } };
    view.panel.stepAside = true;
    callDesk('closeResourcePanel');
    var screen = showPolls(polls) ? resultScreenNode() : null;
    pollReturn = token;
    if (!resultScreenShown(screen)) {
      // Nothing showed: come straight back (after the close has been processed).
      token.timer = setTimeout(function () { finishPollReturn(token); }, 0);
      return;
    }
    try {
      var mount = byId('classroom-board-mount');
      if (mount) mount.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch (_) {}
    var closeBtn = screen.querySelector('[data-classroom-result-close]');
    if (closeBtn) closeBtn.focus({ preventScroll: true });
    token.watcher = new MutationObserver(function () {
      // The board was torn down (its destroy removes the screen without a style change).
      if (!document.contains(screen)) { cancelPollReturn(); return; }
      if (resultScreenShown(screen)) return;
      finishPollReturn(token);
    });
    token.watcher.observe(screen, { attributes: true, attributeFilter: ['style'] });
    token.watcher.observe(document.body, { childList: true, subtree: true });
  }

  // Re-open the suspended lesson, but only if this token is still the pending one, no panel is
  // open, and the Desk's last panel is still the suspended lesson.
  function finishPollReturn(token) {
    if (pollReturn !== token) return;
    cancelPollReturn();
    var last = lastPanel();
    if (isPanelOpen() || !last || last.inf !== token.reopen.inf) return;
    view.panel.source = token.reopen.source;
    view.panel.opener = token.reopen.opener;
    view.panel.focusPoll = true;
    callDesk('showResourcePanel', [token.reopen.inf, token.reopen.ds]);
  }

  // After every Desk render of the panel: regroup, title, triangle, selection, day details.
  function onPanelChange() {
    if (!isPanelOpen()) return;
    var opening = !view.panel.open;
    view.panel.open = true;
    if (opening) cancelPollReturn();
    if (opening && !view.panel.opener) view.panel.opener = openerRef(document.activeElement);
    var fresh = decoratePanel();
    byId('pico-lesson-bar').textContent = panelTitle();
    renderPanelDay();
    if (!fresh && !opening) return;
    wirePanelRows();
    var focusInside = panelOverlay().contains(document.activeElement);
    var start = view.panel.recommended >= 0 ? view.panel.recommended : 0;
    if (!opening && typeof view.panel.selected === 'number') start = view.panel.selected;
    if (!panelRows().length) byId('pico-lesson-close').focus();
    else selectPanelRow(start, opening || !focusInside);
    if (!opening || !view.panel.focusPoll) return;
    view.panel.focusPoll = false;
    var pollBtn = document.querySelector('#pico-lesson-day .pico-day-btn[data-poll]');
    if (pollBtn) pollBtn.focus();
  }

  function onPanelClosed() {
    if (!view.panel.open) return;
    view.panel.open = false;
    view.panel.selected = null;
    var opener = view.panel.opener;
    view.panel.source = null;
    view.panel.opener = null;
    // Stepping aside for the poll result screen: no focus restore (it goes to the result).
    if (view.panel.stepAside) { view.panel.stepAside = false; return; }
    // Only pull focus back when it was left in the (now hidden) panel or dropped to the page.
    var active = document.activeElement;
    if (active && active !== document.body && !panelOverlay().contains(active) && isShown(active)) return;
    restoreFocus(opener);
  }

  // Keys while the lesson panel has focus: Esc closes, Up/Down move the selection.
  function onPanelKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      callDesk('closeResourcePanel');
      return true;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return false;
    event.preventDefault();
    selectPanelRow((view.panel.selected || 0) + (event.key === 'ArrowDown' ? 1 : -1), true);
    return true;
  }

  function setupLessonPanel() {
    var overlay = panelOverlay();
    if (!overlay) return;
    var box = overlay.querySelector('.dialog-box');
    var body = byId('resource-body');
    if (!box || !body) return;
    overlay.classList.add('pico-lesson');
    box.classList.add('pico-frame', 'pico-win');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'pico-lesson-bar');
    var bar = el('div', 'win-bar');
    bar.id = 'pico-lesson-bar';
    var close = button('win-close');
    close.id = 'pico-lesson-close';
    close.setAttribute('aria-label', 'Close');
    close.appendChild(sprite('close', 1));
    close.addEventListener('click', function () { callDesk('closeResourcePanel'); });
    // The white interior holds the Desk's own header, body and OK row, unchanged.
    var inner = el('div', 'pico-frame-body');
    Array.prototype.slice.call(box.children).forEach(function (child) { inner.appendChild(child); });
    var details = el('dl', 'pico-lesson-day');
    details.id = 'pico-lesson-day';
    details.hidden = true;
    inner.insertBefore(details, body.nextSibling);
    box.appendChild(bar);
    box.appendChild(close);
    box.appendChild(inner);

    var observer = new MutationObserver(function () {
      observer.disconnect();
      if (isPanelOpen()) onPanelChange();
      else onPanelClosed();
      observe();
    });
    function observe() {
      observer.observe(overlay, { attributes: true, attributeFilter: ['style'] });
      observer.observe(body, { childList: true });
    }
    observe();
  }

  // ── My Grade: the Desk's ledger window in the recovered frame ─────────────
  function walletOverlay() {
    return byId('app-wallet-overlay');
  }

  function isWalletOpen() {
    var overlay = walletOverlay();
    return Boolean(overlay && overlay.style.display && overlay.style.display !== 'none');
  }

  // The official grade at the top: the same value the sign shows (the Do Now pill).
  function renderGradeHead() {
    var head = byId('pico-grade-head');
    if (!head) return;
    head.textContent = '';
    var info = gradeInfo();
    if (info && info.status) {
      head.appendChild(el('p', 'grade-status', info.status));
      return;
    }
    var value = info && info.value ? info.value : '—';
    var caption = info ? (info.key + (info.official ? ' official' : '')) : 'My grade';
    head.appendChild(el('span', 'grade-num', value));
    head.appendChild(el('span', 'grade-cap', caption));
  }

  function setupMyGrade() {
    var overlay = walletOverlay();
    if (!overlay) return;
    var win = overlay.querySelector('.app-window');
    var content = byId('wallet-content');
    if (!win || !content) return;
    overlay.classList.add('pico-mygrade');
    win.classList.add('pico-frame', 'pico-win');
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-labelledby', 'pico-mygrade-bar');
    var bar = el('div', 'win-bar', 'MY GRADE');
    bar.id = 'pico-mygrade-bar';
    var close = button('win-close');
    close.id = 'pico-mygrade-close';
    close.setAttribute('aria-label', 'Close');
    close.appendChild(sprite('close', 1));
    close.addEventListener('click', function () { callDesk('destroyWallet'); });
    var head = el('div', 'pico-grade-head');
    head.id = 'pico-grade-head';
    head.setAttribute('aria-live', 'polite');
    win.insertBefore(head, content);
    win.appendChild(bar);
    win.appendChild(close);

    var wasOpen = false;
    new MutationObserver(function () {
      var open = isWalletOpen();
      if (open && !wasOpen) {
        cancelPollReturn();
        if (!view.walletOpener) view.walletOpener = openerRef(document.activeElement);
        renderGradeHead();
        close.focus();
      }
      if (!open && wasOpen) restoreFocus(view.walletOpener);
      if (!open) view.walletOpener = null;
      wasOpen = open;
    }).observe(overlay, { attributes: true, attributeFilter: ['style'] });
  }

  // ── Phase 3: every other window in a plain Pico frame ───────────────────────
  // Each Desk window / dialog keeps its content, ids, handlers, stacking and position. With the
  // flag on it gets the recovered frame (orange frame, a title bar carrying the dialog's own
  // title text, a ✕ that calls the dialog's own close) — added once, idempotent across the
  // Desk's re-renders — and CSS scoped to html.pico-home (font family / base size, borders,
  // button look). The System 7 title-bar parts the frame replaces (title text, stripes, close
  // box, collapse box) are hidden, not removed; any other control on that bar (Study Break's
  // mute, an app's pop-out) stays visible. The lesson panel and My Grade (Phase 2) are framed
  // by their own setup above; the Study Break challenge alert in the menu bar is left as is.
  //
  // overlay id              frame box in it   title source (in the box; '' = none)   ✕ = Desk close
  var FRAMED = [
    { overlay: 'dialog-overlay',          box: '.dialog-box', title: '',                               close: ['closeDialog'] },            // showDialog alerts: About, lesson locked, baseline info, …
    { overlay: 'donow-bump-overlay',      box: '.dialog-box', title: '',                               close: ['closeDoNowBump'] },
    { overlay: 'signin-overlay',          box: '.dialog-box', title: '.dialog-msg > .chicago',         close: ['closeSignInModal'] },
    { overlay: 'signup-overlay',          box: '.dialog-box', title: '.dialog-msg > .chicago',         close: ['_switchToSignIn'] },
    { overlay: 'pwchange-overlay',        box: '.dialog-box', title: '#pwchange-title',                close: ['closePwChangeModal'], closable: pwChangeClosable },
    { overlay: 'namefinder-overlay',      box: '.dialog-box', title: '',                               close: ['closeNameFinder'] },        // created by the Desk on first use
    { overlay: 'day-grade-overlay',       box: '.dialog-box', title: '#day-grade-header',              close: ['closeDayGrade'] },
    { overlay: 'grade-help-overlay',      box: '.dialog-box', title: '.dialog-box > .chicago',         close: ['closeGradeHelp'] },
    { overlay: 'my-gradebook-overlay',    box: '.dialog-box', title: '#my-gradebook-title',            close: ['closeMyGradebook'] },
    { overlay: 'my-receipts-overlay',     box: '.dialog-box', title: '.dialog-box > .chicago > span',  close: ['closeMyReceipts'] },
    { overlay: 'bf-overlay',              box: '.dialog-box', title: '#bf-header',                     close: ['closeBlooketFlashcards'] }, // Review + flashcard decks
    { overlay: 'student-dm-modal',        box: '.sdm-panel',  title: '#sdm-title',                     close: ['_closeStudentDmModal'] },   // Message teacher
    { overlay: 'teacher-nudge-modal',     box: '.tnm-panel',  title: '#tnm-title',                     close: ['_closeTeacherNudgeModal'] },
    { overlay: 'app-bulletin-overlay',    box: '.app-window', title: '.game-title-bar .title-text',    close: ['destroyBulletin'] },
    { overlay: 'app-snapshot-overlay',    box: '.app-window', title: '.game-title-bar .title-text',    close: ['destroyApp', 'snapshot'] },
    { overlay: 'app-week-overlay',        box: '.app-window', title: '.game-title-bar .title-text',    close: ['destroyApp', 'week'] },
    { overlay: 'app-ti84-overlay',        box: '.app-window', title: '.game-title-bar .title-text',    close: ['destroyApp', 'ti84'] },
    { overlay: 'app-quiz-overlay',        box: '.app-window', title: '.game-title-bar .title-text',    close: ['destroyApp', 'quiz'] },
    { overlay: 'app-formulas-overlay',    box: '.app-window', title: '.game-title-bar .title-text',    close: ['destroyApp', 'formulas'] },
    { overlay: 'app-dok-overlay',         box: '.app-window', title: '.game-title-bar .title-text',    close: ['destroyApp', 'dok'] },        // teacher
    { overlay: 'app-teachertools-overlay', box: '.app-window', title: '.game-title-bar .title-text',   close: ['destroyTeacherTools'] },    // teacher workspace + inbox
    { overlay: 'app-nightlyreview-overlay', box: '.app-window', title: '.game-title-bar .title-text',  close: ['closeNightlyReview'] },     // teacher
    { overlay: 'app-gradecheckin-overlay', box: '.app-window', title: '.game-title-bar .title-text',   close: ['closeGradeCheckin'] },      // teacher
    { overlay: 'app-progress-overlay',    box: '.app-window', title: '.game-title-bar .title-text',    close: ['destroyProgress'] },        // My Progress (icon parked; kept framed)
    { overlay: 'override-gate-modal',     box: '.ogm-panel',  title: '#ogm-title',                     close: ['_hideOverrideGateModal'] }, // teacher view-as: override gate
    { overlay: 'verify-qr-overlay',       box: '#verify-qr-card', title: 'strong',                     close: ['_escHide', 'verify-qr-overlay'] },    // teacher: Verify a Record (built on first use)
    { overlay: 'reconcile-qr-overlay',    box: '#reconcile-qr-card', title: 'strong',                  close: ['_escHide', 'reconcile-qr-overlay'] }, // teacher: Guest Reconcile (built on first use)
    { overlay: 'guest-pass-overlay',      box: '#guest-pass-card', title: 'strong',                    close: ['_escHide', 'guest-pass-overlay'] },   // guest pass (guests retired; kept framed)
    { overlay: 'game-overlay',            box: '.game-window', title: '.game-title-bar .title-text',   close: ['closeGame'], ownClose: true }, // Study Break: frame only; its own close box (restyled in place) stays the ✕
  ];

  // Not framed, on purpose (each checked against the Desk's -overlay ids, role="dialog" and
  // .dialog-box containers):
  //   #resource-overlay, #app-wallet-overlay  framed by Phase 2 (lesson panel, My Grade)
  //   #doge-challenge-panel                   Study Break challenge alert: stays exactly as is (pre-approved)
  //   #challenge-dialog                       inside the Study Break window's content (never touched)
  //   .avatar-pop                             the cat's name/candy/game popover on the floor: anchored to
  //                                           the cat, not a modal dialog — it belongs to the board
  //   #big-qr-overlay                         full-screen tap-to-close QR viewer; a frame would shrink the
  //                                           code a phone has to scan
  var FRAME_EXEMPT = ['resource-overlay', 'app-wallet-overlay', 'doge-challenge-panel', 'challenge-dialog', 'avatar-pop', 'big-qr-overlay'];

  // The forced change-password dialog has no dismiss (TR2); only the voluntary one ("Cancel")
  // gets a ✕.
  function pwChangeClosable() {
    var left = byId('pwchange-leftbtn');
    return Boolean(left && left.textContent.trim() === 'Cancel');
  }

  // Parts of the System 7 title bar the frame replaces.
  var REPLACED_BAR_PARTS = '.title-text, .title-stripes, .close-box, .collapse-box';

  function frameTitle(entry, box) {
    if (!entry.title) return '';
    var source = box.querySelector(entry.title);
    if (!source) return '';
    var copy = source.cloneNode(true);
    Array.prototype.forEach.call(copy.querySelectorAll('button, [role="button"], .close-box'), function (node) { node.remove(); });
    return copy.textContent.replace(/\s+/g, ' ').trim();
  }

  function runFrameClose(entry) {
    callDesk(entry.close[0], entry.close.slice(1));
  }

  // Frame one overlay (once). Returns false if the Desk has not built it yet.
  function frameOverlay(entry) {
    var overlay = byId(entry.overlay);
    if (!overlay) return false;
    var box = overlay.querySelector(entry.box);
    if (!box) return false;
    if (box.classList.contains('pico-win') && box.querySelector(':scope > [data-pico-bar]')) return true;
    overlay.classList.add('pico-framed');
    box.classList.add('pico-frame', 'pico-win', 'pico-p3');

    var state = { opener: null, shown: false };
    var bar = null;
    var close = null;
    // The chrome is guarded by its presence, not the class: a Desk that rebuilds the box's
    // innerHTML (the QR cards do on every open) gets the bar and ✕ back.
    function chromeComplete() {
      return Boolean(bar && bar.parentNode === box && (entry.ownClose || (close && close.parentNode === box)));
    }
    function ensureChrome() {
      if (!bar || bar.parentNode !== box) {
        bar = el('div', 'win-bar');
        bar.setAttribute('data-pico-bar', entry.overlay);
        box.appendChild(bar);
      }
      // A window that keeps its own close box (Study Break) gets no frame ✕.
      if (entry.ownClose || (close && close.parentNode === box)) return;
      close = button('win-close');
      close.setAttribute('aria-label', 'Close');
      close.setAttribute('data-pico-close', entry.overlay);
      close.appendChild(sprite('close', 1));
      close.addEventListener('click', function (event) {
        event.stopPropagation();
        closeFromX();
      });
      box.appendChild(close);
    }
    // ✕: the Desk's own close, then focus to the opener (TODAY if it cannot be found).
    function closeFromX() {
      var opener = state.opener;
      runFrameClose(entry);
      if (isShown(overlay)) return;
      state.shown = false;
      state.opener = null;
      restoreFocus(opener);
    }
    ensureChrome();

    // Hide the replaced title-bar parts; hide the whole bar when nothing else is on it.
    var oldBar = box.querySelector(':scope > .game-title-bar');
    if (oldBar) {
      oldBar.classList.add('pico-orig-bar');
      var others = Array.prototype.filter.call(oldBar.children, function (child) { return !child.matches(REPLACED_BAR_PARTS); });
      if (!others.length) oldBar.classList.add('pico-orig-bar-empty');
    }

    function refresh() {
      ensureChrome();
      var title = frameTitle(entry, box);
      if (bar.textContent !== title) bar.textContent = title;   // no write when unchanged (no observer loop)
      if (close) close.hidden = Boolean(entry.closable && !entry.closable());
    }
    function onVisibility() {
      var shown = isShown(overlay);
      if (shown === state.shown) { if (shown) refresh(); return; }
      state.shown = shown;
      if (shown) {
        refresh();
        // The opener as it was when it was activated (before the Desk moved focus into the
        // dialog); otherwise whatever had focus outside the dialog.
        var pending = takePendingOpener();
        if (pending) state.opener = pending;
        else if (!overlay.contains(document.activeElement)) state.opener = openerRef(document.activeElement);
        return;
      }
      // Closed some other way: put focus back on the opener when it was left in the hidden
      // dialog or dropped (TODAY if the opener cannot be found).
      var active = document.activeElement;
      var lost = !active || active === document.body || overlay.contains(active) || !isShown(active);
      var opener = state.opener;
      state.opener = null;
      if (lost) restoreFocus(opener);
    }
    new MutationObserver(onVisibility).observe(overlay, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
    // Title changes and box rebuilds (chrome re-added, title re-read).
    new MutationObserver(function () {
      if (!chromeComplete()) refresh();
    }).observe(box, { childList: true });
    var titleSource = entry.title ? box.querySelector(entry.title) : null;
    if (titleSource) new MutationObserver(refresh).observe(titleSource, { childList: true, characterData: true, subtree: true });
    else if (entry.title) new MutationObserver(refresh).observe(box, { childList: true, subtree: true, characterData: true });
    refresh();
    state.shown = isShown(overlay);
    return true;
  }

  // The Pico control that was just activated, captured before the Desk opener runs (the Desk
  // often moves focus into its dialog synchronously). Used by the next dialog that opens within
  // a second; then dropped so a later, Desk-initiated dialog never inherits it.
  var pendingOpener = null;

  function notePendingOpener(ref) {
    pendingOpener = ref ? { ref: ref, at: monotonicNow() } : null;
  }

  function takePendingOpener() {
    var pending = pendingOpener;
    pendingOpener = null;
    if (!pending || monotonicNow() - pending.at > 1000) return null;
    return pending.ref;
  }

  function frameAll() {
    FRAMED.forEach(frameOverlay);
  }

  // Overlays the Desk builds later (the name finder) are framed when they appear.
  function setupFrames() {
    frameAll();
    // Any activation inside the Pico home (nav, sign, tiles) is a possible opener.
    byId('pico-home').addEventListener('click', function (event) {
      var control = event.target && event.target.closest && event.target.closest('button');
      if (control && !control.closest('#pico-menu-backdrop')) notePendingOpener(openerRef(control));
    }, true);
    new MutationObserver(function () {
      FRAMED.forEach(function (entry) {
        var overlay = byId(entry.overlay);
        if (overlay && !overlay.querySelector('.pico-win')) frameOverlay(entry);
      });
    }).observe(document.body, { childList: true });
  }

  // ── The flag ───────────────────────────────────────────────────────────────
  function useOriginalDesk() {
    cancelPollReturn();
    stopFloorWatch();
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
        cancelPollReturn();
        if (name === 'TODAY') { goToday(); return; }
        if (name === 'MY GRADE') { view.walletOpener = { nav: 'MY GRADE' }; callDesk('openWallet'); return; }
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

  // ── The floor: the real board as the page's bottom edge ───────────────────
  // The board (classroom-board.js) has two scenes. Signed in, a student's board mounts the
  // calculator room straight away (apstat-park/calculator-room.mjs: world 720 x 750, floor at
  // 700, drawn at scale min(1, width / 720), transparent, its own orange floor block 50 high).
  // Otherwise — loading, a whole-class poll / gate / activity — it is the 220-high presence strip
  // (groundY = height - 50; cats, the three park doors with occupancy, poll board). The board
  // marks its own state on the mount: data-calculator-active (room mounted),
  // data-calculator-participating (the team calculator round is running) and data-park-active
  // (a campaign / park level is open); its poll vote buttons and result screen are DOM children.
  // Nothing here re-derives a rule: it only reads those signals and sizes the window onto it.
  var BOARD_FLOOR_H = 50;             // the board's floor block under the ground line (both scenes)
  var ROOM_WORLD_W = 720;             // calculator-room WORLD.width (scale = min(1, width / 720))
  // Tallest idle thing standing on the room's floor: the "PICO PARK" door label, drawn at
  // WORLD.floor - 70 (calculator-room.mjs drawScenery), plus a little air. The room's teaching
  // text above it (WORLD.floor - 96 and higher) is cropped while idle.
  var ROOM_IDLE_HEADROOM = 88;
  // Strip: the 32-px park doors with the occupancy line 10 px above them, and the cats.
  var STRIP_IDLE_HEADROOM = 72;

  function boardCanvas() {
    var mount = byId('classroom-board-mount');
    return mount ? mount.querySelector(':scope > canvas') : null;
  }

  function shownDomChild(mount, selector) {
    var node = mount.querySelector(selector);
    return Boolean(node && node.style.display !== 'none');
  }

  // A game (or a whole-class moment the board shows above its floor) is running.
  // The board's whole-class state, as it reports it to the Desk (onStateChange → the Desk's
  // _lastClassroomSummary). These are the fields of the board's own classroomBusy(): a poll from
  // open to close (voting does not end it), an armed gate, a green light, doorways, and an
  // activity until it is finished. The strip draws those scenes above its floor.
  function wholeClassBusy() {
    var summary = null;
    try { summary = _lastClassroomSummary; } catch (_) { summary = window._lastClassroomSummary || null; }
    if (!summary) return false;
    return Boolean(summary.poll || (summary.gate && summary.gate.armed) || summary.greenlight || summary.doorways
      || (summary.activity && !summary.activity.finished));
  }

  function resultScreenDown(mount) {
    var result = mount.querySelector('[data-classroom-result-screen]');
    return Boolean(result && result.style.transform && result.style.transform !== 'translateY(-100%)');
  }

  // A game, a whole-class moment, or a result is showing above the board's floor.
  function boardPlaying(mount) {
    if (mount.hasAttribute('data-calculator-participating') || mount.hasAttribute('data-park-active')) return true;
    if (resultScreenDown(mount)) return true;
    if (wholeClassBusy()) return true;
    return shownDomChild(mount, '[data-classroom-poll-votes]');
  }

  // The expanded floor is the board's whole canvas. The pulled-down result screen lives inside the
  // board's container (which clips it), so its chart is capped to leave room for the question, the
  // stepper and the close button under it (RESULT_CONTROLS_H) — see the result-canvas CSS rule.
  var RESULT_CONTROLS_H = 100;
  function expandedHeight(mount, canvas) {
    return canvasHeight(canvas);
  }

  // Scroll ownership is decided by the CAUSE of an expansion, not by timing. The page scrolls the
  // room in only when the expansion is the student's own game — the board's
  // data-calculator-participating (their calculator round) or data-park-active (their park /
  // campaign door) — after the student acted on the floor (a click on the board, or a key while
  // nothing else has focus), and only if no whole-class cause (poll, gate, green light,
  // doorways, activity, result screen, vote buttons) is part of it. Broadcasts never scroll,
  // whatever the student did just before.
  var floorArmed = false;     // the student acted on the floor since the last expansion
  var scrollMemo = null;      // { before }: where the page was when we scrolled the room in
  var userScrolled = false;   // the student scrolled while the room was in (our own writes excluded)
  var ignoreScrollUntil = 0;

  function noteFloorInput(event) {
    var target = event.target;
    if (event.type === 'pointerdown' || event.type === 'mousedown') {
      if (target && target.closest && target.closest('#pico-floor')) floorArmed = true;
      return;
    }
    if (isEditable(target)) return;
    var onFloor = Boolean(target && target.closest && target.closest('#pico-floor'));
    var onPage = target === document.body || target === document.documentElement;
    if (onFloor || onPage) floorArmed = true;
  }

  function studentGameSignal(mount) {
    return mount.hasAttribute('data-calculator-participating') || mount.hasAttribute('data-park-active');
  }

  function broadcastSignal(mount) {
    return wholeClassBusy() || resultScreenDown(mount) || shownDomChild(mount, '[data-classroom-poll-votes]');
  }

  // Our own scroll writes and floor resizes must not count as the student scrolling.
  function quietScroll() {
    ignoreScrollUntil = monotonicNow() + 150;
  }

  function setRootScroll(root, value) {
    quietScroll();
    root.scrollTop = value;
  }

  function onRootScroll() {
    if (monotonicNow() < ignoreScrollUntil) return;
    if (scrollMemo) userScrolled = true;
  }

  // Expanding: scroll the room in only for the student's own game.
  function onExpand(mount) {
    var root = byId('pico-home');
    var owned = floorArmed && studentGameSignal(mount) && !broadcastSignal(mount);
    floorArmed = false;
    scrollMemo = null;
    userScrolled = false;
    if (!root || !owned) return;
    var before = root.scrollTop;
    setRootScroll(root, root.scrollHeight);
    scrollMemo = { before: before };
  }

  // Collapsing: decided BEFORE the floor shrinks (the browser clamps the scroll position as the
  // page gets shorter). Returns the position to restore, or null to leave the page alone.
  function takeScrollRestore() {
    var memo = scrollMemo;
    scrollMemo = null;
    var scrolled = userScrolled;
    userScrolled = false;
    if (!memo || scrolled) return null;
    return memo.before;
  }

  function canvasHeight(canvas) {
    return parseFloat(canvas.style.height) || canvas.offsetHeight || 0;
  }

  // The idle band: floor block + the tallest idle thing, at the scene's own scale.
  function idleBandHeight(mount) {
    if (!mount.hasAttribute('data-calculator-active')) return STRIP_IDLE_HEADROOM + BOARD_FLOOR_H;
    var width = mount.clientWidth || ROOM_WORLD_W;
    var scale = Math.min(1, width / ROOM_WORLD_W);
    return Math.round((ROOM_IDLE_HEADROOM + BOARD_FLOOR_H) * scale);
  }

  function layoutFloor() {
    var floor = byId('pico-floor');
    var mount = byId('classroom-board-mount');
    if (!floor || !mount) return;
    var canvas = boardCanvas();
    var hadBoard = floor.classList.contains('has-board');
    floor.classList.toggle('has-board', Boolean(canvas));
    // The board measures its container on mount and on window resize (its own hook): once it has
    // appeared in the full-width floor, let it measure again.
    if (canvas && !hadBoard) setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 0);
    if (!canvas) {
      floor.style.height = '';
      view.boardPlaying = false;
      return;
    }
    var playing = boardPlaying(mount);
    var changing = playing !== Boolean(view.boardPlaying);
    // Ownership of a collapse is read before the floor shrinks.
    var restoreTo = (changing && !playing) ? takeScrollRestore() : null;
    var height = playing ? expandedHeight(mount, canvas) : Math.min(canvasHeight(canvas), idleBandHeight(mount));
    if (floor.style.height !== height + 'px') {
      quietScroll();
      floor.style.height = height + 'px';
    }
    floor.style.setProperty('--pico-result-chart-max', Math.max(60, canvasHeight(canvas) - RESULT_CONTROLS_H) + 'px');
    floor.classList.toggle('is-room', playing);
    floor.setAttribute('data-floor-mode', playing ? 'room' : 'band');
    if (!changing) return;
    view.boardPlaying = playing;
    if (playing) { onExpand(mount); return; }
    var root = byId('pico-home');
    if (root && restoreTo !== null) setRootScroll(root, restoreTo);
  }

  var floorTimer = null;
  var floorWatchTimer = null;
  function stopFloorWatch() {
    if (floorWatchTimer) clearInterval(floorWatchTimer);
    floorWatchTimer = null;
  }
  function scheduleFloor() {
    if (floorTimer) return;
    floorTimer = setTimeout(function () { floorTimer = null; layoutFloor(); }, 16);
  }

  function watchFloor() {
    var mount = byId('classroom-board-mount');
    if (!mount || typeof MutationObserver !== 'function') return;
    new MutationObserver(scheduleFloor).observe(mount, {
      childList: true, attributes: true, subtree: true,
      attributeFilter: ['style', 'data-calculator-active', 'data-calculator-participating', 'data-park-active'],
    });
    window.addEventListener('resize', scheduleFloor);
    window.addEventListener('pointerdown', noteFloorInput, true);
    window.addEventListener('mousedown', noteFloorInput, true);
    window.addEventListener('keydown', noteFloorInput, true);
    // The board reports whole-class changes only to the Desk's summary (no DOM marker for an
    // activity or a vote), so the floor checks it on a light timer and on every board mutation.
    var root = byId('pico-home');
    if (root) root.addEventListener('scroll', onRootScroll, { passive: true });
    floorWatchTimer = setInterval(function () {
      if (document.visibilityState === 'hidden') return;   // paused while the tab is hidden
      var board = byId('classroom-board-mount');
      if (!board || !boardCanvas()) return;
      if (boardPlaying(board) !== Boolean(view.boardPlaying)) layoutFloor();
    }, 300);
    layoutFloor();
  }

  function init() {
    if (byId('pico-home')) return;
    injectStyle();
    buildRoot();
    wire();
    setupLessonPanel();
    setupMyGrade();
    setupFrames();
    watchFloor();
    render();
  }

  // For tests/pico-home.test.js.
  window.PicoHome = {
    atlas: ATLAS,
    atlasSize: ATLAS_SIZE,
    render: render,
    closeMenu: closeMenu,
    rowStatus: rowStatus,
    framed: FRAMED,
    frameExempt: FRAME_EXEMPT,
    hasPollReturn: function () { return pollReturn !== null; },
    layoutFloor: layoutFloor,
    stopFloorWatch: function () { stopFloorWatch(); },
    floorConstants: { BOARD_FLOOR_H: BOARD_FLOOR_H, ROOM_WORLD_W: ROOM_WORLD_W, ROOM_IDLE_HEADROOM: ROOM_IDLE_HEADROOM, STRIP_IDLE_HEADROOM: STRIP_IDLE_HEADROOM },
    days: function () { return view.days; },
  };

  // The Desk's own functions are defined by later scripts on the page, so start once the
  // document has been parsed.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
