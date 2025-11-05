import {fetchAudioStats} from "../utils/audioStatsFetcher";
// Web search handler
export async function audioStatsHandler(args: unknown) {

  // http request to audio stats server would go here
  const audioStats = await fetchAudioStats();
  const results = `Audio Stats: Open Connections: ${audioStats.openConnections}, Audio Quality: ${audioStats.audioQuality}`;

  return {
    content: [{ type: "text", text: results }],
    isError: false,
  };
}

