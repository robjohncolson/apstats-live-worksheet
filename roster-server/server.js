// server.js — AP Stats Gradebook Phase 0 roster auth service
// Implements FROZEN CONTRACT 2 exactly.
// ES module, Express, injectable db for testing.

import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { createLiveDb } from './db.js';
import { createLiveLedgerDb } from './ledger-db.js';
import { signToken, verifyToken } from './token.js';
import { generateUsername } from './username.js';
import { mountLedger } from './ledger.js';
import { mountDonow } from './donow.js';
import { encryptPassword, decryptPassword } from './crypto.js';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── App factory (accepts injected db for tests) ───────────────────────────────
// ledgerDb is optional; defaults to createLiveLedgerDb() in production.
// Tests pass a fake ledgerDb alongside the fake db.
// loadManifest is optional; defaults to reading WORK_MANIFEST_PATH (or repo default).
// Tests inject a fake loadManifest that returns a fixture manifest directly.

export function createApp(db, ledgerDb, loadManifest) {
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
    // Teacher auth check
    const teacherSecret = process.env.ROSTER_TEACHER_SECRET;
    const provided = req.headers['x-teacher-secret'];
    if (!teacherSecret || provided !== teacherSecret) {
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

    return res.json({
      ok: true,
      studentId: data.student_id,
      token,
      realName: data.real_name,
      section: data.section,
      mustChangePassword: !!data.must_change_password
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
    const teacherSecret = process.env.ROSTER_TEACHER_SECRET;
    const provided = req.headers['x-teacher-secret'];

    if (!teacherSecret || provided !== teacherSecret) {
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

// Only start listening when run directly (not imported by tests)
if (process.env.NODE_ENV !== 'test') {
  const db = createLiveDb();
  const ledgerDb = createLiveLedgerDb();
  const app = createApp(db, ledgerDb, loadLiveManifest);
  const PORT = process.env.PORT || 8090;
  app.listen(PORT, () => {
    console.log(`roster-server listening on port ${PORT}`);
  });
}
