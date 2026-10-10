// wallet-stakes-gold-premium.test.js — TETRIS_SQUARES_SPEC §3 (migration 0041): the gold premium.
//   SQL (the REAL plpgsql via pglite, migrations 0019…0034 + 0041):
//     escrow 2 per player; both reports name the winner AND both put the winner's gold lines >= 1
//     → the premium moves (winner +2 / loser −2); anything less → the premium is released and only
//     the base stake moves; winner disagreement / timeout → everything refunded; premium 0 (the
//     kill-switch) behaves exactly like 0024/0034; the ledger legs net to the column changes.
//   Routes: STAKES_GOLD_PREMIUM on/off, the pre-0041 fallback, goldClears → p_winner_gold,
//     'settled-premium' → { status: 'settled', premiumPaid: true }.

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWalletDb, resetWallet, pgAccount, pgBet } from './fixtures/pg-wallet.js';
import { mountDogeWallet } from '../doge-wallet.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const num = (v) => Number(v || 0);

async function open(db, match, caller, opp, earned, premium) {
  const r = premium == null
    ? await db.query('select tetris_bet_open($1,$2,$3,$4,$5) as s', [match, caller, opp, 1, earned])
    : await db.query('select tetris_bet_open($1,$2,$3,$4,$5,$6) as s', [match, caller, opp, 1, earned, premium]);
  return r.rows[0].s;
}
async function resolveBet(db, match, reporter, winner, gold) {
  const r = gold === undefined
    ? await db.query('select tetris_bet_resolve($1,$2,$3) as s', [match, reporter, winner])
    : await db.query('select tetris_bet_resolve($1,$2,$3,$4) as s', [match, reporter, winner, gold]);
  return r.rows[0].s;
}
async function cols(db, sid) {
  const a = await pgAccount(db, sid);
  return { escrowed: num(a.candy_escrowed), giftedIn: num(a.candy_gifted_in), giftedOut: num(a.candy_gifted_out) };
}
// The bet legs of the ledger must net to the account's gifted_in − gifted_out (conservation).
async function ledgerNet(db, sid) {
  const r = await db.query("select coalesce(sum(candy_delta), 0) as n from doge_ledger where student_id = $1 and kind like 'bet_%'", [sid]);
  return num(r.rows[0].n);
}

