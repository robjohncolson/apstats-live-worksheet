-- USER-RUN: quiz retry explanation (QUIZ_FIRST_ANSWER_SPEC v2, 2026-09-29).
-- A wrong first curriculum_quiz answer allows one retry (attempt 2) that must carry the
-- student's explanation of the change of mind. The server retries inserts WITHOUT this
-- column until it exists, so running this late loses only the explanation text.
alter table item_ledger add column if not exists reasoning text null;
