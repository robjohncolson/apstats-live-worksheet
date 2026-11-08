// mobile-home-flashcards.test.js — the launcher's NATIVE flashcards port.
// Part A: static wiring (engine + feeder loaded, deep-link gone, best-wins commit).
// Part B: boots mobile-home.html in jsdom and plays a real full-deck round through
// the controller to the gradebook feeder, asserting the exact BL-…-DESK_DONE grade
// row + the best-wins floor (every finished run sends its row and the server keeps each
// item's best; a run that can't beat the recorded score says the best stays).
//
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
const FLASHCARDS_SRC = readFileSync(resolve(repo, 'flashcards.js'), 'utf8');
const FLASHCARD_FLAGS_SRC = readFileSync(resolve(repo, 'lib/flashcard-flags.js'), 'utf8');
const REAL_SLICES = JSON.parse(readFileSync(resolve(repo, 'data/blooket-deck-slices.json'), 'utf8'));
// The sheet's note when a run is not a new best. True for a tie as well as a lower run (it
// used to claim "a higher one is already recorded" when the run had only tied the best).
const KEPT_BEST = 'Kept your best score — this run didn’t beat it.';

describe('mobile-home — native flashcards wiring (static)', () => {
  it('loads the shared engine + the gradebook feeder (+ offline queue)', () => {
    for (const s of ['flashcards.js', 'gradebook-client.js', 'offline-queue.js']) {
      expect(HOME, `missing <script src="${s}">`).toContain(`src="${s}"`);
    }
    expect(HOME).toContain('src="lib/flashcard-flags.js" onerror=""');
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
    // Re-pinned 2026-11-07 (FLASHCARD_DECK_SLICES_SPEC.md D3): a run dealt from a per-day
    // slice passes perDay, which turns the suffix into DESK_DAY.
    expect(HOME).toContain("source: 'worksheet'");
    expect(HOME).toContain('FC.blooketItemId(topic, perDay)');
    expect(HOME).toContain("response: { selfAttest: 'blooket' }");
    // Re-pinned 2026-11-07 (Codex review, defect 2): every finished run records its row (the
    // server keeps each item's best); the floor decides only the "your best stays" note.
    const commit = inlineFunctionSource('_fcCommit');
    expect(commit.indexOf('window.gradebookClient.record({')).toBeGreaterThan(-1);
    expect(commit.indexOf('if (score > floor) return res;')).toBeGreaterThan(commit.indexOf('window.gradebookClient.record({'));
    expect(commit).toContain('return { skipped: true, floor: floor };');
    expect(commit).not.toContain('if (!(score > floor)) return { skipped: true');
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

const THREE_CHOICE_CSV = [
  '"Blooket","Import Template"',
  'Question #,Question Text,Answer 1,Answer 2,Answer 3,Answer 4,Time,Correct',
  '1,"Permuted question","wrong zero","wrong one","right two",,20,3',
].join('\n');

const PERMUTATION_FLAGS = {
  version: 1,
  flags: {
    choicePermutation: {
      enabled: true,
      allowUsernames: [],
      allowSections: [],
      urlParam: 'fcPerm',
      killSwitchKey: 'apstats_fc_perm_off',
    },
  },
};

function bootLauncher({
  gradeBlooket,
  indexMissing,
  deckCsv = ONE_CARD_CSV,
  legacyEmail,
  flagsData,
  flagsFetchFails,
  forcedPermutation,
  permutationOff,
  lesson = { id: '4.1-2', unit: 4, label: 'Sampling', worksheet: 'u4_lesson1-2_live.html', quiz: null, blooket: 'https://b', videos: [] },
  slicesData = REAL_SLICES,
  oldEngine = false,
  gradeTopic = '4.1-2',   // the lesson the /grade payload's Blooket score belongs to
  clock = null,           // a fakeClock(): the page's Date.now and card timer run on it
  slicesFailures = 0,     // the first n slices fetches answer 503
  holdDeck = false,       // deck CSV fetches wait for releaseDeck()
}) {
  const recorded = [];
  const fetched = [];     // every URL the page fetched, in order
  const heldDecks = [];
  // The published fallback source: roadmap-data.json (absolute GH-Pages URLs).
  const roadmap = { lessons: { '4.1-2': { topic: 'Sampling', urls: { worksheet: 'https://robjohncolson.github.io/apstats-live-worksheet/u4_lesson1-2_live.html', quiz: null, blooket: 'https://b' } } } };
  const gradePayload = { ok: true, quarters: [], lessons: [{ topic: gradeTopic, lessonGrade: 55, blooket: gradeBlooket }] };
  const fakeFetch = (url) => {
    const u = String(url);
    fetched.push(u);
    if (u.indexOf('blooket-deck-slices.json') >= 0 && slicesFailures > 0) {
      slicesFailures -= 1;
      return Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve(null), text: () => Promise.resolve('') });
    }
    if (holdDeck && u.indexOf('_blooket.csv') >= 0) {
      return new Promise((done) => {
        heldDecks.push(() => done({ ok: true, status: 200, json: () => Promise.resolve(null), text: () => Promise.resolve(deckCsv) }));
      });
    }
    if (u.indexOf('flashcard-flags.json') >= 0) {
      if (flagsFetchFails) return Promise.reject(new Error('flags unavailable'));
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(flagsData || null),
        text: () => Promise.resolve(''),
      });
    }
    if (indexMissing && u.indexOf('lessons-index.json') >= 0) {
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve(null), text: () => Promise.resolve('') });
    }
    const body = u.indexOf('lessons-index.json') >= 0 ? { lessons: [lesson] }
      : u.indexOf('roadmap-data.json') >= 0 ? roadmap
      : u.indexOf('/grade') >= 0 ? gradePayload
      : u.indexOf('blooket-difficulty.json') >= 0 ? { tags: {} }
      : u.indexOf('blooket-deck-slices.json') >= 0 ? slicesData
      : null;
    const text = u.indexOf('_blooket.csv') >= 0 ? deckCsv : '';
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve(text) });
  };
  const dom = new JSDOM(HOME, {
    runScripts: 'dangerously',
    url: 'https://x.test/mobile-home.html',
    beforeParse(window) {
      window.eval(CED_SOURCE);
      if (clock) {
        window.Date.now = clock.now;
        window.setInterval = clock.setInterval;
        window.clearInterval = clock.clearInterval;
      }
      if (permutationOff) {
        window.localStorage.setItem('apstats_fc_perm_off', '1');
      }
      if (typeof legacyEmail === 'string') {
        window.localStorage.setItem('apstats_desk_student_email', legacyEmail);
      }
      window.eval(FLASHCARDS_SRC);                       // window.Flashcards
      if (oldEngine) {                                   // a pre-2026-11-07 cached flashcards.js
        for (const name of ['DECK_CARDS', 'sliceRanges', 'cardsInRanges', 'dealDeck', 'resumeRemaining', 'savedRoundOk']) {
          delete window.Flashcards[name];
        }
      }
      window.eval(FLASHCARD_FLAGS_SRC);                  // window.FlashcardFlags
      if (Array.isArray(forcedPermutation)) {
        window.Flashcards.permutationFor = (_seed, n) => forcedPermutation.slice(0, n);
      }
      window.fetch = fakeFetch;
      window.ROSTER_SERVICE_URL = 'https://api.test';
      window.rosterClient = { current: () => ({ username: 'kid' }), token: () => 'tok' };
      window.gradebookClient = { record: (a) => { recorded.push(a); return { ok: true, ledgerId: 'L1' }; } };
    },
  });
  const releaseDeck = () => heldDecks.splice(0).forEach((go) => go());
  return { dom, win: dom.window, recorded, fetched, releaseDeck };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
