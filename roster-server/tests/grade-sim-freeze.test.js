// grade-sim-freeze.test.js — the simulator invariants in the quarter-end zero freeze
// regime (QUARTER_ZERO_FREEZE_SPEC.md, teacher 2026-11-06). The other sim suites run as
// of 09-20 and 09-12, inside an open quarter, where the freeze is a no-op. Here the sim
// world's Q1 ends Fri 09-25 and the clock reads Mon 10-05, with the live due rules
// (zero date = class day + 13, a 0 only after that day ends):
//
//   1.1 (zero 09-22), 1.2 (zero 09-24)            due by the close: a 0 when missing
//   1.3 (09-29), 1.4 + 1.5 (10-01), 2.1 (10-14)   LATE: never a 0; their scores join a
//                                                 track only where they help
//   2.2 (undated), 2.9 (class day 11-01)          not taught yet
//
// Shipped policy: not-until-due + F1-B + F3, as in grade-sim-fixes.test.js.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { computeGrade } from '../grade.js';
import { CONFIG, QUARTER_KEY, ANSWER_KEY, GRADE_OPTS, ATOMS, materialize } from './fixtures/sim-world.js';

const EPS = 0.05;
const NUM_RUNS = 400;

const AFTER_END = { ...GRADE_OPTS, asOf: '2026-10-05T12:00:00-04:00' };
const FREEZE = {
  ...CONFIG,
  v3FixQuizZero: true,
  v3FixCwsReveal: true,
  v3AheadOfScheduleLessons: 'not-until-due',
  v3LessonsByDate: true,
  dueLagDays: 13,
  dueAfterLessonDay: true,
  zeroFreezeAtQuarterEnd: true,
  quarters: { Q1: { ...CONFIG.quarters.Q1, end: '2026-09-25' } },
};
const NO_FREEZE = { ...FREEZE, zeroFreezeAtQuarterEnd: false };

function gradeWith(plan, config = FREEZE) {
  return computeGrade(materialize(plan), ANSWER_KEY, config, AFTER_END).quarters[QUARTER_KEY];
}

const DUE_TOPICS = new Set(['1.1', '1.2']);
const LATE_TOPICS = new Set(['1.3', '1.4', '1.5', '2.1']);
const backs = (atom, topics) => atom.backingTopics.length > 0 && atom.backingTopics.every((t) => topics.has(t));
const isDueAtom = (atom) => atom.kind !== 'pc' && backs(atom, DUE_TOPICS);
const isLateAtom = (atom) => atom.kind !== 'pc' && backs(atom, LATE_TOPICS);
// A late item whose first score can only help. A reflection is left out on purpose: adding
// one can lower its own lesson, due or late (the FRQ feeder joins at its band value).
const isAddableLateAtom = (atom) => isLateAtom(atom) && atom.kind !== 'frq';

const valueArb = fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: null });
const planArb = fc.tuple(...ATOMS.map(() => valueArb))
  .map((vals) => new Map(ATOMS.map((a, i) => [a.id, vals[i]])));

describe('the sim world after its quarter ends (freeze regime)', () => {
  it('has the late lessons the header describes', () => {
    expect(ATOMS.some(isLateAtom)).toBe(true);
    expect(ATOMS.filter((a) => a.kind === 'quiz' && isLateAtom(a)).length).toBeGreaterThan(0);
    expect(ATOMS.filter((a) => a.kind === 'quiz' && isDueAtom(a)).length).toBeGreaterThan(0);
    // Nothing done at all: only the due lessons are zeros, so the freeze grade beats the legacy one.
    const empty = new Map(ATOMS.map((a) => [a.id, null]));
    const plan = new Map(empty);
    for (const a of ATOMS) if (isDueAtom(a)) plan.set(a.id, 1);
    expect(gradeWith(plan).workAvg).toBeGreaterThan(gradeWith(plan, NO_FREEZE).workAvg);
  });

  it('A1: every output stays in [0, 100]', () => {
    fc.assert(fc.property(planArb, (plan) => {
      const q = gradeWith(plan);
      for (const k of ['quarterGrade', 'ceiling', 'pcAvg', 'workAvg']) {
        if (q[k] == null) continue;
        expect(q[k]).toBeGreaterThanOrEqual(0);
        expect(q[k]).toBeLessThanOrEqual(100 + EPS);
      }
    }), { numRuns: NUM_RUNS, seed: 20261106 });
  });

  it('A2: ceiling >= quarterGrade', () => {
    fc.assert(fc.property(planArb, (plan) => {
      const q = gradeWith(plan);
      if (q.ceiling != null && q.quarterGrade != null) {
        expect(q.ceiling).toBeGreaterThanOrEqual(q.quarterGrade - EPS);
      }
    }), { numRuns: NUM_RUNS, seed: 20261107 });
  });

  it('A3: raising any present item (due or late) never lowers the grade', () => {
    fc.assert(fc.property(planArb, fc.nat(), (plan, pick) => {
      const before = gradeWith(plan);
      if (before.quarterGrade == null) return;
      const raisable = [...plan.entries()].filter(([, v]) => v != null && v < 1);
      if (raisable.length === 0) return;
      const [id] = raisable[pick % raisable.length];
      const lifted = new Map(plan);
      lifted.set(id, 1.0);
      expect(gradeWith(lifted).quarterGrade).toBeGreaterThanOrEqual(before.quarterGrade - EPS);
    }), { numRuns: NUM_RUNS, seed: 20261108 });
  });

  it('A6: attempting a due quiz never lowers the grade vs leaving it blank', () => {
    fc.assert(fc.property(planArb, fc.nat(), (plan, pick) => {
      const blankDue = new Map(plan);
      for (const a of ATOMS) if (a.kind === 'quiz' && isDueAtom(a)) blankDue.set(a.id, null);
      const before = gradeWith(blankDue);
      if (before.quarterGrade == null) return;
      const quizzes = ATOMS.filter((a) => a.kind === 'quiz' && isDueAtom(a));
      const attempted = new Map(blankDue);
      attempted.set(quizzes[pick % quizzes.length].id, 0);
      expect(gradeWith(attempted).quarterGrade).toBeGreaterThanOrEqual(before.quarterGrade - EPS);
    }), { numRuns: NUM_RUNS, seed: 20261109 });
  });

  it('late work only helps: a first late blank, quiz answer or deck score never lowers the grade', () => {
    fc.assert(fc.property(planArb, fc.nat(), fc.double({ min: 0, max: 1, noNaN: true }), (plan, pick, value) => {
      const open = ATOMS.filter((a) => isAddableLateAtom(a) && plan.get(a.id) == null);
      if (open.length === 0) return;
      const before = gradeWith(plan);
      const added = new Map(plan);
      added.set(open[pick % open.length].id, value);
      const after = gradeWith(added);
      if (before.quarterGrade == null) return;
      expect(after.quarterGrade).toBeGreaterThanOrEqual(before.quarterGrade - EPS);
      expect(after.workAvg).toBeGreaterThanOrEqual(before.workAvg - EPS);
    }), { numRuns: NUM_RUNS, seed: 20261110 });
  });

  it('the freeze never lowers a grade compared with the legacy rule on the same day', () => {
    fc.assert(fc.property(planArb, (plan) => {
      const frozen = gradeWith(plan);
      const legacy = gradeWith(plan, NO_FREEZE);
      if (legacy.quarterGrade == null) return;
      expect(frozen.quarterGrade).toBeGreaterThanOrEqual(legacy.quarterGrade - EPS);
    }), { numRuns: NUM_RUNS, seed: 20261111 });
  });
});
