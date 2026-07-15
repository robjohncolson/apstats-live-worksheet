// pc.js — Progress-Check makeup delivery endpoints (PC_MAKEUP_DELIVERY_SPEC.md Phase 1).
//
//   GET  /pc/:unit/:part            -> unlocked student fetches the QUESTIONS (answers stripped)
//   POST /pc/unlock                 -> teacher unlocks a list of present students for (unit, part)
//   POST /pc/unlock/student         -> teacher unlocks ONE student (the after-school makeup)
//   GET  /pc/unlock/status          -> caller's own active unlocks
//
// 42P01 (table missing) degrades to 503 until migrations/0029_pc_makeup.sql is run.
// Grading is NOT here — Phase 1 delivers + gates only; scoring is Phase 2.

import { requireTeacher } from './teacher-auth.js';
import { verifyToken } from './token.js';

// Only these fields ever reach the client. WHITELIST (not blacklist) so a new
// answer-bearing field in a future bank can never leak: `answer`,
// `rationaleCorrect`, and `rubric` are omitted by construction. questionParts
// carries only {label, lead?, prompt?, subparts[]} — the question, no answers.
const CLIENT_FIELDS = ['id', 'type', 'n', 'stimulus', 'stem', 'choices', 'questionParts', 'visual', 'glossary'];

function stripForClient(item) {
  var out = {};
  for (var i = 0; i < CLIENT_FIELDS.length; i++) {
    var k = CLIENT_FIELDS[i];
    if (item != null && Object.prototype.hasOwnProperty.call(item, k)) out[k] = item[k];
  }
  return out;
}

// Pull the raw PC26 items array out of a bank payload, tolerant of shape:
// either a bare array, or { items: [...] }, or { parts: { <PART>: { items: [...] } } }.
function itemsFromPayload(payload, part) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.items)) return payload.items;
  if (payload && payload.parts && payload.parts[part] && Array.isArray(payload.parts[part].items)) {
    return payload.parts[part].items;
  }
  return [];
}

function extractToken(req) {
  var authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
  if (typeof authHeader === 'string' && /^Bearer\s+/i.test(authHeader)) {
    var t = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (t) return t;
  }
  if (req.query && typeof req.query.token === 'string' && req.query.token) return req.query.token;
  return null;
}

// Resolve the caller's roster login_username from their student token, or null.
async function callerUsername(req, db) {
  var token = extractToken(req);
  if (!token) return null;
  var sid;
  try { sid = verifyToken(token); } catch (_) { return null; }
  if (!sid) return null;
  try {
    var { data } = await db.findByStudentId(sid);
    return data ? (data.login_username || null) : null;
  } catch (_) { return null; }
}

// Derive the acting teacher's username from their token (never trust client identity).
async function teacherUsername(req, db) {
  var name = await callerUsername(req, db);
  if (name) return name;
  if (req.headers['x-teacher-secret']) return 'teacher-secret';
  return null;
}

const PART_RE = /^(A|REST)$/;

