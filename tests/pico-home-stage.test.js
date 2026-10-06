// @vitest-environment node
/**
 * tests/pico-home-stage.test.js
 *
 * The Pico home's stage-select feel (teacher 2026-10-06), on the real Desk:
 *   - exactly ONE active outline (orange, breathing) — the focused / hovered / selected element;
 *     every other current marker (the selected tile when focus is elsewhere, TODAY's page marker,
 *     the open Doge menu) is static green;
 *   - hover dwell: a tile or row takes the selection only after the pointer rests ~160 ms;
 *     keyboard moves are instant;
 *   - white-out on open: the rest of the home fades to white around the chosen tile, the panel
 *     opens once (≤ 350 ms), the page stays white while it is open and clears on close; under
 *     reduced motion the white state and the open are synchronous.
 *
 * jsdom timers: pico-home.js runs on the jsdom window, whose timers vitest's fake timers do not
 * replace, so the dwell is checked with short real waits on either side of 160 ms.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bootDesk, DESK_URL } from './journeys/harness.js';

const PICO = readFileSync(resolve(__dirname, '..', 'pico-home.js'), 'utf8');
const NOW = '2026-10-07T14:00:00.000Z';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const key = (win, target, k) => target.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

async function boot() {
  const harness = await bootDesk({ now: NOW, url: DESK_URL + '?home=park' });
  await harness.signIn('alpha_otter');
  await harness.waitFor(() => harness.document.getElementById('menu-identity').textContent.includes('Alpha Otter'),
    { message: 'signed-in identity chip did not render' });
  const dialog = harness.document.getElementById('dialog-overlay');
  if (dialog && dialog.style.display !== 'none') harness.document.getElementById('dialog-btn').click();
  if (typeof harness.window.closeNameFinder === 'function') harness.window.closeNameFinder();
  // Whatever the sign-in flow left focused settles first; then the student is on the week strip.
  await wait(50);
  harness.document.querySelector('#pico-tiles .tile.is-selected').focus();
  return harness;
}

const tiles = (doc) => [...doc.querySelectorAll('#pico-tiles .tile')];
const actives = (doc) => [...doc.querySelectorAll('#pico-home .is-active, #resource-body .is-active')];

function lessonTile(win, doc) {
  const index = win.PicoHome.days().findIndex((d) => d.kind === 'lesson');
  expect(index, 'no lesson tile on this week').toBeGreaterThanOrEqual(0);
  return tiles(doc)[index];
}

// Counts real opens: the Desk's own opener, wrapped (callDesk reads window[name] at call time).
function countOpens(win) {
  const calls = [];
  const original = win.maybeBumpThenOpen;
  win.maybeBumpThenOpen = function () { calls.push(win.performance.now()); return original.apply(this, arguments); };
  return calls;
}

describe('Pico stage select -- outlines', { timeout: 90_000 }, () => {
  it('CSS: only the active outline pulses (transform only, motion allowed only); green is static; the triangle never pulses', () => {
    expect(PICO).toContain("'@keyframes pico-select-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.04); } }',");
    const motion = /'@media \(prefers-reduced-motion: no-preference\) \{',\n    '  ' \+ PICO_FRAME_SELECTORS\.map\(function \(sel\) \{ return sel \+ '\.is-active::after'; \}\)\.join\(', '\) \+\n    ' \{ animation: pico-select-pulse 1\.2s ease-in-out infinite; will-change: transform; \}',/;
    expect(PICO).toMatch(motion);
    // The keyframes are used exactly once (the active rule) — never on .pico-green, .is-selected or the triangle.
    expect(PICO.match(/animation: pico-select-pulse/g)).toHaveLength(1);
    expect(PICO).toContain("' { --frame-colour: #3DA35D; }',");
  });

  it('at rest the selected tile carries the one active outline', async () => {
    const harness = await boot();
    try {
      const { document: doc } = harness;
      const selected = doc.querySelector('#pico-tiles .tile.is-selected');
      expect(selected).not.toBeNull();
      expect(actives(doc)).toEqual([selected]);
    } finally {
      harness.teardown();
    }
  });

  it('hovering the Doge while a tile is selected: one orange (the Doge), the tile and TODAY green', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const tile = doc.querySelector('#pico-tiles .tile.is-selected');
      const today = doc.querySelector('#pico-home .navbtn[data-nav="TODAY"]');
      expect(today.getAttribute('aria-current')).toBe('page');
      const doge = doc.getElementById('doge-presence');
      doge.dispatchEvent(new win.MouseEvent('mouseenter'));
      expect(actives(doc)).toEqual([doge]);
      expect(tile.classList.contains('pico-green')).toBe(true);
      expect(today.classList.contains('pico-green')).toBe(true);
      expect(doge.classList.contains('pico-green')).toBe(false);
      // Leaving hands the outline back to the selected tile.
      doge.dispatchEvent(new win.MouseEvent('mouseleave'));
      expect(actives(doc)).toEqual([tile]);
      expect(tile.classList.contains('pico-green')).toBe(false);
      expect(today.classList.contains('pico-green')).toBe(true);
    } finally {
      harness.teardown();
    }
  });

  it('hover dwell: in-and-out within 100 ms does not move the selection; resting 200 ms does', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const list = tiles(doc);
      const a = list.findIndex((t) => t.classList.contains('is-selected'));
      const b = (a + 1) % list.length;
      list[b].dispatchEvent(new win.MouseEvent('mouseenter'));
      await wait(100);
      list[b].dispatchEvent(new win.MouseEvent('mouseleave'));
      await wait(150);   // past the dwell: the cancelled timer must not fire
      expect(list[a].classList.contains('is-selected')).toBe(true);
      expect(list[b].classList.contains('is-selected')).toBe(false);
      list[b].dispatchEvent(new win.MouseEvent('mouseenter'));
      expect(list[b].classList.contains('is-selected')).toBe(false);   // not instantly
      await wait(200);
      expect(list[b].classList.contains('is-selected')).toBe(true);
      expect(actives(doc)).toEqual([list[b]]);
    } finally {
      harness.teardown();
    }
  });

  it('keyboard arrows move the selection at once (no dwell), focus follows', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const list = tiles(doc);
      const a = list.findIndex((t) => t.classList.contains('is-selected'));
      list[a].focus();
      key(win, list[a], 'ArrowRight');
      const b = (a + 1) % list.length;
      expect(list[b].classList.contains('is-selected')).toBe(true);
      expect(doc.activeElement).toBe(list[b]);
      expect(actives(doc)).toEqual([list[b]]);
    } finally {
      harness.teardown();
    }
  });
});

describe('Pico stage select -- review fixes', { timeout: 90_000 }, () => {
  it('the Doge menu toggling N times: bounded observer callbacks, no feedback loop', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const doge = doc.getElementById('doge-presence');
      const stats = win.PicoHome.outlineStats;
      // The outline writes on the Doge (hover → is-active, open menu → green) used to re-trigger
      // the Doge's class observer forever (the pre-fix code never settles: this test hangs on it). Hover it, then open/close its menu N times.
      doge.dispatchEvent(new win.MouseEvent('mouseenter'));
      doge.dispatchEvent(new win.MouseEvent('mouseleave'));
      const N = 10;
      const before = { doge: stats.dogeCallbacks, paints: stats.greenPaints };
      for (let i = 0; i < N; i += 1) {
        doge.classList.toggle('doge-active');
        await wait(5);   // let each mutation batch deliver
      }
      await wait(100);
      const settled = { doge: stats.dogeCallbacks, paints: stats.greenPaints };
      expect(settled.doge - before.doge).toBeLessThanOrEqual(2 * N);
      expect(settled.paints - before.paints).toBeLessThanOrEqual(N + 4);
      // Quiet: nothing keeps firing once the toggling stops.
      await wait(200);
      expect(stats.dogeCallbacks).toBe(settled.doge);
      expect(stats.greenPaints).toBe(settled.paints);
      // Open state ends green (the selected tile holds the orange); closed ends plain.
      doge.classList.add('doge-active');
      await wait(20);
      expect(doge.classList.contains('pico-green')).toBe(true);
      doge.classList.remove('doge-active');
      await wait(20);
      expect(doge.classList.contains('pico-green')).toBe(false);
    } finally {
      harness.teardown();
    }
  });

  it('a key pressed during a hover dwell wins: the selection follows the key, the dwell never applies', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const list = tiles(doc);
      const a = list.findIndex((t) => t.classList.contains('is-selected'));
      const b = (a + 2) % list.length;
      list[b].dispatchEvent(new win.MouseEvent('mouseenter'));   // hover B (pointer stays there)
      await wait(60);
      key(win, doc.activeElement, 'ArrowRight');
      const c = (a + 1) % list.length;
      expect(list[c].classList.contains('is-selected')).toBe(true);
      await wait(250);   // well past the dwell
      expect(list[c].classList.contains('is-selected')).toBe(true);
      expect(list[b].classList.contains('is-selected')).toBe(false);
      expect(actives(doc)).toEqual([list[c]]);
      // The pointer never left B. A zero-delta mousemove (the page moving under a still pointer)
      // keeps the pointer suspended: B is not selected.
      const move = (x, y) => list[b].dispatchEvent(new win.MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));
      move(40, 40);   // the first move is a real one: arms B …
      await wait(250);
      expect(list[b].classList.contains('is-selected')).toBe(true);   // … so B is selected without leaving
      key(win, doc.activeElement, 'ArrowRight');                       // suspend again
      const d = (b + 1) % list.length;
      expect(list[d].classList.contains('is-selected')).toBe(true);
      move(40, 40);   // zero delta: still suspended
      await wait(250);
      expect(list[d].classList.contains('is-selected')).toBe(true);
      expect(list[b].classList.contains('is-selected')).toBe(false);
      move(44, 41);   // a real move inside B: the dwell is armed as if B had just been entered
      expect(list[b].classList.contains('is-selected')).toBe(false);   // still a dwell, not instant
      await wait(250);
      expect(list[b].classList.contains('is-selected')).toBe(true);
    } finally {
      harness.teardown();
    }
  });

  it('hover, then a re-render replaces the tiles: the pending dwell is a no-op', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const list = tiles(doc);
      const a = list.findIndex((t) => t.classList.contains('is-selected'));
      const b = (a + 1) % list.length;
      list[b].dispatchEvent(new win.MouseEvent('mouseenter'));
      await wait(40);
      win.PicoHome.render();
      const fresh = tiles(doc);
      expect(fresh[b]).not.toBe(list[b]);
      await wait(250);
      expect(fresh[a].classList.contains('is-selected')).toBe(true);
      expect(fresh[b].classList.contains('is-selected')).toBe(false);
    } finally {
      harness.teardown();
    }
  });

  it('a re-render during the white-out keeps the opener: Esc returns focus to that date’s new tile', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const index = win.PicoHome.days().findIndex((d) => d.kind === 'lesson');
      const original = tiles(doc)[index];
      original.focus();
      original.click();
      await wait(100);
      win.PicoHome.render();   // mid-fade: the tile node is replaced
      const fresh = tiles(doc)[index];
      expect(fresh).not.toBe(original);
      await harness.waitFor(() => doc.querySelector('#resource-body .pico-lesson-list'), { message: 'the panel did not open' });
      await wait(100);
      key(win, doc.activeElement, 'Escape');
      await harness.waitFor(() => doc.activeElement === tiles(doc)[index],
        { timeoutMs: 1500, message: 'focus did not return to the re-rendered tile' });
      expect(doc.activeElement.textContent).toBe(fresh.textContent);
    } finally {
      harness.teardown();
    }
  });
});

describe('Pico stage select -- white-out on open', { timeout: 90_000 }, () => {
  it('a tile click whitens the home around the chosen tile, opens the panel once (≤ 350 ms), stays white while open, clears on close', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const root = doc.getElementById('pico-home');
      const opens = countOpens(win);
      const tile = lessonTile(win, doc);
      const t0 = win.performance.now();
      tile.click();
      expect(root.classList.contains('pico-whiteout')).toBe(true);
      expect(tile.closest('li').classList.contains('pico-chosen')).toBe(true);
      expect(doc.querySelectorAll('#pico-home .pico-chosen')).toHaveLength(1);
      expect(opens).toHaveLength(0);   // the fade + hold come first
      tile.click();                     // a second click during the fade: ignored
      await harness.waitFor(() => doc.querySelector('#resource-body .pico-lesson-list'), { message: 'the panel did not open' });
      await wait(300);
      expect(opens).toHaveLength(1);
      expect(opens[0] - t0).toBeGreaterThanOrEqual(300);
      expect(opens[0] - t0).toBeLessThan(450);   // 340 ms by design; jsdom timer slack
      expect(root.classList.contains('pico-whiteout')).toBe(true);
      key(win, doc.activeElement, 'Escape');
      await harness.waitFor(() => !root.classList.contains('pico-whiteout'), { message: 'the white-out did not clear on close' });
      expect(doc.querySelectorAll('#pico-home .pico-chosen')).toHaveLength(0);
    } finally {
      harness.teardown();
    }
  });

  it('reduced motion: the white state and the open happen synchronously', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      win.matchMedia = (q) => ({ matches: /prefers-reduced-motion:\s*reduce/.test(q), media: q, addListener() {}, removeListener() {} });
      const opens = countOpens(win);
      lessonTile(win, doc).click();
      expect(opens).toHaveLength(1);
      expect(doc.getElementById('pico-home').classList.contains('pico-whiteout')).toBe(true);
    } finally {
      harness.teardown();
    }
  });

  it('CSS: everything but the chosen tile fades (220 ms in, 180 ms back); the panel backdrop is white .92', () => {
    expect(PICO).toContain("'#pico-home.pico-whiteout .scene > :not(.tiles):not(.pico-chosen), #pico-home.pico-whiteout .tiles > li:not(.pico-chosen) {',");
    expect(PICO).toContain("'  opacity: .08; transition-duration: 220ms; }',");
    expect(PICO).toContain("'#pico-home .scene > *, #pico-home .tiles > li { transition: opacity 180ms ease-out; }',");
    expect(PICO).toContain("'html.pico-home #resource-overlay.pico-lesson { background: rgba(255, 255, 255, .92); }',");
    expect(PICO).not.toMatch(/pico-whiteout[^']*pointer-events/);
  });
});
