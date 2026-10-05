// Presence is renewed once a second; motion still travels at up to 10 Hz.
// Only successful writes consume an update, so backpressure cannot lose changes.
export function createUpdateGate({ now = () => performance.now(), interval = 100, heartbeat = 1000 } = {}) {
  const sent = new Map();
  return {
    publish(key, value, transmit, continuous = false) {
      const time = now(), previous = sent.get(key), fingerprint = JSON.stringify(value);
      if (previous && time - previous.at < interval) return false;
      if (previous && !continuous && previous.fingerprint === fingerprint && time - previous.at < heartbeat) return false;
      if (!transmit(value)) return false;
      sent.set(key, { at: time, fingerprint });
      return true;
    },
    reset() { sent.clear(); },
  };
}
