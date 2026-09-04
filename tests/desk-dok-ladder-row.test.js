// desk-dok-ladder-row.test.js — the resource panel's DOK-3 links are TEACHER ONLY.
//
// APS_DOK_LADDER_SPEC.md §8 Phase 5a + the teacher's 2026-09-04 decision: the paper
// DOK-3 sheet is the human-graded channel and must not compete with the AI-graded
// work for students' attention, so the Desk shows Board / Sheet / Key links only when
// _deskIsTeacher() is true (which is also false in view-as). URLs are derived from the
// OLD topic key — no Supabase column.
//
// Static parse of the Desk HTML source + execution of the extracted helper.
//
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESK = readFileSync(resolve(repo, 'ap_stats_roadmap_square_mode.html'), 'utf8');

function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  const i = src.indexOf('{', m.index);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced braces for ' + name);
}

function rowFor(topic, isTeacher) {
  const src = fnBody(DESK, '_dokLadderRowHtml');
  // eslint-disable-next-line no-new-func
  return new Function('_deskIsTeacher', src + '\nreturn _dokLadderRowHtml;')(() => isTeacher)(topic);
}

describe('Desk: DOK-3 ladder row is teacher-only', () => {
  it('renders Board / Sheet / Key links for a teacher, derived from the OLD topic key', () => {
    const html = rowFor('1.6', true);
    expect(html).toContain('dok/pdf/aps_1.6_board.pdf');
    expect(html).toContain('dok/pdf/aps_1.6_student.pdf');
    expect(html).toContain('dok/pdf/aps_1.6_teacher.pdf');
    expect(html).toContain('teacher only');
    expect(html).not.toMatch(/supabase|lesson_urls/i);
  });

  it('renders NOTHING for a student (or a teacher in view-as, where _deskIsTeacher is false)', () => {
    expect(rowFor('1.6', false)).toBe('');
  });

  it('renders nothing for review days / non-topic keys', () => {
    expect(rowFor('REVIEW', true)).toBe('');
    expect(rowFor('', true)).toBe('');
    expect(rowFor(undefined, true)).toBe('');
  });

  it('is wired into showResourcePanel before the Today\'s Lesson block', () => {
    const panel = fnBody(DESK, 'showResourcePanel');
    const call = panel.indexOf("lessonHtml += _dokLadderRowHtml(inf.t);");
    const block = panel.indexOf("Today\\'s Lesson");
    expect(call).toBeGreaterThan(-1);
    expect(block).toBeGreaterThan(call);
  });

  it('never leaks the links into student-facing markup outside the helper', () => {
    // The only CODE that mentions dok/pdf is inside the gated helper (comments may).
    const helper = fnBody(DESK, '_dokLadderRowHtml');
    const outside = DESK.replace(helper, '');
    const codeLines = outside.split('\n').filter((l) => l.includes('dok/pdf/') && !/^\s*\/\//.test(l));
    expect(codeLines).toEqual([]);
  });
});
