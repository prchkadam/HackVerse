/**
 * SpatialAudioService
 *
 * Decodes raw 16-bit PCM audio chunks returned by the Gemini Live API
 * and plays them through a StereoPannerNode for left/right spatial routing.
 *
 * KEY FIX: Manually resamples 24kHz Gemini audio → device native rate
 * (usually 44100 or 48000 Hz) to ensure correct speed and pitch.
 * Chunks are scheduled sequentially for smooth continuous speech.
 */
import { AudioContext } from 'react-native-audio-api';

const GEMINI_RATE = 24_000; // Gemini native-audio output rate

// ─── Pure JS Base64 → Uint8Array (React Native compatible) ─────────────────────
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Uint8Array(256);
for (let i = 0; i < CHARS.length; i++) {
  LOOKUP[CHARS.charCodeAt(i)] = i;
}

function base64ToUint8Array(b64: string): Uint8Array {
  const str = b64.replace(/=+$/, '').replace(/\s/g, '');
  const len = str.length;
  const bufferLength = Math.floor((len * 3) / 4);
  const bytes = new Uint8Array(bufferLength);

  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const c1 = LOOKUP[str.charCodeAt(i)] || 0;
    const c2 = LOOKUP[str.charCodeAt(i + 1)] || 0;
    const c3 = i + 2 < len ? LOOKUP[str.charCodeAt(i + 2)] || 0 : 0;
    const c4 = i + 3 < len ? LOOKUP[str.charCodeAt(i + 3)] || 0 : 0;

    const chunk = (c1 << 18) | (c2 << 12) | (c3 << 6) | c4;

    if (p < bufferLength) bytes[p++] = (chunk >> 16) & 0xff;
    if (p < bufferLength) bytes[p++] = (chunk >> 8) & 0xff;
    if (p < bufferLength) bytes[p++] = chunk & 0xff;
  }
  return bytes;
}

// ─── 16-bit little-endian PCM → Float32 normalised ────────────────────────────
function pcmToFloat32(raw: Uint8Array): Float32Array {
  const samples = raw.length >> 1;
  const f32     = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const lo  = raw[i * 2];
    const hi  = raw[i * 2 + 1];
    let val = (hi << 8) | lo;
    if (val >= 0x8000) val -= 0x10000;
    f32[i] = val / 32_768;
  }
  return f32;
}

// ─── Resample audio using linear interpolation ────────────────────────────────
// Converts from srcRate (e.g. 24000) → dstRate (e.g. 48000) so audio plays
// at the correct speed and pitch on the device.
function resample(samples: Float32Array, srcRate: number, dstRate: number): Float32Array {
  if (srcRate === dstRate) return samples;

  const ratio = dstRate / srcRate;   // e.g. 48000/24000 = 2.0
  const outLen = Math.round(samples.length * ratio);
  const out = new Float32Array(outLen);

  for (let i = 0; i < outLen; i++) {
    const srcPos = i / ratio;
    const lo = Math.floor(srcPos);
    const hi = Math.min(lo + 1, samples.length - 1);
    const frac = srcPos - lo;
    out[i] = samples[lo] * (1 - frac) + samples[hi] * frac;
  }

  return out;
}

// ─── Service class ────────────────────────────────────────────────────────────
export class SpatialAudioService {
  private ctx:          AudioContext | null = null;
  private pan:          number              = 0;
  private nextPlayTime: number              = 0;
  private chunksPlayed: number              = 0;
  private deviceRate:   number              = 48000; // Will be updated from context

  /** Lazily create the AudioContext on first use */
  private _getContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.deviceRate = this.ctx.sampleRate || 48000;
      this.nextPlayTime = 0;
      console.log(`[Audio] AudioContext created, device sample rate: ${this.deviceRate}Hz`);
    }
    return this.ctx;
  }

  /**
   * Decode a base64-encoded PCM chunk and schedule it for sequential playback.
   * Resamples from Gemini's 24kHz to the device's native rate for correct pitch.
   */
  async playPcmChunk(pcmBase64: string, pan: number): Promise<void> {
    this.pan = pan;
    const ctx = this._getContext();

    try {
      // 1. Decode base64 → PCM → Float32
      const raw  = base64ToUint8Array(pcmBase64);
      const f32  = pcmToFloat32(raw);

      if (f32.length === 0) return;

      // 2. Resample from Gemini's 24kHz → device native rate
      const resampled = resample(f32, GEMINI_RATE, this.deviceRate);

      // 3. Create AudioBuffer at the device's native sample rate
      const buffer = ctx.createBuffer(1, resampled.length, this.deviceRate);
      const channelData = buffer.getChannelData(0);
      channelData.set(resampled);

      // 4. Build audio graph: Source → Panner → Destination
      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const panner      = ctx.createStereoPanner();
      panner.pan.value  = Math.max(-1, Math.min(1, pan));

      source.connect(panner);
      panner.connect(ctx.destination);

      // 5. Schedule sequentially (snap to now if we've fallen behind)
      const now = ctx.currentTime;
      if (this.nextPlayTime < now) {
        this.nextPlayTime = now;
      }

      source.start(this.nextPlayTime);
      this.nextPlayTime += buffer.duration;

      this.chunksPlayed++;
      if (this.chunksPlayed <= 3 || this.chunksPlayed % 30 === 0) {
        console.log(
          `[Audio] Chunk #${this.chunksPlayed}: ${f32.length} → ${resampled.length} samples ` +
          `(${GEMINI_RATE}→${this.deviceRate}Hz), dur: ${buffer.duration.toFixed(3)}s`
        );
      }
    } catch (err) {
      console.warn('[SpatialAudio] Error playing chunk:', err);
    }
  }

  /** Update pan for subsequent chunks */
  setPan(value: number): void {
    this.pan = Math.max(-1, Math.min(1, value));
  }

  /** Get current pan value */
  get currentPan(): number {
    return this.pan;
  }

  /** Release AudioContext resources */
  async stop(): Promise<void> {
    if (this.ctx) {
      await this.ctx.close();
      this.ctx = null;
    }
    this.pan = 0;
    this.nextPlayTime = 0;
    this.chunksPlayed = 0;
  }
}

export const spatialAudio = new SpatialAudioService();
