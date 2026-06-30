// desk-nightly-review.test.js — pins the Desk Nightly Review surface (NIGHTLY_REVIEW_SPEC
// Phases 2-3). Source-level structure guards (mirrors desk-update-nudge.test.js): the menu
// item + badge, the overlay, the queue/mark functions, the teacher token auth, and the
// student My Ledger "seen / comment" badge wiring.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DESK = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'ap_stats_roadmap_square_mode.html'), 'utf8');

describe('Desk — Nightly Review teacher surface (Phase 2)', () => {
  it('adds a Teacher-menu item with an unseen badge', () => {
    expect(DESK).toMatch(/openNightlyReview\(\)/);
    expect(DESK).toMatch(/id="menu-review-badge"\s+class="menu-nudge-badge"\s+hidden/);
  });
  it('has the Nightly Review overlay window', () => {
    expect(DESK).toMatch(/id="app-nightlyreview-overlay"/);
    expect(DESK).toMatch(/id="nightlyreview-content"/);
    expect(DESK).toMatch(/onclick="closeNightlyReview\(\)"/);
  });
  it('defines the queue + mark + badge functions', () => {
    for (const fn of ['function openNightlyReview', 'function _reviewFetchQueue', 'function _paintReviewQueue',
                      'async function _reviewMark', 'async function _reviewBadgePoll', 'function _reviewEditTemplates']) {
      expect(DESK, `missing ${fn}`).toContain(fn);
    }
  });
  it('the queue + mark calls hit /class/review-queue and /class/review with a Bearer token', () => {
    expect(DESK).toMatch(/\/class\/review-queue/);
    expect(DESK).toMatch(/fetch\(cfg\.base \+ '\/class\/review'/);
    expect(DESK).toMatch(/Authorization: 'Bearer ' \+ cfg\.token/);
  });
  it('exposes a Nightly Review tile in the teacher tools and polls the badge on role change', () => {
    expect(DESK).toMatch(/label: 'Nightly Review'/);
    expect(DESK).toMatch(/_reviewBadgePoll\(\);/);
  });
  it('comment templates persist in localStorage with seeded defaults', () => {
    expect(DESK).toMatch(/desk_review_templates_v1/);
    expect(DESK).toMatch(/'Nice work!', 'Show your steps', 'See me', 'Great improvement'/);
  });
});

describe('Desk — student My Ledger review badge (Phase 3)', () => {
  it('loads the student\'s own review marks (students only, not teacher/view-as)', () => {
    expect(DESK).toMatch(/async function _loadReviewMarksForSelf/);
    expect(DESK).toMatch(/who\.role === 'teacher'/);                       // skip for teacher/view-as
    expect(DESK).toMatch(/'\/ledger\/student\/' \+ encodeURIComponent\(sid\)/);
  });
  it('renders a "Seen by teacher" badge in the receipt row from _reviewByItem', () => {
    expect(DESK).toMatch(/_reviewByItem\[String\(r\.i \|\| payload\.i \|\| ''\)\]/);
    expect(DESK).toMatch(/👁 Seen by teacher/);
  });
});
