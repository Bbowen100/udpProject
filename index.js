// connect to ws socket on localhost:8081
const ws = new WebSocket('ws://localhost:8081/echo/');
var hlsUrl = ''; // URL of your HLS playlist
const hls = new Hls({});

ws.onopen = () => {
  console.log('WebSocket connection established');
};

ws.onmessage = (event) => {
  console.log('Message received from server:', event.data);
  if (event.data === 'SOCKET_OPEN') {
    ws.send('REQUEST_HLS_URL');
  }
  else if (event.data !== '-1') {
    if (Hls.isSupported()) {
      if (hlsUrl !== event.data) {
        hlsUrl = event.data; // Update HLS URL with the received data
        hls.loadSource(hlsUrl);
        hls.attachMedia(video);
      }
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = hlsUrl;
    }
  }
};

ws.onclose = () => {
  console.log('WebSocket connection closed');
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

const video = document.getElementById('video');

if (Hls.isSupported()) {

  hls.attachMedia(video);
  hls.on(Hls.Events.MANIFEST_PARSED, function(event, data) {
    console.log('Manifest loaded, found ' + data.levels.length + ' quality level(s)');
    video.play();
  });

  hls.on(Hls.Events.LEVEL_LOADED, function(event, data) {
    console.log('Playlist updated with new segments, sliding window sequence:', data.details.mediaSequence);
  });

  hls.on(Hls.Events.BUFFER_APPENDED, (eventName, {frag}) =>{
    console.log('Buffer appended', eventName, {frag});
    if (frag.type === 'main' && frag.sn !== 'initSegment' && frag.elementaryStreams.video) {
    const { start, startDTS, startPTS, maxStartPTS, elementaryStreams } = frag;
    tOffset = elementaryStreams.video.startPTS - start;
    hls.off(Hls.Events.BUFFER_APPENDED, getAppendedOffset);
    console.log('video timestamp offset:', tOffset, { start, startDTS, startPTS, maxStartPTS, elementaryStreams });
  }
  });

} else if (video.canPlayType('application/vnd.apple.mpegurl')) {
  // Native HLS support (e.g., Safari)
  video.addEventListener('loadedmetadata', function() {
    console.log('Metadata loaded but hls not supported natively');
    // video.play();
  });
} else {
  alert('HLS not supported in this browser.');
}

let mediaRecorder;
let recordingInterval;
function startRecording() {
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(function(stream) {
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.start();
        document.getElementById('updates').innerText = 'Recording started';
        

        // get audio chunks every second
        recordingInterval = setInterval(() => {
          if (mediaRecorder && mediaRecorder.state === 'recording') {
            data = mediaRecorder.requestData();
            console.log('Audio data chunk requested', data);
          }
        }, 1000);

        mediaRecorder.onstop = function() {
          document.getElementById('updates').innerText = 'Recording stopped';
        };

      })
      .catch(function(err) {
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

document.getElementById('recording-icon').addEventListener('click', () => {
  document.getElementById('recording-icon').classList.toggle('record-animate');
  toggleRecording();
});