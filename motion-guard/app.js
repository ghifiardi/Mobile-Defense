// Seismic Sentry - Application Logic

// State Machine
const STATE = {
    IDLE: 'idle',
    ARMING: 'arming',
    ARMED: 'armed',
    TRIGGERED: 'triggered'
};

let currentState = STATE.IDLE;
let motionThreshold = 2.5; // Sensitivity threshold
let lastX = null, lastY = null, lastZ = null;
let audioContext = null;
let alarmOscillator = null;
let alarmInterval = null;

// DOM Elements
const body = document.body;
const statusText = document.getElementById('status-text');
const subStatus = document.getElementById('sub-status');
const armBtn = document.getElementById('arm-btn');
const valX = document.getElementById('val-x');
const valY = document.getElementById('val-y');
const valZ = document.getElementById('val-z');

// Audio System (Siren)
function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

function startAlarmSound() {
    initAudio();
    if (alarmOscillator) return; // Already playing

    const osc = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, audioContext.currentTime); // A5
    
    // Siren effect (LFO)
    const lfo = audioContext.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 4; // 4 Hz modulation
    
    const lfoGain = audioContext.createGain();
    lfoGain.gain.value = 400; // Modulation depth

    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    osc.connect(gainNode);
    gainNode.connect(audioContext.destination);

    osc.start();
    lfo.start();

    alarmOscillator = { osc, lfo, gainNode };
}

function stopAlarmSound() {
    if (alarmOscillator) {
        alarmOscillator.osc.stop();
        alarmOscillator.lfo.stop();
        alarmOscillator.osc.disconnect();
        alarmOscillator.lfo.disconnect();
        alarmOscillator = null;
    }
}

// Motion Handling
function handleMotion(event) {
    // Update Telemetry
    const x = event.accelerationIncludingGravity.x || 0;
    const y = event.accelerationIncludingGravity.y || 0;
    const z = event.accelerationIncludingGravity.z || 0;

    valX.textContent = x.toFixed(2);
    valY.textContent = y.toFixed(2);
    valZ.textContent = z.toFixed(2);

    if (currentState !== STATE.ARMED) return;

    // Detect Movement
    if (lastX !== null) {
        const deltaX = Math.abs(x - lastX);
        const deltaY = Math.abs(y - lastY);
        const deltaZ = Math.abs(z - lastZ);

        if (deltaX > motionThreshold || deltaY > motionThreshold || deltaZ > motionThreshold) {
            triggerAlarm();
        }
    }

    lastX = x;
    lastY = y;
    lastZ = z;
}

// State Transitions
function setState(newState) {
    body.classList.remove(currentState);
    currentState = newState;
    body.classList.add(currentState);

    switch (newState) {
        case STATE.IDLE:
            statusText.textContent = "IDLE";
            subStatus.textContent = "READY TO ARM";
            armBtn.querySelector('.btn-text').textContent = "ARM SYSTEM";
            stopAlarmSound();
            lastX = null; // Reset baseline
            break;
        
        case STATE.ARMING:
            statusText.textContent = "ARMING...";
            subStatus.textContent = "PLACE DEVICE DOWN";
            let count = 3;
            subStatus.textContent = `ARMING IN ${count}...`;
            
            const countdown = setInterval(() => {
                count--;
                if (count > 0) {
                    subStatus.textContent = `ARMING IN ${count}...`;
                } else {
                    clearInterval(countdown);
                    setState(STATE.ARMED);
                }
            }, 1000);
            break;

        case STATE.ARMED:
            statusText.textContent = "ARMED";
            subStatus.textContent = "SENSORS ACTIVE";
            // Capture initial baseline
            lastX = parseFloat(valX.textContent);
            lastY = parseFloat(valY.textContent);
            lastZ = parseFloat(valZ.textContent);
            break;

        case STATE.TRIGGERED:
            statusText.textContent = "ALARM!";
            subStatus.textContent = "BREACH DETECTED";
            startAlarmSound();
            break;
    }
}

function triggerAlarm() {
    setState(STATE.TRIGGERED);
}

// Permission & Initialization
function requestPermission() {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission()
            .then(response => {
                if (response === 'granted') {
                    window.addEventListener('devicemotion', handleMotion);
                    setState(STATE.ARMING);
                } else {
                    alert('Permission denied. App cannot function.');
                }
            })
            .catch(console.error);
    } else {
        // Non-iOS 13+ devices
        window.addEventListener('devicemotion', handleMotion);
        setState(STATE.ARMING);
    }
}

// Event Listeners
armBtn.addEventListener('click', () => {
    if (currentState === STATE.IDLE) {
        initAudio(); // Initialize audio context on user gesture
        requestPermission();
    } else if (currentState === STATE.TRIGGERED) {
        setState(STATE.IDLE);
    }
});

// Prevent screen sleep (if supported)
if ('wakeLock' in navigator) {
    navigator.wakeLock.request('screen').catch(console.error);
}
