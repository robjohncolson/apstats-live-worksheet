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
    for (const edition of ['student', 'teacher', 'example', 'walk', 'board', 'check', 'screen']) {
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
    expect(html).toContain('The number it really depends on is ______ = ______. So the claim is (supported / partly supported / not supported) because ______.');
    // The sheets never hand over the denominators, the method or the reasoning.
    for (const leak of ['15 and 89', 'row total as the denominator', 'The mistake this busts', 'so of course']) expect(studentText, leak).not.toContain(leak);
    // Friday: one rotation per other poster (Period B has four posters), no docents.
    expect(html).toContain('three rotations of 6 min, no docents');
    expect(html).not.toContain('docent for two rotations');
  });

  it('Thursday: the partner check sits between the sketch and the big paper, and its sheet gives nothing away', () => {
    // Period B as it ran on 11/10: posters 1, 2, 3 and 6; partner groups 2 with 3 and 1 with 6.
    expect(html).toContain('<b>Partner groups for Thursday:</b> poster 2 with poster 3, poster 1 with poster 6.');
    expect(html).toContain('Thu 11/12 · 09:55-11:00 · observed: sketch, check, build (65 min)');
    // The run of show fills the 65-minute block with no gap and no overlap.
    const thu = html.match(/<h2>Thu 11\/12[\s\S]*?<\/table>/)[0];
    const spans = [...thu.matchAll(/<tr><td>(\d+)-(\d+)<\/td>/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(spans.length).toBeGreaterThan(5);
    expect(spans[0][0]).toBe(0);
    expect(spans[spans.length - 1][1]).toBe(65);
    for (let i = 1; i < spans.length; i += 1) expect(spans[i][0]).toBe(spans[i - 1][1]);
    // Sketch, then the check, then the build: nothing is lettered before another group has tested it.
    expect(thu.indexOf('<b>Partner check</b>')).toBeGreaterThan(thu.indexOf('<b>Sketch.</b>'));
    expect(thu.indexOf('<b>Build.</b>')).toBeGreaterThan(thu.indexOf('<b>Partner check</b>'));
    // Work first, look second: mockups go face down before the partner's page is handed out,
    // and none is turned over until the checkers have had their nine minutes with a clean copy.
    const hidden = thu.indexOf('Minute 17: "Mockups face down."');
    expect(hidden).toBeGreaterThan(-1);
    expect(thu.indexOf('the partner\'s clean page 1 to each group')).toBeGreaterThan(hidden);
    expect(thu).toContain('no mockup is turned over before minute 26');

    // The one sheet students hold on Thursday: three steps, four frames, and no number, percent or verdict.
    const sheet = html.match(/<section class="sheet teacher check">([\s\S]*?)<\/section>/)[1];
    for (const step of ['<b>WORK</b>', '<b>LOOK</b>', '<b>FIX</b>']) expect(sheet).toContain(step);
    expect(sheet.indexOf('<b>LOOK</b>')).toBeGreaterThan(sheet.indexOf('<b>WORK</b>'));
    expect(sheet.indexOf('<b>FIX</b>')).toBeGreaterThan(sheet.indexOf('<b>LOOK</b>'));
    expect(sheet).toContain('Your mockup stays face down.');
    expect(sheet).toContain('from the clean copy');
    expect(sheet).toContain('<b>Authors:</b> the group whose claim it is. <b>Checkers:</b> the other group.');
    expect(sheet).toContain('Checkers ask. Authors decide.');
    expect(sheet).toContain('"We got ______ out of ______. You got ______ out of ______."');
    expect(sheet).toContain('"Your checklist still needs ______."');
    expect(sheet).toContain('"A reader on Friday would ask: ______?"');
    // Authors may defend a sound verdict: the frame never forces a change.
    expect(sheet).toContain('"We will change / keep ______ because ______."');
    // The authors' sheet stays on the authors' table, so the feedback lands on the right poster.
    expect(sheet).toContain('Leave your card and this sheet on your table; bring your work.');
    expect(sheet).toContain("One checker writes on the bottom half of the authors' sheet, the one on their table.");
    const sheetText = sheet.replace('Thu 11/12', '');
    expect(sheetText).not.toMatch(/\d\s*\/\s*\d/);
    expect(sheetText).not.toMatch(/\d\s*%/);
    for (const leak of ['supported', 'mutually exclusive', 'independent', 'denominator', 'row total', 'column total', 'cannot', 'can calculate']) expect(sheetText, leak).not.toContain(leak);

    // The shared page (screen or table copy): the table and the four claims, word for word as on the cards.
    const shared = html.match(/<section class="sheet teacher screen">([\s\S]*?)<\/section>/)[1];
    const claimOf = (title) => html.slice(html.indexOf(`<h1>${title}</h1>`)).match(/<p class="q">([\s\S]*?)<\/p>/)[1];
    for (const [n, title] of [[1, 'Poster 1 — Who wants to be rich?'], [2, 'Poster 2 — The flipped headline'], [3, 'Poster 3 — Can\'t happen together, so unrelated?'], [6, 'Poster 6 (spare) — Rigged coin?']]) {
      expect(shared).toContain(`<h3>Poster ${n}</h3><p class="q">${claimOf(title)}</p>`);
    }
    expect(shared).toContain('<tr><td>Telepathy</td><td>0</td><td>49</td><td>0</td><td>19</td><td class="t">68</td></tr>');
    expect(shared).not.toContain('class="answer"');
    expect(shared).not.toMatch(/\d\s*%/);

    // What the key tells the teacher the checkers should find.
    expect(html).toContain(`26/101 = ${(100 * 26 / 101).toFixed(1)}% of Freeze Time fans chose Rich, against 102/433 = ${(100 * 102 / 433).toFixed(1)}% of all students`);
    expect(html).toContain(`26/433 = ${(100 * 26 / 433).toFixed(1)}% and 26/102 = ${(100 * 26 / 102).toFixed(1)}% are the two traps`);
    expect(html).toContain(`(Telepathy is 19/68 = ${(100 * 19 / 68).toFixed(1)}%.)`);
    expect(html).toContain(`P(Telepathy | Famous) = 0/15 = 0 against P(Telepathy) = 68/433 = ${(100 * 68 / 433).toFixed(1)}%`);
    // Six checker trials at p = 0.1223 (the card 6 test proves that value): none with a run of 6+, or exactly one.
    const p = 0.1223;
    expect(Math.round(100 * (1 - p) ** 6)).toBe(46);
    expect(Math.round(100 * 6 * p * (1 - p) ** 5)).toBe(38);
    expect(html).toContain('no run of 6 or more about 46% of the time, and exactly one about 38%');
    // The two tempting wrong answers: six chosen flips (1/64), then 15 overlapping starts added up (15/64).
    expect((100 / 64).toFixed(1)).toBe('1.6');
    expect(20 - 6 + 1).toBe(15);
    expect(Math.round(100 * 15 / 64)).toBe(23);
    expect(html).toContain('15 × 1/64 = 23%');
    // The observer card's three parts add up to the block.
    const plan = html.match(/<h1>Observer card[\s\S]*?<\/table>/)[0];
    const parts = [...plan.matchAll(/<b>(?:Preparing|Interacting|Extending) \((\d+) min\)\.<\/b>/g)].map((m) => Number(m[1]));
    expect(parts).toEqual([6, 31, 28]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(65);
  });

  it('Friday walk sheet lists the four posters Period B made', () => {
    const walk = html.match(/<section class="sheet walk">([\s\S]*?)<\/section>/)[1];
    for (const row of ['#1 Who wants to be rich?', '#2 The flipped headline', '#3 Can\'t happen together, so unrelated?', '#6 Rigged coin?']) {
      expect(walk).toContain(`<tr><td>${row}</td>`);
    }
    expect(walk).not.toContain('#4');
    expect(walk).not.toContain('#5');
    expect(walk).toContain('given · independent · mutually exclusive · simulation');
  });

  it('the Do Nows and the example board', () => {
    expect(html).toContain(`P(Rich | Fly) = ${pct(22, rowTotal('Fly'))}`);
    expect(html).toContain(`(265 + 89 − 48)/433 = 306/433 = ${(100 * 306 / 433).toFixed(1)}%`);
    expect(html).toContain(`P(Fly | Healthy) = ${pct(14, colTotal(2))}`);
    expect(html).toContain(`P(Fly) = ${pct(rowTotal('Fly'), 433)}`);
  });

  it('the four PDFs the Desk links, and the three Thursday files, are printed and non-trivial', () => {
    for (const [name, minBytes] of [
      ['u2_poster_group_sheets_student.pdf', 150000],
      ['u2_poster_teacher_key.pdf', 200000],   // rewritten without link annotations (they carried local file paths)
      ['u2_poster_example_board_demo.pdf', 30000],
      ['u2_poster_walk_sheet.pdf', 30000],
      ['u2_poster_partner_check.pdf', 25000],       // Thursday: one per group
      ['u2_poster_partner_worksheets.pdf', 50000],  // Thursday: page 1 of cards 1, 2, 3 and 6, clean, for the checkers
      ['u2_poster_thursday_screen.pdf', 25000],     // Thursday: the table and the four claims, for the projector
    ]) {
      const size = statSync(resolve(ROOT, 'u2_poster/pdf', name)).size;
      expect(size, name).toBeGreaterThan(minBytes);
      expect(readFileSync(resolve(ROOT, 'u2_poster/pdf', name)).subarray(0, 5).toString()).toBe('%PDF-');
    }
  });
});
