// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import { parse } from 'acorn';
import { applyEdits, MARKER, WORKSHEET_PATTERN } from '../scripts/wire-frq-rubric-transparency.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const files = readdirSync(ROOT).filter(file => WORKSHEET_PATTERN.test(file)).sort();
const read = file => readFileSync(resolve(ROOT, file), 'utf8');

function boot(file = 'u1_lesson1_live.html', prompts = true) {
  const html = read(file);
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://worksheet.test' });
  const win = dom.window;
  if (prompts) win.eval(read(/src="(ai-grading-prompts[^"/]*\.js)"/.exec(html)[1]));
  win.eval('var gradingState = new Map();');
  const start = html.indexOf(MARKER);
  win.eval(html.slice(start, html.indexOf('        function _markAutoGraded(', start)));
  for (const script of win.document.querySelectorAll('script:not([src])')) {
    const source = script.textContent;
    const tree = parse(source, { ecmaVersion: 'latest' });
    for (const node of tree.body) {
      if (node.type === 'FunctionDeclaration' && ['showFeedback', 'showReflectionFeedback', '_markAutoGraded'].includes(node.id.name)) {
        win.eval(source.slice(node.start, node.end));
      }
    }
  }
  win.document.dispatchEvent(new win.Event('DOMContentLoaded'));
  return dom;
}

const partial = { score: 'P', feedback: 'Explain the missing context.', matched: ['a'], missing: ['b', 'c'], suggestion: 'add b' };

describe('FRQ rubric transparency', () => {
  it('wires exactly the 69 follow-alongs and validates every page on a second run', () => {
    expect(files).toHaveLength(69);
    for (const file of files) {
      const html = read(file);
      expect(html, file).toContain(MARKER);
      expect(html, file).toContain('frq-rubric-target');
      expect(html, file).toContain('ai-feedback-checklist');
      const second = applyEdits(html);
      expect(second.changed, file).toBe(false);
      expect(second.out, file).toBe(html);
    }
  }, 60000);

  it('renders P as counted checklist and E with open comments and no revision advice', () => {
    const dom = boot();
    try {
      const { window: win } = dom;
      win.showFeedback('reflect1', partial);
      let card = win.document.querySelector('#reflect1-feedback .ai-feedback');
      expect(card.querySelector('.ai-feedback-header').textContent).toContain('Missing 2 of 2 key elements'); // u1-l1 reflect1 has 2 key elements since RUBRIC_SLIM; the count clamps to the total
      expect([...card.querySelectorAll('.ai-feedback-missing')].map(item => item.textContent)).toEqual(['○ b', '○ c']);
      expect([...card.querySelectorAll('.ai-feedback-matched')].map(item => item.textContent)).toEqual(['✓ a']);
      expect(card.querySelector('.ai-feedback-suggestion').textContent).toBe('To reach E, add: add b');
      expect(card.querySelector('details').open).toBe(false);
      expect(card.querySelectorAll('.frq-reader-note')).toHaveLength(1);
      win.showFeedback('reflect1', { ...partial, score: 'E' });
      card = win.document.querySelector('#reflect1-feedback .ai-feedback');
      expect(card.textContent).not.toContain('To reach E');
      expect(card.querySelector('details').open).toBe(true);
      expect(card.querySelector('.frq-reader-note')).toBeNull();
    } finally { dom.window.close(); }
  });

  it('shows the exact required rubric, then optional elements, once before grading', () => {
    const dom = boot();
    try {
      const win = dom.window;
      win._renderFrqRubricTargets();
      const targets = win.document.querySelectorAll('.frq-rubric-target[data-for="reflect1"]');
      expect(targets).toHaveLength(1);
      const target = targets[0];
      expect(target.open).toBe(false);
      expect(target.querySelector('summary').textContent).toBe('What an E answer includes');
      const elements = win.getRubricU1L1('reflect1').expectedElements;
      expect([...target.querySelector('ul').children].map(item => item.textContent))
        .toEqual(elements.filter(element => element.required).map(element => element.description));
      expect(target.querySelector('small').textContent).toBe('Bonus (strengthens the answer):');
    } finally { dom.window.close(); }
  });

  it('tolerates missing prompts, clamps counts, and treats all grader strings as text', () => {
    const dom = boot('u1_lesson1_live.html', false);
    try {
      const win = dom.window;
      expect(win.document.querySelector('.frq-rubric-target')).toBeNull();
      win.showFeedback('reflect1', { ...partial, suggestion: '<img src=x>', missing: ['<b>b</b>'] });
      const card = win.document.querySelector('.ai-feedback');
      expect(card.querySelector('.ai-feedback-count').textContent).toBe('Missing 1 key elements');
      expect(card.querySelector('img, b')).toBeNull();
      win.getRubricU1L1 = () => ({ expectedElements: [{ required: true, description: 'one' }] });
      win.showFeedback('reflect1', partial);
      expect(win.document.querySelector('.ai-feedback-count').textContent).toBe('Missing 1 of 1 key elements');
    } finally { dom.window.close(); }
  });

  it('keeps saved-answer headers, checklist, suggestion, old arity, and edit removal', () => {
    const dom = boot();
    try {
      const win = dom.window;
      const ta = win.document.getElementById('reflect1');
      win._markAutoGraded(ta, 'P', 'Comments', null, 'ai-batch', ['b', 'c'], ['a'], 'add b');
      const note = win.document.querySelector('.frq-graded-note');
      expect(note.querySelector('strong').textContent).toBe('Auto-graded from your saved answer: P (partial)');
      expect([...note.querySelectorAll('li')].map(item => item.textContent)).toEqual(['✓ a', '○ b', '○ c']);
      expect(note.querySelector('.ai-feedback-suggestion').textContent).toBe('To reach E, add: add b');
      ta.dispatchEvent(new win.Event('input'));
      expect(win.document.querySelector('.frq-graded-note')).toBeNull();
      win._markAutoGraded(ta, 'P', 'Old saved entry', null, 'teacher');
      expect(win.document.querySelector('.frq-graded-note').textContent).toContain('Old saved entry');
    } finally { dom.window.close(); }
  });

  it('supports the legacy worksheet and keeps its appeal section', () => {
    const dom = boot('u3_lesson6-7_live.html');
    try {
      const win = dom.window;
      win.showFeedback('reflect53', { ...partial, _aiGraded: true });
      const card = win.document.querySelector('.ai-feedback');
      expect(card.querySelectorAll('.ai-feedback-checklist li')).toHaveLength(3);
      expect(card.querySelector('.appeal-form').id).toBe('appealForm-reflect53');
      expect(win.document.querySelectorAll('.frq-rubric-target')).toHaveLength(6);
    } finally { dom.window.close(); }
  });

  it('refuses ambiguous anchors and incomplete marked pages without changing input', () => {
    const original = execFileSync('git', ['show', '72766e65:u1_lesson1_live.html'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 2e6 });
    expect(() => applyEdits(original.replace('function showFeedback(', 'function unsupportedFeedback('))).toThrow('missing showFeedback');
    expect(() => applyEdits(read(files[0]).replace('_appendFrqVerdict(feedback, questionId, result, header);', ''))).toThrow('incomplete marked worksheet');
    const first = applyEdits(original);
    expect(applyEdits(first.out).out).toBe(first.out);
  });
});
