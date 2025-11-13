import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
// import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express from 'express';

import { SERVER_CONFIG } from "./config.ts";
import {
  AUDIO_STATS_TOOL,
  audioStatsHandler,
 
} from "./tools/index.ts";

// Create MCP server
export async function startServer() {
  const server = new Server(
    {
      name: SERVER_CONFIG.name,
      version: SERVER_CONFIG.version,
    },
    {
        capabilities: {
          resources: {},
          tools: {}
        }
    }
  );

  // server.registerTool(
  //   AUDIO_STATS_TOOL.title,
  //   AUDIO_STATS_TOOL,
  //   // wrapper to match expected signature: (args, extra) => Response | Promise<Response>
  //   async (args: any, extra?: any) => {
  //     const res = await audioStatsHandler();
  //     // normalize content items so "type" is the literal "text" (not a generic string)
  //     console.log("Audio Stats Tool Handler called returns:",res);
  //     const content = (res.content || []).map((c: any) => {
  //       if (c && c.type === "text") {
  //         return { ...c, type: "text" as const };
  //       }
  //       return c;
  //     });
  //     return { ...(res as any), content };
  //   }
  // );

  // Register tool listing handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    console.error("Received ListToolsRequest");
    return {
      tools: [AUDIO_STATS_TOOL],
    };
  });

  // {"jsonrpc": "2.0", "id": 1,"method": "tools/call","params": {"tool": "audio_stats_tool","name":"audio_stats_tool","arguments": {"count": 10,"offset": 0,"query": "Hello, MCP server!","message": "Give me the latest audio server statistics."}}}

  // // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    // console.log("Received CallToolRequest:", JSON.stringify(request, null, 2));
    try {
      const { name, arguments: args } = request.params;

      if (!args) {
        throw new Error("No arguments provided");
      }

      switch (name) {
        case "audio_stats_tool":
          return await audioStatsHandler();

        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// curl -X POST http://localhost:4000/ \
// -H "Content-Type: application/json" \
// -H "Accept: text/event-stream, application/json" \
// -d '{"jsonrpc": "2.0", "id": 1,"method": "tools/call","params": {"tool": "audio_stats_tool","name":"audio_stats_tool","arguments": {"count": 10,"offset": 0,"query": "Hello, MCP server!","message": "Give me the latest audio server statistics."}}}'
