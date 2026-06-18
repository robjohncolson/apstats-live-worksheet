// @vitest-environment jsdom
/**
 * tests/desk-avatar-menu.test.js — AVATAR_MENU_SPEC.md
 *
 * The Live Classroom (student Desk) no longer floats avatar names. A tap reveals
 * the classmate's name (stage 'name'); a second tap (or tapping the name chip)
 * opens a popover with 🍬 Send candy + ⚔️ Start a game (stage 'menu').
 *
 * Runs the REAL `_avatarMenu` object literal extracted from the Desk, in jsdom,
 * with stubbed social primitives (_candyPoke / DogePresence.sendChallenge) and
 * roster lookup (DeskRoster.realName) injected as globals.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '..');
const html = readFileSync(resolve(REPO_ROOT, 'ap_stats_roadmap_square_mode.html'), 'utf-8');

// Extract the object literal following `<decl> {` (balanced braces).
function objLiteral(src, decl) {
  const start = src.indexOf(decl);
  if (start < 0) throw new Error('not found: ' + decl);
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(open, i + 1); }
  }
  throw new Error('unbalanced: ' + decl);
}

const AVATAR_MENU_SRC = objLiteral(html, '_avatarMenu = {');

// Fresh controller per test (it holds el/username/stage). Free identifiers
// (_candyPoke, DogePresence, DeskRoster, document, window) resolve to globals.
function makeMenu() {
  // eslint-disable-next-line no-eval
  return eval('(' + AVATAR_MENU_SRC + ')');
}

const pop = () => document.querySelector('.avatar-pop');
const nextTick = () => new Promise((r) => setTimeout(r, 0));

let menu, calls;
beforeEach(() => {
  document.body.innerHTML = '';
  calls = { poke: [], challenge: [] };
  globalThis._candyPoke = (u) => calls.poke.push(u);
  globalThis.DogePresence = { locations: {}, sendChallenge: (u) => calls.challenge.push(u) };
  globalThis.DeskRoster = { realName: () => null };
  menu = makeMenu();
});
afterEach(() => {
  if (menu) menu.close();
  delete globalThis._candyPoke;
  delete globalThis.DogePresence;
  delete globalThis.DeskRoster;
});

describe('avatar menu — two-stage reveal', () => {
  it('first tap shows only the name chip (no actions)', () => {
    menu.onAvatarClick({ username: 'Papaya_Fox', clientX: 100, clientY: 100 });
    const p = pop();
    expect(p).toBeTruthy();
    expect(p.getAttribute('data-stage')).toBe('name');
    expect(p.querySelector('.avatar-pop-name').textContent).toBe('Papaya_Fox');
    expect(p.querySelector('.avatar-pop-hint')).toBeTruthy();
    expect(p.querySelector('.avatar-pop-acts')).toBeFalsy();
  });

  it('a second tap on the same avatar advances to the action menu', () => {
    menu.onAvatarClick({ username: 'Papaya_Fox', clientX: 100, clientY: 100 });
    menu.onAvatarClick({ username: 'Papaya_Fox', clientX: 100, clientY: 100 });
    const p = pop();
    expect(p.getAttribute('data-stage')).toBe('menu');
    expect(p.querySelectorAll('.avatar-pop-acts .doge-sub-act').length).toBe(2);
  });

  it('tapping the name chip also advances to the action menu', () => {
    menu.onAvatarClick({ username: 'Papaya_Fox', clientX: 100, clientY: 100 });
    pop().querySelector('.avatar-pop-name').click();
    expect(pop().getAttribute('data-stage')).toBe('menu');
  });

  it('switching to a different avatar resets to the name stage', () => {
    menu.onAvatarClick({ username: 'Apple_Fox', clientX: 100, clientY: 100 });
    menu.onAvatarClick({ username: 'Apple_Fox', clientX: 100, clientY: 100 }); // -> menu
    menu.onAvatarClick({ username: 'Papaya_Fox', clientX: 130, clientY: 90 }); // new avatar
    const p = pop();
    expect(p.getAttribute('data-stage')).toBe('name');
    expect(p.querySelector('.avatar-pop-name').textContent).toBe('Papaya_Fox');
    expect(menu.username).toBe('Papaya_Fox');
  });
});

describe('avatar menu — actions', () => {
  function advanceToMenu(u = 'Papaya_Fox') {
    menu.onAvatarClick({ username: u, clientX: 100, clientY: 100 });
    menu.onAvatarClick({ username: u, clientX: 100, clientY: 100 });
  }

  it('Send candy reaches _candyPoke(username) and closes the popover', () => {
    advanceToMenu();
    pop().querySelectorAll('.doge-sub-act')[0].click();
    expect(calls.poke).toEqual(['Papaya_Fox']);
    expect(pop()).toBeFalsy();
  });

  it('Start a game reaches DogePresence.sendChallenge(username) and closes', () => {
    advanceToMenu();
    pop().querySelectorAll('.doge-sub-act')[1].click();
    expect(calls.challenge).toEqual(['Papaya_Fox']);
    expect(pop()).toBeFalsy();
  });

  it('Start a game is enabled when presence is unknown (an avatar implies they are on the Desk)', () => {
    advanceToMenu();
    const gameBtn = pop().querySelectorAll('.doge-sub-act')[1];
    expect(gameBtn.disabled).toBeFalsy();
  });

  it('Start a game is disabled when presence positively reports the peer off-Desk', () => {
    globalThis.DogePresence.locations = { Papaya_Fox: { onDesk: false } };
    advanceToMenu();
    const gameBtn = pop().querySelectorAll('.doge-sub-act')[1];
    expect(gameBtn.disabled).toBe(true);
    gameBtn.click();
    expect(calls.challenge).toEqual([]);
  });

  it('prefers a known real name in the header, falling back to the username', () => {
    globalThis.DeskRoster.realName = () => 'Ana Fox';
    menu.onAvatarClick({ username: 'Papaya_Fox', clientX: 100, clientY: 100 });
    expect(pop().querySelector('.avatar-pop-name').textContent).toBe('Ana Fox · Papaya_Fox');
  });
});

describe('avatar menu — dismissal', () => {
  it('Escape closes the popover', () => {
    menu.onAvatarClick({ username: 'Papaya_Fox', clientX: 100, clientY: 100 });
    expect(pop()).toBeTruthy();
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(pop()).toBeFalsy();
  });

  it('an outside click closes the popover (once the avatar-hit dispatch has cleared)', async () => {
    menu.onAvatarClick({ username: 'Papaya_Fox', clientX: 100, clientY: 100 });
    await nextTick(); // let _handlingClick reset (set during onAvatarClick)
    const other = document.createElement('div');
    document.body.appendChild(other);
    other.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(pop()).toBeFalsy();
  });

  it('a click INSIDE the popover does not close it (name chip at the menu stage)', () => {
    menu.onAvatarClick({ username: 'Papaya_Fox', clientX: 100, clientY: 100 });
    menu.onAvatarClick({ username: 'Papaya_Fox', clientX: 100, clientY: 100 }); // -> menu
    pop().querySelector('.avatar-pop-name').click(); // no-op at the menu stage
    expect(pop()).toBeTruthy();
    expect(pop().getAttribute('data-stage')).toBe('menu');
  });
});

describe('avatar menu — viewport fit (review fold)', () => {
  // jsdom has no layout, so stub getBoundingClientRect to simulate a rendered box.
  function withRect(rect, fn) {
    const orig = window.Element.prototype.getBoundingClientRect;
    window.Element.prototype.getBoundingClientRect = function () { return rect; };
    try { fn(); } finally { window.Element.prototype.getBoundingClientRect = orig; }
  }

  it('flips the popover BELOW the head when there is no room above', () => {
    withRect({ width: 160, height: 80, top: -30, bottom: 50, left: 40, right: 200 }, () => {
      menu.onAvatarClick({ username: 'Papaya_Fox', clientX: 100, clientY: 20 });
      expect(pop().style.transform).toBe('translate(-50%, 10px)');
    });
  });

  it('nudges a popover that overflows the right edge back on-screen', () => {
    // vw=1024 (jsdom default); right=1100 overflows by (1100 - (1024-6)) = 82.
    withRect({ width: 160, height: 80, top: 200, bottom: 280, left: 940, right: 1100 }, () => {
      menu.onAvatarClick({ username: 'Papaya_Fox', clientX: 1000, clientY: 300 });
      // anchor _ax = min(vw-20, 1000) = 1000; nudged left by 82 -> 918.
      expect(pop().style.left).toBe('918px');
      expect(pop().style.transform).toBe('translate(-50%, calc(-100% - 10px))'); // stayed above
    });
  });
});

describe('avatar menu — XSS safety (untrusted classroom-WS usernames)', () => {
  it('renders a hostile username as text, never as parsed HTML', () => {
    const evil = '<img src=x onerror="window.__x=1">';
    menu.onAvatarClick({ username: evil, clientX: 100, clientY: 100 });
    const nameEl = pop().querySelector('.avatar-pop-name');
    expect(nameEl.querySelector('img')).toBeFalsy(); // not parsed into the DOM
    expect(nameEl.textContent).toBe(evil);           // shown literally
    expect(window.__x).toBeUndefined();
  });
});
