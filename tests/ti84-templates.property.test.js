// Property suite for the Track C seeded template engine
// (TI84_TRAINER_TEMPLATES_SPEC.md §7A) — wave 1 template: one-propztest.
//
// The load-bearing property is #2: generation is CONSTRUCTIVE, so constraints
// hold for every seed and the runtime fallback-to-canonical can never fire.
// valuesMatch/typedDecimalPlaces are extracted from app.js source (same
// pattern as ti84-data-trust's CHAR_TO_BUTTON extraction) so the checker
// round-trip and discrimination properties run against the real checker.
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import fs from 'node:fs';
import path from 'node:path';

const V2 = path.resolve(__dirname, '..', 'ti84-trainer-v2');

new Function(fs.readFileSync(path.join(V2, 'native', 'stat-math.js'), 'utf8'))();
new Function(fs.readFileSync(path.join(V2, 'data-templates.js'), 'utf8'))();

const T = window.TI84V2Templates;
const template = T.TEMPLATES['one-propztest'];

const appSrc = fs.readFileSync(path.join(V2, 'app.js'), 'utf8');
function extract(name) {
  const match = appSrc.match(new RegExp(`  function ${name}\\([\\s\\S]*?\\n  \\}`));
  if (!match) throw new Error(`Could not extract ${name} from app.js`);
  return match[0];
}
const valuesMatch = new Function(
  `${extract('typedDecimalPlaces')}\n${extract('valuesMatch')}\nreturn valuesMatch;`,
)();

const anySeed = fc.integer().map((n) => n >>> 0);
const gen = (seed) => T.generateProblem(template, seed);

describe('one-propztest template properties', () => {
  it('P1: same seed → identical problem (determinism)', () => {
    fc.assert(fc.property(anySeed, (seed) => {
      expect(gen(seed)).toEqual(gen(seed));
    }), { numRuns: 300 });
  });

  it('P2: generation never throws — constraints hold by construction', () => {
    fc.assert(fc.property(anySeed, (seed) => {
      const problem = gen(seed);
      expect(problem.values.x).toBeGreaterThan(0);
      expect(problem.values.x).toBeLessThan(problem.values.n);
      expect(problem.values.n * problem.values.p0).toBeGreaterThanOrEqual(10);
      expect(problem.values.n * (1 - problem.values.p0)).toBeGreaterThanOrEqual(10);
      // One-sided data move WITH the alternative (Codex review) — no p ≈ .99 traps.
      const pHat = problem.values.x / problem.values.n;
      if (problem.values.direction === '>') expect(pHat).toBeGreaterThan(problem.values.p0);
      if (problem.values.direction === '<') expect(pHat).toBeLessThan(problem.values.p0);
    }), { numRuns: 1000 });
  });

  it('P3: recompute totality — stat-math returns finite z and p', () => {
    fc.assert(fc.property(anySeed, (seed) => {
      const { values } = gen(seed);
      const answer = window.TI84StatMath.onePropZTest(values.p0, values.x, values.n, values.direction);
      expect(Number.isFinite(answer.z)).toBe(true);
      expect(Number.isFinite(answer.p)).toBe(true);
      expect(answer.p).toBeGreaterThanOrEqual(1e-4);
      expect(Math.abs(answer.p - 0.5)).toBeGreaterThanOrEqual(0.1);
    }), { numRuns: 300 });
  });

  it('P4: checker round-trip — every informative student rendering is accepted', () => {
    fc.assert(fc.property(anySeed, (seed) => {
      const { values } = gen(seed);
      const answer = window.TI84StatMath.onePropZTest(values.p0, values.x, values.n, values.direction);
      for (const [key, exact] of [['z', answer.z], ['p', answer.p]]) {
        // A rendering that collapses to zero (e.g. "0.00" for p = 0.0011)
        // carries no information and is rightly rejected — skip those.
        const renderings = [String(exact), exact.toFixed(4), exact.toFixed(2)]
          .filter((r) => parseFloat(r) !== 0);
        for (const rendering of renderings) {
          expect(valuesMatch(rendering, exact, key), `${key} as "${rendering}"`).toBe(true);
        }
      }
    }), { numRuns: 300 });
  });

  it('P5: checker discrimination — wrong tail and flipped sign are rejected', () => {
    fc.assert(fc.property(anySeed, (seed) => {
      const { values } = gen(seed);
      const answer = window.TI84StatMath.onePropZTest(values.p0, values.x, values.n, values.direction);
      expect(valuesMatch((1 - answer.p).toFixed(4), answer.p, 'p')).toBe(false);
      expect(valuesMatch((-answer.z).toFixed(4), answer.z, 'z')).toBe(false);
    }), { numRuns: 300 });
  });

  it('P6: stem hygiene — no unfilled slots, numbers present, claim matches direction', () => {
    const DIRECTION_PHRASE = { '<': 'less than', '>': 'greater than', '≠': 'differs from' };
    fc.assert(fc.property(anySeed, (seed) => {
      const { stem, values } = gen(seed);
      expect(stem).not.toMatch(/\{\w+\}/);
      expect(stem).toContain(`${values.n}`);
      expect(stem).toContain(`${values.x}`);
      expect(stem).toContain(`${Math.round(values.p0 * 100)}%`);
      expect(stem).toContain(DIRECTION_PHRASE[values.direction]);
      for (const [direction, phrase] of Object.entries(DIRECTION_PHRASE)) {
        if (direction !== values.direction) {
          expect(stem).not.toContain(phrase);
        }
      }
    }), { numRuns: 300 });
  });

  it('P7: generation is pure — no Math.random or Date.now', () => {
    const originalRandom = Math.random;
    const originalNow = Date.now;
    Math.random = () => { throw new Error('Math.random in template generation'); };
    Date.now = () => { throw new Error('Date.now in template generation'); };
    try {
      fc.assert(fc.property(anySeed, (seed) => {
        expect(gen(seed).templateId).toBe('one-propztest');
      }), { numRuns: 100 });
    } finally {
      Math.random = originalRandom;
      Date.now = originalNow;
    }
  });
});

