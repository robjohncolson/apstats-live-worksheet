// Shared, dependency-injected DOGE batch-send engine.
//
// This module deliberately knows nothing about process.argv or where
// dogecoin-cli is installed. Callers provide the RPC runner and may use either
// an in-memory journal double or the opt-in durable file-journal adapter.

import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';

export const DEFAULT_FEE_BUFFER = 5;
export const DEFAULT_JOURNAL_PATH = '.doge-send-journal.json';
const KOINU_PER_DOGE = 100_000_000;
const DECIMAL_RE = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;
const MAX_DECIMAL_POWER = 1_000;
const MAX_SAFE_KOINU = BigInt(Number.MAX_SAFE_INTEGER);
const RPC_BALANCE_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const TXID_RE = /^[0-9a-f]{64}$/i;

export const DOGE_SEND_ERROR = Object.freeze({
  INVALID_PLAN: 'INVALID_PLAN',
  CLI_UNAVAILABLE: 'CLI_UNAVAILABLE',
  CLI_RESPONSE: 'CLI_RESPONSE',
  WRONG_CHAIN: 'WRONG_CHAIN',
  INVALID_ADDRESS: 'INVALID_ADDRESS',
  INSUFFICIENT_FLOAT: 'INSUFFICIENT_FLOAT',
  // Backward-readable alias for callers that describe the same condition as
  // a balance error. Both names intentionally compare equal.
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_FLOAT',
  JOURNAL_REQUIRED: 'JOURNAL_REQUIRED',
  JOURNAL_EXISTS: 'JOURNAL_EXISTS',
  JOURNAL_WRITE_FAILED: 'JOURNAL_WRITE_FAILED',
  MISSING_TXID: 'MISSING_TXID',
});

export class DogeSendError extends Error {
  constructor(code, message, details = {}, options = {}) {
    super(message, options);
    this.name = 'DogeSendError';
    this.code = code;
    this.details = details;
    Object.assign(this, details);
  }
}

export const round8 = (value) => (
  Math.round((Number(value) || 0) * KOINU_PER_DOGE) / KOINU_PER_DOGE
);

function floorPositive8(value) {
  const match = DECIMAL_RE.exec(String(value ?? '').trim());
  if (!match || match[1] === '-') return 0;

  const fraction = match[3] ?? match[4] ?? '';
  const coefficient = BigInt(`${match[2] || '0'}${fraction}`);
  const scientificExponent = Number(match[5] || 0);
  const koinuExponent = scientificExponent - fraction.length + 8;
  if (!Number.isSafeInteger(koinuExponent)
    || Math.abs(koinuExponent) > MAX_DECIMAL_POWER) return 0;

  const koinu = koinuExponent >= 0
    ? coefficient * (10n ** BigInt(koinuExponent))
    : coefficient / (10n ** BigInt(-koinuExponent));
  if (koinu <= 0n || koinu > MAX_SAFE_KOINU) return 0;
  return Number(koinu) / KOINU_PER_DOGE;
}

// Turn /class/wallets accounts into one batched send plan. Recipients that
// cannot be paid are returned with a skip reason so they remain visible to the
// teacher. Multiple students may share one aggregated address output.
export function planSends(
  accounts,
  { maxPerKid = Infinity, minMaterialize = 5 } = {},
) {
  const recipients = [];

  for (const account of accounts || []) {
    // Wallet availability is an upper bound. Never round a fractional koinu
    // upward into an amount the server cannot mark after broadcast.
    const owed = floorPositive8(account && account.dogeToDeposit);
    if (owed <= 0) continue;

    const studentId = account && account.studentId;
    const address = (account && account.dogeAddress) || null;

    if (owed < minMaterialize - 1e-9) {
      recipients.push({
        studentId,
        address,
        amount: owed,
        skip: `below ${minMaterialize}-DOGE materialize threshold`,
      });
      continue;
    }

    if (!address) {
      recipients.push({
        studentId,
        address: null,
        amount: owed,
        skip: 'no address registered',
      });
      continue;
    }

    recipients.push({
      studentId,
      address,
      amount: floorPositive8(Math.min(owed, maxPerKid)),
    });
  }

  const sendable = recipients.filter((recipient) => (
    recipient.address && recipient.amount > 0 && !recipient.skip
  ));

  const outputs = {};
  for (const recipient of sendable) {
    outputs[recipient.address] = round8(
      (outputs[recipient.address] || 0) + recipient.amount,
    );
  }

  const total = round8(
    sendable.reduce((sum, recipient) => sum + recipient.amount, 0),
  );

  return { recipients, sendable, outputs, total };
}

