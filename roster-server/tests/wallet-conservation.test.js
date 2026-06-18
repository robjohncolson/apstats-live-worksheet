// wallet-conservation.test.js — Layer A of the candy↔DOGE conservation audit
// (WALLET_CONSERVATION_AUDIT_SPEC.md §2 Layer A). Property-fuzz the 7-number
// conservation invariants I1–I8 (spec §1) through the canonical reducer in
// tests/fixtures/wallet-world.js, then deterministically pin the guard branches
// (I4) and the round-trip honesty (I6/I8). A separate section replays trajectories
// through the REAL mounted routes (doge-wallet.js) so the live guard ordering /
// error paths are exercised, not just the reducer. Mirrors the s13 grade-sim
// invariants test. fast-check is already a roster-server devDep.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import express from 'express';
import http from 'http';
import { mountDogeWallet } from '../doge-wallet.js';
import {
  initState, applyOp, studentIds, deriveNumbers, resolveOp, trajectoryArbitrary,
  checkStateInvariants, checkDeltaInvariants,
  candyPerDoge, dogeFromCandy, SELL_HOLD_HOURS, DAILY_GIFT_CAP,
} from './fixtures/wallet-world.js';

const K = 3;                                   // students per world (gift couples two)
const NUM_RUNS = 600;
const SIDS = studentIds(K);

// The fuzz source Layer A and Layer B share (defined once in the fixture).
const trajArb = trajectoryArbitrary(fc, K);

