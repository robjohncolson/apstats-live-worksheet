import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import {
  DOGE_SEND_ERROR,
  createFileJournal,
  createJournalIntent,
  executeSendPlan,
  planSends,
  recordJournalTxid,
  round8,
  validateSendPlan,
} from '../tools/lib/doge-send-core.mjs';
import { planSends as wrapperPlanSends } from '../tools/doge-send.mjs';

const tempDirectories = [];
const VALID_TXID = 'a'.repeat(64);

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function makePlan() {
  return planSends([
    { studentId: 's1', dogeToDeposit: 6, dogeAddress: 'Dabc' },
    { studentId: 's2', dogeToDeposit: 5, dogeAddress: 'Ddef' },
  ]);
}

function makeRunCli({
  chain = 'main',
  valid = true,
  balance = 100,
  txid = VALID_TXID,
  events = [],
} = {}) {
  return vi.fn(async (command, ...args) => {
    events.push(['cli', command, ...args]);

    if (command === 'getblockchaininfo') return JSON.stringify({ chain });
    if (command === 'validateaddress') return JSON.stringify({ isvalid: valid });
    if (command === 'getbalance') return String(balance);
    if (command === 'sendmany') return txid;

    throw new Error(`unexpected command: ${command}`);
  });
}

describe('doge-send core planning', () => {
  it('keeps the legacy wrapper export wired to the extracted planner', () => {
    expect(wrapperPlanSends).toBe(planSends);
    expect(round8(1 / 3)).toBe(0.33333333);

    const plan = makePlan();
    expect(plan.outputs).toEqual({ Dabc: 6, Ddef: 5 });
    expect(plan.total).toBe(11);
  });

  it('builds immutable-style journal snapshots containing the output map', () => {
    const plan = makePlan();
    const intent = createJournalIntent(plan, {
      batchId: 'batch-1',
      now: new Date('2026-09-01T00:00:00.000Z'),
    });
    const completed = recordJournalTxid(intent, ' tx-123\n');

    expect(intent).toEqual({
      ts: '2026-09-01T00:00:00.000Z',
      recipients: [
        { studentId: 's1', amount: 6 },
        { studentId: 's2', amount: 5 },
      ],
      outputs: { Dabc: 6, Ddef: 5 },
      total: 11,
      batch_id: 'batch-1',
    });
    expect(intent).not.toHaveProperty('txid');
    expect(completed).toEqual({ ...intent, txid: 'tx-123' });
  });

  it('preserves exact koinu and floors only excess wallet precision', () => {
    const plan = planSends([
      { studentId: 's1', dogeToDeposit: 5.000000006, dogeAddress: 'Dabc' },
      { studentId: 's2', dogeToDeposit: 5.00000005, dogeAddress: 'Ddef' },
    ]);

    expect(plan.sendable).toEqual([
      { studentId: 's1', address: 'Dabc', amount: 5 },
      { studentId: 's2', address: 'Ddef', amount: 5.00000005 },
    ]);
    expect(plan.outputs).toEqual({ Dabc: 5, Ddef: 5.00000005 });
    expect(plan.total).toBe(10.00000005);
  });

  it('rejects a plan whose recipients, outputs, and total disagree', async () => {
    const plan = makePlan();
    plan.outputs.Dabc = 60;
    const runCli = makeRunCli();

    await expect(validateSendPlan(plan, { runCli })).rejects.toMatchObject({
      code: DOGE_SEND_ERROR.INVALID_PLAN,
    });
    expect(runCli).not.toHaveBeenCalled();
  });

  it.each([
    ['a numeric string output', '5'],
    ['an output beyond eight decimals', 5.000000004],
  ])('rejects %s instead of coercing what sendmany receives', async (_label, output) => {
    const plan = makePlan();
    plan.sendable[1].amount = 5;
    plan.outputs.Ddef = output;
    const runCli = makeRunCli();

    await expect(executeSendPlan(plan, { runCli })).rejects.toMatchObject({
      code: DOGE_SEND_ERROR.INVALID_PLAN,
    });
    expect(runCli).not.toHaveBeenCalled();
  });
});

