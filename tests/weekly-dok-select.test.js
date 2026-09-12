import { describe, it, expect } from 'vitest';
import { mergeSections, selectLabels, makeBrief, LABEL_CAP, STUDENT_FLOOR } from '../scripts/weekly-dok.mjs';

const row = (key, students, lesson = '1.1', events = students) => ({
  key, label: key, students, events, lessons: [lesson], skills: ['4.B'], evidence: [],
});
const crosswalk = { map: Object.fromEntries(['1.1', '1.2', '1.8', '2.1'].map(topic =>
  [topic, { newUnit: Number(topic.split('.')[0]), newTopic: topic }])) };
const triage = { entries: { done: {} } };

describe('weekly misconception selection', () => {
  it('merges section counts, lessons, skills and projected evidence without names', () => {
    const payload = { ok: true, section: 'PeriodB', frequent: [row('context', 3)],
      students: { privateId: { realName: 'Example Learner', username: 'private_login' } },
      evidence: { context: [{ studentId: 'privateId', source: 'frq', itemId: 'U1-L1-Q01',
        evidence: { missing: 'Example Learner and private_login omitted units.' } }] } };
    const merged = mergeSections([payload, { ...payload, section: 'PeriodE', frequent: [row('context', 2, '1.2')] }]);
    expect(merged[0]).toMatchObject({ students: 5, events: 5, lessons: ['1.1', '1.2'], sections: ['PeriodB', 'PeriodE'] });
    expect(merged[0].evidence).toHaveLength(1);
    const brief = makeBrief(merged, '2026-09-18');
    expect(brief).toContain('Sheet key: 1.1+1.2');
    expect(brief).toContain('CED skills: 4.B');
    expect(brief).toContain('U1-L1-Q01');
    expect(brief).not.toMatch(/Example|Learner|privateId|private_login/);
  });
  it('excludes triage and admits recurring targets again', () => {
    expect(selectLabels([row('done', 9), row('fresh', 4)], triage, crosswalk).map(x => x.key)).toEqual(['fresh']);
    expect(selectLabels([{ ...row('done', 9), recurringAfterTriage: true }], triage, crosswalk)).toHaveLength(1);
  });
  it('skips below four students, including an empty input', () => {
    expect(STUDENT_FLOOR).toBe(4);
    expect(selectLabels([row('small', 3)], triage, crosswalk)).toEqual([]);
    expect(makeBrief([], '2026-09-18')).toBe('below floor\n');
  });
  it('prefers nearby topics after the lead and caps at five deterministically', () => {
    const rows = [row('lead', 10), row('far', 9, '2.1'), row('near', 4, '1.2'),
      row('z', 3, '1.8'), row('a', 3, '1.8'), row('b', 2, '1.8')];
    expect(LABEL_CAP).toBe(5);
    const selected = selectLabels(rows, triage, crosswalk);
    expect(selected.map(x => x.key)).toEqual(['lead', 'near', 'far', 'a', 'z']);
    expect(selectLabels([...rows].reverse(), triage, crosswalk)).toEqual(selected);
  });
  it('prints at most three evidence excerpts and refuses unsafe keys', () => {
    const selected = [{ ...row('context', 4), evidence: Array.from({ length: 5 }, (_, i) => ({ itemId: `item-${i}`, text: 'missing units' })) }];
    expect(makeBrief(selected, '2026-09-18')).not.toContain('item-3');
    expect(() => mergeSections([{ ok: true, section: 'PeriodB', frequent: [row('label:Example Learner omitted units', 4)],
      students: { id: { realName: 'Example Learner' } } }])).toThrow('private information');
  });
});
