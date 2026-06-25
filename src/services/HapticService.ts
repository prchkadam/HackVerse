/**
 * HapticService — Context-aware haptic feedback for EchoSight
 *
 * Provides directional vibration patterns that communicate obstacle
 * direction and urgency through the device's vibration motor.
 *
 * Direction encoding:
 *   LEFT   → 2 short pulses  (buzz-buzz)
 *   RIGHT  → 3 short pulses  (buzz-buzz-buzz)
 *   CENTER → 1 long pulse    (buuuzz)
 *
 * Urgency encoding:
 *   LOW    → gentle, longer pauses
 *   MEDIUM → moderate intensity
 *   HIGH   → rapid, intense pulses
 */

import { Vibration, Platform } from 'react-native';

export type HapticDirection = 'left' | 'right' | 'center';
export type HapticUrgency = 'low' | 'medium' | 'high';
export type HapticIntensity = 'low' | 'medium' | 'high';

// ─── Vibration pattern definitions ────────────────────────────────────────────
// Patterns are arrays of [pause, vibrate, pause, vibrate, ...]
// First element is always a pause (0 = no pause before start)

interface PatternConfig {
  vibrateDuration: number;  // ms per vibration pulse
  pauseDuration: number;    // ms between pulses
}

const URGENCY_TIMING: Record<HapticUrgency, PatternConfig> = {
  low:    { vibrateDuration: 60,  pauseDuration: 200 },
  medium: { vibrateDuration: 100, pauseDuration: 120 },
  high:   { vibrateDuration: 150, pauseDuration: 60 },
};

// Intensity multiplier for vibration duration
const INTENSITY_MULTIPLIER: Record<HapticIntensity, number> = {
  low:    0.6,
  medium: 1.0,
  high:   1.5,
};

// ─── Pattern builders ─────────────────────────────────────────────────────────

/**
 * Build a vibration pattern for LEFT direction: 2 short pulses
 */
function buildLeftPattern(urgency: HapticUrgency, intensity: HapticIntensity): number[] {
  const { vibrateDuration, pauseDuration } = URGENCY_TIMING[urgency];
  const vib = Math.round(vibrateDuration * INTENSITY_MULTIPLIER[intensity]);
  //  [pause, vibrate, pause, vibrate]
  return [0, vib, pauseDuration, vib];
}

/**
 * Build a vibration pattern for RIGHT direction: 3 short pulses
 */
function buildRightPattern(urgency: HapticUrgency, intensity: HapticIntensity): number[] {
  const { vibrateDuration, pauseDuration } = URGENCY_TIMING[urgency];
  const vib = Math.round(vibrateDuration * INTENSITY_MULTIPLIER[intensity]);
  return [0, vib, pauseDuration, vib, pauseDuration, vib];
}

/**
 * Build a vibration pattern for CENTER direction: 1 long pulse
 */
function buildCenterPattern(urgency: HapticUrgency, intensity: HapticIntensity): number[] {
  const { vibrateDuration } = URGENCY_TIMING[urgency];
  // Center gets a longer single pulse (2.5x the per-pulse duration)
  const vib = Math.round(vibrateDuration * 2.5 * INTENSITY_MULTIPLIER[intensity]);
  return [0, vib];
}

/**
 * Build the unmistakable HAZARD pattern: long-short-long (SOS-like)
 */
function buildHazardPattern(intensity: HapticIntensity): number[] {
  const mult = INTENSITY_MULTIPLIER[intensity];
  const longVib  = Math.round(300 * mult);
  const shortVib = Math.round(100 * mult);
  const pause    = 80;
  // long — short — short — long
  return [0, longVib, pause, shortVib, pause, shortVib, pause, longVib];
}

// ─── Direction inference from AI text ─────────────────────────────────────────

function inferDirection(text: string): HapticDirection {
  const lower = text.toLowerCase();
  if (lower.includes('left'))  return 'left';
  if (lower.includes('right')) return 'right';
  return 'center'; // default: ahead / center / unknown
}