describe('doge-send core execution', () => {
  it('is a dry run by default and never journals or calls sendmany', async () => {
    const runCli = makeRunCli();
    const write = vi.fn();

    const result = await executeSendPlan(makePlan(), {
      runCli,
      journal: { exists: () => false, write },
    });

    expect(result).toMatchObject({ status: 'dry-run', dryRun: true, txid: null });
    expect(runCli.mock.calls.map(([command]) => command)).toEqual([
      'getblockchaininfo',
      'validateaddress',
      'validateaddress',
      'getbalance',
    ]);
    expect(write).not.toHaveBeenCalled();
  });

  it('durably journals intent, broadcasts one sendmany, then journals its txid', async () => {
    const events = [];
    const runCli = makeRunCli({ events });
    const clear = vi.fn();
    const journal = {
      exists: vi.fn(() => false),
      write: vi.fn((entry, options) => {
        events.push(['journal', entry.txid || 'intent', options]);
      }),
      clear,
    };

    const result = await executeSendPlan(makePlan(), {
      runCli,
      dryRun: false,
      journal,
      now: new Date('2026-09-01T00:00:00.000Z'),
    });

    expect(result).toMatchObject({ status: 'broadcast', dryRun: false, txid: VALID_TXID });
    expect(runCli.mock.calls.filter(([command]) => command === 'sendmany')).toEqual([
      ['sendmany', '', JSON.stringify({ Dabc: 6, Ddef: 5 })],
    ]);
    expect(events.findIndex(([kind, value]) => kind === 'journal' && value === 'intent'))
      .toBeLessThan(events.findIndex(([kind, value]) => kind === 'cli' && value === 'sendmany'));
    expect(events.findIndex(([kind, value]) => kind === 'cli' && value === 'sendmany'))
      .toBeLessThan(events.findIndex(([kind, value]) => kind === 'journal' && value === VALID_TXID));
    expect(journal.write.mock.calls[0][1]).toEqual({ exclusive: true });
    expect(journal.write.mock.calls[1][1]).toEqual({ exclusive: false });
    expect(journal.write.mock.calls[1][0]).toMatchObject({
      txid: VALID_TXID,
      outputs: { Dabc: 6, Ddef: 5 },
      total: 11,
    });
    expect(clear).not.toHaveBeenCalled();
  });

  it('adds a recovery comment without changing legacy sendmany arguments', async () => {
    const runCli = makeRunCli();
    const journal = { exists: () => false, write: vi.fn() };

    await executeSendPlan(makePlan(), {
      runCli,
      dryRun: false,
      journal,
      comment: 'apstats-payout:batch-1:hash-1',
    });

    const sendmany = runCli.mock.calls.find(([command]) => command === 'sendmany');
    expect(sendmany).toEqual([
      'sendmany',
      '',
      JSON.stringify({ Dabc: 6, Ddef: 5 }),
      '1',
      'apstats-payout:batch-1:hash-1',
    ]);
    expect(journal.write.mock.calls[0][0]).toMatchObject({
      comment: 'apstats-payout:batch-1:hash-1',
    });
  });

  it.each(['onValidated', 'onBeforeBroadcast'])(
    'broadcasts the immutable validated journal snapshot when %s mutates the caller plan',
    async (hookName) => {
      const plan = makePlan();
      const journalEntries = [];
      const runCli = makeRunCli();
      const mutateCallerPlan = () => {
        plan.sendable[0].amount = 50;
        plan.outputs.Dabc = 50;
        plan.total = 55;
      };

      await executeSendPlan(plan, {
        runCli,
        dryRun: false,
        journal: {
          exists: () => false,
          write: (entry) => journalEntries.push(entry),
        },
        [hookName]: mutateCallerPlan,
      });

      expect(journalEntries[0]).toMatchObject({
        outputs: { Dabc: 6, Ddef: 5 },
        total: 11,
      });
      expect(runCli.mock.calls.find(([command]) => command === 'sendmany')).toEqual([
        'sendmany',
        '',
        JSON.stringify({ Dabc: 6, Ddef: 5 }),
      ]);
    },
  );

  it('refuses an existing journal before any node call or broadcast', async () => {
    const runCli = makeRunCli();
    const write = vi.fn();

    await expect(executeSendPlan(makePlan(), {
      runCli,
      dryRun: false,
      journal: { exists: () => true, write },
    })).rejects.toMatchObject({ code: DOGE_SEND_ERROR.JOURNAL_EXISTS });

    expect(runCli).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('exposes exact balance details and aborts before broadcast', async () => {
    const runCli = makeRunCli({ balance: 15 });

    await expect(validateSendPlan(makePlan(), {
      runCli,
      feeBuffer: 5,
    })).rejects.toMatchObject({
      code: DOGE_SEND_ERROR.INSUFFICIENT_FLOAT,
      balance: 15,
      needed: 16,
    });
    expect(runCli.mock.calls.some(([command]) => command === 'sendmany')).toBe(false);
  });

  it.each([
    {
      label: 'wrong chain',
      options: { chain: 'test' },
      code: DOGE_SEND_ERROR.WRONG_CHAIN,
    },
    {
      label: 'invalid address',
      options: { valid: false },
      code: DOGE_SEND_ERROR.INVALID_ADDRESS,
    },
  ])('aborts on $label before sendmany', async ({ options, code }) => {
    const runCli = makeRunCli(options);

    await expect(executeSendPlan(makePlan(), { runCli })).rejects.toMatchObject({ code });
    expect(runCli.mock.calls.some(([command]) => command === 'sendmany')).toBe(false);
  });

  it.each([
    ['a string false address verdict', { valid: 'false' }],
    ['a partially parsed balance', { balance: '16 garbage' }],
  ])('rejects %s before sendmany', async (_label, options) => {
    const runCli = makeRunCli(options);

    await expect(executeSendPlan(makePlan(), { runCli })).rejects.toBeInstanceOf(Error);
    expect(runCli.mock.calls.some(([command]) => command === 'sendmany')).toBe(false);
  });

  it('journals an invalid sendmany response but refuses to reconcile it as a txid', async () => {
    const entries = [];
    const runCli = makeRunCli({ txid: 'not-a-txid' });

    await expect(executeSendPlan(makePlan(), {
      runCli,
      dryRun: false,
      journal: {
        exists: () => false,
        write: (entry) => entries.push(entry),
      },
    })).rejects.toMatchObject({ code: DOGE_SEND_ERROR.MISSING_TXID });

    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({ txid: 'not-a-txid' });
  });

  it('does not broadcast when the durable intent write fails', async () => {
    const runCli = makeRunCli();

    await expect(executeSendPlan(makePlan(), {
      runCli,
      dryRun: false,
      journal: {
        exists: () => false,
        write: () => { throw new Error('disk full'); },
      },
    })).rejects.toMatchObject({
      code: DOGE_SEND_ERROR.JOURNAL_WRITE_FAILED,
      broadcastMayHaveRun: false,
    });
    expect(runCli.mock.calls.some(([command]) => command === 'sendmany')).toBe(false);
  });

  it('keeps the intent and does not broadcast when the pre-broadcast hook fails', async () => {
    const entries = [];
    const runCli = makeRunCli();

    await expect(executeSendPlan(makePlan(), {
      runCli,
      dryRun: false,
      journal: {
        exists: () => false,
        write: (entry) => entries.push(entry),
      },
      onBeforeBroadcast: () => { throw new Error('arm failed'); },
    })).rejects.toThrow('arm failed');

    expect(entries).toHaveLength(1);
    expect(entries[0]).not.toHaveProperty('txid');
    expect(runCli.mock.calls.some(([command]) => command === 'sendmany')).toBe(false);
  });

  it('reports a post-broadcast journal failure as ambiguous and never clears intent', async () => {
    const runCli = makeRunCli();
    let writes = 0;

    await expect(executeSendPlan(makePlan(), {
      runCli,
      dryRun: false,
      journal: {
        exists: () => false,
        write: () => {
          writes += 1;
          if (writes === 2) throw new Error('disk full');
        },
      },
    })).rejects.toMatchObject({
      code: DOGE_SEND_ERROR.JOURNAL_WRITE_FAILED,
      broadcastMayHaveRun: true,
    });

    expect(runCli.mock.calls.filter(([command]) => command === 'sendmany')).toHaveLength(1);
  });

  it('keeps the intent when sendmany fails, so a live retry is blocked', async () => {
    const writes = [];
    const runCli = makeRunCli();
    runCli.mockImplementation(async (command) => {
      if (command === 'getblockchaininfo') return JSON.stringify({ chain: 'main' });
      if (command === 'validateaddress') return JSON.stringify({ isvalid: true });
      if (command === 'getbalance') return '100';
      if (command === 'sendmany') throw new Error('connection dropped');
      throw new Error(`unexpected command: ${command}`);
    });

    await expect(executeSendPlan(makePlan(), {
      runCli,
      dryRun: false,
      journal: {
        exists: () => writes.length > 0,
        write: (entry) => writes.push(entry),
      },
    })).rejects.toMatchObject({ code: DOGE_SEND_ERROR.CLI_UNAVAILABLE });

    expect(writes).toHaveLength(1);
    expect(writes[0]).not.toHaveProperty('txid');
    expect(writes[0].outputs).toEqual({ Dabc: 6, Ddef: 5 });
  });
});

describe('doge-send durable file journal', () => {
  it('atomically creates, refuses overwrite, updates, and clears a mode-0600 journal', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'doge-send-core-'));
    tempDirectories.push(directory);
    const path = join(directory, '.doge-send-journal.json');
    const journal = createFileJournal(path);
    const intent = { batch_id: 'batch-1', outputs: { Dabc: 6 } };

    journal.write(intent, { exclusive: true });
    expect(journal.exists()).toBe(true);
    expect(journal.read()).toEqual(intent);
    expect(statSync(path).mode & 0o777).toBe(0o600);

    expect(() => journal.write({ overwritten: true }, { exclusive: true }))
      .toThrow(expect.objectContaining({ code: 'EEXIST' }));
    expect(journal.read()).toEqual(intent);

    journal.write({ ...intent, txid: 'tx-123' });
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ txid: 'tx-123' });

    journal.clear();
    expect(journal.exists()).toBe(false);
  });

  it('does not overwrite an unrecognized legacy journal', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'doge-send-core-'));
    tempDirectories.push(directory);
    const path = join(directory, '.doge-send-journal.json');
    writeFileSync(path, 'legacy-or-corrupt-journal', { mode: 0o600 });
    const journal = createFileJournal(path);
    const runCli = makeRunCli();

    await expect(executeSendPlan(makePlan(), {
      runCli,
      dryRun: false,
      journal,
    })).rejects.toMatchObject({ code: DOGE_SEND_ERROR.JOURNAL_EXISTS });

    expect(readFileSync(path, 'utf8')).toBe('legacy-or-corrupt-journal');
    expect(runCli).not.toHaveBeenCalled();
  });
});

