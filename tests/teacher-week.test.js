/**
 * teacher-week.html — weekly learning-objective view (B & E) for the teacher.
 * Also validates data/learning-objectives.json against the lesson schedule.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..');
const schedule = JSON.parse(readFileSync(join(root, 'data/lesson-schedule.json'), 'utf8'));
const objectives = JSON.parse(readFileSync(join(root, 'data/learning-objectives.json'), 'utf8'));

describe('data/learning-objectives.json', () => {
  it('covers every scheduled topic', () => {
    const missing = Object.keys(schedule.lessons).filter((k) => !objectives.topics[k]);
    expect(missing).toEqual([]);
  });

  it('every non skills-focus topic has at least one LO with code, text and skill', () => {
    const skillsFocus = ['7.10', '8.7'];
    for (const [key, topic] of Object.entries(objectives.topics)) {
      if (skillsFocus.includes(key)) continue;
      expect(topic.los.length, `topic ${key}`).toBeGreaterThan(0);
      for (const lo of topic.los) {
        expect(lo.code).toMatch(/^(VAR|UNC|DAT)-\d+\.[A-Z]{1,2}$/);
        expect(lo.text.length).toBeGreaterThan(10);
        expect(lo.skill).toMatch(/^\d\.[A-F]$/);
      }
    }
  });

  it('LO codes are unique across the course', () => {
    const codes = Object.values(objectives.topics).flatMap((t) => t.los.map((lo) => lo.code));
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('teacher-week.html', () => {
  let document;

  beforeAll(async () => {
    const html = readFileSync(join(root, 'teacher-week.html'), 'utf8');
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      url: 'https://example.test/teacher-week.html?date=2026-09-22',
      beforeParse(window) {
        window.fetch = async (path) => {
          const file = path.includes('learning-objectives') ? objectives : schedule;
          return { ok: true, json: async () => file };
        };
      },
    });
    document = dom.window.document;
    await new Promise((r) => setTimeout(r, 50));
  });

  it('renders both periods for the week containing the date param', () => {
    expect(document.getElementById('weekLabel').textContent).toBe('Week of Sep 21 – Sep 25, 2026');
    const sections = [...document.querySelectorAll('section.period')];
    expect(sections.map((s) => s.classList.contains('B') ? 'B' : 'E')).toEqual(['B', 'E']);
  });

  it('shows the scheduled topics and their CED objectives per period', () => {
    const periodB = document.querySelector('section.period.B');
    const periodE = document.querySelector('section.period.E');
    const week = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'];
    const topicsFor = (p) => Object.values(schedule.lessons).filter((l) => week.includes(l.periods[p])).map((l) => l.topicKey);
    for (const key of topicsFor('B')) {
      expect(periodB.textContent).toContain(`Topic ${key}`);
      for (const lo of objectives.topics[key].los) expect(periodB.textContent).toContain(lo.code);
    }
    for (const key of topicsFor('E')) expect(periodE.textContent).toContain(`Topic ${key}`);
    expect(topicsFor('B').length + topicsFor('E').length).toBeGreaterThan(0);
  });

  it('marks non-meeting days and the MCQ Part A progress-check day', () => {
    const periodE = document.querySelector('section.period.E');
    const days = [...periodE.querySelectorAll('.day')];
    expect(days.length).toBe(5);
    expect(days[1].classList.contains('no-class')).toBe(true); // Tue: E meets Mon/Wed/Fri
    expect(document.querySelector('.tag.pc').textContent).toContain('MCQ Part A');
  });

  it('summary lists the week\'s LO chips', () => {
    expect(document.querySelectorAll('#summaryGrid .chip').length).toBeGreaterThan(0);
    expect(document.getElementById('drift').textContent.length).toBeGreaterThan(0);
  });
});
