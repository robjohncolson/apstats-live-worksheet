// Promise ledger for the nightly class briefs (AP Statistics B/E here; Algebra 2 C/D/G through
// ../algebra2-live-worksheet/scripts/carried-promises.mjs, which imports this file).
//
// The Class Log summaries list "Promises made" per recorded block. The ledger keeps every promise
// OPEN, block after block, until the teacher marks it kept or dropped. Plain JSON, no dependencies,
// no network, no AI call. The ledger file lives in gitignored roster-local/brief/promises.json.
//
// Entry shape:
//   { id, course, section, text, firstDate, dates: [YYYY-MM-DD...], state: 'open'|'kept'|'dropped',
//     closedOn: YYYY-MM-DD|null, upstreamMissing: boolean, importedFrom?: 'server:<status>' }
//
// Rules:
//   - id = <firstDate>-<section>-<8 hex of sha1(normalized text)>. Stable across reruns.
//   - The same promise said again (same section, same normalized text) while it is open adds the new
//     date to `dates`; it does not make a second entry. Said again after it was closed = a new entry.
//   - Merging is idempotent: rerunning over the same summaries never changes state or deletes entries.
//   - upstreamMissing = every date of the entry has a summary in the index, and none of those summaries
//     still lists the text (the summary was re-pulled with new wording). Shown in the brief; never deleted.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const STATES = ['open', 'kept', 'dropped'];

const EMPTY_PROMISE = /^(?:none|n\/a|no promises(?: (?:made|recorded))?)[.!]?$/i;

export function normalizeText(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().replace(/[.!;,]+$/, '').toLowerCase();
}

export function cleanText(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

export function promiseId(date, section, text) {
  const hash = createHash('sha1').update(normalizeText(text)).digest('hex').slice(0, 8);
  return `${date}-${section}-${hash}`;
}

export function emptyLedger() {
  return { schemaVersion: 1, promises: [] };
}

// A missing or unreadable file is an empty ledger (a corrupt file is renamed aside, never lost).
export function loadLedger(path) {
  if (!existsSync(path)) return emptyLedger();
  const text = readFileSync(path, 'utf8');
  try {
    const ledger = JSON.parse(text);
    if (!ledger || !Array.isArray(ledger.promises)) throw new Error('no promises array');
    return ledger;
  } catch (error) {
    const aside = `${path}.corrupt-${Date.now()}`;
    renameSync(path, aside);
    console.error(`promise-ledger: ${path} unreadable (${error.message}); moved to ${aside}, starting empty`);
    return emptyLedger();
  }
}

export function saveLedger(path, ledger) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(ledger, null, 2) + '\n');
  renameSync(tmp, path);
}

// Promise texts of one summary, cleaned, without "none" placeholders.
function promisesOf(summary) {
  const list = Array.isArray(summary?.promises) ? summary.promises : [];
  return list.filter(raw => typeof raw === 'string').map(cleanText).filter(text => text && !EMPTY_PROMISE.test(text));
}

// Folds every summary (any order) into the ledger. Returns the same ledger object, mutated.
// `sections` limits which sections are read (e.g. ['B', 'E']).
export function mergeSummaries(ledger, summaries, { course, sections }) {
  const sorted = (summaries || [])
    .filter(s => s && sections.includes(s.section) && (!course || !s.course || s.course === course))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.section.localeCompare(b.section));

  for (const summary of sorted) {
    for (const text of promisesOf(summary)) addPromise(ledger, { course, section: summary.section, date: summary.date, text });
  }
  markUpstreamMissing(ledger, sorted);
  return ledger;
}

function addPromise(ledger, { course, section, date, text }) {
  const norm = normalizeText(text);
  const same = ledger.promises.filter(p => p.section === section && normalizeText(p.text) === norm);

  // Already folded in (a rerun): nothing to do.
  if (same.some(p => p.dates.includes(date))) return;

  // Said again while still open: one entry, one more date.
  const open = same.find(p => p.state === 'open');
  if (open) { addDate(open, date); return; }

  // A late-pulled summary dated on or before the close: it belongs to the closed entry.
  const closedLater = same.find(p => p.closedOn && date <= p.closedOn);
  if (closedLater) { addDate(closedLater, date); return; }

  ledger.promises.push({
    id: promiseId(date, section, text), course: course || null, section, text,
    firstDate: date, dates: [date], state: 'open', closedOn: null, upstreamMissing: false,
  });
}

function addDate(entry, date) {
  entry.dates = [...entry.dates, date].sort();
  if (date < entry.firstDate) entry.firstDate = date;
}

function markUpstreamMissing(ledger, summaries) {
  const byKey = new Map(summaries.map(s => [`${s.date}|${s.section}`, s]));
  for (const entry of ledger.promises) {
    const sources = entry.dates.map(date => byKey.get(`${date}|${entry.section}`));
    if (sources.some(s => !s)) { entry.upstreamMissing = false; continue; }
    const norm = normalizeText(entry.text);
    entry.upstreamMissing = !sources.some(s => promisesOf(s).some(t => normalizeText(t) === norm));
  }
}

// Sets one promise's state. Returns the entry. Throws on an unknown id or state.
export function setState(ledger, id, state, today) {
  if (!STATES.includes(state)) throw new Error(`state must be one of ${STATES.join(', ')}`);
  const entry = ledger.promises.find(p => p.id === id);
  if (!entry) throw new Error(`no promise with id ${id}`);
  entry.state = state;
  entry.closedOn = state === 'open' ? null : today;
  return entry;
}

