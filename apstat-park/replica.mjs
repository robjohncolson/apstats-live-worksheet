// Shared progress is event driven. Local physics and rendering do not wait here.
import { RemoteMotion } from './remote-motion.mjs';
const copy = value => structuredClone(value);
const OUTBOX_LIMIT = 16;
const RETRY_MS = 1500;
const MOTION_MS = 500;

export class ParkReplica {
  constructor({ now = () => performance.now() } = {}) {
    this.now = now;
    this.remoteMotion = new RemoteMotion(now);
    this.state = null;
    this.revision = 0;
    this.nextSequence = 1;
    this.streamId = null;
    this.motionSequence = 0;
    this.outbox = [];
    this.pendingMotion = null;
    this.lastMotion = null;
    this.lastMotionAt = -Infinity;
    this.needsResume = true;
    this.lastRejection = null;
    this.clockAnchor = { local: this.now(), remote: 0 };
  }

  clock() { return this.clockAnchor.remote + (this.state && !this.state.running ? 0 : this.now() - this.clockAnchor.local); }

  resume(response) {
    if (!response || !['events', 'summary'].includes(response.mode)
      || !Number.isSafeInteger(response.sequence) || response.sequence < 0
      || !Number.isSafeInteger(response.revision) || response.revision < 0) throw new Error('Invalid park resume');
    if (Number.isFinite(response.clockMs)) this.clockAnchor = { local: this.now(), remote: response.clockMs };
    const sameEpoch = this.state?.epoch === response.epoch;
    if (!sameEpoch && response.mode !== 'summary') throw new Error('A new park requires a summary');
    if (!sameEpoch) {
      this.lastRejection = null;
      this.outbox = [];
      this.pendingMotion = null;
      this.lastMotion = null;
      this.motionSequence = 0;
    }
    if (response.mode === 'summary') {
      if (this.state?.level.id !== response.level.id) {
        this.pendingMotion = null;
        this.lastMotion = null;
      }
      this.state = copy(response);
      this.revision = response.revision;
    } else {
      for (const event of response.events) {
        if (!this.event(event)) throw new Error('Incomplete park event history');
      }
      if (this.revision !== response.revision) throw new Error('Incomplete park event history');
      this.state.poses = copy(response.poses);
    }
    if (sameEpoch && this.streamId !== response.streamId) {
      // A closed tab's slot may have been reclaimed. Shared actions are
      // idempotent milestones, so retry current-level intents with fresh IDs.
      this.outbox = this.outbox.filter(command => command.packet.level === this.state.level.id);
      this.outbox.forEach((command, index) => {
        command.packet.sequence = response.sequence + index + 1;
        command.packet.streamId = response.streamId;
        command.sentAt = -Infinity;
      });
      this.motionSequence = 0;
    }
    this.streamId = response.streamId;
    const pendingSequences = new Set(this.outbox.map(command => command.packet.sequence));
    for (const receipt of response.receipts ?? []) {
      if (pendingSequences.has(receipt.sequence) && receipt.status === 'rejected') this.lastRejection = receipt.reason;
    }
    this.outbox = this.outbox.filter(command => command.packet.sequence > response.sequence);
    this.remoteMotion.reset(this.state.poses);
    this.nextSequence = Math.max(response.sequence + 1, this.outbox.at(-1)?.packet.sequence + 1 || 1);
    if (this.outbox.length) this.outbox[0].sentAt = -Infinity;
    this.needsResume = false;
    if (Number.isFinite(response.clockMs)) this.clockAnchor = { local: this.now(), remote: response.clockMs };
    return this.state;
  }

