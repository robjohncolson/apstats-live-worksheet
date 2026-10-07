// @vitest-environment node
/**
 * tests/pico-home-keys.test.js
 *
 * Keys on the Pico home (teacher 2026-10-06, superseding the MENU / PLAY modes): "no keystroke
 * input for lesson picker, all keystrokes go to the cat." On the real Desk:
 *   - Pico never takes a key except inside an open Pico menu (OPTION / LESSONS / PRACTICE) and
 *     inside the lesson panel's action list. The week strip, the week picker and the sign have no
 *     key handling; a focused tile is a plain button (the browser's own Enter / Space).
 *   - Focus is never left on a Pico control for a pointer user: a window or menu closing gives
 *     focus back to its opener only after Tab (keyboard use); a pointer press clears that, and a
 *     press on the floor lets go of a focused Pico control.
 *   - No mode badge, hint, announcer or cat ring exists.
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

// Dispatches a key and reports what reached the document (the classroom board listens there):
// reached = it got there (not stopped), prevented = defaultPrevented at that point. The spy is a
// document capture listener, so it runs after Pico's window capture listener and before the
// board's own handlers (which may prevent game keys themselves).
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
const selectedIndex = (doc) => tiles(doc).findIndex((t) => t.classList.contains('is-selected'));
const pointer = (win, node, type) => node.dispatchEvent(new win.MouseEvent(type, { bubbles: true, cancelable: true }));
const panelShown = (doc) => doc.getElementById('resource-overlay').style.display === 'block';
const GAME_KEYS = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', ' ', '1', 'Enter'];

function countOpens(win) {
  const calls = [];
  const original = win.maybeBumpThenOpen;
  win.maybeBumpThenOpen = function () { calls.push(1); return original.apply(this, arguments); };
  return calls;
}

async function openPanelFrom(harness, tile) {
  tile.click();
  await harness.waitFor(() => panelShown(harness.document) && harness.document.querySelector('#resource-body .pico-lesson-list'),
    { message: 'the lesson panel did not open' });
  await wait(100);
}

async function closePanel(harness) {
  const { document: doc, window: win } = harness;
  press(win, doc.activeElement, 'Escape');
  await harness.waitFor(() => !panelShown(doc), { message: 'the panel did not close' });
  await wait(50);
}

function lessonTile(win, doc) {
  const index = win.PicoHome.days().findIndex((d) => d.kind === 'lesson');
  return tiles(doc)[index];
}

describe('Pico keys: every key goes to the cat', { timeout: 90_000 }, () => {
  it('no mode, badge, hint, announcer or cat ring exists', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      for (const id of ['pico-mode-badge', 'pico-mode-hint', 'pico-mode-live', 'pico-cat-ring']) expect(doc.getElementById(id)).toBeNull();
      expect(doc.querySelector('.mode-badge, .mode-hint, .cat-ring, .pico-cat-ring')).toBeNull();
      expect(doc.getElementById('pico-home').hasAttribute('data-pico-mode')).toBe(false);
      expect(win.PicoHome.mode).toBeUndefined();
      expect(win.PicoHome.setMode).toBeUndefined();
    } finally {
      harness.teardown();
    }
  });

  it('arrows, Space, digits and Enter on the page, a focused tile, the week picker or the sign are never taken', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const opens = countOpens(win);
      const before = selectedIndex(doc);
      for (const key of GAME_KEYS) expect(press(win, doc.body, key)).toEqual({ prevented: false, reached: true });
      const tile = tiles(doc)[before];
      tile.focus();
      for (const key of GAME_KEYS) expect(press(win, tile, key)).toEqual({ prevented: false, reached: true });
      expect(selectedIndex(doc)).toBe(before);   // no arrow navigation on the strip
      expect(doc.activeElement).toBe(tile);
      for (const node of [...doc.querySelectorAll('#pico-home .carousel button'), doc.getElementById('pico-sign-go')].filter(Boolean)) {
        node.focus();
        for (const key of ['ArrowRight', 'ArrowLeft', ' ', '1']) expect(press(win, node, key)).toEqual({ prevented: false, reached: true });
      }
      await wait(450);
      expect(opens).toHaveLength(0);   // Enter on the page never opens the selected tile
      expect(doc.getElementById('pico-home').classList.contains('pico-whiteout')).toBe(false);
    } finally {
      harness.teardown();
    }
  });

  it('a focused tile: Pico adds no Enter handler; the button’s own click opens it', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const tile = lessonTile(win, doc);
      tile.focus();
      expect(press(win, tile, 'Enter')).toEqual({ prevented: false, reached: true });
      await wait(450);
      expect(panelShown(doc)).toBe(false);   // jsdom does not turn Enter into a click; Pico does not either
      await openPanelFrom(harness, tile);    // the browser would: Enter on a button = its click
      expect(panelShown(doc)).toBe(true);
    } finally {
      harness.teardown();
    }
  });

  it('closing a panel opened by the pointer leaves nothing focused; one opened after Tab returns focus to its tile', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const tile = lessonTile(win, doc);
      pointer(win, tile, 'pointerdown');
      await openPanelFrom(harness, tile);
      await closePanel(harness);
      expect(doc.activeElement).toBe(doc.body);

      press(win, doc.body, 'Tab');   // keyboard use
      lessonTile(win, doc).focus();
      await openPanelFrom(harness, lessonTile(win, doc));
      await closePanel(harness);
      await harness.waitFor(() => doc.activeElement === lessonTile(win, doc), { timeoutMs: 1000, message: 'focus did not return to the tile' });

      // A pointer press ends keyboard use again.
      pointer(win, lessonTile(win, doc), 'pointerdown');
      await openPanelFrom(harness, lessonTile(win, doc));
      await closePanel(harness);
      expect(doc.activeElement).toBe(doc.body);
    } finally {
      harness.teardown();
    }
  });

  it('a Pico menu closed after a pointer open leaves nothing focused; after Tab it returns to its nav button', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const option = doc.querySelector('#pico-home .navbtn[data-nav="OPTION"]');
      pointer(win, option, 'pointerdown');
      option.click();
      expect(press(win, doc.activeElement, 'Escape').reached).toBe(false);
      expect(doc.getElementById('pico-menu-backdrop').hidden).toBe(true);
      expect(doc.activeElement).toBe(doc.body);

      press(win, doc.body, 'Tab');
      option.focus();
      option.click();
      press(win, doc.activeElement, 'Escape');
      expect(doc.activeElement).toBe(option);
    } finally {
      harness.teardown();
    }
  });

  it('a press on the floor lets go of a focused nav button or tile', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const floor = doc.getElementById('pico-floor');
      for (const node of [doc.querySelector('#pico-home .navbtn[data-nav="LESSONS"]'), tiles(doc)[0]]) {
        node.focus();
        expect(doc.activeElement).toBe(node);
        pointer(win, floor, 'pointerdown');
        expect(doc.activeElement).toBe(doc.body);
      }
    } finally {
      harness.teardown();
    }
  });

  it('a real pointer click on a nav button does not leave it focused (Space would press it again)', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const next = doc.querySelector('#pico-home .carousel button:last-of-type') || doc.querySelector('#pico-home .carousel button');
      next.focus();
      next.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
      expect(doc.activeElement).not.toBe(next);
      // A keyboard click (detail 0) keeps focus.
      const today = doc.querySelector('#pico-home .navbtn[data-nav="TODAY"]');
      today.focus();
      today.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
      expect(doc.activeElement).toBe(today);
    } finally {
      harness.teardown();
    }
  });

  it('inside an open OPTION menu, arrows move the list and are stopped; Tab stays in the menu', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      doc.querySelector('#pico-home .navbtn[data-nav="OPTION"]').click();
      const first = doc.activeElement;
      expect(first.classList.contains('action')).toBe(true);
      expect(press(win, first, 'ArrowDown')).toEqual({ prevented: true, reached: false });
      expect(doc.activeElement).not.toBe(first);
      expect(press(win, doc.activeElement, 'ArrowRight').reached).toBe(false);
      expect(press(win, doc.activeElement, 'Tab').reached).toBe(false);   // the menu's own focus trap
      press(win, doc.activeElement, 'Escape');
      expect(doc.getElementById('pico-menu-backdrop').hidden).toBe(true);
    } finally {
      harness.teardown();
    }
  });

  it('the lesson panel list still owns its keys', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      await openPanelFrom(harness, lessonTile(win, doc));
      const inPanel = press(win, doc.activeElement, 'ArrowDown');
      expect(inPanel).toEqual({ prevented: true, reached: false });
      await closePanel(harness);
    } finally {
      harness.teardown();
    }
  });

  it('a broadcast poll changes nothing about the keys', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const sock = harness.sockets.find((s) => s.sent.some((d) => String(d).indexOf('classroom_join') >= 0));
      sock.onmessage({ data: JSON.stringify({ type: 'classroom_poll', id: 'm1', question: 'Ready?', options: ['A', 'B'] }) });
      await wait(200);
      for (const key of GAME_KEYS) expect(press(win, doc.body, key)).toEqual({ prevented: false, reached: true });
    } finally {
      harness.teardown();
    }
  });

  it('Tab is never intercepted outside an open menu', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const tile = tiles(doc)[selectedIndex(doc)];
      tile.focus();
      expect(press(win, tile, 'Tab')).toEqual({ prevented: false, reached: true });
      expect(press(win, doc.body, 'Tab')).toEqual({ prevented: false, reached: true });
      const nav = doc.querySelector('#pico-home .navbtn[data-nav="LESSONS"]');
      nav.focus();
      expect(press(win, nav, 'Tab')).toEqual({ prevented: false, reached: true });
    } finally {
      harness.teardown();
    }
  });
});

// Teacher report 2026-10-07: "the playing area went white and the Tue Oct 6 lesson card opened
// unprompted" while playing. Hover is VISUAL ONLY (never focus), and while a game runs a tile or
// the sign opens only from a real pointer click or a Tab-reached keyboard activation.
describe('Pico hover never focuses; a game never opens a lesson from a stale key', { timeout: 90_000 }, () => {
  it('hovering a tile for 200 ms outlines it but leaves focus on the page; nav and Doge hover never focus', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const list = tiles(doc);
      const b = (selectedIndex(doc) + 1) % list.length;
      pointer(win, list[b], 'mouseenter');
      await wait(200);
      expect(list[b].classList.contains('is-selected')).toBe(true);
      expect(list[b].classList.contains('is-active')).toBe(true);
      expect(doc.activeElement).toBe(doc.body);
      pointer(win, list[b], 'mouseleave');
      for (const node of [doc.querySelector('#pico-home .navbtn'), doc.getElementById('doge-presence')]) {
        pointer(win, node, 'mouseenter');
        await wait(200);
        expect(node.classList.contains('is-active')).toBe(true);
        expect(doc.activeElement).toBe(doc.body);
        pointer(win, node, 'mouseleave');
      }
    } finally {
      harness.teardown();
    }
  });

  it('during a level: Space on the page with a tile outlined opens nothing', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      doc.getElementById('classroom-board-mount').setAttribute('data-park-active', '');
      const opens = countOpens(win);
      const tile = lessonTile(win, doc);
      pointer(win, tile, 'mouseenter');
      await wait(200);
      expect(tile.classList.contains('is-active')).toBe(true);
      press(win, doc.body, ' ');
      press(win, doc.body, 'Enter');
      await wait(450);
      expect(opens.length).toBe(0);
      expect(panelShown(doc)).toBe(false);
      expect(doc.getElementById('pico-home').classList.contains('pico-whiteout')).toBe(false);
    } finally {
      harness.teardown();
    }
  });

  it('during a level: a key activation of a tile holding stale (non-Tab) focus is refused and lets go of focus', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      doc.getElementById('classroom-board-mount').setAttribute('data-park-active', '');
      const opens = countOpens(win);
      const tile = lessonTile(win, doc);
      tile.focus();   // stale focus (not reached by Tab)
      // The browser's Space / Enter default action on a focused button: a click with detail 0.
      tile.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
      await wait(450);
      expect(opens.length).toBe(0);
      expect(doc.getElementById('pico-home').classList.contains('pico-whiteout')).toBe(false);
      expect(doc.activeElement).toBe(doc.body);
    } finally {
      harness.teardown();
    }
  });

  it('during a level: Tab onto a tile, then Enter, opens it', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      doc.getElementById('classroom-board-mount').setAttribute('data-park-active', '');
      const opens = countOpens(win);
      const tile = lessonTile(win, doc);
      press(win, doc.body, 'Tab');
      tile.focus();   // where the browser's Tab lands
      tile.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
      await harness.waitFor(() => opens.length > 0, { timeoutMs: 2000, message: 'the Tab-reached tile did not open' });
      expect(opens.length).toBe(1);
    } finally {
      harness.teardown();
    }
  });

  // Codex review 2026-10-07: a re-render replaced the Tab-focused tile; keyboard focus restore moved
  // to the replacement, but eligibility was pinned to the detached node and Enter was refused.
  it('during a level: a re-render after Tab keeps the keyboard activation eligible', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      doc.getElementById('classroom-board-mount').setAttribute('data-park-active', '');
      const opens = countOpens(win);
      const before = lessonTile(win, doc);
      press(win, doc.body, 'Tab');
      before.focus();
      win.PicoHome.render();
      const after = lessonTile(win, doc);
      expect(after).not.toBe(before);
      expect(doc.contains(before)).toBe(false);
      after.focus();   // keyboard focus restore lands on the replacement
      after.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
      await harness.waitFor(() => opens.length > 0, { timeoutMs: 2000, message: 'the re-rendered tile did not open' });
      expect(opens.length).toBe(1);
      expect(doc.activeElement === doc.body).toBe(false);
    } finally {
      harness.teardown();
    }
  });
});
