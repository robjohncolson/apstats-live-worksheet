// U3 commit-1 acceptance (TI84_TRAINER_UNIT3_SPEC.md §1, Codex contract):
// prove the MATH▸PRB command substrate END-TO-END with literal keys in
// native/no-ROM mode, BEFORE any Unit 3 procedure content exists.
//
//   5 STO→ rand ENTER                        (seeding: STO→ + direct paste)
//   MATH →→→ PRB → 8:randIntNoRep(           (3 RIGHTs; opens the wizard)
//   1 ↓ 30 ↓ 5 ↓ Paste, ENTER                (wizard fields → compose → run)
//
// The mock PRNG is deterministic (seeded from the stored rand value) and is
// NOT TI's RNG — the test asserts PROPERTIES: 5 entries, integers, in
// [1, 30], distinct; plus same-seed reproducibility.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const V2 = path.resolve(__dirname, '..', 'ti84-trainer-v2');

const NATIVE_FILES = [
  'event-bus.js', 'stat-math.js', 'menu-tables.js', 'field-tables.js',
  'menu-nav.js', 'form-engine.js', 'result-formatter.js', 'screen-renderer.js',
  'ti84-native.js',
];

for (const f of NATIVE_FILES) {
  new Function(fs.readFileSync(path.join(V2, 'native', f), 'utf8'))();
}

function bootNative() {
  const native = window.TI84Native.create();
  native.reset();
  return native;
}

function press(native, ...keys) {
  for (const key of keys) native.pressKey(key);
}

const lastLine = (native) => native._getHomeLines().at(-1);

// PRB is THREE RIGHTs from MATH on the real calculator (MATH → NUM →
// CMPLX → PRB) — the physical-calculator smoke caught the earlier
// one-RIGHT simplification teaching wrong keys. randIntNoRep( opens a
// WIZARD prompt (wizards ON, the CE default) — the second smoke caught
// the raw comma-syntax model; Paste composes the command, ENTER runs it.

// 5 STO→ [MATH ▸▸▸ PRB ▸ 1:rand] ENTER — rand takes no args, pastes directly
function seedRand(native, seedKey) {
  press(native, seedKey, 'STO', 'MATH', 'RIGHT', 'RIGHT', 'RIGHT', 'ONE', 'ENTER');
}

// [MATH ▸▸▸ PRB ▸ 8:randIntNoRep(] wizard: 1 ↓ 30 ↓ 5 ↓ Paste, ENTER runs
function drawNoRep(native) {
  press(native, 'MATH', 'RIGHT', 'RIGHT', 'RIGHT', 'EIGHT',
    'ONE', 'DOWN', 'THREE', 'ZERO', 'DOWN', 'FIVE', 'DOWN', 'ENTER', 'ENTER');
}

function parseList(line) {
  expect(line, 'expected a {…} list line').toMatch(/^\{.+\}$/);
  return line.slice(1, -1).split(' ').map(Number);
}

let native;
beforeEach(() => {
  native = bootNative();
});

describe('MATH▸PRB command substrate (literal keys, mock mode)', () => {
  it('MATH tab order matches the real calculator: NUM, CMPLX, then PRB', () => {
    press(native, 'MATH');
    expect(native.getScreen().id).toBe('math-menu');
    // Regression pin (physical smoke 2026-07-05): ONE right must NOT be PRB.
    press(native, 'RIGHT');
    expect(native.getScreen().id).toBe('math-num-menu');
    press(native, 'RIGHT');
    expect(native.getScreen().id).toBe('math-cmplx-menu');
    press(native, 'RIGHT');
    expect(native.getScreen().id).toBe('math-prb-menu');
    press(native, 'RIGHT');
    expect(native.getScreen().id).toBe('math-frac-menu');
  });

  it('5 STO→ rand ENTER stores the seed and echoes it', () => {
    seedRand(native, 'FIVE');
    const lines = native._getHomeLines();
    expect(native.getScreen().id).toBe('home');
    expect(lines.at(-2)).toBe('5→rand');
    expect(lines.at(-1)).toBe('5');
  });

  it('randIntNoRep(1,30,5) returns 5 distinct integers in [1,30]', () => {
    seedRand(native, 'FIVE');
    drawNoRep(native);
    const values = parseList(lastLine(native));
    expect(values).toHaveLength(5);
    for (const v of values) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(30);
    }
    expect(new Set(values).size).toBe(5);
  });

  it('the mock PRNG is deterministic under the stored seed', () => {
    seedRand(native, 'FIVE');
    drawNoRep(native);
    const first = lastLine(native);

    const second = bootNative();
    seedRand(second, 'FIVE');
    drawNoRep(second);
    expect(lastLine(second)).toBe(first);
  });

  it('rand alone returns a number in (0, 1)', () => {
    seedRand(native, 'SEVEN');
    press(native, 'MATH', 'RIGHT', 'RIGHT', 'RIGHT', 'ONE', 'ENTER');
    const value = Number(lastLine(native));
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(1);
  });

  it('selecting randIntNoRep( opens its wizard prompt, and Paste composes the command', () => {
    press(native, 'MATH', 'RIGHT', 'RIGHT', 'RIGHT', 'EIGHT');
    expect(native.getScreen().id).toBe('randintnorep-wizard');
    press(native, 'ONE', 'DOWN', 'THREE', 'ZERO', 'DOWN', 'FIVE', 'DOWN', 'ENTER');
    expect(native.getScreen().id).toBe('home');
    // The composed command sits on the entry line awaiting the second ENTER.
    press(native, 'ENTER');
    expect(native._getHomeLines().at(-2)).toBe('randIntNoRep(1,30,5)');
  });

  it('asking for more distinct values than the range yields ERR:DOMAIN', () => {
    press(native, 'MATH', 'RIGHT', 'RIGHT', 'RIGHT', 'EIGHT',
      'ONE', 'DOWN', 'THREE', 'DOWN', 'NINE', 'DOWN', 'ENTER', 'ENTER');
    expect(lastLine(native)).toBe('ERR:DOMAIN');
  });

  it('an unmodeled entry yields ERR:SYNTAX, never a crash', () => {
    press(native, 'ONE', 'DECIMAL', 'FIVE', 'ENTER');
    expect(lastLine(native)).toBe('ERR:SYNTAX');
  });

  it('CLEAR wipes the entry line first, then history', () => {
    press(native, 'FIVE', 'STO');
    press(native, 'CLEAR');
    press(native, 'ENTER'); // empty entry — no evaluation
    expect(native._getHomeLines()).toHaveLength(0);
  });

  it('existing menus are unaffected by the digit conversion (STAT still works)', () => {
    press(native, 'STAT');
    expect(native.getScreen().id).toBe('stat-menu');
  });
});
