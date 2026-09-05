#!/usr/bin/env node
// Polling DOGE payout agent.
//
// The roster server is only a public-address work queue. This process runs on
// the machine that owns Dogecoin Core's wallet, verifies each frozen plan, and
// asks Core for exactly one sendmany transaction. It never handles a private
// key or a signed transaction.

import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_FEE_BUFFER,
  DEFAULT_JOURNAL_PATH,
  DOGE_SEND_ERROR,
  createFileJournal,
  executeSendPlan,
  round8,
  validateSourceAccount,
} from './lib/doge-send-core.mjs';

const JOURNAL_KIND = 'apstats-doge-payout';
const JOURNAL_VERSION = 1;
const DEFAULT_CONFIG_PATH = '.payout-agent.json';
const DEFAULT_POLL_SECONDS = 60;
const DEFAULT_BATCH_CAP = 500;
const KOINU_PER_DOGE = 100_000_000;
const HASH_RE = /^[0-9a-f]{64}$/i;
const TXID_RE = /^[0-9a-f]{64}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function lexicalCompare(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} has unexpected fields`);
  }
}

function numberToKoinu(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite`);

  const koinu = Math.round(number * KOINU_PER_DOGE);
  if (!Number.isSafeInteger(koinu)) throw new TypeError(`${label} is out of range`);
  if (koinu / KOINU_PER_DOGE !== number) {
    throw new TypeError(`${label} must have at most 8 decimals`);
  }
  return koinu;
}

