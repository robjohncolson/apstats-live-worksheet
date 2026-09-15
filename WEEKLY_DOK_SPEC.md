# WEEKLY_DOK_SPEC.md — one misconception-driven DOK-3 sheet per week, auto-published Friday night

**Teacher (2026-09-12):** one DOK-3 worksheet per week; targeted misconceptions get marked "triaged" with the sheet
they went into, so later sheets never re-target them; runs automatically every Friday night; **auto-publish, no
"auto-drafted" label** — "If I don't like it, we will speak again."

Builds on: `MISCONCEPTIONS_SPEC.md` (the panel + `/class/misconceptions`), `DOK_DEPRECATE_DAILY_SPEC.md` (active
sheets = misconception sheets; schema `standalone:true` + `misconceptions:[…]` + `generated:{…}`),
`DOK_SELF_PACED_SPEC.md` + `DOK_VIDEO_FREE_SPEC.md` (the house rules the validator enforces).

## 1. Where and when

- Runs on **this laptop** (Athena) — it has Codex, MiKTeX, the teacher secret, and the push gate — as a Windows
  scheduled task **`APStats-WeeklyDOK`, Fridays 21:00 local**, exactly like `tools/daily_schoology_sync.ps1`.
  Entry point `tools/weekly_dok.ps1` → `node scripts/weekly-dok.mjs --apply`. `--dry-run` (default when no flag)
  prints the brief and the would-be selection, writes nothing. `--register` prints the `schtasks` command (the
  teacher runs it once; document it in the ps1 header). Logs to `tools/.weekly-dok-logs/<date>.log` (gitignored,
  same pattern as the Schoology logs).
- First scheduled run: **Fri 2026-09-18 21:00**. Manual: `node scripts/weekly-dok.mjs --apply --now`.

## 2. Selection (deterministic, tested)

1. `GET /class/misconceptions?section=PeriodB&days=14` and `…PeriodE…` with `x-teacher-secret` from
   `roster-server/.env` (read at runtime, never logged). Merge the `frequent` lists across sections by `key`
   (sum distinct students; union lessons/evidence).
2. Drop every key present in `roster-server/data/misconception-triage.json` (§4) unless it is flagged
   `recurringAfterTriage` (§4) — those are eligible again.
3. Rank by distinct students, then events, then key. **Floor:** if the lead label has fewer than **4** students,
   skip this week (log "below floor", exit 0, nothing published).
4. Pick **up to 5** labels: take the lead, then prefer labels sharing a NEW-CED topic cluster with it (same unit and
   adjacent topics per `2026-crosswalk.json`), then fill by rank. Both MCQ-derived and FRQ-derived labels qualify.
5. Write the **brief** `state/weekly-dok/<YYYY-MM-DD>-brief.md`: for each chosen label → key, label text, students,
   lessons, up to 3 evidence excerpts (student text or "chose C, correct A" — no student names), the CED skills; plus
   the sheet key to use (`topics` joined with `+`, e.g. `1.6+1.7+1.9`), and the house rules list.

## 3. Authoring (Codex, gpt-6-astra, medium — the same pin as everything else)

`scripts/weekly-dok.mjs` runs `codex exec --approve-for-me -m gpt-6-astra -c model_reasoning_effort="medium" -`
with `tools/weekly-dok-author-prompt.md` + the brief on stdin, in the repo. The prompt (checked in, teacher-readable):

- Author ONE new sheet: `dok/lessons/<key>.yaml` + `dok/registry/<key>.jsonl`, shape identical to
  `dok/lessons/1.1_1.2_1.4_1.7.yaml` / its registry row (copy the schema, not the content).
- **Fresh context** never used by an active or archived sheet and never one of the flagged answers' contexts
  (Flint, Charleston homes, superpowers, commute modes, screen time are all taken — the prompt lists every stem
  context already in `dok/lessons` and `dok/archive/lessons`).
- Four laddered parts (DOK 1 → 2 → 2 → 3), each rung aimed at one of the brief's labels; part (d)★ integrates.
- Scaffolds are **checklists and frames with blanks** — never a hint that gives an answer; a printed notes callout
  with its own title that states rules without applying them; everything a part needs is on the page (normal-table
  areas, values, definitions printed); no video/QR/timing/exit ticket (the validator will reject them anyway).
