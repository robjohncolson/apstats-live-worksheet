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
import { readFile } from 'fs/promises';
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

    // Hash password with bcrypt cost 12
    let passwordHash;
    try {
      passwordHash = await bcrypt.hash(password, 12);
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Failed to hash password' });
    }

    // Retry loop: generate username, attempt insert, retry on unique collision (up to 8×)
    const MAX_ATTEMPTS = 8;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const loginUsername = generateUsername(attempt);

      const { data, error } = await db.insertRoster({
        realName,
        section,
        loginUsername,
        passwordHash,
        email
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
      section: data.section
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
// Reads WORK_MANIFEST_PATH env or defaults to the repo's data/work-manifest.json.
// Parses and returns the manifest object. Throws on missing/unparseable file.
async function loadLiveManifest() {
  const defaultPath = resolve(__dirname, '..', 'data', 'work-manifest.json');
  const manifestPath = process.env.WORK_MANIFEST_PATH || defaultPath;
  const raw = await readFile(manifestPath, 'utf8');
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
