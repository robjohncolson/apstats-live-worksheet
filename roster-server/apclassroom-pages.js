// apclassroom-pages.js - AP Classroom results pages posted by an outside sender.
//
// The nightly Progress Check reconcile (tools/apclassroom_pc_reconcile.py) used to read
// AP Classroom only through a local Edge rig whose College Board session keeps expiring.
// A separate always-on agent (signed into AP Classroom in its own browser) now opens each
// assignment's results page on a schedule and posts the page's visible text here. The
// reconcile (`--pages server`) reads the texts back and feeds them to the same parsers it
// uses for a fixture. The list of pages to send is data/apclassroom-page-urls.json.
//
//   POST /admin/apclassroom-page/:assignmentId     (teacher auth OR the page key)
//     body: the page innerText as text/plain (<= 512 KB), or application/json { text }
//     :assignmentId must be 6-12 digits; the text must look like an AP Classroom table
//     ("Points Earned" or "Assessment Progress"). Latest post wins.
//     -> 200 { ok, assignmentId, bytes, receivedAt } | 400 | 401 | 413
//
//   GET /admin/apclassroom-pages?ids=a,b,c          (teacher auth)
//     -> { pages: { [id]: { text, receivedAt, bytes } } }   (ids not held are absent)
//   GET /admin/apclassroom-pages                    (teacher auth)
//     -> { pages: { [id]: { receivedAt, bytes } } }         (metadata only, no text)
//
//   GET /health gains apclassroomPages: { count, newestAt } (no ids, no text).
//
// THE PAGE KEY: the sender is a third-party agent and never holds the teacher secret.
// Env APCLASSROOM_PAGE_KEY (roster-server) is a dedicated key sent as header `x-page-key`.
// It authorizes ONLY this POST (constant-time compare); the GET routes and every other
// /admin route still require the teacher secret. With the env var unset the header path
// is disabled. The key is never logged or echoed.
//
// PRIVACY: the page text holds student names and scores. It is kept ONLY in memory (a
// deploy or restart forgets every page; the sender re-posts daily), served ONLY behind
// teacher auth, and NEVER logged. /health is public and carries a count and a time only.

import crypto from 'node:crypto';
import express from 'express';
import { requireTeacher } from './teacher-auth.js';

export const MAX_PAGE_BYTES = 512 * 1024;
export const PAGE_MARKERS = ['Points Earned', 'Assessment Progress'];

const ID_PATTERN = /^\d{6,12}$/;
const MAX_IDS_PER_GET = 100;

export function isAssignmentId(value) {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

export function looksLikeApClassroomPage(text) {
  if (typeof text !== 'string') return false;
  if (!text.trim()) return false;
  return PAGE_MARKERS.some((marker) => text.includes(marker));
}

// True when x-page-key equals APCLASSROOM_PAGE_KEY. Unset or blank env -> always false.
// Both sides are hashed to a fixed length first, so the compare time does not depend
// on either length (and timingSafeEqual never throws on unequal lengths).
export function pageKeyMatches(req) {
  const expected = (process.env.APCLASSROOM_PAGE_KEY || '').trim();
  if (!expected) return false;
  const provided = req.get('x-page-key');
  if (typeof provided !== 'string' || !provided) return false;
  const a = crypto.createHash('sha256').update(provided, 'utf8').digest();
  const b = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

// The POST accepts the page key or a teacher; nothing else accepts the page key.
async function canPostPage(req, db) {
  if (pageKeyMatches(req)) return true;
  return requireTeacher(req, db);
}

// The page text from a parsed body: a string (text/plain) or { text } (JSON).
function bodyText(body) {
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object' && typeof body.text === 'string') return body.text;
  return '';
}

// Validate one POST into { text, bytes } or { status, error }.
export function parsePagePost(assignmentId, body) {
  if (!isAssignmentId(assignmentId)) return { status: 400, error: 'assignmentId must be 6-12 digits' };
  const text = bodyText(body);
  if (!text.trim()) return { status: 400, error: 'empty page text' };
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > MAX_PAGE_BYTES) return { status: 413, error: 'page text over 512 KB' };
  if (!looksLikeApClassroomPage(text)) {
    return { status: 400, error: 'not an AP Classroom results page (no "Points Earned" or "Assessment Progress")' };
  }
  return { text, bytes };
}

// The in-memory store: latest page per assignment id.
export function createApclassroomPages() {
  const latest = new Map();
  return {
    record(assignmentId, text, bytes, receivedAt = new Date().toISOString()) {
      const page = { assignmentId, text, receivedAt, bytes };
      latest.set(assignmentId, page);
      return page;
    },
    // Full pages (with text) for the requested ids that are held.
    pagesFor(ids) {
      const out = {};
      for (const id of ids) {
        const page = latest.get(id);
        if (!page) continue;
        out[id] = { text: page.text, receivedAt: page.receivedAt, bytes: page.bytes };
      }
      return out;
    },
    // Metadata (no text) for every held page.
    metadata() {
      const out = {};
      for (const [id, page] of latest) out[id] = { receivedAt: page.receivedAt, bytes: page.bytes };
      return out;
    },
    // The public /health field: a count and the newest time, nothing else.
    health() {
      let newestAt = null;
      for (const page of latest.values()) {
        if (!newestAt || page.receivedAt > newestAt) newestAt = page.receivedAt;
      }
      return { count: latest.size, newestAt };
    },
  };
}

// ?ids=a,b,c -> the valid ids, deduplicated, capped.
function parseIds(raw) {
  if (typeof raw !== 'string') return [];
  const ids = raw.split(',').map((id) => id.trim()).filter(isAssignmentId);
  return [...new Set(ids)].slice(0, MAX_IDS_PER_GET);
}

// text/plain up to the cap. A parse error answers JSON (and never echoes the body).
const parseText = express.text({ type: 'text/plain', limit: MAX_PAGE_BYTES });
function textBody(req, res, next) {
  parseText(req, res, (err) => {
    if (!err) return next();
    if (err.type === 'entity.too.large') return res.status(413).json({ ok: false, error: 'page text over 512 KB' });
    return res.status(400).json({ ok: false, error: 'unreadable body' });
  });
}

export function mountApclassroomPages(app, { db, pages }) {
  app.post('/admin/apclassroom-page/:assignmentId', async (req, res, next) => {
    if (!await canPostPage(req, db)) {
      return res.status(401).json({ ok: false, error: 'forbidden' });
    }
    return next();
  }, textBody, (req, res) => {
    const assignmentId = req.params.assignmentId;
    const parsed = parsePagePost(assignmentId, req.body);
    if (parsed.error) return res.status(parsed.status).json({ ok: false, error: parsed.error });
    const page = pages.record(assignmentId, parsed.text, parsed.bytes);
    return res.json({ ok: true, assignmentId, bytes: page.bytes, receivedAt: page.receivedAt });
  });

  app.get('/admin/apclassroom-pages', async (req, res) => {
    if (!await requireTeacher(req, db)) {
      return res.status(401).json({ ok: false, error: 'forbidden' });
    }
    if (req.query.ids === undefined) return res.json({ pages: pages.metadata() });
    return res.json({ pages: pages.pagesFor(parseIds(req.query.ids)) });
  });
}
