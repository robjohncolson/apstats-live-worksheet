// grade-offline-inputs.js — GET /grade/offline-inputs (ANDROID Phase 2).
//
// A student device re-derives its OWN grade offline by running the shared grade
// engine (grade-engine.bundle.js) over its local signed ledger rows. computeGrade
// re-scores curriculum_quiz / PC items against the answer key — but the real key
// MUST NOT ship to devices (a student would read every quiz/PC answer).
//
// So this endpoint returns a REDACTED, per-student key plus the non-secret engine
// inputs (schedule / config / worksheetBlankCounts / blooketLessons / section).
// The redacted key has the SAME item-id set and the SAME gradability as the real
// key — so quiz denominators (computeQuizTotals) and completion are byte-identical
// — but every answer is replaced by a sentinel EXCEPT the items THIS student
// already answered correctly (where it carries the student's own normalized
// response). Result: computeGrade(localRows, redactedKey, ...) === the server
// grade, while the device learns nothing it didn't already know (its own correct
// answers) and nothing about unattempted / wrong items.
//
// Proctored Progress-Check answers are NOT revealed by default (redactPc=true).
// PCs are not open yet (no PC rows), so this is parity-neutral today; pass
// ?includePc=1 to restore full PC parity once PCs open (accepting that a student
// then sees their own correct PC answers on-device).

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { latestPerItem, isCorrect, normalizeResponse, answerKeyMapOrNull } from './scoring.js';

// A value no real student response normalizes to → gradable (non-null) but never
// matches, so a redacted item scores "wrong" without revealing its answer.
export const REDACTION_SENTINEL = 'REDACTED';

// Blooket presence + required (M2a). Offline pack ships BOTH so the device
// engine can match the server Due denominator (core 67) while keeping
// hasBlooket on all 77. Legacy blooketLessons remains presence for compat.
const _BLOOKET_DOC = (() => {
  try {
    const p = resolve(dirname(fileURLToPath(import.meta.url)), 'data', 'blooket-lessons.json');
    return JSON.parse(readFileSync(p, 'utf8')) || {};
  } catch (_) {
    return {};
  }
})();
const BLOOKET_PRESENCE_DEFAULT = Array.isArray(_BLOOKET_DOC.topics)
  ? _BLOOKET_DOC.topics
  : Array.isArray(_BLOOKET_DOC.allTopics)
    ? _BLOOKET_DOC.allTopics
    : [];
const BLOOKET_REQUIRED_DEFAULT = Array.isArray(_BLOOKET_DOC.requiredTopics)
  ? _BLOOKET_DOC.requiredTopics
  : BLOOKET_PRESENCE_DEFAULT.slice();
const BLOOKET_BONUS_DEFAULT = Array.isArray(_BLOOKET_DOC.bonusTopics)
  ? _BLOOKET_DOC.bonusTopics
  : [];
/** @deprecated presence alias */
const BLOOKET_LESSONS = BLOOKET_PRESENCE_DEFAULT;

// Same TI-84 lesson-map source grade.js uses, so the device's re-derived trainer
// surface (lessons[].trainer, trainerDue/Done/Todo) matches the server. The map
// is public curriculum structure — nothing to redact. Grade-inert at weight 0
// (TI84_GRADE_INTEGRATION_SPEC.md §C).
const TRAINER_LESSON_MAP = (() => {
  try {
    const p = resolve(dirname(fileURLToPath(import.meta.url)), 'data', 'ti84-lesson-map.json');
    const doc = JSON.parse(readFileSync(p, 'utf8'));
    return doc && doc.lessons && typeof doc.lessons === 'object' ? doc.lessons : null;
  } catch (_) {
    return null;
  }
})();

const PC_ITEM = /^U\d+-PC-/i;

