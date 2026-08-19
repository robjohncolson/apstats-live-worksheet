// ledger.js — mounts /ledger routes onto an Express app.
// Implements FROZEN CONTRACT 2 exactly.
// Call mountLedger(app, { db, verifyToken }) from createApp().

// Detect the "source not provisioned" condition: the body's `source` value is
// not yet in the item_ledger source CHECK because its migration hasn't been
// run. Mirrors class.js's isBlooketSourceMissing: only this specific
// pre-migration condition maps to 503; every other DB error is a real 500.
// Without this, a check_violation surfaces as a generic 500 "Database error"
// and the writer dies silently (how study_guide_diagnostic was lost for weeks).
import { issueLedgerReceipt, recordReceiptPersistFailure, verifyReviewGrant } from './receipts.js';

let receiptPersistenceNotProvisionedLogged = false;

function isReceiptPersistenceNotProvisioned(err) {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || '').toLowerCase();
  return code === '42703' || msg.includes('undefined_column') || msg.includes('undefined column');
}

function handleReceiptPersistenceError(err, ledgerId) {
  if (isReceiptPersistenceNotProvisioned(err)) {
    if (!receiptPersistenceNotProvisionedLogged) {
      receiptPersistenceNotProvisionedLogged = true;
      console.info('receipt persistence not provisioned; continuing without stored receipt columns');
    }
    return;
  }
  recordReceiptPersistFailure();
  console.warn('Receipt persistence failed for ledgerId:', ledgerId, err);
}

async function resolveReceiptUsername(resolveUsername, studentId) {
  if (typeof resolveUsername !== 'function') return undefined;
  try {
    const username = await resolveUsername(studentId);
    return username || undefined;
  } catch (_) {
    return undefined;
  }
}

function isSourceNotProvisioned(e) {
  if (!e) return false;
  const code = String(e.code || '');
  const msg = String(e.message || '').toLowerCase();
  if (code === '23514') return true; // check_violation (the source CHECK rejects the value)
  return msg.includes('item_ledger_source_check');
}

function requiresReviewGrant(source) {
  return source === 'quiz_review' || source === 'quiz_exception';
}

function validGrantCredit(credit) {
  return typeof credit === 'number' && Number.isFinite(credit) && credit >= 0 && credit <= 1;
}

function normalizeWorksheetAnswer(value) {
  return String(value || '').toLowerCase().trim().replace(/[^\w\s./-]/g, '');
}

export function scoreWorksheetAnswer(dataAnswer, response) {
  const accepted = String(dataAnswer).split('|').map(normalizeWorksheetAnswer);
  const user = normalizeWorksheetAnswer(response);
  // An empty answer is never partial credit (every string `.includes('')`), and
  // the client never records empty blanks — match that: empty → incorrect.
  if (!user) return 0;
  if (accepted.includes(user)) return 1;
  if (accepted.some(answer => user.includes(answer) || answer.includes(user))) return 0.5;
  return 0;
}

function findWorksheetAnswer(worksheetKey, itemId) {
  if (!worksheetKey || typeof worksheetKey !== 'object') return undefined;
  const values = worksheetKey.worksheetKey && typeof worksheetKey.worksheetKey === 'object'
    ? worksheetKey.worksheetKey
    : worksheetKey;
  return values[itemId] === undefined ? undefined : String(values[itemId]);
}

// ── Route mounter ─────────────────────────────────────────────────────────────

