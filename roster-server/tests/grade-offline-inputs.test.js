// grade-offline-inputs.test.js — the redacted-key endpoint (ANDROID Phase 2).
//
// The load-bearing property: computeGrade over the REDACTED key === computeGrade
// over the REAL key for the same student (so offline re-derivation matches the
// server), while the redacted key reveals no answers beyond the student's own
// correct ones.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import express from 'express';
import { buildRedactedKey, REDACTION_SENTINEL, mountOfflineInputs } from '../grade-offline-inputs.js';
import { computeGrade } from '../grade.js';
import { resolveProductionGradeInputs } from '../grade-contexts.js';
import {
  CONFIG, ANSWER_KEY, GRADE_OPTS, ARCHETYPES, materialize,
} from './fixtures/sim-world.js';

const FROZEN_ANSWER_KEY_DOC = Object.freeze({
  generatedFrom: 'grade-offline-inputs test freeze',
  answerKey: ANSWER_KEY,
});

describe('buildRedactedKey — parity with the real key', () => {
  // Every archetype: the grade computed from the redacted key must equal the
  // grade from the real key. Run with includePc (redactPc:false) so the PC track
  // is exercised too — proving the mechanism is parity-exact end to end.
  for (const name of Object.keys(ARCHETYPES)) {
    it(`computeGrade(redacted) === computeGrade(real) — ${name}`, () => {
      const rows = materialize(ARCHETYPES[name]());
      const redacted = buildRedactedKey(ANSWER_KEY, rows, { redactPc: false });
      const real = computeGrade(rows, ANSWER_KEY, CONFIG, GRADE_OPTS);
      const fromRedacted = computeGrade(rows, redacted, CONFIG, GRADE_OPTS);
      expect(fromRedacted).toEqual(real);
    });
  }

  it('same item-id set and same gradability as the real key', () => {
    const rows = materialize(ARCHETYPES.mixed_typical());
    const redacted = buildRedactedKey(ANSWER_KEY, rows, { redactPc: false });
    expect(Object.keys(redacted).sort()).toEqual(Object.keys(ANSWER_KEY).sort());
    for (const id of Object.keys(ANSWER_KEY)) {
      const realGradable = ANSWER_KEY[id].answerKey != null;
      const redGradable = redacted[id].answerKey != null;
      expect(redGradable).toBe(realGradable);
    }
  });
});

describe('buildRedactedKey — no answer leakage', () => {
  it('reveals ONLY the items the student answered correctly', () => {
    // diligent_on_pace aces every DUE item; future/non-due items are unattempted.
    const rows = materialize(ARCHETYPES.diligent_on_pace());
    const redacted = buildRedactedKey(ANSWER_KEY, rows, { redactPc: false });
    const attempted = new Set(rows.map((r) => r.item_id));
    for (const id of Object.keys(ANSWER_KEY)) {
      if (ANSWER_KEY[id].answerKey == null) continue; // FRQ/ungradable preserved
      if (attempted.has(id)) {
        // a correct attempt → real answer surfaces (the student already knows it)
        expect(redacted[id].answerKey).not.toBe(REDACTION_SENTINEL);
      } else {
        // never attempted → sentinel, no answer revealed
        expect(redacted[id].answerKey).toBe(REDACTION_SENTINEL);
      }
    }
  });

  it('a WRONG attempt reveals nothing (sentinel, still gradable)', () => {
    // One quiz item answered wrong; key stays sentinel but non-null.
    const rows = [{ item_id: 'U1-L2-Q1', source: 'curriculum_quiz', response: '<<wrong>>', attempt: 1, recorded_at: '2026-09-12T00:00:00Z' }];
    const redacted = buildRedactedKey(ANSWER_KEY, rows, { redactPc: false });
    expect(redacted['U1-L2-Q1'].answerKey).toBe(REDACTION_SENTINEL);
    expect(redacted['U1-L2-Q1'].answerKey).not.toBeNull();
  });

  it('redactPc (default) sentinels PC answers even when correct', () => {
    const rows = [{ item_id: 'U1-PC-Q1', source: 'pc', response: 'a', attempt: 1, recorded_at: '2026-09-20T00:00:00Z' }];
    const redacted = buildRedactedKey(ANSWER_KEY, rows); // default redactPc:true
    expect(redacted['U1-PC-Q1'].answerKey).toBe(REDACTION_SENTINEL);
  });

  it('preserves ungradable (FRQ) entries verbatim', () => {
    const realKey = { 'WS-U1L1-reflect1': { answerKey: null, unit: 1 } };
    const redacted = buildRedactedKey(realKey, [], { redactPc: false });
    expect(redacted['WS-U1L1-reflect1']).toEqual({ answerKey: null, unit: 1 });
  });
});

