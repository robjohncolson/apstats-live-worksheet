// trainer-grade.test.js — the TI-84 trainer strand (TI84_GRADE_INTEGRATION_SPEC.md):
// computeLessonGrades bucketing TI84-<procedureId> rows through the lesson map,
// the per-lesson trainer pct (mean over mapped procedures, missing=0), the
// computeQuarterV3 trainer track (visible always, counted only when
// config.trainer.weight > 0), and — LOAD-BEARING — the weight-0 grade-invariance
// proof: trainer rows present vs absent produce identical workAvg/quarterGrade.
// Mirrors blooket.test.js. NO network, NO server, NO I/O.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import {
  computeLessonGrades,
  computeQuarterV3,
  buildLessonsArray,
} from '../lesson-grade.js';
import { computeGrade } from '../grade.js';

const FRQ_BAND = { E: 100, P: 75, I: 25 };

// One solo-proc topic (1.5 histogram) + one two-proc topic (1.7).
const TRAINER_MAP = {
  '1.5': ['histogram'],
  '1.7': ['one-var-stats', 'modified-boxplot'],
};

const SCHEDULE = {
  '1.5': { unit: 1, topicKey: '1.5', worksheetKey: '5', periods: { B: '2026-09-09', E: '2026-09-09' } },
  '1.7': { unit: 1, topicKey: '1.7', worksheetKey: '7', periods: { B: '2026-09-11', E: '2026-09-11' } },
};

function trainerRow(procId, score, extra = {}) {
  return {
    item_id: `TI84-${procId}`,
    source: 'trainer',
    score,
    response: { procedureId: procId },
    attempt: 1,
    recorded_at: '2026-09-10T00:00:00Z',
    ...extra,
  };
}

// ── computeLessonGrades — trainer bucketing via the lesson map ─────────────────

describe('computeLessonGrades — trainer attachment', () => {
  it('a trainer row lands on its mapped topic as 0..100', () => {
    const map = computeLessonGrades([trainerRow('histogram', 0.8)], FRQ_BAND, {}, SCHEDULE, { trainerMap: TRAINER_MAP });
    expect(map.get('1.5').trainer).toBe(80);
  });

  it('multi-procedure topic: mean over MAPPED procedures, missing counts 0', () => {
    // 1.7 maps two procedures; only one-var-stats (1.0) was practiced → 50%.
    const map = computeLessonGrades([trainerRow('one-var-stats', 1)], FRQ_BAND, {}, SCHEDULE, { trainerMap: TRAINER_MAP });
    expect(map.get('1.7').trainer).toBe(50);
  });

  it('both procedures done → mean of both', () => {
    const map = computeLessonGrades(
      [trainerRow('one-var-stats', 1), trainerRow('modified-boxplot', 0.6)],
      FRQ_BAND, {}, SCHEDULE, { trainerMap: TRAINER_MAP },
    );
    expect(map.get('1.7').trainer).toBe(80);
  });

  it('best-wins across duplicate rows for the same procedure', () => {
    const map = computeLessonGrades(
      [trainerRow('histogram', 0.4), trainerRow('histogram', 0.9), trainerRow('histogram', 0.2)],
      FRQ_BAND, {}, SCHEDULE, { trainerMap: TRAINER_MAP },
    );
    expect(map.get('1.5').trainer).toBe(90);
  });

  it('scores clamp into [0,1] before the pct', () => {
    const hi = computeLessonGrades([trainerRow('histogram', 1.5)], FRQ_BAND, {}, SCHEDULE, { trainerMap: TRAINER_MAP });
    expect(hi.get('1.5').trainer).toBe(100);
    const lo = computeLessonGrades([trainerRow('histogram', -0.3)], FRQ_BAND, {}, SCHEDULE, { trainerMap: TRAINER_MAP });
    expect(lo.get('1.5').trainer).toBe(0);
  });

  it('null/blank/non-numeric scores are ignored (no spurious 0, no accumulator)', () => {
    for (const bad of [null, undefined, '', 'oops']) {
      const map = computeLessonGrades([trainerRow('histogram', bad)], FRQ_BAND, {}, SCHEDULE, { trainerMap: TRAINER_MAP });
      expect(map.has('1.5')).toBe(false);
    }
  });

  it('unmapped procedures (smoke probes) are ignored entirely', () => {
    const map = computeLessonGrades(
      [trainerRow('SMOKE-0016', 1), trainerRow('not-a-real-proc', 1)],
      FRQ_BAND, {}, SCHEDULE, { trainerMap: TRAINER_MAP },
    );
    expect(map.size).toBe(0);
  });

  it('a TI84- itemId with a NON-trainer source is ignored (source-gated)', () => {
    const map = computeLessonGrades(
      [trainerRow('histogram', 1, { source: 'worksheet' })],
      FRQ_BAND, {}, SCHEDULE, { trainerMap: TRAINER_MAP },
    );
    expect(map.has('1.5')).toBe(false);
  });

  it('without a trainerMap, trainer rows are ignored (pre-strand behavior)', () => {
    const map = computeLessonGrades([trainerRow('histogram', 0.8)], FRQ_BAND, {}, SCHEDULE, {});
    expect(map.has('1.5')).toBe(false);
  });

  it('a topic the student never touched stays trainer=null (no evidence ≠ 0)', () => {
    const map = computeLessonGrades([trainerRow('histogram', 0.8)], FRQ_BAND, {}, SCHEDULE, { trainerMap: TRAINER_MAP });
    expect(map.has('1.7')).toBe(false);
  });
});

