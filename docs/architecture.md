# FaceShield — Technical Architecture

## System Overview

FaceShield is a React Native native module that provides fully offline biometric authentication for the NHAI Datalake 3.0 application.

## Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      React Native App                       │
│                                                             │
│  ┌────────────┐  ┌───────────────┐  ┌──────────────────┐  │
│  │AuthScreen  │  │EnrollmentScreen│ │AttendanceScreen  │  │
│  └─────┬──────┘  └───────┬───────┘  └────────┬─────────┘  │
│        │                 │                    │             │
│        └─────────────────┴────────────────────┘             │
│                          │                                  │
│              ┌───────────▼──────────────┐                  │
│              │     FaceShieldService     │                  │
│              │  (Core Orchestrator)      │                  │
│              └──────┬──────────┬─────────┘                  │
│                     │          │                            │
│        ┌────────────▼──┐  ┌────▼───────────────┐          │
│        │FaceRecognition │  │  LivenessService   │          │
│        │Service         │  │  ┌──────────────┐  │          │
│        │MobileFaceNet   │  │  │Active Layer  │  │          │
│        │TFLite (~2 MB)  │  │  │MediaPipe FM  │  │          │
│        └───────────────┘  │  └──────────────┘  │          │
│                           │  ┌──────────────┐  │          │
│                           │  │Passive Layer │  │          │
│                           │  │MobileNetV3   │  │          │
│                           │  │TFLite (~3 MB)│  │          │
│                           │  └──────────────┘  │          │
│                           └────────────────────┘          │
│                                                             │
│        ┌──────────────────┐    ┌──────────────────────┐   │
│        │  StorageService  │    │     SyncService       │   │
│        │  SQLite          │    │  AWS S3 + Lambda      │   │
│        │  AES-256 encrypt │    │  NetInfo listener     │   │
│        └──────────────────┘    └──────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │ (on network restore)
                    ┌─────────▼──────────┐
                    │      AWS Cloud     │
                    │  S3 Bucket         │
                    │  Lambda Function   │
                    │  (ACK + purge)     │
                    └────────────────────┘
```

## Face Recognition Model

### MobileFaceNet
- **Architecture**: Depthwise separable convolutions optimized for mobile
- **Input**: 112×112 RGB image, normalized to [-1, 1]
- **Output**: 128-dimensional L2-normalized embedding vector
- **Model format**: TFLite FP16 quantized
- **Size on disk**: ~2 MB
- **Inference time**: ~150ms on Snapdragon 660

### Training & Fine-tuning
- Base training: MS-Celeb-1M (10M images, 100K identities)
- Fine-tuning dataset: 50,000+ Indian demographic images
  - Diverse skin tones (Type III–VI Fitzpatrick scale)
  - Regional demographics: North, South, East, West India
  - Lighting conditions: harsh sunlight, shadow, overcast, indoor
  - Sources: Adience dataset, UMD-Faces, custom collected

### Matching
- Distance metric: Cosine similarity
- Positive threshold: similarity > 0.6
- 5-photo enrollment → averaged embedding for robust template

## Liveness Detection

### Layer 1: Active Challenge
- Technology: MediaPipe Face Mesh (468 landmarks)
- Challenges: BLINK / SMILE / TURN_LEFT / TURN_RIGHT (random)
- Timeout: 5 seconds per challenge
- Metrics:
  - BLINK: Eye Aspect Ratio < 0.2
  - SMILE: Mouth Aspect Ratio > 0.35
  - TURN: Head yaw delta > 20 degrees

### Layer 2: Passive Texture Analysis
- Model: MobileNetV3-Small binary classifier
- Training data: NUAA + CASIA-FASD + custom Indian datasets
- Input: 224×224 RGB image
- Output: [spoof_prob, real_prob]
- Threshold: spoof_prob < 0.5 = real face
- Size: ~3 MB

## Data Storage & Security

### Encryption
- Algorithm: AES-256-CBC
- Key: 256-bit key generated on first run, stored in device secure enclave
- What is stored:
  - Face embeddings: encrypted 128-D float vectors (NOT raw images)
  - Attendance metadata: userId, timestamp, confidence, GPS (if available)
  - Raw face images are NEVER persisted

### SQLite Schema
```sql
enrollments (
  user_id TEXT PRIMARY KEY,
  name TEXT,
  embedding_encrypted TEXT,  -- AES-256 encrypted JSON
  enrolled_at TEXT,
  photo_count INTEGER
)

attendance_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  name TEXT,
  timestamp TEXT,
  confidence REAL,
  latency_ms INTEGER,
  liveness_challenge TEXT,
  synced INTEGER DEFAULT 0,
  sync_attempted_at TEXT
)
```

## AWS Sync Architecture

### Sync Flow
1. `NetInfo` detects network connectivity restoration
2. `SyncService` queries SQLite for `synced = 0` records
3. Records batched in groups of 50, compressed, uploaded to S3
4. S3 key format: `attendance/YYYY-MM-DD/batch_<timestamp>.json`
5. Lambda function processes batch → sends ACK
6. On ACK: records marked `synced = 1`
7. Records older than 7 days with `synced = 1` purged

### Retry Logic
- Maximum 3 retry attempts per batch
- Exponential backoff: 2s, 4s, 6s
- Failed batches remain in local DB for next sync attempt

### S3 Server-Side Encryption
- All S3 objects stored with `ServerSideEncryption: AES256`
- IAM role-based access (no credentials in app bundle)
- AWS Cognito Identity Pool for temporary credentials
