# APS_DOK_LADDER_SPEC.md — One DOK 1→2→3 ladder per AP Stats lesson day

**Purpose:** give every dated lesson day of SY26-27 a one-sheet paper task ladder: two
DOK-1 warm-ups, two DOK-2 builds, and ONE starred DOK-3 focus task that the class works
in Explore. Student edition + teacher edition (answers, questions to ask, scoring guide),
generated from a YAML per lesson and an item registry, typeset in LaTeX, published as PDFs
the Desk can link.

> **Status:** proposed (2026-09-03). **Owner:** teacher. **Workflow:** brainstorm (2026-09-03)
> → this spec → stress-test 3 ladders → fan-out. Grade-INERT in v1. Nothing in the app
> changes until Phase 5, which is optional.

---

## 0. What already exists (reused, not rebuilt)

| Piece | Where | Reuse for |
|---|---|---|
| Single-DOK3 lesson spine + Do Now A-B-C doctrine (one DOK-3 per day, rules printed on the page, summary exit not CER, don't crowd the page) | wiki `concepts/Single-DOK3 Lesson Spine.md`, `concepts/Do Now A-B-C Framework.md` | the ladder's shape and the page budget |
| LaTeX packet pipeline: `tex/preamble.sty` (tcolorbox callouts, `\bankitem`, `\sectionbanner`, `\packetheading`, sentence-frame + summary-exit boxes, ASCII icon macros, named colors) | `Lesson_planning/tex/preamble.sty` | COPIED into this repo (§3) — proven on 36 A2 PDFs + the AP Stats 6.4 vitality check (`31dd97f`) |
| YAML → student/teacher `.tex` generator (`emit_student`, `emit_teacher`, `bank_item_block`, registry loader) | `Lesson_planning/build_lesson_from_yaml.py` (469 lines) | PORTED and trimmed (§4) — the ladder has 5 items and 4 sections, not a 6-page packet |
| Item registry discipline: `id`, `dok` enum, mandatory one-sentence `dok_rationale`, `role`, `tags`; the five-rule DOK authority hierarchy (esp. rule 3 "adapted items are re-rated by actual demand" and rule 4 "DOK ≠ difficulty") | `Lesson_planning/questionbank/schemas/question.json`, `inventory/decision-console/DOK_RUBRIC_v0.2.md` | the registry schema (§2) and the AP Stats rubric (§1.2) |
| Per-topic CED learning objectives, essential knowledge, skill codes, already parsed | `apstat_{1..9}_framework.md` via `scripts/lib/framework-parse.mjs` (`parseFrameworks`) | the generator prints the LO/EK block on the teacher edition and validates skill codes |
| Per-topic lesson content already written (Socratic tutor prompts with answer keys + scoring notes) | `ai-tutor/u{u}_l{n}.md` (75 files) | authoring anchor: the ladder's DOK-2 items rehearse the same EKs; never copy the tutor's answer key onto the student sheet |
| The real calendar: 66 dated lesson days per period (B: 10/8/6/10/8/11/9/4 by OLD unit 1–8), `topicKey` + `periods.B/E` dates | `data/lesson-schedule.json` | coverage test (§7) + fan-out order (§8) |
| OLD-topic → NEW-CED-unit mapping (`ced2026.newUnit`, `newTopic`, `newLabel`, `status: core|bonus`) | `roadmap-data.json` | the sheet header prints the NEW label; files stay keyed by the OLD `topicKey` like everything else in this repo |
| E/P/I scoring-guide shape (`expectedElements`, `scoringGuide.{E,P,I}`, `commonMistakes`) | `ai-grading-prompts*.js` (see CLAUDE.md "AI Grading Rubric Structure") | the DOK-3 scoring guide on the teacher edition uses the SAME shape, so Phase 5 can feed it to the grader unchanged |
| Runtime resource overlay: Supabase `lesson_urls` (`topic, worksheet_url, drills_url, quiz_url, blooket_url`) read by the Desk at `ap_stats_roadmap_square_mode.html:4987` | Desk + Supabase `hgvnytaqmuybzbotosyj` | Phase 5 adds `dok_url` (optional) |
| MiKTeX on the teacher laptop (`pdflatex`, `latexmk`) | Athena, via scoop | local compile; CI does NOT compile (§7) |

**Why this lives in `follow-alongs`, not `Lesson_planning`.** Lesson_planning's hard rules are
Algebra-2-specific and would be violated on every AP Stats sheet: *Savvas-only provenance*
(AP Stats has no publisher DOK table), the *Klimsara 3-period cadence* (AP Stats runs one
topic per day), and the *OWNED_PATHS* policy (a second subject there needs its own namespace
and manager anyway). Everything the ladder consumes — schedule, frameworks, tutor artifacts,
rubric shape, GH Pages publishing, the Desk — is here. We copy the two proven files
(`preamble.sty`, the generator) rather than share them across repos. The A2 repo stays
untouched.

## 1. Goals / Non-goals

Goals:
1. **One sheet per dated lesson day**, 66 per period-year, student + teacher editions, PDF.
2. **Exactly one DOK-3 per day** (or an honest, declared "no DOK-3 today" — §1.3). The DOK-3 is
   the thing the class focuses on; everything above it primes it.
3. **AP-authentic DOK-3.** Every DOK-3 names the CED skill code it exercises and the released-FRQ
   pattern it rehearses (pattern DESCRIBED in the registry, never the copyrighted item).
4. **Evaluator-legible teacher edition**: phase tag, DOK, minutes, `Questions to ask`, `Adult
   role` — the columns of the Lynn framework (`Lesson_planning/DOKframework.txt`).
5. **Printable, breathable**: student edition fits ONE sheet (two sides max), no ruled lines,
   whitespace for work.

Non-goals (v1):
- No grade wiring. The ladder is paper; nothing lands in the ledger. (Phase 5 is optional.)
- No slides, no pacer, no six-page packet. The follow-along worksheet already owns Launch.
- No MCQs. (`curriculum.js` is sacred; this is a separate, paper artifact — no quiz-bank edits.)
- No copying of AP Classroom / released-exam item text. Contexts and numbers are original.
- No retroactive conversion of anything in Lesson_planning.

### 1.1 DOK for AP Statistics — the substitute authority

There is no textbook DOK table. Level is assigned by **cognitive demand relative to the CED
skill categories**, with released-FRQ scoring patterns as the tie-breaker:

| DOK | What the student does | CED skill anchors | Typical verbs |
|---|---|---|---|
| **1** | Recall or recognize one EK; one-step read of a display or formula | 1.A identify/select (when the answer is a lookup), 2.A/2.B when it is a single feature | name, identify, state, which, read off |
| **2** | Apply a known procedure or describe using multiple features; one decision path, context required | 2.B/2.C/2.D describe & compare, 3.A–3.E compute/construct, 1.B–1.E select a method for a stated goal | describe in context (SOCS), compute and show, construct, select and state |
| **3** | Coordinate several ideas to **justify, critique, compare methods, or bound a conclusion**; more than one defensible path; reasoning must be explained | **4.A–4.E Statistical Argumentation**, 1.A/1.B when the selection must be *defended*, scope-of-inference, "which of two analyses is right and why" | justify, critique, decide and defend, explain why NOT, what could go wrong, design and defend |
| 4 | Multi-day investigation | — | not used in the ladder (posters / projects live elsewhere) |

The AP Stats DOK-3 has a stable shape: **identify → describe → adjudicate.** "Here are two
answers / two methods / a claim and its data — decide which is warranted, cite the specific
features that settle it, and say what you would report." That shape recurs in every unit
(which display, which summary, which test, which conclusion, which scope), which is what makes
a 66-day fan-out tractable.

### 1.2 Rules (ported from `DOK_RUBRIC_v0.2.md`, adapted)

- R1 **Authority = CED skill + FRQ pattern.** Each item cites one primary skill code; each
  DOK-3 also cites an `frq_pattern` string (e.g. `compare-two-distributions-justify-center`).
- R2 **DOK ≠ difficulty.** Hard arithmetic is still DOK-1/2. A one-line "explain why the
  median" answer can be DOK-3. The `dok_rationale` sentence must say what *kind* of thinking,
  not how hard.
- R3 **Adapted items are re-rated.** A DOK-3 with the decision pre-made in the stem drops to
  DOK-2. Splitting a DOK-3 into lettered parts that each have one path drops it to DOK-2.
- R4 **All info on the page.** Every rule/formula the DOK-3 needs is in the rules callout on
  the student sheet. Teacher role during the task = circulate with the printed prompts.
- R5 **No answer leak.** Student edition never renders `\answer{}` bodies, teacher notes, or
  a figure cropped from a key. Figures are TikZ/PGFPlots drawn from the YAML data.
- R6 **Original contexts, honest numbers.** Data are invented and plausible; never present an
  invented dataset as a real study ("a survey found…" → "suppose a survey found…").
- R7 **One DOK-3 per day.** A second DOK-3 candidate goes to `reinforcement` (not collected).

### 1.3 DOK-3 deserts (declared, not faked)

Some days carry no honest DOK-3 (e.g. OLD 1.3 "tables for a categorical variable"; the
mechanics-only days of Unit 3 old-numbering). The YAML declares `focus: none` with a
`desert_reason`; the ladder becomes 2 × DOK-1, 3 × DOK-2, and the teacher edition prints
"DOK 1–2 day — objective is procedural fluency" for evaluators. Folding two days into one
DOK-3 is a teacher call made in the schedule, not by the author. Expected: ≤ 8 of 66.

## 2. Data model

### 2.1 Registry — `dok/registry.jsonl` (one JSON object per line, append-only, id-unique)

```jsonc
{
  "id": "aps-1.6-d3-1",              // aps-{topicKey}-d{dok}-{k}; topicKey = OLD key from lesson-schedule.json
  "topic": "1.6",
  "dok": 3,                           // 1 | 2 | 3
  "role": "focus",                    // warmup | build | focus | reinforcement | exit
  "skill": "4.B",                     // primary CED skill code (validated against framework-parse output)
  "lo": ["UNC-1.H", "UNC-1.I"],       // learning objectives touched
  "frq_pattern": "two-descriptions-adjudicate-then-choose-center",   // DOK-3 only
  "dok_rationale": "Requires weighing two competing descriptions against graph features and defending a summary choice; no single procedure yields the answer.",
  "prompt": "Two students described the commute-time histogram …",   // LaTeX-safe text
  "parts": ["(a) …", "(b) …", "(c) …"],                               // optional lettered parts
  "visual": "commute_hist",           // key into the lesson YAML's visuals block, or null
  "answer": "…",                      // teacher edition only
  "scoring": {                        // DOK-3 only; SAME shape as ai-grading-prompts
    "expectedElements": [{"id": "cites-skew", "description": "names the right skew / tail", "required": true}],
    "scoringGuide": {"E": "…", "P": "…", "I": "…"},
    "commonMistakes": ["treats the 70-min value as typical"]
  },
  "sentence_frames": ["I would report the ___ because the distribution is ___, so the ___ is pulled toward ___."],
  "source": "original",               // original | adapted:<id>
  "hypothetical": true                // R6: data are invented
}
```

Validation (test-enforced, §7): id pattern; `dok ∈ {1,2,3}`; `dok_rationale` ≥ 40 chars and
contains none of the words *hard, easy, difficult*; `skill` matches `^[1-4]\.[A-F]$` and exists
in the parsed frameworks; `role: focus` ⇒ `dok: 3` + `frq_pattern` + `scoring` present;
`hypothetical: true` whenever `prompt` contains a number.

### 2.2 Lesson YAML — `dok/lessons/{topicKey}.yaml`

```yaml
topic: "1.6"                       # OLD topicKey (file/registry key)
ced2026: { unit: 1, topic: "1.6", label: "Describing the Distribution of a Quantitative Variable" }  # printed
title: "Describing a Distribution"
minutes: { warmup: 4, build: 8, focus: 18, exit: 3 }   # 33 min total — see §6 for where it sits
essential_question: "What does a reader need from a description of a distribution to trust a summary statistic?"
rules_callout:                     # R4 — printed on the STUDENT sheet above the focus task
  title: "DESCRIBING A DISTRIBUTION (keep on the page)"
  body: |
    Shape (symmetric / skewed left / skewed right; peaks) · Center (median or mean) ·
    Variability (range, IQR) · Unusual features (gaps, outliers) · always in CONTEXT with units.
    A long tail pulls the MEAN toward it; the MEDIAN resists.
items:
  warmup: [aps-1.6-d1-1, aps-1.6-d1-2]
  build:  [aps-1.6-d2-1, aps-1.6-d2-2]
  focus:  aps-1.6-d3-1              # or `focus: none` + desert_reason (§1.3)
  reinforcement: [aps-1.6-d2-3]     # optional, back of sheet, not collected
exit:                              # summary recap, NOT a CER
  lines:
    - "A description of a distribution must mention ___, ___, ___, and ___, in context."
    - "The biggest thing I learned today was ___."
teacher:                           # teacher edition only
  phase_tag: "Explore — DOK-3 focus task"
  questions_to_ask:
    - "Which feature of the graph did you look at first? Why that one?"
    - "If you deleted the 70-minute student, which description changes?"
  adult_role: "Circulate. Answer questions with questions. Do not confirm a choice until the student has cited two features."
  watch_for: ["reads 'skewed right' off the acronym without pointing at the tail"]
visuals:
  commute_hist:
    kind: pgfplot_hist
    bins: [0,10,20,30,40,50,60,70,80]
    counts: [3,11,12,7,4,2,0,1]
    xlabel: "Commute time (minutes)"
    ylabel: "Number of students"
```

## 3. Files

**New (all under `dok/`, this repo's new namespace):**

| Path | What |
|---|---|
| `dok/README.md` | how to author one ladder, compile, and publish |
| `dok/registry.jsonl` | the item bank (§2.1) |
| `dok/lessons/{topicKey}.yaml` | one per dated lesson day (§2.2) |
| `dok/calibration/unit{1..5}.json` | 2 DOK-2 + 2 DOK-3 *anchor descriptions* per NEW unit (what a DOK-3 in this unit looks like, which FRQ patterns) — the authoring reference, in the A2 `calibration/` spirit |
| `dok/tex/preamble.sty` | copied from `Lesson_planning/tex/preamble.sty`; one-line header noting origin + copy date. Add `\ladderheading`, `\dokbadge{n}`, `\focusbanner`, and a `pgfplot_hist` helper |
| `dok/build_ladder.py` | YAML + registry → `dok/tex/aps_{topicKey}_student.tex` and `_teacher.tex` (§4) |
| `dok/compile.ps1` / `dok/compile.sh` | `pdflatex --miktex-enable-installer` both editions → `dok/pdf/aps_{topicKey}_{student,teacher}.pdf`; `-All` loops every YAML |
| `dok/pdf/` | committed PDFs (student + teacher). GH Pages serves them. Teacher PDFs are public like every other teacher-facing spec in this repo — they contain answers to *our* items, not exam items |
| `dok/index.html` | static TOC: one row per lesson day, dates for B and E, student/teacher PDF links, DOK-3 skill + pattern badge |
| `tests/dok-registry.test.js`, `tests/dok-coverage.test.js` | §7 |
| `tests/test_dok_build.py` | §7 (generator emission, no-leak) |

**Edited:** `TOC.html` / `index.html` (one link to `dok/index.html`), `package.json` (nothing new —
vitest picks the tests up), `CLAUDE.md` (a "DOK ladders" row in the content table).
**Unchanged:** every worksheet, the Desk (until Phase 5), `curriculum.js`, roster-server.

## 4. The generator — `dok/build_ladder.py`

Port of `build_lesson_from_yaml.py`, cut to the ladder:

1. `load_registry()` — same line-numbered error on bad JSON (the 6.4 run's fix, keep it).
2. `load_frameworks()` — shells out to `node scripts/lib/framework-parse.mjs --json` (or reads a
   cached `data/frameworks.json` that a tiny `scripts/build-frameworks-json.mjs` emits) to
   validate `skill`/`lo` and print the LO/EK block on the teacher edition.
3. `emit_student(lesson, registry)` → sections in order: heading (NEW CED label, date line
   left blank) · `WARM-UP` (2 × `\bankitem`, `\dokbadge{1}`) · `BUILD` (2 ×, `\dokbadge{2}`) ·
   rules callout (`calloutgreen`) · `\focusbanner` + the DOK-3 `\bankitem` with parts and
   sentence frames · `EXIT` summary box · `\clearpage` · `OPTIONAL REINFORCEMENT`.
   `\answer{}` renders to nothing. Whitespace: `\vspace{1.4in}` after each build item,
   `\vspace{2.6in}` after the focus task (tunable per YAML `space:`).
4. `emit_teacher(lesson, registry)` → the student body with answers rendered inline in
   `warmred`, plus a front page: objectives/LO/EK table, `\frameworkphaseheader{Explore}{3}{18}`
   with `questions_to_ask` / `adult_role` / `watch_for`, the DOK-3 `scoring` block as an E/P/I
   table, and `dok_rationale` printed under each item (evaluators read these).
5. `render_visual()` — reuse `render_pgfplot` / `render_tikz_boxes`; add `pgfplot_hist`,
   `boxplot` (five-number list), `dotplot`, `two_way_table`, `scatter` — the five displays
   the course needs. No raster images in v1.
6. Deterministic output; running twice yields byte-identical `.tex` (test).

## 5. Page anatomy (student edition)

```
┌ AP Statistics · Topic 1.6 (CED 1.6) · Describing a Distribution      Name ____ Date ____ ┐
│ WARM-UP  [DOK 1]   1. …   2. …                                          (4 min)          │
│ BUILD    [DOK 2]   3. …            ⟨1.4in⟩   4. …            ⟨1.4in⟩    (8 min)          │
│ ┌ RULES: DESCRIBING A DISTRIBUTION (keep on the page) ───────────────────────────────┐ │
│ └───────────────────────────────────────────────────────────────────────────────────┘ │
│ ★ FOCUS TASK [DOK 3 · Skill 4.B]   5. Two students described … (a) (b) (c)  (18 min)    │
│   sentence frame: "I would report the ___ because …"           ⟨2.6in⟩                  │
│ EXIT — summary recap: A description must mention ___ … / Biggest thing I learned: ___  │
└ (back) OPTIONAL REINFORCEMENT — not collected ────────────────────────────────────────┘
```

Teacher edition = 1 front page (framework block + scoring) + the annotated sheet. Target
≤ 3 pages.

## 6. Where the 20 minutes come from (teacher decision — defaults chosen)

The follow-along worksheet currently occupies Launch + Explore with the video. Three
placements; the YAML `minutes` block is sized for the default.

| Option | Shape | Trade-off |
|---|---|---|
| **C (default)** | Video follow-along trimmed to ~20 min (pause points only, reflections moved to homework/AI-graded revision) → ladder 30–33 min | keeps both; the worksheet's reflection textareas already accept revision any time (`project_worksheet_revision_semantics`) |
| A | Ladder REPLACES the worksheet's post-video reflection block on the day | least time pressure; loses the AI-graded FRQ practice on the day |
| B | Ladder is the NEXT day's Do Now A (extended, 15 min) | DOK-3 lands a day late; Do Now runs long against the framework's <10-min target |

Wednesday-short periods: drop `build` item 2 and the reinforcement; never cut the focus task.

## 7. Tests / invariants

- **T1 registry schema** (`tests/dok-registry.test.js`): every line parses; id pattern; dok
  enum; rationale rule (R2 words banned); `focus ⇒ dok 3 + frq_pattern + scoring`; skill codes
  exist in the parsed frameworks; ids unique; `hypothetical` rule.
- **T2 coverage** (`tests/dok-coverage.test.js`): every `topicKey` with a `periods.B` date in
  `data/lesson-schedule.json` has `dok/lessons/{topicKey}.yaml` OR is listed in
  `dok/PENDING.md` (the fan-out backlog, which the test prints as a countdown). Every YAML's
  `items.*` ids exist in the registry with the right `dok`/`role`. One and only one `focus`.
- **T3 emission** (`tests/test_dok_build.py`): generator runs on every YAML; student `.tex`
  contains no `\answer{` body text, no `scoring`, no `dok_rationale`; teacher `.tex` contains
  all three; output deterministic; a fixture YAML with `focus: none` emits the desert banner.
- **T4 no-leak visuals**: `visuals` blocks contain only data + labels (no `answer`-bearing
  annotations such as "outlier" arrows) — a key allow-list per `kind`.
- **T5 compile smoke (local, not CI)**: `dok/compile.ps1 -All` exits 0 and every PDF page
  count ≤ 2 (student) / ≤ 3 (teacher); logged in `dok/COMPILE_LOG.md` by the author.

CI runs T1–T4 (pure Node/Python). Compilation is teacher-laptop only (MiKTeX), like the A2 repo.

## 8. Phases

| Phase | Work | Gate |
|---|---|---|
| 0 | Teacher signs off on this spec, picks §6 placement and §9 defaults | — |
| 1 — skeleton | copy `preamble.sty`; port generator; `pgfplot_hist`; `dok/calibration/unit1.json`; ladder **1.6** authored, compiled, printed once | PDF looks right on paper |
| 2 — stress test | ladders **1.2** (variable types) and **1.9** (comparing distributions) by the same path; `dok/README.md` written FROM the friction log; T1–T3 green | ≤ 30 min per ladder by hand, else fix the tooling before fan-out (per `feedback_authoring_tool_stress_test`) |
| 3 — Unit 1 fan-out | remaining 7 dated Unit-1 days (B: 09-08 → 09-24), dispatched as ONE dependency-free batch (each agent owns exactly `dok/lessons/{topic}.yaml` + its registry lines + its calibration unit), adversarial review on the 10 DOK-3s only | all 10 compile; DOK-3 review: 0 must-fix |
| 4 — rolling fan-out | Units 2–5 + bonus days, one NEW-unit per batch, each batch landed ≥ 2 weeks before its first lesson date; `dok/PENDING.md` counts down | T2 coverage reaches 66/66 (minus declared deserts) |
| 5 — optional app hooks | (a) `dok_url` column on `lesson_urls` + a 🪜 chip in the Desk resource panel (the table wins over files, so this is a table write, not a file edit); (b) a `dok-{topic}` textarea in the worksheet that submits the DOK-3 answer to `/api/ai/grade` with the registry `scoring` block as the rubric — AI only ever RAISES, same as today | separate spec if pursued |

## 9. Open decisions (defaults chosen; change if you want)

- Placement of the 20 min **[default: §6 option C — trim the video block]**.
- Student PDFs committed to the repo (public) **[default: yes; teacher PDFs too — items are ours]**.
- File key **[default: OLD `topicKey` like the rest of the repo; NEW CED label printed]**.
- Bonus ("Beyond the Exam") days get ladders **[default: yes, but last, and DOK-3 optional]**.
- Registry language **[default: JSONL + Python generator, mirroring the proven A2 chain; the
  tests are Vitest so the repo's `npm test` stays the single gate]**.
- DOK-3 deserts allowed **[default: yes, declared, ≤ 8]**.
- Sentence frames on every DOK-3 **[default: yes — the ELL non-negotiable from the A2 spine]**.
- Fan-out executor **[default: Codex/agents in batches per §8; the teacher authors nothing by hand after Phase 2]**.

## 10. Worked sample — Topic 1.6 (the Phase-1 ladder)

**WARM-UP [DOK 1]**
1. The histogram shows commute times for 40 students. Name its shape and state which
   interval contains the median. *(2.A — one feature each)*
2. A long right tail pulls which measure of center toward it: the mean or the median?
   *(UNC-1.I recall)*

**BUILD [DOK 2]**
3. Describe the distribution of commute times in context. Address shape, center,
   variability, and unusual features, with units. *(2.A/2.B — multi-feature description)*
4. The same data are redrawn with bin width 20 instead of 10. Name one feature that is
   easier to see and one that is hidden. *(2.B — compare two displays of one dataset)*

**★ FOCUS TASK [DOK 3 · Skill 4.B · pattern `two-descriptions-adjudicate-then-choose-center`]**
5. Two students described the commute data.
   *Ana:* "Roughly symmetric, centered near 20 minutes, spread from 5 to 45."
   *Ben:* "Skewed right with a peak in the 10–20 interval; most students are under 30
   minutes; one student at about 70 minutes is an outlier."
   (a) Whose description could a reader trust when choosing a summary statistic? Cite two
   specific features of the graph that settle it.
   (b) State which measure of center you would report for these data and why.
   (c) Ana's "spread from 5 to 45" ignores one value. Explain what that omission would do
   to a reader's sense of variability.
   *Sentence frame:* "I would report the ___ because the distribution is ___, so the ___ is
   pulled toward ___."

**EXIT — summary recap**
A description of a distribution must mention ___, ___, ___, and ___, in context. /
The biggest thing I learned today was ___.

**Teacher scoring (E/P/I), abbreviated.** E: picks Ben, cites the tail AND the 70-min value,
chooses median with a pull-toward-tail justification, and names the omitted outlier's effect
on range. P: picks Ben with one feature, or chooses median without the mechanism. I: picks
Ana, or chooses a center without reference to shape. Common mistake: treating the 70-minute
value as typical; reading "skewed right" off the acronym without pointing at the tail.

### TL;DR
One YAML per lesson day + one JSONL item bank → a Python generator (ported from the proven
Algebra 2 chain) emits a one-sheet DOK 1→2→3 ladder with exactly one starred DOK-3 focus
task anchored to a CED skill code and an FRQ pattern, in student and teacher editions,
compiled with MiKTeX and published under `dok/`. Stress-test three ladders, then fan out the
66 dated days a unit at a time, two weeks ahead of the calendar. Grade-inert; the Desk chip
and AI grading of the DOK-3 are an optional Phase 5.
