// item-ledger-history-pg.test.js -- migration 0045 on real SQL (PGlite): the server
// keeps every overwritten ledger version in an append-only history table, without
// changing item_ledger or ever failing a write. This test is the trigger's first
// execution anywhere; nothing here touches a real database.

import { describe, it, beforeAll, beforeEach, afterAll, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FRQ_STUDENT_ID,
  createFrqDb,
  pgRecordFrqDraft,
  pgClaimFrqTickets,
  pgApplyFrqVerdict,
} from './fixtures/pg-frq.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = resolve(__dirname, '..', 'migrations');
const PAST_AT = '2000-01-01T00:00:00.000Z';
const OTHER_STUDENT = '22222222-2222-4222-8222-222222222222';

let db;

async function upsert({ studentId = FRQ_STUDENT_ID, itemId = 'WS-U1L1-Q1', response, score = null, tier = 'practice', receiptId = null }) {
  // The same INSERT ... ON CONFLICT DO UPDATE shape as ledger-db.js insertLedgerRow.
  await db.query(
    `insert into item_ledger (student_id, source, item_id, attempt, response, score, evidence_tier, recorded_at, receipt_id)
     values ($1, 'worksheet', $2, 1, $3::jsonb, $4, $5, now(), $6)
     on conflict (student_id, source, item_id, attempt) do update set
       response = excluded.response, score = excluded.score, evidence_tier = excluded.evidence_tier,
       recorded_at = excluded.recorded_at, receipt_id = excluded.receipt_id`,
    [studentId, itemId, JSON.stringify(response), score, tier, receiptId],
  );
}
const history = async () => (await db.query('select * from item_ledger_history order by history_id')).rows;
const current = async (itemId = 'WS-U1L1-Q1') => (await db.query(
  'select * from item_ledger where item_id = $1', [itemId])).rows;

beforeAll(async () => {
  db = await createFrqDb({ studentIds: [FRQ_STUDENT_ID, OTHER_STUDENT] });
  await db.exec(await readFile(resolve(MIGRATIONS, '0044_frq_draft_clears_receipt.sql'), 'utf8'));
  await db.exec(await readFile(resolve(MIGRATIONS, '0045_item_ledger_history.sql'), 'utf8'));
}, 60000);

beforeEach(async () => {
  // TRUNCATE fires no row triggers; clear both tables explicitly.
  await db.exec('truncate item_ledger_history; truncate item_ledger;');
});

afterAll(async () => { if (db) await db.close(); });

describe('migration 0045: item_ledger_history', () => {
  it('a first insert adds no history', async () => {
    await upsert({ response: 'mean' });
    expect(await history()).toHaveLength(0);
  });

  it('an overwrite with a new response keeps the old version; item_ledger keeps one row', async () => {
    await upsert({ response: 'mean', score: 1, receiptId: 'r-old' });
    const [before] = await current();
    await upsert({ response: 'median', score: 0 });
    const rows = await history();
    expect(rows).toHaveLength(1);
    expect(rows[0].response).toBe('mean');
    expect(Number(rows[0].score)).toBe(1);
    expect(rows[0].receipt_id).toBe('r-old');
    expect(rows[0].ledger_id).toBe(before.ledger_id);
    expect(rows[0].old_row.item_id).toBe('WS-U1L1-Q1');
    const now = await current();
    expect(now).toHaveLength(1);
    expect(now[0].response).toBe('median');
    expect(now[0].ledger_id).toBe(before.ledger_id);
  });

  it('an identical rewrite (new timestamp and receipt only) adds nothing', async () => {
    await upsert({ response: 'mean', score: 1, receiptId: 'r1' });
    await upsert({ response: 'mean', score: 1, receiptId: 'r2' });
    await db.query("update item_ledger set receipt_id = 'r3'");
    expect(await history()).toHaveLength(0);
  });

  it('a score-only change and an evidence-tier change each add one version', async () => {
    await upsert({ response: 'mean', score: null });
    await upsert({ response: 'mean', score: 1 });
    await upsert({ response: 'mean', score: 1, tier: 'proctored' });
    const rows = await history();
    expect(rows).toHaveLength(2);
    expect(rows[0].score).toBeNull();
    expect(rows[1].evidence_tier).toBe('practice');
  });

  it('FRQ: a new draft and a graded verdict each keep the prior version; claims add nothing', async () => {
    const long = (t) => `${t}: this response is comfortably longer than twenty chars.`;
    await pgRecordFrqDraft(db, { itemId: 'WS-U3L2-reflect2', response: long('one'), responseHash: 'sha256:one', readyAt: PAST_AT });
    await pgRecordFrqDraft(db, { itemId: 'WS-U3L2-reflect2', response: long('one'), responseHash: 'sha256:one', readyAt: PAST_AT });
    expect(await history()).toHaveLength(0);                 // identical replay
    const second = await pgRecordFrqDraft(db, { itemId: 'WS-U3L2-reflect2', response: long('two'), responseHash: 'sha256:two', readyAt: PAST_AT });
    expect(await history()).toHaveLength(1);                 // the old draft text
    const [claim] = await pgClaimFrqTickets(db, { worker: 'w' });
    expect(await history()).toHaveLength(1);                 // lease columns only
    const verdict = await pgApplyFrqVerdict(db, {
      ledgerId: second.ledger_id, claimToken: claim.frq_claim_token, responseVersion: claim.frq_response_version,
      score: 0.5, result: { responseHash: claim.frq_response_hash }, gradedAt: '2026-11-14T00:00:00.000Z',
    });
    expect(verdict.applied).toBe(true);
    const rows = await history();
    expect(rows).toHaveLength(2);                            // the ungraded version
    expect(rows[1].score).toBeNull();
  });

  it('a failing history insert never fails the ledger write', async () => {
    await upsert({ response: 'mean' });
    await db.exec('alter table item_ledger_history add constraint force_fail check (false) not valid');
    try {
      await upsert({ response: 'median' });
      const [row] = await current();
      expect(row.response).toBe('median');
      expect(await history()).toHaveLength(0);
    } finally {
      await db.exec('alter table item_ledger_history drop constraint force_fail');
    }
  });

  it('deleting the student from the roster also deletes their history', async () => {
    await upsert({ studentId: OTHER_STUDENT, response: 'mean' });
    await upsert({ studentId: OTHER_STUDENT, response: 'median' });
    expect(await history()).toHaveLength(1);
    await db.query('delete from roster where student_id = $1', [OTHER_STUDENT]);
    expect(await history()).toHaveLength(0);
  });

  it('is re-run safe', async () => {
    await db.exec(await readFile(resolve(MIGRATIONS, '0045_item_ledger_history.sql'), 'utf8'));
    await upsert({ response: 'mean' });
    await upsert({ response: 'median' });
    expect(await history()).toHaveLength(1);
  });
});
