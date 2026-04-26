import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { KNOWLEDGE_DOMAINS } from "../src/types.ts";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-list-"));
  process.env["SECOND_BRAIN_ROOT"] = tmpDir;
});

afterEach(async () => {
  delete process.env["SECOND_BRAIN_ROOT"];
  await fs.rm(tmpDir, { recursive: true });
});

async function write(relPath: string, content: string): Promise<void> {
  const abs = path.join(tmpDir, relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
}

async function importFresh() {
  // Re-import with cache-busted URL so SECOND_BRAIN_ROOT is re-evaluated
  const { execute } = await import(
    `../src/tools/knowledge-list.ts?t=${Date.now()}`
  );
  return execute as () => Promise<{ domain: string; count: number }[]>;
}

describe("knowledge-list execute()", () => {
  it("happy path: returns 4 entries with correct counts", async () => {
    await write("knowledge/accessibility/a.md", "# A");
    await write("knowledge/accessibility/b.md", "# B");
    await write("knowledge/game-engine/c.md", "# C");

    const execute = await importFresh();
    const result = await execute();

    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ domain: "accessibility", count: 2 });
    expect(result[1]).toEqual({ domain: "crypto-trading", count: 0 });
    expect(result[2]).toEqual({ domain: "game-engine", count: 1 });
    expect(result[3]).toEqual({ domain: "react-patterns", count: 0 });
  });

  it("edge case: knowledge/ dir does not exist → all counts are 0", async () => {
    // tmpDir has no knowledge/ subdir

    const execute = await importFresh();
    const result = await execute();

    expect(result).toHaveLength(4);
    for (const item of result) {
      expect(item.count).toBe(0);
    }
  });

  it("edge case: .txt files do not increment count", async () => {
    await write("knowledge/accessibility/note.txt", "text");
    await write("knowledge/accessibility/doc.md", "# Doc");

    const execute = await importFresh();
    const result = await execute();

    const acc = result.find((r) => r.domain === "accessibility");
    expect(acc?.count).toBe(1);
  });

  it("edge case: subdir .md files NOT counted (recursive: false)", async () => {
    await write("knowledge/accessibility/top.md", "# Top");
    await write("knowledge/accessibility/sub/nested.md", "# Nested");

    const execute = await importFresh();
    const result = await execute();

    const acc = result.find((r) => r.domain === "accessibility");
    expect(acc?.count).toBe(1);
  });

  it("edge case: empty domain dir → count is 0", async () => {
    // Create domain dir but no files
    await fs.mkdir(path.join(tmpDir, "knowledge", "crypto-trading"), { recursive: true });

    const execute = await importFresh();
    const result = await execute();

    const ct = result.find((r) => r.domain === "crypto-trading");
    expect(ct?.count).toBe(0);
  });

  it("order matches KNOWLEDGE_DOMAINS exactly", async () => {
    const execute = await importFresh();
    const result = await execute();

    const resultDomains = result.map((r) => r.domain);
    expect(resultDomains).toEqual([...KNOWLEDGE_DOMAINS]);
  });

  it("boundary: 100 files in one domain → count === 100", async () => {
    for (let i = 0; i < 100; i++) {
      await write(`knowledge/react-patterns/file-${String(i).padStart(3, "0")}.md`, `# File ${i}`);
    }

    const execute = await importFresh();
    const result = await execute();

    const rp = result.find((r) => r.domain === "react-patterns");
    expect(rp?.count).toBe(100);
  });

  it("boundary: .md file without frontmatter still counts", async () => {
    await write("knowledge/game-engine/no-fm.md", "just body text, no frontmatter");

    const execute = await importFresh();
    const result = await execute();

    const ge = result.find((r) => r.domain === "game-engine");
    expect(ge?.count).toBe(1);
  });

  it("returns exactly 4 entries regardless of domain filesystem state", async () => {
    // Mix: some dirs exist, some don't
    await write("knowledge/accessibility/x.md", "# X");

    const execute = await importFresh();
    const result = await execute();

    expect(result).toHaveLength(4);
    expect(result.every((r) => typeof r.count === "number")).toBe(true);
  });
});
