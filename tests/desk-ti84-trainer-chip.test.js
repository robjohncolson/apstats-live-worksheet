// Pins the Desk's display-only TI-84 completion surface
// (TI84_GRADE_INTEGRATION_SPEC.md §B): _trainerScoreFor reads the /grade
// lessons[] cache (ledger-authoritative, never trainer localStorage),
// _lessonHasTrainer gates the Calculator Skill row, and — LOAD-BEARING —
// _isLessonComplete stays trainer-free (trainer work must not gate lesson
// advancement/greying in this phase). Functions extracted from the Desk
// source, same pattern as desk-ti84-skill-link.test.js.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const deskSrc = fs.readFileSync(
  path.resolve(__dirname, '..', 'ap_stats_roadmap_square_mode.html'),
  'utf8',
);

function extract(name) {
  const match = deskSrc.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`));
  if (!match) throw new Error(`Could not extract ${name} from the Desk`);
  return match[0];
}

const LESSON_MAP = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '..', 'data', 'ti84-lesson-map.json'), 'utf8',
));

function trainerScoreForWith(cache) {
  return new Function(
    '_gradeLessonsCache',
    `${extract('_trainerScoreFor')}\nreturn _trainerScoreFor;`,
  )(cache);
}

function lessonHasTrainerWith({ map, cache }) {
  return new Function(
    '_ti84LessonMap', '_gradeLessonsCache',
    `${extract('_lessonHasTrainer')}\nreturn _lessonHasTrainer;`,
  )(map, cache);
}

describe('_trainerScoreFor — ledger-authoritative trainer pct', () => {
  const CACHE = [
    { lessonKey: '1.5', trainer: 85, hasTrainer: true },
    { lessonKey: '1.7', trainer: null, hasTrainer: true },
    { lessonKey: '1.1', trainer: null, hasTrainer: false },
  ];

  it('returns the recorded pct for a practiced lesson', () => {
    expect(trainerScoreForWith(CACHE)('1.5')).toBe(85);
  });

  it('returns null for an untouched lesson (no evidence ≠ 0)', () => {
    expect(trainerScoreForWith(CACHE)('1.7')).toBe(null);
  });

  it('returns null when the cache is cold', () => {
    expect(trainerScoreForWith(null)('1.5')).toBe(null);
    expect(trainerScoreForWith(undefined)('1.5')).toBe(null);
  });
});

describe('_lessonHasTrainer — gates the Calculator Skill row', () => {
  it('prefers the static lesson map', () => {
    const has = lessonHasTrainerWith({ map: LESSON_MAP.lessons, cache: null });
    expect(has('1.5')).toBe(true);
    expect(has('1.1')).toBe(false);
  });

  it('falls back to the /grade hasTrainer flag when the map fetch failed', () => {
    const has = lessonHasTrainerWith({
      map: null,
      cache: [{ lessonKey: '6.4', hasTrainer: true }, { lessonKey: '6.5', hasTrainer: false }],
    });
    expect(has('6.4')).toBe(true);
    expect(has('6.5')).toBe(false);
  });

  it('no map + cold cache → false (row simply absent)', () => {
    expect(lessonHasTrainerWith({ map: null, cache: null })('1.5')).toBe(false);
  });
});

describe('display-only invariants (source-level pins)', () => {
  it('LOAD-BEARING: _isLessonComplete never reads trainer state', () => {
    const gate = extract('_isLessonComplete');
    expect(gate).not.toMatch(/trainer/i);
    expect(gate).not.toMatch(/_trainerScoreFor/);
  });

  it('the Calculator Skill row has no Done button and no self-attest artifact', () => {
    const rowBlock = deskSrc.match(/TI-84 calculator-skill row[\s\S]{0,1400}?<\/div>';/);
    expect(rowBlock).toBeTruthy();
    expect(rowBlock[0]).not.toMatch(/studentMark/);
    expect(rowBlock[0]).not.toMatch(/_doneBtn/);
  });

  it('the row launches via _openTi84ForTopic with a #topic deep link', () => {
    expect(deskSrc).toMatch(/function _openTi84ForTopic\(/);
    expect(extract('_openTi84ForTopic')).toMatch(/#topic=.*source=desk/);
  });
});
