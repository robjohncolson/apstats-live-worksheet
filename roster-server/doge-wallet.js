// doge-wallet.js — DOGE Effort Wallet routes (DOGE_WALLET_SPEC, Phase 2).
//
// Student earns CANDY (effort, from the ledger) → eats it (consumed) or buys
// DOGE at the server's LIVE price (candy→DOGE floats). Custodial-tracked balances
// here; the real on-chain send to the kid's paper-wallet address is Phase 3 (the
// teacher marks DOGE "sent" once deposited). The spending key never touches this
// server — these routes only track who is owed what.
//
// All routes 503 gracefully until migration 0019 runs (doge_account/doge_ledger).

import { requireTeacher } from './teacher-auth.js';
import {
  computeEffort, candyPerDoge, dogeFromCandy, candyFromDoge,
  MIN_MATERIALIZE_DOGE, DAILY_GIFT_CAP, SELL_HOLD_HOURS,
} from './doge-econ.js';
import { fetchChainBalance as defaultChainFetch, detectNetwork, DOGE_MAIN_RE } from './doge-chain.js';

function extractToken(req) {
  const h = req.headers['authorization'] || req.headers['Authorization'];
  if (typeof h === 'string' && /^Bearer\s+/i.test(h)) return h.replace(/^Bearer\s+/i, '').trim() || null;
  if (typeof req.query.token === 'string' && req.query.token) return req.query.token;
  return null;
}

// Migration 0019 not run yet → Postgres 42P01 / PostgREST PGRST205 schema-cache miss.
function isDogeMissing(e) {
  if (!e) return false;
  const code = String(e.code || '');
  const msg = String(e.message || '').toLowerCase();
  // 42P01 undefined_table, 42883 undefined_function (doge_spend pre-0019),
  // PGRST205 schema-cache miss (table), PGRST202 function-not-found.
  if (['42P01', '42883', 'PGRST205', 'PGRST202'].includes(code)) return true;
  return (msg.includes('doge_account') || msg.includes('doge_ledger') || msg.includes('doge_spend'))
    && (msg.includes('schema cache') || msg.includes('does not exist') || msg.includes('could not find'));
}
function notProvisioned(res) {
  return res.status(503).json({ ok: false, error: 'doge_wallet not provisioned (run migration 0019)' });
}

const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };

// Teacher routes take a studentId from the body. A malformed (non-uuid) id would
// otherwise reach Postgres and raise 22P02 (not caught by isDogeMissing) → a bare
// 500. Guard the shape so bad input is a clean 404 instead of a leaked DB error.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const badId = (id) => typeof id !== 'string' || !UUID_RE.test(id.trim());

// Map a watch-only chain record (doge-chain.js) → the cache columns (migration 0020).
function chainColumns(rec) {
  return {
    chain_doge: num(rec.confirmedDoge),
    chain_unconfirmed: num(rec.unconfirmedDoge),
    chain_tx_count: num(rec.txCount),
    chain_synced_at: rec.syncedAt || new Date().toISOString(),
  };
}
// Reverse of chainColumns: a stored cache row (migration 0020) → a watch-only
// record, served STALE when the LIVE explorer read fails so a cold start / outage
// still shows the last good balance. Null when nothing is cached (pre-0020 or
// never synced) — the caller then returns the live error record.
function chainFromRow(addr, a) {
  if (!a || a.chain_synced_at == null) return null;
  return {
    address: addr, network: detectNetwork(addr),
    confirmedDoge: num(a.chain_doge), unconfirmedDoge: num(a.chain_unconfirmed),
    txCount: num(a.chain_tx_count), source: 'cache', syncedAt: a.chain_synced_at,
    stale: true, cached: true,
  };
}

