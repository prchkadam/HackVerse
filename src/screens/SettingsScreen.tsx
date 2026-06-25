/**
 * SettingsScreen
 *
 * Accessible settings panel for EchoSight.
 * Allows the user to configure:
 *   - AI Provider (Gemini / Featherless)
 *   - API keys for each provider
 *   - Featherless model selection (for dev testing)
 *   - Scan frequency
 *   - Fast mode (text + TTS vs native audio)
 *   - Speech rate
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
import { useEchoStore, type AIProvider, type HapticIntensity } from '../store/useEchoStore';
import { geminiService } from '../services/GeminiLiveService';
import { featherlessService, FEATHERLESS_MODELS } from '../services/FeatherlessVisionService';
import { groqService, GROQ_MODELS } from '../services/GroqVisionService';

const SCAN_OPTIONS: { label: string; value: number }[] = [
  { label: '1 second',  value: 1000 },
  { label: '2 seconds', value: 2000 },
  { label: '3 seconds', value: 3000 },
];

const SPEECH_RATE_OPTIONS: { label: string; value: number }[] = [
  { label: 'Slow',     value: 0.7 },
  { label: 'Normal',   value: 1.0 },
  { label: 'Fast',     value: 1.3 },
  { label: 'Very Fast', value: 1.8 },
];

const HAPTIC_INTENSITY_OPTIONS: { label: string; value: HapticIntensity; desc: string }[] = [
  { label: '🤏 Low',    value: 'low',    desc: 'Gentle vibrations' },
  { label: '✋ Medium', value: 'medium', desc: 'Balanced feedback' },
  { label: '💪 High',   value: 'high',   desc: 'Strong vibrations' },
];

export function SettingsScreen() {
  const {
    apiKey, featherlessApiKey, groqApiKey, aiProvider, featherlessModel, groqModel,
    scanInterval, speechRate, useFastMode, hapticEnabled, hapticIntensity,
    fallDetectionEnabled, emergencyContactNumber, batterySaverEnabled, batteryThreshold,
    setApiKey, setFeatherlessApiKey, setGroqApiKey, setAIProvider, setFeatherlessModel, setGroqModel,
    setScanInterval, setSpeechRate, setUseFastMode,
    setHapticEnabled, setHapticIntensity, setFallDetectionEnabled, setEmergencyContactNumber,
    setBatterySaverEnabled,
  } = useEchoStore();

  const [draftGeminiKey,      setDraftGeminiKey]      = useState(apiKey);
  const [draftFeatherlessKey, setDraftFeatherlessKey] = useState(featherlessApiKey);
  const [draftGroqKey,        setDraftGroqKey]        = useState(groqApiKey);
  const [draftEmergencyNum,   setDraftEmergencyNum]   = useState(emergencyContactNumber);
  const [isTesting,           setIsTesting]           = useState(false);
  const [maskGeminiKey,       setMaskGeminiKey]       = useState(true);
  const [maskFeatherlessKey,  setMaskFeatherlessKey]  = useState(true);
  const [maskGroqKey,         setMaskGroqKey]         = useState(true);

  const handleSave = () => {
    setApiKey(draftGeminiKey.trim());
    setFeatherlessApiKey(draftFeatherlessKey.trim());
    setGroqApiKey(draftGroqKey.trim());
    setEmergencyContactNumber(draftEmergencyNum.trim());
    AccessibilityInfo.announceForAccessibility('Settings saved.');
    Alert.alert('Saved', 'Your settings have been saved.');
  };

  const handleTestConnection = async () => {
    if (aiProvider === 'gemini') {
      if (!draftGeminiKey.trim()) {
        Alert.alert('No API Key', 'Please enter your Gemini API key first.');
        return;
      }
      setIsTesting(true);
      AccessibilityInfo.announceForAccessibility('Testing connection to Gemini.');
      try {
        await geminiService.connect(draftGeminiKey.trim());
        Alert.alert('Connected ✓', 'Successfully connected to Gemini Live API.');
        geminiService.disconnect();
      } catch {
        Alert.alert('Connection Failed', 'Could not connect. Check your API key and network.');
      } finally {
        setIsTesting(false);
      }
    } else if (aiProvider === 'featherless') {
      if (!draftFeatherlessKey.trim()) {
        Alert.alert('No API Key', 'Please enter your Featherless API key first.');
        return;
      }
      setIsTesting(true);
      AccessibilityInfo.announceForAccessibility('Testing connection to Featherless.');
      try {
        const ok = await featherlessService.testConnection(draftFeatherlessKey.trim());
        if (ok) {
          Alert.alert('Connected ✓', `Successfully connected to Featherless.ai.\nModel: ${featherlessModel}`);
        } else {
          Alert.alert('Connection Failed', 'Could not connect. Check your API key.');
        }
      } catch {
        Alert.alert('Connection Failed', 'Could not connect. Check your network.');
      } finally {
        setIsTesting(false);
      }
    } else if (aiProvider === 'groq') {
      if (!draftGroqKey.trim()) {
        Alert.alert('No API Key', 'Please enter your Groq API key first.');
        return;
      }
      setIsTesting(true);
      AccessibilityInfo.announceForAccessibility('Testing connection to Groq.');
      try {
        const ok = await groqService.testConnection(draftGroqKey.trim());
        if (ok) {
          Alert.alert('Connected ✓', `Successfully connected to Groq.\nModel: ${groqModel}`);
        } else {
          Alert.alert('Connection Failed', 'Could not connect. Check your API key.');
        }
      } catch {
        Alert.alert('Connection Failed', 'Could not connect. Check your network.');
      } finally {
        setIsTesting(false);
      }
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

        {/* ── AI Provider Toggle ── */}
        <View style={styles.field}>
          <Text style={styles.label}>AI Provider</Text>
          <View style={styles.optionRow}>
            {([
              { key: 'gemini' as AIProvider, label: '✦ Gemini', desc: 'Google AI' },
              { key: 'groq' as AIProvider, label: '⚡ Groq', desc: 'LPU Speed' },
              { key: 'featherless' as AIProvider, label: '🪶 Featherless', desc: 'Open Source' },
            ]).map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.providerBtn,
                  aiProvider === opt.key && styles.providerBtnActive,
                  aiProvider === opt.key && opt.key === 'featherless' && styles.providerBtnActiveAlt,
                ]}
                onPress={() => setAIProvider(opt.key)}
                accessibilityRole="radio"
                accessibilityState={{ checked: aiProvider === opt.key }}
                accessibilityLabel={`Use ${opt.label} as AI provider`}
              >
                <Text style={[
                  styles.providerBtnLabel,
                  aiProvider === opt.key && styles.providerBtnLabelActive,
                ]}>
                  {opt.label}
                </Text>
                <Text style={styles.providerBtnDesc}>{opt.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Gemini API Key ── */}
        <View style={[styles.field, aiProvider !== 'gemini' && styles.dimmed]}>
          <Text style={styles.label}>Gemini API Key</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, styles.inputFlex]}
              value={draftGeminiKey}
              onChangeText={setDraftGeminiKey}
              placeholder="AIza…"
              placeholderTextColor="#555"
              secureTextEntry={maskGeminiKey}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Gemini API key input"
              accessibilityHint="Enter your Google Gemini API key to enable AI navigation"
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setMaskGeminiKey(m => !m)}
              accessibilityLabel={maskGeminiKey ? 'Show API key' : 'Hide API key'}
              accessibilityRole="button"
            >
              <Text style={styles.eyeText}>{maskGeminiKey ? '👁' : '🙈'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Featherless API Key ── */}
        <View style={[styles.field, aiProvider !== 'featherless' && styles.dimmed]}>
          <Text style={styles.label}>Featherless API Key</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, styles.inputFlex]}
              value={draftFeatherlessKey}
              onChangeText={setDraftFeatherlessKey}
              placeholder="fl-…"
              placeholderTextColor="#555"
              secureTextEntry={maskFeatherlessKey}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Featherless API key input"
              accessibilityHint="Enter your Featherless.ai API key"
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setMaskFeatherlessKey(m => !m)}
              accessibilityLabel={maskFeatherlessKey ? 'Show API key' : 'Hide API key'}
              accessibilityRole="button"
            >
              <Text style={styles.eyeText}>{maskFeatherlessKey ? '👁' : '🙈'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Featherless Model Selector ── */}
        {aiProvider === 'featherless' && (
          <View style={styles.field}>
            <Text style={styles.label}>Vision Model</Text>
            <Text style={styles.subLabel}>Select a model to test — smaller = faster</Text>
            {FEATHERLESS_MODELS.map(model => (
              <TouchableOpacity
                key={model.id}
                style={[
                  styles.modelCard,
                  featherlessModel === model.id && styles.modelCardActive,
                ]}
                onPress={() => setFeatherlessModel(model.id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: featherlessModel === model.id }}
                accessibilityLabel={`${model.label}: ${model.description}`}
              >
                <View style={styles.modelHeader}>
                  <Text style={[
                    styles.modelName,
                    featherlessModel === model.id && styles.modelNameActive,
                  ]}>
                    {model.label}
                  </Text>
                  <View style={[
                    styles.sizeBadge,
                    featherlessModel === model.id && styles.sizeBadgeActive,
                  ]}>
                    <Text style={styles.sizeText}>{model.size}</Text>
                  </View>
                </View>
                <Text style={styles.modelDesc}>{model.description}</Text>
                <Text style={styles.modelId}>{model.id}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Groq API Key ── */}
        <View style={[styles.field, aiProvider !== 'groq' && styles.dimmed]}>
          <Text style={styles.label}>Groq API Key</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, styles.inputFlex]}
              value={draftGroqKey}
              onChangeText={setDraftGroqKey}
              placeholder="gsk_…"
              placeholderTextColor="#555"
              secureTextEntry={maskGroqKey}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Groq API key input"
              accessibilityHint="Enter your Groq API key"
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setMaskGroqKey(m => !m)}
              accessibilityLabel={maskGroqKey ? 'Show API key' : 'Hide API key'}
              accessibilityRole="button"
            >
              <Text style={styles.eyeText}>{maskGroqKey ? '👁' : '🙈'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Groq Model Selector ── */}
        {aiProvider === 'groq' && (
          <View style={styles.field}>
            <Text style={styles.label}>Vision Model</Text>
            <Text style={styles.subLabel}>Select a model to test</Text>
            {GROQ_MODELS.map(model => (
              <TouchableOpacity
                key={model.id}
                style={[
                  styles.modelCard,
                  groqModel === model.id && styles.modelCardActive,
                ]}
                onPress={() => setGroqModel(model.id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: groqModel === model.id }}
                accessibilityLabel={`${model.label}: ${model.description}`}
              >
                <View style={styles.modelHeader}>
                  <Text style={[
                    styles.modelName,
                    groqModel === model.id && styles.modelNameActive,
                  ]}>
                    {model.label}
                  </Text>
                  <View style={[
                    styles.sizeBadge,
                    groqModel === model.id && styles.sizeBadgeActive,
                  ]}>
                    <Text style={styles.sizeText}>{model.size}</Text>
                  </View>
                </View>
                <Text style={styles.modelDesc}>{model.description}</Text>
                <Text style={styles.modelId}>{model.id}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Fast Mode Toggle (Gemini only) ── */}
        {aiProvider === 'gemini' && (
          <View style={styles.field}>
            <Text style={styles.label}>Response Mode</Text>
            <View style={styles.optionRow}>
              <TouchableOpacity
                style={[styles.optionBtn, !useFastMode && styles.optionBtnActive]}
                onPress={() => setUseFastMode(false)}
                accessibilityRole="radio"
                accessibilityState={{ checked: !useFastMode }}
                accessibilityLabel="Premium voice: Gemini native audio, higher quality but slower"
              >
                <Text style={[styles.optionText, !useFastMode && styles.optionTextActive]}>
                  🎙 Premium
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.optionBtn, useFastMode && styles.optionBtnActive]}
                onPress={() => setUseFastMode(true)}
                accessibilityRole="radio"
                accessibilityState={{ checked: useFastMode }}
                accessibilityLabel="Fast mode: Text response with device speech, much faster"
              >
                <Text style={[styles.optionText, useFastMode && styles.optionTextActive]}>
                  ⚡ Fast
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.subLabel}>
              {useFastMode
                ? 'Text + device TTS — faster response, device voice'
                : 'Gemini native audio — richer voice, slower response'}
            </Text>
          </View>
        )}

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

        {/* ── Speech Rate ── */}
        <View style={styles.field}>
          <Text style={styles.label}>Speech Rate</Text>
          <View style={styles.optionRow}>
            {SPEECH_RATE_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.optionBtn,
                  speechRate === opt.value && styles.optionBtnActive,
                ]}
                onPress={() => setSpeechRate(opt.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: speechRate === opt.value }}
                accessibilityLabel={`Speech rate: ${opt.label}`}
              >
                <Text
                  style={[
                    styles.optionText,
                    speechRate === opt.value && styles.optionTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Haptic Feedback ── */}
        <View style={styles.field}>
          <Text style={styles.label}>Haptic Feedback</Text>
          <View style={styles.optionRow}>
            <TouchableOpacity
              style={[styles.optionBtn, hapticEnabled && styles.optionBtnActive]}
              onPress={() => setHapticEnabled(true)}
              accessibilityRole="radio"
              accessibilityState={{ checked: hapticEnabled }}
              accessibilityLabel="Enable haptic feedback vibrations"
            >
              <Text style={[styles.optionText, hapticEnabled && styles.optionTextActive]}>
                📳 On
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.optionBtn, !hapticEnabled && styles.optionBtnActive]}
              onPress={() => setHapticEnabled(false)}
              accessibilityRole="radio"
              accessibilityState={{ checked: !hapticEnabled }}
              accessibilityLabel="Disable haptic feedback vibrations"
            >
              <Text style={[styles.optionText, !hapticEnabled && styles.optionTextActive]}>
                Off
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.subLabel}>
            {hapticEnabled
              ? 'Directional vibrations for obstacle awareness'
              : 'No vibration feedback — audio only'}
          </Text>
        </View>

        {/* ── Haptic Intensity (only when haptics are enabled) ── */}
        {hapticEnabled && (
          <View style={styles.field}>
            <Text style={styles.label}>Vibration Intensity</Text>
            <View style={styles.optionRow}>
              {HAPTIC_INTENSITY_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.optionBtn,
                    hapticIntensity === opt.value && styles.optionBtnActive,
                  ]}
                  onPress={() => setHapticIntensity(opt.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: hapticIntensity === opt.value }}
                  accessibilityLabel={`Vibration intensity: ${opt.label}. ${opt.desc}`}
                >
                  <Text
                    style={[
                      styles.optionText,
                      hapticIntensity === opt.value && styles.optionTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Emergency SOS ── */}
        <View style={styles.field}>
          <Text style={styles.label}>Fall Detection & SOS</Text>
          <View style={styles.optionRow}>
            <TouchableOpacity
              style={[styles.optionBtn, fallDetectionEnabled && styles.optionBtnActive]}
              onPress={() => setFallDetectionEnabled(true)}
              accessibilityRole="radio"
              accessibilityState={{ checked: fallDetectionEnabled }}
              accessibilityLabel="Enable automatic fall detection"
            >
              <Text style={[styles.optionText, fallDetectionEnabled && styles.optionTextActive]}>
                🚨 On
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.optionBtn, !fallDetectionEnabled && styles.optionBtnActive]}
              onPress={() => setFallDetectionEnabled(false)}
              accessibilityRole="radio"
              accessibilityState={{ checked: !fallDetectionEnabled }}
              accessibilityLabel="Disable automatic fall detection"
            >
              <Text style={[styles.optionText, !fallDetectionEnabled && styles.optionTextActive]}>
                Off
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.subLabel}>
            {fallDetectionEnabled
              ? 'Automatically texts emergency contact if a hard fall is detected'
              : 'Automatic emergency SMS disabled'}
          </Text>
        </View>

        {fallDetectionEnabled && (
          <View style={styles.field}>
            <Text style={styles.label}>Emergency Contact Number</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., +1234567890"
              placeholderTextColor="#555"
              value={draftEmergencyNum}
              onChangeText={setDraftEmergencyNum}
              keyboardType="phone-pad"
              accessibilityLabel="Emergency contact phone number"
            />
          </View>
        )}

        {/* ── Battery Optimization ── */}
        <View style={styles.field}>
          <Text style={styles.label}>Battery Saver Mode</Text>
          <View style={styles.optionRow}>
            <TouchableOpacity
              style={[styles.optionBtn, batterySaverEnabled && styles.optionBtnActive]}
              onPress={() => setBatterySaverEnabled(true)}
              accessibilityRole="radio"
              accessibilityState={{ checked: batterySaverEnabled }}
              accessibilityLabel="Enable automatic battery saver"
            >
              <Text style={[styles.optionText, batterySaverEnabled && styles.optionTextActive]}>
                🔋 Auto
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.optionBtn, !batterySaverEnabled && styles.optionBtnActive]}
              onPress={() => setBatterySaverEnabled(false)}
              accessibilityRole="radio"
              accessibilityState={{ checked: !batterySaverEnabled }}
              accessibilityLabel="Disable battery saver"
            >
              <Text style={[styles.optionText, !batterySaverEnabled && styles.optionTextActive]}>
                Off
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.subLabel}>
            {batterySaverEnabled
              ? `Reduces camera scan rate to 2s and enforces text-only mode when battery drops below ${(batteryThreshold * 100).toFixed(0)}%`
              : 'App will always run at maximum performance'}
          </Text>
        </View>

        {/* ── Test Connection ── */}
        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary]}
          onPress={handleTestConnection}
          disabled={isTesting}
          accessibilityRole="button"
          accessibilityLabel={isTesting ? 'Testing connection' : `Test ${aiProvider} connection`}
          accessibilityState={{ disabled: isTesting }}
        >
          <Text style={styles.btnSecondaryText}>
            {isTesting ? '⏳ Testing…' : `⚡ Test ${aiProvider === 'gemini' ? 'Gemini' : (aiProvider === 'groq' ? 'Groq' : 'Featherless')} Connection`}
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
            🪶 Get a Featherless API key at{'\n'}
            featherless.ai
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
  dimmed: {
    opacity: 0.4,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#7070aa',
  },
  subLabel: {
    fontSize: 11,
    color: '#5050aa',
    marginTop: 2,
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

  // Provider toggle
  providerBtn: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: '#12121e',
    borderWidth: 1.5,
    borderColor: '#ffffff14',
    borderRadius: 14,
    alignItems: 'center',
    gap: 4,
  },
  providerBtnActive: {
    borderColor: '#00e5ff',
    backgroundColor: '#00e5ff12',
  },
  providerBtnActiveAlt: {
    borderColor: '#9c27b0',
    backgroundColor: '#9c27b012',
  },
  providerBtnLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#7070aa',
  },
  providerBtnLabelActive: {
    color: '#e0e0ff',
  },
  providerBtnDesc: {
    fontSize: 10,
    color: '#5050aa',
  },

  // Model selector cards
  modelCard: {
    backgroundColor: '#12121e',
    borderWidth: 1,
    borderColor: '#ffffff14',
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  modelCardActive: {
    borderColor: '#9c27b0',
    backgroundColor: '#9c27b012',
  },
  modelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modelName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7070aa',
  },
  modelNameActive: {
    color: '#e0e0ff',
  },
  sizeBadge: {
    backgroundColor: '#ffffff08',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  sizeBadgeActive: {
    backgroundColor: '#9c27b020',
  },
  sizeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7070aa',
  },
  modelDesc: {
    fontSize: 12,
    color: '#5050aa',
  },
  modelId: {
    fontSize: 10,
    color: '#3a3a6a',
    fontFamily: 'monospace',
  },

  // Buttons
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
  btnSecondaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#00e5ff',
  },

  // Info box
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
