// @ts-check
// lesson-grade.js — Gradebook Phase 6 + W1 (worksheet blank scoring) + F2 (quarters-by-date).
//
// Pure functions for lesson-level aggregation + date filter.
// No I/O. Designed to be unit-tested independently of the server.
//
// Key design:
//   - parseItemLesson(itemId)  → { unit, lessonKey } or null
//   - expandLessonKey(unit, lessonKey, schedule) → [topicKey, ...]
//   - buildWorksheetBlankCounts(manifestDoc) → { "<unit>.<lessonKey>": <int> }
//   - computeLessonGrades(rows, frqBand, answerKey, schedule, opts) → Map<topicKey, lessonResult>
//   - quarterOfLesson(entry, period, config) → 'Q1'..'Q4'
//   - computeQuarterFromLessons({ quarterKey, config, lessonMap, schedule, ... })
//   - buildLessonsArray(lessonMap, schedule) → lessons[]

import { quarterOfDate, quarterOfUnit } from './grade-config.js';

// ── Item-ID → lesson parsing ───────────────────────────────────────────────────

// Patterns (per spec §1.2):
//   WS-U(\d+)L([\d-]+)-         → worksheet / frq
//   WS-U(\d+)-L(\d+)-DESK_DONE  → synthetic Desk Done for non-quiz artifact
//   CR-U(\d+)-L(\d+)-DESK_DONE  → synthetic Desk Done for quiz artifact
//   U(\d+)-L(\d+)-Q(\d+)        → curriculum_quiz
//   U(\d+)-PC-Q(\d+)            → PC (lessonKey = null; PC is unit-scoped)
//
// Returns { unit: number, lessonKey: string|null } or null on no match.
export function parseItemLesson(itemId) {
  if (typeof itemId !== 'string' || !itemId) return null;

  // WS-U{N}L{key}-... (worksheet items, FRQ items)
  // e.g. WS-U4L1-2-reflect1, WS-U1L2-Q5
  const wsMatch = itemId.match(/^WS-U(\d+)L([\d-]+)-/);
  if (wsMatch) {
    return { unit: Number(wsMatch[1]), lessonKey: wsMatch[2] };
  }

  // BLOOKET-U{N}L{key} (per-lesson Blooket, teacher-imported)
  // e.g. BLOOKET-U1L2 -> {unit:1, lessonKey:"2"}; BLOOKET-U4L1-2 -> {unit:4, lessonKey:"1-2"}
  const blMatch = itemId.match(/^BLOOKET-U(\d+)L([\d-]+)$/);
  if (blMatch) {
    return { unit: Number(blMatch[1]), lessonKey: blMatch[2] };
  }

  // WS-U{N}-L{n}-DESK_DONE
  const wsDeskMatch = itemId.match(/^WS-U(\d+)-L(\d+)-DESK_DONE/);
  if (wsDeskMatch) {
    return { unit: Number(wsDeskMatch[1]), lessonKey: wsDeskMatch[2] };
  }

  // CR-U{N}-L{n}-DESK_DONE
  const crDeskMatch = itemId.match(/^CR-U(\d+)-L(\d+)-DESK_DONE/);
  if (crDeskMatch) {
    return { unit: Number(crDeskMatch[1]), lessonKey: crDeskMatch[2] };
  }

  // BL-U{N}-L{key}-DESK_DONE — Blooket flashcard make-up self-attest. Bucketed
  // so the flashcard can stand in as the Blooket score when there's no game
  // score (BLOOKET_MAKEUP_BUILD.md). Still grade-INERT for Cws/quiz (it fails
  // BLANK_ITEM_PATTERN + isn't a curriculum_quiz). [key] allows combined topics.
  const blDeskMatch = itemId.match(/^BL-U(\d+)-L([\d-]+)-DESK_DONE/);
  if (blDeskMatch) {
    return { unit: Number(blDeskMatch[1]), lessonKey: blDeskMatch[2] };
  }

  // U{N}-PC-Q{n} (Progress Check — unit-scoped, no lesson)
  if (/^U\d+-PC-/i.test(itemId)) {
    const pcMatch = itemId.match(/^U(\d+)-PC-/i);
    if (pcMatch) return { unit: Number(pcMatch[1]), lessonKey: null };
  }

  // U{N}-L{n}-Q{n} (curriculum_quiz)
  const crMatch = itemId.match(/^U(\d+)-L(\d+)-Q/i);
  if (crMatch) {
    return { unit: Number(crMatch[1]), lessonKey: crMatch[2] };
  }

  return null;
}

// ── Expand a lessonKey to topic keys using the lesson schedule ─────────────────
//
// A worksheetKey like "1-2" in unit 4 maps to topics 4.1 AND 4.2
// (the schedule stores combinedWith for these). A solo key like "6" in unit 4
// maps to just ["4.6"].
//
// schedule: the lessons map from lesson-schedule.json (topicKey → entry).
// Returns an array of topicKeys (strings), empty if nothing matches.
export function expandLessonKey(unit, lessonKey, schedule, bonusTopics) {
  if (lessonKey === null) return [];

  // No schedule (Codex MAJOR 2 fold 2026-05-20): synthesize a topicKey so
  // the lesson-level aggregation still works in the graceful-degrade path.
  // Combined-worksheet expansion isn't recoverable without a schedule, so
  // the dashed key acts as its own topic — that bundles the FRQ/quiz items
  // under one synthetic lesson, which is a reasonable approximation when
  // we can't enumerate the real topics.
  if (!schedule) {
    return [`${unit}.${lessonKey}`];
  }

  // If the lessonKey contains dashes, it's a combined worksheet.
  // Find all topics in the given unit whose worksheetKey matches.
  if (lessonKey.includes('-')) {
    const matches = [];
    for (const [topicKey, entry] of Object.entries(schedule)) {
      if (entry && entry.unit === unit && entry.worksheetKey === lessonKey) {
        matches.push(topicKey);
      }
    }
    // A shared worksheet must not fan its rows into bonus topics — that
    // double-weights the worksheet and resurrects the topic as a graded
    // lesson (Codex HIGH, 2026-08-07: old-3.7 via the 3.6-7 worksheet).
    // Year-aware by construction: bonus = presence minus required, so the
    // SY2526 freeze (bonusTopics empty) keeps its historical expansion.
    if (bonusTopics && bonusTopics.size > 0) {
      const core = matches.filter((t) => !bonusTopics.has(t));
      if (core.length > 0) return core;
    }
    return matches;
  }

  // Solo key: construct the topicKey directly.
  const topicKey = `${unit}.${lessonKey}`;
  return schedule[topicKey] ? [topicKey] : [];
}

// ── buildWorksheetBlankCounts ─────────────────────────────────────────────────
//
// Walk manifest.units[].lessons[].activities[] where activity === 'worksheet',
// count itemIds matching /-Q\d+$/ (blanks only, not reflections/exitTickets),
// key by the manifest lesson value ("1.1", "4.1-2", etc.).
//
// manifestDoc: the parsed work-manifest.json object.
// Returns { "<unit>.<lessonKey>": <int> }
//
// Returns {} on any structural problem — callers treat missing keys as Cws null.
export function buildWorksheetBlankCounts(manifestDoc) {
  const counts = {};

  if (!manifestDoc || !Array.isArray(manifestDoc.units)) return counts;

  for (const unitEntry of manifestDoc.units) {
    if (!unitEntry || !Array.isArray(unitEntry.lessons)) continue;

    for (const lessonEntry of unitEntry.lessons) {
      if (!lessonEntry || typeof lessonEntry.lesson !== 'string') continue;
      if (!Array.isArray(lessonEntry.activities)) continue;

      let blankCount = 0;
      for (const activity of lessonEntry.activities) {
        if (!activity || activity.activity !== 'worksheet') continue;
        if (!Array.isArray(activity.itemIds)) continue;
        for (const itemId of activity.itemIds) {
          if (typeof itemId === 'string' && /-Q\d+$/.test(itemId)) {
            blankCount += 1;
          }
        }
      }

      // Key is the manifest lesson value verbatim ("1.1", "4.1-2", etc.)
      counts[lessonEntry.lesson] = blankCount;
    }
  }

  return counts;
}

// ── FRQ score → percentage (mirrors grade.js frqScoreToPct) ───────────────────

function frqScoreToPct(score, frqBand) {
  if (score === null || score === undefined || score === '') return null;
  const s = Number(score);
  if (!Number.isFinite(s)) return null;
  if (s >= 0.75) return frqBand.E;
  if (s >= 0.25) return frqBand.P;
  return frqBand.I;
}

// ── Blank itemId pattern (W1) ─────────────────────────────────────────────────
//
// Real worksheet blanks: WS-U{N}L{key}-Q{n}  (e.g. WS-U4L1-2-Q5)
// EXCLUDES: WS-U{N}-L{n}-DESK_DONE, WS-U{N}L{key}-reflect{n}, etc.
const BLANK_ITEM_PATTERN = /^WS-U(\d+)L([\d-]+)-Q\d+$/;

