/**
 * tests/worksheet-ledger-heal.test.js
 *
 * Part 1 (structural): verifies the LEDGER_HEAL_BUILD.md Part-A heal block was
 * wired into every u*_lesson*_live.html by scripts/wire-ledger-heal.mjs.
 * Part 2 (behavioral): extracts healLocalAnswersToLedger from the canonical
 * worksheet and runs it in jsdom with stubs to pin the re-record DECISION:
 *   record when missing / null-score / edited; skip when already scored; no-op
 *   when signed out.
 */

import { describe, it, expect, vi } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { JSDOM } from 'jsdom';
import { createContext, runInContext } from 'vm';

const ROOT = resolve(import.meta.dirname, '..');
const WORKSHEETS = readdirSync(ROOT)
  .filter((f) => /^u\d+_lesson.+_live\.html$/.test(f))
  .sort();

// ─── Part 1: structural rollout ──────────────────────────────────────────────

describe('worksheet-ledger-heal — file discovery', () => {
  it('finds the expected 69 worksheets', () => {
    expect(WORKSHEETS.length).toBe(69);
  });
});

describe.each(WORKSHEETS)('%s — heal block', (file) => {
  const html = readFileSync(resolve(ROOT, file), 'utf8');

  it('contains async function healLocalAnswersToLedger exactly once', () => {
    const m = html.match(/async function healLocalAnswersToLedger/g) || [];
    expect(m.length).toBe(1);
  });

  it('contains the _kickHeal trigger exactly once', () => {
    const m = html.match(/function _kickHeal/g) || [];
    expect(m.length).toBe(1);
  });

  it('heal block appears AFTER the hydration block', () => {
    const idxHyd = html.indexOf('function hydratePriorAnswers');
    const idxHeal = html.indexOf('function healLocalAnswersToLedger');
    expect(idxHyd).toBeGreaterThan(0);
    expect(idxHeal).toBeGreaterThan(idxHyd);
  });

  it('heal is gated on identity + reuses the worksheet feeder + dedup', () => {
    const idx = html.indexOf('async function healLocalAnswersToLedger');
    const body = html.slice(idx, idx + 1600);
    expect(body).toContain('rosterClient.token');           // signed-in gate
    expect(body).toContain('gbWsPrefix()');                 // same vocabulary as the feeder
    expect(body).toContain('fetchPrior');                   // dedup source
    expect(body).toContain('recordBlankToGradebook(blank)');// reuse correct scoring
  });

  it("skips ONLY rows already scored with a matching response", () => {
    const idx = html.indexOf('async function healLocalAnswersToLedger');
    const body = html.slice(idx, idx + 1600);
    // The skip guard must require BOTH a numeric score AND a matching response.
    expect(body).toMatch(/typeof entry\.score === 'number' && entry\.response === value/);
  });

  it('fires on DOMContentLoaded + storage signin (after hydration settles)', () => {
    const idx = html.indexOf('function _kickHeal');
    const body = html.slice(idx, idx + 600);
    expect(body).toContain('setTimeout(healLocalAnswersToLedger');
    expect(body).toContain("addEventListener('DOMContentLoaded', _kickHeal)");
    expect(body).toContain('apstats_roster.v1');
  });

  it('block has consistent EOL with the rest of the file', () => {
    const hasCRLF = html.indexOf('\r\n') >= 0;
    const hasLoneLF = /(?<!\r)\n/.test(html);
    expect(hasCRLF && hasLoneLF).toBe(false);
  });
});

// ─── Part 2: behavioral decision logic ───────────────────────────────────────

const CANON = resolve(ROOT, 'u1_lesson1_live.html');
const CANON_HTML = readFileSync(CANON, 'utf8');

