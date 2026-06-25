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
    id: "meta-llama/llama-4-scout-17b-16e-instruct",
    label: "Llama 4 Scout 17B",
    description:
      "Extremely fast 17B multimodal model, great for real-time analysis",
    size: "17B",
  },
  {
    id: "qwen/qwen3.6-27b",
    label: "Qwen 3.6 27B",
    description: "Powerful 27B vision model with thinking mode capabilities",
    size: "27B",
  },
] as const;

export type GroqModelId = (typeof GROQ_MODELS)[number]["id"];

const API_BASE = "https://api.groq.com/openai/v1";

const SYSTEM_PROMPT =
  "You are a navigation assistant for a blind person. " +
  "Analyze the image and describe what is directly ahead in ONE short sentence. " +
  "Mention direction (left, right, ahead) and distance (steps). " +
  "Warn immediately about hazards like stairs, cars, curbs, or glass doors. " +
  "Be concise. Never use markdown, bullet points, or formatting. " +
  'Example: "Chair about two steps ahead on your left."';

export type StatusCallback = (status: "idle" | "processing" | "error") => void;

export class GroqVisionService {
  private apiKey: string = "";
  private model: string = GROQ_MODELS[0].id;
  private abortController: AbortController | null = null;
  private isProcessing: boolean = false;

  onStatusChange: StatusCallback = () => {};

  /** Set the API key */
  setApiKey(key: string): void {
    this.apiKey = key;
  }

  /** Set the model to use */
  setModel(modelId: string): void {
    this.model = modelId;
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
      console.warn("[Groq] No API key set");
      return null;
    }

    // Skip this frame if we are already processing one to avoid flooding the server
    if (this.isProcessing) {
      return null;
    }

    this.isProcessing = true;
    this.abortController = new AbortController();
    this.onStatusChange("processing");

    const startTime = Date.now();

    // Add a 15-second timeout so the scan doesn't hang indefinitely if the server stalls
    const timeoutId = setTimeout(() => {
      if (this.abortController) {
        console.warn("[Groq] Request timed out (15s), aborting");
        this.abortController.abort();
      }
    }, 15_000);

    try {
      const response = await fetch(`${API_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "system",
              content: SYSTEM_PROMPT,
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "What is directly in front of me right now?",
                },
                {
                  type: "image_url",
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
        const errorBody = await response.text().catch(() => "unknown");
        console.warn(`[Groq] API error ${response.status}:`, errorBody);
        this.onStatusChange("error");
        return null;
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content?.trim() || "";
      const elapsed = Date.now() - startTime;

      this.onStatusChange("idle");
      return text || null;
    } catch (err: any) {
      if (
        err?.name === "AbortError" ||
        err?.message?.includes("canceled") ||
        err?.message?.includes("aborted")
      ) {
        return null;
      }
      console.warn("[Groq] Request failed:", err?.message || err);
      this.onStatusChange("error");
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
      "You are identifying currency banknotes for a blind user.\n\n" +
        "CRITICAL RULES FOR COUNTING:\n" +
        "1. A single physical banknote has its denomination printed MULTIPLE TIMES (e.g. US Dollars have values in all 4 corners and on both left and right sides). Do NOT count these as multiple bills. It is just ONE bill.\n" +
        "2. THE BEST WAY TO COUNT: Count the central PORTRAITS (the historical figures/faces). Every banknote has exactly ONE portrait. If you see 7 faces, there are exactly 7 notes. Count the faces!\n" +
        "3. Alternatively, count the distinct rectangular paper boundaries.\n" +
        "4. Do NOT count denomination text occurrences. You must count physical pieces of paper/faces.\n\n" +
        "STEP 1: Look at the image and count how many separate PORTRAITS / distinct paper rectangles you see.\n" +
        "STEP 2: For each distinct bill you found, identify its denomination and currency.\n" +
        "STEP 3: Output a single line in this exact format at the very beginning of your response:\n" +
        'NOTES: {"total_bills": <number>, "bills": [{"denomination": <value>, "currency": "<name>", "count": <how_many_of_this_type>}]}\n\n' +
        "Example — if you see exactly one 100 US Dollar bill and exactly one 50 US Dollar bill (total 2 faces/notes):\n" +
        'NOTES: {"total_bills": 2, "bills": [{"denomination": 100, "currency": "US Dollar", "count": 1}, {"denomination": 50, "currency": "US Dollar", "count": 1}]}\n\n' +
        "After the NOTES line, transcribe any other visible non-currency text verbatim.\n" +
        'If no banknotes are visible, do not output a NOTES line. Just transcribe any visible text, or output "No text detected".',
      4096,
    );
  }

  /**
   * Analyze frame for Detailed Scene Description
   */
  async analyzeDetailedFrame(base64Jpeg: string): Promise<string | null> {
    return this._sendCustomFrame(
      base64Jpeg,
      "Describe everything you can see in this image in rich detail. Include the overall environment, all visible objects, people, colors, distances, the layout of the space, any text or signs, lighting conditions, and potential paths. Speak naturally as if painting a picture for a blind person. Be thorough but still use simple, clear language. No formatting.",
      1024,
    );
  }

  private async _sendCustomFrame(
    base64Jpeg: string,
    prompt: string,
    maxTokens: number,
  ): Promise<string | null> {
    if (!this.apiKey) {
      console.warn("[Groq] No API key set");
      return null;
    }

    if (this.isProcessing) {
      this.cancel();
    }

    this.isProcessing = true;
    this.abortController = new AbortController();
    this.onStatusChange("processing");

    const startTime = Date.now();

    // Custom scans get a much longer timeout (30s)
    const timeoutId = setTimeout(() => {
      if (this.abortController) {
        console.warn("[Groq] Request timed out (30s), aborting");
        this.abortController.abort();
      }
    }, 30_000);

    try {
      const response = await fetch(`${API_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "system",
              content:
                "You are an AI assistant helping a visually impaired user. Provide accurate and direct answers without formatting.",
            },
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                {
                  type: "image_url",
                  image_url: { url: `data:image/jpeg;base64,${base64Jpeg}` },
                },
              ],
            },
          ],
          max_tokens: Math.min(maxTokens, 2048),
          temperature: 0.5,
        }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "unknown");
        console.warn(`[Groq] Custom API error ${response.status}:`, errorBody);
        this.onStatusChange("error");
        return null;
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content?.trim() || "";
      const elapsed = Date.now() - startTime;

      this.onStatusChange("idle");
      return text || null;
    } catch (err: any) {
      if (
        err?.name === "AbortError" ||
        err?.message?.includes("canceled") ||
        err?.message?.includes("aborted")
      ) {
        return null;
      }
      console.warn("[Groq] Custom Request failed:", err?.message || err);
      this.onStatusChange("error");
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
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
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
    this.onStatusChange("idle");
  }

  get processing(): boolean {
    return this.isProcessing;
  }
}

export const groqService = new GroqVisionService();
