// Real-SQL coverage for migration 0033. Route tests use an in-memory adapter;
// this suite pins the PostgreSQL locks, CAS versions, constraints, and payout
// trigger that make address promotion safe under concurrency.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const MIGRATION_DIR = resolve(process.cwd(), 'migrations');
const WALLET_MIGRATIONS = [
  '0019_doge_wallet.sql',
  '0021_doge_gifting.sql',
  '0022_retire_candy_eaten.sql',
  '0023_doge_sell.sql',
  '0024_tetris_stakes.sql',
  '0032_payout_batch.sql',
  '0033_wallet_address_proposals.sql',
];

const SID = '00000000-0000-4000-8000-000000000001';
const ADDRESS_OLD = `D${'A'.repeat(33)}`;
const ADDRESS_A = `D${'B'.repeat(33)}`;
const ADDRESS_B = `D${'C'.repeat(33)}`;

let db;
let migration0033;

async function addStudent({ sid = SID, role = 'student', status = 'active' } = {}) {
  await db.query(
    'insert into roster (student_id, role, status) values ($1, $2, $3)',
    [sid, role, status],
  );
}

async function propose(address, sid = SID) {
  const result = await db.query(
    'select student_id, doge_address, proposed_address, proposed_at::text from doge_propose_address($1, $2)',
    [sid, address],
  );
  return result.rows[0];
}

