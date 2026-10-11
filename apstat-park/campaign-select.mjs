// The PICO PARK door's level select (teacher 2026-10-07, PICO_DESK_SPEC.md "Campaign keys as a
// spendable count"), in the game's STAGE SELECT (n/48) form: all 48 stages in a grid of tiles.
// The relay is the authority: this module only draws its campaign_progress packet and maps a
// choice to a message. Tile art follows pico-desk-preview.html's layout B (a mark, the orange
// platform line, the stage name; the selection is the orange rounded outline).
const V = new URL(import.meta.url).search;
const { pixelText } = await import('./pixel-text.mjs' + V);
const { DESK_ATLAS } = await import('./assets/pico-desk-atlas.mjs' + V);

export const STAGE_COUNT = 48;
export const COLUMNS = 8;
export const ORANGE = '#FF864D';
export const KEY_GOLD = '#C9A227';
const INK = '#3a3045', MUTED = '#9a93a3';
const TILE = { w: 76, h: 76, gap: 8, top: 112, left: 28 };

export const stageLabel = stage => (Math.floor(stage / 4) + 1) + '-' + (stage % 4 + 1);

// For each party member, the first stage before `stage` they have not cleared.
function stillNeeded(progress, stage) {
  const needs = [];
  for (const name of progress?.party || []) {
    const cleared = new Set(progress.cleared?.[name] || []);
    for (let before = 0; before < stage; before++) {
      if (cleared.has(before)) continue;
      needs.push({ name, stage: before });
      break;
    }
  }
  return needs;
}

// One entry per stage. state:
//   'startable' — the party may start it        'cleared' — startable, and you have cleared it (✓)
//   'waiting'   — open, but someone present still needs an earlier stage (needs lists who)
//   'locked'    — not open; `openable` when it is the next stage and you hold a key
export function stageStates(progress, username) {
  const open = new Set(progress?.open || [0]);
  const startable = new Set(progress?.startable || [0]);
  const mine = new Set(progress?.cleared?.[username] || []);
  const next = Math.max(...open) + 1;
  const keys = progress?.keys?.[username] || 0;
  const team = progress?.team?.stageIndex;
  const states = [];
  for (let stage = 0; stage < STAGE_COUNT; stage++) {
    const entry = { stage, label: stageLabel(stage), clearedByYou: mine.has(stage), team: team === stage,
      needs: [], openable: false, next: stage === next };
    if (startable.has(stage)) entry.state = mine.has(stage) ? 'cleared' : 'startable';
    else if (open.has(stage)) { entry.state = 'waiting'; entry.needs = stillNeeded(progress, stage); }
    else { entry.state = 'locked'; entry.openable = stage === next && keys >= 1; }
    states.push(entry);
  }
  return states;
}

// What choosing a tile does: a message for the relay, or nothing.
export function choiceFor(entry) {
  if (!entry) return null;
  if (entry.state === 'startable' || entry.state === 'cleared') return { type: 'campaign_join', stage: entry.stage };
  if (entry.openable) return { type: 'campaign_open_stage', stage: entry.stage };
  return null;
}

// The tile the cursor starts on: your team's stage, else the furthest stage the party may start.
export function startCursor(states) {
  const team = states.find(entry => entry.team);
  if (team) return team.stage;
  const playable = states.filter(entry => entry.state === 'startable' || entry.state === 'cleared');
  return playable.length ? playable.at(-1).stage : 0;
}

export function tileRect(stage, left = 0) {
  const column = stage % COLUMNS, row = Math.floor(stage / COLUMNS);
  return { x: left + TILE.left + column * (TILE.w + TILE.gap), y: TILE.top + row * (TILE.h + TILE.gap), w: TILE.w, h: TILE.h };
}

// World coordinates -> stage index, or -1.
export function stageAt(x, y, left = 0) {
  for (let stage = 0; stage < STAGE_COUNT; stage++) {
    const tile = tileRect(stage, left);
    if (x >= tile.x && x < tile.x + tile.w && y >= tile.y && y < tile.y + tile.h) return stage;
  }
  return -1;
}

// Arrow keys move by one tile / one row; the cursor stays on the grid.
export function moveCursor(cursor, key) {
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLUMNS, ArrowDown: COLUMNS }[key];
  if (!step) return cursor;
  return Math.max(0, Math.min(STAGE_COUNT - 1, cursor + step));
}

