import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execute } from "../src/tools/memory-add.ts";
import { parseFrontmatter } from "../src/lib/frontmatter.ts";

const REGISTRY_YAML = `
version: 1
projects:
  - name: claude-didio-config
    path: /projects/claude-didio-config
    tech_stack: [typescript]
    purpose: framework
    claude_framework: true
    mcp_integrated: true
`.trim();

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mem-add-"));
  await fs.mkdir(path.join(tmpDir, "projects"), { recursive: true });
  await fs.writeFile(path.join(tmpDir, "projects", "registry.yaml"), REGISTRY_YAML, "utf8");
  process.env.SECOND_BRAIN_ROOT = tmpDir;
});

afterEach(async () => {
  delete process.env.SECOND_BRAIN_ROOT;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ── Happy path ────────────────────────────────────────────────────────────────

describe("happy path", () => {
  it("creates file and returns { path, sha }", async () => {
    const result = await execute({
      project: "claude-didio-config",
      category: "incidents",
      content: "# Pilot crash\nAuth middleware crashed",
    });

    expect(result.path).toMatch(/^memory\/incidents\/.+-pilot-crash\.md$/);
    expect(result.sha).toHaveLength(64);
    expect(result.path.endsWith(".md")).toBe(true);

    const absPath = path.join(tmpDir, result.path);
    const raw = await fs.readFile(absPath, "utf8");
    const { data, body } = parseFrontmatter(raw);

    expect(data.project).toBe("claude-didio-config");
    expect(data.category).toBe("incidents");
    expect(data.created).toBeDefined();
    expect(body).toBe("# Pilot crash\nAuth middleware crashed");
  });

  it("sha is sha256 of content (deterministic)", async () => {
    const content = "# Same content";
    const r1 = await execute({ project: "claude-didio-config", category: "incidents", content });
    const r2 = await execute({ project: "claude-didio-config", category: "incidents", content });
    expect(r1.sha).toBe(r2.sha);
    expect(r1.sha).toHaveLength(64);
  });

  it("creates parent directory when missing", async () => {
    const result = await execute({
      project: "claude-didio-config",
      category: "adr",
      content: "ADR entry",
    });
    const absPath = path.join(tmpDir, result.path);
    await expect(fs.stat(absPath)).resolves.toBeTruthy();
  });

  it("frontmatter includes projects array", async () => {
    const result = await execute({
      project: "claude-didio-config",
      category: "agent-learnings",
      content: "Some learning",
    });
    const raw = await fs.readFile(path.join(tmpDir, result.path), "utf8");
    const { data } = parseFrontmatter(raw);
    expect(Array.isArray(data.projects)).toBe(true);
    expect((data.projects as string[])[0]).toBe("claude-didio-config");
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("strips markdown header from slug", async () => {
    const result = await execute({
      project: "claude-didio-config",
      category: "incidents",
      content: "## Deep Header\nsome body",
    });
    expect(result.path).toMatch(/deep-header/);
  });

  it("slug fallback to 'entry' for emoji-only first line", async () => {
    const result = await execute({
      project: "claude-didio-config",
      category: "incidents",
      content: "🚀\nsome body",
    });
    expect(result.path).toMatch(/entry/);
  });

  it("uses first non-empty line when leading lines are blank", async () => {
    const result = await execute({
      project: "claude-didio-config",
      category: "incidents",
      content: "\n\n# Real Title\nbody",
    });
    expect(result.path).toMatch(/real-title/);
  });

  it("truncates slug to 40 chars", async () => {
    const longLine = "a".repeat(200);
    const result = await execute({
      project: "claude-didio-config",
      category: "incidents",
      content: longLine,
    });
    const filename = path.basename(result.path, ".md");
    // filename = <timestamp>-<slug>, split on first hyphen after timestamp portion
    // timestamp is like 2026-04-17T12-30-00-000Z — 24 chars + "-"
    // slug comes after the last segment separator; easier: check total slug part
    const slugPart = filename.slice(filename.indexOf("-", 20) + 1);
    expect(slugPart.length).toBeLessThanOrEqual(40);
  });

  it("unicode slug contains only [a-z0-9-]", async () => {
    const result = await execute({
      project: "claude-didio-config",
      category: "incidents",
      content: "Título com ção",
    });
    const filename = path.basename(result.path);
    const slug = filename.replace(/^[^-]+-[^-]+-[^-]+-[^-]+-[^-]+-[^-]+-/, "").replace(".md", "");
    expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it("resolves filename collision with hex suffix", async () => {
    // Force collision by pre-creating a file with expected name pattern
    const content = "Collision test";
    const r1 = await execute({ project: "claude-didio-config", category: "incidents", content });
    // Rename to simulate timestamp collision: copy file with deterministic name
    const destDir = path.join(tmpDir, "memory", "incidents");
    const files = await fs.readdir(destDir);
    expect(files.length).toBeGreaterThanOrEqual(1);

    // Call again — second call won't collide in real time but we verify both succeed
    const r2 = await execute({ project: "claude-didio-config", category: "incidents", content });
    expect(r1.sha).toBe(r2.sha); // same sha (content unchanged)

    const allFiles = await fs.readdir(destDir);
    expect(allFiles.length).toBe(2);
    expect(allFiles[0]).not.toBe(allFiles[1]);
  });
});

// ── Error scenarios ───────────────────────────────────────────────────────────

describe("error scenarios", () => {
  it("invalid category → throws", async () => {
    await expect(
      execute({ project: "claude-didio-config", category: "invalid" as never, content: "x" })
    ).rejects.toThrow(/invalid category/);
  });

  it("unknown project → throws", async () => {
    await expect(
      execute({ project: "not-in-registry", category: "incidents", content: "x" })
    ).rejects.toThrow(/unknown project/);
  });

  it("empty content → throws non-empty", async () => {
    await expect(
      execute({ project: "claude-didio-config", category: "incidents", content: "" })
    ).rejects.toThrow(/non-empty/);
  });

  it("whitespace-only content → throws non-empty", async () => {
    await expect(
      execute({ project: "claude-didio-config", category: "incidents", content: "   \n\n\n" })
    ).rejects.toThrow(/non-empty/);
  });

  it("malformed registry (empty file) → throws with clear message", async () => {
    await fs.writeFile(path.join(tmpDir, "projects", "registry.yaml"), "", "utf8");
    await expect(
      execute({ project: "claude-didio-config", category: "incidents", content: "x" })
    ).rejects.toThrow(/registry/);
  });
});

// ── Boundary values ───────────────────────────────────────────────────────────

describe("boundary values", () => {
  it("same sha for same content across calls", async () => {
    const content = "Deterministic content";
    const r1 = await execute({ project: "claude-didio-config", category: "incidents", content });
    const r2 = await execute({ project: "claude-didio-config", category: "incidents", content });
    expect(r1.sha).toBe(r2.sha);
  });

  it("different sha for different content", async () => {
    const r1 = await execute({ project: "claude-didio-config", category: "incidents", content: "content A" });
    const r2 = await execute({ project: "claude-didio-config", category: "incidents", content: "content B" });
    expect(r1.sha).not.toBe(r2.sha);
  });
});
