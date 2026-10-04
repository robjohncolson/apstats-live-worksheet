import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { nativeScriptFilenames } from '../ti84-trainer-v2/native/manifest.mjs';
import { createWorldDisplay } from './calculator-display.mjs';

function setup() {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  for (const file of nativeScriptFilenames) {
    vm.runInContext(fs.readFileSync(new URL('../ti84-trainer-v2/native/' + file, import.meta.url), 'utf8'), sandbox);
  }
  const display = createWorldDisplay();
  return { calculator: sandbox.window.TI84Native.create(null, { renderer: display }), display };
}

test('ROM-observed STAT ENTER opens the list editor and repaints the scene', () => {
  const { calculator, display } = setup();
  calculator.setList('L1', [4, 6, 7]);
  calculator.pressKey('STAT'); calculator.pressKey('ENTER');
  assert.equal(calculator.getScreen().id, 'stat-edit-lists');
  assert.match(display.getLines()[0].text, /\[L1\].*L2.*L3/);
  assert.match(display.getLines().at(-1).text, /L1\(1\)=4/);
  assert.ok(!display.getLines().some(line => line.text.includes('Edit...')));
});

test('STAT RIGHT opens CALC, whereas RIGHT inside the editor moves to L2', () => {
  const { calculator, display } = setup();
  calculator.pressKey('STAT'); calculator.pressKey('RIGHT');
  assert.equal(calculator.getScreen().id, 'stat-calc-menu');
  calculator.pressKey('LEFT'); calculator.pressKey('ENTER');
  calculator.pressKey('RIGHT');
  assert.equal(calculator.getScreen().id, 'stat-edit-lists');
  assert.equal(calculator.getScreen().state.cursorCol, 1);
  assert.match(display.getLines().at(-1).text, /L2\(1\)=/);
  calculator.pressKey('STAT'); calculator.pressKey('RIGHT');
  assert.equal(calculator.getScreen().id, 'stat-calc-menu');
});

test('list editor stores numeric entries and renders the selected row', () => {
  const { calculator, display } = setup();
  for (const key of ['STAT', 'ENTER', '4', 'ENTER', '6', 'ENTER', 'UP']) calculator.pressKey(key);
  assert.deepEqual(Array.from(calculator.getList('L1')), [4, 6]);
  assert.match(display.getLines().at(-1).text, /L1\(2\)=6/);
  calculator.pressKey('STAT'); calculator.pressKey('RIGHT'); calculator.pressKey('ENTER');
  assert.equal(calculator.getScreen().id, 'one-var-stats-wizard');
});
