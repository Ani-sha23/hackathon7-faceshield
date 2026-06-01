/**
 * FaceRecognitionService.js
 * MobileFaceNet TFLite face recognition engine
 * NHAI Hackathon 7.0 — Anisha Garg
 *
 * Model: MobileFaceNet (TFLite FP16 quantized)
 * Size:  ~2 MB
 * Input: 112x112 RGB normalized image
 * Output: 128-D L2-normalized embedding vector
 */

import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-react-native';
import RNFS from 'react-native-fs';
import { Platform } from 'react-native';

// Model path inside app bundle
const MODEL_PATH = Platform.select({
  android: 'file:///android_asset/models/mobilefacenet.tflite',
  ios: `${RNFS.MainBundlePath}/models/mobilefacenet.tflite`,
});

// MobileFaceNet input dimensions
const INPUT_SIZE = 112;
const EMBEDDING_SIZE = 128;

class FaceRecognitionService {
  constructor() {
    this.model = null;
    this.isLoaded = false;
  }

  /**
   * Load the TFLite model into memory
   * Must be called before any inference
   */
  async loadModel() {
    if (this.isLoaded) return;

    try {
      await tf.ready();

      // Load TFLite model from bundle
      this.model = await tf.loadGraphModel(MODEL_PATH, {
        fromTFHub: false,
      });

      this.isLoaded = true;
      console.log('[FaceRecognition] MobileFaceNet loaded successfully');
    } catch (error) {
      console.error('[FaceRecognition] Model load failed:', error);
      throw new Error('Failed to load face recognition model');
    }
  }

  /**
   * Get 128-D face embedding from a preprocessed image tensor
   * @param {tf.Tensor4D} imageTensor - Shape [1, 112, 112, 3], normalized [-1, 1]
   * @returns {Float32Array|null} 128-D embedding vector, or null if no face found
   */
  async getEmbedding(imageTensor) {
    if (!this.isLoaded) {
      throw new Error('Model not loaded. Call loadModel() first.');
    }

    try {
      const result = tf.tidy(() => {
        const output = this.model.predict(imageTensor);
        // L2-normalize the output embedding
        return tf.div(output, tf.norm(output, 2, -1, true));
      });

      const embeddingData = await result.data();
      result.dispose();

      return Array.from(embeddingData);
    } catch (error) {
      console.error('[FaceRecognition] Inference error:', error);
      return null;
    }
  }

  /**
   * Average multiple embeddings into a single robust template
   * @param {Array<Array<number>>} embeddings - List of 128-D embeddings
   * @returns {Array<number>} Averaged and normalized embedding
   */
  averageEmbeddings(embeddings) {
    if (!embeddings || embeddings.length === 0) return null;

    const avg = new Array(EMBEDDING_SIZE).fill(0);
    for (const emb of embeddings) {
      for (let i = 0; i < EMBEDDING_SIZE; i++) {
        avg[i] += emb[i] / embeddings.length;
      }
    }

    // L2-normalize the average
    const norm = Math.sqrt(avg.reduce((sum, v) => sum + v * v, 0));
    return avg.map(v => v / norm);
  }

  /**
   * Cosine similarity between two 128-D embeddings
   * @param {Array<number>} embA
   * @param {Array<number>} embB
   * @returns {number} Similarity score between -1 and 1 (>0.6 = match)
   */
  cosineSimilarity(embA, embB) {
    if (!embA || !embB || embA.length !== embB.length) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < embA.length; i++) {
      dot += embA[i] * embB[i];
      normA += embA[i] * embA[i];
      normB += embB[i] * embB[i];
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  /**
   * Euclidean distance between two embeddings (alternative metric)
   */
  euclideanDistance(embA, embB) {
    return Math.sqrt(
      embA.reduce((sum, val, i) => sum + Math.pow(val - embB[i], 2), 0)
    );
  }

  /**
   * Release model memory
   */
  dispose() {
    if (this.model) {
      this.model.dispose();
      this.model = null;
      this.isLoaded = false;
    }
  }
}

export default new FaceRecognitionService();
