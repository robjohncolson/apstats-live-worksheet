import { ParkReplica } from './replica.mjs';
import { mountParkGame } from './game.mjs';

export function mountParkPanel({ container, role, getSocket, getMembers, onClose = () => {} }) {
  const doc = container.ownerDocument, panel = doc.createElement('dialog');
  panel.setAttribute('aria-label', 'APStat Park');
  panel.style.cssText = 'width:min(1100px,95vw);max-height:94vh;overflow:auto;background:#10282d;color:#e4f0e6;border:1px solid #537868;border-radius:16px;padding:20px;font:16px system-ui';
  const heading = doc.createElement('h2'); heading.textContent = 'APStat Park';
  const status = doc.createElement('p'); status.setAttribute('role', 'status');
  const actions = doc.createElement('div'), view = doc.createElement('div');
  panel.append(heading, status, actions, view); container.append(panel); panel.showModal();
  const replica = new ParkReplica(), pending = new Map();
  let clientId = doc.defaultView.sessionStorage.getItem('apstat-park-client');
  if (!clientId) {
    clientId = `park_${crypto.randomUUID().replaceAll('-', '')}`;
    doc.defaultView.sessionStorage.setItem('apstat-park-client', clientId);
  }
  let socket = null, requestId = 0, disposed = false, game = null, joining = false, joinedSocket = null;
  let retryAt = 0, lastStatusAt = 0, groupId = 'classroom-park';

  function button(label, action) {
    const element = doc.createElement('button'); element.type = 'button'; element.textContent = label;
    element.style.cssText = 'padding:10px 16px;margin:4px;border-radius:8px';
    element.onclick = async () => {
      element.disabled = true;
      try { await action(); } catch (error) { status.textContent = error.message; }
      finally { element.disabled = false; }
    };
    actions.append(element); return element;
  }

  function request(type, data = {}) {
    if (!socket || socket.readyState !== 1 || pending.size >= 8) return Promise.reject(new Error('Waiting for the classroom connection'));
    const id = `${clientId}_${++requestId}`;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Connection delayed; trying again')); }, 8000);
      pending.set(id, { resolve, reject, timeout });
      socket.send(JSON.stringify({ type, requestId: id, groupId, ...data }));
    });
  }

  function onMessage(event) {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (!message?.type?.startsWith('park_')) return;
    if (message.type === 'park_error' && message.code === 'PARK_STREAM_CHANGED') {
      replica.needsResume = true;
      return;
    }
    if (message.type === 'park_error' && message.code === 'PARK_NOT_ASSIGNED') {
      game?.dispose(); game = null; replica.state = null; joinedSocket = null;
      status.textContent = message.message;
    }
    if (message.type === 'park_error' && !message.requestId) {
      // A command/motion rejected without a request id (e.g. the relay pruned this binding):
      // rejoin rather than retrying the outbox head forever.
      replica.needsResume = true;
      return;
    }
    if (message.type === 'park_event') {
      if (message.kind === 'stopped' && message.epoch === replica.state?.epoch) {
        game?.dispose(); game = null; replica.state = null; joinedSocket = null;
        status.textContent = 'Your teacher ended this park group.'; retryAt = performance.now() + 5000;
      } else if (message.kind === 'motion') replica.peerMotion(message);
      else replica.event(message);
      if (role === 'teacher' && replica.state && message.kind !== 'motion') {
        const state = replica.state, arrived = state.progress.arrived.length;
        status.textContent = state.done ? 'The whole group completed APStat Park!'
          : arrived === state.members.length ? 'Everyone reached the exit. Choose Next level to continue.'
          : `${state.level.title}: ${state.running ? 'playing' : 'paused'}. ${state.progress.switches.length}/${state.members.length} contributions saved; ${arrived}/${state.members.length} at the exit.`;
      }
      return;
    }
    if (message.status) { replica.acknowledge(message); return; }
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

  async function join(force = false) {
    if (joining || disposed || socket?.readyState !== 1) return;
    joining = true; const current = socket;
    try {
      const response = await request('park_resume', { clientId, epoch: replica.state?.epoch,
        since: !force && replica.state ? replica.revision : null });
      if (disposed || current !== socket) return;
      replica.resume(response); groupId = response.groupId; joinedSocket = socket;
      if (response.clientId && response.clientId !== clientId) {
        clientId = response.clientId;
        doc.defaultView.sessionStorage.setItem('apstat-park-client', clientId);
      }
      if (role !== 'teacher' && !game) game = mountParkGame({ container: view, replica, member: response.member,
        connected: () => socket?.readyState === 1 && joinedSocket === socket });
      status.textContent = role === 'teacher' ? `Group ready: ${response.members?.join(', ') ?? replica.state.members.join(', ')}` : 'Help your group reach the exit.';
    } catch (error) { if (!disposed) status.textContent = error.message; }
    finally { joining = false; retryAt = performance.now() + 2000; }
  }

  if (role === 'teacher') {
    const selection = doc.createElement('fieldset');
    const legend = doc.createElement('legend'); legend.textContent = 'Choose up to eight students'; selection.append(legend);
    for (const member of getMembers().filter(member => member.role === 'student' && member.online !== false)) {
      const label = doc.createElement('label'), checkbox = doc.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = member.username;
      label.style.cssText = 'display:inline-block;margin:8px'; label.append(checkbox, doc.createTextNode(member.username)); selection.append(label);
    }
    actions.append(selection);
    button('Create group', async () => {
      const members = [...selection.querySelectorAll('input:checked')].map(input => input.value);
      const response = await request('park_start', { members });
      replica.resume(response); joinedSocket = socket;
      status.textContent = `Group ready: ${members.join(', ')}`;
    });
    button('Start', () => request('park_run', { running: true }));
    button('Pause', () => request('park_run', { running: false }));
    button('Next level / help group', () => request('park_next'));
    button('End group', () => request('park_stop'));
  } else button('Join park', () => join(true));
  button('Back to classroom', dispose);
  panel.addEventListener('cancel', event => { event.preventDefault(); dispose(); });

  async function pump() {
    if (disposed) return;
    bindSocket();
    const connected = socket?.readyState === 1;
    if (connected && performance.now() >= retryAt && (joinedSocket !== socket || replica.needsResume)) await join();
    if (disposed || !connected || joinedSocket !== socket) return;
    if (role !== 'teacher') {
      for (const packet of replica.outgoing({ connected, bufferedAmount: socket.bufferedAmount })) socket.send(JSON.stringify(packet));
    }
    // Tiny revision probe recovers a dropped final event, even if nobody acts
    // again. This is connection metadata, not a game-state polling loop.
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
    if (socket?.readyState === 1 && replica.state) {
      socket.send(JSON.stringify({ type: 'park_leave', epoch: replica.state.epoch }));
    }
    disposed = true; clearInterval(timer); game?.dispose();
    socket?.removeEventListener('message', onMessage);
    for (const job of pending.values()) { clearTimeout(job.timeout); job.reject(new Error('Park closed')); }
    pending.clear(); panel.close(); panel.remove(); onClose();
  }
  bindSocket();
  const timer = setInterval(() => { pump().catch(error => { if (!disposed) status.textContent = error.message; }); }, 50);
  status.textContent = 'Joining your classroom park...';
  return { dispose, replica, getGame: () => game };
}
