// candy-return.test.js — CANDY_RETURN_SPEC invariants R2–R6.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mountDogeWallet } from '../doge-wallet.js';
import { createDb } from '../db.js';
import { hashPayoutPlan } from '../payout.js';
import {
  createWalletDb, resetWallet, pgMark, pgGiveBack, pgSpend, pgGift,
  pgBetOpen, pgNum,
} from './fixtures/pg-wallet.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_0034 = resolve(__dirname, '..', 'migrations', '0034_candy_return.sql');
const MIGRATION_0032 = resolve(__dirname, '..', 'migrations', '0032_payout_batch.sql');
const TEACHER_DASHBOARD = resolve(__dirname, '..', '..', 'teacher-dashboard.html');
const DESK = resolve(__dirname, '..', '..', 'ap_stats_roadmap_square_mode.html');
const SID = '00000000-0000-4000-8000-000000000001';
const SID_2 = '00000000-0000-4000-8000-000000000002';
const TEACHER_SECRET = 'candy-return-test-secret';

let oldTeacherSecret;
beforeAll(() => {
  oldTeacherSecret = process.env.ROSTER_TEACHER_SECRET;
  process.env.ROSTER_TEACHER_SECRET = TEACHER_SECRET;
});
afterAll(() => {
  if (oldTeacherSecret == null) delete process.env.ROSTER_TEACHER_SECRET;
  else process.env.ROSTER_TEACHER_SECRET = oldTeacherSecret;
});

const owed = (row, earned) => earned
  + pgNum(row.candy_gifted_in)
  + pgNum(row.candy_realized)
  + pgNum(row.candy_bonus)
  + pgNum(row.candy_returned)
  - pgNum(row.candy_gifted_out)
  - pgNum(row.doge_cost_basis)
  - pgNum(row.candy_given)
  - pgNum(row.candy_escrowed);

const giveCap = (row, earned) => owed(row, earned) + pgNum(row.candy_given);