async function flush(n = 6) { for (let i = 0; i < n; i++) await tick(); }

async function finishOneCardFullDeck(win) {
  win.document.querySelector('.btn.fc').click();
  await flush(2);
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

  it('timed mode: a miss does NOT reveal the correct answer (T3.4 Desk parity) and says it will come back', async () => {
    const { dom, win } = bootLauncher({ gradeBlooket: 40 });
    await flush();

    win.document.querySelector('.btn.fc').click();
    await flush(2);
    await flush();

    const wrong = win.document.querySelector('#fc-choices .fc-choice[data-i="0"]');
    const correct = win.document.querySelector('#fc-choices .fc-choice[data-i="1"]');
    expect(wrong && correct, 'card did not render').toBeTruthy();
    wrong.click();
    await flush(1);

    expect(wrong.classList.contains('wrong')).toBe(true);
    expect(correct.classList.contains('right')).toBe(false);
    expect(win.document.getElementById('fc-feedback').textContent).toMatch(/come back/);
    dom.window.close();
  });

  // RETIRED 2026-09-13: quick mode is unreachable from the launcher (full timed deck only).
  it.skip('the 🃏 button opens the full timed deck directly — no mode picker, no quick check', async () => {
    const { dom, win } = bootLauncher({ gradeBlooket: 40 });
    await flush();

    win.document.querySelector('.btn.fc').click();
    await flush(4);

    expect(win.document.getElementById('fc-mode-quick')).toBeNull();
    expect(win.document.getElementById('fc-mode-full')).toBeNull();
    expect(win.document.querySelector('#fc-choices .fc-choice'), 'timed deck card did not render').toBeTruthy();
    expect(win.document.getElementById('fco').classList.contains('timed')).toBe(true);
    dom.window.close();
  });

  // Re-pinned 2026-11-07 (Codex review, defect 2): the run's row is no longer dropped. The
  // server keeps each item's best, so sending it can only add credit; the sheet still says
  // the recorded best stays.
  // Re-pinned 2026-11-07 (Opus verifier): this run TIES the recorded 100, so the note must not
  // claim that a higher score is already recorded.
  it('best-wins: a run that cannot beat the recorded score still sends its row, and the sheet keeps the best', async () => {
    const { dom, win, recorded } = bootLauncher({ gradeBlooket: 100 });   // already maxed
    await flush();

    win.document.querySelector('.btn.fc').click();
    await flush(2);
    await flush();
    win.document.querySelector('#fc-choices .fc-choice[data-i="1"]').click();
    await flush(1);
    win.document.getElementById('fc-next').click();
    await flush(2);

    expect(recorded).toHaveLength(1);                               // 100 !> 100: sent, the server floors it
    expect(recorded[0]).toMatchObject({ itemId: 'BL-U4-L1-2-DESK_DONE', topic: '4.1-2', score: 100 });
    expect(win.document.querySelector('.fc-result p').textContent).toBe(KEPT_BEST);
    expect(win.document.querySelector('.fc-result p').textContent).not.toMatch(/higher|80%|done|credit|pass/i);
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

describe('mobile-home — choice permutation flags and keyboard', () => {
  it('maps the first displayed slot to its real choice for scoring and highlighting', async () => {
    const { dom, win, recorded } = bootLauncher({
      gradeBlooket: 40,
      deckCsv: THREE_CHOICE_CSV,
      flagsData: PERMUTATION_FLAGS,
      forcedPermutation: [2, 0, 1],
    });
    await flush();

    win.document.querySelector('.btn.fc').click();
    await flush(2);
    await flush();

    const choices = Array.from(win.document.querySelectorAll('#fc-choices .fc-choice'));
    expect(choices.map((button) => Number(button.getAttribute('data-i')))).toEqual([2, 0, 1]);

    win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: '1', bubbles: true }));

    const entries = JSON.parse(win.localStorage.getItem('apstats_srs_log_kid@roster.local'));
    expect(entries[0].chosenIdx).toBe(2);
    expect(win.document.querySelector('.fc-choice[data-i="2"]').classList.contains('right')).toBe(true);

    win.document.getElementById('fc-next').click();
    await flush(3);

    expect(recorded).toHaveLength(1);
    expect(recorded[0].score).toBe(100);
    dom.window.close();
  });

  it('fails closed to identity order when the flags fetch fails', async () => {
    const { dom, win } = bootLauncher({
      gradeBlooket: 40,
      deckCsv: THREE_CHOICE_CSV,
      flagsFetchFails: true,
      forcedPermutation: [2, 0, 1],
    });
    await flush();

    win.document.querySelector('.btn.fc').click();
    await flush(2);
    await flush();

    const choices = Array.from(win.document.querySelectorAll('#fc-choices .fc-choice'));
    expect(choices.map((button) => Number(button.getAttribute('data-i')))).toEqual([0, 1, 2]);
    dom.window.close();
  });

  it('honors the choice permutation kill switch with identity order', async () => {
    const { dom, win } = bootLauncher({
      gradeBlooket: 40,
      deckCsv: THREE_CHOICE_CSV,
      flagsData: PERMUTATION_FLAGS,
      forcedPermutation: [2, 0, 1],
      permutationOff: true,
    });
    await flush();

    win.document.querySelector('.btn.fc').click();
    await flush(2);
    await flush();

    const choices = Array.from(win.document.querySelectorAll('#fc-choices .fc-choice'));
    expect(choices.map((button) => Number(button.getAttribute('data-i')))).toEqual([0, 1, 2]);
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

  it('flashcard student copy says the score IS the Blooket grade (no pass mark, no unlock)', () => {
    // Teacher 2026-10-12: "80% counts as done" was the summer unlock rule and misled
    // students into stopping at 80. The deck's best score is the grade, point for point.
    const start = HOME.indexOf('// ── Native flashcards');
    const end = HOME.indexOf('// Cached grade', start);
    const flashcardsBlock = HOME.slice(start, end);
    expect(flashcardsBlock).toContain('your Blooket grade for the lesson, point for point');
    expect(flashcardsBlock).not.toMatch(/half of Done|Reach 80%|Passed!/);
    expect(flashcardsBlock).not.toMatch(/lesson unlocked|to unlock|enough to unlock/i);
  });
});

describe('mobile-home — per-card logging, recap, and quick resume', () => {
  it('wires the mobile SRS key and roster-local email into quick answer logging', () => {
    expect(HOME).toContain('function _fcSrsAppend(');
    expect(HOME).toContain('function _fcEmail(');
    expect(HOME).toContain("'apstats_srs_log_' + email");
    expect(HOME).toContain("username + '@roster.local'");

    const resolveAnswer = inlineFunctionSource('_fcResolve');
    expect(resolveAnswer).toContain('_fcSrsAppend([');
    expect(resolveAnswer).toContain("mode: 'quick'");
  });

  // RETIRED 2026-09-13: quick mode is unreachable from the launcher (full timed deck only).
  it.skip('mirrors the Desk legacy email key for both SRS logging and quick resume', async () => {
    const { dom, win } = bootLauncher({ gradeBlooket: 40, legacyEmail: 'kid' });
    await flush();

    // _fcEmail lives inside the launcher IIFE — the storage keys below prove its result.
    win.document.querySelector('.btn.fc').click();
    await flush(2);
    win.document.getElementById('fc-mode-quick').click();
    await flush();
    win.document.querySelector('#fc-choices .fc-choice[data-i="1"]').click();

    expect(win.localStorage.getItem('apstats_srs_log_kid')).not.toBeNull();
    expect(win.localStorage.getItem('apstats_desk_bf_progress_kid')).not.toBeNull();
    expect(win.localStorage.getItem('apstats_srs_log_kid@roster.local')).toBeNull();
    expect(win.localStorage.getItem('apstats_desk_bf_progress_kid@roster.local')).toBeNull();
    dom.window.close();
  });

  // RETIRED 2026-09-13: quick mode is unreachable from the launcher (full timed deck only).
  it.skip('falls back to username@roster.local when the Desk legacy email key is absent', async () => {
    const { dom, win } = bootLauncher({ gradeBlooket: 40 });
    await flush();

    expect(win.localStorage.getItem('apstats_desk_student_email')).toBeNull();
    // (derivation proven by the resume key below)
    win.document.querySelector('.btn.fc').click();
    await flush(2);
    win.document.getElementById('fc-mode-quick').click();
    await flush();

    expect(win.localStorage.getItem('apstats_desk_bf_progress_kid@roster.local')).not.toBeNull();
    dom.window.close();
  });

  it('guards mobile storage writers and lets isolated SRS append omit _fcEmail', () => {
    const guard = "if (typeof _viewAsContext === 'function' && _viewAsContext()) return;\n    if (typeof window !== 'undefined' && window.__WS_READ_ONLY__) return;";
    for (const name of ['_fcSrsAppend', '_fcSaveQuickProgress', '_fcClearQuickProgress', '_fcSaveFullProgress', '_fcClearFullProgress']) {
      const source = inlineFunctionSource(name);
      expect(source).toContain(guard);
      expect(source).toContain("typeof _fcEmail === 'function' ? _fcEmail() : null");
    }

    const append = Function(`return (${inlineFunctionSource('_fcSrsAppend')});`)();
    expect(() => append([{ qnum: 1 }])).not.toThrow();
  });

  // RETIRED 2026-09-13: quick mode is unreachable from the launcher (full timed deck only).
  it.skip('writes every §3 field after a quick answer', async () => {
    const { dom, win } = bootLauncher({ gradeBlooket: 40 });
    await flush();

    win.document.querySelector('.btn.fc').click();
    await flush(2);
    win.document.getElementById('fc-mode-quick').click();
    await flush();
    win.document.querySelector('#fc-choices .fc-choice[data-i="1"]').click();

    const entries = JSON.parse(win.localStorage.getItem('apstats_srs_log_kid@roster.local'));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      topic: '4.1-2', qnum: 1, correct: true, wasTimeout: false, missIndex: 0,
      mode: 'quick', csv: 'u4_l1_l2_blooket.csv', surface: 'mobile', seq: 0,
      nChoices: 4, chosenIdx: 1,
    });
    expect(entries[0].latencyMs).toEqual(expect.any(Number));
    expect(entries[0].ts).toEqual(expect.any(Number));
    expect(entries[0].roundId).toMatch(/^mobile-\d+-[0-9a-z]{4}$/);
    expect(entries[0].stemHash).toMatch(/^[0-9a-f]{8}$/);
    dom.window.close();
  });

  // RETIRED 2026-09-13: quick mode is unreachable from the launcher (full timed deck only).
  it.skip('resumes after an answered quick card at the following index', async () => {
    const { dom, win } = bootLauncher({ gradeBlooket: 40 });
    await flush();
    const deck = Array.from({ length: 10 }, (_, i) => ({
      qnum: i + 1, q: `Question ${i + 1}`, choices: ['no', 'yes'], correctIdx: 1,
    }));
    win.localStorage.setItem('apstats_desk_bf_progress_kid@roster.local', JSON.stringify({
      '4.1-2': { deck, idx: 2, score: 2, answered: true, ts: 'now' },
    }));

    win.document.querySelector('.btn.fc').click();
    await flush(2);
    win.document.getElementById('fc-mode-quick').click();

    expect(win.document.getElementById('fc-title').textContent).toContain('(resuming)');
    expect(win.document.getElementById('fc-prog').textContent).toContain('4 / 10');
    expect(win.document.querySelector('.fc-q').textContent).toBe('Question 4');
    dom.window.close();
  });

  // RETIRED 2026-09-13: quick mode is unreachable from the launcher (full timed deck only).
  it.skip('finishes an answered saved round immediately when its score is already 80%', async () => {
    const { dom, win, recorded } = bootLauncher({ gradeBlooket: 40 });
    await flush();
    const deck = Array.from({ length: 10 }, (_, i) => ({
      qnum: i + 1, q: `Question ${i + 1}`, choices: ['no', 'yes'], correctIdx: 1,
    }));
    win.localStorage.setItem('apstats_desk_bf_progress_kid@roster.local', JSON.stringify({
      '4.1-2': { deck, idx: 7, score: 8, answered: true, ts: 'now' },
    }));

    win.document.querySelector('.btn.fc').click();
    await flush(2);
    win.document.getElementById('fc-mode-quick').click();
    await flush(3);

    expect(win.document.querySelector('.fc-score').textContent).toContain('80');
    expect(recorded).toHaveLength(1);
    expect(recorded[0].score).toBe(80);
    const progress = JSON.parse(win.localStorage.getItem('apstats_desk_bf_progress_kid@roster.local'));
    expect(progress['4.1-2']).toBeUndefined();
    dom.window.close();
  });

  // RETIRED 2026-09-13: quick mode is unreachable from the launcher (full timed deck only).
  it.skip('replaces a foreign Desk round id, resets seq, and persists the mobile round', async () => {
    const { dom, win } = bootLauncher({ gradeBlooket: 40 });
    await flush();
    const deck = Array.from({ length: 10 }, (_, i) => ({
      qnum: i + 1, q: `Question ${i + 1}`, choices: ['no', 'yes'], correctIdx: 1,
    }));
    win.localStorage.setItem('apstats_desk_bf_progress_kid@roster.local', JSON.stringify({
      '4.1-2': { deck, idx: 2, score: 2, answered: false, roundId: 'desk-1000-abcd', seq: 7, ts: 'now' },
    }));

    win.document.querySelector('.btn.fc').click();
    await flush(2);
    win.document.getElementById('fc-mode-quick').click();

    const progress = JSON.parse(win.localStorage.getItem('apstats_desk_bf_progress_kid@roster.local'));
    expect(progress['4.1-2'].roundId).toMatch(/^mobile-\d+-[0-9a-z]{4}$/);
    expect(progress['4.1-2'].roundId).not.toBe('desk-1000-abcd');
    expect(progress['4.1-2'].seq).toBe(0);
    dom.window.close();
  });

  // RETIRED 2026-09-13: quick mode is unreachable from the launcher (full timed deck only).
  it.skip('keeps round id and seq when resuming a mobile round', async () => {
    const { dom, win } = bootLauncher({ gradeBlooket: 40 });
    await flush();
    const deck = Array.from({ length: 10 }, (_, i) => ({
      qnum: i + 1, q: `Question ${i + 1}`, choices: ['no', 'yes'], correctIdx: 1,
    }));
    win.localStorage.setItem('apstats_desk_bf_progress_kid@roster.local', JSON.stringify({
      '4.1-2': { deck, idx: 2, score: 2, answered: false, roundId: 'mobile-1000-abcd', seq: 7, ts: 'now' },
    }));

    win.document.querySelector('.btn.fc').click();
    await flush(2);
    win.document.getElementById('fc-mode-quick').click();
    win.document.querySelector('#fc-choices .fc-choice[data-i="1"]').click();

    const entries = JSON.parse(win.localStorage.getItem('apstats_srs_log_kid@roster.local'));
    expect(entries[0].roundId).toBe('mobile-1000-abcd');
    expect(entries[0].seq).toBe(7);
    dom.window.close();
  });

  // RETIRED 2026-09-13: quick mode is unreachable from the launcher (full timed deck only).
  it.skip('normalizes legacy resumed miss stems into q for recap rendering', async () => {
    const { dom, win } = bootLauncher({ gradeBlooket: 40 });
    await flush();
    const deck = Array.from({ length: 10 }, (_, i) => ({
      qnum: i + 1, q: `Question ${i + 1}`, choices: ['no', 'yes'], correctIdx: 1,
    }));
    win.localStorage.setItem('apstats_desk_bf_progress_kid@roster.local', JSON.stringify({
      '4.1-2': {
        deck, idx: 7, score: 8, answered: true, roundId: 'mobile-1000-abcd', seq: 3, ts: 'now',
        misses: [{ qnum: 2, stem: 'Legacy missed stem', correctAnswer: 'yes' }],
      },
    }));

    win.document.querySelector('.btn.fc').click();
    await flush(2);
    win.document.getElementById('fc-mode-quick').click();
    await flush(3);

    expect(win.document.querySelector('.fc-recap').textContent).toContain('Legacy missed stem');
    dom.window.close();
  });

  // RETIRED 2026-09-13: quick mode is unreachable from the launcher (full timed deck only).
  it.skip('renders both missed stems and correct answers in the result recap', async () => {
    const twoCardCsv = [
      '"Blooket","Import Template"',
      'Question #,Question Text,Answer 1,Answer 2,Answer 3,Answer 4,Time,Correct',
      '1,"First missed stem","wrong one","right one",,,20,2',
      '2,"Second missed stem","wrong two","right two",,,20,2',
    ].join('\n');
    const { dom, win } = bootLauncher({ gradeBlooket: 40, deckCsv: twoCardCsv });
    await flush();

    win.document.querySelector('.btn.fc').click();
    await flush(2);
    win.document.getElementById('fc-mode-quick').click();
    await flush();
    win.document.querySelector('#fc-choices .fc-choice[data-i="0"]').click();
    win.document.getElementById('fc-next').click();
    win.document.querySelector('#fc-choices .fc-choice[data-i="0"]').click();
    win.document.getElementById('fc-next').click();
    await flush(3);

    const recap = win.document.querySelector('.fc-recap').textContent;
    expect(recap).toContain('Review your misses');
    expect(recap).toContain('First missed stem');
    expect(recap).toContain('Answer: right one');
    expect(recap).toContain('Second missed stem');
    expect(recap).toContain('Answer: right two');
    const saved = JSON.parse(win.localStorage.getItem('apstats_desk_bf_progress_kid@roster.local'));
    // The quick deck is shuffled per attempt — locate the miss by qnum, not position.
    const firstMiss = saved['4.1-2'].misses.find(function (m) { return m.qnum === 1; });
    expect(firstMiss).toMatchObject({
      qnum: 1, q: 'First missed stem', correctAnswer: 'right one',
    });
    expect(firstMiss).not.toHaveProperty('stem');
    const links = Array.from(win.document.querySelectorAll('.fc-recap a'));
    expect(links).toHaveLength(2);
    const hrefs = links.map(function (a) { return a.getAttribute('href'); });
    expect(hrefs.some(function (h) { return h.indexOf('u4_lesson1-2_live.html#:~:text=First%20missed%20stem') !== -1; })).toBe(true);
    expect(hrefs.some(function (h) { return h.indexOf('u4_lesson1-2_live.html#:~:text=Second%20missed%20stem') !== -1; })).toBe(true);
    links.forEach(function (a) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener');
    });
    dom.window.close();
  });
});

