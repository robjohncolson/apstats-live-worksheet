// teacher-auth.js -- async teacher authorization helper (WI-2c).
//
// Implements the Section 1 security model:
//   A request is a teacher iff EITHER:
//   (A) the x-teacher-secret header equals EITHER the shared teacher key
//       (getTeacherKey(): env TEACHER_KEY, default 'apteacher2627') OR the
//       legacy long ROSTER_TEACHER_SECRET, while it is still configured and
//       is not just the published default key (see teacherSecretMatches), OR
//   (B) a roster token resolves via verifyToken() to a studentId whose
//       db.getRoleByStudentId() returns 'teacher'.
//
// Returns a boolean. Never writes to res. Callers send the 401.
// Degrades to false (non-teacher) on any ambiguity -- never grants on error.

import crypto from 'node:crypto';
import { verifyToken } from './token.js';

// The simple, shared teacher key. Teacher decision (2026-06-03): deprecate the
// long random ROSTER_TEACHER_SECRET in favor of one memorable key that BOTH
// elevates a self-signup account to role='teacher' AND works as the x-teacher-secret
// for every teacher-gated endpoint. Overridable via env; defaults to 'apteacher2627'.
// SECURITY NOTE (teacher-accepted): this key unlocks all student grades + the bulk
// endpoints (decrypted passwords). It is intentionally low-friction for onboarding a
// trusted colleague; rotate via TEACHER_KEY if it leaks.
// NOTE: keep this DISTINCT from the default student/enroll password — if they match,
// anyone who knows the handed-out password also holds the teacher key. (This repo is
// public, so for real secrecy set TEACHER_KEY as a Railway env var, not this default.)
export function getTeacherKey() {
  return process.env.TEACHER_KEY || 'apteacher2627';
}

function isPublishedTeacherKey(value) {
  return typeof value === 'string' && value.trim() === 'apteacher2627';
}

// teacherSecretMatches(req) -> boolean
//
// Path (A) of requireTeacher on its own, for routes that check the header
// themselves (GET /ledger/student/:studentId). The x-teacher-secret header
// must equal EITHER:
//   - the shared teacher key (getTeacherKey(), default 'apteacher2627'), OR
//   - the legacy long ROSTER_TEACHER_SECRET, while it is still configured.
//     A configured value that is just the published default key is ignored.
// Synchronous: no DB, never writes to res.
export function teacherSecretMatches(req) {
  const provided = req.headers['x-teacher-secret'];
  if (!provided) return false;
  if (provided === getTeacherKey()) return true;

  const legacySecret = process.env.ROSTER_TEACHER_SECRET;
  if (!legacySecret) return false;
  if (isPublishedTeacherKey(legacySecret)) return false;
  return provided === legacySecret;
}

// Extract a bearer token from Authorization: Bearer <t> or ?token=<t>.
// Mirrors the pattern in ledger.js GET /ledger/student/:studentId exactly.
function extractToken(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (typeof authHeader === 'string' && /^Bearer\s+/i.test(authHeader)) {
    const t = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (t) return t;
  }
  if (req.query && typeof req.query.token === 'string' && req.query.token) {
    return req.query.token;
  }
  return null;
}

// requireTeacher(req, db) -> Promise<boolean>
//
// Path (A): teacherSecretMatches(req) -- the shared teacher key or the legacy
//           long secret in x-teacher-secret -> true.
// Path (B): valid token -> studentId -> role === 'teacher' -> true.
// Anything else (no match, bad token, DB error, missing role) -> false.
export async function requireTeacher(req, db) {
  // Path (A): x-teacher-secret. The shared key is the deprecation path for the
  // long secret; both are accepted (see teacherSecretMatches).
  if (teacherSecretMatches(req)) return true;

  // Path (B): roster token resolved to a teacher role.
  const token = extractToken(req);
  if (!token) return false;

  let studentId = null;
  try {
    studentId = verifyToken(token);
  } catch (_) {
    return false;
  }
  if (!studentId) return false;

  // Role lookup degrades to 'student' on any error (pre-migration safety).
  let role = 'student';
  try {
    role = await db.getRoleByStudentId(studentId);
  } catch (_) {
    return false;
  }
  return role === 'teacher';
}

function configuredPayoutSecret(name) {
  const value = process.env[name];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function configuredPayoutTeacherKey() {
  const teacherKey = configuredPayoutSecret('TEACHER_KEY');
  if (isPublishedTeacherKey(teacherKey)) return null;
  return teacherKey;
}

// Hash both operands to a fixed length before timingSafeEqual. Besides avoiding
// its unequal-length exception, this keeps comparison time independent of the
// configured secret length.
function payoutSecretMatches(provided, expected) {
  if (typeof provided !== 'string' || !expected) return false;
  const providedDigest = crypto.createHash('sha256').update(provided, 'utf8').digest();
  const expectedDigest = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(providedDigest, expectedDigest);
}

async function payoutTeacherFromBearer(req, db) {
  const authorization = req.headers.authorization || req.headers.Authorization;
  if (typeof authorization !== 'string' || !/^Bearer\s+/i.test(authorization)) return false;

  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;

  let studentId;
  try {
    studentId = verifyToken(token);
  } catch (_) {
    return false;
  }
  if (!studentId) return false;

  try {
    const rosterResult = await db.findByStudentId(studentId);
    if (!rosterResult || rosterResult.error || !rosterResult.data) return false;

    const teacher = rosterResult.data;
    return teacher.role === 'teacher' && teacher.status === 'active';
  } catch (_) {
    return false;
  }
}

// Payout sealing reserves live wallet funds, so every payout teacher route is
// fail-closed. Requiring TEACHER_KEY also disables getTeacherKey()'s repository
// fallback on the older wallet-management routes, so an attacker cannot change
// payout addresses through those routes before a teacher seals a batch.
export async function requirePayoutTeacher(req, db) {
  const teacherKey = configuredPayoutTeacherKey();
  if (!teacherKey) return false;

  const provided = req.headers['x-teacher-secret'];
  if (payoutSecretMatches(provided, teacherKey)) return true;
  return payoutTeacherFromBearer(req, db);
}

// A dedicated payout-agent key is scoped to /payout only. Teachers retain the
// manual recovery path through the same fail-closed payout teacher policy. The
// explicit TEACHER_KEY prerequisite applies to agent-only routes as well.
export async function requirePayoutAgent(req, db) {
  if (!configuredPayoutTeacherKey()) return false;
  if (await requirePayoutTeacher(req, db)) return true;

  const expected = configuredPayoutSecret('PAYOUT_AGENT_KEY');
  return payoutSecretMatches(req.headers['x-payout-agent-key'], expected);
}
