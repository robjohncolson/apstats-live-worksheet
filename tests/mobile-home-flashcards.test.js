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
    expect(HOME).toContain('fc.onclick = function (event) { openFlashcards(l, event.currentTarget); }');
    expect(HOME).toContain('function openFlashcards(lesson, launcher)');
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

function bootLauncher({ gradeBlooket, indexMissing }) {
  const recorded = [];
  const lesson = { id: '4.1-2', unit: 4, label: 'Sampling', worksheet: 'u4_lesson1-2_live.html', quiz: null, blooket: 'https://b', videos: [] };
  // The published fallback source: roadmap-data.json (absolute GH-Pages URLs).
  const roadmap = { lessons: { '4.1-2': { topic: 'Sampling', urls: { worksheet: 'https://robjohncolson.github.io/apstats-live-worksheet/u4_lesson1-2_live.html', quiz: null, blooket: 'https://b' } } } };
  const gradePayload = { ok: true, quarters: [], lessons: [{ topic: '4.1-2', lessonGrade: 55, blooket: gradeBlooket }] };
  const fakeFetch = (url) => {
    const u = String(url);
    if (indexMissing && u.indexOf('lessons-index.json') >= 0) {
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve(null), text: () => Promise.resolve('') });
    }
    const body = u.indexOf('lessons-index.json') >= 0 ? { lessons: [lesson] }
      : u.indexOf('roadmap-data.json') >= 0 ? roadmap
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

async function finishOneCardFullDeck(win) {
  win.document.querySelector('.btn.fc').click();
  await flush(2);
  win.document.getElementById('fc-mode-full').click();
  await flush();
  win.document.querySelector('#fc-choices .fc-choice[data-i="1"]').click();
  await flush(1);
  win.document.getElementById('fc-next').click();
  await flush(4);
}

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

  it('falls back to roadmap-data.json when lessons-index.json 404s (laptop / GH-Pages)', async () => {
    const { dom, win, recorded } = bootLauncher({ gradeBlooket: 40, indexMissing: true });
    await flush(8);                                                 // index 404 → roadmap → render

    const fcBtn = win.document.querySelector('.btn.fc');
    expect(fcBtn, 'tiles did not render from the roadmap fallback').toBeTruthy();
    // Worksheet link is ORIGIN-RELATIVE (github.io base stripped) so a Vercel mirror is self-sufficient.
    const wsA = win.document.querySelector('.btn.ws');
    expect(wsA.getAttribute('href')).toBe('u4_lesson1-2_live.html');
    expect(wsA.getAttribute('href')).not.toMatch(/github\.io/);
    fcBtn.click();
    await flush(2);
    win.document.getElementById('fc-mode-full').click();
    await flush();
    win.document.querySelector('#fc-choices .fc-choice[data-i="1"]').click();
    await flush(1);
    win.document.getElementById('fc-next').click();
    await flush(2);

    expect(recorded.length).toBe(1);
    expect(recorded[0].itemId).toBe('BL-U4-L1-2-DESK_DONE');        // flashcards work off the fallback too
    dom.window.close();
  });
});

function inlineFunctionSource(name) {
  const start = HOME.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`missing inline function ${name}`);
  const open = HOME.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < HOME.length; i += 1) {
    if (HOME[i] === '{') depth += 1;
    if (HOME[i] === '}') depth -= 1;
    if (depth === 0) return HOME.slice(start, i + 1);
  }
  throw new Error(`unterminated inline function ${name}`);
}

