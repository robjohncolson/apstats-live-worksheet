import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { isDeepStrictEqual } from 'node:util';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PROVENANCE = 'codex-draft-2026-09-11';
export function readJson(path) {
  return JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
}

export function loadRubrics() {
  const manifest = readJson('data/frq-regrade-manifest.json');
  const rubrics = {};
  for (const worksheet of manifest.worksheets) {
    const context = createContext({ window: {}, console });
    runInContext(readFileSync(resolve(ROOT, worksheet.promptsFile), 'utf8'), context,
      { filename: worksheet.promptsFile, timeout: 5000 });
    const source = context.window[worksheet.rubricsName] || runInContext(worksheet.rubricsName, context);
    for (const [textareaId, rubric] of Object.entries(source)) {
      const itemId = `${worksheet.prefix}-${textareaId}`;
      const elements = Array.from(rubric.expectedElements || [], element => ({
        id: element.id, description: element.description,
      }));
      if (elements.some(element => !element.id || !element.description)) {
        throw new Error(`Missing stable rubric element: ${itemId}`);
      }
      if (new Set(elements.map(element => element.id)).size !== elements.length) {
        throw new Error(`Duplicate rubric element: ${itemId}`);
      }
      rubrics[itemId] = { elements, commonMistakes: Array.from(rubric.commonMistakes || []),
        worksheet: worksheet.filename };
    }
  }
  return rubrics;
}

export function loadQuestions() {
  const path = process.env.CURRICULUM_JS || 'C:/Users/rober/Downloads/Projects/school/curriculum_render/data/curriculum.js';
  const context = createContext({});
  runInContext(readFileSync(path, 'utf8') + '\n;globalThis.questions = EMBEDDED_CURRICULUM;', context,
    { filename: path, timeout: 5000 });
  const questions = new Map(context.questions.map(question => [question.id, question]));
  return Object.entries(readJson('data/answer-key.json').answerKey).map(([id, key]) => {
    const question = questions.get(id);
    if (!question || question.answerKey !== key.answerKey) throw new Error(`Curriculum/key mismatch: ${id}`);
    const choices = question.choices || question.attachments?.choices;
    if (!Array.isArray(choices) || !choices.some(choice => choice.key === key.answerKey)) {
      throw new Error(`Invalid choices: ${id}`);
    }
    return { ...question, choices: Array.from(choices), correct: key.answerKey };
  });
}

// Preserve teacher edits to tag arrays; generation only enumerates source keys.
export function buildMap(filename, skeleton, metadata = {}) {
  let previous = null;
  try { previous = readJson(filename); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const vocabulary = readJson('data/misconceptions.json');
  for (const [itemId, entries] of Object.entries(skeleton)) {
    for (const key of Object.keys(entries)) {
      const tags = previous?.items?.[itemId]?.[key] || [];
      if (!Array.isArray(tags) || tags.some(tag => !Object.hasOwn(vocabulary.tags, tag))) {
        throw new Error(`Unknown tag at ${itemId}/${key}`);
      }
      entries[key] = tags;
    }
  }
  const doc = { schema: 'apstats-misconception-map/v1', reviewed: previous?.reviewed ?? false,
    provenance: previous?.provenance || PROVENANCE, ...metadata, items: skeleton };
  if (process.argv.includes('--check')) {
    if (!isDeepStrictEqual(doc, previous)) throw new Error(`${filename} is stale; regenerate and review source changes`);
    console.log(`${filename}: checked`);
    return doc;
  }
  writeFileSync(resolve(ROOT, filename), JSON.stringify(doc, null, 2) + '\n');
  return doc;
}
