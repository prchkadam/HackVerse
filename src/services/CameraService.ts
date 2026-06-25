/**
 * CameraService — VisionCamera v5 compatible
 *
 * VisionCamera v5 Photo API:
 *   - photoOutput.capturePhoto({}, {})  → Photo
 *   - photo.saveToTemporaryFileAsync()  → string (filesystem path, NOT file://)
 *   - photo.dispose()                   → release native buffer
 *
 * Frame pipeline: JS setInterval @ 1-2 FPS → capturePhoto → base64 JPEG
 */

import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import type { Camera } from "react-native-vision-camera";

export type FrameCallback = (base64Jpeg: string) => void;

export class CameraService {
  private intervalRef: ReturnType<typeof setInterval> | null = null;
  private capturing: boolean = false;
  private frameCount: number = 0;

  /**
   * Start the capture interval using the provided camera ref.
   * @param cameraRef  React ref of the Camera component
   * @param intervalMs   Milliseconds between captures (1000–3000 recommended)
   * @param onFrame      Callback with base64 JPEG string on each capture
   */
  start(
    cameraRef: React.RefObject<Camera>,
    intervalMs: number,
    onFrame: FrameCallback,
  ): void {
    if (this.intervalRef) this.stop();

    this.capturing = true;
    this.frameCount = 0;

    this.intervalRef = setInterval(async () => {
      if (!this.capturing || !cameraRef.current) return;

      try {
        const photo = await cameraRef.current.takePhoto({
          enableShutterSound: false,
        });

        let localPath = photo.path;
        if (!localPath.startsWith("file://") && !localPath.startsWith("http")) {
          localPath = `file://${localPath}`;
        }

        // Compress background frames heavily for speed: 600px width, 50% quality
        const manipResult = await ImageManipulator.manipulateAsync(
          localPath,
          [{ resize: { width: 600 } }],
          {
            compress: 0.5,
            format: ImageManipulator.SaveFormat.JPEG,
            base64: true,
          },
        );

        const base64 = manipResult.base64;

        if (!base64) {
          console.warn("[Camera] Failed to generate base64");
          return;
        }

        this.frameCount++;
        onFrame(base64);

        await FileSystem.deleteAsync(localPath, { idempotent: true }).catch(
          () => {},
        );
      } catch (err) {
        console.warn("[Camera] Frame capture failed:", err);
      }
    }, intervalMs);
  }

  /** Stop capture interval */
  stop(): void {
    this.capturing = false;
    if (this.intervalRef !== null) {
      clearInterval(this.intervalRef);
      this.intervalRef = null;
    }
    // Camera service cleaned up
  }

  get isRunning(): boolean {
    return this.capturing && this.intervalRef !== null;
  }
}

export const cameraService = new CameraService();
