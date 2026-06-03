# CONTINUATION PROMPT — build AI worksheet grading (semantic blanks + folded FRQ pass)

> **AUTHORITATIVE. Supersedes everything below.** Last updated 2026-06-02.
> follow-alongs HEAD = `b16e1f1`; curriculum_render HEAD = `06e59b1`.

Ultracode is on. Repos: **follow-alongs** (`apstats-live-worksheet`, branch `master`, GH Pages +
`roster-server/` auto-deploys to Railway) and **curriculum_render** (cr, branch `main`, AI server on
Railway). Both auto-deploy on push. Teacher tests on the **public GH Pages URL** (SSHes from work
laptop) — commit+push promptly; `file://` is not a valid test surface. Style: brainstorm → spec →
implement (the user reviews the spec). Commit own paths only (both repos have unrelated dirty/untracked
files incl. many `.ai-tutor-*.result.md`). Memory dir:
`C:/Users/rober/.claude/projects/C--Users-rober-Downloads-Projects-school-follow-alongs/memory/`.

## ⏳ IMMEDIATE NEXT TASK — implement `AI_WORKSHEET_GRADING_BUILD.md` (spec written + GREEN-LIT)

Spec: **`AI_WORKSHEET_GRADING_BUILD.md`** (follow-alongs root) — READ IT FIRST; it is the contract.
Goal: fairer follow-along grading — a student whose answer **means the same** as the key gets **full
credit**, judged **coherently** vs. the unit/lesson **framework** + answer key; plus the FRQ section
re-graded E/P/I **upgrade-only**, folded into the same pass. **All 4 teacher decisions are LOCKED**
(in the spec): (1) auto-on-Done **+** a manual "✨ AI re-check" button, with **dedup+queue** (load-
bearing — don't spam the API); (2) **AI on everything**, evaluated as **one coherent whole** vs. the
framework (numeric: value must match, formatting/rounding OK — never a different number); (3) **full
credit (1.0)** for synonymous/conceptually-correct; (4) fold FRQ E/P/I grading into the pass **+**
auto upgrade-only re-check. **AI NEVER downgrades** (verbatim pass + original FRQ grade = the floor).
v3 grades are LIVE → this moves grades UPWARD only; adversarial-review before shipping.

### Build plan (in order)
1. **cr server** `curriculum_render/railway-server/server.js`: new `POST /api/ai/grade-worksheet`
   — ONE batched call grading ALL blanks coherently. Req `{ scenario:{topic,unitLesson,lessonContext},
   blanks:[{id,question,acceptedAnswers,studentAnswer}] }` → `{ blanks:[{id,credit:bool,reason}] }`.
   Reuse `buildFrameworkContext()`/`getFrameworkForQuestion()` (already in server.js) for framework
   grounding; reuse `gradingQueue` (rate-limited); 503 if AI off, 400 if no blanks. Prompt rule:
   "same concept as an accepted answer = credit; numeric answers require value-match; be strict, the
   bar is 'a teacher would mark this right'." Test `tests/grade-worksheet.test.js` (static parse).
2. **Client** (one shared flow, then `scripts/wire-ai-worksheet-grade.mjs` to all 69 worksheets,
   glob `^u\d+_lesson.+_live\.html$`, EOL-preserving, idempotent sentinel): `aiGradeWorksheet({manual})`
   — collect all blanks `{id (questionId), question (DOM-extracted prose), acceptedAnswers (split
   data-answer), studentAnswer, currentScore}`; **hash-dedup** (skip if answers unchanged since
   `_aiLastGradedHash`); **single-flight** (`_aiGradeBusy` + disabled button); POST the blanks; for
   each `credit:true` blank below 1.0 → mark green + "✨ AI-accepted: <reason>" + `recordBlankToGradebook`
   at 1.0 (upgrade-only); then run the EXISTING per-FRQ `gradeReflection()` for changed/ungraded FRQs
   (already upgrade-only via the appeal path). Trigger: Done flow calls `aiGradeWorksheet({manual:false})`
   (guarded by hash+busy) + a "✨ AI re-check" button → `{manual:true}`. Soft-fail: AI down → the
   verbatim grade stands. Test `tests/ai-worksheet-grade.test.js`.
3. **Anti-spam (decision #1)**: one call for ALL blanks (not per-blank) + hash dedup + single-flight +
   server gradingQueue. FRQ calls reuse existing per-item dedup.
4. **Adversarial review** (Workflow, ~4 dims × verify): numeric-value strictness (no wrong number gets
   credit), never-downgrades, dedup/single-flight actually prevents spam, DOM question-extraction
   robustness (blanks in tables / no prose), soft-fail, upgrade-only ledger writes. Fold real finds.
5. **Commit+push** follow-alongs (Desk + wire + tests + spec) and curriculum_render (server + test)
   SEPARATELY, own paths only. Tell the teacher to test on the public URL. Update memory.

### Reference (from a thorough Explore map this session — integration points)
- Blank grade: `checkAnswer()` (normalize+pipe-split+exact/substring → 1/0.5/0) → `recordBlankToGradebook()`
  → ledger `WS-U{u}L{key}-Q{n}` source `worksheet` attempt 1 (latest-wins). Blank has NO question text
  on the element → extract from surrounding `.question` prose. `data-answer` = pipe-separated accepted.
- FRQ/reflection: ALREADY AI E/P/I via cr `/api/ai/grade` → `recordReflectionToGradebook()` source `frq`
  `WS-U{u}L{key}-reflect{n}`; appeal flow (`/api/ai/appeal`) is already upgrade-only (≤3 appeals);
  `gradingState` Map; first AI grade is the only baseline (no pre-AI grade). `gradeReflection(id,answer)`
  uses `window.buildReflectionPrompt*` + `RUBRICS_*` from `ai-grading-prompts-*.js` (keyed by textarea id).
- cr `/api/ai/grade`: `{scenario,answers,prompt}` → `{score:E/P/I,feedback,matched,missing,suggestion}`;
  DeepSeek via `gradingQueue`, temp 0.1, JSON output; siblings `/api/ai/appeal|chat|coach`.
- gradebook-client.js `record({token,source,itemId,unit,response,score,attempt:1})`; `fetchPrior(prefix)`.
  Signed-in via `window.rosterClient.token()`; `window.ROSTER_SERVICE_URL`.

## ✅ SHIPPED THIS SESSION (Blooket-grade saga; follow-alongs unless noted)
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
