// wallet-world.js — the canonical fixture world for the candy↔DOGE conservation
// audit (WALLET_CONSERVATION_AUDIT_SPEC.md §2 "Shared foundation"). ONE trajectory
// generator + ONE canonical JS reducer + the I1–I8 invariant checks that:
//   • Layer A (wallet-conservation.test.js)     drives through the reducer + real routes
//   • Layer B (wallet-conservation-pg.test.js)  diffs the reducer vs the REAL plpgsql
//   • Layer C (formal/wallet-model + emit-cases) cross-checks vs the Redex model
// Mirrors tests/fixtures/sim-world.js (the s13 grade-sim fixture).
//
// THE WALLET STATE MACHINE (spec §0). Per-student state = the doge_account columns
// + the student's ledger of buy/sell legs (for FIFO maturity) + Earned (E, NOT
// stored — recomputed from the effort ledger in production, a monotonic-up input
// here). Transitions: earn / buy / sell / gift / markGiven / markSent.
//
// THE 7-NUMBER IDENTITY (spec §1):
//   E(arned) + R(eceived) + Z(realized) == G(ifted) + C(onverted) + M(aterialized) + O(wed)
//   raw = E + R + Z − G − C − M     (the spendable pool; SQL calls it "spendable")
//   O   = max(0, raw)
//
// ⚠ SINGLE-SOURCE NOTE (spec §2 foundation): the CONVERSION math (candyPerDoge /
// dogeFromCandy / candyFromDoge) is imported from doge-econ.js — the SAME module
// production uses, so there is NO third copy of the peg. The GUARD arithmetic
// (spendable, avg-basis unwind, FIFO maturity) is hand-mirrored here from the SQL
// (migrations 0019/0021/0022/0023) and from doge-wallet.js markEndpoint; Layer B
// (the pglite differential) is what PROVES this mirror matches the real plpgsql.

import {
  candyPerDoge, dogeFromCandy, candyFromDoge,
  DAILY_GIFT_CAP, SELL_HOLD_HOURS,
} from '../../doge-econ.js';

export const EPS = 1e-9;
export { DAILY_GIFT_CAP, SELL_HOLD_HOURS, candyPerDoge, dogeFromCandy, candyFromDoge };

// Deterministic uuids for K students (real uuid shape so Layer B's uuid params +
// the roster FK accept them). Index i → ...00000000000{i+1} (hex, supports K≤15).
export function studentIds(k) {
  return Array.from({ length: k }, (_, i) => `00000000-0000-4000-8000-0000000000${(i + 1).toString(16).padStart(2, '0')}`);
}

// A fresh doge_account row (all the columns 0019+0021+0022+0023+0024 give it).
function emptyAccount() {
  return {
    candy_eaten: 0, candy_given: 0, doge_balance: 0, doge_sent: 0,
    doge_cost_basis: 0, candy_gifted_out: 0, candy_gifted_in: 0, candy_realized: 0,
    candy_escrowed: 0,
  };
}

// Build the initial world. `initEarned[i]` seeds student i's Earned faucet so
// buys/gifts have something to spend; everything else starts at 0.
export function initState(initEarned = []) {
  const sids = studentIds(Math.max(1, initEarned.length));
  const acc = new Map();
  const earned = new Map();
  const buys = new Map();      // sid → [{ doge, ageHours }] (for FIFO maturity)
  const soldBack = new Map();  // sid → total DOGE cashed back (FIFO subtrahend)
  sids.forEach((sid, i) => {
    acc.set(sid, emptyAccount());
    earned.set(sid, Math.max(0, Number(initEarned[i]) || 0));
    buys.set(sid, []);
    soldBack.set(sid, 0);
  });
  return { sids, acc, earned, buys, soldBack, bets: new Map() };  // bets: matchId → { a, b, stake, status }
}

function cloneState(s) {
  const acc = new Map();
  for (const [sid, a] of s.acc) acc.set(sid, { ...a });
  const buys = new Map();
  for (const [sid, arr] of s.buys) buys.set(sid, arr.map((b) => ({ ...b })));
  const bets = new Map();
  for (const [mid, b] of (s.bets || new Map())) bets.set(mid, { ...b });
  return {
    sids: s.sids,
    acc,
    earned: new Map(s.earned),
    buys,
    soldBack: new Map(s.soldBack),
    bets,
  };
}

