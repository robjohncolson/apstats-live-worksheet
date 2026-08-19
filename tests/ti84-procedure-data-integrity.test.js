// Pins the fix for TI-84 trainer Defect 2 (2026-08-06):
//  - a highlighted Plot Type icon does not commit until ENTER is pressed on
//    the real ROM. Steps that scroll the icon row (`repeatable: true`,
//    key RIGHT, on a plot1-editor or wizard screen) must be followed by a
//    real ENTER step on the same screen -- highlighting alone is not enough.
//  - scatterplot/residual-plot must actually press ENTER to commit the
//    already-highlighted Scatter icon, not a bare RIGHT that pretends to.
//  - the DISTR menu's ALPHA-shortcut lettering drifted after OS 5.8 inserted
//    C:invBinom(: geometpdf/geometcdf must use COS/TAN, not the old SIN/COS.
//  - a `repeatable` flag on a one-shot ALPHA menu shortcut is meaningless
//    (the shortcut fires once) and was a leftover from before this fix.
//
// Pure JSON assertions over ti84-procedures-data.json -- no jsdom, no app.js.
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);

// Overridable so this same file can be pointed at a pre-fix snapshot to prove
// it is a real guard, without touching the file under normal test runs.
const DATA_PATH = process.env.TI84_PROC_DATA_PATH
  ? path.resolve(process.env.TI84_PROC_DATA_PATH)
  : path.resolve(__dirname, '..', 'ti84-procedures-data.json');

const data = require(DATA_PATH);

const ARROW_KEYS = new Set(['UP', 'DOWN', 'LEFT', 'RIGHT']);
const PARAMETER_PATTERN = /^\{.+\}$/;
// One-shot ALPHA menu shortcuts (STAT>TESTS, DISTR letters): a single press
// fires the shortcut, so `repeatable` on these keys is meaningless.
const ONE_SHOT_SHORTCUT_KEYS = new Set(['MATH', 'APPS', 'PRGM', 'X_INVERSE', 'SIN', 'COS', 'TAN', 'POWER']);

const collections = [
  ['procedures', data.procedures],
  ['microSkills', data.microSkills],
];

// ROM-verified exception (round-1 ground truth): Calculate/Draw is an ACTION
// row, not a choice row like the plot Type row or a wizard field -- ENTER
// there EXECUTES the test and legitimately moves to a results screen. Only
// this one micro-skill behaves that way among every repeatable-RIGHT step on
// a plot1-editor/wizard screen; every other one commits in place.
const ACTION_ROW_MICRO_SKILLS = new Set(['calculate-vs-draw']);

// Item 1 + 7: every repeatable RIGHT step on a plot-type or wizard screen
// must be followed by a real ENTER commit on that same screen.
describe('repeatable Type-row / wizard RIGHT steps commit with ENTER', () => {
  for (const [collectionName, items] of collections) {
    for (const proc of items) {
      proc.steps.forEach((step, i) => {
        const onCommitScreen = step.screen
          && (step.screen.startsWith('plot1-editor') || step.screen.endsWith('-wizard'));

        if (!(step.repeatable && step.key === 'RIGHT' && onCommitScreen)) {
          return;
        }

        const isActionRow = ACTION_ROW_MICRO_SKILLS.has(proc.id);

        it(`${collectionName}/${proc.id} step ${i} (${step.screen}) is followed by an ENTER commit`, () => {
          const next = proc.steps[i + 1];

          expect(next, `${collectionName}/${proc.id} step ${i} has no next step`).toBeTruthy();
          expect(next.key, `${collectionName}/${proc.id} step ${i + 1} key`).toBe('ENTER');

          if (!isActionRow) {
            expect(next.screen, `${collectionName}/${proc.id} step ${i + 1} screen`).toBe(step.screen);
          }
        });
      });
    }
  }
});

