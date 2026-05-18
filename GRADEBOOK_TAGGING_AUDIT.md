# Gradebook Tagging Audit — AP Skill Coverage
<!-- GENERATED: 2026-05-18T01:57:53.315Z -->

## Summary

### Pool (a) — Follow-Along Worksheets
- Worksheets scanned: 69
- Total fill-in-the-blank items (data-answer): 2373
- Total FRQ reflection textareas: 281
- AI grading prompt files: 69
- Worksheets with explicit AP-skill anchoring: 0 of 69
- AP skill anchoring method: NONE (no data-skill/data-ap-skill attrs found in any worksheet HTML)
  Skills are inferred from lesson→topic→framework mapping only.

### Pool (b) — curriculum_render/data/curriculum.js
- Status: AVAILABLE (C:\Users\rober\Downloads\Projects\school\curriculum_render\data\curriculum.js)
- Total questions: 817
- Questions with AP-skill tags: 0 (0%)
- AP-skill tagging: **ABSENT** — no skill, apSkill, or skills field on any question.

### Pool (c) — Supplement Probes + FRQ Decompositions
- Supplement probes (formula-probe-supplement.js): 16
  - With formulaId (practice signal): 16
  - Zero-signal probes (no formulaId/skill): 0
  - AP-skill tagging: **ABSENT** — probes link via formulaId, not AP skill code.
- FRQ decompositions (frq-decompositions.json): 9 FRQs, 31 sub-skills
  - Sub-skills with zero supporting MCQs: 6
  - AP-skill tagging: **ABSENT** — FRQ skills use internal IDs (u1-frq-zscore style), not AP codes.

### Pool (d) — AP Framework Files (apstat_1..9_framework.md)
- Framework files parsed: 9 of 9
- Topics extracted: 82
- Malformed files: 1

## Flags and Malformed Sources

- FLAG: apstat_5_framework.md is MALFORMED — no ## TOPIC headers (known defect for Unit 5). Parsed with fallback. Topic-level skill map may be incomplete for Unit 5.

## AP Skill Coverage Matrix

Skill inferred via: worksheet lesson → framework topic → AP skill code.
curriculum.js, supplement, and FRQ decomposition pools carry NO AP-skill tags.

| AP Skill | Skill Name | Worksheet Items (inferred) | curriculum.js | Supplement | FRQ Skills | Has Tag? |
|----------|------------|---------------------------|---------------|------------|------------|----------|
| 1.A | Selecting Statistical Methods (identify question/problem) | 355 | 0 | 0 | 31 | YES (inferred) |
| 2.A | Data Analysis (describe data) | 469 | 0 | 0 | 6 | YES (inferred) |
| 2.B | Data Analysis (construct representations) | 345 | 0 | 0 | 10 | YES (inferred) |
| 2.C | Data Analysis (calculate statistics) | 344 | 0 | 0 | 6 | YES (inferred) |
| 2.D | Data Analysis (compare distributions) | 201 | 0 | 0 | 6 | YES (inferred) |
| 3.A | Probability & Simulation (determine probabilities) | 310 | 0 | 0 | 17 | YES (inferred) |
| 3.B | Probability & Simulation (determine distribution parameters) | 186 | 0 | 0 | 8 | YES (inferred) |
| 3.C | Probability & Simulation (describe distributions) | 249 | 0 | 0 | 15 | YES (inferred) |
| 4.A | Statistical Argumentation (make claims) | 229 | 0 | 0 | 14 | YES (inferred) |
| 4.B | Statistical Argumentation (interpret/assess claims) | 1002 | 0 | 0 | 31 | YES (inferred) |
| 4.C | Statistical Argumentation (verify conditions) | 386 | 0 | 0 | 15 | YES (inferred) |

## Per-Unit Coverage (Worksheets)

