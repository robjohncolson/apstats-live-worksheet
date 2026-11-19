---
name: memory-refresh
description: "Preview (and, only with the teacher's go, apply) the copy of Claude Code's memory notes into Grok's memory topics for follow-alongs and Algebra 2. Use when the teacher says 'refresh memory', 'convert memory', 'sync Claude memory', or before Claude ends on 11/27."
---

# Memory refresh (Claude notes -> Grok topics)

On 11/15 every Claude memory note was copied into Grok's workspace memory by
`$HOME/grok-handover/convert_memory.py`. Notes changed after that. This skill shows what a
re-run would change. The real copy (`--apply`) runs only after the teacher says so.

Rules:
- Read-only by default. Never run `convert_memory.py ... --apply` without the teacher's yes in this session.
- Print file names and counts only. Notes can name students: never paste note text into a repo, a commit, or Ops.
- Never point the output at a git repo. Topics live in `$HOME/.grok/memory-v2/workspaces/`.
- Grok's own topics (no "converted from Claude Code memory" marker) are never overwritten. Do not edit topics by hand.

## The three pairs (memory dir -> Grok workspace)

The `C--Users-rober-...` part of a Claude memory folder name is a fixed name that Claude Code made from the project path; it is not derived from `$HOME` and stays as written.

| Repo | Claude memory dir | Grok workspace |
|------|-------------------|----------------|
| follow-alongs | `$HOME/.claude/projects/C--Users-rober-Downloads-Projects-school-follow-alongs/memory` | `$HOME/.grok/memory-v2/workspaces/apstats-live-worksheet-d09f2e6d` |
| a2 (main) | `$HOME/.claude/projects/C--Users-rober-Downloads-Projects-school-algebra2-live-worksheet/memory` | `$HOME/.grok/memory-v2/workspaces/a2-live-worksheets-77983313` |
| a2 (old path) | `$HOME/.claude/projects/C--Users-rober-Downloads-Projects-algebra2-live-worksheet/memory` | `$HOME/.grok/memory-v2/workspaces/a2-live-worksheets-77983313` |

Both a2 memory dirs feed ONE workspace. They share no note names (checked 11/18). If a preview ever lists
the same file name for both a2 dirs, stop and tell the teacher: the second run would overwrite the first.

## 1. Preview (Grok may do this alone)

Run from the follow-alongs repo root, one command per call. `-X utf8` makes the output UTF-8 (`python -I` ignores `PYTHONIOENCODING`, so do not rely on that variable). `$HOME` is the teacher's home folder.

```
python -I -X utf8 .grok/skills/memory-refresh/preview_changes.py "$HOME/.claude/projects/C--Users-rober-Downloads-Projects-school-follow-alongs/memory" "$HOME/.grok/memory-v2/workspaces/apstats-live-worksheet-d09f2e6d"
python -I -X utf8 .grok/skills/memory-refresh/preview_changes.py "$HOME/.claude/projects/C--Users-rober-Downloads-Projects-school-algebra2-live-worksheet/memory" "$HOME/.grok/memory-v2/workspaces/a2-live-worksheets-77983313"
python -I -X utf8 .grok/skills/memory-refresh/preview_changes.py "$HOME/.claude/projects/C--Users-rober-Downloads-Projects-algebra2-live-worksheet/memory" "$HOME/.grok/memory-v2/workspaces/a2-live-worksheets-77983313"
```

Each prints `NEW <file>` (a note Grok does not have yet), `REFRESH <file>` (Grok's copy is older),
`KEPT <file>` (Grok wrote that topic itself; left alone), `STALE <file>` (the note left Claude's index; the
real run leaves Grok's old copy in place), then a `PREVIEW new=.. refresh=.. same=..` line.
The same counts come from the original script's own preview, for a cross-check:

```
python -X utf8 $HOME/grok-handover/convert_memory.py "<memory dir>" "<workspace>"
```

Report per repo: the NEW and REFRESH file names, any KEPT or STALE ones, and whether the two PREVIEW
lines agree. If they disagree, stop and say so.

Preview on 2026-11-18 (for comparison): follow-alongs NEW project_grok_handover_2026_11.md, REFRESH
project_u2_claim_posters_bpe_walkthrough.md and reference_gitnexus_reindex.md; a2 main NEW
a2-desk-deprecated.md, a2-district-assessments-sy26-27.md, grok-bot-handoff.md, REFRESH
a2-packet-format-rules.md; a2 old path: nothing to do.

## 2. Apply (only after the teacher says "apply" in this session)

Same three pairs, with `--apply` at the end, one per call:

```
python -X utf8 $HOME/grok-handover/convert_memory.py "<memory dir>" "<workspace>" --apply
```

It ends with `APPLIED new=.. refresh=..`; the numbers must equal the preview. Then run the preview again:
every pair must show `new=0 refresh=0`.

## 3. STALE topics

A STALE topic is advice Claude retired. The script never deletes. Tell the teacher the names; delete one only
if the teacher asks, and only that file in the workspace `topics/` folder.

## When

Claude ends after 11/27. Run the preview on 11/26 or 11/27 and ask the teacher for the apply then, so the
last notes Claude writes are included. After 11/27 nothing new arrives from Claude; this skill is then done.
