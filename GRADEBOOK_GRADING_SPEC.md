# Gradebook — Grade-Calc & Remediation Spec (Phase 3/4 design)

**Status:** **DRAFT — for sign-off.** Brainstormed & converged 2026-05-17 (session 99 continuation). No build.
**Relationship:** This is the detailed design for Phases 3–4 of `GRADEBOOK_SPEC.md` (signed off `67b28e9`, §6.1 revised `eefe0ae`), plus a new remediation layer and a re-sequencing of Phase 2. Phase 0 is live (`a7d7bbd`). Read `GRADEBOOK_SPEC.md` first; this assumes its `roster` / `item_ledger` / `skill_mastery` architecture and its sacred-file rule.
**Sign-off pattern:** like the Phase 0 spec — the locked decisions below are the teacher's; the open knobs (§9) need a decision before build.

---

## 1. Philosophy (the why — drives every mechanic)

The teacher is temperamentally anti-grading: a one-shot grade that fails to reflect what a student actually knows is the bug (personal experience: strong test performance, weak grades, downstream cost). The grade here is a **focusing scaffold for the median student**, not a status judgment, and is designed to be the *antidote* to one-shot grading: **mastery-based, infinitely repeatable, "anyone can earn 100% if they care enough."** "Care enough" is defined mechanically as *completing the learning loop* (§4), not as a lottery of retakes. The model must never devolve into compliance points.

---

## 2. Locked decisions (teacher, 2026-05-17)

| # | Decision | Consequence |
|---|----------|-------------|
| **A** | Summer / follow-along / curriculum_render-quiz work = **gate + evidence, NOT direct points.** | Completing a unit's prep *unlocks* assessment and *feeds* the skill estimate; it is never points. Preserves "no compliance points" while using the only trackable data. |
| **B** | Retakes are **earned via a learning loop.** After each proctored check the teacher reviews the weak parts and assigns remediation; completing it gates the retake. | Requires a **remediation/assignment record** + a teacher triage/approve surface (§5). The system auto-produces the weak-skill list; the teacher approves. |
| **C** | Grade = **BKT per-AP-skill mastery, proctored-anchored.** Unit grade = fraction of the unit's skills with `pKnow ≥ θ`. **Practice-only evidence caps below θ; proctored evidence uncaps it.** | Makes decision D a *math parameter*, not just a policy: a skill cannot reach the top band without proctored evidence. |
| **D** | **Proctored = single source of truth.** The invariant is "proctored," **not** "the official AP Progress Check specifically." | Official PC administered **once** per unit (canonical certifier). Retakes = **skill-targeted proctored re-checks** from a *non-official* pool, scoped to the flagged weak skills. |
| **E** | **The "pre" is a computed snapshot, not an administered exam.** | Pre = the BKT skill-mastery estimate from prep feeders (follow-alongs P1 + curriculum_render quiz P2) snapshotted just before the proctored PC. Zero extra class periods; reclaims ~10 instructional periods over 5 units vs. a proctored pre. |
| **F** | **Blooket stays out of the ledger** (untrackable / excluded by `GRADEBOOK_SPEC.md`) but is **load-bearing by position**: post-Blooket gates "video follow-along done" → which gates the retake. Pre/post-Blooket = prediction + retrieval practice. | No tracked Blooket points; opt-out solved structurally, not by grading. |

---

## 3. The grade model (decision C, precisely)

- **Unit skill set.** Each unit has a set of AP skills `S = {s1…sn}` (from the AP CED; the follow-alongs are already framework-anchored to Skill/EU/LO/EK).
- **Per-skill estimate.** For each `s`, BKT maintains `pKnow(s)` ∈ [0,1], updated per observed item tagged to `s`. **Reuse the study-guide BKT** (`.v4-logic-block.js` / `lib/bkt.test.js`), not a new implementation.
- **Evidence tiers (the cap is the core mechanic).**
  - *Practice evidence* (follow-along blanks/FRQ-AI, curriculum_render quiz, probes): updates `pKnow` but **clamped at `θ_practice` (< θ)** — e.g. θ = 0.85, practice asymptotes at ≤ 0.75. Practice can build a skill *toward* mastery and is great for routing/growth, but can never *certify* it.
  - *Proctored evidence* (the once-per-unit official PC; skill-targeted proctored re-checks): updates `pKnow` **uncapped**; only proctored evidence can push a skill ≥ θ.
