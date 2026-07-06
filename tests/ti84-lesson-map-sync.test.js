// Pins roster-server/data/ti84-lesson-map.json byte-identical (modulo line
// endings) to data/ti84-lesson-map.json. The server carries its own committed
// copy because Railway deploys only roster-server/ — this test is what makes
// that copy safe: edit data/ti84-lesson-map.json, re-copy, or this fails.
// (TI84_GRADE_INTEGRATION_SPEC.md §B.1)
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('TI-84 lesson map copies stay in sync', () => {
  it('roster-server/data/ti84-lesson-map.json === data/ti84-lesson-map.json', () => {
    const canonical = readFileSync(resolve(repoRoot, 'data', 'ti84-lesson-map.json'), 'utf8');
    const served = readFileSync(resolve(repoRoot, 'roster-server', 'data', 'ti84-lesson-map.json'), 'utf8');
    expect(served.replace(/\r\n/g, '\n')).toBe(canonical.replace(/\r\n/g, '\n'));
  });

  it('the map has the expected shape (lessons: topicKey → [procedureId])', () => {
    const doc = JSON.parse(readFileSync(resolve(repoRoot, 'data', 'ti84-lesson-map.json'), 'utf8'));
    expect(doc.lessons && typeof doc.lessons).toBe('object');
    for (const [topic, procs] of Object.entries(doc.lessons)) {
      expect(topic).toMatch(/^\d+\.\d+$/);
      expect(Array.isArray(procs)).toBe(true);
      expect(procs.length).toBeGreaterThan(0);
    }
  });
});
