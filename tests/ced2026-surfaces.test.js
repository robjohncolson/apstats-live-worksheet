// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(resolve(repo, file), 'utf8');
const mobile = read('mobile-home.html');
const startHere = read('start-here.html');
const lessons = JSON.parse(read('lessons-index.json')).lessons;
const cedSource = read('js/ced2026-crosswalk.js') + '\n' + read('js/ced2026-labels.js');
const flashcards = read('flashcards.js');
const opened = [];
const flush = async () => {
  for (let i = 0; i < 8; i++) await new Promise((done) => setTimeout(done, 0));
};

afterEach(() => {
  opened.splice(0).forEach((dom) => dom.window.close());
});

function boot(html, { selected = lessons, grade = { ok: true }, signedIn = true } = {}) {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://school.test/',
    beforeParse(window) {
      window.eval(cedSource);
      window.eval(flashcards);
      window.ROSTER_SERVICE_URL = 'https://roster.test';
      window.rosterClient = {
        token: () => signedIn ? 'test-session' : null,
        current: () => signedIn ? { studentId: 'student', username: 'student', role: 'student' } : null,
      };
      window.fetch = async (url) => {
        if (String(url).includes('lessons-index.json')) return { ok: true, json: async () => ({ lessons: selected }) };
        if (String(url).includes('/grade')) return { ok: true, json: async () => grade };
        return { ok: false, status: 404, json: async () => null, text: async () => '' };
      };
    },
  });
  opened.push(dom);
  return dom.window;
}

describe('CED labels on the mobile lesson page', () => {
  it('renders all real lessons with five groups, folded days, and no old Unit 6–9 titles', async () => {
    const win = boot(mobile);
    await flush();
    const titles = [...win.document.querySelectorAll('.lesson .title > span:first-child')].map((node) => node.textContent);
    expect(titles).toHaveLength(lessons.length);
    expect(titles.join('\n')).not.toMatch(/\b[6-9]\.\d+\b|\bUnit [6-9]\b/);
    expect(titles).toContain('1.10 · Investigative Question & Data Collection · Day 1');
    expect(titles).toContain('1.10 · Investigative Question & Data Collection · Day 2');
    const groups = [...win.document.querySelectorAll('details.unit > summary')].map((node) => node.textContent);
    expect(groups.map((label) => label.match(/^Unit (\d)/)?.[1])).toEqual(['1', '2', '3', '4', '5']);
    const bonus = [...win.document.querySelectorAll('.lesson.bonus .title > span:first-child')];
    expect(bonus.length).toBeGreaterThan(0);
    expect(bonus.every((node) => node.textContent.startsWith('★ Beyond the Exam · '))).toBe(true);
  });

  it('preserves the original worksheet and quiz targets and grade identity', async () => {
    const selected = lessons.filter((lesson) => ['3.1', '3.2', '8.4'].includes(lesson.id));
    const snapshot = JSON.stringify(selected);
    const win = boot(mobile, {
      selected,
      grade: { ok: true, lessons: [{ lessonKey: '8.4', lessonGrade: 84 }], quarters: {} },
    });
    await flush();
    const cards = [...win.document.querySelectorAll('.lesson')];
    for (const lesson of selected) {
      const card = cards.find((node) => node.querySelector('a.ws')?.getAttribute('href') === lesson.worksheet);
      expect(card, `worksheet target for ${lesson.id}`).toBeTruthy();
      if (lesson.quiz) {
        const query = lesson.quiz.slice(lesson.quiz.indexOf('?'));
        expect(card.querySelector('a.quiz')?.getAttribute('href')).toBe('https://robjohncolson.github.io/curriculum_render/' + query);
      }
      if (lesson.id === '8.4') expect(card.querySelector('.done-badge')?.textContent).toBe('✓ 84%');
    }
    expect(JSON.stringify(selected)).toBe(snapshot);
  });

  it('uses the same folded label in the flashcard dialog', async () => {
    const win = boot(mobile, { selected: lessons.filter((lesson) => lesson.id === '3.1') });
    await flush();
    win.document.querySelector('.btn.fc').click();
    expect(win.document.getElementById('fc-title').textContent)
      .toBe('🃏 1.10 · Investigative Question & Data Collection · Day 1');
  });

  it('uses the authoritative fallback when the offline lesson list lacks CED metadata', async () => {
    const selected = lessons.filter((lesson) => lesson.id === '8.4').map(({ ced2026, ...lesson }) => lesson);
    const win = boot(mobile, { selected });
    await flush();
    const title = win.document.querySelector('.lesson .title').textContent;
    expect(title).toMatch(/^3\.14 · /);
    expect(title).not.toContain('8.4');
  });

  it('keeps material available when a lesson has no known mapping', async () => {
    const selected = [{ id: '99.1', unit: 99, label: 'Topic 99.1', worksheet: 'extra.html', videos: [] }];
    const win = boot(mobile, { selected });
    await flush();
    expect(win.document.querySelector('.lesson .title').textContent).toBe('Lesson');
    expect(win.document.querySelector('.lesson a.ws').getAttribute('href')).toBe('extra.html');
    expect(win.document.querySelector('details.unit > summary').textContent).toBe('Lessons▶');
  });
});

