// desk-quiz-half-credit.test.js — the quiz rule copy and the quiz credit text.
// The retry is removed (QUIZ_RETRY_REMOVAL_SPEC.md): the copy says the first answer is
// the grade and never offers a retry or half credit for one. The half-credit renderer
// from QUIZ_RETRY_HALF_CREDIT_SPEC.md §2 stays: a half item shows as "½", and a count
// shown as a score sums credit.
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deskSource, deskHtml, fnBody } from './helpers/desk-source.js';

const START_HERE = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'start-here.html'), 'utf8');

function quizCreditText() {
  return new Function(fnBody('_quizCreditText') + '\nreturn _quizCreditText;')();
}

describe('Desk — quiz: the first answer is the grade', () => {
  it('the grade-rules copy says one answer per question, no retry', () => {
    const html = deskHtml();
    expect(html).toContain('<b>Quizzes</b>: one answer per question; <b>the first answer is the grade</b>.');
    expect(html).not.toContain('a correct retry earns');
    expect(html).not.toContain('<b>one retry</b>');
  });

  it('the quiz Done tooltip states the first-answer rule, not a retry', () => {
    const body = fnBody('_doneBtn');
    expect(body).toContain('one answer per question: the first answer is the grade');
    expect(body).not.toContain('half credit for a correct retry');
  });

  it('the Desk code comments say a half comes only from history, not from a retry', () => {
    const src = deskSource();
    expect(src).not.toMatch(/a correct\s*(\/\/\s*)?retry earns half credit/);
    expect(src).not.toContain('a half-credit retry reads as a half');
    expect(src).toContain('history: retries are closed, QUIZ_RETRY_REMOVAL_SPEC.md');
  });

  it('_quizCreditText: whole numbers plain, a half as ½, thirds to one decimal', () => {
    const text = quizCreditText();
    expect(text(2)).toBe('2');
    expect(text(0)).toBe('0');
    expect(text(1.5)).toBe('1½');
    expect(text(0.5)).toBe('½');
    expect(text(1 + 2 / 3)).toBe('1.7');
  });

  it('_quizCreditText: float drift still reads as a half', () => {
    const text = quizCreditText();
    expect(0.5 + 2 / 3 + 1 / 3).not.toBe(1.5);   // the drift this guards against
    expect(text(0.5 + 2 / 3 + 1 / 3)).toBe('1½');
  });

  it('the day-grade fallback sums credit, not the correct flag', () => {
    const src = deskSource();
    expect(src).toContain("parts.push('Quiz: ' + _quizCreditText(creditSum) + '/' + quizzes.length);");
    // 1½/2 is a credit sum, not a count of correct items: no "correct" label on it.
    expect(src).not.toContain("quizzes.length + ' correct'");
    expect(src).not.toContain("var correct = quizzes.filter(function (q) { return q.correct; }).length;");
  });
});

describe('start-here.html — the quiz rule in words', () => {
  it('says the first answer is the grade and offers no retry', () => {
    expect(START_HERE).toContain('<strong>Quizzes: one answer per question.</strong> <strong>The first answer is the grade</strong>, so there is no retry.');
    expect(START_HERE).not.toContain('a correct retry earns');
    expect(START_HERE).not.toContain('one explained retry');
    expect(START_HERE).not.toContain('that second answer is your score');
  });
});
