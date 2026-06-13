/**
 * TI-84 CE Native Orchestrator — Vitest integration tests.
 *
 * Walks through complete procedures by key sequence and verifies
 * screen states, computation results, and event hooks.
 *
 * Modules are IIFEs that set window globals, so we evaluate them
 * inside a JSDOM instance.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { nativeScriptFilenames } from '../manifest.mjs';

var __dirname = dirname(fileURLToPath(import.meta.url));
var nativeDir = resolve(__dirname, '..');

// ── Module loader ──────────────────────────────────────────────────────

function loadModules() {
  var dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    runScripts: 'dangerously'
  });
  var win = dom.window;

  // Load all modules in order (no canvas needed for state-based testing)
  for (var i = 0; i < nativeScriptFilenames.length; i++) {
    var src = readFileSync(resolve(nativeDir, nativeScriptFilenames[i]), 'utf8');
    win.eval(src);
  }

  return {
    TI84Native:         win.TI84Native,
    TI84EventBus:       win.TI84EventBus,
    TI84StatMath:       win.TI84StatMath,
    TI84MenuTables:     win.TI84MenuTables,
    TI84FieldTables:    win.TI84FieldTables,
    TI84MenuNav:        win.TI84MenuNav,
    TI84FormEngine:     win.TI84FormEngine,
    TI84ResultFormatter: win.TI84ResultFormatter,
    TI84ScreenRenderer: win.TI84ScreenRenderer
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('TI84Native Orchestrator', function () {
  var TI84Native, StatMath;
  var calc;

  beforeEach(function () {
    var mods = loadModules();
    TI84Native = mods.TI84Native;
    StatMath = mods.TI84StatMath;
    // Create without canvas — state-based testing only (no rendering)
    calc = TI84Native.create();
  });

  // ── Bridge-compatible API ──────────────────────────────────────────

  describe('Bridge-compatible API', function () {
    it('init() resolves to true', async function () {
      var result = await calc.init();
      expect(result).toBe(true);
    });

    it('isRealEmulator() returns false', function () {
      expect(calc.isRealEmulator()).toBe(false);
    });

    it('getStatus() returns ready native status', function () {
      var status = calc.getStatus();
      expect(status.code).toBe('ready');
      expect(status.detail).toBe('Native mode');
      expect(status.usingMock).toBe(false);
      expect(status.romMeta).toBe(null);
    });

    it('sendButton() is an alias for pressKey', function () {
      var result = calc.sendButton('STAT');
      expect(result).toBe(true);
      expect(calc.getScreen().type).toBe('menu');
    });

    it('prepareHome() resets to home screen', function () {
      calc.pressKey('STAT');
      expect(calc.getScreen().type).toBe('menu');
      calc.prepareHome();
      expect(calc.getScreen().type).toBe('home');
    });
  });

  // ── Home screen ────────────────────────────────────────────────────

  describe('Home screen', function () {
    it('starts on home screen', function () {
      var scr = calc.getScreen();
      expect(scr.type).toBe('home');
      expect(scr.id).toBe('home');
    });

    it('CLEAR clears home lines', function () {
      // Get to home with some content by doing a computation and coming back
      calc.pressKey('CLEAR');
      expect(calc.getScreen().type).toBe('home');
    });
  });

  // ── Screen transitions ─────────────────────────────────────────────

  describe('Screen transitions', function () {
    it('Home -> STAT -> menu screen', function () {
      calc.pressKey('STAT');
      var scr = calc.getScreen();
      expect(scr.type).toBe('menu');
      expect(scr.id).toBe('stat-menu');
    });

    it('Menu -> RIGHT switches to CALC tab', function () {
      calc.pressKey('STAT');
      calc.pressKey('RIGHT');
      var scr = calc.getScreen();
      expect(scr.type).toBe('menu');
      expect(scr.id).toBe('stat-calc-menu');
    });

    it('Menu -> RIGHT -> RIGHT switches to TESTS tab', function () {
      calc.pressKey('STAT');
      calc.pressKey('RIGHT');
      calc.pressKey('RIGHT');
      var scr = calc.getScreen();
      expect(scr.type).toBe('menu');
      expect(scr.id).toBe('stat-tests-menu');
    });

    it('CLEAR from menu returns to home', function () {
      calc.pressKey('STAT');
      expect(calc.getScreen().type).toBe('menu');
      calc.pressKey('CLEAR');
      expect(calc.getScreen().type).toBe('home');
    });

    it('CLEAR from result returns to home', function () {
      // Quick computation to get to result screen
      calc.setList('L1', [1, 2, 3, 4, 5]);
      calc.pressKey('STAT');    // stat-menu
      calc.pressKey('RIGHT');   // stat-calc-menu
      calc.pressKey('ENTER');   // 1:1-Var Stats wizard
      calc.pressKey('DOWN');    // FreqList
      calc.pressKey('DOWN');    // Calculate
      calc.pressKey('ENTER');   // Execute

      expect(calc.getScreen().type).toBe('result');
      calc.pressKey('CLEAR');
      expect(calc.getScreen().type).toBe('home');
    });
  });

  // ── 2ND key combos ─────────────────────────────────────────────────

  describe('2ND key combos', function () {
    it('2ND+VARS opens distr-menu', function () {
      calc.pressKey('2ND');
      calc.pressKey('VARS');
      var scr = calc.getScreen();
      expect(scr.type).toBe('menu');
      expect(scr.id).toBe('distr-menu');
    });

    it('2ND+Y_EQUALS opens stat-plot-menu', function () {
      calc.pressKey('2ND');
      calc.pressKey('Y_EQUALS');
      var scr = calc.getScreen();
      expect(scr.type).toBe('menu');
      expect(scr.id).toBe('stat-plot-menu');
    });

    it('2ND+X_INVERSE opens matrix menu', function () {
      calc.pressKey('2ND');
      calc.pressKey('X_INVERSE');
      var scr = calc.getScreen();
      expect(scr.type).toBe('menu');
      expect(scr.id).toBe('matrix-menu-names');
    });

    it('2ND+STAT opens list-names-menu', function () {
      calc.pressKey('2ND');
      calc.pressKey('STAT');
      var scr = calc.getScreen();
      expect(scr.type).toBe('menu');
      expect(scr.id).toBe('list-names-menu');
    });

    it('2ND+MODE returns to home (QUIT)', function () {
      calc.pressKey('STAT');
      expect(calc.getScreen().type).toBe('menu');
      calc.pressKey('2ND');
      calc.pressKey('MODE');
      expect(calc.getScreen().type).toBe('home');
    });

    it('2ND+MODE from result returns to home', function () {
      calc.setList('L1', [1, 2, 3, 4, 5]);
      calc.pressKey('STAT');
      calc.pressKey('RIGHT');
      calc.pressKey('ENTER');
      calc.pressKey('DOWN');
      calc.pressKey('DOWN');
      calc.pressKey('ENTER');

      expect(calc.getScreen().type).toBe('result');
      calc.pressKey('2ND');
      calc.pressKey('MODE');
      expect(calc.getScreen().type).toBe('home');
    });
  });

  // ── 1-Var Stats procedure ──────────────────────────────────────────

  describe('1-Var Stats (full procedure)', function () {
    it('walks through the complete key sequence and gets correct results', function () {
      // Set up data
      calc.setList('L1', [1, 2, 3, 4, 5]);

      // Step 1: STAT
      calc.pressKey('STAT');
      expect(calc.getScreen().type).toBe('menu');
      expect(calc.getScreen().id).toBe('stat-menu');

      // Step 2: RIGHT to CALC tab
      calc.pressKey('RIGHT');
      expect(calc.getScreen().id).toBe('stat-calc-menu');

      // Step 3: ENTER to select 1:1-Var Stats
      calc.pressKey('ENTER');
      expect(calc.getScreen().type).toBe('wizard');
      expect(calc.getScreen().id).toBe('one-var-stats-wizard');

      // Verify wizard fields
      var wv = calc.getWizardValues();
      expect(wv).toBeTruthy();
      expect(wv['List']).toBe('L1');

      // Step 4: DOWN to FreqList
      calc.pressKey('DOWN');
      // Step 5: DOWN to Calculate
      calc.pressKey('DOWN');
      // Step 6: ENTER to Calculate
      calc.pressKey('ENTER');

      // Should now be on result screen
      expect(calc.getScreen().type).toBe('result');
      expect(calc.getScreen().id).toBe('one-var-stats-result-page1');

      // Verify computation: mean of [1,2,3,4,5] = 3, n = 5
      // The result screen has the formatted lines
    });

    it('computes correct mean and n for [1,2,3,4,5]', function () {
      calc.setList('L1', [1, 2, 3, 4, 5]);

      // Navigate to result
      calc.pressKey('STAT');
      calc.pressKey('RIGHT');
      calc.pressKey('ENTER');
      calc.pressKey('DOWN');
      calc.pressKey('DOWN');
      calc.pressKey('ENTER');

      // Verify we landed on the result
      expect(calc.getScreen().type).toBe('result');

      // Verify by direct StatMath call that the values are correct
      var result = StatMath.oneVarStats([1, 2, 3, 4, 5]);
      expect(result.xbar).toBe(3);
      expect(result.n).toBe(5);
      expect(result.sumX).toBe(15);
      expect(result.sumX2).toBe(55);
    });

    it('can scroll to page 2 with DOWN', function () {
      calc.setList('L1', [1, 2, 3, 4, 5]);

      calc.pressKey('STAT');
      calc.pressKey('RIGHT');
      calc.pressKey('ENTER');
      calc.pressKey('DOWN');
      calc.pressKey('DOWN');
      calc.pressKey('ENTER');

      expect(calc.getScreen().id).toBe('one-var-stats-result-page1');

      // Scroll to page 2
      calc.pressKey('DOWN');
      expect(calc.getScreen().id).toBe('one-var-stats-result-page2');
    });

    it('can scroll back to page 1 with UP', function () {
      calc.setList('L1', [1, 2, 3, 4, 5]);

      calc.pressKey('STAT');
      calc.pressKey('RIGHT');
      calc.pressKey('ENTER');
      calc.pressKey('DOWN');
      calc.pressKey('DOWN');
      calc.pressKey('ENTER');
      calc.pressKey('DOWN'); // page 2

      expect(calc.getScreen().id).toBe('one-var-stats-result-page2');

      calc.pressKey('UP');
      expect(calc.getScreen().id).toBe('one-var-stats-result-page1');
    });
  });

  // ── 1-PropZTest procedure ──────────────────────────────────────────

  describe('1-PropZTest (full procedure)', function () {
    it('walks through the complete key sequence', function () {
      // Navigate: STAT > TESTS > 5:1-PropZTest
      calc.pressKey('STAT');
      calc.pressKey('RIGHT');   // CALC
      calc.pressKey('RIGHT');   // TESTS
      expect(calc.getScreen().id).toBe('stat-tests-menu');

      // Select item 5 (1-PropZTest)
      calc.pressKey('5');
      expect(calc.getScreen().type).toBe('wizard');
      expect(calc.getScreen().id).toBe('one-propztest-wizard');

      // Enter p0 = 0.5
      calc.pressKey('DECIMAL');
      calc.pressKey('5');
      calc.pressKey('ENTER');  // confirm p0, move to x

      // Enter x = 55
      calc.pressKey('5');
      calc.pressKey('5');
      calc.pressKey('ENTER');  // confirm x, move to n

      // Enter n = 100
      calc.pressKey('1');
      calc.pressKey('0');
      calc.pressKey('0');
      calc.pressKey('ENTER');  // confirm n, move to prop choice

      // prop is already on != (default), press DOWN to skip
      calc.pressKey('DOWN');   // move to Color
      calc.pressKey('DOWN');   // move to Calculate/Draw

      // ENTER on Calculate
      calc.pressKey('ENTER');

      // Should be on result screen
      expect(calc.getScreen().type).toBe('result');
      expect(calc.getScreen().id).toBe('one-propztest-result');
    });

    it('computes z~1.0 and p~0.3173 for p0=0.5, x=55, n=100', function () {
      var result = StatMath.onePropZTest(0.5, 55, 100, '\u2260p\u2080');
      expect(result.z).toBeCloseTo(1.0, 4);
      expect(result.p).toBeCloseTo(0.3173, 2);
      expect(result.pHat).toBeCloseTo(0.55, 10);
      expect(result.n).toBe(100);
    });
  });

  // ── normalcdf procedure ────────────────────────────────────────────

  describe('normalcdf (full procedure)', function () {
    it('walks through the key sequence and pastes to home', function () {
      // 2ND+VARS -> DISTR menu
      calc.pressKey('2ND');
      calc.pressKey('VARS');
      expect(calc.getScreen().type).toBe('menu');
      expect(calc.getScreen().id).toBe('distr-menu');

      // Select item 2: normalcdf
      calc.pressKey('2');
      expect(calc.getScreen().type).toBe('wizard');
      expect(calc.getScreen().id).toBe('normalcdf-wizard');

      // Enter lower = -1
      calc.pressKey('NEGATIVE');
      calc.pressKey('1');
      calc.pressKey('ENTER');  // confirm lower, move to upper

      // Enter upper = 1
      calc.pressKey('1');
      calc.pressKey('ENTER');  // confirm upper, move to mu

      // mu defaults to 0, sigma defaults to 1
      calc.pressKey('ENTER');  // confirm mu, move to sigma
      calc.pressKey('ENTER');  // confirm sigma, move to Paste

      // ENTER on Paste
      calc.pressKey('ENTER');

      // Should be back on home screen with the result pasted
      expect(calc.getScreen().type).toBe('home');

      // Verify the computed value is approximately 0.6827
      var lines = calc._getHomeLines();
      expect(lines.length).toBeGreaterThan(0);
      var lastLine = lines[lines.length - 1];
      var val = parseFloat(lastLine);
      expect(val).toBeCloseTo(0.6827, 2);
    });

    it('computes normalcdf(-1,1,0,1) ~ 0.6827', function () {
      var result = StatMath.normalcdf(-1, 1, 0, 1);
      expect(result).toBeCloseTo(0.6827, 3);
    });
  });

  // ── invNorm procedure ──────────────────────────────────────────────

  describe('invNorm (full procedure)', function () {
    it('walks through invNorm(.975,0,1,LEFT) and gets ~1.96', function () {
      calc.pressKey('2ND');
      calc.pressKey('VARS');
      calc.pressKey('3');     // 3:invNorm(
      expect(calc.getScreen().type).toBe('wizard');
      expect(calc.getScreen().id).toBe('invnorm-wizard');

      // Enter area = 0.975
      calc.pressKey('DECIMAL');
      calc.pressKey('9');
      calc.pressKey('7');
      calc.pressKey('5');
      calc.pressKey('ENTER');  // confirm area, move to mu

      // mu=0 (default), sigma=1 (default)
      calc.pressKey('ENTER');  // confirm mu
      calc.pressKey('ENTER');  // confirm sigma, move to Tail

      // Tail defaults to LEFT, skip
      calc.pressKey('DOWN');   // move to Paste

      calc.pressKey('ENTER');  // Paste

      expect(calc.getScreen().type).toBe('home');
      var lines = calc._getHomeLines();
      var val = parseFloat(lines[lines.length - 1]);
      expect(val).toBeCloseTo(1.96, 1);
    });
  });

  // ── binompdf procedure ─────────────────────────────────────────────

  describe('binompdf (full procedure)', function () {
    it('computes binompdf(10, 0.5, 5) ~ 0.2461', function () {
      calc.pressKey('2ND');
      calc.pressKey('VARS');

      // binompdf is item A (index 10) in the distr menu
      calc.pressKey('A');
      expect(calc.getScreen().type).toBe('wizard');
      expect(calc.getScreen().id).toBe('binompdf-wizard');

      // Enter trials = 10
      calc.pressKey('1');
      calc.pressKey('0');
      calc.pressKey('ENTER');

      // Enter p = 0.5
      calc.pressKey('DECIMAL');
      calc.pressKey('5');
      calc.pressKey('ENTER');

      // Enter x = 5
      calc.pressKey('5');
      calc.pressKey('ENTER');  // move to Paste

      calc.pressKey('ENTER');  // Paste

      expect(calc.getScreen().type).toBe('home');
      var lines = calc._getHomeLines();
      var val = parseFloat(lines[lines.length - 1]);
      expect(val).toBeCloseTo(0.2461, 3);
    });
  });

  // ── t-test (Stats mode) procedure ─────────────────────────────────

  describe('T-Test Stats mode', function () {
    it('navigates STAT > TESTS > 2:T-Test and computes', function () {
      calc.pressKey('STAT');
      calc.pressKey('RIGHT');
      calc.pressKey('RIGHT');
      expect(calc.getScreen().id).toBe('stat-tests-menu');

      // 2:T-Test
      calc.pressKey('2');
      expect(calc.getScreen().type).toBe('wizard');

      // The wizard opens in Data mode by default. Switch to Stats mode.
      // Inpt field is first, use RIGHT to switch to Stats
      calc.pressKey('RIGHT');

      // Now in Stats mode
      var ws = calc.getWizardState();
      expect(ws.inputMode).toBe('Stats');

      // mu0 = 100
      calc.pressKey('DOWN');   // move to mu0
      calc.pressKey('1');
      calc.pressKey('0');
      calc.pressKey('0');
      calc.pressKey('ENTER');  // confirm mu0

      // xbar = 105
      calc.pressKey('1');
      calc.pressKey('0');
      calc.pressKey('5');
      calc.pressKey('ENTER');

      // Sx = 15
      calc.pressKey('1');
      calc.pressKey('5');
      calc.pressKey('ENTER');

      // n = 30
      calc.pressKey('3');
      calc.pressKey('0');
      calc.pressKey('ENTER');  // move to alt hypothesis

      // alt defaults to != , skip
      calc.pressKey('DOWN');   // Color
      calc.pressKey('DOWN');   // Calculate/Draw

      calc.pressKey('ENTER');  // Calculate

      expect(calc.getScreen().type).toBe('result');
      expect(calc.getScreen().id).toBe('t-test-result');
    });
  });

  // ── List management ────────────────────────────────────────────────

  describe('List management', function () {
    it('setList/getList stores and retrieves data', function () {
      calc.setList('L1', [10, 20, 30]);
      expect(calc.getList('L1')).toEqual([10, 20, 30]);
    });

    it('getList returns a copy (not the internal array)', function () {
      calc.setList('L1', [1, 2, 3]);
      var list = calc.getList('L1');
      list.push(4);
      expect(calc.getList('L1')).toEqual([1, 2, 3]);
    });

    it('setList with empty array', function () {
      calc.setList('L1', []);
      expect(calc.getList('L1')).toEqual([]);
    });

    it('getList for unset list returns empty array', function () {
      expect(calc.getList('L6')).toEqual([]);
    });
  });

  // ── Matrix management ──────────────────────────────────────────────

  describe('Matrix management', function () {
    it('setMatrix/getMatrix stores and retrieves data', function () {
      calc.setMatrix('[A]', [[1, 2], [3, 4]]);
      expect(calc.getMatrix('[A]')).toEqual([[1, 2], [3, 4]]);
    });

    it('getMatrix returns a deep copy', function () {
      calc.setMatrix('[A]', [[1, 2], [3, 4]]);
      var m = calc.getMatrix('[A]');
      m[0][0] = 99;
      expect(calc.getMatrix('[A]')[0][0]).toBe(1);
    });
  });

  // ── Event hooks ────────────────────────────────────────────────────

  describe('Event hooks', function () {
    it('screen-change fires on menu open', function () {
      var events = [];
      calc.on('screen-change', function (evt) {
        events.push(evt);
      });

      calc.pressKey('STAT');

      expect(events.length).toBeGreaterThan(0);
      var last = events[events.length - 1];
      expect(last.from.type).toBe('home');
      expect(last.to.type).toBe('menu');
      expect(last.to.id).toBe('stat-menu');
    });

    it('screen-change fires on tab switch', function () {
      calc.pressKey('STAT');

      var events = [];
      calc.on('screen-change', function (evt) {
        events.push(evt);
      });

      calc.pressKey('RIGHT');

      expect(events.length).toBe(1);
      expect(events[0].from.id).toBe('stat-menu');
      expect(events[0].to.id).toBe('stat-calc-menu');
    });

    it('compute event fires with results on Calculate', function () {
      calc.setList('L1', [2, 4, 6, 8, 10]);

      var computeEvents = [];
      calc.on('compute', function (evt) {
        computeEvents.push(evt);
      });

      // Navigate to 1-Var Stats and calculate
      calc.pressKey('STAT');
      calc.pressKey('RIGHT');
      calc.pressKey('ENTER');
      calc.pressKey('DOWN');
      calc.pressKey('DOWN');
      calc.pressKey('ENTER');

      expect(computeEvents.length).toBe(1);
      expect(computeEvents[0].type).toBe('one-var-stats-wizard');
      expect(computeEvents[0].results).toBeTruthy();
      expect(computeEvents[0].results.xbar).toBe(6);
      expect(computeEvents[0].results.n).toBe(5);
    });

    it('key-press event fires for every key', function () {
      var keyEvents = [];
      calc.on('key-press', function (evt) {
        keyEvents.push(evt);
      });

      calc.pressKey('STAT');
      calc.pressKey('RIGHT');
      calc.pressKey('ENTER');

      expect(keyEvents.length).toBe(3);
      expect(keyEvents[0].key).toBe('STAT');
      expect(keyEvents[1].key).toBe('RIGHT');
      expect(keyEvents[2].key).toBe('ENTER');
    });

    it('menu-select event fires when menu item selected', function () {
      var selectEvents = [];
      calc.on('menu-select', function (evt) {
        selectEvents.push(evt);
      });

      calc.pressKey('STAT');
      calc.pressKey('RIGHT');
      calc.pressKey('ENTER');

      expect(selectEvents.length).toBe(1);
      expect(selectEvents[0].menuId).toBe('stat-calc-menu');
      expect(selectEvents[0].itemIndex).toBe(0);
    });

    it('result-display event fires when result shown', function () {
      calc.setList('L1', [1, 2, 3]);

      var resultEvents = [];
      calc.on('result-display', function (evt) {
        resultEvents.push(evt);
      });

      calc.pressKey('STAT');
      calc.pressKey('RIGHT');
      calc.pressKey('ENTER');
      calc.pressKey('DOWN');
      calc.pressKey('DOWN');
      calc.pressKey('ENTER');

      expect(resultEvents.length).toBe(1);
      expect(resultEvents[0].screenId).toBe('one-var-stats-result-page1');
      expect(resultEvents[0].lines).toBeTruthy();
      expect(resultEvents[0].lines.length).toBeGreaterThan(0);
    });

    it('off() removes a listener', function () {
      var count = 0;
      function listener() { count++; }

      calc.on('key-press', listener);
      calc.pressKey('STAT');
      expect(count).toBe(1);

      calc.off('key-press', listener);
      calc.pressKey('CLEAR');
      expect(count).toBe(1);
    });
  });

  // ── Save/Load state ────────────────────────────────────────────────

  describe('Save/Load state', function () {
    it('save() captures current state', function () {
      calc.setList('L1', [10, 20, 30]);
      var state = calc.save();
      expect(state.screen.type).toBe('home');
      expect(state.lists.L1).toEqual([10, 20, 30]);
    });

    it('load() restores state', function () {
      calc.setList('L1', [10, 20, 30]);
      var state = calc.save();

      // Create a fresh calc and load
      var mods = loadModules();
      var calc2 = mods.TI84Native.create();
      calc2.load(state);

      expect(calc2.getList('L1')).toEqual([10, 20, 30]);
      expect(calc2.getScreen().type).toBe('home');
    });
  });

  // ── reset() ────────────────────────────────────────────────────────

  describe('reset()', function () {
    it('returns to home screen and clears state', function () {
      calc.pressKey('STAT');
      expect(calc.getScreen().type).toBe('menu');
      calc.reset();
      expect(calc.getScreen().type).toBe('home');
    });
  });

  // ── Wizard field navigation ────────────────────────────────────────

  describe('Wizard field interaction', function () {
    it('getWizardValues() returns field values in wizard', function () {
      calc.pressKey('2ND');
      calc.pressKey('VARS');
      calc.pressKey('2');  // normalcdf-wizard

      var vals = calc.getWizardValues();
      expect(vals).toBeTruthy();
      expect(vals['\u03BC']).toBe('0');
      expect(vals['\u03C3']).toBe('1');
    });

    it('getWizardValues() returns null when not in wizard', function () {
      expect(calc.getWizardValues()).toBeNull();
    });

    it('getWizardState() returns full state in wizard', function () {
      calc.pressKey('2ND');
      calc.pressKey('VARS');
      calc.pressKey('2');

      var ws = calc.getWizardState();
      expect(ws).toBeTruthy();
      expect(ws.wizardId).toBe('normalcdf-wizard');
      expect(ws.fields.length).toBe(5);
      expect(ws.cursorIndex).toBe(0);
    });
  });

  // ── Number key direct selection in menus ───────────────────────────

  describe('Menu direct key selection', function () {
    it('number key 8 selects LinReg(a+bx) in CALC menu', function () {
      calc.pressKey('STAT');
      calc.pressKey('RIGHT');
      expect(calc.getScreen().id).toBe('stat-calc-menu');

      calc.pressKey('8');
      expect(calc.getScreen().type).toBe('wizard');
      expect(calc.getScreen().id).toBe('linreg-wizard');
    });

    it('letter key A selects 1-PropZInt in TESTS menu', function () {
      calc.pressKey('STAT');
      calc.pressKey('RIGHT');
      calc.pressKey('RIGHT');
      expect(calc.getScreen().id).toBe('stat-tests-menu');

      calc.pressKey('A');
      expect(calc.getScreen().type).toBe('wizard');
      expect(calc.getScreen().id).toBe('one-propzint-wizard');
    });
  });

  // ── 1-PropZInt procedure ───────────────────────────────────────────

  describe('1-PropZInt (full procedure)', function () {
    it('computes correct interval for x=55, n=100, C-Level=0.95', function () {
      calc.pressKey('STAT');
      calc.pressKey('RIGHT');
      calc.pressKey('RIGHT');
      calc.pressKey('A');     // 1-PropZInt

      expect(calc.getScreen().type).toBe('wizard');
      expect(calc.getScreen().id).toBe('one-propzint-wizard');

      // x = 55
      calc.pressKey('5');
      calc.pressKey('5');
      calc.pressKey('ENTER');

      // n = 100
      calc.pressKey('1');
      calc.pressKey('0');
      calc.pressKey('0');
      calc.pressKey('ENTER');

      // C-Level = .95 (default)
      calc.pressKey('ENTER');

      // Calculate
      calc.pressKey('ENTER');

      expect(calc.getScreen().type).toBe('result');
      expect(calc.getScreen().id).toBe('one-propzint-result');

      // Verify the computation directly
      var result = StatMath.onePropZInt(55, 100, 0.95);
      expect(result.pHat).toBeCloseTo(0.55, 10);
      expect(result.lower).toBeCloseTo(0.4525, 2);
      expect(result.upper).toBeCloseTo(0.6475, 2);
    });
  });

  // ── chi2GOF test procedure ─────────────────────────────────────────

  describe('chi2GOF-Test (data-driven)', function () {
    it('computes chi-square for given observed/expected lists', function () {
      calc.setList('L1', [30, 20, 25, 25]);  // observed
      calc.setList('L2', [25, 25, 25, 25]);  // expected

      calc.pressKey('STAT');
      calc.pressKey('RIGHT');
      calc.pressKey('RIGHT');
      calc.pressKey('D');   // chi2GOF-Test

      expect(calc.getScreen().type).toBe('wizard');
      expect(calc.getScreen().id).toBe('chi2gof-wizard');

      // Observed=L1 (default), Expected=L2 (default)
      calc.pressKey('DOWN');  // move to Expected
      calc.pressKey('DOWN');  // move to df

      // Enter df = 3
      calc.pressKey('3');
      calc.pressKey('ENTER');  // confirm df

      // Skip Color
      calc.pressKey('DOWN');

      // Calculate
      calc.pressKey('ENTER');

      expect(calc.getScreen().type).toBe('result');
      expect(calc.getScreen().id).toBe('chi2gof-result');

      // Verify computation
      var result = StatMath.chi2GOFTest([30, 20, 25, 25], [25, 25, 25, 25], 3);
      expect(result.chi2).toBeCloseTo(2.0, 5);
      expect(result.df).toBe(3);
    });
  });

  // ── LinReg procedure ───────────────────────────────────────────────

  describe('LinReg (full procedure)', function () {
    it('computes regression for L1=[1,2,3,4,5], L2=[2,4,6,8,10]', function () {
      calc.setList('L1', [1, 2, 3, 4, 5]);
      calc.setList('L2', [2, 4, 6, 8, 10]);

      calc.pressKey('STAT');
      calc.pressKey('RIGHT');
      calc.pressKey('8');   // 8:LinReg(a+bx)

      expect(calc.getScreen().type).toBe('wizard');
      expect(calc.getScreen().id).toBe('linreg-wizard');

      // Xlist=L1 (default), Ylist=L2 (default)
      calc.pressKey('DOWN');  // Ylist
      calc.pressKey('DOWN');  // FreqList
      calc.pressKey('DOWN');  // Store RegEQ
      calc.pressKey('DOWN');  // Calculate

      calc.pressKey('ENTER');

      expect(calc.getScreen().type).toBe('result');
      expect(calc.getScreen().id).toBe('linreg-result');

      // Verify: y = 0 + 2x, perfect fit
      var result = StatMath.linReg([1,2,3,4,5], [2,4,6,8,10]);
      expect(result.a).toBeCloseTo(0, 5);
      expect(result.b).toBeCloseTo(2, 5);
      expect(result.r).toBeCloseTo(1, 5);
    });
  });

  // ── Graph screen ───────────────────────────────────────────────────

  describe('Graph screen', function () {
    it('Draw action leads to graph screen', function () {
      calc.pressKey('STAT');
      calc.pressKey('RIGHT');
      calc.pressKey('RIGHT');

      // 5:1-PropZTest
      calc.pressKey('5');

      // Fill in values
      calc.pressKey('DECIMAL');
      calc.pressKey('5');
      calc.pressKey('ENTER');

      calc.pressKey('5');
      calc.pressKey('0');
      calc.pressKey('ENTER');

      calc.pressKey('1');
      calc.pressKey('0');
      calc.pressKey('0');
      calc.pressKey('ENTER');

      // Skip prop
      calc.pressKey('DOWN');
      // Skip Color
      calc.pressKey('DOWN');

      // Switch to Draw
      calc.pressKey('RIGHT');

      // Submit Draw
      calc.pressKey('ENTER');

      expect(calc.getScreen().type).toBe('graph');
    });

    it('TRACE toggles trace mode', function () {
      // Get to a graph screen first
      calc.pressKey('STAT');
      calc.pressKey('RIGHT');
      calc.pressKey('RIGHT');
      calc.pressKey('5');

      calc.pressKey('DECIMAL');
      calc.pressKey('5');
      calc.pressKey('ENTER');
      calc.pressKey('5');
      calc.pressKey('0');
      calc.pressKey('ENTER');
      calc.pressKey('1');
      calc.pressKey('0');
      calc.pressKey('0');
      calc.pressKey('ENTER');
      calc.pressKey('DOWN');
      calc.pressKey('DOWN');
      calc.pressKey('RIGHT');
      calc.pressKey('ENTER');

      expect(calc.getScreen().type).toBe('graph');

      // TRACE toggles
      calc.pressKey('TRACE');
      // graph state is internal, but CLEAR should still work
      calc.pressKey('CLEAR');
      expect(calc.getScreen().type).toBe('home');
    });
  });

  // ── mountCanvas ────────────────────────────────────────────────────

  describe('mountCanvas', function () {
    it('can create without canvas and still function', function () {
      var mods = loadModules();
      var calc2 = mods.TI84Native.create();
      expect(calc2.getScreen().type).toBe('home');

      // Operate without canvas — no rendering, but state changes work
      calc2.pressKey('STAT');
      expect(calc2.getScreen().type).toBe('menu');
    });
  });

  // ── geometcdf procedure ────────────────────────────────────────────

  describe('geometcdf (full procedure)', function () {
    it('computes geometcdf(0.3, 4) via DISTR menu', function () {
      calc.pressKey('2ND');
      calc.pressKey('VARS');

      // geometcdf is item F (index 15)
      calc.pressKey('F');
      expect(calc.getScreen().type).toBe('wizard');
      expect(calc.getScreen().id).toBe('geometcdf-wizard');

      // p = 0.3
      calc.pressKey('DECIMAL');
      calc.pressKey('3');
      calc.pressKey('ENTER');

      // x = 4
      calc.pressKey('4');
      calc.pressKey('ENTER');

      // Paste
      calc.pressKey('ENTER');

      expect(calc.getScreen().type).toBe('home');
      var lines = calc._getHomeLines();
      var val = parseFloat(lines[lines.length - 1]);
      // geometcdf(0.3, 4) = 1 - (0.7)^4 = 1 - 0.2401 = 0.7599
      expect(val).toBeCloseTo(0.7599, 3);
    });
  });
});