// The 8 numbers + raw/Owed for one student (the JS `deriveBalances` math).
export function deriveNumbers(state, sid) {
  const a = state.acc.get(sid);
  const E = state.earned.get(sid);
  const R = a.candy_gifted_in;
  const Z = a.candy_realized;
  const G = a.candy_gifted_out;
  const C = a.doge_cost_basis;
  const M = a.candy_given;
  const X = a.candy_escrowed;                  // Escrowed: candy locked in a live bet (0024)
  const raw = E + R + Z - G - C - M - X;        // SQL "spendable" (now nets escrow)
  return {
    E, R, Z, G, C, M, X, raw,
    O: Math.max(0, raw),
    held: E + R + Z - G - C - M,                // = O + X (spendable + escrowed); the bet-conserved scalar
    dogeBalance: a.doge_balance,
    dogeSent: a.doge_sent,
  };
}

// Spendable candy = raw (what the SQL guard `(p_earned − candy_given − doge_cost_basis
// − candy_gifted_out + candy_gifted_in + candy_realized)` evaluates to). Single source.
function spendable(state, sid) {
  return deriveNumbers(state, sid).raw;
}

// In-app DOGE matured for cash-out (mirror of doge_sell's two guards + maturedSellable):
//   inApp   = doge_balance − doge_sent                       (un-sent, on-chain can't return)
//   matured = Σ(buy.doge | age ≥ hold) − Σ(soldBack) − doge_sent, capped at inApp
function sellGuard(state, sid, holdHours) {
  const a = state.acc.get(sid);
  const inApp = a.doge_balance - a.doge_sent;
  let maturedBought = 0;
  for (const b of state.buys.get(sid)) if (b.ageHours >= holdHours) maturedBought += b.doge;
  const matured = Math.min(inApp, maturedBought - state.soldBack.get(sid) - a.doge_sent);
  return { inApp, matured };
}

