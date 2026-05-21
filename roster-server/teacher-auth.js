// teacher-auth.js -- async teacher authorization helper (WI-2c).
//
// Implements the Section 1 security model:
//   A request is a teacher iff EITHER:
//   (A) x-teacher-secret header === ROSTER_TEACHER_SECRET, OR
//   (B) a roster token resolves via verifyToken() to a studentId whose
//       db.getRoleByStudentId() returns 'teacher'.
//
// Returns a boolean. Never writes to res. Callers send the 401.
// Degrades to false (non-teacher) on any ambiguity -- never grants on error.

import { verifyToken } from './token.js';

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
// Path (A): x-teacher-secret matches ROSTER_TEACHER_SECRET -> true.
// Path (B): valid token -> studentId -> role === 'teacher' -> true.
// Anything else (no match, bad token, DB error, missing role) -> false.
export async function requireTeacher(req, db) {
  // Path (A): break-glass secret (unchanged behavior).
  const teacherSecret = process.env.ROSTER_TEACHER_SECRET;
  const provided = req.headers['x-teacher-secret'];
  if (teacherSecret && provided === teacherSecret) return true;

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