// ── FLASHCARD_DECK_SLICES_SPEC.md: 30-card sittings, per-day slices, save & resume ──
const CSV_HEADER = ['"Blooket","Import Template"', 'Question #,Question Text,Answer 1,Answer 2,Answer 3,Answer 4,Time,Correct'];
function numberedCsv(qnums) {
  return CSV_HEADER.concat(qnums.map((n) => n + ',"Card ' + n + '","alpha","beta",,,20,2')).join('\n');   // correct = data-i="1"
}
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const LESSON_4_1 = { id: '4.1', unit: 4, label: 'Day one', worksheet: 'u4_lesson1-2_live.html', quiz: null, blooket: 'https://b', videos: [] };
const FULL_KEY = 'apstats_mobile_fc_full_kid@roster.local';
const savedFull = (win) => JSON.parse(win.localStorage.getItem(FULL_KEY) || '{}');

async function openDeck(win) {
  win.document.querySelector('.btn.fc').click();
  await flush(2);
  await flush();
}
async function answerCorrectAndNext(win) {
  win.document.querySelector('#fc-choices .fc-choice[data-i="1"]').click();
  await flush(1);
  win.document.getElementById('fc-next').click();
  await flush(4);
}
function storedRun(win, patch) {
  const deck = [1, 2].map((n) => ({ qnum: n, q: 'Saved card ' + n, choices: ['alpha', 'beta'], correctIdx: 1 }));
  const round = { deck, order: [0, 1], status: deck.map(() => ({ misses: 0, resolved: false, earned: 0 })), log: [], total: 2 };
  const entry = { v: 1, csv: 'u4_l1_l2_blooket.csv', perDay: false, roundId: 'mobile-1-abcd', round, cardStartMs: null, savedAt: win.Date.now() };
  win.localStorage.setItem(FULL_KEY, JSON.stringify({ '4.1-2': { ...entry, ...patch } }));
}

