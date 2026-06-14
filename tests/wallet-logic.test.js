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

  it('reports nodue when nothing is due', () => {
    expect(WalletLogic.walletReadiness({ lessonsDue: 0 })).toMatchObject({
      state: 'nodue',
      r: null,
      hue: null
    });
    expect(WalletLogic.walletReadiness({ lessonsDue: null })).toMatchObject({
      state: 'nodue',
      r: null,
      hue: null
    });
  });

  it('marks a below-floor work track as behind', () => {
    const readiness = WalletLogic.walletReadiness({
      workAvg: 0.2,
      pcAvg: null,
      lessonsDue: 4,
      lessonsGraded: 2
    });

    expect(readiness.state).toBe('behind');
    expect(readiness.eligible).toBe(false);
    expect(readiness.e).toBeCloseTo(0.5);
    expect(readiness.r).toBeCloseTo(0.25);
    expect(readiness.hue).toBeCloseTo(30);
  });

  it('ignores a null PC track early in a unit', () => {
    const readiness = WalletLogic.walletReadiness({
      pcAvg: null,
      workAvg: 0.5,
      lessonsDue: 2,
      lessonsGraded: 2
    });

    expect(readiness.state).toBe('caughtup');
    expect(readiness.eligible).toBe(true);
    expect(readiness.r).toBeCloseTo(1);
    expect(readiness.hue).toBeCloseTo(120);
  });

  it('uses completion after eligibility is unlocked', () => {
    const readiness = WalletLogic.walletReadiness({
      pcAvg: 0.6,
      workAvg: 0.5,
      lessonsDue: 10,
      lessonsGraded: 6
    });

    expect(readiness.state).toBe('eligible');
    expect(readiness.eligible).toBe(true);
    expect(readiness.completion).toBeCloseTo(0.6);
    expect(readiness.r).toBeCloseTo(0.8);
  });

  it('gates below-floor readiness by the minimum present track', () => {
    const readiness = WalletLogic.walletReadiness({
      pcAvg: 0.3,
      workAvg: 0.5,
      lessonsDue: 4,
      lessonsGraded: 4
    });

    expect(readiness.state).toBe('behind');
    expect(readiness.e).toBeCloseTo(0.75);
    expect(readiness.r).toBeCloseTo(0.375);
  });

  it('is green when all due work is graded and tracks are eligible', () => {
    const readiness = WalletLogic.walletReadiness({
      pcAvg: 0.4,
      workAvg: 0.8,
      lessonsDue: 3,
      lessonsGraded: 3
    });

    expect(readiness.state).toBe('caughtup');
    expect(readiness.r).toBeCloseTo(1);
    expect(readiness.hue).toBeCloseTo(120);
  });

  it('clamps track progress and completion into the readiness range', () => {
    const behind = WalletLogic.walletReadiness({
      pcAvg: -0.2,
      workAvg: 0.5,
      lessonsDue: 4,
      lessonsGraded: -1
    });
    const overComplete = WalletLogic.walletReadiness({
      pcAvg: 2,
      workAvg: 0.5,
      lessonsDue: 4,
      lessonsGraded: 9
    });

    expect(behind.r).toBeCloseTo(0);
    expect(behind.hue).toBeCloseTo(0);
    expect(overComplete.r).toBeCloseTo(1);
    expect(overComplete.hue).toBeCloseTo(120);
  });

  it('reports neutral summer readiness when nothing is due or done', () => {
    const readiness = WalletLogic.summerReadiness({
      lessons: [
        { topic: '1.1', due: '2026-06-23' },
        { topic: '1.2', due: '2026-06-30' }
      ]
    }, '2026-06-16', 0, null, 2);

    expect(readiness).toMatchObject({
      state: 'notdue',
      resting: false,
      r: null,
      hue: null,
      total: 2,
      actual: 0,
      deadlineExpected: 0,
      behind: 0
    });
  });

  it('shows catching up when behind and completed today', () => {
    const readiness = WalletLogic.summerReadiness({
      behindGraceDays: 1,
      lessons: [
        { topic: '1.1', due: '2026-06-23' },
        { topic: '1.2', due: '2026-06-30' },
        { topic: '1.3', due: '2026-07-07' },
        { topic: '1.4', due: '2026-07-14' },
        { topic: '1.5', due: '2026-07-21' }
      ]
    }, '2026-07-14', 1, '2026-07-14', 2);

    expect(readiness.state).toBe('catchingup');
    expect(readiness.resting).toBe(true);
    expect(readiness.r).toBe(null);
    expect(readiness.hue).toBe(210);
    expect(readiness.deadlineExpected).toBe(4);
    expect(readiness.behind).toBe(3);
    expect(readiness.daysSinceLast).toBe(0);
  });

  it('keeps summer readiness behind when last completion is outside grace', () => {
    const readiness = WalletLogic.summerReadiness({
      behindGraceDays: 1,
      lessons: [
        { topic: '1.1', due: '2026-06-23' },
        { topic: '1.2', due: '2026-06-30' },
        { topic: '1.3', due: '2026-07-07' },
        { topic: '1.4', due: '2026-07-14' },
        { topic: '1.5', due: '2026-07-21' }
      ]
    }, '2026-07-14', 1, '2026-07-11', 2);

    expect(readiness.state).toBe('behind');
    expect(readiness.resting).toBe(false);
    expect(readiness.r).toBeCloseTo(0.25);
    expect(readiness.hue).toBeCloseTo(30);
    expect(readiness.deadlineExpected).toBe(4);
    expect(readiness.behind).toBe(3);
    expect(readiness.daysSinceLast).toBe(3);
  });

  it('rests in green when on pace and completed today', () => {
    const readiness = WalletLogic.summerReadiness({
      lessons: [
        { topic: '1.1', due: '2026-06-23' },
        { topic: '1.2', due: '2026-06-30' },
        { topic: '1.3', due: '2026-07-07' },
        { topic: '1.4', due: '2026-07-14' }
      ]
    }, '2026-07-07', 3, '2026-07-07', 2);

    expect(readiness.state).toBe('resting');
    expect(readiness.resting).toBe(true);
    expect(readiness.r).toBeCloseTo(1);
    expect(readiness.actual).toBe(3);
    expect(readiness.deadlineExpected).toBe(3);
    expect(readiness.daysSinceLast).toBe(0);
  });

  it('nudges ready from green toward yellow after the rest window', () => {
    const readiness = WalletLogic.summerReadiness({
      lessons: [
        { topic: '1.1', due: '2026-06-23' },
        { topic: '1.2', due: '2026-06-30' },
        { topic: '1.3', due: '2026-07-07' },
        { topic: '1.4', due: '2026-07-14' }
      ]
    }, '2026-07-07', 3, '2026-07-02', 2);

    expect(readiness.state).toBe('ready');
    expect(readiness.resting).toBe(false);
    expect(readiness.r).toBeGreaterThan(0.5);
    expect(readiness.r).toBeLessThan(1);
    expect(readiness.hue).toBeGreaterThan(60);
    expect(readiness.hue).toBeLessThan(120);
    expect(readiness.daysSinceLast).toBe(5);
  });

  it('defaults summer rest days from the schedule', () => {
    const readiness = WalletLogic.summerReadiness({
      restDays: 2,
      lessons: [
        { topic: '1.1', due: '2026-06-23' },
        { topic: '1.2', due: '2026-06-30' },
        { topic: '1.3', due: '2026-07-07' }
      ]
    }, '2026-06-30', 2, '2026-06-28');

    expect(readiness.state).toBe('resting');
    expect(readiness.r).toBeCloseTo(1);
    expect(readiness.restDays).toBe(2);
  });

  it('reports summer readiness all done', () => {
    const readiness = WalletLogic.summerReadiness({
      lessons: [
        { topic: '1.1', due: '2026-06-23' },
        { topic: '1.2', due: '2026-06-30' },
        { topic: '1.3', due: '2026-07-07' }
      ]
    }, '2026-08-25', 3, '2026-08-25', 2);

    expect(readiness.state).toBe('done');
    expect(readiness.resting).toBe(false);
    expect(readiness.r).toBeCloseTo(1);
    expect(readiness.hue).toBeCloseTo(120);
    expect(readiness.total).toBe(3);
    expect(readiness.actual).toBe(3);
    expect(readiness.deadlineExpected).toBe(3);
    expect(readiness.behind).toBe(0);
  });
});
