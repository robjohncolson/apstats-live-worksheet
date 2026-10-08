// Teacher 2026-10-07 (PICO_DESK_SPEC.md "Campaign keys as a spendable count"): the PICO PARK door
// opens on a STAGE SELECT (n/48). The relay is the authority; the select only draws its
// campaign_progress and sends campaign_join {stage} / campaign_open_stage {stage}.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="c"></div>', { url: 'https://desk.test/', pretendToBeVisual: true });
const win = dom.window;
globalThis.window = win;
const noop = () => {};
const fakeContext = (canvas) => new Proxy({ canvas }, {
  get: (target, key) => (key in target ? target[key] : (key === 'measureText' ? () => ({ width: 6 }) : noop)),
  set: (target, key, value) => { target[key] = value; return true; },
});
win.HTMLCanvasElement.prototype.getContext = function () { return fakeContext(this); };
const { stageStates, choiceFor, moveCursor, stageAt, tileRect, startCursor, describe, stageLabel } = await import('./campaign-select.mjs');
const { mountCampaign } = await import('./campaign-panel.mjs');

// Party me + bo. Open 1-1..1-3. I cleared 1-1 and 1-2; bo cleared 1-1 only.
const PROGRESS = { type: 'campaign_progress', keys: { me: 2 }, cleared: { me: [0, 1], bo: [0] }, open: [0, 1, 2],
  party: ['me', 'bo'], startable: [0, 1], team: null };

test('every stage gets one of the four states', () => {
  const states = stageStates(PROGRESS, 'me');
  assert.equal(states.length, 48);
  assert.deepEqual(states.slice(0, 5).map(entry => entry.state), ['cleared', 'cleared', 'waiting', 'locked', 'locked']);
  assert.deepEqual(states[2].needs, [{ name: 'bo', stage: 1 }], 'open 1-3 shows who still needs an earlier stage');
  assert.equal(states[3].openable, true, 'the next locked stage opens with a key');
  assert.equal(states[4].openable, false, 'never further ahead');
  const theirs = stageStates(PROGRESS, 'bo');
  assert.equal(theirs[1].state, 'startable', 'startable but not cleared by bo: no tick');
  assert.equal(theirs[3].openable, false, 'bo holds no key');
  assert.equal(stageLabel(47), '12-4');
});

test('choices map to relay messages; waiting and far-locked tiles do nothing', () => {
  const states = stageStates(PROGRESS, 'me');
  assert.deepEqual(choiceFor(states[1]), { type: 'campaign_join', stage: 1 });
  assert.equal(choiceFor(states[2]), null);
  assert.deepEqual(choiceFor(states[3]), { type: 'campaign_open_stage', stage: 3 });
  assert.equal(choiceFor(states[9]), null);
  assert.match(describe(states[2], states), /STILL NEEDED: bo 1-2/);
  assert.match(describe(states[3], states), /SPEND 1 KEY TO OPEN 1-4/);
  assert.match(describe(states[9], states), /OPEN 1-4 FIRST/);
  assert.equal(startCursor(states), 1, 'the furthest startable stage');
  assert.equal(startCursor(stageStates({ ...PROGRESS, team: { stageIndex: 0 } }, 'me')), 0, 'your team first');
});

test('the grid is 8 x 6; arrows and the mouse find tiles', () => {
  assert.equal(moveCursor(0, 'ArrowLeft'), 0);
  assert.equal(moveCursor(0, 'ArrowRight'), 1);
  assert.equal(moveCursor(1, 'ArrowDown'), 9);
  assert.equal(moveCursor(44, 'ArrowDown'), 47);
  const tile = tileRect(10, 100);
  assert.equal(stageAt(tile.x + 5, tile.y + 5, 100), 10);
  assert.equal(stageAt(5, 5, 100), -1);
  assert.ok(tileRect(47).y + tileRect(47).h < 620, 'the grid clears the info lines and the floor');
});

