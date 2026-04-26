import path from "node:path";
import type { AdrFull, AdrGetInput, AdrStatus } from "../types.ts";
import { ADR_STATUSES } from "../types.ts";
import { adrDir } from "../lib/paths.ts";
import { loadMarkdownDir, extractTitle } from "../lib/markdown-loader.ts";

const ID_RE = /^(\d{4})-/;
const STATUS_LINE_RE = /^\*\*Status:\*\*\s*(\w+)/m;
const DATE_LINE_RE = /^\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})/m;

export async function execute(input: AdrGetInput): Promise<AdrFull> {
  if (!Number.isInteger(input.id) || input.id < 1) {
    throw new Error("id must be integer >= 1");
  }

  const prefix = String(input.id).padStart(4, "0") + "-";
  const entries = await loadMarkdownDir(adrDir(), { recursive: false });

  const matches = entries.filter((e) => path.basename(e.file).startsWith(prefix));

  if (matches.length === 0) {
    throw new Error(`ADR not found: ${input.id}`);
  }

  // Sort ascending and take first (tolerant of duplicates)
  matches.sort((a, b) => path.basename(a.file).localeCompare(path.basename(b.file)));
  const e = matches[0];
  const basename = path.basename(e.file);

  const idMatch = ID_RE.exec(basename);
  const id = idMatch ? parseInt(idMatch[1], 10) : input.id;

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
      console.error(`[adr-get] ${basename}: unrecognized status "${fmStatus ?? bodyStatus ?? "(none)"}"; defaulting to "proposed"`);
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

  const project = typeof e.frontmatter.project === "string" ? e.frontmatter.project : null;
  const title = extractTitle(e.body) ?? path.basename(e.file, ".md");

  return {
    id,
    file: basename,
    title,
    frontmatter: e.frontmatter,
    status,
    date,
    project,
    content: e.body,
  };
}
