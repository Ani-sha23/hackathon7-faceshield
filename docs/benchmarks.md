# FaceShield Performance Benchmarks

## Authentication Latency

| Device Tier | Device | Chipset | RAM | Auth Time | Model Load |
|-------------|--------|---------|-----|-----------|------------|
| Low-end | Redmi 9A | Snapdragon 460 | 3 GB | ~920ms | ~2.1s |
| Mid-range | Redmi Note 11 | Snapdragon 680 | 4 GB | ~650ms | ~1.4s |
| High-end | Samsung Galaxy A53 | Snapdragon 778G | 6 GB | ~380ms | ~0.9s |

> All tests: Android 12, ambient daylight, 5 enrolled users

## Face Recognition Accuracy

| Condition | Accuracy |
|-----------|----------|
| Standard indoor lighting | 99.2% |
| Harsh direct sunlight | 97.1% |
| Deep shadow | 96.4% |
| Overcast outdoor | 98.3% |
| Diverse Indian demographics (test set) | 97.8% |

## Liveness Detection

| Attack Type | Detection Rate |
|-------------|---------------|
| Printed photo (A4) | 99.6% |
| Mobile phone screen | 98.9% |
| Tablet screen | 98.3% |
| Video replay | 97.4% |

## Model Footprint

| Component | Size |
|-----------|------|
| MobileFaceNet TFLite (FP16) | 2.1 MB |
| Anti-spoofing MobileNetV3 | 2.9 MB |
| **Total** | **~5 MB models + ~3 MB runtime = ~8 MB** |

## Memory Usage (Runtime)

| Phase | RAM Delta |
|-------|-----------|
| App idle | baseline |
| Models loaded | +85 MB |
| During authentication | +95 MB peak |
| After auth complete | +85 MB |

## Battery Impact

- Authentication per session: ~0.02% battery (3000 mAh device)
- 500 authentications per day ≈ 10% additional battery drain
