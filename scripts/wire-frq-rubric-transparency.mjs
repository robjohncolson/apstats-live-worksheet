#!/usr/bin/env node
// Worksheet presentation only. Run with --dry-run to validate without writing.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MARKER = '/* FRQ_RUBRIC_TRANSPARENCY */';
export const WORKSHEET_PATTERN = /^u\d+_lesson.+_live\.html$/;
const READER_NOTE = "AP readers score exactly this way: every element has to be on the page, in context, or it doesn't count.";

function replaceOnce(source, anchor, replacement) {
  const matches = typeof anchor === 'string'
    ? source.split(anchor).length - 1 : [...source.matchAll(anchor)].length;
  if (matches !== 1) throw new Error(`expected one anchor, found ${matches}: ${String(anchor).slice(0, 100)}`);
  return source.replace(anchor, () => replacement);
}

// Emitted inside both renderers so the saved-note helper remains self-contained.
function checklistCode(host, score, matched, missing, suggestion) {
  return `
                const checklist = document.createElement('ul');
                checklist.className = 'ai-feedback-checklist';
                for (const [entries, className, prefix] of [
                    [${matched}, 'ai-feedback-matched', '✓ '],
                    [${missing}, 'ai-feedback-missing', '○ ']
                ]) {
                    if (!Array.isArray(entries)) continue;
                    for (const entry of entries) {
                        const item = document.createElement('li');
                        item.className = className;
                        item.textContent = prefix + String(entry);
                        checklist.appendChild(item);
                    }
                }
                ${host}.appendChild(checklist);
                if (${score} !== 'E' && typeof ${suggestion} === 'string' && ${suggestion}.trim()) {
                    const advice = document.createElement('div');
                    advice.className = 'ai-feedback-suggestion';
                    const lead = document.createElement('strong');
                    lead.textContent = 'To reach E, add:';
                    const text = document.createElement('span');
                    text.textContent = ' ' + ${suggestion};
                    advice.append(lead, text);
                    ${host}.appendChild(advice);
                }
`;
}

function helpers(getter, registry, ids) {
  return `        ${MARKER}
        function _frqRubricElements(id) {
            try {
                const rubric = typeof window.${getter} === 'function'
                    ? window.${getter}(id) : window.${registry} && window.${registry}[id];
                if (!rubric) return null;
                if (!Array.isArray(rubric.expectedElements) || !rubric.expectedElements.every(
                    element => element && typeof element.description === 'string' && typeof element.required === 'boolean'
                )) {
                    console.error('Unsupported FRQ rubric shape for ' + id);
                    return null;
                }
                return rubric.expectedElements;
            } catch (_) { return null; }
        }

        function _renderFrqRubricTargets() {
            const textareas = ${JSON.stringify(ids)};
            for (const id of textareas) {
                const textarea = document.getElementById(id);
                const elements = _frqRubricElements(id);
                if (!textarea || !elements) continue;
                if (textarea.parentNode.querySelector('.frq-rubric-target[data-for="' + id + '"]')) continue;
                const target = document.createElement('details');
                target.className = 'frq-rubric-target';
                target.dataset.for = id;
                const summary = document.createElement('summary');
                summary.textContent = 'What an E answer includes';
                target.appendChild(summary);
                for (const required of [true, false]) {
                    const group = elements.filter(element => element.required === required);
                    if (!group.length) continue;
                    if (!required) {
                        const label = document.createElement('small');
                        label.textContent = 'Bonus (strengthens the answer):';
                        target.appendChild(label);
                    }
                    const list = document.createElement('ul');
                    for (const element of group) {
                        const item = document.createElement('li');
                        item.textContent = element.description;
                        list.appendChild(item);
                    }
                    target.appendChild(list);
                }
                const note = document.createElement('div');
                note.className = 'frq-reader-note';
                note.textContent = ${JSON.stringify(READER_NOTE)};
                target.appendChild(note);
                textarea.after(target);
            }
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', _renderFrqRubricTargets, { once: true });
        } else {
            _renderFrqRubricTargets();
        }

        function _appendFrqVerdict(feedback, questionId, result, header) {
            const elements = _frqRubricElements(questionId);
            if ((result.score === 'P' || result.score === 'I') && Array.isArray(result.missing) && result.missing.length) {
                const total = elements ? elements.filter(element => element.required).length : null;
                const count = total === null ? result.missing.length : Math.min(result.missing.length, total);
                const label = document.createElement('span');
                label.className = 'ai-feedback-count';
                label.textContent = 'Missing ' + count + (total === null ? '' : ' of ' + total) + ' key elements';
                header.appendChild(label);
            }
            feedback.appendChild(header);
${checklistCode('feedback', 'result.score', 'result.matched', 'result.missing', 'result.suggestion')}
            const details = document.createElement('details');
            details.className = 'ai-feedback-details';
            details.open = result.score === 'E';
            const summary = document.createElement('summary');
            summary.textContent = "Grader's full comments";
            const comments = document.createElement('div');
            comments.className = 'ai-feedback-body';
            comments.textContent = result.feedback || '';
            details.append(summary, comments);
            feedback.appendChild(details);
            if (result.score !== 'E') {
                const note = document.createElement('div');
                note.className = 'frq-reader-note';
                note.textContent = ${JSON.stringify(READER_NOTE)};
                feedback.appendChild(note);
            }
        }

`;
}

