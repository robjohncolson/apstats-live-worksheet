// server.js — AP Stats Gradebook Phase 0 roster auth service
// Implements FROZEN CONTRACT 2 exactly.
// ES module, Express, injectable db for testing.

import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { createLiveDb } from './db.js';
import { createLiveLedgerDb } from './ledger-db.js';
import { createLiveRemediationDb } from './remediation-db.js';
import { signToken, verifyToken } from './token.js';
import { generateUsername } from './username.js';
import { mountLedger } from './ledger.js';
import { mountDonow } from './donow.js';
import { mountRollup } from './rollup.js';
import { mountGrade } from './grade.js';
import { mountMastery } from './mastery.js';
import { mountClass } from './class.js';
import { mountRemediation } from './remediation.js';
import { PHASE3_CONFIG } from './grade-config.js';
import { encryptPassword, decryptPassword } from './crypto.js';
import { requireTeacher } from './teacher-auth.js';
import { readFile } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── App factory (accepts injected db for tests) ───────────────────────────────
// ledgerDb is optional; defaults to createLiveLedgerDb() in production.
// Tests pass a fake ledgerDb alongside the fake db.
// loadManifest is optional; defaults to reading WORK_MANIFEST_PATH (or repo default).
// Tests inject a fake loadManifest that returns a fixture manifest directly.

