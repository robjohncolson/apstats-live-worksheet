# Reaching students who don't open the Desk — spec (2026-09-26)

Teacher: "make what matters more visible to students who really don't spend time on the Desk app;
better interlinks with Schoology messages; something like a weekly summary for students who are
falling behind." Chosen: **(1) a comment on the zero itself in Schoology** and **(2) a weekly paper
slip** printed with the Friday DOK run. (3, a weekly class Update post, is deferred.)

Both are READ-ONLY with respect to grades. Neither changes any score anywhere.

---

## 1. Schoology grade-cell comments (tools/, Python, runs on the Athena rig)

### What the student sees
Next to a 0 in Schoology (Follow-Along or Blooket column), the cell's comment reads, in the
teacher's voice:

> Not a permanent 0. Missing: 1.2 worksheet. Finish it on the Desk (My Ledger → Missing work) and
> this grade updates at the next sync.

For a Blooket column: "Missing: 1.2 flashcards (Desk → Study Break or the lesson's Blooket)". When
the same lesson also has an untaken quiz, add: "Your 1.2 quiz is also unfinished (it counts in the
Desk grade)." Never mention other students, never a class statistic, never a threat.

### When
- Written whenever the sync writes a lagged ZERO into a cell (the `zero_due` path in
  `tools/schoology_components.py`), i.e. the comment travels with the zero.
- Updated to "Replaced — nice work." **once, and then cleared** on the next sync after the cell's
  value becomes non-zero? No: keep it simple — when the value is non-zero the comment is CLEARED (a
  comment that praises would become stale). Best-wins still applies to the grade; comments follow
  whatever value the sync just confirmed.
- Never written on cells the sync did not touch. Never written in dry-run.

### How (discovery first — the comment UI is not yet mapped)
1. `tools/schoology_ops.py`: add `inspect_cell_comment_ui(cdp, column_key, row_index) -> dict` that,
   for one cell, reports what affordance exists (a comment icon inside `#grader-grid-cell-<col>-<row>`,
   a context menu item, a `title`/`aria-label` mentioning comments, the DOM of any popover that
   opens on a trusted click) WITHOUT typing anything. Expose it as
   `python tools/schoology-sync.py --inspect-comment-ui --section PeriodB --student <uid> --column FA:1.2`.
   The teacher runs this once with the rig signed in and pastes the output back; the write step is
   then built against the real DOM. (Do not guess Schoology's markup.)
2. `write_cell_comment(cdp, column_key, row_index, text) -> dict` following the P1b lesson: trusted
   clicks and real keystrokes, verify by re-reading the popover/tooltip after save, return
   `{ok, verified, text}`. `clear_cell_comment(...)` likewise.
3. `tools/schoology_components.py`: `component_grades_from_class_doc` gains a sibling
   `component_comments_from_class_doc(doc, uid_map, today) -> {"<uid>/<component_key>": text}` that
   yields the text above for exactly the cells that map to a lagged zero (worksheet/blooket), using the
   lesson's `lessonKey` and the section's zero date; quiz mention from `quizTotal > 0 && Q == null`.
4. `tools/schoology_sync_section.py`: after a successful grade write of 0, write the comment; after
   a successful non-zero write, clear an existing comment. Dry-run prints planned comments. New
   `--no-comments` flag to disable. Every comment write is logged like grade writes.
5. Tests (`tests/test_schoology_*.py`, pytest): comment text generation (worksheet / blooket /
   with-quiz variants; no names; no other-student data), planning in dry-run, clearing rule, flag.
   The CDP writer is verified live by the teacher (as P1b was), not by pytest.

### Guardrails
- The rig writes to the real gradebook: default dry-run stays default. Comments ship behind
  `--comments` on the first live run, then become default once the teacher has seen one land.
- Text is fixed strings + lesson labels only. No free text from any data source.

---

## 2. Weekly "Where you stand" slip (paper, with the Friday DOK run)

### What it is
A half-page (two per Letter sheet), one per student who is behind, handed out Monday. It has the
student's name (this is a PRIVATE printout for the teacher's hands), so it must never enter the
public repo.

Contents, top to bottom:
1. `Where you stand — <Name> — Period B — week of Sep 29`
2. The section's box plot of current quarter grades (pgfplots `boxplot prepared` from the
   five-number summary) with the student's value as a red dot, and one line: "Class median 97 ·
   you 31 · below Q1". Same numbers as the Desk's Class Snapshot.
3. **Missing work** — the exact rows the Desk's Missing-work card shows (worksheets, quizzes,
   flashcard decks), each with its zero date and "already a 0" / "0 after <date>".
4. **What to do first** — three lines, generated: the single item that raises the grade the most
   (cheapest track to fill: an empty Blooket/quiz track first), then the next two.
5. Footer: "Every item on this list can still be finished. Desk → My Ledger → Missing work."

### Who gets one
Default threshold: current quarter grade < 70 **or** any item already a 0. Override with
`--all` (everyone, useful as the Monday check-in) or `--min <grade>`.