function mount() {
  const container = win.document.createElement('div');
  win.document.body.appendChild(container);
  const canvas = win.document.createElement('canvas');
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 720, height: 750 });
  const listeners = [];
  const socket = { readyState: 1, bufferedAmount: 0, sent: [], send(data) { this.sent.push(JSON.parse(data)); },
    addEventListener(type, fn) { if (type === 'message') listeners.push(fn); }, removeEventListener() {} };
  const engine = { canvas, sceneEntities: null };
  let closed = 0;
  const board = { engine, input: {}, username: 'me', viewportW: () => 720, setBoardHeight: noop, atlas: () => null,
    transitionFrame: null, createPeer: () => ({ hue: 0 }) };
  const panel = mountCampaign({ container, getSocket: () => socket, board, onClose() { closed++; } });
  const deliver = packet => listeners.forEach(fn => fn({ data: JSON.stringify(packet) }));
  const key = (k, type = 'keydown') => win.document.dispatchEvent(new win.KeyboardEvent(type, { key: k, bubbles: true }));
  const render = () => engine.sceneEntities?.get('campaign').render(fakeContext(canvas));
  return { panel, socket, deliver, key, render, canvas, closed: () => closed, container };
}

test('the door opens on the stage select: it asks for progress and joins nothing', (t) => {
  const m = mount();
  t.after(() => m.panel.dispose());
  assert.deepEqual(m.socket.sent.map(packet => packet.type), ['campaign_select']);
  m.deliver(PROGRESS);
  m.render();
  const view = m.panel.getSelect();
  assert.equal(view.selecting, true);
  assert.equal(view.cursor, 1);
  assert.match(m.container.querySelector('[data-campaign-status]').textContent, /Stage select\. ENTER: START 1-2/);
});

test('Enter on a startable stage joins with that stage; a relay refusal greys it out and stays on the select', (t) => {
  const m = mount();
  t.after(() => m.panel.dispose());
  m.deliver(PROGRESS);
  m.key('Enter');
  const join = m.socket.sent.at(-1);
  assert.equal(join.type, 'campaign_join');
  assert.equal(join.stage, 1);
  assert.equal(Number.isInteger(join.protocol), true);
  assert.equal(m.panel.getSelect().selecting, false);
  m.deliver({ type: 'campaign_error', message: 'Stage 1-2 needs everyone to finish the stages before it.' });
  const view = m.panel.getSelect();
  assert.equal(view.selecting, true);
  assert.deepEqual(view.rejected, [1]);
  assert.match(view.message, /needs everyone/);
  const sent = m.socket.sent.length;
  m.key('Enter');
  assert.equal(m.socket.sent.length, sent, 'a greyed stage is not sent again until the relay says it changed');
});

test('the next locked stage spends a key; arrows move the cursor; a state packet leaves the select', (t) => {
  const m = mount();
  t.after(() => m.panel.dispose());
  m.deliver(PROGRESS);
  m.key('ArrowRight'); m.key('ArrowRight');   // 1-2 -> 1-3 (waiting) -> 1-4 (locked, openable)
  assert.equal(m.panel.getSelect().cursor, 3);
  m.key('Enter');
  assert.deepEqual(m.socket.sent.at(-1), { type: 'campaign_open_stage', stage: 3 });
  m.deliver({ ...PROGRESS, keys: { me: 1 }, open: [0, 1, 2, 3] });
  assert.equal(m.panel.getSelect().pending, null);
  assert.equal(m.panel.getSelect().states[3].state, 'waiting', 'open now, but bo still needs 1-2 and 1-3');
  m.key('ArrowLeft'); m.key('ArrowLeft');
  m.key(' ');
  assert.deepEqual([m.socket.sent.at(-1).type, m.socket.sent.at(-1).stage], ['campaign_join', 1]);
  m.deliver({ type: 'campaign_state', protocol: 15, team: 't', epoch: 'e1', stageIndex: 1, lap: 1, seed: 1, roster: ['me'],
    helpers: [], waiting: [], phase: 'playing', reason: null, from: 0, to: 0, events: [{ frame: 0, inputs: [0, 0] }], more: false });
  assert.equal(m.panel.getSelect().selecting, false);
});

test('a click on a tile chooses it', (t) => {
  const m = mount();
  t.after(() => m.panel.dispose());
  m.deliver(PROGRESS);
  const tile = tileRect(0);
  m.canvas.dispatchEvent(new win.MouseEvent('click', { clientX: tile.x + 10, clientY: tile.y + 10, bubbles: true }));
  assert.deepEqual([m.socket.sent.at(-1).type, m.socket.sent.at(-1).stage], ['campaign_join', 0]);
});

