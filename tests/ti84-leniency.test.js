// Truth table for the method-aware emulator leniency
// (TI84_TRAINER_AUTOFILL_REWRITE_SPEC.md §4, commit 3/3).
//
// The hard numeric check returns ONLY when every filled data target went in
// via variable transfer (soak-proven: 120/120). Any keystroke-filled target —
// fallback flag, transfer failure, matrix data, manual entry — keeps the
// leniency that protects students from flaky keystroke entry.
//
// The predicate trio is extracted from app.js source (same pattern as the
// CHAR_TO_BUTTON extraction in ti84-data-trust.test.js); the recording of
// app.clutch.dataFillMethods is pinned by ti84-autofill-fallback.test.js.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const appSrc = fs.readFileSync(
  path.resolve(__dirname, '..', 'ti84-trainer-v2', 'app.js'),
  'utf8',
);

function extract(name) {
  const match = appSrc.match(new RegExp(`  function ${name}\\([\\s\\S]*?\\n  \\}`));
  if (!match) throw new Error(`Could not extract ${name} from app.js`);
  return match[0];
}

const predicateSrc = [
  extract('problemUsesData'),
  extract('allDataTransferFilled'),
  extract('emulatorDataLeniency'),
].join('\n');

// Builds the extracted predicates around a fake `app` state.
function leniencyFor({ physicalMode, realEmulator, problem, fillMethods }) {
  const app = {
    persisted: { physicalMode },
    bridge: { isRealEmulator: () => realEmulator },
    walkthrough: { problem },
    clutch: { dataFillMethods: fillMethods },
  };
  return new Function('app', `${predicateSrc}\nreturn emulatorDataLeniency();`)(app);
}

const DATA_PROBLEM = { values: { data: [1, 2, 3, 4, 5] } };
const WIZARD_PROBLEM = { values: { p0: 0.7, x: 126, n: 200 } };

describe('emulatorDataLeniency truth table', () => {
  const CASES = [
    // [label, config, expected leniency]
    ['physical mode is never lenient', { physicalMode: true, realEmulator: true, problem: DATA_PROBLEM, fillMethods: {} }, false],
    ['mock emulator is never lenient', { physicalMode: false, realEmulator: false, problem: DATA_PROBLEM, fillMethods: {} }, false],
    ['non-data (wizard-input) problems are never lenient', { physicalMode: false, realEmulator: true, problem: WIZARD_PROBLEM, fillMethods: {} }, false],
    ['manual entry (empty fill map) stays lenient', { physicalMode: false, realEmulator: true, problem: DATA_PROBLEM, fillMethods: {} }, true],
    ['keystroke-filled data stays lenient', { physicalMode: false, realEmulator: true, problem: DATA_PROBLEM, fillMethods: { L1: 'keys' } }, true],
    ['transfer-filled data gets the hard check', { physicalMode: false, realEmulator: true, problem: DATA_PROBLEM, fillMethods: { L1: 'transfer' } }, false],
    ['all-transfer across two lists gets the hard check', { physicalMode: false, realEmulator: true, problem: DATA_PROBLEM, fillMethods: { L1: 'transfer', L2: 'transfer' } }, false],
    ['mixed transfer + keystroke matrix stays lenient (Codex amendment)', { physicalMode: false, realEmulator: true, problem: DATA_PROBLEM, fillMethods: { L1: 'transfer', '[A]': 'keys' } }, true],
    ['transfer list + keystroke list stays lenient', { physicalMode: false, realEmulator: true, problem: DATA_PROBLEM, fillMethods: { L1: 'transfer', L3: 'keys' } }, true],
  ];

  it.each(CASES)('%s', (label, config, expected) => {
    expect(leniencyFor(config)).toBe(expected);
  });

  it('missing dataFillMethods behaves like an empty map (lenient)', () => {
    expect(leniencyFor({
      physicalMode: false, realEmulator: true, problem: DATA_PROBLEM, fillMethods: undefined,
    })).toBe(true);
  });

  it('data problems are recognized by any of the four data shapes', () => {
    for (const key of ['data', 'L1', 'observed', 'matrix']) {
      expect(leniencyFor({
        physicalMode: false,
        realEmulator: true,
        problem: { values: { [key]: [1, 2] } },
        fillMethods: {},
      })).toBe(true);
    }
  });
});
