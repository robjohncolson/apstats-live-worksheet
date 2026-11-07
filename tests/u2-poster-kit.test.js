// @vitest-environment node
// Unit 2 claim-poster kit (U2_CLAIM_POSTER_SPEC.md, Part A): the single source
// u2_poster/claim_poster_job_cards.html and its four printed PDFs. Every number a
// student or the teacher reads is recomputed here from the Super Status table
// (433 students, printed in the 2.4-2.6 follow-along), the 2010 AP table and the
// carnival game, so a typo in the kit fails CI instead of reaching a poster.
import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const html = readFileSync(resolve(ROOT, 'u2_poster/claim_poster_job_cards.html'), 'utf8');

// Super Status table: Famous / Happy / Healthy / Rich per superpower.
const TABLE = {
  Fly: [5, 48, 14, 22],
  'Freeze Time': [3, 63, 9, 26],
  Invisibility: [3, 62, 11, 22],
  'Super Strength': [4, 43, 17, 13],
  Telepathy: [0, 49, 0, 19],
};
const rowTotal = (name) => TABLE[name].reduce((a, b) => a + b, 0);
const colTotal = (i) => Object.values(TABLE).reduce((a, r) => a + r[i], 0);
const pct = (num, den) => `${num}/${den} = ${(100 * num / den).toFixed(1)}%`;