// ── computeLessonGrades ───────────────────────────────────────────────────────
//
// Walk the ledger rows (latest-per-item already resolved) and accumulate
// per-lesson FRQ, quiz, and worksheet-blank data. Returns a Map<topicKey,
// lessonResult> where:
//
//   lessonResult = {
//     topicKey,
//     frqItems: [{ itemId, score(pct|null), rawScore, ts }],
//     quizItems: [{ itemId, correct(bool), ts }],    // scored against key
//     worksheetItems: [{ itemId, ts, score }],       // blanks w/ numeric score
//     wsCountKey: string|null,                       // "<unit>.<lessonKey>"
//     Cws: number|null,  // worksheet blank pct (null if no manifest count)
//     W: number|null,    // mean frq pct (null if no gradable frq)
//     Q: number|null,    // quiz correctness % (null if no scorable quiz)
//     lessonGrade: number|null,  // weighted B, or null
//   }
//
// rows: array of ledger rows (latest-per-item pre-filtered).
// frqBand: { E, P, I } config.
// answerKey: map of itemId → { answerKey, ... } (for quiz scoring).
// schedule: topicKey → entry (to expand combined worksheets).
// opts: { worksheetBlankCounts, weights }
//   - worksheetBlankCounts: { "<unit>.<lessonKey>": <int> } or null/undefined
//   - weights: { ws, W, Q } — lessonFeederWeights; defaults to { ws:1, W:2, Q:3 }
//
// Note: this function intentionally does NOT filter by "due date" —
// that is applied at the quarter level in computeQuarterFromLessons.
export function computeLessonGrades(rows, frqBand, answerKey, schedule, opts) {
  const worksheetBlankCounts = (opts && opts.worksheetBlankCounts) || null;
  const bonusTopics = (opts && opts.bonusTopics instanceof Set)
    ? opts.bonusTopics
    : new Set((opts && opts.bonusTopics) || []);
  const weights = (opts && opts.weights) || { ws: 1, W: 2, Q: 3 };

  // lessonMap: topicKey → accumulator
  const byTopic = new Map();

  function ensure(topicKey) {
    if (!byTopic.has(topicKey)) {
      byTopic.set(topicKey, {
        topicKey,
        frqItems: [],
        quizItems: [],
        worksheetItems: [],
        wsCountKey: null,
        blankCount: null,       // manifest blank count for this worksheet (early-bonus coverage)
        blooket: null,          // 0..100 — RESOLVED: game score, else flashcard make-up, else null
        blooketGame: null,      // 0..100 from a real Blooket game row (source 'blooket')
        blooketFlashcard: null, // 0..100 from a BL-…-DESK_DONE flashcard pass (make-up)
        trainer: null,          // 0..100 — TI-84 trainer pct (mean over mapped procedures, missing=0)
        trainerProcScores: /** @type {Record<string, number>|null} */ (null), // procId → best 0..1
      });
    }
    return byTopic.get(topicKey);
  }

  function isCorrect(response, keyEntry) {
    if (!keyEntry || keyEntry.answerKey == null) return false;
    const r = normalizeResponse(response);
    if (r == null) return false;
    return r === String(keyEntry.answerKey).trim().toLowerCase();
  }

  function normalizeResponse(response) {
    if (response == null) return null;
    if (typeof response === 'string' || typeof response === 'number') {
      return String(response).trim().toLowerCase();
    }
    if (Array.isArray(response)) {
      return response.length ? normalizeResponse(response[0]) : null;
    }
    if (typeof response === 'object') {
      for (const k of ['value', 'answer', 'selected', 'choice', 'key']) {
        if (response[k] != null) return normalizeResponse(response[k]);
      }
    }
    return null;
  }

  // AI-review partial credit per quiz item (generalizes the s125 quiz_exception):
  //   source='quiz_review',    item_id `<base>#rev`, score = earned credit (1 / 2/3 / 1/3)
  //   source='quiz_exception', item_id `<base>#exc` (legacy E-only flip) = credit 1.0
  // Built before the scoring loop so row order doesn't matter. The review rows
  // match no scoring branch below (never double-counted); the #rev/#exc suffixes
  // keep them distinct from the quiz row under latestPerItem.
  const reviewCredit = new Map();
  for (const row of (Array.isArray(rows) ? rows : [])) {
    if (!row || typeof row.item_id !== 'string') continue;
    let base = null, credit = 0;
    if (row.source === 'quiz_review') {
      base = row.item_id.replace(/#rev$/i, '');
      const c = Number(row.score);
      credit = Number.isFinite(c) ? Math.min(Math.max(c, 0), 1) : 0;
    } else if (row.source === 'quiz_exception') {
      base = row.item_id.replace(/#exc$/i, '');
      credit = 1;
    }
    if (base) reviewCredit.set(base, Math.max(reviewCredit.get(base) || 0, credit));
  }

  // TI-84 trainer rows (source='trainer', item_id `TI84-<procedureId>`) carry no
  // unit/lesson in the id — the baked lesson map (opts.trainerMap: topicKey →
  // [procedureId]) buckets them, so they get their own pre-pass (they match no
  // parseItemLesson pattern and no source branch below — never double-counted).
  // Procedure ids are sanitized the same way the trainer client builds item_ids.
  // Unmapped procedures (incl. smoke probes like TI84-SMOKE-0016) are ignored.
  // Scores are 0..1 raise-only client-side; max() here is defensive against
  // multi-device races. GRADE-INERT unless config.trainer.weight > 0 — see
  // computeQuarterV3 (TI84_GRADE_INTEGRATION_SPEC.md §C).
  const trainerMap = (opts && opts.trainerMap) || null;
  if (trainerMap) {
    const procTopics = new Map();
    for (const [topicKey, procs] of Object.entries(trainerMap)) {
      if (!Array.isArray(procs)) continue;
      for (const proc of procs) {
        const procKey = String(proc).replace(/[^A-Za-z0-9-]/g, '-');
        if (!procTopics.has(procKey)) procTopics.set(procKey, []);
        procTopics.get(procKey).push(topicKey);
      }
    }
    for (const row of (Array.isArray(rows) ? rows : [])) {
      if (!row || row.source !== 'trainer' || typeof row.item_id !== 'string') continue;
      if (!row.item_id.startsWith('TI84-')) continue;
      // Reject null/blank/non-numeric BEFORE coercion (Number(null)===0 would
      // write a spurious 0) — mirrors the blooket guard.
      const raw = row.score;
      if (raw === null || raw === undefined || raw === '' || !Number.isFinite(Number(raw))) continue;
      const procKey = row.item_id.slice('TI84-'.length);
      const topics = procTopics.get(procKey);
      if (!topics) continue;
      const score = Math.min(1, Math.max(0, Number(raw)));
      for (const topicKey of topics) {
        const acc = ensure(topicKey);
        if (!acc.trainerProcScores) acc.trainerProcScores = {};
        const prev = acc.trainerProcScores[procKey];
        acc.trainerProcScores[procKey] = prev != null ? Math.max(prev, score) : score;
      }
    }
  }

  for (const row of (Array.isArray(rows) ? rows : [])) {
    if (!row || !row.item_id) continue;
    const parsed = parseItemLesson(row.item_id);
    if (!parsed) continue;
    const { unit, lessonKey } = parsed;
    if (lessonKey === null) continue; // PC items are unit-scoped, skip here

    const topicKeys = expandLessonKey(unit, lessonKey, schedule, bonusTopics);
    if (!topicKeys.length) continue;

    const ts = row.recorded_at || null;
    const src = row.source || '';

    for (const topicKey of topicKeys) {
      const acc = ensure(topicKey);

      // Blooket flashcard MAKE-UP (BL-…-DESK_DONE): a passed flashcard quiz that
      // stands in for the Blooket score when there's no game score. Its score is
      // 0..100 (the pass %, pinned at 80 by the 8/10 early-stop). Detected by
      // itemId so it works regardless of source; it never feeds Cws (fails
      // BLANK_ITEM_PATTERN) or the quiz track. (BLOOKET_MAKEUP_BUILD.md)
      if (/^BL-U\d+-L[\d-]+-DESK_DONE/.test(row.item_id)) {
        // Reject null/blank/non-numeric BEFORE coercion: Number(null)===0 and
        // Number('')===0 are finite, so a score-less row would otherwise write a
        // spurious 0 instead of leaving the make-up absent. Mirrors frqScoreToPct.
        const raw = row.score;
        if (raw !== null && raw !== undefined && raw !== '' && Number.isFinite(Number(raw))) {
          acc.blooketFlashcard = Math.min(100, Math.max(0, Number(raw)));
        }
      }

      if (src === 'frq') {
        const pct = frqScoreToPct(row.score, frqBand);
        acc.frqItems.push({ itemId: row.item_id, score: pct, rawScore: row.score, ts });
      } else if (src === 'curriculum_quiz') {
        const keyEntry = answerKey && answerKey[row.item_id];
        if (keyEntry && keyEntry.answerKey != null) {
          // Partial credit = max of the answer-key result (1/0) and any AI-review
          // credit (E=1, P=2/3, I=1/3) for this item. "correct" = full credit.
          const credit = Math.max(
            isCorrect(row.response, keyEntry) ? 1 : 0,
            reviewCredit.get(row.item_id) || 0
          );
          acc.quizItems.push({ itemId: row.item_id, correct: credit >= 1, credit, ts });
        }
        // ungradable quiz item — don't add to quizItems
      } else if (src === 'worksheet') {
        // Only real blanks count for Cws. DESK_DONE and reflections are excluded.
        if (BLANK_ITEM_PATTERN.test(row.item_id)) {
          // Treat null or non-numeric score as 0 (unattempted blank = 0 points).
          const rawScore = row.score;
          const numScore = (rawScore !== null && rawScore !== undefined && Number.isFinite(Number(rawScore)))
            ? Number(rawScore)
            : 0;
          acc.worksheetItems.push({ itemId: row.item_id, ts, score: numScore });
          // Record the count key for manifest lookup.
          // All blanks in a lesson share the same "<unit>.<lessonKey>".
          if (acc.wsCountKey === null) {
            acc.wsCountKey = `${unit}.${lessonKey}`;
          }
        }
      } else if (src === 'blooket') {
        // Real Blooket GAME score (teacher CSV import), stored 0..1 (no answer
        // key). Latest row wins (pre-deduped via latestPerItem). Kept on 0..100.
        // The GAME score is preferred over the flashcard make-up at finalize.
        // Reject null/blank/non-numeric before coercion (Number(null)===0 would
        // write a spurious 0 = "played and bombed" for a score-less row).
        const raw = row.score;
        if (raw !== null && raw !== undefined && raw !== '' && Number.isFinite(Number(raw))) {
          acc.blooketGame = Math.min(1, Math.max(0, Number(raw))) * 100;
        }
      }
    }
  }

  // Now compute Cws, W, Q, lessonGrade for each topic.
  const wsWeight = weights.ws;
  const wWeight  = weights.W;
  const qWeight  = weights.Q;

  // Per-topic total gradable quiz questions (the Q denominator), so Q scores
  // correct / WHOLE-quiz (unanswered = wrong), mirroring how Cws uses the full
  // blank count. Computed once from the answer key.
  const quizTotals = computeQuizTotals(answerKey, schedule);

  for (const [, acc] of byTopic) {
    // Cws = clamp((sum of blank scores) / blankCount, 0, 1) * 100
    // blankCount = manifest count for this lesson (DENOMINATOR = ALL blanks,
    // not just recorded ones — unattempted blanks contribute 0 to numerator).
    let Cws = null;
    if (worksheetBlankCounts && acc.wsCountKey !== null) {
      const blankCount = worksheetBlankCounts[acc.wsCountKey];
      acc.blankCount = blankCount && blankCount > 0 ? blankCount : null;
      if (blankCount && blankCount > 0) {
        const scoreSum = acc.worksheetItems.reduce((s, w) => s + w.score, 0);
        const rawFrac = scoreSum / blankCount;
        Cws = Math.min(Math.max(rawFrac, 0), 1) * 100;
      }
    }

    // W = mean of graded frqItems (null-score items excluded from denominator)
    const gradableFrqs = acc.frqItems.filter(f => f.score != null);
    const W = gradableFrqs.length > 0
      ? gradableFrqs.reduce((s, f) => s + f.score, 0) / gradableFrqs.length
      : null;

    // Q = correctness % over the WHOLE quiz (DENOMINATOR = total quiz questions
    // from the answer key, mirroring Cws — unanswered questions contribute 0 to
    // the numerator, so 1-right-of-3 = 33%, not 100%). Only when the student has
    // ATTEMPTED the quiz; a wholly un-attempted quiz stays null so it never
    // tanks a not-yet-taken lesson (the v3 due-by-today track logic decides
    // whether an absent quiz counts as 0). Defensive fallback to attempted count
    // if the topic's total is somehow unknown.
    let Q = null;
    if (acc.quizItems.length > 0) {
      const creditSum = acc.quizItems.reduce((s, q) => s + (q.credit || 0), 0);
      const quizDenom = (quizTotals[acc.topicKey] && quizTotals[acc.topicKey] > 0)
        ? quizTotals[acc.topicKey]
        : acc.quizItems.length;
      Q = (creditSum / quizDenom) * 100;
    }

    // B = three-way weighted mean, renormalized over PRESENT feeders
    let B = null;
    {
      let num = 0, den = 0;
      if (Cws != null) { num += wsWeight * Cws; den += wsWeight; }
      if (W   != null) { num += wWeight  * W;   den += wWeight; }
      if (Q   != null) { num += qWeight  * Q;   den += qWeight; }
      if (den > 0) B = num / den;
    }

    acc.Cws = Cws != null ? Math.round(Cws * 10) / 10 : null;
    acc.W = W != null ? Math.round(W * 10) / 10 : null;
    acc.Q = Q != null ? Math.round(Q * 10) / 10 : null;
    acc.lessonGrade = B != null ? Math.round(B * 10) / 10 : null;
    // Lessons-track value EXCLUDING the quiz feeder: {Cws, W} weighted (ws:W),
    // renormalized over present feeders. This is exactly computeQuarterV3's
    // lessonTrackValue (lessonGradeNoQuiz) — surfaced so the in-app/Schoology
    // "Follow-Along" cell can be the FULL worksheet grade (blanks + AI-graded
    // reflections), apples-to-apples with the v3 Lessons track. Additive; the
    // quarter math still recomputes its own value and is untouched.
    // Computed from the ROUNDED sibling feeders (acc.Cws/acc.W) — the exact inputs
    // computeQuarterV3's lessonTrackValue uses — so the in-app Follow-Along cell
    // equals the v3 Lessons-track value with no rounding-order drift (a stray sub-0.1
    // gap would otherwise read as a spurious Schoology-vs-v3 divergence).
    let Bnq = null;
    {
      let num = 0, den = 0;
      if (acc.Cws != null) { num += wsWeight * acc.Cws; den += wsWeight; }
      if (acc.W   != null) { num += wWeight  * acc.W;   den += wWeight; }
      if (den > 0) Bnq = num / den;
    }
    acc.lessonGradeNoQuiz = Bnq != null ? Math.round(Bnq * 10) / 10 : null;
    // Blooket (0..100): the BETTER of the two efforts — the real game score OR the
    // flashcard score (the timed full deck can legitimately reach 100%, so a strong
    // flashcard run beats a mediocre game, and vice-versa). Either may be null; the
    // present one wins, both null → null. Learning is rewarded, not penalized
    // (FLASHCARD_TIMED_DECK_BUILD.md, supersedes the old "game wins"). The quarter
    // track turns a missing-but-due Blooket into 0; null here = "no evidence yet."
    if (acc.blooketGame != null && acc.blooketFlashcard != null) {
      acc.blooket = Math.max(acc.blooketGame, acc.blooketFlashcard);
    } else if (acc.blooketGame != null) {
      acc.blooket = acc.blooketGame;
    } else if (acc.blooketFlashcard != null) {
      acc.blooket = acc.blooketFlashcard;
    } else {
      acc.blooket = null;
    }
    acc.blooket = acc.blooket != null ? Math.round(acc.blooket * 10) / 10 : null;

    // TI-84 trainer pct (0..100): mean over the topic's MAPPED procedures of the
    // best recorded score, a missing procedure counting 0 — transparent partial
    // progress that can only rise as more procedures are practiced. null = the
    // student has touched none of this topic's procedures ("no evidence yet",
    // same semantics as blooket); the quarter track turns missing-but-due into 0.
    acc.trainer = null;
    if (trainerMap && acc.trainerProcScores) {
      const procs = trainerMap[acc.topicKey];
      if (Array.isArray(procs) && procs.length > 0) {
        let sum = 0;
        for (const proc of procs) {
          const procKey = String(proc).replace(/[^A-Za-z0-9-]/g, '-');
          const s = acc.trainerProcScores[procKey];
          sum += s != null ? s : 0;
        }
        acc.trainer = Math.round((sum / procs.length) * 100 * 10) / 10;
      }
    }
  }

  return byTopic;
}

// ── "Today" in schoolTz ────────────────────────────────────────────────────────
//
// Returns YYYY-MM-DD string for the current moment in the given IANA timezone.
// Falls back to UTC if the timezone is unavailable.
export function todayInTz(tz, now) {
  const instant = now === undefined ? new Date() : new Date(now);
  try {
    // Use Intl.DateTimeFormat to render the current moment in the given timezone.
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant);
    const y = parts.find(p => p.type === 'year')?.value;
    const m = parts.find(p => p.type === 'month')?.value;
    const d = parts.find(p => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch (_) {
    // fallthrough to UTC
  }
  return instant.toISOString().slice(0, 10);
}

// ── Due semantics (SY2627, teacher 2026-09-03) ──────────────────────────────
//
// config.dueAfterLessonDay === true → a lesson is due once its lesson DAY HAS
// ENDED (11:59 PM school time): on the lesson date itself it is still "open",
// so a missing worksheet is not a 0 until the next day. Absent/false (the
// frozen SY2526 config) → the original rule: due from the start of the day.
export function isDateDue(dateStr, todayDateStr, config) {
  if (!dateStr || !todayDateStr) return false;
  if (config && config.dueAfterLessonDay) return dateStr < todayDateStr;
  return dateStr <= todayDateStr;
}

// Epoch ms of 23:59:59 on a YYYY-MM-DD date in an IANA timezone (the deadline
// instant used by the early-completion bonus). Falls back to UTC.
export function endOfDayEpochInTz(dateStr, tz) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 23, 59, 59);
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(guess));
    const g = (k) => Number(parts.find((p) => p.type === k).value);
    const asIfUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
    return guess - (asIfUtc - guess);
  } catch (_) {
    return guess;
  }
}

