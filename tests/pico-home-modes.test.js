// @vitest-environment node
/**
 * tests/pico-home-modes.test.js
 *
 * MENU / PLAY modes on the Pico home (teacher 2026-10-06, after Preview-as-student "it kicked me
 * out": arrows meant for the cat moved the lesson selection and Enter opened a lesson). On the
 * real Desk:
 *   - MENU (default): arrows move the lesson selection, Enter opens it; no game key reaches the
 *     board and the board canvas never holds focus.
 *   - PLAY: every key goes to the game untouched except Esc (back to MENU); the canvas is focused.
 *   - into PLAY: a floor press, the Doge, the badge, a whole-class event; back: Esc, a press
 *     above the floor, the badge. Windows keep the mode they were opened in. Tab is never taken.
 */

import { describe, it, expect } from 'vitest';
import { bootDesk, DESK_URL } from './journeys/harness.js';

const NOW = '2026-10-07T14:00:00.000Z';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot() {
  const harness = await bootDesk({ now: NOW, url: DESK_URL + '?home=park' });
  await harness.signIn('alpha_otter');
  await harness.waitFor(() => harness.document.getElementById('menu-identity').textContent.includes('Alpha Otter'),
    { message: 'signed-in identity chip did not render' });
  const dialog = harness.document.getElementById('dialog-overlay');
  if (dialog && dialog.style.display !== 'none') harness.document.getElementById('dialog-btn').click();
  if (typeof harness.window.closeNameFinder === 'function') harness.window.closeNameFinder();
  await harness.waitFor(() => harness.document.querySelector('#classroom-board-mount > canvas'),
    { timeoutMs: 3000, message: 'the classroom board did not mount' });
  await wait(50);
  if (harness.document.activeElement && harness.document.activeElement !== harness.document.body) harness.document.activeElement.blur();
  return harness;
}

// Dispatches a key and reports what the Pico home did to it before anything else saw it:
// prevented = defaultPrevented when the key reached the document (the window capture listener,
// pico-home's onCaptureKey, has run; the game's own handlers have not), reached = the key got
// there at all (not stopped).
function press(win, target, key) {
  const doc = win.document;
  let reached = false;
  let prevented = false;
  const spy = (e) => { reached = true; prevented = e.defaultPrevented; };
  doc.addEventListener('keydown', spy, true);
  const event = new win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  doc.removeEventListener('keydown', spy, true);
  return { prevented: reached ? prevented : event.defaultPrevented, reached };
}

const tiles = (doc) => [...doc.querySelectorAll('#pico-tiles .tile')];
const canvasOf = (doc) => doc.querySelector('#classroom-board-mount > canvas');
const selectedIndex = (doc) => tiles(doc).findIndex((t) => t.classList.contains('is-selected'));
const badgeText = (doc) => doc.getElementById('pico-mode-badge').textContent.replace(/\s+/g, ' ').trim();
const mousedown = (win, node) => node.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true, cancelable: true }));

function countOpens(win) {
  const calls = [];
  const original = win.maybeBumpThenOpen;
  win.maybeBumpThenOpen = function () { calls.push(1); return original.apply(this, arguments); };
  return calls;
}

