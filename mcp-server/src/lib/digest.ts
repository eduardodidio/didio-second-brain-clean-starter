import { parseFrontmatter } from "./frontmatter.ts";
import type { DigestDrop, DigestEntry, DigestCategory } from "../types.ts";
import { DIGEST_UNIVERSAL_TERMS } from "../types.ts";

// Keyword regex table per ADR-0010 §3, in priority order: anomaly > hook > skill > pattern > learning
const CATEGORY_KEYWORD_REGEXES: readonly [DigestCategory, RegExp][] = [
  ["anomaly", /\b(?:bug|regression|incident|flaky|false[- ]positive|error path)\b/i],
  ["hook", /\b(?:hook|Stop event|PostToolUse)\b/i],
  ["skill", /\b(?:skill|slash command)\b|\.claude\/skills\//i],
  ["pattern", /\b(?:pattern|helper|_lib|snippet)\b/i],
  ["learning", /\b(?:learn(?:ed|ing)|lesson|retro(?:spective)?|pitfall|architect learning)\b/i],
];

const TIEBREAK_ORDER: readonly DigestCategory[] = [
  "anomaly",
  "hook",
  "skill",
  "pattern",
  "learning",
];

const SECTION_CATEGORY_MAP: Readonly<Record<string, DigestCategory>> = {
  learning: "learning",
  learnings: "learning",
  skill: "skill",
  skills: "skill",
  pattern: "pattern",
  patterns: "pattern",
  anomaly: "anomaly",
  anomalies: "anomaly",
};

const PATTERN_TYPE_DIR: Readonly<Record<string, string>> = {
  hook: "hooks",
  skill: "skills",
  pattern: "snippets",
};

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40)
    .replace(/-+$/, "");
}

export function parseDropFrontmatter(raw: string): {
  fm: Omit<DigestDrop, "body" | "sourcePath">;
  body: string;
} | null {
  const { data, body } = parseFrontmatter(raw);

  const feature = data["feature"];
  const project = data["project"];
  const created = data["created"];

  if (
    typeof feature !== "string" || !feature ||
    typeof project !== "string" || !project ||
    (typeof created !== "string" && !(created instanceof Date))
  ) {
    return null;
  }

  const sourceCommits = Array.isArray(data["source_commits"])
    ? (data["source_commits"] as unknown[]).filter((x): x is string => typeof x === "string")
    : [];

  const qaReport =
    typeof data["qa_report"] === "string" ? data["qa_report"] : undefined;

  const digestedRaw = data["digested"];
  const digested: string | null | undefined =
    digestedRaw === null || digestedRaw === "null"
      ? null
      : typeof digestedRaw === "string"
        ? digestedRaw
        : undefined;

  const fm: Omit<DigestDrop, "body" | "sourcePath"> = {
    feature,
    project,
    created: created instanceof Date ? created.toISOString() : String(created),
    sourceCommits,
  };

  if (qaReport !== undefined) fm.qaReport = qaReport;
  if (digested !== undefined) fm.digested = digested;

  return { fm, body };
}

export function classifyBullet(line: string): DigestCategory {
  for (const [category, regex] of CATEGORY_KEYWORD_REGEXES) {
    if (regex.test(line)) return category;
  }
  return "learning";
}

export function classifyDrop(body: string): DigestCategory {
  const bullets = body
    .split("\n")
    .filter((line) => /^[-*]\s/.test(line.trimStart()));

  if (bullets.length === 0) return "learning";

  const counts = new Map<DigestCategory, number>();
  for (const bullet of bullets) {
    const cat = classifyBullet(bullet);
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }

  const maxCount = Math.max(...counts.values());
  const winner = TIEBREAK_ORDER.find((cat) => counts.get(cat) === maxCount);
  return winner ?? "learning";
}

export function inferRoleFromContent(body: string): DigestEntry["role"] | undefined {
  const roles: Array<NonNullable<DigestEntry["role"]>> = [
    "architect",
    "developer",
    "techlead",
    "qa",
  ];
  for (const role of roles) {
    if (new RegExp(`\\b${role}\\b`, "i").test(body)) return role;
  }
  return undefined;
}

export function isCrossProject(
  body: string,
  knownProjects: readonly string[],
): boolean {
  const lower = body.toLowerCase();

  const hasUniversal = DIGEST_UNIVERSAL_TERMS.some((term) =>
    lower.includes(term.toLowerCase()),
  );
  if (hasUniversal) return true;

  let projectCount = 0;
  for (const project of knownProjects) {
    if (lower.includes(project.toLowerCase())) {
      projectCount++;
      if (projectCount >= 2) return true;
    }
  }

  return false;
}

export function toShingles(text: string, n = 4): Set<string> {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return new Set();

  const words = normalized.split(" ");
  const shingles = new Set<string>();

  for (let i = 0; i <= words.length - n; i++) {
    shingles.add(words.slice(i, i + n).join(" "));
  }

  return shingles;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;

  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }

  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function dedupeAgainstExisting(
  candidate: string,
  existing: readonly string[],
  threshold = 0.7,
): { duplicate: boolean; bestSimilarity: number } {
  const candidateShingles = toShingles(candidate);
  let bestSimilarity = 0;

  for (const entry of existing) {
    const similarity = jaccard(candidateShingles, toShingles(entry));
    if (similarity > bestSimilarity) bestSimilarity = similarity;
  }

  return { duplicate: bestSimilarity >= threshold, bestSimilarity };
}

export function routeEntry(
  entry: DigestEntry,
  hubRoot: string,
): { kind: "memory" | "pattern"; path: string } {
  if (entry.category === "anomaly") {
    return {
      kind: "memory",
      path: `${hubRoot}/memory/agent-learnings/qa.md`,
    };
  }

  if (entry.category === "learning") {
    const role = entry.role ?? "developer";
    return {
      kind: "memory",
      path: `${hubRoot}/memory/agent-learnings/${role}.md`,
    };
  }

  const typeDir = PATTERN_TYPE_DIR[entry.category] ?? "snippets";
  const slug = toSlug(entry.title);
  return {
    kind: "pattern",
    path: `${hubRoot}/patterns/${typeDir}/${slug}/README.md`,
  };
}

export function splitDropIntoEntries(drop: DigestDrop): DigestEntry[] {
  const entries: DigestEntry[] = [];
  let currentSection: DigestCategory | null = null;

  for (const line of drop.body.split("\n")) {
    const headingMatch = line.match(/^##\s+(\w+)/i);
    if (headingMatch) {
      currentSection = SECTION_CATEGORY_MAP[headingMatch[1].toLowerCase()] ?? null;
      continue;
    }

    if (currentSection === null) continue;

    const bulletMatch = line.match(/^[-*]\s+(.+)/);
    if (!bulletMatch) continue;

    const content = bulletMatch[1].trim();
    const category = classifyBullet(line);

    entries.push({
      category,
      role: inferRoleFromContent(content),
      title: content.slice(0, 60).trim(),
      content,
      sourceFeature: drop.feature,
      sourceProject: drop.project,
    });
  }

  return entries;
}
