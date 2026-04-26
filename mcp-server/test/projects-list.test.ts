import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execute } from "../src/tools/projects-list.ts";
import type { ProjectsListFilter } from "../src/types.ts";

let tmpDir: string;

const FIXTURE_A = {
  name: "proj-a",
  path: "/projects/proj-a",
  tech_stack: ["TypeScript", "Bun"],
  purpose: "Project A",
  claude_framework: true,
  mcp_integrated: true,
};

const FIXTURE_B = {
  name: "proj-b",
  path: "/projects/proj-b",
  tech_stack: ["Java"],
  purpose: "Project B",
  claude_framework: true,
  mcp_integrated: false,
};

const FIXTURE_C = {
  name: "proj-c",
  path: "/projects/proj-c",
  tech_stack: [],
  purpose: "Project C",
  claude_framework: false,
  mcp_integrated: true,
};

const THREE_PROJECTS_YAML = `
version: 1
projects:
  - name: proj-a
    path: /projects/proj-a
    tech_stack:
      - TypeScript
      - Bun
    purpose: Project A
    claude_framework: true
    mcp_integrated: true

  - name: proj-b
    path: /projects/proj-b
    tech_stack:
      - Java
    purpose: Project B
    claude_framework: true
    mcp_integrated: false

  - name: proj-c
    path: /projects/proj-c
    tech_stack: []
    purpose: Project C
    claude_framework: false
    mcp_integrated: true
`.trim();

async function writeRegistry(content: string): Promise<void> {
  const projectsDir = path.join(tmpDir, "projects");
  await fs.mkdir(projectsDir, { recursive: true });
  await fs.writeFile(path.join(projectsDir, "registry.yaml"), content, "utf8");
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "second-brain-test-"));
  process.env.SECOND_BRAIN_ROOT = tmpDir;
});

afterEach(async () => {
  delete process.env.SECOND_BRAIN_ROOT;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("projects-list execute", () => {
  // Happy path
  describe("happy path", () => {
    it("returns all 3 projects in order when no filter", async () => {
      await writeRegistry(THREE_PROJECTS_YAML);
      const result = await execute({});
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual(FIXTURE_A);
      expect(result[1]).toEqual(FIXTURE_B);
      expect(result[2]).toEqual(FIXTURE_C);
    });

    it("each entry has exactly the 6 required keys with correct types", async () => {
      await writeRegistry(THREE_PROJECTS_YAML);
      const result = await execute({});
      for (const p of result) {
        expect(typeof p.name).toBe("string");
        expect(typeof p.path).toBe("string");
        expect(Array.isArray(p.tech_stack)).toBe(true);
        expect(typeof p.purpose).toBe("string");
        expect(typeof p.claude_framework).toBe("boolean");
        expect(typeof p.mcp_integrated).toBe("boolean");
      }
    });
  });

  // Edge cases
  describe("edge cases", () => {
    it("filter claude_framework returns only A and B", async () => {
      await writeRegistry(THREE_PROJECTS_YAML);
      const result = await execute({ filter: "claude_framework" });
      expect(result).toHaveLength(2);
      expect(result.map((p) => p.name)).toEqual(["proj-a", "proj-b"]);
    });

    it("filter mcp_integrated returns only A and C", async () => {
      await writeRegistry(THREE_PROJECTS_YAML);
      const result = await execute({ filter: "mcp_integrated" });
      expect(result).toHaveLength(2);
      expect(result.map((p) => p.name)).toEqual(["proj-a", "proj-c"]);
    });

    it("empty projects array returns []", async () => {
      await writeRegistry("version: 1\nprojects: []");
      const result = await execute({});
      expect(result).toEqual([]);
    });

    it("empty file returns []", async () => {
      await writeRegistry("");
      const result = await execute({});
      expect(result).toEqual([]);
    });

    it("file with only version (no projects key) returns []", async () => {
      await writeRegistry("version: 1");
      const result = await execute({});
      expect(result).toEqual([]);
    });

    it("tech_stack empty array is a valid entry", async () => {
      await writeRegistry(THREE_PROJECTS_YAML);
      const result = await execute({});
      const projC = result.find((p) => p.name === "proj-c");
      expect(projC).toBeDefined();
      expect(projC!.tech_stack).toEqual([]);
    });

    it("version: 2 is accepted (no version enforcement in MVP)", async () => {
      const yaml = THREE_PROJECTS_YAML.replace("version: 1", "version: 2");
      await writeRegistry(yaml);
      const result = await execute({});
      expect(result).toHaveLength(3);
    });

    it("100 entries are returned without truncation", async () => {
      const entries = Array.from({ length: 100 }, (_, i) => ({
        name: `proj-${i}`,
        path: `/projects/proj-${i}`,
        tech_stack: ["TypeScript"],
        purpose: `Project ${i}`,
        claude_framework: i % 2 === 0,
        mcp_integrated: i % 3 === 0,
      }));

      const lines = ["version: 1", "projects:"];
      for (const e of entries) {
        lines.push(`  - name: ${e.name}`);
        lines.push(`    path: ${e.path}`);
        lines.push(`    tech_stack: [TypeScript]`);
        lines.push(`    purpose: Project ${e.name}`);
        lines.push(`    claude_framework: ${e.claude_framework}`);
        lines.push(`    mcp_integrated: ${e.mcp_integrated}`);
      }

      await writeRegistry(lines.join("\n"));
      const result = await execute({});
      expect(result).toHaveLength(100);
    });
  });

  // Error scenarios
  describe("error scenarios", () => {
    it("unknown filter throws with descriptive message", async () => {
      await writeRegistry(THREE_PROJECTS_YAML);
      await expect(
        execute({ filter: "foo" as ProjectsListFilter })
      ).rejects.toThrow(/unknown filter/);
    });

    it("non-YAML content rejects with parse error", async () => {
      await writeRegistry("not yaml ][}");
      await expect(execute({})).rejects.toThrow();
    });

    it("missing registry file rejects with ENOENT-based error", async () => {
      // do not write registry
      await expect(execute({})).rejects.toThrow(/registry not found at/);
    });

    it("entry missing name is skipped, others returned", async () => {
      const yaml = `
version: 1
projects:
  - path: /no-name
    tech_stack: []
    purpose: No name
    claude_framework: true
    mcp_integrated: false
  - name: valid
    path: /valid
    tech_stack: []
    purpose: Valid
    claude_framework: true
    mcp_integrated: false
`.trim();
      await writeRegistry(yaml);
      const result = await execute({});
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("valid");
    });

    it("entry with claude_framework as string is skipped", async () => {
      const yaml = `
version: 1
projects:
  - name: bad-bool
    path: /bad
    tech_stack: []
    purpose: Bad bool
    claude_framework: "true"
    mcp_integrated: false
  - name: good
    path: /good
    tech_stack: []
    purpose: Good
    claude_framework: true
    mcp_integrated: false
`.trim();
      await writeRegistry(yaml);
      const result = await execute({});
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("good");
    });
  });

  // Boundary values
  describe("boundary values", () => {
    it("filter with undefined behaves same as no filter", async () => {
      await writeRegistry(THREE_PROJECTS_YAML);
      const withUndefined = await execute({ filter: undefined });
      const noFilter = await execute({});
      expect(withUndefined).toEqual(noFilter);
    });
  });
});