async function account(sid = SID) {
  const result = await db.query(
    'select * from doge_account where student_id = $1',
    [sid],
  );
  return result.rows[0] || null;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create table roster (
    student_id uuid primary key,
    section text default 'PeriodB',
    role text default 'student',
    status text default 'active',
    real_name text,
    login_username text,
    updated_at timestamptz default now()
  );`);

  for (const filename of WALLET_MIGRATIONS) {
    const sql = await readFile(resolve(MIGRATION_DIR, filename), 'utf8');
    await db.exec(sql);
    if (filename === '0033_wallet_address_proposals.sql') migration0033 = sql;
  }
}, 60_000);

beforeEach(async () => {
  await db.exec(`
    truncate payout_batch, doge_ledger, tetris_bet, doge_account restart identity;
    delete from roster;
  `);
});

afterAll(async () => {
  await db?.close();
});

describe('migration 0033 - install and proposal versions', () => {
  it('rolls back cleanly when migration 0032 is missing', async () => {
    const isolated = new PGlite();
    try {
      await isolated.exec(`create table roster (
        student_id uuid primary key,
        role text default 'student',
        status text default 'active'
      );`);
      await isolated.exec(await readFile(resolve(MIGRATION_DIR, '0019_doge_wallet.sql'), 'utf8'));

      await expect(isolated.exec(migration0033)).rejects.toThrow(/require migration 0032/i);
      await isolated.exec('rollback');
      const columns = await isolated.query(`
        select column_name
          from information_schema.columns
         where table_name = 'doge_account'
           and column_name in ('proposed_address', 'proposed_at', 'proposal_rejection_reason')
      `);
      expect(columns.rows).toEqual([]);
    } finally {
      await isolated.close();
    }
  });

  it('is rerunnable and keeps its RPCs unavailable to PUBLIC', async () => {
    await db.exec(migration0033);

    const result = await db.query(`
      select
        has_function_privilege(
          'public',
          'doge_propose_address(uuid,text)',
          'EXECUTE'
        ) as can_propose,
        has_function_privilege(
          'public',
          'doge_approve_address_proposal(uuid,timestamptz)',
          'EXECUTE'
        ) as can_approve
    `);

    expect(result.rows[0]).toEqual({ can_propose: false, can_approve: false });
  });

  it('keeps proposals inert and assigns a strictly newer CAS version', async () => {
    await addStudent();

    const first = await propose(ADDRESS_A);
    const second = await propose(ADDRESS_B);
    const comparison = await db.query(
      'select $2::timestamptz > $1::timestamptz as newer',
      [first.proposed_at, second.proposed_at],
    );

    expect(comparison.rows[0].newer).toBe(true);
    expect(await account()).toMatchObject({
      doge_address: null,
      proposed_address: ADDRESS_B,
      proposal_rejection_reason: null,
    });
  });

  it('allows only active student roster rows to propose', async () => {
    const archived = '00000000-0000-4000-8000-000000000002';
    const teacher = '00000000-0000-4000-8000-000000000003';
    await addStudent({ sid: archived, status: 'archived' });
    await addStudent({ sid: teacher, role: 'teacher' });

    await expect(propose(ADDRESS_A, archived)).rejects.toThrow(/not eligible/i);
    await expect(propose(ADDRESS_A, teacher)).rejects.toThrow(/not eligible/i);
    await expect(propose(ADDRESS_A, '00000000-0000-4000-8000-000000000004'))
      .rejects.toThrow(/not eligible/i);
    expect(await account(archived)).toBeNull();
    expect(await account(teacher)).toBeNull();
  });

  it('refuses approval after the roster row becomes archived', async () => {
    await addStudent();
    const pending = await propose(ADDRESS_A);
    await db.query("update roster set status = 'archived' where student_id = $1", [SID]);

    await expect(db.query(
      'select * from doge_approve_address_proposal($1, $2)',
      [SID, pending.proposed_at],
    )).rejects.toThrow(/not eligible/i);
    expect(await account()).toMatchObject({
      doge_address: null,
      proposed_address: ADDRESS_A,
    });
  });
});

describe('migration 0033 - review CAS and rejection state', () => {
  it('refuses a stale approval, then atomically promotes the reviewed version', async () => {
    await addStudent();
    const stale = await propose(ADDRESS_A);
    const current = await propose(ADDRESS_B);

    await expect(db.query(
      'select * from doge_approve_address_proposal($1, $2)',
      [SID, stale.proposed_at],
    )).rejects.toThrow(/proposal changed/i);
    expect(await account()).toMatchObject({
      doge_address: null,
      proposed_address: ADDRESS_B,
    });

    await db.query(
      'select * from doge_approve_address_proposal($1, $2)',
      [SID, current.proposed_at],
    );
    expect(await account()).toMatchObject({
      doge_address: ADDRESS_B,
      proposed_address: null,
      proposed_at: null,
      proposal_rejection_reason: null,
    });
  });

  it('persists a bounded rejection reason and clears it on a new proposal', async () => {
    await addStudent();
    const pending = await propose(ADDRESS_A);
    await db.query(`
      update doge_account
         set proposed_address = null,
             proposed_at = null,
             proposal_rejection_reason = $3
       where student_id = $1
         and proposed_at = $2
    `, [SID, pending.proposed_at, 'Use the teacher paper wallet instead.']);

    expect(await account()).toMatchObject({
      doge_address: null,
      proposed_address: null,
      proposal_rejection_reason: 'Use the teacher paper wallet instead.',
    });

    await propose(ADDRESS_B);
    expect((await account()).proposal_rejection_reason).toBeNull();
    await expect(db.query(
      'update doge_account set proposal_rejection_reason = $2 where student_id = $1',
      [SID, 'x'.repeat(241)],
    )).rejects.toThrow(/proposal_rejection/i);
  });
});

describe('migration 0033 - active payout address fence', () => {
  it.each(['pending', 'claimed'])(
    'blocks approval and paper-address writes during a %s batch',
    async (status) => {
      await addStudent();
      const approved = await propose(ADDRESS_OLD);
      await db.query(
        'select * from doge_approve_address_proposal($1, $2)',
        [SID, approved.proposed_at],
      );
      const replacement = await propose(ADDRESS_A);
      await db.query('update doge_account set doge_balance = 5 where student_id = $1', [SID]);

      const plan = {
        minPerStudent: 1,
        rows: [{ studentId: SID, address: ADDRESS_OLD, doge: 1 }],
        total: 1,
      };
      await db.query(`
        insert into payout_batch (status, plan, plan_hash)
        values ($1, $2::jsonb, $3)
      `, [status, JSON.stringify(plan), 'a'.repeat(64)]);

      await expect(db.query(
        'select * from doge_approve_address_proposal($1, $2)',
        [SID, replacement.proposed_at],
      )).rejects.toThrow(/active payout batch/i);
      await expect(db.query(
        'update doge_account set doge_address = $2 where student_id = $1',
        [SID, ADDRESS_B],
      )).rejects.toThrow(/active payout batch/i);
      expect(await account()).toMatchObject({
        doge_address: ADDRESS_OLD,
        proposed_address: ADDRESS_A,
      });

      await db.query("update payout_batch set status = 'cancelled'");
      await db.query(
        'select * from doge_approve_address_proposal($1, $2)',
        [SID, replacement.proposed_at],
      );
      expect((await account()).doge_address).toBe(ADDRESS_A);
    },
  );
});
