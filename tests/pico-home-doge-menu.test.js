// @vitest-environment node
/**
 * tests/pico-home-doge-menu.test.js
 *
 * Teacher 2026-10-08: "the menu system for the dogecoin icon should be in the pico park style —
 * it's still OS7 drop-down looking!!" With the flag on, PLAY opens a Pico window (the recovered
 * orange frame, plain text) that presents the Desk's own DogePresence state: the Online Now list
 * (you + every peer, with location chips), the per-player actions, and the footer. Every button
 * calls the same DogePresence / Desk function the System 7 menu item calls. The System 7 dropdown
 * is hidden but still driven by the Desk. The incoming-challenge alert is drawn in the Pico frame.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bootDesk, DESK_URL } from './journeys/harness.js';

const REPO = resolve(__dirname, '..');
const PICO = readFileSync(resolve(REPO, 'pico-home.js'), 'utf8');
const NOW = '2026-10-07T14:00:00.000Z';

const LOCATIONS = {
  beta_fox: { surface: 'desk', lesson: null, onDesk: true },
  gamma_owl: { surface: 'quiz', lesson: 'u2 l4', onDesk: false },
};

async function boot() {
  const harness = await bootDesk({ now: NOW, url: DESK_URL + '?home=park' });
  await harness.signIn('alpha_otter');
  await harness.waitFor(() => harness.document.getElementById('menu-identity').textContent.includes('Alpha Otter'));
  return harness;
}

// Presence as the Desk would hold it after a presence_snapshot (no socket needed).
function seedPresence(win, players = ['beta_fox', 'gamma_owl']) {
  const dp = win.DogePresence;
  dp.connected = true;
  dp.players = players.slice();
  dp.locations = { ...LOCATIONS };
  dp.expandedRow = null;
  return dp;
}

// The Desk re-renders an open dropdown when its roster load resolves; close it first so that
// late render never runs against a torn-down document.
function closeAndTeardown(harness) {
  try { harness.window.DogePresence.dropdownOpen = false; } catch (_) {}
  harness.teardown();
}

function openFromPlay(doc) {
  doc.getElementById('doge-presence').click();
}

function peerRows(doc) {
  return [...doc.querySelectorAll('#pico-doge-list .pico-doge-peer')];
}

function rowFor(doc, user) {
  return peerRows(doc).find((row) => row.getAttribute('data-pico-doge-key') === 'peer:' + user);
}

function actionNamed(doc, text) {
  return [...doc.querySelectorAll('#pico-doge-list .action')].find((b) => b.textContent.trim() === text);
}

describe('Pico PLAY window (the Doge menu in the Pico style)', { timeout: 120_000 }, () => {
  it('PLAY opens a Pico window, not the System 7 dropdown', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const dp = seedPresence(win);
      openFromPlay(doc);
      expect(dp.dropdownOpen).toBe(true);
      const backdrop = doc.getElementById('pico-doge-backdrop');
      expect(backdrop.hidden).toBe(false);
      expect(backdrop.closest('#pico-home')).toBeTruthy();
      // The recovered window: .win frame, orange top bar with the Desk's header words, a ✕.
      const menu = doc.getElementById('pico-doge-menu');
      expect(menu.classList.contains('win')).toBe(true);
      expect(menu.getAttribute('role')).toBe('dialog');
      expect(doc.getElementById('pico-doge-title').textContent).toBe('ONLINE NOW (3)');
      expect(doc.getElementById('pico-doge-close').querySelector('.sp-close')).toBeTruthy();
      // The Desk's own dropdown is still driven by the Desk (class "show") but never displayed.
      const dropdown = doc.getElementById('doge-dropdown');
      expect(dropdown.classList.contains('show')).toBe(true);
      expect(win.getComputedStyle(dropdown).display).toBe('none');
      // Focus moves into the window (first item selected).
      expect(menu.contains(doc.activeElement)).toBe(true);
      expect(doc.activeElement.classList.contains('is-selected')).toBe(true);
    } finally {
      closeAndTeardown(harness);
    }
  });

  it('lists the same players the Desk presence state has, with you first and the location chips', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const dp = seedPresence(win);
      openFromPlay(doc);
      const listed = peerRows(doc).map((row) => row.getAttribute('data-pico-doge-key').slice('peer:'.length));
      expect(listed).toEqual(dp._peers());
      const self = doc.querySelector('#pico-doge-list .pico-doge-self');
      expect(self.textContent).toContain(dp.getUsername());
      expect(self.textContent).toContain('(you)');
      // Students see the Desk's coarse labels (Desk / Quiz), not the lesson.
      expect(rowFor(doc, 'beta_fox').querySelector('.pico-doge-chip').textContent).toBe('Desk');
      expect(rowFor(doc, 'beta_fox').querySelector('.pico-doge-chip').classList.contains('is-desk')).toBe(true);
      expect(rowFor(doc, 'gamma_owl').querySelector('.pico-doge-chip').textContent).toBe('Quiz');
      // A presence change re-renders through the Desk's own handler.
      dp.handleMessage({ type: 'user_online', username: 'delta_elk', location: { surface: 'worksheet', lesson: null, onDesk: false } });
      expect(peerRows(doc).map((r) => r.getAttribute('data-pico-doge-key'))).toContain('peer:delta_elk');
      expect(doc.getElementById('pico-doge-title').textContent).toBe('ONLINE NOW (4)');
      dp.handleMessage({ type: 'user_offline', username: 'gamma_owl' });
      expect(rowFor(doc, 'gamma_owl')).toBeUndefined();
    } finally {
      closeAndTeardown(harness);
    }
  });

  it('not connected yet: says Connecting...; nobody online: says so', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const dp = seedPresence(win, []);
      dp.connected = false;
      vi.spyOn(dp, 'connect').mockImplementation(() => {});
      dp.openDropdown();
      expect(doc.getElementById('pico-doge-list').textContent).toContain('Connecting...');
      dp.connected = true;
      dp.renderDropdown();
      expect(doc.getElementById('pico-doge-list').textContent).toContain('No classmates online yet');
      expect(doc.getElementById('pico-doge-title').textContent).toBe('ONLINE NOW (1)');
    } finally {
      closeAndTeardown(harness);
    }
  });

  it('a player row opens their actions through DogePresence.toggleRow', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const dp = seedPresence(win);
      openFromPlay(doc);
      const toggleRow = vi.spyOn(dp, 'toggleRow');
      rowFor(doc, 'beta_fox').click();
      expect(toggleRow).toHaveBeenCalledWith('beta_fox');
      expect(dp.expandedRow).toBe('beta_fox');
      // The menu stays open (the click never reaches #doge-presence's toggle()).
      expect(dp.dropdownOpen).toBe(true);
      const row = rowFor(doc, 'beta_fox');
      expect(row.getAttribute('aria-expanded')).toBe('true');
      const acts = row.parentElement.querySelector('.pico-doge-acts');
      expect(acts.querySelector('.pico-doge-where').textContent).toBe('On the Desk');
      expect([...acts.querySelectorAll('.action')].map((b) => b.textContent)).toEqual(['CHALLENGE TO STUDY BREAK', 'SEND CANDY']);
      rowFor(doc, 'beta_fox').click();
      expect(dp.expandedRow).toBe(null);
      expect(rowFor(doc, 'beta_fox').parentElement.querySelector('.pico-doge-acts')).toBeNull();
    } finally {
      closeAndTeardown(harness);
    }
  });

  it('CHALLENGE calls DogePresence.challengeFromMenu; it is disabled for a player off the Desk', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const dp = seedPresence(win);
      openFromPlay(doc);
      const challenge = vi.spyOn(dp, 'challengeFromMenu').mockImplementation(() => {});
      rowFor(doc, 'beta_fox').click();
      actionNamed(doc, 'CHALLENGE TO STUDY BREAK').click();
      expect(challenge).toHaveBeenCalledWith('beta_fox');

      rowFor(doc, 'gamma_owl').click();
      const off = actionNamed(doc, 'CHALLENGE (DESK ONLY)');
      expect(off.disabled).toBe(true);
      off.click();
      expect(challenge).toHaveBeenCalledTimes(1);
    } finally {
      closeAndTeardown(harness);
    }
  });

  it('the real challenge flow: sendChallenge closes the window and sends game_challenge', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const dp = seedPresence(win);
      const sent = [];
      dp.ws = { readyState: 1, send: (m) => sent.push(JSON.parse(m)) };
      openFromPlay(doc);
      rowFor(doc, 'beta_fox').click();
      actionNamed(doc, 'CHALLENGE TO STUDY BREAK').click();
      expect(sent.at(-1)).toEqual({ type: 'game_challenge', target: 'beta_fox' });
      expect(dp.challengePending).toBe('beta_fox');
      expect(doc.getElementById('pico-doge-backdrop').hidden).toBe(true);
      // The Desk's status flash, restyled (plain text on a Pico board).
      expect(doc.querySelector('#doge-presence .doge-flash').textContent).toBe('Challenging beta_fox...');
      expect(PICO).toContain("'#pico-home #doge-presence .doge-flash { top: 100%;");
      dp.challengePending = null;
    } finally {
      closeAndTeardown(harness);
    }
  });

  it('SEND CANDY calls DogePresence.candyFromMenu (the _candyPoke pipeline)', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const dp = seedPresence(win);
      openFromPlay(doc);
      const candy = vi.spyOn(dp, 'candyFromMenu');
      const poke = vi.fn();
      win._candyPoke = poke;
      rowFor(doc, 'gamma_owl').click();
      actionNamed(doc, 'SEND CANDY').click();
      expect(candy).toHaveBeenCalledWith('gamma_owl');
      expect(dp.dropdownOpen).toBe(false);
      expect(doc.getElementById('pico-doge-backdrop').hidden).toBe(true);
    } finally {
      closeAndTeardown(harness);
    }
  });

  it('teacher: the lesson chip and MESSAGE (DogePresence.messageFromMenu)', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      win._deskIsTeacher = () => true;
      const dp = seedPresence(win);
      openFromPlay(doc);
      expect(rowFor(doc, 'gamma_owl').querySelector('.pico-doge-chip').textContent).toBe('u2 l4');
      const message = vi.spyOn(dp, 'messageFromMenu').mockImplementation(() => {});
      rowFor(doc, 'gamma_owl').click();
      expect(doc.querySelector('.pico-doge-where').textContent).toBe('In the quiz — u2 l4');
      actionNamed(doc, 'MESSAGE').click();
      expect(message).toHaveBeenCalledWith('gamma_owl');
    } finally {
      closeAndTeardown(harness);
    }
  });

  it('STUDY BREAK closes the menu and calls the Desk openGame', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const dp = seedPresence(win);
      openFromPlay(doc);
      const close = vi.spyOn(dp, 'closeDropdown');
      const openGame = vi.fn();
      win.openGame = openGame;
      actionNamed(doc, 'STUDY BREAK').click();
      expect(close).toHaveBeenCalled();
      expect(openGame).toHaveBeenCalledTimes(1);
      expect(doc.getElementById('pico-doge-backdrop').hidden).toBe(true);
    } finally {
      closeAndTeardown(harness);
    }
  });

  it('Esc closes it (DogePresence.closeDropdown), and so do the ✕ and the backdrop', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const dp = seedPresence(win);
      const backdrop = doc.getElementById('pico-doge-backdrop');

      openFromPlay(doc);
      doc.activeElement.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      expect(backdrop.hidden).toBe(true);
      expect(dp.dropdownOpen).toBe(false);
      expect(doc.getElementById('doge-dropdown').classList.contains('show')).toBe(false);

      openFromPlay(doc);
      doc.getElementById('pico-doge-close').click();
      expect(backdrop.hidden).toBe(true);
      expect(dp.dropdownOpen).toBe(false);

      openFromPlay(doc);
      backdrop.click();
      expect(backdrop.hidden).toBe(true);
      expect(dp.dropdownOpen).toBe(false);
    } finally {
      closeAndTeardown(harness);
    }
  });

  it('a press inside the window does not trip the Desk outside-click close; Up / Down move the selection', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const dp = seedPresence(win);
      openFromPlay(doc);
      rowFor(doc, 'beta_fox').dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true }));
      expect(dp.dropdownOpen).toBe(true);
      const first = doc.activeElement;
      first.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      expect(doc.activeElement).not.toBe(first);
      expect(doc.activeElement.classList.contains('is-selected')).toBe(true);
      doc.activeElement.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
      expect(doc.activeElement).toBe(first);
    } finally {
      closeAndTeardown(harness);
    }
  });

  it('no System 7 class names, fonts or bevels inside the Pico menu DOM; names are text, never HTML', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const dp = seedPresence(win, ['beta_fox', '<img src=x onerror="window.__pwned=1">']);
      dp.locations['<img src=x onerror="window.__pwned=1">'] = { surface: 'desk', lesson: null, onDesk: true };
      openFromPlay(doc);
      rowFor(doc, 'beta_fox').click();
      const root = doc.getElementById('pico-doge-backdrop');
      const SYSTEM7 = /^(s7|doge-dd|doge-sub|doge-dropdown|doge-loc|doge-submenu|chicago|geneva|dialog-|title-bar|game-title-bar|close-box)/;
      for (const node of [root, ...root.querySelectorAll('*')]) {
        for (const cls of node.classList) expect(cls, cls).not.toMatch(SYSTEM7);
        expect(node.getAttribute('style') || '').not.toMatch(/chicago|geneva/i);
        expect(node.hasAttribute('onclick'), 'inline onclick').toBe(false);
      }
      expect(root.querySelector('img')).toBeNull();
      expect(win.__pwned).toBeUndefined();
      expect(peerRows(doc).some((r) => r.textContent.includes('<img src=x'))).toBe(true);
      // The PLAY window's CSS never names a System 7 font.
      const pico = PICO.split('\n').filter((line) => /pico-doge|doge-win|#doge-challenge-panel|doge-flash/.test(line)).join('\n');
      expect(pico).not.toMatch(/Chicago|Geneva/);
    } finally {
      closeAndTeardown(harness);
    }
  });

  it('the incoming challenge alert is drawn in the Pico frame (orange bar, plain text, orange YES)', async () => {
    const harness = await boot();
    try {
      const { document: doc, window: win } = harness;
      const dp = seedPresence(win);
      openFromPlay(doc);
      dp.onChallengeReceived('beta_fox');
      // The challenge closes the PLAY window and takes focus (YES).
      expect(doc.getElementById('pico-doge-backdrop').hidden).toBe(true);
      const panel = doc.getElementById('doge-challenge-panel');
      expect(panel.closest('#pico-doge-layer')).toBeTruthy();
      expect(doc.activeElement).toBe(panel.querySelector('.btn-accept'));
      const cs = (node) => win.getComputedStyle(node);
      expect(cs(panel).boxShadow).toBe('none');
      expect(cs(panel).fontFamily).not.toMatch(/Geneva/);
      expect(cs(panel.querySelector('.challenge-who')).fontFamily).not.toMatch(/Chicago/);
      expect(cs(panel.querySelector('.challenge-timer')).fontFamily).not.toMatch(/Chicago/);
      expect(cs(panel.querySelector('.challenge-title')).position).toBe('absolute');
      expect(cs(panel.querySelector('.challenge-title')).fontFamily).not.toMatch(/Chicago/);
      expect(cs(panel.querySelector('.btn-decline')).fontFamily).not.toMatch(/Chicago/);
      expect(PICO).toContain("'#pico-doge-layer > #doge-challenge-panel .challenge-btns .btn-accept { background: var(--orange); color: #fff; }',");
      // The frame is the recovered window's stepped orange polygon.
      expect(PICO).toContain("'#pico-doge-layer > #doge-challenge-panel::before { content: \"\"; position: absolute; inset: 0; z-index: -2; background: var(--orange);',");
      // Behaviour is the Desk's: YES accepts.
      const accept = vi.spyOn(dp, 'acceptChallenge').mockImplementation(() => {});
      panel.querySelector('.btn-accept').click();
      expect(accept).toHaveBeenCalledTimes(1);
      accept.mockRestore();
      dp.clearIncomingChallenge();
    } finally {
      closeAndTeardown(harness);
    }
  });
});
