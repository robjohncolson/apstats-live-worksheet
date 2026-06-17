// doge-wallet.test.js — the DOGE Effort Wallet routes (DOGE_WALLET_SPEC Phase 2).
// Mounts only doge-wallet.js on a bare express app with in-memory fakes; live
// price is injected (no network). Student auth via a fake verifyToken; teacher
// auth via x-teacher-secret.

import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import http from 'http';
import { mountDogeWallet } from '../doge-wallet.js';

beforeAll(() => { process.env.ROSTER_TEACHER_SECRET = 'TS'; });

const PRICE = 0.088;                 // 1 DOGE = 0.088/0.036 ≈ 2.444 candy
// Teacher routes now require a uuid-shaped studentId (bad shape → 404, not 500).
const UID = '00000000-0000-4000-8000-000000000001';
const UID2 = '00000000-0000-4000-8000-000000000002';
const rc = (source, itemId) => ({ source, item_id: itemId, receipt_compact: 'rc' });
// N distinct receipt-carrying quiz rows = N*10 points = N*10/36 candy.
const quizRows = (n) => Array.from({ length: n }, (_, i) => rc('curriculum_quiz', 'Q-' + i));

const ROW_OF_NULLS = { student_id: null, candy_eaten: null, candy_given: null, doge_balance: null, doge_sent: null, doge_cost_basis: null, doge_address: null };

