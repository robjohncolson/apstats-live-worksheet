# Blooket backfill checklist — due by Q2 start (2026-11-14)

**Why:** the Blooket quiz **content** (CSVs) is ready for all of U4–U7, but `roadmap-data.json`
has no live Blooket **set URL** (`https://dashboard.blooket.com/set/<id>`) for those lessons — so
the engine's `hasBlooket`, the Desk links, and the Schoology/gradebook columns all exclude them.

**How to fill this in:** create/find each set on Blooket (import its CSV), copy the dashboard URL,
and paste it after the `→`. One Blooket **set per CSV** (combined worksheets share a set).
**31 sets cover 40 topics.** Paste the filled list back to me and I'll wire the URLs into
`roadmap-data.json` + regenerate `roster-server/data/blooket-lessons.json` + verify.

## Unit 4 (6 sets)
- [ ] `u4_l1_l2_blooket.csv` → 4.1, 4.2 → ______________________________
- [ ] `u4_l3_l4_l5_blooket.csv` → 4.3, 4.4, 4.5 → ______________________________
- [ ] `u4_lesson6_blooket.csv` → 4.6 → ______________________________
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

## Not backfillable (no Blooket CSV exists)
- **3.6, 3.7** — `urls.blooket` is null but there is no `u3_l6`/`u3_l7` CSV (experimental-design
  lessons). Leave null, or make the content first if you want Blookets there.

---
_Already complete (no action): U1, U2, U8, U9 all have Blooket URLs._
