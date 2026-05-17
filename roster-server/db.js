// db.js — data-access wrapper around @supabase/supabase-js
// Injectable for tests: call createDb(supabaseClient) with a real or fake client.
// server.js calls createLiveDb() to get the production instance.

import { createClient } from '@supabase/supabase-js';

// ── Real Supabase DB ──────────────────────────────────────────────────────────

export function createLiveDb() {
  const url = process.env.ROSTER_SUPABASE_URL;
  const key = process.env.ROSTER_SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error('ROSTER_SUPABASE_URL and ROSTER_SUPABASE_SERVICE_KEY must be set');
  }

  const client = createClient(url, key);
  return createDb(client);
}

// ── Thin wrapper (accepts any Supabase-compatible client) ─────────────────────

export function createDb(client) {
  return { insertRoster, findByUsername };

  // Insert a new roster row.
  // Returns { data, error } — data has student_id on success.
  async function insertRoster({ realName, section, loginUsername, passwordHash, email }) {
    return client
      .from('roster')
      .insert([{
        real_name:      realName,
        section:        section,
        login_username: loginUsername,
        password_hash:  passwordHash,
        email:          email || null
      }])
      .select('student_id, login_username, real_name, section')
      .single();
  }

  // Find a roster row by username (case-insensitive).
  // Returns { data, error } — data has student_id, password_hash, real_name, section.
  async function findByUsername(username) {
    const normalizedUsername = String(username).toLowerCase();

    return client
      .from('roster')
      .select('student_id, login_username, password_hash, real_name, section, status')
      .eq('login_username', normalizedUsername)
      .single();
  }
}