function stampOf(it) {
  if (!it || it.ts == null) return NaN;
  return typeof it.ts === 'number' ? it.ts : Date.parse(it.ts);
}

// When a lesson's worksheet work was last submitted (epoch ms), from the
// recorded_at stamps on its worksheet + FRQ items. null when nothing is stamped.
export function lessonCompletedAt(result) {
  if (!result) return null;
  let latest = null;
  for (const list of [result.worksheetItems, result.frqItems]) {
    if (!Array.isArray(list)) continue;
    for (const it of list) {
      const t = stampOf(it);
      if (Number.isFinite(t) && (latest === null || t > latest)) latest = t;
    }
  }
  return latest;
}

// The instant (epoch ms) at which a worksheet reached `minComplete` coverage of
// its blanks — the k-th earliest recorded_at among its blank rows, with
// k = ceil(minComplete × blankCount). This is what the early bonus judges:
//   - one blank is never "done" (needs ≥ 80% of the blanks by default);
//   - a later edit, appeal or FRQ regrade moves ONE row's stamp, which cannot
//     drag the k-th earliest past the deadline unless most rows moved;
//   - FRQ / AI-grade stamps are ignored (grading time is not the student's).
// Unknown blankCount → every stamped row must be in (k = all rows, ≥ 1).
export function worksheetCoverageReachedAt(result, minComplete) {
  if (!result || !Array.isArray(result.worksheetItems)) return null;
  const stamps = result.worksheetItems.map(stampOf).filter(Number.isFinite).sort((a, b) => a - b);
  if (stamps.length === 0) return null;
  const blanks = Number.isFinite(result.blankCount) && result.blankCount > 0 ? result.blankCount : null;
  const frac = Number.isFinite(minComplete) && minComplete > 0 && minComplete <= 1 ? minComplete : 0.8;
  const need = blanks ? Math.max(1, Math.ceil(frac * blanks)) : stamps.length;
  if (stamps.length < need) return null;
  return stamps[need - 1];
}

// ── Progress Check schedule (SY2627, keyed by NEW CED unit) ─────────────────
//
// lesson-schedule.json carries progressChecks[newUnit] = { periods:{B,E} (Day 1),
// adminDay2:{B,E} }. PC item ids (U{n}-PC-…), pc_bank and the Desk's U{n}-PC*
// tiles all mean the NEW unit, so the PC track must place and date PCs from
// these entries — never from the OLD-unit lesson band. Absent (frozen SY2526,
// tests without an event schedule) → the legacy old-unit proxy still applies.
export function pcDatesFor(eventSchedule, period) {
  const pcs = eventSchedule && eventSchedule.progressChecks;
  if (!pcs || typeof pcs !== 'object') return null;
  const out = {};
  for (const [key, entry] of Object.entries(pcs)) {
    const unit = Number(key);
    if (!Number.isFinite(unit) || !entry || typeof entry !== 'object') continue;
    const periods = (entry.periods && typeof entry.periods === 'object') ? entry.periods : {};
    const day1 = period ? (periods[period] || null) : (periods.B || periods.E || null);
    let day2 = null;
    if (entry.adminDay2 && typeof entry.adminDay2 === 'object') {
      day2 = period ? (entry.adminDay2[period] || null) : (entry.adminDay2.B || entry.adminDay2.E || null);
    } else if (typeof entry.adminDay2 === 'string') {
      day2 = entry.adminDay2;
    }
    out[unit] = { day1, day2: day2 || day1 };
  }
  return Object.keys(out).length ? out : null;
}

