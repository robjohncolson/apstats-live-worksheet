// @ts-check
// scoring.js — shared cr-quiz/PC answer-key scoring + ledger aggregation
// helpers. Single source of truth so /rollup (Phase 2), /grade and /mastery
// (Phase 3) score identically (GRADEBOOK_PHASE3_BUILD.md §5: "reuse the
// Phase-2 /rollup cr-quiz aggregation", not a fork). Logic is byte-equivalent
// to rollup.js's original local helpers — the 13 rollup tests pin it.

import { PC_PART_POINTS, QUIZ_RETRY_HALF_CREDIT_FROM } from './grade-config.js';

// blooketScore -- the authoritative per-student per-Blooket score on [0,1].
// SINGLE SOURCE OF TRUTH: the POST /class/blooket endpoint, the import tool, and
// the unit tests all import THIS function (BLOOKET_IMPORT_P2_BUILD.md section 1).
//
//   given correct, attempted, and the Blooket's total questions:
//     attempted <= 0           -> 0  (a no-show / walkaway records an honest 0)
//     acc = correct / attempted
//     cov = min(1, attempted / total)   (walkaway penalty; over-total -> pure acc)
//     score = clamp(acc * cov, 0, 1)    (== correct/total when attempted <= total)
//
// Worked: 30/30 of 30 -> 1.0 ; 20/25 of 30 -> 0.6667 ; 15/15 of 30 -> 0.5 ;
//         33/35 of 30 -> 0.9429 ; 0 attempted -> 0.
export function blooketScore(correct, attempted, total) {
  const c = Number(correct);
  const a = Number(attempted);
  const t = Number(total);
  if (!Number.isFinite(a) || a <= 0) return 0;
  if (!Number.isFinite(c) || c < 0) return 0;
  if (!Number.isFinite(t) || t <= 0) return 0;
  const acc = c / a;
  const cov = Math.min(1, a / t);
  const score = acc * cov;
  return Math.min(1, Math.max(0, score));
}

// Normalize a jsonb `response` to a comparable scalar string. DN2d records
// `response: answer` where `answer` is cr's letter-style value (cr's own
// checkIfAnswerCorrect compares String(value).trim().toLowerCase() to the
// letter answerKey). Tolerate string | {value|answer|selected|choice} | array.
export function normalizeResponse(response) {
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

// Mirror cr's checkIfAnswerCorrect exactly: trim + lowercase string equality.
export function isCorrect(response, answerKey) {
  const r = normalizeResponse(response);
  if (r == null || answerKey == null) return false;
  return r === String(answerKey).trim().toLowerCase();
}

// quizCredit -- one keyed quiz row's credit: 1, 0.5 or 0
// (QUIZ_RETRY_HALF_CREDIT_SPEC.md §1). A correct first answer earns 1, a correct
// retry (attempt 2) recorded on or after cutoffIso earns 0.5, anything wrong 0.
// A retry before the cutoff, or with a missing/unparseable recorded_at, keeps
// full credit: a stored grade never goes down. No cutoff = the rule is off.
// The 0.5 branch can no longer fire for a new row: retries close at the same
// instant (QUIZ_RETRIES_CLOSED_FROM, QUIZ_RETRY_REMOVAL_SPEC.md), and
// /ledger/record stamps an accepted retry with the instant it checked.
export function quizCredit(row, keyEntry, cutoffIso) {
  if (!keyEntry || keyEntry.answerKey == null) return 0;
  if (!isCorrect(row?.response, keyEntry.answerKey)) return 0;
  return isHalfCreditRetry(row, cutoffIso) ? 0.5 : 1;
}

function isHalfCreditRetry(row, cutoffIso) {
  // A garbage attempt (NaN) reads as a first answer, as latestPerItem reads it.
  const attempt = Number(row?.attempt ?? 1);
  if (!(attempt >= 2)) return false;
  const cutoff = Date.parse(cutoffIso || '');
  if (!Number.isFinite(cutoff)) return false;
  const recordedAt = Date.parse(row?.recorded_at || '');
  if (!Number.isFinite(recordedAt)) return false;
  return recordedAt >= cutoff;
}

function rowStableId(row) {
  return String(row?.ledger_id || row?.receipt_id || '');
}

// Stable row order for deterministic grading. Same item/attempt/timestamp ties
// are ordered by ledger_id, falling back to receipt_id for imported rows.
export function stableLedgerSort(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const itemCmp = String(a?.item_id || '').localeCompare(String(b?.item_id || ''));
    if (itemCmp !== 0) return itemCmp;
    const attemptCmp = (Number(a?.attempt) || 0) - (Number(b?.attempt) || 0);
    if (attemptCmp !== 0) return attemptCmp;
    const timeCmp = (Date.parse(a?.recorded_at || '') || 0) - (Date.parse(b?.recorded_at || '') || 0);
    if (timeCmp !== 0) return timeCmp;
    return rowStableId(a).localeCompare(rowStableId(b));
  });
}

