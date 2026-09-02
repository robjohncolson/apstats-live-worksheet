// Student wallet onboarding proposal routes.
//
// These tests deliberately model the database's compare-and-swap boundary in
// memory. Route code may choose the response, but only the DB adapter may promote
// the currently reviewed proposal or reject it while an active payout owns the
// wallet row.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import { mountDogeWallet } from '../doge-wallet.js';
import { buildPayoutPlan } from '../payout.js';

const SID = '00000000-0000-4000-8000-000000000001';
const OTHER_SID = '00000000-0000-4000-8000-000000000002';
const ARCHIVED_SID = '00000000-0000-4000-8000-000000000003';
const TEACHER_SID = '00000000-0000-4000-8000-000000000004';
const TEACHER_SECRET = 'wallet-proposal-tests';

const ADDRESS_OLD = `D${'A'.repeat(33)}`;
const ADDRESS_A = `D${'B'.repeat(33)}`;
const ADDRESS_B = `D${'C'.repeat(33)}`;

const VERSION_A = '2026-09-02T12:00:00.001Z';
const VERSION_B = '2026-09-02T12:00:00.002Z';

const ORIGINAL_ENV = {
  rosterTeacherSecret: process.env.ROSTER_TEACHER_SECRET,
  teacherKey: process.env.TEACHER_KEY,
  studentWalletOptIn: process.env.STUDENT_WALLET_OPTIN,
};

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

beforeEach(() => {
  process.env.ROSTER_TEACHER_SECRET = TEACHER_SECRET;
  process.env.TEACHER_KEY = TEACHER_SECRET;
  delete process.env.STUDENT_WALLET_OPTIN;
});

afterEach(() => {
  restoreEnv('ROSTER_TEACHER_SECRET', ORIGINAL_ENV.rosterTeacherSecret);
  restoreEnv('TEACHER_KEY', ORIGINAL_ENV.teacherKey);
  restoreEnv('STUDENT_WALLET_OPTIN', ORIGINAL_ENV.studentWalletOptIn);
});

function student(overrides = {}) {
  return {
    student_id: SID,
    section: 'PeriodB',
    login_username: 'student-one',
    real_name: 'Student One',
    role: 'student',
    status: 'active',
    ...overrides,
  };
}

function account(overrides = {}) {
  return {
    student_id: SID,
    candy_eaten: 0,
    candy_given: 2,
    candy_gifted_out: 1,
    candy_gifted_in: 3,
    candy_realized: 0,
    candy_escrowed: 0,
    candy_bonus: 0,
    doge_balance: 8,
    doge_sent: 1,
    doge_cost_basis: 4,
    doge_address: null,
    proposed_address: null,
    proposed_at: null,
    proposal_rejection_reason: null,
    ...overrides,
  };
}

function copy(value) {
  return value == null ? value : structuredClone(value);
}

