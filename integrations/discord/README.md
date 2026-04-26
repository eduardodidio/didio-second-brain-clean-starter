# integrations/discord/

Ponto de documentação central para a integração de notificações Discord do hub
`didio-second-brain-claude`. A implementação reside no MCP server — este
diretório serve como índice de referências e ponto de entrada para quem procura
"Discord" na estrutura do repositório.

## Estrutura atual

```
integrations/discord/
└── templates/     # templates por tipo de evento (ex.: build_failed, deploy_started)
                   # TODO (F04/F05): popular com templates Markdown/JSON por evento
                   # quando o volume de tipos de notificação justificar
```

> **Nota:** a lógica de envio e os tipos TypeScript ficam em
> `mcp-server/src/discord/`, não aqui. Esse foi o design escolhido em F03
> para manter tudo dentro do bundle do servidor MCP (ver ADR-0004).

## Como funciona

Três canais Discord recebem eventos em tempo real:

| Canal | Variável de ambiente | Quando |
|---|---|---|
| `#claude-progress` | `DISCORD_WEBHOOK_PROGRESS` | Wave termina, agente conclui |
| `#claude-alerts` | `DISCORD_WEBHOOK_ALERTS` | Agente emite `DIDIO_BLOCKED` |
| `#claude-done` | `DISCORD_WEBHOOK_DONE` | Feature entregue, automação executada |

`#claude-progress` também recebe o **relatório diário de tokens (F15)** às 02:30 — embed com totais 24h e economia estimada linkando `memory/token-reports/YYYY-MM-DD.md`.

Setup completo: ver `mcp-server/README.md` → seção "Discord notifications".

## Referências cruzadas

- [`../../mcp-server/src/discord/`](../../mcp-server/src/discord/) — implementação da tool (tipos, cliente webhook, templates)
- [`../../mcp-server/src/tools/discord-notify.ts`](../../mcp-server/src/tools/discord-notify.ts) — handler MCP da tool `discord.notify`
- [`../../patterns/hooks/`](../../patterns/hooks/) — 3 hooks prontos para instalar (`post-tool-use-error/`, `stop-session-summary/`, `subagent-stop-progress/`)
- [`../../docs/prd/F03-discord-notifications.md`](../../docs/prd/F03-discord-notifications.md) — PRD completo da feature F03
- [`../../docs/adr/0004-discord-observability.md`](../../docs/adr/0004-discord-observability.md) — decisão de arquitetura (ADR-0004)
- [`../../docs/diagrams/F03-architecture.mmd`](../../docs/diagrams/F03-architecture.mmd) — diagrama de componentes
- [`../../docs/diagrams/F03-journey.mmd`](../../docs/diagrams/F03-journey.mmd) — diagrama de jornada
- [`../../.env.example`](../../.env.example) — template das variáveis de ambiente Discord

## Layout enriquecido (F14)

Cada embed Discord agora carrega contexto operacional quando a
sessão está dentro de uma feature do hub:

| Field      | Origem                                      | Quando aparece |
|---|---|---|
| `Phase`    | role do subagent → mapping role→phase       | quando role ≠ vazio/`unknown` |
| `Feature`  | `$DIDIO_FEATURE` ou mtime de `tasks/features/` | quando há feature ativa |
| `Task`     | task file mais recente em `tasks/features/$FEATURE/` (formato `FXX-TYY (wave N · status)`) | quando há task ativa |
| `project`  | `CLAUDE_PROJECT_NAME`/`CLAUDE_PROJECT_DIR` | sempre |

### Mapping role → phase

| Role               | Phase           |
|---|---|
| `architect`        | `🧭 Planning`   |
| `developer`        | `🔨 Building`   |
| `techlead`         | `🔍 Review`     |
| `qa`               | `✅ Validation` |
| `Explore`, `general-purpose`, outros | `🔎 Research` |
| `unknown` ou vazio | (campo omitido) |

Quando a sessão é ad-hoc (sem `tasks/features/`), `Feature` e
`Task` são **omitidos** do JSON (não enviados como string vazia).
Implementação local aos hooks — zero dependência (`bash` + `sed`
+ `grep` + `awk`).

### F17 — embed fields v2

- **`Activity`** (subagent-stop-progress, optional): up to ~200 chars
  summary of "T03,T04 done · edited (hook.sh, _lib/foo.sh, README.md)".
  Privacy-safe — derived only from task IDs and `tool_use.input.file_path`,
  never from prompt content.

### F17 — alert categories

- **`no-pending-work-alert`** (Stop event, level: warn): posts to
  `DISCORD_WEBHOOK_ALERTS` once per project per day when there is no
  feature with `Status: planned` or `in_progress`. Idempotência via
  `${CLAUDE_PROJECT_DIR}/.claude/last-no-pending-work-alert.txt`.

- **`rate-limit-alert`** (Stop event, level: error): posts to
  `DISCORD_WEBHOOK_ALERTS` when the transcript contains a rate-limit
  marker (`429`, `rate_limit_error`, `usage limit`). Includes `ETA`
  field with resumption time in `America/Sao_Paulo` (from header
  `anthropic-ratelimit-reset` if present, else `now + 5h` heuristic).

## F16 — Digest de aprendizado (silent)

Os drops criados pelo hook `feature-end-digest` **não geram notificação Discord**.
O digest é silencioso por design (ADR-0010): o volume de drops pode ser alto e
o conteúdo é técnico/interno. O Discord já cobre a fase visível via
`subagent-stop-progress` (embed com `Activity`). O feedback de que um digest foi
absorvido é visível apenas em `memory/agent-learnings/<role>.md`.

## Segredos

Webhooks **nunca** são commitados. Configure via `.env` baseado em `.env.example`.
