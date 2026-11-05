// frq-receipt-clear-pg.test.js -- migration 0044 on real SQL (PGlite): an FRQ
// row never keeps a receipt for content it no longer holds, and the draft
// receipt writer can never overwrite a graded row or a newer draft.

import { describe, it, beforeAll, beforeEach, afterAll, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFrqLedgerDb } from '../frq-ledger-db.js';
import {
  FRQ_STUDENT_ID,
  createFrqDb,
  resetFrqDb,
  pgRecordFrqDraft,
  pgClaimFrqTickets,
  pgApplyFrqVerdict,
  pgFrqRow,
  createPgliteFrqClient,
} from './fixtures/pg-frq.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_0044 = resolve(__dirname, '..', 'migrations', '0044_frq_draft_clears_receipt.sql');
const PAST_AT = '2000-01-01T00:00:00.000Z';
const ITEM = 'WS-U3L2-reflect2';
const longText = (label) => `${label}: this response is comfortably longer than twenty chars.`;

let db;

beforeAll(async () => {
  db = await createFrqDb();
  await db.exec(await readFile(MIGRATION_0044, 'utf8'));
}, 60000);

beforeEach(async () => {
  await resetFrqDb(db);
});

afterAll(async () => {
  if (db) await db.close();
});

function draft(label) {
  return pgRecordFrqDraft(db, {
    studentId: FRQ_STUDENT_ID, itemId: ITEM, response: longText(label), responseHash: `sha256:${label}`, readyAt: PAST_AT,
  });
}

async function setReceipt(ledgerId, id) {
  await db.query('update item_ledger set receipt_id = $1, receipt_compact = $2 where ledger_id = $3', [id, `${id}.sig`, ledgerId]);
}

describe('migration 0044 record_frq_draft', () => {
  it('clears the receipt when an ungraded response is replaced', async () => {
    const first = await draft('one');
    await setReceipt(first.ledger_id, 'r1');

    const second = await draft('two');
    const row = await pgFrqRow(db, second.ledger_id);

    expect(Number(second.response_version)).toBe(2);
    expect(row.receipt_id).toBeNull();
    expect(row.receipt_compact).toBeNull();
  });

  it('keeps the receipt on an identical replay', async () => {
    const first = await draft('one');
    await setReceipt(first.ledger_id, 'r1');

    await draft('one');
    const row = await pgFrqRow(db, first.ledger_id);
    expect(row.receipt_id).toBe('r1');
  });

  it('keeps the receipt (and response) of a graded row', async () => {
    const first = await draft('one');
    const [claim] = await pgClaimFrqTickets(db, { worker: 'w' });
    await pgApplyFrqVerdict(db, {
      ledgerId: first.ledger_id, claimToken: claim.frq_claim_token, responseVersion: claim.frq_response_version,
      score: 1, result: { responseHash: claim.frq_response_hash }, gradedAt: PAST_AT,
    });
    await setReceipt(first.ledger_id, 'graded');

    await draft('two');
    const row = await pgFrqRow(db, first.ledger_id);
    expect(row.receipt_id).toBe('graded');
    expect(row.response).toBe(longText('one'));
  });
});

describe('migration 0044 apply_frq_verdict', () => {
  it('clears the old receipt when the verdict changes the score', async () => {
    const first = await draft('one');
    await setReceipt(first.ledger_id, 'draft-receipt');
    const [claim] = await pgClaimFrqTickets(db, { worker: 'w' });

    const verdict = await pgApplyFrqVerdict(db, {
      ledgerId: first.ledger_id, claimToken: claim.frq_claim_token, responseVersion: claim.frq_response_version,
      score: 0.5, result: { responseHash: claim.frq_response_hash }, gradedAt: PAST_AT,
    });
    const row = await pgFrqRow(db, first.ledger_id);

    expect(verdict.applied).toBe(true);
    expect(Number(row.score)).toBe(0.5);
    expect(row.receipt_id).toBeNull();
    expect(row.receipt_compact).toBeNull();
  });
});

describe('updateFrqDraftReceipt', () => {
  it('persists only while the row is ungraded and on the signed response version', async () => {
    const adapter = createFrqLedgerDb(createPgliteFrqClient(db));
    const first = await draft('one');

    const stale = await adapter.updateFrqDraftReceipt(first.ledger_id, 99, 'r-old', 'r-old.sig');
    expect(stale.matched).toBe(false);

    const current = await adapter.updateFrqDraftReceipt(first.ledger_id, Number(first.response_version), 'r1', 'r1.sig');
    expect(current.matched).toBe(true);
    expect((await pgFrqRow(db, first.ledger_id)).receipt_id).toBe('r1');

    const [claim] = await pgClaimFrqTickets(db, { worker: 'w' });
    await pgApplyFrqVerdict(db, {
      ledgerId: first.ledger_id, claimToken: claim.frq_claim_token, responseVersion: claim.frq_response_version,
      score: 1, result: { responseHash: claim.frq_response_hash }, gradedAt: PAST_AT,
    });
    const late = await adapter.updateFrqDraftReceipt(first.ledger_id, Number(first.response_version), 'r-late', 'r-late.sig');
    expect(late.matched).toBe(false);
    expect((await pgFrqRow(db, first.ledger_id)).receipt_id).toBeNull();
  });
});
