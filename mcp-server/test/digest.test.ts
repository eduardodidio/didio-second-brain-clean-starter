import { describe, it, expect } from "bun:test";
import type { DigestEntry } from "../src/types.ts";
import {
  parseDropFrontmatter,
  classifyBullet,
  classifyDrop,
  inferRoleFromContent,
  isCrossProject,
  toShingles,
  jaccard,
  dedupeAgainstExisting,
  routeEntry,
  splitDropIntoEntries,
} from "../src/lib/digest.ts";
import type { DigestDrop } from "../src/types.ts";

function makeDrop(body: string, overrides: Partial<DigestDrop> = {}): DigestDrop {
  return {
    feature: "F99",
    project: "proj",
    created: "2026-04-26T10:00:00Z",
    sourceCommits: [],
    body,
    sourcePath: "/tmp/drop.md",
    ...overrides,
  };
}

function makeEntry(category: DigestEntry["category"], overrides: Partial<DigestEntry> = {}): DigestEntry {
  return {
    category,
    title: "Test Title",
    content: "content here",
    sourceFeature: "F99",
    sourceProject: "proj",
    ...overrides,
  };
}

// ── 1. parseDropFrontmatter ───────────────────────────────────────────────────

describe("parseDropFrontmatter", () => {
  it("valid frontmatter → returns fm object with feature, project, body", () => {
    const raw = `---\nfeature: F90\nproject: my-project\ncreated: 2026-04-25T18:30:00Z\nsource_commits:\n  - abc1234\n---\nbody text here`;
    const result = parseDropFrontmatter(raw);
    expect(result).not.toBeNull();
    expect(result!.fm.feature).toBe("F90");
    expect(result!.fm.project).toBe("my-project");
    expect(result!.body).toBe("body text here");
    expect(result!.fm.sourceCommits).toEqual(["abc1234"]);
  });

  it("absent frontmatter (no --- delimiter) → returns null", () => {
    const raw = "body without any frontmatter at all";
    expect(parseDropFrontmatter(raw)).toBeNull();
  });

  it("missing required field 'project' → returns null", () => {
    const raw = `---\nfeature: F90\ncreated: 2026-04-25T18:30:00Z\n---\nbody`;
    expect(parseDropFrontmatter(raw)).toBeNull();
  });

  it("missing required field 'feature' → returns null", () => {
    const raw = `---\nproject: my-project\ncreated: 2026-04-25T18:30:00Z\n---\nbody`;
    expect(parseDropFrontmatter(raw)).toBeNull();
  });

  it("missing required field 'created' → returns null", () => {
    const raw = `---\nfeature: F90\nproject: my-project\n---\nbody`;
    expect(parseDropFrontmatter(raw)).toBeNull();
  });

  it("optional qa_report field is preserved when present", () => {
    const raw = `---\nfeature: F90\nproject: proj\ncreated: 2026-04-25T18:30:00Z\nqa_report: tasks/foo/qa.md\n---\nbody`;
    const result = parseDropFrontmatter(raw);
    expect(result).not.toBeNull();
    expect(result!.fm.qaReport).toBe("tasks/foo/qa.md");
  });
});

// ── 2. classifyBullet ─────────────────────────────────────────────────────────

describe("classifyBullet", () => {
  it("bullet containing 'skill' → skill", () => {
    expect(classifyBullet("- use skill command here")).toBe("skill");
  });

  it("bullet containing 'pattern' → pattern", () => {
    expect(classifyBullet("- new pattern for hooks")).toBe("pattern");
  });

  it("bullet containing 'hook' (whole word) → hook", () => {
    expect(classifyBullet("- added a hook for Stop event")).toBe("hook");
  });

  it("bullet containing 'learning' → learning", () => {
    expect(classifyBullet("- key learning from retro")).toBe("learning");
  });

  it("bullet matching no keyword → learning (default)", () => {
    expect(classifyBullet("- something completely unrelated")).toBe("learning");
  });

  it("anomaly priority: 'regression' beats 'skill' — anomaly > skill", () => {
    expect(classifyBullet("- regression found in skill command")).toBe("anomaly");
  });

  it("anomaly priority: 'bug' beats 'hook'", () => {
    expect(classifyBullet("- bug in hook handler")).toBe("anomaly");
  });

  it("'hooks' (plural) does not match \\bhook\\b", () => {
    expect(classifyBullet("- using hooks in the code")).toBe("learning");
  });
});

// ── 3. classifyDrop ───────────────────────────────────────────────────────────

describe("classifyDrop", () => {
  it("most bullets are 'learning' → learning", () => {
    const body = [
      "## Learnings",
      "- learned this pattern",
      "- new lesson today",
      "- pitfall avoided here",
      "## Skills",
      "- added skill command",
    ].join("\n");
    expect(classifyDrop(body)).toBe("learning");
  });

  it("empty body (no bullets) → learning (default)", () => {
    expect(classifyDrop("")).toBe("learning");
  });

  it("tie between hook and skill → hook wins (tiebreak order: anomaly > hook > skill > pattern > learning)", () => {
    const body = [
      "## Skills",
      "- skill command added",
      "## Patterns",
      "- added a hook for event",
    ].join("\n");
    expect(classifyDrop(body)).toBe("hook");
  });

  it("drop with 2 anomaly bullets → anomaly", () => {
    const body = [
      "## Anomalies",
      "- regression in deploy",
      "- bug in handler",
    ].join("\n");
    expect(classifyDrop(body)).toBe("anomaly");
  });
});

