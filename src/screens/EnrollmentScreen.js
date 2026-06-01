/**
 * EnrollmentScreen.js
 * Face enrollment flow — capture 5 photos for a new user
 * NHAI Hackathon 7.0 — Anisha Garg
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ScrollView, SafeAreaView, Alert,
} from 'react-native';
import { Camera, useCameraDevices } from 'react-native-vision-camera';
import FaceShieldService from '../services/FaceShieldService';

const REQUIRED_PHOTOS = 5;

const PHOTO_INSTRUCTIONS = [
  'Look straight at camera',
  'Turn slightly to the LEFT',
  'Turn slightly to the RIGHT',
  'Tilt head slightly UP',
  'Normal position again',
];

export default function EnrollmentScreen({ navigation }) {
  const [userId, setUserId] = useState('');
  const [userName, setUserName] = useState('');
  const [step, setStep] = useState('form'); // form | capture | processing | done
  const [photos, setPhotos] = useState([]);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  const cameraRef = useRef(null);
  const devices = useCameraDevices();
  const device = devices.front;

  const capturePhoto = useCallback(async () => {
    if (!cameraRef.current || !isCameraReady || isCapturing) return;
    setIsCapturing(true);

    try {
      const photo = await cameraRef.current.takePhoto({ qualityPrioritization: 'quality' });
      const newPhotos = [...photos, photo];
      setPhotos(newPhotos);

      if (newPhotos.length >= REQUIRED_PHOTOS) {
        setStep('processing');
        await enrollUser(newPhotos);
      }
    } catch (error) {
      Alert.alert('Capture Error', 'Could not capture photo. Please try again.');
    } finally {
      setIsCapturing(false);
    }
  }, [photos, isCameraReady, isCapturing, userId, userName]);

  const enrollUser = async (capturedPhotos) => {
    try {
      await FaceShieldService.enrollUser({
        userId: userId.trim(),
        name: userName.trim(),
        photos: capturedPhotos,
      });
      setStep('done');
    } catch (error) {
      Alert.alert('Enrollment Failed', error.message, [
        { text: 'Try Again', onPress: () => { setPhotos([]); setStep('capture'); } }
      ]);
    }
  };

  const startCapture = () => {
    if (!userId.trim() || !userName.trim()) {
      Alert.alert('Required', 'Please enter Employee ID and Name');
      return;
    }
    setStep('capture');
    setPhotos([]);
  };

  if (step === 'form') {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.formContainer}>
          <Text style={styles.title}>Enroll New Employee</Text>
          <Text style={styles.subtitle}>Enter employee details to register their face</Text>

          <Text style={styles.label}>Employee ID *</Text>
          <TextInput
            style={styles.input}
            value={userId}
            onChangeText={setUserId}
            placeholder="e.g. EMP001"
            autoCapitalize="characters"
          />

          <Text style={styles.label}>Full Name *</Text>
          <TextInput
            style={styles.input}
            value={userName}
            onChangeText={setUserName}
            placeholder="e.g. Anisha Garg"
          />

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>📸 Photo Capture Process</Text>
            {PHOTO_INSTRUCTIONS.map((inst, i) => (
              <Text key={i} style={styles.infoItem}>  {i + 1}. {inst}</Text>
            ))}
          </View>

          <TouchableOpacity style={styles.primaryButton} onPress={startCapture}>
            <Text style={styles.primaryButtonText}>Start Enrollment →</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'capture' && device) {
    const photosTaken = photos.length;
    const instruction = PHOTO_INSTRUCTIONS[photosTaken] || '';

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.cameraContainer}>
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={true}
            onInitialized={() => setIsCameraReady(true)}
            photo={true}
          />
          <View style={styles.ovalGuide} />

          <View style={styles.captureOverlay}>
            <Text style={styles.progressText}>
              Photo {photosTaken + 1} of {REQUIRED_PHOTOS}
            </Text>
            <View style={styles.progressDots}>
              {Array.from({ length: REQUIRED_PHOTOS }).map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i < photosTaken && styles.dotFilled]}
                />
              ))}
            </View>
            <Text style={styles.instructionText}>{instruction}</Text>

            <TouchableOpacity
              style={[styles.captureButton, !isCameraReady && styles.captureButtonDisabled]}
              onPress={capturePhoto}
              disabled={!isCameraReady || isCapturing}
            >
              <View style={styles.captureButtonInner} />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'processing') {
    return (
      <View style={styles.centered}>
        <Text style={styles.processingEmoji}>🔄</Text>
        <Text style={styles.processingTitle}>Registering Face...</Text>
        <Text style={styles.processingText}>Processing {REQUIRED_PHOTOS} photos</Text>
      </View>
    );
  }

  if (step === 'done') {
    return (
      <View style={styles.centered}>
        <Text style={styles.processingEmoji}>✅</Text>
        <Text style={styles.successTitle}>Enrollment Complete!</Text>
        <Text style={styles.processingText}>{userName} has been registered</Text>
        <Text style={styles.processingText}>ID: {userId}</Text>
        <TouchableOpacity
          style={[styles.primaryButton, { marginTop: 32 }]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.primaryButtonText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F8FA' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#F4F8FA' },
  formContainer: { padding: 24 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#1A3A6B', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '600', color: '#1A3A6B', marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#C0D8E8', borderRadius: 8,
    padding: 12, fontSize: 16, backgroundColor: '#FFFFFF', marginBottom: 16,
  },
  infoBox: {
    backgroundColor: '#E8F4F8', borderRadius: 10, padding: 16, marginVertical: 16,
  },
  infoTitle: { fontSize: 15, fontWeight: 'bold', color: '#065A82', marginBottom: 8 },
  infoItem: { fontSize: 13, color: '#333', lineHeight: 24 },
  primaryButton: {
    backgroundColor: '#065A82', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 8,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  cameraContainer: { flex: 1 },
  ovalGuide: {
    position: 'absolute', alignSelf: 'center', top: '8%',
    width: 220, height: 280, borderRadius: 110,
    borderWidth: 3, borderColor: '#02A8A8',
  },
  captureOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#0F2030DD', padding: 24, alignItems: 'center',
  },
  progressText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  progressDots: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#445566' },
  dotFilled: { backgroundColor: '#02A8A8' },
  instructionText: { color: '#A8D4E6', fontSize: 14, marginBottom: 20 },
  captureButton: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 4, borderColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center',
  },
  captureButtonDisabled: { opacity: 0.5 },
  captureButtonInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFFFF' },
  processingEmoji: { fontSize: 64, marginBottom: 16 },
  processingTitle: { fontSize: 22, fontWeight: 'bold', color: '#1A3A6B', marginBottom: 8 },
  successTitle: { fontSize: 22, fontWeight: 'bold', color: '#1A7A3A', marginBottom: 8 },
  processingText: { fontSize: 15, color: '#555', marginTop: 4 },
});