- **Unit grade.** `grade(unit) = |{ s ∈ S : pKnow(s) ≥ θ }| / |S|`, mapped to a letter band. Robust to one lucky/unlucky run by construction (BKT is a Bayesian blend over the whole sequence).
- **Growth (free, from decision E).** `growth(unit) = mastery(post-proctored) − mastery(pre-snapshot)`. **Recorded for motivation + teacher analytics.** Open knob §9: whether the *grade* is `mastery` or `max(mastery, growth-implied)` (maximally generous, philosophy-consistent).
- **"100% if you care."** A skill below θ → remediation loop (§4) → skill-targeted proctored re-check → crosses θ. Iterates until all of `S` ≥ θ.

## 4. Unit lifecycle (one unit, end to end)

1. **Prep (gate + evidence, decision A).** Student does the unit's follow-alongs (P1 feeder: auto-graded blanks + AI-graded FRQ) and curriculum_render quiz (P2 feeder). All of it feeds *practice-tier* BKT (capped).
2. **Pre-snapshot (decision E).** Day before the proctored PC, snapshot `mastery(unit)` from prep evidence → routing + growth anchor + BKT seed. *Optional cold-probe* (§9) sharpens routing.
3. **Routing.** High pre-snapshot → student is in the **review/enrich lane** for the unit's in-class videos; low/none → **first-exposure lane**. Same room, self-paced via the follow-along/Blooket structure.
4. **Instruction.** Every video covered in class: **pre-Blooket → video + follow-along notes → post-Blooket** (decision F). Post-Blooket gates "this video's follow-along complete."
5. **Proctored PC (decision D, the certifier).** The official AP Progress Check, administered **once**. Proctored, uncapped BKT update. This is the single source of truth.
6. **Auto-triage (decision B, the part the system does for the teacher).** Item→skill mapping + BKT produce a **per-student weak-skill list** automatically. No manual scantron squinting.
7. **Remediation assign (teacher judgment, system-assisted).** System **proposes** targeted content per weak skill (the follow-along for that topic, the study-guide formula card / FRQ decomposition / TI-84 walkthrough, a probe set, curriculum_render practice). Teacher **reviews/edits/approves**. Recorded as a remediation/assignment record (§5).
8. **Learning loop + retake gate.** Student completes the assigned remediation (tracked). Completion **unlocks** a **skill-targeted proctored re-check** — only the flagged skills, fresh items from a *non-official* pool (decision D). Proctored → uncapped → skill crosses θ.
9. **Iterate** step 6–8 until every skill in the unit ≥ θ (grade → 100%) or the student stops caring (grade = current mastery; never punished for the path or pace).

## 5. New data: the remediation / assignment record

Beyond `GRADEBOOK_SPEC.md`'s `roster` / `item_ledger` / `skill_mastery`, one new concept (curriculum_render Supabase project, same service-role-only posture):

```
remediation_assignment
  assignment_id   uuid pk
  student_id      uuid  → roster.student_id
  unit            text
  skill           text            ← the weak AP skill this targets
  source_attempt  text            ← the proctored attempt that flagged it (item_ledger ref)
  assigned_refs   jsonb           ← pointers to remediation content (follow-along URL, formula-card id, probe set, curriculum_render practice)
  status          text            ← proposed | assigned | completed | waived
  proposed_by     text            ← 'system' (auto) then teacher-approved
  assigned_at / completed_at  timestamptz
  unlocks         text            ← the skill-targeted proctored re-check this gates
```

The retake gate is a query: *re-check for skill X is unlocked iff every `assigned` remediation for (student, X) is `completed`.*

## 6. Study-guide reuse map (teacher affirmed "good ideas in it")

This design is mostly **assembly of proven study-guide parts**, not new invention:

| Need here | Reuse from study guide |
|---|---|
| Per-skill `pKnow` (decision C) | BKT engine — `.v4-logic-block.js`, `lib/bkt.test.js` (`GRADEBOOK_SPEC.md` already mandates reuse) |
| Cold-probe + skill-targeted re-check item selection | Probe selector + pool — `lib/probe-selector.test.js`, `data/formula-probe-supplement.js`, `pickProbeForFormula` |
| Remediation content delivery + spacing | v5 dose-ladder daily queue + Review Queue (SM2-lite, 7-day auto-age + "I know it") — the assignment enqueues like a review item |
| Per-skill FRQ evidence | v6 FRQ decomposition — `data/frq-decompositions.json` (31 skills / 9 FRQs); the **latent-penalty idea** ("helpers don't hurt until you Grade") is the same shape as "practice can't certify; proctored does" |
| Remediation content targets | `data/ap-stats-cartridge.js` (81 formula cards), `data/formula-procedure-map.js` (TI-84 walkthroughs) |
| Student motivation ("territory turning green") | Mastery-map constellation → per-skill mastery view; teacher analog = class skill heatmap (Phase 4) |
| Summer 5-unit gating | v7 unlock-code / `?mode=summer` gating already models a gated summer cohort |
| Cheat-path discipline | Study-guide "paper mode is a cheat path" rule → here: practice/prep must not be able to *certify* (the cap in §3 enforces this; resist any bypass) |

## 7. Revised phase sequencing (this design changes the order)

`GRADEBOOK_SPEC.md` §8 had Phase 2 (curriculum_render quiz feeder) as "later, hardest." This design **moves it up** — it is the pre-snapshot engine, a retake item source, and the summer-work tracker. Revised order:

- **Phase 1** — `item_ledger` + follow-along feeders (Railway `/api/submit-answer`, `/api/ai/grade`/`appeal`) stamped with `rosterClient.studentId()`. + §6.4 single-sign-in adoption on the roadmap.
- **Phase 2 (promoted, on critical path)** — curriculum_render quiz feeder (new write path; **never** touches sacred `curriculum.js`; every selected option per student per question + item analysis). Powers pre-snapshot, summer tracking, retake items.
- **Phase 3** — `skill_mastery` BKT rollup (reuse study-guide BKT) + the grade calc of §3 (practice cap / proctored uncap / per-skill θ / growth).
- **Phase 4** — teacher dashboard: auto-triage weak-skill lists, propose→approve remediation (§5), class skill heatmap, retake-gate management.

## 8. The technical spine / top risk — skill-tagging audit (named workstream)

Per-skill BKT is **garbage-in/garbage-out without accurate item→AP-skill tags** across four pools: follow-along blanks/FRQs, curriculum_render bank, supplement probes, official PC. State today: follow-alongs anchored (framework-injection done, sessions 96–97); **curriculum_render bank tag quality UNKNOWN**; supplement coverage partial (carry-over (a): 16 zero-signal probes). **A tagging audit is a first-class workstream, not an afterthought** — it gates Phase 3's validity. Must be in the build plan explicitly.

## 9. Open knobs (need a decision before build)

1. **Cold-probe: in or out?** ~1 item/skill from the supplement pool (never PC, never `curriculum.js`), ~10 min day-1, ungraded, low BKT weight — sharper routing vs. 10 minutes. (Recommendation: optional toggle, default off; turn on per unit if routing matters.)
2. **θ and θ_practice values.** Mastery threshold (≈0.85?) and the practice cap (≈0.75?). Tunable; needs real student data (echoes study-guide carry-over (f): BKT/forgetting constants need pilot data).
3. **Grade = `mastery` or `max(mastery, growth-implied)`?** The latter is maximally generous and most philosophy-consistent; the former is simpler. (Recommendation: `max(...)`.)
4. **Retake cadence limits?** "Infinitely repeatable" — any floor on time-between-rechecks or evidence-per-loop beyond "remediation completed"? (Recommendation: the remediation-completed gate *is* the limit; no time floor.)

## 10. Non-goals / guardrails (unchanged from `GRADEBOOK_SPEC.md`)

- **Never** add MCQs to or edit `curriculum_render/data/curriculum.js`. Supplements only.
- No compliance points; prep is gate+evidence (decision A).
- Proctored is the only certifier (decision D); practice can never reach θ (the §3 cap is load-bearing — treat any path that lets practice certify as a cheat-path bug).
- Blooket never enters the ledger (decision F).
- Reuse study-guide parts; do not re-implement BKT/probes/queues.

---

**Next step after sign-off:** turn §3–§5 + §7–§8 into a build plan (frozen contracts + dependency-aware dispatch, same method as Phase 0). Decide the §9 knobs first.