function dogeFromKoinu(koinu) {
  return koinu / KOINU_PER_DOGE;
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

  if (!isPlainObject(value)) {
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
  return createHash('sha256')
    .update(canonicalizePayoutPlan(plan), 'utf8')
    .digest('hex');
}

function outputMapsEqual(left, right) {
  try {
    return canonicalizeValue(left) === canonicalizeValue(right);
  } catch (_) {
    return false;
  }
}

export function normalizePayoutPlan(rawPlan) {
  if (!isPlainObject(rawPlan)) throw new TypeError('payout plan must be an object');
  requireExactKeys(rawPlan, ['minPerStudent', 'rows', 'total'], 'payout plan');
  if (!Array.isArray(rawPlan.rows)) throw new TypeError('payout plan rows must be an array');

  const minimumKoinu = numberToKoinu(rawPlan.minPerStudent, 'plan.minPerStudent');
  if (minimumKoinu <= 0) throw new TypeError('plan.minPerStudent must be positive');

  const rows = [];
  const seenStudents = new Set();
  for (const rawRow of rawPlan.rows) {
    if (!isPlainObject(rawRow)) throw new TypeError('payout plan row must be an object');
    requireExactKeys(rawRow, ['studentId', 'address', 'doge'], 'payout plan row');

    const studentId = typeof rawRow.studentId === 'string' ? rawRow.studentId.trim() : '';
    const address = typeof rawRow.address === 'string' ? rawRow.address.trim() : '';
    const dogeKoinu = numberToKoinu(rawRow.doge, 'plan row doge');
    if (!studentId || studentId !== rawRow.studentId) throw new TypeError('invalid payout studentId');
    if (!address || address !== rawRow.address) throw new TypeError('invalid payout address');
    if (dogeKoinu < minimumKoinu) throw new TypeError('payout row is below minimum');
    if (seenStudents.has(studentId)) throw new TypeError('duplicate payout student');

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

  let totalKoinu = 0;
  const addressKoinu = new Map();
  for (const row of rows) {
    const dogeKoinu = numberToKoinu(row.doge, 'plan row doge');
    totalKoinu += dogeKoinu;
    if (!Number.isSafeInteger(totalKoinu)) throw new TypeError('payout total is out of range');
    addressKoinu.set(row.address, (addressKoinu.get(row.address) || 0) + dogeKoinu);
  }

  if (numberToKoinu(rawPlan.total, 'plan.total') !== totalKoinu) {
    throw new TypeError('payout plan total does not match rows');
  }

  const sendOutputs = {};
  for (const address of [...addressKoinu.keys()].sort(lexicalCompare)) {
    sendOutputs[address] = dogeFromKoinu(addressKoinu.get(address));
  }

  const plan = {
    minPerStudent: dogeFromKoinu(minimumKoinu),
    rows,
    total: dogeFromKoinu(totalKoinu),
  };
  const sendable = rows.map((row) => ({
    studentId: row.studentId,
    address: row.address,
    amount: row.doge,
  }));

  return {
    plan,
    sendPlan: {
      recipients: sendable,
      sendable,
      outputs: sendOutputs,
      total: plan.total,
    },
    completeOutputs: rows.map(({ studentId, doge }) => ({ studentId, doge })),
  };
}

export function insufficientFloatMessage(have, need) {
  const format = (value) => (
    round8(value).toFixed(8).replace(/\.?0+$/, '') || '0'
  );
  return `insufficient float: have Ɖ${format(Math.max(0, have))} need Ɖ${format(need)}`;
}

function parseArgs(argv) {
  const parsed = { configPath: null, once: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--once') {
      parsed.once = true;
      continue;
    }
    if (arg === '--config') {
      if (!argv[index + 1]) throw new TypeError('--config requires a path');
      parsed.configPath = argv[index + 1];
      index += 1;
      continue;
    }
    throw new TypeError(`unknown argument: ${arg}`);
  }
  return parsed;
}

function optionalFileConfig(configPath, { explicit, readFile }) {
  try {
    return JSON.parse(readFile(configPath, 'utf8'));
  } catch (error) {
    if (!explicit && error && error.code === 'ENOENT') return {};
    throw error;
  }
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function configNumber(value, fallback, label, { allowZero = false } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  const valid = Number.isFinite(number) && (allowZero ? number >= 0 : number > 0);
  if (!valid) throw new TypeError(`${label} must be ${allowZero ? 'non-negative' : 'positive'}`);
  return number;
}

export function loadAgentConfig({
  argv = process.argv.slice(2),
  env = process.env,
  cwd = process.cwd(),
  readFile = readFileSync,
} = {}) {
  const cli = parseArgs(argv);
  const configPath = resolve(cwd, cli.configPath || DEFAULT_CONFIG_PATH);
  const file = optionalFileConfig(configPath, { explicit: !!cli.configPath, readFile });
  if (!isPlainObject(file)) throw new TypeError(`${configPath}: config must be an object`);

  const rosterUrl = firstText(env.ROSTER_URL, file.rosterUrl).replace(/\/+$/, '');
  const payoutAgentKey = firstText(env.PAYOUT_AGENT_KEY, file.payoutAgentKey);
  const teacherKey = firstText(
    env.TEACHER_KEY,
    env.TEACHER_SECRET,
    file.teacherKey,
    file.teacherSecret,
  );
  if (!rosterUrl) throw new TypeError('rosterUrl is required');
  if (!payoutAgentKey && !teacherKey) {
    throw new TypeError('payoutAgentKey or teacherKey is required');
  }

  const journalValue = firstText(env.PAYOUT_JOURNAL, file.journalPath, DEFAULT_JOURNAL_PATH);
  return Object.freeze({
    rosterUrl,
    payoutAgentKey,
    teacherKey,
    dogeCli: firstText(env.DOGE_CLI, env.DOGECOIN_CLI, file.dogeCli, 'dogecoin-cli'),
    walletName: firstText(env.DOGE_WALLET, file.walletName),
    sourceAccount: validateSourceAccount(env.DOGE_SOURCE_ACCOUNT ?? file.sourceAccount),
    feeHeadroom: configNumber(
      env.PAYOUT_FEE_HEADROOM ?? file.feeHeadroom,
      DEFAULT_FEE_BUFFER,
      'feeHeadroom',
      { allowZero: true },
    ),
    pollSeconds: configNumber(
      env.POLL_SECONDS ?? file.pollSeconds,
      DEFAULT_POLL_SECONDS,
      'pollSeconds',
    ),
    batchCap: configNumber(
      env.PAYOUT_BATCH_CAP ?? file.batchCap,
      DEFAULT_BATCH_CAP,
      'batchCap',
    ),
    journalPath: resolve(cwd, journalValue),
    configPath,
    once: cli.once,
  });
}

export function createRunCli({
  dogeCli = 'dogecoin-cli',
  walletName = '',
  execFile = execFileSync,
} = {}) {
  if (typeof execFile !== 'function') throw new TypeError('execFile must be a function');
  const prefix = walletName ? [`-rpcwallet=${walletName}`] : [];

  return (...rpcArgs) => {
    const result = execFile(dogeCli, [...prefix, ...rpcArgs], { encoding: 'utf8' });
    if (result && typeof result.then === 'function') {
      return result.then((value) => String(value ?? '').trim());
    }
    return String(result ?? '').trim();
  };
}

export class PayoutHttpError extends Error {
  constructor(message, { status = 0, payload = null } = {}) {
    super(message);
    this.name = 'PayoutHttpError';
    this.code = 'PAYOUT_HTTP_ERROR';
    this.status = status;
    this.payload = payload;
    this.batch = payload && payload.batch;
  }
}

async function readResponseJson(response) {
  try {
    return await response.json();
  } catch (_) {
    return null;
  }
}

export function createPayoutClient({
  rosterUrl,
  payoutAgentKey = '',
  teacherKey = '',
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!rosterUrl) throw new TypeError('rosterUrl is required');
  if (!payoutAgentKey && !teacherKey) throw new TypeError('an agent or teacher key is required');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');

  const baseUrl = String(rosterUrl).replace(/\/+$/, '');
  const authHeader = payoutAgentKey
    ? { 'x-payout-agent-key': payoutAgentKey }
    : { 'x-teacher-secret': teacherKey };

  async function request(path, { method = 'GET', body } = {}) {
    const headers = { ...authHeader };
    const options = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, options);
    } catch (_) {
      throw new PayoutHttpError('payout server request failed');
    }

    if (response.status === 204) return null;
    const payload = await readResponseJson(response);
    if (!response.ok) {
      throw new PayoutHttpError(`payout server returned HTTP ${response.status}`, {
        status: response.status,
        payload,
      });
    }
    return payload;
  }

  const batchPath = (batchId, action) => (
    `/payout/batch/${encodeURIComponent(batchId)}/${action}`
  );

  return Object.freeze({
    next: async () => {
      const payload = await request('/payout/next');
      return payload ? (payload.batch || payload) : null;
    },
    claim: (batchId, claimToken) => request(batchPath(batchId, 'claim'), {
      method: 'POST',
      body: { claimToken },
    }),
    arm: (batchId, claimToken) => request(batchPath(batchId, 'arm'), {
      method: 'POST',
      body: { claimToken },
    }),
    complete: (batchId, claimToken, txid, outputs) => request(batchPath(batchId, 'complete'), {
      method: 'POST',
      body: { claimToken, txid, outputs },
    }),
    fail: (batchId, claimToken, error) => request(batchPath(batchId, 'fail'), {
      method: 'POST',
      body: { claimToken, error },
    }),
  });
}

