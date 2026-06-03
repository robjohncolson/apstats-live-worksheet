/**
 * tests/ai-worksheet-grade.test.js
 *
 * Acceptance tests for AI_WORKSHEET_GRADING_BUILD.md — the AI worksheet-grading
 * client flow injected by scripts/wire-ai-worksheet-grade.mjs.
 *
 * Three layers:
 *   1. Behavioral — RUNS the real shipped INJECTED_JS in jsdom with mocked
 *      worksheet globals, then drives window.aiGradeWorksheet and asserts the
 *      load-bearing guarantees (upgrade-only, never-downgrade, dedup, single-
 *      flight, soft-fail, batched-call, FRQ fold).
 *   2. Static-parse — pins the invariants directly in the shipped string.
 *   3. wireHtml properties — idempotency, EOL-preservation, placement, targeting.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  INJECTED_JS, RECHECK_BUTTON, SENTINEL, TARGET_RE, wireHtml, buildScriptBlock
} from '../scripts/wire-ai-worksheet-grade.mjs';

// ---------------------------------------------------------------------------
// Harness: install the REAL shipped flow with mocked worksheet globals.
// ---------------------------------------------------------------------------
let mocks;

function installShippedFlow(overrides = {}) {
  // Reset the runtime idempotency guard + any prior install.
  delete window.__aiWorksheetGradeWired;
  delete window.aiGradeWorksheet;
  delete window._aiGradeBusy;
  delete window._aiLastGradedHash;

  const gradingState = new Map();
  mocks = {
    gradingState,
    checkAnswer: vi.fn((blank) => blank.dataset.verdict || 'incorrect'),
    gradeReflection: vi.fn(async () => ({ score: 'E', feedback: 'good', matched: [], missing: [] })),
    fetchEnrichedAnswer: vi.fn(async () => ({ score: 'E', suggestion: 'polished answer' })),
    renderEnrichedPass: vi.fn(),
    showFeedback: vi.fn(),
    recordReflectionToGradebook: vi.fn(),
    updateWorksheetCompletion: vi.fn(),
    gbUnitFromItemId: vi.fn((id) => { const m = /^WS-(U\d+)/.exec(id || ''); return m ? m[1] : undefined; }),
    gbWsPrefix: vi.fn(() => 'WS-' + (globalThis.UNIT_ID || 'U6L1-2')),
    _wsReflectionTextareas: vi.fn(() => Array.from(document.querySelectorAll('textarea[id]'))),
    checkAnswersOrig: vi.fn(),
    // The worksheet's ORIGINAL verbatim blank feeder (what handleLiveUpdate calls
    // on blur) — mirrors recordBlankToGradebook: records the verbatim score.
    recordBlankToGradebook: vi.fn(function (blank) {
      const v = (blank.value || '').trim();
      if (!v) return;
      const verdict = mocks.checkAnswer(blank);
      const sc = { correct: 1, partial: 0.5, incorrect: 0 }[verdict];
      mocks.record({ source: 'worksheet', itemId: blank.dataset.questionId, response: v, score: sc, attempt: 1 });
    }),
    record: vi.fn(async () => ({ ok: true, ledgerId: 'x' })),
    fetchPrior: vi.fn(async () => new Map()),
    fetch: vi.fn(),
    ...overrides
  };

  // Worksheet globals the IIFE reads as BARE identifiers (function declarations
  // are global in a classic worksheet script).
  globalThis.UNIT_ID = overrides.UNIT_ID || 'U6L1-2';
  globalThis.checkAnswer = mocks.checkAnswer;
  globalThis.gradeReflection = mocks.gradeReflection;
  globalThis.fetchEnrichedAnswer = mocks.fetchEnrichedAnswer;
  globalThis.renderEnrichedPass = mocks.renderEnrichedPass;
  globalThis.showFeedback = mocks.showFeedback;
  globalThis.recordReflectionToGradebook = mocks.recordReflectionToGradebook;
  globalThis.updateWorksheetCompletion = mocks.updateWorksheetCompletion;
  globalThis.gbUnitFromItemId = mocks.gbUnitFromItemId;
  globalThis.gbWsPrefix = mocks.gbWsPrefix;
  globalThis._wsReflectionTextareas = mocks._wsReflectionTextareas;
  globalThis.recordBlankToGradebook = mocks.recordBlankToGradebook;
  globalThis.gradingState = gradingState;

  // window.* the IIFE reads/writes.
  window.checkAnswers = mocks.checkAnswersOrig;
  window.gradebookClient = { record: mocks.record, fetchPrior: mocks.fetchPrior };
  window.RAILWAY_SERVER_URL = 'https://ai.example';
  globalThis.fetch = mocks.fetch;

  // Run the REAL shipped code (indirect eval → resolves bare names off globalThis).
  // eslint-disable-next-line no-eval
  (0, eval)(INJECTED_JS);
}

function okFetch(blanks) {
  return { ok: true, json: async () => ({ blanks }) };
}

function addBlank(id, { answer = 'evidence', value = '', verdict = 'incorrect', question = 'Some prose here.' } = {}) {
  const q = document.createElement('div');
  q.className = 'question';
  q.appendChild(document.createTextNode(question + ' '));
  const input = document.createElement('input');
  input.className = 'blank';
  input.dataset.questionId = id;
  input.dataset.answer = answer;
  input.dataset.verdict = verdict;
  input.value = value;
  if (verdict === 'correct') input.classList.add('correct');
  q.appendChild(input);
  document.body.appendChild(q);
  return input;
}

function addTextarea(id, value) {
  const ta = document.createElement('textarea');
  ta.id = id;
  ta.value = value || '';
  document.body.appendChild(ta);
  return ta;
}

beforeEach(() => {
  document.body.innerHTML = '';
  expect(window === globalThis).toBe(true); // jsdom env sanity
});

afterEach(() => {
  vi.restoreAllMocks();
  // Defensive: clear the worksheet globals we injected so nothing leaks to
  // another test file (vitest isolates files, but keep this hermetic anyway).
  for (const k of ['UNIT_ID', 'checkAnswer', 'gradeReflection', 'fetchEnrichedAnswer',
    'renderEnrichedPass', 'showFeedback', 'recordReflectionToGradebook', 'recordBlankToGradebook',
    'updateWorksheetCompletion', 'gbUnitFromItemId', 'gbWsPrefix', '_wsReflectionTextareas',
    'gradingState', 'fetch']) {
    try { delete globalThis[k]; } catch (_) {}
  }
  for (const k of ['aiGradeWorksheet', 'checkAnswers', 'gradebookClient',
    'RAILWAY_SERVER_URL', '_aiGradeBusy', '_aiLastGradedHash', '__aiWorksheetGradeWired']) {
    try { delete window[k]; } catch (_) {}
  }
});

// ===========================================================================
// 1. BEHAVIORAL — runs the real shipped flow
// ===========================================================================
describe('aiGradeWorksheet — batched collection', () => {
  it('sends ONE call for all filled blanks (empty skipped) with DOM question + accepted answers', async () => {
    addBlank('WS-U6L1-2-Q1', { value: 'proof', answer: 'evidence', question: 'How do we identify ___ for a claim?' });
    addBlank('WS-U6L1-2-Q2', { value: 'convincing', answer: 'convincing|persuasive' });
    addBlank('WS-U6L1-2-Q3', { value: '' }); // empty → not sent
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([]));

    await window.aiGradeWorksheet({ manual: false });

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mocks.fetch.mock.calls[0];
    expect(url).toMatch(/\/api\/ai\/grade-worksheet$/);
    const body = JSON.parse(opts.body);
    expect(body.blanks).toHaveLength(2);
    const q1 = body.blanks.find((b) => b.id === 'WS-U6L1-2-Q1');
    expect(q1.studentAnswer).toBe('proof');
    expect(q1.question).toMatch(/identify/);
    expect(q1.acceptedAnswers).toEqual(['evidence']);
    const q2 = body.blanks.find((b) => b.id === 'WS-U6L1-2-Q2');
    expect(q2.acceptedAnswers).toEqual(['convincing', 'persuasive']);
    // scenario carries unit/lesson for framework grounding
    expect(body.scenario.unit).toBe(6);
    expect(body.scenario.lessons).toEqual([1, 2]);
  });
});

describe('aiGradeWorksheet — upgrade-only blank credit (never downgrades)', () => {
  it('credit:true on a below-full blank → green + ledger write at score 1 (source worksheet)', async () => {
    const b = addBlank('WS-U6L1-2-Q1', { value: 'proof', answer: 'evidence', verdict: 'incorrect' });
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([{ id: 'WS-U6L1-2-Q1', credit: true, reason: 'same idea' }]));

    await window.aiGradeWorksheet({ manual: false });

    expect(b.classList.contains('correct')).toBe(true);
    expect(b.classList.contains('incorrect')).toBe(false);
    const recCalls = mocks.record.mock.calls.map((c) => c[0]);
    const credit = recCalls.find((r) => r.itemId === 'WS-U6L1-2-Q1');
    expect(credit).toMatchObject({ source: 'worksheet', itemId: 'WS-U6L1-2-Q1', score: 1, response: 'proof' });
    expect(credit.unit).toBe('U6'); // no new ledger source / migration
  });

  it('credit:false → NO upgrade (verbatim grade stands, no score-1 write)', async () => {
    const b = addBlank('WS-U6L1-2-Q1', { value: 'banana', verdict: 'incorrect' });
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([{ id: 'WS-U6L1-2-Q1', credit: false, reason: 'different concept' }]));

    await window.aiGradeWorksheet({ manual: false });

    expect(b.classList.contains('correct')).toBe(false);
    const wroteFull = mocks.record.mock.calls.some((c) => c[0].itemId === 'WS-U6L1-2-Q1' && c[0].score === 1);
    expect(wroteFull).toBe(false);
  });

  it('strict: a non-boolean "credit" (string "true" / number 1) is IGNORED', async () => {
    const b1 = addBlank('WS-U6L1-2-Q1', { value: 'x', verdict: 'incorrect' });
    const b2 = addBlank('WS-U6L1-2-Q2', { value: 'y', verdict: 'incorrect' });
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([
      { id: 'WS-U6L1-2-Q1', credit: 'true', reason: 'stringy' },
      { id: 'WS-U6L1-2-Q2', credit: 1, reason: 'numbery' }
    ]));

    await window.aiGradeWorksheet({ manual: false });

    expect(b1.classList.contains('correct')).toBe(false);
    expect(b2.classList.contains('correct')).toBe(false);
    expect(mocks.record.mock.calls.some((c) => c[0].score === 1)).toBe(false);
  });

  it('a verbatim-correct blank is sent for context but never re-acted on (no double write)', async () => {
    addBlank('WS-U6L1-2-Q1', { value: 'evidence', answer: 'evidence', verdict: 'correct' });
    addBlank('WS-U6L1-2-Q2', { value: 'wrongish', verdict: 'incorrect' }); // keeps actMap non-empty
    installShippedFlow();
    // Even if the AI hallucinates credit:true for the already-correct blank, it
    // is not in actMap (currentScore === 1) → no AI ledger write for it.
    mocks.fetch.mockResolvedValue(okFetch([{ id: 'WS-U6L1-2-Q1', credit: true, reason: 'already right' }]));

    await window.aiGradeWorksheet({ manual: false });

    const wroteQ1 = mocks.record.mock.calls.some((c) => c[0].itemId === 'WS-U6L1-2-Q1' && c[0].score === 1);
    expect(wroteQ1).toBe(false);
    // and the verbatim-correct blank WAS sent for context
    const body = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(body.blanks.map((b) => b.id)).toContain('WS-U6L1-2-Q1');
  });

  it('GUARD 1: a re-blur on an UNCHANGED AI-credited blank records full credit, not verbatim', () => {
    const b = addBlank('WS-U6L1-2-Q1', { value: 'proof', verdict: 'incorrect' });
    installShippedFlow();
    b.dataset.aiCredit = '1';
    b.dataset.aiCreditValue = 'proof';
    // handleLiveUpdate would call the (now-wrapped) recordBlankToGradebook on blur:
    window.recordBlankToGradebook(b);
    expect(mocks.recordBlankToGradebook).not.toHaveBeenCalled();      // verbatim path skipped
    const full = mocks.record.mock.calls.map((c) => c[0]).find((a) => a.itemId === 'WS-U6L1-2-Q1');
    expect(full.score).toBe(1);                                       // full credit preserved
  });

  it('GUARD 1: a blur on an EDITED ai-credit blank records verbatim (credit dropped)', () => {
    const b = addBlank('WS-U6L1-2-Q1', { value: 'changed', verdict: 'incorrect' });
    installShippedFlow();
    b.dataset.aiCredit = '1';
    b.dataset.aiCreditValue = 'proof';                               // value changed since credit
    window.recordBlankToGradebook(b);
    expect(mocks.recordBlankToGradebook).toHaveBeenCalledTimes(1);   // delegated to verbatim original
  });
});

describe('aiGradeWorksheet — anti-spam (dedup + single-flight + soft-fail)', () => {
  it('hash dedup: identical content does not call the API twice', async () => {
    addBlank('WS-U6L1-2-Q1', { value: 'proof', verdict: 'incorrect' });
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([]));

    await window.aiGradeWorksheet({ manual: false });
    await window.aiGradeWorksheet({ manual: false });

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('single-flight: a pass while busy is a no-op', async () => {
    addBlank('WS-U6L1-2-Q1', { value: 'proof', verdict: 'incorrect' });
    installShippedFlow();
    window._aiGradeBusy = true;
    mocks.fetch.mockResolvedValue(okFetch([]));

    await window.aiGradeWorksheet({ manual: true });

    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('soft-fail: AI down (fetch rejects) does not throw and writes no upgrade', async () => {
    const b = addBlank('WS-U6L1-2-Q1', { value: 'proof', verdict: 'incorrect' });
    installShippedFlow();
    mocks.fetch.mockRejectedValue(new Error('network down'));

    await expect(window.aiGradeWorksheet({ manual: false })).resolves.toBeUndefined();
    expect(b.classList.contains('correct')).toBe(false);
    expect(mocks.record.mock.calls.some((c) => c[0].score === 1)).toBe(false);
  });

  it('soft-fail: non-OK response (503) writes no upgrade', async () => {
    const b = addBlank('WS-U6L1-2-Q1', { value: 'proof', verdict: 'incorrect' });
    installShippedFlow();
    mocks.fetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: 'off' }) });

    await window.aiGradeWorksheet({ manual: false });
    expect(b.classList.contains('correct')).toBe(false);
  });
});

describe('aiGradeWorksheet — FRQ fold (upgrade-only, deduped)', () => {
  it('grades an ungraded reflection and records it', async () => {
    addTextarea('reflect1', 'This is a sufficiently long reflection answer about evidence.');
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([]));
    mocks.gradeReflection.mockResolvedValue({ score: 'E', feedback: 'nice' });

    await window.aiGradeWorksheet({ manual: false });

    expect(mocks.gradeReflection).toHaveBeenCalledWith('reflect1', expect.stringMatching(/reflection answer/));
    expect(mocks.recordReflectionToGradebook).toHaveBeenCalledWith('reflect1', expect.any(String), 'E');
  });

  it('never downgrades: a prior E is kept when the AI now returns P', async () => {
    const ta = addTextarea('reflect1', 'A long enough previously-E reflection answer here.');
    installShippedFlow();
    mocks.gradingState.set('reflect1', { result: { score: 'E' }, originalAnswer: 'different older text that was graded E', appealCount: 0, history: [] });
    mocks.fetch.mockResolvedValue(okFetch([]));
    mocks.gradeReflection.mockResolvedValue({ score: 'P', feedback: 'meh' });

    await window.aiGradeWorksheet({ manual: false });

    // It re-graded (content changed vs stored originalAnswer) but P <= E → not recorded.
    const recordedP = mocks.recordReflectionToGradebook.mock.calls.some((c) => c[2] === 'P');
    expect(recordedP).toBe(false);
  });

  it('LEDGER FLOOR: a persisted E is kept when the student edits and the AI now returns P', async () => {
    // The edit cleared gradingState (no in-session prev), but the ledger holds E.
    addTextarea('reflect1', 'An edited but still long enough reflection answer about evidence.');
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([]));
    mocks.fetchPrior.mockResolvedValue(new Map([
      ['WS-U6L1-2-reflect1', { response: 'older graded-E text', score: 1, source: 'frq' }]
    ]));
    mocks.gradeReflection.mockResolvedValue({ score: 'P', feedback: 'now weaker' });

    await window.aiGradeWorksheet({ manual: false });

    const wroteLower = mocks.recordReflectionToGradebook.mock.calls.some((c) => c[2] === 'P');
    expect(wroteLower).toBe(false);
  });

  it('LEDGER FLOOR: a genuine upgrade above the persisted grade IS recorded', async () => {
    addTextarea('reflect1', 'A much improved and sufficiently long reflection answer here now.');
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([]));
    mocks.fetchPrior.mockResolvedValue(new Map([
      ['WS-U6L1-2-reflect1', { response: 'older P text', score: 0.5, source: 'frq' }]
    ]));
    mocks.gradeReflection.mockResolvedValue({ score: 'E', feedback: 'great now' });

    await window.aiGradeWorksheet({ manual: false });

    expect(mocks.recordReflectionToGradebook).toHaveBeenCalledWith('reflect1', expect.any(String), 'E');
  });

  it('dedup: an unchanged already-graded reflection is not re-graded on the next pass', async () => {
    addBlank('WS-U6L1-2-Q1', { value: 'proof', verdict: 'incorrect' });
    const ta = addTextarea('reflect1', 'A long enough reflection answer about evidence and proof.');
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([]));
    mocks.gradeReflection.mockResolvedValue({ score: 'E', feedback: 'nice' });

    await window.aiGradeWorksheet({ manual: false });   // grades reflect1 once
    expect(mocks.gradeReflection).toHaveBeenCalledTimes(1);

    // Change a BLANK so the top-level hash check passes, but leave the FRQ as-is.
    document.querySelector('.blank').value = 'proof-edited';
    await window.aiGradeWorksheet({ manual: false });

    expect(mocks.gradeReflection).toHaveBeenCalledTimes(1); // FRQ deduped
  });
});

describe('GUARD 2 — every FRQ record path is upgrade-only (covers the legacy button + appeal)', () => {
  it('records the first E, then SKIPS a later P for the same item (no downgrade)', () => {
    addTextarea('reflect1', 'some answer');
    installShippedFlow();
    window.recordReflectionToGradebook('reflect1', 'a1', 'E');   // first → records
    window.recordReflectionToGradebook('reflect1', 'a2', 'P');   // P <= E → blocked
    window.recordReflectionToGradebook('reflect1', 'a3', 'I');   // I <= E → blocked
    const reached = mocks.recordReflectionToGradebook.mock.calls.map((c) => c[2]);
    expect(reached).toEqual(['E']);
  });

  it('allows a genuine upgrade chain I -> P -> E', () => {
    addTextarea('reflect1', 'some answer');
    installShippedFlow();
    window.recordReflectionToGradebook('reflect1', 'a', 'I');
    window.recordReflectionToGradebook('reflect1', 'a', 'P');
    window.recordReflectionToGradebook('reflect1', 'a', 'E');
    expect(mocks.recordReflectionToGradebook.mock.calls.map((c) => c[2])).toEqual(['I', 'P', 'E']);
  });
});

describe('FRQ fold — fresh-I suppression on the AUTO path (#10)', () => {
  it('auto (Done) path does NOT persist a first-ever I for an ungraded FRQ', async () => {
    addTextarea('reflect1', 'A sufficiently long but weak reflection answer goes here now.');
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([]));
    mocks.fetchPrior.mockResolvedValue(new Map());
    mocks.gradeReflection.mockResolvedValue({ score: 'I', feedback: 'weak' });

    await window.aiGradeWorksheet({ manual: false });

    expect(mocks.recordReflectionToGradebook).not.toHaveBeenCalled();
    expect(mocks.showFeedback).toHaveBeenCalled(); // student still sees the feedback
  });

  it('MANUAL re-check DOES persist a first-ever I (the student asked)', async () => {
    addTextarea('reflect1', 'A sufficiently long but weak reflection answer goes here now.');
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([]));
    mocks.fetchPrior.mockResolvedValue(new Map());
    mocks.gradeReflection.mockResolvedValue({ score: 'I', feedback: 'weak' });

    await window.aiGradeWorksheet({ manual: true });

    expect(mocks.recordReflectionToGradebook).toHaveBeenCalledWith('reflect1', expect.any(String), 'I');
  });
});

describe('anti-spam — blanks endpoint skipped when nothing is upgradeable (#8)', () => {
  it('all blanks already full verbatim credit + a changed FRQ → no blanks call, FRQ still graded', async () => {
    addBlank('WS-U6L1-2-Q1', { value: 'evidence', answer: 'evidence', verdict: 'correct' });
    addTextarea('reflect1', 'A sufficiently long reflection answer to trigger the FRQ pass now.');
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([]));
    mocks.fetchPrior.mockResolvedValue(new Map());
    mocks.gradeReflection.mockResolvedValue({ score: 'E' });

    await window.aiGradeWorksheet({ manual: false });

    const blanksCalls = mocks.fetch.mock.calls.filter((c) => /grade-worksheet/.test(c[0]));
    expect(blanksCalls).toHaveLength(0);   // actMap empty → no API call
    expect(mocks.gradeReflection).toHaveBeenCalled();
  });
});

describe('merged button — polish fold + win feedback', () => {
  it('manual polish: a close-P written answer is rewritten to full-credit E', async () => {
    addTextarea('reflect1', 'A decent but incomplete reflection answer about evidence here.');
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([]));
    mocks.fetchPrior.mockResolvedValue(new Map());
    mocks.gradeReflection.mockResolvedValue({ score: 'P', matched: ['a', 'b'], missing: ['c'] });
    mocks.fetchEnrichedAnswer.mockResolvedValue({ score: 'E', suggestion: 'polished with <strong>c</strong>' });

    await window.aiGradeWorksheet({ manual: true });

    expect(mocks.fetchEnrichedAnswer).toHaveBeenCalledWith('reflect1', expect.any(String), ['c']);
    expect(mocks.renderEnrichedPass).toHaveBeenCalled();
    expect(mocks.recordReflectionToGradebook).toHaveBeenCalledWith('reflect1', expect.any(String), 'E');
  });

  it('AUTO (Done) path does NOT run the polish (keeps Check Answers cheap)', async () => {
    addTextarea('reflect1', 'A decent but incomplete reflection answer about evidence here.');
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([]));
    mocks.fetchPrior.mockResolvedValue(new Map());
    mocks.gradeReflection.mockResolvedValue({ score: 'P', matched: ['a', 'b'], missing: ['c'] });

    await window.aiGradeWorksheet({ manual: false });

    expect(mocks.fetchEnrichedAnswer).not.toHaveBeenCalled();
    expect(mocks.recordReflectionToGradebook).toHaveBeenCalledWith('reflect1', expect.any(String), 'P');
  });

  it('updates the visible Score to count AI-accepted blanks + toasts the win', async () => {
    const sd = document.createElement('div'); sd.id = 'scoreDisplay'; document.body.appendChild(sd);
    addBlank('WS-U6L1-2-Q1', { value: 'proof', verdict: 'incorrect' });
    addBlank('WS-U6L1-2-Q2', { value: 'evidence', answer: 'evidence', verdict: 'correct' });
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([{ id: 'WS-U6L1-2-Q1', credit: true, reason: 'syn' }]));
    mocks.fetchPrior.mockResolvedValue(new Map());

    await window.aiGradeWorksheet({ manual: true });

    expect(sd.textContent).toMatch(/This worksheet's blanks: 100%/);  // counts the AI-accepted blank
    expect(sd.textContent).toMatch(/2 correct of 2/);
    expect(document.body.textContent).toMatch(/AI accepted 1 more answer/);
    expect(document.body.textContent).toMatch(/Score 50% → 100%/);
  });

  it('toasts "no new credit" when nothing was upgraded', async () => {
    addBlank('WS-U6L1-2-Q1', { value: 'wrong', verdict: 'incorrect' });
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([{ id: 'WS-U6L1-2-Q1', credit: false, reason: 'no' }]));
    mocks.fetchPrior.mockResolvedValue(new Map());

    await window.aiGradeWorksheet({ manual: true });
    expect(document.body.textContent).toMatch(/no new credit/);
  });
});

describe('auto-on-Done — checkAnswers is wrapped', () => {
  it('calling the (wrapped) checkAnswers runs the original AND kicks the AI pass', async () => {
    addBlank('WS-U6L1-2-Q1', { value: 'proof', verdict: 'incorrect' });
    installShippedFlow();
    mocks.fetch.mockResolvedValue(okFetch([]));

    expect(window.checkAnswers).not.toBe(mocks.checkAnswersOrig); // wrapped
    window.checkAnswers();
    await Promise.resolve(); await Promise.resolve();

    expect(mocks.checkAnswersOrig).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// 2. STATIC-PARSE — pin the invariants in the shipped string
// ===========================================================================
describe('INJECTED_JS invariants (load-bearing)', () => {
  it('carries the sentinel', () => {
    expect(INJECTED_JS).toContain(SENTINEL);
  });
  it('single-flight guard', () => {
    expect(INJECTED_JS).toMatch(/window\._aiGradeBusy/);
  });
  it('hash dedup', () => {
    expect(INJECTED_JS).toMatch(/_aiLastGradedHash/);
    expect(INJECTED_JS).toMatch(/function _aiHash/);
  });
  it('ONE batched call (single endpoint, not per-blank)', () => {
    const hits = (INJECTED_JS.match(/grade-worksheet/g) || []).length;
    expect(hits).toBeGreaterThanOrEqual(1);
    // the endpoint is fetched inside a single forEach-free POST (blanks array sent whole)
    expect(INJECTED_JS).toMatch(/blanks:\s*send/);
  });
  it('blank credit is strict (only boolean true) + upgrade-only (records score 1)', () => {
    expect(INJECTED_JS).toMatch(/g\.credit !== true/);
    expect(INJECTED_JS).toMatch(/score:\s*1/);
    expect(INJECTED_JS).toMatch(/cur < 1/);            // only acts below full credit
  });
  it('FRQ fold is upgrade-only via an E>P>I rank', () => {
    expect(INJECTED_JS).toMatch(/_AI_FRQ_RANK\s*=\s*\{\s*I:\s*0,\s*P:\s*1,\s*E:\s*2\s*\}/);
    expect(INJECTED_JS).toMatch(/newRank <= floor/);
  });
  it('FRQ floor includes the PERSISTED ledger grade (no downgrade across edits)', () => {
    expect(INJECTED_JS).toMatch(/_aiFetchPriorScores/);
    expect(INJECTED_JS).toMatch(/function _aiLedgerRank/);
    expect(INJECTED_JS).toMatch(/_aiSeedFrqFloor/);
    expect(INJECTED_JS).toMatch(/floor = Math\.max\(floor, _aiFrqFloor\[itemId\]\)/);
  });
  it('soft-fail: fetch wrapped in try/catch + resp.ok guard', () => {
    expect(INJECTED_JS).toMatch(/if \(resp\.ok\)/);
    expect(INJECTED_JS).toMatch(/catch \(_\) \{ \/\* soft-fail/);
  });
  it('ledger write keeps source worksheet (no new source / migration)', () => {
    expect(INJECTED_JS).toMatch(/source:\s*'worksheet'/);
  });
  it('reveals (Show Answers) are excluded', () => {
    expect(INJECTED_JS).toMatch(/contains\('revealed'\)/);
  });
  it('GUARD 1: wraps recordBlankToGradebook to honor unchanged AI credit', () => {
    expect(INJECTED_JS).toMatch(/window\.recordBlankToGradebook = function/);
    expect(INJECTED_JS).toMatch(/dataset\.aiCredit === '1'/);
  });
  it('GUARD 2: wraps recordReflectionToGradebook upgrade-only (covers legacy button + appeal)', () => {
    expect(INJECTED_JS).toMatch(/window\.recordReflectionToGradebook = function/);
    expect(INJECTED_JS).toMatch(/if \(nr <= floor\) return;/);
    expect(INJECTED_JS).toMatch(/_aiFrqFloor/);
  });
  it('restores AI-credit flags from the ledger on load (post-reload protection)', () => {
    expect(INJECTED_JS).toMatch(/_aiRestoreBlankCredits/);
    expect(INJECTED_JS).toMatch(/_aiSeedFrqFloor/);
  });
  it('blanks endpoint only fires when something is upgradeable (#8)', () => {
    expect(INJECTED_JS).toMatch(/Object\.keys\(actMap\)\.length/);
  });
  it('auto path never persists a fresh I (#10)', () => {
    expect(INJECTED_JS).toMatch(/!manual && floor < 0 && newRank === 0/);
  });
  it('folds the "polish" pass into the one button (manual only)', () => {
    expect(INJECTED_JS).toMatch(/fetchEnrichedAnswer/);
    expect(INJECTED_JS).toMatch(/renderEnrichedPass/);
    expect(INJECTED_JS).toMatch(/manual && result\.score === 'P'/);
  });
  it('updates the local Score to include AI-accepted blanks', () => {
    expect(INJECTED_JS).toMatch(/function _aiUpdateScoreDisplay/);
    expect(INJECTED_JS).toMatch(/getElementById\('scoreDisplay'\)/);
  });
  it('win toast reports the accepted count + score delta', () => {
    expect(INJECTED_JS).toMatch(/accepted ' \+ aiAccepted/);
    expect(INJECTED_JS).toMatch(/Score ' \+ pre/);
  });
});

describe('RECHECK_BUTTON (the single "Grade with AI" button)', () => {
  it('calls aiGradeWorksheet({manual:true}) and is labelled "Grade with AI"', () => {
    expect(RECHECK_BUTTON).toMatch(/aiGradeWorksheet\(\{manual:true\}\)/);
    expect(RECHECK_BUTTON).toMatch(/btn-ai-recheck/);
    expect(RECHECK_BUTTON).toMatch(/Grade with AI/);
  });
});

// ===========================================================================
// 3. wireHtml properties
// ===========================================================================
const SAMPLE = [
  '<html>', '<body>',
  '  <div class="controls">',
  '    <button class="btn-check" onclick="checkAnswers()">&#10003; Check Answers</button>',
  '    <button class="btn-ai" onclick="gradeAllReflections()">&#129302; Grade My Reflections</button>',
  '  </div>',
  '  <script>const UNIT_ID="U6L1-2"; function gradeReflection(){}</script>',
  '</body>', '</html>'
].join('\n');

describe('wireHtml', () => {
  it('injects the button after Check Answers + the script before </body>', () => {
    const { changed, html } = wireHtml(SAMPLE);
    expect(changed).toBe(true);
    expect(html).toContain('btn-ai-recheck');
    expect(html.indexOf('btn-ai-recheck')).toBeGreaterThan(html.indexOf('checkAnswers()'));
    expect(html.indexOf(SENTINEL)).toBeGreaterThan(-1);
    expect(html.indexOf(SENTINEL)).toBeLessThan(html.lastIndexOf('</body>'));
  });

  it('removes the legacy "Grade My Reflections" button (worksheet has gradeReflection)', () => {
    const { html } = wireHtml(SAMPLE);
    // the legacy button element is gone (its onclick + class no longer appear)
    expect(html).not.toMatch(/gradeAllReflections\(\)/);
    expect(html).not.toMatch(/class="btn-ai"/);
  });

  it('KEEPS the legacy button when the worksheet grades FRQs inline (no gradeReflection)', () => {
    const noGR = SAMPLE.replace(' function gradeReflection(){}', '');
    const { html } = wireHtml(noGR);
    expect(html).toMatch(/gradeAllReflections\(\)/);   // its only FRQ path — preserved
    expect(html).toContain('btn-ai-recheck');          // unified button still added
  });

  it('is idempotent (second pass is a no-op)', () => {
    const once = wireHtml(SAMPLE).html;
    const twice = wireHtml(once);
    expect(twice.changed).toBe(false);
    expect(twice.reason).toBe('already-wired');
    // exactly one button element (the script also references `.btn-ai-recheck`)
    expect((once.match(/class="btn-ai-recheck"/g) || []).length).toBe(1);
    expect((once.match(new RegExp(SENTINEL, 'g')) || []).length).toBe(1);
  });

  it('preserves LF', () => {
    const { html } = wireHtml(SAMPLE);
    expect(html.includes('\r\n')).toBe(false);
  });

  it('preserves CRLF', () => {
    const crlf = SAMPLE.replace(/\n/g, '\r\n');
    const { html } = wireHtml(crlf);
    const lf = (html.match(/\n/g) || []).length;
    const crlfCount = (html.match(/\r\n/g) || []).length;
    expect(lf).toBe(crlfCount); // every newline is a CRLF
  });

  it('refuses a doc with no </body>', () => {
    const res = wireHtml('<html><body>no close');
    expect(res.changed).toBe(false);
    expect(res.reason).toBe('no-body-close');
  });
});

describe('targeting (TARGET_RE)', () => {
  it('matches live worksheets', () => {
    expect(TARGET_RE.test('u6_lesson1-2_live.html')).toBe(true);
    expect(TARGET_RE.test('u8_lesson1_live.html')).toBe(true);
    expect(TARGET_RE.test('u4_lesson1-2-3_live.html')).toBe(true);
  });
  it('excludes the Edgar driller and non-worksheets', () => {
    expect(TARGET_RE.test('edgar_u6_conceptual_driller_live.html')).toBe(false);
    expect(TARGET_RE.test('ap_stats_roadmap_square_mode.html')).toBe(false);
    expect(TARGET_RE.test('unit4_schedule_v4.html')).toBe(false);
  });
});

describe('buildScriptBlock', () => {
  it('wraps INJECTED_JS in a <script> with the chosen EOL', () => {
    const block = buildScriptBlock('\n');
    expect(block.startsWith('    <script>')).toBe(true);
    expect(block.trimEnd().endsWith('</script>')).toBe(true);
    expect(block).toContain('aiGradeWorksheet');
  });
});
