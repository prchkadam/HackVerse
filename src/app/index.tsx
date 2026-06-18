import { useEffect, useState } from "react";
import {
  StyleSheet,
  Pressable,
  View,
  ScrollView,
  Platform,
  Animated,
} from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Accent, Surface, Radius } from "../constants/theme";
import { speechService } from "../services/speechService";

/* ── Card data ─────────────────────────────────────────── */

const CARDS: {
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  color: string;
  glow: string;
}[] = [
  {
    title: "Navigation Assistant",
    description: "Real-time obstacle detection and guidance.",
    icon: "navigate",
    route: "/navigation",
    color: Accent.blue,
    glow: Accent.blueGlow,
  },
  {
    title: "Read Text",
    description: "Read signs, labels and documents aloud.",
    icon: "document-text",
    route: "/read",
    color: Accent.cyan,
    glow: Accent.cyanGlow,
  },
  {
    title: "Currency Reader",
    description: "Identify currency notes instantly.",
    icon: "cash",
    route: "/currency",
    color: Accent.green,
    glow: Accent.greenGlow,
  },
  {
    title: "Emergency SOS",
    description: "Quick emergency assistance.",
    icon: "shield",
    route: "/sos",
    color: Accent.red,
    glow: Accent.redGlow,
  },
];

/* ── Animated Card ─────────────────────────────────────── */

function FeatureCard({
  item,
  index,
}: {
  item: (typeof CARDS)[number];
  index: number;
}) {
  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [slideAnim] = useState(() => new Animated.Value(30));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        delay: index * 100,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        delay: index * 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, [index]);

  const handlePress = () => {
    speechService.speak(item.title);
    router.push(item.route as any);
  };

  return (
    <Animated.View
      style={[
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <Pressable
        style={({ pressed }) => [
          styles.card,
          { borderColor: pressed ? item.color : Surface.cardBorder },
          pressed && { backgroundColor: Surface.elevated },
        ]}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${item.description}`}
        accessibilityHint={`Double tap to open ${item.title}`}
        android_ripple={{ color: item.glow, borderless: false }}
      >
        {/* Icon circle */}
        <View
          style={[
            styles.iconCircle,
            { backgroundColor: item.glow, borderColor: item.color },
          ]}
        >
          <Ionicons name={item.icon} size={28} color={item.color} />
        </View>

        {/* Text area */}
        <View style={styles.cardTextArea}>
          <Animated.Text style={[styles.cardTitle, { color: "#FFFFFF" }]}>
            {item.title}
          </Animated.Text>
          <Animated.Text style={[styles.cardDesc, { color: "#9CA3AF" }]}>
            {item.description}
          </Animated.Text>
        </View>

        {/* Chevron */}
        <Ionicons
          name="chevron-forward"
          size={20}
          color="#4B5563"
          style={styles.chevron}
        />
      </Pressable>
    </Animated.View>
  );
}

/* ── Home Screen ───────────────────────────────────────── */

export default function HomeScreen() {
  const [headerFade] = useState(() => new Animated.Value(0));
  const [headerSlide] = useState(() => new Animated.Value(-20));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerFade, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(headerSlide, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();

    // Welcome announcement for accessibility
    speechService.speak("Welcome to EchoSight. Choose an option below.");
  }, []);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View
          style={[
            styles.header,
            {
              opacity: headerFade,
              transform: [{ translateY: headerSlide }],
            },
          ]}
        >
          {/* Decorative glow orb */}
          <View style={styles.glowOrb} />

          <View style={styles.logoRow}>
            <View style={styles.logoBadge}>
              <Ionicons name="eye" size={22} color={Accent.blue} />
            </View>
            <View>
              <Animated.Text style={styles.title}>EchoSight</Animated.Text>
              <Animated.Text style={styles.subtitle}>
                AI Accessibility Companion
              </Animated.Text>
            </View>
          </View>

          {/* Settings gear */}
          <Pressable
            style={styles.settingsBtn}
            onPress={() => router.push("/settings" as any)}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Ionicons name="settings-outline" size={22} color="#6B7280" />
          </Pressable>
        </Animated.View>

        {/* Divider line */}
        <View style={styles.divider} />

        {/* Feature cards */}
        <View style={styles.cardsContainer}>
          {CARDS.map((card, i) => (
            <FeatureCard key={card.title} item={card} index={i} />
          ))}
        </View>

        {/* Footer tagline */}
        <Animated.Text style={[styles.footer, { opacity: headerFade }]}>
          Empowering independence through AI
        </Animated.Text>
      </ScrollView>
    </View>
  );
}

/* ── Styles ────────────────────────────────────────────── */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#08090C",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Platform.OS === "ios" ? 64 : 48,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },

  /* Header */
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  glowOrb: {
    position: "absolute",
    top: -60,
    left: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: Accent.blueGlow,
    opacity: 0.4,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(74, 158, 255, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(74, 158, 255, 0.25)",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
    marginTop: 2,
  },
  settingsBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Surface.dimmed,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },

  /* Divider */
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginVertical: 24,
  },

  /* Cards */
  cardsContainer: {
    gap: 14,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Surface.card,
    borderRadius: Radius.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: Surface.cardBorder,
    minHeight: 88,
    /* Shadow */
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  cardTextArea: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 13,
    fontWeight: "400",
    lineHeight: 18,
  },
  chevron: {
    marginLeft: 8,
  },

  /* Footer */
  footer: {
    textAlign: "center",
    color: "#374151",
    fontSize: 13,
    fontWeight: "500",
    marginTop: 32,
    letterSpacing: 0.3,
  },
});