// The line under the grid that explains the tile under the cursor.
export function describe(entry, states) {
  if (!entry) return '';
  if (entry.state === 'startable' || entry.state === 'cleared') {
    return 'ENTER: START ' + entry.label + (entry.team ? ' WITH YOUR TEAM' : '') + (entry.clearedByYou ? ' (CLEARED)' : '');
  }
  if (entry.state === 'waiting') {
    return 'STILL NEEDED: ' + entry.needs.map(need => need.name + ' ' + stageLabel(need.stage)).join(', ');
  }
  if (entry.openable) return 'ENTER: SPEND 1 KEY TO OPEN ' + entry.label + ' FOR EVERYONE';
  if (entry.next) return 'EARN A KEY IN A CALCULATOR TEAM ROUND TO OPEN ' + entry.label;
  const next = states.find(other => other.next);
  return next ? 'OPEN ' + next.label + ' FIRST' : 'LOCKED';
}

// ── BUY KEY (teacher 2026-10-08, PICO_DESK_SPEC "Candy economy", item 10) ──────────────────────────
// A button beside YOUR KEYS that buys one key with candy. Mouse only (no key binding), like the rest
// of the park panel's extras. The button shows the live price of the NEXT key; a bought key arrives
// from the relay and is counted in YOUR KEYS like any earned one.
export const BUY_BUTTON = { x: 200, y: 50, w: 196, h: 26 };

export function buyButtonRect(left = 0) {
  return { ...BUY_BUTTON, x: left + BUY_BUTTON.x };
}

export function onBuyButton(x, y, left = 0) {
  const button = buyButtonRect(left);
  return x >= button.x && x < button.x + button.w && y >= button.y && y < button.y + button.h;
}

// shop: key-shop.mjs state { wallet, loading, busy }. Returns what the button draws:
//   enabled  whether a click buys        label    'BUY KEY · <price>'
//   caption  a short line beside it      reason   the full sentence (status line / hover)
export function keyShopView(shop) {
  const wallet = shop?.wallet;
  if (!wallet) {
    const caption = shop?.loading ? 'CHECKING YOUR CANDY...' : 'SIGN IN TO BUY KEYS';
    return { enabled: false, price: null, label: 'BUY KEY', caption, reason: caption };
  }
  if (!wallet.keyPurchaseEnabled || wallet.keyPrice == null) {
    const why = String(wallet.keyPurchaseOffReason || 'key buying is not set up yet').toUpperCase();
    return { enabled: false, price: null, label: 'BUY KEY', caption: why.slice(0, 40), reason: why };
  }
  const price = wallet.keyPrice;
  const candy = Math.floor((wallet.candyBalance || 0) + 1e-9);
  const label = 'BUY KEY · ' + price;
  if (shop.busy) return { enabled: false, price, label, caption: 'BUYING...', reason: 'BUYING A KEY...' };
  // A price check in flight may change the price: no buying on a number that is about to move.
  if (shop.loading) return { enabled: false, price, label, caption: 'CHECKING THE PRICE...', reason: 'CHECKING THE PRICE...' };
  if (candy < price) {
    return { enabled: false, price, label, caption: 'NEED ' + price + ', YOU HAVE ' + candy,
      reason: 'YOU NEED ' + price + ' CANDY FOR THE NEXT KEY. YOU HAVE ' + candy + '.' };
  }
  return { enabled: true, price, label, caption: 'YOU HAVE ' + candy + ' CANDY',
    reason: 'CLICK BUY KEY: 1 KEY FOR ' + price + ' CANDY. EACH KEY TODAY COSTS MORE.' };
}

// ── MUSIC (teacher 2026-10-10, park-music.mjs) ─────────────────────────────────────────────────────
// A bar in the orange strip: < SONG > and PLAY / STOP. Mouse on the buttons, or M (next song) and
// P (play / stop) on the keyboard. The song is the student's own pick (solo play); in class the bar
// says so and nothing plays.
export const MUSIC_BAR = {
  prev: { x: 28, y: 712, w: 26, h: 26 },
  next: { x: 334, y: 712, w: 26, h: 26 },
  play: { x: 380, y: 712, w: 92, h: 26 },
};

export function musicButtonAt(x, y, left = 0) {
  for (const name of Object.keys(MUSIC_BAR)) {
    const b = MUSIC_BAR[name];
    if (x >= left + b.x && x < left + b.x + b.w && y >= b.y && y < b.y + b.h) return name;
  }
  return null;
}

