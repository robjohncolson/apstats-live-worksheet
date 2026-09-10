import { ParkReplica } from './replica.mjs';
import { mountBoardScene } from './board-scene.mjs';

// Transport and lifecycle only. The board owns the canvas, controls and sprites.
export function mountParkPanel({ container, getSocket, board, onClose = () => {} }) {
  const doc = container.ownerDocument;
  const status = doc.createElement('span');
  status.setAttribute('role', 'status');
  status.setAttribute('data-park-status', '');
  status.style.cssText = 'position:absolute;bottom:4px;left:8px;right:8px;font:inherit;font-size:12px;pointer-events:none';
  container.append(status);
  container.setAttribute('data-park-active', '');
  let replica = new ParkReplica();
  const pending = new Map();
  let selectedLevel = null, selectionVersion = 0;
  const completionKey = 'apstat-park-completed:' + board.username;
  let completed = [];
  try { const saved = JSON.parse(doc.defaultView.localStorage.getItem(completionKey)); if (Array.isArray(saved)) completed = saved.filter(index => [0, 1, 2].includes(index)); } catch {}
  function remember(index) {
    if (completed.includes(index)) return;
    completed.push(index);
    try { doc.defaultView.localStorage.setItem(completionKey, JSON.stringify(completed)); } catch {}
  }
  const freshId = () => 'park_' + crypto.randomUUID().replaceAll('-', '');
  let clientId;
  try { clientId = doc.defaultView.sessionStorage.getItem('apstat-park-client'); } catch {}
  if (!clientId) clientId = freshId();
  function saveClient() { try { doc.defaultView.sessionStorage.setItem('apstat-park-client', clientId); } catch {} }
  saveClient();
  const requestPrefix = freshId();
  let socket = null, requestId = 0, disposed = false, game = null, joining = false, joinedSocket = null;
  let retryAt = 0, lastStatusAt = 0, incompatible = false;

  function request(type, data = {}) {
    if (!socket || socket.readyState !== 1 || socket.bufferedAmount > 4096 || pending.size >= 8) return Promise.reject(new Error('Waiting for the classroom connection'));
    const id = requestPrefix + '_' + ++requestId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Connection delayed; trying again')); }, 8000);
      pending.set(id, { resolve, reject, timeout });
      socket.send(JSON.stringify({ type, requestId: id, ...data }));
    });
  }

  function onMessage(event) {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (!message?.type?.startsWith('park_')) return;
    if (message.type === 'park_event') {
      if (message.kind === 'motion') replica.peerMotion(message);
      else replica.event(message);
      return;
    }
    if (message.status) { replica.acknowledge(message); return; }
    if (message.type === 'park_error') {
      if (!message.requestId || message.code === 'PARK_STREAM_CHANGED') replica.needsResume = true;
      status.textContent = message.message;
      if (message.code === 'PARK_UPDATE_REQUIRED') incompatible = true;
    }
    const job = pending.get(message.requestId);
    if (!job) return;
    pending.delete(message.requestId); clearTimeout(job.timeout);
    if (message.type === 'park_error') job.reject(new Error(message.message)); else job.resolve(message);
  }

  function bindSocket() {
    const next = getSocket();
    if (next === socket) return;
    socket?.removeEventListener('message', onMessage);
    for (const job of pending.values()) { clearTimeout(job.timeout); job.reject(new Error('Reconnecting to your classroom')); }
    pending.clear(); socket = next; joinedSocket = null;
    socket?.addEventListener('message', onMessage);
  }

  async function join() {
    if (joining || disposed || selectedLevel === null || socket?.readyState !== 1) return;
    joining = true; const current = socket, version = selectionVersion;
    try {
      const response = await request(replica.state ? 'park_resume' : 'park_join', { protocol: 3, levelIndex: selectedLevel, clientId, epoch: replica.state?.epoch,
        since: replica.state ? replica.revision : null });
      if (disposed || current !== socket || version !== selectionVersion) return;
      if (response.mode === 'summary' && response.level?.protocol !== 3) {
        incompatible = true;
        throw new Error('The park is updating. Return to the calendar and try again shortly.');
      }
      replica.resume(response); joinedSocket = socket;
      if (response.clientId && response.clientId !== clientId) { clientId = response.clientId; saveClient(); }
      status.textContent = '';
    } catch (error) { if (!disposed) status.textContent = error.message; }
    finally { joining = false; retryAt = performance.now() + 2000; }
  }

  async function pump() {
    if (disposed || incompatible || selectedLevel === null) return;
    bindSocket();
    if (socket?.readyState !== 1) {
      status.textContent = replica.state ? 'Reconnecting. Your saved puzzle progress stays here.' : 'Connecting to your classroom...';
      return;
    }
    if (performance.now() >= retryAt && (joinedSocket !== socket || replica.needsResume)) await join();
    if (disposed || socket?.readyState !== 1 || joinedSocket !== socket) return;
    for (const packet of replica.outgoing({ connected: true, bufferedAmount: socket.bufferedAmount })) socket.send(JSON.stringify(packet));
    // A small revision probe recovers a lost final event.
    if (performance.now() - lastStatusAt >= 15000 && !joining) {
      lastStatusAt = performance.now();
      try {
        const response = await request('park_status');
        if (response.epoch !== replica.state?.epoch || response.revision > replica.revision) replica.needsResume = true;
      } catch { replica.needsResume = true; }
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (socket?.readyState === 1 && selectedLevel !== null) socket.send(JSON.stringify({ type: 'park_leave', epoch: replica.state?.epoch }));
    clearInterval(timer); game?.dispose();
    socket?.removeEventListener('message', onMessage);
    for (const job of pending.values()) { clearTimeout(job.timeout); job.reject(new Error('Park closed')); }
    pending.clear(); status.remove();
    container.removeAttribute('data-park-active');
    onClose();
  }
  function showScene(index = null) {
    if (socket?.readyState === 1 && selectedLevel !== null) socket.send(JSON.stringify({ type: 'park_leave', epoch: replica.state?.epoch }));
    selectionVersion++;
    game?.dispose();
    selectedLevel = index; replica = new ParkReplica(); joinedSocket = null;
    retryAt = 0; incompatible = false;
    game = mountBoardScene({ board, replica, member: board.username, onExit: dispose,
      onLobby: () => showScene(), onSelect: showScene, lobby: index === null, completed, remember, status,
      connected: () => !incompatible && socket?.readyState === 1 && joinedSocket === socket });
    status.textContent = index === null ? 'Walk to a puzzle door and press Up. The left door returns to the calendar.' : 'Entering your classroom puzzle...';
  }
  showScene();
  bindSocket();
  const timer = setInterval(() => { pump().catch(error => { if (!disposed) status.textContent = error.message; }); }, 100);
  return { dispose, get replica() { return replica; }, getGame: () => game };
}
