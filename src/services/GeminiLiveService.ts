/**
 * GeminiLiveService
 *
 * Manages a stateful WebSocket connection to the Gemini Multimodal Live API.
 * Protocol: BidiGenerateContent (bidirectional streaming)
 * Input:  Base64 JPEG video frames  (realtime_input → media_chunks)
 * Output: Native PCM audio at 24kHz (server_content → inline_data)
 */

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export interface AudioChunk {
  /** Base64-encoded raw 16-bit PCM audio at 24 kHz */
  pcmBase64: string;
  /**
   * Inferred stereo pan from the AI's text transcript (if any).
   * -1.0 = hard left, 0.0 = centre, +1.0 = hard right
   */
  pan: number;
}

export type AudioChunkCallback = (chunk: AudioChunk) => void;
export type StatusChangeCallback = (status: ConnectionStatus) => void;
export type TranscriptCallback = (text: string) => void;

// ─── Gemini Live API endpoint ──────────────────────────────────────────────────
const WS_BASE =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

const MODEL = 'models/gemini-2.5-flash-native-audio-latest';

const SYSTEM_PROMPT =
  'You are a friendly navigation assistant helping a blind person walk safely. ' +
  'When you see camera frames, describe what is directly ahead in simple, natural speech. ' +
  'Talk like a helpful friend walking beside them. ' +
  'For example: "There\'s a brown sofa about three steps ahead." or "Clear path, you\'re good to go." ' +
  'NEVER use headings, bullet points, bold text, or markdown formatting. ' +
  'Keep every response to one or two short sentences. ' +
  'Immediately warn about hazards like stairs, cars, or obstacles in the path.';

// Temporary hardcode for demo — remove before sharing code!
const API_KEY = '';

// ─── Connection retry config ──────────────────────────────────────────────────
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // ms between retries (exponential backoff)

// ─── Pan inference from transcript text ───────────────────────────────────────
function inferPanFromText(text: string): number {
  const lower = text.toLowerCase();
  if (lower.includes('left')) return -0.8;
  if (lower.includes('right')) return 0.8;
  if (lower.includes('front') || lower.includes('ahead') || lower.includes('center')) return 0.0;
  return 0.0; // default: centre
}

// ─── Decode WebSocket message data (React Native / Hermes compatible) ─────────
//
// React Native's Hermes engine may deliver WebSocket messages as Blob-like
// objects where `data instanceof Blob` returns FALSE because the constructor
// differs from the global Blob. We use duck-typing instead.
//
async function getEventDataText(data: any): Promise<string> {
  // 1. Already a string — most common case
  if (typeof data === 'string') {
    return data;
  }

  // 2. Blob-like object with .text() method (modern Blob API)
  if (data && typeof data.text === 'function') {
    try {
      return await data.text();
    } catch {
      // Fall through to other strategies
    }
  }

  // 3. ArrayBuffer
  if (data instanceof ArrayBuffer) {
    return arrayBufferToString(new Uint8Array(data));
  }

  // 4. TypedArray / DataView
  if (ArrayBuffer.isView(data)) {
    return arrayBufferToString(new Uint8Array((data as any).buffer, (data as any).byteOffset, (data as any).byteLength));
  }

  // 5. Blob-like object with .arrayBuffer() method
  if (data && typeof data.arrayBuffer === 'function') {
    try {
      const ab = await data.arrayBuffer();
      return arrayBufferToString(new Uint8Array(ab));
    } catch {
      // Fall through
    }
  }

  // 6. Blob-like object — use FileReader as last resort
  if (data && typeof data.size === 'number' && typeof FileReader !== 'undefined') {
    try {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(data);
      });
    } catch {
      // Fall through
    }
  }

  // 7. Absolute fallback — convert to string
  console.warn('[Gemini] Unknown message data type:', typeof data, Object.prototype.toString.call(data));
  return String(data);
}

