// admin-restore.js — POST /admin/restore (teacher-gated): FAITHFUL disaster recovery
// from a verified mirror. Unlike /ledger/import (offline self-reported work → clamps
// scores to 0..1, forces evidence_tier='practice', RE-ISSUES receipts), restore replays
// ONLY records bearing a valid signature from THIS server's issuer key, byte-for-byte:
//   - score preserved AS-IS (no 0..1 clamp — the *-DESK_DONE completion rows carry 0..100)
//   - evidence_tier taken from the SIGNED payload (so 'proctored' restores as proctored)
//   - recorded_at preserved (so the recomputed commit-chain heads match the anchor)
//   - the ORIGINAL receipt is preserved, not re-issued
//
// This is strictly safe: it can only write what the issuer already signed (a forged or
// tampered record fails verifyRecord and is skipped), so it needs no 0..1 clamp.
// See GRADE_LEDGER_DURABILITY_SPEC.md.

import { requireTeacher } from './teacher-auth.js';
import { getReceiptIssuer } from './receipts.js';
import { normalizeImportBody } from './ledger-import.js';
import { publicKeyFromX, verifyRecord, verifySnapshot } from './snapshot-verify.js';

const MAX_RECORDS = 20000; // a full-class restore is larger than one offline import

export function mountAdminRestore(app, { db, ledgerDb }) {
  // READ-ONLY: verify a snapshot/backup the teacher uploads (or just downloaded).
  // Recomputes everything from the file's own contents + its embedded issuer pubkey,
  // so it independently detects a corrupted/truncated/tampered backup. Writes nothing.
  app.post('/admin/verify', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });
    try {
      const report = verifySnapshot(req.body || {});
      return res.json({ ok: true, report });
    } catch (err) {
      console.error('POST /admin/verify error:', err);
      return res.status(400).json({ ok: false, error: 'could not verify (malformed snapshot?)' });
    }
  });

  app.post('/admin/restore', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });

    const issuer = getReceiptIssuer();
    if (!issuer || !issuer.enabled || !issuer.pubkey) {
      return res.status(503).json({ ok: false, error: 'receipt issuer not enabled; cannot verify for restore' });
    }
    const pubKey = publicKeyFromX(issuer.pubkey);

    const records = normalizeImportBody(req.body);
    if (!records.length) return res.status(400).json({ ok: false, error: 'no records to restore' });
    if (records.length > MAX_RECORDS) {
      return res.status(413).json({ ok: false, error: `too many records (max ${MAX_RECORDS})` });
    }

    let restored = 0;
    let skipped = 0;
    const errors = [];

    for (let i = 0; i < records.length; i += 1) {
      const rec = records[i];

      // Replay ONLY what this issuer signed AND that still matches its receipt.
      const vr = verifyRecord(rec, pubKey, rec.studentId);
      if (!vr.ok) {
        skipped += 1;
        errors.push({ index: i, itemId: rec.itemId, reason: vr.unsigned ? 'unsigned' : (vr.breaks[0] && vr.breaks[0].kind) || 'verify-failed' });
        continue;
      }
      const payload = vr.payload;

      let data, error;
      try {
        const result = await ledgerDb.insertLedgerRow({
          studentId: rec.studentId,
          source: rec.source,
          itemId: rec.itemId,
          unit: rec.unit,
          topic: rec.topic,
          skill: rec.skill,
          response: rec.response,
          score: (rec.score === undefined ? null : rec.score), // AS-IS — verified by signature
          evidenceTier: payload.e || 'practice',               // from the SIGNED payload
          attempt: rec.attempt ?? 1,
          recordedAt: rec.recorded_at || undefined             // preserve original timestamp
        });
        data = result && result.data;
        error = result && result.error;
      } catch (err) {
        error = err;
      }
      if (error) {
        skipped += 1;
        errors.push({ index: i, itemId: rec.itemId, reason: 'database error' });
        continue;
      }
      restored += 1;

      // Preserve the ORIGINAL receipt (do NOT re-issue) so the restored chain is identical.
      if (data && data.ledger_id && rec.receipt_compact && typeof ledgerDb.updateLedgerReceipt === 'function') {
        try {
          await ledgerDb.updateLedgerReceipt(data.ledger_id, {
            receiptId: rec.receipt_id,
            receiptCompact: rec.receipt_compact
          });
        } catch (_) { /* best-effort; the row is already restored */ }
      }
    }

    return res.json({ ok: true, total: records.length, restored, skipped, errors });
  });
}
