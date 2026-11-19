---
name: nightly-brief
description: "Read or update the nightly class brief: the promises the teacher made out loud, carried forward until marked kept, plus next prep, for AP Stats B/E and Algebra 2 C/D/G. Use when the teacher says 'nightly brief', 'what did I promise B', 'brief for E', or 'mark that promise kept'."
---

# Nightly brief (promises carried forward)

Read-only unless the teacher tells you to close a promise. Never name students in a report.

## Where the briefs are
- AP Stats (B, E): `C:/Users/rober/downloads/Projects/school/follow-alongs/roster-local/brief/<next-meeting-date>-<S>.md`
- Algebra 2 (C, D, G): `C:/Users/rober/downloads/Projects/school/algebra2-live-worksheet/roster-local/brief/<next-meeting-date>-<S>.md`
- `latest.json` in each folder lists every section, its next meeting, file and open count.
- A scheduled task (`APStats-NightlyBrief`, 20:45) writes them, once the teacher has registered it.

## How to read one
- AP Stats brief: Next meeting (what the schedule has that day; "No schedule item" means check the Desk calendar,
  never guess), Last class (Landed, Student questions; or "No recording for the last class"), Open promises,
  Next prep, Owed / coming up (schedule only: Progress Check days, poster days, lesson zero dates; it does NOT
  know per-student missing work), Close a promise. A bold "Pull failed" line on top means the summaries are stale.
  A bold "Jobs" line appears only when a scheduled job failed or had nothing to do more than 3 runs in a row.
- Algebra 2 brief: Open promises, Next prep, Close a promise, plus a pointer to the 20:30 Tomorrow note
  (`roster-local/tomorrow/<date>-<S>.md`) for the Do Now, quiz target and packet.
- `--list` prints only OPEN promises in AP Stats, but every promise with its state in Algebra 2.
- Promises are commitments the teacher said out loud to that class. Treat each as owed. Say its age ("first said 11/10, 8 days open").
- "wording changed upstream" means the summary was re-pulled with different words: probably a duplicate, so ask the teacher before dropping it.
- Jobs line (AP Stats only): name the failed job to the teacher with one next step (the daily-check skill has the logs).

## Close a promise ONLY when the teacher says so
Run from the right repo. AP Stats:
`cd C:/Users/rober/downloads/Projects/school/follow-alongs && node scripts/nightly-brief.mjs --list --section B`
Algebra 2:
`cd C:/Users/rober/downloads/Projects/school/algebra2-live-worksheet && node scripts/carried-promises.mjs --list --section C`
1. Run `--list` first. Match the teacher's words to exactly ONE id. If two match, show both and ask which.
2. Then `--kept <id>` (done) or `--dropped <id>` (no longer applies), with the same script.
3. Bulk drop (`--dropped-before YYYY-MM-DD [--section S]`) only on an explicit teacher instruction naming the date.
4. `--reopen <id>` undoes a close.
5. Regenerate so the brief shows the change: AP Stats `node scripts/nightly-brief.mjs --no-pull`;
   Algebra 2 `node scripts/carried-promises.mjs`.

## If a brief is missing or stale
Run it by hand (cd into the repo first): `node scripts/nightly-brief.mjs --no-pull` (AP Stats; drop `--no-pull` to
pull fresh summaries) or `node scripts/carried-promises.mjs` (Algebra 2). Then read the new file.

## Never
- Copy promise text or student names into anything tracked or public (commits, PRs, issues, Pages, Slack). The briefs,
  `promises.json` and `latest.json` live in gitignored `roster-local/` and must stay there.
- Close, drop or reopen a promise on your own judgment, even if the brief says it looks done.
- Edit `promises.json` by hand: use the commands above.