function createWorld({
  roster = [student()],
  accounts = [account()],
  proposalMissing = false,
  activeBatches = [],
} = {}) {
  const rosterRows = roster.map(copy);
  const accountRows = new Map(accounts.map((row) => [row.student_id, copy(row)]));
  const proposalWrites = [];
  const approveCalls = [];
  const rejectCalls = [];
  const chainFetch = vi.fn(async (address) => ({
    address,
    network: 'main',
    confirmedDoge: 1.25,
    unconfirmedDoge: 0,
    txCount: 1,
    source: 'test',
    syncedAt: '2026-09-02T12:00:00.000Z',
  }));
  let proposalSequence = 0;

  const migrationError = {
    code: '42703',
    message: 'column doge_account.proposed_address does not exist',
  };
  const result = (data, error = null) => ({ data: copy(data), error });
  const rosterRow = (studentId) => rosterRows.find((row) => row.student_id === studentId) || null;
  const currentAccount = (studentId) => accountRows.get(studentId) || null;
  const nextVersion = () => {
    proposalSequence += 1;
    return proposalSequence === 1 ? VERSION_A : VERSION_B;
  };
  const payoutOwns = (studentId) => activeBatches.some((batch) => (
    ['pending', 'claimed'].includes(batch.status)
    && batch.studentIds.includes(studentId)
  ));

  const db = {
    async findByStudentId(studentId) {
      return result(rosterRow(studentId));
    },
    async getRoleByStudentId(studentId) {
      return rosterRow(studentId)?.role || 'student';
    },
    async listRoster(section, options = {}) {
      const rows = rosterRows.filter((row) => {
        if (section && row.section !== section) return false;
        return options.includeArchived || row.status !== 'archived';
      });
      return result(rows);
    },
    async getDogeAccount(studentId) {
      return result(currentAccount(studentId));
    },
    async listDogeAccounts(studentIds) {
      const wanted = Array.isArray(studentIds) ? new Set(studentIds) : null;
      const rows = [...accountRows.values()].filter((row) => !wanted || wanted.has(row.student_id));
      return result(rows);
    },
    async listDogeLedger() {
      return result([]);
    },
    async dogeCoinFlows() {
      return result([]);
    },
    async updateDogeChain(studentId, patch) {
      const row = currentAccount(studentId);
      return result(row ? { ...row, ...patch } : null);
    },
    async setDogeAddressProposal(studentId, address) {
      if (proposalMissing) return result(null, migrationError);
      proposalWrites.push({ studentId, address });
      const row = currentAccount(studentId) || account({ student_id: studentId });
      const updated = {
        ...row,
        proposed_address: address,
        proposed_at: nextVersion(),
        proposal_rejection_reason: null,
      };
      accountRows.set(studentId, updated);
      return result(updated);
    },
    async listDogeAddressProposals(studentIds) {
      if (proposalMissing) return result(null, migrationError);
      const wanted = new Set(studentIds || []);
      const rows = [...accountRows.values()].filter((row) => (
        wanted.has(row.student_id) && row.proposed_address
      ));
      rows.sort((left, right) => String(left.proposed_at).localeCompare(String(right.proposed_at)));
      return result(rows);
    },
    async approveDogeAddressProposal(studentId, expectedAt) {
      approveCalls.push({ studentId, expectedAt });
      if (proposalMissing) return result(null, migrationError);
      const row = currentAccount(studentId);
      if (!row?.proposed_address || row.proposed_at !== expectedAt) {
        return result(null, { code: 'P0001', message: 'wallet address proposal changed' });
      }
      if (payoutOwns(studentId)) {
        return result(null, {
          code: '23514',
          message: 'wallet address change blocked by active payout batch',
        });
      }
      const updated = {
        ...row,
        doge_address: row.proposed_address,
        proposed_address: null,
        proposed_at: null,
        proposal_rejection_reason: null,
      };
      accountRows.set(studentId, updated);
      return result(updated);
    },
    async rejectDogeAddressProposal(studentId, expectedAt, reason) {
      rejectCalls.push({ studentId, expectedAt, reason });
      if (proposalMissing) return result(null, migrationError);
      const row = currentAccount(studentId);
      if (!row?.proposed_address || row.proposed_at !== expectedAt) return result(null);
      const updated = {
        ...row,
        proposed_address: null,
        proposed_at: null,
        proposal_rejection_reason: reason,
      };
      accountRows.set(studentId, updated);
      return result(updated);
    },
  };

  const ledgerDb = {
    async getLedgerByStudent() {
      return result([]);
    },
  };
  const app = express();
  app.use(express.json());
  mountDogeWallet(app, {
    db,
    ledgerDb,
    verifyToken: (token) => (
      typeof token === 'string' && token.startsWith('tok:')
        ? token.slice(4) || null
        : null
    ),
    getPrice: async () => 0.1,
    fetchChainBalance: chainFetch,
  });

  return {
    server: http.createServer(app),
    db,
    rosterRows,
    accounts: accountRows,
    proposalWrites,
    approveCalls,
    rejectCalls,
    chainFetch,
  };
}

