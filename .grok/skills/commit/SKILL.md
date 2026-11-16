---
name: commit
description: "Commit, and push only with the teacher's sign-off, in this shared dirty tree. Use when the teacher says 'commit', 'push', or 'commit and push'."
---

# Commit and push (follow-alongs)

The working tree is shared and usually holds the teacher's unpublished work. Never `git stash`,
`git reset --hard`, `git checkout -- <file>`, `git add -A` or `git add .`.

## Commit
1. `git status -sb`. List only the files YOU changed this session.
2. Untracked assets you reference (*.png, *.mp3, *.woff2 ...) must be committed with the code that uses them.
3. Never commit `.env`, credentials, `roster-local/`, class summaries, or anything naming a student.
4. Changed inline JS in an HTML app? Run `npm run gitnexus:shadow` and include the regenerated `gitnexus-shadow/` files.
5. Desk or worksheet-wide change? `node scripts/bump-build.mjs` first.
6. `npm run test:quick` must pass.
7. `git add <each path>`, then `git diff --cached` and read every line. Anything not yours: unstage it.
8. Message: one or two plain sentences on why, matching `git log --oneline -5`.

## Push (only after the teacher says to push, in this session)
1. Not during a live Period B or E block (`apstat-park/class-session.mjs` BELL_SCHEDULE): every push redeploys roster-server.
2. `git fetch origin` then `git status -sb`: ahead only. If behind, stop and tell the teacher; never force-push, never rebase the shared tree.
3. `touch "$(git rev-parse --git-dir)/PUSH_APPROVED"` then `git push origin master` (the hook deletes the sentinel). Never `--no-verify`.
4. Confirm `git rev-parse origin/master` equals your commit, then `gh run list --workflow=ci.yml -L 1`. Report the hash and the CI result.
