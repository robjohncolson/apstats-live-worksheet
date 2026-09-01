// payout.js -- frozen, hash-pinned DOGE payout work queue.
//
// Railway stores only public addresses, amounts, state, and txids. It never
// receives a spending key or signed transaction. The local payout agent owns
// broadcasting; completion reaches wallet balances only through migration
// 0032's payout_complete wrapper, which calls the existing invariant-checked
// doge_mark function.

import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { MIN_MATERIALIZE_DOGE } from './doge-econ.js';
import { issuePayoutReceipt } from './receipts.js';
import { requirePayoutAgent, requirePayoutTeacher } from './teacher-auth.js';

const KOINU_PER_DOGE = 100_000_000;
const DEFAULT_BATCH_CAP = 500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TXID_RE = /^[0-9a-f]{64}$/i;
const HASH_RE = /^[0-9a-f]{64}$/i;
const ACTIVE_STATUSES = ['pending', 'claimed'];
const MIGRATION_MISSING_CODES = new Set([
  '42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205',
]);
const CONTROLLED_FAILURES = new Set([
  'broadcast not found during crash recovery',
  'invalid payout address',
  'payout agent failed',
  'plan hash mismatch',
  'wrong Dogecoin network',
]);
const INSUFFICIENT_FLOAT_RE = /^insufficient float: have Ɖ(?:0|[1-9]\d*)(?:\.\d{1,8})? need Ɖ(?:0|[1-9]\d*)(?:\.\d{1,8})?$/;
const DECIMAL_RE = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;
const MAX_DECIMAL_POWER = 1_000;
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

function lexicalCompare(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, expected) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index]);
}

function numberToKoinu(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite`);

  const koinu = Math.round(number * KOINU_PER_DOGE);
  if (!Number.isSafeInteger(koinu)) throw new TypeError(`${label} is out of range`);
  return koinu;
}

function decimalParts(value, label) {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite`);
  }

  const text = String(value).trim();
  const match = DECIMAL_RE.exec(text);
  if (!match) throw new TypeError(`${label} must be decimal`);

  const fraction = match[3] ?? match[4] ?? '';
  const digits = `${match[2] || '0'}${fraction}`;
  const scientificExponent = Number(match[5] || 0);
  const exponent = scientificExponent - fraction.length;
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > MAX_DECIMAL_POWER) {
    throw new TypeError(`${label} is out of range`);
  }

  const sign = match[1] === '-' ? -1n : 1n;
  return { coefficient: sign * BigInt(digits), exponent };
}

function powerOfTen(power, label) {
  if (!Number.isInteger(power) || power < 0 || power > MAX_DECIMAL_POWER) {
    throw new TypeError(`${label} is out of range`);
  }
  return 10n ** BigInt(power);
}

// Floor the exact decimal difference, rather than rounding balance and sent
// independently. A plan may underpay by less than one koinu, but can never ask
// Core to broadcast more than the live numeric wallet row can mark afterward.
function readyKoinu(balance, sent) {
  const left = decimalParts(balance, 'doge_balance');
  const right = decimalParts(sent, 'doge_sent');
  const commonExponent = Math.min(left.exponent, right.exponent);
  const leftInteger = left.coefficient
    * powerOfTen(left.exponent - commonExponent, 'doge_balance');
  const rightInteger = right.coefficient
    * powerOfTen(right.exponent - commonExponent, 'doge_sent');
  const difference = leftInteger - rightInteger;
  if (difference <= 0n) return 0;

  const koinuExponent = commonExponent + 8;
  const koinu = koinuExponent >= 0
    ? difference * powerOfTen(koinuExponent, 'DOGE amount')
    : difference / powerOfTen(-koinuExponent, 'DOGE amount');
  if (koinu > MAX_SAFE_BIGINT) throw new TypeError('DOGE amount is out of range');
  return Number(koinu);
}

