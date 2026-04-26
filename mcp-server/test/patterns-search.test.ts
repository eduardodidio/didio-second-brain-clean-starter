import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execute } from "../src/tools/patterns-search.ts";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "patterns-search-"));
  process.env.SECOND_BRAIN_ROOT = tmpDir;
});

afterEach(async () => {
  delete process.env.SECOND_BRAIN_ROOT;
  await fs.rm(tmpDir, { recursive: true });
});

async function write(relPath: string, content: string): Promise<void> {
  const abs = path.join(tmpDir, relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
}

// ─── Happy path ───────────────────────────────────────────────────────────────

describe("happy path", () => {
  it("no filters: returns all valid .md patterns sorted by (type, name)", async () => {
    await write(
      "patterns/agents/foo.md",
      "---\ntags: []\n---\n\nagent body"
    );
    await write(
      "patterns/snippets/bar.md",
      "---\ntags: []\n---\n\nsnippet body"
    );

    const hits = await execute({});
    expect(hits).toHaveLength(2);
    expect(hits[0].type).toBe("agent");
    expect(hits[0].name).toBe("foo");
    expect(hits[1].type).toBe("snippet");
    expect(hits[1].name).toBe("bar");
  });

  it("each hit has file, type, name, frontmatter, snippet fields", async () => {
    await write(
      "patterns/agents/foo.md",
      "---\nauthor: alice\n---\n\nline1\nline2\nline3\nline4"
    );

    const hits = await execute({});
    expect(hits).toHaveLength(1);
    const hit = hits[0];
    expect(hit.file).toBe("agents/foo.md");
    expect(hit.type).toBe("agent");
    expect(hit.name).toBe("foo");
    expect(hit.frontmatter).toEqual({ author: "alice" });
    expect(hit.snippet).toBe("line1\nline2\nline3");
  });

  it("snippet is first 3 non-empty lines of body", async () => {
    await write(
      "patterns/snippets/s.md",
      "---\n---\n\nfirst\nsecond\nthird\nfourth"
    );
    const hits = await execute({});
    expect(hits[0].snippet).toBe("first\nsecond\nthird");
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("filter by type: only agents returned", async () => {
    await write("patterns/agents/foo.md", "agent body");
    await write("patterns/snippets/bar.md", "snippet body");

    const hits = await execute({ type: "agent" });
    expect(hits).toHaveLength(1);
    expect(hits[0].type).toBe("agent");
    expect(hits[0].name).toBe("foo");
  });

  it("filter by tags: only entries with that tag", async () => {
    await write(
      "patterns/agents/foo.md",
      "---\ntags:\n  - accessibility\n---\n\nbody"
    );
    await write(
      "patterns/snippets/bar.md",
      "---\ntags:\n  - other\n---\n\nbody"
    );

    const hits = await execute({ tags: ["accessibility"] });
    expect(hits).toHaveLength(1);
    expect(hits[0].name).toBe("foo");
  });

  it("filter by multiple tags: AND logic — entry must have all tags", async () => {
    await write(
      "patterns/agents/both.md",
      "---\ntags:\n  - a\n  - b\n---\n\nbody"
    );
    await write(
      "patterns/agents/onlya.md",
      "---\ntags:\n  - a\n---\n\nbody"
    );

    const hits = await execute({ tags: ["a", "b"] });
    expect(hits).toHaveLength(1);
    expect(hits[0].name).toBe("both");
  });

  it("query is case-insensitive and matches body", async () => {
    await write("patterns/snippets/s.md", "---\n---\n\nThis is SPECIAL content");

    const hits = await execute({ query: "special" });
    expect(hits).toHaveLength(1);
    expect(hits[0].name).toBe("s");
  });

  it("hook in subdir: name = subdir name, type = hook", async () => {
    await write(
      "patterns/hooks/stop-session-summary/README.md",
      "---\ntags: []\n---\n\nhook body"
    );

    const hits = await execute({});
    expect(hits).toHaveLength(1);
    expect(hits[0].type).toBe("hook");
    expect(hits[0].name).toBe("stop-session-summary");
    expect(hits[0].file).toBe("hooks/stop-session-summary/README.md");
  });

  it("patterns/README.md at root is discarded", async () => {
    await write("patterns/README.md", "# Patterns root");
    await write("patterns/agents/foo.md", "body");

    const hits = await execute({});
    expect(hits).toHaveLength(1);
    expect(hits[0].type).toBe("agent");
  });

  it("combined filters (type + tags + query) apply as AND", async () => {
    await write(
      "patterns/agents/match.md",
      "---\ntags:\n  - accessibility\n---\n\nspecial agent"
    );
    await write(
      "patterns/agents/no-tag.md",
      "---\ntags: []\n---\n\nspecial agent"
    );
    await write(
      "patterns/skills/skill.md",
      "---\ntags:\n  - accessibility\n---\n\nspecial skill"
    );

    const hits = await execute({ type: "agent", tags: ["accessibility"], query: "special" });
    expect(hits).toHaveLength(1);
    expect(hits[0].name).toBe("match");
  });
});

// ─── Error scenarios ──────────────────────────────────────────────────────────

describe("error scenarios", () => {
  it("invalid type throws with list of valid values", async () => {
    await expect(execute({ type: "invalid" as never })).rejects.toThrow(
      /agent.*skill.*hook.*snippet/
    );
  });

  it("tags non-array throws", async () => {
    await expect(execute({ tags: "oi" as never })).rejects.toThrow(/tags must be/);
  });

  it("patterns dir nonexistent returns []", async () => {
    // tmpDir has no patterns/ subdir
    const hits = await execute({});
    expect(hits).toEqual([]);
  });
});

// ─── Boundary values ─────────────────────────────────────────────────────────

describe("boundary values", () => {
  it("query empty string: treated as no filter — returns all", async () => {
    await write("patterns/agents/foo.md", "body");
    await write("patterns/snippets/bar.md", "body");

    const hits = await execute({ query: "" });
    expect(hits).toHaveLength(2);
  });

  it("tags empty array: treated as no filter — returns all", async () => {
    await write("patterns/agents/foo.md", "---\ntags: []\n---\nbody");
    await write("patterns/snippets/bar.md", "body");

    const hits = await execute({ tags: [] });
    expect(hits).toHaveLength(2);
  });

  it("dedup: two .md in same hook subdir — only first (alphabetically) appears", async () => {
    await write(
      "patterns/hooks/my-hook/README.md",
      "---\n---\n\nREADME body"
    );
    await write(
      "patterns/hooks/my-hook/another.md",
      "---\n---\n\nanother body"
    );

    const hits = await execute({});
    expect(hits).toHaveLength(1);
    expect(hits[0].name).toBe("my-hook");
    // another.md sorts before README.md alphabetically; it is kept
    expect(hits[0].file).toBe("hooks/my-hook/another.md");
  });

  it("no valid patterns on disk returns []", async () => {
    await write("patterns/README.md", "# root readme only");

    const hits = await execute({});
    expect(hits).toEqual([]);
  });

  it("entry without tags field filtered out when tags filter is active", async () => {
    await write("patterns/agents/no-tags.md", "---\n---\n\nbody");

    const hits = await execute({ tags: ["x"] });
    expect(hits).toHaveLength(0);
  });

  it("entry with non-array tags filtered out when tags filter is active", async () => {
    await write("patterns/agents/str-tags.md", "---\ntags: hello\n---\n\nbody");

    const hits = await execute({ tags: ["hello"] });
    expect(hits).toHaveLength(0);
  });
});
