// payout-conservation.test.js -- P2/I1-I9 plus the real reserved payout SQL.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPayoutPlan, hashClaimToken, hashPayoutPlan } from '../payout.js';
import {
  applyOp,
  checkDeltaInvariants,
  checkStateInvariants,
  deriveNumbers,
  initState,
  studentIds,
} from './fixtures/wallet-world.js';
import { createWalletDb, resetWallet } from './fixtures/pg-wallet.js';
import { createJournalIntent, planSends } from '../../tools/lib/doge-send-core.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(__dirname, '..', 'migrations', '0032_payout_batch.sql');
const SIDS = studentIds(3);
const [SID_A, SID_B, SID_C] = SIDS;
const BATCH_A = '20000000-0000-4000-8000-000000000001';
const TXID_A = 'a'.repeat(64);
const TXID_B = 'b'.repeat(64);
const CLAIM_A = '30000000-0000-4000-8000-000000000001';
const CLAIM_B = '30000000-0000-4000-8000-000000000002';
const CLAIM_HASH_A = hashClaimToken(CLAIM_A);
const CLAIM_HASH_B = hashClaimToken(CLAIM_B);
const KOINU = 100_000_000;

const toKoinu = (doge) => Math.round(Number(doge) * KOINU);

function step(state, op) {
  const result = applyOp(state, op);
  const violations = [
    ...checkStateInvariants(result.state),
    ...checkDeltaInvariants(state, result.state, op, result.accepted),
  ];
  expect(violations, JSON.stringify(op)).toEqual([]);
  return result;
}

describe('P2 through the canonical wallet world (I1-I9)', () => {
  it('makes plan, sendmany, and complete deltas exactly equal', () => {
    let state = initState([100, 100, 100]);
    const prelude = [
      { op: 'gift', from: SID_A, to: SID_B, candy: 3 },
      { op: 'betOpen', match: 'payout-bet', a: SID_B, b: SID_C, stake: 2 },
      { op: 'betRefund', match: 'payout-bet' },
      { op: 'buy', sid: SID_A, candy: 12.5, price: 0.036, ageHours: 48 },
      { op: 'buy', sid: SID_B, candy: 7.25, price: 0.036, ageHours: 48 },
      { op: 'buy', sid: SID_C, candy: 4, price: 0.036, ageHours: 48 },
      { op: 'sell', sid: SID_A, doge: 1, price: 0.036, holdHours: 24 },
      { op: 'markGiven', sid: SID_C, amount: 1 },
    ];
    for (const op of prelude) {
      const result = step(state, op);
      expect(result.accepted, JSON.stringify(op)).toBe(true);
      state = result.state;
    }

    const addresses = new Map([
      [SID_A, 'DSharedAddress'],
      [SID_B, 'DSharedAddress'],
      [SID_C, 'DDustAddress'],
    ]);
    const accounts = state.sids.map((studentId) => {
      const numbers = deriveNumbers(state, studentId);
      return {
        student_id: studentId,
        doge_address: addresses.get(studentId),
        doge_balance: numbers.dogeBalance,
        doge_sent: numbers.dogeSent,
      };
    });
    const plan = buildPayoutPlan(accounts);
    expect(plan.rows.map((row) => row.studentId)).toEqual([SID_A, SID_B]);

    const sendPlan = planSends(plan.rows.map((row) => ({
      studentId: row.studentId,
      dogeAddress: row.address,
      dogeToDeposit: row.doge,
    })));
    const journal = createJournalIntent(sendPlan, {
      batchId: BATCH_A,
      comment: `${BATCH_A}:${hashPayoutPlan(plan)}`,
      now: () => new Date('2026-09-01T00:00:00.000Z'),
    });
    expect(journal.outputs).toEqual({ DSharedAddress: plan.total });

    let completed = state;
    let appliedKoinu = 0;
    for (const row of plan.rows) {
      const result = step(completed, { op: 'markSent', sid: row.studentId, amount: row.doge });
      expect(result.accepted).toBe(true);
      appliedKoinu += toKoinu(
        deriveNumbers(result.state, row.studentId).dogeSent
        - deriveNumbers(completed, row.studentId).dogeSent,
      );
      completed = result.state;
    }

    const planKoinu = plan.rows.reduce((sum, row) => sum + toKoinu(row.doge), 0);
    const sendmanyKoinu = Object.values(journal.outputs)
      .reduce((sum, doge) => sum + toKoinu(doge), 0);
    expect(toKoinu(plan.total)).toBe(planKoinu);
    expect(appliedKoinu).toBe(planKoinu);
    expect(sendmanyKoinu).toBe(planKoinu);
    expect(checkStateInvariants(completed)).toEqual([]);

    let replayed = completed;
    let replayDeltaKoinu = 0;
    for (const row of plan.rows) {
      const result = step(replayed, { op: 'markSent', sid: row.studentId, amount: row.doge });
      replayDeltaKoinu += toKoinu(
        deriveNumbers(result.state, row.studentId).dogeSent
        - deriveNumbers(replayed, row.studentId).dogeSent,
      );
      replayed = result.state;
    }
    expect(replayDeltaKoinu).toBe(0);
    expect(checkStateInvariants(replayed)).toEqual([]);
    expect(deriveNumbers(replayed, SID_C).dogeSent).toBe(0);
  });
});

