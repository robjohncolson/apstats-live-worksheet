# TI-84 Trainer — Unit 3 Randomization Procedures

Fills the trainer's only empty unit with the calculator skills AP simulation
FRQs actually require. Design-only until reviewed. Agreed constraint (Codex):
**wave 1 validates PROCEDURE, not exact random sequences** — no TI RNG
(L'Ecuyer) reimplementation. Exact seed→output pinning is a later mini-spike
only if procedural validation proves insufficient.

## 1. Three new procedures (`unit: 3`)

| id | Teaches | Core keystrokes |
|---|---|---|
| `seed-rand` | Seeding makes simulations reproducible | `{seed}` `STO→` `MATH`▸PROB▸`rand` `ENTER` |
| `randint-sampling` | Draw a random sample | seed, then `MATH`▸PROB▸`randInt(` `{lo}`,`{hi}`,`{n}` `)` `ENTER` |
| `randint-assignment` | Random assignment without repeats | seed, then `MATH`▸PROB▸`randIntNoRep(` `{lo}`,`{hi}`,`{n}` `)` `ENTER`, then read off treatment groups |

- Exact step arrays are authored at implementation against the existing
  `menu-tables`/`menu-nav` natives (MATH▸PROB is already a modeled menu).
- Parameter steps use the existing `{slot}` mechanism resolved from
  `problem.values` — no engine changes for the walkthrough phase. **The
  guided/recall walkthrough IS the procedural validation**: it checks the key
  sequence step by step, which is exactly what "validate procedure" means.
- `randint-assignment` ends with 1–2 reflection steps in the stem (which
  participants land in treatment A) rather than checked fields — the
  assignment RULE is the skill; the specific numbers are seed-dependent.

## 2. Canonical problems (2–3 each, hand-authored)

Values carry `{seed, lo, hi, n}` plus context (participants, plots, students).
Stems are AP-styled: "Use your calculator with seed {seed} to select {n} of
the {hi} participants…". Every problem includes an explicit seed step so two
students following instructions get identical output ON THEIR OWN CALCULATORS
— which makes classroom discussion and teacher spot-checks possible without
the trainer ever knowing the values.

No Track C templates for Unit 3 in this wave: generated problems would need
arbitrary seed→output prediction, i.e. the RNG. Canonicals only.

## 3. Handheld check — property validation (the one new engine piece)

These procedures have no `computeExpected` reference, and today that means
the fully self-attested "I did it" path. Wave 1 upgrades that to a **property
check**: the student types the numbers their calculator produced, and the
trainer validates FORM, not values:

```js
PROPERTY_FIELDS = {
  'randint-sampling':   { count: 'n', integer: true, min: 'lo', max: 'hi', distinct: false },
  'randint-assignment': { count: 'n', integer: true, min: 'lo', max: 'hi', distinct: true },
  // seed-rand stays self-attested: its output is a single decimal with no
  // checkable property beyond "is a number in (0,1)" — checked as exactly that.
}
```

- One input field ("the numbers, separated by commas"); the checker parses
  and validates: exactly `n` entries, integers, each in `[lo, hi]`,
  distinct when `randIntNoRep` (the property that DISTINGUISHES the two
  functions — typing repeats after randIntNoRep proves the wrong command ran).
- `checkHandheld` branches to the property path when
  `PROPERTY_FIELDS[procedureId]` exists, BEFORE the null-`computeExpected`
  self-attest fallback. Pass → `finishHandheldMastery` exactly as today.
- Leniency never applies: the check validates the student's own typed
  numbers against pure form rules — there is no emulator flakiness to be
  lenient about. (`emulatorDataLeniency` is untouched; these procedures have
  no data-entry phase, so `problemUsesData` is false anyway.)

## 4. Recognition phase (the real authoring lift)

New `patternSignatures`, `confusionMatrix` rows, and `distractorSets` entries
in the patterns data so Track 1 questions exist. Distractor design:

- `randint-sampling` vs `randint-assignment` vs `seed-rand` confuse with EACH
  OTHER first (when do you need no-repeats? when do you seed?), then with
  `one-var-stats` (the "I'll just compute stats" reflex).
- Signature keywords: "select a random sample" / "assign … to treatments" /
  "reproduce the same random numbers".

## 5. Mock mode (no ROM)

The native sim shows a canned plausible output line (e.g. `{12 47 3 88 21}`)
with a caption "your calculator's numbers will differ — the check accepts
any valid draw." Display-only; never used for validation. Real-emulator mode
shows the ROM's true output (deterministic per seed — free realism).

## 6. Map promotion + audit

`data/ti84-lesson-map.json`: move `3.3: [randint-sampling, seed-rand]` and
`3.6: [randint-assignment]` from `planned` to `lessons`. The existing audit
test enforces this mechanically (planned procedures must not exist; lessons
procedures must). The Desk chip and `#topic=3.3` links light up with zero
Desk changes.

## 7. Tests

1. Data integrity: new procedures/problems pass the existing structural
   suites (steps resolve, screens exist, slots fill).
2. Property-check unit tests: parser (commas/spaces), count/range/integer/
   distinct rules, the randIntNoRep-repeats rejection, `(0,1)` rule for
   seed-rand, and the branch ordering (property path before self-attest).
3. Recognition: new signatures/distractors pass the patterns integrity
   checks; confusion pairs are mutual.
4. Map audit flips: promotion satisfies `planned`→`lessons` rules.
5. App-boot: a `#topic=3.3` practice session serves the two procedures in
   order (extends ti84-practice-links).

## 8. Out of scope

Exact seed→output validation (mini-spike later if wanted — pinning
device-harvested pairs, still no RNG reimplementation), Track C templates for
U3, grades, `.8xm` matrix transfer.

## 9. Rollout

One PR: procedures + problems + patterns data + property-check engine + map
promotion + tests → full suite → teacher smoke (emulator walkthrough + one
physical-calculator handheld check per procedure — the physical check matters
here because the property checker is new).
