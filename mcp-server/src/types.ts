export interface Project {
  name: string;
  path: string;
  tech_stack: string[];
  purpose: string;
  claude_framework: boolean;
  mcp_integrated: boolean;
}

export type MemoryCategory = "agent-learnings" | "incidents" | "adr";

export const MEMORY_CATEGORIES: readonly MemoryCategory[] = [
  "agent-learnings",
  "incidents",
  "adr",
] as const;

export type ProjectsListFilter = "claude_framework" | "mcp_integrated";

export interface MemorySearchInput {
  query: string;
  project?: string;
  limit?: number;
}

export interface MemorySearchHit {
  file: string;
  role: string | null;
  snippet: string;
  score: number;
}

export interface MemoryAddInput {
  project: string;
  category: MemoryCategory;
  content: string;
}

export interface MemoryAddResult {
  path: string;
  sha: string;
}

export interface ProjectsListInput {
  filter?: ProjectsListFilter;
}

export type ProjectsListResult = Project[];

export interface ProjectsRegistry {
  version: number;
  projects: Project[];
}

// ============================================================
// F04: knowledge / patterns / adr
// ============================================================

export const KNOWLEDGE_DOMAINS = [
  "accessibility",
  "crypto-trading",
  "game-engine",
  "react-patterns",
] as const;
export type KnowledgeDomain = (typeof KNOWLEDGE_DOMAINS)[number];

export const PATTERN_TYPES = ["agent", "skill", "hook", "snippet"] as const;
export type PatternType = (typeof PATTERN_TYPES)[number];

export const ADR_STATUSES = ["proposed", "accepted", "superseded"] as const;
export type AdrStatus = (typeof ADR_STATUSES)[number];

// knowledge.list
export interface KnowledgeListItem {
  domain: KnowledgeDomain;
  count: number; // número de .md no domínio
}

// knowledge.get
export interface KnowledgeGetInput {
  domain: KnowledgeDomain;
}
export interface KnowledgeArticle {
  file: string;   // relative to knowledge/<domain>/
  title: string;  // primeiro `# Heading` ou basename do arquivo sem .md
  frontmatter: Record<string, unknown>;
  content: string; // body sem frontmatter
}

// patterns.search
export interface PatternsSearchInput {
  query?: string;
  type?: PatternType;
  tags?: string[];
}
export interface PatternHit {
  file: string;   // relative to patterns/
  type: PatternType;
  name: string;   // basename sem extensão (ou diretório, para hooks)
  frontmatter: Record<string, unknown>;
  snippet: string;
}

// patterns.get
export interface PatternsGetInput {
  name: string;
  type?: PatternType;
}
export interface PatternFull {
  file: string;
  type: PatternType;
  name: string;
  frontmatter: Record<string, unknown>;
  content: string;
}

// adr.list
export interface AdrListInput {
  project?: string;
  status?: AdrStatus;
}
export interface Adr {
  id: number;       // número 1..N (0007 → 7)
  file: string;     // basename (ex.: "0007-knowledge-patterns-format.md")
  title: string;    // primeiro `# ADR-XXXX: ...`
  frontmatter: Record<string, unknown>;
  status: AdrStatus;
  date: string | null; // "YYYY-MM-DD" ou null
  project: string | null; // opcional no frontmatter
}

// adr.get
export interface AdrGetInput {
  id: number;
}
export interface AdrFull extends Adr {
  content: string;
}

// ============================================================
// F16: learning-loop digest
// ============================================================

export const DIGEST_CATEGORIES = [
  "skill",
  "pattern",
  "hook",
  "learning",
  "anomaly",
] as const;
export type DigestCategory = (typeof DIGEST_CATEGORIES)[number];

export const DIGEST_UNIVERSAL_TERMS = [
  "bash",
  "git",
  "claude",
  "mcp",
  "hook",
  "agent",
  "skill",
  "pattern",
  "discord",
  "registry",
  "frontmatter",
  "yaml",
  "ts",
  "typescript",
  "bun",
  "node",
  "cron",
  "ci",
  "feature flag",
  "retrospective",
  "architect",
  "developer",
  "techlead",
  "qa",
] as const;

export const DIGEST_TOKEN_REGEX_PATTERNS: readonly RegExp[] = [
  /sk-[A-Za-z0-9]{20,}/,
  /ghp_[A-Za-z0-9]{36}/,
  /xoxb-[0-9-]+/,
];

export type DigestDrop = {
  feature: string;        // FXX
  project: string;        // nome em registry
  created: string;        // ISO 8601
  sourceCommits: string[]; // shas curtos
  qaReport?: string;      // path relativo
  digested?: string | null; // ISO ts ou null
  body: string;           // markdown raw das 4 seções
  sourcePath: string;     // path absoluto do drop file
};

export type DigestEntry = {
  category: DigestCategory;
  role?: "architect" | "developer" | "techlead" | "qa";
  title: string;
  content: string;        // bullet body
  sourceFeature: string;  // FXX origem
  sourceProject: string;
};

export type DigestPendingInput = {
  dryRun?: boolean;
  project?: string;       // filtra um projeto só
  maxEntries?: number;    // safety cap
};

export type DigestPendingResult = {
  processed: number;      // drops abertos
  classified: number;     // entries pós-classify
  filtered: number;       // descartados por cross-project
  deduped: number;        // descartados por similaridade
  absorbed: number;       // gravados em memory/ ou patterns/
  errors: string[];       // mensagens de drops com erro
  entries: Array<{
    drop: string;         // basename do drop
    project: string;
    category: DigestCategory;
    action: "absorbed" | "filtered" | "deduped" | "error";
    target?: string;      // path destino (quando absorbed)
  }>;
};
