/**
 * CryptoUtils.js
 * AES-256 encryption utilities for biometric data protection
 * NHAI Hackathon 7.0 — Anisha Garg
 */

import CryptoJS from 'crypto-js';

export const CryptoUtils = {
  /**
   * Encrypt a string with AES-256-CBC
   * @param {string} plaintext - Data to encrypt
   * @param {string} key - AES key (hex string)
   * @returns {string} Base64-encoded ciphertext with IV prefix
   */
  encrypt(plaintext, key) {
    const iv = CryptoJS.lib.WordArray.random(16);
    const keyWords = CryptoJS.enc.Hex.parse(key);

    const encrypted = CryptoJS.AES.encrypt(plaintext, keyWords, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });

    // Prepend IV to ciphertext for storage
    const ivHex = iv.toString(CryptoJS.enc.Hex);
    return ivHex + ':' + encrypted.toString();
  },

  /**
   * Decrypt AES-256-CBC encrypted data
   * @param {string} ciphertext - IV:ciphertext format
   * @param {string} key - AES key (hex string)
   * @returns {string} Decrypted plaintext
   */
  decrypt(ciphertext, key) {
    const [ivHex, encryptedData] = ciphertext.split(':');
    const iv = CryptoJS.enc.Hex.parse(ivHex);
    const keyWords = CryptoJS.enc.Hex.parse(key);

    const decrypted = CryptoJS.AES.decrypt(encryptedData, keyWords, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });

    return decrypted.toString(CryptoJS.enc.Utf8);
  },

  /**
   * Generate a cryptographically random 256-bit AES key
   * @returns {string} 64-character hex string (32 bytes)
   */
  generateKey() {
    return CryptoJS.lib.WordArray.random(32).toString(CryptoJS.enc.Hex);
  },

  /**
   * Hash a string with SHA-256
   */
  sha256(data) {
    return CryptoJS.SHA256(data).toString(CryptoJS.enc.Hex);
  },
};
