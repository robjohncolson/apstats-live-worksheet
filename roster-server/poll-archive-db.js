// poll-archive-db.js -- data-access wrapper for poll_archive around
// @supabase/supabase-js. Injectable for tests: call createPollArchiveDb(client)
// with a real or fake client. server.js calls createLivePollArchiveDb() to get
// the production instance.
//
// Until migrations/0007_poll_archive.sql is run on the curriculum_render
// Supabase project, every query here returns
// { data: null, error: { code: '42P01', ... } } -- the route module converts
// that into a 503 "poll_archive not provisioned -- run migration 0007" response.

import { createClient } from '@supabase/supabase-js';

// ── Real Supabase DB ──────────────────────────────────────────────────────────

export function createLivePollArchiveDb() {
  const url = process.env.ROSTER_SUPABASE_URL;
  const key = process.env.ROSTER_SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error('ROSTER_SUPABASE_URL and ROSTER_SUPABASE_SERVICE_KEY must be set');
  }

  const client = createClient(url, key);
  return createPollArchiveDb(client);
}

// ── Thin wrapper (accepts any Supabase-compatible client) ─────────────────────

export function createPollArchiveDb(client) {
  return {
    insertPollArchive,
    listPollArchive,
    deletePollArchive,
  };

  // Insert a poll_archive row, idempotent via ON CONFLICT (poll_id) DO NOTHING
  // -- a Supabase upsert with ignoreDuplicates. A duplicate poll_id is silently
  // skipped with NO error, so a re-POST of the same closed poll is a no-op
  // success. Returns { data, error }.
  async function insertPollArchive({ pollId, section, pollDate, question, options, tally, blind }) {
    return client
      .from('poll_archive')
      .upsert([{
        poll_id:   pollId ?? null,
        section:   section,
        poll_date: pollDate,
        question:  question,
        options:   Array.isArray(options) ? options : [],
        tally:     Array.isArray(tally) ? tally : [],
        blind:     !!blind,
      }], { onConflict: 'poll_id', ignoreDuplicates: true });
  }

  // List archived polls for a section, optionally filtered to a specific date.
  // Ordered by poll_date then created_at (ascending within a day, oldest first).
  // Returns { data, error } -- data is an array of rows (possibly empty).
  async function listPollArchive(section, date) {
    let q = client
      .from('poll_archive')
      .select('*')
      .eq('section', section);

    if (date) {
      q = q.eq('poll_date', date);
    }

    return q
      .order('poll_date', { ascending: true })
      .order('created_at', { ascending: true });
  }

  // Delete a poll_archive row by id.
  // Returns { data, error } -- idempotent (ok if row was absent).
  async function deletePollArchive(id) {
    return client
      .from('poll_archive')
      .delete()
      .eq('id', id);
  }
}
