

import * as mediasoupClient from 'mediasoup-client';
import { io } from 'socket.io-client';

let pitchWorkletNode;

const startBtn = document.getElementById('startBtn');
const statusDiv = document.getElementById('status');
const remoteAudio = document.getElementById('remoteAudio');
const localCanvas = document.getElementById('localCanvas');
const remoteCanvas = document.getElementById('remoteCanvas');
const localCtx = localCanvas.getContext('2d');
const remoteCtx = remoteCanvas.getContext('2d');

let device;
let socket;
let producerTransport;
let consumerTransport;
let producer;
let consumer;

let localStream;
let processedStream; // Stream with pitch-shifted audio

// Audio analysis setup
let audioContext;
let localAnalyser;
let remoteAnalyser;
let localDataArray;
let remoteDataArray;
let animationId;

// Audio processing setup
let mediaStreamDestination;
let pitchShiftFactor = 1.0;

// Pitch shift slider elements
const pitchSlider = document.getElementById('pitchSlider');
const pitchValue = document.getElementById('pitchValue');
const pitchToggle = document.getElementById('pitchToggle');

let pitchShiftEnabled = true;

// Update pitch shift factor when slider changes
pitchSlider.addEventListener('input', (event) => {
    pitchShiftFactor = parseFloat(event.target.value);
    pitchValue.textContent = pitchShiftFactor.toFixed(2);
    updatePitchShift(pitchShiftFactor);
});

// Update pitch shift enabled state

pitchToggle.addEventListener('change', (event) => {
    pitchShiftEnabled = event.target.checked;
    console.log('Pitch shift enabled:', pitchShiftEnabled);
    if (pitchWorkletNode) {
        pitchWorkletNode.port.postMessage({ type: 'bypass', value: !pitchShiftEnabled });
    }
});

// Mediasoup Config with Coturn
// Note: In a real app, these should be fetched from server
const iceServers = [
    {
        urls: 'turn:172.18.25.146:3478',
        username: 'user',
        credential: 'password'
    },
];

// Start
startBtn.onclick = async () => {
    startBtn.disabled = true;
    try {
        await startCapture();
        await connectToServer();
    } catch (err) {
        console.error('Error starting:', err);
        statusDiv.innerText = 'Error: ' + err.message;
        startBtn.disabled = false;
    }
};
// start capture
async function startCapture() {
    statusDiv.innerText = 'Requesting microphone...';
    console.log('Requesting microphone...');
    localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
            noiseSuppression: true,
            echoCancellation: true,
            autoGainControl: false
        }
    });
    console.log('Microphone access granted');

    // Initialize audio context and FFT for local stream
    await initializeAudioAnalysis();
    await connectLocalStream();
}

async function connectToServer() {
    statusDiv.innerText = 'Connecting to server...';

    // Connect to Socket.IO path (served by the node server)

    const url = `${window.location.protocol}//${window.location.hostname}:3000`;
    console.log('Connecting to socket at:', url);

    socket = io(url);

    socket.on('connect', async () => {
        console.log('Socket connected');
        statusDiv.innerText = 'Connected to Signaling Server';
        await joinRoom();
    });

    socket.on('disconnect', () => {
        console.log('Socket disconnected');
        statusDiv.innerText = 'Disconnected';
    });

    socket.on('newProducer', async ({ producerId }) => {
        console.log('New producer available:', producerId);
        // Automatically consume new producers for this demo
        await consume(producerId);
    });

    socket.on('consumerClosed', ({ consumerId }) => {
        console.log('Consumer closed:', consumerId);
        if (consumer && consumer.id === consumerId) {
            consumer.close();
            consumer = null;
        }
    });
}

async function joinRoom() {
    try {
        device = new mediasoupClient.Device();

        // Get Router RTP Capabilities
        const routerRtpCapabilities = await request('getRouterRtpCapabilities');
        console.log('Router RTP Capabilities:', routerRtpCapabilities);

        await device.load({ routerRtpCapabilities });

        // Create Send Transport
        await createSendTransport();

        // Create Recv Transport
        await createRecvTransport();

        // Produce our audio
        await produce();

        // Consume existing producers
        const remoteProducerIds = await request('getProducers');
        console.log('number of existing producers:', remoteProducerIds.length);

        for (const id of remoteProducerIds) {
            // Don't consume our own producer if we don't want loopback
            if (producer && id === producer.id) continue;

            await consume(id);
        }

    } catch (err) {
        console.error('Join room error:', err);
        statusDiv.innerText = 'Error joining room: ' + err.message;
    }
}