function invalidPlan(message, details = {}) {
  throw new DogeSendError(DOGE_SEND_ERROR.INVALID_PLAN, message, details);
}

export function validateSourceAccount(sourceAccount = '') {
  if (typeof sourceAccount !== 'string' || sourceAccount === '*') {
    throw new TypeError('sourceAccount must be a legacy account name; "*" cannot send');
  }
  return sourceAccount;
}

function assertExecutablePlan(plan) {
  if (!plan || typeof plan !== 'object') {
    invalidPlan('send plan must be an object');
  }

  if (!Array.isArray(plan.sendable)) {
    invalidPlan('send plan must include a sendable array');
  }

  if (!plan.outputs || typeof plan.outputs !== 'object' || Array.isArray(plan.outputs)) {
    invalidPlan('send plan must include an outputs object');
  }

  const expectedOutputs = {};
  for (const recipient of plan.sendable) {
    const address = recipient && recipient.address;
    const amount = recipient && recipient.amount;

    if (typeof address !== 'string' || !address.trim()) {
      invalidPlan('every sendable recipient must have an address', { recipient });
    }

    if (typeof amount !== 'number'
      || !Number.isFinite(amount)
      || amount <= 0
      || round8(amount) !== amount) {
      invalidPlan('every sendable amount must be positive with at most 8 decimals', {
        recipient,
      });
    }

    expectedOutputs[address] = round8((expectedOutputs[address] || 0) + amount);
  }

  const outputAddresses = Object.keys(plan.outputs);
  const expectedAddresses = Object.keys(expectedOutputs);
  if (outputAddresses.length !== expectedAddresses.length) {
    invalidPlan('send plan outputs do not match its recipients');
  }

  for (const address of expectedAddresses) {
    const output = plan.outputs[address];
    if (typeof output !== 'number'
      || !Number.isFinite(output)
      || output <= 0
      || round8(output) !== output
      || output !== expectedOutputs[address]) {
      invalidPlan('send plan outputs do not match its recipients', { address });
    }
  }

  const expectedTotal = round8(
    Object.values(expectedOutputs).reduce((sum, amount) => sum + amount, 0),
  );
  if (typeof plan.total !== 'number'
    || !Number.isFinite(plan.total)
    || round8(plan.total) !== plan.total
    || plan.total !== expectedTotal) {
    invalidPlan('send plan total does not match its outputs', {
      expectedTotal,
      actualTotal: plan.total,
    });
  }

  return plan;
}

function snapshotExecutablePlan(plan) {
  assertExecutablePlan(plan);

  const sendable = Object.freeze(plan.sendable.map((recipient) => Object.freeze({
    studentId: recipient.studentId,
    address: recipient.address,
    amount: recipient.amount,
  })));
  const outputs = Object.freeze({ ...plan.outputs });

  return Object.freeze({
    recipients: sendable,
    sendable,
    outputs,
    total: plan.total,
  });
}

function freezeJournalIntent(intent) {
  const recipients = Object.freeze(
    intent.recipients.map((recipient) => Object.freeze({ ...recipient })),
  );
  return Object.freeze({
    ...intent,
    recipients,
    outputs: Object.freeze({ ...intent.outputs }),
  });
}