| Unit | Worksheets | Blanks | Textareas | Grading Files | Explicit Skill Tags |
|------|------------|--------|-----------|---------------|---------------------|
| U1 | 10 | 355 | 40 | 10 | 0 |
| U2 | 9 | 291 | 37 | 9 | 0 |
| U3 | 6 | 211 | 27 | 5 | 0 |
| U4 | 7 | 361 | 29 | 7 | 0 |
| U5 | 7 | 156 | 28 | 7 | 0 |
| U6 | 10 | 389 | 40 | 10 | 0 |
| U7 | 9 | 310 | 36 | 9 | 0 |
| U8 | 6 | 162 | 24 | 6 | 0 |
| U9 | 5 | 138 | 20 | 5 | 0 |

## Framework Topic → AP Skill Map

Extracted from apstat_{1..9}_framework.md. Unit 5 uses fallback parser (malformed).

| Topic | AP Skills |
|-------|-----------|
| 1.1 | 1.A |
| 1.2 | 2.A |
| 1.3 | 2.B, 2.A |
| 1.4 | 2.B, 2.A, 2.D |
| 1.5 | 2.A, 2.B |
| 1.6 | 2.A |
| 1.7 | 2.C, 4.B |
| 1.8 | 2.B, 2.A |
| 1.9 | 2.D |
| 1.10 | 2.D, 3.A |
| 2.1 | 1.A, 2.D |
| 2.2 | 2.D, 2.C |
| 2.3 | 2.C, 2.D, 2.B, 2.A |
| 2.4 | 2.B, 2.A, 2.C, 4.B |
| 2.5 | 2.C, 4.B |
| 2.6 | 2.C, 2.B, 2.A |
| 2.7 | 2.B, 2.A, 2.C, 4.B |
| 2.8 | 2.C, 4.B, 2.A |
| 2.9 | 2.A, 2.C |
| 3.1 | 1.A |
| 3.2 | 4.A |
| 3.3 | (none parsed) |
| 3.4 | (none parsed) |
| 3.5 | (none parsed) |
| 3.6 | (none parsed) |
| 3.7 | 4.B |
| 4.1 | 1.A |
| 4.2 | 3.A |
| 4.3 | 3.A, 4.B |
| 4.4 | 4.B |
| 4.5 | 3.A |
| 4.6 | 3.A |
| 4.7 | 2.B, 4.B |
| 4.8 | 3.B, 4.B |
| 4.9 | 3.B, 3.C |
| 4.10 | 3.A |
| 4.11 | 3.B, 4.B |
| 4.12 | 3.A, 3.B, 4.B |
| 5.1 | 1.A |
| 5.2 | 3.A, 3.C |
| 5.3 | 3.C |
| 5.4 | 4.B, 3.B |
| 5.5 | 3.B, 3.C, 4.B |
| 5.6 | 3.B, 3.C, 4.B |
| 5.7 | 3.B, 3.C, 4.B |
| 5.8 | 3.B, 3.C, 4.B |
| 6.1 | 1.A |
| 6.2 | 4.C |
| 6.3 | 4.B, 4.A |
| 6.4 | 4.C |
| 6.5 | 4.B |
| 6.6 | (none parsed) |
| 6.7 | 3.A, 4.A, 4.B |
| 6.8 | 4.C |
| 6.9 | 4.B |
| 6.10 | 4.C |
| 6.11 | 4.B |
| 7.1 | 1.A |
| 7.2 | 3.C, 4.C |
| 7.3 | 4.B, 4.A |
| 7.4 | 4.C |
| 7.5 | 4.B |
| 7.6 | 4.C |
| 7.7 | 4.B, 4.A |
| 7.8 | 4.C |
| 7.9 | 4.B |
| 7.10 | (none parsed) |
| 8.1 | 1.A |
| 8.2 | 3.C, 3.A, 4.C |
| 8.3 | 4.B |
| 8.4 | 3.A |
| 8.5 | 4.C |
| 8.6 | 4.B |
| 8.7 | (none parsed) |
| 9.1 | 1.A |
| 9.2 | 4.C |
| 9.3 | 4.B, 4.A |
| 9.4 | 4.C |
| 9.5 | 4.B |

