// mobile-home-flashcards.test.js — the launcher's NATIVE flashcards port.
// Part A: static wiring (engine + feeder loaded, deep-link gone, best-wins commit).
// Part B: boots mobile-home.html in jsdom and plays a real full-deck round through
// the controller to the gradebook feeder, asserting the exact BL-…-DESK_DONE grade
// row + the best-wins floor (a run that can't beat the recorded score is dropped).
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOME = readFileSync(resolve(repo, 'mobile-home.html'), 'utf8');
const FLASHCARDS_SRC = readFileSync(resolve(repo, 'flashcards.js'), 'utf8');

describe('mobile-home — native flashcards wiring (static)', () => {
  it('loads the shared engine + the gradebook feeder (+ offline queue)', () => {
    for (const s of ['flashcards.js', 'gradebook-client.js', 'offline-queue.js']) {
      expect(HOME, `missing <script src="${s}">`).toContain(`src="${s}"`);
    }
  });

  it('replaced the Desk deep-link with a native openFlashcards handler', () => {
    expect(HOME, 'stale Desk deep-link still present').not.toContain('?flashcards=');
    expect(HOME).toContain('fc.onclick = function () { openFlashcards(l); }');
    expect(HOME).toContain('function openFlashcards(lesson)');
    expect(HOME).toContain('function closeFlashcards()');
    expect(HOME).toContain('id="fco"');
  });

  it('commits the same grade row the Desk does, with a best-wins floor', () => {
    // source 'worksheet' + FC.blooketItemId → the server's Blooket track; never downgrades.
    expect(HOME).toContain("source: 'worksheet'");
    expect(HOME).toContain('FC.blooketItemId(topic)');
    expect(HOME).toContain("response: { selfAttest: 'blooket' }");
    expect(HOME).toContain('if (!(score > floor)) return { skipped: true');
    // Quick records only on pass; the full deck always records its score.
    expect(HOME).toContain("var doCommit = (_fc.mode === 'quick') ? passed : true;");
  });
});

// ── Behavioral: boot the launcher + play a full-deck round ─────────────────────
const ONE_CARD_CSV = [
  '"Blooket","Import Template"',
  'Question #,Question Text,Answer 1,Answer 2,Answer 3,Answer 4,Time,Correct',
  '1,"Q one","alpha","beta","gamma","delta",20,2',   // correctIdx = 1 (data-i="1")
].join('\n');

function bootLauncher({ gradeBlooket }) {
  const recorded = [];
  const lesson = { id: '4.1-2', unit: 4, label: 'Sampling', worksheet: 'u4_lesson1-2_live.html', quiz: null, blooket: 'https://b', videos: [] };
  const gradePayload = { ok: true, quarters: [], lessons: [{ topic: '4.1-2', lessonGrade: 55, blooket: gradeBlooket }] };
  const fakeFetch = (url) => {
    const u = String(url);
    const body = u.indexOf('lessons-index.json') >= 0 ? { lessons: [lesson] }
      : u.indexOf('/grade') >= 0 ? gradePayload
      : u.indexOf('blooket-difficulty.json') >= 0 ? { tags: {} }
      : null;
    const text = u.indexOf('_blooket.csv') >= 0 ? ONE_CARD_CSV : '';
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve(text) });
  };
  const dom = new JSDOM(HOME, {
    runScripts: 'dangerously',
    url: 'https://x.test/mobile-home.html',
    beforeParse(window) {
      window.eval(FLASHCARDS_SRC);                       // window.Flashcards
      window.fetch = fakeFetch;
      window.ROSTER_SERVICE_URL = 'https://api.test';
      window.rosterClient = { current: () => ({ username: 'kid' }), token: () => 'tok' };
      window.gradebookClient = { record: (a) => { recorded.push(a); return { ok: true, ledgerId: 'L1' }; } };
    },
  });
  return { dom, win: dom.window, recorded };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
async function flush(n = 6) { for (let i = 0; i < n; i++) await tick(); }

describe('mobile-home — native flashcards (behavioral boot)', () => {
  it('plays a full deck to 100% and records BL-U4-L1-2-DESK_DONE', async () => {
    const { dom, win, recorded } = bootLauncher({ gradeBlooket: 40 });
    await flush();                                                   // lessons render + /grade loads

    win.document.querySelector('.btn.fc').click();                  // 🃏 → openFlashcards
    await flush(2);
    win.document.getElementById('fc-mode-full').click();            // Full deck → fetch CSV
    await flush();

    const correct = win.document.querySelector('#fc-choices .fc-choice[data-i="1"]');
    expect(correct, 'card did not render').toBeTruthy();
    correct.click();                                                // answer correct
    await flush(1);
    win.document.getElementById('fc-next').click();                 // → finish → commit
    await flush(2);

    expect(recorded.length).toBe(1);
    expect(recorded[0]).toMatchObject({
      source: 'worksheet', itemId: 'BL-U4-L1-2-DESK_DONE', unit: 'U4',
      topic: '4.1-2', response: { selfAttest: 'blooket' }, score: 100, attempt: 1,
    });
    expect(win.document.querySelector('.fc-score').textContent).toContain('100');
    dom.window.close();
  });

  it('best-wins: a run that cannot beat the recorded score does not record', async () => {
    const { dom, win, recorded } = bootLauncher({ gradeBlooket: 100 });   // already maxed
    await flush();

    win.document.querySelector('.btn.fc').click();
    await flush(2);
    win.document.getElementById('fc-mode-full').click();
    await flush();
    win.document.querySelector('#fc-choices .fc-choice[data-i="1"]').click();
    await flush(1);
    win.document.getElementById('fc-next').click();
    await flush(2);

    expect(recorded.length).toBe(0);                                // 100 !> 100 → dropped
    expect(win.document.querySelector('.fc-result p').textContent).toMatch(/best score/i);
    dom.window.close();
  });
});
