import { describe, expect, it } from 'vitest';
import { transform } from '../scripts/dok-video-free.mjs';

describe('DOK copy migration', () => {
  it.each(['\n', '\r\n'])('preserves %j line endings and becomes a no-op', (eol) => {
    const source = [
      'minutes: { first_take: 5, video_worksheet: 26.8, finish: 10 }',
      'teacher:',
      '  phase_tag: Do Now (first take) $\\rightarrow$ Explore (video + follow-along) $\\rightarrow$ Exit (finish',
      '    + turn in)',
      '  teacher_does:',
      '  - Start the video follow-along at minute 5. Collect nothing yet.',
      '',
    ].join(eol);
    const first = transform(source);
    expect(first.text).toContain('explore: 26.8');
    expect(first.text).toContain('rules + (a)--(c)');
    expect(first.text).toContain('students start (a). Collect nothing yet.');
    expect(first.text).not.toMatch(/video/i);
    expect(first.text.replaceAll(eol, '')).not.toMatch(/[\r\n]/);
    const second = transform(first.text);
    expect(second.text).toBe(first.text);
    expect(Object.values(second.counts).every(n => n === 0)).toBe(true);
  });

  it('preserves the four-part range and specific reflection on remediation sheets', () => {
    const source = 'standalone: true\n  phase_tag: First take $\\rightarrow$ rules $\\rightarrow$ (a)--(d) $\\rightarrow$ turn in\nexit_reflection: Keep context.\n';
    expect(transform(source).text).toContain('rules + (a)--(d)');
    expect(transform(source).text).toContain('exit_reflection: Keep context.');
  });

  it('changes only the authorized registry stem phrase', () => {
    const row = { stem: 'Suppose a video platform has 5,000 active accounts', first_take: 'Choose.', parts: [{ prompt: 'Explain.' }], answers: { a: 'Keep.' } };
    const result = JSON.parse(transform(JSON.stringify(row), 'jsonl').text);
    expect(result).toEqual({ ...row, stem: 'Suppose a streaming platform has 5,000 active accounts' });
  });
});
