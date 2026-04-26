import fs from "node:fs/promises";
import yaml from "yaml";
import type {
  Project,
  ProjectsListInput,
  ProjectsListResult,
  ProjectsRegistry,
  ProjectsListFilter,
} from "../types.ts";
import { registryFile } from "../lib/paths.ts";

const VALID_FILTERS: ProjectsListFilter[] = ["claude_framework", "mcp_integrated"];

function isValidProject(entry: unknown): entry is Project {
  if (!entry || typeof entry !== "object") return false;
  const p = entry as Record<string, unknown>;
  return (
    typeof p.name === "string" &&
    typeof p.path === "string" &&
    Array.isArray(p.tech_stack) &&
    typeof p.purpose === "string" &&
    typeof p.claude_framework === "boolean" &&
    typeof p.mcp_integrated === "boolean"
  );
}

export async function execute(
  input: ProjectsListInput
): Promise<ProjectsListResult> {
  if (input.filter !== undefined && !VALID_FILTERS.includes(input.filter)) {
    throw new Error(
      `unknown filter: ${input.filter}. Valid: claude_framework, mcp_integrated`
    );
  }

  let content: string;
  try {
    content = await fs.readFile(registryFile(), "utf8");
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") {
      throw new Error(`registry not found at ${registryFile()}`);
    }
    throw err;
  }

  if (content.trim().length === 0) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = yaml.parse(content);
  } catch (err) {
    console.error("[projects-list] failed to parse registry YAML:", err);
    throw err;
  }

  if (parsed === null || parsed === undefined) {
    return [];
  }

  const reg = parsed as Partial<ProjectsRegistry>;

  if (typeof reg.version !== "number") {
    console.error("[projects-list] invalid registry: missing or non-numeric version");
    throw new Error("invalid registry: missing or non-numeric version");
  }

  // TODO(F04+): validate version === 1 when breaking changes are introduced
  if (reg.projects === undefined || reg.projects === null) {
    return [];
  }

  if (!Array.isArray(reg.projects)) {
    console.error("[projects-list] invalid registry: projects is not an array");
    throw new Error("invalid registry: projects is not an array");
  }

  const projects: Project[] = [];
  for (const entry of reg.projects) {
    if (isValidProject(entry)) {
      projects.push(entry);
    } else {
      console.error("[projects-list] skipping malformed entry:", entry);
    }
  }

  if (input.filter === "claude_framework") {
    return projects.filter((p) => p.claude_framework === true);
  }
  if (input.filter === "mcp_integrated") {
    return projects.filter((p) => p.mcp_integrated === true);
  }

  return projects;
}