// NEW units whose PC becomes DUE inside quarterKey's window (Day 2 — the same
// instant pcDueFor gates on, so a PC can never be banded into a quarter that
// closes before it is due; E's U5 PC is Day 1 04-14 / Day 2 04-16 across the
// Q3→Q4 line and lands in Q4). Ascending.
export function pcUnitsInQuarter(eventSchedule, period, config, quarterKey) {
  const dates = pcDatesFor(eventSchedule, period);
  if (!dates) return null;
  return Object.keys(dates).map(Number)
    .filter((u) => dates[u].day2 && quarterOfDate(dates[u].day2, config) === quarterKey)
    .sort((a, b) => a - b);
}

// Extract the single-letter period key from a section string.
// "PeriodB" → "B", "PeriodE" → "E", "B" → "B", etc.
// Returns null if it can't be extracted.
export function sectionToPeriod(section) {
  if (!section) return null;
  // PeriodX is the live universal section. The Desk shows it on Period E's
  // schedule (boot forces cP='E'), so the grade engine's due-date filter AND the
  // teacher-dashboard `due` flag must read E's dates too — NOT the B-OR-E union
  // that a null period triggers (which marked lessons due early → premature zeros).
  if (String(section).toUpperCase() === 'PERIODX') return 'E';
  const m = String(section).match(/([BE])$/i);
  return m ? m[1].toUpperCase() : null;
}

// ── quarterOfLesson ───────────────────────────────────────────────────────────
//
// The quarter a scheduled lesson belongs to. Date-driven, with a
// unit-band fallback for a lesson that has no usable date.
//   entry  -- a lesson-schedule entry { unit, periods: {B,E}, ... }
//   period -- 'B' | 'E' | null  (from sectionToPeriod)
// Returns 'Q1'..'Q4' (quarterOfUnit always resolves for units 1-9).
export function quarterOfLesson(entry, period, config) {
  const periods = (entry && entry.periods) || {};
  // A known section uses ONLY that section's date. A null there means
  // "not scheduled for this section" -> fall through to the unit-band
  // path; do NOT borrow the other section's date (that would disagree
  // with isDue and break the F2 contract). The B/E union is used only
  // when the section itself is unknown (Codex F2 review, MAJOR).
  let date = period ? (periods[period] || null)
                    : (periods.B || periods.E || null);
  if (date) {
    const q = quarterOfDate(date, config);
    if (q) return q;
  }
  return quarterOfUnit(entry && entry.unit, config);
}

// ── deriveQuarterBands ────────────────────────────────────────────────────────
// Placement rule: majority of the unit's dated lessons (ties → earlier quarter).
//
// Which UNITS belong to which quarter, derived from the SCHEDULE DATES — the
// same date logic quarterOfLesson uses for lessons — instead of the static
// config.quarters[q].units list. Rule: a unit belongs to the quarter of its
// LATEST in-window scheduled lesson date for the student's period (a unit's
// PC / roll-up lands where the unit finishes; mirrors unitPcDue). Units with
// no usable date keep their configured quarter (graceful fallback), and a
// missing/malformed schedule returns the configured bands unchanged. Every
// unit appears in exactly one quarter; each band is sorted numerically.
//
//   config             -- PHASE3_CONFIG-shaped ({ quarters: { Q1: { units, start, end } } })
//   schedule           -- topicKey → { unit, periods: { B, E } } (or null)
//   period             -- 'B' | 'E' | null (from sectionToPeriod)
//   gradingWindowStart -- cohort window start (or null): stale prior-cohort dates ignored
// Returns { Q1: number[], Q2: number[], ... } for every key in config.quarters.
export function deriveQuarterBands(config, schedule, period, gradingWindowStart) {
  const quarterKeys = Object.keys((config && config.quarters) || {});
  const configured = {};
  for (const q of quarterKeys) {
    const u = config.quarters[q] && Array.isArray(config.quarters[q].units) ? config.quarters[q].units : [];
    configured[q] = u.slice();
  }
  if (!schedule || typeof schedule !== 'object') return configured;

  // Count each unit's in-window dated lessons per quarter for this period.
  // A unit lands in the quarter holding MOST of its lessons (ties → the earlier
  // quarter). SY2627 fix (2026-09-05): the previous "latest date" rule put ALL of
  // old Unit 1 into Q2 because 1.10 (the Normal distribution, now CED 2.11) is
  // taught in November — Q1 showed nothing while the first month's work sat in Q2.
  const countsByUnit = new Map();   // unitNum -> Map(quarterKey -> lesson count)
  for (const entry of Object.values(schedule)) {
    if (!entry || !Number.isFinite(Number(entry.unit))) continue;
    const unitNum = Number(entry.unit);
    const periods = (entry.periods && typeof entry.periods === 'object') ? entry.periods : {};
    const b = periods.B == null ? null : periods.B;
    const e = periods.E == null ? null : periods.E;
    if (gradingWindowStart && !(b == null && e == null)) {
      const bIn = b != null && b >= gradingWindowStart;
      const eIn = e != null && e >= gradingWindowStart;
      if (!bIn && !eIn) continue; // stale prior-cohort entry
    }
    const d = period ? (periods[period] || null) : (b || e || null);
    if (!d || typeof d !== 'string') continue;
    const q = quarterOfDate(d, config);
    if (!q) continue;
    if (!countsByUnit.has(unitNum)) countsByUnit.set(unitNum, new Map());
    const counts = countsByUnit.get(unitNum);
    counts.set(q, (counts.get(q) || 0) + 1);
  }

  const bands = {};
  for (const q of quarterKeys) bands[q] = [];
  const placed = new Set();
  for (const [unitNum, counts] of countsByUnit) {
    let bestQ = null, bestN = -1;
    for (const q of quarterKeys) {           // quarterKeys are in calendar order → ties go earlier
      const n = counts.get(q) || 0;
      if (n > bestN) { bestQ = q; bestN = n; }
    }
    if (!bestQ || !bands[bestQ]) continue;
    bands[bestQ].push(unitNum);
    placed.add(unitNum);
  }
  // Fallback: configured units the schedule could not place keep their quarter.
  for (const q of quarterKeys) {
    for (const unitNum of configured[q]) {
      if (!placed.has(unitNum)) { bands[q].push(unitNum); placed.add(unitNum); }
    }
  }
  for (const q of quarterKeys) bands[q].sort((a, b) => a - b);
  return bands;
}

// ── computeQuarterFromLessons ─────────────────────────────────────────────────
//
// F2 (quarters-by-date): the quarter a lesson belongs to is date-driven.
// A lesson whose scheduled date falls in a quarter window is assigned to
// that quarter, regardless of its unit band. A lesson with no usable date
// falls back to quarterOfUnit (graceful degradation).
//
// params:
//   quarterKey  -- 'Q1'..'Q4' (replaces the old quarterBand array)
//   config      -- PHASE3_CONFIG (or a test config)
//   lessonMap   -- Map<topicKey, { lessonGrade, ... }>
//   schedule    -- topicKey → { unit, periods: { B, E }, ... }
//   todayDateStr -- "YYYY-MM-DD"
//   section     -- "PeriodB" / "PeriodE" / "B" / "E" / null
//   pcBandData  -- { P_quarter: number }
//   C           -- cap (default 85)
//   gradingWindowStart -- cohort window start (or null)
//
// Returns:
//   {
//     quarterGrade: number|null,
//     ceiling: number|null,
//     lessonsDue: number,
//     lessonsGraded: number,
//     lessonsTotal: number,
//   }
export function computeQuarterFromLessons({
  quarterKey,
  config,
  lessonMap,
  schedule,
  todayDateStr,
  section,
  pcBandData,
  C = 85,
  gradingWindowStart = /** @type {string|null} */ (null),
}) {
  const period = sectionToPeriod(section); // "B" | "E" | null

  // Helper: is this lesson entry IN the active cohort's grading window?
  // A lesson stays in the band if EITHER period date is unset (null/missing —
  // not yet scheduled for this cohort) OR a period date is >= the window
  // start. A lesson with BOTH dates strictly before the start is treated as
  // a stale prior-year entry and excluded entirely. 2026-05-20 fold: prior
  // SY25-26 dates (April-2026 etc.) were polluting Q3/Q4 with phantom
  // "past-due" lessons that nobody in this cohort was supposed to do.
  function inWindow(entry) {
    if (!gradingWindowStart) return true;
    const periods = (entry && entry.periods) || {};
    const b = periods.B;
    const e = periods.E;
    // Null/missing dates are NOT excluded — those are "not yet scheduled"
    // for this cohort and should stay in the band (so they count toward
    // lessonsTotal once the teacher fills them in).
    if (b == null && e == null) return true;
    if (b != null && b >= gradingWindowStart) return true;
    if (e != null && e >= gradingWindowStart) return true;
    return false;
  }

  // All lessons assigned to this quarter (those that exist in the schedule AND
  // are in the active grading window). F2: assignment is date-driven via
  // quarterOfLesson (falls back to unit band for null-date entries).
  // Codex MAJOR 3 fold (2026-05-20): defensive skip on malformed entries —
  // per-entry corruption must not crash this loop or the iteration that
  // follows. Treat any entry missing `unit` as if it weren't in the schedule.
  const bandLessons = [];
  for (const [topicKey, entry] of Object.entries(schedule)) {
    if (!entry || typeof entry !== 'object' || typeof entry.unit !== 'number') continue;
    if (quarterOfLesson(entry, period, config) !== quarterKey) continue;
    if (!inWindow(entry)) continue;
    bandLessons.push(topicKey);
  }

  const lessonsTotal = bandLessons.length;

  if (lessonsTotal === 0) {
    return {
      quarterGrade: null,
      ceiling: null,
      lessonsDue: 0,
      lessonsGraded: 0,
      lessonsTotal: 0,
    };
  }

  // Determine which lessons are "due" by today.
  // A lesson is due if its period's date <= todayDateStr.
  // If section unknown, use the union (due if EITHER period's date <= today).
  function isDue(topicKey) {
    const entry = schedule[topicKey];
    if (!entry || typeof entry !== 'object') return false;
    const periods = entry.periods && typeof entry.periods === 'object' ? entry.periods : {};
    if (period) {
      const dueDate = periods[period];
      if (!dueDate) {
        // No date for this period — treat as not-yet-due (future).
        return false;
      }
      return isDateDue(dueDate, todayDateStr, config);
    }
    // Unknown section: due if EITHER B or E is due.
    const bDue = isDateDue(periods.B, todayDateStr, config);
    const eDue = isDateDue(periods.E, todayDateStr, config);
    return !!(bDue || eDue);
  }

  // 2026-05-20 v2: include any lesson with recorded work in dueLessons,
  // even if its due date is in the future or null. The student's grade
  // should reflect work they've actually completed — silently ignoring
  // ahead-of-schedule work (or pre-cohort work) is confusing UX. The
  // teacher's mental model: "if work is done, count it." After the cohort
  // starts, due-by-date lessons join in (still counted as 0 if ungraded).
  const dueLessons = bandLessons.filter((topicKey) => {
    if (isDue(topicKey)) return true;
    const result = lessonMap.get(topicKey);
    return !!(result && result.lessonGrade != null);
  });
  const lessonsDue = dueLessons.length;

  if (lessonsDue === 0) {
    // Nothing due yet AND no PC? → null quarterGrade.
    const P_quarter = pcBandData && pcBandData.P_quarter > 0 ? pcBandData.P_quarter : 0;
    const quarterGrade = P_quarter > 0 ? P_quarter : null;
    return {
      quarterGrade,
      ceiling: null,
      lessonsDue: 0,
      lessonsGraded: 0,
      lessonsTotal,
    };
  }

  // Separate due lessons into graded and ungraded.
  let gradedSum = 0;
  let gradedCount = 0;

  for (const topicKey of dueLessons) {
    const result = lessonMap.get(topicKey);
    const lg = result ? result.lessonGrade : null;
    if (lg != null) {
      gradedSum += lg;
      gradedCount += 1;
    }
  }

  // rawQuarter = sum(graded) / len(due)  [ungraded-due count as 0 in numerator]
  const rawQuarter = gradedSum / lessonsDue;

  const banked = Math.min(rawQuarter, C);
  const P_quarter = pcBandData && pcBandData.P_quarter > 0 ? pcBandData.P_quarter : 0;
  const quarterGrade = Math.round(Math.max(banked, P_quarter) * 10) / 10;

  // Ceiling: best-case if student aces every unfinished lesson.
  // remaining = future lessons (not yet due)
  // unattempted = due but no grade
  const remaining = lessonsTotal - lessonsDue;
  const unattempted = lessonsDue - gradedCount;
  let ceiling = null;
  if (remaining > 0 || unattempted > 0) {
    const maxRest = (remaining + unattempted) * 100;
    ceiling = Math.round(((gradedSum + maxRest) / lessonsTotal) * 10) / 10;
  }

  return {
    quarterGrade,
    ceiling,
    lessonsDue,
    lessonsGraded: gradedCount,
    lessonsTotal,
  };
}

