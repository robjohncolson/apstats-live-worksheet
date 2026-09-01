import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  canonicalizePayoutPlan,
  createPayoutClient,
  createRunCli,
  findBroadcastForIntent,
  hashPayoutPlan,
  insufficientFloatMessage,
  loadAgentConfig,
  normalizePayoutPlan,
  pollOnce,
  processPayoutBatch,
  recoverPayoutJournal,
  runAgent,
} from '../tools/doge-payout-agent.mjs';
import {
  canonicalizePayoutPlan as canonicalizeServerPlan,
  hashPayoutPlan as hashServerPlan,
} from '../roster-server/payout.js';

const BATCH_ID = '11111111-1111-4111-8111-111111111111';
const CLAIM_TOKEN = '22222222-2222-4222-8222-222222222222';
const OTHER_CLAIM_TOKEN = '33333333-3333-4333-8333-333333333333';
const TXID = 'a'.repeat(64);
const OTHER_TXID = 'c'.repeat(64);
const ANCHOR = 'b'.repeat(64);
const NOW = new Date('2026-09-01T12:00:00.000Z');
const now = () => new Date(NOW);

const GOLDEN_PLAN = Object.freeze({
  minPerStudent: 5,
  rows: [
    { studentId: 's1', address: 'Dabc', doge: 5 },
    { studentId: 's2', address: 'Ddef', doge: 7.5 },
  ],
  total: 12.5,
});
const GOLDEN_CANONICAL = '{"minPerStudent":5,"rows":[{"address":"Dabc","doge":5,"studentId":"s1"},{"address":"Ddef","doge":7.5,"studentId":"s2"}],"total":12.5}';
const GOLDEN_HASH = 'c2a858577a42410bb1425893c89cc1198328038afcefe61349459fb623694d90';

const CONFIG = Object.freeze({
  rosterUrl: 'https://roster.test',
  payoutAgentKey: 'agent-secret',
  teacherKey: '',
  dogeCli: 'dogecoin-cli',
  walletName: '',
  feeHeadroom: 5,
  pollSeconds: 60,
  batchCap: 500,
  journalPath: '/unused/.doge-send-journal.json',
  once: true,
});

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function batch(plan = GOLDEN_PLAN, overrides = {}) {
  return {
    batchId: BATCH_ID,
    status: 'pending',
    plan: clone(plan),
    planHash: hashPayoutPlan(plan),
    txid: null,
    error: null,
    broadcastAt: null,
    ...overrides,
  };
}

function memoryJournal(initial = null) {
  let value = clone(initial);
  const writes = [];
  let clears = 0;

  return {
    exists: () => value !== null,
    read: () => clone(value),
    readText: () => JSON.stringify(value),
    write(next, { exclusive = false } = {}) {
      if (exclusive && value !== null) {
        const error = new Error('exists');
        error.code = 'EEXIST';
        throw error;
      }
      value = clone(next);
      writes.push({ value: clone(value), exclusive });
    },
    clear() {
      value = null;
      clears += 1;
    },
    snapshot: () => clone(value),
    writes,
    clearCount: () => clears,
  };
}

function response(status, payload) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => clone(payload),
  };
}

function fakePayoutServer(initialBatch, {
  onClaim,
  onArm,
  claimedToken,
  dropArmResponseOnce = false,
  dropCompleteResponseOnce = false,
} = {}) {
  let current = clone(initialBatch);
  let ownerToken = claimedToken
    || (current && current.status !== 'pending' ? CLAIM_TOKEN : null);
  let shouldDropArm = dropArmResponseOnce;
  let shouldDropComplete = dropCompleteResponseOnce;
  const calls = [];

  const publicBatch = () => clone(current);
  const fetchImpl = vi.fn(async (url, options = {}) => {
    const path = new URL(url).pathname;
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ path, method: options.method || 'GET', headers: { ...options.headers }, body });

    if (path === '/payout/next') {
      return current && current.status === 'pending'
        ? response(200, { ok: true, batch: publicBatch() })
        : response(204, null);
    }

    if (path === `/payout/batch/${BATCH_ID}/claim`) {
      if (onClaim) onClaim(clone(body));
      if (current.status === 'pending') {
        current.status = 'claimed';
        ownerToken = body.claimToken;
        return response(200, { ok: true, replayed: false, batch: publicBatch() });
      }
      if (current.status === 'claimed' && ownerToken === body.claimToken) {
        const replayed = true;
        return response(200, { ok: true, replayed, batch: publicBatch() });
      }
      return response(409, { ok: false, batch: publicBatch() });
    }

    if (path === `/payout/batch/${BATCH_ID}/arm`) {
      if (current.status !== 'claimed' || ownerToken !== body.claimToken) {
        return response(409, { ok: false, batch: publicBatch() });
      }
      const replayed = Boolean(current.broadcastAt);
      if (!replayed) current.broadcastAt = NOW.toISOString();
      if (onArm) onArm({ body: clone(body), replayed });
      if (shouldDropArm) {
        shouldDropArm = false;
        throw new Error('response lost after broadcast arm');
      }
      return response(200, { ok: true, replayed, batch: publicBatch() });
    }

    if (path === `/payout/batch/${BATCH_ID}/complete`) {
      if (current.status === 'claimed'
        && current.broadcastAt
        && ownerToken === body.claimToken) {
        current.status = 'sent';
        current.txid = body.txid;
      }
      if (shouldDropComplete) {
        shouldDropComplete = false;
        throw new Error('response lost after commit');
      }
      if (current.status === 'sent' && ownerToken === body.claimToken) {
        return response(200, {
          ok: true,
          replayed: true,
          txidMatches: current.txid === body.txid,
          batch: publicBatch(),
        });
      }
      return response(409, { ok: false, batch: publicBatch() });
    }

    if (path === `/payout/batch/${BATCH_ID}/fail`) {
      if (current.status === 'claimed'
        && !current.broadcastAt
        && ownerToken === body.claimToken) {
        current.status = 'failed';
        current.error = body.error;
      }
      if (current.status === 'failed' && ownerToken === body.claimToken) {
        return response(200, { ok: true, replayed: true, batch: publicBatch() });
      }
      return response(409, { ok: false, batch: publicBatch() });
    }

    return response(404, { ok: false, error: 'not found' });
  });

  return {
    fetchImpl,
    calls,
    state: () => publicBatch(),
    callsTo(suffix) {
      return calls.filter((call) => call.path.endsWith(suffix));
    },
  };
}

