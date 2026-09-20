# Weekly DOK — run isolated from the working checkout

Status: SPEC 2026-09-20. Amends `WEEKLY_DOK_SPEC.md`. Owner files: `scripts/weekly-dok.mjs`,
`tools/weekly_dok.ps1`, `tests/weekly-dok-run.test.js`, `.gitignore`, `vitest.config.js`.

## 1. Problem

The Friday job (`tools/weekly_dok.ps1 -Apply` → `scripts/weekly-dok.mjs --apply`) runs inside the
teacher's working checkout, so it fails whenever that checkout is "in use". The first scheduled run
(2026-09-18 21:00 and the 2026-09-19 07:00 catch-up) failed at preflight because tracked files were
dirty, and the failure was silent. Dirty files were patched (`63cefe3a`), but the same class of failure
remains for: unpushed non-weekly commits, a non-`master` branch, a non-empty index, a rebase/merge in
progress, and a diverged local `master`.

Teacher requirement: **the weekly sheet publishes regardless of the state of the working checkout, and
never publishes anything except the sheet.**

## 2. Design

### 2.1 Two roots

`createRuntime(root, overrides)` becomes `createRuntime({ home, work }, overrides)`.

| Root | Meaning | Used for |
|------|---------|----------|
| `home` | The teacher's checkout (where the script file lives) | `roster-server/.env` (untracked secret), `node_modules`, creating/removing the worktree, logs |
| `work` | A throwaway worktree at `origin/master` | EVERYTHING else: reading triage/crosswalk/skill-map/lessons, the brief, Codex authoring (cwd), validate, compile, tests, audit, stage, commit, push |

In `dry-run` mode no worktree is created: `work = home` (dry-run stays read-only and fast). Dry-run
therefore reports against the local files, which is acceptable for a preview.

### 2.2 Worktree lifecycle (apply and push-only)

Path: `<home>/.weekly-dok-wt` — deliberately INSIDE the checkout so Node's module resolution walks up
to `<home>/node_modules`. **No junction or symlink to node_modules may be created** (a
`git worktree remove --force` once deleted the real `node_modules` through a junction).

1. `git -C home fetch origin master`.
2. If `<home>/.weekly-dok-wt` exists (crashed earlier run): `git worktree remove --force` it, then
   `git worktree prune`. If the directory still exists, fail with `Stale weekly worktree could not be removed`.
3. `git -C home worktree add --detach .weekly-dok-wt origin/master`.
4. Run the pipeline with `work` = that path.
5. `finally`: `git -C home worktree remove --force .weekly-dok-wt` + `git worktree prune`. Cleanup
   failure is logged, never thrown over the real result.

Add `.weekly-dok-wt/` to `.gitignore` and to the vitest `exclude` list (so a crashed run's leftover
never doubles the root test suite).

### 2.3 Pipeline changes

- **Delete** `preflight`'s branch / index / tracked-files checks and the `dirtyBefore` fingerprinting.
  The worktree is clean by construction. Keep ONLY the time-window check (Fri ≥21:00 – Sat <12:00,
  `--now` bypasses, date ≥ 2026-09-18).
- **Audit** returns to the strict form: inside `work`, `git diff --name-only HEAD` may contain only
  `dok/manifest.json` and `roster-server/data/misconception-triage.json` (history-only until the run
  writes it). Anything else → `Author changed existing tracked files`.
- **Delete** `recoverPending`. A retained local commit can no longer exist: the commit lives only in
  the worktree. Replace with the push rule below. `--push-only` mode is removed from the script and
  the ps1 (`-PushOnly` prints a one-line "no longer needed" and exits 0 so an old scheduled command
  cannot break).
- **Push**: `git push origin HEAD:master` from `work`, after writing the one-shot sentinel at
  `git -C work rev-parse --git-path PUSH_APPROVED` (the pre-push hook reads `$(git rev-parse
  --git-dir)/PUSH_APPROVED`, which inside a worktree is the worktree's own git dir — verify they
  resolve to the same file). If the push is rejected because origin moved: `fetch`, `rebase
  origin/master` (the single weekly commit), re-run `validate`, write a fresh sentinel, push once
  more. A second rejection or a rebase conflict → `rebase --abort`, throw `Publication failed: origin
  moved twice`. Nothing is retained; the next trigger (Sat 07:00) re-authors.
- **Already-ran guard** reads triage from `work` (origin's copy) — the authoritative record.
- **Tests inside the worktree**: run vitest as `node <home>/node_modules/vitest/vitest.mjs run --root
  <work> <dok test files>`; pytest with cwd `work`.
- **GitNexus detect-changes**: best-effort. Run it; on any error log `change detection skipped` and
  continue. The audit is the real guard.
- **Student-PDF page check** (exactly 2 pages) and every existing privacy/metadata audit stay as is.
- The local checkout is never modified: no merge, no fast-forward, no file writes outside
  `.weekly-dok-wt/` and `tools/.weekly-dok-logs/`. The teacher receives the sheet on their next pull.

### 2.4 Failure alert

Silent failure was the real incident. In `tools/weekly_dok.ps1`, when an `-Apply` run exits non-zero:

- Take the last non-empty log line (script errors are boundary-only messages — no student data, no
  secrets; do NOT attach the full log).
- `gh issue create -R robjohncolson/apstats-live-worksheet --title "Weekly DOK sheet failed <yyyy-MM-dd>"
  --body "<last line>\n\nLog: tools/.weekly-dok-logs/<date>.log on Athena. Manual run: tools\weekly_dok.ps1 -Apply -Now"`.
- If an OPEN issue with the same title exists, add a comment instead (the Sat catch-up must not
  create a duplicate).
- Best-effort: a failing `gh` never changes the wrapper's exit code.
- Success path: if an open "Weekly DOK sheet failed" issue for the current Mon–Sun week exists, close
  it with a comment naming the published commit.

## 3. Non-goals

- No change to selection, the brief, the author prompt, the builder, or the triage schema.
- No roster-server code change (the triage JSON data file still ships with the sheet commit).
- No change to the scheduled task registration.

## 4. Tests (`tests/weekly-dok-run.test.js`)

Effects stay injected; no test runs real git, Codex, LaTeX, or `gh`.

1. Apply creates the worktree before any read, and removes it in `finally` on success AND on a thrown
   author/validate/audit error.
2. A stale `.weekly-dok-wt` is removed before `worktree add`; an unremovable one throws.
3. All pipeline git commands run with cwd `work`; the env secret is read from `home`.
4. No branch/index/dirty-tree check remains: apply succeeds with a fake `home` reporting a feature
   branch, staged files, dirty files, and unpushed commits.
5. Push rejected once → fetch, rebase, validate, fresh sentinel, second push. Rejected twice → throws,
   `rebase --abort` on conflict, nothing retained.
6. Push command is exactly `push origin HEAD:master`.
7. Dry-run creates no worktree and writes nothing.
8. Existing tests for selection, triage recurrence, privacy, word bank, already-ran guard still pass;
   tests for `recoverPending` / `--push-only` / dirty-tree preflight are replaced, not left failing.

## 5. Acceptance (orchestrator runs these after the build)

- `npx vitest run tests/weekly-dok tests/dok-` and `pytest tests/test_dok_build.py -q` green.
- `node scripts/weekly-dok.mjs --dry-run` prints a brief, leaves `git status` unchanged.
- Hostile-checkout rehearsal: from a feature branch with a staged file, a dirty tracked file, and an
  unpushed commit, a real `--apply --now` is NOT run (it would publish a second sheet this week);
  instead the orchestrator runs apply with `author`/`push` overridden to prove the worktree flow
  end-to-end without publishing.