describe('Unit 2 claim-poster kit', () => {
  it('has the six cards, the example board, the walk sheet and the print editions', () => {
    for (const title of [
      'Poster 1 — Who wants to be rich?',
      'Poster 2 — The flipped headline',
      'Poster 3 — Can\'t happen together, so unrelated?',
      'Poster 4 — Double counted',
      'Poster 5 — Is the game fair?',
      'Poster 6 (spare) — Rigged coin?',
      'Example board — project this first',
      'Gallery walk — Unit 2 claim posters',
    ]) expect(html).toContain(title);
    for (const edition of ['student', 'teacher', 'example', 'walk', 'board']) {
      expect(html).toContain(`body[data-print="${edition}"] .sheet.${edition} { display: block; }`);
    }
    // Answers print only in the teacher edition.
    expect(html).toContain('.answer { display: none;');
    expect(html).toContain('body[data-print="teacher"] .answer');
  });

  it('prints the Super Status table with totals that add up', () => {
    expect(colTotal(0) + colTotal(1) + colTotal(2) + colTotal(3)).toBe(433);
    for (const name of Object.keys(TABLE)) {
      const cells = TABLE[name].map((v) => `<td>${v}</td>`).join('');
      expect(html).toContain(`<tr><td>${name}</td>${cells}<td class="t">${rowTotal(name)}</td></tr>`);
    }
    expect(html).toContain(`<td class="t">${colTotal(0)}</td><td class="t">${colTotal(1)}</td><td class="t">${colTotal(2)}</td><td class="t">${colTotal(3)}</td><td class="t">433</td>`);
  });

  it('card 1: the five Rich percents and the overall rate are computed from the table', () => {
    for (const name of Object.keys(TABLE)) expect(html).toContain(`${name} ${pct(TABLE[name][3], rowTotal(name))}`);
    expect(html).toContain(`P(Rich) = ${pct(colTotal(3), 433)}`);
    // Telepathy leads Freeze Time by 2.2 points.
    const lead = 100 * TABLE.Telepathy[3] / rowTotal('Telepathy') - 100 * TABLE['Freeze Time'][3] / rowTotal('Freeze Time');
    expect(lead.toFixed(1)).toBe('2.2');
    expect(html).toContain('2.2 points behind');
  });

  it('card 2 and the exit ticket: both conditionals use the right denominators', () => {
    expect(html).toContain(`P(Fly | Famous) = ${pct(5, colTotal(0))}`);
    expect(html).toContain(`P(Famous | Fly) = ${pct(5, rowTotal('Fly'))}`);
    expect(html).toContain(`P(Happy | Super Strength) = ${pct(43, rowTotal('Super Strength'))}`);
    expect(html).toContain(`P(Super Strength | Happy) = ${pct(43, colTotal(1))}`);
  });

  it('card 3: mutually exclusive but not independent, with the product', () => {
    expect(html).toContain('P(Telepathy and Famous) = 0/433 = 0');
    expect(html).toContain(`P(Famous) = ${pct(colTotal(0), 433)}`);
    expect(((colTotal(0) / 433) * (rowTotal('Telepathy') / 433)).toFixed(4)).toBe('0.0054');
    expect(html).toContain('(15/433)(68/433) = 0.0054');
    // The independent 2x2 example really is independent, the second really is not.
    expect(30 / 60).toBe(50 / 100);
    expect(0 / 50).not.toBe(50 / 100);
  });

  it('card 4: the four regions, the union and the exact-independence number', () => {
    const grads = 693, internet = 687, both = 245, n = 2500;
    expect(grads - both).toBe(448);
    expect(internet - both).toBe(442);
    expect(n - (grads + internet - both)).toBe(1365);
    expect(html).toContain('Both 245 · grad only 693 − 245 = 448 · internet only 687 − 245 = 442 · neither 2,500 − 1,135 = 1,365');
    expect(html).toContain(`1135/2500 = ${(100 * 1135 / n).toFixed(1)}%`);
    expect(html).toContain(`P(internet | grad) = ${pct(both, grads)}`);
    expect(html).toContain(`P(internet) = ${pct(internet, n)}`);
    expect(((grads / n) * (internet / n)).toFixed(4)).toBe('0.0762');
    expect((grads * internet / n).toFixed(2)).toBe('190.44');
    expect(html).toContain('693 × 687 / 2500 = 190.44 people');
  });

  it('card 5: the net distribution, its mean and SD, and the one-payout fixes', () => {
    const X = [[8, 1 / 6], [1, 1 / 6], [-2, 4 / 6]];
    const mu = X.reduce((a, [x, p]) => a + x * p, 0);
    const variance = X.reduce((a, [x, p]) => a + (x - mu) ** 2 * p, 0);
    expect(mu).toBeCloseTo(1 / 6, 12);
    expect(variance).toBeCloseTo(485 / 36, 12);
    expect(Math.sqrt(variance).toFixed(2)).toBe('3.67');
    expect(html).toContain('(8 + 1 − 8)/6 = 1/6 ≈ $0.17');
    expect(html).toContain('485/36 ≈ 13.47');
    expect(html).toContain('$3.67');
    // The two fixes land on exactly zero.
    expect((7 + 1 - 8) / 6).toBe(0);
    expect((8 + 0 - 8) / 6).toBe(0);
    expect((Math.sqrt(variance) / Math.sqrt(20)).toFixed(2)).toBe('0.82');
  });

  it('card 6: the exact run probability matches a dynamic program', () => {
    function pRun(n, k) {
      const memo = new Map();
      const f = (i, run) => {
        if (run >= k) return 1;
        if (i === n) return 0;
        const key = `${i},${run}`;
        if (memo.has(key)) return memo.get(key);
        const v = 0.5 * f(i + 1, run + 1) + 0.5 * f(i + 1, 0);
        memo.set(key, v);
        return v;
      };
      return f(0, 0);
    }
    expect(pRun(20, 6).toFixed(4)).toBe('0.1223');
    expect(pRun(20, 5).toFixed(3)).toBe('0.250');
    expect(pRun(20, 7).toFixed(3)).toBe('0.058');
    expect(pRun(20, 8).toFixed(3)).toBe('0.027');
    expect(html).toContain('the exact value 0.1223');
    expect(html).toContain('= 0.1223 (exact value, by computer); 5+: 0.250; 7+: 0.058; 8+: 0.027');
  });

  it('student sheets never print a solved value, a verdict or the exact answers', () => {
    // Every sheet a student receives, with the teacher-only answer blocks removed.
    const studentSheets = [...html.matchAll(/<section class="sheet card student teacher">([\s\S]*?)<\/section>/g)].map((m) => m[1]);
    expect(studentSheets).toHaveLength(12);
    const studentText = studentSheets.join('\n').replace(/<div class="answer">[\s\S]*?<\/div>/g, '');
    expect(studentText).not.toContain('class="answer"');
    for (const leak of [
      '24.7%', '25.7%', '27.9%',            // card 1 percents
      '33.3%', '5.6%',                      // card 2 conditionals
      '3.5%', '0.0054', 'not independent',  // card 3 verdict
      '45.4%', '1,135', '1135', '190.4', '448', '442', '1,365',   // card 4
      '$0.17', '0.17', '$3.67', '+8, +1', 'pays $9', 'pays $2',    // card 5
      '0.122', '0.1223',                    // card 6
      'strongest', 'This is it',
    ]) expect(studentText, leak).not.toContain(leak);
    // The example board, which students do see, is about a claim no card uses.
    const example = html.match(/<section class="sheet example">([\s\S]*?)<\/section>/)[1];
    expect(example).toContain('P(Fly | Healthy) = 14/51 = 27.5%');
    for (const leak of ['45.4%', '190.4', '$0.17', '0.1223', '5/15', '5/89']) expect(example, leak).not.toContain(leak);
    // Exit ticket 1 and the frames accept any kind of number, not only a conditional.
    expect(html).toContain('(fraction, percent, or dollars)');
    expect(html).toContain('a conditional P(___ | ___), a joint, a union, an expected value, or a simulated probability');
    // Friday: four rotations, no docents.
    expect(html).toContain('four rotations of 5 min, no docents');
    expect(html).not.toContain('docent for two rotations');
  });

  it('the Do Nows and the example board', () => {
    expect(html).toContain(`P(Rich | Fly) = ${pct(22, rowTotal('Fly'))}`);
    expect(html).toContain(`(265 + 89 − 48)/433 = 306/433 = ${(100 * 306 / 433).toFixed(1)}%`);
    expect(html).toContain(`P(Fly | Healthy) = ${pct(14, colTotal(2))}`);
    expect(html).toContain(`P(Fly) = ${pct(rowTotal('Fly'), 433)}`);
  });

  it('the four PDFs the Desk links are printed and non-trivial', () => {
    for (const [name, minBytes] of [
      ['u2_poster_group_sheets_student.pdf', 150000],
      ['u2_poster_teacher_key.pdf', 300000],
      ['u2_poster_example_board_demo.pdf', 30000],
      ['u2_poster_walk_sheet.pdf', 30000],
    ]) {
      const size = statSync(resolve(ROOT, 'u2_poster/pdf', name)).size;
      expect(size, name).toBeGreaterThan(minBytes);
      expect(readFileSync(resolve(ROOT, 'u2_poster/pdf', name)).subarray(0, 5).toString()).toBe('%PDF-');
    }
  });
});
