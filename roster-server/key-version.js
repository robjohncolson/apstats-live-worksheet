// key-version.js — the deterministic answer-key version hash (§0.10).
//
// grade-contexts.js stamps it as `answerKeyHash` so a graded context records which
// key version scored it. Moved here from the retired /grade/answer-key route module.

import crypto from 'crypto';

// Deterministic, order-independent canonical JSON (sorted keys, recursively) so the
// version hash is stable regardless of object key order. Mirrors the sorted-key
// canonicalization used for receipts.
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}

// A short sha256 over the canonical (answerKey, worksheetKey) pair.
export function keyVersionHash(answerKey, worksheetKeyMap) {
  const payload = canonical({ a: answerKey || {}, w: worksheetKeyMap || {} });
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex').slice(0, 16);
}
