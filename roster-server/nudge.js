// nudge.js -- mounts nudge log endpoints (Phase 3 of
// TEACHER_STUDENT_CONSOLE_SPEC.md). The endpoints are WRITE-LOG only;
// live delivery rides the cr classroom WS (see classroom.js teacherNudge).
//
//   POST /teacher/nudge       -> write log rows for one or many recipients
//   POST /student/nudge-reply -> write a single reply row
//
// 42P01 (table missing) degrades to 503 so the service stays up until
// the user runs migrations/0008_nudges_log.sql in Supabase.

import { requireTeacher } from './teacher-auth.js';
import { verifyToken } from './token.js';

export function mountNudge(app, { db, nudgesDb }) {
  if (!nudgesDb) return;

  // POST /teacher/nudge { nudgeId, recipientUsernames, text, deliveredUsernames }
  // Codex MAJOR fold P3: senderUsername + section are derived from the
  // authenticated teacher token; body values for these fields are IGNORED
  // (a teacher could otherwise forge audit rows as another teacher or
  // cross-section). Break-glass x-teacher-secret falls back to body.
  app.post('/teacher/nudge', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });

    var body = req.body || {};
    var nudgeId = (typeof body.nudgeId === 'string') ? body.nudgeId.trim() : '';
    var recipientUsernames = Array.isArray(body.recipientUsernames) ? body.recipientUsernames.filter(function(u) { return typeof u === 'string' && u.length > 0; }) : [];
    var text = (typeof body.text === 'string') ? body.text : '';
    var deliveredUsernames = Array.isArray(body.deliveredUsernames) ? body.deliveredUsernames : [];

    // Resolve sender identity from the authenticated token (Path B).
    var senderUsername = '';
    var section = null;
    var authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
    var token = '';
    if (typeof authHeader === 'string' && /^Bearer\s+/i.test(authHeader)) {
      token = authHeader.replace(/^Bearer\s+/i, '').trim();
    } else if (req.query && typeof req.query.token === 'string') {
      token = req.query.token;
    }
    if (token) {
      try {
        var sid = verifyToken(token);
        if (sid) {
          var { data: rosterRow } = await db.findByStudentId(sid);
          if (rosterRow) {
            senderUsername = rosterRow.login_username || '';
            section = rosterRow.section || null;
          }
        }
      } catch (_) { /* fall through to break-glass fallback */ }
    }
    // Break-glass (x-teacher-secret): no token to resolve, accept body fields.
    if (!senderUsername && req.headers['x-teacher-secret']) {
      var bodySender = (typeof body.senderUsername === 'string') ? body.senderUsername.trim() : '';
      var bodySection = (typeof body.section === 'string') ? body.section.trim() : null;
      senderUsername = bodySender;
      section = bodySection;
    }

    if (!nudgeId || recipientUsernames.length === 0 || !text.trim() || !senderUsername) {
      return res.status(400).json({ ok: false, error: 'nudgeId, recipientUsernames, text required' });
    }
    if (text.length > 280) text = text.slice(0, 280);

    try {
      var { data, error } = await nudgesDb.insertNudges({
        nudgeId, senderUsername, recipientUsernames, text, section, deliveredUsernames,
      });
      if (error) {
        if (error.code === '42P01') return res.status(503).json({ ok: false, error: 'nudges_log not provisioned -- run migration 0008' });
        console.error('POST /teacher/nudge insert error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      return res.json({ ok: true, nudgeId: nudgeId, rows: data || [] });
    } catch (err) {
      console.error('POST /teacher/nudge throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
  });

  // POST /student/nudge-reply { parentNudgeId, recipientUsername, text, section }
  // Auth: student token (resolves to senderUsername via roster lookup).
  app.post('/student/nudge-reply', async (req, res) => {
    // Verify token + resolve to student_id.
    var authHeader = req.headers['authorization'] || '';
    var token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return res.status(401).json({ ok: false, error: 'unauthorized' });
    var studentId;
    try { studentId = verifyToken(token); } catch (_) { return res.status(401).json({ ok: false, error: 'unauthorized' }); }
    if (!studentId) return res.status(401).json({ ok: false, error: 'unauthorized' });

    var roster;
    try {
      var { data, error } = await db.findByStudentId(studentId);
      if (error || !data) return res.status(401).json({ ok: false, error: 'unauthorized' });
      roster = data;
    } catch (_) { return res.status(401).json({ ok: false, error: 'unauthorized' }); }
    var senderUsername = roster.login_username;
    var section = roster.section;

    var body = req.body || {};
    var parentNudgeId = (typeof body.parentNudgeId === 'string') ? body.parentNudgeId.trim() : '';
    var recipientUsername = (typeof body.recipientUsername === 'string') ? body.recipientUsername.trim() : '';
    var text = (typeof body.text === 'string') ? body.text : '';
    if (!parentNudgeId || !recipientUsername || !text.trim()) {
      return res.status(400).json({ ok: false, error: 'parentNudgeId, recipientUsername, text required' });
    }
    if (text.length > 280) text = text.slice(0, 280);

    // Codex BLOCKER fold P3: verify the student was a delivered recipient
    // of the parent nudge before persisting the reply. Without this any
    // student could POST arbitrary reply rows with any parentNudgeId.
    if (typeof nudgesDb.findParent === 'function') {
      try {
        var { data: parentRow, error: parentErr } = await nudgesDb.findParent({
          nudgeId: parentNudgeId,
          recipientUsername: senderUsername,
        });
        if (parentErr) {
          if (parentErr.code === '42P01') return res.status(503).json({ ok: false, error: 'nudges_log not provisioned -- run migration 0008' });
          console.error('POST /student/nudge-reply parent-lookup error:', parentErr);
          return res.status(500).json({ ok: false, error: 'Database error' });
        }
        if (!parentRow) {
          return res.status(403).json({ ok: false, error: 'no matching parent nudge for this recipient' });
        }
      } catch (err) {
        console.error('POST /student/nudge-reply parent-lookup throw:', err);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
    }

    try {
      var { data: replyData, error: replyError } = await nudgesDb.insertReply({
        parentNudgeId, senderUsername, recipientUsername, text, section,
      });
      if (replyError) {
        if (replyError.code === '42P01') return res.status(503).json({ ok: false, error: 'nudges_log not provisioned -- run migration 0008' });
        console.error('POST /student/nudge-reply insert error:', replyError);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      return res.json({ ok: true, row: replyData });
    } catch (err) {
      console.error('POST /student/nudge-reply throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
  });
}
