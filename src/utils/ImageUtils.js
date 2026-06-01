/**
 * ImageUtils.js
 * Image preprocessing utilities for MobileFaceNet TFLite input
 * NHAI Hackathon 7.0 — Anisha Garg
 *
 * MobileFaceNet expects: [1, 112, 112, 3] float32 tensor, normalized to [-1, 1]
 */

import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-react-native';

// MobileFaceNet input size
const FACENET_INPUT_SIZE = 112;

export const ImageUtils = {
  /**
   * Preprocess a camera frame for MobileFaceNet inference
   * @param {Object} frame - Camera frame with { data: Uint8Array, width, height }
   * @returns {tf.Tensor4D} Shape [1, 112, 112, 3], normalized to [-1, 1]
   */
  async preprocessForFaceNet(frame) {
    return tf.tidy(() => {
      // Decode pixel data to tensor
      const imageTensor = tf.browser.fromPixels({
        data: frame.data,
        width: frame.width,
        height: frame.height,
      });

      // Resize to 112x112
      const resized = tf.image.resizeBilinear(imageTensor, [
        FACENET_INPUT_SIZE,
        FACENET_INPUT_SIZE,
      ]);

      // Cast to float32 and normalize from [0, 255] to [-1, 1]
      const float32 = resized.cast('float32');
      const normalized = tf.sub(tf.div(float32, 127.5), 1.0);

      // Add batch dimension: [H, W, C] -> [1, H, W, C]
      return normalized.expandDims(0);
    });
  },

  /**
   * Crop a face region from a full image given bounding box
   * @param {tf.Tensor3D} imageTensor - Full image tensor
   * @param {Object} bbox - { x, y, width, height } normalized 0-1
   * @returns {tf.Tensor3D} Cropped face tensor
   */
  cropFace(imageTensor, bbox) {
    return tf.tidy(() => {
      const [h, w] = imageTensor.shape.slice(0, 2);
      const x1 = Math.max(0, Math.floor(bbox.x * w));
      const y1 = Math.max(0, Math.floor(bbox.y * h));
      const x2 = Math.min(w, Math.floor((bbox.x + bbox.width) * w));
      const y2 = Math.min(h, Math.floor((bbox.y + bbox.height) * h));

      return imageTensor.slice([y1, x1, 0], [y2 - y1, x2 - x1, 3]);
    });
  },

  /**
   * Convert base64 image string to Uint8Array pixel data
   */
  base64ToPixelData(base64String) {
    const binaryString = atob(base64String.replace(/^data:image\/\w+;base64,/, ''));
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  },

  /**
   * Apply CLAHE-like histogram equalization for outdoor lighting normalization
   * Improves recognition in harsh sunlight and deep shadow conditions
   */
  normalizeHistogram(imageTensor) {
    return tf.tidy(() => {
      // Simple per-channel normalization (approximates CLAHE for mobile)
      const mean = tf.mean(imageTensor, [0, 1], true);
      const std = tf.sqrt(tf.mean(tf.square(tf.sub(imageTensor, mean)), [0, 1], true));
      const epsilon = tf.scalar(1e-8);
      return tf.div(tf.sub(imageTensor, mean), tf.add(std, epsilon));
    });
  },
};
