// trusted-issuers.test.js — the persisted issuer trust set (migration 0026): boot
// seeding into the cache, and a receipt a trusted key signs verifies everywhere.
// (The register/revoke routes left with the retired teacher device app.)

import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import express from 'express';
import crypto from 'node:crypto';
import {
  mountReceipts, getTrustedIssuerPubkeys, setPersistedTrustedPubkeys,
  isValidIssuerPubkey, initReceipts, receiptInternals,
} from '../receipts.js';
import { verifyRecord, publicKeyFromX } from '../snapshot-verify.js';

function makeDeviceKey() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return { privateKey, x: publicKey.export({ format: 'jwk' }).x };
}

const savedRetired = process.env.RETIRED_ISSUER_PUBKEYS;

beforeEach(() => {
  delete process.env.RETIRED_ISSUER_PUBKEYS;
  initReceipts();                 // reset issuer state to env (likely disabled in tests)
  setPersistedTrustedPubkeys([]); // reset the cache
});
afterAll(() => {
  if (savedRetired === undefined) delete process.env.RETIRED_ISSUER_PUBKEYS; else process.env.RETIRED_ISSUER_PUBKEYS = savedRetired;
  setPersistedTrustedPubkeys([]);
});

describe('isValidIssuerPubkey', () => {
  it('accepts a real Ed25519 x', () => {
    expect(isValidIssuerPubkey(makeDeviceKey().x)).toBe(true);
  });
  it('rejects junk / wrong length / wrong charset / non-string', () => {
    expect(isValidIssuerPubkey('not-a-key')).toBe(false);          // too short
    expect(isValidIssuerPubkey(null)).toBe(false);                  // non-string
    expect(isValidIssuerPubkey('A'.repeat(44))).toBe(false);        // wrong length
    expect(isValidIssuerPubkey('A'.repeat(42) + '!')).toBe(false);  // bad char (43 chars, '!' not base64url)
    // NOTE: any 43-char base64url decodes to 32 bytes → structurally valid Ed25519 x
    // (Node doesn't check curve membership; a non-point key just can't verify anything).
  });
});

describe('setPersistedTrustedPubkeys / getTrustedIssuerPubkeys', () => {
  it('merges persisted keys into the trust set, deduped', () => {
    setPersistedTrustedPubkeys(['k1', 'k2', 'k1']);
    const set = getTrustedIssuerPubkeys();
    expect(set).toContain('k1');
    expect(set).toContain('k2');
    expect(set.filter((k) => k === 'k1')).toHaveLength(1);
  });
  it('ignores non-strings', () => {
    setPersistedTrustedPubkeys(['k1', null, 42, '']);
    expect(getTrustedIssuerPubkeys()).toEqual(['k1']);
  });
});

describe('boot seeding of the persisted trust set', () => {
  it('mountReceipts loads non-revoked issuer keys from the table into the trust set', async () => {
    const dev = makeDeviceKey();
    const app = express();
    mountReceipts(app, { db: { listTrustedIssuers: async () => ({ data: [{ pubkey: dev.x }], error: null }) } });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(getTrustedIssuerPubkeys()).toContain(dev.x);
  });

  it('a missing table leaves the trust set unchanged (pre-migration 0026)', async () => {
    const app = express();
    const before = getTrustedIssuerPubkeys().slice();
    mountReceipts(app, { db: { listTrustedIssuers: async () => { throw Object.assign(new Error('relation does not exist'), { code: '42P01' }); } } });
    await new Promise((r) => setTimeout(r, 0));
    expect(getTrustedIssuerPubkeys()).toEqual(before);
  });
});

describe('end-to-end: a registered device key verifies receipts', () => {
  it('a device-signed receipt passes verifyRecord once the pubkey is in the trust set', () => {
    const dev = makeDeviceKey();
    const { receiptId, compact } = receiptInternals.signPayload(dev.privateKey, { v: 1, t: 'ledger', sid: 'stu-1', src: 'frq', i: 'WS-U1L1-reflect1', sc: 1 });
    const rec = { studentId: 'stu-1', itemId: 'WS-U1L1-reflect1', source: 'frq', score: 1, receipt_id: receiptId, receipt_compact: compact };

    // Before registration: not trusted.
    expect(verifyRecord(rec, getTrustedIssuerPubkeys().map(publicKeyFromX), 'stu-1').ok).toBe(false);
    // Register the device pubkey → now trusted.
    setPersistedTrustedPubkeys([dev.x]);
    expect(verifyRecord(rec, getTrustedIssuerPubkeys().map(publicKeyFromX), 'stu-1').ok).toBe(true);
  });
});
