import { useState, useEffect } from "react";
import {
  StyleSheet,
  Pressable,
  View,
  ScrollView,
  Platform,
  Animated,
  ActivityIndicator,
  Text,
} from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from "react-native-vision-camera";
import * as FileSystem from "expo-file-system/legacy";
import { Accent, Surface, Radius } from "../constants/theme";
import { speechService } from "../services/speechService";
import { useEchoStore } from "../store/useEchoStore";

export default function CurrencyScreen() {
  const { apiKey } = useEchoStore();
  const [denomination, setDenomination] = useState("");
  const [confidence, setConfidence] = useState<"High" | "Medium" | "Low">("High");
  const [timestamp, setTimestamp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  // Vision Camera Setup
  const isWeb = Platform.OS === "web";
  const { hasPermission, requestPermission } = isWeb
    ? { hasPermission: true, requestPermission: async () => true }
    : useCameraPermission();
  const device = isWeb ? null : useCameraDevice("back");
  const [cameraRef] = useState(() => ({ current: null as Camera | null }));

  // Animations
  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [resultFade] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();

    if (!hasPermission && !isWeb) {
      requestPermission();
    }
  }, [hasPermission]);

  const handleIdentify = async () => {
    if (!apiKey) {
      setError("Please set your Gemini API key in Settings first.");
      speechService.speak("API key missing. Please configure it in settings.");
      return;
    }

    if (isWeb) {
      // Mock for web testing
      await processImageMock();
      return;
    }

    if (!cameraRef.current) {
      setError("Camera is initializing. Please try again.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setDenomination("");
      resultFade.setValue(0);
      speechService.speak("Scanning note...");

      const photo = await cameraRef.current.takePhoto({
        enableShutterSound: false,
      });

      let localPath = photo.path;
      if (!localPath.startsWith("file://") && !localPath.startsWith("http")) {
        localPath = `file://${localPath}`;
      }

      const base64Data = await FileSystem.readAsStringAsync(localPath, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Delete local file to save storage
      await FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => {});

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: "Identify the currency note visible in this image. Return denomination only. Examples: ₹10, ₹20, ₹50, ₹100, ₹200, ₹500, ₹2000. No explanations.",
                  },
                  {
                    inline_data: {
                      mime_type: "image/jpeg",
                      data: base64Data,
                    },
                  },
                ],
              },
            ],
          }),
        }
      );

      const data = await response.json();
      const text =
        data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "Unable to identify note";

      setDenomination(text);
      setConfidence("High");
      
      const now = new Date();
      setTimestamp(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

      speechService.speak(`Identified ${text}`);
      setCameraOpen(false);

      Animated.timing(resultFade, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    } catch (err) {
      console.error(err);
      setError("Failed to identify note. Please try again.");
      speechService.speak("Scan failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const processImageMock = async () => {
    setLoading(true);
    setError(null);
    setDenomination("");
    resultFade.setValue(0);
    speechService.speak("Scanning mock currency note...");

    setTimeout(() => {
      setDenomination("₹500 Note");
      setConfidence("High");
      const now = new Date();
      setTimestamp(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      speechService.speak("₹500 Note");
      setLoading(false);
      setCameraOpen(false);

      Animated.timing(resultFade, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }, 1500);
  };

  const handleReadAloud = () => {
    if (denomination) {
      speechService.speak(denomination);
    }
  };

  const confidenceColor =
    confidence === "High"
      ? Accent.green
      : confidence === "Medium"
      ? Accent.amber
      : Accent.red;

  if (!hasPermission && !isWeb) {
    return (
      <View style={styles.permContainer}>
        <Ionicons name="cash" size={64} color="#7070aa" />
        <Text style={styles.permText}>Camera permission is required to identify currency.</Text>
        <Pressable style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Grant Permission</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      {cameraOpen ? (
        <View style={StyleSheet.absoluteFill}>
          {/* Camera View */}
          {isWeb ? (
            <View style={[StyleSheet.absoluteFill, styles.webMockCamera]}>
              <Ionicons name="videocam" size={48} color="#40407a" />
              <Text style={styles.webMockText}>[ Web Camera Simulator ]</Text>
            </View>
          ) : device ? (
            <Camera
              ref={cameraRef as any}
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={true}
              photo={true}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.webMockCamera]}>
              <Text style={styles.webMockText}>Camera is loading...</Text>
            </View>
          )}

          {/* Camera HUD Overlays */}
          <View style={styles.cameraOverlay} pointerEvents="box-none">
            <View style={styles.cameraHeader}>
              <Pressable
                style={styles.cameraCloseBtn}
                onPress={() => {
                  setCameraOpen(false);
                  speechService.speak("Camera closed");
                }}
                accessibilityRole="button"
                accessibilityLabel="Close Camera"
              >
                <Ionicons name="close" size={26} color="#FFFFFF" />
              </Pressable>
              <Text style={styles.cameraTitle}>Align Note inside Frame</Text>
              <View style={{ width: 44 }} />
            </View>

            {/* Visual crop border overlay */}
            <View style={styles.visualFrame} pointerEvents="none">
              <View style={[styles.cornerMarker, styles.cornerTL]} />
              <View style={[styles.cornerMarker, styles.cornerTR]} />
              <View style={[styles.cornerMarker, styles.cornerBL]} />
              <View style={[styles.cornerMarker, styles.cornerBR]} />
            </View>

            <View style={styles.cameraFooter}>
              {loading ? (
                <View style={styles.cameraLoadingBox}>
                  <ActivityIndicator size="large" color={Accent.green} />
                  <Text style={styles.cameraLoadingText}>Scanning Note…</Text>
                </View>
              ) : (
                <Pressable
                  style={styles.shutterBtn}
                  onPress={handleIdentify}
                  accessibilityRole="button"
                  accessibilityLabel="Identify Currency"
                  accessibilityHint="Double tap to snap picture and read note"
                >
                  <View style={styles.shutterInner} />
                </Pressable>
              )}
            </View>
          </View>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
            <Pressable
              style={styles.backBtn}
              onPress={() => {
                speechService.speak("Back to home");
                router.back();
              }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="chevron-back" size={22} color="#9CA3AF" />
            </Pressable>

            <Text style={styles.headerTitle}>Currency Reader</Text>
            <View style={{ width: 44 }} />
          </Animated.View>

          {/* Guide card */}
          <Animated.View style={[styles.instructionCard, { opacity: fadeAnim }]}>
            <View style={styles.instructionIconWrap}>
              <Ionicons name="cash" size={36} color={Accent.green} />
            </View>
            <Text style={styles.instructionText}>
              Point camera toward a currency note.
            </Text>
            <Text style={styles.instructionHint}>
              Ensure the note is fully visible inside the screen boundaries.
            </Text>
          </Animated.View>

          {/* Open Camera Button */}
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => {
              setCameraOpen(true);
              speechService.speak("Camera opened. Position camera over currency note.");
            }}
            accessibilityRole="button"
            accessibilityLabel="Open Camera to Identify Note"
          >
            <Ionicons name="camera" size={24} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>Identify Currency</Text>
          </Pressable>

          {/* Error State */}
          {!!error && (
            <View style={styles.errorCard}>
              <Ionicons name="alert-circle" size={24} color={Accent.red} />
              <Text style={styles.errorText}>{error}</Text>
              <Pressable
                style={styles.retryBtn}
                onPress={() => setCameraOpen(true)}
              >
                <Text style={styles.retryBtnText}>Retry</Text>
              </Pressable>
            </View>
          )}

          {/* Result Card */}
          {!!denomination && (
            <Animated.View
              style={[
                styles.resultCard,
                { opacity: resultFade },
              ]}
            >
              <View style={styles.resultIconWrap}>
                <Ionicons name="wallet" size={40} color={Accent.green} />
              </View>

              <Text style={styles.denominationText}>{denomination}</Text>
              <Text style={styles.resultLabel}>Identified Note</Text>

              <View style={styles.divider} />

              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Confidence:</Text>
                <View style={[styles.badge, { backgroundColor: `${confidenceColor}1A` }]}>
                  <Text style={[styles.badgeText, { color: confidenceColor }]}>
                    {confidence}
                  </Text>
                </View>
              </View>

              {!!timestamp && (
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Timestamp:</Text>
                  <Text style={styles.metaValue}>{timestamp}</Text>
                </View>
              )}

              {/* Action buttons on result card */}
              <View style={styles.resultActions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.readAloudButton,
                    pressed && styles.buttonPressed,
                  ]}
                  onPress={handleReadAloud}
                  accessibilityRole="button"
                  accessibilityLabel="Read note denomination again"
                >
                  <Ionicons name="volume-high" size={20} color={Accent.green} />
                  <Text style={styles.readAloudText}>Read Again</Text>
                </Pressable>
              </View>
            </Animated.View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#08090C",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Platform.OS === "ios" ? 60 : 44,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Surface.dimmed,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  instructionCard: {
    backgroundColor: Surface.card,
    borderRadius: Radius.xl,
    padding: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Surface.cardBorder,
    marginBottom: 24,
  },
  instructionIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: Accent.greenGlow,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(52, 211, 153, 0.2)",
  },
  instructionText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#E5E7EB",
    textAlign: "center",
    marginBottom: 8,
  },
  instructionHint: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 18,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Accent.green,
    borderRadius: Radius.lg,
    paddingVertical: 18,
    gap: 10,
    shadowColor: Accent.green,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
    marginBottom: 20,
  },
  actionButtonText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  errorCard: {
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
    borderRadius: Radius.lg,
    padding: 20,
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  errorText: {
    color: "#FDA4AF",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: Accent.red,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Radius.md,
  },
  retryBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  resultCard: {
    backgroundColor: Surface.card,
    borderRadius: Radius.xl,
    padding: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Surface.cardBorder,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
  },
  resultIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Accent.greenGlow,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(52, 211, 153, 0.3)",
  },
  denominationText: {
    fontSize: 34,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  resultLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 20,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    width: "100%",
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: 12,
  },
  metaLabel: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "600",
  },
  metaValue: {
    fontSize: 14,
    color: "#E5E7EB",
    fontWeight: "700",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  resultActions: {
    width: "100%",
    marginTop: 12,
  },
  readAloudButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(52, 211, 153, 0.08)",
    borderRadius: Radius.md,
    paddingVertical: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(52, 211, 153, 0.2)",
    width: "100%",
  },
  readAloudText: {
    fontSize: 15,
    fontWeight: "600",
    color: Accent.green,
  },

  /* Camera HUD Styles */
  cameraOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 50 : 20,
    paddingBottom: Platform.OS === "ios" ? 40 : 20,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  cameraHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  cameraCloseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  cameraTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: "hidden",
  },
  visualFrame: {
    width: "85%",
    aspectRatio: 1.6,
    borderColor: "rgba(255,255,255,0.3)",
    borderWidth: 1.5,
    borderRadius: Radius.md,
    alignSelf: "center",
    position: "relative",
  },
  cornerMarker: {
    position: "absolute",
    width: 20,
    height: 20,
    borderColor: Accent.green,
  },
  cornerTL: {
    top: -2,
    left: -2,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 6,
  },
  cornerTR: {
    top: -2,
    right: -2,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 6,
  },
  cornerBL: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 6,
  },
  cornerBR: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 6,
  },
  cameraFooter: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  shutterBtn: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 4,
    borderColor: "#FFFFFF",
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  shutterInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#FFFFFF",
  },
  cameraLoadingBox: {
    backgroundColor: "rgba(0,0,0,0.8)",
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: Radius.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cameraLoadingText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  webMockCamera: {
    backgroundColor: "#161822",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  webMockText: {
    color: "#60647A",
    fontSize: 16,
    fontWeight: "600",
  },
  permContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#08080f",
    padding: 32,
    gap: 20,
  },
  permText: {
    color: "#E5E7EB",
    fontSize: 16,
    textAlign: "center",
    lineHeight: 22,
  },
  permBtn: {
    backgroundColor: Accent.green,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  permBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
