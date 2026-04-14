import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const V4_PATH = resolve(__dirname, '../.v4-logic-block.js');
const V5_PATH = resolve(__dirname, '../.v5-ladder-block.js');
const START_DAY = '2026-04-14';
const DAY_8 = '2026-04-21';
const DAY_15 = '2026-04-28';
const DAY_21 = '2026-05-04';
const DAY_22 = '2026-05-05';
const NEXT_DAY = '2026-04-15';
const THIRD_DAY = '2026-04-16';
const EXAM_DATE = '2026-05-07';

function loadApis(fakeWindow) {
  const v4Src = readFileSync(V4_PATH, 'utf8');
  const v5Src = readFileSync(V5_PATH, 'utf8');

  new Function('window', v4Src)(fakeWindow);
  fakeWindow.__studyGuideV4__.FORMULA_UNIT_MAP = { ...fakeWindow.FORMULA_UNIT_MAP };
  new Function('window', v5Src)(fakeWindow);

  return {
    v4: fakeWindow.__studyGuideV4__,
    v5: fakeWindow.__studyGuideV5__
  };
}

function makeFakeWindow(extra = {}) {
  return {
    FORMULA_UNIT_MAP: {
      mean: 1,
      'corr-r': 2,
      'binom-pmf': 4,
      'phat-sd': 5,
      'one-prop-z': 6,
      'margin-error': 6
    },
    AP_STATS_CARTRIDGE: {
      commands: [
        { id: 'mean', action: 'Mean', tier: 'core', dom: 'descriptive' },
        { id: 'corr-r', action: 'Correlation Coefficient (r)', tier: 'regular', dom: 'descriptive' },
        { id: 'binom-pmf', action: 'Binomial PMF', tier: 'core', dom: 'probability' },
        { id: 'phat-sd', action: 'Sampling Distribution SD of p-hat', tier: 'regular', dom: 'sampling' },
        { id: 'one-prop-z', action: 'One-Proportion z Test', tier: 'power', dom: 'inference' },
        { id: 'margin-error', action: 'Margin of Error', tier: 'support', dom: 'inference' }
      ]
    },
    FORMULA_PROBE_MAP: {
      map: {
        mean: { questionIds: ['U1-L1-Q01'], notes: '' },
        'corr-r': { questionIds: ['U2-L5-Q02'], notes: '' },
        'binom-pmf': { questionIds: ['U4-L8-Q01'], notes: '' },
        'phat-sd': { questionIds: ['U5-L2-Q01'], notes: '' },
        'one-prop-z': { questionIds: ['U6-L4-Q01'], notes: '' },
        'margin-error': { questionIds: [], notes: 'supplement only' }
      }
    },
    EMBEDDED_CURRICULUM_SUPPLEMENT: [
      {
        id: 'U6-L6-QS1',
        type: 'multiple-choice',
        formulaId: 'margin-error',
        prompt: 'stub',
        answerKey: 'B',
        attachments: { choices: [] }
      }
    ],
    BKT: {
      updateMastery: (prior, correct) => prior + (correct ? 0.1 : -0.1)
    },
    ...extra
  };
}

function emptyState() {
  return {
    touchedFormulas: {},
    dailyDose: null,
    units: {}
  };
}

function makeUnitState(mastery, extra = {}) {
  return {
    masteryState: {
      lo1: mastery
    },
    ...extra
  };
}

function makeDailyDose(overrides = {}) {
  return {
    date: START_DAY,
    tierAtGeneration: 0,
    mcq: [],
    mcqCompleted: [],
    frq: [],
    frqCompleted: [],
    activeTab: 'mcq',
    ...overrides
  };
}

function makeMcq(formulaId, questionId, unit = 1, lesson = 1, tier = 'core') {
  return {
    kind: 'mcq',
    formulaId,
    questionId,
    unit,
    lesson,
    tier
  };
}

function makeFrq(unit, questionId) {
  return {
    kind: 'frq',
    unit,
    questionId,
    formulaId: null
  };
}

let fakeWindow;
let v4;
let api;
let state;

beforeEach(() => {
  expect(existsSync(V4_PATH)).toBe(true);
  expect(existsSync(V5_PATH)).toBe(true);
  fakeWindow = makeFakeWindow();
  ({ v4, v5: api } = loadApis(fakeWindow));
  state = emptyState();
  expect(v4).toBeTruthy();
  expect(api).toBeTruthy();
});

