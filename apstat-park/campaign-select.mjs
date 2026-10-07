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

export function createStageSelect(doc) {
  let atlas = null, atlasReady = false;
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
    pixelText(ctx, entry.label, tile.x + tile.w / 2, tile.y + 20, 14, INK, 'center');
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
    if (entry.state === 'waiting') pixelText(ctx, entry.needs.length + ' NEED', tile.x + tile.w / 2, tile.y + tile.h + 2, 7, INK, 'center');
    if (entry.openable) {
      pixelText(ctx, 'OPEN WITH', tile.x + tile.w / 2, tile.y + 38, 7, KEY_GOLD, 'center');
      pixelText(ctx, 'A KEY', tile.x + tile.w / 2, tile.y + 50, 7, KEY_GOLD, 'center');
    }
    if (entry.team) sprite(ctx, 'triangleBlue', tile.x + tile.w - 20, tile.y - 6, 1);
    if (selected) outline(ctx, { x: tile.x - 4, y: tile.y - 4, w: tile.w + 8, h: tile.h + 8 }, ORANGE);
  }

  // left: the world's left edge of the 720-wide column. Never translates the context.
  function render(ctx, { progress, username, cursor, rejected, message, left = 0 }) {
    const states = stageStates(progress, username);
    const mine = states.filter(entry => entry.clearedByYou).length;
    pixelText(ctx, 'STAGE SELECT (' + mine + '/' + STAGE_COUNT + ')', left + 28, 40, 21, INK);
    const keys = progress?.keys?.[username] || 0;
    pixelText(ctx, 'YOUR KEYS: ' + keys, left + 28, 70, 14, keys ? KEY_GOLD : MUTED);
    if (progress?.team) pixelText(ctx, 'YOUR TEAM: ' + stageLabel(progress.team.stageIndex) + '  ' + (progress.team.roster || []).join(' + ').slice(0, 60),
      left + 28, 92, 7, INK);
    if (!progress) pixelText(ctx, 'LOADING STAGES...', left + 28, 92, 7, INK);
    for (const entry of states) {
      drawTile(ctx, entry, tileRect(entry.stage, left), { selected: entry.stage === cursor,
        greyed: rejected?.get(entry.stage) === entry.state });
    }
    const info = describe(states[cursor], states);
    pixelText(ctx, info.slice(0, 100), left + 28, 630, 7, INK);
    if (message) pixelText(ctx, String(message).slice(0, 100), left + 28, 646, 7, '#c0392b');
    pixelText(ctx, 'ARROWS MOVE . ENTER CHOOSES . ESC BACK TO THE PARK', left + 28, 664, 7, INK);
    return { states, info };
  }

  return { render, ready: () => atlasReady };
}
