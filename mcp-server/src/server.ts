import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import * as memorySearch from "./tools/memory-search.ts";
import * as memoryAdd from "./tools/memory-add.ts";
import * as projectsList from "./tools/projects-list.ts";
import * as discordNotify from "./tools/discord-notify.ts";
import * as knowledgeList from "./tools/knowledge-list.ts";
import * as knowledgeGet from "./tools/knowledge-get.ts";
import * as patternsSearch from "./tools/patterns-search.ts";
import * as patternsGet from "./tools/patterns-get.ts";
import * as adrList from "./tools/adr-list.ts";
import * as adrGet from "./tools/adr-get.ts";
import * as memoryDigestPending from "./tools/memory-digest-pending.ts";
import { MEMORY_CATEGORIES, KNOWLEDGE_DOMAINS, PATTERN_TYPES, ADR_STATUSES } from "./types.ts";
import { DISCORD_LEVELS } from "./discord/types.ts";

// Typed as `any` to short-circuit the MCP SDK's deep generic inference
// over Zod schemas (TS2589 with @modelcontextprotocol/sdk v1.29 + zod ^3).
type Shape = Record<string, any>;

export function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: "second-brain", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  const memorySearchSchema: Shape = {
    query: z.string().min(1),
    project: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  };

  server.registerTool(
    "memory.search",
    {
      description: "Full-text search in memory/agent-learnings/**/*.md",
      inputSchema: memorySearchSchema,
    },
    async (input: Record<string, unknown>) => {
      try {
        const result = await memorySearch.execute(
          input as unknown as Parameters<typeof memorySearch.execute>[0]
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[second-brain] memory.search error:", message);
        return {
          isError: true,
          content: [{ type: "text", text: `memory.search failed: ${message}` }],
        };
      }
    }
  );

  const memoryAddSchema: Shape = {
    project: z.string().min(1),
    category: z.enum(MEMORY_CATEGORIES as [string, ...string[]]),
    content: z.string().min(1),
  };

  server.registerTool(
    "memory.add",
    {
      description: "Append a new memory entry under memory/<category>/",
      inputSchema: memoryAddSchema,
    },
    async (input: Record<string, unknown>) => {
      try {
        const result = await memoryAdd.execute({
          project: input.project as string,
          category: input.category as (typeof MEMORY_CATEGORIES)[number],
          content: input.content as string,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[second-brain] memory.add error:", message);
        return {
          isError: true,
          content: [{ type: "text", text: `memory.add failed: ${message}` }],
        };
      }
    }
  );

  const projectsListSchema: Shape = {
    filter: z.enum(["claude_framework", "mcp_integrated"]).optional(),
  };

  server.registerTool(
    "projects.list",
    {
      description: "List projects from the registry, optionally filtered",
      inputSchema: projectsListSchema,
    },
    async (input: Record<string, unknown>) => {
      try {
        const result = await projectsList.execute(
          input as unknown as Parameters<typeof projectsList.execute>[0]
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[second-brain] projects.list error:", message);
        return {
          isError: true,
          content: [
            { type: "text", text: `projects.list failed: ${message}` },
          ],
        };
      }
    }
  );

  const discordNotifySchema: Shape = {
    event: z.string().min(1),
    level: z.enum(DISCORD_LEVELS as unknown as [string, ...string[]]),
    project: z.string().min(1),
    details: z.string().optional(),
  };

  server.registerTool(
    "discord.notify",
    {
      description: "Send a Discord notification routed by level (progress/warn/error/done)",
      inputSchema: discordNotifySchema,
    },
    async (input: Record<string, unknown>) => {
      try {
        const result = await discordNotify.execute({
          event: input.event as string,
          level: input.level as (typeof DISCORD_LEVELS)[number],
          project: input.project as string,
          details: input.details as string | undefined,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[second-brain] discord.notify error:", message);
        return {
          isError: true,
          content: [{ type: "text", text: `discord.notify failed: ${message}` }],
        };
      }
    }
  );

  server.registerTool(
    "knowledge.list",
    {
      description: "List knowledge domains with file counts",
      inputSchema: {} as Shape,
    },
    async (_input: Record<string, unknown>) => {
      try {
        const result = await knowledgeList.execute();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[second-brain] knowledge.list error:", message);
        return {
          isError: true,
          content: [{ type: "text", text: `knowledge.list failed: ${message}` }],
        };
      }
    }
  );

  const knowledgeGetSchema: Shape = {
    domain: z.enum(KNOWLEDGE_DOMAINS as unknown as [string, ...string[]]),
  };

  server.registerTool(
    "knowledge.get",
    {
      description: "Read all knowledge articles for a domain",
      inputSchema: knowledgeGetSchema,
    },
    async (input: Record<string, unknown>) => {
      try {
        const result = await knowledgeGet.execute(
          input as unknown as Parameters<typeof knowledgeGet.execute>[0]
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[second-brain] knowledge.get error:", message);
        return {
          isError: true,
          content: [{ type: "text", text: `knowledge.get failed: ${message}` }],
        };
      }
    }
  );

  const patternsSearchSchema: Shape = {
    query: z.string().optional(),
    type: z.enum(PATTERN_TYPES as unknown as [string, ...string[]]).optional(),
    tags: z.array(z.string()).optional(),
  };

  server.registerTool(
    "patterns.search",
    {
      description: "Search patterns by query/type/tags",
      inputSchema: patternsSearchSchema,
    },
    async (input: Record<string, unknown>) => {
      try {
        const result = await patternsSearch.execute(
          input as unknown as Parameters<typeof patternsSearch.execute>[0]
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[second-brain] patterns.search error:", message);
        return {
          isError: true,
          content: [{ type: "text", text: `patterns.search failed: ${message}` }],
        };
      }
    }
  );

  const patternsGetSchema: Shape = {
    name: z.string().min(1),
    type: z.enum(PATTERN_TYPES as unknown as [string, ...string[]]).optional(),
  };

  server.registerTool(
    "patterns.get",
    {
      description: "Get a single pattern by name (disambiguate with type)",
      inputSchema: patternsGetSchema,
    },
    async (input: Record<string, unknown>) => {
      try {
        const result = await patternsGet.execute(
          input as unknown as Parameters<typeof patternsGet.execute>[0]
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[second-brain] patterns.get error:", message);
        return {
          isError: true,
          content: [{ type: "text", text: `patterns.get failed: ${message}` }],
        };
      }
    }
  );

  const adrListSchema: Shape = {
    project: z.string().optional(),
    status: z.enum(ADR_STATUSES as unknown as [string, ...string[]]).optional(),
  };

  server.registerTool(
    "adr.list",
    {
      description: "List ADRs with optional project/status filters",
      inputSchema: adrListSchema,
    },
    async (input: Record<string, unknown>) => {
      try {
        const result = await adrList.execute(
          input as unknown as Parameters<typeof adrList.execute>[0]
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[second-brain] adr.list error:", message);
        return {
          isError: true,
          content: [{ type: "text", text: `adr.list failed: ${message}` }],
        };
      }
    }
  );

  const adrGetSchema: Shape = {
    id: z.number().int().min(1),
  };

  server.registerTool(
    "adr.get",
    {
      description: "Get a single ADR by numeric id",
      inputSchema: adrGetSchema,
    },
    async (input: Record<string, unknown>) => {
      try {
        const result = await adrGet.execute(
          input as unknown as Parameters<typeof adrGet.execute>[0]
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[second-brain] adr.get error:", message);
        return {
          isError: true,
          content: [{ type: "text", text: `adr.get failed: ${message}` }],
        };
      }
    }
  );

  const memoryDigestPendingSchema: Shape = {
    dryRun: z.boolean().optional(),
    project: z.string().optional(),
    maxEntries: z.number().int().min(1).max(1000).optional(),
  };

  server.registerTool(
    "memory.digest_pending",
    {
      description:
        "Ingere drops pendentes em <projeto>/memory/_pending-digest/, classifica, filtra cross-project, dedupe via shingles, e absorve em memory/agent-learnings ou patterns/.",
      inputSchema: memoryDigestPendingSchema,
    },
    async (input: Record<string, unknown>) => {
      try {
        const result = await memoryDigestPending.execute({
          dryRun: input.dryRun as boolean | undefined,
          project: input.project as string | undefined,
          maxEntries: input.maxEntries as number | undefined,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[second-brain] memory.digest_pending error:", message);
        return {
          isError: true,
          content: [{ type: "text", text: `memory.digest_pending failed: ${message}` }],
        };
      }
    }
  );

  return server;
}
