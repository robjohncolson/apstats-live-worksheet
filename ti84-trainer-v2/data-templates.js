// Seeded parameterized problem templates — Track C wave 1, first template only
// (TI84_TRAINER_TEMPLATES_SPEC.md, review-approved 2026-07-05).
//
// NOT wired into serving yet: build.mjs picks this file up only when the
// runtime lands. Generated problems speak the exact values vocabulary that
// computeExpected/stat-math.js already dispatch on — the template carries
// inputs only, never answers.
(function () {
  // FNV-1a over a string → unsigned 32-bit.
  function fnv1a(str) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i += 1) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }

  // Deterministic PRNG over a 32-bit seed. No Math.random anywhere in this
  // file — generation must be pure so a stored seed replays exactly.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Seed recipe (spec §4): attempt = count of RECORDED outcomes, so a reload
  // reproduces the same problem. Signed-out students hash as 'anon'.
  function deriveSeed(studentId, procedureId, phase, attempt) {
    return fnv1a(`${studentId || 'anon'}|${procedureId}|${phase}|${attempt}`);
  }

  // Content hash binding stored seeds and committed pins to the exact template
  // (review decision §10.5): any edit changes the hash, so stale pins fail
  // loudly instead of relying on a human bumping a version number.
  function templateHash(template) {
    return fnv1a(JSON.stringify({
      id: template.id,
      params: template.params,
      derive: template.derive.toString(),
      recompute: template.recompute.toString(),
      constraints: template.constraints,
      stems: template.stems,
      valueKeys: template.valueKeys,
    })).toString(16).padStart(8, '0');
  }

  function drawParam(spec, next) {
    if (spec.grid) return spec.grid[Math.floor(next() * spec.grid.length)];
    if (spec.oneOf) return spec.oneOf[Math.floor(next() * spec.oneOf.length)];
    const steps = Math.floor((spec.max - spec.min) / spec.step) + 1;
    return spec.min + Math.floor(next() * steps) * spec.step;
  }

  function renderSlots(text, slots) {
    return text.replace(/\{(\w+)\}/g, (match, name) => (name in slots ? `${slots[name]}` : match));
  }

  // Fixed generation order (spec §5): pick skin → apply overrides → draw params
  // in declaration order → derive → assemble values → render stem → assert.
  // Constraints hold by construction; a failure here is a template bug, and the
  // runtime caller falls back to the canonical problem.
  function generateProblem(template, seed) {
    const next = mulberry32(seed);

    const skin = template.stems[Math.floor(next() * template.stems.length)];
    const specs = { ...template.params, ...(skin.paramOverrides ?? {}) };
    if (skin.directions) {
      specs.direction = { oneOf: skin.directions };
    }

    const p = {};
    for (const name of Object.keys(template.params)) {
      p[name] = drawParam(specs[name], next);
    }
    Object.assign(p, template.derive(p));

    const values = {};
    for (const key of template.valueKeys) {
      values[key] = p[key];
    }

    const answer = template.recompute(values);

    for (const expr of template.constraints) {
      if (!new Function('p', 'values', 'answer', `return (${expr});`)(p, values, answer)) {
        throw new Error(`Template ${template.id} seed ${seed} violated: ${expr}`);
      }
    }

    const slots = {
      n: p.n,
      x: p.x,
    };
    if (p.p0 !== undefined) slots.p0pct = Math.round(p.p0 * 100);
    if (p.cLevel !== undefined) slots.clpct = Math.round(p.cLevel * 100);
    if (skin.claims && p.direction) {
      slots.claim = renderSlots(skin.claims[p.direction], slots);
    }
    const stem = renderSlots(skin.text, slots);

    return {
      stem,
      values,
      frameworkSkill: template.frameworkSkill,
      unit: template.unit,
      seed,
      templateId: template.id,
      templateHash: templateHash(template),
    };
  }

  // ---------- wave 1, template 1: one-proportion z test ----------
  //
  // Constructive bounds: p0 grid × n range keep np0 and n(1-p0) ≥ 16; kSE in
  // ±[1.5, 3] keeps |z| ≈ 1.4–3.1 after x rounding, so the p-value stays out
  // of both the (0.4, 0.6) checker-ambiguity band and the < 1e-4 floor.
  const TEMPLATES = {
    'one-propztest': {
      id: 'one-propztest',
      procedureId: 'one-propztest',
      phases: ['walkthrough', 'handheld'],
      params: {
        p0: { grid: [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8] },
        n: { min: 80, max: 400, step: 20 },
        direction: { oneOf: ['<', '>', '≠'] },
        kSE: { grid: [-3, -2.5, -2, -1.5, 1.5, 2, 2.5, 3] },
      },
      derive(p) {
        // One-sided alternatives get data that move WITH the claim (Codex
        // review: opposite-direction samples give p ≈ .99 — statistically
        // valid but a trap for calculator-procedure practice). Two-sided
        // keeps the drawn sign, so both sides still appear under '≠'.
        const sign = p.direction === '>' ? 1 : p.direction === '<' ? -1 : Math.sign(p.kSE);
        const kSE = sign * Math.abs(p.kSE);
        const se = Math.sqrt(p.p0 * (1 - p.p0) / p.n);
        const x = Math.round(p.n * (p.p0 + kSE * se));
        return { x };
      },
      recompute(values) {
        return window.TI84StatMath.onePropZTest(values.p0, values.x, values.n, values.direction);
      },
      valueKeys: ['p0', 'x', 'n', 'direction'],
      constraints: [
        'p.n * p.p0 >= 10',
        'p.n * (1 - p.p0) >= 10',
        'p.x > 0 && p.x < p.n',
        'answer.p >= 1e-4',
        'Math.abs(answer.p - 0.5) >= 0.1',
        'Number.isFinite(answer.z) && Number.isFinite(answer.p)',
        "p.direction === '≠' || (p.direction === '>' ? p.x / p.n > p.p0 : p.x / p.n < p.p0)",
      ],
      stems: [
        {
          id: 'satisfaction',
          directions: ['<', '>'],
          paramOverrides: { p0: { grid: [0.6, 0.65, 0.7, 0.75, 0.8] } },
          text: 'A district claims {p0pct}% of students are satisfied with the new schedule. A counselor surveys {n} randomly selected students and {x} say they are satisfied. Test whether the true proportion {claim}.',
          claims: {
            '<': 'is less than the claimed {p0pct}%',
            '>': 'is greater than the claimed {p0pct}%',
          },
        },
        {
          id: 'germination',
          directions: ['<'],
          paramOverrides: { p0: { grid: [0.75, 0.8] }, kSE: { grid: [-3, -2.5, -2, -1.5] } },
          text: 'A seed company claims {p0pct}% of its tomato seeds germinate. A greenhouse plants {n} seeds and {x} germinate. Test whether the true germination rate {claim}.',
          claims: {
            '<': 'is less than the advertised {p0pct}%',
          },
        },
        {
          id: 'recycling',
          text: 'City officials report that {p0pct}% of households participate in curbside recycling. An auditor checks {n} randomly selected households and finds {x} participating. Test whether the true participation rate {claim}.',
          claims: {
            '<': 'is less than the reported {p0pct}%',
            '>': 'is greater than the reported {p0pct}%',
            '≠': 'differs from the reported {p0pct}%',
          },
        },
      ],
      frameworkSkill: 'VAR-6.G',
      unit: 6,
    },

    // Same contexts as the test template, interval phrasing. pTrue is a
    // helper param (like kSE): x derives from it, only x/n/cLevel are values.
    // Grid bounds make x >= 16 and n - x >= 16, so the AP conditions and
    // in-(0,1) endpoints hold by construction.
    'one-propzint': {
      id: 'one-propzint',
      procedureId: 'one-propzint',
      phases: ['walkthrough', 'handheld'],
      params: {
        pTrue: { grid: [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8] },
        n: { min: 80, max: 400, step: 20 },
        cLevel: { oneOf: [0.90, 0.95, 0.99] },
      },
      derive(p) {
        return { x: Math.round(p.n * p.pTrue) };
      },
      recompute(values) {
        return window.TI84StatMath.onePropZInt(values.x, values.n, values.cLevel);
      },
      valueKeys: ['x', 'n', 'cLevel'],
      constraints: [
        'p.x >= 10',
        'p.n - p.x >= 10',
        'answer.lower > 0 && answer.upper < 1',
        'answer.upper - answer.lower >= 0.02',
        'Number.isFinite(answer.lower) && Number.isFinite(answer.upper)',
      ],
      stems: [
        {
          id: 'satisfaction',
          text: 'A counselor surveys {n} randomly selected students and {x} say they are satisfied with the new schedule. Construct a {clpct}% confidence interval for the true proportion of satisfied students.',
        },
        {
          id: 'recycling',
          text: 'An auditor checks {n} randomly selected households and finds {x} participating in curbside recycling. Construct a {clpct}% confidence interval for the true participation rate.',
        },
        {
          id: 'germination',
          paramOverrides: { pTrue: { grid: [0.7, 0.75, 0.8] } },
          text: 'A greenhouse plants {n} tomato seeds from a new supplier and {x} germinate. Construct a {clpct}% confidence interval for the true germination rate.',
        },
      ],
      frameworkSkill: 'UNC-4.C',
      unit: 6,
    },
  };

  window.TI84V2Templates = {
    fnv1a,
    mulberry32,
    deriveSeed,
    templateHash,
    generateProblem,
    TEMPLATES,
  };
}());
