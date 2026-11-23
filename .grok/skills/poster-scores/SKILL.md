---
name: poster-scores
description: "Tally poster peer reviews into scores and enter them in the roster. Use when the teacher says 'enter poster scores', 'poster grades', 'tally the peer reviews', 'Unit 2 poster', or hands you peer review sheets or ratings."
---

# Poster scores (AP Stats)

**Privacy: running this sends student names and grades to xAI (Grok). The teacher must have agreed to that.**

Posters are 30% of Work = 15% of the quarter. Scale: I = 90, P = 100, E = 115. Always report the letter AND the number.
Scores go in only through `scripts/enter-poster.mjs`. Report counts, never names, in anything you write or paste.

## 1. What you need from the teacher
- The section (PeriodB or PeriodE). One file per section.
- Each poster's group members (real names).
- Each checker's three ratings (I, P or E) for the poster, from the peer review sheets (`u2_poster/peer_review_sheets.html`, "Teacher tally"), plus any Teacher-row overrule.
- Unit and quarter. Unit 2 is `unit=2 quarter=Q2`.

### Finding the names (learned on the Period B run, 2026-11-23)
- Posters carry first names only, and the script needs the exact full roster name. Get them with
  `node .grok/skills/poster-scores/roster-names.mjs PeriodB` (GET only; do not paste the output anywhere).
- Check every first name on a photo against that section's roster. A poster whose names are not on it
  belongs to the other section (B and E posters hang on the same wall): leave it out of this file.
- A poster with no names: list the roster students not named on any other poster and ASK the teacher who was on it.
- Roster students on no poster get NO row. Tell the teacher how many, and ask.
  Teacher's rule (2026-11-23): no poster = blank, never a zero. A poster can only help. The grade engine
  skips a missing poster and the sync leaves the Schoology cell empty, so do nothing: never enter a 0 or a 90
  for a student who made no poster.
- Read every photo yourself. A page that looks blank may be a pencil draft.

### "Put them on Schoology" means this skill
The teacher never types poster grades into Schoology. Apply here (step 5); the nightly sync writes the
Schoology "Unit 2 Poster" column (step 6). Tell the teacher the column fills after the next sync.

### When the peer sheets are thin
If a poster has fewer than two checkers with evidence, or no letters circled, the peer median cannot stand alone.
Read the poster photo against the rubric on the review sheet, show the teacher a table (peer result next to
your read, with the reason for each difference), and ASK which one counts. Your read becomes the score only as
the Teacher row, and only after the teacher says so. Period B, 2026-11-23: the teacher took the photo read
for all four posters (105, 100, 100, 110).

## 2. Tally rules
- Nobody rates their own poster.
- A rating with no evidence written does not count.
- Per question (1 Numbers, 2 Verdict, 3 Repair/picture/design): take the median of the checkers, order I < P < E.
  With an even number of checkers take the LOWER of the middle two.
- A question grade is the median unless the teacher overruled it in the Teacher row. Use the overrule.
- Poster score = the three question grades (each 90 / 100 / 115) averaged.
- Example, group "student A, student B": Q1 ratings E, P, P gives P. Q2 ratings E, E gives E. Q3 ratings I, P gives I (lower middle).
  Average = (100 + 115 + 90) / 3 = 101.67.
- Rounding (teacher, 2026-11-23): the script takes whole numbers only, so round to the nearest whole number,
  half up (101.67 becomes 102). Show the unrounded average next to the rounded score in the table.
- The script stores a letter from the number: 115 = E, 100-114 = P, 90-99 = I (so 97 shows as I). The number is the grade.
- A student on two posters (Period B ran posters 1,2,3,6 then 4-6) has ONE row. Ask which poster counts. Never average or pick.
- Absent or on no poster: ask the teacher. Never invent a score.

