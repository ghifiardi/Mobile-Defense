// Lumière Skin AI - Core Logic

const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const statusPill = document.getElementById('system-status');
const btnScan = document.getElementById('btn-scan');
const resultsPanel = document.getElementById('results-panel');
const instructionText = document.getElementById('instruction-text');

// Models
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/';

let isScanning = false;
let scanTimer = null;

// Initialize
async function init() {
    try {
        statusPill.textContent = "LOADING AI...";
        await loadModels();
        await startCamera();
        statusPill.textContent = "READY";
        btnScan.disabled = false;
        startDetectionLoop();
    } catch (err) {
        console.error(err);
        statusPill.textContent = "ERROR";
        instructionText.textContent = "Error: " + err.message;
    }
}

async function loadModels() {
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
}

async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: 'user',
            width: { ideal: 1920 }, // Request HD
            height: { ideal: 1080 }
        }
    });
    video.srcObject = stream;

    return new Promise((resolve) => {
        video.onloadedmetadata = () => {
            resolve(video);
        };
    });
}

// Detection Loop
async function startDetectionLoop() {
    const displaySize = { width: video.videoWidth, height: video.videoHeight };
    faceapi.matchDimensions(canvas, displaySize);

    setInterval(async () => {
        if (isScanning) return; // Don't detect while "scanning" animation is playing

        const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks();

        const resizedDetections = faceapi.resizeResults(detections, displaySize);
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

        if (resizedDetections.length > 0) {
            const landmarks = resizedDetections[0].landmarks;

            // Draw subtle landmarks for feedback
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'rgba(42, 157, 143, 0.5)';
            landmarks.positions.forEach(p => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 2, 0, 2 * Math.PI);
                ctx.fill();
            });

            instructionText.textContent = "Face Aligned. Ready to Scan.";
        } else {
            instructionText.textContent = "Align Face to Start Scan";
        }
    }, 100);
}

// Scan Logic
btnScan.addEventListener('click', async () => {
    isScanning = true;
    btnScan.disabled = true;
    btnScan.textContent = "SCANNING...";
    instructionText.textContent = "Hold Still...";

    // Simulate scanning process
    setTimeout(async () => {
        await performSkinAnalysis();
    }, 2000);
});

async function performSkinAnalysis() {
    // 1. Capture current frame
    const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks();

    if (detections.length === 0) {
        alert("Face not found! Please try again.");
        resetScan();
        return;
    }

    const landmarks = detections[0].landmarks;

    // 2. Extract ROI (Region of Interest) - Cheeks & Forehead
    // Simple approximation using landmark indices
    const leftCheek = extractRegion(landmarks.positions, [2, 3, 4, 31, 48]); // Approx indices
    const rightCheek = extractRegion(landmarks.positions, [12, 13, 14, 35, 54]);
    const forehead = extractRegion(landmarks.positions, [19, 24, 71, 72]); // Fake indices for logic

    // 3. Analyze (Simulated + Basic Pixel Logic)
    // In a real app, we would crop these regions and run pixel analysis.
    // Here we will run a full-frame analysis for redness/edges as a proxy.

    const analysis = analyzeFramePixels();

    // 4. Show Results
    showResults(analysis);
}

function extractRegion(positions, indices) {
    // Placeholder for cropping logic
    return null;
}

function analyzeFramePixels() {
    // Get video frame data
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = frame.data;

    let rednessScore = 0;
    let edgeScore = 0;
    let pixelCount = data.length / 4;

    // Simple Redness Detection (Acne Proxy)
    // High Red channel relative to Green/Blue
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Skin tone logic: R > G > B usually
        // Inflammation: R is significantly higher than G
        if (r > g + 20 && r > b + 20) {
            rednessScore++;
        }
    }

    // Normalize scores (Arbitrary calibration for demo)
    const acneMetric = Math.min(100, (rednessScore / pixelCount) * 500); // Scale up
    const textureMetric = Math.random() * 30 + 10; // Placeholder for edge detection (requires OpenCV.js)
    const circlesMetric = Math.random() * 40 + 20;

    // Calculate Overall Health (Inverse of issues)
    const overallHealth = 100 - ((acneMetric + textureMetric + circlesMetric) / 3);

    return {
        health: Math.round(overallHealth),
        acne: Math.round(acneMetric),
        texture: Math.round(textureMetric),
        circles: Math.round(circlesMetric)
    };
}

function showResults(data) {
    resultsPanel.classList.add('active');

    // Animate Circle
    const circle = document.querySelector('.circle');
    const radius = circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (data.health / 100) * circumference;

    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = circumference;

    setTimeout(() => {
        circle.style.strokeDashoffset = offset;
        document.querySelector('.percentage').textContent = `${data.health}%`;
    }, 100);

    // Update Bars
    updateBar('bar-acne', 'val-acne', data.acne, "Detected");
    updateBar('bar-texture', 'val-texture', data.texture, "Roughness");
    updateBar('bar-circles', 'val-circles', data.circles, "Pigmentation");

    // Recommendation
    const recText = document.getElementById('ai-recommendation');
    if (data.acne > 30) {
        recText.textContent = "We detected some redness/inflammation. Consider using a soothing cleanser with Salicylic Acid and a lightweight moisturizer.";
    } else if (data.texture > 30) {
        recText.textContent = "Skin texture appears slightly uneven. A gentle exfoliant (AHA/BHA) twice a week could help smooth the surface.";
    } else {
        recText.textContent = "Your skin looks healthy and radiant! Keep up your current routine of hydration and sun protection.";
    }
}

function updateBar(barId, valId, value, label) {
    document.getElementById(barId).style.width = `${value}%`;

    let severity = "Low";
    if (value > 30) severity = "Moderate";
    if (value > 60) severity = "High";

    document.getElementById(valId).textContent = `${severity} (${value}%)`;
}

function resetScan() {
    resultsPanel.classList.remove('active');
    isScanning = false;
    btnScan.disabled = false;
    btnScan.textContent = "START SCAN";
    instructionText.textContent = "Align Face to Start Scan";
}

window.addEventListener('load', init);
