// worksheet-revise-hint.test.js — every worksheet shows a "you can revise anytime"
// hint under the action buttons, so a completed/greyed worksheet doesn't read as
// locked. Added 2026-06-25 via scripts/wire-revise-hint.mjs.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = readdirSync(repo).filter((f) => /^u\d+_lesson.+_live\.html$/.test(f));

describe('worksheet revise hint', () => {
  it('all 69 worksheets carry the revise hint', () => {
    expect(files.length).toBe(69);
    const missing = files.filter((f) => !readFileSync(resolve(repo, f), 'utf8').includes('revise-hint'));
    expect(missing).toEqual([]);
  });

  it('the hint conveys the three key points (revisable, sign-in, AI-only-raises)', () => {
    const s = readFileSync(resolve(repo, 'u1_lesson2_live.html'), 'utf8');
    expect(s).toMatch(/change any answer/i);   // revisable
    expect(s).toMatch(/signed in/i);            // must be signed in to save
    expect(s).toMatch(/Grade with AI/);         // the only-raises path
    expect(s).toMatch(/no need to Reset/i);     // editing != reset
  });
});
