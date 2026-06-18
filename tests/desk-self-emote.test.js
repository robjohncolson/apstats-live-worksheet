// @vitest-environment jsdom
/**
 * tests/desk-self-emote.test.js — AVATAR_MENU_SPEC.md (self-click emote)
 *
 * Clicking your OWN avatar plays a light "happy bounce" instead of opening the
 * heavy My Ledger window: the canvas sprite hops (via the board handle) and a
 * 🍬✨ puff floats up from the tap. Runs the REAL extracted `_avatarSelfEmote`
 * (+ `_spawnEmoteParticle`) in jsdom with stubbed board handle / SFX / wallet.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '..');
const html = readFileSync(resolve(REPO_ROOT, 'ap_stats_roadmap_square_mode.html'), 'utf-8');

function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('not found: ' + name);
  let i = src.indexOf('(', m.index), paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let depth = 0;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

const SRC = 'var _selfEmoteUntil = 0;\n' + fnBody(html, '_spawnEmoteParticle') + '\n' + fnBody(html, '_avatarSelfEmote');
function makeEmote() {
  // eslint-disable-next-line no-eval
  return eval(SRC + '\n;_avatarSelfEmote'); // fresh _selfEmoteUntil per eval
}
const particles = () => [...document.querySelectorAll('.avatar-emote-particle')];

let handleCalls, sfxCalls;
beforeEach(() => {
  document.body.innerHTML = '';
  handleCalls = 0; sfxCalls = [];
  globalThis._classroomBoardHandle = { selfEmote: () => { handleCalls++; return true; } };
  globalThis.MacSFX = { play: (n) => sfxCalls.push(n) };
  globalThis._dogeWalletFetch = () => Promise.resolve({ ok: true, candyBalance: 7 });
  window.matchMedia = () => ({ matches: false }); // motion allowed by default
});
afterEach(() => {
  delete globalThis._classroomBoardHandle;
  delete globalThis.MacSFX;
  delete globalThis._dogeWalletFetch;
});

describe('avatar self-emote', () => {
  it('puffs a 🍬 + two ✨ at the tapped position', () => {
    makeEmote()({ clientX: 100, clientY: 120, isSelf: true });
    const texts = particles().map((p) => p.textContent);
    expect(particles().length).toBe(3);
    expect(texts.filter((t) => t.indexOf('🍬') === 0).length).toBe(1);
    expect(texts.filter((t) => t === '✨').length).toBe(2);
    const candy = particles().find((p) => p.textContent.indexOf('🍬') === 0);
    expect(candy.style.left).toBe('100px');
    expect(candy.style.top).toBe('120px');
  });

  it('bounces the local sprite (board handle) and plays a sound', () => {
    makeEmote()({ clientX: 50, clientY: 50 });
    expect(handleCalls).toBe(1);
    expect(sfxCalls).toContain('wildEep');
  });

  it('enriches the candy puff with the live balance', async () => {
    makeEmote()({ clientX: 10, clientY: 10 });
    await Promise.resolve(); await Promise.resolve(); // flush the wallet promise
    const candy = particles().find((p) => p.textContent.indexOf('🍬') === 0);
    expect(candy.textContent).toBe('🍬 7');
  });

  it('skips the sprite hop for reduced-motion but still puffs', () => {
    window.matchMedia = () => ({ matches: true });
    makeEmote()({ clientX: 10, clientY: 10 });
    expect(handleCalls).toBe(0);          // hop skipped
    expect(particles().length).toBe(3);   // puff still shows
  });

  it('debounces rapid self-clicks into one puff burst', () => {
    const fn = makeEmote();
    fn({ clientX: 10, clientY: 10 });
    fn({ clientX: 10, clientY: 10 });     // immediately again
    expect(particles().length).toBe(3);   // not 6
    expect(handleCalls).toBe(1);
  });

  it('falls back to the viewport center when the click carries no coords', () => {
    makeEmote()({ isSelf: true });
    expect(particles().length).toBe(3);
    expect(handleCalls).toBe(1);
  });
});
