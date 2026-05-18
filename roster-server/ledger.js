// ledger.js — mounts /ledger routes onto an Express app.
// Implements FROZEN CONTRACT 2 exactly.
// Call mountLedger(app, { db, verifyToken }) from createApp().

// ── Route mounter ─────────────────────────────────────────────────────────────

export function mountLedger(app, { db, verifyToken }) {

  // ── POST /ledger/record ─────────────────────────────────────────────────────
  // FROZEN CONTRACT 2:
  //   Body: { token (req), source (req), itemId (req), response (req), unit?, topic?,
  //           skill?, score?, attempt?=1 }
  //   Header (optional): x-proctor-secret
  //   Behavior: verifyToken(token) → studentId; 401 if absent/expired.
  //     evidence_tier DERIVED server-side from x-proctor-secret header — body field ignored.
  //     Upsert on (student_id, source, item_id, attempt).
  //   → 200 { ok:true, ledgerId, evidenceTier }
  //   → 400 missing required fields
  //   → 401 bad token
  app.post('/ledger/record', async (req, res) => {
    const { token, source, itemId, response, unit, topic, skill, score, attempt } = req.body || {};

    // Validate required fields
    if (!token) {
      return res.status(401).json({ ok: false, error: 'invalid token' });
    }

    if (!source || !itemId || response === undefined) {
      return res.status(400).json({ ok: false, error: 'source, itemId, and response are required' });
    }

    // Resolve studentId from token
    const studentId = verifyToken(token);
    if (!studentId) {
      return res.status(401).json({ ok: false, error: 'invalid token' });
    }

    // Derive evidence_tier server-side (decision L-C).
    // Any client-supplied evidenceTier in the body is IGNORED.
    const proctorSecret = process.env.ROSTER_PROCTOR_SECRET;
    const providedProctor = req.headers['x-proctor-secret'];
    const evidenceTier = (proctorSecret && providedProctor === proctorSecret)
      ? 'proctored'
      : 'practice';

    const { data, error } = await db.insertLedgerRow({
      studentId,
      source,
      itemId,
      unit,
      topic,
      skill,
      response,
      score,
      evidenceTier,
      attempt: attempt ?? 1
    });

    if (error) {
      console.error('Ledger insert error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    return res.json({
      ok: true,
      ledgerId:     data.ledger_id,
      evidenceTier: data.evidence_tier
    });
  });

  // ── GET /ledger/student/:studentId ──────────────────────────────────────────
  // FROZEN CONTRACT 2:
  //   Header: x-teacher-secret == process.env.ROSTER_TEACHER_SECRET; 401 otherwise.
  //   → 200 { ok:true, rows:[ item_ledger rows ] }
  app.get('/ledger/student/:studentId', async (req, res) => {
    const teacherSecret = process.env.ROSTER_TEACHER_SECRET;
    const provided = req.headers['x-teacher-secret'];

    if (!teacherSecret || provided !== teacherSecret) {
      return res.status(401).json({ ok: false, error: 'forbidden' });
    }

    const { studentId } = req.params;

    const { data, error } = await db.getLedgerByStudent(studentId);

    if (error) {
      console.error('Ledger fetch error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    return res.json({ ok: true, rows: data || [] });
  });
}
