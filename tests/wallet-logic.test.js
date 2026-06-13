import { describe, it, expect, beforeAll } from 'vitest';

let WalletLogic;

beforeAll(async () => {
  await import('../js/wallet_logic.js');
  WalletLogic = globalThis.WalletLogic;
});

function todayAt(hour) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

describe('wallet_logic.js', () => {
  it('dedups points by source and item', () => {
    const points = WalletLogic.computePoints([
      { src: 'worksheet', i: 'W1', ts: todayAt(9) },
      { src: 'worksheet', i: 'W1', ts: todayAt(10) }
    ]);

    expect(points.total).toBe(3);
    expect(points.today).toBe(3);
  });

  it('keeps points only-up when duplicate work is repeated', () => {
    const first = WalletLogic.computePoints([{ src: 'frq', i: 'FRQ-1', ts: todayAt(8) }]);
    const repeated = WalletLogic.computePoints([
      { src: 'frq', i: 'FRQ-1', ts: todayAt(8) },
      { src: 'frq', i: 'FRQ-1', ts: todayAt(9) }
    ]);
    const added = WalletLogic.computePoints([
      { src: 'frq', i: 'FRQ-1', ts: todayAt(8) },
      { src: 'trainer', i: 'T-1', ts: todayAt(9) }
    ]);

    expect(repeated.total).toBe(first.total);
    expect(added.total).toBeGreaterThan(first.total);
  });

  it('does not award points for evidence-only quiz receipts', () => {
    expect(WalletLogic.pointsFor('quiz_verdict', 'Q1')).toBe(0);
    expect(WalletLogic.pointsFor('quiz_answer', 'Q1-A1')).toBe(0);
  });

  it('counts flashcard desk-done receipts as four points', () => {
    expect(WalletLogic.pointsFor('worksheet', 'BL-abc-DESK_DONE')).toBe(4);
  });

  it('computes today delta from local midnight', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(23, 0, 0, 0);

    const points = WalletLogic.computePoints([
      { src: 'worksheet', i: 'old', ts: yesterday.getTime() },
      { src: 'trainer', i: 'new', ts: todayAt(1) }
    ]);

    expect(points.total).toBe(4);
    expect(points.today).toBe(1);
  });

  it('merges receipts by id, then compact, with durable rows winning timestamps', () => {
    const durable = [
      { id: 'same-id', compact: 'payload.sig', ts: 200 },
      { id: 'durable-only', compact: 'durable.sig', ts: 300 }
    ];
    const local = [
      { id: 'same-id', compact: 'payload.sig', ts: 999 },
      { id: 'local-dup-compact', compact: 'durable.sig', ts: 400 },
      { id: 'local-only', compact: 'local.sig', ts: 100 }
    ];

    const merged = WalletLogic.mergeReceipts(durable, local);

    expect(merged).toEqual([
      { id: 'durable-only', compact: 'durable.sig', ts: 300 },
      { id: 'same-id', compact: 'payload.sig', ts: 200 },
      { id: 'local-only', compact: 'local.sig', ts: 100 }
    ]);
  });
});
