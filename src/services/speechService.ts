/**
 * SpeechService — Text-to-Speech service
 * Gracefully handles missing native module (e.g., running in Expo Go without dev build)
 * Falls back to console.log when expo-speech is unavailable.
 */

let Speech: typeof import('expo-speech') | null = null;
let isNativeModuleAvailable = false;
let initializationError: any = null;

console.log('[Speech] Diagnostic: Attempting to require("expo-speech")...');
try {
  Speech = require('expo-speech');
  if (Speech) {
    isNativeModuleAvailable = true;
    console.log('[Speech] Diagnostic: require("expo-speech") resolved successfully.');
    console.log('[Speech] Diagnostic: Available exports:', Object.keys(Speech));
    console.log('[Speech] Diagnostic: Native module registration status: REGISTERED');
  } else {
    console.warn('[Speech] Diagnostic: require("expo-speech") returned a falsy value.');
  }
} catch (e: any) {
  initializationError = e;
  console.warn('[Speech] Diagnostic: Failed to require("expo-speech"). Native module is likely missing.');
  console.warn('[Speech] Diagnostic: Error details:', e.message || e);
  if (e.stack) {
    console.warn('[Speech] Diagnostic: Error stack:', e.stack);
  }
  console.log('[Speech] Diagnostic: Native module registration status: UNREGISTERED / MISSING');
}

// Lazy import to avoid circular dependency crash at module load time
let _getStore: (() => typeof import('../store/useEchoStore').useEchoStore) | null = null;
function getStore() {
  if (!_getStore) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../store/useEchoStore');
    _getStore = () => mod.useEchoStore;
  }
  return _getStore();
}

export const speechService = {
  /** Speak a given text using store configurations */
  async speak(text: string): Promise<void> {
    try {
      if (!Speech) {
        // console.log(`[Speech] (no native module) Would speak: "${text}"`);
        console.log("Speech object:", Speech);
console.log("Speaking:", text);
        return;
      }

      // Stop any current speech
      await Speech.stop();

      const store = getStore();
      const { voiceSpeed, voiceVolume } = store.getState();

      // Map voiceSpeed to rate (0.0 to 2.0)
      let rate = 1.0;
      if (voiceSpeed === 'Slow') rate = 0.7;
      if (voiceSpeed === 'Fast') rate = 1.3;

      Speech.speak(text, {
        rate,
        volume: voiceVolume ?? 0.8,
        pitch: 1.0,
      });
    } catch (err) {
      console.warn('[Speech] Error speaking:', err);
    }
  },

  /** Stop active speech */
  async stop(): Promise<void> {
    try {
      if (!Speech) return;
      await Speech.stop();
    } catch (err) {
      console.warn('[Speech] Error stopping speech:', err);
    }
  },
};

// Also export as a standalone function for screens that import `speak` directly
export const speak = speechService.speak.bind(speechService);
