/**
 * AttendanceScreen.js
 * Offline attendance log with sync status
 * NHAI Hackathon 7.0 — Anisha Garg
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, SafeAreaView, Alert,
} from 'react-native';
import StorageService from '../services/StorageService';
import SyncService, { SyncStatus } from '../services/SyncService';

export default function AttendanceScreen() {
  const [records, setRecords] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState(SyncStatus.IDLE);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const [recent, pending] = await Promise.all([
      StorageService.getRecentAttendance(100),
      StorageService.getPendingCount(),
    ]);
    setRecords(recent);
    setPendingCount(pending);
  }, []);

  useEffect(() => {
    loadData();
    SyncService.startMonitoring(({ status, pendingCount: pc }) => {
      setSyncStatus(status);
      if (pc !== undefined) setPendingCount(pc);
      if (status === SyncStatus.SUCCESS) loadData();
    });
    return () => SyncService.stopMonitoring();
  }, []);

  const handleManualSync = async () => {
    Alert.alert('Sync Records', `Upload ${pendingCount} pending records to AWS?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sync Now',
        onPress: async () => {
          const result = await SyncService.syncPendingRecords();
          if (result.synced > 0) {
            Alert.alert('Sync Complete', `✅ ${result.synced} records uploaded\n🗑️ ${result.purged} old records purged`);
            loadData();
          } else if (result.error) {
            Alert.alert('Sync Failed', result.error);
          } else {
            Alert.alert('No Network', 'Connect to internet and try again.');
          }
        }
      }
    ]);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const getSyncBadge = (synced) => ({
    text: synced ? 'Synced' : 'Pending',
    color: synced ? '#1A7A3A' : '#8B5A00',
    bg: synced ? '#E8F8EC' : '#FFF3E0',
  });

  const renderItem = ({ item }) => {
    const badge = getSyncBadge(item.synced);
    const date = new Date(item.timestamp);
    const timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const dateStr = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

    return (
      <View style={styles.card}>
        <View style={styles.cardLeft}>
          <Text style={styles.cardName}>{item.name}</Text>
          <Text style={styles.cardId}>ID: {item.user_id}</Text>
          <Text style={styles.cardChallenge}>Liveness: {item.liveness_challenge}</Text>
        </View>
        <View style={styles.cardRight}>
          <Text style={styles.cardTime}>{timeStr}</Text>
          <Text style={styles.cardDate}>{dateStr}</Text>
          <Text style={styles.cardConfidence}>
            {(item.confidence * 100).toFixed(1)}%
          </Text>
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.badgeText, { color: badge.color }]}>{badge.text}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header stats */}
      <View style={styles.header}>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>{records.length}</Text>
          <Text style={styles.statLabel}>Total Records</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statNum, pendingCount > 0 && styles.pending]}>{pendingCount}</Text>
          <Text style={styles.statLabel}>Pending Sync</Text>
        </View>
        <TouchableOpacity
          style={[styles.syncButton, syncStatus === SyncStatus.SYNCING && styles.syncingButton]}
          onPress={handleManualSync}
          disabled={syncStatus === SyncStatus.SYNCING}
        >
          <Text style={styles.syncButtonText}>
            {syncStatus === SyncStatus.SYNCING ? '⏳ Syncing...' : '☁️ Sync Now'}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={records}
        keyExtractor={item => item.id.toString()}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📋</Text>
            <Text style={styles.emptyText}>No attendance records yet</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F8FA' },
  header: {
    flexDirection: 'row', alignItems: 'center', padding: 16,
    backgroundColor: '#1A3A6B', gap: 12,
  },
  statBox: { alignItems: 'center', flex: 1 },
  statNum: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF' },
  pending: { color: '#FFD080' },
  statLabel: { fontSize: 11, color: '#A8D4E6', marginTop: 2 },
  syncButton: {
    backgroundColor: '#02A8A8', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  syncingButton: { backgroundColor: '#445566' },
  syncButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: 'bold' },
  list: { padding: 12 },
  card: {
    flexDirection: 'row', backgroundColor: '#FFFFFF',
    borderRadius: 10, padding: 14, marginBottom: 8,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 3,
  },
  cardLeft: { flex: 1 },
  cardRight: { alignItems: 'flex-end', gap: 3 },
  cardName: { fontSize: 15, fontWeight: 'bold', color: '#1A3A6B' },
  cardId: { fontSize: 12, color: '#777', marginTop: 2 },
  cardChallenge: { fontSize: 11, color: '#065A82', marginTop: 4 },
  cardTime: { fontSize: 16, fontWeight: 'bold', color: '#1A3A6B' },
  cardDate: { fontSize: 12, color: '#777' },
  cardConfidence: { fontSize: 12, color: '#1A7A3A', fontWeight: '600' },
  badge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginTop: 2 },
  badgeText: { fontSize: 10, fontWeight: '600' },
  empty: { alignItems: 'center', padding: 48 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: '#888', fontSize: 16 },
});
