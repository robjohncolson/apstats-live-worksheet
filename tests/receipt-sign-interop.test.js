/**
 * receipt-sign-interop.test.js — the linchpin of ANDROID Phase 4 §3B.
 * Proves a DEVICE-generated WebCrypto Ed25519 key signs receipts that the EXISTING
 * server verifier accepts: receipt-sign.js (issuing side) interoperates byte-for-byte
 * with roster-server/receipts.js (canonical form) + snapshot-verify.js (verify side).
 * Once the device pubkey is in the issuer trust set (Phase 4 §2), its receipts are
 * trusted everywhere — no verifier change.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';
import { webcrypto } from 'node:crypto';
import { verifyCompact, verifyRecord, publicKeyFromX } from '../roster-server/snapshot-verify.js';
import { receiptInternals } from '../roster-server/receipts.js';

const SRC = readFileSync(resolve(import.meta.dirname, '..', 'receipt-sign.js'), 'utf8');

function loadSign() {
  const win = { crypto: webcrypto };
  const ctx = createContext({
    window: win, globalThis: win, crypto: webcrypto,
    TextEncoder, Buffer, Promise, JSON, Object, String, Uint8Array, Array, console,
  });
  runInContext(SRC, ctx);
  return win.ReceiptSign;
}

// t:'ledger' matches how every real grade receipt is minted (signLedgerReceipt /
// issueLedgerReceipt); verifyRecord's domain-separation check (§0.1a) requires it.
const PAYLOAD = { v: 1, t: 'ledger', sid: 'stu-1', i: 'WS-U1L1-Q1', src: 'worksheet', sc: 1 };

describe('receipt-sign — canonical form matches the server', () => {
  it('ReceiptSign.canonicalize === receipts.js canonicalize (sorted keys, undefined dropped)', () => {
    const RS = loadSign();
    const a = RS.canonicalize({ sc: 1, i: 'X', v: 1, src: 'worksheet', sid: 's', drop: undefined });
    const b = receiptInternals.canonicalize({ sc: 1, i: 'X', v: 1, src: 'worksheet', sid: 's', drop: undefined });
    expect(a).toBe(b);
  });
});

describe('receipt-sign — device key, server verifies (cross-stack)', () => {
  let RS, publicKeyX, privateKey;

  beforeAll(async () => {
    RS = loadSign();
    const k = await RS.generateKey();
    publicKeyX = k.publicKeyX;
    privateKey = k.privateKey;
  });

  it('a JS-signed compact receipt verifies under the Node server verifier', async () => {
    const { compact } = await RS.signPayload(privateKey, PAYLOAD);
    const pub = publicKeyFromX(publicKeyX);          // the device pubkey, as the trust set would hold it
    expect(verifyCompact(compact, pub)).toMatchObject(PAYLOAD);
  });

  it('verifyRecord binds the device-signed receipt to its record', async () => {
    const { compact, receiptId } = await RS.signPayload(privateKey, PAYLOAD);
    const pub = publicKeyFromX(publicKeyX);
    const rec = { studentId: 'stu-1', itemId: 'WS-U1L1-Q1', source: 'worksheet', score: 1, receipt_id: receiptId, receipt_compact: compact };
    expect(verifyRecord(rec, [pub], 'stu-1').ok).toBe(true);
  });

  it('a tampered score breaks the binding (signature still valid, record edited)', async () => {
    const { compact, receiptId } = await RS.signPayload(privateKey, PAYLOAD);
    const pub = publicKeyFromX(publicKeyX);
    const rec = { studentId: 'stu-1', itemId: 'WS-U1L1-Q1', source: 'worksheet', score: 0.2, receipt_id: receiptId, receipt_compact: compact };
    const vr = verifyRecord(rec, [pub], 'stu-1');
    expect(vr.ok).toBe(false);
    expect(vr.breaks.some((b) => b.kind === 'score-tampered')).toBe(true);
  });

  it('a different device key does NOT verify (only trusted issuers)', async () => {
    const { compact } = await RS.signPayload(privateKey, PAYLOAD);
    const other = await RS.generateKey();
    expect(verifyCompact(compact, publicKeyFromX(other.publicKeyX))).toBeNull();
  });

  it('exported private JWK round-trips and signs identically', async () => {
    const jwk = await RS.exportPrivateJwk(privateKey);   // what secure-store persists
    const reimported = await RS.importPrivateKey(jwk);
    const a = await RS.signPayload(privateKey, PAYLOAD);
    const b = await RS.signPayload(reimported, PAYLOAD);
    expect(b.compact).toBe(a.compact);                   // Ed25519 is deterministic
  });
});
