# FaceShield Integration Guide
## Integrating FaceShield into Datalake 3.0

This guide explains how to add the FaceShield offline biometric module to the existing Datalake 3.0 React Native application.

---

## Step 1: Add Dependencies

Add these to your `package.json`:

```json
{
  "dependencies": {
    "@tensorflow/tfjs": "^4.17.0",
    "@tensorflow/tfjs-react-native": "^0.8.0",
    "@react-native-community/netinfo": "^11.3.1",
    "react-native-vision-camera": "^4.0.0",
    "react-native-sqlite-storage": "^6.0.1",
    "react-native-encrypted-storage": "^4.0.3",
    "react-native-fs": "^2.20.0",
    "crypto-js": "^4.2.0",
    "aws-sdk": "^2.1691.0"
  }
}
```

Then run:
```bash
npm install
cd ios && pod install && cd ..
```

---

## Step 2: Add TFLite Models

### Android
Copy models to:
```
android/app/src/main/assets/models/mobilefacenet.tflite
android/app/src/main/assets/models/antispoofing.tflite
```

### iOS
Add models to Xcode project under `FaceShield/models/` group.

---

## Step 3: Android Permissions

Add to `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

---

## Step 4: iOS Permissions

Add to `ios/YourApp/Info.plist`:

```xml
<key>NSCameraUsageDescription</key>
<string>FaceShield needs camera access for facial recognition authentication</string>
```

---

## Step 5: Initialize FaceShield at App Startup

In your `App.js` or app entry point:

```javascript
import FaceShieldService from './src/services/FaceShieldService';
import SyncService from './src/services/SyncService';

// In your root component
useEffect(() => {
  const init = async () => {
    await FaceShieldService.initialize();
    SyncService.startMonitoring(({ status, pendingCount }) => {
      console.log('Sync status:', status, 'Pending:', pendingCount);
    });
  };
  init();

  return () => SyncService.stopMonitoring();
}, []);
```

---

## Step 6: Add to Navigation

```javascript
import AuthScreen from './src/screens/AuthScreen';
import EnrollmentScreen from './src/screens/EnrollmentScreen';
import AttendanceScreen from './src/screens/AttendanceScreen';

// In your Stack.Navigator:
<Stack.Screen name="Auth" component={AuthScreen} />
<Stack.Screen name="Enrollment" component={EnrollmentScreen} />
<Stack.Screen name="Attendance" component={AttendanceScreen} />
```

---

## Step 7: AWS Configuration

Create `src/config/aws-config.js`:

```javascript
export const AWS_CONFIG = {
  region: 'ap-south-1',
  bucketName: 'nhai-datalake-attendance',
  identityPoolId: 'ap-south-1:YOUR_COGNITO_POOL_ID',
};
```

Configure AWS Cognito Identity Pool with appropriate IAM role for S3 write access.

---

## Minimum Requirements

| Item | Requirement |
|------|-------------|
| React Native | 0.73+ |
| Android | 8.0+ (API 26+) |
| iOS | 12.0+ |
| RAM | 3 GB minimum |
| Storage | ~15 MB for models + app |
| Network | Not required for authentication |
