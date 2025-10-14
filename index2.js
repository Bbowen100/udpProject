var ws = new WebSocket("ws://localhost:8081/echo");
ws.binaryType = 'arraybuffer'; // Expect binary audio data as ArrayBuffer

const audioElement = document.getElementById('audio');
const updatesElement = document.getElementById("updates");
const audioContext = new AudioContext();
let sourceNode;
let audioBufferQueue = [];
let isPlaying = false;
let datalength = 0;

ws.onmessage = async (evt) => { 
    const stringData = evt.data;
    if (stringData != "-1"){
      // Decode the audio binary data into AudioBuffer
      // string to integer conversion
      const intArray = decodeStringToIntArray(stringData);
      //create an ArrayBuffer from intArray
      const arrayBuffer = new ArrayBuffer(intArray.length * 4);
      const int32View = new Int32Array(arrayBuffer);
      int32View.set(intArray);
      // Decode the ArrayBuffer into an AudioBuffer

      datalength += intArray.length;
      document.getElementById("updates").innerHTML = "Total audio data received: " + datalength + " samples";
  
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer).catch((error) => {
        console.log("Error decoding audio data:", error);
      });
      // Queue the decoded buffer for playback
      audioBufferQueue.push(audioBuffer);
  
      if (!isPlaying) {
        playQueuedAudio();
      }
    }
};

ws.onopen = () => {
    // const ping_res = ws.send("test");
    updatesElement.innerHTML = "WebSocket connection established.";
}

ws.onerror = (error) => {
    updatesElement.innerHTML = "WebSocket error: " + error.message;
};

ws.onclose = () => {
    updatesElement.innerHTML = "WebSocket connection closed.";
};

async function playQueuedAudio() {
    if (audioBufferQueue.length === 0) {
      isPlaying = false;
      return;
    }

    isPlaying = true;
    const buffer = audioBufferQueue.shift();

    sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = buffer;
    sourceNode.connect(audioContext.destination);

    sourceNode.onended = () => {
      playQueuedAudio();
    };

    sourceNode.start();
  }

  function decodeStringToIntArray(str) {
    str = str.trim().split(',').map(Number);
    return new Int32Array(str);
  }