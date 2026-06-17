# GRADE_SIMULATION_FINDINGS.md

> Findings from the grade-policy simulator (`GRADE_SIMULATION_SPEC.md`). Each finding is a property
> the simulator either confirmed holds or surfaced as a perverse incentive, with a minimal
> reproducer and the policy question it raises **for the teacher to decide**. The simulator is
> read-only over the live engine — nothing here changes a grade; it reports what the current policy
> *does*.

## Confirmed sound (the policy holds on these axes)

| # | Property | Verdict |
|---|----------|---------|
| A1 | Every grade output ∈ [0,100] (no decision path > 100 — the Show-Answers exploit class) | **HOLDS** (600-run fuzz) |
| A2 | `ceiling ≥ quarterGrade` (never above your own best case) | **HOLDS** (600-run fuzz) |
| A3 | Raising the *score of a present item* never lowers the grade (max/mean stays monotonic) | **HOLDS** (600-run fuzz) |
| A6 | Attempting a due quiz (even for 0 credit) never lowers the grade vs leaving it blank | **HOLDS** |
| A7 | Single-track ceiling: one present track < 40% caps the quarter at 70 | **HOLDS** (3147/4000 fuzz hits) |
| A8 | Both tracks ≥ 40% ⇒ quarterGrade ≈ max(pcAvg, workAvg) | **HOLDS** (853/4000 fuzz hits) |
| A9 | A fully-null track is renormalized away (no phantom 0) | **HOLDS** (early-snapshot) |

> **A4 was specified as HOLDS ("adding a 100% item to a due slot never lowers the grade") and the
> simulator REFUTED it** — fast-check shrank a random trajectory to a single worksheet blank. It is
> reclassified as FINDING F3 below. This corrected an incorrect assumption in the spec author's own
> reasoning — exactly what the fuzzer is for.

Archetype sanity (end-to-end floor/ceiling): a diligent on-pace student scores ≥ 90; a pure-PC
gamer and a pure-work grinder are each capped at ~70 by the 40%-floor / 70%-ceiling gate. The
single-track gaming bound holds through the *whole* pipeline, not just `quarterGradeV3`.

## FINDING F1 — doing more (ahead-of-schedule) work can LOWER your grade

**Severity:** medium. **Status: ✅ FIXED & SHIPPED 2026-06-16** (`v3FixQuizZero` + `v3AheadOfSchedule
Lessons: 'not-until-due'`). The original finding is still pinned (under the legacy config) by
`grade-sim.test.js` (A5); the fix is verified by `grade-sim-fixes.test.js` (the drop is gone, the
smoking-gun delta is +0.0). See GRADE_FIX_F1_F3_BUILD.md and FINDING F4 for why `not-until-due` was
chosen over `only-helps`.

### Reproducer (exact, from the simulator's fixture world)

A student who has done **all currently-due work perfectly** and not yet taken the PC:

| | quarterGrade | Lessons track | Quiz track | workAvg |
|---|---|---|---|---|
| Baseline (all due work = 100%) | **70.0** | 100 | 100 (2/2 taken) | 100 |
| **+ starts the *future* lesson 2.1 and does it at 20%** | **56.0** | 86.7 | 66.7 (2/3 taken) | 80 |

**Doing strictly more work cost the student 14 points.**

### Why it happens