function isoTimestamp(now) {
  const value = typeof now === 'function' ? now() : now;
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new TypeError('journal timestamp must be a valid date');
  }

  return date.toISOString();
}

// The intent form is useful to callers that must persist BEFORE broadcast.
// Adding a txid is a separate pure operation, so recovery code never needs to
// mutate a journal object in place.
export function createJournalIntent(
  plan,
  { batchId, comment, sourceAccount = '', now = () => new Date() } = {},
) {
  assertExecutablePlan(plan);

  const intent = {
    ts: isoTimestamp(now),
    source_account: validateSourceAccount(sourceAccount),
    recipients: plan.sendable.map(({ studentId, amount }) => ({
      studentId,
      amount,
    })),
    outputs: { ...plan.outputs },
    total: round8(plan.total),
  };

  if (batchId !== undefined && batchId !== null) {
    intent.batch_id = String(batchId);
  }

  if (comment !== undefined && comment !== null && String(comment)) {
    intent.comment = String(comment);
  }

  return intent;
}

export function recordJournalTxid(intent, txid) {
  if (!intent || typeof intent !== 'object') {
    throw new TypeError('journal intent must be an object');
  }

  return {
    ...intent,
    txid: String(txid ?? '').trim(),
  };
}

export function createSendJournal(
  plan,
  { txid, batchId, comment, now = () => new Date() } = {},
) {
  const intent = createJournalIntent(plan, { batchId, comment, now });
  return recordJournalTxid(intent, txid);
}

function syncParentDirectory(filePath) {
  let directoryHandle;
  try {
    directoryHandle = openSync(dirname(filePath), 'r');
    fsyncSync(directoryHandle);
  } catch (error) {
    // Directory fsync is supported on the Linux deployment target. Some other
    // platforms reject directory handles even though the atomic rename worked.
    const unsupported = ['EBADF', 'EINVAL', 'EISDIR', 'EPERM'].includes(error && error.code);
    if (!unsupported) throw error;
  } finally {
    if (directoryHandle !== undefined) closeSync(directoryHandle);
  }
}

function removeTempFile(tempPath) {
  try {
    unlinkSync(tempPath);
  } catch (error) {
    if ((error && error.code) !== 'ENOENT') throw error;
  }
}

