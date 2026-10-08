// park-key-purchase.test.js — POST /wallet/buy-key (PICO_DESK_SPEC "Candy economy", items 7-11).
// Mounts doge-wallet.js on a bare express app with an in-memory model of migration 0039's RPCs
// (the REAL SQL is exercised in park-key-purchase-pg.test.js). The relay grant is injected.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import express from 'express';
import http from 'http';
import { mountDogeWallet, classifyGrantReply } from '../doge-wallet.js';
import { keyPrice } from '../doge-econ.js';

beforeAll(() => { process.env.ROSTER_TEACHER_SECRET = 'TS'; });
afterEach(() => { delete process.env.KEY_PURCHASE_ENABLED; delete process.env.PARK_KEY_GRANT_SECRET; });

const rc = (source, itemId) => ({ source, item_id: itemId, receipt_compact: 'rc' });
// N receipt-carrying quiz rows = N*10/36 candy.
const quizRows = (n) => Array.from({ length: n }, (_, i) => rc('curriculum_quiz', 'Q-' + i));

const S1 = '00000000-0000-4000-8000-0000000000a1';
const S2 = '00000000-0000-4000-8000-0000000000a2';
const T1 = '00000000-0000-4000-8000-0000000000f1';
const ROSTER = [
  { student_id: S1, login_username: 'ada', section: 'PeriodB', role: 'student', status: 'active' },
  { student_id: S2, login_username: 'bo', section: 'PeriodE', role: 'student', status: 'active' },
  { student_id: T1, login_username: 'mr', section: 'PeriodX', role: 'teacher', status: 'active' },
];
// 2026-10-08 10:00 America/New_York (EDT = UTC-4).
const MORNING = Date.parse('2026-10-08T14:00:00Z');

let receiptCounter = 0;
const newReceipt = () => '10000000-0000-4000-8000-' + String(++receiptCounter).padStart(12, '0');

function blankAccount(sid) {
  return { student_id: sid, candy_eaten: 0, candy_given: 0, doge_balance: 0, doge_sent: 0, doge_cost_basis: 0,
    candy_gifted_out: 0, candy_gifted_in: 0, candy_realized: 0, candy_escrowed: 0, candy_bonus: 0, candy_returned: 0 };
}

