import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execute } from "../src/tools/adr-get.ts";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "adr-get-"));
  await fs.mkdir(path.join(tmpDir, "docs", "adr"), { recursive: true });
  process.env.SECOND_BRAIN_ROOT = tmpDir;
});

afterEach(async () => {
  delete process.env.SECOND_BRAIN_ROOT;
  await fs.rm(tmpDir, { recursive: true });
});

async function writeAdr(filename: string, content: string): Promise<void> {
  await fs.writeFile(path.join(tmpDir, "docs", "adr", filename), content, "utf8");
}

describe("adr.get — happy path", () => {
  it("returns AdrFull with correct fields for id:7", async () => {
    await writeAdr(
      "0007-knowledge-patterns-format.md",
      "# ADR-0007: Knowledge Patterns Format\n\n**Status:** accepted\n**Date:** 2026-04-01\n\nBody content here."
    );

    const result = await execute({ id: 7 });

    expect(result.id).toBe(7);
    expect(result.file).toBe("0007-knowledge-patterns-format.md");
    expect(result.title).toBe("ADR-0007: Knowledge Patterns Format");
    expect(result.status).toBe("accepted");
    expect(result.date).toBe("2026-04-01");
    expect(result.content).toContain("# ADR-0007: Knowledge Patterns Format");
  });

  it("returns AdrFull including all required fields", async () => {
    await writeAdr("0001-first.md", "---\nproject: second-brain\n---\n\n# ADR-0001: First\n\n**Status:** proposed\n\nbody");

    const result = await execute({ id: 1 });

    expect(result.id).toBe(1);
    expect(result.file).toBe("0001-first.md");
    expect(result.title).toBe("ADR-0001: First");
    expect(result.project).toBe("second-brain");
    expect(result.status).toBe("proposed");
    expect(typeof result.content).toBe("string");
    expect(typeof result.frontmatter).toBe("object");
  });
});

describe("adr.get — edge cases", () => {
  it("id:1 picks 0001-xxx.md", async () => {
    await writeAdr("0001-edge.md", "# ADR-0001: Edge\n\n**Status:** accepted\n\nbody");
    const result = await execute({ id: 1 });
    expect(result.id).toBe(1);
    expect(result.file).toBe("0001-edge.md");
  });

  it("frontmatter status takes precedence over body status", async () => {
    await writeAdr(
      "0003-precedence.md",
      "---\nstatus: proposed\n---\n\n# ADR-0003: Precedence\n\n**Status:** accepted\n\nbody"
    );
    const result = await execute({ id: 3 });
    expect(result.status).toBe("proposed");
  });

  it("ADR without title heading uses basename without .md", async () => {
    await writeAdr("0002-noheading.md", "**Status:** accepted\n\nbody without heading");
    const result = await execute({ id: 2 });
    expect(result.title).toBe("0002-noheading");
  });

  it("defaults status to 'proposed' and logs when unrecognized", async () => {
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    try {
      await writeAdr("0004-unknown.md", "# ADR-0004: Unknown\n\nbody with no status");
      const result = await execute({ id: 4 });
      expect(result.status).toBe("proposed");
      expect(consoleSpy).toHaveBeenCalled();
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("id:10000 generates prefix '10000-' (padStart no-op for 5-digit ids)", async () => {
    await writeAdr("10000-large.md", "# ADR-10000: Large\n\n**Status:** accepted\n\nbody");
    const result = await execute({ id: 10000 });
    expect(result.file).toBe("10000-large.md");
  });
});

describe("adr.get — error scenarios", () => {
  it("id:0 throws >= 1", async () => {
    await expect(execute({ id: 0 })).rejects.toThrow(/>=\s*1/);
  });

  it("id:-5 throws", async () => {
    await expect(execute({ id: -5 })).rejects.toThrow(/>=\s*1/);
  });

  it("id:1.2 throws (non-integer)", async () => {
    await expect(execute({ id: 1.2 })).rejects.toThrow(/>=\s*1/);
  });

  it("id:99 not found throws /ADR not found/", async () => {
    await expect(execute({ id: 99 })).rejects.toThrow(/ADR not found/);
  });

  it("docs/adr/ directory does not exist throws /ADR not found/", async () => {
    await fs.rm(path.join(tmpDir, "docs", "adr"), { recursive: true });
    await expect(execute({ id: 1 })).rejects.toThrow(/ADR not found/);
  });
});

describe("adr.get — boundary values", () => {
  it("date is null when no date in frontmatter or body", async () => {
    await writeAdr("0005-nodate.md", "# ADR-0005: No Date\n\n**Status:** accepted\n\nbody");
    const result = await execute({ id: 5 });
    expect(result.date).toBeNull();
  });

  it("project is null when no project field in frontmatter", async () => {
    await writeAdr("0006-noproj.md", "# ADR-0006: No Project\n\n**Status:** accepted\n\nbody");
    const result = await execute({ id: 6 });
    expect(result.project).toBeNull();
  });

  it("reads date from body when no frontmatter date", async () => {
    await writeAdr("0008-bodydate.md", "# ADR-0008: Body Date\n\n**Status:** accepted\n**Date:** 2026-03-15\n\nbody");
    const result = await execute({ id: 8 });
    expect(result.date).toBe("2026-03-15");
  });

  it("content includes full body (headings + body text)", async () => {
    const body = "# ADR-0009: Full Content\n\n**Status:** accepted\n\nParagraph one.\n\n## Section\n\nParagraph two.";
    await writeAdr("0009-full.md", body);
    const result = await execute({ id: 9 });
    expect(result.content).toContain("# ADR-0009: Full Content");
    expect(result.content).toContain("Paragraph two.");
  });
});