export function mountLedger(app, { db, verifyToken, resolveUsername, worksheetKey, rosterDb }) {

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
    const { token, source, itemId, response, unit, topic, skill, score, attempt, grant } = req.body || {};

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

    const keyedWorksheetAnswer = source === 'worksheet' ? findWorksheetAnswer(worksheetKey, itemId) : undefined;
    let effectiveScore = keyedWorksheetAnswer === undefined
      ? score
      : scoreWorksheetAnswer(keyedWorksheetAnswer, response);
    let gradingProvenance = source === 'worksheet' ? 'self' : undefined;
    if (keyedWorksheetAnswer !== undefined) gradingProvenance = 'key';

    if (requiresReviewGrant(source)) {
      const payload = verifyReviewGrant(grant);
      const validGrant = payload
        && payload.t === 'review-grant'
        && payload.sid === studentId
        && payload.item === itemId
        && Number(payload.exp) > Date.now()
        && validGrantCredit(payload.credit);

      if (!validGrant) {
        return res.status(400).json({ ok: false, error: 'review grant required' });
      }

      effectiveScore = payload.credit;
    }

    // FRQ durable floor (2026-08-19). Worksheet reflections are written by three
    // client paths: DRAFT saves (score undefined) while typing, GRADED writes
    // (E/P/I → 1/0.5/0) from the AI pass, and appeals. The upsert key is
    // (student, source, item, attempt), so a draft after a grade used to NULL the
    // stored score, and a later weaker regrade could lower it. Every client path
    // already promises "never downgrade" in memory; this makes it durable:
    //   - a null/undefined incoming score never replaces a stored number
    //     (the response text still updates — drafts keep flowing);
    //   - a lower incoming score never replaces a higher stored one.
    // Grade math is untouched (this only decides what the row holds).
    if (source === 'frq' && typeof db.getLedgerByStudent === 'function') {
      try {
        const attemptNo = attempt ?? 1;
        const { data: rows } = await db.getLedgerByStudent(studentId, { prefix: itemId });
        const existing = Array.isArray(rows)
          ? rows.find((r) => r && r.item_id === itemId && r.source === 'frq' && Number(r.attempt ?? 1) === Number(attemptNo))
          : null;
        const stored = existing && existing.score !== null && existing.score !== undefined ? Number(existing.score) : null;
        if (stored !== null && Number.isFinite(stored)) {
          const incoming = (effectiveScore === null || effectiveScore === undefined || effectiveScore === '') ? null : Number(effectiveScore);
          if (incoming === null || !Number.isFinite(incoming) || incoming < stored) {
            effectiveScore = stored;   // floor holds; the response text is still refreshed
          }
        }
      } catch (_) { /* best-effort: a read failure must never block the write */ }
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
      score: effectiveScore,
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
    const username = await resolveReceiptUsername(resolveUsername, studentId);
    const receipt = issueLedgerReceipt({
      studentId,
      username,
      source,
      itemId,
      score: effectiveScore,
      attempt: attempt ?? 1,
      evidenceTier: data.evidence_tier,
      response,
      gradingProvenance
    });
    if (receipt) body.receipt = receipt;
    if (receipt && data.ledger_id && db && typeof db.updateLedgerReceipt === 'function') {
      try {
        const persistResult = await db.updateLedgerReceipt(data.ledger_id, {
          receiptId: receipt.receiptId,
          receiptCompact: receipt.compact
        });
        if (persistResult && persistResult.error) {
          handleReceiptPersistenceError(persistResult.error, data.ledger_id);
        }
      } catch (err) {
        handleReceiptPersistenceError(err, data.ledger_id);
      }
    }

    return res.json(body);
  });

  // ── GET /ledger/student/:studentId ──────────────────────────────────────────
  // PERSISTENT_ANSWERS_BUILD.md §3 extension:
  //   Query: prefix (optional) — strict prefix filter on item_id. Rejects any
  //          non-[A-Za-z0-9-] characters with 400. Underscore is excluded too:
  //          Supabase .like() treats _ as a single-char wildcard, so allowing it
  //          would silently widen the filter. Real item_ids only use [A-Za-z0-9-].
  //
  //   Auth (ANY):
  //     - Header  x-teacher-secret == process.env.ROSTER_TEACHER_SECRET, OR
  //     - Header  Authorization: Bearer <token> OR query ?token=<token>
  //               AND verifyToken(token) === :studentId (self-read), OR
  //     - A token whose sid != :studentId but whose role === 'teacher'
  //               (teacher view-as: read any student's ledger read-only).
  //
  //   Auth precedence: teacher secret beats token. If teacher header is absent
  //   AND a token is present but verifyToken(token) !== :studentId AND the token
  //   is NOT a teacher → 403 (clearer signal than 401 for cross-student attempts).
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
        // A verified teacher may read ANY student's ledger — this powers the
        // read-only "view as student" worksheet (a teacher's own token, the
        // target student's :studentId). Role lookup goes through the ROSTER db
        // (rosterDb), not the ledger db, and degrades to 'student' on any error
        // or when rosterDb isn't wired, so a DB hiccup never widens access.
        // Anyone else reading a different student is a genuine cross-student
        // attempt.
        let role = 'student';
        try {
          if (rosterDb && typeof rosterDb.getRoleByStudentId === 'function') {
            role = await rosterDb.getRoleByStudentId(tokenSid);
          }
        } catch (_) {
          role = 'student';
        }
        if (role !== 'teacher') {
          return res.status(403).json({ ok: false, error: 'cross-student' });
        }
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

    const rows = data || [];
    // Nightly Review augment (NIGHTLY_REVIEW_SPEC.md §4): attach each row's review state
    // (LEFT JOIN review_marks by ledger_id) so the student's "My Ledger" can render the
    // "👁 seen / 💬 comment" badges. Best-effort + degrades silently pre-migration-0025:
    // a missing table / DB hiccup just leaves rows without a `review` field.
    if (rosterDb && typeof rosterDb.listReviewMarksByStudent === 'function') {
      try {
        const mr = await rosterDb.listReviewMarksByStudent(studentId);
        if (mr && !mr.error && Array.isArray(mr.data)) {
          const byLedger = {};
          for (const m of mr.data) byLedger[m.ledger_id] = m;
          for (const row of rows) {
            const mark = byLedger[row.ledger_id];
            row.review = mark
              ? { seenAt: mark.seen_at, teacher: mark.teacher_username, comment: mark.comment ?? null }
              : null;
          }
        }
      } catch (_) { /* pre-migration / DB hiccup → no review field, students still see their work */ }
    }

    return res.json({ ok: true, rows });
  });
}
