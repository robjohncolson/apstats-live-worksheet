/**
 * TI-84 CE Form Engine — Vitest tests.
 *
 * Tests cursor movement, number/integer entry, selector cycling,
 * action buttons, Data/Stats toggle, fresh-entry clearing, and
 * plot editor screens.
 *
 * Modules are IIFEs that set window globals, so we evaluate them
 * inside a JSDOM instance.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const nativeDir = resolve(__dirname, '..');

// ── Module loader ──────────────────────────────────────────────────────

function loadModules() {
  var dom = new JSDOM('', { runScripts: 'dangerously' });
  var win = dom.window;

  // Load dependencies first, then form-engine
  var eventBusSrc = readFileSync(resolve(nativeDir, 'event-bus.js'), 'utf8');
  var fieldTablesSrc = readFileSync(resolve(nativeDir, 'field-tables.js'), 'utf8');
  var formEngineSrc = readFileSync(resolve(nativeDir, 'form-engine.js'), 'utf8');

  win.eval(eventBusSrc);
  win.eval(fieldTablesSrc);
  win.eval(formEngineSrc);

  return {
    EventBus: win.TI84EventBus,
    FieldTables: win.TI84FieldTables,
    FormEngine: win.TI84FormEngine
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('TI84FormEngine', function () {
  var EventBus;
  var FieldTables;
  var FormEngine;

  beforeEach(function () {
    var mods = loadModules();
    EventBus = mods.EventBus;
    FieldTables = mods.FieldTables;
    FormEngine = mods.FormEngine;
  });

  // ── Basic creation ────────────────────────────────────────────────

  describe('Wizard creation', function () {
    it('creates a normalcdf wizard with correct fields', function () {
      var wiz = FormEngine.create('normalcdf-wizard');
      var state = wiz.getState();

      expect(state.wizardId).toBe('normalcdf-wizard');
      expect(state.fields.length).toBe(5);
      expect(state.fields[0].label).toBe('lower');
      expect(state.fields[1].label).toBe('upper');
      expect(state.fields[4].label).toBe('Paste');
      expect(state.inputMode).toBeNull();
    });

    it('creates a one-var-stats wizard', function () {
      var wiz = FormEngine.create('one-var-stats-wizard');
      var state = wiz.getState();

      expect(state.fields.length).toBe(3);
      expect(state.fields[0].label).toBe('List');
      expect(state.fields[0].type).toBe('list-selector');
      expect(state.fields[2].label).toBe('Calculate');
      expect(state.fields[2].type).toBe('action-button');
    });

    it('throws for unknown wizard ID', function () {
      expect(function () {
        FormEngine.create('nonexistent-wizard');
      }).toThrow('Unknown wizard/editor');
    });

    it('initializes default values', function () {
      var wiz = FormEngine.create('normalcdf-wizard');
      var state = wiz.getState();

      // lower and upper have no default -> empty string
      expect(state.fields[0].value).toBe('');
      expect(state.fields[1].value).toBe('');
      // mu defaults to '0', sigma to '1'
      expect(state.fields[2].value).toBe('0');
      expect(state.fields[3].value).toBe('1');
    });

    it('starts cursor at index 0', function () {
      var wiz = FormEngine.create('normalcdf-wizard');
      expect(wiz.getState().cursorIndex).toBe(0);
    });
  });

  // ── Cursor movement ───────────────────────────────────────────────

  describe('Cursor movement', function () {
    it('DOWN moves cursor through all fields', function () {
      var wiz = FormEngine.create('normalcdf-wizard');

      expect(wiz.getState().cursorIndex).toBe(0);

      wiz.handleKey('DOWN');
      expect(wiz.getState().cursorIndex).toBe(1);

      wiz.handleKey('DOWN');
      expect(wiz.getState().cursorIndex).toBe(2);

      wiz.handleKey('DOWN');
      expect(wiz.getState().cursorIndex).toBe(3);

      wiz.handleKey('DOWN');
      expect(wiz.getState().cursorIndex).toBe(4);
    });

    it('DOWN wraps from last field to first', function () {
      var wiz = FormEngine.create('normalcdf-wizard');

      // Move to last field (index 4 = Paste)
      for (var i = 0; i < 5; i++) {
        wiz.handleKey('DOWN');
      }
      // Should wrap to 0
      expect(wiz.getState().cursorIndex).toBe(0);
    });

    it('UP wraps from first field to last', function () {
      var wiz = FormEngine.create('normalcdf-wizard');

      expect(wiz.getState().cursorIndex).toBe(0);
      wiz.handleKey('UP');
      // normalcdf has 5 fields, last index = 4
      expect(wiz.getState().cursorIndex).toBe(4);
    });

    it('ENTER on number field moves to next field', function () {
      var wiz = FormEngine.create('normalcdf-wizard');

      // Cursor at 0 (lower), press ENTER
      wiz.handleKey('ENTER');
      expect(wiz.getState().cursorIndex).toBe(1);
    });

    it('fires field-focus callback on cursor move', function () {
      var wiz = FormEngine.create('normalcdf-wizard');
      var focused = [];
      wiz.onFieldFocus(function (evt) { focused.push(evt); });

      wiz.handleKey('DOWN');

      // Should have fired for the move to index 1 (plus initial focus at creation)
      var last = focused[focused.length - 1];
      expect(last.fieldIndex).toBe(1);
      expect(last.fieldLabel).toBe('upper');
    });
  });

  // ── Number entry ──────────────────────────────────────────────────

  describe('Number entry', function () {
    it('typing digits builds the value string', function () {
      var wiz = FormEngine.create('normalcdf-wizard');

      // cursor at 0 (lower, type=number)
      wiz.handleKey('1');
      wiz.handleKey('2');
      wiz.handleKey('3');

      expect(wiz.getValue('lower')).toBe('123');
    });

    it('CLEAR empties the field', function () {
      var wiz = FormEngine.create('normalcdf-wizard');

      wiz.handleKey('1');
      wiz.handleKey('2');
      wiz.handleKey('CLEAR');

      expect(wiz.getValue('lower')).toBe('');
    });

    it('DEL backspaces one character', function () {
      var wiz = FormEngine.create('normalcdf-wizard');

      wiz.handleKey('1');
      wiz.handleKey('2');
      wiz.handleKey('3');
      wiz.handleKey('DEL');

      expect(wiz.getValue('lower')).toBe('12');
    });

    it('NEGATIVE inserts leading minus on fresh entry', function () {
      var wiz = FormEngine.create('normalcdf-wizard');

      // Fresh entry: NEGATIVE starts with '-'
      wiz.handleKey('NEGATIVE');
      wiz.handleKey('5');

      expect(wiz.getValue('lower')).toBe('-5');
    });

    it('NEGATIVE toggles minus on existing value', function () {
      var wiz = FormEngine.create('normalcdf-wizard');

      wiz.handleKey('1');
      wiz.handleKey('2');
      wiz.handleKey('3');

      // Toggle on
      wiz.handleKey('NEGATIVE');
      expect(wiz.getValue('lower')).toBe('-123');

      // Toggle off
      wiz.handleKey('NEGATIVE');
      expect(wiz.getValue('lower')).toBe('123');
    });

    it('DECIMAL adds a decimal point', function () {
      var wiz = FormEngine.create('normalcdf-wizard');

      wiz.handleKey('1');
      wiz.handleKey('DECIMAL');
      wiz.handleKey('5');

      expect(wiz.getValue('lower')).toBe('1.5');
    });

    it('DECIMAL only adds one decimal point', function () {
      var wiz = FormEngine.create('normalcdf-wizard');

      wiz.handleKey('1');
      wiz.handleKey('DECIMAL');
      wiz.handleKey('5');
      wiz.handleKey('DECIMAL'); // should be ignored

      expect(wiz.getValue('lower')).toBe('1.5');
    });

    it('DECIMAL on fresh entry starts with just a dot', function () {
      var wiz = FormEngine.create('normalcdf-wizard');

      // Fresh entry: DECIMAL starts with '.'
      wiz.handleKey('DECIMAL');
      wiz.handleKey('9');
      wiz.handleKey('5');

      expect(wiz.getValue('lower')).toBe('.95');
    });

    it('fires field-change callback on digit entry', function () {
      var wiz = FormEngine.create('normalcdf-wizard');
      var changes = [];
      wiz.onFieldChange(function (evt) { changes.push(evt); });

      wiz.handleKey('5');

      expect(changes.length).toBe(1);
      expect(changes[0].fieldLabel).toBe('lower');
      expect(changes[0].oldValue).toBe('');
      expect(changes[0].newValue).toBe('5');
    });
  });

  // ── Integer field ─────────────────────────────────────────────────

  describe('Integer field', function () {
    it('accepts digit keys', function () {
      var wiz = FormEngine.create('binompdf-wizard');

      // Move to x field (index 2, type=integer)
      wiz.handleKey('DOWN');
      wiz.handleKey('DOWN');

      wiz.handleKey('7');

      expect(wiz.getValue('x')).toBe('7');
    });

    it('DECIMAL key is ignored on integer field', function () {
      var wiz = FormEngine.create('binompdf-wizard');

      // Move to x field (index 2, type=integer)
      wiz.handleKey('DOWN');
      wiz.handleKey('DOWN');

      wiz.handleKey('5');
      wiz.handleKey('DECIMAL');
      wiz.handleKey('3');

      // DECIMAL should have been ignored, so value is '53'
      expect(wiz.getValue('x')).toBe('53');
    });

    it('NEGATIVE works on integer field', function () {
      var wiz = FormEngine.create('binompdf-wizard');

      // Move to x field
      wiz.handleKey('DOWN');
      wiz.handleKey('DOWN');

      wiz.handleKey('NEGATIVE');
      wiz.handleKey('4');

      expect(wiz.getValue('x')).toBe('-4');
    });
  });

  // ── List selector ─────────────────────────────────────────────────

  describe('List selector', function () {
    it('RIGHT from L1 goes to L2', function () {
      var wiz = FormEngine.create('one-var-stats-wizard');

      // cursor at 0 (List, default L1)
      expect(wiz.getValue('List')).toBe('L1');

      wiz.handleKey('RIGHT');
      expect(wiz.getValue('List')).toBe('L2');
    });

    it('LEFT from L1 wraps to L6', function () {
      var wiz = FormEngine.create('one-var-stats-wizard');

      expect(wiz.getValue('List')).toBe('L1');

      wiz.handleKey('LEFT');
      expect(wiz.getValue('List')).toBe('L6');
    });

    it('RIGHT cycles through all six lists and wraps', function () {
      var wiz = FormEngine.create('one-var-stats-wizard');

      wiz.handleKey('RIGHT'); // L2
      wiz.handleKey('RIGHT'); // L3
      wiz.handleKey('RIGHT'); // L4
      wiz.handleKey('RIGHT'); // L5
      wiz.handleKey('RIGHT'); // L6
      wiz.handleKey('RIGHT'); // wraps to L1

      expect(wiz.getValue('List')).toBe('L1');
    });

    it('does NOT clear on first keystroke (not a number field)', function () {
      var wiz = FormEngine.create('one-var-stats-wizard');

      // List selector starts at L1
      expect(wiz.getValue('List')).toBe('L1');

      // RIGHT should cycle, not clear
      wiz.handleKey('RIGHT');
      expect(wiz.getValue('List')).toBe('L2');
    });

    it('ENTER on list selector moves to next field', function () {
      var wiz = FormEngine.create('one-var-stats-wizard');

      wiz.handleKey('ENTER');
      expect(wiz.getState().cursorIndex).toBe(1);
    });
  });

  // ── Choice cycling ────────────────────────────────────────────────

  describe('Choice cycling', function () {
    it('RIGHT moves the in-row cursor and commits nothing', function () {
      var wiz = FormEngine.create('one-propztest-wizard');

      // Move to prop field (index 3, choice with options)
      wiz.handleKey('DOWN');
      wiz.handleKey('DOWN');
      wiz.handleKey('DOWN');

      var state = wiz.getState();
      expect(state.activeField.label).toBe('prop');

      // Default is first option
      var firstOption = wiz.getValue('prop');
      expect(firstOption).toBe('\u2260p\u2080');

      // RIGHT moves the in-row cursor but the ROM does not commit until ENTER
      wiz.handleKey('RIGHT');
      expect(wiz.getValue('prop')).toBe('\u2260p\u2080');
      expect(wiz.getState().choiceCursor).toBe(1);

      wiz.handleKey('RIGHT');
      expect(wiz.getValue('prop')).toBe('\u2260p\u2080');
      expect(wiz.getState().choiceCursor).toBe(2);
    });

    it('LEFT moves the in-row cursor back and clamps at index 0', function () {
      var wiz = FormEngine.create('one-propztest-wizard');

      // Move to prop field
      wiz.handleKey('DOWN');
      wiz.handleKey('DOWN');
      wiz.handleKey('DOWN');

      // LEFT from index 0 clamps at 0 \u2014 the ROM does not wrap
      wiz.handleKey('LEFT');
      expect(wiz.getState().choiceCursor).toBe(0);
      expect(wiz.getValue('prop')).toBe('\u2260p\u2080');

      wiz.handleKey('RIGHT');
      wiz.handleKey('RIGHT');
      expect(wiz.getState().choiceCursor).toBe(2);

      // One LEFT past index 0 still clamps at 0
      wiz.handleKey('LEFT');
      wiz.handleKey('LEFT');
      wiz.handleKey('LEFT');
      expect(wiz.getState().choiceCursor).toBe(0);
    });

    it('ENTER commits the cursor\'s option and leaves cursorIndex unchanged', function () {
      var wiz = FormEngine.create('one-propztest-wizard');

      // Move to prop field (index 3)
      wiz.handleKey('DOWN');
      wiz.handleKey('DOWN');
      wiz.handleKey('DOWN');

      expect(wiz.getState().cursorIndex).toBe(3);

      wiz.handleKey('RIGHT'); // move in-row cursor to '<p0'
      wiz.handleKey('ENTER'); // commit it

      expect(wiz.getValue('prop')).toBe('<p\u2080');
      expect(wiz.getState().cursorIndex).toBe(3);
    });

    it('discards an uncommitted cursor move when the row is left (RIGHT, DOWN, UP)', function () {
      var wiz = FormEngine.create('one-propztest-wizard');

      wiz.handleKey('DOWN');
      wiz.handleKey('DOWN');
      wiz.handleKey('DOWN'); // prop field, index 3

      expect(wiz.getValue('prop')).toBe('\u2260p\u2080');

      wiz.handleKey('RIGHT'); // move cursor, don't commit
      wiz.handleKey('DOWN');  // leave the row \u2014 discards the cursor
      wiz.handleKey('UP');    // come back \u2014 cursor resets to index 0

      expect(wiz.getValue('prop')).toBe('\u2260p\u2080');
    });

    it('RIGHT clamps at the last option instead of wrapping', function () {
      var wiz = FormEngine.create('one-propztest-wizard');

      wiz.handleKey('DOWN');
      wiz.handleKey('DOWN');
      wiz.handleKey('DOWN'); // prop field, 3 options

      wiz.handleKey('RIGHT');
      wiz.handleKey('RIGHT');
      expect(wiz.getState().choiceCursor).toBe(2); // last option

      wiz.handleKey('RIGHT'); // one more RIGHT past the end
      expect(wiz.getState().choiceCursor).toBe(2); // clamps, does not wrap to 0

      wiz.handleKey('ENTER');
      expect(wiz.getValue('prop')).toBe('>p\u2080');
    });

    it('RIGHT+ENTER commits CENTER; RIGHT then DOWN then UP discards and the value is still LEFT', function () {
      // RIGHT + ENTER commits the option under the cursor
      var wiz = FormEngine.create('invnorm-wizard');
      wiz.handleKey('DOWN');
      wiz.handleKey('DOWN');
      wiz.handleKey('DOWN');
      expect(wiz.getValue('Tail')).toBe('LEFT');

      wiz.handleKey('RIGHT');
      wiz.handleKey('ENTER');
      expect(wiz.getValue('Tail')).toBe('CENTER');

      // Leaving the row before ENTER discards the moved cursor \u2014 the value
      // keeps its old (never-committed) default.
      var wiz2 = FormEngine.create('invnorm-wizard');
      wiz2.handleKey('DOWN');
      wiz2.handleKey('DOWN');
      wiz2.handleKey('DOWN');

      wiz2.handleKey('RIGHT');
      wiz2.handleKey('DOWN');
      wiz2.handleKey('UP');
      expect(wiz2.getValue('Tail')).toBe('LEFT');
    });
  });

  // ── Action button ─────────────────────────────────────────────────

  describe('Action button', function () {
    it('ENTER on Calculate triggers onSubmit with all field values', function () {
      var wiz = FormEngine.create('one-var-stats-wizard');
      var submitted = null;
      wiz.onSubmit(function (evt) { submitted = evt; });

      // Move to Calculate (last field, index 2)
      wiz.handleKey('DOWN');
      wiz.handleKey('DOWN');

      expect(wiz.getState().activeField.label).toBe('Calculate');

      wiz.handleKey('ENTER');

      expect(submitted).not.toBeNull();
      expect(submitted.action).toBe('Calculate');
      expect(submitted.values.List).toBe('L1');
      expect(submitted.values.FreqList).toBe('1');
    });

    it('ENTER on Paste triggers onSubmit', function () {
      var wiz = FormEngine.create('normalcdf-wizard');
      var submitted = null;
      wiz.onSubmit(function (evt) { submitted = evt; });

      // Enter values first
      wiz.handleKey('1');
      wiz.handleKey('ENTER'); // move to upper
      wiz.handleKey('2');
      wiz.handleKey('ENTER'); // move to mu
      wiz.handleKey('ENTER'); // move to sigma
      wiz.handleKey('ENTER'); // move to Paste

      expect(wiz.getState().activeField.label).toBe('Paste');

      wiz.handleKey('ENTER');

      expect(submitted).not.toBeNull();
      expect(submitted.action).toBe('Paste');
      expect(submitted.values.lower).toBe('1');
      expect(submitted.values.upper).toBe('2');
    });
  });

  // ── Action selector ───────────────────────────────────────────────

  describe('Action selector', function () {
    it('LEFT/RIGHT toggles between Calculate and Draw', function () {
      var wiz = FormEngine.create('one-propztest-wizard');

      // Navigate to Calculate/Draw field (last field, index 5)
      for (var i = 0; i < 5; i++) wiz.handleKey('DOWN');

      expect(wiz.getState().activeField.label).toBe('Calculate/Draw');
      expect(wiz.getValue('Calculate/Draw')).toBe('Calculate');

      wiz.handleKey('RIGHT');
      expect(wiz.getValue('Calculate/Draw')).toBe('Draw');

      wiz.handleKey('LEFT');
      expect(wiz.getValue('Calculate/Draw')).toBe('Calculate');
    });

    it('ENTER on action selector triggers onSubmit', function () {
      var wiz = FormEngine.create('one-propztest-wizard');
      var submitted = null;
      wiz.onSubmit(function (evt) { submitted = evt; });

      // Navigate to action selector
      for (var i = 0; i < 5; i++) wiz.handleKey('DOWN');

      wiz.handleKey('ENTER');

      expect(submitted).not.toBeNull();
      expect(submitted.action).toBe('Calculate');
    });
  });

  // ── Color selector ────────────────────────────────────────────────

  describe('Color selector', function () {
    it('defaults to BLUE', function () {
      var wiz = FormEngine.create('one-propztest-wizard');

      // Color: is at index 4
      wiz.handleKey('DOWN');
      wiz.handleKey('DOWN');
      wiz.handleKey('DOWN');
      wiz.handleKey('DOWN');

      expect(wiz.getState().activeField.label).toBe('Color:');
      expect(wiz.getValue('Color:')).toBe('BLUE');
    });

    it('RIGHT cycles through color list', function () {
      var wiz = FormEngine.create('one-propztest-wizard');

      // Navigate to Color: field
      for (var i = 0; i < 4; i++) wiz.handleKey('DOWN');

      wiz.handleKey('RIGHT');
      expect(wiz.getValue('Color:')).toBe('RED');

      wiz.handleKey('RIGHT');
      expect(wiz.getValue('Color:')).toBe('BLACK');

      wiz.handleKey('RIGHT');
      expect(wiz.getValue('Color:')).toBe('MAGENTA');
    });

    it('LEFT from BLUE wraps to DARKGRAY', function () {
      var wiz = FormEngine.create('one-propztest-wizard');

      for (var i = 0; i < 4; i++) wiz.handleKey('DOWN');

      wiz.handleKey('LEFT');
      expect(wiz.getValue('Color:')).toBe('DARKGRAY');
    });

    it('cycles through all 14 colors and wraps', function () {
      var wiz = FormEngine.create('one-propztest-wizard');

      for (var i = 0; i < 4; i++) wiz.handleKey('DOWN');

      // Cycle through all 14 colors
      for (var j = 0; j < 14; j++) wiz.handleKey('RIGHT');

      // Should wrap back to BLUE
      expect(wiz.getValue('Color:')).toBe('BLUE');
    });
  });

  // ── Equation selector ─────────────────────────────────────────────

  describe('Equation selector', function () {
    it('defaults to Y1 for Store RegEQ', function () {
      var wiz = FormEngine.create('linreg-wizard');

      expect(wiz.getValue('Store RegEQ')).toBe('Y1');
    });

    it('RIGHT cycles Y1 -> Y2 -> ... -> Y0 -> Y1', function () {
      var wiz = FormEngine.create('linreg-wizard');

      // Navigate to Store RegEQ (index 3)
      wiz.handleKey('DOWN');
      wiz.handleKey('DOWN');
      wiz.handleKey('DOWN');

      expect(wiz.getValue('Store RegEQ')).toBe('Y1');

      wiz.handleKey('RIGHT');
      expect(wiz.getValue('Store RegEQ')).toBe('Y2');

      // Cycle through to Y0 (9 RIGHT presses from Y1)
      for (var i = 0; i < 8; i++) wiz.handleKey('RIGHT');
      expect(wiz.getValue('Store RegEQ')).toBe('Y0');

      // One more wraps to Y1
      wiz.handleKey('RIGHT');
      expect(wiz.getValue('Store RegEQ')).toBe('Y1');
    });
  });

  // ── Matrix selector ───────────────────────────────────────────────

  describe('Matrix selector', function () {
    it('defaults to [A] for Observed in chi2test', function () {
      var wiz = FormEngine.create('chi2test-wizard');

      expect(wiz.getValue('Observed')).toBe('[A]');
    });

    it('RIGHT cycles through [A]-[J] and wraps', function () {
      var wiz = FormEngine.create('chi2test-wizard');

      wiz.handleKey('RIGHT');
      expect(wiz.getValue('Observed')).toBe('[B]');

      // Cycle to [J] (8 more RIGHT presses)
      for (var i = 0; i < 8; i++) wiz.handleKey('RIGHT');
      expect(wiz.getValue('Observed')).toBe('[J]');

      // Wrap to [A]
      wiz.handleKey('RIGHT');
      expect(wiz.getValue('Observed')).toBe('[A]');
    });

    it('LEFT from [A] wraps to [J]', function () {
      var wiz = FormEngine.create('chi2test-wizard');

      wiz.handleKey('LEFT');
      expect(wiz.getValue('Observed')).toBe('[J]');
    });
  });

  // ── Data/Stats toggle ─────────────────────────────────────────────

  describe('Data/Stats toggle', function () {
    it('t-test-data-wizard starts in Data mode', function () {
      var wiz = FormEngine.create('t-test-data-wizard');
      var state = wiz.getState();

      expect(state.inputMode).toBe('Data');
      expect(state.fields[0].label).toBe('Inpt');
      expect(state.fields[0].value).toBe('Data');
    });

    it('t-test-stats-wizard starts in Stats mode', function () {
      var wiz = FormEngine.create('t-test-stats-wizard');
      var state = wiz.getState();

      expect(state.inputMode).toBe('Stats');
      expect(state.fields[0].value).toBe('Stats');
    });

    it('Inpt is an ordinary choice row: RIGHT moves the cursor, ENTER commits', function () {
      var wiz = FormEngine.create('t-test-data-wizard');

      expect(wiz.getState().inputMode).toBe('Data');
      expect(wiz.getState().activeField.type).toBe('choice');

      wiz.handleKey('RIGHT');
      expect(wiz.getState().inputMode).toBe('Data'); // not yet committed
      expect(wiz.getValue('Inpt')).toBe('Data');

      wiz.handleKey('ENTER');
      expect(wiz.getState().inputMode).toBe('Stats');
      expect(wiz.getValue('Inpt')).toBe('Stats');
    });

    it('DOWN before ENTER discards the Inpt cursor move \u2014 mode stays Data', function () {
      var wiz = FormEngine.create('t-test-data-wizard');

      wiz.handleKey('RIGHT'); // move cursor toward Stats, don't commit
      wiz.handleKey('DOWN');  // leave the row \u2014 discards the cursor
      wiz.handleKey('UP');    // come back \u2014 cursor resets to index 0

      expect(wiz.getState().inputMode).toBe('Data');
      expect(wiz.getValue('Inpt')).toBe('Data');

      wiz.handleKey('ENTER'); // cursor is back at index 0 (Data) \u2014 re-commits Data
      expect(wiz.getState().inputMode).toBe('Data');
    });

    it('toggling Data -> Stats changes visible field list', function () {
      var wiz = FormEngine.create('t-test-data-wizard');

      // Data mode fields
      var dataState = wiz.getState();
      var dataLabels = dataState.fields.map(function (f) { return f.label; });
      expect(dataLabels).toContain('List');
      expect(dataLabels).toContain('Freq');
      expect(dataLabels).not.toContain('x\u0304');
      expect(dataLabels).not.toContain('Sx');

      // Switch to Stats
      wiz.handleKey('RIGHT');
      wiz.handleKey('ENTER');

      var statsState = wiz.getState();
      var statsLabels = statsState.fields.map(function (f) { return f.label; });
      expect(statsLabels).toContain('x\u0304');
      expect(statsLabels).toContain('Sx');
      expect(statsLabels).toContain('n');
      expect(statsLabels).not.toContain('List');
      expect(statsLabels).not.toContain('Freq');
    });

    it('shared fields preserve values across toggle', function () {
      var wiz = FormEngine.create('t-test-data-wizard');

      // Set mu0 value in Data mode
      wiz.handleKey('DOWN'); // move to mu0
      wiz.handleKey('5');

      expect(wiz.getValue('\u03BC0')).toBe('5');

      // Switch to Stats
      wiz.handleKey('UP'); // back to Inpt
      wiz.handleKey('RIGHT'); // move cursor to Stats
      wiz.handleKey('ENTER'); // commit

      // mu0 should still be '5' because it appears in both modes
      expect(wiz.getValue('\u03BC0')).toBe('5');
    });

    it('values entered in Stats mode preserved when switching back', function () {
      var wiz = FormEngine.create('t-test-data-wizard');

      // Switch to Stats
      wiz.handleKey('RIGHT');
      wiz.handleKey('ENTER');

      // Enter x-bar value
      wiz.handleKey('DOWN'); // mu0
      wiz.handleKey('DOWN'); // x-bar
      wiz.handleKey('4');
      wiz.handleKey('2');
      expect(wiz.getValue('x\u0304')).toBe('42');

      // Switch back to Data
      wiz.handleKey('UP');
      wiz.handleKey('UP');
      wiz.handleKey('LEFT');
      wiz.handleKey('ENTER');
      expect(wiz.getState().inputMode).toBe('Data');

      // Switch to Stats again \u2014 value should be preserved
      wiz.handleKey('RIGHT');
      wiz.handleKey('ENTER');
      expect(wiz.getValue('x\u0304')).toBe('42');
    });

    it('cursor stays at index 0 (Inpt) after toggle', function () {
      var wiz = FormEngine.create('t-test-data-wizard');

      wiz.handleKey('RIGHT');
      wiz.handleKey('ENTER');

      expect(wiz.getState().cursorIndex).toBe(0);
    });

    it('t-interval toggle works the same way', function () {
      var wiz = FormEngine.create('t-interval-data-wizard');

      expect(wiz.getState().inputMode).toBe('Data');

      var dataLabels = wiz.getState().fields.map(function (f) { return f.label; });
      expect(dataLabels).toContain('List');

      wiz.handleKey('RIGHT');
      wiz.handleKey('ENTER');

      expect(wiz.getState().inputMode).toBe('Stats');
      var statsLabels = wiz.getState().fields.map(function (f) { return f.label; });
      expect(statsLabels).toContain('x\u0304');
      expect(statsLabels).toContain('Sx');
      expect(statsLabels).toContain('C-Level');
    });
  });

  // ── First-keystroke-clears (fresh entry mode) ─────────────────────

  describe('First-keystroke-clears', function () {
    it('field with default .95: type 9,0 gives 90 not .9590', function () {
      var wiz = FormEngine.create('one-propzint-wizard');

      // Navigate to C-Level field (index 2, default '.95')
      wiz.handleKey('DOWN');
      wiz.handleKey('DOWN');

      expect(wiz.getValue('C-Level')).toBe('.95');

      // First digit keystroke should clear the default
      wiz.handleKey('9');
      expect(wiz.getValue('C-Level')).toBe('9');

      wiz.handleKey('0');
      expect(wiz.getValue('C-Level')).toBe('90');
    });

    it('fresh entry clears default when cursor arrives via DOWN', function () {
      var wiz = FormEngine.create('normalcdf-wizard');

      // mu has default '0', navigate there
      wiz.handleKey('DOWN'); // upper
      wiz.handleKey('DOWN'); // mu

      expect(wiz.getValue('\u03BC')).toBe('0');

      // First keystroke replaces default
      wiz.handleKey('5');
      expect(wiz.getValue('\u03BC')).toBe('5');
    });

    it('fresh entry clears default when cursor arrives via UP', function () {
      var wiz = FormEngine.create('normalcdf-wizard');

      // UP wraps to last field (Paste), then UP again to sigma
      wiz.handleKey('UP');
      wiz.handleKey('UP');

      expect(wiz.getState().activeField.label).toBe('\u03C3');
      expect(wiz.getValue('\u03C3')).toBe('1');

      // First digit replaces
      wiz.handleKey('2');
      expect(wiz.getValue('\u03C3')).toBe('2');
    });

    it('second digit appends instead of clearing', function () {
      var wiz = FormEngine.create('normalcdf-wizard');

      wiz.handleKey('DOWN');
      wiz.handleKey('DOWN'); // mu, default '0'

      wiz.handleKey('1'); // clears '0', now '1'
      wiz.handleKey('0'); // appends, now '10'

      expect(wiz.getValue('\u03BC')).toBe('10');
    });

    it('CLEAR on fresh entry empties the field', function () {
      var wiz = FormEngine.create('normalcdf-wizard');

      wiz.handleKey('DOWN');
      wiz.handleKey('DOWN'); // mu, default '0'

      wiz.handleKey('CLEAR');
      expect(wiz.getValue('\u03BC')).toBe('');
    });

    it('list selector does NOT clear on first key', function () {
      var wiz = FormEngine.create('one-var-stats-wizard');

      // List selector starts at L1, RIGHT should cycle (not clear)
      wiz.handleKey('RIGHT');
      expect(wiz.getValue('List')).toBe('L2');
    });
  });

  // ── getValue / getAllValues ────────────────────────────────────────

  describe('getValue / getAllValues', function () {
    it('getValue returns current value by label', function () {
      var wiz = FormEngine.create('one-propzint-wizard');

      expect(wiz.getValue('C-Level')).toBe('.95');
      expect(wiz.getValue('x')).toBe('');
    });

    it('getValue returns undefined for unknown label', function () {
      var wiz = FormEngine.create('one-propzint-wizard');

      expect(wiz.getValue('nonexistent')).toBeUndefined();
    });

    it('getAllValues returns all active field values', function () {
      var wiz = FormEngine.create('one-propzint-wizard');

      var all = wiz.getAllValues();
      expect(all).toHaveProperty('x');
      expect(all).toHaveProperty('n');
      expect(all).toHaveProperty('C-Level');
      expect(all).toHaveProperty('Calculate');
      expect(all['C-Level']).toBe('.95');
    });
  });

  // ── EventBus integration ──────────────────────────────────────────

  describe('EventBus integration', function () {
    it('emits field-focus events to external bus', function () {
      var bus = EventBus.create();
      var events = [];
      bus.on('field-focus', function (evt) { events.push(evt); });

      var wiz = FormEngine.create('normalcdf-wizard', bus);

      // Initial focus fires at creation
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].fieldLabel).toBe('lower');

      wiz.handleKey('DOWN');
      var last = events[events.length - 1];
      expect(last.fieldLabel).toBe('upper');
    });

    it('emits field-change events to external bus', function () {
      var bus = EventBus.create();
      var changes = [];
      bus.on('field-change', function (evt) { changes.push(evt); });

      var wiz = FormEngine.create('normalcdf-wizard', bus);
      wiz.handleKey('5');

      expect(changes.length).toBe(1);
      expect(changes[0].newValue).toBe('5');
    });

    it('emits compute events on submit', function () {
      var bus = EventBus.create();
      var computes = [];
      bus.on('compute', function (evt) { computes.push(evt); });

      var wiz = FormEngine.create('one-var-stats-wizard', bus);

      // Navigate to Calculate and press ENTER
      wiz.handleKey('DOWN');
      wiz.handleKey('DOWN');
      wiz.handleKey('ENTER');

      expect(computes.length).toBe(1);
      expect(computes[0].action).toBe('Calculate');
    });
  });

  // ── Plot editor screens ───────────────────────────────────────────

  describe('Plot editor screens', function () {
    it('creates a plot1-editor-scatter with correct fields', function () {
      var editor = FormEngine.create('plot1-editor-scatter');
      var state = editor.getState();

      expect(state.wizardId).toBe('plot1-editor-scatter');
      expect(state.isEditor).toBe(true);
      expect(state.fields.length).toBe(6);
      expect(state.fields[0].label).toBe('On/Off');
      expect(state.fields[1].label).toBe('Type');
      expect(state.fields[2].label).toBe('Xlist');
      expect(state.fields[3].label).toBe('Ylist');
      expect(state.fields[4].label).toBe('Mark');
      expect(state.fields[5].label).toBe('Color');
    });

    it('Xlist/Ylist fields cycle through lists', function () {
      var editor = FormEngine.create('plot1-editor-scatter');

      // Navigate to Xlist (index 2)
      editor.handleKey('DOWN');
      editor.handleKey('DOWN');

      expect(editor.getValue('Xlist')).toBe('L1');

      editor.handleKey('RIGHT');
      expect(editor.getValue('Xlist')).toBe('L2');

      editor.handleKey('RIGHT');
      expect(editor.getValue('Xlist')).toBe('L3');
    });

    it('Ylist defaults to L2 in scatter plot', function () {
      var editor = FormEngine.create('plot1-editor-scatter');

      expect(editor.getValue('Ylist')).toBe('L2');
    });

    it('On/Off: RIGHT moves the cursor, ENTER commits', function () {
      var editor = FormEngine.create('plot1-editor-scatter');

      expect(editor.getValue('On/Off')).toBe('On');

      editor.handleKey('RIGHT');
      expect(editor.getValue('On/Off')).toBe('On'); // not yet committed

      editor.handleKey('ENTER');
      expect(editor.getValue('On/Off')).toBe('Off');

      // Leave and re-enter the row: the in-row cursor resets to index 0
      // (On) regardless of the committed value (ROM-verified).
      editor.handleKey('DOWN');
      editor.handleKey('UP');
      editor.handleKey('ENTER');
      expect(editor.getValue('On/Off')).toBe('On');
    });

    it('Color field cycles through colors in editor', function () {
      var editor = FormEngine.create('plot1-editor-scatter');

      // Navigate to Color (last field, index 5)
      for (var i = 0; i < 5; i++) editor.handleKey('DOWN');

      expect(editor.getValue('Color')).toBe('BLUE');

      editor.handleKey('RIGHT');
      expect(editor.getValue('Color')).toBe('RED');
    });

    it('cursor wraps in editor', function () {
      var editor = FormEngine.create('plot1-editor-scatter');

      // 6 fields (0-5), DOWN 6 times wraps to 0
      for (var i = 0; i < 6; i++) editor.handleKey('DOWN');
      expect(editor.getState().cursorIndex).toBe(0);

      // UP from 0 wraps to 5
      editor.handleKey('UP');
      expect(editor.getState().cursorIndex).toBe(5);
    });

    it('histogram editor has Freq instead of Ylist', function () {
      var editor = FormEngine.create('plot1-editor-hist');
      var state = editor.getState();

      var labels = state.fields.map(function (f) { return f.label; });
      expect(labels).toContain('Freq');
      expect(labels).not.toContain('Ylist');
      expect(labels).toContain('Xlist');
    });

    it('modbox editor has correct field set', function () {
      var editor = FormEngine.create('plot1-editor-modbox');
      var state = editor.getState();

      expect(state.fields.length).toBe(5);
      var labels = state.fields.map(function (f) { return f.label; });
      expect(labels).toEqual(['On/Off', 'Type', 'Xlist', 'Freq', 'Color']);
    });

    it('inputMode is null for editors', function () {
      var editor = FormEngine.create('plot1-editor-scatter');
      expect(editor.getState().inputMode).toBeNull();
    });
  });

  // ── Complex wizard: two-samp-ttest ────────────────────────────────

  describe('Two-sample t-test wizard', function () {
    it('has all 11 fields in Stats mode', function () {
      var wiz = FormEngine.create('two-samp-ttest-stats-wizard');
      var state = wiz.getState();

      expect(state.inputMode).toBe('Stats');
      expect(state.fields.length).toBe(11);

      var labels = state.fields.map(function (f) { return f.label; });
      expect(labels[0]).toBe('Inpt');
      expect(labels).toContain('x\u03041');
      expect(labels).toContain('Sx1');
      expect(labels).toContain('n1');
      expect(labels).toContain('x\u03042');
      expect(labels).toContain('Pooled');
    });

    it('Pooled: RIGHT moves the cursor, ENTER commits', function () {
      var wiz = FormEngine.create('two-samp-ttest-stats-wizard');

      // Navigate to Pooled field
      var state = wiz.getState();
      var pooledIdx = -1;
      for (var i = 0; i < state.fields.length; i++) {
        if (state.fields[i].label === 'Pooled') { pooledIdx = i; break; }
      }
      expect(pooledIdx).toBeGreaterThan(-1);

      for (var j = 0; j < pooledIdx; j++) wiz.handleKey('DOWN');

      expect(wiz.getValue('Pooled')).toBe('No');

      wiz.handleKey('RIGHT');
      expect(wiz.getValue('Pooled')).toBe('No'); // not yet committed

      wiz.handleKey('ENTER');
      expect(wiz.getValue('Pooled')).toBe('Yes');

      // Leave and re-enter the row: the in-row cursor resets to index 0 (No)
      wiz.handleKey('DOWN');
      wiz.handleKey('UP');
      wiz.handleKey('ENTER');
      expect(wiz.getValue('Pooled')).toBe('No');
    });
  });

  // ── Linreg wizards ────────────────────────────────────────────────

  describe('LinReg wizards', function () {
    it('linreg-wizard has Xlist, Ylist, FreqList, Store RegEQ, Calculate', function () {
      var wiz = FormEngine.create('linreg-wizard');
      var labels = wiz.getState().fields.map(function (f) { return f.label; });

      expect(labels).toEqual(['Xlist', 'Ylist', 'FreqList', 'Store RegEQ', 'Calculate']);
    });

    it('linreg-ttest-wizard has beta-rho choice field', function () {
      var wiz = FormEngine.create('linreg-ttest-wizard');

      // Navigate to beta-rho field (index 3)
      for (var i = 0; i < 3; i++) wiz.handleKey('DOWN');

      var field = wiz.getState().activeField;
      expect(field.label).toBe('\u03B2 and \u03C1');
      expect(field.type).toBe('choice');

      expect(wiz.getValue('\u03B2 and \u03C1')).toBe('\u22600');

      // Choice fields commit on ENTER, not on RIGHT alone
      wiz.handleKey('RIGHT');
      wiz.handleKey('ENTER');
      expect(wiz.getValue('\u03B2 and \u03C1')).toBe('<0');
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────

  describe('Edge cases', function () {
    it('unrecognized key is a no-op', function () {
      var wiz = FormEngine.create('normalcdf-wizard');
      var state1 = wiz.getState();

      wiz.handleKey('ZOOM');
      var state2 = wiz.getState();

      expect(state2.cursorIndex).toBe(state1.cursorIndex);
      expect(state2.values).toEqual(state1.values);
    });

    it('digits on a choice field are ignored', function () {
      var wiz = FormEngine.create('invnorm-wizard');

      // Navigate to Tail field (index 3, type=choice)
      wiz.handleKey('DOWN');
      wiz.handleKey('DOWN');
      wiz.handleKey('DOWN');

      var before = wiz.getValue('Tail');
      wiz.handleKey('5');
      expect(wiz.getValue('Tail')).toBe(before);
    });

    it('NEGATIVE on a choice field is ignored', function () {
      var wiz = FormEngine.create('invnorm-wizard');

      wiz.handleKey('DOWN');
      wiz.handleKey('DOWN');
      wiz.handleKey('DOWN');

      var before = wiz.getValue('Tail');
      wiz.handleKey('NEGATIVE');
      expect(wiz.getValue('Tail')).toBe(before);
    });

    it('DEL on empty field is a no-op', function () {
      var wiz = FormEngine.create('normalcdf-wizard');

      // lower starts empty
      wiz.handleKey('DEL');
      expect(wiz.getValue('lower')).toBe('');
    });

    it('CLEAR on a choice field is ignored', function () {
      var wiz = FormEngine.create('invnorm-wizard');

      wiz.handleKey('DOWN');
      wiz.handleKey('DOWN');
      wiz.handleKey('DOWN');

      var before = wiz.getValue('Tail');
      wiz.handleKey('CLEAR');
      expect(wiz.getValue('Tail')).toBe(before);
    });

    it('LEFT/RIGHT on number field is a no-op', function () {
      var wiz = FormEngine.create('normalcdf-wizard');

      wiz.handleKey('1');
      wiz.handleKey('2');

      wiz.handleKey('LEFT');
      expect(wiz.getValue('lower')).toBe('12');

      wiz.handleKey('RIGHT');
      expect(wiz.getValue('lower')).toBe('12');
    });
  });

  // ── getState shape ────────────────────────────────────────────────

  describe('getState shape', function () {
    it('returns complete state object', function () {
      var wiz = FormEngine.create('normalcdf-wizard');
      var state = wiz.getState();

      expect(state).toHaveProperty('wizardId');
      expect(state).toHaveProperty('fields');
      expect(state).toHaveProperty('cursorIndex');
      expect(state).toHaveProperty('activeField');
      expect(state).toHaveProperty('values');
      expect(state).toHaveProperty('inputMode');
      expect(state).toHaveProperty('isEditor');

      expect(state.activeField).toHaveProperty('label');
      expect(state.activeField).toHaveProperty('type');
      expect(state.activeField).toHaveProperty('value');
    });

    it('fields array entries have label, type, value, options', function () {
      var wiz = FormEngine.create('invnorm-wizard');
      var state = wiz.getState();

      var tailField = state.fields[3];
      expect(tailField.label).toBe('Tail');
      expect(tailField.type).toBe('choice');
      expect(tailField.value).toBe('LEFT');
      expect(tailField.options).toEqual(['LEFT', 'CENTER', 'RIGHT']);
    });
  });
});
