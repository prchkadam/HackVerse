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
  apiKey:             string;
  scanInterval:       number;   // ms between frames
  volume:             number;   // 0.0 – 1.0 (reserved for future gain node)
  voiceSpeed:         'Slow' | 'Normal' | 'Fast';
  voiceVolume:        number;   // 0.0 - 1.0
  guidanceFrequency:  'Low' | 'Medium' | 'High';
  themeMode:          'Light' | 'Dark';
  emergencyContact:   string;

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
  setVoiceSpeed:        (speed: 'Slow' | 'Normal' | 'Fast') => void;
  setVoiceVolume:       (v: number)   => void;
  setGuidanceFrequency: (freq: 'Low' | 'Medium' | 'High') => void;
  setThemeMode:         (mode: 'Light' | 'Dark') => void;
  setEmergencyContact:  (contact: string) => void;
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
  voiceSpeed:         'Normal',
  voiceVolume:        0.8,
  guidanceFrequency:  'Medium',
  themeMode:          'Dark',
  emergencyContact:   '+1 (555) 019-9911',

  isScanning:         false,
  connectionStatus:   'disconnected',
  lastDescription:    '',
  hazardWarning:      '',
  currentPan:         0,

  // ── Actions ──
  setApiKey: (key) => {
    set({ apiKey: key });
    _saveSettings(get());
  },

  setScanInterval: (ms) => {
    set({ scanInterval: ms });
    _saveSettings(get());
  },

  setVolume: (v) => {
    set({ volume: v });
    _saveSettings(get());
  },

  setVoiceSpeed: (speed) => {
    set({ voiceSpeed: speed });
    _saveSettings(get());
  },

  setVoiceVolume: (v) => {
    set({ voiceVolume: v });
    _saveSettings(get());
  },

  setGuidanceFrequency: (freq) => {
    set({ guidanceFrequency: freq });
    _saveSettings(get());
  },

  setThemeMode: (mode) => {
    set({ themeMode: mode });
    _saveSettings(get());
  },

  setEmergencyContact: (contact) => {
    set({ emergencyContact: contact });
    _saveSettings(get());
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
        apiKey:             saved.apiKey             ?? '',
        scanInterval:       saved.scanInterval       ?? 2000,
        volume:             saved.volume             ?? 1.0,
        voiceSpeed:         saved.voiceSpeed         ?? 'Normal',
        voiceVolume:        saved.voiceVolume        ?? 0.8,
        guidanceFrequency:  saved.guidanceFrequency  ?? 'Medium',
        themeMode:          saved.themeMode          ?? 'Dark',
        emergencyContact:   saved.emergencyContact   ?? '+1 (555) 019-9911',
      });
    } catch (err) {
      console.warn('[Store] Failed to load settings:', err);
    }
  },
}));

// Internal helper to serialize and persist settings state
function _saveSettings(state: EchoState) {
  const dataToSave = {
    apiKey:             state.apiKey,
    scanInterval:       state.scanInterval,
    volume:             state.volume,
    voiceSpeed:         state.voiceSpeed,
    voiceVolume:        state.voiceVolume,
    guidanceFrequency:  state.guidanceFrequency,
    themeMode:          state.themeMode,
    emergencyContact:   state.emergencyContact,
  };
  _persist(dataToSave);
}

async function _persist(data: Record<string, any>) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('[Store] Failed to persist settings:', err);
  }
}
