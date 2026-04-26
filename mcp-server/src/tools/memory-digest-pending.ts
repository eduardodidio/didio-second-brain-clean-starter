import fs from "node:fs/promises";
import path from "node:path";
import { parse as yamlParse } from "yaml";
import type {
  DigestPendingInput,
  DigestPendingResult,
  DigestDrop,
  ProjectsRegistry,
} from "../types.ts";
import {
  getSecondBrainRoot,
  registryFile,
  pendingDigestDir,
  processedDigestDir,
} from "../lib/paths.ts";
import { parseFrontmatter, buildFrontmatter } from "../lib/frontmatter.ts";
import {
  parseDropFrontmatter,
  splitDropIntoEntries,
  isCrossProject,
  dedupeAgainstExisting,
  routeEntry,
} from "../lib/digest.ts";

// ADR-0010 §8: hub-side defensive privacy double-check.
// If any of the 9 canonical token patterns appears in a drop body, the drop
// is rejected (not absorbed, not moved to _processed/) and logged as an error.
const PRIVACY_PATTERNS: RegExp[] = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /sk-ant-[A-Za-z0-9_-]{20,}/,
  /ghp_[A-Za-z0-9]{36}/,
  /glpat-[A-Za-z0-9_-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
  /https:\/\/discord(?:app)?\.com\/api\/webhooks\/[0-9]+\/[A-Za-z0-9_-]+/,
  /Bearer [A-Za-z0-9._-]{20,}/,
  /[A-Z_]{5,}=[A-Za-z0-9_/+=\-]{32,}/,
];

async function readFileOrNull(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

function extractExistingSections(content: string): string[] {
  const sections: string[] = [];
  let current: string[] = [];
  let inSection = false;

  for (const line of content.split("\n")) {
    if (line.startsWith("## ")) {
      if (inSection && current.length > 0) {
        sections.push(current.join("\n"));
      }
      current = [];
      inSection = true;
    } else if (inSection) {
      current.push(line);
    }
  }

  if (inSection && current.length > 0) {
    sections.push(current.join("\n"));
  }

  return sections;
}

export async function execute(input: DigestPendingInput): Promise<DigestPendingResult> {
  const hubRoot = getSecondBrainRoot();
  const regPath = registryFile(hubRoot);

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

  const knownProjectNames = registry.projects.map((p) => p.name);

  const projects = input.project
    ? registry.projects.filter((p) => p.name === input.project)
    : registry.projects;

  const result: DigestPendingResult = {
    processed: 0,
    classified: 0,
    filtered: 0,
    deduped: 0,
    absorbed: 0,
    errors: [],
    entries: [],
  };

  const maxEntries = input.maxEntries ?? Infinity;
  let totalEntriesAttempted = 0;
  let capHit = false;

  for (const project of projects) {
    if (capHit) break;

    const pendingDir = pendingDigestDir(project.path);

    let dropFiles: Array<{ filePath: string; mtime: number }>;
    try {
      const dirEntries = await fs.readdir(pendingDir, { withFileTypes: true });
      const mdFiles = dirEntries
        .filter((e) => e.isFile() && e.name.endsWith(".md"))
        .map((e) => path.join(pendingDir, e.name));

      dropFiles = await Promise.all(
        mdFiles.map(async (f) => {
          const stat = await fs.stat(f);
          return { filePath: f, mtime: stat.mtimeMs };
        })
      );
      dropFiles.sort((a, b) => a.mtime - b.mtime);
    } catch {
      continue;
    }

    for (const { filePath: dropPath } of dropFiles) {
      if (capHit) break;

      const dropBasename = path.basename(dropPath);

      let raw: string;
      try {
        raw = await fs.readFile(dropPath, "utf8");
      } catch {
        result.errors.push(`failed to read drop: ${dropBasename}`);
        continue;
      }

      const parsed = parseDropFrontmatter(raw);
      if (parsed === null) {
        result.errors.push(`malformed drop (no valid frontmatter): ${dropBasename}`);
        continue;
      }

      const { fm, body } = parsed;

      if (fm.digested != null) {
        continue;
      }

      const privacyViolation = PRIVACY_PATTERNS.find((p) => p.test(body));
      if (privacyViolation) {
        result.errors.push(
          `PRIVACY_REJECTED ${dropBasename} pattern=${privacyViolation.source}`
        );
        continue;
      }

      result.processed++;

      const drop: DigestDrop = { ...fm, body, sourcePath: dropPath };
      const entries = splitDropIntoEntries(drop);
      result.classified += entries.length;

      for (const entry of entries) {
        if (totalEntriesAttempted >= maxEntries) {
          capHit = true;
          break;
        }
        totalEntriesAttempted++;

        if (!isCrossProject(entry.content, knownProjectNames)) {
          result.filtered++;
          result.entries.push({
            drop: dropBasename,
            project: project.name,
            category: entry.category,
            action: "filtered",
          });
          continue;
        }

        const routed = routeEntry(entry, hubRoot);

        const existingContent = await readFileOrNull(routed.path);
        const existingSections = existingContent ? extractExistingSections(existingContent) : [];
        const { duplicate } = dedupeAgainstExisting(entry.content, existingSections);

        if (duplicate) {
          result.deduped++;
          result.entries.push({
            drop: dropBasename,
            project: project.name,
            category: entry.category,
            action: "deduped",
            target: routed.path,
          });
          continue;
        }

        if (!input.dryRun) {
          const appendBlock =
            `## ${entry.sourceFeature} — ${fm.created.slice(0, 10)}\n\n` +
            `(digested from ${entry.sourceProject}:${entry.sourceFeature} at ${new Date().toISOString()})\n\n` +
            `- ${entry.content}\n\n`;

          await fs.mkdir(path.dirname(routed.path), { recursive: true });

          const existing = await readFileOrNull(routed.path);
          if (existing === null) {
            await fs.writeFile(routed.path, appendBlock, "utf8");
          } else {
            const separator = existing.endsWith("\n") ? "" : "\n";
            await fs.appendFile(routed.path, separator + appendBlock, "utf8");
          }
        }

        result.absorbed++;
        result.entries.push({
          drop: dropBasename,
          project: project.name,
          category: entry.category,
          action: "absorbed",
          target: routed.path,
        });
      }

      if (!input.dryRun) {
        const { data, body: rawBody } = parseFrontmatter(raw);
        data.digested = new Date().toISOString();
        const recomposed = buildFrontmatter(data, rawBody);
        await fs.writeFile(dropPath, recomposed, "utf8");

        const processedDir = processedDigestDir(project.path);
        await fs.mkdir(processedDir, { recursive: true });
        const destPath = path.join(processedDir, dropBasename);
        try {
          await fs.rename(dropPath, destPath);
        } catch {
          await fs.copyFile(dropPath, destPath);
          await fs.unlink(dropPath);
        }
      }
    }
  }

  return result;
}
