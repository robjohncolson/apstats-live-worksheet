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
function isCorrect(response, answerKey) {
  const r = normalizeResponse(response);
  if (r == null || answerKey == null) return false;
  return r === String(answerKey).trim().toLowerCase();
}

// Keep only the authoritative attempt per item_id: highest `attempt`, tie
// broken by latest `recorded_at`. Defensive against missing fields.
function latestPerItem(rows) {
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
      if (at >= bt) best.set(id, row);
    }
  }
  return [...best.values()];
}

// Unit label for aggregation: prefer the answer-key entry's unit, else derive
// "U{n}" from the id (matches DN2d's `unit: 'U'+n` convention).
function unitOf(itemId, keyEntry) {
  if (keyEntry && keyEntry.unit != null && String(keyEntry.unit).trim() !== '') {
    return `U${String(keyEntry.unit).replace(/^U/i, '')}`;
  }
  const m = String(itemId).match(/^U(\d+)-/i);
  return m ? `U${m[1]}` : 'U?';
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
    // Fail CLOSED on a structurally-invalid answer-key doc (parseable but
    // wrong shape). Substituting {} would silently mark every item ungradable
    // and return 200 — masking answer-key corruption (Codex MAJOR). Treat it
    // like a load failure. (A sparse-but-valid object is fine: per-item
    // "not in key → ungradable" already handles missing entries correctly.)
    if (
      !answerKeyDoc ||
      typeof answerKeyDoc !== 'object' ||
      !answerKeyDoc.answerKey ||
      typeof answerKeyDoc.answerKey !== 'object' ||
      Array.isArray(answerKeyDoc.answerKey)
    ) {
      console.error('GET /rollup answer-key malformed:', typeof answerKeyDoc);
      return res.status(500).json({ ok: false, error: 'Answer key malformed' });
    }
    const answerKey = answerKeyDoc.answerKey;

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
