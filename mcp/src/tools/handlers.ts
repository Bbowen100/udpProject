import {fetchAudioStats} from "../utils/audioStatsFetcher.ts";
// Web search handler
export async function audioStatsHandler() {

  // http request to audio stats server would go here
  const audioStats = await fetchAudioStats();
  const results = `Audio Stats: Open Connections: ${audioStats.openConnections}, Audio Quality: ${audioStats.audioQuality}`;
  console.error("results fetched from the server: ",results);
  return {
    content: [{ type: "text", text: results }],
    isError: false,
  };
}

