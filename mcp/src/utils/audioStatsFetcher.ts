//define audio stats type
export interface AudioStats {
  openConnections: number;
  activeUsers: number;
  audioQuality: string;
}

export async function fetchAudioStats() {
  // Simulate an HTTP request to fetch audio stats
  // fetch with get request to localhost:4000
  const url = 'http://localhost:8000';
  const response = await fetch(url);
  console.error("results fetched response from the server: ", response);
  const data = await response.text();
  console.error("results fetched from the server: ", data);
  return data;
}