describe('mobile-home — 30-card sittings and per-day slices', () => {
  it('a sliced lesson deals only its own day and records BL-U4-L1-DESK_DAY', async () => {
    const { dom, win, recorded } = bootLauncher({ gradeBlooket: 40, lesson: LESSON_4_1, deckCsv: numberedCsv([1, 40]) });
    await flush();
    await openDeck(win);
    expect(win.document.querySelector('.fc-q').textContent).toBe('Card 1');   // Q#40 belongs to 4.2's slice
    expect(win.document.getElementById('fc-prog').textContent).toBe('1 left · 1 cards');
    await answerCorrectAndNext(win);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      source: 'worksheet', itemId: 'BL-U4-L1-DESK_DAY', unit: 'U4', topic: '4.1',
      response: { selfAttest: 'blooket' }, score: 100, attempt: 1,
    });
    dom.window.close();
  });

  it('the full deck is a sample of at most 30 cards from the pool, sliced or whole', async () => {
    const sliced = bootLauncher({ gradeBlooket: 40, lesson: LESSON_4_1, deckCsv: numberedCsv(range(1, 45)) });
    await flush();
    await openDeck(sliced.win);
    expect(sliced.win.document.getElementById('fc-prog').textContent).toBe('30 left · 30 cards');
    const dealt = savedFull(sliced.win)['4.1'].round.deck.map((card) => card.qnum);
    expect(new Set(dealt).size).toBe(30);
    expect(dealt.every((qnum) => qnum >= 1 && qnum <= 34)).toBe(true);        // 4.1's slice is Q#1-34
    expect(savedFull(sliced.win)['4.1'].perDay).toBe(true);
    sliced.dom.window.close();

    const whole = bootLauncher({ gradeBlooket: 40, deckCsv: numberedCsv(range(1, 45)) });   // '4.1-2' is not a slice key
    await flush();
    await openDeck(whole.win);
    expect(whole.win.document.getElementById('fc-prog').textContent).toBe('30 left · 30 cards');
    expect(savedFull(whole.win)['4.1-2'].perDay).toBe(false);
    whole.dom.window.close();
  });
});