let pg;

async function resetPayoutSql() {
  await pg.exec('truncate payout_batch;');
  await resetWallet(pg);
}

async function seedSqlAccounts(entries, { buyLedger = false } = {}) {
  for (const [studentId, address, balance, sent = 0] of entries) {
    await pg.query(
      `insert into doge_account (student_id, doge_address, doge_balance, doge_sent)
       values ($1, $2, $3, $4)`,
      [studentId, address, balance, sent],
    );
    if (buyLedger) {
      await pg.query(
        `insert into doge_ledger
           (student_id, ts, kind, candy_delta, doge_delta, doge_price_usd, candy_per_doge)
         values ($1, now() - interval '48 hours', 'buy_doge', 0, $2, 0.1, 10)`,
        [studentId, balance],
      );
    }
  }
}

function sqlPlan(rows) {
  return {
    minPerStudent: 5,
    rows: rows.map(([studentId, address, doge]) => ({ studentId, address, doge })),
    total: rows.reduce((sum, row) => sum + row[2], 0),
  };
}

async function insertSqlBatch(plan) {
  const result = await pg.query(
    'select * from payout_create($1::jsonb, $2::text)',
    [JSON.stringify(plan), hashPayoutPlan(plan)],
  );
  return result.rows[0];
}

async function claimSql(batchId, claimTokenHash = CLAIM_HASH_A) {
  return pg.query(
    `update payout_batch
        set status = 'claimed', claim_token_hash = $2, claimed_at = now()
      where batch_id = $1 and status = 'pending' and claim_token_hash is null
      returning *`,
    [batchId, claimTokenHash],
  );
}

async function armSql(batchId, claimTokenHash = CLAIM_HASH_A) {
  const result = await pg.query(
    'select payout_arm($1::uuid, $2::text) as value',
    [batchId, claimTokenHash],
  );
  return result.rows[0].value;
}

async function recordSql(batchId, txid = TXID_A, claimTokenHash = CLAIM_HASH_A) {
  return pg.query(
    'select * from payout_record_broadcast($1::uuid, $2::text, $3::text)',
    [batchId, claimTokenHash, txid],
  );
}

async function completeSql(batchId, txid, outputs, receipts = [], claimTokenHash = CLAIM_HASH_A) {
  return pg.query(
    'select * from payout_complete($1::uuid, $2::text, $3::text, $4::jsonb, $5::jsonb)',
    [batchId, claimTokenHash, txid, JSON.stringify(outputs), JSON.stringify(receipts)],
  );
}