A lesson counts as "due" the moment it has *any* recorded work (the engine's "if the work is done,
count it" rule, `computeQuarterV3`). So starting a not-yet-due lesson pulls it into **two**
denominators at once:

1. **Lessons track** — the new lesson joins at its (low) score, dragging the mean down (100 → 86.7).
2. **Quiz track** — if the new lesson is quiz-bearing, its *un-taken* quiz now counts as a **0**
   (the lesson is "due" so a missing quiz is a zero), even though the student never claimed to be
   ready for that quiz (100 → 66.7).

The PC track masks this when PC ≥ 40% (the grade becomes `max(pc, work)`), so it bites hardest
exactly the students leaning on the Work track — the ones we most want to encourage.

### The policy question (teacher decides)

Is "starting tomorrow's lesson early shouldn't hurt today's grade" a property we want? Options, in
rough order of surgical-ness:

- **Accept it** — tell students "don't start a lesson you're not ready to finish." (No code change.)
- **Only count an ahead-of-schedule lesson once it's *complete*** (e.g., worksheet ≥ some threshold)
  rather than on first touch — so a half-done future lesson doesn't enter the denominator.
- **Decouple the quiz zero** — an un-taken quiz on a not-yet-*scheduled-due* lesson stays absent
  (null) instead of 0, even when the worksheet has work. (Targets mechanism #2, the bigger driver.)

No change recommended without your call — this is a values question about how to treat early work,
not a bug in the arithmetic.

## FINDING F2 — the v3 work weights + the 40/70 gates are NOT config-tunable

**Severity:** low (design observation, blocks part of Layer B). **Status:** confirmed by code read.

`grade-config.js`'s header states "Every §7 pilot-tunable knob lives here and nowhere else." That is
**not true for the v3 model**: `V3_WORK_WEIGHTS` (lessons/quizzes/posters/blooket = .30/.30/.30/.10)
and the gate constants in `quarterGradeV3` (the `0.40` floor and the `0.7` single-track ceiling) are
**hardcoded module constants in `lesson-grade.js`** — `computeQuarterV3` calls `workAvgV3(tracks)`
without passing weights, so there is no `config` hook. The Phase-3 knobs that *are* config-reachable
(and therefore sweepable drift-free through `computeGrade`) are: `C`, `lessonFeederWeights`,
`quarters[*].pcAnchor`, `frqBand`, `v3LessonsExcludeQuiz`.

**Implication for Layer B:** a sweep over the work weights or the floors — arguably the most
interesting tuning axis — requires a small engine change first (thread `V3_WORK_WEIGHTS` and the gate
constants through `config`, defaulting to today's values). That's a one-time, low-risk refactor, but
it IS a grade-engine edit (`roster-server` auto-deploys), so it's the teacher's call. Until then,
Layer B can only sweep the config-reachable knobs above.

## FINDING F3 — your FIRST worksheet blank can LOWER your grade (partial-worksheet penalty)

**Severity:** medium. **Status: ✅ FIXED & SHIPPED 2026-06-16** (`v3FixCwsReveal`). The original
finding stays pinned (legacy config) by the reclassified A4 in `grade-sim-invariants.test.js`; the fix
is verified by `grade-sim-fixes.test.js`. Same family as F1.

### Reproducer

A work-bound student (no PC) whose worksheets are graded on the **AI reflection only** — they've done
every due reflection at 100% but not touched the fill-in-the-blanks:

| | lesson 1.1 (Lessons-track value) | quarterGrade |
|---|---|---|
| 0 blanks done (reflection = 100%) | **100** | **70.0** |
| **does 1 of 4 blanks, perfectly** | **75** | **68.5** |

**One perfect blank cost 25 points on that lesson** (and 1.5 on the quarter; the quarter effect is
diluted by the other lessons + the 70 ceiling, but the per-lesson hit is stark).

### Why it happens

`Cws` (the worksheet-blank feeder) is the completion fraction over **all** blanks in the lesson. It is
**null** — ignored, so the FRQ reflection alone carries the lesson — until the *first* blank is
recorded. From that moment it is `sum(scores) / blankCount`, with every **unfilled** blank counting as
a 0. So the first correct blank flips `Cws` from "absent" to `1/4 = 25%`, and the lesson grade
`(1·Cws + 2·W)/3` drops from `100` to `(25 + 200)/3 = 75`.

This is the **same discontinuity as F1**: a feeder that is *absent → ignored* but *present → unfilled-
parts-are-0*, so starting work you don't finish is worse than not starting it.

### The policy question (teacher decides)

- **Accept it** — "finish a worksheet once you start it." (No change.)
- **Count `Cws` only over *attempted* blanks** (mean of what you did, not over all blanks) — removes
  the discontinuity but stops rewarding *completeness*.
- **Treat the worksheet as not-started until ≥ N blanks/percent done** — symmetric with the F1 fix
  (an ahead-of-schedule lesson only counts once complete). The two fixes share a root cause and could
  be one change: *a feeder counts only once it has enough evidence to be meaningful, else it stays
  null.*

> **F1 and F3 are the same bug seen twice** — an absent-vs-present feeder discontinuity that punishes
> partial work. The "fix both drivers" decision for F1 should be scoped to cover F3 too; otherwise the
> simulator will keep surfacing siblings (the quiz-zero, the lesson-denominator, the Cws-reveal).

## FINDING F4 — the proposed `only-helps` fix was itself non-monotonic (caught pre-ship)

**Severity:** would-have-been-high (averted). **Status:** the simulator REFUTED a candidate fix before
it shipped — the reason production runs `not-until-due`, not `only-helps`. Pinned by
`grade-sim-fixes.test.js` (F4) and `tools/grade-sim-f1a-compare.mjs`.

The first proposed F1-A fix, **only-helps** ("count an early lesson only if its value ≥ the scheduled-
due average — early work can lift but never drag"), scored the synthetic population marginally higher
(mean 54.9 vs 53.7). But the A3 monotonicity property (the single most important grading guarantee:
*raising any score never lowers your grade*) **failed under only-helps** — e.g. raising one item moved
a grade 33.9 → 33.8. **Mechanism:** raising a *scheduled-due* lesson lifts the average, which can push
a previously-included *above-average early* lesson back below the threshold and **evict** it, lowering
the lessons average. A threshold-based inclusion rule is inherently non-monotonic.

`not-until-due` (early work simply waits until its due date) fully fixes F1, is monotonic (0 violations
in 40,000 fuzzed trials), and costs almost nothing population-wide. **Monotonicity beat the ~1-point
score bump.** This is the headline argument *for* having the simulator at all: it caught a perverse
incentive hidden inside the *fix* for a perverse incentive.

## Summary

| Finding | What | Status |
|---|---|---|
| F1 | ahead-of-schedule work lowers grade (quiz-zero + lesson-denominator) | ✅ fixed (`v3FixQuizZero` + `not-until-due`) |
| F2 | v3 weights/gates not config-tunable | ✅ fixed (now in `grade-config.js`) |
| F3 | first worksheet blank lowers the lesson (Cws reveal) | ✅ fixed (`v3FixCwsReveal`) |
| F4 | the `only-helps` candidate fix was non-monotonic | ✅ averted pre-ship → shipped `not-until-due` |

> More findings will be appended as the Layer-C cross-check runs.