function writeDurableJson(filePath, value, { exclusive = false } = {}) {
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  let tempHandle;

  try {
    tempHandle = openSync(tempPath, 'wx', 0o600);
    writeFileSync(tempHandle, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fsyncSync(tempHandle);
  } catch (error) {
    if (tempHandle !== undefined) closeSync(tempHandle);
    removeTempFile(tempPath);
    throw error;
  }

  closeSync(tempHandle);

  try {
    if (exclusive) {
      // link is the atomic "create only if absent" step. Two senders racing
      // cannot both acquire the shared journal.
      linkSync(tempPath, filePath);
      unlinkSync(tempPath);
    } else {
      renameSync(tempPath, filePath);
    }
    syncParentDirectory(filePath);
  } catch (error) {
    removeTempFile(tempPath);
    throw error;
  }
}

export function createFileJournal(path = DEFAULT_JOURNAL_PATH) {
  const filePath = resolve(path);

  return Object.freeze({
    path: filePath,
    exists: () => existsSync(filePath),
    readText: () => readFileSync(filePath, 'utf8'),
    read: () => JSON.parse(readFileSync(filePath, 'utf8')),
    write: (entry, options) => writeDurableJson(filePath, entry, options),
    clear: () => {
      unlinkSync(filePath);
      syncParentDirectory(filePath);
    },
  });
}

function requireRunCli(runCli) {
  if (typeof runCli !== 'function') {
    throw new TypeError('runCli must be a function');
  }
}

async function callCli(runCli, ...args) {
  try {
    return await runCli(...args);
  } catch (cause) {
    throw new DogeSendError(
      DOGE_SEND_ERROR.CLI_UNAVAILABLE,
      `dogecoin-cli ${args[0]} failed: ${cause && cause.message ? cause.message : cause}`,
      { command: args[0] },
      { cause },
    );
  }
}

function parseCliJson(value, command) {
  if (value && typeof value === 'object' && !Buffer.isBuffer(value)) {
    return value;
  }

  try {
    return JSON.parse(String(value));
  } catch (cause) {
    throw new DogeSendError(
      DOGE_SEND_ERROR.CLI_RESPONSE,
      `dogecoin-cli ${command} returned invalid JSON`,
      { command },
      { cause },
    );
  }
}

async function readBalance(runCli, ...args) {
  const rawBalance = await callCli(runCli, 'getbalance', ...args);
  const balanceText = String(rawBalance).trim();
  const balance = RPC_BALANCE_RE.test(balanceText) ? Number(balanceText) : NaN;
  if (!Number.isFinite(balance)) {
    throw new DogeSendError(
      DOGE_SEND_ERROR.CLI_RESPONSE,
      'dogecoin-cli getbalance returned a non-numeric balance',
      { command: 'getbalance' },
    );
  }
  return balance;
}

export async function validateSendPlan(
  plan,
  {
    runCli,
    feeBuffer = DEFAULT_FEE_BUFFER,
    expectedChain = 'main',
    sourceAccount = '',
  } = {},
) {
  requireRunCli(runCli);
  assertExecutablePlan(plan);
  const account = validateSourceAccount(sourceAccount);

  const blockchainInfo = parseCliJson(
    await callCli(runCli, 'getblockchaininfo'),
    'getblockchaininfo',
  );
  const chain = blockchainInfo.chain;
  if (chain !== expectedChain) {
    throw new DogeSendError(
      DOGE_SEND_ERROR.WRONG_CHAIN,
      `node is on chain '${chain}', not ${expectedChain}`,
      { chain, expectedChain },
    );
  }

  for (const recipient of plan.sendable) {
    const validation = parseCliJson(
      await callCli(runCli, 'validateaddress', recipient.address),
      'validateaddress',
    );

    if (validation.isvalid !== true) {
      throw new DogeSendError(
        DOGE_SEND_ERROR.INVALID_ADDRESS,
        `invalid DOGE address: ${recipient.address}`,
        { address: recipient.address, studentId: recipient.studentId },
      );
    }
  }

  // sendmany checks the legacy account with one confirmation. Its bookkeeping
  // balance can be negative even when the wallet still owns spendable coins.
  const accountBalance = await readBalance(runCli, account, '1');
  const walletBalance = await readBalance(runCli);
  const balance = Math.min(accountBalance, walletBalance);

  const numericFeeBuffer = Number(feeBuffer);
  if (!Number.isFinite(numericFeeBuffer) || numericFeeBuffer < 0) {
    throw new TypeError('feeBuffer must be a non-negative number');
  }

  const needed = round8(Number(plan.total) + numericFeeBuffer);
  if (balance < needed) {
    throw new DogeSendError(
      DOGE_SEND_ERROR.INSUFFICIENT_FLOAT,
      `source account or wallet balance below total + fee buffer: have ${balance}, need ${needed}`,
      {
        balance,
        accountBalance,
        walletBalance,
        sourceAccount: account,
        needed,
        feeBuffer: numericFeeBuffer,
      },
    );
  }

  return {
    chain,
    balance,
    accountBalance,
    walletBalance,
    sourceAccount: account,
    needed,
    feeBuffer: numericFeeBuffer,
  };
}

async function hasJournal(journal) {
  if (!journal || typeof journal.exists !== 'function') return false;
  return Boolean(await journal.exists());
}

async function persistJournal(journal, entry, { exclusive, broadcastMayHaveRun }) {
  try {
    await journal.write(entry, { exclusive });
  } catch (cause) {
    if (exclusive && (cause && cause.code) === 'EEXIST') {
      throw new DogeSendError(
        DOGE_SEND_ERROR.JOURNAL_EXISTS,
        'an un-reconciled send journal already exists',
        {},
        { cause },
      );
    }

    const message = broadcastMayHaveRun
      ? 'DOGE may have broadcast, but its crash journal could not be updated'
      : 'the pre-broadcast crash journal could not be written';
    throw new DogeSendError(
      DOGE_SEND_ERROR.JOURNAL_WRITE_FAILED,
      message,
      { journal: entry, broadcastMayHaveRun },
      { cause },
    );
  }
}

function sendmanyArgs(outputs, comment, sourceAccount) {
  const args = ['sendmany', sourceAccount, JSON.stringify(outputs)];
  if (comment !== undefined && comment !== null && String(comment)) {
    args.push('1', String(comment));
  }
  return args;
}

// Validate and optionally broadcast one sendmany transaction. Dry-run is the
// default. A live call requires a journal writer and leaves journal cleanup to
// the caller, which must reconcile every server-side mark first.
export async function executeSendPlan(
  plan,
  {
    runCli,
    dryRun = true,
    feeBuffer = DEFAULT_FEE_BUFFER,
    expectedChain = 'main',
    sourceAccount = '',
    journal,
    batchId,
    comment,
    now = () => new Date(),
    onValidated = () => {},
    onBeforeBroadcast = () => {},
  } = {},
) {
  requireRunCli(runCli);

  // Work from one immutable snapshot from validation through sendmany. Hooks
  // may perform external coordination, so the caller-owned plan must never be
  // re-read after an await or diverge from the durable intent.
  const executablePlan = snapshotExecutablePlan(plan);
  const account = validateSourceAccount(sourceAccount);

  if (executablePlan.sendable.length === 0) {
    return { status: 'empty', dryRun: true, txid: null, journal: null };
  }

  if (!dryRun) {
    if (!journal || typeof journal.write !== 'function') {
      throw new DogeSendError(
        DOGE_SEND_ERROR.JOURNAL_REQUIRED,
        'a journal writer is required before broadcasting',
      );
    }

    if (await hasJournal(journal)) {
      throw new DogeSendError(
        DOGE_SEND_ERROR.JOURNAL_EXISTS,
        'an un-reconciled send journal already exists',
      );
    }
  }

  const validation = await validateSendPlan(executablePlan, {
    runCli,
    feeBuffer,
    expectedChain,
    sourceAccount: account,
  });
  await onValidated(validation);

  if (dryRun) {
    return {
      status: 'dry-run',
      dryRun: true,
      txid: null,
      journal: null,
      validation,
    };
  }

  const journalIntent = freezeJournalIntent(createJournalIntent(executablePlan, {
    batchId,
    comment,
    sourceAccount: account,
    now,
  }));
  await persistJournal(journal, journalIntent, {
    exclusive: true,
    broadcastMayHaveRun: false,
  });

  await onBeforeBroadcast();
  const rawTxid = await callCli(
    runCli,
    ...sendmanyArgs(journalIntent.outputs, journalIntent.comment, journalIntent.source_account),
  );
  const txid = String(rawTxid ?? '').trim().toLowerCase();
  const journalEntry = recordJournalTxid(journalIntent, txid);

  // This is intentionally the first operation after sendmany returns. Nothing
  // may reconcile or clear state until the txid is durably recorded.
  await persistJournal(journal, journalEntry, {
    exclusive: false,
    broadcastMayHaveRun: true,
  });

  if (!TXID_RE.test(txid)) {
    throw new DogeSendError(
      DOGE_SEND_ERROR.MISSING_TXID,
      'sendmany returned without a valid txid; the journal was kept',
      { journal: journalEntry },
    );
  }

  return {
    status: 'broadcast',
    dryRun: false,
    txid,
    journal: journalEntry,
    validation,
  };
}
