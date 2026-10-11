# MISCONCEPTIONS_SPEC.md — persistent misconceptions across quiz MCQs, quiz FRQs, and follow-along written responses

**Teacher ask (2026-09-11):** "as a teacher I want to know about persistent misconceptions, across the multiple choice
answers in their quizzes, the written responses in their quizzes, and the written responses in the follow-alongs."
Principle carried over from the same day: **no leniency, no surprises** — this surface never changes a grade; it reads
what the graders already recorded and aggregates it for the teacher.

## 0. What already exists (verified 2026-09-11)

| Source | Ledger row (Supabase `item_ledger` via roster-server) | Signal |
|---|---|---|
| Quiz MCQ | `source:'quiz'`, `item_id` like `U1-L2-Q01`, **`response` = chosen letter**, `score`/credit | wrong letter = a specific distractor |
| Follow-along FRQ | `source:'frq'`, `item_id` like `WS-U1L4-reflect1` / `-exitTicket`, `frq_result {score, feedback, matched[], missing[], provider}` | `missing[]` = rubric elements the grader found absent (free-text descriptions, model-phrased) |
| Quiz FRQ | `source:'frq'`, `item_id` like `U1-PC-FRQ-Q02` or quiz FRQ ids | same `frq_result` shape |

Rubrics with **stable element ids** live in the 69 `ai-grading-prompts-u{U}-l{L}.js` files
(`expectedElements: [{ id, description, required }]`, plus `commonMistakes[]`); `data/frq-decompositions.json` has the
PC-FRQ skill decompositions. Quiz questions (prompt, choices, `answerKey`) live in the **sacred, read-only**
`curriculum_render/data/curriculum.js` (local clone: `C:/Users/rober/Downloads/Projects/school/curriculum_render`);
`data/answer-key.json` is the generated read-only key; `data/skill-map.json` maps question id → CED skill;
`data/skill-taxonomy-ced2026.json` is the skill list. Teacher data endpoints follow `roster-server/class.js`
(`/class/mastery` is the "Class skill overview" pattern; teacher auth = `requireTeacher` / `x-teacher-secret` or
teacher bearer). The dashboard is `teacher-dashboard.html` (sections with `h2.section-title`). Nightly Review =
`roster-server/review.js` (`/class/review-by-item`). Blooket has no per-card data and DOK sheets are parked — neither
is a source.

## 1. Vocabulary

`data/misconceptions.json` — the controlled vocabulary, **drafted by Codex, flagged for teacher review**:

```json
{ "schema": "apstats-misconceptions/v1", "reviewed": false,
  "tags": { "mean-resistant": { "label": "Treats the mean as resistant to outliers", "skills": ["2.C","4.B"], "units": [1] }, … } }
```

