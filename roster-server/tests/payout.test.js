// payout.test.js -- frozen-plan contract, auth/state matrix, and P1-P8 guards.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPayoutPlan,
  canonicalizePayoutPlan,
  createPayoutDb,
  hashClaimToken,
  hashPayoutPlan,
  isPayoutMissing,
  mountPayout,
  sanitizePayoutFailure,
} from '../payout.js';
import { requireTeacher } from '../teacher-auth.js';
import { signToken } from '../token.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAYOUT_SOURCE = resolve(__dirname, '..', 'payout.js');
const MIGRATION_SOURCE = resolve(__dirname, '..', 'migrations', '0032_payout_batch.sql');

const SID_A = '00000000-0000-4000-8000-000000000001';
const SID_B = '00000000-0000-4000-8000-000000000002';
const SID_C = '00000000-0000-4000-8000-000000000003';
const SID_TEACHER = '00000000-0000-4000-8000-000000000004';
const CLAIM_A = '30000000-0000-4000-8000-000000000001';
const CLAIM_B = '30000000-0000-4000-8000-000000000002';
const TXID_A = 'a'.repeat(64);
const TXID_B = 'b'.repeat(64);

function account(studentId, address, balance, sent = 0) {
  return {
    student_id: studentId,
    doge_address: address,
    doge_balance: balance,
    doge_sent: sent,
  };
}

