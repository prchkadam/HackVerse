/**
 * MotionService
 *
 * Tracks device gyroscope data to prevent "stale frame" descriptions.
 * Option 1: Tracking cumulative orientation drift.
 * Option 2: Emitting an event on sudden, high-velocity movements.
 */

import { Gyroscope } from 'expo-sensors';
import { Platform } from 'react-native';

export interface OrientationSnapshot {
  yaw: number;
  pitch: number;
  timestamp: number;
}

export class MotionService {
  private subscription: any = null;
  private isListening = false;

  // Cumulative orientation (pseudo-angles in radians)
  private currentYaw = 0;
  private currentPitch = 0;
  private lastUpdate = 0;

  // Thresholds
  private readonly HIGH_VELOCITY_THRESHOLD = 1.5; // rad/s
  private readonly SIGNIFICANT_DRIFT_THRESHOLD = 0.35; // ~20 degrees in radians

  // Callback for instant cancellation
  onFastMovement: () => void = () => {};

  start() {
    if (this.isListening || Platform.OS === 'web') return;

    this.currentYaw = 0;
    this.currentPitch = 0;
    this.lastUpdate = Date.now();
    this.isListening = true;

    // Set update interval to 50ms (20Hz)
    Gyroscope.setUpdateInterval(50);

    this.subscription = Gyroscope.addListener((data) => {
      const now = Date.now();
      const dt = (now - this.lastUpdate) / 1000.0; // time delta in seconds
      this.lastUpdate = now;

      // Integrate angular velocity to get pseudo-angles
      // data.y is roughly yaw (rotation around Y axis)
      // data.x is roughly pitch (rotation around X axis)
      this.currentYaw += data.y * dt;
      this.currentPitch += data.x * dt;

      // Option 2: High Velocity Check
      // If the user whips their head around fast, instantly abort
      const magnitude = Math.sqrt(data.x * data.x + data.y * data.y + data.z * data.z);
      if (magnitude > this.HIGH_VELOCITY_THRESHOLD) {
        this.onFastMovement();
      }
    });

    console.log('[MotionService] Started tracking');
  }

  stop() {
    if (this.subscription) {
      this.subscription.remove();
      this.subscription = null;
    }
    this.isListening = false;
    console.log('[MotionService] Stopped tracking');
  }

  /**
   * Take a snapshot of the current orientation.
   * Call this right before sending a frame to the AI.
   */
  getSnapshot(): OrientationSnapshot {
    return {
      yaw: this.currentYaw,
      pitch: this.currentPitch,
      timestamp: Date.now(),
    };
  }

  /**
   * Check if the device has moved significantly since the snapshot.
   * Call this when the AI response arrives.
   */
  hasMovedSignificantly(snapshot: OrientationSnapshot): boolean {
    if (!this.isListening) return false;

    const deltaYaw = this.currentYaw - snapshot.yaw;
    const deltaPitch = this.currentPitch - snapshot.pitch;
    
    const drift = Math.sqrt(deltaYaw * deltaYaw + deltaPitch * deltaPitch);
    return drift > this.SIGNIFICANT_DRIFT_THRESHOLD;
  }
}

export const motionService = new MotionService();