// ── v3 grading model (GRADING_MODEL_V3_BUILD.md) ──────────────────────────────
//
// Two-track max/mean conditional that supersedes the Phase 6 mean(lessonGrade)
// quarter grade. Gated behind config.useV3 (env USE_V3_GRADING); the Phase 6
// path above is left untouched. See GRADING_MODEL_V3_BUILD.md for the formula,
// worked examples, and pedagogy.

// Work-track weights. A track contributes only when present (non-null); the
// weights renormalize over present tracks (same pattern as computeLessonGrades'
// B blend). Posters + Blooket have no data source yet (v3.4 / v3.5), so today
// only Lessons + Quizzes are present → workAvg = mean(lessons, quizzes).
export const V3_WORK_WEIGHTS = { lessons: 0.30, quizzes: 0.30, posters: 0.30, blooket: 0.10 };

// The two gating constants for quarterGradeV3, default values. `floor` is the
// 40% both-tracks-cleared threshold that unlocks max(pc, work); `ceiling` is the
// 0.7-of-a-single-track bound on single-track gaming. Surfaced as a default so a
// policy sweep / config can retune them WITHOUT editing this file (GRADE_SIMULATION
// FINDING F2). computeQuarterV3 reads config.v3Gates and passes it through.
export const V3_GATES = { floor: 0.40, ceiling: 0.70 };

// The core v3 quarter formula. Both args on [0, 1]; returns [0, 1].
//   both tracks >= floor → max(pc, work)                          (either path → 100%)
//   otherwise            → max(ceiling*pc, ceiling*work, mean(pc, work))
// The floor gates the max-of-two; the ceiling-of-track bounds single-track
// gaming. Defaults (floor 0.40, ceiling 0.70) are verbatim from the spec.
export function quarterGradeV3(pcAvg, workAvg, gates = V3_GATES) {
  const floor = gates && gates.floor != null ? gates.floor : V3_GATES.floor;
  const ceiling = gates && gates.ceiling != null ? gates.ceiling : V3_GATES.ceiling;
  if (pcAvg >= floor && workAvg >= floor) return Math.max(pcAvg, workAvg);
  return Math.max(ceiling * pcAvg, ceiling * workAvg, (pcAvg + workAvg) / 2);
}

// Weighted blend of the four work tracks, renormalized over present tracks.
// tracks: { lessons, quizzes, posters, blooket } each [0,1] or null (absent).
// Returns [0,1], or null when no track is present.
export function workAvgV3(tracks, weights = V3_WORK_WEIGHTS) {
  let num = 0, den = 0;
  for (const key of Object.keys(weights)) {
    const v = tracks ? tracks[key] : null;
    if (v == null) continue;
    num += weights[key] * v;
    den += weights[key];
  }
  if (den === 0) return null;
  return num / den;
}

// Combine a PC-track avg and a Work-track avg into a [0,1] quarter grade,
// tolerating a missing (null) track. A track is null when nothing in it is due
// yet — we must NOT penalize a student for an un-scheduled track, so the
// present track alone sets the grade until BOTH tracks have due assignments.
export function combineV3(pcAvg, workAvg, gates = V3_GATES) {
  if (pcAvg == null && workAvg == null) return null;
  if (pcAvg == null) return workAvg;
  if (workAvg == null) return pcAvg;
  return quarterGradeV3(pcAvg, workAvg, gates);
}

// Per-lesson grade EXCLUDING the curriculum-quiz feeder (v3 splits quizzes into
// their own track). Weighted blend of {Cws, W} renormalized over present
// feeders, on 0..100. null when neither feeder is present.
function lessonGradeNoQuiz(result, weights, fixCwsReveal = false) {
  if (!result) return null;
  let num = 0, den = 0;
  if (result.Cws != null) { num += weights.ws * result.Cws; den += weights.ws; }
  if (result.W   != null) { num += weights.W  * result.W;   den += weights.W; }
  if (den === 0) return null;
  const blended = num / den;
  // FINDING F3 fix (flagged off by default): the Cws feeder is null (ignored, W
  // carries the lesson) until the FIRST blank, then counts the unfilled blanks as
  // 0 — so doing one of four blanks drops the lesson 100→75. With the fix, doing
  // blanks can only RAISE the lesson, never fall below its FRQ-only (W) value.
  // (When W is absent, Cws stands alone unchanged.) See GRADE_FIX_F1_F3_BUILD.md.
  if (fixCwsReveal && result.W != null) return Math.max(blended, result.W);
  return blended;
}

// [0,1] → 0..100 with one-decimal rounding (the 0..100 response surface).
function to100(x) { return x == null ? null : Math.round(x * 1000) / 10; }

