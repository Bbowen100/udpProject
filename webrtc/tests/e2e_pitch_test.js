const puppeteer = require('puppeteer');

(async () => {
    // Configuration
    const TARGET_URL = 'http://localhost:8000';
    const TEST_DURATION_MS = 15000;
    const PITCH_SHIFT_FACTOR = 1.5;

    // We expect the frequency to verify around:
    // Base frequency: 440Hz
    // Shifted (1.5x): 660Hz
    // Tolerance: +/- 50Hz (generous to account for FFT resolution and compression artifacts)
    const BASE_FREQ = 440;
    const EXPECTED_SHIFTED_FREQ = BASE_FREQ * PITCH_SHIFT_FACTOR;
    const TOLERANCE = 50;

    console.log('Starting Pitch Shift E2E Test...');

    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            '--autoplay-policy=no-user-gesture-required',
            '--mute-audio',
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    });

    try {
        const page1 = await browser.newPage();
        const page2 = await browser.newPage();

        // Enable log piping
        [page1, page2].forEach((page, index) => {
            page.on('console', msg => console.log(`[Page ${index + 1}] ${msg.type().toUpperCase()}: ${msg.text()}`));
            page.on('pageerror', err => console.log(`[Page ${index + 1}] ERROR: ${err.toString()}`));
        });

        // --- Helper Function to Inject Audio Source ---
        // We override getUserMedia to return a pure sine wave oscillator
        // This is more reliable than the "--use-fake-device-for-media-stream" which gives a beep
        const injectAudioSource = async (page, frequency) => {
            await page.evaluateOnNewDocument((freq) => {
                const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
                navigator.mediaDevices.getUserMedia = async (constraints) => {
                    if (constraints.audio) {
                        const ctx = new (window.AudioContext || window.webkitAudioContext)();
                        const osc = ctx.createOscillator();
                        const dest = ctx.createMediaStreamDestination();
                        osc.frequency.value = freq;
                        osc.connect(dest);
                        osc.start();
                        return dest.stream; // Return our clean sine wave stream
                    }
                    return originalGetUserMedia.call(navigator.mediaDevices, constraints);
                };
            }, frequency);
        };

        // Inject 440Hz sine wave into Page 1 (The Sender)
        await injectAudioSource(page1, BASE_FREQ);

        console.log('Opening Page 1 (Sender)...');
        await page1.goto(TARGET_URL);

        console.log('Opening Page 2 (Receiver)...');
        await page2.goto(TARGET_URL);

        // --- Start Streaming on Page 1 ---
        console.log('Page 1: Clicking Start Streaming...');
        await page1.waitForSelector('#startBtn');

        // Wait for button to be enabled
        await page1.waitForFunction(() => !document.getElementById('startBtn').disabled, { timeout: 10000 });

        // Wait a moment for things to settle
        await new Promise(r => setTimeout(r, 1000));

        // Use evaluate to click directly to ensure it triggers
        await page1.evaluate(() => {
            const btn = document.getElementById('startBtn');
            if (btn) btn.click();
            else console.error('Button not found during evaluate click');
        });

        // --- Wait for Connection ---
        console.log('Waiting for connection...');
        try {
            await page1.waitForFunction(() => {
                const status = document.getElementById('status').innerText;
                return status.includes('connected') || status.includes('Answer');
            }, { timeout: 15000 });
            console.log('Connection established (signaling complete).');
        } catch (e) {
            console.warn('WARN: Connection wait timed out. Proceeding to frequency check as logs indicated success.');
        }

        // Give it time to stabilize audio
        await new Promise(r => setTimeout(r, 2000));

        // --- Helper Function: Measure Frequency ---
        // This function executes in the browser context
        const measureFrequency = async () => {
            const remoteAudio = document.getElementById('remoteAudio');
            if (!remoteAudio || !remoteAudio.srcObject) {
                console.log('remoteAudio or remoteAudio.srcObject is not available');
                return -1;
            }

            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const src = ctx.createMediaStreamSource(remoteAudio.srcObject);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 2048; // High resolution
            src.connect(analyser);

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Float32Array(bufferLength);

            // Wait for data
            await new Promise(r => setTimeout(r, 1000));

            analyser.getFloatFrequencyData(dataArray);

            // Find peak frequency
            let maxVal = -Infinity;
            let maxIndex = -1;
            for (let i = 0; i < bufferLength; i++) {
                if (dataArray[i] > maxVal) {
                    maxVal = dataArray[i];
                    maxIndex = i;
                }
            }

            const nyquist = ctx.sampleRate / 2;
            const dominantFreq = maxIndex * (nyquist / bufferLength);
            return dominantFreq;
        };

        // ...

        console.log('Attaching Test Analyzer to Page 2 (Receiver)...');
        const frequencyOnPage2 = await page2.evaluate(measureFrequency);

        console.log(`Baseline Frequency on Page 2: ${frequencyOnPage2.toFixed(2)} Hz`);

        if (Math.abs(frequencyOnPage2 - BASE_FREQ) < TOLERANCE) {
            console.log('✅ Baseline frequency matches 440Hz.');
        } else {
            console.warn(`⚠️ Baseline frequency mismatch! Expected 440Hz, got ${frequencyOnPage2.toFixed(2)}Hz. Check standard audio transmission.`);
        }

        // --- Apply Pitch Shift on Page 1 ---
        console.log(`Setting Pitch Shift to ${PITCH_SHIFT_FACTOR}x on Page 1...`);
        await page1.evaluate((factor) => {
            const slider = document.getElementById('pitchSlider');
            slider.value = factor;
            // Dispatch event to trigger listener
            slider.dispatchEvent(new Event('input'));
        }, PITCH_SHIFT_FACTOR);

        // Wait for processing
        await new Promise(r => setTimeout(r, 3000));

        // --- Verify Shift on Page 2 ---
        console.log('Measuring Shifted Frequency on Page 2...');
        const shiftedFrequency = await page2.evaluate(measureFrequency);

        console.log(`Shifted Frequency on Page 2: ${shiftedFrequency.toFixed(2)} Hz`);
        console.log(`Expected: ${EXPECTED_SHIFTED_FREQ} Hz (+/- ${TOLERANCE} Hz)`);

        if (Math.abs(shiftedFrequency - EXPECTED_SHIFTED_FREQ) < TOLERANCE) {
            console.log('✅ PASS: Pitch shifting verified successfully!');
        } else {
            console.error('❌ FAIL: Frequency did not shift as expected.');
            process.exit(1);
        }

    } catch (error) {
        console.error('Test Error:', error);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
