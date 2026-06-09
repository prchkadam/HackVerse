/**
 * Root layout for EchoSight — Expo Router v4
 * Replaces the default template with a Stack navigator:
 *   /          → NavigatorScreen (full-screen camera)
 *   /settings  → SettingsScreen (modal)
 */

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// ─── Polyfills for React Native (Hermes) ──────────────────────────────────────
const g = globalThis as any;

if (typeof g.atob === 'undefined') {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
  }
  g.atob = (b64: string) => {
    const str = b64.replace(/=+$/, '').replace(/\s/g, '');
    const len = str.length;
    let binary = '';
    for (let i = 0; i < len; i += 4) {
      const c1 = lookup[str.charCodeAt(i)] || 0;
      const c2 = lookup[str.charCodeAt(i + 1)] || 0;
      const c3 = i + 2 < len ? lookup[str.charCodeAt(i + 2)] || 0 : 0;
      const c4 = i + 3 < len ? lookup[str.charCodeAt(i + 3)] || 0 : 0;
      const chunk = (c1 << 18) | (c2 << 12) | (c3 << 6) | c4;
      binary += String.fromCharCode((chunk >> 16) & 0xff);
      if (i + 2 < len) binary += String.fromCharCode((chunk >> 8) & 0xff);
      if (i + 3 < len) binary += String.fromCharCode(chunk & 0xff);
    }
    return binary;
  };
}

if (typeof g.btoa === 'undefined') {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  g.btoa = (input: string) => {
    let str = input;
    let output = '';
    for (let block = 0, charCode, i = 0, map = chars;
         str.charAt(i | 0) || (map = '=', i % 1);
         output += map.charAt(63 & block >> 8 - i % 1 * 8)) {
      charCode = str.charCodeAt(i += 3 / 4);
      if (charCode > 0xFF) {
        throw new Error("'btoa' failed: The string to be encoded contains characters outside of the Latin1 range.");
      }
      block = block << 8 | charCode;
    }
    return output;
  };
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown:      false,
            contentStyle:     { backgroundColor: '#08080f' },
            animation:        'slide_from_bottom',
          }}
        >
          <Stack.Screen
            name="index"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="settings"
            options={{
              presentation:      'modal',
              headerShown:       true,
              headerTitle:       'Settings',
              headerStyle:       { backgroundColor: '#08080f' },
              headerTintColor:   '#00e5ff',
              headerTitleStyle:  { fontWeight: '700' },
            }}
          />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
