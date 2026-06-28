import TextRecognition from '@react-native-ml-kit/text-recognition';

export class OfflineOcrService {
  async recognizeText(imageUri: string): Promise<string | null> {
    try {
      console.log('[OfflineOcrService] Processing image:', imageUri);
      const result = await TextRecognition.recognize(imageUri);
      return result.text;
    } catch (e) {
      console.warn('[OfflineOcrService] OCR failed:', e);
      return null;
    }
  }
}

export const offlineOcrService = new OfflineOcrService();