function start({ ledgers = {}, accounts = {}, dbMissing = false, rowOfNulls = false, roster = [], chain = {}, chainWriteFails = false, giftMissing = false } = {}) {
  const acc = new Map(Object.entries(accounts));
  const dogeLedger = [];
  const miss = { data: null, error: { code: '42P01', message: 'relation "doge_account" does not exist' } };
  const db = {
    async getDogeAccount(sid) { return dbMissing ? miss : { data: acc.get(sid) || null, error: null }; },
    async listDogeAccounts(studentIds) { if (dbMissing) return miss; let rows = [...acc.values()]; if (Array.isArray(studentIds) && studentIds.length) rows = rows.filter((r) => studentIds.includes(r.student_id)); return { data: rows, error: null }; },
    async listRoster(section) { if (dbMissing) return miss; return { data: roster.filter((r) => !section || r.section === section), error: null }; },
    async updateDogeChain(sid, patch) { if (dbMissing || chainWriteFails) return miss; const row = { ...(acc.get(sid) || { student_id: sid }), ...patch }; acc.set(sid, row); return { data: row, error: null }; },
    async upsertDogeAccount(sid, patch) { if (dbMissing) return miss; const row = { student_id: sid, ...patch }; acc.set(sid, row); return { data: row, error: null }; },
    async insertDogeLedger(row) { dogeLedger.push(row); return { data: row, error: null }; },
    async listDogeLedger(sid) { return { data: dogeLedger.filter((r) => r.student_id === sid), error: null }; },
    async getRoleByStudentId() { return 'student'; },
    async findByStudentId(studentId) { if (dbMissing) return miss; const row = roster.find((r) => r.student_id === studentId); return { data: row ? { student_id: studentId, section: row.section, real_name: row.realName || null } : null, error: null }; },
    async findByUsername(username) { if (dbMissing) return miss; const u = String(username || '').toLowerCase(); const row = roster.find((r) => (r.username || '').toLowerCase() === u); return { data: row ? { student_id: row.student_id, section: row.section, real_name: row.realName || null, role: row.role || 'student', status: row.status || 'active' } : null, error: row ? null : { code: 'PGRST116', message: 'no rows' } }; },
    async dogeGiftedSince(studentId, sinceIso) { if (dbMissing) return miss; return { data: dogeLedger.filter((r) => r.student_id === studentId && r.kind === 'gift_out' && (!sinceIso || (r.ts && r.ts >= sinceIso))), error: null }; },
    // models the atomic doge_gift RPC: guard the SENDER's spendable + the rolling
    // daily cap, debit out, credit in, log both legs, return the sender row (null on guard fail).
    async dogeGift({ p_from, p_to, p_candy, p_earned_from, p_cap }) {
      if (dbMissing || giftMissing) return miss;
      if (p_from === p_to || p_candy <= 0) return { data: null, error: null };
      if (p_cap != null) {
        var since24 = new Date(Date.now() - 86400000).toISOString();
        var giftedRecent = dogeLedger.filter((r) => r.student_id === p_from && r.kind === 'gift_out' && (!r.ts || r.ts >= since24)).reduce((s, r) => s + Math.abs(r.candy_delta), 0);
        if (giftedRecent + p_candy > p_cap + 1e-9) return { data: null, error: null };   // over cap → null (race backstop)
      }
      var from = acc.get(p_from) || { student_id: p_from, candy_eaten: 0, candy_given: 0, doge_balance: 0, doge_sent: 0, doge_cost_basis: 0, candy_gifted_out: 0, candy_gifted_in: 0 };
      var spend = p_earned_from - Number(from.candy_given || 0) - Number(from.doge_cost_basis || 0) - Number(from.candy_gifted_out || 0) + Number(from.candy_gifted_in || 0);   // 0022: subtract Materialized, not eaten
      if (spend < p_candy - 1e-9) return { data: rowOfNulls ? { ...ROW_OF_NULLS } : null, error: null };
      from = { ...from, candy_gifted_out: Number(from.candy_gifted_out || 0) + p_candy }; acc.set(p_from, from);
      var to = acc.get(p_to) || { student_id: p_to, candy_gifted_in: 0 };
      to = { ...to, candy_gifted_in: Number(to.candy_gifted_in || 0) + p_candy }; acc.set(p_to, to);
      dogeLedger.push({ student_id: p_from, kind: 'gift_out', candy_delta: -p_candy, ts: new Date().toISOString() });
      dogeLedger.push({ student_id: p_to, kind: 'gift_in', candy_delta: p_candy, ts: new Date().toISOString() });
      return { data: from, error: null };
    },
    // models the atomic doge_spend RPC: guard balance, debit the right field(s),
    // log, return the row (or null when the guard fails).
    async dogeSpend({ p_sid, p_earned, p_candy, p_kind, p_doge, p_price, p_cpd }) {
      if (dbMissing) return miss;
      var a = acc.get(p_sid) || { student_id: p_sid, candy_eaten: 0, candy_given: 0, doge_balance: 0, doge_sent: 0, doge_cost_basis: 0, doge_address: null };
      var bal = p_earned - Number(a.candy_given || 0) - Number(a.doge_cost_basis || 0) - Number(a.candy_gifted_out || 0) + Number(a.candy_gifted_in || 0);   // 0022: subtract Materialized, not eaten
      // guard fail: production (a `returns doge_account` fn over PostgREST) returns
      // a ROW-OF-NULLS, not a bare null — exercise that shape so the load-bearing
      // `!r.data.student_id` guard in the endpoints is actually pinned.
      if (bal < p_candy - 1e-9) return { data: rowOfNulls ? { ...ROW_OF_NULLS } : null, error: null };
      if (p_kind === 'eat') a = { ...a, candy_eaten: Number(a.candy_eaten || 0) + p_candy };
      else a = { ...a, doge_balance: Number(a.doge_balance || 0) + (p_doge || 0), doge_cost_basis: Number(a.doge_cost_basis || 0) + p_candy };
      acc.set(p_sid, a);
      dogeLedger.push({ student_id: p_sid, kind: p_kind, candy_delta: -p_candy, doge_delta: p_doge || 0, doge_price_usd: p_price, candy_per_doge: p_cpd });
      return { data: a, error: null };
    },
  };
  const ledgerDb = { async getLedgerByStudent(sid) { return { data: ledgers[sid] || [], error: null }; } };
  const app = express();
  app.use(express.json());
  mountDogeWallet(app, {
    db, ledgerDb,
    verifyToken: (t) => (typeof t === 'string' && t.startsWith('tok:')) ? t.slice(4) : null,
    getPrice: async () => PRICE,
    fetchChainBalance: async (addr) => (typeof chain === 'function' ? chain(addr) : (chain[addr] || { address: addr, network: 'main', error: 'no fake' })),
  });
  const server = http.createServer(app);
  return { server, db, acc, dogeLedger };
}

async function req(ctx, method, path, { token, secret, body } = {}) {
  await new Promise((r) => ctx.server.listen(0, r));
  const port = ctx.server.address().port;
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = 'Bearer ' + token;
  if (secret) headers['x-teacher-secret'] = secret;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  await new Promise((r) => ctx.server.close(r));
  return { status: res.status, body: json };
}