// Keep only the authoritative attempt per item_id: highest `attempt`, tie
// broken by latest `recorded_at`, then lexicographic ledger_id/receipt_id.
// Defensive against missing fields.
export function latestPerItem(rows) {
  const best = new Map();
  for (const row of rows) {
    const id = row?.item_id;
    if (typeof id !== 'string' || !id) continue;
    const cur = best.get(id);
    if (!cur) { best.set(id, row); continue; }
    const a = Number(row.attempt) || 0;
    const b = Number(cur.attempt) || 0;
    if (a > b) { best.set(id, row); continue; }
    if (a === b) {
      const at = Date.parse(row.recorded_at || '') || 0;
      const bt = Date.parse(cur.recorded_at || '') || 0;
      if (at > bt) best.set(id, row);
      if (at === bt && rowStableId(row) >= rowStableId(cur)) best.set(id, row);
    }
  }
  return [...best.values()];
}

// Unit label for aggregation: prefer the answer-key entry's unit, else derive
// "U{n}" from the id (matches DN2d's `unit: 'U'+n` convention and DN2b's
// WS-U{n}.../U{n}-... ids). Returns "U?" when nothing parses.
export function unitOf(itemId, keyEntry) {
  if (keyEntry && keyEntry.unit != null && String(keyEntry.unit).trim() !== '') {
    return `U${String(keyEntry.unit).replace(/^U/i, '')}`;
  }
  const m = String(itemId).match(/U(\d+)[-L]/i);
  return m ? `U${m[1]}` : 'U?';
}

// Validate the bundled answer-key doc shape (fail CLOSED on parseable-but-wrong;
// substituting {} would silently mark everything ungradable — Codex MAJOR from
// Phase 2). A sparse object is fine (a MISSING key → ungradable by design), but
// a PRESENT-but-corrupt entry (e.g. 42, "x", []) must fail closed too, else
// answer-key corruption silently degrades to ungradable-200 (Codex Phase-3
// MAJOR). Valid entry = a non-null object whose `answerKey` is string|number
// |null (null = an objectively-unscorable FRQ entry, by design).
export function answerKeyMapOrNull(answerKeyDoc) {
  if (
    !answerKeyDoc ||
    typeof answerKeyDoc !== 'object' ||
    !answerKeyDoc.answerKey ||
    typeof answerKeyDoc.answerKey !== 'object' ||
    Array.isArray(answerKeyDoc.answerKey)
  ) {
    return null;
  }
  const map = answerKeyDoc.answerKey;
  for (const k of Object.keys(map)) {
    const e = map[k];
    if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
    const ak = e.answerKey;
    if (ak !== null && typeof ak !== 'string' && typeof ak !== 'number') return null;
  }
  return map;
}

// Validate the bundled skill-map (build-skill-map.mjs output: id → entry).
// Fail CLOSED on parseable-but-wrong so corruption can't silently empty the
// diagnostic (Codex Phase-3 MAJOR). The bundled map is NEVER empty (3449+
// keys; bundle-parity guards it) ⇒ {} = load corruption → reject. A valid
// entry is a non-null object; `skill` may be a string OR null/absent
// (unresolved tags are valid and excluded downstream, per the tagging spec).
export function skillMapValidOrNull(skillMap) {
  if (!skillMap || typeof skillMap !== 'object' || Array.isArray(skillMap)) {
    return null;
  }
  const keys = Object.keys(skillMap);
  if (keys.length === 0) return null;
  for (const k of keys) {
    const e = skillMap[k];
    if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
    if (e.skill !== null && e.skill !== undefined && typeof e.skill !== 'string') return null;
  }
  return skillMap;
}

