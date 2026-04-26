import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server.ts";

// stdio transport: stdout is reserved for the MCP protocol framing — never write to it directly
const server = createMcpServer();
const transport = new StdioServerTransport();

console.error(`[second-brain] starting on stdio, pid ${process.pid}`);

await server.connect(transport);

process.on("SIGINT", async () => {
  console.error("[second-brain] SIGINT received, closing");
  await server.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.error("[second-brain] SIGTERM received, closing");
  await server.close();
  process.exit(0);
});
