/**
 * TTSService — Device-native text-to-speech for EchoSight
 *
 * Uses expo-speech for instant, zero-latency voice output.
 * Features:
 *   - Speech queue with priority levels (hazard warnings interrupt)
 *   - Configurable speech rate and language
 *   - Spatial pan inference from text content
 */

import * as Speech from 'expo-speech';

export type SpeechPriority = 'normal' | 'hazard';

interface SpeechItem {
  text: string;
  priority: SpeechPriority;
  pan: number; // -1.0 … +1.0 inferred from text
}

// ─── Pan inference from text (same logic as GeminiLiveService) ────────────────
function inferPanFromText(text: string): number {
  const lower = text.toLowerCase();
  if (lower.includes('left')) return -0.8;
  if (lower.includes('right')) return 0.8;
  if (lower.includes('front') || lower.includes('ahead') || lower.includes('center')) return 0.0;
  return 0.0;
}

export class TTSService {
  private queue: SpeechItem[] = [];
  private isSpeaking: boolean = false;
  private rate: number = 1.0;
  private language: string = 'en-US';

  // Callback when pan is inferred from speech content
  onPanChange: (pan: number) => void = () => {};

  /**
   * Speak text immediately. Hazard priority interrupts current speech.
   */
  speak(text: string, priority: SpeechPriority = 'normal'): void {
    if (!text.trim()) return;

    const pan = inferPanFromText(text);

    if (priority === 'hazard') {
      // Hazard: stop everything and speak immediately
      this.stop();
      this._speakNow(text, pan);
      return;
    }

    if (this.isSpeaking) {
      // Queue normal speech — but keep queue short (drop old items)
      if (this.queue.length >= 2) {
        this.queue.shift(); // drop oldest
      }
      this.queue.push({ text, priority, pan });
      return;
    }

    this._speakNow(text, pan);
  }

  private _speakNow(text: string, pan: number): void {
    this.isSpeaking = true;
    this.onPanChange(pan);

    Speech.speak(text, {
      rate: this.rate,
      language: this.language,
      onDone: () => {
        this.isSpeaking = false;
        this._processQueue();
      },
      onError: () => {
        this.isSpeaking = false;
        this._processQueue();
      },
      onStopped: () => {
        this.isSpeaking = false;
        // Don't process queue on stop — it was intentional
      },
    });
  }

  private _processQueue(): void {
    if (this.queue.length === 0) return;

    // Prioritize hazard items
    const hazardIdx = this.queue.findIndex(q => q.priority === 'hazard');
    const nextIdx = hazardIdx >= 0 ? hazardIdx : 0;
    const next = this.queue.splice(nextIdx, 1)[0];

    if (next) {
      this._speakNow(next.text, next.pan);
    }
  }

  /** Update speech rate (0.5 = slow, 1.0 = normal, 2.0 = fast) */
  setRate(rate: number): void {
    this.rate = Math.max(0.5, Math.min(2.0, rate));
  }

  /** Update language (e.g. 'en-US', 'hi-IN', 'es-ES') */
  setLanguage(lang: string): void {
    this.language = lang;
  }

  /** Stop all speech and clear queue */
  stop(): void {
    Speech.stop();
    this.queue = [];
    this.isSpeaking = false;
  }

  /** Check if currently speaking */
  get speaking(): boolean {
    return this.isSpeaking;
  }
}

export const ttsService = new TTSService();
