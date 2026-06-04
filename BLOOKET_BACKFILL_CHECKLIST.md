# Blooket backfill checklist — due by Q2 start (2026-11-14)

**Why:** the Blooket quiz **content** (CSVs) is ready for all of U4–U7, but `roadmap-data.json`
has no live Blooket **set URL** (`https://dashboard.blooket.com/set/<id>`) for those lessons — so
the engine's `hasBlooket`, the Desk links, and the Schoology/gradebook columns all exclude them.

**How to fill this in:** create/find each set on Blooket (import its CSV), copy the dashboard URL,
and paste it after the `→`. One Blooket **set per CSV** (combined worksheets share a set).
**31 sets cover 40 topics.** Paste the filled list back to me and I'll wire the URLs into
`roadmap-data.json` + regenerate `roster-server/data/blooket-lessons.json` + verify.

## ✅ Already backfilled from `curriculum_render/data/units.js` (2026-06-04)
Mined the teacher's units.js (its `blookets[].url` per topic) — these are now wired into
`lesson-registry.json` (source) + `roadmap-data.json` + `blooket-lessons.json`:
- **3.6, 3.7** → `…/set/69612c55f522b6ed3e3233c7` (one set, combined)
- **4.1, 4.2** → `…/set/696edcfa2761a89ccdaf2fdc`
- **4.3, 4.4, 4.5** → `…/set/6970461b0b6fcb7e199c7134`
- **4.6** → `…/set/69719a57390d28db6d7edfa9`

> units.js currently has Blooket URLs through **4.6** only. As you add U4.7+ / U5 / U6 / U7 Blookets
> to curriculum_render, ping me and I'll re-mine units.js + backfill — no manual list needed.

## Unit 4 — remaining (3 sets, not yet in units.js)
- [ ] `u4_l7_l8_blooket.csv` → 4.7, 4.8 → ______________________________
- [ ] `u4_l9_blooket.csv` → 4.9 → ______________________________
- [ ] `u4_l10_l11_l12_blooket.csv` → 4.10, 4.11, 4.12 → ______________________________

## Unit 5 (8 sets)
- [ ] `u5_l1_l2_blooket.csv` → 5.1, 5.2 → ______________________________
- [ ] `u5_l3_blooket.csv` → 5.3 → ______________________________
- [ ] `u5_l4_blooket.csv` → 5.4 → ______________________________
- [ ] `u5_l5_blooket.csv` → 5.5 → ______________________________
- [ ] `u5_l6_blooket.csv` → 5.6 → ______________________________
- [ ] `u5_l7_blooket.csv` → 5.7 → ______________________________
- [ ] `u5_l8_blooket.csv` → 5.8 → ______________________________

## Unit 6 (10 sets)
- [ ] `u6_l1_l2_blooket.csv` → 6.1, 6.2 → ______________________________
- [ ] `u6_l3_blooket.csv` → 6.3 → ______________________________
- [ ] `u6_l4_blooket.csv` → 6.4 → ______________________________
- [ ] `u6_l5_blooket.csv` → 6.5 → ______________________________
- [ ] `u6_l6_blooket.csv` → 6.6 → ______________________________
- [ ] `u6_l7_blooket.csv` → 6.7 → ______________________________
- [ ] `u6_l8_blooket.csv` → 6.8 → ______________________________
- [ ] `u6_l9_blooket.csv` → 6.9 → ______________________________
- [ ] `u6_l10_blooket.csv` → 6.10 → ______________________________
- [ ] `u6_l11_blooket.csv` → 6.11 → ______________________________

## Unit 7 (9 sets)
- [ ] `u7_l1_blooket.csv` → 7.1 → ______________________________
- [ ] `u7_l2_blooket.csv` → 7.2 → ______________________________
- [ ] `u7_l3_blooket.csv` → 7.3 → ______________________________
- [ ] `u7_l4_blooket.csv` → 7.4 → ______________________________
- [ ] `u7_l5_blooket.csv` → 7.5 → ______________________________
- [ ] `u7_l6_blooket.csv` → 7.6 → ______________________________
- [ ] `u7_l7_blooket.csv` → 7.7 → ______________________________
- [ ] `u7_l8_blooket.csv` → 7.8 → ______________________________
- [ ] `u7_l9_blooket.csv` → 7.9 → ______________________________

---
_Already complete (no action): U1, U2, U8, U9 (and now 3.6/3.7 + 4.1–4.6) all have Blooket URLs._
_Remaining to source: **4.7–4.12, all of U5, U6, U7** (34 topics / 27 sets) — these aren't in units.js yet._
