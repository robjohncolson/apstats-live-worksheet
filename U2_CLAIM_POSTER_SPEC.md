# Unit 2 claim posters (Period B, BPE walkthrough Thu 2026-11-12) — spec

Teacher (2026-11-06): BPE walkthroughs land on Thu 11/12. Period B runs a three-day poster
activity: **Tue 11/10 and Thu 11/12 build, Fri 11/13 gallery walk.** Content is CED-2026
topics **2.1 to 2.9 only** ("material behind that date, not binomial"), done in groups, one
legitimate DOK-3 question per card, built from Period B's own mistakes. Posted objectives use the
Algebra 2 lesson-prep format (learning objective, language objective, essential question).
**Graded as the Q2 poster** (POSTER_WORK_TRACK_SPEC.md: 30% of Q2 Work, scored 90-115).
"Poster execution needs to be flawless and comprehensive."

Status: spec. **Part A changed twice on 2026-11-10 (the sheets in the morning, Thursday's plan
after the first day): section A6 lists both, and wins wherever A1 to A5 differ.** Part A (the
kit) is authored by the main session. Part B (schedule, Desk, server
data, tests) is implemented from this spec. Grade-affecting: `data/lesson-schedule.json` is bundled
to Railway (roster-server auto-deploys on push); the U2 Progress Check moves.

## Part A — the activity and the kit (`u2_poster/`)

### A1. Posted objectives (board + printed card, Algebra 2 format)

- **Learning objective:** I can decide whether a claim about chance is supported by the data: find
  the probability the claim actually depends on (a conditional, a joint, a union, or an expected
  value), compare it to the claim, and justify my verdict in context. (CED-2026 topics 2.1-2.9;
  skills 3.A, 3.B, 4.B.)
- **Language objective:** I can explain to my group and in writing on the poster why a probability
  claim is right or wrong, using the words *given, conditional, joint, union, mutually exclusive,
  independent* and *expected value* in complete sentences.
- **Essential question:** When someone says "the odds are...", how do we know whether to believe
  them?
- **Frames on the board:** "The claim says ___. The number it really depends on is ___ (a
  conditional P(___ | ___), a joint, a union, an expected value, or a simulated probability) =
  ___, not ___, so the claim is (supported / not supported / partly supported) because ___."
  "I agree / disagree with ___ because ___." "In the long run, ___ per ___." (Codex review
  2026-11-06: cards 4-6 rest on a union, an expected value and a simulated probability, so the
  frame, exit ticket 1 and the walk sheet must not force a conditional.)
- **Word bank:** given, conditional, joint, union, mutually exclusive, independent, expected value,
  long run, denominator, relative frequency, association.

### A2. The cards (14 students: 4 trios + 1 pair)

Every card: the data (printed in our own Unit 2 follow-alongs), one claim, the DOK-3 task
(verdict, proof, repair/build), five must-haves (= the rubric), roles, the frame. All numbers in the
kit are computed, never typed from memory (the teacher key prints fractions and percents).

