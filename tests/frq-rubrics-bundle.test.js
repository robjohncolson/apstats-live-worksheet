import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ADVERSARIAL_SAMPLE_ANSWER,
  assertPromptBuilderPurity,
  EXPECTED_ITEM_COUNT,
  EXPECTED_WORKSHEET_COUNT,
  evaluateWorksheetPromptsSource,
  FIXED_SAMPLE_ANSWER,
  generateFrqRubricBundle,
  MAX_PRETTY_ARTIFACT_BYTES,
} from '../scripts/build-frq-rubrics.mjs';
import {
  buildServerReflectionPrompt,
  FRQ_RUBRIC_SCHEMA,
  FRQ_RUBRIC_SCHOOL_YEAR,
  parseServerReflectionItemId,
} from '../roster-server/frq-prompt.js';

const ROOT = resolve(import.meta.dirname, '..');
const BUNDLE_PATH = resolve(ROOT, 'roster-server/data/frq-rubrics.SY2627.json');
const MANIFEST_PATH = resolve(ROOT, 'data/frq-regrade-manifest.json');
const COMMITTED_SOURCE = readFileSync(BUNDLE_PATH, 'utf8');
const COMMITTED = JSON.parse(COMMITTED_SOURCE);
const MANIFEST = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function countItems(registry) {
  return Object.entries(registry.worksheets).reduce(
    (count, [, worksheet]) => count + Object.keys(worksheet.items).length,
    0,
  );
}

function pagePrompt(worksheet, textareaId, answer) {
  const source = readFileSync(resolve(ROOT, worksheet.promptsFile), 'utf8');
  const html = readFileSync(resolve(ROOT, worksheet.filename), 'utf8');
  const runtime = evaluateWorksheetPromptsSource(
    source,
    worksheet.promptsFile,
    html,
    worksheet.filename,
  );
  try {
    return runtime.window[worksheet.builderName](textareaId, answer);
  } finally {
    runtime.close();
  }
}