function fakeRunCli({
  balance = 100,
  chain = 'main',
  validAddresses = true,
  sendTxid = TXID,
  sinceTransactions = [],
  sinceResult,
  transaction,
  walletInfo = { hdmasterkeyid: 'wallet-fingerprint' },
  removedTransactions,
  failCommands = [],
  onSendmany,
} = {}) {
  const calls = [];
  const runCli = vi.fn(async (...args) => {
    calls.push(args);
    const command = args[0];
    if (failCommands.includes(command)) throw new Error(`${command} unavailable`);
    if (command === 'getbestblockhash') return ANCHOR;
    if (command === 'getwalletinfo') return JSON.stringify(walletInfo);
    if (command === 'getblockchaininfo') return JSON.stringify({ chain });
    if (command === 'validateaddress') return JSON.stringify({ isvalid: validAddresses });
    if (command === 'getbalance') return String(balance);
    if (command === 'sendmany') {
      if (onSendmany) onSendmany();
      return sendTxid;
    }
    if (command === 'listsinceblock') {
      const result = sinceResult ?? {
        transactions: sinceTransactions,
        lastblock: ANCHOR,
      };
      if (sinceResult === undefined && removedTransactions !== undefined) {
        result.removed = removedTransactions;
      }
      return JSON.stringify(result);
    }
    if (command === 'gettransaction') {
      return JSON.stringify(transaction || {
        txid: args[1],
        comment: `apstats-payout:${BATCH_ID}:${GOLDEN_HASH}`,
        confirmations: 0,
        details: [
          { category: 'send', address: 'Dabc', amount: -5, abandoned: false },
          { category: 'send', address: 'Ddef', amount: -7.5, abandoned: false },
        ],
        hex: 'sensitive-raw-transaction-must-not-be-journaled',
      });
    }
    throw new Error(`unexpected CLI command: ${command}`);
  });
  return { runCli, calls };
}

function clientFor(server, { agentKey = 'agent-secret', teacherKey = '' } = {}) {
  return createPayoutClient({
    rosterUrl: 'https://roster.test',
    payoutAgentKey: agentKey,
    teacherKey,
    fetchImpl: server.fetchImpl,
  });
}

function payoutJournalEntry(phase, overrides = {}) {
  const normalized = normalizePayoutPlan(GOLDEN_PLAN);
  return {
    kind: 'apstats-doge-payout',
    version: 1,
    batch_id: BATCH_ID,
    claim_token: CLAIM_TOKEN,
    phase,
    plan_hash: GOLDEN_HASH,
    plan: clone(GOLDEN_PLAN),
    complete_outputs: clone(normalized.completeOutputs),
    send_outputs: clone(normalized.sendPlan.outputs),
    total: GOLDEN_PLAN.total,
    comment: `apstats-payout:${BATCH_ID}:${GOLDEN_HASH}`,
    anchor_block_hash: ANCHOR,
    wallet_fingerprint: 'wallet-fingerprint',
    observed_at: NOW.toISOString(),
    intent_at: NOW.toISOString(),
    owner: { pid: 999, nonce: 'old-owner', started_at: NOW.toISOString() },
    ...(phase === 'broadcast' ? {
      txid: TXID,
      broadcast_armed_at: NOW.toISOString(),
    } : {}),
    ...overrides,
  };
}