// ── The canonical reducer ─────────────────────────────────────────────────────
// applyOp(state, op) → { state, accepted, rejected, reason }. PURE: returns a new
// state (the input is never mutated), so fast-check can shrink trajectories freely.
// `op` is one of the tagged shapes from the generator (see makeOp* below).
export function applyOp(prev, op) {
  const state = cloneState(prev);
  const reject = (reason) => ({ state: prev, accepted: false, rejected: true, reason });
  const ok = () => ({ state, accepted: true, rejected: false, reason: null });

  switch (op.op) {
    case 'earn': {                                   // monotonic-up effort faucet
      if (!(op.candy > 0)) return reject('nonpositive');
      state.earned.set(op.sid, state.earned.get(op.sid) + op.candy);
      return ok();
    }
    case 'buy': {                                    // candy → DOGE at live price
      if (!(op.candy > 0) || !(op.price > 0)) return reject('bad-args');
      if (spendable(prev, op.sid) < op.candy - EPS) return reject('insufficient');
      const a = state.acc.get(op.sid);
      const coins = dogeFromCandy(op.candy, op.price);
      a.doge_balance += coins;
      a.doge_cost_basis += op.candy;
      state.buys.get(op.sid).push({ doge: coins, ageHours: op.ageHours });
      return ok();
    }
    case 'sell': {                                   // DOGE → candy at live rate
      if (!(op.doge > 0) || !(op.price > 0)) return reject('bad-args');
      const hold = op.holdHours == null ? SELL_HOLD_HOURS : op.holdHours;
      const a = state.acc.get(op.sid);
      const { inApp, matured } = sellGuard(prev, op.sid, hold);
      if (inApp < op.doge - EPS) return reject('not-in-app');     // can't cash sent/on-chain coins
      if (matured < op.doge - EPS) return reject('not-matured');  // held < hold window
      const rate = candyPerDoge(op.price);
      const basis = a.doge_balance > 0 ? a.doge_cost_basis * (op.doge / a.doge_balance) : 0;
      const payout = op.doge * rate;
      a.doge_balance -= op.doge;
      a.doge_cost_basis = Math.max(0, a.doge_cost_basis - basis);
      a.candy_realized += payout - basis;
      state.soldBack.set(op.sid, state.soldBack.get(op.sid) + op.doge);
      return ok();
    }
    case 'gift': {                                   // candy → classmate (zero-sum)
      if (op.from === op.to) return reject('self');
      if (!Number.isInteger(op.candy) || op.candy <= 0) return reject('bad-args');
      const a = state.acc.get(op.from);
      // doge_gift checks the rolling cap FIRST (all gifts are "now" → cap = total gifted out).
      if (a.candy_gifted_out + op.candy > DAILY_GIFT_CAP + EPS) return reject('cap');
      if (spendable(prev, op.from) < op.candy - EPS) return reject('insufficient');
      a.candy_gifted_out += op.candy;
      state.acc.get(op.to).candy_gifted_in += op.candy;
      return ok();
    }
    case 'markGiven': {                              // teacher materializes Owed candy
      if (!(op.amount > 0)) return reject('nonpositive');
      const a = state.acc.get(op.sid);
      const n = deriveNumbers(prev, op.sid);
      const cap = n.E + n.R - n.G - n.C + n.Z - n.X;  // Owed-eligible (doge_mark cap; nets escrow, 0024)
      a.candy_given = Math.max(a.candy_given, Math.min(a.candy_given + op.amount, cap));
      return ok();
    }
    case 'markSent': {                               // teacher deposits DOGE on-chain
      if (!(op.amount > 0)) return reject('nonpositive');
      const a = state.acc.get(op.sid);
      a.doge_sent = Math.max(a.doge_sent, Math.min(a.doge_sent + op.amount, a.doge_balance));
      return ok();
    }
    case 'betOpen': {                                // escrow BOTH stakes (Study Break stakes, 0024)
      if (op.a === op.b) return reject('self');
      if (!(op.stake > 0)) return reject('bad-args');
      if (state.bets.has(op.match)) return reject('exists');           // idempotent: no double-escrow
      if (spendable(prev, op.a) < op.stake - EPS) return reject('insufficient');
      if (spendable(prev, op.b) < op.stake - EPS) return reject('insufficient');
      state.acc.get(op.a).candy_escrowed += op.stake;
      state.acc.get(op.b).candy_escrowed += op.stake;
      state.bets.set(op.match, { a: op.a, b: op.b, stake: op.stake, status: 'open' });
      return ok();
    }
    case 'betSettle': {                              // winner takes the pot (loser→winner transfer)
      const bet = state.bets.get(op.match);
      if (!bet || bet.status !== 'open') return reject('no-open-bet');
      if (op.winner !== bet.a && op.winner !== bet.b) return reject('bad-winner');
      const loser = op.winner === bet.a ? bet.b : bet.a;
      const w = state.acc.get(op.winner), l = state.acc.get(loser);
      w.candy_escrowed -= bet.stake; w.candy_gifted_in += bet.stake;    // own stake back + loser's
      l.candy_escrowed -= bet.stake; l.candy_gifted_out += bet.stake;   // stake consumed → the winner
      bet.status = 'settled';
      return ok();
    }
    case 'betRefund': {                              // disagreement/timeout → return both stakes
      const bet = state.bets.get(op.match);
      if (!bet || bet.status !== 'open') return reject('no-open-bet');
      state.acc.get(bet.a).candy_escrowed -= bet.stake;
      state.acc.get(bet.b).candy_escrowed -= bet.stake;
      bet.status = 'refunded';
      return ok();
    }
    default:
      return reject('unknown-op');
  }
}

// Run a whole trajectory; returns the final state + the per-op outcomes.
export function applyTrajectory(state0, ops) {
  let state = state0;
  const outcomes = [];
  for (const op of ops) {
    const r = applyOp(state, op);
    outcomes.push({ op, accepted: r.accepted, reason: r.reason });
    state = r.state;
  }
  return { state, outcomes };
}

// ── Invariant checks (spec §1, I1–I8) ─────────────────────────────────────────
// Each returns a list of violation strings (empty = all hold). `prev`/`op` enable
// the delta-based invariants (I2 zero-sum, I5 monotonicity, I6 sell P&L).
const close = (a, b, eps = 1e-7) => Math.abs(a - b) <= eps;

