import { fetchAudioStats } from "../utils/audioStatsFetcher.ts";
// Web search handler
export async function audioStatsHandler() {

  // http request to audio stats server would go here
  const results = await fetchAudioStats();
  console.error("results fetched from the server: ", results);
  return {
    content: [{ type: "text", text: results }],
    isError: false,
  };
}