function deps({ server, journal, runCli, config = CONFIG } = {}) {
  return {
    journal,
    client: clientFor(server),
    runCli,
    config,
    now,
    pid: 123,
    ownerNonce: 'test-owner',
    isProcessAlive: () => false,
  };
}

describe('DOGE payout plan canonical contract', () => {
  it('pins the server-compatible canonical bytes and SHA-256 golden vector', () => {
    expect(canonicalizePayoutPlan(GOLDEN_PLAN)).toBe(GOLDEN_CANONICAL);
    expect(hashPayoutPlan(GOLDEN_PLAN)).toBe(GOLDEN_HASH);
    expect(canonicalizePayoutPlan(GOLDEN_PLAN)).toBe(canonicalizeServerPlan(GOLDEN_PLAN));
    expect(hashPayoutPlan(GOLDEN_PLAN)).toBe(hashServerPlan(GOLDEN_PLAN));
  });

  it('normalizes student rows into exact completion rows and address-aggregated sends', () => {
    const shared = {
      minPerStudent: 5,
      rows: [
        { studentId: 's1', address: 'Dsame', doge: 5 },
        { studentId: 's2', address: 'Dsame', doge: 7.5 },
      ],
      total: 12.5,
    };
    const normalized = normalizePayoutPlan(shared);
    expect(normalized.completeOutputs).toEqual([
      { studentId: 's1', doge: 5 },
      { studentId: 's2', doge: 7.5 },
    ]);
    expect(normalized.sendPlan.outputs).toEqual({ Dsame: 12.5 });
    expect(normalized.sendPlan.total).toBe(12.5);
  });

  it('rejects non-canonical row order and totals that do not conserve', () => {
    expect(() => normalizePayoutPlan({
      ...GOLDEN_PLAN,
      rows: [...GOLDEN_PLAN.rows].reverse(),
    })).toThrow(/not canonical/);
    expect(() => normalizePayoutPlan({ ...GOLDEN_PLAN, total: 12.4 })).toThrow(/does not match/);
  });
});

describe('DOGE payout agent config and RPC wrapper', () => {
  it('lets environment override file config and keeps portable defaults', () => {
    const config = loadAgentConfig({
      argv: [],
      cwd: '/work',
      env: {
        ROSTER_URL: 'https://env.test/',
        PAYOUT_AGENT_KEY: 'env-key',
        DOGE_WALLET: 'teacher-wallet',
        POLL_SECONDS: '12',
      },
      readFile: () => JSON.stringify({
        rosterUrl: 'https://file.test',
        payoutAgentKey: 'file-key',
        feeHeadroom: 2,
      }),
    });
    expect(config).toMatchObject({
      rosterUrl: 'https://env.test',
      payoutAgentKey: 'env-key',
      dogeCli: 'dogecoin-cli',
      walletName: 'teacher-wallet',
      feeHeadroom: 2,
      pollSeconds: 12,
      batchCap: 500,
      journalPath: '/work/.doge-send-journal.json',
    });
  });

  it('reports the correct config field when pollSeconds is invalid', () => {
    expect(() => loadAgentConfig({
      argv: [],
      cwd: '/work',
      env: {
        ROSTER_URL: 'https://env.test',
        PAYOUT_AGENT_KEY: 'env-key',
        POLL_SECONDS: 'not-a-number',
      },
      readFile: () => '{}',
    })).toThrow('pollSeconds must be positive');
  });

  it('prefixes the configured wallet without assuming a Windows executable', async () => {
    const execFile = vi.fn(() => ' result\n');
    const runCli = createRunCli({ dogeCli: '/usr/local/bin/dogecoin-cli', walletName: 'pay', execFile });
    expect(await runCli('getbalance')).toBe('result');
    expect(execFile).toHaveBeenCalledWith(
      '/usr/local/bin/dogecoin-cli',
      ['-rpcwallet=pay', 'getbalance'],
      { encoding: 'utf8' },
    );
  });

  it('formats the exact insufficient-float contract', () => {
    expect(insufficientFloatMessage(9, 10)).toBe('insufficient float: have Ɖ9 need Ɖ10');
    expect(insufficientFloatMessage(9.123456789, 10.2)).toBe(
      'insufficient float: have Ɖ9.12345679 need Ɖ10.2',
    );
    expect(insufficientFloatMessage(0.00000001, 10)).toBe(
      'insufficient float: have Ɖ0.00000001 need Ɖ10',
    );
  });
});

