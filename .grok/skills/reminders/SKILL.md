---
name: reminders
description: "Draft AP Stats student reminders for Period B or E: who owes what and one short message per student, as a proposal for the teacher. Use when the teacher says 'reminders', 'who owes what', 'missing work', 'nudge them', or 'what should I tell <student>'."
---

# Reminders (AP Stats), dry run

**Privacy: running this sends student names and grades to xAI (Grok). The teacher must have agreed to that.**

You produce a proposal on screen. You send nothing. Sending is step 4, a separate step the teacher approves.
One shell command per call: no pipes, no `;`, no `&&`. Any other command can end your run.

## 1. Facts (read-only)
1. `node .grok/skills/reminders/owed.mjs --section B --date YYYY-MM-DD` (or `E`).
   - `--date` is the day the reminders go out. Leave it off for today.
   - It runs `scripts/weekly-slips.mjs --dry-run --all`, which only reads from the roster server.
   - It prints MASKED labels (S1, S2...) by default. Draft everything with the masked output.
   - Only when the teacher asks which student is which, run the same command again with `--names`. Show those names to the teacher only, in the terminal. Never paste them into a file, a message draft, Ops, or anywhere else.
   - `--section` takes B, E, PeriodB or PeriodE.
   - If it fails (exit 1, 401, network), STOP and show the error line. Never rebuild the list by hand.
2. Optional, for Progress Checks: read the newest `tools/.pc-reconcile-logs/reconcile-<Section>-*.log`.
   - A `NEEDS SCORING` line is the teacher's job, not the student's.
   - `PAGE NOT READY` means the PC status is unknown. Say so and never guess.
   - Take PC dates from `data/lesson-schedule.json` (`progressChecks`), never from memory.
3. Optional: the newest `roster-local/class-summaries/<date>-<B|E>.md`, for anything the teacher promised the class.
   If `roster-local/brief/` exists, you may read that section's newest brief. Never depend on it.

## 2. Judgment rules
- Keep three groups and never mix them:
  - **COUNTING NOW** is a 0 now. Tell the student to fix it.
  - **ZERO SOON** becomes a 0 after the date shown.
  - **LATE, NO ZERO** can only help when it is finished. Never call it a 0, and never say it "turns into a 0".
- Name at most 3 items per student:
  - COUNTING NOW first, oldest first.
  - Then ZERO SOON, nearest first.
  - If there are more, add "and N more on your Desk".
- Use the Desk's words: "Follow-Along Worksheet", "Quiz", "Flashcards", plus the CED label exactly as printed (e.g. "2.7 · Independent Events & Unions"). Never the stored key ("4.6").
- **Flashcards:** the deck score counts point for point. Never call 80% "done", "a pass" or "credit".
- **NOTHING DONE THIS QUARTER** or **ON THE EXCLUDE LIST:** do not draft a list. Put the student under "Needs your call" (still in the class?).
- **Nothing missing:** no reminder.
- **Progress Checks:**
  - Never chase a missed cut-off. A student who asks goes to the teacher, who reopens it.
  - Never remind about a part that has not been given yet.
- Never mention another student, a class rank or a class average. Give the student's own quarter number only if the teacher asks.
- **Messages:** at most 280 characters each (the Desk chat limit). Friendly and specific. Signed "- Mr. Colson".
  Every item must be a line from `owed.mjs`. Never invent an item, a date or a consequence.

## 3. Show the teacher
1. Per section, one line: "N students listed, n with zeros counting now".
2. A table with one row per student: student | up to 3 items | draft message.
3. **Needs your call:** nothing-done students, PC questions, anything unclear.
4. End with "Nothing was sent."

Save only if the teacher asks, and only to `$HOME/grade-backups/reminders/<date>-<Section>.md` (the home folder: outside the repo). Never put names in the repo, not even in gitignored folders.

## 4. Sending (separate step: never in the same run as the draft)
Only after the teacher says "send" to these exact messages in this session. Show each final message first.
- **Normal way:** the teacher sends them himself, from Schoology messages or the Desk's teacher chat.
- **Desk chat API:** `POST /teacher/nudge` on the roster server (`roster-server/nudge.js`).
  - This is a production write that students see.
  - The teacher must approve each batch.
  - Never call it from a scheduled job.

## Stop conditions
- `owed.mjs` fails.
- The date is a weekend or break and the teacher did not ask for that date.
- The teacher has not named the section: ask "B, E or both?"
