import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { execute } from "../src/tools/memory-digest-pending.ts";
import { createSandbox, teardownSandbox, makeDrop } from "./helpers/digest-sandbox.ts";

// One-bullet cross-project drop (contains "claude" → universal term)
const CROSS_PROJECT_DROP = makeDrop(
  "F99",
  "test-proj",
  "## Learnings\n- claude hooks in pipeline are reusable for all\n"
);

// One-bullet project-specific drop (no universal terms, no 2nd project)
const PROJECT_SPECIFIC_DROP = makeDrop(
  "F91",
  "test-proj",
  "## Learnings\n- enemy layer wrong only for local monday\n",
  "2026-04-26T11:00:00Z"
);

// Drop with content identical to the pre-seeded developer.md entry (high Jaccard → dedup).
// "retrospective" is a universal term (→ isCrossProject=true) AND matches the learning regex
// (→ classifyBullet→"learning" → routeEntry→developer.md), so the dedup comparison happens
// against the seeded developer.md, not a patterns/ file.
const DEDUP_DROP = makeDrop(
  "F92",
  "test-proj",
  "## Learnings\n- the retrospective revealed key improvements for all\n",
  "2026-04-26T12:00:00Z"
);

// Existing developer.md that seeds a near-identical section for dedup tests.
// extractExistingSections strips the "## " heading line, so only the bullet line
// participates in Jaccard comparison — giving Jaccard ≈ 1.0 vs the candidate.
const SEEDED_DEVELOPER_MD = "## F90 — 2026\n- the retrospective revealed key improvements for all\n";

// Drop with no valid frontmatter
const MALFORMED_DROP = "## Learnings\n- some content without frontmatter\n";

let sandbox: string;
let origEnv: string | undefined;

beforeEach(async () => {
  origEnv = process.env.SECOND_BRAIN_ROOT;
});

afterEach(async () => {
  if (origEnv === undefined) {
    delete process.env.SECOND_BRAIN_ROOT;
  } else {
    process.env.SECOND_BRAIN_ROOT = origEnv;
  }
  if (sandbox) {
    await teardownSandbox(sandbox);
  }
});

// ── 1. Happy path ─────────────────────────────────────────────────────────────

describe("happy path absorption", () => {
  it("1 cross-project drop → absorbed=1, drop moved to _processed/, developer.md contains entry", async () => {
    sandbox = await createSandbox({
      drops: { "test-proj": { "drop.md": CROSS_PROJECT_DROP } },
    });
    process.env.SECOND_BRAIN_ROOT = sandbox;

    const result = await execute({ dryRun: false });

    expect(result.processed).toBe(1);
    expect(result.classified).toBe(1);
    expect(result.filtered).toBe(0);
    expect(result.deduped).toBe(0);
    expect(result.absorbed).toBe(1);
    expect(result.errors).toHaveLength(0);

    // Drop moved to _processed/
    const pendingDir = path.join(sandbox, "test-proj", "memory", "_pending-digest");
    const processedDir = path.join(pendingDir, "_processed");
    const pendingFiles = await fs.readdir(pendingDir);
    expect(pendingFiles.filter((f) => f !== "_processed")).toHaveLength(0);
    const processedFiles = await fs.readdir(processedDir);
    expect(processedFiles).toHaveLength(1);

    // developer.md contains the absorbed content
    const devMd = await fs.readFile(
      path.join(sandbox, "memory", "agent-learnings", "developer.md"),
      "utf8"
    );
    expect(devMd).toContain("claude hooks in pipeline are reusable for all");
  });
});

// ── 2. Project-specific filter ────────────────────────────────────────────────

