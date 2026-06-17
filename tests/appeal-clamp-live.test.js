// appeal-clamp-live.test.js — LIVE-CODE differential harness for the appeal
// clamp (F5/F6 fix). appeal-state-machine.test.js model-checks the LOGIC; this
// extracts the REAL submitAppeal from a worksheet, runs it with stubbed
// fetch/DOM/gradebook, and asserts the SHIPPED clamp actually prevents a
// downgrade end-to-end (the gradebook record AND the displayed score never drop
// below the previous verdict). If the injected clamp were wrong/missing, this fails.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wsPath = resolve(repo, 'u1_lesson1_live.html');
const WS = existsSync(wsPath) ? readFileSync(wsPath, 'utf8') : null;

function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  let depth = 0;
  for (let j = src.indexOf('{', m.index); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(m.index, j + 1);
  }
  throw new Error('unbalanced braces for ' + name);
}

// Build a harness around the REAL submitAppeal: a gradingState seeded with the
// prior verdict, a fetch that returns a chosen appeal verdict, and spies that
// capture what gets recorded to the gradebook.
function runAppeal({ prevScore, appealScore, appealCount = 0 }) {
  const submitAppeal = new Function(
    'gradingState', 'document', 'fetch', 'window', 'recordReflectionToGradebook', 'showFeedback', 'alert',
    fnBody(WS, 'submitAppeal') + '\nreturn submitAppeal;',
  )(...buildStubs({ prevScore, appealScore, appealCount }));
  return submitAppeal;
}

function buildStubs({ prevScore, appealScore, appealCount }) {
  const recorded = [];
  const gradingState = new Map();
  const stateEntry = { result: { score: prevScore }, originalAnswer: 'orig', appealCount, history: [] };
  gradingState.set('reflect1', stateEntry);

  const els = {
    'appeal-text-reflect1': { value: 'this is a sufficiently long appeal reason' },
    'appeal-form-reflect1': { querySelectorAll: () => [{ disabled: false }] },
    'reflect1-feedback': { appendChild: () => {} },
  };
  const document = {
    getElementById: (id) => els[id] || { value: '', querySelectorAll: () => [], appendChild: () => {} },
    createElement: () => ({ className: '', textContent: '' }),
  };
  const fetch = async () => ({ json: async () => ({ score: appealScore, feedback: 'fb' }) });
  const window = { RAILWAY_SERVER_URL: 'http://test', LESSON_CONTEXT_U1L1: null };
  const recordReflectionToGradebook = (_qid, _ans, score) => recorded.push(score);
  const showFeedback = () => {};
  const alert = () => {};

  // expose captured results on the function's closure via the gradingState entry + recorded[]
  buildStubs._last = { recorded, stateEntry };
  return [gradingState, document, fetch, window, recordReflectionToGradebook, showFeedback, alert];
}

const guard = WS ? describe : describe.skip;

guard('appeal clamp (LIVE real submitAppeal)', () => {
  it('00: submitAppeal extracts + the APPEAL-CLAMP marker is present', () => {
    expect(WS).toMatch(/APPEAL-CLAMP/);
    expect(typeof runAppeal({ prevScore: 'P', appealScore: 'P' })).toBe('function');
  });

  it('01: downgrade P→I is CLAMPED — gradebook records P, displayed score stays P', async () => {
    const fn = runAppeal({ prevScore: 'P', appealScore: 'I' });
    const { recorded, stateEntry } = buildStubs._last;
    await fn('reflect1');
    expect(recorded[recorded.length - 1]).toBe('P');   // gradebook not lowered
    expect(stateEntry.result.score).toBe('P');         // display not lowered
  });

  it('02: genuine upgrade P→E records E', async () => {
    const fn = runAppeal({ prevScore: 'P', appealScore: 'E' });
    const { recorded, stateEntry } = buildStubs._last;
    await fn('reflect1');
    expect(recorded[recorded.length - 1]).toBe('E');
    expect(stateEntry.result.score).toBe('E');
  });

  it('03: genuine upgrade I→P records P', async () => {
    const fn = runAppeal({ prevScore: 'I', appealScore: 'P' });
    const { recorded, stateEntry } = buildStubs._last;
    await fn('reflect1');
    expect(recorded[recorded.length - 1]).toBe('P');
    expect(stateEntry.result.score).toBe('P');
  });

  it('04: maintained P→P records P', async () => {
    const fn = runAppeal({ prevScore: 'P', appealScore: 'P' });
    const { recorded, stateEntry } = buildStubs._last;
    await fn('reflect1');
    expect(recorded[recorded.length - 1]).toBe('P');
    expect(stateEntry.result.score).toBe('P');
  });

  it('05: the 3-appeal cap holds — a 4th appeal is a no-op (no record, count stays 3)', async () => {
    const fn = runAppeal({ prevScore: 'P', appealScore: 'E', appealCount: 3 });
    const { recorded, stateEntry } = buildStubs._last;
    await fn('reflect1');
    expect(recorded.length).toBe(0);          // never reached the record path
    expect(stateEntry.appealCount).toBe(3);   // unchanged
  });

  it('06: a successful appeal increments appealCount', async () => {
    const fn = runAppeal({ prevScore: 'I', appealScore: 'E', appealCount: 1 });
    const { stateEntry } = buildStubs._last;
    await fn('reflect1');
    expect(stateEntry.appealCount).toBe(2);
  });
});
