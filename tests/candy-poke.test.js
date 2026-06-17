// @vitest-environment jsdom
/**
 * tests/candy-poke.test.js — CANDY_POKE_SPEC.md
 *
 * Tap a peer's avatar in the Live Classroom -> send 1 candy (Facebook-poke style).
 * Optimistic 3s "Undo" then a real POST /wallet/gift commit; on success a COSMETIC
 * candy_gift_received is relayed over the board WS so the recipient sees a toast.
 *
 * Coverage: (1) structural pins of the wiring (mount opts + module + cr-server relay),
 * (2) behavioral guard matrix (guest / self / cooldown never POST), (3) the 3s Undo
 * cancels the POST, (4) commit POSTs once + sets cooldown + relays, (5) inbound
 * _onCandyGiftReceived filters by toUsername and dedupes by giftId.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { runInContext, createContext } from 'vm';

const REPO_ROOT = resolve(__dirname, '..');
const html = readFileSync(resolve(REPO_ROOT, 'ap_stats_roadmap_square_mode.html'), 'utf-8');
const serverJs = readFileSync(
  resolve(REPO_ROOT, '..', 'curriculum_render', 'railway-server', 'server.js'), 'utf-8'
);

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

const CANDY_FNS = [
  '_candyPokeMe', '_candyFirstName', '_candyToastHost', '_candyToast', '_candyMiniToast',
  '_candyChime', '_candyRefreshWalletUI', '_candyRelay', '_candyArmPoke', '_candyPoke',
  '_onCandyGiftReceived',
];

// Build a fresh sandbox with the REAL candy module fns + stubbed globals. Returns the
// sandbox plus call trackers. Timers come from globalThis so vi.useFakeTimers() controls them.
function loadCandy(opts = {}) {
  const calls = { gift: [], relay: [], fetch: 0, render: 0 };
  const me = ('me' in opts) ? opts.me : { username: 'Apple_Fox', realName: 'Ana Fox' };
  const sandbox = {
    document, // jsdom
    setTimeout: (...a) => globalThis.setTimeout(...a),
    clearTimeout: (...a) => globalThis.clearTimeout(...a),
    Date,
    console,
    rosterClient: { current: () => me },
    _dogeWalletFetch: () => { calls.fetch++; return Promise.resolve(opts.wallet || { ok: true, candyBalance: 5 }); },
    _dogeWalletGiftSend: (to, n) => { calls.gift.push([to, n]); return Promise.resolve(opts.giftResult || { ok: true }); },
    _classroomBoardHandle: { sendMessage: (m) => { calls.relay.push(m); return true; } },
    renderWallet: () => { calls.render++; },
  };
  sandbox.window = sandbox;
  createContext(sandbox);
  const decls = 'var _candyPokeCooldown={},_candyPokePending={},_candySeenGiftIds={};var CANDY_POKE_COOLDOWN_MS=600000;';
  const body = CANDY_FNS.map((n) => fnBody(html, n)).join('\n');
  runInContext(decls + '\n' + body + '\nthis.__poke=_candyPoke;this.__recv=_onCandyGiftReceived;', sandbox);
  return { sandbox, calls };
}

// ── 1. Structural pins ──────────────────────────────────────────────────────
describe('candy poke — wiring (structural)', () => {
  it('the student board mount passes onAvatarClick -> _candyPoke', () => {
    expect(html).toMatch(/onAvatarClick:\s*function\(hit\)\s*\{[\s\S]*?_candyPoke\(hit\.username\)/);
  });
  it('onClassroomMessage routes candy_gift_received -> _onCandyGiftReceived', () => {
    const b = fnBody(html, '_mountClassroomBoard');
    expect(b).toMatch(/msg\.type === 'candy_gift_received'[\s\S]*?_onCandyGiftReceived\(msg\)/);
  });
  it('the poke is fixed at 1 candy (the poke unit)', () => {
    expect(fnBody(html, '_candyArmPoke')).toMatch(/_dogeWalletGiftSend\(to,\s*1\)/);
    expect(fnBody(html, '_candyRelay')).toMatch(/candy:\s*1/);
  });
  it('optimistic: a 3000ms timer commits and an Undo cancels the pending send', () => {
    const b = fnBody(html, '_candyArmPoke');
    expect(b).toMatch(/setTimeout\(/);
    expect(b).toMatch(/3000/);
    expect(b).toMatch(/actionLabel:\s*'Undo'/);
    expect(b).toMatch(/clearTimeout\(p\.timer\)/);
  });
  it('cr railway-server relays candy_gift_received via broadcastToClients', () => {
    expect(serverJs).toMatch(/case 'candy_gift_received':/);
    const seg = serverJs.slice(serverJs.indexOf("case 'candy_gift_received':"));
    expect(seg).toMatch(/broadcastToClients\(\{[\s\S]*?type:\s*'candy_gift_received'/);
    expect(seg.slice(0, 1200)).toMatch(/toUsername:/);
  });
});

// ── 2. Behavioral ───────────────────────────────────────────────────────────
describe('candy poke — behavior', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('a guest sender never POSTs (no wallet)', () => {
    const { sandbox, calls } = loadCandy({ me: { username: 'Guest_Apple_Fox' } });
    sandbox.__poke('Papaya_Fox');
    expect(calls.fetch).toBe(0);
    expect(calls.gift.length).toBe(0);
  });

  it('poking yourself is a no-op', () => {
    const { sandbox, calls } = loadCandy({ me: { username: 'Apple_Fox', realName: 'Ana' } });
    sandbox.__poke('apple_fox'); // case-insensitive self
    expect(calls.fetch).toBe(0);
    expect(calls.gift.length).toBe(0);
  });

  it('commit after 3s POSTs exactly once with (recipient, 1), then relays', async () => {
    const { sandbox, calls } = loadCandy();
    sandbox.__poke('Papaya_Fox');
    await vi.advanceTimersByTimeAsync(0); // resolve the balance-gate promise
    expect(calls.fetch).toBe(1);
    await vi.advanceTimersByTimeAsync(3000); // fire the commit timer
    await vi.advanceTimersByTimeAsync(0); // resolve the gift promise
    expect(calls.gift).toEqual([['Papaya_Fox', 1]]);
    expect(calls.relay.length).toBe(1);
    expect(calls.relay[0]).toMatchObject({ type: 'candy_gift_received', toUsername: 'Papaya_Fox', fromUsername: 'Apple_Fox', candy: 1 });
  });

  it('Undo within the 3s window cancels the POST entirely', async () => {
    const { sandbox, calls } = loadCandy();
    sandbox.__poke('Papaya_Fox');
    await vi.advanceTimersByTimeAsync(0); // balance gate -> arms the toast + Undo button
    const btn = document.querySelector('#candy-toast-host button');
    expect(btn).toBeTruthy();
    btn.click(); // Undo
    await vi.advanceTimersByTimeAsync(5000); // well past the commit window
    expect(calls.gift.length).toBe(0);
  });

  it('a second poke to the same person within cooldown is blocked (no 2nd POST)', async () => {
    const { sandbox, calls } = loadCandy();
    sandbox.__poke('Papaya_Fox');
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.gift.length).toBe(1);
    sandbox.__poke('Papaya_Fox'); // immediately again -> cooldown
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.fetch).toBe(1); // never even re-checked the wallet
    expect(calls.gift.length).toBe(1); // still just one
  });
});

describe('candy poke — inbound notification', () => {
  it('only toasts when toUsername === me, and dedupes by giftId', () => {
    const { sandbox } = loadCandy({ me: { username: 'Papaya_Fox' } });
    const host = () => document.getElementById('candy-toast-host');
    document.body.innerHTML = '';
    sandbox.__recv({ type: 'candy_gift_received', toUsername: 'Someone_Else', fromUsername: 'Apple_Fox', candy: 1, giftId: 'g1' });
    expect(host()).toBeFalsy(); // not for me -> nothing rendered
    sandbox.__recv({ type: 'candy_gift_received', toUsername: 'papaya_fox', fromUsername: 'Apple_Fox', candy: 1, giftId: 'g2' });
    expect(host().textContent).toMatch(/Apple Fox sent you 1 candy/); // username-derived, no real name
    const n1 = host().children.length;
    sandbox.__recv({ type: 'candy_gift_received', toUsername: 'papaya_fox', fromUsername: 'Apple_Fox', candy: 1, giftId: 'g2' }); // dup
    expect(host().children.length).toBe(n1); // deduped, no second toast
  });
});
