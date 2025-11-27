# Bio-ID Guard 🧬

**Bio-ID Guard** is a web-based prototype demonstrating **Liveness Detection** for identity verification. It is part of the **Fraud & Social Engineering Defense Architecture**.

## Features
-   **Face Detection**: Real-time face tracking using `face-api.js`.
-   **Active Liveness Challenge**:
    1.  **Blink Detection**: Verifies eye movement (EAR metric).
    2.  **Head Turn**: Verifies 3D depth/responsiveness (Yaw metric).
-   **Anti-Spoofing**: Rejects static photos and simple screen replays that cannot respond to challenges.

## How to Test
1.  Open the app on a mobile device (iPhone/Android).
2.  Grant **Camera Permission**.
3.  **Phase 1**: Center your face in the frame.
4.  **Phase 2**: Follow the prompt to **"BLINK"**.
5.  **Phase 3**: Follow the prompt to **"TURN HEAD"**.
6.  **Result**: Green "ACCESS GRANTED" screen if successful.

## Deployment
This app requires HTTPS for camera access. Deploy to **GitHub Pages** for best results on mobile.