// computeQuarterV3 — the v3 replacement for computeQuarterFromLessons.
//
// Same inputs + a per-unit raw PC% map; returns the same shape PLUS pcAvg and
// workAvg (0..100). Lessons are assigned to a quarter date-driven (like Phase
// 6); PCs are bucketed by unit→quarter band (like Phase 6 P_quarter).
//
// params:
//   quarterKey   -- 'Q1'..'Q4'
//   config       -- PHASE3_CONFIG (or a test config)
//   lessonMap    -- Map<topicKey, { Cws, W, Q, lessonGrade, ... }>
//   schedule     -- topicKey → { unit, periods: { B, E }, ... }
//   todayDateStr -- "YYYY-MM-DD"
//   section      -- "PeriodB" / "PeriodE" / "B" / "E" / null
//   unitPcData   -- { [unitNum]: rawPct|null }  (raw PC % per unit, or null)
//   gradingWindowStart -- cohort window start (or null)
//   workTracks   -- { posters, blooket } each [0,1] or null (future; default null)
//
// Returns { quarterGrade, ceiling, lessonsDue, lessonsGraded, lessonsTotal,
//           pcAvg, workAvg } — quarterGrade/ceiling/pcAvg/workAvg on 0..100.
export function computeQuarterV3({
  quarterKey,
  config,
  lessonMap,
  schedule,
  todayDateStr,
  section,
  unitPcData,
  gradingWindowStart = /** @type {string|null} */ (null),
  workTracks = /** @type {{posters?: number|null}|null} */ (null),
  blooketLessons = /** @type {string[]|null} */ (null),   // [topicKey] that HAVE a Blooket — the Blooket-track denominator
  quizLessons = /** @type {string[]|null} */ (null),      // [topicKey] that HAVE a quiz — the Quiz-track denominator
  trainerLessons = /** @type {string[]|null} */ (null),   // [topicKey] with mapped TI-84 skills — the trainer-track denominator
  eventSchedule = /** @type {any} */ (null),               // { progressChecks, posters } keyed by NEW unit (SY2627)
}) {
  const period = sectionToPeriod(section);
  const lessonWeights = (config && config.lessonFeederWeights) || { ws: 1, W: 2, Q: 3 };
  const excludeQuiz = !(config && config.v3LessonsExcludeQuiz === false); // default true
  // F2: the v3 Work-track weights + the floor/ceiling gates are config-tunable,
  // defaulting to today's frozen values (behavior-identical when absent).
  const workWeights = (config && config.v3WorkWeights) || V3_WORK_WEIGHTS;
  const gates = (config && config.v3Gates) || V3_GATES;

  // Perverse-incentive fixes (GRADE_FIX_F1_F3_BUILD.md), all DEFAULT-OFF so
  // production grades + pinned tests are unchanged until the teacher opts in.
  const fixCwsReveal = !!(config && config.v3FixCwsReveal);            // F3
  const fixQuizZero  = !!(config && config.v3FixQuizZero);             // F1-B
  const aheadMode    = (config && config.v3AheadOfScheduleLessons) || 'count-all'; // F1-A

  // The Lessons-track value for one topic (respects the exclude-quiz flag).
  function lessonTrackValue(r) {
    if (excludeQuiz) return lessonGradeNoQuiz(r, lessonWeights, fixCwsReveal);
    return r && r.lessonGrade != null ? r.lessonGrade : null;
  }

  // ── Band lessons in the active grading window (mirrors computeQuarterFromLessons) ──
  function inWindow(entry) {
    if (!gradingWindowStart) return true;
    const periods = (entry && entry.periods) || {};
    const b = periods.B, e = periods.E;
    if (b == null && e == null) return true;
    if (b != null && b >= gradingWindowStart) return true;
    if (e != null && e >= gradingWindowStart) return true;
    return false;
  }

  // SY2627 (2026-09-03): v3 buckets lessons by CALENDAR DATE (quarterOfLesson,
  // the same rule Phase 6 uses), no longer by the static old-unit band. The
  // real schedule teaches the OLD units in Fall-2026 CED order, so an old unit
  // now straddles quarters (old U2 = 2.1-2.3 in Oct, 2.4-2.8 in Jan-Mar; old
  // U8 taught in Dec). Unit banding put December work in Q4 and kept Q1
  // growing after it closed. A lesson counts in the quarter it was due; a
  // null-dated (bonus) entry still falls back to its unit band.
  // Gated by config.v3LessonsByDate so the FROZEN SY2526 config (which lacks
  // the flag) keeps its original unit-band bucketing — historical grades must
  // not move. The live SY2627 grade-config sets it.
  const lessonsByDate = !!(config && config.v3LessonsByDate);
  const bandLessons = [];
  for (const [topicKey, entry] of Object.entries(schedule)) {
    if (!entry || typeof entry !== 'object' || typeof entry.unit !== 'number') continue;
    const q = lessonsByDate ? quarterOfLesson(entry, period, config) : quarterOfUnit(entry.unit, config);
    if (q !== quarterKey) continue;
    if (!inWindow(entry)) continue;
    bandLessons.push(topicKey);
  }
  const lessonsTotal = bandLessons.length;

  function isDue(topicKey) {
    const entry = schedule[topicKey];
    if (!entry || typeof entry !== 'object') return false;
    const periods = entry.periods && typeof entry.periods === 'object' ? entry.periods : {};
    if (period) {
      const d = periods[period];
      return isDateDue(d, todayDateStr, config);
    }
    const bDue = isDateDue(periods.B, todayDateStr, config);
    const eDue = isDateDue(periods.E, todayDateStr, config);
    return !!(bDue || eDue);
  }

  // Due = scheduled-due OR has recorded work (same convention as Phase 6).
  const dueLessons = bandLessons.filter((topicKey) => {
    if (isDue(topicKey)) return true;
    const r = lessonMap.get(topicKey);
    return !!(r && r.lessonGrade != null);
  });
  const lessonsDue = dueLessons.length;

  // ── Lessons track (worksheet blanks + FRQ; quiz excluded by default) ──
  // Denominator = ALL due lessons: every lesson has a worksheet, so a null is
  // genuinely "no work done" = 0 (an ungraded-due lesson legitimately tanks it).
  //
  // FINDING F1-A fix (flagged; default 'count-all' = today): an ahead-of-schedule
  // lesson (has work but NOT scheduled-due) joining the denominator at a low value
  // can DRAG the grade down — doing future work poorly hurts you. The lessons the
  // LESSONS TRACK counts depend on the mode (quiz/blooket/reporting untouched):
  //   'count-all'     — scheduled-due OR has-work (today's behavior).
  //   'not-until-due' — scheduled-due only; early work simply waits to count.
  //   'only-helps'    — scheduled-due always, PLUS early lessons whose value is
  //                     >= the scheduled-due average (early work can lift, never drag).
  const scheduledDue = bandLessons.filter(isDue);
  let lessonTrackKeys = dueLessons;
  if (aheadMode !== 'count-all' && scheduledDue.length > 0) {
    if (aheadMode === 'not-until-due') {
      lessonTrackKeys = scheduledDue;
    } else if (aheadMode === 'only-helps') {
      let s = 0;
      for (const tk of scheduledDue) {
        const lv = lessonTrackValue(lessonMap.get(tk));
        s += lv != null ? lv : 0; // a scheduled-due lesson with no work counts as 0
      }
      const schedAvg = s / scheduledDue.length;
      const aheadKept = dueLessons.filter((tk) => {
        if (isDue(tk)) return false; // scheduled-due handled above
        const lv = lessonTrackValue(lessonMap.get(tk));
        return lv != null && lv >= schedAvg; // early work counts only if it lifts
      });
      lessonTrackKeys = [...scheduledDue, ...aheadKept];
    }
  }
  // Degenerate (all-early student, no scheduled-due lesson): fall back to
  // count-all so they still get a grade rather than a null lessons track.

  let lessonSum = 0, lessonGradedCount = 0;
  for (const topicKey of lessonTrackKeys) {
    const r = lessonMap.get(topicKey);
    const lv = lessonTrackValue(r);
    if (lv != null) { lessonSum += lv; lessonGradedCount += 1; }
  }
  const lessonsAvg = lessonTrackKeys.length > 0 ? (lessonSum / lessonTrackKeys.length) / 100 : null;

  // ── Quizzes track (curriculum-quiz correctness) ──
  // Denominator = due lessons that HAVE a quiz (quizLessons), NOT all due lessons.
  // Most units have an opener (1.1, 4.1, 6.1...) + combined opener-halves with NO
  // quiz; counting those quiz-less lessons in the denominator unfairly dragged the
  // quiz average down — a perfect-quiz student still landed below 100. This mirrors
  // the Blooket track (blooketDue). An un-taken-but-due quiz on a quiz-BEARING
  // lesson still counts as 0 (engagement preserved). Back-compat: when quizLessons
  // is null (older caller / tests), fall back to the all-due-lessons denominator.
  const quizSet = quizLessons == null ? null : new Set(quizLessons);
  let quizSum = 0, quizDue = 0, quizDone = 0;
  const quizTodo = /** @type {string[]} */ ([]);
  // FINDING F1-B fix (flagged; default off): when on, a quiz-bearing lesson counts
  // only if scheduled-due OR actually attempted — so starting a FUTURE lesson's
  // worksheet doesn't turn its un-taken quiz into a 0 (mirrors the Blooket track's
  // `isDue || attempted` guard). Default (off): today's dueLessons (has-work) loop.
  const quizCandidates = fixQuizZero ? bandLessons : dueLessons;
  for (const topicKey of quizCandidates) {
    if (quizSet != null && !quizSet.has(topicKey)) continue; // quiz-less lesson excluded
    const r = lessonMap.get(topicKey);
    const q = r && r.Q != null ? r.Q : null;
    if (fixQuizZero && !(isDue(topicKey) || q != null)) continue; // early + un-attempted → not a 0
    quizDue += 1;
    if (q != null) { quizSum += q; quizDone += 1; }
    else { quizTodo.push(topicKey); } // due quiz-bearing lesson, not taken -> 0
  }
  const quizzesAvg = quizDue > 0 ? (quizSum / quizDue) / 100 : null;

  // -- Blooket track (BLOOKET_MAKEUP_BUILD.md) -- now a real per-lesson grade:
  // denominator = due lessons that HAVE a Blooket (blooketLessons), and a
  // missing-but-due Blooket counts as 0 (mirrors the lessons/quizzes tracks).
  // r.blooket is the real game score, else the flashcard make-up (80%), else
  // null→0. A lesson with NO Blooket is excluded from the denominator, so it is
  // never an unfair 0. If blooketLessons isn't supplied (older caller), the set
  // is empty → blooketAvg null → renormalized away (back-compat, no tank).
  // blooketDone = due Blooket lessons WITH a score (game or flashcard make-up);
  // blooketTodo = due Blooket lessons with NO score yet — the flashcard make-up
  // opportunities the grade coach surfaces (each can become an 80%).
  // Iterate bandLessons (NOT dueLessons): a Blooket-bearing lesson counts once
  // it's scheduled-due OR the student has already earned a Blooket score for it
  // (game or flashcard make-up). This mirrors the lessons track's "if the work is
  // done, count it" rule — lessonGrade EXCLUDES blooket, so an ahead-of-schedule
  // blooket-only lesson would otherwise be dropped and the earned score lost. A
  // not-due lesson with NO blooket score is skipped (future blookets are never
  // surfaced as missing). Drawing from bandLessons (not dueLessons) also keeps a
  // phantom 0 out of the lessons/quizzes tracks for that ahead-of-schedule lesson.
  const blooketSet = new Set(Array.isArray(blooketLessons) ? blooketLessons : []);
  const seenBlooketGroups = new Set();
  let blooketSum = 0, blooketDue = 0, blooketDone = 0;
  const blooketTodo = /** @type {string[]} */ ([]);
  for (const topicKey of bandLessons) {
    if (!blooketSet.has(topicKey)) continue;
    const r = lessonMap.get(topicKey);
    if (!(isDue(topicKey) || (r && r.blooket != null))) continue;
    // Collapse combined-worksheet constituents into ONE slot. A single combined
    // Blooket (e.g. BLOOKET-U4L1-2) attaches the SAME score to every constituent
    // topic (4.1 AND 4.2), so counting each separately would over-weight it vs a
    // solo Blooket. Group by unit|worksheetKey; fall back to the topicKey for
    // solo lessons (and test schedules with no worksheetKey) so solos are never
    // collapsed. No-op for today's all-solo Blooket set — guards a future rebake.
    const entry = schedule[topicKey];
    const groupKey = (entry && entry.worksheetKey != null)
      ? `${entry.unit}|${entry.worksheetKey}`
      : topicKey;
    if (seenBlooketGroups.has(groupKey)) continue;
    seenBlooketGroups.add(groupKey);
    blooketDue += 1;
    if (r && r.blooket != null) { blooketSum += r.blooket; blooketDone += 1; }
    else { blooketTodo.push(topicKey); }   // due but no score → 0, a make-up opportunity
  }
  const blooketAvg = blooketDue > 0 ? (blooketSum / blooketDue) / 100 : null;

  // ── TI-84 trainer track (TI84_GRADE_INTEGRATION_SPEC.md §C) ──
  // Mirrors the Blooket track: denominator = trainer-bearing lessons (topics in
  // the baked lesson map) that are scheduled-due OR already have a trainer score;
  // missing-but-due counts 0. No combined-group collapse: unlike a combined
  // Blooket row, trainer scores attach per-topic (distinct skills), so each
  // mapped topic is its own slot. ALWAYS visible (workTracks.trainer +
  // trainerDue/Done/Todo); COUNTED in workAvg only when config.trainer.weight>0
  // (0 today — enabling it renormalizes the other Work slices: teacher call).
  const trainerSet = new Set(Array.isArray(trainerLessons) ? trainerLessons : []);
  let trainerSum = 0, trainerDue = 0, trainerDone = 0;
  const trainerTodo = /** @type {string[]} */ ([]);
  for (const topicKey of bandLessons) {
    if (!trainerSet.has(topicKey)) continue;
    const r = lessonMap.get(topicKey);
    if (!(isDue(topicKey) || (r && r.trainer != null))) continue;
    trainerDue += 1;
    if (r && r.trainer != null) { trainerSum += r.trainer; trainerDone += 1; }
    else { trainerTodo.push(topicKey); }
  }
  const trainerAvg = trainerDue > 0 ? (trainerSum / trainerDue) / 100 : null;
  const trainerWeight = (config && config.trainer && Number(config.trainer.weight)) || 0;

  // ── PC track (raw PC % per unit, bucketed by unit→quarter band) ──
  // Per the spec, pcAvg is the mean of PCs DUE-BY-TODAY. A unit's PC is "due"
  // once the unit's last lesson is due-by-today (the PC is scheduled 1-2 days
  // after; this proxy avoids threading the PC-date channel and self-corrects
  // daily). Only window-current entries count — mirrors the lessons-track
  // inWindow filter so a stale prior-cohort date can't resurrect a phantom PC.
  //   due + attempted  → raw score (clamped to [0,1])
  //   due + no attempt → 0
  //   not due          → skipped: an un-due PC must NOT leak into pcAvg, or a
  //                      recorded-but-not-due PC with no due work would bypass
  //                      the 70% single-track ceiling. (Once a PC is due, that
  //                      unit's lessons are due too, so the floor engages.)
  // Date-derived unit band (deriveQuarterBands) — the static config list is
  // only the fallback for units the schedule cannot place.
  const band = deriveQuarterBands(config, schedule, period, gradingWindowStart)[quarterKey] || [];
  function unitPcDue(unitNum) {
    let latest = null;
    for (const [, entry] of Object.entries(schedule)) {
      if (!entry || entry.unit !== unitNum) continue;
      if (!inWindow(entry)) continue; // ignore stale prior-cohort entries
      const periods = (entry.periods && typeof entry.periods === 'object') ? entry.periods : {};
      const d = period ? periods[period] : (periods.B || periods.E);
      if (d && (latest === null || d > latest)) latest = d;
    }
    return isDateDue(latest, todayDateStr, config);
  }
  // PC track gate (PC_MAKEUP_PHASE2_GRADE_SPEC.md §C). OFF (config.pcTrack.enabled
  // === false) → the band loop is skipped entirely, so pcAvg stays null and
  // combineV3 short-circuits to the Work track. This is what keeps a due-but-
  // unattempted PC from silently counting as 0 (→ 70%-of-Work cap) the moment
  // the fall schedule's dates pass, until the teacher flips PC_TRACK_ENABLED.
  // Enabled UNLESS explicitly false so bespoke-config callers/tests still run PC.
  const pcEnabled = !(config && config.pcTrack && config.pcTrack.enabled === false);
  // SY2627: with an event schedule the PC band is the NEW units whose PC Day 1
  // falls in this quarter, and a PC is due once its Day 2 has ended. Without one
  // (frozen SY2526 / bespoke tests) the legacy old-unit proxy above applies.
  const pcDates = pcDatesFor(eventSchedule, period);
  const pcBand = pcDates ? pcUnitsInQuarter(eventSchedule, period, config, quarterKey) : band;
  const pcDueFor = pcDates
    ? (u) => isDateDue(pcDates[u] && pcDates[u].day2, todayDateStr, config)
    : unitPcDue;
  const pcVals = [];
  let pcSumPct = 0, pcGradedCount = 0;
  if (pcEnabled) {
    for (const unitNum of pcBand) {
      if (!pcDueFor(unitNum)) continue; // pcAvg covers PCs due-by-today only
      const raw = unitPcData ? unitPcData[unitNum] : null;
      if (raw != null && Number.isFinite(raw)) {
        const frac = Math.min(1, Math.max(0, raw / 100)); // clamp out-of-range raw%
        pcVals.push(frac);
        pcSumPct += frac * 100;
        pcGradedCount += 1;
      } else {
        pcVals.push(0); // due but no PC attempt
      }
    }
  }
  const pcAvg = pcVals.length ? pcVals.reduce((a, b) => a + b, 0) / pcVals.length : null;
  // pcDue disambiguates pcAvg === null: true once any band unit's PCs are due-by-today
  // (null + pcDue = "due but unattempted"); false = Progress Checks aren't open yet
  // (~fall) OR the track is disabled, so the "Why so low?" coach must NOT push PC
  // work that doesn't count. Additive — no grade math depends on it.
  const pcDue = pcEnabled && pcBand.some(pcDueFor);

  // ── Combine to the quarter grade ──
  const tracks = {
    lessons: lessonsAvg,
    quizzes: quizzesAvg,
    posters: workTracks ? (workTracks.posters ?? null) : null,
    // Blooket now flows from the ledger (per-topic, mean-of-recorded), NOT the
    // workTracks channel. null -> renormalized away by workAvgV3.
    blooket: blooketAvg,
  };
  // Trainer joins the Work blend ONLY when its weight is enabled. At weight 0
  // (shipped default) the key is absent from BOTH tracks and weights, so the
  // renormalization math is bit-identical to the pre-trainer engine (pinned by
  // the grade-invariance test).
  let effectiveWorkWeights = workWeights;
  if (trainerWeight > 0) {
    /** @type {Record<string, number|null>} */ (tracks).trainer = trainerAvg;
    effectiveWorkWeights = { ...workWeights, trainer: trainerWeight };
  }
  const workAvg = workAvgV3(tracks, effectiveWorkWeights);
  const quarterGradeBase = to100(combineV3(pcAvg, workAvg, gates));

  // ── Early-completion bonus (SY2627, teacher 2026-09-03) ──
  // +config.v3EarlyBonus.perLesson points on the quarter grade for every
  // scheduled-due WORKSHEET that reached minComplete (default 80%) of its blanks
  // by 11:59 PM school time on its due day (worksheetCoverageReachedAt), capped
  // at config.v3EarlyBonus.cap per quarter (cap 0 = off, absent = uncapped).
  // A combined worksheet (4.1-2, 6.1-2 …) earns ONE bonus, judged against the
  // latest of its topics' due dates. Ahead-of-schedule worksheets (work
  // recorded, not yet due) are counted separately (aheadLessons) and earn
  // theirs once due. Absent config (the frozen SY2526 config) → no bonus.
  const earlyCfg = (config && config.v3EarlyBonus) || null;
  const earlyPerLesson = earlyCfg && Number.isFinite(earlyCfg.perLesson) ? earlyCfg.perLesson : 0;
  const earlyCap = earlyCfg && Number.isFinite(earlyCfg.cap) ? earlyCfg.cap : Infinity;
  const earlyMin = earlyCfg && Number.isFinite(earlyCfg.minComplete) ? earlyCfg.minComplete : 0.8;
  const schoolTz = (config && config.schoolTz) || 'America/New_York';
  const earlyKeys = /** @type {string[]} */ ([]);
  const aheadKeys = /** @type {string[]} */ ([]);
  if (earlyPerLesson > 0 && earlyCap > 0) {
    const seenWorksheets = new Set();
    const dateFor = (entry) => {
      const periods = (entry && entry.periods && typeof entry.periods === 'object') ? entry.periods : {};
      return period ? (periods[period] || null) : (periods.B || periods.E || null);
    };
    for (const topicKey of bandLessons) {
      const r = lessonMap.get(topicKey);
      if (lessonTrackValue(r) == null) continue; // no worksheet work → nothing to credit
      const entry = schedule[topicKey];
      const dueDate = dateFor(entry);
      if (!dueDate) continue; // bonus/unscheduled lesson — no deadline to beat
      const worksheetId = `${entry.unit}/${entry.worksheetKey || topicKey}`;
      if (seenWorksheets.has(worksheetId)) continue; // combined worksheet: one bonus
      seenWorksheets.add(worksheetId);
      let deadlineDate = dueDate;
      for (const other of (Array.isArray(entry.combinedWith) ? entry.combinedWith : [])) {
        const od = dateFor(schedule[other]);
        if (od && od > deadlineDate) deadlineDate = od;
      }
      if (!isDateDue(deadlineDate, todayDateStr, config)) { aheadKeys.push(topicKey); continue; }
      const reachedAt = worksheetCoverageReachedAt(r, earlyMin);
      if (reachedAt != null && reachedAt <= endOfDayEpochInTz(deadlineDate, schoolTz)) earlyKeys.push(topicKey);
    }
  }
  const earlyBonus = earlyCap > 0 ? Math.min(earlyCap, earlyKeys.length * earlyPerLesson) : 0;
  const quarterGrade = quarterGradeBase == null ? null : Math.min(100, quarterGradeBase + earlyBonus);

  // ── Ceiling: best case if every remaining/un-attempted item scores 100 ──
  const lessonsAvgBest = lessonsTotal > 0
    ? (lessonSum + (lessonsTotal - lessonGradedCount) * 100) / lessonsTotal / 100
    : null;
  // Quiz best case uses the quiz-BEARING band total (matching the quizzesAvg
  // denominator), not lessonsTotal — a quiz-less lesson is never a "missing quiz".
  const quizBandTotal = quizSet == null ? lessonsTotal : bandLessons.filter((tk) => quizSet.has(tk)).length;
  const quizzesAvgBest = quizBandTotal > 0
    ? (quizSum + (quizBandTotal - quizDone) * 100) / quizBandTotal / 100
    : null;
  const pcTotal = pcBand.length;
  const pcAvgBest = pcTotal > 0
    ? (pcSumPct + (pcTotal - pcGradedCount) * 100) / pcTotal / 100
    : null;
  const bestTracks = {
    lessons: lessonsAvgBest,
    quizzes: quizzesAvgBest,
    posters: tracks.posters,
    // No inflation for the ceiling: blooket's best case is its recorded mean.
    // We do NOT assume future blookets score 100 (unlike lessons/quizzes/PC,
    // which have a known remaining count). A missing blooket stays excluded.
    blooket: blooketAvg,
  };
  if (trainerWeight > 0) {
    // Same no-inflation rule as blooket: the trainer ceiling is its recorded mean.
    /** @type {Record<string, number|null>} */ (bestTracks).trainer = trainerAvg;
  }
  const workAvgBest = workAvgV3(bestTracks, effectiveWorkWeights);
  // Ceiling only when the quarter has signal (matches Phase 6: nothing due → null).
  const ceilingBase = quarterGrade == null ? null : to100(combineV3(pcAvgBest, workAvgBest, gates));
  const ceiling = ceilingBase == null ? null : Math.min(100, ceilingBase + earlyBonus);

  return {
    quarterGrade,
    quarterGradeBase,
    earlyBonus,
    earlyLessons: earlyKeys.length,
    earlyKeys,
    aheadLessons: aheadKeys.length,
    aheadKeys,
    pcUnits: pcBand,
    ceiling,
    lessonsDue,
    // lessonsGraded counts lessons graded on the LESSONS-track feeders (blanks/
    // FRQ). A quiz-only lesson feeds quizzesAvg instead, so it does NOT count
    // here (differs from Phase 6, where the quiz folded into lessonGrade).
    // Informational only — no grade depends on this field.
    lessonsGraded: lessonGradedCount,
    lessonsTotal,
    pcAvg: to100(pcAvg),
    workAvg: to100(workAvg),
    // pcDue=false => Progress Checks aren't open yet (~fall); the grade coach must not
    // treat a null pcAvg as a deficit or tell the student to "do PCs".
    pcDue,
    // Raw [0,1] track fractions — the EXACT values combineV3/quarterGradeV3 gate on
    // (the 40% floor is 0.40 here). Surfaced so the gradebook reconciliation can
    // pick the v3 branch from the same numbers the grade used, instead of the
    // rounded 0..100 display values (40.0 is ambiguous between 0.3996 and 0.4004).
    pcAvgRaw: pcAvg,
    workAvgRaw: workAvg,
    // Work sub-track breakdown (0..100 or null), so the "Why so low?" coach can
    // show what's inside the Work track — esp. the Blooket track, which the
    // student can't otherwise see. null tracks are renormalized away in workAvg.
    workTracks: {
      lessons: to100(lessonsAvg),
      quizzes: to100(quizzesAvg),
      blooket: to100(blooketAvg),
      posters: to100(tracks.posters),
      // TI-84 trainer sub-track (0..100 or null). VISIBLE regardless of weight;
      // it participates in workAvg only when config.trainer.weight > 0.
      trainer: to100(trainerAvg),
    },
    // Blooket make-up surface: how many Blooket-bearing lessons are due, how many
    // have a score, and the topicKeys still needing one (the flashcard make-ups).
    blooketDue,
    blooketDone,
    blooketTodo,
    // Quiz surface (symmetry with Blooket): how many quiz-bearing lessons are due,
    // how many were taken, and the topicKeys still owing a quiz. Lets the grade
    // coach + gradebook show the Quiz track honestly (quiz-less lessons excluded).
    quizDue,
    quizDone,
    quizTodo,
    // TI-84 trainer surface (symmetry with Blooket): trainer-bearing lessons due,
    // how many have a trainer score, and the topicKeys still without one.
    trainerDue,
    trainerDone,
    trainerTodo,
  };
}

