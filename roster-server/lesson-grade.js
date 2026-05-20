// lesson-grade.js — Gradebook Phase 6.
//
// Pure functions for lesson-level aggregation + date filter.
// No I/O. Designed to be unit-tested independently of the server.
//
// Key design:
//   - parseItemLesson(itemId)  → { unit, lessonKey } or null
//   - expandLessonKey(unit, lessonKey, schedule) → [topicKey, ...]
//   - computeLessonGrades(rows, frqBand) → Map<topicKey, lessonResult>
//   - computeQuarterFromLessons(quarterBand, lessonMap, schedule, todayDateStr, section, config)
//   - buildLessonsArray(lessonMap, schedule) → lessons[]

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

// ── FRQ score → percentage (mirrors grade.js frqScoreToPct) ───────────────────

function frqScoreToPct(score, frqBand) {
  if (score === null || score === undefined || score === '') return null;
  const s = Number(score);
  if (!Number.isFinite(s)) return null;
  if (s >= 0.75) return frqBand.E;
  if (s >= 0.25) return frqBand.P;
  return frqBand.I;
}

// ── computeLessonGrades ───────────────────────────────────────────────────────
//
// Walk the ledger rows (latest-per-item already resolved) and accumulate
// per-lesson FRQ and quiz data. Returns a Map<topicKey, lessonResult> where:
//
//   lessonResult = {
//     topicKey,
//     frqItems: [{ itemId, score(pct|null), rawScore, ts }],
//     quizItems: [{ itemId, correct(bool), ts }],  // scored against key
//     worksheetItems: [{ itemId, ts }],             // completion-only
//     W: number|null,   // mean frq pct (null if no gradable frq)
//     Q: number|null,   // quiz correctness % (null if no scorable quiz)
//     lessonGrade: number|null,  // weighted B, or null
//   }
//
// rows: array of ledger rows (latest-per-item pre-filtered).
// frqBand: { E, P, I } config.
// answerKey: map of itemId → { answerKey, ... } (for quiz scoring).
// schedule: topicKey → entry (to expand combined worksheets).
//
// Note: this function intentionally does NOT filter by "due date" —
// that is applied at the quarter level in computeQuarterFromLessons.
export function computeLessonGrades(rows, frqBand, answerKey, schedule) {
  // lessonMap: topicKey → accumulator
  const byTopic = new Map();

  function ensure(topicKey) {
    if (!byTopic.has(topicKey)) {
      byTopic.set(topicKey, {
        topicKey,
        frqItems: [],
        quizItems: [],
        worksheetItems: [],
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
        acc.worksheetItems.push({ itemId: row.item_id, ts });
      }
    }
  }

  // Now compute W, Q, lessonGrade for each topic.
  const { W: wWeight, Q: qWeight } = { W: 1, Q: 2 }; // spec §2.1: 1:2

  for (const [, acc] of byTopic) {
    // W = mean of graded frqItems (null-score items excluded from denominator)
    const gradableFrqs = acc.frqItems.filter(f => f.score != null);
    const W = gradableFrqs.length > 0
      ? gradableFrqs.reduce((s, f) => s + f.score, 0) / gradableFrqs.length
      : null;

    // Q = correctness % over quiz items
    const Q = acc.quizItems.length > 0
      ? (acc.quizItems.filter(q => q.correct).length / acc.quizItems.length) * 100
      : null;

    // B = weighted mean, renormalized over present feeders
    let B = null;
    {
      let num = 0, den = 0;
      if (W != null) { num += wWeight * W; den += wWeight; }
      if (Q != null) { num += qWeight * Q; den += qWeight; }
      if (den > 0) B = num / den;
    }

    acc.W = W != null ? Math.round(W * 10) / 10 : null;
    acc.Q = Q != null ? Math.round(Q * 10) / 10 : null;
    acc.lessonGrade = B != null ? Math.round(B * 10) / 10 : null;
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

// ── computeQuarterFromLessons ─────────────────────────────────────────────────
//
// Given a quarter's band (array of unit numbers), the per-lesson grade map,
// the schedule, today's date string, and the student's section, compute the
// lesson-weighted, date-driven quarterGrade + ceiling.
//
// Returns:
//   {
//     quarterGrade: number|null,
//     ceiling: number|null,
//     lessonsDue: number,
//     lessonsGraded: number,
//     lessonsTotal: number,
//   }
//
// schedule: topicKey → { unit, periods: { B, E }, ... }
// lessonMap: Map<topicKey, { lessonGrade, ... }>
// todayDateStr: "YYYY-MM-DD"
// section: "PeriodB" / "PeriodE" / "B" / "E" / null
// pcBandData: { P_quarter: number } — the PC-derived P for this quarter (may be 0)
// C: cap (default 85)
export function computeQuarterFromLessons({
  quarterBand,
  lessonMap,
  schedule,
  todayDateStr,
  section,
  pcBandData,
  C = 85,
}) {
  const period = sectionToPeriod(section); // "B" | "E" | null

  // All lessons in the band (those that exist in the schedule).
  // Codex MAJOR 3 fold (2026-05-20): defensive skip on malformed entries —
  // per-entry corruption must not crash this loop or the iteration that
  // follows. Treat any entry missing `unit` as if it weren't in the schedule.
  const bandLessons = [];
  for (const [topicKey, entry] of Object.entries(schedule)) {
    if (!entry || typeof entry !== 'object' || typeof entry.unit !== 'number') continue;
    if (quarterBand.includes(entry.unit)) {
      bandLessons.push(topicKey);
    }
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

  const dueLessons = bandLessons.filter(isDue);
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

// ── buildLessonsArray ─────────────────────────────────────────────────────────
//
// Converts the lessonMap (from computeLessonGrades) into the lessons[] array
// shape for the /grade response (spec §2.3).
//
// schedule: topicKey → { unit, worksheetKey, periods }
// topicNames: optional topicKey → topic name string
export function buildLessonsArray(lessonMap, schedule, topicNames) {
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
      W: lessonResult ? lessonResult.W : null,
      Q: lessonResult ? lessonResult.Q : null,
      items: lessonResult
        ? {
            frq: lessonResult.frqItems.map(f => ({ itemId: f.itemId, score: f.score, ts: f.ts })),
            quiz: lessonResult.quizItems.map(q => ({ itemId: q.itemId, correct: q.correct, ts: q.ts })),
            worksheet: lessonResult.worksheetItems.map(w => ({ itemId: w.itemId, score: null, ts: w.ts })),
          }
        : { frq: [], quiz: [], worksheet: [] },
    });
  }

  return result;
}
