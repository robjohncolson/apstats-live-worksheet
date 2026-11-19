---
name: do-now
description: "Propose the Do Now (warm-up) and the next-class note for AP Stats Period B or E, from material that already exists. Use when the teacher says 'Do Now', 'prep tomorrow', 'plan B/E', or 'what's next for B/E'."
---

# Do Now and next-class note (AP Stats), dry run

You produce a proposal on screen. You write nothing to the Desk, the server or the repo.
Run one shell command per call: no pipes, no `;`, no `&&`. Any other command can end your run.
(The Desk's per-student "Do Now" card is automatic. Never touch it or `/donow`.)

## 1. Facts (read-only)
1. `npm run pull-summaries`: takes a few seconds and only refreshes the gitignored `roster-local/class-summaries/`.
   If it fails, go on without it and say so.
2. `node .grok/skills/do-now/next-class.mjs --section B` (or `E`).
   - Add `--date YYYY-MM-DD` for a specific class day.
   - It prints the class day and what the schedule has that day (lesson with its CED label and worksheet file, or a poster, Progress Check or work day).
   - It also prints the previous meeting, the last 4 lessons with their zero dates, the next 2 meetings and the newest summary file.
   - If it fails, STOP.
3. Read the summary file it names. Sections: Landed, Student questions, Promises made, Next prep.
   **Sanity check first:** does "Landed" match what the schedule had on the previous meeting? Match on the topic, the poster day or the Progress Check.
   If it describes something else (another course, a staff meeting, a different lesson), say:
   "The <date> summary does not look like this class: I did not use it." Then skip its promises.
4. Optional: `node .grok/skills/reminders/owed.mjs --section PeriodB --date <class date> --mask`.
   Use it for one count only: how many students still owe the lesson whose zero date is on or next after the class date.
   Never put names or scores in the note.
5. Optional: if `roster-local/brief/` exists, read the newest brief for the section. Never depend on it.

## 2. Do Now rules (teacher, 2026-10-22: "Do now should not be unique ... nothing fancy")
Never a new task, a new activity type or an invented problem. Pick from existing material, in this order:
1. **What the teacher said happens at the start of next class.** These are the promises in a summary that passed the sanity check, e.g. "turn in the review sheet next class".
2. **The work already on the schedule:**
   - Finish the follow-along and flashcards of the lesson whose zero date is on or right after the class date.
   - Then open the day's follow-along: the worksheet file printed by `next-class.mjs`.
   - This is the AP Stats precedent (10/23 notes in `roster-local/prep/`).
3. **A Group Jam (IXL skill) or a packet problem, only when the teacher, a summary or the brief names it.**
   AP Stats has no local IXL or packet list. Never write an IXL code, a packet number or a problem you made up.
   If you think one would fit, ask: "Do you want a Group Jam or packet item? Which one?"

On a poster, Progress Check or work day, the Do Now is what that day already is (finish and hand in the poster, the PC part). Say only what the schedule or summary states.

Never claim something was taught because it was planned, or untaught because a recording missed it. If unsure, ask.

## 3. Show the teacher (one screen, plain lines)
1. Class: Period, weekday and date, and what is scheduled (CED label, never the stored key alone).
2. Open promises from the last class, or "summary not usable" or "no summary".
3. **Do Now (proposal):** one or two lines, each with its source (promise, schedule or teacher).
4. **Then:** the day's lesson or event. Mention the next 2 meetings if one is a Progress Check or poster day.
5. **Questions for you:** anything you could not confirm.

Never include student names, scores or quotes from students.

## 4. Only after the teacher answers
- If the teacher wants it kept, write `roster-local/prep/<date>-<B|E>.md`. It is gitignored, and you may write it only with the teacher's corrections and with no student names.
- Nothing is published anywhere. There is no production write in this skill.
