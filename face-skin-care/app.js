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
    instructionText.textContent = "Hold Still... Analyzing...";

    // Multi-frame Analysis (Average over 10 frames)
    let frames = 0;
    const maxFrames = 10;
    const accumulated = { health: 0, acne: 0, texture: 0, circles: 0 };

    const scanInterval = setInterval(async () => {
        try {
            const result = await performSingleFrameAnalysis();
            if (result) {
                accumulated.health += result.health;
                accumulated.acne += result.acne;
                accumulated.texture += result.texture;
                accumulated.circles += result.circles;
                frames++;

                // Visual feedback
                btnScan.textContent = `SCANNING ${Math.round((frames / maxFrames) * 100)}%`;
            }

            if (frames >= maxFrames) {
                clearInterval(scanInterval);

                // Calculate Averages
                const finalResult = {
                    health: Math.round(accumulated.health / frames),
                    acne: Math.round(accumulated.acne / frames),
                    texture: Math.round(accumulated.texture / frames),
                    circles: Math.round(accumulated.circles / frames)
                };

                showResults(finalResult);
            }
        } catch (error) {
            console.error(error);
            clearInterval(scanInterval);
            alert("Analysis failed: " + error.message);
            resetScan();
        }
    }, 200); // Run every 200ms
});

async function performSingleFrameAnalysis() {
    const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks();

    if (detections.length === 0) return null;

    const landmarks = detections[0].landmarks;
    const positions = landmarks.positions;

    // Extract Features
    // 1. Acne (Redness) - Global Face
    const rednessScore = analyzeRedness();

    // 2. Texture (Variance/Roughness) - Cheeks
    // Left Cheek: 2-4 (Jaw), 31 (Nose), 48 (Mouth) -> Approx Center
    const textureScore = analyzeTexture(positions);

    // 3. Dark Circles - Under Eyes
    // Left Eye: 36-41, Right Eye: 42-47
    const circlesScore = analyzeDarkCircles(positions);

    // Normalize
    const acneMetric = Math.min(100, rednessScore * 2);
    const textureMetric = Math.min(100, textureScore * 5);
    const circlesMetric = Math.min(100, circlesScore * 3);

    const overallHealth = 100 - ((acneMetric * 0.4 + textureMetric * 0.3 + circlesMetric * 0.3));

    return {
        health: Math.max(10, overallHealth), // Min score 10
        acne: acneMetric,
        texture: textureMetric,
        circles: circlesMetric
    };
}

function analyzeRedness() {
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = frame.data;

    let rednessCount = 0;
    let pixelCount = data.length / 4;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        // Inflammation: R > G+15 & R > B+15
        if (r > g + 15 && r > b + 15) {
            rednessCount++;
        }
    }
    return (rednessCount / pixelCount) * 100;
}

function analyzeTexture(landmarks) {
    // Simple Variance/StdDev on grayscale image (Roughness proxy)
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const frame = ctx.getImageData(0, 0, w, h);
    const data = frame.data;

    let sum = 0;
    let sumSq = 0;
    let count = 0;

    // Sample center of face (approx)
    const startX = Math.floor(w * 0.3);
    const endX = Math.floor(w * 0.7);
    const startY = Math.floor(h * 0.3);
    const endY = Math.floor(h * 0.7);

    for (let y = startY; y < endY; y += 4) { // Skip pixels for speed
        for (let x = startX; x < endX; x += 4) {
            const i = (y * w + x) * 4;
            const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
            sum += gray;
            sumSq += gray * gray;
            count++;
        }
    }

    const mean = sum / count;
    const variance = (sumSq / count) - (mean * mean);
    return Math.sqrt(variance) / 10; // StdDev scaled down
}

