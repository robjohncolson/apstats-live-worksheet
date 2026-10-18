// Pins the Desk's TI-84 lesson links (APSTAT_PARK_SOLO_DOOR_SPEC §5): the Do-Now "Today's
// calculator skill" chip and the resource panel's Calculator Skill row open the park's solo room
// on the calendar board through _openParkSolo (the #room=calc-solo&topic=<t> hash). There is no
// ti84 app window, so appLaunchUrl has no ti84 branch. Functions are extracted from the Desk
// source and run against injected globals.
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

// _openTi84ForTopic with a recording _openParkSolo.
function openForTopicWith() {
  const calls = [];
  const open = new Function('_openParkSolo', `${extract('_openTi84ForTopic')}\nreturn _openTi84ForTopic;`)(
    (link) => calls.push(link));
  return { open, calls };
}

// _renderTi84SkillBtn against a minimal Do-Now body; returns the chip (or null) and the calls.
function renderChipWith({ todayLesson, map }) {
  const calls = [];
  let chip = null;
  const body = { appendChild: (el) => { chip = el; } };
  const document = {
    querySelector: (sel) => (sel === '#donow-card .donow-body' ? body : null),
    getElementById: () => chip,
    createElement: () => ({ style: {}, remove() { chip = null; } }),
  };
  const render = new Function(
    'document', '_todayLessonInf', '_ti84LessonMap', '_openParkSolo',
    `${extract('_ti84TodayTopic')}\n${extract('_renderTi84SkillBtn')}\nreturn _renderTi84SkillBtn;`,
  )(document, todayLesson, map, (link) => calls.push(link));
  render();
  return { chip, calls };
}

describe('Desk TI-84 links open the park solo room', () => {
  it('the resource panel row opens the topic in the park room', () => {
    const { open, calls } = openForTopicWith();
    open('7.2');
    expect(calls).toEqual(['&topic=7.2']);
  });

  it('a missing topic opens the room on the due/rotation round', () => {
    const { open, calls } = openForTopicWith();
    open('');
    expect(calls).toEqual(['']);
  });

  it('a mapped lesson gets the Do-Now chip, and the chip opens today\'s topic in the park room', () => {
    const { chip, calls } = renderChipWith({ todayLesson: { u: 7, t: '7.2' }, map: LESSON_MAP.lessons });
    expect(chip).not.toBe(null);
    chip.onclick();
    expect(calls).toEqual(['&topic=7.2']);
  });

  it('promoted Unit 3 topics get the chip too', () => {
    const { chip, calls } = renderChipWith({ todayLesson: { u: 3, t: '3.3' }, map: LESSON_MAP.lessons });
    chip.onclick();
    expect(calls).toEqual(['&topic=3.3']);
  });

  it('an unmapped lesson, an unloaded map, or no lesson today: no chip', () => {
    expect(renderChipWith({ todayLesson: { u: 1, t: '1.1' }, map: LESSON_MAP.lessons }).chip).toBe(null);
    expect(renderChipWith({ todayLesson: { u: 7, t: '7.2' }, map: null }).chip).toBe(null);
    expect(renderChipWith({ todayLesson: null, map: LESSON_MAP.lessons }).chip).toBe(null);
  });

  it('appLaunchUrl has no ti84 branch: every other app opens its own URL', () => {
    const appLaunchUrl = new Function(`${extract('appLaunchUrl')}\nreturn appLaunchUrl;`)();
    expect(appLaunchUrl({ url: 'https://example.com/quiz' }, 'quiz')).toBe('https://example.com/quiz');
    expect(extract('appLaunchUrl')).not.toContain('ti84');
  });
});
