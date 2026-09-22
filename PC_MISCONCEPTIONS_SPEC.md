# PC_MISCONCEPTIONS_SPEC — Progress Check answers as misconception evidence

Status: DRAFT for teacher review (2026-09-21). Nothing built. Depends on MISCONCEPTIONS_SPEC (live) and
WEEKLY_DOK_SPEC (live).

## Why

The teacher's ask on the first PC day: "wire the progress check misconceptions into the misconception DOK ladder
generator engine." A Progress Check is the best diagnostic we have — College Board items, one skill each, taken by
the whole class on one day — and today it produces only a score. Meanwhile AP Classroom's "Results by Student" tab
exposes every student's chosen letter for every item (captured 2026-09-21 for Unit 1 MCQ Part A, both sections),
and the misconception engine already turns *quiz* wrong letters into events. The gap is three small pieces.

## What exists

- `roster-server/misconceptions.js extractEvents` — quiz rows (`source: 'quiz' | 'curriculum_quiz'`, `response:
  'B'`) become `mcq` events tagged via `misconception-distractor-map.json items[itemId][letter]`; untagged events get
  the label `chose B on <itemId>` (a per-question label that can be "frequent" but never "persistent").
- `pc_bank` (private Supabase table, roster project) holds the CB-secure items **with answers** — U1 A/REST, U2
  A/REST, U5 REST; ids `U{u}-PC26-MCQ-{A|B|C}-Q{nn}`. The public repo never sees them.
- `POST /pc/grade` (teacher) stores one summary row per (student, unit, part): `U1-PC-A-PAPER`, `response:
  '(paper)'` — no letters.
- `POST /pc/:unit/:part/submit` (student, unlock-gated) stores per-item `pc` rows with the letter — but only for
  online makeups, and `extractEvents` ignores `source: 'pc'` today.
- `scripts/import-pc-scores.mjs` reads a local `name|points|letters` file and posts the score. The letters stay in
  the file (session scratchpad, never the repo).
- Weekly DOK (`scripts/weekly-dok.mjs`) selects from `/class/misconceptions` `frequent[]` and writes a brief that
  goes to Codex and then onto a **public** sheet.

## Design

### 1. Letters into the ledger — `source: 'pc'`, one row per item, teacher-written

Extend `POST /pc/grade` with an optional `responses: [{ itemId, response }]` (letters keyed by the bank's item ids;
`-` = blank). When present the endpoint ALSO writes one `pc` row per item, `evidenceTier: 'proctored'`, `attempt: 0`,
score = correct/incorrect against `pc_bank` **server-side** (the client never sends or sees the key). The summary
`…-PAPER` row is unchanged, so the grade path (`scorePcRows` best-wins) is untouched; the per-item rows are
grade-inert because `scorePcRows` already honors the finite `row.score` on the summary row and… **[decision A]**
— see Open questions: per-item rows must NOT double-count. Simplest: per-item rows carry `score: null` and are
excluded by `scorePcRows` (it only reads finite scores); they exist for misconception evidence only.

`import-pc-scores.mjs` gains `--letters`: maps column position → `U{u}-PC26-MCQ-{part}-Q{nn}` (AP Classroom's
column order is the booklet order; the bank's `n` field is the same order — verified against the 18 Part A stems)
and sends `responses` with the score. Paper copies: the teacher types the 18 letters into the file the same way.

### 2. Misconception engine accepts `pc`

`extractEvents`: `row.source === 'pc'` with a single-letter `response` and an `item_id` matching
`/^U\d+-PC26-MCQ-/` → an `mcq` event exactly like a quiz row, with `correct` taken from a **server-only** answer
map (`pc_bank` letters loaded at boot into `pcAnswerKey`; never bundled to the client — `/class/misconceptions`
returns tags and labels, not keys). Tags from a new `misconception-pc-map.json`.

### 3. `misconception-pc-map.json` — safe to keep in git

Shape identical to the distractor map: `items[itemId][letter] → [tag ids]`, plus `reviewed: false`. It holds **only
item ids, letters, and vocabulary tags** — no stems, no choices, no answers — so it is public-safe. Drafted the
same way as the quiz map (Codex reads the private bank locally via `roster-server/scripts/load-pc-bank.mjs`'s
source files, writes tags only), reviewed by the teacher (20-item precision check, same bar as the quiz map).

### 4. The leak guard — PC events surface ONLY as tags

Today an untagged MCQ event's label is `chose B on <itemId>`; the DOK brief then quotes the *question* via the
catalog for context. For PC items that would put College Board text into a public sheet. Rules:

- A `pc` event with **no tag is dropped** (not labeled) — never "chose B on U1-PC26-MCQ-A-Q07".
- `/class/misconceptions` evidence drill-down for a `pc` event shows `AP Classroom item A-07` and the tag label,
  never the stem or choices.
- The weekly-DOK brief includes PC-sourced misconceptions **by tag only** ("confuses a parameter with a
  statistic"), with the note `source: Progress Check` so the author prompt's fresh-context rule applies. The
  author prompt already forbids reusing contexts; add: "never reproduce or paraphrase a Progress Check item."
- Test: `tests/pc-misconceptions-leak.test.js` — feed a fixture `pc` row with a fake stem in the bank and assert
  no character of the stem reaches `/class/misconceptions`, the brief, or the sheet YAML.

### 5. Persistence rules

Unchanged. A PC event counts like a quiz event: same tag on ≥2 items ≥3 days apart (student) / ≥33% of active
students across ≥2 lessons (class). Because a PC lands 18–50 items on one day, a student who misses three
items sharing a tag on PC day meets the "≥2 items" half immediately and the "≥3 days" half as soon as a quiz or
worksheet repeats the tag — which is the intended behavior: the PC seeds, the follow-along confirms.

## What the teacher sees

- Dashboard "Persistent misconceptions" gains a `PC` source chip next to `MCQ`/`FRQ` counts.
- The Friday DOK sheet targets PC-revealed misconceptions the week after each PC — the first candidate is Unit 1
  Part A's most-missed items (B: Q1 scotch pines 6 wrong; Q12 favorite-subject bar chart; Q14 stem-and-leaf) once
  they are tagged.

## Steps

1. Tag draft: Codex writes `misconception-pc-map.json` for U1 A (18 items) from the private bank; teacher rates 20.
2. `POST /pc/grade` `responses` + `import-pc-scores.mjs --letters` (Codex; server + tests; grade-inert proof =
   `pc-grade-wiring.test.js` unchanged + M2B golden unchanged).
3. `extractEvents` `pc` branch + leak guard + tests (Codex).
4. Backfill: re-run the importer with `--letters` on the two saved 2026-09-21 files (28 students).
5. Verify live: `/class/misconceptions?section=PeriodB` shows PC events; DOK dry-run brief names tags only.

## Open questions (teacher)

- **A.** Per-item PC rows: `score: null` (evidence only, grade untouched) — recommended — or scored, replacing the
  summary row as the grade source? Recommended null: the summary row is already best-wins with online retakes.
- **B.** Should a PC-only persistent misconception (no worksheet confirmation) be allowed to drive a DOK sheet?
  Recommended no until the PC map is reviewed (`reviewed:false` events are excluded from persistence anyway).

## Out of scope

- FRQ parts of the PC (REST part, October): hand-scored on paper; no per-element data. Could later use the same
  `frq_result` path if the teacher enters E/P/I per part — separate decision.
- Scraping AP Classroom automatically. The Results-by-Student tab is read by the teacher (or by Claude-in-Chrome in
  the teacher's session) and pasted into the local file; no credentials, no bot.