## 3. Build the file (outside the repo)
Folder: `$HOME/grade-backups/posters/` (`$HOME` is the teacher's home folder; names live here, never in the repo or `roster-local/`).
File name: `u2-PeriodB-2026-11-18.txt` (unit, section, date).
First line, then one row per student: `Real Name|102` (integer 90 to 115, or a letter E, P, I).

    unit=2 quarter=Q2 title=Unit 2 Poster section=PeriodB
    Student A|102
    Student B|115

Use Write to create it. Check every group member got a row. A line starting with `#` is a comment
(use one per poster: `# Poster 3 (P/P/E = 105)`).

## 4. Dry run (safe, only GETs)
Before it, show the teacher a table: poster, three question grades, unrounded average, rounded score, member count.
Then run:

    node scripts/enter-poster.mjs $HOME/grade-backups/posters/u2-PeriodB-2026-11-18.txt

Good output: one line per row with a login, the score and letter, then
`Dry run: N row(s) for POSTER-U2, Q2: ...`. If you see `?? NO MATCH` or `?? AMBIGUOUS`, or
"Unmatched or ambiguous names", fix the spelling with the teacher and run again. Report only the counts
(rows, matched, unmatched). Do not paste the table into any log that leaves this PC.

## 5. Apply (needs the teacher's explicit "yes, apply" in this session)
Only after the teacher has seen the per-poster table and the dry-run counts and says yes:

    node scripts/enter-poster.mjs $HOME/grade-backups/posters/u2-PeriodB-2026-11-18.txt --apply

Expect JSON with `"ok": true`, `written` equal to the number of rows, and `"errors": []`.
Anything else: stop and report. Do not retry.
Timing: no writes between 16:00 and 17:05 (sync window). Enter all posters BEFORE the Quarter 2 close
(a later row does not change a frozen grade).

## 6. Read back (GET only)

    node .grok/skills/poster-scores/readback.mjs $HOME/grade-backups/posters/u2-PeriodB-2026-11-18.txt

It prints row numbers (no names): expected, stored, OK / MISMATCH / MISSING, then
`readback: N ok, M mismatch, K missing`. Exit 1 means something is wrong: report it.
Next day check `tools/.schoology-sync-logs/sync-<Section>-<stamp>.log`. The nightly sync (16:30 B, 16:45 E)
copies POSTER-U2 into the Schoology "Unit 2 Poster" column by itself.

### If the teacher wants them in Schoology NOW (done 2026-11-23)
Do not run the full sync early: it would also post the day's "not permanent 0" cells hours before 16:30.
Push only the poster column instead (files go in your scratch folder, not the repo):
1. `python tools/build_schoology_fixture.py --section PeriodB --out <scratch>/fixture.json --granularity component --quarter Q2`
2. Keep only the keys ending in `/POSTER:U2` and save them as `<scratch>/poster-only.json` (flat JSON, `"uid/POSTER:U2": score`).
3. `python tools/schoology_sync_section.py --sync-section PeriodB --grades-fixture <scratch>/poster-only.json --granularity component --quarter Q2 --dry-run`
   Every `WOULD PUSH` line must be `POSTER:U2`, and their count must equal the rows you entered.
4. Same command with `--apply`. Expect `grades_pushed` = that count and `"errors": []`.
5. Run the `--dry-run` again: 0 `WOULD PUSH` and `grades_skipped` = the count means Schoology holds every score.
It also creates that day's lesson columns a few hours early, which is harmless. Not between 16:00 and 17:05.

## 7. Fixing a mistake
Re-posting replaces that student's row in place, so a corrected file is the fix and also the undo.
Make a file with only the corrected rows, dry run, get the teacher's yes, apply, read back. There is no delete.

## 8. Never
- Never add the poster to `POSTER_UNITS` or the schedule builder (it moves the poster onto the PC dates).
- Never type a poster grade into Schoology or PowerSchool by hand.
- Never put names or logins in the repo, in `roster-local/`, or in a commit.
- Never change the rounding rule yourself (nearest whole number, half up).
- Never run `--apply` without the teacher's go.
- Never print the teacher secret.
