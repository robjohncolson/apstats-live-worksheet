# Gradebook — Grade-Calc & Remediation Spec **v2 (Hybrid)**

**Status:** **DRAFT — for sign-off.** v2 reconciliation converged 2026-05-17 (session 99).
**What changed v1→v2:** v1 made the grade *be* per-skill BKT mastery (practice capped below θ; only a proctored check could certify). That **contradicted what the teacher actually promises students** (do the work → grade banked per unit; the in-class Progress Check can only *raise* it). Teacher chose **option 3 — the hybrid**: the cumulative+booster model students were promised **is the grade of record**; BKT + skill-tags are demoted to the **diagnostic / remediation engine** (which skill is weak), never the grade arithmetic. v1's decisions A/C/E are superseded; B/F survive; D is reinterpreted. v1 preserved at the bottom for provenance.
**Relationship:** detailed design for Phases 3–4 of `GRADEBOOK_SPEC.md`. Phase 0 LIVE (`a7d7bbd`); Sprint 1 (`item_ledger` + feeders) LIVE (`d461ebc`). `GRADEBOOK_TAGGING_SPEC.md` is the prerequisite (now powering the diagnostic engine, not the grade).

---

## 1. Philosophy (unchanged conviction, corrected mechanism)

The teacher is anti–one-shot-grading by conviction (strong test performance, weak grades, career cost). The grade is a **focusing scaffold for the median student**, not a status judgment. The honored promise to students: **"do the work and you've banked the grade; the Progress Check can only help you, never hurt you."** The mechanism must *be* that promise — transparent, cumulative, never-punitive — not a sophisticated model students can't see. The sophistication moves **behind the curtain** (diagnostics/remediation), where it helps the teacher without breaking the promise.

## 2. The grade of record — cumulative + booster (Model B)

**This is what students see and were promised. It is simple, transparent, monotonic.**

- **Three feeders**, accumulating per unit as work is completed:
  1. **Follow-alongs** — worksheet fill-ins (Railway `/api/submit-answer`) + AI-graded FRQ (`/api/ai/grade`/`appeal`). Sprint-1 `item_ledger` already captures these with `student_id`.
  2. **curriculum_render quiz** — the per-lesson AP-question quiz (Phase 2 feeder; new write path; **never** touches sacred `curriculum.js`).
  3. **the Driller** — `lrsl_driller` (app `lrsl-driller.vercel.app`; backend `lrsl-driller-production.up.railway.app` — the same Railway/Supabase the study-guide auth already uses). **NEW 3rd feeder**; needs a feeder integration like the other two.
