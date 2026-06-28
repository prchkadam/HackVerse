/**
 * VoiceInputService — Microphone input for EchoSight voice Q&A
 *
 * Uses expo-av's Audio.Recording API to capture the user's spoken question.
 * The recording is converted to a text prompt that gets sent alongside the
 * next camera frame to Gemini for a context-aware answer.
 *
 * Flow:
 *   1. User triple-taps → startListening()
 *   2. Records audio for up to 8 seconds (or until stopListening() called)
 *   3. Returns the audio as base64 for Gemini's audio input
 *   4. Falls back to a text prompt if audio transcription isn't available
 *
 * Note: Since Gemini Multimodal Live API supports audio input natively,
 * we send the raw audio directly. For Featherless (text-only), we use
 * the device's speech recognition as a fallback.
 */
import { AudioModule, requestRecordingPermissionsAsync, setAudioModeAsync, RecordingPresets } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';

export type ListeningState = 'idle' | 'listening' | 'processing';
export type ListeningCallback = (state: ListeningState) => void;

const MAX_RECORDING_DURATION_MS = 8000; // Auto-stop after 8 seconds

export class VoiceInputService {
  private recording: InstanceType<typeof AudioModule.AudioRecorder> | null = null;
  private autoStopTimer: ReturnType<typeof setTimeout> | null = null;
  private _state: ListeningState = 'idle';
  private _lastAutoStopAudio: string | null = null; // Cache audio from auto-stop

  // Callbacks
  onStateChange: ListeningCallback = () => {};

  get state(): ListeningState {
    return this._state;
  }

  get isListening(): boolean {
    return this._state === 'listening';
  }

  /**
   * Start recording the user's voice.
   * Returns true if recording started successfully.
   */
  async startListening(): Promise<boolean> {
    if (this._state !== 'idle') {
      console.warn('[Voice] Already listening or processing');
      return false;
    }

    try {
      // Request microphone permission
      const { status } = await requestRecordingPermissionsAsync();
      if (status !== 'granted') {
        console.warn('[Voice] Microphone permission denied');
        return false;
      }

      // Configure audio mode for recording
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      // Create recorder with high quality preset
      const recording = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);

      // Prepare then start recording
      try {
        await recording.prepareToRecordAsync();
      } catch (prepErr) {
        console.warn('[Voice] prepareToRecordAsync failed, trying record() directly:', prepErr);
      }

      recording.record();

      this.recording = recording;
      this._setState('listening');

      console.log('[Voice] Recording started');

      // Auto-stop after MAX_RECORDING_DURATION_MS
      this.autoStopTimer = setTimeout(() => {
        console.log('[Voice] Auto-stop after max duration');
        this._autoStop();
      }, MAX_RECORDING_DURATION_MS);

      return true;
    } catch (err) {
      console.warn('[Voice] Failed to start recording:', err);
      this._setState('idle');
      return false;
    }
  }

  /**
   * Internal auto-stop: stop recording and cache the audio.
   * The onStateChange callback tells NavigatorScreen that recording stopped.
   * When the user triple-taps again, stopListening() returns the cached audio.
   */
  private async _autoStop(): Promise<void> {
    const base64 = await this._stopAndGetBase64();
    if (base64) {
      this._lastAutoStopAudio = base64;
      console.log(`[Voice] Auto-stop captured ${(base64.length / 1024).toFixed(1)}KB (cached for next triple-tap)`);
    }
    this._setState('idle');
  }

  /**
   * Stop recording and return the audio as base64.
   * Returns null if recording failed or was cancelled.
   * If recording was already auto-stopped, returns the cached audio.
   */
  async stopListening(): Promise<string | null> {
    if (this.autoStopTimer) {
      clearTimeout(this.autoStopTimer);
      this.autoStopTimer = null;
    }

    // If auto-stop already captured audio, return it
    if (this._lastAutoStopAudio) {
      const cached = this._lastAutoStopAudio;
      this._lastAutoStopAudio = null;
      console.log(`[Voice] Returning cached auto-stop audio (${(cached.length / 1024).toFixed(1)}KB)`);
      this._setState('idle');
      return cached;
    }

    if (!this.recording || (this._state !== 'listening' && this._state !== 'processing')) {
      this._setState('idle');
      return null;
    }

    this._setState('processing');

    const base64Audio = await this._stopAndGetBase64();
    this._setState('idle');
    return base64Audio;
  }

  /**
   * Internal helper to stop the recorder and read the result as base64.
   */
  private async _stopAndGetBase64(): Promise<string | null> {
    if (this.autoStopTimer) {
      clearTimeout(this.autoStopTimer);
      this.autoStopTimer = null;
    }

    const rec = this.recording;
    if (!rec) return null;

    try {
      await rec.stop();
      const uri = rec.uri;
      this.recording = null;

      if (!uri) {
        console.warn('[Voice] No recording URI after stop');
        return null;
      }

      // Reset audio mode back to playback
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });

      // Read the audio file as base64
      const base64Audio = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Clean up the temp file
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});

      console.log(`[Voice] Recording captured, size: ${(base64Audio.length / 1024).toFixed(1)}KB`);
      return base64Audio;
    } catch (err) {
      console.warn('[Voice] Failed to stop recording:', err);
      this.recording = null;
      return null;
    }
  }

  /**
   * Cancel the current recording without processing.
   */
  async cancel(): Promise<void> {
    if (this.autoStopTimer) {
      clearTimeout(this.autoStopTimer);
      this.autoStopTimer = null;
    }

    this._lastAutoStopAudio = null;

    if (this.recording) {
      try {
        await this.recording.stop();
      } catch {
        // Ignore — may already be stopped
      }
      this.recording = null;
    }

    this._setState('idle');
    console.log('[Voice] Recording cancelled');
  }

  private _setState(state: ListeningState): void {
    this._state = state;
    this.onStateChange(state);
  }
}

export const voiceInputService = new VoiceInputService();