describe('mobile-home — timed-deck save & resume', () => {
  it('a run saved between cards resumes after closeFlashcards; finishing clears it and records DESK_DONE', async () => {
    const { dom, win, recorded } = bootLauncher({ gradeBlooket: 40, deckCsv: numberedCsv([1, 2, 3]) });
    await flush();
    await openDeck(win);
    win.document.querySelector('#fc-choices .fc-choice[data-i="1"]').click();   // answered, Next not pressed
    await flush(1);
    const saved = savedFull(win)['4.1-2'];
    expect(saved).toMatchObject({ v: 1, csv: 'u4_l1_l2_blooket.csv', perDay: false, cardStartMs: null });
    expect(saved.round.order).toHaveLength(2);

    win.closeFlashcards();
    expect(savedFull(win)['4.1-2']).toBeTruthy();                             // closing keeps the save
    await openDeck(win);
    expect(win.document.getElementById('fc-title').textContent).toContain('(resuming)');
    expect(win.document.getElementById('fc-startover').hidden).toBe(false);
    expect(win.document.getElementById('fc-prog').textContent).toBe('2 left · 3 cards');
    expect(win.document.querySelector('.fc-q').textContent).toBe(saved.round.deck[saved.round.order[0]].q);

    await answerCorrectAndNext(win);
    await answerCorrectAndNext(win);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ itemId: 'BL-U4-L1-2-DESK_DONE', topic: '4.1-2', score: 100 });
    expect(savedFull(win)['4.1-2']).toBeUndefined();                          // finishing clears it
    expect(win.document.getElementById('fc-startover').hidden).toBe(true);
    dom.window.close();
  });

  it('a card left on screen keeps its wall clock: reopened 50 s later it is a timeout, nothing revealed', async () => {
    const { dom, win } = bootLauncher({ gradeBlooket: 40, deckCsv: numberedCsv([1, 2, 3]) });
    await flush();
    storedRun(win, { cardStartMs: win.Date.now() - 50_000 });
    await openDeck(win);
    expect(win.document.querySelector('.fc-q').textContent).toBe('Saved card 1');
    expect(win.document.getElementById('fc-feedback').textContent).toMatch(/Too slow/);
    expect(win.document.querySelector('#fc-choices .fc-choice.right')).toBeNull();
    const run = savedFull(win)['4.1-2'];
    expect(run.round.log[0]).toMatchObject({ qnum: 1, correct: false, wasTimeout: true, chosenIdx: -1 });
    expect(run.round.order).toEqual([1, 0]);                                  // re-queued to the back
    expect(run.cardStartMs).toBeNull();
    expect(run.roundId).toBe('mobile-1-abcd');
    const srs = JSON.parse(win.localStorage.getItem('apstats_srs_log_kid@roster.local'));
    expect(srs).toHaveLength(1);
    expect(srs[0]).toMatchObject({ wasTimeout: true, roundId: 'mobile-1-abcd', seq: 0, surface: 'mobile' });
    dom.window.close();
  });

  it('Start over drops the saved run and deals a fresh deck', async () => {
    const { dom, win, recorded } = bootLauncher({ gradeBlooket: 40, deckCsv: numberedCsv([1, 2, 3]) });
    await flush();
    storedRun(win, {});
    await openDeck(win);
    expect(win.document.getElementById('fc-title').textContent).toContain('(resuming)');
    win.document.getElementById('fc-startover').click();
    await flush(2);
    await flush();
    expect(win.document.getElementById('fc-title').textContent).not.toContain('(resuming)');
    expect(win.document.getElementById('fc-startover').hidden).toBe(true);
    expect(win.document.getElementById('fc-prog').textContent).toBe('3 left · 3 cards');
    const run = savedFull(win)['4.1-2'];
    expect(run.roundId).not.toBe('mobile-1-abcd');
    expect(run.round.log).toHaveLength(0);
    expect(recorded).toHaveLength(0);
    dom.window.close();
  });

  it('an older cached flashcards.js deals the whole deck exactly as before and records DESK_DONE', async () => {
    const { dom, win, recorded } = bootLauncher({ gradeBlooket: 40, lesson: LESSON_4_1, deckCsv: numberedCsv([1, 40]), oldEngine: true });
    await flush();
    await openDeck(win);
    expect(win.document.getElementById('fc-prog').textContent).toBe('2 left · 2 cards');   // no slice, no cap
    await answerCorrectAndNext(win);
    await answerCorrectAndNext(win);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ itemId: 'BL-U4-L1-DESK_DONE', topic: '4.1', score: 100 });
    dom.window.close();
  });

  it('a save for another CSV or older than 14 days is not resumed', async () => {
    for (const patch of [{ csv: 'u4_l1_blooket.csv' }, { savedAt: Date.now() - 15 * 24 * 60 * 60 * 1000 }]) {
      const { dom, win } = bootLauncher({ gradeBlooket: 40, deckCsv: numberedCsv([1, 2, 3]) });
      await flush();
      storedRun(win, patch);
      await openDeck(win);
      expect(win.document.getElementById('fc-title').textContent).not.toContain('(resuming)');
      expect(win.document.getElementById('fc-prog').textContent).toBe('3 left · 3 cards');
      dom.window.close();
    }
  });
});