async function request(world, method, path, { token, teacher = false, body } = {}) {
  await new Promise((resolve) => world.server.listen(0, '127.0.0.1', resolve));
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (teacher) headers['x-teacher-secret'] = TEACHER_SECRET;

  try {
    const response = await fetch(`http://127.0.0.1:${world.server.address().port}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      body: await response.json(),
    };
  } finally {
    await new Promise((resolve) => world.server.close(resolve));
  }
}

const propose = (world, studentId, address, extraBody = {}) => request(
  world,
  'POST',
  '/wallet/address/propose',
  {
    token: `tok:${studentId}`,
    body: { address, ...extraBody },
  },
);

const approve = (world, studentId, proposedAt) => request(
  world,
  'POST',
  '/wallet/address/approve',
  { teacher: true, body: { studentId, proposedAt } },
);

const reject = (world, studentId, proposedAt, reason) => request(
  world,
  'POST',
  '/wallet/address/reject',
  { teacher: true, body: { studentId, proposedAt, reason } },
);

describe('student wallet proposals - feature flag, authentication, and ownership', () => {
  it.each([undefined, '', 'false', '0', 'no', 'off'])(
    'keeps proposal writes disabled for STUDENT_WALLET_OPTIN=%s',
    async (flag) => {
      if (flag === undefined) delete process.env.STUDENT_WALLET_OPTIN;
      else process.env.STUDENT_WALLET_OPTIN = flag;
      const world = createWorld();

      const response = await propose(world, SID, ADDRESS_A);

      expect(response.status).toBe(403);
      expect(world.proposalWrites).toEqual([]);
      expect(world.accounts.get(SID).proposed_address).toBeNull();
    },
  );

  it('requires a valid Bearer token and always writes to the token owner', async () => {
    process.env.STUDENT_WALLET_OPTIN = 'on';
    const world = createWorld({
      roster: [student(), student({ student_id: OTHER_SID, login_username: 'student-two' })],
      accounts: [account(), account({ student_id: OTHER_SID })],
    });

    const missing = await request(world, 'POST', '/wallet/address/propose', {
      body: { address: ADDRESS_A },
    });
    const invalid = await request(world, 'POST', '/wallet/address/propose', {
      token: 'not-a-token',
      body: { address: ADDRESS_A },
    });
    const owned = await propose(world, SID, ADDRESS_A, { studentId: OTHER_SID });

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
    expect(owned.status).toBe(200);
    expect(world.proposalWrites).toEqual([{ studentId: SID, address: ADDRESS_A }]);
    expect(world.accounts.get(SID).proposed_address).toBe(ADDRESS_A);
    expect(world.accounts.get(OTHER_SID).proposed_address).toBeNull();
  });

  it('rejects stale archived tokens and teacher-role tokens without writing', async () => {
    process.env.STUDENT_WALLET_OPTIN = 'true';
    const world = createWorld({
      roster: [
        student({ student_id: ARCHIVED_SID, status: 'archived' }),
        student({ student_id: TEACHER_SID, role: 'teacher' }),
      ],
      accounts: [
        account({ student_id: ARCHIVED_SID }),
        account({ student_id: TEACHER_SID }),
      ],
    });

    const archived = await propose(world, ARCHIVED_SID, ADDRESS_A);
    const teacher = await propose(world, TEACHER_SID, ADDRESS_A);

    expect(archived.status).toBe(403);
    expect(teacher.status).toBe(403);
    expect(world.proposalWrites).toEqual([]);
  });

  it('rejects coercible non-string proposal addresses without writing', async () => {
    process.env.STUDENT_WALLET_OPTIN = 'true';
    const world = createWorld();

    const response = await propose(world, SID, [ADDRESS_A]);

    expect(response.status).toBe(400);
    expect(world.proposalWrites).toEqual([]);
    expect(world.accounts.get(SID).proposed_address).toBeNull();
  });

  it('keeps teacher review available while student opt-in is disabled', async () => {
    const world = createWorld({
      accounts: [account({ proposed_address: ADDRESS_A, proposed_at: VERSION_A })],
    });

    const unauthorized = await request(world, 'GET', '/class/wallet-proposals');
    const listed = await request(world, 'GET', '/class/wallet-proposals', { teacher: true });
    const approved = await approve(world, SID, VERSION_A);

    expect(unauthorized.status).toBe(401);
    expect(listed.status).toBe(200);
    expect(listed.body.proposals).toHaveLength(1);
    expect(approved.status).toBe(200);
    expect(world.accounts.get(SID).doge_address).toBe(ADDRESS_A);
  });

  it('never accepts the repository-published fallback teacher key', async () => {
    delete process.env.TEACHER_KEY;
    delete process.env.ROSTER_TEACHER_SECRET;
    const world = createWorld({
      accounts: [account({ proposed_address: ADDRESS_A, proposed_at: VERSION_A })],
    });

    await new Promise((resolve) => world.server.listen(0, '127.0.0.1', resolve));
    try {
      const response = await fetch(
        `http://127.0.0.1:${world.server.address().port}/class/wallet-proposals`,
        { headers: { 'x-teacher-secret': 'apteacher2627' } },
      );
      expect(response.status).toBe(401);
    } finally {
      await new Promise((resolve) => world.server.close(resolve));
    }
  });
});

