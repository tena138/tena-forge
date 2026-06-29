# Tena Note

Student-facing Tena app for academy key registration, unified calendar, notes,
assignments, materials, and wrong-answer review.

## Server Target

The app defaults to the production Tena Forge API:

- API: `https://tena-forge-api.onrender.com`
- Web: `https://www.tena-forge.com`

This is intentional. Academy keys created in the production Forge web app must be
validated against the same production backend. Local development should opt into
local servers explicitly:

```bash
flutter run -d chrome \
  --dart-define=API_BASE_URL=http://127.0.0.1:8000 \
  --dart-define=FRONTEND_BASE_URL=http://127.0.0.1:3001
```

Android emulator local backend:

```bash
flutter run \
  --dart-define=API_BASE_URL=http://10.0.2.2:8000 \
  --dart-define=FRONTEND_BASE_URL=http://10.0.2.2:3001
```

Production-like Chrome check:

```bash
flutter run -d chrome --web-port=53100
```

Academy keys are normalized as 12 alphanumeric characters, so
`ABCD-EFGH-IJKL` and `ABCDEFGHIJKL` resolve to the same key. Masked previews
such as `****IJKL` are display-only and cannot be registered.

## Getting Started

This project is a starting point for a Flutter application.

A few resources to get you started if this is your first Flutter project:

- [Lab: Write your first Flutter app](https://docs.flutter.dev/get-started/codelab)
- [Cookbook: Useful Flutter samples](https://docs.flutter.dev/cookbook)

For help getting started with Flutter development, view the
[online documentation](https://docs.flutter.dev/), which offers tutorials,
samples, guidance on mobile development, and a full API reference.
