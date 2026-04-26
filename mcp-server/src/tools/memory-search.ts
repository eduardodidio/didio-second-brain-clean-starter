import path from "node:path";
import fs from "node:fs/promises";
import type { MemorySearchInput, MemorySearchHit } from "../types.ts";
import { agentLearningsDir } from "../lib/paths.ts";
import { parseFrontmatter } from "../lib/frontmatter.ts";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function execute(
  input: MemorySearchInput
): Promise<MemorySearchHit[]> {
  const trimmedQuery = input.query.trim();
  if (trimmedQuery.length === 0) {
    throw new Error("query must be non-empty");
  }

  if (input.limit !== undefined && input.limit < 1) {
    throw new Error("limit must be >= 1");
  }

  const limit = Math.min(input.limit ?? 20, 100);
  const dir = agentLearningsDir();

  let entries: string[];
  try {
    entries = (await fs.readdir(dir, { recursive: true })) as string[];
  } catch {
    return [];
  }

  const mdFiles = entries.filter((e) => e.endsWith(".md"));
  const lowerQ = trimmedQuery.toLowerCase();
  const hits: MemorySearchHit[] = [];

  for (const relPath of mdFiles) {
    const absPath = path.join(dir, relPath);
    let content: string;
    try {
      content = await fs.readFile(absPath, "utf8");
    } catch (err) {
      console.error(`[memory.search] failed to read ${absPath}:`, err);
      continue;
    }

    let parsed: { data: Record<string, unknown>; body: string };
    try {
      parsed = parseFrontmatter(content);
    } catch (err) {
      console.error(
        `[memory.search] failed to parse frontmatter in ${absPath}:`,
        err
      );
      continue;
    }

    const { data, body } = parsed;

    if (input.project !== undefined) {
      const projects = data.projects;
      if (!Array.isArray(projects) || !projects.includes(input.project)) {
        continue;
      }
    }

    const lowerBody = body.toLowerCase();
    const score = (
      lowerBody.match(new RegExp(escapeRegex(lowerQ), "g")) ?? []
    ).length;

    if (score === 0) continue;

    const lines = body.split("\n");
    const lowerLines = lowerBody.split("\n");
    const matchIdx = lowerLines.findIndex((line) => line.includes(lowerQ));
    const snippet = lines
      .slice(Math.max(0, matchIdx - 1), matchIdx + 2)
      .join("\n");

    // role is only defined for files directly in agent-learnings/ (no subdir)
    const hasSubdir = relPath.includes("/") || relPath.includes(path.sep);
    const role = hasSubdir ? null : path.basename(relPath, ".md");

    hits.push({ file: relPath, role, snippet, score });
  }

  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.file.localeCompare(b.file);
  });

  return hits.slice(0, limit);
}
