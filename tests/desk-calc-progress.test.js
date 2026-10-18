// @vitest-environment node
// APSTAT_PARK_TRAINER_ABSORB_2_SPEC §5: the Desk's Calculator Skills modal. Runs the REAL Desk
// functions (extracted from ap_stats_roadmap_square_mode.html) and the real overlay markup in
// jsdom, against a stubbed GET /park/calc/progress.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(resolve(repo, file), 'utf8');
const DESK = read('ap_stats_roadmap_square_mode.html');
const CED_SOURCE = read('js/ced2026-crosswalk.js') + '\n' + read('js/ced2026-labels.js');

function fnBody(name) {
  const match = new RegExp('function\\s+' + name + '\\s*\\(').exec(DESK);
  if (!match) throw new Error('Desk function not found: ' + name);
  let depth = 0;
  for (let i = DESK.indexOf('{', match.index); i < DESK.length; i++) {
    if (DESK[i] === '{') depth++;
    else if (DESK[i] === '}' && --depth === 0) return DESK.slice(match.index, i + 1);
  }
  throw new Error('Unbalanced Desk function: ' + name);
}

function varLine(name) {
  const match = new RegExp('var ' + name + ' = [^\\n]*').exec(DESK);
  if (!match) throw new Error('Desk var not found: ' + name);
  return match[0];
}

const OVERLAY_MARKUP = (() => {
  const start = DESK.indexOf('<div id="calc-progress-overlay"');
  const end = DESK.indexOf('<!-- ═══ Game Window (Study Break) ═══ -->', start);
  return DESK.slice(start, end);
})();

const PROGRESS_FUNCTIONS = ['_calcDueUrl', '_calcProgressUrl', '_calcProgressDate', '_calcProgressHasRecord',
  '_calcProgressChip', '_calcProgressUnitOf', '_calcProgressSummary', '_calcProgressMessage', '_calcProgressFilter',
  '_calcProgressRow', '_renderCalcProgress', '_openCalcProgress', 'closeCalcProgress'];
const PROGRESS_VARS = ['_calcProgressCache', '_calcProgressUnit', 'CALC_PROGRESS_MONTHS', 'CALC_PROGRESS_OFFLINE'];

const row = (over) => ({ skillId: 'x', title: 'X', topic: '1.7', unit: 1, eligible: true, clears: 0, rung: 0, repetitions: 0,
  intervalDays: 0, nextReview: null, lastQuality: null, mastered: false, due: false, overdueDays: 0, ...over });

// One row per chip, in the spec's order; topics are OLD storage keys (1.10 is CED 2.11, 3.3 is 1.11, 6.4 is 3.5).
const SKILLS = [
  row({ skillId: 'one-var-stats', title: '1-Var Stats', topic: '1.7', clears: 3, rung: 2, mastered: true, repetitions: 2, nextReview: '2026-10-24', lastQuality: 5 }),
  row({ skillId: 'normalcdf', title: 'normalcdf', topic: '1.10', clears: 1, rung: 1, due: true, overdueDays: 3, nextReview: '2026-10-13', lastQuality: 4 }),
  row({ skillId: 'invnorm', title: 'invNorm', topic: '1.10', clears: 1, rung: 1, due: true, overdueDays: 0, nextReview: '2026-10-16', lastQuality: 4 }),
  row({ skillId: 'histogram', title: 'Histogram', topic: '1.5', clears: 2, rung: 2, nextReview: '2026-10-30', lastQuality: 5 }),
  row({ skillId: 'dotplot', title: 'Dotplot', topic: '1.5', clears: 1, rung: 1 }),
  row({ skillId: 'randint-sampling', title: 'randInt sampling', topic: '3.3', unit: 1, lastQuality: 1, nextReview: '2026-10-17' }),
  row({ skillId: 'modified-boxplot', title: 'Modified boxplot', topic: '1.7' }),
  row({ skillId: 'one-propztest', title: '1-PropZTest', topic: '6.4', unit: 3, eligible: false }),
];

const opened = [];
afterEach(() => opened.splice(0).forEach((win) => win.close()));

