// pc.js — Progress-Check makeup delivery + scoring endpoints
// (PC_MAKEUP_DELIVERY_SPEC.md Phase 1 + PC_MAKEUP_PHASE2_GRADE_SPEC.md §A/§B).
//
//   GET  /pc/:unit/:part            -> unlocked student fetches the QUESTIONS (answers stripped)
//   POST /pc/:unit/:part/submit     -> unlocked student submits answers; server scores
//                                      vs the CB-secure pc_bank + writes best-wins 'pc' rows
//   POST /pc/grade                  -> teacher enters one proctored PAPER PC part (A|B|C|FRQ)
//   GET  /pc/parts                  -> teacher: every student's posted parts + blended PC % (one unit)
//   GET  /pc/status, POST /pc/status -> teacher: the AP Classroom snapshot (migration 0043)
//   POST /pc/unlock                 -> teacher unlocks a list of present students for (unit, part)
//   POST /pc/unlock/student         -> teacher unlocks ONE student (the after-school makeup)
//   GET  /pc/unlock/status          -> caller's own active unlocks
//
// 42P01 (table missing) degrades to 503 until migrations/0029_pc_makeup.sql is run.
// Scoring is SERVER-SIDE only (answers live in pc_bank, never reach the client);
// the written 'pc' rows stay grade-INERT until config.pcTrack.enabled (§C gate).

import { requireTeacher } from './teacher-auth.js';
import { verifyToken } from './token.js';
import { isCorrect, scorePcRows } from './scoring.js';

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
  var id = await callerIdentity(req, db);
  return id ? id.username : null;
}

// Resolve BOTH the caller's studentId (for ledger writes) and login_username
// (for the unlock gate) from their student token, or null.
async function callerIdentity(req, db) {
  var token = extractToken(req);
  if (!token) return null;
  var sid;
  try { sid = verifyToken(token); } catch (_) { return null; }
  if (!sid) return null;
  try {
    var { data } = await db.findByStudentId(sid);
    if (!data) return null;
    return { studentId: sid, username: data.login_username || null };
  } catch (_) { return null; }
}

// FRQ vs MCQ is an EXPLICIT property of a bank item, never inferred from a
// missing key. 'frq' when item.type says free-response/frq or the id carries
// -FRQ-; 'mcq' when type says multiple-choice/mcq or the id carries -MCQ-;
// otherwise 'unknown'. (2026-08-19: previously `answer == null` silently made an
// item an FRQ, so an MCQ with a missing key scored null and vanished from the
// PC denominator with no error anywhere.)
export function classifyPcItem(item) {
  if (!item) return 'unknown';
  var type = String(item.type || '').toLowerCase();
  var id = String(item.id || '');
  if (type === 'free-response' || type === 'frq' || /-FRQ-/.test(id)) return 'frq';
  if (type === 'multiple-choice' || type === 'mcq' || /-MCQ-/.test(id)) return 'mcq';
  return 'unknown';
}

// True when an MCQ item cannot be auto-scored because its key is missing —
// a BANK DEFECT (the loader refuses such banks; this is the runtime backstop).
export function isPcBankDefect(item) {
  return classifyPcItem(item) === 'mcq' && (item.answer === null || item.answer === undefined || item.answer === '');
}

var _pcDefectLogged = {};
// Score ONE submitted response against a CB-secure bank item → credit in [0,1],
// or null when it can't be auto-scored (FRQ → the paper/AI path). MCQ is exact
// match (isCorrect mirrors cr's checkIfAnswerCorrect). An MCQ WITHOUT a key or
// an item of unknown type still returns null (nothing else is honest) but is
// logged loudly, once per item, as a bank defect — never silently treated as FRQ.
export function scorePcItem(item, response) {
  if (!item) return null;
  var kind = classifyPcItem(item);
  if (kind === 'frq') return null;
  if (kind === 'unknown' || isPcBankDefect(item)) {
    var key = String(item.id || '?');
    if (!_pcDefectLogged[key]) {
      _pcDefectLogged[key] = true;
      console.error('[pc] BANK DEFECT — cannot auto-score item ' + key + ': ' +
        (kind === 'unknown' ? 'type is neither MCQ nor FRQ' : 'MCQ has no answer key') +
        ' (score=null; fix the bank, see roster-server/scripts/load-pc-bank.mjs validation)');
    }
    return null;
  }
  return isCorrect(response, item.answer) ? 1 : 0;
}