describe('DOGE wallet — student GET /wallet', () => {
  it('derives candy balance from effort (36 pts = 1 candy)', async () => {
    const ctx = start({ ledgers: { s1: quizRows(18) } }); // 180 pts = 5 candy
    const r = await req(ctx, 'GET', '/wallet', { token: 'tok:s1' });
    expect(r.status).toBe(200);
    expect(r.body.candyEarned).toBeCloseTo(5, 6);
    expect(r.body.candyBalance).toBeCloseTo(5, 6);
    expect(r.body.candyPerDoge).toBeCloseTo(2.444, 2);
    expect(r.body.minBuyCandy).toBe(5);
  });
  it('401 without a valid token', async () => {
    const r = await req(start(), 'GET', '/wallet', {});
    expect(r.status).toBe(401);
  });
  it('503 before migration 0019', async () => {
    const r = await req(start({ ledgers: { s1: quizRows(2) }, dbMissing: true }), 'GET', '/wallet', { token: 'tok:s1' });
    expect(r.status).toBe(503);
    expect(r.body.error).toMatch(/not provisioned/);
  });
});

describe('DOGE wallet — eat retired (candy is simply Owed, CANDY_LEDGER_SPEC)', () => {
  it('POST /wallet/eat is now a no-op: candyEaten stays 0, all earned candy is Owed === balance', async () => {
    const ctx = start({ ledgers: { s1: quizRows(18) } }); // 5 candy
    const r = await req(ctx, 'POST', '/wallet/eat', { token: 'tok:s1', body: { candy: 3 } });
    expect(r.status).toBe(200);
    expect(r.body.deprecated).toBe(true);
    expect(r.body.candyEaten).toBeCloseTo(0, 6);     // eat no longer consumes
    expect(r.body.candyBalance).toBeCloseTo(5, 6);   // nothing gifted/converted/materialized
    expect(r.body.candyOwed).toBeCloseTo(5, 6);      // Owed === balance: the teacher owes all 5
  });
});

describe('DOGE wallet — buy DOGE (floating price)', () => {
  it('converts candy → coins at the live price + banks cost basis', async () => {
    const ctx = start({ ledgers: { s1: quizRows(100) } }); // 1000 pts ≈ 27.8 candy
    const r = await req(ctx, 'POST', '/wallet/buy-doge', { token: 'tok:s1', body: { candy: 25 } });
    expect(r.status).toBe(200);
    // 25 candy / 2.444 candy-per-DOGE ≈ 10.23 coins
    expect(r.body.boughtCoins).toBeCloseTo(10.227, 2);
    expect(r.body.dogeBalance).toBeCloseTo(10.227, 2);
    expect(r.body.dogeToDeposit).toBeCloseTo(10.227, 2);   // teacher must deposit this
    expect(r.body.candyBalance).toBeCloseTo(27.778 - 25, 2);
  });
  it('enforces the 5-candy minimum (deliberate-conversion floor)', async () => {
    const ctx = start({ ledgers: { s1: quizRows(100) } });
    const r = await req(ctx, 'POST', '/wallet/buy-doge', { token: 'tok:s1', body: { candy: 3 } });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/minimum 5/);
  });
});

describe('DOGE wallet — atomic spend (conservation across operations)', () => {
  it('buy then buy can never exceed earned candy (the atomic guard sees the prior conversion)', async () => {
    const ctx = start({ ledgers: { s1: quizRows(100) } });   // ~27.78 candy
    const b1 = await req(ctx, 'POST', '/wallet/buy-doge', { token: 'tok:s1', body: { candy: 25 } });
    expect(b1.status).toBe(200);
    expect(b1.body.candyConverted).toBeCloseTo(25, 6);
    // ~2.78 candy left → a second 25-candy buy must be rejected
    const b2 = await req(ctx, 'POST', '/wallet/buy-doge', { token: 'tok:s1', body: { candy: 25 } });
    expect(b2.status).toBe(400);
    expect(b2.body.error).toMatch(/not enough/);
  });
  it('503s a spend before migration 0019 (table/function absent)', async () => {
    const ctx = start({ ledgers: { s1: quizRows(100) }, dbMissing: true });
    const r = await req(ctx, 'POST', '/wallet/eat', { token: 'tok:s1', body: { candy: 5 } });
    expect(r.status).toBe(503);
  });
  it('rejects an over-spend even when the RPC returns a ROW-OF-NULLS (real PostgREST shape)', async () => {
    const ctx = start({ ledgers: { s1: quizRows(4) }, rowOfNulls: true });   // ~1.1 candy
    const r = await req(ctx, 'POST', '/wallet/buy-doge', { token: 'tok:s1', body: { candy: 99 } });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/not enough/);
  });
});