// Item 2: scatterplot and residual-plot must press ENTER to select the
// already-highlighted Scatter icon, never a bare RIGHT that pretends to.
describe('scatterplot / residual-plot commit the Scatter icon with ENTER', () => {
  for (const id of ['scatterplot', 'residual-plot']) {
    it(`${id} steps[5] is an ENTER confirmation`, () => {
      const proc = data.procedures.find((p) => p.id === id);
      expect(proc, id).toBeTruthy();

      const step = proc.steps[5];
      expect(step.key, `${id} steps[5] key`).toBe('ENTER');
      expect(step.skillType, `${id} steps[5] skillType`).toBe('confirmation');
    });
  }
});

// Item 3: every plot procedure commits the Type row exactly once (one ENTER)
// between landing on the Type row and moving on to Xlist.
describe('exactly one ENTER between the Type row and Move to Xlist', () => {
  for (const id of ['histogram', 'modified-boxplot', 'scatterplot', 'residual-plot']) {
    it(`${id} commits the Type row exactly once before Xlist`, () => {
      const proc = data.procedures.find((p) => p.id === id);
      expect(proc, id).toBeTruthy();

      const typeRowIndex = proc.steps.findIndex((s) => s.narration === 'Move to the Type row.');
      const xlistIndex = proc.steps.findIndex((s) => s.narration?.startsWith('Move to Xlist'));

      expect(typeRowIndex, `${id} Type row step`).toBeGreaterThanOrEqual(0);
      expect(xlistIndex, `${id} Move to Xlist step`).toBeGreaterThan(typeRowIndex);

      const between = proc.steps.slice(typeRowIndex + 1, xlistIndex);
      const enterCount = between.filter((s) => s.key === 'ENTER').length;
      expect(enterCount, `${id} ENTERs between Type row and Xlist`).toBe(1);
    });
  }
});

// Item 4 + 7: `repeatable` never sits on a one-shot ALPHA menu shortcut.
describe('repeatable never sits on a one-shot ALPHA shortcut', () => {
  for (const [collectionName, items] of collections) {
    for (const proc of items) {
      proc.steps.forEach((step, i) => {
        if (!step.repeatable) {
          return;
        }

        it(`${collectionName}/${proc.id} step ${i} repeatable key is an arrow, ENTER, or parameter token`, () => {
          const isArrow = ARROW_KEYS.has(step.key);
          const isEnter = step.key === 'ENTER';
          const isParameter = PARAMETER_PATTERN.test(step.key);

          expect(
            isArrow || isEnter || isParameter,
            `${collectionName}/${proc.id} step ${i} has repeatable on key "${step.key}"`,
          ).toBe(true);
          expect(ONE_SHOT_SHORTCUT_KEYS.has(step.key), `${collectionName}/${proc.id} step ${i} key`).toBe(false);
        });
      });
    }
  }
});

// Item 5 + 7: stepNumber must track array position 1:1 in every procedure and micro-skill.
describe('stepNumber matches array position', () => {
  for (const [collectionName, items] of collections) {
    for (const proc of items) {
      it(`${collectionName}/${proc.id} steps are numbered 1..N in order`, () => {
        proc.steps.forEach((step, i) => {
          expect(step.stepNumber, `${collectionName}/${proc.id} step index ${i}`).toBe(i + 1);
        });
      });
    }
  }
});

// Item 6: the DISTR menu has 17 items (OS 5.8 inserted C:invBinom(), and the
// geometpdf/geometcdf procedures use the ROM-correct COS/TAN shortcut keys.
describe('DISTR menu matches the ROM-verified OS 5.8 layout', () => {
  it('distr-menu has 17 items including invBinom', () => {
    const screen = data.screens.find((s) => s.id === 'distr-menu');
    expect(screen, 'distr-menu screen').toBeTruthy();
    expect(screen.items.length).toBe(17);
    expect(screen.items.some((item) => item.includes('invBinom'))).toBe(true);
  });

  it('geometpdf step 4 uses the COS key', () => {
    const proc = data.procedures.find((p) => p.id === 'geometpdf');
    expect(proc.steps[3].key).toBe('COS');
  });

  it('geometcdf step 4 uses the TAN key', () => {
    const proc = data.procedures.find((p) => p.id === 'geometcdf');
    expect(proc.steps[3].key).toBe('TAN');
  });
});

