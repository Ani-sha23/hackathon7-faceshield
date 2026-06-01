/**
 * FaceShieldService.js
 * Core authentication orchestrator for FaceShield
 * NHAI Hackathon 7.0 — Anisha Garg
 *
 * Orchestrates: Face Detection → Liveness Check → Face Recognition → Storage
 */

import FaceRecognitionService from './FaceRecognitionService';
import LivenessService from './LivenessService';
import StorageService from './StorageService';
import { ImageUtils } from '../utils/ImageUtils';

// Authentication result codes
export const AuthResult = {
  SUCCESS: 'SUCCESS',
  LIVENESS_FAILED: 'LIVENESS_FAILED',
  FACE_NOT_FOUND: 'FACE_NOT_FOUND',
  USER_NOT_ENROLLED: 'USER_NOT_ENROLLED',
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',
  TIMEOUT: 'TIMEOUT',
  ERROR: 'ERROR',
};

// Minimum cosine similarity for positive identification
const RECOGNITION_THRESHOLD = 0.6;

class FaceShieldService {
  constructor() {
    this.isInitialized = false;
  }

  /**
   * Initialize all AI models — call once at app startup
   */
  async initialize() {
    if (this.isInitialized) return;
    try {
      await FaceRecognitionService.loadModel();
      await LivenessService.loadModel();
      await StorageService.initialize();
      this.isInitialized = true;
      console.log('[FaceShield] All models loaded successfully');
    } catch (error) {
      console.error('[FaceShield] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Enroll a new user with 5 face photos
   * @param {Object} params
   * @param {string} params.userId - Unique employee ID
   * @param {string} params.name  - Employee name
   * @param {Array}  params.photos - Array of 5 base64 image strings
   */
  async enrollUser({ userId, name, photos }) {
    if (!this.isInitialized) await this.initialize();
    if (!photos || photos.length < 3) {
      throw new Error('At least 3 photos required for enrollment');
    }

    try {
      const embeddings = [];

      for (const photo of photos) {
        const preprocessed = await ImageUtils.preprocessForFaceNet(photo);
        const embedding = await FaceRecognitionService.getEmbedding(preprocessed);
        if (embedding) embeddings.push(embedding);
      }

      if (embeddings.length < 3) {
        throw new Error('Could not detect face in enough photos. Please retake.');
      }

      // Average the embeddings for a robust template
      const avgEmbedding = FaceRecognitionService.averageEmbeddings(embeddings);

      await StorageService.saveEnrollment({
        userId,
        name,
        embedding: avgEmbedding,
        enrolledAt: new Date().toISOString(),
        photoCount: photos.length,
      });

      console.log(`[FaceShield] Enrolled user: ${userId}`);
      return { success: true, userId, photoCount: embeddings.length };
    } catch (error) {
      console.error('[FaceShield] Enrollment failed:', error);
      throw error;
    }
  }

  /**
   * Authenticate a user — fully offline
   * @param {Object} params
   * @param {string}   params.userId      - Employee ID to verify against
   * @param {Function} params.onChallenge - Callback with challenge type: 'BLINK'|'SMILE'|'TURN_LEFT'|'TURN_RIGHT'
   * @param {Function} params.getCameraFrame - Async function returning current camera frame
   * @param {number}   params.timeoutMs   - Max authentication time (default: 15000ms)
   */
  async authenticate({ userId, onChallenge, getCameraFrame, timeoutMs = 15000 }) {
    if (!this.isInitialized) await this.initialize();

    const startTime = Date.now();

    try {
      // 1. Load enrolled template
      const enrollment = await StorageService.getEnrollment(userId);
      if (!enrollment) {
        return { authenticated: false, result: AuthResult.USER_NOT_ENROLLED };
      }

      // 2. Run liveness check (active + passive simultaneously)
      const livenessResult = await LivenessService.runLivenessCheck({
        onChallenge,
        getCameraFrame,
        timeoutMs: Math.min(timeoutMs - 2000, 10000),
      });

      if (!livenessResult.passed) {
        return {
          authenticated: false,
          result: AuthResult.LIVENESS_FAILED,
          reason: livenessResult.reason,
        };
      }

      // 3. Run face recognition on the verified liveness frame
      const capturedFrame = livenessResult.verifiedFrame;
      const preprocessed = await ImageUtils.preprocessForFaceNet(capturedFrame);
      const queryEmbedding = await FaceRecognitionService.getEmbedding(preprocessed);

      if (!queryEmbedding) {
        return { authenticated: false, result: AuthResult.FACE_NOT_FOUND };
      }

      // 4. Compare with stored template
      const similarity = FaceRecognitionService.cosineSimilarity(
        queryEmbedding,
        enrollment.embedding
      );

      const authenticated = similarity >= RECOGNITION_THRESHOLD;
      const latencyMs = Date.now() - startTime;

      // 5. Save attendance record (encrypted, offline)
      if (authenticated) {
        await StorageService.saveAttendanceRecord({
          userId,
          name: enrollment.name,
          timestamp: new Date().toISOString(),
          confidence: similarity,
          latencyMs,
          livenessChallenge: livenessResult.challenge,
          synced: false,
        });
      }

      return {
        authenticated,
        result: authenticated ? AuthResult.SUCCESS : AuthResult.LOW_CONFIDENCE,
        confidence: similarity,
        latencyMs,
      };
    } catch (error) {
      console.error('[FaceShield] Authentication error:', error);
      return { authenticated: false, result: AuthResult.ERROR, error: error.message };
    }
  }

  /**
   * Delete a user enrollment
   */
  async deleteEnrollment(userId) {
    return await StorageService.deleteEnrollment(userId);
  }

  /**
   * Get count of unsynced attendance records
   */
  async getPendingCount() {
    return await StorageService.getPendingCount();
  }

  /**
   * Check if a user is enrolled
   */
  async isEnrolled(userId) {
    const enrollment = await StorageService.getEnrollment(userId);
    return !!enrollment;
  }
}

export default new FaceShieldService();