describe('CED coverage for existing Start Here grade groups', () => {
  it('keeps each existing score and group while describing its CED topic coverage', async () => {
    const grade = {
      ok: true,
      quarters: { Q1: { quarterGrade: 80, ceiling: 95, unitsGraded: 1, unitsTotal: 3 } },
      units: {
        U1: { unitGrade: 81.2, graded: true, banked: 80, P: 81.2 },
        U5: { unitGrade: 73.4, graded: true, banked: 73.4, P: 50 },
        U9: { unitGrade: 66.6, graded: true, banked: 66.6, P: 40 },
      },
      completion: { U5: { worksheet: 2 } },
    };
    const snapshot = JSON.stringify(grade);
    const win = boot(startHere, { grade });
    await flush();
    const cards = [...win.document.querySelectorAll('.wys-unit')];
    expect(cards).toHaveLength(3);
    expect(cards.map((card) => card.querySelector('.grade').textContent)).toEqual(['81.2', '73.4', '66.6']);
    const headings = cards.map((card) => card.querySelector('h3').textContent);
    expect(headings.join('\n')).not.toMatch(/\bUnit [1-9]\b|\bU[1-9]\b/);
    expect(headings[0]).toContain('CED topics');
    expect(headings[1]).toMatch(/2\./);
    expect(headings[1]).toMatch(/3\./);
    expect(headings[1]).toMatch(/4\./);
    expect(headings[2]).toContain('Beyond the Exam');
    expect(cards[1].textContent).toContain('2 worksheet items');
    expect(win.document.querySelector('.wys-quarters .step').title).toContain('1 of 3 topic groups graded');
    expect(JSON.stringify(grade)).toBe(snapshot);
  });

  it('keeps the signed-out progress prompt', async () => {
    const win = boot(startHere, { signedIn: false });
    await flush();
    expect(win.document.getElementById('wys-status').textContent).toContain('Sign in on the Desk');
    expect(win.document.querySelector('.wys-unit')).toBeNull();
  });

  it('loads the shared mapping before the helper on both pages and updates the landing copy', () => {
    for (const html of [mobile, startHere]) {
      expect(html).toContain('src="js/ced2026-crosswalk.js"');
      expect(html.indexOf('src="js/ced2026-crosswalk.js"')).toBeLessThan(html.indexOf('src="js/ced2026-labels.js"'));
    }
    const landing = read('index.html');
    expect(landing).toContain('five CED units, plus Beyond the Exam');
    expect(landing).not.toContain('Units 1&ndash;9');
    expect(startHere).toContain('<label for="gp-pc-u1">PC score 1</label>');
    expect(startHere).not.toMatch(/Unit [123] PC/);
  });
});
