# TI-84 Trainer — Serving Generated Problems (Track C runtime, wave 1)

Wires the 8 shipped wave-1 templates (`ti84-trainer-v2/data-templates.js`,
validated per `TI84_TRAINER_TEMPLATES_SPEC.md` §7: 236 tests, 200 scipy pins,
§7C mutation pass) into the trainer. Design-only until reviewed.

## 0. Scope

- **Handheld check only** in this wave. It is where fixed problems hurt most
  (the student just walked through the same canonical problem) and where the
  templates spec §3 already assigned generated problems. Walkthrough serving
  is a later wave; recognition and branch walkthroughs stay canonical
  permanently (review decision §10.6).
- Only procedures with a template in `TI84V2Templates.TEMPLATES` are affected
  (the 8 stats-input wizards). Everything else serves canonicals unchanged.

## 1. `pickProblem(procedureId, phase)`

New app.js helper; the handheld serve point (`startHandheldCheck`, currently
`pickRandom(canonicalProblems[procedureId])`) calls
`pickProblem(procedureId, 'handheld')` instead.

```js
function pickProblem(procedureId, phase) {
  const canonical = () => pickRandom(PATTERNS.canonicalProblems[procedureId]);
  if (!generatedProblemsEnabled()) return canonical();
  const template = window.TI84V2Templates?.TEMPLATES?.[procedureId];
  if (!template || !template.phases.includes(phase)) return canonical();
  try {
    const gen = genState(procedureId, phase);           // { attempt }
    const studentId = window.rosterClient?.current?.()?.studentId ?? 'anon';
    const seed = window.TI84V2Templates.deriveSeed(studentId, procedureId, phase, gen.attempt);
    const problem = window.TI84V2Templates.generateProblem(template, seed);
    gen.lastSeed = seed;
    gen.templateHash = problem.templateHash;
    savePersisted();
    return problem;
  } catch (error) {
    console.warn(`[templates] generation failed for ${procedureId}/${phase} — serving canonical`, error);
    return canonical();
  }
}
```

- **Canonical fallback on every exit path** — flag off, no template, wrong
  phase, missing script, generation throw. Students can never hit a dead end.
- Signed-out students hash as `'anon'` (templates spec §4); their attempt
  counter still persists in trainer-local state like every other record field.

## 2. Attempt counter — explicit, advanced only by recorded outcomes

Do NOT derive the attempt from existing SM-2 fields (repetitions/exposures
serve scheduling and their semantics must stay free to change). Store an
explicit per-phase counter on the procedure record:

```js
records[procedureId].gen = {
  handheld: { attempt: 0, lastSeed: null, templateHash: null },
}
```

- `pickProblem` READS the counter; it never advances it. Reload/re-serve →
  same seed → same problem (no reroll-fishing, templates spec §4).
- The counter increments in exactly the code paths that record a handheld
  outcome: `recordHandheldMastery` (confirm) and the skip path if it records.
  One increment per recorded outcome, after the record succeeds locally.
- `lastSeed` + `templateHash` give the teacher exact regeneration (review
  decision §10.4 — stored lookup, no UI display).

## 3. Flag

`generatedProblemsEnabled()` = `?gen=off` URL override → false, else
`app.persisted.generatedProblems !== false` (default ON). Same shape as the
autofill flag — an operator escape hatch, not a student setting.

## 4. UI

No new UI. The handheld card renders `problem.stem` exactly as it renders a
canonical stem (`values` speak the same vocabulary, `computeExpected` and
`VERIFICATION_FIELDS` work unchanged). No seed display, no "generated" badge
in this wave — the stem text is simply different per student/attempt.

## 5. Build wiring

- `build.mjs`: embed `data-templates.js` in `standalone.html` (load order:
  after `native/stat-math.js` — `recompute` calls `window.TI84StatMath` — and
  before `app.js`).
- `index.html` (trainer dev page): add the script tag with the same ordering.
- Missing/failed script load degrades to canonicals via the
  `window.TI84V2Templates?` guard in `pickProblem`.

## 6. Tests (extend the app-boot pattern from ti84-autofill-fallback)

1. Flag off / no template / non-template procedure → canonical served.
2. Template procedure signed in → handheld stem differs from every canonical
   stem for that procedure, and `values` keys match the canonical vocabulary.
3. Reload without recording → identical problem (same seed).
4. Recorded outcome → attempt increments → next serve differs.
5. `generateProblem` forced to throw (stub) → canonical + console.warn.
6. Signed-out → 'anon' seeding, still deterministic.
7. `ti84-standalone-sync` keeps passing after the build.mjs change.

## 7. Rollout

One PR: build wiring + `pickProblem` + counter + tests → full root suite →
push → teacher smoke on the public URL (one templated procedure's handheld
check twice: same problem before recording, fresh numbers after; one
non-template procedure unchanged; one `?gen=off` run).

Out of scope: walkthrough-phase serving ("fresh numbers" banner UX),
parameterized recognition stems, χ²/matrix templates, any SM-2 changes.