test('a team that clears into a locked stage is shown the select again', (t) => {
  const m = mount();
  t.after(() => m.panel.dispose());
  m.deliver(PROGRESS);
  m.key('Enter');
  const base = { type: 'campaign_state', protocol: 15, team: 't', epoch: 'e1', stageIndex: 1, lap: 1, seed: 1, roster: ['me', 'bo'],
    helpers: [], waiting: [], reason: null, from: 0, to: 0, events: [{ frame: 0, inputs: [0, 0] }], more: false };
  m.deliver({ ...base, phase: 'playing' });
  assert.equal(m.panel.getSelect().selecting, false);
  m.deliver({ ...base, epoch: 'e2', phase: 'select', reason: 'Stage 1-3 is locked. Open it with a key, or choose a stage.',
    progress: { keys: { me: 2 }, cleared: { me: [0, 1], bo: [0, 1] }, open: [0, 1], party: ['me', 'bo'], startable: [0, 1] } });
  const view = m.panel.getSelect();
  assert.equal(view.selecting, true);
  assert.match(view.message, /1-3 is locked/);
  assert.equal(view.states[2].openable, true);
});

test('Esc on the select backs out to the park', () => {
  const m = mount();
  m.deliver(PROGRESS);
  m.key('Escape');
  assert.equal(m.closed(), 1);
  assert.equal(m.socket.sent.at(-1).type, 'campaign_leave');
});

test('a refusal is reconciled by later progress: cleared -> refused -> waiting -> cleared joins again', (t) => {
  const m = mount();
  t.after(() => m.panel.dispose());
  m.deliver(PROGRESS);   // cursor on 1-2 (cleared by me, startable)
  m.key('Enter');
  m.deliver({ type: 'campaign_error', message: 'refused' });
  assert.deepEqual(m.panel.getSelect().rejected, [1]);
  m.deliver(PROGRESS);   // the same state: still greyed
  assert.deepEqual(m.panel.getSelect().rejected, [1]);
  m.deliver({ ...PROGRESS, party: ['me', 'bo', 'cy'], startable: [0] });   // cy arrives: 1-2 waits for cy
  assert.equal(m.panel.getSelect().states[1].state, 'waiting');
  assert.deepEqual(m.panel.getSelect().rejected, [], 'the state moved on: the refusal is dropped');
  m.deliver(PROGRESS);   // cy leaves: cleared and startable again
  const sent = m.socket.sent.length;
  m.key('Enter');
  assert.equal(m.socket.sent.length, sent + 1);
  assert.deepEqual([m.socket.sent.at(-1).type, m.socket.sent.at(-1).stage], ['campaign_join', 1]);
});

// ── BUY KEY (teacher 2026-10-08, PICO_DESK_SPEC "Candy economy", item 10) ──────────────────────────
const { keyShopView, onBuyButton, buyButtonRect } = await import('./campaign-select.mjs');
const { createKeyShop } = await import('./key-shop.mjs');

const WALLET = { ok: true, candyBalance: 12.4, keyPrice: 8, keysBoughtToday: 1, keyPurchaseEnabled: true, keyPurchaseOffReason: null };

test('the BUY KEY button shows the live price, and why it is disabled', () => {
  assert.deepEqual(keyShopView({ wallet: WALLET }), { enabled: true, price: 8, label: 'BUY KEY · 8',
    caption: 'YOU HAVE 12 CANDY', reason: 'CLICK BUY KEY: 1 KEY FOR 8 CANDY. EACH KEY TODAY COSTS MORE.' });
  const short = keyShopView({ wallet: { ...WALLET, candyBalance: 7.9 } });
  assert.equal(short.enabled, false);
  assert.equal(short.caption, 'NEED 8, YOU HAVE 7');
  const off = keyShopView({ wallet: { ...WALLET, keyPurchaseEnabled: false, keyPurchaseOffReason: 'key buying is turned off' } });
  assert.equal(off.enabled, false);
  assert.equal(off.caption, 'KEY BUYING IS TURNED OFF');
  assert.equal(keyShopView({ wallet: WALLET, busy: true }).enabled, false, 'one purchase at a time');
  assert.equal(keyShopView({ wallet: null }).enabled, false);
  const button = buyButtonRect(100);
  assert.equal(onBuyButton(button.x + 2, button.y + 2, 100), true);
  assert.equal(onBuyButton(button.x - 2, button.y + 2, 100), false);
  assert.ok(button.y + button.h < tileRect(0).y, 'the button sits above the stage grid');
});

