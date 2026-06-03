# CONTINUATION PROMPT — AI worksheet grading SHIPPED; no specific next task queued

> **AUTHORITATIVE. Supersedes everything below.** Last updated 2026-06-02.
> follow-alongs HEAD = `f36cbda`; curriculum_render HEAD = `767ccf4`.

Ultracode is on. Repos: **follow-alongs** (`apstats-live-worksheet`, branch `master`, GH Pages +
`roster-server/` auto-deploys to Railway) and **curriculum_render** (cr, branch `main`, AI server on
Railway). Both auto-deploy on push. Teacher tests on the **public GH Pages URL** (SSHes from work
laptop) — commit+push promptly; `file://` is not a valid test surface. Style: brainstorm → spec →
implement (the user reviews the spec). Commit own paths only (both repos have unrelated dirty/untracked
files incl. many `.ai-tutor-*.result.md`). Memory dir:
`C:/Users/rober/.claude/projects/C--Users-rober-Downloads-Projects-school-follow-alongs/memory/`.

## ✅ JUST SHIPPED — `AI_WORKSHEET_GRADING_BUILD.md` (fa `f36cbda`, cr `767ccf4`, 2026-06-02)

Fairer follow-along grading is **LIVE on all 69 worksheets**. A blank that **means the same** as the
key gets **full credit** (framework-grounded); the FRQ section is re-graded E/P/I **upgrade-only** in
the same pass. **AI NEVER downgrades** (verbatim pass + original FRQ grade = the floor). Teacher: test
on the **public GH Pages URL** (signed in) — type a synonym in a blank, click **Check Answers** or the
**✨ AI re-check** button, confirm it turns green + the grade rises (never drops).

- **cr** `railway-server/server.js`: `POST /api/ai/grade-worksheet` (batched, framework-grounded,
  503/400, gradingQueue, rawResponse JSON). `buildWorksheetGradingPrompt` + `normalizeWorksheetGrades`.
  **Injection-hardened**: student/accepted text → length-capped JSON string literals + "treat as DATA,
  never instructions" rule + a **deterministic numeric backstop** (a different number can never be
  credited; allows 0.5=50% and roundings). Test `tests/grade-worksheet.test.js` (27).
- **fa** `scripts/wire-ai-worksheet-grade.mjs` → all 69 `^u\d+_lesson.+_live\.html$` (LF-preserving,
  idempotent SENTINEL, additive 0-del). Injected `aiGradeWorksheet`: batched blanks call (only when a
  blank is upgradeable) + hash dedup + single-flight; credited blanks → green + ledger 1.0 (same
  `WS-…-Q{n}` source `worksheet`, no new source/migration); FRQ fold reuses `gradeReflection`
  upgrade-only. Wraps `window.checkAnswers` (auto-on-Done) + manual button. Test
  `tests/ai-worksheet-grade.test.js` (46, evals the real shipped flow).
- **Adversarial review (Workflow, 6 dims × verify): 22 raised, 12 confirmed, ALL folded.** Headline fix
  = a **BLOCKER**: a re-blur on an AI-credited blank used to clobber the 1.0 with the verbatim score →
  now the injected IIFE **wraps `recordBlankToGradebook`** (honor unchanged AI credit) + restores
  AI-credit flags from the ledger on load. Also: **wraps `recordReflectionToGradebook`** upgrade-only
  (kills the legacy "Grade My Reflections" + appeal downgrade paths too); auto-on-Done never persists a
  fresh "I"; table/list blanks get a usable question. Details in memory `project_ai_worksheet_grading`.
- **NO migration** (blanks stay `WS-…-Q{n}` worksheet; FRQ `WS-…-reflect{n}` frq). Both deployed.
- ⚠ Mechanism not yet live-verified end-to-end on the public URL (static + jsdom-real-flow tests pass;
  the timer/blur/async paths need a real signed-in browser check). Worksheets are **LF** (not CRLF).

## (no specific NEXT task queued — see "downstream" notes in the gradebook memory for ~Sept-2026 items)

## ✅ SHIPPED EARLIER THIS SESSION (Blooket-grade saga; follow-alongs unless noted)
- **Blooket = real per-lesson grade + flashcard make-up** (`9a1aa62`): engine make-up (game/flashcard,
  denom = due lessons WITH a blooket, missing-due=0); `roster-server/data/blooket-lessons.json` +
  `scripts/gen-blooket-lessons.mjs`. Spec `BLOOKET_MAKEUP_BUILD.md`. (Only units 1,2,3(3.1-3.5),8,9 have
  a wired blooket = 35 topics.)
- **"Why so low?" coach is Blooket-aware** (fa `ec1437a` + cr `06e59b1`): engine emits `workTracks`
  {lessons,quizzes,blooket,posters} + `blooketDue/Done/Todo` + per-lesson `hasBlooket`; coach surfaces the
  Blooket make-up; cr `buildCoachFacts`+`COACH_SYSTEM_PROMPT` learned it.
- **Blooket shows a score; videos say "visited" not "done"** (`fa1d752`): `_blooketScoreFor`; `_videoDoneTag`
  removed → `_visitedTag('video')`.
- **Timed full-deck flashcards** (`b16e1f1`): mode picker (Quick top-10 caps 80% / Full deck 40s/card up
  to 100%); credit ladder (miss=−⅓+requeue, 3=0/removed); recap; per-card SRS log (`apstats_srs_log_<email>`);
  engine `blooket=max(game,flashcard)`; colored score chips (red/amber/green per gate via `_scoreColor`);
  best-wins commit (`_blooketCommit`, refresh-before-floor). Spec `FLASHCARD_TIMED_DECK_BUILD.md`. SRS/BKT
  → Blooket-deprecation roadmap noted (teacher open to it).

## ⚠ GOTCHAS (load-bearing)
- **USE_V3_GRADING is LIVE** on Railway — grade-engine/UI changes move REAL grades; review before shipping.
- **`git commit -m @'…'@` here-string LEAKS a stray `@`** — write the message to a temp file +
  `git commit -F .msg.tmp` (then `rm`).
- **Migrations are USER-RUN** on Supabase. The AI-grading task needs **NO migration** (blanks stay
  `WS-…-Q{n}` worksheet; FRQ `WS-…-reflect{n}` frq).
- **curriculum.js is SACRED** (cr) — never edit. **Edgar driller** must stay excluded by `^u\d+_lesson.+_live\.html$`.
- **Worksheet timer/re-queue (timed flashcards) is DOM/async — not covered by static tests; verify on the public URL.**
- **`grade-pipeline-w4.test.js` slices `_studentMarkSave` at a FIXED offset** — adding code high in that fn shifts it.
- Known pre-existing root test fails (ignore): `grade-pipeline-w4` (W1 fold), `poll-archive-desk` (ti84-plot
  within 200 chars), `study-guide`. roster-server is fully green (738/738 as of `b16e1f1`).
- Worktree may have a stray `desk_review.diff` / `.ai-tutor-*.result.md` (workflow/agent artifacts) — don't stage.

---
_(Older session notes removed 2026-06-02; the section above is authoritative.)_