describe('R2–R4 — real 0034 SQL', () => {
  let pg;

  beforeAll(async () => {
    pg = await createWalletDb([SID, SID_2]);
  }, 60_000);

  afterAll(async () => {
    if (pg) await pg.close();
  });

  it('R2: candy_returned is monotonic, never exceeds candy_given, and oversized returns clamp to still-out', async () => {
    await resetWallet(pg);
    await pgMark(pg, { p_sid: SID, p_field: 'candy_given', p_amount: 5, p_earned: 10 });

    const clamped = await pgGiveBack(pg, { p_sid: SID, p_amount: 99 });
    expect(pgNum(clamped.candy_given)).toBe(5);
    expect(pgNum(clamped.candy_returned)).toBe(5);

    const replay = await pgGiveBack(pg, { p_sid: SID, p_amount: 1 });
    expect(pgNum(replay.candy_given)).toBe(5);
    expect(pgNum(replay.candy_returned)).toBe(5);
    expect(pgNum(replay.candy_returned)).toBeLessThanOrEqual(pgNum(replay.candy_given));
  });

  it('R3: give 5 → return 2 → give 1 has exact owed/caps and one ledger leg per delta', async () => {
    await resetWallet(pg);
    const earned = 10;

    const firstGive = await pgMark(pg, {
      p_sid: SID, p_field: 'candy_given', p_amount: 5, p_earned: earned,
    });
    expect(pgNum(firstGive.candy_given)).toBe(5);
    expect(pgNum(firstGive.candy_returned)).toBe(0);
    expect(owed(firstGive, earned)).toBe(5);
    expect(giveCap(firstGive, earned)).toBe(10);

    const returned = await pgGiveBack(pg, { p_sid: SID, p_amount: 2 });
    expect(pgNum(returned.candy_given)).toBe(5);
    expect(pgNum(returned.candy_returned)).toBe(2);
    expect(owed(returned, earned)).toBe(7);
    expect(giveCap(returned, earned)).toBe(12);

    const secondGive = await pgMark(pg, {
      p_sid: SID, p_field: 'candy_given', p_amount: 1, p_earned: earned,
    });
    expect(pgNum(secondGive.candy_given)).toBe(6);
    expect(pgNum(secondGive.candy_returned)).toBe(2);
    expect(owed(secondGive, earned)).toBe(6);
    expect(giveCap(secondGive, earned)).toBe(12);

    const ledger = await pg.query(
      `select kind, candy_delta
         from doge_ledger
        where student_id = $1
        order by id`,
      [SID],
    );
    expect(ledger.rows.map((row) => [row.kind, pgNum(row.candy_delta)])).toEqual([
      ['give', -5],
      ['give_back', 2],
      ['give', -1],
    ]);
  });

  it('R4: replayed return requests advance only to the clamp and log only real deltas', async () => {
    await resetWallet(pg);
    await pgMark(pg, { p_sid: SID, p_field: 'candy_given', p_amount: 3, p_earned: 3 });

    expect(pgNum((await pgGiveBack(pg, { p_sid: SID, p_amount: 2 })).candy_returned)).toBe(2);
    expect(pgNum((await pgGiveBack(pg, { p_sid: SID, p_amount: 2 })).candy_returned)).toBe(3);
    expect(pgNum((await pgGiveBack(pg, { p_sid: SID, p_amount: 2 })).candy_returned)).toBe(3);

    const legs = await pg.query(
      `select candy_delta from doge_ledger
        where student_id = $1 and kind = 'give_back'
        order by id`,
      [SID],
    );
    expect(legs.rows.map((row) => pgNum(row.candy_delta))).toEqual([2, 1]);
  });

  it('returned candy is immediately convertible, giftable, and stakeable', async () => {
    await resetWallet(pg);
    await pgMark(pg, { p_sid: SID, p_field: 'candy_given', p_amount: 5, p_earned: 5 });
    await pgGiveBack(pg, { p_sid: SID, p_amount: 2 });
    const price = 0.088;
    const candyPerDoge = price / 0.036;
    const bought = await pgSpend(pg, {
      p_sid: SID,
      p_earned: 5,
      p_candy: 2,
      p_kind: 'buy_doge',
      p_doge: 2 / candyPerDoge,
      p_price: price,
      p_cpd: candyPerDoge,
    });
    expect(bought.student_id).toBe(SID);
    expect(pgNum(bought.doge_cost_basis)).toBe(2);

    await resetWallet(pg);
    await pgMark(pg, { p_sid: SID, p_field: 'candy_given', p_amount: 5, p_earned: 5 });
    await pgGiveBack(pg, { p_sid: SID, p_amount: 2 });
    const gifted = await pgGift(pg, {
      p_from: SID,
      p_to: SID_2,
      p_candy: 2,
      p_earned_from: 5,
      p_cap: 10,
    });
    expect(gifted.student_id).toBe(SID);
    expect(pgNum(gifted.candy_gifted_out)).toBe(2);

    await resetWallet(pg);
    await pgMark(pg, { p_sid: SID, p_field: 'candy_given', p_amount: 5, p_earned: 5 });
    await pgGiveBack(pg, { p_sid: SID, p_amount: 1 });
    expect(await pgBetOpen(pg, {
      p_match: 'returned-candy-stake',
      p_caller: SID,
      p_opp: SID_2,
      p_stake: 1,
      p_earned_caller: 5,
    })).toBe('waiting');
    expect(await pgBetOpen(pg, {
      p_match: 'returned-candy-stake',
      p_caller: SID_2,
      p_opp: SID,
      p_stake: 1,
      p_earned_caller: 1,
    })).toBe('opened');
  });

  it('0034 is safe to paste again and keeps give_back in the ledger constraint', async () => {
    const sql = await readFile(MIGRATION_0034, 'utf8');
    await pg.exec(sql);
    await resetWallet(pg);
    await pgMark(pg, { p_sid: SID, p_field: 'candy_given', p_amount: 1, p_earned: 1 });
    const row = await pgGiveBack(pg, { p_sid: SID, p_amount: 1 });
    expect(pgNum(row.candy_returned)).toBe(1);
  });
});

