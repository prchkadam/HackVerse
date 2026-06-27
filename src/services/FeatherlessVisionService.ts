/**
 * FeatherlessVisionService
 *
 * REST client for Featherless.ai's OpenAI-compatible vision API.
 * Sends base64 JPEG frames and receives text descriptions.
 *
 * Endpoint: POST https://api.featherless.ai/v1/chat/completions
 * Supports streaming for faster first-token response.
 */

// ─── Available models for development testing ─────────────────────────────────
export const FEATHERLESS_MODELS = [
  {
    id: 'Qwen/Qwen3-VL-8B-Instruct',
    label: 'Qwen3 VL 8B (Recommended)',
    description: 'Fastest vision-language model, superb real-time object tracking',
    size: '8B',
  },
  {
    id: 'google/gemma-3-12b-it',
    label: 'Gemma 3 12B (Accurate)',
    description: 'Excellent vision accuracy, great details',
    size: '12B',
  },
] as const;

export type FeatherlessModelId = (typeof FEATHERLESS_MODELS)[number]['id'];

const API_BASE = 'https://api.featherless.ai/v1';

const SYSTEM_PROMPT =
  'You are a navigation assistant for a blind person. ' +
  'Analyze the image and describe what is directly ahead in ONE short sentence. ' +
  'Mention direction (left, right, ahead) and distance (steps). ' +
  'Warn immediately about hazards like stairs, cars, curbs, or glass doors. ' +
  'Be concise. Never use markdown, bullet points, or formatting. ' +
  'Example: "Chair about two steps ahead on your left."';

export type StatusCallback = (status: 'idle' | 'processing' | 'error') => void;

export class FeatherlessVisionService {
  private apiKey: string = '';
  private model: string = FEATHERLESS_MODELS[0].id;
  private abortController: AbortController | null = null;
  private isProcessing: boolean = false;

  onStatusChange: StatusCallback = () => { };

  /** Set the API key */
  setApiKey(key: string): void {
    this.apiKey = key;
  }

  /** Set the model to use */
  setModel(modelId: string): void {
    this.model = modelId;
    console.log(`[Featherless] Model set to: ${modelId}`);
  }

  /** Get current model */
  getModel(): string {
    return this.model;
  }

