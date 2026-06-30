// gossip-nearby — JS interface for the Capacitor plugin. The follow-alongs Desk is
// a classic-script app and reaches the plugin via window.Capacitor.Plugins.GossipNearby
// (see ../../../nearby-transport.js); this module exists for bundler-based consumers
// and for Capacitor's plugin registration formality.
import { registerPlugin } from '@capacitor/core';

export const GossipNearby = registerPlugin('GossipNearby');
