// wallet-stakes-conservation.test.js — STUDY_BREAK_STAKES_SPEC §6 (extends the s17
// WALLET_CONSERVATION_AUDIT to the new ESCROW term). Three checks on the bet lifecycle:
//   Layer A  — fast-check the JS reducer: I1/I3/I8/I9 hold after every bet op.
//   Layer B  — DIFFERENTIAL: the SAME bet trajectory through the REAL plpgsql
//              (tetris_bet_open/resolve/refund, via @electric-sql/pglite) must leave
//              IDENTICAL account columns to the reducer. This is what proves the
//              hand-written SQL conserves (closes the "fake copies the SQL" gap).
//   Pins     — open→settle transfer, open→refund no-op, the consent handshake, the
//              both-afford guard, disagreement→refund, and idempotent re-resolve.

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import fc from 'fast-check';
import {
  studentIds, initState, applyOp, applyTrajectory,
  checkStateInvariants, checkDeltaInvariants,
  betEventsArbitrary, interpretBetEvents, deriveNumbers,
} from './fixtures/wallet-world.js';
import {
  createWalletDb, resetWallet, pgAccount, pgBetOpen, pgBetResolve, pgBetRefund, pgBet, pgMark, pgNum,
} from './fixtures/pg-wallet.js';

const K = 4;
const SIDS = studentIds(K);

// ── Layer A — the reducer never violates an invariant on a bet trajectory ──────
describe('Layer A — bet trajectories keep the books closed (reducer)', () => {
  it('I1/I3/I8/I9 hold after every op (600 runs)', () => {
    fc.assert(fc.property(betEventsArbitrary(fc, K), (plan) => {
      let state = initState(plan.initEarned);
      const ops = interpretBetEvents(SIDS, plan);
      for (const op of ops) {
        const r = applyOp(state, op);
        const sv = checkStateInvariants(r.state);
        const dv = checkDeltaInvariants(state, r.state, op, r.accepted);
        if (sv.length || dv.length) throw new Error([...sv, ...dv].join(' | '));
        state = r.state;
      }
    }), { numRuns: 600 });
  });
});

// ── Layer B — the REAL plpgsql matches the reducer column-for-column ───────────
const ACC_COLS = ['candy_escrowed', 'candy_gifted_in', 'candy_gifted_out'];

async function driveSql(db, op, earned) {
  if (op.op === 'betOpen') {
    await pgBetOpen(db, { p_match: op.match, p_caller: op.a, p_opp: op.b, p_stake: op.stake, p_earned_caller: earned.get(op.a), p_earned_opp: earned.get(op.b) });
    return pgBetOpen(db, { p_match: op.match, p_caller: op.b, p_opp: op.a, p_stake: op.stake, p_earned_caller: earned.get(op.b), p_earned_opp: earned.get(op.a) });
  }
  if (op.op === 'betSettle') {
    const b = await pgBet(db, op.match);
    if (!b || b.status !== 'open') return 'no-op';
    const loser = op.winner === b.player_a ? b.player_b : b.player_a;
    await pgBetResolve(db, { p_match: op.match, p_reporter: op.winner, p_winner: op.winner });
    return pgBetResolve(db, { p_match: op.match, p_reporter: loser, p_winner: op.winner });
  }
  if (op.op === 'betRefund') return pgBetRefund(db, op.match);
  return null;
}

describe('Layer B — reducer ≡ real plpgsql (differential, pglite)', () => {
  let db;
  beforeAll(async () => { db = await createWalletDb(SIDS); }, 60000);
  afterAll(async () => { if (db) await db.close(); });

  it('every bet op leaves identical account columns (120 runs)', async () => {
    await fc.assert(fc.asyncProperty(betEventsArbitrary(fc, K), async (plan) => {
      await resetWallet(db);
      let state = initState(plan.initEarned);
      const ops = interpretBetEvents(SIDS, plan);
      for (const op of ops) {
        state = applyOp(state, op).state;
        await driveSql(db, op, state.earned);
        for (const sid of SIDS) {
          const a = await pgAccount(db, sid) || {};
          const exp = state.acc.get(sid);
          for (const c of ACC_COLS) {
            const got = pgNum(a[c]) || 0;
            if (Math.abs(got - exp[c]) > 1e-7) {
              throw new Error(`differ ${sid}.${c}: pg=${got} reducer=${exp[c]} (op=${op.op})`);
            }
          }
        }
      }
    }), { numRuns: 120 });
  }, 120000);
});