export function createApp(db, ledgerDb, loadManifest, loadAnswerKey, loadSkillMap, bkt, remediationDb, lessonSchedule, configOverrides) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // ── GET /health ─────────────────────────────────────────────────────────────
  // FROZEN CONTRACT 2: → 200 { ok:true, service:"roster", time:"<iso>" }
  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'roster', time: new Date().toISOString() });
  });

  // ── POST /roster/enroll (teacher-gated) ─────────────────────────────────────
  // FROZEN CONTRACT 2:
  //   Headers: x-teacher-secret required; 401 {ok:false,error:"forbidden"} if missing/wrong.
  //   Body: { realName, section, password, email? }
  //   Behavior: generate unique login_username (fruit_animal), bcryptjs.hash(password,12),
  //     insert into roster. On login_username collision (DB unique violation) regenerate up to 8×.
  //   → 200 { ok:true, studentId, username, realName, section }
  //   → 400 missing field · → 401 bad teacher secret · → 500 on failure
  app.post('/roster/enroll', async (req, res) => {
    // Teacher auth check (WI-2d: secret OR verified teacher token).
    if (!await requireTeacher(req, db)) {
      return res.status(401).json({ ok: false, error: 'forbidden' });
    }

    const { realName, section, password, email } = req.body || {};

    if (!realName || !section || !password) {
      return res.status(400).json({ ok: false, error: 'realName, section, and password are required' });
    }

    // Hash password with bcrypt cost 12 (sole auth path — unchanged).
    let passwordHash;
    try {
      passwordHash = await bcrypt.hash(password, 12);
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Failed to hash password' });
    }

    // TR1 additive: reversible copy for teacher login-recovery (best-effort —
    // null if ROSTER_PW_ENC_KEY is unset; enroll must still succeed).
    const passwordCipher = encryptPassword(password);

    // Retry loop: generate username, attempt insert, retry on unique collision (up to 8×)
    const MAX_ATTEMPTS = 8;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const loginUsername = generateUsername(attempt);

      const { data, error } = await db.insertRoster({
        realName,
        section,
        loginUsername,
        passwordHash,
        email,
        passwordCipher
      });

      if (!error) {
        return res.json({
          ok: true,
          studentId: data.student_id,
          username: data.login_username,
          realName: data.real_name,
          section: data.section
        });
      }

      // DB unique violation on login_username → retry with a new name
      const isUniqueViolation =
        error.code === '23505' ||
        (error.message && error.message.includes('unique'));

      if (!isUniqueViolation) {
        console.error('Enroll DB error:', error);
        return res.status(500).json({ ok: false, error: 'Database error during enrollment' });
      }

      // Otherwise loop and try again with a new username
    }

    return res.status(500).json({ ok: false, error: 'Could not generate a unique username after maximum retries' });
  });

  // ── POST /roster/verify ──────────────────────────────────────────────────────
  // FROZEN CONTRACT 2:
  //   Body: { username, password }
  //   Behavior: look up by login_username (case-insensitive), bcryptjs.compare.
  //     On success mint a session token (D-C).
  //   → 200 { ok:true, studentId, token, realName, section }
  //   → 401 { ok:false, error:"Invalid username or password" } (same for unknown user AND bad password)
  //   → 400 missing field
  app.post('/roster/verify', async (req, res) => {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'username and password are required' });
    }

    const INVALID_MSG = 'Invalid username or password';

    const { data, error } = await db.findByUsername(username);

    // Unknown user — same generic message (no user enumeration)
    if (error || !data) {
      return res.status(401).json({ ok: false, error: INVALID_MSG });
    }

    // Bcrypt compare — never plaintext
    const passwordMatch = await bcrypt.compare(password, data.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ ok: false, error: INVALID_MSG });
    }

    let token;
    try {
      token = signToken(data.student_id);
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Failed to issue token' });
    }

    // WI-2b: look up role defensively -- degrades to 'student' on any error.
    // Sign-in never depends on this; a failure here must not break sign-in.
    let role = 'student';
    try {
      role = await db.getRoleByStudentId(data.student_id);
    } catch (_) {
      role = 'student';
    }

    return res.json({
      ok: true,
      studentId: data.student_id,
      token,
      realName: data.real_name,
      section: data.section,
      mustChangePassword: !!data.must_change_password,
      role
    });
  });

  // ── POST /roster/resolve (Phase-1 helper, contract fixed now) ────────────────
  // FROZEN CONTRACT 2:
  //   Body: { token }
  //   → 200 { ok:true, studentId } if signature valid and not expired
  //   → 401 otherwise
  app.post('/roster/resolve', (req, res) => {
    const { token } = req.body || {};

    if (!token) {
      return res.status(401).json({ ok: false, error: 'Token required' });
    }

    const studentId = verifyToken(token);
    if (!studentId) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
    }

    return res.json({ ok: true, studentId });
  });

  // ── POST /roster/change-password (TR1 — token-gated) ─────────────────────────
  // Body: { token, newPassword }. Student changes their own password.
  //   → 401 {ok:false,error:"invalid token"} (missing/invalid/expired token)
  //   → 400 {ok:false,error:"newPassword must be at least 6 characters"}
  //   → 500 {ok:false,error:"Database error"}
  //   → 200 {ok:true}  (re-hashes, re-encrypts, clears must_change_password)
  app.post('/roster/change-password', async (req, res) => {
    const { token, newPassword } = req.body || {};

    if (!token) {
      return res.status(401).json({ ok: false, error: 'invalid token' });
    }

    const studentId = verifyToken(token);
    if (!studentId) {
      return res.status(401).json({ ok: false, error: 'invalid token' });
    }

    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ ok: false, error: 'newPassword must be at least 6 characters' });
    }

    let passwordHash;
    try {
      passwordHash = await bcrypt.hash(String(newPassword), 12);
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Failed to hash password' });
    }

    const passwordCipher = encryptPassword(String(newPassword));

    const { error } = await db.updatePassword({ studentId, passwordHash, passwordCipher });

    if (error) {
      console.error('change-password DB error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    return res.json({ ok: true });
  });

  // ── GET /roster/list (TR1 — teacher-gated) ───────────────────────────────────
  // Header: x-teacher-secret == process.env.ROSTER_TEACHER_SECRET; 401 otherwise.
  // Query: ?section= (optional filter).
  //   → 200 { ok:true, students:[{ realName, username, section, currentPassword,
  //           mustChangePassword, createdAt }] }
  // currentPassword is the decrypted current password (teacher login-recovery),
  // or null when the cipher is absent / undecryptable / ROSTER_PW_ENC_KEY unset.
  app.get('/roster/list', async (req, res) => {
    // Teacher auth check (WI-2d: secret OR verified teacher token).
    if (!await requireTeacher(req, db)) {
      return res.status(401).json({ ok: false, error: 'forbidden' });
    }

    const section = req.query.section || null;

    const { data, error } = await db.listRoster(section);

    if (error) {
      console.error('roster list DB error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }

    const students = (data || []).map(row => ({
      realName:           row.real_name,
      username:           row.login_username,
      section:            row.section,
      currentPassword:    decryptPassword(row.password_cipher),
      mustChangePassword: !!row.must_change_password,
      createdAt:          row.created_at
    }));

    return res.json({ ok: true, students });
  });

  // ── GET /roster/section/:section — PUBLIC student picker (2026-05-20) ────────
  // Returns { username, realName, section } for one period. NO password
  // info, NO email. Powers the Desk's sign-in dropdown so students who
  // remember their real name (but not their generated username) can
  // find themselves. Privacy posture: usernames + real names are not
  // secret — students see their classmates in the classroom. No
  // password hashes or recoverable ciphers are exposed.
  app.get('/roster/section/:section', async (req, res) => {
    const section = req.params.section;
    if (!section || typeof section !== 'string') {
      return res.status(400).json({ ok: false, error: 'section parameter required' });
    }
    const { data, error } = await db.listRoster(section);
    if (error) {
      console.error('roster public section DB error:', error);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
    const students = (data || []).map(row => ({
      username: row.login_username,
      realName: row.real_name,
      section:  row.section,
    }));
    // Send a soft cache hint — the roster doesn't change often.
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.json({ ok: true, section, students });
  });

  // ── Ledger routes (Sprint 1 additive) ────────────────────────────────────────
  // Mounts POST /ledger/record and GET /ledger/student/:studentId.
  // ledgerDb must be passed in (tests inject a fake; production passes createLiveLedgerDb()).
  if (ledgerDb) {
    mountLedger(app, { db: ledgerDb, verifyToken });
  }

  // ── Do Now routes (Sprint DN1 additive) ──────────────────────────────────────
  // Mounts GET /donow.
  // ledgerDb and loadManifest must be passed in.
  // Tests inject fakes; production uses live ledger + file-based manifest loader.
  if (ledgerDb && loadManifest) {
    mountDonow(app, { verifyToken, ledgerDb, loadManifest });
  }

  // ── Rollup route (Phase 2b additive) ─────────────────────────────────────────
  // Mounts GET /rollup (cr-quiz feeder per-unit correctness rollup).
  // ledgerDb + loadAnswerKey injected; tests pass fakes.
  if (ledgerDb && loadAnswerKey) {
    mountRollup(app, { verifyToken, ledgerDb, loadAnswerKey });
  }

  // ── Grade route (Phase 3+6 additive) ─────────────────────────────────────────
  // Mounts GET /grade (cumulative + capped-booster grade of record).
  // Read-only; reuses the Phase-2 cr-quiz aggregation. Same injection as rollup.
  // Phase 6: lessonSchedule is passed in for date-driven lesson-weighted quarter
  // grade. If null/missing, /grade degrades gracefully to the old unit-mean logic.
  if (ledgerDb && loadAnswerKey) {
    // 2026-05-20 hotfix: thread configOverrides so tests can disable the
    // gradingWindowStart filter (whose default cutoff is in the future for
    // real-clock tests). Production server doesn't pass overrides → uses
    // PHASE3_CONFIG as-is.
    const gradeConfig = configOverrides
      ? { ...PHASE3_CONFIG, ...configOverrides }
      : PHASE3_CONFIG;
    mountGrade(app, { verifyToken, ledgerDb, loadAnswerKey, lessonSchedule: lessonSchedule || null, db, config: gradeConfig });
  }

  // ── Mastery route (Phase 3 additive — decoupled diagnostic) ──────────────────
  // Mounts GET /mastery (BKT over skill-map tags; weak-skill flag at θ).
  // Needs the bundled skill-map loader + the AS-IS bkt engine; tests inject fakes.
  if (ledgerDb && loadAnswerKey && loadSkillMap && bkt) {
    mountMastery(app, { verifyToken, ledgerDb, loadAnswerKey, loadSkillMap, bkt });
  }

  // ── Class routes (Phase 4a additive — teacher-gated class aggregation) ──────
  // Mounts GET /class/grades (always, when grade deps present) and
  // GET /class/mastery (only when diagnostic deps present too — same guard as
  // /mastery). Auth = x-teacher-secret (mirrors /roster/list); reuses pure
  // computeGrade / computeMastery so the math has a single source.
  if (db && ledgerDb && loadAnswerKey) {
    const classConfig = configOverrides
      ? { ...PHASE3_CONFIG, ...configOverrides }
      : PHASE3_CONFIG;
    mountClass(app, { db, ledgerDb, loadAnswerKey, loadSkillMap, bkt, lessonSchedule: lessonSchedule || null, config: classConfig });
  }

  // ── Remediation routes (Phase 4b additive — write loop + retake gate) ──────
  // Needs remediationDb (data-access wrapper for the new remediation_assignment
  // table). Until migrations/0004 is run on Supabase, the DB returns 42P01 and
  // routes respond 503 "remediation table not yet provisioned" — service stays
  // up. propose-from-mastery additionally needs the mastery dep set; that
  // single route guard lives inside mountRemediation. See GRADEBOOK_PHASE4B_BUILD.md.
  if (remediationDb && db) {
    mountRemediation(app, {
      verifyToken,
      remediationDb,
      db,
      ledgerDb,
      loadAnswerKey,
      loadSkillMap,
      bkt,
    });
  }

  return app;
}

// ── Entrypoint (production only) ─────────────────────────────────────────────

// ── Live manifest loader (production only) ────────────────────────────────────
// Resolves the work-manifest path in priority order, then parses it.
// Throws on a missing/unparseable file.
//
//   1. WORK_MANIFEST_PATH env — explicit override always wins.
//   2. Bundled copy inside roster-server (./data/work-manifest.json) — this is
//      the ONLY copy present in the Railway container, because Railway deploys
//      with Root Directory = roster-server, so the repo-root data/ dir is NOT
//      shipped. scripts/build-work-manifest.mjs writes this copy byte-identical.
//   3. Repo-root ../data/work-manifest.json — local dev / running from a full
//      checkout where the bundled copy was not regenerated.
function resolveManifestPath() {
  if (process.env.WORK_MANIFEST_PATH) {
    return process.env.WORK_MANIFEST_PATH;
  }

  const bundledPath = resolve(__dirname, 'data', 'work-manifest.json');
  if (existsSync(bundledPath)) {
    return bundledPath;
  }

  return resolve(__dirname, '..', 'data', 'work-manifest.json');
}

async function loadLiveManifest() {
  const raw = await readFile(resolveManifestPath(), 'utf8');
  return JSON.parse(raw);
}

// ── Live answer-key loader (production only) ──────────────────────────────────
// Same priority + bundled-copy rationale as the manifest loader.
// scripts/build-answer-key.mjs writes ./data/answer-key.json byte-identical.
function resolveAnswerKeyPath() {
  if (process.env.ANSWER_KEY_PATH) {
    return process.env.ANSWER_KEY_PATH;
  }
  const bundledPath = resolve(__dirname, 'data', 'answer-key.json');
  if (existsSync(bundledPath)) {
    return bundledPath;
  }
  return resolve(__dirname, '..', 'data', 'answer-key.json');
}

async function loadLiveAnswerKey() {
  const raw = await readFile(resolveAnswerKeyPath(), 'utf8');
  return JSON.parse(raw);
}

// ── Live skill-map loader (production only) ──────────────────────────────────
// Same priority + bundled-copy rationale as the answer-key loader.
// scripts/build-skill-map.mjs writes ./data/skill-map.json byte-identical.
function resolveSkillMapPath() {
  if (process.env.SKILL_MAP_PATH) {
    return process.env.SKILL_MAP_PATH;
  }
  const bundledPath = resolve(__dirname, 'data', 'skill-map.json');
  if (existsSync(bundledPath)) {
    return bundledPath;
  }
  return resolve(__dirname, '..', 'data', 'skill-map.json');
}

async function loadLiveSkillMap() {
  const raw = await readFile(resolveSkillMapPath(), 'utf8');
  return JSON.parse(raw);
}

// ── Live BKT engine (production only) ─────────────────────────────────────────
// The study-guide engine reused AS-IS via the byte-identical bundled copy
// (roster-server/bkt.js — guarded by tests/bundle-parity.test.js). lib/bkt.js
// is a UMD module; roster-server is "type":"module" so its CommonJS branch is
// skipped — we import it for its `globalThis.BKT` side-effect exactly as the
// study guide / lib/bkt.test.js do (reuse AS-IS, NOT a fork).
async function loadLiveBkt() {
  await import('./bkt.js');
  return globalThis.BKT;
}

// ── Live lesson-schedule loader (Phase 6) ────────────────────────────────────
// Mirrors the manifest/answer-key loader pattern. Returns the .lessons map from
// lesson-schedule.json, or null on any failure (fault-tolerant degrade).
//
// Priority:
//   1. LESSON_SCHEDULE_PATH env — explicit override.
//   2. Bundled copy ./data/lesson-schedule.json (Railway container).
//   3. Repo-root ../data/lesson-schedule.json (local dev full checkout).
function resolveLessonSchedulePath() {
  if (process.env.LESSON_SCHEDULE_PATH) {
    return process.env.LESSON_SCHEDULE_PATH;
  }
  const bundledPath = resolve(__dirname, 'data', 'lesson-schedule.json');
  if (existsSync(bundledPath)) {
    return bundledPath;
  }
  return resolve(__dirname, '..', 'data', 'lesson-schedule.json');
}

function loadLiveLessonSchedule() {
  try {
    const raw = readFileSync(resolveLessonSchedulePath(), 'utf8');
    const doc = JSON.parse(raw);
    if (!doc || typeof doc !== 'object' || !doc.lessons || typeof doc.lessons !== 'object') {
      console.warn('[phase6] lesson schedule malformed — date filter disabled');
      return null;
    }
    return doc.lessons;
  } catch (err) {
    console.warn('[phase6] lesson schedule unavailable; date filter disabled:', err.message);
    return null;
  }
}

// Only start listening when run directly (not imported by tests)
if (process.env.NODE_ENV !== 'test') {
  (async () => {
    const db = createLiveDb();
    const ledgerDb = createLiveLedgerDb();
    // Phase 3 is ADDITIVE: the diagnostic engine must never take down the
    // LIVE auth service. If bkt.js is missing/corrupt, log and continue —
    // createApp's guard then simply does not mount /mastery (everything else,
    // incl. /health /roster/* /donow /rollup /grade, stays up). (Codex BLOCKER.)
    let bkt = null;
    try {
      bkt = await loadLiveBkt();
    } catch (err) {
      console.error('roster-server: BKT engine failed to load — /mastery disabled, service continues:', err);
    }
    // Phase 4b: same fault-tolerant ethos. If remediation-db can't construct
    // (e.g. transient env issue), the remediation routes simply don't mount —
    // the rest of the service stays up. The table not being migrated yet is
    // NOT a construction failure (Supabase client is happy); table-missing
    // is signalled per-query as 42P01 → 503 by the route module.
    let remediationDb = null;
    try {
      remediationDb = createLiveRemediationDb();
    } catch (err) {
      console.error('roster-server: remediation-db failed to construct — /remediation/* disabled, service continues:', err);
    }
    // Phase 6: lesson schedule — synchronous load at boot; fault-tolerant (null
    // = date filter disabled, /grade still works). Same pattern as remediation-db.
    const lessonSchedule = loadLiveLessonSchedule();
    const app = createApp(
      db,
      ledgerDb,
      loadLiveManifest,
      loadLiveAnswerKey,
      loadLiveSkillMap,
      bkt,
      remediationDb,
      lessonSchedule
    );
    const PORT = process.env.PORT || 8090;
    app.listen(PORT, () => {
      console.log(`roster-server listening on port ${PORT}`);
    });
  })();
}
