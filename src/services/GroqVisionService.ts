/**
 * GroqVisionService
 *
 * REST client for Groq's OpenAI-compatible vision API.
 * Sends base64 JPEG frames and receives text descriptions.
 *
 * Endpoint: POST https://api.groq.com/openai/v1/chat/completions
 */

// ─── Available models for Groq ─────────────────────────────────
export const GROQ_MODELS = [
  {
    id: 'meta-llama/llama-4-scout-17b-16e-instruct',
    label: 'Llama 4 Scout 17B',
    description: 'Extremely fast 17B multimodal model, great for real-time analysis',
    size: '17B',
  },
  {
    id: 'qwen/qwen3.6-27b',
    label: 'Qwen 3.6 27B',
    description: 'Powerful 27B vision model with thinking mode capabilities',
    size: '27B',
  },
] as const;

export type GroqModelId = (typeof GROQ_MODELS)[number]['id'];

const API_BASE = 'https://api.groq.com/openai/v1';

const SYSTEM_PROMPT =
  'You are a navigation assistant for a blind person. ' +
  'Analyze the image and describe what is directly ahead in ONE short sentence. ' +
  'Mention direction (left, right, ahead) and distance (steps). ' +
  'Warn immediately about hazards like stairs, cars, curbs, or glass doors. ' +
  'Be concise. Never use markdown, bullet points, or formatting. ' +
  'Example: "Chair about two steps ahead on your left."';

export type StatusCallback = (status: 'idle' | 'processing' | 'error') => void;

export class GroqVisionService {
  private apiKey: string = '';
  private model: string = GROQ_MODELS[0].id;
  private abortController: AbortController | null = null;
  private isProcessing: boolean = false;
  private rateLimitUntil: number = 0;

  onStatusChange: StatusCallback = () => { };

  /** Set the API key */
  setApiKey(key: string): void {
    this.apiKey = key;
  }

  /** Set the model to use */
  setModel(modelId: string): void {
    this.model = modelId;
    console.log(`[Groq] Model set to: ${modelId}`);
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
      console.warn('[Groq] No API key set');
      return null;
    }

    // Skip this frame if we are already processing one to avoid flooding the server
    if (this.isProcessing) {
      console.log('[Groq] Skipping frame — still processing previous request');
      return null;
    }

    if (Date.now() < this.rateLimitUntil) {
      console.log(`[Groq] Skipping frame — rate limited for ${Math.ceil((this.rateLimitUntil - Date.now()) / 1000)}s`);
      return null;
    }

    this.isProcessing = true;
    this.abortController = new AbortController();
    this.onStatusChange('processing');

    const startTime = Date.now();
    
    // Add a 15-second timeout so the scan doesn't hang indefinitely if the server stalls
    const timeoutId = setTimeout(() => {
      if (this.abortController) {
        console.warn('[Groq] Request timed out (15s), aborting');
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
        console.warn(`[Groq] API error ${response.status}:`, errorBody);

        if (response.status === 429) {
          let backoffMs = 5000;
          const retryAfter = response.headers.get('retry-after');
          if (retryAfter) {
            const parsed = parseInt(retryAfter, 10);
            if (!isNaN(parsed)) backoffMs = parsed * 1000;
          } else {
            const matchS = errorBody.match(/try again in ([\d\.]+)s/);
            if (matchS && matchS[1]) backoffMs = parseFloat(matchS[1]) * 1000;
            else {
              const matchMs = errorBody.match(/try again in ([\d\.]+)ms/);
              if (matchMs && matchMs[1]) backoffMs = parseFloat(matchMs[1]);
            }
          }
          this.rateLimitUntil = Date.now() + backoffMs + 1000; // Add 1s padding
        }

        this.onStatusChange('error');
        return null;
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content?.trim() || '';
      const elapsed = Date.now() - startTime;

      console.log(`[Groq] Response in ${elapsed}ms (${this.model}): "${text.substring(0, 80)}"`);
      this.onStatusChange('idle');
      return text || null;
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.message?.includes('canceled') || err?.message?.includes('aborted')) {
        console.log('[Groq] Request was aborted/cancelled');
        return null;
      }
      console.warn('[Groq] Request failed:', err?.message || err);
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
      'You are assisting a blind user. Your primary task is to read all visible text verbatim.\n\n' +
        '1. If there is text, read it aloud. Be highly accurate.\n' +
        '2. If (and ONLY if) you see CURRENCY BANKNOTES, you must also count the faces/portraits on the bills, and append this exact JSON block at the VERY END of your response:\n' +
        'NOTES: {"bills": [{"denomination": 100, "currency": "US Dollar", "count": 1}]}\n\n' +
        'If there is no text and no currency, output exactly: "No text detected".',
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
      console.warn('[Groq] No API key set');
      return null;
    }

    if (this.isProcessing) {
      console.log('[Groq] Cancelling background frame to prioritize custom request');
      this.cancel();
    }

    if (Date.now() < this.rateLimitUntil) {
      console.log(`[Groq] Custom request blocked — rate limited for ${Math.ceil((this.rateLimitUntil - Date.now()) / 1000)}s`);
      return null;
    }

    this.isProcessing = true;
    this.abortController = new AbortController();
    this.onStatusChange('processing');

    const startTime = Date.now();
    
    // Custom scans get a much longer timeout (30s)
    const timeoutId = setTimeout(() => {
      if (this.abortController) {
        console.warn('[Groq] Request timed out (30s), aborting');
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
          max_tokens: Math.min(maxTokens, 4096),
          temperature: 0.5,
        }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'unknown');
        console.warn(`[Groq] Custom API error ${response.status}:`, errorBody);

        if (response.status === 429) {
          let backoffMs = 5000;
          const retryAfter = response.headers.get('retry-after');
          if (retryAfter) {
            const parsed = parseInt(retryAfter, 10);
            if (!isNaN(parsed)) backoffMs = parsed * 1000;
          } else {
            const matchS = errorBody.match(/try again in ([\d\.]+)s/);
            if (matchS && matchS[1]) backoffMs = parseFloat(matchS[1]) * 1000;
            else {
              const matchMs = errorBody.match(/try again in ([\d\.]+)ms/);
              if (matchMs && matchMs[1]) backoffMs = parseFloat(matchMs[1]);
            }
          }
          this.rateLimitUntil = Date.now() + backoffMs + 1000;
        }

        this.onStatusChange('error');
        return null;
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content?.trim() || '';
      const elapsed = Date.now() - startTime;

      console.log(`[Groq] Custom Response in ${elapsed}ms: "${text.substring(0, 80)}"`);
      this.onStatusChange('idle');
      return text || null;
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.message?.includes('canceled') || err?.message?.includes('aborted')) {
        console.log('[Groq] Custom Request was aborted/cancelled');
        return null;
      }
      console.warn('[Groq] Custom Request failed:', err?.message || err);
      this.onStatusChange('error');
      return null;
    } finally {
      clearTimeout(timeoutId);
      this.abortController = null;
      this.isProcessing = false;
    }
  }

  /**
   * Test the connection to Groq API.
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

export const groqService = new GroqVisionService();
