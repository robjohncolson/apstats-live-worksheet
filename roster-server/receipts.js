import crypto from 'node:crypto';

let issuer = {
  enabled: false,
  privateKey: null,
  pubkey: null
};
let persistFailures = 0;
const DEFAULT_REVIEW_GRANT_PUBKEY = 'yFByWH5a7OwhF2KOD3SLd1BE4MlHEN_JDtDaMwW-Eg4';

function stringifyResponse(value) {
  if (typeof value === 'string') return value;
  const stringified = JSON.stringify(value);
  return stringified === undefined ? String(value) : stringified;
}

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

function canonicalize(payload) {
  const sorted = {};
  for (const key of Object.keys(payload).sort()) {
    if (payload[key] !== undefined) sorted[key] = payload[key];
  }
  return JSON.stringify(sorted);
}

function signPayload(privateKey, payload) {
  const canonical = canonicalize(payload);
  const bytes = Buffer.from(canonical, 'utf8');
  const receiptId = crypto.createHash('sha256').update(bytes).digest('hex');
  const signature = crypto.sign(null, bytes, privateKey);
  return {
    canonical,
    receiptId,
    sig: b64url(signature),
    compact: `${b64url(bytes)}.${b64url(signature)}`
  };
}

function reviewGrantPublicKey() {
  const x = process.env.REVIEW_GRANT_PUBKEY || DEFAULT_REVIEW_GRANT_PUBKEY;
  return crypto.createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x },
    format: 'jwk'
  });
}

export function verifyReviewGrant(compact) {
  if (typeof compact !== 'string') return null;

  try {
    const parts = compact.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

    const bytes = Buffer.from(parts[0], 'base64url');
    const sig = Buffer.from(parts[1], 'base64url');
    const rawPayload = bytes.toString('utf8');
    const payload = JSON.parse(rawPayload);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    if (canonicalize(payload) !== rawPayload) return null;

    const ok = crypto.verify(null, bytes, reviewGrantPublicKey(), sig);
    return ok ? payload : null;
  } catch (_) {
    return null;
  }
}

function gradingProvenance(source, itemId) {
  const src = String(source || '');
  const id = String(itemId || '');
  if (src === 'curriculum_quiz' || src === 'pc' || src === 'worksheet') return 'key';
  if (src === 'ai' || src === 'ai-graded' || src === 'quiz_review' || src === 'quiz_exception') return 'ai';
  if (src === 'self-graded' || src === 'frq' || /DESK_DONE/i.test(id)) return 'self';
  return undefined;
}

function createPrivateKey(privateKeyB64) {
  return crypto.createPrivateKey({
    key: Buffer.from(privateKeyB64, 'base64'),
    format: 'der',
    type: 'pkcs8'
  });
}

export function initReceipts() {
  const privateKeyB64 = process.env.RECEIPT_ISSUER_PRIVATE_KEY;
  persistFailures = 0;

  if (!privateKeyB64) {
    issuer = { enabled: false, privateKey: null, pubkey: null };
    console.log('Signed receipts disabled: RECEIPT_ISSUER_PRIVATE_KEY unset');
    return issuer;
  }

  try {
    const privateKey = createPrivateKey(privateKeyB64);
    const publicKey = crypto.createPublicKey(privateKey);
    issuer = {
      enabled: true,
      privateKey,
      pubkey: publicKey.export({ format: 'jwk' }).x
    };
    console.log('Signed receipts enabled: Ed25519 issuer loaded');
  } catch (err) {
    issuer = { enabled: false, privateKey: null, pubkey: null };
    console.error('Signed receipts disabled: failed to load issuer key:', err.message);
  }

  return issuer;
}

export function getReceiptIssuer() {
  if (!issuer.enabled) return { enabled: false };
  return {
    enabled: true,
    alg: 'Ed25519',
    v: 1,
    pubkey: issuer.pubkey
  };
}

export function recordReceiptPersistFailure() {
  persistFailures += 1;
}

export function getReceiptHealth() {
  const info = getReceiptIssuer();
  return {
    enabled: !!info.enabled,
    pubkey: info.pubkey,
    persistFailures
  };
}

export function issueLedgerReceipt({
  studentId,
  username,
  source,
  itemId,
  score,
  attempt,
  evidenceTier,
  response,
  gradingProvenance: provenanceOverride,
  ts = Date.now()
}) {
  if (!issuer.enabled) return null;
  if (!studentId || !source || !itemId) return null;

  try {
    const valueString = stringifyResponse(response);
    const payload = {
      v: 1,
      t: 'ledger',
      sid: studentId,
      u: username || undefined,
      src: source,
      i: itemId,
      a: attempt,
      e: evidenceTier,
      ah: crypto.createHash('sha256').update(valueString, 'utf8').digest('hex').slice(0, 16),
      ts,
      n: crypto.randomBytes(4).toString('hex')
    };

    if (score !== undefined && score !== null) payload.sc = Number(score);
    const g = provenanceOverride || gradingProvenance(source, itemId);
    if (g) payload.g = g;

    const { receiptId, compact } = signPayload(issuer.privateKey, payload);
    return { receiptId, compact };
  } catch (err) {
    console.error('Ledger receipt issuance failed:', err.message);
    return null;
  }
}

export function issueTranscriptReceipt({
  sid,
  u,
  asOf,
  asOfDateNY,
  cnt,
  root,
  g,
  gq,
  gradeHash,
  cfgHash,
  artHash,
  codeHash
}) {
  if (!issuer.enabled) return null;
  if (!sid || !asOf || !asOfDateNY || !root || !gq || !gradeHash || !cfgHash || !artHash || !codeHash) {
    return null;
  }

  try {
    const payload = {
      v: 1,
      t: 'transcript',
      sid,
      u: u || undefined,
      asOf,
      asOfDateNY,
      cnt,
      root,
      g,
      gq,
      gradeHash,
      cfgHash,
      artHash,
      codeHash,
      iss: 'desk',
      ts: asOf,
      n: crypto.randomBytes(4).toString('hex')
    };

    const { receiptId, compact } = signPayload(issuer.privateKey, payload);
    return { receiptId, compact };
  } catch (err) {
    console.error('Transcript receipt issuance failed:', err.message);
    return null;
  }
}

// A "commit" in the progress ledger: a signed manifest over a QR-sized chunk of
// receipts, chained to the previous commit via `prev` (its root). The chain of
// roots is the proto-git history. Genesis commit has no `prev` (omitted).
export function issueCommitReceipt({ sid, u, seq, prev, root, cnt, from, to, asOf = Date.now() }) {
  if (!issuer.enabled) return null;
  if (!sid || !root || !seq) return null;
  try {
    const payload = {
      v: 1,
      t: 'commit',
      sid,
      u: u || undefined,
      seq,
      prev: prev || undefined,
      root,
      cnt,
      from,
      to,
      iss: 'desk',
      ts: asOf,
      n: crypto.randomBytes(4).toString('hex')
    };
    const { receiptId, compact } = signPayload(issuer.privateKey, payload);
    return { receiptId, compact };
  } catch (err) {
    console.error('Commit receipt issuance failed:', err.message);
    return null;
  }
}

export function mountReceipts(app) {
  app.get('/receipts/issuer', (_req, res) => {
    res.json(getReceiptIssuer());
  });
}

export const receiptInternals = {
  canonicalize,
  createPrivateKey,
  signPayload
};