describe('DOGE payout agent happy path and pre-broadcast failures', () => {
  it('claims, validates, journals, broadcasts exactly once, and completes all rows', async () => {
    const journal = memoryJournal();
    const events = [];
    const server = fakePayoutServer(batch(), {
      onArm: () => {
        events.push('arm');
        expect(journal.snapshot()).toMatchObject({ phase: 'intent' });
        expect(journal.snapshot().broadcast_armed_at).toBeUndefined();
      },
    });
    const cli = fakeRunCli({
      onSendmany: () => {
        events.push('sendmany');
        expect(journal.snapshot()).toMatchObject({
          phase: 'intent',
          broadcast_armed_at: NOW.toISOString(),
        });
      },
    });

    const result = await pollOnce(deps({ server, journal, runCli: cli.runCli }));

    expect(result).toEqual({ status: 'completed', batchId: BATCH_ID, txid: TXID });
    expect(server.state()).toMatchObject({ status: 'sent', txid: TXID });
    expect(journal.exists()).toBe(false);
    expect(journal.writes[0]).toMatchObject({
      exclusive: true,
      value: {
        phase: 'observed',
        batch_id: BATCH_ID,
        claim_token: expect.stringMatching(/^[0-9a-f-]{36}$/),
      },
    });
    const claimToken = journal.writes[0].value.claim_token;
    expect(events).toEqual(['arm', 'sendmany']);
    expect(server.callsTo('/claim')[0].body).toEqual({ claimToken });
    expect(server.callsTo('/arm')[0].body).toEqual({ claimToken });

    const sendCalls = cli.calls.filter(([command]) => command === 'sendmany');
    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0]).toEqual([
      'sendmany',
      '',
      JSON.stringify({ Dabc: 5, Ddef: 7.5 }),
      '1',
      `apstats-payout:${BATCH_ID}:${GOLDEN_HASH}`,
    ]);

    const complete = server.callsTo('/complete');
    expect(complete).toHaveLength(1);
    expect(complete[0].body).toEqual({
      claimToken,
      txid: TXID,
      outputs: [
        { studentId: 's1', doge: 5 },
        { studentId: 's2', doge: 7.5 },
      ],
    });
    const broadcastWrite = journal.writes.find(({ value }) => value.phase === 'broadcast');
    expect(broadcastWrite.value.send_outputs).toEqual(JSON.parse(sendCalls[0][2]));
  });

  it('durably writes observed state before calling claim', async () => {
    const journal = memoryJournal();
    const server = fakePayoutServer(batch(), {
      onClaim: ({ claimToken }) => {
        expect(journal.snapshot()).toMatchObject({
          kind: 'apstats-doge-payout',
          phase: 'observed',
          batch_id: BATCH_ID,
          claim_token: claimToken,
        });
      },
    });
    const cli = fakeRunCli();
    await processPayoutBatch(batch(), deps({ server, journal, runCli: cli.runCli }));
    expect(server.callsTo('/claim')).toHaveLength(1);
  });

  it('fails with the exact insufficient-float message and never broadcasts', async () => {
    const plan = { minPerStudent: 5, rows: [{ studentId: 's1', address: 'Dabc', doge: 5 }], total: 5 };
    const journal = memoryJournal();
    const server = fakePayoutServer(batch(plan));
    const cli = fakeRunCli({ balance: 9 });

    const result = await pollOnce(deps({ server, journal, runCli: cli.runCli }));

    expect(result).toEqual({
      status: 'failed',
      batchId: BATCH_ID,
      error: 'insufficient float: have Ɖ9 need Ɖ10',
    });
    expect(server.state()).toMatchObject({
      status: 'failed',
      error: 'insufficient float: have Ɖ9 need Ɖ10',
    });
    expect(cli.calls.filter(([command]) => command === 'sendmany')).toHaveLength(0);
    expect(journal.exists()).toBe(false);
    expect(server.callsTo('/fail')[0].body).toEqual({
      claimToken: server.callsTo('/claim')[0].body.claimToken,
      error: 'insufficient float: have Ɖ9 need Ɖ10',
    });
  });

  it('fails a plan-hash mismatch after claim and before every Core call', async () => {
    const journal = memoryJournal();
    const server = fakePayoutServer(batch(GOLDEN_PLAN, { planHash: 'f'.repeat(64) }));
    const cli = fakeRunCli();

    const result = await pollOnce(deps({ server, journal, runCli: cli.runCli }));

    expect(result.error).toBe('plan hash mismatch');
    expect(server.state()).toMatchObject({ status: 'failed', error: 'plan hash mismatch' });
    expect(cli.calls).toHaveLength(0);
  });

  it.each([
    ['wrong chain', { chain: 'test' }, 'wrong Dogecoin network'],
    ['invalid address', { validAddresses: false }, 'invalid payout address'],
  ])('fails %s without broadcasting', async (_label, cliOptions, expectedError) => {
    const journal = memoryJournal();
    const server = fakePayoutServer(batch());
    const cli = fakeRunCli(cliOptions);
    const result = await pollOnce(deps({ server, journal, runCli: cli.runCli }));
    expect(result.error).toBe(expectedError);
    expect(cli.calls.filter(([command]) => command === 'sendmany')).toHaveLength(0);
  });
});

