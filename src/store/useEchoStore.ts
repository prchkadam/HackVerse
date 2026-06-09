/**
 * useEchoStore — Zustand global state for EchoSight
 *
 * Holds all runtime state shared between the Navigator screen,
 * Settings screen, and the service layer.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

interface EchoState {
  // ── Persisted settings ──
  apiKey:       string;
  scanInterval: number;   // ms between frames
  volume:       number;   // 0.0 – 1.0 (reserved for future gain node)

  // ── Runtime state ──
  isScanning:         boolean;
  connectionStatus:   ConnectionStatus;
  lastDescription:    string;
  hazardWarning:      string;
  currentPan:         number;   // -1.0 … +1.0

  // ── Actions ──
  setApiKey:            (key: string) => void;
  setScanInterval:      (ms: number)  => void;
  setVolume:            (v: number)   => void;
  setIsScanning:        (v: boolean)  => void;
  setConnectionStatus:  (s: ConnectionStatus) => void;
  setLastDescription:   (text: string) => void;
  setHazardWarning:     (warning: string) => void;
  setCurrentPan:        (pan: number) => void;
  loadPersistedSettings: () => Promise<void>;
}

const STORAGE_KEY = '@echosight_settings';

export const useEchoStore = create<EchoState>((set, get) => ({
  // ── Defaults ──
  apiKey:             '',
  scanInterval:       2000,
  volume:             1.0,
  isScanning:         false,
  connectionStatus:   'disconnected',
  lastDescription:    '',
  hazardWarning:      '',
  currentPan:         0,

  // ── Actions ──
  setApiKey: (key) => {
    set({ apiKey: key });
    _persist({ apiKey: key, scanInterval: get().scanInterval, volume: get().volume });
  },

  setScanInterval: (ms) => {
    set({ scanInterval: ms });
    _persist({ apiKey: get().apiKey, scanInterval: ms, volume: get().volume });
  },

  setVolume: (v) => {
    set({ volume: v });
    _persist({ apiKey: get().apiKey, scanInterval: get().scanInterval, volume: v });
  },

  setIsScanning:       (v)    => set({ isScanning: v }),
  setConnectionStatus: (s)    => set({ connectionStatus: s }),
  setLastDescription:  (text) => set({ lastDescription: text }),
  setHazardWarning:    (w)    => set({ hazardWarning: w }),
  setCurrentPan:       (pan)  => set({ currentPan: pan }),

  loadPersistedSettings: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      set({
        apiKey:       saved.apiKey       ?? '',
        scanInterval: saved.scanInterval ?? 2000,
        volume:       saved.volume       ?? 1.0,
      });
    } catch (err) {
      console.warn('[Store] Failed to load settings:', err);
    }
  },
}));

async function _persist(data: { apiKey: string; scanInterval: number; volume: number }) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('[Store] Failed to persist settings:', err);
  }
}
