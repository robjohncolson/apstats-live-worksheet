// snapshot-verify.js — pure, zero-trust verification of an apstats-ledger-snapshot/v1
// document (the off-Supabase mirror). Recomputes EVERYTHING and checks it against the
// issuer's public key:
//   - every receipt signature (canonical + Ed25519)
//   - that each signed receipt actually binds the record it accompanies (sid/item/
//     source/score, and the answer-hash for primitive responses) — catches a snapshot
//     whose grade data was edited under an otherwise-valid receipt
//   - each student's commit-chain `head` and transcript root (recomputed)
//   - the epoch anchor: root over the RE-DERIVED heads + its signature
//
// Used by tools/verify-ledger.mjs and the test suite. See GRADE_LEDGER_DURABILITY_SPEC.md.

import crypto from 'node:crypto';
import { buildCommits } from './commits.js';
import { receiptInternals } from './receipts.js';
import { receiptRootOf, epochRoot } from './admin-snapshot.js';

const { canonicalize, stringifyResponse } = receiptInternals;

function publicKeyFromX(x) {
  return crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x }, format: 'jwk' });
}

// Verify one compact receipt's canonical form + Ed25519 signature. Returns the
// decoded payload on success, else null (bad/forged/non-canonical).
function verifyCompact(compact, pubKey) {
  try {
    const [pB64, sB64] = String(compact).split('.');
    if (!pB64 || !sB64) return null;
    const bytes = Buffer.from(pB64, 'base64url');
    const sig = Buffer.from(sB64, 'base64url');
    const raw = bytes.toString('utf8');
    const payload = JSON.parse(raw);
    if (canonicalize(payload) !== raw) return null; // reject non-canonical (malleable) bytes
    if (!crypto.verify(null, bytes, pubKey, sig)) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function answerHash(response) {
  return crypto.createHash('sha256').update(stringifyResponse(response), 'utf8').digest('hex').slice(0, 16);
}

function numEq(a, b) {
  const na = (a === undefined || a === null) ? null : Number(a);
  const nb = (b === undefined || b === null) ? null : Number(b);
  if (na === null && nb === null) return true;
  return na === nb;
}

export function verifySnapshot(snapshot, { pubkey } = {}) {
  const breaks = [];
  const x = pubkey || (snapshot && snapshot.issuer && snapshot.issuer.pubkey);
  if (!x) return { ok: false, error: 'no issuer pubkey (pass pubkey or include snapshot.issuer)', breaks: [] };
  const pubKey = publicKeyFromX(x);

  let totalRecords = 0;
  let verifiedReceipts = 0;
  let unsignedRecords = 0;
  const students = [];

  for (const s of (snapshot.students || [])) {
    const sBreaks = [];
    const records = (s.bundle && s.bundle.records) || [];
    totalRecords += records.length;

    for (const rec of records) {
      if (!rec.receipt_compact) { unsignedRecords += 1; continue; }
      const payload = verifyCompact(rec.receipt_compact, pubKey);
      if (!payload) { sBreaks.push({ kind: 'bad-signature', itemId: rec.itemId }); continue; }
      verifiedReceipts += 1; // signature itself is valid; the following are binding checks

      const sid = rec.studentId || s.studentId;
      if (payload.sid !== sid) sBreaks.push({ kind: 'sid-mismatch', itemId: rec.itemId });
      if (payload.i !== rec.itemId) sBreaks.push({ kind: 'item-mismatch', itemId: rec.itemId });
      if (payload.src !== rec.source) sBreaks.push({ kind: 'source-mismatch', itemId: rec.itemId });
      if (!numEq(payload.sc, rec.score)) {
        sBreaks.push({ kind: 'score-tampered', itemId: rec.itemId, signed: payload.sc ?? null, record: rec.score ?? null });
      }
      // The signed `ah` binds the response. Postgres JSONB can reorder object keys
      // vs. what was signed, so only assert this for primitive responses (the common
      // worksheet/quiz case); object responses still ride the signature + score bind.
      const prim = typeof rec.response === 'string' || typeof rec.response === 'number';
      if (payload.ah && prim && payload.ah !== answerHash(rec.response)) {
        sBreaks.push({ kind: 'response-tampered', itemId: rec.itemId });
      }
    }

    // Recompute the commit-chain head from the receipt-bearing records.
    const commitRows = records
      .filter((r) => r.receipt_id && r.receipt_compact)
      .map((r) => ({ id: r.receipt_id, compact: r.receipt_compact, i: r.itemId, src: r.source, sc: r.score, ts: Date.parse(r.recorded_at) || 0 }));
    const { head } = buildCommits(commitRows, { sid: s.studentId, u: s.username });
    if ((head || null) !== (s.commitsHead || null)) {
      sBreaks.push({ kind: 'head-mismatch', expected: s.commitsHead || null, recomputed: head || null });
    }
    const tRoot = receiptRootOf(records.filter((r) => r.receipt_id).map((r) => r.receipt_id));
    if ((tRoot || null) !== (s.transcriptRoot || null)) {
      sBreaks.push({ kind: 'transcript-root-mismatch', expected: s.transcriptRoot || null, recomputed: tRoot || null });
    }

    students.push({
      studentId: s.studentId,
      username: s.username,
      recordCount: records.length,
      lastActivityAt: s.lastActivityAt || null,
      head: head || null,
      verified: sBreaks.length === 0,
      breaks: sBreaks
    });
    for (const b of sBreaks) breaks.push({ studentId: s.studentId, ...b });
  }

  // Epoch anchor: recompute the root over the RE-DERIVED heads (not the snapshot's
  // claimed heads) and check it against the signed epoch — so any tampered record
  // that shifts a head also breaks the anchor.
  let epochOk = true;
  const epoch = snapshot.epoch || null;
  if (epoch) {
    const reHeads = {};
    for (const s of students) reHeads[s.studentId] = s.head || null;
    const reRoot = epochRoot(reHeads);
    if (reRoot !== epoch.root) {
      epochOk = false;
      breaks.push({ kind: 'epoch-root-mismatch', expected: epoch.root, recomputed: reRoot });
    }
    if (epoch.receipt_compact) {
      const ep = verifyCompact(epoch.receipt_compact, pubKey);
      if (!ep) { epochOk = false; breaks.push({ kind: 'epoch-bad-signature' }); }
      else if (ep.root !== epoch.root) { epochOk = false; breaks.push({ kind: 'epoch-receipt-root-mismatch' }); }
    } else {
      epochOk = false;
      breaks.push({ kind: 'epoch-unsigned' });
    }
  }

  return {
    ok: breaks.length === 0,
    totals: { students: students.length, records: totalRecords, verifiedReceipts, unsignedRecords },
    epochOk,
    students,
    breaks
  };
}
