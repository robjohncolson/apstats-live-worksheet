// teacher-classroom-wire-at-boot.test.js — _wireAtBoot (537fbc9a, 2026-10-22) skips a missing
// element instead of throwing. That protects boot from a trimmed fixture, but it also means a
// mistyped id would silently lose its listener in production. Pin: every id handed to
// _wireAtBoot exists in the page's own markup, and every boot-time listener goes through it.
//
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PAGE = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'teacher-classroom.html'), 'utf8');

describe('teacher-classroom.html — _wireAtBoot', () => {
  it('every wired id is an element in the markup', () => {
    const ids = [...PAGE.matchAll(/_wireAtBoot\('([^']+)'/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(14);
    for (const id of ids) {
      expect(PAGE, `#${id} is wired at boot but missing from the markup`).toMatch(new RegExp(`id="${id}"`));
    }
  });

  it('no boot-time listener bypasses the guard', () => {
    expect(PAGE).not.toMatch(/document\.getElementById\('[^']+'\)\.addEventListener\(/);
  });
});