describe('GET /grade/offline-inputs route', () => {
  let server, baseUrl;

  beforeAll(async () => {
    const app = express();
    const rows = materialize(ARCHETYPES.mixed_typical());
    mountOfflineInputs(app, {
      verifyToken: (t) => (t === 'good' ? 'stu_1' : null),
      ledgerDb: { getLedgerByStudent: async () => ({ data: rows }) },
      loadAnswerKey: async () => FROZEN_ANSWER_KEY_DOC,
      lessonSchedule: GRADE_OPTS.lessonSchedule,
      db: { findByStudentId: async () => ({ data: { section: 'PeriodB' } }) },
      config: CONFIG,
      worksheetBlankCounts: GRADE_OPTS.worksheetBlankCounts,
      blooketLessons: GRADE_OPTS.blooketLessons,
      blooketPresence: GRADE_OPTS.blooketPresence,
      blooketRequired: GRADE_OPTS.blooketRequired,
      blooketBonusTopics: GRADE_OPTS.blooketBonusTopics,
      trainerMap: GRADE_OPTS.trainerMap,
    });
    server = http.createServer(app);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(() => new Promise((r) => server.close(r)));

  async function get(path) {
    const res = await fetch(`${baseUrl}${path}`);
    let body = null;
    try { body = await res.json(); } catch (_) { /* non-JSON */ }
    return { status: res.status, body };
  }

  it('401 without a token', async () => {
    const res = await get('/grade/offline-inputs');
    expect(res.status).toBe(401);
  });

  it('returns redacted inputs from the frozen answer-key document', async () => {
    const res = await get('/grade/offline-inputs?token=good');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.redactPc).toBe(true);
    expect(res.body.section).toBe('PeriodB');
    expect(res.body.redactedKey).toBeTruthy();
    expect(res.body.schedule).toBeTruthy();
    expect(Object.keys(res.body.redactedKey).sort()).toEqual(Object.keys(ANSWER_KEY).sort());
  });

  it('end-to-end: the returned inputs re-derive the server grade', async () => {
    const res = await get('/grade/offline-inputs?token=good&includePc=1');
    const rows = materialize(ARCHETYPES.mixed_typical());
    const real = computeGrade(rows, ANSWER_KEY, CONFIG, GRADE_OPTS);
    const offline = computeGrade(rows, res.body.redactedKey, res.body.config, {
      lessonSchedule: res.body.schedule,
      section: res.body.section,
      worksheetBlankCounts: res.body.worksheetBlankCounts,
      blooketLessons: res.body.blooketLessons,
      blooketPresence: res.body.blooketPresence || res.body.blooketLessons,
      blooketRequired: res.body.blooketRequired,
      blooketBonusTopics: res.body.blooketBonusTopics,
      trainerMap: res.body.trainerMap,
      asOf: GRADE_OPTS.asOf,
    });
    expect(offline).toEqual(real);
    // M2a/M2d contract: offline pack ships presence + required + bonus
    expect(Array.isArray(res.body.blooketPresence)).toBe(true);
    expect(Array.isArray(res.body.blooketRequired)).toBe(true);
    expect(Array.isArray(res.body.blooketBonusTopics)).toBe(true);
    expect(res.body.blooketBonusTopics).toEqual(GRADE_OPTS.blooketBonusTopics);
    // Offline re-derive stamps real bonus topic
    const bonusLesson = offline.lessons.find((L) => L.lessonKey === '2.9');
    expect(bonusLesson).toBeTruthy();
    expect(bonusLesson.blooketBonus).toBe(true);
    expect(bonusLesson.hasBlooket).toBe(true);
  });
});

// FLASHCARD_DECK_SLICES_SPEC.md D3 / section 6: the device gets the per-day deck groups
// the server computed for its section, never the slices file, and re-derives the
// server grade with them.
describe('GET /grade/offline-inputs: per-day deck groups', () => {
  const prod = resolveProductionGradeInputs('SY2627');
  const config = { ...prod.config, useV3: true, pcTrack: { enabled: false } };
  const answerKeyDoc = prod.answerKey;
  const rows = [
    { item_id: 'BL-U4-L7-DESK_DAY', source: 'worksheet', score: 90, attempt: 1, topic: '4.7', recorded_at: '2026-11-20T16:00:00.000Z' },
    { item_id: 'BL-U4-L3-DESK_DAY', source: 'worksheet', score: 70, attempt: 1, topic: '4.3', recorded_at: '2026-11-20T16:00:00.000Z' },
  ];
  const servers = [];

  async function mount(deckSlices) {
    const app = express();
    mountOfflineInputs(app, {
      verifyToken: (t) => (t === 'good' ? 'stu_e' : null),
      ledgerDb: { getLedgerByStudent: async () => ({ data: rows }) },
      loadAnswerKey: async () => answerKeyDoc,
      lessonSchedule: prod.lessonSchedule,
      eventSchedule: prod.eventSchedule,
      db: { findByStudentId: async () => ({ data: { section: 'PeriodE' } }) },
      config,
      blooketPresence: prod.blooketPresence,
      blooketRequired: prod.blooketRequired,
      blooketBonusTopics: prod.blooketBonusTopics,
      deckSlices,
    });
    const server = http.createServer(app);
    servers.push(server);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const res = await fetch(`http://127.0.0.1:${server.address().port}/grade/offline-inputs?token=good`);
    return res.json();
  }

  afterAll(() => Promise.all(servers.map((s) => new Promise((r) => s.close(r)))));

  it('ships the groups for the student section as a list, not the slices file', async () => {
    const body = await mount(prod.deckSlices);
    expect(body.perDayGroups).toEqual(['4|7-8', '4|10-12']);
    expect(body).not.toHaveProperty('deckSlices');
    const withoutSlices = await mount(null);
    expect(withoutSlices.perDayGroups).toEqual([]);
  });

  it('the shipped groups re-derive the server grade', async () => {
    const body = await mount(prod.deckSlices);
    const asOf = Date.parse('2026-11-24T17:00:00.000Z');
    const common = {
      lessonSchedule: prod.lessonSchedule, eventSchedule: prod.eventSchedule, section: 'PeriodE', asOf,
      blooketPresence: prod.blooketPresence, blooketRequired: prod.blooketRequired, blooketBonusTopics: prod.blooketBonusTopics,
    };
    const server = computeGrade(rows, answerKeyDoc.answerKey, config, { ...common, deckSlices: prod.deckSlices });
    const device = computeGrade(rows, body.redactedKey, body.config, { ...common, perDayGroups: body.perDayGroups });
    expect(device).toEqual(server);
    expect(device.lessons.find((l) => l.lessonKey === '4.8').blooket).toBeNull();   // per-day: 2.9 not played
    expect(device.lessons.find((l) => l.lessonKey === '4.5').blooket).toBe(70);     // 4.3-5: one score
  });
});
