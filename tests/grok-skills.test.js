// Pins the fixes to the Grok skills (.grok/skills): masking default, --section parsing,
// the quarter-close low-freeze check, UTF-8 python flags, and no hardcoded user paths.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SKILLS = path.resolve(import.meta.dirname, '..', '.grok', 'skills');
const read = (...parts) => fs.readFileSync(path.join(SKILLS, ...parts), 'utf8');
const PRIVACY = 'sends student names and grades to xAI';

describe('privacy warning', () => {
  for (const name of ['reminders', 'poster-scores', 'quarter-close', 'pc-frq-scoring']) {
    it(`${name}/SKILL.md warns that names go to xAI`, () => {
      expect(read(name, 'SKILL.md')).toMatch(/sends student .*xAI/);
    });
  }
  it('the three new warnings use the same sentence', () => {
    for (const name of ['reminders', 'poster-scores', 'quarter-close']) {
      expect(read(name, 'SKILL.md')).toContain(PRIVACY);
    }
  });
});

describe('masking is the default', () => {
  it('owed.mjs prints names only with --names', () => {
    const source = read('reminders', 'owed.mjs');
    expect(source).toContain("options.names ? student.name : `S${index + 1}`");
  });
  it('pc-parts.mjs prints usernames only with --names', () => {
    const source = read('pc-frq-scoring', 'pc-parts.mjs');
    expect(source).toContain("showNames ? student.username : `S${index + 1}`");
  });
  it('the skills tell Grok to use --names only to show the teacher', () => {
    expect(read('reminders', 'SKILL.md')).toMatch(/--names/);
    expect(read('pc-frq-scoring', 'SKILL.md')).toMatch(/--names/);
  });
});

describe('owed.mjs --section', () => {
  it('maps B/E in any case and keeps PeriodB/PeriodE', async () => {
    const { normalizeSection } = await import('../.grok/skills/reminders/owed.mjs');
    expect(normalizeSection('B')).toBe('PeriodB');
    expect(normalizeSection('e')).toBe('PeriodE');
    expect(normalizeSection('PeriodB')).toBe('PeriodB');
    expect(normalizeSection('PeriodE')).toBe('PeriodE');
  });
  it('rejects anything else', async () => {
    const { normalizeSection } = await import('../.grok/skills/reminders/owed.mjs');
    for (const bad of ['C', 'periodb', 'PeriodC', '', null, undefined]) {
      expect(normalizeSection(bad)).toBeNull();
    }
  });
  it('exits 2 on a bad section without calling the server', () => {
    const script = path.join(SKILLS, 'reminders', 'owed.mjs');
    const run = spawnSync(process.execPath, [script, '--section', 'X'], { encoding: 'utf8' });
    expect(run.status).toBe(2);
  });
});

describe('close-check.mjs low-freeze check', async () => {
  const check = await import('../.grok/skills/quarter-close/close-check.mjs');

  it('is import-safe (importing ran nothing)', () => {
    expect(typeof check.compareFrozenToBaseline).toBe('function');
  });

  it('picks the newest log strictly before the close date, for that section', () => {
    const files = [
      'sync-PeriodB-20261116-163001.log',
      'sync-PeriodB-20261117-163001.log',
      'sync-PeriodB-20261118-163001.log',
      'sync-PeriodE-20261117-164501.log',
      'fixture-PeriodB-Q2-20261117-163001.json',
    ];
    expect(check.newestLogBefore(files, 'PeriodB', '2026-11-18').file).toBe('sync-PeriodB-20261117-163001.log');
    expect(check.newestLogBefore(files, 'PeriodB', '2026-11-16')).toBeNull();
  });

  it('reads the official table and ignores NUL bytes and the rows after "wrote"', () => {
    const log = [
      '[16:30:08] [Q2] STEP 3',
      'PeriodB  official Quarter 2 grades',
      'student                        work     PC  bank early   line rule              current -> official',
      'Student One                   53.93   None   0.0     0  53.93 work                 53.9 -> 53.9',
      'Student Two                   NO SCHOOLOGY ROW -- pending official 0',
      'S\u0000tudent Three                  81.42   None   0.0     0  81.42 work                 79.1 -> 81.4',
      'wrote 1 override(s), kept 0 higher',
      'Student Four                  10.0 -> 10.0',
    ].join('\r\n');
    const table = check.parseOfficialTable(log, 'Q2');
    expect(table.size).toBe(2);
    expect(table.get('student one')).toBe(53.9);
    expect(table.get('student three')).toBe(81.4);
    expect(check.parseOfficialTable(log, 'Q1').size).toBe(0);
  });

  it('flags a frozen value below the nightly baseline, not one at or above it', () => {
    const baseline = new Map([['student one', 80], ['student two', 70], ['student three', 60]]);
    const rows = [
      { realName: 'Student One', frozen: 75 },
      { realName: 'Student Two', frozen: 69.9 },
      { realName: 'Student Three', frozen: 61 },
      { realName: 'Someone Else', frozen: 10 },
    ];
    const result = check.compareFrozenToBaseline(rows, baseline);
    expect(result.tooLow).toEqual([{ row: 1, frozen: 75, baseline: 80 }]);
    expect(result.unmatched).toBe(1);
  });

  it('SKILL.md step 6.2 describes both checks and the baseline source', () => {
    const skill = read('quarter-close', 'SKILL.md');
    expect(skill).toMatch(/Delta check/);
    expect(skill).toMatch(/Low-freeze check/);
    expect(skill).toMatch(/STRICTLY BEFORE the close date/);
  });
});

describe('UTF-8 python', () => {
  it('python -I -X utf8 prints utf-8', () => {
    const probe = spawnSync('python', ['-I', '-X', 'utf8', '-c', 'import sys;print(sys.stdout.encoding)'], { encoding: 'utf8' });
    if (probe.error) return; // python is not installed: skip
    expect(probe.stdout.trim().toLowerCase()).toBe('utf-8');
  });
  it('every python command in memory-refresh/SKILL.md carries -X utf8', () => {
    const commands = read('memory-refresh', 'SKILL.md').split('\n').filter(line => line.startsWith('python '));
    expect(commands.length).toBeGreaterThan(0);
    for (const command of commands) expect(command).toContain('-X utf8');
  });
});

describe('no hardcoded user paths', () => {
  it('close-check.mjs has no C:/Users/rober', () => {
    expect(read('quarter-close', 'close-check.mjs')).not.toMatch(/C:[\/]+Users[\/]+rober/i);
  });
  for (const name of ['reminders', 'poster-scores', 'quarter-close', 'pc-frq-scoring', 'memory-refresh']) {
    it(`${name}/SKILL.md has no C:/Users/rober`, () => {
      expect(read(name, 'SKILL.md')).not.toMatch(/C:[\/]+Users[\/]+rober/i);
    });
  }
});
