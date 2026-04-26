import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface SandboxOpts {
  projects?: Array<{ name: string; path?: string }>;
  drops?: Record<string, Record<string, string>>;  // projectName → { filename → content }
  existingLearnings?: Record<string, string>;       // role → content of memory/agent-learnings/<role>.md
}

export async function createSandbox(opts: SandboxOpts = {}): Promise<string> {
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "digest-sb-"));

  const projects = opts.projects ?? [{ name: "test-proj" }];

  // Write registry
  const regProjects = projects.map((p) => {
    const projPath = p.path ?? path.join(sandbox, p.name);
    return [
      `  - name: ${p.name}`,
      `    path: ${projPath}`,
      `    tech_stack: [typescript]`,
      `    purpose: test`,
      `    claude_framework: true`,
      `    mcp_integrated: true`,
    ].join("\n");
  });
  const registryYaml = `version: 1\nprojects:\n${regProjects.join("\n")}\n`;
  await fs.mkdir(path.join(sandbox, "projects"), { recursive: true });
  await fs.writeFile(path.join(sandbox, "projects", "registry.yaml"), registryYaml, "utf8");

  // Write drops for each project
  for (const [projectName, dropMap] of Object.entries(opts.drops ?? {})) {
    const projPath = projects.find((p) => p.name === projectName)?.path ?? path.join(sandbox, projectName);
    const pendingDir = path.join(projPath, "memory", "_pending-digest");
    await fs.mkdir(pendingDir, { recursive: true });
    for (const [filename, content] of Object.entries(dropMap)) {
      await fs.writeFile(path.join(pendingDir, filename), content, "utf8");
    }
  }

  // Write pre-existing learnings files
  const learningsDir = path.join(sandbox, "memory", "agent-learnings");
  await fs.mkdir(learningsDir, { recursive: true });
  for (const [role, content] of Object.entries(opts.existingLearnings ?? {})) {
    await fs.writeFile(path.join(learningsDir, `${role}.md`), content, "utf8");
  }

  return sandbox;
}

export async function teardownSandbox(sandbox: string): Promise<void> {
  await fs.rm(sandbox, { recursive: true, force: true });
}

export function makeDrop(feature: string, project: string, body: string, created = "2026-04-26T10:00:00Z"): string {
  return `---\nfeature: ${feature}\nproject: ${project}\ncreated: ${created}\nsource_commits: []\n---\n${body}`;
}
