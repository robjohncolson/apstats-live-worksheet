import { issueLedgerReceipt, recordReceiptPersistFailure } from './receipts.js';
import { verifyRecord } from './snapshot-verify.js';
import { rowToRecord } from './admin-snapshot.js';

// Breaks that mean "our own receipt, but the row changed under it" (an in-place
// overwrite left the old receipt behind). Re-signing from the row's current content
// is safe for these: the signature itself verified against our issuer.
const STALE_KINDS = new Set(['score-tampered', 'response-tampered', 'attempt-tampered']);

let receiptPersistenceNotProvisionedLogged = false;

function rowReceiptArgs(row, username, ts) {
  return {
    studentId: row.student_id,
    username,
    source: row.source,
    itemId: row.item_id,
    score: row.score,
    attempt: row.attempt,
    evidenceTier: row.evidence_tier,
    response: row.response,
    ts
  };
}

function parsedRecordedAt(row) {
  const parsed = Date.parse(row && row.recorded_at);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function isReceiptPersistenceNotProvisioned(err) {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || '').toLowerCase();
  return code === '42703' || msg.includes('undefined_column') || msg.includes('undefined column');
}

function handleReceiptPersistenceError(err, ledgerId, errors) {
  if (isReceiptPersistenceNotProvisioned(err)) {
    if (!receiptPersistenceNotProvisionedLogged) {
      receiptPersistenceNotProvisionedLogged = true;
      console.info('receipt persistence not provisioned; continuing without stored receipt columns');
    }
    return;
  }

  recordReceiptPersistFailure();
  errors.push({ ledgerId, error: err && err.message ? err.message : String(err || 'Receipt persistence failed') });
}

export async function backfillStudentReceipts(rows, ledgerDb, username) {
  const errors = [];
  let receiptsBackfilled = 0;

  for (const row of Array.isArray(rows) ? rows : []) {
    try {
      if (!row || row.receipt_compact) continue;

      const issued = issueLedgerReceipt(rowReceiptArgs(row, username, parsedRecordedAt(row)));
      if (!issued) continue;

      row.receipt_id = issued.receiptId;
      row.receipt_compact = issued.compact;
      receiptsBackfilled += 1;

      if (!ledgerDb || typeof ledgerDb.updateLedgerReceipt !== 'function' || !row.ledger_id) continue;

      try {
        const result = await ledgerDb.updateLedgerReceipt(row.ledger_id, {
          receiptId: issued.receiptId,
          receiptCompact: issued.compact
        });
        if (result && result.error) {
          handleReceiptPersistenceError(result.error, row.ledger_id, errors);
        }
      } catch (err) {
        handleReceiptPersistenceError(err, row.ledger_id, errors);
      }
    } catch (err) {
      errors.push({
        ledgerId: row && row.ledger_id,
        itemId: row && row.item_id,
        error: err && err.message ? err.message : String(err || 'Backfill failed')
      });
    }
  }

  return { receiptsBackfilled, errors };
}

async function persistReceipt(row, issued, ledgerDb, errors) {
  if (!ledgerDb || typeof ledgerDb.updateLedgerReceipt !== 'function' || !row.ledger_id) return;
  try {
    const result = await ledgerDb.updateLedgerReceipt(row.ledger_id, {
      receiptId: issued.receiptId,
      receiptCompact: issued.compact
    });
    if (result && result.error) handleReceiptPersistenceError(result.error, row.ledger_id, errors);
  } catch (err) {
    handleReceiptPersistenceError(err, row.ledger_id, errors);
  }
}

// Repair (POST /class/backfill-receipts?resign=stale): for every row that HAS a
// receipt, run the snapshot verifier. A row whose receipt is ours but binds stale
// content (STALE_KINDS only) is re-signed from its CURRENT content. Anything else
// that fails (bad-signature, wrong-type, sid/item/source mismatch) is not ours to
// bless: it is reported in `refused` and left untouched.
// [pubKeys] = the issuer trust set as KeyObjects (snapshot-verify publicKeyFromX).
export async function resignStaleReceipts(rows, ledgerDb, username, pubKeys) {
  const errors = [];
  const resigned = [];
  const refused = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || !row.receipt_compact) continue;

    const check = verifyRecord(rowToRecord(row, row.student_id), pubKeys, row.student_id);
    if (check.ok) continue;

    const kinds = check.breaks.map((b) => b.kind);
    const entry = { ledgerId: row.ledger_id, itemId: row.item_id, source: row.source, attempt: row.attempt ?? 1, kinds };
    if (!kinds.every((kind) => STALE_KINDS.has(kind))) {
      refused.push(entry);
      continue;
    }

    const issued = issueLedgerReceipt(rowReceiptArgs(row, username, parsedRecordedAt(row)));
    if (!issued) {
      errors.push({ ledgerId: row.ledger_id, itemId: row.item_id, error: 'receipt issuer unavailable' });
      continue;
    }

    row.receipt_id = issued.receiptId;
    row.receipt_compact = issued.compact;
    resigned.push(entry);
    await persistReceipt(row, issued, ledgerDb, errors);
  }

  return { receiptsResigned: resigned.length, resigned, refused, errors };
}
