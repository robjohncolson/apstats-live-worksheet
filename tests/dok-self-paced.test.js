import { describe, expect, it } from 'vitest';
import { transform, remainingPhrases, deletedFields } from '../scripts/dok-self-paced.mjs';

describe('DOK self-paced migration', () => {
  it.each(['\n', '\r\n'])('preserves %j and protected content; second run is unchanged', eol => {
    const source = [
      'topic: "1.6"', 'minutes:', '  first_take: 5', '  finish: 10',
      'rules_callout:', '  title: Duration (min)', '  body: "Over 240 minutes: one class of 12 students."',
      'exit_reflection: |', '  Old reflection.', 'teacher:',
      '  phase_tag: old', '  teacher_does:', '  - Old instruction.',
      '  students_do:', '  - Old instruction.', '  questions_to_ask:', '  - Which value?',
      '  adult_role: Old instruction', '    continued.', '  watch_for:', '  - Keep this.',
      '  first_take_note: They committed before the discussion.',
      'visuals:', '  graph:', '    kind: dotplot', '    values: [5, 10]', '',
    ].join(eol);
    const result = transform(source);
    expect(result.counts).toEqual(Object.fromEntries(deletedFields.map(field => [field, 1])));
    expect(result.rewrittenNotes).toBe(1);
    expect(result.text).toContain('  questions_to_ask:' + eol + '  - Which value?');
    expect(result.text).toContain('  body: "Over 240 minutes: one class of 12 students."');
    expect(result.text).toContain('    values: [5, 10]');
    expect(result.text.replaceAll(eol, '')).not.toMatch(/[\r\n]/);
    expect(remainingPhrases(result.text)).toEqual([]);
    expect(transform(result.text).text).toBe(result.text);
    expect(Object.values(transform(result.text).counts).every(count => count === 0)).toBe(true);
  });

  it('reports forbidden prose without altering it or problem units', () => {
    const source = 'rules_callout:\n  body: Refer to the RULES BOX.\n  title: Duration (min)\n';
    expect(transform(source).text).toBe(source);
    expect(remainingPhrases(source)).toEqual([{ line: 2, phrase: 'rules box', text: '  body: Refer to the RULES BOX.' }]);
    expect(remainingPhrases('worksheet: u1_video_live.html')).toEqual([]);
    expect(remainingPhrases('stem: u1_video_live.html')).toHaveLength(1);
  });
});
