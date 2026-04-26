import path from "node:path";
import type { PatternsSearchInput, PatternHit, PatternType } from "../types.ts";
import { PATTERN_TYPES } from "../types.ts";
import { patternsDir } from "../lib/paths.ts";
import { loadMarkdownDir } from "../lib/markdown-loader.ts";

const TYPE_FROM_DIR: Record<string, PatternType> = {
  agents: "agent",
  skills: "skill",
  hooks: "hook",
  snippets: "snippet",
};

function snippetFromBody(body: string): string {
  return body
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .slice(0, 3)
    .join("\n");
}

function frontmatterText(frontmatter: Record<string, unknown>): string {
  return Object.values(frontmatter)
    .map((v) => JSON.stringify(v).toLowerCase())
    .join(" ");
}

export async function execute(input: PatternsSearchInput): Promise<PatternHit[]> {
  if (input.type !== undefined && !PATTERN_TYPES.includes(input.type)) {
    throw new Error(
      `Invalid type "${input.type}". Valid values: ${PATTERN_TYPES.join(", ")}`
    );
  }

  if (input.tags !== undefined && !Array.isArray(input.tags)) {
    throw new Error("tags must be an array of strings");
  }

  const entries = await loadMarkdownDir(patternsDir(), { recursive: true });

  // Map entries to PatternHit candidates, discarding invalid ones
  const candidates: Array<PatternHit & { _sortKey: string; _body: string }> = [];
  const seen = new Map<string, true>(); // key: "type:name"

  for (const entry of entries) {
    const parts = entry.file.split("/");
    const topDir = parts[0];
    const patternType = TYPE_FROM_DIR[topDir];
    if (!patternType) continue; // e.g. patterns/README.md

    let name: string;
    if (parts.length === 2) {
      // Direct file: patterns/agents/foo.md → "foo"
      name = path.basename(parts[1], ".md");
    } else {
      // In subdir: patterns/hooks/stop-session/README.md → "stop-session"
      name = parts[1];
    }

    const dedupKey = `${patternType}:${name}`;
    if (seen.has(dedupKey)) continue;
    seen.set(dedupKey, true);

    candidates.push({
      file: entry.file,
      type: patternType,
      name,
      frontmatter: entry.frontmatter,
      snippet: snippetFromBody(entry.body),
      _sortKey: `${patternType}:${name}`,
      _body: entry.body,
    });
  }

  // Apply filters
  const queryStr = input.query && input.query.length > 0 ? input.query.toLowerCase() : null;
  const tagsFilter = input.tags && input.tags.length > 0 ? input.tags : null;

  const filtered = candidates.filter((hit) => {
    if (input.type && hit.type !== input.type) return false;

    if (tagsFilter) {
      const fm = hit.frontmatter;
      if (!Array.isArray(fm.tags)) return false;
      const entryTags = fm.tags as unknown[];
      for (const tag of tagsFilter) {
        if (!entryTags.includes(tag)) return false;
      }
    }

    if (queryStr) {
      const searchable =
        hit.name.toLowerCase() +
        " " +
        hit._body.toLowerCase() +
        " " +
        frontmatterText(hit.frontmatter);
      if (!searchable.includes(queryStr)) return false;
    }

    return true;
  });

  // Sort by (type ASC, name ASC)
  filtered.sort((a, b) => a._sortKey.localeCompare(b._sortKey));

  return filtered.map(({ _sortKey: _unused, _body: _unusedBody, ...hit }) => hit);
}