// ── Deterministic pins ─────────────────────────────────────────────────────────
describe('Stakes — deterministic lifecycle pins', () => {
  let db;
  beforeAll(async () => { db = await createWalletDb(SIDS); }, 60000);
  afterAll(async () => { if (db) await db.close(); });

  const A = SIDS[0], B = SIDS[1], C = SIDS[2];

  it('reducer: open→settle moves exactly 1 stake from loser to winner; escrow returns to 0', () => {
    let s = initState([5, 5, 0, 0]);
    s = applyOp(s, { op: 'betOpen', match: 'm', a: A, b: B, stake: 1 }).state;
    expect(deriveNumbers(s, A).X).toBe(1);
    expect(deriveNumbers(s, A).O).toBe(4);          // 5 − 1 escrowed
    expect(deriveNumbers(s, B).O).toBe(4);
    s = applyOp(s, { op: 'betSettle', match: 'm', winner: A }).state;
    expect(deriveNumbers(s, A).X).toBe(0);
    expect(deriveNumbers(s, B).X).toBe(0);
    expect(deriveNumbers(s, A).O).toBe(6);          // winner +1 vs pre-bet
    expect(deriveNumbers(s, B).O).toBe(4);          // loser −1 vs pre-bet
    expect(checkStateInvariants(s)).toEqual([]);
  });

  it('reducer: open→refund restores both players exactly', () => {
    let s0 = initState([5, 5, 0, 0]);
    let s = applyOp(s0, { op: 'betOpen', match: 'm', a: A, b: B, stake: 1 }).state;
    s = applyOp(s, { op: 'betRefund', match: 'm' }).state;
    expect(deriveNumbers(s, A).O).toBe(5);
    expect(deriveNumbers(s, B).O).toBe(5);
    expect(deriveNumbers(s, A).X).toBe(0);
  });

  it('reducer: an escrowed stake is excluded from the materialize cap', () => {
    let s = initState([5, 5, 0, 0]);
    s = applyOp(s, { op: 'betOpen', match: 'm', a: A, b: B, stake: 1 }).state;   // A escrows 1
    s = applyOp(s, { op: 'markGiven', sid: A, amount: 5 }).state;                // cap = 5 − 1 escrow = 4
    expect(deriveNumbers(s, A).M).toBe(4);
    expect(deriveNumbers(s, A).O).toBe(0);                                       // 5 − 4 given − 1 escrow
    expect(checkStateInvariants(s)).toEqual([]);
  });

  it('SQL: the consent handshake — one join is "waiting" (no escrow), the second "opened"', async () => {
    await resetWallet(db);
    const s1 = await pgBetOpen(db, { p_match: 'h', p_caller: A, p_opp: B, p_stake: 1, p_earned_caller: 5, p_earned_opp: 5 });
    expect(s1).toBe('waiting');
    expect(pgNum((await pgAccount(db, A))?.candy_escrowed) || 0).toBe(0);   // nobody escrowed yet
    const s2 = await pgBetOpen(db, { p_match: 'h', p_caller: B, p_opp: A, p_stake: 1, p_earned_caller: 5, p_earned_opp: 5 });
    expect(s2).toBe('opened');
    expect(pgNum((await pgAccount(db, A)).candy_escrowed)).toBe(1);
    expect(pgNum((await pgAccount(db, B)).candy_escrowed)).toBe(1);
  });

  it('SQL: both must afford — a broke opponent voids the bet, no escrow', async () => {
    await resetWallet(db);
    await pgBetOpen(db, { p_match: 'p', p_caller: A, p_opp: C, p_stake: 1, p_earned_caller: 5, p_earned_opp: 0 });
    const s2 = await pgBetOpen(db, { p_match: 'p', p_caller: C, p_opp: A, p_stake: 1, p_earned_caller: 0, p_earned_opp: 5 });
    expect(s2).toBe('insufficient');
    expect(pgNum((await pgAccount(db, A))?.candy_escrowed) || 0).toBe(0);   // A not charged
  });

  it('SQL: a non-participant cannot join someone else\'s match', async () => {
    await resetWallet(db);
    await pgBetOpen(db, { p_match: 'x', p_caller: A, p_opp: B, p_stake: 1, p_earned_caller: 5, p_earned_opp: 5 });
    const s = await pgBetOpen(db, { p_match: 'x', p_caller: C, p_opp: A, p_stake: 1, p_earned_caller: 5, p_earned_opp: 5 });
    expect(s).toBe('not-a-player');
  });

  it('SQL: disagreement on the winner refunds both stakes', async () => {
    await resetWallet(db);
    await pgBetOpen(db, { p_match: 'd', p_caller: A, p_opp: B, p_stake: 1, p_earned_caller: 5, p_earned_opp: 5 });
    await pgBetOpen(db, { p_match: 'd', p_caller: B, p_opp: A, p_stake: 1, p_earned_caller: 5, p_earned_opp: 5 });
    await pgBetResolve(db, { p_match: 'd', p_reporter: A, p_winner: A });   // A says A won
    const r = await pgBetResolve(db, { p_match: 'd', p_reporter: B, p_winner: B }); // B says B won
    expect(r).toBe('refunded');
    expect(pgNum((await pgAccount(db, A)).candy_escrowed)).toBe(0);
    expect(pgNum((await pgAccount(db, B)).candy_escrowed)).toBe(0);
    expect(pgNum((await pgAccount(db, A)).candy_gifted_in)).toBe(0);        // nobody won
  });

  it('SQL doge_mark: a live bet escrow is NOT materializable (the s19 mint-race fix)', async () => {
    await resetWallet(db);
    await pgBetOpen(db, { p_match: 'mk', p_caller: A, p_opp: B, p_stake: 1, p_earned_caller: 5 });
    await pgBetOpen(db, { p_match: 'mk', p_caller: B, p_opp: A, p_stake: 1, p_earned_caller: 5 });
    expect(pgNum((await pgAccount(db, A)).candy_escrowed)).toBe(1);
    // Teacher materializes A (earned 5): cap = 5 − 1 escrowed = 4, so candy_given clamps to 4 —
    // WITHOUT the escrow term it would write 5, minting 1 candy if the bet then settles as a loss.
    const row = await pgMark(db, { p_sid: A, p_field: 'candy_given', p_amount: 5, p_earned: 5 });
    expect(pgNum(row.candy_given)).toBe(4);
  });

  it('SQL hijack guard: a 3rd party cannot occupy player_a of someone else\'s match', async () => {
    await resetWallet(db);
    // Attacker C pre-creates a row (C=player_a, X=player_b).
    expect(await pgBetOpen(db, { p_match: 'hj', p_caller: C, p_opp: A, p_stake: 1, p_earned_caller: 5 })).toBe('waiting');
    // Victim A joins naming their REAL opponent B (not C) → rejected; no escrow against C.
    expect(await pgBetOpen(db, { p_match: 'hj', p_caller: A, p_opp: B, p_stake: 1, p_earned_caller: 5 })).toBe('not-a-player');
    expect(pgNum((await pgAccount(db, A))?.candy_escrowed) || 0).toBe(0);
  });

  it('SQL: agreement pays the winner the pot, and a re-resolve is idempotent', async () => {
    await resetWallet(db);
    await pgBetOpen(db, { p_match: 'w', p_caller: A, p_opp: B, p_stake: 1, p_earned_caller: 5, p_earned_opp: 5 });
    await pgBetOpen(db, { p_match: 'w', p_caller: B, p_opp: A, p_stake: 1, p_earned_caller: 5, p_earned_opp: 5 });
    await pgBetResolve(db, { p_match: 'w', p_reporter: A, p_winner: A });
    const r = await pgBetResolve(db, { p_match: 'w', p_reporter: B, p_winner: A });
    expect(r).toBe('settled');
    expect(pgNum((await pgAccount(db, A)).candy_gifted_in)).toBe(1);        // winner got B's stake
    expect(pgNum((await pgAccount(db, B)).candy_gifted_out)).toBe(1);       // loser's stake left
    expect(pgNum((await pgAccount(db, A)).candy_escrowed)).toBe(0);
    // idempotent: a stray re-resolve doesn't double-pay.
    const again = await pgBetResolve(db, { p_match: 'w', p_reporter: A, p_winner: A });
    expect(again).toBe('settled');
    expect(pgNum((await pgAccount(db, A)).candy_gifted_in)).toBe(1);
  });
});
