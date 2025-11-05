import { type Tool } from "@modelcontextprotocol/sdk/types.js";

// Web Search Tool Definition
export const AUDIO_STATS_TOOL: Tool = {
  name: "audio_stats_tool",
  version: "1.0.0",
  description:
    "Analyzes audio server and provides statistics such as open connections, active users, and audio quality metrics.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query (max 400 chars, 50 words)",
      },
      count: {
        type: "number",
        description: "Number of results (1-20, default 10)",
        default: 10,
      },
      offset: {
        type: "number",
        description: "Pagination offset (max 9, default 0)",
        default: 0,
      },
    },
    required: ["query"],
  },
};

