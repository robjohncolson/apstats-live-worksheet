// Pins the Desk side of the TI-84 lesson deep-link (TI84_TRAINER_DESK_LINK_SPEC.md
// §3, step 3): a mapped lesson links its exact skill (#topic=...&source=desk),
// an unmapped lesson falls back to the unit filter, no lesson => bare URL.
// appLaunchUrl/_ti84TodayTopic are extracted from the Desk source (same
// pattern as the trainer extraction tests); the chip injection itself is
// covered by the manual smoke.
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

const TI84_APP = { url: 'ti84-trainer-v2/standalone.html' };

// Rebuilds the two functions around injectable globals.
function launchUrlWith({ todayLesson, map }) {
  return new Function(
    '_todayLessonInf', '_ti84LessonMap',
    `${extract('_ti84TodayTopic')}\n${extract('appLaunchUrl')}\nreturn appLaunchUrl;`,
  )(todayLesson, map);
}

describe('Desk ti84 deep link', () => {
  it('a mapped lesson links its exact skill with source=desk', () => {
    const appLaunchUrl = launchUrlWith({ todayLesson: { u: 7, t: '7.2' }, map: LESSON_MAP.lessons });
    expect(appLaunchUrl(TI84_APP, 'ti84')).toBe('ti84-trainer-v2/standalone.html#topic=7.2&source=desk');
  });

  it('an unmapped lesson falls back to the unit filter', () => {
    const appLaunchUrl = launchUrlWith({ todayLesson: { u: 1, t: '1.1' }, map: LESSON_MAP.lessons });
    expect(appLaunchUrl(TI84_APP, 'ti84')).toBe('ti84-trainer-v2/standalone.html#unit=1');
  });

  it('an unloaded map (fetch failed) falls back to the unit filter', () => {
    const appLaunchUrl = launchUrlWith({ todayLesson: { u: 7, t: '7.2' }, map: null });
    expect(appLaunchUrl(TI84_APP, 'ti84')).toBe('ti84-trainer-v2/standalone.html#unit=7');
  });

  it('no lesson today gives the bare URL', () => {
    const appLaunchUrl = launchUrlWith({ todayLesson: null, map: LESSON_MAP.lessons });
    expect(appLaunchUrl(TI84_APP, 'ti84')).toBe('ti84-trainer-v2/standalone.html');
  });

  it('non-ti84 apps are untouched', () => {
    const appLaunchUrl = launchUrlWith({ todayLesson: { u: 7, t: '7.2' }, map: LESSON_MAP.lessons });
    expect(appLaunchUrl({ url: 'https://example.com/quiz' }, 'quiz')).toBe('https://example.com/quiz');
  });

  it('promoted Unit 3 topics now produce a topic link', () => {
    const appLaunchUrl = launchUrlWith({ todayLesson: { u: 3, t: '3.3' }, map: LESSON_MAP.lessons });
    expect(appLaunchUrl(TI84_APP, 'ti84')).toBe('ti84-trainer-v2/standalone.html#topic=3.3&source=desk');
  });

  it('unmapped Unit 3 topics still fall back to the unit filter', () => {
    const appLaunchUrl = launchUrlWith({ todayLesson: { u: 3, t: '3.1' }, map: LESSON_MAP.lessons });
    expect(appLaunchUrl(TI84_APP, 'ti84')).toBe('ti84-trainer-v2/standalone.html#unit=3');
  });
});