export function mountPc(app, { db, pcDb }) {
  if (!pcDb) return;

  // GET /pc/:unit/:part — unlocked student fetches the questions (answers stripped).
  app.get('/pc/:unit/:part', async (req, res) => {
    var unit = parseInt(req.params.unit, 10);
    var part = String(req.params.part || '').toUpperCase();
    if (!Number.isInteger(unit) || !PART_RE.test(part)) {
      return res.status(400).json({ ok: false, error: 'unit (int) + part (A|REST) required' });
    }

    var username = await callerUsername(req, db);
    if (!username) return res.status(401).json({ ok: false, error: 'unauthorized' });

    // The gate: this student must be unlocked for (unit, part).
    var un = await pcDb.isUnlocked(username, unit, part);
    if (un.error) {
      if (un.error.code === '42P01') return res.status(503).json({ ok: false, error: 'pc_unlock not provisioned — run migration 0029' });
      console.error('GET /pc isUnlocked error:', un.error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    if (!un.data) return res.status(403).json({ ok: false, error: 'locked — take the paper PC first' });

    var bank = await pcDb.getBank(unit, part);
    if (bank.error) {
      if (bank.error.code === '42P01') return res.status(503).json({ ok: false, error: 'pc_bank not provisioned — run migration 0029' });
      console.error('GET /pc getBank error:', bank.error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    if (!bank.data) return res.status(404).json({ ok: false, error: 'no bank for that (unit, part)' });

    var items = itemsFromPayload(bank.data.payload, part).map(stripForClient);
    return res.json({ ok: true, unit: unit, part: part, items: items });
  });

  // POST /pc/unlock { studentUsernames: [...], unit, part }
  // Teacher unlocks the PRESENT students for (unit, part) after the paper administration.
  app.post('/pc/unlock', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });
    var body = req.body || {};
    var studentUsernames = Array.isArray(body.studentUsernames)
      ? body.studentUsernames.map(function (u) { return String(u || '').trim(); }).filter(Boolean)
      : [];
    var unit = parseInt(body.unit, 10);
    var part = String(body.part || '').toUpperCase();
    if (!Number.isInteger(unit) || !PART_RE.test(part) || studentUsernames.length === 0) {
      return res.status(400).json({ ok: false, error: 'studentUsernames[] + unit (int) + part (A|REST) required' });
    }
    var unlockedBy = await teacherUsername(req, db);
    if (!unlockedBy) return res.status(400).json({ ok: false, error: 'could not resolve unlockedBy from auth' });

    try {
      var { data, error } = await pcDb.upsertUnlocks({ studentUsernames, unit, part, unlockedBy });
      if (error) {
        if (error.code === '42P01') return res.status(503).json({ ok: false, error: 'pc_unlock not provisioned — run migration 0029' });
        console.error('POST /pc/unlock error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      return res.json({ ok: true, unit: unit, part: part, unlocked: (data || []).length });
    } catch (err) {
      console.error('POST /pc/unlock throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
  });

  // POST /pc/unlock/student { studentUsername, unit, part } — single unlock (the makeup path).
  app.post('/pc/unlock/student', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });
    var body = req.body || {};
    var studentUsername = String(body.studentUsername || '').trim();
    var unit = parseInt(body.unit, 10);
    var part = String(body.part || '').toUpperCase();
    if (!studentUsername || !Number.isInteger(unit) || !PART_RE.test(part)) {
      return res.status(400).json({ ok: false, error: 'studentUsername + unit (int) + part (A|REST) required' });
    }
    var unlockedBy = await teacherUsername(req, db);
    if (!unlockedBy) return res.status(400).json({ ok: false, error: 'could not resolve unlockedBy from auth' });

    try {
      var { data, error } = await pcDb.unlockOne({ studentUsername, unit, part, unlockedBy });
      if (error) {
        if (error.code === '42P01') return res.status(503).json({ ok: false, error: 'pc_unlock not provisioned — run migration 0029' });
        console.error('POST /pc/unlock/student error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      return res.json({ ok: true, row: data });
    } catch (err) {
      console.error('POST /pc/unlock/student throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
  });

  // GET /pc/unlock/status — caller's own active unlocks.
  app.get('/pc/unlock/status', async (req, res) => {
    var username = await callerUsername(req, db);
    if (!username) return res.status(401).json({ ok: false, error: 'unauthorized' });
    try {
      var { data, error } = await pcDb.listActiveForStudent(username);
      if (error) {
        if (error.code === '42P01') return res.status(503).json({ ok: false, error: 'pc_unlock not provisioned — run migration 0029' });
        console.error('GET /pc/unlock/status error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      return res.json({ ok: true, unlocks: Array.isArray(data) ? data : [] });
    } catch (err) {
      console.error('GET /pc/unlock/status throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
  });
}