describe('committed FRQ rubric bundle', () => {
  it('is byte-for-byte in sync with the real manifest and prompt builders', () => {
    const generated = generateFrqRubricBundle(ROOT);
    expect(generated.parityCount).toBe(EXPECTED_ITEM_COUNT);
    expect(generated.serialized).toBe(COMMITTED_SOURCE);
    expect(generated.registry).toEqual(COMMITTED);
  });

  it('has the fixed schema, counts, hashes, and size budget', () => {
    expect(COMMITTED.schema).toBe(FRQ_RUBRIC_SCHEMA);
    expect(COMMITTED.schoolYear).toBe(FRQ_RUBRIC_SCHOOL_YEAR);
    expect(COMMITTED.sourceDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(Object.keys(COMMITTED.worksheets)).toHaveLength(EXPECTED_WORKSHEET_COUNT);
    expect(countItems(COMMITTED)).toBe(EXPECTED_ITEM_COUNT);
    expect(Buffer.byteLength(COMMITTED_SOURCE, 'utf8')).toBeLessThanOrEqual(
      MAX_PRETTY_ARTIFACT_BYTES,
    );

    for (const worksheet of Object.values(COMMITTED.worksheets)) {
      for (const item of Object.values(worksheet.items)) {
        const samplePrompt = item.promptBeforeAnswer + FIXED_SAMPLE_ANSWER + item.promptAfterAnswer;
        expect(item.samplePromptSha256).toBe(sha256(samplePrompt));
      }
    }
  });

  it('reproduces real page builders across many worksheets', () => {
    const sampleIndexes = [0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 68];
    for (const index of sampleIndexes) {
      const worksheet = MANIFEST.worksheets[index];
      const textareaIds = [
        worksheet.textareaIds[0],
        worksheet.textareaIds[worksheet.textareaIds.length - 1],
      ];
      for (const textareaId of textareaIds) {
        const expected = pagePrompt(worksheet, textareaId, ADVERSARIAL_SAMPLE_ANSWER);
        const actual = buildServerReflectionPrompt(
          COMMITTED,
          worksheet.prefix,
          textareaId,
          ADVERSARIAL_SAMPLE_ANSWER,
        );
        expect(actual, `${worksheet.prefix}-${textareaId}`).toBe(expected);
      }
    }
  });

  it('parses only exact known item ids and rejects unknown lookups', () => {
    expect(parseServerReflectionItemId(COMMITTED, 'WS-U1L10-reflect2')).toEqual({
      prefix: 'WS-U1L10',
      textareaId: 'reflect2',
    });
    expect(() => parseServerReflectionItemId(COMMITTED, 'WS-U1L10-reflect'))
      .toThrow('unknown FRQ item');
    expect(() => parseServerReflectionItemId(COMMITTED, 'ws-u1l10-reflect2'))
      .toThrow('unknown FRQ item');
    expect(() => buildServerReflectionPrompt(COMMITTED, 'WS-U1L10', 'missing', 'answer'))
      .toThrow('unknown FRQ item: WS-U1L10-missing');
    expect(() => buildServerReflectionPrompt(COMMITTED, 'WS-UNKNOWN', 'reflect2', 'answer'))
      .toThrow('unknown FRQ item: WS-UNKNOWN-reflect2');
  });

  it('round-trips marker-looking and template-looking answer text without parsing it', () => {
    const worksheet = MANIFEST.worksheets.find((entry) => entry.prefix === 'WS-U4L3-5');
    const answer = [
      FIXED_SAMPLE_ANSWER,
      '"quotes" and \'quotes\'',
      '`backticks` with ${templateLike}',
      'first line\nsecond line',
    ].join('\n');
    const expected = pagePrompt(worksheet, 'reflect2', answer);
    const actual = buildServerReflectionPrompt(COMMITTED, worksheet.prefix, 'reflect2', answer);
    expect(actual).toBe(expected);
    expect(actual).toBe(
      COMMITTED.worksheets[worksheet.prefix].items.reflect2.promptBeforeAnswer
      + answer
      + COMMITTED.worksheets[worksheet.prefix].items.reflect2.promptAfterAnswer,
    );
  });

  it.each([
    [
      'browser-dependent window.location branch',
      "const flavor = window.location ? 'BROWSER:' : 'BUILD:'; "
        + "window.builder = (id, answer) => flavor + answer + ':END';",
    ],
    [
      'per-id state that changes on the third call',
      'const calls = {}; window.builder = (id, answer) => { '
        + 'calls[id] = (calls[id] || 0) + 1; '
        + "return answer + (calls[id] < 3 ? ':STABLE' : ':CHANGED'); };",
    ],
  ])('rejects the synthetic purity regression: %s', (_name, promptsSource) => {
    expect(() => assertPromptBuilderPurity(promptsSource, {
      prefix: 'WS-FIXTURE',
      promptsFile: 'ai-grading-prompts-fixture.js',
      builderName: 'builder',
      contextName: 'LESSON_CONTEXT_FIXTURE',
      rubricsName: 'RUBRICS_FIXTURE',
    })).toThrow(/violates prompt purity/);
  });

  it('rejects a live page textarea missing from the committed manifest', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'frq-rubric-page-inventory-'));
    try {
      mkdirSync(resolve(fixtureRoot, 'data'));
      writeFileSync(resolve(fixtureRoot, 'u1_lesson1_live.html'), `
        <textarea id="reflect1"></textarea>
        <textarea id="reflectNew"></textarea>
        <script src="./ai-grading-prompts-fixture.js"></script>
        <script>
          const WORKSHEET_ID = 'WS-FIXTURE';
          window.RAILWAY_SERVER_URL = 'https://grader.fixture';
          async function gradeReflection() {
            return { scenario: { topic: 'Fixture topic' } };
          }
        </script>
      `);
      writeFileSync(resolve(fixtureRoot, 'ai-grading-prompts-fixture.js'), `
        window.LESSON_CONTEXT_FIXTURE = { unit: 'fixture' };
        window.RUBRICS_FIXTURE = { reflect1: {}, reflectNew: {} };
        window.buildReflectionPromptFixture = (id, answer) => id + ':' + answer;
      `);
      writeFileSync(resolve(fixtureRoot, 'data/frq-regrade-manifest.json'), `${JSON.stringify({
        railwayServerUrl: 'https://grader.fixture',
        worksheets: [{
          filename: 'u1_lesson1_live.html',
          prefix: 'WS-FIXTURE',
          promptsFile: 'ai-grading-prompts-fixture.js',
          builderName: 'buildReflectionPromptFixture',
          contextName: 'LESSON_CONTEXT_FIXTURE',
          rubricsName: 'RUBRICS_FIXTURE',
          topic: 'Fixture topic',
          textareaIds: ['reflect1'],
        }],
      }, null, 2)}\n`);

      expect(() => generateFrqRubricBundle(fixtureRoot))
        .toThrow(/committed manifest does not match the live worksheet page inventory/);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
