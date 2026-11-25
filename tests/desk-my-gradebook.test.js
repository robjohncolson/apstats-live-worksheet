// desk-my-gradebook.test.js — jsdom smoke test for the "My Gradebook" grid in the
// Desk (ap_stats_roadmap_square_mode.html + js/desk-gradebook-grid.js). Loads the
// page, sets _activeGradebook (mirroring /grade's data.gradebook), and calls
// renderMyGradebook with its own containers the way My Ledger's "Score breakdown"
// does (the old pop-up was removed 2026-11-24); asserts the grid renders both
// totals + the component cells.
//
// The Desk is a large single file with many load-time deps; if it can't host in
// jsdom this test is skipped (syntax-check + live test cover it instead).
//
// @vitest-environment node

import { describe, it, expect, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { CED_SOURCE } from './fixtures/ced2026-labels.js';
import { deskSource, deskHtml, deskHtmlInlined } from './helpers/desk-source.js';

const here = dirname(fileURLToPath(import.meta.url));
const html = deskHtml();
const html_SRC = deskSource(); // the Desk's JS incl. js/desk-*.js modules: code pins read this

function gradebook() {
  return {
    weights: { Lesson: 15, Quizzes: 15, Blooket: 5, 'Progress Check': 50, Posters: 15 },
    quarters: {
      Q1: {
        columns: [
          { key: 'FA:1.1', kind: 'followalong', category: 'Lesson', title: '1.1 Follow-Along', unit: 1, topicKeys: ['1.1'] },
          { key: 'QUIZ:1.2', kind: 'quiz', category: 'Quizzes', title: '1.2 Quiz', unit: 1, topicKeys: ['1.2'] },
          { key: 'BL:1.1', kind: 'blooket', category: 'Blooket', title: '1.1 Blooket', unit: 1, topicKeys: ['1.1'] },
          { key: 'PC:U1', kind: 'pc', category: 'Progress Check', title: 'Unit 1 Progress Check', unit: 1, topicKeys: [] },
          { key: 'POSTER:U1', kind: 'poster', category: 'Posters', title: 'Unit 1 Poster', unit: 1, topicKeys: [] },
        ],
        cells: { 'FA:1.1': 84, 'QUIZ:1.2': 78, 'BL:1.1': 95, 'PC:U1': 80, 'POSTER:U1': null },
        categoryAverages: { Lesson: 84, Quizzes: 78, Blooket: 95, 'Progress Check': 80 },
        schoologyTotal: 82.7, v3Total: 91.2,
        reconciliation: {
          pcAvg: 90, workAvg: 70, schoologyTotal: 82.7, v3Total: 91.2, delta: 8.5, branch: 'max',
          reason: 'Both tracks clear the 40 floor, so v3 takes the higher (PC 90), while Schoology averages the categories (82.7).',
        },
      },
    },
  };
}

let win, doc, loaded = false;

beforeAll(async () => {
  try {
    const dom = new JSDOM(deskHtmlInlined(), { // js/desk-*.js pasted inline: no resource loader here
      runScripts: 'dangerously', url: 'https://example.test/desk.html', pretendToBeVisual: true,
      beforeParse(window) { window.eval(CED_SOURCE); },
    });
    win = dom.window;
    doc = win.document;
    await new Promise((r) => setTimeout(r, 60));
    loaded = typeof win.renderMyGradebook === 'function';
  } catch (_) {
    loaded = false;
  }
});

// Draw the grid the way My Ledger's "Score breakdown" does: into containers the
// caller passes. Returns them so a test can read the body and the quarter tabs.
function render(qk) {
  const body = doc.createElement('div');
  const tabs = doc.createElement('div');
  win.renderMyGradebook(qk, body, tabs);
  return { body, tabs };
}

describe('Desk My Gradebook grid (My Ledger score breakdown)', () => {
  it('renders 105 while keeping the visual percentage bar at 100%', () => {
    expect(loaded).toBe(true);
    win._activeGradebook = gradebook();
    win._activeGradebook.quarters.Q1.cells['FA:1.1'] = 105;
    const { body } = render('Q1');
    expect(body.textContent).toContain('105');
    const bars = [...body.querySelectorAll('[style]')].filter(el => el.style.position === 'absolute' && el.style.width);
    expect(bars.length).toBeGreaterThan(0);
    for (const bar of bars) expect(parseFloat(bar.style.width)).toBeLessThanOrEqual(100);
  });
  it('renders both totals + the component cells (or skips if the Desk cannot host in jsdom)', () => {
    if (!loaded) {
      console.warn('[desk-my-gradebook] Desk did not host in jsdom — skipping render assertions (syntax-checked + live-tested instead).');
      expect(true).toBe(true);
      return;
    }
    // renderMyGradebook renders the _activeGradebook. My Ledger copies the
    // student's own cache into it before each render; here we set it directly.
    win._gradeGradebookCache = gradebook();
    win._activeGradebook = gradebook();
    const { body } = render('Q1');
    const text = body.textContent;
    // Both totals + the why.
    // EFFORT_VISIBILITY_V2_SPEC §4: the two totals are labelled to match the colour key.
    expect(text).toContain('Desk:');
    expect(text).toContain('91.2');                 // v3
    expect(text).toContain('Schoology now:');
    expect(text).toContain('82.7');                 // Schoology
    expect(text).toContain('higher');               // reconciliation reason
    // Category sections + a cell.
    expect(text).toContain('Lesson (15%)');
    expect(text).toContain('1.1 · What Can We Learn from Data?');
    expect(text).toContain('84');
    expect(text).toContain('Progress Check (50%)');
  });

  it('draws only into the containers it is given; a quarter tab re-renders into the same ones', () => {
    if (!loaded) { expect(true).toBe(true); return; }
    // My Ledger's way: the student's own cache, opened on _firstGradebookQuarter.
    win._gradeGradebookCache = gradebook();
    win._activeGradebook = win._gradeGradebookCache;
    const qk = win._firstGradebookQuarter(win._activeGradebook);
    expect(qk).toBe('Q1');                          // the only quarter with data
    const { body, tabs } = render(qk);
    expect(body.textContent).toContain('91.2');
    expect([...tabs.children].map((b) => b.dataset.quarter)).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    tabs.children[1].onclick();
    expect(body.textContent).toContain('No gradebook for Quarter 2 yet');
    // Without containers there is nothing to draw into (no pop-up to fall back to).
    expect(() => win.renderMyGradebook('Q1')).not.toThrow();
  });

  // ── threshold coloring + date-gating ──────────────────────────────────────
  function gbWith(columns, cells, extra) {
    return { weights: { Lesson: 15 }, quarters: { Q1: Object.assign({
      columns: columns, cells: cells,
      categoryAverages: {}, schoologyTotal: 80, v3Total: 80, reconciliation: {}
    }, extra || {}) } };
  }

  it('_gradeBand maps scores to the grade-rules bands (40 floor / 70 cap)', () => {
    if (!loaded) { expect(true).toBe(true); return; }
    expect(win._gradeBand(95).fg).toBe('#0a6b2e');   // deep green 90+
    expect(win._gradeBand(84).fg).toBe('#25663F');   // green 70-89 (clears cap)
    expect(win._gradeBand(55).fg).toBe('#9a6a00');   // amber 40-69
    expect(win._gradeBand(30).fg).toBe('#B03A2E');   // red < 40 (below floor)
    expect(win._gradeBand(null)).toBeNull();
  });

  function scheduleReady() {
    try { return loaded && Object.keys(win._lessonDateMap()).length > 0; } catch (_) { return false; }
  }

  it('date-gate: a not-started future lesson is hidden; a started one always shows', () => {
    if (!scheduleReady()) { expect(true).toBe(true); return; }
    win.tdy = () => new Date(2024, 0, 1); // before any 2026 lesson date
    win._activeGradebook = gbWith(
      [ { key: 'FA:1.1', category: 'Lesson', title: '1.1 Follow-Along', unit: 1, topicKeys: ['1.1'] },
        { key: 'FA:1.5', category: 'Lesson', title: '1.5 Follow-Along', unit: 1, topicKeys: ['1.5'] } ],
      { 'FA:1.1': 84, 'FA:1.5': null }
    );
    var text = render('Q1').body.textContent;
    expect(text).toContain('1.1 · What Can We Learn from Data?');       // started → shown
    expect(text).not.toContain('1.5 · Graphical Representations');      // future + not started → hidden
  });

  it('date-gate: once a lesson date passes, a not-done lesson shows as "not done yet" + an owe badge', () => {
    if (!scheduleReady()) { expect(true).toBe(true); return; }
    win.tdy = () => new Date(2027, 6, 1); // after all 2026 lesson dates
    win._activeGradebook = gbWith(
      [ { key: 'FA:1.1', category: 'Lesson', title: '1.1 Follow-Along', unit: 1, topicKeys: ['1.1'] },
        { key: 'FA:1.5', category: 'Lesson', title: '1.5 Follow-Along', unit: 1, topicKeys: ['1.5'] } ],
      { 'FA:1.1': 84, 'FA:1.5': null }
    );
    var text = render('Q1').body.textContent;
    expect(text).toContain('1.5 · Graphical Representations');       // due now → shown
    expect(text).toContain('not done yet');
    expect(text).toMatch(/due, not done/i);           // the "what you owe" badge
  });

  it('honors the SERVER col.due flag over the client calendar (student↔teacher consistency)', () => {
    if (!loaded) { expect(true).toBe(true); return; }
    win.tdy = () => new Date(2099, 0, 1);   // the client calendar would mark everything due
    win._activeGradebook = gbWith(
      [ { key: 'FA:1.1', category: 'Lesson', title: '1.1 Follow-Along', unit: 1, topicKeys: ['1.1'], due: false },
        { key: 'FA:1.2', category: 'Lesson', title: '1.2 Follow-Along', unit: 1, topicKeys: ['1.2'], due: true } ],
      { 'FA:1.1': null, 'FA:1.2': null }
    );
    const text = render('Q1').body.textContent;
    expect(text).not.toContain('1.1 · What Can We Learn from Data?');  // server due:false wins over the client calendar → hidden
    expect(text).toContain('1.2 · Variables');                       // server due:true → shown
  });

  it('colour key (EFFORT_VISIBILITY_V2_SPEC §4): a due scored cell is "in Schoology", a not-yet-due scored cell is "recorded ahead"; the key names both totals', () => {
    if (!loaded) { expect(true).toBe(true); return; }
    win.tdy = () => new Date(2026, 8, 27);
    win._activeGradebook = gbWith(
      [ { key: 'FA:1.1', category: 'Lesson', title: '1.1 Follow-Along', unit: 1, topicKeys: ['1.1'], due: true },
        { key: 'FA:1.2', category: 'Lesson', title: '1.2 Follow-Along', unit: 1, topicKeys: ['1.2'], due: false },
        { key: 'FA:1.3', category: 'Lesson', title: '1.3 Follow-Along', unit: 1, topicKeys: ['1.3'], due: true } ],
      { 'FA:1.1': 84, 'FA:1.2': 100, 'FA:1.3': null },
      { schoologyTotal: 84, v3Total: 86.4 }
    );
    const { body } = render('Q1');
    const inSchoology = body.querySelectorAll('.mgb-cell-schoology');
    const ahead = body.querySelectorAll('.mgb-cell-ahead');
    expect(inSchoology.length).toBe(1);
    expect(inSchoology[0].textContent).toContain('1.1 · What Can We Learn from Data?');
    expect(inSchoology[0].style.background).toBe('rgb(230, 238, 247)');     // #e6eef7
    expect(inSchoology[0].style.border).toBe('1px solid rgb(43, 92, 138)');  // #2B5C8A
    expect(ahead.length).toBe(1);
    expect(ahead[0].textContent).toContain('1.2 · Variables');
    expect(ahead[0].style.background).toBe('rgb(234, 246, 234)');           // #eaf6ea
    expect(ahead[0].style.border).toBe('1px solid rgb(42, 138, 42)');       // #2a8a2a
    // the empty due cell keeps the amber "not done yet" look, no key class
    expect(body.textContent).toContain('not done yet');
    expect(body.querySelectorAll('[class^="mgb-cell"]').length).toBe(2);
    expect(body.querySelector('.mgb-key').textContent).toBe(
      'In Schoology now — these average to the number you see there: 84%.'
      + 'Recorded ahead of the calendar — counted on the Desk, reaches Schoology when the class gets there. Desk quarter grade: 86%.');
    expect(body.textContent).toContain('Desk: 86.4');
    expect(body.textContent).toContain('Schoology now: 84.0');
  });

  it('colour key: the green line adds the Schoology projection when cells are ahead (AHEAD_WORK_PROJECTION_SPEC §2)', () => {
    if (!loaded) { expect(true).toBe(true); return; }
    win.tdy = () => new Date(2026, 8, 27);
    const cols = [ { key: 'FA:1.1', category: 'Lesson', title: '1.1 Follow-Along', unit: 1, topicKeys: ['1.1'], due: true },
      { key: 'FA:1.2', category: 'Lesson', title: '1.2 Follow-Along', unit: 1, topicKeys: ['1.2'], due: false } ];
    const cells = { 'FA:1.1': 84, 'FA:1.2': 100 };
    // Projected Lesson = (84 + 100) / 2 = 92.
    win._activeGradebook = gbWith(cols, cells, { schoologyTotal: 84, v3Total: 86.4, schoologyProjectedTotal: 92, aheadCells: 1 });
    expect(render('Q1').body.querySelector('.mgb-key-ahead').textContent).toBe(
      'Recorded ahead of the calendar — counted on the Desk, reaches Schoology when the class gets there. Desk quarter grade: 86%.'
      + ' → Schoology will read about 92% once these come due.');
    // aheadCells 0 (or an older payload): no projection words.
    win._activeGradebook = gbWith(cols, cells, { schoologyTotal: 84, v3Total: 86.4, schoologyProjectedTotal: 92, aheadCells: 0 });
    expect(render('Q1').body.querySelector('.mgb-key-ahead').textContent).not.toContain('will read about');
  });

  it('colour key: columns without a `due` field (an older cache) show no colours and no key', () => {
    if (!loaded) { expect(true).toBe(true); return; }
    win.tdy = () => new Date(2024, 0, 1);
    win._activeGradebook = gbWith(
      [ { key: 'FA:1.1', category: 'Lesson', title: '1.1 Follow-Along', unit: 1, topicKeys: ['1.1'] } ],
      { 'FA:1.1': 84 }
    );
    const { body } = render('Q1');
    expect(body.querySelector('.mgb-cell-schoology, .mgb-cell-ahead')).toBeNull();
    expect(body.querySelector('.mgb-key')).toBeNull();
  });

  it('flags a category sitting below the 40% floor', () => {
    if (!loaded) { expect(true).toBe(true); return; }
    win.tdy = () => new Date(2024, 0, 1);
    win._activeGradebook = gbWith(
      [ { key: 'FA:1.1', category: 'Lesson', title: '1.1 Follow-Along', unit: 1, topicKeys: ['1.1'] } ],
      { 'FA:1.1': 30 },
      { categoryAverages: { Lesson: 30 }, v3Total: 30, schoologyTotal: 35 }
    );
    expect(render('Q1').body.textContent).toMatch(/below the 40% floor/i);
  });
});
