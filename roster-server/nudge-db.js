// nudge-db.js -- Supabase DAL for the nudges_log table (Phase 3 of
// TEACHER_STUDENT_CONSOLE_SPEC.md). Pure CRUD; no business rules.

import { createClient } from '@supabase/supabase-js';

export function createNudgesDb(client) {
  return {
    insertNudges,        // batch insert (one row per recipient)
    insertReply,         // single reply row
    listForTeacher,      // teacher viewing their sent nudges
    listForStudent,      // student viewing nudges they received
    markDelivered,       // update delivered_at for a (nudge_id, recipient) pair
    findParent,          // Codex BLOCKER fold P3: ownership check for replies
  };

  // findParent({ nudgeId, recipientUsername }) -> { data: row|null, error }
  // Used by POST /student/nudge-reply to verify the student was a delivered
  // recipient of the original teacher nudge before persisting the reply.
  async function findParent({ nudgeId, recipientUsername }) {
    return client
      .from('nudges_log')
      .select('*')
      .eq('nudge_id', nudgeId)
      .eq('recipient_username', recipientUsername)
      .eq('direction', 'teacher')
      .maybeSingle();
  }

  async function insertNudges({ nudgeId, senderUsername, recipientUsernames, text, section, deliveredUsernames }) {
    var deliveredSet = new Set(deliveredUsernames || []);
    var nowIso = new Date().toISOString();
    var rows = recipientUsernames.map(function(ru) {
      return {
        nudge_id: nudgeId,
        sender_username: senderUsername,
        recipient_username: ru,
        text: text,
        direction: 'teacher',
        section: section,
        created_at: nowIso,
        delivered_at: deliveredSet.has(ru) ? nowIso : null,
      };
    });
    return client.from('nudges_log').insert(rows).select('*');
  }

  async function insertReply({ parentNudgeId, senderUsername, recipientUsername, text, section }) {
    var nowIso = new Date().toISOString();
    return client.from('nudges_log').insert({
      nudge_id: parentNudgeId + ':reply:' + Date.now(),
      parent_nudge_id: parentNudgeId,
      sender_username: senderUsername,
      recipient_username: recipientUsername,
      text: text,
      direction: 'student',
      section: section,
      created_at: nowIso,
      delivered_at: nowIso,  // student replies are sent live; delivery confirmed if teacher online
    }).select('*').single();
  }

  async function listForTeacher({ senderUsername, section, limit = 50 }) {
    return client
      .from('nudges_log')
      .select('*')
      .eq('sender_username', senderUsername)
      .eq('section', section)
      .order('created_at', { ascending: false })
      .limit(limit);
  }

  async function listForStudent({ recipientUsername, limit = 50 }) {
    return client
      .from('nudges_log')
      .select('*')
      .eq('recipient_username', recipientUsername)
      .order('created_at', { ascending: false })
      .limit(limit);
  }

  async function markDelivered({ nudgeId, recipientUsername }) {
    return client
      .from('nudges_log')
      .update({ delivered_at: new Date().toISOString() })
      .eq('nudge_id', nudgeId)
      .eq('recipient_username', recipientUsername)
      .select('*')
      .single();
  }
}

export function createLiveNudgesDb() {
  var url = process.env.ROSTER_SUPABASE_URL;
  var key = process.env.ROSTER_SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  var client = createClient(url, key);
  return createNudgesDb(client);
}
