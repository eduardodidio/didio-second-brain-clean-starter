# didio-second-brain-claude

Hub central que alimenta todos os projetos Claude do ecossistema didio via MCP server.

## Inspirações & créditos

Este projeto absorveu várias ideias e patterns do excelente
[`second-brain-starter`](https://github.com/marciohideaki/second-brain-starter)
do **Marcio Hideaki** (MIT). O starter foi a referência conceitual para a noção
de "second brain como infraestrutura" — sessões com continuidade, vault que se
auto-melhora, e skills como cidadãos de primeira classe. Obrigado, Hideaki — o
ecossistema didio te deve várias.

Features/skills inspiradas direta ou indiretamente no starter:

| Skill / componente daqui                  | Origem no starter            |
| ----------------------------------------- | ---------------------------- |
| `/braindump` (F13)                        | `/braindump`                 |
| `/weekly-review` (F13)                    | `/weekly-review`             |
| `/lint` + heartbeat diário (F09)          | `/lint` + daily heartbeat    |
| `/skill-improve` (F12)                    | `/skill-improve`             |
| Wiki compiler (F10)                       | `/wiki-build` + `_wiki/`     |
| Session continuity v2 (F11)               | `/session-handoff` + hooks   |
| Estrutura `memory/sessions/`, `_learnings`| `_sessions/` + `_learnings/` |
| Hooks de session-end / pré-compactação    | 4 event hooks do starter     |

A divergência arquitetural principal: o starter é single-project; o
`didio-second-brain-claude` é hub com **MCP server dedicado** alimentando
6 projetos Claude downstream em malha.

## Escopo

- **Memória cross-project** — aprendizados consolidados de todas as sessões Claude
- **Conhecimento de domínio** — accessibility, crypto, game engines
- **Padrões reutilizáveis** — agentes, skills, hooks, snippets
- **Orquestração cross-project** — contratos e integrações
- **Observabilidade** — notificações Discord (progresso, travamentos, automações)

## Arquitetura

Orquestrado pelo framework [`claude-didio-config`](https://github.com/eduardodidio/claude-didio-config). Trabalho quebrado em features (F01–F05) executadas via `/didio` ou `/create-feature FXX`.

Consulte o plano em `/Users/eduardodidio/.claude/plans/quero-criar-um-conceito-delightful-lake.md`.

## Estrutura

- `memory/` — aprendizados dos agentes (architect, developer, techlead, qa) acumulados entre features
- `knowledge/` — conhecimento de domínio (accessibility, crypto-trading, game-engine, react-patterns)
- `patterns/` — agents, skills, hooks, snippets reutilizáveis
- `projects/` — `registry.yaml` canônico dos 6 projetos consumidores
- `mcp-server/` — servidor MCP (conteúdo em F02)
- `integrations/discord/` — webhooks + templates de notificação (entregue em F03)
- `sync/` — scripts de rollout cross-project (conteúdo em F05)
- `docs/` — ADRs, PRDs, diagramas Mermaid
- `tasks/features/` — manifestos e tarefas por feature

## Features entregues

- **F01 — Skeleton e migração do second brain** (2026-04): estrutura de diretórios versionada, `projects/registry.yaml` com os 6 projetos, migração não-destrutiva dos agent-learnings, ADR [`0002-second-brain-hub-mcp`](docs/adr/0002-second-brain-hub-mcp.md), diagramas `F01-architecture.mmd` e `F01-journey.mmd`. Manifesto: [`tasks/features/F01-skeleton-second-brain/`](tasks/features/F01-skeleton-second-brain/F01-README.md).

## F02 — MCP server MVP (2026-04-17)

Servidor MCP executável em `mcp-server/` (TypeScript + Bun)
expondo 3 tools: `memory.search`, `memory.add`, `projects.list`.
Piloto ativo em `claude-didio-config`. Ver [ADR-0003](docs/adr/0003-mcp-typescript-bun.md) e
`docs/diagrams/F02-*.mmd`.

Comando: `cd mcp-server && bun run dev`.

## F03 — Discord notifications (2026-04-17)

Observabilidade em tempo real via Discord — tool MCP `discord.notify` roteando
eventos (`progress`, `alert`, `done`) para 3 canais dedicados. 3 hooks
padronizados prontos para instalar em `patterns/hooks/`. Setup via `.env.example`.
Ver [ADR-0004](docs/adr/0004-discord-observability.md) e `docs/diagrams/F03-*.mmd`.

## F04 — MCP expandido: knowledge / patterns / ADRs (2026-04-19)

- F04 — MCP expandido com knowledge/patterns/adr (6 tools novas: `knowledge.list`, `knowledge.get`, `patterns.search`, `patterns.get`, `adr.list`, `adr.get`). Ver [ADR-0007](docs/adr/0007-knowledge-patterns-format.md) e `docs/diagrams/F04-*.mmd`.

## F05 — Sync MCP + Discord hooks (slim) (2026-04-18)

Dois scripts bash idempotentes em `sync/`:
`install-mcp-in-project.sh` mergeia `mcpServers.second-brain` no
settings de um projeto downstream; `install-discord-hooks.sh`
instala os 3 hooks Discord (`--user-scope` recomendado). Piloto:
`claude-didio-config` e `~/.claude/settings.json`. Ver
[ADR-0005](docs/adr/0005-sync-strategy.md) e
`docs/diagrams/F05-*.mmd`.

Comando: `bash sync/install-mcp-in-project.sh <project-path>`.

## F05.b — Rollout cross-project + filtro CLAUDE_PROJECT_DIR (2026-04-18)

Filtro em `patterns/hooks/_lib/registry-match.sh` faz os 3 hooks
Discord dispararem **apenas** em projetos listados em
`projects/registry.yaml` (escape hatch: `DIDIO_HOOKS_DISABLE_FILTER=1`).
MCP `second-brain` agora instalado nos 5 projetos didio restantes
— malha cross-project completa (6/6). Ver
[ADR-0006](docs/adr/0006-cross-project-rollout.md) e
`docs/diagrams/F05b-*.mmd`.

## F06 — Rollout hooks Discord cross-project (2026-04-20)

**Status:** done (2026-04-20)

Propagou o bloco `hooks` (Stop / SubagentStop / PostToolUse) dos 3 hooks
Discord do hub aos 5 projetos downstream (`blind-warrior`,
`access-play-create`, `escudo-do-mestre-v1`, `mellon-bot`,
`mellon-magic-maker`) via edit direto em `<projeto>/.claude/settings.json`.
Espelhou o mesmo bloco em
`~/claude-didio-config/templates/.claude/settings.json` para sincronizações
futuras. Estendeu `bin/didio-sync-project.sh` para mesclar `hooks` com
**dedupe por `command`** (idempotência + preservação de hooks custom) —
documentado em ADR correspondente.

- **Hub**: `patterns/hooks/_lib/load-env.sh` + 3 `hook.sh` (inalterados —
  fix do helper entrou antes de F06).
- **Framework**: `templates/.claude/settings.json` (template) +
  `bin/didio-sync-project.sh` (merge routine).
- **Downstream**: bloco `hooks` presente em 5/5 `.claude/settings.json`.
- **Validação**: smoke real em `blind-warrior` via
  `CLAUDE_PROJECT_DIR=... bash <hook>` — POST confirmado em canal Discord
  PROGRESS.
- **Diagramas**: `docs/diagrams/F06-architecture.mmd`,
  `docs/diagrams/F06-journey.mmd`.
- **Smoke report**:
  `tasks/features/F06-hooks-rollout-downstream/smoke-20260420.md`.

> Nota: integração second-brain MCP em `claude-didio-config` (substituição
> de leitura local por `mcp__second-brain__memory_search`, fallback offline,
> dual-write retros) também catalogada sob F06 mas **vive em
> `claude-didio-config`**, não neste repo. Ver
> `/Users/eduardodidio/claude-didio-config/docs/adr/F06-memory-location.md`.

## F08 — Subagent Stop role extraction fix (2026-04-21)

- **F08 (2026-04-21):** fix — hook `subagent-stop-progress` agora extrai o role real via `transcript_path` + último `subagent_type` no `.jsonl` (antes: sempre `Role: unknown` porque o payload de `SubagentStop` não contém `role`).

## F09 — Vault health + heartbeat (2026-04-24)

- **F09 (2026-04-24):** heartbeat diário não-LLM (`_bootstrap/scripts/daily-heartbeat.sh`) que pontua a saúde do vault 0–10 e alerta no Discord quando o score cai abaixo de 7; skill `/lint` (`_bootstrap/scripts/lint-vault.sh`) que audita defeitos estruturais (frontmatter, WikiLinks quebrados, notas stale, orphans) sob demanda. Ver [ADR-0008](docs/adr/0008-vault-health-heartbeat.md) e `docs/diagrams/F09-*.mmd`.

## F14 — Discord rich context (2026-04-25)

- **F14 (2026-04-25):** notificações Discord agora carregam `Phase`, `Feature` e `Task` (com wave + status) — o helper `_lib/feature-context.sh` detecta a feature ativa via `$DIDIO_FEATURE` ou mtime de `tasks/features/`. Implementação puramente local aos hooks, zero-dependency (`bash` + `sed` + `grep` + `awk`). Ver `docs/diagrams/F14-*.mmd`.

## F15 — Token usage report + economy (2026-04-26)

- **Token report diário (F15)**: relatório markdown em
  `memory/token-reports/YYYY-MM-DD.md` consolidando uso de tokens
  nas últimas 24h por projeto/modelo + economia estimada gerada
  pelo second-brain. Disparo automático via launchd 02:30 (ver
  `_bootstrap/scripts/README.md`); ping diário em `#claude-progress`.
  Ver [ADR-0009](docs/adr/0009-token-economy-estimation.md) e `docs/diagrams/F15-*.mmd`.

## F16 — Learning loop: downstream projects ↔ second-brain (2026-04-26)

- **Loop de aprendizado (F16):** hook `feature-end-digest` dropa aprendizados
  em `memory/_pending-digest/` quando uma feature fecha; MCP tool
  `memory.digest_pending` (+ cron diário `_bootstrap/scripts/digest-pending.sh`)
  absorve entradas cross-project em `memory/agent-learnings/<role>.md` e stubs
  em `patterns/`. Sync para os 6 projetos via
  `bash sync/install-feature-end-digest-hook.sh`. Ver
  [ADR-0010](docs/adr/0010-learning-loop-digest.md) e `docs/diagrams/F16-*.mmd`.

## F17 — Discord rich messages v2 (2026-04-26)

- **F17 Discord rich v2:** the `subagent finished` embed now carries
  an `Activity` field (≤200 chars summary of completed tasks +
  files touched, privacy-safe). Two new Stop-event hooks alert
  on idle projects (`no-pending-work-alert`, 1×/day) and on
  rate-limit interruptions with ETA (`rate-limit-alert`).