// ── buildLessonsArray — per-lesson display fields ──────────────────────────────

describe('buildLessonsArray — trainer + hasTrainer', () => {
  it('carries trainer pct and hasTrainer into lessons[]', () => {
    const map = computeLessonGrades([trainerRow('histogram', 0.8)], FRQ_BAND, {}, SCHEDULE, { trainerMap: TRAINER_MAP });
    const lessons = buildLessonsArray(map, SCHEDULE, undefined, null, {}, [], Object.keys(TRAINER_MAP));
    const l15 = lessons.find((l) => l.lessonKey === '1.5');
    const l17 = lessons.find((l) => l.lessonKey === '1.7');
    expect(l15.trainer).toBe(80);
    expect(l15.hasTrainer).toBe(true);
    expect(l17.trainer).toBe(null);
    expect(l17.hasTrainer).toBe(true);
  });

  it('an unmapped lesson has hasTrainer=false, trainer=null', () => {
    const schedule = { ...SCHEDULE, '1.1': { unit: 1, worksheetKey: '1', periods: { B: '2026-09-09', E: '2026-09-09' } } };
    const lessons = buildLessonsArray(new Map(), schedule, undefined, null, {}, [], Object.keys(TRAINER_MAP));
    const l11 = lessons.find((l) => l.lessonKey === '1.1');
    expect(l11.hasTrainer).toBe(false);
    expect(l11.trainer).toBe(null);
  });
});

// ── computeQuarterV3 — the trainer track ───────────────────────────────────────

const CFG = {
  C: 85,
  lessonFeederWeights: { ws: 1, W: 2, Q: 3 },
  v3LessonsExcludeQuiz: true,
  useV3: true,
  quarters: {
    Q1: { units: [1], start: '2026-09-01', end: '2026-11-30', pcAnchor: { p85: 40, p100: 60 } },
  },
};

function lessonMapOf(obj) {
  return new Map(Object.entries(obj));
}

