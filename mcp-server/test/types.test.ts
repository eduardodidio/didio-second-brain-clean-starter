import { describe, expect, test } from "bun:test";
import {
  MEMORY_CATEGORIES,
  type MemoryAddInput,
  type MemoryAddResult,
  type MemoryCategory,
  type MemorySearchHit,
  type MemorySearchInput,
  type Project,
  type ProjectsListInput,
  type ProjectsListResult,
  type ProjectsRegistry,
  KNOWLEDGE_DOMAINS,
  type KnowledgeDomain,
  PATTERN_TYPES,
  type PatternType,
  ADR_STATUSES,
  type AdrStatus,
} from "../src/types";

describe("MemoryCategory", () => {
  test("accepts valid literals", () => {
    const c: MemoryCategory = "agent-learnings";
    expect(c).toBe("agent-learnings");

    const c2: MemoryCategory = "incidents";
    expect(c2).toBe("incidents");

    const c3: MemoryCategory = "adr";
    expect(c3).toBe("adr");
  });

  // @ts-expect-error invalid category must not be assignable
  const _invalid: MemoryCategory = "invalid-category";
});

describe("MEMORY_CATEGORIES", () => {
  test("contains exactly 3 categories in order", () => {
    expect([...MEMORY_CATEGORIES]).toEqual(["agent-learnings", "incidents", "adr"]);
  });

  test("length is 3", () => {
    expect(MEMORY_CATEGORIES.length).toBe(3);
  });
});

describe("Project", () => {
  test("valid project shape", () => {
    const p: Project = {
      name: "my-project",
      path: "/projects/my-project",
      tech_stack: ["TypeScript", "React"],
      purpose: "accessibility game",
      claude_framework: true,
      mcp_integrated: false,
    };
    expect(p.claude_framework).toBe(true);
    expect(typeof p.mcp_integrated).toBe("boolean");
  });

  // @ts-expect-error string is not assignable to boolean
  const _bad_cf: Project["claude_framework"] = "true";
  void _bad_cf;
});

describe("MemorySearchInput / MemorySearchHit", () => {
  test("valid MemorySearchInput", () => {
    const input: MemorySearchInput = { query: "pattern", project: "my-project", limit: 5 };
    expect(input.query).toBe("pattern");
  });

  test("valid MemorySearchHit", () => {
    const hit: MemorySearchHit = { file: "memory/foo.md", role: "developer", snippet: "some text", score: 3 };
    expect(hit.score).toBe(3);
  });

  test("MemorySearchHit role can be null", () => {
    const hit: MemorySearchHit = { file: "memory/foo.md", role: null, snippet: "x", score: 1 };
    expect(hit.role).toBeNull();
  });
});

describe("MemoryAddInput / MemoryAddResult", () => {
  test("valid MemoryAddInput", () => {
    const input: MemoryAddInput = { project: "my-project", category: "incidents", content: "# Incident" };
    expect(input.category).toBe("incidents");
  });

  test("valid MemoryAddResult", () => {
    const result: MemoryAddResult = { path: "memory/incidents/my-project.md", sha: "abc123" };
    expect(result.sha).toBe("abc123");
  });
});

describe("KNOWLEDGE_DOMAINS", () => {
  test("length is 4", () => {
    expect(KNOWLEDGE_DOMAINS.length).toBe(4);
  });

  test("contains expected values", () => {
    expect([...KNOWLEDGE_DOMAINS]).toEqual([
      "accessibility",
      "crypto-trading",
      "game-engine",
      "react-patterns",
    ]);
  });

  test("includes react-patterns", () => {
    expect(KNOWLEDGE_DOMAINS.includes("react-patterns")).toBe(true);
  });

  test("KnowledgeDomain accepts valid literal", () => {
    const d: KnowledgeDomain = "accessibility";
    expect(d).toBe("accessibility");
  });

  // @ts-expect-error invalid domain must not be assignable
  const _invalid: KnowledgeDomain = "foo";
  void _invalid;
});

describe("PATTERN_TYPES", () => {
  test("length is 4", () => {
    expect(PATTERN_TYPES.length).toBe(4);
  });

  test("contains expected values", () => {
    expect([...PATTERN_TYPES]).toEqual(["agent", "skill", "hook", "snippet"]);
  });

  test("PatternType accepts valid literal", () => {
    const t: PatternType = "snippet";
    expect(t).toBe("snippet");
  });

  // @ts-expect-error invalid type must not be assignable
  const _invalid: PatternType = "widget";
  void _invalid;
});

describe("ADR_STATUSES", () => {
  test("length is 3", () => {
    expect(ADR_STATUSES.length).toBe(3);
  });

  test("contains expected values", () => {
    expect([...ADR_STATUSES]).toEqual(["proposed", "accepted", "superseded"]);
  });

  test("AdrStatus accepts valid literal", () => {
    const s: AdrStatus = "accepted";
    expect(s).toBe("accepted");
  });

  // @ts-expect-error invalid status must not be assignable
  const _invalid: AdrStatus = "rejected";
  void _invalid;
});

describe("ProjectsListInput / ProjectsListResult / ProjectsRegistry", () => {
  test("valid ProjectsListInput with filter", () => {
    const input: ProjectsListInput = { filter: "claude_framework" };
    expect(input.filter).toBe("claude_framework");
  });

  test("ProjectsListInput filter is optional", () => {
    const input: ProjectsListInput = {};
    expect(input.filter).toBeUndefined();
  });

  test("ProjectsListResult is an array of Projects", () => {
    const result: ProjectsListResult = [];
    expect(Array.isArray(result)).toBe(true);
  });

  test("valid ProjectsRegistry", () => {
    const registry: ProjectsRegistry = { version: 1, projects: [] };
    expect(registry.version).toBe(1);
  });
});
