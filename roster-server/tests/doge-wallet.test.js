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
const rc = (source, itemId) => ({ source, item_id: itemId, receipt_compact: 'rc' });
// N distinct receipt-carrying quiz rows = N*10 points = N*10/36 candy.
const quizRows = (n) => Array.from({ length: n }, (_, i) => rc('curriculum_quiz', 'Q-' + i));

function start({ ledgers = {}, accounts = {}, dbMissing = false } = {}) {
  const acc = new Map(Object.entries(accounts));
  const dogeLedger = [];
  const miss = { data: null, error: { code: '42P01', message: 'relation "doge_account" does not exist' } };
  const db = {
    async getDogeAccount(sid) { return dbMissing ? miss : { data: acc.get(sid) || null, error: null }; },
    async listDogeAccounts() { return dbMissing ? miss : { data: [...acc.values()], error: null }; },
    async upsertDogeAccount(sid, patch) { if (dbMissing) return miss; const row = { student_id: sid, ...patch }; acc.set(sid, row); return { data: row, error: null }; },
    async insertDogeLedger(row) { dogeLedger.push(row); return { data: row, error: null }; },
    async listDogeLedger(sid) { return { data: dogeLedger.filter((r) => r.student_id === sid), error: null }; },
    async getRoleByStudentId() { return 'student'; },
  };
  const ledgerDb = { async getLedgerByStudent(sid) { return { data: ledgers[sid] || [], error: null }; } };
  const app = express();
  app.use(express.json());
  mountDogeWallet(app, {
    db, ledgerDb,
    verifyToken: (t) => (typeof t === 'string' && t.startsWith('tok:')) ? t.slice(4) : null,
    getPrice: async () => PRICE,
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
    expect(r.body.minBuyCandy).toBe(25);
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

describe('DOGE wallet — eat candy', () => {
  it('eats candy → candyOwed rises, candyBalance falls', async () => {
    const ctx = start({ ledgers: { s1: quizRows(18) } }); // 5 candy
    const r = await req(ctx, 'POST', '/wallet/eat', { token: 'tok:s1', body: { candy: 3 } });
    expect(r.status).toBe(200);
    expect(r.body.candyEaten).toBeCloseTo(3, 6);
    expect(r.body.candyOwed).toBeCloseTo(3, 6);      // teacher owes 3 physical candy
    expect(r.body.candyBalance).toBeCloseTo(2, 6);
  });
  it('rejects eating more candy than earned', async () => {
    const ctx = start({ ledgers: { s1: quizRows(4) } }); // ~1.1 candy
    const r = await req(ctx, 'POST', '/wallet/eat', { token: 'tok:s1', body: { candy: 99 } });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/not enough/);
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
  it('enforces the 25-candy minimum (dust/fee floor)', async () => {
    const ctx = start({ ledgers: { s1: quizRows(100) } });
    const r = await req(ctx, 'POST', '/wallet/buy-doge', { token: 'tok:s1', body: { candy: 10 } });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/minimum 25/);
  });
});

describe('DOGE wallet — teacher routes', () => {
  it('registers a valid D… address, rejects junk', async () => {
    const ctx = start();
    const ok = await req(ctx, 'POST', '/wallet/address', { secret: 'TS', body: { studentId: 's1', address: 'DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L' } });
    expect(ok.status).toBe(200);
    expect(ok.body.dogeAddress).toBe('DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L');
    const ctx2 = start();
    const bad = await req(ctx2, 'POST', '/wallet/address', { secret: 'TS', body: { studentId: 's1', address: 'not-an-address' } });
    expect(bad.status).toBe(400);
  });
  it('non-teacher is forbidden', async () => {
    const r = await req(start(), 'POST', '/wallet/address', { body: { studentId: 's1', address: 'D...' } });
    expect(r.status).toBe(401);
  });
  it('GET /class/wallets returns per-kid owed/deposit', async () => {
    const ctx = start({ accounts: { s1: { student_id: 's1', candy_eaten: 5, candy_given: 2, doge_balance: 7, doge_sent: 0, doge_cost_basis: 12, doge_address: 'Dabc' } } });
    const r = await req(ctx, 'GET', '/class/wallets', { secret: 'TS' });
    expect(r.status).toBe(200);
    const a = r.body.accounts.find((x) => x.studentId === 's1');
    expect(a.candyOwed).toBe(3);           // 5 eaten − 2 given
    expect(a.dogeToDeposit).toBe(7);       // 7 bought − 0 sent
  });
  it('mark-given / mark-sent reduce the owed/deposit', async () => {
    const ctx = start({ accounts: { s1: { student_id: 's1', candy_eaten: 5, candy_given: 0, doge_balance: 7, doge_sent: 0, doge_cost_basis: 12 } } });
    const g = await req(ctx, 'POST', '/wallet/mark-given', { secret: 'TS', body: { studentId: 's1', amount: 5 } });
    expect(g.status).toBe(200);
    expect(g.body.candy_given).toBe(5);
    const ctx2 = start({ accounts: { s1: { student_id: 's1', candy_eaten: 5, candy_given: 5, doge_balance: 7, doge_sent: 0, doge_cost_basis: 12 } } });
    const s = await req(ctx2, 'POST', '/wallet/mark-sent', { secret: 'TS', body: { studentId: 's1', amount: 7 } });
    expect(s.status).toBe(200);
    expect(s.body.doge_sent).toBe(7);
  });
});
