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
  computeEffort, candyPerDoge, dogeFromCandy, MIN_CONVERSION_CANDY,
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
    const rawBalance = earned.candy - num(a.candy_eaten) - num(a.doge_cost_basis);
    const candyBalance = Math.max(0, rawBalance);
    return {
      candyEarned: earned.candy,
      effortPoints: earned.points,
      candyBalance,
      // Unclamped balance. Normally === candyBalance, but goes NEGATIVE if a
      // receipt-carrying ledger row is deleted AFTER the student spent (earned
      // candy drops below candy_eaten + cost_basis). Surfaced so the wallet/
      // dashboard can flag the reconciliation gap instead of silently showing 0.
      candyBalanceRaw: rawBalance,
      candyEaten: num(a.candy_eaten),
      candyGiven: num(a.candy_given),
      candyOwed: Math.max(0, num(a.candy_eaten) - num(a.candy_given)),   // teacher hands out
      dogeBalance: num(a.doge_balance),
      dogeSent: num(a.doge_sent),
      dogeToDeposit: Math.max(0, num(a.doge_balance) - num(a.doge_sent)), // teacher deposits
      dogeCostBasis: num(a.doge_cost_basis),
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
    return res.json({
      ok: true, ...bal,
      dogeUsd: price, candyPerDoge: price ? candyPerDoge(price) : null,
      minBuyCandy: MIN_CONVERSION_CANDY, history,
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

  // ── POST /wallet/eat ── consume candy (teacher hands out the physical candy) ─
  app.post('/wallet/eat', async (req, res) => {
    const sid = sidOf(req);
    if (!sid) return res.status(401).json({ ok: false, error: 'forbidden' });
    const candy = num(req.body && req.body.candy);
    if (candy <= 0) return res.status(400).json({ ok: false, error: 'candy must be > 0' });
    const earned = await earnedCandyOf(sid);
    // ATOMIC guard+debit (doge_spend RPC) — no read-modify-write race.
    const r = await db.dogeSpend({ p_sid: sid, p_earned: earned.candy, p_candy: candy, p_kind: 'eat' });
    if (r.error) { if (isDogeMissing(r.error)) return notProvisioned(res); console.error('POST /wallet/eat:', r.error); return res.status(500).json({ ok: false, error: 'Database error' }); }
    if (!r.data || !r.data.student_id) return res.status(400).json({ ok: false, error: 'not enough candy' });
    return res.json({ ok: true, ...deriveBalances(earned, r.data) });
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
    if (candy < MIN_CONVERSION_CANDY) return res.status(400).json({ ok: false, error: 'minimum ' + MIN_CONVERSION_CANDY + ' candy' });
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
    // Clamp so a teacher fat-finger can't over-mark: candy_given ≤ candy_eaten,
    // doge_sent ≤ doge_balance. (Also bounds an idempotent double-mark-sent from
    // the Phase-3 sender after a crash — doge_sent never exceeds what was banked.)
    const cap = field === 'doge_sent' ? num(acc.doge_balance) : num(acc.candy_eaten);
    const newVal = Math.min(num(acc[field]) + amount, cap);
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
    const accounts = ((r && r.data) || []).map((a) => ({
      studentId: a.student_id,
      dogeAddress: a.doge_address || null,
      candyEaten: num(a.candy_eaten), candyGiven: num(a.candy_given),
      candyOwed: Math.max(0, num(a.candy_eaten) - num(a.candy_given)),
      dogeBalance: num(a.doge_balance), dogeSent: num(a.doge_sent),
      dogeToDeposit: Math.max(0, num(a.doge_balance) - num(a.doge_sent)),
      dogeCostBasis: num(a.doge_cost_basis),
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
