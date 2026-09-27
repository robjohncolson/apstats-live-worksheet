# Slips v2 — data-first, Desk colours, one button in the DOK app (2026-09-26)

Teacher: "I like your thoughts [lead with the score list, not the box plot] … I'd rather it live in
the DOK app as a button … print in color, same color as the desk."

Builds on `WEEKLY_REACH_SPEC.md §2` (slips v1, `scripts/weekly-slips.mjs`, shipped `a26e57f8`), the
Missing-work card / calm ledger (`LEDGER_CALM_SPEC.md`) and tentative zeros (`TENTATIVE_ZEROS_SPEC.md`).
**Privacy is unchanged and non-negotiable:** slips carry names → built on the teacher's laptop, written
to `%USERPROFILE%\grade-backups\slips`, never into the repo, never served by GH Pages. The "button" in
the DOK app therefore talks to a LOCAL agent on the laptop, never to the public site.

## 1. Slip content (`scripts/weekly-slips.mjs`)

Half-page slip, two per Letter page, colour. Order top → bottom:

1. **Header line** (unchanged idea, Desk words): `Q1 so far: 31%. Class median 97.` — the box-plot
   sentence ("below Q1") moves to §1.4.
2. **Missing work** — one row per item, same source rule as today (`missingWork` = the Desk's
   `_zeroWarnings` rule incl. quizzes and non-bonus decks), same ORDER as the Desk (counting first,
   then by zero date). Each row printed with the Desk's colours:
   - counting now → left bar `#cc0000`, background `#fff3f3`, text `0 since Sun 9/20`
   - not yet → left bar `#d9b400`, background `#fff9db`, text `0 after Sun 9/27`
   - verb first: `Open 1.3 · Tabular …` / `Quiz 1.3 · …` / `Flashcards 1.3 · …`
3. **The class on your first item** — ONE anonymous score strip for the slip's "First" item (the
   Desk's `_snapFocus` rule: the student's 0 counting longest, else the item that becomes a 0
   soonest). Data = `GET /class/snapshot?section=all&by=assignment` (teacher secret), item key
   `<lessonKey>:<track>`; display distribution D = tentative zeros ++ real values:
   - tentative zeros: chip with background `#fff3b0`, ink `#8a6d00`
   - real zeros and every other score: black on white
   - the student's own chip: `#cc0000`, bold, underlined — in place when the value is in D
     (a tentative chip if their own 0 is tentative, else a real one), inserted in order otherwise
     (`withOwn` rule from `lib/class-snapshot.js`)
   - lead line `All 30 scores for 1.3 Follow-Along (2 tentative):`, foot line
     `26 of 30 classmates have a score here. 2 haven't yet — a tentative 0 until Sun 9/27.`
   - key line under it (Desk `_snapListKey` words): `red = you · yellow = a 0 that is not counting yet · every other number is one classmate`
   - if the item is not in the pooled payload (combined worksheet keyed by another lesson, or n
     withheld) print `Class scores for this one aren't available yet.` — never fail the slip.
4. **Section box plot** — kept, but smaller (height ≈ 0.8in) and LAST, with the one sentence
   `You: 31 — below Q1.` under it. Red dot = the student (already so).
5. **What to do first** — unchanged (`planFor`).
6. Footer unchanged (date, "Any score replaces a 0", "see the Desk for the graphs").

Implementation notes: pgfplots is already loaded; chips are `\colorbox` runs inside a ragged
paragraph (`\sloppy`, `\hspace{2pt}` between chips) — 30 chips must wrap onto 2–3 lines within the
half page. Define the four colours once in the preamble (`\definecolor{deskred}{HTML}{CC0000}` etc.).
Everything textual goes through the existing `latexText` escaper. Keep the two-slips-per-page
layout and the `assertSafeOut` refusal to write inside the repo.

The pooled payload is fetched ONCE per run (not per student). Reuse the same request headers as the
existing `/class/snapshot` call in `main`.

Tests (`tests/weekly-slips.test.js`, extend): a `scoreStrip(item, ownValue, ownTentative)` pure
function returns the ordered chip list with kinds `tent|real|you`; the lead/foot/key strings above;
`firstItem(missing)` picks counting-longest else soonest; the rendered TeX contains the four
`\definecolor` lines and a `\colorbox{desktentative}` per tentative chip; unavailable item → the
fallback sentence; still no names in `tests/` fixtures beyond the existing fake ones.

## 2. The local print agent (`tools/slips-agent.mjs`)

A tiny Node HTTP server on the laptop, loopback only.

- Listens on `127.0.0.1:47831` (constant `SLIPS_AGENT_PORT`; `--port` override).
- CORS: `Access-Control-Allow-Origin` echoed ONLY for these origins:
  `https://robjohncolson.github.io`, `https://apstats-live-worksheet.vercel.app`, `http://localhost:*`,
  `http://127.0.0.1:*`; handles `OPTIONS` preflight; `Vary: Origin`. Any other origin → 403.
- `GET /health` → `{ ok: true, agent: 'slips', version, lastRun: { at, counts, out } | null }`.
- `POST /slips` (JSON body optional `{ section?: 'PeriodB'|'PeriodE', all?: boolean }`) → runs
  `node scripts/weekly-slips.mjs [--section S] [--all]` with `cwd` = repo root via `execFile`
  (never a shell string), 120 s timeout, ONE run at a time (a second POST while running → 409
  `{ ok:false, error:'busy' }`). On success parses the `Slips: …` summary line → `{ ok:true, counts:{B,E},
  out, pdfs:[...] }` and opens the output folder in Explorer (`explorer.exe <out>` via `execFile`,
  best-effort). On failure → 500 with the script's last 20 stderr lines.
