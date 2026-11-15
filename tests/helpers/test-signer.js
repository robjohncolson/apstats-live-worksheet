// test-signer.js — a test-only Ed25519 receipt signer for the receipt-verify tests.
//
// Byte format matches the server issuer (roster-server/receipts.js): canonical JSON
// with sorted top-level keys, compact = base64url(payloadBytes) + '.' + base64url(sig),
// receiptId = sha256 hex of the payload bytes. It replaces the retired on-device
// signer (receipt-sign.js) that these tests used to load.
import { webcrypto } from 'node:crypto';

const subtle = webcrypto.subtle;

function b64url(bytes) {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function canonicalize(payload) {
  const sorted = {};
  Object.keys(payload).sort().forEach((k) => { if (payload[k] !== undefined) sorted[k] = payload[k]; });
  return JSON.stringify(sorted);
}

export async function generateKey() {
  const pair = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const jwk = await subtle.exportKey('jwk', pair.publicKey);
  return { publicKeyX: jwk.x, privateKey: pair.privateKey };
}

export async function signPayload(privateKey, payload) {
  const canonical = canonicalize(payload);
  const bytes = new TextEncoder().encode(canonical);
  const [sig, digest] = await Promise.all([
    subtle.sign({ name: 'Ed25519' }, privateKey, bytes),
    subtle.digest('SHA-256', bytes),
  ]);
  const receiptId = Buffer.from(digest).toString('hex');
  return { receiptId, compact: b64url(bytes) + '.' + b64url(new Uint8Array(sig)), canonical };
}

export const TestSigner = { generateKey, signPayload };
