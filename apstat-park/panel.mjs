import { ParkReplica } from './replica.mjs';
import { mountParkGame } from './game.mjs';

// Replaces the contents of the calendar's character area; never opens a dialog or page.
export function mountParkPanel({ container, getSocket, drawAvatar, onClose = () => {} }) {
  const doc = container.ownerDocument, panel = doc.createElement('section');
  panel.setAttribute('aria-label', 'APStat Park');
  panel.setAttribute('data-park-scene', '');
  panel.style.cssText = 'position:relative;height:220px;background:transparent;color:inherit;padding:0;font:inherit;font-size:12px';
  // Keep incoming classroom updates hidden without overwriting their latest
  // display state. They become visible in the correct state when we return.
  const style = doc.createElement('style');
  style.textContent = '[data-park-active] > :not([data-park-scene]) { display:none !important; }'
    + '[data-park-scene] canvas:focus { outline:none; }'
    + '[data-park-scene] canvas:focus-visible { box-shadow:inset 0 -1px currentColor; }';
  panel.append(style);
  container.setAttribute('data-park-active', '');
  const header = doc.createElement('div');
  header.style.cssText = 'position:absolute;right:4px;top:2px;z-index:2';
  const title = doc.createElement('strong'); title.textContent = 'APStat Park'; title.hidden = true;
  const exit = doc.createElement('button'); exit.type = 'button'; exit.textContent = 'Exit to calendar';
  exit.style.cssText = 'background:transparent;color:inherit;border:1px solid currentColor;border-radius:0;padding:3px 6px;font:inherit;font-size:11px;cursor:pointer';
  header.append(title, exit);
  const status = doc.createElement('p'); status.setAttribute('role', 'status'); status.style.cssText = 'position:absolute;top:65px;left:6px;right:6px;margin:0;z-index:2;font:inherit';
  const view = doc.createElement('div'); view.style.cssText = 'position:relative;height:220px';
  panel.append(header, status, view); container.append(panel);
  const replica = new ParkReplica(), pending = new Map();
  const freshId = () => 'park_' + crypto.randomUUID().replaceAll('-', '');
  let clientId;
  try { clientId = doc.defaultView.sessionStorage.getItem('apstat-park-client'); } catch {}
  if (!clientId) clientId = freshId();
  function saveClient() { try { doc.defaultView.sessionStorage.setItem('apstat-park-client', clientId); } catch {} }
  saveClient();
  const requestPrefix = freshId();
  let socket = null, requestId = 0, disposed = false, game = null, joining = false, joinedSocket = null;
  let retryAt = 0, lastStatusAt = 0;

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
    if (joining || disposed || socket?.readyState !== 1) return;
    joining = true; const current = socket;
    try {
      const response = await request('park_resume', { clientId, epoch: replica.state?.epoch,
        since: replica.state ? replica.revision : null });
      if (disposed || current !== socket) return;
      replica.resume(response); joinedSocket = socket;
      if (response.clientId && response.clientId !== clientId) { clientId = response.clientId; saveClient(); }
      if (!game) game = mountParkGame({ container: view, replica, member: response.member, drawAvatar, onExit: dispose,
        connected: () => socket?.readyState === 1 && joinedSocket === socket });
      status.textContent = '';
    } catch (error) { if (!disposed) status.textContent = error.message; }
    finally { joining = false; retryAt = performance.now() + 2000; }
  }

  async function pump() {
    if (disposed) return;
    bindSocket();
    if (socket?.readyState !== 1) {
      status.textContent = replica.state ? 'Reconnecting. Your saved puzzle progress stays here.' : 'Connecting to your classroom...';
      return;
    }
    if (performance.now() >= retryAt && (joinedSocket !== socket || replica.needsResume)) await join();
    if (disposed || socket?.readyState !== 1 || joinedSocket !== socket) return;
    for (const packet of replica.outgoing({ connected: true, bufferedAmount: socket.bufferedAmount })) socket.send(JSON.stringify(packet));
    // A small revision probe recovers a lost last event and checks hourly rotation.
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
    if (socket?.readyState === 1 && replica.state) socket.send(JSON.stringify({ type: 'park_leave', epoch: replica.state.epoch }));
    clearInterval(timer); game?.dispose();
    socket?.removeEventListener('message', onMessage);
    for (const job of pending.values()) { clearTimeout(job.timeout); job.reject(new Error('Park closed')); }
    pending.clear(); panel.remove();
    container.removeAttribute('data-park-active');
    onClose();
  }
  exit.onclick = dispose;
  bindSocket();
  const timer = setInterval(() => { pump().catch(error => { if (!disposed) status.textContent = error.message; }); }, 100);
  status.textContent = 'Entering your classroom park...';
  return { dispose, replica, getGame: () => game };
}
