import path from "node:path";
import type { PatternsGetInput, PatternFull, PatternType } from "../types.ts";
import { PATTERN_TYPES } from "../types.ts";
import { patternsDir } from "../lib/paths.ts";
import { loadMarkdownDir } from "../lib/markdown-loader.ts";

const TYPE_FROM_DIR: Record<string, PatternType> = {
  agents: "agent",
  skills: "skill",
  hooks: "hook",
  snippets: "snippet",
};

function deriveTypeAndName(
  file: string
): { type: PatternType; name: string } | null {
  const parts = file.split(path.sep).join("/").split("/");
  if (parts.length < 2) return null;

  const dirSegment = parts[0];
  const type = TYPE_FROM_DIR[dirSegment];
  if (!type) return null;

  if (parts.length === 2) {
    // agents/foo.md → name="foo"
    const name = parts[1].replace(/\.md$/i, "");
    return { type, name };
  }

  // hooks/stop-session-summary/README.md → name="stop-session-summary"
  return { type, name: parts[1] };
}

export async function execute(input: PatternsGetInput): Promise<PatternFull> {
  if (!input.name || input.name.trim().length === 0) {
    throw new Error("name must be a non-empty string");
  }

  if (input.type !== undefined && !(PATTERN_TYPES as readonly string[]).includes(input.type)) {
    throw new Error(
      `invalid type "${input.type}". Must be one of: ${PATTERN_TYPES.join(", ")}`
    );
  }

  const entries = await loadMarkdownDir(patternsDir(), { recursive: true });

  interface Candidate {
    file: string;
    type: PatternType;
    name: string;
    frontmatter: Record<string, unknown>;
    body: string;
  }

  const candidates: Candidate[] = [];

  for (const entry of entries) {
    const derived = deriveTypeAndName(entry.file);
    if (!derived) continue;

    if (input.type !== undefined && derived.type !== input.type) continue;
    if (derived.name !== input.name) continue;

    candidates.push({
      file: entry.file,
      type: derived.type,
      name: derived.name,
      frontmatter: entry.frontmatter,
      body: entry.body,
    });
  }

  if (candidates.length === 0) {
    throw new Error(`pattern not found: ${input.name}`);
  }

  // Check for ambiguity across different types (only when type not specified)
  if (input.type === undefined) {
    const types = [...new Set(candidates.map((c) => c.type))];
    if (types.length > 1) {
      throw new Error(
        `ambiguous name '${input.name}' — specify type. Found in: ${types.join(", ")}`
      );
    }
  }

  // Multiple files in same type/subdir — return first (already sorted ASC by loadMarkdownDir)
  const match = candidates[0];

  return {
    file: match.file,
    type: match.type,
    name: match.name,
    frontmatter: match.frontmatter,
    content: match.body,
  };
}
