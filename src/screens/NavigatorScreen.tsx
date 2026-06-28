/**
 * NavigatorScreen — EchoSight's main interface (VisionCamera v5)
 *
 * Supports dual AI providers:
 *   - Gemini (WebSocket, native audio OR text-only + TTS)
 *   - Featherless.ai (REST, text + TTS)
 *
 * Gesture contract:
 *   • Single tap → start scanning (if stopped)
 *   • Double tap → pause scanning
 *   • Long press → open settings
 */

import React, {
  useCallback,
  useEffect,
  useRef,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  AccessibilityInfo,
  Vibration,
  Animated,
  Dimensions,
  PanResponder,
  PermissionsAndroid,
  AppState,
} from 'react-native';
import * as Location from 'expo-location';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCameraFormat,
} from 'react-native-vision-camera';
import { useRouter } from 'expo-router';

import { useEchoStore }            from '../store/useEchoStore';
import { geminiService }           from '../services/GeminiLiveService';
import { spatialAudio }            from '../services/SpatialAudioService';
import { cameraService }           from '../services/CameraService';
import { motionService, OrientationSnapshot } from '../services/MotionService';
import { featherlessService }      from '../services/FeatherlessVisionService';
import { groqService }             from '../services/GroqVisionService';
import { ttsService }              from '../services/TTSService';
import { hapticService }           from '../services/HapticService';
import { voiceInputService }       from '../services/VoiceInputService';
import { fallDetectionService }    from '../services/FallDetectionService';
import { emergencyService }        from '../services/EmergencyService';
import { batteryService }          from '../services/BatteryService';
import * as FileSystem             from 'expo-file-system/legacy';
import * as ImageManipulator       from 'expo-image-manipulator';
import NetInfo                     from '@react-native-community/netinfo';
import { useTensorflowModel }      from 'react-native-fast-tflite';
import { useFrameProcessor }       from 'react-native-vision-camera';
import { useSharedValue, runOnJS } from 'react-native-reanimated';
import { NitroModules }            from 'react-native-nitro-modules';
import { useResizePlugin }         from 'vision-camera-resize-plugin';
import { offlineOcrService }       from '../services/OfflineOcrService';
import { COCO_LABELS }             from '../utils/cocoLabels';

const TFLITE_MODEL = require('../../assets/models/efficientdet_lite0.tflite');

const { height: SH } = Dimensions.get('window');

const STATUS_CONFIG = {
  disconnected: { color: '#7070aa', label: 'Tap to start',      dot: '#7070aa' },
  connecting:   { color: '#ffb300', label: 'Connecting…',       dot: '#ffb300' },
  connected:    { color: '#00e5ff', label: 'Scanning',          dot: '#00e5ff' },
  error:        { color: '#ff3d71', label: 'Error — tap retry', dot: '#ff3d71' },
} as const;

// ─── Helper for dual voice announcements ──────────────────────────────────────
const announce = (text: string, interrupt: boolean = true) => {
  AccessibilityInfo.announceForAccessibility(text);
  if (interrupt) {
    ttsService.stop();
  }
  ttsService.speak(text, 'normal');
};

const numberToWord = (num: number): string => {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  return words[num] || num.toString();
};

