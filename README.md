# EchoSight 👁

**Real-time spatial-audio navigation assistant for visually impaired users**  
React Native · Expo EAS · Gemini Multimodal Live API · react-native-vision-camera · react-native-audio-api

---

## Architecture

```
Phone Camera (react-native-vision-camera)
     │  takePhoto() @ 1-2 FPS  →  base64 JPEG (expo-file-system)
     ▼
GeminiLiveService  ─── wss://generativelanguage.googleapis.com ───►  Gemini 2.5 Flash
     │                     WebSocket (BidiGenerateContent)            Native Audio
     │  realtime_input (image/jpeg chunks)
     │◄ server_content (PCM audio 24kHz + transcript)
     ▼
SpatialAudioService  (react-native-audio-api)
     AudioContext → StereoPannerNode (pan = -1…+1) → headphones
     Left obstacle → left ear  │  Right obstacle → right ear
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native + Expo ~56 (EAS Development Build) |
| Routing | Expo Router v4 |
| Vision | react-native-vision-camera v4 |
| AI | Gemini 2.5 Flash (Native Audio) via Multimodal Live WebSocket |
| Spatial Audio | react-native-audio-api (StereoPannerNode) |
| State | Zustand + AsyncStorage |
| Camera frame I/O | expo-file-system |

> ⚠ **Expo Go is NOT supported.** Must use an EAS Development Build.

---

## System Prompt

> *"You are an AI navigation assistant for a blind user. Analyze the video stream. Describe obstacles immediately in front, left, and right. Provide responses in native audio format. Be incredibly concise and immediately warn of hazards."*

---

## Quick Start

### 1. Install dependencies

```bash
cd echosight
npm install
```

### 2. Add your Gemini API key

Launch the app → long press anywhere → Settings → paste your key.  
Or set it in code at `src/services/GeminiLiveService.ts` for a hardcoded demo.

### 3. Build the development APK (Android)

```bash
# First time: configure EAS
npx eas-cli build:configure

# Build & download APK
npx eas-cli build --platform android --profile development
```

### 4. Start dev server after installing APK

```bash
npx expo start --dev-client
```

---

## Gesture Guide

| Gesture | Action |
|---------|--------|
| Single tap | Start / resume scanning |
| Double tap | Pause scanning |
| Long press (600ms) | Open Settings |

---

## Spatial Audio Mapping

| Transcript keyword | Pan value | Effect |
|-------------------|-----------|--------|
| "left" | -0.8 | Sound in left ear |
| "right" | +0.8 | Sound in right ear |
| "front" / "ahead" | 0.0 | Centered |

🎧 **Headphones required** for directional audio effect.

---

## Project Structure

```
echosight/
├── app.json                          ← Expo config + VisionCamera plugin
├── babel.config.js                   ← Worklets + Reanimated
├── eas.json                          ← EAS build profiles
├── src/
│   ├── app/
│   │   ├── _layout.tsx               ← Root Stack navigator
│   │   ├── index.tsx                 ← / → NavigatorScreen
│   │   └── settings.tsx              ← /settings → SettingsScreen
│   ├── screens/
│   │   ├── NavigatorScreen.tsx       ← Main camera + gesture UI
│   │   └── SettingsScreen.tsx        ← API key + preferences
│   ├── services/
│   │   ├── GeminiLiveService.ts      ← WebSocket ↔ Gemini Live API
│   │   ├── SpatialAudioService.ts    ← PCM decode + StereoPannerNode
│   │   └── CameraService.ts          ← takePhoto() interval capture
│   └── store/
│       └── useEchoStore.ts           ← Zustand global state
```