function exactKoinu(value, label) {
  const parts = decimalParts(value, label);
  const koinuExponent = parts.exponent + 8;
  let koinu;
  if (koinuExponent >= 0) {
    koinu = parts.coefficient * powerOfTen(koinuExponent, label);
  } else {
    const divisor = powerOfTen(-koinuExponent, label);
    if (parts.coefficient % divisor !== 0n) {
      throw new TypeError(`${label} must have at most 8 decimals`);
    }
    koinu = parts.coefficient / divisor;
  }

  if (koinu > MAX_SAFE_BIGINT || koinu < -MAX_SAFE_BIGINT) {
    throw new TypeError(`${label} is out of range`);
  }
  return Number(koinu);
}

function dogeFromKoinu(koinu) {
  return koinu / KOINU_PER_DOGE;
}

function accountValue(account, snake, camel) {
  if (account && account[snake] !== undefined) return account[snake];
  return account && account[camel];
}

// Exact /class/wallets deposit math, evaluated in integer koinu so ordering and
// floating-point accumulation can never change a plan hash.
export function buildPayoutPlan(
  accounts,
  { minPerStudent = MIN_MATERIALIZE_DOGE } = {},
) {
  const minimumKoinu = numberToKoinu(minPerStudent, 'minPerStudent');
  if (minimumKoinu <= 0) throw new TypeError('minPerStudent must be positive');

  const rows = [];
  const seenStudents = new Set();

  for (const account of accounts || []) {
    const studentId = String(accountValue(account, 'student_id', 'studentId') || '').trim();
    const rawAddress = accountValue(account, 'doge_address', 'dogeAddress');
    const address = typeof rawAddress === 'string' ? rawAddress.trim() : '';
    const payableKoinu = readyKoinu(
      accountValue(account, 'doge_balance', 'dogeBalance') ?? 0,
      accountValue(account, 'doge_sent', 'dogeSent') ?? 0,
    );

    if (payableKoinu < minimumKoinu || !address) continue;
    if (!studentId) throw new TypeError('ready payout account is missing student_id');
    if (seenStudents.has(studentId)) throw new TypeError(`duplicate payout student: ${studentId}`);

    seenStudents.add(studentId);
    rows.push({ studentId, address, doge: dogeFromKoinu(payableKoinu) });
  }

  rows.sort((left, right) => (
    lexicalCompare(left.studentId, right.studentId)
    || lexicalCompare(left.address, right.address)
  ));

  let totalKoinu = 0;
  for (const row of rows) {
    totalKoinu += numberToKoinu(row.doge, 'row.doge');
    if (!Number.isSafeInteger(totalKoinu)) throw new TypeError('payout total is out of range');
  }

  return {
    minPerStudent: dogeFromKoinu(minimumKoinu),
    rows,
    total: dogeFromKoinu(totalKoinu),
  };
}