describe('DOGE wallet — teacher routes', () => {
  it('registers a valid D… address, rejects junk', async () => {
    const ctx = start();
    const ok = await req(ctx, 'POST', '/wallet/address', { secret: 'TS', body: { studentId: UID, address: 'DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L' } });
    expect(ok.status).toBe(200);
    expect(ok.body.dogeAddress).toBe('DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L');
    const ctx2 = start();
    const bad = await req(ctx2, 'POST', '/wallet/address', { secret: 'TS', body: { studentId: UID, address: 'not-an-address' } });
    expect(bad.status).toBe(400);
  });
  it('non-teacher is forbidden', async () => {
    const r = await req(start(), 'POST', '/wallet/address', { body: { studentId: UID, address: 'D...' } });
    expect(r.status).toBe(401);
  });
  it('GET /class/wallets returns per-kid earned/owed/deposit (the 6-number ledger)', async () => {
    const ctx = start({
      ledgers: { [UID]: quizRows(72) },   // 720 pts = 20 candy Earned
      accounts: { [UID]: { student_id: UID, candy_given: 2, doge_balance: 7, doge_sent: 0, doge_cost_basis: 12, doge_address: 'Dabc' } },
    });
    const r = await req(ctx, 'GET', '/class/wallets', { secret: 'TS' });
    expect(r.status).toBe(200);
    const a = r.body.accounts.find((x) => x.studentId === UID);
    expect(a.candyEarned).toBeCloseTo(20, 6);
    expect(a.candyMaterialized).toBe(2);
    expect(a.candyOwed).toBeCloseTo(6, 6);   // 20 earned − 12 converted − 2 materialized
    expect(a.dogeToDeposit).toBe(7);         // 7 bought − 0 sent
  });
  it('mark-given / mark-sent reduce the owed/deposit', async () => {
    const ctx = start({
      ledgers: { [UID]: quizRows(72) },   // 20 candy Earned; owed-eligible = 20 − 12 converted = 8
      accounts: { [UID]: { student_id: UID, candy_given: 0, doge_balance: 7, doge_sent: 0, doge_cost_basis: 12 } },
    });
    const g = await req(ctx, 'POST', '/wallet/mark-given', { secret: 'TS', body: { studentId: UID, amount: 5 } });
    expect(g.status).toBe(200);
    expect(g.body.candy_given).toBe(5);      // 5 ≤ owed-eligible 8
    const ctx2 = start({ accounts: { [UID]: { student_id: UID, candy_given: 5, doge_balance: 7, doge_sent: 0, doge_cost_basis: 12 } } });
    const s = await req(ctx2, 'POST', '/wallet/mark-sent', { secret: 'TS', body: { studentId: UID, amount: 7 } });
    expect(s.status).toBe(200);
    expect(s.body.doge_sent).toBe(7);
  });
});

