# mcp-server/

Servidor MCP (Model Context Protocol) do hub `didio-second-brain-claude`,
implementado em **TypeScript + Bun**.

## Setup

```bash
cd mcp-server
bun install
bun run dev
```

## Tools expostas

| Namespace | Ferramentas |
|-----------|-------------|
| `memory.*` | `memory.search`, `memory.add` — leitura/escrita de memórias cross-project |
| `projects.*` | `projects.list` — acesso ao registry de projetos downstream |
| `discord.notify` | envio de notificações via webhook Discord |

## Discord notifications

A tool `discord.notify` envia mensagens a canais Discord via webhook.

### Variáveis de ambiente

Copie `.env.example` para `.env` na raiz do repo e preencha:

| Variável | Descrição |
|---|---|
| `DISCORD_WEBHOOK_PROGRESS` | URL do webhook do canal `#claude-progress` |
| `DISCORD_WEBHOOK_ALERTS` | URL do webhook do canal `#claude-alerts` |
| `DISCORD_WEBHOOK_DONE` | URL do webhook do canal `#claude-done` |
| `DISCORD_ENABLED` | `true` para ativar envio; `false` (ou ausente) desativa silenciosamente |

### Criar servidor Discord e webhooks

1. Crie um servidor Discord gratuito em discord.com.
2. Crie 3 canais de texto: `#claude-progress`, `#claude-alerts`, `#claude-done`.
3. Em cada canal: **Edit Channel → Integrations → Webhooks → New Webhook → Copy URL**.
4. Cole os 3 URLs nas variáveis correspondentes no arquivo `.env` (baseado em `.env.example`).

### Invocar a tool

```json
discord.notify({
  "event": "wave-2 done",
  "level": "done",
  "project": "claude-didio-config",
  "details": "3/3 tasks ✓"
})
```

Campos `level` válidos: `"progress"`, `"warn"`, `"error"`, `"done"`.

### Verificar funcionamento

```bash
# Na raiz do repo:
DISCORD_ENABLED=true bun run dev
```

Depois, invoque `discord.notify` via qualquer cliente MCP (ex.: Claude Code)
com o payload acima. Uma mensagem deve aparecer no canal Discord correspondente.

## Knowledge / Patterns / ADRs

Tools adicionadas em F04 para expor o hub de conhecimento e padrões.
Enums são fechadas — ver [ADR-0007](../docs/adr/0007-patterns-knowledge-adr-tools.md).

| Tool | Inputs | Outputs |
|------|--------|---------|
| `knowledge.list` | — | `[{domain, count}]` |
| `knowledge.get` | `{domain}` | `[{file, title, frontmatter, content}]` |
| `patterns.search` | `{query?, type?, tags?}` | `[PatternHit]` |
| `patterns.get` | `{name, type?}` | `PatternFull` |
| `adr.list` | `{project?, status?}` | `[Adr]` |
| `adr.get` | `{id}` | `AdrFull` |

## Install in another project

Para conectar um projeto downstream a este servidor MCP:

```bash
bash sync/install-mcp-in-project.sh /Users/eduardodidio/<project>
```

O script mergeia `mcpServers.second-brain` no `.claude/settings.json`
do target (sem apagar config preexistente), atualiza
`projects/registry.yaml` e suporta `--dry-run`. Detalhes:
[`../sync/README.md`](../sync/README.md).

## Referências

- Arquitetura geral: [`../CLAUDE.md`](../CLAUDE.md) seção "Architecture"
- ADR-0003 (TypeScript + Bun): [`../docs/adr/0003-mcp-typescript-bun.md`](../docs/adr/0003-mcp-typescript-bun.md)
- ADR-0004 (Discord observability): [`../docs/adr/0004-discord-observability.md`](../docs/adr/0004-discord-observability.md)
- PRD F03: [`../docs/prd/F03-discord-notifications.md`](../docs/prd/F03-discord-notifications.md)
- Implementação Discord: [`src/discord/`](src/discord/)
- Tool handler: [`src/tools/discord-notify.ts`](src/tools/discord-notify.ts)
- Diagramas: [`../docs/diagrams/F03-architecture.mmd`](../docs/diagrams/F03-architecture.mmd), [`../docs/diagrams/F03-journey.mmd`](../docs/diagrams/F03-journey.mmd)
