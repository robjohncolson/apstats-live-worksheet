// park-key-purchase-pg.test.js — the REAL plpgsql of migration 0039 (park_key_buy / park_key_granted /
// park_key_refund / park_key_price) in pglite, on top of the real wallet migrations through 0034.
// Pins: the Fibonacci price per school day, the spendable guard, the debit landing in
// candy_gifted_out (so every existing guard sees it), refund-once, and granted-never-refunded.

import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWalletDb, pgAccount, pgSpend, pgNum } from './fixtures/pg-wallet.js';
import { keyPrice } from '../doge-econ.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SID = '00000000-0000-4000-8000-00000000b001';
const DAY = '2026-10-08';

let db;
beforeAll(async () => {
  db = await createWalletDb([SID]);
  await db.exec(await readFile(resolve(__dirname, '..', 'migrations', '0039_park_key_purchases.sql'), 'utf8'));
}, 60000);
afterAll(async () => { if (db) await db.close(); });
beforeEach(async () => { await db.exec('truncate doge_account, doge_ledger, park_key_purchases restart identity'); });

async function buy(earned, day = DAY) {
  const r = await db.query('select park_key_buy($1,$2,$3) as j', [SID, earned, day]);
  return r.rows[0].j;
}
async function refund(receipt) {
  const r = await db.query('select * from park_key_refund($1)', [receipt]);
  return r.rows[0];
}
async function granted(receipt) {
  const r = await db.query('select * from park_key_granted($1)', [receipt]);
  return r.rows[0];
}
async function ledgerKinds() {
  const r = await db.query('select kind, candy_delta from doge_ledger where student_id = $1 order by id', [SID]);
  return r.rows.map((row) => [row.kind, pgNum(row.candy_delta)]);
}

describe('migration 0039 — park key purchases (real SQL)', () => {
  it('park_key_price matches the JS keyPrice: 5, 8, 13, 21, 34, 55, 89', async () => {
    const r = await db.query('select array_agg(park_key_price(n) order by n) as p from generate_series(1, 7) n');
    expect(r.rows[0].p.map(Number)).toEqual([1, 2, 3, 4, 5, 6, 7].map(keyPrice));
  });

  it('charges the day\'s sequence into candy_gifted_out and refuses when spendable is short', async () => {
    const a = await buy(30);
    expect(a).toMatchObject({ status: 'bought', price: 5, seq: 1 });
    expect(a.receipt_id).toMatch(/^[0-9a-f-]{36}$/);
    expect((await buy(30)).price).toBe(8);
    expect((await buy(30)).price).toBe(13);
    const short = await buy(30);   // 30 − 26 = 4 < 21
    expect(short).toEqual({ status: 'insufficient', price: 21, seq: 4 });
    expect(pgNum((await pgAccount(db, SID)).candy_gifted_out)).toBe(26);
    expect(await ledgerKinds()).toEqual([['key_buy', -5], ['key_buy', -8], ['key_buy', -13]]);
    // The existing doge_spend guard sees the key debit: only 4 candy is left to convert.
    expect((await pgSpend(db, { p_sid: SID, p_earned: 30, p_candy: 5, p_kind: 'buy_doge', p_doge: 1 })).student_id).toBeNull();
    expect((await pgSpend(db, { p_sid: SID, p_earned: 30, p_candy: 4, p_kind: 'buy_doge', p_doge: 1 })).student_id).toBe(SID);
  });

  it('a new school day starts again at 5', async () => {
    await buy(100); await buy(100);
    expect((await buy(100, '2026-10-09')).price).toBe(5);
  });

  it('refund voids the row, restores the candy once, and frees that price slot', async () => {
    await buy(30); await buy(30);
    const third = await buy(30);
    const acct = await refund(third.receipt_id);
    expect(pgNum(acct.candy_gifted_out)).toBe(13);
    const again = await refund(third.receipt_id);   // a second refund changes nothing
    expect(pgNum(again.candy_gifted_out)).toBe(13);
    expect((await ledgerKinds()).slice(-1)).toEqual([['key_refund', 13]]);
    expect((await ledgerKinds()).filter(([kind]) => kind === 'key_refund').length).toBe(1);
    const row = await db.query('select voided_at from park_key_purchases where receipt_id = $1', [third.receipt_id]);
    expect(row.rows[0].voided_at).not.toBeNull();
    expect((await buy(30)).price).toBe(13);   // the 3rd live key of the day again
  });

  it('a granted purchase is never refunded; granting a voided one changes nothing', async () => {
    const a = await buy(30);
    const g = await granted(a.receipt_id);
    expect(g.granted_at).not.toBeNull();
    const acct = await refund(a.receipt_id);
    expect(pgNum(acct.candy_gifted_out)).toBe(5);
    const b = await buy(30);
    await refund(b.receipt_id);
    const late = await granted(b.receipt_id);
    expect(late.granted_at).toBeNull();
    expect(late.voided_at).not.toBeNull();
  });

  it('refund of an unknown receipt is a no-op (row of nulls)', async () => {
    const acct = await refund('00000000-0000-4000-8000-00000000dead');
    expect(acct.student_id).toBeNull();
  });
});