function bootProgressDesk({ skills = SKILLS, signedIn = true, ok = true } = {}) {
  const dom = new JSDOM('<div id="board"></div>' + OVERLAY_MARKUP, { url: 'https://desk.test/ap_stats_roadmap_square_mode.html', runScripts: 'outside-only' });
  const win = dom.window;
  opened.push(win);
  win.eval(CED_SOURCE);
  win.RAILWAY_SERVER_URL = 'https://relay.test/';
  win.rosterClient = { current: () => (signedIn ? { section: 'PeriodB', username: 'alice' } : null) };
  win._openParkSolo = vi.fn();
  win.fetch = vi.fn(async () => ({ ok, json: async () => ({ ok, today: '2026-10-16', skills }) }));
  win.eval(PROGRESS_VARS.map(varLine).join('\n') + '\n' + PROGRESS_FUNCTIONS.map(fnBody).join('\n'));
  return win;
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const doc = (win) => win.document;
const chips = (win) => [...doc(win).querySelectorAll('.calc-progress-row')].map((r) => [r.getAttribute('data-skill'), r.querySelector('.calc-progress-chip').textContent]);

describe('Calculator Skills modal (Desk)', () => {
  it('fetches GET /park/calc/progress with the roster session and renders a chip per row in the spec order', async () => {
    const win = bootProgressDesk();
    win._openCalcProgress();
    expect(doc(win).getElementById('calc-progress-overlay').style.display).toBe('block');
    expect(win.fetch).toHaveBeenCalledWith('https://relay.test/park/calc/progress?section=PeriodB&username=alice');
    await flush();
    expect(Object.fromEntries(chips(win))).toEqual({
      'one-var-stats': 'MASTERED · review Oct 24',
      normalcdf: 'DUE · 3 days overdue',
      invnorm: 'DUE TODAY',
      histogram: 'NO HINTS',
      dotplot: 'GOALS ONLY',
      'randint-sampling': 'FULL HINTS',
      'modified-boxplot': 'NEW',
      'one-propztest': 'LOCKED',
    });
  });

  it('chip precedence: mastered beats due, due beats the rung, a record shows the rung, locked only without a record', () => {
    const win = bootProgressDesk();
    const chip = (over) => win._calcProgressChip(row(over)).text;
    expect(chip({ mastered: true, due: true, overdueDays: 4, nextReview: '2026-10-12' })).toBe('MASTERED · review Oct 12');
    expect(chip({ due: true, overdueDays: 1, rung: 2, clears: 5 })).toBe('DUE · 1 day overdue');
    expect(chip({ eligible: false, clears: 1, rung: 1 })).toBe('GOALS ONLY');
    expect(chip({ eligible: false, lastQuality: 3, nextReview: '2026-11-01' })).toBe('FULL HINTS');
    expect(chip({ eligible: false })).toBe('LOCKED');
    expect(chip({})).toBe('NEW');
  });

  it('header line counts mastered, due and new', async () => {
    const win = bootProgressDesk();
    win._openCalcProgress();
    await flush();
    expect(doc(win).getElementById('calc-progress-summary').textContent).toBe('1 mastered · 2 due · 1 new');
    expect(doc(win).getElementById('calc-progress-title').textContent).toBe('Calculator Skills');
  });

  it('groups rows by CED unit; the unit filter shows one unit, All shows every unit', async () => {
    const win = bootProgressDesk();
    win._openCalcProgress();
    await flush();
    const buttons = () => [...doc(win).querySelectorAll('#calc-progress-filter button')];
    expect(buttons().map((b) => b.textContent)).toEqual(['All', 'Unit 1', 'Unit 2', 'Unit 3']);
    const headings = () => [...doc(win).querySelectorAll('.calc-progress-unit')].map((h) => h.getAttribute('data-unit'));
    expect(headings()).toEqual(['1', '2', '3']);
    // Old key 3.3 is CED 1.11: grouped under Unit 1, not "Unit 3".
    const unitOneRows = () => [...doc(win).querySelectorAll('.calc-progress-row')].map((r) => r.getAttribute('data-skill'));
    buttons()[3].click();
    expect(headings()).toEqual(['3']);
    expect(unitOneRows()).toEqual(['one-propztest']);
    expect(buttons()[3].getAttribute('aria-pressed')).toBe('true');
    expect(doc(win).querySelector('.calc-progress-unit').textContent).toMatch(/^Unit 3 · /);
    buttons()[1].click();
    expect(unitOneRows()).toContain('randint-sampling');
    expect(unitOneRows()).not.toContain('one-propztest');
    expect(unitOneRows()).not.toContain('normalcdf');
    buttons()[0].click();
    expect(unitOneRows()).toHaveLength(SKILLS.length);
  });

  it('the Practice link closes the modal and opens the park solo room on that skill', async () => {
    const win = bootProgressDesk();
    win._openCalcProgress();
    await flush();
    const link = doc(win).querySelector('.calc-progress-row[data-skill="normalcdf"] .calc-progress-practice');
    expect(link.textContent).toBe('Practice');
    link.click();
    expect(win._openParkSolo).toHaveBeenCalledWith('&skill=normalcdf');
    expect(doc(win).getElementById('calc-progress-overlay').style.display).toBe('none');
  });

  it('caches the relay answer for 60 s', async () => {
    const win = bootProgressDesk();
    win._openCalcProgress();
    await flush();
    win.closeCalcProgress();
    win._openCalcProgress();
    expect(win.fetch).toHaveBeenCalledTimes(1);
    expect(chips(win)).toHaveLength(SKILLS.length);
    win._calcProgressCache.at = Date.now() - 61000;
    win._openCalcProgress();
    expect(win.fetch).toHaveBeenCalledTimes(2);
    await flush();
  });

  it('a loading answer (cold relay) is shown, never cached, filters still work, and it is fetched again', async () => {
    const win = bootProgressDesk();
    win.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, today: '2026-10-16', loading: true, skills: SKILLS }) }));
    win._openCalcProgress();
    await flush();
    const rows = () => [...doc(win).querySelectorAll('.calc-progress-row')];
    expect(rows()).toHaveLength(SKILLS.length);
    expect(win._calcProgressCache.data).toBeNull();
    const buttons = [...doc(win).querySelectorAll('#calc-progress-filter button')];
    buttons[3].click();
    expect(rows().map((r) => r.getAttribute('data-skill'))).toEqual(['one-propztest']);
    buttons[0].click();
    expect(rows()).toHaveLength(SKILLS.length);
    // A second open within the minute fetches again: nothing was cached.
    win._openCalcProgress();
    await flush();
    expect(win.fetch).toHaveBeenCalledTimes(2);
  });

  it('signed out: asks to sign in, no fetch; relay down: a plain retry message', async () => {
    const out = bootProgressDesk({ signedIn: false });
    out._openCalcProgress();
    expect(out.fetch).not.toHaveBeenCalled();
    expect(doc(out).getElementById('calc-progress-body').textContent).toBe('Sign in to see your calculator skills.');
    const down = bootProgressDesk({ ok: false });
    down._openCalcProgress();
    await flush();
    expect(doc(down).getElementById('calc-progress-body').textContent).toBe('Could not reach the park. Try again in a minute.');
  });
});

describe('Calculator Skills wiring (Desk source)', () => {
  it('Esc closes it through the content-modal net', () => {
    const net = fnBody('_escCloseTopModal');
    expect(net).toContain("'calc-progress-overlay': function () { if (typeof closeCalcProgress === 'function')     closeCalcProgress(); }");
  });

  it('entry points: a progress link beside every Calculator Skill row, and the Apps menu item', () => {
    const panel = fnBody('showResourcePanel');
    expect(panel).toMatch(/🖩 Calculator Skill<\/a>[^\n]*desk-calc-due-slot[^\n]*onclick="_openCalcProgress\(\);return false;"[^\n]*>progress<\/a>/);
    expect(DESK).toContain('id="menu-calc-progress" onclick="closeMenus();_openCalcProgress()"');
  });

  it('sits one tier above the day panel it is opened from', () => {
    expect(DESK).toContain('#calc-progress-overlay { z-index: 310; }');
  });
});
