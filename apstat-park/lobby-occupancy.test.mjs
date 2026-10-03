// Park door on the calendar board: one door opening level 6 (PICO PARK 1-1), with
// the relay's park_lobby occupancy drawn on them so friends can meet without
// planning. Pure helpers plus static pins on the board and panel source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEVEL_TITLES, occupantLabel, occupantsOf } from './board-scene.mjs';

const levels = [
  { levelIndex: 0, online: ['carol'] },
  { levelIndex: 3, online: ['alice', 'bob', 'dave', 'erin'] },
  { levelIndex: 5, online: ['me'] },
];

test('occupantLabel shows at most two names then a +N overflow', () => {
  assert.equal(occupantLabel([]), '');
  assert.equal(occupantLabel(null), '');
  assert.equal(occupantLabel(['alice']), 'alice');
  assert.equal(occupantLabel(['alice', 'bob']), 'alice, bob');
  assert.equal(occupantLabel(['alice', 'bob', 'dave', 'erin']), 'alice, bob +2');
  assert.equal(occupantLabel(['alice', 'bob', 'dave'], 3), 'alice, bob, dave');
  assert.equal(occupantLabel(['alice', '', null, 7]), 'alice');
});

test('occupantsOf reads one level and excludes the viewer', () => {
  assert.deepEqual(occupantsOf(levels, 3, 'me'), ['alice', 'bob', 'dave', 'erin']);
  assert.deepEqual(occupantsOf(levels, 3, 'bob'), ['alice', 'dave', 'erin']);
  assert.deepEqual(occupantsOf(levels, 5, 'me'), []);
  assert.deepEqual(occupantsOf(levels, 1, 'me'), []);
  assert.deepEqual(occupantsOf(undefined, 0, 'me'), []);
  assert.deepEqual(occupantsOf([{ levelIndex: 0 }], 0, 'me'), []);
});

test('the scene is always one level: no lobby, every exit returns to the calendar', () => {
  const scene = readFileSync(new URL('./board-scene.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(scene, /lobby\s*[=:?]/);
  assert.doesNotMatch(scene, /onLobby|onSelect|lobbyDoor/);
  assert.match(scene, /Up returns to the calendar/);
  const panel = readFileSync(new URL('./panel.mjs', import.meta.url), 'utf8');
  assert.match(panel, /levelIndex = 0/);
  assert.doesNotMatch(panel, /park_lobby|lobbySummary/);
  assert.match(panel, /showScene\(PARK_LEVELS\.includes\(levelIndex\) \? levelIndex : 0\)/);
  assert.match(panel, /const PARK_LEVELS = \[\.\.\.PARK_LEGACY_LEVELS, 6\]/);
});

test('the calendar board owns one door (Jump together, level 6) and the occupancy poll', () => {
  const board = readFileSync(new URL('../classroom-board.js', import.meta.url), 'utf8');
  assert.match(board, /var PARK_DOORS = \[\s*\{ level: 6, title: 'Jump together' \}\s*\];/);
  // The three retired doors stay on record, commented out; levels 0-5 open only through openParkLevel.
  assert.match(board, /\/\/ var PARK_DOORS_V4 = \[\{ level: 0, title: 'Hello together' \}, \{ level: 3, title: 'Moving walls' \}, \{ level: 4, title: 'Upstairs \/ downstairs' \}\];/);
  assert.match(board, /openParkLevel: function \(levelIndex\) \{ enterPark\(levelIndex \| 0\); \}/);
  assert.match(board, /type: 'park_lobby', requestId: 'board_lobby_'/);
  assert.match(board, /msg\.requestId\.indexOf\('board_lobby_'\) === 0/);
  assert.match(board, /levelIndex: levelIndex,/);                 // the panel opens straight into the chosen level
  assert.match(board, /enterPark\(PARK_DOORS\[di\]\.level\)/);     // Up on the door
  assert.match(board, /enterPark\(PARK_DOORS\[0\]\.level\)/);      // walk-in on the door
  assert.match(board, /'Enter APStat Park: ' \+ door\.title/);
  assert.doesNotMatch(board, /'Enter APStat Park door ' \+/);     // no door number
  assert.doesNotMatch(board, /ctx\.fillText\(String\(i \+ 1\), cx, y \+ 15\)/);   // no number inside the arch
  assert.doesNotMatch(board, /summary\.push\(\(i \+ 1\) \+ ': '/);                // no "1:" prefix on the names line
  assert.match(board, /name !== username/);                        // the viewer is never listed on a door
});

test('level titles cover all seven relay levels; the door level is Jump together', () => {
  assert.equal(LEVEL_TITLES.length, 7);
  assert.equal(LEVEL_TITLES[6], 'Jump together');
});