describe('v4 re-exports', () => {
  it('re-exposes v4 helpers and constants through the v5 API', () => {
    expect(api.daysLeft(START_DAY, EXAM_DATE)).toBe(v4.daysLeft(START_DAY, EXAM_DATE));
    expect(api.AP_EXAM_DATE).toBe(v4.AP_EXAM_DATE);
    expect(api.FORMULA_UNIT_MAP).toEqual(fakeWindow.FORMULA_UNIT_MAP);
  });
});

describe('daysSinceStudyStart', () => {
  it('counts the study start date as day 1', () => {
    expect(api.daysSinceStudyStart(START_DAY)).toBe(1);
  });

  it('returns day 8 after seven calendar days', () => {
    expect(api.daysSinceStudyStart(DAY_8)).toBe(8);
  });

  it('returns day 22 after twenty-one calendar days', () => {
    expect(api.daysSinceStudyStart(DAY_22)).toBe(22);
  });
});

describe('calendarTier', () => {
  it('uses the expected day-to-tier boundaries', () => {
    expect(api.calendarTier(START_DAY)).toBe(0);
    expect(api.calendarTier(DAY_8)).toBe(1);
    expect(api.calendarTier(DAY_15)).toBe(2);
    expect(api.calendarTier(DAY_21)).toBe(3);
  });
});

describe('computeDoseTier', () => {
  it('returns tier 0 for an all-zero state on day 1', () => {
    expect(api.computeDoseTier(state, START_DAY)).toBe(0);
  });

  it('takes the max of calendar tier, mcq debt, and frq debt', () => {
    expect(api.computeDoseTier({ doseLadder: { tier: 0, mcqDebt: 2, frqDebt: 1 } }, START_DAY)).toBe(2);
    expect(api.computeDoseTier({ doseLadder: { tier: 0, mcqDebt: 1, frqDebt: 3 } }, START_DAY)).toBe(3);
    expect(api.computeDoseTier(state, DAY_15)).toBe(2);
  });
});

describe('tierSpec', () => {
  it('returns the expected ladder doses', () => {
    expect(api.tierSpec(0).mcq).toBe(5);
    expect(api.tierSpec(0).frq).toBe(1);
    expect(api.tierSpec(3).mcq).toBe(12);
    expect(api.tierSpec(3).frq).toBe(2);
  });
});

describe('updateDebtFromPriorDose', () => {
  it('adds debt when the prior day was under-completed', () => {
    state.dailyDose = makeDailyDose({
      date: START_DAY,
      mcq: [
        makeMcq('mean', 'U1-L1-Q01'),
        makeMcq('corr-r', 'U2-L5-Q02'),
        makeMcq('binom-pmf', 'U4-L8-Q01')
      ],
      mcqCompleted: ['U1-L1-Q01'],
      frq: [makeFrq(1, 'U1-PC-FRQ-Q02')],
      frqCompleted: []
    });

    api.updateDebtFromPriorDose(state, NEXT_DAY);

    expect(state.doseLadder.mcqDebt).toBe(2);
    expect(state.doseLadder.frqDebt).toBe(1);
  });

  it('reduces debt when the prior day was over-completed and floors at zero', () => {
    state.doseLadder = { tier: 0, mcqDebt: 2, frqDebt: 1 };
    state.dailyDose = makeDailyDose({
      date: START_DAY,
      mcq: [
        makeMcq('mean', 'U1-L1-Q01'),
        makeMcq('corr-r', 'U2-L5-Q02')
      ],
      mcqCompleted: ['U1-L1-Q01', 'U2-L5-Q02', 'extra-1', 'extra-2'],
      frq: [makeFrq(1, 'U1-PC-FRQ-Q02')],
      frqCompleted: ['U1-PC-FRQ-Q02', 'extra-frq']
    });

    api.updateDebtFromPriorDose(state, NEXT_DAY);

    expect(state.doseLadder.mcqDebt).toBe(0);
    expect(state.doseLadder.frqDebt).toBe(0);
  });

  it('is a no-op when the stored dose is already for today', () => {
    state.doseLadder = { tier: 0, mcqDebt: 1, frqDebt: 2 };
    state.dailyDose = makeDailyDose({
      date: START_DAY,
      mcq: [makeMcq('mean', 'U1-L1-Q01')],
      mcqCompleted: [],
      frq: [makeFrq(1, 'U1-PC-FRQ-Q02')],
      frqCompleted: []
    });

    api.updateDebtFromPriorDose(state, START_DAY);

    expect(state.doseLadder.mcqDebt).toBe(1);
    expect(state.doseLadder.frqDebt).toBe(2);
  });

  it('is a no-op when no dailyDose exists and still initializes doseLadder', () => {
    api.updateDebtFromPriorDose(state, START_DAY);

    expect(state.doseLadder).toEqual({
      tier: 0,
      mcqDebt: 0,
      frqDebt: 0
    });
  });

  it('is idempotent across repeated calls on the same rolled-over daily dose', () => {
    state.dailyDose = makeDailyDose({
      date: START_DAY,
      mcq: [
        makeMcq('mean', 'U1-L1-Q01'),
        makeMcq('corr-r', 'U2-L5-Q02'),
        makeMcq('binom-pmf', 'U4-L8-Q01')
      ],
      mcqCompleted: ['U1-L1-Q01'],
      frq: [makeFrq(1, 'U1-PC-FRQ-Q02')],
      frqCompleted: []
    });

    api.updateDebtFromPriorDose(state, NEXT_DAY);
    api.updateDebtFromPriorDose(state, NEXT_DAY);

    expect(state.doseLadder.mcqDebt).toBe(2);
    expect(state.doseLadder.frqDebt).toBe(1);
  });
});

