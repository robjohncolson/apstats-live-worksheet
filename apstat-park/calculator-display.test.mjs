import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createWorldDisplay } from './calculator-display.mjs';
import { pixelText } from './pixel-text.mjs';
import { nativeScriptFilenames } from '../ti84-trainer-v2/native/manifest.mjs';
import { DATA, ROUTE } from './calculator-mission.mjs';

test('live trainer menu, wizard cursor and computed results feed scenery without an LCD', () => {
  const sandbox = { window: {}, console }; vm.createContext(sandbox);
  for (const file of nativeScriptFilenames) vm.runInContext(fs.readFileSync(new URL('../ti84-trainer-v2/native/' + file, import.meta.url), 'utf8'), sandbox);
  const display = createWorldDisplay();
  const calculator = sandbox.window.TI84Native.create(null, { renderer: display });
  calculator.setList('L1', DATA);
  calculator.pressKey(ROUTE[0]);
  assert.match(display.getLines()[0].text, /\[EDIT\]/);
  calculator.pressKey(ROUTE[1]);
  assert.match(display.getLines()[0].text, /\[CALC\]/);
  calculator.pressKey(ROUTE[2]);
  assert.match(display.getLines().find(line => line.selected).text, /List.*L1/);
  calculator.pressKey(ROUTE[3]);
  assert.match(display.getLines().find(line => line.selected).text, /FreqList/);
  for (const key of ROUTE.slice(4)) calculator.pressKey(key);
  const lines = display.getLines().map(line => line.text).join('\n');
  for (const pattern of [/minX.*4/i, /Q1.*7/i, /Med.*11/i, /Q3.*14/i, /maxX.*20/i]) assert.match(lines, pattern);
});
test('pixel lettering draws glyphs only, with no filled LCD panel or browser font', () => {
  const rectangles = [], ctx = { fillRect: (...rect) => rectangles.push(rect) };
  pixelText(ctx, 'STAT >', 20, 40, 14, '#3a3045');
  assert.ok(rectangles.length > 30);
  assert.ok(rectangles.every(([, , w, h]) => w === 2 && h === 2));
  assert.equal(ctx.fillStyle, '#3a3045');
});
