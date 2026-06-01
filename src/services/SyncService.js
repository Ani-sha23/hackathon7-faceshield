/**
 * SyncService.js
 * AWS S3 sync and local purge service
 * NHAI Hackathon 7.0 — Anisha Garg
 *
 * Monitors network connectivity and uploads pending attendance
 * records to AWS S3 when connection is restored.
 * Purges local records after confirmed sync.
 */

import NetInfo from '@react-native-community/netinfo';
import AWS from 'aws-sdk';
import StorageService from './StorageService';

// AWS Configuration — set via environment or config file
const AWS_CONFIG = {
  region: 'ap-south-1',          // Mumbai region for NHAI
  bucketName: 'nhai-datalake-attendance',
  maxRetries: 3,
  retryDelayMs: 2000,
};

// Sync status codes
export const SyncStatus = {
  IDLE: 'IDLE',
  SYNCING: 'SYNCING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  NO_NETWORK: 'NO_NETWORK',
};

class SyncService {
  constructor() {
    this.isSyncing = false;
    this.networkListener = null;
    this.onStatusChange = null;
    this.s3 = null;
  }

  /**
   * Start listening for network connectivity changes
   * Automatically triggers sync when connection is restored
   * @param {Function} onStatusChange - Callback with SyncStatus and count
   */
  startMonitoring(onStatusChange) {
    this.onStatusChange = onStatusChange;

    this.networkListener = NetInfo.addEventListener(async (state) => {
      if (state.isConnected && state.isInternetReachable) {
        console.log('[Sync] Network detected — checking for pending records');
        const pending = await StorageService.getPendingCount();
        if (pending > 0) {
          console.log(`[Sync] ${pending} records pending — starting sync`);
          await this.syncPendingRecords();
        }
      }
    });

    console.log('[Sync] Network monitoring started');
  }

  /**
   * Stop network monitoring
   */
  stopMonitoring() {
    if (this.networkListener) {
      this.networkListener();
      this.networkListener = null;
    }
  }

  /**
   * Manually trigger sync of pending attendance records
   * @returns {Object} { synced, failed, purged }
   */
  async syncPendingRecords() {
    if (this.isSyncing) {
      console.log('[Sync] Sync already in progress');
      return { synced: 0, failed: 0, purged: 0 };
    }

    // Check network before attempting
    const netState = await NetInfo.fetch();
    if (!netState.isConnected || !netState.isInternetReachable) {
      this._notifyStatus(SyncStatus.NO_NETWORK, 0);
      return { synced: 0, failed: 0, purged: 0 };
    }

    this.isSyncing = true;
    this._notifyStatus(SyncStatus.SYNCING);

    try {
      // Initialize S3 client
      await this._initS3();

      // Get all unsynced records
      const pending = await StorageService.getPendingRecords();
      console.log(`[Sync] Uploading ${pending.length} records`);

      if (pending.length === 0) {
        this.isSyncing = false;
        this._notifyStatus(SyncStatus.SUCCESS, 0);
        return { synced: 0, failed: 0, purged: 0 };
      }

      // Group records into batches of 50
      const batches = this._chunkArray(pending, 50);
      const syncedIds = [];
      let failedCount = 0;

      for (const batch of batches) {
        const result = await this._uploadBatch(batch);
        syncedIds.push(...result.successIds);
        failedCount += result.failedCount;
      }

      // Mark successfully synced records
      if (syncedIds.length > 0) {
        await StorageService.markAsSynced(syncedIds);
      }

      // Purge old synced records (>7 days)
      const purged = await StorageService.purgeSyncedRecords();

      const remaining = await StorageService.getPendingCount();
      this._notifyStatus(SyncStatus.SUCCESS, remaining);

      console.log(`[Sync] Complete — synced: ${syncedIds.length}, failed: ${failedCount}, purged: ${purged}`);

      return { synced: syncedIds.length, failed: failedCount, purged };
    } catch (error) {
      console.error('[Sync] Sync failed:', error);
      this._notifyStatus(SyncStatus.FAILED);
      return { synced: 0, failed: 0, purged: 0, error: error.message };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Upload a batch of attendance records to S3
   */
  async _uploadBatch(records) {
    const successIds = [];
    let failedCount = 0;

    // Build batch payload
    const payload = {
      batchId: `batch_${Date.now()}`,
      uploadedAt: new Date().toISOString(),
      deviceId: await this._getDeviceId(),
      records: records.map(r => ({
        id: r.id,
        userId: r.user_id,
        name: r.name,
        timestamp: r.timestamp,
        confidence: r.confidence,
        latencyMs: r.latency_ms,
        livenessChallenge: r.liveness_challenge,
      })),
    };

    const key = `attendance/${new Date().toISOString().split('T')[0]}/${payload.batchId}.json`;
    const body = JSON.stringify(payload);

    // Upload with retry logic
    for (let attempt = 1; attempt <= AWS_CONFIG.maxRetries; attempt++) {
      try {
        await this.s3.putObject({
          Bucket: AWS_CONFIG.bucketName,
          Key: key,
          Body: body,
          ContentType: 'application/json',
          ServerSideEncryption: 'AES256',
        }).promise();

        // All records in this batch succeeded
        successIds.push(...records.map(r => r.id));
        console.log(`[Sync] Batch uploaded: ${key}`);
        break;
      } catch (error) {
        if (attempt === AWS_CONFIG.maxRetries) {
          console.error(`[Sync] Batch failed after ${attempt} attempts:`, error);
          failedCount += records.length;
        } else {
          await this._sleep(AWS_CONFIG.retryDelayMs * attempt);
        }
      }
    }

    return { successIds, failedCount };
  }

  async _initS3() {
    if (this.s3) return;

    // Credentials should be provided via AWS Cognito Identity Pool
    // or secure environment config — not hardcoded
    AWS.config.update({ region: AWS_CONFIG.region });

    this.s3 = new AWS.S3();
  }

  _notifyStatus(status, pendingCount) {
    if (this.onStatusChange) {
      this.onStatusChange({ status, pendingCount });
    }
  }

  _chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  async _getDeviceId() {
    try {
      const { default: DeviceInfo } = await import('react-native-device-info');
      return await DeviceInfo.getUniqueId();
    } catch {
      return 'unknown-device';
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new SyncService();
