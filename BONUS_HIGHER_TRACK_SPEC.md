# Bonus Bank v2 — placed on the higher track at quarter close (spec, 2026-09-27)

Status: SPEC for teacher review. Not built. **Grade-affecting** (changes the closed-quarter number
that goes to Schoology). Supersedes `BONUS_BANK_SPEC.md` decision 1 ("Work track only") and
decision 3 ("placement is not published").

Teacher (2026-09-27): "the bonus work goes to whichever track is higher as well … the rule should be
'higher track', whichever that becomes by the end of the quarter."

## 1. The rule

At quarter close, after **Freeze**, the banked points `P` (E = +5, P = +3, I = +1, summed over the
quarter's sheets, unchanged) are added to ONE track, chosen per student at close time:

```
candidates = { work: combineV3(pc, min(100, work + P)),  pc: combineV3(min(100, pc + P), work) }
placement  = the candidate with the HIGHER adjusted grade;
             tie → the track whose frozen average is higher; tie again → work
adjusted   = min(100, candidate grade + residual)          (residual = today's early-bonus carry, unchanged)
```

- "Whichever track is higher by the end of the quarter" is what this produces in every case where
  both tracks are ≥ 40%: adding to the higher track raises `max(pc, work)` one-for-one; adding to
  the lower one does nothing until it overtakes. Evaluating both placements (rather than comparing
  the two frozen averages) also covers the below-floor cases correctly: when Work is under 40% and
  `+P` flips it over the floor, that flip can be worth more than adding to a higher PC, and the
  rule picks it. The floor switch stays allowed on **either** track.
- **PC is never null-filled.** If the PC track is null (Progress Checks not counting yet for that
  quarter) the only candidate is Work — today's behaviour.
- **Nothing is written into a PC score.** The placement is a virtual add inside the close
  computation. Unit PC raw scores, `pcAvg` in the live gradebook, Schoology's per-unit PC columns,
  the misconception work and mastery views are untouched; only the closed-quarter grade moves.
- **Monotone:** more banked points never lower the adjusted grade; the chosen candidate is always
  ≥ the frozen grade (a placement that lowers the grade is impossible because both candidates add a
  non-negative amount to a monotone formula; keep the existing `Math.max` guard anyway).

## 2. Code (roster-server, `class.js`)

- `bonusAudit(roster, frozen, bonus, gates)`: compute both candidates; return the existing fields
  plus `placement: 'work' | 'pc'`, `pcBefore`, `pcAfter` (null when PC is null), and keep
  `workBefore` / `workAfter` as the Work candidate's values (so the dashboard still shows them).
  `switched` = the floor was crossed on the CHOSEN track. Add `altGrade` = the other candidate's
  adjusted grade (audit transparency).
- `POST /class/quarter/apply-bonus`: unchanged shape; the `bonus_applied` row's `response` JSON
  gains `placement`, `pcBefore`, `pcAfter`, `altGrade`. Idempotency / first-writer / stale-if-refrozen
  rules unchanged. The student-facing redaction of `bonus_applied` reads (grade + date only) is
  **lifted for the placement word only** — students may see "added to your Progress Check track"
  or "added to your Work track" (decision 3 reversed, teacher 2026-09-27).
- `GET /class/quarter/deltas`: the per-student preview row carries the same new fields.
- No migration.

## 3. Surfaces

- **Teacher dashboard, Quarter Close card:** the preview table gains a **Placed on** column
  (`Work` / `PC`) and shows `alt` in a tooltip (`other placement would give 81.4`). Confirm text:
  "Apply banked bonus to each student's better track."
- **Desk, My Ledger "Bonus banked" block:** footer becomes `Added at the end of the quarter to
  whichever track helps you more.` After apply: `Applied to your <Work|Progress Check> track — quarter
  grade <n>.`
- **Slip footer + balance-card note** (this is the sentence the calm-ledger note uses today):
  `Bonus sheets are banked and added at the end of the quarter to whichever track helps you more.
  They can only raise your grade.`
- **Coach facts:** when banked points exist: `BONUS BANKED: +8 (2 sheets) — added at quarter close
  to whichever track helps more; can only raise the grade.`
- **Start-here / grade playground** (if it explains the bonus): same sentence. `BONUS_BANK_SPEC.md`
  header gets a pointer to this file.

## 4. Tests

- `roster-server/tests/class-bonus*.test.js` (find the existing bonus tests): every existing case
  re-pinned where the number changes, plus: (a) both ≥ 40, PC higher → placed on PC, adjusted =
  pc + P; (b) both ≥ 40, Work higher → placed on Work; (c) Work < 40, PC 90, P = 5 lifts Work to 42
  → compare candidates and pick the higher (compute both by hand in the test); (d) PC null → Work,
  `pcAfter` null; (e) tie → higher frozen average, then Work; (f) monotone: for P in 0..35 the
  adjusted grade is non-decreasing and ≥ frozen; (g) the `bonus_applied` response carries
  `placement`; student read shows the placement word and nothing else new.
- Grade-sim invariants: rerun `npm run` grade-sim / the property suite that guards the quarter
  formula (see memory `project_grade_simulator`: never non-monotonic) with the new placement.
- Desk: `tests/desk-*bonus*.test.js` footer/after-apply wording pins.

## 5. Rollout

1. Spec approved → Codex/Opus implement + Codex review (grade-affecting: the reviewer must recompute
   cases (a)–(f) by hand).
2. Deploy is automatic on push (roster-server). Nothing changes for any student until the teacher
   presses **Apply banked bonus** at Q1 close; the preview shows the placement per student first.
3. Memory + `BONUS_BANK_SPEC.md` header updated; the "never put bonus on PC" note in memory is
   replaced by this rule.

## 6. What the teacher should say to students (so the Desk, the slip and the classroom agree)
"Bonus sheets are banked. At the end of the quarter I add them to whichever of your two tracks
helps you more. They can only raise your grade. Your Progress Check score itself stays what you
earned; the bonus moves the quarter grade."