function parseCliJson(value, command) {
  if (isPlainObject(value) || Array.isArray(value)) return value;
  try {
    return JSON.parse(String(value));
  } catch (_) {
    throw new TypeError(`dogecoin-cli ${command} returned invalid JSON`);
  }
}

function batchField(batch, camel, snake) {
  if (batch && batch[camel] !== undefined) return batch[camel];
  return batch && batch[snake];
}

function normalizeBatchEnvelope(rawBatch) {
  if (!isPlainObject(rawBatch)) throw new TypeError('payout batch must be an object');
  const batchId = String(batchField(rawBatch, 'batchId', 'batch_id') || '');
  const planHash = String(batchField(rawBatch, 'planHash', 'plan_hash') || '').toLowerCase();
  const plan = rawBatch.plan;
  if (!UUID_RE.test(batchId)) throw new TypeError('payout batch has invalid batchId');
  if (!HASH_RE.test(planHash)) throw new TypeError('payout batch has invalid planHash');
  if (!isPlainObject(plan)) throw new TypeError('payout batch has invalid plan');
  return { batchId, planHash, plan, status: rawBatch.status };
}

function isoNow(now) {
  const value = typeof now === 'function' ? now() : now;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError('now must be a valid date');
  return date.toISOString();
}

function safeClear(journal) {
  try {
    journal.clear();
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error;
  }
}

function defaultIsProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !!error && error.code === 'EPERM';
  }
}

function assertPayoutJournal(entry) {
  if (!isPlainObject(entry)
    || entry.kind !== JOURNAL_KIND
    || entry.version !== JOURNAL_VERSION
    || !UUID_RE.test(String(entry.batch_id || ''))
    || !UUID_RE.test(String(entry.claim_token || ''))
    || !HASH_RE.test(String(entry.plan_hash || ''))) {
    throw new TypeError('unrecognized DOGE send journal; manual reconciliation required');
  }
  return entry;
}

function acquireJournalOwner(entry, journal, {
  pid,
  ownerNonce,
  now,
  isProcessAlive,
}) {
  const previousPid = Number(entry.owner && entry.owner.pid);
  const previousNonce = entry.owner && entry.owner.nonce;
  if (previousPid > 0
    && previousPid !== pid
    && previousNonce
    && isProcessAlive(previousPid)) {
    return null;
  }

  const owned = {
    ...entry,
    owner: { pid, nonce: ownerNonce, started_at: isoNow(now) },
  };
  journal.write(owned, { exclusive: false });
  return owned;
}

function payoutComment(batchId, planHash) {
  return `apstats-payout:${batchId}:${planHash}`;
}

function transactionOutputs(transaction) {
  if (!isPlainObject(transaction) || !Array.isArray(transaction.details)) return null;
  const byAddress = new Map();
  for (const detail of transaction.details) {
    if (!detail || detail.category !== 'send') continue;
    if (detail.abandoned === true) return null;
    const address = typeof detail.address === 'string' ? detail.address : '';
    const amountKoinu = Math.abs(numberToKoinu(detail.amount, 'transaction amount'));
    if (!address || amountKoinu <= 0) return null;
    byAddress.set(address, (byAddress.get(address) || 0) + amountKoinu);
  }
  if (!byAddress.size) return null;

  const outputs = {};
  for (const address of [...byAddress.keys()].sort(lexicalCompare)) {
    outputs[address] = dogeFromKoinu(byAddress.get(address));
  }
  return outputs;
}

export async function findBroadcastForIntent(entry, { runCli } = {}) {
  assertPayoutJournal(entry);
  if (typeof runCli !== 'function') throw new TypeError('runCli must be a function');
  if (!entry.anchor_block_hash || !entry.comment || !entry.send_outputs) {
    return { status: 'unknown', reason: 'journal is missing recovery anchors' };
  }

  const walletInfo = parseCliJson(await runCli('getwalletinfo'), 'getwalletinfo');
  const recordedFingerprint = typeof entry.wallet_fingerprint === 'string'
    ? entry.wallet_fingerprint.trim()
    : '';
  const currentFingerprint = typeof walletInfo.hdmasterkeyid === 'string'
    ? walletInfo.hdmasterkeyid.trim()
    : '';
  if (!recordedFingerprint || !currentFingerprint) {
    return { status: 'unknown', reason: 'wallet fingerprint unavailable' };
  }
  if (currentFingerprint !== recordedFingerprint) {
    return { status: 'unknown', reason: 'wallet fingerprint changed' };
  }

  const since = parseCliJson(
    await runCli('listsinceblock', entry.anchor_block_hash, '1', 'false'),
    'listsinceblock',
  );
  if (!isPlainObject(since)
    || !Array.isArray(since.transactions)
    || (since.removed !== undefined && !Array.isArray(since.removed))
    || !HASH_RE.test(String(since.lastblock || ''))) {
    return { status: 'unknown', reason: 'invalid listsinceblock recovery response' };
  }

  const matches = new Set();
  for (const transaction of since.transactions) {
    if (!transaction || transaction.comment !== entry.comment) continue;
    if (transaction.category !== 'send'
      || !TXID_RE.test(String(transaction.txid || ''))) {
      return { status: 'unknown', reason: 'matching recovery entry is malformed' };
    }
    matches.add(String(transaction.txid).toLowerCase());
  }

  for (const transaction of since.removed || []) {
    if (!transaction || transaction.comment !== entry.comment) continue;
    if (transaction.category !== 'send'
      || !TXID_RE.test(String(transaction.txid || ''))) {
      return { status: 'unknown', reason: 'matching recovery entry is malformed' };
    }
    return { status: 'unknown', reason: 'matching broadcast appears in removed transactions' };
  }

  if (matches.size === 0) return { status: 'absent' };
  if (matches.size !== 1) return { status: 'unknown', reason: 'multiple matching broadcasts' };

  const txid = [...matches][0];
  const transaction = parseCliJson(await runCli('gettransaction', txid), 'gettransaction');
  const confirmations = Number(transaction.confirmations);
  if (String(transaction.txid || '').toLowerCase() !== txid
    || transaction.comment !== entry.comment
    || !Number.isFinite(confirmations)
    || confirmations < 0
    || transaction.abandoned === true) {
    return { status: 'unknown', reason: 'matching transaction is unsafe' };
  }

  const outputs = transactionOutputs(transaction);
  if (!outputs || !outputMapsEqual(outputs, entry.send_outputs)) {
    return { status: 'unknown', reason: 'matching transaction outputs differ' };
  }
  return { status: 'found', txid };
}

