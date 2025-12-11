const startBtn = document.getElementById('startBtn');
const statusDiv = document.getElementById('status');
const remoteAudio = document.getElementById('remoteAudio');
const localCanvas = document.getElementById('localCanvas');
const remoteCanvas = document.getElementById('remoteCanvas');
const localCtx = localCanvas.getContext('2d');
const remoteCtx = remoteCanvas.getContext('2d');

let pc;
let localStream;
let processedStream; // Stream with pitch-shifted audio
let iceCandidateQueue = [];
let canSendIceCandidates = false;

// Audio analysis setup
let audioContext;
let localAnalyser;
let remoteAnalyser;
let localDataArray;
let remoteDataArray;
let animationId;

// Audio processing setup
let scriptProcessor;
let mediaStreamDestination;
let pitchShiftFactor = 1.11; // 1.05 = increase pitch by 11%

// Pitch shift slider elements
const pitchSlider = document.getElementById('pitchSlider');
const pitchValue = document.getElementById('pitchValue');

// Update pitch shift factor when slider changes
pitchSlider.addEventListener('input', (event) => {
    pitchShiftFactor = parseFloat(event.target.value);
    pitchValue.textContent = pitchShiftFactor.toFixed(2);
    console.log('Pitch shift factor updated to:', pitchShiftFactor);
});

// Connect to the signaling server (WebSocket)
const ws = new WebSocket('ws://localhost:8083/signaling');

// WebRTC Configuration using local Coturn
const rtcConfig = {
    iceTransportPolicy: "relay",
    iceServers: [
        {
            urls: 'turn:172.18.25.146:3478',
            username: 'user',
            credential: 'password'
        }
    ]
};


(async function init() {
    startBtn.disabled = true;
    statusDiv.innerText = 'Requesting microphone...';
    console.log('Requesting microphone...');
    localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
            noiseSuppression: true,
            echoCancellation: true,
            autoGainControl: true
        }
    });
    startBtn.disabled = false;
    console.log('Microphone access granted');

    // Initialize audio context and FFT for local stream
    initializeAudioAnalysis();
    connectLocalStream();

    // Wait a bit for the audio processing pipeline to be ready
    await new Promise(resolve => setTimeout(resolve, 100));

    await startPeerConnection();

    // Create Offer
    console.log('Creating offer...');
    const offer = await pc.createOffer();
    console.log('Offer created, setting local description...');
    await pc.setLocalDescription(offer);
    console.log('Local description set');
})();

ws.onopen = () => {
    console.log('Connected to signaling server');
    statusDiv.innerText = 'Connected to signaling server';
};

ws.onmessage = async (event) => {
    try {
        const data = JSON.parse(event.data);

        if (!pc) {
            await startPeerConnection();
        }

        if (data.type === 'offer') {
            console.log('Received offer');
            await pc.setRemoteDescription(data);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            ws.send(JSON.stringify(pc.localDescription));
            statusDiv.innerText = 'Sent Answer';

            // Request ICE candidates from the peer
            ws.send(JSON.stringify({ type: 'request_ice_candidates' }));
        } else if (data.type === 'answer') {
            console.log('Received answer');
            await pc.setRemoteDescription(data);
            statusDiv.innerText = 'Received Answer';

            // Request ICE candidates from the peer
            ws.send(JSON.stringify({ type: 'request_ice_candidates' }));
        } else if (data.candidate) {
            console.log('Received ICE candidate');
            await pc.addIceCandidate(data.candidate);
        } else if (data.type === 'request_ice_candidates') {
            console.log('Received request for ICE candidates');
            canSendIceCandidates = true;
            // Send queued candidates
            while (iceCandidateQueue.length > 0) {
                const candidate = iceCandidateQueue.shift();
                console.log('Sending queued ICE candidate');
                ws.send(JSON.stringify({ candidate: candidate }));
            }
        }
    } catch (e) {
        console.error('Signaling error:', e);
    }
};

