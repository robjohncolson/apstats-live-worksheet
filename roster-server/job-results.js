// job-results.js - POST /admin/job-result (teacher-gated) + the `jobs` field of GET /health.
//
// The teacher's machines run nightly jobs the server cannot see: the ledger snapshot
// verification (tools/nightly-backup.mjs) and the AP Classroom PC reconcile
// (tools/daily_pc_reconcile.ps1, one run per section). Each job posts its outcome here
// at the end of a run, and status.html shows the last outcome on its tiles, so a job
// that fails night after night is visible instead of silent.
//
// IN-MEMORY ONLY: a deploy or restart forgets every result, and the status tile then
// reads "unknown" (amber) until the job's next run.
//
// /health is PUBLIC. A reporter never sends free text: it sends an allowlisted outcome
// `code`, and the public message is generated here from that code. Any other field
// in the body (a `detail`, a name, a secret) is ignored and never stored.
//
//   POST /admin/job-result { job, code, breaks?, at? }
//     job:    one of KNOWN_JOBS
//     code:   one of JOB_CODES[job]
//     breaks: optional non-negative integer (snapshot verification breaks)
//     at:     optional ISO time of the run (defaults to now)
//   -> 200 { ok: true, job, result } | 400 { ok:false, error } | 401 { ok:false, error }
//
//   Stored / on /health: { ok, code, message, breaks, at, receivedAt }

import { requireTeacher } from './teacher-auth.js';

const PC_RECONCILE_CODES = {
  'ok': { ok: true, message: 'reconciled' },
  'sign-in-needed': { ok: false, message: 'SIGN IN NEEDED' },
  'page-not-ready': { ok: false, message: 'AP Classroom page not ready' },
  'post-failed': { ok: false, message: 'posting to roster failed' },
  'failed': { ok: false, message: 'failed (see the reconcile log)' },
};

// job -> code -> { ok, message }. The message is the only text /health ever shows.
export const JOB_CODES = {
  snapshot: {
    'verified': { ok: true, message: 'verified' },
    'breaks': { ok: false, message: 'verification found breaks' },
    'pull-failed': { ok: false, message: 'snapshot pull failed' },
  },
  pcReconcileB: PC_RECONCILE_CODES,
  pcReconcileE: PC_RECONCILE_CODES,
};

export const KNOWN_JOBS = Object.keys(JOB_CODES);

function cleanBreaks(breaks) {
  if (breaks === undefined || breaks === null) return null;
  const n = Number(breaks);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

function cleanAt(at, now) {
  if (typeof at !== 'string') return now;
  const ms = Date.parse(at);
  if (!Number.isFinite(ms)) return now;
  return new Date(ms).toISOString();
}

// Validate a POST body into a stored result, or { error }.
export function parseJobResult(body, now = new Date().toISOString()) {
  if (!body || typeof body !== 'object') return { error: 'body must be a JSON object' };
  if (!KNOWN_JOBS.includes(body.job)) return { error: 'unknown job (expected one of ' + KNOWN_JOBS.join(', ') + ')' };
  const codes = JOB_CODES[body.job];
  if (!Object.hasOwn(codes, body.code)) {
    return { error: 'unknown code for ' + body.job + ' (expected one of ' + Object.keys(codes).join(', ') + ')' };
  }
  const outcome = codes[body.code];
  return {
    job: body.job,
    result: {
      ok: outcome.ok,
      code: body.code,
      message: outcome.message,
      breaks: cleanBreaks(body.breaks),
      at: cleanAt(body.at, now),
      receivedAt: now,
    },
  };
}

// The in-memory store: latest result per job.
export function createJobResults() {
  const latest = new Map();
  return {
    record(job, result) { latest.set(job, result); },
    // { snapshot: {...}|null, pcReconcileB: ..., pcReconcileE: ... } for /health.
    snapshot() {
      const out = {};
      for (const job of KNOWN_JOBS) out[job] = latest.has(job) ? { ...latest.get(job) } : null;
      return out;
    },
  };
}

export function mountJobResults(app, { db, jobResults }) {
  app.post('/admin/job-result', async (req, res) => {
    if (!await requireTeacher(req, db)) {
      return res.status(401).json({ ok: false, error: 'forbidden' });
    }
    const parsed = parseJobResult(req.body);
    if (parsed.error) return res.status(400).json({ ok: false, error: parsed.error });
    jobResults.record(parsed.job, parsed.result);
    return res.json({ ok: true, job: parsed.job, result: parsed.result });
  });
}
