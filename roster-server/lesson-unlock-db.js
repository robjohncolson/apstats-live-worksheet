// lesson-unlock-db.js -- Supabase DAL for lesson_unlock (Phase 5 of
// TEACHER_STUDENT_CONSOLE_SPEC.md). Pure CRUD; no business rules.

import { createClient } from '@supabase/supabase-js';

export function createLessonUnlockDb(client) {
  return {
    upsertUnlock,                // teacher overrides -- INSERT ON CONFLICT (student,lesson) UPDATE
    listActiveForStudent,        // student-side: their active unlocks
  };

  // upsertUnlock({ studentUsername, lessonKey, unlockedBy, reason })
  // -> { data: row|null, error }
  async function upsertUnlock({ studentUsername, lessonKey, unlockedBy, reason }) {
    var row = {
      student_username: studentUsername,
      lesson_key: lessonKey,
      unlocked_by: unlockedBy,
      reason: reason || null,
      status: 'active',
      unlocked_at: new Date().toISOString(),
    };
    return client
      .from('lesson_unlock')
      .upsert([row], { onConflict: 'student_username,lesson_key' })
      .select('*')
      .single();
  }

  // listActiveForStudent(studentUsername) -> { data: [row, ...], error }
  // Returns ONLY active (not revoked) unlocks.
  async function listActiveForStudent(studentUsername) {
    return client
      .from('lesson_unlock')
      .select('*')
      .eq('student_username', studentUsername)
      .eq('status', 'active');
  }
}

export function createLiveLessonUnlockDb() {
  var url = process.env.ROSTER_SUPABASE_URL;
  var key = process.env.ROSTER_SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  var client = createClient(url, key);
  return createLessonUnlockDb(client);
}
