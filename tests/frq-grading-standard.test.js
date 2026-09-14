// frq-grading-standard.test.js — every follow-along reflection prompt carries the
// softened GRADING STANDARD (scripts/wire-frq-grading-standard.mjs, 2026-09-14)
// and no longer frames its element list as "required for E".
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyGradingStandard, GRADING_STANDARD } from '../scripts/wire-frq-grading-standard.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const FILES = readdirSync(ROOT)
  .filter((name) => /^ai-grading-prompts.*\.js$/.test(name) && name !== 'ai-grading-prompts-study-guide.js')
  .sort();

describe('FRQ grading standard wiring', () => {
  it('covers every follow-along prompt file (69 worksheets + variants)', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(69);
    for (const name of FILES) {
      const source = readFileSync(resolve(ROOT, name), 'utf8');
      expect(source, name).toContain('GRADING STANDARD (read before scoring)');
      expect(source, name).toContain('If you are torn between two scores, give the higher one.');
      expect(source, name).not.toMatch(/REQUIRED ELEMENTS \(must address for E/);
      expect(source, name).not.toMatch(/Required Elements \(must be present for full credit\)/);
    }
  });

  it('the standard block is template-literal safe (no backticks or ${ interpolation)', () => {
    expect(GRADING_STANDARD).not.toMatch(/[`]|\$\{/);
  });

  it('the codemod is idempotent', () => {
    const source = readFileSync(resolve(ROOT, FILES[0]), 'utf8');
    const again = applyGradingStandard(source);
    expect(again.changed).toBe(false);
    expect(again.source).toBe(source);
  });

  it('the codemod rewrites each known template variant exactly once', () => {
    const variants = [
      'x\nREQUIRED ELEMENTS (must address for E score):\n1. a\n\nGrade this response and provide:\n',
      'x\n## Required Elements (must be present for full credit)\n- a\n\nGrade the student\'s response. Return JSON:\n',
      'x\n## Expected Elements\n- a\n\nGrade this response using the E/P/I scoring system. Be generous but accurate.\n',
      'x\nREQUIRED ELEMENTS (must address for E):\n1. a\n\nGrade the response as E, P, or I. Be encouraging but accurate. More.\n',
    ];
    for (const input of variants) {
      const out = applyGradingStandard(input);
      expect(out.changed).toBe(true);
      expect(out.source.split('GRADING STANDARD (read before scoring)').length).toBe(2);
      expect(out.source).not.toMatch(/must address for E|must be present for full credit/);
    }
  });
});
