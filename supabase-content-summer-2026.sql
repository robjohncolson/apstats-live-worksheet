-- supabase-content-summer-2026.sql
-- Generated: 2026-05-15T13:58:15
-- Source:    curriculum_render/data/units.js
-- Script:    apstats-live-worksheet/scripts/build-summer-inserts.py
--
-- Idempotent upsert of `lesson_urls` for Unit 1 (1.1-1.10),
-- Unit 2 (2.1-2.9), Unit 3 (3.1-3.5), and Progress Checks 1.PC/2.PC/3.PC.
--
-- Apply with:
--   psql "$SUPABASE_DB_URL" -f supabase-content-summer-2026.sql
-- or paste into the Supabase SQL editor.
--
-- topic_schedule rows are intentionally NOT generated here; the teacher will
-- enter dates manually once the school calendar is finalized.

insert into lesson_urls (topic, worksheet_url, drills_url, quiz_url, blooket_url) values
  ('1.1', NULL, NULL, NULL, NULL),
  ('1.2', NULL, NULL, 'https://robjohncolson.github.io/curriculum_render/?u=1&l=2', NULL),
  ('1.3', NULL, NULL, 'https://robjohncolson.github.io/curriculum_render/?u=1&l=3', NULL),
  ('1.4', NULL, NULL, 'https://robjohncolson.github.io/curriculum_render/?u=1&l=4', NULL),
  ('1.5', NULL, NULL, 'https://robjohncolson.github.io/curriculum_render/?u=1&l=5', NULL),
  ('1.6', NULL, NULL, 'https://robjohncolson.github.io/curriculum_render/?u=1&l=6', NULL),
  ('1.7', NULL, NULL, 'https://robjohncolson.github.io/curriculum_render/?u=1&l=7', 'https://dashboard.blooket.com/set/68d41c5fc13a43c242c08c25'),
  ('1.8', NULL, NULL, 'https://robjohncolson.github.io/curriculum_render/?u=1&l=8', 'https://dashboard.blooket.com/set/68db421b2deaa0c87caf624c'),
  ('1.9', NULL, NULL, 'https://robjohncolson.github.io/curriculum_render/?u=1&l=9', 'https://dashboard.blooket.com/set/68dd4d2369501f061a91dbf2'),
  ('1.10', NULL, NULL, 'https://robjohncolson.github.io/curriculum_render/?u=1&l=10', 'https://dashboard.blooket.com/set/68e880c739c5e77ef8b35076'),
  ('2.1', NULL, NULL, NULL, 'https://dashboard.blooket.com/set/68f5bd1a9dcd782f18b55b5a'),
  ('2.2', NULL, NULL, 'https://robjohncolson.github.io/curriculum_render/?u=2&l=2', 'https://dashboard.blooket.com/set/68f6f23494f8196314f10603'),
  ('2.3', NULL, NULL, 'https://robjohncolson.github.io/curriculum_render/?u=2&l=3', 'https://dashboard.blooket.com/set/68f83be7f75399500ade8fe4'),
  ('2.4', NULL, NULL, 'https://robjohncolson.github.io/curriculum_render/?u=2&l=4', 'https://dashboard.blooket.com/set/68feeac79dcd782f18b6300d'),
  ('2.5', NULL, NULL, 'https://robjohncolson.github.io/curriculum_render/?u=2&l=5', 'https://dashboard.blooket.com/set/6913511ef0393fccb4307a97'),
  ('2.6', NULL, NULL, 'https://robjohncolson.github.io/curriculum_render/?u=2&l=6', 'https://dashboard.blooket.com/set/6916b5ed3cc5b74e6fe7d092'),
  ('2.7', NULL, NULL, 'https://robjohncolson.github.io/curriculum_render/?u=2&l=7', 'https://dashboard.blooket.com/set/6917667c3cc5b74e6fe7f136'),
  ('2.8', NULL, NULL, 'https://robjohncolson.github.io/curriculum_render/?u=2&l=8', 'https://dashboard.blooket.com/set/6917fa516ffd135030058b02'),
  ('2.9', NULL, NULL, 'https://robjohncolson.github.io/curriculum_render/?u=2&l=9', 'https://dashboard.blooket.com/set/6918d3f96adc1a655284eb2d'),
  ('3.1', NULL, NULL, NULL, 'https://dashboard.blooket.com/set/695b30a16b6c92373881e1e3'),
  ('3.2', NULL, NULL, 'https://robjohncolson.github.io/curriculum_render/?u=3&l=2', 'https://dashboard.blooket.com/set/695b30a16b6c92373881e1e3'),
  ('3.3', NULL, NULL, 'https://robjohncolson.github.io/curriculum_render/?u=3&l=3', 'https://dashboard.blooket.com/set/695b30a16b6c92373881e1e3'),
  ('3.4', NULL, NULL, 'https://robjohncolson.github.io/curriculum_render/?u=3&l=4', NULL),
  ('3.5', NULL, NULL, 'https://robjohncolson.github.io/curriculum_render/?u=3&l=5', 'https://dashboard.blooket.com/set/69612ff7084e6af8ddb3ea4a'),
  ('1.PC', NULL, NULL, 'https://robjohncolson.github.io/curriculum_render/?u=1&l=PC', NULL),
  ('2.PC', NULL, NULL, 'https://robjohncolson.github.io/curriculum_render/?u=2&l=PC', NULL),
  ('3.PC', NULL, NULL, 'https://robjohncolson.github.io/curriculum_render/?u=3&l=PC', NULL)
on conflict (topic) do update set
  worksheet_url = excluded.worksheet_url,
  drills_url    = excluded.drills_url,
  quiz_url      = excluded.quiz_url,
  blooket_url   = excluded.blooket_url;