// Drops every OPEN promise first said before `date` (optionally one section). Returns the count.
export function dropBefore(ledger, date, today, section = null) {
  let count = 0;
  for (const entry of ledger.promises) {
    if (entry.state !== 'open' || entry.firstDate >= date) continue;
    if (section && entry.section !== section) continue;
    entry.state = 'dropped';
    entry.closedOn = today;
    count++;
  }
  return count;
}

// Open promises of a section, oldest first.
export function openFor(ledger, section) {
  return ledger.promises
    .filter(p => p.section === section && p.state === 'open')
    .sort((a, b) => a.firstDate.localeCompare(b.firstDate) || a.id.localeCompare(b.id));
}

// Whole days from `from` to `to` (both YYYY-MM-DD).
export function daysBetween(from, to) {
  return Math.round((Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 86400000);
}

// One Markdown bullet for an open promise.
export function promiseLine(entry, today) {
  const repeats = entry.dates.length > 1 ? `; said again ${entry.dates.slice(1).join(', ')}` : '';
  const missing = entry.upstreamMissing ? '; wording changed upstream, drop it if it is a duplicate' : '';
  return `- ${entry.text} (first said ${entry.firstDate}, ${daysBetween(entry.firstDate, today)} days open${repeats}${missing}) \`${entry.id}\``;
}

// ---------- the brief's 14-day window ----------

export const RECENT_DAYS = 14;

// The most recent date the promise was said. `dates` is kept sorted ascending (see addDate), so it
// is the last one; an entry without dates falls back to firstDate.
function lastSaid(entry) {
  const dates = entry.dates || [];
  return dates.length ? dates[dates.length - 1] : entry.firstDate;
}

// Splits open promises into those last said in the last `days` calendar days (shown in full in the
// brief) and older ones (one summary line; `--list` shows them). A promise repeated lately is recent.
export function splitByAge(open, today, days = RECENT_DAYS) {
  const cutoff = new Date(Date.parse(today + 'T12:00:00Z') - days * 86400000).toISOString().slice(0, 10);
  return {
    recent: open.filter(p => lastSaid(p) > cutoff),
    older: open.filter(p => lastSaid(p) <= cutoff),
  };
}

// The brief's promise section body: recent ones in full, older ones as one line.
export function promiseSectionLines(open, today, listCommand) {
  if (!open.length) return ['- None open.'];
  const { recent, older } = splitByAge(open, today);
  const lines = recent.map(entry => promiseLine(entry, today));
  if (!recent.length) lines.push(`- None said in the last ${RECENT_DAYS} days.`);
  if (older.length) lines.push(`- ${older.length} older open promise${older.length === 1 ? '' : 's'} (last said ${RECENT_DAYS}+ days ago); list with \`${listCommand}\``);
  return lines;
}

// ---------- one-time import of the a2 roster-server's commitment states ----------

// The a2 roster-server keeps its own commitment ledger (GET /teacher/commitments, statuses
// open|done|deferred|cancelled). Server done -> kept; cancelled or deferred -> dropped. Only OPEN local
// entries that were never imported change (idempotent; a teacher's own local close always wins).
const SERVER_TO_LOCAL = { done: 'kept', cancelled: 'dropped', deferred: 'dropped' };

export function applyServerStates(ledger, rows, today) {
  let changed = 0;
  for (const row of rows || []) {
    const state = SERVER_TO_LOCAL[row?.status];
    if (!state || row.kind !== 'promise' || typeof row.text !== 'string') continue;
    const norm = normalizeText(row.text);
    for (const entry of ledger.promises) {
      if (entry.section !== row.section || entry.state !== 'open' || entry.importedFrom) continue;
      if (normalizeText(entry.text) !== norm) continue;
      entry.state = state;
      entry.closedOn = today;
      entry.importedFrom = `server:${row.status}`;
      changed++;
    }
  }
  return changed;
}

// Read-only GET of the server's commitments for each section, with the teacher secret resolved
// exactly as the a2 scripts do (a2 roster-server/.env, never printed). Never throws: returns
// { rows, errors }.
export async function fetchServerCommitments({ a2Root, course, sections, fetchImpl = fetch }) {
  const rows = [];
  const errors = [];
  let secret;
  let server;
  try {
    const helper = await import(pathToFileURL(resolve(a2Root, 'scripts/a2-daily-engagement.mjs')).href);
    secret = helper.resolveTeacherSecret(a2Root);
    server = helper.resolveUrl('');
  } catch (error) {
    return { rows, errors: [`a2 checkout helper unavailable (${error.message})`] };
  }
  if (!secret) return { rows, errors: ['no teacher secret in the a2 roster-server/.env or environment'] };
  for (const section of sections) {
    try {
      const query = new URLSearchParams({ course, section });
      const response = await fetchImpl(`${server}/teacher/commitments?${query}`, { headers: { 'x-teacher-secret': secret } });
      if (!response.ok) { errors.push(`${section}: HTTP ${response.status}`); continue; }
      const body = await response.json();
      for (const row of body.commitments || []) rows.push({ ...row, section: row.section || section });
    } catch (error) {
      errors.push(`${section}: ${error.message}`);
    }
  }
  return { rows, errors };
}