describe('student wallet proposals - latest wins and masked reads', () => {
  it('replaces only proposal fields and never returns the full pending address', async () => {
    process.env.STUDENT_WALLET_OPTIN = 'yes';
    const initial = account({ doge_address: ADDRESS_OLD, proposal_rejection_reason: 'old reason' });
    const world = createWorld({ accounts: [initial] });

    const first = await propose(world, SID, ADDRESS_A);
    const second = await propose(world, SID, ADDRESS_B);
    const listed = await request(world, 'GET', '/class/wallet-proposals', { teacher: true });
    const wallet = await request(world, 'GET', '/wallet', { token: `tok:${SID}` });
    const row = world.accounts.get(SID);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({
      ok: true,
      proposedAddressMasked: 'DCCC…CCCC',
      proposedAt: VERSION_B,
    });
    expect(row).toMatchObject({
      doge_address: ADDRESS_OLD,
      proposed_address: ADDRESS_B,
      proposed_at: VERSION_B,
      proposal_rejection_reason: null,
      doge_balance: initial.doge_balance,
      doge_sent: initial.doge_sent,
      doge_cost_basis: initial.doge_cost_basis,
    });
    expect(listed.body.proposals).toEqual([{
      studentId: SID,
      studentName: 'Student One',
      username: 'student-one',
      rosterStatus: 'active',
      maskedAddress: 'DCCC…CCCC',
      proposedAt: VERSION_B,
      change: true,
    }]);
    expect(wallet.body).toMatchObject({
      studentWalletOptInEnabled: true,
      proposedAddressMasked: 'DCCC…CCCC',
      proposedAt: VERSION_B,
      proposalRejectionReason: null,
    });
    expect(JSON.stringify(second.body)).not.toContain(ADDRESS_B);
    expect(JSON.stringify(listed.body)).not.toContain(ADDRESS_B);
    expect(JSON.stringify(wallet.body)).not.toContain(ADDRESS_B);
  });
});

describe('student wallet proposals - migration 0033 degradation', () => {
  it('503s all proposal surfaces while the existing wallet remains provisioned', async () => {
    process.env.STUDENT_WALLET_OPTIN = 'true';
    const world = createWorld({
      proposalMissing: true,
      accounts: [account({ proposed_address: ADDRESS_A, proposed_at: VERSION_A })],
    });

    const proposed = await propose(world, SID, ADDRESS_B);
    const listed = await request(world, 'GET', '/class/wallet-proposals', { teacher: true });
    const approved = await approve(world, SID, VERSION_A);
    const rejected = await reject(world, SID, VERSION_A, 'Use your paper wallet.');

    for (const response of [proposed, listed, approved, rejected]) {
      expect(response.status).toBe(503);
      expect(response.body.error).toMatch(/migration 0033/);
    }
  });
});

