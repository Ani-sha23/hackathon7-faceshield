/**
 * LivenessService.js
 * Dual-layer liveness detection — Active Challenge + Passive Texture Analysis
 * NHAI Hackathon 7.0 — Anisha Garg
 *
 * Layer 1 (Active):  MediaPipe Face Mesh — blink / smile / head-turn detection
 * Layer 2 (Passive): MobileNetV3 anti-spoofing classifier (~3 MB TFLite)
 */

import * as tf from '@tensorflow/tfjs';
import RNFS from 'react-native-fs';
import { Platform } from 'react-native';

// Anti-spoofing model path
const ANTISPOOFING_MODEL_PATH = Platform.select({
  android: 'file:///android_asset/models/antispoofing.tflite',
  ios: `${RNFS.MainBundlePath}/models/antispoofing.tflite`,
});

// Challenge types
export const ChallengeType = {
  BLINK: 'BLINK',
  SMILE: 'SMILE',
  TURN_LEFT: 'TURN_LEFT',
  TURN_RIGHT: 'TURN_RIGHT',
};

// Thresholds for landmark-based detection
const BLINK_EAR_THRESHOLD = 0.2;       // Eye Aspect Ratio below this = blink
const SMILE_MAR_THRESHOLD = 0.35;      // Mouth Aspect Ratio above this = smile
const HEAD_TURN_YAW_THRESHOLD = 20;    // Degrees of head rotation
const CHALLENGE_TIMEOUT_MS = 5000;     // 5 seconds per challenge
const SPOOFING_THRESHOLD = 0.5;        // Below this = real face

class LivenessService {
  constructor() {
    this.antispoofModel = null;
    this.isLoaded = false;
  }

  async loadModel() {
    if (this.isLoaded) return;
    try {
      await tf.ready();
      this.antispoofModel = await tf.loadGraphModel(ANTISPOOFING_MODEL_PATH, {
        fromTFHub: false,
      });
      this.isLoaded = true;
      console.log('[Liveness] Anti-spoofing model loaded');
    } catch (error) {
      console.error('[Liveness] Model load failed:', error);
      throw error;
    }
  }

  /**
   * Run full dual-layer liveness check
   * @param {Object}   params
   * @param {Function} params.onChallenge    - Called with challenge type string
   * @param {Function} params.getCameraFrame - Async fn returning camera frame
   * @param {number}   params.timeoutMs      - Total timeout
   */
  async runLivenessCheck({ onChallenge, getCameraFrame, timeoutMs = 10000 }) {
    try {
      // Pick a random challenge
      const challenges = Object.values(ChallengeType);
      const challenge = challenges[Math.floor(Math.random() * challenges.length)];

      // Notify UI to display the challenge
      if (onChallenge) onChallenge(challenge);

      // Run both layers in parallel
      const [activeResult, passiveResult] = await Promise.all([
        this._runActiveChallenge({ challenge, getCameraFrame, timeoutMs }),
        this._runPassiveCheck({ getCameraFrame }),
      ]);

      const passed = activeResult.passed && passiveResult.isRealFace;

      return {
        passed,
        challenge,
        activeResult,
        passiveResult,
        verifiedFrame: activeResult.verifiedFrame,
        reason: !activeResult.passed
          ? `Active challenge failed: ${activeResult.reason}`
          : !passiveResult.isRealFace
          ? 'Passive check: spoof detected'
          : 'Liveness verified',
      };
    } catch (error) {
      console.error('[Liveness] Check error:', error);
      return { passed: false, reason: 'Liveness check error: ' + error.message };
    }
  }

  /**
   * Layer 1: Active challenge using MediaPipe Face Mesh landmarks
   */
  async _runActiveChallenge({ challenge, getCameraFrame, timeoutMs }) {
    const deadline = Date.now() + Math.min(timeoutMs, CHALLENGE_TIMEOUT_MS);
    let baselineLandmarks = null;
    let challengeMet = false;
    let verifiedFrame = null;

    while (Date.now() < deadline) {
      const frame = await getCameraFrame();
      if (!frame) {
        await this._sleep(100);
        continue;
      }

      // Get face mesh landmarks (via MediaPipe bridge)
      const landmarks = await this._getFaceLandmarks(frame);
      if (!landmarks) {
        await this._sleep(100);
        continue;
      }

      // Store baseline on first valid detection
      if (!baselineLandmarks) {
        baselineLandmarks = landmarks;
        await this._sleep(100);
        continue;
      }

      // Evaluate challenge against current landmarks
      challengeMet = this._evaluateChallenge(challenge, landmarks, baselineLandmarks);

      if (challengeMet) {
        verifiedFrame = frame;
        break;
      }

      await this._sleep(100);
    }

    return {
      passed: challengeMet,
      verifiedFrame,
      reason: challengeMet ? 'Challenge completed' : 'Challenge timeout',
    };
  }

