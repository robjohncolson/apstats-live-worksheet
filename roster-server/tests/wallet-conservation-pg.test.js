// wallet-conservation-pg.test.js — Layer B of the candy↔DOGE conservation audit
// (WALLET_CONSERVATION_AUDIT_SPEC.md §2 Layer B). The DIFFERENTIAL harness: for
// every fuzzed trajectory, apply each op through BOTH the REAL plpgsql
// (doge_spend / doge_gift / doge_sell in pglite) AND the JS reducer, then assert
// the persisted Postgres row == the reducer state (within 1e-6) AND I1–I8.
//
// This is the layer that closes the I9 gap the s16 review flagged: the in-memory
// `dogeSell` fake in doge-wallet.test.js hand-copies the SQL formula, so a bug
// copied into BOTH passes. Here the oracle is the REAL SQL — a divergence is a
// finding, not a tautology. Engine = @electric-sql/pglite (WASM Postgres, no
// Docker); confirmed to run the default plpgsql language.

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import fc from 'fast-check';
import {
  initState, applyOp, studentIds, deriveNumbers, resolveOp, trajectoryArbitrary,
  checkStateInvariants, checkDeltaInvariants,
  candyPerDoge, dogeFromCandy, DAILY_GIFT_CAP,
} from './fixtures/wallet-world.js';
import {
  createWalletDb, resetWallet, pgAccount, pgSpend, pgGift, pgSell, ageLastBuy, pgSetColumn, pgNum,
} from './fixtures/pg-wallet.js';

const K = 3;
const SIDS = studentIds(K);
const NUM_RUNS = 150;
const trajArb = trajectoryArbitrary(fc, K);
// The mutable doge_account columns (candy_eaten is vestigial / always 0).
const COLS = ['candy_given', 'doge_balance', 'doge_sent', 'doge_cost_basis', 'candy_gifted_out', 'candy_gifted_in', 'candy_realized'];

let db;
beforeAll(async () => { db = await createWalletDb(SIDS); }, 60000);
afterAll(async () => { if (db) await db.close(); });

// Persisted pglite row (null = no row yet = all-zeros) vs the reducer account.
function rowDiffs(pgRow, acc, sid) {
  const diffs = [];
  for (const c of COLS) {
    const a = pgRow ? pgNum(pgRow[c]) : 0;
    if (Math.abs(a - acc[c]) > 1e-6) diffs.push(`${sid} ${c}: SQL=${a} reducer=${acc[c]}`);
  }
  return diffs;
}

// Apply ONE op to the real SQL AND the reducer; collect any SQL↔reducer divergence.
async function stepBoth(state, op) {
  const res = applyOp(state, op);
  let diffs = [];
  const accOf = (sid) => res.state.acc.get(sid);
  const acceptMismatch = (pgRow, label) => {
    const pgAccepted = pgRow && pgRow.student_id != null;
    if (pgAccepted !== res.accepted) diffs.push(`accept mismatch ${label}: SQL=${pgAccepted} reducer=${res.accepted}`);
    return pgAccepted;
  };
  switch (op.op) {
    case 'earn':
      break;                                  // Earned is not a column — fed as p_earned per op
    case 'buy': {
      const E = deriveNumbers(state, op.sid).E;
      const coins = dogeFromCandy(op.candy, op.price);
      const fn = await pgSpend(db, { p_sid: op.sid, p_earned: E, p_candy: op.candy, p_kind: 'buy_doge', p_doge: coins, p_price: op.price, p_cpd: candyPerDoge(op.price) });
      if (acceptMismatch(fn, 'buy')) await ageLastBuy(db, op.sid, op.ageHours);
      diffs = diffs.concat(rowDiffs(await pgAccount(db, op.sid), accOf(op.sid), op.sid));
      break;
    }
    case 'sell': {
      const fn = await pgSell(db, { p_sid: op.sid, p_doge: op.doge, p_rate: candyPerDoge(op.price), p_price: op.price, p_hold_hours: op.holdHours });
      acceptMismatch(fn, 'sell');
      diffs = diffs.concat(rowDiffs(await pgAccount(db, op.sid), accOf(op.sid), op.sid));
      break;
    }
    case 'gift': {
      const E = deriveNumbers(state, op.from).E;
      const fn = await pgGift(db, { p_from: op.from, p_to: op.to, p_candy: op.candy, p_earned_from: E, p_cap: DAILY_GIFT_CAP });
      acceptMismatch(fn, 'gift');
      diffs = diffs.concat(rowDiffs(await pgAccount(db, op.from), accOf(op.from), op.from));
      diffs = diffs.concat(rowDiffs(await pgAccount(db, op.to), accOf(op.to), op.to));
      break;
    }
    case 'markGiven':                          // JS markEndpoint clamp → kept in lock-step
      await pgSetColumn(db, op.sid, 'candy_given', accOf(op.sid).candy_given);
      diffs = rowDiffs(await pgAccount(db, op.sid), accOf(op.sid), op.sid);
      break;
    case 'markSent':
      await pgSetColumn(db, op.sid, 'doge_sent', accOf(op.sid).doge_sent);
      diffs = rowDiffs(await pgAccount(db, op.sid), accOf(op.sid), op.sid);
      break;
  }
  return { next: res.state, accepted: res.accepted, diffs };
}

