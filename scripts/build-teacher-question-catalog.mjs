// Prompt-only snapshot for teacher evidence. Never includes solutions or rubric answers.
// Run from follow-alongs; optional first argument is the curriculum checkout.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const curriculumPath = resolve(process.argv[2] || '../curriculum_render', 'data/curriculum.js');
const source = readFileSync(curriculumPath, 'utf8');
const curriculum = JSON.parse(source.slice(source.indexOf('[')).trim().replace(/;$/, ''));
const rubricSource = readFileSync('roster-server/data/frq-rubrics.SY2627.json', 'utf8');
const registry = JSON.parse(rubricSource);
const questions = {};
for (const q of curriculum) {
  if (!q.id || !q.prompt) continue;
  questions[q.id] = { prompt: q.prompt, attachments: q.attachments || {} };
}
for (const [prefix, sheet] of Object.entries(registry.worksheets)) {
  for (const [id, item] of Object.entries(sheet.items)) {
    const match = item.promptBeforeAnswer.match(/## Question\s*\n([\s\S]*?)\n## Student/i) ||
      item.promptBeforeAnswer.match(/QUESTION:\s*([\s\S]*?)\n\s*STUDENT(?:['\u2019]S ANSWER| RESPONSE):/i);
    questions[prefix + '-' + id] = {
      prompt: match ? match[1].trim() : null,
      worksheet: sheet.filename,
      context: sheet.lessonContext || ''
    };
  }
}
const digest = s => createHash('sha256').update(s).digest('hex');
writeFileSync('roster-server/data/teacher-question-catalog.json', JSON.stringify({
  sources: { curriculum: digest(source), frqRubrics: digest(rubricSource) }, questions
}, null, 2) + '\n');
console.log(Object.keys(questions).length + ' question records; ' + Object.values(questions).filter(q => !q.prompt).length + ' without a parsed prompt');