- No secrets in the agent: the slips script already resolves the teacher secret itself
  (`roster-server/.env` / `ROSTER_TEACHER_SECRET`). The agent never reads or forwards it.
- Logs to `tools/.slips-agent-logs/agent.log` (folder gitignored — add to `.gitignore` next to the
  payout-agent logs entry).
- `tools/register_slips_agent_task.ps1`: same shape as `tools/register_payout_agent_task.ps1`
  (at-logon task for the current user, 5-minute keep-alive repetition, `-DryRun`, `-Unregister`).
  Task name `APStats Slips Agent`. Do NOT register it in this pass — the orchestrator runs the
  script once by hand (that is a system change the teacher sees).

Tests (`tests/slips-agent.test.js`, new; import the module's exported `createServer(opts)` with an
injected `runSlips` function): health shape; CORS allow/deny per origin incl. preflight; POST runs
once, 409 while busy, parses the summary line, 500 with stderr tail on failure; `section` is
validated against `^Period[A-Z]$` (anything else → 400) so nothing user-controlled reaches `execFile`.

## 2b. When the slips build themselves (teacher: "5am on Monday mornings, so the info is current")

- The slips step LEAVES `tools/weekly_dok.ps1` (Friday 21:00 is four days stale by Monday). Remove the
  slips block there and the `Slips:` line from the weekly brief; the DOK job's exit code and the
  rest of its steps are untouched.
- New `tools/register_slips_task.ps1` (same shape as `register_schoology_sync_task.ps1`): Scheduled
  Task **APStats Weekly Slips**, trigger WEEKLY on Monday at **05:00** local, runs
  `node scripts/weekly-slips.mjs` (prints PDFs; `--date` defaults to today) with `cwd` = repo root,
  output appended to `tools/.slips-agent-logs/weekly.log`, `-DryRun` / `-Unregister` flags, and
  `StartWhenAvailable` so a laptop asleep at 05:00 runs it at wake. Run ONLY while the teacher is
  logged on (the roster secret comes from the local `.env`; the laptop stays logged on like the
  payout agent's).
- The agent's `/health.lastRun` reads the newest `*-slips.pdf` mtime + the last `Slips:` line of
  `weekly.log`, so the DOK-app panel says `Last printed Mon 9/28 05:00: B 5 · E 4` whether the
  slips came from the Monday task or the button.
- Do NOT register the task in this pass; the orchestrator registers it by hand and confirms.

## 3. The button in the DOK app (`dok/index.html` + Desk `appLaunchUrl`)

- Desk `appLaunchUrl(app, 'dok')` appends `?teacher=1` when `_deskIsTeacher()` (mirrors the `week`
  app's `?ced=1`). Students get the plain URL.
- `dok/index.html`: when `location.search` has `teacher=1`, render a small panel ABOVE the sheet list,
  System-7 look (grey box, 1px black border), titled **Slips — students who are falling behind**:
  - text: `Paper "where you stand" slips for anyone under 70% or with a 0 counting. Built on this
    laptop only (names inside); prints to the Grade Slips folder.`
  - button **Print slips now** → `POST http://127.0.0.1:47831/slips` → on success show
    `Printed B 5 · E 4 → C:\…\grade-backups\slips (opened)`; on 409 `Already running…`; on failure
    the error text.
  - on load, `GET /health` with a 1.5 s timeout: if it fails, the button is disabled and the panel
    says `The print agent is not running on this computer. Start it: powershell -NoProfile -File
    tools/register_slips_agent_task.ps1 (one time), or node tools/slips-agent.mjs.` If it succeeds
    and `lastRun` exists, show `Last printed <date>: B n · E n`.
  - the panel never appears without `teacher=1` (students see the public page exactly as today).
  - keep the page dependency-free (no fetch of anything but `manifest.json` and the loopback agent).
- Test: `tests/dok-index-teacher-panel.test.js` (jsdom, load the HTML with `?teacher=1` vs without;
  stub `fetch` for `manifest.json`, `/health`, `/slips`): panel present/absent; disabled state on
  health failure with the start hint; success line after POST; 409 wording. Add `'dok'` to the
  `appLaunchUrl` test that pins the `week` `?ced=` behaviour (grep `tests/` for `appLaunchUrl`).

## 4. Out of scope
The weekly Friday run (`tools/weekly_dok.ps1`) keeps calling the same script — it gains the new
layout automatically. No roster-server change. No change to who is a candidate.

## 5. Acceptance
- `npx vitest run tests/weekly-slips.test.js tests/slips-agent.test.js tests/dok-index-teacher-panel.test.js` green, plus the `appLaunchUrl` pin; the `weekly_dok` tests (grep `tests/` for `weekly_dok` / `weekly-dok`) updated for the removed slips step.
- `node scripts/weekly-slips.mjs --dry-run` still prints the `Slips:` summary; `--no-pdf` renders TeX
  that `pdflatex` compiles (the orchestrator will compile one section by hand and look at the PDF).
- `node tools/slips-agent.mjs --port 47899` then `curl -s http://127.0.0.1:47899/health` answers.
- LF endings; no build bump / shadow regen / commit — the orchestrator releases.