## Gap List — Skills with Insufficient Coverage

These AP skills have no items (via any pool) or are not inferrable from the topic→skill map.

No gaps detected (all skills covered by at least one pool via topic inference).

## curriculum.js Per-Unit Breakdown (Read-Only Pool)

| Unit | Total | MCQ | FRQ | Skill-Tagged |
|------|-------|-----|-----|--------------|
| U1 | 76 | 72 | 4 | 0 |
| U2 | 76 | 72 | 3 | 0 |
| U3 | 52 | 48 | 4 | 0 |
| U4 | 102 | 99 | 3 | 0 |
| U5 | 94 | 90 | 4 | 0 |
| U6 | 145 | 140 | 5 | 0 |
| U7 | 129 | 125 | 4 | 0 |
| U8 | 81 | 76 | 5 | 0 |
| U9 | 62 | 60 | 2 | 0 |

## FRQ Decompositions — Sub-Skill Coverage

| FRQ ID | Unit | Sub-Skills | Zero-Signal Sub-Skills |
|--------|------|------------|------------------------|
| U1-PC-FRQ-Q02 | 1 | 2 | 0 |
| U2-PC-FRQ-Q02 | 2 | 4 | 0 |
| U3-PC-FRQ-Q01 | 3 | 2 | 2 |
| U4-PC-FRQ-Q02 | 4 | 4 | 0 |
| U5-PC-FRQ-Q02 | 5 | 4 | 2 |
| U6-PC-FRQ-Q01 | 6 | 4 | 0 |
| U7-PC-FRQ-Q02 | 7 | 4 | 1 |
| U8-PC-FRQ-Q01 | 8 | 3 | 0 |
| U9-PC-FRQ-Q01 | 9 | 4 | 1 |

## Phase 3 Readiness Verdict

**Question: Can per-skill BKT (Bayesian Knowledge Tracing) be trusted today?**

### Verdict: NOT READY

**Reason 1 — No explicit AP-skill tags on any item.**
All 4 pools (69 worksheets, curriculum.js (817 questions), 16 supplement probes, 31 FRQ sub-skills) lack AP skill codes on individual items.
Skill mapping is inference-only (lesson → framework topic → AP skill code).

**Reason 2 — Worksheet items lack per-question skill attribution.**
2373 fill-in-blank items and 281 FRQ textareas across 69 worksheets carry no data-skill or data-ap-skill attributes.
BKT requires item-level skill tags; inferred topic-level coverage is too coarse for reliable estimation.

**Reason 3 — curriculum.js is untagged.**
817 curriculum.js questions have NO skill field. The sacred-file rule prevents adding tags here.
Phase 2 (curriculum quiz feeder) must route through a skill-tagged wrapper layer.

**Reason 4 — FRQ sub-skills use internal IDs, not AP codes.**
6 of 31 FRQ sub-skills have zero supporting MCQs. AP skill codes must be mapped to FRQ decomposition entries before BKT can aggregate across item types.

**What needs to happen before Phase 3:**
1. Add AP skill codes to worksheet `<input>` and `<textarea>` elements (data-skill attr) — affects all 69 worksheets.
2. Build a skill-tag wrapper for curriculum.js (read-only) that maps question IDs → AP skill codes.
3. Map frq-decompositions.json sub-skill IDs → AP skill codes (u1-frq-zscore → 2.C or 4.B, etc.).
4. Add AP skill codes to supplement probes (formulaId → AP skill code lookup).

**Biggest coverage gaps:**
- Skills with most inferred worksheet items: 4.B (1002), 2.A (469), 4.C (386)
- Skills with fewest/zero inferred worksheet items: 4.A (229), 2.D (201), 3.B (186)
- Skills with zero items in ALL pools: none
