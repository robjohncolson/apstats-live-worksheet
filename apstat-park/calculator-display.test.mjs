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

test('the real CE screen: the display forwards every payload but graphs to a TI84ScreenRenderer, in Pico colours', () => {
  const sandbox = { window: {}, console }; vm.createContext(sandbox);
  for (const file of nativeScriptFilenames) vm.runInContext(fs.readFileSync(new URL('../ti84-trainer-v2/native/' + file, import.meta.url), 'utf8'), sandbox);
  // A canvas stub that records what the renderer paints.
  const ops = [];
  const ctx = new Proxy({ fillStyle: '', strokeStyle: '', font: '', textBaseline: '', lineWidth: 1, measureText: t => ({ width: 12 * t.length }) },
    { get: (t, k) => k in t ? t[k] : (...args) => { ops.push([k, ...args]); }, set: (t, k, v) => { t[k] = v; ops.push(['set', k, v]); return true; } });
  const canvas = { getContext: () => ctx };
  const screen = sandbox.window.TI84ScreenRenderer.create(canvas, { scale: 2, bg: '#d5c5ae', fg: '#30263b', invertBg: '#30263b', invertFg: '#d5c5ae' });
  assert.equal(canvas.width, 640); assert.equal(canvas.height, 480);
  assert.deepEqual(ops.filter(op => op[0] === 'scale'), [['scale', 2, 2]]);
  const display = createWorldDisplay({ screen });
  const calculator = sandbox.window.TI84Native.create(null, { renderer: display });
  calculator.setList('L1', DATA);
  ops.length = 0;
  calculator.pressKey(ROUTE[0]);                      // STAT menu
  assert.equal(display.kind(), 'menu');
  assert.ok(ops.some(op => op[0] === 'set' && op[1] === 'fillStyle' && op[2] === '#d5c5ae'), 'paper background');
  assert.ok(ops.some(op => op[0] === 'set' && op[1] === 'fillStyle' && op[2] === '#30263b'), 'ink text');
  assert.ok(!ops.some(op => op[0] === 'set' && op[1] === 'fillStyle' && op[2] === '#C6D8A0'), 'never the LCD green');
  assert.ok(ops.some(op => op[0] === 'fillText' && /\[EDIT\]/.test(op[1])), 'the same tab strip as the CE');
  assert.ok(ops.some(op => op[0] === 'fillText' && /►/.test(op[1])), 'the CE menu cursor');
  for (const key of ROUTE.slice(1)) calculator.pressKey(key);
  assert.equal(display.kind(), 'result');
  assert.ok(ops.some(op => op[0] === 'fillText' && /minX/.test(op[1])));
  // The text lines are still produced alongside (screen reader, relay).
  assert.match(display.getLines().map(line => line.text).join('\n'), /Q1.*7/i);
  // Graphs are not forwarded: the trainer's graph is an illustration, not the data.
  ops.length = 0;
  display.renderGraph({ title: 'PLOT', type: 'ModBoxplot', stats: { minX: 1, Q1: 2, Med: 3, Q3: 4, maxX: 5 } });
  assert.equal(display.kind(), 'graph'); assert.equal(ops.length, 0);
  assert.equal(display.getLines()[1].text, 'minX=1');
  // The trainer's own renderer is untouched: default options keep the LCD look.
  ops.length = 0;
  sandbox.window.TI84ScreenRenderer.create({ getContext: () => ctx }).clear();
  assert.deepEqual(ops.filter(op => op[0] === 'set' && op[1] === 'fillStyle').map(op => op[2]), ['#C6D8A0']);
});
