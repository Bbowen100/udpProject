// connect to ws socket on localhost:8081
const ws = new WebSocket('ws://localhost:8081/echo/');
var hlsUrl = ''; // URL of your HLS playlist
const hls = new Hls({});

ws.onopen = function() {
  console.log('WebSocket connection established');
};

ws.onmessage = function(event) {
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

ws.onclose = function() {
  console.log('WebSocket connection closed');
};

ws.onerror = function(error) {
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