function canonicalizeValue(value) {
  if (value === null) return 'null';

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonical JSON rejects non-finite numbers');
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeValue).join(',')}]`;
  }

  if (typeof value !== 'object' || value === undefined) {
    throw new TypeError('canonical JSON rejects undefined and unsupported values');
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('canonical JSON accepts plain objects only');
  }

  const members = [];
  for (const key of Object.keys(value).sort()) {
    if (value[key] === undefined) throw new TypeError('canonical JSON rejects undefined');
    members.push(`${JSON.stringify(key)}:${canonicalizeValue(value[key])}`);
  }
  return `{${members.join(',')}}`;
}

export function canonicalizePayoutPlan(plan) {
  return canonicalizeValue(plan);
}

export function hashPayoutPlan(plan) {
  return crypto
    .createHash('sha256')
    .update(canonicalizePayoutPlan(plan), 'utf8')
    .digest('hex');
}

export function hashClaimToken(claimToken) {
  return crypto
    .createHash('sha256')
    .update(claimToken.toLowerCase(), 'utf8')
    .digest('hex');
}

function normalizeStoredPlan(plan) {
  if (!hasExactKeys(plan, ['minPerStudent', 'rows', 'total'])) {
    throw new TypeError('payout plan must be an object');
  }
  if (!Array.isArray(plan.rows)) throw new TypeError('payout plan rows must be an array');

  const minimumKoinu = exactKoinu(plan.minPerStudent, 'plan.minPerStudent');
  if (minimumKoinu <= 0) throw new TypeError('plan.minPerStudent must be positive');

  const rows = [];
  const seenStudents = new Set();
  for (const raw of plan.rows) {
    if (!hasExactKeys(raw, ['studentId', 'address', 'doge'])) {
      throw new TypeError('payout plan row must be an object');
    }

    const studentId = typeof raw.studentId === 'string' ? raw.studentId.trim() : '';
    const address = typeof raw.address === 'string' ? raw.address.trim() : '';
    const dogeKoinu = exactKoinu(raw.doge, 'plan row doge');
    if (!studentId || studentId !== raw.studentId
      || !address || address !== raw.address
      || dogeKoinu <= 0) throw new TypeError('invalid payout plan row');
    if (dogeKoinu < minimumKoinu) throw new TypeError('payout plan row is below minimum');
    if (seenStudents.has(studentId)) throw new TypeError('duplicate payout plan student');

    seenStudents.add(studentId);
    rows.push({ studentId, address, doge: dogeFromKoinu(dogeKoinu) });
  }

  const sortedRows = [...rows].sort((left, right) => (
    lexicalCompare(left.studentId, right.studentId)
    || lexicalCompare(left.address, right.address)
  ));
  if (rows.some((row, index) => (
    row.studentId !== sortedRows[index].studentId
    || row.address !== sortedRows[index].address
  ))) {
    throw new TypeError('payout plan rows are not canonical');
  }

  const totalKoinu = rows.reduce(
    (sum, row) => sum + exactKoinu(row.doge, 'plan row doge'),
    0,
  );
  if (!Number.isSafeInteger(totalKoinu)) throw new TypeError('payout plan total is out of range');
  if (exactKoinu(plan.total, 'plan.total') !== totalKoinu) {
    throw new TypeError('payout plan total does not match rows');
  }

  return {
    minPerStudent: dogeFromKoinu(minimumKoinu),
    rows: sortedRows,
    total: dogeFromKoinu(totalKoinu),
  };
}

function normalizeCompletionOutputs(outputs, plan) {
  if (!Array.isArray(outputs)) throw new TypeError('outputs must be an array');

  const normalized = [];
  const seenStudents = new Set();
  for (const raw of outputs) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new TypeError('output must be an object');
    }
    const keys = Object.keys(raw).sort();
    if (keys.length !== 2 || keys[0] !== 'doge' || keys[1] !== 'studentId') {
      throw new TypeError('output accepts only studentId and doge');
    }

    const studentId = typeof raw.studentId === 'string' ? raw.studentId.trim() : '';
    const dogeKoinu = exactKoinu(raw.doge, 'output doge');
    if (!studentId || dogeKoinu <= 0) throw new TypeError('invalid payout output');
    if (seenStudents.has(studentId)) throw new TypeError('duplicate payout output student');

    seenStudents.add(studentId);
    normalized.push({ studentId, doge: dogeFromKoinu(dogeKoinu) });
  }

  normalized.sort((left, right) => lexicalCompare(left.studentId, right.studentId));
  const expected = plan.rows
    .map((row) => ({ studentId: row.studentId, doge: row.doge }))
    .sort((left, right) => lexicalCompare(left.studentId, right.studentId));

  if (normalized.length !== expected.length) throw new TypeError('outputs do not match frozen plan');
  for (let index = 0; index < expected.length; index += 1) {
    if (normalized[index].studentId !== expected[index].studentId) {
      throw new TypeError('outputs do not match frozen plan');
    }
    if (exactKoinu(normalized[index].doge, 'output doge')
      !== exactKoinu(expected[index].doge, 'plan doge')) {
      throw new TypeError('outputs do not match frozen plan');
    }
  }

  return normalized;
}

export function sanitizePayoutFailure(value) {
  const message = typeof value === 'string' ? value.trim() : '';
  if (message.length <= 160 && INSUFFICIENT_FLOAT_RE.test(message)) return message;
  if (CONTROLLED_FAILURES.has(message)) return message;
  return 'payout agent failed';
}

export function createPayoutDb(client) {
  return Object.freeze({
    probe: () => client.rpc('payout_probe'),
    createBatch: ({ plan, planHash }) => client.rpc('payout_create', {
      p_plan: plan,
      p_plan_hash: planHash,
    }),
    getBatch: (batchId) => client
      .from('payout_batch')
      .select('*')
      .eq('batch_id', batchId)
      .maybeSingle(),
    getActiveBatch: () => client
      .from('payout_batch')
      .select('*')
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    getNextBatch: () => client
      .from('payout_batch')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    getLatestBatch: () => client
      .from('payout_batch')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    cancelBatch: (batchId, resolvedAt) => client
      .from('payout_batch')
      .update({ status: 'cancelled', resolved_at: resolvedAt })
      .eq('batch_id', batchId)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle(),
    claimBatch: (batchId, claimTokenHash, claimedAt) => client
      .from('payout_batch')
      .update({
        status: 'claimed',
        claim_token_hash: claimTokenHash,
        claimed_at: claimedAt,
      })
      .eq('batch_id', batchId)
      .eq('status', 'pending')
      .is('claim_token_hash', null)
      .select('*')
      .maybeSingle(),
    armBatch: (batchId, claimTokenHash) => client.rpc('payout_arm', {
      p_batch_id: batchId,
      p_claim_token_hash: claimTokenHash,
    }),
    recordBroadcast: ({ batchId, claimTokenHash, txid }) => client.rpc(
      'payout_record_broadcast',
      {
        p_batch_id: batchId,
        p_claim_token_hash: claimTokenHash,
        p_txid: txid,
      },
    ),
    failBatch: (batchId, claimTokenHash, error, resolvedAt) => client
      .from('payout_batch')
      .update({ status: 'failed', error, resolved_at: resolvedAt })
      .eq('batch_id', batchId)
      .eq('status', 'claimed')
      .eq('claim_token_hash', claimTokenHash)
      .is('broadcast_at', null)
      .is('txid', null)
      .select('*')
      .maybeSingle(),
    completeBatch: ({ batchId, claimTokenHash, txid, outputs, receipts = [] }) => client.rpc(
      'payout_complete',
      {
        p_batch_id: batchId,
        p_claim_token_hash: claimTokenHash,
        p_txid: txid,
        p_outputs: outputs,
        p_receipts: receipts,
      },
    ),
  });
}

export function createLivePayoutDb() {
  const url = process.env.ROSTER_SUPABASE_URL;
  const key = process.env.ROSTER_SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createPayoutDb(createClient(url, key));
}

export function isPayoutMissing(error) {
  if (!error) return false;
  const code = String(error.code || '');
  if (MIGRATION_MISSING_CODES.has(code)) return true;

  const message = String(error.message || '').toLowerCase();
  const mentionsPayout = message.includes('payout_')
    || message.includes('receipt_compact');
  const missing = message.includes('schema cache')
    || message.includes('does not exist')
    || message.includes('could not find')
    || message.includes('undefined column')
    || message.includes('undefined function');
  return mentionsPayout && missing;
}

function isPayoutConflict(error) {
  if (!error) return false;
  return ['23505', '23514', 'P0001'].includes(String(error.code || ''))
    || String(error.message || '').toLowerCase().includes('payout');
}

function batchRow(data) {
  return Array.isArray(data) ? (data[0] || null) : (data || null);
}

function publicBatch(row) {
  if (!row) return null;
  const txid = row.txid || null;
  return {
    batchId: row.batch_id,
    status: row.status,
    plan: row.plan,
    planHash: row.plan_hash,
    txid,
    error: row.error || null,
    createdAt: row.created_at,
    claimedAt: row.claimed_at || null,
    broadcastAt: row.broadcast_at || null,
    resolvedAt: row.resolved_at || null,
    explorerUrl: txid
      ? `https://blockchair.com/dogecoin/transaction/${encodeURIComponent(txid)}`
      : null,
  };
}

