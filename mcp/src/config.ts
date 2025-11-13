// Configuration for the Brave Search MCP server
export const SERVER_CONFIG = {
  name: "mcp",
  version: "1.0.0",
  port: 4000
};

// Check for API key at startup
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("Error: GEMINI_API_KEY environment variable is required");
  process.exit(1);
}