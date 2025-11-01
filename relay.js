// connect to ws socket on localhost:8081
const MimeTypes = [
  'audio/webm;codecs=opus',
  "audio/ogg;codecs=opus",
  "audio/wav;codecs=opus",
  "audio/flac",
  "audio/aac",
  "audio/3gpp",
  "audio/3gpp2",
  "audio/x-wav",
  "audio/x-flac",
  "audio/x-aac",
  "audio/x-3gpp",
  "audio/x-3gpp2",
  "audio/mpeg",
  "audio/mp4",
];

var audioB64Buffer = [];
var audioBuffer = [];
let playingTimer;
let play_status = false;
let recordingInterval;
let playingInterval;

let mediaRecorder;
let stream;
const timeslice = 1500; // 1 second slices

// Helper function for recieving base64 audio and converting to Blob
let detectedMimeType = null;

const ws = new WebSocket('ws://localhost:8081/echo/');
ws.binaryType = 'blob';

ws.onopen = () => {
  console.log('WebSocket connection established');
};

ws.onmessage = (event) => {
  console.log('Message received from server:');
  if (event.data === 'SOCKET_OPEN') {
    console.log('WebSocket connection is open and ready for audio data');
    return;
  }
  audioB64Buffer.push(event.data);
  fillAudioBuffer();
};

ws.onclose = () => {
  console.log('WebSocket connection closed');
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

const video = document.getElementById('video');

function getSupportedMimeType() {
  for (const type of MimeTypes) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  console.log('No supported MIME type found');
  return null;
}

async function init() {
  stream = await navigator.mediaDevices.getUserMedia({ audio: true });
}


function startRecording() {
  
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.start(timeslice); // collect 1 second of data blobs
  
  document.getElementById('updates').innerText = 'Recording started';

  mediaRecorder.onstop = () => {
    document.getElementById('updates').innerText = 'Recording stopped';
    startRecording();

  };

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
      console.log('Audio data chunk sent', e.data);
      ws.send(e.data);
      mediaRecorder.stop();
    }
  }
 
}

function stopRecording() {
  if (mediaRecorder) {
    mediaRecorder.stop();
    clearInterval(recordingInterval);
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
    mediaRecorder = null;
  }
  if (!play_status) {
    playAudioFromBuffer();
  }
}
function toggleRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    stopRecording();
  } else {
    startRecording();
  }
}


function fillAudioBuffer() {
   // This function is no longer needed as audioBuffer is filled in ws.onmessage
  let naudioData;
   if (audioB64Buffer.length === 0) {
    console.log('No audio data in buffer to fill');
    return;
  }
  console.log('Filling audio buffer from base64 buffer');
  const audioData = audioB64Buffer.shift();
  if (!(audioData instanceof Blob)) { 
    // console.error('Received audio data is not a Blob');
    return;
  }
  let mimeType = getSupportedMimeType()
  if (mimeType){
    naudioData = new Blob([audioData], { type: mimeType});
    console.log("updated blob ", naudioData);

    const audioURL = URL.createObjectURL(naudioData);
    audioBuffer.push(audioURL);
    if (!play_status) {
      playAudioFromBuffer();
    }
  }
}

function playAudioFromBuffer() {
  if (audioBuffer.length === 0) {
    console.log('No audio data in buffer to play');
    play_status = false;
    return;
  } 
  play_status = true;
  const audioURL = audioBuffer.pop();
  
  // Reuse audio element if it exists, create new one if it doesn't
 
  let audioElement = new Audio();
  audioElement.controls = true;
    
  
  // Set new source and play
  audioElement.src = audioURL;
  audioElement.onended = () => {
    // Revoke the old object URL to free memory
    
    URL.revokeObjectURL(audioURL);
    console.log('Audio track ended', audioBuffer.length, " tracks left in buffer");
    playAudioFromBuffer();
  };
  
  audioElement.play().then(() => {
    console.log('Playing audio from buffer');
  }).catch((error) => {
    console.error('Error playing audio:', error);
    // If error occurs, try to clean up and continue
    
    URL.revokeObjectURL(audioURL);
    playAudioFromBuffer();
  });
}

document.getElementById('recording-icon').addEventListener('click', () => {
  document.getElementById('recording-icon').classList.toggle('record-animate');
  toggleRecording();
});

init();
