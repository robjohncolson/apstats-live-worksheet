// official-grade-db.js -- Supabase DAL for official_grade (OFFICIAL_GRADE_SYNC_SPEC.md §4.3).
// Pure CRUD; no business rules.

import { createClient } from '@supabase/supabase-js';

export function createOfficialGradeDb(client) {
  return {
    upsertGrades,      // teacher nightly write -- one row per (student, quarter)
    getForStudent,     // the Desk read
  };

  // upsertGrades(rows: [{ studentId, quarter, grade, parts, asOf }]) -> { data, error }
  async function upsertGrades(rows) {
    var now = new Date().toISOString();
    var records = rows.map(function (r) {
      return {
        student_id: r.studentId,
        quarter: r.quarter,
        grade: r.grade,
        parts: r.parts || {},
        as_of: r.asOf,
        updated_at: now,
      };
    });
    return client
      .from('official_grade')
      .upsert(records, { onConflict: 'student_id,quarter' })
      .select('student_id');
  }

  // getForStudent(studentId, quarter) -> { data: row|null, error }
  async function getForStudent(studentId, quarter) {
    return client
      .from('official_grade')
      .select('*')
      .eq('student_id', studentId)
      .eq('quarter', quarter)
      .maybeSingle();
  }
}

export function createLiveOfficialGradeDb() {
  var url = process.env.ROSTER_SUPABASE_URL;
  var key = process.env.ROSTER_SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createOfficialGradeDb(createClient(url, key));
}
