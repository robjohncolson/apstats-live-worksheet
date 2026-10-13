// ced-titles.js — CED-2026 display titles for roster-server responses
// (CED2026_SINGLE_SOURCE_SPEC.md §2). Server-only: NOT part of grade-engine.bundle.js.
//
// Old lesson keys stay the storage ids (column `key` FA:3.1, lessonKey 3.1); every printed
// title goes through lib/ced-label (vendored copy of follow-alongs/lib/ced-label.js, synced
// by scripts/sync-ced-crosswalk.mjs). Titles are display-only: nothing keys on them.
import { cedColumnTitle, retitleGradebook } from './lib/ced-label.mjs';
import { SCHOOLOGY_TITLES_CED } from './grade-config.js';

// buildGradebook() result → same object, columns carry CED `title` + `schoologyTitle`.
export function cedRetitleGradebook(gradebook) {
  return retitleGradebook(gradebook, { schoologyTitlesCed: SCHOOLOGY_TITLES_CED });
}

// Class-snapshot assignment title. Worksheet/Blooket tracks are one column per worksheet
// group (`${unit}.${worksheetKey}`, like gradebook-grid); quizzes are per lesson.
const TRACK_KIND = { worksheet: 'followalong', quiz: 'quiz', blooket: 'blooket' };
export function cedAssignmentTitle(lesson, track) {
  const kind = TRACK_KIND[track];
  const groupKey = track !== 'quiz' && lesson.worksheetKey
    ? `${lesson.unit}.${lesson.worksheetKey}`
    : lesson.lessonKey;
  return cedColumnTitle(kind, groupKey);
}
