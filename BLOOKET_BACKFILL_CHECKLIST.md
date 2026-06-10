# Blooket backfill checklist — due by Q2 start (2026-11-14)

**Why:** a topic's Blooket only counts toward the v3 Blooket track once a live set URL
(`https://dashboard.blooket.com/set/<id>`) reaches Supabase `lesson_urls.blooket_url` (the live
source the Desk overlays at runtime) and is propagated into `roadmap-data.json` +
`roster-server/data/blooket-lessons.json`.

## ✅ Done — 69 of 77 topics live (as of 2026-06-04)
- **U1, U2, U8, U9** — already had URLs.
- **3.6, 3.7 + 4.1–4.6** — mined from `units.js` (2026-06-04).
- **5.3–5.8, 6.1–6.11, 7.1–7.9** — mined from the live Supabase `lesson_urls` overlay (2026-06-04, s5)
  and wired through the full static pipeline (`9bd9345`).

## 🔲 Remaining: 8 per-topic sets — CSVs READY (35 questions each, built 2026-06-09)

Each topic now has its own import-ready CSV in the repo root. Import each into Blooket,
then paste the set URL after the `→`.

- [ ] `u4_l7_blooket.csv` → 4.7 (Intro to Random Variables & Probability Distributions) → ______________________________
- [ ] `u4_l8_blooket.csv` → 4.8 (Mean & SD of Random Variables) → ______________________________
- [ ] `u4_l9_blooket.csv` → 4.9 (Combining Random Variables) → ______________________________
- [ ] `u4_l10_blooket.csv` → 4.10 (Intro to the Binomial Distribution) → ______________________________
- [ ] `u4_l11_blooket.csv` → 4.11 (Parameters for a Binomial Distribution) → ______________________________
- [ ] `u4_l12_blooket.csv` → 4.12 (The Geometric Distribution) → ______________________________
- [ ] `u5_l1_blooket.csv` → 5.1 (Why Is My Sample Not Like Yours?) → ______________________________
- [ ] `u5_l2_blooket.csv` → 5.2 (The Normal Distribution, Revisited) → ______________________________

**Import — automated (preferred).** The Agent repo already has a Blooket uploader
(`Agent/scripts/upload-blooket.mjs`, Playwright-over-CDP using your logged-in Edge session),
and the 8 new files match its `u{unit}_l{lesson}_blooket.csv` auto-detect naming exactly.
On the machine where you run lesson-prep (Edge logged into Blooket):
1. `git pull` in the `apstats-live-worksheet` clone (gets the 8 CSVs).
2. `scripts/start-edge-debug.cmd` (Edge with remote debugging).
3. Run, one per set: `node scripts/upload-blooket.mjs --unit 4 --lesson 7` (then `--lesson 8`
   … `--lesson 12`, and `--unit 5 --lesson 1`, `--unit 5 --lesson 2`). Each creates the set,
   captures the URL, and records it in `lesson-registry.json` + `state/blooket-uploads.json`.
4. Ping CC → I upsert the URLs into Supabase `lesson_urls` (the live source the Desk overlays),
   write `urls.blooket` into `roadmap-data.json`, regenerate
   `roster-server/data/blooket-lessons.json` (69 → 77 topics), verify, and commit both repos.
   Only after that does the v3 engine count these topics' Blooket scores.

**Import — manual fallback:** download the CSV
(`https://robjohncolson.github.io/apstats-live-worksheet/<filename>`), then on
`dashboard.blooket.com` → **Create a Set** → **Import Questions → Spreadsheet** → upload →
save → copy the set URL into the list above and ping CC (same step 4 as above).

**Notes**
- These per-topic files **supersede the old grouped CSVs** (`u4_l7_l8_blooket.csv`,
  `u4_l10_l11_l12_blooket.csv`, `u5_l1_l2_blooket.csv`) — the grouped files remain in the repo
  for history but should **not** be imported.
- `u4_l9_blooket.csv` was refreshed in place (trimmed 60 → best 35).
- Provenance (2026-06-09): hybrid build — every existing question audited per topic
  (keep / fix / drop), gaps filled with new questions grounded in the lesson transcripts,
  each set adversarially verified (all math recomputed, ambiguous distractors rewritten),
  plus a cross-set duplicate sweep between sibling topics.
