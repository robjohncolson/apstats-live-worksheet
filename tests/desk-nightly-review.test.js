// desk-nightly-review.test.js — retirement pin for the Desk Nightly Review surface
// (NIGHTLY_REVIEW_SPEC Phases 2-3). The in-Desk review window, its painters, the
// legacy openNightlyReview() alias, and the My Ledger "Seen by teacher" mark-seen
// badge are retired (Teacher workspace's Recent work view replaced the window, and
// mark-seen was deprecated). Still live and pinned here: the shared roster token
// helper _reviewCfg (used by Class Snapshot and Teacher Inbox).

import { describe, it, expect } from 'vitest';
import { deskSource, deskHtml, fnBody } from './helpers/desk-source.js';

const DESK = deskHtml();
const DESK_SRC = deskSource(); // the Desk's JS incl. js/desk-*.js modules: code pins read this

describe('Desk — Nightly Review & mark-seen retirement', () => {
  it('routes the menu entry to Teacher workspace Recent work with no review badge', () => {
    expect(DESK).toContain("openTeacherTools('recent')");
    expect(DESK).not.toContain('id="menu-review-badge"');
  });
  it('keeps the retired review window, opener alias, painters, and mark-seen badge gone', () => {
    expect(DESK).not.toContain('app-nightlyreview-overlay');
    expect(DESK).not.toContain('Seen by teacher');
    // Both the page and its js/desk-*.js modules: a retired helper brought back inside a module must fail too.
    for (const name of ['openNightlyReview', 'closeNightlyReview', '_reviewRefresh', '_paintReviewQueue',
                        '_paintReviewByItem', '_reviewMark', '_reviewDraftForItem', '_reviewBadgePoll',
                        '_loadReviewMarksForSelf', '_reviewByItem']) {
      expect(DESK, `${name} is back`).not.toMatch(new RegExp('\\b' + name + '\\b'));
      expect(DESK_SRC, `${name} is back in a module`).not.toMatch(new RegExp('\\b' + name + '\\b'));
    }
  });
  it('keeps _reviewCfg: the Class Snapshot and the Teacher Inbox read the roster token through it', () => {
    const body = fnBody('_reviewCfg');
    expect(body).toContain('window.rosterClient.token()');
    expect(body).toContain('window.ROSTER_SERVICE_URL');
  });
});