/** Convert Uint8Array to string (UTF-8 safe for ASCII JSON) */
function arrayBufferToString(bytes: Uint8Array): string {
  // For small payloads, String.fromCharCode is fine.
  // For large payloads, process in chunks to avoid stack overflow.
  const CHUNK = 8192;
  let result = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    result += String.fromCharCode.apply(null, slice as any);
  }
  return result;
}

// ─── Service ──────────────────────────────────────────────────────────────────
export class GeminiLiveService {
  private ws: WebSocket | null = null;
  private apiKey: string = '';
  private lastPan: number = 0;
  private setupSent: boolean = false;
  private connectAborted: boolean = false;
  private framesSent: number = 0;
  private audioChunksReceived: number = 0;
  private waitingForResponse: boolean = false;

  // Callbacks
  onAudioChunk: AudioChunkCallback = () => { };
  onStatusChange: StatusChangeCallback = () => { };
  onTranscript: TranscriptCallback = () => { };

  // ── Connect (with automatic retry) ──────────────────────────────────────────
  async connect(apiKey: string): Promise<void> {
    this.apiKey = apiKey || API_KEY;
    this.connectAborted = false;
    this.framesSent = 0;
    this.audioChunksReceived = 0;
    this.waitingForResponse = false;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (this.connectAborted) {
        throw new Error('Connection aborted by user');
      }

      try {
        console.log(`[Gemini] Connection attempt ${attempt + 1}/${MAX_RETRIES}...`);
        await this._connectOnce();
        console.log('[Gemini] Connected successfully!');
        return; // success!
      } catch (err: any) {
        console.warn(`[Gemini] Attempt ${attempt + 1} failed:`, err?.message || err);

        if (this.connectAborted) {
          throw new Error('Connection aborted by user');
        }

        if (attempt < MAX_RETRIES - 1) {
          const delay = RETRY_DELAYS[attempt] || 4000;
          console.log(`[Gemini] Retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    throw new Error(`Failed to connect after ${MAX_RETRIES} attempts`);
  }

  private _connectOnce(): Promise<void> {
    this.setupSent = false;

    return new Promise((resolve, reject) => {
      this.onStatusChange('connecting');

      const url = `${WS_BASE}?key=${encodeURIComponent(this.apiKey)}`;
      console.log('[Gemini] Opening WebSocket to:', url.substring(0, 80) + '...');

      const ws = new WebSocket(url);
      this.ws = ws;

      // Track whether this promise has been settled
      let settled = false;
      const settle = (fn: () => void) => {
        if (!settled) {
          settled = true;
          fn();
        }
      };

      // Connection timeout — if setup isn't complete within 15 seconds, fail
      const timeout = setTimeout(() => {
        settle(() => {
          console.warn('[Gemini] Connection timed out (15s)');
          try { ws.close(); } catch { }
          reject(new Error('Connection timed out'));
        });
      }, 15_000);

      ws.onopen = () => {
        console.log('[Gemini] WebSocket opened, sending setup...');
        // Send setup message immediately on open
        const setupMsg = {
          setup: {
            model: MODEL,
            generation_config: {
              response_modalities: ['AUDIO'],
              speech_config: {
                voice_config: {
                  prebuilt_voice_config: {
                    voice_name: 'Kore',
                  },
                },
              },
            },
            system_instruction: {
              parts: [{ text: SYSTEM_PROMPT }],
            },
          },
        };
        ws.send(JSON.stringify(setupMsg));
        this.setupSent = true;
        console.log('[Gemini] Setup message sent');
      };

      ws.onmessage = async (event: WebSocketMessageEvent) => {
        try {
          const text = await getEventDataText(event.data);
          console.log('[Gemini] Message received, length:', text.length, 'preview:', text.substring(0, 100));
          const data = JSON.parse(text);
          this._handleMessage(data, () => {
            clearTimeout(timeout);
            settle(() => resolve());
          });
        } catch (err) {
          console.warn('[Gemini] Failed to parse message:', err);
          console.warn('[Gemini] Data type:', typeof event.data, Object.prototype.toString.call(event.data));
          // Don't reject on parse errors — the WS is still open
        }
      };

      ws.onerror = (err) => {
        console.error('[Gemini] WebSocket error event fired');
        // Don't reject immediately — onclose will follow with more info
        // Only reject if we haven't connected yet
      };

      ws.onclose = (event) => {
        clearTimeout(timeout);
        console.log('[Gemini] WS closed:', event.code, event.reason);
        this.onStatusChange('disconnected');
        settle(() => {
          reject(new Error(`WebSocket closed: ${event.code} ${event.reason || 'no reason'}`));
        });
      };
    });
  }

  // ── Message handler ────────────────────────────────────────────────────────
  private _handleMessage(data: Record<string, unknown>, resolveConnect?: () => void) {
    // Setup acknowledged → we are connected
    if (data.setupComplete !== undefined) {
      console.log('[Gemini] Setup complete — fully connected!');
      this.onStatusChange('connected');
      resolveConnect?.();
      return;
    }

    // Server content with audio / transcript
    const serverContent = data.serverContent as Record<string, unknown> | undefined;
    if (!serverContent) {
      // Log any unknown message types for debugging
      console.log('[Gemini] Unknown message type, keys:', Object.keys(data).join(', '));
      return;
    }

    // Check if the model's turn is complete (we can send the next frame)
    if (serverContent.turnComplete) {
      console.log('[Gemini] ✅ Model turn complete — ready for next frame');
      this.waitingForResponse = false;
    }

    const modelTurn = serverContent.modelTurn as Record<string, unknown> | undefined;
    if (!modelTurn) return;

    const parts = modelTurn.parts as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(parts)) return;

    for (const part of parts) {
      // ── Text transcript (for pan inference) ──
      if (typeof part.text === 'string') {
        const text = part.text;
        console.log('[Gemini] 📝 Transcript received:', text.substring(0, 100));
        this.lastPan = inferPanFromText(text);
        this.onTranscript(text);
      }

      // ── Inline audio data (PCM) ──
      const inlineData = part.inlineData as Record<string, unknown> | undefined;
      if (inlineData) {
        const mimeType = inlineData.mimeType as string | undefined;
        const pcmBase64 = inlineData.data as string | undefined;
        if (pcmBase64 && mimeType?.startsWith('audio/')) {
          this.audioChunksReceived++;
          console.log(`[Gemini] 🔊 Audio chunk #${this.audioChunksReceived}, mime: ${mimeType}, size: ${(pcmBase64.length / 1024).toFixed(1)}KB`);
          this.onAudioChunk({
            pcmBase64,
            pan: this.lastPan,
          });
        }
      }
    }
  }

