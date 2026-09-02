// pg-wallet.js — Layer B loader (WALLET_CONSERVATION_AUDIT_SPEC.md §2 Layer B).
// Spins an in-process REAL Postgres (@electric-sql/pglite, WASM — no Docker) with
// minimal `roster`/`item_ledger` tables + the ACTUAL wallet migrations through
// 0034,
// then exposes thin wrappers that call the REAL plpgsql functions (doge_spend /
// doge_gift / doge_sell). The differential harness diffs these against the JS
// reducer in tests/fixtures/wallet-world.js. THIS is the layer that catches a
// formula bug copied into both the in-memory fake AND the SQL.
//
// pglite ships the default `plpgsql` language, so the migrations load verbatim.
// One db is created per suite (createWalletDb) and TRUNCATEd between trajectories
// (resetWallet) — far cheaper than a fresh WASM Postgres per fast-check run.

import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migDir = resolve(__dirname, '..', '..', 'migrations');
const BASE_MIGRATIONS = [
  '0019_doge_wallet.sql',
  '0021_doge_gifting.sql',
  '0022_retire_candy_eaten.sql',
  '0023_doge_sell.sql',
  '0024_tetris_stakes.sql',
  '0025_review_marks.sql',
];
const CANDY_RETURN_MIGRATION = '0034_candy_return.sql';

// Create the db, a minimal roster (the doge_account/doge_ledger FK target), seed
// the given student_ids, and run the real wallet migrations in order. Tests that
// exercise a later production migration before 0034 can opt out, apply that
// migration, then apply 0034 themselves.
export async function createWalletDb(sids, { includeCandyReturn = true } = {}) {
  const db = new PGlite();
  await db.exec(`create table roster (
    student_id uuid primary key, section text default 'PeriodB',
    role text default 'student', status text default 'active',
    real_name text, username text
  );`);
  // 0025 references only item_ledger.ledger_id; the conservation fixture does
  // not need the rest of the production effort-ledger schema.
  await db.exec('create table item_ledger (ledger_id uuid primary key default gen_random_uuid());');
  for (const sid of sids) {
    await db.query(`insert into roster (student_id, username) values ($1, $2) on conflict do nothing`, [sid, 'u' + sid.slice(-4)]);
  }
  for (const f of BASE_MIGRATIONS) await db.exec(await readFile(resolve(migDir, f), 'utf8'));
  if (includeCandyReturn) {
    await db.exec(await readFile(resolve(migDir, CANDY_RETURN_MIGRATION), 'utf8'));
  }
  return db;
}

// Wipe wallet state between trajectories (roster + the plpgsql functions persist).
export async function resetWallet(db) {
  await db.exec('truncate doge_account, doge_ledger, tetris_bet restart identity');
}

const n = (v) => (v == null ? null : Number(v));

// The persisted doge_account row for a student (NULL before its first write).
export async function pgAccount(db, sid) {
  const r = await db.query('select * from doge_account where student_id = $1', [sid]);
  return r.rows[0] || null;
}

// Call the REAL doge_spend(buy_doge). Returns the function's row — student_id NULL
// signals a guard fail (the production PostgREST "row of nulls" shape).
export async function pgSpend(db, { p_sid, p_earned, p_candy, p_kind, p_doge, p_price, p_cpd }) {
  const r = await db.query('select * from doge_spend($1,$2,$3,$4,$5,$6,$7)',
    [p_sid, p_earned, p_candy, p_kind, p_doge ?? 0, p_price ?? null, p_cpd ?? null]);
  return r.rows[0];
}

// Call the REAL doge_gift. Returns the SENDER's row (student_id NULL on guard fail).
export async function pgGift(db, { p_from, p_to, p_candy, p_earned_from, p_cap }) {
  const r = await db.query('select * from doge_gift($1,$2,$3,$4,$5)',
    [p_from, p_to, p_candy, p_earned_from, p_cap ?? null]);
  return r.rows[0];
}

// Call the REAL doge_sell. Returns the updated row (student_id NULL on guard fail).
export async function pgSell(db, { p_sid, p_doge, p_rate, p_price, p_hold_hours }) {
  const r = await db.query('select * from doge_sell($1,$2,$3,$4,$5)',
    [p_sid, p_doge, p_rate, p_price, p_hold_hours ?? 24]);
  return r.rows[0];
}

// Back-date the student's most recent buy_doge ledger leg by `ageHours` so the
// doge_sell FIFO-maturity gate (ts <= now() - p_hold_hours) sees it as matured.
// Mirrors the real test fixture's "insert buy legs with explicit past ts" approach.
export async function ageLastBuy(db, sid, ageHours) {
  await db.query(
    `update doge_ledger set ts = now() - (($1)::text || ' hours')::interval
       where id = (select max(id) from doge_ledger where student_id = $2 and kind = 'buy_doge')`,
    [ageHours, sid]);
}

// Call the REAL tetris_bet_open (the join handshake; each caller passes only their OWN earned).
export async function pgBetOpen(db, { p_match, p_caller, p_opp, p_stake, p_earned_caller }) {
  const r = await db.query('select tetris_bet_open($1,$2,$3,$4,$5) as s',
    [p_match, p_caller, p_opp, p_stake, p_earned_caller]);
  return r.rows[0].s;
}
// Call the REAL tetris_bet_resolve (report + settle/refund). Returns the status text.
export async function pgBetResolve(db, { p_match, p_reporter, p_winner }) {
  const r = await db.query('select tetris_bet_resolve($1,$2,$3) as s', [p_match, p_reporter, p_winner]);
  return r.rows[0].s;
}
// Call the REAL tetris_bet_refund (the timeout/abort path). Returns the status text.
export async function pgBetRefund(db, p_match) {
  const r = await db.query('select tetris_bet_refund($1) as s', [p_match]);
  return r.rows[0].s;
}
// A bet row (status etc.).
export async function pgBet(db, matchId) {
  const r = await db.query('select * from tetris_bet where match_id = $1', [matchId]);
  return r.rows[0] || null;
}
// Call the REAL doge_mark (atomic teacher disbursement clamp, 0024). Returns the updated row.
export async function pgMark(db, { p_sid, p_field, p_amount, p_earned }) {
  const r = await db.query('select * from doge_mark($1,$2,$3,$4)', [p_sid, p_field, p_amount, p_earned ?? null]);
  return r.rows[0];
}

// Call the REAL doge_give_back (0034). The function locks, clamps to
// candy_given, advances candy_returned monotonically, and writes give_back.
export async function pgGiveBack(db, { p_sid, p_amount }) {
  const r = await db.query('select * from doge_give_back($1,$2)', [p_sid, p_amount]);
  return r.rows[0];
}

export { n as pgNum };