// ── 4. inferRoleFromContent ───────────────────────────────────────────────────

describe("inferRoleFromContent", () => {
  it("body containing 'developer' → 'developer'", () => {
    expect(inferRoleFromContent("developer wrote this code")).toBe("developer");
  });

  it("body containing 'architect' → 'architect'", () => {
    expect(inferRoleFromContent("architect planned the feature")).toBe("architect");
  });

  it("body containing 'qa' → 'qa'", () => {
    expect(inferRoleFromContent("qa reviewed the output")).toBe("qa");
  });

  it("body containing 'techlead' → 'techlead'", () => {
    expect(inferRoleFromContent("techlead approved the PR")).toBe("techlead");
  });

  it("body with no role keyword → undefined", () => {
    expect(inferRoleFromContent("just a plain statement here")).toBeUndefined();
  });

  it("role match is case-insensitive", () => {
    expect(inferRoleFromContent("DEVELOPER ran the task")).toBe("developer");
  });
});

// ── 5. isCrossProject ─────────────────────────────────────────────────────────

describe("isCrossProject", () => {
  const projects = ["proj-alpha", "proj-beta"];

  it("0 projects + 0 universals → false", () => {
    expect(isCrossProject("enemy layer wrong only for local monday", projects)).toBe(false);
  });

  it("1 project mention + 0 universals → false", () => {
    expect(isCrossProject("proj-alpha does xyz here", projects)).toBe(false);
  });

  it("1 project + 1 universal term → true", () => {
    expect(isCrossProject("hook for proj-alpha", projects)).toBe(true);
  });

  it("2 project mentions + 0 universals → true", () => {
    expect(isCrossProject("proj-alpha and proj-beta together", projects)).toBe(true);
  });

  it("universal term alone (no project) → true", () => {
    expect(isCrossProject("claude hooks in pipeline", [])).toBe(true);
  });
});

// ── 6. toShingles ─────────────────────────────────────────────────────────────

describe("toShingles", () => {
  it("4 words with n=4 → 1 shingle", () => {
    const result = toShingles("the quick brown fox", 4);
    expect(result.size).toBe(1);
    expect(result.has("the quick brown fox")).toBe(true);
  });

  it("4 words with n=2 → 3 shingles", () => {
    const result = toShingles("the quick brown fox", 2);
    expect(result.size).toBe(3);
    expect(result.has("the quick")).toBe(true);
    expect(result.has("quick brown")).toBe(true);
    expect(result.has("brown fox")).toBe(true);
  });

  it("empty string → empty set", () => {
    expect(toShingles("", 4).size).toBe(0);
  });

  it("fewer words than n → empty set", () => {
    expect(toShingles("one two", 4).size).toBe(0);
  });

  it("normalizes to lowercase and strips non-alphanum", () => {
    const result = toShingles("Hello, World! Foo Bar", 2);
    expect(result.has("hello world")).toBe(true);
    expect(result.has("world foo")).toBe(true);
    expect(result.has("foo bar")).toBe(true);
  });
});

// ── 7. jaccard ────────────────────────────────────────────────────────────────

describe("jaccard", () => {
  it("both sets empty → 0", () => {
    expect(jaccard(new Set(), new Set())).toBe(0);
  });

  it("identical non-empty sets → 1", () => {
    const s = new Set(["a", "b", "c"]);
    expect(jaccard(s, s)).toBe(1);
  });

  it("50% overlap → 0.5", () => {
    const a = new Set(["alpha"]);
    const b = new Set(["alpha", "beta"]);
    expect(jaccard(a, b)).toBeCloseTo(0.5, 5);
  });

  it("disjoint sets → 0", () => {
    const a = new Set(["x", "y"]);
    const b = new Set(["p", "q"]);
    expect(jaccard(a, b)).toBe(0);
  });

  it("one empty, one non-empty → 0", () => {
    expect(jaccard(new Set(), new Set(["a"]))).toBe(0);
  });
});

// ── 8. dedupeAgainstExisting ─────────────────────────────────────────────────

