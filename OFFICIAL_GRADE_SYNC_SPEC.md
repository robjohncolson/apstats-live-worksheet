# Official Grade Sync — one quarter grade, the same on the Desk and in Schoology

Status: teacher decisions recorded 2026-10-02 (§7). Phase 1 (dry-run tool) being built. Grade-affecting.

## 1. Why

On 2026-10-02 the Desk and Schoology disagreed for every student:

- The Desk adds the **early-finish bonus** (1–5 points; all 29 students have some). Schoology cannot.
- Even before the bonus, the **Lesson category** differs:
  - Schoology gets a lesson's column on its class day, so a half-finished worksheet counts at its partial
    score (Ellen: 1.9 = 52, 3.1 = 54, 3.2 = 60). The Desk ignores a worksheet until its zero date
    (the deliberate "not until due" rule), so Ellen's Desk Lesson average is 105 vs Schoology 99.
  - Schoology keeps the higher score when a later regrade comes out lower ("best wins").
  - Quizzes and Blooket matched exactly.
- The best-of / 40% rule only exists as four hand-typed overrides, which go stale (two had to be
  removed on 10/2 when quiz zeros dropped Olivia and Darla under 40).

Teacher decision (10/2): **Option B** — the Desk's rule is official; write it into Schoology nightly and
show the same number on the Desk.

## 2. The official quarter grade (teacher's rule, 2026-10-01/02)

For each student, each night, for the current marking period:

1. **Work** = Schoology's own calculated grade for the marking period, using the work categories only
   (Lesson, Quizzes, Blooket, Posters — whichever have grades), with Schoology's weights.
   - Today Progress Check has no column, so Work = Schoology's "Calc." number exactly.
   - Once a Progress Check column exists (U1: after Day 2, Tue 10/13 B / Fri 10/16 E) Schoology's Calc.
     includes PC at 50%, so Work must be recomputed from the work categories alone (§4.2).
2. **PC** = the student's Progress Check percentage on file (today: U1 MCQ Part A; later: the mean of the
   quarter's due unit PCs, as the engine's PC track defines it).
3. **Banked bonus** = the student's banked bonus-sheet points (E +5 / P +3 / I +1) for the quarter.
4. **Early bonus** = the Desk engine's early-finish bonus for the quarter.
5. If Work + banked bonus + early bonus ≥ 40 and PC is on file: **Base = max(Work, PC)**.
   Otherwise **Base = Work**.
6. **Official = min(100, Base + early bonus)**, rounded to one decimal.

A low PC never lowers anyone; the 40% line holds; bonus sheets and the early bonus can carry a student
over it. Banked bonus is NOT added to the grade nightly (it only counts toward the line; the Bonus Bank
quarter-close step still applies it).

## 3. Where the number lives

- **Schoology**: the marking-period override cell (`gp_override`) for every student, refreshed nightly.
  Category averages stay visible; the override is the grade that goes to PowerSchool.
- **Desk**: shows the same official number (grade pill, My Ledger, Do Now), labelled as the official
  grade "as of last night". The Desk's own live engine estimate stays available as "today's estimate"
  only if the teacher wants it (§7).

## 4. Build

### 4.1 Nightly sync (tools/, runs on Athena after the grade push)

New step 6 in `schoology_sync_section.py` (after grades are pushed, `--apply` only):

1. Reload the gradebook, `load_all_columns`, read each student's Calc. and current override.
2. Fetch PC %, early bonus and banked bonus from roster-server (`/class/grades` + bonus rows).
3. Compute Official (§2) — a pure function in `tools/schoology_official.py`, unit-tested with the cases in §6.
4. Write the override only when it differs from what is there by ≥ 0.05; verify by re-read after reload
   (the 10/1–10/2 mechanic: click the override cell, then type + Enter).
5. Record each written value in the sync state; print an audit table to the log.
6. Post the official grades to roster-server (§4.3) so the Desk can show them.

Dry-run prints the table and writes nothing.

### 4.2 Work after the PC column exists

Compute Work from the student's own Schoology cells: mean of each work category's graded cells, weighted
Lesson 25 / Quizzes 17.5 / Blooket 7.5 (since 2026-10-09, `POSTER_BONUS_SPEC.md`; posters are banked bonus, never a
category; was 15/15/15/5), renormalised over categories that have grades. This
matches Schoology's "calculate by percent" category math (verified to the decimal on 10/2 for the three
current categories).

### 4.3 Roster-server

- `POST /class/official-grades` (teacher secret): `{quarter, asOf, grades:[{studentId, official, work,
  pc, base, earlyBonus, bankedBonus, rule}]}` — upserts one row per (student, quarter).
- Storage: new table `official_grade` (migration, teacher-run) keyed (student_id, quarter).
- `GET /grade` and `/class/grades` add `official: {grade, asOf, parts}` for the current quarter.
- Never affects the engine's computed grades; it is a published value.

### 4.4 Desk

- Grade pill / My Ledger / Do Now show `official.grade` when present, with "as of <date>".
- The "how your grade is counted" text explains: work grade from Schoology, the higher of work and
  Progress Check once both are at least 40%, plus the early-finish bonus.
- Slips (`weekly-slips.mjs`) print the official number (replaces today's `--schoology` reader).

## 5. Rollout

1. Build §4.1 in dry-run; teacher reads one night's audit table.
2. Run migration; ship §4.3 + §4.4 behind "show official only when present".
3. Turn the nightly write on. The four hand overrides are replaced by the first run.

## 6. Test cases (pure function)

| Work | PC | Banked | Early | Official |
|---|---|---|---|---|
| 68.9 | 94.4 | 0 | 1 | 95.4 (Angie) |
| 39.75 | 100 | 0 | 2 | 100 (Olivia: 39.75 + 2 early ≥ 40, so PC counts; cap) |
| 36.1 | 66.7 | 3 | 2 | 68.7 (Darla: 36.1 + 3 + 2 = 41.1 ≥ 40) |
| 30.9 | 61.1 | 0 | 1 | 31.9 (Andrew: 31.9 < 40, PC can't count) |
| 38 | 90 | 5 | 0 | 90 (bonus carries over the line) |
| 91.7 | 61.1 | 0 | 5 | 96.7 (Ellen: work is higher) |
| 99 | 100 | 0 | 5 | 100 (cap) |
| 70 | null | 0 | 3 | 73 (no PC on file) |

## 7. Teacher decisions (2026-10-02)

1. Banked bonus counts toward the 40% line every night ("kids are paying attention every day"); it is not added to the grade nightly.
2. The Desk shows the official grade AND a live "today's estimate" that moves as students work.
3. Quarters only: write the marking-period override; never touch the overall/year column. (A finished quarter is treated as closed.)
4. Every student should have a Schoology row. If one is missing, compute and keep their official grade in a pending log so it syncs once they are added.
5. The early bonus counts toward the 40% line.

## 7a. Original questions (answered above)

1. **Banked bonus**: only used to cross the 40% line nightly (and applied at quarter close as the Bonus
   Bank spec says), or also added to the official grade every night?
2. **Desk estimate**: show only the official (last night's) number, or also "today's estimate" from the
   live engine?
3. **Overall/year column**: leave alone until Q4 (recommended)?
4. **Students with no Schoology row** (none today): skip and log.
5. **Early bonus and the 40% line**: as written, only banked bonus-sheet points count toward the 40% line;
   the early-finish bonus is added after. (Olivia: 39.75 work + 2 early = 41.8 official, but her PC still
   can't count.) Should the early bonus also count toward the line?