// Score one source's latest-attempt rows vs the answer key, aggregated per
// unit. Used for cr-quiz (Q). Returns
// { units: { U1:{attempted,graded,correct,credit,ungradable,pct} }, totals:{...} }.
// pct = credit / graded: a half-credit retry counts 0.5 (quizCredit); `correct`
// stays the count of full-credit items.
export function scoreAgainstKey(rows, answerKey, cutoffIso = QUIZ_RETRY_HALF_CREDIT_FROM) {
  const units = {};
  const ensure = (u) =>
    (units[u] || (units[u] = { attempted: 0, graded: 0, correct: 0, credit: 0, ungradable: 0 }));

  for (const row of latestPerItem(rows)) {
    const itemId = row.item_id;
    const keyEntry = answerKey[itemId];
    const u = ensure(unitOf(itemId, keyEntry));
    u.attempted += 1;
    if (!keyEntry || keyEntry.answerKey == null) {
      u.ungradable += 1;
      continue;
    }
    u.graded += 1;
    const credit = quizCredit(row, keyEntry, cutoffIso);
    u.credit += credit;
    if (credit >= 1) u.correct += 1;
  }

  const totals = { attempted: 0, graded: 0, correct: 0, credit: 0, ungradable: 0 };
  for (const u of Object.keys(units)) {
    const x = units[u];
    x.pct = x.graded > 0 ? Math.round((x.credit / x.graded) * 1000) / 10 : null;
    totals.attempted += x.attempted;
    totals.graded += x.graded;
    totals.correct += x.correct;
    totals.credit += x.credit;
    totals.ungradable += x.ungradable;
  }
  totals.pct = totals.graded > 0
    ? Math.round((totals.credit / totals.graded) * 1000) / 10
    : null;

  return { units, totals };
}

// Score PC rows into a per-unit raw % — the PC-mastery track feeder
// (PC_MAKEUP_PHASE2_GRADE_SPEC.md §A/§B/§C). Hybrid, so it subsumes the old
// re-score path AND lights up makeup PCs:
//   • a finite row.score (0..1) is HONORED verbatim — makeup PCs are graded
//     server-side against the CB-secure pc_bank (their answers never enter this
//     public-key path), and this is also how FRQ partial credit (E/P/I → a
//     fraction) reaches the grade, since re-scoring is binary-only;
//   • otherwise the row is RE-SCORED (row.response vs the public answer key) —
//     legacy proctored PC rows whose items ARE in answer-key.json. A null-key
//     item is ungradable and DROPS from the denominator (unchanged behavior).
// PAPER rows (item_id U{n}-PC-{A|B|C|FRQ|REST}-PAPER) are one row per PART
// (PC_FOLLOWTHROUGH_SPEC.md §1). The parts blend into one paper % (pcPaperBlend:
// half MCQ, half FRQ), and that paper % best-wins against the online per-item
// mean (Math.max — a makeup only ever raises). A -PAPER row with no part name
// is a legacy whole-PC score: it best-wins too. Returns scoreAgainstKey's
// { units:{ U#:{ pct, parts } }, totals } shape so the computeGrade →
// unitPcRaw → computeQuarterV3 wire is untouched.
export function scorePcRows(rows, answerKey = {}) {
  const online = {}; // unit → { sum, n } of per-item credit
  const paper = {};  // unit → best UN-parted legacy paper pct (0..100)
  const parts = {};  // unit → { A|B|C|FRQ|REST: part detail }
  for (const row of latestPerItem(rows)) {
    const itemId = String(row?.item_id || '');
    if (!itemId) continue;
    const u = unitOf(itemId, answerKey[itemId]);

    // Per-item credit in [0,1], or null = ungradable (excluded from denominator).
    let credit = null;
    const raw = row?.score;
    if (raw != null && Number.isFinite(Number(raw))) {
      credit = Math.min(1, Math.max(0, Number(raw)));      // honor server-computed score
    } else {
      const keyEntry = answerKey[itemId];
      if (keyEntry && keyEntry.answerKey != null) {
        credit = isCorrect(row.response, keyEntry.answerKey) ? 1 : 0; // re-score legacy proctored
      }
    }
    if (credit == null) continue;                          // ungradable → skip

    const partName = pcPaperPartOf(itemId);
    if (partName) {
      const unitParts = parts[u] || (parts[u] = {});
      unitParts[partName] = pcPartDetail(row, credit);
      continue;
    }
    if (/-PAPER$/i.test(itemId)) {
      paper[u] = Math.max(paper[u] == null ? 0 : paper[u], credit * 100);
      continue;
    }
    const o = online[u] || (online[u] = { sum: 0, n: 0 });
    o.sum += credit;
    o.n += 1;
  }

  const units = {};
  for (const u of new Set([...Object.keys(online), ...Object.keys(paper), ...Object.keys(parts)])) {
    const onlinePct = online[u] ? (online[u].sum / online[u].n) * 100 : null;
    const blendPct = parts[u] ? pcPaperBlend(parts[u], u) : null;
    const best = Math.max(
      onlinePct == null ? -1 : onlinePct,
      paper[u] == null ? -1 : paper[u],
      blendPct == null ? -1 : blendPct,
    );
    units[u] = { pct: best < 0 ? null : Math.round(best * 10) / 10 };
    if (parts[u]) units[u].parts = parts[u];
  }
  return { units, totals: {} };
}