function fakeShop(wallet) {
  const shop = { state: { wallet, loading: false, busy: false, message: '', error: false }, buys: 0, ticks: 0,
    tick() { this.ticks++; }, refresh: async () => {},
    async buy() { this.buys++; this.state.message = 'KEY BOUGHT FOR 8 CANDY'; return true; } };
  return shop;
}

function mountWithShop(shop) {
  const container = win.document.createElement('div');
  win.document.body.appendChild(container);
  const canvas = win.document.createElement('canvas');
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 720, height: 750 });
  const listeners = [];
  const socket = { readyState: 1, bufferedAmount: 0, sent: [], send(data) { this.sent.push(JSON.parse(data)); },
    addEventListener(type, fn) { if (type === 'message') listeners.push(fn); }, removeEventListener() {} };
  const engine = { canvas, sceneEntities: null };
  const board = { engine, input: {}, username: 'me', viewportW: () => 720, setBoardHeight: noop, atlas: () => null,
    transitionFrame: null, createPeer: () => ({ hue: 0 }) };
  const panel = mountCampaign({ container, getSocket: () => socket, board, onClose: noop, keyShop: shop });
  const deliver = packet => listeners.forEach(fn => fn({ data: JSON.stringify(packet) }));
  const click = (x, y) => canvas.dispatchEvent(new win.MouseEvent('click', { clientX: x, clientY: y, bubbles: true }));
  const render = () => engine.sceneEntities?.get('campaign').render(fakeContext(canvas));
  return { panel, socket, deliver, click, render, container };
}

test('a click on BUY KEY buys one key (mouse only); the count comes from the relay', async (t) => {
  const shop = fakeShop(WALLET);
  const m = mountWithShop(shop);
  t.after(() => m.panel.dispose());
  m.deliver(PROGRESS);
  assert.ok(shop.ticks >= 1, 'the price is refreshed while the select is open');
  m.render();
  assert.match(m.container.querySelector('[data-campaign-status]').textContent, /Your keys: 2\. BUY KEY · 8 🍬\./);
  const sentBefore = m.socket.sent.length;
  const button = buyButtonRect(0);
  m.click(button.x + 5, button.y + 5);
  assert.equal(shop.buys, 1);
  assert.equal(m.socket.sent.length, sentBefore, 'the click is not a stage choice');
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setTimeout(resolve, 30));   // pump re-asks the relay for progress
  assert.equal(m.socket.sent.at(-1).type, 'campaign_select');
  m.deliver({ ...PROGRESS, keys: { me: 3 } });
  assert.equal(m.panel.getSelect().progress.keys.me, 3);
  m.render();
  assert.match(m.container.querySelector('[data-campaign-status]').textContent, /Your keys: 3/);
});

test('a disabled BUY KEY does nothing when clicked, and Enter never buys', (t) => {
  const shop = fakeShop({ ...WALLET, candyBalance: 3 });
  const m = mountWithShop(shop);
  t.after(() => m.panel.dispose());
  m.deliver(PROGRESS);
  const button = buyButtonRect(0);
  m.click(button.x + 5, button.y + 5);
  assert.equal(shop.buys, 0);
  assert.equal(m.panel.getSelect().shop.caption, 'NEED 8, YOU HAVE 3');
  win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(shop.buys, 0);
});

function fakeFetch(routes) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    const path = new URL(url).pathname;
    const [status, body] = routes[path]?.(init, calls) || [404, {}];
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { fetchImpl, calls };
}
const shopWin = { rosterClient: { token: () => 'TOK' }, ROSTER_SERVICE_URL: 'https://roster.test/' };