  /**
   * Send a base64 JPEG frame and get a text description back.
   * Returns the text response, or null if the request was aborted/failed.
   */
  async analyzeFrame(base64Jpeg: string): Promise<string | null> {
    if (!this.apiKey) {
      console.warn('[Featherless] No API key set');
      return null;
    }

    // Skip this frame if we are already processing one to avoid flooding the server
    if (this.isProcessing) {
      console.log('[Featherless] Skipping frame — still processing previous request');
      return null;
    }

    this.isProcessing = true;
    this.abortController = new AbortController();
    this.onStatusChange('processing');

    const startTime = Date.now();
    
    // Add a 15-second timeout so the scan doesn't hang indefinitely if the server stalls
    const timeoutId = setTimeout(() => {
      if (this.abortController) {
        console.warn('[Featherless] Request timed out (15s), aborting');
        this.abortController.abort();
      }
    }, 15_000);

    try {
      const response = await fetch(`${API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: SYSTEM_PROMPT,
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'What is directly in front of me right now?',
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Jpeg}`,
                  },
                },
              ],
            },
          ],
          max_tokens: 60,
          temperature: 0.3,
        }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'unknown');
        console.warn(`[Featherless] API error ${response.status}:`, errorBody);
        this.onStatusChange('error');
        return null;
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content?.trim() || '';
      const elapsed = Date.now() - startTime;

      console.log(`[Featherless] Response in ${elapsed}ms (${this.model}): "${text.substring(0, 80)}"`);
      this.onStatusChange('idle');
      return text || null;
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.message?.includes('canceled') || err?.message?.includes('aborted')) {
        console.log('[Featherless] Request was aborted/cancelled');
        return null;
      }
      console.warn('[Featherless] Request failed:', err?.message || err);
      this.onStatusChange('error');
      return null;
    } finally {
      clearTimeout(timeoutId);
      this.abortController = null;
      this.isProcessing = false;
    }
  }

  /**
   * Analyze frame for pure OCR Text Reading
   */
  async analyzeOcrFrame(base64Jpeg: string): Promise<string | null> {
    return this._sendCustomFrame(
      base64Jpeg,
      'You are assisting a blind user. Look closely at the image.\n\n' +
        'If you see ANY currency banknote, follow these CRITICAL RULES FOR COUNTING:\n' +
        '1. A single physical banknote has its denomination printed MULTIPLE TIMES. Do NOT count these as multiple bills. It is just ONE bill.\n' +
        '2. THE BEST WAY TO COUNT: Count the central PORTRAITS (the historical figures/faces). Every banknote has exactly ONE portrait. If you see 7 faces, there are exactly 7 notes. Count the faces!\n' +
        '3. Alternatively, count the distinct rectangular paper boundaries.\n' +
        '4. Do NOT count denomination text occurrences. You must count physical pieces of paper/faces.\n\n' +
        'STEP 1: Look at the image and count how many separate PORTRAITS / distinct paper rectangles you see.\n' +
        'STEP 2: For each distinct bill you found, identify its currency type and denomination.\n' +
        'STEP 3: Output a single line in this EXACT format at the very beginning of your response:\n' +
        'NOTES: {"total_bills": <number>, "bills": [{"denomination": <value>, "currency": "<name>", "count": <how_many_of_this_type>}]}\n' +
        'STEP 4: CRITICAL: If you output a NOTES JSON, DO NOT transcribe any other text around the note. Stop immediately after the JSON.\n\n' +
        'Example — if you see exactly one 100 US Dollar bill and exactly one 50 US Dollar bill (total 2 faces/notes):\n' +
        'NOTES: {"total_bills": 2, "bills": [{"denomination": 100, "currency": "US Dollar", "count": 1}, {"denomination": 50, "currency": "US Dollar", "count": 1}]}\n\n' +
        'If you DO NOT see any currency banknotes:\n' +
        '1. Transcribe any visible text verbatim.\n' +
        '2. If there is no text, output "No text detected".',
      4096
    );
  }

  /**
   * Analyze frame for Detailed Scene Description
   */
  async analyzeDetailedFrame(base64Jpeg: string): Promise<string | null> {
    return this._sendCustomFrame(
      base64Jpeg,
      'Describe everything you can see in this image in rich detail. Include the overall environment, all visible objects, people, colors, distances, the layout of the space, any text or signs, lighting conditions, and potential paths. Speak naturally as if painting a picture for a blind person. Be thorough but still use simple, clear language. No formatting.',
      1024
    );
  }

  private async _sendCustomFrame(base64Jpeg: string, prompt: string, maxTokens: number): Promise<string | null> {
    if (!this.apiKey) {
      console.warn('[Featherless] No API key set');
      return null;
    }

    if (this.isProcessing) {
      console.log('[Featherless] Cancelling background frame to prioritize custom request');
      this.cancel();
    }

    this.isProcessing = true;
    this.abortController = new AbortController();
    this.onStatusChange('processing');

    const startTime = Date.now();
    
    // Custom scans get a much longer timeout (30s)
    const timeoutId = setTimeout(() => {
      if (this.abortController) {
        console.warn('[Featherless] Request timed out (30s), aborting');
        this.abortController.abort();
      }
    }, 30_000);

    try {
      const response = await fetch(`${API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: 'You are an AI assistant helping a visually impaired user. Provide accurate and direct answers without formatting.' },
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Jpeg}` } },
              ],
            },
          ],
          max_tokens: Math.min(maxTokens, 2048),
          temperature: 0.5,
        }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'unknown');
        console.warn(`[Featherless] Custom API error ${response.status}:`, errorBody);
        this.onStatusChange('error');
        return null;
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content?.trim() || '';
      const elapsed = Date.now() - startTime;

      console.log(`[Featherless] Custom Response in ${elapsed}ms: "${text.substring(0, 80)}"`);
      this.onStatusChange('idle');
      return text || null;
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.message?.includes('canceled') || err?.message?.includes('aborted')) {
        console.log('[Featherless] Custom Request was aborted/cancelled');
        return null;
      }
      console.warn('[Featherless] Custom Request failed:', err?.message || err);
      this.onStatusChange('error');
      return null;
    } finally {
      clearTimeout(timeoutId);
      this.abortController = null;
      this.isProcessing = false;
    }
  }

  /**
   * Test the connection to Featherless API.
   * Returns true if successful.
   */
  async testConnection(apiKey: string, model?: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /** Cancel any in-flight request */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isProcessing = false;
    this.onStatusChange('idle');
  }

  get processing(): boolean {
    return this.isProcessing;
  }
}

export const featherlessService = new FeatherlessVisionService();
