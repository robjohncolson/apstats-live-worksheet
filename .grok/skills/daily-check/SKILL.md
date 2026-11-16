---
name: daily-check
description: "Check that the AP Stats grade jobs and services ran and are healthy, and say what to do about anything red. Use when the teacher says 'daily check', 'is everything up', 'did the sync run', or a status tile is red or amber."
---

# Daily check (AP Stats, on this PC)

Read-only until the teacher says otherwise. Report in plain words: what is fine, what is not, and the one
next step for each problem. Never name students in the report.

## 1. Services
- Open `https://robjohncolson.github.io/apstats-live-worksheet/status.html`, or fetch the same things yourself:
  `https://roster-production-12c1.up.railway.app/health`, `https://curriculumrender-production.up.railway.app/health`,
  `https://a2-live-worksheets-production.up.railway.app/health`, and `gh run list --workflow=ci.yml -L 3`.
- Amber right after a push is normal: deploys reset the in-memory job reports ("no report since the last roster deploy").
- CI red: open `gh run view <id> --log-failed`. Name the failing test and whether the last commit caused it.

## 2. Scheduled jobs (Task Scheduler on this PC)
`Get-ScheduledTask` / `schtasks /query /tn <name> /v /fo list` for: ApStatsPcReconcileB (16:00), ApStatsPcReconcileE (16:10),
ApStatsSchoologySync-B (16:30), ApStatsSchoologySync-E (16:45), "APStats Grade Nightly Backup" (21:00),
"APStats DOGE Payout Agent" (must be Running), "APStats Slips Agent", APStats-WeeklyDOK (Fri), "A2 Tomorrow Draft" (20:30).
The PC reconcile and the Schoology syncs do not start on battery.

## 3. Logs (in `tools/`; gitignored; may hold names: never paste them anywhere public)
- `.schoology-sync-logs/launcher.log` FIRST: every grade job writes `start` and `end exit <code>`. A start with no end
  means the job was killed.
- `.schoology-sync-logs/sync-<Section>-<stamp>.log`: the Schoology sync. A "did not persist" FAILED line can be a false
  negative: re-read that cell before calling it a failure.
- `.pc-reconcile-logs/reconcile-<Section>-<stamp>.log`: "NOT OPEN YET" is fine. "PAGE NOT READY ... not on the server"
  means Grok Bot's 3:40 PM AP Classroom pages are missing (weekend, or a deploy wiped them). "SIGN IN NEEDED" needs the
  teacher. "WOULD LOWER" is never auto-fixed: the teacher decides.
- `.payout-agent-logs/agent.log`, `.slips-agent-logs/`, `.weekly-dok-logs/`.

## 4. Fixes you may offer (do them only after the teacher says yes)
- Re-run a job: `Start-ScheduledTask -TaskName <name>`. Never run `doge-payout-agent.mjs --once` by hand: it is not a
  dry run, it broadcasts approved payouts.
- Schoology sign-in expired (rig at `%TEMP%\edge-claude-cdp`, CDP 9223): the teacher signs in (school SSO). Never type a
  password from a screenshot.
- Never hand-write a grade into Schoology, PowerSchool or the roster to "fix" a mismatch: report it.
- Never re-register a grade task with the register scripts without then running `tools/set_tasks_hidden.ps1 -Apply`
  (re-registering brings back the console window that let the jobs get killed).
