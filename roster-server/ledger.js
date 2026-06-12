// ledger.js — mounts /ledger routes onto an Express app.
// Implements FROZEN CONTRACT 2 exactly.
// Call mountLedger(app, { db, verifyToken }) from createApp().

// Detect the "source not provisioned" condition: the body's `source` value is
// not yet in the item_ledger source CHECK because its migration hasn't been
// run. Mirrors class.js's isBlooketSourceMissing: only this specific
// pre-migration condition maps to 503; every other DB error is a real 500.
// Without this, a check_violation surfaces as a generic 500 "Database error"
// and the writer dies silently (how study_guide_diagnostic was lost for weeks).
import { issueLedgerReceipt } from './receipts.js';

function isSourceNotProvisioned(e) {
  if (!e) return false;
  const code = String(e.code || '');
  const msg = String(e.message || '').toLowerCase();
  if (code === '23514') return true; // check_violation (the source CHECK rejects the value)
  return msg.includes('item_ledger_source_check');
}

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
  //   → 503 source not in the item_ledger CHECK yet (run the latest migration)
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
      if (isSourceNotProvisioned(error)) {
        return res.status(503).json({ ok: false, error: `source '${source}' not provisioned (run the latest item_ledger migration)` });
      }
      console.error('Ledger insert error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    const body = {
      ok: true,
      ledgerId:     data.ledger_id,
      evidenceTier: data.evidence_tier
    };
    const receipt = issueLedgerReceipt({
      studentId,
      source,
      itemId,
      score,
      attempt: attempt ?? 1,
      evidenceTier: data.evidence_tier,
      response
    });
    if (receipt) body.receipt = receipt;

    return res.json(body);
  });

  // ── GET /ledger/student/:studentId ──────────────────────────────────────────
  // PERSISTENT_ANSWERS_BUILD.md §3 extension:
  //   Query: prefix (optional) — strict prefix filter on item_id. Rejects any
  //          non-[A-Za-z0-9-] characters with 400. Underscore is excluded too:
  //          Supabase .like() treats _ as a single-char wildcard, so allowing it
  //          would silently widen the filter. Real item_ids only use [A-Za-z0-9-].
  //
  //   Auth (EITHER):
  //     - Header  x-teacher-secret == process.env.ROSTER_TEACHER_SECRET, OR
  //     - Header  Authorization: Bearer <token> OR query ?token=<token>
  //               AND verifyToken(token) === :studentId
  //
  //   Auth precedence: teacher secret beats token. If teacher header is absent
  //   AND a token is present but verifyToken(token) !== :studentId → 403
  //   (clearer signal than 401 for cross-student attempts).
  //
  //   → 200 { ok:true, rows:[ item_ledger rows ] }   newest first
  //   → 400 { ok:false, error:'bad prefix' }          invalid prefix chars
  //   → 401 { ok:false, error:'forbidden' }           no valid auth
  //   → 403 { ok:false, error:'cross-student' }       token sid != :studentId
  //   → 500 { ok:false, error:'Database error' }
  app.get('/ledger/student/:studentId', async (req, res) => {
    const { studentId } = req.params;

    // ── Auth resolution ────────────────────────────────────────────────────
    const teacherSecret = process.env.ROSTER_TEACHER_SECRET;
    const providedTeacher = req.headers['x-teacher-secret'];
    const teacherOk = teacherSecret && providedTeacher === teacherSecret;

    // Extract token from Authorization: Bearer <t> OR ?token=<t>.
    let token = null;
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (typeof authHeader === 'string' && /^Bearer\s+/i.test(authHeader)) {
      token = authHeader.replace(/^Bearer\s+/i, '').trim() || null;
    }
    if (!token && typeof req.query.token === 'string' && req.query.token) {
      token = req.query.token;
    }

    if (!teacherOk) {
      if (!token) {
        return res.status(401).json({ ok: false, error: 'forbidden' });
      }
      const tokenSid = verifyToken(token);
      if (!tokenSid) {
        return res.status(401).json({ ok: false, error: 'forbidden' });
      }
      if (tokenSid !== studentId) {
        return res.status(403).json({ ok: false, error: 'cross-student' });
      }
    }

    // ── Optional prefix sanitization ───────────────────────────────────────
    const prefixRaw = req.query.prefix;
    let prefix;
    if (prefixRaw !== undefined && prefixRaw !== null && prefixRaw !== '') {
      if (typeof prefixRaw !== 'string' || !/^[A-Za-z0-9\-]+$/.test(prefixRaw)) {
        return res.status(400).json({ ok: false, error: 'bad prefix' });
      }
      prefix = prefixRaw;
    }

    const { data, error } = await db.getLedgerByStudent(studentId, prefix ? { prefix } : undefined);

    if (error) {
      console.error('Ledger fetch error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    return res.json({ ok: true, rows: data || [] });
  });
}