describe('Layer B — the REAL plpgsql agrees with the reducer over every fuzzed trajectory (I9)', () => {
  it('SQL doge_spend/doge_gift/doge_sell == reducer, and I1–I8 hold, after every op', async () => {
    await fc.assert(
      fc.asyncProperty(trajArb, async ({ initEarned, ops }) => {
        await resetWallet(db);
        let state = initState(initEarned);
        for (const raw of ops) {
          const op = resolveOp(SIDS, raw);
          if (op.op === 'noop') continue;
          const { next, accepted, diffs } = await stepBoth(state, op);
          const violations = [
            ...checkStateInvariants(next),
            ...checkDeltaInvariants(state, next, op, accepted),
            ...diffs,
          ];
          state = next;
          if (violations.length) throw new Error(`op ${JSON.stringify(op)} → ${violations.join(' | ')}`);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  }, 240000);

  it('a real partial sell books the EXACT avg-cost split (independent hand-computed oracle)', async () => {
    // 4 coins bought for 8 candy (avg 2/coin), sell 3 at rate 2.4444 — the hand
    // numbers from doge-wallet.test.js, but here against the REAL plpgsql.
    await resetWallet(db);
    const sid = SIDS[0];
    const price = 0.088, rate = price / 0.036;       // 2.4444
    const coins = 4, basis = 8;
    await pgSpend(db, { p_sid: sid, p_earned: 100, p_candy: basis, p_kind: 'buy_doge', p_doge: coins, p_price: price, p_cpd: rate });
    await ageLastBuy(db, sid, 48);
    const sold = await pgSell(db, { p_sid: sid, p_doge: 3, p_rate: rate, p_price: price, p_hold_hours: 24 });
    expect(pgNum(sold.doge_balance)).toBeCloseTo(1, 6);
    expect(pgNum(sold.doge_cost_basis)).toBeCloseTo(2, 6);          // 8 − 8·(3/4)
    expect(pgNum(sold.candy_realized)).toBeCloseTo(3 * rate - 6, 6); // payout − prorated basis
  }, 60000);

  // FINDING C1: the JS reducer models the daily gift cap as a LIFETIME cap on
  // candy_gifted_out, but the REAL doge_gift enforces a ROLLING 24h window
  // (sum of gift_out legs with ts ≥ now()−24h). The fuzzer never ages gift legs, so
  // that divergence is unfuzzable — this deterministic test exercises the SQL window
  // directly: a gift_out leg older than 24h must NOT count toward today's cap.
  it('C1: doge_gift enforces a ROLLING 24h cap, not a lifetime cap (aged gift_out legs drop out)', async () => {
    await resetWallet(db);
    const from = SIDS[0], to = SIDS[1];
    // Seed an OLD gift_out of the full cap (25h ago) + a matching candy_gifted_out total.
    await db.query(`insert into doge_account (student_id, candy_gifted_out) values ($1, $2)
                      on conflict (student_id) do update set candy_gifted_out = excluded.candy_gifted_out`, [from, DAILY_GIFT_CAP]);
    await db.query(`insert into doge_account (student_id) values ($1) on conflict do nothing`, [to]);
    await db.query(`insert into doge_ledger (student_id, kind, candy_delta, ts)
                      values ($1, 'gift_out', $2, now() - interval '25 hours')`, [from, -DAILY_GIFT_CAP]);
    // A fresh full-cap gift: a LIFETIME cap (already at the cap) would reject; the rolling
    // 24h window sees 0 today → ALLOW (spendable permitting; p_earned_from = 100 candy).
    const r = await pgGift(db, { p_from: from, p_to: to, p_candy: DAILY_GIFT_CAP, p_earned_from: 100, p_cap: DAILY_GIFT_CAP });
    expect(r.student_id).not.toBeNull();        // accepted ⇒ the aged leg did NOT count (rolling, not lifetime)
    // and a SECOND fresh gift now WOULD exceed the rolling cap → rejected.
    const r2 = await pgGift(db, { p_from: from, p_to: to, p_candy: 1, p_earned_from: 100, p_cap: DAILY_GIFT_CAP });
    expect(r2.student_id).toBeNull();
  }, 60000);
});