// ── Codex review 2026-11-07, defect 1: the card clock is wall time ──
// A controllable clock for the sheet's card timer: Date.now and setInterval only move on
// advance(); jump() moves the time without a tick (a sleeping phone runs its timers late).
function fakeClock(startMs) {
  let now = startMs;
  let nextId = 1;
  const timers = new Map();
  function nextDue(limit) {
    let best = null;
    for (const [id, timer] of timers) {
      if (timer.at > limit) continue;
      if (!best || timer.at < best.timer.at) best = { id, timer };
    }
    return best;
  }
  return {
    now: () => now,
    setInterval: (fn, ms) => { const id = nextId++; timers.set(id, { fn, at: now + ms, every: ms }); return id; },
    clearInterval: (id) => { timers.delete(id); },
    advance(ms) {
      const end = now + ms;
      for (let due = nextDue(end); due; due = nextDue(end)) {
        now = due.timer.at;
        due.timer.at += due.timer.every;
        due.timer.fn();
      }
      now = end;
    },
    jump(ms) { now += ms; },
  };
}
const CLOCK_T0 = Date.parse('2026-11-16T14:00:00.000Z');
function frontCardOf(run) { return run.round.deck[run.round.order[0]]; }
// Reopening runs on promises only (fake fetch), so a few immediates settle it: 60 cycles of
// openDeck's setTimeout ticks would outlast the test timeout on Windows timer granularity.
const immediate = () => new Promise((done) => setImmediate(done));
async function reopenDeck(win) {
  win.document.querySelector('.btn.fc').click();
  for (let i = 0; i < 8; i += 1) await immediate();
}