function start({ ledgers = {}, accounts = {}, grant, missing0039 = false, injectGrant = true } = {}) {
  const acc = new Map(Object.entries(accounts));
  const purchases = [];
  const dogeLedger = [];
  const grants = [];
  let clock = MORNING;
  const missing = { data: null, error: { code: '42P01', message: 'relation "park_key_purchases" does not exist' } };
  const account = (sid) => acc.get(sid) || blankAccount(sid);
  const spendable = (a, earned) => earned + a.candy_bonus + a.candy_returned - a.candy_given - a.doge_cost_basis
    - a.candy_gifted_out + a.candy_gifted_in + a.candy_realized - a.candy_escrowed;
  const db = {
    async getDogeAccount(sid) { return { data: acc.get(sid) || null, error: null }; },
    async listDogeLedger(sid) { return { data: dogeLedger.filter((r) => r.student_id === sid), error: null }; },
    async dogeCoinFlows() { return { data: [], error: null }; },
    async findByStudentId(sid) { return { data: ROSTER.find((r) => r.student_id === sid) || null, error: null }; },
    // Model of park_key_buy (migration 0039).
    async parkKeyBuy({ p_sid, p_earned, p_day }) {
      if (missing0039) return missing;
      const a = { ...account(p_sid) };
      const seq = purchases.filter((p) => p.student_id === p_sid && p.school_day === p_day && !p.voided_at).length + 1;
      const price = keyPrice(seq);
      if (spendable(a, p_earned) < price - 1e-9) return { data: { status: 'insufficient', price, seq }, error: null };
      a.candy_gifted_out += price;
      acc.set(p_sid, a);
      const row = { receipt_id: newReceipt(), student_id: p_sid, school_day: p_day, seq, price,
        purchased_at: new Date(clock).toISOString(), granted_at: null, voided_at: null };
      purchases.push(row);
      dogeLedger.push({ student_id: p_sid, kind: 'key_buy', candy_delta: -price });
      return { data: { status: 'bought', receipt_id: row.receipt_id, price, seq, account: a }, error: null };
    },
    async parkKeyGranted(receiptId) {
      const p = purchases.find((row) => row.receipt_id === receiptId);
      if (p && !p.voided_at && !p.granted_at) p.granted_at = new Date(clock).toISOString();
      return { data: p || null, error: null };
    },
    async parkKeyRefund(receiptId) {
      const p = purchases.find((row) => row.receipt_id === receiptId);
      if (!p) return { data: blankAccount(null), error: null };
      if (p.voided_at || p.granted_at) return { data: account(p.student_id), error: null };
      p.voided_at = new Date(clock).toISOString();
      const a = { ...account(p.student_id) };
      a.candy_gifted_out = Math.max(0, a.candy_gifted_out - p.price);
      acc.set(p.student_id, a);
      dogeLedger.push({ student_id: p.student_id, kind: 'key_refund', candy_delta: p.price });
      return { data: a, error: null };
    },
    async getKeyPurchase(receiptId) {
      if (missing0039) return missing;
      return { data: purchases.find((row) => row.receipt_id === receiptId) || null, error: null };
    },
    async listPendingKeyPurchases(sid) {
      if (missing0039) return missing;
      return { data: purchases.filter((row) => (!sid || row.student_id === sid) && !row.granted_at && !row.voided_at), error: null };
    },
    async getRoleByStudentId() { return 'student'; },
    async listRoster() { return { data: ROSTER, error: null }; },
    async listKeyPurchases(sid) {
      if (missing0039) return missing;
      return { data: purchases.filter((row) => row.student_id === sid), error: null };
    },
  };
  const ledgerDb = { async getLedgerByStudent(sid) { return { data: ledgers[sid] || [], error: null }; } };
  // Default relay: always grants; counts keys per username.
  const parkKeys = new Map();
  const seen = new Set();
  const defaultGrant = async (payload) => {
    if (!seen.has(payload.receiptId)) {
      seen.add(payload.receiptId);
      parkKeys.set(payload.username, (parkKeys.get(payload.username) || 0) + 1);
    }
    return { outcome: 'granted', keys: parkKeys.get(payload.username) };
  };
  const grantFn = async (payload) => { grants.push(payload); return (grant || defaultGrant)(payload, grants.length); };
  const app = express();
  app.use(express.json());
  mountDogeWallet(app, {
    db, ledgerDb,
    verifyToken: (t) => (typeof t === 'string' && t.startsWith('tok:')) ? t.slice(4) : null,
    getPrice: async () => 0.088,
    ...(injectGrant ? { grantKey: grantFn } : {}),
    now: () => clock,
  });
  const server = http.createServer(app);
  return { server, acc, purchases, dogeLedger, grants, parkKeys, setClock: (ms) => { clock = ms; }, setGrant: (fn) => { grant = fn; } };
}

async function req(ctx, method, path, { token, body, secret } = {}) {
  await new Promise((r) => ctx.server.listen(0, r));
  const port = ctx.server.address().port;
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = 'Bearer ' + token;
  if (secret) headers['x-teacher-secret'] = secret;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  await new Promise((r) => ctx.server.close(r));
  return { status: res.status, body: json };
}
const buy = (ctx, sid, body) => req(ctx, 'POST', '/wallet/buy-key', { token: 'tok:' + sid, body: body || {} });
const wallet = (ctx, sid) => req(ctx, 'GET', '/wallet', { token: 'tok:' + sid });

describe('key price', () => {
  it('is 5, 8, 13, 21, 34, 55, 89 for the 1st..7th key of a day (F(n+4))', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(keyPrice)).toEqual([5, 8, 13, 21, 34, 55, 89]);
  });
});