describe('pickDailyFrqs', () => {
  it('picks the weakest ungraded units first', () => {
    state.units = {
      1: makeUnitState(0.8),
      2: makeUnitState(0.1, { frqGrade: 'done' }),
      3: makeUnitState(0.2),
      4: makeUnitState(0.4),
      5: makeUnitState(0.6),
      6: makeUnitState(0.7),
      7: makeUnitState(0.5),
      8: makeUnitState(0.9),
      9: makeUnitState(0.95)
    };

    expect(api.pickDailyFrqs(state, 3)).toEqual([
      { kind: 'frq', unit: 3, questionId: 'U3-PC-FRQ-Q01', formulaId: null },
      { kind: 'frq', unit: 4, questionId: 'U4-PC-FRQ-Q02', formulaId: null },
      { kind: 'frq', unit: 7, questionId: 'U7-PC-FRQ-Q02', formulaId: null }
    ]);
  });

  it('returns at most n and can return fewer when most units are ineligible', () => {
    state.units = {
      1: makeUnitState(0.2, { frqGrade: 'done' }),
      2: makeUnitState(0.2, { frqGrade: 'done' }),
      3: makeUnitState(0.2, { frqGrade: 'done' }),
      4: makeUnitState(0.2, { frqGrade: 'done' }),
      5: makeUnitState(0.2, { frqGrade: 'done' }),
      6: makeUnitState(0.2, { frqGrade: 'done' }),
      7: makeUnitState(0.2, { frqGrade: 'done' }),
      8: makeUnitState(0.2, { frqGrade: 'done' }),
      9: makeUnitState(0.2)
    };

    expect(api.pickDailyFrqs(state, 3)).toEqual([
      { kind: 'frq', unit: 9, questionId: 'U9-PC-FRQ-Q01', formulaId: null }
    ]);
  });
});

describe('pickDailyQueueV5', () => {
  it('builds the expected daily-dose shape for tier 0', () => {
    const dailyDose = api.pickDailyQueueV5(state, START_DAY, EXAM_DATE);

    expect(dailyDose).toEqual(expect.objectContaining({
      date: START_DAY,
      tierAtGeneration: 0,
      activeTab: 'mcq',
      mcqCompleted: [],
      frqCompleted: []
    }));
    expect(dailyDose.mcq.every((entry) => entry.kind === 'mcq')).toBe(true);
    expect(dailyDose.frq.every((entry) => entry.kind === 'frq')).toBe(true);
    expect(dailyDose.mcq.length).toBeLessThanOrEqual(5);
    expect(dailyDose.frq.length).toBeLessThanOrEqual(1);
  });

  it('returns the existing queue when called again on the same day', () => {
    const firstDose = api.pickDailyQueueV5(state, START_DAY, EXAM_DATE);
    state.dailyDose = firstDose;

    const secondDose = api.pickDailyQueueV5(state, START_DAY, EXAM_DATE);

    expect(secondDose).toBe(firstDose);
  });

  it('regenerates the queue when the day changes', () => {
    const firstDose = api.pickDailyQueueV5(state, START_DAY, EXAM_DATE);
    state.dailyDose = {
      ...firstDose,
      mcqCompleted: firstDose.mcq.map((entry) => entry.questionId),
      frqCompleted: firstDose.frq.map((entry) => entry.questionId)
    };

    const nextDose = api.pickDailyQueueV5(state, NEXT_DAY, EXAM_DATE);

    expect(nextDose).not.toBe(state.dailyDose);
    expect(nextDose.date).toBe(NEXT_DAY);
    expect(nextDose.activeTab).toBe('mcq');
    expect(nextDose.mcqCompleted).toEqual([]);
    expect(nextDose.frqCompleted).toEqual([]);
  });
});

