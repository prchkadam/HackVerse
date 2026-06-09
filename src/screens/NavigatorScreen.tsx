/**
 * NavigatorScreen — EchoSight's main interface (VisionCamera v5)
 *
 * VisionCamera v5 API:
 *   - <Camera device outputs=[photoOutput] isActive />
 *   - usePhotoOutput() → CameraPhotoOutput → capturePhoto()
 *   - useCameraPermission() / useCameraDevice()
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCameraFormat,
} from 'react-native-vision-camera';
import { useRouter } from 'expo-router';

import { useEchoStore }    from '../store/useEchoStore';
import { geminiService }   from '../services/GeminiLiveService';
import { spatialAudio }    from '../services/SpatialAudioService';
import { cameraService }   from '../services/CameraService';

const { height: SH } = Dimensions.get('window');

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  disconnected: { color: '#7070aa', label: 'Tap to start',      dot: '#7070aa' },
  connecting:   { color: '#ffb300', label: 'Connecting…',       dot: '#ffb300' },
  connected:    { color: '#00e5ff', label: 'Scanning',          dot: '#00e5ff' },
  error:        { color: '#ff3d71', label: 'Error — tap retry', dot: '#ff3d71' },
} as const;

export function NavigatorScreen() {
  const router    = useRouter();
  const dotAnim   = useRef(new Animated.Value(1)).current;
  const lastTap   = useRef<number>(0);
  const tapTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    apiKey,
    scanInterval,
    isScanning,
    connectionStatus,
    lastDescription,
    hazardWarning,
    setIsScanning,
    setConnectionStatus,
    setLastDescription,
    setHazardWarning,
    setCurrentPan,
    loadPersistedSettings,
  } = useEchoStore();

  // ── VisionCamera v4 hooks (Skipped on Web) ─────────────────────────────────
  const isWeb = Platform.OS === 'web';
  
  const { hasPermission, requestPermission } = isWeb ? { hasPermission: true, requestPermission: async () => true } : useCameraPermission();
  const device = isWeb ? { id: 'mock' } as any : useCameraDevice('back');
  // Select a low-resolution format (~640x480) for fast, small JPEG frames
  const format = isWeb ? undefined : useCameraFormat(device, [
    { photoResolution: { width: 640, height: 480 } },
  ]);
  const cameraRef = useRef<Camera>(null) as React.RefObject<Camera>;

  // ── Load persisted settings + request permissions on mount ────────────────
  useEffect(() => {
    loadPersistedSettings().then(() => {
      if (!hasPermission && !isWeb) requestPermission();
    });
  }, []);

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
  }, [connectionStatus]);

  // ── Wire Gemini callbacks ─────────────────────────────────────────────────
  useEffect(() => {
    geminiService.onStatusChange = (status) => {
      setConnectionStatus(status);
    };

    geminiService.onTranscript = (text) => {
      setLastDescription(text);
      const lower = text.toLowerCase();
      const isHazard = ['stop', 'danger', 'hazard', 'careful', 'warning',
                         'stairs', 'traffic', 'car', 'urgent'].some(w => lower.includes(w));
      if (isHazard) {
        setHazardWarning(text);
        Vibration.vibrate([0, 200, 100, 200]);
        setTimeout(() => setHazardWarning(''), 4000);
      }
    };

    geminiService.onAudioChunk = async ({ pcmBase64, pan }) => {
      setCurrentPan(pan);
      await spatialAudio.playPcmChunk(pcmBase64, pan);
    };

    return () => {
      geminiService.onStatusChange = () => {};
      geminiService.onTranscript   = () => {};
      geminiService.onAudioChunk   = () => {};
    };
  }, []);

  // ── Start scanning ────────────────────────────────────────────────────────
  const startScanning = useCallback(async () => {
    if (!apiKey) {
      AccessibilityInfo.announceForAccessibility(
        'No API key set. Opening settings to add your Gemini API key.',
      );
      router.push('/settings');
      return;
    }
    if (!device || (!hasPermission && !isWeb)) {
      AccessibilityInfo.announceForAccessibility('Camera not available.');
      return;
    }

    setIsScanning(true);
    AccessibilityInfo.announceForAccessibility(
      'EchoSight started. Connecting to AI…',
    );
    Vibration.vibrate(80);

    try {
      console.log('[EchoSight] Connecting to Gemini...');
      await geminiService.connect(apiKey);
      console.log('[EchoSight] Connected! Starting camera capture...');
      cameraService.start(cameraRef, scanInterval, (base64Jpeg) => {
        geminiService.sendFrame(base64Jpeg);
      });
      console.log('[EchoSight] Camera capture started');
      AccessibilityInfo.announceForAccessibility(
        'Connected. Scanning your environment.',
      );
    } catch (err: any) {
      console.error('[EchoSight] Failed to connect:', err?.message || err);
      cameraService.stop(); // ensure camera is stopped on failure
      setIsScanning(false);
      setConnectionStatus('error');
      AccessibilityInfo.announceForAccessibility(
        'Failed to connect. Check your API key and network. Tap to retry.',
      );
    }
  }, [apiKey, device, hasPermission, scanInterval]);

  // ── Stop scanning ─────────────────────────────────────────────────────────
  const stopScanning = useCallback(() => {
    cameraService.stop();
    geminiService.disconnect();
    spatialAudio.stop();
    setIsScanning(false);
    setLastDescription('');
    setHazardWarning('');
    AccessibilityInfo.announceForAccessibility('EchoSight paused.');
    Vibration.vibrate(40);
  }, []);

  // ── Tap gesture: single = toggle, double = force pause ────────────────────
  const handleTap = useCallback(() => {
    const now = Date.now();
    const DOUBLE = 300;
    if (now - lastTap.current < DOUBLE) {
      if (tapTimer.current) clearTimeout(tapTimer.current);
      lastTap.current = 0;
      if (isScanning) stopScanning();
      return;
    }
    lastTap.current = now;
    tapTimer.current = setTimeout(() => {
      isScanning ? stopScanning() : startScanning();
    }, DOUBLE);
  }, [isScanning, startScanning, stopScanning]);

  const handleLongPress = useCallback(() => {
    Vibration.vibrate(60);
    router.push('/settings');
  }, []);

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
          format={format}
          isActive={true}
          photo={true}
        />
      )}

      {/* ── Dark overlay ── */}
      <View style={styles.overlay} pointerEvents="none" />

      {/* ── Giant gesture capture area ── */}
      <TouchableOpacity
        style={styles.gestureTarget}
        onPress={handleTap}
        onLongPress={handleLongPress}
        delayLongPress={600}
        activeOpacity={1}
        accessibilityRole="button"
        accessibilityLabel={
          isScanning
            ? 'EchoSight is scanning. Tap to pause. Double-tap to stop. Long press for settings.'
            : 'EchoSight is paused. Tap to start scanning your environment.'
        }
        accessibilityLiveRegion="polite"
      />

      {/* ── Top bar ── */}
      <SafeAreaView style={styles.topBar} pointerEvents="box-none">
        <View style={styles.brand}>
          <Text style={styles.brandIcon} accessibilityElementsHidden>👁</Text>
          <Text style={styles.brandName}>EchoSight</Text>
        </View>
        <TouchableOpacity
          style={styles.settingsBtn}
          onPress={() => router.push('/settings')}
          accessibilityRole="button"
          accessibilityLabel="Open settings"
        >
          <Text style={styles.settingsBtnText}>⚙</Text>
        </TouchableOpacity>
      </SafeAreaView>

      {/* ── Hazard Banner ── */}
      {!!hazardWarning && (
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

      {/* ── Bottom status panel ── */}
      <SafeAreaView style={styles.bottomPanel} pointerEvents="box-none">
        <View style={styles.statusRow}>
          <Animated.View
            style={[styles.dot, { backgroundColor: statusCfg.dot, opacity: dotAnim }]}
          />
          <Text style={[styles.statusLabel, { color: statusCfg.color }]}>
            {statusCfg.label}
          </Text>
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
          {isScanning
            ? 'Tap · pause   Double-tap · stop   Long-press · settings'
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