describe('doge-send wrapper portability', () => {
  it('uses a configurable portable CLI binary without an executable suffix assumption', () => {
    const source = readFileSync(resolve('tools/doge-send.mjs'), 'utf8');

    expect(source).toContain('process.env.DOGE_CLI');
    expect(source).toContain('process.env.DOGECOIN_CLI');
    expect(source).toContain("|| 'dogecoin-cli'");
    expect(source).not.toMatch(/dogecoin-cli\.exe/i);
  });

  it('never prints the shared crash journal contents', () => {
    const source = readFileSync(resolve('tools/doge-send.mjs'), 'utf8');

    expect(source).toContain('contents withheld from logs');
    expect(source).not.toMatch(/console\.(?:log|error)\([^\n]*journalText/);
  });

  it('hands payout-agent journals back without legacy recovery instructions', () => {
    const directory = mkdtempSync(join(tmpdir(), 'doge-send-wrapper-'));
    tempDirectories.push(directory);
    const sentinel = 'claim-token-must-never-reach-stderr';
    writeFileSync(join(directory, '.doge-send-journal.json'), JSON.stringify({
      kind: 'apstats-doge-payout',
      claim_token: sentinel,
      txid: VALID_TXID,
    }), { mode: 0o600 });

    const result = spawnSync(
      process.execPath,
      [resolve('tools/doge-send.mjs'), '--send'],
      {
        cwd: directory,
        encoding: 'utf8',
        env: { ...process.env, TEACHER_SECRET: 'test-only' },
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('belongs to the DOGE payout agent');
    expect(result.stderr).toContain(VALID_TXID);
    expect(result.stderr).not.toContain(sentinel);
    expect(result.stderr).not.toContain('mark-sent');
    expect(result.stderr).not.toContain('delete .doge-send-journal.json');
    expect(readFileSync(join(directory, '.doge-send-journal.json'), 'utf8'))
      .toContain(sentinel);
  });
});
