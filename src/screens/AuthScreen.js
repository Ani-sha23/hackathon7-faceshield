/**
 * AuthScreen.js
 * Main authentication screen — camera + liveness challenge UI
 * NHAI Hackathon 7.0 — Anisha Garg
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, Animated, SafeAreaView,
} from 'react-native';
import { Camera, useCameraDevices } from 'react-native-vision-camera';
import FaceShieldService, { AuthResult } from '../services/FaceShieldService';

// Challenge display text and emoji
const CHALLENGE_DISPLAY = {
  BLINK:      { text: 'Please BLINK',          emoji: '👁️', color: '#065A82' },
  SMILE:      { text: 'Please SMILE',           emoji: '😊', color: '#1A7A3A' },
  TURN_LEFT:  { text: 'Turn HEAD LEFT',         emoji: '⬅️', color: '#6A2A6A' },
  TURN_RIGHT: { text: 'Turn HEAD RIGHT',        emoji: '➡️', color: '#8B5A00' },
};

export default function AuthScreen({ route, navigation }) {
  const { userId, userName } = route.params;

  const [status, setStatus] = useState('idle'); // idle | initializing | challenge | processing | success | failed
  const [challenge, setChallenge] = useState(null);
  const [result, setResult] = useState(null);
  const [isCameraReady, setIsCameraReady] = useState(false);

  const cameraRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const devices = useCameraDevices();
  const device = devices.front;

  // Pulse animation for challenge indicator
  useEffect(() => {
    if (status === 'challenge') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.1, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [status]);

  const getFrame = useCallback(async () => {
    if (!cameraRef.current || !isCameraReady) return null;
    try {
      const photo = await cameraRef.current.takeSnapshot({ quality: 85, skipMetadata: true });
      return photo;
    } catch {
      return null;
    }
  }, [isCameraReady]);

  const startAuthentication = useCallback(async () => {
    setStatus('initializing');
    setChallenge(null);
    setResult(null);

    try {
      const authResult = await FaceShieldService.authenticate({
        userId,
        onChallenge: (challengeType) => {
          setChallenge(challengeType);
          setStatus('challenge');
        },
        getCameraFrame: getFrame,
        timeoutMs: 15000,
      });

      setStatus(authResult.authenticated ? 'success' : 'failed');
      setResult(authResult);

      if (authResult.authenticated) {
        setTimeout(() => navigation.navigate('AttendanceConfirm', {
          userId,
          userName,
          confidence: authResult.confidence,
          latencyMs: authResult.latencyMs,
        }), 1500);
      }
    } catch (error) {
      setStatus('failed');
      setResult({ result: AuthResult.ERROR, error: error.message });
    }
  }, [userId, getFrame]);

  if (!device) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Camera not available</Text>
      </View>
    );
  }

  const challengeInfo = challenge ? CHALLENGE_DISPLAY[challenge] : null;

  return (
    <SafeAreaView style={styles.container}>
      {/* Camera */}
      <View style={styles.cameraContainer}>
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={true}
          onInitialized={() => setIsCameraReady(true)}
          photo={true}
        />

        {/* Face oval overlay */}
        <View style={styles.ovalOverlay} />

        {/* Status overlays */}
        {status === 'success' && (
          <View style={[styles.resultOverlay, { backgroundColor: '#1A7A3A99' }]}>
            <Text style={styles.resultEmoji}>✅</Text>
            <Text style={styles.resultText}>Verified!</Text>
            <Text style={styles.resultSub}>{(result?.confidence * 100).toFixed(1)}% confidence</Text>
          </View>
        )}

        {status === 'failed' && (
          <View style={[styles.resultOverlay, { backgroundColor: '#8B000099' }]}>
            <Text style={styles.resultEmoji}>❌</Text>
            <Text style={styles.resultText}>Not Verified</Text>
            <Text style={styles.resultSub}>{result?.reason || result?.result}</Text>
          </View>
        )}
      </View>

      {/* Bottom panel */}
      <View style={styles.bottomPanel}>
        <Text style={styles.userName}>{userName}</Text>
        <Text style={styles.userId}>ID: {userId}</Text>

        {/* Challenge display */}
        {challengeInfo && status === 'challenge' && (
          <Animated.View style={[styles.challengeBox, { borderColor: challengeInfo.color, transform: [{ scale: pulseAnim }] }]}>
            <Text style={styles.challengeEmoji}>{challengeInfo.emoji}</Text>
            <Text style={[styles.challengeText, { color: challengeInfo.color }]}>
              {challengeInfo.text}
            </Text>
          </Animated.View>
        )}

        {status === 'processing' && (
          <View style={styles.processingBox}>
            <ActivityIndicator size="small" color="#065A82" />
            <Text style={styles.processingText}>Verifying identity...</Text>
          </View>
        )}

        {/* Action button */}
        {(status === 'idle' || status === 'failed') && (
          <TouchableOpacity
            style={styles.authButton}
            onPress={startAuthentication}
            disabled={!isCameraReady}
          >
            <Text style={styles.authButtonText}>
              {status === 'failed' ? '🔄  Try Again' : '🔒  Authenticate'}
            </Text>
          </TouchableOpacity>
        )}

        {(status === 'initializing' || status === 'challenge') && (
          <View style={styles.cancelArea}>
            <ActivityIndicator size="small" color="#888" />
            <Text style={styles.cancelText}>
              {status === 'initializing' ? 'Preparing...' : 'Waiting for challenge...'}
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A1A2A' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#FF4444', fontSize: 16 },
  cameraContainer: { flex: 1, position: 'relative' },
  ovalOverlay: {
    position: 'absolute',
    alignSelf: 'center',
    top: '10%',
    width: 220,
    height: 280,
    borderRadius: 110,
    borderWidth: 3,
    borderColor: '#02A8A8',
    backgroundColor: 'transparent',
  },
  resultOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultEmoji: { fontSize: 64 },
  resultText: { fontSize: 28, color: '#FFFFFF', fontWeight: 'bold', marginTop: 12 },
  resultSub: { fontSize: 14, color: '#CCDDEE', marginTop: 6 },
  bottomPanel: {
    backgroundColor: '#0F2030',
    padding: 24,
    alignItems: 'center',
    minHeight: 200,
  },
  userName: { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF' },
  userId: { fontSize: 14, color: '#88AABB', marginTop: 4, marginBottom: 16 },
  challengeBox: {
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 16,
    alignItems: 'center',
    marginVertical: 8,
    backgroundColor: '#1A2A3A',
    width: '100%',
  },
  challengeEmoji: { fontSize: 40, marginBottom: 8 },
  challengeText: { fontSize: 20, fontWeight: 'bold' },
  processingBox: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 8 },
  processingText: { color: '#88AABB', fontSize: 16 },
  authButton: {
    backgroundColor: '#065A82',
    borderRadius: 12,
    paddingHorizontal: 40,
    paddingVertical: 16,
    marginTop: 8,
    width: '100%',
    alignItems: 'center',
  },
  authButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
  cancelArea: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  cancelText: { color: '#888', fontSize: 14 },
});
