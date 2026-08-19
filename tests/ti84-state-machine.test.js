import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

import {
  createRouteState,
  createState,
  transition,
  validKeys,
} from '../ti84-state-machine.js';

const require = createRequire(import.meta.url);
const proceduresData = require('../ti84-procedures-data.json');

describe('procedure traversal', () => {
  for (const procedure of proceduresData.procedures) {
    it(`traverses ${procedure.id}`, () => {
      let state = createRouteState(procedure.id);

      for (const step of procedure.steps) {
        const next = transition(state, step.key);

        expect(next, `${procedure.id} failed on key ${step.key}`).not.toBeNull();
        expect(next.id).toBe(step.screen);

        state = next;
      }
    });
  }
});

describe('micro-skill traversal', () => {
  for (const skill of proceduresData.microSkills) {
    it(`traverses ${skill.id}`, () => {
      let state = createRouteState(skill.id);

      for (const step of skill.steps) {
        const next = transition(state, step.key);

        expect(next, `${skill.id} failed on key ${step.key}`).not.toBeNull();
        expect(next.id).toBe(step.screen);

        state = next;
      }
    });
  }
});

describe('structural transitions', () => {
  it('returns home from menus with CLEAR', () => {
    const next = transition(createState('stat-menu'), 'CLEAR');

    expect(next?.id).toBe('home');
  });

  it('returns home from any screen with 2ND_QUIT', () => {
    const next = transition(createState('one-propztest-wizard'), '2ND_QUIT');

    expect(next?.id).toBe('home');
  });

  it('switches tabs inside STAT', () => {
    const calc = transition(createState('stat-menu'), 'RIGHT');
    const tests = transition(calc, 'RIGHT');
    const back = transition(tests, 'LEFT');

    expect(calc?.id).toBe('stat-calc-menu');
    expect(tests?.id).toBe('stat-tests-menu');
    expect(back?.id).toBe('stat-calc-menu');
  });

  it('supports menu shortcuts', () => {
    const oneProp = transition(createState('stat-tests-menu'), '5');
    const linReg = transition(createState('stat-calc-menu'), '8');

    expect(oneProp?.id).toBe('one-propztest-wizard');
    expect(linReg?.id).toBe('linreg-wizard');
  });

  it('toggles data and stats entry screens', () => {
    const stats = transition(createState('t-test-data-wizard'), 'RIGHT');
    const data = transition(stats, 'LEFT');

    expect(stats?.id).toBe('t-test-stats-wizard');
    expect(data?.id).toBe('t-test-data-wizard');
  });

  it('uses 2ND digit shortcuts for list selection', () => {
    const start = createState('plot1-editor-scatter', { activeField: 2 });
    const second = transition(start, '2ND');
    const next = transition(second, '1');

    expect(next?.id).toBe('plot1-editor-scatter');
    expect(next.fields[2].value).toBe('L1');
    expect(next.secondActive).toBe(false);
  });

  it('scrolls 1-Var Stats results between pages', () => {
    const page2 = transition(createState('one-var-stats-result-page1'), 'DOWN');
    const page1 = transition(page2, 'UP');

    expect(page2?.id).toBe('one-var-stats-result-page2');
    expect(page1?.id).toBe('one-var-stats-result-page1');
  });

  it('pastes a distribution command and evaluates it on home', () => {
    const menu = transition(transition(createState('home'), '2ND'), 'VARS');
    const wizard = transition(menu, '2');
    const pasted = transition(
      transition(
        transition(
          transition(
            transition(
              transition(
                transition(
                  transition(wizard, '{lower}'),
                  'DOWN',
                ),
                '{upper}',
              ),
              'DOWN',
            ),
            '{μ}',
          ),
          'DOWN',
        ),
        '{σ}',
      ),
      'DOWN',
    );
    const home = transition(pasted, 'ENTER');
    const result = transition(home, 'ENTER');

    expect(home?.id).toBe('home');
    expect(result?.id).toBe('distribution-home-result');
  });

  it('reports valid keys for the current screen', () => {
    const keys = validKeys(createState('home'));

    expect(keys).toContain('STAT');
    expect(keys).toContain('2ND');
  });

  it('wraps matrix ENTER to the first column of the next row', () => {
    const state = createState('matrix-editor-a-values', {
      rows: 2,
      cols: 3,
      matrixRow: 0,
      matrixCol: 2,
    });
    const next = transition(state, 'ENTER');

    expect(next?.matrixCursor).toEqual({ row: 1, col: 0 });
  });

  it('clamps matrix ENTER at the last cell', () => {
    const state = createState('matrix-editor-a-values', {
      rows: 2,
      cols: 3,
      matrixRow: 1,
      matrixCol: 2,
    });
    const next = transition(state, 'ENTER');

    expect(next?.matrixCursor).toEqual({ row: 1, col: 2 });
  });
});
