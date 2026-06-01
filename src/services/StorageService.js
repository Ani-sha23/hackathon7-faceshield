/**
 * StorageService.js
 * AES-256 encrypted SQLite offline storage
 * NHAI Hackathon 7.0 — Anisha Garg
 *
 * Stores enrollment templates and attendance records offline.
 * All biometric data encrypted with AES-256 before storage.
 */

import SQLite from 'react-native-sqlite-storage';
import EncryptedStorage from 'react-native-encrypted-storage';
import { CryptoUtils } from '../utils/CryptoUtils';

SQLite.enablePromise(true);

const DB_NAME = 'faceshield.db';
const DB_VERSION = '1.0';
const DB_DISPLAY_NAME = 'FaceShield Local DB';
const DB_SIZE = 200000;

class StorageService {
  constructor() {
    this.db = null;
    this.encryptionKey = null;
  }

  /**
   * Initialize database and encryption key
   */
  async initialize() {
    try {
      // Generate or retrieve persistent AES-256 key
      this.encryptionKey = await this._getOrCreateEncryptionKey();

      // Open SQLite database
      this.db = await SQLite.openDatabase(
        DB_NAME, DB_VERSION, DB_DISPLAY_NAME, DB_SIZE
      );

      // Create tables
      await this._createTables();

      console.log('[Storage] Database initialized');
    } catch (error) {
      console.error('[Storage] Initialization failed:', error);
      throw error;
    }
  }

  async _createTables() {
    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS enrollments (
        user_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        embedding_encrypted TEXT NOT NULL,
        enrolled_at TEXT NOT NULL,
        photo_count INTEGER DEFAULT 5
      );
    `);

    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS attendance_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        confidence REAL NOT NULL,
        latency_ms INTEGER,
        liveness_challenge TEXT,
        synced INTEGER DEFAULT 0,
        sync_attempted_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    await this.db.executeSql(`
      CREATE INDEX IF NOT EXISTS idx_attendance_synced 
      ON attendance_records(synced);
    `);
  }

  // ─── ENROLLMENT METHODS ────────────────────────────────────────────────────

  /**
   * Save face enrollment for a user
   * @param {Object} enrollment - { userId, name, embedding, enrolledAt, photoCount }
   */
  async saveEnrollment({ userId, name, embedding, enrolledAt, photoCount }) {
    if (!this.db) throw new Error('Database not initialized');

    // Encrypt the embedding before storing
    const embeddingJson = JSON.stringify(embedding);
    const encryptedEmbedding = CryptoUtils.encrypt(embeddingJson, this.encryptionKey);

    await this.db.executeSql(
      `INSERT OR REPLACE INTO enrollments 
       (user_id, name, embedding_encrypted, enrolled_at, photo_count) 
       VALUES (?, ?, ?, ?, ?)`,
      [userId, name, encryptedEmbedding, enrolledAt, photoCount]
    );

    console.log(`[Storage] Enrollment saved: ${userId}`);
  }

  /**
   * Retrieve enrollment by userId (decrypts embedding)
   */
  async getEnrollment(userId) {
    if (!this.db) throw new Error('Database not initialized');

    const [result] = await this.db.executeSql(
      'SELECT * FROM enrollments WHERE user_id = ?',
      [userId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows.item(0);

    // Decrypt the embedding
    const embeddingJson = CryptoUtils.decrypt(row.embedding_encrypted, this.encryptionKey);
    const embedding = JSON.parse(embeddingJson);

    return {
      userId: row.user_id,
      name: row.name,
      embedding,
      enrolledAt: row.enrolled_at,
      photoCount: row.photo_count,
    };
  }

  /**
   * Delete a user enrollment
   */
  async deleteEnrollment(userId) {
    await this.db.executeSql(
      'DELETE FROM enrollments WHERE user_id = ?',
      [userId]
    );
  }

  /**
   * Get all enrolled user IDs
   */
  async getAllEnrolledUsers() {
    const [result] = await this.db.executeSql(
      'SELECT user_id, name, enrolled_at FROM enrollments ORDER BY name'
    );
    const users = [];
    for (let i = 0; i < result.rows.length; i++) {
      users.push(result.rows.item(i));
    }
    return users;
  }

  // ─── ATTENDANCE METHODS ────────────────────────────────────────────────────

  /**
   * Save an attendance record (offline, encrypted metadata)
   */
  async saveAttendanceRecord({ userId, name, timestamp, confidence, latencyMs, livenessChallenge }) {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.executeSql(
      `INSERT INTO attendance_records 
       (user_id, name, timestamp, confidence, latency_ms, liveness_challenge, synced) 
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [userId, name, timestamp, confidence, latencyMs, livenessChallenge]
    );

    console.log(`[Storage] Attendance saved: ${userId} at ${timestamp}`);
  }

  /**
   * Get all unsynced attendance records
   */
  async getPendingRecords() {
    const [result] = await this.db.executeSql(
      'SELECT * FROM attendance_records WHERE synced = 0 ORDER BY timestamp ASC'
    );
    const records = [];
    for (let i = 0; i < result.rows.length; i++) {
      records.push(result.rows.item(i));
    }
    return records;
  }

  /**
   * Count unsynced records
   */
  async getPendingCount() {
    const [result] = await this.db.executeSql(
      'SELECT COUNT(*) as count FROM attendance_records WHERE synced = 0'
    );
    return result.rows.item(0).count;
  }

  /**
   * Mark records as synced (by array of IDs)
   */
  async markAsSynced(ids) {
    if (!ids || ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    await this.db.executeSql(
      `UPDATE attendance_records SET synced = 1, sync_attempted_at = ? WHERE id IN (${placeholders})`,
      [new Date().toISOString(), ...ids]
    );
  }

  /**
   * Purge synced records older than 7 days
   */
  async purgeSyncedRecords() {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [result] = await this.db.executeSql(
      'DELETE FROM attendance_records WHERE synced = 1 AND sync_attempted_at < ?',
      [cutoff]
    );
    console.log(`[Storage] Purged ${result.rowsAffected} synced records`);
    return result.rowsAffected;
  }

  /**
   * Get recent attendance log for display
   */
  async getRecentAttendance(limit = 50) {
    const [result] = await this.db.executeSql(
      'SELECT * FROM attendance_records ORDER BY timestamp DESC LIMIT ?',
      [limit]
    );
    const records = [];
    for (let i = 0; i < result.rows.length; i++) {
      records.push(result.rows.item(i));
    }
    return records;
  }

  // ─── KEY MANAGEMENT ────────────────────────────────────────────────────────

  async _getOrCreateEncryptionKey() {
    try {
      const existing = await EncryptedStorage.getItem('faceshield_aes_key');
      if (existing) return existing;
    } catch {}

    // Generate new 256-bit key
    const newKey = CryptoUtils.generateKey();
    await EncryptedStorage.setItem('faceshield_aes_key', newKey);
    return newKey;
  }
}

export default new StorageService();
