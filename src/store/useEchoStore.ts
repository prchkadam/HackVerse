/**
 * useEchoStore — Zustand global state for EchoSight
 *
 * Holds all runtime state shared between the Navigator screen,
 * Settings screen, and the service layer.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type HapticIntensity = 'low' | 'medium' | 'high';

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export type AIProvider = 'gemini' | 'featherless' | 'groq';

interface EchoState {
  // ── Persisted settings ──
  apiKey:             string;   // Gemini API key
  featherlessApiKey:  string;   // Featherless.ai API key
  groqApiKey:         string;   // Groq API key
  aiProvider:         AIProvider;
  featherlessModel:   string;   // Model ID for Featherless
  groqModel:          string;   // Model ID for Groq
  scanInterval:       number;   // ms between frames
  volume:             number;   // 0.0 – 1.0 (reserved for future gain node)
  speechRate:         number;   // TTS speech rate (0.5 – 2.0)
  useFastMode:        boolean;  // true = text + local TTS, false = Gemini native audio
  hapticEnabled:      boolean;  // Master toggle for haptic feedback
  hapticIntensity:    HapticIntensity; // Vibration strength: low / medium / high
  fallDetectionEnabled: boolean; // Toggle for accelerometer fall detection
  emergencyContactNumber: string; // SMS contact for SOS
  batterySaverEnabled: boolean; // Automatically throttle on low battery
  batteryThreshold:   number;   // Battery % at which to throttle (e.g. 0.2 for 20%)

  // ── Runtime state ──
  isScanning:         boolean;
  connectionStatus:   ConnectionStatus;
  lastDescription:    string;
  hazardWarning:      string;
  currentPan:         number;   // -1.0 … +1.0
  responseLatency:    number;   // ms of last AI response (for dev display)
  isListening:        boolean;  // true when recording voice for Q&A
  lastQuestion:       string;   // last spoken question text

  // ── Actions ──
  setApiKey:              (key: string)       => void;
  setFeatherlessApiKey:   (key: string)       => void;
  setGroqApiKey:          (key: string)       => void;
  setAIProvider:          (p: AIProvider)     => void;
  setFeatherlessModel:    (model: string)     => void;
  setGroqModel:           (model: string)     => void;
  setScanInterval:        (ms: number)        => void;
  setVolume:              (v: number)         => void;
  setSpeechRate:          (r: number)         => void;
  setUseFastMode:         (v: boolean)        => void;
  setHapticEnabled:       (v: boolean)        => void;
  setHapticIntensity:     (v: HapticIntensity) => void;
  setFallDetectionEnabled:(v: boolean)        => void;
  setEmergencyContactNumber:(v: string)       => void;
  setBatterySaverEnabled: (v: boolean)        => void;
  setBatteryThreshold:    (v: number)         => void;
  setIsScanning:          (v: boolean)        => void;
  setConnectionStatus:    (s: ConnectionStatus) => void;
  setLastDescription:     (text: string)      => void;
  setHazardWarning:       (warning: string)   => void;
  setCurrentPan:          (pan: number)       => void;
  setResponseLatency:     (ms: number)        => void;
  setIsListening:         (v: boolean)        => void;
  setLastQuestion:        (q: string)         => void;
  loadPersistedSettings:  () => Promise<void>;
}

const STORAGE_KEY = '@echosight_settings';

interface PersistedSettings {
  apiKey: string;
  featherlessApiKey: string;
  groqApiKey: string;
  aiProvider: AIProvider;
  featherlessModel: string;
  groqModel: string;
  scanInterval: number;
  volume: number;
  speechRate: number;
  useFastMode: boolean;
  hapticEnabled: boolean;
  hapticIntensity: HapticIntensity;
  fallDetectionEnabled: boolean;
  emergencyContactNumber: string;
  batterySaverEnabled: boolean;
  batteryThreshold: number;
}

function _getPersistedData(state: EchoState): PersistedSettings {
  return {
    apiKey:            state.apiKey,
    featherlessApiKey: state.featherlessApiKey,
    groqApiKey:        state.groqApiKey,
    aiProvider:        state.aiProvider,
    featherlessModel:  state.featherlessModel,
    groqModel:         state.groqModel,
    scanInterval:      state.scanInterval,
    volume:            state.volume,
    speechRate:        state.speechRate,
    useFastMode:       state.useFastMode,
    hapticEnabled:     state.hapticEnabled,
    hapticIntensity:   state.hapticIntensity,
    fallDetectionEnabled: state.fallDetectionEnabled,
    emergencyContactNumber: state.emergencyContactNumber,
    batterySaverEnabled: state.batterySaverEnabled,
    batteryThreshold:  state.batteryThreshold,
  };
}

export const useEchoStore = create<EchoState>((set, get) => ({
  // ── Defaults ──
  apiKey:             '',
  featherlessApiKey:  '',
  groqApiKey:         process.env.EXPO_PUBLIC_GROQ_API_KEY || 'YOUR_GROQ_API_KEY',
  aiProvider:         'groq',
  featherlessModel:   'Qwen/Qwen3-VL-8B-Instruct',
  groqModel:          'meta-llama/llama-4-scout-17b-16e-instruct',
  scanInterval:       2000,
  volume:             1.0,
  speechRate:         1.0,
  useFastMode:        false,
  hapticEnabled:      true,
  hapticIntensity:    'medium',
  fallDetectionEnabled: false,
  emergencyContactNumber: '',
  batterySaverEnabled: true,
  batteryThreshold:   0.20,

  // ── Runtime state ──
  isScanning:         false,
  connectionStatus:   'disconnected',
  lastDescription:    '',
  hazardWarning:      '',
  currentPan:         0,
  responseLatency:    0,
  isListening:        false,
  lastQuestion:       '',

  // ── Actions ──
  setApiKey: (key) => {
    set({ apiKey: key });
    _persist(_getPersistedData({ ...get(), apiKey: key }));
  },

  setFeatherlessApiKey: (key) => {
    set({ featherlessApiKey: key });
    _persist(_getPersistedData({ ...get(), featherlessApiKey: key }));
  },

  setGroqApiKey: (key) => {
    set({ groqApiKey: key });
    _persist(_getPersistedData({ ...get(), groqApiKey: key }));
  },

  setAIProvider: (p) => {
    set({ aiProvider: p });
    _persist(_getPersistedData({ ...get(), aiProvider: p }));
  },

  setFeatherlessModel: (model) => {
    set({ featherlessModel: model });
    _persist(_getPersistedData({ ...get(), featherlessModel: model }));
  },

  setGroqModel: (model) => {
    set({ groqModel: model });
    _persist(_getPersistedData({ ...get(), groqModel: model }));
  },

  setScanInterval: (ms) => {
    set({ scanInterval: ms });
    _persist(_getPersistedData({ ...get(), scanInterval: ms }));
  },

  setVolume: (v) => {
    set({ volume: v });
    _persist(_getPersistedData({ ...get(), volume: v }));
  },

  setSpeechRate: (r) => {
    set({ speechRate: r });
    _persist(_getPersistedData({ ...get(), speechRate: r }));
  },

  setUseFastMode: (v) => {
    set({ useFastMode: v });
    _persist(_getPersistedData({ ...get(), useFastMode: v }));
  },

  setHapticEnabled: (v) => {
    set({ hapticEnabled: v });
    _persist(_getPersistedData({ ...get(), hapticEnabled: v }));
  },

  setHapticIntensity: (v) => {
    set({ hapticIntensity: v });
    _persist(_getPersistedData({ ...get(), hapticIntensity: v }));
  },

  setFallDetectionEnabled: (v) => {
    set({ fallDetectionEnabled: v });
    _persist(_getPersistedData({ ...get(), fallDetectionEnabled: v }));
  },

  setEmergencyContactNumber: (v) => {
    set({ emergencyContactNumber: v });
    _persist(_getPersistedData({ ...get(), emergencyContactNumber: v }));
  },

  setBatterySaverEnabled: (v) => {
    set({ batterySaverEnabled: v });
    _persist(_getPersistedData({ ...get(), batterySaverEnabled: v }));
  },

  setBatteryThreshold: (v) => {
    set({ batteryThreshold: v });
    _persist(_getPersistedData({ ...get(), batteryThreshold: v }));
  },

  setIsScanning:       (v)    => set({ isScanning: v }),
  setConnectionStatus: (s)    => set({ connectionStatus: s }),
  setLastDescription:  (text) => set({ lastDescription: text }),
  setHazardWarning:    (w)    => set({ hazardWarning: w }),
  setCurrentPan:       (pan)  => set({ currentPan: pan }),
  setResponseLatency:  (ms)   => set({ responseLatency: ms }),
  setIsListening:      (v)    => set({ isListening: v }),
  setLastQuestion:     (q)    => set({ lastQuestion: q }),

  loadPersistedSettings: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      set({
        apiKey:            saved.apiKey            ?? '',
        featherlessApiKey: saved.featherlessApiKey ?? '',
        groqApiKey:        saved.groqApiKey        || process.env.EXPO_PUBLIC_GROQ_API_KEY || 'YOUR_GROQ_API_KEY',
        aiProvider:        saved.aiProvider        ?? 'groq',
        featherlessModel:  saved.featherlessModel  ?? 'Qwen/Qwen3-VL-8B-Instruct',
        groqModel:         saved.groqModel         ?? 'meta-llama/llama-4-scout-17b-16e-instruct',
        scanInterval:      saved.scanInterval      ?? 2000,
        volume:            saved.volume            ?? 1.0,
        speechRate:        saved.speechRate        ?? 1.0,
        useFastMode:       saved.useFastMode       ?? false,
        hapticEnabled:     saved.hapticEnabled     ?? true,
        hapticIntensity:   saved.hapticIntensity   ?? 'medium',
        fallDetectionEnabled: saved.fallDetectionEnabled ?? false,
        emergencyContactNumber: saved.emergencyContactNumber ?? '',
        batterySaverEnabled: saved.batterySaverEnabled ?? true,
        batteryThreshold:  saved.batteryThreshold  ?? 0.20,
      });
    } catch (err) {
      console.warn('[Store] Failed to load settings:', err);
    }
  },
}));

async function _persist(data: PersistedSettings) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('[Store] Failed to persist settings:', err);
  }
}