describe('computeQuarterV3 — trainer track (visible-but-uncounted by default)', () => {
  const schedule = SCHEDULE;

  it('LOAD-BEARING INVARIANCE: at weight 0, trainer data changes NO grade number', () => {
    const withTrainer = computeQuarterV3({
      quarterKey: 'Q1', config: CFG,
      lessonMap: lessonMapOf({
        '1.5': { Cws: 80, W: null, Q: 60, lessonGrade: 80, blooket: null, trainer: 100 },
        '1.7': { Cws: 80, W: null, Q: 60, lessonGrade: 80, blooket: null, trainer: 40 },
      }),
      schedule, todayDateStr: '2026-09-20', section: 'PeriodB', unitPcData: {},
      trainerLessons: Object.keys(TRAINER_MAP),
    });
    const withoutTrainer = computeQuarterV3({
      quarterKey: 'Q1', config: CFG,
      lessonMap: lessonMapOf({
        '1.5': { Cws: 80, W: null, Q: 60, lessonGrade: 80, blooket: null, trainer: null },
        '1.7': { Cws: 80, W: null, Q: 60, lessonGrade: 80, blooket: null, trainer: null },
      }),
      schedule, todayDateStr: '2026-09-20', section: 'PeriodB', unitPcData: {},
    });

    expect(withTrainer.workAvg).toBe(withoutTrainer.workAvg);
    expect(withTrainer.workAvgRaw).toBe(withoutTrainer.workAvgRaw);
    expect(withTrainer.quarterGrade).toBe(withoutTrainer.quarterGrade);
    expect(withTrainer.ceiling).toBe(withoutTrainer.ceiling);
    // …while the trainer surface is fully visible:
    expect(withTrainer.workTracks.trainer).toBeCloseTo(70, 1); // mean(100, 40)
    expect(withTrainer.trainerDue).toBe(2);
    expect(withTrainer.trainerDone).toBe(2);
  });

  it('missing-but-due trainer lesson counts 0 in the visible track', () => {
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG,
      lessonMap: lessonMapOf({
        '1.5': { Cws: 100, W: null, Q: 100, lessonGrade: 100, blooket: null, trainer: 80 },
        '1.7': { Cws: 100, W: null, Q: 100, lessonGrade: 100, blooket: null, trainer: null },
      }),
      schedule, todayDateStr: '2026-09-20', section: 'PeriodB', unitPcData: {},
      trainerLessons: Object.keys(TRAINER_MAP),
    });
    expect(r.workTracks.trainer).toBeCloseTo(40, 1); // (80 + 0) / 2
    expect(r.trainerDue).toBe(2);
    expect(r.trainerDone).toBe(1);
    expect(r.trainerTodo).toEqual(['1.7']);
  });

  it('a due lesson with NO mapped skills never enters the denominator', () => {
    const wideSchedule = {
      ...schedule,
      '1.1': { unit: 1, worksheetKey: '1', periods: { B: '2026-09-09', E: '2026-09-09' } },
    };
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG,
      lessonMap: lessonMapOf({
        '1.5': { Cws: 100, W: null, Q: 100, lessonGrade: 100, blooket: null, trainer: 80 },
      }),
      schedule: wideSchedule, todayDateStr: '2026-09-20', section: 'PeriodB', unitPcData: {},
      trainerLessons: Object.keys(TRAINER_MAP),
    });
    expect(r.trainerDue).toBe(2); // 1.5 + 1.7, never 1.1
  });

  it('no trainerLessons → track null, due/done zeroed (back-compat)', () => {
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG,
      lessonMap: lessonMapOf({
        '1.5': { Cws: 80, W: null, Q: 60, lessonGrade: 80, blooket: null, trainer: 90 },
      }),
      schedule, todayDateStr: '2026-09-20', section: 'PeriodB', unitPcData: {},
    });
    expect(r.workTracks.trainer).toBe(null);
    expect(r.trainerDue).toBe(0);
  });

  it('ahead-of-schedule: a not-yet-due mapped lesson WITH a score counts; without one is skipped', () => {
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: CFG,
      lessonMap: lessonMapOf({
        '1.7': { Cws: null, W: null, Q: null, lessonGrade: null, blooket: null, trainer: 60 },
      }),
      schedule, todayDateStr: '2026-09-10', section: 'PeriodB', unitPcData: {},
      trainerLessons: Object.keys(TRAINER_MAP),
    });
    // 1.5 due (no score → todo/0); 1.7 not due but scored → counts.
    expect(r.trainerDue).toBe(2);
    expect(r.trainerDone).toBe(1);
    expect(r.workTracks.trainer).toBeCloseTo(30, 1); // (0 + 60) / 2
  });

  it('COUNTED MODE (config.trainer.weight > 0): trainer joins workAvg renormalization', () => {
    const cfg = { ...CFG, trainer: { weight: 0.05, doneThreshold: 80 } };
    const r = computeQuarterV3({
      quarterKey: 'Q1', config: cfg,
      lessonMap: lessonMapOf({
        '1.5': { Cws: 100, W: null, Q: 100, lessonGrade: 100, blooket: null, trainer: 100 },
        '1.7': { Cws: 100, W: null, Q: 100, lessonGrade: 100, blooket: null, trainer: 0 },
      }),
      schedule, todayDateStr: '2026-09-20', section: 'PeriodB', unitPcData: {},
      trainerLessons: Object.keys(TRAINER_MAP),
    });
    // lessons 1.0 (.30), quizzes 1.0 (.30), trainer mean(1.0, 0)=0.5 (.05):
    // (.30 + .30 + .05*.5) / .65 = .625/.65 = .961538 → 96.2
    expect(r.workAvg).toBeCloseTo(96.2, 1);
  });
});

