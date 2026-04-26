import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execute } from "../src/tools/adr-list.ts";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "adr-list-"));
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

describe("adr.list — happy path", () => {
  it("returns all 3 ADRs in id ascending order (body-status)", async () => {
    await writeAdr("0001-foo.md", "# ADR-0001: Foo\n\n**Status:** accepted\n**Date:** 2026-01-01\n\nbody foo");
    await writeAdr("0002-bar.md", "# ADR-0002: Bar\n\n**Status:** accepted\n**Date:** 2026-01-02\n\nbody bar");
    await writeAdr("0003-baz.md", "# ADR-0003: Baz\n\n**Status:** accepted\n**Date:** 2026-01-03\n\nbody baz");

    const result = await execute();
    expect(result).toHaveLength(3);
    expect(result.map((a) => a.id)).toEqual([1, 2, 3]);
    expect(result[0].title).toBe("ADR-0001: Foo");
    expect(result[0].status).toBe("accepted");
    expect(result[0].date).toBe("2026-01-01");
    expect(result[0].file).toBe("0001-foo.md");
  });

  it("returns ADRs with frontmatter status", async () => {
    await writeAdr("0001-fm.md", "---\nstatus: accepted\ndate: 2026-02-01\n---\n\n# ADR-0001: FM\n\nbody");
    const result = await execute();
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("accepted");
    expect(result[0].date).toBe("2026-02-01");
  });
});

describe("adr.list — edge cases", () => {
  it("ignores 0000-template.md (id === 0)", async () => {
    await writeAdr("0000-template.md", "# Template\n\n**Status:** accepted\n\nbody");
    await writeAdr("0001-real.md", "# ADR-0001: Real\n\n**Status:** accepted\n\nbody");

    const result = await execute();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it("ignores files without NNNN- prefix (e.g. README.md)", async () => {
    await writeAdr("README.md", "# ADR Index\n\nsome content");
    await writeAdr("0001-real.md", "# ADR-0001: Real\n\n**Status:** accepted\n\nbody");

    const result = await execute();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it("reads status from frontmatter when present", async () => {
    await writeAdr("0001-fm.md", "---\nstatus: proposed\n---\n\n# ADR-0001: FM\n\nbody");
    const result = await execute();
    expect(result[0].status).toBe("proposed");
  });

  it("reads status from body **Status:** when no frontmatter", async () => {
    await writeAdr("0001-body.md", "# ADR-0001: Body\n\n**Status:** accepted\n\nbody");
    const result = await execute();
    expect(result[0].status).toBe("accepted");
  });

  it("defaults to 'proposed' and logs error when no status identifiable", async () => {
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    try {
      await writeAdr("0001-nostatus.md", "# ADR-0001: No Status\n\njust body with no status line");
      const result = await execute();
      expect(result[0].status).toBe("proposed");
      expect(consoleSpy).toHaveBeenCalled();
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("filter {status:'accepted'} removes non-accepted ADRs", async () => {
    await writeAdr("0001-a.md", "# ADR-0001: A\n\n**Status:** accepted\n\nbody");
    await writeAdr("0002-b.md", "# ADR-0002: B\n\n**Status:** proposed\n\nbody");
    await writeAdr("0003-c.md", "# ADR-0003: C\n\n**Status:** superseded\n\nbody");

    const result = await execute({ status: "accepted" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it("filter {project:'x'} keeps only ADRs with frontmatter project: x", async () => {
    await writeAdr("0001-x.md", "---\nstatus: accepted\nproject: x\n---\n\n# ADR-0001: X\n\nbody");
    await writeAdr("0002-y.md", "---\nstatus: accepted\nproject: y\n---\n\n# ADR-0002: Y\n\nbody");
    await writeAdr("0003-none.md", "# ADR-0003: None\n\n**Status:** accepted\n\nbody");

    const result = await execute({ project: "x" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it("both filters work as AND", async () => {
    await writeAdr("0001-xa.md", "---\nstatus: accepted\nproject: x\n---\n\n# ADR-0001\n\nbody");
    await writeAdr("0002-xp.md", "---\nstatus: proposed\nproject: x\n---\n\n# ADR-0002\n\nbody");
    await writeAdr("0003-ya.md", "---\nstatus: accepted\nproject: y\n---\n\n# ADR-0003\n\nbody");

    const result = await execute({ project: "x", status: "accepted" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });
});

describe("adr.list — error scenarios", () => {
  it("throws when status filter is invalid", async () => {
    await expect(execute({ status: "foo" as never })).rejects.toThrow(/Invalid status/);
  });

  it("returns [] when docs/adr/ does not exist", async () => {
    await fs.rm(path.join(tmpDir, "docs", "adr"), { recursive: true });
    const result = await execute();
    expect(result).toEqual([]);
  });
});

describe("adr.list — boundary values", () => {
  it("ADR 0042-xxx.md has id 42", async () => {
    await writeAdr("0042-something.md", "# ADR-0042: Something\n\n**Status:** accepted\n\nbody");
    const result = await execute();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(42);
  });

  it("20 ADRs are all returned with no limit", async () => {
    for (let i = 1; i <= 20; i++) {
      const padded = String(i).padStart(4, "0");
      await writeAdr(`${padded}-adr-${i}.md`, `# ADR-${padded}: ADR ${i}\n\n**Status:** accepted\n\nbody`);
    }
    const result = await execute();
    expect(result).toHaveLength(20);
    expect(result[0].id).toBe(1);
    expect(result[19].id).toBe(20);
  });

  it("ADR with multi-line body captures first # Heading as title", async () => {
    await writeAdr("0001-multi.md", "# ADR-0001: First Heading\n\nSome other heading:\n## Section\n\n**Status:** accepted");
    const result = await execute();
    expect(result[0].title).toBe("ADR-0001: First Heading");
  });

  it("ADR without any heading falls back to basename without .md", async () => {
    await writeAdr("0001-noheading.md", "**Status:** accepted\n\nbody without heading");
    const result = await execute();
    expect(result[0].title).toBe("0001-noheading");
  });

  it("date is null when neither frontmatter nor body has a date", async () => {
    await writeAdr("0001-nodate.md", "# ADR-0001: No Date\n\n**Status:** accepted\n\nbody");
    const result = await execute();
    expect(result[0].date).toBeNull();
  });

  it("project is null when frontmatter has no project field", async () => {
    await writeAdr("0001-noproj.md", "# ADR-0001: No Project\n\n**Status:** accepted\n\nbody");
    const result = await execute();
    expect(result[0].project).toBeNull();
  });
});