async function startPeerConnection() {
    if (pc) return;

    console.log('Creating RTCPeerConnection with config:', JSON.stringify(rtcConfig));
    try {
        pc = new RTCPeerConnection(rtcConfig);
    } catch (e) {
        console.error('Failed to create RTCPeerConnection:', e);
        return;
    }

    pc.onicecandidate = (event) => {
        if (event.candidate && event.candidate.candidate !== '') {
            if (canSendIceCandidates) {
                console.log('Sending ICE candidate:', event.candidate);
                ws.send(JSON.stringify({ candidate: event.candidate }));
            } else {
                console.log('Queueing ICE candidate:', event.candidate);
                iceCandidateQueue.push(event.candidate);
            }
        } else {
            console.log('ICE candidate gathering complete');
        }
    };

    pc.onicegatheringstatechange = () => {
        console.log('ICE Gathering State:', pc.iceGatheringState);
    };

    pc.onsignalingstatechange = () => {
        console.log('Signaling State:', pc.signalingState);
    };

    pc.ontrack = (event) => {
        console.log('Received remote track');
        if (remoteAudio.srcObject !== event.streams[0]) {
            remoteAudio.srcObject = event.streams[0];
            console.log('Set remote audio stream');

            // Connect remote stream to FFT analyzer
            connectRemoteStream(event.streams[0]);
        }
    };

    pc.onconnectionstatechange = () => {
        console.log('Connection state:', pc.connectionState);
        statusDiv.innerText = 'State: ' + pc.connectionState;
    };

    pc.oniceconnectionstatechange = () => {
        console.log('ICE Connection state:', pc.iceConnectionState);
    };

    // If we have a local stream, add it
    if (localStream) {
        console.log('Adding local tracks to PeerConnection');

        // Use the processed stream if available, otherwise use the original
        const streamToSend = processedStream || localStream;

        streamToSend.getTracks().forEach(track => {
            console.log('Adding track:', track.kind, track.label);
            pc.addTrack(track, streamToSend);
        });

        if (processedStream) {
            console.log('Using processed stream with pitch shift factor:', pitchShiftFactor);
        }
    } else {
        console.log('No local stream to add - adding recvonly audio transceiver');
        // Add a recvonly transceiver so the peer connection generates ICE candidates
        // even without a local stream (needed for the receiving peer)
        pc.addTransceiver('audio', { direction: 'recvonly' });
    }
}

startBtn.onclick = async () => {
    try {

        ws.send(JSON.stringify(pc.localDescription));
        console.log('Offer sent to signaling server');

        statusDiv.innerText = 'Sent Offer';
    } catch (e) {
        console.error('Error starting stream:', e);
        statusDiv.innerText = 'Error: ' + e.message;
        startBtn.disabled = true;
    }
};

// Initialize Web Audio API for FFT analysis
function initializeAudioAnalysis() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // Create analyzers for local and remote streams
    localAnalyser = audioContext.createAnalyser();
    localAnalyser.fftSize = 256;
    const bufferLength = localAnalyser.frequencyBinCount;
    localDataArray = new Uint8Array(bufferLength);

    remoteAnalyser = audioContext.createAnalyser();
    remoteAnalyser.fftSize = 256;
    remoteDataArray = new Uint8Array(bufferLength);

    console.log('Audio analysis initialized');

    // Start rendering loop
    renderFFT();
}

// Connect local microphone stream to analyzer
function connectLocalStream() {
    if (!audioContext || !localStream) return;

    const source = audioContext.createMediaStreamSource(localStream);
    source.connect(localAnalyser);
    console.log('Local stream connected to FFT analyzer');

    // Create audio processing pipeline for pitch shifting
    setupAudioProcessing(source);
}

// Setup audio processing pipeline with pitch shifting
function setupAudioProcessing(sourceNode) {
    // Create script processor for audio manipulation
    const bufferSize = 4096;
    scriptProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);

    // Create destination for processed audio
    mediaStreamDestination = audioContext.createMediaStreamDestination();

    // Connect: source -> script processor -> destination
    sourceNode.connect(scriptProcessor);
    scriptProcessor.connect(mediaStreamDestination);

    // Process audio with FFT pitch shifting
    scriptProcessor.onaudioprocess = function (audioProcessingEvent) {
        const inputBuffer = audioProcessingEvent.inputBuffer;
        const outputBuffer = audioProcessingEvent.outputBuffer;

        const inputData = inputBuffer.getChannelData(0);
        const outputData = outputBuffer.getChannelData(0);

        // Apply pitch shifting using FFT
        pitchShift(inputData, outputData);
    };

    // Store the processed stream
    processedStream = mediaStreamDestination.stream;
    console.log('Audio processing pipeline created with pitch shift factor:', pitchShiftFactor);
}