describe('Pico MENU / PLAY modes', { timeout: 90_000 }, () => {
  it('loads in MENU; the badge names both modes and the hint follows the mode', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      expect(win.PicoHome.mode()).toBe('menu');
      expect(doc.getElementById('pico-home').getAttribute('data-pico-mode')).toBe('menu');
      expect(badgeText(doc)).toBe('☰ MENU · arrows pick a lesson · click the floor to play');
      // The badge is a real button: Enter / Space are its own click, which toggles.
      doc.getElementById('pico-mode-badge').click();
      expect(win.PicoHome.mode()).toBe('play');
      expect(badgeText(doc)).toBe('▶ PLAY · arrows move your cat · Esc for the menu');
      doc.getElementById('pico-mode-badge').click();
      expect(win.PicoHome.mode()).toBe('menu');
    } finally {
      harness.teardown();
    }
  });

  it('ArrowRight: MENU moves the selection (the game never sees it); PLAY leaves it untouched for the game', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const before = selectedIndex(doc);
      const inMenu = press(win, doc.body, 'ArrowRight');
      expect(selectedIndex(doc)).toBe((before + 1) % tiles(doc).length);
      expect(inMenu).toEqual({ prevented: true, reached: false });
      expect(doc.activeElement).not.toBe(canvasOf(doc));   // the canvas never holds focus in MENU

      mousedown(win, canvasOf(doc));   // a press on the floor: PLAY
      expect(win.PicoHome.mode()).toBe('play');
      expect(doc.activeElement).toBe(canvasOf(doc));
      const at = selectedIndex(doc);
      const inPlay = press(win, doc.activeElement, 'ArrowRight');
      expect(inPlay).toEqual({ prevented: false, reached: true });
      expect(selectedIndex(doc)).toBe(at);
      expect(doc.activeElement).toBe(canvasOf(doc));
    } finally {
      harness.teardown();
    }
  });

  it('Enter in PLAY never opens a tile, even with a tile focused when PLAY began', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const opens = countOpens(win);
      tiles(doc)[selectedIndex(doc)].focus();
      mousedown(win, canvasOf(doc));
      expect(doc.activeElement).toBe(canvasOf(doc));
      for (const k of ['Enter', ' ', '1', 'ArrowLeft']) expect(press(win, doc.activeElement, k)).toEqual({ prevented: false, reached: true });
      await wait(450);
      expect(opens).toHaveLength(0);
      expect(doc.getElementById('pico-home').classList.contains('pico-whiteout')).toBe(false);
    } finally {
      harness.teardown();
    }
  });

  it('Esc in PLAY returns to MENU with the selected tile outlined; a press above the floor does too', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      press(win, doc.body, 'ArrowRight');
      const selected = tiles(doc)[selectedIndex(doc)];
      mousedown(win, canvasOf(doc));
      expect(selected.classList.contains('is-active')).toBe(false);   // the cat has the outline in PLAY
      const esc = press(win, doc.activeElement, 'Escape');
      expect(esc).toEqual({ prevented: true, reached: false });
      expect(win.PicoHome.mode()).toBe('menu');
      expect(selected.classList.contains('is-active')).toBe(true);
      expect(doc.activeElement).not.toBe(canvasOf(doc));

      mousedown(win, canvasOf(doc));
      expect(win.PicoHome.mode()).toBe('play');
      const nav = doc.querySelector('#pico-home .navbtn[data-nav="MY GRADE"]');
      mousedown(win, nav);
      expect(win.PicoHome.mode()).toBe('menu');
    } finally {
      harness.teardown();
    }
  });

  it('a floor press enters PLAY and blurs every Pico control; the Doge enters PLAY too', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      doc.querySelector('#pico-home .navbtn[data-nav="LESSONS"]').focus();
      mousedown(win, doc.getElementById('pico-floor'));
      expect(win.PicoHome.mode()).toBe('play');
      expect(doc.getElementById('pico-home').contains(doc.activeElement)
        && !doc.getElementById('pico-floor').contains(doc.activeElement)).toBe(false);
      expect(doc.activeElement).toBe(canvasOf(doc));

      press(win, doc.activeElement, 'Escape');
      expect(win.PicoHome.mode()).toBe('menu');
      mousedown(win, doc.getElementById('doge-presence'));
      expect(win.PicoHome.mode()).toBe('play');
    } finally {
      harness.teardown();
    }
  });

  it('a broadcast poll switches to PLAY', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      expect(win.PicoHome.mode()).toBe('menu');
      const sock = harness.sockets.find((s) => s.sent.some((d) => String(d).indexOf('classroom_join') >= 0));
      sock.onmessage({ data: JSON.stringify({ type: 'classroom_poll', id: 'm1', question: 'Ready?', options: ['A', 'B'] }) });
      await harness.waitFor(() => win.PicoHome.mode() === 'play', { timeoutMs: 2000, message: 'the poll did not switch to PLAY' });
      expect(doc.getElementById('pico-home').getAttribute('data-pico-mode')).toBe('play');
    } finally {
      harness.teardown();
    }
  });

  it('opening and closing the lesson panel keeps the mode it was opened in', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const index = win.PicoHome.days().findIndex((d) => d.kind === 'lesson');
      // MENU: Enter from the page opens the selected tile; Esc returns focus to it, still MENU.
      while (selectedIndex(doc) !== index) press(win, doc.body, 'ArrowRight');
      press(win, doc.body, 'Enter');
      await harness.waitFor(() => doc.querySelector('#resource-body .pico-lesson-list'), { message: 'the panel did not open (MENU)' });
      await wait(100);
      press(win, doc.activeElement, 'Escape');
      await harness.waitFor(() => doc.getElementById('resource-overlay').style.display === 'none', { message: 'the panel did not close' });
      expect(win.PicoHome.mode()).toBe('menu');
      await harness.waitFor(() => doc.activeElement === tiles(doc)[index], { timeoutMs: 1000, message: 'focus did not return to the tile' });

      // PLAY (set by the badge), the panel opened by a script click: it closes back to the game.
      win.PicoHome.setMode('play');
      tiles(doc)[index].click();
      await harness.waitFor(() => doc.getElementById('resource-overlay').style.display === 'block', { message: 'the panel did not open (PLAY)' });
      await wait(100);
      const inPanel = press(win, doc.activeElement, 'ArrowDown');   // the panel owns its keys in any mode
      expect(inPanel.prevented).toBe(true);
      press(win, doc.activeElement, 'Escape');
      await harness.waitFor(() => doc.getElementById('resource-overlay').style.display === 'none', { message: 'the panel did not close' });
      expect(win.PicoHome.mode()).toBe('play');
      await harness.waitFor(() => doc.activeElement === canvasOf(doc), { timeoutMs: 1000, message: 'focus did not go back to the game' });
    } finally {
      harness.teardown();
    }
  });

  it('Esc from a focused floor control leaves the floor; MENU arrows then move the selection and never reach the board', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const floor = doc.getElementById('pico-floor');
      const mount = doc.getElementById('classroom-board-mount');
      // A floor control (a park door's button); one is added when the scene shows none.
      let control = mount.querySelector('button');
      if (!control) { control = doc.createElement('button'); control.textContent = 'door'; mount.appendChild(control); }

      mousedown(win, canvasOf(doc));
      control.focus();
      expect(doc.activeElement).toBe(control);
      press(win, control, 'Escape');
      expect(win.PicoHome.mode()).toBe('menu');
      expect(floor.contains(doc.activeElement)).toBe(false);
      expect(doc.activeElement).toBe(tiles(doc)[selectedIndex(doc)]);
      const before = selectedIndex(doc);
      expect(press(win, doc.activeElement, 'ArrowRight')).toEqual({ prevented: true, reached: false });
      expect(selectedIndex(doc)).toBe((before + 1) % tiles(doc).length);

      // Focus reaching the floor while MENU shows (Tab): an arrow lets go of it and is stopped.
      control.focus();
      const at = selectedIndex(doc);
      expect(press(win, control, 'ArrowRight')).toEqual({ prevented: true, reached: false });
      expect(win.PicoHome.mode()).toBe('menu');
      expect(floor.contains(doc.activeElement)).toBe(false);
      expect(selectedIndex(doc)).toBe((at + 1) % tiles(doc).length);
      expect(press(win, doc.body, '1').reached).toBe(true);   // (sanity: the spy sees unstopped keys)
    } finally {
      harness.teardown();
    }
  });

  it('Space or Enter on the focused Doge enters PLAY and opens its dropdown', async () => {
    for (const key of [' ', 'Enter']) {
      const harness = await boot();
      try {
        const { document: doc, window: win } = harness;
        const doge = doc.getElementById('doge-presence');
        doge.focus();
        expect(win.PicoHome.mode()).toBe('menu');
        const result = press(win, doge, key);
        expect(result.reached).toBe(true);
        expect(win.PicoHome.mode()).toBe('play');
        expect(doc.getElementById('doge-dropdown').classList.contains('show')).toBe(true);
        expect(doc.activeElement).toBe(doge);
        win.DogePresence.closeDropdown();   // its background re-render must not outlive the page
        await wait(50);
      } finally {
        harness.teardown();
      }
    }
  });

  it('with SCHEDULE open in PLAY, Esc closes SCHEDULE first; the next Esc leaves PLAY', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      // The harness sign-in leaves the sign-in roster dropdown shown; the Desk's Esc handler
      // closes that first (and consumes the key), which is not what this test is about.
      doc.getElementById('signin-roster-dropdown').style.display = 'none';
      doc.querySelector('#pico-home .navbtn[data-nav="LESSONS"]').click();
      [...doc.querySelectorAll('#pico-menu-list .action')].find((b) => b.textContent === 'SCHEDULE').click();
      expect(doc.documentElement.classList.contains('pico-lessons-open')).toBe(true);
      win.PicoHome.setMode('play', { keepFocus: true });

      press(win, doc.activeElement || doc.body, 'Escape');
      await harness.waitFor(() => !doc.documentElement.classList.contains('pico-lessons-open'), { timeoutMs: 1000, message: 'Esc did not close SCHEDULE' });
      expect(win.PicoHome.mode()).toBe('play');
      await harness.waitFor(() => doc.activeElement === canvasOf(doc), { timeoutMs: 1000, message: 'focus did not go back to the game' });

      press(win, doc.activeElement, 'Escape');
      expect(win.PicoHome.mode()).toBe('menu');
    } finally {
      harness.teardown();
    }
  });

  it('Tab is never intercepted, in either mode', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const tile = tiles(doc)[selectedIndex(doc)];
      tile.focus();
      expect(press(win, tile, 'Tab')).toEqual({ prevented: false, reached: true });
      expect(press(win, doc.body, 'Tab')).toEqual({ prevented: false, reached: true });
      mousedown(win, canvasOf(doc));
      expect(press(win, doc.activeElement, 'Tab')).toEqual({ prevented: false, reached: true });
    } finally {
      harness.teardown();
    }
  });
});