describe('DOGE wallet — hardening (item 6)', () => {
  // (b) bad studentId shape → 404, never a leaked 500 from Postgres 22P02.
  it('404s a malformed (non-uuid) studentId on /wallet/address', async () => {
    const r = await req(start(), 'POST', '/wallet/address', { secret: 'TS', body: { studentId: 'not-a-uuid', address: 'DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L' } });
    expect(r.status).toBe(404);
    expect(r.body.error).toMatch(/unknown student/);
  });
  it('404s a malformed studentId on /wallet/mark-given', async () => {
    const r = await req(start(), 'POST', '/wallet/mark-given', { secret: 'TS', body: { studentId: 'xyz', amount: 1 } });
    expect(r.status).toBe(404);
  });
  it('404s a malformed studentId on /wallet/mark-sent (shares markEndpoint)', async () => {
    const r = await req(start(), 'POST', '/wallet/mark-sent', { secret: 'TS', body: { studentId: 'xyz', amount: 1 } });
    expect(r.status).toBe(404);
  });
  // (a) negative balance is SURFACED via candyBalanceRaw, not silently clamped to 0.
  it('surfaces a negative candyBalanceRaw when materialized exceeds (re-derived) earned candy', async () => {
    // earned ≈ 1.1 candy (36 pts), but the teacher already materialized 5 (a receipt row
    // was deleted after disbursement) → overspent by ~3.9.
    const ctx = start({ ledgers: { s1: quizRows(4) }, accounts: { s1: { student_id: 's1', candy_given: 5, doge_balance: 0, doge_sent: 0, doge_cost_basis: 0 } } });
    const r = await req(ctx, 'GET', '/wallet', { token: 'tok:s1' });
    expect(r.status).toBe(200);
    expect(r.body.candyBalance).toBe(0);              // still clamped for spend-gating
    expect(r.body.candyBalanceRaw).toBeLessThan(0);   // but the gap is visible
  });
  // (c) ?section= scopes /class/wallets to one roster section.
  it('section-scopes GET /class/wallets', async () => {
    const ctx = start({
      accounts: {
        [UID]: { student_id: UID, candy_eaten: 3, candy_given: 0, doge_balance: 0, doge_sent: 0, doge_cost_basis: 0, doge_address: 'Da' },
        [UID2]: { student_id: UID2, candy_eaten: 9, candy_given: 0, doge_balance: 0, doge_sent: 0, doge_cost_basis: 0, doge_address: 'Db' },
      },
      roster: [{ student_id: UID, section: 'PeriodB' }, { student_id: UID2, section: 'PeriodE' }],
    });
    const r = await req(ctx, 'GET', '/class/wallets?section=PeriodB', { secret: 'TS' });
    expect(r.status).toBe(200);
    expect(r.body.accounts.length).toBe(1);
    expect(r.body.accounts[0].studentId).toBe(UID);
    const all = await req(start({ accounts: { [UID]: { student_id: UID }, [UID2]: { student_id: UID2 } } }), 'GET', '/class/wallets', { secret: 'TS' });
    expect(all.body.accounts.length).toBe(2);          // no section → all
  });
  // (d) mark-given / mark-sent clamp at candy_eaten / doge_balance (over-amount).
  it('clamps an over-amount mark-given at Owed-eligible candy', async () => {
    const ctx = start({ ledgers: { [UID]: quizRows(18) }, accounts: { [UID]: { student_id: UID, candy_given: 0, doge_balance: 7, doge_sent: 0, doge_cost_basis: 0 } } });  // 5 candy earned, nothing gifted/converted
    const g = await req(ctx, 'POST', '/wallet/mark-given', { secret: 'TS', body: { studentId: UID, amount: 99 } });
    expect(g.status).toBe(200);
    expect(g.body.candy_given).toBe(5);                // clamped to Owed-eligible (5 earned), not 99
  });
  it('clamps an over-amount mark-sent at doge_balance', async () => {
    const ctx = start({ accounts: { [UID]: { student_id: UID, candy_eaten: 0, candy_given: 0, doge_balance: 7, doge_sent: 0, doge_cost_basis: 0 } } });
    const s = await req(ctx, 'POST', '/wallet/mark-sent', { secret: 'TS', body: { studentId: UID, amount: 99 } });
    expect(s.status).toBe(200);
    expect(s.body.doge_sent).toBe(7);                  // clamped to doge_balance, not 99
  });
});

