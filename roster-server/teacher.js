// teacher.js -- mounts teacher-gated per-student READ endpoints (Phase 1 of
// TEACHER_STUDENT_CONSOLE_SPEC.md). Sibling to class.js, which fans the same
// compute over the whole roster; this file is the single-student dual.
//
//   GET /teacher/student/:studentId/profile -> identity + role
//   GET /teacher/student/:studentId/grade   -> computeGrade for one student
//   GET /teacher/student/:studentId/recent  -> last N ledger rows for one student
//
// Pure READ-ONLY. Auth via requireTeacher (x-teacher-secret OR a token whose
// role resolves to 'teacher'). 401 forbidden | 404 not found | 500 db error.

import { PHASE3_CONFIG } from './grade-config.js';
import { answerKeyMapOrNull } from './scoring.js';
import { computeGrade } from './grade.js';
import { computeDonow } from './donow.js';
import { requireTeacher } from './teacher-auth.js';

// Studentizer: roster columns → the dashboard's per-student header.
function studentMeta(r) {
  return {
    studentId: r.student_id,
    realName: r.real_name,
    username: r.login_username,
    section: r.section,
  };
}

// ── Route mounter ─────────────────────────────────────────────────────────────

export function mountTeacherStudent(app, {
  db, ledgerDb, loadAnswerKey, lessonSchedule, eventSchedule = null, config = PHASE3_CONFIG,
  worksheetBlankCounts = null, loadManifest = null, pollArchiveDb = null,
  blooketPresence = null, blooketRequired = null, blooketLessons = null,
}) {
  const _presence = blooketPresence || blooketLessons || null;
  const _required = blooketRequired || null;

  // ── GET /teacher/student/:studentId/profile ─────────────────────────────────
  // Returns identity tuple: studentId, username, realName, section, role.
  app.get('/teacher/student/:studentId/profile', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });

    const { studentId } = req.params;

    let roster, role;
    try {
      const { data, error } = await db.findByStudentId(studentId);
      if (error) {
        console.error('GET /teacher/student/:studentId/profile roster error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      if (!data) return res.status(404).json({ ok: false, error: 'student not found' });
      roster = data;
    } catch (err) {
      console.error('GET /teacher/student/:studentId/profile roster throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    try {
      role = await db.getRoleByStudentId(studentId);
    } catch (_) {
      role = 'student';
    }

    return res.json({
      ok: true,
      studentId: roster.student_id,
      username: roster.login_username,
      realName: roster.real_name,
      section: roster.section,
      role,
    });
  });

  // ── GET /teacher/student/:studentId/grade ───────────────────────────────────
  // Single-student variant of /class/grades. Reuses computeGrade identically.
  app.get('/teacher/student/:studentId/grade', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });

    let answerKeyDoc;
    try { answerKeyDoc = await loadAnswerKey(); }
    catch (err) {
      console.error('GET /teacher/student/:studentId/grade answer-key error:', err);
      return res.status(500).json({ ok: false, error: 'Could not load answer key' });
    }
    const answerKey = answerKeyMapOrNull(answerKeyDoc);
    if (!answerKey) {
      console.error('GET /teacher/student/:studentId/grade answer-key malformed');
      return res.status(500).json({ ok: false, error: 'Answer key malformed' });
    }

    const { studentId } = req.params;

    let roster;
    try {
      const { data, error } = await db.findByStudentId(studentId);
      if (error) {
        console.error('GET /teacher/student/:studentId/grade roster error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      if (!data) return res.status(404).json({ ok: false, error: 'student not found' });
      roster = data;
    } catch (err) {
      console.error('GET /teacher/student/:studentId/grade roster throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    let ledgerRows = [];
    try {
      const { data, error } = await ledgerDb.getLedgerByStudent(studentId);
      if (!error) ledgerRows = Array.isArray(data) ? data : [];
    } catch (_) {
      // defensive: one student error → empty ledger, not a 500
      ledgerRows = [];
    }

    const computed = computeGrade(ledgerRows, answerKey, config, {
      lessonSchedule,
      eventSchedule,
      section: roster.section || null,
      worksheetBlankCounts,
      blooketPresence: _presence || undefined,
      blooketRequired: _required || undefined,
      blooketLessons: _presence || undefined,
    });

    return res.json({
      ok: true,
      asOf: new Date().toISOString(),
      ...studentMeta(roster),
      ...computed,
      config: {
        C: config.C,
        feederWeights: config.feederWeights,
        frqBand: config.frqBand,
        quarters: config.quarters,
      },
    });
  });

  // ── GET /teacher/student/:studentId/recent?limit=N ──────────────────────────
  // Returns the N most recent ledger rows. Default 20; min 1; max 100.
  app.get('/teacher/student/:studentId/recent', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });

    // Parse limit: NaN/null/<1 → 20; Infinity or >100 → 100; else floor.
    // (Codex MINOR fold: Infinity used to fall to 20; now clamps to 100.)
    const raw = Number(req.query.limit);
    let limit;
    if (Number.isNaN(raw) || raw < 1) limit = 20;
    else if (!Number.isFinite(raw) || raw > 100) limit = 100;
    else limit = Math.floor(raw);

    const { studentId } = req.params;

    let roster;
    try {
      const { data, error } = await db.findByStudentId(studentId);
      if (error) {
        console.error('GET /teacher/student/:studentId/recent roster error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      if (!data) return res.status(404).json({ ok: false, error: 'student not found' });
      roster = data;
    } catch (err) {
      console.error('GET /teacher/student/:studentId/recent roster throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    let rows;
    try {
      const { data, error } = await ledgerDb.getLedgerByStudent(studentId);
      if (error) {
        console.error('GET /teacher/student/:studentId/recent ledger error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      rows = Array.isArray(data) ? data : [];
    } catch (err) {
      console.error('GET /teacher/student/:studentId/recent ledger throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    // Sort by recorded_at desc (ISO 8601 sorts lexicographically), then slice.
    // (Codex MINOR fold: comparator returns 0 on equality so V8 stable sort
    // preserves relative order of equal-timestamp rows.)
    const sorted = rows.slice().sort((a, b) => {
      const ar = a.recorded_at || '';
      const br = b.recorded_at || '';
      if (br < ar) return -1;
      if (br > ar) return 1;
      return 0;
    });
    const sliced = sorted.slice(0, limit);

    // Map snake_case → camelCase per BUILD §2.2.3.
    const submissions = sliced.map(r => ({
      recordedAt: r.recorded_at,
      itemId:     r.item_id,
      source:     r.source,
      response:   r.response,
      score:      r.score,
      unit:       r.unit,
      attempt:    r.attempt,
    }));

    return res.json({
      ok: true,
      ...studentMeta(roster),
      submissions,
    });
  });

  // ── GET /teacher/student/:studentId/donow ────────────────────────────────────
  // Mirror of GET /donow but teacher-authed and student resolved from path param.
  // Requires loadManifest dep (passed through from server.js). Degrades to 500 if
  // loadManifest is not provided.
  // → 200 { ok:true, nextTask, lessons, units, earlierGapFlag }
  app.get('/teacher/student/:studentId/donow', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });

    const { studentId } = req.params;

    let roster;
    try {
      const { data, error } = await db.findByStudentId(studentId);
      if (error) {
        console.error('GET /teacher/student/:studentId/donow roster error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      if (!data) return res.status(404).json({ ok: false, error: 'student not found' });
      roster = data;
    } catch (err) {
      console.error('GET /teacher/student/:studentId/donow roster throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    // Load ledger rows for the target student.
    let ledgerRows = [];
    try {
      const { data, error } = await ledgerDb.getLedgerByStudent(studentId);
      if (error) {
        console.error('GET /teacher/student/:studentId/donow ledger error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      ledgerRows = Array.isArray(data) ? data : [];
    } catch (err) {
      console.error('GET /teacher/student/:studentId/donow ledger throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    // Load work-manifest.
    if (!loadManifest) {
      return res.status(500).json({ ok: false, error: 'Work manifest not available' });
    }
    let manifest;
    try {
      manifest = await loadManifest();
    } catch (err) {
      console.error('GET /teacher/student/:studentId/donow manifest error:', err);
      return res.status(500).json({ ok: false, error: 'Could not load work manifest' });
    }

    const computed = computeDonow(ledgerRows, manifest);

    return res.json({ ok: true, ...computed });
  });

  // ── GET /teacher/student/:studentId/poll-archive ─────────────────────────────
  // Mirror of GET /poll-archive but teacher-authed and student resolved from path
  // param. pollArchiveDb is optional: degrades to 503 when absent or when the
  // underlying table is missing (42P01), mirroring mountPollArchive's degrade.
  // → 200 { ok:true, polls: [...] }
  app.get('/teacher/student/:studentId/poll-archive', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });

    // Graceful degrade when pollArchiveDb was not provided at mount time.
    if (!pollArchiveDb) {
      return res.status(503).json({
        ok: false,
        error: 'poll_archive not provisioned -- run migration 0007',
      });
    }

    const { studentId } = req.params;

    let roster;
    try {
      const { data, error } = await db.findByStudentId(studentId);
      if (error) {
        console.error('GET /teacher/student/:studentId/poll-archive roster error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      if (!data) return res.status(404).json({ ok: false, error: 'student not found' });
      roster = data;
    } catch (err) {
      console.error('GET /teacher/student/:studentId/poll-archive roster throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    const section = roster.section;
    if (!section) {
      return res.status(500).json({ ok: false, error: 'Student has no section' });
    }

    let data, dbError;
    try {
      ({ data, error: dbError } = await pollArchiveDb.listPollArchive(section, null));
    } catch (err) {
      // Thrown 42P01 (table missing) — treat the same as an error return.
      if (err && (err.code === '42P01' || /relation .* does not exist/i.test(err.message || ''))) {
        return res.status(503).json({
          ok: false,
          error: 'poll_archive not provisioned -- run migration 0007',
        });
      }
      console.error('GET /teacher/student/:studentId/poll-archive DB throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    if (dbError) {
      if (dbError.code === '42P01' || /relation .* does not exist/i.test(dbError.message || '')) {
        return res.status(503).json({
          ok: false,
          error: 'poll_archive not provisioned -- run migration 0007',
        });
      }
      console.error('GET /teacher/student/:studentId/poll-archive DB error:', dbError);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    // Map snake_case DB columns to camelCase contract shape (mirrors /poll-archive exactly).
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
  });
}