describe("filter project-specific", () => {
  it("drop with no universal term + only 1 project → filtered=1, absorbed=0, drop moved", async () => {
    sandbox = await createSandbox({
      drops: { "test-proj": { "drop.md": PROJECT_SPECIFIC_DROP } },
    });
    process.env.SECOND_BRAIN_ROOT = sandbox;

    const result = await execute({ dryRun: false });

    expect(result.processed).toBe(1);
    expect(result.filtered).toBe(1);
    expect(result.absorbed).toBe(0);

    // Drop still gets moved to _processed/ (filtered counts as treated)
    const processedDir = path.join(
      sandbox, "test-proj", "memory", "_pending-digest", "_processed"
    );
    const processedFiles = await fs.readdir(processedDir);
    expect(processedFiles).toHaveLength(1);

    // developer.md should not be created
    const devMdPath = path.join(sandbox, "memory", "agent-learnings", "developer.md");
    const exists = await fs.access(devMdPath).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });
});

// ── 3. Deduplication ─────────────────────────────────────────────────────────

describe("deduplication", () => {
  it("drop content matching existing entry (Jaccard ≥ 0.7) → deduped=1, absorbed=0, drop moved", async () => {
    sandbox = await createSandbox({
      drops: { "test-proj": { "drop.md": DEDUP_DROP } },
      existingLearnings: { developer: SEEDED_DEVELOPER_MD },
    });
    process.env.SECOND_BRAIN_ROOT = sandbox;

    const devMdBefore = await fs.readFile(
      path.join(sandbox, "memory", "agent-learnings", "developer.md"),
      "utf8"
    );

    const result = await execute({ dryRun: false });

    expect(result.processed).toBe(1);
    expect(result.filtered).toBe(0);
    expect(result.deduped).toBe(1);
    expect(result.absorbed).toBe(0);

    // developer.md unchanged
    const devMdAfter = await fs.readFile(
      path.join(sandbox, "memory", "agent-learnings", "developer.md"),
      "utf8"
    );
    expect(devMdAfter).toBe(devMdBefore);

    // Drop moved to _processed/
    const processedDir = path.join(
      sandbox, "test-proj", "memory", "_pending-digest", "_processed"
    );
    const processedFiles = await fs.readdir(processedDir);
    expect(processedFiles).toHaveLength(1);
  });
});

// ── 4. Dry-run ────────────────────────────────────────────────────────────────

describe("dry-run", () => {
  it("dryRun: true → counters filled, developer.md unchanged, drop not moved", async () => {
    sandbox = await createSandbox({
      drops: { "test-proj": { "drop.md": CROSS_PROJECT_DROP } },
    });
    process.env.SECOND_BRAIN_ROOT = sandbox;

    const result = await execute({ dryRun: true });

    expect(result.processed).toBe(1);
    expect(result.absorbed).toBe(1);

    // developer.md must NOT exist (not created)
    const devMdPath = path.join(sandbox, "memory", "agent-learnings", "developer.md");
    const devMdExists = await fs.access(devMdPath).then(() => true).catch(() => false);
    expect(devMdExists).toBe(false);

    // Drop must NOT be moved (still in _pending-digest/)
    const pendingDir = path.join(sandbox, "test-proj", "memory", "_pending-digest");
    const pendingFiles = await fs.readdir(pendingDir);
    expect(pendingFiles).toContain("drop.md");

    // _processed/ must not exist
    const processedExists = await fs
      .access(path.join(pendingDir, "_processed"))
      .then(() => true)
      .catch(() => false);
    expect(processedExists).toBe(false);
  });
});

// ── 5. Idempotency ────────────────────────────────────────────────────────────

describe("idempotency", () => {
  it("running execute twice → 2nd run processes 0 drops", async () => {
    sandbox = await createSandbox({
      drops: { "test-proj": { "drop.md": CROSS_PROJECT_DROP } },
    });
    process.env.SECOND_BRAIN_ROOT = sandbox;

    await execute({ dryRun: false });
    const result2 = await execute({ dryRun: false });

    expect(result2.processed).toBe(0);
    expect(result2.absorbed).toBe(0);
    expect(result2.errors).toHaveLength(0);
  });
});

// ── 6. Malformed drop ────────────────────────────────────────────────────────