describe('R5 — payout isolation against real PostgreSQL', () => {
  it('a return can happen before and during an active payout without touching DOGE or the batch', async () => {
    const pg = await createWalletDb([SID], { includeCandyReturn: false });
    try {
      await pg.exec(await readFile(MIGRATION_0032, 'utf8'));
      await pg.exec(await readFile(MIGRATION_0034, 'utf8'));
      await pg.query(
        `insert into doge_account
           (student_id, doge_address, doge_balance, doge_sent, candy_given)
         values ($1, $2, 5, 0, 5)`,
        [SID, 'DActivePayoutAddress'],
      );

      const beforeBatch = await pgGiveBack(pg, { p_sid: SID, p_amount: 1 });
      expect(pgNum(beforeBatch.candy_returned)).toBe(1);

      const plan = {
        minPerStudent: 5,
        rows: [{ studentId: SID, address: 'DActivePayoutAddress', doge: 5 }],
        total: 5,
      };
      const created = await pg.query(
        'select * from payout_create($1::jsonb, $2::text)',
        [JSON.stringify(plan), hashPayoutPlan(plan)],
      );
      expect(created.rows[0].status).toBe('pending');

      const duringBatch = await pgGiveBack(pg, { p_sid: SID, p_amount: 1 });
      expect(pgNum(duringBatch.candy_returned)).toBe(2);
      expect(pgNum(duringBatch.doge_balance)).toBe(5);
      expect(pgNum(duringBatch.doge_sent)).toBe(0);

      const batch = await pg.query('select status from payout_batch');
      expect(batch.rows).toEqual([{ status: 'pending' }]);
    } finally {
      await pg.close();
    }
  }, 60_000);
});

function routeWorld({ giveBackError = null } = {}) {
  let account = {
    student_id: SID,
    candy_given: 5,
    candy_returned: 0,
    doge_balance: 0,
    doge_sent: 0,
    doge_cost_basis: 0,
  };
  const ledger = [];
  const db = {
    async getRoleByStudentId() { return 'student'; },
    async getDogeAccount() { return { data: account, error: null }; },
    async listDogeLedger() { return { data: ledger, error: null }; },
    async dogeCoinFlows() { return { data: [], error: null }; },
    async dogeGiveBack({ p_sid, p_amount }) {
      if (giveBackError) return { data: null, error: giveBackError };
      const old = Number(account.candy_returned || 0);
      const next = Math.max(old, Math.min(old + p_amount, Number(account.candy_given || 0)));
      account = { ...account, student_id: p_sid, candy_returned: next };
      if (next - old > 1e-9) {
        ledger.push({ student_id: p_sid, kind: 'give_back', candy_delta: next - old });
      }
      return { data: account, error: null };
    },
  };
  const ledgerDb = {
    async getLedgerByStudent() {
      return {
        data: Array.from({ length: 36 }, (_, index) => ({
          source: 'curriculum_quiz', item_id: `Q-${index}`, receipt_compact: 'receipt',
        })),
        error: null,
      };
    },
  };
  const app = express();
  app.use(express.json());
  mountDogeWallet(app, {
    db,
    ledgerDb,
    verifyToken: (token) => token === 'student-token' ? SID : null,
    getPrice: async () => 0.088,
  });
  return { server: http.createServer(app), account: () => account, ledger };
}

