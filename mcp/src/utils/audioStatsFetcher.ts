//define audio stats type
export interface AudioStats {
  openConnections: number;
  activeUsers: number;
  audioQuality: string;
}

export async function fetchAudioStats(): Promise<AudioStats> {
  // Simulate an HTTP request to fetch audio stats
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        openConnections: 120,
        activeUsers: 85,
        audioQuality: "Good",
      });
    }, 1000);
  });
}