function sameRecipientSet(coreRecipients, completeOutputs) {
  if (!Array.isArray(coreRecipients) || !Array.isArray(completeOutputs)) return false;
  const expected = completeOutputs.map(({ studentId, doge }) => ({
    studentId,
    amount: doge,
  }));
  return canonicalizeValue(coreRecipients) === canonicalizeValue(expected);
}

function createCoreJournalView(journal, { batchId, ownerNonce }) {
  return Object.freeze({
    // The outer payout envelope already acquired the real file exclusively.
    exists: () => false,
    write(coreEntry, { exclusive = false } = {}) {
      const current = assertPayoutJournal(journal.read());
      if (!current.owner || current.owner.nonce !== ownerNonce) {
        throw new Error('payout journal ownership changed');
      }
      if (current.batch_id !== batchId
        || coreEntry.batch_id !== batchId
        || coreEntry.comment !== current.comment
        || coreEntry.source_account !== current.source_account
        || Number(coreEntry.total) !== Number(current.total)
        || !sameRecipientSet(coreEntry.recipients, current.complete_outputs)
        || !outputMapsEqual(coreEntry.outputs, current.send_outputs)) {
        throw new Error('core journal does not match frozen payout');
      }
      if (exclusive && current.phase !== 'observed') {
        throw new Error('payout intent already exists');
      }

      const candidateTxid = coreEntry.txid
        ? String(coreEntry.txid).trim().toLowerCase()
        : null;
      const txid = candidateTxid && TXID_RE.test(candidateTxid)
        ? candidateTxid
        : null;
      const next = {
        ...current,
        phase: txid ? 'broadcast' : 'intent',
        intent_at: coreEntry.ts,
        txid: txid || undefined,
      };
      journal.write(next, { exclusive: false });
    },
  });
}

async function completeJournalEntry(entry, { client, journal, now }) {
  if (!TXID_RE.test(String(entry.txid || ''))) {
    return { status: 'blocked', reason: 'journal txid is invalid' };
  }

  let response;
  try {
    response = await client.complete(
      entry.batch_id,
      entry.claim_token,
      String(entry.txid).toLowerCase(),
      entry.complete_outputs,
    );
  } catch (failure) {
    if (failure && failure.status === 409) {
      return {
        status: 'blocked',
        reason: 'server rejected payout completion; manual reconciliation required',
      };
    }
    throw failure;
  }
  const batch = response && (response.batch || response);
  if (!batch || batch.status !== 'sent') {
    return { status: 'blocked', reason: 'server did not confirm sent state' };
  }
  const serverTxid = String(batchField(batch, 'txid', 'txid') || '').toLowerCase();
  if (serverTxid !== String(entry.txid).toLowerCase()) {
    return { status: 'blocked', reason: 'server txid differs from journal' };
  }

  journal.write({ ...entry, phase: 'complete', complete_at: isoNow(now) }, { exclusive: false });
  safeClear(journal);
  return { status: 'completed', batchId: entry.batch_id, txid: serverTxid };
}

