# Review task — slips v2 (data-first slips, local print agent, DOK-app button, Monday 5am task)

You are a REVIEWER. Do not edit any file. Do not run git commands that change state. Do not start
servers or scheduled tasks. Read-only.

Repo: this working directory. Under review: the UNCOMMITTED working-tree diff (`git status --short`;
`git diff -- <file>` per tracked file; new files are untracked — read them directly):

- scripts/weekly-slips.mjs, tests/weekly-slips.test.js
- tools/slips-agent.mjs, tests/slips-agent.test.js
- tools/register_slips_agent_task.ps1, tools/register_slips_task.ps1, tools/weekly_dok.ps1, .gitignore
- dok/index.html, tests/dok-index-teacher-panel.test.js
- ap_stats_roadmap_square_mode.html (only `appLaunchUrl`, `git diff -U3 -- ap_stats_roadmap_square_mode.html`)

The contract is `SLIPS_V2_SPEC.md` (read fully). Background: `WEEKLY_REACH_SPEC.md §2`.

## What to look for (priority order)

1. **Privacy** — any path where a student name, username, or per-student score could reach the repo,
   a public page, a log that is tracked, or the browser page served from GH Pages. The agent's
   responses to the DOK page must contain counts and a folder path only. Test fixtures must not add
   real names. `assertSafeOut` must still refuse an in-repo output dir.
2. **Agent security** — loopback bind only (`127.0.0.1`), CORS allowlist exactly the four origins
   (no `*`, no reflection of arbitrary origins), preflight handled, `section` validated
   `^Period[A-Z]$` BEFORE it reaches `execFile`, no shell string, no secret read/forwarded, one run at
   a time (409), timeout, error tail bounded. Anything a malicious page on another origin could do
   by POSTing to the agent is a finding.
3. **Slip correctness** — the display distribution D = tentative zeros ++ real values; the student's
   own chip exactly once (in place when in D — tentative chip when their own 0 is tentative — else
   inserted in order); counting vs not-yet colours and wording (`0 since` / `0 after`); the "First"
   item rule (0 counting longest else soonest zero date); fallback sentence when the item is not in
   the pooled payload; ONE pooled fetch per run; the four `\definecolor` values (#CC0000, #FFF3B0
   bg / #8A6D00 ink, #D9B400, #FFF9DB) actually used; `latexText` escaping on every interpolated
   string (a name with `&`, `%`, `_`, `#` must not break pdflatex).
4. **Scheduling** — the slips step is really gone from `tools/weekly_dok.ps1` (and its brief line),
   with the DOK job's exit-code behaviour unchanged; `register_slips_task.ps1` = weekly Monday 05:00,
   `StartWhenAvailable`, logon-only, `-DryRun` / `-Unregister`, cwd = repo root, log path under the
   gitignored folder; no task is registered by the diff itself.
5. **DOK page** — panel only with `?teacher=1`; students' page byte-for-byte equivalent otherwise;
   health timeout; disabled state + start hint; 409 wording; no new external fetches. Desk
   `appLaunchUrl` adds `?teacher=1` only for `dok` and only for a verified teacher; `week` behaviour
   unchanged.
6. **Tests** — do they really exercise CORS deny, busy 409, the section validation, the chip order
   with a tentative own-0, and the fallback sentence? Any old pin deleted rather than updated?

## Output format (only this, no preamble)

```
VERDICT: <SHIP | FIX FIRST>
FINDINGS:
1. [PRIVACY|SECURITY|BUG|SPEC|EDGE|TEST] <file>:<line> — <one sentence: what is wrong>
   Repro/why: <one or two sentences, concrete input → wrong result>
   Fix: <one sentence>
2. ...
CHECKED-OK: <comma-separated spec sections verified with no finding>
```

Only report things that leak data, widen the agent's exposure, print a wrong slip, break the Friday
DOK job, or lose coverage. No style nits.