// ── live DOGE/USD price (server-side, cached ~5 min) ─────────────────────────
let _price = { usd: null, ts: 0 };
async function getDogePrice() {
  if (_price.usd && (Date.now() - _price.ts) < 300000) return _price.usd;
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=dogecoin&vs_currencies=usd');
    if (r && r.ok) {
      const d = await r.json();
      const usd = d && d.dogecoin && d.dogecoin.usd;
      if (typeof usd === 'number' && usd > 0) { _price = { usd, ts: Date.now() }; return usd; }
    }
  } catch (_) { /* fall through to stale */ }
  return _price.usd; // may be null if never fetched
}

export function mountDogeWallet(app, { db, ledgerDb, verifyToken, getPrice, fetchChainBalance }) {
  const priceFn = getPrice || getDogePrice;            // injectable for tests
  const chainFetch = fetchChainBalance || defaultChainFetch;   // watch-only; injectable for tests
  const sidOf = (req) => { const t = extractToken(req); try { return t ? verifyToken(t) : null; } catch (_) { return null; } };

  // Resolve roster student_ids for an optional ?section= filter. Returns null
  // (= no filter, all students) when no section is given, [] when the section is
  // empty, or { error } to propagate a DB problem.
  async function sectionIds(section) {
    if (!section) return null;
    const rr = await db.listRoster(section);
    if (rr && rr.error) return { error: rr.error };
    return ((rr && rr.data) || []).map((r) => r.student_id);
  }
  // Small concurrency-capped runner so a class chain refresh (~30 addresses)
  // stays well under the explorer free-tier rate ceiling.
  async function mapLimit(items, limit, fn) {
    let i = 0;
    async function worker() { while (i < items.length) { const idx = i++; await fn(items[idx], idx); } }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  }

  // Earned candy (from the ledger) + the stored account.
  async function loadState(sid) {
    let rows = [];
    try { const r = await ledgerDb.getLedgerByStudent(sid); rows = (r && r.data) || []; } catch (_) {}
    const earned = computeEffort(rows);                 // { points, candy }
    const accRes = await db.getDogeAccount(sid);        // { data, error }
    return { earned, accRes };
  }
  function deriveBalances(earned, acc) {
    const a = acc || {};
    const giftedOut = num(a.candy_gifted_out);   // Gifted: candy sent to classmates (0 pre-migration-0021)
    const giftedIn = num(a.candy_gifted_in);     // Received: candy received from classmates
    const converted = num(a.doge_cost_basis);    // Converted: candy turned into DOGE
    const materialized = num(a.candy_given);     // Materialized: real candy the teacher handed over
    const realized = num(a.candy_realized);      // Realized: net P&L from cashing DOGE back to candy (signed; 0 pre-0023)
    // CANDY_LEDGER_SPEC + SELL_DOGE_SPEC — the (now 7-) number model. The "eat" opt-in is
    // RETIRED: the spendable pool a student can still gift/convert IS the un-realized (Owed)
    // candy, so spendable subtracts MATERIALIZED (candy_given), not the old candy_eaten, and
    // ADDS realized cash-out P&L. Hence candyBalance === candyOwed (you can't gift candy you've
    // already been handed). Identity: Earned + Received + Realized = Gifted + Converted + Materialized + Owed.
    const rawBalance = earned.candy + giftedIn - giftedOut - converted - materialized + realized;
    const candyBalance = Math.max(0, rawBalance);
    return {
      candyEarned: earned.candy,                 // Earned (monotonic)
      effortPoints: earned.points,
      candyBalance,
      // Unclamped balance/owed. Normally === candyBalance, but goes NEGATIVE if a
      // receipt-carrying ledger row is deleted AFTER spend/materialize (earned candy
      // drops below gifted+converted+materialized). Surfaced so the wallet/dashboard
      // can flag the reconciliation gap instead of silently showing 0.
      candyBalanceRaw: rawBalance,
      candyEaten: num(a.candy_eaten),            // vestigial (eat retired); kept for audit/back-compat
      candyGiven: materialized,
      candyMaterialized: materialized,           // headline alias for candy_given
      candyGiftedOut: giftedOut,
      candyGiftedIn: giftedIn,
      candyReceived: giftedIn,                   // headline alias
      candyConverted: converted,                 // headline alias for doge_cost_basis (candy units)
      candyRealized: realized,                    // net realized P&L from DOGE cash-outs (signed)
      candyOwed: candyBalance,                    // Earned + Received + Realized − Gifted − Converted − Materialized
      dogeBalance: num(a.doge_balance),
      dogeSent: num(a.doge_sent),
      dogeToDeposit: Math.max(0, num(a.doge_balance) - num(a.doge_sent)), // teacher deposits
      dogeCostBasis: converted,
      dogeAddress: a.doge_address || null,
    };
  }
  // The whole account row for an upsert (numeric fields are totals, not increments).
  function rowFor(acc, over) {
    const a = acc || {};
    return {
      doge_address: a.doge_address || null,
      candy_eaten: num(a.candy_eaten),
      candy_given: num(a.candy_given),
      doge_balance: num(a.doge_balance),
      doge_sent: num(a.doge_sent),
      doge_cost_basis: num(a.doge_cost_basis),
      ...over,
    };
  }

  // ── GET /wallet ── the student's own wallet ────────────────────────────────
  app.get('/wallet', async (req, res) => {
    const sid = sidOf(req);
    if (!sid) return res.status(401).json({ ok: false, error: 'forbidden' });
    const { earned, accRes } = await loadState(sid);
    if (accRes.error) {
      if (isDogeMissing(accRes.error)) return notProvisioned(res);
      console.error('GET /wallet DB error:', accRes.error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    const bal = deriveBalances(earned, accRes.data);
    const price = await priceFn();
    let history = [];
    try { const h = await db.listDogeLedger(sid, 50); history = (h && h.data) || []; } catch (_) {}
    // In-app DOGE the kid can cash back to candy now (matured ≥ overnight; SELL_DOGE_SPEC).
    const sellableDoge = bal.dogeBalance > 1e-9 ? await maturedSellable(sid, accRes.data) : 0;
    return res.json({
      ok: true, ...bal,
      dogeUsd: price, candyPerDoge: price ? candyPerDoge(price) : null,
      minBuyCandy: 0,            // no buy minimum (s16): any positive candy converts to a fraction of a DOGE
      minMaterializeDoge: MIN_MATERIALIZE_DOGE, sellableDoge, history,
    });
  });

  // ── GET /wallet/chain ── the student's OWN on-chain (watch-only) balance ─────
  // Reads the kid's registered address off the chain (no key, no spend) so they
  // can watch the teacher's real DOGE land. Works with migration 0019 + a
  // registered address; the cache write-back needs 0020 but is best-effort.
  app.get('/wallet/chain', async (req, res) => {
    const sid = sidOf(req);
    if (!sid) return res.status(401).json({ ok: false, error: 'forbidden' });
    const accRes = await db.getDogeAccount(sid);
    if (accRes.error) {
      if (isDogeMissing(accRes.error)) return notProvisioned(res);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    const addr = accRes.data && accRes.data.doge_address;
    if (!addr) return res.json({ ok: true, address: null });
    const rec = await chainFetch(addr);
    if (rec && !rec.error && db.updateDogeChain) { try { await db.updateDogeChain(sid, chainColumns(rec)); } catch (_) {} }
    // Explorer down → serve the last cached read (migration 0020), else the error.
    if (rec && rec.error) { const fb = chainFromRow(addr, accRes.data); if (fb) return res.json({ ok: true, ...fb }); }
    return res.json({ ok: true, ...rec });
  });

  // earned candy from the ledger (no doge_account dependency).
  async function earnedCandyOf(sid) {
    let rows = [];
    try { const r = await ledgerDb.getLedgerByStudent(sid); rows = (r && r.data) || []; } catch (_) {}
    return computeEffort(rows);
  }

  // In-app DOGE a student may cash back RIGHT NOW (SELL_DOGE_SPEC). FIFO maturity:
  // matured-bought (buy legs ≥ SELL_HOLD_HOURS old) − sold-back − sent, capped at the
  // un-sent in-app balance (doge_balance − doge_sent; on-chain coins can't be reclaimed).
  // This is the friendly preview/UI figure — doge_sell re-enforces the same gate atomically.
  async function maturedSellable(sid, acc) {
    const a = acc || {};
    const inApp = Math.max(0, num(a.doge_balance) - num(a.doge_sent));
    if (inApp <= 1e-9) return 0;
    const cutoff = Date.now() - SELL_HOLD_HOURS * 3600 * 1000;
    let rows = [];
    try { const r = await db.dogeCoinFlows(sid); rows = (r && r.data) || []; } catch (e) { console.error('maturedSellable dogeCoinFlows:', e); return 0; }
    let maturedBought = 0, sold = 0;
    for (const r of rows) {
      if (r.kind === 'buy_doge') { if (new Date(r.ts).getTime() <= cutoff) maturedBought += num(r.doge_delta); }
      else if (r.kind === 'sell_doge') { sold += Math.abs(num(r.doge_delta)); }
    }
    return Math.max(0, Math.min(inApp, maturedBought - sold - num(a.doge_sent)));
  }

  // ── POST /wallet/eat ── RETIRED (CANDY_LEDGER_SPEC) ─────────────────────────
  // The "eat" opt-in is gone: candy you don't gift or convert is simply Owed, and the
  // teacher materializes it (mark-given). Kept as a no-op so a stale client call returns
  // the wallet instead of erroring; it no longer writes candy_eaten.
  app.post('/wallet/eat', async (req, res) => {
    const sid = sidOf(req);
    if (!sid) return res.status(401).json({ ok: false, error: 'forbidden' });
    const { earned, accRes } = await loadState(sid);
    if (accRes.error) { if (isDogeMissing(accRes.error)) return notProvisioned(res); return res.status(500).json({ ok: false, error: 'Database error' }); }
    return res.json({ ok: true, deprecated: true, ...deriveBalances(earned, accRes.data) });
  });

  // ── POST /wallet/buy-doge ── convert candy → DOGE at the live price ─────────
  // NOTE (custodial price-window, DOGE_WALLET_SPEC §3): coins are priced HERE at
  // buy-time, but the teacher funds/sends them LATER (mark-sent / doge-send.mjs).
  // The $300 budget caps candy-dollars forgone, NOT the coin-dollar cost at
  // deposit — if DOGE rises between buy and send, sourcing the banked coins costs
  // more. Mitigation: deposit promptly, or hold a DOGE float bought near buy-time.
  app.post('/wallet/buy-doge', async (req, res) => {
    const sid = sidOf(req);
    if (!sid) return res.status(401).json({ ok: false, error: 'forbidden' });
    const candy = num(req.body && req.body.candy);
    // NO buy minimum (user 2026-06-17): even 1 candy buys a fraction of a DOGE. The only floor is
    // candy > 0; the atomic SQL guard caps it at the student's spendable candy. (On-chain dust is
    // still prevented separately by the 5-DOGE materialize threshold — in-app buys never touch the chain.)
    if (!(candy > 0)) return res.status(400).json({ ok: false, error: 'enter how much candy to convert' });
    const price = await priceFn();
    if (!price) return res.status(503).json({ ok: false, error: 'DOGE price unavailable' });
    const cpd = candyPerDoge(price);
    const coins = dogeFromCandy(candy, price);
    const earned = await earnedCandyOf(sid);
    // ATOMIC guard+debit: banks coins + cost_basis in one UPDATE, stamping the price.
    const r = await db.dogeSpend({ p_sid: sid, p_earned: earned.candy, p_candy: candy, p_kind: 'buy_doge', p_doge: coins, p_price: price, p_cpd: cpd });
    if (r.error) { if (isDogeMissing(r.error)) return notProvisioned(res); console.error('POST /wallet/buy-doge:', r.error); return res.status(500).json({ ok: false, error: 'Database error' }); }
    if (!r.data || !r.data.student_id) return res.status(400).json({ ok: false, error: 'not enough candy' });
    return res.json({ ok: true, ...deriveBalances(earned, r.data), boughtCoins: coins, candyPerDoge: cpd, dogeUsd: price });
  });

  // ── POST /wallet/sell-doge ── cash IN-APP DOGE back to candy at the live rate ──
  // The REVERSE of buy-doge (reverses DOGE_WALLET_SPEC #4 ON PURPOSE; SELL_DOGE_SPEC). A
  // student realizes an appreciation gain: held DOGE is worth more candy than it cost. HONEST
  // P&L — payout = coins × liveRate regardless of cost basis, so a fallen coin returns less.
  // Guards: only un-sent, in-app coins held ≥ SELL_HOLD_HOURS are sellable (on-chain coins are
  // self-custodied and can't be reclaimed; the overnight hold kills 5-min-window churn). UNCAPPED
  // — backed by the teacher's real node DOGE appreciating in parallel. doge_sell re-enforces both
  // guards atomically under a row lock; the JS checks here are the friendly-error / preview path.
  app.post('/wallet/sell-doge', async (req, res) => {
    // Kill-switch (default ON), same falsey-spelling handling as gifting.
    const sellOff = ['false', '0', 'no', 'off'].includes(String(process.env.BUYBACK_ENABLED || 'true').trim().toLowerCase());
    if (sellOff) return res.status(403).json({ ok: false, error: 'cash-out is turned off' });
    const sid = sidOf(req);
    if (!sid) return res.status(401).json({ ok: false, error: 'forbidden' });
    const doge = num(req.body && req.body.doge);
    if (!(doge > 0)) return res.status(400).json({ ok: false, error: 'enter how much DOGE to cash out' });
    const price = await priceFn();
    if (!price) return res.status(503).json({ ok: false, error: 'DOGE price unavailable' });
    const rate = candyPerDoge(price);
    const accRes = await db.getDogeAccount(sid);
    if (accRes.error) { if (isDogeMissing(accRes.error)) return notProvisioned(res); console.error('POST /wallet/sell-doge load:', accRes.error); return res.status(500).json({ ok: false, error: 'Database error' }); }
    // Maturity gate (friendly message). The SQL doge_sell re-checks this on the live row.
    const sellable = await maturedSellable(sid, accRes.data || {});
    if (doge > sellable + 1e-9) {
      return res.status(400).json({ ok: false, error: sellable > 1e-9
        ? 'you can cash out ' + (Math.round(sellable * 10) / 10) + ' Ɖ right now (the rest unlocks ~a day after you buy)'
        : 'no DOGE ready to cash out yet — it unlocks ~a day after you buy' });
    }
    const earned = await earnedCandyOf(sid);
    // ATOMIC guard+unwind: un-sent + matured check, decrement balance/cost-basis, book P&L.
    const r = await db.dogeSell({ p_sid: sid, p_doge: doge, p_rate: rate, p_price: price, p_hold_hours: SELL_HOLD_HOURS });
    if (r.error) { if (isDogeMissing(r.error)) return notProvisioned(res); console.error('POST /wallet/sell-doge:', r.error); return res.status(500).json({ ok: false, error: 'Database error' }); }
    if (!r.data || !r.data.student_id) return res.status(400).json({ ok: false, error: 'not enough DOGE' });
    return res.json({ ok: true, ...deriveBalances(earned, r.data), soldCoins: doge, candyReturned: candyFromDoge(doge, price), candyPerDoge: rate, dogeUsd: price });
  });

  // ── POST /wallet/gift ── send candy to a classmate (free in-app ledger move) ──
  // Custodial within the app, so a transfer is just a guarded debit+credit — no
  // on-chain tx, no fee. Guardrails: whole candy, same section, not self, rolling
  // 24h cap, teacher kill-switch. The earned/effort metric is untouched (a gift
  // moves SPENDABLE candy, not earned credit). DOGE_GIFTING_SPEC.
  app.post('/wallet/gift', async (req, res) => {
    // Kill-switch (default ON). Accept the common falsey spellings so an emergency
    // class-wide disable can't silently fail on GIFTING_ENABLED=0/FALSE/no/off.
    const giftingOff = ['false', '0', 'no', 'off'].includes(String(process.env.GIFTING_ENABLED || 'true').trim().toLowerCase());
    if (giftingOff) return res.status(403).json({ ok: false, error: 'gifting is turned off' });
    const sid = sidOf(req);
    if (!sid) return res.status(401).json({ ok: false, error: 'forbidden' });
    // Recipient is picked by their PUBLIC username (the roster endpoint never
    // exposes student_ids); resolve it to a student_id + section server-side.
    const toUsername = String((req.body && req.body.toUsername) || '').trim();
    const candy = num(req.body && req.body.candy);
    if (!toUsername) return res.status(400).json({ ok: false, error: 'toUsername required' });
    if (!Number.isInteger(candy) || candy <= 0) return res.status(400).json({ ok: false, error: 'candy must be a whole number > 0' });
    const themRes = await db.findByUsername(toUsername);
    // Split a real DB outage (→ 500 + log) from a genuine no-such-user (→ 404),
    // instead of reporting an outage as "unknown classmate". (.single() → PGRST116 on no row.)
    if (themRes && themRes.error && themRes.error.code !== 'PGRST116') {
      console.error('POST /wallet/gift findByUsername:', themRes.error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    if (!themRes || !themRes.data) return res.status(404).json({ ok: false, error: 'unknown classmate' });
    const toStudentId = themRes.data.student_id;
    if (toStudentId === sid) return res.status(400).json({ ok: false, error: "can't gift yourself" });
    // Only an active student is a valid recipient — never the teacher account
    // (which self-signs into the same section) nor an archived row.
    if (themRes.data.role === 'teacher' || (themRes.data.status && themRes.data.status !== 'active')) {
      return res.status(400).json({ ok: false, error: 'can only gift a classmate' });
    }
    // Same-section only (a classroom economy, not school-wide).
    const meRes = await db.findByStudentId(sid);
    if (!meRes || meRes.error || !meRes.data) return res.status(500).json({ ok: false, error: 'Database error' });
    if (meRes.data.section !== themRes.data.section) return res.status(404).json({ ok: false, error: 'not in your class' });
    // Rolling 24h cap on candy gifted OUT (anti-farming/coercion). The JS check
    // gives a friendly 429 in the common case; the SAME cap is re-enforced inside
    // doge_gift() under a row lock (p_cap), so a concurrent burst can't exceed it.
    const since = new Date(Date.now() - 86400000).toISOString();
    const g = await db.dogeGiftedSince(sid, since);
    if (g && g.error) { if (isDogeMissing(g.error)) return notProvisioned(res); return res.status(500).json({ ok: false, error: 'Database error' }); }
    const giftedToday = ((g && g.data) || []).reduce((s, r) => s + Math.abs(num(r.candy_delta)), 0);
    if (giftedToday + candy > DAILY_GIFT_CAP) return res.status(429).json({ ok: false, error: 'daily gift limit (' + DAILY_GIFT_CAP + ' candy/day)' });
    // Atomic guarded debit+credit (doge_gift RPC) — guards spendable AND the cap.
    const earned = await earnedCandyOf(sid);
    const r = await db.dogeGift({ p_from: sid, p_to: toStudentId, p_candy: candy, p_earned_from: earned.candy, p_cap: DAILY_GIFT_CAP });
    if (r.error) { if (isDogeMissing(r.error)) return notProvisioned(res); console.error('POST /wallet/gift:', r.error); return res.status(500).json({ ok: false, error: 'Database error' }); }
    if (!r.data || !r.data.student_id) return res.status(400).json({ ok: false, error: 'not enough candy' });
    return res.json({ ok: true, ...deriveBalances(earned, r.data), giftedTo: themRes.data.real_name || toUsername });
  });

  // ── teacher: register a kid's paper-wallet address ─────────────────────────
  app.post('/wallet/address', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });
    const { studentId, address } = req.body || {};
    if (!studentId) return res.status(400).json({ ok: false, error: 'studentId required' });
    if (badId(studentId)) return res.status(404).json({ ok: false, error: 'unknown student' });
    const addr = String(address || '').trim();
    if (addr && !DOGE_MAIN_RE.test(addr)) {
      return res.status(400).json({ ok: false, error: 'not a Dogecoin (D…) address' });
    }
    const accRes = await db.getDogeAccount(studentId);
    if (accRes.error && !isDogeMissing(accRes.error)) return res.status(500).json({ ok: false, error: 'Database error' });
    const up = await db.upsertDogeAccount(studentId, rowFor(accRes.data, { doge_address: addr || null }));
    if (up.error) { if (isDogeMissing(up.error)) return notProvisioned(res); return res.status(500).json({ ok: false, error: 'Database error' }); }
    return res.json({ ok: true, studentId, dogeAddress: addr || null });
  });

  // ── teacher: mark candy physically GIVEN / DOGE SENT (disbursement done) ────
  async function markEndpoint(req, res, field) {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });
    const { studentId } = req.body || {};
    const amount = num(req.body && req.body.amount);
    if (!studentId || amount <= 0) return res.status(400).json({ ok: false, error: 'studentId + amount required' });
    if (badId(studentId)) return res.status(404).json({ ok: false, error: 'unknown student' });
    const accRes = await db.getDogeAccount(studentId);
    if (accRes.error) { if (isDogeMissing(accRes.error)) return notProvisioned(res); return res.status(500).json({ ok: false, error: 'Database error' }); }
    const acc = accRes.data || {};
    // Clamp so a teacher fat-finger can't over-mark, and so Materialized never exceeds
    // what's actually owed:
    //   • doge_sent   ≤ doge_balance (banked coins; also bounds an idempotent
    //     double-mark-sent from the Phase-3 sender after a crash).
    //   • candy_given ≤ Owed-eligible = Earned + Received − Gifted − Converted
    //     (CANDY_LEDGER_SPEC; the "eat" opt-in is retired, so the cap is no longer
    //     candy_eaten). Needs the live effort total, hence earnedCandyOf here.
    let cap;
    if (field === 'doge_sent') {
      cap = num(acc.doge_balance);
    } else {
      // The cap deliberately OMITS candy_given: it's the ceiling that the running
      // candy_given total is clamped against, and candy_given ≤ cap is exactly the
      // Owed ≥ 0 invariant (Owed = cap − candy_given). Subtracting candy_given here
      // would wrongly prevent the teacher from ever fully materializing.
      const earned = await earnedCandyOf(studentId);
      cap = earned.candy + num(acc.candy_gifted_in) - num(acc.candy_gifted_out) - num(acc.doge_cost_basis) + num(acc.candy_realized);
    }
    // Never reduce a monotonic counter: if cap dips below the current value (e.g. during
    // the pre-0022 transition), leave it unchanged rather than clawing candy back.
    const newVal = Math.max(num(acc[field]), Math.min(num(acc[field]) + amount, cap));
    const up = await db.upsertDogeAccount(studentId, rowFor(acc, { [field]: newVal }));
    if (up.error) { if (isDogeMissing(up.error)) return notProvisioned(res); return res.status(500).json({ ok: false, error: 'Database error' }); }
    try { await db.insertDogeLedger({ student_id: studentId, kind: field === 'candy_given' ? 'give' : 'send', candy_delta: field === 'candy_given' ? -(newVal - num(acc[field])) : 0, doge_delta: field === 'doge_sent' ? -(newVal - num(acc[field])) : 0 }); } catch (_) {}
    return res.json({ ok: true, studentId, [field]: newVal });
  }
  app.post('/wallet/mark-given', (req, res) => markEndpoint(req, res, 'candy_given'));
  app.post('/wallet/mark-sent', (req, res) => markEndpoint(req, res, 'doge_sent'));

  // ── teacher: GET /class/wallets ── accounts (joined with effort on the client) ─
  // Optional ?section= scopes to one roster section (like /class/grades); omitted
  // returns every account.
  app.get('/class/wallets', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });
    const section = (req.query.section && String(req.query.section).trim()) || null;
    const ids = await sectionIds(section);
    if (ids && ids.error) { if (isDogeMissing(ids.error)) return notProvisioned(res); return res.status(500).json({ ok: false, error: 'Database error' }); }
    const price = await priceFn();
    if (Array.isArray(ids) && !ids.length) return res.json({ ok: true, accounts: [], dogeUsd: price, candyPerDoge: price ? candyPerDoge(price) : null });
    const r = await db.listDogeAccounts(ids || undefined);
    if (r && r.error) { if (isDogeMissing(r.error)) return notProvisioned(res); return res.status(500).json({ ok: false, error: 'Database error' }); }
    // CANDY_LEDGER_SPEC: return the full 6-number ledger so the dashboard has a ready
    // Owed worklist without a client-side effort join. Earned is recomputed per student
    // (parallel; this is a cold teacher path) so candyOwed is the true
    // Earned + Received − Gifted − Converted − Materialized.
    const accounts = await Promise.all(((r && r.data) || []).map(async (a) => {
      const earned = await earnedCandyOf(a.student_id);
      const materialized = num(a.candy_given), giftedOut = num(a.candy_gifted_out);
      const giftedIn = num(a.candy_gifted_in), converted = num(a.doge_cost_basis);
      const realized = num(a.candy_realized);
      return {
        studentId: a.student_id,
        dogeAddress: a.doge_address || null,
        candyEarned: earned.candy,
        candyEaten: num(a.candy_eaten),
        candyGiven: materialized, candyMaterialized: materialized,
        candyGiftedOut: giftedOut, candyGiftedIn: giftedIn, candyReceived: giftedIn,
        candyConverted: converted, candyRealized: realized,
        candyOwed: Math.max(0, earned.candy + giftedIn - giftedOut - converted - materialized + realized),
        dogeBalance: num(a.doge_balance), dogeSent: num(a.doge_sent),
        dogeToDeposit: Math.max(0, num(a.doge_balance) - num(a.doge_sent)),
        dogeCostBasis: converted,
      };
    }));
    return res.json({ ok: true, accounts, dogeUsd: price, candyPerDoge: price ? candyPerDoge(price) : null });
  });

  // ── teacher: GET /class/wallets/chain ── watch-only on-chain balances ────────
  // Batch-reads every registered address off the chain so the dashboard shows
  // real deposits landing. Optional ?section= scope. Live-fetch each call (cached
  // ~1 min in doge-chain.js); best-effort cache write-back per migration 0020.
  app.get('/class/wallets/chain', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });
    const section = (req.query.section && String(req.query.section).trim()) || null;
    const ids = await sectionIds(section);
    if (ids && ids.error) { if (isDogeMissing(ids.error)) return notProvisioned(res); return res.status(500).json({ ok: false, error: 'Database error' }); }
    if (Array.isArray(ids) && !ids.length) return res.json({ ok: true, addresses: {} });
    const r = await db.listDogeAccounts(ids || undefined);
    if (r && r.error) { if (isDogeMissing(r.error)) return notProvisioned(res); return res.status(500).json({ ok: false, error: 'Database error' }); }
    const withAddr = ((r && r.data) || []).filter((a) => a.doge_address);
    const addresses = {};
    try {
      await mapLimit(withAddr, 4, async (a) => {
        const rec = await chainFetch(a.doge_address);
        if (rec && !rec.error && db.updateDogeChain) { try { await db.updateDogeChain(a.student_id, chainColumns(rec)); } catch (_) {} }
        // Explorer down → fall back to the stored cache row (already on `a`).
        addresses[a.student_id] = (rec && rec.error) ? (chainFromRow(a.doge_address, a) || rec) : rec;
      });
    } catch (e) {
      console.error('GET /class/wallets/chain mapLimit:', e);   // best-effort: return whatever resolved
    }
    return res.json({ ok: true, addresses });
  });
}
