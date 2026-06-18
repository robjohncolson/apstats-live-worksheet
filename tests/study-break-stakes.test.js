// @vitest-environment jsdom
/**
 * tests/study-break-stakes.test.js — STUDY_BREAK_STAKES_SPEC Phase 2 (client match-wiring).
 *
 * Runs the REAL studyBreak stakes methods extracted from the Desk: the best-of-3 series
 * counting (_studyBreakScoreGameOnce), the winner→resolve call (_studyBreakResolveStakes),
 * and the escrow-on-start (_studyBreakArmStakes). Plus source-pins for the hooks that wire
 * them into the match lifecycle.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const html = readFileSync(resolve(__dirname, '..', 'ap_stats_roadmap_square_mode.html'), 'utf-8');

// Extract an object method `name(args) { ... }` into a standalone callable (this-bound at call).
function methodFn(src, name) {
  const re = new RegExp('\\b' + name + '\\s*\\(([^)]*)\\)\\s*\\{');
  const m = re.exec(src);
  if (!m) throw new Error('method not found: ' + name);
  const args = m[1].split(',').map((s) => s.trim()).filter(Boolean);
  let i = src.indexOf('{', m.index), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { return new Function(...args, src.slice(src.indexOf('{', m.index) + 1, i)); } }
  }
  throw new Error('unbalanced: ' + name);
}

const scoreGame = methodFn(html, '_studyBreakScoreGameOnce');
const resolveStakes = methodFn(html, '_studyBreakResolveStakes');
const armStakes = methodFn(html, '_studyBreakArmStakes');

// A mock studyBreak `this` for the best-of-3 counter.
function mkThis(ms, over = []) {
  return {
    mode: '1v1', state: 'gameover', mpState: ms,
    mpUsername: 'Me_Self',
    isOpen: () => true,
    startNewGame: () => {},
    draw: () => {},
    _studyBreakResolveStakes() { over.push('resolved'); },
  };
}
const freshMs = (p = {}) => ({ myWins: 0, oppWins: 0, gameNumber: 1, gameScored: false, _wonThisGame: false, _forfeit: false, seriesOver: false, _resolved: false, staked: false, candyOutcome: null, opponent: 'Ana_Fox', roomId: 'R1', ...p });

beforeEach(() => { vi.useFakeTimers(); });

describe('best-of-3 counting (_studyBreakScoreGameOnce)', () => {
  it('a won game increments myWins; a lost game increments oppWins', () => {
    const won = freshMs({ _wonThisGame: true }); scoreGame.call(mkThis(won));
    expect(won.myWins).toBe(1); expect(won.seriesOver).toBe(false); expect(won.gameScored).toBe(true);
    const lost = freshMs({ _wonThisGame: false }); scoreGame.call(mkThis(lost));
    expect(lost.oppWins).toBe(1); expect(lost.seriesOver).toBe(false);
  });
  it('counts a game only ONCE (gameScored guard) even if drawn repeatedly', () => {
    const ms = freshMs({ _wonThisGame: true }); const t = mkThis(ms);
    scoreGame.call(t); scoreGame.call(t); scoreGame.call(t);
    expect(ms.myWins).toBe(1);
  });
  it('the series ENDS + resolves at 2 wins', () => {
    const log = [];
    const ms = freshMs({ myWins: 1, _wonThisGame: true });
    scoreGame.call(mkThis(ms, log));
    expect(ms.myWins).toBe(2); expect(ms.seriesOver).toBe(true);
    expect(log).toContain('resolved');
  });
  it('a forfeit ends the series immediately (even at 0-0)', () => {
    const log = [];
    const ms = freshMs({ _wonThisGame: true, _forfeit: true });
    scoreGame.call(mkThis(ms, log));
    expect(ms.seriesOver).toBe(true); expect(log).toContain('resolved');
  });
  it('does nothing for solo (mode !== 1v1) or with no mpState', () => {
    const ms = freshMs({ _wonThisGame: true });
    const t = mkThis(ms); t.mode = 'solo';
    scoreGame.call(t);
    expect(ms.myWins).toBe(0); expect(ms.gameScored).toBe(false);
  });
  it('an unfinished series schedules an auto-advance to the next game', () => {
    const ms = freshMs({ _wonThisGame: true });
    const t = mkThis(ms); const spy = vi.fn(); t.startNewGame = spy;
    scoreGame.call(t);
    expect(ms.seriesOver).toBe(false);
    vi.advanceTimersByTime(3001);
    expect(spy).toHaveBeenCalled();   // auto-advanced
  });
});

describe('resolve (_studyBreakResolveStakes) — reports the series winner', () => {
  it('reports MYSELF as winner when I won more games, and posts bet/resolve', async () => {
    const posts = [];
    globalThis._dogeWalletAction = (path, body) => { posts.push({ path, body }); return Promise.resolve({ ok: true, status: 'settled' }); };
    const ms = freshMs({ myWins: 2, oppWins: 1, staked: true });
    const t = { mpState: ms, mpUsername: 'Me_Self', draw: () => {} };
    resolveStakes.call(t);
    expect(ms._resolved).toBe(true);
    expect(posts[0].path).toBe('/wallet/bet/resolve');
    expect(posts[0].body).toEqual({ matchId: 'R1', winnerUsername: 'Me_Self' });
    delete globalThis._dogeWalletAction;
  });
  it('reports the OPPONENT as winner when they won more', () => {
    const posts = [];
    globalThis._dogeWalletAction = (path, body) => { posts.push(body); return Promise.resolve({ ok: true, status: 'settled' }); };
    const ms = freshMs({ myWins: 0, oppWins: 2 });
    resolveStakes.call({ mpState: ms, mpUsername: 'Me_Self', draw: () => {} });
    expect(posts[0].winnerUsername).toBe('Ana_Fox');
    delete globalThis._dogeWalletAction;
  });
  it('is idempotent — a second call does not re-post', () => {
    let n = 0;
    globalThis._dogeWalletAction = () => { n++; return Promise.resolve({ ok: true, status: 'settled' }); };
    const ms = freshMs({ myWins: 2, _resolved: false });
    const t = { mpState: ms, mpUsername: 'Me_Self', draw: () => {} };
    resolveStakes.call(t); resolveStakes.call(t);
    expect(n).toBe(1);
    delete globalThis._dogeWalletAction;
  });
});

describe('forfeit (opponentLeft) ends the series immediately (review fix)', () => {
  const opponentLeft = methodFn(html, 'opponentLeft');
  function mkForfeitThis(ms, log) {
    return {
      mpState: ms, score: 0, flash: () => {}, submitLeaderboardScore: () => {}, updateHud: () => {}, draw: () => {},
      _studyBreakResolveStakes() { log.push('resolved'); ms._resolved = true; },
    };
  }
  beforeEach(() => { globalThis.SFX = { play: () => {} }; });
  it('a forfeit ends the series NOW + resolves with ME as winner (no ghost game)', () => {
    const log = [];
    const ms = freshMs({ myWins: 0, oppWins: 1, gameScored: true, _advanceTimer: 0 });   // mid auto-advance window
    opponentLeft.call(mkForfeitThis(ms, log), 'quit');
    expect(ms.seriesOver).toBe(true);
    expect(ms.myWins).toBeGreaterThan(ms.oppWins);   // I'm the reported winner, not the fled opponent
    expect(log).toContain('resolved');
  });
  it('is a no-op without mpState', () => {
    expect(() => opponentLeft.call({ mpState: null }, 'quit')).not.toThrow();
  });
});

describe('escrow on match start (_studyBreakArmStakes)', () => {
  it('posts bet/open with the shared roomId + opponent', () => {
    const posts = [];
    globalThis._dogeWalletAction = (path, body) => { posts.push({ path, body }); return Promise.resolve({ ok: true, status: 'opened' }); };
    const ms = freshMs();
    armStakes.call({ mpState: ms, draw: () => {} });
    expect(posts[0].path).toBe('/wallet/bet/open');
    expect(posts[0].body).toEqual({ matchId: 'R1', opponentUsername: 'Ana_Fox' });
    delete globalThis._dogeWalletAction;
  });
});

describe('source pins — the hooks are wired into the match lifecycle', () => {
  it('startMatch arms the escrow + inits the series', () => {
    expect(html).toMatch(/this\.mpState = \{[\s\S]*?myWins: 0, oppWins: 0[\s\S]*?\};\s*\n\s*\/\/[\s\S]*?this\._studyBreakArmStakes\(\);/);
  });
  it('opponentKO marks the game won; opponentLeft marks a forfeit', () => {
    expect(html).toMatch(/opponentKO\(finalScore\) \{[\s\S]*?_wonThisGame = true/);
    expect(html).toMatch(/opponentLeft\(reason\) \{[\s\S]*?_wonThisGame = true[\s\S]*?_forfeit = true/);
  });
  it('drawGameOverCard counts the series (the single choke point)', () => {
    expect(html).toMatch(/drawGameOverCard\(flashText\) \{\s*\n\s*[^\n]*\n\s*this\._studyBreakScoreGameOnce\(\);/);
  });
  it('startNewGame advances the series game counter', () => {
    expect(html).toMatch(/startNewGame\(\) \{[\s\S]*?if \(this\.mode === '1v1' && ms && !ms\.seriesOver\)[\s\S]*?gameNumber = \(ms\.gameNumber \|\| 1\) \+ 1/);
  });
  it('startNewGame blocks a phantom restart after the series is over (review fix)', () => {
    expect(html).toMatch(/startNewGame\(\) \{[\s\S]*?if \(this\.mode === '1v1' && ms && ms\.seriesOver\) return;/);
  });
  it('close() clears the auto-advance timer before nulling mpState (review fix)', () => {
    expect(html).toMatch(/close\(\) \{[\s\S]*?if \(this\.mpState\) \{[\s\S]*?clearTimeout\(this\.mpState\._advanceTimer\)/);
  });
});
