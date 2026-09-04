/**
 * T2 — coverage (APS_DOK_LADDER_SPEC.md §7). Every dated lesson day in
 * data/lesson-schedule.json has a dok/lessons/{topic}.yaml OR a row in dok/PENDING.md.
 * Every YAML names a focus id that exists in the registry as a DOK-3 focus row, and
 * its reinforcement ids exist. Prints the countdown so the fan-out is visible.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');
const schedule = JSON.parse(readFileSync(resolve(ROOT, 'data', 'lesson-schedule.json'), 'utf8'));
const datedTopics = Object.entries(schedule.lessons)
  .filter(([, v]) => v.periods && v.periods.B)
  .map(([k]) => k);

const yamlTopics = readdirSync(resolve(ROOT, 'dok', 'lessons'))
  .filter((f) => f.endsWith('.yaml'))
  .map((f) => f.slice(0, -5));

const pendingTopics = existsSync(resolve(ROOT, 'dok', 'PENDING.md'))
  ? [...readFileSync(resolve(ROOT, 'dok', 'PENDING.md'), 'utf8').matchAll(/^\| (\d+\.\d+) \|/gm)].map((m) => m[1])
  : [];

const registry = new Map(
  readdirSync(resolve(ROOT, 'dok', 'registry')).filter((f) => f.endsWith('.jsonl')).flatMap((f) =>
    readFileSync(resolve(ROOT, 'dok', 'registry', f), 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l)),
  ).map((r) => [r.id, r]),
);

// Minimal YAML reads — the lesson files are flat enough that a scalar grab is reliable.
function yamlScalar(text, key) {
  const m = text.match(new RegExp(`^${key}:\\s*"?([^"\\n#]+)"?`, 'm'));
  return m ? m[1].trim() : null;
}
function yamlList(text, key) {
  const m = text.match(new RegExp(`^${key}:\\s*\\[([^\\]]*)\\]`, 'm'));
  return m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
}

describe('DOK ladder coverage', () => {
  it('every dated lesson day is either built or listed in dok/PENDING.md', () => {
    const covered = new Set([...yamlTopics, ...pendingTopics]);
    const missing = datedTopics.filter((t) => !covered.has(t));
    const built = datedTopics.filter((t) => yamlTopics.includes(t)).length;
    console.log(`DOK ladders: ${built}/${datedTopics.length} built, ${pendingTopics.length} pending`);
    expect(missing, 'add a YAML or a PENDING.md row for: ' + missing.join(', ')).toEqual([]);
  });

  it('a built topic is not also listed as pending', () => {
    const both = yamlTopics.filter((t) => pendingTopics.includes(t));
    expect(both, 'remove from dok/PENDING.md: ' + both.join(', ')).toEqual([]);
  });

  it.each(yamlTopics)('dok/lessons/%s.yaml points at a DOK-3 focus row and real reinforcement ids', (topic) => {
    const text = readFileSync(resolve(ROOT, 'dok', 'lessons', `${topic}.yaml`), 'utf8');
    expect(yamlScalar(text, 'topic')).toBe(topic);
    const focus = yamlScalar(text, 'focus');
    expect(focus, 'focus is required — every lesson carries a DOK-3 (spec §1.3)').toBeTruthy();
    const row = registry.get(focus);
    expect(row, `focus id ${focus} missing from registry`).toBeTruthy();
    expect(row.role).toBe('focus');
    expect(row.dok).toBe(3);
    expect(row.topic).toBe(topic);
    for (const rid of yamlList(text, 'reinforcement')) expect(registry.has(rid), `reinforcement ${rid}`).toBe(true);
    expect(yamlScalar(text, 'worksheet')).toMatch(/^u\d+_lesson.+_live\.html$/);
    expect(existsSync(resolve(ROOT, yamlScalar(text, 'worksheet'))), 'worksheet file exists').toBe(true);
  });

  it.each(yamlTopics)('dok/pdf/aps_%s_{student,board,teacher}.pdf are committed', (topic) => {
    for (const ed of ['student', 'board', 'teacher']) {
      expect(existsSync(resolve(ROOT, 'dok', 'pdf', `aps_${topic}_${ed}.pdf`)), `${ed} pdf`).toBe(true);
    }
  });
});
