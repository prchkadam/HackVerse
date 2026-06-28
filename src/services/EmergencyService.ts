/**
 * EmergencyService — SOS handler for EchoSight
 *
 * Handles the emergency response when a fall is detected:
 *   1. Gets the user's current GPS coordinates (expo-location)
 *   2. Sends an SMS to the configured emergency contact (expo-sms)
 *   3. Falls back to opening the phone dialer if SMS is unavailable
 *
 * The SMS includes the user's location as a Google Maps link.
 */

import * as Location from 'expo-location';
import * as SMS from 'expo-sms';
import { Linking, Platform, PermissionsAndroid, Alert } from 'react-native';
// @ts-ignore
import RNImmediatePhoneCall from 'react-native-immediate-phone-call';

export interface EmergencyConfig {
  contactNumber: string;    // Phone number of emergency contact
  contactName: string;      // Name of emergency contact (for display)
}

// ─── Service class ────────────────────────────────────────────────────────────

export class EmergencyService {
  /**
   * Send an emergency SOS message to the configured contact.
   * Includes the user's GPS location if available.
   */
  async sendSOS(config: EmergencyConfig): Promise<{ success: boolean; method: string }> {
    const { contactNumber } = config;

    if (!contactNumber || contactNumber.trim().length < 3) {
      console.warn('[Emergency] No valid emergency contact number configured');
      Alert.alert('Setup Required', 'Please open EchoSight Settings and set an Emergency Contact Number first!');
      return { success: false, method: 'none' };
    }

    // 1. Get current location
    let locationText = 'Location unavailable';
    let mapsLink = '';

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        const { latitude, longitude } = location.coords;
        mapsLink = `https://maps.google.com/?q=${latitude},${longitude}`;
        locationText = `Lat: ${latitude.toFixed(6)}, Lng: ${longitude.toFixed(6)}`;
        console.log(`[Emergency] Location: ${locationText}`);
      } else {
        console.warn('[Emergency] Location permission not granted');
      }
    } catch (err) {
      console.warn('[Emergency] Failed to get location:', err);
    }

    // 2. Build the SOS message
    let message =
      `EMERGENCY: EchoSight Fall Detection\n\n` +
      `A possible fall has been detected for the EchoSight user.\n\n` +
      `Location: ${locationText}\n`;

    if (mapsLink) {
      message += `Google Maps Link: ${mapsLink}\n\n`;
    } else {
      message += `\n`;
    }

    message +=
      `This is an automated message from the EchoSight app. ` +
      `Please check on them immediately.`;

    // 3. Send SMS via Twilio API
    try {
      console.log('[Emergency] Attempting to send SMS via Twilio API...');
      
      const accountSid = process.env.EXPO_PUBLIC_TWILIO_ACCOUNT_SID || 'YOUR_TWILIO_ACCOUNT_SID';
      const authToken = process.env.EXPO_PUBLIC_TWILIO_AUTH_TOKEN || 'YOUR_TWILIO_AUTH_TOKEN';
      const twilioNumber = process.env.EXPO_PUBLIC_TWILIO_PHONE_NUMBER || 'YOUR_TWILIO_NUMBER';

      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      
      // Clean up contact number (ensure it has a + and country code, default to India +91 if length is 10)
      let formattedTo = contactNumber.replace(/[^0-9+]/g, '');
      if (formattedTo.length === 10 && !formattedTo.startsWith('+')) {
        formattedTo = '+91' + formattedTo;
      } else if (formattedTo.length > 0 && !formattedTo.startsWith('+')) {
        formattedTo = '+' + formattedTo;
      }

      // Convert body into URL-encoded form data as expected by Twilio API
      const formData = [];
      formData.push(`To=${encodeURIComponent(formattedTo)}`);
      formData.push(`From=${encodeURIComponent(twilioNumber)}`);
      formData.push(`Body=${encodeURIComponent(message)}`);
      const body = formData.join('&');

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`)
        },
        body: body
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage = `Twilio API Error: ${response.status} ${errorText}`;
        console.warn(errorMessage);
        throw new Error(errorMessage);
      }

      console.log('[Emergency] Twilio SMS sent successfully');
    } catch (err: any) {
      console.warn('[Emergency] Twilio SMS failed:', err);
    }

    // 4. Try Immediate Auto-Dialing (Android only)
    let callInitiated = false;
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CALL_PHONE);
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          RNImmediatePhoneCall.immediatePhoneCall(contactNumber);
          console.log('[Emergency] Immediate phone call started');
          callInitiated = true;
        }
      } catch (err) {
        console.warn('[Emergency] Immediate call failed:', err);
      }
    }

    // 5. Fallback to standard dialer if immediate call failed or if iOS
    if (!callInitiated) {
      try {
        const phoneUrl = Platform.OS === 'android'
          ? `tel:${contactNumber}`
          : `telprompt:${contactNumber}`;

        const canOpen = await Linking.canOpenURL(phoneUrl);
        if (canOpen) {
          await Linking.openURL(phoneUrl);
          console.log('[Emergency] Opened standard phone dialer fallback');
          callInitiated = true;
        }
      } catch (err) {
        console.warn('[Emergency] Failed to open fallback dialer:', err);
      }
    }

    return { success: callInitiated, method: 'auto' };
  }
}

export const emergencyService = new EmergencyService();
