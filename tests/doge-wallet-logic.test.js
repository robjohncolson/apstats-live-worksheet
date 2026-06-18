// doge-wallet-logic.test.js — the candy/DOGE conversion math (DOGE_WALLET_SPEC).
// Effort → candy is FIXED; candy → DOGE FLOATS with the live price (buy early =
// cheaper). Candy is the stable ≈-dollar reserve.

import { describe, it, expect, beforeAll } from 'vitest';

let W;
beforeAll(async () => {
  await import('../js/wallet_logic.js');
  W = globalThis.WalletLogic;
});

describe('DOGE wallet — frozen constants', () => {
  it('exposes the outset peg (36 pts/candy, $0.036/candy, 5-candy floor)', () => {
    expect(W.DOGE_WALLET.POINTS_PER_CANDY).toBe(36);
    expect(W.DOGE_WALLET.CANDY_USD).toBeCloseTo(0.036, 6);
    expect(W.DOGE_WALLET.MIN_CONVERSION_CANDY).toBe(5);
  });
});

describe('DOGE wallet — effort → candy (FIXED leg)', () => {
  it('36 effort points = 1 candy', () => {
    expect(W.candyFromPoints(36)).toBeCloseTo(1, 9);
    expect(W.candyFromPoints(360)).toBeCloseTo(10, 9);
  });
  it('a maxed-out kid (~10,000 pts) ≈ 278 candy ≈ $10', () => {
    const candy = W.candyFromPoints(10000);
    expect(candy).toBeCloseTo(277.78, 1);
    expect(W.usdFromCandy(candy)).toBeCloseTo(10, 1);   // ≈ 1/30 of the $300 pool
  });
  it('non-positive / junk points → 0 candy', () => {
    expect(W.candyFromPoints(0)).toBe(0);
    expect(W.candyFromPoints(-5)).toBe(0);
    expect(W.candyFromPoints('x')).toBe(0);
  });
});

describe('DOGE wallet — candy → DOGE (FLOATING leg)', () => {
  it('today (DOGE $0.088): 1 DOGE ≈ 2.44 candy', () => {
    expect(W.candyPerDoge(0.088)).toBeCloseTo(2.444, 2);
  });
  it('rises as DOGE appreciates — the "33 candy per DOGE" future', () => {
    expect(W.candyPerDoge(1.22)).toBeCloseTo(33.9, 1);   // DOGE ~ $1.22
    expect(W.candyPerDoge(1.0)).toBeCloseTo(27.8, 1);
  });
  it('buying EARLY (cheap) yields more coins than buying LATE for the same candy', () => {
    const candy = 24.4;
    const early = W.dogeFromCandy(candy, 0.088);   // DOGE cheap
    const late = W.dogeFromCandy(candy, 0.88);     // DOGE 10x
    expect(early).toBeCloseTo(10, 1);
    expect(late).toBeCloseTo(1, 1);
    expect(early).toBeGreaterThan(late * 9);
  });
  it('a crash makes coins cheap — but the dollar cost is unchanged (broker model)', () => {
    // spend $0.88 of candy (~24.4 candy); coins differ, but candy spent (cost) is fixed.
    const candy = 24.4;
    const coinsCrash = W.dogeFromCandy(candy, 0.0001);
    expect(coinsCrash).toBeGreaterThan(8000);                 // tons of cheap coins
    expect(W.usdFromCandy(candy)).toBeCloseTo(0.878, 2);      // teacher's cost: same $0.88
  });
  it('zero / bad price → 0 DOGE (no divide-by-zero)', () => {
    expect(W.dogeFromCandy(100, 0)).toBe(0);
    expect(W.candyPerDoge(0)).toBe(0);
    expect(W.dogeFromCandy(0, 0.088)).toBe(0);
  });
});

describe('DOGE wallet — DOGE → candy cash-out (REVERSE leg, SELL_DOGE_SPEC)', () => {
  it('candyFromDoge is the inverse of dogeFromCandy at the same price', () => {
    expect(W.candyFromDoge(1, 0.088)).toBeCloseTo(2.444, 2);        // 1 DOGE = 2.444 candy today
    const back = W.candyFromDoge(W.dogeFromCandy(10, 0.088), 0.088);
    expect(back).toBeCloseTo(10, 6);                                 // round-trip at one price = identity
  });
  it('appreciation pays MORE candy than was put in (the lesson)', () => {
    const coins = W.dogeFromCandy(10, 0.088);   // buy 10 candy of DOGE while cheap
    const cashed = W.candyFromDoge(coins, 0.132); // DOGE up 50% → cash back
    expect(cashed).toBeCloseTo(15, 1);                              // 10 candy → ~15 candy
    expect(cashed).toBeGreaterThan(10);
  });
  it('depreciation pays LESS (honest downside)', () => {
    const coins = W.dogeFromCandy(10, 0.088);
    const cashed = W.candyFromDoge(coins, 0.044);  // DOGE down 50%
    expect(cashed).toBeCloseTo(5, 1);
    expect(cashed).toBeLessThan(10);
  });
  it('zero / bad price → 0 candy (no divide-by-zero)', () => {
    expect(W.candyFromDoge(10, 0)).toBe(0);
    expect(W.candyFromDoge(0, 0.088)).toBe(0);
    expect(W.candyFromDoge(-5, 0.088)).toBe(0);
  });
});

describe('DOGE wallet — candy is the stable dollar reserve', () => {
  it('usdFromCandy is price-independent (candy ≈ dollars)', () => {
    expect(W.usdFromCandy(100)).toBeCloseTo(3.6, 6);
    expect(W.usdFromCandy(8300)).toBeCloseTo(298.8, 1);   // ~$300 pool ≈ 8,300 candy
  });
});
