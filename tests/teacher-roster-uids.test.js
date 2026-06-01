/**
 * tests/teacher-roster-uids.test.js
 *
 * Parse-only unit for the P4b Schoology-uid backfill CSV parser in
 * scripts/teacher-roster.mjs. No network: just verifies header detection,
 * the username/schoologyUid column split, and the empty-cell (clear) case.
 */

import { describe, it, expect, beforeAll } from 'vitest';

let parseUidRoster;

beforeAll(async () => {
  const mod = await import('../scripts/teacher-roster.mjs');
  parseUidRoster = mod.parseUidRoster;
});

describe('parseUidRoster: header detection', () => {
  it('skips a header row when the first cell is a known username column name', () => {
    const rows = parseUidRoster('username,schoologyUid\ncoconut_shark,8405518810\n');
    expect(rows).toEqual([{ username: 'coconut_shark', schoologyUid: '8405518810' }]);
  });

  it('accepts login / user / login_username as header aliases', () => {
    for (const head of ['login', 'user', 'login_username']) {
      const rows = parseUidRoster(head + ',schoologyUid\nmaple_otter,42\n');
      expect(rows).toEqual([{ username: 'maple_otter', schoologyUid: '42' }]);
    }
  });

  it('keeps the first data row when there is no header', () => {
    const rows = parseUidRoster('coconut_shark,8405518810\n');
    expect(rows).toEqual([{ username: 'coconut_shark', schoologyUid: '8405518810' }]);
  });
});

describe('parseUidRoster: column handling', () => {
  it('treats an empty schoologyUid cell as a clear request', () => {
    const rows = parseUidRoster('username,schoologyUid\nmaple_otter,\n');
    expect(rows).toEqual([{ username: 'maple_otter', schoologyUid: '' }]);
  });

  it('ignores blank lines and trims whitespace', () => {
    const rows = parseUidRoster('username,schoologyUid\n\n  coconut_shark , 999 \n');
    expect(rows).toEqual([{ username: 'coconut_shark', schoologyUid: '999' }]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseUidRoster('')).toEqual([]);
    expect(parseUidRoster('username,schoologyUid\n')).toEqual([]);
  });
});