// ── computeQuizTotals ─────────────────────────────────────────────────────────
//
// Per-topic count of GRADABLE curriculum-quiz questions, derived from the
// answer key. Buckets each quiz itemId to schedule topicKeys via the SAME
// expandLessonKey mapping used for attempted items (buildLessonMap), so a
// topic's "answered %" = attempted / total compares like-for-like — and a
// combined-worksheet topic gets the sum of its constituent lessons' quizzes.
// Returns { topicKey: number }. Quiz-only (FRQ/PC excluded by the L#-Q regex).
export function computeQuizTotals(answerKey, schedule) {
  const totals = {};
  if (!answerKey || !schedule) return totals;
  for (const itemId of Object.keys(answerKey)) {
    const keyEntry = answerKey[itemId];
    if (!keyEntry || keyEntry.answerKey == null) continue; // gradable only
    // Curriculum-quiz items only. The ^U#-L#-Q structure excludes PC
    // (U#-PC-Q) and worksheet blanks (WS-U#L#-Q) by shape — same itemId
    // pattern parseItemLesson uses to bucket ATTEMPTED quiz rows.
    const m = itemId.match(/^U(\d+)-L(\d+)-Q/i);
    if (!m) continue;
    const topicKeys = expandLessonKey(Number(m[1]), m[2], schedule);
    for (const tk of topicKeys) {
      totals[tk] = (totals[tk] || 0) + 1;
    }
  }
  return totals;
}