  // ── Send a JPEG frame as a conversational turn ───────────────────────────
  sendFrame(base64Jpeg: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.setupSent) {
      return;
    }

    // Don't send a new frame while the model is still responding to the previous one
    if (this.waitingForResponse) {
      console.log('[Gemini] Skipping frame — waiting for model response...');
      return;
    }

    this.framesSent++;
    this.waitingForResponse = true;
    console.log(`[Gemini] Sending frame #${this.framesSent} as clientContent, size: ${(base64Jpeg.length / 1024).toFixed(1)}KB`);

    // Send as a conversational turn with image + text prompt
    // This tells the model: "Here's what the camera sees, please respond"
    const msg = {
      clientContent: {
        turns: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: base64Jpeg,
                },
              },
              {
                text: 'What is in front of me right now? Tell me naturally in one short sentence.',
              },
            ],
          },
        ],
        turnComplete: true,
      },
    };

    this.ws.send(JSON.stringify(msg));
  }

  // ── Disconnect ─────────────────────────────────────────────────────────────
  disconnect(): void {
    this.connectAborted = true; // Stop any in-progress retry loop
    if (this.ws) {
      this.ws.close(1000, 'User stopped session');
      this.ws = null;
    }
    this.setupSent = false;
    this.lastPan = 0;
    this.onStatusChange('disconnected');
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.setupSent;
  }
}

export const geminiService = new GeminiLiveService();
