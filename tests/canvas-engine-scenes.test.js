import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

function engineFixture() {
  const canvas = { style: {}, getContext: () => new Proxy({}, { get: () => () => {} }) };
  const sandbox = {
    document: { getElementById: () => canvas },
    window: { devicePixelRatio: 1, innerWidth: 640, innerHeight: 220, addEventListener() {} }
  };
  vm.runInNewContext(readFileSync(resolve(__dirname, '../canvas_engine.js'), 'utf8')
    + '\nglobalThis.Engine = CanvasEngine;', sandbox);
  return new sandbox.Engine('board');
}

describe('one board canvas with local scenes', () => {
  it('shows the selected scene and restores the latest classroom entities', () => {
    const engine = engineFixture(), seen = [];
    const canvas = engine.canvas;
    engine.addEntity('calendar', { update: () => seen.push('calendar step'), render: () => seen.push('calendar paint') });
    engine.sceneEntities = new Map([['park', {
      update: () => seen.push('park step'), render: () => seen.push('park paint')
    }]]);
    engine.update(0.016); engine.render();
    expect(seen).toEqual(['park step', 'park paint']);
    // Classroom messages can continue changing its entities while away.
    engine.addEntity('poll', { render: () => seen.push('poll paint') });
    seen.length = 0;
    engine.sceneEntities = null;
    engine.update(0.016); engine.render();
    expect(seen).toEqual(['calendar step', 'calendar paint', 'poll paint']);
    expect(engine.canvas).toBe(canvas);
  });

  it('does not update the remaining old actors after a doorway changes scene', () => {
    const engine = engineFixture(), seen = [];
    engine.addEntity('door', { update: () => { engine.sceneEntities = new Map(); } });
    engine.addEntity('player', { update: () => seen.push('old player step') });
    engine.update(0.016);
    expect(seen).toEqual([]);
  });
});