function validBatchId(batchId) {
  return typeof batchId === 'string' && UUID_RE.test(batchId);
}

function validClaimToken(claimToken) {
  return typeof claimToken === 'string' && UUID_RE.test(claimToken);
}

function claimTokenMatches(row, claimTokenHash) {
  const stored = String((row && row.claim_token_hash) || '');
  if (!HASH_RE.test(stored) || !HASH_RE.test(claimTokenHash)) return false;
  return crypto.timingSafeEqual(Buffer.from(stored, 'hex'), Buffer.from(claimTokenHash, 'hex'));
}

function armResult(data) {
  const value = Array.isArray(data) ? data[0] : data;
  if (!isPlainObject(value) || !isPlainObject(value.batch)) return null;
  if (typeof value.replayed !== 'boolean') return null;
  return value;
}

function batchCap() {
  const configured = Number(process.env.PAYOUT_BATCH_CAP);
  return Number.isFinite(configured) && configured > 0
    ? dogeFromKoinu(numberToKoinu(configured, 'PAYOUT_BATCH_CAP'))
    : DEFAULT_BATCH_CAP;
}

function notProvisioned(res) {
  return res.status(503).json({
    ok: false,
    error: 'payout rail not provisioned (run migration 0032)',
  });
}

function databaseError(res) {
  return res.status(500).json({ ok: false, error: 'Database error' });
}

