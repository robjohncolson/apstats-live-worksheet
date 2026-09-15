import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateAuthoredWordBank } from '../scripts/weekly-dok.mjs';

const liveItem = JSON.parse(fs.readFileSync('dok/registry/1.1_1.2_1.4_1.7.jsonl', 'utf8'));

describe('weekly word bank authoring', () => {
  it('requires word banks and typed blanks in the author prompt', () => {
    const prompt = fs.readFileSync('tools/weekly-dok-author-prompt.md', 'utf8');
    expect(prompt).toContain('word_bank');
    expect(prompt).toContain('word_bank_needed');
    expect(prompt).toContain('\\blankt');
    expect(prompt).toContain('the word bank contains every term the frames need');
  });

  it.each([{ standalone: true }, { generated: { by: 'weekly-auto' } }, { misconceptions: ['resistance'] }])
    ('rejects bare frames for misconception metadata %j', lesson => {
      const item = structuredClone(liveItem);
      delete item.word_bank;
      expect(() => validateAuthoredWordBank(item, lesson)).toThrow('require word_bank');
    });

  it('accepts the live bank and legacy frames without bank metadata', () => {
    expect(() => validateAuthoredWordBank(liveItem, { standalone: true })).not.toThrow();
    expect(() => validateAuthoredWordBank({ sentence_frames: ['legacy blank'] }, {})).not.toThrow();
  });

  it.each([
    { word_bank_needed: ['missing'] },
    { word_bank_needed: [] },
    { word_bank_needed: liveItem.word_bank.slice(0, -1) },
    { word_bank: ['mean'] },
    { word_bank: ['a', 'b', 'c', 'd', 'e', 'bad%'] },
    { word_bank: ['a', 'b', 'c', 'd', 'e', 'one two three four five six'] },
  ])('rejects invalid authored bank metadata %j', change => {
    expect(() => validateAuthoredWordBank({ ...liveItem, ...change }, { standalone: true })).toThrow();
  });
});
