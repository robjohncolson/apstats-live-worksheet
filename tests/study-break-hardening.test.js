// @vitest-environment jsdom
/**
 * tests/study-break-hardening.test.js — TETRIS_HARDENING_SPEC.md
 *
 * Robustness fixes from the s24 5-lens audit. Mixes behavioral checks of the real
 * extracted helpers (_liveWs, _resetLockTimer) with source pins for the wiring fixes
 * (choke-point routing, match-in-progress guard, roomId stamping, ICE buffering).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '..');
const html = readFileSync(resolve(REPO_ROOT, 'ap_stats_roadmap_square_mode.html'), 'utf-8');

// Extract a method body `name(args) { ... }` from inside the studyBreak object literal.
function methodBody(src, name) {
  const re = new RegExp('\\n    ' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = re.exec(src);
  if (!m) throw new Error('method not found: ' + name);
  const open = src.indexOf('{', m.index);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(m.index + 1, i + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

describe('MP-1 — _liveWs prefers the live presence socket', () => {
  function makeLiveWs() {
    const body = methodBody(html, '_liveWs'); // "_liveWs() { ... }"
    // eslint-disable-next-line no-eval
    return eval('(function(){ ' + body.slice(body.indexOf('{') + 1, body.lastIndexOf('}')) + ' })');
  }
  const OPEN = 1, CLOSED = 3;
  it('returns the live DogePresence socket and ignores a stale cached mpWs', () => {
    const fn = makeLiveWs();
    globalThis.DogePresence = { ws: { readyState: OPEN, _id: 'live' } };
    const ctx = { mpWs: { readyState: CLOSED, _id: 'stale' } };
    expect(fn.call(ctx)._id).toBe('live');
    delete globalThis.DogePresence;
  });
  it('falls back to its own open socket when presence is down', () => {
    const fn = makeLiveWs();
    globalThis.DogePresence = { ws: { readyState: CLOSED } };
    const ctx = { mpWs: { readyState: OPEN, _id: 'own' } };
    expect(fn.call(ctx)._id).toBe('own');
    delete globalThis.DogePresence;
  });
  it('returns null when nothing is open (so callers no-op instead of throwing)', () => {
    const fn = makeLiveWs();
    globalThis.DogePresence = { ws: { readyState: CLOSED } };
    expect(fn.call({ mpWs: null })).toBe(null);
    delete globalThis.DogePresence;
  });
});

describe('SB-1(core) — lock-reset cap kills the infinite spin stall', () => {
  function makeReset() {
    const body = methodBody(html, '_resetLockTimer');
    // eslint-disable-next-line no-eval
    return eval('(function(){ ' + body.slice(body.indexOf('{') + 1, body.lastIndexOf('}')) + ' })');
  }
  it('stops resetting lockTimer once the cap is hit while grounded', () => {
    const fn = makeReset();
    const ctx = { active: {}, isGrounded: () => true, LOCK_RESET_CAP: 15, lockResets: 0, lockTimer: 999 };
    for (let i = 0; i < 20; i++) { ctx.lockTimer = 999; fn.call(ctx); }
    expect(ctx.lockResets).toBe(15);     // capped
    expect(ctx.lockTimer).toBe(999);     // last call did NOT reset (cap reached)
  });
  it('an airborne move refreshes the budget', () => {
    const fn = makeReset();
    const ctx = { active: {}, isGrounded: () => false, LOCK_RESET_CAP: 15, lockResets: 9, lockTimer: 999 };
    fn.call(ctx);
    expect(ctx.lockResets).toBe(0);
    expect(ctx.lockTimer).toBe(0);
  });
});

describe('hardening — source pins for the wiring fixes', () => {
  it('SB-1: the garbage topout sets a flash so it routes through the choke point', () => {
    expect(html).toMatch(/state = 'gameover';[\s\S]*?this\.flash\('Buried!'\);[\s\S]*?type: 'game_over'/);
  });
  it('SB-1: the 1v1 game-over draw branch keys on mpState, not flashText', () => {
    expect(html).toMatch(/state === 'gameover'\)\s*\{[\s\S]*?this\.mode === '1v1' && this\.mpState\)\s*\{[\s\S]*?drawGameOverCard/);
  });
  it('SB-3/F3: startMatch ignores a new match while one is live', () => {
    expect(html).toMatch(/startMatch\(data\)\s*\{[\s\S]*?this\.mode === '1v1' && this\.mpState && !this\.mpState\.seriesOver\) return/);
  });
  it('SB-2: showChallengeDialog auto-declines over a live match + uses _liveWs (no null mpWs throw)', () => {
    const b = methodBody(html, 'showChallengeDialog');
    expect(b).toMatch(/_liveWs\(\)/);
    expect(b).toMatch(/this\.mpState && !this\.mpState\.seriesOver\)\s*\{[\s\S]*?reply\('challenge_decline'\);[\s\S]*?return/);
    expect(b).not.toMatch(/this\.mpWs\.send/);  // the old throwing path is gone
  });
  it('SB-4: outbound messages stamp roomId; inbound handlers reject a mismatch', () => {
    expect(methodBody(html, 'sendGameMessage')).toMatch(/msg\.roomId = this\.mpState\.roomId/);
    expect(methodBody(html, 'receiveGarbage')).toMatch(/roomId !== this\.mpState\.roomId\) return/);
    expect(methodBody(html, 'opponentKO')).toMatch(/roomId !== this\.mpState\.roomId\) return/);
    expect(methodBody(html, 'updateOpponentState')).toMatch(/data\.roomId !== this\.mpState\.roomId\) return/);
  });
  it('MP-3: rtc_ice buffers via _addIce; remote-desc handlers flush; addIceCandidate has .catch', () => {
    expect(html).toMatch(/case 'rtc_ice':\s*\n\s*if \(data\.candidate\) this\._addIce/);
    expect(methodBody(html, '_addIce')).toMatch(/pc\.remoteDescription && pc\.remoteDescription\.type/);
    expect(html).toMatch(/this\._flushIce\(\);\s*\/\/ MP-3/);
    expect(methodBody(html, '_addIce')).toMatch(/addIceCandidate\([\s\S]*?\)\.catch/);
  });
  it('MP-4/SB-5: close() sends game_leave via the live socket and ALWAYS nulls mpState', () => {
    const b = methodBody(html, 'close');
    expect(b).toMatch(/this\._liveWs\(\)[\s\S]*?type: 'game_leave'/);
    expect(b).toMatch(/this\.mpState = null;/);
    expect(b).toMatch(/clearInterval\(this\.countdownTimer\)/);
  });
  it('SB-3(integration): launchMatch closes the avatar popover so it cannot cover the game', () => {
    expect(html).toMatch(/launchMatch\(data\)\s*\{[\s\S]*?_avatarMenu\.close\(\)/);
  });
});
