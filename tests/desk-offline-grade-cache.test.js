/**
 * OFFLINE_MODE_SPEC §4.B — offline progress cache contract pins.
 * Source-level checks (matching the desk-grade-outlook fnBody style) that the
 * /grade write-through + offline restore is wired correctly and stays additive.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const DESK = readFileSync(resolve(import.meta.dirname, '..', 'ap_stats_roadmap_square_mode.html'), 'utf8');

function fnBody(src, name) {
  const start = src.indexOf('function ' + name);
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') { depth -= 1; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('could not extract ' + name);
}

describe('offline grade cache helpers', () => {
  it('defines the three cache helpers', () => {
    expect(DESK).toMatch(/function _gradeCacheKey\s*\(/);
    expect(DESK).toMatch(/function _persistGradeCache\s*\(/);
    expect(DESK).toMatch(/function _loadGradeCache\s*\(/);
  });

  it('keys the cache by signed-in studentId and NEVER caches in view-as', () => {
    const body = fnBody(DESK, '_gradeCacheKey');
    expect(body).toContain('__VIEW_AS_STUDENT_ID__'); // view-as → null key
    expect(body).toContain('return null');
    expect(body).toContain('rosterClient.studentId');
    expect(body).toContain('apstats_grade_cache_v1:'); // studentId-scoped (no cross-student leak)
  });

  it('persist write-through and load restore are localStorage-backed + fail-safe', () => {
    expect(fnBody(DESK, '_persistGradeCache')).toMatch(/localStorage\.setItem/);
    expect(fnBody(DESK, '_loadGradeCache')).toMatch(/localStorage\.getItem/);
    // both wrapped so a storage error never breaks the grade path
    expect(fnBody(DESK, '_persistGradeCache')).toContain('catch');
    expect(fnBody(DESK, '_loadGradeCache')).toContain('catch');
  });
});

describe('renderDoNowGrades offline behavior', () => {
  const body = fnBody(DESK, 'renderDoNowGrades');

  it('write-through caches a live /grade payload', () => {
    expect(body).toContain('_persistGradeCache(data)');
  });

  it('restores from cache ONLY when offline (a thrown fetch), never on an HTTP error', () => {
    // offline flag set by the catch (thrown/unreachable fetch)
    expect(body).toMatch(/catch \(_\) \{ _gradeOffline = true; \}/);
    // restore gated on that flag
    expect(body).toMatch(/else if \(_gradeOffline\) \{ data = _loadGradeCache\(\); \}/);
    // an HTTP response that isn't ok does NOT set offline (so 401/500 behave as before)
    expect(body).toMatch(/if \(!res\) \{ _gradeOffline = true; \}\s*else if \(res\.ok\)/);
  });

  it('still bails when there is neither a live nor a cached payload', () => {
    expect(body).toContain('if (!data) return;');
  });
});