export function NavigatorScreen() {
  const router    = useRouter();
  const dotAnim   = React.useMemo(() => new Animated.Value(1), []);
  const lastTap   = useRef<number>(0);
  const tapTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapCount  = useRef<number>(0);

  const {
    apiKey,
    featherlessApiKey,
    groqApiKey,
    aiProvider,
    featherlessModel,
    groqModel,
    scanInterval,
    speechRate,
    useFastMode,
    isScanning,
    connectionStatus,
    lastDescription,
    hazardWarning,
    responseLatency,
    hapticEnabled,
    hapticIntensity,
    fallDetectionEnabled,
    emergencyContactNumber,
    batterySaverEnabled,
    batteryThreshold,
    isListening,
    lastQuestion,
    setIsScanning,
    setConnectionStatus,
    setLastDescription,
    setHazardWarning,
    setCurrentPan,
    setResponseLatency,
    setIsListening,
    setLastQuestion,
    loadPersistedSettings,
    setScanInterval,
    setUseFastMode,
  } = useEchoStore();

  // ── Special modes (Reading / Detailed Scan) ───────────────────────────────
  const [specialMode, setSpecialMode] = React.useState<'none' | 'detailed' | 'ocr'>('none');
  const specialModeRef = useRef<'none' | 'detailed' | 'ocr'>('none');

  // Note counter state & refs
  const [noteCount, setNoteCount] = React.useState<number>(0);
  const [currencyTotals, setCurrencyTotals] = React.useState<Record<string, number>>({});
  const [scannedNotesHistory, setScannedNotesHistory] = React.useState<Array<{ value: number; currency: string }>>([]);
  const noteCountRef = useRef<number>(0);
  const currencyTotalsRef = useRef<Record<string, number>>({});
  const historyRef = useRef<Array<{ value: number; currency: string }>>([]);

  // Fall detection countdown state
  const [showFallBanner, setShowFallBanner] = React.useState<boolean>(false);
  const [isSilenced, setIsSilenced] = React.useState<boolean>(false);
  const fallTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Offline mode state
  const [isOffline, setIsOffline] = React.useState(false);

  // Motion-adaptive scanning state & refs
  const staticTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isThrottledRef = useRef<boolean>(false);

  // ── VisionCamera v4 hooks (Skipped on Web) ─────────────────────────────────
  const isWeb = Platform.OS === 'web';
  
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { hasPermission, requestPermission } = isWeb ? { hasPermission: true, requestPermission: async () => true } : useCameraPermission();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const deviceRaw = useCameraDevice('back');
  const device = React.useMemo(() => isWeb ? { id: 'mock' } as any : deviceRaw, [isWeb, deviceRaw]);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const format = isWeb ? undefined : useCameraFormat(device, [
    { videoResolution: { width: 1280, height: 720 } },
    { fps: 30 }
  ]);
  const cameraRef = useRef<Camera>(null) as React.RefObject<Camera>;

  // ── AppState tracker for Camera (Prevents background camera crashes) ────────
  const [appState, setAppState] = React.useState(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => setAppState(next));
    return () => sub.remove();
  }, []);

  // ── Network State Listener ──────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const offline = state.isConnected === false;
      if (offline && !isOffline) {
        ttsService.speak('Connection lost. Switching to offline mode.', 'normal');
      } else if (!offline && isOffline) {
        ttsService.speak('Connection restored. Online mode activated.', 'normal');
      }
      setIsOffline(offline);
    });
    return () => unsubscribe();
  }, [isOffline]);

  // ── Offline Object Detection (TFLite Frame Processor) ─────────────────────
  const objectDetectionPlugin = useTensorflowModel(TFLITE_MODEL, []);
  const model = objectDetectionPlugin.state === 'loaded' ? objectDetectionPlugin.model : undefined;
  
  const boxedModel = React.useMemo(
    () => (model != null ? NitroModules.box(model) : undefined),
    [model]
  );
  const { resize } = useResizePlugin();

  const lastAnnouncedTime = useSharedValue(0);

  const handleDetectedObjects = useCallback((detectedIndices: number[]) => {
    const unique = Array.from(new Set(detectedIndices));
    const labels = unique.map(i => COCO_LABELS[i]).filter(Boolean);
    if (labels.length > 0) {
      console.log('[OfflineDetection] Speaking:', labels.join(', '));
      ttsService.stop();
      ttsService.speak(`Detected: ${labels.join(', ')}`, 'normal');
    }
  }, []);

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    if (!isOffline || !isScanning || boxedModel == null) return;

    const tflite = boxedModel.unbox();

    // 1. Resize Frame to 320x320x3 for EfficientDet_lite0
    const resized = resize(frame, {
      scale: { width: 320, height: 320 },
      pixelFormat: 'rgb',
      dataType: 'uint8',
    });

    // Avoid copying the buffer if it is already aligned
    const inputBuffer = (resized.byteOffset === 0 && resized.byteLength === resized.buffer.byteLength)
      ? resized.buffer
      : resized.buffer.slice(resized.byteOffset, resized.byteOffset + resized.byteLength);

    // EfficientDet outputs: [boxes, classes, scores, num_detections]
    const outputs = tflite.runSync([inputBuffer as ArrayBuffer]);
    if (outputs && outputs.length >= 4) {
      const scores = new Float32Array(outputs[2]!);
      const classes = new Float32Array(outputs[1]!);
      const numDetectionsArray = new Float32Array(outputs[3]!);
      
      if (numDetectionsArray && numDetectionsArray.length > 0) {
        const numDetections = numDetectionsArray[0];
        const detected = [];
        for (let i = 0; i < numDetections; i++) {
          if (scores[i] > 0.40) {
            let classIdx = Math.round(classes[i]);
            // If out of bounds or 1-indexed, shift down
            if (!COCO_LABELS[classIdx] && COCO_LABELS[classIdx - 1]) {
              classIdx = classIdx - 1;
            }
            detected.push(classIdx);
          }
        }

        const now = Date.now();
        // Throttle to every 3 seconds to avoid spamming the user
        if (detected.length > 0 && now - lastAnnouncedTime.value > 2000) {
          lastAnnouncedTime.value = now;
          runOnJS(handleDetectedObjects)(detected);
        }
      }
    }
  }, [boxedModel, isOffline, isScanning, handleDetectedObjects, resize, lastAnnouncedTime]);

  // ── Initialization ──────────────────────────────────────────────────────────


  // ── Load persisted settings + request permissions on mount ────────────────
  useEffect(() => {
    const requestAllPermissions = async () => {
      if (isWeb) return;

      // 1. Camera
      if (!hasPermission) {
        await requestPermission();
      }

      // 2. Microphone
      await requestRecordingPermissionsAsync();

      // 3. Location
      await Location.requestForegroundPermissionsAsync();

      // 4. Android SOS Background Permissions
      if (Platform.OS === 'android') {
        try {
          await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.CALL_PHONE,
            PermissionsAndroid.PERMISSIONS.SEND_SMS,
          ]);
        } catch (e) {
          console.warn('[Permissions] Failed to request Android SOS permissions:', e);
        }
      }
    };

    loadPersistedSettings().then(() => {
      requestAllPermissions();
    });
  }, [hasPermission, isWeb, loadPersistedSettings, requestPermission]);

  // ── Welcome Introduction ──────────────────────────────────────────────────
  const hasSpokenWelcome = useRef(false);
  useEffect(() => {
    if (!hasSpokenWelcome.current) {
      hasSpokenWelcome.current = true;
      const welcomeText = "Welcome to EchoSight. Tap once to start or pause scanning. Double tap to stop. Triple tap to ask a question. Swipe up for a detailed description. Swipe down to read text. Long press for settings.";
      
      // Delay slightly so TTS engine is ready and user is fully in the app
      setTimeout(() => {
        ttsService.speak(welcomeText, 'normal');
        announce(welcomeText);
      }, 1500);
    }
  }, []);

  // ── Sync TTS speech rate ──────────────────────────────────────────────────
  useEffect(() => {
    ttsService.setRate(speechRate);
  }, [speechRate]);

  // ── Sync haptic intensity setting ─────────────────────────────────────────
  useEffect(() => {
    hapticService.enabled = hapticEnabled;
    hapticService.intensity = hapticIntensity;
  }, [hapticEnabled, hapticIntensity]);

  // ── Pulsing dot animation while connected ─────────────────────────────────
  useEffect(() => {
    if (connectionStatus === 'connected') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(dotAnim, { toValue: 0.3, duration: 700, useNativeDriver: true }),
          Animated.timing(dotAnim, { toValue: 1.0, duration: 700, useNativeDriver: true }),
        ]),
      ).start();
    } else {
      dotAnim.setValue(1);
    }
  }, [connectionStatus, dotAnim]);

  // ── Banknote detection and counting (JSON summary parser) ──────────────
  const handleBanknoteDetection = useCallback((rawText: string): string => {
    // Look for the NOTES: {...} JSON line
    const notesIndex = rawText.toUpperCase().indexOf('NOTES:');
    let jsonStr = '';
    let notesMatchStr = '';

    if (notesIndex !== -1) {
      const jsonStart = rawText.indexOf('{', notesIndex);
      if (jsonStart !== -1) {
        let braceCount = 0;
        let jsonEnd = -1;
        for (let i = jsonStart; i < rawText.length; i++) {
          if (rawText[i] === '{') braceCount++;
          else if (rawText[i] === '}') {
            braceCount--;
            if (braceCount === 0) {
              jsonEnd = i;
              break;
            }
          }
        }
        if (jsonEnd !== -1) {
          jsonStr = rawText.substring(jsonStart, jsonEnd + 1);
          notesMatchStr = rawText.substring(notesIndex, jsonEnd + 1);
        }
      }
    }

    if (!jsonStr) {
      return rawText;
    }

    // Parse the JSON summary
    let summary: { total_bills: number; bills: Array<{ denomination: number; currency: string; count: number }> };
    try {
      summary = JSON.parse(jsonStr);
    } catch {
      console.warn('[BanknoteDetection] Failed to parse NOTES JSON:', jsonStr);
      return rawText;
    }

    if (!summary.bills || !Array.isArray(summary.bills) || summary.bills.length === 0) {
      let restOfText = rawText.replace(notesMatchStr, '').trim();
      return restOfText || 'No text detected';
    }

    // 1. Build current frame notes from the AI's summary
    const currentFrameNotes: Array<{ value: number; currency: string }> = [];
    const newTotals = { ...currencyTotalsRef.current };

    for (const bill of summary.bills) {
      // Standardize currency name
      let currency = bill.currency;
      const currencyLower = currency.toLowerCase();
      if (currencyLower.startsWith('rupee') || currencyLower === 'rs' || currencyLower === 'inr') {
        currency = 'Rupees';
      } else if (currencyLower.startsWith('dollar') || currencyLower === 'usd') {
        currency = 'Dollars';
      } else if (currencyLower.startsWith('euro') || currencyLower === 'eur') {
        currency = 'Euros';
      } else if (currencyLower.startsWith('pound') || currencyLower === 'gbp') {
        currency = 'Pounds';
      } else {
        currency = currency
          .split(' ')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ');
      }

      const count = bill.count || 1;
      for (let i = 0; i < count; i++) {
        currentFrameNotes.push({ value: bill.denomination, currency });
        newTotals[currency] = (newTotals[currency] || 0) + bill.denomination;
        noteCountRef.current += 1;
      }
    }

    // Save states (Cumulative memory)
    const newHistory = [...historyRef.current, ...currentFrameNotes];
    historyRef.current = newHistory;
    currencyTotalsRef.current = newTotals;
    setNoteCount(noteCountRef.current);
    setCurrencyTotals(newTotals);
    setScannedNotesHistory(newHistory);

    // Build TTS announcement: count → total → per-note description
    const totalsStr = Object.entries(newTotals)
      .filter(([, tot]) => tot > 0)
      .map(([curr, tot]) => `${tot} ${curr}`)
      .join(' and ') || '0';

    // Build per-denomination description (e.g. "2 five hundred Rupee notes, 1 one hundred Rupee note")
    const denomDescriptions: string[] = [];
    const currGroupedForDesc: Record<string, number> = {};
    currentFrameNotes.forEach(n => {
      const key = `${n.value}_${n.currency}`;
      currGroupedForDesc[key] = (currGroupedForDesc[key] || 0) + 1;
    });
    Object.entries(currGroupedForDesc).forEach(([key, count]) => {
      const [valueStr, currency] = key.split('_');
      const noteSuffix = count === 1 ? 'note' : 'notes';
      const countWord = numberToWord(count);
      denomDescriptions.push(`${countWord} ${noteSuffix} of ${valueStr} ${currency}`);
    });

    let announcement = `Added ${denomDescriptions.join(', ')}. Total amount is ${totalsStr}.`;

    return announcement;
  }, []);

  // ── Hazard detection from text ────────────────────────────────────────────
  const processDescription = useCallback((text: string) => {
    setLastDescription(text);
    const lower = text.toLowerCase();
    const isHazard = ['stop', 'danger', 'hazard', 'careful', 'warning',
                       'stairs', 'traffic', 'car', 'urgent'].some(w => lower.includes(w));

    // Trigger haptic feedback from AI description text
    if (hapticEnabled) {
      if (isHazard) {
        hapticService.triggerHazard();
      } else {
        hapticService.triggerFromDescription(text);
      }
    }

    if (isHazard) {
      setHazardWarning(text);
      Vibration.vibrate([0, 200, 100, 200]);
      ttsService.speak(text, 'hazard');
      setTimeout(() => setHazardWarning(''), 4000);
    }
  }, [hapticEnabled, setHazardWarning, setLastDescription]);

  // ── Wire Gemini callbacks ─────────────────────────────────────────────────
  useEffect(() => {
    geminiService.onStatusChange = (status) => {
      setConnectionStatus(status);
    };

    geminiService.onTranscript = (_text) => {
      // REST mode: transcript is handled by onTextResponse to avoid double processing
    };
    geminiService.onTextResponse = (text) => {
      // REST mode — process hazards + speak text via device TTS
      if (aiProvider === 'gemini') {
        if (latestSnapshotRef.current && motionService.hasMovedSignificantly(latestSnapshotRef.current)) {
          console.log('[Motion] Discarding stale Gemini frame due to rotation drift');
          return;
        }
        let processedText = text;
        if (specialModeRef.current === 'ocr') {
          processedText = handleBanknoteDetection(text);
        }
        processDescription(processedText);
        ttsService.speak(processedText, 'normal');
      }
    };

    geminiService.onAudioChunk = async ({ pcmBase64, pan }) => {
      // No-op for REST mode (kept for interface compatibility)
      if (aiProvider === 'gemini' && !useFastMode) {
        setCurrentPan(pan);
        await spatialAudio.playPcmChunk(pcmBase64, pan);
      }
    };

    // TTS pan change callback
    ttsService.onPanChange = (pan) => {
      setCurrentPan(pan);
    };

    return () => {
      geminiService.onStatusChange  = () => {};
      geminiService.onTranscript    = () => {};
      geminiService.onTextResponse  = () => {};
      geminiService.onAudioChunk    = () => {};
      ttsService.onPanChange        = () => {};
    };
  }, [aiProvider, useFastMode, processDescription, setConnectionStatus, setCurrentPan, handleBanknoteDetection]);

  const cancelFallCountdown = useCallback(() => {
    if (fallTimer.current) {
      clearInterval(fallTimer.current);
      fallTimer.current = null;
    }
    setShowFallBanner(false);
    fallDetectionService.resetCooldown();
    ttsService.speak('Emergency cancelled.', 'normal');
    announce('Emergency SOS cancelled.');
  }, []);

  const triggerEmergencySOS = useCallback(async () => {
    ttsService.speak('Sending emergency message now.', 'hazard');
    Vibration.vibrate([0, 1000, 500, 1000]);
    
    const result = await emergencyService.sendSOS({
      contactNumber: emergencyContactNumber,
      contactName: 'Emergency Contact',
    });
    
    if (result.success) {
      ttsService.speak('Message sent successfully.', 'normal');
    } else {
      ttsService.speak('Failed to send message. Please seek help immediately.', 'hazard');
    }
  }, [emergencyContactNumber]);

  // ── Fall Detection Lifecycle & SOS Handler ─────────────────────────────
  useEffect(() => {
    if (fallDetectionEnabled) {
      fallDetectionService.start();
    } else {
      fallDetectionService.stop();
      if (fallTimer.current) {
        clearInterval(fallTimer.current);
        fallTimer.current = null;
      }
      setShowFallBanner(false);
    }

    fallDetectionService.onFallDetected = () => {
      // Avoid restarting if one is somehow active
      if (fallTimer.current) {
        clearInterval(fallTimer.current);
        fallTimer.current = null;
      }
      
      setShowFallBanner(true);
      ttsService.speak('Fall detected. Sending emergency message.', 'hazard');
      Vibration.vibrate([0, 500, 200, 500]);
      
      // Trigger SOS instantly for maximum speed
      triggerEmergencySOS();
      
      // Hide the banner after 4 seconds
      setTimeout(() => {
        setShowFallBanner(false);
      }, 4000);
    };

    return () => {
      fallDetectionService.stop();
      if (fallTimer.current) {
        clearInterval(fallTimer.current);
        fallTimer.current = null;
      }
    };
  }, [fallDetectionEnabled, triggerEmergencySOS]);

  // ── Battery Optimization Handler ──────────────────────────────────────────
  useEffect(() => {
    if (batterySaverEnabled) {
      batteryService.start(batteryThreshold);
      batteryService.onLowBattery = (level) => {
        const pct = (level * 100).toFixed(0);
        ttsService.speak(`Low battery at ${pct}%. Entering battery saver mode.`, 'hazard');
        Vibration.vibrate([0, 300, 100, 300]);
        
        // Optimize settings: throttle scanning to 2 seconds and enforce text-only mode (FastMode)
        setScanInterval(2000);
        setUseFastMode(true);
      };
    } else {
      batteryService.stop();
    }

    return () => {
      batteryService.stop();
    };
  }, [batterySaverEnabled, batteryThreshold, setScanInterval, setUseFastMode]);

  const latestSnapshotRef = useRef<OrientationSnapshot | null>(null);

  // ── Featherless frame handler ─────────────────────────────────────────────
  const handleFeatherlessFrame = useCallback(async (base64Jpeg: string, snapshot: OrientationSnapshot) => {
    const startTime = Date.now();
    const text = await featherlessService.analyzeFrame(base64Jpeg);
    if (text) {
      if (motionService.hasMovedSignificantly(snapshot)) {
        console.log('[Motion] Discarding stale Featherless frame due to rotation drift');
        return;
      }
      const elapsed = Date.now() - startTime;
      setResponseLatency(elapsed);
      processDescription(text);
      ttsService.speak(text, 'normal');
    }
  }, [processDescription, setResponseLatency]);

  // ── Groq frame handler ─────────────────────────────────────────────
  const handleGroqFrame = useCallback(async (base64Jpeg: string, snapshot: OrientationSnapshot) => {
    const startTime = Date.now();
    const text = await groqService.analyzeFrame(base64Jpeg);
    if (text) {
      if (motionService.hasMovedSignificantly(snapshot)) {
        console.log('[Motion] Discarding stale Groq frame due to rotation drift');
        return;
      }
      const elapsed = Date.now() - startTime;
      setResponseLatency(elapsed);
      processDescription(text);
      ttsService.speak(text, 'normal');
    }
  }, [processDescription, setResponseLatency]);

  const startCameraScan = useCallback((interval: number) => {
    const state = motionStateRef.current;
    if (state.provider === 'gemini') {
      cameraService.start(cameraRef, interval, (base64Jpeg) => {
        if (specialModeRef.current !== 'none') return;
        latestSnapshotRef.current = motionService.getSnapshot();
        geminiService.sendFrame(base64Jpeg);
      });
    } else if (state.provider === 'groq') {
      cameraService.start(cameraRef, interval, (base64Jpeg) => {
        if (specialModeRef.current !== 'none') return;
        const snapshot = motionService.getSnapshot();
        handleGroqFrame(base64Jpeg, snapshot);
      });
    } else {
      cameraService.start(cameraRef, interval, (base64Jpeg) => {
        if (specialModeRef.current !== 'none') return;
        const snapshot = motionService.getSnapshot();
        handleFeatherlessFrame(base64Jpeg, snapshot);
      });
    }
  }, [handleGroqFrame, handleFeatherlessFrame]);

  const resumeBackgroundScanning = useCallback(() => {
    setSpecialMode('none');
    specialModeRef.current = 'none';
    if (isScanning && connectionStatus === 'connected') {
      console.log('[Camera] Resuming background scanning...');
      startCameraScan(scanInterval);
    }
  }, [isScanning, connectionStatus, scanInterval, startCameraScan]);

  // ── Start scanning ────────────────────────────────────────────────────────
  const startScanning = useCallback(async () => {
    // Reset note counter on scan start
    noteCountRef.current = 0;
    currencyTotalsRef.current = {};
    historyRef.current = [];
    setNoteCount(0);
    setCurrencyTotals({});
    setScannedNotesHistory([]);

    const activeKey = aiProvider === 'gemini' ? apiKey : (aiProvider === 'groq' ? groqApiKey : featherlessApiKey);
    
    if (!activeKey) {
      announce(
        `No API key set for ${aiProvider === 'gemini' ? 'Gemini' : (aiProvider === 'groq' ? 'Groq' : 'Featherless')}. Opening settings.`,
      );
      router.push('/settings');
      return;
    }
    if (!device || (!hasPermission && !isWeb)) {
      announce('Camera not available.');
      return;
    }

    setIsScanning(true);
    setIsSilenced(false);
    announce(
      `EchoSight started with ${aiProvider === 'gemini' ? 'Gemini' : (aiProvider === 'groq' ? 'Groq' : 'Featherless AI')}. ${aiProvider === 'gemini' ? 'Connecting…' : 'Ready.'}`,
    );
    Vibration.vibrate(80);

    try {
      if (aiProvider === 'gemini') {
        // ── Gemini path ──
        geminiService.textOnlyMode = useFastMode;
        console.log(`[EchoSight] Connecting to Gemini (${useFastMode ? 'text-only/fast' : 'native audio'})...`);
        await geminiService.connect(apiKey);
        console.log('[EchoSight] Connected! Starting camera capture...');
        startCameraScan(scanInterval);
      } else if (aiProvider === 'groq') {
        // ── Groq path ──
        groqService.setApiKey(groqApiKey);
        groqService.setModel(groqModel);
        setConnectionStatus('connected');
        console.log(`[EchoSight] Groq ready (${groqModel}). Starting camera...`);
        startCameraScan(scanInterval);
      } else {
        // ── Featherless path ──
        featherlessService.setApiKey(featherlessApiKey);
        featherlessService.setModel(featherlessModel);
        setConnectionStatus('connected');
        console.log(`[EchoSight] Featherless ready (${featherlessModel}). Starting camera...`);
        startCameraScan(scanInterval);
      }

      console.log('[EchoSight] Camera capture started');
      announce(
        'Connected. Scanning your environment.',
      );
    } catch (err: any) {
      console.warn('[EchoSight] Failed to connect:', err?.message || err);
      cameraService.stop();
      motionService.stop();
      setIsScanning(false);
      setConnectionStatus('error');
      announce(
        'Failed to connect. Check your API key and network. Tap to retry.',
      );
    }
  }, [apiKey, featherlessApiKey, groqApiKey, aiProvider, featherlessModel, groqModel, device, hasPermission, scanInterval, useFastMode, handleFeatherlessFrame, handleGroqFrame, isWeb, router, setConnectionStatus, setIsScanning]);

  // ── Stop scanning ─────────────────────────────────────────────────────────
  const stopScanning = useCallback((silent: boolean = false) => {
    if (staticTimeoutRef.current) {
      clearTimeout(staticTimeoutRef.current);
      staticTimeoutRef.current = null;
    }
    isThrottledRef.current = false;

    // Reset note counter on scan stop
    noteCountRef.current = 0;
    currencyTotalsRef.current = {};
    historyRef.current = [];
    setNoteCount(0);
    setCurrencyTotals({});
    setScannedNotesHistory([]);

    cameraService.stop();
    motionService.stop();
    geminiService.disconnect();
    featherlessService.cancel();
    groqService.cancel();
    spatialAudio.stop();
    ttsService.stop();
    setIsScanning(false);
    setLastDescription('');
    setHazardWarning('');
    setResponseLatency(0);
    setIsSilenced(silent);
    announce(silent ? 'EchoSight fully stopped.' : 'EchoSight paused.');
    Vibration.vibrate(40);
  }, [setHazardWarning, setIsScanning, setLastDescription, setResponseLatency]);

  // ── Motion cancellation & Predictive Capture listener ───────────────────────
  const motionStateRef = useRef({
    provider: aiProvider,
    interval: scanInterval,
    groq: handleGroqFrame,
    featherless: handleFeatherlessFrame,
    status: connectionStatus,
  });

  useEffect(() => {
    motionStateRef.current = {
      provider: aiProvider,
      interval: scanInterval,
      groq: handleGroqFrame,
      featherless: handleFeatherlessFrame,
      status: connectionStatus,
    };
  }, [aiProvider, scanInterval, handleGroqFrame, handleFeatherlessFrame, connectionStatus]);

  useEffect(() => {
    if (isScanning) {
      motionService.start();
    } else {
      motionService.stop();
    }

    return () => {
      motionService.stop();
    };
  }, [isScanning]);

  useEffect(() => {
    motionService.onMovementStart = () => {
      console.log('[Motion] Movement started! Cancelling in-flight requests.');
      if (staticTimeoutRef.current) {
        clearTimeout(staticTimeoutRef.current);
        staticTimeoutRef.current = null;
      }

      if (isThrottledRef.current) {
        isThrottledRef.current = false;
        console.log('[Motion] Resuming normal scanning rate:', motionStateRef.current.interval, 'ms');
        const state = motionStateRef.current;
        if (state.status === 'connected' && specialModeRef.current === 'none') {
          startCameraScan(state.interval);
        }
      }

      if (specialModeRef.current === 'none') {
        featherlessService.cancel();
        groqService.cancel();
      }
    };

    motionService.onMovementStopped = () => {
      console.log('[Motion] Movement settled! Forcing predictive capture.');
      const state = motionStateRef.current;

      // Set static timeout of 10s. If we remain stationary, throttle scan rate.
      if (staticTimeoutRef.current) {
        clearTimeout(staticTimeoutRef.current);
      }
      staticTimeoutRef.current = setTimeout(() => {
        const currentState = motionStateRef.current;
        if (specialModeRef.current === 'none' && currentState.status === 'connected') {
          console.log('[Motion] Long static period detected (10s idle). Throttling scanning to 10s.');
          isThrottledRef.current = true;
          startCameraScan(10000);
        }
      }, 10000);

      if (specialModeRef.current === 'none' && state.status === 'connected') {
        // If we are currently throttled, unthrottle now because settling is part of a movement stop
        if (isThrottledRef.current) {
          isThrottledRef.current = false;
          console.log('[Motion] Movement stopped, unthrottling scan interval.');
        }

        if (state.provider === 'groq') {
          cameraService.triggerNow(cameraRef, state.interval, (base64Jpeg) => {
            if (specialModeRef.current !== 'none') return;
            const snapshot = motionService.getSnapshot();
            state.groq(base64Jpeg, snapshot);
          });
        } else if (state.provider === 'featherless') {
          cameraService.triggerNow(cameraRef, state.interval, (base64Jpeg) => {
            if (specialModeRef.current !== 'none') return;
            const snapshot = motionService.getSnapshot();
            state.featherless(base64Jpeg, snapshot);
          });
        } else if (state.provider === 'gemini') {
          cameraService.triggerNow(cameraRef, state.interval, (base64Jpeg) => {
            if (specialModeRef.current !== 'none') return;
            latestSnapshotRef.current = motionService.getSnapshot();
            geminiService.sendFrame(base64Jpeg);
          });
        }
      }
    };
  }, [startCameraScan]);

  // ── Instruction Loop (Repeats when paused) ────────────────────────────────
  useEffect(() => {
    let instructionInterval: ReturnType<typeof setInterval> | null = null;
    
    if (!isScanning) {
      // Speak instruction loop every 10 seconds while paused
      instructionInterval = setInterval(() => {
        // Don't speak the loop if we're in the middle of a settings/Q&A flow or showing the fall banner
        if (!showFallBanner && !isSilenced) {
          ttsService.speak('EchoSight is paused. Tap to start scanning. Double-tap to stop. Triple-tap to ask. Swipe up for detail. Swipe down to read text. Long press for settings.', 'normal');
        }
      }, 10000);
    }

    return () => {
      if (instructionInterval) clearInterval(instructionInterval);
    };
  }, [isScanning, showFallBanner, isSilenced]);

  // ── Use a ref to track isListening for callbacks (avoids stale closures) ──
  const isListeningRef = useRef(isListening);
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  // ── Voice Q&A: triple-tap → record → send to Gemini ─────────────────────
  const handleVoiceQuestion = useCallback(async () => {
    // Check if we're actively listening OR if auto-stop cached audio
    const activelyListening = isListeningRef.current;

    if (activelyListening) {
      // Currently listening — stop recording and process
      const audioBase64 = await voiceInputService.stopListening();
      setIsListening(false);

      if (audioBase64 && cameraRef.current) {
        try {
          // Capture current frame
          const photo = await cameraService.safeTakePhoto(cameraRef, { enableShutterSound: false });
          if (!photo) {
            announce('Camera is busy. Please try again.');
            return;
          }
          let localPath = photo.path;
          if (!localPath.startsWith('file://') && !localPath.startsWith('http')) {
            localPath = `file://${localPath}`;
          }
          const base64Jpeg = await FileSystem.readAsStringAsync(localPath, {
            encoding: FileSystem.EncodingType.Base64,
          });
          await FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => {});

          // Send audio + frame to Gemini
          geminiService.sendAudioQuestion(base64Jpeg, audioBase64);
          announce('Processing your question.');
          hapticService.triggerConfirmation();
        } catch (err) {
          console.warn('[Voice] Failed to capture frame for question:', err);
          announce('Could not capture image. Please try again.');
        }
      } else if (!audioBase64) {
        announce('No audio recorded. Please try again.');
      }
      return;
    }

    // Not currently listening — check if auto-stop cached audio we should send
    // (voiceInputService.stopListening() returns cached auto-stop audio if any)
    const cachedAudio = await voiceInputService.stopListening();
    if (cachedAudio && cameraRef.current) {
      setIsListening(false);
      try {
        const photo = await cameraService.safeTakePhoto(cameraRef, { enableShutterSound: false });
        if (!photo) return;
        let localPath = photo.path;
        if (!localPath.startsWith('file://') && !localPath.startsWith('http')) {
          localPath = `file://${localPath}`;
        }
        const base64Jpeg = await FileSystem.readAsStringAsync(localPath, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => {});

        geminiService.sendAudioQuestion(base64Jpeg, cachedAudio);
        announce('Processing your question.');
        hapticService.triggerConfirmation();
      } catch (err) {
        console.warn('[Voice] Failed to capture frame for cached question:', err);
        announce('Could not capture image. Please try again.');
      }
      return;
    }

    // Start new listening session
    hapticService.triggerConfirmation();
    announce('Listening. Ask your question, then triple-tap again to send.');
    Vibration.vibrate([0, 80, 60, 80]);

    const started = await voiceInputService.startListening();
    if (started) {
      setIsListening(true);
      setLastQuestion('');

      // Wire auto-stop callback — use ref to avoid stale closure
      voiceInputService.onStateChange = (state) => {
        if (state === 'idle' && isListeningRef.current) {
          // Auto-stopped after max duration — update UI
          // Audio is cached in VoiceInputService, next triple-tap will send it
          setIsListening(false);
          announce('Recording complete. Triple-tap to send your question.');
        }
      };
    } else {
      announce('Could not access microphone. Check permissions.');
    }
  }, [setIsListening, setLastQuestion]);

  // ── Track whether a swipe was detected (to suppress tap after swipe) ──
  const swipeDetected = useRef(false);

  // ── Tap gesture: single = toggle, double = force pause, triple = voice Q&A ──
  const handleTap = useCallback(() => {
    // Don't process tap if a swipe was just detected
    if (swipeDetected.current) {
      swipeDetected.current = false;
      return;
    }

    // If in fall countdown, tap cancels the SOS
    if (showFallBanner) {
      cancelFallCountdown();
      return;
    }

    const now = Date.now();
    const TAP_WINDOW = 400;

    if (now - lastTap.current < TAP_WINDOW) {
      tapCount.current++;
    } else {
      tapCount.current = 1;
    }
    lastTap.current = now;

    if (tapTimer.current) clearTimeout(tapTimer.current);

    tapTimer.current = setTimeout(() => {
      const count = tapCount.current;
      tapCount.current = 0;

      if (count >= 3) {
        // Triple-tap: voice Q&A
        if (isScanning && connectionStatus === 'connected') {
          handleVoiceQuestion();
        } else {
          announce(
            'Start scanning first, then triple-tap to ask a question.',
          );
        }
      } else if (count === 2) {
        // Double-tap: force pause and silence instructions
        stopScanning(true);
      } else {
        // Single tap
        if (specialModeRef.current !== 'none') {
          // Cancel reading/detailed mode instantly
          announce('Cancelled. Resuming normal scan.');
          resumeBackgroundScanning();
          featherlessService.cancel();
          groqService.cancel();
        } else if (isScanning) {
          stopScanning(false);
        } else {
          startScanning();
        }
      }
    }, TAP_WINDOW);
  }, [isScanning, connectionStatus, startScanning, stopScanning, cancelFallCountdown, showFallBanner, handleVoiceQuestion]);


  const handleLongPress = useCallback(() => {
    Vibration.vibrate(60);
    router.push('/settings');
  }, [router]);

  // ── Capture a single frame (shared helper) ────────────────────────────
  const captureCurrentFrame = useCallback(async (targetWidth?: number, quality: number = 0.7): Promise<string | null> => {
    if (!cameraRef.current) return null;
    try {
      const photo = await cameraService.safeTakePhoto(cameraRef, { enableShutterSound: true });
      if (!photo) return null;
      let localPath = photo.path;
      if (!localPath.startsWith('file://') && !localPath.startsWith('http')) {
        localPath = `file://${localPath}`;
      }

      // First resize to targetWidth if specified
      const ops: any[] = targetWidth ? [{ resize: { width: targetWidth } }] : [];
      const manipResult = await ImageManipulator.manipulateAsync(
        localPath,
        ops,
        { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      
      await FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => {});
      return manipResult.base64 || null;
    } catch (err) {
      console.warn('[Camera] Single frame capture failed:', err);
      return null;
    }
  }, []);

  /**
   * Capture a frame cropped to the center 60% of the image.
   * This approximates the visible screen viewport, excluding peripheral camera FOV.
   */
  const captureCroppedFrame = useCallback(async (quality: number = 0.7): Promise<string | null> => {
    if (!cameraRef.current) return null;
    try {
      const photo = await cameraService.safeTakePhoto(cameraRef, { enableShutterSound: true });
      if (!photo) return null;
      let localPath = photo.path;
      if (!localPath.startsWith('file://') && !localPath.startsWith('http')) {
        localPath = `file://${localPath}`;
      }

      // Get the true loaded dimensions after EXIF rotation has been applied by Expo
      const initial = await ImageManipulator.manipulateAsync(localPath, [], { format: ImageManipulator.SaveFormat.JPEG });
      const photoW = initial.width;
      const photoH = initial.height;

      // Crop to center 60% — this closely matches what's visible on the phone screen
      const cropW = Math.round(photoW * 0.6);
      const cropH = Math.round(photoH * 0.6);
      const originX = Math.round((photoW - cropW) / 2);
      const originY = Math.round((photoH - cropH) / 2);

      const manipResult = await ImageManipulator.manipulateAsync(
        localPath,
        [
          { crop: { originX, originY, width: cropW, height: cropH } },
          { resize: { width: 1080 } },
        ],
        { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      await FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => {});
      return manipResult.base64 || null;
    } catch (err) {
      console.warn('[Camera] Cropped frame capture failed:', err);
      return null;
    }
  }, []);

  // ── Swipe-up: Detailed Scene Description ─────────────────────────────
  const handleDetailedScan = useCallback(async () => {
    if (!isScanning || connectionStatus !== 'connected') {
      announce('Start scanning first to use detailed description.');
      return;
    }
    if (isOffline) {
      announce('Detailed analysis requires an internet connection.');
      return;
    }
    hapticService.triggerConfirmation();
    setSpecialMode('detailed');
    specialModeRef.current = 'detailed';
    cameraService.stop(); // Stop background scanning during detailed scan
    announce('Detailed scan. Describing your surroundings.');

    // Wait 3s to let the TTS finish speaking before the native shutter sound interrupts it
    setTimeout(async () => {
      // Detailed scan: High compression (640px width, 0.5 quality) for faster upload/processing
      const frame = await captureCurrentFrame(640, 0.5);
      if (frame) {
        announce('Photo captured. Analyzing scene...');
        let success = false;
        
        if (aiProvider === 'gemini') {
          success = await geminiService.sendDetailedFrame(frame);
          if (!success) announce('Analysis failed.');
        } else if (aiProvider === 'groq') {
          const text = await groqService.analyzeDetailedFrame(frame);
          if (text) {
            processDescription(text);
            ttsService.speak(`Scene analysis: ${text}`, 'normal');
            success = true;
          } else {
            announce('Analysis failed.');
          }
        } else {
          const text = await featherlessService.analyzeDetailedFrame(frame);
          if (text) {
            processDescription(text);
            ttsService.speak(`Scene analysis: ${text}`, 'normal');
            success = true;
          } else {
            announce('Analysis failed.');
          }
        }
        
        // If successful, give the TTS 5 seconds to finish speaking before resuming background scans
        if (success) {
          setTimeout(() => {
            resumeBackgroundScanning();
          }, 5000);
        } else {
          // If failed, resume background scans instantly
          resumeBackgroundScanning();
        }
      } else {
        resumeBackgroundScanning();
      }
    }, 3000);
  }, [isScanning, connectionStatus, captureCurrentFrame]);

  // ── Swipe-down: OCR Text Recognition ────────────────────────────────
  const handleOcrScan = useCallback(async () => {
    if (!isScanning || connectionStatus !== 'connected') {
      announce('Start scanning first to read text.');
      return;
    }
    hapticService.triggerConfirmation();
    setSpecialMode('ocr');
    specialModeRef.current = 'ocr';
    cameraService.stop(); // Stop background scanning during OCR
    announce('Reading text. Please point camera at the text now.');

    // Wait 3s to let the user point the phone and the TTS to finish before capturing
    setTimeout(async () => {
      latestSnapshotRef.current = motionService.getSnapshot();

      // OFFLINE OCR LOGIC
      if (isOffline) {
        try {
          const frameBase64 = await captureCroppedFrame(0.8);
          if (frameBase64) {
            announce('Photo captured. Reading text offline...');
            const tempFile = `${FileSystem.cacheDirectory}temp_ocr_${Date.now()}.jpg`;
            await FileSystem.writeAsStringAsync(tempFile, frameBase64, { encoding: FileSystem.EncodingType.Base64 });

            const text = await offlineOcrService.recognizeText(tempFile);
            if (text && text.trim().length > 0) {
              ttsService.speak(text, 'normal');
            } else {
              announce('No text detected.');
            }
            FileSystem.deleteAsync(tempFile, { idempotent: true }).catch(() => {});
          } else {
             announce('Failed to capture frame.');
          }
        } catch(e) {
          announce('Offline reading failed.');
        }
        setTimeout(() => {
          resumeBackgroundScanning();
        }, 5000);
        return;
      }

      // ONLINE OCR & CURRENCY LOGIC
      // Crop to center 60% of the viewport and send to online OCR/Currency APIs
      const frame = await captureCroppedFrame(0.8);
      if (frame) {
        announce('Photo captured. Analyzing text...');
        let success = false;

        if (aiProvider === 'gemini') {
          success = await geminiService.sendOcrFrame(frame);
          if (!success) announce('Text analysis failed.');
        } else if (aiProvider === 'groq') {
          const text = await groqService.analyzeOcrFrame(frame);
          if (text) {
            const processedText = handleBanknoteDetection(text);
            processDescription(processedText);
            const finalText = processedText;
            ttsService.speak(finalText, 'normal');
            success = true;
          } else {
            announce('Text analysis failed.');
          }
        } else {
          const text = await featherlessService.analyzeOcrFrame(frame);
          if (text) {
            const processedText = handleBanknoteDetection(text);
            processDescription(processedText);
            const finalText = processedText;
            ttsService.speak(finalText, 'normal');
            success = true;
          } else {
            announce('Text analysis failed.');
          }
        }

        // If successful, give the TTS 5 seconds to finish speaking before resuming background scans
        if (success) {
          setTimeout(() => {
            resumeBackgroundScanning();
          }, 5000);
        } else {
          // If failed, resume background scans instantly
          resumeBackgroundScanning();
        }
      } else {
        resumeBackgroundScanning();
      }
    }, 3000);
  }, [isScanning, connectionStatus, captureCurrentFrame, captureCroppedFrame, isOffline]);

  // ── PanResponder for reliable swipe gesture detection ──────────────────
  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        // Don't claim on touch-start — let taps through to TouchableOpacity
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        // Only claim the gesture if the finger moves more than 20px vertically
        onMoveShouldSetPanResponder: (_evt, gestureState) => {
          return Math.abs(gestureState.dy) > 20;
        },
        onMoveShouldSetPanResponderCapture: (_evt, gestureState) => {
          return Math.abs(gestureState.dy) > 20;
        },
        onPanResponderRelease: (_evt, gestureState) => {
          const SWIPE_THRESHOLD = 80;
          if (gestureState.dy < -SWIPE_THRESHOLD) {
            // Swipe UP → detailed scan
            swipeDetected.current = true;
            handleDetailedScan();
          } else if (gestureState.dy > SWIPE_THRESHOLD) {
            // Swipe DOWN → OCR / read text
            swipeDetected.current = true;
            handleOcrScan();
          }
          
          // Clear swipe flag shortly after to ensure future taps aren't ignored
          setTimeout(() => {
            swipeDetected.current = false;
          }, 300);
        },
        onPanResponderTerminate: () => {
          swipeDetected.current = false;
        },
      }),
    [handleDetailedScan, handleOcrScan],
  );

  // ── Permission gate ───────────────────────────────────────────────────────
  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.permText}>📷  Camera permission required</Text>
        <TouchableOpacity
          style={styles.permBtn}
          onPress={requestPermission}
          accessibilityRole="button"
          accessibilityLabel="Grant camera permission"
        >
          <Text style={styles.permBtnText}>Grant Permission</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!device) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.permText}>No camera device found.</Text>
      </SafeAreaView>
    );
  }

  const statusCfg = STATUS_CONFIG[connectionStatus];
  const providerLabel = aiProvider === 'gemini'
    ? (useFastMode ? 'Gemini (Fast)' : 'Gemini')
    : (aiProvider === 'groq' ? 'Groq' : 'Featherless');

  return (
    <View style={styles.root}>
      {/* ── Camera Preview (Mocked on Web) ── */}
      {isWeb ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1a1a2e', justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={{ color: '#40407a', fontSize: 18 }}>[ Web Preview: Camera Mock ]</Text>
        </View>
      ) : (
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={isScanning && appState === 'active'}
          photo={true}
          frameProcessor={frameProcessor}
          format={format}
        />
      )}

      {/* ── Dark overlay ── */}
      <View style={styles.overlay} pointerEvents="none" />

      {/* ── Giant gesture capture area (PanResponder for swipes + TouchableOpacity for taps) ── */}
      <View
        style={styles.gestureTarget}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={handleTap}
          onLongPress={handleLongPress}
          delayLongPress={600}
          activeOpacity={1}
          accessibilityRole="button"
          accessibilityLabel={
            isScanning
              ? 'EchoSight is scanning. Tap to pause. Double-tap to stop. Triple-tap to ask. Swipe up for detail. Swipe down to read text. Long press for settings.'
              : 'EchoSight is paused. Tap to start scanning your environment.'
          }
          accessibilityLiveRegion="polite"
        />
      </View>

      {/* ── Top bar ── */}
      <SafeAreaView style={styles.topBar} pointerEvents="box-none">
        <View style={styles.brand}>
          <Text style={styles.brandIcon} accessibilityElementsHidden>👁</Text>
          <Text style={styles.brandName}>EchoSight</Text>
        </View>
        <View style={styles.topRight}>
          <View style={[
            styles.providerBadge, 
            aiProvider === 'featherless' && styles.providerBadgeAlt,
            aiProvider === 'groq' && styles.providerBadgeGroq
          ]}>
            <Text style={styles.providerText}>{providerLabel}</Text>
          </View>
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
          >
            <Text style={styles.settingsBtnText}>⚙</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* ── Hazard Banner ── */}
      {!!hazardWarning && !showFallBanner && (
        <View
          style={styles.hazardBanner}
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          <Text style={styles.hazardText} numberOfLines={2}>
            ⚠  {hazardWarning.toUpperCase()}
          </Text>
        </View>
      )}

      {/* ── Fall Detection Banner ── */}
      {showFallBanner && (
        <View
          style={styles.fallBanner}
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          <Text style={styles.fallTitleText}>🚨 FALL DETECTED</Text>
          <Text style={styles.fallCountText}>Sending emergency SOS...</Text>
        </View>
      )}

      {/* ── Listening Banner ── */}
      {isListening && (
        <View
          style={styles.listeningBanner}
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          <Text style={styles.listeningText}>
            🎙️  LISTENING…  Triple-tap to send
          </Text>
        </View>
      )}

      {/* ── Note Counter Glassmorphic Badge ── */}
      {noteCount > 0 && (
        <View
          style={styles.noteCounterBadge}
          accessibilityRole="summary"
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.noteCounterTitle}>💰 Currency Counter</Text>
          <Text style={styles.noteCounterCount}>{noteCount} Notes Scanned</Text>
          <View style={styles.noteCounterDivider} />
          {scannedNotesHistory.slice(-3).map((note, idx) => (
            <Text key={idx} style={styles.noteCounterDetail}>
              + {note.value} {note.currency}
            </Text>
          ))}
          {scannedNotesHistory.length > 3 && (
            <Text style={{ color: '#a0a0c0', fontSize: 12 }}>...and {scannedNotesHistory.length - 3} more</Text>
          )}
          <View style={styles.noteCounterDivider} />
          <Text style={styles.noteCounterGrandTotal}>
            Total: {Object.entries(currencyTotals).length > 0
              ? Object.entries(currencyTotals).map(([curr, tot]) => `${tot} ${curr}`).join(' | ')
              : '0'}
          </Text>
        </View>
      )}

      {/* ── Special Mode Badge ── */}
      {specialMode !== 'none' && (
        <View
          style={[
            styles.modeBanner,
            specialMode === 'detailed' ? styles.modeBannerDetailed : styles.modeBannerOcr,
          ]}
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          <Text style={styles.modeBannerText}>
            {specialMode === 'detailed'
              ? '🔍  DETAILED SCAN…'
              : '📖  READING TEXT…'}
          </Text>
        </View>
      )}

      {/* ── Bottom status panel ── */}
      <SafeAreaView style={styles.bottomPanel} pointerEvents="box-none">
        <View style={styles.statusRow}>
          <Animated.View
            style={[styles.dot, { backgroundColor: statusCfg.dot, opacity: dotAnim }]}
          />
          <Text style={[styles.statusLabel, { color: statusCfg.color }]}>
            {statusCfg.label}
          </Text>
          {/* Latency indicator (dev info) */}
          {isScanning && responseLatency > 0 && (
            <Text style={styles.latencyText}>
              {responseLatency}ms
            </Text>
          )}
        </View>

        {!!lastDescription && (
          <Text
            style={styles.descText}
            accessibilityLiveRegion="polite"
            accessibilityLabel={`Navigation update: ${lastDescription}`}
            numberOfLines={3}
          >
            {lastDescription}
          </Text>
        )}

        <Text style={styles.hintText} accessibilityElementsHidden>
          {isListening
            ? 'Triple-tap to send your question'
            : isScanning
            ? 'Tap · pause  │  ×2 stop  │  ×3 ask  │  ↑ detail  │  ↓ read  │  Hold · settings'
            : 'Tap anywhere to start scanning'}
        </Text>
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(8,8,15,0.55)',
  },

  gestureTarget: {
    position: 'absolute',
    top:      SH * 0.1,
    left:     0,
    right:    0,
    height:   SH * 0.7,
  },

  // Top bar
  topBar: {
    position:        'absolute',
    top:             0,
    left:            0,
    right:           0,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingHorizontal: 20,
    paddingTop:       8,
  },
  brand: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
  },
  brandIcon:  { fontSize: 22 },
  brandName:  {
    fontSize:    22,
    fontWeight:  '700',
    color:       '#00e5ff',
    fontFamily:  Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  topRight: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
  },
  providerBadge: {
    backgroundColor: 'rgba(0,229,255,0.15)',
    borderWidth:     1,
    borderColor:     'rgba(0,229,255,0.3)',
    borderRadius:    8,
    paddingHorizontal: 10,
    paddingVertical:   4,
  },
  providerBadgeAlt: {
    backgroundColor: 'rgba(156,39,176,0.15)',
    borderColor:     'rgba(156,39,176,0.4)',
  },
  providerBadgeGroq: {
    backgroundColor: 'rgba(255,100,0,0.15)',
    borderColor:     'rgba(255,100,0,0.4)',
  },
  providerText: {
    fontSize:   11,
    fontWeight: '600',
    color:      '#b0b0ff',
  },
  settingsBtn: {
    width:           40,
    height:          40,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius:    10,
    alignItems:      'center',
    justifyContent:  'center',
  },
  settingsBtnText: { fontSize: 20 },

  // Hazard
  hazardBanner: {
    position:         'absolute',
    top:              '15%',
    left:             20,
    right:            20,
    backgroundColor:  'rgba(255,61,113,0.18)',
    borderWidth:      1.5,
    borderColor:      '#ff3d71',
    borderRadius:     14,
    padding:          14,
    alignItems:       'center',
  },
  hazardText: {
    color:       '#ff8aaa',
    fontSize:    15,
    fontWeight:  '700',
    textAlign:   'center',
  },

  // Fall Detection Banner
  fallBanner: {
    position:         'absolute',
    top:              '20%',
    left:             20,
    right:            20,
    backgroundColor:  'rgba(213,0,0,0.85)',
    borderWidth:      2,
    borderColor:      '#ff1744',
    borderRadius:     16,
    padding:          20,
    alignItems:       'center',
    shadowColor:      '#ff1744',
    shadowOpacity:    0.5,
    shadowRadius:     20,
    elevation:        10,
  },
  fallTitleText: {
    color:       '#ffffff',
    fontSize:    24,
    fontWeight:  '800',
    marginBottom: 8,
  },
  fallCountText: {
    color:       '#ffcdd2',
    fontSize:    18,
    fontWeight:  '600',
    marginBottom: 16,
  },
  fallHintText: {
    color:       '#ffffff',
    fontSize:    14,
    fontWeight:  '700',
    opacity:     0.9,
  },

  // Listening banner (voice Q&A)
  listeningBanner: {
    position:         'absolute',
    top:              '25%',
    left:             20,
    right:            20,
    backgroundColor:  'rgba(124,77,255,0.22)',
    borderWidth:      1.5,
    borderColor:      '#7c4dff',
    borderRadius:     14,
    padding:          14,
    alignItems:       'center',
  },
  listeningText: {
    color:       '#b388ff',
    fontSize:    16,
    fontWeight:  '700',
    textAlign:   'center',
  },

  // Note counter badge styles
  noteCounterBadge: {
    position:         'absolute',
    top:              '12%',
    left:             20,
    right:            20,
    backgroundColor:  'rgba(46,204,113,0.18)',
    borderWidth:      1.5,
    borderColor:      '#2ecc71',
    borderRadius:     14,
    padding:          14,
    alignItems:       'center',
    shadowColor:      '#2ecc71',
    shadowOffset:     { width: 0, height: 4 },
    shadowOpacity:    0.3,
    shadowRadius:     6,
    elevation:        4,
  },
  noteCounterTitle: {
    color:       '#2ecc71',
    fontSize:    16,
    fontWeight:  '800',
    marginBottom: 4,
  },
  noteCounterCount: {
    color:       '#ffffff',
    fontSize:    14,
    fontWeight:  '700',
  },
  noteCounterTotal: {
    color:       '#e0e0ff',
    fontSize:    13,
    fontWeight:  '600',
    marginTop:   2,
    textAlign:   'center',
  },
  noteCounterDivider: {
    width:            '80%',
    height:           1,
    backgroundColor:  'rgba(46,204,113,0.35)',
    marginVertical:   8,
  },
  noteCounterLabel: {
    color:       '#a0a0c0',
    fontSize:    12,
    fontWeight:  '700',
    letterSpacing: 0.5,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  noteCounterDetail: {
    color:       '#e0e0ff',
    fontSize:    14,
    fontWeight:  '600',
  },
  noteCounterGrandTotal: {
    color:       '#2ecc71',
    fontSize:    18,
    fontWeight:  '800',
  },

  // Special mode banners (detailed scan / OCR)
  modeBanner: {
    position:         'absolute',
    top:              '35%',
    left:             30,
    right:            30,
    borderRadius:     14,
    padding:          12,
    alignItems:       'center',
  },
  modeBannerDetailed: {
    backgroundColor:  'rgba(0,229,255,0.18)',
    borderWidth:      1.5,
    borderColor:      '#00e5ff',
  },
  modeBannerOcr: {
    backgroundColor:  'rgba(255,179,0,0.18)',
    borderWidth:      1.5,
    borderColor:      '#ffb300',
  },
  modeBannerText: {
    color:       '#e0e0ff',
    fontSize:    15,
    fontWeight:  '700',
    textAlign:   'center',
  },

  // Bottom panel
  bottomPanel: {
    position:          'absolute',
    bottom:            0,
    left:              0,
    right:             0,
    backgroundColor:   'rgba(8,8,15,0.85)',
    paddingHorizontal: 20,
    paddingTop:        18,
    paddingBottom:     8,
    borderTopWidth:    1,
    borderTopColor:    'rgba(255,255,255,0.06)',
    gap:               10,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
  },
  dot: {
    width:        9,
    height:       9,
    borderRadius: 5,
  },
  statusLabel: {
    fontSize:   13,
    fontWeight: '600',
  },
  latencyText: {
    fontSize:        11,
    color:           '#7070aa',
    marginLeft:      'auto',
    fontFamily:      'monospace',
  },
  descText: {
    fontSize:   16,
    color:      '#e0e0ff',
    lineHeight: 24,
  },
  hintText: {
    fontSize:  11,
    color:     '#40407a',
    textAlign: 'center',
  },

  // Permission fallback
  center: {
    flex:            1,
    backgroundColor: '#08080f',
    alignItems:      'center',
    justifyContent:  'center',
    padding:         32,
    gap:             20,
  },
  permText:    { color: '#e0e0ff', fontSize: 18, textAlign: 'center' },
  permBtn:     { backgroundColor: '#00e5ff', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 14 },
  permBtnText: { color: '#08080f', fontSize: 16, fontWeight: '700' },
});
