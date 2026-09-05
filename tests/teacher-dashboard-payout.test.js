// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';

const dashboard = readFileSync(resolve(__dirname, '../teacher-dashboard.html'), 'utf8');
const payoutStart = dashboard.indexOf('    var _payoutBatch = null;');
const payoutEnd = dashboard.indexOf("    $('payout-plan-btn').addEventListener");
if (payoutStart < 0 || payoutEnd < payoutStart) {
  throw new Error('Dashboard payout script was not found');
}
const payoutScript = dashboard.slice(payoutStart, payoutEnd);
const NOW = new Date('2026-09-05T19:48:08.000Z');
const TXID = 'a'.repeat(64);

function createDashboard(batch) {
  document.body.innerHTML = `
    <button id="payout-plan-btn"></button>
    <span id="payout-status"></span>
    <button data-payout-manual-sent>Mark sent</button>
  `;
  const fetchJson = vi.fn().mockResolvedValue({
    status: 200,
    data: { ok: true, batch },
  });
  const context = createContext({
    document,
    Date,
    setTimeout,
    clearTimeout,
    $: (id) => document.getElementById(id),
    fetchJson,
    teacherSecret: () => 'test-only',
    _fetchRewardWallets: vi.fn().mockResolvedValue({}),
    _rewardWallets: null,
    _rewardRepaint: null,
  });
  runInContext(payoutScript, context);
  context._payoutLocalTotal = 37;
  context._payoutLocalCount = 2;
  return {
    context,
    fetchJson,
    status: document.getElementById('payout-status'),
    deposit: document.getElementById('payout-plan-btn'),
    manual: document.querySelector('[data-payout-manual-sent]'),
  };
}

describe('dashboard payout progress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('shows preparation after claiming without suggesting a broadcast', async () => {
    const page = createDashboard({ status: 'claimed', claimedAt: NOW.toISOString() });
    await page.context._payoutRefreshStatus();

    expect(page.status.textContent).toBe('Payout agent is preparing the deposit…');
    expect(page.deposit.disabled).toBe(true);
    expect(page.manual.disabled).toBe(true);
    expect(page.status.querySelector('button')).toBeNull();
  });

  it('waits for the send result after arming, without claiming success', async () => {
    const page = createDashboard({ status: 'claimed', broadcastAt: NOW.toISOString() });
    await page.context._payoutRefreshStatus();

    expect(page.status.textContent).toBe('Awaiting the node’s send result…');
    expect(page.deposit.disabled).toBe(true);
    expect(page.manual.disabled).toBe(true);
    expect(page.status.querySelector('a')).toBeNull();
  });

  it('turns prolonged armed state into a review message while preserving duplicate-send guards', async () => {
    const page = createDashboard({ status: 'claimed', broadcastAt: NOW.toISOString() });
    await page.context._payoutRefreshStatus();
    await vi.advanceTimersByTimeAsync(120000);

    expect(page.status.textContent).toBe(
      'Payout delayed — send outcome is unknown. Check the payout agent logs.',
    );
    expect(page.context._payoutBatch.status).toBe('claimed');
    expect(page.deposit.disabled).toBe(true);
    expect(page.manual.disabled).toBe(true);
    expect(page.status.querySelector('button')).toBeNull();
    expect(page.fetchJson.mock.calls.every(([path]) => path === '/payout/status')).toBe(true);
  });

  it.each(['invalid-date', '2026-09-05T20:48:08.000Z'])(
    'does not invent a delay from an invalid or future arm timestamp: %s',
    async (broadcastAt) => {
      const page = createDashboard({ status: 'claimed', broadcastAt });
      await page.context._payoutRefreshStatus();

      expect(page.status.textContent).toBe('Awaiting the node’s send result…');
      expect(page.deposit.disabled).toBe(true);
    },
  );

  it('shows balance reconciliation when a transaction is recorded, even after a delay', async () => {
    const page = createDashboard({
      status: 'claimed',
      broadcastAt: '2026-09-05T18:00:00.000Z',
      txid: TXID,
    });
    await page.context._payoutRefreshStatus();

    expect(page.status.textContent).toBe('Transaction recorded — updating student balances…');
    expect(page.deposit.disabled).toBe(true);
    expect(page.manual.disabled).toBe(true);
  });

  it('keeps a malformed txid in the unresolved send state', async () => {
    const page = createDashboard({
      status: 'claimed',
      broadcastAt: NOW.toISOString(),
      txid: 'not-a-transaction',
    });
    await page.context._payoutRefreshStatus();

    expect(page.status.textContent).toBe('Awaiting the node’s send result…');
    expect(page.status.querySelector('a')).toBeNull();
    expect(page.deposit.disabled).toBe(true);
  });

  it('shows the transaction link and releases controls after server completion', async () => {
    const page = createDashboard({ status: 'sent', batchId: 'completed-batch', txid: TXID });
    await page.context._payoutRefreshStatus();

    expect(page.status.textContent).toContain('sent');
    expect(page.status.querySelector('a').href).toBe(
      'https://blockchair.com/dogecoin/transaction/' + TXID,
    );
    expect(page.deposit.disabled).toBe(false);
    expect(page.manual.disabled).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('allows replanning only after a confirmed failure', async () => {
    const page = createDashboard({ status: 'failed', error: 'insufficient float' });
    await page.context._payoutRefreshStatus();

    expect(page.status.textContent).toContain('failed: insufficient float');
    expect(page.status.querySelector('button').textContent).toBe('Retry');
    expect(page.deposit.disabled).toBe(false);
    expect(page.manual.disabled).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves cancellation while a batch is still pending', async () => {
    const page = createDashboard({ status: 'pending' });
    await page.context._payoutRefreshStatus();

    expect(page.status.textContent).toContain('waiting for the payout agent');
    expect(page.status.querySelector('button').textContent).toBe('Cancel & use manual');
    expect(page.deposit.disabled).toBe(true);
    expect(page.manual.disabled).toBe(true);
  });
});