// Pure: build the redacted key for ONE student from the real key + their rows.
// Preserves every entry field except `answerKey` (so unit/etc. and gradability
// are untouched). Reveals an answer ONLY for an item the student's LATEST attempt
// got correct (and never for a PC when redactPc).
export function buildRedactedKey(realKey, studentRows, opts = {}) {
  const redactPc = opts.redactPc !== false; // default: redact PC answers
  const respByItem = new Map();
  for (const row of latestPerItem(Array.isArray(studentRows) ? studentRows : [])) {
    if (row && typeof row.item_id === 'string') respByItem.set(row.item_id, row.response);
  }

  const out = {};
  for (const itemId of Object.keys(realKey || {})) {
    const entry = realKey[itemId];
    // Preserve ungradable entries verbatim (e.g. FRQ answerKey:null) — they carry
    // no answer and the engine treats them as completion-only.
    if (!entry || entry.answerKey == null) {
      out[itemId] = { ...entry };
      continue;
    }
    let redacted = REDACTION_SENTINEL;
    if (!(PC_ITEM.test(itemId) && redactPc)) {
      const resp = respByItem.get(itemId);
      if (resp != null && isCorrect(resp, entry.answerKey)) {
        // Reproduces correct=true; the device only ever sees its OWN right answer.
        redacted = normalizeResponse(resp);
      }
    }
    out[itemId] = { ...entry, answerKey: redacted };
  }
  return out;
}

function extractToken(req) {
  const h = typeof req.headers['authorization'] === 'string' ? req.headers['authorization'] : '';
  if (h.startsWith('Bearer ')) { const t = h.slice(7).trim(); if (t) return t; }
  const q = req.query?.token;
  if (typeof q === 'string' && q.trim()) return q;
  return null;
}

export function mountOfflineInputs(app, {
  verifyToken, ledgerDb, loadAnswerKey, lessonSchedule, db,
  config, worksheetBlankCounts = null,
  blooketLessons = null, blooketPresence = null, blooketRequired = null,
  blooketBonusTopics = null,
  trainerMap = undefined,
}) {
  const _presence = blooketPresence || blooketLessons || BLOOKET_PRESENCE_DEFAULT;
  const _required = blooketRequired || BLOOKET_REQUIRED_DEFAULT;
  const _bonus = blooketBonusTopics || BLOOKET_BONUS_DEFAULT;
  // GET /grade/offline-inputs
  //   Auth: roster token (Bearer or ?token=) — SELF only (no view-as: a device
  //   only ever re-derives its own grade). Read-only.
  //   → 200 { ok, redactedKey, schedule, config, section, worksheetBlankCounts,
  //           blooketLessons, blooketPresence, blooketRequired, blooketBonusTopics,
  //           trainerMap, redactPc }
  app.get('/grade/offline-inputs', async (req, res) => {
    const rawToken = extractToken(req);
    if (!rawToken) return res.status(401).json({ ok: false, error: 'Token required' });
    const studentId = verifyToken(rawToken);
    if (!studentId) return res.status(401).json({ ok: false, error: 'Invalid or expired token' });

    let ledgerRows = [];
    try {
      const r = await ledgerDb.getLedgerByStudent(studentId);
      if (r && r.error) throw r.error;
      ledgerRows = (r && r.data) || [];
    } catch (err) {
      console.error('GET /grade/offline-inputs ledger error:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    let answerKey;
    try {
      answerKey = answerKeyMapOrNull(await loadAnswerKey());
    } catch (err) {
      console.error('GET /grade/offline-inputs answer-key error:', err);
      return res.status(500).json({ ok: false, error: 'Could not load answer key' });
    }
    if (!answerKey) return res.status(500).json({ ok: false, error: 'Answer key malformed' });

    // Resolve section for the lesson-due date filter (mirrors GET /grade).
    let section = null;
    if (db && typeof db.findByStudentId === 'function') {
      try {
        const { data: rosterRow } = await db.findByStudentId(studentId);
        if (rosterRow && rosterRow.section) section = rosterRow.section;
      } catch (_) { /* section stays null → defensive degrade */ }
    }

    const redactPc = !(req.query && (req.query.includePc === '1' || req.query.includePc === 'true'));
    const redactedKey = buildRedactedKey(answerKey, ledgerRows, { redactPc });

    return res.json({
      ok: true,
      redactedKey,
      schedule: lessonSchedule || null,
      config: config || null,
      section,
      worksheetBlankCounts: worksheetBlankCounts || null,
      blooketLessons: _presence, // legacy alias = presence
      blooketPresence: _presence,
      blooketRequired: _required,
      // M2d: enrichment ids so offline re-derive stamps lessons[].blooketBonus
      // (shared "(bonus)" column title for My Gradebook / My Ledger).
      blooketBonusTopics: _bonus,
      trainerMap: (trainerMap !== undefined ? trainerMap : TRAINER_LESSON_MAP) || null,
      redactPc,
    });
  });
}