describe('SQL (0041): the gold premium', () => {
  let db;
  beforeAll(async () => {
    db = await createWalletDb([A, B]);
    await db.exec(await readFile(resolve(__dirname, '..', 'migrations', '0041_tetris_gold_premium.sql'), 'utf8'));
  }, 60_000);
  afterAll(async () => { await db.close(); });
  beforeEach(async () => { await resetWallet(db); });

  async function openBoth(match, premium = 1, earned = 5) {
    expect(await open(db, match, A, B, earned, premium)).toBe('waiting');
    expect(await open(db, match, B, A, earned, premium)).toBe('opened');
  }

  it('escrow is 2 per player (1 stake + 1 premium hold)', async () => {
    await openBoth('m1');
    expect((await cols(db, A)).escrowed).toBe(2);
    expect((await cols(db, B)).escrowed).toBe(2);
    expect(num((await pgBet(db, 'm1')).premium)).toBe(1);
  });

  it('both agree on the winner and both report >= 1 gold line → the premium is paid (winner +2, loser −2)', async () => {
    await openBoth('m2');
    expect(await resolveBet(db, 'm2', A, A, 2)).toBe('pending');
    expect(await resolveBet(db, 'm2', B, A, 1)).toBe('settled-premium');
    expect(await cols(db, A)).toEqual({ escrowed: 0, giftedIn: 2, giftedOut: 0 });
    expect(await cols(db, B)).toEqual({ escrowed: 0, giftedIn: 0, giftedOut: 2 });
    expect((await pgBet(db, 'm2')).premium_paid).toBe(true);
    // A late re-report learns the outcome.
    expect(await resolveBet(db, 'm2', A, A, 2)).toBe('settled-premium');
    expect(await ledgerNet(db, A)).toBe(2);
    expect(await ledgerNet(db, B)).toBe(-2);
  });

  it('the loser reports 0 gold for the winner (a disagreement) → premiums refunded, base stake moves', async () => {
    await openBoth('m3');
    await resolveBet(db, 'm3', A, A, 1);
    expect(await resolveBet(db, 'm3', B, A, 0)).toBe('settled');
    expect(await cols(db, A)).toEqual({ escrowed: 0, giftedIn: 1, giftedOut: 0 });
    expect(await cols(db, B)).toEqual({ escrowed: 0, giftedIn: 0, giftedOut: 1 });
    expect((await pgBet(db, 'm3')).premium_paid).toBe(false);
    expect(await ledgerNet(db, A)).toBe(1);
    expect(await ledgerNet(db, B)).toBe(-1);
  });

  it('no gold report at all (an older client) → never pays the premium', async () => {
    await openBoth('m4');
    await resolveBet(db, 'm4', A, A);
    expect(await resolveBet(db, 'm4', B, A)).toBe('settled');
    expect((await cols(db, A)).giftedIn).toBe(1);
    expect((await cols(db, B)).giftedOut).toBe(1);
  });

  it('the winner made no gold clear (both report 0) → premiums refunded', async () => {
    await openBoth('m5');
    await resolveBet(db, 'm5', A, B, 0);
    expect(await resolveBet(db, 'm5', B, B, 0)).toBe('settled');
    expect(await cols(db, B)).toEqual({ escrowed: 0, giftedIn: 1, giftedOut: 0 });
    expect(await cols(db, A)).toEqual({ escrowed: 0, giftedIn: 0, giftedOut: 1 });
  });

  it('a winner disagreement refunds everything (stake + premium), whatever the gold reports say', async () => {
    await openBoth('m6');
    await resolveBet(db, 'm6', A, A, 3);
    expect(await resolveBet(db, 'm6', B, B, 3)).toBe('refunded');
    expect(await cols(db, A)).toEqual({ escrowed: 0, giftedIn: 0, giftedOut: 0 });
    expect(await cols(db, B)).toEqual({ escrowed: 0, giftedIn: 0, giftedOut: 0 });
    expect(await ledgerNet(db, A)).toBe(0);
    expect(await ledgerNet(db, B)).toBe(0);
  });

  it('the timeout sweep (refund) releases the whole hold of 2', async () => {
    await openBoth('m7');
    expect((await db.query("select tetris_bet_refund('m7') as s")).rows[0].s).toBe('refunded');
    expect((await cols(db, A)).escrowed).toBe(0);
    expect(await ledgerNet(db, A)).toBe(0);
  });

  it('a player who can cover 1 but not 2 cannot join a premium match (insufficient, no escrow)', async () => {
    expect(await open(db, 'm8', A, B, 5, 1)).toBe('waiting');
    expect(await open(db, 'm8', B, A, 1, 1)).toBe('insufficient');
    expect((await cols(db, A)).escrowed).toBe(0);
  });

  it('kill-switch off (premium 0, or the old 5-argument call) → escrow 1 and today\'s settle', async () => {
    expect(await open(db, 'm9', A, B, 1)).toBe('waiting');
    expect(await open(db, 'm9', B, A, 1)).toBe('opened');
    expect((await cols(db, A)).escrowed).toBe(1);
    await resolveBet(db, 'm9', A, A, 4);
    expect(await resolveBet(db, 'm9', B, A, 4)).toBe('settled');   // no premium to pay
    expect(await cols(db, A)).toEqual({ escrowed: 0, giftedIn: 1, giftedOut: 0 });
    expect(await cols(db, B)).toEqual({ escrowed: 0, giftedIn: 0, giftedOut: 1 });
  });
});

// ── Routes ─────────────────────────────────────────────────────────────────────
const roster = [
  { student_id: A, section: 'PeriodB', username: 'apple_fox', role: 'student', status: 'active' },
  { student_id: B, section: 'PeriodB', username: 'bo_cat', role: 'student', status: 'active' },
];

function start({ openResult = () => ({ data: 'opened', error: null }), resolveResult = () => ({ data: 'pending', error: null }) } = {}) {
  const calls = { open: [], resolve: [] };
  const db = {
    async findByUsername(u) {
      const row = roster.find((r) => r.username === String(u).toLowerCase());
      return { data: row || null, error: row ? null : { code: 'PGRST116' } };
    },
    async findByStudentId(id) { return { data: roster.find((x) => x.student_id === id) || null, error: null }; },
    async getDogeAccount(id) { return { data: { student_id: id, candy_escrowed: 2 }, error: null }; },
    async getRoleByStudentId() { return 'student'; },
    async listRoster() { return { data: roster, error: null }; },
    async tetrisBetOpen(p) { calls.open.push(p); return openResult(p); },
    async tetrisBetResolve(p) { calls.resolve.push(p); return resolveResult(p); },
    async tetrisBetRefund() { return { data: 'refunded', error: null }; },
    async listStaleBets() { return { data: [], error: null }; },
    async listSettledBets() { return { data: [], error: null }; },
  };
  const ledgerDb = { async getLedgerByStudent() { return { data: [], error: null }; } };
  const app = express();
  app.use(express.json());
  mountDogeWallet(app, { db, ledgerDb, verifyToken: (t) => (t && t.startsWith('tok:')) ? t.slice(4) : null, getPrice: async () => 0.088 });
  return { server: http.createServer(app), calls };
}

