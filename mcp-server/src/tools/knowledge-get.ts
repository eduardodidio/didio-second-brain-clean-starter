import path from "node:path";
import type { KnowledgeGetInput, KnowledgeArticle } from "../types.ts";
import { KNOWLEDGE_DOMAINS } from "../types.ts";
import { knowledgeDir } from "../lib/paths.ts";
import { loadMarkdownDir, extractTitle } from "../lib/markdown-loader.ts";

export async function execute(
  input: KnowledgeGetInput
): Promise<KnowledgeArticle[]> {
  if (!KNOWLEDGE_DOMAINS.includes(input.domain)) {
    throw new Error(
      `invalid domain: ${input.domain}. Valid: ${KNOWLEDGE_DOMAINS.join(", ")}`
    );
  }
  const base = path.join(knowledgeDir(), input.domain);
  const entries = await loadMarkdownDir(base, { recursive: false });
  return entries.map((e) => ({
    file: e.file,
    title: extractTitle(e.body) ?? path.basename(e.file, ".md"),
    frontmatter: e.frontmatter,
    content: e.body,
  }));
}
