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

// Config - BALANCED THRESHOLDS
const BLINK_CLOSED_THRESHOLD = 0.18; // Must close eyes (EAR < 0.18)
const BLINK_OPEN_THRESHOLD = 0.25;   // Must open eyes (EAR > 0.25)
const SMILE_THRESHOLD = 0.5;
const TIMEOUT_MS = 20000;
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/';

// State Machine
const STATE = {
    LOADING: 'loading',
    SCANNING: 'scanning',
    CHALLENGE_SMILE: 'challenge_smile',
    CHALLENGE_BLINK: 'challenge_blink',
    VERIFIED: 'verified',
    REJECTED: 'rejected'
};

let currentState = STATE.LOADING;
let livenessScore = 0;
let riskScore = 0;

// Blink State Tracking
let blinkState = 'OPEN'; // OPEN -> CLOSING -> CLOSED -> OPENING -> OPEN (Complete Blink)
let transitioning = false; // Prevent multiple timeouts
let stateStartTime = 0; // Timer for timeout

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
    await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL); // Load Expression Net
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
    transitioning = false; // Reset flag
    stateStartTime = Date.now(); // Reset timer

    switch (newState) {
        case STATE.SCANNING:
            statusBadge.textContent = "SEARCHING FACE";
            instructionText.textContent = "Center Your Face & Stay Neutral";
            instructionIcon.textContent = "😐";
            progressFill.style.width = "0%";
            break;
        case STATE.CHALLENGE_SMILE:
            statusBadge.textContent = "LIVENESS CHECK 1/2";
            instructionText.textContent = "Smile for the Camera!";
            instructionIcon.textContent = "😁";
            progressFill.style.width = "33%";
            break;
        case STATE.CHALLENGE_BLINK:
            statusBadge.textContent = "LIVENESS CHECK 2/2";
            instructionText.textContent = "Now Blink Your Eyes";
            instructionIcon.textContent = "👀";
            progressFill.style.width = "66%";
            blinkState = 'OPEN';
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
        case STATE.REJECTED:
            statusBadge.textContent = "ACCESS DENIED";
            instructionText.textContent = "Timeout: Verification Failed";
            instructionIcon.textContent = "❌";
            progressFill.style.width = "0%";
            document.body.style.backgroundColor = "#2a0000";
            setTimeout(() => {
                document.body.style.backgroundColor = "";
                updateState(STATE.SCANNING);
            }, 3000); // Retry after 3s
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
        if (currentState === STATE.VERIFIED) return; // Stop if verified

        // Check Timeout
        if (currentState !== STATE.SCANNING && currentState !== STATE.LOADING && currentState !== STATE.REJECTED && currentState !== STATE.VERIFIED) {
            if (Date.now() - stateStartTime > TIMEOUT_MS) {
                updateState(STATE.REJECTED);
                return;
            }
        }

        // Detect Faces + Landmarks + Expressions
        const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks()
            .withFaceExpressions();

        const resizedDetections = faceapi.resizeResults(detections, displaySize);
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

        if (resizedDetections.length > 0) {
            const detection = resizedDetections[0];
            const landmarks = detection.landmarks;
            const expressions = detection.expressions;
            const box = detection.detection.box;

            // Draw custom box
            const ctx = canvas.getContext('2d');
            ctx.strokeStyle = '#00f2ff';
            ctx.lineWidth = 2;
            ctx.strokeRect(box.x, box.y, box.width, box.height);

            processLiveness(landmarks, expressions);
        }
    }, 100); // Poll every 100ms
}

// Liveness Logic
function processLiveness(landmarks, expressions) {
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();

    // Blink Detection (EAR)
    const earLeft = getEAR(leftEye);
    const earRight = getEAR(rightEye);
    const avgEAR = (earLeft + earRight) / 2;

    // DEBUG: Show metrics
    // Show Neutral score during scanning, Happy score during smile challenge
    if (currentState === STATE.SCANNING) {
        scoreLiveness.textContent = `Neutral: ${(expressions.neutral || 0).toFixed(2)}`;
    } else if (currentState === STATE.CHALLENGE_SMILE) {
        scoreLiveness.textContent = `Happy: ${(expressions.happy || 0).toFixed(2)}`;
    } else if (currentState === STATE.CHALLENGE_BLINK) {
        scoreLiveness.textContent = `State: ${blinkState}`;
    }
    scoreRisk.textContent = `EAR: ${avgEAR.toFixed(2)}`;

    // State Logic
    if (currentState === STATE.SCANNING) {
        // Require Neutral Face first (Anti-Spoofing: Photo can't change expression)
        if (expressions.neutral > 0.4 && !transitioning) { // Relaxed neutral
            transitioning = true;
            statusBadge.textContent = "NEUTRAL DETECTED...";
            setTimeout(() => updateState(STATE.CHALLENGE_SMILE), 1000);
        }
    }
    else if (currentState === STATE.CHALLENGE_SMILE) {
        // Require Smile
        if (expressions.happy > SMILE_THRESHOLD) {
            updateState(STATE.CHALLENGE_BLINK);
        }
    }
    else if (currentState === STATE.CHALLENGE_BLINK) {
        // Blink Sequence
        if (blinkState === 'OPEN') {
            if (avgEAR < BLINK_CLOSED_THRESHOLD) {
                blinkState = 'CLOSED';
                instructionText.textContent = "Hold...";
                instructionIcon.textContent = "😌";
            }
        } else if (blinkState === 'CLOSED') {
            if (avgEAR > BLINK_OPEN_THRESHOLD) {
                blinkState = 'COMPLETED';
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
