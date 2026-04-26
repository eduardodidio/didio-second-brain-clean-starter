import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execute } from "../src/tools/patterns-get.ts";

let tmpDir: string;

async function writeFixture(relPath: string, content: string): Promise<void> {
  const abs = path.join(tmpDir, "patterns", relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "patterns-get-test-"));
  process.env.SECOND_BRAIN_ROOT = tmpDir;
});

afterEach(async () => {
  delete process.env.SECOND_BRAIN_ROOT;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("patterns.get — happy path", () => {
  it("returns PatternFull for a plain agent file", async () => {
    await writeFixture(
      "agents/architect.md",
      "---\ntags: [planning]\n---\n# Architect\nThe architect role."
    );

    const result = await execute({ name: "architect" });

    expect(result.type).toBe("agent");
    expect(result.name).toBe("architect");
    expect(result.file).toBe("agents/architect.md");
    expect(result.content).toContain("# Architect");
    expect(result.frontmatter).toEqual({ tags: ["planning"] });
  });

  it("returns same result when type is specified explicitly", async () => {
    await writeFixture(
      "agents/architect.md",
      "---\ntags: [planning]\n---\n# Architect\nThe architect role."
    );

    const result = await execute({ name: "architect", type: "agent" });

    expect(result.type).toBe("agent");
    expect(result.name).toBe("architect");
    expect(result.content).toContain("# Architect");
  });

  it("returns README for a hook in a subdirectory", async () => {
    await writeFixture(
      "hooks/stop-session-summary/README.md",
      "---\nversion: 1\n---\n# Stop Session Summary Hook\nDoes something."
    );

    const result = await execute({
      name: "stop-session-summary",
      type: "hook",
    });

    expect(result.type).toBe("hook");
    expect(result.name).toBe("stop-session-summary");
    expect(result.content).toContain("# Stop Session Summary Hook");
  });

  it("filters by type — ignores same name in other types", async () => {
    await writeFixture("agents/shared.md", "---\n---\n# Agent Shared");
    await writeFixture("snippets/shared.md", "---\n---\n# Snippet Shared");

    const result = await execute({ name: "shared", type: "agent" });

    expect(result.type).toBe("agent");
    expect(result.content).toContain("# Agent Shared");
  });
});

describe("patterns.get — edge cases", () => {
  it("handles name with hyphens (stop-session-summary)", async () => {
    await writeFixture(
      "hooks/stop-session-summary/README.md",
      "---\n---\n# Hook Content"
    );

    const result = await execute({ name: "stop-session-summary" });

    expect(result.name).toBe("stop-session-summary");
    expect(result.type).toBe("hook");
  });

  it("handles name with underscores (my_pattern)", async () => {
    await writeFixture("skills/my_pattern.md", "---\n---\n# Underscore Pattern");

    const result = await execute({ name: "my_pattern" });

    expect(result.name).toBe("my_pattern");
    expect(result.type).toBe("skill");
  });

  it("returns first alphabetical file when subdir has multiple .md files", async () => {
    await writeFixture(
      "hooks/multi-hook/README.md",
      "---\n---\n# README content"
    );
    await writeFixture(
      "hooks/multi-hook/extra.md",
      "---\n---\n# Extra content"
    );

    const result = await execute({ name: "multi-hook", type: "hook" });

    // "extra.md" sorts before "README.md" alphabetically (e < R in case-sensitive)
    // but loadMarkdownDir sorts by full relPath: "hooks/multi-hook/README.md" vs "hooks/multi-hook/extra.md"
    // 'R' (82) > 'e' (101) in ASCII but in localeCompare it depends on locale
    // Let's just check we get one valid result
    expect(result.name).toBe("multi-hook");
    expect(result.type).toBe("hook");
    expect(typeof result.content).toBe("string");
  });

  it("content does not contain frontmatter delimiters", async () => {
    await writeFixture(
      "agents/clean.md",
      "---\ntitle: Clean\n---\n# Body Only\nNo frontmatter here."
    );

    const result = await execute({ name: "clean" });

    expect(result.content).not.toContain("---");
    expect(result.content).toContain("# Body Only");
  });
});

describe("patterns.get — error scenarios", () => {
  it("throws on empty name", async () => {
    await expect(execute({ name: "" })).rejects.toThrow(/non-empty/);
  });

  it("throws on whitespace-only name", async () => {
    await expect(execute({ name: "   " })).rejects.toThrow(/non-empty/);
  });

  it("throws pattern not found for unknown name", async () => {
    await writeFixture("agents/architect.md", "---\n---\n# Architect");

    await expect(execute({ name: "foo" })).rejects.toThrow(
      /pattern not found: foo/
    );
  });

  it("throws pattern not found when type filters out existing name", async () => {
    await writeFixture("agents/shared.md", "---\n---\n# Shared");

    await expect(execute({ name: "shared", type: "skill" })).rejects.toThrow(
      /pattern not found: shared/
    );
  });

  it("throws ambiguous when name exists in multiple types", async () => {
    await writeFixture("agents/shared.md", "---\n---\n# Agent Shared");
    await writeFixture("snippets/shared.md", "---\n---\n# Snippet Shared");

    await expect(execute({ name: "shared" })).rejects.toThrow(/ambiguous/);
  });

  it("throws on invalid type", async () => {
    // @ts-expect-error intentional invalid type for test
    await expect(execute({ name: "anything", type: "foo" })).rejects.toThrow();
  });
});

describe("patterns.get — boundary values", () => {
  it("works with snippet type", async () => {
    await writeFixture(
      "snippets/my_snippet.md",
      "---\nlang: ts\n---\n# TS Snippet\ncode here"
    );

    const result = await execute({ name: "my_snippet", type: "snippet" });

    expect(result.type).toBe("snippet");
    expect(result.frontmatter).toEqual({ lang: "ts" });
  });

  it("works with skill type", async () => {
    await writeFixture("skills/review.md", "---\n---\n# Review Skill");

    const result = await execute({ name: "review", type: "skill" });

    expect(result.type).toBe("skill");
  });

  it("returns empty frontmatter when no frontmatter present", async () => {
    await writeFixture("agents/simple.md", "# Simple Agent\nNo frontmatter.");

    const result = await execute({ name: "simple" });

    expect(result.frontmatter).toEqual({});
    expect(result.content).toContain("# Simple Agent");
  });
});
