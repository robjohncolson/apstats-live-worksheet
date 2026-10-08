// @vitest-environment node
/**
 * tests/pico-home-doge.test.js
 *
 * Study Break's Doge as the Pico home's PLAY button (teacher 2026-10-06). Flag on: the Desk's own
 * #doge-presence node (sprite, presence badge, "Online Now" / challenge dropdown, incoming
 * challenge panel) sits at the right of the Pico nav and keeps every behaviour: its click is
 * DogePresence.toggle(), and an incoming challenge still opens the big alert and makes the home
 * breathe gold. Flag off: it stays in the menu bar, byte-identical.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { bootDesk, DESK_URL } from './journeys/harness.js';

const REPO = resolve(__dirname, '..');
const DESK = readFileSync(resolve(REPO, 'ap_stats_roadmap_square_mode.html'), 'utf8');
const PICO = readFileSync(resolve(REPO, 'pico-home.js'), 'utf8');
const NOW = '2026-10-07T14:00:00.000Z';

async function boot(flagOn) {
  const harness = await bootDesk({ now: NOW, url: DESK_URL + (flagOn ? '?home=park' : '') });
  await harness.signIn('alpha_otter');
  await harness.waitFor(() => harness.document.getElementById('menu-identity').textContent.includes('Alpha Otter'));
  return harness;
}

describe('Pico PLAY button = the Desk Doge', { timeout: 120_000 }, () => {
  it('flag on: #doge-presence (with its badge, dropdown and challenge panel) is in the Pico nav, labelled PLAY', async () => {
    const harness = await boot(true);
    try {
      const { document: doc } = harness;
      const doge = doc.getElementById('doge-presence');
      expect(doc.querySelectorAll('#doge-presence')).toHaveLength(1);
      expect(doge.closest('#pico-home .topnav')).toBeTruthy();
      expect(doc.getElementById('menubar').contains(doge)).toBe(false);
      // Right of the nav, beside "name · Period".
      expect(doge.parentElement.id).toBe('pico-doge-slot');
      expect(doge.parentElement.previousElementSibling.id).toBe('pico-player');
      for (const id of ['doge-badge', 'doge-dropdown']) {
        expect(doge.contains(doc.getElementById(id)), id).toBe(true);
      }
      // The challenge alert lives in its own top layer on <body> (above every window).
      const layer = doc.getElementById('pico-doge-layer');
      expect(layer.parentElement).toBe(doc.body);
      expect(layer.contains(doc.getElementById('doge-challenge-panel'))).toBe(true);
      expect(doge.querySelector('img').getAttribute('src')).toBe('Doge-Asset.png');
      expect(doge.querySelector('.pico-doge-label').textContent).toBe('PLAY');
      expect(doge.getAttribute('onclick')).toBe('DogePresence.toggle()');
      expect([doge.getAttribute('role'), doge.getAttribute('tabindex')]).toEqual(['button', '0']);
      // Sprite at 2x (14 -> 28), a 44x44 target, positioned so the dropdown hangs from it.
      expect(PICO).toContain("'#pico-home #doge-presence img { width: 28px; height: 28px; }',");
      expect(PICO).toMatch(/#pico-home #doge-presence \{ position: relative; z-index: 6;[^']*',\n\s*'  align-items: center; justify-content: center; min-width: 44px; min-height: 44px;/);
      // Teacher 2026-10-08: the System 7 dropdown is never shown; PLAY opens the Pico window
      // (tests/pico-home-doge-menu.test.js).
      expect(PICO).toContain("'html.pico-home #doge-dropdown, html.pico-home #doge-dropdown.show { display: none !important; }',");
    } finally {
      harness.teardown();
    }
  });

  it('clicking it (or Enter on it) calls DogePresence.toggle', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      const toggle = vi.spyOn(win.DogePresence, 'toggle').mockImplementation(() => {});
      const doge = doc.getElementById('doge-presence');
      doge.click();
      expect(toggle).toHaveBeenCalledTimes(1);
      doge.focus();
      doge.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      expect(toggle).toHaveBeenCalledTimes(2);
    } finally {
      harness.teardown();
    }
  });

  it('the Desk dropdown state still drives it: DogePresence.openDropdown shows the Pico PLAY window', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      win.DogePresence.openDropdown();
      const dropdown = doc.getElementById('doge-dropdown');
      expect(dropdown.classList.contains('show')).toBe(true);
      expect(doc.getElementById('doge-presence').classList.contains('doge-active')).toBe(true);
      expect(dropdown.closest('#pico-home')).toBeTruthy();
      expect(doc.getElementById('pico-doge-backdrop').hidden).toBe(false);
      win.DogePresence.closeDropdown();
      expect(dropdown.classList.contains('show')).toBe(false);
      expect(doc.getElementById('pico-doge-backdrop').hidden).toBe(true);
    } finally {
      harness.teardown();
    }
  });

  it('an incoming challenge still opens the big YES/NO alert and makes the home breathe gold', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      win.DogePresence.onChallengeReceived('beta_fox');
      const panel = doc.getElementById('doge-challenge-panel');
      expect(panel.style.display).toBe('block');
      expect(panel.textContent).toContain('beta_fox wants to play');
      expect(panel.querySelector('.btn-accept').textContent).toMatch(/YES/);
      expect(panel.querySelector('.btn-decline').textContent).toBe('NO');
      expect(panel.getAttribute('role')).toBe('dialog');
      expect(doc.activeElement).toBe(panel.querySelector('.btn-accept'));
      expect(doc.body.classList.contains('challenge-waiting')).toBe(true);
      expect(doc.getElementById('doge-presence').classList.contains('doge-wiggle')).toBe(true);
      // Not inside any Pico frame, and nothing of the Pico home hides it.
      expect(panel.closest('.pico-win')).toBeNull();
      expect(panel.closest('#menubar')).toBeNull();
      // The breathing gold reaches the Pico home (which covers the Desk's body background).
      expect(PICO).toContain("'body.challenge-waiting #pico-home { animation: pico-challenge-breathe 1.4s ease-in-out infinite; }',");
      expect(PICO).toContain('@media (prefers-reduced-motion: reduce) { body.challenge-waiting #pico-home { animation: none;');
      win.DogePresence.clearIncomingChallenge();
      expect(panel.style.display).toBe('none');
      expect(doc.body.classList.contains('challenge-waiting')).toBe(false);
    } finally {
      harness.teardown();
    }
  });

  // Explicit stacking: the challenge layer is a <body> child whose z-index beats every other
  // <body>-level layer that can be open (jsdom has no hit testing; Chrome is checked separately).
  function zOf(win, node) { return Number(win.getComputedStyle(node).zIndex) || 0; }
  function assertChallengeOnTop(win, doc) {
    const layer = doc.getElementById('pico-doge-layer');
    const panel = doc.getElementById('doge-challenge-panel');
    expect(panel.style.display).toBe('block');
    expect(layer.parentElement).toBe(doc.body);
    const layerZ = zOf(win, layer);
    expect(layerZ).toBe(win.PicoHome.challengeLayerZ);
    // Every other open body-level layer: the Pico home (its menus live inside it), SCHEDULE, and
    // any Desk overlay that is showing.
    const others = [...doc.body.children].filter((n) => n !== layer && n.id !== 'pico-home-mount'
      && win.getComputedStyle(n).display !== 'none' && /fixed|absolute/.test(win.getComputedStyle(n).position));
    others.push(doc.getElementById('pico-home'));
    for (const n of others) expect(zOf(win, n), n.id || n.className).toBeLessThan(layerZ);
    // The page's other top layers by design (name finder 100001, QR viewers 100002) sit below too.
    expect(layerZ).toBeGreaterThan(100002);
    // YES has focus and works.
    const yes = panel.querySelector('.btn-accept');
    expect(doc.activeElement).toBe(yes);
    const accept = vi.spyOn(win.DogePresence, 'acceptChallenge').mockImplementation(() => {});
    yes.click();
    expect(accept).toHaveBeenCalledTimes(1);
    accept.mockRestore();
  }

  it('with SCHEDULE open, an incoming challenge is above it, focused and clickable; the backdrop breathes gold', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      doc.querySelector('#pico-home .navbtn[data-nav="LESSONS"]').click();
      [...doc.querySelectorAll('#pico-menu-list .action')].find((b) => b.textContent === 'SCHEDULE').click();
      expect(doc.documentElement.classList.contains('pico-lessons-open')).toBe(true);
      expect(zOf(win, doc.getElementById('window-wrap'))).toBe(6);
      win.DogePresence.onChallengeReceived('beta_fox');
      assertChallengeOnTop(win, doc);
      expect(doc.body.classList.contains('challenge-waiting')).toBe(true);
      expect(PICO).toContain("'html.pico-home.pico-lessons-open body.challenge-waiting #window-wrap { animation: pico-challenge-breathe-dim 1.4s ease-in-out infinite; }',");
      win.DogePresence.clearIncomingChallenge();
    } finally {
      harness.teardown();
    }
  });

  it('with OPTION open, an incoming challenge is above the Pico menu, focused and clickable', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      doc.querySelector('#pico-home .navbtn[data-nav="OPTION"]').click();
      expect(doc.getElementById('pico-menu-backdrop').hidden).toBe(false);
      win.DogePresence.onChallengeReceived('beta_fox');
      // The Pico menu lives inside #pico-home (z 4); the challenge layer is outside it.
      expect(doc.getElementById('pico-home').contains(doc.getElementById('doge-challenge-panel'))).toBe(false);
      assertChallengeOnTop(win, doc);
      // NO still declines through the Desk (its 25 s timer is the Desk's own).
      const decline = vi.spyOn(win.DogePresence, 'declineChallenge');
      doc.querySelector('#doge-challenge-panel .btn-decline').click();
      expect(decline).toHaveBeenCalledTimes(1);
      expect(doc.getElementById('doge-challenge-panel').style.display).toBe('none');
    } finally {
      harness.teardown();
    }
  });

  // Teacher 2026-10-07: "flash the background gold some times and bring a dialog box up", as in the
  // OS 7 skin. Chrome showed the Pico root breathing, but NOT the floor band, and the lesson panel's
  // white backdrop (the white-out state) hid the gold completely. Every full-page Pico surface now
  // breathes on the Desk's own rhythm, with a static gold for reduced motion.
  it('the gold reaches every full-page Pico surface, on the Desk rhythm, with a static reduced-motion gold', () => {
    const deskRhythm = DESK.match(/body\.challenge-waiting \{ animation: challenge-breathe ([\d.]+s) ease-in-out infinite; \}/);
    expect(deskRhythm).toBeTruthy();
    const rules = [
      'body.challenge-waiting #pico-home { animation: pico-challenge-breathe ',
      'body.challenge-waiting #pico-home .floor-band { animation: pico-challenge-breathe-band ',
      'html.pico-home body.challenge-waiting #resource-overlay.pico-lesson { animation: pico-challenge-breathe-veil ',
      'body.challenge-waiting #pico-home .backdrop, html.pico-home body.challenge-waiting #app-wallet-overlay.pico-mygrade { animation: pico-challenge-breathe-dim ',
      'html.pico-home.pico-lessons-open body.challenge-waiting #window-wrap { animation: pico-challenge-breathe-dim ',
    ];
    for (const rule of rules) expect(PICO, rule).toContain(rule + deskRhythm[1] + ' ease-in-out infinite; }');
    // Every keyframe peaks at the Desk's own gold, #C9A227 (201, 162, 39), at 50 %.
    for (const name of ['pico-challenge-breathe', 'pico-challenge-breathe-band', 'pico-challenge-breathe-veil', 'pico-challenge-breathe-dim']) {
      expect(PICO).toMatch(new RegExp('@keyframes ' + name + ' \\{[^\']*50% \\{ background-color: (#C9A227|rgba\\(201, 162, 39, [.\\d]+\\)); \\}'));
    }
    expect(DESK).toMatch(/@keyframes challenge-breathe \{[\s\S]*?50% \{ background-color: #C9A227; \}/);
    // Reduced motion: each surface holds a still gold instead of breathing.
    for (const selector of ['body.challenge-waiting #pico-home .floor-band', 'html.pico-home body.challenge-waiting #resource-overlay.pico-lesson',
      'body.challenge-waiting #pico-home .backdrop, html.pico-home body.challenge-waiting #app-wallet-overlay.pico-mygrade']) {
      expect(PICO).toMatch(new RegExp("'  " + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{ animation: none; background-color: '));
    }
  });

  it('with the lesson panel open (white-out), an incoming challenge is on top, YES focused, and the panel backdrop breathes gold', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      const tile = [...doc.querySelectorAll('#pico-tiles .tile')].find((t) => !t.hasAttribute('aria-disabled'));
      tile.click();
      await harness.waitFor(() => doc.getElementById('resource-overlay').style.display === 'block',
        { timeoutMs: 3000, message: 'the lesson panel did not open' });
      expect(doc.getElementById('pico-home').classList.contains('pico-whiteout')).toBe(true);
      win.DogePresence.onChallengeReceived('beta_fox');
      expect(doc.body.classList.contains('challenge-waiting')).toBe(true);
      // The rule that paints the white-out backdrop gold is in the page's own Pico stylesheet.
      const css = [...doc.querySelectorAll('style')].map((s) => s.textContent).join('\n');
      expect(css).toContain('html.pico-home body.challenge-waiting #resource-overlay.pico-lesson { animation: pico-challenge-breathe-veil 1.4s');
      expect(doc.getElementById('resource-overlay').classList.contains('pico-lesson')).toBe(true);
      assertChallengeOnTop(win, doc);   // above the panel, YES focused and working
      win.DogePresence.clearIncomingChallenge();
    } finally {
      harness.teardown();
    }
  });

  it('the gold clears after YES, after NO and after the 25 s timeout', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      const panel = doc.getElementById('doge-challenge-panel');
      const sent = [];
      win.DogePresence.ws = { readyState: 1, send: (m) => sent.push(JSON.parse(m)) };
      win.DogePresence.onChallengeReceived('beta_fox');
      panel.querySelector('.btn-accept').click();
      expect(doc.body.classList.contains('challenge-waiting')).toBe(false);
      expect(sent.at(-1)).toEqual({ type: 'challenge_accept', from: 'beta_fox' });
      win.DogePresence.onChallengeReceived('beta_fox');
      panel.querySelector('.btn-decline').click();
      expect(doc.body.classList.contains('challenge-waiting')).toBe(false);
      expect(sent.at(-1)).toEqual({ type: 'challenge_decline', from: 'beta_fox' });
      // Timeout: the Desk's own countdown (25 s) declines out loud; run its last second.
      win.DogePresence.onChallengeReceived('beta_fox');
      expect(win.DogePresence.incomingChallenge.countdown).toBe(25);
      win.DogePresence.incomingChallenge.countdown = 1;
      await harness.waitFor(() => !doc.body.classList.contains('challenge-waiting'),
        { timeoutMs: 3000, message: 'the timeout did not clear the gold' });
      expect(panel.style.display).toBe('none');
      expect(sent.at(-1)).toEqual({ type: 'challenge_decline', from: 'beta_fox' });
    } finally {
      harness.teardown();
    }
  });

  it('a window closing under an open challenge never takes focus away from YES', async () => {
    const harness = await boot(true);
    try {
      const { document: doc, window: win } = harness;
      doc.querySelector('#pico-home .navbtn[data-nav="LESSONS"]').click();
      [...doc.querySelectorAll('#pico-menu-list .action')].find((b) => b.textContent === 'SCHEDULE').click();
      win.closeCalendar();                         // closes in the same tick …
      win.DogePresence.onChallengeReceived('beta_fox');   // … as the challenge arrives
      await new Promise((r) => setTimeout(r, 50));
      expect(doc.activeElement).toBe(doc.querySelector('#doge-challenge-panel .btn-accept'));
      win.DogePresence.clearIncomingChallenge();
    } finally {
      harness.teardown();
    }
  });

  it('flag off: #doge-presence stays in the menu bar, byte-identical to before pico-home.js runs', async () => {
    const dom = new JSDOM(DESK.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''), {
      url: 'https://desk.test/ap_stats_roadmap_square_mode.html', runScripts: 'outside-only',
    });
    const doc = dom.window.document;
    const before = doc.getElementById('menubar').outerHTML;
    dom.window.eval(PICO);
    doc.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    expect(doc.getElementById('menubar').outerHTML).toBe(before);
    expect(doc.getElementById('menubar').contains(doc.getElementById('doge-presence'))).toBe(true);

    const harness = await boot(false);
    try {
      const real = harness.document.getElementById('doge-presence');
      expect(harness.document.getElementById('menubar').contains(real)).toBe(true);
      expect(real.querySelector('.pico-doge-label')).toBeNull();
      expect(real.hasAttribute('role')).toBe(false);
    } finally {
      harness.teardown();
    }
  });
});
