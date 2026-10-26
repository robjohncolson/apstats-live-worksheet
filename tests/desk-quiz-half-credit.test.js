// desk-quiz-half-credit.test.js — the Desk reads a correct quiz retry as half credit
// (QUIZ_RETRY_HALF_CREDIT_SPEC.md §2): the rule copy says so, a half item shows as "½",
// and a count shown as a score sums credit.
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

describe('Desk — quiz retry half credit', () => {
  it('the grade-rules copy says a correct retry earns half credit', () => {
    const html = deskHtml();
    expect(html).toContain('a correct retry earns <b>half credit</b>');
    expect(html).not.toContain('with a short explanation &mdash; that answer counts');
  });

  it('the quiz Done tooltip names the half-credit retry', () => {
    expect(fnBody('_doneBtn')).toContain('half credit for a correct retry');
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
  it('says a correct retry earns half credit, not that the retry is the score', () => {
    expect(START_HERE).toContain('after you write a short explanation; a correct retry earns <strong>half credit</strong>.');
    expect(START_HERE).not.toContain('that second answer is your score');
  });
});