function extractFn(src, name) {
  const re = new RegExp('async function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('fn not found: ' + name);
  const open = src.indexOf('{', m.index);
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced braces: ' + name);
}

function makeHeal({ blanks, prior, token }) {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'https://ws.test' });
  const win = dom.window;
  for (const b of blanks) {
    const el = win.document.createElement('input');
    el.className = 'blank';
    el.setAttribute('data-question-id', b.id);
    el.value = b.value;
    win.document.body.appendChild(el);
  }
  const recorded = [];
  win.recordBlankToGradebook = (blank) => recorded.push(blank.dataset.questionId);
  win.gbWsPrefix = () => 'WS-U1L1';
  win.rosterClient = { token: () => token };
  const priorMap = new Map((prior || []).map((p) => [p.id, { response: p.response, score: p.score }]));
  win.gradebookClient = { fetchPrior: vi.fn().mockResolvedValue(priorMap) };
  const ctx = createContext(win);
  runInContext(extractFn(CANON_HTML, 'healLocalAnswersToLedger') + '\nwindow.__heal = healLocalAnswersToLedger;', ctx);
  return { win, recorded, run: () => win.__heal() };
}

describe('healLocalAnswersToLedger — re-record decision', () => {
  it('records a filled blank that is MISSING from the ledger', async () => {
    const { recorded, run } = makeHeal({
      token: 'tok',
      blanks: [{ id: 'WS-U1L1-Q1', value: 'mean' }],
      prior: [],
    });
    await run();
    expect(recorded).toEqual(['WS-U1L1-Q1']);
  });

  it('SKIPS a blank already scored with a matching response', async () => {
    const { recorded, run } = makeHeal({
      token: 'tok',
      blanks: [{ id: 'WS-U1L1-Q1', value: 'mean' }],
      prior: [{ id: 'WS-U1L1-Q1', response: 'mean', score: 1 }],
    });
    await run();
    expect(recorded).toEqual([]);
  });

  it('RE-RECORDS a row that exists but has a null score (the undefined-score bug)', async () => {
    const { recorded, run } = makeHeal({
      token: 'tok',
      blanks: [{ id: 'WS-U1L1-Q1', value: 'mean' }],
      prior: [{ id: 'WS-U1L1-Q1', response: 'mean', score: null }],
    });
    await run();
    expect(recorded).toEqual(['WS-U1L1-Q1']);
  });

  it('RE-RECORDS an edited blank (response differs from the ledger)', async () => {
    const { recorded, run } = makeHeal({
      token: 'tok',
      blanks: [{ id: 'WS-U1L1-Q1', value: 'median' }],
      prior: [{ id: 'WS-U1L1-Q1', response: 'mean', score: 1 }],
    });
    await run();
    expect(recorded).toEqual(['WS-U1L1-Q1']);
  });

  it('ignores empty blanks', async () => {
    const { recorded, run } = makeHeal({
      token: 'tok',
      blanks: [{ id: 'WS-U1L1-Q1', value: '   ' }, { id: 'WS-U1L1-Q2', value: '' }],
      prior: [],
    });
    await run();
    expect(recorded).toEqual([]);
  });

  it('no-ops entirely when signed out (no token)', async () => {
    const { recorded, win, run } = makeHeal({
      token: null,
      blanks: [{ id: 'WS-U1L1-Q1', value: 'mean' }],
      prior: [],
    });
    await run();
    expect(recorded).toEqual([]);
    expect(win.gradebookClient.fetchPrior).not.toHaveBeenCalled();
  });

  it('mixed set: records missing + null-score + edited, skips scored + empty', async () => {
    const { recorded, run } = makeHeal({
      token: 'tok',
      blanks: [
        { id: 'WS-U1L1-Q1', value: 'a' },   // missing → record
        { id: 'WS-U1L1-Q2', value: 'b' },   // scored+match → skip
        { id: 'WS-U1L1-Q3', value: 'c' },   // null score → record
        { id: 'WS-U1L1-Q4', value: 'd2' },  // edited → record
        { id: 'WS-U1L1-Q5', value: '' },    // empty → skip
      ],
      prior: [
        { id: 'WS-U1L1-Q2', response: 'b', score: 1 },
        { id: 'WS-U1L1-Q3', response: 'c', score: null },
        { id: 'WS-U1L1-Q4', response: 'd', score: 1 },
      ],
    });
    await run();
    expect(recorded.sort()).toEqual(['WS-U1L1-Q1', 'WS-U1L1-Q3', 'WS-U1L1-Q4']);
  });
});