describe('DOGE payout crash recovery — never rebroadcast', () => {
  it('re-posts complete for txid-without-complete and makes no Core call', async () => {
    const journal = memoryJournal(payoutJournalEntry('broadcast'));
    const server = fakePayoutServer(batch(GOLDEN_PLAN, {
      status: 'claimed',
      broadcastAt: NOW.toISOString(),
    }));
    const cli = fakeRunCli();

    const result = await recoverPayoutJournal(deps({ server, journal, runCli: cli.runCli }));

    expect(result.status).toBe('completed');
    expect(server.callsTo('/complete')).toHaveLength(1);
    expect(server.callsTo('/complete')[0].body).toMatchObject({ claimToken: CLAIM_TOKEN });
    expect(cli.calls).toHaveLength(0);
    expect(journal.exists()).toBe(false);
  });

  it('finds an interrupted broadcast by exact wallet comment, then completes it', async () => {
    const entry = payoutJournalEntry('intent', { broadcast_armed_at: NOW.toISOString() });
    const journal = memoryJournal(entry);
    const server = fakePayoutServer(batch(GOLDEN_PLAN, {
      status: 'claimed',
      broadcastAt: NOW.toISOString(),
    }));
    const cli = fakeRunCli({
      sinceTransactions: [
        { category: 'send', comment: entry.comment, txid: TXID },
        { category: 'send', comment: entry.comment, txid: TXID },
      ],
    });

    const result = await recoverPayoutJournal(deps({ server, journal, runCli: cli.runCli }));

    expect(result.status).toBe('completed');
    expect(cli.calls.filter(([command]) => command === 'sendmany')).toHaveLength(0);
    expect(cli.calls.map(([command]) => command)).toEqual([
      'getwalletinfo', 'listsinceblock', 'gettransaction',
    ]);
    expect(journal.exists()).toBe(false);
  });

  it('fails the batch when an exhaustive anchored lookup finds no broadcast', async () => {
    const journal = memoryJournal(payoutJournalEntry('intent'));
    const server = fakePayoutServer(batch(GOLDEN_PLAN, { status: 'claimed' }));
    const cli = fakeRunCli({ sinceTransactions: [] });

    const result = await recoverPayoutJournal(deps({ server, journal, runCli: cli.runCli }));

    expect(result).toEqual({
      status: 'failed',
      batchId: BATCH_ID,
      error: 'broadcast not found during crash recovery',
    });
    expect(server.state()).toMatchObject({
      status: 'failed',
      error: 'broadcast not found during crash recovery',
    });
    expect(server.callsTo('/fail')[0].body).toEqual({
      claimToken: CLAIM_TOKEN,
      error: 'broadcast not found during crash recovery',
    });
    expect(cli.calls.filter(([command]) => command === 'sendmany')).toHaveLength(0);
  });

  it('manual-stops an armed intent when no transaction is found', async () => {
    const journal = memoryJournal(payoutJournalEntry('intent', {
      broadcast_armed_at: NOW.toISOString(),
    }));
    const server = fakePayoutServer(batch(GOLDEN_PLAN, {
      status: 'claimed',
      broadcastAt: NOW.toISOString(),
    }));
    const cli = fakeRunCli({ sinceTransactions: [] });

    const result = await recoverPayoutJournal(deps({ server, journal, runCli: cli.runCli }));

    expect(result).toEqual({
      status: 'blocked',
      reason: 'broadcast was armed but no transaction was found; manual reconciliation required',
    });
    expect(server.callsTo('/fail')).toHaveLength(0);
    expect(server.callsTo('/complete')).toHaveLength(0);
    expect(cli.calls.filter(([command]) => command === 'sendmany')).toHaveLength(0);
    expect(journal.exists()).toBe(true);
    expect(journal.clearCount()).toBe(0);
  });

  it('manual-stops when the server arms but its response is lost', async () => {
    const journal = memoryJournal();
    const server = fakePayoutServer(batch(), { dropArmResponseOnce: true });
    const cli = fakeRunCli({ sinceTransactions: [] });

    const result = await processPayoutBatch(
      batch(),
      deps({ server, journal, runCli: cli.runCli }),
    );

    expect(result).toEqual({
      status: 'blocked',
      reason: 'server refused failure after broadcast arm; manual reconciliation required',
    });
    expect(server.state()).toMatchObject({
      status: 'claimed',
      broadcastAt: NOW.toISOString(),
    });
    expect(journal.snapshot()).toMatchObject({ phase: 'intent' });
    expect(journal.snapshot().broadcast_armed_at).toBeUndefined();
    expect(server.callsTo('/arm')).toHaveLength(1);
    expect(server.callsTo('/fail')).toHaveLength(1);
    expect(server.callsTo('/fail')[0].body).toEqual({
      claimToken: journal.snapshot().claim_token,
      error: 'broadcast not found during crash recovery',
    });
    expect(cli.calls.filter(([command]) => command === 'sendmany')).toHaveLength(0);
    expect(journal.clearCount()).toBe(0);
  });

  it.each([
    ['Core unavailable', { failCommands: ['getwalletinfo'] }, 'Dogecoin Core unavailable during recovery'],
    ['ambiguous txids', {
      sinceTransactions: [
        { category: 'send', comment: `apstats-payout:${BATCH_ID}:${GOLDEN_HASH}`, txid: TXID },
        { category: 'send', comment: `apstats-payout:${BATCH_ID}:${GOLDEN_HASH}`, txid: OTHER_TXID },
      ],
    }, 'multiple matching broadcasts'],
    ['different outputs', {
      sinceTransactions: [
        { category: 'send', comment: `apstats-payout:${BATCH_ID}:${GOLDEN_HASH}`, txid: TXID },
      ],
      transaction: {
        txid: TXID,
        comment: `apstats-payout:${BATCH_ID}:${GOLDEN_HASH}`,
        confirmations: 0,
        details: [{ category: 'send', address: 'Dabc', amount: -4, abandoned: false }],
      },
    }, 'matching transaction outputs differ'],
    ['missing wallet fingerprint', {
      walletInfo: {},
    }, 'wallet fingerprint unavailable'],
    ['malformed confirmations', {
      sinceTransactions: [
        { category: 'send', comment: `apstats-payout:${BATCH_ID}:${GOLDEN_HASH}`, txid: TXID },
      ],
      transaction: {
        txid: TXID,
        comment: `apstats-payout:${BATCH_ID}:${GOLDEN_HASH}`,
        details: [
          { category: 'send', address: 'Dabc', amount: -5, abandoned: false },
          { category: 'send', address: 'Ddef', amount: -7.5, abandoned: false },
        ],
      },
    }, 'matching transaction is unsafe'],
    ['reorg-removed transaction', {
      removedTransactions: [
        { category: 'send', comment: `apstats-payout:${BATCH_ID}:${GOLDEN_HASH}`, txid: TXID },
      ],
    }, 'matching broadcast appears in removed transactions'],
    ['malformed listsinceblock response', {
      sinceResult: {},
    }, 'invalid listsinceblock recovery response'],
    ['malformed exact-comment recovery entry', {
      sinceTransactions: [
        {
          category: 'send',
          comment: `apstats-payout:${BATCH_ID}:${GOLDEN_HASH}`,
          txid: 'truncated',
        },
      ],
    }, 'matching recovery entry is malformed'],
  ])('retains intent on %s and never fails or rebroadcasts', async (_label, cliOptions, reason) => {
    const journal = memoryJournal(payoutJournalEntry('intent'));
    const server = fakePayoutServer(batch(GOLDEN_PLAN, { status: 'claimed' }));
    const cli = fakeRunCli(cliOptions);

    const result = await recoverPayoutJournal(deps({ server, journal, runCli: cli.runCli }));

    expect(result).toEqual({ status: 'blocked', reason });
    expect(journal.exists()).toBe(true);
    expect(server.callsTo('/fail')).toHaveLength(0);
    expect(server.callsTo('/complete')).toHaveLength(0);
    expect(cli.calls.filter(([command]) => command === 'sendmany')).toHaveLength(0);
  });

  it('recovers observed-before-claim state and performs the first broadcast once', async () => {
    const observed = payoutJournalEntry('observed', {
      owner: { pid: 999, nonce: 'dead-owner', started_at: NOW.toISOString() },
    });
    const journal = memoryJournal(observed);
    const server = fakePayoutServer(batch(GOLDEN_PLAN, { status: 'pending' }));
    const cli = fakeRunCli();

    const result = await recoverPayoutJournal(deps({ server, journal, runCli: cli.runCli }));

    expect(result.status).toBe('completed');
    expect(cli.calls.filter(([command]) => command === 'sendmany')).toHaveLength(1);
  });

  it('resumes a lost claim response when the persisted claim token matches', async () => {
    const observed = payoutJournalEntry('observed', {
      owner: { pid: 999, nonce: 'dead-owner', started_at: NOW.toISOString() },
    });
    const journal = memoryJournal(observed);
    const server = fakePayoutServer(batch(GOLDEN_PLAN, { status: 'claimed' }));
    const cli = fakeRunCli();

    const result = await recoverPayoutJournal(deps({ server, journal, runCli: cli.runCli }));

    expect(result.status).toBe('completed');
    expect(server.callsTo('/claim')[0].body).toEqual({ claimToken: CLAIM_TOKEN });
    expect(cli.calls.filter(([command]) => command === 'sendmany')).toHaveLength(1);
  });

  it('clears an observed journal when same-token replay confirms an earlier failure', async () => {
    const journal = memoryJournal(payoutJournalEntry('observed'));
    const client = {
      claim: vi.fn(async () => ({
        ok: true,
        replayed: true,
        batch: { status: 'failed' },
      })),
    };
    const cli = fakeRunCli();

    const result = await recoverPayoutJournal({
      ...deps({
        server: fakePayoutServer(batch()),
        journal,
        runCli: cli.runCli,
      }),
      client,
    });

    expect(result).toEqual({ status: 'failed', batchId: BATCH_ID });
    expect(client.claim).toHaveBeenCalledWith(BATCH_ID, CLAIM_TOKEN);
    expect(cli.calls).toHaveLength(0);
    expect(journal.exists()).toBe(false);
  });

  it('discovers an exact-comment broadcast after sendmany returns a malformed txid', async () => {
    const journal = memoryJournal();
    const server = fakePayoutServer(batch());
    const cli = fakeRunCli({
      sendTxid: 'warning-not-a-txid',
      sinceTransactions: [
        {
          category: 'send',
          comment: `apstats-payout:${BATCH_ID}:${GOLDEN_HASH}`,
          txid: TXID,
        },
      ],
    });

    const result = await processPayoutBatch(
      batch(),
      deps({ server, journal, runCli: cli.runCli }),
    );

    expect(result).toEqual({ status: 'completed', batchId: BATCH_ID, txid: TXID });
    expect(cli.calls.filter(([command]) => command === 'sendmany')).toHaveLength(1);
    expect(cli.calls.filter(([command]) => command === 'listsinceblock')).toHaveLength(1);
    expect(journal.writes.some(({ value }) => (
      value.phase === 'broadcast' && value.txid === 'warning-not-a-txid'
    ))).toBe(false);
    expect(journal.exists()).toBe(false);
  });

  it('manual-stops when another agent owns the server claim token', async () => {
    const journal = memoryJournal(payoutJournalEntry('observed'));
    const server = fakePayoutServer(batch(GOLDEN_PLAN, { status: 'claimed' }), {
      claimedToken: OTHER_CLAIM_TOKEN,
    });
    const cli = fakeRunCli();

    const result = await recoverPayoutJournal(deps({ server, journal, runCli: cli.runCli }));

    expect(result).toEqual({
      status: 'blocked',
      reason: 'claim token was rejected; manual reconciliation required',
    });
    expect(cli.calls).toHaveLength(0);
    expect(journal.exists()).toBe(true);
  });

  it('uses fresh arm as the fence between simultaneous same-token recoverers', async () => {
    const firstJournal = memoryJournal(payoutJournalEntry('observed'));
    const secondJournal = memoryJournal(payoutJournalEntry('observed'));
    const server = fakePayoutServer(batch(GOLDEN_PLAN, { status: 'claimed' }));
    const firstCli = fakeRunCli();
    const secondCli = fakeRunCli();

    const [first, second] = await Promise.all([
      recoverPayoutJournal({
        ...deps({ server, journal: firstJournal, runCli: firstCli.runCli }),
        pid: 123,
        ownerNonce: 'first-owner',
      }),
      recoverPayoutJournal({
        ...deps({ server, journal: secondJournal, runCli: secondCli.runCli }),
        pid: 456,
        ownerNonce: 'second-owner',
      }),
    ]);

    expect([first.status, second.status].sort()).toEqual(['blocked', 'completed']);
    const sendCalls = [...firstCli.calls, ...secondCli.calls]
      .filter(([command]) => command === 'sendmany');
    expect(sendCalls).toHaveLength(1);
    expect(server.callsTo('/arm')).toHaveLength(2);
  });

  it('manual-stops intent recovery when the journal never recorded a wallet fingerprint', async () => {
    const journal = memoryJournal(payoutJournalEntry('intent', { wallet_fingerprint: null }));
    const server = fakePayoutServer(batch(GOLDEN_PLAN, { status: 'claimed' }));
    const cli = fakeRunCli();

    const result = await recoverPayoutJournal(deps({ server, journal, runCli: cli.runCli }));

    expect(result).toEqual({ status: 'blocked', reason: 'wallet fingerprint unavailable' });
    expect(server.callsTo('/fail')).toHaveLength(0);
    expect(server.callsTo('/complete')).toHaveLength(0);
    expect(cli.calls.filter(([command]) => command === 'sendmany')).toHaveLength(0);
  });

  it('survives a lost complete response and only re-posts complete', async () => {
    const journal = memoryJournal();
    const server = fakePayoutServer(batch(), { dropCompleteResponseOnce: true });
    const cli = fakeRunCli();

    await expect(processPayoutBatch(batch(), deps({ server, journal, runCli: cli.runCli })))
      .rejects.toMatchObject({ code: 'PAYOUT_HTTP_ERROR' });
    expect(server.state()).toMatchObject({ status: 'sent', txid: TXID });
    expect(journal.snapshot()).toMatchObject({ phase: 'broadcast', txid: TXID });

    const recovered = await recoverPayoutJournal(deps({ server, journal, runCli: cli.runCli }));
    expect(recovered.status).toBe('completed');
    expect(cli.calls.filter(([command]) => command === 'sendmany')).toHaveLength(1);
    expect(server.callsTo('/complete')).toHaveLength(2);
  });

  it('blocks on a legacy manual journal instead of overwriting or polling', async () => {
    const journal = memoryJournal({ txid: TXID, recipients: [] });
    const server = fakePayoutServer(batch());
    const cli = fakeRunCli();

    const result = await pollOnce(deps({ server, journal, runCli: cli.runCli }));

    expect(result).toEqual({ status: 'blocked', reason: 'unrecognized DOGE send journal' });
    expect(server.calls).toHaveLength(0);
    expect(cli.calls).toHaveLength(0);
    expect(journal.snapshot()).toEqual({ txid: TXID, recipients: [] });
  });

  it('manual-stops a payout journal created before claim tokens existed', async () => {
    const legacy = payoutJournalEntry('intent');
    delete legacy.claim_token;
    const journal = memoryJournal(legacy);
    const server = fakePayoutServer(batch(GOLDEN_PLAN, { status: 'claimed' }));
    const cli = fakeRunCli();

    const result = await pollOnce(deps({ server, journal, runCli: cli.runCli }));

    expect(result).toEqual({ status: 'blocked', reason: 'unrecognized DOGE send journal' });
    expect(server.calls).toHaveLength(0);
    expect(cli.calls).toHaveLength(0);
    expect(journal.exists()).toBe(true);
  });

  it('does not take over a journal owned by a live agent process', async () => {
    const journal = memoryJournal(payoutJournalEntry('intent'));
    const server = fakePayoutServer(batch(GOLDEN_PLAN, { status: 'claimed' }));
    const cli = fakeRunCli();
    const result = await recoverPayoutJournal({
      ...deps({ server, journal, runCli: cli.runCli }),
      isProcessAlive: () => true,
    });
    expect(result).toEqual({ status: 'blocked', reason: 'another payout agent owns the journal' });
    expect(cli.calls).toHaveLength(0);
  });

  it('findBroadcastForIntent never journals or exposes Core raw hex', async () => {
    const entry = payoutJournalEntry('intent');
    const cli = fakeRunCli({
      sinceTransactions: [{ category: 'send', comment: entry.comment, txid: TXID }],
    });
    await expect(findBroadcastForIntent(entry, { runCli: cli.runCli }))
      .resolves.toEqual({ status: 'found', txid: TXID });
    expect(JSON.stringify(entry)).not.toContain('sensitive-raw-transaction');
  });
});