// Pitch shifting using FFT and inverse FFT
function pitchShift(inputData, outputData) {
    const N = inputData.length;

    // Create complex arrays for FFT (real and imaginary parts)
    const real = new Float32Array(N);
    const imag = new Float32Array(N);

    // Copy input data to real part
    for (let i = 0; i < N; i++) {
        real[i] = inputData[i];
        imag[i] = 0;
    }

    // Apply FFT
    fft(real, imag);

    // Create new arrays for shifted spectrum
    const shiftedReal = new Float32Array(N);
    const shiftedImag = new Float32Array(N);

    // Shift frequencies by scaling the bin indices
    // To increase pitch, we compress the spectrum (read from higher indices)
    for (let i = 0; i < N / 2; i++) {
        const sourceIndex = Math.floor(i / pitchShiftFactor);
        if (sourceIndex < N / 2) {
            shiftedReal[i] = real[sourceIndex];
            shiftedImag[i] = imag[sourceIndex];
            // Mirror for negative frequencies
            shiftedReal[N - i - 1] = real[N - sourceIndex - 1];
            shiftedImag[N - i - 1] = imag[N - sourceIndex - 1];
        }
    }

    // Apply inverse FFT
    ifft(shiftedReal, shiftedImag);

    // Copy result to output, normalizing
    const scale = 1.0 / N;
    for (let i = 0; i < N; i++) {
        outputData[i] = shiftedReal[i] * scale;
    }
}

// Fast Fourier Transform (Cooley-Tukey algorithm)
function fft(real, imag) {
    const N = real.length;

    // Bit-reversal permutation
    let j = 0;
    for (let i = 0; i < N; i++) {
        if (j > i) {
            [real[i], real[j]] = [real[j], real[i]];
            [imag[i], imag[j]] = [imag[j], imag[i]];
        }
        let m = N >> 1;
        while (m >= 1 && j >= m) {
            j -= m;
            m >>= 1;
        }
        j += m;
    }

    // Cooley-Tukey FFT
    for (let len = 2; len <= N; len *= 2) {
        const angle = -2 * Math.PI / len;
        const wlen_real = Math.cos(angle);
        const wlen_imag = Math.sin(angle);

        for (let i = 0; i < N; i += len) {
            let w_real = 1;
            let w_imag = 0;

            for (let j = 0; j < len / 2; j++) {
                const u_real = real[i + j];
                const u_imag = imag[i + j];

                const v_real = real[i + j + len / 2] * w_real - imag[i + j + len / 2] * w_imag;
                const v_imag = real[i + j + len / 2] * w_imag + imag[i + j + len / 2] * w_real;

                real[i + j] = u_real + v_real;
                imag[i + j] = u_imag + v_imag;

                real[i + j + len / 2] = u_real - v_real;
                imag[i + j + len / 2] = u_imag - v_imag;

                const temp_real = w_real * wlen_real - w_imag * wlen_imag;
                w_imag = w_real * wlen_imag + w_imag * wlen_real;
                w_real = temp_real;
            }
        }
    }
}

// Inverse Fast Fourier Transform
function ifft(real, imag) {
    // Conjugate the complex numbers
    for (let i = 0; i < imag.length; i++) {
        imag[i] = -imag[i];
    }

    // Apply FFT
    fft(real, imag);

    // Conjugate again
    for (let i = 0; i < imag.length; i++) {
        imag[i] = -imag[i];
    }
}

// Connect remote stream to analyzer
function connectRemoteStream(stream) {
    if (!audioContext || !stream) return;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(remoteAnalyser);
    console.log('Remote stream connected to FFT analyzer');
}

// Render FFT visualization
function renderFFT() {
    animationId = requestAnimationFrame(renderFFT);

    // Draw local stream FFT
    if (localAnalyser) {
        localAnalyser.getByteFrequencyData(localDataArray);
        drawFFT(localCtx, localDataArray, localCanvas.width, localCanvas.height, '#002fffff');
    }

    // Draw remote stream FFT
    if (remoteAnalyser) {
        remoteAnalyser.getByteFrequencyData(remoteDataArray);
        drawFFT(remoteCtx, remoteDataArray, remoteCanvas.width, remoteCanvas.height, '#8000ffff');
    }
}

// Draw FFT bars on canvas
function drawFFT(ctx, dataArray, width, height, color) {
    // Clear canvas
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    const barWidth = (width / dataArray.length) * 2.5;
    let barHeight;
    let x = 0;

    for (let i = 0; i < dataArray.length; i++) {
        barHeight = (dataArray[i] / 255) * height;

        // Create gradient for bars
        const gradient = ctx.createLinearGradient(0, height - barHeight, 0, height);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, color); // Add transparency at bottom

        ctx.fillStyle = gradient;
        ctx.fillRect(x, height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
    }
}