async function failJournalEntry(entry, error, { client, journal, now }) {
  let response;
  try {
    response = await client.fail(entry.batch_id, entry.claim_token, error);
  } catch (failure) {
    if (failure && failure.status === 409) {
      return {
        status: 'blocked',
        reason: 'server refused failure after broadcast arm; manual reconciliation required',
      };
    }
    throw failure;
  }
  const batch = response && (response.batch || response);
  if (!batch || batch.status !== 'failed') {
    return { status: 'blocked', reason: 'server did not confirm failed state' };
  }
  journal.write({ ...entry, phase: 'failed', failed_at: isoNow(now), error }, { exclusive: false });
  safeClear(journal);
  return { status: 'failed', batchId: entry.batch_id, error };
}

async function armBroadcast(entry, {
  client,
  journal,
  ownerNonce,
}) {
  const before = assertPayoutJournal(journal.read());
  if (before.batch_id !== entry.batch_id
    || before.claim_token !== entry.claim_token
    || before.source_account !== entry.source_account
    || before.phase !== 'intent'
    || !before.owner
    || before.owner.nonce !== ownerNonce) {
    throw new Error('payout journal changed before broadcast arm');
  }

  const response = await client.arm(entry.batch_id, entry.claim_token);
  const batch = response && (response.batch || response);
  const broadcastAt = batchField(batch, 'broadcastAt', 'broadcast_at');
  if (!response || response.replayed !== false
    || !batch || batch.status !== 'claimed'
    || typeof broadcastAt !== 'string'
    || Number.isNaN(new Date(broadcastAt).getTime())) {
    throw new Error('server did not grant a fresh broadcast arm');
  }

  const current = assertPayoutJournal(journal.read());
  if (current.batch_id !== entry.batch_id
    || current.claim_token !== entry.claim_token
    || current.source_account !== entry.source_account
    || current.phase !== 'intent'
    || !current.owner
    || current.owner.nonce !== ownerNonce) {
    throw new Error('payout journal changed during broadcast arm');
  }

  journal.write({
    ...current,
    broadcast_armed_at: broadcastAt,
  }, { exclusive: false });
}

function controlledCoreFailure(error) {
  if (!error) return null;
  if (error.code === DOGE_SEND_ERROR.INSUFFICIENT_FLOAT) {
    return insufficientFloatMessage(error.balance, error.needed);
  }
  if (error.code === DOGE_SEND_ERROR.WRONG_CHAIN) return 'wrong Dogecoin network';
  if (error.code === DOGE_SEND_ERROR.INVALID_ADDRESS) return 'invalid payout address';
  if (error.code === DOGE_SEND_ERROR.INVALID_PLAN) return 'payout agent failed';
  return null;
}

async function prepareObservedEntry(entry, { runCli, journal, config }) {
  const actualHash = hashPayoutPlan(entry.plan);
  if (actualHash !== entry.plan_hash) {
    return { failure: 'plan hash mismatch' };
  }

  let normalized;
  try {
    normalized = normalizePayoutPlan(entry.plan);
  } catch (_) {
    return { failure: 'payout agent failed' };
  }
  if (!normalized.plan.rows.length || normalized.plan.total > config.batchCap) {
    return { failure: 'payout agent failed' };
  }

  const anchor = String(await runCli('getbestblockhash')).trim();
  if (!HASH_RE.test(anchor)) throw new TypeError('dogecoin-cli getbestblockhash returned invalid hash');
  const walletInfo = parseCliJson(await runCli('getwalletinfo'), 'getwalletinfo');
  const prepared = {
    ...entry,
    plan: normalized.plan,
    complete_outputs: normalized.completeOutputs,
    send_outputs: normalized.sendPlan.outputs,
    total: normalized.sendPlan.total,
    comment: payoutComment(entry.batch_id, entry.plan_hash),
    anchor_block_hash: anchor.toLowerCase(),
    wallet_fingerprint: typeof walletInfo.hdmasterkeyid === 'string'
      ? walletInfo.hdmasterkeyid
      : null,
    // Journals from before account selection always used Core's empty account.
    source_account: validateSourceAccount(entry.source_account),
  };
  journal.write(prepared, { exclusive: false });
  return { entry: prepared, normalized };
}

