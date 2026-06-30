// review.js — Nightly Review (NIGHTLY_REVIEW_SPEC.md). Two teacher-gated endpoints:
//
//   GET  /class/review-queue?section=&days=  → the review surface: per-student recent work,
//        priority-sorted, with unseen counts + "not reviewed in N days" flag.
//   POST /class/review                        → mark item(s) SEEN, optionally COMMENT, mint
//        1 bonus candy (once/student/review-day, idempotent) + persist a signed t:'review'
//        receipt, and (on a comment) drop a teacher→student message so the student toasts.
//
// A review NEVER changes a score/grade. Reviews are signed → they ride the same
// snapshot/verify/restore durability rails as grades. See migration 0025.

import { requireTeacher } from './teacher-auth.js';
import { verifyToken } from './token.js';
import { issueReviewReceipt } from './receipts.js';
import { todayInTz } from './lesson-grade.js';
import { computeGrade } from './grade.js';
import { answerKeyMapOrNull } from './scoring.js';

const SESSION_GAP_MS = 25 * 60 * 1000;   // > 25 min idle starts a new session burst (mirrors commits.js)
const N_DAYS_FLAG = 5;                    // "not reviewed in N school days" flag (spec §13 default)
const COMMENT_MAX = 500;                  // stored comment cap
const NUDGE_MAX = 280;                    // teacher→student message cap (mirrors nudge.js)
const MAX_ITEMS_PER_STUDENT = 80;         // cap the queue payload per student (newest first)
const MAX_TARGETS = 500;                  // cap one mark request

