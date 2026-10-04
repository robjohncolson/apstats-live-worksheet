import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { nativeScriptFilenames } from '../ti84-trainer-v2/native/manifest.mjs';
import { keyboardLayer, keyLabel, keyInstruction } from './calculator-key-labels.mjs';

test('key names follow engine modifiers and return after the physical key is pressed', () => {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  for (const file of nativeScriptFilenames) vm.runInContext(readFileSync(new URL('../ti84-trainer-v2/native/' + file, import.meta.url), 'utf8'), sandbox);
  const renderer = Object.fromEntries(['Home', 'Menu', 'Wizard', 'Result', 'Editor', 'Graph']
    .map(name => ['render' + name, () => {}]));
  const calculator = sandbox.window.TI84Native.create(null, { renderer });
  const label = key => keyLabel(key, keyboardLayer(calculator.save()));
  assert.equal(label('Y='), 'Y=');
  calculator.pressKey('2ND');
  assert.equal(label('Y='), 'STAT PLOT');
  assert.equal(keyInstruction('Y=', 'Choose Y=.', keyboardLayer(calculator.save())), 'Press STAT PLOT (Y=).');
  assert.equal(keyInstruction('2ND', 'Choose 2ND.', keyboardLayer(calculator.save()), 'Y='), 'Press STAT PLOT (Y=).');
  assert.equal(label('VARS'), 'DISTR');
  assert.equal(label('x⁻¹'), 'MATRIX');
  assert.equal(label('2ND'), '2ND');
  assert.equal(label('ALPHA'), 'ALPHA');
  calculator.pressKey('Y=');
  assert.equal(calculator.getScreen().type, 'menu');
  assert.equal(label('Y='), 'Y=');
  calculator.pressKey('ALPHA');
  assert.equal(label('MATH'), 'A');
  assert.equal(keyInstruction('MATH', 'Choose MATH.', keyboardLayer(calculator.save())), 'Press A (MATH).');
  assert.equal(label('1'), 'Y');
  calculator.pressKey('MATH');
  assert.equal(label('MATH'), 'MATH');
  calculator.pressKey('2ND'); calculator.pressKey('2ND');
  assert.equal(keyboardLayer(calculator.save()), 'normal');
});
