// grade-playground.test.js — verifies the interactive "Grade Playground" embedded
// in start-here.html ships the v3 grade engine VERBATIM and that the engine
// reproduces the server's worked examples exactly.
//
// Strategy: extract V3_WORK_WEIGHTS + quarterGradeV3 / workAvgV3 / combineV3 from
// the start-here.html source (regex), Function-eval them in isolation, and assert
// the displayed math equals roster-server/lesson-grade.js's.
//
// @vitest-environment node

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const START = readFileSync(resolve(repo, 'start-here.html'), 'utf8');

// ── Extract the three engine functions + the weights table from the HTML ──────
function extractEngine(html) {
  // Grab the function source from `var V3_WORK_WEIGHTS` through the closing brace
  // of combineV3. We match each declaration individually so the test is robust to
  // surrounding script reformatting.
  function grabFn(name) {
    // `function NAME(...) { ... }` — balance braces from the first `{`.
    const sig = new RegExp('function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{');
    const m = sig.exec(html);
    if (!m) throw new Error('could not find function ' + name + ' in start-here.html');
    let i = html.indexOf('{', m.index);
    let depth = 0;
    let end = -1;
    for (let j = i; j < html.length; j++) {
      const ch = html[j];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) { end = j; break; }
      }
    }
    if (end < 0) throw new Error('unbalanced braces extracting ' + name);
    return html.slice(m.index, end + 1);
  }

  const weightsMatch = /var\s+V3_WORK_WEIGHTS\s*=\s*\{[^}]*\}\s*;/.exec(html);
  if (!weightsMatch) throw new Error('could not find V3_WORK_WEIGHTS in start-here.html');

  const source = [
    weightsMatch[0],
    grabFn('quarterGradeV3'),
    grabFn('workAvgV3'),
    grabFn('combineV3'),
    'return { V3_WORK_WEIGHTS, quarterGradeV3, workAvgV3, combineV3 };',
  ].join('\n');

  // eslint-disable-next-line no-new-func
  return new Function(source)();
}

let engine;
beforeAll(() => {
  engine = extractEngine(START);
});

const EPS = 1e-9;

describe('Grade Playground — engine is present and verbatim-shaped', () => {
  it('extracts all three functions + the weights table', () => {
    expect(typeof engine.quarterGradeV3).toBe('function');
    expect(typeof engine.workAvgV3).toBe('function');
    expect(typeof engine.combineV3).toBe('function');
    expect(engine.V3_WORK_WEIGHTS).toEqual({
      lessons: 0.30, quizzes: 0.30, posters: 0.30, blooket: 0.10,
    });
  });
});

describe('quarterGradeV3 — worked examples (pc, work -> expected) within 1e-9', () => {
  const cases = [
    [1.00, 1.00, 1.00],
    [1.00, 0.40, 1.00],
    [0.40, 1.00, 1.00],
    [1.00, 0.39, 0.70],
    [1.00, 0.00, 0.70],
    [0.39, 1.00, 0.70],
    [0.00, 1.00, 0.70],
    [0.80, 0.39, 0.595],
    [0.39, 0.80, 0.595],
    [0.50, 0.50, 0.50],
    [0.30, 0.30, 0.30],
    [0.00, 0.00, 0.00],
    [0.70, 0.60, 0.70],
  ];

  for (const [pc, work, expected] of cases) {
    it(`pc=${pc} work=${work} -> ${expected}`, () => {
      expect(engine.quarterGradeV3(pc, work)).toBeCloseTo(expected, 12);
      expect(Math.abs(engine.quarterGradeV3(pc, work) - expected)).toBeLessThan(EPS);
    });
  }
});

describe('workAvgV3 — renormalizes over present components', () => {
  it('one missing pair renormalizes (lessons+quizzes only) -> 0.7', () => {
    const v = engine.workAvgV3({ lessons: 0.8, quizzes: 0.6, posters: null, blooket: null });
    expect(Math.abs(v - 0.7)).toBeLessThan(EPS);
  });

  it('all present uses the full weighting', () => {
    // 0.30*1 + 0.30*1 + 0.30*1 + 0.10*1 = 1.0 over den 1.0 -> 1.0
    const v = engine.workAvgV3({ lessons: 1, quizzes: 1, posters: 1, blooket: 1 });
    expect(Math.abs(v - 1)).toBeLessThan(EPS);
  });

  it('blooket-only returns the blooket value (den == 0.10)', () => {
    const v = engine.workAvgV3({ lessons: null, quizzes: null, posters: null, blooket: 0.42 });
    expect(Math.abs(v - 0.42)).toBeLessThan(EPS);
  });

  it('all-null returns null', () => {
    expect(engine.workAvgV3({ lessons: null, quizzes: null, posters: null, blooket: null })).toBeNull();
  });
});

describe('combineV3 — tolerates a null track', () => {
  it('returns the present track when work is null', () => {
    expect(engine.combineV3(0.83, null)).toBe(0.83);
  });

  it('returns the present track when pc is null', () => {
    expect(engine.combineV3(null, 0.61)).toBe(0.61);
  });

  it('combineV3(null, null) === null', () => {
    expect(engine.combineV3(null, null)).toBeNull();
  });

  it('both present defers to quarterGradeV3 (capped example)', () => {
    // pc=1.00 work=0.00 -> 0.70 (below-40 branch)
    expect(Math.abs(engine.combineV3(1.0, 0.0) - 0.70)).toBeLessThan(EPS);
    // pc=0.70 work=0.60 -> 0.70 (max branch)
    expect(Math.abs(engine.combineV3(0.70, 0.60) - 0.70)).toBeLessThan(EPS);
  });
});
