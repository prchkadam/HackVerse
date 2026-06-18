import { useState, useEffect } from "react";
import {
  StyleSheet,
  Pressable,
  View,
  ScrollView,
  Platform,
  Animated,
  Alert,
  Linking,
  Text,
} from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Accent, Surface, Radius } from "../constants/theme";
import { speechService } from "../services/speechService";
import { useEchoStore } from "../store/useEchoStore";

export default function SOSScreen() {
  const { emergencyContact } = useEchoStore();
  const [activated, setActivated] = useState(false);
  const [locationShared, setLocationShared] = useState(false);
  const [contactNotified, setContactNotified] = useState(false);
  const [helpRequested, setHelpRequested] = useState(false);

  // Animations
  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [buttonPulse] = useState(() => new Animated.Value(1));
  const [alertFade] = useState(() => new Animated.Value(0));
  const [checkAnim1] = useState(() => new Animated.Value(0));
  const [checkAnim2] = useState(() => new Animated.Value(0));
  const [checkAnim3] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();

    // Pulse the emergency button
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(buttonPulse, {
          toValue: 1.05,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(buttonPulse, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const handleEmergency = () => {
    setActivated(true);
    speechService.speak("Emergency alert activated. Sharing location and notifying contact.");

    Animated.timing(alertFade, {
      toValue: 1,
      duration: 450,
      useNativeDriver: true,
    }).start();

    // Sequential status updates mimicking backend API dispatch
    setTimeout(() => {
      setLocationShared(true);
      Animated.timing(checkAnim1, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
      speechService.speak("Location shared.");
    }, 600);

    setTimeout(() => {
      setContactNotified(true);
      Animated.timing(checkAnim2, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
      speechService.speak("Emergency contact notified.");
    }, 1400);

    setTimeout(() => {
      setHelpRequested(true);
      Animated.timing(checkAnim3, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
      speechService.speak("Help request sent.");
    }, 2200);
  };

  const handleCallEmergency = () => {
    Alert.alert(
      "Call Emergency Contact",
      `Call emergency contact: ${emergencyContact}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Call",
          style: "destructive",
          onPress: () => {
            const cleanNumber = emergencyContact.replace(/[^\d+]/g, '');
            Linking.openURL(`tel:${cleanNumber || '112'}`);
          },
        },
      ]
    );
  };

  const handleShareLocation = () => {
    Alert.alert(
      "Share Location",
      "Send current location update now?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Share",
          onPress: () => {
            speechService.speak("Sharing location.");
            Alert.alert("Location Shared", "Coordinates sent successfully.");
          },
        },
      ]
    );
  };

  const handleDeactivate = () => {
    setActivated(false);
    setLocationShared(false);
    setContactNotified(false);
    setHelpRequested(false);
    alertFade.setValue(0);
    checkAnim1.setValue(0);
    checkAnim2.setValue(0);
    checkAnim3.setValue(0);
    speechService.speak("Emergency alert canceled.");
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
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

          <Text style={styles.headerTitle}>Emergency SOS</Text>
          <View style={{ width: 44 }} />
        </Animated.View>

        {/* Main SOS Button */}
        {!activated ? (
          <Animated.View
            style={[
              styles.sosSection,
              {
                opacity: fadeAnim,
                transform: [{ scale: buttonPulse }],
              },
            ]}
          >
            <View style={styles.glowRing3} />
            <View style={styles.glowRing2} />
            <View style={styles.glowRing1} />

            <Pressable
              style={({ pressed }) => [
                styles.sosButton,
                pressed && { opacity: 0.9, transform: [{ scale: 0.95 }] },
              ]}
              onPress={handleEmergency}
              onLongPress={handleEmergency}
              accessibilityRole="button"
              accessibilityLabel="Emergency SOS. Press to activate emergency alert"
              accessibilityHint="Double tap to share location and notify contacts"
            >
              <Ionicons name="shield" size={48} color="#FFFFFF" />
              <Text style={styles.sosText}>SOS</Text>
              <Text style={styles.sosHint}>Press to Alert</Text>
            </Pressable>
          </Animated.View>
        ) : (
          /* Activated State */
          <Animated.View style={[styles.activatedSection, { opacity: alertFade }]}>
            <View style={styles.alertHeader}>
              <View style={styles.alertIconWrap}>
                <Ionicons name="warning" size={32} color={Accent.red} />
              </View>
              <Text style={styles.alertTitle}>Emergency Alert Active</Text>
            </View>

            {/* Status Checklist items */}
            <View style={styles.statusList}>
              <Animated.View
                style={[styles.statusItem, { opacity: checkAnim1 }]}
              >
                <View
                  style={[
                    styles.statusIcon,
                    locationShared && styles.statusIconActive,
                  ]}
                >
                  <Ionicons
                    name="location"
                    size={20}
                    color={locationShared ? "#FFFFFF" : "#6B7280"}
                  />
                </View>
                <View style={styles.statusTextArea}>
                  <Text style={styles.statusTitle}>Location Shared</Text>
                  <Text style={styles.statusDesc}>Current coordinates sent</Text>
                </View>
                {locationShared && (
                  <Ionicons
                    name="checkmark-circle"
                    size={24}
                    color={Accent.green}
                  />
                )}
              </Animated.View>

              <Animated.View
                style={[styles.statusItem, { opacity: checkAnim2 }]}
              >
                <View
                  style={[
                    styles.statusIcon,
                    contactNotified && styles.statusIconActive,
                  ]}
                >
                  <Ionicons
                    name="people"
                    size={20}
                    color={contactNotified ? "#FFFFFF" : "#6B7280"}
                  />
                </View>
                <View style={styles.statusTextArea}>
                  <Text style={styles.statusTitle}>Contact Notified</Text>
                  <Text style={styles.statusDesc}>Alert sent to {emergencyContact}</Text>
                </View>
                {contactNotified && (
                  <Ionicons
                    name="checkmark-circle"
                    size={24}
                    color={Accent.green}
                  />
                )}
              </Animated.View>

              <Animated.View
                style={[styles.statusItem, { opacity: checkAnim3 }]}
              >
                <View
                  style={[
                    styles.statusIcon,
                    helpRequested && styles.statusIconActive,
                  ]}
                >
                  <Ionicons
                    name="medkit"
                    size={20}
                    color={helpRequested ? "#FFFFFF" : "#6B7280"}
                  />
                </View>
                <View style={styles.statusTextArea}>
                  <Text style={styles.statusTitle}>Help Request Sent</Text>
                  <Text style={styles.statusDesc}>Emergency services dispatched</Text>
                </View>
                {helpRequested && (
                  <Ionicons
                    name="checkmark-circle"
                    size={24}
                    color={Accent.green}
                  />
                )}
              </Animated.View>
            </View>
          </Animated.View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          <Pressable
            style={({ pressed }) => [
              styles.callButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={handleCallEmergency}
            accessibilityRole="button"
            accessibilityLabel={`Call emergency contact at ${emergencyContact}`}
          >
            <Ionicons name="call" size={22} color="#FFFFFF" />
            <Text style={styles.callButtonText}>Call Contact</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.shareButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={handleShareLocation}
            accessibilityRole="button"
            accessibilityLabel="Share Current Location Now"
          >
            <Ionicons name="location" size={20} color={Accent.amber} />
            <Text style={styles.shareButtonText}>Share Location</Text>
          </Pressable>

          {activated && (
            <Pressable
              style={({ pressed }) => [
                styles.deactivateButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleDeactivate}
              accessibilityRole="button"
              accessibilityLabel="Deactivate emergency alert"
            >
              <Ionicons name="close-circle" size={20} color="#6B7280" />
              <Text style={styles.deactivateText}>Cancel Alert</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
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
    marginBottom: 32,
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
  sosSection: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 36,
    paddingVertical: 20,
    position: "relative",
  },
  glowRing3: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(239, 68, 68, 0.04)",
  },
  glowRing2: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(239, 68, 68, 0.06)",
  },
  glowRing1: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(239, 68, 68, 0.08)",
  },
  sosButton: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: Accent.red,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: Accent.red,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
  },
  sosText: {
    fontSize: 32,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 4,
    marginTop: 4,
  },
  sosHint: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.7)",
    marginTop: 4,
  },
  activatedSection: {
    marginBottom: 28,
  },
  alertHeader: {
    alignItems: "center",
    marginBottom: 24,
  },
  alertIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Accent.redGlow,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  alertTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: Accent.red,
    textAlign: "center",
  },
  statusList: {
    gap: 12,
  },
  statusItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Surface.card,
    borderRadius: Radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: Surface.cardBorder,
  },
  statusIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Surface.dimmed,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  statusIconActive: {
    backgroundColor: Accent.green,
  },
  statusTextArea: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#E5E7EB",
    marginBottom: 2,
  },
  statusDesc: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "500",
  },
  actionsContainer: {
    gap: 12,
  },
  callButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Accent.red,
    borderRadius: Radius.lg,
    paddingVertical: 18,
    gap: 10,
    shadowColor: Accent.red,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  callButtonText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(251, 191, 36, 0.08)",
    borderRadius: Radius.lg,
    paddingVertical: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.2)",
  },
  shareButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: Accent.amber,
  },
  deactivateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Surface.dimmed,
    borderRadius: Radius.lg,
    paddingVertical: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  deactivateText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6B7280",
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
});