describe('mobile-home — native flashcards commit note + accessibility', () => {
  it('resolves the commit before rendering while _fcCommit stays synchronous', () => {
    const finish = inlineFunctionSource('_fcFinish');
    const commit = inlineFunctionSource('_fcCommit');

    expect(finish).toContain('Promise.resolve(committed).then');
    expect(HOME).toContain('function _fcCommit(');
    expect(commit).not.toMatch(/\b(?:async|await)\b/);
  });

  it('renders the Saved offline note after an asynchronous queued commit', async () => {
    const { dom, win, recorded } = bootLauncher({ gradeBlooket: 40 });
    await flush();
    win.gradebookClient.record = (payload) => {
      recorded.push(payload);
      return Promise.resolve({ ok: true, queued: true });
    };

    win.document.querySelector('.btn.fc').click();
    await flush(2);
    win.document.getElementById('fc-mode-full').click();
    await flush();
    win.document.querySelector('#fc-choices .fc-choice[data-i="1"]').click();
    await flush(1);
    win.document.getElementById('fc-next').click();
    await flush(2);

    expect(recorded).toHaveLength(1);
    expect(win.document.querySelector('.fc-result p').textContent).toContain('Saved offline');
    dom.window.close();
  });

  it('renders the Sign in note after an asynchronous no-identity result', async () => {
    const { dom, win, recorded } = bootLauncher({ gradeBlooket: 40 });
    await flush();
    win.gradebookClient.record = (payload) => {
      recorded.push(payload);
      return Promise.resolve({ ok: false, reason: 'no-identity' });
    };

    await finishOneCardFullDeck(win);

    expect(recorded).toHaveLength(1);
    expect(win.document.querySelector('.fc-result p').textContent).toContain('Sign in to save');
    dom.window.close();
  });

  it('renders the Couldn’t save note when an asynchronous record rejects', async () => {
    const { dom, win, recorded } = bootLauncher({ gradeBlooket: 40 });
    await flush();
    win.gradebookClient.record = (payload) => {
      recorded.push(payload);
      return Promise.reject(new Error('x'));
    };

    await expect(finishOneCardFullDeck(win)).resolves.toBeUndefined();

    expect(recorded).toHaveLength(1);
    expect(win.document.querySelector('.fc-result p').textContent).toContain('Couldn’t save');
    dom.window.close();
  });

  it('restores focus to the flashcards launcher when the sheet closes', async () => {
    const { dom, win } = bootLauncher({ gradeBlooket: 40 });
    await flush();
    const launcher = win.document.querySelector('.btn.fc');
    launcher.focus();
    launcher.click();
    await flush(2);

    win.closeFlashcards();

    expect(win.document.activeElement).toBe(launcher);
    dom.window.close();
  });

  it('marks the sheet and feedback for assistive tech and keeps choices touch-sized', () => {
    expect(HOME).toMatch(/<div id="fco"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="fc-title"/);
    expect(HOME).toContain('id="fc-feedback" aria-live="polite"');
    expect(HOME).toMatch(/#fco \.fc-choice\s*\{[^}]*min-height:\s*44px/);
  });

  it('keeps the flashcard sheet within a 320 px viewport', () => {
    const fcoCss = Array.from(HOME.matchAll(/#fco[^}]*}/g), (match) => match[0]).join('\n');
    expect(fcoCss).toMatch(/#fco \.fc-body\s*\{[^}]*(?:max-width|width):\s*100%/);
    expect(fcoCss).toMatch(/#fco \.fc-choice\s*\{[^}]*overflow-wrap:\s*anywhere/);

    const widths = Array.from(
      fcoCss.matchAll(/(?:^|[;{])\s*(?:min-|max-)?width\s*:\s*([0-9.]+)(%|px)/g),
    );
    expect(widths.length).toBeGreaterThan(0);
    widths.forEach((match) => {
      const value = Number(match[1]);
      if (match[2] === '%') expect(value).toBeLessThanOrEqual(100);
      if (match[2] === 'px') expect(value).toBeLessThanOrEqual(320);
    });
  });

  it('uses the frozen Blooket-half vocabulary in flashcard student copy', () => {
    const start = HOME.indexOf('// ── Native flashcards');
    const end = HOME.indexOf('// Cached grade', start);
    const flashcardsBlock = HOME.slice(start, end);
    expect(flashcardsBlock).toContain('Blooket half of Done');
    expect(flashcardsBlock).not.toMatch(/lesson unlocked|to unlock|enough to unlock/i);
  });
});