describe('mobile-home — the timed card clock is wall time, whatever the closes and reopens', () => {
  it('60 close/reopen cycles 900 ms apart never restart the clock: the card times out 40 s after it first rendered', async () => {
    const clock = fakeClock(CLOCK_T0);
    const { dom, win } = bootLauncher({ gradeBlooket: 40, deckCsv: numberedCsv([1, 2, 3]), clock });
    await flush();
    await openDeck(win);
    const firstRenderAt = clock.now();
    const first = savedFull(win)['4.1-2'];
    const idx = first.round.order[0];
    expect(first.cardStartMs).toBe(firstRenderAt);

    let timedOutAt = null;
    for (let cycle = 0; cycle < 60; cycle += 1) {
      win.closeFlashcards();
      clock.advance(900);
      await reopenDeck(win);
      expect(win.document.querySelector('.fc-q'), 'cycle ' + cycle + ': the deck did not reopen').not.toBeNull();
      if (timedOutAt !== null) continue;
      const run = savedFull(win)['4.1-2'];
      if (run.round.log.length) { timedOutAt = clock.now(); continue; }
      expect(run.cardStartMs, 'cycle ' + cycle).toBe(firstRenderAt);      // the start never moves
    }

    expect(timedOutAt, 'the card never timed out').not.toBeNull();
    expect(timedOutAt - firstRenderAt).toBeGreaterThanOrEqual(40_000);
    expect(timedOutAt - firstRenderAt).toBeLessThanOrEqual(41_000);
    const run = savedFull(win)['4.1-2'];
    expect(run.round.log).toHaveLength(1);
    expect(run.round.log[0]).toMatchObject({
      qnum: first.round.deck[idx].qnum, correct: false, wasTimeout: true, chosenIdx: -1, latencyMs: 40_000,
    });
    expect(run.round.status[idx].misses).toBe(1);
    expect(run.round.order[run.round.order.length - 1]).toBe(idx);      // re-queued to the back
    dom.window.close();
  });

  it('reopened 10 s later the card shows 30 s, and an answer at 39.9 s is a normal answer', async () => {
    const clock = fakeClock(CLOCK_T0);
    const { dom, win } = bootLauncher({ gradeBlooket: 40, deckCsv: numberedCsv([1, 2, 3]), clock });
    await flush();
    await openDeck(win);
    const card = frontCardOf(savedFull(win)['4.1-2']);
    win.closeFlashcards();
    clock.advance(10_000);
    await openDeck(win);
    expect(win.document.querySelector('.fc-q').textContent).toBe(card.q);
    expect(win.document.getElementById('fc-timer-bar').style.width).toBe('75%');   // 30 of 40 s

    clock.advance(29_900);                                                         // 39.9 s since it first rendered
    expect(win.document.getElementById('fc-timer-bar').style.width).toBe('2.5%');  // 1 s left
    win.document.querySelector('#fc-choices .fc-choice[data-i="1"]').click();
    await flush(1);
    const run = savedFull(win)['4.1-2'];
    expect(run.round.log).toHaveLength(1);
    expect(run.round.log[0]).toMatchObject({ qnum: card.qnum, correct: true, wasTimeout: false, latencyMs: 39_900 });
    expect(win.document.getElementById('fc-feedback').textContent).toBe('✓ Correct');
    dom.window.close();
  });

  it('an answer that lands after the deadline (the tick ran late) is a timeout and gives nothing away', async () => {
    const clock = fakeClock(CLOCK_T0);
    const { dom, win } = bootLauncher({ gradeBlooket: 40, deckCsv: numberedCsv([1, 2, 3]), clock });
    await flush();
    await openDeck(win);
    const first = savedFull(win)['4.1-2'];
    const idx = first.round.order[0];
    win.closeFlashcards();
    clock.advance(10_000);
    await openDeck(win);
    expect(win.document.getElementById('fc-timer-bar').style.width).toBe('75%');

    clock.jump(30_100);                                                            // 40.1 s since it first rendered, no tick ran
    win.document.querySelector('#fc-choices .fc-choice[data-i="1"]').click();     // the right choice, too late
    await flush(1);
    const run = savedFull(win)['4.1-2'];
    expect(run.round.log).toHaveLength(1);
    expect(run.round.log[0]).toMatchObject({
      qnum: first.round.deck[idx].qnum, correct: false, wasTimeout: true, chosenIdx: -1, latencyMs: 40_000,
    });
    expect(run.round.status[idx]).toMatchObject({ misses: 1, resolved: false, earned: 0 });
    expect(run.round.order[run.round.order.length - 1]).toBe(idx);
    expect(win.document.querySelector('#fc-choices .fc-choice.right')).toBeNull();   // the right choice is not shown
    expect(win.document.querySelector('#fc-choices .fc-choice.wrong')).toBeNull();
    expect(win.document.getElementById('fc-feedback').textContent).toMatch(/Too slow/);
    dom.window.close();
  });
});

// ── Codex review 2026-11-07, defect 2: every finished run sends its own row ──
// Plays the open timed deck to its result: a card whose Q# is in `strike` is answered wrong
// every time it comes up (3 misses: out, 0 credit), every other card right.
async function playMobileDeck(win, strike = new Set()) {
  for (let guard = 0; guard < 100; guard += 1) {
    const question = win.document.querySelector('.fc-q');
    if (!question) break;                                                          // the result screen
    const qnum = Number(question.textContent.replace('Card ', ''));
    const pick = strike.has(qnum) ? '0' : '1';
    win.document.querySelector('#fc-choices .fc-choice[data-i="' + pick + '"]').click();
    win.document.getElementById('fc-next').click();
    for (let i = 0; i < 4; i += 1) await immediate();                              // the finish chain is promises only
  }
  for (let i = 0; i < 8; i += 1) await immediate();
}
const LESSON_4_7 = { id: '4.7', unit: 4, label: 'Day one', worksheet: 'u4_lesson7-8_live.html', quiz: null, blooket: 'https://b', videos: [] };

describe('mobile-home — every finished run sends its row; the sheet keeps the best', () => {
  it('a whole-deck run below the day deck shown for 4.7 records its DESK_DONE row, and the best stays', async () => {
    // The tile shows 100 from a day deck; the slices file does not load, so the run is dealt
    // from the whole CSV and records DESK_DONE, which also credits 4.8 on the server.
    const { dom, win, recorded } = bootLauncher({
      gradeBlooket: 100, gradeTopic: '4.7', lesson: LESSON_4_7, slicesData: null, deckCsv: numberedCsv(range(1, 10)),
    });
    await flush();
    await openDeck(win);
    expect(win.document.getElementById('fc-prog').textContent).toBe('10 left · 10 cards');
    await playMobileDeck(win, new Set([1]));                                       // 9 of 10 = 90%
    expect(recorded).toEqual([{
      source: 'worksheet', itemId: 'BL-U4-L7-DESK_DONE', unit: 'U4', topic: '4.7',
      response: { selfAttest: 'blooket' }, score: 90, attempt: 1,
    }]);
    expect(win.document.querySelector('.fc-result p').textContent).toBe(KEPT_BEST);

    // The floor is still the 100: a second run below it says the same and sends its own row.
    win.document.getElementById('fc-again').click();
    for (let i = 0; i < 8; i += 1) await immediate();
    await playMobileDeck(win, new Set([2]));
    expect(recorded.map((row) => [row.itemId, row.score])).toEqual([['BL-U4-L7-DESK_DONE', 90], ['BL-U4-L7-DESK_DONE', 90]]);
    expect(win.document.querySelector('.fc-result p').textContent).toBe(KEPT_BEST);
    dom.window.close();
  });

  it('a lower run of the same day deck still sends its DESK_DAY row (the server floors it)', async () => {
    const { dom, win, recorded } = bootLauncher({
      gradeBlooket: 100, gradeTopic: '4.7', lesson: LESSON_4_7, deckCsv: numberedCsv([...range(1, 10), 50]),   // Q#50 is 4.8's
    });
    await flush();
    await openDeck(win);
    expect(win.document.getElementById('fc-prog').textContent).toBe('10 left · 10 cards');
    await playMobileDeck(win, new Set([3, 4]));                                    // 8 of 10 = 80%
    expect(recorded).toEqual([{
      source: 'worksheet', itemId: 'BL-U4-L7-DESK_DAY', unit: 'U4', topic: '4.7',
      response: { selfAttest: 'blooket' }, score: 80, attempt: 1,
    }]);
    expect(win.document.querySelector('.fc-result p').textContent).toBe(KEPT_BEST);
    dom.window.close();
  });

  it('a new best still records and says so', async () => {
    const { dom, win, recorded } = bootLauncher({
      gradeBlooket: 50, gradeTopic: '4.7', lesson: LESSON_4_7, deckCsv: numberedCsv([...range(1, 10), 50]),
    });
    await flush();
    await openDeck(win);
    await playMobileDeck(win);
    expect(recorded.map((row) => [row.itemId, row.score])).toEqual([['BL-U4-L7-DESK_DAY', 100]]);
    expect(win.document.querySelector('.fc-result p').textContent).toContain('Recorded — this is your Blooket grade');
    dom.window.close();
  });
});

