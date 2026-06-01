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
export function expandLessonKey(unit, lessonKey, schedule) {
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
        blooket: null, // 0..100 (latest blooket row for this topic), or null
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

  for (const row of (Array.isArray(rows) ? rows : [])) {
    if (!row || !row.item_id) continue;
    const parsed = parseItemLesson(row.item_id);
    if (!parsed) continue;
    const { unit, lessonKey } = parsed;
    if (lessonKey === null) continue; // PC items are unit-scoped, skip here

    const topicKeys = expandLessonKey(unit, lessonKey, schedule);
    if (!topicKeys.length) continue;

    const ts = row.recorded_at || null;
    const src = row.source || '';

    for (const topicKey of topicKeys) {
      const acc = ensure(topicKey);

      if (src === 'frq') {
        const pct = frqScoreToPct(row.score, frqBand);
        acc.frqItems.push({ itemId: row.item_id, score: pct, rawScore: row.score, ts });
      } else if (src === 'curriculum_quiz') {
        const keyEntry = answerKey && answerKey[row.item_id];
        if (keyEntry && keyEntry.answerKey != null) {
          acc.quizItems.push({
            itemId: row.item_id,
            correct: isCorrect(row.response, keyEntry),
            ts,
          });
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
        // Stored score is the authoritative 0..1 blooketScore (no re-scoring;
        // there is no answer key). Latest row wins (rows arrive pre-deduped via
        // latestPerItem). Keep on 0..100 to match the lessonMap convention
        // (lessonGrade/Cws/W/Q are all 0..100).
        const s = Number(row.score);
        if (Number.isFinite(s)) acc.blooket = Math.min(1, Math.max(0, s)) * 100;
      }
    }
  }

  // Now compute Cws, W, Q, lessonGrade for each topic.
  const wsWeight = weights.ws;
  const wWeight  = weights.W;
  const qWeight  = weights.Q;

  for (const [, acc] of byTopic) {
    // Cws = clamp((sum of blank scores) / blankCount, 0, 1) * 100
    // blankCount = manifest count for this lesson (DENOMINATOR = ALL blanks,
    // not just recorded ones — unattempted blanks contribute 0 to numerator).
    let Cws = null;
    if (worksheetBlankCounts && acc.wsCountKey !== null) {
      const blankCount = worksheetBlankCounts[acc.wsCountKey];
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

    // Q = correctness % over quiz items
    const Q = acc.quizItems.length > 0
      ? (acc.quizItems.filter(q => q.correct).length / acc.quizItems.length) * 100
      : null;

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
    // Blooket track (0..100, latest recorded row) carried through verbatim;
    // null when no blooket row attached. Rounded for the response surface.
    acc.blooket = acc.blooket != null ? Math.round(acc.blooket * 10) / 10 : null;
  }

  return byTopic;
}

// ── "Today" in schoolTz ────────────────────────────────────────────────────────
//
// Returns YYYY-MM-DD string for the current moment in the given IANA timezone.
// Falls back to UTC if the timezone is unavailable.
export function todayInTz(tz) {
  try {
    // Use Intl.DateTimeFormat to render the current moment in the given timezone.
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const y = parts.find(p => p.type === 'year')?.value;
    const m = parts.find(p => p.type === 'month')?.value;
    const d = parts.find(p => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch (_) {
    // fallthrough to UTC
  }
  return new Date().toISOString().slice(0, 10);
}

// Extract the single-letter period key from a section string.
// "PeriodB" → "B", "PeriodE" → "E", "B" → "B", etc.
// Returns null if it can't be extracted.
export function sectionToPeriod(section) {
  if (!section) return null;
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
  gradingWindowStart = null,
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
      return dueDate <= todayDateStr;
    }
    // Unknown section: due if EITHER B or E is <= today.
    const bDue = periods.B && periods.B <= todayDateStr;
    const eDue = periods.E && periods.E <= todayDateStr;
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

// The core v3 quarter formula. Both args on [0, 1]; returns [0, 1].
//   both tracks >= 0.40 → max(pc, work)                       (either path → 100%)
//   otherwise           → max(0.7*pc, 0.7*work, mean(pc, work))
// The 40% floors gate the max-of-two; the 70%-of-track ceiling bounds
// single-track gaming. Verbatim from the spec.
export function quarterGradeV3(pcAvg, workAvg) {
  if (pcAvg >= 0.40 && workAvg >= 0.40) return Math.max(pcAvg, workAvg);
  return Math.max(0.7 * pcAvg, 0.7 * workAvg, (pcAvg + workAvg) / 2);
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
function combineV3(pcAvg, workAvg) {
  if (pcAvg == null && workAvg == null) return null;
  if (pcAvg == null) return workAvg;
  if (workAvg == null) return pcAvg;
  return quarterGradeV3(pcAvg, workAvg);
}

// Per-lesson grade EXCLUDING the curriculum-quiz feeder (v3 splits quizzes into
// their own track). Weighted blend of {Cws, W} renormalized over present
// feeders, on 0..100. null when neither feeder is present.
function lessonGradeNoQuiz(result, weights) {
  if (!result) return null;
  let num = 0, den = 0;
  if (result.Cws != null) { num += weights.ws * result.Cws; den += weights.ws; }
  if (result.W   != null) { num += weights.W  * result.W;   den += weights.W; }
  if (den === 0) return null;
  return num / den;
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
  gradingWindowStart = null,
  workTracks = null,
}) {
  const period = sectionToPeriod(section);
  const lessonWeights = (config && config.lessonFeederWeights) || { ws: 1, W: 2, Q: 3 };
  const excludeQuiz = !(config && config.v3LessonsExcludeQuiz === false); // default true

  // The Lessons-track value for one topic (respects the exclude-quiz flag).
  function lessonTrackValue(r) {
    if (excludeQuiz) return lessonGradeNoQuiz(r, lessonWeights);
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

  // v3 buckets lessons by unit→quarter band (NOT calendar date). Pack-left
  // front-loads teaching dates, so a unit's lessons may be taught in an earlier
  // calendar quarter than its report-card quarter; per the pack-left design
  // ("unit → quarter mapping only buckets grades") a unit's lessons + PC must
  // land in the SAME quarter. (Phase 6 / quarterOfLesson stays date-driven.)
  const bandLessons = [];
  for (const [topicKey, entry] of Object.entries(schedule)) {
    if (!entry || typeof entry !== 'object' || typeof entry.unit !== 'number') continue;
    if (quarterOfUnit(entry.unit, config) !== quarterKey) continue;
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
      return !!d && d <= todayDateStr;
    }
    const bDue = periods.B && periods.B <= todayDateStr;
    const eDue = periods.E && periods.E <= todayDateStr;
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
  // ── Quizzes track (curriculum-quiz correctness) ──
  // Shared denominator = due lessons (≈ one quiz per topic), un-attempted = 0.
  let lessonSum = 0, lessonGradedCount = 0;
  let quizSum = 0, quizGradedCount = 0;
  for (const topicKey of dueLessons) {
    const r = lessonMap.get(topicKey);
    const lv = lessonTrackValue(r);
    if (lv != null) { lessonSum += lv; lessonGradedCount += 1; }
    const q = r && r.Q != null ? r.Q : null;
    if (q != null) { quizSum += q; quizGradedCount += 1; }
    // ungraded-due lesson / un-taken quiz contributes 0 (denominator = lessonsDue)
  }
  const lessonsAvg = lessonsDue > 0 ? (lessonSum / lessonsDue) / 100 : null;
  const quizzesAvg = lessonsDue > 0 ? (quizSum / lessonsDue) / 100 : null;

  // -- Blooket track (MEAN OF RECORDED blooket scores over due lessons) --
  // NOT divided by lessonsDue: a missing blooket is EXCLUDED, never counted as
  // 0. blooketAvg is null when nothing is recorded -> workAvgV3 renormalizes it
  // away, so a quarter with zero blooket rows is byte-identical to today (no
  // tanking the instant this deploys, before any blooket exists). A skip is
  // penalized only when the teacher imports a 0 row (correct=0, attempted=0).
  let blooketSum = 0, blooketRecorded = 0;
  for (const topicKey of dueLessons) {
    const r = lessonMap.get(topicKey);
    const bl = r && r.blooket != null ? r.blooket : null;
    if (bl != null) { blooketSum += bl; blooketRecorded += 1; }
  }
  const blooketAvg = blooketRecorded > 0 ? (blooketSum / blooketRecorded) / 100 : null;

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
  const band = (config.quarters[quarterKey] && config.quarters[quarterKey].units) || [];
  function unitPcDue(unitNum) {
    let latest = null;
    for (const [, entry] of Object.entries(schedule)) {
      if (!entry || entry.unit !== unitNum) continue;
      if (!inWindow(entry)) continue; // ignore stale prior-cohort entries
      const periods = (entry.periods && typeof entry.periods === 'object') ? entry.periods : {};
      const d = period ? periods[period] : (periods.B || periods.E);
      if (d && (latest === null || d > latest)) latest = d;
    }
    return !!latest && latest <= todayDateStr;
  }
  const pcVals = [];
  let pcSumPct = 0, pcGradedCount = 0;
  for (const unitNum of band) {
    if (!unitPcDue(unitNum)) continue; // pcAvg covers PCs due-by-today only
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
  const pcAvg = pcVals.length ? pcVals.reduce((a, b) => a + b, 0) / pcVals.length : null;

  // ── Combine to the quarter grade ──
  const tracks = {
    lessons: lessonsAvg,
    quizzes: quizzesAvg,
    posters: workTracks ? (workTracks.posters ?? null) : null,
    // Blooket now flows from the ledger (per-topic, mean-of-recorded), NOT the
    // workTracks channel. null -> renormalized away by workAvgV3.
    blooket: blooketAvg,
  };
  const workAvg = workAvgV3(tracks);
  const quarterGrade = to100(combineV3(pcAvg, workAvg));

  // ── Ceiling: best case if every remaining/un-attempted item scores 100 ──
  const lessonsAvgBest = lessonsTotal > 0
    ? (lessonSum + (lessonsTotal - lessonGradedCount) * 100) / lessonsTotal / 100
    : null;
  const quizzesAvgBest = lessonsTotal > 0
    ? (quizSum + (lessonsTotal - quizGradedCount) * 100) / lessonsTotal / 100
    : null;
  const pcTotal = band.length;
  const pcAvgBest = pcTotal > 0
    ? (pcSumPct + (pcTotal - pcGradedCount) * 100) / pcTotal / 100
    : null;
  const workAvgBest = workAvgV3({
    lessons: lessonsAvgBest,
    quizzes: quizzesAvgBest,
    posters: tracks.posters,
    // No inflation for the ceiling: blooket's best case is its recorded mean.
    // We do NOT assume future blookets score 100 (unlike lessons/quizzes/PC,
    // which have a known remaining count). A missing blooket stays excluded.
    blooket: blooketAvg,
  });
  // Ceiling only when the quarter has signal (matches Phase 6: nothing due → null).
  const ceiling = quarterGrade == null ? null : to100(combineV3(pcAvgBest, workAvgBest));

  return {
    quarterGrade,
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
  };
}

// ── buildLessonsArray ─────────────────────────────────────────────────────────
//
// Converts the lessonMap (from computeLessonGrades) into the lessons[] array
// shape for the /grade response (spec §2.3).
//
// schedule: topicKey → { unit, worksheetKey, periods }
// topicNames: optional topicKey → topic name string
export function buildLessonsArray(lessonMap, schedule, topicNames, gradingWindowStart) {
  const result = [];

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
      Cws: lessonResult ? (lessonResult.Cws !== undefined ? lessonResult.Cws : null) : null,
      W: lessonResult ? lessonResult.W : null,
      Q: lessonResult ? lessonResult.Q : null,
      items: lessonResult
        ? {
            frq: lessonResult.frqItems.map(f => ({ itemId: f.itemId, score: f.score, ts: f.ts })),
            quiz: lessonResult.quizItems.map(q => ({ itemId: q.itemId, correct: q.correct, ts: q.ts })),
            worksheet: lessonResult.worksheetItems.map(w => ({ itemId: w.itemId, score: w.score !== undefined ? w.score : null, ts: w.ts })),
          }
        : { frq: [], quiz: [], worksheet: [] },
    });
  }

  return result;
}