async function createSendTransport() {
    const params = await request('createProducerTransport');
    console.log('Transport params:', params);

    // Add turn servers to iceServers if needed, or use what server sends if it managed it
    params.iceServers = iceServers;
    // But here we enforce our local turn
    params.iceTransportPolicy = 'relay';

    producerTransport = device.createSendTransport(params);

    producerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
            await request('connectTransport', {
                transportId: producerTransport.id,
                dtlsParameters,
            });
            callback();
        } catch (error) {
            errback(error);
        }
    });

    producerTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
        try {
            const { id } = await request('produce', {
                transportId: producerTransport.id,
                kind,
                rtpParameters,
            });
            callback({ id });
        } catch (error) {
            errback(error);
        }
    });

    producerTransport.on('connectionstatechange', (state) => {
        console.log('Producer transport state:', state);
        if (state === 'connected') {
            statusDiv.innerText = 'Publishing...';
        }
    });
}

async function createRecvTransport() {
    const params = await request('createConsumerTransport');
    params.iceServers = iceServers;

    consumerTransport = device.createRecvTransport(params);

    consumerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
            await request('connectTransport', {
                transportId: consumerTransport.id,
                dtlsParameters,
            });
            callback();
        } catch (error) {
            errback(error);
        }
    });

    consumerTransport.on('connectionstatechange', (state) => {
        console.log('Consumer transport state:', state);
    });
}

async function produce() {
    if (!localStream) return;

    // Use processed stream if available
    const streamToProduce = processedStream || localStream;
    const track = streamToProduce.getAudioTracks()[0];

    producer = await producerTransport.produce({ track });
    console.log('Producer created:', producer.id);
}

async function consume(producerId) {
    // For this demo, let's allow loopback to hear ourselves via server
    // if (producer && producer.id === producerId) return;

    const { rtpCapabilities } = device;

    // Hack: Manually add rtcpFeedback to Opus to satisfy server router requirements
    const opusCodec = rtpCapabilities.codecs.find(c => c.mimeType.toLowerCase() === 'audio/opus');
    if (opusCodec) {
        opusCodec.rtcpFeedback = [
            { type: 'nack', parameter: '' },
            { type: 'transport-cc', parameter: '' }
        ];
    }

    const data = await request('consume', {
        transportId: consumerTransport.id,
        producerId,
        rtpCapabilities,
    });

    const {
        id,
        kind,
        rtpParameters,
    } = data;

    consumer = await consumerTransport.consume({
        id,
        producerId,
        kind,
        rtpParameters,
    });

    const stream = new MediaStream();
    stream.addTrack(consumer.track);

    remoteAudio.srcObject = stream;
    console.log('Consumer created and playing');

    // Connect to analyzer
    connectRemoteStream(stream);

    // Resume on server side (though we did it in server.js, good practice)
    await request('resume', { consumerId: consumer.id });
}


function request(type, data = {}) {
    return new Promise((resolve, reject) => {
        socket.emit(type, data, (response) => {
            if (response && response.error) {
                reject(new Error(response.error));
            } else {
                resolve(response);
            }
        });
    });
}


// --- Audio Processing & Analysis (Kept largely the same) ---

// Initialize Web Audio API for FFT analysis
async function initializeAudioAnalysis() {
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

    try {
        await audioContext.audioWorklet.addModule(new URL('./pitch-processor.js', import.meta.url));
        console.log('Pitch processor module loaded');
    } catch (e) {
        console.error('Failed to load pitch processor module', e);
    }


    // Start rendering loop
    renderFFT();
}