// I1 + I3 + I7 are pure single-state invariants over every student.
export function checkStateInvariants(state) {
  const v = [];
  for (const sid of state.sids) {
    const n = deriveNumbers(state, sid);
    // I1 — the books close: Earned+Received+Realized == Gifted+Converted+Materialized+Escrowed+Owed
    // (raw form; a definitional identity that pins the arithmetic, now incl. the 0024 escrow term).
    if (!close(n.E + n.R + n.Z, n.G + n.C + n.M + n.X + n.raw)) {
      v.push(`I1 identity broken for ${sid}: ${n.E + n.R + n.Z} != ${n.G + n.C + n.M + n.X + n.raw}`);
    }
    // I3 — under the guarded ops, spendable never goes negative (Owed has no phantom debt).
    if (n.raw < -1e-7) v.push(`I3 owed floor: raw=${n.raw} < 0 for ${sid}`);
    // I3 — Owed is the clamped raw.
    if (!close(n.O, Math.max(0, n.raw))) v.push(`I3 owed clamp wrong for ${sid}`);
    // I7 — sent ≤ bought (you can't deposit more than was bought).
    if (n.dogeSent > n.dogeBalance + 1e-7) v.push(`I7 doge_sent ${n.dogeSent} > doge_balance ${n.dogeBalance} for ${sid}`);
    // sanity — cost basis never negative (sell floors at 0).
    if (n.C < -1e-7) v.push(`cost_basis ${n.C} < 0 for ${sid}`);
    // I9 — escrow never negative (a bet can't make you owe escrow).
    if (n.X < -1e-7) v.push(`I9 escrow ${n.X} < 0 for ${sid}`);
  }
  // I9 — escrow is fully backed: Σ candy_escrowed == 2 × Σ(open bet stakes). Every escrowed
  // candy belongs to exactly one live bet (2 stakes per open bet); none is stranded or phantom.
  let sumX = 0; for (const sid of state.sids) sumX += deriveNumbers(state, sid).X;
  let sumOpen = 0; for (const b of (state.bets || new Map()).values()) if (b.status === 'open') sumOpen += 2 * b.stake;
  if (!close(sumX, sumOpen, 1e-6)) v.push(`I9 escrow not backed: Σescrow ${sumX} != 2·Σopen-stakes ${sumOpen}`);
  return v;
}

