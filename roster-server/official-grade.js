// official-grade.js -- the official quarter grade (OFFICIAL_GRADE_SYNC_SPEC.md §4.3).
//
//   POST /class/official-grades   teacher: nightly write from tools/schoology_official.py
//   GET  /official-grade          a student's own official grade (token); a teacher may
//                                 pass ?studentId= (view-as)
//
// The official grade is the number written into Schoology's marking-period override.
// It is a published value: the grade engine never reads it, and nothing here changes
// any computed grade. A missing table -> 503 until migration 0038 is run.

import { requireTeacher } from './teacher-auth.js';
import { verifyToken } from './token.js';
import { quarterOfDate } from './grade-config.js';
import { todayInTz } from './lesson-grade.js';

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
const MAX_GRADES_PER_POST = 200;
// Only these parts are stored; they explain the number on the Desk.
const PART_KEYS = ['work', 'pc', 'base', 'line', 'earlyBonus', 'bankedBonus', 'rule'];
const NOT_PROVISIONED = 'official_grade not provisioned -- run migration 0038';
// Postgres 42P01 undefined_table, or PostgREST PGRST205 (table not in the schema cache).
function tableMissing(error) {
  return !!error && ['42P01', 'PGRST205'].includes(String(error.code || ''));
}

function bearerOrQueryToken(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (typeof authHeader === 'string' && /^Bearer\s+/i.test(authHeader)) {
    const t = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (t) return t;
  }
  if (req.query && typeof req.query.token === 'string' && req.query.token) return req.query.token;
  return null;
}

function cleanParts(parts) {
  const out = {};
  if (!parts || typeof parts !== 'object') return out;
  for (const key of PART_KEYS) {
    const v = parts[key];
    if (v === null || typeof v === 'number' || (typeof v === 'string' && v.length <= 40)) out[key] = v;
  }
  return out;
}

// validateGrades(body) -> { quarter, asOf, rows } or { error }
export function validateGrades(body) {
  const quarter = body && body.quarter;
  if (!QUARTERS.includes(quarter)) return { error: 'quarter must be Q1..Q4' };
  const asOf = body.asOf;
  if (typeof asOf !== 'string' || !Number.isFinite(Date.parse(asOf))) return { error: 'asOf must be a date' };
  const grades = body.grades;
  if (!Array.isArray(grades) || grades.length === 0) return { error: 'grades must be a non-empty array' };
  if (grades.length > MAX_GRADES_PER_POST) return { error: 'too many grades' };
  const rows = [];
  for (const g of grades) {
    const studentId = g && typeof g.studentId === 'string' ? g.studentId.trim() : '';
    const grade = g ? Number(g.official) : NaN;
    if (!studentId) return { error: 'every grade needs a studentId' };
    if (!Number.isFinite(grade) || grade < 0 || grade > 100) return { error: 'official must be 0..100 for ' + studentId };
    rows.push({ studentId, quarter, grade: Math.round(grade * 10) / 10, parts: cleanParts(g), asOf: new Date(asOf).toISOString() });
  }
  return { quarter, asOf, rows };
}

function currentQuarter() {
  return quarterOfDate(todayInTz('America/New_York')) || 'Q1';
}

export function mountOfficialGrade(app, { db, officialGradeDb }) {
  if (!officialGradeDb) return;

  // POST /class/official-grades { quarter, asOf, grades:[{studentId, official, work, pc, ...}] }
  app.post('/class/official-grades', async (req, res) => {
    if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });
    const checked = validateGrades(req.body || {});
    if (checked.error) return res.status(400).json({ ok: false, error: checked.error });
    try {
      const { data, error } = await officialGradeDb.upsertGrades(checked.rows);
      if (error) {
        if (tableMissing(error)) return res.status(503).json({ ok: false, error: NOT_PROVISIONED });
        console.error('POST /class/official-grades error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      return res.json({ ok: true, quarter: checked.quarter, saved: Array.isArray(data) ? data.length : checked.rows.length });
    } catch (err) {
      console.error('POST /class/official-grades throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
  });

  // GET /official-grade[?quarter=Q1][&studentId=<id> (teacher only)]
  app.get('/official-grade', async (req, res) => {
    const asked = typeof req.query.studentId === 'string' ? req.query.studentId.trim() : '';
    let studentId = null;
    const token = bearerOrQueryToken(req);
    let ownId = null;
    try { ownId = token ? verifyToken(token) : null; } catch (_) { ownId = null; }
    if (asked && asked !== ownId) {
      if (!await requireTeacher(req, db)) return res.status(401).json({ ok: false, error: 'forbidden' });
      studentId = asked;
    } else {
      studentId = ownId;
    }
    if (!studentId) return res.status(401).json({ ok: false, error: 'unauthorized' });

    const quarter = QUARTERS.includes(req.query.quarter) ? req.query.quarter : currentQuarter();
    try {
      const { data, error } = await officialGradeDb.getForStudent(studentId, quarter);
      if (error) {
        if (tableMissing(error)) return res.status(503).json({ ok: false, error: NOT_PROVISIONED });
        console.error('GET /official-grade error:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
      }
      const official = data
        ? { quarter: data.quarter, grade: Number(data.grade), asOf: data.as_of, parts: data.parts || {} }
        : null;
      return res.json({ ok: true, quarter, official });
    } catch (err) {
      console.error('GET /official-grade throw:', err);
      return res.status(500).json({ ok: false, error: 'Database error' });
    }
  });
}