describe('DOGE wallet — watch-only chain (item 4)', () => {
  it('GET /wallet/chain returns null address when none registered', async () => {
    const ctx = start({ accounts: { s1: { student_id: 's1' } } });
    const r = await req(ctx, 'GET', '/wallet/chain', { token: 'tok:s1' });
    expect(r.status).toBe(200);
    expect(r.body.address).toBeNull();
  });
  it('GET /wallet/chain returns the explorer balance for a registered address', async () => {
    const ctx = start({
      accounts: { s1: { student_id: 's1', doge_address: 'Dabc' } },
      chain: { Dabc: { address: 'Dabc', network: 'main', confirmedDoge: 12.5, unconfirmedDoge: 0, txCount: 2, source: 'blockcypher', syncedAt: '2026-06-16T00:00:00.000Z' } },
    });
    const r = await req(ctx, 'GET', '/wallet/chain', { token: 'tok:s1' });
    expect(r.status).toBe(200);
    expect(r.body.confirmedDoge).toBe(12.5);
    expect(r.body.network).toBe('main');
  });
  it('401 without a token', async () => {
    const r = await req(start(), 'GET', '/wallet/chain', {});
    expect(r.status).toBe(401);
  });
  it('503 before migration 0019', async () => {
    const r = await req(start({ dbMissing: true }), 'GET', '/wallet/chain', { token: 'tok:s1' });
    expect(r.status).toBe(503);
  });
  it('GET /class/wallets/chain batches only addressed accounts', async () => {
    const ctx = start({
      accounts: {
        [UID]: { student_id: UID, doge_address: 'Da' },
        [UID2]: { student_id: UID2 },          // no address → skipped
      },
      chain: { Da: { address: 'Da', network: 'main', confirmedDoge: 3, source: 'blockcypher' } },
    });
    const r = await req(ctx, 'GET', '/class/wallets/chain', { secret: 'TS' });
    expect(r.status).toBe(200);
    expect(Object.keys(r.body.addresses)).toEqual([UID]);
    expect(r.body.addresses[UID].confirmedDoge).toBe(3);
  });
  it('section-scopes GET /class/wallets/chain', async () => {
    const ctx = start({
      accounts: {
        [UID]: { student_id: UID, doge_address: 'Da' },
        [UID2]: { student_id: UID2, doge_address: 'Db' },
      },
      roster: [{ student_id: UID, section: 'PeriodB' }, { student_id: UID2, section: 'PeriodE' }],
      chain: { Da: { address: 'Da', network: 'main', confirmedDoge: 3, source: 'blockcypher' }, Db: { address: 'Db', network: 'main', confirmedDoge: 9, source: 'blockcypher' } },
    });
    const r = await req(ctx, 'GET', '/class/wallets/chain?section=PeriodB', { secret: 'TS' });
    expect(r.status).toBe(200);
    expect(Object.keys(r.body.addresses)).toEqual([UID]);     // only the in-section kid
    expect(r.body.addresses[UID].confirmedDoge).toBe(3);
  });
  it('empty section short-circuits to {} (no listDogeAccounts / no cache write)', async () => {
    const ctx = start({
      accounts: { [UID]: { student_id: UID, doge_address: 'Da' } },
      roster: [{ student_id: UID, section: 'PeriodB' }],
      chain: { Da: { address: 'Da', network: 'main', confirmedDoge: 3, source: 'blockcypher' } },
    });
    const r = await req(ctx, 'GET', '/class/wallets/chain?section=PeriodNONE', { secret: 'TS' });
    expect(r.status).toBe(200);
    expect(r.body.addresses).toEqual({});
    expect(ctx.acc.get(UID).chain_doge).toBeUndefined();      // never reached the write-back
  });
  it('writes the migration-0020 cache (chainColumns mapping) on a successful read', async () => {
    const ctx = start({
      accounts: { s1: { student_id: 's1', doge_address: 'Dabc' } },
      chain: { Dabc: { address: 'Dabc', network: 'main', confirmedDoge: 12.5, unconfirmedDoge: 0.5, txCount: 2, source: 'blockcypher', syncedAt: '2026-06-16T00:00:00.000Z' } },
    });
    const r = await req(ctx, 'GET', '/wallet/chain', { token: 'tok:s1' });
    expect(r.status).toBe(200);
    const row = ctx.acc.get('s1');
    expect(row.chain_doge).toBe(12.5);
    expect(row.chain_unconfirmed).toBe(0.5);
    expect(row.chain_tx_count).toBe(2);
    expect(row.chain_synced_at).toBe('2026-06-16T00:00:00.000Z');
  });
  it('still returns the live read when the 0020 cache write-back errors (columns absent)', async () => {
    const ctx = start({
      accounts: { s1: { student_id: 's1', doge_address: 'Dabc' } },
      chain: { Dabc: { address: 'Dabc', network: 'main', confirmedDoge: 12.5, source: 'blockcypher' } },
      chainWriteFails: true,
    });
    const r = await req(ctx, 'GET', '/wallet/chain', { token: 'tok:s1' });
    expect(r.status).toBe(200);
    expect(r.body.confirmedDoge).toBe(12.5);     // live read survives the failed write-back
  });
  it('falls back to the stored cache row (stale) when the explorer is down', async () => {
    const ADDR = 'DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L';
    const ctx = start({
      accounts: { s1: { student_id: 's1', doge_address: ADDR, chain_doge: 7, chain_unconfirmed: 0, chain_tx_count: 1, chain_synced_at: '2026-06-15T00:00:00.000Z' } },
      chain: { [ADDR]: { address: ADDR, network: 'main', error: 'explorer unavailable', stale: true } },
    });
    const r = await req(ctx, 'GET', '/wallet/chain', { token: 'tok:s1' });
    expect(r.status).toBe(200);
    expect(r.body.confirmedDoge).toBe(7);        // served from the 0020 cache
    expect(r.body.source).toBe('cache');
    expect(r.body.stale).toBe(true);
  });
});