describe('one-propzint template properties', () => {
  const intTemplate = T.TEMPLATES['one-propzint'];
  const genInt = (seed) => T.generateProblem(intTemplate, seed);

  it('P1: determinism', () => {
    fc.assert(fc.property(anySeed, (seed) => {
      expect(genInt(seed)).toEqual(genInt(seed));
    }), { numRuns: 300 });
  });

  it('P2+P3: constraints hold, endpoints finite and inside (0, 1)', () => {
    fc.assert(fc.property(anySeed, (seed) => {
      const { values } = genInt(seed);
      expect(values.x).toBeGreaterThanOrEqual(10);
      expect(values.n - values.x).toBeGreaterThanOrEqual(10);
      const answer = window.TI84StatMath.onePropZInt(values.x, values.n, values.cLevel);
      expect(answer.lower).toBeGreaterThan(0);
      expect(answer.upper).toBeLessThan(1);
      expect(answer.upper - answer.lower).toBeGreaterThanOrEqual(0.02);
    }), { numRuns: 1000 });
  });

  it('P4+P5: endpoint renderings accepted, swapped endpoints rejected', () => {
    fc.assert(fc.property(anySeed, (seed) => {
      const { values } = genInt(seed);
      const answer = window.TI84StatMath.onePropZInt(values.x, values.n, values.cLevel);
      for (const [key, exact] of [['lower', answer.lower], ['upper', answer.upper]]) {
        for (const rendering of [String(exact), exact.toFixed(4)].filter((r) => parseFloat(r) !== 0)) {
          expect(valuesMatch(rendering, exact, key), `${key} as "${rendering}"`).toBe(true);
        }
      }
      expect(valuesMatch(answer.upper.toFixed(4), answer.lower, 'lower')).toBe(false);
      expect(valuesMatch(answer.lower.toFixed(4), answer.upper, 'upper')).toBe(false);
    }), { numRuns: 300 });
  });

  it('P6: stem hygiene — no unfilled slots, x/n/confidence level present', () => {
    fc.assert(fc.property(anySeed, (seed) => {
      const { stem, values } = genInt(seed);
      expect(stem).not.toMatch(/\{\w+\}/);
      expect(stem).toContain(`${values.n}`);
      expect(stem).toContain(`${values.x}`);
      expect(stem).toContain(`${Math.round(values.cLevel * 100)}%`);
    }), { numRuns: 300 });
  });
});