describe('student wallet proposals - compare-and-swap review', () => {
  it('normalizes scalar identifiers and rejects coercible proposal versions', async () => {
    const world = createWorld({
      accounts: [account({ proposed_address: ADDRESS_A, proposed_at: VERSION_A })],
    });

    const normalized = await request(world, 'POST', '/wallet/address/approve', {
      teacher: true,
      body: { studentId: `  ${SID}  `, proposedAt: `  ${VERSION_A}  ` },
    });
    expect(normalized.status).toBe(200);

    world.accounts.set(SID, account({ proposed_address: ADDRESS_A, proposed_at: VERSION_A }));
    const arrayVersion = await request(world, 'POST', '/wallet/address/approve', {
      teacher: true,
      body: { studentId: SID, proposedAt: [VERSION_A] },
    });
    expect(arrayVersion.status).toBe(400);
  });

  it('does not approve or erase a newer proposal reviewed under a stale version', async () => {
    process.env.STUDENT_WALLET_OPTIN = 'true';
    const initial = account({
      doge_address: ADDRESS_OLD,
      proposed_address: ADDRESS_A,
      proposed_at: VERSION_A,
    });
    const world = createWorld({ accounts: [initial] });

    const replacement = await propose(world, SID, ADDRESS_B);
    expect(replacement.body.proposedAt).toBe(VERSION_A);

    // The seeded proposal did not pass through the fake write adapter, so the
    // replacement is its first generated version. Use a definitely stale value.
    const stale = await approve(world, SID, '2026-09-02T11:59:59.999Z');
    expect(stale.status).toBe(409);
    expect(world.accounts.get(SID)).toMatchObject({
      doge_address: ADDRESS_OLD,
      proposed_address: ADDRESS_B,
      proposed_at: VERSION_A,
    });

    const beforePromotion = copy(world.accounts.get(SID));
    const approved = await approve(world, SID, VERSION_A);
    const promoted = world.accounts.get(SID);

    expect(approved.status).toBe(200);
    expect(approved.body.dogeAddress).toBe(ADDRESS_B);
    expect(promoted).toMatchObject({
      doge_address: ADDRESS_B,
      proposed_address: null,
      proposed_at: null,
      proposal_rejection_reason: null,
      doge_balance: beforePromotion.doge_balance,
      doge_sent: beforePromotion.doge_sent,
      doge_cost_basis: beforePromotion.doge_cost_basis,
    });
  });

  it('rejects only the reviewed version and persists the reason for the student', async () => {
    process.env.STUDENT_WALLET_OPTIN = 'true';
    const world = createWorld({
      accounts: [account({
        doge_address: ADDRESS_OLD,
        proposed_address: ADDRESS_A,
        proposed_at: VERSION_A,
      })],
    });

    await propose(world, SID, ADDRESS_B);
    const stale = await reject(world, SID, '2026-09-02T11:59:59.999Z', 'stale review');
    expect(stale.status).toBe(409);
    expect(world.accounts.get(SID).proposed_address).toBe(ADDRESS_B);

    const rejected = await reject(world, SID, VERSION_A, 'Use the teacher paper wallet instead.');
    const wallet = await request(world, 'GET', '/wallet', { token: `tok:${SID}` });

    expect(rejected.status).toBe(200);
    expect(world.accounts.get(SID)).toMatchObject({
      doge_address: ADDRESS_OLD,
      proposed_address: null,
      proposed_at: null,
      proposal_rejection_reason: 'Use the teacher paper wallet instead.',
    });
    expect(wallet.body).toMatchObject({
      dogeAddress: ADDRESS_OLD,
      proposedAddressMasked: null,
      proposedAt: null,
      proposalRejectionReason: 'Use the teacher paper wallet instead.',
    });
  });

  it('rejects coercible non-string rejection reasons without changing the proposal', async () => {
    const world = createWorld({
      accounts: [account({ proposed_address: ADDRESS_A, proposed_at: VERSION_A })],
    });

    const response = await reject(world, SID, VERSION_A, ['Use your paper wallet.']);

    expect(response.status).toBe(400);
    expect(world.rejectCalls).toEqual([]);
    expect(world.accounts.get(SID)).toMatchObject({
      proposed_address: ADDRESS_A,
      proposed_at: VERSION_A,
      proposal_rejection_reason: null,
    });
  });
});

