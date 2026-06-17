/**
 * tests/calendar-cohesion.test.js
 *
 * CALENDAR_POLISH_PROPOSAL.md — the "ship-tonight" cohesion/polish/a11y slice for
 * the Desk calendar in ap_stats_roadmap_square_mode.html. Purely additive: every
 * assertion here is for NEW behavior; the frozen calendar-polish.test.js contract
 * is untouched. Mirrors that file's fnBody + vm-runtime approach.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createContext, runInContext } from 'vm';

const REPO_ROOT = resolve(__dirname, '..');
const html = readFileSync(resolve(REPO_ROOT, 'ap_stats_roadmap_square_mode.html'), 'utf-8');

function fnBody(src, name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('not found: ' + name);
  let i = src.indexOf('(', m.index);
  let paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')') { paren--; if (paren === 0) { i++; break; } }
  }
  let depth = 0;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

// --- Item 1: legend decodes every overlay STATE -----------------------------

describe('Item 1 -- legend decodes overlay states (not just unit colors)', () => {
  it('updateLegend emits a collapsed <details class="legend-states"> key', () => {
    const b = fnBody(html, 'updateLegend');
    expect(b).toMatch(/<details class="legend-states">/);
    expect(b).toMatch(/<summary>What the marks mean<\/summary>/);
  });
  it('the key labels every overlay signal', () => {
    const b = fnBody(html, 'updateLegend');
    for (const label of ['Today', 'Up next', 'Done', 'In progress', 'Ahead',
                         'Locked', 'Progress Check', 'Poster', 'Ready', 'Class poll']) {
      expect(b).toContain(label);
    }
  });
  it('swatches reuse the LIVE cell classes so the key cannot drift from the CSS', () => {
    const b = fnBody(html, 'updateLegend');
    expect(b).toMatch(/legend-st cell-today/);
    expect(b).toMatch(/legend-st cal-current/);
    expect(b).toMatch(/legend-st cell-u1 legend-st-done/);
    expect(b).toMatch(/legend-st cell-u1 dc-localpartial/);
    expect(b).toMatch(/legend-st cell-u1 dc-ahead/);
    expect(b).toMatch(/legend-st cell-pc/);
    expect(b).toMatch(/legend-st cell-poster/);
  });
  it('the cal-current swatch shows the magenta identity WITHOUT the pulsing bloom', () => {
    expect(html).toMatch(/\.legend-states \.cal-current\s*\{[^}]*animation:\s*none/);
    expect(html).toMatch(/\.legend-states \.cal-current\s*\{[^}]*#ff2e97/);
    expect(html).toMatch(/\.legend-states \.dc-ahead\s*\{[^}]*animation:\s*none/);
  });
  it('the legend-states key is collapsed by default (no [open] attr in the markup)', () => {
    const b = fnBody(html, 'updateLegend');
    expect(b).not.toMatch(/<details class="legend-states" open>/);
  });
});

// --- Item 2: keyboard-accessible cells --------------------------------------

describe('Item 2 -- cells are keyboard-focusable + activatable', () => {
  it('rCal makes interactive cells role=button + tabbable', () => {
    const b = fnBody(html, 'rCal');
    expect(b).toMatch(/setAttribute\(\s*['"]role['"]\s*,\s*['"]button['"]\s*\)/);
    expect(b).toMatch(/\.tabIndex\s*=\s*0/);
  });
  it('rCal binds Enter/Space to re-use the existing onclick (honors lock + Do-Now guards)', () => {
    const b = fnBody(html, 'rCal');
    expect(b).toMatch(/addEventListener\(\s*['"]keydown['"]/);
    expect(b).toMatch(/ev\.key\s*===\s*['"]Enter['"]/);
    expect(b).toMatch(/c\.click\(\)/);
    // only wired when the cell actually has an onclick (interactive cells only)
    expect(b).toMatch(/if\s*\(\s*c\.onclick\s*\)/);
  });
  it('a classic-Mac dotted :focus-visible ring exists, with a light variant for dark cells', () => {
    expect(html).toMatch(/\.dc:focus-visible\s*\{[^}]*outline:[^}]*dotted/);
    expect(html).toMatch(/\.cell-exam:focus-visible\s*,\s*\.cell-pc:focus-visible\s*\{[^}]*outline-color:\s*var\(--white\)/);
  });
});

// --- Item 3: screen-reader layer -------------------------------------------

describe('Item 3 -- aria-label + screen-reader live region', () => {
  it('rCal sets aria-label on cells and aria-current on the next-up cell', () => {
    const b = fnBody(html, 'rCal');
    expect(b).toMatch(/setAttribute\(\s*['"]aria-label['"]/);
    expect(b).toMatch(/setAttribute\(\s*['"]aria-current['"]\s*,\s*['"]step['"]\s*\)/);
    expect(b).toMatch(/cellAria\(/);
  });
  it('#cg is a labelled group and #cal-sr is an aria-live region', () => {
    expect(html).toMatch(/id="cg"[^>]*role="group"[^>]*aria-label=/);
    expect(html).toMatch(/id="cal-sr"[^>]*aria-live="polite"/);
  });
  it('an .sr-only utility exists (clipped, screen-reader-only)', () => {
    expect(html).toMatch(/\.sr-only\s*\{[^}]*clip:\s*rect\(/);
  });
  it('rCal writes a window summary into #cal-sr (paging announces)', () => {
    const b = fnBody(html, 'rCal');
    expect(b).toMatch(/getElementById\(['"]cal-sr['"]\)/);
    expect(b).toMatch(/Calendar showing/);
  });
  it('rCal appends the human state suffixes to the aria-label', () => {
    const b = fnBody(html, 'rCal');
    expect(b).toMatch(/\(next up\)/);
    expect(b).toMatch(/\(completed\)/);
    expect(b).toMatch(/locked — finish/);
  });
  it('paintDonowCells mirrors the SERVER done/ahead state into the aria-label, idempotently', () => {
    const b = fnBody(html, 'paintDonowCells');
    expect(b).toMatch(/getAttribute\(\s*['"]aria-label['"]\s*\)/);
    expect(b).toMatch(/\(completed, ahead of schedule\)/);
    expect(b).toMatch(/indexOf\(\s*['"]\(completed/);   // dedup guard
  });

  // behavioral: cellAria produces flat, emoji-free text from the schedule entry
  function loadCellAria() {
    const sandbox = {};
    createContext(sandbox);
    runInContext(
      "const R='review',OFF='off',EX='exam',PO='post',NC='noclass';\n" +
      fnBody(html, 'cellAria') + '\nthis.__a = cellAria;', sandbox);
    return sandbox.__a;
  }
  it('cellAria -- sentinels, lessons, PCs, and due dates render as flat text', () => {
    const a = loadCellAria();
    expect(a('off', 'Sep 5')).toBe('Sep 5, no school');
    expect(a('exam', 'May 12')).toBe('May 12, AP Statistics Exam');
    expect(a('noclass', 'Sep 6')).toBe('Sep 6');
    const lesson = a({ t: '1.2', n: 'Describing distributions', u: 1, due: 'Sep 12' }, 'Sep 9');
    expect(lesson).toContain('Sep 9');
    expect(lesson).toContain('1.2 Describing distributions');
    expect(lesson).toContain('due Sep 12');
    expect(a({ kind: 'pc', u: 1, admin: 1 }, 'Sep 1')).toContain('Unit 1 Progress Check 1 of 2');
    // emoji-free (screen readers speak emoji names aloud)
    expect(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(lesson)).toBe(false);
  });
  it('cellAria -- the remaining branches (post / poster / baseline / review / double-topic)', () => {
    const a = loadCellAria();
    expect(a('post', 'May 20')).toBe('May 20, post-exam');
    expect(a({ kind: 'poster', u: 4 }, 'Nov 1')).toContain('Unit 4 Poster gallery walk');
    expect(a({ kind: 'baseline', u: 1 }, 'Sep 2')).toContain('Unit 1 Baseline');
    expect(a({ t: 'review', n: 'Unit 1 review', u: 0 }, 'Oct 1')).toContain('Review: Unit 1 review');
    expect(a({ t: '1.2', n: 'X', u: 1, db: true }, 'Sep 9')).toContain('double topic day');
  });
});

// --- Item 4: stepped hover/press tactility ---------------------------------

describe('Item 4 -- crisp stepped hover/press feedback', () => {
  it('.dc uses a stepped (pixel-crisp) hover transition', () => {
    expect(html).toMatch(/\.dc\s*\{[^}]*transition:[^}]*steps\(2\)/);
  });
  it('the nav button sinks on press (inset + translate)', () => {
    expect(html).toMatch(/\.cal-nav-btn:active[\s\S]*?transform:\s*translate\(1px,\s*1px\)/);
  });
  it('reduced-motion disables the new transitions', () => {
    expect(html).toMatch(/prefers-reduced-motion[^{]*\{\s*\.dc,\s*\.cal-nav-btn\s*\{[^}]*transition:\s*none/);
  });
});

// --- Item 5: one indicator scale -------------------------------------------

describe('Item 5 -- the two corner dots are one 7px scale', () => {
  it('status-dot is 7px to pair with poll-dot', () => {
    // the real (first position:absolute) status-dot rule -- 7px round
    expect(html).toMatch(/\.status-dot\s*\{[^}]*width:7px;\s*height:7px;\s*border-radius:50%/);
  });
  it('mobile shrinks both dots and drops the 2x text', () => {
    expect(html).toMatch(/\.poll-dot,\s*\.status-dot\s*\{\s*width:\s*5px/);
    expect(html).toMatch(/\.dbl\s*\{\s*display:\s*none/);
  });
});

// --- Item 7: named magic numbers (code sharpening) -------------------------

describe('Item 7 -- dim levels are named :root vars', () => {
  it(':root defines the three cell-dim vars', () => {
    expect(html).toMatch(/--cell-past-dim:\s*0\.5/);
    expect(html).toMatch(/--cell-lock-dim:\s*0\.4/);
    expect(html).toMatch(/--cell-done-dim:\s*0\.6/);
  });
  it('the done-greyscale + locked + past rules consume the vars (A1 still matches: grayscale then opacity)', () => {
    expect(html).toMatch(/\.cell-past\s*\{\s*opacity:\s*var\(--cell-past-dim\)/);
    expect(html).toMatch(/\.cell-locked\s*\{[^}]*opacity:\s*var\(--cell-lock-dim\)/);
    expect(html).toMatch(/\.dc-done:not\(\.cell-today\):not\(\.cal-current\)\s*\{[^}]*grayscale[^}]*opacity:\s*var\(--cell-done-dim\)/);
  });
  it('htm names the double-topic badge const (no bare `let db`)', () => {
    const b = fnBody(html, 'htm');
    expect(b).toMatch(/const doubleBadge\s*=/);
    expect(b).not.toMatch(/let db\s*=/);
  });
});
