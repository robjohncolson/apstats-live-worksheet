---
name: quarter-close
description: "Close an AP Stats quarter (Quarter 2, January 2027): freeze grades, apply the bonus, write the Schoology final, prepare the PowerTeacher list. Use when the teacher says 'close the quarter', 'quarter 2 close', 'final grades', 'report card grades', or 'PowerTeacher'."
---

# Quarter 2 close (AP Stats, on this PC)

**Privacy: running this sends student names and grades to xAI (Grok). The teacher must have agreed to that.**

Every command needs `--quarter Q2` (the tool defaults to Q1). One command per line, no chaining.
Never put a student's name or login in a repo file, a commit, or Ops. Say "student A". Files with names go in
`$HOME/grade-backups/q2-close-<YYYY-MM-DD>/` (never in the repo; `$HOME` is the teacher's home folder). Never print the teacher secret.
Set `PYTHONIOENCODING=utf-8` for python. Never run anything between 15:55 and 17:10.

## Who may do what
| Grok alone (read-only) | Teacher go required | Teacher only |
|---|---|---|
| dry runs, backup, `close-check.mjs bank/deltas/powerteacher`, `rig-visible.py`, log reads | W0 config date commit + push; W1 `python tools/close_quarter.py --quarter Q2 --apply`; any re-run of a failed final | typing into PowerTeacher; typing a Schoology override; any database edit; signing in to Schoology or PowerSchool |

The read-only previews (`schoology_official.py --final Q2` without `--apply`) drive the rig: run them only with the teacher present, outside 16:00-17:05.

## 0. The Q2 date must be deployed first
`roster-server/grade-config.js` quarters.Q2 has NO `close` or `finalUntil` today. Without `close`, `--apply` is
refused ("no close date"), and from 2027-01-23 the daily Schoology sync runs no Q2 pass at all.
1. Ask the teacher for two dates: the close date (the fix-by date students were told) and `finalUntil` (the last day the Desk shows "Quarter 2 final").
2. Add `close: 'YYYY-MM-DD', finalUntil: 'YYYY-MM-DD'` to the Q2 line (Q1's line is the pattern). Run `npm run test:quick`.
3. Commit and push with the `commit` skill, only with the teacher's go, never during a live B or E block (every push redeploys roster-server). It must be live before 2027-01-23.
4. Verify: `python tools/close_quarter.py --quarter Q2 --today <any date>`. The first line must say `close date <the date>`, not `None`. If `None`, the deploy has not landed: wait and re-run.

## 1. Timing and conditions (all must be true)
- The morning AFTER the close date (`--apply` is refused while today <= close date), before 16:00. From 16:00 to 17:05 it is refused (live sync window).
- Check the clock with `python -c "import datetime; print(datetime.datetime.now())"` and say the time out loud in your report.
- Teacher at the laptop, laptop on AC, screen unlocked, not in a class block if possible.
- Rig Edge window (CDP port 9223) visible: `python .grok/skills/quarter-close/rig-visible.py` must print `visible`. `hidden` or `rig not running`: ask the teacher to uncover or open the window, then check again. Keep the terminal small so the rig window stays partly visible.
- Never an unattended or scheduled run. At Q1 a 07:00 one-shot froze the grades but its final failed on a hidden rig.

## 2. Everything entered BEFORE the go
Every poster counted in Q2 (poster-scores skill; the Unit 2 posters use `quarter=Q2`, POSTER-U2 rows), DOK bonus sheets (BONUS-... rows),
Progress Check parts (pc-frq-scoring skill, PC reconcile). A bonus sheet entered after the close is never added.
A row after the freeze never changes the frozen grade. Ask the teacher: "Is everything in?"

## 3. Backup (verified)
`node tools/nightly-backup.mjs --config $HOME/grade-backups/config.json --dir $HOME/grade-backups/q2-close-<YYYY-MM-DD>`
`--dir` overrides the config folder. It only reads the server and writes local files. Exit 0 = verified. Exit 1: stop, tell the teacher.

## 4. Pre-flight (all read-only). Anything on the STOP list: tell the teacher, do not go.
1. `python tools/close_quarter.py --quarter Q2` twice, a few minutes apart. Read the header (`close date`, mode DRY-RUN) and the counts.
2. `node .grok/skills/quarter-close/close-check.mjs bank --quarter Q2 --snapshot $HOME/grade-backups/q2-close-<YYYY-MM-DD>/latest.json`
   Show the teacher the bank per sheet. A `DOUBLE` line means one student holds one sheet twice (at Q1 a whiteboard bonus was entered twice for Period B; the teacher chose to keep it). The teacher decides. It also warns at 9,000 ledger rows (the per-read cap is 10,000).
3. REQUIRED previews (rig, teacher present; the Q2 final path has never run before, this proves it can read Marking Period 2):
   `python tools/schoology_official.py --section PeriodB --final Q2`, then the same for `PeriodE`. They switch the gradebook view and write nothing.
   Each row shows the student's current MP2 override next to what the final would write.

STOP list:
- Any student whose live Q2 column differs between the two dry runs. Known bug: a ledger read error becomes an EMPTY ledger, so the close could freeze a 0 or a too-low grade, and the first close wins forever.
- Any student with live Q2 of 0, or far below their current MP2 override in the preview.
- A preview that cannot read MP2 (exit 3, "grid rendered no columns"): fix the rig first.
- A student at 9,000 or more ledger rows.
- Rig not `visible`, a clock inside 15:55-17:10, the Q2 close date not shown in the header.
- Something not entered (step 2).

## 5. The go (one explicit teacher go, naming all three writes)
Say this to the teacher and wait for a yes: "`python tools/close_quarter.py --quarter Q2 --apply` makes three production
writes. (1) It freezes every student's Quarter 2 grade, per section; the first close wins and no tool can undo it.
(2) It adds each student's banked bonus once. (3) It writes the Schoology Marking Period 2 final override, once per
student (the higher of the closed grade with bonus and the current override), and publishes it to the Desk. Go?"
Then run exactly:
`python tools/close_quarter.py --quarter Q2 --apply`
Never split it into hand-made POSTs (that skips the rig lock and the clock guards). Never add `--today` (it is refused).
The go covers re-running the SAME command in the same sitting. Anything else needs a new go.

| Exit | Meaning | Do |
|---|---|---|
| 0 | done | step 6 |
| 1 | a step failed | read the `[STOP]` line, re-run the same command (safe, idempotent) |
| 2 | refused, nothing changed | read the reason (date, 16:00-17:05 window, rig lock held, no close date) and fix it |
| 3 | `[STOP] it is 16:xx` | the live sync window: re-run after 17:05 |
| 3 | `[final] ... grid rendered no columns` or `no student row` | rig page hidden: ask the teacher to show the Edge window, check `rig-visible.py`, re-run |

If `close` or `apply-bonus` reported a problem that a re-run does not fix, or a freeze looks wrong: stop and report.
Nothing unfreezes a bad freeze (only a teacher-run database edit). Schoology is protected by the max rule; the Desk frozen record is not.

## 6. Read-back (all must hold)
1. `python tools/close_quarter.py --quarter Q2`: "already closed" equals "with a Q2 grade"; each closed value equals the live value (plus the bonus where one was banked).
2. `node .grok/skills/quarter-close/close-check.mjs deltas --quarter Q2 --close <close_quarter.py --apply date, YYYY-MM-DD>` (the date defaults to today). It makes two checks and prints row numbers only, no names:
   - **Delta check:** any delta above 1 point (the live grade is well above the frozen one: a freeze that is too low) is `BAD`.
   - **Low-freeze check:** each frozen value is compared with the official grade in the newest nightly Schoology sync log (`tools/.schoology-sync-logs/sync-<Section>-<stamp>.log`, table "official Quarter 2 grades") dated STRICTLY BEFORE the close date. Any frozen value more than 0.15 below it is `LOW FREEZE`. The nightly ledger backups (`$HOME/grade-backups/snapshots/<date>.json`) hold records, not grades, so they cannot serve as the baseline.
   - Exit 1 on any `BAD`, any `LOW FREEZE`, or a `WARN` that no baseline log was found (then the low-freeze check was NOT done: tell the teacher, never treat it as a pass). A `LOW FREEZE` can be a real zero that took effect after the last nightly: report it to the teacher and stop.
3. `tools/.schoology-sync-logs/official-final-state.json` has PeriodB.Q2 and PeriodE.Q2 with `done` true and every student `written` and `published` (read counts only, print no names).
4. The previews (step 4.3) show `same` on every row.
5. The next day: the newest `tools/.schoology-sync-logs/sync-<Section>-<stamp>.log` shows `Today's passes:` without Q2. `launcher.log` has start and end lines.

## 7. PowerTeacher Pro (the report card; PowerSchool calls Q2 "M2", 11/07 to 1/22)
Grok has no browser tool here and a grade-write path does not exist: the TEACHER types.
1. `node .grok/skills/quarter-close/close-check.mjs powerteacher --quarter Q2`
   It writes `powerteacher-Q2.txt` WITH names into the grade-backups folder (refuses to write inside the repo) and prints only counts. Tell the teacher the path.
2. Teacher opens `https://lynnschools.powerschool.com/teachers/index.html#/classes/final_grades?sectionId=<id>`: AP Statistics Period B = 67887, Period E = 67888. Check the section id in the address bar every time. Never touch the Algebra II sections C, D, G.
3. Per row: percent field first, then the letter field (typing a percent leaves the old letter; set both and check both). One Save per section, then reload and read every row back.
4. Scale used at Q1: A 93+, A- 90-92, B+ 87-89, B 83-86, B- 80-82, C+ 77-79, C 73-76, C- 70-72. Whole percent, half up (95.9 -> 96, 91.5 -> 92).
5. Teacher policy: any F is raised to 70% in PowerSchool only (never in Schoology or the Desk). OPEN QUESTION: the scale has no D band, and 70 is "C-" on the scale but the policy says "70% (C)". For a raised F and for anything 60-69 the file says `ASK`: ask the teacher which percent and letter to type. Never guess. The Q1 authorization was for that day only: ask again.
6. A student with "Desk only: no Schoology row" has no Schoology final: tell the teacher.
7. Report-card comments are optional. If asked, draft them from `/class/grades` facts into the private folder for the teacher to paste.

## 8. After
- Nothing reopens. A lift later is never automatic: the teacher types a higher override in Schoology and the same number in PowerSchool.
- Q3 passes start with the sync from 2027-01-25; confirm with the step 6.5 log check.

## Never
- Register a scheduled or one-shot task for the close.
- Hand-make a POST to `/class/quarter/close` or `/class/quarter/apply-bonus`, or use `--today` with `--apply`.
- Lower any grade, or run `tools/schoology_official.py --apply` yourself.
- Put names in the repo, Ops, a commit, or this chat's summary.
- Touch Algebra II sections, or type a password (never from a screenshot).