describe("dedupeAgainstExisting", () => {
  const existing = ["the quick brown fox jumps over the lazy dog and cat"];

  it("candidate with Jaccard ≥ 0.85 vs existing → duplicate: true", () => {
    // Same sentence → Jaccard = 1.0
    const { duplicate, bestSimilarity } = dedupeAgainstExisting(
      "the quick brown fox jumps over the lazy dog and cat",
      existing
    );
    expect(duplicate).toBe(true);
    expect(bestSimilarity).toBeGreaterThan(0.85);
  });

  it("candidate with Jaccard ≤ 0.30 vs existing → duplicate: false", () => {
    const { duplicate, bestSimilarity } = dedupeAgainstExisting(
      "completely unrelated words here now",
      existing
    );
    expect(duplicate).toBe(false);
    expect(bestSimilarity).toBeLessThan(0.3);
  });

  it("threshold 0.7 default — near-match above threshold is duplicate", () => {
    // near-identical: same 11 words + 1 extra (10/11 ≈ 0.91 overlap)
    const nearMatch = "the quick brown fox jumps over the lazy dog and cat extra";
    const { duplicate } = dedupeAgainstExisting(nearMatch, existing);
    expect(duplicate).toBe(true);
  });

  it("empty existing → never duplicate", () => {
    const { duplicate, bestSimilarity } = dedupeAgainstExisting("anything here", []);
    expect(duplicate).toBe(false);
    expect(bestSimilarity).toBe(0);
  });

  it("custom threshold overrides default", () => {
    // Same string but threshold=1.1 (impossible to reach) → not duplicate
    const { duplicate } = dedupeAgainstExisting(
      "the quick brown fox jumps over the lazy dog and cat",
      existing,
      1.1
    );
    expect(duplicate).toBe(false);
  });
});

// ── 9. routeEntry ────────────────────────────────────────────────────────────

describe("routeEntry", () => {
  const HUB = "/hub";

  it("category: anomaly → path ends in /memory/agent-learnings/qa.md", () => {
    const { path: p, kind } = routeEntry(makeEntry("anomaly"), HUB);
    expect(p).toBe(`${HUB}/memory/agent-learnings/qa.md`);
    expect(kind).toBe("memory");
  });

  it("category: learning + role developer → developer.md", () => {
    const { path: p } = routeEntry(makeEntry("learning", { role: "developer" }), HUB);
    expect(p).toBe(`${HUB}/memory/agent-learnings/developer.md`);
  });

  it("category: learning + no role → defaults to developer.md", () => {
    const { path: p } = routeEntry(makeEntry("learning"), HUB);
    expect(p).toBe(`${HUB}/memory/agent-learnings/developer.md`);
  });

  it("category: hook → path in patterns/hooks/<slug>/README.md", () => {
    const { path: p, kind } = routeEntry(makeEntry("hook", { title: "Load env hook" }), HUB);
    expect(p).toMatch(/patterns\/hooks\/.+\/README\.md$/);
    expect(p).toContain("load-env-hook");
    expect(kind).toBe("pattern");
  });

  it("category: skill → path in patterns/skills/<slug>/README.md", () => {
    const { path: p } = routeEntry(makeEntry("skill", { title: "Dry run command" }), HUB);
    expect(p).toMatch(/patterns\/skills\/.+\/README\.md$/);
  });

  it("category: pattern → path in patterns/snippets/<slug>/README.md", () => {
    const { path: p } = routeEntry(makeEntry("pattern", { title: "Retry snippet" }), HUB);
    expect(p).toMatch(/patterns\/snippets\/.+\/README\.md$/);
  });
});

// ── 10. splitDropIntoEntries ─────────────────────────────────────────────────

describe("splitDropIntoEntries", () => {
  it("drop with 2 sections and 3 bullets each → 6 entries", () => {
    const body = [
      "## Learnings",
      "- first learning bullet here",
      "- second learning done now",
      "- third learning complete ok",
      "",
      "## Patterns",
      "- first pattern bullet here",
      "- second pattern helper ok",
      "- third pattern snippet good",
    ].join("\n");
    const drop = makeDrop(body, { feature: "F99", project: "proj" });
    const entries = splitDropIntoEntries(drop);
    expect(entries.length).toBe(6);
  });

  it("each entry carries sourceFeature and sourceProject from drop frontmatter", () => {
    const body = "## Learnings\n- learned a hook lesson\n";
    const drop = makeDrop(body, { feature: "F42", project: "my-proj" });
    const [entry] = splitDropIntoEntries(drop);
    expect(entry.sourceFeature).toBe("F42");
    expect(entry.sourceProject).toBe("my-proj");
  });

  it("entries inherit category from classifyBullet, not section heading alone", () => {
    const body = "## Learnings\n- regression found in deploy\n";
    const drop = makeDrop(body);
    const [entry] = splitDropIntoEntries(drop);
    // "regression" is anomaly keyword — takes priority over section heading
    expect(entry.category).toBe("anomaly");
  });

  it("bullets outside a recognized section heading are skipped", () => {
    const body = "- orphan bullet\n## Learnings\n- valid bullet here\n";
    const drop = makeDrop(body);
    expect(splitDropIntoEntries(drop).length).toBe(1);
  });

  it("drop with no bullets → empty array", () => {
    const drop = makeDrop("## Learnings\nNo bullets here\n");
    expect(splitDropIntoEntries(drop).length).toBe(0);
  });

  it("content field is bullet text without the '- ' prefix", () => {
    const body = "## Learnings\n- the learning content goes here\n";
    const drop = makeDrop(body);
    const [entry] = splitDropIntoEntries(drop);
    expect(entry.content).toBe("the learning content goes here");
  });
});
