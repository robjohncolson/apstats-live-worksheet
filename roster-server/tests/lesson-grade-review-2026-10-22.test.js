// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PHASE3_CONFIG } from '../grade-config.js';
import { buildLessonsArray, computeLessonGrades, computeQuarterV3 } from '../lesson-grade.js';
import {
  createFrqDb, pgApplyFrqVerdict, pgClaimFrqTickets, pgFrqRow, pgRecordFrqDraft,
} from './fixtures/pg-frq.js';

const BEFORE_BAND = { E: 100, P: 85, I: 60 };
const SCHEDULE = { '1.1': { unit: 1, worksheetKey: '1', periods: { B: '2026-10-20' } } };
const KEY = { 'U1-L1-Q1': { answerKey: 'a' } };
const OPTIONS = {
  worksheetBlankCounts: { '1.1': 1 },
  weights: PHASE3_CONFIG.lessonFeederWeights,
  frqFloorSince: PHASE3_CONFIG.frqProvisionalFloorSince,
};
const SCORES = [null, 0, 0.5, 1];

describe('October 22 grade safety', () => {
  it('all 1,024 feeder combinations retain prior credit and clamp every lesson output at 105', () => {
    let checked = 0;
    for (const blank of SCORES) for (const first of SCORES) for (const second of SCORES) {
      for (const exit of SCORES) for (const quiz of SCORES) {
        const rows = [
          ['WS-U1L1-Q1', 'worksheet', blank],
          ['WS-U1L1-reflect1', 'frq', first],
          ['WS-U1L1-reflect2', 'frq', second],
          ['WS-U1L1-exitTicket', 'frq', exit],
          ['U1-L1-Q1', 'curriculum_quiz', quiz],
        ].filter(([, , score]) => score !== null).map(([item_id, source, score]) => ({
          item_id, source, score, response: score === 1 ? 'a' : 'wrong',
          recorded_at: '2026-10-20T12:00:00Z',
        }));
        const beforeBytes = JSON.stringify(rows);
        const before = computeLessonGrades(rows, BEFORE_BAND, KEY, SCHEDULE, OPTIONS).get('1.1');
        const map = computeLessonGrades(rows, PHASE3_CONFIG.frqBand, KEY, SCHEDULE, OPTIONS);
        const after = map.get('1.1');
        checked += 1;
        if (!after) continue;
        const context = JSON.stringify({ blank, first, second, exit, quiz });
        for (const field of ['lessonGrade', 'lessonGradeNoQuiz']) {
          if (after[field] === null) continue;
          expect(after[field], context + field).toBeLessThanOrEqual(105);
          expect(after[field], context + field).toBeGreaterThanOrEqual(before[field]);
        }
        const published = buildLessonsArray(map, SCHEDULE)[0];
        for (const field of ['lessonGrade', 'lessonGradeNoQuiz']) {
          if (published[field] != null) expect(published[field], context + field).toBeLessThanOrEqual(105);
        }
        for (const v3FixCwsReveal of [false, true]) {
          const quarter = computeQuarterV3({
            quarterKey: 'Q1', config: { ...PHASE3_CONFIG, v3FixCwsReveal },
            lessonMap: map, schedule: SCHEDULE, todayDateStr: '2026-10-22',
            section: 'B', unitPcData: {},
          });
          if (quarter.workTracks.lessons != null) expect(quarter.workTracks.lessons, context).toBeLessThanOrEqual(105);
          if (quarter.quarterGrade != null) expect(quarter.quarterGrade, context).toBeLessThanOrEqual(100);
        }
        expect(JSON.stringify(rows)).toBe(beforeBytes);
      }
    }
    expect(checked).toBe(1024);
  });

  it('the real SQL never lowers a stored I/P/E after any verdict or replayed draft', async () => {
    const db = await createFrqDb();
    try {
      for (const initial of [0, 0.5, 1]) for (const incoming of [0, 0.5, 1]) {
        const itemId = `WS-U1L1-reflect-${initial}-${incoming}`;
        const response = 'The observed sample differs because of random variation.';
        const responseHash = `review-${initial}-${incoming}`;
        const draft = await pgRecordFrqDraft(db, {
          itemId, response, responseHash, readyAt: '2000-01-01T00:00:00Z',
        });
        const [claim] = await pgClaimFrqTickets(db, { worker: 'review', limit: 1 });
        await pgApplyFrqVerdict(db, {
          ledgerId: draft.ledger_id, claimToken: claim.frq_claim_token,
          responseVersion: claim.frq_response_version, score: initial,
          result: { responseHash }, gradedAt: '2026-10-22T12:00:00Z',
        });
        await pgApplyFrqVerdict(db, {
          ledgerId: draft.ledger_id, responseVersion: claim.frq_response_version,
          score: incoming, result: { responseHash }, teacher: true,
          gradedAt: '2026-10-22T12:01:00Z',
        });
        expect(Number((await pgFrqRow(db, draft.ledger_id)).score)).toBe(Math.max(initial, incoming));
        await pgRecordFrqDraft(db, {
          itemId, response: response + ' Revised.', responseHash: responseHash + '-new',
          readyAt: '2000-01-01T00:00:00Z',
        });
        expect(Number((await pgFrqRow(db, draft.ledger_id)).score)).toBe(Math.max(initial, incoming));
      }
    } finally {
      await db.close();
    }
  }, 60000);
});
