// phase4-structure.test.js — Phase 4a structure + jargon-ban guard.
// Asserts the new teacher-dashboard.html exists and is structurally sane, AND
// that the new "Where you stand" block in start-here.html contains NO BKT /
// θ / probability vocabulary (GRADEBOOK_GRADING_SPEC.md §3 student guard).
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dashboardPath = resolve(repo, 'teacher-dashboard.html');
const startHerePath = resolve(repo, 'start-here.html');

const DASH = existsSync(dashboardPath) ? readFileSync(dashboardPath, 'utf8') : null;
const START = existsSync(startHerePath) ? readFileSync(startHerePath, 'utf8') : null;

// Banned vocabulary on the STUDENT-facing page (start-here.html "Where you
// stand" block only — pre-existing course-name copy elsewhere is fine).
// Case-insensitive whole-word-ish patterns.
const STUDENT_JARGON = [
  /\bBKT\b/i,
  /\btheta\b/i,
  /θ/,
  /\bpKnow\b/i,
  /\bposterior\b/i,
  /\bBayesian\b/i,
  /\bmastery probability\b/i,
  /\bweak skill\b/i,
];

// Helper: extract the "Where you stand" section + inline script from start-here.
function extractWhereYouStand(html) {
  // The section + everything after it through </body> (the inline script lives
  // at end of body and renders into #wys-status — its strings are student-facing).
  const sectionStart = html.indexOf('id="where-you-stand"');
  expect(sectionStart, 'where-you-stand section must exist').toBeGreaterThan(0);
  const bodyEnd = html.lastIndexOf('</body>');
  return html.slice(sectionStart, bodyEnd);
}

// ── teacher-dashboard.html structure ──────────────────────────────────────────
describe('teacher-dashboard.html — Phase 4a structure', () => {
  it('the file exists', () => {
    expect(DASH, 'teacher-dashboard.html must exist at repo root').toBeTypeOf('string');
  });

  it('declares it is a teacher dashboard (title)', () => {
    expect(DASH).toMatch(/<title>[^<]*teacher[^<]*dashboard/i);
  });

  it('loads roster_config.js as a sibling (single-source URL config)', () => {
    expect(DASH).toMatch(/<script\s+src=["']roster_config\.js["']/i);
  });

  it('calls BOTH /class endpoints', () => {
    expect(DASH).toMatch(/\/class\/grades/);
    expect(DASH).toMatch(/\/class\/mastery/);
  });

  it('sends the teacher-secret header on requests', () => {
    expect(DASH).toMatch(/x-teacher-secret/i);
  });

  it('NEVER persists the teacher secret (no localStorage/sessionStorage/cookie writes)', () => {
    // Allow comment-style mentions; flag actual write API calls only.
    expect(DASH).not.toMatch(/localStorage\.setItem/);
    expect(DASH).not.toMatch(/sessionStorage\.setItem/);
    expect(DASH).not.toMatch(/document\.cookie\s*=/);
  });

  it('no external CDN/script imports (self-contained)', () => {
    // Allow ONLY relative sibling script srcs (no http(s)://, no //cdn).
    const externalScript = /<script\s+[^>]*src=["'](?:https?:)?\/\//i;
    expect(DASH).not.toMatch(externalScript);
  });

  it('READ-ONLY teacher tool (no POST/PUT/DELETE fetches)', () => {
    expect(DASH).not.toMatch(/method:\s*["'](?:POST|PUT|DELETE|PATCH)["']/i);
  });
});

// ── start-here.html — "Where you stand" section + jargon ban ──────────────────
describe('start-here.html — Phase 4a student render', () => {
  it('the file exists', () => {
    expect(START, 'start-here.html must exist at repo root').toBeTypeOf('string');
  });

  it('has the new "Where you stand" section', () => {
    expect(START).toMatch(/id=["']where-you-stand["']/);
  });

  it('section is INSERTED between "How your grade actually works" and "Your summer on-ramp"', () => {
    const gradeIdx = START.indexOf('How your grade actually works');
    const wysIdx = START.indexOf('id="where-you-stand"');
    const summerIdx = START.indexOf('Your summer on-ramp');
    expect(gradeIdx).toBeGreaterThan(0);
    expect(wysIdx).toBeGreaterThan(gradeIdx);
    expect(summerIdx).toBeGreaterThan(wysIdx);
  });

  it('loads roster_config.js + roster-client.js as siblings, in correct order', () => {
    const cfg = START.indexOf('roster_config.js');
    const cli = START.indexOf('roster-client.js');
    expect(cfg).toBeGreaterThan(0);
    expect(cli).toBeGreaterThan(cfg); // config must load BEFORE client
  });

  it('reads rosterClient.token() and calls /grade (NOT /mastery — student page)', () => {
    expect(START).toMatch(/rosterClient\s*\.\s*token/);
    expect(START).toMatch(/\/grade/);
    expect(START).not.toMatch(/\/mastery/);
  });

  it('the "Where you stand" block contains NO BKT/θ/probability vocabulary (§3 guard)', () => {
    const block = extractWhereYouStand(START);
    for (const pat of STUDENT_JARGON) {
      expect(block, `student-facing jargon "${pat}" must not appear`).not.toMatch(pat);
    }
  });

  it('has a graceful signed-out stub (links back to the Desk)', () => {
    const block = extractWhereYouStand(START);
    // The fallback must offer a sign-in path; the Desk file is the auth surface.
    expect(block).toMatch(/ap_stats_roadmap_square_mode\.html/);
  });

  // Codex MAJOR / MINOR #1: pin that the additive scope didn't disturb the
  // existing semantic content. Adding .wys-* rules inside the existing <style>
  // block is the canonical single-file pattern (and explicitly allowed by the
  // build-doc prompt) — but the test must guarantee the existing SECTIONS' copy
  // and headings remain intact. If any of these strings drifts the test fails.
  it('every pre-existing section header and key copy stays present (additive-scope guard)', () => {
    const existingMarkers = [
      // Hero + "You've already started"
      '<h1>Welcome to AP Statistics</h1>',
      "You've already started",
      // Promise + Expectations
      'My promise to you',
      "What I'll ask of you",
      // Rhythm
      'The rhythm',
      'yesterday\'s Blooket',
      // Grade explanation
      'How your grade actually works',
      // Summer on-ramp (the section AFTER the new insertion)
      'Your summer on-ramp',
      // Toolkit + Desk + Trainer
      'Your toolkit',
      'The Desk',
      'TI-84 Trainer',
      'ap_stats_roadmap_square_mode.html',
      'ti84-trainer-v2/standalone.html',
    ];
    for (const marker of existingMarkers) {
      expect(START, `existing marker "${marker}" must remain present`).toContain(marker);
    }
  });

  it('only ONE new section is added (id="where-you-stand"); no other id-bearing sections appeared', () => {
    const sectionIds = [...START.matchAll(/<section\s[^>]*id=["']([^"']+)["']/gi)].map(m => m[1]);
    // The pre-existing page had no id-bearing sections; Phase 4a adds exactly one.
    expect(sectionIds).toEqual(['where-you-stand']);
  });
});