// ── buildLessonsArray ─────────────────────────────────────────────────────────
//
// Converts the lessonMap (from computeLessonGrades) into the lessons[] array
// shape for the /grade response (spec §2.3).
//
// schedule: topicKey → { unit, worksheetKey, periods }
// topicNames: optional topicKey → topic name string
// quizTotals: optional topicKey → gradable-quiz-question count (computeQuizTotals)
// blooketLessons: optional [topicKey] that HAVE a Blooket → sets hasBlooket per lesson
// trainerLessons: optional [topicKey] with mapped TI-84 skills → sets hasTrainer per lesson
// blooketBonusTopics: optional [topicKey] enrichment (G4/M2d) → sets blooketBonus per lesson
//   so teacher dashboards can label bonus vs core; never part of the required Due set.
export function buildLessonsArray(lessonMap, schedule, topicNames, gradingWindowStart, quizTotals = {}, blooketLessons = [], trainerLessons = [], blooketBonusTopics = []) {
  const result = [];
  const blooketSet = new Set(Array.isArray(blooketLessons) ? blooketLessons : []);
  const trainerSet = new Set(Array.isArray(trainerLessons) ? trainerLessons : []);
  const bonusSet = new Set(Array.isArray(blooketBonusTopics) ? blooketBonusTopics : []);

  // Include every lesson from the schedule (not just those with data).
  const sortedKeys = Object.keys(schedule).sort((a, b) => {
    const [ua, la] = a.split('.');
    const [ub, lb] = b.split('.');
    const ud = Number(ua) - Number(ub);
    return ud !== 0 ? ud : Number(la) - Number(lb);
  });

  for (const topicKey of sortedKeys) {
    const entry = schedule[topicKey];
    // 2026-05-20 hotfix: exclude lessons whose dates are entirely before the
    // active cohort's grading window. Mirrors the band filter in
    // computeQuarterFromLessons so the day-grade modal also skips stale
    // prior-year entries.
    if (gradingWindowStart && entry && entry.periods) {
      const b = entry.periods.B, e = entry.periods.E;
      const bothBeforeStart = (b != null && b < gradingWindowStart) &&
                              (e != null && e < gradingWindowStart);
      if (bothBeforeStart) continue;
    }
    // Codex MAJOR 3 fold (2026-05-20): defensive skip on malformed entries
    // — the loader only validates the top-level shape, so per-entry corruption
    // (missing unit / periods) reaches here. Per the contract, malformed data
    // must NEVER crash; just exclude the entry from the lessons[] output.
    if (!entry || typeof entry !== 'object' || typeof entry.unit !== 'number') continue;
    const periods = entry.periods && typeof entry.periods === 'object' ? entry.periods : {};
    const lessonResult = lessonMap.get(topicKey);

    result.push({
      lessonKey: topicKey,
      unit: entry.unit,
      worksheetKey: entry.worksheetKey,
      topicName: (topicNames && topicNames[topicKey]) || null,
      due: { B: periods.B || null, E: periods.E || null },
      lessonGrade: lessonResult ? lessonResult.lessonGrade : null,
      // v3 Lessons-track value ({Cws, W} blend, quiz excluded) — the apples-to-apples
      // "Follow-Along" cell for the in-app/Schoology gradebook (worksheet blanks +
      // AI reflections). null when neither feeder is present.
      lessonGradeNoQuiz: lessonResult ? (lessonResult.lessonGradeNoQuiz != null ? lessonResult.lessonGradeNoQuiz : null) : null,
      Cws: lessonResult ? (lessonResult.Cws !== undefined ? lessonResult.Cws : null) : null,
      W: lessonResult ? lessonResult.W : null,
      Q: lessonResult ? lessonResult.Q : null,
      // Total gradable quiz questions for this topic (from the answer key),
      // so the client can compute "% answered" = items.quiz.length / quizTotal.
      // Independent of what the student attempted; 0 when the topic has no quiz.
      quizTotal: quizTotals[topicKey] || 0,
      // Per-lesson Blooket score (0..100), surfaced for the Desk day-grade modal
      // + the grade coach; null when no game/flashcard score attached.
      blooket: lessonResult ? (lessonResult.blooket != null ? lessonResult.blooket : null) : null,
      // Whether this lesson HAS a Blooket at all (presence list), so
      // the coach can tell "Blooket not done yet" apart from "no Blooket exists".
      hasBlooket: blooketSet.has(topicKey),
      // M2d: enrichment topic (crosswalk bonus / BLOOKET_BONUS_TOPICS). Visible in
      // teacher dashboards as "bonus"; NEVER counts toward required Due (core 67).
      blooketBonus: bonusSet.has(topicKey),
      // TI-84 trainer: per-lesson pct (mean over mapped procedures, missing=0;
      // null = untouched) + whether the lesson has mapped calculator skills at
      // all. Display-only today (weight 0) — the Desk 🖩 chip reads these.
      trainer: lessonResult ? (lessonResult.trainer != null ? lessonResult.trainer : null) : null,
      hasTrainer: trainerSet.has(topicKey),
      items: lessonResult
        ? {
            frq: lessonResult.frqItems.map(f => ({ itemId: f.itemId, score: f.score, ts: f.ts })),
            quiz: lessonResult.quizItems.map(q => ({ itemId: q.itemId, correct: q.correct, credit: q.credit, ts: q.ts })),
            worksheet: lessonResult.worksheetItems.map(w => ({ itemId: w.itemId, score: w.score !== undefined ? w.score : null, ts: w.ts })),
          }
        : { frq: [], quiz: [], worksheet: [] },
    });
  }

  return result;
}
