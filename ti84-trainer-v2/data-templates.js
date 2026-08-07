// Seeded parameterized problem templates — Track C wave 1, all 8 stats-input
// inference wizards (TI84_TRAINER_TEMPLATES_SPEC.md, review-approved
// 2026-07-05): one/two-prop z test+interval, one/two-sample t test+interval.
//
// NOT wired into serving yet: build.mjs picks this file up only when the
// runtime lands. Generated problems speak the exact values vocabulary that
// computeExpected/stat-math.js already dispatch on — the template carries
// inputs only, never answers.
//
// Each template's `frameworkSkill` is a Fall-2026 CED code from
// data/skill-taxonomy-ced2026.json (W8b) — re-homed from the dead 2019-CED
// Big-Idea axis (VAR/UNC/DAT). All 8 templated procedures survive the
// Fall-2026 CED, so all 8 get a real taxonomy code.
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

    // Every param and derived value is a stem slot, plus percent conveniences.
    const slots = { ...p };
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
      frameworkSkill: '3.E',
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
      frameworkSkill: '3.C',
      unit: 6,
    },

    // One-sample t test from summary stats. Round-first rule (spec §5): sx and
    // xbar are rounded to 1dp INSIDE derive, so the stem shows exactly what
    // the student types and the answer is recomputed from the rounded values.
    // Bounds keep |t| in ~[1.05, 3.45] after rounding — outside the checker's
    // (0.4, 0.6) p-value ambiguity band, above the 1e-4 floor.
    't-test-stats': {
      id: 't-test-stats',
      procedureId: 't-test-stats',
      phases: ['walkthrough', 'handheld'],
      params: {
        mu0: { min: 10, max: 200, step: 5 },
        n: { min: 12, max: 45, step: 1 },
        sxRel: { grid: [0.08, 0.1, 0.12, 0.15] },
        direction: { oneOf: ['<', '>', '≠'] },
        kSE: { grid: [-3, -2.5, -2, -1.5, 1.5, 2, 2.5, 3] },
      },
      derive(p) {
        const round1 = (v) => Math.round(v * 10) / 10;
        const sx = round1(p.mu0 * p.sxRel);
        const sign = p.direction === '>' ? 1 : p.direction === '<' ? -1 : Math.sign(p.kSE);
        const xbar = round1(p.mu0 + sign * Math.abs(p.kSE) * (sx / Math.sqrt(p.n)));
        return { sx, xbar };
      },
      recompute(values) {
        return window.TI84StatMath.tTest(values.mu0, values.xbar, values.sx, values.n, values.direction);
      },
      valueKeys: ['mu0', 'xbar', 'sx', 'n', 'direction'],
      constraints: [
        'p.n >= 12',
        'p.sx > 0',
        'answer.p >= 1e-4',
        'Math.abs(answer.p - 0.5) >= 0.1',
        'Math.abs(answer.t) >= 0.8 && Math.abs(answer.t) <= 6',
        "p.direction === '≠' || (p.direction === '>' ? p.xbar > p.mu0 : p.xbar < p.mu0)",
        'Number.isFinite(answer.t) && Number.isFinite(answer.p)',
      ],
      stems: [
        {
          id: 'battery',
          // Realism (Codex review): battery life in minutes must be laptop-like.
          paramOverrides: { mu0: { min: 180, max: 600, step: 10 } },
          text: 'A manufacturer claims its laptop battery lasts {mu0} minutes on average. A reviewer tests {n} laptops and finds a mean of {xbar} minutes with a standard deviation of {sx} minutes. Test whether the true mean battery life {claim}.',
          claims: {
            '<': 'is less than the claimed {mu0} minutes',
            '>': 'is greater than the claimed {mu0} minutes',
            '≠': 'differs from the claimed {mu0} minutes',
          },
        },
        {
          id: 'commute',
          paramOverrides: { mu0: { min: 15, max: 90, step: 5 } },
          text: 'A transit authority reports an average commute of {mu0} minutes on a bus route. A rider times {n} random trips: mean {xbar} minutes, standard deviation {sx} minutes. Test whether the true mean commute time {claim}.',
          claims: {
            '<': 'is less than the reported {mu0} minutes',
            '>': 'is greater than the reported {mu0} minutes',
            '≠': 'differs from the reported {mu0} minutes',
          },
        },
      ],
      frameworkSkill: '3.E',
      unit: 7,
    },

    // One-sample t interval from summary stats — same contexts, same
    // round-first rule; muTrue and kOff are helper params.
    't-interval-stats': {
      id: 't-interval-stats',
      procedureId: 't-interval-stats',
      phases: ['walkthrough', 'handheld'],
      params: {
        muTrue: { min: 10, max: 200, step: 5 },
        n: { min: 12, max: 45, step: 1 },
        sxRel: { grid: [0.08, 0.1, 0.12, 0.15] },
        cLevel: { oneOf: [0.90, 0.95, 0.99] },
        kOff: { grid: [-1, -0.5, 0, 0.5, 1] },
      },
      derive(p) {
        const round1 = (v) => Math.round(v * 10) / 10;
        const sx = round1(p.muTrue * p.sxRel);
        const xbar = round1(p.muTrue + p.kOff * (sx / Math.sqrt(p.n)));
        return { sx, xbar };
      },
      recompute(values) {
        return window.TI84StatMath.tInterval(values.xbar, values.sx, values.n, values.cLevel);
      },
      valueKeys: ['xbar', 'sx', 'n', 'cLevel'],
      constraints: [
        'p.n >= 12',
        'p.sx > 0',
        'answer.upper - answer.lower >= 0.15',
        'Number.isFinite(answer.lower) && Number.isFinite(answer.upper)',
      ],
      stems: [
        {
          id: 'battery',
          paramOverrides: { muTrue: { min: 180, max: 600, step: 10 } },
          text: 'A reviewer tests {n} laptops of the same model and finds a mean battery life of {xbar} minutes with a standard deviation of {sx} minutes. Construct a {clpct}% confidence interval for the true mean battery life.',
        },
        {
          id: 'commute',
          paramOverrides: { muTrue: { min: 15, max: 90, step: 5 } },
          text: 'A rider times {n} random trips on a bus route: mean {xbar} minutes, standard deviation {sx} minutes. Construct a {clpct}% confidence interval for the true mean commute time.',
        },
      ],
      frameworkSkill: '3.C',
      unit: 7,
    },

    // Two-proportion z test. pBase anchors group 2; group 1 derives from a
    // target effect in SE units, sign-locked to one-sided directions. pBase
    // >= 0.35 with n >= 100 keeps all FOUR group conditions >= 10 even at the
    // extreme p1 = pBase - 3*SE. The test statistic uses TI's pooled p-hat
    // (stat-math twoPropZTest); the scipy reference mirrors pooled.
    'two-propztest': {
      id: 'two-propztest',
      procedureId: 'two-propztest',
      phases: ['walkthrough', 'handheld'],
      params: {
        pBase: { grid: [0.35, 0.4, 0.45, 0.5, 0.55, 0.6] },
        n1: { min: 100, max: 300, step: 20 },
        n2: { min: 100, max: 300, step: 20 },
        direction: { oneOf: ['<', '>', '≠'] },
        kSE: { grid: [-3, -2.5, -2, -1.5, 1.5, 2, 2.5, 3] },
      },
      derive(p) {
        const sign = p.direction === '>' ? 1 : p.direction === '<' ? -1 : Math.sign(p.kSE);
        const se0 = Math.sqrt(p.pBase * (1 - p.pBase) * (1 / p.n1 + 1 / p.n2));
        const x2 = Math.round(p.n2 * p.pBase);
        const x1 = Math.round(p.n1 * (p.pBase + sign * Math.abs(p.kSE) * se0));
        return { x1, x2 };
      },
      recompute(values) {
        return window.TI84StatMath.twoPropZTest(values.x1, values.n1, values.x2, values.n2, values.direction);
      },
      valueKeys: ['x1', 'n1', 'x2', 'n2', 'direction'],
      constraints: [
        'p.x1 >= 10 && p.n1 - p.x1 >= 10',
        'p.x2 >= 10 && p.n2 - p.x2 >= 10',
        'answer.p >= 1e-4',
        'Math.abs(answer.p - 0.5) >= 0.1',
        "p.direction === '≠' || (p.direction === '>' ? p.x1 / p.n1 > p.x2 / p.n2 : p.x1 / p.n1 < p.x2 / p.n2)",
        'Number.isFinite(answer.z) && Number.isFinite(answer.p)',
      ],
      stems: [
        {
          id: 'tutoring',
          text: 'Two schools run different tutoring programs. At School 1, {x1} of {n1} randomly sampled students passed the state exam; at School 2, {x2} of {n2} passed. Test whether School 1’s true passing rate {claim}.',
          claims: {
            '<': 'is less than School 2’s',
            '>': 'is greater than School 2’s',
            '≠': 'differs from School 2’s',
          },
        },
        {
          id: 'ads',
          text: 'A company tests two versions of an ad. Version 1 was shown to {n1} people and {x1} clicked; Version 2 was shown to {n2} people and {x2} clicked. Test whether Version 1’s true click rate {claim}.',
          claims: {
            '<': 'is less than Version 2’s',
            '>': 'is greater than Version 2’s',
            '≠': 'differs from Version 2’s',
          },
        },
      ],
      frameworkSkill: '3.E',
      unit: 6,
    },

    // Two-proportion z interval — independent true proportions per group;
    // grid bounds keep every count >= 30. Unpooled SE (TI 2-PropZInt).
    'two-propzint': {
      id: 'two-propzint',
      procedureId: 'two-propzint',
      phases: ['walkthrough', 'handheld'],
      params: {
        p1True: { grid: [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7] },
        p2True: { grid: [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7] },
        n1: { min: 100, max: 300, step: 20 },
        n2: { min: 100, max: 300, step: 20 },
        cLevel: { oneOf: [0.90, 0.95, 0.99] },
      },
      derive(p) {
        return { x1: Math.round(p.n1 * p.p1True), x2: Math.round(p.n2 * p.p2True) };
      },
      recompute(values) {
        return window.TI84StatMath.twoPropZInt(values.x1, values.n1, values.x2, values.n2, values.cLevel);
      },
      valueKeys: ['x1', 'n1', 'x2', 'n2', 'cLevel'],
      constraints: [
        'p.x1 >= 10 && p.n1 - p.x1 >= 10',
        'p.x2 >= 10 && p.n2 - p.x2 >= 10',
        'answer.upper - answer.lower >= 0.02',
        'Number.isFinite(answer.lower) && Number.isFinite(answer.upper)',
      ],
      stems: [
        {
          id: 'tutoring',
          text: 'At School 1, {x1} of {n1} randomly sampled students passed the state exam; at School 2, {x2} of {n2} passed. Construct a {clpct}% confidence interval for the difference in true passing rates (School 1 − School 2).',
        },
        {
          id: 'ads',
          text: 'Version 1 of an ad was shown to {n1} people and {x1} clicked; Version 2 was shown to {n2} people and {x2} clicked. Construct a {clpct}% confidence interval for the difference in true click rates (Version 1 − Version 2).',
        },
      ],
      frameworkSkill: '3.C',
      unit: 6,
    },

    // Two-sample t test from stats — Welch (Pooled: No), matching
    // computeExpected's pooled=false. Round-first rule as in the one-sample
    // pair; group 2 anchors at muBase, group 1 derives from a target effect.
    'two-samp-ttest': {
      id: 'two-samp-ttest',
      procedureId: 'two-samp-ttest',
      phases: ['walkthrough', 'handheld'],
      params: {
        muBase: { min: 40, max: 200, step: 5 },
        n1: { min: 15, max: 40, step: 1 },
        n2: { min: 15, max: 40, step: 1 },
        s1Rel: { grid: [0.08, 0.1, 0.12, 0.15] },
        s2Rel: { grid: [0.08, 0.1, 0.12, 0.15] },
        direction: { oneOf: ['<', '>', '≠'] },
        kSE: { grid: [-3, -2.5, -2, -1.5, 1.5, 2, 2.5, 3] },
      },
      derive(p) {
        const round1 = (v) => Math.round(v * 10) / 10;
        const sx1 = round1(p.muBase * p.s1Rel);
        const sx2 = round1(p.muBase * p.s2Rel);
        const se = Math.sqrt((sx1 * sx1) / p.n1 + (sx2 * sx2) / p.n2);
        const sign = p.direction === '>' ? 1 : p.direction === '<' ? -1 : Math.sign(p.kSE);
        const xbar1 = round1(p.muBase + sign * Math.abs(p.kSE) * se);
        return { sx1, sx2, xbar1, xbar2: p.muBase };
      },
      recompute(values) {
        return window.TI84StatMath.twoSampTTest(
          values.xbar1, values.sx1, values.n1,
          values.xbar2, values.sx2, values.n2,
          values.direction, false,
        );
      },
      valueKeys: ['xbar1', 'sx1', 'n1', 'xbar2', 'sx2', 'n2', 'direction'],
      constraints: [
        'p.n1 >= 15 && p.n2 >= 15',
        'p.sx1 > 0 && p.sx2 > 0',
        'answer.p >= 1e-4',
        'Math.abs(answer.p - 0.5) >= 0.1',
        'Math.abs(answer.t) >= 0.8 && Math.abs(answer.t) <= 6',
        "p.direction === '≠' || (p.direction === '>' ? p.xbar1 > p.xbar2 : p.xbar1 < p.xbar2)",
        'Number.isFinite(answer.t) && Number.isFinite(answer.p)',
      ],
      stems: [
        {
          id: 'brands',
          paramOverrides: { muBase: { min: 180, max: 600, step: 10 } },
          text: 'A consumer group compares two battery brands. Brand 1: {n1} batteries, mean life {xbar1} minutes, SD {sx1}. Brand 2: {n2} batteries, mean life {xbar2} minutes, SD {sx2}. Test whether Brand 1’s true mean life {claim}.',
          claims: {
            '<': 'is less than Brand 2’s',
            '>': 'is greater than Brand 2’s',
            '≠': 'differs from Brand 2’s',
          },
        },
        {
          id: 'routes',
          paramOverrides: { muBase: { min: 20, max: 90, step: 5 } },
          text: 'A commuter compares two routes to work. Route 1: {n1} trips, mean {xbar1} minutes, SD {sx1}. Route 2: {n2} trips, mean {xbar2} minutes, SD {sx2}. Test whether Route 1’s true mean time {claim}.',
          claims: {
            '<': 'is less than Route 2’s',
            '>': 'is greater than Route 2’s',
            '≠': 'differs from Route 2’s',
          },
        },
      ],
      frameworkSkill: '3.E',
      unit: 7,
    },

    // Two-sample t interval — Welch df, same anchor-and-offset construction.
    'two-samp-tint': {
      id: 'two-samp-tint',
      procedureId: 'two-samp-tint',
      phases: ['walkthrough', 'handheld'],
      params: {
        muBase: { min: 40, max: 200, step: 5 },
        n1: { min: 15, max: 40, step: 1 },
        n2: { min: 15, max: 40, step: 1 },
        s1Rel: { grid: [0.08, 0.1, 0.12, 0.15] },
        s2Rel: { grid: [0.08, 0.1, 0.12, 0.15] },
        cLevel: { oneOf: [0.90, 0.95, 0.99] },
        kOff: { grid: [-1, -0.5, 0, 0.5, 1] },
      },
      derive(p) {
        const round1 = (v) => Math.round(v * 10) / 10;
        const sx1 = round1(p.muBase * p.s1Rel);
        const sx2 = round1(p.muBase * p.s2Rel);
        const se = Math.sqrt((sx1 * sx1) / p.n1 + (sx2 * sx2) / p.n2);
        const xbar1 = round1(p.muBase + p.kOff * se);
        return { sx1, sx2, xbar1, xbar2: p.muBase };
      },
      recompute(values) {
        return window.TI84StatMath.twoSampTInt(
          values.xbar1, values.sx1, values.n1,
          values.xbar2, values.sx2, values.n2,
          values.cLevel, false,
        );
      },
      valueKeys: ['xbar1', 'sx1', 'n1', 'xbar2', 'sx2', 'n2', 'cLevel'],
      constraints: [
        'p.n1 >= 15 && p.n2 >= 15',
        'p.sx1 > 0 && p.sx2 > 0',
        'answer.upper - answer.lower >= 0.15',
        'Number.isFinite(answer.lower) && Number.isFinite(answer.upper)',
      ],
      stems: [
        {
          id: 'brands',
          paramOverrides: { muBase: { min: 180, max: 600, step: 10 } },
          text: 'A consumer group tests two battery brands. Brand 1: {n1} batteries, mean life {xbar1} minutes, SD {sx1}. Brand 2: {n2} batteries, mean life {xbar2} minutes, SD {sx2}. Construct a {clpct}% confidence interval for the difference in true mean life (Brand 1 − Brand 2).',
        },
        {
          id: 'routes',
          paramOverrides: { muBase: { min: 20, max: 90, step: 5 } },
          text: 'A commuter times two routes. Route 1: {n1} trips, mean {xbar1} minutes, SD {sx1}. Route 2: {n2} trips, mean {xbar2} minutes, SD {sx2}. Construct a {clpct}% confidence interval for the difference in true mean time (Route 1 − Route 2).',
        },
      ],
      frameworkSkill: '3.C',
      unit: 7,
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
