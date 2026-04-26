import path from "node:path";
import fs from "node:fs/promises";
import { parseFrontmatter } from "./frontmatter.ts";

export interface LoadedMarkdown {
  file: string;
  absPath: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

export interface LoadOptions {
  recursive?: boolean;
  extensions?: string[];
}

export function extractTitle(body: string): string | null {
  const m = body.match(/^#\s+(.+?)\s*$/m);
  return m ? m[1] : null;
}

export async function loadMarkdownDir(
  absDir: string,
  opts: LoadOptions = {}
): Promise<LoadedMarkdown[]> {
  const recursive = opts.recursive ?? true;
  const exts = opts.extensions ?? [".md"];

  let entries: string[];
  try {
    entries = (await fs.readdir(absDir, { recursive })) as string[];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }

  const filtered = entries.filter((e) =>
    exts.some((ext) => e.endsWith(ext))
  );

  const results: LoadedMarkdown[] = [];

  for (const relPath of filtered) {
    const absPath = path.join(absDir, relPath);
    let content: string;
    try {
      content = await fs.readFile(absPath, "utf8");
    } catch (err) {
      console.error(`[markdown-loader] failed to read ${absPath}:`, err);
      continue;
    }

    let parsed: { data: Record<string, unknown>; body: string };
    try {
      parsed = parseFrontmatter(content);
    } catch (err) {
      console.error(`[markdown-loader] failed to parse frontmatter in ${absPath}:`, err);
      continue;
    }

    results.push({
      file: relPath,
      absPath,
      frontmatter: parsed.data,
      body: parsed.body,
    });
  }

  results.sort((a, b) => a.file.localeCompare(b.file));
  return results;
}
