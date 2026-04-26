import fs from "node:fs/promises";
import path from "node:path";
import { parse as yamlParse } from "yaml";
import type { MemoryAddInput, MemoryAddResult, ProjectsRegistry } from "../types.ts";
import { MEMORY_CATEGORIES } from "../types.ts";
import { getSecondBrainRoot, registryFile, memorySubdir } from "../lib/paths.ts";
import { buildFrontmatter } from "../lib/frontmatter.ts";

async function sha256Hex(content: string): Promise<string> {
  const buf = new TextEncoder().encode(content);
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function deriveSlug(content: string): string {
  const firstNonEmpty = content
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);

  if (!firstNonEmpty) return "entry";

  const stripped = firstNonEmpty.replace(/^#+\s*/, "");
  const ascii = stripped.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const slug = ascii.slice(0, 40);
  return slug.length > 0 ? slug : "entry";
}

export async function execute(input: MemoryAddInput): Promise<MemoryAddResult> {
  if (!MEMORY_CATEGORIES.includes(input.category)) {
    throw new Error(
      `invalid category: ${input.category}. Valid: [${MEMORY_CATEGORIES.join(", ")}]`
    );
  }

  if (input.content.trim().length === 0) {
    throw new Error("content must be non-empty");
  }

  const root = getSecondBrainRoot();
  const regPath = registryFile(root);

  let registryRaw: string;
  try {
    registryRaw = await fs.readFile(regPath, "utf8");
  } catch {
    throw new Error(`failed to read projects registry at ${regPath}`);
  }

  let registry: ProjectsRegistry;
  try {
    const parsed = yamlParse(registryRaw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.projects)) {
      throw new Error("invalid shape");
    }
    registry = parsed as ProjectsRegistry;
  } catch (err) {
    throw new Error(
      `registry at ${regPath} is malformed or missing required fields: ${(err as Error).message}`
    );
  }

  const validProjects = registry.projects.map((p) => p.name);
  if (!validProjects.includes(input.project)) {
    throw new Error(
      `unknown project: ${input.project}. Valid: [${validProjects.join(", ")}]`
    );
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = deriveSlug(input.content);
  const destDir = memorySubdir(input.category, root);

  let filename = `${timestamp}-${slug}.md`;
  let absPath = path.join(destDir, filename);

  // Collision guard: same ms calls get a 4-char hex suffix (MVP decision)
  try {
    await fs.access(absPath);
    const suffix = Math.floor(Math.random() * 0xffff)
      .toString(16)
      .padStart(4, "0");
    filename = `${timestamp}-${slug}-${suffix}.md`;
    absPath = path.join(destDir, filename);
  } catch {
    // file does not exist — no collision
  }

  await fs.mkdir(destDir, { recursive: true });

  const created = new Date().toISOString();
  const composed = buildFrontmatter(
    {
      project: input.project,
      projects: [input.project],
      category: input.category,
      created,
    },
    input.content
  );

  await fs.writeFile(absPath, composed, "utf8");

  const sha = await sha256Hex(input.content);
  const relPath = path.relative(root, absPath);

  return { path: relPath, sha };
}