// Codex F9(a): every Inpt Data/Stats move must be followed by a real ENTER
// commit on the same screen -- mirrors the Type-row/wizard guard above, which
// only covered `repeatable` steps and missed the (non-repeatable, two-option)
// Inpt row.
describe('every Inpt row is followed by an ENTER commit', () => {
  const INPT_HIGHLIGHT = /^Inpt: (Data|Stats)$/;

  for (const [collectionName, items] of collections) {
    for (const proc of items) {
      proc.steps.forEach((step, i) => {
        const isInptMove = (step.key === 'RIGHT' || step.key === 'LEFT')
          && INPT_HIGHLIGHT.test(step.highlight || '');

        if (!isInptMove) {
          return;
        }

        it(`${collectionName}/${proc.id} step ${i} (${step.highlight}) is followed by an ENTER commit`, () => {
          const next = proc.steps[i + 1];

          expect(next, `${collectionName}/${proc.id} step ${i} has no next step`).toBeTruthy();
          expect(next.key, `${collectionName}/${proc.id} step ${i + 1} key`).toBe('ENTER');
          expect(next.screen, `${collectionName}/${proc.id} step ${i + 1} screen`).toBe(step.screen);
        });
      });
    }
  }
});

// Codex F9(b): a commonErrors entry keyed ENTER on a choice row's own
// navigation step claims the press gets BLOCKED (see app.js wrongFeedback --
// commonErrors is only consulted for a REJECTED key). On the real ROM ENTER
// is never rejected on a choice row: it always commits whatever is currently
// highlighted and stays on the row. This is the same defect class F2 fixed
// for Inpt; this guard extends it to every choice row (Type icon, Inpt,
// alternative, Tail, Pooled) so a leftover ENTER-penalty entry anywhere can't
// silently reintroduce it. Calculate/Draw is excepted: it is a genuine ACTION
// row where ENTER on the wrong highlight executes the wrong action, so
// flagging early ENTER there is ROM-accurate, not a bug.
describe('no commonErrors entry penalizes ENTER on a choice row', () => {
  const INPT_HIGHLIGHT = /^Inpt: (Data|Stats)$/;

  for (const [collectionName, items] of collections) {
    for (const proc of items) {
      if (ACTION_ROW_MICRO_SKILLS.has(proc.id)) {
        continue;
      }

      proc.steps.forEach((step, i) => {
        const onCommitScreen = step.screen
          && (step.screen.startsWith('plot1-editor') || step.screen.endsWith('-wizard'));
        const isChoiceRowMove = onCommitScreen && (
          (step.repeatable && step.key === 'RIGHT')
          || ((step.key === 'RIGHT' || step.key === 'LEFT') && INPT_HIGHLIGHT.test(step.highlight || ''))
        );

        if (!isChoiceRowMove) {
          return;
        }

        it(`${collectionName}/${proc.id} step ${i} (${step.highlight}) does not list ENTER as a common error`, () => {
          const entersPenalized = (step.commonErrors ?? []).some((entry) => entry.key === 'ENTER');
          expect(entersPenalized, `${collectionName}/${proc.id} step ${i} commonErrors`).toBe(false);
        });
      });
    }
  }
});

// Codex F9(c): deterministic repeatable steps must carry the exact
// ROM-measured press count, not just "some number greater than zero".
describe('deterministic repeatable steps carry the expected minPresses', () => {
  const EXPECTED_MIN_PRESSES = [
    { id: 'histogram', highlight: 'Histogram icon', minPresses: 2 },
    { id: 'modified-boxplot', highlight: 'Modified Boxplot icon', minPresses: 3 },
    { id: 'binompdf', highlight: 'A:binompdf(', minPresses: 10 },
    { id: 'binomcdf', highlight: 'B:binomcdf(', minPresses: 11 },
  ];

  for (const { id, highlight, minPresses } of EXPECTED_MIN_PRESSES) {
    it(`${id} step "${highlight}" requires exactly ${minPresses} presses`, () => {
      const proc = data.procedures.find((p) => p.id === id);
      expect(proc, id).toBeTruthy();

      const step = proc.steps.find((s) => s.highlight === highlight);
      expect(step, `${id} step "${highlight}"`).toBeTruthy();
      expect(step.repeatable, `${id} step "${highlight}" repeatable`).toBe(true);
      expect(step.minPresses, `${id} step "${highlight}" minPresses`).toBe(minPresses);
    });
  }
});