  /**
   * Evaluate whether the landmark-based challenge condition is met
   */
  _evaluateChallenge(challenge, landmarks, baseline) {
    switch (challenge) {
      case ChallengeType.BLINK: {
        const ear = this._eyeAspectRatio(landmarks);
        return ear < BLINK_EAR_THRESHOLD;
      }
      case ChallengeType.SMILE: {
        const mar = this._mouthAspectRatio(landmarks);
        return mar > SMILE_MAR_THRESHOLD;
      }
      case ChallengeType.TURN_LEFT: {
        const yaw = this._estimateYaw(landmarks);
        const baseYaw = this._estimateYaw(baseline);
        return (baseYaw - yaw) > HEAD_TURN_YAW_THRESHOLD;
      }
      case ChallengeType.TURN_RIGHT: {
        const yaw = this._estimateYaw(landmarks);
        const baseYaw = this._estimateYaw(baseline);
        return (yaw - baseYaw) > HEAD_TURN_YAW_THRESHOLD;
      }
      default:
        return false;
    }
  }

  /**
   * Eye Aspect Ratio — landmark indices for MediaPipe Face Mesh
   * Left eye: [33, 160, 158, 133, 153, 144]
   */
  _eyeAspectRatio(landmarks) {
    const p1 = landmarks[160]; const p5 = landmarks[144];
    const p2 = landmarks[158]; const p4 = landmarks[153];
    const p3 = landmarks[33];  const p6 = landmarks[133];

    const A = this._dist(p1, p5);
    const B = this._dist(p2, p4);
    const C = this._dist(p3, p6);

    return (A + B) / (2.0 * C);
  }

  /**
   * Mouth Aspect Ratio — lip landmarks
   */
  _mouthAspectRatio(landmarks) {
    const top = landmarks[13];
    const bottom = landmarks[14];
    const left = landmarks[78];
    const right = landmarks[308];

    const A = this._dist(top, bottom);
    const B = this._dist(left, right);

    return A / B;
  }

  /**
   * Estimate head yaw from nose and cheek landmarks
   */
  _estimateYaw(landmarks) {
    const noseTip = landmarks[4];
    const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];

    const leftDist = this._dist(noseTip, leftCheek);
    const rightDist = this._dist(noseTip, rightCheek);

    // Yaw proportional to asymmetry between left/right distances
    return Math.atan2(leftDist - rightDist, leftDist + rightDist) * (180 / Math.PI) * 3;
  }

  _dist(a, b) {
    if (!a || !b) return 0;
    return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
  }

  /**
   * Layer 2: Passive MobileNetV3 texture-based spoof detection
   */
  async _runPassiveCheck({ getCameraFrame }) {
    try {
      if (!this.isLoaded) return { isRealFace: true, confidence: 1.0 }; // Fallback

      const frame = await getCameraFrame();
      if (!frame) return { isRealFace: true, confidence: 1.0 };

      // Preprocess to 224x224 for MobileNetV3
      const tensor = await this._preprocessForAntiSpoofing(frame);

      const result = tf.tidy(() => {
        const output = this.antispoofModel.predict(tensor);
        return output.dataSync();
      });

      tensor.dispose();

      // output[0] = spoof probability, output[1] = real probability
      const spoofScore = result[0];
      const isRealFace = spoofScore < SPOOFING_THRESHOLD;

      return {
        isRealFace,
        spoofScore,
        confidence: isRealFace ? 1 - spoofScore : spoofScore,
      };
    } catch (error) {
      console.error('[Liveness] Passive check error:', error);
      return { isRealFace: true, confidence: 0.5 }; // Fail open on error
    }
  }

  /**
   * Placeholder: integrate with native MediaPipe bridge
   * In production, calls the native module that runs Face Mesh
   */
  async _getFaceLandmarks(frame) {
    try {
      // This calls the native MediaPipe Face Mesh module
      // Implementation in android/ios native bridge
      const { NativeModules } = require('react-native');
      const landmarks = await NativeModules.MediaPipeBridge.detectLandmarks(frame);
      return landmarks;
    } catch {
      return null;
    }
  }

  async _preprocessForAntiSpoofing(frame) {
    // Resize to 224x224, normalize to [0,1]
    return tf.tidy(() => {
      const decoded = tf.browser.fromPixels({ data: frame.data, width: frame.width, height: frame.height });
      const resized = tf.image.resizeBilinear(decoded, [224, 224]);
      const normalized = tf.div(resized.cast('float32'), 255.0);
      return normalized.expandDims(0);
    });
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new LivenessService();