// Connect local microphone stream to analyzer
async function connectLocalStream() {
    if (!audioContext || !localStream) return;

    const source = audioContext.createMediaStreamSource(localStream);
    const analyzerSource = audioContext.createMediaStreamSource(localStream);
    analyzerSource.connect(localAnalyser);
    console.log('Local stream connected to FFT analyzer');

    // Create audio processing pipeline for pitch shifting
    await setupAudioProcessing(source);
}

// Setup audio processing pipeline with pitch shifting using SoundTouch
async function setupAudioProcessing(sourceNode) {

    try {
        // Create AudioWorkletNode
        pitchWorkletNode = new AudioWorkletNode(audioContext, 'pitch-processor');

        pitchWorkletNode.onprocessorerror = (err) => {
            console.error('An error from AudioWorkletProcessor:', err);
        };

        // Initialize pitch
        pitchWorkletNode.port.postMessage({ type: 'pitch', value: pitchShiftFactor });

        console.log('Created Pitch Worklet Node');

        // Noise gate
        const noiseGate = audioContext.createDynamicsCompressor();
        noiseGate.threshold.value = -20;
        noiseGate.knee.value = 10;
        noiseGate.ratio.value = 12;
        noiseGate.attack.value = 0.003;
        noiseGate.release.value = 0.25;

        // Low-pass filter
        const smoothingFilter = audioContext.createBiquadFilter();
        smoothingFilter.type = 'lowpass';
        smoothingFilter.frequency.value = 3450;
        smoothingFilter.Q.value = 0.55;

        // High-pass filter
        const highPassFilter = audioContext.createBiquadFilter();
        highPassFilter.type = 'highpass';
        highPassFilter.frequency.value = 105;
        highPassFilter.Q.value = 0.7;

        mediaStreamDestination = audioContext.createMediaStreamDestination();

        // Connect graph
        // source -> noiseGate -> pitchWorklet -> highPass -> smoothing -> destination

        sourceNode.connect(noiseGate);

        // Handling bypass logic? 
        // Original code had `if (!pitchShiftEnabled)` check inside process loop.
        // We need to implement bypass or just run it with pitch=1?
        // SoundTouch with pitch=1 is transparent but computationally non-zero.
        // But the worklet is always in the graph.

        noiseGate.connect(pitchWorkletNode);
        pitchWorkletNode.connect(highPassFilter);

        highPassFilter.connect(smoothingFilter);
        smoothingFilter.connect(mediaStreamDestination);

        processedStream = mediaStreamDestination.stream;
        console.log('Real-time audio processing pipeline created');
    } catch (err) {
        console.error('Failed to setup SoundTouch Worklet:', err);
        mediaStreamDestination = audioContext.createMediaStreamDestination();
        sourceNode.connect(mediaStreamDestination);
        processedStream = mediaStreamDestination.stream;
    }
}

// Update pitch in real-time when slider changes

function updatePitchShift(newFactor) {
    if (pitchWorkletNode) {
        const factor = Math.max(0.1, newFactor);

        // Send message to worklet
        pitchWorkletNode.port.postMessage({ type: 'pitch', value: factor });

        const semitones = 12 * Math.log2(factor);
        console.log(`Updated pitch to ${semitones.toFixed(2)} semitones (factor: ${factor})`);
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

    if (localAnalyser) {
        localAnalyser.getByteFrequencyData(localDataArray);
        drawFFT(localCtx, localDataArray, localCanvas.width, localCanvas.height, '#002fffff');
    }

    if (remoteAnalyser) {
        remoteAnalyser.getByteFrequencyData(remoteDataArray);
        drawFFT(remoteCtx, remoteDataArray, remoteCanvas.width, remoteCanvas.height, '#8000ffff');
    }
}

// Draw FFT bars on canvas
function drawFFT(ctx, dataArray, width, height, color) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    const barWidth = (width / dataArray.length) * 2.5;
    let barHeight;
    let x = 0;

    for (let i = 0; i < dataArray.length; i++) {
        barHeight = (dataArray[i] / 255) * height;
        const gradient = ctx.createLinearGradient(0, height - barHeight, 0, height);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, color);
        ctx.fillStyle = gradient;
        ctx.fillRect(x, height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
    }
}
