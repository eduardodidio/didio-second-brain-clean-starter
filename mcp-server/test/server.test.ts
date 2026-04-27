import { describe, it, expect, mock, beforeEach } from "bun:test";

// Mock tool execute functions before importing server
const mockMemorySearchExecute = mock(async (_input: unknown) => [] as unknown[]);
const mockMemoryAddExecute = mock(async (_input: unknown) => ({
  path: "memory/agent-learnings/test.md",
  sha: "abc123",
}));
const mockProjectsListExecute = mock(async (_input: unknown) => [] as unknown[]);
const mockDiscordNotifyExecute = mock(async (_input: unknown) => ({
  ok: true,
  channel: "progress",
  status: 204,
}));
const mockKnowledgeListExecute = mock(async () => [] as unknown[]);
const mockKnowledgeGetExecute = mock(async (_input: unknown) => [] as unknown[]);
const mockPatternsSearchExecute = mock(async (_input: unknown) => [] as unknown[]);
const mockPatternsGetExecute = mock(async (_input: unknown) => ({} as unknown));
const mockAdrListExecute = mock(async (_input: unknown) => [] as unknown[]);
const mockAdrGetExecute = mock(async (_input: unknown) => ({} as unknown));

mock.module("../src/tools/memory-search.ts", () => ({
  execute: mockMemorySearchExecute,
}));
mock.module("../src/tools/memory-add.ts", () => ({
  execute: mockMemoryAddExecute,
}));
mock.module("../src/tools/projects-list.ts", () => ({
  execute: mockProjectsListExecute,
}));
mock.module("../src/tools/discord-notify.ts", () => ({
  execute: mockDiscordNotifyExecute,
}));
mock.module("../src/tools/knowledge-list.ts", () => ({
  execute: mockKnowledgeListExecute,
}));
mock.module("../src/tools/knowledge-get.ts", () => ({
  execute: mockKnowledgeGetExecute,
}));
mock.module("../src/tools/patterns-search.ts", () => ({
  execute: mockPatternsSearchExecute,
}));
mock.module("../src/tools/patterns-get.ts", () => ({
  execute: mockPatternsGetExecute,
}));
mock.module("../src/tools/adr-list.ts", () => ({
  execute: mockAdrListExecute,
}));
mock.module("../src/tools/adr-get.ts", () => ({
  execute: mockAdrGetExecute,
}));

const { createMcpServer } = await import("../src/server.ts");

// _registeredTools is a plain object keyed by tool name
type RegisteredTool = {
  handler: (args: unknown, extra: unknown) => Promise<{
    isError?: boolean;
    content: Array<{ type: string; text: string }>;
  }>;
};
type InternalServer = {
  _registeredTools: Record<string, RegisteredTool>;
};

function getTools(server: ReturnType<typeof createMcpServer>): Record<string, RegisteredTool> {
  return (server as unknown as InternalServer)._registeredTools;
}

describe("createMcpServer", () => {
  it("returns an McpServer instance without throwing", () => {
    const server = createMcpServer();
    expect(server).toBeDefined();
  });

  it("registers exactly 11 tools with correct names", () => {
    const server = createMcpServer();
    const tools = getTools(server);
    const names = Object.keys(tools);
    expect(names).toHaveLength(11);
    expect(names).toContain("memory.search");
    expect(names).toContain("memory.add");
    expect(names).toContain("memory.digest_pending");
    expect(names).toContain("projects.list");
    expect(names).toContain("discord.notify");
    expect(names).toContain("knowledge.list");
    expect(names).toContain("knowledge.get");
    expect(names).toContain("patterns.search");
    expect(names).toContain("patterns.get");
    expect(names).toContain("adr.list");
    expect(names).toContain("adr.get");
  });
});

