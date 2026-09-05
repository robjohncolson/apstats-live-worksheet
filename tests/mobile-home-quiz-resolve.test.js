// mobile-home-quiz-resolve.test.js — H0/G1 quiz href resolution + W1 honesty.
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOME = readFileSync(resolve(repo, 'mobile-home.html'), 'utf8');
const CED_SOURCE = ['js/ced2026-crosswalk.js', 'js/ced2026-labels.js']
  .map((file) => readFileSync(resolve(repo, file), 'utf8')).join('\n');

const CR = 'https://robjohncolson.github.io/curriculum_render/?u=1&l=2';

function boot({ offlineMode, lessons }) {
  const dom = new JSDOM(HOME, {
    runScripts: 'dangerously',
    url: 'https://robjohncolson.github.io/apstats-live-worksheet/mobile-home.html',
    beforeParse(window) {
      window.eval(CED_SOURCE);
      if (offlineMode !== undefined) window.OFFLINE_MODE = offlineMode;
      window.fetch = (url) => {
        const u = String(url);
        if (u.includes('lessons-index.json')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ lessons }),
          });
        }
        if (u.includes('/grade')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ ok: true, lessons: [] }),
          });
        }
        return Promise.resolve({ ok: false, status: 404, json: async () => null, text: async () => '' });
      };
      window.ROSTER_SERVICE_URL = 'https://api.test';
      window.rosterClient = { current: () => null, token: () => null };
    },
  });
  return dom;
}

const tick = () => new Promise((r) => setTimeout(r, 0));
async function flush(n = 12) {
  for (let i = 0; i < n; i++) await tick();
}

const L12 = {
  id: '1.2',
  unit: 1,
  label: 'Topic 1.2',
  worksheet: 'u1_lesson2_live.html',
  quiz: 'quiz/index.html?u=1&l=2',
  blooket: null,
  videos: [],
  ced2026: { status: 'core', newUnit: 1, newTopic: '1.2', newLabel: 'Variables' },
};
const L11 = {
  id: '1.1',
  unit: 1,
  label: 'Topic 1.1',
  worksheet: 'u1_lesson1_live.html',
  quiz: null,
  blooket: null,
  videos: [],
  ced2026: { status: 'core', newUnit: 1, newTopic: '1.1', newLabel: 'What Can We Learn from Data?' },
};

describe('mobile-home quiz resolve (H0/G1) + W1 honesty', () => {
  it('web: relative quiz → absolute CR origin', async () => {
    const dom = boot({ lessons: [L12] });
    await flush();
    const a = dom.window.document.querySelector('a.btn.quiz');
    expect(a).toBeTruthy();
    expect(a.getAttribute('href')).toBe(CR);
    dom.window.close();
  });

  it('APK OFFLINE_MODE=true: keeps relative quiz path', async () => {
    const dom = boot({ offlineMode: true, lessons: [L12] });
    await flush();
    const a = dom.window.document.querySelector('a.btn.quiz');
    expect(a.getAttribute('href')).toBe('quiz/index.html?u=1&l=2');
    dom.window.close();
  });

  it("APK OFFLINE_MODE='1': keeps relative quiz path (offline-queue parity)", async () => {
    const dom = boot({ offlineMode: '1', lessons: [L12] });
    await flush();
    const a = dom.window.document.querySelector('a.btn.quiz');
    expect(a.getAttribute('href')).toBe('quiz/index.html?u=1&l=2');
    dom.window.close();
  });

  it('W1: opener quiz:null shows honest label, not a dead Quiz link', async () => {
    const dom = boot({ lessons: [L11] });
    await flush();
    const deadLink = dom.window.document.querySelector('a.btn.quiz');
    expect(deadLink).toBeNull();
    const note = [...dom.window.document.querySelectorAll('span.btn.quiz')].find((el) =>
      /no quiz/i.test(el.textContent || ''),
    );
    expect(note, 'expected Worksheet only — no quiz label').toBeTruthy();
    expect(note.textContent).toMatch(/Worksheet only/i);
    dom.window.close();
  });
});