// Derive the acting teacher's username from their token (never trust client identity).
async function teacherUsername(req, db) {
  var name = await callerUsername(req, db);
  if (name) return name;
  if (req.headers['x-teacher-secret']) return 'teacher-secret';
  return null;
}

const PART_RE = /^(A|REST)$/;            // the online makeup parts (unlock + delivery)
const GRADE_PART_RE = /^(A|B|C|FRQ|REST)$/; // paper parts POST /pc/grade accepts (REST = legacy)
const PC_ORIGINS = ['apclassroom', 'paper', 'teacher'];

export function mountPc(app, { db, pcDb, ledgerDb, figuresSigner }) {
  if (!pcDb) return;

  // GET /pc/:unit/:part — unlocked student fetches the questions (answers stripped).
  app.get('/pc/:unit/:part', async (req, res, next) => {
    // Don't shadow the literal GET /pc/unlock/* routes (this parametric route is
    // registered first; without this, /pc/unlock/status|class would 400 here).
    if (req.params.unit === 'unlock') return next();
    var unit = parseInt(req.params.unit, 10);
    var part = String(req.params.part || '').toUpperCase();
    if (!Number.isInteger(unit) || !PART_RE.test(part)) {
      return res.status(400).json({ ok: false, error: 'unit (int) + part (A|REST) required' });
    }

    // Teachers may PREVIEW any PC without an unlock (mirrors the view-as pattern
    // used across the roster's teacher surface). Answers are still stripped —
    // the preview shows exactly what a student sees.
    var isTeacher = await requireTeacher(req, db);
    if (!isTeacher) {
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
    }

    var bank = await pcDb.getBank(unit, part);
    if (bank.error) {
      if (bank.error.code === '42P01') return res.status(503).json({ ok: false, error: 'pc_bank not provisioned — run migration 0029' });
      console.error('GET /pc getBank error:', bank.error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    if (!bank.data) return res.status(404).json({ ok: false, error: 'no bank for that (unit, part)' });

    var items = itemsFromPayload(bank.data.payload, part).map(stripForClient);
    // Attach short-lived signed figure URLs (PC26 figures live in a private CB
    // bucket; D1-a keeps them behind this gate — no service key on the client).
    // One batched sign per request; best-effort — a missing signer/env or a failed
    // sign just ships items without figures (cr falls back to the [Figure] text).
    // `id` is whitelisted by stripForClient, so items[].id survives to key the sign.
    if (figuresSigner) {
      try {
        var figMap = await figuresSigner.signForItems(items.map(function (it) { return it.id; }));
        items.forEach(function (it) { if (figMap && figMap[it.id]) it.figures = figMap[it.id]; });
      } catch (_) { /* degrade: ship without figures */ }
    }
    return res.json({ ok: true, unit: unit, part: part, items: items, teacher: isTeacher });
  });

  // POST /pc/:unit/:part/submit { responses: [{ itemId, response }] }
  // An unlocked student submits answers. The server scores each response against
  // the CB-secure pc_bank (answers NEVER reach the client) and writes best-wins
  // source='pc' ledger rows. Best-wins is enforced at WRITE (only-raises) so an
  // infinite retake can never lower a prior score. The response echoes ONLY each
  // item's earned credit — never the correct answer.
  app.post('/pc/:unit/:part/submit', async (req, res) => {
    if (!ledgerDb) return res.status(503).json({ ok: false, error: 'ledger not provisioned' });
    var unit = parseInt(req.params.unit, 10);
    var part = String(req.params.part || '').toUpperCase();
    if (!Number.isInteger(unit) || !PART_RE.test(part)) {
      return res.status(400).json({ ok: false, error: 'unit (int) + part (A|REST) required' });
    }

    // Student-only + unlock-gated (mirrors GET /pc; no teacher bypass — teachers
    // enter proctored scores via POST /pc/grade).
    var who = await callerIdentity(req, db);
    if (!who) return res.status(401).json({ ok: false, error: 'unauthorized' });
    var un = await pcDb.isUnlocked(who.username, unit, part);
    if (un.error) {
      if (un.error.code === '42P01') return res.status(503).json({ ok: false, error: 'pc_unlock not provisioned — run migration 0029' });
      console.error('POST /pc submit isUnlocked error:', un.error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    if (!un.data) return res.status(403).json({ ok: false, error: 'locked — take the paper PC first' });

    // Load the bank WITH answers to score server-side.
    var bank = await pcDb.getBank(unit, part);
    if (bank.error) {
      if (bank.error.code === '42P01') return res.status(503).json({ ok: false, error: 'pc_bank not provisioned — run migration 0029' });
      console.error('POST /pc submit getBank error:', bank.error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    if (!bank.data) return res.status(404).json({ ok: false, error: 'no bank for that (unit, part)' });

    var byId = {};
    itemsFromPayload(bank.data.payload, part).forEach(function (it) {
      if (it && it.id) byId[String(it.id)] = it;
    });

    // Existing best score per item (best-wins floor). Non-fatal on read error.
    var prevBest = {};
    try {
      var led = await ledgerDb.getLedgerByStudent(who.studentId);
      (led && Array.isArray(led.data) ? led.data : []).forEach(function (r) {
        if (r && r.source === 'pc' && r.item_id != null && r.score != null && Number.isFinite(Number(r.score))) {
          var s = Number(r.score);
          var k = String(r.item_id);
          if (prevBest[k] == null || s > prevBest[k]) prevBest[k] = s;
        }
      });
    } catch (_) { /* first submit / read hiccup → treat as no prior score */ }

    var responses = Array.isArray((req.body || {}).responses) ? req.body.responses : [];
    var scored = [];
    for (var i = 0; i < responses.length; i++) {
      var r = responses[i] || {};
      var itemId = String(r.itemId || '');
      var item = byId[itemId];
      if (!item) continue; // not a real item in this bank — ignore
      var credit = scorePcItem(item, r.response); // 0..1 or null (FRQ pending)
      var prior = prevBest[itemId];
      // Only-raises: never overwrite a stored score with a lower one, and never
      // wipe a prior score with an un-auto-scorable (null) FRQ submission.
      var finalScore;
      if (credit == null) {
        finalScore = (prior == null) ? null : prior;
      } else {
        finalScore = (prior == null) ? credit : Math.max(credit, prior);
      }
      var ins = await ledgerDb.insertLedgerRow({
        studentId: who.studentId, source: 'pc', itemId: itemId,
        unit: 'U' + unit, response: r.response, score: finalScore,
        evidenceTier: 'practice', attempt: 1,
      });
      if (ins && ins.error) {
        if (ins.error.code === '23514') return res.status(503).json({ ok: false, error: "source 'pc' not provisioned — run migration 0011" });
        console.error('POST /pc submit insert error:', ins.error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      scored.push({ itemId: itemId, score: credit }); // THIS attempt's credit only
    }
    return res.json({ ok: true, unit: unit, part: part, scored: scored });
  });

  // POST /pc/grade { studentUsername, unit, part, score? , points?, of?, note?, origin? }
  // Teacher (or the AP Classroom reconcile) enters one PROCTORED paper PC PART
  // (PC_FOLLOWTHROUGH_SPEC.md §2.1). Written as its own U{n}-PC-{PART}-PAPER row;
  // scorePcRows blends the parts (half MCQ, half FRQ) and best-wins that against
  // the online attempts. points + of → score = points / of; else score (0..1).
  app.post('/pc/grade', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });
    if (!ledgerDb) return res.status(503).json({ ok: false, error: 'ledger not provisioned' });
    var body = req.body || {};
    var studentUsername = String(body.studentUsername || '').trim();
    var unit = parseInt(body.unit, 10);
    var part = String(body.part || '').toUpperCase();
    if (!studentUsername || !Number.isInteger(unit) || !GRADE_PART_RE.test(part)) {
      return res.status(400).json({ ok: false, error: 'studentUsername + unit (int) + part (A|B|C|FRQ|REST) required' });
    }
    if (part === 'REST') console.warn('POST /pc/grade: part REST is deprecated; post B, C and FRQ as separate parts');

    var hasPoints = body.points != null || body.of != null;
    var points = hasPoints ? body.points : null;
    var of = hasPoints ? body.of : null;
    var score;
    if (hasPoints) {
      if (typeof points !== 'number' || typeof of !== 'number' || !Number.isFinite(points) || !Number.isFinite(of) || of <= 0 || points < 0 || points > of) {
        return res.status(400).json({ ok: false, error: 'points + of required together: of > 0, 0 <= points <= of' });
      }
      score = points / of;
    } else {
      score = Number(body.score);
      if (body.score == null || !Number.isFinite(score) || score < 0 || score > 1) {
        return res.status(400).json({ ok: false, error: 'score (0..1) required when points + of are not given' });
      }
    }

    if (body.note != null && (typeof body.note !== 'string' || body.note.length > 300)) {
      return res.status(400).json({ ok: false, error: 'note must be a string of at most 300 characters' });
    }
    var origin = body.origin == null ? 'teacher' : String(body.origin);
    if (!PC_ORIGINS.includes(origin)) {
      return res.status(400).json({ ok: false, error: 'origin must be apclassroom | paper | teacher' });
    }

    var detail = { part: part };
    if (hasPoints) { detail.points = points; detail.of = of; }
    detail.origin = origin;
    if (body.note) detail.note = body.note;
    detail.postedAt = new Date().toISOString();

    var found;
    try { found = await db.findByUsername(studentUsername); } catch (err) {
      console.error('POST /pc/grade findByUsername throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    if (!found || !found.data || !found.data.student_id) {
      return res.status(404).json({ ok: false, error: 'no such student' });
    }

    var ins = await ledgerDb.insertLedgerRow({
      studentId: found.data.student_id, source: 'pc',
      itemId: 'U' + unit + '-PC-' + part + '-PAPER',
      unit: 'U' + unit, response: JSON.stringify(detail), score: score,
      evidenceTier: 'proctored', attempt: 1,
    });
    if (ins && ins.error) {
      if (ins.error.code === '23514') return res.status(503).json({ ok: false, error: "source 'pc' not provisioned — run migration 0011" });
      console.error('POST /pc/grade insert error:', ins.error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    var out = { ok: true, unit: unit, part: part, student: studentUsername, score: score };
    if (hasPoints) { out.points = points; out.of = of; }
    return res.json(out);
  });

  // GET /pc/parts?section=PeriodE&unit=1 (teacher) — every student's posted PC
  // parts + the blended PC % for one unit (PC_FOLLOWTHROUGH_SPEC.md §2.2). Read by
  // the dashboard completeness panel and by the reconcile's never-lower check.
  app.get('/pc/parts', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });
    if (!ledgerDb) return res.status(503).json({ ok: false, error: 'ledger not provisioned' });
    var section = String((req.query && req.query.section) || '').trim();
    var unit = parseInt(req.query && req.query.unit, 10);
    if (!section || !Number.isInteger(unit)) {
      return res.status(400).json({ ok: false, error: 'section + unit (int) required' });
    }

    var roster;
    try { roster = await db.listRoster(section); } catch (err) { roster = { error: err }; }
    if (!roster || roster.error) {
      console.error('GET /pc/parts listRoster error:', roster && roster.error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    var students = [];
    var rosterRows = Array.isArray(roster.data) ? roster.data : [];
    for (var i = 0; i < rosterRows.length; i++) {
      var r = rosterRows[i];
      if (!r || r.role === 'teacher') continue;
      var led;
      try { led = await ledgerDb.getLedgerByStudent(r.student_id); } catch (err) { led = { error: err }; }
      // A missing student would look like "no parts posted" and the reconcile could
      // post a deadline 0 over a real score: fail the whole read instead.
      if (!led || led.error) {
        console.error('GET /pc/parts ledger read failed for one student');
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      var pcRows = (led.data || []).filter(function (row) { return row && row.source === 'pc'; });
      var unitAgg = scorePcRows(pcRows, {}).units['U' + unit] || null;
      students.push({
        username: r.login_username,
        studentId: r.student_id,
        parts: (unitAgg && unitAgg.parts) || {},
        pct: unitAgg ? unitAgg.pct : null,
      });
    }
    return res.json({ ok: true, section: section, unit: unit, students: students });
  });

  // GET /pc/status?section=&unit= (teacher) — the AP Classroom snapshot the
  // reconcile saw last (PC_FOLLOWTHROUGH_SPEC.md §2.3). Table: migration 0043.
  app.get('/pc/status', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });
    var section = String((req.query && req.query.section) || '').trim();
    var unit = parseInt(req.query && req.query.unit, 10);
    if (!section || !Number.isInteger(unit)) {
      return res.status(400).json({ ok: false, error: 'section + unit (int) required' });
    }
    try {
      var { data, error } = await pcDb.getStatus(section, unit);
      if (error) {
        if (error.code === '42P01') return res.status(503).json({ ok: false, error: 'run migration 0043' });
        console.error('GET /pc/status error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      return res.json({
        ok: true, section: section, unit: unit,
        status: data ? data.payload : null,
        updatedAt: data ? data.updated_at : null,
      });
    } catch (err) {
      console.error('GET /pc/status throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
  });

  // POST /pc/status { section, unit, payload } (teacher) — the reconcile stores its
  // snapshot. Usernames only; unmatched AP Classroom names are counted, never stored.
  // POST /pc/status { section, unit, reminders } (no payload) — MERGE: only the stored
  // snapshot's `reminders` key changes (§4b: the session marks the drafts sent).
  app.post('/pc/status', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });
    var body = req.body || {};
    var section = String(body.section || '').trim();
    var unit = parseInt(body.unit, 10);
    var payload = body.payload;
    var remindersOnly = payload == null && body.reminders != null;
    if (remindersOnly) {
      if (!section || !Number.isInteger(unit) || typeof body.reminders !== 'object' || Array.isArray(body.reminders)) {
        return res.status(400).json({ ok: false, error: 'section + unit (int) + reminders (object) required' });
      }
      try {
        var current = await pcDb.getStatus(section, unit);
        if (current.error) {
          if (current.error.code === '42P01') return res.status(503).json({ ok: false, error: 'run migration 0043' });
          console.error('POST /pc/status (reminders) read error:', current.error);
          return res.status(500).json({ ok: false, error: 'Database error' });
        }
        if (!current.data || !current.data.payload) return res.status(404).json({ ok: false, error: 'no snapshot to update' });
        payload = Object.assign({}, current.data.payload, { reminders: body.reminders });
      } catch (err) {
        console.error('POST /pc/status (reminders) throw:', err);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
    }
    if (!section || !Number.isInteger(unit) || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return res.status(400).json({ ok: false, error: 'section + unit (int) + payload (object) required' });
    }
    try {
      var { error } = await pcDb.upsertStatus(section, unit, payload);
      if (error) {
        if (error.code === '42P01') return res.status(503).json({ ok: false, error: 'run migration 0043' });
        console.error('POST /pc/status error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      return res.json({ ok: true, section: section, unit: unit });
    } catch (err) {
      console.error('POST /pc/status throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
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

  // GET /pc/unlock/class — teacher makeup-queue board: every active unlock across
  // the class (student_username, unit, part, unlocked_by, unlocked_at). The
  // dashboard maps usernames → names from its already-loaded /class/grades payload.
  app.get('/pc/unlock/class', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });
    try {
      var { data, error } = await pcDb.listActiveUnlocks();
      if (error) {
        if (error.code === '42P01') return res.status(503).json({ ok: false, error: 'pc_unlock not provisioned — run migration 0029' });
        console.error('GET /pc/unlock/class error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      return res.json({ ok: true, unlocks: Array.isArray(data) ? data : [] });
    } catch (err) {
      console.error('GET /pc/unlock/class throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
  });
}