function inferUrgency(text: string): HapticUrgency {
  const lower = text.toLowerCase();
  const highUrgencyWords = [
    'stop', 'danger', 'hazard', 'careful', 'warning',
    'stairs', 'traffic', 'car', 'urgent', 'watch out',
    'step down', 'step up', 'hole', 'edge', 'cliff',
  ];
  const mediumUrgencyWords = [
    'obstacle', 'object', 'chair', 'table', 'wall',
    'door', 'person', 'approaching', 'close', 'near',
    'curb', 'bump',
  ];

  if (highUrgencyWords.some(w => lower.includes(w))) return 'high';
  if (mediumUrgencyWords.some(w => lower.includes(w))) return 'medium';
  return 'low';
}

// ─── Service class ────────────────────────────────────────────────────────────

export class HapticService {
  private _enabled: boolean = true;
  private _intensity: HapticIntensity = 'medium';
  private _lastVibrationTime: number = 0;
  private _minInterval: number = 400; // minimum ms between vibrations to avoid overlap

  /** Enable or disable haptic feedback */
  set enabled(value: boolean) {
    this._enabled = value;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  /** Set the haptic intensity level */
  set intensity(value: HapticIntensity) {
    this._intensity = value;
  }

  get intensity(): HapticIntensity {
    return this._intensity;
  }

  /**
   * Trigger a directional vibration based on direction and urgency.
   * Call this directly if you already know the direction/urgency.
   */
  triggerDirectional(direction: HapticDirection, urgency: HapticUrgency): void {
    if (!this._enabled || !this._canVibrate()) return;

    let pattern: number[];
    switch (direction) {
      case 'left':
        pattern = buildLeftPattern(urgency, this._intensity);
        break;
      case 'right':
        pattern = buildRightPattern(urgency, this._intensity);
        break;
      case 'center':
      default:
        pattern = buildCenterPattern(urgency, this._intensity);
        break;
    }

    this._vibrate(pattern);
  }

  /**
   * Trigger the unmistakable HAZARD vibration pattern.
   * Use for immediate danger warnings (stairs, cars, edges).
   */
  triggerHazard(): void {
    if (!this._enabled) return;
    // Hazard always fires regardless of timing — safety first
    const pattern = buildHazardPattern(this._intensity);
    this._vibrate(pattern, true);
  }

  /**
   * Trigger a quick confirmation tap (e.g., gesture acknowledged).
   */
  triggerConfirmation(): void {
    if (!this._enabled) return;
    const vib = Math.round(40 * INTENSITY_MULTIPLIER[this._intensity]);
    Vibration.vibrate(vib);
    this._lastVibrationTime = Date.now();
  }

  /**
   * Auto-analyze AI description text and trigger the appropriate haptic.
   * This is the main entry point — call it with each AI response.
   */
  triggerFromDescription(text: string): void {
    if (!this._enabled) return;

    const direction = inferDirection(text);
    const urgency = inferUrgency(text);

    // If it's a hazard-level urgency, use the special hazard pattern
    if (urgency === 'high') {
      this.triggerHazard();
    } else {
      this.triggerDirectional(direction, urgency);
    }
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  /** Check if enough time has passed since the last vibration */
  private _canVibrate(): boolean {
    return Date.now() - this._lastVibrationTime >= this._minInterval;
  }

  /** Fire a vibration pattern */
  private _vibrate(pattern: number[], force: boolean = false): void {
    if (!force && !this._canVibrate()) return;

    try {
      if (Platform.OS === 'android') {
        // Android supports vibration patterns natively
        Vibration.vibrate(pattern);
      } else {
        // iOS only supports simple vibration — use total duration
        const totalDuration = pattern.reduce((a, b) => a + b, 0);
        Vibration.vibrate(Math.min(totalDuration, 500));
      }
      this._lastVibrationTime = Date.now();
    } catch (err) {
      console.warn('[Haptic] Vibration failed:', err);
    }
  }
}

export const hapticService = new HapticService();