describe('student wallet proposals - payout reservation and inertness', () => {
  it.each(['pending', 'claimed'])(
    'returns 409 and leaves the complete wallet row unchanged for a %s payout batch',
    async (status) => {
      const world = createWorld({
        accounts: [account({
          doge_address: ADDRESS_OLD,
          proposed_address: ADDRESS_A,
          proposed_at: VERSION_A,
        })],
        activeBatches: [{ status, studentIds: [SID] }],
      });
      const before = copy(world.accounts.get(SID));

      const response = await approve(world, SID, VERSION_A);

      expect(response.status).toBe(409);
      expect(response.body.error).toMatch(/active payout batch/);
      expect(world.accounts.get(SID)).toEqual(before);
    },
  );

  it('keeps a proposal inert, then watches and pays it immediately after approval', async () => {
    const world = createWorld({
      accounts: [account({
        doge_address: ADDRESS_OLD,
        proposed_address: ADDRESS_B,
        proposed_at: VERSION_A,
      })],
    });

    const studentChainBefore = await request(world, 'GET', '/wallet/chain', {
      token: `tok:${SID}`,
    });
    const classWalletsBefore = await request(world, 'GET', '/class/wallets', { teacher: true });
    const classChainBefore = await request(world, 'GET', '/class/wallets/chain', { teacher: true });
    const payoutBefore = buildPayoutPlan([...world.accounts.values()]);

    expect(studentChainBefore.body.address).toBe(ADDRESS_OLD);
    expect(classWalletsBefore.body.accounts[0].dogeAddress).toBe(ADDRESS_OLD);
    expect(classChainBefore.body.addresses[SID].address).toBe(ADDRESS_OLD);
    expect(payoutBefore.rows).toEqual([{
      studentId: SID,
      address: ADDRESS_OLD,
      doge: 7,
    }]);
    expect(world.chainFetch.mock.calls.map(([address]) => address)).toEqual([
      ADDRESS_OLD,
      ADDRESS_OLD,
    ]);
    expect(JSON.stringify(classWalletsBefore.body)).not.toContain(ADDRESS_B);
    expect(JSON.stringify(classChainBefore.body)).not.toContain(ADDRESS_B);
    expect(JSON.stringify(payoutBefore)).not.toContain(ADDRESS_B);

    const approved = await approve(world, SID, VERSION_A);
    expect(approved.status).toBe(200);
    world.chainFetch.mockClear();

    const studentChainAfter = await request(world, 'GET', '/wallet/chain', {
      token: `tok:${SID}`,
    });
    const classWalletsAfter = await request(world, 'GET', '/class/wallets', { teacher: true });
    const classChainAfter = await request(world, 'GET', '/class/wallets/chain', { teacher: true });
    const payoutAfter = buildPayoutPlan([...world.accounts.values()]);
    const teacherEnteredEquivalent = buildPayoutPlan([account({ doge_address: ADDRESS_B })]);

    expect(studentChainAfter.body.address).toBe(ADDRESS_B);
    expect(classWalletsAfter.body.accounts[0].dogeAddress).toBe(ADDRESS_B);
    expect(classChainAfter.body.addresses[SID].address).toBe(ADDRESS_B);
    expect(world.chainFetch.mock.calls.map(([address]) => address)).toEqual([
      ADDRESS_B,
      ADDRESS_B,
    ]);
    expect(payoutAfter).toEqual(teacherEnteredEquivalent);
  });
});
