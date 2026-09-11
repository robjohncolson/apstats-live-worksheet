// frq-status-clarity.test.js -- W2.7 rollout coverage (scripts/wire-frq-status-clarity.mjs).
// Every live worksheet carries the clarified FRQ status wording and the toast note, none
// carries the old wording, and the codemod is idempotent on the applied tree.
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyEdits, MARKER } from '../scripts/wire-frq-status-clarity.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = readdirSync(ROOT).filter((f) => /^u\d+_lesson.+_live\.html$/.test(f)).sort();

describe('W2.7 FRQ status clarity — every worksheet', () => {
  it('covers the whole worksheet family', () => { expect(FILES.length).toBe(69); });
  for (const f of FILES) {
    it(f + ' carries the clarified wording, the sent-for-grading toast, and no stale copy', () => {
      const html = readFileSync(resolve(ROOT, f), 'utf8');
      expect(html).toContain(MARKER);
      expect(html).toContain("I: 'I (no credit yet)'");
      expect(html).toContain("'Still missing: '");
      expect(html).toContain('a regrade never lowers your score');
      expect(html).toContain('sent for grading — results appear under each box in ~10 s');
      expect(html).toContain("liveHost.querySelector('.ai-feedback')");
      expect(html).not.toContain("I (not yet)");
      expect(html).not.toContain('regrading only ever raises your score');
      expect(applyEdits(html).reason).toBe('already applied');
    });
  }
});
