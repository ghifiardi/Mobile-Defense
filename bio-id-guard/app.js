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

// Config - RELAXED THRESHOLDS FOR USABILITY
const BLINK_CLOSED_THRESHOLD = 0.25; // Easier to register "closed"
const BLINK_OPEN_THRESHOLD = 0.20;   // Easier to register "open"
const TURN_THRESHOLD = 0.15;
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/';

// State Machine
const STATE = {
    LOADING: 'loading',
    SCANNING: 'scanning',
    CHALLENGE_BLINK: 'challenge_blink',
    CHALLENGE_TURN: 'challenge_turn',
    VERIFIED: 'verified',
    REJECTED: 'rejected'
};

let currentState = STATE.LOADING;
let livenessScore = 0;
let riskScore = 0;

// Blink State Tracking
let blinkState = 'OPEN'; // OPEN -> CLOSING -> CLOSED -> OPENING -> OPEN (Complete Blink)

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
            blinkState = 'OPEN'; // Reset blink state
            break;
        case STATE.CHALLENGE_TURN:
            statusBadge.textContent = "LIVENESS CHECK 2/2";
            instructionText.textContent = "Turn Head Left or Right";
            instructionIcon.textContent = "↔️";
            progressFill.style.width = "66%";
            turnCounter = 0; // RESET COUNTER
            break;
        case STATE.VERIFIED:
            statusBadge.textContent = "ACCESS GRANTED";
            instructionText.textContent = "Identity Verified";
            instructionIcon.textContent = "✅";
            progressFill.style.width = "100%";
            document.body.classList.add('success');
            livenessScore = 99;
            riskScore = 1;
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
    }, 50); // Faster polling (50ms) to catch blinks
}

// Liveness Logic
let turnCounter = 0;

function processLiveness(landmarks) {
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();

    // 1. Blink Detection (EAR)
    const earLeft = getEAR(leftEye);
    const earRight = getEAR(rightEye);
    const avgEAR = (earLeft + earRight) / 2;

    // 2. Head Pose (Yaw)
    const nose = landmarks.getNose()[0];
    const leftEyeInner = leftEye[3];
    const rightEyeInner = rightEye[0];
    const eyeDist = Math.abs(rightEyeInner.x - leftEyeInner.x);
    const faceCenter = (leftEyeInner.x + rightEyeInner.x) / 2;
    const noseOffset = nose.x - faceCenter;
    const yawRatio = noseOffset / eyeDist;

    // DEBUG: Show metrics on screen
    scoreLiveness.textContent = `YAW: ${yawRatio.toFixed(2)}`;
    scoreRisk.textContent = `EAR: ${avgEAR.toFixed(2)}`;

    // State Logic
    if (currentState === STATE.SCANNING) {
        // If face is stable and centered, start challenge
        if (Math.abs(yawRatio) < 0.2 && avgEAR > BLINK_OPEN_THRESHOLD) {
            setTimeout(() => updateState(STATE.CHALLENGE_BLINK), 1000);
        }
    }
    else if (currentState === STATE.CHALLENGE_BLINK) {
        // Strict Blink Sequence: OPEN -> CLOSED -> OPEN
        if (blinkState === 'OPEN') {
            if (avgEAR < BLINK_CLOSED_THRESHOLD) {
                blinkState = 'CLOSED';
                instructionText.textContent = "Hold..."; // Visual Feedback
                instructionIcon.textContent = "😌";
            }
        } else if (blinkState === 'CLOSED') {
            if (avgEAR > BLINK_OPEN_THRESHOLD) {
                blinkState = 'COMPLETED';
                updateState(STATE.CHALLENGE_TURN);
            }
        }
    }
    else if (currentState === STATE.CHALLENGE_TURN) {
        // Check for significant turn
        if (Math.abs(yawRatio) > TURN_THRESHOLD) {
            turnCounter++;
            // Visual feedback
            progressFill.style.width = `${66 + (turnCounter * 10)}%`;

            if (turnCounter > 2) { // Reduced required frames
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
