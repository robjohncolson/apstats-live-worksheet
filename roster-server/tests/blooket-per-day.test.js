// @vitest-environment node
// blooket-per-day.test.js: the wiring of per-day flashcard decks
// (FLASHCARD_DECK_SLICES_SPEC.md D3, sections 2 and 6). The engine rules live in
// lesson-grade.test.js ("per-day flashcard decks (D3)"); this file pins the plumbing:
// the vendored slices file, resolvePerDayGroups, computeGrade end to end on the real
// SY2627 inputs, the offline contract (a computed group list, never the file), effort
// points, and the server mounts (GET /grade and GET /class/grades).

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeGrade, resolvePerDayGroups } from '../grade.js';
import { resolveProductionGradeInputs, loadDeckSlicesWithPriority } from '../grade-contexts.js';
import { effortPointsFor } from '../doge-econ.js';
import { bootGoldenApp } from './golden/boot.js';

const here = dirname(fileURLToPath(import.meta.url));
const VENDORED = JSON.parse(readFileSync(resolve(here, '../data/blooket-deck-slices.json'), 'utf8'));

// The real SY2627 grade inputs, with v3 on (the Blooket track is a v3 track).
const prod = resolveProductionGradeInputs('SY2627');
const CONFIG = { ...prod.config, useV3: true, pcTrack: { enabled: false } };
const ANSWER_KEY = prod.answerKey.answerKey;
// Period E sits 4.7 and 4.8 (CED 2.8, 2.9) on Mon 11/09; both zero 11/22, so due on 11/24.
const AS_OF_DUE = Date.parse('2026-11-24T17:00:00.000Z');

function deckRow(itemId, score, topic) {
  return { item_id: itemId, source: 'worksheet', score, attempt: 1, unit: 'U4', topic, recorded_at: '2026-11-20T16:00:00.000Z' };
}

function gradeFor(rows, section, extraOpts) {
  return computeGrade(rows, ANSWER_KEY, CONFIG, {
    lessonSchedule: prod.lessonSchedule,
    eventSchedule: prod.eventSchedule,
    section,
    asOf: AS_OF_DUE,
    blooketPresence: prod.blooketPresence,
    blooketRequired: prod.blooketRequired,
    blooketBonusTopics: prod.blooketBonusTopics,
    ...extraOpts,
  });
}

const lessonOf = (grade, key) => grade.lessons.find((lesson) => lesson.lessonKey === key);

describe('the vendored slices file reaches the grade context', () => {
  it('SY2627 carries the vendored roster-server/data copy; the frozen SY2526 year carries none', () => {
    expect(prod.deckSlices).toEqual(VENDORED);
    expect(Object.keys(prod.deckSlices.slices)).toEqual([
      'u4_l1_l2_blooket.csv', 'u4_l3_l4_l5_blooket.csv', 'u4_l7_l8_blooket.csv', 'u4_l10_l12_blooket.csv',
    ]);
    expect(resolveProductionGradeInputs('SY2526').deckSlices).toEqual({});
    expect(loadDeckSlicesWithPriority()).toEqual(VENDORED);
  });

  it('each resolve hands out its own copy', () => {
    const first = resolveProductionGradeInputs('SY2627');
    first.deckSlices.slices['u4_l7_l8_blooket.csv'] = null;
    expect(resolveProductionGradeInputs('SY2627').deckSlices).toEqual(VENDORED);
  });
});