async function request(world, method, path, { teacher = false, token = null, body = null } = {}) {
  await new Promise((resolveListen) => world.server.listen(0, resolveListen));
  const headers = { 'content-type': 'application/json' };
  if (teacher) headers['x-teacher-secret'] = TEACHER_SECRET;
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`http://127.0.0.1:${world.server.address().port}${path}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  await new Promise((resolveClose) => world.server.close(resolveClose));
  return { status: response.status, data };
}

describe('R2/R6 — POST /wallet/mark-returned', () => {
  it('is teacher-only and rejects non-positive amounts and malformed student ids', async () => {
    const noTeacher = await request(routeWorld(), 'POST', '/wallet/mark-returned', {
      body: { studentId: SID, amount: 1 },
    });
    expect(noTeacher.status).toBe(401);

    const zero = await request(routeWorld(), 'POST', '/wallet/mark-returned', {
      teacher: true, body: { studentId: SID, amount: 0 },
    });
    expect(zero.status).toBe(400);

    const badId = await request(routeWorld(), 'POST', '/wallet/mark-returned', {
      teacher: true, body: { studentId: 'not-a-uuid', amount: 1 },
    });
    expect(badId.status).toBe(404);
  });

  it('returns the cumulative clamped counter and never changes candy_given', async () => {
    const world = routeWorld();
    const result = await request(world, 'POST', '/wallet/mark-returned', {
      teacher: true, body: { studentId: SID, amount: 99 },
    });
    expect(result.status).toBe(200);
    expect(result.data.candy_returned).toBe(5);
    expect(world.account().candy_given).toBe(5);

    const wallet = await request(world, 'GET', '/wallet', { token: 'student-token' });
    expect(wallet.data.candyReturned).toBe(5);
    expect(wallet.data.candyOwed).toBe(10);
  });

  it('R6: pre-0034 returns a specific 503 while GET /wallet remains available', async () => {
    const missing = {
      code: 'PGRST202',
      message: 'Could not find the function public.doge_give_back(p_amount, p_sid) in the schema cache',
    };
    const world = routeWorld({ giveBackError: missing });
    const returned = await request(world, 'POST', '/wallet/mark-returned', {
      teacher: true, body: { studentId: SID, amount: 1 },
    });
    expect(returned.status).toBe(503);
    expect(returned.data.error).toMatch(/migration 0034/);

    const wallet = await request(world, 'GET', '/wallet', { token: 'student-token' });
    expect(wallet.status).toBe(200);
    expect(wallet.data.candyReturned).toBe(0);
    expect(wallet.data.candyOwed).toBe(5);
  });
});

describe('db.dogeGiveBack', () => {
  it('calls only the 0034 RPC with the supplied lock-and-clamp parameters', async () => {
    const calls = [];
    const db = createDb({
      rpc(name, params) {
        calls.push([name, params]);
        return Promise.resolve({ data: { student_id: SID, candy_returned: 1 }, error: null });
      },
    });
    await db.dogeGiveBack({ p_sid: SID, p_amount: 1 });
    expect(calls).toEqual([['doge_give_back', { p_sid: SID, p_amount: 1 }]]);
  });
});

function functionSource(source, name) {
  const match = new RegExp(`function\\s+${name}\\s*\\(`).exec(source);
  if (!match) throw new Error(`function not found: ${name}`);
  const open = source.indexOf('{', match.index);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] !== '}') continue;
    depth -= 1;
    if (depth === 0) return source.slice(match.index, index + 1);
  }
  throw new Error(`unbalanced function: ${name}`);
}

describe('R2 — teacher dashboard validation', () => {
  it('rejects a return above still-out and posts a valid fractional return', async () => {
    const dashboard = await readFile(TEACHER_DASHBOARD, 'utf8');
    const source = functionSource(dashboard, '_rewardMarkReturned');
    const old = {
      prompt: globalThis.prompt,
      showError: globalThis.showError,
      rewardMark: globalThis._rewardMark,
    };
    const errors = [];
    const marks = [];
    globalThis.showError = (message) => errors.push(message);
    globalThis._rewardMark = (...args) => marks.push(args);
    try {
      (0, eval)(`${source};globalThis.__rewardMarkReturned=_rewardMarkReturned;`);
      globalThis.prompt = () => '6';
      globalThis.__rewardMarkReturned(SID, 'Student', 5);
      expect(errors).toEqual([expect.stringMatching(/only have 5 candy out/i)]);
      expect(marks).toEqual([]);

      globalThis.prompt = () => '2.5';
      globalThis.__rewardMarkReturned(SID, 'Student', 5);
      expect(marks).toEqual([[SID, 'mark-returned', 2.5]]);
      expect(dashboard).toContain('↩ took back…');
      expect(dashboard).toContain('materialized - returned');
    } finally {
      delete globalThis.__rewardMarkReturned;
      if (old.prompt === undefined) delete globalThis.prompt;
      else globalThis.prompt = old.prompt;
      if (old.showError === undefined) delete globalThis.showError;
      else globalThis.showError = old.showError;
      if (old.rewardMark === undefined) delete globalThis._rewardMark;
      else globalThis._rewardMark = old.rewardMark;
    }
  });
});

describe('Desk + client identity mirror', () => {
  it('adds Returned to Owed and subtracts it from physical candy in hand', async () => {
    await import('../../js/wallet_logic.js');
    const balances = globalThis.WalletLogic.candyLedgerBalances({
      candyEarned: 10,
      candyReceived: 1,
      candyRealized: 0,
      candyBonus: 1,
      candyReturned: 2,
      candyGiftedOut: 1,
      candyConverted: 2,
      candyMaterialized: 5,
      candyEscrowed: 1,
    });
    expect(balances).toEqual({
      candyBalanceRaw: 5,
      candyBalance: 5,
      candyOwed: 5,
      candyInHand: 3,
    });
  });

  it('shows given − returned as In hand and exposes Handed back honestly', async () => {
    const desk = await readFile(DESK, 'utf8');
    const detail = functionSource(desk, '_walletLedgerDetail');
    expect(detail).toContain('materialized - returned');
    expect(detail).toContain("row(cg, 'In hand'");
    expect(detail).toContain("row(cg, 'Handed back'");
  });
});
