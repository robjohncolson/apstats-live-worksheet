// doge-send.test.js — the Phase-3 batch sender's PURE planning logic
// (tools/doge-send.mjs planSends). The node broadcast + roster I/O are live-only;
// this pins the plan: who gets paid, how much, aggregation, caps, and that kids
// without a registered address are surfaced as skips (never silently dropped).

import { describe, it, expect } from 'vitest';
import { planSends } from '../tools/doge-send.mjs';

const acc = (studentId, dogeToDeposit, dogeAddress = null) => ({ studentId, dogeToDeposit, dogeAddress });

describe('doge-send — planSends', () => {
  it('plans a recipient per kid with DOGE owed + an address', () => {
    const p = planSends([acc('s1', 10.5, 'Dabc'), acc('s2', 2.25, 'Ddef')]);
    expect(p.sendable.map((r) => r.studentId).sort()).toEqual(['s1', 's2']);
    expect(p.outputs).toEqual({ Dabc: 10.5, Ddef: 2.25 });
    expect(p.total).toBeCloseTo(12.75, 8);
  });

  it('skips kids with no registered address (surfaced, not dropped)', () => {
    const p = planSends([acc('s1', 10, 'Dabc'), acc('s2', 5, null)]);
    expect(p.sendable.map((r) => r.studentId)).toEqual(['s1']);
    const skipped = p.recipients.find((r) => r.studentId === 's2');
    expect(skipped.skip).toMatch(/no address/);
    expect(skipped.amount).toBe(5);     // still reported so the teacher knows to set it
  });

  it('ignores zero / negative owed', () => {
    const p = planSends([acc('s1', 0, 'Dabc'), acc('s2', -3, 'Ddef'), acc('s3', 4, 'Dghi')]);
    expect(p.sendable.map((r) => r.studentId)).toEqual(['s3']);
    expect(p.total).toBe(4);
  });

  it('aggregates multiple recipients sharing one address into a single output', () => {
    const p = planSends([acc('s1', 3, 'Dsame'), acc('s2', 7, 'Dsame')]);
    expect(p.outputs).toEqual({ Dsame: 10 });
    expect(p.sendable.length).toBe(2);   // two recipients, one output line
  });

  it('caps each deposit with maxPerKid', () => {
    const p = planSends([acc('s1', 100, 'Dabc'), acc('s2', 3, 'Ddef')], { maxPerKid: 5 });
    expect(p.outputs).toEqual({ Dabc: 5, Ddef: 3 });
    expect(p.total).toBe(8);
  });

  it('rounds amounts to 8 dp (DOGE precision)', () => {
    const p = planSends([acc('s1', 1 / 3, 'Dabc')]);
    expect(p.outputs.Dabc).toBe(0.33333333);
    expect(p.total).toBe(0.33333333);
  });

  it('empty / missing accounts → nothing to send', () => {
    expect(planSends([]).sendable).toEqual([]);
    expect(planSends(undefined).total).toBe(0);
  });
});