// Migration 0025 not run yet → tables/fn absent. 42P01 undefined_table, 42883 undefined_function,
// PGRST205 schema-cache miss (table), PGRST202 function-not-found.
function isReviewMissing(e) {
  if (!e) return false;
  const code = String(e.code || '');
  const msg = String(e.message || '').toLowerCase();
  if (['42P01', '42883', 'PGRST205', 'PGRST202'].includes(code)) return true;
  return (msg.includes('review_marks') || msg.includes('review_award') || msg.includes('review_candy_grants'))
    && (msg.includes('schema cache') || msg.includes('does not exist') || msg.includes('could not find'));
}
function notProvisioned(res) {
  return res.status(503).json({ ok: false, error: 'nightly review not provisioned (run migration 0025)' });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractToken(req) {
  const h = req.headers['authorization'] || req.headers['Authorization'];
  if (typeof h === 'string' && /^Bearer\s+/i.test(h)) return h.replace(/^Bearer\s+/i, '').trim() || null;
  if (req.query && typeof req.query.token === 'string' && req.query.token) return req.query.token;
  return null;
}

// Per-item review priority (spec §5): human-eyes-needed work floats up.
//   FRQ / free-response > low scores / appeals > proctored > auto-graded MC/worksheet.
export function itemPriority(row) {
  const src = String(row.source || '');
  const score = (row.score === null || row.score === undefined) ? null : Number(row.score);
  // 1. Free-response / self- or AI-graded — needs real human eyes.
  if (src === 'frq' || src === 'ai' || src === 'ai-graded' || src === 'self-graded' || src === 'reflection') return 100;
  // 2. Appeals / exceptions, then low scores.
  if (src === 'quiz_review' || src === 'quiz_exception') return 90;
  if (score !== null && Number.isFinite(score) && score < 0.5) return 80;
  // 3. Proctored over practice.
  if (row.evidence_tier === 'proctored') return 60;
  // 4. Everything else (auto-graded MC/worksheet) — fine to bulk "mark all seen".
  return 10;
}

// A short, safe preview of the student's response for the queue row.
export function responseSnippet(response) {
  if (response === null || response === undefined) return '';
  let s;
  if (typeof response === 'string') s = response;
  else if (typeof response === 'number' || typeof response === 'boolean') s = String(response);
  else { try { s = JSON.stringify(response); } catch (_) { s = ''; } }
  s = s.trim();
  return s.length > 140 ? s.slice(0, 140) + '…' : s;
}

// Assign a session index to each row (rows in ANY order in → map keyed by ledger_id).
// A gap > SESSION_GAP_MS between consecutive (time-sorted) rows starts a new session.
function sessionize(rows) {
  const sorted = rows.slice().sort((a, b) => (Date.parse(a.recorded_at) || 0) - (Date.parse(b.recorded_at) || 0));
  const byId = {};
  let session = 0, lastTs = null;
  for (const r of sorted) {
    const ts = Date.parse(r.recorded_at) || 0;
    if (lastTs !== null && (ts - lastTs) > SESSION_GAP_MS) session += 1;
    byId[r.ledger_id] = session;
    lastTs = ts;
  }
  return byId;
}

// Best-effort "current grade" headline (the last quarter with a numeric grade). Never
// throws — the queue's job is the work list; a grade hiccup must not 500 it.
function currentGradeOf(ledgerRows, answerKey, config, opts) {
  try {
    if (!answerKey || typeof computeGrade !== 'function') return null;
    const computed = computeGrade(ledgerRows, answerKey, config, opts);
    const quarters = (computed && Array.isArray(computed.quarters)) ? computed.quarters : [];
    let g = null;
    for (const q of quarters) {
      if (q && typeof q.quarterGrade === 'number' && Number.isFinite(q.quarterGrade)) g = q.quarterGrade;
    }
    return g === null ? null : Math.round(g);
  } catch (_) {
    return null;
  }
}

// ── Route mounter ─────────────────────────────────────────────────────────────
export function mountReview(app, { db, ledgerDb, nudgesDb, loadAnswerKey, lessonSchedule, config, worksheetBlankCounts, schoolTz = 'America/New_York' }) {

  // Resolve the acting teacher's login_username for the receipt `by` + the mark's
  // teacher_username + the notify sender. Bearer token → that teacher's username;
  // the x-teacher-secret break-glass path → the single roster teacher; else 'teacher'.
  async function resolveTeacherUsername(req) {
    const token = extractToken(req);
    if (token) {
      try {
        const sid = verifyToken(token);
        if (sid) {
          const r = await db.findByStudentId(sid);
          if (r && r.data && r.data.login_username) return r.data.login_username;
        }
      } catch (_) { /* fall through */ }
    }
    try {
      const t = await db.findTeacherUsername();
      if (t && t.data && t.data.login_username) return t.data.login_username;
    } catch (_) { /* fall through */ }
    return 'teacher';
  }

  // ── GET /class/review-queue?section=&days= ──────────────────────────────────
  app.get('/class/review-queue', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });

    const section = (req.query.section && String(req.query.section).trim()) || null;
    const daysRaw = Number(req.query.days);
    const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(daysRaw, 365) : null;
    const windowFloor = days ? Date.now() - days * 86400000 : null;

    let rosterRes;
    try { rosterRes = await db.listRoster(section); } catch (e) { rosterRes = { error: e }; }
    if (rosterRes && rosterRes.error) {
      console.error('GET /class/review-queue roster error:', rosterRes.error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    const rosterRows = (Array.isArray(rosterRes.data) ? rosterRes.data : [])
      .filter((r) => r && r.student_id && r.role !== 'teacher');
    const studentIds = rosterRows.map((r) => r.student_id);

    const marksRes = await db.listReviewMarksByStudents(studentIds);
    if (marksRes && marksRes.error) {
      if (isReviewMissing(marksRes.error)) return notProvisioned(res);
      console.error('GET /class/review-queue marks error:', marksRes.error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    const markByLedger = {};
    for (const m of (marksRes.data || [])) markByLedger[m.ledger_id] = m;

    // Optional grade context (best-effort; never blocks the queue).
    let answerKey = null;
    if (typeof loadAnswerKey === 'function') {
      try { answerKey = answerKeyMapOrNull(await loadAnswerKey()); } catch (_) { answerKey = null; }
    }
    const todayStr = todayInTz(schoolTz);

    const students = [];
    let unseenTotal = 0;
    for (const r of rosterRows) {
      const sid = r.student_id;
      let rows = [];
      try { const lr = await ledgerDb.getLedgerByStudent(sid); rows = (lr && lr.data) || []; } catch (_) { rows = []; }

      const sessionByLedger = sessionize(rows);
      // Window filter (fixed lookback) — newest first (getLedgerByStudent already sorts desc).
      const windowed = windowFloor
        ? rows.filter((row) => (Date.parse(row.recorded_at) || 0) >= windowFloor)
        : rows;

      const items = [];
      let unseen = 0;
      for (const row of windowed) {
        if (items.length >= MAX_ITEMS_PER_STUDENT) break;
        const mark = markByLedger[row.ledger_id] || null;
        const seen = !!mark;
        if (!seen) unseen += 1;
        items.push({
          ledgerId: row.ledger_id,
          source: row.source,
          itemId: row.item_id,
          score: (row.score === undefined ? null : row.score),
          recordedAt: row.recorded_at,
          responseSnippet: responseSnippet(row.response),
          sessionId: sessionByLedger[row.ledger_id] ?? null,
          priority: itemPriority(row),
          seen,
          seenAt: mark ? mark.seen_at : null,
          comment: mark ? (mark.comment ?? null) : null,
        });
      }
      unseenTotal += unseen;

      // Last reviewed (across ALL of this student's marks, not just the window).
      let lastReviewedAt = null;
      for (const m of (marksRes.data || [])) {
        if (m.student_id === sid && m.seen_at && (!lastReviewedAt || m.seen_at > lastReviewedAt)) lastReviewedAt = m.seen_at;
      }
      const daysSinceReview = lastReviewedAt
        ? Math.floor((Date.now() - (Date.parse(lastReviewedAt) || 0)) / 86400000)
        : null;

      // Student priority = max UNSEEN item priority + a nudge for staleness.
      let maxUnseenPriority = 0;
      for (const it of items) if (!it.seen && it.priority > maxUnseenPriority) maxUnseenPriority = it.priority;
      const stalenessNudge = (daysSinceReview === null) ? 25 : Math.min(daysSinceReview * 5, 50);
      const priority = unseen > 0 ? maxUnseenPriority + stalenessNudge : 0;

      students.push({
        studentId: sid,
        username: r.login_username,
        realName: r.real_name ?? null,
        section: r.section ?? null,
        currentGrade: currentGradeOf(rows, answerKey, config, { lessonSchedule, section: r.section, worksheetBlankCounts }),
        lastReviewedAt,
        daysSinceReview,
        stale: daysSinceReview !== null && daysSinceReview >= N_DAYS_FLAG,
        unseen,
        priority,
        items,
      });
    }

    students.sort((a, b) => b.priority - a.priority || b.unseen - a.unseen);

    return res.json({
      ok: true,
      asOf: new Date().toISOString(),
      section,
      nDaysFlag: N_DAYS_FLAG,
      unseenTotal,
      students,
    });
  });

  // Resolve the set of target ledger rows for a mark request. Either an explicit
  // ledgerIds[] (the primary path — the UI sends exactly what it wants marked, be it
  // one item, a session's items, or all), or a server-resolved {studentId, scope}.
  async function resolveTargets(body) {
    if (Array.isArray(body.ledgerIds) && body.ledgerIds.length) {
      const ids = body.ledgerIds.filter((x) => typeof x === 'string' && UUID_RE.test(x)).slice(0, MAX_TARGETS);
      if (!ids.length) return { rows: [] };
      return await ledgerDb.getRowsByLedgerIds(ids);
    }
    const sid = body.studentId;
    const scope = body.scope;
    if (typeof sid === 'string' && UUID_RE.test(sid) && scope) {
      const lr = await ledgerDb.getLedgerByStudent(sid);
      if (lr && lr.error) return { error: lr.error };
      let rows = (lr && lr.data) || [];
      if (scope === 'day' && typeof body.date === 'string') {
        rows = rows.filter((row) => todayInTz(schoolTz, Date.parse(row.recorded_at) || 0) === body.date);
      } else if (scope === 'session' && body.sessionId !== undefined && body.sessionId !== null) {
        const sessionByLedger = sessionize(rows);
        rows = rows.filter((row) => sessionByLedger[row.ledger_id] === Number(body.sessionId));
      } else if (scope !== 'all') {
        return { rows: [] };
      }
      return { data: rows.slice(0, MAX_TARGETS) };
    }
    return { rows: [] };
  }

  // ── POST /class/review ──────────────────────────────────────────────────────
  // Body: { ledgerIds:[...] } OR { studentId, scope:'all'|'day'|'session', date?, sessionId? },
  //       plus optional { comment, notify }.
  app.post('/class/review', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });

    const body = req.body || {};
    let comment = (typeof body.comment === 'string') ? body.comment.trim() : '';
    if (comment.length > COMMENT_MAX) comment = comment.slice(0, COMMENT_MAX);
    const notify = body.notify !== false; // default on; only fires when there's a comment

    const targetRes = await resolveTargets(body);
    if (targetRes && targetRes.error) {
      if (isReviewMissing(targetRes.error)) return notProvisioned(res);
      console.error('POST /class/review resolve error:', targetRes.error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    const targets = (targetRes.data || targetRes.rows || []).filter((row) => row && row.ledger_id && row.student_id);
    if (!targets.length) return res.status(400).json({ ok: false, error: 'no items to review' });

    const teacherUsername = await resolveTeacherUsername(req);
    const seenAtMs = Date.now();
    const seenAtIso = new Date(seenAtMs).toISOString();
    const nyDate = todayInTz(schoolTz, seenAtMs);

    // Candy: mint ONCE per student per review-day (idempotent). Track which students we've
    // already attempted this request so multiple items for one student don't each call award.
    const awardedByStudent = {};
    async function awardOnce(studentId) {
      if (studentId in awardedByStudent) return 0;
      try {
        const r = await db.reviewAward(studentId, nyDate);
        if (r && r.error) {
          if (isReviewMissing(r.error)) throw r.error; // surface as 503 upstream
          console.warn('reviewAward failed for', studentId, r.error);
          awardedByStudent[studentId] = 0;
          return 0;
        }
        const minted = Number(r && r.data) || 0;
        awardedByStudent[studentId] = minted;
        return minted;
      } catch (e) {
        if (isReviewMissing(e)) throw e;
        awardedByStudent[studentId] = 0;
        return 0;
      }
    }

    const marks = [];
    let candyAwarded = 0;
    try {
      for (const row of targets) {
        const minted = await awardOnce(row.student_id);
        candyAwarded += minted;
        const receipt = issueReviewReceipt({
          ledgerId: row.ledger_id,
          studentId: row.student_id,
          teacher: teacherUsername,
          seenAt: seenAtMs,
          comment: comment || undefined,
        });
        const up = await db.upsertReviewMark({
          ledgerId: row.ledger_id,
          studentId: row.student_id,
          teacherUsername,
          seenAt: seenAtIso,
          comment: comment || null,
          candyAwarded: minted,
          receiptId: receipt ? receipt.receiptId : null,
          receiptCompact: receipt ? receipt.compact : null,
        });
        if (up && up.error) {
          if (isReviewMissing(up.error)) return notProvisioned(res);
          console.error('POST /class/review upsert error:', up.error);
          return res.status(500).json({ ok: false, error: 'Database error' });
        }
        marks.push({ ledgerId: row.ledger_id, studentId: row.student_id, seenAt: seenAtIso, comment: comment || null, candyAwarded: minted });
      }
    } catch (e) {
      if (isReviewMissing(e)) return notProvisioned(res);
      console.error('POST /class/review error:', e);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    // Notify: one teacher→student message per distinct student, ONLY when a comment exists.
    let notified = 0;
    if (comment && notify && nudgesDb && typeof nudgesDb.insertNudges === 'function') {
      const distinctStudents = Array.from(new Set(targets.map((t) => t.student_id)));
      const text = comment.slice(0, NUDGE_MAX);
      for (const studentId of distinctStudents) {
        try {
          const sr = await db.findByStudentId(studentId);
          const recipient = sr && sr.data && sr.data.login_username;
          const sect = sr && sr.data ? sr.data.section : null;
          if (!recipient) continue;
          await nudgesDb.insertNudges({
            nudgeId: 'review-' + studentId + '-' + seenAtMs,
            senderUsername: teacherUsername,
            recipientUsernames: [recipient],
            text,
            section: sect,
            deliveredUsernames: [],
          });
          notified += 1;
        } catch (e) {
          console.warn('POST /class/review notify failed for', studentId, e && e.message);
        }
      }
    }

    return res.json({ ok: true, marked: marks.length, candyAwarded, notified, marks });
  });
}