describe('advanceDailyQueueV5', () => {
  it('advances within a tab, flips tabs when needed, and returns null when complete', () => {
    state.dailyDose = makeDailyDose({
      mcq: [
        makeMcq('mean', 'U1-L1-Q01', 1, 1, 'core'),
        makeMcq('corr-r', 'U2-L5-Q02', 2, 5, 'regular')
      ],
      frq: [
        makeFrq(1, 'U1-PC-FRQ-Q02')
      ],
      activeTab: 'mcq'
    });

    const nextMcq = api.advanceDailyQueueV5(state, 'U1-L1-Q01');
    expect(nextMcq.questionId).toBe('U2-L5-Q02');
    expect(state.dailyDose.mcqCompleted).toEqual(['U1-L1-Q01']);
    expect(state.dailyDose.activeTab).toBe('mcq');

    const nextFrq = api.advanceDailyQueueV5(state, 'U2-L5-Q02');
    expect(nextFrq.questionId).toBe('U1-PC-FRQ-Q02');
    expect(state.dailyDose.mcqCompleted).toEqual(['U1-L1-Q01', 'U2-L5-Q02']);
    expect(state.dailyDose.activeTab).toBe('frq');

    const done = api.advanceDailyQueueV5(state, 'U1-PC-FRQ-Q02');
    expect(done).toBeNull();
    expect(state.dailyDose.frqCompleted).toEqual(['U1-PC-FRQ-Q02']);
  });
});

describe('setActiveTab', () => {
  it('normalizes tabs to mcq or frq and no-ops when dailyDose is missing', () => {
    api.setActiveTab(state, 'frq');
    expect(state.dailyDose).toBeNull();

    state.dailyDose = makeDailyDose();
    api.setActiveTab(state, 'frq');
    expect(state.dailyDose.activeTab).toBe('frq');

    api.setActiveTab(state, 'anything-else');
    expect(state.dailyDose.activeTab).toBe('mcq');
  });
});

describe('debt scenarios', () => {
  it('does not create debt when the student works ahead', () => {
    state.doseLadder = { tier: 0, mcqDebt: 0, frqDebt: 0 };
    state.dailyDose = makeDailyDose({
      date: START_DAY,
      mcq: [
        makeMcq('mean', 'U1-L1-Q01'),
        makeMcq('corr-r', 'U2-L5-Q02'),
        makeMcq('binom-pmf', 'U4-L8-Q01'),
        makeMcq('phat-sd', 'U5-L2-Q01'),
        makeMcq('one-prop-z', 'U6-L4-Q01')
      ],
      mcqCompleted: [
        'U1-L1-Q01',
        'U2-L5-Q02',
        'U4-L8-Q01',
        'U5-L2-Q01',
        'U6-L4-Q01',
        'extra-1',
        'extra-2',
        'extra-3',
        'extra-4',
        'extra-5'
      ]
    });

    api.updateDebtFromPriorDose(state, NEXT_DAY);

    expect(state.doseLadder.mcqDebt).toBe(0);
  });

  it('bumps the dose tier upward after repeated skipped days', () => {
    state.doseLadder = { tier: 0, mcqDebt: 0, frqDebt: 0 };
    state.dailyDose = makeDailyDose({
      date: START_DAY,
      mcq: [
        makeMcq('mean', 'U1-L1-Q01'),
        makeMcq('corr-r', 'U2-L5-Q02'),
        makeMcq('binom-pmf', 'U4-L8-Q01'),
        makeMcq('phat-sd', 'U5-L2-Q01'),
        makeMcq('one-prop-z', 'U6-L4-Q01')
      ],
      mcqCompleted: []
    });

    api.updateDebtFromPriorDose(state, NEXT_DAY);

    state.dailyDose = makeDailyDose({
      date: NEXT_DAY,
      mcq: [
        makeMcq('mean', 'U1-L1-Q01'),
        makeMcq('corr-r', 'U2-L5-Q02'),
        makeMcq('binom-pmf', 'U4-L8-Q01'),
        makeMcq('phat-sd', 'U5-L2-Q01'),
        makeMcq('one-prop-z', 'U6-L4-Q01')
      ],
      mcqCompleted: []
    });

    api.updateDebtFromPriorDose(state, THIRD_DAY);

    expect(api.computeDoseTier(state, THIRD_DAY)).toBeGreaterThanOrEqual(2);
  });
});