describe('t-test-stats template properties', () => {
  const tt = T.TEMPLATES['t-test-stats'];
  const genT = (seed) => T.generateProblem(tt, seed);

  it('P1: determinism', () => {
    fc.assert(fc.property(anySeed, (seed) => {
      expect(genT(seed)).toEqual(genT(seed));
    }), { numRuns: 300 });
  });

  it('P2+P3: constraints hold; one-sided data move with the alternative', () => {
    fc.assert(fc.property(anySeed, (seed) => {
      const { values } = genT(seed);
      const answer = window.TI84StatMath.tTest(values.mu0, values.xbar, values.sx, values.n, values.direction);
      expect(Math.abs(answer.t)).toBeGreaterThanOrEqual(0.8);
      expect(Math.abs(answer.t)).toBeLessThanOrEqual(6);
      expect(answer.p).toBeGreaterThanOrEqual(1e-4);
      expect(Math.abs(answer.p - 0.5)).toBeGreaterThanOrEqual(0.1);
      if (values.direction === '>') expect(values.xbar).toBeGreaterThan(values.mu0);
      if (values.direction === '<') expect(values.xbar).toBeLessThan(values.mu0);
    }), { numRuns: 1000 });
  });

  it('P4+P5: renderings accepted; flipped sign and wrong tail rejected', () => {
    fc.assert(fc.property(anySeed, (seed) => {
      const { values } = genT(seed);
      const answer = window.TI84StatMath.tTest(values.mu0, values.xbar, values.sx, values.n, values.direction);
      for (const [key, exact] of [['t', answer.t], ['p', answer.p]]) {
        for (const rendering of [String(exact), exact.toFixed(4)].filter((r) => parseFloat(r) !== 0)) {
          expect(valuesMatch(rendering, exact, key), `${key} as "${rendering}"`).toBe(true);
        }
      }
      expect(valuesMatch((-answer.t).toFixed(4), answer.t, 't')).toBe(false);
      expect(valuesMatch((1 - answer.p).toFixed(4), answer.p, 'p')).toBe(false);
    }), { numRuns: 300 });
  });

  it('P6: stem hygiene — rounded stats appear exactly as typed', () => {
    fc.assert(fc.property(anySeed, (seed) => {
      const { stem, values } = genT(seed);
      expect(stem).not.toMatch(/\{\w+\}/);
      for (const key of ['mu0', 'xbar', 'sx', 'n']) {
        expect(stem).toContain(`${values[key]}`);
      }
    }), { numRuns: 300 });
  });
});

describe('t-interval-stats template properties', () => {
  const ti = T.TEMPLATES['t-interval-stats'];
  const genI = (seed) => T.generateProblem(ti, seed);

  it('P1: determinism', () => {
    fc.assert(fc.property(anySeed, (seed) => {
      expect(genI(seed)).toEqual(genI(seed));
    }), { numRuns: 300 });
  });

  it('P2+P3: constraints hold; endpoints finite with usable width', () => {
    fc.assert(fc.property(anySeed, (seed) => {
      const { values } = genI(seed);
      const answer = window.TI84StatMath.tInterval(values.xbar, values.sx, values.n, values.cLevel);
      expect(Number.isFinite(answer.lower)).toBe(true);
      expect(Number.isFinite(answer.upper)).toBe(true);
      expect(answer.upper - answer.lower).toBeGreaterThanOrEqual(0.15);
    }), { numRuns: 1000 });
  });

  it('P4+P5: endpoint renderings accepted; swapped endpoints rejected', () => {
    fc.assert(fc.property(anySeed, (seed) => {
      const { values } = genI(seed);
      const answer = window.TI84StatMath.tInterval(values.xbar, values.sx, values.n, values.cLevel);
      for (const [key, exact] of [['lower', answer.lower], ['upper', answer.upper]]) {
        for (const rendering of [String(exact), exact.toFixed(4)].filter((r) => parseFloat(r) !== 0)) {
          expect(valuesMatch(rendering, exact, key), `${key} as "${rendering}"`).toBe(true);
        }
      }
      expect(valuesMatch(answer.upper.toFixed(4), answer.lower, 'lower')).toBe(false);
      expect(valuesMatch(answer.lower.toFixed(4), answer.upper, 'upper')).toBe(false);
    }), { numRuns: 300 });
  });

  it('P6: stem hygiene — stats and confidence level present', () => {
    fc.assert(fc.property(anySeed, (seed) => {
      const { stem, values } = genI(seed);
      expect(stem).not.toMatch(/\{\w+\}/);
      for (const key of ['xbar', 'sx', 'n']) {
        expect(stem).toContain(`${values[key]}`);
      }
      expect(stem).toContain(`${Math.round(values.cLevel * 100)}%`);
    }), { numRuns: 300 });
  });
});

describe('seed and hash plumbing', () => {
  it('deriveSeed is deterministic and phase-distinct', () => {
    const a = T.deriveSeed('STU1', 'one-propztest', 'walkthrough', 3);
    expect(T.deriveSeed('STU1', 'one-propztest', 'walkthrough', 3)).toBe(a);
    expect(T.deriveSeed('STU1', 'one-propztest', 'handheld', 3)).not.toBe(a);
    expect(T.deriveSeed('STU1', 'one-propztest', 'walkthrough', 4)).not.toBe(a);
    expect(T.deriveSeed(null, 'one-propztest', 'walkthrough', 3))
      .toBe(T.deriveSeed('anon', 'one-propztest', 'walkthrough', 3));
  });

  it('templateHash changes when the template content changes', () => {
    const base = T.templateHash(template);
    expect(T.templateHash(template)).toBe(base);
    const edited = { ...template, constraints: [...template.constraints, 'true'] };
    expect(T.templateHash(edited)).not.toBe(base);
  });

  it('generated problems carry the current templateHash', () => {
    expect(gen(42).templateHash).toBe(T.templateHash(template));
  });
});
