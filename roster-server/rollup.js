// rollup.js — mounts GET /rollup onto an Express app (Gradebook Phase 2b).
// Call mountRollup(app, { verifyToken, ledgerDb, loadAnswerKey }) from createApp().
//
// The cr-quiz GRADE feeder rollup: scores a student's `curriculum_quiz`
// item_ledger rows (DN2d wrote them with `score` deliberately omitted) against
// the bundled, READ-ONLY-derived answer key, and aggregates per unit. This is
// the cr-quiz contribution to v2 §2's `B(unit)`; it does NOT compute the grade
// (cap/uncap = Phase 3). Server-authoritative: the client never sees the key,
// so a forged client score is impossible (raw `response` is re-scored here).
//
// Proctored Progress Check rows (source 'pc') are NOT part of the cr-quiz
// feeder — they are v2 §2's separate uncapping `P(unit)` (Phase 3). This
// rollup intentionally only aggregates source === 'curriculum_quiz'.

// ── Helpers ───────────────────────────────────────────────────────────────────
// Scoring/aggregation helpers now live in scoring.js (single source of truth so
// /grade + /mastery score identically — GRADEBOOK_PHASE3_BUILD.md §5). Behavior
// is byte-equivalent to the originals; the 13 tests below pin it. normalizeResponse
// is re-exported because rollup.test.js imports it from this module.
import {
  normalizeResponse as _normalizeResponse,
  isCorrect,
  latestPerItem,
  unitOf,
  answerKeyMapOrNull,
} from './scoring.js';

export const normalizeResponse = _normalizeResponse;

// Extract Bearer token from Authorization header or ?token= query param.
function extractToken(req) {
  const authHeader =
    typeof req.headers['authorization'] === 'string' ? req.headers['authorization'] : '';
  if (authHeader.startsWith('Bearer ')) {
    const t = authHeader.slice(7).trim();
    if (t) return t;
  }
  const q = req.query?.token;
  if (typeof q === 'string' && q.trim()) return q;
  return null;
}

// ── Route mounter ─────────────────────────────────────────────────────────────

export function mountRollup(app, { verifyToken, ledgerDb, loadAnswerKey }) {

  // GET /rollup
  //   Auth: roster token via Authorization: Bearer <t> OR ?token=.
  //   Reads the student's curriculum_quiz item_ledger rows + the bundled
  //   answer key; scores latest attempt per item; aggregates per unit.
  //   → 200 { ok, asOf, units: { U1: {attempted,graded,correct,crQuizPct} },
  //           totals: {attempted,graded,correct,ungradable,crQuizPct} }
  //   NO grade math (Phase 3). Read-only w.r.t. item_ledger.
  app.get('/rollup', async (req, res) => {
    const rawToken = extractToken(req);
    if (!rawToken) {
      return res.status(401).json({ ok: false, error: 'Token required' });
    }
    const studentId = verifyToken(rawToken);
    if (!studentId) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
    }

    let ledgerResult;
    try {
      ledgerResult = await ledgerDb.getLedgerByStudent(studentId);
    } catch (err) {
      console.error('GET /rollup ledger error:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    const { data: ledgerRows, error: ledgerError } = ledgerResult || {};
    if (ledgerError) {
      console.error('GET /rollup ledger error:', ledgerError);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    let answerKeyDoc;
    try {
      answerKeyDoc = await loadAnswerKey();
    } catch (err) {
      console.error('GET /rollup answer-key error:', err);
      return res.status(500).json({ ok: false, error: 'Could not load answer key' });
    }
    // Fail CLOSED on a structurally-invalid answer-key doc — now via the
    // shared validator (single source of truth; also rejects parseable-but-
    // corrupt PER-ENTRY shapes, not just the top-level container — Codex
    // Phase-3 MAJOR, applied uniformly across /rollup /grade /mastery). A
    // sparse object is still fine: a MISSING key → ungradable by design.
    const answerKey = answerKeyMapOrNull(answerKeyDoc);
    if (!answerKey) {
      console.error('GET /rollup answer-key malformed:', typeof answerKeyDoc);
      return res.status(500).json({ ok: false, error: 'Answer key malformed' });
    }

    // Only the cr-quiz FEEDER (lesson quizzes). PC = Phase-3 `P`, excluded.
    const rows = (Array.isArray(ledgerRows) ? ledgerRows : [])
      .filter(r => r && r.source === 'curriculum_quiz');

    const units = {};
    const ensure = (u) => (units[u] || (units[u] = { attempted: 0, graded: 0, correct: 0, ungradable: 0 }));

    for (const row of latestPerItem(rows)) {
      const itemId = row.item_id;
      const keyEntry = answerKey[itemId];
      const u = ensure(unitOf(itemId, keyEntry));
      u.attempted += 1;
      if (!keyEntry || keyEntry.answerKey == null) {
        // No objective key (FRQ / unknown id) → counted, not scored.
        u.ungradable += 1;
        continue;
      }
      u.graded += 1;
      if (isCorrect(row.response, keyEntry.answerKey)) u.correct += 1;
    }

    const totals = { attempted: 0, graded: 0, correct: 0, ungradable: 0 };
    for (const u of Object.keys(units).sort()) {
      const x = units[u];
      x.crQuizPct = x.graded > 0 ? Math.round((x.correct / x.graded) * 1000) / 10 : null;
      totals.attempted += x.attempted;
      totals.graded += x.graded;
      totals.correct += x.correct;
      totals.ungradable += x.ungradable;
    }
    totals.crQuizPct = totals.graded > 0
      ? Math.round((totals.correct / totals.graded) * 1000) / 10
      : null;

    // Stable, sorted unit order in the response.
    const unitsOut = {};
    for (const u of Object.keys(units).sort()) unitsOut[u] = units[u];

    return res.json({ ok: true, asOf: new Date().toISOString(), units: unitsOut, totals });
  });
}
