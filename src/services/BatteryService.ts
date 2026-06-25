/**
 * BatteryService — Battery optimization for EchoSight
 *
 * Monitors device battery level and state using `expo-battery`.
 * Emits a callback when the battery falls below the critical threshold
 * (default 20%) so the app can automatically degrade gracefully
 * (e.g., lower scan frequency, text-only mode).
 */

import * as Battery from "expo-battery";

export type LowBatteryCallback = (level: number) => void;

export class BatteryService {
  private _enabled: boolean = false;
  private _threshold: number = 0.2; // 20% default threshold
  private _subscription: ReturnType<
    typeof Battery.addBatteryLevelListener
  > | null = null;
  private _lastNotifiedLevel: number | null = null;

  onLowBattery: LowBatteryCallback = () => {};

  async start(threshold: number = 0.2): Promise<void> {
    if (this._enabled) return;
    this._threshold = threshold;

    try {
      const isAvailable = await Battery.isAvailableAsync();
      if (!isAvailable) {
        console.warn("[Battery] Battery API not available");
        return;
      }

      // Check current level immediately
      const level = await Battery.getBatteryLevelAsync();
      this._checkLevel(level);

      // Listen for changes
      this._subscription = Battery.addBatteryLevelListener(
        ({ batteryLevel }) => {
          this._checkLevel(batteryLevel);
        },
      );

      this._enabled = true;
    } catch (err) {
      console.warn("[Battery] Failed to start:", err);
    }
  }

  stop(): void {
    if (this._subscription) {
      this._subscription.remove();
      this._subscription = null;
    }
    this._enabled = false;
    this._lastNotifiedLevel = null;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  private _checkLevel(level: number): void {
    if (level < 0) return; // -1 means unknown on some platforms

    // If we dropped below threshold, and we haven't already notified at this general level
    if (level <= this._threshold) {
      // Only notify if we haven't notified yet, or if it dropped by another 5%
      if (
        this._lastNotifiedLevel === null ||
        this._lastNotifiedLevel - level >= 0.05
      ) {
        this._lastNotifiedLevel = level;
        this.onLowBattery(level);
      }
    } else {
      // Reset if we charge back above threshold
      this._lastNotifiedLevel = null;
    }
  }
}

export const batteryService = new BatteryService();