### How
- `scripts/weekly-slips.mjs` (Node, ESM): reads `~/grade-backups/config.json` for the teacher key
  and roster URL (same as the sync), fetches `/class/grades?section=…` for both sections, computes
  per student: quarter grade, the five-number summary via `lib/class-snapshot.js`, the missing list
  via the SAME rule as the Desk (`lessonGradeNoQuiz == null && Cws == null` → worksheet;
  `quizTotal > 0 && Q == null` → quiz; `hasBlooket && blooket == null` → deck; zero date from
  `lesson.zeroDate[period]`), and the "do first" ranking.
- Writes `<out>/<date>-<section>-slips.tex` and runs `pdflatex` (the DOK toolchain) →
  `<out>/<date>-<section>-slips.pdf`. **`<out>` defaults to `%USERPROFILE%\grade-backups\slips\`**,
  outside the repo. If `--out` points inside the repo, refuse unless the path is gitignored.
- Hook: `tools/weekly_dok.ps1` gains a final step that runs the slips build (never fails the DOK
  job; logs its own line). `state/weekly-dok/<date>-brief.md` gets one line: "Slips: N printed
  candidates (B x, E y) → <path>".
- Tests: `tests/weekly-slips.test.js` — missing-list rule parity with the Desk (same fixture as
  `tests/desk-zero-warning.test.js`), threshold selection, "do first" ranking, LaTeX escaping of
  names, refuses an in-repo un-ignored `--out`, two slips per page layout pins.

### Voice
Second person, plain, no exclamation marks, no comparison to named classmates. The plot does the
comparing.

### Discovery result (2026-09-26, read-only DOM inspection on the live rig — no clicks)
- Every grade cell `#grader-grid-cell-<col>-<row>` contains `DIV.grades-comment.icon-comment` (no attributes beyond the class; zero-size until the cell is hovered/active, so click the CELL first, then the icon).
- The popover is a single shared element `#grade-comment-field.s-js-grader-comment-field > .grade-comment-wrapper` (hidden until opened) containing: `h3.read-only-comment__title` "Grade Comment:", `p.grade-comment-note` ("New comments will be published to students by default"), `textarea.grade-comment`, and `label.comment-status-label > input#comment_status[type=checkbox]` "Display to Student". A sibling `.grade-comment-close` closes it. There is NO save button: the comment is committed when the popover closes.
- Therefore the writer must: click the cell → click `.grades-comment` inside it → wait for `#grade-comment-field` to be visible → focus `textarea.grade-comment`, select-all + real keystrokes for the text → ensure `#comment_status` is CHECKED (a real click if unchecked; the student never sees an unchecked comment) → click `.grade-comment-close` → re-open once and verify the textarea holds the text and the box is checked → close again. Never press Enter inside `input.grader-edit-input`.
- Clearing = same path with an empty textarea.

---

## 3. Weekly Schoology Update post — social proof (teacher 2026-09-26: "reward socially when a zero has been eliminated")

### What the class sees (Monday, course Updates feed, one post per section)
> **Where we stand — Period B, week of Sep 28**
> Last week this class replaced **9 zeros** with real scores. Median 94 → 97.
> [image: the section's box plot / dot plot, no names]
> Every 0 on your Desk is still replaceable: My Ledger → Missing work.

Rules: numbers and the anonymous plot only; never a name, never "N students are behind"; celebrate the
count of zeros REPLACED (work done), not the count remaining. If zero zeros were replaced, the post says
"Median 94. 6 zeros are waiting to be replaced — first one gets a shout-out next Monday." (still no names).

### How the count is known
`scripts/weekly-slips.mjs` already computes every student's missing list each Friday. It now also writes a
private snapshot `%USERPROFILE%\grade-backups\slips\<date>-missing.json` (`{section: {username: [item keys]}}`).
"Zeros replaced" = items present in LAST week's snapshot that are absent this week and now have a score.
Median before/after = last week's vs this week's `/class/snapshot` five-number summary (store it in the same
file). First run has no baseline → the post omits the delta and states the median only.

### Image
`scripts/render-snapshot-png.mjs`: node-canvas is NOT installed; instead render the plot as an SVG string
(port of `lib/class-snapshot.js` draw() to SVG elements is small: rect/line/circle/text) and convert with the
existing toolchain (`rsvg-convert` if present, else pdflatex+`\includesvg`? — simplest: emit SVG, and
post the SVG as an attachment; Schoology renders PNG/JPG only → use `sharp` (add as a devDependency) to
rasterize the SVG at 2x). Output `<date>-<section>-snapshot.png` next to the slips.

### Posting
`tools/schoology_ops.py` gains `post_course_update(cdp, course_id, text, image_path) -> dict` on the rig
(course home → Updates composer → text + image attach → Post; verify by reading the newest update back).
`tools/weekly_dok.ps1` does NOT auto-post: posting is a Monday-morning teacher action,
`python tools/schoology-sync.py --post-update --section PeriodB` (dry-run prints the text + image path;
`--live` posts), so the teacher reads the number before it goes up.

### Order of build
After (1) comments and (2) slips have run live once. The composer UI must be mapped read-only first
(same method as the comment popover).
