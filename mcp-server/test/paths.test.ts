import { describe, it, expect, afterEach, beforeEach } from "bun:test";
import path from "node:path";
import fs from "node:fs";
import {
  getSecondBrainRoot,
  memoryDir,
  memorySubdir,
  agentLearningsDir,
  registryFile,
  knowledgeDir,
  patternsDir,
  adrDir,
} from "../src/lib/paths.ts";

const ENV_VAR = "SECOND_BRAIN_ROOT";

describe("paths", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env[ENV_VAR];
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[ENV_VAR];
    } else {
      process.env[ENV_VAR] = originalEnv;
    }
  });

  describe("getSecondBrainRoot", () => {
    it("happy path: without env var, resolves to repo root containing CLAUDE.md", () => {
      delete process.env[ENV_VAR];
      const root = getSecondBrainRoot();
      expect(path.isAbsolute(root)).toBe(true);
      expect(fs.existsSync(path.join(root, "CLAUDE.md"))).toBe(true);
    });

    it("edge case: with SECOND_BRAIN_ROOT=/tmp, returns /tmp", () => {
      process.env[ENV_VAR] = "/tmp";
      const root = getSecondBrainRoot();
      expect(root).toBe(path.resolve("/tmp"));
    });

    it("error scenario: empty string falls back to import.meta.dir derivation", () => {
      process.env[ENV_VAR] = "";
      const root = getSecondBrainRoot();
      expect(path.isAbsolute(root)).toBe(true);
      expect(root.length).toBeGreaterThan(0);
      expect(fs.existsSync(path.join(root, "CLAUDE.md"))).toBe(true);
    });

    it("error scenario: whitespace-only string falls back to import.meta.dir derivation", () => {
      process.env[ENV_VAR] = "   ";
      const root = getSecondBrainRoot();
      expect(path.isAbsolute(root)).toBe(true);
      expect(root.trim()).toBe(root);
      expect(fs.existsSync(path.join(root, "CLAUDE.md"))).toBe(true);
    });

    it("boundary: result is always absolute", () => {
      delete process.env[ENV_VAR];
      expect(path.isAbsolute(getSecondBrainRoot())).toBe(true);
    });
  });

  describe("memoryDir", () => {
    it("returns <root>/memory", () => {
      process.env[ENV_VAR] = "/tmp";
      expect(memoryDir()).toBe("/tmp/memory");
    });

    it("result is absolute", () => {
      delete process.env[ENV_VAR];
      expect(path.isAbsolute(memoryDir())).toBe(true);
    });
  });

  describe("memorySubdir", () => {
    it("boundary: ends in /memory/agent-learnings", () => {
      process.env[ENV_VAR] = "/tmp";
      const result = memorySubdir("agent-learnings");
      expect(result.endsWith("/memory/agent-learnings")).toBe(true);
    });

    it("accepts custom root", () => {
      const result = memorySubdir("incidents", "/custom/root");
      expect(result).toBe("/custom/root/memory/incidents");
    });

    it("result is absolute", () => {
      delete process.env[ENV_VAR];
      expect(path.isAbsolute(memorySubdir("agent-learnings"))).toBe(true);
    });
  });

  describe("agentLearningsDir", () => {
    it("returns path ending in /memory/agent-learnings", () => {
      process.env[ENV_VAR] = "/tmp";
      const result = agentLearningsDir();
      expect(result.endsWith("/memory/agent-learnings")).toBe(true);
    });
  });

  describe("registryFile", () => {
    it("boundary: ends in /projects/registry.yaml", () => {
      process.env[ENV_VAR] = "/tmp";
      const result = registryFile();
      expect(result.endsWith("/projects/registry.yaml")).toBe(true);
    });

    it("result is absolute", () => {
      delete process.env[ENV_VAR];
      expect(path.isAbsolute(registryFile())).toBe(true);
    });
  });

  describe("knowledgeDir", () => {
    it("happy path: with SECOND_BRAIN_ROOT=/tmp/x returns /tmp/x/knowledge", () => {
      process.env[ENV_VAR] = "/tmp/x";
      expect(knowledgeDir()).toBe("/tmp/x/knowledge");
    });

    it("edge case: explicit arg uses that root", () => {
      expect(knowledgeDir("/other")).toBe("/other/knowledge");
    });

    it("boundary: without env var uses fallback repo root", () => {
      delete process.env[ENV_VAR];
      const result = knowledgeDir();
      expect(path.isAbsolute(result)).toBe(true);
      expect(result.endsWith("/knowledge")).toBe(true);
    });
  });

  describe("patternsDir", () => {
    it("happy path: with SECOND_BRAIN_ROOT=/tmp/x returns /tmp/x/patterns", () => {
      process.env[ENV_VAR] = "/tmp/x";
      expect(patternsDir()).toBe("/tmp/x/patterns");
    });

    it("edge case: explicit arg uses that root", () => {
      expect(patternsDir("/other")).toBe("/other/patterns");
    });

    it("boundary: without env var uses fallback repo root", () => {
      delete process.env[ENV_VAR];
      const result = patternsDir();
      expect(path.isAbsolute(result)).toBe(true);
      expect(result.endsWith("/patterns")).toBe(true);
    });
  });

  describe("adrDir", () => {
    it("happy path: with SECOND_BRAIN_ROOT=/tmp/x returns /tmp/x/docs/adr", () => {
      process.env[ENV_VAR] = "/tmp/x";
      expect(adrDir()).toBe("/tmp/x/docs/adr");
    });

    it("edge case: explicit arg uses that root", () => {
      expect(adrDir("/other")).toBe("/other/docs/adr");
    });

    it("boundary: without env var uses fallback repo root", () => {
      delete process.env[ENV_VAR];
      const result = adrDir();
      expect(path.isAbsolute(result)).toBe(true);
      expect(result.endsWith("/docs/adr")).toBe(true);
    });
  });
});