describe('relay reply classification (never refund an indeterminate grant)', () => {
  it('only a 2xx ok is granted; only a 4xx { rejected: true } is refused; everything else is pending', () => {
    expect(classifyGrantReply(200, { ok: true, granted: true, keys: 2 })).toEqual({ outcome: 'granted', keys: 2 });
    expect(classifyGrantReply(200, { ok: true, granted: false, keys: 2 }).outcome).toBe('granted');   // duplicate receipt
    expect(classifyGrantReply(403, { ok: false, rejected: true, error: 'forbidden' }).outcome).toBe('refused');
    expect(classifyGrantReply(400, { ok: false, rejected: true }).outcome).toBe('refused');
    expect(classifyGrantReply(200, null).outcome).toBe('pending');                 // truncated / unparsable body
    expect(classifyGrantReply(503, { ok: false, error: 'key grant unavailable' }).outcome).toBe('pending');
    expect(classifyGrantReply(502, null).outcome).toBe('pending');
    expect(classifyGrantReply(404, { error: 'Cannot POST' }).outcome).toBe('pending');   // a 4xx without the relay's word
  });
});

describe('POST /wallet/buy-key', () => {
  it('charges 5, 8, 13, 21 for the day\'s keys; GET /wallet shows the NEXT price', async () => {
    const ctx = start({ ledgers: { [S1]: quizRows(200) } });   // 55.6 candy
    const w0 = await wallet(ctx, S1);
    expect(w0.body).toMatchObject({ keyPrice: 5, keysBoughtToday: 0, candyKeySpent: 0, keyPurchaseEnabled: true });
    const prices = [];
    for (let i = 0; i < 4; i++) {
      const r = await buy(ctx, S1);
      expect(r.status).toBe(200);
      prices.push(r.body.price);
      expect(r.body.keysBoughtToday).toBe(i + 1);
      expect(r.body.parkKeys).toBe(i + 1);
    }
    expect(prices).toEqual([5, 8, 13, 21]);
    const w = await wallet(ctx, S1);
    expect(w.body).toMatchObject({ keyPrice: 34, keysBoughtToday: 4, candyKeySpent: 47 });
    expect(w.body.candyBalance).toBeCloseTo(200 * 10 / 36 - 47, 6);
    expect(w.body.history.filter((h) => h.kind === 'key_buy').map((h) => h.candy_delta)).toEqual([-5, -8, -13, -21]);
    expect(ctx.purchases.every((p) => p.granted_at && !p.voided_at)).toBe(true);
  });

  it('sends the buyer\'s park identity to the relay with the receipt', async () => {
    const ctx = start({ ledgers: { [S1]: quizRows(36) } });
    const r = await buy(ctx, S1);
    expect(ctx.grants).toEqual([{ studentId: S1, receiptId: r.body.receiptId, username: 'ada', section: 'PeriodB', role: 'student' }]);
  });

  it('resets on the next America/New_York calendar day (not the UTC day)', async () => {
    const ctx = start({ ledgers: { [S1]: quizRows(200) } });
    ctx.setClock(Date.parse('2026-10-09T03:30:00Z'));   // Oct 8, 23:30 EDT
    expect((await buy(ctx, S1)).body.price).toBe(5);
    expect((await buy(ctx, S1)).body.price).toBe(8);
    ctx.setClock(Date.parse('2026-10-09T03:59:00Z'));   // still Oct 8 in New York
    expect((await wallet(ctx, S1)).body.keyPrice).toBe(13);
    ctx.setClock(Date.parse('2026-10-09T04:30:00Z'));   // Oct 9, 00:30 EDT
    const w = await wallet(ctx, S1);
    expect(w.body).toMatchObject({ keyPrice: 5, keysBoughtToday: 0, candyKeySpent: 13 });
    expect((await buy(ctx, S1)).body.price).toBe(5);
  });

  it('refuses when candy is short, naming the price; nothing is debited or granted', async () => {
    const ctx = start({ ledgers: { [S1]: quizRows(17) } });   // 4.7 candy
    const r = await buy(ctx, S1);
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/not enough candy \(the next key costs 5\)/);
    expect(ctx.grants).toEqual([]);
    expect(ctx.purchases).toEqual([]);
  });

  it('refunds and voids the purchase when the relay definitively refuses (502); the next key is still 5', async () => {
    const ctx = start({ ledgers: { [S1]: quizRows(36) }, grant: async () => ({ outcome: 'refused', error: 'relay 403' }) });
    const r = await buy(ctx, S1);
    expect(r.status).toBe(502);
    expect(r.body.refunded).toBe(true);
    expect(r.body.candyBalance).toBeCloseTo(10, 6);
    expect(ctx.grants.length).toBe(1);   // a definitive refusal is not retried
    expect(ctx.purchases[0].voided_at).toBeTruthy();
    const w = await wallet(ctx, S1);
    expect(w.body).toMatchObject({ keyPrice: 5, keysBoughtToday: 0, candyKeySpent: 0 });
    expect(w.body.history.map((h) => h.kind)).toEqual(['key_buy', 'key_refund']);
  });

  it('retries an indeterminate grant once with the SAME receipt (relay is idempotent)', async () => {
    const ctx = start({ ledgers: { [S1]: quizRows(36) },
      grant: async (payload, n) => (n === 1 ? { outcome: 'pending', error: 'socket hang up' } : { outcome: 'granted', keys: 1 }) });
    const r = await buy(ctx, S1);
    expect(r.status).toBe(200);
    expect(ctx.grants.length).toBe(2);
    expect(ctx.grants[0].receiptId).toBe(ctx.grants[1].receiptId);
  });

  it('two lost replies → 202 pending, candy HELD (never refunded); the next GET /wallet settles it to one key', async () => {
    // The relay commits each grant but both replies are lost (the review's probe).
    const relay = new Map();
    const committing = async (payload) => {
      relay.set(payload.receiptId, payload.username);
      return { outcome: 'pending', error: 'socket hang up' };
    };
    const ctx = start({ ledgers: { [S1]: quizRows(36) }, grant: committing });
    const r = await buy(ctx, S1);
    expect(r.status).toBe(202);
    expect(r.body).toMatchObject({ ok: true, pending: true, keysPending: 1, keysBoughtToday: 1, keyPrice: 8 });
    expect(r.body.candyBalance).toBeCloseTo(5, 6);           // still debited
    expect(ctx.grants.length).toBe(2);                         // one retry, same receipt
    expect(ctx.purchases[0].voided_at).toBeNull();
    expect(ctx.dogeLedger.some((h) => h.kind === 'key_refund')).toBe(false);
    // Still down: GET /wallet retries and keeps holding.
    expect((await wallet(ctx, S1)).body.keysPending).toBe(1);
    // The relay answers again: the duplicate receipt is confirmed, nothing extra is granted.
    ctx.setGrant(async (payload) => ({ outcome: 'granted', keys: relay.has(payload.receiptId) ? 1 : 0 }));
    const w = await wallet(ctx, S1);
    expect(w.body).toMatchObject({ keysPending: 0, keysBoughtToday: 1, candyKeySpent: 5 });
    expect(w.body.candyBalance).toBeCloseTo(5, 6);
    expect(relay.size).toBe(1);
    expect(ctx.purchases[0].granted_at).toBeTruthy();
    expect(ctx.dogeLedger.some((h) => h.kind === 'key_refund')).toBe(false);
  });

  it('the teacher sees held purchases and can reconcile them', async () => {
    let up = false;
    const ctx = start({ ledgers: { [S1]: quizRows(36) },
      grant: async () => (up ? { outcome: 'granted', keys: 1 } : { outcome: 'pending', error: 'timeout' }) });
    const bought = await buy(ctx, S1);
    expect(bought.status).toBe(202);
    expect((await req(ctx, 'GET', '/class/key-purchases/pending')).status).toBe(401);
    const list = await req(ctx, 'GET', '/class/key-purchases/pending', { secret: 'TS' });
    expect(list.body.pending).toEqual([expect.objectContaining({ receiptId: bought.body.receiptId, studentId: S1, price: 5 })]);
    up = true;
    const fixed = await req(ctx, 'POST', '/class/key-purchases/reconcile', { secret: 'TS', body: {} });
    expect(fixed.body).toEqual({ ok: true, stillPending: [] });
    expect((await req(ctx, 'GET', '/class/key-purchases/pending', { secret: 'TS' })).body.pending).toEqual([]);
  });

  it('a retry with { receiptId } is idempotent: grants a pending purchase once, then reports it granted', async () => {
    const ctx = start({ ledgers: { [S1]: quizRows(36) } });
    const bought = (await buy(ctx, S1)).body;
    // Pretend the relay granted but its reply was lost before granted_at was stamped.
    ctx.purchases[0].granted_at = null;
    const retry = await buy(ctx, S1, { receiptId: bought.receiptId });
    expect(retry.status).toBe(200);
    expect(ctx.grants.map((g) => g.receiptId)).toEqual([bought.receiptId, bought.receiptId]);
    expect(ctx.parkKeys.get('ada')).toBe(1);   // the relay saw the receipt twice, granted once
    const again = await buy(ctx, S1, { receiptId: bought.receiptId });
    expect(again.status).toBe(200);
    expect(again.body.alreadyGranted).toBe(true);
    expect(ctx.grants.length).toBe(2);       // a granted purchase is not re-sent
    expect(ctx.purchases.length).toBe(1);    // no second debit
    expect(again.body.candyBalance).toBeCloseTo(5, 6);
  });

  it('a retry of a refunded purchase is 409; someone else\'s receipt is 404', async () => {
    const ctx = start({ ledgers: { [S1]: quizRows(36), [S2]: quizRows(36) }, grant: async () => ({ outcome: 'refused', error: 'no' }) });
    const r = await buy(ctx, S1);
    expect((await buy(ctx, S1, { receiptId: r.body.receiptId })).status).toBe(409);
    expect((await buy(ctx, S2, { receiptId: r.body.receiptId })).status).toBe(404);
    expect((await buy(ctx, S1, { receiptId: 'not-a-uuid' })).status).toBe(404);
  });

  it('the teacher buys with candy received as a gift (no effort candy of their own)', async () => {
    const ctx = start({ accounts: { [T1]: { ...blankAccount(T1), candy_gifted_in: 6 } } });
    const r = await buy(ctx, T1);
    expect(r.status).toBe(200);
    expect(r.body.candyBalance).toBeCloseTo(1, 6);
    expect(ctx.grants[0]).toMatchObject({ username: 'mr', section: 'PeriodX', role: 'teacher' });
    expect((await buy(ctx, T1)).status).toBe(400);
  });

  it('KEY_PURCHASE_ENABLED off (any falsey spelling) → 403, and GET /wallet reports why', async () => {
    for (const v of ['false', '0', 'off', 'NO']) {
      process.env.KEY_PURCHASE_ENABLED = v;
      const ctx = start({ ledgers: { [S1]: quizRows(36) } });
      const r = await buy(ctx, S1);
      expect(r.status, 'KEY_PURCHASE_ENABLED=' + v).toBe(403);
      expect(r.body.error).toMatch(/turned off/);
      const w = await wallet(ctx, S1);
      expect(w.body).toMatchObject({ keyPurchaseEnabled: false, keyPurchaseOffReason: 'key buying is turned off' });
      expect(ctx.purchases).toEqual([]);
    }
  });

  it('503 when PARK_KEY_GRANT_SECRET is not set (nothing is debited)', async () => {
    const ctx = start({ ledgers: { [S1]: quizRows(36) }, injectGrant: false });
    const r = await buy(ctx, S1);
    expect(r.status).toBe(503);
    expect(ctx.purchases).toEqual([]);
    expect((await wallet(ctx, S1)).body.keyPurchaseEnabled).toBe(false);
  });

  it('503 before migration 0039; GET /wallet still works and reports buying off', async () => {
    const ctx = start({ ledgers: { [S1]: quizRows(36) }, missing0039: true });
    const r = await buy(ctx, S1);
    expect(r.status).toBe(503);
    expect(r.body.error).toMatch(/0039/);
    const w = await wallet(ctx, S1);
    expect(w.status).toBe(200);
    expect(w.body).toMatchObject({ keyPrice: null, keyPurchaseEnabled: false });
  });

  it('401 without a token', async () => {
    const ctx = start();
    expect((await req(ctx, 'POST', '/wallet/buy-key', { body: {} })).status).toBe(401);
  });
});