function safeRoute(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      if (isPayoutMissing(error)) return notProvisioned(res);
      if (!res.headersSent) return databaseError(res);
    }
  };
}

export function mountPayout(app, {
  db,
  payoutDb,
  now = () => new Date(),
  issueReceipt = issuePayoutReceipt,
}) {
  async function authorizeTeacher(req, res) {
    if (await requirePayoutTeacher(req, db)) return true;
    res.status(401).json({ ok: false, error: 'forbidden' });
    return false;
  }

  async function authorizeAgent(req, res) {
    if (await requirePayoutAgent(req, db)) return true;
    res.status(401).json({ ok: false, error: 'forbidden' });
    return false;
  }

  async function provisioned(res) {
    const result = await payoutDb.probe();
    if (!result || !result.error) return true;
    if (isPayoutMissing(result.error)) notProvisioned(res);
    else databaseError(res);
    return false;
  }

  async function loadCurrentPlan() {
    const rosterResult = await db.listRoster(null);
    if (rosterResult && rosterResult.error) throw rosterResult.error;

    const studentIds = ((rosterResult && rosterResult.data) || [])
      .map((row) => row && row.student_id)
      .filter(Boolean);
    if (!studentIds.length) return buildPayoutPlan([]);

    const accountResult = await db.listDogeAccounts(studentIds);
    if (accountResult && accountResult.error) throw accountResult.error;
    return buildPayoutPlan((accountResult && accountResult.data) || []);
  }

  async function fetchBatch(batchId, res) {
    const result = await payoutDb.getBatch(batchId);
    if (result && result.error) {
      if (isPayoutMissing(result.error)) notProvisioned(res);
      else databaseError(res);
      return undefined;
    }
    const row = batchRow(result && result.data);
    if (!row) {
      res.status(404).json({ ok: false, error: 'batch not found' });
      return undefined;
    }
    return row;
  }

  async function resolveConditionalMiss(batchId, res, replayStatus) {
    const row = await fetchBatch(batchId, res);
    if (!row) return;
    if (row.status === replayStatus) {
      return res.json({ ok: true, replayed: true, batch: publicBatch(row) });
    }
    return res.status(409).json({
      ok: false,
      error: `cannot transition batch from status '${row.status}'`,
      batch: publicBatch(row),
    });
  }

  app.post('/payout/plan', safeRoute(async (req, res) => {
    if (!await authorizeTeacher(req, res)) return;
    if (!await provisioned(res)) return;

    const plan = await loadCurrentPlan();
    const planHash = hashPayoutPlan(plan);
    const cap = batchCap();
    return res.json({
      ok: true,
      plan,
      rows: plan.rows,
      total: plan.total,
      minPerStudent: plan.minPerStudent,
      planHash,
      batchCap: cap,
      overCap: numberToKoinu(plan.total, 'plan total') > numberToKoinu(cap, 'batch cap'),
    });
  }));

  app.post('/payout/batch', safeRoute(async (req, res) => {
    if (!await authorizeTeacher(req, res)) return;
    if (!await provisioned(res)) return;

    if (!hasExactKeys(req.body, ['planHash'])) {
      return res.status(400).json({ ok: false, error: 'valid planHash required' });
    }
    const requestedHash = req.body.planHash;
    if (typeof requestedHash !== 'string' || !HASH_RE.test(requestedHash)) {
      return res.status(400).json({ ok: false, error: 'valid planHash required' });
    }

    const plan = await loadCurrentPlan();
    const freshHash = hashPayoutPlan(plan);
    if (requestedHash.toLowerCase() !== freshHash) {
      return res.status(409).json({
        ok: false,
        error: 'plan changed',
        plan,
        planHash: freshHash,
      });
    }
    if (!plan.rows.length) {
      return res.status(409).json({ ok: false, error: 'nothing ready', plan, planHash: freshHash });
    }

    const cap = batchCap();
    if (numberToKoinu(plan.total, 'plan total') > numberToKoinu(cap, 'batch cap')) {
      return res.status(409).json({
        ok: false,
        error: 'payout plan exceeds batch cap',
        plan,
        planHash: freshHash,
        batchCap: cap,
      });
    }

    const active = await payoutDb.getActiveBatch();
    if (active && active.error) {
      if (isPayoutMissing(active.error)) return notProvisioned(res);
      return databaseError(res);
    }
    const activeRow = batchRow(active && active.data);
    if (activeRow) {
      return res.status(409).json({ ok: false, error: 'active payout batch exists', batch: publicBatch(activeRow) });
    }

    const inserted = await payoutDb.createBatch({ plan, planHash: freshHash });
    if (inserted && inserted.error) {
      if (isPayoutMissing(inserted.error)) return notProvisioned(res);
      if (isPayoutConflict(inserted.error)) {
        if (String(inserted.error.code || '') === '23505') {
          const winner = await payoutDb.getActiveBatch();
          const winnerRow = batchRow(winner && winner.data);
          return res.status(409).json({
            ok: false,
            error: 'active payout batch exists',
            batch: publicBatch(winnerRow),
          });
        }

        const currentPlan = await loadCurrentPlan();
        return res.status(409).json({
          ok: false,
          error: 'plan changed; create a fresh payout plan',
          plan: currentPlan,
          planHash: hashPayoutPlan(currentPlan),
        });
      }
      return databaseError(res);
    }
    return res.status(201).json({ ok: true, batch: publicBatch(batchRow(inserted && inserted.data)) });
  }));

  app.post('/payout/batch/:id/cancel', safeRoute(async (req, res) => {
    if (!await authorizeTeacher(req, res)) return;
    if (!await provisioned(res)) return;
    if (!validBatchId(req.params.id)) return res.status(404).json({ ok: false, error: 'batch not found' });

    const result = await payoutDb.cancelBatch(req.params.id, now().toISOString());
    if (result && result.error) {
      if (isPayoutMissing(result.error)) return notProvisioned(res);
      return databaseError(res);
    }
    const row = batchRow(result && result.data);
    if (row) return res.json({ ok: true, batch: publicBatch(row) });
    return resolveConditionalMiss(req.params.id, res, 'cancelled');
  }));

  app.get('/payout/next', safeRoute(async (req, res) => {
    if (!await authorizeAgent(req, res)) return;
    if (!await provisioned(res)) return;
    res.setHeader('Cache-Control', 'no-store');

    const result = await payoutDb.getNextBatch();
    if (result && result.error) {
      if (isPayoutMissing(result.error)) return notProvisioned(res);
      return databaseError(res);
    }
    const row = batchRow(result && result.data);
    if (!row) return res.status(204).end();
    return res.json({ ok: true, batch: publicBatch(row) });
  }));

  app.post('/payout/batch/:id/claim', safeRoute(async (req, res) => {
    if (!await authorizeAgent(req, res)) return;
    if (!await provisioned(res)) return;
    if (!validBatchId(req.params.id)) return res.status(404).json({ ok: false, error: 'batch not found' });

    if (!hasExactKeys(req.body, ['claimToken']) || !validClaimToken(req.body.claimToken)) {
      return res.status(400).json({ ok: false, error: 'valid claimToken required' });
    }
    const claimTokenHash = hashClaimToken(req.body.claimToken);

    const result = await payoutDb.claimBatch(
      req.params.id,
      claimTokenHash,
      now().toISOString(),
    );
    if (result && result.error) {
      if (isPayoutMissing(result.error)) return notProvisioned(res);
      return databaseError(res);
    }
    const row = batchRow(result && result.data);
    if (row) return res.json({ ok: true, replayed: false, batch: publicBatch(row) });

    const current = await fetchBatch(req.params.id, res);
    if (!current) return;
    if (claimTokenMatches(current, claimTokenHash)
        && ['claimed', 'sent', 'failed'].includes(current.status)) {
      return res.json({ ok: true, replayed: true, batch: publicBatch(current) });
    }
    return res.status(409).json({
      ok: false,
      error: `cannot claim batch from status '${current.status}'`,
      batch: publicBatch(current),
    });
  }));

  app.post('/payout/batch/:id/arm', safeRoute(async (req, res) => {
    if (!await authorizeAgent(req, res)) return;
    if (!await provisioned(res)) return;
    if (!validBatchId(req.params.id)) return res.status(404).json({ ok: false, error: 'batch not found' });

    if (!hasExactKeys(req.body, ['claimToken']) || !validClaimToken(req.body.claimToken)) {
      return res.status(400).json({ ok: false, error: 'valid claimToken required' });
    }
    const claimTokenHash = hashClaimToken(req.body.claimToken);
    const result = await payoutDb.armBatch(req.params.id, claimTokenHash);
    if (result && result.error) {
      if (isPayoutMissing(result.error)) return notProvisioned(res);
      if (isPayoutConflict(result.error)) {
        const current = await fetchBatch(req.params.id, res);
        if (!current) return;
        return res.status(409).json({
          ok: false,
          error: `cannot arm batch from status '${current.status}'`,
          batch: publicBatch(current),
        });
      }
      return databaseError(res);
    }

    const armed = armResult(result && result.data);
    if (!armed) return databaseError(res);
    return res.json({
      ok: true,
      replayed: armed.replayed,
      batch: publicBatch(armed.batch),
    });
  }));

  app.post('/payout/batch/:id/complete', safeRoute(async (req, res) => {
    if (!await authorizeAgent(req, res)) return;
    if (!await provisioned(res)) return;
    if (!validBatchId(req.params.id)) return res.status(404).json({ ok: false, error: 'batch not found' });

    if (!hasExactKeys(req.body, ['claimToken', 'txid', 'outputs'])) {
      return res.status(400).json({ ok: false, error: 'claimToken, txid, and outputs required' });
    }
    if (!validClaimToken(req.body.claimToken)) {
      return res.status(400).json({ ok: false, error: 'valid claimToken required' });
    }
    const txid = req.body.txid;
    if (typeof txid !== 'string' || !TXID_RE.test(txid)) {
      return res.status(400).json({ ok: false, error: 'valid txid required' });
    }

    const claimTokenHash = hashClaimToken(req.body.claimToken);
    const row = await fetchBatch(req.params.id, res);
    if (!row) return;
    if (!claimTokenMatches(row, claimTokenHash)) {
      return res.status(409).json({
        ok: false,
        error: 'payout claim token conflict',
        batch: publicBatch(row),
      });
    }
    if (row.status === 'sent') {
      return res.json({
        ok: true,
        replayed: true,
        txidMatches: String(row.txid || '').toLowerCase() === txid.toLowerCase(),
        batch: publicBatch(row),
      });
    }
    if (row.status !== 'claimed') {
      return res.status(409).json({
        ok: false,
        error: `cannot complete batch from status '${row.status}'`,
        batch: publicBatch(row),
      });
    }
    if (!row.broadcast_at) {
      return res.status(409).json({
        ok: false,
        error: 'payout batch is not armed',
        batch: publicBatch(row),
      });
    }

    const storedHash = String(row.plan_hash || '').toLowerCase();
    let actualHash;
    try {
      actualHash = hashPayoutPlan(row.plan);
    } catch (_) {
      actualHash = null;
    }
    if (!HASH_RE.test(storedHash) || actualHash !== storedHash) {
      return res.status(409).json({ ok: false, error: 'stored plan hash mismatch', batch: publicBatch(row) });
    }

    let plan;
    try {
      plan = normalizeStoredPlan(row.plan);
    } catch (_) {
      return res.status(409).json({ ok: false, error: 'stored plan is invalid', batch: publicBatch(row) });
    }

    let outputs;
    try {
      outputs = normalizeCompletionOutputs(req.body.outputs, plan);
    } catch (_) {
      return res.status(400).json({ ok: false, error: 'outputs do not match frozen plan' });
    }

    // Commit the on-chain identity before any optional receipt work or wallet
    // reconciliation. Retrying after a lost response is safe; a different txid
    // is rejected without replacing the first one.
    const recorded = await payoutDb.recordBroadcast({
      batchId: req.params.id,
      claimTokenHash,
      txid: txid.toLowerCase(),
    });
    if (recorded && recorded.error) {
      if (isPayoutMissing(recorded.error)) return notProvisioned(res);
      if (isPayoutConflict(recorded.error)) {
        const current = await fetchBatch(req.params.id, res);
        if (!current) return;
        return res.status(409).json({
          ok: false,
          error: 'payout broadcast conflict; manual reconciliation required',
          batch: publicBatch(current),
        });
      }
      return databaseError(res);
    }

    const receipts = [];
    const issuedAt = now().getTime();
    for (const output of outputs) {
      let receipt = null;
      try {
        receipt = await issueReceipt({
          studentId: output.studentId,
          batchId: req.params.id,
          txid: txid.toLowerCase(),
          doge: output.doge,
          issuedAt,
        });
      } catch (_) {
        receipt = null;
      }
      if (!receipt || typeof receipt.receiptId !== 'string'
        || typeof receipt.compact !== 'string'
        || receipt.receiptId.length < 1 || receipt.receiptId.length > 256
        || receipt.compact.length < 1 || receipt.compact.length > 8192) continue;
      receipts.push({
        studentId: output.studentId,
        receiptId: receipt.receiptId,
        receiptCompact: receipt.compact,
      });
    }

    const result = await payoutDb.completeBatch({
      batchId: req.params.id,
      claimTokenHash,
      txid: txid.toLowerCase(),
      outputs,
      receipts,
    });
    if (result && result.error) {
      if (isPayoutMissing(result.error)) return notProvisioned(res);
      if (isPayoutConflict(result.error)) {
        const current = await fetchBatch(req.params.id, res);
        if (!current) return;
        return res.status(409).json({
          ok: false,
          error: 'payout completion conflict; manual reconciliation required',
          batch: publicBatch(current),
        });
      }
      return databaseError(res);
    }

    return res.json({ ok: true, batch: publicBatch(batchRow(result && result.data)) });
  }));

  app.post('/payout/batch/:id/fail', safeRoute(async (req, res) => {
    if (!await authorizeAgent(req, res)) return;
    if (!await provisioned(res)) return;
    if (!validBatchId(req.params.id)) return res.status(404).json({ ok: false, error: 'batch not found' });

    if (!hasExactKeys(req.body, ['claimToken', 'error'])
        || !validClaimToken(req.body.claimToken)
        || typeof req.body.error !== 'string') {
      return res.status(400).json({ ok: false, error: 'valid claimToken and error required' });
    }
    const claimTokenHash = hashClaimToken(req.body.claimToken);
    const error = sanitizePayoutFailure(req.body.error);
    const result = await payoutDb.failBatch(
      req.params.id,
      claimTokenHash,
      error,
      now().toISOString(),
    );
    if (result && result.error) {
      if (isPayoutMissing(result.error)) return notProvisioned(res);
      return databaseError(res);
    }
    const row = batchRow(result && result.data);
    if (row) return res.json({ ok: true, replayed: false, batch: publicBatch(row) });

    const current = await fetchBatch(req.params.id, res);
    if (!current) return;
    if (current.status === 'failed' && claimTokenMatches(current, claimTokenHash)) {
      return res.json({ ok: true, replayed: true, batch: publicBatch(current) });
    }
    return res.status(409).json({
      ok: false,
      error: `cannot fail batch from status '${current.status}'`,
      batch: publicBatch(current),
    });
  }));

  app.get('/payout/status', safeRoute(async (req, res) => {
    if (!await authorizeTeacher(req, res)) return;
    if (!await provisioned(res)) return;

    const result = await payoutDb.getLatestBatch();
    if (result && result.error) {
      if (isPayoutMissing(result.error)) return notProvisioned(res);
      return databaseError(res);
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ ok: true, batch: publicBatch(batchRow(result && result.data)) });
  }));
}