function pageRubric(source, root) {
  const promptFiles = [...source.matchAll(/<script\s+src="(ai-grading-prompts[^"/]*\.js)"/g)];
  if (promptFiles.length !== 1) throw new Error('expected exactly one prompts script');
  const suffixes = [...new Set([...source.matchAll(/window\.buildReflectionPrompt([A-Za-z0-9_]*)\(/g)].map(match => match[1]))];
  const legacy = source.includes('function showReflectionFeedback(textarea, result)');
  if (!legacy && suffixes.length !== 1) throw new Error('ambiguous prompt builder suffix');
  const suffix = legacy ? '' : suffixes[0];
  const getter = 'getRubric' + suffix;
  const registry = legacy ? 'REFLECTION_RUBRICS' : 'RUBRICS_' + suffix;
  const arrays = [...source.matchAll(/const textareas = (\[[^;]+\]);/g)];
  let ids;
  if (legacy) {
    const fallback = /: (\['reflect53'[^;]+\]);/.exec(source);
    if (!fallback) throw new Error('missing legacy reflectionIds fallback');
    ids = JSON.parse(fallback[1].replace(/'/g, '"'));
  } else {
    // The injected runtime array is identical; only inspect the original declaration.
    const originals = arrays.filter(match => !match[1].includes('"'));
    if (originals.length !== 1) throw new Error('ambiguous textareas array');
    ids = JSON.parse(originals[0][1].replace(/'/g, '"'));
  }
  const dom = new JSDOM(source, { runScripts: 'outside-only', url: 'https://worksheet.test' });
  try {
    dom.window.eval(readFileSync(resolve(root, promptFiles[0][1]), 'utf8'));
    const win = dom.window;
    if (legacy && JSON.stringify(win.getReflectionQuestionIds()) !== JSON.stringify(ids)) {
      throw new Error('legacy reflection IDs disagree with prompts');
    }
    // The grading loop also skips absent boxes (u2 lesson 9 has a stale reflect3 ID).
    ids = ids.filter(id => win.document.getElementById(id));
    for (const id of ids) {
      const rubric = typeof win[getter] === 'function' ? win[getter](id) : win[registry]?.[id];
      if (!rubric || !Array.isArray(rubric.expectedElements) || !rubric.expectedElements.length ||
          !rubric.expectedElements.every(element => typeof element.description === 'string' && typeof element.required === 'boolean')) {
        throw new Error('unsupported rubric shape for ' + id);
      }
    }
  } finally { dom.window.close(); }
  return { getter, registry, ids, legacy };
}

export function applyEdits(input, root = ROOT) {
  let source = input.replace(/\r\n/g, '\n');
  const { getter, registry, ids, legacy } = pageRubric(source, root);
  if (source.includes(MARKER)) {
    for (const anchor of [helpers(getter, registry, ids), 'missing, matched, suggestion) {',
      'entry.result && entry.result.matched, entry.result && entry.result.suggestion);',
      ".ai-feedback-checklist { list-style: none; padding-left: 0; }",
      checklistCode('note', 'gradeClass', 'matched', 'missing', 'suggestion').trimEnd(),
      legacy ? '_appendFrqVerdict(feedbackEl, textareaId, result, header);' : '_appendFrqVerdict(feedback, questionId, result, header);']) {
      if (!source.includes(anchor)) throw new Error('incomplete marked worksheet: ' + anchor.slice(0, 70));
    }
    return { out: source, changed: source !== input, count: ids.length };
  }
  source = replaceOnce(source, '        function _markAutoGraded(', helpers(getter, registry, ids) + '        function _markAutoGraded(');
  source = replaceOnce(source, 'function _markAutoGraded(ta, gradeClass, feedback, gradedAt, provider, missing) {',
    'function _markAutoGraded(ta, gradeClass, feedback, gradedAt, provider, missing, matched, suggestion) {');
  source = replaceOnce(source, 'entry.result && entry.result.provider, entry.result && entry.result.missing);',
    'entry.result && entry.result.provider, entry.result && entry.result.missing, entry.result && entry.result.matched, entry.result && entry.result.suggestion);');
  source = replaceOnce(source, /                if \(gradeClass !== 'E' && Array\.isArray\(missing\) && missing\.length\) \{[\s\S]*?note\.appendChild\(miss\);\n                \}/g,
    checklistCode('note', 'gradeClass', 'matched', 'missing', 'suggestion').trimEnd());
  if (legacy) {
    source = replaceOnce(source, '            if (result._aiGraded) {', "            if (result._aiGraded || ['E', 'P', 'I'].includes(result.score)) {");
    // Keep this page's existing header/model label and appeal section verbatim.
    source = replaceOnce(source, /                    <div class="ai-feedback-text">\$\{result.feedback\}<\/div>\n                    \$\{result.suggestion[^\n]+\n                    \$\{result.missing[^\n]+/g, '');
    const anchor = "            } else if (result._error) {";
    source = replaceOnce(source, anchor, `                const header = feedbackEl.querySelector('.ai-feedback-header');
                const appeals = Array.from(feedbackEl.children).filter(child => child !== header);
                feedbackEl.replaceChildren();
                _appendFrqVerdict(feedbackEl, textareaId, result, header);
                feedbackEl.append(...appeals);
${anchor}`);
    source = replaceOnce(source, '        function showReflectionFeedback(textarea, result) {', `        function showFeedback(questionId, result) {
            const textarea = document.getElementById(questionId);
            if (!textarea) return;
            textarea.classList.remove('graded-E', 'graded-P', 'graded-I');
            textarea.classList.add('graded-' + result.score);
            showReflectionFeedback(textarea, result);
        }

        function showReflectionFeedback(textarea, result) {`);
  } else {
    const start = source.indexOf('        function showFeedback(questionId, result) {');
    if (start < 0) throw new Error('missing showFeedback');
    const from = source.indexOf('            let html = `', start);
    const end = source.indexOf('            feedback.innerHTML = html;', from);
    if (from < 0 || end < 0 || end - from > 2200) throw new Error('unexpected feedback layout');
    const old = source.slice(from, end + '            feedback.innerHTML = html;'.length);
    for (const anchor of ['score-badge', 'result.matched.join', 'result.missing.join', 'result.suggestion']) {
      if (!old.includes(anchor)) throw new Error('feedback anchor missing: ' + anchor);
    }
    source = replaceOnce(source, old, `            const header = document.createElement('div');
            header.className = 'ai-feedback-header';
            const badge = document.createElement('span');
            badge.className = 'score-badge score-' + result.score;
            badge.textContent = result.score === 'E' ? 'Essentially Correct' : result.score === 'P' ? 'Partially Correct' : 'Incorrect';
            header.appendChild(badge);
            _appendFrqVerdict(feedback, questionId, result, header);`);
  }
  const styleAnchor = /        \.ai-feedback-(?:matched|text) \{[^\n]+\n/g;
  const style = [...source.matchAll(styleAnchor)][0]?.[0];
  if (!style) throw new Error('missing feedback CSS anchor');
  source = replaceOnce(source, style, style + `        .ai-feedback-checklist { list-style: none; padding-left: 0; }
        .ai-feedback-checklist .ai-feedback-matched { color: var(--ok, #155724); }
        .ai-feedback-checklist .ai-feedback-missing { color: var(--partial, #856404); }
        .frq-rubric-target { margin: 4px 0 8px; font-size: 0.85em; }
        .frq-rubric-target summary, .frq-reader-note { color: var(--second-ink, #666); font-size: 0.9em; }
        .frq-rubric-target summary, .ai-feedback-details summary { cursor: pointer; }
        .ai-feedback-count { margin-left: 8px; }
        .ai-feedback-suggestion { font-style: normal; }
`);
  return { out: source, changed: true, count: ids.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = readdirSync(ROOT).filter(file => WORKSHEET_PATTERN.test(file)).sort();
  const dryRun = process.argv.includes('--dry-run');
  const prepared = [];
  let failed = 0;
  for (const file of files) {
    try {
      const result = applyEdits(readFileSync(resolve(ROOT, file), 'utf8'));
      prepared.push({ file, ...result });
      console.log(`${result.changed ? dryRun ? 'WOULD' : 'READY' : 'WIRED'} ${file}: ${result.count} targets, live + saved checklists`);
    } catch (error) {
      failed++;
      console.error(`FAILED ${file}: ${error.message}`);
    }
  }
  if (!failed && !dryRun) {
    for (const result of prepared) {
      if (result.changed) writeFileSync(resolve(ROOT, result.file), result.out, 'utf8');
    }
  }
  console.log(`${dryRun ? 'dry-run' : 'run'}: ${prepared.length}/${files.length} fully wired; ${prepared.filter(result => result.changed).length} changed; ${failed} failed`);
  if (failed || files.length !== 69) process.exitCode = 1;
}
