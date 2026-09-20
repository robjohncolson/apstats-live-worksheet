Implement WEEKLY_DOK_ISOLATION_SPEC.md (repo root) exactly. Read it first, in full; it is the contract.

HOST: you are running on Athena (Windows 11, Git Bash + PowerShell 5.1), in the teacher's live checkout
C:\Users\rober\Downloads\Projects\school\follow-alongs on branch master.

Edit IN PLACE, only these files:
- scripts/weekly-dok.mjs
- tools/weekly_dok.ps1
- tests/weekly-dok-run.test.js
- .gitignore
- vitest.config.js

Rules:
- Keep the file's existing style: injected `io` effects, short functions, early returns, comments only
  where a constraint is non-obvious. Do not add a framework, config system, or retry library.
- `createRuntime({ home, work }, overrides)` per spec section 2.1. The CLI entry computes `home` from the
  script path; in dry-run `work = home`; in apply the worktree lifecycle of section 2.2 wraps the run.
- NEVER create a junction/symlink to node_modules. NEVER modify the home checkout (no merge, checkout,
  reset, stash, or fast-forward there). The only git commands allowed against `home` are `fetch`,
  `worktree add/remove/prune`.
- Remove `recoverPending`, `--push-only`, the branch/index/dirty preflight checks and the
  `dirtyBefore`/`fingerprint`/`untouchedSincePreflight` code (section 2.3). Keep the time-window check,
  the already-ran guard, the 2-page student PDF check, and every privacy/metadata audit.
- PowerShell 5.1 only in the ps1: no `&&`, no ternary, no `?.`. Keep the existing stderr-as-text logging.
  The `gh` alert (section 2.4) is best-effort and must never change the exit code.
- Do NOT run `node scripts/weekly-dok.mjs --apply` (with or without --now): it would publish a second
  sheet this week. Do NOT run Codex/LaTeX from your tests. `--dry-run` is safe.
- Do NOT commit, stage, push, or create PUSH_APPROVED. Do NOT touch roster-server/, dok/, the Desk, or
  any file not listed above. Other files in this tree are dirty on purpose; leave them alone.

Verify before returning (all must pass):
    npx vitest run tests/weekly-dok tests/dok-
    pytest tests/test_dok_build.py -q
    node scripts/weekly-dok.mjs --dry-run      (then confirm `git status --porcelain` is unchanged by it)

Report: files changed, the test counts, anything in the spec you could not satisfy and why, and the
exact resolved path of PUSH_APPROVED inside a worktree versus the pre-push hook's
`$(git rev-parse --git-dir)/PUSH_APPROVED` (section 2.3) — state whether they are the same file.