function analyzeDarkCircles(landmarks) {
    // Compare Under-Eye brightness vs Cheek brightness
    const ctx = canvas.getContext('2d');

    // Helper to get brightness at a point
    const getBrightness = (idx) => {
        const p = landmarks[idx];
        const pixel = ctx.getImageData(p.x, p.y, 1, 1).data;
        return (pixel[0] + pixel[1] + pixel[2]) / 3;
    };

    // Under Eyes (Landmarks 41, 40 for Left | 46, 47 for Right)
    const underEyeL = (getBrightness(41) + getBrightness(40)) / 2;
    const underEyeR = (getBrightness(46) + getBrightness(47)) / 2;
    const underEyeAvg = (underEyeL + underEyeR) / 2;

    // Cheeks (Landmarks 31 (Nose side), 35)
    const cheekL = getBrightness(31);
    const cheekR = getBrightness(35);
    const cheekAvg = (cheekL + cheekR) / 2;

    // Dark Circles = Cheek Brightness - UnderEye Brightness
    // If UnderEye is darker, diff is positive.
    const diff = cheekAvg - underEyeAvg;
    return Math.max(0, diff);
}

function showResults(data) {
    resultsPanel.classList.add('active');

    // Animate Circle
    const circle = document.querySelector('.circle');
    // FIX: Path element doesn't have radius. Use 100 as circumference for this specific SVG path.
    const circumference = 100;
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
    const diagnostic = generateDiagnostic(data);
    const recContainer = document.getElementById('ai-recommendation');

    recContainer.innerHTML = `
        <div style="margin-bottom: 10px;">
            <strong style="color: #264653;">Diagnosis:</strong><br>
            ${diagnostic.diagnosis}
        </div>
        <div style="margin-bottom: 10px;">
            <strong style="color: #2A9D8F;">Hero Ingredients:</strong><br>
            ${diagnostic.ingredients}
        </div>
        <div>
            <strong style="color: #E9C46A;">Routine Tip:</strong><br>
            ${diagnostic.routine}
        </div>
    `;
}

function generateDiagnostic(data) {
    const issues = [];
    if (data.acne > 30) issues.push('acne');
    if (data.texture > 30) issues.push('texture');
    if (data.circles > 30) issues.push('circles');

    let diagnosis = "Your skin barrier appears healthy and balanced. Keep up the great work!";
    let ingredients = "Hyaluronic Acid, Ceramides, SPF 30+";
    let routine = "Focus on hydration and sun protection to maintain your glow.";

    if (issues.includes('acne') && issues.includes('texture')) {
        diagnosis = "Signs of **Congestion & Uneven Tone**. Your skin may be struggling with cell turnover, leading to both blemishes and roughness.";
        ingredients = "Salicylic Acid (BHA), Niacinamide, Retinol";
        routine = "Double cleanse at night. Use a BHA exfoliant 2-3 times a week to unclog pores.";
    }
    else if (issues.includes('acne')) {
        diagnosis = "Detected **Active Inflammation**. Redness suggests sensitivity or breakout activity.";
        ingredients = "Centella Asiatica, Azelaic Acid, Zinc PCA";
        routine = "Simplify your routine. Avoid harsh scrubs. Use a spot treatment and a barrier-repairing moisturizer.";
    }
    else if (issues.includes('texture')) {
        diagnosis = "Skin appears **Dehydrated or Rough**. The surface lacks smoothness, likely due to dead skin cell buildup.";
        ingredients = "Glycolic Acid (AHA), Lactic Acid, Vitamin C";
        routine = "Incorporate a chemical exfoliant (AHA) to reveal smoother skin. Ensure you are drinking enough water.";
    }
    else if (issues.includes('circles')) {
        diagnosis = "Signs of **Fatigue & Pigmentation**. The under-eye area shows contrast, indicating tiredness or genetic shadowing.";
        ingredients = "Caffeine, Vitamin K, Peptides";
        routine = "Try a cold compress in the morning. Use an eye cream with caffeine to constrict blood vessels.";
    }

    return { diagnosis, ingredients, routine };
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
