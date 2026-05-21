/**
 * tests/grade-pipeline-w3-prompts.test.js  (W3.1)
 *
 * Asserts that every in-scope ai-grading-prompts-*.js file contains the
 * hardened verdict instruction mandated by W3.1: the JSON "score" field must
 * be EXACTLY one uppercase letter (E, P, or I) and nothing else.
 *
 * Two assertion layers:
 *   1. Source-level: each file's source contains the SENTINEL string that the
 *      wire-verdict-prompt.mjs script inserts.  This catches any file the
 *      script missed or that was accidentally reverted.
 *   2. Runtime-level: one representative file per score-line pattern group is
 *      imported and its builder is called; the returned prompt string must
 *      contain the SENTINEL.
 *
 * EXCLUDED (not referenced by live worksheets -- confirmed by script):
 *   ai-grading-prompts-edgar-u6.js
 *   ai-grading-prompts-mit6001.js
 *   ai-grading-prompts-mit6001-lec2.js
 *   ai-grading-prompts-study-guide.js
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The sentinel the wire script injects -- presence proves the mandate is there
const SENTINEL = 'EXACTLY one uppercase letter';

// In-scope file list (mirrors wire-verdict-prompt.mjs logic)
const IN_SCOPE_RE = /^ai-grading-prompts(-u[1-9].*|)\.js$/;
const EXCLUDED = new Set([
  'ai-grading-prompts-edgar-u6.js',
  'ai-grading-prompts-mit6001.js',
  'ai-grading-prompts-mit6001-lec2.js',
  'ai-grading-prompts-study-guide.js',
]);

const inScopeFiles = readdirSync(ROOT)
  .filter((f) => IN_SCOPE_RE.test(f) && !EXCLUDED.has(f))
  .sort();

// ── LAYER 1: Source-level sentinel check ─────────────────────────────────────

describe('W3.1 verdict instruction -- source sentinel present in all in-scope files', () => {
  it('detects exactly 69 in-scope files', () => {
    expect(inScopeFiles.length).toBe(69);
  });

  it('excluded files are NOT in the in-scope list', () => {
    for (const f of EXCLUDED) {
      expect(inScopeFiles).not.toContain(f);
    }
  });

  // One test per file -- parametric loop
  for (const f of inScopeFiles) {
    it(`${f} contains the verdict mandate sentinel`, () => {
      const src = readFileSync(resolve(ROOT, f), 'utf8');
      expect(src).toContain(SENTINEL);
    });
  }
});

// ── LAYER 2: Runtime call check (one representative per pattern group) ────────
//
// Pattern groups:
//   A  "E" or "P" or "I"    -> u1-l1 (window style, 4-space indent)
//   B  "E" | "P" | "I"      -> u5-l1-2 (window style, 4-space indent)
//   C  "E|P|I" double-quote -> u5-l3 (window style, 4-space indent)
//   D  'E|P|I' single-quote -> u8-l3 (window style, 4-space indent)
//   module.exports           -> u4-l3 (module.exports + window assignment)
//   module.exports (old u3)  -> ai-grading-prompts.js (module.exports only)

describe('W3.1 verdict instruction -- runtime builder output contains mandate', () => {
  // We test representative files from each pattern group.
  // window-based files: attach to global.window before import, read builder from window.
  // module.exports files: import directly and use exported builder.

  beforeAll(() => {
    global.window = global.window || {};
  });

  it('pattern A (u1-l1, window style): buildReflectionPromptU1L1 output contains mandate', async () => {
    global.window = global.window || {};
    await import('../ai-grading-prompts-u1-l1.js');
    const builder = global.window.buildReflectionPromptU1L1;
    expect(typeof builder).toBe('function');
    const prompt = builder('reflect1', 'test answer');
    expect(prompt).toContain(SENTINEL);
  });

  it('pattern B (u5-l1-2, window style): buildReflectionPromptU5L12 output contains mandate', async () => {
    global.window = global.window || {};
    await import('../ai-grading-prompts-u5-l1-2.js');
    const builder = global.window.buildReflectionPromptU5L12;
    expect(typeof builder).toBe('function');
    const prompt = builder('reflect1', 'test answer');
    expect(prompt).toContain(SENTINEL);
  });

  it('pattern C (u5-l3, window style): buildReflectionPromptU5L3 output contains mandate', async () => {
    global.window = global.window || {};
    await import('../ai-grading-prompts-u5-l3.js');
    const builder = global.window.buildReflectionPromptU5L3;
    expect(typeof builder).toBe('function');
    const prompt = builder('reflect1', 'test answer');
    expect(prompt).toContain(SENTINEL);
  });

  it('pattern D (u8-l3, single-quote style): buildReflectionPromptU8L3 output contains mandate', async () => {
    global.window = global.window || {};
    await import('../ai-grading-prompts-u8-l3.js');
    const builder = global.window.buildReflectionPromptU8L3;
    expect(typeof builder).toBe('function');
    const prompt = builder('reflect1', 'test answer');
    expect(prompt).toContain(SENTINEL);
  });

  it('module.exports style (u4-l3): buildReflectionPromptU4L3 output contains mandate', async () => {
    const mod = await import('../ai-grading-prompts-u4-l3.js');
    const builder = mod.buildReflectionPromptU4L3;
    expect(typeof builder).toBe('function');
    const prompt = builder('reflect1', 'test answer');
    expect(prompt).toContain(SENTINEL);
  });

  it('module.exports style (ai-grading-prompts.js): buildReflectionPrompt output contains mandate', async () => {
    const mod = await import('../ai-grading-prompts.js');
    const builder = mod.buildReflectionPrompt;
    expect(typeof builder).toBe('function');
    const prompt = builder('reflect53', 'test answer');
    expect(prompt).toContain(SENTINEL);
  });

  it('pattern C (u8-l1, window style): buildReflectionPromptU8L1 output contains mandate', async () => {
    global.window = global.window || {};
    await import('../ai-grading-prompts-u8-l1.js');
    const builder = global.window.buildReflectionPromptU8L1;
    expect(typeof builder).toBe('function');
    const prompt = builder('reflect1', 'test answer');
    expect(prompt).toContain(SENTINEL);
  });

  it('pattern A late (u9-l4, window style): buildReflectionPromptU9L4 output contains mandate', async () => {
    global.window = global.window || {};
    await import('../ai-grading-prompts-u9-l4.js');
    const builder = global.window.buildReflectionPromptU9L4;
    expect(typeof builder).toBe('function');
    const prompt = builder('reflect1', 'test answer');
    expect(prompt).toContain(SENTINEL);
  });
});

// ── LAYER 3: scope derived from actual worksheet wiring ──────────────────────
// Codex W3 MINOR fold: layers 1-2 use a regex that mirrors the wire script's
// own scope logic. This layer derives the in-scope set from what the 69 live
// worksheets actually <script src>, so a worksheet pointing at an un-hardened
// prompt file is caught even if the regex and the script agree on the wrong set.

describe('W3.1 scope -- every prompt file a live worksheet references is hardened', () => {
  it('no live worksheet references an un-hardened (out-of-scope) prompt file', () => {
    const worksheets = readdirSync(ROOT).filter((f) => /^u\d+_lesson.+_live\.html$/.test(f));
    const referenced = new Set();
    for (const w of worksheets) {
      const html = readFileSync(resolve(ROOT, w), 'utf8');
      const re = /ai-grading-prompts[\w.-]*\.js/g;
      let m;
      while ((m = re.exec(html)) !== null) referenced.add(m[0]);
    }
    expect(referenced.size, 'live worksheets reference prompt files').toBeGreaterThan(0);
    for (const f of referenced) {
      expect(inScopeFiles, `${f} is referenced by a live worksheet but not hardened`).toContain(f);
    }
  });
});
