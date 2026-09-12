import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const manifest = JSON.parse(readFileSync('dok/manifest.json', 'utf8'));
const lessons = JSON.parse(execFileSync('python', ['-c',
  "import pathlib,yaml,json; print(json.dumps([yaml.safe_load(p.read_text(encoding='utf-8')) for p in pathlib.Path('dok/lessons').glob('*.yaml')]))"
], { encoding: 'utf8' }));

describe('Active misconception sheets', () => {
  it('requires standalone sheets with target labels and generation provenance', () => {
    expect(lessons.length).toBeGreaterThan(0);
    for (const sheet of lessons) {
      expect(sheet.standalone).toBe(true);
      expect(sheet.misconceptions.length).toBeGreaterThan(0);
      expect(sheet.misconceptions.every(key => typeof key === 'string' && key.trim())).toBe(true);
      expect(sheet.generated.by).toBeTruthy();
      expect(sheet.generated.on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(sheet.generated.window_days).toBeGreaterThan(0);
      expect(manifest[sheet.topic].misconceptions).toEqual(sheet.misconceptions);
      expect(manifest[sheet.topic].generated).toEqual(sheet.generated);
    }
    expect(Object.keys(manifest).sort()).toEqual(lessons.map(sheet => sheet.topic).sort());
  });
  it('retains every archived artifact and excludes calendar day groups from active sheets', () => {
    for (const [folder, extension, count] of [['lessons', '.yaml', 68], ['registry', '.jsonl', 68], ['tex', '.tex', 204], ['pdf', '.pdf', 204]]) {
      expect(readdirSync('dok/archive/' + folder).filter(file => file.endsWith(extension))).toHaveLength(count);
    }
    const schedule = JSON.parse(readFileSync('data/lesson-schedule.json', 'utf8'));
    const groups = Object.values(schedule.dayGroups).flat().map(group => group.join('+'));
    for (const sheet of lessons) expect(groups).not.toContain(sheet.topic);
    for (const file of readdirSync('dok/lessons')) {
      expect(readFileSync('dok/lessons/' + file, 'utf8')).not.toContain('dayGroups');
    }
  });
});
