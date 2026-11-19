# Proposal: run the PC reconcile when the pages arrive, not at 16:00

Status: PROPOSAL 2026-11-18. Nothing here is built or registered. Fits APCLASSROOM_READER_SPEC.md
(sections 3 and 4); does not replace them.

## What the logs show (tools/.pc-reconcile-logs/, 11/10 to 11/18)

- The reader (Grok Bot routine "AP Classroom progress scrape", weekdays) finishes between about
  15:30 and 16:00: page ages at the 16:00/16:10 runs were 0.5 h (11/11), 0.2 h (11/13),
  0.0 h (11/17 PeriodB at 16:00:03). The Athena tasks run at a fixed 16:00 / 16:10, so this is a race.
- On 11/16 and 11/18 (school days) no page was on the server at 16:00 or 16:10, with no push
  in between. Either the reader ran late or not at all, or the server restarted.
- The server restarts WITHOUT a push: on 11/18 `/health` showed the FRQ worker's tick count
  rising one per minute from about 22 at 00:06Z, so the process started about 23:43Z (18:43 local).
  The last push was 10:57. Every restart erases the in-memory pages and the job results.
- Missing evidence: the reader routine's own run history for 11/16 and 11/18, and Railway's
  restart log. Both are needed to say which of "late", "did not run" or "restart" happened.

## Proposal A (stopgap, client side only): wait for the pages

Add `-WaitForPages` to `tools/daily_pc_reconcile.ps1`:

1. Start the task at 15:35 (both sections in one task: PeriodB, then PeriodE).
2. Every 2 minutes, GET the PUBLIC `https://roster-production-12c1.up.railway.app/health` and read
   `apclassroomPages {count, newestAt}` (no secret needed).
3. Run the reconcile when `newestAt` is today (school time) AND `count` and `newestAt` did not
   change across two polls (the reader has finished its list).
4. Deadline 16:25 (the Schoology syncs read the PC rows at 16:30 / 16:45): run anyway. With no
   pages the run records "nothing to do" (two school days in a row: "reader-down").

Registration (the teacher runs it; never this script), replacing the two 16:00 / 16:10 tasks:

    schtasks /Create /SC DAILY /TN ApStatsPcReconcile /ST 15:35 /F /TR "wscript.exe ...\run_hidden.vbs reconcile powershell.exe -NoProfile -ExecutionPolicy Bypass -File ...\daily_pc_reconcile.ps1 -Section Both -Apply -Pages server -WaitForPages"

Cost: about 30 lines of PowerShell, no server change. Risk: low (it only delays the same run).

## Proposal B (the real trigger, after spec section 4 is built)

Once the reader posts `POST /admin/apclassroom-reader-run` and `/health` shows
`apclassroomReader.at`, step 3 becomes "run when `apclassroomReader.at` is today". That is an
exact "the reader finished" signal, and `signInNeeded` can become its own failure reason.

## Proposal C (zero code): start the reader earlier

Ask Grok Bot to start the routine at 15:00 instead of 15:40. The 16:00 runs then see fresh
pages unless the server restarted. Cheapest change; does not fix restarts.

## Still needed regardless

Spec section 3 (durable page store, migration 0046): the observed no-push restart erases the
pages, and no client-side timing can fix that.

## Recommendation

C now (a message to Grok Bot), A only if C is not enough within a week, B when section 4 ships.
Section 3 is the fix for restarts and should go first among the server work.