async function resumeObservedEntry(entry, deps) {
  const { client, journal, runCli, config, now, ownerNonce } = deps;
  try {
    const claim = await client.claim(entry.batch_id, entry.claim_token);
    const claimedBatch = claim && (claim.batch || claim);
    if (claim && claim.replayed === true && claimedBatch && claimedBatch.status === 'failed') {
      safeClear(journal);
      return { status: 'failed', batchId: entry.batch_id };
    }
    if (!claimedBatch || claimedBatch.status !== 'claimed') {
      return { status: 'blocked', reason: 'server did not confirm claimed state' };
    }
  } catch (error) {
    if (error && error.batch && error.batch.status === 'failed') {
      safeClear(journal);
      return { status: 'failed', batchId: entry.batch_id };
    }
    if (error && error.status === 409) {
      return {
        status: 'blocked',
        reason: 'claim token was rejected; manual reconciliation required',
      };
    }
    throw error;
  }

  const prepared = await prepareObservedEntry(entry, { runCli, journal, config });
  if (prepared.failure) {
    return failJournalEntry(entry, prepared.failure, { client, journal, now });
  }

  const coreJournal = createCoreJournalView(journal, {
    batchId: entry.batch_id,
    ownerNonce,
  });
  try {
    await executeSendPlan(prepared.normalized.sendPlan, {
      runCli,
      dryRun: false,
      feeBuffer: config.feeHeadroom,
      sourceAccount: prepared.entry.source_account,
      journal: coreJournal,
      batchId: entry.batch_id,
      comment: prepared.entry.comment,
      now,
      onBeforeBroadcast: () => armBroadcast(prepared.entry, {
        client,
        journal,
        ownerNonce,
      }),
    });
  } catch (error) {
    const current = assertPayoutJournal(journal.read());
    if (current.phase === 'intent' || current.phase === 'broadcast') {
      return recoverPayoutJournal(deps);
    }
    const controlled = controlledCoreFailure(error);
    if (controlled) {
      return failJournalEntry(current, controlled, { client, journal, now });
    }
    throw error;
  }

  return completeJournalEntry(assertPayoutJournal(journal.read()), {
    client,
    journal,
    now,
  });
}

export async function recoverPayoutJournal({
  journal,
  client,
  runCli,
  config,
  now = () => new Date(),
  pid = process.pid,
  ownerNonce = randomUUID(),
  isProcessAlive = defaultIsProcessAlive,
} = {}) {
  if (!journal || !journal.exists()) return { status: 'clear' };

  let entry;
  try {
    entry = assertPayoutJournal(journal.read());
  } catch (_) {
    return { status: 'blocked', reason: 'unrecognized DOGE send journal' };
  }

  const owned = acquireJournalOwner(entry, journal, {
    pid,
    ownerNonce,
    now,
    isProcessAlive,
  });
  if (!owned) return { status: 'blocked', reason: 'another payout agent owns the journal' };

  const deps = {
    journal,
    client,
    runCli,
    config,
    now,
    pid,
    ownerNonce,
    isProcessAlive,
  };
  if (owned.phase === 'complete' || owned.phase === 'failed') {
    safeClear(journal);
    return { status: 'cleared', batchId: owned.batch_id };
  }
  if (owned.phase === 'observed') return resumeObservedEntry(owned, deps);
  if (owned.phase === 'broadcast') return completeJournalEntry(owned, { client, journal, now });
  if (owned.phase !== 'intent') return { status: 'blocked', reason: 'unknown payout journal phase' };

  let discovery;
  try {
    discovery = await findBroadcastForIntent(owned, { runCli });
  } catch (_) {
    return { status: 'blocked', reason: 'Dogecoin Core unavailable during recovery' };
  }
  if (discovery.status === 'unknown') return { status: 'blocked', reason: discovery.reason };
  if (discovery.status === 'absent') {
    if (owned.broadcast_armed_at) {
      return {
        status: 'blocked',
        reason: 'broadcast was armed but no transaction was found; manual reconciliation required',
      };
    }
    return failJournalEntry(owned, 'broadcast not found during crash recovery', {
      client,
      journal,
      now,
    });
  }

  const broadcast = { ...owned, phase: 'broadcast', txid: discovery.txid };
  journal.write(broadcast, { exclusive: false });
  return completeJournalEntry(broadcast, { client, journal, now });
}