// "U1-PC-FRQ-PAPER" → "FRQ"; anything else → null.
function pcPaperPartOf(itemId) {
  const m = String(itemId).match(/^U\d+-PC-(A|B|C|FRQ|REST)-PAPER$/i);
  return m ? m[1].toUpperCase() : null;
}

// A per-part row's response is a JSON string { part, points, of, origin, note,
// postedAt }. Legacy rows carry '(paper)' (or nothing): treat that as {}.
function pcResponseObject(response) {
  if (response && typeof response === 'object' && !Array.isArray(response)) return response;
  if (typeof response !== 'string') return {};
  try {
    const parsed = JSON.parse(response);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function pcPartDetail(row, credit) {
  const info = pcResponseObject(row.response);
  const hasPoints = typeof info.points === 'number' && Number.isFinite(info.points);
  const points = hasPoints ? info.points : null;
  const of = Number(info.of) > 0 ? Number(info.of) : null;
  return {
    score: credit,
    points,
    of,
    note: typeof info.note === 'string' ? info.note : null,
    origin: typeof info.origin === 'string' ? info.origin : null,
    postedAt: typeof info.postedAt === 'string' ? info.postedAt : (row.recorded_at || null),
  };
}

// The weight of one MCQ part: its posted `of`, else the config table, else 1.
function pcPartWeight(partName, part, unitNum) {
  if (Number(part.of) > 0) return Number(part.of);
  const table = PC_PART_POINTS[unitNum];
  if (table && Number(table[partName]) > 0) return Number(table[partName]);
  return 1;
}

// pcPaperBlend(partsByName, unit) → the unit's paper % (0..100, unrounded) or
// null when no part is present (PC_FOLLOWTHROUGH_SPEC.md §1.2, teacher 2026-10-20):
//   MCQ half = points-weighted mean of the present A, B, C parts
//   FRQ half = the FRQ part's score
//   both present → 50/50; only one side present → that side alone.
// A part posted as 0 points is PRESENT (the deadline zero); an absent part is
// excluded, never 0.
// Legacy (§1.3): while a unit has no B, C or FRQ row, the old REST row
// ((B + C + FRQ) / 42) still counts and the unit keeps the old rule, the best of
// A and REST, so nothing moves before the first reconcile. Once any B, C or FRQ
// row exists, REST is ignored.
export function pcPaperBlend(partsByName, unit) {
  const parts = partsByName || {};
  const unitNum = parseInt(String(unit).replace(/^U/i, ''), 10);
  const hasPerPart = Boolean(parts.B || parts.C || parts.FRQ);

  if (!hasPerPart) {
    const legacy = [parts.A, parts.REST].filter(Boolean).map((p) => p.score * 100);
    return legacy.length ? Math.max(...legacy) : null;
  }

  let num = 0;
  let den = 0;
  for (const name of ['A', 'B', 'C']) {
    const part = parts[name];
    if (!part) continue;
    const weight = pcPartWeight(name, part, unitNum);
    num += part.score * weight;
    den += weight;
  }
  const mcqHalf = den > 0 ? num / den : null;
  const frqHalf = parts.FRQ ? parts.FRQ.score : null;

  if (mcqHalf != null && frqHalf != null) return 100 * (0.5 * mcqHalf + 0.5 * frqHalf);
  if (mcqHalf != null) return 100 * mcqHalf;
  return 100 * frqHalf;
}
