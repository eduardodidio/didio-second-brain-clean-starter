# CLAUDE.md

Project: **my-second-brain**
Stack: **TypeScript + Bun (MCP server) | Markdown + YAML (knowledge base)**
Framework: [claude-didio-config](https://github.com/eduardodidio/claude-didio-config)

## Mission

Central hub that feeds all Claude projects in your ecosystem via a **dedicated MCP server**. Covers:

- **Cross-project memory** — consolidated learnings from all sessions
- **Domain knowledge** — indexed by area (add yours under `knowledge/`)
- **Reusable patterns** — agents, skills, hooks, snippets
- **Cross-project orchestration** — integration contracts
- **Observability** — Discord notifications (progress, blockages, automations)

## Architecture

- `mcp-server/` — MCP server (TypeScript/Bun) exposing tools `memory.*`, `knowledge.*`, `projects.*`, `patterns.*`, `adr.*`, `discord.notify`
- `memory/` — agent-learnings + ADRs + incidents (markdown + YAML frontmatter)
- `knowledge/` — domain knowledge indexed by area
- `patterns/` — reusable agents, skills, hooks, snippets
- `projects/registry.yaml` — index of your Claude projects
- `integrations/discord/` — webhooks + notification templates
- `sync/` — scripts to install MCP in downstream projects

## Commands

- **Install framework:** `didio sync-project .`
- **Plan a feature:** `/plan-feature FXX "description"`
- **Execute a feature:** `/create-feature FXX "description"` or `/didio`
- **Dashboard:** `didio dashboard` (port 7777)
- **Run MCP server:** `cd mcp-server && bun run dev`
- **Vault heartbeat:** `bash _bootstrap/scripts/daily-heartbeat.sh`
- **Lint vault:** `/lint` → runs `_bootstrap/scripts/lint-vault.sh`

## Agent Workflow

This project uses the **4-agent Waves workflow** from claude-didio-config:

1. **Architect** — plans minimal tasks grouped in parallel Waves.
   Wave 0 front-loads permissions/setup.
2. **Developer** — implements each task in a clean bash context.
3. **Tech Lead** — reviews architecture, tests, diagrams.
4. **QA** — validates end-to-end and fills test gaps.

All agents run via `didio spawn-agent <role>` in isolated bash processes.
Logs: `logs/agents/*.jsonl`. Dashboard: `didio dashboard`.

### Trigger a feature

```
/create-feature F01 <short description of the feature>
```

See `agents/orchestrator.md` for the full pipeline and
`agents/workflows/feature-workflow.md` for the quality gates.

## Project Layout

```
.
├── CLAUDE.md                    (this file)
├── docs/
│   ├── adr/                     Architecture Decision Records
│   ├── prd/                     Product Requirements Documents
│   ├── diagrams/                Mermaid flowcharts (live docs)
│   └── README.md                Docs index
├── tasks/
│   └── features/                Per-feature task manifests + task files
├── agents/
│   ├── orchestrator.md
│   ├── workflows/feature-workflow.md
│   └── prompts/                 Role prompts (architect, developer, techlead, qa)
├── logs/agents/                 Agent run logs (gitignored)
└── .claude/
    ├── settings.json            Claude Code settings
    ├── commands/                Slash commands (/create-feature, /dashboard, ...)
    └── agents/                  Subagent definitions
```

## Documentation Maintenance Rules

- **ADRs**: every significant architecture decision creates a new ADR under
  `docs/adr/`. Number them sequentially (`0001-*.md`, `0002-*.md`).
- **PRDs**: every feature has a PRD under `docs/prd/` before Architect runs.
- **Diagrams**: every feature MUST produce (or update) at least two Mermaid
  diagrams under `docs/diagrams/`:
  1. **Architecture** (`<FXX>-architecture.mmd`) — component / data-flow
  2. **User Journey** (`<FXX>-journey.mmd`) — BPMN-style user flow
  Diagrams are living documentation — keep them in sync with code.
- **README.md auto-update**: every feature that ships MUST update the
  project `README.md` with a short note of what was delivered (new
  endpoints, new views, new commands, changed behavior). This is not
  optional — if the feature doesn't change the README, either the README
  is stale or the feature shouldn't have shipped.

## Agent Learnings (Retrospective)

At the end of every feature, QA runs a retrospective ceremony and appends
lessons per role to `memory/agent-learnings/<role>.md`. Each agent reads
its own learnings file at the start of every run — the agents improve
with every feature that ships. Do NOT edit these files manually unless
you are clearly adding a durable lesson.

## Security Guardrails

Rules that Claude Code MUST follow in this project. No exceptions without
explicit user confirmation.

**Git**
- NEVER run `git rebase` on shared branches (`main`, `master`, `develop`)
- NEVER run `git push --force` or `--force-with-lease` without asking
- NEVER run `git reset --hard` over uncommitted work
- NEVER use `--no-verify` to skip hooks (pre-commit, pre-push)
- NEVER use `git add -A` or `git add .` — stage file by file
- NEVER commit files with secrets (`.env`, `credentials.*`, private keys,
  tokens, `*.pem`, `*.key`)
- NEVER amend commits already pushed to a shared branch

**Code**
- NEVER disable validation, auth or tests "just to make it work"
- NEVER hardcode secrets — always use environment variables
- Validate input at system boundaries (user input, external APIs)
- Do not introduce new dependencies without confirmation

**Infra / destructive operations**
- NEVER modify CI/CD without explicit confirmation
- NEVER run `rm -rf`, `DROP TABLE`, `kill -9` without confirming
- Changes to shared state (Slack, PRs, GitHub Issues, infrastructure)
  require explicit confirmation before each action

**When in doubt: stop and ask the user.** The cost of a pause is low;
the cost of an unauthorized destructive action is high.

## Second Brain — specifics

- **This repo is consumed by other projects** via MCP: changes to tool contracts affect everyone. Version the MCP and add an ADR for breaking changes.
- **Discord secrets**: webhooks live in `.env` (never committed). See `.env.example`.
- **Source of truth**: each downstream project's CLAUDE.md is canonical for its specifics; this hub is canonical for shared knowledge.