describe('DOGE wallet — candy gifting (kid → kid)', () => {
  const B = '00000000-0000-4000-8000-0000000000bb';   // recipient's student_id (resolved from username)
  // sender token sid 's1' (username sender_one); recipient username recip_bee.
  const sameSection = [{ student_id: 's1', section: 'PeriodB', username: 'sender_one' }, { student_id: B, section: 'PeriodB', username: 'recip_bee' }];

  it('gifts candy to a classmate — spendable drops, recipient credited', async () => {
    const ctx = start({ ledgers: { s1: quizRows(36) }, roster: sameSection });   // 360 pts = 10 candy
    const r = await req(ctx, 'POST', '/wallet/gift', { token: 'tok:s1', body: { toUsername: 'recip_bee', candy: 4 } });
    expect(r.status).toBe(200);
    expect(r.body.candyGiftedOut).toBe(4);
    expect(r.body.candyBalance).toBeCloseTo(6, 6);      // 10 earned − 4 gifted
    expect(ctx.acc.get(B).candy_gifted_in).toBe(4);     // recipient credited
  });
  it('rejects gifting more candy than spendable', async () => {
    const ctx = start({ ledgers: { s1: quizRows(7) }, roster: sameSection });    // ~1.9 candy
    const r = await req(ctx, 'POST', '/wallet/gift', { token: 'tok:s1', body: { toUsername: 'recip_bee', candy: 5 } });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/not enough/);
  });
  it('rejects a non-whole amount', async () => {
    const r = await req(start({ ledgers: { s1: quizRows(36) }, roster: sameSection }), 'POST', '/wallet/gift', { token: 'tok:s1', body: { toUsername: 'recip_bee', candy: 2.5 } });
    expect(r.status).toBe(400);
  });
  it('rejects gifting yourself', async () => {
    const r = await req(start({ ledgers: { s1: quizRows(36) }, roster: sameSection }), 'POST', '/wallet/gift', { token: 'tok:s1', body: { toUsername: 'sender_one', candy: 1 } });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/yourself/);
  });
  it('rejects an unknown classmate username (404)', async () => {
    const r = await req(start({ ledgers: { s1: quizRows(36) }, roster: sameSection }), 'POST', '/wallet/gift', { token: 'tok:s1', body: { toUsername: 'ghost_nobody', candy: 2 } });
    expect(r.status).toBe(404);
    expect(r.body.error).toMatch(/unknown classmate/);
  });
  it('rejects gifting across sections', async () => {
    const ctx = start({ ledgers: { s1: quizRows(36) }, roster: [{ student_id: 's1', section: 'PeriodB', username: 'sender_one' }, { student_id: B, section: 'PeriodE', username: 'recip_bee' }] });
    const r = await req(ctx, 'POST', '/wallet/gift', { token: 'tok:s1', body: { toUsername: 'recip_bee', candy: 2 } });
    expect(r.status).toBe(404);
    expect(r.body.error).toMatch(/not in your class/);
  });
  it('enforces the rolling daily gift cap (20/day)', async () => {
    const ctx = start({ ledgers: { s1: quizRows(200) }, roster: sameSection });   // plenty of candy
    expect((await req(ctx, 'POST', '/wallet/gift', { token: 'tok:s1', body: { toUsername: 'recip_bee', candy: 20 } })).status).toBe(200);
    const over = await req(ctx, 'POST', '/wallet/gift', { token: 'tok:s1', body: { toUsername: 'recip_bee', candy: 1 } });
    expect(over.status).toBe(429);
    expect(over.body.error).toMatch(/daily gift limit/);
  });
  it('403s when gifting is turned off (teacher kill-switch)', async () => {
    process.env.GIFTING_ENABLED = 'false';
    try {
      const r = await req(start({ ledgers: { s1: quizRows(36) }, roster: sameSection }), 'POST', '/wallet/gift', { token: 'tok:s1', body: { toUsername: 'recip_bee', candy: 2 } });
      expect(r.status).toBe(403);
    } finally { delete process.env.GIFTING_ENABLED; }
  });
  it('503s before migration 0021 (doge_gift absent; roster still works)', async () => {
    const ctx = start({ ledgers: { s1: quizRows(36) }, roster: sameSection, giftMissing: true });
    const r = await req(ctx, 'POST', '/wallet/gift', { token: 'tok:s1', body: { toUsername: 'recip_bee', candy: 2 } });
    expect(r.status).toBe(503);
  });
  it('gifted-away candy can no longer be converted (the patched doge_gift/doge_spend guard sees it)', async () => {
    const ctx = start({ ledgers: { s1: quizRows(36) }, roster: sameSection });   // 10 candy
    expect((await req(ctx, 'POST', '/wallet/gift', { token: 'tok:s1', body: { toUsername: 'recip_bee', candy: 7 } })).status).toBe(200);
    const b = await req(ctx, 'POST', '/wallet/buy-doge', { token: 'tok:s1', body: { candy: 5 } });   // only 3 left
    expect(b.status).toBe(400);
    expect(b.body.error).toMatch(/not enough/);
  });
  it('received candy CAN be spent (recipient converts a gift they did not earn)', async () => {
    const ctx = start({ ledgers: { s1: quizRows(36) }, roster: sameSection });   // B earns nothing
    await req(ctx, 'POST', '/wallet/gift', { token: 'tok:s1', body: { toUsername: 'recip_bee', candy: 6 } });
    const b = await req(ctx, 'POST', '/wallet/buy-doge', { token: 'tok:' + B, body: { candy: 5 } });
    expect(b.status).toBe(200);
    expect(b.body.candyConverted).toBeCloseTo(5, 6);
  });
  it('rejects gifting the TEACHER account (same section, role=teacher)', async () => {
    const ctx = start({ ledgers: { s1: quizRows(36) }, roster: [{ student_id: 's1', section: 'PeriodX', username: 'sender_one' }, { student_id: 't1', section: 'PeriodX', username: 'teach', role: 'teacher' }] });
    const r = await req(ctx, 'POST', '/wallet/gift', { token: 'tok:s1', body: { toUsername: 'teach', candy: 2 } });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/classmate/);
  });
  it('rejects gifting an archived student', async () => {
    const ctx = start({ ledgers: { s1: quizRows(36) }, roster: [{ student_id: 's1', section: 'PeriodB', username: 'sender_one' }, { student_id: B, section: 'PeriodB', username: 'recip_bee', status: 'archived' }] });
    const r = await req(ctx, 'POST', '/wallet/gift', { token: 'tok:s1', body: { toUsername: 'recip_bee', candy: 2 } });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/classmate/);
  });
  it('honors GIFTING_ENABLED falsey spellings (0/off/no), not just "false"', async () => {
    for (const v of ['0', 'off', 'no', 'FALSE']) {
      process.env.GIFTING_ENABLED = v;
      try {
        const r = await req(start({ ledgers: { s1: quizRows(36) }, roster: sameSection }), 'POST', '/wallet/gift', { token: 'tok:s1', body: { toUsername: 'recip_bee', candy: 2 } });
        expect(r.status, 'GIFTING_ENABLED=' + v + ' should disable gifting').toBe(403);
      } finally { delete process.env.GIFTING_ENABLED; }
    }
  });
  it('excludes gifts older than 24h from the rolling cap', async () => {
    const ctx = start({ ledgers: { s1: quizRows(200) }, roster: sameSection });
    // an aged gift_out (25h ago) must NOT count toward today's cap
    ctx.dogeLedger.push({ student_id: 's1', kind: 'gift_out', candy_delta: -20, ts: new Date(Date.now() - 25 * 3600 * 1000).toISOString() });
    const r = await req(ctx, 'POST', '/wallet/gift', { token: 'tok:s1', body: { toUsername: 'recip_bee', candy: 20 } });
    expect(r.status).toBe(200);   // would be 429 if the ts window were ignored (lifetime cap)
  });
  it('conserves total spendable across a gift (A + B constant — zero-sum)', async () => {
    const ctx = start({ ledgers: { s1: quizRows(36), [B]: quizRows(18) }, roster: sameSection });   // A=10, B=5
    const a0 = (await req(ctx, 'GET', '/wallet', { token: 'tok:s1' })).body.candyBalance;
    const b0 = (await req(ctx, 'GET', '/wallet', { token: 'tok:' + B })).body.candyBalance;
    await req(ctx, 'POST', '/wallet/gift', { token: 'tok:s1', body: { toUsername: 'recip_bee', candy: 4 } });
    const a1 = (await req(ctx, 'GET', '/wallet', { token: 'tok:s1' })).body.candyBalance;
    const b1 = (await req(ctx, 'GET', '/wallet', { token: 'tok:' + B })).body.candyBalance;
    expect(a1 + b1).toBeCloseTo(a0 + b0, 6);   // gift moved spendable candy, created none
    expect(a1).toBeCloseTo(a0 - 4, 6);
    expect(b1).toBeCloseTo(b0 + 4, 6);
  });
});