beforeAll(async () => {
  pg = await createWalletDb(SIDS);
  const sql = await readFile(MIGRATION, 'utf8');
  await pg.exec(sql);
  await pg.exec(sql); // USER-RUN migration can safely be pasted twice.
}, 60_000);

afterAll(async () => {
  if (pg) await pg.close();
});

describe('payout reservation and completion against real PostgreSQL', () => {
  it('installs the final sentinel and revokes public execution on every payout function', async () => {
    expect((await pg.query('select payout_probe() as ready')).rows[0].ready).toBe(true);
    const privileges = await pg.query(`
      select
        has_table_privilege('public', 'payout_batch', 'select') as table_select_ok,
        has_table_privilege('public', 'payout_batch', 'insert') as table_insert_ok,
        has_function_privilege('public', 'payout_probe()', 'execute') as probe_ok,
        has_function_privilege('public', 'payout_create(jsonb,text)', 'execute') as create_ok,
        has_function_privilege('public', 'payout_guard_reserved_doge()', 'execute') as guard_ok,
        has_function_privilege('public', 'payout_arm(uuid,text)', 'execute') as arm_ok,
        has_function_privilege('public', 'payout_record_broadcast(uuid,text,text)', 'execute') as record_ok,
        has_function_privilege('public', 'payout_complete(uuid,text,text,jsonb,jsonb)', 'execute') as complete_ok
    `);
    expect(privileges.rows[0]).toEqual({
      table_select_ok: false,
      table_insert_ok: false,
      probe_ok: false,
      create_ok: false,
      guard_ok: false,
      arm_ok: false,
      record_ok: false,
      complete_ok: false,
    });
  });

  it('rolls back every first-install object when an explicit transaction is interrupted', async () => {
    const partial = await createWalletDb([SID_A]);
    try {
      const migration = await readFile(MIGRATION, 'utf8');
      const rlsBoundary = migration.indexOf('alter table payout_batch enable row level security;');
      expect(rlsBoundary).toBeGreaterThan(-1);

      const exposedPrefix = migration.slice(0, rlsBoundary);
      await partial.exec(exposedPrefix);
      expect((await partial.query("select to_regclass('payout_batch') as table_name"))
        .rows[0].table_name).toBe('payout_batch');

      await partial.exec('rollback;');
      expect((await partial.query("select to_regclass('payout_batch') as table_name"))
        .rows[0].table_name).toBeNull();
      expect((await partial.query("select to_regprocedure('payout_probe()') as probe_name"))
        .rows[0].probe_name).toBeNull();
    } finally {
      await partial.close();
    }
  }, 30_000);

  it('blocks reserved sell/manual marks but allows excess changes and buys', async () => {
    await resetPayoutSql();
    await seedSqlAccounts([[SID_A, 'DAddressA', 10, 0]], { buyLedger: true });
    const plan = sqlPlan([[SID_A, 'DAddressA', 7.5]]);
    await insertSqlBatch(plan);

    await expect(pg.query(
      'select * from doge_sell($1, $2, $3, $4, $5)',
      [SID_A, 3, 10, 0.1, 24],
    )).rejects.toThrow(/reserved amount/);
    await expect(pg.query(
      "select * from doge_mark($1, 'doge_sent', $2, 0)",
      [SID_A, 3],
    )).rejects.toThrow(/reserved amount/);

    await pg.query(
      'select * from doge_sell($1, $2, $3, $4, $5)',
      [SID_A, 2, 10, 0.1, 24],
    );
    await pg.query(
      "select * from doge_spend($1, $2, $3, 'buy_doge', $4, $5, $6)",
      [SID_A, 100, 1, 1, 0.1, 10],
    );
    await pg.query("select * from doge_mark($1, 'doge_sent', $2, 0)", [SID_A, 1]);
    const account = (await pg.query(
      'select doge_balance, doge_sent from doge_account where student_id = $1',
      [SID_A],
    )).rows[0];
    expect(Number(account.doge_balance)).toBe(9);
    expect(Number(account.doge_sent)).toBe(1);
    expect(Number(account.doge_balance) - Number(account.doge_sent)).toBeGreaterThanOrEqual(7.5);
  }, 30_000);

  it('keeps the reservation guard live across an interrupted idempotent rerun', async () => {
    await resetPayoutSql();
    await seedSqlAccounts([[SID_A, 'DAddressA', 10, 0]], { buyLedger: true });
    await insertSqlBatch(sqlPlan([[SID_A, 'DAddressA', 7.5]]));

    const migration = await readFile(MIGRATION, 'utf8');
    const guardStart = migration.indexOf('create or replace function payout_guard_reserved_doge()');
    const triggerStart = migration.indexOf('do $reservation_trigger$', guardStart);
    const armStart = migration.indexOf('-- Arm is the durable pre-broadcast fence', triggerStart);
    expect(guardStart).toBeGreaterThan(-1);
    expect(triggerStart).toBeGreaterThan(guardStart);
    expect(armStart).toBeGreaterThan(triggerStart);

    const functionReplacement = migration.slice(guardStart, triggerStart);
    const triggerInstallation = migration.slice(triggerStart, armStart);
    expect(triggerInstallation).not.toMatch(/drop\s+trigger/i);

    // Simulate a statement-by-statement runner stopping after either statement.
    await pg.exec(functionReplacement);
    await expect(pg.query(
      'select * from doge_sell($1, $2, $3, $4, $5)',
      [SID_A, 3, 10, 0.1, 24],
    )).rejects.toThrow(/reserved amount/);
    await expect(pg.query(
      'delete from roster where student_id = $1',
      [SID_A],
    )).rejects.toThrow(/reserved amount/);

    await pg.exec(triggerInstallation);
    await expect(pg.query(
      'select * from doge_sell($1, $2, $3, $4, $5)',
      [SID_A, 3, 10, 0.1, 24],
    )).rejects.toThrow(/reserved amount/);
  }, 30_000);

  it('releases reservations on cancel and unarmed failure, but never after arm', async () => {
    await resetPayoutSql();
    await seedSqlAccounts([[SID_A, 'DAddressA', 5, 0]]);
    const plan = sqlPlan([[SID_A, 'DAddressA', 5]]);
    const cancelled = await insertSqlBatch(plan);
    await pg.query(
      "update payout_batch set status = 'cancelled', resolved_at = now() where batch_id = $1 and status = 'pending'",
      [cancelled.batch_id],
    );
    await pg.query("select * from doge_mark($1, 'doge_sent', 5, 0)", [SID_A]);
    expect(Number((await pg.query(
      'select doge_sent from doge_account where student_id = $1', [SID_A],
    )).rows[0].doge_sent)).toBe(5);

    await resetPayoutSql();
    await seedSqlAccounts([[SID_A, 'DAddressA', 5, 0]]);
    const failed = await insertSqlBatch(plan);
    await claimSql(failed.batch_id);
    const failure = await pg.query(
      `update payout_batch set status = 'failed', error = 'payout agent failed', resolved_at = now()
        where batch_id = $1 and status = 'claimed' and claim_token_hash = $2
          and broadcast_at is null and txid is null returning *`,
      [failed.batch_id, CLAIM_HASH_A],
    );
    expect(failure.rows).toHaveLength(1);
    await pg.query("select * from doge_mark($1, 'doge_sent', 5, 0)", [SID_A]);

    await resetPayoutSql();
    await seedSqlAccounts([[SID_A, 'DAddressA', 5, 0]]);
    const armed = await insertSqlBatch(plan);
    await claimSql(armed.batch_id);
    await armSql(armed.batch_id);
    const armedFailure = await pg.query(
      `update payout_batch set status = 'failed'
        where batch_id = $1 and status = 'claimed' and claim_token_hash = $2
          and broadcast_at is null and txid is null returning *`,
      [armed.batch_id, CLAIM_HASH_A],
    );
    expect(armedFailure.rows).toHaveLength(0);
    await expect(pg.query(
      "select * from doge_mark($1, 'doge_sent', 5, 0)", [SID_A],
    )).rejects.toThrow(/reserved amount/);
  }, 30_000);

  it('rejects stale atomic creates and enforces one active reservation', async () => {
    await resetPayoutSql();
    await seedSqlAccounts([[SID_A, 'DAddressA', 7.5, 0]]);
    const plan = sqlPlan([[SID_A, 'DAddressA', 7.5]]);
    await pg.query(
      'update doge_account set doge_balance = 7 where student_id = $1',
      [SID_A],
    );
    await expect(insertSqlBatch(plan)).rejects.toThrow(/reservation is stale/);
    expect((await pg.query('select count(*)::int as n from payout_batch')).rows[0].n).toBe(0);

    await pg.query(
      'update doge_account set doge_balance = 7.5 where student_id = $1',
      [SID_A],
    );
    await insertSqlBatch(plan);
    await expect(insertSqlBatch(plan)).rejects.toThrow(/unique/i);
    expect((await pg.query('select count(*)::int as n from payout_batch')).rows[0].n).toBe(1);
  }, 30_000);

  it('returns exactly one fresh arm and fences different claim tokens', async () => {
    await resetPayoutSql();
    await seedSqlAccounts([[SID_A, 'DAddressA', 5, 0]]);
    const batch = await insertSqlBatch(sqlPlan([[SID_A, 'DAddressA', 5]]));
    expect((await claimSql(batch.batch_id)).rows).toHaveLength(1);
    expect((await claimSql(batch.batch_id)).rows).toHaveLength(0);

    const arms = await Promise.all([
      armSql(batch.batch_id),
      armSql(batch.batch_id),
    ]);
    expect(arms.map((value) => value.replayed).sort()).toEqual([false, true]);
    expect(arms.every((value) => value.batch.broadcast_at)).toBe(true);
    await expect(armSql(batch.batch_id, CLAIM_HASH_B)).rejects.toThrow(/cannot be armed/);
    await expect(recordSql(batch.batch_id, TXID_A, CLAIM_HASH_B))
      .rejects.toThrow(/not armed by this claimant/);
  }, 30_000);

  it('marks exact amounts, attaches the receipt to the exact ledger identity, and replays once', async () => {
    await resetPayoutSql();
    await seedSqlAccounts([
      [SID_A, 'DAddressA', 10, 2.5],
      [SID_B, 'DAddressB', 7.5, 0],
    ]);
    const plan = sqlPlan([
      [SID_A, 'DAddressA', 7.5],
      [SID_B, 'DAddressB', 7.5],
    ]);
    const batch = await insertSqlBatch(plan);
    await claimSql(batch.batch_id);
    await armSql(batch.batch_id);
    await recordSql(batch.batch_id, TXID_A.toUpperCase());
    const outputs = plan.rows.map(({ studentId, doge }) => ({ studentId, doge })).reverse();
    const receipts = [{
      studentId: SID_A,
      receiptId: 'receipt-a',
      receiptCompact: 'compact-a',
    }];

    const completed = await completeSql(batch.batch_id, TXID_A, outputs, receipts);
    expect(completed.rows[0].status).toBe('sent');
    expect(completed.rows[0].txid).toBe(TXID_A);
    const accounts = await pg.query(
      'select student_id, doge_sent from doge_account order by student_id',
    );
    expect(accounts.rows.map((row) => Number(row.doge_sent))).toEqual([10, 7.5]);
    const ledger = await pg.query(
      `select student_id, kind, doge_delta, receipt_id, receipt_compact
         from doge_ledger order by id`,
    );
    expect(ledger.rows).toHaveLength(plan.rows.length);
    expect(ledger.rows.map((row) => Number(row.doge_delta))).toEqual([-7.5, -7.5]);
    expect(ledger.rows[0]).toMatchObject({
      student_id: SID_A,
      kind: 'send',
      receipt_id: 'receipt-a',
      receipt_compact: 'compact-a',
    });
    expect(ledger.rows[1].receipt_id).toBeNull();

    const replay = await completeSql(batch.batch_id, TXID_A, [], []);
    expect(replay.rows[0].status).toBe('sent');
    expect((await pg.query('select count(*)::int as n from doge_ledger')).rows[0].n)
      .toBe(plan.rows.length);
    await expect(recordSql(batch.batch_id, TXID_B)).rejects.toThrow(/different txid/);
  }, 30_000);

  it('keeps the recorded txid across exact-output and forced post-mark rollbacks', async () => {
    await resetPayoutSql();
    await seedSqlAccounts([
      [SID_A, 'DAddressA', 7.5, 0],
      [SID_B, 'DAddressB', 7.5, 0],
    ]);
    const plan = sqlPlan([
      [SID_A, 'DAddressA', 7.5],
      [SID_B, 'DAddressB', 7.5],
    ]);
    const batch = await insertSqlBatch(plan);
    await claimSql(batch.batch_id);
    await armSql(batch.batch_id);
    await recordSql(batch.batch_id);

    await expect(completeSql(batch.batch_id, TXID_A, [
      { studentId: SID_A, doge: 7.5 },
    ])).rejects.toThrow(/outputs do not match frozen plan/);
    let stored = (await pg.query(
      'select status, txid from payout_batch where batch_id = $1', [batch.batch_id],
    )).rows[0];
    expect(stored).toMatchObject({ status: 'claimed', txid: TXID_A });

    await pg.exec(`alter table doge_ledger
      add constraint payout_test_no_send check (kind <> 'send');`);
    try {
      await expect(completeSql(
        batch.batch_id,
        TXID_A,
        plan.rows.map(({ studentId, doge }) => ({ studentId, doge })),
      )).rejects.toThrow();
    } finally {
      await pg.exec('alter table doge_ledger drop constraint payout_test_no_send;');
    }

    const accounts = await pg.query('select doge_sent from doge_account order by student_id');
    expect(accounts.rows.map((row) => Number(row.doge_sent))).toEqual([0, 0]);
    expect((await pg.query('select count(*)::int as n from doge_ledger')).rows[0].n).toBe(0);
    stored = (await pg.query(
      'select status, txid from payout_batch where batch_id = $1', [batch.batch_id],
    )).rows[0];
    expect(stored).toMatchObject({ status: 'claimed', txid: TXID_A });
    expect((await armSql(batch.batch_id)).replayed).toBe(true);
    await expect(recordSql(batch.batch_id, TXID_B)).rejects.toThrow(/different txid/);
  }, 30_000);

  it('blocks roster cascade deletion while DOGE is reserved and releases it on cancel', async () => {
    await resetPayoutSql();
    await seedSqlAccounts([[SID_A, 'DAddressA', 5, 0]]);
    const batch = await insertSqlBatch(sqlPlan([[SID_A, 'DAddressA', 5]]));

    await expect(pg.query(
      'delete from roster where student_id = $1 returning student_id',
      [SID_A],
    )).rejects.toThrow(/reserved amount/);
    expect((await pg.query(
      'select count(*)::int as n from doge_account where student_id = $1',
      [SID_A],
    )).rows[0].n).toBe(1);

    await pg.query(
      "update payout_batch set status = 'cancelled', resolved_at = now() where batch_id = $1",
      [batch.batch_id],
    );
    const deleted = await pg.query(
      'delete from roster where student_id = $1 returning student_id',
      [SID_A],
    );
    expect(deleted.rows).toHaveLength(1);
    expect((await pg.query(
      'select count(*)::int as n from doge_account where student_id = $1',
      [SID_A],
    )).rows[0].n).toBe(0);
  }, 30_000);
});