// ── Opus verifiers 2026-11-07: re-entry and a cached slices failure ──
// Counts the timed-run saves the page makes (localStorage writes of the run key).
function countFullSaves(win) {
  let saves = 0;
  const setItem = win.Storage.prototype.setItem;
  win.Storage.prototype.setItem = function (key, value) {
    if (key === FULL_KEY) saves += 1;
    return setItem.call(this, key, value);
  };
  return () => saves;
}
const deckFetches = (fetched) => fetched.filter((url) => url.indexOf('_blooket.csv') >= 0).length;
const slicesFetches = (fetched) => fetched.filter((url) => url.indexOf('blooket-deck-slices.json') >= 0).length;

// A double tap used to run _fcStart twice: the first deal saved its run, and the second found
// that save and titled the brand-new deck "(resuming)" with Start over showing.
describe('mobile-home — one start at a time', () => {
  it('two taps before the deck loads deal ONE deck, never say "(resuming)", and save once', async () => {
    const { dom, win, fetched } = bootLauncher({ gradeBlooket: 40, deckCsv: numberedCsv([1, 2, 3]) });
    await flush();
    const saves = countFullSaves(win);
    const button = win.document.querySelector('.btn.fc');
    button.click();                                                   // a double tap: both land before the CSV
    button.click();
    await flush(2);
    await flush();
    expect(deckFetches(fetched)).toBe(1);                             // the second start never ran
    expect(win.document.getElementById('fc-title').textContent).not.toContain('(resuming)');
    expect(win.document.getElementById('fc-startover').hidden).toBe(true);
    expect(win.document.getElementById('fc-prog').textContent).toBe('3 left · 3 cards');
    expect(saves()).toBe(1);
    const run = savedFull(win)['4.1-2'];
    expect(run.round.log).toHaveLength(0);

    // A third open after a close works as any reopen does: it resumes the saved run.
    win.closeFlashcards();
    await openDeck(win);
    expect(deckFetches(fetched)).toBe(2);
    expect(win.document.querySelector('.fc-q')).not.toBeNull();
    expect(win.document.getElementById('fc-title').textContent).toContain('(resuming)');
    expect(win.document.getElementById('fc-startover').hidden).toBe(false);
    expect(savedFull(win)['4.1-2'].roundId).toBe(run.roundId);
    dom.window.close();
  });

  it('closing while the deck loads cancels that open: reopened at once, it deals one deck, not "(resuming)"', async () => {
    const { dom, win, fetched, releaseDeck } = bootLauncher({ gradeBlooket: 40, deckCsv: numberedCsv([1, 2, 3]), holdDeck: true });
    await flush();
    const saves = countFullSaves(win);
    win.document.querySelector('.btn.fc').click();
    await flush(2);                                                   // its CSV is requested and held
    win.closeFlashcards();
    win.document.querySelector('.btn.fc').click();                    // opened again before the first load finished
    await flush(2);
    expect(deckFetches(fetched)).toBe(2);                             // the close released the first start
    releaseDeck();
    await flush(4);
    expect(win.document.querySelector('.fc-q')).not.toBeNull();
    expect(win.document.getElementById('fc-title').textContent).not.toContain('(resuming)');
    expect(win.document.getElementById('fc-startover').hidden).toBe(true);
    expect(saves()).toBe(1);
    expect(savedFull(win)['4.1-2'].round.log).toHaveLength(0);
    dom.window.close();
  });
});

// A failed slices fetch used to be cached ({}) for the session: every later deck was dealt
// whole and recorded DESK_DONE, which the server shares across a per-day group.
describe('mobile-home — a failed slices fetch is not cached', () => {
  const CSV_4_7_8 = numberedCsv(range(1, 78));
  const DAY_4_7 = REAL_SLICES.slices['u4_l7_l8_blooket.csv']['4.7'];
  const inDay = (qnum) => DAY_4_7.some(([lo, hi]) => qnum >= lo && qnum <= hi);

  it('the slices file fails once, then loads: the next 4.7 deck comes from its 44-card day pool and records DESK_DAY', async () => {
    expect(range(1, 78).filter(inDay)).toHaveLength(44);              // the fixture's 4.7 pool
    const { dom, win, recorded, fetched } = bootLauncher({
      gradeBlooket: 40, gradeTopic: '4.7', lesson: LESSON_4_7, deckCsv: CSV_4_7_8, slicesFailures: 1,
    });
    await flush();
    await openDeck(win);
    expect(savedFull(win)['4.7'].perDay).toBe(false);                 // this open had no slices: the whole CSV
    await playMobileDeck(win);
    expect(recorded.map((row) => row.itemId)).toEqual(['BL-U4-L7-DESK_DONE']);

    win.document.getElementById('fc-again').click();                  // ↻ Try again
    for (let i = 0; i < 8; i += 1) await immediate();
    expect(slicesFetches(fetched)).toBe(2);                           // the failure was not cached
    const run = savedFull(win)['4.7'];
    expect(run.perDay).toBe(true);
    expect(run.round.total).toBe(30);
    expect(run.round.deck.every((card) => inDay(card.qnum))).toBe(true);
    await playMobileDeck(win);
    expect(recorded.map((row) => row.itemId)).toEqual(['BL-U4-L7-DESK_DONE', 'BL-U4-L7-DESK_DAY']);
    dom.window.close();
  });

  it('a slices file that loaded stays cached: two opens fetch it once', async () => {
    const { dom, win, fetched } = bootLauncher({ gradeBlooket: 40, gradeTopic: '4.7', lesson: LESSON_4_7, deckCsv: CSV_4_7_8 });
    await flush();
    await openDeck(win);
    win.closeFlashcards();
    await openDeck(win);
    expect(deckFetches(fetched)).toBe(2);
    expect(slicesFetches(fetched)).toBe(1);
    expect(savedFull(win)['4.7'].perDay).toBe(true);
    dom.window.close();
  });
});