// music: park-music.mjs view() or null. What the bar draws and what a click would do.
export function musicBarView(music) {
  if (!music) return null;
  const title = music.title || 'ORIGINAL SOUNDS';
  if (music.inClass) return { title, playLabel: 'IN CLASS', canPlay: false, playing: false, caption: 'MUSIC IS OFF IN CLASS' };
  if (!music.hasSong && music.loading) return { title, playLabel: 'LOADING', canPlay: false, playing: false, caption: 'LOADING THE SONG...' };
  const failed = music.failed ? 'COULD NOT LOAD ' + (music.failedTitle || 'THAT SONG') + '. ' : '';
  if (!music.hasSong) return { title, playLabel: 'PLAY', canPlay: false, playing: false, caption: failed + 'PICK A SONG TO HEAR MUSIC. M = NEXT SONG' };
  const playing = !!music.playing;
  return { title, playLabel: playing ? 'STOP' : 'PLAY', canPlay: true, playing,
    caption: failed + (playing ? 'P = STOP . M = NEXT SONG' : 'P = PLAY . M = NEXT SONG') };
}

export function createStageSelect(doc) {
  let atlas = null, atlasReady = false;
  let ink = INK;   // the song palette's fg while a song is picked (render's `ink`), the park's ink otherwise
  try {
    atlas = new doc.defaultView.Image();
    atlas.onload = () => { atlasReady = true; };
    atlas.src = new URL('./assets/pico-desk.png' + V, import.meta.url).href;
  } catch { atlas = null; }

  function sprite(ctx, name, x, y, scale = 2) {
    const cell = DESK_ATLAS[name];
    if (!atlasReady || !cell) return false;
    ctx.drawImage(atlas, cell.x, cell.y, cell.w, cell.h, x, y, cell.w * scale, cell.h * scale);
    return true;
  }

  function outline(ctx, { x, y, w, h }, colour) {
    const r = 10;
    ctx.strokeStyle = colour; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath(); ctx.stroke();
  }

  // Fallback marks when the sheet is not decoded (and in tests).
  function tick(ctx, x, y) {
    if (sprite(ctx, 'tick', x, y)) return;
    ctx.fillStyle = '#479b67';
    for (let i = 0; i < 4; i++) ctx.fillRect(x + 4 + i * 4, y + 16 + i * 4, 4, 4);
    for (let i = 0; i < 5; i++) ctx.fillRect(x + 16 + i * 3, y + 24 - i * 5, 4, 4);
  }

  function drawTile(ctx, entry, tile, { selected, greyed }) {
    const dim = greyed || entry.state === 'locked';
    ctx.save();
    if (dim) ctx.globalAlpha *= 0.45;
    pixelText(ctx, entry.label, tile.x + tile.w / 2, tile.y + 20, 14, ink, 'center');
    const markX = tile.x + tile.w / 2 - 16, markY = tile.y + 26;
    if (entry.clearedByYou) tick(ctx, markX, markY);
    else if (entry.state === 'waiting') {
      if (!sprite(ctx, 'bang', tile.x + tile.w / 2 - 14, markY + 2)) pixelText(ctx, '!', tile.x + tile.w / 2, markY + 24, 21, ORANGE, 'center');
    } else if (entry.state === 'locked' && !entry.openable) {
      if (!sprite(ctx, 'question', tile.x + tile.w / 2 - 10, markY - 2, 1)) pixelText(ctx, '?', tile.x + tile.w / 2, markY + 24, 21, MUTED, 'center');
    }
    if (!sprite(ctx, 'platform', tile.x + 6, tile.y + tile.h - 14, 1)) {
      ctx.fillStyle = ORANGE; ctx.fillRect(tile.x + 6, tile.y + tile.h - 14, 64, 6);
    }
    ctx.restore();
    if (entry.state === 'waiting') pixelText(ctx, entry.needs.length + ' NEED', tile.x + tile.w / 2, tile.y + tile.h + 2, 7, ink, 'center');
    if (entry.openable) {
      pixelText(ctx, 'OPEN WITH', tile.x + tile.w / 2, tile.y + 38, 7, KEY_GOLD, 'center');
      pixelText(ctx, 'A KEY', tile.x + tile.w / 2, tile.y + 50, 7, KEY_GOLD, 'center');
    }
    if (entry.team) sprite(ctx, 'triangleBlue', tile.x + tile.w - 20, tile.y - 6, 1);
    if (selected) outline(ctx, { x: tile.x - 4, y: tile.y - 4, w: tile.w + 8, h: tile.h + 8 }, ORANGE);
  }

  // A small pixel wrapped candy (the pixel font has no emoji).
  function candyMark(ctx, x, y, colour) {
    ctx.fillStyle = colour;
    ctx.fillRect(x + 4, y + 2, 8, 6);
    ctx.fillRect(x, y, 3, 3); ctx.fillRect(x, y + 7, 3, 3); ctx.fillRect(x + 2, y + 3, 2, 4);
    ctx.fillRect(x + 13, y, 3, 3); ctx.fillRect(x + 13, y + 7, 3, 3); ctx.fillRect(x + 12, y + 3, 2, 4);
  }

  function drawBuyButton(ctx, view, left) {
    const button = buyButtonRect(left);
    ctx.save();
    ctx.fillStyle = view.enabled ? KEY_GOLD : '#e4dfe8';
    ctx.fillRect(button.x, button.y, button.w, button.h);
    ctx.restore();
    outline(ctx, button, view.enabled ? '#8a6d10' : MUTED);
    const text = view.enabled ? '#ffffff' : MUTED;
    pixelText(ctx, view.label, button.x + 12, button.y + 20, 14, text);
    if (view.price != null) candyMark(ctx, button.x + button.w - 26, button.y + 8, text);
    pixelText(ctx, view.caption, button.x + button.w + 10, button.y + 17, 7, view.enabled ? ink : MUTED);
  }

  function drawMusicBar(ctx, view, left) {
    const B = MUSIC_BAR, white = '#ffffff';
    const button = (b, label, enabled) => {
      const r = { ...b, x: left + b.x };
      ctx.save(); ctx.globalAlpha = enabled ? 1 : 0.5;
      ctx.fillStyle = white; ctx.fillRect(r.x, r.y, r.w, r.h);
      pixelText(ctx, label, r.x + r.w / 2, r.y + 19, 14, ORANGE, 'center');
      ctx.restore();
    };
    button(B.prev, '<', true); button(B.next, '>', true);
    pixelText(ctx, view.title.slice(0, 24), left + (B.prev.x + B.prev.w + B.next.x) / 2, 731, 14, white, 'center');
    button(B.play, view.playLabel, view.canPlay);
    pixelText(ctx, view.caption.slice(0, 48), left + B.play.x + B.play.w + 12, 729, 7, white);
  }

  // left: the world's left edge of the 720-wide column. Never translates the context.
  // shop: the key shop state (key-shop.mjs), or null to hide the BUY KEY button.
  // music: park-music.mjs view(), or null to hide the music bar.
  // ink: the text colour (the song palette's fg; defaults to the park's ink).
  function render(ctx, { progress, username, cursor, rejected, message, left = 0, shop = null, hoverBuy = false, music = null, ink: inkIn = INK }) {
    ink = inkIn || INK;
    const states = stageStates(progress, username);
    const mine = states.filter(entry => entry.clearedByYou).length;
    pixelText(ctx, 'STAGE SELECT (' + mine + '/' + STAGE_COUNT + ')', left + 28, 40, 21, ink);
    const keys = progress?.keys?.[username] || 0;
    pixelText(ctx, 'YOUR KEYS: ' + keys, left + 28, 70, 14, keys ? KEY_GOLD : MUTED);
    const shopView = shop ? keyShopView(shop) : null;
    if (shopView) drawBuyButton(ctx, shopView, left);
    if (progress?.team) pixelText(ctx, 'YOUR TEAM: ' + stageLabel(progress.team.stageIndex) + '  ' + (progress.team.roster || []).join(' + ').slice(0, 60),
      left + 28, 92, 7, ink);
    if (!progress) pixelText(ctx, 'LOADING STAGES...', left + 28, 92, 7, ink);
    for (const entry of states) {
      drawTile(ctx, entry, tileRect(entry.stage, left), { selected: entry.stage === cursor,
        greyed: rejected?.get(entry.stage) === entry.state });
    }
    const info = hoverBuy && shopView ? shopView.reason : describe(states[cursor], states);
    pixelText(ctx, info.slice(0, 100), left + 28, 630, 7, ink);
    const shopNote = shop?.message ? String(shop.message) : '';
    if (message) pixelText(ctx, String(message).slice(0, 100), left + 28, 646, 7, '#c0392b');
    else if (shopNote) pixelText(ctx, shopNote.slice(0, 100), left + 28, 646, 7, shop.error ? '#c0392b' : '#479b67');
    pixelText(ctx, 'ARROWS MOVE . ENTER CHOOSES . ESC BACK TO THE PARK', left + 28, 664, 7, ink);
    const musicView = musicBarView(music);
    if (musicView) drawMusicBar(ctx, musicView, left);
    return { states, info, shop: shopView, music: musicView };
  }

  return { render, ready: () => atlasReady };
}
