/**
 * SettingsScreen
 *
 * Accessible settings panel for EchoSight.
 * Allows the user to configure their Gemini API key, scan frequency,
 * and test the connection.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  AccessibilityInfo,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEchoStore } from '../store/useEchoStore';
import { geminiService } from '../services/GeminiLiveService';

const SCAN_OPTIONS: { label: string; value: number }[] = [
  { label: '1 second',  value: 1000 },
  { label: '2 seconds', value: 2000 },
  { label: '3 seconds', value: 3000 },
];

export function SettingsScreen() {
  const { apiKey, scanInterval, setApiKey, setScanInterval } = useEchoStore();

  const [draftKey,    setDraftKey]    = useState(apiKey);
  const [isTesting,  setIsTesting]   = useState(false);
  const [maskKey,    setMaskKey]      = useState(true);

  const handleSave = () => {
    setApiKey(draftKey.trim());
    AccessibilityInfo.announceForAccessibility('Settings saved.');
    Alert.alert('Saved', 'Your settings have been saved.');
  };

  const handleTestConnection = async () => {
    if (!draftKey.trim()) {
      Alert.alert('No API Key', 'Please enter your Gemini API key first.');
      return;
    }
    setIsTesting(true);
    AccessibilityInfo.announceForAccessibility('Testing connection to Gemini.');
    try {
      await geminiService.connect(draftKey.trim());
      Alert.alert('Connected ✓', 'Successfully connected to Gemini Live API.');
      geminiService.disconnect();
    } catch {
      Alert.alert(
        'Connection Failed',
        'Could not connect. Check your API key and network connection.',
      );
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ── */}
        <Text style={styles.title} accessibilityRole="header">
          ⚙ Settings
        </Text>

        {/* ── API Key ── */}
        <View style={styles.field}>
          <Text style={styles.label}>Gemini API Key</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, styles.inputFlex]}
              value={draftKey}
              onChangeText={setDraftKey}
              placeholder="AIza…"
              placeholderTextColor="#555"
              secureTextEntry={maskKey}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Gemini API key input"
              accessibilityHint="Enter your Google Gemini API key to enable AI navigation"
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setMaskKey(m => !m)}
              accessibilityLabel={maskKey ? 'Show API key' : 'Hide API key'}
              accessibilityRole="button"
            >
              <Text style={styles.eyeText}>{maskKey ? '👁' : '🙈'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Scan Interval ── */}
        <View style={styles.field}>
          <Text style={styles.label}>Scan Frequency</Text>
          <View style={styles.optionRow}>
            {SCAN_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.optionBtn,
                  scanInterval === opt.value && styles.optionBtnActive,
                ]}
                onPress={() => setScanInterval(opt.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: scanInterval === opt.value }}
                accessibilityLabel={`Scan every ${opt.label}`}
              >
                <Text
                  style={[
                    styles.optionText,
                    scanInterval === opt.value && styles.optionTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Test Connection ── */}
        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary]}
          onPress={handleTestConnection}
          disabled={isTesting}
          accessibilityRole="button"
          accessibilityLabel={isTesting ? 'Testing connection' : 'Test connection to Gemini'}
          accessibilityState={{ disabled: isTesting }}
        >
          <Text style={styles.btnText}>
            {isTesting ? '⏳ Testing…' : '⚡ Test Connection'}
          </Text>
        </TouchableOpacity>

        {/* ── Save ── */}
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary]}
          onPress={handleSave}
          accessibilityRole="button"
          accessibilityLabel="Save settings"
        >
          <Text style={styles.btnText}>Save Settings</Text>
        </TouchableOpacity>

        {/* ── Info ── */}
        <View style={styles.infoBox} accessibilityRole="text">
          <Text style={styles.infoText}>
            💡 Get a free Gemini API key at{'\n'}
            aistudio.google.com
          </Text>
          <Text style={styles.infoText}>
            🎧 Use headphones for spatial audio — obstacles will sound
            from the direction they are in.
          </Text>
          <Text style={styles.infoText}>
            📱 Requires an EAS development build — will not work in Expo Go.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#08080f',
  },
  scroll: {
    padding: 24,
    paddingBottom: 48,
    gap: 20,
  },
  title: {
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
    fontSize: 28,
    fontWeight: '700',
    color: '#e0e0ff',
    marginBottom: 8,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#7070aa',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    backgroundColor: '#12121e',
    borderWidth: 1,
    borderColor: '#ffffff14',
    borderRadius: 12,
    padding: 14,
    color: '#e0e0ff',
    fontSize: 15,
    fontFamily: 'monospace',
  },
  inputFlex: {
    flex: 1,
  },
  eyeBtn: {
    width: 48,
    height: 48,
    backgroundColor: '#12121e',
    borderWidth: 1,
    borderColor: '#ffffff14',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeText: {
    fontSize: 20,
  },
  optionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  optionBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: '#12121e',
    borderWidth: 1,
    borderColor: '#ffffff14',
    borderRadius: 12,
    alignItems: 'center',
  },
  optionBtnActive: {
    borderColor: '#00e5ff',
    backgroundColor: '#00e5ff18',
  },
  optionText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#7070aa',
  },
  optionTextActive: {
    color: '#00e5ff',
    fontWeight: '700',
  },
  btn: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: {
    backgroundColor: '#00e5ff',
  },
  btnSecondary: {
    backgroundColor: '#12121e',
    borderWidth: 1,
    borderColor: '#00e5ff44',
  },
  btnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#08080f',
  },
  infoBox: {
    backgroundColor: '#12121e',
    borderRadius: 14,
    padding: 16,
    gap: 12,
    marginTop: 8,
  },
  infoText: {
    fontSize: 13,
    color: '#5050aa',
    lineHeight: 20,
  },
});