- **`banked(unit)`** = a correctness-weighted aggregate over the unit's completed feeder items (0–100%). Doing **all** of a unit's feeder work over the summer can reach full credit → the grade is **banked per unit before the PC** (this is the promise; it is the *opposite* of v1's practice-cap).
- **The in-class Progress Check is a one-way booster:** `unitGrade = max(banked(unit), pcContribution(unit))`. The PC can **only raise**, never lower. A prepared summer student: PC is pure upside. A transfer-in with no banked work: the PC (and subsequent in-class work) raises them from wherever they start — not penalized for missing the summer window.
- **Completion is the accountability layer** (did they do the work) — surfaced to the teacher, but the *grade* is correctness-weighted, not completion-points.
- **"100% if you care"** is now literal and visible: keep doing/redoing feeder work and re-sitting the (booster) check; the number only goes up.

*Feeder weighting, the exact `banked` aggregation (per-item correctness × completion mix), and how `pcContribution` maps a PC score to a unit raise are §7 open knobs — pedagogical, teacher-set, with sane defaults.*

## 3. The diagnostic / remediation engine — BKT + skill-tags (behind the curtain)

BKT and the `skill-map` (`GRADEBOOK_TAGGING_SPEC.md`) are **not** the grade. They power:

- **Auto weak-skill detection** (decision B): after a Progress Check, item→skill + BKT produce a per-student **weak-skill list** automatically — the teacher does not squint at scantrons.
- **The remediation learning loop** (decision B, survives): teacher reviews/approves system-proposed remediation per weak skill; completing it gates a **re-check**; a successful re-check feeds the feeders/PC and (per §2) **raises** the banked grade. Never lowers.
- **The teacher dashboard** (Phase 4): class skill heatmap, who's weak where, remediation status.
- Students may see a **motivational** per-skill view ("territory turning green") but **never** BKT jargon, θ, or probabilities — and it is explicitly *not* their grade.

`θ` survives only as the **diagnostic threshold** ("flag skill as weak below θ"), not a grade boundary. v1's practice-cap / proctored-uncap math is **dropped** (it was the grade mechanic; the grade is now §2).

## 4. Daily rhythm & structure (was undocumented; teacher expected it in-repo)

- **Each class day:** yesterday's **review Blooket** → today's **video + follow-along notes** → today's **Blooket** → the day's **curriculum_render AP-question quiz**. The **Driller** runs alongside. ~3–4 lessons/week.
- **Unit close:** a **2-period, AP-exam-paced Progress Check**, with **graduated tightening** — gentle in U1–U3, ramping to full exam pace by U7–U9.
- **Blooket** (decision F, survives): never in the ledger (untrackable); load-bearing **by position** in the rhythm (prediction + retrieval practice; post-Blooket gates "video follow-along done").
- **Hub:** the roadmap **"Desk"** (`ap_stats_roadmap_square_mode.html`) is the per-lesson hub — each tile already links worksheet + quiz + drills + Blooket. `SUMMER26` default until **2026-09-01**, then `SY26-27`.
- **Student-facing rendering:** a new **`start-here.html`** presents the model to students in **cumulative framing only — philosophy + rhythm, no BKT/θ jargon** (per the teacher's scope choice). New deliverable.

## 5. Decision ledger (v1 → v2)

| v1 | v2 status |
|---|---|
| **A** prep = gate+evidence, NOT points | **SUPERSEDED.** Feeders *are* the grade (correctness-weighted). Completion = accountability layer, not points; not BKT. |
| **B** retakes via a learning loop + `remediation_assignment` record | **SURVIVES**, powered by the §3 diagnostic engine; the re-check **raises** the grade (never lowers). |
| **C** grade = BKT per-skill mastery, practice caps < θ | **SUPERSEDED.** BKT is diagnostic only (§3); grade is cumulative+booster (§2). |
| **D** proctored = single source of truth | **REINTERPRETED.** The PC is the **one-way booster** (§2), not the only certifier. Proctoring integrity still matters: Sprint-1 `evidence_tier` (server-derived from `x-proctor-secret`, L-C) marks which evidence may trigger the booster. |
| **E** "pre" = computed BKT snapshot | **DROPPED** as a grade mechanic (no θ pre-snapshot). Growth may survive as an optional diagnostic only. |
| **F** Blooket out of ledger, gates by position | **SURVIVES** unchanged (§4). |

## 6. `remediation_assignment` record (unchanged from v1)

curriculum_render Supabase, service-role-only, additive (same posture as `roster`/`item_ledger`):

```
remediation_assignment
  assignment_id  uuid pk · student_id uuid→roster · unit text · skill text
  source_attempt text (item_ledger ref) · assigned_refs jsonb · status (proposed|assigned|completed|waived)
  proposed_by text ('system'→teacher-approved) · assigned_at/completed_at tstz · unlocks text (the re-check it gates)
```

Retake gate = *re-check for skill X unlocked iff every `assigned` remediation for (student, X) is `completed`.*

## 7. Open knobs (decide at sign-off)

1. **Feeder weights & `banked` aggregation.** Relative weight of follow-alongs : cr-quiz : Driller, and the correctness×completion blend. (Lean: correctness-dominant, equal-ish feeder weights, completion as a separate accountability readout; tune on pilot data.)
2. **`pcContribution` mapping.** How a Progress Check score raises the unit grade — to full unit credit on pass, or proportional? (Lean: proportional raise, capped at 100%, never subtractive.)
3. **Graduated PC tightening schedule** (U1–3 gentle → U7–9 full pace) — concrete pacing per unit band.
4. **Diagnostic θ.** Weak-skill flag threshold (≈0.6–0.7 as a *diagnostic*, looser than v1's grade θ since it no longer gates a grade). Pilot-tune.
5. **Driller feeder shape.** What the Driller exposes per student (attempts/scores/skill) and its integration path (its own backend — likely a pull/webhook like the other feeders).

## 8. Phase sequencing (post-reconciliation)

1. **Tagging workstream** (`GRADEBOOK_TAGGING_SPEC.md`) — now the prerequisite for the **diagnostic engine** (§3) + still needed by the cr-quiz feeder. Same priority (first).
2. **Phase 2** — curriculum_render quiz feeder (grade feeder #2; sacred-safe).
3. **Driller feeder** — integrate feeder #3 (`lrsl_driller`).
4. **Phase 3** — the §2 cumulative+booster grade calc **+** the §3 diagnostic BKT rollup (reuse study-guide BKT/probe/queue for the *diagnostic* side).
5. **Phase 4** — teacher dashboard (weak-skill triage, remediation approve, heatmap) + **`start-here.html`** student-facing rendering.
6. §6.4 single-sign-in adoption (wire `roster-client`/`gradebook-client` into the apps) — still deferred until the feeders need it.

## 9. Study-guide reuse (reframed: powers §3 diagnostics, not the grade)

BKT engine (`.v4-logic-block.js`, `lib/bkt.test.js`), probe selector (`lib/probe-selector.test.js`, `data/formula-probe-supplement.js`), v5 dose-ladder / Review-Queue SM2-lite (remediation delivery + spacing), v6 FRQ decomposition (`data/frq-decompositions.json`), formula cards (`data/ap-stats-cartridge.js`), mastery-map constellation (motivational per-skill view) — **all reused for the diagnostic/remediation engine and the student motivational view, never for the grade number.**

## 10. Non-goals / guardrails

- **Never** add MCQs to or edit `curriculum_render/data/curriculum.js`. Skill-map is external (`GRADEBOOK_TAGGING_SPEC.md` T-2).
- **The grade students see is the transparent cumulative+booster number (§2).** BKT/θ/probabilities must never *be* the grade or be shown as the grade — that is the v2 cheat-path-discipline rule (the inverse of v1's): keep the smart machinery behind the curtain.
- The Progress Check can **never lower** a unit grade.
- Blooket never enters the ledger.
- Reuse study-guide parts for diagnostics; do not re-implement BKT/probes/queues.

---

**Next after sign-off:** retarget `GRADEBOOK_TAGGING_SPEC.md` (diagnostic-engine framing), then build-plan §2/§3/§6/§8 (frozen contracts + dependency-aware dispatch, same method). Decide §7 knobs first.

---
---

## Appendix — v1 (SUPERSEDED 2026-05-17, kept for provenance)

v1 made the grade = fraction of a unit's AP skills with BKT `pKnow ≥ θ`; practice evidence capped below θ; only a proctored check uncapped it; "pre" was a computed BKT snapshot; grade `max(mastery, growth)`. Superseded because it contradicted the teacher's student-facing promise (summer work banks the grade; PC only raises). The per-skill BKT machinery from v1 is **retained** — relocated to the §3 diagnostic/remediation engine. v1 decisions B and F carried forward intact; D reinterpreted; A/C/E replaced by §2.