test('key shop: reads GET /wallet with the roster token; a 503 wallet is "not turned on"', async () => {
  const f = fakeFetch({ '/wallet': () => [200, WALLET] });
  const shop = createKeyShop({ win: shopWin, fetchImpl: f.fetchImpl });
  await shop.refresh();
  assert.equal(f.calls[0].url, 'https://roster.test/wallet');
  assert.equal(f.calls[0].init.headers.Authorization, 'Bearer TOK');
  assert.equal(shop.state.wallet.keyPrice, 8);
  const off = createKeyShop({ win: shopWin, fetchImpl: fakeFetch({ '/wallet': () => [503, {}] }).fetchImpl });
  await off.refresh();
  assert.equal(keyShopView(off.state).enabled, false);
  assert.match(keyShopView(off.state).caption, /NOT TURNED ON/);
  const signedOut = createKeyShop({ win: {}, fetchImpl: () => { throw new Error('no fetch when signed out'); } });
  await signedOut.refresh();
  assert.equal(signedOut.state.wallet, null);
});

test('key shop: a buy posts /wallet/buy-key; success takes the new price, a refund shows the reason', async () => {
  let price = 8;
  const f = fakeFetch({
    '/wallet': () => [200, { ...WALLET, keyPrice: price }],
    '/wallet/buy-key': () => { price = 13; return [200, { ok: true, price: 8, keyPrice: 13, candyBalance: 4.4, keyPurchaseEnabled: true }]; },
  });
  const shop = createKeyShop({ win: shopWin, fetchImpl: f.fetchImpl });
  await shop.refresh();
  assert.equal(await shop.buy(), true);
  assert.equal(f.calls[1].init.method, 'POST');
  assert.equal(shop.state.message, 'KEY BOUGHT FOR 8 CANDY');
  assert.equal(shop.state.wallet.keyPrice, 13);
  const refused = createKeyShop({ win: shopWin, fetchImpl: fakeFetch({
    '/wallet': () => [200, WALLET],
    '/wallet/buy-key': () => [502, { ok: false, refunded: true, error: 'the park did not take the key — your candy was given back' }],
  }).fetchImpl });
  await refused.refresh();
  assert.equal(await refused.buy(), false);
  assert.equal(refused.state.error, true);
  assert.match(refused.state.message, /candy was given back/);
});

test('key shop: a refresh that started before a buy cannot overwrite the new price (8 stays 8, not 5)', async () => {
  let releaseOld;
  let walletCalls = 0;
  const fetchImpl = async (url, init = {}) => {
    const path = new URL(url).pathname;
    if (path === '/wallet/buy-key') {
      return { ok: true, status: 200, json: async () => ({ ok: true, price: 5, keyPrice: 8, candyBalance: 7, keyPurchaseEnabled: true }) };
    }
    walletCalls++;
    if (walletCalls === 1) {   // the slow, stale read: started before the buy, answers after it
      await new Promise(resolve => { releaseOld = resolve; });
      return { ok: true, status: 200, json: async () => ({ ...WALLET, keyPrice: 5, candyBalance: 12 }) };
    }
    return { ok: true, status: 200, json: async () => ({ ...WALLET, keyPrice: 8, candyBalance: 7 }) };
  };
  const shop = createKeyShop({ win: shopWin, fetchImpl });
  shop.state.wallet = { ...WALLET, keyPrice: 5, candyBalance: 12 };
  const stale = shop.refresh();
  assert.equal(keyShopView(shop.state).enabled, false, 'disabled while a price check is in flight');
  assert.equal(await shop.buy(), true);
  await new Promise(resolve => setImmediate(resolve));
  releaseOld();
  await stale;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(shop.state.wallet.keyPrice, 8);
  assert.equal(shop.state.wallet.candyBalance, 7);
  assert.equal(shop.state.loading, false);
  assert.equal(keyShopView(shop.state).enabled, false, '7 candy is short of the 8 for the next key');
});

test('key shop: a 202 pending purchase is reported as on its way, candy held', async () => {
  const shop = createKeyShop({ win: shopWin, fetchImpl: fakeFetch({
    '/wallet': () => [200, { ...WALLET, keyPrice: 8, keysPending: 1 }],
    '/wallet/buy-key': () => [202, { ok: true, pending: true, price: 5, keyPrice: 8, candyBalance: 7, keyPurchaseEnabled: true }],
  }).fetchImpl });
  await shop.refresh();
  assert.equal(await shop.buy(), true);
  assert.match(shop.state.message, /KEY ON ITS WAY\. YOUR 5 CANDY IS HELD/);
  assert.equal(shop.state.error, false);
});