describe('resolvePerDayGroups', () => {
  const schedule = prod.lessonSchedule;

  it('derives the groups from the slices for the section', () => {
    expect([...resolvePerDayGroups({ deckSlices: VENDORED }, schedule, 'PeriodE', CONFIG)]).toEqual(['4|7-8', '4|10-12']);
    expect([...resolvePerDayGroups({ deckSlices: VENDORED }, schedule, 'PeriodB', CONFIG)]).toEqual(['4|7-8', '4|10-12']);
  });

  it('a list the server computed (the offline pack) wins over the slices', () => {
    expect([...resolvePerDayGroups({ perDayGroups: ['4|1-2'], deckSlices: VENDORED }, schedule, 'PeriodE', CONFIG)]).toEqual(['4|1-2']);
    expect([...resolvePerDayGroups({ perDayGroups: [], deckSlices: VENDORED }, schedule, 'PeriodE', CONFIG)]).toEqual([]);
    const asSet = new Set(['4|7-8']);
    expect(resolvePerDayGroups({ perDayGroups: asSet }, schedule, 'PeriodE', CONFIG)).toBe(asSet);
  });

  it('no slices, no schedule, or a null cutoff: no per-day groups (one score per worksheet)', () => {
    expect([...resolvePerDayGroups({}, schedule, 'PeriodE', CONFIG)]).toEqual([]);
    expect([...resolvePerDayGroups(undefined, schedule, 'PeriodE', CONFIG)]).toEqual([]);
    expect([...resolvePerDayGroups({ deckSlices: VENDORED }, null, 'PeriodE', CONFIG)]).toEqual([]);
    expect([...resolvePerDayGroups({ deckSlices: VENDORED }, schedule, 'PeriodE', { ...CONFIG, blooketPerDayFrom: null })]).toEqual([]);
  });
});

describe('computeGrade end to end on the real SY2627 inputs (Period E, 11/24)', () => {
  it('a 2.8 day deck counts for 2.8 only, and 2.9 is owed once due', () => {
    const rows = [deckRow('BL-U4-L7-DESK_DAY', 90, '4.7')];
    const grade = gradeFor(rows, 'PeriodE', { deckSlices: VENDORED });
    expect(lessonOf(grade, '4.7').blooket).toBe(90);
    expect(lessonOf(grade, '4.8').blooket).toBeNull();
    expect(grade.quarters.Q2.blooketTodo).toContain('4.8');
    expect(grade.quarters.Q2.blooketTodo).not.toContain('4.7');
  });

  it('without the slices the same row counts for the whole worksheet (one score, nothing owed)', () => {
    const rows = [deckRow('BL-U4-L7-DESK_DAY', 90, '4.7')];
    const grade = gradeFor(rows, 'PeriodE', {});
    expect(lessonOf(grade, '4.8').blooket).toBe(90);
    expect(grade.quarters.Q2.blooketTodo).not.toContain('4.7');
    expect(grade.quarters.Q2.blooketTodo).not.toContain('4.8');
  });

  it('a full-deck run recorded before the cutoff still counts for both days', () => {
    const rows = [deckRow('BL-U4-L7-8-DESK_DONE', 72.5, '4.7')];
    const grade = gradeFor(rows, 'PeriodE', { deckSlices: VENDORED });
    expect(lessonOf(grade, '4.7').blooket).toBe(72.5);
    expect(lessonOf(grade, '4.8').blooket).toBe(72.5);
    expect(grade.quarters.Q2.blooketTodo).not.toContain('4.8');
  });

  it('a 2.4 day deck (4.3-5 zeroes before 11/13) still counts for 2.4, 2.5 and 2.6', () => {
    const rows = [deckRow('BL-U4-L3-DESK_DAY', 88, '4.3')];
    const grade = gradeFor(rows, 'PeriodE', { deckSlices: VENDORED });
    expect(['4.3', '4.4', '4.5'].map((key) => lessonOf(grade, key).blooket)).toEqual([88, 88, 88]);
  });

  it('offline contract: the computed group list re-derives exactly what the slices give', () => {
    const rows = [
      deckRow('BL-U4-L7-DESK_DAY', 90, '4.7'),
      deckRow('BL-U4-L10-DESK_DAY', 64, '4.10'),
      deckRow('BL-U4-L3-DESK_DAY', 88, '4.3'),
      deckRow('BL-U4-L1-2-DESK_DONE', 75, '4.1'),
    ];
    for (const section of ['PeriodB', 'PeriodE']) {
      const perDayGroups = Array.from(resolvePerDayGroups({ deckSlices: VENDORED }, prod.lessonSchedule, section, CONFIG));
      const online = gradeFor(rows, section, { deckSlices: VENDORED });
      const offline = gradeFor(rows, section, { perDayGroups });
      expect(offline, section).toEqual(online);
    }
  });

  it('a computeGrade with neither slices nor groups is the one-score-per-worksheet grade', () => {
    const rows = [deckRow('BL-U4-L7-DESK_DONE', 81, '4.7'), deckRow('BL-U4-L1-DESK_DONE', 77, '4.1')];
    expect(gradeFor(rows, 'PeriodE', {})).toEqual(gradeFor(rows, 'PeriodE', { perDayGroups: [] }));
  });
});

