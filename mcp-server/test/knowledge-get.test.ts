import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execute } from "../src/tools/knowledge-get";

const ENV_KEY = "SECOND_BRAIN_ROOT";
let tmpRoot: string;
let accessibilityDir: string;
let originalEnv: string | undefined;

async function writeFixture(
  domain: string,
  filename: string,
  content: string
): Promise<void> {
  const dir = path.join(tmpRoot, "knowledge", domain);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), content, "utf8");
}

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "knowledge-get-"));
  accessibilityDir = path.join(tmpRoot, "knowledge", "accessibility");
  await fs.mkdir(accessibilityDir, { recursive: true });
  originalEnv = process.env[ENV_KEY];
  process.env[ENV_KEY] = tmpRoot;
});

afterEach(async () => {
  if (originalEnv === undefined) {
    delete process.env[ENV_KEY];
  } else {
    process.env[ENV_KEY] = originalEnv;
  }
  await fs.rm(tmpRoot, { recursive: true });
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("happy path", () => {
  it("returns article with title from heading, frontmatter, and content", async () => {
    await writeFixture(
      "accessibility",
      "aria-live.md",
      "---\ndomain: accessibility\ntags:\n  - aria\n---\n# ARIA Live Regions\n\nContent here.\n"
    );

    const results = await execute({ domain: "accessibility" });

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("ARIA Live Regions");
    expect(results[0].frontmatter).toMatchObject({ domain: "accessibility" });
    expect(results[0].content).toContain("# ARIA Live Regions");
    expect(results[0].file).toBe("aria-live.md");
  });

  it("content does not include frontmatter block", async () => {
    await writeFixture(
      "accessibility",
      "article.md",
      "---\nkey: value\n---\n# Title\n\nBody text.\n"
    );

    const results = await execute({ domain: "accessibility" });

    expect(results[0].content).not.toContain("---");
    expect(results[0].content).not.toContain("key: value");
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("3 files returned in ASC order by file name", async () => {
    await writeFixture("accessibility", "zzz.md", "# ZZZ\n");
    await writeFixture("accessibility", "aaa.md", "# AAA\n");
    await writeFixture("accessibility", "mmm.md", "# MMM\n");

    const results = await execute({ domain: "accessibility" });

    expect(results.map((r) => r.file)).toEqual(["aaa.md", "mmm.md", "zzz.md"]);
  });

  it("file without heading: title falls back to basename without extension", async () => {
    await writeFixture("accessibility", "no-heading.md", "Just some text without a heading.\n");

    const results = await execute({ domain: "accessibility" });

    expect(results[0].title).toBe("no-heading");
  });

  it("file without frontmatter: frontmatter is empty object", async () => {
    await writeFixture("accessibility", "bare.md", "# Bare Article\n\nNo frontmatter here.\n");

    const results = await execute({ domain: "accessibility" });

    expect(results[0].frontmatter).toEqual({});
  });

  it("recursive: false — file in subdir is not included", async () => {
    await writeFixture("accessibility", "top.md", "# Top\n");
    const subdir = path.join(accessibilityDir, "sub");
    await fs.mkdir(subdir, { recursive: true });
    await fs.writeFile(path.join(subdir, "x.md"), "# Sub\n", "utf8");

    const results = await execute({ domain: "accessibility" });

    expect(results).toHaveLength(1);
    expect(results[0].file).toBe("top.md");
  });
});

// ---------------------------------------------------------------------------
// Error scenarios
// ---------------------------------------------------------------------------

describe("error scenarios", () => {
  it("invalid domain throws with /invalid domain/ and lists valid domains", async () => {
    await expect(
      // @ts-expect-error — intentional invalid domain
      execute({ domain: "foo" })
    ).rejects.toThrow(/invalid domain/);
  });

  it("invalid domain error message lists all 4 valid domains", async () => {
    let caught: Error | undefined;
    try {
      // @ts-expect-error — intentional invalid domain
      await execute({ domain: "foo" });
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toContain("accessibility");
    expect(caught!.message).toContain("crypto-trading");
    expect(caught!.message).toContain("game-engine");
    expect(caught!.message).toContain("react-patterns");
  });

  it("empty string domain throws", async () => {
    await expect(
      // @ts-expect-error — intentional invalid domain
      execute({ domain: "" })
    ).rejects.toThrow(/invalid domain/);
  });
});

// ---------------------------------------------------------------------------
// Boundary values
// ---------------------------------------------------------------------------

describe("boundary values", () => {
  it("valid domain with no files returns empty array", async () => {
    // accessibilityDir already created but empty
    const results = await execute({ domain: "accessibility" });
    expect(results).toEqual([]);
  });

  it("domain folder does not exist on disk returns empty array", async () => {
    // Use a domain that was never created in tmpRoot
    await fs.rm(accessibilityDir, { recursive: true });

    const results = await execute({ domain: "accessibility" });

    expect(results).toEqual([]);
  });

  it("file with body exactly '# Title\\n': title is 'Title' and content is '# Title\\n'", async () => {
    await writeFixture("accessibility", "minimal.md", "# Title\n");

    const results = await execute({ domain: "accessibility" });

    expect(results[0].title).toBe("Title");
    expect(results[0].content).toBe("# Title\n");
  });

  it("other valid domains are accepted without throwing", async () => {
    await fs.mkdir(path.join(tmpRoot, "knowledge", "crypto-trading"), { recursive: true });
    await fs.mkdir(path.join(tmpRoot, "knowledge", "game-engine"), { recursive: true });
    await fs.mkdir(path.join(tmpRoot, "knowledge", "react-patterns"), { recursive: true });

    await expect(execute({ domain: "crypto-trading" })).resolves.toEqual([]);
    await expect(execute({ domain: "game-engine" })).resolves.toEqual([]);
    await expect(execute({ domain: "react-patterns" })).resolves.toEqual([]);
  });
});
