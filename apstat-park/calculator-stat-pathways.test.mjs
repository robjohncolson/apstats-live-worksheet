import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { nativeScriptFilenames } from '../ti84-trainer-v2/native/manifest.mjs';
import { createWorldDisplay } from './calculator-display.mjs';
import { createMissionEngine } from './calculator-engine.mjs';
import { DATA, ROUTE, KEYS } from './calculator-mission.mjs';

const sandbox = { window: {}, console };
vm.createContext(sandbox);
for (const file of nativeScriptFilenames) {
  vm.runInContext(fs.readFileSync(new URL('../ti84-trainer-v2/native/' + file, import.meta.url), 'utf8'), sandbox);
}
const { TI84Native, TI84MenuNav, TI84MenuTables } = sandbox.window;
const contract = JSON.parse(fs.readFileSync(new URL('../ti84-trainer-v2/native/stat-rom-contract.json', import.meta.url)));
const menuIds = ['stat-menu', 'stat-calc-menu', 'stat-tests-menu'];
const prefixes = '1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function atPosition(tab, cursor) {
  const menu = TI84MenuNav.create(menuIds[tab]);
  for (let i = 0; i < cursor; i++) menu.handleKey('DOWN');
  return menu;
}

test('normal STAT menu sizes match the ROM descriptor, not the program-editor variant', () => {
  assert.deepEqual(menuIds.map(id => TI84MenuTables.MENUS[id].items.length),
    contract.descriptors.normal.tabs.map(tab => tab.count));
  assert.equal(contract.descriptors.program.tabs[1].count, 14);
  assert.equal(TI84MenuTables.MENUS['stat-calc-menu'].items.at(-1), 'E:QuickPlot&Fit-EQ');
});

test('every STAT cursor position follows the decoded arrow, ENTER and prefix branches', () => {
  // All 38 cursor states x 41 keys = 1,558 dispatch checks. These check the
  // menu navigation boundary; they do not certify the selected command handler.
  let checks = 0;
  for (let tab = 0; tab < 3; tab++) {
    const count = contract.descriptors.normal.tabs[tab].count;
    for (let cursor = 0; cursor < count; cursor++) {
      for (const key of ['LEFT', 'RIGHT', 'UP', 'DOWN', 'ENTER', ...prefixes]) {
        const menu = atPosition(tab, cursor);
        const events = [];
        menu.onSelect(event => events.push(event));
        const next = menu.handleKey(key);
        const label = `${menuIds[tab]} row ${cursor}, ${key}`;
        if (key === 'LEFT' || key === 'RIGHT') {
          assert.equal(next.menuId, menuIds[(tab + (key === 'RIGHT' ? 1 : 2)) % 3], label);
          assert.equal(next.cursorIndex, 0, label);
          assert.equal(events.length, 0, label);
        } else if (key === 'UP' || key === 'DOWN') {
          assert.equal(next.cursorIndex, (cursor + (key === 'DOWN' ? 1 : count - 1)) % count, label);
          assert.equal(events.length, 0, label);
        } else {
          const selected = key === 'ENTER' ? cursor : prefixes.indexOf(key);
          if (selected < count) {
            assert.equal(events.length, 1, label);
            assert.equal(events[0].itemIndex, selected, label);
            assert.equal(events[0].menuId, menuIds[tab], label);
          } else {
            assert.equal(events.length, 0, label);
            assert.equal(next.cursorIndex, cursor, label);
          }
        }
        checks++;
      }
    }
  }
  assert.equal(checks, 1558);
});

test('every reachable STAT row stays visible in the game, including wrapped rows', () => {
  const display = createWorldDisplay();
  for (let tab = 0; tab < 3; tab++) {
    const count = contract.descriptors.normal.tabs[tab].count;
    const menu = TI84MenuNav.create(menuIds[tab]);
    for (let i = 0; i < count * 2; i++) {
      const state = menu.handleKey(i < count ? 'DOWN' : 'UP');
      display.renderMenu(state);
      const selected = display.getLines().filter(line => line.selected);
      assert.equal(selected.length, 1);
      assert.equal(selected[0].text, state.items[state.cursorIndex]);
      assert.ok(display.getLines().length <= 8);
    }
  }
});

function missionEngine() {
  return createMissionEngine(TI84Native.create, DATA, ROUTE, KEYS.map(tile => tile.key));
}

test('editing an unrelated list does not invalidate a correct statistics route', () => {
  const detour = ['STAT', 'ENTER', 'RIGHT', '9', 'ENTER', 'STAT', 'RIGHT'];
  const engine = missionEngine();
  assert.equal(engine.transitions({ step: 2, keys: detour }).ENTER, 3);
  const calculated = [...detour, 'ENTER', 'DOWN', 'DOWN', 'ENTER'];
  assert.equal(engine.transitions({ step: 6, keys: calculated }).DOWN, 7);
});

test('changing the actual dataset cannot earn credit for the expected result', () => {
  const wrong = ['STAT', 'ENTER', '9', 'ENTER', 'STAT', 'RIGHT', 'ENTER', 'DOWN', 'DOWN'];
  assert.equal(missionEngine().transitions({ step: 5, keys: wrong }).ENTER, undefined);
});

test('the same data entered into L2 can finish through a different wizard path', () => {
  const alternate = ['STAT', 'ENTER', 'RIGHT'];
  for (const value of DATA) alternate.push(...String(value), 'ENTER');
  alternate.push('STAT', 'RIGHT', 'ENTER', 'RIGHT', 'UP');
  const engine = missionEngine();
  // Intermediate hints use L1, but actual correct computed results can skip
  // those checkpoints. We must not enforce the demonstration's key sequence.
  assert.equal(engine.transitions({ step: 3, keys: alternate }).ENTER, 6);
  alternate.push('ENTER');
  assert.equal(engine.transitions({ step: 6, keys: alternate }).DOWN, 7);
});

test('a previous calculation does not poison later menu and wizard milestones', () => {
  const detour = [...ROUTE, 'CLEAR', 'STAT', 'RIGHT'];
  assert.equal(missionEngine().transitions({ step: 2, keys: detour }).ENTER, 3);
});

test('pending ALPHA and 2ND are not equivalent to an unmodified menu state', () => {
  const transitions = missionEngine().transitions({ step: 0, keys: ['STAT'] });
  assert.equal(transitions.ALPHA, undefined);
  assert.equal(transitions['2ND'], undefined);
});

test('printed game legends and trainer button IDs take the same input paths', () => {
  function run(keys) {
    let rendered;
    const renderer = Object.fromEntries(['Home', 'Menu', 'Editor', 'Wizard', 'Result', 'Graph']
      .map(name => ['render' + name, state => { rendered = state; }]));
    renderer.clear = () => {};
    const calc = TI84Native.create(null, { renderer });
    for (const key of keys) calc.pressKey(key);
    return JSON.stringify({ saved: calc.save(), rendered });
  }
  assert.equal(run(['2ND', 'Y=']), run(['2ND', 'Y_EQUALS']));
  assert.equal(run(['STAT', 'RIGHT', 'ALPHA', 'x⁻¹']), run(['STAT', 'RIGHT', 'ALPHA', 'X_INVERSE']));
  assert.equal(run(['1', '.', '5']), run(['ONE', 'DECIMAL', 'FIVE']));
  assert.equal(run(['STAT', 'ENTER', '(−)', '4', '.', '5', 'ENTER']),
    run(['STAT', 'ENTER', 'NEGATIVE', 'FOUR', 'DECIMAL', 'FIVE', 'ENTER']));
});