describe('effort points', () => {
  it('a finished day deck earns the same 4 points as a finished full deck', () => {
    expect(effortPointsFor('worksheet', 'BL-U4-L7-DESK_DAY')).toBe(4);
    expect(effortPointsFor('worksheet', 'BL-U4-L7-DESK_DONE')).toBe(4);
    expect(effortPointsFor('worksheet', 'WS-U4-L7-DESK_DAY')).toBe(3);   // not a deck row: plain worksheet
  });
});

describe('server mounts: GET /grade and GET /class/grades use the production bundle slices', () => {
  // One boot imports server.js (supabase, bcrypt, express): give it the golden budget.
  const BOOT_TIMEOUT_MS = 60_000;
  let app = null;
  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  async function boot(productionGradeInputs) {
    const records = (topic) => [{
      source: 'worksheet', item_id: 'BL-U4-L7-DESK_DAY', unit: 'U4', topic, skill: null,
      score: 90, response: null, evidence_tier: 'practice', attempt: 1,
      recorded_at: '2026-11-20T16:00:00.000Z', graded_at: '2026-11-20T16:00:00.000Z',
    }];
    const studentsDoc = {
      asOf: '2026-11-24',
      students: [
        { id: 'per-day-e', section: 'PeriodE', reviews: [], records: records('4.7') },
        { id: 'per-day-b', section: 'PeriodB', reviews: [], records: records('4.7') },
      ],
    };
    const inputs = {
      answerKey: productionGradeInputs.answerKey,
      productionGradeInputs,
      lessonSchedule: productionGradeInputs.lessonSchedule,
      worksheetBlankCounts: null,
      worksheetKey: null,
    };
    app = await bootGoldenApp({
      studentsDoc, inputs, configOverrides: { useV3: true, pcTrack: { enabled: false } }, inProcess: true,
    });
  }

  it('per-day: 2.8 alone is scored and 2.9 is owed, for the student and the teacher view', async () => {
    await boot(resolveProductionGradeInputs('SY2627'));
    const own = await app.getStudentGrade('per-day-e');
    expect(lessonOf(own, '4.7').blooket).toBe(90);
    expect(lessonOf(own, '4.8').blooket).toBeNull();
    expect(own.quarters.Q2.blooketTodo).toContain('4.8');
    const roster = await app.getClassGrades();
    for (const id of ['per-day-e', 'per-day-b']) {
      const student = roster.students.find((s) => s.studentId === id);
      expect(lessonOf(student, '4.8').blooket, id).toBeNull();
      expect(student.quarters.Q2.blooketTodo, id).toContain('4.8');
    }
  }, BOOT_TIMEOUT_MS);

  it('a production bundle without slices keeps one score per worksheet', async () => {
    const bundle = resolveProductionGradeInputs('SY2627');
    delete bundle.deckSlices;
    await boot(bundle);
    const own = await app.getStudentGrade('per-day-e');
    expect(lessonOf(own, '4.8').blooket).toBe(90);
    expect(own.quarters.Q2.blooketTodo).not.toContain('4.8');
  }, BOOT_TIMEOUT_MS);
});