- Every sentence frame uses typed `\blankt[width]{role}` blanks and ships with a `word_bank` containing every needed term plus at least two plausible distractors (6-12 unique LaTeX-safe entries, at most 5 words each), with `word_bank_needed` identifying needed entries for the teacher key only.
- `misconceptions:` = the brief's keys, verbatim; `generated: { by: "weekly-auto", on: <date>, window_days: 14 }`.
- Codex must run `python dok/build_ladder.py --validate` and `powershell -NoProfile -File dok/compile.ps1 <slug>`
  and the DOK Vitest + pytest before returning; return non-zero if anything fails. It must NOT commit or push —
  the script does that.

## 4. Triage bookkeeping

`roster-server/data/misconception-triage.json` (bundled → Railway, so the endpoint can read it):
```json
{ "schema": "apstats-misconception-triage/v1",
  "entries": { "<key>": { "label": "…", "sheet": "1.6+1.7+1.9", "sheetTitle": "…", "triagedAt": "2026-09-18",
                          "students": 7, "sections": ["PeriodB","PeriodE"] } } }
```
- The script appends the chosen keys after a successful build (and back-fills the five Screen Time keys with
  `triagedAt: "2026-09-12"` on first run, from that sheet's `misconceptions:` field).
- `/class/misconceptions` reads it: every `frequent`/`class` row gains `triage: { sheet, sheetTitle, triagedAt } | null`;
  a triaged key whose events **after** `triagedAt` still put it in the top-15 for ≥ 3 consecutive weekly runs is
  flagged `recurringAfterTriage: true` (the script records `weeklyRuns[]` timestamps in the triage file to count).
- Dashboard: a **Status** column — "untriaged" · "triaged → <sheetTitle> (Sep 18)" · "still recurring after
  <sheetTitle>" in red; the "Remediation sheets" strip lists each sheet with its target labels; the misconceptions
  table's default sort keeps untriaged first.

## 5. Publish (auto, no draft state)

After validate + compile + tests pass: `git add` exactly the new YAML, registry row, three PDFs, three tex, the
manifest, the triage file, and the brief; commit `Weekly DOK sheet <date>: <title> — targets <keys>`; `touch
.git/PUSH_APPROVED`; `git push origin master`. GH Pages publishes the PDFs and index; Railway redeploys the triage
file. Then `git status` must be clean for those paths.

**Failure contract (corrected 2026-09-12 after Codex's preflight):**
- Any failure in select → author → validate → compile → tests → stage happens BEFORE the commit: nothing is
  committed, nothing stays staged, the triage file is untouched, the log says why, exit 1.
- The commit itself is the point of no return for the sheet. If the **push** fails (network, gate, remote ahead),
  the local commit is KEPT and reported (hash in the log), exit 1. The next run — scheduled or `--push-only` — first
  does `git fetch`, rebases the pending weekly commit(s) if needed, and pushes them BEFORE selecting a new sheet;
  it never authors a second sheet while one is unpublished. Task Scheduler shows the failure either way.
- The archive and existing sheets are never touched.

## 6. Tests

- `tests/weekly-dok-select.test.js`: merge across sections; triage exclusion; recurring-after-triage re-eligibility;
  floor skip; cluster preference; cap 5; deterministic ordering; brief contents; no student names in the brief.
- `tests/weekly-dok-run.test.js` (mocked codex/git/compile): dry-run writes nothing; apply path stages only the
  listed paths; any failing step aborts before commit; triage file updated only on success; Screen Time back-fill.
- `roster-server/tests/misconceptions-triage.test.js`: `triage` field, `recurringAfterTriage` after 3 runs, untriaged
  first.
- `tests/teacher-dashboard-misconceptions.test.js`: Status column rendering (textContent only).
- `tests/test_dok_build.py`: `generated.by == "weekly-auto"` sheets validate like any other.

## 7. Out of scope

Changing the grader, the panel's tags/maps, or archived sheets. No student-facing UI. The teacher's "20-item precision
check" for the draft vocabulary is unchanged and independent.
