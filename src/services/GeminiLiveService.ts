/**
 * GeminiLiveService
 *
 * Uses the Gemini REST API (generateContent) to analyze camera frames.
 * Works with the FREE Gemini API tier — no WebSocket/BidiGenerateContent needed.
 *
 * Input:  Base64 JPEG video frames
 * Output: Text descriptions spoken via device TTS
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

// ─── Gemini REST API endpoint ──────────────────────────────────────────────────
const REST_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = 'gemini-2.0-flash';

const SYSTEM_PROMPT =
  'You are a friendly navigation assistant helping a blind person walk safely. ' +
  'When you see camera frames, describe what is directly ahead in simple, natural speech. ' +
  'Talk like a helpful friend walking beside them. ' +
  'For example: "There\'s a brown sofa about three steps ahead." or "Clear path, you\'re good to go." ' +
  'NEVER use headings, bullet points, bold text, or markdown formatting. ' +
  'Keep every response to one or two short sentences. ' +
  'Immediately warn about hazards like stairs, cars, or obstacles in the path.';

// ─── Pan inference from transcript text ───────────────────────────────────────
function inferPanFromText(text: string): number {
  const lower = text.toLowerCase();
  if (lower.includes('left')) return -0.8;
  if (lower.includes('right')) return 0.8;
  if (lower.includes('front') || lower.includes('ahead') || lower.includes('center')) return 0.0;
  return 0.0; // default: centre
}

// ─── Service ──────────────────────────────────────────────────────────────────
export class GeminiLiveService {
  private apiKey: string = '';
  private lastPan: number = 0;
  private _connected: boolean = false;
  private _textOnlyMode: boolean = false;
  private _aborted: boolean = false;
  private _processing: boolean = false;
  private _rateLimitedUntil: number = 0;
  private _consecutiveErrors: number = 0;
  private _priorityProcessing: boolean = false; // User-initiated requests take priority

  // Callbacks (same interface as before)
  onAudioChunk: AudioChunkCallback = () => {};
  onStatusChange: StatusChangeCallback = () => {};
  onTranscript: TranscriptCallback = () => {};
  onTextResponse: TranscriptCallback = () => {};

  // ── Connect (validate API key with a lightweight request) ──────────────────
  async connect(apiKey: string): Promise<void> {
    this.apiKey = apiKey ? apiKey.trim() : '';
    this._aborted = false;
    this._processing = false;
    this._rateLimitedUntil = 0;
    this._consecutiveErrors = 0;

    if (!this.apiKey) {
      console.warn('[Gemini] No API key provided');
      this.onStatusChange('error');
      throw new Error('No API key provided');
    }

    this.onStatusChange('connecting');
    console.log('[Gemini] REST mode — validating API key with model:', MODEL);

    // Actually validate the API key with a lightweight request
    try {
      const url = `${REST_BASE}/models/${MODEL}?key=${encodeURIComponent(this.apiKey)}`;
      const response = await fetch(url, { method: 'GET' });

      if (!response.ok) {
        const errText = await response.text();
        console.warn('[Gemini] API key validation failed:', response.status, errText.substring(0, 200));

        if (response.status === 400 || response.status === 403) {
          this.onStatusChange('error');
          throw new Error(`Invalid API key (HTTP ${response.status}). Please check your Gemini API key in settings.`);
        }
        if (response.status === 404) {
          // Model not found — might still work, proceed cautiously
          console.warn('[Gemini] Model not found, but proceeding...');
        } else {
          this.onStatusChange('error');
          throw new Error(`API validation failed (HTTP ${response.status})`);
        }
      } else {
        console.log('[Gemini] ✅ API key validated successfully');
      }
    } catch (err: any) {
      if (err?.message?.includes('Invalid API key') || err?.message?.includes('API validation failed')) {
        throw err;
      }
      // Network error — could be offline, proceed anyway since REST is stateless
      console.warn('[Gemini] Could not validate API key (network issue?):', err?.message);
    }

    this._connected = true;
    this.onStatusChange('connected');
    console.log('[Gemini] ✅ Ready! Will send frames via REST generateContent.');
  }

  // ── Core REST request helper ───────────────────────────────────────────────
  private async _request(parts: any[], systemText?: string): Promise<string | null> {
    if (!this._connected || this._aborted) return null;

    // Rate-limit cooldown: skip if we're still backing off
    if (Date.now() < this._rateLimitedUntil) {
      const secsLeft = Math.ceil((this._rateLimitedUntil - Date.now()) / 1000);
      console.log(`[Gemini] Rate-limited, skipping request (${secsLeft}s cooldown remaining)`);
      return null;
    }

    const url = `${REST_BASE}/models/${MODEL}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const body: any = {
      contents: [{ parts }],
      generationConfig: {
        maxOutputTokens: 4096,
        temperature: 0.7,
      },
    };

    // Add system instruction
    if (systemText) {
      body.systemInstruction = { parts: [{ text: systemText }] };
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn('[Gemini] REST error:', response.status, errText.substring(0, 200));

        this._consecutiveErrors++;

        // Rate-limited: back off for 30 seconds
        if (response.status === 429) {
          this._rateLimitedUntil = Date.now() + 30_000;
          console.warn('[Gemini] ⏳ Rate limited! Cooling down for 30 seconds...');
        }

        // Invalid API key
        if (response.status === 400 || response.status === 403) {
          console.error('[Gemini] ❌ API key appears invalid. Check your settings.');
          // After 3 consecutive auth errors, mark as error state
          if (this._consecutiveErrors >= 3) {
            this.onStatusChange('error');
          }
        }

        return null;
      }

      // Reset consecutive error counter on success
      this._consecutiveErrors = 0;

      const data = await response.json();
      const candidate = data?.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text;

      if (text) {
        console.log('[Gemini] 📝 Response:', text.substring(0, 100));
        return text;
      }

      console.warn('[Gemini] No text in response:', JSON.stringify(data).substring(0, 200));
      return null;
    } catch (err: any) {
      console.warn('[Gemini] REST request failed:', err?.message || err);
      this._consecutiveErrors++;
      if (this._consecutiveErrors >= 5) {
        this.onStatusChange('error');
      }
      return null;
    }
  }

  // ── Send a JPEG frame for navigation description ───────────────────────────
  sendFrame(base64Jpeg: string): void {
    if (this._processing || this._priorityProcessing) {
      console.log('[Gemini] Skipping frame — still processing previous...');
      return;
    }

    this._processing = true;
    this._sendFrameAsync(base64Jpeg).finally(() => {
      this._processing = false;
    });
  }

  private async _sendFrameAsync(base64Jpeg: string): Promise<void> {
    console.log(`[Gemini] Sending frame via REST, size: ${(base64Jpeg.length / 1024).toFixed(1)}KB`);

    const parts = [
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64Jpeg,
        },
      },
      {
        text: 'What is in front of me right now? Tell me naturally in one short sentence.',
      },
    ];

    const text = await this._request(parts, SYSTEM_PROMPT);
    if (text) {
      this.lastPan = inferPanFromText(text);
      this.onTranscript(text);
      this.onTextResponse(text);
    }
  }

  // ── Send a JPEG frame with a custom user question ──────────────────────────
  sendFrameWithQuestion(base64Jpeg: string, question: string): void {
    if (this._processing) return;
    this._processing = true;

    (async () => {
      console.log(`[Gemini] Sending frame with question: "${question.substring(0, 60)}"`);
      const parts = [
        { inlineData: { mimeType: 'image/jpeg', data: base64Jpeg } },
        { text: question },
      ];
      const text = await this._request(parts, SYSTEM_PROMPT);
      if (text) {
        this.lastPan = inferPanFromText(text);
        this.onTranscript(text);
        this.onTextResponse(text);
      }
    })().finally(() => { this._processing = false; });
  }

  // ── Send audio question with a JPEG frame ──────────────────────────────────
  /**
   * For REST mode, audio questions are not directly supported.
   * We fall back to sending the frame with a generic question prompt.
   */
  sendAudioQuestion(base64Jpeg: string, _base64Audio: string): void {
    // User-initiated — proceed even if regular frame is processing
    this._processing = true;
    this._priorityProcessing = true;

    (async () => {
      console.log('[Gemini] Audio question received — analyzing frame with REST...');
      const parts = [
        { inlineData: { mimeType: 'image/jpeg', data: base64Jpeg } },
        {
          text: 'The user is asking a question about what they see. Describe the scene in detail and answer any obvious questions about it. Be concise and natural.',
        },
      ];
      const text = await this._request(parts, SYSTEM_PROMPT);
      if (text) {
        this.lastPan = inferPanFromText(text);
        this.onTranscript(text);
        this.onTextResponse(text);
      }
    })().finally(() => { this._processing = false; this._priorityProcessing = false; });
  }

  // ── Send a JPEG frame for detailed scene description ───────────────────────
  async sendDetailedFrame(base64Jpeg: string): Promise<boolean> {
    // User-initiated — proceed even if regular frame is processing
    this._processing = true;
    this._priorityProcessing = true;

    try {
      console.log('[Gemini] Sending detailed scene description request');
      const parts = [
        { inlineData: { mimeType: 'image/jpeg', data: base64Jpeg } },
        {
          text: 'Describe everything you can see in this image in rich detail. ' +
            'Include the overall environment, all visible objects, people, colors, distances, ' +
            'the layout of the space, any text or signs, lighting conditions, and potential paths. ' +
            'Speak naturally as if painting a picture for a blind person. ' +
            'Be thorough but still use simple, clear language. No formatting.',
        },
      ];
      const text = await this._request(parts);
      if (text) {
        this.lastPan = inferPanFromText(text);
        this.onTranscript(text);
        this.onTextResponse(`Scene analysis: ${text}`);
        return true;
      }
      return false;
    } finally {
      this._processing = false;
      this._priorityProcessing = false;
    }
  }

  // ── Send a JPEG frame for OCR / text recognition ──────────────────────────
  async sendOcrFrame(base64Jpeg: string): Promise<boolean> {
    // User-initiated — proceed even if regular frame is processing
    this._processing = true;
    this._priorityProcessing = true;

    try {
      console.log('[Gemini] Sending OCR text recognition request');
      const parts = [
        { inlineData: { mimeType: 'image/jpeg', data: base64Jpeg } },
        {
          text: 'You are identifying currency banknotes for a blind user.\n\n' +
            'CRITICAL RULES FOR COUNTING:\n' +
            '1. A single physical banknote has its denomination printed MULTIPLE TIMES (e.g. US Dollars have values in all 4 corners and on both left and right sides). Do NOT count these as multiple bills. It is just ONE bill.\n' +
            '2. THE BEST WAY TO COUNT: Count the central PORTRAITS (the historical figures/faces). Every banknote has exactly ONE portrait. If you see 7 faces, there are exactly 7 notes. Count the faces!\n' +
            '3. Alternatively, count the distinct rectangular paper boundaries.\n' +
            '4. Do NOT count denomination text occurrences. You must count physical pieces of paper/faces.\n\n' +
            'STEP 1: Look at the image and count how many separate PORTRAITS / distinct paper rectangles you see.\n' +
            'STEP 2: For each distinct bill you found, identify its denomination and currency.\n' +
            'STEP 3: Output a single line in this exact format at the very beginning of your response:\n' +
            'NOTES: {"total_bills": <number>, "bills": [{"denomination": <value>, "currency": "<name>", "count": <how_many_of_this_type>}]}\n\n' +
            'Example — if you see exactly one 100 US Dollar bill and exactly one 50 US Dollar bill (total 2 faces/notes):\n' +
            'NOTES: {"total_bills": 2, "bills": [{"denomination": 100, "currency": "US Dollar", "count": 1}, {"denomination": 50, "currency": "US Dollar", "count": 1}]}\n\n' +
            'After the NOTES line, transcribe any other visible non-currency text verbatim.\n' +
            'If no banknotes are visible, do not output a NOTES line. Just transcribe any visible text, or output "No text detected".',
        },
      ];
      const text = await this._request(parts);
      if (text) {
        this.lastPan = inferPanFromText(text);
        this.onTranscript(text);
        const finalText = text.toLowerCase().includes('no text detected') || text.toLowerCase().includes('notes:')
          ? text
          : `Text found: ${text}`;
        this.onTextResponse(finalText);
        return true;
      }
      return false;
    } finally {
      this._processing = false;
      this._priorityProcessing = false;
    }
  }

  // ── Disconnect ─────────────────────────────────────────────────────────────
  disconnect(): void {
    this._aborted = true;
    this._connected = false;
    this._processing = false;
    this._priorityProcessing = false;
    this.lastPan = 0;
    this._consecutiveErrors = 0;
    this.onStatusChange('disconnected');
  }

  /** Enable text-only mode (kept for API compatibility — REST is always text) */
  set textOnlyMode(value: boolean) {
    this._textOnlyMode = value;
  }

  get textOnlyMode(): boolean {
    return this._textOnlyMode;
  }

  get isConnected(): boolean {
    return this._connected;
  }

  /** Alias kept for backward-compatibility with setup property */
  get setupSent(): boolean {
    return this._connected;
  }
}

export const geminiService = new GeminiLiveService();