export async function processPayoutBatch(rawBatch, {
  journal,
  client,
  runCli,
  config,
  now = () => new Date(),
  pid = process.pid,
  ownerNonce = randomUUID(),
  isProcessAlive = defaultIsProcessAlive,
} = {}) {
  const batch = normalizeBatchEnvelope(rawBatch);
  const observed = {
    kind: JOURNAL_KIND,
    version: JOURNAL_VERSION,
    batch_id: batch.batchId,
    claim_token: randomUUID(),
    phase: 'observed',
    plan_hash: batch.planHash,
    plan: batch.plan,
    source_account: validateSourceAccount(config.sourceAccount),
    observed_at: isoNow(now),
    owner: { pid, nonce: ownerNonce, started_at: isoNow(now) },
  };

  journal.write(observed, { exclusive: true });
  return resumeObservedEntry(observed, {
    journal,
    client,
    runCli,
    config,
    now,
    pid,
    ownerNonce,
    isProcessAlive,
  });
}

export async function pollOnce({ journal, client, ...deps } = {}) {
  if (journal.exists()) {
    return recoverPayoutJournal({ journal, client, ...deps });
  }
  const batch = await client.next();
  if (!batch) return { status: 'idle' };
  return processPayoutBatch(batch, { journal, client, ...deps });
}

function defaultSleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function safeLogReason(result) {
  if (!result) return 'unknown result';
  if (result.status === 'blocked') return result.reason || 'manual reconciliation required';
  if (result.status === 'completed') return `batch ${result.batchId} completed (${result.txid})`;
  if (result.status === 'failed') return `batch ${result.batchId} failed`;
  return result.status;
}

export async function runAgent({
  config,
  journal = createFileJournal(config.journalPath),
  client = createPayoutClient({
    rosterUrl: config.rosterUrl,
    payoutAgentKey: config.payoutAgentKey,
    teacherKey: config.teacherKey,
  }),
  runCli = createRunCli(config),
  sleep = defaultSleep,
  logger = console,
  shouldStop = () => false,
  now = () => new Date(),
  pid = process.pid,
  isProcessAlive = defaultIsProcessAlive,
} = {}) {
  const ownerNonce = randomUUID();
  do {
    try {
      const result = await pollOnce({
        config,
        journal,
        client,
        runCli,
        now,
        pid,
        ownerNonce,
        isProcessAlive,
      });
      if (result.status !== 'idle' && logger && typeof logger.log === 'function') {
        logger.log(`DOGE payout agent: ${safeLogReason(result)}`);
      }
    } catch (error) {
      const label = error && error.code ? error.code : 'operation failed';
      if (logger && typeof logger.error === 'function') {
        logger.error(`DOGE payout agent: ${label}`);
      }
    }

    if (config.once || shouldStop()) break;
    await sleep(config.pollSeconds * 1000);
  } while (!shouldStop());
}

export async function main(argv = process.argv.slice(2)) {
  const config = loadAgentConfig({ argv });
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    await runAgent({ config, shouldStop: () => stopping });
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(`DOGE payout agent failed: ${error && error.name ? error.name : 'Error'}`);
    process.exitCode = 1;
  });
}