| # | Topics | Mistake and B evidence | Claim | Data |
|---|---|---|---|---|
| 1 Who wants to be rich? | 2.1, 2.2 | "The bigger count wins" (B's persistent U1 error; 3 students on quiz item U2-L2-Q02) | "Freeze Time people want to be rich: 26 chose Rich, more than any other power." | Super Status table, 433 students (2.4-2.6 follow-along) |
| 2 The flipped headline | 2.6 | P(A given B) read as P(B given A) (student question 10/30) | "Most students who want to be Famous chose Fly, so most students who chose Fly want to be Famous." | Super Status table |
| 3 Can't happen together, so unrelated? | 2.5, 2.7 | mutually exclusive confused with independent (student question 10/29; teacher promise) | "Nobody who chose Telepathy wants to be Famous (0 of 68), so Telepathy and Famous are independent." | Super Status table + two 2x2 tables the group designs |
| 4 Double counted | 2.4, 2.7 | addition rule without the subtraction; independence checked one way (2.7 = B's weakest lesson: worksheet mean 46, 8 of 14 unfinished) | "P(college grad or internet news) = 693/2500 + 687/2500 = 55.2%, and grads are no more likely than anyone else to get news online." | 2010 AP free-response table, 2,500 adults (2.7 follow-along) |
| 5 Is the game fair? | 2.3, 2.8, 2.9 | expected value read as "every game"; gross vs net; fair to whom (2.8 exit ticket traps) | "A fair game! You win on 2 of every 6 rolls." | Carnival die game (2.8 follow-along exit ticket) |
| 6 (spare) Rigged coin? | 2.3 | simulation vs certainty (10/26 question: "was the simulated coin fair?") | "6 heads in a row in 20 flips is impossible for a fair coin." | randInt(0,1,20) on the TI-84 |

Key numbers (teacher key): card 1 P(Rich | power) Fly 22/89 = 24.7%, Freeze Time 26/101 = 25.7%,
Invisibility 22/98 = 22.4%, Super Strength 13/77 = 16.9%, Telepathy 19/68 = 27.9%, P(Rich) =
102/433 = 23.6%; the count claim is wrong by reason and by percent (Telepathy leads). Card 2
P(Fly | Famous) = 5/15 = 33.3% (a plurality, not "most"), P(Famous | Fly) = 5/89 = 5.6%. Card 3
P(Telepathy and Famous) = 0 (mutually exclusive); P(Famous) = 15/433 = 3.5% vs P(Famous |
Telepathy) = 0 (not independent); two possible events that are mutually exclusive can never be
independent (P(A)P(B) > 0 = P(A and B)). Card 4 regions 245 / 448 / 442 / 1365; union 1135/2500 =
45.4% (the 245 was counted twice); P(internet | grad) = 245/693 = 35.4% vs P(internet) = 687/2500 =
27.5%, product 0.0762 vs 0.098; exact independence would need 190.4 in "both", impossible. Card 5
X = +8 (1/6), +1 (1/6), -2 (4/6); mu = 1/6 = $0.17 per game for the PLAYER; sigma = $3.67; "you
win 2 of 6" is true and irrelevant; one-payout fixes: 6 pays $9 or 1 pays $2 (mu = 0). Spare:
P(run of 6+ heads in 20 fair flips) = 0.122.

### A3. The three days (B meets Tue/Thu 09:55-11:00, Fri 08:55-09:50)

- **Tue 11/10, 65 min, build.** Do Now on whiteboards (packet problem, never new): P(Rich | Fly)
  from the table. Launch: objectives + EQ posted; Three Reads on the shared table (story, quantities,
  claims someone could make); the example board projected. Cards out. Groups solve verdict + proof
  on scratch paper and whiteboards FIRST (tiered hints only to a stuck group), then start the
  poster. Exit: each student writes the group's verdict sentence in their own words (ticket 1).
- **Thu 11/12, 65 min, observed: defend, repair, finish.** Do Now on boards: true or false,
  P(Happy or Fly) = 265/433 + 89/433 (false; 306/433 = 70.7%). Defend round: partner groups (1-2,
  3-4, 5 with the teacher) present the verdict with the frame while the listening group asks from
  the question card; revise the sentence. Repair part of each card (fix the headline, the fair
  payout, the 2x2 tables, the 190.4) and finish the poster against the checklist. Whole class, 5
  min: the 10/29 promise (card 3's rule). Exit ticket 2, alone, on paper: (1) "Healthy and
  Telepathy never happen together (0 of 68). True or false: they are independent. One sentence
  why." (2) "Which is bigger, P(Happy | Super Strength) or P(Super Strength | Happy)? Compute both."
- **Fri 11/13, 55 min, gallery walk.** Four rotations of five minutes, no docents (a trio cannot
  staff a poster and still visit the other four): the poster speaks for itself. Walk sheet: at
  each of the other four posters, the claim in five words, the verdict, the one number that
  decides it worked out by the student and checked against the poster, the word from the language
  objective it needed. Debrief on the two persistent ones (flipped condition; mutually exclusive
  vs independent). Teacher scores with the rubric. Student sheets never print a solved value or a
  verdict: must-haves name what to show, not the answer; answers print only in the teacher key.

What the walkthrough form counts (a2 `roster-local/observations/2026-10-27-bonnevie-G.md`): both
objectives posted, DOK marked, open why questions, wait time, a language routine with frames,
structured group talk, whiteboards used, student talk over teacher talk, visible independent work
at the end. The teacher key carries the observer card (title, body, frame, mode, minutes) and a
why-question list.

### A4. Rubric and grading

Each card's five must-haves are the rubric: all five = E, three or four = P, fewer = I. Scores E
115 / P 100 / I 90, any integer 90-115 per sheet (POSTER_WORK_TRACK_SPEC.md). Entered with
`node scripts/enter-poster.mjs <file> --apply` (file outside the repo: header
`unit=2 quarter=Q2 title=Unit 2 Poster (Claim, Proof, Repair) section=PeriodB`, then
`Real Name|115`). Rows are `POSTER-U2`; the engine files them in Q2 for B through
`posters['2'].periods.B = 2026-11-10` (Part B). Since 2026-11-13 Period E runs the activity too
(B7): its rows are filed in Q2 through `posters['2'].periods.E = 2026-11-13` (`section=PeriodE`). A
student without a score has an absent posters track, never 0.

### A5. Files

- `u2_poster/claim_poster_job_cards.html` — single source: teacher guide, objectives board, the
  six cards, example board, walk sheet, exit tickets, rubric and scoring grid, observer card, why
  questions, question cards, hint cards, run of show. `#student`, `#teacher`, `#example`, `#walk`
  in the URL select a print edition (answers print only in `#teacher`).
- `u2_poster/pdf/u2_poster_group_sheets_student.pdf` (cards 1-6, two pages each),
  `u2_poster/pdf/u2_poster_example_board_demo.pdf`, `u2_poster/pdf/u2_poster_walk_sheet.pdf`,
  `u2_poster/pdf/u2_poster_teacher_key.pdf`. Printed from the source with headless Chrome.
- Desk `POSTER_LINKS['U2-Poster']` (Part B) links the three student PDFs and the teacher key.

### A6. As revised and as run (2026-11-10). Where A1 to A5 differ, this section wins.

**Morning revision, before the first day (9e2d90cd).** The teacher asked for legible instructions,
less complexity, DOK 3 kept, sound ideas.

- Posted texts. Content objective: "I can judge a claim about chance: find the number it really
  depends on, prove my verdict with it, and repair the claim so it is true." Language objective: "I
  can defend my verdict out loud and in writing, in complete sentences, using the word my claim
  needs: given, union, independent, mutually exclusive, expected value or simulation."
  ("simulation" was added the same afternoon for the card 6 group.) Essential question: "What makes
  a claim about chance worth believing?" One verdict frame everywhere: "The claim says ___. The
  number it really depends on is ___ = ___. So the claim is (supported / partly supported / not
  supported) because ___."
- Student sheets: 12 pt; no topic codes; no "must show" box and no "mistake this busts" box (it
  handed over the verdict); one checklist, which is the rubric; one frame plus a short word bank per
  card instead of card-specific frames; every answer leak removed from the checklists.
- Cards: 1 asks whether Freeze Time stands out (no group does), not who leads; 2 uses two shaded
  tables, no tree; 3 has one independence test and one built 2x2 table; 4's claim now cites
  245/2500 = 9.8% and has two mistakes to find; 5 has one verdict question and no histogram; 6 has
  students set their own bar for "rare" first.

**As it ran, Tue 11/10.** 13 students in four groups: cards 1, 2, 3 and 6 (the group of four has
card 3). Nobody took cards 4 or 5. The groups solved page 1; no sketch and no big paper yet.

**Thursday re-planned the same day: sketch, check, build.** The teacher wanted two groups to pair
up and improve each other's poster. Three independent designs agreed on the one change that makes
that work: the pair-up sits between the page-2 sketch (the mockup) and the big paper, and the
checkers have their own answer before they see the mockup. A first version ran it face to face
(read, test, tell, fix). At 12:30 the teacher chose a plainer shape, and the kit follows it: each
group works its partner's worksheet, then goes to the partner's mockup, writes suggestions, comes
home, fixes, and only then commits to the poster.

- 0-5 Do Now (unchanged). 5-6 the language objective read aloud. 6-17 sketch on page 2. 17-37
  partner check. 37-42 the 10/29 promise, whole class on whiteboards. 42-56 build on big paper from
  the checked mockup. 56-57 clean up. 57-65 exit ticket 2 (unchanged).
- Partner groups, at neighboring tables: poster 2 with poster 3 (the two questions the class asked
  out loud on 10/30 and 10/29; both turn on the Famous column and "given"), poster 1 with poster 6
  (both ask "compared with what?").
- The partner check is one sheet per group (`#check`, `u2_poster/pdf/u2_poster_partner_check.pdf`),
  three steps. WORK (9 min): at its own table, mockup face down, each group solves its partner
  group's page 1 from a clean copy and writes its verdict there, not for the teacher (cards 1 and
  2: parts a and c; card 3: a, b, c; card 6: a, two trials each on three TI-84s seeded with
  different numbers, then c from those 6 trials, and d). LOOK (7 min): the groups swap tables,
  leaving card and sheet behind and bringing their work, turn the partner's mockup over, compare it
  with their own work (fractions, verdict, checklist), and one checker writes on the bottom half of
  the partner's sheet.
  FIX (4 min): back home, the authors decide to change or keep, write a second-draft verdict and
  tell their partners the answer out loud. Checkers ask, authors decide. Frames: "We got ___ out of
  ___. You got ___ out of ___." "Your checklist still needs ___." "A reader on Friday would ask:
  ___?" "We will change / keep ___ because ___." The sheet prints no number, percent or verdict.
- Work first, look second: mockups go face down at minute 17, before the partner's clean page is
  handed out, and none is turned over before minute 26. The clean copies are
  `u2_poster/pdf/u2_poster_partner_worksheets.pdf`: page 1 of cards 1, 2, 3 and 6, taken unchanged
  from the student PDF. Tier-2 hint cards stay with the teacher until the check is over.
- `#screen` (`u2_poster/pdf/u2_poster_thursday_screen.pdf`, landscape) holds the table and the four
  claims for the projector: useful for the Do Now and the promise, not required by the check. Its
  claim texts are compared with the cards by the test, so they cannot drift.
- Gone: the defend round and the question cards. The teacher key gains a page of what the checkers
  should find at each table and the likeliest wrong feedback (26/102 looking like 26/101 in
  percents; "most" read as "biggest"; 1/64 and then 15/64 for the run of six).
- Observer card: Preparing 6, Interacting 31 (sketch, partner check), Extending 28 (the promise,
  build, clean-up, exit ticket 2). The routine is named as a one-round form of Stronger and Clearer,
  not as the full routine.
- Friday: 20 minutes to finish (partner groups confirm the change at minute 15), three rotations of
  6 minutes, a 10-minute debrief, the essential question alone. The walk sheet lists cards 1, 2, 3
  and 6 only and uses the posted words ("the number it really depends on").
- Not covered by a poster in Period B: unions (only Thursday's Do Now) and expected value. Cards 4
  and 5 are Friday's early-finisher task.

How it was checked: three independent designs (language, observer, statistics lenses), four
independent reviews of the first version (8 must-fix findings), a cold walk-through and a recount
(3 more), all folded; then the same two final checks again on the teacher's version (three one-line
gaps, folded).

Guard: `tests/u2-poster-kit.test.js` pins the pairs; the order sketch, check, build; a run of show
that fills 65 minutes with no gap; mockups face down before the clean copies go out, and none
turned over before minute 26; WORK before LOOK before FIX on a sheet with no number on it and a
frame that lets authors keep a sound verdict; the screen page's claims equal to the cards'; the
observer card's parts adding to 65; the walk sheet's four rows.

## Part B — schedule, Desk, server data, tests

### B1. Section-only poster days (generator)

`SCHEDULE_DEFS["SY26-27"].periods.B` gains
`posterDays: { 2: [[2026,10,10],[2026,10,12],[2026,10,13]] }` (teacher quote in the comment).
Semantics, exactly like `breakDays`: on each listed meeting day the period gets a poster cell,
**nothing is placed from the queue, nothing is consumed, the lead (`placedB`/`placedE`) is
unchanged, and the other section is untouched.** The cell:

```
day 1: { t:'U2-Poster',  n:'Unit 2 Poster',         u:2, kind:'poster', admin:1, days:3, sectionOnly:true, due:'', as:'' }
day 2: { t:'U2-Poster2', n:'Unit 2 Poster (Day 2)', u:2, kind:'poster', admin:2, days:3, sectionOnly:true, due:'', as:'' }
day 3: { t:'U2-Poster3', n:'Unit 2 Poster (Day 3)', u:2, kind:'poster', admin:3, days:3, sectionOnly:true, due:'', as:'' }
```

In `generateSchedule`: the poster-day check sits right after the break-day check and before the
Work-Day rule (so Fri 11/13 is the poster's day 3, not a Work Day). The section-only isolation
(`hasBreak`, `without()`, the reference run) treats `posterDays` like `breakDays`: a period with
posterDays runs its own column; `without()` and the reference run delete `posterDays` as well as
`breakDays`, `maxVideosPerDay`, `maxVideosFrom`. `injectPcPosterEvents` (`POSTER_UNITS`,
`POSTER_DAYS`) is untouched: it would place a Unit 2 poster after 2.12 for BOTH sections, on the
PC. Never use it for this poster.

Dry run (2026-11-06, simulated as three B break days; the implementation must reproduce it):

| | before | after |
|---|---|---|
| B 4.10, 4.11 (CED 2.10) | 11/10, 11/12 | 11/16, 11/17 |
| B 1.10, 5.2 (CED 2.11) | 11/16, 11/17 | 11/19, 11/20 |
| B 5.1, 5.3 (CED 2.12) | 11/19, 11/20 | 11/23, 11/24 |
| B U2 PC day 1, day 2 | 11/23, 11/24 | 11/30, 12/01 |
| B Work Days | 10/16 11/13 12/11 12/18 01/08 01/22 02/05 02/23 03/01 03/12 | 10/16 01/08 01/22 02/05 02/23 03/01 03/12 |
| last B date that differs | | 2026-12-18 (U3 PC, U4, U5 unchanged) |
| E column | | byte-identical |

### B2. Desk rendering

- `js/desk-calendar.js` `htm`: a poster cell WITH `days` renders `U{u} Poster {admin}/{days}` and
  the subtitle `Build` (day 1), `Defend + finish` (middle days), `Gallery walk` (last day). Cells
  without `days` (Unit 1) render byte-for-byte as today.
- `cellAria`: with `days`: `{ds}, Unit {u} Poster day {admin} of {days}, {subtitle}`; without
  `days` unchanged (`tests/calendar-cohesion.test.js` pins `Unit 4 Poster gallery walk`).
- `posterLinksFor(t)`: normalize `/^(U\d+-Poster)\d+$/` to `$1` (day 2 AND day 3 share the entry;
  `U1-Poster2` still maps to `U1-Poster`).
- `POSTER_LINKS['U2-Poster']`:
  student `u2_poster/pdf/u2_poster_group_sheets_student.pdf` ("Group sheets — one per group, two
  pages each"), `u2_poster/pdf/u2_poster_example_board_demo.pdf` ("Example poster — the board demo
  (Claim, Proof, Repair)"), `u2_poster/pdf/u2_poster_walk_sheet.pdf` ("Gallery walk sheet — one per
  student, Friday"); teacher `u2_poster/pdf/u2_poster_teacher_key.pdf` ("Teacher key — answers,
  run of show, scoring grid, exit tickets"); `blurb: 'Groups of three. Judge your claim together
  first: verdict, proof, repair. Then build the poster.'`
- `_showPosterPanel`: the paragraph is `links.blurb` when present, else today's Unit 1 sentence.
  The Do Now poster line and the tooltip line are unchanged.

### B3. Builder (`scripts/build-lesson-schedule-sy2627.mjs`)

- The pacing-order invariant ignores `sectionOnly` cells (like work and break cells).
- Section 4: a unit whose `U{u}-Poster` cell is `sectionOnly` may be present for one period. It
  emits
  `posters['2'] = { unit:2, title:'Unit 2 Poster', kind:'poster', duration:{ days:3 }, periods:{ B:'2026-11-10', E:null }, days:{ B:['2026-11-10','2026-11-12','2026-11-13'], E:null }, sectionOnly:true }`.
  Unit 1's entry is unchanged. The "present for only one period" failure stays for pacing posters.
- `calendar.workDays.B` loses 11/13, 12/11, 12/18 (generated, not hand-edited). Never hand-edit
  either JSON copy: regenerate (`node scripts/build-lesson-schedule-sy2627.mjs`), then `--check`.

### B4. Server and Schoology (no code change expected; verify)

- `posterDatesFor` returns `{1: date, 2: null}` for E and `{1, 2: '2026-11-10'}` for B;
  `posterUnitsInQuarter(live, 'B', cfg, 'Q2')` = [2], `('E', 'Q2')` = []; `Q1` stays [1] for both.
- `gradebook-grid.js`: B's Q2 gradebook gains `POSTER:U2` dated 2026-11-10; E's Q2 has no poster
  column. `tools/schoology_components.py`: B's `POSTER:U2` column date becomes 2026-11-10 (MP2);
  E's keeps the PC-date fallback (2026-11-23). Both already exist as MP2 columns.
- The Q1 never-zero sets are unchanged (B 4.2-4.7, E 2.3 4.1-4.6).

### B5. Tests (re-pin from sim output, never typed from memory)

- `tests/desk-b-work-days.test.js`: the Work-Day fixture (7 dates with the next queued lesson),
  `ends.B[1]` = 2026-12-01, `calendar.workDays`; new cases: B posterDays place exactly the three
  cells above on 11/10, 11/12, 11/13; they consume no pacing item; the E column is deep-equal with
  and without B's posterDays; `without()`/the reference run strip posterDays (a synthetic def with
  posterDays on E and none on B leaves B deep-equal).
- `tests/desk-calendar-ced2026.test.js` and `tests/desk-e-pairing.test.js`: the new B-column sha,
  computed from the regenerated file.
- `tests/desk-poster-links.test.js`: the U2 entry, `posterLinksFor('U2-Poster3')`, the blurb, the
  teacher-only key.
- `tests/calendar-cohesion.test.js`: `cellAria({kind:'poster',u:2,admin:3,days:3})` contains
  `Unit 2 Poster day 3 of 3` and `gallery walk`; the legacy pin unchanged.
- `roster-server/tests/quarters-by-date.test.js`: posters keys ['1','2']; U2 periods.B before the
  U2 PC B day 1; periods.E null; days.B has three dates; the E "poster before PC" assertion is
  skipped when periods.E is null.
- `roster-server/tests/poster-track.test.js` (or lesson-grade.test.js): the live
  `posterUnitsInQuarter` values above.
- `tests/test_schoology_components.py`: with the live posters map, B `POSTER:U2` due 2026-11-10,
  E `POSTER:U2` due 2026-11-23.
- `UPDATE_M2B_GOLDEN=1` for `roster-server/tests/fixtures/m2b-invariance/`.

### B6. Gates, deploy

`node scripts/build-lesson-schedule-sy2627.mjs` then `--check`; `npm run test:quick`;
`cd roster-server && npx vitest run`; `python -m pytest tests/`; `npm run gitnexus:shadow`;
`node scripts/bump-build.mjs` before the commit (Desk + `js/desk-calendar.js` changed); GitNexus
`detect_changes` before committing. Push outside the B and E blocks; roster-server redeploys with
the new schedule. Land it before Tue 11/10's 16:30 Schoology sync (the first old date).

### B7. Period E (teacher 2026-11-13)

"Poster Activity starts for Period E today ... I project we'll finish on next Wednesday (2.10 resumes
on next friday for period E)." Same mechanism as B1: `SCHEDULE_DEFS["SY26-27"].periods.E.posterDays =
{2:[[2026,10,13],[2026,10,16],[2026,10,18]]}` (Fri 11/13, Mon 11/16, Wed 11/18). The B4 and B5 statements
that E has no Unit 2 poster are superseded.

- Period B is byte-identical. E's own run absorbs the three days; its lag-targeted pairing wins one
  meeting back (new pair 5.4+5.5 on Mon 12/07), so E ends one week later (last review 03/22 -> 03/29,
  slack before the exam 17 -> 15 meetings).
- E dates: 2.10 (4.10+4.11) 11/13 -> Fri 11/20; 1.10 -> 11/23; 5.2 -> 11/25; 5.1+5.3 -> 11/30; Unit 2 PC
  11/23+11/25 -> 12/02+12/04.
- `posters['2']` = `periods {B:'2026-11-10', E:'2026-11-13'}`, `days` for both, `sectionOnly:true`;
  `posterUnitsInQuarter(live, 'E', cfg, 'Q2')` = [2]. Schoology: E's `POSTER:U2` is dated 11/13 (MP2),
  `PC:U2` 12/02 filed 12/04; the per-day "2.10 Day 1/Day 2 Blooket" columns are created on 11/20.
- January (open for the teacher): E's Unit 3 PC moves 01/20+01/22 -> 01/25+01/27, past the Q2 end
  (01/22), and E 6.10/6.11 (01/11, 01/13) become Q3 lessons (lift-only in Q2). B's Unit 3 PC stays in Q2.
- The walk-sheet link label on the Desk says "last poster day" instead of "Friday". The kit's printed
  pages still name Period B and B's dates.
