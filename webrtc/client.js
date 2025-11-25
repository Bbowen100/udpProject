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
        } else if (data.type === 'answer') {
            console.log('Received answer');
            await pc.setRemoteDescription(data);
            statusDiv.innerText = 'Received Answer';
        } else if (data.candidate) {
            console.log('Received ICE candidate');
            await pc.addIceCandidate(data.candidate);
        }
    } catch (e) {
        console.error('Signaling error:', e);
    }
};

async function startPeerConnection() {
    if (pc) return;

    console.log('Creating RTCPeerConnection');
    pc = new RTCPeerConnection(rtcConfig);

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('Sending ICE candidate');
            ws.send(JSON.stringify({ candidate: event.candidate }));
        }
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
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }
}

startBtn.onclick = async () => {
    try {
        startBtn.disabled = true;
        statusDiv.innerText = 'Requesting microphone...';
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        await startPeerConnection();

        // Create Offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ws.send(JSON.stringify(pc.localDescription));

        statusDiv.innerText = 'Sent Offer';
    } catch (e) {
        console.error('Error starting stream:', e);
        statusDiv.innerText = 'Error: ' + e.message;
        startBtn.disabled = false;
    }
};