// ── computeGrade end-to-end — the /grade response surface ──────────────────────

describe('computeGrade — trainer fields on the response', () => {
  const GRADE_CFG = {
    C: 85,
    feederWeights: { W: 1, Q: 2 },
    lessonFeederWeights: { ws: 1, W: 2, Q: 3 },
    frqBand: FRQ_BAND,
    v3LessonsExcludeQuiz: true,
    useV3: true,
    schoolTz: 'America/New_York',
    gradingWindowStart: null,
    quarters: {
      Q1: { units: [1], start: '2026-09-01', end: '2026-11-30', pcAnchor: { p85: 40, p100: 60 } },
    },
  };

  it('threads trainer through lessons[] and quarters[] (uncounted, opts.trainerMap)', () => {
    const rows = [trainerRow('histogram', 0.85)];
    const out = computeGrade(rows, {}, GRADE_CFG, {
      lessonSchedule: SCHEDULE,
      section: 'PeriodB',
      asOf: '2026-09-20T12:00:00-04:00',
      trainerMap: TRAINER_MAP,
    });

    const l15 = out.lessons.find((l) => l.lessonKey === '1.5');
    expect(l15.trainer).toBe(85);
    expect(l15.hasTrainer).toBe(true);
    expect(out.quarters.Q1.trainerDue).toBe(2);
    expect(out.quarters.Q1.trainerDone).toBe(1);
    expect(out.quarters.Q1.trainerTodo).toEqual(['1.7']);
    expect(out.quarters.Q1.workTracks.trainer).toBeCloseTo(42.5, 1); // (85+0)/2
  });

  it('INVARIANCE at the response level: trainer rows change no grade number at weight 0', () => {
    const base = [{ item_id: 'WS-U1L5-Q1', source: 'worksheet', score: 1, response: 'x', attempt: 1, recorded_at: '2026-09-10T00:00:00Z' }];
    const opts = { lessonSchedule: SCHEDULE, section: 'PeriodB', asOf: '2026-09-20T12:00:00-04:00', trainerMap: TRAINER_MAP };

    const withRows = computeGrade([...base, trainerRow('histogram', 1)], {}, GRADE_CFG, opts);
    const withoutRows = computeGrade(base, {}, GRADE_CFG, opts);

    expect(withRows.quarters.Q1.quarterGrade).toBe(withoutRows.quarters.Q1.quarterGrade);
    expect(withRows.quarters.Q1.workAvg).toBe(withoutRows.quarters.Q1.workAvg);
    expect(withRows.quarters.Q1.pcAvg).toBe(withoutRows.quarters.Q1.pcAvg);
    expect(withRows.quarters.Q1.ceiling).toBe(withoutRows.quarters.Q1.ceiling);
    expect(withRows.units).toEqual(withoutRows.units);
    // …and the evidence IS visible on the run that has it:
    expect(withRows.lessons.find((l) => l.lessonKey === '1.5').trainer).toBe(100);
  });

  it('opts.trainerMap: null disables the strand entirely', () => {
    const out = computeGrade([trainerRow('histogram', 1)], {}, GRADE_CFG, {
      lessonSchedule: SCHEDULE,
      section: 'PeriodB',
      asOf: '2026-09-20T12:00:00-04:00',
      trainerMap: null,
    });
    const l15 = out.lessons.find((l) => l.lessonKey === '1.5');
    expect(l15.trainer).toBe(null);
    expect(l15.hasTrainer).toBe(false);
    expect(out.quarters.Q1.trainerDue).toBe(0);
  });
});
