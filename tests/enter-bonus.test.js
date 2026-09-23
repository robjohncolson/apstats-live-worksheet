// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parseBonusFile, matchBonusStudents } from '../scripts/enter-bonus.mjs';

describe('bonus entry file', () => {
  it('parses the full title, optional section, comments, and E/P/I points', () => {
    expect(parseBonusFile(`# ignored\n\nsheet=U1-screen-time quarter=Q1 title=Screen Time, Two Deletions section=PeriodB
      Real Name|E # comment
      roster_user|P
      Third Student|I
    `)).toEqual({
      meta: { sheetId: 'U1-screen-time', quarter: 'Q1', title: 'Screen Time, Two Deletions', section: 'PeriodB' },
      rows: [{ name: 'Real Name', grade: 'E', points: 5 }, { name: 'roster_user', grade: 'P', points: 3 },
        { name: 'Third Student', grade: 'I', points: 1 }],
    });
  });
  it.each(['X', 'e', '', '5', 'toString'])('rejects bad grade %s', grade => {
    expect(() => parseBonusFile(`sheet=one quarter=Q1 title=Title\nName|${grade}`)).toThrow('bad row');
  });
  it.each(['', '# comment', 'sheet=x quarter=Q5 title=Title', 'quarter=Q1 title=Title', 'sheet=x quarter=Q1'])
    ('rejects incomplete header %s', text => expect(() => parseBonusFile(text)).toThrow('header needs'));
  it('accepts a header without section', () => {
    expect(parseBonusFile('sheet=x quarter=Q2 title=A title\nName|E').meta)
      .toEqual({ sheetId: 'x', quarter: 'Q2', title: 'A title' });
  });
  it('matches only exact normalized names or usernames and preserves ambiguity', () => {
    const students = [{ realName: 'Jane Smith', username: 'pear_cat' }, { realName: 'Jane Smith', username: 'plum_dog' }];
    expect(matchBonusStudents(' PEAR_CAT ', students)).toEqual([students[0]]);
    expect(matchBonusStudents(' jane   SMITH ', students)).toEqual(students);
    expect(matchBonusStudents('J Smith', students)).toEqual([]);
    expect(matchBonusStudents('Missing', students)).toEqual([]);
  });
});