function createWorld() {
  const accounts = new Map([
    [SID_A, account(SID_A, 'DAddressA', 10, 2.5)],
    [SID_B, account(SID_B, 'DAddressB', 7.5, 0)],
    [SID_C, account(SID_C, 'DAddressC', 4.99999999, 0)],
  ]);
  const roster = [SID_A, SID_B, SID_C].map((studentId) => ({ student_id: studentId }));
  const batches = [];
  const ledger = [];
  const events = [];
  let sequence = 0;

  const world = {
    accounts,
    batches,
    ledger,
    events,
    probeError: null,
    createErrorOnce: null,
    completeErrorOnce: null,
    recordCalls: 0,
    completeCalls: 0,
    teacherStatus: 'active',
    issueReceipt: vi.fn(() => {
      events.push('receipt');
      return null;
    }),
  };

  world.db = {
    async listRoster() {
      return { data: roster.map((row) => ({ ...row })), error: null };
    },
    async listDogeAccounts(studentIds) {
      const wanted = new Set(studentIds || accounts.keys());
      return {
        data: [...accounts.values()].filter((row) => wanted.has(row.student_id)),
        error: null,
      };
    },
    async getRoleByStudentId(studentId) {
      return studentId === SID_TEACHER ? 'teacher' : 'student';
    },
    async findByStudentId(studentId) {
      if (studentId !== SID_TEACHER) {
        return { data: null, error: null };
      }
      return {
        data: {
          student_id: SID_TEACHER,
          role: 'teacher',
          status: world.teacherStatus,
        },
        error: null,
      };
    },
  };

  const findBatch = (batchId) => batches.find((row) => row.batch_id === batchId) || null;
  const result = (data, error = null) => ({ data, error });
  const transition = (batchId, from, predicate, patch) => {
    const row = findBatch(batchId);
    if (!row || row.status !== from || !predicate(row)) return result(null);
    Object.assign(row, patch);
    return result({ ...row });
  };

  world.payoutDb = {
    async probe() {
      return result(true, world.probeError);
    },
    async createBatch({ plan, planHash }) {
      if (world.createErrorOnce) {
        const error = world.createErrorOnce;
        world.createErrorOnce = null;
        return result(null, error);
      }
      if (batches.some((batch) => ['pending', 'claimed'].includes(batch.status))) {
        return result(null, { code: '23505', message: 'payout_batch_one_active' });
      }

      sequence += 1;
      const row = {
        batch_id: `10000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
        status: 'pending',
        plan: structuredClone(plan),
        plan_hash: planHash,
        txid: null,
        error: null,
        created_at: `2026-09-01T00:00:0${sequence}.000Z`,
        claimed_at: null,
        resolved_at: null,
        claim_token_hash: null,
        broadcast_at: null,
      };
      batches.push(row);
      return result({ ...row });
    },
    async getBatch(batchId) {
      const row = findBatch(batchId);
      return result(row && { ...row });
    },
    async getActiveBatch() {
      const row = batches.find((batch) => ['pending', 'claimed'].includes(batch.status));
      return result(row && { ...row });
    },
    async getNextBatch() {
      const row = batches.find((batch) => batch.status === 'pending');
      return result(row && { ...row });
    },
    async getLatestBatch() {
      const row = batches[batches.length - 1] || null;
      return result(row && { ...row });
    },
    async cancelBatch(batchId, resolvedAt) {
      return transition(batchId, 'pending', () => true, {
        status: 'cancelled',
        resolved_at: resolvedAt,
      });
    },
    async claimBatch(batchId, claimTokenHash, claimedAt) {
      return transition(batchId, 'pending', (row) => row.claim_token_hash === null, {
        status: 'claimed',
        claim_token_hash: claimTokenHash,
        claimed_at: claimedAt,
      });
    },
    async armBatch(batchId, claimTokenHash) {
      const row = findBatch(batchId);
      if (!row || row.status !== 'claimed'
          || row.claim_token_hash !== claimTokenHash) {
        return result(null, { code: 'P0001', message: 'payout batch cannot be armed' });
      }
      const replayed = row.broadcast_at !== null;
      if (!replayed) row.broadcast_at = '2026-09-01T00:00:30.000Z';
      return result({ batch: { ...row }, replayed });
    },
    async recordBroadcast({ batchId, claimTokenHash, txid }) {
      world.recordCalls += 1;
      events.push('record');
      const row = findBatch(batchId);
      if (!row || row.status !== 'claimed' || !row.broadcast_at
          || row.claim_token_hash !== claimTokenHash
          || (row.txid && row.txid !== txid)) {
        return result(null, { code: 'P0001', message: 'payout broadcast conflict' });
      }
      row.txid ||= txid;
      return result([{ ...row }]);
    },
    async failBatch(batchId, claimTokenHash, error, resolvedAt) {
      return transition(
        batchId,
        'claimed',
        (row) => row.claim_token_hash === claimTokenHash
          && row.broadcast_at === null
          && row.txid === null,
        { status: 'failed', error, resolved_at: resolvedAt },
      );
    },
    async completeBatch({ batchId, claimTokenHash, txid, outputs, receipts }) {
      world.completeCalls += 1;
      events.push('complete');
      const row = findBatch(batchId);
      if (!row || row.status !== 'claimed' || !row.broadcast_at
          || row.claim_token_hash !== claimTokenHash || row.txid !== txid) {
        return result(null, { code: 'P0001', message: 'payout batch is not ready' });
      }
      if (world.completeErrorOnce) {
        const error = world.completeErrorOnce;
        world.completeErrorOnce = null;
        return result(null, error);
      }

      for (const output of outputs) {
        const current = accounts.get(output.studentId);
        if (!current || current.doge_balance - current.doge_sent < output.doge) {
          return result(null, { code: 'P0001', message: 'payout wallet amount unavailable' });
        }
      }
      for (const output of outputs) {
        const current = accounts.get(output.studentId);
        current.doge_sent += output.doge;
        ledger.push({
          student_id: output.studentId,
          kind: 'send',
          doge_delta: -output.doge,
          receipt: receipts.find((receipt) => receipt.studentId === output.studentId) || null,
        });
      }

      Object.assign(row, {
        status: 'sent',
        error: null,
        resolved_at: '2026-09-01T00:01:00.000Z',
      });
      return result([{ ...row }]);
    },
  };

  return world;
}

async function listen(world) {
  const app = express();
  app.use(express.json());
  mountPayout(app, {
    db: world.db,
    payoutDb: world.payoutDb,
    now: () => new Date('2026-09-01T00:00:30.000Z'),
    issueReceipt: world.issueReceipt,
  });
  const server = http.createServer(app);
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  return server;
}

async function request(server, method, path, { auth, body, headers = {} } = {}) {
  const requestHeaders = { ...headers };
  if (auth === 'teacher' && typeof process.env.TEACHER_KEY === 'string') {
    requestHeaders['x-teacher-secret'] = process.env.TEACHER_KEY;
  }
  if (auth === 'agent' && typeof process.env.PAYOUT_AGENT_KEY === 'string') {
    requestHeaders['x-payout-agent-key'] = process.env.PAYOUT_AGENT_KEY;
  }
  if (auth === 'student') requestHeaders.authorization = `Bearer ${signToken(SID_A)}`;
  if (auth === 'teacher-token') requestHeaders.authorization = `Bearer ${signToken(SID_TEACHER)}`;
  if (body !== undefined) requestHeaders['content-type'] = 'application/json';

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = response.status === 204 ? null : await response.json();
  return { status: response.status, body: json, headers: response.headers };
}

async function preview(server) {
  const response = await request(server, 'POST', '/payout/plan', { auth: 'teacher', body: {} });
  expect(response.status).toBe(200);
  return response.body;
}

async function seal(server) {
  const plan = await preview(server);
  const response = await request(server, 'POST', '/payout/batch', {
    auth: 'teacher',
    body: { planHash: plan.planHash },
  });
  expect(response.status).toBe(201);
  return response.body.batch;
}

let world;
let server;

beforeEach(async () => {
  process.env.TEACHER_KEY = 'teacher-test';
  process.env.PAYOUT_AGENT_KEY = 'agent-test';
  process.env.ROSTER_TOKEN_SECRET = 'payout-token-test-secret';
  delete process.env.ROSTER_TEACHER_SECRET;
  delete process.env.PAYOUT_BATCH_CAP;
  world = createWorld();
  server = await listen(world);
});

afterEach(async () => {
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
  server = null;
  delete process.env.TEACHER_KEY;
  delete process.env.PAYOUT_AGENT_KEY;
  delete process.env.ROSTER_TEACHER_SECRET;
  delete process.env.ROSTER_TOKEN_SECRET;
  delete process.env.PAYOUT_BATCH_CAP;
});

describe('payout plan canonicalization', () => {
  it('pins recursive canonical JSON, SHA-256, and conservative koinu math', async () => {
    const goldenPlan = {
      total: 12.5,
      rows: [
        { doge: 5, studentId: 's1', address: 'Dabc' },
        { address: 'Ddef', doge: 7.5, studentId: 's2' },
      ],
      minPerStudent: 5,
    };
    expect(canonicalizePayoutPlan(goldenPlan)).toBe(
      '{"minPerStudent":5,"rows":[{"address":"Dabc","doge":5,"studentId":"s1"},{"address":"Ddef","doge":7.5,"studentId":"s2"}],"total":12.5}',
    );
    expect(hashPayoutPlan(goldenPlan))
      .toBe('c2a858577a42410bb1425893c89cc1198328038afcefe61349459fb623694d90');
    expect(hashClaimToken(CLAIM_A)).toMatch(/^[0-9a-f]{64}$/);
    expect(() => canonicalizePayoutPlan({ bad: undefined })).toThrow(/undefined/);
    expect(() => canonicalizePayoutPlan({ bad: Infinity })).toThrow(/non-finite/);

    const rows = [
      account(SID_B, 'D-B', 9.000000004, 1.5),
      account(SID_C, '', 100, 0),
      account(SID_A, 'D-A', '7.500000006', 0),
      account(SID_TEACHER, 'D-dust', '4.999999999', 0),
    ];
    expect(buildPayoutPlan(rows)).toEqual({
      minPerStudent: 5,
      rows: [
        { studentId: SID_A, address: 'D-A', doge: 7.5 },
        { studentId: SID_B, address: 'D-B', doge: 7.5 },
      ],
      total: 15,
    });
    expect(buildPayoutPlan([...rows].reverse())).toEqual(buildPayoutPlan(rows));

    process.env.PAYOUT_BATCH_CAP = '14.99999999';
    const routed = await preview(server);
    expect(routed.total).toBe(15);
    expect(routed.overCap).toBe(true);
  });
});

describe('payout provisioning and authorization', () => {
  it('gates all nine routes on the final payout_probe sentinel', async () => {
    world.probeError = { code: '42883', message: 'function payout_probe does not exist' };
    const batchId = '10000000-0000-4000-8000-000000000001';
    const routes = [
      ['POST', '/payout/plan', 'teacher', {}],
      ['POST', '/payout/batch', 'teacher', { planHash: '0'.repeat(64) }],
      ['POST', `/payout/batch/${batchId}/cancel`, 'teacher', {}],
      ['GET', '/payout/next', 'agent', undefined],
      ['POST', `/payout/batch/${batchId}/claim`, 'agent', { claimToken: CLAIM_A }],
      ['POST', `/payout/batch/${batchId}/arm`, 'agent', { claimToken: CLAIM_A }],
      ['POST', `/payout/batch/${batchId}/complete`, 'agent', {
        claimToken: CLAIM_A, txid: TXID_A, outputs: [],
      }],
      ['POST', `/payout/batch/${batchId}/fail`, 'agent', {
        claimToken: CLAIM_A, error: 'payout agent failed',
      }],
      ['GET', '/payout/status', 'teacher', undefined],
    ];

    for (const [method, path, auth, body] of routes) {
      const response = await request(server, method, path, { auth, body });
      expect(response.status, `${method} ${path}`).toBe(503);
      expect(response.body.error).toMatch(/migration 0032/);
    }
  });

  it('requires TEACHER_KEY before accepting any payout credential', async () => {
    expect((await request(server, 'POST', '/payout/plan', { body: {} })).status).toBe(401);
    expect((await request(server, 'POST', '/payout/plan', { auth: 'student', body: {} })).status).toBe(401);
    expect((await request(server, 'POST', '/payout/plan', { auth: 'agent', body: {} })).status).toBe(401);
    expect((await request(server, 'POST', '/payout/plan', { auth: 'teacher', body: {} })).status).toBe(200);
    expect((await request(server, 'POST', '/payout/plan', { auth: 'teacher-token', body: {} })).status).toBe(200);
    expect((await request(server, 'GET', '/payout/next', { auth: 'agent' })).status).toBe(204);
    expect((await request(server, 'GET', '/payout/next', { auth: 'teacher' })).status).toBe(204);
    expect((await request(server, 'GET', '/payout/next', { auth: 'student' })).status).toBe(401);
    expect((await request(server, 'GET', '/payout/status', { auth: 'agent' })).status).toBe(401);

    delete process.env.TEACHER_KEY;
    delete process.env.ROSTER_TEACHER_SECRET;
    expect((await request(server, 'POST', '/payout/plan', {
      body: {}, headers: { 'x-teacher-secret': 'apteacher2627' },
    })).status).toBe(401);
    expect((await request(server, 'POST', '/payout/plan', {
      auth: 'teacher-token', body: {},
    })).status).toBe(401);
    expect((await request(server, 'GET', '/payout/next', {
      auth: 'agent',
    })).status).toBe(401);

    process.env.TEACHER_KEY = '  apteacher2627  ';
    expect((await request(server, 'POST', '/payout/plan', {
      auth: 'teacher-token', body: {},
    })).status).toBe(401);
    expect((await request(server, 'GET', '/payout/next', {
      auth: 'agent',
    })).status).toBe(401);
    delete process.env.TEACHER_KEY;

    process.env.ROSTER_TEACHER_SECRET = '  explicit-legacy  ';
    expect((await request(server, 'POST', '/payout/plan', {
      body: {}, headers: { 'x-teacher-secret': 'explicit-legacy' },
    })).status).toBe(401);

    process.env.TEACHER_KEY = 'explicit-teacher';
    expect((await request(server, 'POST', '/payout/plan', {
      body: {}, headers: { 'x-teacher-secret': 'explicit-legacy' },
    })).status).toBe(401);
    process.env.ROSTER_TEACHER_SECRET = 'apteacher2627';
    expect((await request(server, 'POST', '/payout/plan', {
      body: {}, headers: { 'x-teacher-secret': 'apteacher2627' },
    })).status).toBe(401);
    expect((await request(server, 'POST', '/payout/plan', {
      body: {}, headers: { 'x-teacher-secret': 'explicit-teacher' },
    })).status).toBe(200);
    expect((await request(server, 'POST', '/payout/plan', {
      auth: 'teacher-token', body: {},
    })).status).toBe(200);
    expect(await requireTeacher({
      headers: { 'x-teacher-secret': 'apteacher2627' }, query: {},
    }, world.db)).toBe(false);

    process.env.PAYOUT_AGENT_KEY = '  trimmed-agent  ';
    expect((await request(server, 'GET', '/payout/next', {
      headers: { 'x-payout-agent-key': 'trimmed-agent' },
    })).status).toBe(204);
  });

  it('rejects a valid Bearer token after its teacher roster row is archived', async () => {
    expect((await request(server, 'POST', '/payout/plan', {
      auth: 'teacher-token', body: {},
    })).status).toBe(200);

    world.teacherStatus = 'archived';

    expect((await request(server, 'POST', '/payout/plan', {
      auth: 'teacher-token', body: {},
    })).status).toBe(401);
  });

  it('sets Cache-Control no-store even on an empty 204 queue', async () => {
    const response = await request(server, 'GET', '/payout/next', { auth: 'agent' });
    expect(response.status).toBe(204);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

describe('payout batch reservation and fenced state machine', () => {
  it('rejects stale preview/cap/raced create and never silently queues twice', async () => {
    const first = await preview(server);
    world.accounts.get(SID_A).doge_balance += 1;
    const stale = await request(server, 'POST', '/payout/batch', {
      auth: 'teacher', body: { planHash: first.planHash },
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe('plan changed');

    process.env.PAYOUT_BATCH_CAP = '10';
    const cappedPlan = await preview(server);
    expect((await request(server, 'POST', '/payout/batch', {
      auth: 'teacher', body: { planHash: cappedPlan.planHash },
    })).body.error).toMatch(/batch cap/);

    delete process.env.PAYOUT_BATCH_CAP;
    const fresh = await preview(server);
    world.createErrorOnce = { code: '23514', message: 'payout reservation is stale' };
    const raced = await request(server, 'POST', '/payout/batch', {
      auth: 'teacher', body: { planHash: fresh.planHash },
    });
    expect(raced.status).toBe(409);
    expect(raced.body.error).toMatch(/fresh payout plan/);
    expect(raced.body.planHash).toBe(hashPayoutPlan(raced.body.plan));

    const batch = await seal(server);
    const duplicate = await request(server, 'POST', '/payout/batch', {
      auth: 'teacher', body: { planHash: batch.planHash },
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.batch.batchId).toBe(batch.batchId);
    expect(world.batches).toHaveLength(1);
  });

  it('fences claim ownership and never exposes a token or digest', async () => {
    const batch = await seal(server);
    expect((await request(server, 'POST', `/payout/batch/${batch.batchId}/claim`, {
      auth: 'agent', body: {},
    })).status).toBe(400);

    const claimed = await request(server, 'POST', `/payout/batch/${batch.batchId}/claim`, {
      auth: 'agent', body: { claimToken: CLAIM_A },
    });
    expect(claimed.status).toBe(200);
    expect(claimed.body.replayed).toBe(false);
    expect(claimed.body.batch.status).toBe('claimed');
    expect(claimed.body.batch).not.toHaveProperty('claimToken');
    expect(claimed.body.batch).not.toHaveProperty('claimTokenHash');
    expect(claimed.body.batch).not.toHaveProperty('claim_token_hash');

    const replay = await request(server, 'POST', `/payout/batch/${batch.batchId}/claim`, {
      auth: 'agent', body: { claimToken: CLAIM_A },
    });
    expect(replay.status).toBe(200);
    expect(replay.body.replayed).toBe(true);
    expect((await request(server, 'POST', `/payout/batch/${batch.batchId}/claim`, {
      auth: 'agent', body: { claimToken: CLAIM_B },
    })).status).toBe(409);
  });

  it('allows failure only for the matching unarmed owner and releases the active slot', async () => {
    const batch = await seal(server);
    await request(server, 'POST', `/payout/batch/${batch.batchId}/claim`, {
      auth: 'agent', body: { claimToken: CLAIM_A },
    });
    expect((await request(server, 'POST', `/payout/batch/${batch.batchId}/fail`, {
      auth: 'agent', body: { claimToken: CLAIM_B, error: 'payout agent failed' },
    })).status).toBe(409);

    const failed = await request(server, 'POST', `/payout/batch/${batch.batchId}/fail`, {
      auth: 'agent',
      body: { claimToken: CLAIM_A, error: 'secret WIF-like material must not persist' },
    });
    expect(failed.status).toBe(200);
    expect(failed.body.batch.status).toBe('failed');
    expect(failed.body.batch.error).toBe('payout agent failed');
    const replay = await request(server, 'POST', `/payout/batch/${batch.batchId}/fail`, {
      auth: 'agent', body: { claimToken: CLAIM_A, error: 'wrong Dogecoin network' },
    });
    expect(replay.status).toBe(200);
    expect(replay.body.replayed).toBe(true);
    expect((await seal(server)).status).toBe('pending');
  });

  it('atomically distinguishes the only fresh arm from same-token replay', async () => {
    const batch = await seal(server);
    await request(server, 'POST', `/payout/batch/${batch.batchId}/claim`, {
      auth: 'agent', body: { claimToken: CLAIM_A },
    });

    const fresh = await request(server, 'POST', `/payout/batch/${batch.batchId}/arm`, {
      auth: 'agent', body: { claimToken: CLAIM_A },
    });
    expect(fresh.status).toBe(200);
    expect(fresh.body.replayed).toBe(false);
    expect(fresh.body.batch.broadcastAt).toBe('2026-09-01T00:00:30.000Z');
    const replay = await request(server, 'POST', `/payout/batch/${batch.batchId}/arm`, {
      auth: 'agent', body: { claimToken: CLAIM_A },
    });
    expect(replay.status).toBe(200);
    expect(replay.body.replayed).toBe(true);
    expect(replay.body.batch.broadcastAt).toBe(fresh.body.batch.broadcastAt);
    expect((await request(server, 'POST', `/payout/batch/${batch.batchId}/arm`, {
      auth: 'agent', body: { claimToken: CLAIM_B },
    })).status).toBe(409);
    expect((await request(server, 'POST', `/payout/batch/${batch.batchId}/fail`, {
      auth: 'agent', body: { claimToken: CLAIM_A, error: 'payout agent failed' },
    })).status).toBe(409);
  });
});

describe('payout completion', () => {
  it('rejects non-exact outputs before recording a broadcast or issuing receipts', async () => {
    const batch = await seal(server);
    await request(server, 'POST', `/payout/batch/${batch.batchId}/claim`, {
      auth: 'agent', body: { claimToken: CLAIM_A },
    });
    await request(server, 'POST', `/payout/batch/${batch.batchId}/arm`, {
      auth: 'agent', body: { claimToken: CLAIM_A },
    });
    const [first, second] = batch.plan.rows.map(({ studentId, doge }) => ({ studentId, doge }));
    const cases = [
      [],
      [first],
      [first, second, { studentId: SID_C, doge: 5 }],
      [first, first],
      [first, { ...second, doge: second.doge + 0.00000001 }],
      [{ ...first, privateKey: 'reject' }, second],
    ];
    for (const outputs of cases) {
      const response = await request(server, 'POST', `/payout/batch/${batch.batchId}/complete`, {
        auth: 'agent', body: { claimToken: CLAIM_A, txid: TXID_A, outputs },
      });
      expect(response.status).toBe(400);
    }
    expect(world.recordCalls).toBe(0);
    expect(world.completeCalls).toBe(0);
    expect(world.issueReceipt).not.toHaveBeenCalled();
  });

  it('records txid first, marks each exact output once, and converges on terminal replay', async () => {
    world.issueReceipt.mockImplementation(({ studentId }) => {
      world.events.push('receipt');
      return studentId === SID_A
        ? { receiptId: 'receipt-a', compact: 'compact-a' }
        : null;
    });
    const batch = await seal(server);
    await request(server, 'POST', `/payout/batch/${batch.batchId}/claim`, {
      auth: 'agent', body: { claimToken: CLAIM_A },
    });
    await request(server, 'POST', `/payout/batch/${batch.batchId}/arm`, {
      auth: 'agent', body: { claimToken: CLAIM_A },
    });
    const outputs = batch.plan.rows
      .map(({ studentId, doge }) => ({ studentId, doge }))
      .reverse();

    const completed = await request(server, 'POST', `/payout/batch/${batch.batchId}/complete`, {
      auth: 'agent', body: { claimToken: CLAIM_A, txid: TXID_A.toUpperCase(), outputs },
    });
    expect(completed.status).toBe(200);
    expect(completed.body.batch.status).toBe('sent');
    expect(completed.body.batch.txid).toBe(TXID_A);
    expect(world.events[0]).toBe('record');
    expect(world.events.at(-1)).toBe('complete');
    expect(world.ledger).toHaveLength(batch.plan.rows.length);
    expect(world.issueReceipt).toHaveBeenCalledTimes(batch.plan.rows.length);
    expect(world.ledger.find((row) => row.student_id === SID_A).receipt).toEqual({
      studentId: SID_A,
      receiptId: 'receipt-a',
      receiptCompact: 'compact-a',
    });
    expect(world.ledger.reduce((sum, row) => sum - row.doge_delta, 0)).toBe(batch.plan.total);

    const same = await request(server, 'POST', `/payout/batch/${batch.batchId}/complete`, {
      auth: 'agent', body: { claimToken: CLAIM_A, txid: TXID_A, outputs: [] },
    });
    expect(same.body).toMatchObject({ ok: true, replayed: true, txidMatches: true });
    const different = await request(server, 'POST', `/payout/batch/${batch.batchId}/complete`, {
      auth: 'agent', body: { claimToken: CLAIM_A, txid: TXID_B, outputs: [] },
    });
    expect(different.body).toMatchObject({ ok: true, replayed: true, txidMatches: false });
    expect(different.body.batch.txid).toBe(TXID_A);
    expect(world.completeCalls).toBe(1);
    expect(world.ledger).toHaveLength(2);
    expect((await request(server, 'POST', `/payout/batch/${batch.batchId}/complete`, {
      auth: 'agent', body: { claimToken: CLAIM_B, txid: TXID_A, outputs: [] },
    })).status).toBe(409);
  });

  it('keeps a recorded txid visible when completion conflicts and rejects replacement', async () => {
    const batch = await seal(server);
    await request(server, 'POST', `/payout/batch/${batch.batchId}/claim`, {
      auth: 'agent', body: { claimToken: CLAIM_A },
    });
    await request(server, 'POST', `/payout/batch/${batch.batchId}/arm`, {
      auth: 'agent', body: { claimToken: CLAIM_A },
    });
    world.completeErrorOnce = { code: 'P0001', message: 'payout forced rollback' };
    const outputs = batch.plan.rows.map(({ studentId, doge }) => ({ studentId, doge }));
    const failed = await request(server, 'POST', `/payout/batch/${batch.batchId}/complete`, {
      auth: 'agent', body: { claimToken: CLAIM_A, txid: TXID_A, outputs },
    });
    expect(failed.status).toBe(409);
    expect(failed.body.batch).toMatchObject({ status: 'claimed', txid: TXID_A });
    const rearm = await request(server, 'POST', `/payout/batch/${batch.batchId}/arm`, {
      auth: 'agent', body: { claimToken: CLAIM_A },
    });
    expect(rearm.status).toBe(200);
    expect(rearm.body.replayed).toBe(true);
    expect(rearm.body.batch).toMatchObject({ txid: TXID_A, broadcastAt: expect.any(String) });
    const replacement = await request(server, 'POST', `/payout/batch/${batch.batchId}/complete`, {
      auth: 'agent', body: { claimToken: CLAIM_A, txid: TXID_B, outputs },
    });
    expect(replacement.status).toBe(409);
    expect(replacement.body.batch.txid).toBe(TXID_A);
  });

  it('skips malformed optional receipts instead of blocking reconciliation', async () => {
    world.issueReceipt.mockImplementation(({ studentId }) => (
      studentId === SID_A
        ? { receiptId: '', compact: 'compact' }
        : { receiptId: 'receipt-b', compact: 'x'.repeat(8193) }
    ));
    const batch = await seal(server);
    await request(server, 'POST', `/payout/batch/${batch.batchId}/claim`, {
      auth: 'agent', body: { claimToken: CLAIM_A },
    });
    await request(server, 'POST', `/payout/batch/${batch.batchId}/arm`, {
      auth: 'agent', body: { claimToken: CLAIM_A },
    });
    const outputs = batch.plan.rows.map(({ studentId, doge }) => ({ studentId, doge }));
    const response = await request(server, 'POST', `/payout/batch/${batch.batchId}/complete`, {
      auth: 'agent', body: { claimToken: CLAIM_A, txid: TXID_A, outputs },
    });
    expect(response.status).toBe(200);
    expect(world.ledger.every((row) => row.receipt === null)).toBe(true);
  });
});

describe('payout adapter and database boundary', () => {
  it('maps production writes to fenced RPCs and performs no direct wallet write', async () => {
    const rpc = vi.fn(() => ({ data: [], error: null }));
    const adapter = createPayoutDb({ rpc });
    await adapter.probe();
    await adapter.createBatch({ plan: { rows: [] }, planHash: 'c'.repeat(64) });
    await adapter.armBatch('10000000-0000-4000-8000-000000000001', 'd'.repeat(64));
    await adapter.recordBroadcast({
      batchId: '10000000-0000-4000-8000-000000000001',
      claimTokenHash: 'd'.repeat(64),
      txid: TXID_A,
    });
    await adapter.completeBatch({
      batchId: '10000000-0000-4000-8000-000000000001',
      claimTokenHash: 'd'.repeat(64),
      txid: TXID_A,
      outputs: [],
      receipts: [],
    });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'payout_probe',
      'payout_create',
      'payout_arm',
      'payout_record_broadcast',
      'payout_complete',
    ]);
    expect(rpc.mock.calls.at(-1)[1]).toMatchObject({
      p_claim_token_hash: 'd'.repeat(64),
      p_txid: TXID_A,
    });

    const source = await readFile(PAYOUT_SOURCE, 'utf8');
    expect(source).not.toContain("from('doge_account')");
    expect(source).not.toMatch(/\.from\(['"]doge_ledger['"]\)/);
    expect(source).not.toMatch(/\.dogeMark\s*\(/);
    const migration = await readFile(MIGRATION_SOURCE, 'utf8');
    expect(migration).toMatch(/from doge_mark\s*\(/i);
    expect(migration.indexOf("set status = 'sent'")).toBeLessThan(migration.indexOf('from doge_mark'));
    expect(migration).toMatch(/\bbegin;[\s\S]*\$payout_probe\$;\s*commit;\s*$/i);
    expect(migration).toMatch(/create or replace function payout_probe\(\)[\s\S]*revoke all on function payout_probe\(\) from public/i);
  });

  it('recognizes partial migration misses and bounds every persisted failure', () => {
    for (const code of ['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205']) {
      expect(isPayoutMissing({ code })).toBe(true);
    }
    expect(isPayoutMissing({ code: 'XX000', message: 'payout_probe does not exist' })).toBe(true);
    expect(isPayoutMissing({ code: 'XX000', message: 'connection reset' })).toBe(false);
    expect(sanitizePayoutFailure('insufficient float: have Ɖ4.25 need Ɖ15.00000001'))
      .toBe('insufficient float: have Ɖ4.25 need Ɖ15.00000001');
    expect(sanitizePayoutFailure('wrong Dogecoin network')).toBe('wrong Dogecoin network');
    expect(sanitizePayoutFailure('private key = very-secret')).toBe('payout agent failed');
    expect(sanitizePayoutFailure('x'.repeat(10_000))).toBe('payout agent failed');
  });
});