describe('matrix cell loop markers', () => {
  for (const [collectionName, items] of collections) {
    for (const proc of items) {
      proc.steps.forEach((step, i) => {
        if (!step.loop) {
          return;
        }

        it(collectionName + '/' + proc.id + ' step ' + i + ' has a valid matrix loop pair', () => {
          if (step.loop === 'matrix-cells') {
            expect(step.key).toBe('{cell value}');
            expect(step.loopMatrix).toBe('[A]');
            expect(proc.steps[i + 1]?.key).toBe('ENTER');
            expect(proc.steps[i + 1]?.loop).toBe('matrix-cells-commit');
            expect(proc.steps[i + 1]?.screen).toBe(step.screen);
            return;
          }

          expect(step.loop).toBe('matrix-cells-commit');
          expect(step.key).toBe('ENTER');
          expect(step.loopMatrix).toBeUndefined();
          expect(proc.steps[i - 1]?.key).toBe('{cell value}');
          expect(proc.steps[i - 1]?.loop).toBe('matrix-cells');
        });
      });
    }
  }

  it('marks the procedure and micro-skill consistently', () => {
    const procedure = data.procedures.find((item) => item.id === 'matrix-entry');
    const microSkill = data.microSkills.find((item) => item.id === 'enter-matrix');

    for (const item of [procedure, microSkill]) {
      expect(item.steps.at(-2).loop).toBe('matrix-cells');
      expect(item.steps.at(-2).loopMatrix).toBe('[A]');
      expect(item.steps.at(-1).loop).toBe('matrix-cells-commit');
    }
  });

  it('matrix-entry has no dataRequirements setup phase', () => {
    const procedure = data.procedures.find((item) => item.id === 'matrix-entry');
    expect(procedure.dataRequirements).toBeUndefined();
  });
});

// Codex F9(d) / F8: data/ti84-procedures.js is a hand-shipped browser wrapper
// consumed by the PUBLIC study_guide_diagnostic.html. It has no build step,
// so it silently drifts from ti84-procedures-data.json unless something
// guards parity. This pins the exact defect F8 found (stale SIN/E, COS/F
// shortcut letters) and a full-object check so any future drift fails loud.
describe('data/ti84-procedures.js wrapper parity with ti84-procedures-data.json', () => {
  const WRAPPER_PATH = path.resolve(__dirname, '..', 'data', 'ti84-procedures.js');
  const wrapperSrc = fs.readFileSync(WRAPPER_PATH, 'utf8');
  const wrapperData = JSON.parse(wrapperSrc.slice(wrapperSrc.indexOf('{'), wrapperSrc.lastIndexOf('}') + 1));

  it('geometpdf uses the same shortcut key in both files', () => {
    const sourceStep = data.procedures.find((p) => p.id === 'geometpdf').steps[3];
    const wrapperStep = wrapperData.procedures.find((p) => p.id === 'geometpdf').steps[3];

    expect(sourceStep.key, 'source geometpdf step 4 key').toBe('COS');
    expect(wrapperStep.key, 'wrapper geometpdf step 4 key').toBe(sourceStep.key);
  });

  it('geometcdf uses the same shortcut key in both files', () => {
    const sourceStep = data.procedures.find((p) => p.id === 'geometcdf').steps[3];
    const wrapperStep = wrapperData.procedures.find((p) => p.id === 'geometcdf').steps[3];

    expect(sourceStep.key, 'source geometcdf step 4 key').toBe('TAN');
    expect(wrapperStep.key, 'wrapper geometcdf step 4 key').toBe(sourceStep.key);
  });

  it('is fully JSON-equal to ti84-procedures-data.json (catches any regen drift)', () => {
    expect(wrapperData).toEqual(data);
  });
});
