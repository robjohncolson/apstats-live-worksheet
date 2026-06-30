// secure-key-store — JS interface for the Capacitor plugin. The teacher app reaches
// it via window.SecureKeyStore (see ../../../secure-key.js); this exists for
// bundler-based consumers + Capacitor plugin registration.
import { registerPlugin } from '@capacitor/core';

export const SecureKeyStore = registerPlugin('SecureKeyStore');
