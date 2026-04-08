/**
 * TI-84 CE Menu Navigation — Vitest tests.
 *
 * Tests tab switching, cursor wrapping, number/letter key selection,
 * ENTER selection, and DISTR menu navigation.
 *
 * Modules are IIFEs that set window globals, so we evaluate them
 * against a mock window object (jsdom provides window in vitest).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

// ── Module loader ──────────────────────────────────────────────────────

const nativeDir = resolve(__dirname, '..');

function loadModules() {
  var dom = new JSDOM('', { runScripts: 'dangerously' });
  var win = dom.window;

  // Load menu-tables first (dependency), then menu-nav
  var tablesSrc = readFileSync(resolve(nativeDir, 'menu-tables.js'), 'utf8');
  var navSrc = readFileSync(resolve(nativeDir, 'menu-nav.js'), 'utf8');

  win.eval(tablesSrc);
  win.eval(navSrc);

  return {
    MenuTables: win.TI84MenuTables,
    MenuNav: win.TI84MenuNav
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('TI84MenuNav', function () {
  var MenuTables;
  var MenuNav;

  beforeEach(function () {
    var mods = loadModules();
    MenuTables = mods.MenuTables;
    MenuNav = mods.MenuNav;
  });

  // ── Tab switching ──────────────────────────────────────────────────

  describe('Tab switching (STAT menu)', function () {
    it('starts at stat-menu (EDIT tab)', function () {
      var menu = MenuNav.create('stat-menu');
      var state = menu.getState();

      expect(state.menuId).toBe('stat-menu');
      expect(state.activeTab).toBe('EDIT');
      expect(state.tabs).toEqual(['EDIT', 'CALC', 'TESTS']);
    });

    it('RIGHT switches EDIT -> CALC', function () {
      var menu = MenuNav.create('stat-menu');
      menu.handleKey('RIGHT');
      var state = menu.getState();

      expect(state.menuId).toBe('stat-calc-menu');
      expect(state.activeTab).toBe('CALC');
    });

    it('RIGHT twice switches EDIT -> CALC -> TESTS', function () {
      var menu = MenuNav.create('stat-menu');
      menu.handleKey('RIGHT');
      menu.handleKey('RIGHT');
      var state = menu.getState();

      expect(state.menuId).toBe('stat-tests-menu');
      expect(state.activeTab).toBe('TESTS');
    });

    it('RIGHT three times wraps TESTS -> EDIT', function () {
      var menu = MenuNav.create('stat-menu');
      menu.handleKey('RIGHT');
      menu.handleKey('RIGHT');
      menu.handleKey('RIGHT');
      var state = menu.getState();

      expect(state.menuId).toBe('stat-menu');
      expect(state.activeTab).toBe('EDIT');
    });

    it('LEFT wraps EDIT -> TESTS', function () {
      var menu = MenuNav.create('stat-menu');
      menu.handleKey('LEFT');
      var state = menu.getState();

      expect(state.menuId).toBe('stat-tests-menu');
      expect(state.activeTab).toBe('TESTS');
    });

    it('tab switch resets cursor to 0', function () {
      var menu = MenuNav.create('stat-menu');
      // Move cursor down in EDIT
      menu.handleKey('DOWN');
      menu.handleKey('DOWN');
      expect(menu.getState().cursorIndex).toBe(2);

      // Switch tab — cursor should reset
      menu.handleKey('RIGHT');
      expect(menu.getState().cursorIndex).toBe(0);
    });
  });

  // ── Cursor wrapping ────────────────────────────────────────────────

  describe('Cursor wrapping', function () {
    it('DOWN wraps from last item to first', function () {
      var menu = MenuNav.create('stat-menu');
      // stat-menu EDIT has 5 items (indices 0-4)
      var state = menu.getState();
      var count = state.items.length;
      expect(count).toBe(5);

      // Move to last item
      for (var i = 0; i < count; i++) {
        menu.handleKey('DOWN');
      }
      // Should wrap to 0
      expect(menu.getState().cursorIndex).toBe(0);
    });

    it('UP wraps from first item to last', function () {
      var menu = MenuNav.create('stat-menu');
      expect(menu.getState().cursorIndex).toBe(0);

      menu.handleKey('UP');
      // Should wrap to last item (index 4)
      expect(menu.getState().cursorIndex).toBe(4);
    });

    it('UP wraps in TESTS menu (18 items)', function () {
      var menu = MenuNav.create('stat-tests-menu');
      expect(menu.getState().items.length).toBe(18);

      menu.handleKey('UP');
      expect(menu.getState().cursorIndex).toBe(17);
    });
  });

  // ── Number key selection ───────────────────────────────────────────

  describe('Number key selection', function () {
    it('"5" in stat-tests-menu selects item index 4 (1-PropZTest)', function () {
      var menu = MenuNav.create('stat-tests-menu');
      var selected = null;
      menu.onSelect(function (evt) { selected = evt; });

      menu.handleKey('5');

      expect(selected).not.toBeNull();
      expect(selected.itemIndex).toBe(4);
      expect(selected.itemLabel).toBe('5:1-PropZTest...');
      expect(selected.targetScreen).toBe('one-propztest-wizard');
    });

    it('"1" in stat-calc-menu selects item index 0 (1-Var Stats)', function () {
      var menu = MenuNav.create('stat-calc-menu');
      var selected = null;
      menu.onSelect(function (evt) { selected = evt; });

      menu.handleKey('1');

      expect(selected).not.toBeNull();
      expect(selected.itemIndex).toBe(0);
      expect(selected.itemLabel).toBe('1:1-Var Stats');
      expect(selected.targetScreen).toBe('one-var-stats-wizard');
    });

    it('"8" in stat-calc-menu selects LinReg(a+bx)', function () {
      var menu = MenuNav.create('stat-calc-menu');
      var selected = null;
      menu.onSelect(function (evt) { selected = evt; });

      menu.handleKey('8');

      expect(selected.itemIndex).toBe(7);
      expect(selected.itemLabel).toBe('8:LinReg(a+bx)');
      expect(selected.targetScreen).toBe('linreg-wizard');
    });

    it('"2" in stat-tests-menu selects T-Test (index 1)', function () {
      var menu = MenuNav.create('stat-tests-menu');
      var selected = null;
      menu.onSelect(function (evt) { selected = evt; });

      menu.handleKey('2');

      expect(selected.itemIndex).toBe(1);
      expect(selected.itemLabel).toBe('2:T-Test...');
      expect(selected.targetScreen).toBe('t-test-data-wizard');
    });

    it('"8" in stat-tests-menu selects TInterval (index 7)', function () {
      var menu = MenuNav.create('stat-tests-menu');
      var selected = null;
      menu.onSelect(function (evt) { selected = evt; });

      menu.handleKey('8');

      expect(selected.itemIndex).toBe(7);
      expect(selected.itemLabel).toBe('8:TInterval...');
      expect(selected.targetScreen).toBe('t-interval-data-wizard');
    });

    it('"0" in stat-tests-menu selects 2-SampTInt (index 9)', function () {
      var menu = MenuNav.create('stat-tests-menu');
      var selected = null;
      menu.onSelect(function (evt) { selected = evt; });

      menu.handleKey('0');

      expect(selected.itemIndex).toBe(9);
      expect(selected.itemLabel).toBe('0:2-SampTInt...');
      expect(selected.targetScreen).toBe('two-samp-tint-stats-wizard');
    });

    it('"4" in stat-tests-menu selects 2-SampTTest (index 3)', function () {
      var menu = MenuNav.create('stat-tests-menu');
      var selected = null;
      menu.onSelect(function (evt) { selected = evt; });

      menu.handleKey('4');

      expect(selected.itemIndex).toBe(3);
      expect(selected.itemLabel).toBe('4:2-SampTTest...');
      expect(selected.targetScreen).toBe('two-samp-ttest-stats-wizard');
    });
  });

  // ── Letter key selection ───────────────────────────────────────────

  describe('Letter key selection', function () {
    it('"D" in stat-tests-menu selects chi2GOF-Test (index 13)', function () {
      var menu = MenuNav.create('stat-tests-menu');
      var selected = null;
      menu.onSelect(function (evt) { selected = evt; });

      menu.handleKey('D');

      expect(selected.itemIndex).toBe(13);
      expect(selected.itemLabel).toContain('GOF-Test');
      expect(selected.targetScreen).toBe('chi2gof-wizard');
    });

    it('"A" in stat-tests-menu selects 1-PropZInt (index 10)', function () {
      var menu = MenuNav.create('stat-tests-menu');
      var selected = null;
      menu.onSelect(function (evt) { selected = evt; });

      menu.handleKey('A');

      expect(selected.itemIndex).toBe(10);
      expect(selected.itemLabel).toBe('A:1-PropZInt...');
      expect(selected.targetScreen).toBe('one-propzint-wizard');
    });

    it('"C" in stat-tests-menu selects chi2-Test (index 12)', function () {
      var menu = MenuNav.create('stat-tests-menu');
      var selected = null;
      menu.onSelect(function (evt) { selected = evt; });

      menu.handleKey('C');

      expect(selected.itemIndex).toBe(12);
      expect(selected.targetScreen).toBe('chi2test-wizard');
    });

    it('"F" in stat-tests-menu selects LinRegTTest (index 15)', function () {
      var menu = MenuNav.create('stat-tests-menu');
      var selected = null;
      menu.onSelect(function (evt) { selected = evt; });

      menu.handleKey('F');

      expect(selected.itemIndex).toBe(15);
      expect(selected.itemLabel).toBe('F:LinRegTTest...');
      expect(selected.targetScreen).toBe('linreg-ttest-wizard');
    });

    it('"G" in stat-tests-menu selects LinRegTInt (index 16)', function () {
      var menu = MenuNav.create('stat-tests-menu');
      var selected = null;
      menu.onSelect(function (evt) { selected = evt; });

      menu.handleKey('G');

      expect(selected.itemIndex).toBe(16);
      expect(selected.itemLabel).toBe('G:LinRegTInt...');
      expect(selected.targetScreen).toBe('linreg-tint-wizard');
    });

    it('lowercase "d" also works (case insensitive)', function () {
      var menu = MenuNav.create('stat-tests-menu');
      var selected = null;
      menu.onSelect(function (evt) { selected = evt; });

      menu.handleKey('d');

      expect(selected.itemIndex).toBe(13);
      expect(selected.targetScreen).toBe('chi2gof-wizard');
    });
  });

  // ── ENTER selection ────────────────────────────────────────────────

  describe('ENTER selection', function () {
    it('ENTER returns selected item and corresponding wizard screen', function () {
      var menu = MenuNav.create('stat-calc-menu');
      var selected = null;
      menu.onSelect(function (evt) { selected = evt; });

      // Cursor starts at 0 (1-Var Stats)
      var result = menu.handleKey('ENTER');

      expect(selected).not.toBeNull();
      expect(selected.menuId).toBe('stat-calc-menu');
      expect(selected.itemIndex).toBe(0);
      expect(selected.itemLabel).toBe('1:1-Var Stats');
      expect(selected.targetScreen).toBe('one-var-stats-wizard');
      expect(result.selected).toBe(selected);
    });

    it('ENTER after DOWN selects the item at the cursor', function () {
      var menu = MenuNav.create('stat-tests-menu');
      var selected = null;
      menu.onSelect(function (evt) { selected = evt; });

      // Move to index 4 (5:1-PropZTest)
      menu.handleKey('DOWN');
      menu.handleKey('DOWN');
      menu.handleKey('DOWN');
      menu.handleKey('DOWN');
      menu.handleKey('ENTER');

      expect(selected.itemIndex).toBe(4);
      expect(selected.targetScreen).toBe('one-propztest-wizard');
    });
  });

  // ── DISTR menu ─────────────────────────────────────────────────────

  describe('DISTR menu', function () {
    it('"2" in distr-menu selects normalcdf (index 1)', function () {
      var menu = MenuNav.create('distr-menu');
      var selected = null;
      menu.onSelect(function (evt) { selected = evt; });

      menu.handleKey('2');

      expect(selected.itemIndex).toBe(1);
      expect(selected.itemLabel).toBe('2:normalcdf(');
      expect(selected.targetScreen).toBe('normalcdf-wizard');
    });

    it('"3" in distr-menu selects invNorm (index 2)', function () {
      var menu = MenuNav.create('distr-menu');
      var selected = null;
      menu.onSelect(function (evt) { selected = evt; });

      menu.handleKey('3');

      expect(selected.itemIndex).toBe(2);
      expect(selected.itemLabel).toBe('3:invNorm(');
      expect(selected.targetScreen).toBe('invnorm-wizard');
    });

    it('"A" in distr-menu selects binompdf (index 10)', function () {
      var menu = MenuNav.create('distr-menu');
      var selected = null;
      menu.onSelect(function (evt) { selected = evt; });

      menu.handleKey('A');

      expect(selected.itemIndex).toBe(10);
      expect(selected.itemLabel).toBe('A:binompdf(');
      expect(selected.targetScreen).toBe('binompdf-wizard');
    });

    it('"B" in distr-menu selects binomcdf (index 11)', function () {
      var menu = MenuNav.create('distr-menu');
      var selected = null;
      menu.onSelect(function (evt) { selected = evt; });

      menu.handleKey('B');

      expect(selected.itemIndex).toBe(11);
      expect(selected.itemLabel).toBe('B:binomcdf(');
      expect(selected.targetScreen).toBe('binomcdf-wizard');
    });

    it('"E" in distr-menu selects geometpdf (index 14)', function () {
      var menu = MenuNav.create('distr-menu');
      var selected = null;
      menu.onSelect(function (evt) { selected = evt; });

      menu.handleKey('E');

      expect(selected.itemIndex).toBe(14);
      expect(selected.itemLabel).toBe('E:geometpdf(');
      expect(selected.targetScreen).toBe('geometpdf-wizard');
    });

    it('"F" in distr-menu selects geometcdf (index 15)', function () {
      var menu = MenuNav.create('distr-menu');
      var selected = null;
      menu.onSelect(function (evt) { selected = evt; });

      menu.handleKey('F');

      expect(selected.itemIndex).toBe(15);
      expect(selected.itemLabel).toBe('F:geometcdf(');
      expect(selected.targetScreen).toBe('geometcdf-wizard');
    });

    it('has no tabs (RIGHT does not switch tab)', function () {
      var menu = MenuNav.create('distr-menu');
      var before = menu.getState();

      menu.handleKey('RIGHT');
      var after = menu.getState();

      expect(after.menuId).toBe(before.menuId);
      expect(after.tabs).toBeNull();
    });

    it('has 16 items', function () {
      var menu = MenuNav.create('distr-menu');
      expect(menu.getState().items.length).toBe(16);
    });
  });

  // ── Menu tables integrity ──────────────────────────────────────────

  describe('Menu tables integrity', function () {
    it('stat-tests-menu has exactly 18 items', function () {
      expect(MenuTables.MENUS['stat-tests-menu'].items.length).toBe(18);
    });

    it('stat-calc-menu items start with 1:1-Var Stats', function () {
      expect(MenuTables.MENUS['stat-calc-menu'].items[0]).toBe('1:1-Var Stats');
    });

    it('PREFIX_ORDER has 18 entries (1-9, 0, A-H)', function () {
      expect(MenuTables.PREFIX_ORDER.length).toBe(18);
      expect(MenuTables.PREFIX_ORDER[0]).toBe('1');
      expect(MenuTables.PREFIX_ORDER[9]).toBe('0');
      expect(MenuTables.PREFIX_ORDER[10]).toBe('A');
      expect(MenuTables.PREFIX_ORDER[17]).toBe('H');
    });

    it('TAB_FAMILIES stat has 3 tabs mapping to 3 menu IDs', function () {
      var fam = MenuTables.TAB_FAMILIES.stat;
      expect(fam.tabs).toEqual(['EDIT', 'CALC', 'TESTS']);
      expect(fam.menuIds).toEqual(['stat-menu', 'stat-calc-menu', 'stat-tests-menu']);
    });
  });

  // ── MATRIX tabbed menu ─────────────────────────────────────────────

  describe('MATRIX tabbed menu', function () {
    it('RIGHT cycles NAMES -> MATH -> EDIT -> NAMES', function () {
      var menu = MenuNav.create('matrix-menu-names');
      expect(menu.getState().activeTab).toBe('NAMES');

      menu.handleKey('RIGHT');
      expect(menu.getState().activeTab).toBe('MATH');
      expect(menu.getState().menuId).toBe('matrix-menu-math');

      menu.handleKey('RIGHT');
      expect(menu.getState().activeTab).toBe('EDIT');
      expect(menu.getState().menuId).toBe('matrix-menu-edit');

      menu.handleKey('RIGHT');
      expect(menu.getState().activeTab).toBe('NAMES');
      expect(menu.getState().menuId).toBe('matrix-menu-names');
    });
  });
});
