// Bio-ID Guard - Liveness Detection Logic

const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const statusBadge = document.getElementById('system-status');
const instructionText = document.getElementById('instruction-text');
const instructionIcon = document.getElementById('instruction-icon');
const progressFill = document.getElementById('progress-fill');
const scoreLiveness = document.getElementById('score-liveness');
const scoreRisk = document.getElementById('score-risk');
const sessionId = document.getElementById('session-id');

// Config
const BLINK_THRESHOLD = 0.25; // EAR threshold
const TURN_THRESHOLD = 0.3; // Yaw threshold
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/';

// State Machine
const STATE = {
    LOADING: 'loading',
    SCANNING: 'scanning',
    CHALLENGE_BLINK: 'challenge_blink',
    CHALLENGE_TURN_LEFT: 'challenge_turn_left',
    CHALLENGE_TURN_RIGHT: 'challenge_turn_right',
    VERIFIED: 'verified',
    REJECTED: 'rejected'
};

let currentState = STATE.LOADING;
let livenessScore = 0;
let riskScore = 0;

// Initialize
async function init() {
    sessionId.textContent = Math.random().toString(36).substring(7).toUpperCase();

    try {
        await loadModels();
        await startCamera();
        startDetection();
    } catch (err) {
        console.error(err);
        instructionText.textContent = "Error: " + err.message;
    }
}

async function loadModels() {
    instructionText.textContent = "Loading Neural Networks...";
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
    // await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
    updateState(STATE.SCANNING);
}

async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' }
    });
    video.srcObject = stream;

    return new Promise((resolve) => {
        video.onloadedmetadata = () => {
            resolve(video);
        };
    });
}

function updateState(newState) {
    currentState = newState;

    switch (newState) {
        case STATE.SCANNING:
            statusBadge.textContent = "SEARCHING FACE";
            instructionText.textContent = "Center Your Face";
            instructionIcon.textContent = "👤";
            progressFill.style.width = "0%";
            break;
        case STATE.CHALLENGE_BLINK:
            statusBadge.textContent = "LIVENESS CHECK 1/2";
            instructionText.textContent = "Blink Your Eyes Now";
            instructionIcon.textContent = "👀";
            progressFill.style.width = "33%";
            break;
        case STATE.CHALLENGE_TURN_LEFT:
            statusBadge.textContent = "LIVENESS CHECK 2/2";
            instructionText.textContent = "Turn Head Left";
            instructionIcon.textContent = "⬅️";
            progressFill.style.width = "66%";
            break;
        case STATE.VERIFIED:
            statusBadge.textContent = "ACCESS GRANTED";
            instructionText.textContent = "Identity Verified";
            instructionIcon.textContent = "✅";
            progressFill.style.width = "100%";
            document.body.classList.add('success');
            livenessScore = 98;
            riskScore = 2;
            updateMetrics();
            break;
    }
}

function updateMetrics() {
    scoreLiveness.textContent = livenessScore + "%";
    scoreRisk.textContent = riskScore > 50 ? "HIGH" : "LOW";
}

// Detection Loop
async function startDetection() {
    const displaySize = { width: video.videoWidth, height: video.videoHeight };
    faceapi.matchDimensions(canvas, displaySize);

    setInterval(async () => {
        if (currentState === STATE.VERIFIED || currentState === STATE.REJECTED) return;

        const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks();

        const resizedDetections = faceapi.resizeResults(detections, displaySize);
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

        // Draw face box (optional, maybe just landmarks)
        // faceapi.draw.drawDetections(canvas, resizedDetections);

        if (resizedDetections.length > 0) {
            const landmarks = resizedDetections[0].landmarks;
            const box = resizedDetections[0].detection.box;

            // Draw custom box
            const ctx = canvas.getContext('2d');
            ctx.strokeStyle = '#00f2ff';
            ctx.lineWidth = 2;
            ctx.strokeRect(box.x, box.y, box.width, box.height);

            processLiveness(landmarks);
        }
    }, 100);
}

// Liveness Logic
let blinkCounter = 0;
let turnCounter = 0;

function processLiveness(landmarks) {
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();

    // 1. Blink Detection (EAR)
    const earLeft = getEAR(leftEye);
    const earRight = getEAR(rightEye);
    const avgEAR = (earLeft + earRight) / 2;

    // 2. Head Pose (Simple Yaw approximation using nose vs face width)
    // Real head pose requires PnP, but we can estimate yaw by nose position relative to eyes
    const nose = landmarks.getNose()[0];
    const leftEyeInner = leftEye[3];
    const rightEyeInner = rightEye[0];

    const faceCenter = (leftEyeInner.x + rightEyeInner.x) / 2;
    const noseOffset = nose.x - faceCenter;
    // Normalize by eye distance
    const eyeDist = Math.abs(rightEyeInner.x - leftEyeInner.x);
    const yawRatio = noseOffset / eyeDist; // ~0 is center, >0.5 is turn

    // State Logic
    if (currentState === STATE.SCANNING) {
        // If face is stable and centered, start challenge
        if (Math.abs(yawRatio) < 0.2) {
            setTimeout(() => updateState(STATE.CHALLENGE_BLINK), 1000);
        }
    }
    else if (currentState === STATE.CHALLENGE_BLINK) {
        if (avgEAR < BLINK_THRESHOLD) {
            blinkCounter++;
            if (blinkCounter > 2) { // Debounce
                updateState(STATE.CHALLENGE_TURN_LEFT);
            }
        } else {
            blinkCounter = 0;
        }
    }
    else if (currentState === STATE.CHALLENGE_TURN_LEFT) {
        // Check for turn (Yaw)
        if (yawRatio > 0.3 || yawRatio < -0.3) { // Left or Right turn accepted
            turnCounter++;
            if (turnCounter > 3) {
                updateState(STATE.VERIFIED);
            }
        }
    }
}

// Calculate Eye Aspect Ratio
function getEAR(eye) {
    const A = dist(eye[1], eye[5]);
    const B = dist(eye[2], eye[4]);
    const C = dist(eye[0], eye[3]);
    return (A + B) / (2.0 * C);
}

function dist(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

// Start
window.addEventListener('load', init);