describe("knowledge.list tool", () => {
  beforeEach(() => { mockKnowledgeListExecute.mockClear(); });

  it("delegates to knowledge-list execute and returns JSON", async () => {
    mockKnowledgeListExecute.mockImplementation(async () => [
      { domain: "accessibility", count: 3 },
    ]);
    const server = createMcpServer();
    const tool = getTools(server)["knowledge.list"];
    const result = await tool.handler({}, {});
    expect(mockKnowledgeListExecute).toHaveBeenCalledTimes(1);
    expect(result.content[0].type).toBe("text");
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
  });

  it("returns isError:true when execute throws", async () => {
    mockKnowledgeListExecute.mockImplementation(async () => {
      throw new Error("read error");
    });
    const server = createMcpServer();
    const tool = getTools(server)["knowledge.list"];
    const result = await tool.handler({}, {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("read error");
  });
});

describe("knowledge.get tool", () => {
  beforeEach(() => { mockKnowledgeGetExecute.mockClear(); });

  it("delegates to knowledge-get execute with valid domain", async () => {
    mockKnowledgeGetExecute.mockImplementation(async () => []);
    const server = createMcpServer();
    const tool = getTools(server)["knowledge.get"];
    await tool.handler({ domain: "accessibility" }, {});
    expect(mockKnowledgeGetExecute).toHaveBeenCalledTimes(1);
  });

  it("returns isError:true when execute throws (invalid domain)", async () => {
    mockKnowledgeGetExecute.mockImplementation(async () => {
      throw new Error("invalid domain");
    });
    const server = createMcpServer();
    const tool = getTools(server)["knowledge.get"];
    const result = await tool.handler({ domain: "x" }, {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("invalid domain");
  });
});

describe("patterns.search tool", () => {
  beforeEach(() => { mockPatternsSearchExecute.mockClear(); });

  it("returns all patterns when called with no arguments", async () => {
    mockPatternsSearchExecute.mockImplementation(async () => [
      { file: "agents/developer.md", type: "agent", name: "developer", frontmatter: {}, snippet: "" },
    ]);
    const server = createMcpServer();
    const tool = getTools(server)["patterns.search"];
    const result = await tool.handler({}, {});
    expect(mockPatternsSearchExecute).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
  });

  it("returns isError:true when execute throws", async () => {
    mockPatternsSearchExecute.mockImplementation(async () => {
      throw new Error("scan failed");
    });
    const server = createMcpServer();
    const tool = getTools(server)["patterns.search"];
    const result = await tool.handler({}, {});
    expect(result.isError).toBe(true);
  });
});

describe("patterns.get tool", () => {
  beforeEach(() => { mockPatternsGetExecute.mockClear(); });

  it("delegates to patterns-get execute with name", async () => {
    mockPatternsGetExecute.mockImplementation(async () => ({
      file: "agents/developer.md", type: "agent", name: "developer",
      frontmatter: {}, content: "...",
    }));
    const server = createMcpServer();
    const tool = getTools(server)["patterns.get"];
    const result = await tool.handler({ name: "developer" }, {});
    expect(mockPatternsGetExecute).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.name).toBe("developer");
  });

  it("returns isError:true when execute throws", async () => {
    mockPatternsGetExecute.mockImplementation(async () => {
      throw new Error("not found");
    });
    const server = createMcpServer();
    const tool = getTools(server)["patterns.get"];
    const result = await tool.handler({ name: "nonexistent" }, {});
    expect(result.isError).toBe(true);
  });
});

describe("adr.list tool", () => {
  beforeEach(() => { mockAdrListExecute.mockClear(); });

  it("delegates to adr-list execute and returns JSON array", async () => {
    mockAdrListExecute.mockImplementation(async () => [
      { id: 1, file: "0001-test.md", title: "ADR-0001: Test", frontmatter: {},
        status: "accepted", date: "2026-01-01", project: null },
    ]);
    const server = createMcpServer();
    const tool = getTools(server)["adr.list"];
    const result = await tool.handler({}, {});
    expect(mockAdrListExecute).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
  });

  it("returns isError:true when execute throws", async () => {
    mockAdrListExecute.mockImplementation(async () => {
      throw new Error("adr dir missing");
    });
    const server = createMcpServer();
    const tool = getTools(server)["adr.list"];
    const result = await tool.handler({}, {});
    expect(result.isError).toBe(true);
  });
});

describe("adr.get tool", () => {
  beforeEach(() => { mockAdrGetExecute.mockClear(); });

  it("delegates to adr-get execute with valid id", async () => {
    mockAdrGetExecute.mockImplementation(async () => ({
      id: 1, file: "0001-test.md", title: "ADR-0001: Test", frontmatter: {},
      status: "accepted", date: "2026-01-01", project: null, content: "...",
    }));
    const server = createMcpServer();
    const tool = getTools(server)["adr.get"];
    const result = await tool.handler({ id: 1 }, {});
    expect(mockAdrGetExecute).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.id).toBe(1);
  });

  it("returns isError:true when execute throws", async () => {
    mockAdrGetExecute.mockImplementation(async () => {
      throw new Error("ADR 999 not found");
    });
    const server = createMcpServer();
    const tool = getTools(server)["adr.get"];
    const result = await tool.handler({ id: 999 }, {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("ADR 999 not found");
  });
});

describe("memory.search tool", () => {
  beforeEach(() => {
    mockMemorySearchExecute.mockClear();
  });

  it("delegates to memory-search execute with valid input", async () => {
    const server = createMcpServer();
    const tool = getTools(server)["memory.search"];

    await tool.handler({ query: "wave" }, {});

    expect(mockMemorySearchExecute).toHaveBeenCalledTimes(1);
    expect(mockMemorySearchExecute).toHaveBeenCalledWith({ query: "wave" });
  });

  it("returns JSON-parseable content on success", async () => {
    mockMemorySearchExecute.mockImplementation(async () => [
      { file: "test.md", role: "developer", snippet: "wave found", score: 1 },
    ]);
    const server = createMcpServer();
    const tool = getTools(server)["memory.search"];

    const result = await tool.handler({ query: "wave" }, {});
    expect(result.content[0].type).toBe("text");
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].role).toBe("developer");
  });

  it("returns isError:true when execute throws", async () => {
    mockMemorySearchExecute.mockImplementation(async () => {
      throw new Error("disk error");
    });
    const server = createMcpServer();
    const tool = getTools(server)["memory.search"];

    const result = await tool.handler({ query: "wave" }, {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("disk error");
  });
});

describe("memory.add tool", () => {
  beforeEach(() => {
    mockMemoryAddExecute.mockClear();
  });

  it("delegates to memory-add execute with valid input", async () => {
    const server = createMcpServer();
    const tool = getTools(server)["memory.add"];

    await tool.handler(
      { project: "my-project", category: "agent-learnings", content: "x" },
      {}
    );

    expect(mockMemoryAddExecute).toHaveBeenCalledTimes(1);
  });

  it("returns isError:true when execute throws", async () => {
    mockMemoryAddExecute.mockImplementation(async () => {
      throw new Error("unknown project: foo");
    });
    const server = createMcpServer();
    const tool = getTools(server)["memory.add"];

    const result = await tool.handler(
      { project: "foo", category: "agent-learnings", content: "x" },
      {}
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("unknown project: foo");
  });
});

describe("projects.list tool", () => {
  beforeEach(() => {
    mockProjectsListExecute.mockClear();
  });

  it("delegates to projects-list execute with empty input", async () => {
    const server = createMcpServer();
    const tool = getTools(server)["projects.list"];

    await tool.handler({}, {});
    expect(mockProjectsListExecute).toHaveBeenCalledTimes(1);
  });

  it("returns isError:true when execute throws", async () => {
    mockProjectsListExecute.mockImplementation(async () => {
      throw new Error("registry not found");
    });
    const server = createMcpServer();
    const tool = getTools(server)["projects.list"];

    const result = await tool.handler({}, {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("registry not found");
  });
});

describe("discord.notify tool", () => {
  beforeEach(() => {
    mockDiscordNotifyExecute.mockClear();
    mockDiscordNotifyExecute.mockImplementation(async (_input: unknown) => ({
      ok: true,
      channel: "progress",
      status: 204,
    }));
  });

  it("is registered with name 'discord.notify' (dot preserved)", () => {
    const server = createMcpServer();
    const tools = getTools(server);
    expect("discord.notify" in tools).toBe(true);
  });

  it("delegates to discord-notify execute with valid input and returns parseable JSON", async () => {
    const server = createMcpServer();
    const tool = getTools(server)["discord.notify"];

    const result = await tool.handler(
      { event: "build complete", level: "progress", project: "my-project" },
      {}
    );

    expect(mockDiscordNotifyExecute).toHaveBeenCalledTimes(1);
    expect(result.content[0].type).toBe("text");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.ok).toBe(true);
    expect(parsed.channel).toBe("progress");
  });

  it("passes details: undefined when not provided", async () => {
    const server = createMcpServer();
    const tool = getTools(server)["discord.notify"];

    await tool.handler(
      { event: "deploy done", level: "done", project: "my-project" },
      {}
    );

    const callArg = mockDiscordNotifyExecute.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.details).toBeUndefined();
  });

  it("returns isError:true when execute throws", async () => {
    mockDiscordNotifyExecute.mockImplementation(async () => {
      throw new Error("webhook delivery failed");
    });
    const server = createMcpServer();
    const tool = getTools(server)["discord.notify"];

    const result = await tool.handler(
      { event: "crash", level: "error", project: "projeto-c" },
      {}
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("webhook delivery failed");
  });
});