40–60 tags spanning Units 1–5 (NEW CED), each with a one-line label a teacher would say aloud, the CED skill ids it
maps to (from `data/skill-taxonomy-ced2026.json`), and the units where it typically appears. Sources for drafting:
the `commonMistakes[]` lists across all 69 rubric files (these are the teacher's own words already), the College Board
CED misconception notes where present in `2026-crosswalk.json` / study-guide bank, and the distractor rationales.

## 2. Tag maps (both drafted by Codex, both `reviewed:false` until the teacher flips them)

- `data/misconception-rubric-map.json`: `{ "WS-U1L4-reflect1": { "el-1": ["counts-vs-percents"], … } }` keyed by
  worksheet prefix + textarea id + `expectedElements[].id`. Built by `scripts/build-misconception-rubric-map.mjs`
  which loads each prompt file in `node:vm` (same trick as the FRQ manifest builder), enumerates elements, and
  writes the skeleton; Codex fills the tag arrays. Elements with no sensible tag get `[]` (they still count under their
  own description — see §3).
- `data/misconception-distractor-map.json`: `{ "U1-L2-Q01": { "A": ["variable-vs-individual"], "C": [], "D": [...] } }`
  for every MCQ in `data/answer-key.json` (354), wrong letters only. Built by `scripts/build-misconception-distractor-map.mjs`
  reading `curriculum.js` READ-ONLY from the local cr clone (path via env `CURRICULUM_JS`, default the clone above;
  the script must fail loudly if absent, never write into cr). Codex drafts tags per distractor from the choice text
  and the question's skill; unknown → `[]`.

Both files carry `provenance: "codex-draft-2026-09-11"` and `reviewed: false`. **Nothing in the UI hides draft
tags, but everything labels them "draft — not yet reviewed" until the flag is true** (teacher's precision check:
rate 20 flagged items; ship the reviewed flag only at ≥ 16/20 — that step is the teacher's, not this build's).

## 3. Signal extraction (deterministic, no AI at runtime)

New module `roster-server/misconceptions.js` (pure functions, unit-tested) + `scripts/`-side builders above.

- **MCQ:** for each quiz row where `response` ≠ answer key letter: event `{ studentId, ts, source:'mcq', itemId,
  evidence: { chosen, correct }, tags: distractorMap[itemId][chosen] || [], label: 'chose ' + chosen + ' on ' + itemId }`.
- **FRQ (both kinds):** for each frq row with `frq_result.missing?.length`: for each missing string, resolve to an
  `expectedElements` id by normalized token overlap (lowercase, strip punctuation/stopwords; best Jaccard ≥ 0.5 wins;
  ties → first; below 0.5 → `elementId:null`). Event `{ source:'frq', itemId, evidence: { missing: <string>,
  elementId, feedback }, tags: rubricMap[itemId][elementId] || [], label: <the rubric element description, or the raw
  missing string when unmatched> }`. Also emit an event per `commonMistakes` hit ONLY if the grader's feedback contains
  that mistake text verbatim (cheap, precise).
- Every event has at least one **label** (human-readable) even when it has zero tags — that is what makes Phase 0
  useful before the vocabulary is reviewed.

## 4. Persistence rules (config in `roster-server/grade-config.js` → `misconceptions` block)

```
minAssessmentsPerStudent: 2      // same tag/label on ≥2 distinct itemIds
minDaysApart: 3                  // …recorded ≥3 days apart
classShare: 0.33                 // ≥33% of active students in the section show it…
classMinLessons: 2               // …across ≥2 distinct lessons (topicKey)
windowDays: 42                   // rolling window (6 weeks); 0 = whole year
```

A **student-persistent** entry = (studentId, key) meeting the first two; **class-persistent** = (section, key) meeting
the last two. `key` = tag id when tagged, else `label:<normalized label>`.

## 5. Endpoint

`GET /class/misconceptions?section=PeriodB&days=42` (teacher auth, same guard as `/class/mastery`):

```json
{ "ok": true, "section": "PeriodB", "window": {"days": 42, "from": "…"}, "vocabReviewed": false,
  "class": [ { "key": "counts-vs-percents", "label": "…", "draft": true, "students": 6, "activeStudents": 14,
               "lessons": ["1.4","2.1"], "sources": {"mcq": 4, "frq": 7}, "firstSeen": "…", "lastSeen": "…",
               "skills": ["2.D"] }, … ],                       // sorted by students desc, then lastSeen
  "students": { "<studentId>": { "username": "…", "realName": "…", "persistent": [ { "key", "label", "draft",
               "count", "itemIds": [...], "firstSeen", "lastSeen" } ] } },
  "evidence": { "<key>": [ { "studentId", "ts", "source", "itemId", "evidence": {...} } ] }   // capped 50 per key
}
```

Computed from the same rows `/class/grades` reads (reuse its loader; add `response` and `frq_result` to the projection
if they are not already fetched). Cache per (section, days) for 60 s. Never mutates anything.

## 6. Teacher dashboard panel

New section in `teacher-dashboard.html` after "Skills to review": **"Persistent misconceptions"**.
- Header controls: window (14 / 42 / year), section (follows the page's section picker), a "draft vocabulary — not
  yet reviewed" pill when `vocabReviewed:false` linking to the two map files' names.
- **Class table**: label · students (n / active) · lessons · sources (MCQ / written) · last seen · skill. Row click
  expands the evidence list (student name, date, "chose C on U1-L4-Q03" or the missing rubric element + the grader's
  feedback sentence). XSS-safe rendering (textContent only — same rule as every other panel).
- **Per-student list**: student → their persistent keys with counts; click → same evidence.
- **Actions per row (existing tools only):** "Nudge" opens the existing teacher chat composer prefilled with the label
  and the lesson(s) (`/teacher/nudge` path already used by the dashboard); "Open follow-along" links the lesson's
  worksheet. No new grading action anywhere.
- Empty state: "No persistent misconceptions in this window yet." System-7 styling like the neighbours.

## 7. Nightly Review line

`review.js`: when building the by-item review payload, add `topMisconceptions: [ {key,label,students} × 3 ]` for the
window (reusing §5's computation) and render "Top recurring misconceptions this week: …" at the top of the review
panel that consumes it (find the consumer; keep it one line).

## 8. Tests

- `roster-server/tests/misconceptions.test.js`: MCQ event extraction (wrong vs right letter; missing map → no tags but
  label present); FRQ missing-string → element id resolution (exact, fuzzy ≥0.5, below threshold → null + raw label);
  persistence rules (2 items ≥3 days apart → persistent; same day → not; class share threshold; lessons ≥2);
  window filter; sorting; evidence cap; draft flag propagation. Endpoint test via the existing class route harness
  (auth required; empty section → ok with empty arrays).
- `tests/misconception-maps.test.js` (root): both map files parse, every key exists in answer-key / rubric files,
  every tag exists in the vocabulary, `reviewed:false` + provenance present; builders are idempotent (`--check`).
- `tests/teacher-dashboard-misconceptions.test.js`: panel present, renders a fixture payload with textContent only,
  draft pill shown when `vocabReviewed:false`, evidence expands.
- Suites: root `npm test`, `cd roster-server && npm test`; known pre-existing failures listed by name, not fixed.

## 9. Out of scope

No AI labeling pass (Phase 3, later, teacher-confirmed). No changes to `curriculum.js`, grades, ledger writes,
Schoology, or Blooket. No DOK.