// I2/I5/I6 — delta invariants relative to the prior state + the op just applied.
export function checkDeltaInvariants(prev, next, op, accepted) {
  const v = [];
  // I5 — Materialized + doge_sent never decrease (mark caps clamp, never claw back).
  for (const sid of next.sids) {
    const p = deriveNumbers(prev, sid), q = deriveNumbers(next, sid);
    if (q.M < p.M - 1e-7) v.push(`I5 candy_given fell ${p.M}→${q.M} for ${sid}`);
    if (q.dogeSent < p.dogeSent - 1e-7) v.push(`I5 doge_sent fell ${p.dogeSent}→${q.dogeSent} for ${sid}`);
    // I5 — Converted only rises on a buy / falls on a sell; otherwise constant.
    if (op.op === 'buy' && op.sid === sid) { if (q.C < p.C - 1e-7) v.push(`I5 C fell on buy for ${sid}`); }
    else if (op.op === 'sell' && op.sid === sid) { if (q.C > p.C + 1e-7) v.push(`I5 C rose on sell for ${sid}`); }
    else if (q.C !== p.C && !close(q.C, p.C)) v.push(`I5 C moved on a non-buy/sell op (${op.op}) for ${sid}`);
  }
  // I2 — a gift is zero-sum across the class: Σ raw and Σ E unchanged.
  if (op.op === 'gift' && accepted) {
    const sumRaw = (s) => s.sids.reduce((t, sid) => t + deriveNumbers(s, sid).raw, 0);
    const sumE = (s) => s.sids.reduce((t, sid) => t + s.earned.get(sid), 0);
    if (!close(sumRaw(prev), sumRaw(next), 1e-6)) v.push(`I2 gift not zero-sum: Σraw ${sumRaw(prev)}→${sumRaw(next)}`);
    if (!close(sumE(prev), sumE(next))) v.push(`I2 gift changed Earned: ${sumE(prev)}→${sumE(next)}`);
  }
  // I8 — a bet (open/settle/refund) NEVER creates or destroys candy: Σ held (= Σ(E+R+Z−G−C−M)
  // = Σ(Owed+Escrowed)) and Σ E are unchanged. open moves Owed→Escrow, refund moves it back,
  // settle is a pure loser→winner transfer — none change the class total.
  if ((op.op === 'betOpen' || op.op === 'betSettle' || op.op === 'betRefund') && accepted) {
    const sumHeld = (s) => s.sids.reduce((t, sid) => t + deriveNumbers(s, sid).held, 0);
    const sumE = (s) => s.sids.reduce((t, sid) => t + s.earned.get(sid), 0);
    if (!close(sumHeld(prev), sumHeld(next), 1e-6)) v.push(`I8 bet changed class total: Σheld ${sumHeld(prev)}→${sumHeld(next)}`);
    if (!close(sumE(prev), sumE(next))) v.push(`I8 bet changed Earned: ${sumE(prev)}→${sumE(next)}`);
  }
  // I8b — settle is a transfer of exactly `stake` from loser to winner (in held = Owed+Escrow).
  if (op.op === 'betSettle' && accepted) {
    const bet = prev.bets.get(op.match);
    if (bet) {
      const loser = op.winner === bet.a ? bet.b : bet.a;
      const dW = deriveNumbers(next, op.winner).held - deriveNumbers(prev, op.winner).held;
      const dL = deriveNumbers(next, loser).held - deriveNumbers(prev, loser).held;
      if (!close(dW, bet.stake, 1e-6)) v.push(`I8b winner held Δ ${dW} != +stake ${bet.stake}`);
      if (!close(dL, -bet.stake, 1e-6)) v.push(`I8b loser held Δ ${dL} != −stake ${bet.stake}`);
    }
  }
  // I8c — open then refund is a perfect no-op: a refund restores each player's held to pre-open.
  if (op.op === 'betRefund' && accepted) {
    const bet = prev.bets.get(op.match);
    if (bet) {
      for (const sid of [bet.a, bet.b]) {
        // refund returns the escrowed stake straight to Owed (held unchanged across refund, since
        // held already counts escrow; the meaningful check is raw rises by exactly stake).
        const dRaw = deriveNumbers(next, sid).raw - deriveNumbers(prev, sid).raw;
        if (!close(dRaw, bet.stake, 1e-6)) v.push(`I8c refund ΔOwed ${dRaw} != +stake ${bet.stake} for ${sid}`);
      }
    }
  }
  // I6 — a sell: O rises by EXACTLY the payout; Z rises by payout−basis; O stays ≥ 0.
  if (op.op === 'sell' && accepted) {
    const p = deriveNumbers(prev, op.sid), q = deriveNumbers(next, op.sid);
    const payout = op.doge * candyPerDoge(op.price);
    if (!close(q.raw - p.raw, payout, 1e-6)) v.push(`I6 ΔOwed ${q.raw - p.raw} != payout ${payout}`);
    if (q.O < -1e-7) v.push(`I6 sell drove Owed < 0`);
    if (payout < -1e-9) v.push(`I6 payout negative`);
  }
  return v;
}

// ── Trajectory shapes (the fuzz source A and B share; C's emitter mirrors it) ──
// An op references students by index; the test resolves index → sid. Amount/price
// ranges are modest so numeric-vs-float drift stays well under the differential
// tolerance while still exercising every guard branch.
export const OP_KINDS = ['earn', 'buy', 'sell', 'gift', 'markGiven', 'markSent'];

