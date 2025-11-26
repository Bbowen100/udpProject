const startBtn = document.getElementById('startBtn');
const statusDiv = document.getElementById('status');
const remoteAudio = document.getElementById('remoteAudio');

// Connect to the signaling server (WebSocket)
const ws = new WebSocket('ws://localhost:8083/signaling');

// WebRTC Configuration using local Coturn
const rtcConfig = {
    iceServers: [
        {
            urls: 'stun:172.18.25.146:3478'
        },
        {
            urls: 'turn:172.18.25.146:3478',
            username: 'user',
            credential: 'password'
        }
    ]
};

let pc;
let localStream;
let iceCandidateQueue = [];
let canSendIceCandidates = false;

(async function init() {
    startBtn.disabled = true;
    statusDiv.innerText = 'Requesting microphone...';
    console.log('Requesting microphone...');
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    startBtn.disabled = false;
    console.log('Microphone access granted');

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
        localStream.getTracks().forEach(track => {
            console.log('Adding track:', track.kind, track.label);
            pc.addTrack(track, localStream);
        });
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