async function post(server, path, body) {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer tok:' + A }, body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  await new Promise((r) => server.close(r));
  return { status: res.status, body: json };
}

describe('routes: the gold premium', () => {
  beforeEach(() => { process.env.STAKES_ENABLED = 'true'; delete process.env.STAKES_GOLD_PREMIUM; });
  afterEach(() => { delete process.env.STAKES_ENABLED; delete process.env.STAKES_GOLD_PREMIUM; });

  it('bet/open asks for the premium hold by default (escrow 2)', async () => {
    const { server, calls } = start();
    const r = await post(server, '/wallet/bet/open', { matchId: 'm', opponentUsername: 'bo_cat' });
    expect(r.status).toBe(200);
    expect(calls.open[0]).toMatchObject({ p_stake: 1, p_premium: 1 });
    expect(r.body).toMatchObject({ stake: 1, premium: 1, escrow: 2 });
  });

  it('STAKES_GOLD_PREMIUM=off → the old call, escrow 1', async () => {
    process.env.STAKES_GOLD_PREMIUM = 'off';
    const { server, calls } = start();
    const r = await post(server, '/wallet/bet/open', { matchId: 'm', opponentUsername: 'bo_cat' });
    expect(calls.open[0]).not.toHaveProperty('p_premium');
    expect(r.body).toMatchObject({ premium: 0, escrow: 1 });
  });

  it('before 0041 runs (unknown signature) bet/open falls back to the old call: no premium', async () => {
    const { server, calls } = start({
      openResult: (p) => (p.p_premium ? { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } } : { data: 'opened', error: null }),
    });
    const r = await post(server, '/wallet/bet/open', { matchId: 'm', opponentUsername: 'bo_cat' });
    expect(r.status).toBe(200);
    expect(calls.open).toHaveLength(2);
    expect(calls.open[1]).not.toHaveProperty('p_premium');
    expect(r.body).toMatchObject({ premium: 0, escrow: 1 });
  });

  it('insufficient names the full hold (2 candy)', async () => {
    const { server } = start({ openResult: () => ({ data: 'insufficient', error: null }) });
    const r = await post(server, '/wallet/bet/open', { matchId: 'm', opponentUsername: 'bo_cat' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('both players need 2 candy to play');
  });

  it('bet/resolve passes this reporter\'s count of the WINNER\'s gold lines', async () => {
    const { server, calls } = start();
    await post(server, '/wallet/bet/resolve', { matchId: 'm', winnerUsername: 'bo_cat', goldClears: { apple_fox: 5, Bo_Cat: 2 } });
    expect(calls.resolve[0]).toMatchObject({ p_winner: B, p_winner_gold: 2 });
  });

  it('a bad or missing goldClears is null (never counts toward the premium)', async () => {
    const { server, calls } = start();
    await post(server, '/wallet/bet/resolve', { matchId: 'm', winnerUsername: 'bo_cat', goldClears: { bo_cat: -1 } });
    expect(calls.resolve[0].p_winner_gold).toBe(null);
    const second = start();
    await post(second.server, '/wallet/bet/resolve', { matchId: 'm', winnerUsername: 'bo_cat' });
    expect(second.calls.resolve[0].p_winner_gold).toBe(null);
  });

  it("'settled-premium' → status settled + premiumPaid; plain settle → premiumPaid false", async () => {
    let r = await post(start({ resolveResult: () => ({ data: 'settled-premium', error: null }) }).server, '/wallet/bet/resolve', { matchId: 'm', winnerUsername: 'apple_fox' });
    expect(r.body).toMatchObject({ ok: true, status: 'settled', premiumPaid: true });
    r = await post(start({ resolveResult: () => ({ data: 'settled', error: null }) }).server, '/wallet/bet/resolve', { matchId: 'm', winnerUsername: 'apple_fox' });
    expect(r.body).toMatchObject({ ok: true, status: 'settled', premiumPaid: false });
  });

  it('before 0041 runs bet/resolve falls back to the 3-argument call', async () => {
    const { server, calls } = start({
      resolveResult: (p) => ('p_winner_gold' in p ? { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } } : { data: 'settled', error: null }),
    });
    const r = await post(server, '/wallet/bet/resolve', { matchId: 'm', winnerUsername: 'apple_fox', goldClears: { apple_fox: 1 } });
    expect(r.body).toMatchObject({ status: 'settled', premiumPaid: false });
    expect(calls.resolve[1]).not.toHaveProperty('p_winner_gold');
  });
});
