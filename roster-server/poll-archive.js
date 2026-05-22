// poll-archive.js -- mounts /poll-archive routes onto an Express app
// (Live Classroom v2.1 -- LIVE_CLASSROOM_V2_1_BUILD.md section 1.2).
//
// All routes are ADDITIVE. The DB-access is wrapped so the new table being
// absent (Postgres '42P01' relation-does-not-exist) returns 503 with a
// uniform "poll_archive not provisioned -- run migration 0007" reason --
// the rest of the service stays up until the user runs
// migrations/0007_poll_archive.sql on the curriculum_render Supabase project.
//
// Endpoints:
//   POST /poll-archive          (teacher-gated)
//   GET  /poll-archive          (roster token; section from token, not query param)
//   DELETE /poll-archive/:id    (teacher-gated)

import { requireTeacher } from './teacher-auth.js';
import { verifyToken } from './token.js';

function isTableMissing(error) {
  return !!(error && (error.code === '42P01' || /relation .* does not exist/i.test(error.message || '')));
}

function respondTableMissing(res) {
  return res.status(503).json({
    ok: false,
    error: 'poll_archive not provisioned -- run migration 0007',
  });
}

function respondDbError(res, where, error) {
  // eslint-disable-next-line no-console
  console.error(`poll-archive ${where} DB error:`, error);
  return res.status(500).json({ ok: false, error: 'Database error' });
}

// Extract Bearer token from Authorization header or ?token= query param.
// Mirrors the pattern in donow.js exactly.
function extractToken(req) {
  const authHeader =
    typeof req.headers['authorization'] === 'string'
      ? req.headers['authorization']
      : '';

  if (authHeader.startsWith('Bearer ')) {
    const bearerToken = authHeader.slice(7).trim();
    if (bearerToken) return bearerToken;
  }

  const queryToken = req.query && typeof req.query.token === 'string' ? req.query.token.trim() : '';
  if (queryToken) return queryToken;

  return null;
}

// Defensive async wrapper -- mirrors remediation.js safeAsync exactly.
// Express 4 does NOT convert an awaited rejection into a JSON response.
function safeAsync(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('poll-archive handler unexpected error:', err);
      if (!res.headersSent) {
        if (isTableMissing(err)) return respondTableMissing(res);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
    }
  };
}

// ── Route mounter ─────────────────────────────────────────────────────────────

export function mountPollArchive(app, { pollArchiveDb, db }) {

  // ── POST /poll-archive (teacher-gated) ────────────────────────────────────
  app.post('/poll-archive', safeAsync(async (req, res) => {
    if (!await requireTeacher(req, db)) {
      return res.status(401).json({ ok: false, error: 'forbidden' });
    }

    const { pollId, section, pollDate, question, options, tally, blind } = req.body || {};

    // Validate: all required fields present.
    if (!pollId || !section || !pollDate || !question || !options || !tally) {
      return res.status(400).json({ ok: false, error: 'pollId, section, pollDate, question, options, and tally are required' });
    }

    // Validate pollDate format.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pollDate)) {
      return res.status(400).json({ ok: false, error: 'pollDate must match YYYY-MM-DD' });
    }

    // Validate options: array, length 2-8.
    if (!Array.isArray(options) || options.length < 2 || options.length > 8) {
      return res.status(400).json({ ok: false, error: 'options must be an array of 2-8 strings' });
    }

    // Validate tally: array, same length as options.
    if (!Array.isArray(tally) || tally.length !== options.length) {
      return res.status(400).json({ ok: false, error: 'tally must be an array the same length as options' });
    }

    const { error } = await pollArchiveDb.insertPollArchive({
      pollId,
      section,
      pollDate,
      question,
      options,
      tally,
      blind: !!blind,
    });

    // insertPollArchive is idempotent at the DB layer (upsert + ON CONFLICT
    // DO NOTHING) -- a duplicate poll_id is skipped with no error, so a
    // re-POST of the same closed poll is a no-op success.
    if (error) {
      if (isTableMissing(error)) return respondTableMissing(res);
      return respondDbError(res, 'insert', error);
    }

    return res.json({ ok: true });
  }));

  // ── GET /poll-archive (roster token) ─────────────────────────────────────
  // Auth: verify roster token exactly like donow.js GET /donow.
  // Section is resolved from the token's roster row -- NEVER from a query param.
  app.get('/poll-archive', safeAsync(async (req, res) => {
    const rawToken = extractToken(req);
    if (!rawToken) {
      return res.status(401).json({ ok: false, error: 'Token required' });
    }

    const studentId = verifyToken(rawToken);
    if (!studentId) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
    }

    // Resolve section from the roster row (same pattern as grade.js).
    const rosterResult = await db.findByStudentId(studentId);
    if (rosterResult.error || !rosterResult.data) {
      return res.status(401).json({ ok: false, error: 'Student not found' });
    }
    const section = rosterResult.data.section;
    if (!section) {
      return res.status(401).json({ ok: false, error: 'Student has no section' });
    }

    // Optional date filter -- caller must use YYYY-MM-DD.
    const date =
      typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date
        : null;

    const { data, error } = await pollArchiveDb.listPollArchive(section, date);
    if (error) {
      if (isTableMissing(error)) return respondTableMissing(res);
      return respondDbError(res, 'list', error);
    }

    // Map snake_case DB columns to camelCase contract shape.
    const polls = (data || []).map(row => ({
      id:        row.id,
      pollId:    row.poll_id,
      pollDate:  row.poll_date,
      question:  row.question,
      options:   Array.isArray(row.options) ? row.options : [],
      tally:     Array.isArray(row.tally) ? row.tally : [],
      blind:     !!row.blind,
      createdAt: row.created_at,
    }));

    return res.json({ ok: true, polls });
  }));

  // ── DELETE /poll-archive/:id (teacher-gated) ──────────────────────────────
  app.delete('/poll-archive/:id', safeAsync(async (req, res) => {
    if (!await requireTeacher(req, db)) {
      return res.status(401).json({ ok: false, error: 'forbidden' });
    }

    const { id } = req.params;

    const { error } = await pollArchiveDb.deletePollArchive(id);
    if (error) {
      if (isTableMissing(error)) return respondTableMissing(res);
      return respondDbError(res, 'delete', error);
    }

    return res.json({ ok: true });
  }));
}
