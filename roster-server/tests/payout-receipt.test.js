import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initReceipts, issuePayoutReceipt } from '../receipts.js';

const TEST_PRIVATE_KEY = 'MC4CAQAwBQYDK2VwBCIEIIq2JsDpBMHpUzaFF6mPR0vUv1T2gzXGX7k/AQSYjyl0';
const TEST_PUBLIC_KEY = 'sj9NUx5jBO-KTI58WKjQwEr22i7f8fiv--KH4z95JCc';

function decodeCompact(compact) {
  const [payloadB64, signatureB64] = compact.split('.');
  return {
    bytes: Buffer.from(payloadB64, 'base64url'),
    signature: Buffer.from(signatureB64, 'base64url'),
    payload: JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')),
  };
}

describe('payout receipts', () => {
  afterEach(() => {
    delete process.env.RECEIPT_ISSUER_PRIVATE_KEY;
    vi.restoreAllMocks();
    initReceipts();
  });

  it('signs exactly the public payout audit fields', () => {
    process.env.RECEIPT_ISSUER_PRIVATE_KEY = TEST_PRIVATE_KEY;
    initReceipts();

    const receipt = issuePayoutReceipt({
      studentId: 'student-1',
      batchId: '00000000-0000-4000-8000-000000000001',
      txid: 'a'.repeat(64),
      doge: 7.5,
      issuedAt: 1781234567890,
    });
    const decoded = decodeCompact(receipt.compact);
    const publicKey = crypto.createPublicKey({
      key: { kty: 'OKP', crv: 'Ed25519', x: TEST_PUBLIC_KEY },
      format: 'jwk',
    });

    expect(decoded.payload).toEqual({
      batch: '00000000-0000-4000-8000-000000000001',
      doge: 7.5,
      n: expect.stringMatching(/^[0-9a-f]{8}$/),
      sid: 'student-1',
      t: 'payout',
      ts: 1781234567890,
      txid: 'a'.repeat(64),
      v: 1,
    });
    expect(crypto.verify(null, decoded.bytes, publicKey, decoded.signature)).toBe(true);
  });

  it('returns null when receipts are disabled or payout data is invalid', () => {
    initReceipts();

    expect(issuePayoutReceipt({
      studentId: 'student-1',
      batchId: 'batch-1',
      txid: 'a'.repeat(64),
      doge: 5,
    })).toBeNull();

    process.env.RECEIPT_ISSUER_PRIVATE_KEY = TEST_PRIVATE_KEY;
    initReceipts();
    expect(issuePayoutReceipt({ studentId: '', batchId: 'batch-1', txid: 'a'.repeat(64), doge: 5 })).toBeNull();
    expect(issuePayoutReceipt({ studentId: 'student-1', batchId: 'batch-1', txid: 'a'.repeat(64), doge: 0 })).toBeNull();
  });

  it('contains signing failures without exposing transaction data', () => {
    process.env.RECEIPT_ISSUER_PRIVATE_KEY = TEST_PRIVATE_KEY;
    initReceipts();
    vi.spyOn(crypto, 'sign').mockImplementation(() => {
      throw new Error('sign failed');
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    const receipt = issuePayoutReceipt({
      studentId: 'student-1',
      batchId: 'batch-1',
      txid: 'a'.repeat(64),
      doge: 5,
    });

    expect(receipt).toBeNull();
    expect(log).toHaveBeenCalledWith('Payout receipt issuance failed:', 'sign failed');
    expect(JSON.stringify(log.mock.calls)).not.toContain('a'.repeat(64));
  });
});