describe('DOGE payout HTTP auth, P8, and service deployment contract', () => {
  it('uses the dedicated agent header and falls back to teacher auth only when needed', async () => {
    const agentServer = fakePayoutServer(null);
    await clientFor(agentServer).next();
    expect(agentServer.calls[0].headers).toEqual({ 'x-payout-agent-key': 'agent-secret' });

    const teacherServer = fakePayoutServer(null);
    await clientFor(teacherServer, { agentKey: '', teacherKey: 'teacher-secret' }).next();
    expect(teacherServer.calls[0].headers).toEqual({ 'x-teacher-secret': 'teacher-secret' });
  });

  it('contains no key export/signing/raw-broadcast path and delegates sendmany to core', () => {
    const source = readFileSync(resolve('tools/doge-payout-agent.mjs'), 'utf8');
    expect(source).not.toMatch(/dumpprivkey|importprivkey|signrawtransaction|sendrawtransaction|walletpassphrase/i);
    expect(source).not.toMatch(/runCli\(\s*['"]sendmany/);
    expect(source).toContain("from './lib/doge-send-core.mjs'");
    expect(source).toContain('executeSendPlan');
  });

  it('never includes the stable claim token in agent logs', async () => {
    const journal = memoryJournal();
    const server = fakePayoutServer(batch());
    const cli = fakeRunCli();
    const logger = { log: vi.fn(), error: vi.fn() };

    await runAgent({
      config: CONFIG,
      journal,
      client: clientFor(server),
      runCli: cli.runCli,
      logger,
    });

    const claimToken = journal.writes[0].value.claim_token;
    expect(claimToken).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(JSON.stringify({
      logs: logger.log.mock.calls,
      errors: logger.error.mock.calls,
    })).not.toContain(claimToken);
  });

  it('ships a hardened user service with install notes and no embedded secret', () => {
    const unit = readFileSync(resolve('tools/doge-payout-agent.service'), 'utf8');
    expect(unit).toContain('[Service]');
    expect(unit).toContain('Type=simple');
    expect(unit).toContain('Restart=on-failure');
    expect(unit).toContain('KillMode=mixed');
    expect(unit).toContain('UMask=0077');
    expect(unit).toContain('NoNewPrivileges=true');
    expect(unit).toContain('--config %h/.config/apstats/.payout-agent.json');
    expect(unit).toContain('WantedBy=default.target');
    expect(unit).toContain('systemctl --user enable --now');
    expect(unit).not.toMatch(/^Environment=.*PAYOUT_AGENT_KEY/m);
    expect(unit).not.toMatch(/ExecStart=.*PAYOUT_AGENT_KEY/);
  });
});
