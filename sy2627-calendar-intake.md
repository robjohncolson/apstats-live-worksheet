# SY2627 Calendar Intake — fill this in to make the schedule real

This is the **only** input standing between the synthetic P1 fixtures and a real
SY2627 schedule. Fill in the blanks below; I drop them into `CAL` in
`scripts/build-topic-schedule-sy2627.mjs`, regenerate, and the fixture becomes the
production `topic-schedule.json`. No part of the migration needs re-discussion —
just these values. Leave a field blank and I keep the synthetic placeholder + flag it.

---

## 1. Term boundaries
- **First instructional day:** `YYYY-MM-DD` (a school day — Unit 1.1 lands here)
- **AP exam date (hard end):** `YYYY-MM-DD` or "TBD" — the schedule must finish before it. *Confirm with your AP coordinator; the public dates page still shows 2026. I will not hardcode a guess.*

## 2. Breaks / no-school days (skipped when placing lessons)
List each range (or single day). Add as many rows as needed:
- `name` — `from YYYY-MM-DD` → `to YYYY-MM-DD`
- e.g. Thanksgiving — `2026-11-25` → `2026-11-27`
- e.g. Winter — `______` → `______`
- e.g. Spring — `______` → `______`
- (single-day closures: put the same date in from/to)

## 3. Class-period model
- Still **two periods B and E**? (yes / no — if changed, tell me the period names)
- Do B and E meet on the **same days** or a different cadence? (the fixture just lags E one school day behind B — replace with reality if they differ)

## 4. Pacing — pick ONE
How many class meetings each topic gets. Two ways to give it:

- **(A) Per-unit day budgets** *(recommended — matches the CED weights)*: total teaching days per new unit; I distribute across that unit's topics.
  - U1 (Exploring Data & Collecting Data, 20–30%): `___` days
  - U2 (Probability, RVs & Distributions, 15–25%): `___` days
  - U3 (Inference: Proportions + chi-square, 15–25%): `___` days
  - U4 (Inference: Means, 10–20%): `___` days
  - U5 (Regression, 10–20%): `___` days
- **(B) Per-topic**: a flat "N meetings per topic" (the fixture uses 1), with any exceptions listed.

*(67 core topics + 5 unit-review days need to fit between §1's first day and exam date. If your budget overflows the window I'll flag it rather than silently compress.)*

## 5. Review days
- Keep a **review day at the end of each new unit** (`1.review`..`5.review`)? (yes / no)
- Any unit that should get **more than one** review day? (list)

## 6. Last year's schedule
- **Archive SY2526** so the Desk stops showing 2026 dates? (yes / no) — if yes I move the old `topic-schedule.json` to a named archive.

---

## What happens after you send this
1. I set `CAL` (+ pacing) in `build-topic-schedule-sy2627.mjs`, regenerate → real `topic-schedule.json` (14 baked invariants must still pass; overflow past the exam date is a hard fail).
2. **P2 starts** (per Codex, before any live sync): add registry/special-title handling for the new `1.review`..`5.review` keys (Agent registry only has `6.review`), and land the `_mergeRegistryData()` `ced2026` one-line fix on the Desk.
3. Then rebake `roadmap-data.json`, decide live-manifest replacement (drop-in vs Do-Now-split), Supabase sync with real dates, and the Desk render — each behind its own browser-smoke gate.

See `sy2627-schedule-reframe-spec.md` for the full plan; this note is just the data hand-off.
