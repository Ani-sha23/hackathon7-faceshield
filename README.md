# 🛡️ FaceShield — NHAI Hackathon 7.0

**Offline Facial Recognition & Liveness Detection System for Remote Field Operations**

> A fully offline, AI-powered biometric authentication module for the Datalake 3.0 React Native app — enabling secure field personnel attendance in zero-network environments.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![React Native](https://img.shields.io/badge/React%20Native-0.73+-green)](https://reactnative.dev)
[![Platform](https://img.shields.io/badge/Platform-Android%20%7C%20iOS-lightgrey)](https://reactnative.dev)
[![Model Size](https://img.shields.io/badge/Model%20Size-~8%20MB-brightgreen)](docs/architecture.md)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Technical Specs](#technical-specs)
- [Architecture](#architecture)
- [Installation](#installation)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Performance Benchmarks](#performance-benchmarks)
- [Project Structure](#project-structure)
- [Team](#team)

---

## Overview

FaceShield solves the critical problem of biometric authentication for NHAI field personnel who operate in remote areas with **zero internet connectivity**. The system integrates as a React Native native module into the existing Datalake 3.0 app.

**Problem**: Field workers in highway maintenance zones cannot be authenticated biometrically without internet — allowing proxy fraud and manual attendance manipulation.

**Solution**: A lightweight (<20 MB) offline AI module combining:
- **MobileFaceNet** (TFLite) for face recognition
- **MobileNetV3 + MediaPipe** for dual-layer liveness detection
- **AES-256 encrypted SQLite** for offline storage
- **AWS S3 sync + purge** when connectivity is restored

---

## Features

- ✅ **100% Offline** — no internet required for authentication
- ✅ **Dual-Layer Liveness** — active challenge (blink/smile/turn) + passive texture anti-spoofing
- ✅ **~8 MB total** model bundle (2.5× under the 20 MB limit)
- ✅ **<650ms** end-to-end authentication on mid-range devices
- ✅ **>99% accuracy** with Indian demographic fine-tuning
- ✅ **AES-256 encryption** for all local biometric data
- ✅ **AWS sync & purge** on network restoration
- ✅ **React Native** — works on Android 8.0+ and iOS 12+
- ✅ **Apache 2.0** — fully open source, zero license fees

---

## Technical Specs

| Parameter | Requirement | FaceShield |
|-----------|-------------|------------|
| Framework | React Native (Android + iOS) | ✅ RN 0.73+ |
| Model Size | ~20 MB target | ✅ ~8 MB total |
| Speed | < 1 second | ✅ ~650ms |
| Min OS | Android 8.0+ / iOS 12+ | ✅ Supported |
| Min RAM | 3 GB | ✅ Optimized |
| Accuracy | > 95% | ✅ ~99% |
| Open Source | Yes | ✅ Apache 2.0 |
| AWS Sync | Yes | ✅ + Purge logic |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Datalake 3.0 App                      │
│  ┌──────────────────────────────────────────────────┐   │
│  │              FaceShield Module                   │   │
│  │                                                  │   │
│  │  Camera → FaceDetection → LivenessCheck          │   │
│  │               ↓                ↓                 │   │
│  │         MobileFaceNet    MobileNetV3              │   │
│  │         (TFLite 2MB)   + MediaPipe               │   │
│  │               ↓                                  │   │
│  │         SQLite (AES-256 encrypted)               │   │
│  │               ↓ (on network restore)             │   │
│  │         AWS S3 Sync → Lambda ACK → Purge         │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

See [docs/architecture.md](docs/architecture.md) for full technical architecture.

---

## Installation

### Prerequisites

- Node.js 18+
- React Native CLI
- Android Studio / Xcode
- Java 17 (for Android)

### Setup

```bash
# Clone the repository
git clone https://github.com/Ani-sha23/hackathon7-faceshield.git
cd hackathon7-faceshield

# Install dependencies
npm install

# iOS (Mac only)
cd ios && pod install && cd ..

# Android
npx react-native run-android

# iOS
npx react-native run-ios
```

### TFLite Models

The TFLite model files are stored in:
- Android: `android/app/src/main/assets/models/`
- iOS: `ios/FaceShield/models/`

Models included:
- `mobilefacenet.tflite` — face recognition (~2 MB)
- `antispoofing.tflite` — passive liveness detection (~3 MB)

---

## Usage

### Basic Authentication Flow

```javascript
import FaceShield from './src/services/FaceShieldService';

// 1. Enroll a user (requires network for initial setup)
await FaceShield.enrollUser({
  userId: 'EMP001',
  photos: [photo1, photo2, photo3, photo4, photo5], // 5 photos
});

// 2. Authenticate (fully offline)
const result = await FaceShield.authenticate({
  userId: 'EMP001',
  onChallenge: (challenge) => {
    // challenge = 'BLINK' | 'SMILE' | 'TURN_LEFT' | 'TURN_RIGHT'
    console.log('Perform:', challenge);
  },
});

if (result.authenticated) {
  console.log('✅ Verified:', result.confidence);
  // Mark attendance
} else {
  console.log('❌ Failed:', result.reason);
}
```

### Sync Attendance Records

```javascript
import SyncService from './src/services/SyncService';

// Manually trigger sync (auto-triggers on network restore)
await SyncService.syncPendingRecords();
```

---

## API Reference

See [docs/api-reference.md](docs/api-reference.md) for full API documentation.

### Core Methods

| Method | Description |
|--------|-------------|
| `FaceShield.enrollUser(params)` | Enroll a new user with 5 face photos |
| `FaceShield.authenticate(params)` | Authenticate with liveness check |
| `FaceShield.deleteEnrollment(userId)` | Remove user enrollment |
| `SyncService.syncPendingRecords()` | Upload pending attendance to AWS |
| `StorageService.getPendingCount()` | Get count of unsynced records |

---

## Performance Benchmarks

| Device Tier | Device Example | Auth Time | RAM Usage |
|-------------|---------------|-----------|-----------|
| Low-end | Redmi 9A (3GB, SD460) | ~920ms | ~110 MB |
| Mid-range | Redmi Note 11 (4GB, SD680) | ~650ms | ~95 MB |
| High-end | Samsung A53 (6GB, SD778G) | ~380ms | ~82 MB |

All devices tested on Android 12 with ambient daylight conditions.

---

## Project Structure

```
hackathon7-faceshield/
├── src/
│   ├── components/
│   │   ├── CameraView.js          # Live camera feed component
│   │   ├── LivenessChallenge.js   # Active challenge UI
│   │   └── ResultOverlay.js       # Auth result display
│   ├── screens/
│   │   ├── EnrollmentScreen.js    # User enrollment flow
│   │   ├── AuthScreen.js          # Authentication screen
│   │   └── AttendanceScreen.js    # Attendance log view
│   ├── services/
│   │   ├── FaceShieldService.js   # Main auth orchestrator
│   │   ├── FaceRecognition.js     # MobileFaceNet TFLite wrapper
│   │   ├── LivenessService.js     # Liveness detection logic
│   │   ├── StorageService.js      # SQLite + AES encryption
│   │   └── SyncService.js         # AWS S3 sync & purge
│   ├── models/
│   │   └── ModelLoader.js         # TFLite model initialization
│   └── utils/
│       ├── ImageUtils.js          # Preprocessing helpers
│       └── CryptoUtils.js         # AES-256 encryption utils
├── docs/
│   ├── architecture.md            # Technical architecture
│   ├── api-reference.md           # API documentation
│   ├── integration-guide.md       # Datalake 3.0 integration
│   └── benchmarks.md              # Performance benchmarks
├── android/
│   └── app/src/main/assets/models/  # TFLite model files
├── ios/
│   └── FaceShield/models/           # TFLite model files
├── LICENSE
└── README.md
```

---

## Team

| Name | Role |
|------|------|
| **Anisha Garg** | Team Leader — AI/ML, React Native |
| Team Member 1 | Backend, AWS Integration |

**Hackathon**: NHAI Hackathon 7.0
**Submission Date**: 01.06.2026

---

## License

This project is licensed under the **Apache License 2.0** — see the [LICENSE](LICENSE) file for details.

All third-party components used are open source (Apache 2.0 / MIT). No proprietary or licensed software is used.

---

*Built with ❤️ for NHAI field personnel safety*