  event(event) {
    if (!this.state || event?.epoch !== this.state.epoch) { this.needsResume = true; return false; }
    if (!Number.isSafeInteger(event.revision) || event.revision < 1) return false;
    if (event.revision <= this.revision) return true;
    if (event.revision !== this.revision + 1) { this.needsResume = true; return false; }
    const progress = this.state.progress;
    if (event.kind === 'settled') {
      this.state.poses[event.member] = copy(event.pose);
      this.remoteMotion.push(event.member, event.pose);
    } else if (event.kind === 'holds') { progress.holds = copy(event.holds); progress.switches = Object.keys(event.holds); }
    else if (event.kind === 'mechanisms') Object.assign(progress, { gates: copy(event.gates), lifts: copy(event.lifts), bridgeOpen: event.bridgeOpen });
    else if (event.kind === 'box') progress.boxes[event.id] = copy(event.state);
    else if (event.kind === 'reentered') {
      progress.arrived = progress.arrived.filter(name => name !== event.member);
      delete this.state.poses[event.member];
      this.remoteMotion.reset(this.state.poses);
    } else if (event.kind === 'key') progress.keyHolder = event.holder;
    else if (event.kind === 'door') progress.doorOpen = event.open;
    else if (event.kind === 'complete') progress.complete = event.complete;
    else if (event.kind === 'members') this.state.members = [...event.members];
    else if (event.kind === 'presence') this.state.online = [...event.online];
    else if (event.kind === 'running') { this.state.running = event.running; if (Number.isFinite(event.clockMs)) this.clockAnchor = {local:this.now(),remote:event.clockMs}; }
    else if (event.kind === 'level') {
      if (Number.isFinite(event.clockMs)) this.clockAnchor = {local:this.now(),remote:event.clockMs};
      this.state.level = copy(event.level);
      this.state.progress = copy(event.progress);
      this.state.poses = {};
      this.remoteMotion.reset();
      this.pendingMotion = null;
      this.lastMotion = null;
    } else if (event.kind === 'finished') {
      this.state.done = true;
      this.state.running = false;
    } else if (event.kind === 'contribution') {
      if (event.collection !== 'switches') return false;
      if (!progress[event.collection].includes(event.target)) progress[event.collection].push(event.target);
      progress.bridgeOpen = event.bridgeOpen;
    } else if (event.kind === 'arrived') {
      if (!progress.arrived.includes(event.member)) progress.arrived.push(event.member);
    } else return false;
    this.revision = event.revision;
    return true;
  }

  queue(kind, target, pose, details = {}) {
    if (!this.state || this.state.done || !this.state.running) return { status: 'paused' };
    if (this.outbox.length >= OUTBOX_LIMIT) return { status: 'full' };
    const level = this.state.level.id;
    if (this.outbox.some(row => row.packet.level === level && row.packet.kind === kind && row.packet.target === target)) return { status: 'pending' };
    const packet = { epoch: this.state.epoch, streamId: this.streamId, level, sequence: this.nextSequence++, kind, target, pose: copy(pose), ...copy(details) };
    this.lastRejection = null;
    this.outbox.push({ packet, sentAt: -Infinity });
    return { status: 'queued' };
  }

  acknowledge(response) {
    if (response?.epoch !== this.state?.epoch) return;
    if (response.streamId !== undefined && response.streamId !== this.streamId) return;
    const head = this.outbox[0];
    if (!head) return;
    if (response.status === 'gap') { this.needsResume = true; return; }
    if (response.sequence !== head.packet.sequence || !['accepted', 'duplicate', 'rejected'].includes(response.status)) return;
    if (response.status === 'rejected' || response.status === 'duplicate' && response.outcome === 'rejected') this.lastRejection = response.reason;
    this.outbox.shift();
    // The broadcast or ACK can be lost independently. A receipt proves that
    // progress at this revision exists, not that we have received its events.
    if (response.revision > this.revision) this.needsResume = true;
  }

  motion(pose) {
    if (!this.state) return;
    const rounded = Object.fromEntries(['x', 'y', 'vx', 'vy'].map(key => [key, Math.round(pose[key] * 10) / 10]));
    const signature = JSON.stringify(rounded);
    if (signature === this.lastMotion) { this.pendingMotion = null; return; }
    this.pendingMotion = { pose: rounded, signature };
  }

  peerMotion(event) {
    if (!this.state || event.epoch !== this.state.epoch || event.level !== this.state.level.id
      || !this.state.members.includes(event.member)) return;
    if (!this.remoteMotion.push(event.member, event.pose)) return;
    this.state.poses = { ...this.state.poses, [event.member]: copy(event.pose) };
  }

  outgoing({ connected, bufferedAmount = 0 }) {
    // Let ordinary classroom traffic drain. Never append movement to a backed
    // up WebSocket: the newest local pose replaces all previous unsent poses.
    if (!connected || bufferedAmount > 4096 || this.needsResume || !this.state) return [];
    const result = [], at = this.now(), head = this.outbox[0];
    if (head && at - head.sentAt >= RETRY_MS) {
      result.push({ type: 'park_command', ...copy(head.packet) });
      head.sentAt = at;
    }
    if (this.pendingMotion && this.state.running && !this.state.done && at - this.lastMotionAt >= MOTION_MS) {
      result.push({ type: 'park_motion', epoch: this.state.epoch, streamId: this.streamId, level: this.state.level.id,
        sequence: ++this.motionSequence, pose: this.pendingMotion.pose });
      this.lastMotion = this.pendingMotion.signature;
      this.pendingMotion = null;
      this.lastMotionAt = at;
    }
    return result;
  }
}
