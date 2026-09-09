import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

function setup() {
  let time = 90000, next = 0;
  const frames = new Map(), steps = [];
  const ctx = new Proxy({}, { get: () => () => {} });
  const canvas = { style: {}, getContext: () => ctx };
  const sandbox = { document: { getElementById: () => canvas },
    window: { devicePixelRatio: 1, innerWidth: 640, innerHeight: 220, addEventListener() {} },
    performance: { now: () => time },
    requestAnimationFrame: fn => { frames.set(++next, fn); return next; },
    cancelAnimationFrame: id => frames.delete(id) };
  vm.runInNewContext(readFileSync(resolve(__dirname, '../canvas_engine.js'), 'utf8')
    + '\nglobalThis.Engine = CanvasEngine;', sandbox);
  const engine = new sandbox.Engine('canvas');
  engine.addEntity('player', { update: dt => steps.push(dt) });
  return { engine, frames, steps, advance(ms) {
    time += ms;
    const queued = [...frames.values()]; frames.clear(); queued.forEach(fn => fn(time));
  } };
}

describe('calendar animation returning from the park', () => {
  it('restarts with zero elapsed time and one animation loop', () => {
    const f = setup(); f.engine.start();
    expect(f.steps).toEqual([0]);
    f.advance(16); expect(f.steps.at(-1)).toBeCloseTo(0.016);
    for (let i = 0; i < 10; i++) {
      f.engine.stop(); expect(f.frames.size).toBe(0);
      f.advance(60000); f.engine.start();
      expect(f.steps.at(-1)).toBe(0);
      expect(f.frames.size).toBe(1);
    }
    f.advance(16); expect(f.steps.at(-1)).toBeCloseTo(0.016);
  });

  it('does not simulate a hidden-tab pause as one giant movement step', () => {
    const f = setup(); f.engine.start(); f.advance(120000);
    expect(f.steps.at(-1)).toBe(0.1);
    expect(f.frames.size).toBe(1);
  });
});
