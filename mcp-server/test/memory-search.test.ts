import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  spyOn,
} from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execute } from "../src/tools/memory-search";

let tmpRoot: string;
let agentLearningsPath: string;
const ENV_KEY = "SECOND_BRAIN_ROOT";
let originalEnv: string | undefined;

async function writeFixture(
  filename: string,
  content: string
): Promise<void> {
  await fs.writeFile(path.join(agentLearningsPath, filename), content, "utf8");
}

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mem-search-"));
  agentLearningsPath = path.join(tmpRoot, "memory", "agent-learnings");
  await fs.mkdir(agentLearningsPath, { recursive: true });
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
  it("returns hits sorted desc by score", async () => {
    await writeFixture(
      "architect.md",
      "# Architect\nwave one wave two\n"
    );
    await writeFixture(
      "developer.md",
      "# Developer\nwave wave wave wave wave\n"
    );
    await writeFixture("qa.md", "# QA\nwave\n");

    const hits = await execute({ query: "wave" });

    expect(hits).toHaveLength(3);
    expect(hits[0].file).toBe("developer.md");
    expect(hits[0].score).toBe(5);
    expect(hits[0].role).toBe("developer");
    expect(hits[0].snippet).not.toBe("");

    expect(hits[1].file).toBe("architect.md");
    expect(hits[1].score).toBe(2);
    expect(hits[1].role).toBe("architect");

    expect(hits[2].file).toBe("qa.md");
    expect(hits[2].score).toBe(1);
    expect(hits[2].role).toBe("qa");
  });

  it("each hit has non-empty file, snippet, and numeric score", async () => {
    await writeFixture("architect.md", "learn learn learn\n");

    const hits = await execute({ query: "learn" });

    expect(hits).toHaveLength(1);
    expect(typeof hits[0].file).toBe("string");
    expect(hits[0].file.length).toBeGreaterThan(0);
    expect(typeof hits[0].snippet).toBe("string");
    expect(hits[0].snippet.length).toBeGreaterThan(0);
    expect(typeof hits[0].score).toBe("number");
    expect(hits[0].score).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("query is case-insensitive: WAVE matches same as wave", async () => {
    await writeFixture("architect.md", "wave one wave two\n");
    await writeFixture("developer.md", "wave wave wave wave wave\n");
    await writeFixture("qa.md", "wave\n");

    const hitsLower = await execute({ query: "wave" });
    const hitsUpper = await execute({ query: "WAVE" });

    expect(hitsUpper.map((h) => h.file)).toEqual(hitsLower.map((h) => h.file));
    expect(hitsUpper.map((h) => h.score)).toEqual(
      hitsLower.map((h) => h.score)
    );
  });

  it("no matches returns empty array", async () => {
    await writeFixture("architect.md", "hello world\n");

    const hits = await execute({ query: "xyz-unmatched" });

    expect(hits).toEqual([]);
  });

  it("project filter: only returns files whose frontmatter includes the project", async () => {
    await writeFixture(
      "fileA.md",
      "---\nprojects:\n  - claude-didio-config\n---\n\nfoo bar foo\n"
    );
    await writeFixture("fileB.md", "foo bar foo\n");

    const hits = await execute({
      query: "foo",
      project: "claude-didio-config",
    });

    expect(hits).toHaveLength(1);
    expect(hits[0].file).toBe("fileA.md");
  });

  it("file without frontmatter is excluded when project is provided", async () => {
    await writeFixture("no-frontmatter.md", "foo foo foo\n");

    const hits = await execute({ query: "foo", project: "some-project" });

    expect(hits).toEqual([]);
  });

  it("limit: 1 with 3 valid hits returns only 1", async () => {
    await writeFixture("a.md", "foo foo\n");
    await writeFixture("b.md", "foo foo foo\n");
    await writeFixture("c.md", "foo\n");

    const hits = await execute({ query: "foo", limit: 1 });

    expect(hits).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Error scenarios
// ---------------------------------------------------------------------------

describe("error scenarios", () => {
  it("empty query throws with /non-empty/ message", async () => {
    await expect(execute({ query: "" })).rejects.toThrow(/non-empty/);
  });

  it("whitespace-only query throws with /non-empty/ message", async () => {
    await expect(execute({ query: "   " })).rejects.toThrow(/non-empty/);
  });

  it("missing agent-learnings dir returns empty array without throwing", async () => {
    await fs.rm(agentLearningsPath, { recursive: true });

    const hits = await execute({ query: "anything" });

    expect(hits).toEqual([]);
  });

  it("binary/unreadable file: logs to stderr and returns hits from valid files", async () => {
    await writeFixture("good.md", "important important\n");
    // Write binary bytes that will cause parseFrontmatter to throw or produce
    // invalid content; the implementation must not abort processing other files
    await fs.writeFile(
      path.join(agentLearningsPath, "bad.md"),
      Buffer.from([0xff, 0xfe, 0xfd])
    );

    // Silence stderr noise during test
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});

    try {
      const hits = await execute({ query: "important" });

      // Valid file hits must still be returned
      expect(hits.some((h) => h.file === "good.md")).toBe(true);
      // Function must not throw
    } finally {
      errorSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// Boundary values
// ---------------------------------------------------------------------------

describe("boundary values", () => {
  it("limit: 0 throws with />= 1/ message", async () => {
    await expect(execute({ query: "foo", limit: 0 })).rejects.toThrow(/>=\s*1/);
  });

  it("limit: 9999 clamps to 100", async () => {
    // Create 101 fixture files each with one match
    for (let i = 0; i < 101; i++) {
      await writeFixture(`file${String(i).padStart(3, "0")}.md`, "matchword\n");
    }

    const hits = await execute({ query: "matchword", limit: 9999 });

    expect(hits.length).toBe(100);
  });

  it("query with regex metacharacters matches literally: 'a.b'", async () => {
    await writeFixture("meta.md", "this is a.b pattern here\n");
    await writeFixture("false-positive.md", "aXb would match a regex dot\n");

    const hits = await execute({ query: "a.b" });

    expect(hits.some((h) => h.file === "meta.md")).toBe(true);
    expect(hits.some((h) => h.file === "false-positive.md")).toBe(false);
  });

  it("query with 'a+b' metacharacters matches literally", async () => {
    await writeFixture("plusfile.md", "result a+b is correct\n");
    await writeFixture("no-match.md", "aab or aaab should not match\n");

    const hits = await execute({ query: "a+b" });

    expect(hits.some((h) => h.file === "plusfile.md")).toBe(true);
    expect(hits.some((h) => h.file === "no-match.md")).toBe(false);
  });

  it("101 fixtures with default limit returns 20", async () => {
    for (let i = 0; i < 101; i++) {
      await writeFixture(`item${String(i).padStart(3, "0")}.md`, "keyword\n");
    }

    const hits = await execute({ query: "keyword" });

    expect(hits.length).toBe(20);
  });

  it("101 fixtures with limit 150 returns 100", async () => {
    for (let i = 0; i < 101; i++) {
      await writeFixture(`item${String(i).padStart(3, "0")}.md`, "keyword\n");
    }

    const hits = await execute({ query: "keyword", limit: 150 });

    expect(hits.length).toBe(100);
  });

  it("tie-break by file name ascending when scores are equal", async () => {
    await writeFixture("zzz.md", "tie\n");
    await writeFixture("aaa.md", "tie\n");
    await writeFixture("mmm.md", "tie\n");

    const hits = await execute({ query: "tie" });

    expect(hits.map((h) => h.file)).toEqual(["aaa.md", "mmm.md", "zzz.md"]);
  });

  it("files in subdirs get role: null", async () => {
    const subdir = path.join(agentLearningsPath, "custom");
    await fs.mkdir(subdir);
    await fs.writeFile(
      path.join(subdir, "architect.md"),
      "subdir content match here\n",
      "utf8"
    );

    const hits = await execute({ query: "match" });

    const hit = hits.find((h) => h.file.includes("architect.md"));
    expect(hit).toBeDefined();
    expect(hit!.role).toBeNull();
  });

  it("snippet includes context lines around match", async () => {
    await writeFixture(
      "ctx.md",
      "line before\nthe target word here\nline after\n"
    );

    const hits = await execute({ query: "target" });

    expect(hits[0].snippet).toContain("line before");
    expect(hits[0].snippet).toContain("target");
    expect(hits[0].snippet).toContain("line after");
  });

  it("snippet respects array bounds when match is on first line", async () => {
    await writeFixture("first.md", "target is on first line\nsecond line\n");

    const hits = await execute({ query: "target" });

    expect(hits[0].snippet).toContain("target");
    // Should not throw or include negative-index garbage
    expect(typeof hits[0].snippet).toBe("string");
  });
});
