/**
 * SettingsScreen
 *
 * Accessible settings panel for EchoSight.
 * Allows the user to configure their Gemini API key, scan frequency,
 * voice output parameters, emergency contacts, and test connection.
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
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEchoStore } from '../store/useEchoStore';
import { geminiService } from '../services/GeminiLiveService';
import { speechService } from '../services/speechService';
import { Accent, Surface, Radius } from '../constants/theme';

const SCAN_OPTIONS: { label: string; value: number }[] = [
  { label: '1 second',  value: 1000 },
  { label: '2 seconds', value: 2000 },
  { label: '3 seconds', value: 3000 },
];

export function SettingsScreen() {
  const {
    apiKey,
    scanInterval,
    voiceSpeed,
    voiceVolume,
    guidanceFrequency,
    themeMode,
    emergencyContact,
    setApiKey,
    setScanInterval,
    setVoiceSpeed,
    setVoiceVolume,
    setGuidanceFrequency,
    setThemeMode,
    setEmergencyContact,
  } = useEchoStore();

  const [draftKey, setDraftKey] = useState(apiKey);
  const [draftContact, setDraftContact] = useState(emergencyContact);
  const [isTesting, setIsTesting] = useState(false);
  const [maskKey, setMaskKey] = useState(true);
  const [isEditingContact, setIsEditingContact] = useState(false);

  const handleSave = () => {
    setApiKey(draftKey.trim());
    setEmergencyContact(draftContact.trim());
    speechService.speak('Settings saved successfully');
    AccessibilityInfo.announceForAccessibility('Settings saved.');
    Alert.alert('Saved', 'Your settings have been saved.');
    router.back();
  };

  const handleTestConnection = async () => {
    if (!draftKey.trim()) {
      Alert.alert('No API Key', 'Please enter your Gemini API key first.');
      return;
    }
    setIsTesting(true);
    speechService.speak('Testing connection to Gemini');
    AccessibilityInfo.announceForAccessibility('Testing connection to Gemini.');
    try {
      await geminiService.connect(draftKey.trim());
      speechService.speak('Connection successful');
      Alert.alert('Connected ✓', 'Successfully connected to Gemini Live API.');
      geminiService.disconnect();
    } catch {
      speechService.speak('Connection failed');
      Alert.alert(
        'Connection Failed',
        'Could not connect. Check your API key and network connection.',
      );
    } finally {
      setIsTesting(false);
    }
  };

  const announceSetting = (settingName: string, value: string) => {
    speechService.speak(`${settingName} set to ${value}`);
  };

  const adjustVolume = (direction: 'up' | 'down') => {
    let next = direction === 'up' ? voiceVolume + 0.1 : voiceVolume - 0.1;
    next = Math.max(0, Math.min(1, parseFloat(next.toFixed(1))));
    setVoiceVolume(next);
    speechService.speak(`Volume ${Math.round(next * 100)} percent`);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={24} color="#00e5ff" />
          </TouchableOpacity>
          <Text style={styles.title} accessibilityRole="header">
            Settings
          </Text>
        </View>

        {/* ── API Key Setup ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>API Credentials</Text>
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
                accessibilityHint="Enter your Google Gemini API key to enable AI features"
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

          {/* Test Connection Button */}
          <TouchableOpacity
            style={[styles.btn, styles.btnSecondary, { marginTop: 12 }]}
            onPress={handleTestConnection}
            disabled={isTesting}
            accessibilityRole="button"
            accessibilityLabel={isTesting ? 'Testing connection' : 'Test connection to Gemini'}
          >
            <Text style={styles.btnSecondaryText}>
              {isTesting ? '⏳ Testing…' : '⚡ Test Connection'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Voice Settings ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Speech Settings</Text>

          {/* Voice Speed */}
          <View style={styles.field}>
            <Text style={styles.label}>Voice Speed</Text>
            <View style={styles.segmentedControl}>
              {(['Slow', 'Normal', 'Fast'] as const).map(speed => {
                const isSelected = voiceSpeed === speed;
                return (
                  <TouchableOpacity
                    key={speed}
                    style={[
                      styles.segmentButton,
                      isSelected && styles.segmentButtonActive,
                    ]}
                    onPress={() => {
                      setVoiceSpeed(speed);
                      announceSetting('Voice speed', speed);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected }}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        isSelected && styles.segmentTextActive,
                      ]}
                    >
                      {speed}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Voice Volume */}
          <View style={styles.field}>
            <Text style={styles.label}>Voice Volume</Text>
            <View style={styles.volumeController}>
              <TouchableOpacity
                style={styles.volumeBtn}
                onPress={() => adjustVolume('down')}
                accessibilityRole="button"
                accessibilityLabel="Decrease volume"
              >
                <Ionicons name="remove" size={24} color="#FFFFFF" />
              </TouchableOpacity>
              
              <View style={styles.volumeBarContainer}>
                <View style={[styles.volumeBarActive, { width: `${voiceVolume * 100}%` }]} />
              </View>

              <TouchableOpacity
                style={styles.volumeBtn}
                onPress={() => adjustVolume('up')}
                accessibilityRole="button"
                accessibilityLabel="Increase volume"
              >
                <Ionicons name="add" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── Guidance Preferences ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Guidance Preferences</Text>

          {/* Scan Frequency */}
          <View style={styles.field}>
            <Text style={styles.label}>Navigation Scan Interval</Text>
            <View style={styles.optionRow}>
              {SCAN_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.optionBtn,
                    scanInterval === opt.value && styles.optionBtnActive,
                  ]}
                  onPress={() => {
                    setScanInterval(opt.value);
                    announceSetting('Scan interval', opt.label);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: scanInterval === opt.value }}
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

          {/* Guidance Announcement Frequency */}
          <View style={styles.field}>
            <Text style={styles.label}>Announce Frequency</Text>
            <View style={styles.segmentedControl}>
              {(['Low', 'Medium', 'High'] as const).map(freq => {
                const isSelected = guidanceFrequency === freq;
                return (
                  <TouchableOpacity
                    key={freq}
                    style={[
                      styles.segmentButton,
                      isSelected && styles.segmentButtonActive,
                    ]}
                    onPress={() => {
                      setGuidanceFrequency(freq);
                      announceSetting('Announcement frequency', freq);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected }}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        isSelected && styles.segmentTextActive,
                      ]}
                    >
                      {freq}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        {/* ── Device & Safety settings ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Safety & Appearance</Text>

          {/* Theme Mode Toggle */}
          <View style={styles.settingRowItem}>
            <Text style={styles.settingLabel}>Dark Theme Mode</Text>
            <Switch
              value={themeMode === 'Dark'}
              onValueChange={isDark => {
                const newMode = isDark ? 'Dark' : 'Light';
                setThemeMode(newMode);
                announceSetting('Theme Mode', newMode);
              }}
              trackColor={{ false: '#1E2028', true: '#00e5ff' }}
              thumbColor="#FFFFFF"
              accessibilityLabel="Toggle Dark Theme Mode"
            />
          </View>

          {/* Emergency Contact */}
          <View style={styles.field}>
            <Text style={styles.label}>Emergency Contact Number</Text>
            <View style={styles.contactContainer}>
              {isEditingContact ? (
                <View style={styles.contactEditRow}>
                  <TextInput
                    style={styles.contactInput}
                    value={draftContact}
                    onChangeText={setDraftContact}
                    keyboardType="phone-pad"
                    autoFocus
                    accessibilityLabel="Edit emergency phone number"
                  />
                  <TouchableOpacity
                    style={styles.contactSaveBtn}
                    onPress={() => {
                      setIsEditingContact(false);
                      announceSetting('Emergency Contact Number', draftContact);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Save emergency contact number"
                  >
                    <Ionicons name="checkmark" size={20} color="#08080f" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.contactDisplayRow}>
                  <Text style={styles.contactText}>{draftContact}</Text>
                  <TouchableOpacity
                    style={styles.contactEditBtn}
                    onPress={() => setIsEditingContact(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Change emergency contact number"
                  >
                    <Ionicons name="pencil" size={18} color="#00e5ff" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* ── Save Button ── */}
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary, { marginTop: 8 }]}
          onPress={handleSave}
          accessibilityRole="button"
          accessibilityLabel="Save all settings"
        >
          <Text style={styles.btnText}>Save Settings</Text>
        </TouchableOpacity>

        {/* ── About Card ── */}
        <View style={styles.aboutCard}>
          <View style={styles.aboutHeader}>
            <View style={styles.aboutLogoWrap}>
              <Ionicons name="eye" size={24} color="#00e5ff" />
            </View>
            <View>
              <Text style={styles.aboutTitle}>EchoSight</Text>
              <Text style={styles.aboutVersion}>Version 1.0.0</Text>
            </View>
          </View>
          <Text style={styles.aboutText}>
            EchoSight is an accessibility companion designed to empower visually impaired users with real-time AI spatial awareness, text reading, and emergency safety features.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#08080f',
  },
  scroll: {
    padding: 20,
    paddingBottom: 48,
    gap: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 16,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Surface.dimmed,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#e0e0ff',
  },
  section: {
    backgroundColor: Surface.card,
    borderRadius: Radius.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: Surface.cardBorder,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7070aa',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },
  field: {
    gap: 8,
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#5050aa',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    backgroundColor: '#08080f',
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
    backgroundColor: '#08080f',
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
    backgroundColor: '#08080f',
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
    fontSize: 12,
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
    backgroundColor: '#08080f',
    borderWidth: 1,
    borderColor: '#00e5ff44',
  },
  btnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#08080f',
  },
  btnSecondaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#00e5ff',
  },

  /* Segmented Control */
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#08080f',
    borderRadius: Radius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  segmentButtonActive: {
    backgroundColor: '#00e5ff18',
    borderWidth: 1,
    borderColor: '#00e5ff44',
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  segmentTextActive: {
    color: '#00e5ff',
    fontWeight: '700',
  },

  /* Volume Controller */
  volumeController: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  volumeBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: '#08080f',
    borderWidth: 1,
    borderColor: '#ffffff14',
    justifyContent: 'center',
    alignItems: 'center',
  },
  volumeBarContainer: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#08080f',
    overflow: 'hidden',
  },
  volumeBarActive: {
    height: '100%',
    backgroundColor: '#00e5ff',
  },

  /* Setting Row Item */
  settingRowItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E5E7EB',
  },

  /* Emergency Contact */
  contactContainer: {
    backgroundColor: '#08080f',
    borderRadius: Radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: '#ffffff14',
  },
  contactDisplayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  contactText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  contactEditBtn: {
    padding: 6,
  },
  contactEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contactInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    padding: 0,
  },
  contactSaveBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    backgroundColor: '#00e5ff',
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* About Card */
  aboutCard: {
    backgroundColor: '#0b0c10',
    borderRadius: Radius.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.1)',
  },
  aboutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  aboutLogoWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.2)',
  },
  aboutTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  aboutVersion: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7070aa',
  },
  aboutText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#9CA3AF',
  },
});