// The fast-check trajectory arbitrary, shared verbatim by Layer A and Layer B (so
// both fuzz the SAME distribution). `fc` is injected to keep this fixture free of a
// hard fast-check dependency. `{ initEarned: number[k], ops: rawOp[] }`; resolveOp
// maps each raw op's student index → a sid. Amount/price ranges are modest so
// numeric(Postgres)-vs-float(JS) drift stays far under the differential tolerance.
export function trajectoryArbitrary(fc, k) {
  const idxArb = fc.nat({ max: k - 1 });
  const priceArb = fc.double({ min: 0.02, max: 0.5, noNaN: true });
  const candyArb = fc.double({ min: 0.1, max: 30, noNaN: true });
  const opArb = fc.oneof(
    fc.record({ op: fc.constant('earn'), i: idxArb, candy: candyArb }),
    fc.record({ op: fc.constant('buy'), i: idxArb, candy: candyArb, price: priceArb, ageHours: fc.integer({ min: 0, max: 72 }) }),
    fc.record({ op: fc.constant('sell'), i: idxArb, doge: fc.double({ min: 0.1, max: 40, noNaN: true }), price: priceArb }),
    fc.record({ op: fc.constant('gift'), i: idxArb, j: fc.nat({ max: Math.max(0, k - 2) }), candy: fc.integer({ min: 1, max: 25 }) }),
    fc.record({ op: fc.constant('markGiven'), i: idxArb, amount: candyArb }),
    fc.record({ op: fc.constant('markSent'), i: idxArb, amount: fc.double({ min: 0.1, max: 40, noNaN: true }) }),
  );
  return fc.record({
    initEarned: fc.array(fc.double({ min: 0, max: 80, noNaN: true }), { minLength: k, maxLength: k }),
    ops: fc.array(opArb, { maxLength: 24 }),
  });
}

// ── Bet-lifecycle trajectories (Study Break stakes, 0024) ─────────────────────
// A plan of `open`/`resolve` events. The interpreter assigns each open a fresh match
// id and lets resolves reference a PRIOR open by index, so multiple bets are live
// (escrow accumulates across players) before being settled/refunded — exercising the
// I9 escrow-backed invariant + the open→settle/refund conservation. k ≥ 2.
export function betEventsArbitrary(fc, k) {
  const idx = fc.nat({ max: k - 1 });
  const ev = fc.oneof(
    fc.record({ type: fc.constant('open'), ai: idx, bj: fc.integer({ min: 1, max: Math.max(1, k - 1) }), stake: fc.integer({ min: 1, max: 3 }) }),
    fc.record({ type: fc.constant('resolve'), ref: fc.nat({ max: 40 }), kind: fc.constantFrom('settle', 'refund'), winner: fc.constantFrom('a', 'b') }),
  );
  return fc.record({
    initEarned: fc.array(fc.double({ min: 0, max: 12, noNaN: true }), { minLength: k, maxLength: k }),
    events: fc.array(ev, { maxLength: 30 }),
  });
}

// Interpret a bet plan into a flat reducer op[] (Layer A and B share this verbatim).
export function interpretBetEvents(sids, plan) {
  const k = sids.length;
  const ops = [];
  const opened = [];            // { match, a, b } in open order
  let counter = 0;
  for (const e of (plan.events || [])) {
    if (e.type === 'open') {
      const a = sids[e.ai % k];
      const b = sids[(e.ai + e.bj) % k];   // bj ∈ [1, k-1] ⇒ b ≠ a
      const match = 'm' + (counter++);
      ops.push({ op: 'betOpen', match, a, b, stake: e.stake });
      opened.push({ match, a, b });
    } else {
      if (!opened.length) continue;
      const m = opened[e.ref % opened.length];
      if (e.kind === 'settle') ops.push({ op: 'betSettle', match: m.match, winner: e.winner === 'a' ? m.a : m.b });
      else ops.push({ op: 'betRefund', match: m.match });
    }
  }
  return ops;
}

// Resolve an index-based op (from the generator) to a sid-based op for the reducer.
export function resolveOp(sids, raw) {
  const sid = sids[raw.i % sids.length];
  switch (raw.op) {
    case 'earn': return { op: 'earn', sid, candy: raw.candy };
    case 'buy': return { op: 'buy', sid, candy: raw.candy, price: raw.price, ageHours: raw.ageHours };
    case 'sell': return { op: 'sell', sid, doge: raw.doge, price: raw.price, holdHours: SELL_HOLD_HOURS };
    case 'gift': {
      const to = sids[(raw.i + 1 + (raw.j % (sids.length - 1 || 1))) % sids.length];
      return { op: 'gift', from: sid, to, candy: raw.candy };
    }
    case 'markGiven': return { op: 'markGiven', sid, amount: raw.amount };
    case 'markSent': return { op: 'markSent', sid, amount: raw.amount };
    default: return { op: 'noop' };
  }
}
