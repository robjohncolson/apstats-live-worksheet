// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parsePosterFile, posterGradeForScore } from '../scripts/enter-poster.mjs';
import { parseConvertArgs, formatConvertAudit } from '../scripts/convert-poster-bonus.mjs';

const HEADER = 'unit=1 quarter=Q1 title=Unit 1 Poster (Data, Graph, Sentence) section=PeriodB';

describe('poster entry file', () => {
  it('parses the header, optional section, comments, and maps letters to 115/100/90', () => {
    expect(parsePosterFile(`# ignored\n\n${HEADER}
      Real Name|E # comment
      roster_user|P
      Third Student|I
    `)).toEqual({
      meta: { unit: 1, quarter: 'Q1', title: 'Unit 1 Poster (Data, Graph, Sentence)', section: 'PeriodB' },
      rows: [
        { name: 'Real Name', score: 115, grade: 'E' },
        { name: 'roster_user', score: 100, grade: 'P' },
        { name: 'Third Student', score: 90, grade: 'I' },
      ],
    });
  });
  it('accepts integers 90..115 and derives the letter from the score', () => {
    expect(parsePosterFile(`${HEADER}\nA|90\nB|92\nC|100\nD|105\nE|115`).rows).toEqual([
      { name: 'A', score: 90, grade: 'I' },
      { name: 'B', score: 92, grade: 'I' },
      { name: 'C', score: 100, grade: 'P' },
      { name: 'D', score: 105, grade: 'P' },
      { name: 'E', score: 115, grade: 'E' },
    ]);
  });
  it.each(['89', '116', '0', '9', '1150'])('rejects out-of-range score %s', score => {
    expect(() => parsePosterFile(`${HEADER}\nName|${score}`)).toThrow('bad row');
  });
  it.each(['100.5', '92.0', '1e2', '-90', 'X', 'e', '', 'toString'])('rejects non-integer or bad value %s', value => {
    expect(() => parsePosterFile(`${HEADER}\nName|${value}`)).toThrow('bad row');
  });
  it.each(['', '# comment', 'quarter=Q1 title=Title', 'unit=x quarter=Q1 title=Title', 'unit=1 quarter=Q5 title=Title',
    'unit=1 quarter=Q1'])('rejects incomplete header %s', text => {
    expect(() => parsePosterFile(text)).toThrow('header needs');
  });
  it('accepts a header without section', () => {
    expect(parsePosterFile('unit=2 quarter=Q2 title=Unit 2 Poster\nName|E').meta)
      .toEqual({ unit: 2, quarter: 'Q2', title: 'Unit 2 Poster' });
  });
  it('derives letters at the 115 / 100 boundaries', () => {
    expect(posterGradeForScore(115)).toBe('E');
    expect(posterGradeForScore(114)).toBe('P');
    expect(posterGradeForScore(100)).toBe('P');
    expect(posterGradeForScore(99)).toBe('I');
  });
});

describe('convert-poster-bonus', () => {
  it('is a dry run by default and reads --section', () => {
    expect(parseConvertArgs([])).toEqual({ apply: false });
    expect(parseConvertArgs(['--apply', '--section', 'PeriodB'])).toEqual({ apply: true, section: 'PeriodB' });
    expect(() => parseConvertArgs(['--section'])).toThrow('missing value');
    expect(() => parseConvertArgs(['file.txt'])).toThrow('usage');
  });
  it('prints one audit line per converted row plus the counts', () => {
    const text = formatConvertAudit({
      ok: true, dryRun: true, deleted: 0, remainingBonusPosterRows: 2, errors: [],
      converted: [{ studentId: 1, username: 'pear_cat', unit: 1, grade: 'E', score: 115 },
        { studentId: 2, username: 'plum_dog', unit: 1, grade: 'I', score: 90 }],
    });
    expect(text).toContain('pear_cat');
    expect(text).toContain('U1 E -> 115');
    expect(text).toContain('U1 I -> 90');
    expect(text).toContain('2 row(s) converted, 0 bonus row(s) deleted, 2 BONUS-POSTER- row(s) remaining (dry run)');
  });
});
