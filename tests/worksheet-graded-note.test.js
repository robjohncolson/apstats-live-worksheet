// worksheet-graded-note.test.js -- behavior of the W2.6 "graded from your saved
// answer" note that every worksheet shows under a free-response box whose grade
// was restored from the ledger (scripts/wire-frq-graded-note.mjs, 2026-09-09).
//
// Why: a student's saved answers were auto-graded overnight with no explanation;
// he saw a lower grade and a 100% badge that disagreed. The note says WHEN, WHO,
// WHAT and WHY, and must never go stale (edit / regrade) or inject HTML.
//
// Runs the real `_markAutoGraded` extracted from u1_lesson1_live.html (the 69
// worksheets carry the identical block — tests/worksheet-hydration.test.js pins that).
//
// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { JSDOM } from 'jsdom';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(resolve(ROOT, 'u1_lesson1_live.html'), 'utf8');

function extractFn(src, name) {
  const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(src);
  if (!m) throw new Error('fn not found: ' + name);
  const open = src.indexOf('{', m.index);
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced braces: ' + name);
}

function boot() {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div class="question"><textarea id="reflect1" class="graded-P"></textarea></div></body></html>', { url: 'https://ws.test' });
  const win = dom.window;
  const ctx = createContext(win);
  runInContext(extractFn(HTML, '_markAutoGraded') + '\nwindow.__mark = _markAutoGraded;', ctx);
  const ta = win.document.getElementById('reflect1');
  return { win, ta, mark: (...a) => win.__mark(ta, ...a), note: () => win.document.querySelector('.frq-graded-note[data-for="reflect1"]') };
}

const tick = () => new Promise((r) => setTimeout(r, 0));   // MutationObserver callbacks are microtasks

describe('worksheet graded note — content', () => {
  it('names the overnight sweep, the date, the grade, the feedback, and what to do', () => {
    const { note, mark } = boot();
    mark('P', 'Name the variable type.', '2026-08-19T05:12:00.000Z', 'ai-batch');
    const n = note();
    expect(n).not.toBeNull();
    expect(n.getAttribute('role')).toBe('status');
    expect(n.querySelector('strong').textContent).toMatch(/^Auto-graded Aug \d{1,2} from your saved answer: P \(partial\)$/);
    expect(n.textContent).toContain('Name the variable type.');
    expect(n.textContent).toContain('a regrade never lowers your score');
  });

  it('a teacher override says so; an in-session grade does NOT claim the saved-answer sweep; E has no revise tip', () => {
    const a = boot();
    a.mark('E', '', '2026-09-09T20:00:00.000Z', 'teacher');
    expect(a.note().querySelector('strong').textContent).toMatch(/^Graded by your teacher Sep \d{1,2} from your saved answer: E \(full credit\)$/);
    expect(a.note().textContent).not.toContain('Revise your answer');

    const b = boot();
    b.mark('E', 'Nice.', '2026-09-09T20:00:00.000Z', null);
    expect(b.note().querySelector('strong').textContent).toMatch(/^Graded Sep \d{1,2}: E \(full credit\)$/);
    expect(b.note().textContent).toContain('Nice.');

    const c = boot();
    c.mark('I', 'Try again.', null, 'ai-batch');
    expect(c.note().querySelector('strong').textContent).toBe('Auto-graded from your saved answer: I (no credit yet)');
  });

  it('renders feedback as text only (no HTML injection) and dedupes per textarea', () => {
    const { win, note, mark } = boot();
    mark('P', '<img src=x onerror="window.__pwned=1"><b>bold</b>', '2026-08-19T05:12:00.000Z', 'ai-batch');
    mark('P', 'second call', '2026-08-19T05:12:00.000Z', 'ai-batch');
    expect(win.document.querySelectorAll('.frq-graded-note')).toHaveLength(1);
    expect(note().querySelector('img')).toBeNull();
    expect(note().querySelector('b')).toBeNull();
    expect(note().textContent).toContain('<img src=x onerror="window.__pwned=1"><b>bold</b>');
    expect(win.__pwned).toBeUndefined();
  });

  it('never throws on a detached or missing textarea', () => {
    const { win } = boot();
    expect(() => win.__mark(null, 'P', 'x', null, 'ai-batch')).not.toThrow();
    const orphan = win.document.createElement('textarea');
    expect(() => win.__mark(orphan, 'P', 'x', null, 'ai-batch')).not.toThrow();
  });
});

describe('worksheet graded note — never stale', () => {
  it('disappears the moment the student edits the answer', () => {
    const { win, ta, note, mark } = boot();
    mark('P', 'Name the variable type.', '2026-08-19T05:12:00.000Z', 'ai-batch');
    expect(note()).not.toBeNull();
    ta.value = 'revised';
    ta.dispatchEvent(new win.Event('input', { bubbles: true }));
    expect(note()).toBeNull();
  });

  it('disappears when the grade class changes (a regrade), but survives unrelated class changes', async () => {
    const { ta, note, mark } = boot();
    mark('P', 'Name the variable type.', '2026-08-19T05:12:00.000Z', 'ai-batch');
    ta.classList.add('restored');          // _markRestored-style decoration
    await tick();
    expect(note()).not.toBeNull();
    ta.classList.remove('graded-P');
    ta.classList.add('graded-E');          // Grade-with-AI raised it
    await tick();
    expect(note()).toBeNull();
  });
});

describe('worksheet graded note — W2.7 status clarity (2026-09-11)', () => {
  // Why: a teacher saw "✓ Graded: Incorrect" (live) AND "Graded: I (not yet)" (this note)
  // under one box, read "(not yet)" as "ungraded", and concluded written work was never
  // graded. One verdict per box; the note names what is still missing; wording is honest.
  it('says "no credit yet" (not "not yet") and lists the rubric elements still missing', () => {
    const { note, mark } = boot();
    mark('I', 'Vague on the variable.', '2026-09-10T05:00:00.000Z', 'ai-batch', ['Names the variable', 'Explains variation']);
    const n = note();
    expect(n.querySelector('strong').textContent).toMatch(/: I \(no credit yet\)$/);
    expect(n.textContent).toContain('Still missing: Names the variable; Explains variation');
    expect(n.textContent).toContain('Add the missing points above');
    expect(n.textContent).not.toContain('not yet');
  });

  it('omits the "Still missing" line when nothing is missing or the grade is E', () => {
    const a = boot(); a.mark('P', 'Close.', null, 'ai-batch', []);
    expect(a.note().textContent).not.toContain('Still missing');
    const b = boot(); b.mark('E', 'Nice.', null, 'ai-batch', ['ignored for E']);
    expect(b.note().textContent).not.toContain('Still missing');
  });

  it('removes itself when the live feedback card (.ai-feedback) renders for the same box', async () => {
    const { win, note, mark } = boot();
    const host = win.document.createElement('div');
    host.id = 'reflect1-feedback';
    win.document.querySelector('.question').appendChild(host);
    mark('I', 'Try again.', null, 'ai-batch', ['x']);
    expect(note()).not.toBeNull();
    const card = win.document.createElement('div');
    card.className = 'ai-feedback';
    host.appendChild(card);                       // what showFeedback() does on the server verdict
    await tick();
    expect(note()).toBeNull();
  });

  it('does not render at all if the live feedback card is already there', () => {
    const { win, note, mark } = boot();
    const host = win.document.createElement('div');
    host.id = 'reflect1-feedback';
    host.innerHTML = '<div class="ai-feedback">already live</div>';
    win.document.querySelector('.question').appendChild(host);
    mark('I', 'Try again.', null, 'ai-batch');
    expect(note()).toBeNull();
  });
});
