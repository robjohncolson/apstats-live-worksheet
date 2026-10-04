// Replay only contiguous relay-authored frames. Rendering never advances physics.
export function createCampaignReplay(step) {
  let frame = 0, received = 0, inputs = [], events = new Map();
  return {
    reset(count) { frame = 0; received = 0; inputs = Array(count).fill(0); events.clear(); },
    accept(packet) {
      if (packet.from > received) return false;
      for (const event of packet.events || []) if (event.frame >= frame && event.frame <= packet.to) {
        events.set(event.frame, event.inputs.slice());
      }
      received = Math.max(received, packet.to);
      return true;
    },
    advance(limit = 6) {
      let count = 0;
      while (frame < received && count < limit) {
        if (events.has(frame)) { inputs = events.get(frame); events.delete(frame); }
        frame++;
        if (events.has(frame)) { inputs = events.get(frame); events.delete(frame); }
        step(inputs); count++;
      }
      return count;
    },
    get frame() { return frame; }, get received() { return received; },
  };
}
