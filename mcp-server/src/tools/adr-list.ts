import path from "node:path";
import type { Adr, AdrListInput, AdrStatus } from "../types.ts";
import { ADR_STATUSES } from "../types.ts";
import { adrDir } from "../lib/paths.ts";
import { loadMarkdownDir, extractTitle } from "../lib/markdown-loader.ts";

const ID_RE = /^(\d{4})-/;
const STATUS_LINE_RE = /^\*\*Status:\*\*\s*(\w+)/m;
const DATE_LINE_RE = /^\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})/m;

export async function execute(input: AdrListInput = {}): Promise<Adr[]> {
  if (input.status !== undefined && !ADR_STATUSES.includes(input.status)) {
    throw new Error(
      `Invalid status "${input.status}". Must be one of: ${ADR_STATUSES.join(", ")}`
    );
  }

  const entries = await loadMarkdownDir(adrDir(), { recursive: false });

  const adrs: Adr[] = [];

  for (const e of entries) {
    const basename = path.basename(e.file);
    const match = ID_RE.exec(basename);
    if (!match) continue;

    const id = parseInt(match[1], 10);
    if (id === 0) continue;

    // Resolve status: frontmatter first, then body, fallback "proposed"
    let status: AdrStatus;
    const fmStatus = e.frontmatter.status;
    if (typeof fmStatus === "string" && (ADR_STATUSES as readonly string[]).includes(fmStatus)) {
      status = fmStatus as AdrStatus;
    } else {
      const bodyMatch = STATUS_LINE_RE.exec(e.body);
      const bodyStatus = bodyMatch?.[1]?.toLowerCase();
      if (bodyStatus && (ADR_STATUSES as readonly string[]).includes(bodyStatus)) {
        status = bodyStatus as AdrStatus;
      } else {
        console.error(`[adr-list] ${basename}: unrecognized status "${fmStatus ?? bodyStatus ?? "(none)"}"; defaulting to "proposed"`);
        status = "proposed";
      }
    }

    // Resolve date: frontmatter first, then body
    let date: string | null = null;
    if (typeof e.frontmatter.date === "string" && e.frontmatter.date.length > 0) {
      date = e.frontmatter.date;
    } else {
      const dateMatch = DATE_LINE_RE.exec(e.body);
      if (dateMatch) date = dateMatch[1];
    }

    // Resolve project
    const project = typeof e.frontmatter.project === "string" ? e.frontmatter.project : null;

    // Resolve title
    const title = extractTitle(e.body) ?? path.basename(e.file, ".md");

    adrs.push({
      id,
      file: basename,
      title,
      frontmatter: e.frontmatter,
      status,
      date,
      project,
    });
  }

  let result = adrs;

  if (input.project !== undefined) {
    result = result.filter((a) => a.project === input.project);
  }
  if (input.status !== undefined) {
    result = result.filter((a) => a.status === input.status);
  }

  result.sort((a, b) => a.id - b.id);
  return result;
}