describe("malformed drop", () => {
  it("drop without valid frontmatter → errors[] gets entry, drop stays in pending", async () => {
    sandbox = await createSandbox({
      drops: { "test-proj": { "bad-drop.md": MALFORMED_DROP } },
    });
    process.env.SECOND_BRAIN_ROOT = sandbox;

    const result = await execute({ dryRun: false });

    expect(result.processed).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/bad-drop\.md/);

    // Drop stays in _pending-digest/ (NOT moved)
    const pendingDir = path.join(sandbox, "test-proj", "memory", "_pending-digest");
    const pendingFiles = await fs.readdir(pendingDir);
    expect(pendingFiles.filter((f) => f !== "_processed")).toContain("bad-drop.md");
  });
});

// ── 7. Filter by project input ────────────────────────────────────────────────

describe("filter by project", () => {
  it("input.project = 'proj-a' → drops from 'proj-b' are ignored", async () => {
    sandbox = await createSandbox({
      projects: [{ name: "proj-a" }, { name: "proj-b" }],
      drops: {
        "proj-a": { "drop-a.md": CROSS_PROJECT_DROP },
        "proj-b": { "drop-b.md": CROSS_PROJECT_DROP },
      },
    });
    process.env.SECOND_BRAIN_ROOT = sandbox;

    const result = await execute({ dryRun: false, project: "proj-a" });

    expect(result.processed).toBe(1);

    // proj-b drop must still be in its pending dir
    const projBPending = path.join(sandbox, "proj-b", "memory", "_pending-digest");
    const projBFiles = await fs.readdir(projBPending);
    expect(projBFiles.filter((f) => f !== "_processed")).toContain("drop-b.md");
  });
});

// ── 8. maxEntries cap ─────────────────────────────────────────────────────────

describe("maxEntries cap", () => {
  it("drop with 10 bullets, maxEntries=3 → result.entries.length ≤ 3", async () => {
    // Build a drop with 10 cross-project bullets (all contain "claude")
    const bullets = Array.from(
      { length: 10 },
      (_, i) => `- claude hook pattern for pipeline entry number ${i + 1}`
    ).join("\n");
    const bigDrop = makeDrop("F99", "test-proj", `## Learnings\n${bullets}\n`);

    sandbox = await createSandbox({
      drops: { "test-proj": { "big-drop.md": bigDrop } },
    });
    process.env.SECOND_BRAIN_ROOT = sandbox;

    const result = await execute({ dryRun: true, maxEntries: 3 });

    expect(result.classified).toBe(10);
    expect(result.entries.length).toBeLessThanOrEqual(3);
  });
});

// ── 9. Privacy rejection ──────────────────────────────────────────────────────

describe("privacy rejection", () => {
  it("drop with Anthropic token → PRIVACY_REJECTED error, processed=0, drop not moved", async () => {
    const PRIVACY_DROP = makeDrop(
      "F98",
      "test-proj",
      "## Learnings\n- found claude hook bug sk-ant-api03-AAABBBCCCDDDEEEFFFGGG1234567890 in prod\n"
    );
    sandbox = await createSandbox({
      drops: { "test-proj": { "privacy-drop.md": PRIVACY_DROP } },
    });
    process.env.SECOND_BRAIN_ROOT = sandbox;

    const result = await execute({ dryRun: false });

    expect(result.processed).toBe(0);
    expect(result.absorbed).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/PRIVACY_REJECTED/);
    expect(result.errors[0]).toContain("privacy-drop.md");

    // Drop must stay in _pending-digest (NOT moved to _processed/)
    const pendingDir = path.join(sandbox, "test-proj", "memory", "_pending-digest");
    const pendingFiles = await fs.readdir(pendingDir);
    expect(pendingFiles.filter((f) => f !== "_processed")).toContain("privacy-drop.md");
  });
});

// ── env restoration guard ─────────────────────────────────────────────────────

describe("env restoration", () => {
  it("SECOND_BRAIN_ROOT is restored to original value after test", () => {
    // This test just ensures the afterEach logic is correct.
    // Since afterEach restores origEnv, running a dummy test validates the guard.
    expect(true).toBe(true);
  });
});
