import path from "node:path";
import { KNOWLEDGE_DOMAINS, type KnowledgeListItem } from "../types.ts";
import { knowledgeDir } from "../lib/paths.ts";
import { loadMarkdownDir } from "../lib/markdown-loader.ts";

export async function execute(): Promise<KnowledgeListItem[]> {
  const base = knowledgeDir();
  const result: KnowledgeListItem[] = [];

  for (const domain of KNOWLEDGE_DOMAINS) {
    const entries = await loadMarkdownDir(path.join(base, domain), { recursive: false });
    result.push({ domain, count: entries.length });
  }

  return result;
}
