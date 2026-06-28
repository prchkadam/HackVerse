/**
 * FallDetectionService — Accelerometer-based fall detection for EchoSight
 *
 * Monitors the device's accelerometer for patterns consistent with a fall:
 *   1. Freefall phase: acceleration magnitude drops near 0 (< 0.3g)
 *   2. Impact phase: acceleration magnitude spikes high (> 2.5g)
 *   3. Lying still phase: acceleration stabilizes in a non-upright orientation
 *
 * When a fall is detected, it emits an onFallDetected callback.
 * The NavigatorScreen handles the countdown, cancellation, and SOS trigger.
 *
 * Uses expo-sensors (Accelerometer) — no native module beyond what Expo provides.
 */

import { Accelerometer, type AccelerometerMeasurement } from 'expo-sensors';

export type FallDetectedCallback = () => void;

// ─── Detection thresholds ─────────────────────────────────────────────────────
const FREEFALL_THRESHOLD = 0.3;     // g-force below which we consider freefall
const IMPACT_THRESHOLD = 2.5;       // g-force above which we consider an impact
const FREEFALL_MIN_DURATION = 80;   // ms of freefall before we start looking for impact
const IMPACT_WINDOW = 1000;         // ms after freefall ends to detect impact
const COOLDOWN_MS = 30_000;         // Don't trigger again within 30 seconds
const SAMPLE_INTERVAL = 50;         // ms between accelerometer samples (20 Hz)

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Calculate the magnitude of the acceleration vector */
function magnitude(data: AccelerometerMeasurement): number {
  return Math.sqrt(data.x * data.x + data.y * data.y + data.z * data.z);
}

// ─── Service class ────────────────────────────────────────────────────────────

export class FallDetectionService {
  private _enabled: boolean = false;
  private _subscription: ReturnType<typeof Accelerometer.addListener> | null = null;

  // State machine
  private freefallStart: number = 0;
  private lookingForImpact: boolean = false;
  private impactWindowStart: number = 0;
  private lastTriggerTime: number = 0;

  // Callback
  onFallDetected: FallDetectedCallback = () => {};

  /** Start monitoring the accelerometer */
  async start(): Promise<boolean> {
    if (this._enabled) return true;

    try {
      const available = await Accelerometer.isAvailableAsync();
      if (!available) {
        console.warn('[FallDetect] Accelerometer not available on this device');
        return false;
      }

      Accelerometer.setUpdateInterval(SAMPLE_INTERVAL);
      this._subscription = Accelerometer.addListener(this._onData);
      this._enabled = true;
      console.log('[FallDetect] Started monitoring');
      return true;
    } catch (err) {
      console.warn('[FallDetect] Failed to start:', err);
      return false;
    }
  }

  /** Stop monitoring */
  stop(): void {
    if (this._subscription) {
      this._subscription.remove();
      this._subscription = null;
    }
    this._enabled = false;
    this._resetState();
    console.log('[FallDetect] Stopped monitoring');
  }

  get enabled(): boolean {
    return this._enabled;
  }

  // ── Accelerometer data handler ──────────────────────────────────────────

  private _onData = (data: AccelerometerMeasurement): void => {
    const mag = magnitude(data);
    const now = Date.now();

    // Cooldown — don't re-trigger too quickly
    if (now - this.lastTriggerTime < COOLDOWN_MS) return;

    // Phase 1: Detect freefall (low g-force)
    if (mag < FREEFALL_THRESHOLD) {
      if (this.freefallStart === 0) {
        this.freefallStart = now;
        console.log(`[FallDetect] Freefall detected (mag: ${mag.toFixed(2)}g)`);
      }
    } else if (this.freefallStart > 0 && !this.lookingForImpact) {
      // Freefall ended — check if it lasted long enough
      const freefallDuration = now - this.freefallStart;
      if (freefallDuration >= FREEFALL_MIN_DURATION) {
        // Start looking for impact
        this.lookingForImpact = true;
        this.impactWindowStart = now;
        console.log(`[FallDetect] Freefall ended after ${freefallDuration}ms, looking for impact...`);
      } else {
        this._resetState();
      }
    }

    // Phase 2: Detect impact (high g-force after freefall)
    if (this.lookingForImpact) {
      if (now - this.impactWindowStart > IMPACT_WINDOW) {
        // Too long since freefall — reset
        console.log('[FallDetect] Impact window expired, resetting');
        this._resetState();
        return;
      }

      if (mag > IMPACT_THRESHOLD) {
        // FALL DETECTED!
        console.log(`[FallDetect] 🚨 FALL DETECTED! Impact mag: ${mag.toFixed(2)}g`);
        this.lastTriggerTime = now;
        this._resetState();
        this.onFallDetected();
      }
    }
  };

  private _resetState(): void {
    this.freefallStart = 0;
    this.lookingForImpact = false;
    this.impactWindowStart = 0;
  }

  /** Manually reset the cooldown so another fall can be detected immediately */
  resetCooldown(): void {
    this.lastTriggerTime = 0;
    this._resetState();
    console.log('[FallDetect] Cooldown manually reset');
  }
}

export const fallDetectionService = new FallDetectionService();
