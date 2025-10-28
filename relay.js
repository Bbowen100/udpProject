// connect to ws socket on localhost:8081
var audioB64Buffer = [];
var audioBuffer = [];
let playingTimer;
let play_status = false;
let mediaRecorder;
let recordingInterval;
let playingInterval;
const ws = new WebSocket('ws://localhost:8081/echo/');

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
  console.log('Current audio buffer size:', audioB64Buffer.length);
  fillAudioBuffer();

};

ws.onclose = () => {
  console.log('WebSocket connection closed');
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

const video = document.getElementById('video');


async function startRecording() {
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    const devices = await navigator.mediaDevices.enumerateDevices();
    console.log('Available media devices:', devices);
    const mic = devices.find(d => d.kind === 'audioinput');

    navigator.mediaDevices.getUserMedia({ audio: { deviceId: mic.deviceId }, video: false })
      .then((stream) => {
        let chunks = [];
        let recordingTimeout;
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.start();
        document.getElementById('updates').innerText = 'Recording started';
        

        // get audio chunks every second
        recordingInterval = setInterval(() => {
          if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.requestData();
            console.log('Audio data chunk requested');
          }
        }, 1000);


        mediaRecorder.onstop = () => {
          document.getElementById('updates').innerText = 'Recording stopped';
          // const audioBlob = new Blob(chunks, { type: "audio/ogg; codecs=opus" });
          // const audioURL = URL.createObjectURL(audioBlob);  // Create a URL for the Blob
          // const audio = new Audio(audioURL);                // Create a new Audio element
          // audio.controls = true;                             // Optional: show controls
          // document.body.appendChild(audio);                  // Optional: add to DOM to show controls
          // audio.play(); 
        };

        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            // send audio data via WebSocket
            // ws.send(e.data);
            console.log('Audio data chunk sent', e.data);
            // chunks.push(e.data);
            // base64 encode the audio data

            const reader = new FileReader();
            reader.onloadend = () => {
              const base64audio = reader.result; // get base64 string

              ws.send(base64audio);
            };
            reader.readAsDataURL(e.data);
          }
        }

      })
      .catch((err) => {
        console.error('The following error occurred: ' + err);
      });
  } else {
    console.error('getUserMedia not supported on your browser!');
  }
}

function stopRecording() {
  if (mediaRecorder) {
    mediaRecorder.stop();
    clearInterval(recordingInterval);
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
    mediaRecorder = null;
  }
}
function toggleRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    stopRecording();
  } else {
    startRecording();
  }
}

// Helper function for recieving base64 audio and converting to Blob

function base64ToAudioBlob(base64String, mimeType = "audio/ogg; codecs=opus") {
  // Remove the prefix if exists
  // const base64 = base64String.includes('base64,')
  //   ? base64String.split('base64,')[1]
  //   : base64String;
  let suffix = base64String;
  if (base64String.includes('base64,')) {
    [prefix, suffix] = base64String.split('base64,');
    const match = prefix.match(/data:(.*);/);
    if (match && match[1]) {
      mimeType = match[1];
    }
    console.log('Decoding base64 audio data mimeType:', mimeType);
    if (MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = mimeType;
    }
    else if (MediaRecorder.isTypeSupported('audio/wav; codecs=opus')) {
      mimeType = 'audio/wav; codecs=opus';
    }else {
      console.warn('Default MIME type not supported');
    }
  }
  console.log('Current MediaRecorder mimeType:', mimeType);
  // Decode base64 to binary string
  const binaryString = atob(suffix);
  const length = binaryString.length;
  
  // Convert binary string to Uint8Array
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = binaryString.charCodeAt(i); 
  }
  
  // Create a Blob with audio mime type
  return new Blob([bytes], { type: mimeType });
}

function fillAudioBuffer() {
   // This function is no longer needed as audioBuffer is filled in ws.onmessage
  if (audioB64Buffer.length === 0) {
    console.log('No audio data in buffer to fill');
    if (playingTimer) clearTimeout(playingTimer);
    return;
  }
  console.log('Filling audio buffer from base64 buffer');
  const audioData = audioB64Buffer.pop();
  // decode base64 audioData
  const audioBlob = base64ToAudioBlob(audioData);
  const audioURL = URL.createObjectURL(audioBlob);
  audioBuffer.push(audioURL);
  if (!play_status) {
    playAudioFromBuffer();
  }
  playingTimer = setTimeout(fillAudioBuffer, 500);
}

function playAudioFromBuffer() {
  if (audioBuffer.length === 0) {
    console.log('No audio data in buffer to play');
    play_status = false;
    return;
  } 
  play_status = true;
  const naudio = audioBuffer.pop();
  var audio = new Audio(naudio);
  // audio.src = naudio; 
  audio.controls = true;    
  // audio.load();
  audio.onended = () => {
    // after audio is done playing, play next audio in buffer
    console.log('Audio track ended', audioBuffer.length, " tracks left in buffer");
    playAudioFromBuffer();
  };
  audio.play().then(() => {
    console.log('Playing audio from buffer');
  }).catch((error) => {
    console.error('Error playing audio:', error);
  });
}



document.getElementById('recording-icon').addEventListener('click', () => {
  document.getElementById('recording-icon').classList.toggle('record-animate');
  toggleRecording();
});