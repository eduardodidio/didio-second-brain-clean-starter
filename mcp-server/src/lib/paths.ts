import path from "node:path";
import type { MemoryCategory } from "../types.ts";

const ENV_VAR = "SECOND_BRAIN_ROOT";

/**
 * Resolve o root do second brain.
 * Prioridade:
 *  1. process.env.SECOND_BRAIN_ROOT (normalizado, absoluto)
 *  2. 3 níveis acima deste arquivo (src/lib/paths.ts → repo root)
 */
export function getSecondBrainRoot(): string {
  const envVal = process.env[ENV_VAR];
  if (envVal && envVal.trim().length > 0) {
    return path.resolve(envVal);
  }
  return path.resolve(import.meta.dir, "..", "..", "..");
}

export function memoryDir(root: string = getSecondBrainRoot()): string {
  return path.join(root, "memory");
}

export function memorySubdir(
  category: MemoryCategory,
  root: string = getSecondBrainRoot()
): string {
  return path.join(memoryDir(root), category);
}

export function agentLearningsDir(root: string = getSecondBrainRoot()): string {
  return memorySubdir("agent-learnings", root);
}

export function registryFile(root: string = getSecondBrainRoot()): string {
  return path.join(root, "projects", "registry.yaml");
}

export function knowledgeDir(root: string = getSecondBrainRoot()): string {
  return path.join(root, "knowledge");
}

export function patternsDir(root: string = getSecondBrainRoot()): string {
  return path.join(root, "patterns");
}

export function adrDir(root: string = getSecondBrainRoot()): string {
  return path.join(root, "docs", "adr");
}

export function pendingDigestDir(projectPath: string): string {
  return path.join(projectPath, "memory", "_pending-digest");
}

export function processedDigestDir(projectPath: string): string {
  return path.join(pendingDigestDir(projectPath), "_processed");
}

export function agentLearningsFile(role: string, hubRoot: string = getSecondBrainRoot()): string {
  return path.join(hubRoot, "memory", "agent-learnings", `${role}.md`);
}