describe('Layer A — conservation invariants I1–I8 hold over every fuzzed trajectory', () => {
  it('every op preserves the 7-number identity, the Owed floor, monotonicity, sell P&L, and gift zero-sum', () => {
    fc.assert(
      fc.property(trajArb, ({ initEarned, ops }) => {
        let state = initState(initEarned);
        expect(checkStateInvariants(state)).toEqual([]);   // I1/I3/I7 at the start
        for (const raw of ops) {
          const op = resolveOp(SIDS, raw);
          if (op.op === 'noop') continue;
          const prev = state;
          const res = applyOp(prev, op);
          state = res.state;
          // a rejected op must leave the world byte-identical (no partial writes).
          if (res.rejected) expect(res.state).toBe(prev);
          const violations = [
            ...checkStateInvariants(state),
            ...checkDeltaInvariants(prev, state, op, res.accepted),
          ];
          if (violations.length) {
            throw new Error(`op ${JSON.stringify(op)} broke: ${violations.join(' | ')}`);
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('Layer A — I4 spend/sell guards reject over-spend (deterministic)', () => {
  it('cannot buy more candy than spendable', () => {
    let s = initState([5]);                              // 5 candy earned
    const r = applyOp(s, { op: 'buy', sid: SIDS[0], candy: 6, price: 0.1, ageHours: 0 });
    expect(r.rejected).toBe(true);
    expect(r.reason).toBe('insufficient');
  });
  it('cannot gift more candy than spendable, and honors the daily cap', () => {
    const cap = applyOp(initState([100]), { op: 'gift', from: SIDS[0], to: SIDS[1], candy: DAILY_GIFT_CAP + 1 });
    expect(cap.rejected).toBe(true);
    expect(cap.reason).toBe('cap');
    const broke = applyOp(initState([2]), { op: 'gift', from: SIDS[0], to: SIDS[1], candy: 5 });
    expect(broke.reason).toBe('insufficient');
  });
  it('cannot sell DOGE that is not yet matured, nor coins already sent on-chain', () => {
    // buy 4 coins one hour ago (not matured), then try to sell.
    let s = initState([50]);
    s = applyOp(s, { op: 'buy', sid: SIDS[0], candy: 8, price: 0.088, ageHours: 1 }).state;
    const young = applyOp(s, { op: 'sell', sid: SIDS[0], doge: 1, price: 0.088, holdHours: SELL_HOLD_HOURS });
    expect(young.reason).toBe('not-matured');
    // age it past the hold window → now sellable.
    let s2 = initState([50]);
    s2 = applyOp(s2, { op: 'buy', sid: SIDS[0], candy: 8, price: 0.088, ageHours: 48 }).state;
    const sent = applyOp(s2, { op: 'markSent', sid: SIDS[0], amount: 999 }).state;   // deposit all on-chain
    const reclaim = applyOp(sent, { op: 'sell', sid: SIDS[0], doge: 1, price: 0.088, holdHours: SELL_HOLD_HOURS });
    expect(reclaim.reason).toBe('not-in-app');                                       // sent coins can't return
  });
});

describe('Layer A — I6/I8 round-trip honesty (deterministic)', () => {
  const PRICE = 0.088;
  it('buy then sell ALL at the same price ≈ identity (no fee): realized ≈ 0, Owed restored', () => {
    let s = initState([50]);
    const before = deriveNumbers(s, SIDS[0]).raw;
    const candy = 12;
    s = applyOp(s, { op: 'buy', sid: SIDS[0], candy, price: PRICE, ageHours: 48 }).state;
    const coins = dogeFromCandy(candy, PRICE);
    s = applyOp(s, { op: 'sell', sid: SIDS[0], doge: coins, price: PRICE, holdHours: SELL_HOLD_HOURS }).state;
    const n = deriveNumbers(s, SIDS[0]);
    expect(n.Z).toBeCloseTo(0, 6);                  // realized P&L ≈ 0 at the same price
    expect(n.C).toBeCloseTo(0, 6);                  // cost basis fully unwound
    expect(n.raw).toBeCloseTo(before, 6);           // Owed back to the start
    expect(n.dogeBalance).toBeCloseTo(0, 6);
  });
  it('a HIGHER sell price nets a realized GAIN; ΔOwed equals the full payout', () => {
    let s = initState([50]);
    const candy = 8;
    s = applyOp(s, { op: 'buy', sid: SIDS[0], candy, price: 0.044, ageHours: 48 }).state;   // bought cheap
    const coins = dogeFromCandy(candy, 0.044);
    const before = deriveNumbers(s, SIDS[0]).raw;
    s = applyOp(s, { op: 'sell', sid: SIDS[0], doge: coins, price: 0.088, holdHours: SELL_HOLD_HOURS }).state;   // price doubled
    const n = deriveNumbers(s, SIDS[0]);
    const payout = coins * candyPerDoge(0.088);
    expect(n.Z).toBeGreaterThan(0);                 // a real gain
    expect(n.Z).toBeCloseTo(payout - candy, 6);     // gain = payout − cost basis
    expect(n.raw - before).toBeCloseTo(payout, 6);  // I6: Owed rose by exactly the payout
  });
  it('a LOWER sell price nets a realized LOSS (honest P&L — gets back less than put in)', () => {
    let s = initState([50]);
    const candy = 12;
    s = applyOp(s, { op: 'buy', sid: SIDS[0], candy, price: 0.132, ageHours: 48 }).state;   // bought dear
    const coins = dogeFromCandy(candy, 0.132);
    s = applyOp(s, { op: 'sell', sid: SIDS[0], doge: coins, price: 0.088, holdHours: SELL_HOLD_HOURS }).state;   // price fell
    expect(deriveNumbers(s, SIDS[0]).Z).toBeLessThan(0);   // realized LOSS
  });
});

describe('Layer A — the s16 review objections, now pinned as EMPIRICAL disproofs', () => {
  const sid = SIDS[0];
  it('(a) materialize-then-sell-at-a-loss does NOT leak candy: a sell raises the materialize cap by EXACTLY the payout', () => {
    let s = initState([50]);
    s = applyOp(s, { op: 'buy', sid, candy: 20, price: 0.2, ageHours: 48 }).state;     // bought dear
    s = applyOp(s, { op: 'markGiven', sid, amount: 10 }).state;                          // materialize some
    const capOf = () => { const n = deriveNumbers(s, sid); return n.E + n.R + n.Z - n.G - n.C; };  // Owed-eligible cap
    const before = capOf();
    const doge = deriveNumbers(s, sid).dogeBalance;
    s = applyOp(s, { op: 'sell', sid, doge, price: 0.088, holdHours: SELL_HOLD_HOURS }).state;     // sell at a LOSS
    const payout = doge * candyPerDoge(0.088);
    expect(capOf() - before).toBeCloseTo(payout, 6);      // Δcap = +payout ≥ 0 — Converted & Realized move from the SAME leg
    expect(deriveNumbers(s, sid).O).toBeGreaterThanOrEqual(-1e-9);
  });
  it('(b) FIFO maturity subtracts doge_sent ONCE (not twice): sent-on-chain coins clamp sellable to the in-app pool, no more', () => {
    let s = initState([100]);
    s = applyOp(s, { op: 'buy', sid, candy: 6, price: 0.036, ageHours: 48 }).state;     // cpd=1 → 6 coins, matured
    s = applyOp(s, { op: 'markSent', sid, amount: 4 }).state;                            // 4 pushed on-chain
    // inApp = 6−4 = 2; matured = 6 − sold(0) − sent(4) = 2 → exactly 2 sellable.
    expect(applyOp(s, { op: 'sell', sid, doge: 2, price: 0.088, holdHours: SELL_HOLD_HOURS }).accepted).toBe(true);
    // the proposed "double-subtract fix" (6−4−4) would wrongly reject this legitimate 2-coin cash-out.
    expect(applyOp(s, { op: 'sell', sid, doge: 2.5, price: 0.088, holdHours: SELL_HOLD_HOURS }).reason).toBe('not-in-app');
  });
  it('(c) average-cost over multiple buys does NOT mint candy: selling everything unwinds the basis to 0 and realizes exactly payout−spent', () => {
    let s = initState([100]);
    s = applyOp(s, { op: 'buy', sid, candy: 10, price: 0.05, ageHours: 48 }).state;
    s = applyOp(s, { op: 'buy', sid, candy: 14, price: 0.10, ageHours: 48 }).state;
    const spent = 24, coins = deriveNumbers(s, sid).dogeBalance, sellPrice = 0.08;
    s = applyOp(s, { op: 'sell', sid, doge: coins / 3, price: sellPrice, holdHours: SELL_HOLD_HOURS }).state;
    s = applyOp(s, { op: 'sell', sid, doge: deriveNumbers(s, sid).dogeBalance, price: sellPrice, holdHours: SELL_HOLD_HOURS }).state;
    const n = deriveNumbers(s, sid);
    expect(n.C).toBeCloseTo(0, 6);                                  // basis fully unwound — no residue
    expect(n.Z).toBeCloseTo(coins * candyPerDoge(sellPrice) - spent, 6);  // realized = payout − spent (no mint)
    expect(n.E + n.R + n.Z).toBeCloseTo(n.G + n.C + n.M + n.O, 6);  // identity closes
  });
});

// ── Layer A — replay trajectories through the REAL mounted routes ─────────────
// Exercises the live guard ordering + error paths (not just the reducer). The
// in-memory db mirrors the atomic RPCs (the same fakes doge-wallet.test.js uses);
// we assert the route's reported wallet matches the reducer's derived numbers.
function mountReal(initEarnedCandy) {
  // earned candy must come from the effort ledger (36 pts = 1 candy). Seed enough
  // curriculum_quiz rows (10 pts each) to hit ~initEarnedCandy; the reducer is fed
  // the SAME exact candy so both sides agree.
  const acc = new Map();
  const dogeLedger = [];
  const quizCount = Math.round((initEarnedCandy * 36) / 10);
  const exactCandy = (quizCount * 10) / 36;
  const ledgers = { s1: Array.from({ length: quizCount }, (_, i) => ({ source: 'curriculum_quiz', item_id: 'Q-' + i, receipt_compact: 'rc' })) };
  const db = {
    async getDogeAccount(sid) { return { data: acc.get(sid) || null, error: null }; },
    async upsertDogeAccount(sid, patch) { const row = { student_id: sid, ...patch }; acc.set(sid, row); return { data: row, error: null }; },
    async updateDogeField(sid, field, value) { const row = { ...(acc.get(sid) || { student_id: sid }), [field]: value }; acc.set(sid, row); return { data: row, error: null }; },
    async insertDogeLedger(row) { dogeLedger.push({ ...row, ts: row.ts || new Date().toISOString() }); return { data: row, error: null }; },
    async listDogeLedger(sid) { return { data: dogeLedger.filter((r) => r.student_id === sid), error: null }; },
    async dogeCoinFlows(sid) { return { data: dogeLedger.filter((r) => r.student_id === sid && (r.kind === 'buy_doge' || r.kind === 'sell_doge')), error: null }; },
    async dogeSpend({ p_sid, p_earned, p_candy, p_kind, p_doge, p_price, p_cpd }) {
      const a = acc.get(p_sid) || { student_id: p_sid, candy_eaten: 0, candy_given: 0, doge_balance: 0, doge_sent: 0, doge_cost_basis: 0, candy_gifted_out: 0, candy_gifted_in: 0, candy_realized: 0 };
      const bal = p_earned - a.candy_given - a.doge_cost_basis - a.candy_gifted_out + a.candy_gifted_in + a.candy_realized;
      if (bal < p_candy - 1e-9) return { data: null, error: null };
      const n = { ...a, doge_balance: a.doge_balance + (p_doge || 0), doge_cost_basis: a.doge_cost_basis + p_candy };
      acc.set(p_sid, n);
      dogeLedger.push({ student_id: p_sid, kind: p_kind, candy_delta: -p_candy, doge_delta: p_doge || 0, ts: new Date().toISOString() });
      return { data: n, error: null };
    },
    async dogeSell({ p_sid, p_doge, p_rate, p_price, p_hold_hours }) {
      const a = acc.get(p_sid) || { student_id: p_sid, candy_given: 0, doge_balance: 0, doge_sent: 0, doge_cost_basis: 0, candy_gifted_out: 0, candy_gifted_in: 0, candy_realized: 0 };
      const inApp = a.doge_balance - a.doge_sent;
      if (inApp < p_doge - 1e-9) return { data: null, error: null };
      const cutoff = Date.now() - (Number(p_hold_hours) || 24) * 3600 * 1000;
      let matured = 0, sold = 0;
      for (const r of dogeLedger) { if (r.student_id !== p_sid) continue; if (r.kind === 'buy_doge') { if (new Date(r.ts).getTime() <= cutoff) matured += Number(r.doge_delta || 0); } else if (r.kind === 'sell_doge') sold += Math.abs(Number(r.doge_delta || 0)); }
      if (Math.min(inApp, matured - sold - a.doge_sent) < p_doge - 1e-9) return { data: null, error: null };
      const basis = a.doge_balance > 0 ? a.doge_cost_basis * (p_doge / a.doge_balance) : 0;
      const n = { ...a, doge_balance: a.doge_balance - p_doge, doge_cost_basis: Math.max(0, a.doge_cost_basis - basis), candy_realized: a.candy_realized + (p_doge * p_rate - basis) };
      acc.set(p_sid, n);
      dogeLedger.push({ student_id: p_sid, kind: 'sell_doge', candy_delta: p_doge * p_rate, doge_delta: -p_doge, ts: new Date().toISOString() });
      return { data: n, error: null };
    },
    async dogeGiftedSince() { return { data: [], error: null }; },
  };
  const ledgerDb = { async getLedgerByStudent(sid) { return { data: ledgers[sid] || [], error: null }; } };
  const app = express();
  app.use(express.json());
  mountDogeWallet(app, { db, ledgerDb, verifyToken: (t) => (t && t.startsWith('tok:') ? t.slice(4) : null), getPrice: async () => 0.088 });
  return { server: http.createServer(app), exactCandy, db, dogeLedger };
}
async function call(ctx, method, path, body) {
  await new Promise((r) => ctx.server.listen(0, r));
  const port = ctx.server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { 'content-type': 'application/json', authorization: 'Bearer tok:s1' }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  await new Promise((r) => ctx.server.close(r));
  return { status: res.status, body: json };
}

describe('Layer A — the REAL routes agree with the reducer (live guard ordering)', () => {
  const SID = '00000000-0000-4000-8000-000000000001';
  it('a live buy → (aged) sell matches the reducer numbers exactly', async () => {
    const ctx = mountReal(30);                            // ~30 candy earned (effort ledger)
    let s = initState([ctx.exactCandy]);                  // reducer fed the SAME exact candy

    const buy = await call(ctx, 'POST', '/wallet/buy-doge', { candy: 10 });
    expect(buy.status).toBe(200);
    s = applyOp(s, { op: 'buy', sid: SID, candy: 10, price: 0.088, ageHours: 48 }).state;
    let n = deriveNumbers(s, SID);
    expect(buy.body.candyConverted).toBeCloseTo(n.C, 4);
    expect(buy.body.dogeBalance).toBeCloseTo(n.dogeBalance, 4);
    expect(buy.body.candyOwed).toBeCloseTo(n.O, 4);

    // back-date the route's buy leg so the wall-clock maturity gate clears, then cash out half.
    for (const r of ctx.dogeLedger) if (r.kind === 'buy_doge') r.ts = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const coins = buy.body.dogeBalance;
    const sell = await call(ctx, 'POST', '/wallet/sell-doge', { doge: coins / 2 });
    expect(sell.status).toBe(200);
    s = applyOp(s, { op: 'sell', sid: SID, doge: coins / 2, price: 0.088, holdHours: SELL_HOLD_HOURS }).state;
    n = deriveNumbers(s, SID);
    expect(sell.body.candyRealized).toBeCloseTo(n.Z, 4);
    expect(sell.body.dogeBalance).toBeCloseTo(n.dogeBalance, 4);
    expect(sell.body.candyConverted).toBeCloseTo(n.C, 4);
    expect(sell.body.candyOwed).toBeCloseTo(n.O, 4);
  });
  it('an over-buy through the live route is rejected (matches the reducer rejection)', async () => {
    const ctx = mountReal(5);
    const over = await call(ctx, 'POST', '/wallet/buy-doge', { candy: 6 });
    expect(over.status).toBe(400);
    expect(applyOp(initState([ctx.exactCandy]), { op: 'buy', sid: SID, candy: 6, price: 0.088, ageHours: 0 }).rejected).toBe(true);
  });
});
