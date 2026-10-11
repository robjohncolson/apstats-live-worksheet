import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { nativeScriptFilenames } from '../ti84-trainer-v2/native/manifest.mjs';
import { keyboardLayer, keyLabel, keySublabels, keyInstruction } from './calculator-key-labels.mjs';

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

test('keycap legends: every physical key reports the 2nd function and alpha letter the CE prints above it', () => {
  assert.deepEqual(keySublabels('STAT'), { second: 'LIST', alpha: '' });
  assert.deepEqual(keySublabels('MATH'), { second: 'TEST', alpha: 'A' });
  assert.deepEqual(keySublabels('1'), { second: 'L1', alpha: 'Y' });
  assert.deepEqual(keySublabels('ENTER'), { second: 'ENTRY', alpha: 'SOLVE' });
  assert.deepEqual(keySublabels('2ND'), { second: '', alpha: '' });
  // The legend is what the key becomes under that layer (same source as the main label).
  for (const key of ['STAT', 'MATH', '1', 'ENTER', 'TRACE', '0']) {
    const { second, alpha } = keySublabels(key);
    if (second) assert.equal(keyLabel(key, 'second'), second);
    if (alpha) assert.equal(keyLabel(key, 'alpha'), alpha);
  }
});
