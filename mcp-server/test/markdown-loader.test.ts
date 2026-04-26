import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadMarkdownDir, extractTitle } from "../src/lib/markdown-loader.ts";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "md-loader-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true });
});

async function write(relPath: string, content: string): Promise<void> {
  const abs = path.join(tmpDir, relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
}

describe("loadMarkdownDir", () => {
  it("happy path: 3 md files with frontmatter, returned sorted alphabetically", async () => {
    await write("c.md", "---\ntitle: C\n---\n\nbody c");
    await write("a.md", "---\ntitle: A\n---\n\nbody a");
    await write("b.md", "---\ntitle: B\n---\n\nbody b");

    const results = await loadMarkdownDir(tmpDir);
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.file)).toEqual(["a.md", "b.md", "c.md"]);
    expect(results[0].frontmatter).toEqual({ title: "A" });
    expect(results[0].body).toBe("body a");
    expect(results[0].absPath).toBe(path.join(tmpDir, "a.md"));
  });

  it("edge case recursive: file in subdir appears with relative path", async () => {
    await write("subdir/foo.md", "# Foo\n\nbody");

    const results = await loadMarkdownDir(tmpDir);
    expect(results).toHaveLength(1);
    expect(results[0].file).toBe("subdir/foo.md");
  });

  it("edge case recursive false: file in subdir NOT returned", async () => {
    await write("top.md", "# Top");
    await write("subdir/nested.md", "# Nested");

    const results = await loadMarkdownDir(tmpDir, { recursive: false });
    expect(results).toHaveLength(1);
    expect(results[0].file).toBe("top.md");
  });

  it("edge case: file without frontmatter has empty frontmatter and body includes heading", async () => {
    await write("no-fm.md", "# Heading\n\nsome body");

    const results = await loadMarkdownDir(tmpDir);
    expect(results).toHaveLength(1);
    expect(results[0].frontmatter).toEqual({});
    expect(results[0].body).toContain("# Heading");
  });

  it("edge case: .txt files are ignored by default", async () => {
    await write("note.txt", "text file");
    await write("doc.md", "# Doc");

    const results = await loadMarkdownDir(tmpDir);
    expect(results).toHaveLength(1);
    expect(results[0].file).toBe("doc.md");
  });

  it("edge case: custom extensions filter respected", async () => {
    await write("file.md", "# Md");
    await write("file.txt", "txt");
    await write("file.yaml", "key: val");

    const results = await loadMarkdownDir(tmpDir, { extensions: [".txt", ".yaml"] });
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.file).sort()).toEqual(["file.txt", "file.yaml"]);
  });

  it("error scenario: nonexistent directory returns [] without throwing", async () => {
    const results = await loadMarkdownDir("/nonexistent/path/that/does/not/exist");
    expect(results).toEqual([]);
  });

  it("error scenario: binary file logs error, valid files still returned", async () => {
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    try {
      await write("valid.md", "---\ntitle: Valid\n---\n\nbody");
      const binaryPath = path.join(tmpDir, "binary.md");
      await fs.writeFile(binaryPath, Buffer.from([0xff, 0xfe, 0xfd, 0x00, 0x01]));

      const results = await loadMarkdownDir(tmpDir);
      expect(results.some((r) => r.file === "valid.md")).toBe(true);
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("boundary: empty directory returns []", async () => {
    const results = await loadMarkdownDir(tmpDir);
    expect(results).toEqual([]);
  });

  it("boundary: file with empty frontmatter (---\\n---\\n\\nbody)", async () => {
    await write("empty-fm.md", "---\n---\n\nbody content");

    const results = await loadMarkdownDir(tmpDir);
    expect(results).toHaveLength(1);
    expect(results[0].frontmatter).toEqual({});
    expect(results[0].body).toBe("body content");
  });

  it("boundary: 50+ files all returned without internal limit", async () => {
    for (let i = 0; i < 55; i++) {
      await write(`file-${String(i).padStart(3, "0")}.md`, `# File ${i}`);
    }
    const results = await loadMarkdownDir(tmpDir);
    expect(results).toHaveLength(55);
  });
});

describe("extractTitle", () => {
  it("extracts title from heading", () => {
    expect(extractTitle("# Hello\nbody")).toBe("Hello");
  });

  it("returns null when no heading", () => {
    expect(extractTitle("just a body\nno heading")).toBeNull();
  });

  it("finds heading after blank line", () => {
    expect(extractTitle("\n\n# Later Heading\nbody")).toBe("Later Heading");
  });

  it("trims trailing whitespace from title", () => {
    expect(extractTitle("# Title   \nbody")).toBe("Title");
  });

  it("only matches h1 not h2+", () => {
    expect(extractTitle("## Not h1\nbody")).toBeNull();
  });
});
